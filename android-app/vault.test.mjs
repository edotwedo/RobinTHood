// node --test android-app/vault.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { findEntry, isVault, resolveEntry, safTreeHooks, vaultActive, walkTree } from './vault.js';

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

test('findEntry: a folder path never falls back to a same-named note elsewhere', () => {
  const entries = [{ name: 'Personal/Budget.md' }];
  assert.equal(findEntry(entries, 'Missing/Budget.md'), undefined);
  assert.equal(findEntry(entries, 'personal/budget').name, 'Personal/Budget.md');
});

test('resolveEntry: a bare name shared by several notes is ambiguous, not first-match', () => {
  const entries = [{ name: 'Personal/Budget.md' }, { name: 'Work/Budget.md' }];
  assert.equal(findEntry(entries, 'Budget'), undefined);
  assert.deepEqual(resolveEntry(entries, '[[Budget]]').ambiguous, ['Personal/Budget.md', 'Work/Budget.md']);
  assert.equal(findEntry(entries, 'Work/Budget').name, 'Work/Budget.md');
});

test('walkTree: dotted folders such as Project.v1 are walked, not treated as files', async () => {
  const tree = { '/': ['Project.v1', 'a.md'], '/Project.v1/': ['plan.md'] };
  const out = await walkTree('/', {
    list: async (d) => tree[d].map((name) => ({ uri: d + name, name })),
    isDir: async (e) => e.name === 'Project.v1',
    childOf: (d, e) => d + e.name + '/',
  });
  assert.deepEqual(out.map((e) => e.name).sort(), ['Project.v1/plan.md', 'a.md']);
});

test('vaultActive: All-files build uses the vault once connected', () => {
  assert.equal(vaultActive({ obsidianVault: 'Documents/Obsidian', filesUri: 'x' }, true), true);
  assert.equal(vaultActive({ obsidianVault: '' }, true), false);
});

test('vaultActive: picked folder must still be the vault', () => {
  assert.equal(vaultActive({ obsidianVault: 'content://v', filesUri: 'content://v' }, false), true);
  assert.equal(vaultActive({ obsidianVault: 'content://v', filesUri: 'content://other' }, false), false);
  assert.equal(vaultActive(undefined, false), false);
});

test('safTreeHooks: folders are found by listing them, not by getInfo (which says false on SAF)', async () => {
  // content:// style tree: a folder URI lists its children; a file URI throws, as SAF does.
  const tree = {
    'tree:root': ['tree:root/Work', 'tree:root/Personal', 'tree:root/Archive.md', 'tree:root/Project.v1', 'tree:root/Inbox.md', 'tree:root/.obsidian'],
    'tree:root/Work': ['tree:root/Work/Budget.md'],
    'tree:root/Personal': ['tree:root/Personal/Budget.md'],
    'tree:root/Archive.md': ['tree:root/Archive.md/old.md'],
    'tree:root/Project.v1': ['tree:root/Project.v1/plan.md'],
    'tree:root/.obsidian': ['tree:root/.obsidian/app.json'],
  };
  let reads = 0;
  const readDir = async (uri) => {
    reads++;
    if (!tree[uri]) throw new Error('not a directory');
    return tree[uri];
  };
  const out = await walkTree('tree:root', safTreeHooks(readDir, (u) => u.split('/').pop()));
  assert.deepEqual(out.map((e) => e.name).sort(),
    ['Archive.md/old.md', 'Inbox.md', 'Personal/Budget.md', 'Project.v1/plan.md', 'Work/Budget.md']);
  assert.equal(findEntry(out, 'Work/Budget.md').uri, 'tree:root/Work/Budget.md');
  // root + 6 top-level checks + 4 files inside walked folders; a folder is never listed twice
  assert.equal(reads, 1 + 6 + 4);
});
