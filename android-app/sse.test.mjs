// node --test android-app/sse.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readSSE } from './sse.js';

const streamOf = (...parts) => ({
  body: new ReadableStream({
    start(c) { for (const p of parts) c.enqueue(new TextEncoder().encode(p)); c.close(); },
  }),
});
const chunk = (content) => `data: ${JSON.stringify({ choices: [{ delta: { content } }] })}`;

test('keeps the last chunk when the stream ends without a newline (#45)', async () => {
  let seen = '';
  const full = await readSSE(streamOf(`${chunk('Hello')}\n`, chunk(' world')), (t) => { seen = t; });
  assert.equal(full, 'Hello world');
  assert.equal(seen, 'Hello world');
});

test('a final chunk split across reads still parses', async () => {
  const line = chunk('Bye');
  const full = await readSSE(streamOf(line.slice(0, 10), line.slice(10)), () => {});
  assert.equal(full, 'Bye');
});

test('[DONE] still ends the stream, and a multi-byte character split across reads survives', async () => {
  const bytes = new TextEncoder().encode(`${chunk('é')}\n`);
  const res = { body: new ReadableStream({ start(c) { const k = bytes.indexOf(0xc3) + 1; c.enqueue(bytes.slice(0, k)); c.enqueue(bytes.slice(k)); c.enqueue(new TextEncoder().encode('data: [DONE]\n' + chunk('late'))); c.close(); } }) };
  assert.equal(await readSSE(res, () => {}), 'é');
});
