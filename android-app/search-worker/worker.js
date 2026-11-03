import { privacyPage } from './privacy.js';

// RobinTHood Global Search & Page Extraction Infrastructure (Hardened Production Worker)
// Cloudflare Worker: HMAC app attestation, rate-limiting, edge-cached search, stripped page reader.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Robin-Timestamp, X-Robin-Nonce, X-Robin-Signature',
};

// The signing key lives only in the ROBIN_CLIENT_SECRET Worker secret. Without it every
// signed endpoint refuses (fail closed); there is deliberately no built-in fallback.
const REPLAY_WINDOW_SEC = 120;
const MAX_READ_CHARS = 20000;
const MAX_REDIRECTS = 5;
// A real request is a short query or one URL; anything bigger is refused before the HMAC.
const MAX_BODY_CHARS = 4096;
const MAX_QUERY_CHARS = 500;
// Bounds on what /v1/read pulls from a page, so one huge or slow URL can't take the
// isolate's memory or time from every other request on it.
const READ_TIMEOUT_MS = 8000;
const MAX_PAGE_BYTES = 1500000;
const READABLE_TYPES = /^(text\/html|application\/xhtml\+xml|text\/plain)\b/i;
// Keep in step with the [[ratelimits]] limits in wrangler.toml. Signed requests are
// limited per install (an id in the signed body) so phones behind one carrier IP don't
// share a budget, and per IP more loosely so made-up install ids can't lift the limit.
const SIGNED_LIMIT_PER_MIN = 30;
const SIGNED_IP_LIMIT_PER_MIN = 300;
const UNSIGNED_FLOOD_LIMIT_PER_MIN = 120;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

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

// Constant-time string comparison to prevent side-channel timing attacks
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// In-memory fixed-window limiter, per isolate. Isolates come and go, so this is only a
// coarse flood guard in front of signature checks; the real per-user limit is
// signedRequestLimited below.
const ipBuckets = new Map();
function isRateLimited(ip, limit = 30, windowSec = 60) {
  if (!ip) return false;
  const now = Math.floor(Date.now() / 1000);
  let bucket = ipBuckets.get(ip);
  if (!bucket || now - bucket.start >= windowSec) {
    bucket = { start: now, count: 1 };
    ipBuckets.set(ip, bucket);
    if (ipBuckets.size > 2000) {
      for (const [k, v] of ipBuckets.entries()) {
        if (now - v.start >= windowSec) ipBuckets.delete(k);
      }
    }
    return false;
  }
  bucket.count++;
  return bucket.count > limit;
}

// Limits on requests that passed the signature check, so forged traffic can't spend a
// real user's budget. Uses the Workers Rate Limiting bindings (shared by all isolates in
// a location, see wrangler.toml) and falls back to the isolate map.
async function overLimit(binding, key, limit) {
  if (binding) {
    try {
      const { success } = await binding.limit({ key });
      return !success;
    } catch (e) {
      console.error('Rate limiter error:', e.message);
    }
  }
  return isRateLimited(key, limit, 60);
}

function installOf(rawBody) {
  try {
    const id = JSON.parse(rawBody)?.install;
    return typeof id === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(id) ? id : '-';
  } catch {
    return '-';
  }
}

async function signedRequestLimited(env, ip, rawBody) {
  if (await overLimit(env.RATE_LIMITER_IP, `ip:${ip}`, SIGNED_IP_LIMIT_PER_MIN)) return true;
  return overLimit(env.RATE_LIMITER, `signed:${ip}:${installOf(rawBody)}`, SIGNED_LIMIT_PER_MIN);
}

