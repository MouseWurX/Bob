// Tuning Bob to this PC (1.5.24). Three switches, all off unless the user turns them on:
//   readyWhileTyping  - when Bob wakes because someone is typing, his brain reads its instructions straight away,
//                       so the reply starts sooner. On the processor a copy of that reading is kept on disk.
//   gamesFirst        - when the brain runs on the processor, it runs at lower priority on fewer cores.
//   pictureFit        - picture engine settings matched to the graphics card instead of the small-card settings.
// Nothing here changes Windows or driver settings; the PC check (pc-check.js) only suggests.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';

export const TUNING_KEYS = ['readyWhileTyping', 'gamesFirst', 'pictureFit'];
export function tuning(cfg) {
  const out = {};
  for (const k of TUNING_KEYS) out[k] = cfg?.[k] === true;
  return out;
}

// ---------- Get ready while you type ----------
// One saved reading per brain and context size, in Bob's data folder. llama-server only accepts plain file names.
export const startDir = (cfg) => path.join(cfg.dataDir, 'chat-start');
export const startFile = (model, ctx) => `${String(model).replace(/[^\w.-]+/g, '_')}-${Number(ctx) || 0}.bin`;
export const promptHash = (messages, tools) => crypto.createHash('sha1').update(JSON.stringify([messages, tools || []])).digest('hex').slice(0, 16);

// The other saved readings of the same brain (another context size) are replaced, so there is one file per brain.
// 1.5.27: and only the newest MAX_STARTS brains keep one (each is about 0.5 GB for a 4K-token chat).
export const MAX_STARTS = 2;
export function tidyStarts(dir, model, keep) {
  const stem = String(model).replace(/[^\w.-]+/g, '_') + '-';
  try {
    for (const f of fs.readdirSync(dir)) if (f.startsWith(stem) && f !== keep && f !== keep.replace(/\.bin$/, '.json') && /^\d+\.(bin|json)$/.test(f.slice(stem.length))) fs.rmSync(path.join(dir, f), { force: true });
    const bins = fs.readdirSync(dir).filter((f) => f.endsWith('.bin')).map((f) => ({ f, t: fs.statSync(path.join(dir, f)).mtimeMs })).sort((a, b) => b.t - a.t);
    for (const { f } of bins.slice(MAX_STARTS)) if (f !== keep) for (const x of [f, f.replace(/\.bin$/, '.json')]) fs.rmSync(path.join(dir, x), { force: true });
  } catch {}
}

// ---------- Games first ----------
// Two-chip Ryzen processors (Ryzen 9: 12 or 16 cores) are two groups of cores; games run best on the first one
// (on X3D chips that is the one with the extra cache), so Bob keeps to the second. Other processors: leave two
// cores free. Logical processors come in pairs (one core, two threads) on these chips.
export function cpuPlan(cfg, { cpus = os.cpus(), lc = cfg?.llamacpp || {} } = {}) {
  if (!tuning(cfg).gamesFirst) return null;
  const logical = cpus.length || 1;
  const model = String(cpus[0]?.model || '');
  const pairs = /AMD|Intel/i.test(model) && logical % 2 === 0 && logical >= 4;
  const cores = pairs ? logical / 2 : logical;
  const set = Number.isInteger(lc.threads) && lc.threads > 0; // threads set by hand win
  if (/Ryzen 9\b/i.test(model) && logical >= 24) {
    const half = cores / 2;
    return { lowPriority: true, threads: set ? lc.threads : half, range: `${logical / 2}-${logical - 1}`, twoChips: true };
  }
  return { lowPriority: true, threads: set ? lc.threads : Math.max(2, cores - 2), range: null, twoChips: false };
}

// ---------- Match picture settings to the graphics card ----------
// Without it (or with flags set by hand in config.json) every PC gets the small-card settings: model parts swapped
// in from RAM, flash attention, the final image decoded in tiles. If a matched setting fails once (out of memory),
// Bob goes back to the small-card settings until he restarts.
export const SAFE_PAINT = ['--offload-to-cpu', '--diffusion-fa', '--vae-tiling'];
let fitBroken = false;
export function pictureFitFailed() { fitBroken = true; }
export function pictureFitReset() { fitBroken = false; }

const FILE_KEYS = ['diffusionModel', 'highNoiseDiffusionModel', 'model', 'vae', 'llm', 't5xxl', 'clipL', 'clipVision', 'llmVision', 'embeddingsConnectors', 'audioVae'];
export function modelGB(spec) {
  let b = 0;
  for (const k of FILE_KEYS) if (spec?.[k]) { try { b += fs.statSync(spec[k]).size; } catch {} }
  return b / 1e9;
}

// The card's size in GB: the saved setting, or what nvidia-smi found when Bob started.
export const cardGB = (cfg) => Number(cfg?.gpuVramGB) || Number(cfg?.cardGB) || 0;

// -> { extra, clipOnCpu, size, fit } where fit names the choice ('safe' | 'roomy' | 'big' | 'small').
export function paintFlags(cfg, kind, spec = {}, { gb = cardGB(cfg), files = modelGB(spec) } = {}) {
  const s = cfg?.painter?.sdcpp || {};
  const hand = spec.extraArgs || s.extraArgs;
  const clip = spec.clipOnCpu ?? s.clipOnCpu;
  const safe = { extra: hand || SAFE_PAINT, clipOnCpu: Boolean(clip), size: null, fit: 'safe' };
  if (hand || !tuning(cfg).pictureFit || fitBroken) return safe;
  // 1.5.79: built-in graphics (a handheld's): pictures at 768 px, which is much quicker there. The text encoder stays
  // on the graphics, since it shares the same memory anyway and the graphics are faster. Clips keep their own size.
  if (cfg?.sharedGraphics && !gb) return { extra: SAFE_PAINT, clipOnCpu: Boolean(clip), size: kind === 'video' ? null : 768, fit: 'shared' };
  if (!gb) return safe;
  if (gb <= 8) return { extra: SAFE_PAINT, clipOnCpu: clip ?? true, size: kind === 'video' ? null : 768, fit: 'small' };
  if (kind === 'video' || gb < 12) return safe;
  // The whole model on the card when it fits with about 3 GB to spare for the work itself.
  if (files > 0 && files + 3 <= gb) return { extra: ['--diffusion-fa'], clipOnCpu: Boolean(clip), size: null, fit: 'big' };
  return { extra: ['--offload-to-cpu', '--diffusion-fa'], clipOnCpu: Boolean(clip), size: null, fit: 'roomy' };
}
