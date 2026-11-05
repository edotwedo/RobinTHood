// Verifiability labels for answers (v1). Plain JS with no app imports, so it runs under
// `node --test` as well as in the app. Rule-based and on the phone: no model call, nothing
// is sent anywhere.
//
// Two questions per sentence of an answer:
//   1. How checkable is it?  'specific' (numbers, dates, names, quotes: a reader can check
//      it), 'general' (a plain statement with nothing pinned down) or 'opinion' (advice,
//      hedges, judgement: there is nothing to check).
//   2. Do the sources back it?  'supported', 'partial' or 'unsupported', judged against the
//      search snippets and page text the agent actually read. A sentence that links one
//      of those sources is judged against that source alone, so a citation has to carry
//      its own sentence.

const MONTHS = 'january|february|march|april|may (?=\\d)|june|july|august|september|october|november|december|' +
  'jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec';
const OPINION = /\b(i think|i believe|i'd|i would|in my (?:opinion|view)|probably|perhaps|maybe|may|might|could|seems?|likely|unlikely|arguably|should|recommend\w*|suggest\w*|consider|best|worst|better|worse|great|good idea|you can|you may|try|depends)\b/i;
const STOP = new Set(('a an and are as at be been but by can did do does for from had has have he her his how i if in ' +
  'into is it its just more most not of on or our she so some than that the their them then there these they this ' +
  'those to too us was we were what when where which who why will with you your about also any each other only over ' +
  'such very after before because being both between during same while according said says').split(' '));

const MAX_CLAIM = 160;

// Answer text -> sentences worth labelling. Code, headings and questions are skipped.
export function splitClaims(text) {
  const prose = String(text || '')
    .replace(/```[\s\S]*?```/g, '\n')
    .replace(/`[^`]*`/g, ' ')
    .split('\n')
    .filter((line) => !/^\s*(#|>|\|)/.test(line))
    .map((line) => line.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))
    .join('\n');
  const out = [];
  for (const block of prose.split(/\n+/)) {
    for (const raw of block.split(/(?<=[.!?])\s+(?=[A-Z"'(\d*])/)) {
      const s = raw.replace(/\*\*|__/g, '').trim();
      if (!s || s.endsWith('?') || s.endsWith(':')) continue;
      if (plain(s).split(/\s+/).filter(Boolean).length < 4) continue;
      out.push(s);
    }
  }
  return out;
}

// Markdown links -> their text, bare URLs and [n] markers dropped.
function plain(s) {
  return s.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/https?:\/\/\S+/g, ' ').replace(/\[\d+\]/g, ' ');
}

function numbersIn(s) {
  return [...plain(s).matchAll(/\d[\d,]*(?:\.\d+)?/g)].map((m) => m[0].replace(/,(?=\d{3}\b)/g, '').replace(/[.,]$/, ''));
}

function quotesIn(s) {
  return [...s.matchAll(/["“]([^"”]{4,})["”]/g)].map((m) => norm(m[1]));
}

// Capitalised words that are not the first word of the sentence: names, places, products.
function namesIn(s) {
  const words = plain(s).replace(/["“”(]/g, '').split(/\s+/).slice(1);
  return words.map((w) => w.replace(/[^\p{L}\p{N}'-]/gu, '')).filter((w) => /^\p{Lu}/u.test(w) && !/^I$/.test(w));
}

export function checkability(sentence) {
  const s = plain(sentence);
  if (quotesIn(sentence).length || numbersIn(sentence).length || new RegExp(`\\b(${MONTHS})\\b`, 'i').test(s)) return 'specific';
  if (OPINION.test(s)) return 'opinion';
  if (namesIn(sentence).length >= 1) return 'specific';
  return 'general';
}

function norm(s) {
  return String(s).toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, ' ').trim();
}

function stem(w) {
  return w.replace(/(?:ies)$/, 'y').replace(/(?:ing|ed|es|s)$/, '');
}

function contentWords(s) {
  return [...new Set(norm(plain(s)).split(/[^\p{L}\p{N}]+/u).filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d/.test(w)).map(stem))];
}

function evidenceIndex(text) {
  const n = norm(text);
  return {
    text: n,
    numbers: new Set(numbersIn(text)),
    words: new Set(n.split(/[^\p{L}\p{N}]+/u).filter(Boolean).map(stem)),
  };
}

// How well one piece of evidence backs one sentence.
function score(sentence, ev) {
  const missing = [];
  for (const num of numbersIn(sentence)) if (!ev.numbers.has(num)) missing.push(num);
  for (const q of quotesIn(sentence)) if (!ev.text.includes(q)) missing.push(`"${q}"`);
  const words = contentWords(sentence);
  const found = words.filter((w) => ev.words.has(w)).length;
  const overlap = words.length ? found / words.length : 0;
  let level;
  if (missing.length) level = overlap >= 0.5 ? 'partial' : 'unsupported';
  else if (overlap >= 0.6) level = 'supported';
  else if (overlap >= 0.35) level = 'partial';
  else level = 'unsupported';
  return { level, overlap, missing };
}

const RANK = { supported: 2, partial: 1, unsupported: 0 };

function sameUrl(a, b) {
  const key = (u) => String(u).replace(/^https?:\/\/(www\.)?/, '').replace(/[/#?]+$/, '').toLowerCase();
  return key(a) === key(b);
}

// evidence: [{ url, text }] (search snippets, page text). One entry per url is enough;
// several entries for the same url are merged.
export function support(sentence, evidence) {
  const linked = [...sentence.matchAll(/https?:\/\/[^\s)\]]+/g)].map((m) => m[0]);
  const cited = linked.length ? evidence.filter((e) => linked.some((u) => sameUrl(u, e.url))) : [];
  const pool = cited.length ? cited : evidence;
  let best = null;
  for (const e of pool) {
    const r = score(sentence, e.index || evidenceIndex(e.text));
    if (!best || RANK[r.level] > RANK[best.level] || (RANK[r.level] === RANK[best.level] && r.overlap > best.overlap)) best = { ...r, url: e.url };
  }
  if (!best) return { level: 'unsupported', url: null, missing: [], cited: false };
  return { level: best.level, url: best.level === 'unsupported' ? null : best.url, missing: best.missing, cited: cited.length > 0 };
}

function mergeEvidence(evidence) {
  const byUrl = new Map();
  for (const e of evidence || []) {
    if (!e || !e.url || !e.text) continue;
    byUrl.set(e.url, (byUrl.get(e.url) || '') + '\n' + e.text);
  }
  return [...byUrl].map(([url, text]) => ({ url, text, index: evidenceIndex(text) }));
}

// The whole answer. Returns null when there is nothing to check against, so answers that
// used no web sources carry no label at all rather than a wall of "unsupported".
export function verifyAnswer(text, evidence) {
  const pool = mergeEvidence(evidence);
  if (!pool.length) return null;
  const claims = [];
  const counts = { supported: 0, partial: 0, unsupported: 0, opinion: 0 };
  for (const s of splitClaims(text)) {
    const kind = checkability(s);
    if (kind === 'opinion') { counts.opinion++; continue; }
    const r = support(s, pool);
    counts[r.level]++;
    claims.push({ text: plain(s).replace(/\s+/g, ' ').trim().slice(0, MAX_CLAIM), kind, level: r.level, url: r.url, missing: r.missing.slice(0, 3) });
  }
  if (!claims.length) return null;
  return { counts, claims };
}
