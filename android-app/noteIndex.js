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

  // Fallback: in-memory adapter for environments like Node 20 without native SQLite
  const memTables = new Map();
  const ftsRows = [];
  return {
    type: 'mock',
    async exec() {},
    async run(sql, params = []) {
      if (/DELETE FROM notes_fts WHERE file =/i.test(sql)) {
        const file = params[0];
        for (let i = ftsRows.length - 1; i >= 0; i--) {
          if (ftsRows[i].file === file) ftsRows.splice(i, 1);
        }
      } else if (/INSERT INTO notes_fts/i.test(sql)) {
        const [file, line, heading, body] = params;
        ftsRows.push({ file, line, heading, body });
      } else if (/INSERT OR REPLACE INTO notes_meta/i.test(sql)) {
        memTables.set(params[0], { len: params[1], updated_at: params[2] });
      } else if (/DELETE FROM notes_meta/i.test(sql)) {
        memTables.delete(params[0]);
      }
    },
    async all(sql, params = []) {
      if (/SELECT file, len FROM notes_meta/i.test(sql)) {
        return Array.from(memTables.entries()).map(([file, d]) => ({ file, len: d.len }));
      }
      if (/SELECT file FROM notes_meta/i.test(sql)) {
        return Array.from(memTables.keys()).map((file) => ({ file }));
      }
      if (/FROM notes_fts WHERE notes_fts MATCH/i.test(sql)) {
        const matchArg = String(params[0] || '').toLowerCase().replace(/["*]/g, '').trim();
        const tokens = matchArg.split(/\s+/).filter(Boolean);
        const limit = params[1] || 6;
        const matched = [];
        for (const row of ftsRows) {
          const text = `${row.heading} ${row.body}`.toLowerCase();
          if (tokens.every((tok) => text.includes(tok))) {
            matched.push({
              file: row.file,
              line: row.line,
              heading: row.heading,
              snippet: row.body.slice(0, 150),
              body: row.body,
              rank: -1,
            });
            if (matched.length >= limit) break;
          }
        }
        return matched;
      }
      return [];
    },
    async close() {},
  };
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
