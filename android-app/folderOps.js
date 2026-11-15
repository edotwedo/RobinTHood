// READ / WRITE / APPEND on Robin's picked folder, written against a small IO interface so the
// whole path (name lookup -> read -> write) runs under `node --test` with an in-memory folder.
// files.js supplies the real IO (SAF or file://).
//
// Names keep their folder end to end: "Work/Budget.md" is never cut down to "Budget.md",
// or an APPEND would land in a different note of the same name.
import { appendVia, cleanName, truncateFileContent } from './actions.js';
import { resolveEntry } from './vault.js';

// READ hands text to the model, so it refuses what can't be text and anything big enough
// to run the phone out of memory when loaded into a string (the cut to 12 000 chars
// comes after the whole file is read).
export const MAX_READ_BYTES = 1000000;
const BINARY_EXT = /\.(zip|gz|tgz|7z|rar|tar|apk|aab|jar|exe|dll|so|bin|iso|img|dmg|pdf|docx?|xlsx?|pptx?|odt|jpe?g|png|gif|webp|heic|bmp|tiff?|mp3|m4a|aac|ogg|opus|wav|flac|mp4|m4v|mkv|webm|mov|avi|3gp|db|sqlite|realm)$/i;

export function checkReadable(name, size) {
  if (BINARY_EXT.test(String(name).trim())) throw new Error(`${name} is not a text file, so Robin can't read it`);
  if (size > MAX_READ_BYTES) throw new Error(`${name} is ${Math.round(size / 1000)} kB; Robin only reads text files up to ${MAX_READ_BYTES / 1000} kB`);
}

// A name with a folder is never reduced to its bare name. Several notes sharing a bare name
// is an error that lists them, so the model can name the exact path.
export function lookup(all, name) {
  let r = resolveEntry(all, name);
  if (!r.entry && !r.ambiguous && !/[\\/]/.test(String(name || ''))) r = resolveEntry(all, cleanName(name));
  if (r.ambiguous) throw new Error(`${name} matches several notes: ${r.ambiguous.slice(0, 5).join(', ')}. Use the full path`);
  return r.entry;
}

// io: { entries() -> [{ uri, name }], size(uri) -> bytes (0 = unknown), readText(uri),
//       writeText(uri, text), create(fileName) -> { uri, name } for a new top-level file }
export function folderOps(io) {
  const ops = {
    async list() {
      return (await io.entries()).map((e) => e.name).sort((a, b) => a.localeCompare(b));
    },
    async exists(name) {
      return Boolean(lookup(await io.entries(), name));
    },
    async read(name, maxChars = 12000) {
      const hit = lookup(await io.entries(), name);
      if (!hit) throw new Error(`No file named ${name}`);
      checkReadable(hit.name, 0);
      // Size is not reported for every SAF provider; when it is missing, the type check stands alone.
      checkReadable(hit.name, (await Promise.resolve(io.size(hit.uri)).catch(() => 0)) || 0);
      return truncateFileContent(await io.readText(hit.uri), maxChars);
    },
    // Returns name = the note's path in the folder, which is also its search-index key.
    async write(name, content) {
      const fileName = cleanName(name);
      const all = await io.entries();
      const existing = lookup(all, name);
      if (existing) {
        await io.writeText(existing.uri, content);
        return { name: existing.name, chars: content.length, replaced: true };
      }
      // A new note with a folder ("New/Idea.md") is created at the top level as "Idea.md"; if that
      // name is already taken there, stop rather than overwrite a note the user never named.
      if (all.some((e) => e.name.toLowerCase() === fileName.toLowerCase())) {
        throw new Error(`${fileName} already exists at the top of the folder. Use that name to replace it, or pick another name`);
      }
      const made = await io.create(fileName);
      await io.writeText(made.uri, content);
      return { name: made.name || fileName, chars: content.length, replaced: false };
    },
    async append(name, content) {
      return appendVia({ exists: ops.exists, read: ops.read, write: ops.write }, name, content);
    },
  };
  return ops;
}
