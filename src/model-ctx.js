// 1.5.87: how much each brain keeps in mind (context), picked per model. Asked for: set it as
// the model loads, with a switch, and never offer a size the model wasn't made for. Off: Bob picks (his defaults per
// model and session, sessions.js). On: a size picked for a brain wins everywhere that brain runs, so every copy
// on the same file still shares one load. The menu only lists sizes up to the most the model was made for, read
// from the model itself (the GGUF header on Bob's own engine, /api/show on Ollama).
import { CTX_CHOICES, brainDefaults, DEFAULT_CTX } from './sessions.js';

export const ctxOn = (cfg) => cfg?.brainCtxOn === true;

// Long memory (YaRN), asked for with Qwen3.6's own guide: a brain made for 256K can be stretched to read more, by
// telling Bob's engine to spread its positions out (--rope-scaling yarn). Off to start with, and only for the
// brains the guide is for (Qwen3.5/3.6, made for 256K). The stretch is fixed for the whole load, and the guide says
// it makes short chats a little worse, so it's only used while a stretched size is picked for that brain: at 256K
// and below nothing changes. The stretch is the size picked over what the brain was made for (512K is 2x, 1M is 4x).
export const stretchOn = (cfg) => cfg?.brainCtxStretch === true;
export const STRETCH_CHOICES = [524288, 1048576];
export const ALL_CTX = [...CTX_CHOICES, ...STRETCH_CHOICES];
export const STRETCH_MOST = 4; // the guide's own example goes to 4x (about 1M); never further
// Brains the guide covers: Qwen3.5/3.6 (qwen35, qwen35moe in the file), made for 256K. Bob's ladder (Riker, Bill,
// Bobert and the smaller ones) are all cut from Qwen3.6 35B-A3B, so they count.
export function canStretch(info) {
  return Boolean(info && /^qwen35/i.test(String(info.arch || '')) && info.ctxTrain === 262144);
}
// The most a brain can be stretched to (null: it can't).
export const stretchMax = (info) => (canStretch(info) ? info.ctxTrain * STRETCH_MOST : null);
// What Bob's engine is started with for a stretched size, or nothing when the size is within what it was made for.
export function yarnArgs(ctx, native) {
  if (!(native > 0) || !(ctx > native)) return [];
  const factor = Math.min(STRETCH_MOST, ctx / native);
  return ['--rope-scaling', 'yarn', '--rope-scale', String(Math.round(factor * 100) / 100), '--yarn-orig-ctx', String(native)];
}

// What the chat memory (KV cache) costs for a context, in bytes, from the brain's shape (gguf.js) and the memory's
// number format (-ctk/-ctv; Bob uses q8_0). null when the shape isn't known.
const KV_BYTES = { f32: 4, f16: 2, bf16: 2, q8_0: 34 / 32, q5_1: 24 / 32, q5_0: 22 / 32, q4_1: 20 / 32, q4_0: 18 / 32, iq4_nl: 18 / 32 };
export function kvBytes(shape, ctx, args = []) {
  if (!shape?.perToken || !(ctx > 0)) return null;
  const type = (flags) => { const i = args.findIndex((a) => flags.includes(a)); return KV_BYTES[String(args[i + 1] || '').toLowerCase()] || 2; };
  const kv = args.length ? (type(['-ctk', '--cache-type-k']) + type(['-ctv', '--cache-type-v'])) / 2 : KV_BYTES.q8_0;
  return Math.round(shape.perToken * ctx * kv);
}
// What a brain needs for a context, all told: the file, the chat memory, and about 1.5 GB of working room.
export const WORK_BYTES = 1.5 * 1024 ** 3;
export function needBytes(fileBytes, shape, ctx, args) {
  const kv = kvBytes(shape, ctx, args);
  return fileBytes > 0 && kv !== null ? fileBytes + kv + WORK_BYTES : null;
}
// Room for a brain: the graphics card plus the RAM, less what the system keeps for itself (6 GB; 3 GB on a machine
// with 16 GB or less, where the system runs leaner). Bob's engine spreads a brain over both (--fit).
export function roomBytes(ramBytes, cardBytes = 0) {
  const keep = (ramBytes <= 16 * 1024 ** 3 ? 3 : 6) * 1024 ** 3;
  return Math.max(0, ramBytes - keep) + Math.max(0, cardBytes);
}
// When a brain's own limit can't be read, only sizes every brain handles are offered.
export const SAFE_CTX = 32768;
export const ctxLabel = (v) => (v >= 1048576 && v % 1048576 === 0 ? `${v / 1048576}M` : `${Math.round(v / 1024)}K`);
// Settings review (1.5.87): in a Gaming session the brain runs on the processor, so a hand pick never grows it past
// the Gaming session's own size while a game may be running.
export const GAMING_CTX = DEFAULT_CTX.light;

// The sizes to offer for a brain made for up to `max` tokens (null: limit unknown).
// stretch: the most it can be stretched to (Long memory on), which adds the stretched sizes.
export function choicesFor(max, { stretch = null } = {}) {
  const top = Number(max) > 0 ? Number(max) : SAFE_CTX;
  const long = Number(stretch) > top ? STRETCH_CHOICES.filter((v) => v > top && v <= stretch) : [];
  return [...CTX_CHOICES.filter((v) => v <= top), ...long];
}

// The size picked by hand for this brain, if the switch is on and it's a size the brain was made for.
// A stretched size only counts with Long memory on and a brain that can be stretched that far (stretch: its most).
export function pickedCtx(cfg, model, max = null, { stretch = null } = {}) {
  if (!ctxOn(cfg) || !model) return null;
  const v = cfg.brainCtx?.[model];
  if (!ALL_CTX.includes(v)) return null;
  if (STRETCH_CHOICES.includes(v)) return stretchOn(cfg) && Number(stretch) >= v && (!max || v > max) ? v : null;
  return max && v > max ? null : v;
}

// What Bob uses for a brain when nothing is picked by hand (for the menu's first line).
export function bobsPick(model, hat = 'bob') {
  return brainDefaults(model, hat).ctx || DEFAULT_CTX.normal;
}

// A short guideline for a brain, from its limit and Bob's pick (settings text, so Bob in the third person).
export function ctxGuide(max, pick, { gaming = false, stretch = null } = {}) {
  const parts = [];
  if (!max) parts.push(`Bob couldn't read how much this brain was made for, so the menu only goes up to ${ctxLabel(SAFE_CTX)}, which every brain handles.`);
  else {
    parts.push(`Made for up to ${ctxLabel(max)}.`);
    if (pick) parts.push(`Bob uses ${ctxLabel(Math.min(pick, max))} unless you pick.`);
    parts.push('Bigger reads longer files and chats, but uses more memory and takes longer to read when it\'s full.');
  }
  if (stretch && max) parts.push(`With Long memory on it can be stretched to ${ctxLabel(stretch)}. A stretched size makes short chats a little worse while it's picked, and a full one takes a long time to read.`);
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
    if (ALL_CTX.includes(n)) out[k] = n;
  }
  return out;
}
