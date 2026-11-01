// node --test android-app/markdown.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBlocks, parseInline } from './markdown.js';

const types = (md) => parseBlocks(md).map((b) => b.type);

test('headings, paragraphs, rules and quotes', () => {
  const b = parseBlocks('# Title\n\nSome text\nmore text\n\n---\n> quoted\n> again\n### Small ###');
  assert.deepEqual(b.map((x) => x.type), ['heading', 'para', 'hr', 'quote', 'heading']);
  assert.equal(b[0].level, 1);
  assert.equal(b[0].text, 'Title');
  assert.equal(b[1].text, 'Some text\nmore text');
  assert.equal(b[3].text, 'quoted\nagain');
  assert.equal(b[4].level, 3);
  assert.equal(b[4].text, 'Small');
});

test('bullet and numbered lists with nesting and wrapped lines', () => {
  const b = parseBlocks('- one\n  - nested\n* two\n  continues here\n1. first\n2) second');
  assert.deepEqual(b.map((x) => [x.type, x.ordered, x.depth, x.text, x.number]), [
    ['item', false, 0, 'one', undefined],
    ['item', false, 1, 'nested', undefined],
    ['item', false, 0, 'two continues here', undefined],
    ['item', true, 0, 'first', 1],
    ['item', true, 0, 'second', 2],
  ]);
});

test('fenced code keeps its contents raw, even unclosed while streaming', () => {
  const b = parseBlocks('Run:\n```bash\nls **not bold**\n# not a heading\n```\nDone');
  assert.deepEqual(types('Run:\n```bash\nls\n```\nDone'), ['para', 'code', 'para']);
  assert.equal(b[1].lang, 'bash');
  assert.equal(b[1].text, 'ls **not bold**\n# not a heading');
  assert.equal(b[1].open, false);
  const open = parseBlocks('```js\nconst a = 1;');
  assert.equal(open[0].type, 'code');
  assert.equal(open[0].open, true);
  assert.equal(open[0].text, 'const a = 1;');
});

test('pipe tables, with ragged rows padded to the header', () => {
  const b = parseBlocks('| Plan | Price |\n|---|:--:|\n| Basic | $5 |\n| Pro |\nAfter');
  assert.equal(b[0].type, 'table');
  assert.deepEqual(b[0].header, ['Plan', 'Price']);
  assert.deepEqual(b[0].rows, [['Basic', '$5'], ['Pro', '']]);
  assert.equal(b[1].type, 'para');
  assert.deepEqual(types('a | b without a separator'), ['para']);
});

test('inline bold, italic, code, strike and links', () => {
  const s = parseInline('Use **bold** and *it* or _it_, `x*y`, ~~old~~ and [docs](https://ex.com/a).');
  const pick = (k) => s.filter((x) => x[k]).map((x) => x.text);
  assert.deepEqual(pick('bold'), ['bold']);
  assert.deepEqual(pick('italic'), ['it', 'it']);
  assert.deepEqual(pick('code'), ['x*y']);
  assert.deepEqual(pick('strike'), ['old']);
  assert.deepEqual(s.filter((x) => x.url).map((x) => [x.text, x.url]), [['docs', 'https://ex.com/a']]);
  assert.equal(s.map((x) => x.text).join(''), 'Use bold and it or it, x*y, old and docs.');
});

test('nested emphasis and bare URLs', () => {
  const s = parseInline('**bold with *italic* inside** see https://ex.com/p?q=1.');
  assert.ok(s.some((x) => x.bold && x.italic && x.text === 'italic'));
  const url = s.find((x) => x.url);
  assert.equal(url.url, 'https://ex.com/p?q=1');
});

test('unsafe link targets render as plain text, not links', () => {
  for (const md of ['[click](javascript:alert(1))', '[x](intent://evil)', '[f](file:///etc/passwd)']) {
    assert.ok(parseInline(md).every((x) => !x.url), md);
  }
});

test('things that are not markup stay literal', () => {
  const plain = (t) => parseInline(t).map((x) => x.text).join('');
  assert.equal(plain('2 * 3 * 4 = 24'), '2 * 3 * 4 = 24');
  assert.equal(plain('snake_case_name and file_v2_final'), 'snake_case_name and file_v2_final');
  assert.equal(plain('a \\*literal\\* star'), 'a *literal* star');
  assert.ok(parseInline('2 * 3 * 4').every((x) => !x.italic));
  assert.deepEqual(types(''), []);
  assert.deepEqual(types('#hashtag not heading'), ['para']);
});
