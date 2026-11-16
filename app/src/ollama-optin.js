// Nov 16 2026 (the owner: "by default i want bob to only use the things that are native to him"): Ollama is an
// outside program, so Bob never talks to it unless "Use Ollama too" is switched on (Settings, Engines; useOllama in
// settings.json). Off, nothing asks Ollama what it has (/api/tags), downloads go through Bob's own downloader, and
// Bob hears you with his own engine. An engine of "ollama" written by hand into config.json counts as switched on.
// Reading Ollama's model files from disk (its manifests folder) is not a call to Ollama, so it stays.
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const ollamaOn = (cfg) => cfg?.useOllama === true || cfg?.engine === 'ollama';
// The address to call, or '' while Ollama is off.
export const ollamaUrl = (cfg) => (ollamaOn(cfg) ? String(cfg.ollamaUrl || OLLAMA_URL).replace(/\/$/, '') : '');
