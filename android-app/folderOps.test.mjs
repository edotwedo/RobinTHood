import test from 'node:test';
import assert from 'node:assert/strict';
import { folderOps } from './folderOps.js';
import { walkTree } from './vault.js';

// An in-memory folder tree: keys ending in "/" are folders, others are files with text.
function memFolder(files) {
  const fs = new Map(Object.entries(files));
  const io = {
    entries: () => walkTree('/', {
      list: async (dir) => {
        const names = new Set();
        for (const k of fs.keys()) {
          if (!k.startsWith(dir) || k === dir) continue;
          names.add(k.slice(dir.length).split('/')[0] + (k.slice(dir.length).includes('/') ? '/' : ''));
        }
        return [...names].map((n) => ({ uri: dir + n, name: n.replace(/\/$/, '') }));
      },
      isDir: async (e) => e.uri.endsWith('/'),
      childOf: (_d, e) => e.uri,
    }),
    size: (uri) => (fs.get(uri) || '').length,
    readText: async (uri) => fs.get(uri),
    writeText: async (uri, text) => { fs.set(uri, text); },
    create: async (fileName) => ({ uri: '/' + fileName, name: fileName }),
  };
  return { fs, ops: folderOps(io) };
}

test('APPEND to Work/Budget.md lands in Work/Budget.md, not a top-level Budget.md', async () => {
  const { fs, ops } = memFolder({ '/Budget.md': 'PERSONAL', '/Work/': '', '/Work/Budget.md': 'WORK' });
  const res = await ops.append('Work/Budget.md', 'NEW WORK ITEM');
  assert.equal(res.name, 'Work/Budget.md');
  assert.equal(res.appended, true);
  assert.match(fs.get('/Work/Budget.md'), /WORK[\s\S]*NEW WORK ITEM/);
  assert.equal(fs.get('/Budget.md'), 'PERSONAL');
});

test('READ / exists / WRITE keep the folder', async () => {
  const { fs, ops } = memFolder({ '/Budget.md': 'PERSONAL', '/Work/': '', '/Work/Budget.md': 'WORK' });
  assert.equal(await ops.read('Work/Budget.md'), 'WORK');
  assert.equal(await ops.exists('Work/Budget'), true);
  assert.equal(await ops.exists('Missing/Budget.md'), false);
  const w = await ops.write('Work/Budget.md', 'REPLACED');
  assert.deepEqual([w.name, w.replaced], ['Work/Budget.md', true]);
  assert.equal(fs.get('/Budget.md'), 'PERSONAL');
});

test('a bare name shared by two notes is refused for READ and APPEND', async () => {
  const { fs, ops } = memFolder({ '/A/': '', '/A/Budget.md': 'a', '/B/': '', '/B/Budget.md': 'b' });
  await assert.rejects(ops.read('Budget'), /several notes/);
  await assert.rejects(ops.append('Budget.md', 'x'), /several notes/);
  assert.deepEqual([fs.get('/A/Budget.md'), fs.get('/B/Budget.md')], ['a', 'b']);
});

test('a new foldered note never overwrites a top-level note of the same name', async () => {
  const { fs, ops } = memFolder({ '/Idea.md': 'KEEP' });
  await assert.rejects(ops.write('New/Idea.md', 'x'), /already exists/);
  assert.equal(fs.get('/Idea.md'), 'KEEP');
});

test('folders named like files (Archive.md/) are walked by their directory flag', async () => {
  const { ops } = memFolder({ '/Archive.md/': '', '/Archive.md/old.md': 'old', '/Project.v1/': '', '/Project.v1/plan.md': 'p' });
  assert.deepEqual(await ops.list(), ['Archive.md/old.md', 'Project.v1/plan.md']);
});
