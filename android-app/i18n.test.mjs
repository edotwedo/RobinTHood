import assert from 'node:assert/strict';
import test from 'node:test';
import { STRINGS, SUPPORTED_LANGS } from './i18n.js';

const privacyKeys = Object.keys(STRINGS.en).filter((k) => k.startsWith('privacy'));
const settingsKeys = Object.keys(STRINGS.en).filter((k) => k.startsWith('set'));

test('every language has the privacy screen strings', () => {
  assert.ok(privacyKeys.length >= 70);
  for (const lang of SUPPORTED_LANGS) {
    for (const key of privacyKeys) {
      const value = STRINGS[lang][key];
      assert.equal(typeof value, 'string', `${lang}.${key}`);
      assert.ok(value.trim().length > 0, `${lang}.${key} empty`);
    }
    if (lang !== 'en') {
      assert.notEqual(STRINGS[lang].privacyHow0, STRINGS.en.privacyHow0, lang);
      assert.notEqual(STRINGS[lang].privacyTitle, STRINGS.en.privacyTitle, lang);
    }
  }
});

test('every language has the settings screen strings', () => {
  assert.ok(settingsKeys.includes('setLocalOnly'));
  assert.ok(settingsKeys.includes('setLocalOnlyHint'));
  assert.equal(STRINGS.en.setLocalOnly, 'Local-only mode');
  assert.doesNotMatch(STRINGS.en.setLocalOnlyHint, /100% offline/);
  for (const lang of SUPPORTED_LANGS) {
    for (const key of settingsKeys) {
      const value = STRINGS[lang][key];
      assert.equal(typeof value, 'string', `${lang}.${key}`);
      assert.ok(value.trim().length > 0, `${lang}.${key} empty`);
    }
    if (lang !== 'en') {
      assert.notEqual(STRINGS[lang].setLocalOnly, STRINGS.en.setLocalOnly, lang);
      assert.notEqual(STRINGS[lang].setLocalOnlyHint, STRINGS.en.setLocalOnlyHint, lang);
    }
  }
});
