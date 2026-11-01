// Small Markdown parser for Robin's replies. Plain JS with no app imports, so it runs
// under `node --test` as well as in the app (App.js renders what it returns).
//
// Covers what chat models actually write: fenced code (also an unclosed fence while a
// reply is still streaming), headings, bullet and numbered lists with nesting, block
// quotes, horizontal rules, pipe tables, and inline **bold**, *italic*, `code`,
// ~~strike~~ and [links](https://...). Anything else stays plain text.

const FENCE_RE = /^\s*(```|~~~)\s*([\w+#.-]*)\s*$/;
const HEADING_RE = /^\s{0,3}(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s{0,3}([-*_])(\s*\1){2,}\s*$/;
const BULLET_RE = /^(\s*)[-*+•]\s+(.*)$/;
const ORDERED_RE = /^(\s*)(\d{1,3})[.)]\s+(.*)$/;
const QUOTE_RE = /^\s{0,3}>\s?(.*)$/;
const TABLE_SEP_RE = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

const splitRow = (line) => {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
};

const depthOf = (indent) => Math.min(3, Math.floor(indent.replace(/\t/g, '  ').length / 2));

export function parseBlocks(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const blocks = [];
  let para = [];
  const flushPara = () => {
    if (para.length) blocks.push({ type: 'para', text: para.join('\n') });
    para = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    const fence = line.match(FENCE_RE);
    if (fence) {
      flushPara();
      const body = [];
      let j = i + 1;
      while (j < lines.length && !new RegExp(`^\\s*${fence[1]}\\s*$`).test(lines[j])) body.push(lines[j++]);
      blocks.push({ type: 'code', lang: fence[2] || '', text: body.join('\n').replace(/\s+$/, ''), open: j >= lines.length });
      i = j;
      continue;
    }

    if (!line.trim()) { flushPara(); continue; }

    const heading = line.match(HEADING_RE);
    if (heading) { flushPara(); blocks.push({ type: 'heading', level: heading[1].length, text: heading[2] }); continue; }

    if (HR_RE.test(line)) { flushPara(); blocks.push({ type: 'hr' }); continue; }

    if (line.includes('|') && i + 1 < lines.length && TABLE_SEP_RE.test(lines[i + 1])) {
      flushPara();
      const header = splitRow(line);
      const rows = [];
      let j = i + 2;
      while (j < lines.length && lines[j].includes('|') && lines[j].trim()) rows.push(splitRow(lines[j++]));
      blocks.push({ type: 'table', header, rows: rows.map((r) => header.map((_, k) => r[k] ?? '')) });
      i = j - 1;
      continue;
    }

    const bullet = line.match(BULLET_RE);
    const ordered = !bullet && line.match(ORDERED_RE);
    if (bullet || ordered) {
      flushPara();
      blocks.push(bullet
        ? { type: 'item', ordered: false, depth: depthOf(bullet[1]), text: bullet[2] }
        : { type: 'item', ordered: true, number: Number(ordered[2]), depth: depthOf(ordered[1]), text: ordered[3] });
      continue;
    }

    const quote = line.match(QUOTE_RE);
    if (quote) {
      flushPara();
      const prev = blocks[blocks.length - 1];
      if (prev && prev.type === 'quote') prev.text += '\n' + quote[1];
      else blocks.push({ type: 'quote', text: quote[1] });
      continue;
    }

    // A wrapped continuation of the previous list item stays with that item.
    const prev = blocks[blocks.length - 1];
    if (!para.length && prev && prev.type === 'item' && /^\s{2,}\S/.test(line)) {
      prev.text += ' ' + line.trim();
      continue;
    }
    para.push(line);
  }
  flushPara();
  return blocks;
}

// Inline spans: [{ text, bold?, italic?, strike?, code?, url? }]. Links keep only
// http(s) targets; anything else is shown as its label text.
const INLINE_RE = /(`+)([^`]+?)\1|\[([^\]\n]+)\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)|(\*\*|__)(?=\S)([\s\S]+?)(?<=\S)\5|~~(?=\S)([\s\S]+?)(?<=\S)~~|(?<![\w*])\*(?=[^\s*])([^*\n]+?)(?<=\S)\*(?![\w*])|(?<![\w_])_(?=[^\s_])([^_\n]+?)(?<=\S)_(?![\w_])|(https?:\/\/[^\s<>()\]]+[^\s<>()\].,;:!?'"])|\\([\\`*_~[\]()#|>-])/g;

export function parseInline(text, style = {}) {
  const out = [];
  const push = (s, st) => {
    if (!s) return;
    const last = out[out.length - 1];
    const same = last && ['bold', 'italic', 'strike', 'code', 'url'].every((k) => last[k] === st[k]);
    if (same) last.text += s;
    else out.push({ text: s, ...st });
  };
  let last = 0;
  let m;
  const re = new RegExp(INLINE_RE.source, 'g');
  const src = String(text || '');
  while ((m = re.exec(src)) !== null) {
    push(src.slice(last, m.index), style);
    if (m[2] !== undefined) push(m[2], { ...style, code: true });
    else if (m[3] !== undefined) {
      const safe = /^https?:\/\//i.test(m[4]) ? m[4] : undefined;
      for (const span of parseInline(m[3], { ...style, url: safe })) push(span.text, span);
    } else if (m[6] !== undefined) for (const span of parseInline(m[6], { ...style, bold: true })) push(span.text, span);
    else if (m[7] !== undefined) for (const span of parseInline(m[7], { ...style, strike: true })) push(span.text, span);
    else if (m[8] !== undefined || m[9] !== undefined) {
      for (const span of parseInline(m[8] ?? m[9], { ...style, italic: true })) push(span.text, span);
    } else if (m[10] !== undefined) push(m[10], { ...style, url: m[10] });
    else if (m[11] !== undefined) push(m[11], style);
    last = re.lastIndex;
  }
  push(src.slice(last), style);
  return out;
}
