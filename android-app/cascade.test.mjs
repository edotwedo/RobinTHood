// node --test android-app/cascade.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { engineOrder, fallbackNeedsConsent, userTextOf } from './cascade.js';

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

test('engineOrder strictly restricts to local ollama when air-gapped', () => {
  assert.deepEqual(engineOrder({ airGapped: true }), ['ollama']);
  assert.deepEqual(engineOrder({ airGapped: true, selectedModel: 'ovh-120b', ollamaUrl: 'http://127.0.0.1:11434' }), ['ollama']);
  // When not air-gapped, cascade includes chosen and keyless engines
  const normal = engineOrder({ selectedModel: 'ovh-120b' });
  assert.equal(normal[0], 'ovh-120b');
  assert.ok(normal.length > 1);
});

// PLAN 1.1 check: without the user's OK, a model with no * never reaches a * engine.
// (agent.js fallbackAllowed blocks a step down unless confirmFallback says yes.)
const reachableWithoutConsent = (settings) =>
  engineOrder(settings).filter((id) => !fallbackNeedsConsent(settings.selectedModel || 'auto', id));

test('chosen ovh-120b never yields a kilo-* engine without consent; Auto does', () => {
  const keys = { ollamaUrl: 'http://192.168.1.5:11434', openRouterKey: 'k' };
  const chosen = reachableWithoutConsent({ ...keys, selectedModel: 'ovh-120b' });
  assert.ok(chosen.includes('ovh-120b'));
  assert.equal(chosen.some((id) => id.startsWith('kilo-') || id === 'openrouter'), false);
  const auto = reachableWithoutConsent({ ...keys, selectedModel: 'auto' });
  assert.ok(auto.some((id) => id.startsWith('kilo-')));
});

test('chosen ollama stays home without consent', () => {
  assert.deepEqual(reachableWithoutConsent({ selectedModel: 'ollama', ollamaUrl: 'http://10.0.0.2:11434' }), ['ollama']);
});
