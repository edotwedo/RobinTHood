// node --test android-app/noteIndex.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { sanitizeFts5Query, chunkMarkdown, getNoteDb, indexNote, removeNote, searchFts, syncNoteIndex } from './noteIndex.js';

test('sanitizeFts5Query safely tokenizes and protects against FTS syntax errors', () => {
  assert.equal(sanitizeFts5Query(''), '');
  assert.equal(sanitizeFts5Query('   '), '');
  assert.equal(sanitizeFts5Query('workout'), '"workout"*');
  assert.equal(sanitizeFts5Query('chest day routine'), '"chest" "day" "routine"*');
  assert.equal(sanitizeFts5Query('router: "password" * NEAR/2'), '"router" "password" "NEAR" "2"*');
  assert.equal(sanitizeFts5Query('C++ in 2026!'), '"C" "in" "2026"*');
});

test('chunkMarkdown preserves headings, lines, and splits on blank lines or headers', () => {
  const md = `# Project Plan
We need to refactor App.js and build FTS5.

## Architecture
- SQLite FTS5 for local notes
- Clean UI components

## Testing
Run node --test *.test.mjs in CI.`;

  const chunks = chunkMarkdown(md);
  assert.equal(chunks.length, 3);
  assert.equal(chunks[0].heading, 'Project Plan');
  assert.equal(chunks[0].line, 1);
  assert.match(chunks[0].body, /refactor App\.js/);

  assert.equal(chunks[1].heading, 'Architecture');
  assert.equal(chunks[1].line, 4);
  assert.match(chunks[1].body, /SQLite FTS5/);

  assert.equal(chunks[2].heading, 'Testing');
  assert.equal(chunks[2].line, 8);
  assert.match(chunks[2].body, /node --test/);
});

test('SQLite FTS5 indexNote, searchFts, and removeNote work with BM25 ranking', async () => {
  const db = await getNoteDb('test_notes_fts.db');
  assert.ok(db, 'Adapter should be created');

  await indexNote(db, 'workout.md', `# Fitness Log\nDid 25 bench presses and 15 pushups today.\n\n## Cardio\nRan 3 miles outdoors.`);
  await indexNote(db, 'grocery.md', `# Grocery List\n- Milk\n- Apples\n- Almond butter`);
  await indexNote(db, 'ideas.md', `# App Ideas\nRobinTHood needs fast local markdown note search powered by SQLite FTS5.`);

  // Search single word with prefix
  const pushupHits = await searchFts(db, 'pushup', 5);
  assert.equal(pushupHits.length, 1);
  assert.equal(pushupHits[0].file, 'workout.md');
  assert.match(pushupHits[0].snippet, /pushup/i);

  // Search BM25 ranking
  const ideaHits = await searchFts(db, 'RobinTHood SQLite', 5);
  assert.equal(ideaHits.length, 1);
  assert.equal(ideaHits[0].file, 'ideas.md');
  assert.match(ideaHits[0].snippet, /SQLite/i);

  // Remove note and assert it is no longer returned
  await removeNote(db, 'workout.md');
  const emptyHits = await searchFts(db, 'pushup', 5);
  assert.equal(emptyHits.length, 0);

  // Cleanup
  await removeNote(db, 'grocery.md');
  await removeNote(db, 'ideas.md');
});

test('createFolderStore / createAllFilesStore polymorphism works as expected', async () => {
  const mockStorage = new Map();
  const mockFolderStore = {
    async list() { return Array.from(mockStorage.keys()); },
    async exists(path) { return mockStorage.has(path); },
    async read(path) { return mockStorage.get(path) || ''; },
    async write(path, content) { mockStorage.set(path, content); return { name: path, chars: content.length }; },
    async append(path, content) {
      const cur = mockStorage.get(path) || '';
      mockStorage.set(path, cur + content);
      return { name: path, appended: true };
    },
    async search(query) {
      const hits = [];
      for (const [f, body] of mockStorage.entries()) {
        if (body.includes(query)) hits.push({ file: f, line: 1, snippet: body });
      }
      return hits;
    }
  };

  assert.equal(await mockFolderStore.exists('a.md'), false);
  await mockFolderStore.write('a.md', 'hello world');
  assert.equal(await mockFolderStore.exists('a.md'), true);
  assert.equal(await mockFolderStore.read('a.md'), 'hello world');
  const results = await mockFolderStore.search('world');
  assert.equal(results.length, 1);
  assert.equal(results[0].file, 'a.md');
});

test('syncNoteIndex re-indexes a note edited outside the app (#44)', async () => {
  const db = await getNoteDb();
  const disk = { 'sync44.md': { text: 'old pineapple plan', mtime: 1000 } };
  const stat = async (n) => ({ mtime: disk[n].mtime });
  let reads = 0;
  const read = async (n) => { reads++; return disk[n].text; };
  const files = (hits) => hits.map((h) => h.file);

  await syncNoteIndex(db, ['sync44.md'], stat, read);
  assert.deepEqual(files(await searchFts(db, 'pineapple')), ['sync44.md']);

  // Unchanged mtime: no re-read.
  await syncNoteIndex(db, ['sync44.md'], stat, read);
  assert.equal(reads, 1);

  disk['sync44.md'] = { text: 'new mango plan', mtime: 2000 };
  await syncNoteIndex(db, ['sync44.md'], stat, read);
  assert.deepEqual(files(await searchFts(db, 'pineapple')), []);
  assert.deepEqual(files(await searchFts(db, 'mango')), ['sync44.md']);
  await removeNote(db, 'sync44.md');
});

test('syncNoteIndex falls back to text length when the provider reports no mtime', async () => {
  const db = await getNoteDb();
  let text = 'kiwi notes';
  const stat = async () => ({});
  await syncNoteIndex(db, ['sync44b.md'], stat, async () => text);
  text = 'papaya notes, longer now';
  await syncNoteIndex(db, ['sync44b.md'], stat, async () => text);
  assert.deepEqual((await searchFts(db, 'papaya')).map((h) => h.file), ['sync44b.md']);
  assert.deepEqual((await searchFts(db, 'kiwi')).map((h) => h.file), []);
  await removeNote(db, 'sync44b.md');
});
