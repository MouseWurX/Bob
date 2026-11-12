// Which brain runs where: the side lane, room on a shared-memory (APU) computer, the small talker brain, and running
// beside a big job. Split out of brain.js (which still exports all of it).
import { freeMemNow } from './platform.js';
import { currentSession, sessionBrains, brainDefaults, laneOf } from './sessions.js';
import fs from 'node:fs';
import { sameModel, chatBrain, bigSession } from './brain-mode.js';
import { bigThinker } from './moot.js';
import { midJobOn } from './mid-job.js';

// 1.5.40: Bob's own engine runs one brain. While the other lane is busy, a job that may need a different brain
// (pictures attached for his eyes, or Medium effort and up with its reviewer) waits, so it never swaps the brain
// out from under the other job. Everything else shares the small brain and runs beside it.
// 1.5.41 "Keep chatting while Bob is busy" (chatWhileBusy, on unless switched off: an approved exception to opt-in): while the job in the main lane is
// in a media step (painting, filming, composing: its brain is already let go so the card is free), a plain chat
// message runs in a "side" lane on the small brain on the processor, if there's room in RAM. Nothing big is loaded
// for it. The media job waits for that reply before it loads its own brain back (Gate.needBrain).
export const SIDE_LANE = 'side';
export function sideOk(brain, job, { freeMem = freeMemNow() } = {}) {
  const cfg = brain.cfg || {};
  if (cfg.chatWhileBusy === false || !job || job.kind !== 'chat') return false;
  if (job.refs?.length || (job.effort && job.effort !== 'low')) return false;
  if (currentSession(cfg).id === 'light') return false; // Gaming: the processor is the game's
  if (!brain.turns?.has('talk') || brain.turns.has(SIDE_LANE) || brain.state?.state !== 'painting') return false;
  if (brain.cfg?.engine === 'llamacpp' && !talkerModel(brain)) return false; // 1.5.54: no Instruct, no E4B on the processor: it waits
  return freeMem >= sideBrainBytes(brain) + 2 * 1024 ** 3;
}
export function sideBrainBytes(brain) {
  try { const f = brain.engine?.resolve?.(talkerModel(brain))?.gguf; if (f) return fs.statSync(f).size; } catch {}
  return 4 * 1024 ** 3; // unknown: assume a 4B brain
}

// 1.5.126: on a shared-memory machine (built-in graphics: handhelds, thin laptops) a brain and its chat memory come
// out of the same RAM Windows runs on, and an 8 GB carve-out already leaves a 16 GB Legion Go with 7.7 GB. Before a
// load, the room is: free RAM, plus whatever the load will drop, minus what's kept for Windows (4 GB, or the owner's setting since 1.5.181). Too tight:
// the chat memory is shortened first (halved, never below 8K); still too tight: nothing loads, and Bob says so
// plainly instead of risking an out-of-memory crash. Only with built-in graphics (cfg.sharedGraphics); unknown
// sizes (no file to measure) go the old way. Settings review: approved 2026-11-06.
export const APU_MIN_CTX = 8192;
// 1.5.181 (two-Bob trial, Legion Go on UMA Auto: 6.6 of 15.2 GB free, and even a 3 GB brain was refused): how much
// free memory a load leaves for Windows is the owner's to set, Settings, Brains, "Memory kept for Windows" (0 to 8 GB,
// 4 by default, as before). The free figure already leaves out what Windows is using, so a small machine can go lower.
// (The 4 GB in platform.js, for how much the graphics may borrow, is a different sum and stays.)
export const APU_HOLDBACK_DEFAULT_GB = 4;
export const apuHoldbackGB = (cfg) => { const v = Number(cfg?.apuHoldbackGB); return Number.isFinite(v) && v >= 0 && v <= 8 ? v : APU_HOLDBACK_DEFAULT_GB; };
export const APU_CARVE_MARGIN_GB = 0.5; // 1.5.133: kept free inside the set-aside for the picture reader and the driver
export const APU_NO_ROOM = (needGB, freeGB, holdGB = 1) => `That brain needs about ${needGB} GB and only about ${freeGB} GB is free${holdGB > 0 ? ' once Windows keeps its share' : ''}, so I haven't loaded it. Close something or pick a smaller brain in Settings, Brains.`;
export async function apuRoom(brain, model, ctx, { freeMem = freeMemNow(), loaded = null, minCtx = APU_MIN_CTX } = {}) {
  if (!brain?.cfg?.sharedGraphics || !model) return { ok: true, ctx };
  const bytes = (c) => brain.gate?.brainBytes?.(model, { ctx: c });
  let need = bytes(ctx);
  if (!need) return { ok: true, ctx };
  let dropping = 0;
  try {
    const l = loaded || await brain.engine.loaded();
    if (l.some((m) => !m.beside && sameModel(m.name, model))) return { ok: true, ctx }; // already in: nothing new to find room for
    dropping = l.filter((m) => !m.beside).reduce((a, m) => a + (m.size || 0), 0);
  } catch {}
  // 1.5.133 (Legion Go, UMA 8 GB: every brain was refused): the memory set aside for graphics is where the brain goes
  // first, and Windows never counts it as free. So a brain up to the set-aside (less a small margin) needs no system RAM,
  // and only what spills past it is checked against free RAM less Windows's 4 GB. On Auto the set-aside is tiny and the
  // sum is the same as before. The brain being dropped frees its set-aside part and gives back only what it spilled.
  const carve = Math.max(0, (Number(brain.cfg.reservedGraphicsGB) || 0) * GB - APU_CARVE_MARGIN_GB * GB);
  const ram = freeMem + Math.max(0, dropping - carve) - apuHoldbackGB(brain.cfg) * GB;
  const room = carve + Math.max(0, ram);
  const fits = (n) => Math.max(0, n - carve) <= Math.max(0, ram); // RAM short of Windows's share still leaves the set-aside
  const start = ctx || 32768;
  let c = start;
  const floor = Math.max(1024, Math.min(APU_MIN_CTX, Number(minCtx) || APU_MIN_CTX));
  while (!fits(need) && c > floor) { c = Math.max(floor, Math.floor(c / 2)); need = bytes(c); }
  const gb = (b) => Math.round((Math.max(0, b) / GB) * 10) / 10;
  if (fits(need)) return { ok: true, ctx: c === start ? ctx : c, shortened: c !== start, needGB: gb(need), roomGB: gb(room) };
  return { ok: false, ctx, needGB: gb(need), roomGB: gb(room), line: APU_NO_ROOM(gb(need), gb(room), apuHoldbackGB(brain.cfg)) };
}

