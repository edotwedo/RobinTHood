import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeOllamaUrl, fetchOllama } from './ollamaConnection.js';
import { checkOllamaEndpoint } from './ollamaDiscovery.js';

test('Ollama addresses accept LAN, VPN, HTTPS and IPv6 origins', () => {
  for (const address of ['http://192.168.1.10:11434', 'https://home.tailnet.ts.net', 'http://[::1]:11434']) {
    assert.equal(normalizeOllamaUrl(` ${address}/ `), address);
  }
});

test('invalid addresses fail before any request', async () => {
  for (const address of ['', 'home:11434', 'ftp://home', 'http://home/api/chat', 'http://user:pass@home', 'http://home?q=x', 'http://home/#x']) {
    let called = false;
    await assert.rejects(fetchOllama(async () => { called = true; }, address, '/api/chat'), /address|Ollama/);
    assert.equal(called, false);
  }
});

test('chat gets a normalized endpoint and actionable network/model errors', async () => {
  const response = { ok: true };
  assert.equal(await fetchOllama(async (url) => {
    assert.equal(url, 'http://home:11434/api/chat'); return response;
  }, 'http://home:11434/', '/api/chat'), response);
  await assert.rejects(fetchOllama(async () => { throw new TypeError('Network request failed'); }, 'http://home', '/api/chat'), /same network or VPN/);
  await assert.rejects(fetchOllama(async () => ({ ok: false, status: 404 }), 'http://home', '/api/chat'), /model name/);
  await assert.rejects(fetchOllama(async () => ({ ok: false, status: 403 }), 'http://home', '/api/chat'), /refused access/);
  const ctrl = new AbortController(); ctrl.abort();
  const stopped = new Error('cancelled');
  await assert.rejects(fetchOllama(async () => { throw stopped; }, 'http://home', '/api/chat', { signal: ctrl.signal }), (error) => error === stopped);
});

test('address check rejects unrelated JSON services and handles timeout', async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => ({ ok: true, json: async () => ({ status: 'ok' }) });
    assert.equal(await checkOllamaEndpoint('http://home'), null);
    globalThis.fetch = async (_url, { signal }) => new Promise((_resolve, reject) => signal.addEventListener('abort', () => reject(new Error('timeout'))));
    assert.equal(await checkOllamaEndpoint('http://home', 10), null);
  } finally { globalThis.fetch = original; }
});
