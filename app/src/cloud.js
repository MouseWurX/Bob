// Cloud helpers: paid AI services Bob may hand one job to, as a sub-agent. Off unless switched on.
// Keys are never stored by Bob: they come from Windows environment variables you set yourself.
// Addresses are fixed here, so a settings file can't redirect your text somewhere else.
import { deadline as withDeadline } from './hang-guard.js'; // item 212: every network call has a deadline
import { execFileSync } from 'node:child_process';
import { savedKey, userKeysOn, OWNER_KEYS } from './secret-box.js';

// A key added in Windows after Bob started isn't in process.env yet, so also look in the user's
// saved environment (HKCU\Environment). The key's value never leaves this module except in the request to its provider.
// Looked-up registry values are cached for a minute, so the UI's polling doesn't start reg over and over.
const regCache = new Map();
export function keyEnv() {
  return new Proxy(process.env, {
    get(target, k) {
      if (typeof k !== 'string') return undefined;
      // 👥 another user is in (profiles.js): only their own saved keys, never the owner's environment or registry
      if (userKeysOn() && !OWNER_KEYS.includes(k)) return (/^[A-Z0-9_]{3,64}$/.test(k) && savedKey(k)) || undefined;
      if (target.BOB_KEYS === 'store') return (/^[A-Z0-9_]{3,64}$/.test(k) && savedKey(k)) || undefined; // a test Bob (BOB_KEYS=store): only keys saved in its own locked store, never its environment or the registry. Not a setting.
      if (target[k]) return target[k];
      if (target.BOB_KEYS === 'env') return undefined; // a test Bob (BOB_KEYS=env): only the keys it was started with, never the registry or the locked store. Not a setting.
      if (!/^[A-Z0-9_]{3,64}$/.test(k)) return undefined;
      if (process.platform !== 'win32') return savedKey(k) || undefined; // 🔐 a key saved in Settings (secret-box.js)
      const hit = regCache.get(k);
      if (hit && Date.now() - hit.at < 60000) return hit.value;
      let value;
      try {
        // stderr is ignored: reg prints "unable to find" there when the key is missing, and that
        // must never reach Bob's own stderr (the PowerShell launcher treats stderr as fatal).
        const out = execFileSync('reg', ['query', 'HKCU\\Environment', '/v', k], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true, timeout: 3000, encoding: 'utf8' });
        const m = out.match(/REG_(?:EXPAND_)?SZ\s+(.+)\s*$/m);
        value = m ? m[1].trim() : undefined;
      } catch { value = undefined; }
      regCache.set(k, { at: Date.now(), value });
      return value || savedKey(k) || undefined;
    }
  });
}

export const CLOUD_PROVIDERS = [
  { id: 'anthropic', name: 'Claude (Anthropic)', type: 'anthropic', baseUrl: 'https://api.anthropic.com/v1', apiKeyEnv: 'ANTHROPIC_API_KEY', defaultModel: 'claude-sonnet-5-5', models: ['claude-haiku-5-5', 'claude-sonnet-5-5', 'claude-opus-5-5'], keyPage: 'https://console.anthropic.com/settings/keys' },
  { id: 'openai', name: 'OpenAI', type: 'openai', baseUrl: 'https://api.openai.com/v1', apiKeyEnv: 'OPENAI_API_KEY', defaultModel: '', keyPage: 'https://platform.openai.com/api-keys' },
  { id: 'gemini', name: 'Gemini (Google)', type: 'openai', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', apiKeyEnv: 'GEMINI_API_KEY', defaultModel: '', keyPage: 'https://aistudio.google.com/apikey' },
  { id: 'openrouter', name: 'OpenRouter (many models)', type: 'openai', baseUrl: 'https://openrouter.ai/api/v1', apiKeyEnv: 'OPENROUTER_API_KEY', defaultModel: '', keyPage: 'https://openrouter.ai/keys' }
];

// Providers from the built-in list that are switched on, have a model picked, and have a key on this PC.
// Older config.json "cloud" entries still work too.
export function cloudHelpers(cfg, env = keyEnv()) {
  const on = cfg.cloudHelpers || {};
  const out = [];
  for (const p of CLOUD_PROVIDERS) {
    const s = on[p.id] || {};
    const model = s.model || p.defaultModel;
    if (s.enabled === true && model && env[p.apiKeyEnv]) out.push({ ...p, model, maxTokens: s.maxTokens || 4000 });
  }
  for (const c of cfg.cloud || []) {
    if (c.enabled && c.apiKeyEnv && env[c.apiKeyEnv] && !out.some((o) => o.name === c.name)) out.push({ id: c.name, type: 'openai', maxTokens: 4000, ...c });
  }
  return out;
}

export function cloudStatus(cfg, env = keyEnv()) {
  const on = cfg.cloudHelpers || {};
  return CLOUD_PROVIDERS.map((p) => ({
    id: p.id, name: p.name, keyFound: Boolean(env[p.apiKeyEnv]), apiKeyEnv: p.apiKeyEnv, keyPage: p.keyPage,
    enabled: on[p.id]?.enabled === true, model: on[p.id]?.model || p.defaultModel, models: p.models || []
  }));
}

export async function askCloud(c, task, signal, env = keyEnv()) {
  const key = env[c.apiKeyEnv];
  if (!key) throw new Error(`No key for ${c.name} on this replicant matrix.`);
  if (c.type === 'anthropic') {
    const res = await fetch(`${c.baseUrl}/messages`, {
      method: 'POST', signal: withDeadline(signal, 10 * 60_000),
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: c.model, max_tokens: c.maxTokens, messages: [{ role: 'user', content: task }] })
    });
    if (!res.ok) throw new Error(`${c.name} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const j = await res.json();
    return { text: (j.content || []).filter((b) => b.type === 'text').map((b) => b.text).join('\n') || '(no answer)', usage: { in: j.usage?.input_tokens, out: j.usage?.output_tokens } };
  }
  const res = await fetch(`${c.baseUrl.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST', signal: withDeadline(signal, 10 * 60_000),
    headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: c.model, max_tokens: c.maxTokens, messages: [{ role: 'user', content: task }] })
  });
  if (!res.ok) throw new Error(`${c.name} returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return { text: j.choices?.[0]?.message?.content || '(no answer)', usage: { in: j.usage?.prompt_tokens, out: j.usage?.completion_tokens } };
}
