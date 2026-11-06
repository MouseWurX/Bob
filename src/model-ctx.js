// 1.5.87: how much each brain keeps in mind (context), picked per model. Asked for: set it as
// the model loads, with a switch, and never offer a size the model wasn't made for. Off: Bob picks (his defaults per
// model and session, sessions.js). On: a size picked for a brain wins everywhere that brain runs, so every copy
// on the same file still shares one load. The menu only lists sizes up to the most the model was made for, read
// from the model itself (the GGUF header on Bob's own engine, /api/show on Ollama).
import { CTX_CHOICES, brainDefaults, DEFAULT_CTX } from './sessions.js';

export const ctxOn = (cfg) => cfg?.brainCtxOn === true;
// When a brain's own limit can't be read, only sizes every brain handles are offered.
export const SAFE_CTX = 32768;
export const ctxLabel = (v) => `${Math.round(v / 1024)}K`;
// Settings review (1.5.87): in a Gaming session the brain runs on the processor, so a hand pick never grows it past
// the Gaming session's own size while a game may be running.
export const GAMING_CTX = DEFAULT_CTX.light;

// The sizes to offer for a brain made for up to `max` tokens (null: limit unknown).
export function choicesFor(max) {
  const top = Number(max) > 0 ? Number(max) : SAFE_CTX;
  return CTX_CHOICES.filter((v) => v <= top);
}

// The size picked by hand for this brain, if the switch is on and it's a size the brain was made for.
export function pickedCtx(cfg, model, max = null) {
  if (!ctxOn(cfg) || !model) return null;
  const v = cfg.brainCtx?.[model];
  if (!CTX_CHOICES.includes(v)) return null;
  return max && v > max ? null : v;
}

// What Bob uses for a brain when nothing is picked by hand (for the menu's first line).
export function bobsPick(model, hat = 'bob') {
  return brainDefaults(model, hat).ctx || DEFAULT_CTX.normal;
}

// A short guideline for a brain, from its limit and Bob's pick (settings text, so Bob in the third person).
export function ctxGuide(max, pick, { gaming = false } = {}) {
  const parts = [];
  if (!max) parts.push(`Bob couldn't read how much this brain was made for, so the menu only goes up to ${ctxLabel(SAFE_CTX)}, which every brain handles.`);
  else {
    parts.push(`Made for up to ${ctxLabel(max)}.`);
    if (pick) parts.push(`Bob uses ${ctxLabel(Math.min(pick, max))} unless you pick.`);
    parts.push('Bigger reads longer files and chats, but uses more memory and takes longer to read when it\'s full.');
  }
  if (gaming) parts.push(`In a Gaming session this brain runs on the processor, so Bob keeps it at ${ctxLabel(GAMING_CTX)} while you play and doesn't take RAM from your game.`);
  return parts.join(' ');
}

// Settings: { model name: size }. Only known sizes, plain model names, a sane number of them.
export function cleanBrainCtx(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, n] of Object.entries(v).slice(0, 64)) {
    if (typeof k !== 'string' || !k || k.length > 200 || /[\u0000-\u001f]/.test(k)) continue;
    if (n === null) { out[k] = null; continue; }
    if (CTX_CHOICES.includes(n)) out[k] = n;
  }
  return out;
}
