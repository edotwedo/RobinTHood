// Robin's folder: a folder on the phone the user picks once (Android's folder
// picker). Robin can list, read and write files there, and the user sees the
// same files in their Files app.
import { Platform } from 'react-native';
import {
  StorageAccessFramework as SAF, documentDirectory, getInfoAsync, makeDirectoryAsync,
  readAsStringAsync, readDirectoryAsync, writeAsStringAsync,
} from 'expo-file-system/legacy';

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

// READ hands text to the model, so it refuses what can't be text and anything big enough
// to run the phone out of memory when loaded into a string (the cut to 12 000 chars
// comes after the whole file is read).
const MAX_READ_BYTES = 1000000;
const BINARY_EXT = /\.(zip|gz|tgz|7z|rar|tar|apk|aab|jar|exe|dll|so|bin|iso|img|dmg|pdf|docx?|xlsx?|pptx?|odt|jpe?g|png|gif|webp|heic|bmp|tiff?|mp3|m4a|aac|ogg|opus|wav|flac|mp4|m4v|mkv|webm|mov|avi|3gp|db|sqlite|realm)$/i;

function checkReadable(name, size) {
  if (BINARY_EXT.test(String(name).trim())) throw new Error(`${name} is not a text file, so Robin can't read it`);
  if (size > MAX_READ_BYTES) throw new Error(`${name} is ${Math.round(size / 1000)} kB; Robin only reads text files up to ${MAX_READ_BYTES / 1000} kB`);
}

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

import { cleanName } from './actions';
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

async function entries(dirUri) {
  if (isPlainDir(dirUri)) {
    const names = await readDirectoryAsync(dirUri);
    return names.map((name) => ({ uri: dirUri + encodeURIComponent(name), name }));
  }
  const uris = await SAF.readDirectoryAsync(dirUri);
  return uris.map((uri) => ({ uri, name: nameOf(uri) }));
}

export async function listFiles(dirUri) {
  return (await entries(dirUri)).map((e) => e.name).sort((a, b) => a.localeCompare(b));
}

export async function readFile(dirUri, name, maxChars = 12000) {
  const want = cleanName(name).toLowerCase();
  const hit = (await entries(dirUri)).find((e) => e.name.toLowerCase() === want || e.name.toLowerCase() === String(name).trim().toLowerCase());
  if (!hit) throw new Error(`No file named ${name}`);
  checkReadable(hit.name, 0);
  // Size is not reported for every SAF provider; when it is missing, the type check stands alone.
  const info = await getInfoAsync(hit.uri).catch(() => ({}));
  checkReadable(hit.name, info.size || 0);
  const text = await readAsStringAsync(hit.uri);
  return text.length > maxChars ? text.slice(0, maxChars) + `\n\n[cut off: file is ${text.length} characters]` : text;
}

// True when a WRITE of this name would replace a file in the folder.
export async function fileExists(dirUri, name) {
  const fileName = cleanName(name).toLowerCase();
  return (await entries(dirUri)).some((e) => e.name.toLowerCase() === fileName);
}

export async function writeFile(dirUri, name, content) {
  const fileName = cleanName(name);
  const existing = (await entries(dirUri)).find((e) => e.name.toLowerCase() === fileName.toLowerCase());
  let uri = existing?.uri;
  if (!uri && isPlainDir(dirUri)) uri = dirUri + encodeURIComponent(fileName);
  if (!uri) {
    const ext = fileName.split('.').pop().toLowerCase();
    uri = await SAF.createFileAsync(dirUri, fileName, MIME[ext] || 'application/octet-stream');
  }
  await writeAsStringAsync(uri, content);
  return { name: isPlainDir(dirUri) ? fileName : nameOf(uri) || fileName, chars: content.length, replaced: Boolean(existing) };
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
  return text.length > maxChars ? text.slice(0, maxChars) + `\n\n[cut off: file is ${text.length} characters]` : text;
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
