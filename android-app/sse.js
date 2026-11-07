// Server-sent-event reading for the OpenAI-style streaming engines. Kept apart from
// engines.js (which imports expo/fetch) so node --test can load it.

// Removes reasoning: closed <think> blocks, a stray </think> with no opener, and a
// <think> still open (mid-stream), so reasoning never shows in the answer bubble.
export function stripThink(text) {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^[\s\S]*?<\/think>/i, '').replace(/<think>[\s\S]*$/i, '');
}

// Read an OpenAI-style SSE stream, calling onChunk with the answer text so far and
// onThinking with the reasoning so far (thinking models stream that first, often for
// a minute or more). onAlive fires on every event, thinking included.
export async function readSSE(res, onChunk, signal, onThinking, onAlive) {
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = '';
  let full = '';
  let thinking = '';
  while (true) {
    if (signal?.aborted) throw new Error('Stopped');
    const { value, done } = await reader.read();
    // On done, flush the decoder and keep the last line even without a trailing newline:
    // a provider that ends on `data: {...}` would otherwise lose its final chunk (#45).
    buf += done ? decoder.decode() : decoder.decode(value, { stream: true });
    const lines = buf.split('\n');
    buf = done ? '' : lines.pop();
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
    if (done) break;
  }
  return full;
}
