// Engine and speed extras (list items 94 to 100). Every switch here is off until the owner turns it on, in Settings,
// Brains and speed. Each one is a small pure function, so the tests pass the computer in as a fake.
//   copyGuess    94  Guess-ahead from the chat: the engine copies words that already sit in the chat (n-gram lookup)
//   preloadNext  95  Preload the next brain: read the next brain's file into memory while the first still talks
//   speedLog     96  Speed history (speed-log.js)
//   newCardTest  97  Test a new card by itself: a one-minute speed test and placements back to Auto
//   laptopMode   98  Laptop mode: on battery, the Quick brain answers and the engine uses fewer threads
//   engineNotes  99  Engine updates in plain words
//   brainMemType 100 The engine's memory type per brain (Brains page, Set up)
//   readingSpeed 101 Reading speed: bigger reading steps (-b/-ub) so a long prompt is read in fewer, larger pieces
//   turboEveryday 102 MTP for everyday brains: a brain's own built-in guesser (MTP) on, without the Lab (ON unless switched off, Nov 23)
//   hotExperts   104 Hot experts on the card: llama.cpp's expert cache, filled from a profile (src/hot-experts.js)
//   lockBrainMemory 103 Lock brain memory: the part of a brain in RAM stays there (--mlock), so Windows can't page it out
//   smallStepFit Nov 27 GUPPI fits his working memory to the card: a smaller reading step when the engine's working memory doesn't fit (step-fit.js)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { MEM_TYPES, memTypeTrade } from '../public/mem-types.js';
import { brainEngineBuild } from '../public/engine-name.js';
import { ggufInfo } from './gguf.js';

export const EXTRA_SWITCHES = ['copyGuess', 'preloadNext', 'speedLog', 'newCardTest', 'laptopMode', 'engineNotes', 'turboEveryday', 'lockBrainMemory', 'hotExperts', 'turbo', 'smallStepFit'];
export const extraOn = (cfg, key) => cfg?.[key] === true;

// ---------- 94 Guess-ahead from the chat ----------
// llama.cpp's speculative flags were renamed around b9530: --draft-max and --draft-min now stop the engine from
// starting at all ("the argument has been removed"). Builds from then on take --spec-draft-n-max/-min. A build Bob
// can't read the number of (0) is taken to be a new one, as every engine Bob fetches is (b12282 and newer).
export const NEW_SPEC_FLAGS = 9535;
export const newSpecFlags = (build) => !(build > 0 && build < NEW_SPEC_FLAGS);
export function draftNumArgs(build, max, min) {
  const n = newSpecFlags(build);
  return [...(Number.isInteger(max) && max > 0 ? [n ? '--spec-draft-n-max' : '--draft-max', String(max)] : []),
    ...(Number.isInteger(min) && min >= 0 ? [n ? '--spec-draft-n-min' : '--draft-min', String(min)] : [])];
}
// The copying guesser needs no second brain: ngram-mod looks the last 24 words up in what the chat already holds
// and offers what came after them last time. The brain checks every guess, so answers come out the same.
export const COPY_GUESS_ARGS = ['--spec-type', 'ngram-mod'];
// Nov 23 (Strata's way): next to MTP too. llama.cpp tries its guessers in order and keeps the first one that offers
// words, and the copying one comes first: where the chat holds a match the copied words are offered, elsewhere MTP's.
// Not next to a separate draft brain (that one guesses alone), nor when another kind of guesser was set by hand.
const DRAFT_BRAIN = ['-md', '--model-draft', '--spec-draft-model', '--spec-draft-hf', '-hfd'];
export function specTypes(args = []) {
  const out = [];
  for (let i = 0; i < args.length - 1; i++) if (args[i] === '--spec-type') out.push(...String(args[i + 1]).split(',').map((t) => t.trim()).filter(Boolean));
  return out;
}
export function copyGuessArgs(cfg, { build = 0, args = [] } = {}) {
  if (!extraOn(cfg, 'copyGuess') || !newSpecFlags(build)) return [];
  const types = specTypes(args);
  if (types.includes('ngram-mod')) return []; // already there
  const mtp = types.includes('draft-mtp');
  if (!mtp && (types.length || args.some((a) => DRAFT_BRAIN.includes(a)))) return []; // a draft brain or another guesser
  return [...COPY_GUESS_ARGS];
}

