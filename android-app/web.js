// Free, keyless web search for Robin: DuckDuckGo first, Wikipedia as backup.
// Results (plus a little text from the top pages) are handed to the model
// along with the user's message.
import { fetch } from 'expo/fetch';

const UA = 'Mozilla/5.0 (Linux; Android 14; Mobile) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36';

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#x27;|&#39;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
}

const stripTags = (s) => decodeEntities(s.replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();

async function withTimeout(promiseFn, ms) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try { return await promiseFn(ctrl.signal); } finally { clearTimeout(t); }
}

function realUrl(href) {
  // DuckDuckGo wraps links: //duckduckgo.com/l/?uddg=<encoded url>&rut=...
  const m = href.match(/[?&]uddg=([^&]+)/);
  if (m) { try { return decodeURIComponent(m[1]); } catch {} }
  if (href.startsWith('//')) return 'https:' + href;
  return href;
}

async function searchDuckDuckGo(query) {
  const html = await withTimeout(async (signal) => {
    const res = await fetch('https://html.duckduckgo.com/html/', {
      method: 'POST',
      signal,
      headers: { 'User-Agent': UA, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
      body: 'q=' + encodeURIComponent(query) + '&kl=us-en',
    });
    if (!res.ok) throw new Error(`DuckDuckGo HTTP ${res.status}`);
    return res.text();
  }, 10000);

  const results = [];
  const blocks = html.split(/class="result results_links/).slice(1);
  for (const b of blocks) {
    if (/result--ad/.test(b.slice(0, 200))) continue;
    const a = b.match(/class="result__a"[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!a) continue;
    const snip = b.match(/class="result__snippet"[^>]*>([\s\S]*?)<\/(?:a|div)>/);
    const url = realUrl(decodeEntities(a[1]));
    if (!/^https?:\/\//.test(url) || url.includes('duckduckgo.com/y.js')) continue;
    results.push({ title: stripTags(a[2]), url, snippet: snip ? stripTags(snip[1]) : '' });
    if (results.length >= 6) break;
  }
  if (!results.length) throw new Error('DuckDuckGo returned no results');
  return results;
}

async function searchWikipedia(query) {
  const url = 'https://en.wikipedia.org/w/api.php?action=query&list=search&format=json&srlimit=4&srsearch=' + encodeURIComponent(query);
  const json = await withTimeout(async (signal) => {
    const res = await fetch(url, { signal, headers: { 'User-Agent': 'RobinTHood-Android/0.6' } });
    if (!res.ok) throw new Error(`Wikipedia HTTP ${res.status}`);
    return res.json();
  }, 8000);
  const hits = json?.query?.search ?? [];
  if (!hits.length) throw new Error('Wikipedia returned no results');
  return hits.map((h) => ({
    title: h.title,
    url: 'https://en.wikipedia.org/wiki/' + encodeURIComponent(h.title.replace(/ /g, '_')),
    snippet: stripTags(h.snippet),
  }));
}

// Pull readable text from a page, best effort.
async function pageText(url, maxChars = 2500) {
  try {
    const html = await withTimeout(async (signal) => {
      const res = await fetch(url, { signal, headers: { 'User-Agent': UA, Accept: 'text/html' } });
      if (!res.ok) throw new Error('bad status');
      const type = res.headers.get('content-type') || '';
      if (!type.includes('html') && !type.includes('text')) throw new Error('not text');
      return (await res.text()).slice(0, 400000);
    }, 7000);
    let body = html
      .replace(/<(script|style|noscript|svg|nav|header|footer|form|aside)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<!--[\s\S]*?-->/g, ' ');
    const main = body.match(/<(article|main)[\s\S]*?<\/\1>/i);
    if (main) body = main[0];
    const text = stripTags(body);
    return text.length > 200 ? text.slice(0, maxChars) : '';
  } catch {
    return '';
  }
}

// Build a search query. Short follow-ups ("what about tomorrow?") borrow the
// previous question so the search has context.
export function searchQueryFrom(history) {
  const users = history.filter((m) => m.role === 'user').map((m) => m.content.trim());
  const last = users[users.length - 1] || '';
  const prev = users[users.length - 2];
  let q = last;
  if (prev && last.split(/\s+/).length < 6) q = `${prev} ${last}`;
  return q.replace(/\s+/g, ' ').slice(0, 240);
}

// Returns { query, results: [{title,url,snippet,text?}], source } or throws.
export async function webSearch(query) {
  let results;
  let source = 'DuckDuckGo';
  try {
    results = await searchDuckDuckGo(query);
  } catch {
    results = await searchWikipedia(query);
    source = 'Wikipedia';
  }
  // Read the top two pages for more than a one-line snippet.
  const texts = await Promise.all(results.slice(0, 2).map((r) => pageText(r.url)));
  texts.forEach((t, i) => { if (t) results[i].text = t; });
  return { query, results, source };
}

export function formatForModel(web) {
  const lines = web.results.map((r, i) => {
    let s = `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`;
    if (r.text) s += `\nPage excerpt: ${r.text}`;
    return s;
  });
  return (
    `Web search results for "${web.query}" (via ${web.source}). Use them to answer with current information. ` +
    'Cite sources inline like [1] when you use them. If the results do not answer the question, say so and answer from what you know.\n\n' +
    lines.join('\n\n')
  );
}
