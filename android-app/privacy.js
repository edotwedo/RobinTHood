// Privacy and data-handling helpers for RobinTHood. Plain JS with no app imports, so it
// runs under `node --test` as well as in the app. Everything here runs on the phone;
// nothing is sent anywhere.

// ---- Who might see your messages -------------------------------------------------
// Robin connects to multiple AI models and seamlessly cascades between them
// between them. We only claim what the providers say, and say when we can't confirm it.
//   stated     the provider says it doesn't store prompts or train on them (its own claim)
//   may-collect we could not confirm that; free tiers often log or train on prompts
//   private    stays on the user's own machine
export const PRIVACY_LEVELS = {
  stated: { mark: '', short: 'Provider says no storage or training', tone: 'ok' },
  'may-collect': { mark: '*', short: 'May collect your messages', tone: 'warn' },
  private: { mark: '', short: 'Stays on your own computer', tone: 'ok' },
};

const OVH_NOTE = 'OVHcloud says prompts are not stored or used to train models, and the servers are in France. That is their own statement on their website, not a contract we can check.';
const KILO_NOTE = 'Kilo\'s free models run on partner providers, and some of them collect or log prompts. Kilo does not tell us which, and "Kilo Auto" picks the model itself, so we cannot confirm this one is safe.';

const ENGINE_PRIVACY = {
  'ovh-120b': { level: 'stated', provider: 'OVHcloud', note: OVH_NOTE },
  'ovh-qwen-big': { level: 'stated', provider: 'OVHcloud', note: OVH_NOTE },
  'ovh-qwen': { level: 'stated', provider: 'OVHcloud', note: OVH_NOTE },
  'ovh-qwen-vl': { level: 'stated', provider: 'OVHcloud', note: OVH_NOTE },
  'kilo-cohere': { level: 'may-collect', provider: 'Kilo (free models)', note: KILO_NOTE },
  'kilo-auto': { level: 'may-collect', provider: 'Kilo (free models)', note: KILO_NOTE },
  ollama: { level: 'private', provider: 'Your own Ollama server', note: 'Runs on a computer you control. Robin does not send these messages anywhere else.' },
  openrouter: { level: 'may-collect', provider: 'OpenRouter (your key)', note: 'Free OpenRouter models can log prompts. Check the data policy of the model you chose on OpenRouter.' },
  // Auto tries OVH first but falls through to Kilo when OVH is busy or fails.
  auto: { level: 'may-collect', provider: 'Whichever is free right now', note: 'Auto starts with OVHcloud but can fall back to Kilo\'s free models, so any message may end up with a service that collects data.' },
};

const UNKNOWN = { level: 'may-collect', provider: 'Unknown', note: 'We could not confirm how this service handles your messages.' };

export const privacyOf = (engineId) => ({ ...(ENGINE_PRIVACY[engineId] || UNKNOWN), ...(PRIVACY_LEVELS[(ENGINE_PRIVACY[engineId] || UNKNOWN).level]) });
export const markFor = (engineId) => privacyOf(engineId).mark;
export const mayCollect = (engineId) => privacyOf(engineId).level === 'may-collect';

// ---- Spotting things you probably shouldn't paste --------------------------------
const luhn = (digits) => {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
};

