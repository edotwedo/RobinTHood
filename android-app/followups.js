// Follow-up chips ride on the same model reply. The model ends its answer with
// a fixed marker and 2 or 3 short questions. No second request.
export const FOLLOWUPS_MARKER = '<<FOLLOWUPS>>';

// A marker line may be bold, quoted, or spaced: **<<FOLLOWUPS>>**, << FOLLOWUPS >>.
const MARKER_LINE = /^[\s*_`#>]*<<\s*FOLLOWUPS\s*>>[\s*_`]*$/i;
const MARKER_TOKEN = /<<\s*FOLLOWUPS\s*>>/gi;
const ACTION_LINE = /^(SEARCH FILES|SEARCH|OPEN|READ|WRITE|APPEND|LIST FILES|LIST)\b/i;
const MAX_QUESTION = 180;

export function followupInstruction() {
  return (
    'After your final answer only, and never after an action line, add a line that is exactly ' +
    `${FOLLOWUPS_MARKER} and then 2 or 3 short follow-up questions the user might ask next, one per line, ` +
    'in the same language as the answer. No numbers or bullets. The marker must be alone on its line. ' +
    'Do not mention this marker in the answer itself, and do not put links in the questions.'
  );
}

function hasLink(line) {
  return /http/i.test(line) || /www\./i.test(line) || /\b(?:[a-z0-9-]+\.)+[a-z]{2,}\b/i.test(line);
}

function questionLine(line) {
  const cleaned = line.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '').trim();
  if (!cleaned || cleaned.length > MAX_QUESTION) return '';
  if (ACTION_LINE.test(cleaned) || hasLink(cleaned) || cleaned.includes('<<')) return '';
  // Prose after a planted marker must not become a chip. A follow-up asks something.
  if (!/[?？]/.test(cleaned)) return '';
  return cleaned;
}

function stripMarkers(text) {
  return text
    .split(/\r?\n/)
    .filter((line) => !MARKER_LINE.test(line))
    .join('\n')
    .replace(MARKER_TOKEN, '');
}

// Hide a marker that is still being streamed, so "<<FOLLOW" never flashes in the bubble.
function hidePartial(text) {
  const start = text.lastIndexOf('<<');
  if (start < 0) return text;
  const tail = text.slice(start);
  if (/^<<\s*FOLLOWUPS\s*>>/i.test(tail)) return text;
  if (/^<<\s*(?:F(?:O(?:L(?:L(?:O(?:W(?:U(?:P(?:S)?)?)?)?)?)?)?)?)?\s*$/i.test(tail)) return text.slice(0, start);
  return text;
}

// Split a reply into the text to show and up to 3 chip questions.
// The block counts only when the marker is alone on its line and every line
// after it is a short question. Anything else stays in the answer, with the
// marker removed, and produces no chips.
export function splitFollowups(text) {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/);
  let markerAt = -1;
  for (let i = 0; i < lines.length; i++) {
    if (MARKER_LINE.test(lines[i])) markerAt = i;
  }
  if (markerAt < 0) {
    return { text: stripMarkers(hidePartial(raw)).replace(/\s+$/, ''), questions: [] };
  }

  const questions = [];
  let valid = true;
  for (const line of lines.slice(markerAt + 1)) {
    if (!line.trim()) continue;
    const q = questionLine(line);
    if (!q) {
      valid = false;
      break;
    }
    if (!questions.includes(q)) questions.push(q);
  }
  if (!valid || questions.length < 1 || questions.length > 3) {
    return { text: stripMarkers(raw).replace(/\s+$/, ''), questions: [] };
  }

  const body = stripMarkers(lines.slice(0, markerAt).join('\n')).replace(/\s+$/, '');
  if (!body.trim()) return { text: questions.join('\n'), questions: [] };
  return { text: body, questions };
}
