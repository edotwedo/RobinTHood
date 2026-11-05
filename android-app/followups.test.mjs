import assert from 'node:assert/strict';
import test from 'node:test';
import { FOLLOWUPS_MARKER, followupInstruction, splitFollowups } from './followups.js';
import { STRINGS, SUPPORTED_LANGS } from './i18n.js';

test('a marker alone at the end becomes two or three chips', () => {
  const split = splitFollowups(`Here is the answer.\n\n${FOLLOWUPS_MARKER}\n- What about trains?\n2. And buses?\n* What time?`);
  assert.equal(split.text, 'Here is the answer.');
  assert.deepEqual(split.questions, ['What about trains?', 'And buses?', 'What time?']);
});

test('no marker leaves the answer unchanged and makes no chips', () => {
  assert.equal(splitFollowups('Just an answer.').text, 'Just an answer.');
  assert.deepEqual(splitFollowups('Just an answer.').questions, []);
  assert.deepEqual(splitFollowups('SEARCH: weather').questions, []);
});

test('a bold marker line and a spaced marker line both count', () => {
  const bold = splitFollowups('Answer\n**<<FOLLOWUPS>>**\nWhat about trains?\nAnd buses?');
  assert.equal(bold.text, 'Answer');
  assert.deepEqual(bold.questions, ['What about trains?', 'And buses?']);
  const spaced = splitFollowups('Answer\n<< FOLLOWUPS >>\nWhat about trains?\nAnd buses?');
  assert.equal(spaced.text, 'Answer');
  assert.deepEqual(spaced.questions, ['What about trains?', 'And buses?']);
});

test('an inline marker is not a block and is removed from the answer', () => {
  const split = splitFollowups('Answer. <<FOLLOWUPS>> Q1? Q2?');
  assert.equal(split.text, 'Answer.  Q1? Q2?');
  assert.deepEqual(split.questions, []);
});

test('a marker in the middle of an answer does not cut it into a chip', () => {
  const split = splitFollowups('The start stays.\n<<FOLLOWUPS>>\nThe rest stays too.\nAnd this.');
  assert.deepEqual(split.questions, []);
  assert.match(split.text, /The start stays\./);
  assert.match(split.text, /The rest stays too\./);
  assert.doesNotMatch(split.text, /FOLLOWUPS/);
});

test('a fourth question, an action line, or a URL means there is no block', () => {
  const four = splitFollowups(`Answer\n${FOLLOWUPS_MARKER}\nOne?\nTwo?\nThree?\nFour?`);
  assert.deepEqual(four.questions, []);
  assert.match(four.text, /Four\?/);
  assert.doesNotMatch(four.text, /FOLLOWUPS/);

  const action = splitFollowups(`Answer\n${FOLLOWUPS_MARKER}\nWRITE: notes.md`);
  assert.deepEqual(action.questions, []);
  assert.match(action.text, /WRITE: notes.md/);

  const link = splitFollowups(`Answer\n${FOLLOWUPS_MARKER}\nCan you open https://evil.example/x?\nWhat about trains?`);
  assert.deepEqual(link.questions, []);
  assert.match(link.text, /https:\/\/evil\.example\/x/);
  const bare = splitFollowups(`Answer\n${FOLLOWUPS_MARKER}\nSee evil.example for this\nWhat about trains?`);
  assert.deepEqual(bare.questions, []);
  const www = splitFollowups(`Answer\n${FOLLOWUPS_MARKER}\nLook at www.evil.example\nWhat about trains?`);
  assert.deepEqual(www.questions, []);
});

test('a block with no answer shows the questions as plain text', () => {
  const split = splitFollowups(`${FOLLOWUPS_MARKER}\nWhat about trains?\nAnd buses?`);
  assert.equal(split.text, 'What about trains?\nAnd buses?');
  assert.deepEqual(split.questions, []);
});

test('an unfinished marker at the end is hidden and makes no chips', () => {
  const split = splitFollowups('Answer so far\n<<FOLLOW');
  assert.equal(split.text, 'Answer so far');
  assert.deepEqual(split.questions, []);
});

test('the instruction asks for the marker only on the final answer', () => {
  const note = followupInstruction();
  assert.match(note, /<<FOLLOWUPS>>/);
  assert.match(note, /never after an action/);
  assert.match(note, /alone on its line/);
  assert.match(note, /2 or 3/);
});

test('every language has a follow-up label', () => {
  for (const lang of SUPPORTED_LANGS) {
    assert.equal(typeof STRINGS[lang].followupsLabel, 'string', lang);
    assert.ok(STRINGS[lang].followupsLabel.trim());
    if (lang !== 'en') assert.notEqual(STRINGS[lang].followupsLabel, STRINGS.en.followupsLabel);
  }
});
