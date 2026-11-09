// RobinTHood answer reports (Google Play AI-content policy: users can flag replies in the app).
// Deploy: npx wrangler d1 create robinthood-reports  (put the id in wrangler.toml)
//         npx wrangler d1 execute robinthood-reports --remote --file schema.sql
//         npx wrangler secret put ADMIN_TOKEN
//         npx wrangler secret put ROBIN_CLIENT_SECRET   (the same key as the search worker)
//         npx wrangler deploy
// Read reports: GET /admin/reports.csv with "Authorization: Bearer <ADMIN_TOKEN>".
//
// POST /report must carry the app's HMAC headers (same scheme as the search worker) and
// is limited per IP, so a script can't fill D1 or push real reports out of the export.
// 'feedback' is the Settings > Send feedback box (not an answer report): note only, up to 4000 chars.
const REASONS = new Set(['offensive', 'sexual', 'dangerous', 'wrong', 'other', 'feedback']);
const MAX_BODY = 20000;
// Reports are signed when sent, not when queued, so the window only covers clock drift.
const SIGN_WINDOW_SEC = 600;
const REPORTS_PER_MIN = 5;
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

async function hmacHex(secret, message) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(message));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Reads at most MAX_BODY bytes whatever Content-Length claims; null when it is longer.
async function readCapped(req) {
  if (!req.body) return '';
  const reader = req.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY) { await reader.cancel(); return null; }
    chunks.push(value);
  }
  const all = new Uint8Array(size);
  let at = 0;
  for (const c of chunks) { all.set(c, at); at += c.byteLength; }
  return new TextDecoder().decode(all);
}

async function signedOk(req, raw, secret) {
  const ts = Number(req.headers.get('x-robin-timestamp'));
  const nonce = req.headers.get('x-robin-nonce') || '';
  const sig = req.headers.get('x-robin-signature') || '';
  if (!secret || !Number.isFinite(ts) || !/^[A-Za-z0-9-]{16,64}$/.test(nonce)) return false;
  if (Math.abs(Date.now() / 1000 - ts) > SIGN_WINDOW_SEC) return false;
  return timingSafeEqual(sig, await hmacHex(secret, `${ts}:${nonce}:${raw}`));
}

async function limited(env, ip) {
  if (!env.RATE_LIMITER) return false;
  try { return !(await env.RATE_LIMITER.limit({ key: `report:${ip}` })).success; } catch { return false; }
}

function csv(cols, rows) {
  const cell = (v) => {
    let s = String(v ?? '');
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n') + '\n';
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    if (req.method === 'POST' && url.pathname === '/report') {
      const raw = await readCapped(req);
      if (raw === null) return Response.json({ ok: false }, { status: 413 });
      if (!(await signedOk(req, raw, env.ROBIN_CLIENT_SECRET))) return Response.json({ ok: false }, { status: 401 });
      if (await limited(env, req.headers.get('cf-connecting-ip') || 'unknown')) {
        return Response.json({ ok: false }, { status: 429, headers: { 'retry-after': '60' } });
      }
      let b;
      try { b = JSON.parse(raw); } catch { b = null; }
      if (!b || !REASONS.has(b.reason)) return Response.json({ ok: false }, { status: 400 });
      await env.DB.prepare(
        'INSERT INTO reports (created, reason, note, model, question, answer, version, install_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
      ).bind(new Date().toISOString(), b.reason, clean(b.note, b.reason === 'feedback' ? 4000 : 1000), clean(b.model, 80), clean(b.question, 2000),
        clean(b.answer, 6000), clean(b.version, 20), clean(b.install_id, 40)).run();
      return Response.json({ ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/admin/reports.csv') {
      if (!env.ADMIN_TOKEN || !timingSafeEqual(req.headers.get('authorization') || '', `Bearer ${env.ADMIN_TOKEN}`)) return new Response('no', { status: 401 });
      const cols = ['created', 'reason', 'note', 'model', 'question', 'answer', 'version', 'install_id'];
      // ?reason=feedback pulls just the Settings feedback; no param = everything.
      const reason = url.searchParams.get('reason');
      const sel = `SELECT ${cols.join(', ')} FROM reports`;
      const { results } = REASONS.has(reason)
        ? await env.DB.prepare(`${sel} WHERE reason = ?1 ORDER BY created DESC LIMIT 5000`).bind(reason).all()
        : await env.DB.prepare(`${sel} ORDER BY created DESC LIMIT 5000`).all();
      return new Response(csv(cols, results), { headers: { 'content-type': 'text/csv' } });
    }
    return new Response('RobinTHood reports', { status: 404 });
  },
};
