// Robin's folder: a folder on the phone the user picks once (Android's folder
// picker). Robin can list, read and write files there, and the user sees the
// same files in their Files app.
import { Platform } from 'react-native';
import {
  StorageAccessFramework as SAF, documentDirectory, getInfoAsync, makeDirectoryAsync,
  readAsStringAsync, readDirectoryAsync, writeAsStringAsync,
} from 'expo-file-system/legacy';
import { getNoteDb, indexNote, searchFts, syncNoteIndex } from './noteIndex.js';
import { parseVaultSecrets } from './privacy.js';
import { walkTree } from './vault.js';
import { checkReadable, folderOps } from './folderOps.js';

// iPhone: no folder picker or all-files access. Robin's files live in the app's own
// Documents/RobinTHood folder, which shows up in the iPhone Files app (On My iPhone > RobinTHood).
export const IS_IOS = Platform.OS === 'ios';
export async function iosFolder() {
  const dir = `${documentDirectory}RobinTHood/`;
  const info = await getInfoAsync(dir);
  if (!info.exists) await makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}
const isPlainDir = (uri) => uri.startsWith('file://');

const MIME = {
  md: 'text/markdown', txt: 'text/plain', csv: 'text/csv', json: 'application/json',
  html: 'text/html', htm: 'text/html', js: 'text/javascript', xml: 'text/xml',
};

const IMAGE_EXT = /\.(jpe?g|png|webp|heic|heif|gif|bmp)$/i;
// Photos are shrunk on the phone before sending: about 100-200 kB, plenty for a model to read.
const PHOTO_WIDTH = 1024;

// The 📎 button: the user picks one file. A photo comes back shrunk, as JPEG base64
// ({ kind: 'image', name, base64 }); anything else must be text ({ kind: 'text', name, text }).
// Any type can be picked (code files often have no text MIME type); checkReadable and the
// NUL check below turn away what isn't text. Returns null when the user cancels.
export async function pickAttachment(maxChars = 12000) {
  const DocumentPicker = require('expo-document-picker');
  const res = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true, multiple: false });
  if (res.canceled || !res.assets?.length) return null;
  const { name, size, uri, mimeType } = res.assets[0];
  if (/^image\//.test(mimeType || '') || IMAGE_EXT.test(name)) {
    const { manipulateAsync, SaveFormat } = require('expo-image-manipulator');
    const photo = await manipulateAsync(uri, [{ resize: { width: PHOTO_WIDTH } }], { compress: 0.7, format: SaveFormat.JPEG, base64: true })
      .catch(() => null);
    if (!photo?.base64) throw new Error(`Robin couldn't open ${name} as a photo`);
    return { kind: 'image', name, base64: photo.base64 };
  }
  checkReadable(name, size || 0);
  const text = await readAsStringAsync(uri);
  if (text.includes('\u0000') || (text.match(/\uFFFD/g) || []).length > text.length / 100) {
    throw new Error(`${name} is not a text file, so Robin can't read it`);
  }
  return { kind: 'text', name, text: text.length > maxChars ? text.slice(0, maxChars) + `\n\n[cut off: file is ${text.length} characters]` : text };
}

import { appendVia, cleanName, prepareAppendContent, truncateFileContent } from './actions';
export { cleanName };

// The display name of a SAF document URI.
export function nameOf(uri) {
  const decoded = decodeURIComponent(uri);
  return decoded.split(/[/:]/).pop();
}

export async function pickFolder() {
  const res = await SAF.requestDirectoryPermissionsAsync();
  if (!res.granted) throw new Error('No folder chosen');
  return res.directoryUri;
}

// Every file under the folder, subfolders included (an Obsidian vault nests notes), named by
// path relative to the folder. Dot-folders such as .obsidian and .trash are skipped (vault.js).
async function entries(dirUri) {
  if (isPlainDir(dirUri)) {
    return walkTree(dirUri, {
      list: async (dir) => (await readDirectoryAsync(dir)).map((name) => ({ uri: dir + encodeURIComponent(name), name })),
      isDir: async (e) => (await getInfoAsync(e.uri)).isDirectory,
      childOf: (_dir, e) => e.uri + '/',
    });
  }
  return walkTree(dirUri, {
    list: async (dir) => (await SAF.readDirectoryAsync(dir)).map((uri) => ({ uri, name: nameOf(uri) })),
    isDir: async (e) => (await getInfoAsync(e.uri)).isDirectory,
    childOf: (_dir, e) => e.uri,
  });
}

// The picked folder's read/write/append, through folderOps (path-preserving lookups).
function opsFor(dirUri) {
  return folderOps({
    entries: () => entries(dirUri),
    size: async (uri) => (await getInfoAsync(uri)).size || 0,
    readText: (uri) => readAsStringAsync(uri),
    writeText: (uri, text) => writeAsStringAsync(uri, text),
    create: async (fileName) => {
      if (isPlainDir(dirUri)) return { uri: dirUri + encodeURIComponent(fileName), name: fileName };
      const ext = fileName.split('.').pop().toLowerCase();
      const uri = await SAF.createFileAsync(dirUri, fileName, MIME[ext] || 'application/octet-stream');
      return { uri, name: nameOf(uri) || fileName };
    },
  });
}

