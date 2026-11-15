import test from 'node:test';
import assert from 'node:assert/strict';
import { parseNoteMeta } from './noteMeta.js';

test('parses wikilinks, aliases, headings, and dedupes', () => {
  const text = 'See [[Alpha]], [[Beta|bee]], [[Alpha#Section]], and [[Gamma]].';
  const meta = parseNoteMeta(text);
  assert.deepEqual(meta.links, ['Alpha', 'Beta', 'Gamma']);
});

test('parses inline tags but not markdown headings', () => {
  const text = '# Heading\nSome #project work and #project/subtag here.\n## Another #ignored? no';
  const meta = parseNoteMeta(text);
  assert.ok(meta.tags.includes('project'));
  assert.ok(meta.tags.includes('project/subtag'));
  assert.ok(!meta.tags.includes('Heading'));
  assert.ok(!meta.tags.includes('Another'));
});

test('parses YAML frontmatter key-values and list tags', () => {
  const text = `---
title: My Note
tags: [journal, ideas]
owner: "Phil"
---
Body with #inline.`;
  const meta = parseNoteMeta(text);
  assert.equal(meta.frontmatter.title, 'My Note');
  assert.equal(meta.frontmatter.owner, 'Phil');
  assert.deepEqual(meta.frontmatter.tags, ['journal', 'ideas']);
  assert.ok(meta.tags.includes('journal'));
  assert.ok(meta.tags.includes('ideas'));
  assert.ok(meta.tags.includes('inline'));
});

test('parses YAML frontmatter dash list tags', () => {
  const text = `---
tags:
  - work
  - android
---
content`;
  const meta = parseNoteMeta(text);
  assert.deepEqual(meta.frontmatter.tags, ['work', 'android']);
  assert.ok(meta.tags.includes('work'));
  assert.ok(meta.tags.includes('android'));
});

test('returns empty structures for plain text', () => {
  const meta = parseNoteMeta('just text, no meta');
  assert.deepEqual(meta, { links: [], tags: [], frontmatter: {} });
});

test('handles null/undefined input safely', () => {
  assert.deepEqual(parseNoteMeta(null), { links: [], tags: [], frontmatter: {} });
  assert.deepEqual(parseNoteMeta(undefined), { links: [], tags: [], frontmatter: {} });
});

test('ignores links and tags inside code', () => {
  const r = parseNoteMeta('real #keep [[Yes]]\n```js\nconst x = "#nope [[No]]";\n```\nand `#inline [[Nope]]`');
  assert.deepEqual(r.links, ['Yes']);
  assert.deepEqual(r.tags, ['keep']);
});
