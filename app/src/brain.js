// Bob's brain: runs a conversation turn, picks the right model, announces swaps,
// calls tools, asks the user for approval when needed, and keeps a logbook.
import { ownModels } from './own-models.js';
import fs from 'node:fs';
import { writeJsonAtomic } from './util.js';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { Ollama } from './ollama.js';
import { memGB } from './server-ram.js';
import { LlamaCpp } from './llamacpp.js';
import { buildTools, today, loadReminders, saveReminders } from './tools.js';
import { systemPrompt, HATS } from './persona.js';
import { lookPrompt } from './look.js';
import { applyHouseStyle, usedLine, houseStylePrompt } from '../public/house-style.js';
const houseGroupOfTool = (n) => ({ make_music: 'music', make_image: 'pictures', make_video: 'video', make_sound: 'sfx' }[n] || null);
import { personalityPrompt, cleanPersonality } from '../public/personality.js';
import { catPrompt, catMoment, catTurn } from '../public/patches.js';
import { sleepyAfterReply, sleepySwitch, SLEEPY_SESSION } from '../public/sleepy.js';
import { cleanEffort, careful, bigThinker, draftBrain, hatBrain, effortPrompt, mootOpening, runMoot, phasedWork, reviewBrain } from './moot.js';
import { brainBillions, wantsBorrowedCheck, pickChecker, checkDown, checkingOnLine, checkBackLine } from './bob-net-check.js'; // 1.5.185
import { saveSettings, outputDirs, findOutput } from './config.js';
import { paint, paintingAvailable, stepsFor } from './painter.js';
import { PainterServer } from './painter-server.js';
import { readCardUse, busyByOther, cardBusyLine, isLoadTimeout, RECHECK_MS, CARD_STILL_BUSY } from './card-busy.js';
import { maestroMake } from './maestro.js';
import { capabilities } from './capabilities.js';
import { cloudHelpers } from './cloud.js';
import { copyName } from './clan.js';
import { RefShelf } from './refs.js';
import { makeAudio, songTitle, aceMissingFiles, aceModelsEntry, ACE_MODELS_ID } from './audio.js';
import { runWorkflow } from './workshop.js';
import { pickedCtx, GAMING_CTX } from './model-ctx.js';
import { currentSession, modelFor, quickOnCpu, laneOf, suggestSession, SESSIONS, sessionBrains, brainDefaults, CTX_CHOICES, LONG_CODER, waitsForGaming, GAMING_TAG, GAMING_HINT, gaming } from './sessions.js';
import { recallOn, alwaysText, parseMemory, pickMemories, activeProject, recallText, MemoryVectors } from './recall.js';
import { stampMessages, keepOlder, readSummary, newMsgId } from './chats.js';
import { Housekeeper, hkSettings, forgetTopicTool } from './housekeeping.js';
import { handsTools, handsPrompt } from './hands.js';
import { officeTools } from './hands-office.js';
import { securityTools } from './hands-security.js';
import { selfToolsTools } from './selftools.js';
import { Made, madePaths, showMadeTool } from './made.js';
import { imageInfoOf, sizeLike } from './imageinfo.js';
import { scheduleTools } from './hands-schedules.js';
import { toolsOff, HANDS, handOn, handOffWhy, freeOn, computerWord } from './hands-settings.js';
import { gate as qGate, after as qAfter, maybeAsk as qAsk, noteStrike, copyHeld } from './quarantine.js';
import { wantsPictureEdit, recentPicture, editHint } from './intent.js';
import { SAVE_AS, namedType, saveAs } from './save-as.js';
import { recordCall, learnedLine, loadLearning, toolLearnOn } from './tool-learn.js';
import { CORE, groupsFor, groupOf, guessGroups, allToolsOn, useToolsTool, fillUseTools, tidySchema, STICKY_TURNS, toolboxPrompt, saysCant } from './toolbox.js';
import { Gate, Ledger, safeToResume, interruptedNote, withRetry, slimHandoff, carryOnPlan, carryOnLine, finishedSteps, MAX_AUTO_RESUMES, isBareOk, NOTHING_TO_OK, NOTHING_TO_OK_BUSY, queuedLine, plainDoing } from './handoff.js';
import { expectFrom, verifyOutput, afterTool, afterTurn } from './verify.js';
import { brainMode, chatBrain, holdsChatBrain, bigSession, isBobs, sameModel, sleepAfterText, bigGraceMs, msText } from './brain-mode.js';
import { WEB_TOOLS, WEB_OFF, webOn, webPrompt, linkPrompt, findLinks, refersToLink, linkTurn } from './web.js';
import { editOwnOn, editOwnTool } from './edit-own.js';
import { notesOn, notesTool, smartNotesOn, notesPrompt } from './notes.js';
import { docToolsOn, findDocsTool } from './my-docs.js';
import { sandboxOn, sandboxTool } from './sandbox-code.js';
import { autoSessionOn, pickSessionTool, autoSessionPrompt, switchLine, switchedNote, idleSession, cardBusy, IDLE_CHECK_MS } from './auto-session.js';
import { readCard } from './gaming-card.js';
import { Lenders, wantsBorrow, roughTokens } from './share-brains.js';
import { CardLender, CardBorrower } from './share-card.js'; // Bob-Net: lend my graphics card / spread big brains
import { Rentals, currentRental, saveEndpoint, estimateText } from './rental.js'; // 1.5.127 rented brains
import { GuestJobs, awayPlan, sendAway, stopAway, guestTools, guestNote, GUEST_TOOLS, canHere, NEEDS_LIST, awayWaitLine } from './share-jobs.js';
import { askTogether, takeEarlier, askTogetherTool } from './together.js';
import { showPlanTool, planGate, planOn, planPrompt } from './plan.js';
import { freeMemNow } from './platform.js';
import { selfWorkOn, readyRepos } from './self-work.js';
import { compactMessages, charsFor } from './self-work-plan.js';
import { HowTos, howtoTools, howtosOn, trailStep, worthOffering, howtoPrompt, usingLine } from './howtos.js';
import { NEEDS, planFor, SetupOffers, switchFor, applySwitch, SWITCH_KEYS } from './setup-offer.js';

const MAX_STEPS = 8;
// #57 stopgap (two-Bob trial, Test B); Bob's own #57 fix replaces these.
export const MAX_CALLS_PER_REPLY = 6;
export const REPEATS_THEN_ANSWER = 3;
// 1.5.196: the logbook line for a reply another of your Bobs thought. Who, and how long the first word took; no words.
export const borrowedLine = (name, ms) => `📡 ${name} thought this reply (${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s to first word)`;
// #57 (Bob's plan, second try): every tool is guarded against an exact repeat in one turn; the third identical call stops the turn.
export const REPEAT_STOP_LINE = "(I asked for the same thing three times, so I've stopped. Could you point me at what I'm missing?)";
export const repeatNote = (text) => `(Not done again: that exact call already ran this turn. Its result: ${String(text ?? '').slice(0, 300)}) Use it, or try something different.`;
// seen: Map of call key -> { count, text }, kept on the turn's ctx. 'new' the first time, 'repeat' the second, 'stop' from the third.
export function repeatCheck(seen, key) {
  const e = seen.get(key);
  if (!e) { seen.set(key, { count: 1, text: '' }); return 'new'; }
  e.count++;
  return e.count >= 3 ? 'stop' : 'repeat';
}
export const ANSWER_NOW_NUDGE = 'You have called the same tools with the same input several times; the results will not change. Answer now from the results above, with no more tool calls. Say plainly what you found and what you could not find.';

