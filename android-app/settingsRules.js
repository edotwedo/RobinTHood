// Pure settings transitions. No React Native imports, so node --test can run them.

// Turning Local-only on forces web search off. Turning it off puts web search
// back to whatever it was before, which is on when this build has no saved value.
export function applyLocalOnlyToggle(settings) {
  const next = !settings.airGapped;
  if (next) {
    return {
      ...settings,
      airGapped: true,
      webSearchBeforeLocal: settings.webSearch,
      webSearch: false,
      selectedModel: 'ollama',
    };
  }
  const had = Object.prototype.hasOwnProperty.call(settings, 'webSearchBeforeLocal');
  return {
    ...settings,
    airGapped: false,
    webSearch: had ? !!settings.webSearchBeforeLocal : true,
    selectedModel: settings.selectedModel === 'ollama' ? 'ovh-120b' : settings.selectedModel,
  };
}

// A normal question must not open the folder picker. Ask only when a file action
// needs the folder, and only until the user skips or chooses one.
export function folderPromptAction(settings, { prompt = false } = {}) {
  if (settings?.filesUri) return 'use';
  if (!prompt || settings?.folderSkipped) return 'skip';
  return 'ask';
}

// S-01: Background music must start disabled on first run so the app opens silently.
export function defaultSettings(overrides = {}) {
  return {
    selectedModel: 'ovh-120b',
    webSearch: true,
    music: false,
    musicVolume: 0.3,
    filesUri: '',
    ollamaUrl: '',
    ollamaModel: '',
    openRouterKey: '',
    openRouterModel: '',
    obsidianVault: '',
    airGapped: false,
    folderSkipped: false,
    isPro: false,
    ...overrides,
  };
}
