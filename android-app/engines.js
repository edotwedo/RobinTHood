// Model engines and the request cascade.
// Every request sends the whole conversation (system prompt + recent turns),
// so the model can see what was said earlier.
import { fetch } from 'expo/fetch';
import { IMAGE_BUDGET_CHARS, withImages } from './photos';

const OVH = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
const KILO = 'https://ai-gateway.kilo.ai/api/v1/chat/completions';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

// Free, keyless engines. Order here is the Auto cascade order.
// kilo-auto lets Kilo pick the model (that's where unwanted picks come from),
// so it is last.
// vision: tested to read photos (2026-11-02). Only these are tried for a message with a photo.
export const KEYLESS_ENGINES = [
  { id: 'ovh-120b', label: 'GPT-OSS 120B', model: 'gpt-oss-120b', url: OVH },
  { id: 'ovh-qwen-big', label: 'Qwen 3.5 397B', model: 'Qwen3.5-397B-A17B', url: OVH, vision: true },
  { id: 'ovh-qwen', label: 'Qwen 3.8 27B', model: 'Qwen3.8-27B', url: OVH },
  { id: 'ovh-qwen-vl', label: 'Qwen 2.5 VL 72B (photos)', model: 'Qwen2.5-VL-72B-Instruct', url: OVH, vision: true },
  { id: 'kilo-cohere', label: 'Cohere North Mini', model: 'cohere/north-mini-code:free', url: KILO },
  { id: 'kilo-auto', label: 'Kilo Auto (Kilo picks)', model: 'kilo-auto/free', url: KILO, vision: true },
];

// Whether a free engine is known to read photos.
export const canSee = (id) => Boolean(KEYLESS_ENGINES.find((e) => e.id === id)?.vision);

export const SYSTEM_PROMPT =
  'You are Robin, the assistant inside the RobinTHood app. Be direct and useful. ' +
  'Answer the question that was asked, in plain language. Do not lecture, moralize, ' +
  'or pile on disclaimers and warnings the user did not ask for. Treat the user as a ' +
  'capable adult. Use the earlier messages in this conversation: remember what the user ' +
  'already told you and build on it instead of asking again.';

// Keep the request a sensible size: newest turns first, up to a character budget.
const HISTORY_CHAR_BUDGET = 24000;

export function buildMessages(history, _unused, extraSystem) {
  const turns = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content && !m.error && !m.intro)
    .map((m) => ({ role: m.role, content: m.content, image: m.image }));
  const kept = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    used += turns[i].content.length + (turns[i].image ? IMAGE_BUDGET_CHARS : 0);
    if (used > HISTORY_CHAR_BUDGET && kept.length > 0) break;
    kept.unshift(turns[i]);
  }
  // Conversations must start with a user turn for some providers.
  while (kept.length && kept[0].role !== 'user') kept.shift();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  // One system message: some providers reject more than one.
  let system = `${SYSTEM_PROMPT} Today is ${today}.`;
  if (extraSystem) system += `\n\n${extraSystem}`;
  return [{ role: 'system', content: system }, ...withImages(kept)];
}

// Removes reasoning: closed <think> blocks, a stray </think> with no opener, and a
// <think> still open (mid-stream), so reasoning never shows in the answer bubble.
function stripThink(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').replace(/<think>[\s\S]*$/i, '');
}

// Read an OpenAI-style SSE stream, calling onChunk with the answer text so far and
// onThinking with the reasoning so far (thinking models stream that first, often for
// a minute or more). onAlive fires on every event, thinking included.
async function readSSE(res, onChunk, signal, onThinking, onAlive) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let thinking = '';
  while (true) {
    if (signal?.aborted) throw new Error('Stopped');
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const raw of lines) {
      const line = raw.trim();
      if (!line.startsWith('data:')) continue;
      onAlive?.();
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const json = JSON.parse(data);
        const d = json.choices?.[0]?.delta;
        const reasoning = d?.reasoning ?? d?.reasoning_content;
        if (typeof reasoning === 'string' && reasoning.length) {
          thinking += reasoning;
          onThinking?.(thinking);
        }
        const delta = d?.content ?? json.choices?.[0]?.message?.content;
        if (typeof delta === 'string' && delta.length) {
          full += delta;
          onChunk(stripThink(full));
        }
      } catch {
        // partial or non-JSON line; ignore
      }
    }
  }
  return full;
}

// Free providers rate-limit per phone, and OVH does it per model (2 requests a minute
// each), so after a 429 only that model is skipped for a minute; the other OVH models
// are still tried before the cascade moves on to another provider.
const coolingUntil = new Map();
const COOLDOWN_MS = 60000;

