// Shared validation and plain-language failures for Settings and chat.
export function normalizeOllamaUrl(value) {
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) throw new Error('Enter your Ollama server address in Settings, for example http://192.168.1.10:11434.');
  let url;
  try { url = new URL(raw); } catch { throw new Error('Use a full Ollama address starting with http:// or https://, for example http://192.168.1.10:11434.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !url.hostname || url.username || url.password || url.search || url.hash || (url.pathname && url.pathname !== '/')) {
    throw new Error('Use the Ollama server address only, starting with http:// or https://, without a path, password, or query.');
  }
  return url.origin;
}

export function ollamaHttpError(status) {
  if (status === 404) return new Error('Ollama could not find that model or API. Check the model name in Settings and install it on your server.');
  if (status === 401 || status === 403) return new Error('Your Ollama server refused access. Check your server or proxy access settings.');
  return new Error('Your Ollama server could not answer. Check that Ollama is running and try again.');
}

export async function fetchOllama(fetcher, baseUrl, path, options = {}) {
  const url = normalizeOllamaUrl(baseUrl) + path;
  let response;
  try { response = await fetcher(url, options); }
  catch (error) {
    if (options.signal?.aborted) throw error;
    throw new Error('Cannot reach your Ollama server. Check the address in Settings, keep Ollama running, and connect your phone to the same network or VPN.');
  }
  if (!response.ok) throw ollamaHttpError(response.status);
  return response;
}
