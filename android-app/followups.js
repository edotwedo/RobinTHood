// Follow-up chips ride on the same model reply. The model ends its answer with
// a fixed marker and 2 or 3 short questions. No second request.
export const FOLLOWUPS_MARKER = '<<FOLLOWUPS>>';

const ACTION_LINE = /^(SEARCH FILES|SEARCH|OPEN|READ|WRITE|APPEND|LIST FILES|LIST)\b/i;
const MAX_QUESTION = 180;

export function followupInstruction() {
  return (
    'After your final answer only, and never after an action line, add a line that is exactly ' +
    `${FOLLOWUPS_MARKER} and then 2 or 3 short follow-up questions the user might ask next, one per line, ` +
    'in the same language as the answer. No numbers or bullets. Do not mention this marker in the answer itself.'
  );
}

function questionLine(line) {
  const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!cleaned || cleaned.length > MAX_QUESTION) return '';
  if (ACTION_LINE.test(cleaned)) return '';
  if (cleaned.includes(FOLLOWUPS_MARKER)) return '';
  return cleaned;
}

// Split a reply into the text to show and up to 3 chip questions.
// A marker that is still being streamed (the text ends with a prefix of it) is hidden.
export function splitFollowups(text) {
  const raw = String(text || '');
  const at = raw.lastIndexOf(FOLLOWUPS_MARKER);
  let body = raw;
  let tail = '';
  if (at >= 0) {
    body = raw.slice(0, at);
    tail = raw.slice(at + FOLLOWUPS_MARKER.length);
  } else {
    const start = raw.lastIndexOf('<<');
    if (start >= 0 && FOLLOWUPS_MARKER.startsWith(raw.slice(start))) {
      body = raw.slice(0, start);
    }
  }
  const questions = [];
  for (const line of tail.split(/\r?\n/)) {
    const q = questionLine(line);
    if (!q || questions.includes(q)) continue;
    questions.push(q);
    if (questions.length === 3) break;
  }
  return { text: body.replace(/\s+$/, ''), questions };
}
