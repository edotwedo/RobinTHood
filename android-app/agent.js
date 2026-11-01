// Robin acts for itself. The model decides when to search the web, which pages
// to open, and when to list, read or write files in the user's Robin folder.
// The app carries out each action for real and hands the result back, and the
// model keeps going until it can answer.
//
// Plain-text actions work with every model (no tool-calling support needed):
//   SEARCH: <query>        OPEN: <url>
//   LIST FILES             READ: <file name>
//   WRITE: <file name>  (the file's contents follow on the next lines)
import { buildMessages, engineOrder, labelFor, runEngine } from './engines';
import { pageText, searchWeb } from './web';
import { listAll, listFiles, readAll, readFile, writeAll, writeFile } from './files';

const MAX_STEPS = 8;

const WEB_TOOLS =
  'SEARCH: <query>  -- search the internet (DuckDuckGo). You get titles, links and snippets.\n' +
  'OPEN: <url>  -- read a web page. You get its text.\n';

const FILE_TOOLS =
  'LIST FILES  -- list the files in the user\'s RobinTHood folder on their phone.\n' +
  'READ: <file name>  -- read one of those files.\n' +
  'WRITE: <file name>  -- create or overwrite a file there. Put the complete file contents on the lines after ' +
  'the WRITE line; everything after it is saved as the file. Use Markdown (.md) unless the user asks for another type.\n';

const ALL_FILE_TOOLS =
  'You have full access to the files on the user\'s phone (internal storage). Paths are relative to it, ' +
  'like Documents/notes.md, Download/report.pdf.txt or Music.\n' +
  'LIST FILES: <folder>  -- list a folder (leave the folder out for the top level). Folders end with /.\n' +
  'READ: <path>  -- read a text file.\n' +
  'WRITE: <path>  -- create or overwrite a text file. Put the complete contents on the lines after the WRITE line; ' +
  'everything after it is saved. A bare file name goes in Documents/RobinTHood/. Use Markdown (.md) unless asked otherwise. ' +
  'Folders are created as needed. Only overwrite an existing file when the user asked you to change it.\n';

export function toolPrompt({ web, allFiles }) {
  return (
    'You can take real actions through the RobinTHood app:\n' +
    (web ? WEB_TOOLS : '') + (allFiles ? ALL_FILE_TOOLS : FILE_TOOLS) +
    'To take an action, reply with ONLY that action (the single line, plus the contents for WRITE) and nothing else. ' +
    'The app does it and sends you the result; then take another action or give your final answer. ' +
    `Up to ${MAX_STEPS} actions per message.\n` +
    (web
      ? 'Use the web whenever the question involves anything current, local, specific or checkable ' +
        '(news, weather, prices, scores, hours, people, products, recent events), or when you are not sure. ' +
        'Snippets are thin: OPEN the most promising pages before answering factual questions. ' +
        'Write your own search queries and search again if results are weak. Mention which sites you used.\n'
      : 'Web access is switched off right now (the user can turn on the Web button).\n') +
    'When the user asks you to save, write, make or create a file, note, list or document, use WRITE; you do have access to their folder. ' +
    'Always reply in the same language the user speaks (e.g. Spanish, French, German, Portuguese, Japanese, Chinese, Hindi, etc.). ' +
    'When you are done, answer normally with no action lines. ' +
    'If web searches fail or return no relevant data, clearly inform the user that live web access was unavailable ' +
    'instead of guessing or inventing facts. Never claim you cannot access the user\'s files.'
  );
}

const LINE_RE = /^\s*(?:\*\*)?(SEARCH|OPEN|READ|WRITE)(?:\*\*)?\s*:\s*(.+?)\s*$/im;
const LIST_RE = /^\s*(?:\*\*)?LIST[ _]FILES(?:\*\*)?\s*(?::\s*(.*?))?\s*$/im;