// A side-lane reply: always the small brain on the processor, so it never touches the card the painter holds.
// 1.5.51: beside a big text job it goes to the engine's second server (beside: true), so the main brain stays loaded.
export const sideBrain = (cfg, job) => ({ model: sessionBrains(cfg).small, cpu: true, ...(job?.beside ? { beside: true } : {}) });

// 1.5.53 (rule: E4B never runs on the processor, and never during a game; Instruct can): the
// talker for quick replies beside a job. On the processor it's Qwen3 4B Instruct 2507 (the Gaming slot, no thinking,
// 2 to 7 s to the first word on an idle processor) when it's downloaded; E4B only when it goes on the graphics card.
export const runnable = (brain, m) => { try { return Boolean(m && brain.engine?.resolve?.(m)?.gguf); } catch { return false; } };
// #30: this Bob's Review brain as he'd lend it to another Bob (Bob's own engine only), with its file size in GB.
export const ggufGB = (brain, m) => { try { const f = brain.engine?.resolve?.(m)?.gguf; return f ? Math.round(fs.statSync(f).size / 1e8) / 10 : 0; } catch { return 0; } };
export function reviewBrainOf(brain) {
  const m = brain.cfg.models?.reviewer;
  if (!m || brain.cfg.engine !== 'llamacpp' || !runnable(brain, m)) return null;
  return { model: m, cpu: false, ctx: Math.min(brainDefaults(m, 'reviewer').ctx || 32768, 32768), gb: ggufGB(brain, m) };
}
// Not on the PC: null, and quick replies beside a job wait (E4B never runs on the processor; settings sign-off 1.5.54).
export function talkerModel(brain) {
  const sb = sessionBrains(brain.cfg || {});
  return sb.gaming && runnable(brain, sb.gaming) ? sb.gaming : null;
}
export const isTalker = (brain, m) => { const sb = sessionBrains(brain.cfg || {}); return Boolean(m) && (sameModel(m, sb.small) || sameModel(m, sb.gaming)); };
export async function sidePick(brain, job) {
  const sb = sessionBrains(brain.cfg || {});
  const base = { cpu: true, ...(job?.beside ? { beside: true } : {}) };
  if (job?.beside) {
    const held = brain.engine?.beside?.current;
    if (held && isTalker(brain, held) && brain.engine.besideLoaded?.()) return { model: held, ...base }; // already there: no load
    const place = sb.small && brain.engine?.besidePlace ? await brain.engine.besidePlace(sb.small, chatBrain(brain.cfg).ctx).catch(() => 'none') : 'none';
    if (place === 'whole' && currentSession(brain.cfg || {}).id !== 'light') return { model: sb.small, ...base }; // E4B never in Gaming
  }
  return { model: talkerModel(brain) || sb.small, ...base }; // sideOk / besideBigOk only start a side reply when a talker exists
}
export const fullName = (name) => (/^Qwen3 4B Instruct$/.test(name) ? `${name} 2507` : name); // the name Get models and Equip use
// 1.5.133: the talker kept beside a job always runs on the processor, with at most 32K of chat memory. Tried on the
// owner's PC: any talker on the card (even 32K, 5.5 GB) made the 35B with its picture reader run out of card memory.
export const TALKER_CTX = 32768;
export const talkerCtx = (cfg) => Math.min(Number(chatBrain(cfg).ctx) || TALKER_CTX, TALKER_CTX);
export const TALKER_LINE = (name) => `Keeping a small brain (${fullName(name)}) on the processor, so we can keep talking while the big one works.`;

