// Robin's folder: a folder on the phone the user picks once (Android's folder
// picker). Robin can list, read and write files there, and the user sees the
// same files in their Files app.
import { StorageAccessFramework as SAF, readAsStringAsync, writeAsStringAsync } from 'expo-file-system/legacy';

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
  if (!uri) {
    const ext = fileName.split('.').pop().toLowerCase();
    uri = await SAF.createFileAsync(dirUri, fileName, MIME[ext] || 'application/octet-stream');
  }
  await writeAsStringAsync(uri, content);
  return { name: nameOf(uri) || fileName, chars: content.length, replaced: Boolean(existing) };
}