// ---------- 101 Reading speed ----------
// llama.cpp reads a prompt in steps of -ub tokens (512 unless set), and -ub can't be bigger than -b (2048 unless set),
// so both are set together. When part of a brain's experts sit in RAM, each step carries them over to the card once,
// so bigger steps mean fewer trips: a 3060 test (Nov 2026) read 4K to 32K prompts 2.5 to 2.9 times faster at 4096.
// The cost is a bigger working space on the card (about 1 to 2 GB at 4096), so --fit may keep a few more experts in
// RAM and writing can get a little slower. Auto picks by the card: 4096 at 12 GB or more, 2048 at 6 GB or more, and
// Normal on smaller cards and built-in graphics, where the room isn't there.
export const READING_STEPS = { normal: 0, faster: 2048, fastest: 4096 };
export const READING_PICKS = ['normal', 'faster', 'fastest', 'auto'];
// A brain's own pick (Calibrate's "Use recommended", saved in readingFor) wins over the one for every brain.
export const readingPick = (cfg, model = '') => (READING_PICKS.includes(cfg?.readingFor?.[model]) ? cfg.readingFor[model] : READING_PICKS.includes(cfg?.readingSpeed) ? cfg.readingSpeed : 'normal');
export function cleanReadingFor(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, t] of Object.entries(v).slice(0, 64)) if (typeof k === 'string' && k && k.length <= 200 && !/[\u0000-\u001f]/.test(k) && READING_PICKS.includes(t)) out[k] = t;
  return out;
}
// Auto says why it chose what it chose (Settings and the logbook show it): by the card first, then by the last
// 3 prompts this Bob read. With a 12 GB card or more, Fastest; but when the last 3 prompts were all short (under 4K
// tokens), Faster, which leaves more of the card for experts. With 6 to 11 GB, Faster. Smaller cards and built-in
// graphics: Normal. -> { steps, why }
export const LONG_PROMPT = 16384, SHORT_PROMPT = 4096;
export function readingChoice(cfg, { recent = [], model = '' } = {}) {
  const pick = readingPick(cfg, model);
  if (pick !== 'auto') return { steps: READING_STEPS[pick], why: '' };
  if (cfg?.sharedGraphics === true) return { steps: 0, why: 'Auto chose Normal: built-in graphics share the computer\'s memory, so there\'s no room to spare.' };
  const gb = Number(cfg?.gpuVramGB || cfg?.cardGB) || 0;
  if (gb < 6) return { steps: 0, why: gb ? `Auto chose Normal: a ${gb} GB card has no room for bigger pieces.` : 'Auto chose Normal: no graphics card found.' };
  if (gb < 12) return { steps: 2048, why: `Auto chose Faster: a ${gb} GB card has room for 2,048 at a time, not 4,096.` };
  const last = (Array.isArray(recent) ? recent : []).filter((n) => Number.isFinite(n) && n > 0).slice(-3);
  const long = last.filter((n) => n >= LONG_PROMPT).length;
  if (last.length === 3 && last.every((n) => n < SHORT_PROMPT)) return { steps: 2048, why: `Auto chose Faster: ${gb} GB card, and your last 3 prompts were all under ${SHORT_PROMPT.toLocaleString('en')} tokens, so more of the card is left for experts.` };
  return { steps: 4096, why: `Auto chose Fastest: ${gb} GB card${long ? `, and ${long} of your last ${last.length} prompts were over ${LONG_PROMPT.toLocaleString('en')} tokens` : ''}.` };
}
export const readingSteps = (cfg, opts) => readingChoice(cfg, opts).steps;
// Not on the processor (no card to carry experts to), and never over a batch or micro-batch set by hand.
export function readingArgs(cfg, { cpu = false, hand = {}, recent = [], model = '' } = {}) {
  const n = readingSteps(cfg, { recent, model });
  const set = (v) => Number.isInteger(v) && v > 0;
  if (!n || cpu || set(hand.batch) || set(hand.ubatch)) return [];
  return ['-b', String(n), '-ub', String(n)];
}
// A brain spread over lent cards keeps its small steps (spreadArgs in llamacpp.js): bigger ones overfill a lent card.
// Changes the list in place, so a caller's const list follows.
export function dropReading(args) {
  for (let i = args.length - 2; i >= 0; i--) if (args[i] === '-b' || args[i] === '-ub') args.splice(i, 2);
  return args;
}

// ---------- MTP from a file beside the brain (Nov 22) ----------
// Some brains ship their guesser as a second file next to the brain ("mtp-<name>.gguf", the way llama.cpp's downloader
// names it) instead of inside it. When the brain's own file has none, that file is the guesser: the engine loads it
// as the draft with --spec-type draft-mtp. Only a file whose guesser tensors are really there (ggufInfo's mtp) and
// whose kind of brain matches counts; the closest name wins when there are several.
export function mtpSidecar(gguf, { readdir = fs.readdirSync, info = ggufInfo } = {}) {
  if (!gguf) return '';
  const dir = path.dirname(gguf), me = path.basename(gguf);
  let names = [];
  try { names = readdir(dir); } catch { return ''; }
  const arch = info(gguf)?.arch || '';
  const stem = (n) => n.replace(/\.gguf$/i, '').replace(/-0*1-of-\d+$/i, '').toLowerCase();
  const like = (a, b) => { let i = 0; while (i < a.length && i < b.length && a[i] === b[i]) i++; return i; };
  const want = stem(me);
  const found = names
    .filter((n) => n !== me && /\.gguf$/i.test(n) && /(^|[-_.])mtp[-_.]/i.test(n) && !/-0*([2-9]|\d{2,})-of-\d+\.gguf$/i.test(n))
    .map((n) => ({ n, score: like(stem(n).replace(/(^|[-_.])mtp[-_.]/i, ''), want) }))
    .sort((a, b) => b.score - a.score);
  for (const { n } of found) {
    const f = path.join(dir, n), i = info(f);
    if (i?.mtp > 0 && (!arch || !i.arch || i.arch === arch)) return f;
  }
  return '';
}

// The guesser's arguments for a brain: its own (inside the file), or the one beside it; [] when there is none.
export function mtpArgs(gguf, opts = {}) {
  const info = opts.info || ggufInfo;
  if (info(gguf)?.mtp > 0) return ['--spec-type', 'draft-mtp'];
  const side = mtpSidecar(gguf, opts);
  return side ? ['--spec-type', 'draft-mtp', '-md', side] : [];
}

