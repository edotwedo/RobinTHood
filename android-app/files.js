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

export function cleanName(name) {
  let n = String(name).trim().replace(/^["'`]+|["'`]+$/g, '').split(/[\\/]/).pop();
  n = n.replace(/[<>:"|?*\u0000-\u001f]/g, '').trim();
  if (!n) n = 'note';
  if (!/\.[a-z0-9]{1,6}$/i.test(n)) n += '.md';
  return n.slice(0, 120);
}

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
  const text = await readAsStringAsync(hit.uri);
  return text.length > maxChars ? text.slice(0, maxChars) + `\n\n[cut off: file is ${text.length} characters]` : text;
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
  const text = await fs().readFile(resolvePath(path), 'utf8');
  return text.length > maxChars ? text.slice(0, maxChars) + `\n\n[cut off: file is ${text.length} characters]` : text;
}

export async function writeAll(path, content) {
  let rel = String(path).trim();
  if (!/\.[a-z0-9]{1,6}$/i.test(rel)) rel += '.md';
  if (!rel.includes('/')) rel = `Documents/RobinTHood/${rel}`;
  const full = resolvePath(rel);
  const replaced = await fs().exists(full);
  await fs().mkdir(full.slice(0, full.lastIndexOf('/')));
  await fs().writeFile(full, content, 'utf8');
  return { name: full.slice(rootPath().length + 1), chars: content.length, replaced };
}
