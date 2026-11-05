import assert from 'node:assert/strict';
import test from 'node:test';
import { STRINGS, SUPPORTED_LANGS } from './i18n.js';

const privacyKeys = Object.keys(STRINGS.en).filter((k) => k.startsWith('privacy'));

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