// ---------- 102 MTP for everyday brains ----------
// Some brains carry their own guesser in the file (a multi-token prediction head, "nextn"): it guesses the next few
// words and the brain checks them in one go, so the answer is the same, only quicker. The Lab's MTP page turns it
// on per brain; this switch turns it on for every brain that has one, unless MTP or a draft brain is set for it.
// 3 guesses at a time: one head's guesses get worse the further out they go.
export const TURBO_EVERYDAY_MAX = 3;
// Nov 23 (the owner: "MTP typically doesn't hurt answers"; it's stock llama.cpp): on unless switched off
export const turboEverydayOn = (cfg) => cfg?.turboEveryday !== false;
// with it on by default, drafting pauses where it doesn't pay (Brain Engine 0034's gate); a share set by hand wins
export const SPEC_GATE_DEFAULT = '0.3';
export const specGateEnv = (env = {}) => (env && env.LLAMA_SPEC_GATE !== undefined && env.LLAMA_SPEC_GATE !== '' ? {} : { LLAMA_SPEC_GATE: SPEC_GATE_DEFAULT });
// Nov 27 (Brain Engine 0140-0142, after PolyStrata). The owner: off by default, and not in Turbo, until a test shows a
// speed or quality gain. Each is a box under Engine tuning (set by hand): Guess only while it writes faster
// (LLAMA_SPEC_GATE_TIME), Warm up the brain file after loading (LLAMA_PAGE_WARM), Stop Windows slowing the engine
// (LLAMA_POWER_THROTTLING_OFF). Bob sends none of them by himself.
// Nov 27 (after PolyStrata, off unless llamacpp.containerThreads is true): in a container with a processor limit (a
// rented pod, Docker), llama.cpp counts the host's cores, not the share the container may use, and may start too many
// threads, which then wait on each other. With the switch on, the limit's whole processors are used instead. null when there is no limit (or not Linux), so llama.cpp's own
// count stands. read is swapped in by the tests.
export function containerCpus(read = (f) => fs.readFileSync(f, 'utf8'), platform = process.platform) {
  if (platform !== 'linux') return null;
  const text = (f) => { try { return String(read(f)).trim(); } catch { return ''; } };
  let quota = NaN, period = NaN;
  const v2 = text('/sys/fs/cgroup/cpu.max').split(/\s+/);
  if (v2.length === 2 && /^\d+$/.test(v2[0]) && /^\d+$/.test(v2[1])) { quota = Number(v2[0]); period = Number(v2[1]); }
  else if (!v2[0]) {
    const q = text('/sys/fs/cgroup/cpu/cpu.cfs_quota_us'), pr = text('/sys/fs/cgroup/cpu/cpu.cfs_period_us');
    if (/^\d+$/.test(q) && /^\d+$/.test(pr)) { quota = Number(q); period = Number(pr); } // -1 = no limit, not matched
  }
  if (!(quota > 0 && period > 0)) return null;
  return Math.max(1, Math.floor(quota / period));
}
// The thread count for the engine in a container: the limit, when it is below what this machine reports. null leaves
// llama.cpp's own count. Threads set by hand win (the caller only asks when none is set).
export function containerThreads(cfg, { cpus = os.cpus().length || 1, limit = containerCpus() } = {}) {
  if (cfg?.llamacpp?.containerThreads !== true) return null;
  return Number.isInteger(limit) && limit > 0 && limit < cpus ? limit : null;
}
// Nov 28 (rented pods; off unless llamacpp.threadCap is true or a number): llama.cpp starts one thread per core, and on
// a big server processor that is 64 to 128 threads, which wait on each other. On a rented 4090 with an EPYC (Lamplight
// spec-fit and spec-fit2, measured): Inkling 2 Mini at a 16 GB budget wrote 30 words a second with 128 threads and 48
// with 8; DSpark guesses fell to 0.46x of plain with 128 threads and rose to 1.49x with 8. With the switch on, the engine
// gets at most 8 threads (or the number given). A home computer with 8 cores or fewer is left as it is. null leaves
// llama.cpp's own count; threads set by hand win (the caller only asks when none is set).
export const THREAD_CAP_DEFAULT = 8;
export function threadCap(cfg, { cpus = os.cpus().length || 1 } = {}) {
  const v = cfg?.llamacpp?.threadCap;
  const cap = v === true ? THREAD_CAP_DEFAULT : Number.isInteger(v) && v > 0 ? v : null;
  if (!cap) return null;
  // os.cpus() counts both threads of each core; llama.cpp's own count is one per core
  return Math.floor(cpus / 2) > cap ? cap : null;
}
// The engine's threads from the two rental switches: the smaller when both give one, else whichever does, else null.
export function rentalThreads(cfg, opts = {}) {
  const a = containerThreads(cfg, opts), b = threadCap(cfg, opts);
  return a && b ? Math.min(a, b) : a || b || null;
}