const FINDERS = [
  { type: 'secret', label: 'API key or token', re: /(?:(?:sk|rk)[-_][A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{30,}|ya29\.[0-9A-Za-z_-]+|Bearer\s+[A-Za-z0-9._~+/-]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,})(?![A-Za-z0-9_-])/g },
  { type: 'card', label: 'card number', re: /(?<!\d)(?:\d[ -]?){13,19}\b/g, ok: (m) => { const d = m.replace(/\D/g, ''); return d.length >= 13 && d.length <= 19 && luhn(d); } },
  { type: 'ssn', label: 'Social Security number', re: /(?:\b\d{3}-\d{2}-\d{4}\b|\b\d{3}\s\d{2}\s\d{4}\b)/g },
  { type: 'email', label: 'email address', re: /(?<![A-Z0-9._%+-])[A-Z0-9._%+-]{1,64}@[A-Z0-9.-]+\.[A-Z]{2,}/gi },
  { type: 'password', label: 'password or PIN', re: /\b(?:password|passcode|passphrase|pin|pw)\s*(?:is|:|=|(?<=\bpin\s+))\s*\S+/gi },
  { type: 'phone', label: 'phone number', re: /(?<![\w.])(?:\+?\d{1,3}[\s.-]?)?(?:\(\d{3}\)|\d{3})[\s.-]?\d{3}[\s.-]?\d{4}(?!\d)/g },
  { type: 'address', label: 'street address', re: /\b\d{1,5}\s+(?:[A-Za-z]+\s){1,3}(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\b\.?/gi },
];

export function detectSensitive(text) {
  const src = String(text || '');
  const claimed = [];
  const found = [];
  for (const f of FINDERS) {
    for (const m of src.matchAll(f.re)) {
      const start = m.index, end = m.index + m[0].length;
      if (f.ok && !f.ok(m[0])) continue;
      if (claimed.some(([a, b]) => start < b && end > a)) continue;
      claimed.push([start, end]);
      found.push({ type: f.type, label: f.label, text: m[0], start, end });
    }
  }
  return found.sort((a, b) => a.start - b.start);
}

const PLACEHOLDER = { secret: '[KEY]', card: '[CARD]', ssn: '[SSN]', email: '[EMAIL]', password: '[PASSWORD]', phone: '[PHONE]', address: '[ADDRESS]' };

export function maskSensitive(text) {
  const src = String(text || '');
  const found = detectSensitive(src);
  let out = '';
  let last = 0;
  for (const f of found) {
    out += src.slice(last, f.start) + PLACEHOLDER[f.type];
    last = f.end;
  }
  return { text: out + src.slice(last), count: found.length, found };
}

/**
 * Bi-directional PII Tokenization for privacy-first cloud querying.
 * Replaces real sensitive values with semantic placeholder variables ([EMAIL_1], [SECRET_1])
 * and preserves a mapping so the client can restore the real values upon receiving the AI response.
 */
export function tokenizeSensitive(text, existingMap = {}, customEntities = {}) {
  let src = String(text || '');
  const tokenMap = { ...existingMap };
  const reverseMap = {};
  for (const [k, v] of Object.entries(tokenMap)) {
    reverseMap[v] = k;
  }

  // 1. Process custom user-defined vault entities (e.g. project codenames, client names)
  if (customEntities && typeof customEntities === 'object') {
    for (const [entityName, placeholder] of Object.entries(customEntities)) {
      if (!entityName || !placeholder) continue;
      if (src.includes(entityName)) {
        src = src.split(entityName).join(placeholder);
        tokenMap[placeholder] = entityName;
        reverseMap[entityName] = placeholder;
      }
    }
  }

  // 2. Detect standard PII (emails, secrets, cards, phones, etc.)
  const found = detectSensitive(src);
  const typeCounts = {};

  // Count existing types in tokenMap to maintain monotonic numbering
  for (const placeholder of Object.keys(tokenMap)) {
    const m = placeholder.match(/^\[([A-Z]+)_(\d+)\]$/);
    if (m) {
      const type = m[1];
      const num = parseInt(m[2], 10);
      typeCounts[type] = Math.max(typeCounts[type] || 0, num);
    }
  }

  let out = '';
  let last = 0;
  let count = 0;

  for (const f of found) {
    const secretVal = f.text;
    let placeholder = reverseMap[secretVal];

    if (!placeholder) {
      const tagType = f.type.toUpperCase();
      typeCounts[tagType] = (typeCounts[tagType] || 0) + 1;
      placeholder = `[${tagType}_${typeCounts[tagType]}]`;
      tokenMap[placeholder] = secretVal;
      reverseMap[secretVal] = placeholder;
    }

    out += src.slice(last, f.start) + placeholder;
    last = f.end;
    count++;
  }

  out += src.slice(last);
  return {
    tokenizedText: out,
    tokenMap,
    count,
  };
}

/**
 * Re-hydrates tokenized placeholders in an AI response back to the user's real local data.
 */
export function detokenizeText(text, tokenMap = {}) {
  if (!text || !tokenMap || typeof tokenMap !== 'object') return text || '';
  let out = String(text);
  for (const [placeholder, original] of Object.entries(tokenMap)) {
    if (placeholder && original !== undefined) {
      out = out.split(placeholder).join(original);
    }
  }
  return out;
}

// ---- Self check -----------------------------------------------------------------
// Five quick questions, scored 0 to 2 each. The answers stay on the phone.
export const SELF_CHECK = [
  { id: 'use', q: 'What do you mostly use Robin for?', options: ['General questions, ideas, homework', 'Work, school projects or business', 'Health, money, legal or relationships'] },
  { id: 'paste', q: 'Do you paste in emails, messages, documents or code?', options: ['Never', 'Sometimes', 'Often'] },
  { id: 'people', q: 'Do your chats include other people\'s names, messages or details?', options: ['No', 'Sometimes', 'Often'] },
  { id: 'harm', q: 'If a stranger read your chats, how bad would it be?', options: ['No big deal', 'Embarrassing or awkward', 'Could cost me money, a job or my safety'] },
  { id: 'mixed', q: 'Do you mix private and everyday topics in the same chat?', options: ['No, I start new chats', 'Sometimes', 'Yes, all in one'] },
];

export const AVOID = [
  'Passwords, PINs, recovery codes and API keys',
  'Card, bank and account numbers',
  'Social Security, passport or driver\'s license numbers',
  'Medical records or diagnoses with your name attached',
  'Private messages or details about other people',
  'Anything under an NDA, or your employer\'s confidential files',
  'Your exact home address together with your name',
];

export const FINE = [
  'General questions, learning, recipes, travel ideas',
  'Public information, news, how-to help',
  'Homework and writing help with no personal details',
  'Code questions, as long as the data in them is made up and the keys are removed',
  'Anything you would be comfortable saying out loud in a coffee shop',
];

export const OBFUSCATE = [
  'Swap names for roles: "my manager", "my friend", "Client A".',
  'Replace real numbers with made-up ones of the same shape: 100-200 instead of your exact salary.',
  'Cut identifiers out of pasted text before you send it, or tap Mask when Robin offers.',
  'Ask the hypothetical version: "What if someone has X and Y?" instead of "I have X and Y."',
  'Keep secrets out entirely, and add them back yourself after you get the answer.',
  'Start a new chat for sensitive topics, so old messages are not sent along with it.',
  'For truly private things, use a model with no * or your own Ollama server.',
  'Masking helps but is not a guarantee: details together can still point to you. When in doubt, leave it out.',
];

export function assess(answers) {
  const score = SELF_CHECK.reduce((n, q) => n + (Number(answers?.[q.id]) || 0), 0);
  const tier = score <= 2 ? 'low' : score <= 5 ? 'medium' : 'high';
  const result = {
    low: { headline: 'Low risk', body: 'You mostly use Robin for everyday things, so you have little to worry about. Still keep passwords, card numbers and ID numbers out of every chat.' },
    medium: { headline: 'Some risk', body: 'Parts of what you share could matter. Prefer models with no *, mask personal details before sending, and start a new chat for anything sensitive.' },
    high: { headline: 'Higher risk', body: 'What you share could cause real harm if it leaked. Use a model with no * or your own Ollama server, keep names and numbers out, and avoid pasting full documents or messages.' },
  }[tier];
  return { score, tier, ...result };
}

export function entityToPlaceholder(name) {
  const clean = String(name || '').trim().toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  return `[${clean || 'SECRET'}]`;
}

export function parseVaultSecrets(content) {
  if (!content) return {};
  let parsed;
  if (typeof content === 'object') {
    parsed = content;
  } else {
    try {
      parsed = JSON.parse(content);
    } catch {
      return {};
    }
  }
  const result = {};
  if (Array.isArray(parsed)) {
    for (const item of parsed) {
      if (typeof item === 'string' && item.trim()) {
        result[item.trim()] = entityToPlaceholder(item);
      } else if (item && typeof item === 'object') {
        for (const [k, v] of Object.entries(item)) {
          if (k.trim()) result[k.trim()] = String(v).startsWith('[') ? String(v) : entityToPlaceholder(v);
        }
      }
    }
  } else if (parsed && typeof parsed === 'object') {
    for (const [k, v] of Object.entries(parsed)) {
      if (k.trim()) {
        result[k.trim()] = (typeof v === 'string' && v.startsWith('[')) ? v : entityToPlaceholder(v || k);
      }
    }
  }
  return result;
}

export function parseFrontmatterEntities(text) {
  if (!text || typeof text !== 'string') return {};
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return {};
  const frontmatter = match[1];
  const lines = frontmatter.split(/\r?\n/);
  const entities = {};
  let inSecretsBlock = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    if (/^(?:secrets|shield|vault_secrets):\s*$/i.test(trimmed)) {
      inSecretsBlock = true;
      continue;
    }

    if (inSecretsBlock) {
      if (!line.startsWith(' ') && !line.startsWith('\t') && !line.startsWith('-')) {
        inSecretsBlock = false;
        continue;
      }
      const listMatch = trimmed.match(/^-\s+(.+)$/);
      if (listMatch) {
        const item = listMatch[1].replace(/^["']|["']$/g, '').trim();
        const kvMatch = item.match(/^([^:]+):\s*(.+)$/);
        if (kvMatch) {
          const k = kvMatch[1].trim().replace(/^["']|["']$/g, '');
          const v = kvMatch[2].trim().replace(/^["']|["']$/g, '');
          entities[k] = v.startsWith('[') ? v : entityToPlaceholder(v);
        } else {
          entities[item] = entityToPlaceholder(item);
        }
        continue;
      }

      const kvMatch = trimmed.match(/^([^:]+):\s*(.*)$/);
      if (kvMatch) {
        const k = kvMatch[1].trim().replace(/^["']|["']$/g, '');
        const v = kvMatch[2].trim().replace(/^["']|["']$/g, '');
        if (v && v !== 'true' && v !== 'false') {
          entities[k] = v.startsWith('[') ? v : entityToPlaceholder(v);
        } else {
          entities[k] = entityToPlaceholder(k);
        }
      }
    }
  }
  return entities;
}

export const HOW_IT_WORKS = [
  'RobinTHood connects to multiple leading AI models and moves between them when one is busy, rate limited or down. We do that routing so you do not need accounts or a subscription.',
  'Free usually has strings. Providers limit how much you can use, and some free services log or learn from the messages sent to them.',
  'A * next to a model means we could not confirm it leaves your messages alone. No * means the provider says it does not store or train on them, and that is their statement, not a guarantee.',
  'Robin has no analytics of its own. The free version shows Google ads, and Google\'s ads SDK collects device identifiers such as the advertising ID; you are asked for consent where the law requires it. Your chats stay on your phone, but each message is sent to the model service you are using, so it can see that message and the recent chat that goes with it.',
  'If the model you picked has no * and it is busy, Robin asks before it uses one marked *, and offers to mask private details first.',
];