// Reads at most MAX_BODY_CHARS bytes, whatever Content-Length claims; null when longer.
// request.text() would buffer the whole upload in the isolate before any size check.
async function readCappedBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_CHARS) { await reader.cancel().catch(() => {}); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

function tooLarge() {
  return new Response(JSON.stringify({ error: 'Request too large' }), {
    status: 413,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function rateLimitResponse() {
  return new Response(JSON.stringify({ error: `Rate limit exceeded (max ${SIGNED_LIMIT_PER_MIN} requests/min). Please try again shortly.` }), {
    status: 429,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '60' },
  });
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Records a nonce and reports whether it was already seen. With the NONCES Durable
// Object every Cloudflare location agrees; without it (or if it errors) the
// location's own cache is used, which leaves cross-location replay possible.
async function nonceAlreadyUsed(env, nonce) {
  // A request is valid from ts-120s to ts+120s, so remember each nonce for both halves.
  const ttlSec = REPLAY_WINDOW_SEC * 2;
  if (env.NONCES) {
    try {
      const stub = env.NONCES.get(env.NONCES.idFromName(`shard-${nonce.slice(0, 2).toLowerCase()}`));
      const res = await stub.fetch('https://nonces/claim', { method: 'POST', body: JSON.stringify({ nonce, ttlSec }) });
      if (res.status === 409) return true;
      if (res.ok) return false;
      console.error('Nonce store HTTP', res.status);
    } catch (e) {
      console.error('Nonce store error:', e.message);
    }
  }
  const nonceKey = new Request(`https://nonce.robinthood.invalid/${nonce}`);
  const cache = caches.default;
  if (await cache.match(nonceKey)) return true;
  await cache.put(nonceKey, new Response('1', { headers: { 'Cache-Control': `max-age=${ttlSec}` } }));
  return false;
}

// HMAC-SHA256 over "ts:nonce:body", 120s window, each nonce accepted once.
// Order matters: HMAC, then the per-IP limit, then the nonce claim, so neither forged
// traffic nor a holder of the extracted app key can call the nonce store more than
// SIGNED_LIMIT_PER_MIN times a minute per IP.
async function verifyAppSignature(request, rawBody, secret, env, ip) {
  if (!secret) {
    return { ok: false, status: 503, error: 'Service not configured' };
  }

  const tsHeader = request.headers.get('X-Robin-Timestamp');
  const nonce = request.headers.get('X-Robin-Nonce');
  const sigHeader = request.headers.get('X-Robin-Signature');

  if (!tsHeader || !nonce || !sigHeader) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing RobinTHood app attestation headers' };
  }
  if (!/^[A-Za-z0-9-]{16,64}$/.test(nonce)) {
    return { ok: false, status: 400, error: 'Bad Request: Invalid nonce' };
  }

  const ts = parseInt(tsHeader, 10);
  if (isNaN(ts)) {
    return { ok: false, status: 400, error: 'Bad Request: Invalid timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > REPLAY_WINDOW_SEC) {
    // The app adopts serverTime and signs again, so a phone with a wrong clock still works.
    return { ok: false, status: 401, error: 'Unauthorized: Timestamp expired or clock drift > 120s', serverTime: now };
  }

  const expectedSig = await hmacHex(secret, `${ts}:${nonce}:${rawBody}`);
  if (!timingSafeEqual(sigHeader, expectedSig)) {
    return { ok: false, status: 403, error: 'Forbidden: Invalid app signature' };
  }

  if (await signedRequestLimited(env, ip, rawBody)) {
    return { ok: false, limited: true };
  }

  if (await nonceAlreadyUsed(env, nonce)) {
    return { ok: false, status: 401, error: 'Unauthorized: Replayed request' };
  }

  return { ok: true };
}

// Parses an IPv4 literal in any form URL parsing accepts (it already normalises
// decimal, hex and octal forms to dotted quads). Returns the 4 octets or null.
function ipv4Octets(host) {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  return m ? m.slice(1).map(Number) : null;
}

function isPrivateIpv4([a, b, c]) {
  return a === 0 || a === 10 || a === 127 || (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
    (a === 192 && b === 0 && c === 0) ||
    (a === 198 && (b === 18 || b === 19)) || a >= 224;
}

// SSRF prevention: http(s) only on default ports, no credentials, no private,
// loopback, link-local or metadata addresses (v4 or v6), no internal names.
function isUnsafeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    if (u.port !== '' || u.username || u.password) return true;
    const host = u.hostname.toLowerCase().replace(/\.$/, '');
    // Any IPv6 literal is refused: public sites are reached by name, and the
    // literal forms (::1, fe80::, fc00::, ::ffff:10.0.0.1, ...) are SSRF bait.
    if (host.startsWith('[')) return true;
    // Single-label names and internal suffixes only resolve inside a network.
    if (!host.includes('.') || /(^|\.)(localhost|local|internal|lan|home|arpa|corp|intranet)$/.test(host)) return true;
    const v4 = ipv4Octets(host);
    if (v4 && isPrivateIpv4(v4)) return true;
    return false;
  } catch {
    return true;
  }
}

// fetch() with redirects followed by hand, so every hop passes isUnsafeUrl.
async function safeFetch(url, init) {
  let current = url;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (isUnsafeUrl(current)) throw new Error('Restricted URL');
    const res = await fetch(current, { ...init, redirect: 'manual', signal: AbortSignal.timeout(READ_TIMEOUT_MS) });
    if (res.status < 300 || res.status >= 400) return res;
    const next = res.headers.get('Location');
    if (!next) return res;
    current = new URL(next, current).href;
  }
  throw new Error('Too many redirects');
}

// Reads at most maxBytes of a response body, then drops the rest of the download.
async function readCappedText(res, maxBytes) {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';
  let size = 0;
  while (size < maxBytes) {
    const { value, done } = await reader.read();
    if (done) return text + decoder.decode();
    size += value.byteLength;
    text += decoder.decode(value, { stream: true });
  }
  await reader.cancel().catch(() => {});
  return text;
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)));
}