// ---------- DSpark guesses for Inkling 2 (Nov 28; off unless llamacpp.dsparkGuesses is true) ----------
// Unsloth ships a small guesser for Inkling 2 Mini, "dspark-Inkling-2-Mini-Q8_0.gguf", that reads the brain's own
// inner state and guesses the next words; the brain checks them in one go, so its answers stay its own (the card's
// rounding at near ties can still pick a different word, as with any guesser). With the file beside the brain and this
// switch on, the engine loads it with 3 guesses at a time and samples on the card (-bs). Measured on a rented 4090
// (Lamplight spec-host, spec-fit2): 1.49-1.50x plain on the whole card, 1.22x the best plain at a 16 GB budget, with
// 8 engine threads. 5 or 7 guesses were slower than 3. Needs Brain Engine 44 (Lamplight 0092) for the older file
// ("..._Old.gguf"); the newer one needs Lamplight 0165, from DSPARK_NEWER_FROM_BE. Not on the processor-only brain.
export const DSPARK_FROM_BE = 44;
export const DSPARK_NEWER_FROM_BE = 48; // the first Lamplight build after 47, which is the first to carry 0165
export const DSPARK_GUESSES = 3;
export const dsparkOn = (cfg) => cfg?.llamacpp?.dsparkGuesses === true;
export function dsparkSidecar(gguf, { be = 0, readdir = fs.readdirSync, info = ggufInfo } = {}) {
  if (!gguf || !(be >= DSPARK_FROM_BE)) return '';
  if (!/^inkling2/.test(info(gguf)?.arch || '')) return '';
  let names = [];
  try { names = readdir(path.dirname(gguf)); } catch { return ''; }
  const want = path.basename(gguf).toLowerCase().replace(/(-ud)?-q\d.*$/, '').replace(/\.gguf$/, '');
  const old = (n) => /_old\.gguf$/i.test(n);
  const found = names
    .filter((n) => /^dspark-.*\.gguf$/i.test(n) && (old(n) || be >= DSPARK_NEWER_FROM_BE))
    .filter((n) => n.toLowerCase().replace(/^dspark-/, '').startsWith(want))
    .sort((a, b) => (old(a) - old(b)) || a.localeCompare(b)); // the newer layout first where the engine has it
  for (const n of found) {
    const f = path.join(path.dirname(gguf), n);
    if (info(f)?.arch === 'dflash') return f;
  }
  return '';
}
export function dsparkArgs(cfg, gguf, { be = 0, build = 0, args = [], cpu = false, ...opts } = {}) {
  if (!dsparkOn(cfg) || cpu) return [];
  if (args.some((a) => a === '--spec-type' || DRAFT_BRAIN.includes(a))) return []; // another guesser set by hand or per brain
  const f = dsparkSidecar(gguf, { be, ...opts });
  return f ? ['-md', f, '--spec-type', 'draft-dspark', ...draftNumArgs(build, DSPARK_GUESSES), '-bs'] : [];
}

export function everydayTurboArgs(cfg, { build = 0, args = [], mtp = 0, cpu = false, guesser = null } = {}) {
  // guesser: mtpArgs() for the brain (its own head, or the file beside it); without it, mtp > 0 means its own head
  const g = guesser || (mtp > 0 ? ['--spec-type', 'draft-mtp'] : []);
  if (!turboEverydayOn(cfg) || cpu || !g.length || !newSpecFlags(build)) return [];
  if (args.some((a) => ['--spec-type', '-md', '--model-draft', '--spec-draft-model', '--spec-draft-hf', '-hfd'].includes(a))) return [];
  return [...g, ...draftNumArgs(build, TURBO_EVERYDAY_MAX)];
}

// ---------- 103 Lock brain memory ----------
// When part of a brain sits in RAM (the card is too small for all of it), Windows may page some of it out while you do
// other things, and the next reply waits while it comes back from the drive. --mlock asks the system to keep it in RAM.
// Only for a brain on the card (not the Gaming brain on the processor, which should give memory back to the game), and
// only when part of it is in RAM. If the system won't lock it (Linux limits, Android), the engine says so and runs as before.
// Only what sits in RAM is locked: Bob loads a spilled brain without mmap (llamacpp.js noMmapArgs), so --mlock locks
// those buffers, not the whole file. And never at the cost of the system: not on computers with under 16 GB of RAM,
// not on Android or a Raspberry Pi, and only while at least 4 GB or a quarter of the RAM (whichever is more) would
// still be free after the brain's RAM part is locked.
const PARTLY_IN_RAM = ['--fit', '--n-cpu-moe', '-ncmoe', '--cpu-moe', '-ot', '--override-tensor'];
export const LOCK_MIN_RAM = 16 * 1024 ** 3;
export const lockFloor = (totalBytes) => Math.max(4 * 1024 ** 3, Math.floor(totalBytes / 4));
// -> { ok, why }. ramPart: bytes of the brain that will sit in RAM (a guess is fine: the file size minus the card's share).
export function lockRoom({ totalBytes = os.totalmem(), freeBytes = os.freemem(), ramPart = 0, platform = process.platform, arm = /^arm/.test(process.arch) } = {}) {
  if (platform === 'android' || (platform === 'linux' && arm)) return { ok: false, why: 'not on phones or small boards' };
  if (!(totalBytes >= LOCK_MIN_RAM)) return { ok: false, why: 'this computer has under 16 GB of RAM' };
  const left = freeBytes - Math.max(0, ramPart);
  if (left < lockFloor(totalBytes)) return { ok: false, why: `only ${Math.max(0, Math.round(left / 1024 ** 3))} GB would be left free` };
  return { ok: true, why: '' };
}
export function lockMemoryArgs(cfg, { args = [], cpu = false, room = { ok: true } } = {}) {
  if (!extraOn(cfg, 'lockBrainMemory') || cpu || args.includes('--mlock') || !room?.ok) return [];
  return args.some((a) => PARTLY_IN_RAM.includes(a)) ? ['--mlock'] : [];
}

