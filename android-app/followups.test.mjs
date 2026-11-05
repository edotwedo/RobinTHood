import assert from 'node:assert/strict';
import test from 'node:test';
import { FOLLOWUPS_MARKER, followupInstruction, splitFollowups } from './followups.js';
import { STRINGS, SUPPORTED_LANGS } from './i18n.js';

test('a final marker becomes up to three chips and leaves the answer', () => {
  const split = splitFollowups(`Here is the answer.\n\n${FOLLOWUPS_MARKER}\n- What about trains?\n2. And buses?\n* What about trains?\nFourth one\nFifth`);
  assert.equal(split.text, 'Here is the answer.');
  assert.deepEqual(split.questions, ['What about trains?', 'And buses?', 'Fourth one']);
});

test('an unfinished marker at the end is hidden and makes no chips', () => {
  const split = splitFollowups('Answer so far\n<<FOLLOW');
  assert.equal(split.text, 'Answer so far');
  assert.deepEqual(split.questions, []);
});

test('action lines and a reply with no marker make no chips', () => {
  assert.deepEqual(splitFollowups('SEARCH: weather').questions, []);
  assert.equal(splitFollowups('Just an answer.').text, 'Just an answer.');
  const split = splitFollowups(`Answer\n${FOLLOWUPS_MARKER}\nWRITE: notes.md\nOK but this is far too long ${'x'.repeat(200)}`);
  assert.deepEqual(split.questions, []);
  assert.equal(split.text, 'Answer');
});

test('the instruction asks for the marker only on the final answer', () => {
  const note = followupInstruction();
  assert.match(note, /<<FOLLOWUPS>>/);
  assert.match(note, /never after an action/);
  assert.match(note, /2 or 3/);
});

test('every language has a follow-up label', () => {
  for (const lang of SUPPORTED_LANGS) {
    assert.equal(typeof STRINGS[lang].followupsLabel, 'string', lang);
    assert.ok(STRINGS[lang].followupsLabel.trim());
    if (lang !== 'en') assert.notEqual(STRINGS[lang].followupsLabel, STRINGS.en.followupsLabel);
  }
});