export const listFiles = (dirUri) => opsFor(dirUri).list();
export const readFile = (dirUri, name, maxChars = 12000) => opsFor(dirUri).read(name, maxChars);
// True when a WRITE of this name would replace a file in the folder.
export const fileExists = (dirUri, name) => opsFor(dirUri).exists(name);
export const writeFile = (dirUri, name, content) => opsFor(dirUri).write(name, content);
export const appendFile = (dirUri, name, content) => opsFor(dirUri).append(name, content);

export async function searchLocalFiles(dirUri, query, maxHits = 6) {
  const q = String(query || '').trim();
  if (!q) return [];
  const all = await entries(dirUri);
  const allNames = all.map((e) => e.name).sort((x, y) => x.localeCompare(y));
  try {
    const db = await getNoteDb();
    if (db) {
      // One listing for the whole sync; reads are full-length (no 12k cut) so the index
      // holds the whole note.
      const byName = new Map(all.map((e) => [e.name, e.uri]));
      const sizes = new Map();
      await syncNoteIndex(
        db,
        allNames.filter((n) => /\.(md|txt|markdown|csv)$/i.test(n)),
        async (n) => {
          const info = await getInfoAsync(byName.get(n));
          sizes.set(n, info.size || 0);
          // SAF size is InputStream.available(): 0 on some cloud providers, so 0 means unknown.
          return { mtime: (info.modificationTime || 0) * 1000, size: info.size || null };
        },
        async (n) => {
          checkReadable(n, sizes.get(n) || 0);
          const text = await readAsStringAsync(byName.get(n));
          checkReadable(n, text.length);
          return text;
        }
      );
      const ftsHits = await searchFts(db, q, maxHits);
      if (ftsHits && ftsHits.length > 0) return ftsHits;
    }
  } catch {}

  const lowerQ = q.toLowerCase();
  const hits = [];
  for (const { name, uri } of all) {
    if (!/\.(md|txt|markdown|csv)$/i.test(name)) continue;
    try {
      checkReadable(name, 0);
      const text = truncateFileContent(await readAsStringAsync(uri), 12000);
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(lowerQ)) {
          hits.push({ file: name, line: i + 1, snippet: line.trim().slice(0, 200) });
          if (hits.length >= maxHits) return hits;
        }
      }
    } catch {}
  }
  return hits;
}

// ---- Phil's personal build: whole-phone access ("All files access") ----
// The library is only linked into that build, so it is loaded lazily and only
// ever used when allFiles is on.
let rnfs;
const fs = () => (rnfs ??= require('@dr.pogodin/react-native-fs'));

export const ALL_FILES_ROOT = 'allfiles:';
const rootPath = () => fs().ExternalStorageDirectoryPath || '/storage/emulated/0';