// ---------- 100 The engine's memory type per brain ----------
// The types themselves are shared with the Brains page (public/mem-types.js).
export { MEM_TYPES, memTypeTrade };
export function cleanMemType(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, t] of Object.entries(v).slice(0, 64)) {
    if (typeof k !== 'string' || !k || k.length > 200 || /[\u0000-\u001f]/.test(k)) continue;
    if (t === 'standard' || t === 'sharp' || t === 'small' || t === 'smallest' || t === 'progressive' || t === 'progressive2' || t === 'progressive83' || t === 'progressive84') out[k] = t; // standard is kept, so a saved change back to it wins
  }
  return out;
}
// Does an engine's --help list q3_0 among its cache types ("allowed values: ..., q3_0, ...", which may wrap)?
// 0038's 3-bit chat memory has kernels for CUDA cards and the processor only. A Mac (Metal) or an engine folder whose
// card file is Vulkan without CUDA would run that attention on the processor, so Bob doesn't offer it there.
export const q3CardOk = (files, platform) => platform !== 'darwin' && !((files || []).some((f) => /ggml-(vulkan|metal)/i.test(f)) && !(files || []).some((f) => /ggml-cuda/i.test(f)));
// The engine lists its chat memory types under -ctv in --help (wrapped over lines); 3-bit is there only on a Brain Engine with 0038.
const helpHasKv = (text, type) => { const t = String(text ?? ''), at = t.indexOf('--cache-type-v'); const m = at < 0 ? null : t.slice(at).match(/allowed values:[^\n]*(?:\r?\n[ \t]+[^-\s][^\n]*)*/); return Boolean(m) && new RegExp(`\\b${type}\\b`).test(m[0]); };
export const helpHasQ3 = (text) => helpHasKv(text, 'q3_0');
// 2-bit (Brain Engine patch 0046, Nov 20): the same list names q2_kv. Turbo only (Progressive 8+2), same cards as 3-bit.
export const helpHasQ2 = (text) => helpHasKv(text, 'q2_kv');
// ---------- Turbo (Nov 20, the owner's ask; off unless switched on) ----------
// A show-off speed mode, not for real jobs: every speed trick that costs a little answer quality, at once. Its chat
// memory is 4-bit (Smaller) for every brain unless picked otherwise (Smallest, or one of the Progressive kinds), and a
// brain made of experts uses 4 per word when it has more (turboExperts, on unless switched off). The brain's own picks
// come back when Turbo is off. Without a Brain Engine that has 3-bit, Smallest and Progressive fall back to Smaller.
export const TURBO_MEMS = ['smallest', 'small', 'progressive', 'progressive2', 'progressive83', 'progressive84', 'progressive82'];
// Nov 20: Smaller (4-bit) unless picked. The speed test on a 16 GB card found 3-bit writing 5% slower at 32K and 18%
// at 128K and 256K (its attention reads are slower), so Smallest only wins on room until that's fixed in the engine.
// Patch 0044 (Brain Engine 25): 3-bit at 128K went from 54.2 to 56.1 tokens a second against 4-bit's 57.8 (-2.9%),
// so Smaller stays the pick for speed and Smallest costs little for its room.
export const turboMem = (cfg) => (TURBO_MEMS.includes(cfg?.turboMem) ? cfg.turboMem : 'small');
export const TURBO_EXPERTS = 4;
export const turboExperts = (cfg) => cfg?.turbo === true && cfg?.turboExperts !== false;
// Turbo: stand-ins (Brain Engine 0043, off unless switched on, and only with Turbo and the hot-experts cache): while
// writing, up to 2 missed experts a layer are replaced by the best-scored expert already on the card instead of being
// copied over. Faster, and the words change (lossy), so it's a show-off switch only.
export const turboStandins = (cfg) => cfg?.turbo === true && cfg?.turboStandins === true;
export const STANDIN_ENV = { LLAMA_MOE_STANDIN: 'rank', LLAMA_MOE_STANDIN_MAX: '2' };
// Nov 22 (Brain Engine 32, patch 0053): Turbo: never wait on the drive. Only an expert that has dropped out of RAM is
// stood in for, by the next best on the card or in RAM, and read back in the background. Changes the words, so it
// sits behind Turbo; Turbo: stand-ins wins when both are on.
export const turboDriveStandins = (cfg) => cfg?.turbo === true && cfg?.turboDriveStandins === true && !turboStandins(cfg);
export const DRIVE_STANDIN_ENV = { LLAMA_MOE_STANDIN: 'drive' };
// Turbo: keep more guesses (Brain Engine 0120, after llamAmpere's mb-MTP, MIT; off unless switched on, and only with
// Turbo). A brain that already drafts (its own MTP head, the DSpark drafter or a draft brain) samples its guesses, and
// the engine checks them by rejection; a guess that check throws away is kept anyway when the brain rates it at least
// as likely as its replacement. More guesses kept, so faster writing, and the words lean to the brain's likeliest
// tokens, so they change. Never at temperature 0, never for an end token, never while a grammar shapes the output
// (tool calls). Copy guessing has no odds, so it's always checked exactly. Speed and drift are unproven in our lab.
export const KEEP_GUESSES_FROM_BE = 46;
export const turboKeepGuesses = (cfg) => cfg?.turbo === true && cfg?.turboKeepGuesses === true;
export const KEEP_GUESSES_ENV = { LLAMA_SPEC_MB: '1' };
const MODEL_GUESSERS = ['draft-mtp', 'draft-dspark', 'draft-simple', 'draft-eagle3', 'draft-dflash'];
// the arguments it adds to a start: the sampling drafter, on Brain Engine 46 or newer, only where a model drafts
export function keepGuessesArgs(cfg, { args = [], be = 0 } = {}) {
  if (!turboKeepGuesses(cfg) || !(be >= KEEP_GUESSES_FROM_BE) || args.includes('--spec-draft-sampling')) return [];
  const drafts = specTypes(args).some((t) => MODEL_GUESSERS.includes(t)) || args.some((a) => DRAFT_BRAIN.includes(a));
  return drafts ? ['--spec-draft-sampling', 'probabilistic'] : [];
}
// the engine key goes with it, only when the start samples its guesses
export const keepGuessesEnv = (cfg, { args = [], be = 0 } = {}) => (turboKeepGuesses(cfg) && be >= KEEP_GUESSES_FROM_BE && args.some((a, i) => a === '--spec-draft-sampling' && args[i + 1] === 'probabilistic') ? { ...KEEP_GUESSES_ENV } : {});
// The experts per word Turbo asks of a brain whose own count is `own`: 4 when it has more, else nothing.
export const turboPerWord = (cfg, own) => (turboExperts(cfg) && Number(own) > TURBO_EXPERTS ? TURBO_EXPERTS : null);
// Progressive Memory (Brain Engine patch 0039): the engine names LLAMA_KV_TIERS under -ctv in --help.
export const helpHasTiers = (text) => /\bLLAMA_KV_TIERS\b/.test(String(text ?? ''));
// Smallest (3-bit, Brain Engine patch 0038) needs an engine that has q3_0; without one it falls back to Smaller.
// Progressive needs both; without them it falls back to Smaller too (the nearest in room).
// Progressive 8+2 (Turbo only, Nov 20) needs the 2-bit type (patch 0046) and Progressive Memory.
export function memTypeOf(cfg, model, { q3 = false, q2 = false, tiers = false } = {}) {
  const t = cfg?.turbo === true ? turboMem(cfg) : cfg?.brainMemType?.[model];
  if (t === 'smallest') return q3 ? 'smallest' : 'small';
  if (t === 'progressive' || t === 'progressive2' || t === 'progressive83') return q3 && tiers ? t : 'small';
  if (t === 'progressive84') return tiers ? t : 'small'; // 4-bit base: needs Progressive Memory, not the 3-bit type
  if (t === 'progressive82') return cfg?.turbo !== true ? 'standard' : q2 && tiers ? t : 'small'; // 2-bit base: Turbo only
  return t === 'sharp' || t === 'small' ? t : 'standard';
}
// The engine's own flags for this brain. Flags set by hand (llamacpp.args in config.json) are kept, but a memory
// type picked for this brain on the Brains page sets -ctk and -ctv (1.5.207 PC check: config.example.json ships
// "-fa on -ctk q8_0 -ctv q8_0", so every new home had args "set by hand" and Sharper and Smaller did nothing).
export function memArgs(cfg, model, handArgs, { q3 = false, q2 = false, tiers = false } = {}) {
  const type = memTypeOf(cfg, model, { q3, q2, tiers });
  const t = MEM_TYPES[type];
  if (!Array.isArray(handArgs)) return ['-fa', 'on', '-ctk', t.k, '-ctv', t.v];
  if (type === 'standard') return handArgs;
  const out = [];
  for (let i = 0; i < handArgs.length; i++) {
    const a = handArgs[i];
    if (['-ctk', '--cache-type-k', '-ctv', '--cache-type-v'].includes(a)) { i++; continue; }
    out.push(a);
  }
  if (!out.includes('-fa') && !out.includes('--flash-attn')) out.push('-fa', 'on');
  return [...out, '-ctk', t.k, '-ctv', t.v];
}
// Progressive's steps for a context. 3-step: 8-bit for the newest 8K (a quarter of the chat when that's smaller), then
// 4-bit for the newest 64K (half the chat when that's smaller). 2-step: 4-bit for the newest 64K (or half the chat).
// 8+3: 8-bit for the newest 2K (or a quarter of the chat), the rest 3-bit, with no 4-bit step. 8+4 the same over 4-bit.
// 8+4 (Nov 20): the same 8-bit step over a 4-bit base, for 4-bit's writing speed with the newest words sharp.
// 8+2 (Nov 20, Turbo only): the same 8-bit step over a 2-bit base, for the most room.
// Windows are whole 256s, below the context, or the engine says NOT USED.
// The slack is room in each step for one batch: the reading step (4096 covers Fastest); a bigger batch still works,
// it reads the 3-bit copy for that batch only.
export const TIERS_SLACK = 4096;
export function progressiveTiers(ctx, type = 'progressive') {
  const c = Number(ctx) || 0;
  if (c < 2048) return '';
  const fit = (most, part) => Math.min(most, Math.floor(c / part / 256) * 256);
  const q4 = `q4_0:${fit(65536, 2)}`;
  // Nov 21 (npc, BE26, step 4096 / c4096): a 2K ring writes faster than 8K (8+3 at 32K 80.1 vs 74.9 t/s) and stays
  // sharper than q4 for 8+4 (KLD 0.0196 vs q4 0.0227; 8+3 0.0322, between q4 and q3 0.0484). 8+2 keeps its tested 8K.
  if (type === 'progressive83' || type === 'progressive84') return `q8_0:${fit(2048, 4)}`;
  if (type === 'progressive82') return `q8_0:${fit(8192, 4)}`;
  return type === 'progressive2' ? q4 : `q8_0:${fit(8192, 4)},${q4}`;
}
export function tiersEnv(cfg, model, ctx, { q3 = false, q2 = false, tiers = false, handArgs } = {}) {
  const type = memTypeOf(cfg, model, { q3, q2, tiers });
  if (!/^progressive(2|83|84|82)?$/.test(type)) return {};
  if (Array.isArray(handArgs) && handArgs.some((a) => ['-np', '--parallel'].includes(a) && Number(handArgs[handArgs.indexOf(a) + 1]) > 1)) return {};
  const t = progressiveTiers(ctx, type);
  return t ? { LLAMA_KV_TIERS: t, LLAMA_KV_TIERS_SLACK: String(TIERS_SLACK) } : {};
}
// Turbo: sharp start (Nov 24, Brain Engine 0122, from llamAmpere's SJ-KVaRN sink; off unless switched on, and only
// with Turbo): the chat's first 128 tokens kept again at 16-bit beside a 4-bit, 3-bit, 2-bit or Progressive chat
// memory, read as Progressive Memory's sharpest step. About 5 MiB on Qwen3.6-35B-A3B. Changes the answer a little, so
// it sits behind Turbo; npc measures whether it helps. The engine names LLAMA_KV_SINK in --help when it has it.
export const helpHasSink = (text) => /\bLLAMA_KV_SINK\b/.test(String(text ?? ''));
export const SINK_SPEC = 'f16:128';
export const SINK_TYPES = ['small', 'smallest', 'progressive', 'progressive2', 'progressive83', 'progressive84', 'progressive82'];
export function sinkEnv(cfg, model, ctx, { q3 = false, q2 = false, tiers = false, sink = false, handArgs } = {}) {
  if (cfg?.turbo !== true || cfg?.turboSink !== true || !sink || !(Number(ctx) > 512)) return {};
  if (!SINK_TYPES.includes(memTypeOf(cfg, model, { q3, q2, tiers }))) return {};
  if (Array.isArray(handArgs) && handArgs.some((a) => ['-np', '--parallel'].includes(a) && Number(handArgs[handArgs.indexOf(a) + 1]) > 1)) return {};
  return { LLAMA_KV_SINK: SINK_SPEC };
}
// ---------- 98 Laptop mode ----------
// Is this computer running on its battery right now? true, false, or null when it has no battery or can't tell.
export function parseWinBattery(out) {
  const s = String(out ?? '').trim().split(/\s+/).filter(Boolean)[0];
  if (!s) return null;
  const n = Number(s);
  return n === 1 || n === 4 || n === 5 ? true : n >= 2 && n <= 11 ? false : null; // Win32_Battery: 1 discharging, 4 low, 5 critical
}
export function parseMacBattery(out) {
  const t = String(out ?? '');
  if (/Battery Power/i.test(t)) return true;
  if (/AC Power/i.test(t)) return /InternalBattery/i.test(t) ? false : null;
  return null;
}
// Linux: /sys/class/power_supply. A mains supply that's offline, or a battery that's discharging.
export function linuxBattery({ dir = '/sys/class/power_supply', list = fs.readdirSync, read = fs.readFileSync } = {}) {
  let names = [];
  try { names = list(dir); } catch { return null; }
  const val = (n, f) => { try { return String(read(path.join(dir, n, f), 'utf8')).replace(/\r?\n/g, '').trim(); } catch { return ''; } };
  let battery = false, mainsOn = null;
  for (const n of names) {
    const type = val(n, 'type');
    if (type === 'Mains') mainsOn = (mainsOn === true) || val(n, 'online') === '1';
    if (type === 'Battery') { battery = true; if (val(n, 'status') === 'Discharging') return true; }
  }
  if (!battery) return null;
  return mainsOn === null ? false : !mainsOn;
}
export function onBattery({ os_ = process.platform, execImpl = execFile, linux = linuxBattery } = {}) {
  const run = (file, args) => new Promise((resolve) => {
    try { execImpl(file, args, { timeout: 5000, windowsHide: true }, (err, out) => resolve(err ? null : String(out))); } catch { resolve(null); }
  });
  if (os_ === 'win32') return run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', '(Get-CimInstance Win32_Battery).BatteryStatus']).then(parseWinBattery);
  if (os_ === 'darwin') return run('pmset', ['-g', 'batt']).then(parseMacBattery);
  if (os_ === 'linux') return Promise.resolve(linux());
  return Promise.resolve(null);
}
// What the battery watch last saw (server.js asks once a minute while Laptop mode is on).
const power = { battery: null, at: 0 };
export const setOnBattery = (v, now = Date.now()) => { power.battery = v === true ? true : v === false ? false : null; power.at = now; };
export const batteryNow = () => power.battery;
export const laptopSaving = (cfg) => extraOn(cfg, 'laptopMode') && power.battery === true;
// Fewer threads on battery: half the cores, at least two. Threads set by hand (llamacpp.threads) win.
export function laptopThreads(cfg, { cpus = os.cpus().length || 2 } = {}) {
  if (!laptopSaving(cfg) || (Number.isInteger(cfg?.llamacpp?.threads) && cfg.llamacpp.threads > 0)) return null;
  return Math.max(2, Math.floor(cpus / 4)); // os.cpus() counts both threads of each core: a quarter is half the cores
}

