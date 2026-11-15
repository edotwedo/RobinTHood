const FM_RE = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/;

/**
 * Parse Obsidian-style note metadata from markdown text.
 * Pure function, no app imports.
 * @param {string} text
 * @returns {{links: string[], tags: string[], frontmatter: Record<string, any>}}
 */
export function parseNoteMeta(text = '') {
  const input = String(text ?? '');
  let body = input;
  const frontmatter = {};

  const fm = input.match(FM_RE);
  if (fm) {
    body = input.slice(fm[0].length);
    parseFrontmatter(fm[1], frontmatter);
  }
  // Code is not metadata: drop fenced blocks and inline code before scanning for links/tags.
  body = body.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '').replace(/`[^`\n]*`/g, '');

  const links = [];
  const seenLinks = new Set();
  const linkRe = /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g;
  let m;
  while ((m = linkRe.exec(body)) !== null) {
    const name = m[1].trim();
    if (name && !seenLinks.has(name)) {
      seenLinks.add(name);
      links.push(name);
    }
  }

  const tags = new Set();
  const lines = body.split(/\r?\n/);
  for (const line of lines) {
    // Skip markdown heading marker content when scanning for inline tags,
    // but still allow inline tags elsewhere on the line.
    const scan = /^#{1,6}\s/.test(line) ? line.replace(/^#{1,6}\s+/, '') : line;
    const tagRe = /(?:^|[\s([{'"])(#([A-Za-z][A-Za-z0-9_\-/]*))/g;
    while ((m = tagRe.exec(scan)) !== null) {
      tags.add(m[2]);
    }
  }

  addFrontmatterTags(frontmatter, tags);

  return { links, tags: [...tags], frontmatter };
}

function parseFrontmatter(block, out) {
  const lines = block.split(/\r?\n/);
  let key = null;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, '');
    const kv = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (kv) {
      key = kv[1];
      const val = kv[2].trim();
      if (val === '') {
        if (!(key in out)) out[key] = [];
        continue;
      }
      if (val.startsWith('[') && val.endsWith(']')) {
        out[key] = val
          .slice(1, -1)
          .split(',')
          .map((s) => unquote(s.trim()))
          .filter(Boolean);
      } else {
        out[key] = unquote(val);
      }
      continue;
    }
    const item = line.match(/^\s*-\s*(.+)$/);
    if (item && key) {
      if (!Array.isArray(out[key])) out[key] = out[key] == null || out[key] === '' ? [] : [String(out[key])];
      out[key].push(unquote(item[1].trim()));
    }
  }
}

function addFrontmatterTags(frontmatter, tags) {
  const ft = frontmatter && frontmatter.tags;
  if (ft == null) return;
  const add = (v) => {
    const t = String(v).replace(/^#/, '').trim();
    if (t) tags.add(t);
  };
  if (Array.isArray(ft)) ft.forEach(add);
  else if (typeof ft === 'string') {
    // support "a, b" or "a b" or "[a,b]" leftover string forms
    const s = ft.trim();
    if (s.startsWith('[') && s.endsWith(']')) {
      s.slice(1, -1).split(',').forEach(add);
    } else {
      s.split(/[,\s]+/).forEach(add);
    }
  } else {
    add(ft);
  }
}

function unquote(s) {
  if ((s.startsWith('"') && s.endsWith('"')) || (s.startsWith("'") && s.endsWith("'"))) {
    return s.slice(1, -1);
  }
  return s;
}
