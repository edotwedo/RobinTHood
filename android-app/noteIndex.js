// On-device SQLite FTS5 note search engine.
// Provides sub-millisecond, BM25-ranked full-text search across Markdown notes
// without loading files into context or paying token costs.

export function sanitizeFts5Query(query) {
  const tokens = (String(query || '').match(/[\p{L}\p{N}_-]+/gu) || [])
    .map((t) => t.replace(/["'*^:]/g, ''))
    .filter(Boolean);
  if (!tokens.length) return '';
  return tokens.map((t, idx) => (idx === tokens.length - 1 ? `"${t}"*` : `"${t}"`)).join(' ');
}

export function chunkMarkdown(text) {
  const lines = String(text || '').split('\n');
  const chunks = [];
  let currentHeading = '';
  let currentBlock = [];
  let startLine = 1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^#{1,6}\s+/.test(trimmed)) {
      if (currentBlock.length > 0) {
        chunks.push({ line: startLine, heading: currentHeading, body: currentBlock.join('\n').trim() });
        currentBlock = [];
      }
      currentHeading = trimmed.replace(/^#{1,6}\s+/, '');
      startLine = i + 1;
    } else if (trimmed === '') {
      if (currentBlock.length > 0) {
        chunks.push({ line: startLine, heading: currentHeading, body: currentBlock.join('\n').trim() });
        currentBlock = [];
        startLine = i + 2;
      } else {
        startLine = i + 2;
      }
    } else {
      currentBlock.push(line);
    }
  }

  if (currentBlock.length > 0) {
    chunks.push({ line: startLine, heading: currentHeading, body: currentBlock.join('\n').trim() });
  }

  return chunks.filter((c) => c.body && c.body.length > 0);
}

// Unified wrapper around expo-sqlite (React Native) or node:sqlite (Node / unit tests)
export async function createSqliteAdapter(dbPath = 'robin_notes_fts.db') {
  // Try expo-sqlite first
  try {
    const SQLite = await import('expo-sqlite');
    if (SQLite && typeof SQLite.openDatabaseAsync === 'function') {
      const nativeDb = await SQLite.openDatabaseAsync(dbPath);
      return {
        type: 'expo-sqlite',
        async exec(sql) {
          return await nativeDb.execAsync(sql);
        },
        async run(sql, params = []) {
          return await nativeDb.runAsync(sql, params);
        },
        async all(sql, params = []) {
          return await nativeDb.getAllAsync(sql, params);
        },
        async close() {
          return await nativeDb.closeAsync();
        },
      };
    }
  } catch {}

  // Fallback to node:sqlite (Node.js 22+)
  try {
    const { DatabaseSync } = await import('node:sqlite');
    const os = await import('node:os');
    const path = await import('node:path');
    if (DatabaseSync) {
      const targetPath = dbPath === ':memory:' ? ':memory:' : path.join(os.tmpdir(), dbPath);
      const nativeDb = new DatabaseSync(targetPath);
      return {
        type: 'node:sqlite',
        async exec(sql) {
          nativeDb.exec(sql);
        },
        async run(sql, params = []) {
          const stmt = nativeDb.prepare(sql);
          return stmt.run(...params);
        },
        async all(sql, params = []) {
          const stmt = nativeDb.prepare(sql);
          return stmt.all(...params);
        },
        async close() {
          nativeDb.close();
        },
      };
    }
  } catch {}

  return null;
}

let _dbInstance = null;

export async function getNoteDb(dbPath = 'robin_notes_fts.db') {
  if (_dbInstance) return _dbInstance;
  const adapter = await createSqliteAdapter(dbPath);
  if (!adapter) return null;

  await adapter.exec(`
    CREATE TABLE IF NOT EXISTS notes_meta (
      file TEXT PRIMARY KEY,
      len INTEGER,
      updated_at INTEGER
    );
    CREATE VIRTUAL TABLE IF NOT EXISTS notes_fts USING fts5(
      file UNINDEXED,
      line UNINDEXED,
      heading,
      body,
      tokenize = 'porter unicode61'
    );
  `);

  _dbInstance = adapter;
  return _dbInstance;
}

export async function indexNote(adapter, file, text, mtime = Date.now()) {
  if (!adapter) return;
  const cleanText = String(text || '');
  await adapter.run('DELETE FROM notes_fts WHERE file = ?', [file]);
  const chunks = chunkMarkdown(cleanText);
  for (const chunk of chunks) {
    await adapter.run(
      'INSERT INTO notes_fts(file, line, heading, body) VALUES (?, ?, ?, ?)',
      [file, chunk.line, chunk.heading || '', chunk.body]
    );
  }
  await adapter.run(
    'INSERT OR REPLACE INTO notes_meta(file, len, updated_at) VALUES (?, ?, ?)',
    [file, cleanText.length, mtime]
  );
}

export async function removeNote(adapter, file) {
  if (!adapter) return;
  await adapter.run('DELETE FROM notes_fts WHERE file = ?', [file]);
  await adapter.run('DELETE FROM notes_meta WHERE file = ?', [file]);
}

export async function searchFts(adapter, query, maxHits = 6) {
  if (!adapter) return [];
  const safeQuery = sanitizeFts5Query(query);
  if (!safeQuery) return [];

  const rows = await adapter.all(
    `SELECT file, line, heading, snippet(notes_fts, 3, '[', ']', '...', 16) AS snippet, body, bm25(notes_fts) AS rank
     FROM notes_fts
     WHERE notes_fts MATCH ?
     ORDER BY rank
     LIMIT ?`,
    [safeQuery, maxHits]
  );

  return (rows || []).map((r) => ({
    file: r.file,
    line: Number(r.line) || 1,
    heading: r.heading || '',
    snippet: r.snippet || (r.body ? r.body.slice(0, 200) : ''),
    rank: r.rank,
  }));
}