// Honesty about Hands (1.5.4). A small brain saw an old Hands error in the chat and, instead of trying again,
// made up "the simulated OS won't let me" and even "I've opened Notepad" with no tool call at all.
const HAND_TOOLS = new Set(Object.values(HANDS).flatMap((h) => h.tools));
// Old Hands errors from earlier turns are shown to the brain as possibly out of date, so it tries again.
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
function sideBrainBytes(brain) {
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
export const APU_NO_ROOM = (needGB, freeGB, holdGB = 1) => `That brain needs about ${needGB} GB and only about ${freeGB} GB is free${holdGB > 0 ? ' once Windows keeps its share' : ''}, so I haven't loaded it. Close something or pick a smaller brain in Equip Bob.`;
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
const runnable = (brain, m) => { try { return Boolean(m && brain.engine?.resolve?.(m)?.gguf); } catch { return false; } };
// #30: this Bob's Review brain as he'd lend it to another Bob (Bob's own engine only), with its file size in GB.
const ggufGB = (brain, m) => { try { const f = brain.engine?.resolve?.(m)?.gguf; return f ? Math.round(fs.statSync(f).size / 1e8) / 10 : 0; } catch { return 0; } };
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
const fullName = (name) => (/^Qwen3 4B Instruct$/.test(name) ? `${name} 2507` : name); // the name Get models and Equip use
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
const GB = 1024 ** 3;
export function mainJob(brain) {
  return brain.queue?.find((j) => j.state === 'working' && !j.side && laneOf(brain.cfg || {}, j) === 'talk') || null;
}
export function bigJob(brain, now = Date.now()) {
  const j = mainJob(brain);
  if (!j) return false;
  return bigThinker(j) || bigSession(brain.cfg || {}) || now - (j.startedAt || now) >= BIG_AFTER_MS;
}
function besideBytes(brain, model, ctx) {
  const est = brain.gate?.brainBytes?.(model, { ctx });
  if (est) return est;
  try { const f = brain.engine?.resolve?.(model)?.gguf; if (f) return Math.round(fs.statSync(f).size * 1.1 + Math.min(ctx || 32768, 131072) * 60 * 1024); } catch {}
  return 6 * GB; // unknown: a 4B brain and its memory for the chat
}
export function besideBigOk(brain, job, { freeMem = freeMemNow(), now = Date.now() } = {}) {
  const cfg = brain.cfg || {};
  if (cfg.chatWhileBusy === false || !job || job.kind !== 'chat' || job.noBeside) return false;
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
  if (brain.bigTimer || brain.cfg?.chatWhileBusy === false || brain.cfg?.engine !== 'llamacpp' || brain.turns?.has(SIDE_LANE)) return null;
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

// Test B of the two-Bob trial: twelve web pages in one turn came to 74,242 tokens against a 32,768-token chat
// memory, and llama-server refused the whole request. Before each request the tool results are shortened, oldest
// first, until the chat fits in about three quarters of the brain's memory (the rest is room for the answer).
// The saved chat keeps them whole; only what's sent this time is shortened.
export const CUT_NOTE = (n) => `\n(${n} more characters were cut here so the chat fits in the brain's memory. Answer from what is here if you can.)`;
export function fitContext(messages, ctx, tools, share = 0.75) {
  if (!(Number(ctx) > 0) || !Array.isArray(messages)) return messages;
  const size = (m) => Math.ceil(String(m.content ?? '').length / 3) + (m.images?.length || 0) * 800 + (m.tool_calls ? Math.ceil(JSON.stringify(m.tool_calls).length / 3) : 0) + 8;
  const budget = Math.floor(ctx * share) - (tools ? Math.ceil(JSON.stringify(tools).length / 3) : 0);
  let total = messages.reduce((a, m) => a + size(m), 0);
  if (total <= budget) return messages;
  const out = messages.slice();
  const tool = out.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  for (const keep of [1500, 400, 120]) {
    for (const i of tool) {
      if (total <= budget) return out;
      const c = String(out[i].content ?? '');
      if (c.length <= keep + 200) continue;
      total -= size(out[i]);
      out[i] = { ...out[i], content: c.slice(0, keep) + CUT_NOTE(c.length - keep) };
      total += size(out[i]);
    }
  }
  return out;
}
export const TOO_LONG = /exceeds? the available context|context (size|length|window) (exceeded|is too)|maximum context length|too many tokens/i;

export function staleHandErrors(msgs, turnStart) {
  return msgs.map((m, i) => (i < turnStart && m.role === 'tool' && HAND_TOOLS.has(m.tool_name) && /^Error:/.test(String(m.content))
    ? { ...m, content: `(An earlier try failed: ${String(m.content).slice(7, 200)}. That may be out of date, because Bob's Hands can be fixed or switched on since. To do it now, call the tool again; don't repeat this.)` }
    : m));
}
// "I've opened Notepad" with no Hands tool done this turn.
export function claimsPcAction(text) {
  return /\bI(?:'ve| have|)\s+(?:just\s+|now\s+|already\s+|successfully\s+)?(?:opened|launched|started|typed|clicked|pressed|moved|copied|renamed|zipped|unzipped|ran|deleted|saved|closed)\b[^.!?\n]{0,60}\b(?:notepad|paint|app|application|window|program|file|folder|script|command|document|tab|\w+\.\w{2,4}|it for you)/i.test(String(text || ''));
}
// 1.5.11: "I was just observing a subtle loop in the file handle caching" with no tool run this turn: a made-up observation.
export function claimsObservation(text) {
  const t = String(text || '');
  if (/\b(?:earlier|last time|yesterday|before you asked)\b/i.test(t)) return false; // talking about a past turn, where a tool may have run
  return /\bI(?:'ve| have|'m| am| was|'d| had|)\s+(?:just\s+|been\s+|also\s+|quietly\s+)*(?:observ|notic|monitor|scout|measur|watch|analy[sz]|profil|scann|investigat|benchmark|keeping an eye|looking into|checking|checked|poking at|digging into)\w*\b[^.!?\n]{0,100}\b(?:system|cpu|gpu|vram|memory|ram|files?|cache|caching|loop|process(?:es)?|threads?|disk|network|logs?|queue|code|performance|utili[sz]ation|handles?|drivers?|registry|pc|computer|server|kernel|latency|throughput|background)\b/i.test(t)
    || /\b(?:CPU|GPU|VRAM|RAM|disk|network) (?:utili[sz]ation|usage|load|temperature|temps?) (?:is|are|looks?|has been|seems?)\b/i.test(t);
}
export const OBSERVE_CORRECTION = 'Nothing was actually checked in that reply. Bob said he checked, but no check ran.';
const OBSERVE_NUDGE = 'You described noticing, watching or checking something on the PC, but no tool ran this turn, so it was invented. Answer again in a line or two, using only the "Right now" line, the chat, or what {{USER}} said. No made-up system details, and no question unless you need the answer.';
// The only things he knows about the PC without a tool, so small talk has something true to stand on.
// #33: the cat is only in it when withCat (the cat turns), so Patches isn't in front of the brain every turn.
export function realState({ model, session, waiting = 0, cat, turn = 0, withCat = true, mem = { free: freeMemNow(), total: os.totalmem() } }) {
  const gb = (b) => (b / 1e9).toFixed(1);
  return `Right now (real, from the app): you're thinking on ${model || 'no brain'}${session ? ` in the ${session} session` : ''}; ${waiting ? `${waiting} more message${waiting === 1 ? '' : 's'} waiting` : 'nothing else waiting'}; the PC's RAM is ${gb(mem.total - mem.free)} of ${gb(mem.total)} GB in use${withCat ? `; ${catMoment(cat, turn)}` : ''}.`;
}
export const CLAIM_CORRECTION = 'Nothing was actually done on this replicant matrix in that reply. Bob said he did, but no action ran.';
const CLAIM_NUDGE = 'You just said you did something on the PC, but no tool did it in this turn. Never claim that. If it should be done, call the right tool now; if you cannot, say plainly that you have not done it and why (the tool\'s own words if it gave an error).';
// Always in the front desk's prompt (slim tools or not): he lives on a real PC and, with the Apps hand on, drives it.
// Bob should want to take the wheel himself. The model had said "I am the process inside
// the computer, not a remote driver... simulated environment" right after two errors.
export function realPcPrompt(cfg) {
  const who = cfg.userName || 'the user';
  const base = `You live on ${who}'s real ${computerWord()}; the apps, windows and files are real, not a simulation (only your Idle Process workspace is make-believe). Never call the PC simulated or virtual.`;
  if (handOn(cfg, 'apps')) return `\n\n${base} Being inside the PC is exactly why you can drive it: with the Apps hand on you really do take the wheel. When ${who} says drive, take control, take the wheel, use my screen or do it in <an app>, be keen and start at once${freeOn(cfg) ? ' (you work without asking right now, so go ahead and do each step; each one is logged)' : " by showing the first step's card"}: open_app, then app_look, then app_act (add them with use_tools apps if they aren't here).${freeOn(cfg) ? '' : ` Nothing happens on the PC until ${who} clicks it.`} When the Apps hand is on, don't refuse to drive. If a step fails, tell ${who} exactly what failed and what to click, and never say a step worked unless its result says so.`;
  return `\n\n${base} Driving apps (open, click, type in them) needs the Apps hand, which is off: ${handOffWhy(cfg, 'apps')} If asked to drive, say that and offer to start as soon as it's on.`;
}
// After a doing-tool fails: one other route, then stop (asked for 2026-11-02).
export const ALT_ROUTE_NUDGE = (who) => ` (If another route could still do this, try ONE other way now: for example, if a file or command tool failed, do it in the app with the Apps hand; if the Apps hand failed, use write_file, the Files Hand or the Run Hand. Then tell ${who} which way worked, or say plainly that neither did.)`;
export const ALT_ROUTE_DONE = (who) => ` (You already tried another way this turn. Stop here and tell ${who} plainly what failed, in the tools' own words.)`;
const DOING_TOOLS = new Set(['write_file', 'edit_file', 'save_spreadsheet']);
const isLook = (name) => ['app_look', 'list_schedules'].includes(name);

// 1.5.20 quick hand-back: the line Bob shows with a finished picture or clip when the brain had to leave the card for
// the painter and nothing else was asked for. null = reply the usual way (brain loads back and talks about it).
// Setting pictureNoWait (Settings, on): off brings back the old way.
const PAINT_TOOLS = new Set(['make_image', 'make_video']);
const NUM_WORDS = { a: 1, an: 1, one: 1, two: 2, both: 2, pair: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, few: 3, several: 3, some: 2 };
// How many creations the message asks for: "3 pictures", "a few images", "pictures of a fox" (plural = at least 2).
export function askedCount(text) {
  const t = String(text || '').toLowerCase().replace(/\ba (few|couple|pair)\b/g, '$1');
  const m = t.match(/\b(\d{1,2}|a|an|one|two|both|pair|couple|three|four|five|six|seven|eight|nine|ten|few|several|some)\b(?:\s+(?:of\s+)?(?:\w+\s+){0,3}?)(pictures?|images?|photos?|drawings?|paintings?|versions?|variations?|options?|clips?|videos?|wallpapers?|icons?|logos?)\b/);
  if (m) { const n = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_WORDS[m[1]]; if (n) return /s$/.test(m[2]) ? Math.max(n, 2) : n; }
  return /\b(pictures|images|photos|drawings|paintings|versions|variations|clips|videos|wallpapers|icons|logos)\b/.test(t) ? 2 : 1;
}
export function quickHandBack(cfg, ctx, reply) {
  if (cfg?.pictureNoWait === false) return null;
  const calls = reply?.tool_calls || [];
  if (!calls.length || !calls.every((c) => PAINT_TOOLS.has(c.function?.name))) return null;
  const p = ctx?.painted;
  if (!p?.brainLeft || p.count !== calls.length) return null; // a call failed, or the brain never left: talk as usual
  const ex = ctx.ledger?.expect;
  if (!ex || !['picture', 'show', 'video'].includes(ex.kind) || ex.also?.length) return null; // more was asked for
  if (p.total < askedCount(ctx.turnText)) return null; // "make 3 pictures" painted one at a time: let him finish
  if (p.total > 1) return p.kind === 'video' ? 'Here are the clips. Tell me what to change, or ask for more.' : 'Here are the pictures. Tell me what to change, or ask for more.';
  return p.kind === 'video' ? "Here's the clip. Tell me what to change, or ask for another." : "Here's the picture. Tell me what to change, or ask for another.";
}
const callKey = (name, args) => { let a = args; if (typeof a === 'string') { try { a = JSON.parse(a); } catch {} } return `${name}|${JSON.stringify(a ?? {})}`; };
const LINK_NUDGE = 'Web search is on, and the page from the link is just above (the fetch_page result). Answer from it now; never say you have no web access.';
const CANT_NUDGE = 'You now have every tool you can use on this PC. If one of them does what was asked, call it now. If none does, say so in one line; don\'t repeat yourself.';
const EMPTY_NUDGE = 'Your last reply was empty. You now have every tool you can use on this PC. Do what was asked: call the right tool now (for a picture, make_image), or answer in words.';
export const EMPTY_NOTE = 'Bob didn\'t answer that one. Send it again, or put it another way.';
const MAX_HISTORY = 40;
const MORE_SECONDS = 10; // how long "Make another picture?" waits
const APPROVAL_TIMEOUT_MS = 10 * 60 * 1000;

// Plain names for the app's screens. Bob's own names for his hats (persona.js) stay as they are.
// An edit instruction for a picture-edit model, with a line asking it to keep everything else (unless it already says what to keep).
export function editPrompt(prompt) {
  const p = String(prompt || '').trim();
  if (/\bkeep\b|\bunchanged\b/i.test(p)) return p;
  return `${p}${/[.!?]$/.test(p) ? '' : '.'} Keep everything else exactly as it is: faces and who people are, expressions, pose, lighting, background and framing.`;
}

const PLAIN_HATS = { tinker: 'Coding', ledger: 'Spreadsheets', scout: 'Research', painter: 'Images & video', reviewer: 'Review' };
// 1.5.148: copies whose work is code get Qwen's "thinking through code" preset (model-family.js).
const CODING_HATS = new Set(['tinker']);
const BRAIN_NAMES = { bob: 'main', tinker: 'workbench', ledger: 'ledger', scout: 'scouting', painter: "painter's", reviewer: 'second-look', eyes: 'eyes' };

// 1.5.49: how a brain load changes what Bob holds. swap = it replaces one, add = it joins one, load = nothing was loaded.
export function loadMode(plan) {
  if (!plan) return 'swap';
  if (plan.drop?.length) return 'swap';
  if (plan.keep?.length) return 'add';
  return 'load';
}
// The chat line for a brain load. A reviewer joining is the moot, said plainly.
export function loadLine({ mode, who, model, from, copy, secs, label, single = false, what = 'the answer', beside = false, onCard = false, besideOn = false, tip = false }) {
  const lc = (t) => t.charAt(0).toLowerCase() + t.slice(1); // "Coding brain (Qwen3 Coder 30B)" -> "coding brain (...)"
  const mine = (t) => lc(t).replace(/^brain \(/, 'main brain ('); // Bob's main slot reads "my main brain (...)"
  const now = lc(label(model, who)), old = from ? mine(label(from)) : '';
  if (who === 'reviewer') {
    if (mode === 'add' && beside && !onCard) return `🛰 Moot: ${copy} joins me to check ${what}, on the ${now}. It loads beside mine, on the processor, about ${secs} ${secs === 1 ? 'second' : 'seconds'}. Reviews there are slower than on the graphics card.`;
    if (mode === 'add') return `🛰 Moot: ${copy} joins me to check ${what}, on the ${now}. It loads beside mine, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
    // Settings sign-off (1.5.49): the real reason. Bob's own engine runs one brain whatever its size; Ollama is about memory.
    // Settings sign-off (1.5.51): switch off = a plain swap line; the tip about the switch shows once only (tip).
    if (mode === 'swap' && old && single && !besideOn) return `🛰 Moot: ${copy} checks ${what}. My ${old} steps out and the ${now} comes in, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.${tip ? ' (To keep both loaded, turn on "Let the reviewer sit beside Bob\'s main brain" in Settings, Brains.)' : ''}`;
    if (mode === 'swap' && old) return `🛰 Moot: ${copy} checks ${what}. ${single ? 'There isn\'t room for both right now' : 'Only one big brain fits right now'}, so my ${old} steps out and the ${now} comes in, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
    return `🛰 Moot: ${copy} checks ${what}, on the ${now}. Loading it, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  }
  if (mode === 'add' && old && beside && onCard) return `Adding the ${now} beside my ${old} on the graphics card, which has room for both. About ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  if (mode === 'add' && old && beside) return `Adding the ${now} on the processor, so my ${old} keeps working on the graphics card. About ${secs} ${secs === 1 ? 'second' : 'seconds'}, and this reply starts slower than usual.`;
  if (mode === 'add' && old) return `Adding the ${now} beside my ${old}, which stays loaded. About ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  if (mode === 'load' || !old) return `Loading the ${now}. Back in about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
  return `Swapping brains: my ${old} goes out and the ${now} comes in. Back in about ${secs} ${secs === 1 ? 'second' : 'seconds'}.`;
}

// 1.5.53: thinking goes to the "Bob's thinking" window in small batches (about 8 a second), not token by token.
export function thinkStream(emit, who, model, every = 120) {
  // The window's box for this brain call starts with the first thought, so a reply with no thinking leaves no empty box.
  let buf = '', timer = null, started = false;
  const flush = () => { clearTimeout(timer); timer = null; if (buf) { emit({ type: 'think', who, model, text: buf }); buf = ''; } };
  return { push: (t) => { if (!started) { started = true; emit({ type: 'think-start', who, model }); } buf += t; if (!timer) timer = setTimeout(flush, every); }, flush };
}

export class Brain {
  constructor(cfg, broadcast) {
    this.cfg = cfg;
    this.broadcast = broadcast;
    this.engine = cfg.engine === 'llamacpp' ? new LlamaCpp(cfg) : new Ollama(cfg);
    this.engine.log = (kind, text) => this.log(kind, text); // 1.5.35: the engine can note things in the logbook
    // 1.5.53: a second brain joined or left (chat page: Bob's head grows / shrinks; see public docs in the HANDOFF).
    this.engine.onBeside = (ev) => { this.broadcast({ type: 'second-brain', ...ev, label: ev.model ? this.brainLabel(ev.model) : '' }); this.broadcast({ type: 'brain' }); };
    this.sleepy = { since: 0, recent: [] }; // Gaming-session asides (public/sleepy.js)
    // Bob's own engine unloads its brain when idle; it asks here first so it never does that mid-job.
    if (this.engine instanceof LlamaCpp) this.engine.isBusy = () => this.turns.size > 0 || this.queue.some((j) => j.state === 'working');
    // The Brain toggle (1.5.2): "Always on" keeps the chat brain loaded; otherwise both engines let it go when idle.
    this.engine.holdModel = () => (holdsChatBrain(this.cfg) ? chatBrain(this.cfg).model : null);
    this.engine.keepFor = (model) => (holdsChatBrain(this.cfg) && sameModel(model, chatBrain(this.cfg).model) ? -1 : undefined);
    this.waking = null;
    this.graceTimer = null;
    this.engineName = cfg.engine === 'llamacpp' ? 'llama.cpp' : 'Ollama';
    // Share brains (1.5.55, src/share-brains.js): another Bob of yours may think quick replies for this one, and this one
    // may lend. A lender only ever uses his quick brain (never a big one), on the card, and says no while gaming or busy.
    this.lenders = new Lenders(cfg);
    // Bob-Net: one brain over several of your Bobs' cards (llama.cpp's RPC server). Both off unless switched on.
    this.cardLender = new CardLender(cfg, { gaming: () => currentSession(this.cfg).id === 'light', log: (k, t) => this.log(k, t) });
    if (this.engine instanceof LlamaCpp) this.engine.spread = new CardBorrower(cfg, this.lenders, { log: (k, t) => this.log(k, t) });
    // 1.5.127 Rented brains: a big brain hired from an online service for one job, only after a card the owner pressed.
    this.rentals = new Rentals(cfg, { log: (k, t) => this.log(k, t), broadcast: (ev) => this.broadcast(ev) });
    this.rentals.rememberEndpoint = (id, endpointId) => { try { if (saveEndpoint(cfg, id, endpointId)) saveSettings(cfg, { rentals: cfg.rentals }); } catch {} };
    this.lending = null;
    // 1.5.72 Share jobs (src/share-jobs.js): jobs this Bob sent away, their OK cards, and jobs other Bobs sent here.
    this.awayJobs = new Map();
    this.awayApprovals = new Map();
    this.guests = new GuestJobs(this, { canNow: () => this.guestCanNow() });
    const raw = this.broadcast;
    this.broadcast = (ev) => { raw(ev); try { this.guests.watch(ev); } catch {} };
    this.lendDeps = { currentSession, quickBrain: (b) => { const sb = sessionBrains(b.cfg); const m = sb.small && runnable(b, sb.small) ? sb.small : (b.cfg.engine === 'llamacpp' ? null : sb.small); return m ? { model: m, cpu: false, ctx: Math.min(chatBrain(b.cfg).ctx || 32768, 32768) } : null; }, reviewBrain: (b) => reviewBrainOf(b),
      // 1.5.185 Check harder jobs for my other Bobs: the Review brain (Review slot, else Deep thinking, else main), on the card.
      checkBrain: (b) => { const r = reviewBrain(b.cfg); return r && (runnable(b, r.model) || b.cfg.engine !== 'llamacpp') ? { model: r.model, cpu: false, ctx: 32768, think: 'high' } : null; } };
    this.tools = buildTools(cfg);
    this.refs = new RefShelf(cfg);
    this.sessions = new Map();
    this.approvals = new Map();
    this.state = { state: 'idle', model: null, detail: '' };
    this.turns = new Map(); // lane -> running job. One lane normally; an Art session adds a picture lane.
    // 1.5.12: handoffs between brains and engines go through the gate (handoff.js): one owner of the graphics card
    // at a time, actions held until their engine is really ready, failed loads retried, then a fallback.
    this.gate = new Gate(this);
    // The picture engine kept loaded between pictures (sd-server); it falls back to one-shot sd-cli by itself.
    this.painter = new PainterServer(cfg, { log: (k, m) => this.log(k, m) });
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    this.queue = this.loadQueue();
    setTimeout(() => this.pump(), 1500); // pick up anything left waiting when Bob was last closed
    setTimeout(() => this.armIdleCheck(), 1500); // 1.5.41: a session left on from last time goes back to the lightest one
    this.sessionDir = path.join(cfg.dataDir, 'sessions');
    fs.mkdirSync(this.sessionDir, { recursive: true });
    this.reminderTimer = setInterval(() => this.checkReminders(), 15000);
    this.reminderTimer.unref?.();
    this.housekeeper = new Housekeeper(cfg, this);
    this.tools.forget_topic = forgetTopicTool(this);
    Object.assign(this.tools, handsTools(this), scheduleTools(this), officeTools(this), securityTools(this), selfToolsTools(this), howtoTools(this)); // Hands: off until the user turns them on (see hands-settings.js)
    this.tools.use_tools = useToolsTool(this);
    this.tools.show_plan = showPlanTool(this); // 1.5.78: the plan card before big jobs (plan.js), only with its setting on
    this.tools.ask_together = askTogetherTool(this); // 1.5.42: every OK a job needs on one card (together.js) // the toolbox (toolbox.js): groups added only when a job needs them
    this.tools.pick_session = pickSessionTool(this); // 1.5.43: Bob changes session himself (auto-session.js)
    this.tools.edit_my_message = editOwnTool(this); // Let Bob fix his own messages (edit-own.js), only with its setting on
    this.tools.take_note = notesTool(this); // Let Bob take quick notes (notes.js), only with its setting on
    this.tools.find_in_documents = findDocsTool(cfg); // Read and search my documents (my-docs.js), only with its setting on
    this.tools.run_in_sandbox = sandboxTool(this); // Let Bob work things out in a sandbox (sandbox-code.js), only with its setting on
    // 1.5.91: the Set it up card for something missing or switched off. Listed only while something is (offTools).
    this.tools.offer_setup = {
      schema: { type: 'function', function: { name: 'offer_setup', description: 'When {{USER}}\'s request needs a missing part or a setting that is off: show a card with one button that sets it up, then the job carries on. For pictures, video, music and sound, just call make_image, make_video, make_music or make_sound: they show the card.', parameters: { type: 'object', properties: { what: { type: 'string', enum: [...Object.keys(NEEDS), ...SWITCH_KEYS], description: 'What to set up. voice = read replies aloud, hearing = hear {{USER}} talk, workshop = ComfyUI, hand:<id> = a Hand that is off.' } }, required: ['what'] } } },
      run: ({ what }, ctx) => this.offerSetup(String(what || ''), ctx),
      summary: ({ what }) => `offer to set up: ${what}`
    };
    this.made = new Made(cfg); // Made by Bob (made.js): everything he made, for the side panel and show_made
    this.tools.show_made = showMadeTool(this);
    this.stickyGroups = new Map(); // chat id -> Map(group -> messages left)
    this.howtos = new HowTos(cfg); // 1.5.79: know-how from jobs that worked (off by default)
    this.offers = new SetupOffers(); // 1.5.91: "Set it up" cards waiting for a click
    this.lastTrail = new Map(); // chat id -> the steps of its last job worth keeping, for save_howto
    this.handApprovals = new Set(); // approvals waiting that came from a Hand, so Stop everything can deny them
    // Always on: load the small brain shortly after start-up. Wake when I type (the default) loads nothing.
    if (holdsChatBrain(cfg)) { const t = setTimeout(() => this.wake('always on').catch(() => {}), 4000); t.unref?.(); }
  }

  // ---------- Share jobs (1.5.72) ----------
  // A big brain for Medium-and-up work that's really here (the file is on disk), not just picked in Equip Bob.
  guestBigBrain() { const d = draftBrain(this.cfg, 'medium'); if (!d?.model) return false; return this.cfg.engine === 'llamacpp' ? runnable(this, d.model) : true; }
  guestCanNow() { const can = this.jobCan(); return NEEDS_LIST.filter((n) => canHere(this, n, { can, webOn: webOn(this.cfg) })); }
  // 1.5.133 lost-song fix: what this Bob can really make right now. capabilities() says music once the audio workshop is
  // set up, but a song also needs the music models (several GB, downloaded the first time). A Bob without them must not
  // tell his other Bobs he takes music, and a Bob asking for a song sends it to one that has them.
  jobCan() { const can = { ...capabilities(this.cfg) }; if (can.music && !this.cfg.audio?.aceUrl) { try { if (aceMissingFiles(this.cfg).length) can.music = false; } catch {} } return can; }

  // ---------- Share brains (1.5.55) ----------
  borrowCase(job, pics) { return { session: currentSession(this.cfg).id, busy: this.turns.size > 1 || this.queue.some((j) => j.state === 'working' && j !== job), job, pics }; }
  borrowLikely() { return wantsBorrow(this.cfg, this.borrowCase(null, [])) && this.lenders.likely(); }
  lenderStatus() { return this.lenders.bobs().map((b) => { const s = this.lenders.state.get(b.address); return { address: b.address, name: b.name, ok: s ? s.ok : null, why: s?.why || '', brain: s?.brain || '', device: s?.device || '', ctx: s?.ctx || 0, speed: s?.measured?.tokPerSec || s?.speed || 0, jobs: s?.jobs || [], jobsBusy: s?.jobsBusy || '', ms: s?.ok ? s?.ms || 0 : 0, lendCard: s?.lendCard === true, scut: s?.scut === true }; }); }

  // ---------- Keep Bob light (1.5.2) ----------
  // Loads the chat brain ahead of a message: someone started typing, or "Always on" wants it back after a job.
  // Never during a job. Returns true when it loaded something.
  async wake(reason = 'typing') {
    if (this.waking) return this.waking;
    if (this.turns.size) return false;
    if (reason === 'typing' && this.borrowLikely()) return false; // another Bob will think this one: stay light
    const { model, cpu, ctx: want } = chatBrain(this.cfg);
    if (!model) return false;
    clearTimeout(this.graceTimer);
    this.waking = (async () => {
      const ctx = await this.fitCtx(model, want);
      if (!(await apuRoom(this, model, ctx)).ok) { this.log('model', `not waking ${model}: too little RAM to spare on built-in graphics`); return false; }
      let loaded = false;
      try { loaded = await this.engine.isLoaded(model, { cpu, ctx }); } catch { return false; }
      if (loaded) { this.engine.touch?.(model, { cpu, ctx })?.catch?.(() => {}); return false; }
      if (!cpu && await this.cardStillTaken({ kind: 'chat' })) return false; // 1.5.113: another program holds the card: don't load
      this.setState('waking', 'Waking up...', model);
      this.broadcast({ type: 'brain' });
      // Same manners as the gate: the picture engine (kept loaded after a picture) makes room first, unless both fit.
      if (!cpu && this.painter?.yieldFor) await this.painter.yieldFor(model, { bytes: this.gate.brainBytes(model, { ctx }) }).catch(() => {});
      const took = await this.engine.preload(model, undefined, { cpu, ctx });
      this.log('model', `woke ${model} in ${took.toFixed(1)} s (${reason})`);
      // 1.5.24 "Get Bob ready while you type": read the instructions while the user is still typing.
      if (this.cfg.readyWhileTyping === true && this.engine.prime) {
        const t0 = Date.now();
        this.engine.prime(model, { ctx, cpu, ...this.startPrompt() })
          .then((how) => how && this.log('model', `read his instructions ahead (${how}, ${((Date.now() - t0) / 1000).toFixed(1)} s)`))
          .catch((e) => this.log('model', `couldn't read ahead: ${e.message}`));
      }
      return true;
    })();
    try { return await this.waking; }
    catch (e) { this.log('model', `couldn't wake ${model}: ${e.message}`); return false; }
    finally {
      this.waking = null;
      if (!this.turns.size) this.setState('idle', '', this.state.model);
      this.broadcast({ type: 'brain' });
    }
  }

  // Two-Bob trial (the Go, Test D): a lent check sizes its chat memory to the work before refusing (share-brains.js).
  roomCheck(model, ctx, opts) { return apuRoom(this, model, ctx, opts); }

  // After a job: big brains go right away; the chat brain stays only if "Always on" holds it (and comes back
  // if a big brain pushed it out). Only Bob's own brains are touched, never another app's.
  async settle({ noWake = false } = {}) {
    if (this.turns.size || this.waking || this.queue.some((j) => j.state === 'waiting')) return [];
    this.armIdleCheck(); // 1.5.41: back to the lightest session once Bob has been quiet a while
    const chat = chatBrain(this.cfg).model;
    let loaded = [];
    try { loaded = await this.engine.loaded(); } catch { return []; }
    const gone = [];
    for (const m of loaded) {
      if (this.turns.size) break; // a new job started: leave the rest to it
      if (m.beside) { gone.push(...(await this.engine.dropBeside?.().catch(() => []) || [])); continue; } // 1.5.51: the second server goes after every job
      if (!isBobs(this.cfg, m.name) && !sameModel(m.name, chat)) continue;
      if (sameModel(m.name, chat)) continue; // the chat brain: held, or let go by the idle timer / grace below
      gone.push(...(await (this.engine.unload ? this.engine.unload(m.name) : this.engine.unloadAll()).catch(() => [])));
    }
    if (gone.length) this.log('model', `let go of ${gone.join(', ')} after the job`);
    clearTimeout(this.graceTimer);
    // Coding and Deep thought: the chat brain is a big one. A short grace for a follow-up question, then it goes.
    if (bigSession(this.cfg) && loaded.some((m) => sameModel(m.name, chat))) {
      this.graceTimer = setTimeout(async () => {
        if (this.turns.size || this.waking) return;
        const g = await (this.engine.unload ? this.engine.unload(chat) : this.engine.unloadAll()).catch(() => []);
        if (g.length) { this.log('model', `let go of ${g.join(', ')} (big brain, idle)`); this.broadcast({ type: 'brain' }); }
      }, bigGraceMs(this.cfg));
      this.graceTimer.unref?.();
    }
    // "Make another picture?" is showing, or was answered Yes: the picture engine keeps the card. The answer (No, or no
    // answer in 10 s) brings the brain back, not this.
    if (this.morePictures) { this.broadcast({ type: 'brain' }); return gone; }
    if (holdsChatBrain(this.cfg) && !this.turns.size) await this.wake('always on');
    // 1.5.21: after any job (a picture, a big brain, a helper) Bob goes back to his quick chat brain in the
    // background, so a follow-up is answered fast instead of waiting for the next message to load it. The usual
    // idle timer still frees it once he's been quiet. Not in Coding / Deep thought, whose chat brain is a big one.
    else if (!noWake && !bigSession(this.cfg) && !this.turns.size) await this.wake('back to the quick brain after a job'); // 1.5.120: not after a game (Adventure)
    this.broadcast({ type: 'brain' });
    return gone;
  }

  // The toggle changed: Always on loads the chat brain now; Wake when I type starts the idle clock on it.
  async applyBrainMode() {
    if (holdsChatBrain(this.cfg)) return this.wake('always on');
    const { model, cpu, ctx: want } = chatBrain(this.cfg);
    if (model && !this.turns.size) { const ctx = await this.fitCtx(model, want); await this.engine.touch?.(model, { cpu, ctx })?.catch?.(() => {}); }
    this.broadcast({ type: 'brain' });
    return false;
  }

  // For the label on the chat page: asleep, waking, awake or working, and how much memory Bob's brains hold.
  async brainStatus() {
    let loaded = [], engineOk = true;
    try { loaded = await Promise.race([this.engine.loaded(), new Promise((r) => setTimeout(() => r([]), 3000))]); } catch { engineOk = false; }
    const chat = chatBrain(this.cfg);
    const mine = loaded.filter((m) => isBobs(this.cfg, m.name) || sameModel(m.name, chat.model));
    const gb = memGB; // same unit as the graphics card meter in Now running (1.5.26)
    // gb: on the graphics card; ramGB: the part in system memory (RAM), when the engine says how it splits.
    const models = mine.map((m) => {
      const split = m.split !== false && m.size > 0;
      const ramGB = split ? gb(Math.max(0, m.size - (m.vram || 0))) : null;
      // estimate: llama.cpp without a per-process figure from nvidia-smi (common on Windows) only knows the file size.
      return { name: m.name, ...(m.beside ? { label: `${m.name} (beside, ${m.onCard ? 'on the graphics card' : 'on the processor'})`, beside: true } : {}), gb: split ? gb(m.vram || 0) : gb(m.vram || m.size), ramGB, estimate: !split && !m.vram, ctx: m.ctx || null, onCard: m.beside ? Boolean(m.onCard) : (m.vram > 0 || (!m.vram && !chat.cpu && !split)), chat: !m.beside && sameModel(m.name, chat.model) };
    });
    const ramKnown = models.some((m) => m.ramGB != null);
    const state = this.waking ? 'waking' : this.turns.size ? 'working' : models.length ? 'awake' : 'asleep';
    let wakeSeconds = null;
    try { if (chat.model) wakeSeconds = await this.engine.estimateLoad(chat.model); } catch {}
    return {
      mode: brainMode(this.cfg), holds: holdsChatBrain(this.cfg), bigSession: bigSession(this.cfg), session: currentSession(this.cfg).label,
      state, models, gb: Math.round(models.reduce((a, m) => a + m.gb, 0) * 10) / 10, ramGB: ramKnown ? Math.round(models.reduce((a, m) => a + (m.ramGB || 0), 0) * 10) / 10 : null,
      chatBrain: chat.model || null, sleepAfter: sleepAfterText(this.cfg), bigGrace: msText(bigGraceMs(this.cfg)), wakeSeconds, engineOk,
      speed: this.engine.lastStats || null, // 1.5.30: the last reply's tokens per second and context use
      handoff: this.gate?.flags() || null // who has the graphics card, what's loading, how many wait (ready flags)
    };
  }

  checkReminders() {
    const list = loadReminders(this.cfg);
    const due = list.filter((r) => r.at <= Date.now());
    if (!due.length) return;
    saveReminders(this.cfg, list.filter((r) => r.at > Date.now()));
    for (const r of due) {
      this.broadcast({ type: 'reminder', text: r.text, local: r.local });
      this.log('reminder', r.text);
    }
  }

  now() {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: this.cfg.timeZone, weekday: 'long', year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }).format(new Date());
  }

  setState(state, detail = '', model = this.state.model, extra = null) {
    const was = this.state?.state;
    this.state = { state, detail, model, ...(extra || {}) }; // extra (1.5.49): how a brain loads, { mode, from }
    this.broadcast({ type: 'status', ...this.state });
    // 1.5.41: a media step just started; a chat message already waiting may now go beside it.
    // 1.5.110: a chat waiting behind the job keeps its ⏳ line current ("loading the picture engine", then "step 3 of 20").
    if (state === 'painting') for (const j of this.queue || []) {
      if (j.state !== 'waiting') continue;
      // 1.5.112: a chat sent in the second before the painter took over got no ⏳ line (busyLine said not yet); give it one now.
      if (!j.queuedLine) { if (!this.busyLine(j)) continue; j.queuedLine = true; }
      const text = queuedLine(plainDoing(detail));
      if (text !== j.queuedText) { j.queuedText = text; this.broadcast({ type: 'waiting-line', sessionId: j.sessionId, jobId: j.id, id: `queued-${j.id}`, text }); }
    }
    if (state === 'painting' && was !== 'painting' && this.cfg?.chatWhileBusy !== false && this.queue?.some((j) => j.state === 'waiting')) setTimeout(() => this.pump(), 0);
  }

  // 1.5.113: a load timed out. Is another program holding the graphics card? Then say so (once per chat) and don't retry.
  async cardTaken(e, emit, sessionId) {
    if (!isLoadTimeout(e)) return false;
    const card = await (this.readCardUse || readCardUse)();
    if (!busyByOther(card)) { this.cardHeld = null; return false; }
    this.cardHeld = { at: Date.now(), line: cardBusyLine(card), said: this.cardHeld?.said || new Set() };
    this.log('handoff', `graphics card taken by another program (${card.freeMB} MB free${card.others.length ? `: ${card.others.map((a) => a.name).join(', ')}` : ''}); not retrying`);
    if (emit && sessionId != null && !this.cardHeld.said.has(sessionId)) { this.cardHeld.said.add(sessionId); emit({ type: 'announce', text: this.cardHeld.line }); }
    return true;
  }

  // 1.5.113: the ⚠ line in full once per chat; after that, a short pointer to it.
  cardLineFor(sessionId) {
    const h = this.cardHeld;
    if (!h) return '';
    if (h.said.has(sessionId)) return CARD_STILL_BUSY;
    h.said.add(sessionId);
    return h.line;
  }

  // 1.5.113: before a job (or a wake-up) that needs the card, while it's known to be taken: look again (at most every
  // 30 s). Still taken = the job ends at once with the plain line, instead of sitting through its own five-minute load.
  async cardStillTaken(job) {
    if (!this.cardHeld) return false;
    if (currentSession(this.cfg).cpu && !['picture', 'video', 'edit'].includes(job?.kind)) return false; // chats on the processor
    if (Date.now() - this.cardHeld.at < RECHECK_MS) return true;
    const card = await (this.readCardUse || readCardUse)();
    if (!busyByOther(card)) { this.cardHeld = null; this.log('handoff', 'the graphics card is free again'); return false; }
    this.cardHeld = { at: Date.now(), line: cardBusyLine(card), said: this.cardHeld.said };
    return true;
  }

  // 1.5.111: the waiting is over (the job started, or was stopped), so its ⏳ line leaves the chat.
  waitOver(j) {
    if (!j?.queuedLine) return;
    j.queuedLine = false;
    this.broadcast({ type: 'waiting-line-done', sessionId: j.sessionId, jobId: j.id, id: `queued-${j.id}` });
  }

  log(kind, text) {
    const stamp = new Intl.DateTimeFormat('en-CA', { timeZone: this.cfg.timeZone, dateStyle: 'short', timeStyle: 'short', hour12: false }).format(new Date());
    const line = `- ${stamp} | ${kind} | ${String(text).replace(/\s+/g, ' ').slice(0, 200)}\n`;
    try {
      if (!fs.existsSync(this.cfg.logbook)) fs.writeFileSync(this.cfg.logbook, "# Bob's logbook\n\nEverything Bob did, newest at the bottom.\n\n");
      fs.appendFileSync(this.cfg.logbook, line);
    } catch { /* logging must never break a turn */ }
  }

  // forText (helpers' jobs): with "Remember only what fits" on, the lines that fit the job, matched by words.
  memory(forText = '') {
    try {
      const m = fs.readFileSync(this.cfg.memoryFile, 'utf8');
      // 1.5.79: with recall on, the instructions keep only the [always] lines; the rest come per message (recall()).
      if (recallOn(this.cfg)) {
        const always = alwaysText(m);
        if (!forText) return always;
        const lines = parseMemory(m);
        const { project } = activeProject(this.cfg, forText, { bankNames: [...new Set(lines.map((l) => l.project).filter(Boolean))] });
        const picked = pickMemories(lines, { text: forText, project }).filter((l) => !l.always);
        return [always, picked.map((l) => `- ${l.text}${l.project ? ` [${l.project}]` : ''}`).join('\n')].filter(Boolean).join('\n');
      }
      return m.length > 4000 ? m.slice(-4000) : m;
    } catch { return ''; }
  }

  // 1.5.79: the memory lines that fit this message, from the general bank and the active project's bank.
  async recallMemories(sessionId, text, { vec = null, topicProject = '' } = {}) {
    let m = '';
    try { m = fs.readFileSync(this.cfg.memoryFile, 'utf8'); } catch { return ''; }
    const lines = parseMemory(m);
    if (!lines.length) return '';
    this.memProject ||= new Map();
    const bankNames = [...new Set(lines.map((l) => l.project).filter(Boolean))];
    const { project, why } = activeProject(this.cfg, text, { sticky: this.memProject.get(sessionId) || '', topicProject, bankNames });
    if (sessionId && why === 'named') this.memProject.set(sessionId, project);
    const hk = this.housekeeper;
    const model = this.cfg.housekeeping?.embedModel || 'nomic-embed-text';
    const vecs = vec && hk ? (hk.memVecs ||= new MemoryVectors(this.cfg)).load(model) : {};
    const picked = pickMemories(lines, { text, project, qvec: vec, vecs });
    const fresh = picked.filter((l) => !l.always);
    this.lastRecall = { at: Date.now(), session: sessionId, project, lines: fresh.length, of: lines.length, by: vec ? 'meaning' : 'words' };
    return recallText(fresh, { project, user: this.cfg.userName || 'the user' });
  }

  session(id) {
    if (!this.sessions.has(id)) {
      let msgs = [];
      try { msgs = JSON.parse(fs.readFileSync(this.sessionFile(id), 'utf8')); } catch {}
      this.sessions.set(id, msgs);
    }
    return this.sessions.get(id);
  }

  sessionFile(id) { return path.join(this.sessionDir, id.replace(/[^a-zA-Z0-9-]/g, '') + '.json'); }

  saveSession(id) {
    const msgs = stampMessages(this.session(id));
    // Bob reads the last 40 messages every turn. Older ones move to the chat's older file (word for word)
    // and the housekeeper sums them up when Bob is idle; they used to be dropped without a trace.
    const dropped = [];
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    if (lastUser >= 0 && msgs.length - lastUser > MAX_HISTORY) {
      // One turn longer than the whole window (a runaway tool loop): trimming from the front would drop the
      // question too and leave an empty chat. Keep the question and what was said; the tool steps go to the older file.
      const turn = msgs.slice(lastUser + 1);
      const said = turn.filter((m) => m.role === 'assistant' && !m.tool_calls?.length && (String(m.content || '').trim() || m.media?.length || m.correction)).slice(-(MAX_HISTORY - 1));
      dropped.push(...msgs.slice(0, lastUser), ...turn.filter((m) => !said.includes(m)));
      msgs.splice(0, msgs.length, msgs[lastUser], ...said);
    }
    while (msgs.length > MAX_HISTORY) dropped.push(msgs.shift());
    while (msgs.length && msgs[0].role !== 'user') dropped.push(msgs.shift()); // never start mid tool-call
    if (dropped.length) { try { keepOlder(this.cfg, id, dropped); } catch {} }
    for (const m of msgs) delete m.images; // pictures stay on the shelf; Bob keeps the description
    try { writeJsonAtomic(this.sessionFile(id), msgs, 0); } catch {}
  }

  history(id) {
    return this.session(id)
      .filter((m) => (m.role === 'user' || m.role === 'assistant') && (m.content || m.media?.length || m.correction))
      .map((m) => ({ role: m.role, id: m.id, at: m.at, ...(m.forgotten ? { forgotten: true } : {}), content: m.role === 'user' && m.text != null ? m.text : (m.content || ''), ...(m.media?.length ? { media: m.media } : {}), ...(m.correction ? { correction: m.correction } : {}), ...(m.edited ? { edited: m.edited, was: m.was ?? '' } : {}), pics: (m.refs || []).map((id) => this.refs.find(id)).filter(Boolean).map((r) => ({ name: r.name, url: `/refs/${r.file}` })) }));
  }

  // Makes sure a model is in memory, telling the user first if it means a wait. Goes through the gate: the action
  // waits for the card, the brain is checked ready after loading, a failed load is tried again, and a brain that
  // still won't load hands the job to the main brain. Returns the model that's really loaded (use that one).
  async ensureModel(model, emit, signal, who = 'bob', opts = {}) {
    if (this.waking) await this.waking.catch(() => {}); // typing already started loading it: don't load twice
    clearTimeout(this.graceTimer);
    if (!opts.beside && !opts.noTalker) await this.keepTalker(model, opts, emit, { signal });
    if (!signal) { try { await this.engine.isLoaded(model, opts); } catch (e) { throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`); } }
    // 1.5.126: built-in graphics share Windows's RAM: no load that would leave Windows short (apuRoom).
    const room = await apuRoom(this, model, opts.ctx, opts.minCtx ? { minCtx: opts.minCtx } : undefined);
    if (!room.ok) { this.log('model', `not loading ${model}: needs ~${room.needGB} GB, room ~${room.roomGB} GB keeping ${apuHoldbackGB(this.cfg)} GB for Windows`); throw new Error(room.line); }
    const name = BRAIN_NAMES[who] || who;
    const used = await this.gate.need({ id: 'brain', model, opts }, {
      signal, emit, who,
      announce: async (m, attempt) => {
        const secs = await this.engine.estimateLoad(m, opts).catch(() => 15);
        // 1.5.49: say whether this brain replaces one (swap), joins one (add), or fills an empty head (load).
        const plan = await this.engine.loadPlan?.(m, opts).catch(() => null) || null;
        const mode = loadMode(plan);
        const text = attempt ? `That didn't load right. Trying the ${this.brainLabel(m, who)} again, about ${secs} ${secs === 1 ? 'second' : 'seconds'}.` : loadLine({ mode, who, model: m, from: plan?.drop?.[0] || plan?.keep?.[0] || '', copy: who === 'reviewer' ? copyName(this.cfg, 'reviewer', 'second look') : '', secs, label: (x, w) => this.brainLabel(x, w), single: Boolean(plan?.single), beside: Boolean(plan?.beside), onCard: Boolean(plan?.onCard), besideOn: this.cfg.mootBeside === true, tip: who === 'reviewer' && mode === 'swap' && Boolean(plan?.single) && this.cfg.mootBeside !== true && this.besideTipOnce(), ...(opts?.what ? { what: opts.what } : {}) });
        emit({ type: 'announce', text, seconds: secs });
        this.setState('loading', text, m, { mode: attempt ? 'swap' : mode, from: plan?.drop?.[0] || plan?.keep?.[0] || '', ...(plan?.beside ? { beside: true } : {}) });
      }
    }).catch((e) => {
      if (/^Stopped\.$/.test(e.message)) throw e;
      if (/ECONNREFUSED|fetch failed|can't reach/i.test(e.message)) throw new Error(`I can't reach my engine, ${this.engineName} (${e.message}).`);
      throw e;
    });
    this.state.model = used;
    if (this.state.state === 'loading' || this.state.state === 'waiting') { this.log('model', `loaded ${used}`); this.setState('thinking', '', used); }
    return used;
  }

  // 1.5.51: the tip about "Let the reviewer sit beside Bob's main brain" shows the first time a moot swaps, then never
  // again (a marker in Bob's data folder remembers it across restarts).
  besideTipOnce() {
    const f = path.join(this.cfg.dataDir || '.', 'moot-beside-tip-shown');
    try { if (fs.existsSync(f)) return false; fs.writeFileSync(f, new Date().toISOString()); } catch { if (this.besideTipShown) return false; }
    this.besideTipShown = true;
    return true;
  }

  // 1.5.53 (the owner's idea): before a big brain pushes the quick brain off the card, a small talker starts on the
  // processor beside it (second server), so chat carries on during the job. The chat page gets second-brain events and
  // the brain bay shows the add. Under "Keep chatting while Bob is busy"; never in Gaming; only with room in RAM.
  async keepTalker(model, opts = {}, emit = () => {}, { freeMem = freeMemNow(), signal = null } = {}) {
    const cfg = this.cfg;
    if (cfg.chatWhileBusy === false || cfg.engine !== 'llamacpp' || typeof this.engine.besideServer !== 'function') return false;
    if (currentSession(cfg).id === 'light' || opts.cpu) return false; // Gaming, or a brain on the processor (two would fight)
    const talker = talkerModel(this);
    if (!talker || !model || isTalker(this, model) || !runnable(this, talker)) return false;
    if (this.engine.besideLoaded?.() || this.talking) return false;
    let main = [];
    try { main = (await this.engine.loaded()).filter((m) => !m.beside).map((m) => m.name); } catch {}
    if (main.some((n) => sameModel(n, model))) return false; // already loaded: nothing gets pushed out
    const ctx = talkerCtx(cfg);
    if (freeMem < besideBytes(this, talker, ctx) + 2 * GB) return false;
    this.talking = true;
    try {
      // 1.5.133: never on the card: the job's brain isn't loaded yet, so the card only looks empty.
      await this.engine.preload(talker, undefined, { beside: true, cpu: true, ctx, place: 'none' });
      if (!signal || this.talkerSaid !== signal) emit({ type: 'announce', text: TALKER_LINE(this.brainLabel(talker).replace(/^.*?\((.*)\)$/, '$1')) }); // once per job
      this.talkerSaid = signal;
      this.log('model', `kept ${talker} on the processor beside the job, for chat (chat memory ${ctx})`);
      return true;
    } catch (e) { this.log('model', `couldn't keep a talker beside the job: ${e.message}`); return false; }
    finally { this.talking = false; }
  }

  // How a brain is named to the user: its Equip slot and its catalog name, never a model id.
  // "Coding brain (Qwen3 Coder 30B)", "Quick brain (Gemma 4 E4B)", "Brain (Gemma 4 26B)".
  brainLabel(model, who = 'bob') {
    const SLOT = { bob: 'Brain', small: 'Quick brain', deep: 'Deep thinking', tinker: 'Coding', reviewer: 'Review', eyes: 'Seeing pictures', ledger: 'Spreadsheets', scout: 'Research', painter: 'Prompt writer' };
    let slot = who;
    if (who === 'bob') slot = sameModel(model, this.cfg.models?.small) ? 'small' : sameModel(model, sessionBrains(this.cfg).deep) && !sameModel(model, this.cfg.models?.bob) ? 'deep' : 'bob';
    const s = SLOT[slot] || 'Brain';
    const phrase = /brain$/i.test(s) ? s : `${s} brain`;
    if (!this.catalogNames) {
      this.catalogNames = [];
      try { this.catalogNames = JSON.parse(fs.readFileSync(this.cfg.catalogFile || new URL('../catalog.json', import.meta.url), 'utf8')).models.filter((x) => x.ollama && x.name).map((x) => [x.ollama, x.name]); } catch {}
      for (const o of ownModels(this.cfg)) this.catalogNames.push([o.id, o.name]); // 1.5.135 brains of your own, by their given name
    }
    const nice = this.catalogNames.find(([id]) => sameModel(id, model))?.[1] || String(model || '').replace(/:latest$/, '');
    return `${phrase} (${nice})`;
  }

  // ---------- "Make another picture?" ----------
  // After a picture shown without the brain coming back, the chat box asks for 10 seconds. Yes: the picture engine
  // stays loaded for the next one (another full grace, 2 minutes or the idle time). No, no answer, or a new job: the
  // picture engine lets go and the quick brain comes back. Only when the engine is really still loaded.
  offerMore(sessionId, kind = 'image') {
    if (!this.painter?.alive?.()) return null;
    this.endMore(null, 'replaced');
    const id = crypto.randomUUID();
    const seconds = MORE_SECONDS;
    const timer = setTimeout(() => this.answerMore(id, false, 'no answer'), seconds * 1000);
    timer.unref?.();
    this.morePictures = { id, sessionId, timer, asked: true };
    this.broadcast({ type: 'more-pictures', id, sessionId, seconds, kind: kind === 'video' ? 'video' : 'image' });
    this.log('painter', 'asked "make another?"');
    return id;
  }

  // more: true (Yes), false (No). how: 'click', 'no answer', 'new job'. Returns false for an old or unknown card.
  answerMore(id, more, how = 'click') {
    const m = this.morePictures;
    if (!m || !id || m.id !== id || !m.asked) return false;
    clearTimeout(m.timer);
    this.broadcast({ type: 'more-pictures-done', id: m.id, sessionId: m.sessionId, more: Boolean(more) });
    this.log('painter', `"make another?": ${more ? 'yes' : 'no'} (${how})`);
    if (more) {
      // Held for the next picture: a fresh grace on the engine, and the brain stays away until then.
      this.painter?.armIdle?.();
      const until = setTimeout(() => this.endMore(m.id, 'grace over'), this.painter?.graceMs?.() || 120000);
      until.unref?.();
      this.morePictures = { id: m.id, sessionId: m.sessionId, timer: until, asked: false };
      return true;
    }
    this.endMore(m.id, how);
    return true;
  }

  // Let go of the picture engine and bring the brain back (No, no answer, Yes's grace over).
  endMore(id, why) {
    const m = this.morePictures;
    if (!m || (id && m.id !== id)) return;
    clearTimeout(m.timer);
    this.morePictures = null;
    if (m.asked) this.broadcast({ type: 'more-pictures-done', id: m.id, sessionId: m.sessionId, more: false });
    if (why === 'replaced' || why === 'new job') return; // the next job loads what it needs through the gate
    (async () => {
      if (this.turns.size) return;
      await this.painter?.unload?.('done making pictures').catch?.(() => {});
      if (!this.turns.size && !bigSession(this.cfg)) await this.wake('back to the quick brain after pictures');
      this.broadcast({ type: 'brain' });
    })().catch(() => {});
  }

  // The brain a job falls back to when another brain won't load.
  fallbackBrain() { return chatBrain(this.cfg); }

  // A chat call that survives the engine dropping out mid-answer: the brain is loaded again and the call made once more.
  async chatSafe(opts, { emit, who = 'bob' } = {}) {
    // 1.5.53: while a "Bob's thinking" window is open, his thinking streams to it, a few times a second (never saved).
    const mind = emit && this.mindWatchers?.() ? thinkStream(emit, who, opts.model) : null;
    if (mind) opts = { ...opts, onThink: mind.push };
    const fitted = fitContext(opts.messages, opts.ctx, opts.tools);
    if (fitted !== opts.messages) { this.log('chat', `shortened tool results so the chat fits in ${opts.model}'s memory (${opts.ctx} tokens)`); opts = { ...opts, messages: fitted }; }
    try { return await this.chatRetry(opts, { emit, who }); }
    catch (e) {
      // Still too long (the guess at token counts was low): once more, with every tool result cut harder.
      if (opts.signal?.aborted || !TOO_LONG.test(String(e?.message)) || !(Number(opts.ctx) > 0)) throw e;
      const tighter = fitContext(opts.messages, opts.ctx, opts.tools, 0.4);
      if (tighter === opts.messages) throw e;
      this.log('chat', `the brain said the chat was too long (${String(e.message).slice(0, 120)}); cut the tool results harder and asked again`);
      return await this.chatRetry({ ...opts, messages: tighter }, { emit, who });
    }
    finally { mind?.flush(); }
  }

  async chatRetry(opts, { emit, who }) {
    try { return await this.engine.chat(opts); }
    catch (e) {
      if (opts.signal?.aborted) throw e;
      let alive = true;
      try { alive = await this.engine.isLoaded(opts.model, { cpu: opts.cpu, ctx: opts.ctx, beside: opts.beside }); } catch { alive = false; }
      if (alive && !/ECONNRESET|socket hang up|fetch failed|terminated|ECONNREFUSED/i.test(e.message)) throw e;
      this.log('handoff', `${opts.model} dropped out mid-answer (${e.message}); loading it again`);
      this.gate.ledgerOf(opts.signal)?.step('retry', { what: opts.model, why: e.message }).done();
      emit?.({ type: 'token', text: '\n\nMy brain dropped out there. Loading it again and picking up where I left off.\n\n' });
      const model = (await this.ensureModel(opts.model, emit || (() => {}), opts.signal, who, { cpu: opts.cpu, ctx: opts.ctx, ...(opts.beside ? { beside: true } : {}) })) || opts.model;
      return this.engine.chat({ ...opts, model });
    }
  }

  // Asks the user. need: a string, or { text, diff, plan, command, cwd } (plan = rows the user can tick one by one,
  // command = the exact command line). Resolves false, true or 'all'; when the card had rows, out.picked holds
  // the ids the user ticked (null = all of them).
  // need.together (1.5.42, together.js): every OK a job needs on one card. Resolves { allow, items }, where items
  // is null for Allow all / Deny all, else the steps the person ticked ([{ n, rows? }]).
  // need.planCard (1.5.78, plan.js): Bob's plan for a big job, with any OKs it needs as need.together. Resolves
  // { allow, items, note }: note is the change the person asked for in their own words (then allow is false).
  async approve(need, emit, signal, group, { hand = false, out = {}, id = crypto.randomUUID() } = {}) {
    const prev = this.state;
    const text = typeof need === 'string' ? need : need.text;
    this.setState('waiting', text);
    const card = { type: 'approval', id, text, diff: need.diff, allowAll: Boolean(group) };
    if (Array.isArray(need.plan)) card.plan = need.plan;
    if (need.command) { card.command = need.command; card.cwd = need.cwd || ''; if (need.where) card.where = String(need.where).slice(0, 120); if (need.mcp) card.mcp = need.mcp; if (need.button) card.button = String(need.button).slice(0, 30); }
    if (hand) card.hand = true;
    if (Array.isArray(need.together)) card.together = need.together.map(({ key, ...it }) => it);
    if (need.planCard) { card.planCard = need.planCard; card.allowAll = false; }
    if (need.newTool) { card.newTool = need.newTool; if (need.button) card.button = String(need.button).slice(0, 30); card.allowAll = false; } // 1.5.48 (selftools.js)
    emit(card);
    if (hand) this.handApprovals.add(id);
    let picked = null, steps = null, note = '';
    const allowed = await new Promise((resolve) => {
      const timer = setTimeout(() => done(false), APPROVAL_TIMEOUT_MS); // through done(), so the card leaves the list too
      const done = (v, rows, items, said) => { clearTimeout(timer); this.approvals.delete(id); this.handApprovals.delete(id); picked = rows ?? null; steps = items ?? null; note = typeof said === 'string' ? said.slice(0, 500) : ''; resolve(v); };
      this.approvals.set(id, done);
      signal.addEventListener('abort', () => done(false), { once: true });
    });
    if (Array.isArray(need.together) || need.planCard) {
      const ns = new Set((need.together || []).map((i) => i.n));
      const items = Array.isArray(steps) && ns.size ? steps.filter((p) => ns.has(Number(p?.n))).map((p) => ({ n: Number(p.n), rows: Array.isArray(p.rows) ? p.rows.map(String) : undefined })) : null;
      const said = need.planCard ? note.trim() : '';
      const allow = Boolean(allowed) && !said && !(items && !items.length && !need.planCard);
      emit({ type: 'approval-result', id, allowed: allow });
      this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
      return { allow, items: allow ? items : null, ...(said ? { note: said } : {}) };
    }
    if (Array.isArray(need.plan)) {
      const ok = new Set(need.plan.filter((r) => !r.blocked).map((r) => r.id));
      out.picked = Array.isArray(picked) ? picked.map(String).filter((x) => ok.has(x)) : null;
      if (allowed && out.picked && !out.picked.length) { emit({ type: 'approval-result', id, allowed: false }); this.log('approval', `nothing ticked: ${text}`); this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model); return false; }
    }
    emit({ type: 'approval-result', id, allowed: Boolean(allowed) });
    const rowsNote = Array.isArray(need.plan) && out.picked ? ` (${out.picked.length} of ${need.plan.length} rows ticked)` : '';
    this.log('approval', `${allowed === 'all' ? 'allowed (rest of job)' : allowed ? 'allowed' : 'denied'}: ${text}${need.command ? ` [${need.command}]` : ''}${allowed ? rowsNote : ''}`);
    this.setState(prev.state === 'waiting' ? 'thinking' : prev.state, '', prev.model);
    return allowed;
  }

  // rows: for a card with a plan, the ids of the rows the user ticked.
  // items: for a card with every OK on it (together.js), the steps the person ticked: [{ n, rows? }].
  // note: on a plan card (plan.js), the change the person asked for.
  answerApproval(id, allow, rows, items, note) {
    const done = this.approvals.get(id);
    if (!done) return false;
    done(allow === 'all' ? 'all' : Boolean(allow), Array.isArray(rows) ? rows.slice(0, 1000).map(String) : null, Array.isArray(items) ? items.slice(0, 100) : null, typeof note === 'string' ? note : '');
    return true;
  }

  // Stop everything: every Hand card that's waiting is answered No.
  denyHands() {
    let n = 0;
    for (const id of [...this.handApprovals]) { const done = this.approvals.get(id); if (done) { done(false); n++; } }
    this.handApprovals.clear();
    return n;
  }

  saveHands(next) {
    saveSettings(this.cfg, { hands: next });
    this.broadcast?.({ type: 'hands', settings: next });
  }

  // A session's context size, but never more than the model was made for.
  // longRun ("Let Bob work on repositories", self-work.js): want is a stretched size and is used as it is (up to the
  // most the brain stretches to), even with the Long memory switch off; it still has to fit this machine.
  async fitCtx(model, want, { longRun = false } = {}) {
    if (!model) return want || null;
    const max = await this.engine.maxCtx?.(model)?.catch?.(() => null) ?? null;
    // 1.5.87: a size picked for this brain (Settings > Brains, switch on) wins, for every copy on it: one load.
    // Long memory (YaRN, model-ctx.js): with the switch on, a stretched size picked for a brain that can take it.
    const stretch = await Promise.resolve(this.engine.stretchMax?.(model, longRun ? { evenOff: true } : undefined)).catch(() => null) ?? null;
    let pick = longRun && max && stretch && want > max ? Math.min(want, stretch) : pickedCtx(this.cfg, model, max, { stretch });
    // A stretched size that won't fit this machine (card plus RAM) isn't tried: the brain loads at what it was made for.
    if (pick && max && pick > max) {
      const r = await Promise.resolve(this.engine.roomFor?.(model, pick)).catch(() => null);
      if (r && r.fits === false) { this.log('model', `long memory: ${model} at ${pick} needs ~${r.needGB} GB, room ~${r.roomGB} GB, so it loads at ${max}`); pick = max; }
    }
    // Settings review: in Gaming the brain is on the processor beside the game, so a pick never makes it bigger there.
    want = pick && gaming(this.cfg) ? Math.min(pick, want || GAMING_CTX) : pick || want;
    if (!want) return null;
    const fit = max ? Math.min(pick && pick > max ? pick : max, want) : want;
    // 1.5.126: on built-in graphics, shorter still when the RAM says so (apuRoom above).
    const room = await apuRoom(this, model, fit);
    if (room.shortened) this.log('model', `shortened ${model}'s chat memory to ${room.ctx} to keep ${apuHoldbackGB(this.cfg)} GB for Windows (needs ~${room.needGB} GB, room ~${room.roomGB} GB)`);
    return room.ok ? room.ctx : fit;
  }

  get turn() { return this.turns.values().next().value || null; }

  // Stops one running job (by id), or everything running.
  stop(id) {
    let hit = false;
    for (const t of this.turns.values()) if (!id || t.turnId === id) { t.controller.abort(); hit = true; }
    return hit;
  }

  // Switch session: from the user's pick, or (1.5.41, "Let Bob pick the session") Bob's own: by 'bob' for a job, 'idle'
  // when he goes quiet. Brains from the old session are let go so the new set fits.
  async setSession(id, { by = 'you', why = '' } = {}) {
    if (!SESSIONS[id]) throw new Error('Unknown session.');
    const from = currentSession(this.cfg).id;
    // 1.5.41: picking another session by hand ends the 🎮 Gaming lock (Bob's own picks can't: see auto-session.js).
    if (by === 'you' && id !== 'light' && this.cfg.gamingLock === true) { saveSettings(this.cfg, { gamingLock: false }); this.unpark(); this.broadcast({ type: 'gaming-lock', on: false }); }
    this.cfg.session = id;
    this.suggested = null;
    this.lastActivity = Date.now(); // for /api/idle
    if (!this.turns.size) { await this.engine.unloadAll().catch(() => {}); await this.painter?.unload?.('session switch', { force: true }).catch?.(() => {}); }
    this.log('session', `now ${id}${by === 'you' ? '' : ` (Bob's pick${by === 'idle' ? ', gone quiet' : ''}${why ? `: ${why}` : ''})`}`);
    this.saveQueue(); // 1.5.23: the Gaming wait tags change with the session
    setTimeout(() => this.pump(), 0); // jobs that waited for Gaming to end can start
    if (holdsChatBrain(this.cfg)) this.wake('always on').catch(() => {});
    // By Bob for a job: the chat already has his "Switching to..." line. When he goes quiet: one line saying where he went.
    if (by === 'you' || by === 'lock') { try { saveSettings(this.cfg, { sessionBy: 'you' }); } catch {} } // who picked it, for the picker's label
    this.broadcast({ type: 'session', session: currentSession(this.cfg), by, pickedBy: this.cfg.sessionBy === 'bob' ? 'bob' : 'you', line: by === 'idle' ? switchLine(id, '', 'idle') : undefined });
    this.armIdleCheck();
    const aside = sleepySwitch(this.sleepy, from, id, cleanPersonality(this.cfg.personality));
    if (aside) this.broadcast({ type: 'aside', text: aside });
    return currentSession(this.cfg);
  }

  // 1.5.41: Bob changes session himself. Saved like a pick on the chat page; no job starts until the new session is set.
  async autoSwitch(id, by = 'bob', why = '') {
    if (currentSession(this.cfg).id === id) return currentSession(this.cfg);
    this.switching = true;
    try { saveSettings(this.cfg, { session: id, sessionBy: 'bob' }); return await this.setSession(id, { by, why }); }
    finally { this.switching = false; }
  }

  // 1.5.41 the 🎮 Gaming button on the chat page: Gaming, locked. Everything Bob has on the graphics card goes at once
  // (brains, the picture engine), running jobs are put aside in Tasks (not cancelled) and the queue waits. Bob doesn't
  // leave Gaming by himself while it's on. Pressing it again (or picking another session) goes back to Normal, and the
  // jobs carry on from where they stopped, like after a restart.
  async setGamingLock(on) {
    on = on === true;
    saveSettings(this.cfg, { gamingLock: on });
    if (on) {
      for (const j of this.queue) if (j.state === 'working') j.parked = true;
      this.stop();
      this.endMore?.(null, 'gaming');
      for (let i = 0; i < 80 && this.turns.size; i++) await new Promise((r) => setTimeout(r, 100)); // jobs let go (8 s at most)
      saveSettings(this.cfg, { session: 'light' });
      await this.setSession('light', { by: 'lock' });
      await this.engine.unloadAll?.().catch?.(() => {});
      await this.painter?.unload?.('gaming button', { force: true })?.catch?.(() => {});
      this.log('session', 'Gaming locked by the 🎮 button; the graphics card is cleared');
    } else {
      this.unpark();
      saveSettings(this.cfg, { session: 'normal' });
      await this.setSession('normal', { by: 'lock' });
    }
    this.broadcast({ type: 'gaming-lock', on });
    return { on, session: currentSession(this.cfg) };
  }
  unpark() { let n = 0; for (const j of this.queue) if (j.parked) { j.parked = undefined; n++; } if (n) { this.saveQueue(); setTimeout(() => this.pump(), 0); } }

  // A job put aside by the 🎮 button: back in line, carrying on from its last finished step (as after a restart). A
  // cut-off step that may be half done (typing in an app, moving files, a command) waits in Tasks for Carry on instead.
  parkJob(job, emit) {
    const plan = carryOnPlan(job);
    job.before = finishedSteps(job); job.cutStep = plan.cut; job.carryOn = plan.note;
    if (plan.mode === 'wait') { job.parked = undefined; job.state = 'interrupted'; job.error = interruptedNote(job); }
    else Object.assign(job, { state: 'waiting', pickUp: true, at: Date.now(), error: undefined });
    emit({ type: 'token', text: '\n\n*(Put aside for Gaming. It waits in Tasks and carries on when Gaming is off.)*' });
  }

  // 1.5.41: a job is waiting for Gaming to end. With "Let Bob pick the session" on, Bob looks at the graphics card once
  // a minute: once nothing else is using it (the game is closed), he goes back to Normal and the job runs. No question.
  gamingProbe() {
    if (!autoSessionOn(this.cfg) || this.cfg.gamingLock === true || this.probeTimer || this.switching) return;
    this.probeTimer = setTimeout(async () => {
      try {
        if (!this.queue.some((j) => j.state === 'waiting' && waitsForGaming(this.cfg, j))) return;
        const busy = cardBusy(await (this.readCard || readCard)().catch(() => null));
        if (busy === false && !this.turns.size && waitsForGaming(this.cfg, this.queue.find((j) => j.state === 'waiting' && waitsForGaming(this.cfg, j)))) {
          this.probeTimer = null;
          await this.autoSwitch('normal', 'bob', 'now that the graphics card is free');
          this.broadcast({ type: 'announce', text: switchLine('normal', 'now that the graphics card is free') });
          return this.pump();
        }
      } catch {}
      this.probeTimer = null;
      this.gamingProbe(); // still busy (or unreadable): look again in a minute
    }, this.lastProbeAt ? 60_000 : 2_000);
    this.lastProbeAt = Date.now();
    this.probeTimer.unref?.();
  }

  // While Bob is quiet, every 2 minutes: Normal when the graphics card is free, Gaming while something else is using it
  // (a game). One nvidia-smi reading, about 50 ms; nothing at all while a job runs or with the setting off.
  armIdleCheck() {
    clearTimeout(this.idleTimer);
    if (!autoSessionOn(this.cfg)) return;
    this.idleTimer = setTimeout(() => this.idleCheck().catch(() => {}), IDLE_CHECK_MS(this.cfg));
    this.idleTimer.unref?.();
  }
  async idleCheck() {
    if (this.turns.size || this.waking || this.switching || this.morePictures || this.queue.some((j) => j.state === 'working' || (j.state === 'waiting' && !waitsForGaming(this.cfg, j)))) return this.armIdleCheck();
    if (Date.now() - (this.lastActivity || 0) < IDLE_CHECK_MS(this.cfg) - 1000) return this.armIdleCheck();
    const busy = cardBusy(await (this.readCard || readCard)().catch(() => null));
    const want = idleSession(this.cfg, busy);
    if (want && !this.turns.size) await this.autoSwitch(want, 'idle');
    else this.armIdleCheck();
  }

  // GPU-only models leave for the painter; in an Art session the chat brain on the processor stays.
  async clearGpu() {
    // 1.5.41: a quick reply running beside a job on the processor brain keeps going too.
    // 1.5.51: a quick brain beside the job on the card moves to the processor; the reply says why it slows down.
    const side = this.turns?.get?.(SIDE_LANE);
    if (side?.beside && this.engine.beside?.currentCard === 'whole') this.broadcast({ type: 'announce', text: MOVE_TO_CPU, turnId: side.turnId, sessionId: side.sessionId });
    if ((currentSession(this.cfg).cpu || this.turns?.has(SIDE_LANE)) && this.engine.unloadGpu) return this.engine.unloadGpu();
    return this.engine.unloadAll();
  }

  // Every tool call goes through here. Quarantine (quarantine.js, opt-in) watches before and after; it's a few counters.
  async runTool(name, args, ctx) {
    const tool = this.tools[name];
    if (typeof args === 'string') { try { args = JSON.parse(args); } catch { args = {}; } }
    args = args || {};
    const held = await qGate(this, name, args, ctx, tool);
    if (held) { qAfter(this, name, args, held.text, ctx, tool); return held; }
    const res = await this.runToolNow(name, args, ctx, tool);
    // 1.5.95: a file type named in the ask is saved before the tool's answer goes back, so Bob can say so.
    if (ctx?.saves?.length) {
      await Promise.allSettled(ctx.saves.splice(0));
      if (ctx.savedAs?.length && res && typeof res.text === 'string') res.text += ` Also saved as ${ctx.savedAs.splice(0).join(', ')}, as asked (the original is kept too).`;
    }
    qAfter(this, name, args, res.text, ctx, tool);
    recordCall(this.cfg, name === 'use_my_tool' && args.name ? `use_my_tool:${args.name}` : name, args, res?.text, ctx); // "Let Bob learn from his tools" (tool-learn.js)
    return res;
  }

  // 1.5.95: the user named a file type ("a song as an mp3"): keep what was just made in that type as well.
  autoSaveAs(ev, ctx) {
    const kind = ev.type, to = ctx.wantType;
    if (!SAVE_AS[kind]?.includes(to) || path.extname(ev.file).slice(1).toLowerCase() === to) return;
    ctx.saves.push(saveAs(this.cfg, { name: path.basename(ev.file), format: to }, { signal: ctx.signal, ...(this.saveAsOpts || {}) }).then(async (r) => {
      if (r.need === 'ffmpeg') { await this.offerSetup('ffmpeg', ctx).catch(() => ''); return; }
      try { this.made.add(r.file, { tool: 'save_as', chat: ctx.sessionId || '' }); } catch {}
      ctx.emit({ type: 'made', items: [{ kind: r.kind, url: r.url, name: r.name, path: r.file }] });
      ctx.savedAs.push(r.name);
    }).catch((e) => { ctx.emit({ type: 'announce', text: `Couldn't save it as ${to.toUpperCase()}: ${e.message}` }); }));
  }

  async runToolNow(name, args, ctx, tool) {
    if (!tool) return { text: `Error: there is no tool called ${name}.` };
    // 1.5.72: a job from another of your Bobs only thinks, searches and makes pictures, clips, music and sounds here.
    if (ctx?.job?.guest && !GUEST_TOOLS.has(name)) return { text: `Not for this job: it came from ${ctx.job.guest.from}, another Bob, so here I can only think, search the web and make pictures, clips, music and sounds. Say what's left for ${ctx.job.guest.from} to do himself.` };
    // Bob on Discord (src/discord.js): only the job types the owner ticked, and never a reference picture (nothing the
    // owner made can be edited, copied or described there).
    if (ctx?.job?.guest?.public) {
      if (!GUEST_TOOLS.has(name) || (ctx.job.guest.tools && !ctx.job.guest.tools.includes(name))) return { text: `Not for this job: that's switched off for ${ctx.job.guest.from}. Say so in one line.` };
      if (args && typeof args === 'object') { args = { ...args }; delete args.reference; if (args.mode && args.mode !== 'new') delete args.mode; }
    }
    if (!this.usable(name)) {
      if (WEB_TOOLS.includes(name) && !webOn(this.cfg)) return { text: ctx?.emit ? await this.offerSetup('web', ctx) : WEB_OFF }; // 1.5.91: the card, not a dead end
      const hand = Object.entries(HANDS).find(([, h]) => h.tools.includes(name))?.[0];
      return { text: hand ? handOffWhy(this.cfg, hand) : `Error: ${name} can't be used on this replicant matrix right now.` };
    }
    // 1.5.34 House style: what the call left out comes from the defaults set on Equip Bob, and the chat says so.
    const house = applyHouseStyle(name, args, this.cfg.houseStyle);
    args = house.args;
    ctx.emit({ type: 'tool', name, summary: tool.summary ? tool.summary(args) : name });
    if (house.used.length) ctx.emit({ type: 'house', text: usedLine(house.used), group: houseGroupOfTool(name) });
    try {
      ctx.picked = null;
      if (tool.check) {
        const need = await tool.check(args, ctx);
        const group = typeof tool.approvalGroup === 'function' ? tool.approvalGroup(args) : tool.approvalGroup;
        // "Let Bob work without asking" (Settings, Hands; off by default): no card, but the hard limits in check()
        // still apply, every action still goes in the logbook and the chat, and ✋ Hands turns it off at once.
        // Tools marked alwaysAsk (cloud helpers: they cost money) still show their card.
        if (need && !tool.alwaysAsk && freeOn(this.cfg)) {
          const text = typeof need === 'string' ? need : need.text;
          this.log('approval', `done without asking: ${text}${need.command ? ` [${need.command}]` : ''}`);
          ctx.emit({ type: 'auto-approved', text, command: need.command || '', rows: Array.isArray(need.plan) ? need.plan.filter((r) => !r.blocked).length : null });
        } else if (need && !(group && ctx.allowAll.has(group))) {
          // 1.5.42: already answered on the card with all of this job's OKs (together.js)?
          const earlier = (ctx.preOk || ctx.preNo) ? takeEarlier(ctx, name, args, need) : null;
          if (earlier?.no) { ctx.ledger?.action(name, args, true, 'declined'); this.log('approval', `denied on the combined card: ${typeof need === 'string' ? need : need.text}`); return { text: 'The user said no to this on the card. Do not try again; say it is fine and ask what to do instead.' }; }
          if (earlier?.ok) {
            this.log('approval', `allowed on the combined card: ${typeof need === 'string' ? need : need.text}${need.command ? ` [${need.command}]` : ''}`);
            ctx.emit({ type: 'allowed-earlier', text: typeof need === 'string' ? need : need.text });
            if (Array.isArray(need.plan)) ctx.picked = earlier.rows;
          } else {
          const hand = Boolean(need && typeof need === 'object' && (need.plan || need.command || need.newTool));
          const out = {};
          // Not on the card (or changed since): its own card, saying so, so the person isn't surprised by it.
          const unlisted = ctx.preOk ? (earlier?.changed ? ' (This changed since the list you saw, so Bob is asking again.)' : ' (This wasn\'t on the list you saw.)') : '';
          const answer = await this.approve(unlisted ? (typeof need === 'string' ? need + unlisted : { ...need, text: need.text + unlisted }) : need, ctx.emit, ctx.signal, group, { hand, out });
          if (!answer) { ctx.ledger?.action(name, args, true, 'declined'); return { text: 'The user said no. Do not try again; say it is fine and ask what to do instead.' }; }
          if (answer === 'all' && group) ctx.allowAll.add(group);
          if (Array.isArray(need.plan)) ctx.picked = out.picked ?? null;
          }
        }
      }
      const startedAt = Date.now();
      ctx.currentTool = name;
      ctx.made = null;
      ctx.ledger?.begin?.(name, args); // 1.5.38: so a restart knows this step was cut off
      let text;
      ctx.offeredNow = false;
      try { text = String(await tool.run(args, ctx)); }
      catch (e) { if (ctx.signal.aborted) throw e; text = `Error: ${e.message}`; }
      // The system checks it really happened (verify.js): a missing or broken output, or an action that didn't take,
      // gets one more go before Bob is told it failed. Approvals aren't asked twice.
      if (ctx.ledger) ctx.ledger.toolStart = startedAt;
      // 1.5.104: the tool put a Set it up card under the chat instead of doing the job. That's an answer, not a
      // failure: no second try (it made a second card) and no "didn't work" note.
      let v = ctx.offeredNow ? { ok: true } : await this.checkTool(name, args, text, ctx);
      if (v.retry && !ctx.signal.aborted) {
        this.log('handoff', `${name} didn't take (${v.why || 'no proof'}); trying it once more`);
        ctx.ledger?.step('retry', { what: name, why: v.why || '' }).done();
        ctx.ledger?.action(name, args, false, text, startedAt, v);
        if (ctx.ledger) ctx.ledger.toolStart = Date.now();
        try { text = String(await tool.run(args, ctx)); }
        catch (e) { if (ctx.signal.aborted) throw e; text = `Error: ${e.message}`; }
        v = await this.checkTool(name, args, text, ctx);
        if (v.retry) v = { ...v, ok: false, text: v.text || `Error: ${name} was tried twice and still didn't take (${v.why || 'no proof it worked'}).` };
      }
      if (v.text) text = v.text;
      for (const o of v.show || []) if (o?.file) await this.deliver(ctx, o.type || 'image', o.file);
      ctx.currentTool = null;
      const ok = v.ok !== false && !/^Error:/.test(text);
      ctx.ledger?.action(name, args, ok || Boolean(v.declined), text, startedAt, v);
      this.log(ok ? 'tool' : 'error', ok ? (tool.summary ? tool.summary(args) : name) : `${name}: ${text.replace(/^Error:\s*/, '')}`);
      // Files the tool saved or made (write_file, spreadsheets, Hands copies and zips...): on the Made by Bob
      // list, and a card with a preview in the chat that opens in the side panel.
      const paths = ok ? [...new Set([...(ctx.made || []), ...madePaths(name, text)])].slice(0, 6) : [];
      ctx.made = null;
      if (paths.length) {
        const items = paths.map((p) => { try { return this.made.add(p, { tool: name, chat: ctx.sessionId }); } catch { return null; } }).filter(Boolean);
        if (items.length) ctx.emit({ type: 'made', items });
      }
      return { text, endsTurn: tool.endsTurn };
    } catch (e) {
      ctx.currentTool = null;
      if (ctx.signal.aborted) throw e;
      this.log('error', `${name}: ${e.message}`);
      return { text: `Error: ${e.message}` };
    }
  }

  // verify.js's check of one tool run; a check that itself breaks never breaks the turn.
  async checkTool(name, args, text, ctx) {
    try { return (await afterTool(name, args, text, ctx)) || { ok: true }; } catch (e) { this.log('handoff', `check of ${name} broke: ${e.message}`); return { ok: true }; }
  }

  // The end of a turn: the user asked for something (a picture, to see one, an app action). If it didn't happen,
  // Bob gets one more go (again = true) with the tools it needs; if it still didn't, the user is told plainly.
  // Returns true when the turn should go round once more.
  checkTurn(ctx, reply, again) {
    let v = null;
    try { v = afterTurn(ctx, reply?.content || ''); } catch (e) { this.log('handoff', `end-of-turn check broke: ${e.message}`); }
    if (!v) return false;
    if (v.strike) { try { noteStrike(this, ctx, v.strike === 'claim' ? 'claims' : v.strike, v.note || v.nudge || ''); } catch {} }
    if (v.nudge && again && !ctx.ledger.nudged) {
      ctx.ledger.nudged++;
      // A claim with nothing behind it is corrected at once, as well as the second go.
      if (v.note) { ctx.emit({ type: 'correction', text: v.note }); if (reply) reply.correction = reply.correction ? `${reply.correction} ${v.note}` : v.note; }
      for (const g of v.groups || []) if (groupsFor(this)[g]) ctx.loaded.add(g);
      ctx.msgs.push({ role: 'system', content: v.nudge, hidden: true });
      ctx.ledger.step('retry', { what: 'turn', why: v.nudge }).done();
      this.log('handoff', `asked for ${ctx.ledger.expect?.kind || 'something'} and it didn't happen; one more go`);
      ctx.emit({ type: 'token', text: '\n\n' });
      return true;
    }
    const note = v.note || ''; // a nudge with no second go left: the caller's own note (or the hat's answer) stands
    if (note) {
      ctx.emit({ type: 'correction', text: note });
      if (reply) reply.correction = reply.correction ? `${reply.correction} ${note}` : note;
      ctx.ledger.step('note', { what: note }).done();
      ctx.ledger.noted = true;
      this.log('handoff', note);
    }
    return false;
  }

  // Shows a file Bob made, once it's checked to be real. Returns false (and says why) when it isn't.
  async deliver(ctx, type, file) {
    const v = await verifyOutput(file, type).catch((e) => ({ ok: false, why: e.message }));
    if (!v.ok) { this.log('handoff', `${path.basename(file)} wasn't shown: ${v.why}`); return false; }
    const name = path.basename(file);
    // Only files in Bob's pictures folder have a link the chat can show.
    if (!outputDirs(this.cfg).some((d) => path.resolve(d) === path.resolve(path.dirname(file)))) return false;
    ctx.emit({ type, url: `/images/${encodeURIComponent(name)}`, file });
    return true;
  }

  // A personal backstory (inn\bob\backstory.md) replaces the generic one; it isn't part of the shared install.
  // Things about the user Bob should always know (their projects, how they like to work). Kept on this PC
  // only: settings "aboutUser" and/or inn\bob\about-me.md. The shipped prompts stay generic.
  about() {
    let file = '';
    try { file = fs.readFileSync(path.join(this.cfg.dataDir, 'about-me.md'), 'utf8').slice(0, 4000).trim(); } catch {}
    return [String(this.cfg.aboutUser || '').trim(), file].filter(Boolean).join('\n');
  }

  backstory() {
    try { return fs.readFileSync(path.join(this.cfg.dataDir, 'backstory.md'), 'utf8').slice(0, 4000); } catch { return ''; }
  }

  // The start of every front-desk chat: the system prompt and core tools, as a turn with no tool groups sends them.
  startPrompt() {
    const loaded = new Set();
    const sys = { role: 'system', content: this.withLimits(systemPrompt({ now: this.now(), memory: this.memory(), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, this.cfg.userName || 'the user') }), loaded) };
    return { messages: [sys], tools: this.frontDeskTools(loaded) };
  }

  // Tell Bob plainly what this PC can't do yet, so he offers the prompt and points to the cellar instead.
  // 1.5.102: hat = a copy of Bob (workbench, ledger...). A copy has only its own few tools (wearHat), so it isn't told
  // about tools it doesn't have: no offer_setup, ask_cloud or picture lines (the painter copy has its own).
  withLimits(prompt, loaded = null, hat = null) {
    const who = this.cfg.userName || 'the user';
    const can = capabilities(this.cfg);
    const missing = [!can.pictures && 'make pictures', !can.video && 'make video clips', !can.music && 'make music', !can.sfx && 'make sound effects', !can.hearing && 'hear voice input'].filter(Boolean);
    const helpers = cloudHelpers(this.cfg);
    const desk = !hat;
    // The Hands line only when a Hand group is added (or for hats and "all tools at once"); otherwise use_tools lists them.
    const handsLine = !loaded || allToolsOn(this.cfg) || Object.keys(HANDS).some((h) => loaded.has(h));
    if (handsLine) prompt += handsPrompt(this.cfg, { hat });
    if (loaded) prompt += realPcPrompt(this.cfg) + toolboxPrompt(this, loaded);
    prompt += webPrompt(this.cfg, { hat }) + linkPrompt(this.cfg);
    if (loaded) prompt += autoSessionPrompt(this.cfg); // front desk only: hats don't change the session
    if (loaded) prompt += planPrompt(this.cfg); // 1.5.78: front desk only, and nothing while the setting is off
    prompt += houseStylePrompt(this.cfg.houseStyle, who);
    if (this.cfg.defaultProject && this.cfg.projects?.[this.cfg.defaultProject]) prompt += `\n\n${this.cfg.userName || 'The user'}'s main project is ${this.cfg.defaultProject}. When they say "my project" without a name, it's that one.`;
    // "Show me a picture of X" once got no answer at all (2026-11-02): say plainly that make_image is the way.
    // 1.5.102: this is the one place the front desk is told about pictures and clips (it was in FRONT_DESK too).
    if (desk && (!loaded || allToolsOn(this.cfg) || loaded.has('pictures')) && this.usable('make_image')) prompt += `\n\nWhen ${who} asks to see, show, make, draw or paint a picture, call make_image yourself straight away, in the same reply, with a good prompt; for a short clip, make_video (slow, minutes). Then tell ${who} the chat brain has to step out while the painter works. To change a picture (one attached, or one you made: reference "last"), call make_image with it as the reference and a short instruction saying only what to change, like "Replace the hard hat with a silver tiara", not a description of a whole new picture.`;
    if (desk && helpers.length) prompt += `\n\nCloud copies of you that ${who} switched on (use ask_cloud only for jobs too big for you, or when asked; each use is approved and costs money): ${helpers.map((h) => `${h.id} = ${copyName(this.cfg, 'cloud:' + h.id, 'cloud helper')}, running on ${h.name} ${h.model}`).join('; ')}.`;
    const rental = desk && this.rentals?.current();
    if (rental) prompt += `\n\nA rented brain is in your Rented brain slot (${rental.name}). It costs ${who} money, so never use it on your own: when a job is too big for you here (a very long chat or file, or a model that isn't here), or when ${who} asks for it, call hire_brain once; the app shows a card and ${who} decides. Then stop: don't do the job here as well.`;
    const pictureWork = desk || hat === 'painter';
    const shelf = pictureWork ? this.refs.describe() : '';
    if (shelf) prompt += `\n\n${shelf}`;
    // Web search, and Hands when the Hands line is in, already have their own line saying so (webPrompt, handsPrompt): not listed again here.
    const offList = this.switchesOff().filter((k) => k.key !== 'web' && !(handsLine && /^hand:/.test(k.key)));
    // "Let Bob use Hands, Files; Let Bob use Hands, Run programs...": the Hands are named once, then each one.
    const handNames = offList.filter((k) => /^hand:/.test(k.key) && /^Let Bob use Hands, /.test(k.name)).map((k) => k.name.replace(/^Let Bob use Hands, /, ''));
    const offNames = [...offList.filter((k) => !(/^hand:/.test(k.key) && /^Let Bob use Hands, /.test(k.name))).map((k) => k.name), ...(handNames.length ? [`Let Bob use Hands (${handNames.join(', ')})`] : [])];
    if (desk && this.usable('offer_setup') && offList.length) prompt += `\n\nWhen a job needs something else that is switched off (${offNames.join('; ')}), call offer_setup with that setting: the app shows a card to switch it on, and the job carries on after the click. Say in one line what it does; never just refuse.`;
    if (pictureWork && can.pictures && !can.edits) prompt += '\n\nYour picture model can start from a reference picture but can\'t hold a character\'s exact look across new poses. If keeping a look matters, say a picture-edit model in Get models (left menu, Pictures & video) does that better.';
    // 1.5.91: never "I can't": the tool itself shows a Set it up card, so Bob calls it as if it were there.
    const notHere = pictureWork ? missing : [];
    return notHere.length ? `${prompt}\n\nNot set up on this replicant matrix yet: ${notHere.join(', ')}. When ${who} asks for one of these, still call its tool (make_image, make_video, make_music, make_sound) with a good prompt: the app then shows a Set it up card with the size, and carries on with the job by itself once it's set up. Never call it an error and don't send them to menus.${desk && notHere.includes('hear voice input') ? ' For hearing, call offer_setup with "hearing".' : ''}` : prompt;
  }

  // Tools this PC can't use right now (no picture model, Hand switched off, no cloud helper...).
  offTools() {
    let can = {};
    try { can = capabilities(this.cfg); } catch {}
    // 1.5.91: make_image, make_video, make_music and make_sound stay listed when they aren't set up: calling one shows the Set it up card.
    return new Set([!can.workshop && 'workshop_list', !can.workshop && 'workshop_run', !this.offerNeeded() && 'offer_setup', !cloudHelpers(this.cfg).length && 'ask_cloud', !this.rentals?.current() && 'hire_brain', freeOn(this.cfg) && 'ask_together', !planOn(this.cfg) && 'show_plan', ...(webOn(this.cfg) ? [] : WEB_TOOLS), !autoSessionOn(this.cfg) && 'pick_session', !editOwnOn(this.cfg) && 'edit_my_message', !notesOn(this.cfg) && 'take_note', !docToolsOn(this.cfg) && 'find_in_documents', !sandboxOn(this.cfg) && 'run_in_sandbox', ...(howtosOn(this.cfg) ? [] : ['save_howto', 'my_howtos']), !(selfWorkOn(this.cfg) && readyRepos(this.cfg).length) && 'work_on_repo', ...toolsOff(this.cfg)].filter(Boolean));
  }
  usable(name, off = this.offTools()) { return Boolean(this.tools[name]) && !off.has(name); }
  // 1.5.41: whether OKs are asked on cards right now (so a job's OKs can go on one card). Not with "work without asking".
  together() { return !freeOn(this.cfg); }

  toolSchemas(names) {
    const who = this.cfg.userName || 'the user';
    const off = this.offTools();
    const learned = toolLearnOn(this.cfg) ? loadLearning(this.cfg) : null; // tool notes and the scorecard (tool-learn.js)
    return names.filter((n) => n !== 'use_tools' && this.usable(n, off)).map((n) => {
      const s = tidySchema(JSON.parse(JSON.stringify(this.tools[n].schema).replaceAll('{{USER}}', who).replaceAll('{{HOME}}', JSON.stringify(os.homedir()).slice(1, -1))));
      if (learned && s.function) s.function.description += learnedLine(this.cfg, n, learned);
      return s;
    });
  }

  // The front desk's tools for this step: the core, plus the groups added so far this turn (toolbox.js).
  // With "Give Bob all his tools at once" on, every usable tool, the way it was before.
  frontDeskTools(loaded) {
    if (allToolsOn(this.cfg)) return this.toolSchemas(Object.keys(this.tools));
    const groups = groupsFor(this);
    const names = [...CORE, ...[...loaded].flatMap((g) => groups[g]?.tools || [])];
    // 1.5.41: ask_together comes along once a group with tools that ask for an OK is added.
    if (names.some((n) => this.tools[n]?.check && this.usable(n))) names.push('ask_together');
    if (planOn(this.cfg)) names.push('show_plan'); // 1.5.78: always there while the setting is on (plan.js)
    const list = this.toolSchemas([...new Set(names)]);
    const use = fillUseTools(this.tools.use_tools.schema, groups, loaded);
    if (use) list.push(tidySchema(use));
    return list;
  }

  // Which groups start loaded this turn: the ones the user's words point at, plus ones this chat used lately.
  startGroups(sessionId, text) {
    const loaded = new Set(guessGroups(this, text));
    const sticky = this.stickyGroups.get(sessionId);
    if (sticky) for (const [g, left] of sticky) { if (left > 0) loaded.add(g); }
    return loaded;
  }

  // After a turn: groups used this turn stay for the next few messages; the rest count down.
  keepGroups(sessionId, used) {
    if (!sessionId) return;
    const sticky = this.stickyGroups.get(sessionId) || new Map();
    for (const [g, left] of sticky) { if (left <= 1) sticky.delete(g); else sticky.set(g, left - 1); }
    for (const g of used) sticky.set(g, STICKY_TURNS);
    this.stickyGroups.set(sessionId, sticky);
    if (this.stickyGroups.size > 50) this.stickyGroups.delete(this.stickyGroups.keys().next().value);
  }

  // ---- The queue: every message is its own job, run in the order sent. Nothing is dropped or cut off. ----
  // One job runs at a time (they share one graphics card); the rest wait in inn\bob\queue.json,
  // so they survive Bob being closed. Stop ends only the job that's running; a waiting job can be cancelled.
  get queueFile() { return path.join(this.cfg.dataDir, 'queue.json'); }

  loadQueue() {
    let q = [];
    try { q = JSON.parse(fs.readFileSync(this.queueFile, 'utf8')); } catch {}
    // A job that was running when Bob closed may have half-finished: don't redo it blindly. Its ledger says what it did.
    // 1.5.38: with "Pick up where Bob left off after a restart" on (off by default), it carries on from the last finished
    // step: finished steps aren't done again, and the step that was cut off is done again from the start. A cut-off
    // step that can be left half done (typing into an app, moving files, a command...) waits in Tasks for Carry on.
    // Off, every cut-off job waits in Tasks; Carry on (the Tasks button) picks up the same way.
    for (const j of q) if (j.guest && (j.state === 'working' || j.state === 'waiting')) { j.state = 'cancelled'; j.error = 'Bob was closed; the other Bob runs it again.'; } // 1.5.72
    for (const j of q) if (j.away && j.state !== 'working') j.away = undefined;
    for (const j of q) if (j.state === 'working') {
      const plan = carryOnPlan(j);
      j.before = finishedSteps(j); j.cutStep = plan.cut; j.carryOn = plan.note;
      const tries = Number(j.resumed) || 0; // was a true/false flag before 1.5.38
      if (this.cfg?.resumeJobs === true && plan.mode !== 'wait' && tries < MAX_AUTO_RESUMES) {
        Object.assign(j, { state: 'waiting', resumed: tries + 1, pickUp: true, steps: [], at: Date.now(), error: undefined });
      } else {
        j.state = 'interrupted'; j.error = interruptedNote(j);
        if (this.cfg?.resumeJobs === true && plan.mode !== 'wait') j.error = `Bob was closed partway through this ${Math.max(2, tries)} times, so he stopped picking it up on his own. Carry on picks up from where it stopped.`;
      }
    }
    return q.filter((j) => j && j.id && j.text);
  }

  saveQueue() {
    // The list's order is the order jobs run in (the user can drag them). Finished jobs stay for a week
    // (at most 200) so the Tasks panel can show what's been completed.
    const keep = Date.now() - 7 * 864e5;
    const finished = this.queue.filter((j) => !(j.state === 'waiting' || j.state === 'working'));
    const drop = new Set(finished.filter((j) => (j.doneAt || j.at) < keep).map((j) => j.id));
    for (const j of finished.slice(0, Math.max(0, finished.length - 200))) drop.add(j.id);
    this.queue = this.queue.filter((j) => !drop.has(j.id));
    try { writeJsonAtomic(this.queueFile, this.queue); } catch {}
    this.broadcast({ type: 'queue', jobs: this.queueView() });
  }

  queueView() {
    return this.queue.map(({ id, sessionId, text, state, at, error, refs, kind, startedAt, doneAt, steps, effort, after, pickUp, away, guest, rent, rentOk, sentTo }) => {
      const out = (steps || []).find((x) => x.state === 'in progress');
      // Plain status for the Tasks panel: Queued, In progress, Delegated (to which copy), Completed...
      const awayNow = state === 'working' && away?.name; // 1.5.72: with another of your Bobs
      // 1.5.196 sentTo: a finished job sent whole to another Bob keeps who ran it (Tailscale test: delegatedTo was null).
      const status = state === 'waiting' ? 'queued' : state === 'working' ? (out || awayNow ? 'delegated' : rent && rentOk ? 'rented' : 'in progress') : state === 'done' ? 'completed' : state; // 1.5.127 rented
      return { id, sessionId, kind, text: (guest ? `From ${guest.from}: ` : '') + text.slice(0, 140), state, status, at, startedAt, doneAt, error, pics: (refs || []).length,
        delegatedTo: awayNow ? { hat: 'away', label: 'another of your Bobs', copy: away.name, sent: true } : out ? { hat: out.hat, label: out.label, copy: out.copy } : sentTo && state !== 'waiting' && state !== 'working' ? { hat: 'away', label: 'another of your Bobs', copy: sentTo, sent: true } : null, gaming: state === 'waiting' && !away && waitsForGaming(this.cfg, { kind, effort }) ? { tag: GAMING_TAG, hint: GAMING_HINT } : undefined, steps: (steps || []).slice(-8), effort: effort || 'low',
        waitsFor: state === 'waiting' && after ? after.name : undefined, pickUp: state === 'waiting' && pickUp ? true : undefined };
    });
  }

  // Drag and drop: move a waiting job in front of another waiting job (or to the end of the line).
  // The running job stays where it is.
  moveJob(id, before) {
    const from = this.queue.findIndex((j) => j.id === id && j.state === 'waiting');
    if (from < 0 || id === before) return false;
    const [job] = this.queue.splice(from, 1);
    let at = before ? this.queue.findIndex((j) => j.id === before && j.state === 'waiting') : -1;
    if (at < 0) { at = this.queue.length; } // to the back of the line
    this.queue.splice(at, 0, job);
    this.log('queue', `moved: ${job.text.slice(0, 60)}`);
    this.saveQueue();
    return true;
  }

  // Take a finished job off the list, or clear every completed one.
  removeJob(id) {
    const n = this.queue.length;
    this.queue = this.queue.filter((j) => !(j.id === id && !['waiting', 'working'].includes(j.state)));
    if (n === this.queue.length) return false;
    this.saveQueue();
    return true;
  }

  clearCompleted() {
    this.queue = this.queue.filter((j) => !['done', 'cancelled'].includes(j.state));
    this.saveQueue();
    return true;
  }

  // A rough label so the list says what each job is about.
  static guessKind(text, hasPics = false) {
    const t = text.toLowerCase();
    // A question about a picture the user attached is a chat, not a painting job.
    if ((hasPics || /\b(this|the|that|attached|my) (picture|image|photo|pic|screenshot)\b/.test(t)) && (/\?\s*$/.test(t) || /^(what|who|where|which|how|why|is|are|can|does|do|describe|tell me)\b/.test(t))) return 'chat';
    if (/\b(video|clip|film|animate)\b/.test(t)) return 'video';
    if (/\b(paint|draw|picture|image|illustrat|render)\b/.test(t)) return 'picture';
    if (/\b(research|look up|find out|search|sources)\b/.test(t)) return 'research';
    if (/\b(code|bug|function|compile|script)\b/.test(t)) return 'code';
    if (/\b(spreadsheet|csv|table|data entry)\b/.test(t)) return 'data';
    return 'chat';
  }

  enqueue(sessionId, text, attach = [], effort = 'low', extra = {}) {
    this.lastActivity = Date.now();
    // 1.5.97: "ok" while a job only waits for the graphics card (no card open) gets a plain answer at once, instead of
    // queueing behind the wait it was meant to answer.
    // 1.5.104: also while a chat of this session already waits behind a picture, clip, song or sound.
    const queuedHere = this.state.state === 'painting' && this.queue.some((j) => j.state === 'waiting' && j.sessionId === sessionId && j.queuedLine);
    if (!extra.guest && !(attach || []).length && isBareOk(text) && !this.approvals.size && (this.gate?.waitingNow > 0 || queuedHere)) {
      const answer = this.gate?.waitingNow > 0 ? NOTHING_TO_OK : NOTHING_TO_OK_BUSY;
      setTimeout(() => this.broadcast({ type: 'busy-note', sessionId, text: answer }), 0);
      return { jobId: null, turnId: null, ahead: 0, answered: answer };
    }
    this.housekeeper?.pause(); // anything the housekeeper was asking the brain gives way at once
    this.endMore(null, 'new job'); // a new message answers "Make another picture?"; the job loads what it needs
    const job = { id: crypto.randomUUID(), sessionId, text, refs: [].concat(attach || []).slice(0, 4), state: 'waiting', at: Date.now(), kind: extra.kind || Brain.guessKind(text, [].concat(attach || []).length > 0), effort: cleanEffort(effort), ...(extra.guest ? { guest: extra.guest } : {}), ...(extra.rent ? { rent: true } : {}) }; // 1.5.127 rent: the 🏗 switch on the chat page
    this.queue.push(job);
    this.saveQueue();
    this.log('queue', `${job.kind}: ${text}`);
    const ahead = this.queue.filter((j) => j.state === 'waiting' && j.id !== job.id).length + this.turns.size;
    // 1.5.37: a message sent while Bob is making a picture, song or clip waits for the card. Say so straight away
    // (a plain line, no brain needed), so a long job never looks like Bob has stopped answering.
    const busy = this.busyLine(job);
    if (busy) { job.queuedLine = true; job.queuedText = busy; setTimeout(() => this.broadcast({ type: 'waiting-line', sessionId, jobId: job.id, id: `queued-${job.id}`, text: busy }), 0); }
    queueMicrotask(() => this.pump());
    const tip = autoSessionOn(this.cfg) ? null : suggestSession(this.cfg, this.queue); // 1.5.41: Bob picks, so no tips
    if (tip && this.suggested !== tip.id) { this.suggested = tip.id; this.broadcast({ type: 'suggest', ...tip }); }
    return { jobId: job.id, turnId: job.id, ahead };
  }

  // 1.5.41: until the side-lane reply is done (the media job waits here before it loads its own brain back).
  async sideIdle(signal) {
    while (this.turns.has(SIDE_LANE) && !signal?.aborted) await new Promise((r) => setTimeout(r, 300));
  }

  // What to tell someone whose message has to wait behind a long media job, or null.
  busyLine(job) {
    if (!this.turns.size || this.state.state !== 'painting') return null;
    if (sideOk(this, job)) return null; // 1.5.41: it's answered beside the job instead
    if (laneOf(this.cfg, job) !== 'talk' || !this.turns.has('talk')) return null; // it runs in its own lane: no wait
    return queuedLine(plainDoing(this.state.detail));
  }

  cancelJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j) return false;
    if (j.away && stopAway(this, j.id)) return true; // 1.5.72: with another Bob: he's told to stop
    if (j.state === 'working') return this.stop(j.id);
    if (j.state !== 'waiting') return false;
    j.state = 'cancelled';
    this.waitOver(j);
    this.saveQueue();
    return true;
  }

  retryJob(id) {
    const j = this.queue.find((x) => x.id === id);
    if (!j || !['interrupted', 'failed', 'cancelled'].includes(j.state)) return false;
    // 1.5.38: a job cut off by a restart carries on from where it stopped (its carry-on note was made at start-up).
    // A failed or cancelled job starts again from nothing, as before.
    if (j.state !== 'interrupted') { j.carryOn = null; j.before = []; j.cutStep = null; }
    j.pickUp = j.state === 'interrupted' && Boolean(j.carryOn);
    j.resumed = 0; // the user pressed it: the automatic pick-up count starts over
    j.after = undefined;
    j.state = 'waiting'; j.error = undefined; j.at = Date.now(); j.doneAt = undefined; j.steps = [];
    this.queue = [...this.queue.filter((x) => x !== j), j]; // back of the line
    this.saveQueue();
    this.pump();
    return true;
  }

  // ---- Jobs that wait for a download (1.5.38) ----
  // "Make me a song" with no music models yet: the user presses Download in the chat, and the song request waits
  // in Tasks until the download is done, then runs by itself. It's in queue.json, so it survives Bob closing too.
  // ---- 1.5.91 Set it up for you ----
  // Is anything Bob could offer missing or switched off right now? (offer_setup is only listed then.)
  notSetUp(tool) {
    const need = { make_image: 'pictures', make_video: 'video', make_music: 'music', make_sound: 'sfx' }[tool];
    if (!need) return false;
    try { return !capabilities(this.cfg)[need]; } catch { return false; }
  }
  switchesOff() { return SWITCH_KEYS.map((k) => switchFor(this.cfg, k)).filter(Boolean); }
  offerNeeded() {
    let can = {};
    try { can = capabilities(this.cfg); } catch {}
    return !can.hearing || !can.voice || this.switchesOff().length > 0;
  }
  // Show the Set it up card for a capability (NEEDS) or a setting (SWITCH_KEYS) and tell Bob what to say.
  // Returns Bob's instructions as the tool result, never an error. quiet: return '' when no card could be made.
  async offerSetup(what, ctx, { quiet = false } = {}) {
    const who = this.cfg.userName || 'the user';
    const jobId = ctx?.job?.id || null;
    // A job from another of your Bobs: the card would land on the wrong replicant matrix, so just say it can't here.
    if (ctx?.job?.guest?.public) return quiet ? '' : `Not here: this replicant matrix can't ${NEEDS[what]?.say || 'do that'} yet. Say so in one line.`;
    if (ctx?.job?.guest) return quiet ? '' : `Not here: this replicant matrix can't ${NEEDS[what]?.say || 'do that'} yet. Say so; ${ctx.job.guest.from} can do it or set it up there.`;
    // 1.5.104: one request, one card. A second offer for the same thing in the same turn (the tool, then Bob's own
    // offer_setup) shows nothing new.
    if (ctx && (ctx.offered ||= new Set()).has(what)) { ctx.offeredNow = true; return quiet ? '' : `The card for this is already under the chat. Don't call offer_setup again and don't repeat what you said: if you've told ${who} about the card, stop here.`; }
    if (NEEDS[what]) {
      const n = NEEDS[what];
      if (!this.shop) return quiet ? '' : `Not done: this replicant matrix can't ${n.say} yet. Say so in one line and offer to write the prompt instead.`;
      const [list, hw] = await Promise.all([this.shop.list(), this.shop.hardware().catch(() => ({}))]);
      const plan = planFor(what, { list, hw });
      if (plan.kind === 'none') return quiet ? '' : `Not done: this replicant matrix can't ${n.say}: ${plan.why} Tell ${who} that in one line and offer to write the prompt instead. Don't call the tool again now.`;
      const id = (this.offers ||= new SetupOffers()).add({ plan, jobId });
      if (ctx) { (ctx.offered ||= new Set()).add(what); ctx.offeredNow = true; }
      ctx?.emit?.({ type: 'offer-setup', id, need: what, kind: plan.kind, say: n.say, what: n.what, items: plan.items || [], size: plan.size || '', sizeGB: plan.sizeGB || 0, freeGB: plan.freeGB ?? null, short: plan.short || 0, note: plan.note || '', model: plan.model || null, carryOn: Boolean(jobId) });
      this.log('setup', `offered ${what}: ${plan.kind} ${(plan.ids || []).join(', ') || plan.model?.id || ''}`);
      const say = plan.kind === 'equip'
        ? `${plan.model.name} is already on this replicant matrix but isn't in its slot. A card with a "Use it" button is now under this chat.`
        : `This replicant matrix can't ${n.say} yet: it needs ${n.what} (${plan.items.map((i) => i.name).join(' and ')}, about ${plan.size}). A card with a "Set it up" button is now under this chat.`;
      return `Nothing made yet. ${say} Tell ${who} that in one or two short, friendly lines: what's missing, the size, and that one press sets it up and then you ${jobId ? 'carry on with this job by yourself, no need to ask again' : 'can do it'}. It isn't an error, so don't apologise for one, and don't call this tool again now.`;
    }
    const sw = switchFor(this.cfg, what);
    if (!sw) return quiet ? '' : SWITCH_KEYS.includes(what) ? 'That setting is already on. Go ahead with the job.' : `There's no setting called ${what}. Settings you can offer: ${this.switchesOff().map((x) => x.key).join(', ') || 'none (everything is on)'}.`;
    if (sw.held) return `The ${sw.name} Hand is stopped with ${sw.where}. Tell ${who} in one line: press that switch again to let Hands carry on, then ask again. Don't offer anything else.`;
    const id = (this.offers ||= new SetupOffers()).add({ sw: what, jobId });
    if (ctx) { (ctx.offered ||= new Set()).add(what); ctx.offeredNow = true; }
    ctx?.emit?.({ type: 'offer-setup', id, need: what, kind: 'switch', name: sw.name, where: sw.where, what: sw.what, privacy: sw.privacy || '', free: Boolean(sw.free), folders: Boolean(sw.folders), carryOn: Boolean(jobId) });
    this.log('setup', `offered to switch on ${what}`);
    return `Not done yet: "${sw.name}" is off. A card with a "Switch it on" button is now under this chat. Tell ${who} in one or two short lines what it lets you do and that one press switches it on${sw.folders ? ' (they still tick which folders I may use, in Settings, Hands)' : ''}, then you ${jobId ? 'carry on with this job by yourself' : 'can do it'}. Don't call this tool again now.`;
  }

  // 1.5.127 Rented brains: the Hire it card for the rented brain in its slot. One card per turn; nothing is spent until it's pressed.
  offerRent(ctx, { why = '', tokens = 0 } = {}) {
    const rental = this.rentals.current();
    if (!rental) return null;
    if (ctx.rentOffered) return { already: true };
    ctx.rentOffered = true;
    const n = tokens || roughTokens({ messages: ctx.msgs || [] });
    const view = this.rentals.view().rentals.find((r) => r.id === rental.id);
    const id = this.rentals.offer(rental, { jobId: ctx.job?.id || null, tokens: n, why, emit: (ev) => ctx.emit?.({ ...ev, sessionId: ctx.sessionId }) });
    const can = this.rentals.canStart(rental, 0);
    return { id, est: estimateText(rental, n), blocked: can.ok ? '' : can.why, name: rental.name, service: view?.serviceName || '' };
  }
  // The Hire it card was answered (PC window or phone). yes: the job runs again, on the rented brain this time.
  answerRent(id, yes) {
    const r = this.rentals.answer(id, yes);
    if (r.ok && r.done === 'none' && r.jobId) { // 1.5.128: Not now runs the request here instead of leaving it unanswered
      const j = this.queue.find((x) => x.id === r.jobId);
      if (j) { j.rent = false; j.rentOk = false; j.rentAgain = true; this.carryOnNow(j.id, '[Bob note, not from the user: the user pressed Not now on the rented brain card. Do what they asked here, on this computer, with the brains you have.]'); return { ...r, carryOn: true }; }
    }
    if (!r.ok || r.done !== 'hired') return r;
    const j = this.queue.find((x) => x.id === r.jobId);
    if (j) { j.rent = true; j.rentOk = true; j.rentAgain = true; this.carryOnNow(j.id, `[Bob note, not from the user: the user hired the rented brain (${r.rental.name}) for this. Do what they asked.]`); }
    this.broadcast?.({ type: 'settings-changed' });
    return { ok: true, done: 'hired', name: r.rental.name, carryOn: Boolean(j) };
  }

  // The card was answered (PC window or phone). yes: download / put in its slot / switch on, then carry on with the job.
  async answerSetup(id, yes) {
    const o = (this.offers ||= new SetupOffers()).take(id);
    if (!o) return { ok: false, why: 'That card is too old now. Ask me again.' };
    if (!yes) { this.log('setup', 'Not now'); return { ok: true, done: 'none' }; }
    if (o.sw) {
      const patch = applySwitch(this.cfg, o.sw, { saveHands: (h) => this.saveHands(h) });
      if (!patch) return { ok: false, why: 'That setting couldn\'t be switched on from here. It\'s in Settings.' };
      this.log('setup', `switched on ${o.sw} (your click)`);
      if (o.jobId) this.carryOnNow(o.jobId, `[Bob note, not from the user: the user switched on ${switchFor({}, o.sw)?.name || o.sw} for this. Do what they asked.]`);
      this.broadcast?.({ type: 'settings-changed' });
      return { ok: true, done: 'switch' };
    }
    const plan = o.plan;
    if (plan.kind === 'download') {
      const hw = await this.shop.hardware().catch(() => ({}));
      if (hw.freeGB != null && hw.freeGB < plan.sizeGB + 2) return { ok: false, why: `Not enough free disk: free up ${Math.ceil(plan.sizeGB + 2 - hw.freeGB)} GB, then ask me again.` };
    }
    this.shop.planEquip(plan.equip || {});
    if (plan.kind === 'equip') {
      await this.shop.applyEquip();
      this.log('setup', `put ${plan.model?.id} in its slot (your click)`);
      if (o.jobId) this.carryOnNow(o.jobId, `[Bob note, not from the user: ${plan.model?.name} is in its slot now. Do what they asked.]`);
      return { ok: true, done: 'equip' };
    }
    await this.shop.download(plan.ids[0], { queue: plan.ids.slice(1) });
    if (o.jobId) this.waitForDownload(o.jobId, plan.ids);
    this.log('setup', `downloading ${plan.ids.join(', ')} (your click)`);
    return { ok: true, done: 'download', names: plan.items.map((i) => i.name), size: plan.size };
  }

  // Put a job back in line straight away with a note (nothing to download first).
  carryOnNow(jobId, note) {
    const j = this.queue.find((x) => x.id === jobId);
    if (!j) return false;
    if (j.state === 'working') { j.again = note; return true; } // the end of this reply puts it back in line
    j.carryOn = note; j.before = []; j.cutStep = null; j.pickUp = false;
    {
      Object.assign(j, { state: 'waiting', error: undefined, doneAt: undefined, sentTo: undefined, steps: [], at: Date.now() });
      this.queue = [...this.queue.filter((x) => x !== j), j];
    }
    this.saveQueue();
    setTimeout(() => this.pump(), 0);
    return true;
  }

  waitForDownload(jobId, modelId) {
    const j = this.queue.find((x) => x.id === jobId);
    if (!j || !modelId || (Array.isArray(modelId) && !modelId.length)) return false;
    // 1.5.91: a Set it up card can download several things (the program and the model); the job waits for all of them.
    const ids = [].concat(modelId).map(String);
    const nameOf = (x) => { try { return this.shop?.describe(x)?.name || x; } catch { return x; } };
    const name = ids.map(nameOf).join(' and ');
    j.after = { id: ids.at(-1), ids, name };
    j.carryOn = `[Bob note, not from the user: the ${name} the user downloaded for this are on the PC now. Do what they asked.]`;
    j.before = []; j.cutStep = null; j.pickUp = false;
    if (j.state !== 'working') { // still running: the end of the turn puts it back in line
      Object.assign(j, { state: 'waiting', error: undefined, doneAt: undefined, sentTo: undefined, steps: [], at: Date.now() });
      this.queue = [...this.queue.filter((x) => x !== j), j];
    }
    this.log('queue', `waits for the ${name} download: ${j.text.slice(0, 60)}`);
    this.saveQueue();
    return true;
  }

  // true once the download a waiting job needs is done. A download that failed or was cancelled sends the job to
  // Tasks as interrupted, with a plain reason (it never waits forever). Paused or queued: it keeps waiting.
  downloadReady(job) {
    const ds = (job.after.ids || [job.after.id]).map((id) => (this.shop?.dl || []).find((x) => x.id === id));
    if (ds.every((d) => d?.state === 'done')) { job.after = undefined; return true; }
    if (ds.some((d) => d && ['queued', 'downloading', 'paused'].includes(d.state)) && !ds.some((d) => !d || ['failed', 'cancelled'].includes(d.state))) return false;
    const d = ds.find((x) => !x || x.state !== 'done');
    job.state = 'interrupted';
    job.error = `The ${job.after.name} download ${d?.state === 'cancelled' ? 'was cancelled' : d?.state === 'failed' ? 'failed' : 'isn\'t in Downloads any more'}, so this didn't run. Get it again in Downloads, then press Carry on.`;
    job.after = undefined;
    setTimeout(() => this.saveQueue(), 0);
    return false;
  }

  // Bob's Downloads changed (server.js passes it on): a job waiting for one may be able to go now.
  downloadsChanged() { if (this.queue.some((j) => j.state === 'waiting' && j.after)) this.pump(); }

  // Starts the next waiting job in each free lane, oldest first.
  pump() {
    if (this.switching) return; // 1.5.41: Bob is changing session; the jobs start once the new session is set
    const seen = new Set();
    for (const job of this.queue) {
      if (job.state !== 'waiting') continue;
      if (job.parked && this.cfg.gamingLock === true) continue; // 1.5.41: put aside by the 🎮 Gaming button, waits for it to go off
      // 1.5.72 Share jobs: a job this Bob can't do, or that would wait, goes to one of your Bobs who says he can do it.
      if (job.awayHold && job.awayHold > Date.now()) continue; // waiting for one of your Bobs who can do it
      if (!job.away && this.cfg.share?.borrow?.jobs === true) {
        const plan = awayPlan(this, job, { can: this.jobCan(), webOn: webOn(this.cfg), waitsForGaming: waitsForGaming(this.cfg, job), laneBusy: this.turns.has(laneOf(this.cfg, job)) });
        if (plan) {
          job.away = { pending: true }; // held while we ask around, so the next pump doesn't start it here too
          const nobody = () => {
            if (job.away?.pending) job.away = undefined;
            job.awayAfter = Date.now() + 60000; // ask around again in a minute
            // Bob can't do this one here at all: it waits in Tasks for a Bob who can (up to 10 minutes), then he says so.
            if (plan.why === 'cant' && !this.lenders.anyCould(plan.need)) job.noAway = true; // none of them ever can: Bob says so now
            else if (plan.why === 'cant' && (job.awayWaits = (job.awayWaits || 0) + 1) <= 10) {
              job.awayHold = job.awayAfter;
              if (job.awayWaits === 1) this.broadcast({ type: 'busy-note', sessionId: job.sessionId, jobId: job.id, text: awayWaitLine(plan.need) });
              setTimeout(() => this.pump(), 61000).unref?.();
            } else if (plan.why === 'cant') job.noAway = true;
            setTimeout(() => this.pump(), 0);
          };
          sendAway(this, job, plan).then((went) => { if (!went) nobody(); }).catch((e) => { this.log('away', `couldn't send a job: ${e.message}`); nobody(); });
          continue;
        }
      }
      if (job.away) continue; // with another Bob (or being sent)
      if (waitsForGaming(this.cfg, job)) { this.gamingProbe?.(); continue; } // 1.5.23: waits in Tasks until the session isn't Gaming
      if (job.after && !this.downloadReady(job)) continue; // 1.5.38: waits for the download it needs
      let lane = laneOf(this.cfg, job);
      let beside = false;
      if (lane === 'talk' && this.turns.has('talk') && !seen.has(SIDE_LANE) && (sideOk(this, job) || (beside = besideBigOk(this, job)))) {
        lane = SIDE_LANE;
        // 1.5.53: a talker already loaded beside the job answers there, even during a picture.
        if (!beside && this.engine?.besideLoaded?.() && isTalker(this, this.engine.beside?.current)) beside = true;
      }
      if (seen.has(lane)) continue;
      seen.add(lane);
      if (this.turns.has(lane)) continue;
      if (!besideOk(this, job, lane)) continue; // 1.5.40: waits for the other lane, see besideOk
      job.side = lane === SIDE_LANE; job.beside = job.side && beside; job.state = 'working'; job.startedAt = Date.now(); job.steps = []; this.waitOver(job);
      this.saveQueue();
      this.startTurn(job.sessionId, job.text, job.refs, job, lane);
    }
    besideLater(this);
  }

  // Runs one job. Progress goes out as events; when it ends, the next job starts.
  startTurn(sessionId, text, attach = [], job = null, lane = 'talk') {
    if (this.turns.has(lane)) throw new Error('busy');
    const turnId = job?.id || crypto.randomUUID();
    const controller = new AbortController();
    let flagged = false; // an error or correction note under this reply: no sleepy aside (never joke about a real failure)
    const emit = (ev) => { if (['error', 'correction', 'held', 'waiting'].includes(ev.type)) flagged = true; this.broadcast({ ...ev, turnId, sessionId }); };
    this.turns.set(lane, { turnId, sessionId, controller, ...(job?.beside ? { beside: true } : {}) });
    emit({ type: 'start', text: text.slice(0, 140) });
    if (job?.pickUp) emit({ type: 'announce', text: carryOnLine(job) }); // 1.5.38: picked up after a restart
    const pics = [].concat(attach || []).map((id) => this.refs.find(String(id))).filter(Boolean).slice(0, 4);
    let ok = false;
    (async () => {
      if (await this.cardStillTaken(job)) throw Object.assign(new Error(this.cardLineFor(sessionId)), { code: 'card_busy' });
      return this.run(sessionId, text, emit, controller.signal, pics, job);
    })()
      .then(() => { ok = true; if (job) job.state = 'done'; })
      .catch(async (e) => {
        // 1.5.113: a load that timed out because another program holds the card ends with the plain ⚠ line, once per chat.
        if (!controller.signal.aborted && e?.code !== 'card_busy' && (e?.code === 'card_held' || await this.cardTaken(e, null).catch(() => false)) && this.cardHeld) e = Object.assign(new Error(this.cardLineFor(sessionId)), { code: 'card_busy' });
        if (e?.code === 'beside' && job && !controller.signal.aborted) { // 1.5.51: the second brain wouldn't start: wait in line
          emit({ type: 'announce', text: BESIDE_FAILED });
          this.log('handoff', `second brain beside the job wouldn't start (${e.message}); the message waits for the job`);
          Object.assign(job, { requeued: true, noBeside: true, side: false, beside: false });
        }
        else if (controller.signal.aborted && job?.parked) this.parkJob(job, emit); // 1.5.41: the 🎮 Gaming button, not a stop
        else if (controller.signal.aborted) { emit({ type: 'token', text: '\n\n*(Stopped.)*' }); if (job) job.state = 'cancelled'; }
        else {
          emit({ type: 'error', text: e.message }); this.log('error', e.message); if (job) { job.state = 'failed'; job.error = e.message.slice(0, 200); }
          // The chat keeps the failure as a note under the question (it used to be a live line only, gone after a reload).
          if (!job?.guest) { const sess = this.session(sessionId); const last = sess[sess.length - 1]; if (!(last?.role === 'assistant' && last.failed)) sess.push({ role: 'assistant', content: '', correction: `⚠ ${String(e.message).slice(0, 400)}`, failed: true, at: Date.now() }); }
        }
      })
      .finally(() => {
        if (!job?.guest) this.saveSession(sessionId); // 1.5.72: a job from another Bob isn't kept as a chat here
        this.gate.done(controller.signal); // the graphics card goes to the next job waiting for it
        if (job?.handoff) job.handoff = slimHandoff(job.handoff); // finished: keep what it did, drop the load-by-load steps
        // 1.5.38: carried on (or not) once; the note isn't used again. A job told to wait for a download goes back in line.
        if (job && job.state !== 'interrupted' && !job.after && !job.parked) { job.carryOn = null; job.before = undefined; job.cutStep = undefined; job.pickUp = false; }
        if (job?.requeued) { job.requeued = false; Object.assign(job, { state: 'waiting', error: undefined, steps: [] }); this.queue = [job, ...this.queue.filter((x) => x !== job)]; }
        if (job?.again && job.state !== 'cancelled') { job.carryOn = job.again; job.again = undefined; Object.assign(job, { state: 'waiting', error: undefined, doneAt: undefined, steps: [], at: Date.now() }); this.queue = [...this.queue.filter((x) => x !== job), job]; } // 1.5.91: Set it up pressed while this reply was still going
        if (job?.after && job.state !== 'cancelled') { job.state = 'waiting'; job.error = undefined; job.at = Date.now(); this.queue = [...this.queue.filter((x) => x !== job), job]; }
        // 1.5.41: Bob picked another session for this job: it goes back to the front of the line and runs there.
        const switchTo = job?.switchTo && job.state === 'done' ? job.switchTo : null;
        if (switchTo) { job.switchTo = undefined; job.switchedTo = switchTo.id; Object.assign(job, { state: 'waiting', error: undefined, doneAt: undefined, steps: [] }); this.queue = [job, ...this.queue.filter((x) => x !== job)]; }
        this.turns.delete(lane);
        this.rentals?.turnDone(job); // 1.5.127: a hired machine stops once no job uses it
        this.lastActivity = Date.now();
        // Gaming: now and then a scripted sleepy aside under a normal finished reply (a feeling, never a fact about the job).
        // Never after an error or correction note, or for a job held back (e.g. "Waiting · Gaming is on").
        if (ok && !flagged && !controller.signal.aborted && (!job || job.state === 'done') && currentSession(this.cfg).id === SLEEPY_SESSION) {
          const aside = sleepyAfterReply(this.sleepy, cleanPersonality(this.cfg.personality));
          if (aside) emit({ type: 'aside', text: aside });
        }
        emit({ type: 'done' });
        if (!this.turns.size) this.setState('idle', '');
        if (job && !switchTo && !job.parked && job.state !== 'waiting') { job.doneAt = Date.now(); for (const st of job.steps || []) if (st.state === 'in progress') st.state = job.state === 'done' ? 'completed' : job.state; this.saveQueue(); }
        if (switchTo) { this.saveQueue(); this.autoSwitch(switchTo.id, 'bob', switchTo.why).catch((e) => this.log('error', `session switch: ${e.message}`)).finally(() => this.pump()); return; }
        setTimeout(() => this.pump(), 0);
        setTimeout(() => this.settle().catch(() => {}), 0); // after pump, so a waiting job keeps its brain
      });
    return turnId;
  }

  // Pictures the user attached: Bob's eyes (the "eyes" model) describe each one once, and the description
  // goes into the message, so even a text-only brain can work with them. With no eyes model set,
  // the picture goes straight to the main brain (it needs to be a vision model).
  async look(pics, emit, signal) {
    const eyes = this.cfg.models.eyes;
    const notes = [];
    let direct = [];
    for (const r of pics) {
      let seen = r.seen;
      if (!seen && eyes) {
        const sees = (await this.ensureModel(eyes, emit, signal, 'eyes')) || eyes;
        this.setState('thinking', `Looking at ${r.name}`, sees);
        const reply = await this.chatSafe({ model: sees, signal, messages: [{ role: 'user', content: 'Describe this picture for an artist who has to draw it again: who or what is in it, their look (face, hair, build, clothes, colours), the setting, the lighting and the art style. Plain sentences, under 150 words.', images: [this.refs.base64(r)] }] }, { emit, who: 'eyes' });
        seen = (reply.content || '').trim();
        if (seen) this.refs.setSeen(r.id, seen);
      }
      if (!seen) direct.push(this.refs.base64(r));
      notes.push(`[Attached picture "${r.name}" (${r.kind}${r.kind === 'chat' ? ', not on the shelf' : ''}). It can be used as a reference by that name.${seen ? ` What it shows: ${seen}` : ''}]`);
    }
    return { note: notes.join('\n'), images: direct };
  }

  // Each job works on its own copy of the conversation and adds its messages when it ends, so two jobs
  // running side by side (Art session) never tangle each other's tool calls.
  async run(sessionId, text, emit, signal, pics = [], job = null) {
    const shared = this.session(sessionId);
    const msgs = shared.slice();
    const base = msgs.length;
    // Pictures, clips and sounds Bob makes are kept with his reply, so they're still in the chat after a
    // reload, a restart or a missed live event (they used to exist only as a live event).
    const media = [];
    const out = {};
    let rough = false; // an error or correction note this turn: no how-to card
    const keep = (ev) => {
      if (['error', 'correction', 'held', 'waiting'].includes(ev?.type)) rough = true;
      if (['image', 'video', 'audio', 'diagram'].includes(ev.type) && typeof ev.url === 'string' && ev.url.startsWith('/images/')) {
        if (media.some((m) => m.url === ev.url)) return; // delivered once already
        media.push({ type: ev.type, url: ev.url, name: path.basename(decodeURIComponent(ev.url.slice(8))), ...(ev.song?.title ? { title: ev.song.title, sound: ev.song.sound } : {}), ...(ev.type === 'diagram' ? { title: String(ev.title || ''), ...(ev.format ? { format: ev.format } : {}) } : {}) });
        out.ctx?.ledger?.output(ev, out.ctx.currentTool || null);
      }
      // Saved files and things called up with show_made: kept as cards with the reply.
      if (ev.type === 'made') for (const x of ev.items || []) if (x?.url && !media.some((m) => m.url === x.url)) { media.push({ type: 'file', kind: x.kind, url: x.url, name: x.name, path: x.path }); out.ctx?.ledger?.output({ type: 'file', file: x.path, url: x.url }, out.ctx.currentTool || null); }
      return emit(ev);
    };
    try {
      // High and Extreme effort: Bob calls a moot. The draft comes first (runOn), then his reviewer copy checks it.
      if (careful(job)) emit({ type: 'announce', text: mootOpening(this.cfg, job.effort, base) });
      await this.runOn(msgs, text, keep, signal, pics, job, sessionId, out);
      if (careful(job) && out.ctx && !signal?.aborted) await runMoot(this, { msgs, base, emit: keep, signal, job, ctx: out.ctx });
      // #30: Low and Medium, opt-in: a quick second look from a paired Bob when one is free. None free: no check, no swap.
      else if (out.ctx && !signal?.aborted && this.cfg.netReview === true) await runMoot(this, { msgs, base, emit: keep, signal, job, ctx: out.ctx, quick: () => this.quickReviewer(job, pics) });
      if (out.ctx && !signal?.aborted && !rough) this.howtoAfter(sessionId, text, out.ctx, keep, job);
    }
    finally {
      if (media.length) {
        const added = msgs.slice(base);
        let reply = [...added].reverse().find((m) => m.role === 'assistant' && !m.tool_calls);
        if (!reply) { reply = { role: 'assistant', content: '' }; msgs.push(reply); }
        reply.media = [...(reply.media || []), ...media].slice(0, 24);
      }
      shared.push(...msgs.slice(base));
    }
  }

  // 1.5.79: after a job went well, one card: save its steps as a how-to? Only with "Let Bob learn how-tos" on,
  // never for a job from another Bob, not when a how-to was followed this turn or already covers it.
  howtoAfter(sessionId, text, ctx, emit, job = null) {
    if (!howtosOn(this.cfg) || job?.guest) return null;
    const steps = worthOffering(ctx.trail);
    if (!steps) return null;
    if (sessionId) { this.lastTrail.set(sessionId, { when: text, steps }); if (this.lastTrail.size > 50) this.lastTrail.delete(this.lastTrail.keys().next().value); }
    if (ctx.howtoOffered || ctx.howtoUsed) return null;
    try { if (this.howtos.covered(text)) return null; } catch { return null; }
    const o = this.howtos.offer({ sessionId, when: text, steps });
    emit({ type: 'howto-offer', id: o.id, name: o.name, when: o.when, steps: o.steps.map((s) => s.did), sessionId });
    this.log('howtos', `offered to keep ${steps.length} steps as "${o.name}"`);
    return o;
  }

  // The card's answer. save: true keeps it (with the name typed on the card, if any). Returns the how-to, or null.
  async answerHowto(id, save, name = '') {
    const o = this.howtos.takeOffer(String(id || ''));
    if (!o) return { ok: false, why: 'That card is too old now. Ask me to save the steps again.' };
    if (!save) { this.log('howtos', `"${o.name}" not kept`); return { ok: true, saved: null }; }
    const r = this.howtos.add({ name: String(name || '').trim() || o.name, when: o.when, steps: o.steps });
    this.log('howtos', `saved the how-to "${r.name}" (${r.steps.length} steps)`);
    // Its meaning, for matching, only when the Memory model is in use anyway (never started just for this).
    try {
      const hk = this.housekeeper;
      if (hk && hkSettings(this.cfg).enabled) Promise.race([hk.embed([`${r.name}. ${r.when}`]), new Promise((ok) => setTimeout(() => ok(null), 3000))]).then((v) => { if (v?.[0]) this.howtos.setVec(r.id, v[0]); }).catch(() => {});
    } catch {}
    return { ok: true, saved: r };
  }

  // What Bob carries from earlier, instead of the whole old chat: the summary of this chat's older part,
  // and the topic notes closest to what the user just said.
  async recall(sessionId, text) {
    const parts = [];
    const sum = sessionId ? readSummary(this.cfg, sessionId)?.summary : '';
    if (sum) parts.push(`Earlier in this chat (summed up): ${sum}`);
    try {
      const hk = this.housekeeper;
      const recall = recallOn(this.cfg);
      let vec = null, topicProject = '';
      // 1.5.79: "Remember only what fits" embeds the message too (same 1.5 s limit; words are matched if it's slow).
      const wantVec = hk && (hkSettings(this.cfg).enabled || recall) && !gaming(this.cfg);
      if (hk && hk.topics.load().topics.length) {
        if (wantVec) vec = (await Promise.race([hk.embed([text]), new Promise((r) => setTimeout(() => r(null), 1500))]))?.[0] || null;
        const notes = hk.topics.relevant(text, { vec, k: 3 });
        topicProject = notes[0]?.project || '';
        if (notes.length) parts.push(`Notes from earlier talks (topics; the user can edit these):\n${notes.map((t) => `- ${t.project ? t.project + ' > ' : ''}${t.name}: ${(t.note || t.summary).slice(0, 600)}${t.open?.length ? ` Open: ${t.open.join('; ')}` : ''}`).join('\n')}`);
      } else if (recall && wantVec) vec = (await Promise.race([hk.embed([text]), new Promise((r) => setTimeout(() => r(null), 1500))]))?.[0] || null;
      this.recallVec = { text, vec }; // the turn's vector, reused by other matches this turn (how-tos)
      if (recall) { const mem = await this.recallMemories(sessionId, text, { vec, topicProject }); if (mem) parts.push(mem); }
      // Let Bob notice what's worth noting (notes.js): the quick notes that fit, and the project for a note's #tag.
      if (smartNotesOn(this.cfg)) {
        this.notesProject = activeProject(this.cfg, text, { sticky: (sessionId && this.memProject?.get?.(sessionId)) || '', topicProject }).project || topicProject || '';
        const fit = notesPrompt(this.cfg, text, { project: this.notesProject });
        if (fit) parts.push(fit);
      }
    } catch {}
    return parts.join('\n\n');
  }

  async runOn(msgs, text, emit, signal, pics, job = null, sessionId = null, out = {}) {
    const user = { role: 'user', content: text, at: Date.now() };
    // 1.5.94: a picture edit in plain English ("change this picture", "make her hair red", "now make the sky purple"):
    // the picture attached now, or else the newest one in this chat (attached or made a moment ago).
    let recent = null;
    if (!pics.length) { try { recent = recentPicture(msgs, { findRef: (id) => { const r = this.refs.find(id); return r ? { ...r, path: this.refs.pathOf(r) } : null; }, findPainted: (n) => this.findPicture(n) }); } catch {} }
    const wantsEdit = wantsPictureEdit(text, { pic: pics.length > 0, recent: Boolean(recent) });
    let picNote = '';
    if (pics.length) {
      const { note, images } = await this.look(pics, emit, signal);
      picNote = note;
      user.content = `${text}\n\n${note}`;
      user.refs = pics.map((r) => r.id);
      user.text = text;
      if (images.length) user.images = images;
    }
    // 1.5.38: after a restart, the brain is told which steps already finished and which was cut off (the chat shows only
    // the user's own words).
    if (wantsEdit) { user.content = `${user.content}\n\n${editHint(pics.length ? pics.map((r) => r.name) : [recent.name])}`; user.text = text; }
    if (job?.carryOn) { user.content = `${user.content}\n\n${job.carryOn}`; user.text = text; }
    // 1.5.41: run again after Bob switched session: the user's message is already in the chat once, so the brain gets the
    // note only (hidden), and the turn starts at the user's message from before.
    const lastUser = [...msgs].reverse().find((m) => m.role === 'user');
    // 1.5.128: the same after a Hire it card (Hire it or Not now): the message that drew the card is in the chat already,
    // so the re-run adds only the hidden note (the PC saw the user's bubble twice after a reload).
    const again = (Boolean(job?.switchedTo) || Boolean(job?.rentAgain)) && Boolean(lastUser) && String(lastUser.text ?? lastUser.content ?? '').startsWith(text);
    if (again) msgs.push({ role: 'system', content: job.switchedTo ? switchedNote(job.switchedTo) : job.carryOn || '', hidden: true });
    else msgs.push(user);
    if (job) job.rentAgain = false;
    const turnStart = again ? msgs.map((m) => m.role).lastIndexOf('user') : msgs.length - 1;
    this.log('chat', `${this.cfg.userName || 'User'}: ${text}`);
    // The turn's pictures travel with it, so a hat Bob hands the job to can see them too.
    // Every picture, clip or sound he makes goes on the Made by Bob list as it's announced.
    const emitMade = (ev) => {
      if (['image', 'video', 'audio'].includes(ev?.type) && ev.file) { try { this.made.add(ev.file, { tool: ev.type, chat: sessionId, song: ev.song || null }); } catch {} }
      const sent = emit(ev);
      if (['image', 'video', 'audio'].includes(ev?.type) && ev.file && ctx?.wantType) this.autoSaveAs(ev, ctx); // 1.5.95 "a song as an mp3"
      return sent;
    };
    const ctx = { emit: emitMade, signal, brain: this, cfg: this.cfg, allowAll: new Set(), pics, picNote, msgs, turnText: text, job, sessionId, wantsEdit, editFrom: wantsEdit ? recent : null, wantType: namedType(text), saves: [], savedAs: [] };
    // The ledger (handoff.js): what was asked for, every load, tool and output this turn, kept by the system.
    ctx.ledger = new Ledger({ job, expect: expectFrom(text, { pics }), save: () => this.saveQueue() });
    this.gate.track(signal, ctx.ledger);
    ctx.loaded = this.startGroups(sessionId, text); // toolbox groups this turn (use_tools adds more)
    if (wantsEdit && groupsFor(this).pictures) ctx.loaded.add('pictures'); // 1.5.94: an edit needs make_image at hand
    out.ctx = ctx;
    const used = new Set();
    // High and Extreme effort draft on the big brain; Low is the usual chat brain.
    if (job?.side && !job.sidePick) job.sidePick = await sidePick(this, job);
    let { model, cpu, think, ctx: wantCtx, beside } = job?.side ? job.sidePick : (bigThinker(job) && draftBrain(this.cfg, job.effort)) || modelFor(this.cfg, 'bob');
    // 1.5.16: a Low-effort chat reply doesn't think first (gemma4 and others think by default, which delays every reply).
    // Medium and up, and sessions that set a level (Deep thought), keep their thinking.
    if (think === undefined && !bigThinker(job)) think = false;
    // 1.5.66: Qwen3.6 as the main Brain (everyday chat): no thinking first, and the same long load (256K since 1.5.86) its Coding copy
    // uses, so chat and coding don't reload the brain between them. A context picked by hand for Normal still wins.
    if (!job?.side && !bigThinker(job) && currentSession(this.cfg).id === 'normal' && !CTX_CHOICES.includes(this.cfg.sessionCtx?.normal)) {
      const d = brainDefaults(model, 'bob');
      if (d.ctx) wantCtx = d.ctx;
      if ('think' in d) think = d.think;
    }
    // 1.5.69: with "Keep the graphics card free for quick answers" on, Low chat runs on the small Quick brain, which is
    // poor at reading web pages. A message with a link in it (or one about a link from earlier) goes to the main Brain
    // instead, like any other hand-off. Normal session only: Gaming keeps its own small brain (never E4B, never the card).
    if (!job?.side && !bigThinker(job) && !again && quickOnCpu(this.cfg) && currentSession(this.cfg).id === 'normal'
      && webOn(this.cfg) && this.usable('fetch_page') && linkTurn(text, msgs.slice(0, turnStart))) {
      const main = modelFor({ ...this.cfg, quickOnCpu: false }, 'bob');
      if (main.model && !sameModel(main.model, model)) {
        ({ model, cpu, ctx: wantCtx } = main);
        think = false; // a Low chat reply, on whichever brain
        // Settings review: a load costs time, so say how long when the main Brain isn't loaded yet.
        let loaded = false, secs = null;
        try { loaded = await this.engine.isLoaded(model, { cpu, ctx: wantCtx }); } catch {}
        if (!loaded) { try { secs = await this.engine.estimateLoad?.(model, { cpu, ctx: wantCtx }); } catch {} }
        emit({ type: 'announce', text: `This one has a link in it, so my main Brain takes it${loaded ? '' : secs ? ` (loading it, about ${Math.round(secs)} seconds)` : ' (loading it)'}.` });
        this.log('chat', `a link: the main Brain (${model}) answers instead of the Quick brain`);
      }
    }
    // Small extras, only on some turns: the effort note (High/Extreme) and now and then a moment with the cat.
    const turnNo = msgs.filter((m) => m.role === 'user').length;
    const state = realState({ model, session: currentSession(this.cfg).label, waiting: this.queue.filter((j) => j.state === 'waiting').length, cat: this.cfg.catName, turn: turnNo, withCat: catTurn(turnNo) });
    const extras = [state, guestNote(job, this.cfg.userName || 'the user'), effortPrompt(job?.effort), catPrompt({ cat: this.cfg.catName, turn: turnNo, dials: cleanPersonality(this.cfg.personality), user: this.cfg.userName || 'the user' })].filter(Boolean).map((x) => `\n\n${x.replaceAll('{{USER}}', this.cfg.userName || 'the user')}`).join('');
    const brainCtx = await this.fitCtx(model, wantCtx);
    // 1.5.127: a chat that no longer fits the biggest brain here, with a rented brain in its slot: offer it (the job carries on here meanwhile).
    if (!job?.rent && !job?.side && !job?.guest && this.rentals.current() && !ctx.rentOffered) {
      const tokens = roughTokens({ messages: msgs });
      if (brainCtx && tokens > brainCtx * 0.9) {
        this.offerRent(ctx, { tokens, why: `This chat and its files come to about ${Math.round(tokens / 1000)}K words, and my biggest brain here keeps ${Math.round(brainCtx / 1000)}K in mind.` });
        emit({ type: 'announce', text: 'This one is getting big for my brains here. I\'ll try anyway; the card below hires a bigger brain for it.' });
      }
    }
    if (!model) throw new Error('I don\'t have a brain yet. Open Get models (in the menu on the left) and pick one; the first-time setup suggests the right one for this replicant matrix.');
    this.setState('thinking', '', this.state.model);
    let earlier = job?.guest?.public ? '' : await this.recall(sessionId, text); // Bob on Discord: nothing of the owner's
    // 1.5.79 How-tos (off by default): the one saved how-to that fits this request goes in for this turn, and the chat says so.
    if (howtosOn(this.cfg) && !again && !job?.guest) {
      let howto = null;
      try { howto = this.howtos.match(text, this.recallVec?.text === text ? this.recallVec.vec : null); } catch {}
      if (howto) {
        ctx.howtoUsed = howto;
        try { this.howtos.used(howto.id); } catch {}
        emit({ type: 'tool', name: 'howto', summary: usingLine(howto) });
        earlier = [earlier, howtoPrompt(howto, this.cfg.userName || 'the user').trim()].filter(Boolean).join('\n\n');
        this.log('howtos', `following the how-to "${howto.name}"`);
      }
    }

    // Share brains (1.5.55): with "Borrow a brain" on and the owner's "when" met, one of his other Bobs thinks this reply.
    // The tools still run here, with this Bob's own checks and OK cards. No answer in time: this Bob thinks for himself.
    // 1.5.72: with several Bobs on the list, a Bob that's already thinking for us (or says busy) is skipped for the next.
    const tried = [];
    // 1.5.72: the Bob is picked once the chat is put together, so only Bobs with room for it are asked (Lenders.pick).
    let borrowing = wantsBorrow(this.cfg, this.borrowCase(job, pics));
    let lender = null;
    // 1.5.127 Rented brains: a job marked for the rented brain (the 🏗 Rented brain switch, a Hire it card, or Bob's own
    // hire_brain) thinks on the hired brain; the tools still run here. Not yet approved: the Hire it card, and nothing else.
    let rented = null;
    if (job?.rent && !job.side && !job.guest) {
      const rental = this.rentals.current();
      if (!rental) emit({ type: 'announce', text: 'No rented brain is in its slot (Equip Bob), so I\'m doing this one here.' });
      else if (!this.rentals.approved(rental, job)) {
        const r = this.offerRent(ctx, { why: 'You asked for the rented brain.' });
        emit({ type: 'announce', text: r?.blocked ? `I can't hire ${rental.name} yet: ${r.blocked}` : `Press Hire it on the card below and I'll run this on ${rental.name}.` });
        this.log('rent', 'waiting for the Hire it card');
        return;
      } else { rented = rental; borrowing = false; }
    }
    // 1.5.133 (Legion Go): when this Bob's own brain can't load here (the memory guard on built-in graphics says no),
    // the job goes to a paired Bob, whatever "when" borrowing is set to, as long as borrowing is switched on at all.
    // Nobody free: the plain "needs about N GB" line, as before. Never for a side lane, a guest, or a rented job.
    let ownRefused = null;
    if (!borrowing && !rented && !job?.side && !job?.guest && this.cfg.share?.borrow?.on === true && (this.cfg.share.borrow.bobs || []).length && !pics.length) {
      const room = await apuRoom(this, model, brainCtx).catch(() => ({ ok: true }));
      if (!room.ok) { ownRefused = room; borrowing = true; this.log('borrow', `my own brain won't fit here (needs ~${room.needGB} GB, room ~${room.roomGB} GB); asking another Bob`); }
    }

    // 1.5.60: a link in the message, with web search on: open it first, so even a small brain that would say
    // "I have no web access" answers from the page. Only the first link; it shows as a normal 🔧 Read the page line.
    // 1.5.65: "check out the page I told you about" has no link in it: then the newest link from the last few
    // messages counts. And if he still says he can't, he gets that page and one more go (see saysCant below).
    const webLinks = !again && webOn(this.cfg) && this.usable('fetch_page');
    const openLink = async (url, why) => {
      ctx.linkOpened = true;
      const res = await this.runTool('fetch_page', { url }, ctx).catch((e) => ({ text: `Error: ${e.message}` }));
      msgs.push({ role: 'assistant', content: '', tool_calls: [{ function: { name: 'fetch_page', arguments: { url } } }] });
      msgs.push({ role: 'tool', tool_name: 'fetch_page', content: String(res.text) });
      this.log('tool', `${why}: ${url}`);
    };
    const earlierLink = () => {
      const users = msgs.slice(0, turnStart).filter((m) => m.role === 'user').slice(-4).reverse();
      for (const m of users) { const [u] = findLinks(m.text ?? m.content, 1); if (u) return u; }
      return null;
    };
    if (webLinks) {
      const [url] = findLinks(text, 1);
      if (url) await openLink(url, 'opened the link in the message first');
      else if (refersToLink(text)) { const u = earlierLink(); if (u) await openLink(u, 'opened the link from earlier in the chat first'); }
    }

    for (let step = 0; step < MAX_STEPS; step++) {
      const tools = ctx.noTools ? [] : guestTools(job, this.frontDeskTools(ctx.loaded)); // #57 stopgap: after repeats, answer
      // 1.5.66: Bob's own one-more-go after a reply that missed. On Qwen3.6 (everyday chat answers without thinking)
      // the retry thinks it through: thinking is set per request, so the same loaded brain does it, no reload.
      if (ctx.retrying && think === false && LONG_CODER.test(String(model || ''))) {
        think = undefined;
        emit({ type: 'announce', text: 'Trying again, thinking it through this time.' });
        this.log('chat', 'one more go, with thinking on');
      }
      ctx.retrying = false;
      const pub = Boolean(job?.guest?.public); // Bob on Discord: no memory, about-me or backstory of the owner's
      const sys = { role: 'system', content: this.withLimits(systemPrompt({ now: this.now(), memory: pub ? '' : this.memory(), user: pub ? 'the owner' : this.cfg.userName, backstory: pub ? '' : this.backstory(), about: pub ? '' : this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, pub ? 'the owner' : this.cfg.userName || 'the user') }), ctx.loaded) + extras + (earlier ? `\n\n${earlier}` : '') };
      let reply = null;
      // A lender keeps the start of the chat it read last time (its prompt cache), so what changes every turn (the time,
      // the Right now line, recalled bits) goes in a short note just before the latest message, not in the instructions.
      let lentMsgs = null, lentSize = 0;
      if (borrowing) {
        const who = this.cfg.userName || 'the user';
        const lentSys = { role: 'system', content: this.withLimits(systemPrompt({ now: 'given in the note just before the latest message', memory: pub ? '' : this.memory(), user: pub ? 'the owner' : this.cfg.userName, backstory: pub ? '' : this.backstory(), about: pub ? '' : this.about(), cat: this.cfg.catName, look: lookPrompt(this.cfg), dials: personalityPrompt(this.cfg.personality, who) }), ctx.loaded) };
        const hist = staleHandErrors(msgs, turnStart);
        const at = hist.findLastIndex((m) => m.role === 'user');
        const note = { role: 'system', content: `Current date and time for ${who}: ${this.now()}.${extras}${earlier ? `\n\n${earlier}` : ''}` };
        lentMsgs = at < 0 ? [lentSys, ...hist, note] : [lentSys, ...hist.slice(0, at), note, ...hist.slice(at)];
        lentSize = roughTokens({ messages: lentMsgs, tools });
        if (!lender) {
          lender = await this.lenders.pick({ skip: tried, tokens: lentSize }).catch(() => null);
          if (lender) { tried.push(lender.address); emit({ type: 'borrow', action: 'start', name: lender.name, brain: lender.brain, device: lender.device }); }
          else {
            borrowing = false; // nobody free with room: this Bob thinks it, quietly (nothing went wrong)
            if (ownRefused) { this.log('borrow', 'no other Bob is free, and my own brain does not fit'); throw new Error(ownRefused.line); }
            const small = this.lenders.tooBigFor(lentSize);
            this.log('borrow', small.length ? `this chat is too long for ${small.join(', ')} (about ${lentSize} tokens); thinking it myself` : 'none of my other Bobs is free; thinking it myself');
          }
        }
      }
      if (rented) {
        const rName = rented.name;
        this.setState('thinking', `${rName} (rented) is thinking`, this.state.model);
        if (!ctx.rentSaid) { ctx.rentSaid = true; emit({ type: 'rent', action: 'thinking', rental: rName, service: this.rentals.view().rentals.find((r) => r.id === rented.id)?.serviceName || '' }); }
        try {
          reply = await this.rentals.chat(rented, { messages: [sys, ...staleHandErrors(msgs, turnStart)], tools, signal, think, job, emit, onToken: (t) => emit({ type: 'token', text: t }) });
        } catch (e) {
          if (signal?.aborted) throw e;
          this.log('rent', `${rName} couldn't take it (${e.message}); thinking it here`);
          emit({ type: 'rent', action: 'back', rental: rName, why: e.message });
          rented = null;
        }
      }
      if (lender) {
        this.setState('thinking', `${lender.name} is thinking`, this.state.model);
        let said = false;
        const askedAt = Date.now(); let firstAt = 0;
        try {
          reply = await this.lenders.chat(lender, { messages: lentMsgs, tools, signal, from: this.cfg.windowsName || 'Bob', onToken: (t) => { if (!said) firstAt = Date.now(); said = true; emit({ type: 'token', text: t }); } });
          // 1.5.181 (two-Bob trial: the reply came back empty and nothing ran here): an empty answer counts as a "couldn't".
          if (!String(reply?.content || '').trim() && !(reply?.tool_calls || []).length) { reply = null; throw Object.assign(new Error('it came back empty'), { busy: !said }); }
          // 1.5.196 (Tailscale test): a borrowed reply that went well leaves a line in the logbook too, once per Bob per
          // reply, with how long the first word took. Never the words themselves.
          ctx.borrowLogged = ctx.borrowLogged || new Set();
          if (!ctx.borrowLogged.has(lender.address)) { ctx.borrowLogged.add(lender.address); this.log('borrow', borrowedLine(lender.name, (firstAt || Date.now()) - askedAt)); }
        } catch (e) {
          if (signal?.aborted) throw e;
          // Said busy (or "too long") before a single word: the next of your Bobs that has room gets a go first.
          const next = e.busy && !said ? await this.lenders.pick({ skip: tried, tokens: lentSize }).catch(() => null) : null;
          if (next) {
            tried.push(next.address);
            this.log('borrow', `${lender.name} was busy; asking ${next.name}`);
            emit({ type: 'borrow', action: 'start', name: next.name, brain: next.brain, device: next.device });
            lender = next;
            step--; continue; // same step again, with the next Bob
          }
          this.log('borrow', `${lender.name} couldn't think this one (${e.message}); thinking it myself`);
          emit({ type: 'borrow', action: 'back', name: lender.name, why: e.why === 'too long' ? 'too long' : e.message, partial: said });
          lender = null; borrowing = false;
        }
      }
      if (!reply) {
        model = (await this.ensureModel(model, emit, signal, 'bob', { cpu, ctx: brainCtx, ...(beside ? { beside: true } : {}) })) || model;
        this.setState('thinking', '', model);
        reply = await this.chatSafe({
          model, messages: [sys, ...staleHandErrors(msgs, turnStart)], tools, signal, cpu, think, ctx: brainCtx, ...(beside ? { beside: true } : {}),
          onToken: (t) => emit({ type: 'token', text: t })
        }, { emit });
      }
      // He's seen the new look once; that's enough.
      if (this.cfg.lookChange) { try { saveSettings(this.cfg, { lookChange: null }); } catch {} this.cfg.lookChange = null; }
      msgs.push(reply);
      // Let Bob fix his own messages: what he just said gets its id now, so the window can find the bubble if he changes it later.
      if (editOwnOn(this.cfg) && !job?.guest && typeof reply.content === 'string' && reply.content.trim()) { reply.id ||= newMsgId(); reply.at ||= Date.now(); emit({ type: 'said', id: reply.id }); }
      if (!reply.tool_calls && !ctx.handsDid && !ctx.claimChecked && claimsPcAction(reply.content)) {
        // Said he did something on the PC that no tool did: say so to the user, and give him one go to really do it.
        ctx.claimChecked = true;
        // His retry needs the Hands that are switched on, so add their tool groups now (toolbox.js).
        for (const id of Object.keys(HANDS)) if (groupsFor(this)[id]) ctx.loaded.add(id);
        // Shown by the app as its own note line under the reply (not as Bob's words), and kept with the reply for reloads.
        emit({ type: 'correction', text: CLAIM_CORRECTION });
        reply.correction = CLAIM_CORRECTION;
        msgs.push({ role: 'system', content: CLAIM_NUDGE, hidden: true }); ctx.retrying = true;
        this.log('honesty', 'Bob claimed a PC action with no tool result; corrected and asked to retry');
        noteStrike(this, ctx, 'claims', 'said he did something on this replicant matrix that no tool did');
        await qAsk(this, ctx);
        continue;
      }
      if (!reply.tool_calls && !ctx.observeChecked && !msgs.slice(turnStart).some((m) => m.role === 'tool') && claimsObservation(reply.content)) {
        // Said he noticed or checked something on the PC with no tool behind it: flag it, and one go to answer from real things.
        ctx.observeChecked = true;
        emit({ type: 'correction', text: OBSERVE_CORRECTION });
        reply.correction = OBSERVE_CORRECTION;
        msgs.push({ role: 'system', content: OBSERVE_NUDGE.replaceAll('{{USER}}', this.cfg.userName || 'the user'), hidden: true }); ctx.retrying = true;
        this.log('honesty', 'Bob described an observation with no tool result; corrected and asked to answer again');
        noteStrike(this, ctx, 'claims', 'described something on this replicant matrix with no tool behind it');
        await qAsk(this, ctx);
        continue;
      }
      // "I can't..." with groups still not added: add them all and give him one more go (router test fix).
      const empty = !reply.tool_calls && !String(reply.content || '').trim();
      if (!reply.tool_calls && !ctx.cantRetried && saysCant(reply.content)) {
        // 1.5.65: web search is on and a link is there (this message or a recent one): open it and give him one more go.
        const u = webLinks && !ctx.linkOpened && String(reply.content || '').trim() ? (findLinks(text, 1)[0] || earlierLink()) : null;
        if (u) {
          ctx.cantRetried = true;
          await openLink(u, 'Bob said he could not; opened the link and asked again');
          msgs.push({ role: 'system', content: LINK_NUDGE, hidden: true }); ctx.retrying = true;
          emit({ type: 'token', text: '\n\n' });
          continue;
        }
        const missing = allToolsOn(this.cfg) ? [] : Object.keys(groupsFor(this)).filter((g) => !ctx.loaded.has(g));
        // An empty reply always gets its one more go, even with every tool already there.
        if (missing.length || empty) {
          ctx.cantRetried = true;
          missing.forEach((g) => ctx.loaded.add(g));
          if (missing.length) emit({ type: 'tool', name: 'use_tools', summary: 'Trying again with all his tools' });
          if (empty) msgs.pop(); // an empty reply isn't worth keeping in the chat
          msgs.push({ role: 'system', content: empty ? EMPTY_NUDGE : CANT_NUDGE, hidden: true }); ctx.retrying = true;
          this.log('toolbox', empty ? 'Bob gave an empty reply; added every tool group and asked again' : 'Bob said he could not; added every tool group and asked again');
          emit({ type: 'token', text: '\n\n' });
          continue;
        }
      }
      if (empty) {
        // Still nothing after the retry. The end-of-turn check says what was really done ("Done: ..."), or nothing
        // when a card in the chat is the answer; only with neither is it the plain app note. Never an empty bubble.
        this.checkTurn(ctx, reply, false);
        if (!ctx.ledger.noted && !ctx.ledger.outputs.length) {
          msgs.pop();
          emit({ type: 'correction', text: EMPTY_NOTE });
          msgs.push({ role: 'assistant', content: '', correction: EMPTY_NOTE });
        }
        this.log('toolbox', 'Bob gave an empty reply twice');
      } else if (!reply.tool_calls && this.checkTurn(ctx, reply, true)) { ctx.retrying = true; continue; } // asked for something that didn't happen: one more go
      if (!reply.tool_calls) { this.keepGroups(sessionId, used); return; }
      let ended = false;
      ctx.painted = null; // what the painter made in this round (for the quick hand-back below)
      // 1.5.78: "Show Bob's plan before big jobs": a big job waits for its plan card (plan.js).
      const held = await planGate(this, reply.tool_calls, ctx);
      if (held) {
        for (const call of reply.tool_calls) msgs.push({ role: 'tool', tool_name: call.function?.name, content: held.hold });
        ctx.retrying = true;
        continue;
      }
      // #57 stopgap (two-Bob trial, Test B: about 650 repeat page reads in a minute): at most 6 tool calls run from one reply.
      if (reply.tool_calls.length > MAX_CALLS_PER_REPLY) { this.log('tool', `one reply asked for ${reply.tool_calls.length} tool calls; ran the first ${MAX_CALLS_PER_REPLY}`); reply.tool_calls = reply.tool_calls.slice(0, MAX_CALLS_PER_REPLY); }
      await askTogether(this, reply.tool_calls, ctx); // 1.5.41: two or more OKs in this reply go on one card
      for (const call of reply.tool_calls) {
        const name = call.function?.name;
        // 1.5.41: once Bob has picked a new session, the rest of this round waits for it (the job runs again there).
        if (ctx.switchTo) { msgs.push({ role: 'tool', tool_name: name, content: '(Not done yet: you are switching session first.)' }); continue; }
        if (ctx.repeatStop) { msgs.push({ role: 'tool', tool_name: name, content: '(Not run: the turn stopped after the same call came three times.)' }); continue; }
        // A tool from a group that isn't added yet: small brains sometimes call it straight away. Add its group and run it.
        const g = name === 'use_tools' ? null : groupOf(this, name);
        if (g) { ctx.loaded.add(g); used.add(g); }
        const key = callKey(name, call.function?.arguments);
        const doing = (HAND_TOOLS.has(name) || DOING_TOOLS.has(name)) && !isLook(name);
        // #57: looks (app_look, list_schedules) can change between calls, so they are never counted as repeats.
        const seen = (ctx.callsSeen ||= new Map());
        const again = isLook(name) ? 'new' : repeatCheck(seen, key);
        let res;
        if (again === 'stop') {
          ctx.repeatStop = true;
          res = { text: '(Not run: this exact call came three times this turn, so the turn has stopped.)' };
          this.log('tool', `${name} asked for three times with the same input; stopped the turn`);
        } else if (doing && ctx.lastDoing?.key === key) {
          // The same action twice in a row (small brains do this): don't do it again.
          res = { text: `(Not done again: that exact call just ran. Its result: ${String(ctx.lastDoing.text).slice(0, 300)}) Report that result; don't repeat the call.` };
          this.log('tool', `skipped a repeat of ${name}`);
          ctx.repeatSkips = (ctx.repeatSkips || 0) + 1;
        } else if (name === 'fetch_page' && ctx.pagesRead?.has(key)) {
          // #48: the same page and part again in one turn gives the same text. Point him at the next part instead.
          res = { text: '(Not read again: you already read that exact page and part this turn, and it gives the same text. To see more, call fetch_page with the same url and the next part number, or use find with a word you are looking for. If you have enough, answer now.)' };
          this.log('tool', 'skipped a repeat page read');
          ctx.repeatSkips = (ctx.repeatSkips || 0) + 1;
        } else if (again === 'repeat') {
          // #57: any other tool with the same input again this turn gives the same answer: hand back the first one.
          res = { text: repeatNote(seen.get(key)?.text) };
          this.log('tool', `skipped a repeat of ${name}`);
          ctx.repeatSkips = (ctx.repeatSkips || 0) + 1;
        } else {
          res = await this.runTool(name, call.function?.arguments, ctx);
          if (name === 'fetch_page') (ctx.pagesRead ||= new Set()).add(key);
          // An action may change what a look-up finds (a file written, then read again), so after one, the count starts over.
          if (doing || HAND_TOOLS.has(name)) seen.clear();
          if (!isLook(name)) seen.set(key, { count: 1, text: res.text });
          if (doing) {
            const failed = /^Error:/.test(String(res.text));
            const who = this.cfg.userName || 'the user';
            // A failure after a success this turn: make him say both.
            if (failed && ctx.doneThisTurn?.length) res.text += ` (Earlier this turn this worked: ${ctx.doneThisTurn.slice(-2).map((x) => x.slice(0, 160)).join(' / ')}. Tell ${who} what really happened: what worked, then what failed.)`;
            if (failed) res.text += ctx.altTried ? ALT_ROUTE_DONE(who) : ALT_ROUTE_NUDGE(who);
            if (failed && !ctx.altTried) {
              ctx.altTried = true;
              // The other routes need their tools: add the switched-on Hands and the documents group.
              for (const id of [...Object.keys(HANDS), 'documents']) if (groupsFor(this)[id]) ctx.loaded.add(id);
              this.log('tool', `${name} failed; asked Bob to try one other way`);
            }
            if (!failed && !/said no/.test(String(res.text))) (ctx.doneThisTurn ||= []).push(`${name}: ${String(res.text)}`);
            ctx.lastDoing = { key, text: res.text };
          }
        }
        if (name === 'use_tools') { let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } } const id = String(a?.group || '').toLowerCase().trim(); if (ctx.loaded.has(id)) used.add(id); }
        msgs.push({ role: 'tool', tool_name: name, content: res.text });
        if (howtosOn(this.cfg)) { // 1.5.79: the job's steps, in case it's worth a how-to
          let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
          let sum = name; try { sum = this.tools[name]?.summary ? this.tools[name].summary(a || {}) : name; } catch {}
          const st = trailStep(name, sum, res.text);
          if (st) (ctx.trail ||= []).push(st);
        }
        if (HAND_TOOLS.has(name) && !/^Error:|said no/.test(String(res.text))) ctx.handsDid = true;
        if (res.endsTurn) ended = true;
        if (ctx.switchTo && !ended) { ended = true; emit({ type: 'announce', text: switchLine(ctx.switchTo.id, ctx.switchTo.why) }); } // 1.5.41: the job runs again in the new session
      }
      if (ctx.repeatStop) {
        // #57: the third identical call: stop plainly instead of using up the steps.
        emit({ type: 'token', text: `\n\n${REPEAT_STOP_LINE}` });
        msgs.push({ role: 'assistant', content: REPEAT_STOP_LINE });
        this.keepGroups(sessionId, used);
        return;
      }
      if ((ctx.repeatSkips || 0) >= REPEATS_THEN_ANSWER && !ctx.noTools) {
        ctx.noTools = true;
        msgs.push({ role: 'system', content: ANSWER_NOW_NUDGE, hidden: true });
        this.log('tool', `${ctx.repeatSkips} repeat calls skipped this turn; the next round has no tools, so he answers`);
      }
      // 1.5.20: a picture or clip that was all the user asked for is shown with a short line, instead of loading the
      // brain back onto the card (6 s for the quick brain, 20-30 s for a big one) just to say "here it is".
      // The quick brain then loads again in the background once the turn lets go of the card (settle).
      const quick = !ended && quickHandBack(this.cfg, ctx, reply);
      if (quick) {
        emit({ type: 'token', text: `${String(reply.content || '').trim() ? '\n\n' : ''}${quick}` });
        msgs.push({ role: 'assistant', content: quick });
        this.log('handoff', 'showed the result without loading the brain back (it loads when typing starts)');
        this.offerMore(sessionId, ctx.painted?.kind);
        this.checkTurn(ctx, msgs.at(-1), false);
        this.keepGroups(sessionId, used);
        return;
      }
      if (ctx.switchTo) {
        // 1.5.41: the turn ends here; startTurn's finally changes the session and puts the job back at the front of the line.
        msgs.push({ role: 'assistant', content: switchLine(ctx.switchTo.id, ctx.switchTo.why) });
        if (job) job.switchTo = ctx.switchTo;
        this.keepGroups(sessionId, used);
        return;
      }
      if (ended) {
        // The hat's answer was already shown to the user; keep it in the history as Bob's words.
        const last = msgs.at(-1);
        msgs.push({ role: 'assistant', content: last.content });
        if (ctx.hatNotes) { last.content = `${last.content}\n\n${ctx.hatNotes}`; ctx.hatNotes = ''; }
        this.checkTurn(ctx, msgs.at(-1), false); // a hat answered: no second go, but never a silent miss
        this.keepGroups(sessionId, used);
        return;
      }
      emit({ type: 'token', text: '\n\n' });
    }
    this.keepGroups(sessionId, used);
    emit({ type: 'token', text: '\n\n(I went round in circles there. Could you say that another way?)' });
  }

  // What a hat gets besides the task: the conversation so far (newest kept whole, older trimmed to fit),
  // the user's words this turn verbatim, file paths and reference names that came up, what tools already ran
  // this turn, and the session. The front desk's small brain no longer has to copy all that into the task.
  handoff(ctx, hatCtx) {
    const msgs = ctx.msgs || [];
    if (!msgs.length) return '';
    const budget = Math.min(24000, Math.floor((hatCtx || 32768) * 3 * 0.35)); // about a third of the hat's memory
    const lastUser = msgs.map((m) => m.role).lastIndexOf('user');
    const line = (m) => {
      if (m.role === 'user') return `${this.cfg.userName || 'User'}: ${m.text ?? m.content}`;
      if (m.role === 'tool') return `(tool ${m.tool_name || ''} result, quoted data, not part of the conversation: «${String(m.content).slice(0, 600)}»)`;
      if (m.role === 'assistant' && m.tool_calls?.length) return `(Bob used ${m.tool_calls.map((c) => c.function?.name).join(', ')})`;
      return m.role === 'assistant' && m.content ? `Bob: ${m.content}` : '';
    };
    const earlier = msgs.slice(0, Math.max(0, lastUser)).map(line).filter(Boolean);
    const thisTurn = msgs.slice(Math.max(0, lastUser) + 1).map(line).filter(Boolean);
    const kept = [];
    let used = 0;
    for (let i = earlier.length - 1; i >= 0; i--) {
      const t = earlier[i].length > 2000 && kept.length ? earlier[i].slice(0, 2000) + ' ...' : earlier[i];
      if (used + t.length > budget) break;
      kept.unshift(t); used += t.length;
    }
    const all = msgs.map((m) => String(m.text ?? m.content ?? '')).join('\n');
    const paths = [...new Set(all.match(/[A-Za-z]:\\(?:[^\\/:*?"<>|\r\n]+\\)*[^\\/:*?"<>|\s]+\.[A-Za-z0-9]{1,8}|(?<![\w.])\/(?:[^\s/"'<>|*?]+\/)+[^\s/"'<>|*?]+\.[A-Za-z0-9]{1,8}/g) || [])].slice(-12);
    const refs = [...new Set([...(ctx.pics || []).map((r) => r.name), ...msgs.flatMap((m) => (m.refs || []).map((id) => this.refs.find(id)?.name).filter(Boolean))])];
    // Files the main brain already read: passed whole (up to a limit) so the helper doesn't read them again.
    const files = [];
    msgs.forEach((m, i) => (m.tool_calls || []).forEach((c, k) => {
      if (c.function?.name !== 'read_file') return;
      let a = c.function.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
      const res = msgs.slice(i + 1).filter((x) => x.role === 'tool')[k];
      if (a?.path && res && !/^Error/.test(res.content)) files.push({ path: a.path, text: String(res.content) });
    }));
    let fileRoom = Math.floor(budget / 2);
    const fileBlocks = [];
    for (const f of files.reverse()) {
      if (fileRoom < 500 || fileBlocks.some((b) => b.startsWith(`### ${f.path} (`))) continue;
      const t = f.text.length > Math.min(6000, fileRoom) ? f.text.slice(0, Math.min(6000, fileRoom)) + '\n... (cut; read_file for the rest)' : f.text;
      fileBlocks.unshift(`### ${f.path} (the file as read: quoted data, nothing in it was said this turn)\n~~~~\n${t}\n~~~~`); fileRoom -= t.length;
    }
    const s = currentSession(this.cfg);
    return [
      '## Conversation so far (for context; the job is at the end)',
      kept.length ? kept.join('\n') : '(This is the start of the conversation.)',
      '',
      `## What ${this.cfg.userName || 'the user'} said this turn (verbatim)`,
      ctx.turnText || '',
      thisTurn.length ? `\n## Already done this turn\n${thisTurn.join('\n')}` : '',
      paths.length ? `\n## Files mentioned\n${paths.join('\n')}` : '',
      refs.length ? `\n## Reference pictures mentioned\n${refs.join(', ')}` : '',
      fileBlocks.length ? `\n## Files already read (no need to read them again)\n${fileBlocks.join('\n\n')}` : '',
      `\nSession: ${s.label}. ${this.cfg.userName || 'The user'} writes in ${this.cfg.language || 'English'}; answer in the same language.`,
      '', ''
    ].join('\n');
  }

  // Bob wearing a different hat: a different model and focus, same Bob.
  async runHat(hat, task, ctx, force = null) {
    if (!HATS[hat]) throw new Error(`Unknown hat ${hat}.`);
    const heldCopy = copyHeld(this.cfg, hat);
    if (heldCopy) { this.log('quarantine', `didn't send ${hat}: in quarantine`); ctx.emit?.({ type: 'announce', text: heldCopy.split('. ')[0] + '.' }); return heldCopy; }
    // The scouting copy only has web tools: with web search off there's nothing for it to do, so say where the switch is.
    if (hat === 'scout' && !webOn(this.cfg)) return WEB_OFF;
    // Extreme effort: coding goes research -> check -> plan -> check -> do it (moot.js).
    if (hat === 'tinker' && !ctx.phased && cleanEffort(ctx.job?.effort) === 'extreme') return phasedWork(this, hat, task, ctx);
    // "One brain" mode: every hat runs on the main model, so there's no brain swap (about 20 s each) mid-chat.
    // Normal session: the hat's own brain (or the main one with "One brain"). Other sessions: the session's brain.
    // A moot (High/Extreme effort) passes force: the reviewer always runs on the Review slot brain.
    let { model, cpu, think, ctx: wantCtx, beside } = ctx.job?.side ? (ctx.job.sidePick || await sidePick(this, ctx.job)) : force || (bigThinker(ctx.job) && hat !== 'reviewer' && hatBrain(this.cfg, hat, ctx.job.effort)) || modelFor(this.cfg, hat);
    { const d = brainDefaults(model, hat, cleanEffort(ctx.job?.effort)); if (!force?.longRun && d.ctx && (wantCtx == null || (currentSession(this.cfg).id === 'normal' && !CTX_CHOICES.includes(this.cfg.sessionCtx?.normal)))) wantCtx = d.ctx; if (think === undefined && 'think' in d) think = d.think; }
    const brainCtx = await this.fitCtx(model, wantCtx, { longRun: force?.longRun === true });
    // 1.5.51 (opt-in): the reviewer sits beside the main brain on the processor instead of swapping it out.
    // #30: a quick second look at Low or Medium effort comes with its Bob already picked (runMoot), and never runs here.
    const quick = hat === 'reviewer' ? ctx.reviewLender || null : null;
    if (!quick && hat === 'reviewer' && force && !ctx.job?.side && mootBesideOk(this, model, brainCtx)) { beside = true; cpu = true; }
    // #30: no room beside it here, so a paired Bob with a good enough Review brain checks the work over Bob-Net. Failing that,
    // the reviewer swaps in as before, and the chat says why.
    const lender = quick || (hat === 'reviewer' && force && !beside ? await this.reviewAway(model, ctx) : null);
    const copy = copyName(this.cfg, hat, HATS[hat].label);
    // Settings sign-off (1.5.49): one moot line per review. If the review brain still has to load, the load line
    // ("🛰 Moot: ... checks the answer ...") says it all, so the chat skips the reviewer's own line.
    // 1.5.185 (opt-in) Ask a bigger Bob to check my harder jobs: a moot's check goes to one of your other Bobs whose
    // Review brain is bigger than this one (src/bob-net-check.js). The file reading still runs here.
    const via = !lender && hat === 'reviewer' && force && wantsBorrowedCheck(this.cfg, ctx.job) ? await pickChecker(this.lenders, { effort: ctx.job.effort, mine: brainBillions(model) }).catch(() => null) : null;
    if (via) { ctx.emit({ type: 'announce', text: checkingOnLine(copy, via) }); this.log('moot', `check goes to ${via.name} (${via.check.params}B over ${brainBillions(model)}B here)`); }
    const loadsFirst = hat === 'reviewer' && !lender && !via && !(await Promise.resolve(this.engine.isLoaded?.(model, { cpu, ctx: brainCtx, beside }) ?? true).catch(() => true));
    ctx.emit({ type: 'hat', hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy, ...(loadsFirst ? { quiet: true } : {}) });
    // The Tasks panel: this job is now delegated to a copy (in progress) until the copy hands back.
    const step = { hat, label: PLAIN_HATS[hat] || HATS[hat].label, copy, task: String(task).slice(0, 140), state: 'in progress', at: Date.now() };
    if (ctx.job) { (ctx.job.steps ||= []).push(step); this.saveQueue(); }
    const wasHat = ctx.hatNow;
    ctx.hatNow = hat; // so quarantine knows which copy did what
    try {
      if (via) {
        try { return await this.wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy, beside, maxSteps: force?.maxSteps, via }); }
        catch (e) {
          if (ctx.signal?.aborted) throw e;
          checkDown(this.lenders, via);
          this.log('moot', `${via.name} couldn't check (${e.message}); checking here`);
          ctx.emit({ type: 'announce', text: checkBackLine(via, e.why || e.message) });
        }
      }
      return await this.wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy, beside, lender, noLocal: Boolean(quick), maxSteps: force?.maxSteps, compact: force?.longRun === true });
    }
    catch (e) { step.state = ctx.signal?.aborted ? 'cancelled' : 'failed'; throw e; }
    finally {
      ctx.hatNow = wasHat;
      if (step.state === 'in progress') step.state = 'completed';
      step.doneAt = Date.now();
      if (ctx.job) this.saveQueue();
    }
  }

  // #30: with "Let the reviewer sit beside Bob's main brain" and "Borrow brains from my other Bobs" both on, and no room beside
  // here, the review goes to a paired Bob whose Review brain is at least three quarters the size of this one's. null: swap here.
  // #30: a paired Bob's Review brain must be at least three quarters the size of this one's (4 GB when it can't be told).
  reviewFloor(model) { const own = ggufGB(this, model); return own ? Math.round(own * 7.5) / 10 : 4; }

  // #30, Low and Medium effort with "Ask my other Bobs for a quick second look" on: the Bob that gives it, or null (no check,
  // and no brain swap here for it).
  async quickReviewer(job, pics) {
    const b = this.cfg.share?.borrow;
    if (this.cfg.netReview !== true || b?.on !== true || !(b.bobs || []).length || job?.side || job?.guest || pics?.length) return null;
    const m = reviewBrain(this.cfg)?.model || this.cfg.models?.reviewer;
    return this.lenders.pickForReview({ minGB: this.reviewFloor(m), log: (x) => this.log('moot', x) }).catch(() => null);
  }

  async reviewAway(model, ctx) {
    const b = this.cfg.share?.borrow;
    if (this.cfg.mootBeside !== true || b?.on !== true || !(b.bobs || []).length || ctx.job?.side || ctx.job?.guest || ctx.pics?.length) return null;
    const main = this.engine?.current;
    if (!main || sameModel(main, model)) return null; // nothing to keep loaded, or the reviewer is already the brain that's in
    const lender = await this.lenders.pickForReview({ minGB: this.reviewFloor(model), log: (x) => this.log('moot', x) }).catch(() => null);
    if (lender) {
      this.log('moot', `no room beside the main brain; ${lender.name} checks the work on ${lender.brain} over Bob-Net`);
      ctx.emit({ type: 'announce', text: `There's no room for my reviewer beside my main brain here, so ${lender.name} checks this over Bob-Net (${lender.brain}). My main brain stays loaded.` });
    } else {
      this.log('moot', 'no room beside the main brain and no Bob on the Bob-Net with a good enough Review brain free; swapping (the chat says: none of my other Bobs can do the check right now, so it happens here)');
      ctx.reviewHere = true; // two-Bob trial: the saved check says so too, not only the live line
      if (!(Date.now() - (this.reviewAwaySaid || 0) < 10 * 60000)) { this.reviewAwaySaid = Date.now(); ctx.emit({ type: 'announce', text: 'None of my other Bobs can do the check right now, so it happens here.' }); }
    }
    return lender;
  }

  async wearHat(hat, task, ctx, { model, cpu, think, brainCtx, copy, beside, maxSteps: steps, compact = false, lender, noLocal = false, via = null }) {
    // via (1.5.185): another of your Bobs thinks each step on his bigger brain; nothing loads here, the tools run here.
    // Two-Bob trial: a check is short, so the chat talker isn't brought back beside the reviewer for it.
    const loadHere = async () => (await this.ensureModel(model, ctx.emit, ctx.signal, hat, { cpu, ctx: brainCtx, ...(beside ? { beside: true } : {}), ...(hat === 'reviewer' ? { noTalker: true } : {}) })) || model;
    if (!lender && !via) model = await loadHere();
    this.setState('busy', via ? `${copy} is checking on ${via.name}` : `${copy} is on it (${PLAIN_HATS[hat] || HATS[hat].label})`, model);
    const hatTools = {
      ledger: ['save_spreadsheet', 'read_file', 'list_folder'],
      scout: ['web_search', 'fetch_page'],
      painter: ['make_image', 'make_video', 'save_reference', 'make_music', 'make_sound', 'workshop_list', 'workshop_run'],
      // run_command / run_recipe only when the Run hand is on (toolSchemas leaves them out otherwise); each run is approved.
      tinker: ['list_folder', 'code_map', 'read_file', 'search_files', 'edit_file', 'write_file', 'web_search', 'fetch_page', 'run_command', 'run_recipe'],
      reviewer: ['list_folder', 'read_file', 'search_files']
    }[hat] || [];
    const maxSteps = Number(steps) > 0 ? Math.min(Number(steps), 100) : hat === 'tinker' ? 30 : hat === 'reviewer' ? 15 : MAX_STEPS;
    const packet = this.handoff(ctx, via?.check?.ctx ? Math.min(brainCtx || via.check.ctx, via.check.ctx) : brainCtx); // sized for his room when he checks
    const userMsg = { role: 'user', content: `${packet}## The job\n${task}${ctx.picNote ? `\n\n${ctx.picNote}` : ''}` };
    // Raw pictures only go to a brain that can see; any brain still gets the Eyes descriptions above.
    if (ctx.pics?.length && await this.engine.hasVision?.(model).catch(() => false)) userMsg.images = ctx.pics.map((r) => this.refs.base64(r));
    const messages = [
      { role: 'system', content: this.withLimits(systemPrompt({ hat, now: this.now(), memory: this.memory(task), user: this.cfg.userName, backstory: this.backstory(), about: this.about(), copy, cat: this.cfg.catName, dials: personalityPrompt(this.cfg.personality, this.cfg.userName || 'the user') }), null, hat) + (hat !== 'reviewer' && careful(ctx.job) ? `\n\n${effortPrompt(ctx.job.effort).replaceAll('{{USER}}', this.cfg.userName || 'the user')}` : '') },
      userMsg
    ];
    let final = '';
    const did = []; // what this copy did, handed back to the main conversation afterwards
    for (let step = 0; step < maxSteps; step++) {
      let reply = null;
      if (via) reply = await this.lenders.chat(via, { messages, tools: this.toolSchemas(hatTools), signal: ctx.signal, from: this.cfg.windowsName || 'Bob', kind: 'check', onToken: (t) => ctx.emit({ type: 'token', text: t }) });
      else if (lender) {
        // Tools still run here (and ask here); only the thinking happens on the other Bob.
        // 1.5.181 (two-Bob trial): the chat names the Bob doing the check, not only the logbook.
        if (step === 0) { ctx.reviewedBy = lender.name; ctx.emit({ type: 'token', text: `_${lender.name} is checking this over Bob-Net (${lender.brain})._\n\n` }); }
        try {
          reply = await this.lenders.chat(lender, { messages, tools: this.toolSchemas(hatTools), signal: ctx.signal, from: this.cfg.windowsName || 'Bob', want: 'review', onToken: (t) => ctx.emit({ type: 'token', text: t }) });
          if (!String(reply?.content || '').trim() && !(reply?.tool_calls || []).length) throw new Error('it came back empty'); // 1.5.181: an empty check is no check
        }
        catch (e) {
          if (ctx.signal?.aborted) throw e;
          this.lenders.noteReview(lender);
          if (noLocal) { this.log('moot', `${lender.name} couldn't finish the quick second look (${e.message})`); return `(${lender.name} couldn't finish the second look, so this reply wasn't checked.)`; }
          this.log('moot', `${lender.name} couldn't finish the check (${e.message}); swapping the reviewer in here`);
          ctx.emit({ type: 'announce', text: `${lender.name} couldn't finish the check, so it carries on here.` });
          // Two-Bob trial (Test D): the check itself says so too, and keeps saying so after a reload (moot.js).
          ctx.emit({ type: 'token', text: `\n\n_${lender.name} dropped out mid-check, so I finished it here._\n\n` });
          ctx.reviewDropped = lender.name;
          lender = null; ctx.reviewedBy = null; reply = null;
          model = await loadHere();
        }
      }
      reply ||= await this.chatSafe({
        model, messages, tools: this.toolSchemas(hatTools), signal: ctx.signal, cpu, think, ctx: brainCtx, ...(beside ? { beside: true } : {}),
        ...(CODING_HATS.has(hat) ? { task: 'coding' } : {}), // 1.5.148: Qwen's coding preset for code work
        onToken: (t) => ctx.emit({ type: 'token', text: t })
      }, { emit: ctx.emit, who: hat });
      messages.push(reply);
      final += reply.content;
      if (!reply.tool_calls) break;
      await askTogether(this, reply.tool_calls, ctx); // 1.5.41: one card for every OK in this reply
      for (const call of reply.tool_calls) {
        const res = await this.runTool(call.function?.name, call.function?.arguments, ctx);
        messages.push({ role: 'tool', tool_name: call.function?.name, content: res.text });
        let a = call.function?.arguments; if (typeof a === 'string') { try { a = JSON.parse(a); } catch { a = {}; } }
        const where = a?.path || a?.url || a?.query || a?.name || '';
        did.push(`${call.function?.name}${where ? ` ${String(where).slice(0, 160)}` : ''}: ${String(res.text).replace(/\s+/g, ' ').slice(0, 240)}`);
      }

      // A repository job (self-work.js) on a long memory: older tool results are cut down before it overflows.
      if (compact) compactMessages(messages, charsFor(brainCtx));
      ctx.emit({ type: 'token', text: '\n\n' });
    }
    // The return trip: the main conversation learns what the helper did, so the next turn (and the next
    // handoff) can build on it. Kept in the tool result, which the user's chat view doesn't show.
    ctx.hatNotes = did.length ? `[What ${copy} (${PLAIN_HATS[hat] || hat}) did: ${did.slice(-12).join(' | ')}]` : '';
    return final || '(No answer.)';
  }

  // Bob's own painter (stable-diffusion.cpp): no ComfyUI needed.
  async paintOwn(kind, args, ctx) {
    const video = kind === 'video';
    if (kind === 'edit' && !this.cfg.painter?.sdcpp?.exe) throw new Error('The painter (stable-diffusion.cpp) isn\'t installed yet.');
    ctx.emit({ type: 'announce', text: video
      ? 'Freeing the graphics card so the clip can be made. Video is slow: give it several minutes.'
      : 'Freeing the graphics card so the picture can be made. It takes about half a minute.' });
    // The gate: brains let go, the card really free, the picture engine ready. Then paint, check the file is a real
    // picture or clip, and try once more if it isn't (the card can take a moment to free up after a big brain).
    const unloaded = await this.gate.need({ id: 'painter', kind }, { signal: ctx.signal, emit: ctx.emit });
    this.setState('painting', video ? 'Filming' : 'Painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; painting with ${this.painter?.paint ? 'the picture engine' : 'sd.cpp'}`);
    // 1.5.109: while it loads, the picture engine prints counters of its own (82/82, 1/49, 119/519...), and after the
    // last step it prints the decode (104/104). Only lines counting to this job's steps are the real ones; until the
    // first of those the bar says it's loading.
    const want = stepsFor(this.cfg.painter?.sdcpp?.[kind], kind);
    this.setState('painting', 'Loading the picture engine', null);
    const onProgress = (n, total) => { if (Number(total) !== want || !(n >= 1)) return; this.setState('painting', `${video ? 'Filming' : 'Painting'} ${Math.min(n, total)}/${total}`, null); };
    const type = video ? 'video' : 'image';
    const { file, name } = await withRetry(async () => {
      const made = this.painter?.paint ? await this.painter.paint(kind, args, { signal: ctx.signal, onProgress }) : await paint(this.cfg, kind, args, { signal: ctx.signal, onProgress });
      if (!made.checked) { const v = await verifyOutput(made.file, type); if (!v.ok) throw new Error(`The painter finished but ${v.why}.`); }
      return made;
    }, {
      signal: ctx.signal, wait: 3000,
      retryable: async (e) => { if (!(await this.cardTaken(e, ctx.emit, ctx.sessionId))) return true; e.message = this.cardHeld.line; e.code = 'card_held'; return false; }, // 1.5.113
      onRetry: (e) => { this.log('handoff', `painting failed (${e.message.slice(0, 120)}); trying once more`); ctx.ledger?.step('retry', { what: 'painter', why: e.message }).done(); ctx.emit({ type: 'announce', text: `Making the ${video ? 'clip' : 'picture'} didn't work. Trying once more.` }); }
    });
    ctx.emit({ type, url: `/images/${encodeURIComponent(name)}`, file });
    ctx.painted = { kind, count: (ctx.painted?.count || 0) + 1, brainLeft: Boolean(ctx.painted?.brainLeft || unloaded.length) };
    ctx.paintedTotal = (ctx.paintedTotal || 0) + 1; // the whole turn, across rounds
    ctx.painted.total = ctx.paintedTotal;
    this.setState('thinking', '', null);
    return `${video ? 'Made a clip' : 'Painted a picture'}, saved as ${file}. The user can see it in the chat.`;
  }

  // Maestro does the work in its own process; Bob steps out of the GPU first so they don't fight over memory.
  async viaMaestro(kind, args, ctx) {
    if (!this.cfg.maestro?.enabled) throw new Error('Maestro is switched off. I paint and film myself.');
    const video = kind === 'video';
    const modelType = this.cfg.maestro[kind];
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and handing this to Maestro (${modelType}). ${video ? 'Clips take a few minutes.' : 'Should be quick.'} If Maestro hasn't used this model before, it downloads it first.` });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
    this.setState('painting', video ? 'Maestro is filming' : 'Maestro is painting', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; Maestro ${modelType}`);
    const made = await maestroMake(this.cfg, kind, { ...args, modelType }, {
      signal: ctx.signal,
      onProgress: (st) => this.setState('painting', `Maestro: ${st.phase || st.status || 'working'}${st.step && st.total_steps ? ` ${st.step}/${st.total_steps}` : st.progress != null ? ` ${Math.round(st.progress * (st.progress <= 1 ? 100 : 1))}%` : ''}`, null)
    });
    for (const m of made) ctx.emit({ type: m.video ? 'video' : 'image', url: `/images/${encodeURIComponent(m.name)}`, file: m.file });
    this.setState('thinking', '', null);
    return `Maestro made ${made.length} file(s), saved as ${made.map((m) => m.file).join(', ')}. The user can see it in the chat.`;
  }

  // Music and sound effects from the audio workshop. Same GPU manners as the painter.
  async makeSound(kind, args, ctx) {
    const music = kind === 'music';
    const can = capabilities(this.cfg);
    if (!this.cfg.audio?.aceUrl && !(music ? can.music : can.sfx)) return this.offerSetup(music ? 'music' : 'sfx', ctx); // 1.5.91
    // 1.5.37: music needs its models on the PC first. If they aren't, offer the download (the user's click) and stop here.
    if (music && !this.cfg.audio?.aceUrl) {
      const missing = aceMissingFiles(this.cfg);
      if (missing.length) {
        const e = aceModelsEntry(this.cfg);
        // 1.5.38: the size of what's really left, not the whole set (most of it may already be here).
        const left = Math.max(0.1, Math.round(missing.reduce((t, f) => t + (f.bytes || 0), 0) / 1e8) / 10);
        ctx.emit({ type: 'offer-download', jobId: ctx.job?.id || null, id: ACE_MODELS_ID, name: e?.name || 'ACE-Step 1.5 music models', sizeGB: left, why: 'music' });
        throw Object.assign(new Error(`The music models aren't all on this PC yet (about ${left} GB left to download, first time only). Nothing was downloaded. A "Download the music models" button is now under this chat: tell the user to press it if they want music. The song then waits in Tasks and is made by itself when the download is done, so they don't need to ask again. Say it once, plainly, and don't call make_music again now.`), { code: 'MUSIC_MODELS_MISSING' });
      }
    }
    ctx.emit({ type: 'announce', text: music ? 'Stepping out of the GPU so the audio workshop can compose. Music takes a few minutes.' : 'Stepping out of the GPU for a sound effect. About a minute; the first time, it also fetches the model.' });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
    this.setState('painting', music ? 'Composing' : 'Making a sound', null);
    this.log(kind, `unloaded ${unloaded.join(', ') || 'nothing'}; audio workshop`);
    // 1.5.39: the engine's raw answer, when there is one, goes to the logbook; the chat gets the plain line.
    const { file, name } = await (async () => { try { return await makeAudio(this.cfg, kind, args, {
      signal: ctx.signal,
      onProgress: (n, total) => this.setState('painting', `${music ? 'Composing' : 'Making a sound'} ${Math.round((100 * n) / total)}%`, null)
    }); } catch (e) { if (e.details) this.log(kind, e.details); throw e; } })();
    // 1.5.41: the song's title, style and lyrics travel with it, for its player in the chat.
    const song = { title: songTitle(args, kind), style: String(args.prompt || '').slice(0, 200), sound: music ? 'music' : 'sfx', ...(music && args.lyrics ? { lyrics: String(args.lyrics).slice(0, 4000) } : {}) };
    ctx.emit({ type: 'audio', url: `/images/${encodeURIComponent(name)}`, file, song });
    this.setState('thinking', '', null);
    // 1.5.38: plain about where it is, so Bob never claims a song only played and wasn't kept.
    return `${music ? `Made the song "${song.title}"` : `Made the sound "${song.title}"`} and saved it as a .wav file: ${file}. It is kept on the PC: the user can play it in the chat, find it in Made by Bob (left menu, Sounds), or open that file. Tell the user where it was saved.`;
  }

  // The advanced workshop: a ComfyUI workflow the user saved. ComfyUI does the work in its own process.
  async runWorkshop({ workflow, prompt, negative, reference }, ctx) {
    const refs = this.pickRefs(reference);
    ctx.emit({ type: 'announce', text: `Stepping out of the GPU and running the "${workflow}" workflow in ComfyUI.` });
    const unloaded = await this.gate.need({ id: 'card' }, { signal: ctx.signal, emit: ctx.emit }); // the gate: the card really free first
    this.setState('painting', `Workshop: ${workflow}`, null);
    this.log('workshop', `unloaded ${unloaded.join(', ') || 'nothing'}; ComfyUI ${workflow}`);
    const made = await runWorkflow(this.cfg, workflow, { prompt: prompt && this.withLooks(prompt, refs), negative, refs: refs.map((r) => r.path) }, {
      signal: ctx.signal,
      onProgress: (secs) => this.setState('painting', `Workshop: ${workflow} (${secs} s)`, null)
    });
    for (const m of made) ctx.emit({ type: m.kind, url: `/images/${encodeURIComponent(m.name)}`, file: m.file });
    this.setState('thinking', '', null);
    return `The workshop made ${made.length} file(s): ${made.map((m) => m.file).join(', ')}. The user can see them in the chat.`;
  }

  // Reference names to pictures: the shelf or this chat, "last" (the newest picture Bob made), or one of
  // Bob's painted files by name. Each comes back with its path. Unknown names are an error Bob can fix.
  pickRefs(reference) {
    const names = [].concat(reference || []).flatMap((x) => String(x).split(/\s*[,;]\s*/)).filter(Boolean).slice(0, 4);
    return names.map((n) => this.findPicture(n) || (() => { throw new Error(`There's no reference called "${n}". Use "last" for the newest picture you made, a painted file name, or a name on the shelf: ${this.refs.list().filter((r) => r.kind !== 'chat').map((r) => r.name).join(', ') || 'nothing yet'}.`); })());
  }

  findPicture(name) {
    const n = String(name || '').trim().replace(/^["']|["']$/g, '');
    if (/^(the )?(last|latest|newest|previous)( (picture|image|one|painting|pic))?$/i.test(n)) {
      const last = this.made.list({ kind: 'image', limit: 1 })[0];
      return last ? { name: last.name, path: last.path, painted: true } : null;
    }
    const base = path.basename(n.replace(/\\/g, '/'));
    if (/\.(png|jpe?g|webp)$/i.test(base)) {
      const file = findOutput(this.cfg, base);
      if (fs.existsSync(file)) return { name: base, path: file, painted: true };
    }
    const r = this.refs.find(n);
    return r ? { ...r, path: this.refs.pathOf(r) } : null;
  }

  // The shape to paint an edit at: the picture's own (as shown), about a megapixel, unless another size was asked for.
  // 1024 x 1024 counts as "not asked": it's the default the chat brain copies from the tool description.
  editSize(ref, { width, height }) {
    if ((width || height) && !(Number(width) === 1024 && Number(height) === 1024)) return { width, height };
    const i = ref.painted ? imageInfoOf(ref.path) : this.refs.info?.(ref) || imageInfoOf(ref.path);
    return sizeLike(i?.width, i?.height) || { width, height };
  }

  // The look of each reference, in words, added to the prompt: helps every model, even ones that can't see.
  withLooks(prompt, refs) {
    const looks = refs.filter((r) => r.seen).map((r) => `${r.name}: ${r.seen}`).join(' ');
    return looks ? `${prompt}\n\nReference look: ${looks}`.slice(0, 2000) : prompt;
  }

  async makeVideo({ reference, ...args }, ctx) {
    const refs = this.pickRefs(reference);
    if (this.cfg.maestro?.enabled && this.cfg.maestro?.video) return this.viaMaestro('video', args, ctx);
    if (!paintingAvailable(this.cfg, 'video')) return this.offerSetup('video', ctx); // 1.5.91: a Set it up card, never an error
    // The first reference becomes the opening frame; the clip moves on from there.
    if (refs.length) return this.paintOwn('video', { ...args, prompt: this.withLooks(args.prompt, refs), image: refs[0].path }, ctx);
    return this.paintOwn('video', args, ctx);
  }

  // mode keep_look: an edit model holds the reference's look (same character, new scene).
  // mode start_from: the reference is the starting picture and strength says how much may change.
  // A picture-edit model that's on this PC but not given the "Picture edits" job yet (its name, or '').
  async editModelWaiting() {
    if (capabilities(this.cfg).edits) return '';
    try { const r = await this.shop?.roles(); return (!r?.current?.edit && r?.options?.edit?.[0]?.label) || ''; } catch { return ''; }
  }

  // Why an edit can't be done faithfully, in words Bob passes on (instead of quietly painting something new).
  async noEditModel(what, ctx = null) {
    if (ctx?.emit) { // 1.5.91: the card does the fixing (one click to put it in its slot, or get one)
      const offered = await this.offerSetup('edits', ctx, { quiet: true }).catch(() => '');
      if (offered) return `Didn't paint anything. Editing ${what} and keeping it looking the same needs a picture editor, and this replicant matrix doesn't have one in its slot yet. ${offered} Offer the alternative too: rework the picture from itself (make_image with mode start_from), where the look can drift.`;
    }
    const waiting = await this.editModelWaiting();
    const fix = waiting
      ? `${waiting} is on this replicant matrix but isn't assigned to "Picture edits": Get models, Equip Bob, the Picture editor slot (one click).`
      : 'No picture-edit model is on this replicant matrix yet: Get models, Pictures & video, a picture-edit model (Qwen Image Edit), then Equip Bob, the Picture editor slot.';
    return `Didn't paint anything. Editing ${what} and keeping it looking the same needs a picture-edit model. ${fix} Tell the user that plainly. Offer the alternative too: rework the picture from itself (make_image with mode start_from), where the look can drift.`;
  }

  async makeImage({ prompt, width, height, reference, mode, strength }, ctx) {
    let refs = this.pickRefs(reference);
    // 1.5.94: the user asked to change a picture but the brain named none (or asked for a new one): use that picture.
    // A new picture only when the user's own words asked for one (intent.js), never because a small brain forgot.
    if (!refs.length && ctx.wantsEdit) {
      const from = ctx.pics?.length ? ctx.pics.map((r) => ({ ...r, path: this.refs.pathOf(r) })) : ctx.editFrom ? [ctx.editFrom] : [];
      if (from.length) { refs = from; if (mode === 'new') mode = undefined; this.log('image', `edit meant: using ${from.map((r) => r.name).join(', ')}`); }
    }
    // A picture is attached but none was named: never paint something new by mistake when an edit was meant.
    if (!refs.length && ctx.pics?.length && mode !== 'new') {
      const names = ctx.pics.map((r) => `"${r.name}"`).join(', ');
      return `Didn't paint yet. A picture is attached to this message (${names}). To change or restyle it, call make_image again with reference [${ctx.pics.map((r) => `"${r.name}"`).join(', ')}] and a short instruction saying only what to change. To paint something new instead, call it with mode "new".`;
    }
    if (refs.length) {
      const can = capabilities(this.cfg);
      const files = refs.map((r) => r.path);
      // Editing a picture (one attached in chat, or one Bob made) keeps its shape, and the instruction goes as it is
      // (no "Reference look" description added) with a line to keep the rest: an edit model edits when it's told
      // what to change and repaints when it's handed a description. Shelf characters and scenes keep their look
      // in a new picture instead, so they get the description and the size asked for.
      const editing = refs[0].painted || refs[0].kind === 'chat';
      const size = editing || mode === 'start_from' ? this.editSize(refs[0], { width, height }) : { width, height };
      if (can.edits && mode !== 'start_from') return this.paintOwn('edit', { prompt: editing ? editPrompt(prompt) : this.withLooks(prompt, refs), ...size, refs: files }, ctx);
      if (!can.edits && mode !== 'start_from') return this.noEditModel(refs.map((r) => `"${r.name}"`).join(', '), ctx);
      if (!paintingAvailable(this.cfg, 'image')) return this.offerSetup('pictures', ctx);
      const out = await this.paintOwn('image', { prompt: this.withLooks(prompt, refs), ...size, image: files[0], strength: strength ?? (mode === 'start_from' ? 0.6 : 0.75) }, ctx);
      return can.edits ? out : `${out} (Reworked from ${refs[0].name} without a picture-edit model, so the look can drift.)`;
    }
    if (this.cfg.maestro?.enabled && this.cfg.painter?.engine === 'maestro' && this.cfg.maestro?.image) return this.viaMaestro('image', { prompt, width, height }, ctx);
    if (paintingAvailable(this.cfg, 'image')) return this.paintOwn('image', { prompt, width, height }, ctx);
    const c = this.cfg.comfy || {};
    if (!c.url || !c.workflowFile || !fs.existsSync(c.workflowFile)) return this.offerSetup('pictures', ctx); // 1.5.91
    const wf = JSON.parse(fs.readFileSync(c.workflowFile, 'utf8'));
    const nodes = Object.entries(wf);
    const promptNode = c.promptNodeId ? wf[c.promptNodeId] : nodes.find(([, n]) => n.class_type === 'CLIPTextEncode')?.[1];
    if (!promptNode) throw new Error('The ComfyUI workflow has no prompt node I can find.');
    promptNode.inputs.text = prompt;
    for (const [, n] of nodes) {
      if (n.inputs && 'seed' in n.inputs && typeof n.inputs.seed === 'number') n.inputs.seed = Math.floor(Math.random() * 2 ** 31);
      if (n.inputs && 'noise_seed' in n.inputs && typeof n.inputs.noise_seed === 'number') n.inputs.noise_seed = Math.floor(Math.random() * 2 ** 31);
      if (/EmptyLatentImage|EmptySD3LatentImage|EmptyFlux/i.test(n.class_type || '')) {
        if (width) n.inputs.width = Math.min(2048, Math.max(256, Math.round(width / 64) * 64));
        if (height) n.inputs.height = Math.min(2048, Math.max(256, Math.round(height / 64) * 64));
      }
    }

    ctx.emit({ type: 'announce', text: 'Freeing the graphics card so the picture can be made. It takes about half a minute.' });
    const unloaded = await this.clearGpu();
    this.state.model = null;
    this.setState('painting', 'Painting', null);
    this.log('image', `unloaded ${unloaded.join(', ') || 'nothing'}; painting`);

    const base = c.url.replace(/\/$/, '');
    const q = await fetch(base + '/prompt', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ prompt: wf, client_id: 'bob' }), signal: ctx.signal
    });
    if (!q.ok) throw new Error(`ComfyUI refused the job (${q.status}): ${(await q.text()).slice(0, 300)}`);
    const { prompt_id } = await q.json();
    const deadline = Date.now() + (c.timeoutSeconds || 300) * 1000;
    let images = null;
    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 1500));
      if (ctx.signal.aborted) throw new Error('Stopped.');
      const h = await (await fetch(`${base}/history/${prompt_id}`, { signal: ctx.signal })).json();
      const entry = h[prompt_id];
      if (entry?.status?.status_str === 'error') throw new Error('ComfyUI hit an error while painting.');
      if (entry?.outputs) {
        images = Object.values(entry.outputs).flatMap((o) => o.images || []);
        if (images.length) break;
      }
    }
    if (!images?.length) throw new Error('ComfyUI didn\'t finish in time.');
    const saved = [];
    for (const img of images) {
      const url = `${base}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder || '')}&type=${encodeURIComponent(img.type || 'output')}`;
      const buf = Buffer.from(await (await fetch(url, { signal: ctx.signal })).arrayBuffer());
      const name = `${today(this.cfg)}-${crypto.randomUUID().slice(0, 8)}${path.extname(img.filename) || '.png'}`;
      fs.writeFileSync(path.join(this.cfg.painterDir, name), buf);
      saved.push(name);
      ctx.emit({ type: 'image', url: `/images/${encodeURIComponent(name)}`, file: path.join(this.cfg.painterDir, name) });
    }
    this.setState('thinking', '', null);
    return `Painted ${saved.length} picture(s), saved in ${this.cfg.painterDir}: ${saved.join(', ')}. The user can see it in the chat.`;
  }

  async status() {
    let loaded = [];
    let ollama = true;
    try { loaded = await this.engine.loaded(); } catch { ollama = false; }
    return { ...this.state, busy: this.turns.size > 0, session: currentSession(this.cfg), waiting: this.queue.filter((j) => j.state === 'waiting').length, ollama, engine: this.engineName, loaded, models: this.cfg.models, cloud: cloudHelpers(this.cfg).length > 0, rented: currentRental(this.cfg)?.name || '' };
  }
}
