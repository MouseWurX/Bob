// Bob's own engine: runs llama.cpp's llama-server.exe himself, one model at a time.
// Same interface as the Ollama client, so the brain doesn't care which engine is in use.
// Models are found by Ollama name in Ollama's model folder (no duplicate downloads), or set by path in config.
import { learnPer, promptChars, perFor } from './token-count.js';
import { perWordFor, perWordWords, sendPerWord } from './experts-per-word.js'; // Brain Engine 0013
import { replyStats } from './speed-stats.js';
import fs from 'node:fs';
import { commandLineOf } from './util.js';
import { saveNameOf, idFolderFile } from './models.js';
import path from 'node:path';
import os from 'node:os';
import { spawn, execFile, spawnSync } from 'node:child_process';
import { tidySchema } from './toolbox.js';
import { templateFor, samplingFor, replyTokens, familyOf, thinkKwargs } from './model-family.js';
import { gaming, LONG_CODER } from './sessions.js';
import { gamingCard, decideCard, readCard, CARD_BUSY_PCT, CARD_MIN_FREE_MB } from './gaming-card.js';
import { tuning, cpuPlan, startDir, startFile, promptHash, tidyStarts, cardGB } from './tuning.js';
import { chatPlacesOn, placesDir, placeFile, tidyPlaces, tmpFile, placeKey, ownEnv, diskRoom, ramCacheMiB, PLACE_IDLE_MS } from './chat-places.js'; // Per-chat engine cache (on unless switched off)
import { exeName } from './platform.js';
import { buildMatches, brainEngineName, brainEngineBuild } from '../public/engine-name.js';
import { hotArgs, RANKING_ENV, parseCacheLog } from './hot-experts.js'; // Nov 16: hot experts on the card (opt-in)
import { Embedder } from './embedder.js';
import { ggufInfo } from './gguf.js';
import { placeArgs } from './brain-place.js';
import { selfWorkOn } from './self-work.js';
import { stretchOn, stretchMax as stretchMost, stretchPlan, yarnArgs, needBytes, roomBytes, kvBytes } from './model-ctx.js';
import { scutEnv, linkEnv, linkLive } from './share-card.js'; // SCUT, the fast link to lent cards
import { LinkLog } from './link-log.js'; // what the link to a lent card carried, kept in a file and the logbook
import { safeSpawn, fallBackIfBlocked } from './engine-blocked.js'; // 1.5.203: Windows blocking a new engine
import { apuNeed, apuPlace, apuKeepBytes, nextStep, stepWords } from './apu-fit.js'; // Nov 12: brains on built-in graphics, sized honestly
import { profileFor as guppiProfileFor, pcNow as guppiPcNow } from './guppi-profile.js'; // Nov 26 GUPPI calibrates this PC (Settings, Engine tuning)
import { conductorOn, conductorPicked, conductorDefaultFits, SWITCH_IN_JOB_FROM_BE, condCacheWanted, COND_CACHE_MIB, FILL_FROM_BE as COND_FILL_FROM_BE, loadAtReadStep, stepBack, SPILL_MARGIN_MIB, conductorPlan, learnStep, noteSwitch, planLine, CHAT_STEP, switchGuess, expectOut, cacheGrow, freeFrom, MIN_NEW, CACHE_FLIP_MAX, CACHE_FLIP_MIN_OUT, fitWindowOn, fitWindow, nextWindow, windowCacheMiB, fillEnv, loadAtStep, readStepFor, mtpBlocksSwitch, APU_MAX_STEP, apuStepOk, mtpSpareEnv, loadStepBySpeed, cleanSpeeds } from './conductor.js'; // off unless picked
import { guppiSwitch, guppiStop } from './guppi-notes.js'; // Nov 23: GUPPI's records in the chat, display only
import { tuningArgs, doorbellEnv, registerRamEnv } from './engine-tuning.js';
import { turboStandins, STANDIN_ENV, turboDriveStandins, DRIVE_STANDIN_ENV, keepGuessesArgs, keepGuessesEnv, helpHasSink, sinkEnv, withTurboDrop, TURBO_TRICK_NAMES } from './engine-extras.js'; // Turbo: stand-ins (0043), keep more guesses (0120), sharp start (0122); off unless switched on
import { helpHasQ3, helpHasQ2, helpHasTiers, tiersEnv, q3CardOk, turboExperts, turboPerWord, memArgs, copyGuessArgs, draftNumArgs, laptopThreads, readingArgs, readingChoice, dropReading, everydayTurboArgs, specGateEnv, mtpArgs, lockMemoryArgs, lockRoom } from './engine-extras.js'; // list items 94-103
import { firstWordMs, learnReadSpeed, replyEnd, EARLY_END, loadDeadline } from './hang-guard.js'; // timeouts and hangs, items 208-217
import { CrashBudget, crashHoldLine, plainEngineError, memoryFailure, shrinkCtx, memCheck, noRoomLine, shrinkLine, sameSettings, settingsDiff, lastGoodLine, pickPort, SpeedWatch, speedKey, speedBucket, slowLine, checkBrainFile, TextCallWatch, templateLine, readJson, writeJson } from './engine-care.js'; // reliability items 218-228

// 1.5.19: the context a brain gets when nothing else picks one. 32K fits a 26B brain on a 16 GB card.

