// Photos in the chat. Plain JS with no app imports, so it runs under `node --test` as well
// as in the app.
//
// A user message with a photo keeps its text in `content` and the photo (a shrunk JPEG,
// base64) in `image`. Only the request sent to a model turns that into OpenAI-style
// content parts, and only for the latest few photos, so old photos don't ride along with
// every message or fill the phone's storage.

export const MAX_IMAGES_SENT = 2;
export const MAX_IMAGES_KEPT = 3;
// What a photo costs against the chat's character budget when trimming history.
export const IMAGE_BUDGET_CHARS = 1500;
export const DEFAULT_PHOTO_PROMPT = 'What is in this photo?';

// The text of a message's content, whether it is a string or content parts.
export function textOf(content) {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) return content.filter((p) => p?.type === 'text').map((p) => p.text).join('\n');
  return String(content ?? '');
}

// Masks (or otherwise rewrites) the text of a content, keeping any images as they are.
export function mapText(content, fn) {
  if (Array.isArray(content)) return content.map((p) => (p?.type === 'text' ? { ...p, text: fn(p.text) } : p));
  return fn(textOf(content));
}

export const hasImage = (messages) => messages.some((m) => Array.isArray(m.content) && m.content.some((p) => p?.type === 'image_url'));

// turns: [{ role, content, image? }] oldest first. Returns provider messages where the
// newest `max` photos become content parts and older ones are left out.
export function withImages(turns, max = MAX_IMAGES_SENT) {
  let left = max;
  const out = [];
  for (let i = turns.length - 1; i >= 0; i--) {
    const { role, content, image } = turns[i];
    if (image && left > 0 && role === 'user') {
      left--;
      out.unshift({ role, content: [{ type: 'text', text: content }, { type: 'image_url', image_url: { url: `data:image/jpeg;base64,${image}` } }] });
    } else {
      out.unshift({ role, content });
    }
  }
  return out;
}

// For saving the chat: photos stay on the newest `keep` messages only; older ones keep a
// note that there was a photo.
export function keepRecentImages(messages, keep = MAX_IMAGES_KEPT) {
  let left = keep;
  const out = [...messages];
  for (let i = out.length - 1; i >= 0; i--) {
    if (!out[i].image) continue;
    if (left > 0) left--;
    else out[i] = { ...out[i], image: undefined, imageDropped: true };
  }
  return out;
}
