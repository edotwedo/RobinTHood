// node --test android-app/append.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUT_OFF_RE, appendVia, checkFileAction, prepareAppendContent, truncateFileContent } from './actions.js';

test('QA P1 REPRO: truncateFileContent truncates on finite limit but preserves full text with Infinity', () => {
  const longText = 'A'.repeat(15000);

  // Model READ defaults to 12000 chars: cut off marker appended
  const truncated = truncateFileContent(longText, 12000);
  assert.equal(truncated.length, 12000 + '\n\n[cut off: file is 15000 characters]'.length);
  assert.match(truncated, CUT_OFF_RE);

  // APPEND requires Infinity: must NOT truncate or inject cut-off marker
  const full = truncateFileContent(longText, Infinity);
  assert.equal(full.length, 15000);
  assert.equal(full, longText);
  assert.equal(CUT_OFF_RE.test(full), false);
});

test('QA P1 REPRO: appendVia with truncating read reproduces truncation bug if Infinity omitted, preserves file if Infinity used', async () => {
  // Reproducing the bug:
  // Before fix: appendFile called readFile(dir, name) with default maxChars = 12000,
  // losing characters 12001..20000 and planting "[cut off: file is 20000 characters]" into the file.
  const storage = new Map();
  const original20k = 'Header line\n' + 'X'.repeat(20000) + '\nFooter line\n';
  storage.set('notes.md', original20k);

  // reader simulates readFile/readAll: defaults to 12000 maxChars when maxChars is omitted or finite
  const truncatingRead = async (name, maxChars = 12000) => {
    return truncateFileContent(storage.get(name) || '', maxChars);
  };
  const write = async (name, text) => {
    storage.set(name, text);
    return { name, chars: text.length, replaced: true };
  };
  const exists = async (name) => storage.has(name);

  // 1. Reproduce bug: if append implementation calls read(name) without Infinity:
  const buggyAppend = async (name, addition) => {
    const had = await exists(name);
    // Bug: omitted Infinity -> read defaulted to 12000 and truncated!
    const body = had ? prepareAppendContent(await truncatingRead(name), addition) : addition;
    return write(name, body);
  };

  await buggyAppend('notes.md', '- New entry');
  const corrupted = storage.get('notes.md');
  assert.match(corrupted, CUT_OFF_RE, 'Bug reproduced: omitted Infinity caused cut-off marker');
  assert.ok(corrupted.length < original20k.length, 'Bug reproduced: file truncated to ~12k');

  // 2. Verified fix using appendVia:
  storage.set('notes.md', original20k);
  const res = await appendVia({ exists, read: truncatingRead, write }, 'notes.md', '- New log entry appended');
  assert.equal(res.appended, true);
  // Nit verification: appendVia must drop replaced from the result
  assert.equal(res.replaced, undefined, 'replaced must not be returned on append');
  const saved = storage.get('notes.md');
  assert.equal(saved.length, original20k.length + '- New log entry appended'.length);
  assert.doesNotMatch(saved, CUT_OFF_RE, 'Fixed code does not inject cut off marker');
  assert.ok(saved.startsWith('Header line\n'));
  assert.ok(saved.endsWith('- New log entry appended'));
});

test('appendVia creates new file when target does not exist', async () => {
  const storage = new Map();
  let readCalled = false;
  const read = async (name, maxChars) => {
    readCalled = true;
    return storage.get(name) || '';
  };
  const write = async (name, text) => {
    storage.set(name, text);
    return { name, chars: text.length };
  };
  const exists = async (name) => storage.has(name);

  const res = await appendVia({ exists, read, write }, 'new.md', 'Brand new content');
  assert.equal(res.appended, false);
  assert.equal(res.replaced, undefined);
  assert.equal(readCalled, false, 'read must not be called when file does not exist');
  assert.equal(storage.get('new.md'), 'Brand new content');
});

test('prepareAppendContent handles edge cases: newlines, empty existing, and clean separation', () => {
  // Existing with trailing newline
  assert.equal(prepareAppendContent('hello\n', 'world'), 'hello\nworld');
  // Existing without trailing newline
  assert.equal(prepareAppendContent('hello', 'world'), 'hello\nworld');
  // Empty or missing existing file (new file creation on append)
  assert.equal(prepareAppendContent('', 'first line'), 'first line');
  assert.equal(prepareAppendContent(null, 'first line'), 'first line');
  assert.equal(prepareAppendContent(undefined, 'first line'), 'first line');
});

test('Agent refusal: checkFileAction guards WRITE and APPEND correctly', () => {
  const partialFiles = new Set(['big_note.md']);

  // 1. Refuse APPEND if content contains cut-off marker
  assert.throws(
    () => checkFileAction({ kind: 'APPEND', arg: 'big_note.md', body: 'text\n[cut off: file is 15000 characters]\nmore' }, { partialFiles }),
    /append rejected: content contains cut off marker/
  );

  // 2. Allow safe APPEND even if the file is in partialFiles (append doesn't overwrite unseen parts)
  assert.doesNotThrow(
    () => checkFileAction({ kind: 'APPEND', arg: 'big_note.md', body: 'safe append line' }, { partialFiles })
  );

  // 3. Refuse WRITE if file is in partialFiles
  assert.throws(
    () => checkFileAction({ kind: 'WRITE', arg: 'big_note.md', body: 'overwriting content' }, { partialFiles }),
    /is longer than Robin can read at once.*Writing it would delete the rest/
  );

  // 4. Refuse WRITE if body contains cut-off marker
  assert.throws(
    () => checkFileAction({ kind: 'WRITE', arg: 'other.md', body: 'preview\n[cut off: file is 14000 characters]' }, { partialFiles }),
    /is longer than Robin can read at once.*Writing it would delete the rest/
  );

  // 5. Allow normal WRITE on non-partial files
  assert.doesNotThrow(
    () => checkFileAction({ kind: 'WRITE', arg: 'clean.md', body: 'clean content' }, { partialFiles })
  );
});