// ---------- 97 Test a new card by itself ----------
// A short name for the graphics this computer has. '' when there's nothing to compare.
export const cardKey = (gpu) => (gpu?.name ? `${String(gpu.name).trim()}|${Number(gpu.vramGB) || 0}` : '');
export const cardSeenFile = (cfg) => path.join(cfg.dataDir, 'card-seen.json');
// { changed, from, to }. The first look only remembers the card, so a fresh Bob never tests at its first start.
export function cardChange(cfg, gpu, { read = fs.readFileSync, write = fs.writeFileSync } = {}) {
  const to = cardKey(gpu);
  let from = '';
  try { from = String(JSON.parse(read(cardSeenFile(cfg), 'utf8')).card || ''); } catch {}
  if (to && to !== from) { try { write(cardSeenFile(cfg), JSON.stringify({ card: to, at: new Date().toISOString() })); } catch {} }
  return { changed: Boolean(from && to && from !== to), from, to };
}
// Placements set by hand were for the old card: they go back to Auto (the number is kept, so By hand puts it back).
export function placesToAuto(brainPlace = {}) {
  const out = {};
  let n = 0;
  for (const [k, p] of Object.entries(brainPlace || {})) { out[k] = { ...p, mode: 'auto' }; if (p?.mode === 'hand') n++; }
  return { brainPlace: out, changed: n };
}
export const cardName = (key) => String(key || '').split('|')[0] || 'the old card';

