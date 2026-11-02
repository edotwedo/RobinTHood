// node --test android-app/privacy.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { assess, detectSensitive, markFor, maskSensitive, mayCollect, privacyOf, SELF_CHECK } from './privacy.js';

const types = (t) => detectSensitive(t).map((f) => f.type);

test('every engine id in engines.js has a privacy entry, and Auto counts as may-collect', () => {
  const src = readFileSync(new URL('./engines.js', import.meta.url), 'utf8');
  const ids = [...src.matchAll(/\{ id: '([a-z0-9-]+)', label:/g)].map((m) => m[1]);
  assert.ok(ids.length >= 5, 'found the keyless engines');
  for (const id of ids) assert.notEqual(privacyOf(id).provider, 'Unknown', `${id} has no privacy entry`);
  assert.equal(markFor('ovh-120b'), '');
  assert.equal(markFor('kilo-auto'), '*');
  assert.equal(markFor('auto'), '*');
  assert.equal(mayCollect('ollama'), false);
  assert.equal(markFor('something-new'), '*', 'unknown engines default to the cautious mark');
});

test('finds emails, phones, SSNs, addresses and passwords', () => {
  assert.deepEqual(types('mail me at sam.doe@example.com'), ['email']);
  assert.deepEqual(types('call 253-555-0142 or (206) 555-0199'), ['phone', 'phone']);
  assert.deepEqual(types('my ssn is 123-45-6789'), ['ssn']);
  assert.deepEqual(types('I live at 1234 North Pine Street'), ['address']);
  assert.deepEqual(types('the password is hunter2!'), ['password']);
});

test('card numbers only count when they pass the Luhn check', () => {
  assert.deepEqual(types('card 4111 1111 1111 1111 thanks'), ['card']);
  assert.ok(!types('order 1234 5678 9012 3456').includes('card'));
});

test('finds API keys and tokens', () => {
  assert.deepEqual(types('key sk-abcdefghijklmnopqrstuvwx'), ['secret']);
  assert.deepEqual(types('key ' + ['sk', '_test', '_abcdefghijklmnopqrstuvwx'].join('') + ''), ['secret']);
  assert.deepEqual(types('token ghp_abcdefghijklmnopqrstuvwxyz0123'), ['secret']);
  assert.deepEqual(types('AKIAIOSFODNN7EXAMPLE'), ['secret']);
  assert.deepEqual(types('Bearer ya29.a0AfH6SMAAAAAAAAAAAAAAAAAAAAAAAAAAA'), ['secret']);
  assert.deepEqual(types('-----BEGIN RSA PRIVATE KEY-----'), ['secret']);
});

test('regex runs fast and safe on long base64 strings', () => {
  const longBase64 = 'A'.repeat(30000);
  const t0 = Date.now();
  assert.deepEqual(detectSensitive(longBase64), []);
  assert.ok(Date.now() - t0 < 100, 'scanned 30k base64 without regex freeze');
});

test('ordinary text, dates and versions are not flagged', () => {
  for (const t of ['What should I plant in May in Tacoma?', 'On 2026-11-02 version 0.7.8 shipped', 'It costs $49.99 for 3 months', 'Call it 2 * 3 * 4 = 24']) {
    assert.deepEqual(detectSensitive(t), [], t);
  }
});

test('masking replaces only the sensitive parts and counts them', () => {
  const r = maskSensitive('Email sam@ex.com, phone 253-555-0142, and plant tomatoes.');
  assert.equal(r.text, 'Email [EMAIL], phone [PHONE], and plant tomatoes.');
  assert.equal(r.count, 2);
  assert.equal(maskSensitive('nothing here').text, 'nothing here');
});

test('self check scores into three tiers', () => {
  const all = (n) => Object.fromEntries(SELF_CHECK.map((q) => [q.id, n]));
  assert.equal(assess(all(0)).tier, 'low');
  assert.equal(assess({ ...all(0), use: 1, paste: 1 }).tier, 'low');
  assert.equal(assess({ ...all(0), use: 2, paste: 1, harm: 1 }).tier, 'medium');
  assert.equal(assess(all(2)).tier, 'high');
  assert.equal(assess({}).tier, 'low', 'no answers yet');
});