const stripQuotes = (s) => s.replace(/^\*+\s*/, '').replace(/^[`"'<]+|[`"'>]+$/g, '').trim();

// Find an action the model asked for. It only counts when the action opens the reply
// (a little preamble is tolerated); an answer that merely mentions "search:" stays an answer.
export function parseAction(text) {
  const list = text.match(LIST_RE);
  const line = text.match(LINE_RE);
  const m = list && (!line || list.index < line.index) ? list : line;
  if (!m) return null;
  const before = text.slice(0, m.index).trim();
  if (before.length > 400) return null;
  if (m === list) return { kind: 'LIST', arg: stripQuotes(m[1] || '') };
  const kind = m[1].toUpperCase();
  let arg = stripQuotes(m[2]);
  if (kind === 'OPEN') {
    const url = arg.match(/https?:\/\/\S+/);
    if (!url) return null;
    arg = url[0].replace(/[)\].,;]+$/, '');
  }
  if (!arg) return null;
  if (kind === 'WRITE') {
    let body = text.slice(m.index + m[0].length).replace(/^\r?\n/, '');
    const fenced = body.match(/^\s*```[\w-]*\n([\s\S]*?)\n```\s*$/);
    if (fenced) body = fenced[1];
    return { kind, arg, body: body.replace(/\s+$/, '') + '\n' };
  }
  return { kind, arg };
}

// While streaming, hide text that is turning into an action.
function looksLikeAction(partial) {
  const head = partial.slice(0, 450);
  if (LINE_RE.test(head) || LIST_RE.test(head)) return true;
  const lines = partial.split('\n');
  const cur = lines[lines.length - 1].trim().replace(/^\*+/, '').toUpperCase();
  if (!cur || partial.length >= 450) return !cur && partial.trim() === '';
  const starts = (w) => (cur.length <= w.length ? w.startsWith(cur) : cur.startsWith(w));
  return ['SEARCH:', 'OPEN:', 'READ:', 'WRITE:', 'LIST FILES'].some(starts);
}

const host = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; } };

export function stepLabel(a) {
  if (a.kind === 'SEARCH') return `Searching: ${a.arg}`;
  if (a.kind === 'OPEN') return `Reading: ${host(a.arg)}`;
  if (a.kind === 'LIST') return a.arg ? `Looking in: ${a.arg}` : 'Looking at your files';
  if (a.kind === 'READ') return `Opening file: ${a.arg}`;
  return `Saving file: ${a.arg}`;
}

async function runAction(action, ctx) {
  switch (action.kind) {
    case 'SEARCH': {
      if (!ctx.web) return { text: 'Web is switched off. Tell the user to tap the Web button if they want you to search.' };
      const { source, results } = await searchWeb(action.arg, ctx.lang);
      const lines = results.map((r, i) => `[${i + 1}] ${r.title}\n${r.url}\n${r.snippet}`).join('\n\n');
      return { text: `Search results for "${action.arg}" (${source}):\n\n${lines}`, sources: results.map((r) => ({ title: r.title, url: r.url })) };
    }
    case 'OPEN': {
      if (!ctx.web) return { text: 'Web is switched off. Tell the user to tap the Web button if they want you to read pages.' };
      const text = await pageText(action.arg, 6000);
      if (!text) return { text: `Could not read ${action.arg} (blocked, empty, or not a text page). Try another result.` };
      return { text: `Text of ${action.arg}:\n\n${text}`, sources: [{ title: host(action.arg), url: action.arg, opened: true }] };
    }
    case 'LIST': {
      const dir = await ctx.getFolder();
      if (ctx.allFiles) {
        const names = await listAll(action.arg);
        const where = action.arg || 'internal storage (top level)';
        return { text: names.length ? `Contents of ${where}:\n${names.map((n) => `- ${n}`).join('\n')}` : `${where} is empty.` };
      }
      const names = await listFiles(dir);
      return { text: names.length ? `Files in the RobinTHood folder:\n${names.map((n) => `- ${n}`).join('\n')}` : 'The RobinTHood folder is empty.' };
    }
    case 'READ': {
      const dir = await ctx.getFolder();
      const body = ctx.allFiles ? await readAll(action.arg) : await readFile(dir, action.arg);
      return { text: `Contents of ${action.arg}:\n\n${body}` };
    }
    case 'WRITE': {
      const dir = await ctx.getFolder();
      const saved = ctx.allFiles ? await writeAll(action.arg, action.body) : await writeFile(dir, action.arg, action.body);
      return { text: `${saved.replaced ? 'Overwrote' : 'Created'} ${saved.name} (${saved.chars} characters) in the user's RobinTHood folder.`, file: saved.name };
    }
    default:
      return { text: 'Unknown action.' };
  }
}