// ---------- 95 Preload the next brain ----------
// While the chat brain is still writing its hand-off, the next brain's file is read once from the drive, so the
// load that follows comes from memory instead of the drive. Only when the computer has the room: the file plus
// 4 GB to spare. Nothing goes on the card early, and nothing the chat brain uses is touched.
export const WARM_SPARE = 4 * 1024 ** 3;
export const warmRoom = (sizeBytes, freeBytes) => sizeBytes > 0 && freeBytes >= sizeBytes + WARM_SPARE;
// The hat a hand-off names, from its arguments as they stream in ('' until it's there).
export function handoffHat(name, args) {
  if (name !== 'ask_specialist') return '';
  const m = /"hat"\s*:\s*"([a-z_]+)"/.exec(String(args || ''));
  return m ? m[1] : '';
}
const warming = new Set();
export function warmFile(file, { open = fs.createReadStream, done = () => {} } = {}) {
  if (!file || warming.has(file)) return false;
  warming.add(file);
  let s;
  try { s = open(file, { highWaterMark: 8 << 20 }); } catch { warming.delete(file); return false; }
  const end = (ok) => { warming.delete(file); try { done(ok); } catch {} };
  s.on('data', () => {}); // read and let go: the drive's copy is now in memory
  s.on('end', () => end(true));
  s.on('error', () => end(false));
  return true;
}

