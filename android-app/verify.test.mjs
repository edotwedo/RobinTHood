// node --test android-app/verify.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { checkability, splitClaims, support, verifyAnswer } from './verify.js';

const EV = [
  { url: 'https://example.org/tower', text: 'The Eiffel Tower is 330 metres tall. It was completed in March 1889 for the World\'s Fair in Paris.' },
  { url: 'https://news.example.com/ferry', text: 'The ferry to Bainbridge Island leaves every 50 minutes. Tickets cost $10.25 for adults.' },
];

test('splitClaims skips code, headings, questions, lead-ins and fragments', () => {
  const text = '## Answer\nThe tower is 330 metres tall. Want more?\nHere is what I found:\n- It opened in March 1889 in Paris.\n```\nconst x = 1;\n```\nYes.';
  assert.deepEqual(splitClaims(text), ['The tower is 330 metres tall.', 'It opened in March 1889 in Paris.']);
});

test('checkability: numbers, dates, quotes and names are specific; hedges and advice are opinion', () => {
  assert.equal(checkability('The tower is 330 metres tall.'), 'specific');
  assert.equal(checkability('It opened in March of that year.'), 'specific');
  assert.equal(checkability('The mayor said "we will rebuild the bridge" on air.'), 'specific');
  assert.equal(checkability('The ferry goes to Bainbridge Island from the pier.'), 'specific');
  assert.equal(checkability('You should probably book ahead in summer.'), 'opinion');
  assert.equal(checkability('It may be crowded on weekends.'), 'opinion', 'the word "may" is not the month');
  assert.equal(checkability('Ferries are a common way to cross the water.'), 'general');
});

test('support: a claim the sources state is supported, a changed number is not', () => {
  assert.equal(support('The Eiffel Tower is 330 metres tall.', EV).level, 'supported');
  assert.equal(support('The Eiffel Tower is 330 metres tall.', EV).url, 'https://example.org/tower');
  const wrong = support('The Eiffel Tower is 300 metres tall.', EV);
  assert.equal(wrong.level, 'partial');
  assert.deepEqual(wrong.missing, ['300']);
  assert.equal(support('Adult tickets cost $10.25 on the ferry.', EV).level, 'supported');
  assert.equal(support('The Louvre holds the Mona Lisa and 35,000 works.', EV).level, 'unsupported');
});

test('support: a sentence that links a source is judged against that source only', () => {
  const s = 'The tower was completed in March 1889 ([source](https://news.example.com/ferry)).';
  const r = support(s, EV);
  assert.equal(r.cited, true);
  assert.equal(r.level, 'unsupported', 'the linked ferry page does not back a claim about the tower');
  const ok = support('The tower was completed in March 1889 (https://example.org/tower).', EV);
  assert.equal(ok.cited, true);
  assert.equal(ok.level, 'supported');
});

test('support: thousands separators and missing quotes', () => {
  const ev = [{ url: 'https://a.example', text: 'Attendance reached 12000 people. The chief said "no comment" to reporters.' }];
  assert.equal(support('Attendance reached 12,000 people.', ev).level, 'supported');
  assert.equal(support('The chief said "we are investigating" to reporters.', ev).level, 'partial');
});

test('verifyAnswer: null with no evidence, counts and claims otherwise', () => {
  assert.equal(verifyAnswer('The Eiffel Tower is 330 metres tall.', []), null);
  assert.equal(verifyAnswer('You should go early.', EV), null, 'opinion only: nothing to label');
  const v = verifyAnswer('The Eiffel Tower is 330 metres tall. It was finished in March 1901. You should go early.', EV);
  assert.deepEqual(v.counts, { supported: 1, partial: 1, unsupported: 0, opinion: 1 });
  assert.equal(v.claims[1].level, 'partial');
  assert.deepEqual(v.claims[1].missing, ['1901']);
});

test('verifyAnswer merges evidence for the same url and caps stored claim text', () => {
  const ev = [{ url: 'https://x.example', text: 'Bridge reopened Monday.' }, { url: 'https://x.example', text: 'Repairs cost 4 million dollars.' }];
  const v = verifyAnswer('The bridge repairs cost 4 million dollars.', ev);
  assert.equal(v.claims[0].level, 'supported');
  const long = verifyAnswer('The Eiffel Tower is 330 metres tall ' + 'and very tall '.repeat(30) + '.', EV);
  assert.ok(long.claims[0].text.length <= 160);
});

test('a long pasted answer stays fast', () => {
  const big = ('The ferry to Bainbridge Island leaves every 50 minutes. ').repeat(2000);
  const t0 = Date.now();
  verifyAnswer(big, EV);
  assert.ok(Date.now() - t0 < 1500, `took ${Date.now() - t0} ms`);
});
