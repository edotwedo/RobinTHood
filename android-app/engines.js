// Model engines and the request cascade.
// Every request sends the whole conversation (system prompt + recent turns),
// so the model can see what was said earlier.
import { fetch } from 'expo/fetch';

const OVH = 'https://oai.endpoints.kepler.ai.cloud.ovh.net/v1/chat/completions';
const KILO = 'https://ai-gateway.kilo.ai/api/v1/chat/completions';
const OPENROUTER = 'https://openrouter.ai/api/v1/chat/completions';

// Free, keyless engines. Order here is the Auto cascade order.
// kilo-auto lets Kilo pick the model (that's where unwanted picks come from),
// so it is last.
export const KEYLESS_ENGINES = [
  { id: 'ovh-120b', label: 'GPT-OSS 120B', model: 'gpt-oss-120b', url: OVH },
  { id: 'ovh-qwen-big', label: 'Qwen 3.5 397B', model: 'Qwen3.5-397B-A17B', url: OVH },
  { id: 'ovh-qwen', label: 'Qwen 3.8 27B', model: 'Qwen3.8-27B', url: OVH },
  { id: 'kilo-nemotron', label: 'Nemotron 120B', model: 'nvidia/nemotron-3-super-120b-a12b:free', url: KILO },
  { id: 'kilo-cohere', label: 'Cohere North Mini', model: 'cohere/north-mini-code:free', url: KILO },
  { id: 'kilo-auto', label: 'Kilo Auto (Kilo picks)', model: 'kilo-auto/free', url: KILO },
];

export const SYSTEM_PROMPT =
  'You are Robin, the assistant inside the RobinTHood app. Be direct and useful. ' +
  'Answer the question that was asked, in plain language. Do not lecture, moralize, ' +
  'or pile on disclaimers and warnings the user did not ask for. Treat the user as a ' +
  'capable adult. Use the earlier messages in this conversation: remember what the user ' +
  'already told you and build on it instead of asking again.';

// Keep the request a sensible size: newest turns first, up to a character budget.
const HISTORY_CHAR_BUDGET = 24000;

export function buildMessages(history, webContext) {
  const turns = history
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && m.content && !m.error && !m.intro)
    .map((m) => ({ role: m.role, content: m.content }));
  const kept = [];
  let used = 0;
  for (let i = turns.length - 1; i >= 0; i--) {
    used += turns[i].content.length;
    if (used > HISTORY_CHAR_BUDGET && kept.length > 0) break;
    kept.unshift(turns[i]);
  }
  // Conversations must start with a user turn for some providers.
  while (kept.length && kept[0].role !== 'user') kept.shift();
  const today = new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  // One system message: some providers reject more than one.
  let system = `${SYSTEM_PROMPT} Today is ${today}.`;
  if (webContext) system += `\n\n${webContext}`;
  return [{ role: 'system', content: system }, ...kept];
}

function stripThink(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '');
}

// Read an OpenAI-style SSE stream, calling onChunk with the text so far.
async function readSSE(res, onChunk, signal) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
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
      const data = line.slice(5).trim();
      if (data === '[DONE]') return full;
      try {
        const json = JSON.parse(data);
        const delta = json.choices?.[0]?.delta?.content ?? json.choices?.[0]?.message?.content;
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

async function streamOpenAI({ url, model, headers, messages, onChunk, signal, firstTokenMs = 45000 }) {
  const ctrl = new AbortController();
  const onAbort = () => ctrl.abort();
  signal?.addEventListener?.('abort', onAbort);
  let gotFirst = false;
  const timer = setTimeout(() => { if (!gotFirst) ctrl.abort(); }, firstTokenMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'User-Agent': 'RobinTHood-Android/0.6',
        Accept: 'text/event-stream',
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify({ model, stream: true, messages }),
    });
    if (!res.ok) {
      const body = (await res.text()).replace(/\s+/g, ' ').slice(0, 160);
      throw new Error(`HTTP ${res.status} ${body}`);
    }
    const text = await readSSE(res, (t) => { gotFirst = true; onChunk(t); }, signal);
    const clean = stripThink(text).trim();
    if (!clean) throw new Error('Empty reply');
    return clean;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener?.('abort', onAbort);
  }
}

async function streamOllama({ baseUrl, model, messages, onChunk, signal }) {
  const url = baseUrl.replace(/\/+$/, '') + '/api/chat';
  const res = await fetch(url, {
    method: 'POST',
    signal,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: model || 'llama3.1', stream: true, messages }),
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

function runEngine(id, settings, messages, onChunk, signal) {
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
      messages, onChunk, signal,
    });
  }
  const e = KEYLESS_ENGINES.find((x) => x.id === id);
  if (!e) throw new Error(`Unknown model ${id}`);
  return streamOpenAI({ url: e.url, model: e.model, messages, onChunk, signal });
}

export function labelFor(id, settings) {
  return availableModels(settings).find((m) => m.id === id)?.label ?? id;
}

// Try the chosen model; if it fails, fall through the rest of the cascade.
export async function complete({ history, settings, onChunk, signal, webContext }) {
  const messages = buildMessages(history, webContext);
  const chosen = settings.selectedModel || 'auto';
  const cascade = [];
  if (chosen !== 'auto') cascade.push(chosen);
  if (settings.ollamaUrl) cascade.push('ollama');
  for (const e of KEYLESS_ENGINES) cascade.push(e.id);
  if (settings.openRouterKey) cascade.push('openrouter');
  const order = [...new Set(cascade)];

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
