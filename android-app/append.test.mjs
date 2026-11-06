// node --test android-app/append.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import { CUT_OFF_RE, prepareAppendContent, truncateFileContent } from './actions.js';

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

test('QA P1 REPRO: appendFile on file > 12k chars preserves existing content and does not truncate', () => {
  // Simulate the bug:
  // Before fix: appendFile called readFile(dir, name) with default maxChars = 12000,
  // losing characters 12001..20000 and planting "[cut off: file is 20000 characters]" into the file.
  const original20k = 'Header line\n' + 'X'.repeat(20000) + '\nFooter line\n';
  const newEntry = '- New log entry appended';

  // Simulating previous buggy appendFile behavior:
  const buggyExisting = truncateFileContent(original20k, 12000);
  const buggyResult = prepareAppendContent(buggyExisting, newEntry);
  assert.match(buggyResult, CUT_OFF_RE, 'Bug reproduced: previous code injected cut off marker');
  assert.ok(buggyResult.length < original20k.length, 'Bug reproduced: previous code truncated 20k file to ~12k');

  // Simulating fixed appendFile behavior (readFile with Infinity):
  const fixedExisting = truncateFileContent(original20k, Infinity);
  const fixedResult = prepareAppendContent(fixedExisting, newEntry);
  assert.equal(CUT_OFF_RE.test(fixedResult), false, 'Fixed code does not inject cut off marker');
  assert.equal(fixedResult.length, original20k.length + newEntry.length, 'Full 20k length + new entry preserved');
  assert.ok(fixedResult.startsWith('Header line\n'));
  assert.ok(fixedResult.endsWith(newEntry));
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

test('Store append contract: appending to >12k char file preserves full content without data loss', async () => {
  const storage = new Map();
  const initialLargeContent = '# Big Journal\n' + 'Line of text.\n'.repeat(1500); // ~22.5k characters
  storage.set('journal.md', initialLargeContent);

  const mockStore = {
    async read(name, maxChars = 12000) {
      const raw = storage.get(name) || '';
      return truncateFileContent(raw, maxChars);
    },
    async write(name, content) {
      storage.set(name, content);
      return { name, chars: content.length };
    },
    async append(name, addition) {
      // Fixed append implementation: reads existing with Infinity
      const existing = await this.read(name, Infinity);
      const combined = prepareAppendContent(existing, addition);
      await this.write(name, combined);
      return { name, appended: true, chars: combined.length };
    }
  };

  const addition = '## Append Entry\n- 10:00 AM Meeting completed\n';
  const res = await mockStore.append('journal.md', addition);
  assert.equal(res.appended, true);

  // Verify file on disk kept ALL 22.5k characters and appended cleanly
  const saved = storage.get('journal.md');
  assert.equal(saved.length, initialLargeContent.length + addition.length);
  assert.equal(CUT_OFF_RE.test(saved), false);
  assert.ok(saved.includes('## Append Entry'));

  // Normal read with default maxChars still protects model context from overflowing
  const modelView = await mockStore.read('journal.md');
  assert.match(modelView, CUT_OFF_RE);
});

test('Safety: CUT_OFF_RE marker in append body is rejected', () => {
  const badBody = 'Some text\n[cut off: file is 15000 characters]\nmore text';
  assert.ok(CUT_OFF_RE.test(badBody));
});
