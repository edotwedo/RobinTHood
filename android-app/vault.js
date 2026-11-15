// Walking Robin's folder when it is a tree, e.g. an Obsidian vault with notes in subfolders.
// Plain JS with no app imports, so it runs under `node --test` as well as in the app.
//
// An entry's `name` is its path relative to the folder ("Projects/Robin.md"), so the model sees
// where a note lives and READ can name it exactly. Obsidian links use the bare note name
// ([[Robin]]), so lookups fall back to the basename.

// Obsidian's own settings, the trash, and other dot-folders hold no notes for Robin.
const SKIP_DIR = /^(\.|node_modules$)/;
export const MAX_DEPTH = 6;
// Known file extensions; used only to decide whether a bare name needs ".md" added.
export const FILE_EXT = /\.(md|markdown|txt|csv|json|canvas|base|excalidraw|pdf|png|jpe?g|gif|webp|svg|heic|bmp|mp3|m4a|wav|ogg|flac|mp4|mov|webm|mkv|docx?|xlsx?|pptx?|odt|rtf|html?|xml|ya?ml|js|css|zip|epub)$/i;
export const MAX_ENTRIES = 5000;

// list(dir) -> [{ uri, name }] for one directory level (name = that level's bare name).
// isDir(entry) -> true for a subfolder. childOf(dir, entry) -> the value list() takes for it.
export async function walkTree(root, { list, isDir, childOf }, { maxDepth = MAX_DEPTH, maxEntries = MAX_ENTRIES } = {}) {
  const out = [];
  const queue = [{ dir: root, prefix: '', depth: 0 }];
  while (queue.length && out.length < maxEntries) {
    const { dir, prefix, depth } = queue.shift();
    let level;
    try {
      level = await list(dir);
    } catch {
      continue; // an unreadable subfolder hides only itself
    }
    // The provider's directory flag decides, never the name: a folder may be called
    // "Project.v1" or even "Archive.md". Checks for one level run in parallel.
    const dirFlags = await Promise.all(level.map((e) => safeIsDir(isDir, e)));
    for (let i = 0; i < level.length; i++) {
      const e = level[i];
      if (out.length >= maxEntries) break;
      if (dirFlags[i]) {
        if (depth + 1 < maxDepth && !SKIP_DIR.test(e.name)) {
          queue.push({ dir: childOf(dir, e), prefix: `${prefix}${e.name}/`, depth: depth + 1 });
        }
        continue;
      }
      if (e.name.startsWith('.')) continue;
      out.push({ uri: e.uri, name: prefix + e.name });
    }
  }
  return out;
}

async function safeIsDir(isDir, e) {
  try {
    return Boolean(await isDir(e));
  } catch {
    return false;
  }
}

const base = (p) => String(p).split('/').pop();

// The entry a READ/WRITE name refers to. A name with a folder ("Work/Budget.md") must match
// that exact path (case-insensitive, ".md" optional); it never falls back to a note of the
// same name in another folder, or a WRITE would overwrite the wrong note. A bare name
// ("Budget", [[Budget]]) matches by note name, but only when exactly one note has it.
export function findEntry(entries, name) {
  const r = resolveEntry(entries, name);
  return r.entry;
}

// { entry } for a single match, { ambiguous: [names] } when a bare name fits several notes,
// {} when nothing fits.
export function resolveEntry(entries, name) {
  const want = String(name || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^\[\[|\]\]$/g, '').replace(/^\/+/, '');
  if (!want) return {};
  const lower = want.toLowerCase();
  const withMd = FILE_EXT.test(lower) ? lower : `${lower}.md`;
  const exact = entries.find((e) => e.name.toLowerCase() === lower || e.name.toLowerCase() === withMd);
  if (exact) return { entry: exact };
  if (lower.includes('/')) return {};
  const hits = entries.filter((e) => base(e.name).toLowerCase() === lower || base(e.name).toLowerCase() === withMd);
  if (hits.length === 1) return { entry: hits[0] };
  return hits.length > 1 ? { ambiguous: hits.map((e) => e.name) } : {};
}

// An Obsidian vault has a .obsidian settings folder at its top level.
export const isVault = (topLevelNames) => topLevelNames.some((n) => n === '.obsidian');

// Vault rules apply only while Robin's folder IS the vault: the All-files build always uses the
// vault folder once connected; a picked (SAF) folder must still be the one the vault was set to.
export const vaultActive = (settings, allFiles) =>
  !!settings?.obsidianVault && (allFiles || settings.obsidianVault === settings.filesUri);
