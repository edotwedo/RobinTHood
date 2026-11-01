// RobinTHood Global Search & Page Extraction Infrastructure
// Cloudflare Worker: routes searches, caches hot queries, and strips pages into clean text for mobile AI.

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

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

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
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

  return { source: 'DuckDuckGo', results };
}

// 3. Localized Wikipedia Fallback
async function searchWikipedia(query, lang) {
  const wikiLang = ['es', 'fr', 'de', 'pt', 'ja', 'zh', 'hi'].includes(lang) ? lang : 'en';
  const url = `https://${wikiLang}.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=5&srsearch=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'RobinTHood-SearchWorker/1.0' } });
  if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
  const json = await res.json();
  const hits = json?.query?.search || [];
  if (!hits.length) throw new Error('Wikipedia returned no results');

  return {
    source: 'Wikipedia',
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
    const html = (await res.text()).slice(0, 500000);

    let body = html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside|iframe)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');

    const main = body.match(/<(article|main)[\s\S]*?<\/\1>/i);
    if (main) body = main[0];

    const clean = stripTags(body);
    const text = clean.length > 100 ? clean.slice(0, maxChars) : '';
    return { ok: true, text, chars: text.length };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    // Health check
    if (url.pathname === '/' || url.pathname === '/health') {
      return new Response(JSON.stringify({ status: 'ok', service: 'robinhood-search', version: '1.0.0' }), {
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Endpoint: GET /search?q=...&lang=...
    if (url.pathname === '/search') {
      const q = (url.searchParams.get('q') || '').trim();
      const lang = (url.searchParams.get('lang') || 'en').toLowerCase();

      if (!q) {
        return new Response(JSON.stringify({ error: 'Missing query parameter "q"' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      // Check Cloudflare Cache
      const cache = caches.default;
      const cacheKey = new Request(url.toString(), request);
      const cachedResponse = await cache.match(cacheKey);
      if (cachedResponse) {
        const data = await cachedResponse.json();
        return new Response(JSON.stringify({ ...data, cached: true }), {
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'X-Cache': 'HIT' },
        });
      }

      // Multi-provider cascade
      let payload = null;
      let errors = [];

      if (env.BRAVE_API_KEY) {
        try {
          payload = await searchBrave(q, lang, env.BRAVE_API_KEY);
        } catch (e) {
          errors.push(`Brave: ${e.message}`);
        }
      }

      if (!payload) {
        try {
          payload = await searchDDGLite(q, lang);
        } catch (e) {
          errors.push(`DDG Lite: ${e.message}`);
        }
      }

      if (!payload) {
        try {
          payload = await searchWikipedia(q, lang);
        } catch (e) {
          errors.push(`Wikipedia: ${e.message}`);
        }
      }

      if (!payload) {
        return new Response(JSON.stringify({ error: 'All search engines failed', details: errors }), {
          status: 502,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const responseBody = {
        query: q,
        lang,
        source: payload.source,
        cached: false,
        results: payload.results,
      };

      const finalResponse = new Response(JSON.stringify(responseBody), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=1800', // Cache for 30 minutes at edge
        },
      });

      // Store in Cloudflare Edge Cache
      cache.put(cacheKey, finalResponse.clone());
      return finalResponse;
    }

    // Endpoint: GET /read?url=...
    if (url.pathname === '/read') {
      const targetUrl = url.searchParams.get('url');
      if (!targetUrl) {
        return new Response(JSON.stringify({ error: 'Missing parameter "url"' }), {
          status: 400,
          headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
        });
      }

      const result = await extractPageText(targetUrl);
      return new Response(JSON.stringify(result), {
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
          'Cache-Control': 'public, max-age=3600', // Cache page texts for 1 hour
        },
      });
    }

    return new Response(JSON.stringify({ error: 'Not found' }), {
      status: 404,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  },
};
