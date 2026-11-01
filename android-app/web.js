// RobinTHood Web Search & Page Extraction Client
// Connects to the hardened Cloudflare edge worker with automatic circuit-breaker.
// Search falls back to DuckDuckGo Lite and Wikipedia; page reading has no phone-side fallback.
import { fetch } from 'expo/fetch';
import * as Crypto from 'expo-crypto';
import Constants from 'expo-constants';
import { isUnsafeUrl } from './urlsafety';

const UA = 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';
const SEARCH_SERVICE_URL = 'https://robinthood-search.phone-liaison.workers.dev';
// Injected at build time from the ROBIN_CLIENT_SECRET env var (app.config.js), never
// committed. It still ships inside the APK, so it is a speed bump, not real attestation.
const CLIENT_SECRET = Constants.expoConfig?.extra?.robinSecret || '';

// Edge worker circuit breaker (trips on timeout or 5xx to protect mobile UX)
let workerFailedUntil = 0;
function isWorkerAvailable() {
  return Boolean(CLIENT_SECRET) && Date.now() > workerFailedUntil;
}
function tripWorkerCircuit(durationMs = 60000) {
  workerFailedUntil = Date.now() + durationMs;
}

const utf8 = (s) => new TextEncoder().encode(s);
const hex = (buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
const sha256 = async (bytes) => new Uint8Array(await Crypto.digest(Crypto.CryptoDigestAlgorithm.SHA256, bytes));

// HMAC-SHA256 (RFC 2104) on top of expo-crypto's digest, which has no HMAC of its own.
async function hmacSha256Hex(key, message) {
  let k = utf8(key);
  if (k.length > 64) k = await sha256(k);
  const pad = (byte) => {
    const out = new Uint8Array(64);
    for (let i = 0; i < 64; i++) out[i] = (k[i] || 0) ^ byte;
    return out;
  };
  const msg = utf8(message);
  const inner = new Uint8Array(64 + msg.length);
  inner.set(pad(0x36)); inner.set(msg, 64);
  const innerHash = await sha256(inner);
  const outer = new Uint8Array(64 + innerHash.length);
  outer.set(pad(0x5c)); outer.set(innerHash, 64);
  return hex(await sha256(outer));
}

// Timestamped HMAC signature plus a one-time nonce for the edge worker
async function makeAuthHeaders(payloadString) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const nonce = Crypto.randomUUID();
  const sig = await hmacSha256Hex(CLIENT_SECRET, `${ts}:${nonce}:${payloadString}`);
  return {
    'Content-Type': 'application/json',
    'X-Robin-Timestamp': ts,
    'X-Robin-Nonce': nonce,
    'X-Robin-Signature': sig,
  };
}

// Unicode-safe entity decoder
function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

// URL sanitizer to prevent non-http schemes (intent:, javascript:, file:)
export function sanitizeWebUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const parsed = new URL(raw);
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return parsed.href;
    }
  } catch {}
  return null;
}

async function withTimeout(promiseFn, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await promiseFn(ctrl.signal); } finally { clearTimeout(t); }
}

function realUrl(href) {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch {} }
  if (href.startsWith('//')) return 'https:' + href;
  return href;
}

const DDG_REGIONS = {
  en: 'us-en',
  es: 'es-es',
  fr: 'fr-fr',
  de: 'de-de',
  pt: 'br-pt',
  ja: 'jp-jp',
  zh: 'cn-zh',
  hi: 'in-en',
};

async function searchDuckDuckGo(query, lang = 'en') {
  const kl = DDG_REGIONS[lang] || 'wt-wt';
  const html = await withTimeout(async (signal) => {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      signal,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      body: 'q=' + encodeURIComponent(query) + '&kl=' + kl,
    });
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
    return res.text();
  }, 4000);

  const results = [];
  const blocks = html.split(/class="result results_links/).slice(1);
  for (const b of blocks) {
    if (/result--ad/.test(b.slice(0, 200))) continue;
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const snip = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/);
    const rawUrl = realUrl(decodeEntities(a[1]));
    const cleanUrl = sanitizeWebUrl(rawUrl);
    if (!cleanUrl || cleanUrl.includes('duckduckgo.com/y.js')) continue;
    results.push({ title: stripTags(a[2]), url: cleanUrl, snippet: snip ? stripTags(snip[1]) : '' });
    if (results.length >= 6) break;
  }
  if (!results.length) throw new Error('DuckDuckGo returned no results');
  return results;
}

async function searchDuckDuckGoLite(query, lang = 'en') {
  const kl = DDG_REGIONS[lang] || 'wt-wt';
  const html = await withTimeout(async (signal) => {
    const res = await fetch('https://lite.duckduckgo.com/lite/', {
      method: 'POST',
      signal,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      body: 'q=' + encodeURIComponent(query) + '&kl=' + kl,
    });
    if (!res.ok) throw new Error(`DuckDuckGo Lite HTTP ${res.status}`);
    return res.text();
  }, 4000);

  const results = [];
  const linkMatches = [...html.matchAll(/<a rel="nofollow" href="([^"]+)" class='result-link'>([\s\S]*?)<\/a>/g)];
  const snipMatches = [...html.matchAll(/<td class='result-snippet'>([\s\S]*?)<\/td>/g)];
  for (let i = 0; i < linkMatches.length; i++) {
    const rawUrl = realUrl(decodeEntities(linkMatches[i][1]));
    const cleanUrl = sanitizeWebUrl(rawUrl);
    if (!cleanUrl || cleanUrl.includes('duckduckgo.com/y.js')) continue;
    const title = stripTags(linkMatches[i][2]);
    const snippet = snipMatches[i] ? stripTags(snipMatches[i][1]) : '';
    results.push({ title, url: cleanUrl, snippet });
    if (results.length >= 6) break;
  }
  if (!results.length) throw new Error('DuckDuckGo Lite returned no results');
  return results;
}

