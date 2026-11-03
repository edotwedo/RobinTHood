// When falling back from the chosen model needs the user's OK. Plain JS with no app
// imports, so it runs under `node --test` as well as in the app.
//
// Picking a model with no * is a privacy choice. If that model is busy, the cascade must
// not quietly hand the message to a service that may collect it; and a message meant for
// the user's own Ollama must not quietly leave their computer at all.
import { privacyOf } from './privacy.js';
import { textOf } from './photos.js';

const RANK = { private: 0, stated: 1, 'may-collect': 2 };
const rankOf = (id) => RANK[privacyOf(id).level] ?? RANK['may-collect'];

// True when moving from the chosen model to `toId` is a step down in privacy.
// Auto already says it can land anywhere, so it never asks.
export function fallbackNeedsConsent(chosen, toId) {
  if (!chosen || chosen === 'auto' || toId === chosen) return false;
  return rankOf(toId) > rankOf(chosen);
}

// The text that came from the user (their messages and files Robin read), which is what
// the sensitive-data check should look at. Web pages are full of emails and phone numbers
// that are not the user's, so their RESULT turns (webTurns, a Set of those messages) are
// left out. Tracked outside the messages, which go to the provider as they are.
export function userTextOf(messages, webTurns = new Set()) {
  return messages
    .filter((m) => m.role === 'user' && !webTurns.has(m))
    .map((m) => textOf(m.content))
    .join('\n');
}

export const KEYLESS_ENGINE_IDS = [
  'ovh-120b',
  'ovh-qwen-big',
  'ovh-qwen',
  'ovh-qwen-vl',
  'kilo-cohere',
  'kilo-auto',
];

const VISION_IDS = new Set(['ovh-qwen-big', 'ovh-qwen-vl', 'kilo-auto']);
export const canSee = (id) => VISION_IDS.has(id);

export function engineOrder(settings = {}, { vision = false } = {}) {
  if (settings?.airGapped) {
    return ['ollama'];
  }
  const chosen = settings?.selectedModel || 'auto';
  const cascade = [];
  if (chosen !== 'auto') cascade.push(chosen);
  if (settings?.ollamaUrl) cascade.push('ollama');
  for (const id of KEYLESS_ENGINE_IDS) cascade.push(id);
  if (settings?.openRouterKey) cascade.push('openrouter');
  const own = (id) => id === chosen && (id === 'ollama' || id === 'openrouter');
  return [...new Set(cascade)].filter((id) => !vision || canSee(id) || own(id));
}
