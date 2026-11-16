// Keys, tokens and passcodes, wherever they turn up: shared by the help bundle (help-bundle.js) and the monitoring
// log's details (trace-log.js). No imports, so anything can use it.

// Keys whose values are never written out, wherever they sit in a settings object or a tool's inputs.
export const SECRET_KEY = /pass(code|word)?|token|secret|api[-_]?key|\bkey$|credential|cookie|auth/i;
// Values that look like a key or token, wherever they appear in text.
export const SECRET_VALUE = [
  /\b\d{8,10}:[A-Za-z0-9_-]{30,}\b/g, // Telegram bot token
  /\b[A-Za-z0-9_-]{24,28}\.[A-Za-z0-9_-]{6}\.[A-Za-z0-9_-]{27,40}\b/g, // Discord bot token
  /\bsk-[A-Za-z0-9_-]{16,}\b/g, // OpenAI / Anthropic style keys
  /\bhf_[A-Za-z0-9]{16,}\b/g, // Hugging Face
  /\bAIza[0-9A-Za-z_-]{30,}\b/g, // Google
  /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g, // GitHub
  /\btskey-[A-Za-z0-9_-]{10,}\b/g, // Tailscale
  /\b(?:Bearer|Basic)\s+[A-Za-z0-9+/=_.-]{16,}/g
];
export const SECRET_ENV = ['BOB_TELEGRAM_TOKEN', 'BOB_DISCORD_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'HF_TOKEN', 'TAVILY_API_KEY', 'BRAVE_API_KEY', 'FIRECRAWL_API_KEY'];

// The passcodes and tokens Bob's settings hold, and the keys in the environment.
export function knownSecrets(cfg = {}, env = {}) {
  return [cfg.remote?.passcode, ...(cfg.share?.borrow?.bobs || []).map((b) => b?.passcode), cfg.telegram?.token, cfg.discord?.token, ...SECRET_ENV.map((k) => env[k])]
    .map((x) => String(x || '').trim()).filter((x) => x.length >= 4);
}

// Text with every known secret and every key-looking value replaced by [hidden].
export function hideSecrets(text, secrets = []) {
  let t = String(text ?? '');
  for (const s of secrets) t = t.split(s).join('[hidden]');
  for (const re of SECRET_VALUE) t = t.replace(re, '[hidden]');
  return t;
}
