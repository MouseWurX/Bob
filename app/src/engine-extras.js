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
//   turboEveryday 102 MTP for everyday brains: a brain's own built-in guesser (MTP) on, without the Lab
//   hotExperts   104 Hot experts on the card: llama.cpp's expert cache, filled from a profile (src/hot-experts.js)
//   lockBrainMemory 103 Lock brain memory: the part of a brain in RAM stays there (--mlock), so Windows can't page it out
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { MEM_TYPES, memTypeTrade } from '../public/mem-types.js';
import { brainEngineBuild } from '../public/engine-name.js';

export const EXTRA_SWITCHES = ['copyGuess', 'preloadNext', 'speedLog', 'newCardTest', 'laptopMode', 'engineNotes', 'turboEveryday', 'lockBrainMemory', 'hotExperts', 'turbo'];
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
export function copyGuessArgs(cfg, { build = 0, args = [] } = {}) {
  if (!extraOn(cfg, 'copyGuess') || !newSpecFlags(build)) return [];
  if (args.some((a) => ['--spec-type', '-md', '--model-draft', '--spec-draft-model', '--spec-draft-hf', '-hfd'].includes(a))) return []; // MTP or a draft brain already guesses
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

// ---------- 102 MTP for everyday brains ----------
// Some brains carry their own guesser in the file (a multi-token prediction head, "nextn"): it guesses the next few
// words and the brain checks them in one go, so the answer is the same, only quicker. The Lab's MTP page turns it
// on per brain; this switch turns it on for every brain that has one, unless MTP or a draft brain is set for it.
// 3 guesses at a time: one head's guesses get worse the further out they go.
export const TURBO_EVERYDAY_MAX = 3;
export function everydayTurboArgs(cfg, { build = 0, args = [], mtp = 0, cpu = false } = {}) {
  if (!extraOn(cfg, 'turboEveryday') || cpu || !(mtp > 0) || !newSpecFlags(build)) return [];
  if (args.some((a) => ['--spec-type', '-md', '--model-draft', '--spec-draft-model', '--spec-draft-hf', '-hfd'].includes(a))) return [];
  return ['--spec-type', 'draft-mtp', ...draftNumArgs(build, TURBO_EVERYDAY_MAX)];
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
    if (t === 'standard' || t === 'sharp' || t === 'small' || t === 'smallest' || t === 'progressive' || t === 'progressive2') out[k] = t; // standard is kept, so a saved change back to it wins
  }
  return out;
}
// Does an engine's --help list q3_0 among its cache types ("allowed values: ..., q3_0, ...", which may wrap)?
// 0038's 3-bit chat memory has kernels for CUDA cards and the processor only. A Mac (Metal) or an engine folder whose
// card file is Vulkan without CUDA would run that attention on the processor, so Bob doesn't offer it there.
export const q3CardOk = (files, platform) => platform !== 'darwin' && !((files || []).some((f) => /ggml-(vulkan|metal)/i.test(f)) && !(files || []).some((f) => /ggml-cuda/i.test(f)));
// The engine lists its chat memory types under -ctv in --help (wrapped over lines); 3-bit is there only on a Brain Engine with 0038.
export const helpHasQ3 = (text) => { const t = String(text ?? ''), at = t.indexOf('--cache-type-v'); const m = at < 0 ? null : t.slice(at).match(/allowed values:[^\n]*(?:\r?\n[ \t]+[^-\s][^\n]*)*/); return Boolean(m) && /\bq3_0\b/.test(m[0]); };
// ---------- Turbo (Nov 20, the owner's ask; off unless switched on) ----------
// A show-off speed mode, not for real jobs: every speed trick that costs a little answer quality, at once. Its chat
// memory is 3-bit (Smallest) for every brain unless picked otherwise (Smaller, or one of the Progressive kinds), and a
// brain made of experts uses 4 per word when it has more (turboExperts, on unless switched off). The brain's own picks
// come back when Turbo is off. Without a Brain Engine that has 3-bit, Smallest and Progressive fall back to Smaller.
export const TURBO_MEMS = ['smallest', 'small', 'progressive', 'progressive2'];
export const turboMem = (cfg) => (TURBO_MEMS.includes(cfg?.turboMem) ? cfg.turboMem : 'smallest');
export const TURBO_EXPERTS = 4;
export const turboExperts = (cfg) => cfg?.turbo === true && cfg?.turboExperts !== false;
// The experts per word Turbo asks of a brain whose own count is `own`: 4 when it has more, else nothing.
export const turboPerWord = (cfg, own) => (turboExperts(cfg) && Number(own) > TURBO_EXPERTS ? TURBO_EXPERTS : null);
// Progressive Memory (Brain Engine patch 0039): the engine names LLAMA_KV_TIERS under -ctv in --help.
export const helpHasTiers = (text) => /\bLLAMA_KV_TIERS\b/.test(String(text ?? ''));
// Smallest (3-bit, Brain Engine patch 0038) needs an engine that has q3_0; without one it falls back to Smaller.
// Progressive needs both; without them it falls back to Smaller too (the nearest in room).
export function memTypeOf(cfg, model, { q3 = false, tiers = false } = {}) {
  const t = cfg?.turbo === true ? turboMem(cfg) : cfg?.brainMemType?.[model];
  if (t === 'smallest') return q3 ? 'smallest' : 'small';
  if (t === 'progressive' || t === 'progressive2') return q3 && tiers ? t : 'small';
  return t === 'sharp' || t === 'small' ? t : 'standard';
}
// The engine's own flags for this brain. Flags set by hand (llamacpp.args in config.json) are kept, but a memory
// type picked for this brain on the Brains page sets -ctk and -ctv (1.5.207 PC check: config.example.json ships
// "-fa on -ctk q8_0 -ctv q8_0", so every new home had args "set by hand" and Sharper and Smaller did nothing).
export function memArgs(cfg, model, handArgs, { q3 = false, tiers = false } = {}) {
  const type = memTypeOf(cfg, model, { q3, tiers });
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
// Windows are whole 256s, below the context, or the engine says NOT USED.
// The slack is room in each step for one batch: the reading step (4096 covers Fastest); a bigger batch still works,
// it reads the 3-bit copy for that batch only.
export const TIERS_SLACK = 4096;
export function progressiveTiers(ctx, type = 'progressive') {
  const c = Number(ctx) || 0;
  if (c < 2048) return '';
  const fit = (most, part) => Math.min(most, Math.floor(c / part / 256) * 256);
  const q4 = `q4_0:${fit(65536, 2)}`;
  return type === 'progressive2' ? q4 : `q8_0:${fit(8192, 4)},${q4}`;
}
export function tiersEnv(cfg, model, ctx, { q3 = false, tiers = false, handArgs } = {}) {
  const type = memTypeOf(cfg, model, { q3, tiers });
  if (type !== 'progressive' && type !== 'progressive2') return {};
  if (Array.isArray(handArgs) && handArgs.some((a) => ['-np', '--parallel'].includes(a) && Number(handArgs[handArgs.indexOf(a) + 1]) > 1)) return {};
  const t = progressiveTiers(ctx, type);
  return t ? { LLAMA_KV_TIERS: t, LLAMA_KV_TIERS_SLACK: String(TIERS_SLACK) } : {};
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
  8: 'Built on llama.cpp 1.0 (b12359). Faster NVIDIA cards on small batches and a tidier engine underneath; all of Bob\'s own changes carried over, and it still shares cards with Bobs on Brain Engine 7.'
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
