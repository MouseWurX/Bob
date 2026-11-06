// Sessions: sets of brains that fit in the graphics card together, so Bob never swaps brains mid-session.
// "Normal" is the old behaviour (each job uses the brain picked for it in Model roles).
// 1.5.41: with "Let Bob pick the session" on (the default) Bob switches himself, see auto-session.js; off, he only suggests.

export const SESSIONS = {
  normal: { label: 'Normal', icon: '☕', what: 'Each job uses the brain picked for it in Equip Bob. Bob swaps brains when a job needs another one.' },
  art: { label: 'Art', icon: '🎨', what: 'The graphics card is kept for pictures, video and sound. Bob chats on his small brain on the processor, so he keeps talking while a picture paints.', brain: 'small', cpu: true, parallel: true },
  coding: { label: 'Coding', icon: '🛠', what: 'The coding brain does everything, with its full memory for long files. Small side jobs run on the processor.', brain: 'coding' },
  office: { label: 'Office', icon: '📊', what: 'One all-rounder brain for writing, spreadsheets, research and planning. No swaps.', brain: 'office' },
  // 1.5.23: Deep thought is gone (Effort Medium/High does that job); Light is now Gaming, and keeps Effort on Low.
  // Gaming (some games use 14 of 16 GB): nothing loads on the card. Chat and hearing run on the processor;
  // pictures, video, music and Medium-and-up jobs wait in Tasks until the session changes.
  light: { label: 'Gaming', icon: '🎮', what: 'Keeps the graphics card for your games. Bob chats and listens on the processor with a small brain, which usually starts answering within a few seconds. Pictures and big jobs wait until you switch back. How much of the card he may borrow is set in Settings, Show advanced settings, Speed & memory (Automatic to start with).', whatMac: 'Keeps memory free for your games. Bob chats and listens on the processor with a small brain, which usually starts answering within a few seconds. Pictures and big jobs wait until you switch back.', brain: 'gaming', cpu: true, effortLow: true }
};

// Which model each session's brain is. the user can change these on the Sessions tab; the defaults come
// from the models already picked in Model roles.
export function sessionBrains(cfg) {
  const m = cfg.models || {};
  const s = cfg.sessionBrains || {};
  return {
    small: s.small || 'gemma4:e4b',
    // 1.5.23: Gaming chats on the processor, so a smaller brain answers sooner. 1.5.25: Qwen3 4B Instruct 2507 (Get models
    // id "qwen3-4b"), picked on time to first word and to a full answer: about 0.1-2 s / 2-7 s on the processor. Ollama's
    // qwen3:4b thinks first even when asked not to (about 30 s for "hi"). If it isn't on the PC, the hand-off falls back.
    gaming: s.gaming && !/e4b/i.test(s.gaming) ? s.gaming : 'qwen3-4b', // 1.5.56: never E4B, even from an old settings file
    coding: s.coding || m.tinker || m.bob,
    office: s.office || m.ledger || m.bob,
    deep: s.deep || m.reviewer || m.bob
  };
}

export function currentSession(cfg) {
  const id = SESSIONS[cfg.session] ? cfg.session : 'normal';
  // The old "One brain" switch is Normal with every hat on the main brain.
  return { id, ...SESSIONS[id] };
}

// How much a brain can keep in mind (context, in tokens) per session. Empty means the engine's default.
export const CTX_CHOICES = [8192, 16384, 32768, 65536, 131072, 262144];
// Measured on a 16 GB RTX card (gemma4:26b, llama.cpp b12032): 32K is about 15% faster than 128K for chat.
// Coding keeps the engine's full default; 256K is for one-off whole-project reads (slow).
export const DEFAULT_CTX = { normal: 32768, light: 32768, art: 32768, office: 65536 };
export function sessionCtx(cfg, id, hat) {
  const v = cfg.sessionCtx?.[id];
  if (CTX_CHOICES.includes(v)) return v;
  // In a Normal session the coding and review copies still get the long default, for big files.
  if (id === 'normal' && ['tinker', 'reviewer'].includes(hat)) return null;
  return DEFAULT_CTX[id] || null;
}

