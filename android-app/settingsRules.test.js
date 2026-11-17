import test from 'node:test';
import assert from 'node:assert/strict';
import { applyLocalOnlyToggle, defaultSettings, folderPromptAction } from './settingsRules.js';

test('default settings start with background music off (S-01)', () => {
  const settings = defaultSettings();
  assert.equal(settings.music, false);
});

test('local-only restores web search that was on', () => {
  const on = applyLocalOnlyToggle({ airGapped: false, webSearch: true, selectedModel: 'ovh-120b' });
  assert.equal(on.airGapped, true);
  assert.equal(on.webSearch, false);
  assert.equal(on.webSearchBeforeLocal, true);
  const off = applyLocalOnlyToggle(on);
  assert.equal(off.airGapped, false);
  assert.equal(off.webSearch, true);
});

test('local-only keeps web search off when it was already off', () => {
  const on = applyLocalOnlyToggle({ airGapped: false, webSearch: false, selectedModel: 'ovh-120b' });
  const off = applyLocalOnlyToggle(on);
  assert.equal(off.webSearch, false);
});

test('a chat send does not ask for a folder', () => {
  assert.equal(folderPromptAction({ filesUri: '', folderSkipped: false }, { prompt: false }), 'skip');
});

test('a file action asks once, then a skip sticks', () => {
  assert.equal(folderPromptAction({ filesUri: '' }, { prompt: true }), 'ask');
  assert.equal(folderPromptAction({ filesUri: '', folderSkipped: true }, { prompt: true }), 'skip');
  assert.equal(folderPromptAction({ filesUri: 'content://folder' }, { prompt: true }), 'use');
});
