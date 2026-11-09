// node --test android-app/workers.test.mjs  (both Cloudflare workers, against a mocked env)
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
const report = (await import("./report-worker/worker.js")).default;
const search = (await import("./search-worker/worker.js")).default;
const SECRET = 'test-secret';
const sign = (body, ts = Math.floor(Date.now() / 1000)) => {
  const nonce = randomUUID();
  return { 'x-robin-timestamp': String(ts), 'x-robin-nonce': nonce,
    'x-robin-signature': createHmac('sha256', SECRET).update(`${ts}:${nonce}:${body}`).digest('hex'), 'cf-connecting-ip': '1.2.3.4' };
};
const rows = [];
const DB = { prepare: () => ({ bind: (...a) => ({ run: async () => rows.push(a), all: async () => ({ results: [] }) }), all: async () => ({ results: [] }) }) };
let allow = true;
const env = { DB, ROBIN_CLIENT_SECRET: SECRET, ADMIN_TOKEN: 'adm', RATE_LIMITER: { limit: async () => ({ success: allow }) } };
const post = (body, headers) => report.fetch(new Request('https://r/report', { method: 'POST', body, headers }), env);

test('report: signed accepted, unsigned/bad/stale refused', async () => {
  const b = JSON.stringify({ reason: 'other', note: 'x' });
  assert.equal((await post(b, sign(b))).status, 200);
  assert.equal((await post(b, {})).status, 401);
  assert.equal((await post(b, { ...sign(b), 'x-robin-signature': 'f'.repeat(64) })).status, 401);
  assert.equal((await post(b, sign(b, Math.floor(Date.now() / 1000) - 3600))).status, 401);
  assert.equal((await post(b, sign(b + ' '))).status, 401);
  assert.equal(rows.length, 1);
});
test('report: feedback accepted with a longer note, unknown reason refused', async () => {
  const before = rows.length;
  const b = JSON.stringify({ reason: 'feedback', note: 'y'.repeat(3000) });
  assert.equal((await post(b, sign(b))).status, 200);
  assert.equal(rows.at(-1)[1], 'feedback');
  assert.equal(rows.at(-1)[2].length, 3000);
  const bad = JSON.stringify({ reason: 'spam', note: 'x' });
  assert.equal((await post(bad, sign(bad))).status, 400);
  assert.equal(rows.length, before + 1);
});
test('report: admin csv can filter to feedback', async () => {
  const r = await report.fetch(new Request('https://r/admin/reports.csv?reason=feedback', { headers: { authorization: 'Bearer adm' } }), env);
  assert.equal(r.status, 200);
  assert.match(await r.text(), /^created,reason,note/);
});
test('report: oversize body refused whatever content-length says', async () => {
  const b = JSON.stringify({ reason: 'other', note: 'x'.repeat(30000) });
  assert.equal((await post(b, { ...sign(b), 'content-length': '10' })).status, 413);
});
test('report: rate limited -> 429', async () => {
  allow = false; const b = JSON.stringify({ reason: 'other' });
  assert.equal((await post(b, sign(b))).status, 429); allow = true;
});
test('report: admin token checked', async () => {
  const get = (h) => report.fetch(new Request('https://r/admin/reports.csv', { headers: h }), env);
  assert.equal((await get({ authorization: 'Bearer nope' })).status, 401);
  assert.equal((await get({ authorization: 'Bearer adm' })).status, 200);
});

