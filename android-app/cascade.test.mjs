// node --test android-app/cascade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { fallbackNeedsConsent, userTextOf } from './cascade.js';

test('a model with no * never falls to a * model without asking', () => {
  assert.equal(fallbackNeedsConsent('ovh-120b', 'ovh-qwen'), false);
  assert.equal(fallbackNeedsConsent('ovh-120b', 'kilo-cohere'), true);
  assert.equal(fallbackNeedsConsent('ovh-120b', 'kilo-auto'), true);
  assert.equal(fallbackNeedsConsent('ovh-120b', 'openrouter'), true);
});

test('Home Ollama never leaves the computer without asking', () => {
  assert.equal(fallbackNeedsConsent('ollama', 'ovh-120b'), true);
  assert.equal(fallbackNeedsConsent('ollama', 'kilo-auto'), true);
  assert.equal(fallbackNeedsConsent('ovh-120b', 'ollama'), false);
});

test('Auto and * models fall back freely', () => {
  assert.equal(fallbackNeedsConsent('auto', 'kilo-auto'), false);
  assert.equal(fallbackNeedsConsent('kilo-cohere', 'kilo-auto'), false);
  assert.equal(fallbackNeedsConsent('kilo-cohere', 'ovh-120b'), false);
  assert.equal(fallbackNeedsConsent(undefined, 'kilo-auto'), false);
});

test('unknown engines count as may-collect', () => {
  assert.equal(fallbackNeedsConsent('ovh-120b', 'something-new'), true);
});

test('the sensitive-data check sees user text and files, not web pages', () => {
  const page = { role: 'user', content: 'RESULT of OPEN: x\n\ncontact@page.com' };
  const text = userTextOf([
    { role: 'system', content: 'sys me@sys.com' },
    { role: 'user', content: 'my card 4111 1111 1111 1111' },
    { role: 'assistant', content: 'ok' },
    page,
    { role: 'user', content: 'RESULT of READ: a.md\n\nme@home.com' },
  ], new Set([page]));
  assert.match(text, /4111/);
  assert.match(text, /me@home\.com/);
  assert.doesNotMatch(text, /page\.com|sys\.com/);
});