// 1.5.29: some brains write their tool calls as text instead of real calls on Bob's engine:
//   qwen2.5-coder: a bare {"name": ..., "arguments": {...}} (sometimes in ```json fences or <tool_call> tags);
//   gpt-oss: Harmony tokens, "<|channel|>commentary to=functions.NAME ... <|message|>{...}<|call|>".
// When there is no real call and the text is one of these, naming a tool Bob offered, it becomes a real call.
export const TEXT_CALL_START = /^(\{|```|<tool_call>|<\|)/;
const parseJson = (t) => { try { return JSON.parse(t); } catch { return undefined; } };
export function cleanHarmony(text) {
  const final = String(text).match(/<\|channel\|>final<\|message\|>([\s\S]*?)(?:<\|(?:end|return)\|>|$)/);
  if (final) return final[1].trim();
  return String(text).replace(/<\|start\|>assistant/g, '').replace(/<\|channel\|>analysis<\|message\|>[\s\S]*?<\|end\|>/g, '').replace(/<\|[a-z]+\|>/g, '').trim();
}
export function textCalls(content, names) {
  const text = String(content || '').trim();
  if (!text) return null;
  const calls = [];
  const add = (name, args) => {
    if (!names.has(name)) return;
    const a = typeof args === 'string' ? parseJson(args) : args;
    calls.push({ function: { name, arguments: a && typeof a === 'object' ? a : {} } });
  };
  // gpt-oss (Harmony)
  for (const m of text.matchAll(/to=functions\.([\w.-]+)[^<]*?(?:<\|constrain\|>\s*\w+\s*)?<\|message\|>([\s\S]*?)(?:<\|call\|>|<\|end\|>|$)/g)) add(m[1], m[2].trim());
  if (calls.length) return { calls, text: '' };
  // <tool_call>{...}</tool_call>, possibly several
  for (const m of text.matchAll(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/g)) { const o = parseJson(m[1]); if (o?.name) add(o.name, o.arguments ?? o.parameters ?? {}); }
  if (calls.length) return { calls, text: '' };
  // A lone JSON object (or a list of them), maybe in ```json fences
  const body = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const o = parseJson(body);
  for (const c of Array.isArray(o) ? o : [o]) if (c && typeof c === 'object' && typeof c.name === 'string') add(c.name, c.arguments ?? c.parameters ?? {});
  return calls.length ? { calls, text: '' } : null;
}
const samePath = (a, b) => Boolean(a && b) && path.resolve(String(a)).toLowerCase() === path.resolve(String(b)).toLowerCase();
export const DEFAULT_CTX = 32768;
const LOAD_LOG_MAX = 256 * 1024; // 1.5.133: how much llama-server output a failed load keeps
// 1.5.19: Medium thinks, but only this long (tokens of thinking), then it is asked to answer.
export const THINK_BUDGET = { medium: 1536 };
// 1.5.68: the always-thinking Coding copy (Qwen3.6) gets a budget at every effort too. On the PC it once thought for
// 10 minutes (about 45K tokens) on a small hand-off without answering; in the race every task finished in under
// 6,400 tokens. Medium keeps its shorter budget above.
export const LONG_THINK_BUDGET = 12288;
// And every request has a ceiling on how much it may write (thinking plus answer), so no single reply runs forever.
export const MAX_REPLY_TOKENS = 32768;
export function thinkBudget(model, think) {
  if (think === false) return 0;
  return THINK_BUDGET[think] || (LONG_CODER.test(String(model || '')) ? LONG_THINK_BUDGET : 0);
}

// How long a brain may sit unused in memory: the shared setting ollamaKeepAlive ("10m", "30m", "1h", or "-1" for never).
// Both engines use it: Ollama through keep_alive, Bob's own engine through the idle check below (1.5.2).
// 1.5.210 (208 PC check): the logbook said "2 min" for a 1 min keep-alive. Minutes and seconds, as it really was.
// 1.5.215: a reader for the engine's load progress. Brain Engine with patch 0012 writes "load_progress:
// text_model <percent>" about five times a second while the weights load. llama.cpp builds that print the old progress
// dots (one per 1%, on their own) are read too; a dot inside words or numbers ("model.gguf", "1.5", "...") doesn't
// count. Returns a new percentage (0-100) when it moved by at least 2, or reached 100; null otherwise.
export function loadDots() {
  let n = 0, told = -1;
  return (d) => {
    const s = String(d || '');
    let at = -1;
    for (const m of s.matchAll(/load_progress: text_model (\d{1,3})\b/g)) at = Math.min(100, Number(m[1]));
    if (at >= 0) n = Math.max(n, at);
    else {
      let got = 0;
      if (/^[.\r\n]+$/.test(s)) got = (s.match(/\./g) || []).length;
      else for (const m of s.match(/(?:^|[^\w.])(\.{5,})(?![\w.])/g) || []) got += (m.match(/\./g) || []).length;
      if (!got) return null;
      n = Math.min(100, n + got);
    }
    if (told < 0 || n - told >= 2 || (n === 100 && told < 100)) { told = n; return n; }
    return null;
  };
}
export const EYES_REST_MS = 5 * 60_000; // Nov 23: a picture reader brought back on tight memory goes out after this long without a picture
export const idleFor = (ms) => { const s = Math.max(0, Math.round(ms / 1000)); return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min${s % 60 ? ` ${s % 60} s` : ''}`; };
export function keepAliveMs(cfg) {
  const k = String(cfg?.ollamaKeepAlive ?? '5m');
  if (k === '-1') return Infinity;
  const m = k.match(/^(\d+)([smh])$/);
  return m ? Number(m[1]) * { s: 1000, m: 60000, h: 3600000 }[m[2]] : 300000;
}

// 1.5.51 "second brain beside big jobs": Bob's engine can run a second llama-server beside the main one. It holds a
// quick chat reply's small brain while a big job keeps the main brain on the card, and (opt-in) the reviewer for a moot.
// Where it goes (E4B belongs on the graphics card when it has room): on
// the graphics card when the card has room for it as well (and isn't busy), otherwise on the processor, where it never
// sees the card (CUDA_VISIBLE_DEVICES=-1). Never in Gaming. Below normal priority, half the cores, and let go as soon as
// nothing needs it. A call goes to it when its options carry beside: true.
export const BESIDE = 'beside';
// 1.5.189 Spreading a brain over another Bob's lent card (src/share-card.js). PC test Nov 10: Riker Q4 big PC -> a
// handheld over Wi-Fi moved 2.63 GB at about 6.6 MB/s, then failed at 413 s because --fit filled the lent card and left
// no room for its working memory (a 387 MiB compute buffer at -ub 2048). So a spread load keeps more room free on
// every card (--fit-target, MiB), works in smaller steps (-ub), and waits by the brain's size, not a fixed 5 minutes.
export const SPREAD_FIT_TARGET_MIB = 2048;
export const SPREAD_UBATCH = 512;
export const SPREAD_MBPS = 4; // a slow Wi-Fi's MB per second, so the wait is long enough the first time
export const spreadLoadSeconds = (sizeGB, base = 300) => Math.min(7200, Math.max(base, base + Math.ceil((Number(sizeGB) || 0) * 1000 / SPREAD_MBPS)));
// The flags a spread load adds (unless set by hand): room kept free on each card, and smaller steps.
// Nov 12 (apu-fit.js lendRoom): a lent card on built-in graphics says how much its engine should leave free on it
// (marginMB), since it reports its whole budget as free even with the RAM behind it short (the Go refused a 1001 MiB
// first buffer while it held a brain). Lent cards come first in the engine's device order, this machine's after.
export function spreadArgs(args, margins = null) {
  const add = [];
  const own = Array.isArray(margins) && margins.some((m) => Number(m) > 0) ? [...margins.map((m) => Math.max(SPREAD_FIT_TARGET_MIB, Math.ceil(Number(m) || 0))), SPREAD_FIT_TARGET_MIB].join(',') : String(SPREAD_FIT_TARGET_MIB);
  if (args.includes('--fit') && !args.some((a) => ['--fit-target', '-fitt'].includes(a))) add.push('--fit-target', own);
  if (!args.some((a) => ['-ub', '--ubatch-size'].includes(a))) add.push('-ub', String(SPREAD_UBATCH));
  return add;
}
export function besideThreads(cpus = os.cpus()) {
  const logical = cpus.length || 2;
  const pairs = /AMD|Intel/i.test(String(cpus[0]?.model || '')) && logical % 2 === 0 && logical >= 4;
  return Math.max(2, Math.floor((pairs ? logical / 2 : logical) / 2));
}

// 1.5.52 / 1.5.61: the mid-chat system note fold lives in system-notes.js, so Ollama uses it too.
import { MID_SYSTEM_REFUSED, foldSystem } from './system-notes.js';
export { MID_SYSTEM_REFUSED, foldSystem };

// 1.5.35 (a function since 1.5.72, so the housekeeper can find the embedding file too): see catalogFile below.
export function catalogFileFor(cfg, id) {
  if (!/^[\w.:/-]+$/.test(id)) return null;
  try {
    const cat = JSON.parse(fs.readFileSync(cfg.catalogFile || new URL('../catalog.json', import.meta.url), 'utf8'));
    const e = cat.models.find((m) => m.id === id) || cat.models.find((m) => m.ollama && (m.ollama === id || `${m.ollama}:latest` === id || m.ollama === `${id}:latest`));
    const f = e?.files?.find((x) => x.role === 'gguf');
    if (!f) return null;
    const root = cfg.bobModelsDir || path.join(cfg.agentDir, 'models', 'bob');
    let dirs = [e.category];
    try { dirs = [e.category, ...fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)]; } catch {}
    // Its own folder first; an older Bob may have filed it under another one (for example chat instead of coding).
    const find = (x) => { const name = saveNameOf(x); return dirs.map((dir) => path.join(root, dir, name)).find((p) => fs.existsSync(p) && !fs.existsSync(p + '.part')) || idFolderFile(cfg, e, x); };
    // 1.5.146: last, the disk scan (Get models' "Look for brains on this replicant matrix"), the same way Get models
    // says "have it", so a brain found there loads in chat without an Equip first. Its picture reader only counts when
    // it sits in the same folder, so a reader with a common name from another brain is never picked up.
    const scanned = (x, near) => {
      if (!cfg.dataDir) return null;
      let found; try { found = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'model-scan.json'), 'utf8')); } catch { return null; }
      const alt = [saveNameOf(x), ...(x.aka || [])].map((n) => String(n).toLowerCase());
      const hit = (found.files || []).find((y) => y?.path && alt.includes(String(y.name || path.basename(y.path)).toLowerCase()) && (!near || samePath(path.dirname(y.path), path.dirname(near))) && fs.existsSync(y.path) && !fs.existsSync(y.path + '.part'));
      return hit ? hit.path : null;
    };
    let file = find(f), fromScan = false;
    if (!file) { file = scanned(f); fromScan = Boolean(file); }
    if (!file) return null;
    // 1.5.56: a brain that sees pictures has a second file, its picture reader (mmproj), saved under its own name.
    const pj = e.files.find((x) => x.role === 'mmproj');
    const mmproj = pj ? (fromScan ? scanned(pj, file) : find(pj) || scanned(pj, file)) : null;
    return mmproj ? { gguf: file, mmproj } : { gguf: file };
  } catch { return null; }
}

// Item 2: the smallest piece (in tokens) the engine reuses from earlier in the chat after a change in the middle.
export const CACHE_REUSE = 256;
// 222: one flag's value set in a list of engine flags (added when missing).
export const withFlag = (args, flag, value) => { const a = [...args]; const i = a.indexOf(flag); if (i >= 0) a[i + 1] = value; else a.push(flag, value); return a; };
// Item 14: how long a reply may go quiet after its first words before the engine counts as hung (llamacpp.stallSeconds changes it).
export const STALL_MS = 90_000;

// Brain Engine 0035 ("Resize chat memory without reloading", off unless switched on): two engine starts that differ only
// in the chat memory (-c) can be one change in place.
export function sameExceptCtx(a, b) {
  const drop = (x) => { const out = []; for (let i = 0; i < x.length; i++) { if (x[i] === '-c') { i++; continue; } out.push(x[i]); } return out.join('\u0000'); };
  return Array.isArray(a) && Array.isArray(b) && drop(a) === drop(b);
}

export class LlamaCpp {
  // Read fresh each time, so speed settings changed in the app apply to the next brain load.
  get lc() { return this.cfg.llamacpp || {}; }

  constructor(cfg, { role = 'main' } = {}) {
    this.perToken = {}; // Nov 11 (item 3): characters per token, per brain, learned from the engine's own counts
    this.readSpeed = {}; // item 208: how fast each brain reads (tokens a second), from the engine's own timings
    this.cfg = cfg;
    this.role = role;
    this.tag = role === BESIDE ? '-beside' : '';
    this.port = role === BESIDE ? (this.lc.besidePort || (this.lc.port || 8091) + 1) : (this.lc.port || 8091);
    this.url = `http://127.0.0.1:${this.port}`;
    this.child = null;
    this.current = null;
    this.now = () => Date.now();
    this.lastUse = this.now();
    this.active = 0; // chats running right now
    this.isBusy = () => false; // the brain sets this: a turn or a queued job that is working
    this.holdModel = () => null; // the brain sets this: the model "Always on" keeps loaded (never idle-unloaded)
    // Unload the brain once it has been idle longer than the keep-alive, so a quiet Bob gives the graphics card back.
    this.idleTimer = setInterval(() => { this.idleTick().catch(() => {}); }, 15_000); // 1.5.210: every 15 s, so a 1 min keep-alive lets go near 1 min, not up to 2
    this.idleTimer.unref?.();
    this.timesFile = path.join(cfg.dataDir, `load-times-llamacpp${this.tag}.json`);
    try { this.loadTimes = JSON.parse(fs.readFileSync(this.timesFile, 'utf8')); } catch { this.loadTimes = {}; }
    // Reliability 218-228 (engine-care.js): crash budget, last good settings, usual speeds, template swaps.
    this.careFile = path.join(cfg.dataDir, `engine-care${this.tag}.json`);
    this.careData = readJson(this.careFile, {});
    if (!this.careData || typeof this.careData !== 'object') this.careData = {};
    this.careData.lastGood ||= {}; this.careData.templates ||= []; this.careData.speeds ||= {};
    this.crashes = new CrashBudget({ now: () => this.now() });
    this.speeds = new SpeedWatch(this.careData.speeds);
    this.textCallWatch = new TextCallWatch();
    this.shrunk = {};      // 221: model|cpu|asked ctx -> the smaller chat memory it really runs with
    this.careData.apuFit ||= {}; // Nov 12 (apu-fit.js): per brain, what fits on built-in graphics after running out of memory
    this.noReuse = new Set(); // Nov 12: brains loaded without --cache-reuse after an "Invalid input batch" (until Bob restarts)
    this.careNotes = [];   // one-line notes for the chat (the brain shows them as announcements)
    this.reloadWanted = new Set(); // 225/228: brains to load fresh before their next job
    this.basePort = this.port;
    const stop = () => { try { this.child && this.child.kill(); } catch {} };
    process.on('exit', stop);
    for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { stop(); process.exit(0); });
  }

  // The second server, made the first time something asks for it. Only the main engine has one.
  besideServer() {
    if (this.role === BESIDE) return this;
    if (!this.beside) {
      this.beside = new LlamaCpp(this.cfg, { role: BESIDE });
      this.beside.log = (k, t) => this.log?.(k, t);
      this.beside.resolve = (m) => this.resolve(m); // same model files (tests replace resolve on the main engine)
      this.beside.catalogFile = (id) => this.catalogFile(id);
      this.beside.brainLabel = (m) => this.brainLabel?.(m) || `${m} brain`; // 218-228: plain names in the chat notes
      this.beside.main = this; // so a card reader set on the main engine (tests) also counts for the second server
      // fNRI's small cube: a brain answering on the second server is traced too, and told to the same cube
      this.beside.wantTrace = () => this.wantTrace?.() || false; this.beside.onTrace = (raw, model) => this.onTrace?.(raw, model); this.beside.onTracePart = (raw, model) => this.onTracePart?.(raw, model); this.beside.onLoadProgress = (model, pct) => this.onLoadProgress?.(model, pct);
      // 1.5.53: the brain hears when a second brain joins or leaves (chat page: second-brain events, Bob's head grows).
      this.beside.changed = (ev) => { try { this.onBeside?.(ev); } catch {} };
    }
    return this.beside;
  }
  // 1.5.51: 'whole' (on the graphics card) or 'none' (processor only) for a brain on the second server. The card is
  // used only when it's not busy and has room for the brain, its chat memory and the usual 1.5 GB to spare.
  // 1.5.133: the chat memory is counted in full (it was capped at 128K, so a 256K talker looked like it fitted), and
  // reserveMB keeps room for the main brain that is about to load (the card looked empty because it wasn't loaded yet).
  async besidePlace(model, ctx, { reserveMB = 0, why = '' } = {}) {
    const b = this.role === BESIDE ? this : this.besideServer();
    const say = (place, more) => { try { (b.log || this.log)?.('engine', `second brain ${model}: ${place === 'whole' ? 'on the graphics card' : 'on the processor'}, chat memory ${c}${more ? ` (${more})` : ''}${why ? ` [${why}]` : ''}`); } catch {} };
    const c = ctx || this.lc.ctx || DEFAULT_CTX;
    if (gaming(this.cfg) || this.lc.besideOnCard === false) { say('none', gaming(this.cfg) ? 'Gaming session' : 'card turned off for it'); return 'none'; }
    let mb = 0;
    try { mb = fs.statSync(this.resolve(model).gguf).size / 1048576; } catch { say('none', 'file size unknown'); return 'none'; }
    const card = await (b.cardReaders?.card || this.cardReaders?.card || this.main?.cardReaders?.card || readCard)().catch(() => null);
    if (!card) { say('none', 'no card reading'); return 'none'; }
    const keep = Math.max(0, Number(reserveMB) || 0);
    const need = mb * 1.15 + c * 60 / 1024 + CARD_MIN_FREE_MB + keep;
    const place = card.util < CARD_BUSY_PCT && card.freeMB >= need ? 'whole' : 'none';
    b.placed = { model, place, at: Date.now(), reserveMB: keep };
    say(place, `card free ${Math.round(card.freeMB)} MB, needs ${Math.round(need)} MB${keep ? ` incl. ${Math.round(keep)} MB kept for the main brain` : ''}${card.util >= CARD_BUSY_PCT ? `, card busy ${card.util}%` : ''}`);
    return place;
  }

  // Where a call goes: beside: true sends it to the second server (made on demand), always on the processor.
  route(opts) { return opts?.beside && this.role !== BESIDE ? this.besideServer() : null; }
  besideLoaded() { return Boolean(this.beside?.current && this.beside.child && this.beside.child.exitCode === null); }
  // Let go of the second server's brain. Returns the names unloaded.
  async dropBeside() {
    if (!this.beside?.current) { await this.beside?.stopServer?.(); return []; }
    const was = this.beside.current;
    await this.beside.stopServer();
    return [was];
  }

  // 1.5.35: also by Ollama name (like "gpt-oss:20b"): when Bob's own pinned copy of that model is downloaded, his engine
  // uses it instead of Ollama's copy. Measured: Ollama's gpt-oss blob has no chat template and got 2 of 25 tool jobs
  // right on llama.cpp; the official file got 25 of 25.
  catalogFile(id) { return catalogFileFor(this.cfg, id); }

  // 1.5.87: the longest context a model was made for, from its GGUF header, so nothing asks for more (null: unknown).
  // 1.5.205 What the Brains page needs to offer a by-hand placement: how many layers the file has. null when this
  // engine can't find the file (then the page keeps the control locked and says why).
  // 100: the chat memory this brain needs at a context with the Standard (8-bit) type, in GB (null: can't read it).
  kvGB(model, ctx) {
    try { const b = kvBytes(ggufInfo(this.resolve(model).gguf)?.shape, ctx, ['-ctk', 'q8_0', '-ctv', 'q8_0']); return b ? Math.round((b / 1024 ** 3) * 10) / 10 : null; } catch { return null; }
  }
  placeInfo(model) {
    try { const layers = ggufInfo(this.resolve(model).gguf)?.shape?.layers || 0; return layers ? { layers } : null; } catch { return null; }
  }

  async maxCtx(model) {
    try { return ggufInfo(this.resolve(model).gguf)?.ctxTrain || null; } catch { return null; }
  }

  // Long memory (model-ctx.js): the most this brain can be stretched to with the switch on, or null.
  // evenOff: whether it could be, with the switch off (Settings only shows the switch when a brain can).
  async stretchMax(model, { evenOff = false } = {}) {
    if (!stretchOn(this.cfg) && !evenOff) return null;
    try { return stretchMost(ggufInfo(this.resolve(model).gguf)); } catch { return null; }
  }

  // Whether a context fits this machine (graphics card plus RAM, less the system's share), before loading it.
  // { fits, needGB, roomGB }, or fits: null when Bob can't tell (no file, or a brain whose shape he can't read).
  async roomFor(model, ctx, { ramBytes = os.totalmem(), cardBytes = cardGB(this.cfg) * 1024 ** 3 } = {}) {
    const gb = (b) => Math.round((b / 1024 ** 3) * 10) / 10;
    try {
      const f = this.resolve(model).gguf;
      const need = needBytes(fs.statSync(f).size, ggufInfo(f)?.shape, ctx, memArgs(this.turboCfg(model), model, this.lc.args, this.memCaps()), this.tiersFor(model, ctx)); // 100: the brain's memory type
      if (!need) return { fits: null };
      const room = roomBytes(ramBytes, cardBytes);
      return { fits: need <= room, needGB: gb(need), roomGB: gb(room) };
    } catch { return { fits: null }; }
  }

  // Ollama name -> GGUF file (+ vision projector), by reading Ollama's manifest.
  resolve(model) {
    const override = this.lc.models?.[model];
    if (override && typeof override !== 'string') return override;
    // 1.5.74: an Equip from before 1.5.74 saved only the file path, which dropped the picture reader (mmproj). When
    // that path is Bob's own copy of a catalogue model, use the full copy (with its picture reader) instead.
    if (override) { const own = this.catalogFile(model); return own && samePath(own.gguf, override) ? own : { gguf: override }; }
    // 1.5.25: a Get models id (like "qwen3-4b") that was downloaded but never picked in a slot: its file in Bob's models folder.
    const own = this.catalogFile(model);
    if (own) return own;
    const dir = this.lc.ollamaModelsDir || path.join(this.cfg.agentDir, 'models');
    let [name, tag = 'latest'] = model.split(':');
    const parts = name.includes('/') ? name.split('/') : ['library', name];
    const manifest = path.join(dir, 'manifests', 'registry.ollama.ai', ...parts, tag);
    let m;
    try { m = JSON.parse(fs.readFileSync(manifest, 'utf8')); } catch { throw new Error(`I can't find the model files for ${model} (looked in ${manifest}).`); }
    const blob = (type) => {
      const layer = (m.layers || []).find((l) => l.mediaType === `application/vnd.ollama.image.${type}`);
      return layer ? path.join(dir, 'blobs', layer.digest.replace(':', '-')) : null;
    };
    const gguf = blob('model');
    if (!gguf) throw new Error(`${model} has no model file in its manifest.`);
    return { gguf, mmproj: blob('projector') };
  }

  // Item 3: how many characters make one token for this brain (3 until a reply has taught Bob better).
  charsPerToken(model) { return perFor(this.perToken, model); }
  // Nov 24 (npc's real-path GUPPI run: a 16K-token message in a 32K chat memory had its tool results cut on the first
  // reply, because the 3-characters-a-token guess counted it at over 21K): before Bob cuts anything he asks the running
  // engine to count the chat exactly (llama-server's /tokenize) and learns the brain's figure from it. 0 when the brain
  // isn't the one running, or the engine can't say; then the guess stands.
  async countChars(model, messages, tools) {
    if (this.current !== model || !this.loadedOk || !this.child || this.child.exitCode !== null) return 0;
    const text = [...(messages || []).map((m) => String(m?.content ?? '') + (m?.tool_calls ? JSON.stringify(m.tool_calls) : '')), tools && (!Array.isArray(tools) || tools.length) ? JSON.stringify(tools) : ''].join('');
    if (!text) return 0;
    try {
      const res = await fetch(this.url + '/tokenize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content: text }), signal: AbortSignal.timeout(5000) });
      if (!res.ok) return 0;
      const n = (await res.json().catch(() => ({})))?.tokens?.length || 0;
      if (!(n > 0)) return 0;
      const per = learnPer(this.perToken[model], text.length, n); if (per) this.perToken[model] = per;
      return text.length / n;
    } catch { return 0; }
  }

  async health() {
    try { return (await fetch(this.url + '/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
  }

  // 1.5.49: what loading this brain does to the ones already loaded. Bob's own engine holds one brain at a time,
  // so a different brain always swaps the current one out (the picture engine is separate and isn't touched).
  // 1.5.51: beside: true loads it on the second server, so the main brain stays (an add).
  async loadPlan(model, opts = {}) {
    const all = await this.loaded();
    const now = all.map((m) => m.name);
    if (this.route(opts)) {
      const main = all.filter((m) => !m.beside).map((m) => m.name);
      const besideNow = all.filter((m) => m.beside && m.name !== model).map((m) => m.name);
      const onCard = (await this.besidePlace(model, opts.ctx)) === 'whole';
      return { before: now, drop: besideNow, keep: main, single: false, beside: true, onCard };
    }
    const mainNow = all.filter((m) => !m.beside).map((m) => m.name);
    return { before: now, drop: mainNow.filter((n) => n !== model), keep: [], single: true };
  }

  async loaded() {
    const side = this.role !== BESIDE && this.beside ? (await this.beside.loaded()).map((m) => ({ ...m, beside: true, onCard: this.beside.currentCard === 'whole', ...(this.beside.currentCard === 'whole' ? {} : { vram: 0, split: true }) })) : [];
    if (!(this.current && this.child && this.child.exitCode === null)) return side;
    let size = 0;
    try { size = fs.statSync(this.resolve(this.current).gguf).size; } catch {}
    const vram = this.role === BESIDE && this.currentCard !== 'whole' ? 0 : await this.vramOf(this.child.pid);
    // Without a per-process figure from nvidia-smi, how the model splits between card and RAM is unknown.
    // usesCard: it was started on the card. Windows' nvidia-smi often can't say how much one process holds (0), so the
    // Lab's "unload first" checks can't go by vram alone.
    return [{ name: this.current, own: Boolean(this.currentOwn), size, vram, split: vram > 0, usesCard: this.role !== BESIDE && !this.currentCpu, ctx: this.currentCtx || this.lc.ctx || DEFAULT_CTX }, ...side];
  }

  // Graphics memory llama-server holds, in bytes, from nvidia-smi (ships with the NVIDIA driver). 0 when unknown.
  vramOf(pid) {
    return new Promise((resolve) => {
      try {
        execFile('nvidia-smi', ['--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (err, out) => {
          if (err) return resolve(0);
          const row = String(out).split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).find(([p]) => Number(p) === pid);
          resolve(row && Number(row[1]) > 0 ? Number(row[1]) * 1048576 : 0);
        });
      } catch { resolve(0); }
    });
  }

  // Called every minute: stop llama-server once nothing has used it for longer than the keep-alive.
  // The next chat loads the brain again, as after a restart. Returns true when it unloaded.
  async idleTick() {
    if (!this.child || this.child.exitCode !== null || this.active > 0) return false;
    let busy = false;
    try { busy = Boolean(this.isBusy()); } catch {}
    if (busy) { this.lastUse = this.now(); return false; }
    // 1.5.32: Gaming on Automatic: when the right use of the card has changed (a game started or stopped using it, or the
    // processor filled up), stop the brain. The next chat loads it the new way (about a second for the Gaming brain).
    if (this.currentCard && gaming(this.cfg) && gamingCard(this.cfg) === 'auto') {
      const now = await this.gamingCardPlan(this.current);
      if (now !== this.currentCard && this.active === 0) { this.cardFlip = { from: this.currentCard, to: now, at: this.now() }; await this.stopServer(); return true; }
    }
    if (await this.restEyes()) return false; // Nov 23: a tight-memory lever (below); the brain stays loaded
    let hold = null;
    try { hold = this.holdModel(); } catch {}
    if (hold && hold === this.current) { this.lastUse = this.now(); return false; }
    if (this.now() - this.lastUse <= keepAliveMs(this.cfg)) return false;
    this.idleUnloaded = this.current;
    try { this.log?.('engine', `${this.current}: let go after ${idleFor(this.now() - this.lastUse)} unused (kept for ${String(this.cfg?.ollamaKeepAlive ?? '5m')})${this.role === BESIDE ? ' (second brain)' : ''}`); } catch {} // 1.5.133
    await this.stopServer();
    try { this.onIdleGone?.(); } catch {} // the brain was let go on its own: Bob tells the pages (the fNRI cube takes itself apart)
    return true;
  }

  // 1.5.32: 'none', 'borrow' or 'whole' for the Gaming brain (see gaming-card.js). Tests replace readCard / readCpu.
  async gamingCardPlan(model) {
    let brainMB = 0;
    try { brainMB = Math.round(fs.statSync(this.resolve(model).gguf).size / 1048576); } catch {}
    return decideCard(this.cfg, { brainMB, ...(this.cardReaders ? { read: this.cardReaders } : {}) });
  }

  // ctx: the session's context size. A different size means restarting llama-server with it.
  // cpu (1.5.12, Low effort on the processor): the same model on the card is a different load, and the other way round.
  async isLoaded(model, { ctx, cpu = false, beside = false } = {}) {
    const b = this.route({ beside });
    if (b) return b.isLoaded(model, { ctx, cpu: true });
    if (this.role === BESIDE) cpu = true;
    // 225/228: a brain marked to load fresh counts as not loaded until it is (never in the middle of a reply), so the
    // gate loads it again before the next job.
    if (this.reloadWanted.has(model) && this.current === model && this.active === 0) return false;
    const want = this.realCtx(model, ctx, cpu); // 221: a brain loaded with a smaller chat memory still counts as the one asked for
    const same = this.current === model && (!want || this.currentCtx === want) && Boolean(this.currentCpu) === Boolean(cpu) && this.child && this.child.exitCode === null;
    if (!same) return false;
    // 219: the health check before each turn. A running engine that doesn't answer it is named, and started fresh.
    if (await this.health()) return true;
    if (this.child && this.child.exitCode === null && this.loadedOk) this.log?.('engine', `${model}: the engine is running but didn't answer its health check; starting it fresh`);
    return false;
  }

  // 221: the chat memory a brain really runs with for the size asked (smaller after a load that ran out of memory).
  realCtx(model, ctx, cpu = false) {
    const asked = ctx || this.lc.ctx || DEFAULT_CTX;
    const s = this.shrunk[`${model}|${cpu ? 1 : 0}|${asked}`];
    if (s) return s.got;
    const most = this.apuMaxCtx(model);
    return most && asked > most ? most : ctx;
  }
  // One-line notes for the chat, taken once (brain.js shows them as announcements).
  takeNotes() { const n = this.careNotes; this.careNotes = []; return n; }
  note(text) { if (text && !this.careNotes.includes(text)) this.careNotes.push(text); if (this.careNotes.length > 5) this.careNotes.shift(); }
  label(model) { try { return this.brainLabel?.(model) || `${model} brain`; } catch { return `${model} brain`; } }
  saveCare() { writeJson(this.careFile, this.careData); }

  // --fit came in with newer llama.cpp builds; older ones would refuse to start with it.
  fitOn() {
    if (typeof this.lc.fit === 'boolean') return this.lc.fit;
    return this.buildNo() >= 12000; // 1.5.91: the same marker lookup as the load flag
  }

  // The llama-server Bob starts: the one set by hand, or the one in his engine folder.
  exePath() { return this.lc.exe || path.join(this.cfg.agentDir, 'llama.cpp', exeName('llama-server')); }
  // llama.cpp build number (0 when unknown). 1.5.91: the marker next to the exe first (the bundled engine and an
  // engine set by hand carry their own), then the one in Bob's engine folder.
  // Nov 12 (the owner: "make sure it reads the right label, and that the label is the right model"): a Brain Engine
  // build named N1bN2 says which llama.cpp it is built on; the running engine says the same in /props build_info. If
  // they differ, the files in the folder aren't the build its marker names, so Bob says so once (Health logbook).
  // Brain Engine's own build number from the marker next to the exe (0 when it isn't Brain Engine or is unknown)
  // Nov 24 (the Legion Go's hand install: PowerShell wrote the marker with a byte-order mark, JSON.parse failed, and GUPPI
  // quietly read "not Brain Engine"): the engine's marker, read with a BOM stripped; a marker that's there but can't be
  // read says so in the logbook once
  engineMark() {
    const f = path.join(path.dirname(this.exePath()), 'bob-brainengine.json');
    let text; try { text = fs.readFileSync(f, 'utf8'); } catch { return null; }
    try { return JSON.parse(text.replace(/^\uFEFF/, '')); }
    catch (e) { if (this.markWarned !== f) { this.markWarned = f; this.log?.('engine', `WARNING: the Brain Engine marker ${f} can't be read (${e.message}), so the engine counts as plain llama.cpp`); } return null; }
  }
  beNo() {
    return brainEngineBuild(this.engineMark()?.version)?.n || 0;
  }
  checkBuild(buildInfo) {
    let mark = null;
    mark = this.engineMark(); if (!mark) return null;
    const ok = buildMatches(mark?.version, buildInfo);
    if (ok === false && this.buildWarned !== mark.version) {
      this.buildWarned = mark.version;
      this.log?.('engine', `${brainEngineName(mark.version)} is named for llama.cpp ${brainEngineBuild(mark.version).llama}, but the engine running says it is ${String(buildInfo).split('-')[0]}. The files in its folder may be from another build: Settings, Engines, Update puts the right one in.`);
    }
    this.buildOk = ok;
    return ok;
  }
  buildNo() {
    for (const dir of [path.dirname(this.exePath()), path.join(this.cfg.agentDir, 'llama.cpp')]) {
      try { const n = Number(String(JSON.parse(fs.readFileSync(path.join(dir, 'bob-llamacpp.json'), 'utf8')).version).replace(/^b/, '')); if (n) return n; } catch {}
      // 1.5.169: Brain Engine's marker names the llama.cpp build it sits on (base).
      try { const n = Number(String(JSON.parse(fs.readFileSync(path.join(dir, 'bob-brainengine.json'), 'utf8').replace(/^\uFEFF/, '')).base).replace(/^b/, '')); if (n) return n; } catch {}
    }
    return 0;
  }
  // 1.5.91: with no marker, ask the engine itself once (its --help) which load flag it knows. Only a real
  // llama-server is asked; anything else, or no answer within 5 s, counts as unknown.
  loadFlag() {
    const n = this.buildNo();
    if (n) return n >= 12032 ? 'load-mode' : 'no-mmap';
    const exe = this.exePath();
    if (this._loadFlag && this._loadFlag.exe === exe) return this._loadFlag.flag; // asked once per exe
    let flag = null;
    if (/llama-server/i.test(path.basename(exe)) && fs.existsSync(exe)) {
      try {
        const r = spawnSync(exe, ['--help'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
        const text = `${r.stdout || ''}${r.stderr || ''}`;
        flag = /--load-mode\b/.test(text) ? 'load-mode' : /--no-mmap\b/.test(text) ? 'no-mmap' : null;
      } catch {}
    }
    this._loadFlag = { exe, flag };
    return flag;
  }

  // Nov 19 (Brain Engine patch 0038): does this engine have the 3-bit chat memory type (q3_0)? Asked once per exe from
  // its --help, whose cache type list names it. Anything else, or no answer within 5 s, counts as no, so the
  // Smallest memory type falls back to Smaller and is not offered on the Brains page.
  // Nov 20 (patch 0039): the same --help names LLAMA_KV_TIERS when the engine has Progressive Memory (kvTiers).
  // Only for CUDA cards and the processor (q3CardOk): Vulkan and Metal have no 3-bit kernels.
  kvCaps() {
    const exe = this.exePath();
    if (this._kvQ3 && this._kvQ3.exe === exe) return this._kvQ3;
    let has = false, tiers = false, q2 = false, sink = false;
    if (/llama-server/i.test(path.basename(exe)) && fs.existsSync(exe)) {
      try {
        if (!q3CardOk(fs.readdirSync(path.dirname(exe)), process.platform)) throw new Error('no 3-bit kernels for this card');
        const r = spawnSync(exe, ['--help'], { timeout: 5000, encoding: 'utf8', windowsHide: true });
        const text = `${r.stdout || ''}${r.stderr || ''}`;
        has = helpHasQ3(text);
        tiers = has && helpHasTiers(text);
        q2 = has && helpHasQ2(text); // 0046: 2-bit, Turbo's Progressive 8+2 only
        sink = helpHasSink(text); // 0122: Turbo: sharp start (Brain Engine 46 or newer)
      } catch {}
    }
    this._kvQ3 = { exe, has, tiers, q2, sink };
    return this._kvQ3;
  }
  kvQ3() { return this.kvCaps().has; }
  kvTiers() { return this.kvCaps().tiers; }
  // The brain's chat memory flags and, for Progressive, its steps (both from the Brains page pick).
  memCaps() { const c = this.kvCaps(); return { q3: c.has, q2: c.q2, tiers: c.tiers, sink: c.sink === true }; }
  // The steps the room counter adds, and that a resize in place must keep: Progressive's rings, then the sharp start.
  tiersFor(model, ctx) {
    const caps = { ...this.memCaps(), handArgs: this.lc.args }, tc = this.turboCfg(model);
    const s = sinkEnv(tc, model, ctx, caps).LLAMA_KV_SINK;
    return [tiersEnv(tc, model, ctx, caps).LLAMA_KV_TIERS || '', s ? `sink:${s}` : ''].filter(Boolean).join(',');
  }

  // 1.5.90: no memory-mapping when some of the brain is placed in RAM on the card route (see buildArgs).
  // 1.5.193: not when the brain is bigger than the card and RAM can hold together (gpt-oss 120B, about 63 GB, on a
  // 16 GB card with 32 GB of RAM). Read in whole, it ran out of memory and never loaded; memory-mapped, the card takes
  // its share, Windows keeps the busiest parts in RAM and the rest is read from the drive as words need it. Slow, but
  // it runs. A few GB of RAM are left for the system and the chat's memory.
  readsWhole(args, cpu, gguf) {
    if (cpu || this.lc.loadMode === 'mmap') return false;
    if (args.some((a) => ['--mmap', '--no-mmap', '--load-mode', '-lm'].includes(a))) return false; // set by hand
    if (!args.some((a) => ['--fit', '--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor'].includes(a))) return false;
    return !this.biggerThanMemory(gguf);
  }
  // The brain file is bigger than the card's share plus the RAM it may use. totalRam is swapped in by the tests.
  biggerThanMemory(gguf) {
    let size = 0;
    try { size = fs.statSync(gguf).size; } catch { return false; }
    const ram = (this.totalRam ? this.totalRam() : os.totalmem()) - 6e9, card = cardGB(this.cfg) * 1e9 * 0.8;
    return ram > 0 && size > ram + card;
  }
  // --load-mode is in the builds Bob ships (b12032, the one tested); older builds only know --no-mmap.
  // 1.5.91: when the build can't be told, no flag at all (b12032 refuses --no-mmap, so a guess can stop the engine).
  noMmapArgs() { const f = this.loadFlag(); return f === 'load-mode' ? ['--load-mode', 'none'] : f === 'no-mmap' ? ['--no-mmap'] : []; }

  // A model can see pictures when it has a vision projector (mmproj) and vision isn't switched off.
  async hasVision(model) {
    try { return Boolean(this.resolve(model).mmproj) && this.lc.vision !== false && !(this.lc.noEyes || []).includes(model); } catch { return false; }
  }

  // Whether llama.cpp's --fit places the layers: on the card, unless a placement is pinned by hand or fit is off.
  fitsItself(args, cpu) {
    const pinned = args.some((a) => ['--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor', '--fit'].includes(a));
    return !pinned && !cpu && this.fitOn();
  }

  // Layers on the card, when set outright: none on the processor, or a number set by hand (gpuLayers).
  // 1.5.32: card 'whole' (Gaming, Automatic, processor at full load) puts the whole small brain on the card.
  layerArgs(cpu, card) {
    if (cpu && card === 'whole') return ['-ngl', '999'];
    if (cpu) return ['-ngl', '0'];
    return Number.isInteger(this.lc.gpuLayers) ? ['-ngl', String(this.lc.gpuLayers)] : [];
  }

  // Everything llama-server is started with, in one place so it can be tested.
  buildArgs(model, { ctx, cpu = false, card } = {}) {
    if (this.role === BESIDE) cpu = true;
    const lc = this.lc;
    const { gguf, mmproj, args: modelArgs } = this.resolve(model);
    const num = (v, flag) => (Number.isInteger(v) && v > 0 ? [flag, String(v)] : []);
    // Settings, Engine tuning (off unless "I'll set them myself"): this brain's levers set by hand. Flags typed by hand win.
    const handFlags = [...(lc.args || []), ...(modelArgs || lc.modelArgs?.[model] || [])];
    const tune = this.role === BESIDE ? tuningArgs({}, model) : tuningArgs(this.cfg, model, { handArgs: handFlags, cpu });
    this.tuneEnv = tune.env;
    const tunedStep = tune.taken.includes('-ub') || Number.isInteger(lc.batch) || Number.isInteger(lc.ubatch);
    const args = [
      ...(lc.preArgs || []),
      '-m', gguf, '--host', '127.0.0.1', '--port', String(this.port),
      // 1.5.19: 32K by default (131072 spilled a 26B brain past a 16 GB card into system RAM and crawled at 5 tok/s).
      '-c', String(ctx || lc.ctx || DEFAULT_CTX), ...this.layerArgs(cpu, card), '--jinja',
      // Long memory: past what the brain was made for, its positions are stretched (YaRN) to the size picked.
      ...this.stretchArgs(gguf, ctx || lc.ctx || DEFAULT_CTX),
      ...(mmproj && lc.vision !== false && !(lc.noEyes || []).includes(model) && !this.eyesShut?.has(model) ? ['--mmproj', mmproj] : []), // Lab: "Load without eyes and ears" for one brain; eyesShut: no room (below)
      // 100 (opt-in, the Brains page): the brain's chat memory type, Standard (8-bit) unless picked. Flags set by hand win.
      ...memArgs(this.turboCfg(model), model, lc.args, this.memCaps()),
      // 98 Laptop mode (opt-in): on battery, half the cores. Games-first and threads set by hand win.
      ...(this.role === BESIDE ? ['-t', String(besideThreads())] : cpu && cpuPlan(this.cfg) ? ['-t', String(cpuPlan(this.cfg).threads), ...(cpuPlan(this.cfg).range ? ['--cpu-range', cpuPlan(this.cfg).range] : [])] : laptopThreads(this.cfg) ? ['-t', String(laptopThreads(this.cfg))] : num(lc.threads, '-t')),
      ...num(lc.batch, '-b'), ...num(lc.ubatch, '-ub'),
      // 101 Reading speed (opt-in): bigger reading steps on the card. A batch set by hand wins.
      ...(this.role === BESIDE ? [] : readingArgs(this.cfg, { cpu, hand: tune.taken.includes('-ub') ? { ...lc, batch: 1 } : lc, recent: this.recentPrompts, model })),
      // 1.5.24 "Warm up while typing": on the processor, his reading of the instructions is kept on disk.
      ...(cpu && tuning(this.cfg).readyWhileTyping ? ['--slot-save-path', startDir(this.cfg)] : chatPlacesOn(this.cfg) && this.role !== BESIDE ? ['--slot-save-path', placesDir(this.cfg)] : []), // or each chat's place (chat-places.js)
      ...(modelArgs || lc.modelArgs?.[model] || []),
      ...tune.args,
      // Mixture-of-experts models: keep this many layers' experts in system RAM so the rest fits the card.
      ...(Number.isInteger(lc.nCpuMoe?.[model]) ? ['--n-cpu-moe', String(lc.nCpuMoe[model])]
        // 1.5.205: set by hand on the Brains page (brain-place.js). The config file's own number, above, wins.
        : placeArgs(this.cfg, model, { cpu, layers: ggufInfo(gguf)?.shape?.layers || 0 }))
    ];
    // --fit: llama.cpp places layers to fit the card's free memory right now (other apps included), which
    // beat a fixed --n-cpu-moe on a 16 GB card. Used unless a placement is pinned by hand or fit is off.
    // 1.5.19: with --fit there is no -ngl, because a set -ngl stops fit from trimming (it then overfilled the card).
    // Without fit, every layer goes on the card as before.
    if (this.fitsItself(args, cpu)) args.push('--fit', 'on');
    else if (!args.includes('-ngl')) args.push('-ngl', '999');
    // The Conductor (Engine tuning, off unless picked): the start step is the chat step, and the reading needs a
    // place on disk while the step changes. A step set by hand (flags, the config file) means no Conductor.
    this.condChat = 0; this.condWinFull = 0; this.condMax = 0; this.condLoad = 0;
    // Nov 24 (the Legion Go check: the Conductor never acted, and nothing said why): when it's on but can't drive this
    // load, the logbook says why, once per brain and reason
    if (conductorOn(this.cfg)) {
      const why = cpu ? 'the brain runs on the processor' : this.role === BESIDE ? 'this is the helper engine' : tunedStep || handFlags.some((a) => ['-b', '-ub', '--batch-size', '--ubatch-size'].includes(a)) ? 'a reading step is set by hand (Engine tuning, the config file or engine flags)'
        : !(conductorPicked(this.cfg) || conductorDefaultFits({ beNo: this.beNo(), sharedGraphics: this.cfg.sharedGraphics === true })) ? `it needs Brain Engine 43 or newer (this is ${this.beNo() || 'not Brain Engine'})` : '';
      if (why && this.condWhy !== `${model}:${why}`) { this.condWhy = `${model}:${why}`; this.log?.('engine', `${model}: Conductor: not driving this load: ${why}`); }
    }
    // Nov 24: on unless another way is picked; the default only where it has passed (conductorDefaultFits)
    if (conductorOn(this.cfg) && (conductorPicked(this.cfg) || conductorDefaultFits({ beNo: this.beNo(), sharedGraphics: this.cfg.sharedGraphics === true })) && !cpu && this.role !== BESIDE && !tunedStep && !handFlags.some((a) => ['-b', '-ub', '--batch-size', '--ubatch-size'].includes(a))) {
      if (!args.includes('--slot-save-path')) args.push('--slot-save-path', path.join(this.cfg.dataDir, 'conductor'));
      const ub = args.lastIndexOf('-ub');
      this.condChat = ub >= 0 ? Number(args[ub + 1]) || CHAT_STEP : 512; // llama-server's own step when none is given
      // Nov 24 (the owner: "he needs to make it faster"; Bob's real path on the test PC: the 35B had no copy cache, so
      // GUPPI had nothing to trade and was slower than Let Bob pick; with one, 1a read 3,366 against 2,194 tokens a
      // second with the same words): a brain made of experts that is bigger than the card gets the expert copy cache
      // when GUPPI drives (Brain Engine 39+, which fills the card around the read step itself). Not on built-in graphics.
      // Nov 26, GUPPI calibrates this PC (a button, nothing until pressed): this PC's measured edge for this brain, and
      // whether GUPPI beat Let Bob pick here. When he didn't, he keeps Bob's step and adds no copy cache for it.
      const prof = this.guppiProfile(model);
      if (!args.includes('--moe-cache-mib') && !prof?.keepBob && !this.cfg.sharedGraphics && this.beNo() >= COND_FILL_FROM_BE && condCacheWanted({ experts: ggufInfo(gguf)?.experts || 0, fileBytes: (() => { try { return fs.statSync(gguf).size; } catch { return 0; } })(), cardBytes: cardGB(this.cfg) * 1024 ** 3 })) {
        args.push('--moe-cache-mib', String(COND_CACHE_MIB));
        this.log?.('engine', `${model}: Conductor: a brain of experts bigger than the card, so the expert copy cache is on (${COND_CACHE_MIB} MiB to start, filled to the card)`);
      }
      const mc = args.lastIndexOf('--moe-cache-mib');
      this.condCacheBase = mc >= 0 ? Number(args[mc + 1]) || 0 : 0; // the copy cache it reads with; writing may get more
      // Nov 21, the window lever (off unless switched on): the whole context it loads with, cut to the chat later
      this.condWinFull = fitWindowOn(this.cfg) && this.condCacheBase > 0 ? Number(ctx || lc.ctx || DEFAULT_CTX) || 0 : 0;
      // Nov 23: the copy cache fills the card's free memory (Brain Engine 39 and newer), unless set by hand
      // Nov 23: the biggest step it will read at is planned for at load, and the brain loads at it (see loadAtStep)
      this.condMax = readStepFor(Number(ctx || lc.ctx || DEFAULT_CTX) || 0);
      // built-in graphics (the Go's safe range): read at most APU_MAX_STEP, no fill, no switching (see below)
      this.condApu = this.cfg.sharedGraphics === true;
      if (this.condApu) this.condMax = Math.max(this.condChat, Math.min(this.condMax, APU_MAX_STEP));
      if ((this.condCap ||= {})[model] > 0) this.condMax = Math.max(this.condChat, Math.min(this.condMax, this.condCap[model])); // a step that left the card short before
      if (prof?.cap > 0) this.condMax = Math.max(this.condChat, Math.min(this.condMax, prof.cap)); // this PC's measured edge
      if (prof?.keepBob) this.condMax = this.condChat; // GUPPI didn't beat Bob's pick here: Bob's step, no switching
      // Nov 24: the top step by this brain's measured speeds on this machine, not the biggest that fits (loadStepBySpeed)
      if (!this.condApu) {
        const recent = (this.recentPrompts || []).filter((x) => x > 0);
        const pick = loadStepBySpeed({ speeds: this.condSpeedsAll()[model], chat: this.condChat, max: this.condMax, readTok: recent.length ? recent.reduce((a, b) => a + b, 0) / recent.length : 16384 });
        if (pick.step !== this.condMax) { this.condMax = pick.step; if (this.speedPickSaid !== `${model}:${pick.step}`) { this.speedPickSaid = `${model}:${pick.step}`; this.log?.('engine', `${model}: Conductor: ${pick.why}, so it reads at up to ${pick.step}`); } }
      }
      const fill = this.condApu ? {} : fillEnv({ cacheMiB: this.condCacheBase, beNo: this.beNo(), env: this.tuneEnv, step: this.condMax });
      // Nov 24 (the laptop check): load at the read step only where the engine sizes the card around it (the fill)
      // Nov 24, the Legion Go check: switching steps inside a chat changed the words on built-in graphics, so there it
      // loads at its read step and stays, when that still leaves Windows its 1.5 GB with the brain in (else the chat step).
      // Nov 24, the seeded Go rerun: without a copy cache step 2048 cost 0.5 GB for no faster reading, so then it keeps Bob's step.
      let apuRoom = false;
      if (this.condApu && this.condCacheBase > 0 && this.condMax > this.condChat) { let size = 0; try { size = fs.statSync(gguf).size; } catch {} apuRoom = apuStepOk({ from: this.condChat, to: this.condMax, freeBytes: (this.freeRam ? this.freeRam() : os.freemem()) - size }); }
      const atRead = this.condMax > this.condChat && (this.condApu ? apuRoom : loadAtReadStep({ fills: Boolean(fill.LLAMA_MOE_CACHE_FILL) }));
      if (atRead) args.splice(0, args.length, ...loadAtStep(args, this.condMax));
      this.condLoad = atRead ? Math.max(this.condMax, this.condChat) : this.condChat;
      // Nov 24 (the Legion Go check found no Conductor lines in the logbook): say once per load that it drives, and how
      this.log?.('engine', `${model}: Conductor: on (${conductorPicked(this.cfg) ? 'picked' : 'the default'}), loads at step ${this.condLoad}, reads at up to ${this.condMax || this.condChat}${this.condApu ? ', built-in graphics' : ''}`);
      if (fill.LLAMA_MOE_CACHE_FILL) {
        this.tuneEnv = { ...(this.tuneEnv || {}), ...fill };
        if (this.fillSaid !== model) this.log?.('engine', `${model}: Conductor: the copy cache fills the card's free memory, leaving room for reading`);
        this.fillSaid = model;
      }
    }
    // 101: what Auto chose and why, for Settings and the logbook (said once each time it changes).
    if (tune.said && tune.said !== this.tuneSaid) this.log?.('engine', `${model}: ${tune.said}`);
    this.tuneSaid = tune.said;
    if (!cpu && this.role !== BESIDE && !tunedStep) { const why = readingChoice(this.cfg, { recent: this.recentPrompts, model }).why; if (why && why !== this.readingWhy) this.log?.('engine', `${model}: ${why}`); this.readingWhy = why; }
    // 103 Lock brain memory (opt-in): the part of the brain in RAM stays there.
    if (this.cfg.lockBrainMemory === true && !cpu && this.role !== BESIDE) {
      let size = 0; try { size = fs.statSync(gguf).size; } catch {}
      const card = (Number(this.cfg.gpuVramGB || this.cfg.cardGB) || 0) * 1024 ** 3 * 0.9;
      const room = lockRoom({ ramPart: Math.max(0, size - card) });
      if (!room.ok) this.log?.('engine', `${model}: Lock brain memory is on, but not used this time: ${room.why}`);
      args.push(...lockMemoryArgs(this.cfg, { args, cpu, room }));
    }
    // 1.5.177: llama-server's own chat page is switched off. Bob is the only chat page; the engine answers only Bob.
    // (Its plain page looked like a different app when someone opened the engine's address.) --no-webui came in
    // around llama.cpp b4100; an older or unknown build is left as it was, so it still starts.
    if (this.buildNo() >= 4100 && !args.includes('--no-webui') && !args.includes('--webui')) args.push('--no-webui');
    // When part of the brain stays in RAM (fit, or experts kept on the processor), read it all in at load instead of
    // letting Windows page it in during the first request. PC test 2026-11-04 (Qwen3.6, --fit, 128K): first reply
    // 27 s -> 1.4 s and RAM 21 -> 12 GB, for about 10 s more load. llamacpp.loadMode "mmap" keeps the old way.
    // Nov 16 Hot experts on the card (opt-in): llama.cpp's expert cache, filled at load from this brain's profile.
    { const hot = hotArgs(this.cfg, model, { args, cpu: cpu || this.role === BESIDE, build: this.buildNo(), gguf }); args.push(...hot.args); this.hotEnv = hot.env;
      if (hot.args.length) this.log?.('engine', `${model}: hot experts on the card, ${hot.args[1]} MB, ${hot.seeded ? `filled from the ${hot.kind} profile` : hot.stale ? `NOT filled from a profile: ${hot.stale}, so it fills as words come` : 'no profile yet (Calibrate makes one), so it fills as words come'}`); }
    if (this.readsWhole(args, cpu, gguf)) args.push(...this.noMmapArgs());
    // A brain bigger than the card and RAM: the processor's experts stay as they are in the file (no repacking into RAM),
    // so they can be read from the drive as needed (b12032 and newer know --no-repack).
    else if (!cpu && this.buildNo() >= 12032 && !args.some((a) => ['-nr', '--no-repack', '--repack'].includes(a)) && args.some((a) => ['--fit', '--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor'].includes(a)) && this.biggerThanMemory(gguf)) args.push('--no-repack');
    // 1.5.19: one conversation at a time, so it gets the whole context (more slots split it into small pieces).
    if (!args.some((a) => ['-np', '--parallel'].includes(a))) args.push('-np', '1');
    // Nov 11 (item 2): when an old tool result in the middle of a chat gets shortened, the engine moves the rest of what it
    // already read into place instead of reading it all again (llama.cpp's KV shifting; b4500 and newer). Brains that
    // can't (some memory layouts, picture readers) are switched back by the engine itself, with a line in its log.
    // Nov 12: not for a brain whose engine said "Invalid input batch" this run (a reply's reading gone out of step).
    if (this.buildNo() >= 4500 && !args.includes('--cache-reuse') && !this.noReuse.has(model)) args.push('--cache-reuse', String(CACHE_REUSE));
    // Nov 24: the engine's RAM cache of chats (llama.cpp's --cache-ram, 8 GB unless told) grows after GUPPI has placed the
    // brain, so GUPPI sizes it here: half of the RAM left once the brain's part in RAM and his keep-free amount are set
    // aside (src/chat-places.js ramCacheMiB). Brain Engine 46 (patch 0121) also watches the floor while it runs.
    if (this.buildNo() >= 7000 && !args.some((a) => ['--cache-ram', '-cram'].includes(a))) args.push('--cache-ram', String(this.ramCacheSize(gguf, cpu)));
    args.push(...this.templateArgs(model, gguf, args));
    // Speculative decoding: a small "draft" model guesses ahead and the big one checks, often 1.5-2x faster.
    // 1.5.16x MTP per brain (the Lab's MTP page, Settings): wins over the one draft for every brain. The brain's own
    // built-in guesser (a multi-token head) needs no second brain; a draft brain is named, never a path.
    const tb = lc.turbo?.[model];
    if (tb?.on && !cpu && (tb.mtp || (tb.draft && tb.draft !== model))) {
      // Engines from about b9530 refuse the old --draft-max/--draft-min and won't start (draftNumArgs picks the names).
      // 1.5.207 PC check: a saved "own guesser" on a brain whose file has none stopped Engine 4. Leave it out then.
      const guess = tb.mtp ? mtpArgs(gguf) : [];
      if (tb.mtp && !guess.length) { this.log?.('engine', `${model}: MTP's own guesser is set, but this brain's file has none (and no mtp- file beside it); starting without it`); return args; }
      if (tb.mtp && guess.includes('-md')) this.log?.('engine', `${model}: MTP's guesser comes from ${path.basename(guess[guess.indexOf('-md') + 1])} beside the brain`);
      if (tb.mtp) args.push(...guess, ...draftNumArgs(this.buildNo(), tb.max || 8));
      else { let dg = null; try { dg = this.resolve(tb.draft).gguf; } catch {} if (dg) args.push('-md', dg, ...draftNumArgs(this.buildNo(), tb.max || 8, 0), '-ngld', '99'); }
      args.push(...keepGuessesArgs(this.turboCfg(model), { args, be: this.beNo() })); // Turbo: keep more guesses (0120)
      // Nov 26 (the Turbo matrix's start check): the Lab's own MTP pick with GUPPI's fill on leaves the guesser's room free
      // too, as everyday MTP does below (its buffers are made after the fill; without room they pushed 200+ MB off the card)
      if (tb.mtp) this.tuneEnv = { ...(this.tuneEnv || {}), ...mtpSpareEnv({ env: this.tuneEnv, step: this.condLoad || 0 }) };
      return args;
    }
    const d = lc.draft;
    if (d?.model && d.model !== model && d.enabled !== false && !cpu) {
      // A file path (a .gguf, or a draft blob inside Ollama's models folder) or an Ollama model name.
      const draft = path.isAbsolute(d.model) || /\.gguf$/i.test(d.model) ? d.model : this.resolve(d.model).gguf;
      args.push('-md', draft, ...draftNumArgs(this.buildNo(), d.max ?? 16, d.min ?? 1), '-ngld', String(d.ngld ?? 99));
    }
    // 102 MTP for everyday brains (opt-in): a brain with its own guesser uses it, unless MTP or a draft is set.
    // Nov 23 (the test PC's gate, twice): with the Conductor driving on a graphics card, MTP's own buffers (made after
    // the fill) still pushed 200+ MB off the card at 32K and it ran 3% slower, so the Conductor runs without everyday MTP.
    { const ev = everydayTurboArgs(this.cfg, { build: this.buildNo(), args, guesser: cpu || this.role === BESIDE || (this.condChat && !this.condApu) ? [] : mtpArgs(gguf), cpu: cpu || this.role === BESIDE });
      args.push(...ev);
      // Nov 23: MTP is on by default, so on a brain where its guesses rarely hold (a small brain, a slow card) Brain
      // Engine pauses drafting while under 30% of guesses are kept (patch 0034), and it never costs writing speed for
      // long. A pause share set by hand wins; other engines ignore the key.
      if (ev.length && this.beNo() > 0) this.tuneEnv = { ...(this.tuneEnv || {}), ...specGateEnv(this.tuneEnv) };
      // Nov 23: with the Conductor's fill on, the MTP draft's own room is left free too (it is made after the fill)
      if (args.some((x, i) => x === '--spec-type' && String(args[i + 1] || '').split(',').includes('draft-mtp'))) this.tuneEnv = { ...(this.tuneEnv || {}), ...mtpSpareEnv({ env: this.tuneEnv, step: this.condLoad || 0 }) }; }
    // 94 Guess-ahead from the chat (opt-in): with no draft brain, the engine guesses by copying what the chat holds.
    args.push(...copyGuessArgs(this.cfg, { build: this.buildNo(), args }));
    // Turbo: keep more guesses (Brain Engine 0120, off unless switched on): where a model drafts, it samples its guesses
    if (this.role !== BESIDE) args.push(...keepGuessesArgs(this.turboCfg(model), { args, be: this.beNo() }));
    return args;
  }

  // Long memory (YaRN): only with the switch on, a brain the guide covers, and a size past what it was made for.
  // Settings set by hand (llamacpp.args with --rope-scaling) win.
  // "Work on repositories" (self-work.js) uses Long memory for its own job even with the switch off: a size past
  // what the brain was made for only reaches here through that job (brain.fitCtx with stretch) or a pick with it on.
  stretchArgs(gguf, ctx) {
    if (!(stretchOn(this.cfg) || selfWorkOn(this.cfg)) || (this.lc.args || []).includes('--rope-scaling')) return [];
    let info = null;
    try { info = ggufInfo(gguf); } catch {}
    const plan = stretchPlan(info);
    // Only past what the file says it was made for (a Qwen3 at 32K stays as it is), stretched from Qwen's own base.
    return plan && ctx > info.ctxTrain && ctx <= plan.most ? yarnArgs(ctx, plan.native) : [];
  }

  // 1.5.32: a brain file with no chat template of its own gets its family's (model-family.js), so tool calls keep
  // the format the brain was trained on instead of llama.cpp's generic ChatML fallback.
  templateArgs(model, gguf, args = []) {
    if (args.some((a) => ['--chat-template', '--chat-template-file'].includes(a))) return [];
    // 228: a brain that kept writing tool calls as text uses its family's template even though its file has one.
    try { const t = templateFor(this.lc, model, gguf, { force: this.careData.templates.includes(model) }); return t ? ['--chat-template-file', t] : []; } catch { return []; }
  }

  // 1.5.32: the family's recommended sampling for this request ({} = llama-server's own defaults).
  // 1.5.148: Qwen3.6 brains get Qwen's preset for the mode (thinking, thinking through code, quick), or the
  // person's own from Settings when they switched that on (cfg.qwenPresets).
  sampling(model, { tools, think, task } = {}) {
    let gguf = null;
    try { gguf = this.resolve(model).gguf; } catch {} // no file found: the family comes from the name alone
    try { return samplingFor(this.lc, model, gguf, { tools, think, task, own: this.cfg?.qwenPresets }); } catch { return {}; }
  }

  // 15 Nov 2026: the family's way to ask for thinking or not (model-family.js thinkKwargs).
  thinkArgs(model, think) {
    let info = null;
    try { const gguf = this.resolve(model).gguf; info = gguf ? ggufInfo(gguf) : null; } catch {}
    return thinkKwargs(familyOf(model, info), think);
  }

  // Nov 24: GUPPI's size for the engine's RAM cache of chats, in MiB (see buildArgs). On built-in graphics the whole brain
  // is in RAM and GUPPI keeps his bigger amount free; on a card only what doesn't fit the card counts.
  ramCacheSize(gguf, cpu) {
    let fileBytes = 0;
    try { fileBytes = fs.statSync(gguf).size; } catch {}
    const shared = this.cfg.sharedGraphics === true;
    const floorMiB = Number(this.tuneEnv?.LLAMA_MOE_RAM_FLOOR_MIB);
    const keepBytes = shared ? apuKeepBytes(this.cfg) : (Number.isFinite(floorMiB) && floorMiB > 0 ? floorMiB : 512) * 1048576;
    const brainRamBytes = cpu || shared || this.role === BESIDE ? fileBytes : Math.max(0, fileBytes - cardGB(this.cfg) * 1024 ** 3);
    return ramCacheMiB({ freeBytes: this.freeRam ? this.freeRam() : os.freemem(), brainRamBytes, keepBytes });
  }

  // ---------- Warm up while typing (1.5.24) ----------
  async slotAction(action, filename) {
    const res = await fetch(`${this.url}/slots/0?action=${action}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ filename }), signal: AbortSignal.timeout(60000) });
    if (!res.ok) throw new Error(`slot ${action}: ${res.status}`);
  }

  // Per-chat engine cache (chat-places.js, on unless switched off): before another chat's reply, the reading the
  // engine holds for the last chat is saved to disk, and the new chat's saved reading (if any) comes back.
  // The engine only reuses the part of a saved reading that still matches the chat, so an edited chat is safe.
  // Nov 24: files are named with this engine run's key (placeKey), so a file from another engine, brain or setting is
  // never loaded. placeOther: a request that wasn't a chat (a title, a summary, warming up) took the engine's one slot,
  // so it no longer holds placeChat's reading (the engine's own RAM cache keeps that one): never saved under its name.
  placeReady(model) {
    return this.role !== BESIDE && Boolean(this.slotDir) && this.slotDir === placesDir(this.cfg) && this.current === model && this.loadedOk && Boolean(this.child) && this.child.exitCode === null;
  }
  placeName(chatId, model) { return placeFile(chatId, model, this.currentCtx || this.lc.ctx || DEFAULT_CTX, this.placeKeyNow || ''); }
  async switchPlace(chatId, model) {
    if (!this.placeReady(model)) return 'none';
    if (this.placeChat === chatId) return 'same';
    if (this.placeSaving) await this.placeSaving; // the save after a reply finishes first
    if (this.active > 0) return 'busy'; // another reply is running: its reading isn't whole yet, so nothing moves
    if (await this.hasVision(model)) return 'none';
    const was = this.placeChat;
    const name = this.placeName(chatId, model);
    if (was && !this.placeOther && this.placeDirty) await this.savePlace(was, model);
    this.placeChat = chatId;
    this.placeOther = false;
    this.placeDirty = false;
    tidyPlaces(this.slotDir, { keepName: [name, ...(was ? [this.placeName(was, model)] : [])] });
    if (!fs.existsSync(path.join(this.slotDir, name))) return was ? 'saved' : 'new';
    try {
      await this.slotAction('restore', name);
    } catch (e) {
      // a file the engine won't take (cut short, another memory layout): it goes, and the chat is read again
      try { fs.rmSync(path.join(this.slotDir, name), { force: true }); } catch {}
      this.log?.('engine', `${model}: this chat's saved reading didn't load (${e.message}), so it is read again`);
      return 'refused';
    }
    try { const now = new Date(); fs.utimesSync(path.join(this.slotDir, name), now, now); } catch {}
    return 'restored';
  }

  // Saves what the engine holds for this chat: to a tmp- name first, renamed when whole. Not while the drive is low.
  async savePlace(chatId, model) {
    const name = this.placeName(chatId, model);
    const file = path.join(this.slotDir, name);
    let need = 0;
    try { need = fs.statSync(file).size; } catch {}
    const room = diskRoom(this.slotDir, need);
    if (!room.ok) { this.log?.('engine', `${model}: the drive is low (${Math.round(room.free / 1e9)} GB free, ${Math.round(room.keep / 1e9)} GB kept free), so this chat's reading isn't saved`); return false; }
    const tmp = tmpFile(name);
    try {
      await this.slotAction('save', tmp);
      fs.renameSync(path.join(this.slotDir, tmp), file);
      this.placeDirty = false;
      return true;
    } catch (e) {
      try { fs.rmSync(path.join(this.slotDir, tmp), { force: true }); } catch {}
      this.log?.('engine', `${model}: this chat's reading wasn't saved (${e.message})`);
      return false;
    }
  }

  // After a reply: a chat's reading goes to disk PLACE_IDLE_MS later, when nothing else is running, so a restart, a
  // crash or quitting Bob costs at most the newest turn. A request in between pushes it back.
  placeAfterReply(model) {
    clearTimeout(this.placeTimer);
    if (!chatPlacesOn(this.cfg) || !this.placeChat || !this.placeReady(model)) return;
    const chatId = this.placeChat, child = this.child;
    this.placeTimer = setTimeout(() => {
      if (this.child !== child || this.placeChat !== chatId || this.active > 0 || this.placeOther || !this.placeDirty || !this.placeReady(model)) return;
      this.active++;
      this.placeSaving = this.savePlace(chatId, model).catch(() => {}).finally(() => { this.active--; this.placeSaving = null; });
    }, PLACE_IDLE_MS);
    this.placeTimer.unref?.();
  }

  // Before the engine stops (another brain, new settings, unload): the chat it holds goes to disk first, within 30 s.
  async placeBeforeStop() {
    clearTimeout(this.placeTimer);
    if (this.placeSaving) await this.placeSaving;
    const model = this.current;
    if (!chatPlacesOn(this.cfg) || !this.placeChat || this.placeOther || !this.placeDirty || this.active > 0 || !this.placeReady(model)) return;
    await Promise.race([this.savePlace(this.placeChat, model), new Promise((r) => setTimeout(r, 30000).unref?.())]).catch(() => {});
  }

  // Loads the saved reading for this brain, if there is one. Pictures-capable brains can't save one (llama-server).
  async restoreStart(model, ctx) {
    const name = startFile(model, ctx || this.lc.ctx || DEFAULT_CTX);
    const file = path.join(startDir(this.cfg), name);
    if (!fs.existsSync(file) || (await this.hasVision(model))) return false;
    try {
      await this.slotAction('restore', name);
      this.primedHash = JSON.parse(fs.readFileSync(file.replace(/\.bin$/, '.json'), 'utf8')).hash || null;
      return true;
    } catch { this.primedHash = null; return false; }
  }

  // Reads the instructions (system prompt and tools) now, so the next message only has to read itself.
  // The reply is one word, thrown away; llama-server keeps the reading for the next request. On the processor the
  // reading is also saved to disk. Returns 'ready' (already read), 'read' or 'saved'.
  async prime(model, { ctx, cpu = false, messages, tools } = {}) {
    if (this.current !== model || !this.child || this.child.exitCode !== null) return null;
    const hash = promptHash(messages, tools);
    if (this.primedHash === hash) return 'ready';
    if (this.role !== BESIDE) this.placeOther = true; // Nov 24: the instructions alone now sit in the slot, not a chat
    this.active++;
    try {
      await this.sendPerWord(model); // before the reading, which a change of experts per word would throw away
      const res = await fetch(this.url + '/v1/chat/completions', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ model, messages: [...LlamaCpp.toOpenAI(messages), { role: 'user', content: '.' }], tools: tools?.length ? tools : undefined, max_tokens: 1, stream: false, cache_prompt: true, chat_template_kwargs: { enable_thinking: false } }),
        signal: AbortSignal.timeout(600000)
      });
      if (!res.ok) throw new Error(`llama-server returned ${res.status}`);
      await res.text();
      this.primedHash = hash;
      if (!cpu || !tuning(this.cfg).readyWhileTyping || (await this.hasVision(model))) return 'read';
      const name = startFile(model, ctx || this.lc.ctx || DEFAULT_CTX);
      await this.slotAction('save', name);
      try { fs.writeFileSync(path.join(startDir(this.cfg), name.replace(/\.bin$/, '.json')), JSON.stringify({ hash, model, ctx, saved: new Date().toISOString() })); } catch {}
      tidyStarts(startDir(this.cfg), model, name);
      return 'saved';
    } finally { this.active--; this.lastUse = this.now(); }
  }

  async estimateLoad(model, opts) {
    const b = this.route(opts);
    if (b) return b.estimateLoad(model);
    if (this.loadTimes[model]) return Math.round(this.loadTimes[model]);
    try {
      const gb = fs.statSync(this.resolve(model).gguf).size / 1e9;
      return Math.max(5, Math.round(gb * 0.9));
    } catch { return 15; }
  }

  // Item 213: a reply whose job was stopped but which hasn't let go of the engine.
  stuckAfterStop() { return [...(this.inflight || [])].some((e) => e.signal?.aborted) || Boolean(this.beside?.stuckAfterStop?.()); }
  async resetStuck() {
    if (this.beside?.stuckAfterStop?.()) await this.dropBeside();
    if ([...(this.inflight || [])].some((e) => e.signal?.aborted)) await this.stopServer();
  }

  // Item 216: how long a load of this brain may take before it is stopped and tried again (seconds), for the load line.
  loadLimit(model, opts) {
    const b = this.route(opts);
    if (b) return b.loadLimit(model);
    return loadDeadline(this.loadTimes[model], this.lc.loadTimeoutSeconds || 300).soft;
  }

  // Lets go of one brain (Bob's own engine holds one at a time). Returns the names unloaded.
  // 1.5.51: beside: true only the second server's; otherwise the main one's (the second server is let go by dropBeside).
  async unload(model, opts) {
    if (this.route(opts)) return this.beside?.current === model ? this.dropBeside() : [];
    if (!this.current || this.current !== model) return [];
    await this.stopServer();
    return [model];
  }

  // Counts as use, so the idle clock starts again (someone is typing).
  touch(model, opts) { const b = this.route(opts); if (b) return b.touch(); this.lastUse = this.now(); }

  // 1.5.40: make room on the graphics card. A brain running on the processor stays (Art keeps chatting on it while a
  // picture paints); one on the card goes.
  async unloadGpu() {
    const side = this.beside?.currentCard === 'whole' ? await this.dropBeside() : []; // 1.5.51: the second server only if it sits on the card
    if (this.current && this.currentCpu && !['whole', 'borrow'].includes(this.currentCard)) return side;
    const was = this.current;
    await this.stopServer();
    return [...(was ? [was] : []), ...side];
  }

  // 1.5.72: the Memory slot's embedding model, on its own small server (src/embedder.js). Same call as Ollama's.
  embedder() {
    if (this.role === BESIDE) return this.main.embedder();
    return (this.embedServer ||= new Embedder(this.cfg, { resolve: (m) => this.catalogFile(m), port: this.lc.embedPort || this.port + 2 }));
  }
  async embed(model, input) { return this.embedder().embed(model, input); }

  async unloadAll() {
    const was = this.current;
    if (this.role !== BESIDE) this.embedServer?.stop();
    const side = this.role !== BESIDE ? await this.dropBeside() : [];
    await this.stopServer();
    return [...(was ? [was] : []), ...side];
  }

  async stopServer() {
    await this.placeBeforeStop(); // Nov 24: the chat the engine holds is saved first (Per-chat engine cache)
    if (this.role !== BESIDE) this.spread?.close(); // lent cards go back with the brain
    const c = this.child;
    if (this.role === BESIDE && this.current) this.changed?.({ action: 'leave', model: this.current });
    this.child = null;
    this.current = null;
    this.currentCtx = null;
    this.currentCpu = false;
    this.currentCard = null;
    if (!c || c.exitCode !== null) return;
    await new Promise((r) => { c.once('exit', r); c.kill(); setTimeout(r, 5000); });
  }

  async preload(model, signal, opts = {}) {
    const b = this.route({ beside: opts.beside });
    if (b) return b.preload(model, signal, { ctx: opts.ctx, cpu: true, reserveMB: opts.reserveMB || 0, place: opts.place ?? null, retried: opts.retried });
    // 223: one engine start at a time. A second job asking for the same brain waits for that load and uses it;
    // a job asking for another brain waits its turn instead of starting the engine over the first one.
    const key = `${model}|${opts.ctx || ''}|${this.role === BESIDE || opts.cpu ? 1 : 0}`;
    while (this.starting) {
      const s = this.starting;
      let failed = null;
      try { await s.p; } catch (e) { failed = e; }
      if (signal?.aborted) throw new Error('Stopped.');
      if (this.starting === s) this.starting = null;
      if (s.key !== key) continue;
      if (!failed && (await this.isLoaded(model, { ctx: opts.ctx, cpu: opts.cpu }))) {
        this.lastUse = this.now();
        this.log?.('engine', `${model}: another job was already loading it; using that load`);
        return this.loadTimes[model] || 0;
      }
      if (failed && !/^Stopped\.$/.test(failed.message)) throw failed; // the same load just failed: say why, don't start it again at once
    }
    const me = { key, p: this.startCareful(model, signal, opts) };
    this.starting = me;
    try { return await me.p; } finally { if (this.starting === me) this.starting = null; }
  }

  // 218/220/221/222/226/227 around one engine start (startEngine).
  async startCareful(model, signal, opts = {}) {
    const cpu = this.role === BESIDE || Boolean(opts.cpu);
    const label = this.label(model);
    const stop = (e, extra = {}) => Object.assign(e, { noRetry: true }, extra); // the gate's own retries won't help these
    // 218: crashed too often lately: not again until the window passes.
    if (this.crashes.spent(model)) throw stop(new Error(crashHoldLine(label, this.crashes.recent(model).length, this.crashReason?.[model] || '', Math.ceil(this.crashes.waitMs(model) / 60000))), { code: 'crash_hold' });
    // 227: the file looks like a brain file and still matches its download.
    let gguf = null;
    try { gguf = this.resolve(model).gguf; } catch {}
    if (gguf) {
      const bad = await checkBrainFile(this.cfg, gguf, { log: (t) => this.log?.('engine', t), ...(this.hashFile ? { hash: this.hashFile } : {}) });
      if (bad) { this.log?.('engine', `${model}: not loading it: ${bad}`); throw stop(new Error(`The ${label} can't load: ${bad}.`), { code: 'bad_file' }); }
    }
    const asked = opts.ctx || this.lc.ctx || DEFAULT_CTX;
    const sk = `${model}|${cpu ? 1 : 0}|${asked}`;
    const most = this.apuMaxCtx(model);
    const o = { ...opts, ...(this.shrunk[sk] ? { ctx: this.shrunk[sk].got } : most && asked > most ? { ctx: most } : {}) };
    try { return await this.startEngine(model, signal, o); }
    catch (e) {
      if (signal?.aborted || /^Stopped\.$/.test(e.message) || e.fellBack) throw e;
      let out = `${this.lastLoadOut || ''}\n${e.message}`;
      // Nov 12 (apu-fit.js): on built-in graphics a load that ran out of memory first puts less on the graphics (half,
      // then the processor alone) at the chat memory asked for, and that is remembered for this brain.
      for (let i = 0; i < 2 && this.cfg.sharedGraphics === true && !cpu && e.code !== 'no_room' && memoryFailure(out); i++) {
        const step = this.apuStepDown(model, { cpu, ctx: o.ctx || asked, why: plainEngineError(out) || 'out of memory while loading', shareOnly: true });
        if (!step) break;
        try { return await this.startEngine(model, signal, { ...o, roomChecked: true }); }
        catch (e2) { if (signal?.aborted || /^Stopped\.$/.test(e2.message) || e2.fellBack) throw e2; e = e2; out = `${this.lastLoadOut || ''}\n${e2.message}`; }
      }
      // 220/221: no room, or the engine ran out of memory: once more with a smaller chat memory.
      if (e.code === 'no_room' || memoryFailure(out)) {
        const from = o.ctx || asked;
        const to = e.code === 'no_room' ? e.fitsCtx : shrinkCtx(from);
        if (to && to < from && !this.shrunk[sk]) {
          this.log?.('engine', `${model}: not enough memory at ${from} (chat memory); trying once more at ${to}`);
          try {
            const secs = await this.startEngine(model, signal, { ...o, ctx: to, roomChecked: true });
            this.shrunk[sk] = { got: to, at: this.now() };
            this.note(shrinkLine(label, from, to));
            return secs;
          } catch (e2) { if (signal?.aborted || /^Stopped\.$/.test(e2.message)) throw e2; e = e2; }
        }
        if (e.code === 'no_room') throw stop(e);
        throw stop(this.plainError(model, e, `${this.lastLoadOut || ''}\n${e.message}`));
      }
      // 222: the settings that started this brain last time, once, when today's differ.
      const good = this.careData.lastGood[`${model}|${cpu ? 1 : 0}`];
      if (good?.args?.length && this.lastArgs && !opts.args && !sameSettings(this.lastArgs, good.args)) {
        this.log?.('engine', `${model} didn't start (${plainEngineError(out) || e.message.slice(0, 160)}); trying the settings that worked on ${good.at}: ${settingsDiff(this.lastArgs, good.args)}`);
        try {
          const secs = await this.startEngine(model, signal, { ...o, args: good.args });
          this.note(lastGoodLine(label, good.at));
          return secs;
        } catch (e2) { if (signal?.aborted || /^Stopped\.$/.test(e2.message)) throw e2; throw stop(this.plainError(model, e, out)); }
      }
      throw this.plainError(model, e, out);
    }
  }

  // Brain Engine 0035 ("Resize chat memory without reloading", Settings, How Bob works; off unless switched on): asks the
  // running engine to change its chat memory and keep the brain loaded. Only for the main engine, the same brain, no
  // reply running, and settings that differ only in -c. Any refusal (an engine without it answers 404) means the usual
  // restart. The engine empties its reading, so the chat is read again.
  async resizeInPlace(model, args, prevArgs, cpu) {
    if (this.cfg?.contextNoReload !== true || this.role === BESIDE || this.spreadNow) return false;
    if (this.current !== model || !this.loadedOk || !this.child || this.child.exitCode !== null || Boolean(this.currentCpu) !== Boolean(cpu) || this.active > 0) return false;
    if (!sameExceptCtx(args, prevArgs)) return false;
    const n = Number(args[args.indexOf('-c') + 1]);
    if (!(n > 0)) return false;
    // Progressive chat memory's steps are set when the engine starts; a size that needs other steps starts it again
    if (this.tiersFor(model, n) !== this.tiersFor(model, Number(prevArgs[prevArgs.indexOf('-c') + 1]))) return false;
    try {
      const res = await fetch(`${this.url}/context`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n_ctx: n }), signal: AbortSignal.timeout(300000) });
      if (!res.ok) { this.log?.('engine', `${model}: the engine can't change its chat memory in place (${res.status}); starting it again instead`); return false; }
      const r = await res.json();
      this.log?.('engine', `${model}: chat memory ${r.n_ctx_old} -> ${r.n_ctx} without loading the brain again (${Number(r.seconds || 0).toFixed(1)} s)`);
      return true;
    } catch (e) {
      this.log?.('engine', `${model}: changing the chat memory in place didn't work (${e.message}); starting it again instead`);
      return false;
    }
  }

  // 226: the engine's own last words, as the plain reason; the original message stays after it for the logbook.
  plainError(model, e, out) {
    const why = plainEngineError(out);
    if (!why || String(e.message).includes(why)) return e;
    return Object.assign(new Error(`The ${this.label(model)} wouldn't start: ${why}. (${String(e.message).slice(0, 400)})`), { code: e.code, noRetry: e.noRetry, fellBack: e.fellBack, reason: why });
  }

  // 220: is there room for this brain right now? Read from the card and the RAM free at this moment, after the last
  // brain was let go. Only decides when the brain is read in whole (card plus RAM) or must sit on the card alone; a
  // brain read from the drive as needed (bigger than memory) can't be judged this way. null: no reading.
  async roomNow(model, ctx, args, cpu) {
    let gguf, size = 0;
    try { gguf = this.resolve(model).gguf; size = fs.statSync(gguf).size; } catch { return null; }
    if (cpu || !size || this.biggerThanMemory(gguf)) return null;
    const cardOnly = args.includes('-ngl') && args[args.indexOf('-ngl') + 1] === '999' && !args.includes('--fit');
    if (!cardOnly && !this.readsWhole(args, cpu, gguf)) return null;
    const card = await (this.cardReaders?.card || this.main?.cardReaders?.card || (process.env.BOB_TEST ? async () => null : readCard))().catch(() => null); // tests never read the real card
    if (!card || !Number.isFinite(card.freeMB)) return null;
    let shape = null;
    try { shape = ggufInfo(gguf)?.shape; } catch {}
    const kvFor = (c) => kvBytes(shape, c, memArgs(this.cfg, model, this.lc.args, this.memCaps()), this.tiersFor(model, c)) || 0;
    return { ...memCheck({ fileBytes: size, kvFor, ctx, cardFreeMB: card.freeMB, ramFreeBytes: this.freeRam ? this.freeRam() : os.freemem(), cardOnly }), cardFreeMB: card.freeMB };
  }

  // ---------- Nov 12: brains on built-in graphics (apu-fit.js) ----------
  // What this brain needs at a chat memory size: { card, cpu } in bytes, or null when the file can't be read.
  apuNeed(model, ctx) {
    let gguf, size = 0, extra = 0;
    try { const r = this.resolve(model); gguf = r.gguf; size = fs.statSync(gguf).size; if (r.mmproj && this.lc.vision !== false && !(this.lc.noEyes || []).includes(model) && !this.eyesShut?.has(model)) { try { extra = fs.statSync(r.mmproj).size; } catch {} } } catch { return null; }
    let shape = null, experts = 0;
    try { const info = ggufInfo(gguf); shape = info?.shape; } catch {}
    // Nov 24: ggufInfo reads the expert count now, but built-in graphics keep counting every brain as dense (the whole
    // file), which is what the Legion Go's measured safe range was found with, until a Go check of the smaller count
    experts = 0;
    const c = ctx || this.lc.ctx || DEFAULT_CTX;
    const kv = kvBytes(shape, c, memArgs(this.cfg, model, this.lc.args, this.memCaps()), this.tiersFor(model, c)) ?? Math.min(c, 131072) * 60 * 1024;
    return apuNeed({ fileBytes: size, kvBytes: kv, ubatch: this.lc.ubatch || 512, extraBytes: extra, experts });
  }
  apuMaxCtx(model) { return this.cfg.sharedGraphics === true ? Number(this.careData.apuFit?.[model]?.maxCtx) || 0 : 0; }
  // A placement set by hand (layers, experts, the Brains page, flags in the config file) is never changed.
  handPlaced(model) {
    const lc = this.lc;
    let modelArgs = [];
    try { modelArgs = this.resolve(model).args || lc.modelArgs?.[model] || []; } catch {}
    const hand = [...(lc.preArgs || []), ...(Array.isArray(lc.args) ? lc.args : []), ...modelArgs];
    if (Number.isInteger(lc.gpuLayers) || Number.isInteger(lc.nCpuMoe?.[model]) || lc.fit === false) return true;
    let gguf = null;
    try { gguf = this.resolve(model).gguf; } catch {}
    if (placeArgs(this.cfg, model, { cpu: false, layers: (gguf && ggufInfo(gguf)?.shape?.layers) || 0 }).length) return true;
    return hand.some((a) => ['-ngl', '--n-gpu-layers', '--gpu-layers', '--fit', '-ot', '--override-tensor', '--n-cpu-moe', '-ncmoe', '--cpu-moe', '-dev', '--device', '-ts', '--tensor-split'].includes(a));
  }
  handLoadMode(model) {
    const lc = this.lc;
    let modelArgs = [];
    try { modelArgs = this.resolve(model).args || lc.modelArgs?.[model] || []; } catch {}
    return [...(lc.preArgs || []), ...(Array.isArray(lc.args) ? lc.args : []), ...modelArgs].some((a) => ['--load-mode', '-lm', '--mmap', '--no-mmap'].includes(a));
  }
  // Where the brain goes on built-in graphics, right before the engine starts (after the last brain let go): wholly on
  // the graphics when it fits with room to spare, else as many layers as fit, else the processor alone. Changes args.
  apuFit(model, args, ctx) {
    if (this.cfg.sharedGraphics !== true || this.role === BESIDE || this.handPlaced(model)) return null;
    const need = this.apuNeed(model, ctx);
    if (!need) return null;
    let layers = 0;
    try { layers = ggufInfo(this.resolve(model).gguf)?.shape?.layers || 0; } catch {}
    const rec = this.careData.apuFit?.[model];
    const share = rec && Number.isFinite(rec.share) ? rec.share : 1;
    const free = this.freeRam ? this.freeRam() : os.freemem();
    const plan = apuPlace({ need, layers, freeBytes: free, keepBytes: apuKeepBytes(this.cfg), carveBytes: Math.max(0, ((Number(this.cfg.reservedGraphicsGB) || 0) - 0.5) * 1024 ** 3), budgetBytes: cardGB(this.cfg) * 1024 ** 3, share });
    if (!plan) return null;
    const drop = (flag, value = true) => { for (let i = args.length - 1; i >= 0; i--) if (args[i] === flag) args.splice(i, value ? 2 : 1); };
    for (const f of ['-ngl', '--n-gpu-layers', '--fit', '--fit-target', '-fitt', '-dev', '--device']) drop(f);
    if (plan.place === 'card') args.push('-ngl', '999');
    else {
      args.push('-ngl', String(plan.layers));
      if (plan.place === 'cpu' && this.buildNo() >= 5000) args.push('--device', 'none'); // nothing on the graphics at all
      // The processor's part is read from the drive as needed (memory-mapped), so Windows can let go of it.
      // Nov 23 (Legion Go): left to itself, llama.cpp turns memory-mapping off whenever a device can't map files, and
      // Vulkan on built-in graphics says it can't, so the processor's part was copied into pinned RAM (gemma4-e2b at
      // 12 of 35 layers: 2.3 GB of "shared GPU memory"). --load-mode mmap keeps it mapped: 3.5 -> 1.2 GB shared, 0.5-0.9 GB
      // more free, same speed, same words (8 runs). A load mode set by hand in llamacpp.args is kept.
      if (!this.handLoadMode(model)) {
        drop('--load-mode'); drop('--no-mmap', false); drop('--mmap', false);
        if (this.loadFlag() === 'load-mode') args.push('--load-mode', 'mmap');
      }
    }
    const gb = (b) => Math.round((b / 1024 ** 3) * 10) / 10;
    const where = plan.place === 'card' ? 'wholly on the graphics' : plan.place === 'split' ? `${plan.layers} of ${layers} layers on the graphics, the rest on the processor` : 'on the processor alone';
    this.apuNow = { model, place: plan.place, layers: plan.layers, share };
    try { this.log?.('engine', `${model}: built-in graphics, ${where} (needs ~${gb(need.card)} GB on the graphics or ~${gb(need.cpu)} GB on the processor at ${Math.round((ctx || this.lc.ctx || DEFAULT_CTX) / 1024)}K; ${gb(free)} GB free, graphics room ~${gb(plan.cardRoom)} GB${share < 1 ? `, ${Math.round(share * 100)}% share after running out of memory before` : ''})`); } catch {}
    return plan;
  }
  // Ran out of memory on built-in graphics: the next load of this brain uses less (half the graphics room, then the
  // processor alone, then half the chat memory), remembered in engine-care.json and said in the logbook. shareOnly: only
  // the graphics share may change (a load retried at the chat memory asked for). Returns the step, or null.
  apuStepDown(model, { cpu = false, ctx = 0, why = '', shareOnly = false } = {}) {
    if (this.cfg.sharedGraphics !== true || !model) return null;
    const rec = this.careData.apuFit[model] || {};
    const share = Number.isFinite(rec.share) ? rec.share : 1;
    const placedCpu = cpu || this.role === BESIDE || this.handPlaced(model) || (this.apuNow?.model === model && this.apuNow.place === 'cpu');
    const step = nextStep({ share: placedCpu ? 0 : share, ctx: Math.min(Number(ctx) || this.lc.ctx || DEFAULT_CTX, rec.maxCtx || Infinity), cpu: placedCpu });
    if (!step || (shareOnly && step.share === undefined)) return null;
    this.careData.apuFit[model] = { ...rec, ...(step.share !== undefined ? { share: step.share } : { share: 0, maxCtx: step.ctx }), at: new Date().toISOString().slice(0, 16).replace('T', ' '), why: String(why || '').slice(0, 120) };
    this.saveCare();
    if (!shareOnly) this.reloadWanted.add(model);
    try { this.log?.('engine', `${model}: ran out of memory on built-in graphics (${String(why || 'out of memory').slice(0, 120)}); loading it ${stepWords(step)} from now on`); } catch {}
    if (step.ctx) this.note(shrinkLine(this.label(model), Math.min(Number(ctx) || DEFAULT_CTX, rec.maxCtx || Infinity), step.ctx).replace('Long chats get trimmed sooner until Bob restarts.', 'Long chats get trimmed sooner on this machine.'));
    return step;
  }
  // The engine's last words (crash or failed reply), for telling an out-of-memory failure from others.
  lastWords() { return this.outTail ? this.outTail() : ''; }

  // 218: the engine stopped by itself after its brain loaded.
  crashed({ model, code, sig, tail, opts }) {
    if (code !== 0) { try { this.onCrash?.({ model, code, tail }); } catch {} } // Catch crashes (crash-catch.js, off unless switched on)
    const n = this.crashes.note(model);
    const reason = plainEngineError(tail);
    (this.crashReason ||= {})[model] = reason;
    this.log?.('engine', `${model}: the engine stopped by itself (${sig || `code ${code}`})${reason ? `: ${reason}` : ''}; ${n} crash${n === 1 ? '' : 'es'} in the last 10 min`);
    if (this.crashes.spent(model)) {
      const line = crashHoldLine(this.label(model), n, reason, Math.ceil(this.crashes.waitMs(model) / 60000));
      this.log?.('engine', `${model}: not restarting it again for now`);
      this.note(line);
      return;
    }
    if (this.active > 0) return; // the reply that was running loads it again itself (brain.chatRetry)
    if (memoryFailure(tail)) this.apuStepDown(model, { cpu: opts?.cpu, ctx: opts?.ctx, why: reason }); // Nov 12: built-in graphics only
    const t = setTimeout(() => {
      if ((this.child && this.child.exitCode === null) || this.current !== model || this.starting) return; // something else loaded meanwhile
      this.log?.('engine', `${model}: restarting the engine by itself`);
      this.preload(model, undefined, opts).then(() => this.log?.('engine', `${model}: back up after the crash`)).catch((e) => this.log?.('engine', `${model}: couldn't restart it (${e.message.slice(0, 200)})`));
    }, this.restartDelayMs ?? 1500);
    t.unref?.();
  }

  // 225: one reply's speed against this brain's usual.
  speedNote(model, timings, promptTokens) {
    if (this.spreadNow || gaming(this.cfg) || !timings) return;
    const m = this.current || model;
    const hit = this.speeds.add(speedKey({ model: m, cpu: this.currentCpu, ctx: this.currentCtx }), speedBucket(promptTokens), Number(timings.predicted_per_second) || 0, Number(timings.predicted_n) || 0);
    if (this.now() - (this.speedSaved || 0) > 60_000) { this.speedSaved = this.now(); this.saveCare(); }
    if (!hit) return;
    this.log?.('engine', `${m}: answering at ${hit.now} tok/s, under ${Math.round(hit.usual * 0.4)} (its usual is ${hit.usual}); loading it fresh before the next job`);
    this.reloadWanted.add(m);
    this.note(slowLine(this.label(m), hit.now, hit.usual));
  }

  // 228: tool calls written as text, reply after reply.
  textCallNote(model, r) {
    if (!this.textCallWatch?.note(model, r)) return; // a bare engine (tests) has no watch
    const d = this.careData;
    d.templatesTried ||= [];
    if (d.templates.includes(model)) {
      d.templates = d.templates.filter((x) => x !== model);
      this.saveCare();
      this.reloadWanted.add(model);
      this.log?.('engine', `${model}: its family's chat template didn't stop the text tool calls; back to its own template`);
      return;
    }
    if (d.templatesTried.includes(model)) return;
    let gguf = null;
    try { gguf = this.resolve(model).gguf; } catch { return; }
    const fam = templateFor(this.lc, model, gguf, { force: true });
    if (!fam || fam === templateFor(this.lc, model, gguf)) { this.log?.('engine', `${model}: writes its tool calls as text, and there is no family template to try (Bob still reads those calls)`); d.templatesTried.push(model); this.saveCare(); return; }
    d.templates.push(model); d.templatesTried.push(model);
    this.saveCare();
    this.reloadWanted.add(model);
    this.log?.('engine', `${model}: wrote its tool calls as text ${3} replies in a row; loading it with its family's template (${path.basename(fam)}) from the next job`);
    this.note(templateLine(this.label(model)));
  }

  // The engine start itself.
  // 1.5.210 (Go Wi-Fi test): Stop with no chat job running (a load from Settings, a warm-up) returned stopped:false
  // and the "still loading over Bob-Net" wait ran on. Every load now has its own stop, and stopLoad() ends them all.
  async startEngine(model, signal, opts = {}) {
    const ctl = new AbortController();
    (this.loadCtls ||= new Set()).add(ctl);
    try { return await this.startEngineNow(model, signal ? AbortSignal.any([signal, ctl.signal]) : ctl.signal, opts); }
    finally { this.loadCtls.delete(ctl); }
  }
  stopLoad() {
    const all = [...(this.loadCtls || [])];
    for (const c of all) c.abort();
    const b = this.beside?.stopLoad?.() || false;
    if (all.length) { try { this.log?.('engine', 'Stop pressed while a brain was loading: the load ended'); } catch {} }
    return all.length > 0 || b;
  }

  // The engine's environment for a start (its keys: Turbo's tricks, Engine tuning, the hot-expert profile, Progressive
  // memory, the sharp start, SCUT, locked RAM, the doorbell). Nov 26: its own step, so the Turbo test matrix
  // (model-lab/turbo-start.mjs) starts the engine with exactly what Bob would give it.
  startEnv(model, args, { ctx, card, helpers = [] } = {}) {
    const tc = this.turboCfg(model);
    let env = card === 'none' ? { ...process.env, CUDA_VISIBLE_DEVICES: '-1' } : process.env; // 'none': llama.cpp can't see the card at all
    if (args.includes('--moe-cache-mib') && turboStandins(tc) && this.role !== BESIDE) { env = { ...env, ...STANDIN_ENV }; this.log?.('engine', `${model}: Turbo stand-ins on (up to 2 missed experts a layer stood in for while writing; the words change)`); }
    else if (args.includes('--moe-cache-mib') && turboDriveStandins(tc) && this.role !== BESIDE) { env = { ...env, ...DRIVE_STANDIN_ENV }; this.log?.('engine', `${model}: Turbo: never wait on the drive (an expert no longer in RAM is stood in for while writing; the words change)`); }
    { const kg = keepGuessesEnv(tc, { args, be: this.beNo() }); if (kg.LLAMA_SPEC_MB) { env = { ...env, ...kg }; this.log?.('engine', `${model}: Turbo: keep more guesses on (a guess the exact check throws away is kept when the brain rates it at least as likely; the words change)`); } }
    if (this.tuneEnv && Object.keys(this.tuneEnv).length) env = { ...env, ...this.tuneEnv }; // Engine tuning, set by hand
    if (this.tuneEnv?.LLAMA_MOE_CACHE_SAVE) { try { fs.mkdirSync(path.dirname(this.tuneEnv.LLAMA_MOE_CACHE_SAVE), { recursive: true }); } catch {} } // the engine writes the saved hot set there
    if (args.includes('--moe-cache-mib') && this.hotEnv?.[RANKING_ENV]) env = { ...env, ...this.hotEnv }; // Nov 16: the hot-expert profile (patch 0016)
    // Nov 20 (patch 0039, opt-in): Progressive chat memory, the newest words kept sharper. Its steps come from the
    // context it loads with (a resize in place that would need other steps starts the engine again instead).
    { const t = tiersEnv(tc, model, ctx || this.lc.ctx || DEFAULT_CTX, { ...this.memCaps(), handArgs: args }); if (t.LLAMA_KV_TIERS) { env = { ...env, ...t }; this.log?.('engine', `${model}: Progressive chat memory, sharper copies of the newest words (${t.LLAMA_KV_TIERS})`); } }
    // Nov 24 (patch 0122, Turbo only, off unless switched on): the sharp start, the chat's first tokens kept at 16-bit
    { const s = sinkEnv(tc, model, ctx || this.lc.ctx || DEFAULT_CTX, { ...this.memCaps(), handArgs: args }); if (s.LLAMA_KV_SINK) { env = { ...env, ...s }; this.log?.('engine', `${model}: Turbo: sharp start, the chat's first tokens kept at 16-bit (${s.LLAMA_KV_SINK}; the words change a little)`); } }
    if (helpers.length) env = { ...env, ...scutEnv(this.cfg, { wired: Boolean(this.spread?.allWired?.()) }), ...linkEnv(this.cfg), ...(this.spread?.sealEnv?.() || {}) }; // SCUT (off unless switched on): the fast link to the lent cards, sealed unless that's switched off
    { const rr = registerRamEnv(env, { args, cpu: card === 'none' }); if (rr.LLAMA_MOE_REGISTER_RAM) { env = { ...env, ...rr }; this.log?.('engine', `${model}: the experts in RAM are locked there for the card (Linux default, Brain Engine 0109)`); } }
    { const db = doorbellEnv(env); if (Object.keys(db).length) { env = { ...env, ...db }; this.log?.('engine', `${model}: the doorbell is on, so ${Object.entries(db).map(([k, v]) => `${k}=${v}`).join(' and ')} (safe on Windows)`); } }
    return env;
  }
  // Nov 26: the settings this brain's start uses: this PC's GUPPI profile can leave out Turbo tricks that didn't add
  // speed here (guppi-calibrate.js, Turbo pass). Turbo stays on; only the named tricks are left out.
  turboCfg(model) {
    if (this.cfg?.turbo !== true) return this.cfg;
    const drop = this.guppiProfile?.(model)?.turboDrop || [];
    if (drop.length && this.turboDropSaid !== `${model}:${drop}`) { this.turboDropSaid = `${model}:${drop}`; this.log?.('engine', `${model}: GUPPI leaves out ${drop.map((k) => TURBO_TRICK_NAMES[k] || k).join(', ')} here: it didn't add speed on this PC when he calibrated`); }
    return withTurboDrop(this.cfg, drop);
  }

  async startEngineNow(model, signal, { ctx, cpu = false, beside = false, reserveMB = 0, place = null, noSpread = false, args: fixedArgs = null, roomChecked = false, retried = false } = {}) {
    if (this.role === BESIDE) cpu = true;
    this.lastLoadOut = '';
    if (this.reloadWanted.delete(model)) this.log?.('engine', `${model}: loading it fresh, as planned`);
    const t0 = Date.now();
    this.lastUse = this.now();
    // 1.5.32: in the Gaming session the "Gaming: graphics card" switch decides how much of the card the brain may use.
    // 1.5.51: the second server: the place picked for the load line (if fresh), or a new look at the card.
    // 1.5.133: a pick made without room kept for the main brain doesn't count when the load asks to keep some.
    const fresh = this.placed && this.placed.model === model && Date.now() - this.placed.at < 60000 && (this.placed.reserveMB || 0) >= (reserveMB || 0) ? this.placed.place : null;
    // 1.5.133: place 'none' (the talker kept beside a job) means the processor, whatever the card looks like now.
    if (this.role === BESIDE && place === 'none') { try { this.log?.('engine', `second brain ${model}: on the processor, chat memory ${ctx || this.lc.ctx || DEFAULT_CTX} (kept off the card beside a job)`); } catch {} }
    const card = this.role === BESIDE ? (place === 'none' ? 'none' : fresh || (await this.besidePlace(model, ctx, { reserveMB }))) : cpu && gaming(this.cfg) ? await this.gamingCardPlan(model) : null;
    this.placed = null;
    // 222: settings that worked before come in whole; the chat memory asked for now still goes in.
    const args = fixedArgs ? withFlag(fixedArgs, '-c', String(ctx || this.lc.ctx || DEFAULT_CTX)) : this.buildArgs(model, { ctx, cpu, card });
    const prevArgs = this.lastArgs;
    this.lastArgs = args;
    // Brain Engine 0035: the same brain with only a new chat memory: changed in place, the brain stays loaded
    if (await this.resizeInPlace(model, args, prevArgs, cpu)) {
      this.currentCtx = ctx || null;
      this.primedHash = null;
      this.placeChat = null; // the engine's reading was emptied: nothing of the last chat to save
      const secs = (Date.now() - t0) / 1000;
      return secs;
    }
    await this.stopServer();
    // Bob-Net: a brain too big for this replicant matrix can go over your other Bobs' lent cards (src/share-card.js).
    // Off unless "Spread big brains over my other Bobs' cards" is on; none answering means it loads here like always.
    let helpers = [];
    let sizeGB = 0;
    if (this.role !== BESIDE) this.spreadNow = false;
    if (this.spread && !noSpread && this.role !== BESIDE && !cpu && card !== 'none') {
      let file = '';
      try { file = this.resolve(model).gguf; sizeGB = fs.statSync(file).size / 1e9; } catch {}
      helpers = await this.spread.open({ sizeGB, file }).catch(() => []);
      if (helpers.length) {
        // 1.5.210 (Go Wi-Fi test): a hand split (-ts) put a 1 GB buffer on a handheld whose card shares the computer's
        // memory, and it refused it with 6 GB free. A spread lets --fit size each card's share instead.
        const ts = args.findIndex((a) => ['-ts', '--tensor-split'].includes(a));
        if (ts >= 0 && this.fitOn()) {
          args.splice(ts, 2);
          const fi = args.indexOf('--fit');
          if (fi < 0) args.push('--fit', 'on'); else args[fi + 1] = 'on';
          try { this.log?.('engine', `${model}: the hand-set split (-ts) was left out for this spread; each card's share is sized to fit instead`); } catch {}
        }
        if (!Number.isInteger(this.lc.batch) && !Number.isInteger(this.lc.ubatch)) dropReading(args); // 101: spread loads keep small steps
        args.push('--rpc', helpers.join(','), ...spreadArgs(args, this.spread?.fitTargets?.() || null));
        // Watch the link live: llama-server files the card-sharing code's [link] and [scut] lines one level below what it
        // shows by default, so on the borrowing side they only appear with -lv 4 (found in the PC and handheld test).
        if (linkLive(this.cfg) && !args.includes('-lv')) args.push('-lv', '4');
        this.spreadNow = true; // item 14: a reply over Wi-Fi may pause longer
        const mins = Math.ceil(spreadLoadSeconds(sizeGB, this.lc.loadTimeoutSeconds || 300) / 60);
        try { this.log?.('engine', `${model}: spread over ${helpers.length} other Bob${helpers.length > 1 ? 's' : ''}' card${helpers.length > 1 ? 's' : ''} (${helpers.join(', ')}). The first time, part of the brain is sent over the network: over Wi-Fi that can take a while (I'll wait up to ${mins} min), and a network cable is much faster. Later loads only send what's missing.`); } catch {}
      }
    }
    // Nov 17: a load without lent cards (processor only, no card, a spread that failed, or none lent) lets go of any
    // lends left from before, so the brain line never says "borrowing" for a brain running here alone.
    if (!helpers.length && this.role !== BESIDE && this.spread?.using?.length) this.spread.close();
    // Nov 12 (apu-fit.js): on built-in graphics, the brain goes where it really fits, read with the memory free now.
    if (!helpers.length && !cpu && card !== 'none') this.apuFit(model, args, ctx || this.lc.ctx || DEFAULT_CTX);
    // A llama-server left over from a crash would hold the port: stop it first.
    const pidFile = path.join(this.cfg.dataDir, `llama-server${this.tag}.pid`);
    try {
      const old = Number(fs.readFileSync(pidFile, 'utf8'));
      fs.rmSync(pidFile, { force: true });
      if (old && old !== process.pid && /llama-server/i.test(await commandLineOf(old))) { process.kill(old, 'SIGTERM'); await new Promise((r) => setTimeout(r, 800)); }
    } catch {}
    // 224: the port is really free (another program can hold it too, and its answers would look like the engine's).
    const avoid = this.role === BESIDE ? [] : [this.lc.besidePort || this.basePort + 1, this.lc.embedPort || this.basePort + 2, this.lc.hearPort || this.basePort + 3]; // + Bob's ears (hearing.js)
    const port = await pickPort(this.basePort, { avoid, ...(this.portCheck ? { isFree: this.portCheck } : {}) });
    if (port === null) throw Object.assign(new Error(`Something else is using port ${this.basePort} and the spare ones after it, so my engine can't start. Restarting the PC frees them.`), { noRetry: true });
    if (port !== this.port) { this.log?.('engine', `port ${this.basePort} is taken by another program; starting the engine on ${port}`); this.port = port; this.url = `http://127.0.0.1:${port}`; }
    if (args.includes('--port')) args[args.indexOf('--port') + 1] = String(this.port);
    // 220: the real free memory now, after the last brain let go. Too little: say so, or try a smaller chat memory.
    if (!roomChecked && this.role !== BESIDE && !helpers.length) {
      const room = await this.roomNow(model, ctx || this.lc.ctx || DEFAULT_CTX, args, cpu).catch(() => null);
      if (room) this.log?.('engine', `${model}: card has ${Math.round(room.cardFreeMB)} MB free; needs about ${room.needGB} GB of ${room.haveGB} GB free${room.ok ? '' : ' (not enough)'}`);
      if (room && !room.ok) throw Object.assign(new Error(noRoomLine(this.label(model), room.needGB, room.haveGB)), { code: 'no_room', fitsCtx: room.fitsCtx, noRetry: true });
    }
    const exe = this.exePath();
    // The exact command, so speed settings can be checked (e.g. that the draft model really went in).
    try { fs.writeFileSync(path.join(this.cfg.dataDir, `llama-server${this.tag}-args.txt`), [exe, ...args].map((a) => (/\s/.test(a) ? `"${a}"` : a)).join(' ') + '\n'); } catch {}
    let log = '';
    let full = ''; // 1.5.133: the whole output (up to 256 KB) goes to a file when a load fails; the message keeps the end
    if (args.includes('--slot-save-path')) { try { fs.mkdirSync(args[args.indexOf('--slot-save-path') + 1] || startDir(this.cfg), { recursive: true }); } catch {} }
    this.slotDir = args.includes('--slot-save-path') ? args[args.indexOf('--slot-save-path') + 1] : ''; // where this engine run saves readings
    this.placeChat = null; // a fresh engine holds no chat's reading yet
    this.condStep = this.condLoad || this.condChat || 0; this.condOff = ''; this.condHeld = 0; this.condGrown = 0; this.condFree = null; this.condFreeAsked = false; this.condWin = this.condWinFull || 0; this.condWinExtra = 0; // the Conductor starts each engine run at the chat step, with the whole window
    const env = this.startEnv(model, args, { ctx, card, helpers });
    // 1.5.203: spawn throws when Windows blocks the program (Smart App Control); safeSpawn turns that into 'error'.
    this.placeKeyNow = placeKey({ exe, engine: `${this.beNo()}-${this.buildNo()}`, args, env: ownEnv(env) }); // Nov 24: what a saved chat must match
    this.placeOther = false; this.placeDirty = false;
    const child = safeSpawn(spawn, exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env });
    // 1.5.24 "Games first": on the processor, the engine yields to games (below normal priority).
    if (this.role === BESIDE || (cpu && cpuPlan(this.cfg)?.lowPriority)) { try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {} }
    // The link log: with a lent card in use, the engine's [link] and [scut] lines go to bob-net-link.log and the logbook.
    const link = helpers.length ? new LinkLog(this.cfg, { who: 'borrowed card', log: (...a) => this.log?.(...a) }) : null;
    // 1.5.215: how far the weights have loaded. While a brain loads, llama.cpp writes one dot per 1% of its weights read
    // in (and sent to the card), which drives the fNRI cube's load-in like a progress bar.
    const dots = loadDots();
    const keep = (d) => { log = (log + d).slice(-4000); if (full.length < LOAD_LOG_MAX) full += d; link?.feed(d);
      if (!this.loadedOk && this.child === child) { const pct = dots(d); if (pct !== null) { try { this.onLoadProgress?.(model, pct); } catch {} } } };
    this.outTail = () => log; // Nov 12: the engine's last words after a reply failed (out of memory or not)
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const failFile = path.join(this.cfg.dataDir, `llama-server${this.tag}-load-failed.txt`);
    const saveFail = (why) => {
      // A lent card that failed isn't asked again for a while. Only a failure to reach it tries the other way (home
      // network, then Tailscale) next time; one that ran out of room or time won't do better over the other way.
      if (helpers.length) this.spread?.failed({ route: /connect|unreachable|refused|timed out connecting|no route/i.test(full) && !/alloc|out of memory|took too long/i.test(full + why) });
      try { fs.writeFileSync(failFile, `${new Date().toISOString()} ${model}: ${why}\n${[exe, ...args].join(' ')}\n\n${full}`); } catch {}
      try { this.log?.('engine', `${model}: ${why}; full llama-server output saved to ${path.basename(failFile)}`); } catch {}
    };
    const started = new Promise((_, reject) => {
      child.once('error', (e) => {
        // 1.5.203: a new engine Windows won't run (or one that won't start right after an update): back to the build
        // kept from before, once, and load again on that one.
        const back = fallBackIfBlocked(this.cfg, exe, e);
        if (back) { const err = new Error(back.say); err.fellBack = back; return reject(err); }
        reject(new Error(`Couldn't start llama-server (${e.message}). Check llamacpp.exe in config.json.`));
      });
      child.once('exit', (code) => { if (this.child === child && this.current === model && !this.loadedOk) saveFail(`stopped while loading (code ${code})`); reject(new Error(`llama-server stopped while loading ${model} (code ${code}). Last output: ${log.slice(-600)}`)); });
    });
    this.child = child;
    this.loadedOk = false;
    this.perWordSent = null; this.perWordLive = false; // a new engine starts with the brain's own experts per word
    this.current = model;
    this.currentCtx = ctx || null;
    this.currentCpu = Boolean(cpu);
    this.currentCard = card;
    // 1.5.35: picked by its Ollama name but running from Bob's own copy: say so (Now running) and log it once per model.
    this.currentOwn = model.includes(':') && !this.lc.models?.[model] && Boolean(this.catalogFile(model));
    if (this.currentOwn && !(this.ownLogged ||= new Set()).has(model)) { this.ownLogged.add(model); try { this.log?.('engine', `${model}: running from Bob's downloaded copy (${path.basename(this.catalogFile(model).gguf)}) instead of Ollama's`); } catch {} }
    try { fs.writeFileSync(pidFile, String(child.pid)); } catch {}
    const deadline = Date.now() + (helpers.length ? spreadLoadSeconds(sizeGB, this.lc.loadTimeoutSeconds || 300) : this.lc.loadTimeoutSeconds || 300) * 1000;
    // Item 216: a load that runs past twice this brain's usual time is stopped and tried once more (a stuck read off the
    // disk or a driver hiccup usually clears on the second go). Only with a usual time to go by, and only once.
    const dl = loadDeadline(this.loadTimes[model], this.lc.loadTimeoutSeconds || 300);
    const soft = !retried && !helpers.length && dl.soft < dl.hard ? t0 + dl.soft * 1000 : 0;
    let said = Date.now(); // a spread load says how it's going once a minute, so a long first load isn't silent
    // Nov 12: once the load is over (loaded, failed or stopped) this watch ends too. It used to run on to its deadline
    // after the engine had already stopped, saying "still loading over Bob-Net" every minute for a load that was gone.
    let over = false;
    const ready = (async () => {
      while (Date.now() < deadline) {
        if (over) return;
        if (signal?.aborted) throw new Error('Stopped.');
        if (soft && Date.now() > soft) throw Object.assign(new Error(`${model} took more than twice its usual ${Math.round(this.loadTimes[model])} s to load`), { slow: true });
        if (await this.health()) return;
        if (helpers.length && Date.now() - said >= 60000) { said = Date.now(); try { this.log?.('engine', `${model}: still loading over Bob-Net, ${Math.round((Date.now() - t0) / 60000)} min so far`); } catch {} }
        await new Promise((r) => setTimeout(r, 500));
      }
      if (over) return;
      saveFail('took too long to load');
      throw new Error(`${model} took too long to load.`);
    })();
    try {
      await Promise.race([ready, started]);
      over = true;
    } catch (e) {
      over = true;
      ready.catch(() => {});
      this.lastLoadOut = full; // 226: the engine's own words, for the plain reason
      await this.stopServer();
      // 1.5.189: a spread that failed loads here like always, instead of leaving no brain.
      if (helpers.length && !signal?.aborted) {
        try { this.log?.('engine', `${model}: spreading over Bob-Net didn't work, so I'm loading it here instead`); } catch {}
        return this.startEngine(model, signal, { ctx, cpu, beside, reserveMB, place, noSpread: true, args: fixedArgs, roomChecked });
      }
      if (e.slow && !signal?.aborted) {
        try { this.log?.('engine', `${e.message}; stopped it and trying once more`); } catch {}
        return this.startEngine(model, signal, { ctx, cpu, beside, reserveMB, place, noSpread, args: fixedArgs, roomChecked, retried: true }); // inside the one-start-at-a-time lock (item 223)
      }
      if (e.fellBack && !signal?.aborted) {
        try { this.log?.('engine', e.message); } catch {}
        return this.startEngine(model, signal, { ctx, cpu, beside, reserveMB, place, noSpread, args: fixedArgs, roomChecked });
      }
      throw e;
    }
    started.catch(() => {}); // later exits are handled by isLoaded()
    this.loadedOk = true;
    // Nov 16: hot experts. The engine's own words about the cache go in the logbook, a refused ranking loudly.
    if (args.includes('--moe-cache-mib')) { const c = parseCacheLog(full); this.hotLoad = c;
      if (c.refused) this.log?.('engine', `${model}: WARNING: the engine refused the hot-expert profile (${c.refused}), so the cache fills as words come. Calibrate again.`);
      else if (c.filled !== null) this.log?.('engine', `${model}: hot experts: ${c.filled} experts (${Math.round(c.filledMiB)} MiB) on the card from the profile.`); }
    // 218: the engine stopping by itself after the brain loaded (our own stops clear this.child first).
    child.once('exit', (code, sig) => { if (this.child === child) this.crashed({ model, code, sig, tail: log, opts: { ctx, cpu, reserveMB, place } }); });
    // 222: these settings started this brain: kept as the ones to go back to.
    if (!helpers.length) { this.careData.lastGood[`${model}|${cpu ? 1 : 0}`] = { args, at: new Date().toISOString().slice(0, 16).replace('T', ' ') }; this.saveCare(); }
    this.primedHash = null;
    // A saved reading of this brain's instructions comes back in about a second instead of being read again.
    if (cpu && tuning(this.cfg).readyWhileTyping) await this.restoreStart(model, ctx);
    const secs = (Date.now() - t0) / 1000;
    this.loadTimes[model] = secs;
    if (this.role === BESIDE) this.changed?.({ action: 'join', model, where: card === 'whole' ? 'card' : 'processor' });
    try { fs.writeFileSync(this.timesFile, JSON.stringify(this.loadTimes, null, 2)); } catch {}
    return secs;
  }

  // Bob's history uses Ollama's message shape; llama-server speaks the OpenAI shape.
  // Nov 12 (items 165, 166): a call keeps its own id (the engine's, or one made once in brain.js), and a result goes
  // with the call whose id it names, so two calls to the same tool in one reply can't swap results, and the same chat
  // reads the same way on every request (the engine can reuse what it already read). Older chats saved without ids
  // still match by tool name, in order.
  static toOpenAI(messages) {
    const out = [];
    let pending = [];
    let n = 0;
    for (const m of messages) {
      if (m.role === 'assistant' && m.tool_calls?.length) {
        pending = m.tool_calls.map((c) => ({ id: typeof c.id === 'string' && c.id ? c.id : `call_${++n}`, name: c.function?.name }));
        out.push({
          role: 'assistant', content: m.content || '',
          tool_calls: m.tool_calls.map((c, i) => ({
            id: pending[i].id, type: 'function',
            function: { name: c.function?.name, arguments: typeof c.function?.arguments === 'string' ? c.function.arguments : JSON.stringify(c.function?.arguments || {}) }
          }))
        });
      } else if (m.role === 'tool') {
        let i = m.tool_call_id ? pending.findIndex((p) => p.id === m.tool_call_id) : -1;
        if (i < 0) i = pending.findIndex((p) => p.name === m.tool_name);
        const id = i >= 0 ? pending.splice(i, 1)[0].id : (m.tool_call_id || `call_${++n}`);
        out.push({ role: 'tool', tool_call_id: id, content: m.content });
      } else {
        // Pictures go as OpenAI image parts (llama-server needs the model's mmproj file for these).
        out.push(m.images?.length
          ? { role: m.role, content: [{ type: 'text', text: m.content || '' }, ...m.images.map((b) => ({ type: 'image_url', image_url: { url: `data:image/${b.startsWith('iVBOR') ? 'png' : b.startsWith('/9j') ? 'jpeg' : 'webp'};base64,${b}` } }))] }
          : { role: m.role, content: m.content || '' });
      }
    }
    return out;
  }

  // Nov 23 (the owner's pick, Legion Go): on built-in graphics, when the brain can't keep Windows's share at any chat
  // memory size, it loads without its picture reader (about 0.5 GB), until Bob restarts or a picture comes in.
  canShutEyes(model) {
    try { return this.cfg.sharedGraphics === true && Boolean(this.resolve(model).mmproj) && this.lc.vision !== false && !(this.lc.noEyes || []).includes(model) && !this.eyesShut?.has(model); } catch { return false; }
  }
  shutEyes(model) { (this.eyesShut ||= new Set()).add(model); }
  // Nov 23 (the owner's pick): one of the Conductor's levers for tight memory. A reader that came back for a picture
  // goes out again once no picture has come for EYES_REST_MS and memory is still tight (less free than Windows's share
  // plus the reader), so Windows gets its share back. Only between replies, never mid-reply; the next picture brings it
  // back again. Not after every picture: each swap reloads the brain (5-8 s on the Legion Go) and re-reads the chat.
  eyesRestDue(model = this.current) {
    const back = this.eyesBack?.get(model);
    if (!back || model !== this.current || this.active > 0 || this.eyesShut?.has(model) || this.now() - back < EYES_REST_MS) return false;
    let extra = 0;
    try { extra = fs.statSync(this.resolve(model).mmproj).size; } catch { return false; }
    const free = this.freeRam ? this.freeRam() : os.freemem();
    return free < apuKeepBytes(this.cfg) + extra;
  }
  async restEyes() {
    const model = this.current;
    if (!this.eyesRestDue(model)) return false;
    // The Go test: a rest reload just before the keep-alive lets the whole brain go is wasted work. Skip it then.
    let hold = null;
    try { hold = this.holdModel(); } catch {}
    if (hold !== model && keepAliveMs(this.cfg) - (this.now() - this.lastUse) < 2 * 60_000) return false;
    this.eyesBack.delete(model);
    this.shutEyes(model);
    this.reloadWanted.add(model);
    try { this.log?.('engine', `${model}: no picture for ${idleFor(EYES_REST_MS)} and memory is still tight, so I'm loading it again without its picture reader; it comes back with the next picture`); } catch {}
    try { await this.preload(model, undefined, { ctx: this.currentCtx || undefined, cpu: Boolean(this.currentCpu) }); }
    catch (e) { try { this.log?.('engine', `${model}: couldn't load it again without its picture reader (${String(e.message || e).slice(0, 160)}); the next job tries again`); } catch {} }
    return true;
  }
  async chat(opts) {
    const b = this.route(opts);
    if (b) return b.chat({ ...opts, beside: false, cpu: true });
    // A picture for a brain loaded without its reader: load it again with the reader first.
    const picture = (opts?.messages || []).some((m) => m.images?.length);
    if (picture && this.eyesBack?.has(opts.model)) this.eyesBack.set(opts.model, this.now()); // the rest clock starts again
    if (this.eyesShut?.has(opts?.model) && picture) {
      this.eyesShut.delete(opts.model);
      (this.eyesBack ||= new Map()).set(opts.model, this.now());
      this.reloadWanted.add(opts.model);
      try { this.log?.('engine', `${opts.model}: a picture came in, so I'm loading its picture reader again (memory is tight, so this may be slow)`); } catch {}
      await this.preload(opts.model, opts.signal, { ctx: opts.ctx || this.currentCtx || undefined, cpu: Boolean(opts.cpu) });
    }
    clearTimeout(this.placeTimer);
    let placed = 'none';
    if (opts?.chatId && chatPlacesOn(this.cfg)) placed = await this.switchPlace(opts.chatId, opts.model).catch((e) => { try { this.log?.('engine', `couldn't swap chat places (${e.message})`); } catch {} return 'none'; });
    // Nov 24: anything else in the engine's one slot (a title, a summary, a reply while another chat's is running) means
    // it no longer holds the chat's reading, so that is never saved under the chat's name.
    const mineChat = placed !== 'none' && placed !== 'busy' && opts?.chatId === this.placeChat;
    if (!mineChat && this.role !== BESIDE) this.placeOther = true;
    this.active++;
    this.lastUse = this.now();
    const mine = { signal: opts?.signal }; // item 213: a reply still here after its job was stopped is stuck
    (this.inflight ||= new Set()).add(mine);
    try { return await this.chatOnce(opts); } finally {
      this.active--; this.lastUse = this.now(); this.inflight.delete(mine);
      // the slot holds this chat again, unless another request is still running in it
      if (mineChat && this.placeChat === opts.chatId && this.active === 0) { this.placeOther = false; this.placeDirty = true; this.placeAfterReply(opts.model); }
      if (this.cardBackPending && this.active === 0) this.reloadWithout();
    }
  }

  // 1.5.214: a Bob lending a card to this spread needs it back (a game on it, or its memory ran low). The brain loads
  // again without his card (src/share-card.js CardBorrower.lost marked him down): now when nothing is answering, or
  // right after the reply in progress, so the reply isn't cut.
  cardTakenBack() {
    if (!this.current || !this.spreadNow) return;
    this.reloadWanted.add(this.current);
    this.cardBackPending = true;
    if (this.active === 0) this.reloadWithout();
  }
  reloadWithout() {
    this.cardBackPending = false;
    const model = this.current;
    if (!model) return;
    this.preload(model, undefined, { ctx: this.currentCtx || undefined, cpu: Boolean(this.currentCpu) }).then(() => this.log?.('engine', `${model}: loaded again without the card that was taken back`)).catch((e) => this.log?.('engine', `${model}: couldn't load it again after a card was taken back (${String(e.message || e).slice(0, 160)}); the next job tries again`));
  }

  // 1.5.19: Medium has a thinking budget (1.5.68: so does Qwen3.6 at every effort, see thinkBudget). Once the brain has thought that long, the request stops and is asked again
  // with thinking off and a note to answer now (llama-server keeps the prompt cached, so the retry starts quickly).
  async chatOnce(opts) {
    const budget = thinkBudget(opts.model, opts.think);
    if (!budget) return this.chatStream(opts);
    const stop = new AbortController();
    const onAbort = () => stop.abort();
    opts.signal?.addEventListener?.('abort', onAbort);
    try {
      return await this.chatStream({ ...opts, signal: stop.signal, budget, onOver: () => { stop.over = true; stop.abort(); } });
    } catch (e) {
      if (opts.signal?.aborted || !stop.over) throw e;
      const messages = [...opts.messages, { role: 'system', content: 'Thinking time is up. Answer now, using what you have worked out so far.' }];
      return this.chatStream({ ...opts, messages, think: false });
    } finally { opts.signal?.removeEventListener?.('abort', onAbort); }
  }

  // Brain Engine 0013: the experts per word saved for this brain (Settings, Speed), sent before its first answer on
  // this engine and again after a change, with no reload. Nothing is sent for a brain without one. Only when this
  // reply has the engine to itself (Brain Engine refuses while answering); otherwise the next reply sends it.
  async sendPerWord(model) {
    let want = perWordFor(this.lc, model);
    // Turbo (opt-in): 4 experts per word for a brain made of more, unless a count is saved for it
    const tc = this.turboCfg(model);
    if (want === null && turboExperts(tc) && this.current === model && this.active <= 1) {
      this.ownPerWord ||= {};
      if (!(model in this.ownPerWord)) {
        try { const r = await fetch(`${this.url}/experts-per-word`, { signal: AbortSignal.timeout(15000) }); this.ownPerWord[model] = r.ok ? Number((await r.json())?.n_expert_used) || 0 : 0; } catch { this.ownPerWord[model] = 0; }
      }
      want = turboPerWord(tc, this.ownPerWord[model]);
    }
    const key = `${model}|${JSON.stringify(want)}`;
    if (this.perWordSent === key || this.current !== model || this.active > 1) return;
    if (want === null && !this.perWordLive) { this.perWordSent = key; return; } // the brain's own, and the engine has it
    try {
      const r = await sendPerWord(this.url, want, { timeoutMs: 15000 });
      this.perWordSent = key;
      this.perWordLive = want !== null;
      try { this.log?.('engine', `${model}: experts per word ${perWordWords(want, r?.n_expert_used)}`); } catch {}
    } catch (e) {
      this.perWordSent = key; // said once; tried again after the next change or load
      try { this.log?.('engine', `${model}: experts per word not changed: ${e.message}`); } catch {}
    }
  }

  async chatStream({ model, messages, tools, signal, onToken, onThink, think, budget, onOver, task, temperature }) {
    // 1.5.52: a brain whose template refused a mid-chat system note gets them folded in from then on (foldSystem).
    this.noMidSystem ||= new Set();
    // 1.5.60: ask the loaded brain's chat template up front, so a template that refuses mid-chat system notes is
    // folded from the very first request (the retry below stays as a second line of defence).
    this.templateRead ||= new Set();
    if (!this.templateRead.has(model)) {
      this.templateRead.add(model);
      try {
        const props = await (await fetch(this.url + '/props', { signal: AbortSignal.timeout(3000) })).json();
        this.checkBuild?.(props?.build_info);
        if (MID_SYSTEM_REFUSED.test(String(props?.chat_template || ''))) {
          this.noMidSystem.add(model);
          this.log?.('engine', `${model}: its chat template only takes a system message first, so Bob's notes go in as user notes`);
        }
      } catch {}
    }
    if (this.noMidSystem.has(model)) messages = foldSystem(messages);
    await this.sendPerWord(model);
    await this.conduct({ model, messages, tools, think, task, temperature, signal }).catch((e) => this.condStop(model, e.message));
    // Item 14 (Nov 11): a reply that stops sending words is stopped, not waited on until someone presses Stop. Once
    // words are coming, a quiet spell longer than STALL_MS (twice that when the brain is spread over other Bobs' cards)
    // means the engine hung: it is let go and the error says "terminated", so Bob loads it again and asks once more.
    // Item 208 (Nov 12): before the first word there is a limit too, sized from how much the brain has to read and how
    // fast this brain reads (the engine's own timings; a slow guess until it has said). Never under 3 minutes. Not
    // timed while another reply holds this engine (this one may be waiting its turn).
    const watch = new AbortController();
    const both = signal ? AbortSignal.any([signal, watch.signal]) : watch.signal;
    const stallMs = (this.lc.stallSeconds > 0 ? this.lc.stallSeconds * 1000 : STALL_MS) * (this.spreadNow ? 2 : 1);
    const firstMs = this.active > 1 ? 0 : firstWordMs({ promptTokens: Math.round(promptChars(messages, tools) / (this.charsPerToken(model) || 3)), readPerSec: this.readSpeed[this.current || model] || 0, cpu: this.currentCpu || this.role === BESIDE, spread: this.spreadNow, seconds: this.lc.firstWordSeconds });
    let timer = null, waited = 'first';
    const arm = () => { clearTimeout(timer); waited = 'stall'; timer = setTimeout(() => watch.abort(), stallMs); timer.unref?.(); };
    if (firstMs) { timer = setTimeout(() => watch.abort(), firstMs); timer.unref?.(); }
    try {
      const res = await this.post(model, messages, tools, both, think, task, temperature);
      return await this.readReply(res, { model, messages, tools, signal, onToken, onThink, think, budget, onOver, task, temperature, onChunk: arm });
    } catch (e) {
      if (watch.signal.aborted && !signal?.aborted) {
        const secs = Math.round((waited === 'first' ? firstMs : stallMs) / 1000);
        this.log?.('engine', waited === 'first' ? `${model} sent no first word in ${secs} s; letting it go so it loads again` : `${model} stopped sending words for ${secs} s; letting it go so it loads again`);
        // Item 209: only this brain is let go. The Quick brain beside it and the meaning-search helper stay.
        await this.stopServer().catch(() => {});
        throw new Error(waited === 'first' ? `terminated: the brain sent no first word in ${secs} seconds` : `terminated: the brain stopped answering for ${secs} seconds`);
      }
      throw e;
    } finally { clearTimeout(timer); }
  }

  async readReply(res, { model, messages, tools, signal, onToken, onThink, think, budget, onOver, task, temperature, onChunk }) {
    if (!res.ok) {
      // 1.5.60: the template's refusal sits deep in a long error (after the template source), so look at all of it.
      const full = await res.text();
      const text = full.slice(0, 300);
      if (!this.noMidSystem.has(model) && MID_SYSTEM_REFUSED.test(full)) {
        this.noMidSystem.add(model);
        this.log?.('engine', `${model}: its chat template only takes a system message first, so Bob's notes go in as user notes from now on`);
        return this.chatStream({ model, messages, tools, signal, onToken, onThink, think, budget, onOver, task, temperature });
      }
      if (MID_SYSTEM_REFUSED.test(full)) this.log?.('engine', `${model}: refused a system message even after folding (roles ${(messages || []).map((m) => (m.role || '?')[0]).join('')}, ${full.length} chars of error)`);
      throw new Error(`llama-server returned ${res.status}: ${text}`);
    }
    return this.readStream(res, { model, messages, tools, signal, onToken, onThink, think, budget, onOver, onChunk });
  }

  // ---------- The Conductor (conductor.js; Engine tuning, off unless picked) ----------
  // Before a reply: pick the step to read and write at, and switch with the brain loaded. Only the main engine, on the
  // card, with this reply the only one, never spread over other Bobs' cards. Anything refused turns it off for this run.
  async conduct({ model, messages, tools, think, task, temperature, signal }) {
    if (!this.condChat || this.condOff || this.role === BESIDE || this.spreadNow || this.currentCpu || this.active > 1 || this.current !== model || !this.slotDir || !this.child || this.child.exitCode !== null) return;
    const st = (this.condState ||= {})[model];
    if (st?.stopped) return;
    if (mtpBlocksSwitch(this.lastArgs, this.beNo())) { this.condStop(model, 'MTP is on and this engine (before Brain Engine 43) can stop on a step switch with it'); return; }
    const total = Math.round(promptChars(messages, tools) / (this.charsPerToken(model) || 3));
    // what the chat memory holds: the last reply's reading and writing (another chat's makes this a guess on the high
    // side, so the Conductor switches less, never wrongly)
    const held = Math.min(this.condHeld || 0, total);
    const newTok = total - held;
    const outTok = expectOut({ think, task });
    // the window lever (off unless switched on): the chat memory cut to this chat and its longest reply, the rest lent
    // to the copy cache. Rides on a step switch when there is one, else switches by itself.
    let win = null;
    if (this.condWinFull > 0) {
      const w = nextWindow({ cur: this.condWin, want: fitWindow({ full: this.condWinFull, total, reply: replyTokens(this.currentCtx, MAX_REPLY_TOKENS) }) });
      if (w && w !== this.condWin) { const extra = this.condWinCache(model, w); win = { n_ctx: w, moe_cache_mib: this.condCacheBase + extra, _winExtra: extra }; }
    }
    // a long read coming with the cache grown for writing: back to the reading cache first
    if (this.condGrown && newTok >= MIN_NEW && !(await this.condSwitch(model, this.condStep, held, win || { moe_cache_mib: this.condRead() }))) return;
    if (!this.condGrown && win && this.condWin !== win.n_ctx && (win.n_ctx > this.condWin || held === 0)) {
      this.log?.('engine', `${model}: Conductor: chat memory window ${this.condWin} -> ${win.n_ctx} tokens, expert copy cache ${this.condRead()} -> ${win.moe_cache_mib} MiB`);
      if (!(await this.condSwitch(model, this.condStep, held, win))) return;
    }
    // the card's free memory isn't known yet (it comes with each change): ask once, while the chat memory is empty
    if (this.cfg?.engineTuning?.growGuess === true && this.condCacheBase > 0 && this.condFree == null && !this.condFreeAsked && held === 0 && total < CACHE_FLIP_MAX && outTok >= CACHE_FLIP_MIN_OUT) {
      this.condFreeAsked = true;
      await this.condSwitch(model, this.condStep, 0, { moe_cache_mib: this.condRead() });
    }
    // Nov 23 (the test PC's BE43 gate, twice): the first step switch after a load reloads the whole brain on Brain
    // Engine 43, about 15 s, up or down (0087 fixes it in Brain Engine 44), and the chat step frees nothing the sized
    // fill can use. So a Conductor that loaded at the read step stays there and reads and writes at it, with no switch
    // at all (the gate's fastest row). Built-in graphics still switch (they load at the chat step).
    // Nov 24: from Brain Engine 44 the switch costs about 0.2 s, so it switches inside a job again (the owner's ask).
    // before 44 the first switch after a --fit load reloads the brain (0087 fixes it), so it stays at the load step
    if (this.condApu) return; // Nov 24 (the Legion Go check): built-in graphics stay at the step they loaded at
    if (this.beNo() < SWITCH_IN_JOB_FROM_BE && (this.tuneEnv?.LLAMA_MOE_CACHE_FILL_STEP || this.lastArgs?.includes('--fit') || (this.condLoad > this.condChat && this.condStep === this.condLoad))) return;
    // Nov 24 (test PC, BE44, dense Qwen3-4B: saving the chat cost 1-6 s a switch, the job 42.0 s against 32.9 s; then
    // Bob's real path: a one-time try of the read step lost 1.3-2.1 s against "Let Bob pick" and changed the words,
    // and plain 2048 beat 4096 on that brain): with no copy cache there is nothing to trade, so it keeps the step the
    // brain loaded at, which is Bob's own pick, and never switches. Same words and speed as Let Bob pick.
    if (!this.condCacheBase) {
      if (this.noCacheSaid !== model) { this.noCacheSaid = model; this.log?.('engine', `${model}: Conductor: no expert copy cache, so nothing to trade: it keeps Bob's step ${this.condStep} and doesn't switch`); }
      return;
    }
    const p = conductorPlan({ newTok, cachedTok: held, outTok, cur: this.condStep, chat: this.condChat, speeds: this.condSpeedsAll()[model], switchS: switchGuess(held, st?.ratio), maxStep: Math.min(this.condMax || 0, this.condCap?.[model] > 0 ? this.condCap[model] : Infinity) || 0 });
    // Nov 20: off unless engineTuning.growGuess is set (a test switch). Bob's 440 clean job lessons: replies with thinking
    // median 81 tokens, none over 1,500, so a guess made before the reply mostly misses; growing mid-reply is the way.
    const grow = this.condOff || this.cfg?.engineTuning?.growGuess !== true ? 0 : cacheGrow({ total, outTok, cacheMiB: this.condRead(), freeMiB: this.condFree, grown: this.condGrown });
    if (p.plan === 'stay' && !grow) { if (newTok >= MIN_NEW && this.staySaid !== `${model}:${this.condStep}`) { this.staySaid = `${model}:${this.condStep}`; this.log?.('engine', `${model}: Conductor: a ${newTok}-token read stays at step ${this.condStep} (${p.why || 'no faster step after the switch cost'})`); } return; }
    if (p.plan !== 'stay') {
      this.log?.('engine', planLine(model, p));
      if (p.step > this.condStep && this.condApu && !apuStepOk({ from: this.condStep, to: p.step, freeBytes: this.freeRam ? this.freeRam() : os.freemem() })) {
        this.log?.('engine', `${model}: Conductor: no step ${p.step} on built-in graphics now, it would leave Windows under 1.5 GB free`);
        return;
      }
      if (p.step !== this.condStep && !(await this.condSwitch(model, p.step, held))) return;
    }
    if ((p.plan !== 'readBig' && !grow) || signal?.aborted) return;
    // read now (one word, thrown away, the reading kept), then switch to the writing settings: the chat step, and a
    // bigger expert copy cache when a long reply is expected
    if (newTok > 0) {
      const res = await this.post(model, messages, tools, signal, think, task, temperature, { stream: false, max_tokens: 1 });
      if (!res.ok) throw new Error(`reading ahead: llama-server returned ${res.status}`);
      const j = await res.json().catch(() => ({}));
      if (j?.timings) this.condLearn(model, { ...j.timings, predicted_n: 0 });
    }
    const step = p.plan === 'readBig' ? this.condChat : this.condStep;
    if (grow) this.log?.('engine', `${model}: Conductor: a long reply is expected, so the expert copy cache grows from ${this.condRead()} to ${this.condRead() + grow} MiB for writing (the words may differ slightly from the reading cache's)`);
    await this.condSwitch(model, step, total, grow ? { moe_cache_mib: this.condRead() + grow } : {});
  }

  // One step change: the reading saved, the step changed, the reading put back. Measured against the guess.
  // the copy cache replies read with: the one the engine loaded with, plus what the window lever lent it
  condRead() { return (this.condCacheBase || 0) + (this.condWinExtra || 0); }
  // what a window of `win` tokens frees for the copy cache, from the brain's shape and its chat memory's number format
  condWinCache(model, win) {
    try {
      const shape = ggufInfo(this.resolve(model).gguf)?.shape;
      const args = memArgs(this.cfg, model, this.lc.args, this.memCaps()), tiers = this.tiersFor(model, this.condWinFull);
      return windowCacheMiB(kvBytes(shape, this.condWinFull, args, tiers), kvBytes(shape, win, args, tiers));
    } catch { return 0; }
  }

  async condSwitch(model, step, held, more = {}) {
    const t0 = Date.now(), guess = switchGuess(held, this.condState?.[model]?.ratio);
    const winExtra = more._winExtra, isBack = more._back === true;
    more = Object.fromEntries(Object.entries(more).filter(([k]) => !k.startsWith('_')));
    const file = `conductor-${this.port}.bin`;
    const was = { step: this.condStep, win: this.condWin, cache: this.condRead() + (this.condGrown || 0) }; // for GUPPI's record in the chat
    if (held > 0) await this.slotAction('save', file);
    const res = await fetch(`${this.url}/context`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ n_batch: step, n_ubatch: step, ...more }), signal: AbortSignal.timeout(300000) });
    if (!res.ok) { this.condStop(model, `the engine can't change its step in place (${res.status})`); return false; }
    const answer = await res.json().catch(() => ({}));
    this.condStep = step;
    this.condFree = freeFrom(answer); // Brain Engine 0047; null on an engine without it, and then the cache never grows
    if ('n_ctx' in more) { this.condWin = Number(answer?.n_ctx) || more.n_ctx; this.condWinExtra = Number(winExtra) || 0; }
    if ('moe_cache_mib' in more) this.condGrown = Math.max(0, more.moe_cache_mib - this.condRead());
    if (held > 0) {
      try { await this.slotAction('restore', file); } catch (e) { this.log?.('engine', `${model}: Conductor: the reading didn't come back (${e.message}), so the chat is read again`); }
      try { fs.rmSync(path.join(this.slotDir, file), { force: true }); } catch {}
    }
    const seconds = (Date.now() - t0) / 1000;
    const st = (this.condState[model] = noteSwitch(this.condState[model], { seconds, guess, held }));
    this.log?.('engine', `${model}: Conductor: step ${step} in ${seconds.toFixed(2)} s (guessed ${guess.toFixed(2)} s)${st.stopped ? '; slower than guessed three times in a row, so no more switching for this brain' : ''}`);
    // Nov 24 (the owner: "GUPPI can correct on the fly"): a step up that left the card under its margin goes straight
    // back down, and this brain's step is capped there for the rest of the run and its next loads
    const back = stepBack({ from: was.step, to: step, freeMiB: this.condFree });
    if (back && !isBack) {
      (this.condCap ||= {})[model] = back;
      this.log?.('engine', `${model}: Conductor: step ${step} left ${this.condFree} MiB free on the card, under the ${SPILL_MARGIN_MIB} MiB margin, so back to ${back} and no higher for this brain`);
      return this.condSwitch(model, back, held, { _back: true });
    }
    try { // Nov 23: GUPPI's record in the chat (guppi-notes.js; display only, never sent to a brain)
      const nowCache = 'moe_cache_mib' in more ? Number(more.moe_cache_mib) || 0 : this.condRead() + (this.condGrown || 0);
      this.guppiSay?.(guppiSwitch({ from: was.step, to: step, seconds, guess, held, stopped: st.stopped, win: 'n_ctx' in more ? { from: was.win, to: this.condWin } : null, cache: 'moe_cache_mib' in more || 'n_ctx' in more ? { from: was.cache, to: nowCache } : null }));
    } catch {}
    return true;
  }

  condStop(model, why) {
    if (this.condOff) return;
    this.condOff = why || 'stopped';
    this.log?.('engine', `${model}: Conductor off for this engine run: ${this.condOff}. Replies go ahead as usual.`);
    try { this.guppiSay?.(guppiStop(this.condOff)); } catch {} // Nov 23: GUPPI's record in the chat
  }

  // Nov 26: this PC's GUPPI profile for a brain (guppi-calibrate.js), read once per load; the logbook says what it does
  guppiProfile(model) {
    let p = null;
    try { p = guppiProfileFor(this.cfg, model, guppiPcNow(this.cfg, { beNo: this.beNo(), ramBytes: this.totalRam ? this.totalRam() : os.totalmem() })); } catch { return null; }
    if (!p) return null;
    const said = p.stale ? `this PC's GUPPI calibration isn't used: ${p.stale}. Calibrate again in Settings, Engine tuning` : `this PC's GUPPI calibration: ${p.keepBob ? 'he keeps Bob\'s step for this brain' : `reading step at most ${p.cap}`}`;
    if (this.guppiProfSaid !== `${model}:${said}`) { this.guppiProfSaid = `${model}:${said}`; this.log?.('engine', `${model}: ${said}`); }
    return p.stale ? null : p;
  }
  // a new or forgotten profile: the speeds and the profile are read again at the next load
  guppiReload() { this.condSpeeds = null; this.guppiProfSaid = ''; }

  // Nov 24: GUPPI's measured speeds per brain, kept between runs for the same Brain Engine (dataDir/conductor/speeds.json)
  condSpeedsFile() { return this.cfg?.dataDir ? path.join(this.cfg.dataDir, 'conductor', 'speeds.json') : ''; }
  condSpeedsAll() {
    if (this.condSpeeds) return this.condSpeeds;
    let saved = null; const f = this.condSpeedsFile();
    if (f) { try { saved = JSON.parse(fs.readFileSync(f, 'utf8')); } catch {} }
    return (this.condSpeeds = cleanSpeeds(saved, this.beNo()));
  }
  condSpeedsSave() {
    const f = this.condSpeedsFile(); if (!f) return;
    try { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify({ be: this.beNo(), speeds: this.condSpeeds || {} })); } catch {}
  }

  // what each reply teaches: read and write speed at the step it ran at, and what the chat memory now holds
  condLearn(model, t) {
    if (!this.condChat || !this.condStep) return;
    const sp = this.condSpeedsAll(), was = JSON.stringify(sp[model] || null);
    if ((t.prompt_n || 0) >= 512) sp[model] = learnStep(sp[model], 'read', this.condStep, Number(t.prompt_per_second));
    if ((t.predicted_n || 0) >= 32) sp[model] = learnStep(sp[model], 'write', this.condStep, Number(t.predicted_per_second));
    if (JSON.stringify(sp[model] || null) !== was) this.condSpeedsSave();
    this.condHeld = (t.prompt_n || 0) + (t.cache_n || 0) + (t.predicted_n || 0);
  }

  // `temperature`: an assistant preset's own (presets.js); otherwise the brain's usual word settings decide.
  post(model, messages, tools, signal, think, task, temperature, over) {
    return fetch(this.url + '/v1/chat/completions', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model, messages: LlamaCpp.toOpenAI(messages), tools: tools && tools.length ? tidySchema(tools) : undefined, stream: true, max_tokens: replyTokens(this.current === model ? this.currentCtx : null, MAX_REPLY_TOKENS), // 1.5.148: less on a small context. 1.5.26: no empty enums (llama.cpp rejects them)
        ...this.sampling(model, { tools: !!tools?.length, think, task }),
        ...(Number.isFinite(temperature) ? { temperature } : {}),
        // Nov 24 (the Legion Go check couldn't tell drift from chance): llamacpp.testSeed in the config file, for test
        // runs only, makes every reply greedy and seeded so two runs can be compared word for word. Off unless set.
        ...(Number.isInteger(this.cfg?.llamacpp?.testSeed) ? { seed: this.cfg.llamacpp.testSeed, temperature: 0, top_k: 1 } : {}),
        // 1.5.16: a quick reply asks the chat template to skip thinking (templates that don't know the switch ignore it).
        // 15 Nov 2026: GPT-OSS reads a reasoning level instead (model-family.js thinkKwargs: off = low).
        ...this.thinkArgs(model, think),
        // fNRI's small cube in Bob's thinking: only while someone has it open, and only Brain Engine answers it
        ...(this.wantTrace?.() ? { expert_trace: true, expert_trace_stream: true } : {}), ...(over || {}) }), // 1.5.210: Brain Engine 5 also sends the picks with every word (older builds ignore the ask)
      signal
    });
  }

  // 96 Speed history: each reply's numbers are passed on (server.js keeps them when the switch is on).
  statsOut(st) { if (st) { try { (this.onStats || this.main?.onStats)?.(st); } catch {} } return st; }

  async readStream(res, { model, messages, tools, signal, onToken, onThink, think, budget, onOver, onChunk = () => {} }) {
    let content = '';
    let held = null; // null: not decided yet; false: streaming normally; a string: held back
    let thought = 0, traced = false; const asked = this.wantTrace?.() === true; // fNRI's small cube: was the trace asked for, and did it come
    const calls = [];
    let buf = '';
    let done = false, finish = ''; // items 210, 211: how the reply ended
    const decoder = new TextDecoder();
    for await (const chunk of res.body) {
      onChunk(); // item 14: words are coming; the stall timer starts again
      buf += decoder.decode(chunk, { stream: true });
      let nl;
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line.startsWith('data:')) continue;
        const data = line.slice(5).trim();
        if (data === '[DONE]') { done = true; continue; }
        const ev = parseJson(data);
        if (!ev) { if (asked && data.includes('"expert_trace"')) this.log?.('engine', `fNRI cube: ${model}'s trace came back unreadable (${data.length.toLocaleString()} characters)`); continue; } // a cut or odd line from the server: skip it rather than lose the whole reply
        if (ev.error) throw new Error('llama-server: ' + (ev.error.message || JSON.stringify(ev.error)));
        // 1.5.30: llama-server puts the reply's timings on its last chunk; kept for Now running.
        if (ev.expert_trace_part && this.onTracePart) { try { this.onTracePart(ev.expert_trace_part, model); } catch {} } // the picks so far, while he writes
        if (ev.expert_trace && this.onTrace) { traced = true; try { this.onTrace(ev.expert_trace, model); } catch (e) { this.log?.('engine', `fNRI cube: couldn't read ${model}'s trace: ${e.message}`); } }
        // Nov 11 (item 3): the engine's own count of what it read teaches Bob how many characters make a token for this brain.
        if (ev.timings) { const n = (ev.timings.prompt_n || 0) + (ev.timings.cache_n || 0); const k = this.current || model; const per = learnPer(this.perToken[k], promptChars(messages, tools), n); if (per) this.perToken[k] = per; }
        if (ev.timings) this.speedNote(model, ev.timings, (ev.timings.prompt_n || 0) + (ev.timings.cache_n || 0)); // 225
        if (ev.timings) this.recentPrompts = [...(this.recentPrompts || []), (ev.timings.prompt_n || 0) + (ev.timings.cache_n || 0)].slice(-3); // 101 Auto reading speed
        if (ev.timings) this.lastStats = this.statsOut(replyStats({ model: this.current || model, messages, promptTokens: (ev.timings.prompt_n || 0) + (ev.timings.cache_n || 0), outTokens: ev.timings.predicted_n, tokPerSec: ev.timings.predicted_per_second, ctx: this.currentCtx || this.lc.ctx || DEFAULT_CTX })) || this.lastStats;
        if (ev.choices?.[0]?.finish_reason) finish = ev.choices[0].finish_reason;
        if (ev.timings) this.readSpeed[this.current || model] = learnReadSpeed(this.readSpeed[this.current || model], ev.timings); // item 208
        if (ev.timings) this.condLearn(this.current || model, ev.timings); // the Conductor's speeds per step
        const d = ev.choices?.[0]?.delta || {};
        if (budget && d.reasoning_content && ++thought > budget && !content) onOver(); // stop.over marks it, so real errors aren't retried
        if (d.reasoning_content && onThink) onThink(d.reasoning_content); // 1.5.53: only while the thinking window is open
        if (d.content) {
          content += d.content;
          // 1.5.29: a reply that starts like a tool call written as text is held back until the end, so a rescued
          // call (textCalls below) never shows up in the chat as raw JSON.
          if (!tools?.length) onToken && onToken(d.content);
          else if (held === null) { if (content.trim()) { if (TEXT_CALL_START.test(content.trimStart())) held = content; else { held = false; onToken && onToken(content); } } }
          else if (held === false) onToken && onToken(d.content);
          else held += d.content;
        }
        for (const tc of d.tool_calls || []) {
          const i = tc.index ?? calls.length;
          calls[i] = calls[i] || { name: '', args: '' };
          if (tc.id && !calls[i].id) calls[i].id = String(tc.id); // item 166: the engine's own id is kept
          if (tc.function?.name) calls[i].name += tc.function.name;
          if (tc.function?.arguments) calls[i].args += tc.function.arguments;
          // 95 Preload the next brain: the brain hears a hand-off while it is still being written.
          if (this.onToolCall && calls[i].name) { try { this.onToolCall(calls[i].name, calls[i].args); } catch {} }
        }
      }
    }
    if (asked && !traced) this.log?.('engine', `fNRI cube: ${model} answered without an expert trace (an older Brain Engine, or not Brain Engine)`);
    // Item 211: a stream that stopped with no end mark and no reason was cut short (a dropped connection, a crashed
    // engine): not a whole reply. "terminated" lets the loop load the brain again and ask once more.
    const end = replyEnd({ done, finish });
    if (end === 'early') { this.log?.('engine', `${model}'s reply stopped before its end mark (${content.length.toLocaleString()} characters, ${calls.filter(Boolean).length} call(s) so far)`); throw new Error(EARLY_END); }
    const tool_calls = calls.filter(Boolean).map((c) => {
      let args = {}, raw;
      try { args = c.args ? JSON.parse(c.args) : {}; } catch { args = {}; raw = c.args; }
      // Item 210: at the length limit, a call whose JSON doesn't close was cut off part way. It is never mended and
      // run (a half write_file would write half a file); the loop hands back one line instead (brain.js mendCalls).
      if (end === 'length' && raw !== undefined) return { function: { name: c.name, arguments: {} }, cut: true };
      // Nov 11: broken JSON is kept as written, so the call can be mended before it runs (loop-help.js).
      return { ...(c.id ? { id: c.id } : {}), function: { name: c.name, arguments: args, ...(raw !== undefined ? { raw } : {}) } };
    });
    if (end === 'length') this.log?.('engine', `${model}'s reply hit the length limit${tool_calls.some((c) => c.cut) ? ' in the middle of a tool call' : ''}`);
    if (!tool_calls.length && tools?.length) {
      const names = new Set(tools.map((t) => t.function?.name).filter(Boolean));
      const rescued = textCalls(content, names);
      this.textCallNote(model, { offered: true, rescued: Boolean(rescued) }); // 228
      if (rescued) return { role: 'assistant', content: rescued.text, tool_calls: rescued.calls };
    } else if (tool_calls.length) this.textCallNote(model, { offered: true, real: true });
    if (held) onToken && onToken(cleanHarmony(held)); // it wasn't a call after all: show it now
    if (held && /<\|(channel|message|start|end)\|>/.test(content)) content = cleanHarmony(content);
    return { role: 'assistant', content, tool_calls: tool_calls.length ? tool_calls : undefined, ...(end === 'length' ? { cut: 'length' } : {}) };
  }
}