const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

function realUrl(href) {
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch {} }
  if (href.startsWith('//')) return 'https:' + href;
  return href;
}

// 1. Brave Search API (when BRAVE_API_KEY secret is configured)
async function searchBrave(query, lang, apiKey) {
  const res = await fetch(`https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=6`, {
    headers: {
      'Accept': 'application/json',
      'Accept-Encoding': 'gzip',
      'X-Subscription-Token': apiKey,
    },
  });
  if (!res.ok) throw new Error(`Brave Search API HTTP ${res.status}`);
  const json = await res.json();
  const webResults = json.web?.results || [];
  if (!webResults.length) throw new Error('Brave returned no results');

  return {
    source: 'Brave Search',
    attribution: 'POWERED BY BRAVE',
    results: webResults.slice(0, 6).map((r) => ({
      title: r.title,
      url: r.url,
      snippet: r.description || '',
    })),
  };
}

// 2. DuckDuckGo Lite (server-side, fast, bot-resistant)
async function searchDDGLite(query, lang) {
  const kl = DDG_REGIONS[lang] || 'wt-wt';
  const res = await fetch('https://lite.duckduckgo.com/lite/', {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Accept': 'text/html',
    },
    body: `q=${encodeURIComponent(query)}&kl=${kl}`,
  });
  if (!res.ok) throw new Error(`DDG Lite HTTP ${res.status}`);
  const html = await res.text();

  const results = [];
  const linkMatches = [...html.matchAll(/<a rel="nofollow" href="([^"]+)" class='result-link'>([\s\S]*?)<\/a>/g)];
  const snipMatches = [...html.matchAll(/<td class='result-snippet'>([\s\S]*?)<\/td>/g)];

  for (let i = 0; i < linkMatches.length; i++) {
    const url = realUrl(decodeEntities(linkMatches[i][1]));
    if (!/^https?:\/\//.test(url) || url.includes('duckduckgo.com/y.js')) continue;
    const title = stripTags(linkMatches[i][2]);
    const snippet = snipMatches[i] ? stripTags(snipMatches[i][1]) : '';
    results.push({ title, url, snippet });
    if (results.length >= 6) break;
  }
  if (!results.length) throw new Error('DDG Lite returned no results');

  return { source: 'DuckDuckGo', attribution: null, results };
}

// 3. Localized Wikipedia Fallback
async function searchWikipedia(query, lang) {
  const wikiLang = ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'hi'].includes(lang) ? lang : 'en';
  const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RobinTHood-SearchWorker/1.2' } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = await res.json();
  const hits = json?.query?.search || [];
  if (!hits.length) throw new Error('Wikipedia returned no results');

  return {
    source: 'Wikipedia',
    attribution: null,
    results: hits.map((h) => ({
      title: h.title,
      url: `https://${wikiLang}.wikipedia.org/wiki/${encodeURIComponent(h.title.replace(/ /g, '_'))}`,
      snippet: stripTags(h.snippet),
    })),
  };
}

