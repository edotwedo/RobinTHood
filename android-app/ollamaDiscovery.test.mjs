import assert from 'node:assert/strict';
import test from 'node:test';
import { checkOllamaEndpoint, discoverOllamaLan } from './ollamaDiscovery.js';

test('checkOllamaEndpoint returns null on non-existent endpoint or timeout', async () => {
  const result = await checkOllamaEndpoint('http://127.0.0.1:59999', 100);
  assert.equal(result, null);
});

test('checkOllamaEndpoint parses models when endpoint responds', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (url) => {
    if (url.includes('/api/tags')) {
      return {
        ok: true,
        json: async () => ({
          models: [
            { name: 'llama3.2:latest', size: 2000000 },
            { name: 'mistral:latest', size: 4000000 },
          ],
        }),
      };
    }
    return { ok: false };
  };

  try {
    const res = await checkOllamaEndpoint('http://localhost:11434', 500);
    assert.ok(res);
    assert.equal(res.url, 'http://localhost:11434');
    assert.deepEqual(res.models, ['llama3.2:latest', 'mistral:latest']);
    assert.equal(res.recommendedModel, 'llama3.2:latest');

    const discovered = await discoverOllamaLan([], 500);
    assert.ok(discovered);
    assert.equal(discovered.url, 'http://localhost:11434');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