function resolvePath(p = '') {
  let rel = String(p).trim().replace(/^["'`]+|["'`]+$/g, '');
  const root = rootPath();
  if (rel.startsWith(root)) rel = rel.slice(root.length);
  rel = rel.replace(/^\/+/, '');
  if (rel.split('/').includes('..')) throw new Error('Paths with .. are not allowed');
  return rel ? `${root}/${rel}` : root;
}

// True once the user has switched on All files access for this app.
export async function hasAllFilesAccess() {
  const probe = `${rootPath()}/.robinthood-access-check`;
  try {
    await fs().writeFile(probe, 'ok', 'utf8');
    await fs().unlink(probe);
    return true;
  } catch {
    return false;
  }
}

export async function openAllFilesSetting(packageName) {
  const IntentLauncher = require('expo-intent-launcher');
  try {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_APP_ALL_FILES_ACCESS_PERMISSION', { data: `package:${packageName}` });
  } catch {
    await IntentLauncher.startActivityAsync('android.settings.MANAGE_ALL_FILES_ACCESS_PERMISSION');
  }
}

export async function listAll(folder) {
  const items = await fs().readDir(resolvePath(folder));
  return items
    .filter((i) => !i.name.startsWith('.'))
    .map((i) => (i.isDirectory() ? `${i.name}/` : i.name))
    .sort((a, b) => a.localeCompare(b));
}

export async function readAll(path, maxChars = 12000) {
  const full = resolvePath(path);
  checkReadable(full, (await fs().stat(full)).size);
  const text = await fs().readFile(full, 'utf8');
  return truncateFileContent(text, maxChars);
}

// Where WRITE puts a path: .md added when there is no extension, bare names in Documents/RobinTHood.
function writePath(path) {
  let rel = String(path).trim();
  if (!/\.[a-z0-9]{1,6}$/i.test(rel)) rel += '.md';
  if (!rel.includes('/')) rel = `Documents/RobinTHood/${rel}`;
  return resolvePath(rel);
}

export async function existsAll(path) {
  return fs().exists(writePath(path));
}

export async function writeAll(path, content) {
  const full = writePath(path);
  const replaced = await fs().exists(full);
  await fs().mkdir(full.slice(0, full.lastIndexOf('/')));
  await fs().writeFile(full, content, 'utf8');
  return { name: full.slice(rootPath().length + 1), chars: content.length, replaced };
}

export async function appendAll(path, content) {
  const full = writePath(path);
  return appendVia(
    {
      exists: () => fs().exists(full),
      read: () => fs().readFile(full, 'utf8'),
      write: async (_n, body) => {
        const had = await fs().exists(full);
        if (!had) await fs().mkdir(full.slice(0, full.lastIndexOf('/')));
        await fs().writeFile(full, body, 'utf8');
        return { name: full.slice(rootPath().length + 1), chars: body.length };
      },
    },
    full,
    content
  );
}

export async function searchAllFiles(query, folder = 'Documents/RobinTHood', maxHits = 6) {
  const q = String(query || '').trim();
  if (!q) return [];
  const allNames = await listAll(folder);
  try {
    const db = await getNoteDb();
    if (db) {
      const pathOf = (item) => (folder ? `${folder.replace(/\/+$/, '')}/${item}` : item);
      await syncNoteIndex(
        db,
        allNames.filter((i) => !i.endsWith('/') && /\.(md|txt|markdown|csv)$/i.test(i)),
        async (i) => {
          const st = await fs().stat(resolvePath(pathOf(i)));
          return { mtime: new Date(st.mtime).getTime(), size: Number(st.size) };
        },
        (i) => readAll(pathOf(i), Infinity)
      );
      const ftsHits = await searchFts(db, q, maxHits);
      if (ftsHits && ftsHits.length > 0) return ftsHits;
    }
  } catch {}

  const lowerQ = q.toLowerCase();
  const hits = [];
  for (const item of allNames) {
    if (item.endsWith('/')) continue;
    if (!/\.(md|txt|markdown|csv)$/i.test(item)) continue;
    try {
      const filePath = folder ? `${folder.replace(/\/+$/, '')}/${item}` : item;
      const text = await readAll(filePath);
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (line.toLowerCase().includes(lowerQ)) {
          hits.push({ file: item, line: i + 1, snippet: line.trim().slice(0, 200) });
          if (hits.length >= maxHits) return hits;
        }
      }
    } catch {}
  }
  return hits;
}

export function createFolderStore(getFolder) {
  return {
    async list(folder) {
      const dir = await getFolder();
      return listFiles(dir);
    },
    async exists(path) {
      try {
        const dir = await getFolder();
        return await fileExists(dir, path);
      } catch {
        return undefined;
      }
    },
    async read(path) {
      const dir = await getFolder();
      return readFile(dir, path);
    },
    async write(path, content) {
      const dir = await getFolder();
      const res = await writeFile(dir, path, content);
      getNoteDb().then((db) => db && indexNote(db, res.name, content)).catch(() => {});
      return res;
    },
    async append(path, content) {
      const dir = await getFolder();
      const res = await appendFile(dir, path, content);
      getNoteDb().then(async (db) => {
        if (db) {
          try {
            const full = await readFile(dir, res.name, Infinity);
            await indexNote(db, res.name, full);
          } catch {}
        }
      }).catch(() => {});
      return res;
    },
    async search(query, maxHits = 6) {
      const dir = await getFolder();
      return searchLocalFiles(dir, query, maxHits);
    },
  };
}

export function createAllFilesStore(defaultFolder = 'Documents/RobinTHood') {
  const cleanDefault = String(defaultFolder || 'Documents/RobinTHood').trim().replace(/^\/+|\/+$/g, '');
  const resolveStorePath = (path = '') => {
    let clean = String(path || '').trim().replace(/^["'`]+|["'`]+$/g, '').replace(/^\/+/, '');
    if (clean === cleanDefault || clean.startsWith(cleanDefault + '/')) {
      return clean;
    }
    return clean ? `${cleanDefault}/${clean}` : cleanDefault;
  };

  return {
    async list(folder) {
      return listAll(resolveStorePath(folder || ''));
    },
    async exists(path) {
      try {
        return await existsAll(resolveStorePath(path));
      } catch {
        return undefined;
      }
    },
    async read(path) {
      return readAll(resolveStorePath(path));
    },
    async write(path, content) {
      const resolved = resolveStorePath(path);
      const res = await writeAll(resolved, content);
      getNoteDb().then((db) => db && indexNote(db, cleanName(resolved), content)).catch(() => {});
      return res;
    },
    async append(path, content) {
      const resolved = resolveStorePath(path);
      const res = await appendAll(resolved, content);
      getNoteDb().then(async (db) => {
        if (db) {
          try {
            const full = await readAll(resolved, Infinity);
            await indexNote(db, cleanName(resolved), full);
          } catch {}
        }
      }).catch(() => {});
      return res;
    },
    async search(query, maxHits = 6) {
      return searchAllFiles(query, cleanDefault, maxHits);
    },
  };
}

export async function loadVaultSecrets(store, options = {}) {
  if (!store || typeof store.read !== 'function') return {};
  try {
    const content = await store.read('_vault_secrets.json');
    if (content) return parseVaultSecrets(content, options);
  } catch {}
  return {};
}
