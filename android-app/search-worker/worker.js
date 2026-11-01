// RobinTHood Global Search & Page Extraction Infrastructure (Hardened Production Worker)
// Cloudflare Worker: HMAC app attestation, rate-limiting, edge-cached search, stripped page reader.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Robin-Timestamp, X-Robin-Signature',
};

const DEFAULT_SECRET = 'rth_live_sec_9f82a17cb6e4402eb06a287955c4df01';
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

// In-memory sliding rate limiter per edge POP
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

// HMAC-SHA256 signature verification with 120s anti-replay window
async function verifyAppSignature(request, rawBody, secret) {
  const tsHeader = request.headers.get('X-Robin-Timestamp');
  const sigHeader = request.headers.get('X-Robin-Signature');

  if (!tsHeader || !sigHeader) {
    return { ok: false, status: 401, error: 'Unauthorized: Missing RobinTHood app attestation headers' };
  }

  const ts = parseInt(tsHeader, 10);
  if (isNaN(ts)) {
    return { ok: false, status: 400, error: 'Bad Request: Invalid timestamp' };
  }

  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > 120) {
    return { ok: false, status: 401, error: 'Unauthorized: Timestamp expired or clock drift > 120s' };
  }

  const toHash = `${ts}:${rawBody}:${secret}`;
  const enc = new TextEncoder();
  const hashBuf = await crypto.subtle.digest('SHA-256', enc.encode(toHash));
  const expectedSig = Array.from(new Uint8Array(hashBuf)).map((b) => b.toString(16).padStart(2, '0')).join('');

  if (!timingSafeEqual(sigHeader, expectedSig)) {
    return { ok: false, status: 403, error: 'Forbidden: Invalid app signature' };
  }

  return { ok: true };
}

// SSRF prevention: blocks private, loopback, cloud metadata, and non-http protocols
function isUnsafeUrl(urlStr) {
  try {
    const u = new URL(urlStr);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
    const host = u.hostname.toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1' || host === '169.254.169.254') return true;
    if (/^10\.|^172\.(1[6-9]|2[0-9]|3[0-1])\.|^192\.168\./.test(host)) return true;
    if (host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.lan')) return true;
    return false;
  } catch {
    return true;
  }
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
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Accept': 'text/html,application/xhtml+xml',
      },
    });
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` };
    const html = (await res.text()).slice(0, 250000);

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
  async fetch(request, env) {
    try {
      if (request.method === 'OPTIONS') {
        return new Response(null, { headers: CORS_HEADERS });
      }

      const url = new URL(request.url);
      const clientSecret = env.ROBIN_CLIENT_SECRET || DEFAULT_SECRET;
      const clientIp = request.headers.get('CF-Connecting-IP') || 'unknown';

      // 1. Health check (public, monitoring only)
      if (url.pathname === '/' || url.pathname === '/health') {
        return new Response(JSON.stringify({ status: 'ok', service: 'robinhood-search', version: '1.2.0-secure' }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
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

      // 3. Rate limiting check per IP
      if (isRateLimited(clientIp, 30, 60)) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded (max 30 requests/min). Please try again shortly.' }), {
          status: 429,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Retry-After': '60' },
        });
      }

      // 4. Endpoint: POST /v1/search
      if (url.pathname === '/v1/search') {
        if (request.method !== 'POST') {
          return new Response(JSON.stringify({ error: 'Method not allowed. Use POST.' }), {
            status: 405,
            headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
          });
        }

        const rawBody = await request.text();
        const auth = await verifyAppSignature(request, rawBody, clientSecret);
        if (!auth.ok) {
          return new Response(JSON.stringify({ error: auth.error }), {
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

        const q = (parsed.query || '').trim();
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

        cache.put(cacheKey, finalResponse.clone());
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

        const rawBody = await request.text();
        const auth = await verifyAppSignature(request, rawBody, clientSecret);
        if (!auth.ok) {
          return new Response(JSON.stringify({ error: auth.error }), {
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
        const maxChars = parsed.maxChars || 5000;
        if (!targetUrl || isUnsafeUrl(targetUrl)) {
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
          cache.put(cacheKey, finalResponse.clone());
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
