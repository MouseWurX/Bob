// Engine and speed extras (list items 94 to 100). Every switch here is off until the owner turns it on, in Settings,
// Brains and speed. Each one is a small pure function, so the tests pass the computer in as a fake.
//   copyGuess    94  Guess-ahead from the chat: the engine copies words that already sit in the chat (n-gram lookup)
//   preloadNext  95  Preload the next brain: read the next brain's file into memory while the first still talks
//   speedLog     96  Speed history (speed-log.js)
//   newCardTest  97  Test a new card by itself: a one-minute speed test and placements back to Auto
//   laptopMode   98  Laptop mode: on battery, the Quick brain answers and the engine uses fewer threads
//   engineNotes  99  Engine updates in plain words
//   brainMemType 100 The engine's memory type per brain (Brains page, Set up)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { MEM_TYPES, memTypeTrade } from '../public/mem-types.js';
import { brainEngineBuild } from '../public/engine-name.js';

export const EXTRA_SWITCHES = ['copyGuess', 'preloadNext', 'speedLog', 'newCardTest', 'laptopMode', 'engineNotes'];
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
  if (args.some((a) => ['--spec-type', '-md', '--model-draft', '--spec-draft-model', '--spec-draft-hf', '-hfd'].includes(a))) return []; // Turbo or a draft brain already guesses
  return [...COPY_GUESS_ARGS];
}

// ---------- 100 The engine's memory type per brain ----------
// The types themselves are shared with the Brains page (public/mem-types.js).
export { MEM_TYPES, memTypeTrade };
export function cleanMemType(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, t] of Object.entries(v).slice(0, 64)) {
    if (typeof k !== 'string' || !k || k.length > 200 || /[\u0000-\u001f]/.test(k)) continue;
    if (t === 'standard' || t === 'sharp' || t === 'small') out[k] = t; // standard is kept, so a saved change back to it wins
  }
  return out;
}
export const memTypeOf = (cfg, model) => (cfg?.brainMemType?.[model] === 'sharp' || cfg?.brainMemType?.[model] === 'small' ? cfg.brainMemType[model] : 'standard');
// The engine's own flags for this brain. Flags set by hand (llamacpp.args in config.json) are kept, but a memory
// type picked for this brain on the Brains page sets -ctk and -ctv (1.5.207 PC check: config.example.json ships
// "-fa on -ctk q8_0 -ctv q8_0", so every new home had args "set by hand" and Sharper and Smaller did nothing).
export function memArgs(cfg, model, handArgs) {
  const type = memTypeOf(cfg, model);
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
  4: 'Every SCUT packet between your Bobs is sealed, so nobody else on the network can read or change it.'
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