// The model a hat runs on right now, and whether it must stay off the graphics card.
// 1.5.12: Low effort in the Normal session (Gaming always does, 1.5.23) chats on the Quick brain, on the processor, so the graphics card stays free.
// Setting quickOnCpu (Settings > Everyday): OFF unless switched on. Measured 2026-11-02 on a 9800X3D (gemma4:e4b, 4.3K-token
// prompt): about 31 s to the first word on the processor vs about 4 s on the card, because reading the prompt is slow there.
export const quickOnCpu = (cfg) => cfg?.quickOnCpu === true;
// 1.5.63 / 1.5.66: Qwen3.6 35B-A3B, the lineup: the Coding copy thinks at every effort, the main
// Brain (everyday chat) never thinks first. Both share one load of the same file instead of swapping between a
// 32K and a longer load.
// 1.5.86 (picked after the 256K test): 256K by default. Measured on a 16 GB card with q8_0 KV: 15.0 GB on the card
// and 21.2 GB in RAM (128K: 14.9 / 20.4), 49.1 vs 50.2 tok/s on a short write, 55.4 vs 60.7 after 12K, and it found a
// needle at 201K. --fit moves the extra experts (about 0.8 GB) to RAM. The 8 GB card (Q3) version stays at 128K
// until someone tries 256K on a real small card.
export const LONG_CODER = /qwen3\.6[-_ ]?35b/i;
export const LONG_CTX = 262144;
export const SQUEEZED_CTX = 131072;
export function brainDefaults(model, hat, effort) {
  const id = String(model || '');
  if (!LONG_CODER.test(id)) return {};
  const ctx = /[-_]q3\b/i.test(id) ? SQUEEZED_CTX : LONG_CTX;
  // Every copy that runs on it gets the same context, so a hand-off to any copy on the same file never reloads it.
  return hat === 'bob' ? { ctx, think: false } : { ctx };
}

export function modelFor(cfg, hat) {
  const s = currentSession(cfg);
  const ctx = sessionCtx(cfg, s.id, hat);
  if (s.id === 'normal' && hat === 'bob' && quickOnCpu(cfg)) return { model: sessionBrains(cfg).small, cpu: true, ctx };
  if (s.id === 'normal') {
    const model = cfg.oneBrain ? cfg.models.bob : (cfg.models[hat] || cfg.models.bob);
    // 1.5.67: Qwen3.6's long context (256K since 1.5.86) applies here too, not only inside a job, so waking or priming the chat brain after a
    // job loads the same context the job used (it was reloading at 32K after every job). A context picked by hand wins.
    const d = CTX_CHOICES.includes(cfg.sessionCtx?.normal) ? {} : brainDefaults(model, hat);
    return { model, cpu: false, ctx: d.ctx || ctx };
  }
  const model = sessionBrains(cfg)[s.brain] || cfg.models.bob;
  return { model, cpu: Boolean(s.cpu), think: s.think, ctx };
}

// 1.5.23: the Gaming session keeps the graphics card for games (1.5.32: how much the brain borrows is gaming-card.js).
export const gaming = (cfg) => cfg?.session === 'light';
export const GAMING_TAG = 'Waiting · Gaming is on';
export const GAMING_HINT = 'Switch the session to Normal to run it.';
// A job that needs the card waits while Gaming is on: pictures, video, music, and Medium effort and up. Never dropped.
export function waitsForGaming(cfg, job) {
  if (!gaming(cfg) || !job) return false;
  return ['picture', 'video', 'music'].includes(job.kind) || (job.effort && job.effort !== 'low');
}

// Pictures, video and sound go in their own lane during an Art session, so chat doesn't wait for them.
export function laneOf(cfg, job) {
  const s = currentSession(cfg);
  // 1.5.40: Bob's own engine (llama.cpp) holds one brain at a time, so it gets the second lane only when the session's
  // brain lives on the processor (Art): the picture job and the chat then share that one small brain, and the
  // graphics card goes to the painter. (It used to be Ollama only, though Art promised chat while a picture paints.)
  return s.parallel && (cfg.engine !== 'llamacpp' || s.cpu) && ['picture', 'video'].includes(job.kind) ? 'art' : 'talk';
}

// A gentle suggestion from what's waiting: never a switch.
export function suggestSession(cfg, jobs) {
  const s = currentSession(cfg).id;
  const waiting = jobs.filter((j) => j.state === 'waiting' || j.state === 'working');
  const count = (k) => waiting.filter((j) => j.kind === k).length;
  let want = null;
  if (count('picture') + count('video') >= 2) want = 'art';
  else if (count('code') >= 2) want = 'coding';
  else if (count('data') + count('research') >= 2) want = 'office';
  if (!want || want === s) return null;
  return { id: want, label: SESSIONS[want].label, why: want === 'art' ? 'Several pictures or clips are waiting. In an Art session I can keep chatting while they paint.' : want === 'coding' ? 'Several coding jobs are waiting. A Coding session keeps the coding brain loaded.' : 'Several spreadsheet and research jobs are waiting. An Office session does them all without swapping brains.' };
}
