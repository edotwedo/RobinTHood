/**
 * LAN Ollama auto-discovery and health check.
 * Searches common local/LAN endpoints for running Ollama instances
 * and retrieves installed models.
 */

export async function checkOllamaEndpoint(baseUrl, timeoutMs = 2000) {
  if (!baseUrl) return null;
  const clean = baseUrl.replace(/\/+$/, '');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);

  try {
    const res = await fetch(`${clean}/api/tags`, {
      method: 'GET',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;

    const data = await res.json();
    const models = Array.isArray(data?.models) ? data.models.map((m) => m.name || m.model).filter(Boolean) : [];
    return {
      url: clean,
      models,
      recommendedModel: models[0] || 'llama3.2',
    };
  } catch {
    clearTimeout(timer);
    return null;
  }
}

export async function discoverOllamaLan(customCandidates = [], timeoutMs = 2000) {
  const defaultCandidates = [
    'http://localhost:11434',
    'http://127.0.0.1:11434',
    'http://10.0.2.2:11434', // Android emulator host alias
  ];

  const candidates = Array.from(new Set([...customCandidates.filter(Boolean), ...defaultCandidates]));

  // Probe candidates concurrently
  const checks = candidates.map((url) => checkOllamaEndpoint(url, timeoutMs));
  const results = await Promise.allSettled(checks);

  for (const r of results) {
    if (r.status === 'fulfilled' && r.value) {
      return r.value;
    }
  }

  return null;
}