// Search worker /v1/read with a mocked upstream.
const store = new Map();
globalThis.caches = { default: { match: async (r) => store.get(r.url), put: async (r, res) => store.set(r.url, res) } };
const realFetch = globalThis.fetch;
const readRaw = async (upstream, { url = 'https://example.org/p' + Math.random(), install, ts, ip, env: extra = {} } = {}) => {
  globalThis.fetch = async () => upstream();
  const body = JSON.stringify({ url, maxChars: 500, install });
  const res = await search.fetch(new Request('https://w/v1/read', { method: 'POST', body, headers: { ...sign(body, ts), 'cf-connecting-ip': ip || '9.9.9.' + Math.floor(Math.random() * 200) } }), { ROBIN_CLIENT_SECRET: SECRET, ...extra });
  globalThis.fetch = realFetch;
  return res;
};
const read = async (upstream, url = 'https://example.org/p' + Math.random()) => {
  globalThis.fetch = async () => upstream();
  const body = JSON.stringify({ url, maxChars: 500 });
  const res = await search.fetch(new Request('https://w/v1/read', { method: 'POST', body, headers: { ...sign(body), 'CF-Connecting-IP': '9.9.9.' + Math.floor(Math.random()*200) } }), { ROBIN_CLIENT_SECRET: SECRET });
  globalThis.fetch = realFetch;
  return res.json();
};
const page = '<html><main>' + 'Hello readable words here. '.repeat(20) + '</main></html>';
test('read: normal html page works', async () => {
  const j = await read(() => new Response(page, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }));
  assert.equal(j.ok, true); assert.match(j.text, /Hello readable/);
});
test('read: non-text refused', async () => {
  const j = await read(() => new Response('PK..', { headers: { 'Content-Type': 'application/zip' } }));
  assert.deepEqual([j.ok, j.error], [false, 'Not a text page']);
});
test('read: huge declared length refused', async () => {
  const j = await read(() => new Response('x', { headers: { 'Content-Type': 'text/html', 'Content-Length': '500000000' } }));
  assert.deepEqual([j.ok, j.error], [false, 'Page too large']);
});
test('read: endless body stops at the cap', async () => {
  let sent = 0;
  const stream = new ReadableStream({ pull(c) { sent += 65536; c.enqueue(new TextEncoder().encode('<p>' + 'a '.repeat(32766) + '</p>')); } });
  const j = await read(() => new Response(stream, { headers: { 'Content-Type': 'text/html' } }));
  assert.equal(j.ok, true); assert.ok(sent < 3_000_000, `pulled ${sent} bytes`);
});

test('search worker: a stale timestamp gets serverTime back so the phone can fix its clock', async () => {
  const res = await readRaw(() => new Response(page, { headers: { 'Content-Type': 'text/html' } }), { ts: Math.floor(Date.now() / 1000) - 600 });
  assert.equal(res.status, 401);
  const j = await res.json();
  assert.ok(Math.abs(j.serverTime - Date.now() / 1000) < 5);
});

test('search worker: limits are per install, with a per-IP ceiling', async () => {
  const seen = [];
  const limiter = (cap) => { const n = new Map(); return { limit: async ({ key }) => { seen.push(key); n.set(key, (n.get(key) || 0) + 1); return { success: n.get(key) <= cap }; } }; };
  const env = { RATE_LIMITER: limiter(2), RATE_LIMITER_IP: limiter(5) };
  const ok = () => new Response(page, { headers: { 'Content-Type': 'text/html' } });
  const go = (install) => readRaw(ok, { install, ip: '7.7.7.7', env }).then((r) => r.status);
  assert.deepEqual([await go('install-aaaa'), await go('install-aaaa'), await go('install-aaaa')], [200, 200, 429]);
  assert.equal(await go('install-bbbb'), 200, 'another phone on the same IP has its own budget');
  assert.equal(await go('install-cccc'), 200);
  assert.equal(await go('install-dddd'), 429, 'the per-IP ceiling still holds');
  assert.ok(seen.includes('signed:7.7.7.7:install-aaaa') && seen.includes('ip:7.7.7.7'));
});

test('search worker: oversized bodies are refused before any signature work', async () => {
  const body = JSON.stringify({ query: 'x'.repeat(5000) });
  const res = await search.fetch(new Request('https://w/v1/search', { method: 'POST', body, headers: { ...sign(body), 'cf-connecting-ip': '8.8.4.4' } }), { ROBIN_CLIENT_SECRET: SECRET });
  assert.equal(res.status, 413);
});

test('nonce store: sweeps walk the whole shard, not just its first keys', async () => {
  const { NonceStore } = await import('./search-worker/worker.js');
  const map = new Map();
  const storage = {
    get: async (k) => map.get(k), put: async (k, v) => { map.set(k, v); }, delete: async (k) => { for (const x of [].concat(k)) map.delete(x); },
    list: async ({ limit, startAfter }) => new Map([...map].sort(([a], [b]) => (a < b ? -1 : 1)).filter(([k]) => !startAfter || k > startAfter).slice(0, limit)),
  };
  const past = Date.now() - 1000;
  for (let i = 0; i < 3000; i++) map.set(`n${String(i).padStart(5, '0')}`, past);
  const store = new NonceStore({ storage });
  const rnd = Math.random; Math.random = () => 0;
  try {
    for (let i = 0; i < 4; i++) await store.fetch(new Request('https://n/claim', { method: 'POST', body: JSON.stringify({ nonce: `fresh-${i}`, ttlSec: 240 }) }));
  } finally { Math.random = rnd; }
  const expired = [...map].filter(([k, v]) => k.startsWith('n') && v <= Date.now()).length;
  assert.equal(expired, 0, 'all 3000 expired nonces swept');
  assert.equal([...map.keys()].filter((k) => k.startsWith('fresh-')).length, 4, 'live nonces kept');
});
