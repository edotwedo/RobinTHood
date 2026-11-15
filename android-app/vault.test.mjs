// node --test android-app/vault.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { findEntry, isVault, walkTree } from './vault.js';

// A fake folder tree: directories are objects, files are strings.
const tree = {
  '.obsidian': { 'app.json': '{}' },
  '.trash': { 'old.md': 'x' },
  'Inbox.md': 'hi',
  Projects: { 'Robin.md': 'r', Archive: { '2025.md': 'a' } },
  attachments: { 'pic.png': 'p' },
  README: 'no extension, still a file',
};
const at = (path) => path.split('/').filter(Boolean).reduce((n, k) => n[k], tree);
const io = {
  list: async (dir) => Object.keys(at(dir)).map((name) => ({ uri: `${dir}/${name}`, name })),
  isDir: async (e) => typeof at(e.uri) === 'object',
  childOf: (_dir, e) => e.uri,
};

test('walks subfolders, skips .obsidian / .trash, names are relative paths', async () => {
  const names = (await walkTree('', io)).map((e) => e.name).sort();
  assert.deepEqual(names, ['Inbox.md', 'Projects/Archive/2025.md', 'Projects/Robin.md', 'README', 'attachments/pic.png']);
});

test('depth and entry caps hold', async () => {
  const shallow = (await walkTree('', io, { maxDepth: 2 })).map((e) => e.name);
  assert.ok(!shallow.includes('Projects/Archive/2025.md'));
  assert.ok(shallow.includes('Projects/Robin.md'));
  assert.equal((await walkTree('', io, { maxEntries: 2 })).length, 2);
});

test('an unreadable subfolder hides only itself', async () => {
  const broken = { ...io, list: async (dir) => { if (dir === '/Projects') throw new Error('denied'); return io.list(dir); } };
  const names = (await walkTree('', broken)).map((e) => e.name);
  assert.ok(names.includes('Inbox.md'));
  assert.ok(!names.some((n) => n.startsWith('Projects/')));
});

test('findEntry: exact path, then basename, .md optional, [[link]] form', () => {
  const entries = [{ name: 'Inbox.md' }, { name: 'Projects/Robin.md' }];
  assert.equal(findEntry(entries, 'Projects/Robin.md').name, 'Projects/Robin.md');
  assert.equal(findEntry(entries, 'robin.md').name, 'Projects/Robin.md');
  assert.equal(findEntry(entries, 'Robin').name, 'Projects/Robin.md');
  assert.equal(findEntry(entries, '[[Robin]]').name, 'Projects/Robin.md');
  assert.equal(findEntry(entries, 'nope.md'), undefined);
  assert.equal(findEntry(entries, ''), undefined);
});

test('isVault looks for .obsidian at the top level', () => {
  assert.equal(isVault(['.obsidian', 'a.md']), true);
  assert.equal(isVault(['a.md']), false);
});