// 1.5.51 "Keep chatting while Bob is busy", part 2: beside a big text job (Medium effort and up, the Coding session, or
// any job that has run 20 seconds), a plain chat message is answered by the small brain on a second llama-server, on
// the processor only, if there's room in RAM. The main brain stays on the card and carries on; nothing is swapped.
// A short job isn't worth it: the quick brain on the processor takes up to half a minute to its first word, while the
// card answers in a few seconds once the job is done.
export const BIG_AFTER_MS = 20000;
export const MOVE_TO_CPU = 'Moving my quick brain to the processor so the picture can use the graphics card. Replies will be a little slower.';
export const BESIDE_FAILED = "My second brain wouldn't start beside the job (probably not enough free RAM), so this message waits its turn. I'll answer as soon as the job is done.";
export const GB = 1024 ** 3;
export function mainJob(brain) {
  return brain.queue?.find((j) => j.state === 'working' && !j.side && laneOf(brain.cfg || {}, j) === 'talk') || null;
}
export function bigJob(brain, now = Date.now()) {
  const j = mainJob(brain);
  if (!j) return false;
  return bigThinker(j) || bigSession(brain.cfg || {}) || now - (j.startedAt || now) >= BIG_AFTER_MS;
}
export function besideBytes(brain, model, ctx) {
  const est = brain.gate?.brainBytes?.(model, { ctx });
  if (est) return est;
  try { const f = brain.engine?.resolve?.(model)?.gguf; if (f) return Math.round(fs.statSync(f).size * 1.1 + Math.min(ctx || 32768, 131072) * 60 * 1024); } catch {}
  return 6 * GB; // unknown: a 4B brain and its memory for the chat
}
export function besideBigOk(brain, job, { freeMem = freeMemNow(), now = Date.now() } = {}) {
  const cfg = brain.cfg || {};
  if (cfg.chatWhileBusy === false || !job || job.kind !== 'chat' || job.noBeside) return false;
  if (midJobOn(cfg)) return false; // Answer messages mid-job (mid-job.js): the loaded brain answers between steps instead
  if (job.refs?.length || (job.effort && job.effort !== 'low')) return false;
  if (cfg.engine !== 'llamacpp' || typeof brain.engine?.besideServer !== 'function') return false;
  if (currentSession(cfg).id === 'light') return false; // Gaming: the processor is the game's
  if (!brain.turns?.has('talk') || brain.turns.has(SIDE_LANE)) return false;
  if (brain.state?.state === 'painting') return false; // part 1 (sideOk) answers beside a media step
  if (brain.engine.currentCpu) return false; // the main brain is on the processor itself: two would fight over it
  const talker = talkerModel(brain);
  if (!talker) return false;
  const held = brain.engine.beside?.current; // the second server holds the reviewer for a moot: leave it be
  if (held && !isTalker(brain, held)) return false;
  if (held && brain.engine.besideLoaded?.()) return true; // 1.5.53: a talker is already waiting beside the job
  if (!bigJob(brain, now)) return false;
  return freeMem >= besideBytes(brain, talker, talkerCtx(cfg)) + 2 * GB;
}

// 1.5.51 opt-in "Let the reviewer sit beside the main brain" (mootBeside): at High and Extreme effort the reviewer
// loads on the second server, on the processor, instead of swapping the main brain out, when there's room in RAM.
// A chat waiting behind a job that isn't big yet goes beside it once the job has run BIG_AFTER_MS: one pump then.
export function besideLater(brain, now = Date.now()) {
  if (brain.bigTimer || brain.cfg?.chatWhileBusy === false || midJobOn(brain.cfg) || brain.cfg?.engine !== 'llamacpp' || brain.turns?.has(SIDE_LANE)) return null;
  const main = mainJob(brain);
  if (!main?.startedAt || !brain.queue.some((j) => j.state === 'waiting' && j.kind === 'chat' && !j.noBeside)) return null;
  const due = main.startedAt + BIG_AFTER_MS - now;
  if (due <= 0) return null;
  brain.bigTimer = setTimeout(() => { brain.bigTimer = null; brain.pump?.(); }, due + 50);
  brain.bigTimer.unref?.();
  return due;
}

export function mootBesideOk(brain, model, ctx, { freeMem = freeMemNow() } = {}) {
  const cfg = brain.cfg || {};
  if (cfg.mootBeside !== true || cfg.engine !== 'llamacpp' || typeof brain.engine?.besideServer !== 'function' || !model) return false;
  if (currentSession(cfg).id === 'light') return false;
  const main = brain.engine.current;
  if (!main || brain.engine.currentCpu || sameModel(main, model)) return false; // nothing to keep, or it's already loaded
  const side = brain.turns?.get?.(SIDE_LANE);
  if (side?.beside) return false; // a quick reply is using the second server right now
  const held = brain.engine.beside?.current;
  if (held && sameModel(held, model)) return true; // already beside from the last check
  return freeMem >= besideBytes(brain, model, ctx) + 2 * GB;
}

export function besideOk(brain, job, lane) {
  if (brain.cfg?.engine !== 'llamacpp' || !brain.turns?.size || brain.turns.has(lane)) return true;
  return !(job.refs?.length || (job.effort && job.effort !== 'low'));
}