// ---------- 99 Engine updates in plain words ----------
// Brain Engine: one or two lines per version, written when each one ships.
export const BRAIN_ENGINE_NOTES = {
  3: 'Built on a newer llama.cpp (b12282), with CUDA 13.5 on NVIDIA cards. Adds SCUT, a faster Wi-Fi link for sharing a card between Bobs, and the SUDDAR scan.',
  4: 'Every SCUT packet between your Bobs is sealed, so nobody else on the network can read or change it.',
  8: 'Built on llama.cpp 1.0 (b12359). Faster NVIDIA cards on small batches and a tidier engine underneath; all of Bob\'s own changes carried over, and it still shares cards with Bobs on Brain Engine 7.',
  14: 'The fNRI cube\'s expert trace no longer slows Bob or changes his words (it costs 0 to 2% now). Also carries new speed switches for the hot-experts cache, all off.'
};
// Brain Engine's own build number from its release name (brain-engine-5b12282 or the older brain-engine-v4; public/engine-name.js).
export const brainEngineNumber = (tag) => brainEngineBuild(tag)?.n || 0;
// llama.cpp: its release notes are written for programmers, so only the parts that matter to you are picked out.
const PLAIN = [
  [/\b(cuda|nvidia|cublas)\b/i, 'Changes for NVIDIA graphics cards.'],
  [/\b(vulkan|hip|rocm|radeon)\b/i, 'Changes for AMD and Intel graphics (Vulkan).'],
  [/\b(metal|apple)\b/i, 'Changes for Macs.'],
  [/\b(faster|speed ?up|perf(ormance)?|optimi[sz])/i, 'Some brains may run faster.'],
  [/\b(add(ed|s)? support for|new model|arch(itecture)?)\b/i, 'Can run some newer brains.'],
  [/\b(fix(es|ed)?|crash|bug)\b/i, 'Fixes for problems found in the last build.'],
  [/\b(server|tool call|chat template|jinja)\b/i, 'Changes to how the engine answers me.']
];
export function plainEngineNotes(id, { to = '', body = '' } = {}) {
  if (id === 'brainengine') { const n = brainEngineNumber(to); return BRAIN_ENGINE_NOTES[n] || ''; }
  const hits = [];
  for (const [re, line] of PLAIN) if (re.test(String(body || '')) && !hits.includes(line)) hits.push(line);
  if (hits.length) return hits.slice(0, 2).join(' ');
  if (body) return 'Small changes; nothing you should notice.';
  // llama.cpp only ever moves up to the build this Bob was tested with, so that's what it means for you.
  return id === 'llamacpp' && to ? `Moves to ${to}, the llama.cpp build this Bob was tested with: its fixes and speed-ups, nothing for you to change.` : '';
}
// The line added to the update messages in the chat, when "Engine update notes" is on.
export const engineNoteLine = (cfg, id, to) => { const t = extraOn(cfg, 'engineNotes') ? plainEngineNotes(id, { to }) : ''; return t ? ` What it changes for you: ${t}` : ''; };
