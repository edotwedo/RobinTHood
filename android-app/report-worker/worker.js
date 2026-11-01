// RobinTHood answer reports (Google Play AI-content policy: users can flag replies in the app).
// Deploy: npx wrangler d1 create robinthood-reports  (put the id in wrangler.toml)
//         npx wrangler d1 execute robinthood-reports --remote --file schema.sql
//         npx wrangler secret put ADMIN_TOKEN
//         npx wrangler deploy
// Read reports: GET /admin/reports.csv with "Authorization: Bearer <ADMIN_TOKEN>".
const REASONS = new Set(['offensive', 'sexual', 'dangerous', 'wrong', 'other']);
const clean = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, max) : '');

async function readJson(req) {
  if (Number(req.headers.get('content-length') || 0) > 20000) return null;
  try { return await req.json(); } catch { return null; }
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
      const b = await readJson(req);
      if (!b || !REASONS.has(b.reason)) return Response.json({ ok: false }, { status: 400 });
      await env.DB.prepare(
        'INSERT INTO reports (created, reason, note, model, question, answer, version, install_id) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)'
      ).bind(new Date().toISOString(), b.reason, clean(b.note, 1000), clean(b.model, 80), clean(b.question, 2000),
        clean(b.answer, 6000), clean(b.version, 20), clean(b.install_id, 40)).run();
      return Response.json({ ok: true });
    }
    if (req.method === 'GET' && url.pathname === '/admin/reports.csv') {
      if (!env.ADMIN_TOKEN || req.headers.get('authorization') !== `Bearer ${env.ADMIN_TOKEN}`) return new Response('no', { status: 401 });
      const cols = ['created', 'reason', 'note', 'model', 'question', 'answer', 'version', 'install_id'];
      const { results } = await env.DB.prepare(`SELECT ${cols.join(', ')} FROM reports ORDER BY created DESC LIMIT 5000`).all();
      return new Response(csv(cols, results), { headers: { 'content-type': 'text/csv' } });
    }
    return new Response('RobinTHood reports', { status: 404 });
  },
};