// Runs one model call, falling through the cascade if an engine fails.
// Sticks with the first engine that works for the rest of the message.
async function callModel(state, messages, onText, signal) {
  const errors = [];
  for (let i = state.engineIndex; i < state.order.length; i++) {
    const id = state.order[i];
    if (signal?.aborted) throw new Error('Stopped');
    try {
      const text = await runEngine(id, state.settings, messages, onText, signal);
      state.engineIndex = i;
      return { id, text };
    } catch (err) {
      if (signal?.aborted) throw new Error('Stopped');
      errors.push(`${labelFor(id, state.settings)}: ${err.message}`);
    }
  }
  throw new Error('Every model failed right now.\n\n' + errors.join('\n'));
}

// ctx: { web: boolean, getFolder: () => Promise<folderUri> }
// onEvent({ type: 'model'|'step'|'text', ... }) keeps the screen updated.
export async function actAndAnswer({ history, settings, signal, onEvent, ctx }) {
  const started = Date.now();
  const messages = buildMessages(history, null, toolPrompt({ web: ctx.web, allFiles: ctx.allFiles }));
  const state = { settings, order: engineOrder(settings), engineIndex: 0 };
  const steps = [];
  const sources = [];
  const files = [];
  let usedId = state.order[0];

  for (let step = 0; step <= MAX_STEPS; step++) {
    const finalTurn = step === MAX_STEPS;
    if (finalTurn) {
      messages.push({ role: 'user', content: 'You have used all your actions. Give your final answer now from what you have, with no action lines.' });
    }
    const { id, text } = await callModel(state, messages, (partial) => {
      if (finalTurn || !looksLikeAction(partial)) onEvent({ type: 'text', text: partial, model: labelFor(state.order[state.engineIndex], settings) });
    }, signal);
    usedId = id;
    onEvent({ type: 'model', model: labelFor(id, settings) });

    const action = finalTurn ? null : parseAction(text);
    if (!action) {
      return {
        ok: true, id, model: labelFor(id, settings), text: text.trim(), steps, sources: dedupe(sources), files,
        seconds: (Date.now() - started) / 1000,
        fellBack: settings.selectedModel !== 'auto' && id !== settings.selectedModel,
      };
    }

    const label = stepLabel(action);
    steps.push(label);
    onEvent({ type: 'step', label, steps: [...steps] });
    let result;
    try {
      result = await runAction(action, ctx);
      if (result.sources) sources.push(...result.sources);
      if (result.file) files.push(result.file);
    } catch (err) {
      result = { text: `${action.kind} failed: ${err.message}.` };
    }
    if (signal?.aborted) throw new Error('Stopped');
    const echo = action.kind === 'LIST' ? `LIST FILES${action.arg ? `: ${action.arg}` : ''}` : action.kind === 'WRITE'
      ? `WRITE: ${action.arg}\n${action.body.length > 1500 ? action.body.slice(0, 1500) + '\n[...]' : action.body}`
      : `${action.kind}: ${action.arg}`;
    messages.push({ role: 'assistant', content: echo });
    messages.push({ role: 'user', content: `RESULT of ${echo.split('\n')[0]}\n\n${result.text}\n\n(Next: another action, or your final answer.)` });
  }
  return { ok: false, text: 'Stopped without an answer.', id: usedId };
}

function dedupe(list) {
  const seen = new Map();
  for (const s of list) {
    const prev = seen.get(s.url);
    if (!prev) seen.set(s.url, s);
    else if (s.opened) seen.set(s.url, { ...prev, opened: true });
  }
  return [...seen.values()].sort((a, b) => (b.opened ? 1 : 0) - (a.opened ? 1 : 0)).slice(0, 8);
}