// idleMs: give up only after this long with nothing at all from the model. Thinking
// counts as progress, so a model that reasons for two minutes is not cut off.
async function streamOpenAI({ url, model, headers, messages, onChunk, onThinking, signal, idleMs = 45000 }) {
  if ((coolingUntil.get(`${url}|${model}`) || 0) > Date.now()) throw new Error('Rate limited, skipped for a minute');
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.('abort', onAbort);
  let timer;
  const alive = () => { clearTimeout(timer); timer = setTimeout(() => ctrl.abort(), idleMs); };
  alive();
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'RobinTHood-Android/0.7',
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ model, stream: true, messages }),
    });
    if (!res.ok) {
      if (res.status === 429) coolingUntil.set(`${url}|${model}`, Date.now() + COOLDOWN_MS);
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
      throw new Error(`HTTP ${res.status} ${body}`);
    }
    const text = await readSSE(res, onChunk, signal, onThinking, alive);
    const clean = stripThink(text).trim();
    if (!clean) throw new Error('Empty reply');
    return clean;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

function toOllama(m) {
  if (!Array.isArray(m.content)) return m;
  const text = m.content.filter((p) => p.type === 'text').map((p) => p.text).join('\n');
  const images = m.content.filter((p) => p.type === 'image_url').map((p) => p.image_url.url.replace(/^data:[^,]*,/, ''));
  return { role: m.role, content: text, images };
}

async function streamOllama({ baseUrl, model, messages, onChunk, signal }) {
  const url = baseUrl.replace(/\/+$/, '') + '/api/chat';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    // Ollama takes photos as a base64 list beside the text, not as content parts.
    body: JSON.stringify({ model: model || 'llama3.1', stream: true, messages: messages.map(toOllama) }),
  });
  if (!res.ok) throw new Error(`Ollama HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const json = JSON.parse(line);
        const piece = json.message?.content;
        if (piece) { full += piece; onChunk(stripThink(full)); }
      } catch {}
    }
  }
  const clean = stripThink(full).trim();
  if (!clean) throw new Error('No reply from Ollama');
  return clean;
}

// The list shown in the model picker.
export function availableModels(settings) {
  const list = [{ id: 'auto', label: 'Auto (best free, in order)' }];
  for (const e of KEYLESS_ENGINES) list.push({ id: e.id, label: e.label });
  if (settings.ollamaUrl) list.push({ id: 'ollama', label: `Home Ollama (${settings.ollamaModel || 'llama3.1'})` });
  if (settings.openRouterKey) list.push({ id: 'openrouter', label: `OpenRouter (${settings.openRouterModel || 'openrouter/free'})` });
  return list;
}

export function runEngine(id, settings, messages, onChunk, signal, onThinking) {
  if (id === 'ollama') {
    return streamOllama({ baseUrl: settings.ollamaUrl, model: settings.ollamaModel, messages, onChunk, signal });
  }
  if (id === 'openrouter') {
    return streamOpenAI({
      url: OPENROUTER,
      model: settings.openRouterModel || 'openrouter/free',
      headers: {
        Authorization: `Bearer ${settings.openRouterKey}`,
        'HTTP-Referer': 'https://edotwedo.github.io/RobinTHood',
        'X-Title': 'RobinTHood Android',
      },
      messages, onChunk, onThinking, signal,
    });
  }
  const e = KEYLESS_ENGINES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown model ${id}`);
  return streamOpenAI({ url: e.url, model: e.model, messages, onChunk, onThinking, signal });
}

export function labelFor(id, settings) {
  return availableModels(settings).find((m) => m.id === id)?.label ?? id;
}

// Try the chosen model; if it fails, fall through the rest of the cascade.
// Chosen model first, then the free cascade.
// With { vision: true } (a photo is in the request) only engines known to read photos.
// The user's own Ollama or OpenRouter model is unknown, so it is tried only when it is
// the one they picked: a text-only model there would ignore the photo and guess.
export function engineOrder(settings, { vision = false } = {}) {
  const chosen = settings.selectedModel || 'auto';
  const cascade = [];
  if (chosen !== 'auto') cascade.push(chosen);
  if (settings.ollamaUrl) cascade.push('ollama');
  for (const e of KEYLESS_ENGINES) cascade.push(e.id);
  if (settings.openRouterKey) cascade.push('openrouter');
  const own = (id) => id === chosen && (id === 'ollama' || id === 'openrouter');
  return [...new Set(cascade)].filter((id) => !vision || canSee(id) || own(id));
}

export async function complete({ history, settings, onChunk, signal }) {
  const messages = buildMessages(history);
  const chosen = settings.selectedModel || 'auto';
  const order = engineOrder(settings);

  const errors = [];
  for (const id of order) {
    if (signal?.aborted) throw new Error('Stopped');
    const started = Date.now();
    try {
      onChunk('', id);
      const text = await runEngine(id, settings, messages, (t) => onChunk(t, id), signal);
      return { ok: true, id, model: labelFor(id, settings), text, seconds: (Date.now() - started) / 1000, fellBack: chosen !== 'auto' && id !== chosen };
    } catch (err) {
      if (signal?.aborted) throw new Error('Stopped');
      errors.push(`${labelFor(id, settings)}: ${err.message}`);
    }
  }
  return { ok: false, text: 'Every model failed right now.\n\n' + errors.join('\n'), errors };
}
