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
const DB = { prepare: () => ({ bind: (...a) => ({ run: async () => rows.push(a) }), all: async () => ({ results: [] }) }) };
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
