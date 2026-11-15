// Walking Robin's folder when it is a tree, e.g. an Obsidian vault with notes in subfolders.
// Plain JS with no app imports, so it runs under `node --test` as well as in the app.
//
// An entry's `name` is its path relative to the folder ("Projects/Robin.md"), so the model sees
// where a note lives and READ can name it exactly. Obsidian links use the bare note name
// ([[Robin]]), so lookups fall back to the basename.

// Obsidian's own settings, the trash, and other dot-folders hold no notes for Robin.
const SKIP_DIR = /^(\.|node_modules$)/;
export const MAX_DEPTH = 6;
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
    for (const e of level) {
      if (out.length >= maxEntries) break;
      // Files almost always have an extension; only extension-less names cost a directory check.
      const maybeDir = !/\.[a-z0-9]{1,8}$/i.test(e.name);
      if (maybeDir && (await safeIsDir(isDir, e))) {
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

// The entry a READ/WRITE name refers to: the exact relative path first, then a unique-enough
// basename match (case-insensitive, ".md" optional, as in an Obsidian [[link]]).
export function findEntry(entries, name) {
  const want = String(name || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^\[\[|\]\]$/g, '').replace(/^\/+/, '');
  if (!want) return undefined;
  const lower = want.toLowerCase();
  const withMd = /\.[a-z0-9]{1,8}$/i.test(lower) ? lower : `${lower}.md`;
  return (
    entries.find((e) => e.name.toLowerCase() === lower || e.name.toLowerCase() === withMd) ||
    entries.find((e) => base(e.name).toLowerCase() === base(lower) || base(e.name).toLowerCase() === base(withMd))
  );
}

// An Obsidian vault has a .obsidian settings folder at its top level.
export const isVault = (topLevelNames) => topLevelNames.some((n) => n === '.obsidian');
