// Which addresses Robin may ask the search worker to read. Plain JS with no app imports,
// so it runs under `node --test` as well as in the app.
//
// This is a first filter, not the defence: a public name can still point at a private
// address (192.168.1.1.nip.io, DNS rebinding), and the phone cannot see that. That is why
// pageText only ever reads pages through the worker, which runs on Cloudflare and cannot
// reach the user's home network, and never fetches a model-chosen URL from the phone.

const BLOCKED_SUFFIXES = ['.localhost', '.local', '.lan', '.internal', '.intranet', '.home', '.home.arpa', '.corp', '.localdomain'];

// One IPv4 part as the URL parser and inet_aton read it: 0x.. is hex, a leading 0 is octal.
function ipv4Part(s) {
  if (/^0x[0-9a-f]*$/i.test(s)) return s.length === 2 ? 0 : parseInt(s.slice(2), 16);
  if (/^0[0-7]+$/.test(s)) return parseInt(s, 8);
  if (/^(0|[1-9][0-9]*)$/.test(s)) return Number(s);
  return NaN;
}

// "127.1", "2130706433" and "0x7f.0.0.1" all mean 127.0.0.1. Returns the address as a
// 32-bit number, or null when the host is not an IPv4 literal at all.
export function parseIPv4(host) {
  const parts = host.split('.');
  if (parts.length > 4 || parts.some((p) => p === '')) return null;
  const nums = parts.map(ipv4Part);
  if (nums.some((n) => Number.isNaN(n))) return null;
  const last = nums.pop();
  if (nums.some((n) => n > 255) || last >= 2 ** (8 * (4 - nums.length))) return null;
  return nums.reduce((acc, n, i) => acc + n * 2 ** (8 * (3 - i)), 0) + last;
}

function isPrivateIPv4(n) {
  const inRange = (base, bits) => Math.floor(n / 2 ** (32 - bits)) === Math.floor(parseIPv4(base) / 2 ** (32 - bits));
  return inRange('0.0.0.0', 8) || inRange('10.0.0.0', 8) || inRange('100.64.0.0', 10) || inRange('127.0.0.0', 8) ||
    inRange('169.254.0.0', 16) || inRange('172.16.0.0', 12) || inRange('192.0.0.0', 24) || inRange('192.168.0.0', 16) ||
    inRange('198.18.0.0', 15) || n >= parseIPv4('224.0.0.0');
}

export function isUnsafeUrl(raw) {
  let u;
  try { u = new URL(raw); } catch { return true; }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') return true;
  if (u.username || u.password) return true;
  if (u.port && u.port !== '80' && u.port !== '443') return true;
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
  if (!host) return true;
  // No ordinary web page lives at an IPv6 literal, and its private ranges are many.
  if (host.includes(':')) return true;
  const v4 = parseIPv4(host);
  if (v4 !== null) return isPrivateIPv4(v4);
  // A single-label name ("router", "printer") is a device on the local network.
  if (!host.includes('.')) return true;
  if (host === 'localhost' || BLOCKED_SUFFIXES.some((s) => host.endsWith(s))) return true;
  return false;
}