async function searchWikipedia(query, lang = 'en') {
  const wikiLang = ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'hi'].includes(lang) ? lang : 'en';
  const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=` + encodeURIComponent(query);
  const json = await withTimeout(async (signal) => {
    const res = await fetch(url, { signal, headers: { 'User-Agent': 'RobinTHood-Android/0.7' } });
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    return res.json();
  }, 4000);
  const hits = json?.query?.search ?? [];
  if (!hits.length) throw new Error('Wikipedia returned no results');
  return hits.map((h) => ({
    title: h.title,
    url: `https://${wikiLang}.wikipedia.org/wiki/` + encodeURIComponent(h.title.replace(/ /g, '_')),
    snippet: stripTags(h.snippet),
  }));
}

// Pull readable text from a page, best effort. Pages are read only through the search
// worker, never fetched from the phone: the phone sits on the user's home network, and a
// page the model chose (perhaps told to by another page) could point it at the router or
// any device there. A refused or failed read returns '' and the model tries another result.
export async function pageText(url, maxChars = 2500) {
  const cleanUrl = sanitizeWebUrl(url);
  if (!cleanUrl || isUnsafeUrl(cleanUrl)) return '';
  if (!isWorkerAvailable()) return '';
  try {
    const payload = JSON.stringify({ url: cleanUrl, maxChars });
    const headers = await makeAuthHeaders(payload);
    const json = await withTimeout(async (signal) => {
      const res = await fetch(`${SEARCH_SERVICE_URL}/v1/read`, {
        method: 'POST',
        headers,
        body: payload,
        signal,
      });
      // A 4xx is the worker refusing this one page (restricted or unreadable URL), not the
      // worker being down, so it must not trip the circuit for every read after it.
      if (res.status >= 400 && res.status < 500) return null;
      if (!res.ok) throw new Error(`Worker read HTTP ${res.status}`);
      return res.json();
    }, 4000);
    return json?.ok && json.text ? json.text.slice(0, maxChars) : '';
  } catch {
    tripWorkerCircuit(60000);
    return '';
  }
}

// Search only (no page reading); the model decides which pages to open.
export async function searchWeb(query, lang = 'en') {
  // 1. Try dedicated edge worker first (authenticated POST, edge-cached, bot-immune)
  if (isWorkerAvailable()) {
    try {
      const payload = JSON.stringify({ query, lang });
      const headers = await makeAuthHeaders(payload);
      const json = await withTimeout(async (signal) => {
        const res = await fetch(`${SEARCH_SERVICE_URL}/v1/search`, {
          method: 'POST',
          headers,
          body: payload,
          signal,
        });
        if (!res.ok) throw new Error(`Worker search HTTP ${res.status}`);
        return res.json();
      }, 4000);
      if (json?.results?.length) {
        const cleanResults = json.results
          .map((r) => ({ title: stripTags(r.title), url: sanitizeWebUrl(r.url), snippet: stripTags(r.snippet || '') }))
          .filter((r) => r.url);
        if (cleanResults.length) {
          return {
            source: json.source || 'Robin Search',
            attribution: json.attribution || null,
            results: cleanResults,
          };
        }
      }
    } catch {
      tripWorkerCircuit(60000);
    }
  }

  // 2. Client-side fallback if worker is unreachable
  try {
    return { source: 'DuckDuckGo', attribution: null, results: await searchDuckDuckGo(query, lang) };
  } catch {
    try {
      return { source: 'DuckDuckGo Lite', attribution: null, results: await searchDuckDuckGoLite(query, lang) };
    } catch {
      try {
        return { source: 'Wikipedia', attribution: null, results: await searchWikipedia(query, lang) };
      } catch {
        return { source: 'None', attribution: null, results: [] };
      }
    }
  }
}

// Build a search query. Handles multilingual CJK scripts and short follow-ups safely.
export function searchQueryFrom(history) {
  const users = history.filter((m) => m.role === 'user').map((m) => m.content.trim());
  const last = users[users.length - 1] || '';
  const prev = users[users.length - 2];
  let q = last;

  const hasCJK = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/.test(last);
  const isShortFollowUp = hasCJK ? last.length <= 6 : last.split(/\s+/).length < 6;

  if (prev && isShortFollowUp) {
    const prevExcerpt = prev.slice(0, 100);
    q = `${prevExcerpt} ${last}`;
  }

  const sanitized = q.replace(/\s+/g, ' ');
  return Array.from(sanitized).slice(0, 200).join('');
}