// Clean page reader: fetches target URL, strips fluff, returns pure readable text
async function extractPageText(url, maxChars = 5000) {
  try {
    const res = await safeFetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    if (!READABLE_TYPES.test(res.headers.get('Content-Type') || '')) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, error: 'Not a text page' };
    }
    if (Number(res.headers.get('Content-Length') || 0) > MAX_PAGE_BYTES * 2) {
      await res.body?.cancel().catch(() => {});
      return { ok: false, error: 'Page too large' };
    }
    const html = (await readCappedText(res, MAX_PAGE_BYTES)).slice(0, 250000);

    // Filter out common bot challenge pages
    if (html.includes('cf-browser-verification') || html.includes('Just a moment...') || html.includes('captcha-delivery')) {
      return { ok: false, error: 'Challenge required' };
    }

    let body = html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    const main = body.match(/<(article|main)[^>]*>([\s\S]*?)<\/\1>/i);
    if (main && main[2]) body = main[2];

    const clean = stripTags(body);
    const text = clean.length > 50 ? clean.slice(0, maxChars) : '';
    return { ok: text.length > 0, text, chars: text.length };
  } catch (err) {
    return { ok: false, error: 'Fetch failed' };
  }
}

export default {
  async fetch(request, env, ctx) {
    // Cache writes must outlive the response, or the runtime may cancel them.
    const later = (p) => (ctx?.waitUntil ? ctx.waitUntil(p) : p);
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
      }

      const url = new URL(request.url);
      const clientSecret = env.ROBIN_CLIENT_SECRET || '';
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

      // 1. Health check (public, monitoring only)
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'robinthood-search', version: '1.3.0' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Privacy policy (public; linked from the app's Settings and the Play listing).
      // CONTACT_EMAIL is a plain [vars] entry in wrangler.toml.
      if (url.pathname === '/privacy') {
        return new Response(privacyPage(env.CONTACT_EMAIL || ''), {
          headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'public, max-age=3600' },
        });
      }

      // 2. Reject unauthenticated deprecated GET endpoints
      if (url.pathname === '/search' || url.pathname === '/read') {
        return new Response(JSON.stringify({
          error: 'Deprecated: Open GET search has been retired. Use authenticated POST /v1/search.',
        }), {
          status: 410,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // 3. Coarse flood guard per IP, before any signature work
      if (isRateLimited(clientIp, UNSIGNED_FLOOD_LIMIT_PER_MIN, 60)) {
        return rateLimitResponse();
      }

      // 4. Endpoint: POST /v1/search
      if (url.pathname === '/v1/search') {
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const rawBody = await readCappedBody(request);
        if (rawBody === null) return tooLarge();
        const auth = await verifyAppSignature(request, rawBody, clientSecret, env, clientIp);
        if (auth.limited) return rateLimitResponse();
        if (!auth.ok) {
          return new Response(JSON.stringify({ error: auth.error, serverTime: auth.serverTime }), {
            status: auth.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        let parsed;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ error: 'Malformed JSON body' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const q = String(parsed.query || '').trim().slice(0, MAX_QUERY_CHARS);
        const lang = (parsed.lang || 'en').toLowerCase();

        if (!q) {
          return new Response(JSON.stringify({ error: 'Missing field "query"' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Check edge cache using request origin
        const cache = caches.default;
        const cacheUrl = new URL('/__cache/search', request.url);
        cacheUrl.searchParams.set('q', q);
        cacheUrl.searchParams.set('lang', lang);
        const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          const data = await cachedResponse.json();
          return new Response(JSON.stringify({ ...data, cached: true }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          });
        }

        // Multi-provider cascade
        let payload = null;

        if (env.BRAVE_API_KEY) {
          try {
            payload = await searchBrave(q, lang, env.BRAVE_API_KEY);
          } catch (e) {
            console.error('Brave error:', e.message);
          }
        }

        if (!payload) {
          try {
            payload = await searchDDGLite(q, lang);
          } catch (e) {
            console.error('DDG error:', e.message);
          }
        }

        if (!payload) {
          try {
            payload = await searchWikipedia(q, lang);
          } catch (e) {
            console.error('Wiki error:', e.message);
          }
        }

        if (!payload) {
          return new Response(JSON.stringify({ error: 'Search services temporarily unavailable. Please try again shortly.' }), {
            status: 502,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const responseBody = {
          query: q,
          lang,
          source: payload.source,
          attribution: payload.attribution,
          cached: false,
          results: payload.results,
        };

        const finalResponse = new Response(JSON.stringify(responseBody), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=1800', // 30 min cache
          },
        });

        later(cache.put(cacheKey, finalResponse.clone()));
        return finalResponse;
      }

      // 5. Endpoint: POST /v1/read
      if (url.pathname === '/v1/read') {
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const rawBody = await readCappedBody(request);
        if (rawBody === null) return tooLarge();
        const auth = await verifyAppSignature(request, rawBody, clientSecret, env, clientIp);
        if (auth.limited) return rateLimitResponse();
        if (!auth.ok) {
          return new Response(JSON.stringify({ error: auth.error, serverTime: auth.serverTime }), {
            status: auth.status,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        let parsed;
        try {
          parsed = JSON.parse(rawBody);
        } catch {
          return new Response(JSON.stringify({ error: 'Malformed JSON body' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const targetUrl = parsed.url;
        const maxChars = Math.min(Math.max(parseInt(parsed.maxChars, 10) || 5000, 100), MAX_READ_CHARS);
        if (typeof targetUrl !== 'string' || isUnsafeUrl(targetUrl)) {
          return new Response(JSON.stringify({ error: 'Invalid or restricted URL' }), {
            status: 400,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        // Check edge cache for page reads
        const cache = caches.default;
        const cacheUrl = new URL('/__cache/read', request.url);
        cacheUrl.searchParams.set('url', targetUrl);
        cacheUrl.searchParams.set('max', String(maxChars));
        const cacheKey = new Request(cacheUrl.toString(), { method: 'GET' });
        const cachedResponse = await cache.match(cacheKey);
        if (cachedResponse) {
          const data = await cachedResponse.json();
          return new Response(JSON.stringify({ ...data, cached: true }), {
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
          });
        }

        const result = await extractPageText(targetUrl, maxChars);
        const finalResponse = new Response(JSON.stringify(result), {
          headers: {
            ...CORS_HEADERS,
            'Content-Type': 'application/json',
            'Cache-Control': 'public, max-age=3600',
          },
        });

        // Only cache valid, non-empty text extraction
        if (result.ok && result.text && result.text.length >= 100) {
          later(cache.put(cacheKey, finalResponse.clone()));
        }
        return finalResponse;
      }

      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Unhandled worker exception:', err);
      return new Response(JSON.stringify({ error: 'Internal edge service error' }), {
        status: 500,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }
  },
};

// One shard of the nonce store, keyed by the nonce's first two characters (lowercased):
// 256 shards for the app's hex UUID nonces, up to 37^2 for other allowed characters.
// A Durable Object handles one request at a time, so check-then-record is atomic, and
// every Cloudflare location reaches the same object, which closes cross-location replay.
const CURSOR = '~sweep-cursor';

export class NonceStore {
  constructor(state) {
    this.state = state;
  }

  async fetch(request) {
    let nonce, ttlSec;
    try {
      ({ nonce, ttlSec } = await request.json());
    } catch {
      return new Response('bad request', { status: 400 });
    }
    if (typeof nonce !== 'string' || !nonce || !(ttlSec > 0)) return new Response('bad request', { status: 400 });

    const now = Date.now();
    const expires = await this.state.storage.get(nonce);
    if (expires && expires > now) return new Response('replay', { status: 409 });
    await this.state.storage.put(nonce, now + ttlSec * 1000);

    // Drop expired nonces now and then so a shard never grows without bound. Keys come back
    // sorted, so each sweep picks up where the last stopped (CURSOR) and wraps at the end;
    // starting from the top every time would never reach most of a big shard.
    if (Math.random() < 0.05) {
      const cursor = await this.state.storage.get(CURSOR);
      const page = await this.state.storage.list({ limit: 1000, ...(cursor ? { startAfter: cursor } : {}) });
      const stale = [];
      let lastKey;
      for (const [key, exp] of page) {
        if (key === CURSOR) continue;
        lastKey = key;
        if (exp <= now) stale.push(key);
      }
      for (let i = 0; i < stale.length; i += 128) await this.state.storage.delete(stale.slice(i, i + 128));
      if (page.size < 1000 || !lastKey) await this.state.storage.delete(CURSOR);
      else await this.state.storage.put(CURSOR, lastKey);
    }
    return new Response('ok');
  }
}
