// Engine and speed extras, list items 94 to 100 (src/engine-extras.js, src/engine-extras-run.js, src/speed-log.js):
// all off unless turned on, the engine's start flags, Laptop mode, the new card test, the next brain read ahead, the
// speed history, engine updates in plain words, the memory type per brain, and the Settings, Help, glossary and FAQ.
// Nothing here reads the real computer: batteries, cards, files and timers are fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { mergeSettings } from '../src/config.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { modelFor } from '../src/sessions.js';
import {
  EXTRA_SWITCHES, extraOn, newSpecFlags, draftNumArgs, copyGuessArgs, COPY_GUESS_ARGS, cleanMemType, memTypeOf, memArgs, MEM_TYPES,
  parseWinBattery, parseMacBattery, linuxBattery, onBattery, setOnBattery, batteryNow, laptopSaving, laptopThreads,
  cardKey, cardChange, placesToAuto, handoffHat, warmRoom, warmFile, WARM_SPARE, plainEngineNotes, engineNoteLine, brainEngineNumber,
  READING_PICKS, readingPick, readingSteps, readingChoice, readingArgs, dropReading, lockRoom, lockFloor, everydayTurboArgs, TURBO_EVERYDAY_MAX, lockMemoryArgs
} from '../src/engine-extras.js';
import { startEngineExtras, engineLabel } from '../src/engine-extras-run.js';
import { addReply, speedSeries, logReply, readSpeedLog, KEEP_DAYS } from '../src/speed-log.js';
import { memTypeTrade } from '../public/mem-types.js';
import { memTypeHtml } from '../public/brains.js';
import { HELP } from '../public/help-content.js';
import { WANTS } from '../public/wants.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-extras-'));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Off unless turned on ----------
check('eight switches, all off in a fresh Bob', EXTRA_SWITCHES.length === 8 && EXTRA_SWITCHES.every((k) => !extraOn({}, k)));
{ const m = mergeSettings({}, Object.fromEntries(EXTRA_SWITCHES.map((k) => [k, 'yes'])));
  check('only true turns one on when saved', EXTRA_SWITCHES.every((k) => m[k] === false) && mergeSettings({}, { copyGuess: true }).copyGuess === true); }
check('the example settings file switches none of them on', (() => { const ex = JSON.parse(read('config.example.json')); return EXTRA_SWITCHES.every((k) => ex[k] !== true) && !ex.brainMemType; })());

// ---------- 101 Reading speed ----------
check('reading speed: Normal in a fresh Bob, and nothing added', readingPick({}) === 'normal' && readingSteps({}) === 0 && readingArgs({}).length === 0);
check('reading speed: an unknown pick is Normal', readingPick({ readingSpeed: 'warp' }) === 'normal' && READING_PICKS.join() === 'normal,faster,fastest,auto');
check('reading speed: Faster and Fastest set both -b and -ub', readingArgs({ readingSpeed: 'faster' }).join(' ') === '-b 2048 -ub 2048' && readingArgs({ readingSpeed: 'fastest' }).join(' ') === '-b 4096 -ub 4096');
check('reading speed: Auto picks by the card (fake cards)', readingSteps({ readingSpeed: 'auto', gpuVramGB: 16 }) === 4096 && readingSteps({ readingSpeed: 'auto', cardGB: 6 }) === 2048 && readingSteps({ readingSpeed: 'auto', cardGB: 4 }) === 0 && readingSteps({ readingSpeed: 'auto', sharedGraphics: true, cardGB: 16 }) === 0 && readingSteps({ readingSpeed: 'auto' }) === 0);
check('reading speed: not on the processor, and a batch set by hand wins', readingArgs({ readingSpeed: 'fastest' }, { cpu: true }).length === 0 && readingArgs({ readingSpeed: 'fastest' }, { hand: { ubatch: 256 } }).length === 0 && readingArgs({ readingSpeed: 'fastest' }, { hand: { batch: 1024 } }).length === 0);
check('reading speed: a spread load takes the steps back out, in place', (() => { const a = ['-m', 'x', '-b', '4096', '-ub', '4096', '--fit', 'on']; const r = dropReading(a); return r === a && a.join(' ') === '-m x --fit on'; })());

check('Auto says why: the card, then the last 3 prompts', (() => { const big = { readingSpeed: 'auto', gpuVramGB: 16 };
  const a = readingChoice(big, { recent: [20000, 30000, 500] }), b = readingChoice(big, { recent: [800, 900, 1200] }), c = readingChoice({ readingSpeed: 'auto', cardGB: 8 }), d = readingChoice({ readingSpeed: 'auto', sharedGraphics: true });
  return a.steps === 4096 && /Fastest: 16 GB card, and 2 of your last 3 prompts were over 16,384/.test(a.why) && b.steps === 2048 && /all under 4,096/.test(b.why) && c.steps === 2048 && /8 GB card/.test(c.why) && d.steps === 0 && /built-in graphics/.test(d.why) && readingChoice({ readingSpeed: 'fastest' }).why === ''; })());
check('Auto: fewer than 3 prompts seen keeps Fastest on a big card', readingChoice({ readingSpeed: 'auto', gpuVramGB: 16 }, { recent: [500, 600] }).steps === 4096);

// ---------- 102 Turbo for everyday brains ----------
check('everyday Turbo: nothing while off', everydayTurboArgs({}, { mtp: 1 }).length === 0);
check('everyday Turbo: a brain with its own guesser uses it, 3 at a time', everydayTurboArgs({ turboEveryday: true }, { mtp: 1, build: 12359 }).join(' ') === `--spec-type draft-mtp --spec-draft-n-max ${TURBO_EVERYDAY_MAX}` && TURBO_EVERYDAY_MAX === 3);
check('everyday Turbo: no guesser, the processor, an old engine, or Turbo/draft already set: nothing', [everydayTurboArgs({ turboEveryday: true }, { mtp: 0 }), everydayTurboArgs({ turboEveryday: true }, { mtp: 1, cpu: true }), everydayTurboArgs({ turboEveryday: true }, { mtp: 1, build: 9000 }), everydayTurboArgs({ turboEveryday: true }, { mtp: 1, args: ['-md', 'd.gguf'] }), everydayTurboArgs({ turboEveryday: true }, { mtp: 1, args: ['--spec-type', 'ngram-mod'] })].every((x) => x.length === 0));

// ---------- 103 Lock brain memory ----------
{ const G = 1024 ** 3;
  check('lock memory: a floor of 4 GB or a quarter of the RAM', lockFloor(32 * G) === 8 * G && lockFloor(16 * G) === 4 * G);
  check('lock memory: room on a 32 GB PC with a 10 GB RAM part and 24 GB free', lockRoom({ totalBytes: 32 * G, freeBytes: 24 * G, ramPart: 10 * G, platform: 'win32', arm: false }).ok);
  check('lock memory: no room when it would leave under the floor', /would be left free/.test(lockRoom({ totalBytes: 32 * G, freeBytes: 20 * G, ramPart: 14 * G, platform: 'win32', arm: false }).why));
  check('lock memory: never under 16 GB of RAM, on Android or an ARM board', !lockRoom({ totalBytes: 8 * G, freeBytes: 7 * G, platform: 'win32', arm: false }).ok && !lockRoom({ totalBytes: 32 * G, freeBytes: 30 * G, platform: 'android' }).ok && !lockRoom({ totalBytes: 32 * G, freeBytes: 30 * G, platform: 'linux', arm: true }).ok);
  check('lock memory: no room means no --mlock', lockMemoryArgs({ lockBrainMemory: true }, { args: ['--fit', 'on'], room: { ok: false } }).length === 0); }
check('lock memory: nothing while off', lockMemoryArgs({}, { args: ['--fit', 'on'] }).length === 0);
check('lock memory: --mlock only when part of the brain is in RAM', lockMemoryArgs({ lockBrainMemory: true }, { args: ['--fit', 'on'] }).join() === '--mlock' && lockMemoryArgs({ lockBrainMemory: true }, { args: ['--n-cpu-moe', '8'] }).join() === '--mlock' && lockMemoryArgs({ lockBrainMemory: true }, { args: ['-ngl', '999'] }).length === 0);
check('lock memory: not for the processor brain, and never twice', lockMemoryArgs({ lockBrainMemory: true }, { args: ['--fit', 'on'], cpu: true }).length === 0 && lockMemoryArgs({ lockBrainMemory: true }, { args: ['--fit', 'on', '--mlock'] }).length === 0);
check('Help, glossary and FAQs for items 101-103', (() => { const ex = HELP.find((h) => h.id === 'engine-extras')?.html || ''; const gl = HELP.find((h) => h.id === 'glossary')?.html || ''; return ['Reading speed', 'Turbo for everyday brains', 'Lock brain memory'].every((t) => ex.includes(t)) && ['faq-reading-speed', 'faq-turbo-everyday', 'faq-lock-memory'].every((id) => HELP.some((h) => h.id === id && h.group === 'FAQ')) && ['Reading speed (batch size)', 'Locked memory', 'Built-in guesser (multi-token prediction)'].every((t) => gl.includes(`<dt>${t}</dt>`)); })());
check('Settings has the three new controls', (() => { const t = read('public/cellar-engines.js'); return /data-set="readingSpeed"/.test(t) && /sswitch\('turboEveryday'/.test(t) && /sswitch\('lockBrainMemory'/.test(t); })());

// ---------- 94 Guess-ahead from the chat ----------
check('new speculative flag names from about b9530, old ones before', newSpecFlags(0) && newSpecFlags(12282) && !newSpecFlags(9000) && draftNumArgs(12282, 8, 0).join(' ') === '--spec-draft-n-max 8 --spec-draft-n-min 0' && draftNumArgs(9000, 8, 0).join(' ') === '--draft-max 8 --draft-min 0');
check('copy guessing: nothing while off', copyGuessArgs({}, { build: 12282 }).length === 0);
check('copy guessing: ngram-mod when on', copyGuessArgs({ copyGuess: true }, { build: 12282 }).join(' ') === '--spec-type ngram-mod' && COPY_GUESS_ARGS[1] === 'ngram-mod');
check('copy guessing: not on an engine too old to know it', copyGuessArgs({ copyGuess: true }, { build: 9000 }).length === 0);
check('copy guessing: Turbo or a draft brain wins', copyGuessArgs({ copyGuess: true }, { args: ['-md', 'x.gguf'] }).length === 0 && copyGuessArgs({ copyGuess: true }, { args: ['--spec-type', 'draft-mtp'] }).length === 0);
const big = path.join(tmp, 'big.gguf'), small = path.join(tmp, 'small.gguf');
fs.writeFileSync(big, 'x'); fs.writeFileSync(small, 'x');
const engineOf = (extra = {}, lc = {}) => { const e = new LlamaCpp({ agentDir: tmp, dataDir: tmp, ...extra, llamacpp: { models: { big, small }, ...lc } }); clearInterval(e.idleTimer); return e; };
{ const a = engineOf({ readingSpeed: 'fastest' }).buildArgs('big'); const off = engineOf().buildArgs('big');
  check('reading speed reaches the engine\'s start flags, and Normal adds none', a[a.indexOf('-ub') + 1] === '4096' && a[a.indexOf('-b') + 1] === '4096' && !off.includes('-ub'), a.join(' '));
  const cpuA = engineOf({ readingSpeed: 'fastest' }).buildArgs('big', { cpu: true }); check('reading speed: not for the processor brain', !cpuA.includes('-ub'), cpuA.join(' '));
  const hand = engineOf({ readingSpeed: 'fastest' }, { ubatch: 256 }).buildArgs('big'); check('reading speed: a micro-batch set by hand wins', hand.filter((x) => x === '-ub').length === 1 && hand[hand.indexOf('-ub') + 1] === '256', hand.join(' ')); }
{ const off = engineOf().buildArgs('big').join(' '), on = engineOf({ copyGuess: true }).buildArgs('big').join(' ');
  const turbo = engineOf({ copyGuess: true }, { turbo: { big: { on: true, draft: 'small', max: 8 } } }).buildArgs('big').join(' ');
  check('Bob\'s engine starts with the copying guesser only with the switch on', !off.includes('ngram') && on.endsWith('--spec-type ngram-mod'), on);
  check('Turbo for that brain wins over the copying guesser', turbo.includes('-md') && !turbo.includes('ngram-mod'), turbo);
  check('Turbo uses the flag names today\'s engine accepts', turbo.includes('--spec-draft-n-max 8 --spec-draft-n-min 0') && !/--draft-max|--draft-min/.test(turbo), turbo); }

// ---------- 100 Memory type per brain ----------
check('memory types: Standard 8-bit, Sharper 16-bit, Smaller 4-bit', MEM_TYPES.standard.k === 'q8_0' && MEM_TYPES.sharp.k === 'f16' && MEM_TYPES.small.v === 'q4_0');
check('saved types are cleaned (unknown dropped, Standard kept so a change back sticks)', JSON.stringify(cleanMemType({ a: 'sharp', b: 'standard', c: 'f32', 'd\u0001': 'small' })) === '{"a":"sharp","b":"standard"}' && JSON.stringify(cleanMemType([1])) === '{}');
check('a brain is Standard unless picked', memTypeOf({}, 'big') === 'standard' && memTypeOf({ brainMemType: { big: 'small' } }, 'big') === 'small');
check('a picked memory type sets the cache flags even with flags set by hand (the shipped config has some)', memArgs({ brainMemType: { big: 'sharp' } }, 'big', ['-fa', 'on', '-ctk', 'q8_0', '-ctv', 'q8_0', '--mlock']).join(' ') === `-fa on --mlock -ctk ${MEM_TYPES.sharp.k} -ctv ${MEM_TYPES.sharp.v}`);
check('Smaller too, and other hand flags stay', memArgs({ brainMemType: { big: 'small' } }, 'big', ['--cache-type-k', 'f16', '-t', '8']).join(' ') === `-t 8 -fa on -ctk ${MEM_TYPES.small.k} -ctv ${MEM_TYPES.small.v}`);
check('Standard keeps flags set by hand as they are', memArgs({}, 'big', ['-ctk', 'f32']).join(' ') === '-ctk f32');
{ const std = engineOf().buildArgs('big').join(' '), sharp = engineOf({ brainMemType: { big: 'sharp' } }).buildArgs('big').join(' '), other = engineOf({ brainMemType: { big: 'sharp' } }).buildArgs('small').join(' ');
  check('Standard starts as before (-fa on, q8_0)', std.includes('-fa on -ctk q8_0 -ctv q8_0'));
  check('Sharper starts that brain with f16, and only that brain', sharp.includes('-ctk f16 -ctv f16') && other.includes('-ctk q8_0 -ctv q8_0')); }
{ const t = memTypeTrade(2);
  check('the trade on the page: twice and half the Standard figure', t.find((x) => x.id === 'sharp').gb === 4 && t.find((x) => x.id === 'small').gb === 1 && memTypeTrade(null).every((x) => x.gb === null)); }
{ const b = { value: 'big', name: 'Big' };
  const on = memTypeHtml(b, { place: { brains: { big: { memType: 'small', kv32: 2, memEngine: true } } } });
  const oll = memTypeHtml(b, { place: { brains: { big: { memType: 'standard', kv32: null, memEngine: false } } } });
  check('the Brains page shows the three types, the pick pressed, and GB for a 32K chat', /data-memtype="small"[^>]*aria-pressed="true"/.test(on) && /about 1 GB for a 32K chat/.test(on) && /Sharper/.test(on));
  check('with Ollama the choice is locked and says why', /disabled/.test(oll) && /Only with Brain Engine or llama\.cpp/.test(oll)); }

// ---------- 98 Laptop mode ----------
check('Windows battery: 1 is on battery, 2 plugged in, nothing is no battery', parseWinBattery('1\r\n') === true && parseWinBattery('2') === false && parseWinBattery('') === null);
check('Mac battery: pmset\'s words', parseMacBattery("Now drawing from 'Battery Power'\n -InternalBattery-0 80%") === true && parseMacBattery("Now drawing from 'AC Power'\n -InternalBattery-0") === false && parseMacBattery("Now drawing from 'AC Power'") === null);
{ const fake = (files) => ({ list: () => Object.keys(files).map((p) => p.split('/')[0]).filter((v, i, a) => a.indexOf(v) === i), read: (p) => { const k = p.split(path.sep).slice(-2).join('/'); if (!(k in files)) throw new Error('none'); return files[k] + '\n'; } });
  check('Linux battery: discharging', linuxBattery({ dir: 'x', ...fake({ 'BAT0/type': 'Battery', 'BAT0/status': 'Discharging' }) }) === true);
  check('Linux battery: mains online', linuxBattery({ dir: 'x', ...fake({ 'AC/type': 'Mains', 'AC/online': '1', 'BAT0/type': 'Battery', 'BAT0/status': 'Charging' }) }) === false);
  check('Linux: a desktop with no battery', linuxBattery({ dir: 'x', ...fake({ 'AC/type': 'Mains', 'AC/online': '1' }) }) === null && linuxBattery({ list: () => { throw new Error('no'); } }) === null); }
check('Windows asks through PowerShell, with no window', await (async () => { let seen = null; const r = await onBattery({ os_: 'win32', execImpl: (f, a, o, cb) => { seen = { f, a, o }; cb(null, '1'); } }); return r === true && /powershell/i.test(seen.f) && seen.o.windowsHide === true && seen.a.join(' ').includes('Win32_Battery'); })());
check('Android and others: no answer', (await onBattery({ os_: 'android' })) === null);
setOnBattery(true);
check('Laptop mode saves only with the switch on and the battery in use', laptopSaving({ laptopMode: true }) && !laptopSaving({}) && (setOnBattery(false), !laptopSaving({ laptopMode: true })));
setOnBattery(true);
{ const cfg = { laptopMode: true, models: { bob: 'big-brain' }, sessionBrains: { small: 'quick-brain' } };
  check('on battery the Quick brain answers the chat, on the card', modelFor(cfg, 'bob').model === 'quick-brain' && modelFor(cfg, 'bob').cpu === false);
  check('jobs keep their own brains', modelFor({ ...cfg, models: { bob: 'big-brain', tinker: 'coder' } }, 'tinker').model === 'coder');
  check('half the cores on battery (a quarter of the threads os.cpus counts)', laptopThreads(cfg, { cpus: 16 }) === 4 && laptopThreads(cfg, { cpus: 4 }) === 2);
  check('threads set by hand win', laptopThreads({ ...cfg, llamacpp: { threads: 6 } }, { cpus: 16 }) === null);
  const args = engineOf({ laptopMode: true }).buildArgs('big');
  check('the engine starts with fewer threads on battery', args.includes('-t')); }
setOnBattery(null);
check('plugged in or no battery: nothing changes', !laptopSaving({ laptopMode: true }) && modelFor({ laptopMode: true, models: { bob: 'big-brain' } }, 'bob').model === 'big-brain');

// ---------- 97 Test a new card by itself ----------
check('a card\'s short name', cardKey({ name: 'RTX 5070 Ti', vramGB: 16 }) === 'RTX 5070 Ti|16' && cardKey(null) === '');
{ let saved = null; const io = (from) => ({ read: () => { if (from === null) throw new Error('none'); return JSON.stringify({ card: from }); }, write: (f, t) => { saved = JSON.parse(t).card; } });
  const first = cardChange({ dataDir: tmp }, { name: 'RTX 5070 Ti', vramGB: 16 }, io(null));
  check('the first look only remembers the card', !first.changed && saved === 'RTX 5070 Ti|16');
  saved = null;
  const same = cardChange({ dataDir: tmp }, { name: 'RTX 5070 Ti', vramGB: 16 }, io('RTX 5070 Ti|16'));
  check('the same card: nothing to do, nothing written', !same.changed && saved === null);
  const nu = cardChange({ dataDir: tmp }, { name: 'RTX 6080', vramGB: 24 }, io('RTX 5070 Ti|16'));
  check('a new card is seen and remembered', nu.changed && nu.from === 'RTX 5070 Ti|16' && saved === 'RTX 6080|24'); }
{ const r = placesToAuto({ a: { mode: 'hand', cpuMoe: 12 }, b: { mode: 'auto' } });
  check('placements by hand go back to Auto, keeping their number', r.changed === 1 && r.brainPlace.a.mode === 'auto' && r.brainPlace.a.cpuMoe === 12); }

// ---------- 95 Preload the next brain ----------
check('a hand-off\'s hat is read while it streams in', handoffHat('ask_specialist', '{"hat": "tinker", "task": "fix') === 'tinker' && handoffHat('ask_specialist', '{"ha') === '' && handoffHat('remember', '{"hat":"tinker"}') === '');
check('only with the brain plus 4 GB free', warmRoom(10e9, 10e9 + WARM_SPARE) && !warmRoom(10e9, 10e9 + WARM_SPARE - 1) && !warmRoom(0, 1e12));
{ const s = new EventEmitter(); let opened = 0, done = null;
  const first = warmFile('/x/brain.gguf', { open: () => { opened++; return s; }, done: (ok) => { done = ok; } });
  const again = warmFile('/x/brain.gguf', { open: () => { opened++; return s; } });
  s.emit('data', Buffer.alloc(1)); s.emit('end');
  check('the file is read once, not twice at the same time', first && !again && opened === 1 && done === true); }

// ---------- 99 Engine updates in plain words ----------
check('Brain Engine versions have their own lines', brainEngineNumber('brain-engine-v4') === 4 && /sealed/.test(plainEngineNotes('brainengine', { to: 'brain-engine-v4' })) && plainEngineNotes('brainengine', { to: 'brain-engine-v99' }) === '');
check('llama.cpp: picked out of programmer notes, two lines at most', plainEngineNotes('llamacpp', { body: 'CUDA: fix crash in mmq; vulkan: faster matmul' }).split('.').filter(Boolean).length <= 2 && /NVIDIA/.test(plainEngineNotes('llamacpp', { body: 'cuda tweak' })));
check('llama.cpp moving to the tested build says so', /tested with/.test(plainEngineNotes('llamacpp', { to: 'b12282' })));
check('the chat line only with the switch on', engineNoteLine({}, 'brainengine', 'brain-engine-v4') === '' && /What it changes for you: /.test(engineNoteLine({ engineNotes: true }, 'brainengine', 'brain-engine-v4')));
check('the keeper adds it to the finished-update message', /is up to date[^\n]*engineNoteLine\(this\.cfg, id, p\.to\)/.test(read('src/engine-keeper.js')));

// ---------- 96 Speed history ----------
{ const t0 = Date.parse('2026-11-01T12:00:00Z');
  let rows = addReply([], { model: 'big', tokPerSec: 100, engine: 'Brain Engine brain-engine-v3', now: t0 });
  rows = addReply(rows, { model: 'big', tokPerSec: 110, engine: 'Brain Engine brain-engine-v3', now: t0 + 1000 });
  check('one row per day, brain and engine', rows.length === 1 && rows[0].n === 2 && rows[0].sum === 210);
  check('a reply with no speed adds nothing', addReply(rows, { model: 'big', tokPerSec: 0 }) === null);
  rows = addReply(rows, { model: 'big', tokPerSec: 70, engine: 'Brain Engine brain-engine-v4', now: t0 + 864e5 });
  const s = speedSeries(rows);
  check('the series marks the engine change', s[0].points.length === 2 && s[0].changes[0].engine === 'Brain Engine brain-engine-v4');
  check('15% slower after an engine change is called out', s[0].slower && s[0].slower.before === 105 && s[0].slower.after === 70);
  const old = addReply(rows, { model: 'big', tokPerSec: 90, engine: 'x', now: t0 + (KEEP_DAYS + 2) * 864e5 });
  check(`only ${KEEP_DAYS} days are kept`, old.length === 1); }
{ let wrote = null; const cfg = { dataDir: tmp };
  check('nothing is written while off', logReply(cfg, { model: 'big', tokPerSec: 50 }, 'e', { write: () => { wrote = 1; } }) === false && wrote === null);
  cfg.speedLog = true;
  check('on: written to speed-log.json in Bob\'s data folder, no chat text', logReply(cfg, { model: 'big', tokPerSec: 50, chat: 999 }, 'e') === true && readSpeedLog(cfg).length === 1 && !JSON.stringify(readSpeedLog(cfg)).includes('999')); }

// ---------- The running side, with fakes ----------
{ const said = [], timers = [];
  const engine = { current: 'chat-brain', resolve: (m) => ({ gguf: m === 'coder' ? big : small }) };
  const brain = { engine, log: () => {}, turns: new Set(), queue: [] };
  const cfg = { dataDir: tmp, agentDir: tmp, engine: 'llamacpp', models: { bob: 'chat-brain', tinker: 'coder' } };
  const warmed = [];
  let batt = true, tested = 0;
  const run = startEngineExtras({ cfg, brain, say: (t) => said.push(t), setTimer: (fn, ms) => { timers.push({ fn, ms }); return { unref() {} }; }, clearTimer: () => {},
    battery: async () => batt, warm: (f) => { warmed.push(f); return true; }, freeBytes: () => 64e9,
    hardware: async () => ({ gpu: { name: 'RTX 6080', vramGB: 24 } }), test: async () => { tested++; return { first: { firstWord: 0.4, perSecond: 90 } }; } });
  engine.onToolCall('ask_specialist', '{"hat":"tinker"');
  check('next brain: nothing read ahead while off', warmed.length === 0);
  cfg.preloadNext = true;
  engine.onToolCall('ask_specialist', '{"hat":"tinker"');
  check('next brain: the coder\'s file is read ahead once its hat shows', warmed.length === 1 && warmed[0] === big);
  engine.onToolCall('ask_specialist', '{"hat":"bob"');
  check('next brain: not the brain already loaded', warmed.length === 1);
  const before = readSpeedLog(cfg).length;
  cfg.speedLog = false; engine.onStats({ model: 'chat-brain', tokPerSec: 40 });
  check('speed history: off writes nothing', readSpeedLog(cfg).length === before);
  cfg.speedLog = true; engine.onStats({ model: 'chat-brain', tokPerSec: 40 });
  check('speed history: on, the reply is counted with the engine\'s name', readSpeedLog(cfg).some((r) => r.model === 'chat-brain' && /llama\.cpp|Brain Engine/.test(r.engine)), JSON.stringify(readSpeedLog(cfg)));
  check('the engine label for Ollama', engineLabel({ engine: 'ollama' }) === 'Ollama');
  cfg.laptopMode = true; run.laptopChanged(); await wait(10);
  check('Laptop mode: the battery is looked at once a minute', batteryNow() === true && timers.some((t) => t.ms === 60e3));
  batt = false; await timers.find((t) => t.ms === 60e3).fn(); await wait(10);
  check('Laptop mode: plugging in is said in the chat', said.some((t) => /Plugged in again/.test(t)));
  cfg.laptopMode = false; run.laptopChanged(); await wait(10);
  check('Laptop mode off: the battery isn\'t counted any more', batteryNow() === null);
  fs.writeFileSync(path.join(tmp, 'card-seen.json'), JSON.stringify({ card: 'RTX 5070 Ti|16' }));
  check('new card test: nothing while off', (await run.cardCheck()) === null);
  cfg.newCardTest = true; cfg.brainPlace = { coder: { mode: 'hand', cpuMoe: 10 } };
  let savedPlace = null;
  const c = await run.cardCheck({ saveSettings: (cf, patch) => { savedPlace = patch.brainPlace; }, wait: 5 });
  await timers[timers.length - 1].fn(); await wait(10);
  check('new card test: seen, tested once Bob is free, placements back to Auto, said in the chat', c.changed && tested === 1 && savedPlace.coder.mode === 'auto' && said.some((t) => /new graphics card \(RTX 6080, was RTX 5070 Ti\)/.test(t)) && said.some((t) => /New card speed test/.test(t)), said.join(' | '));
  setOnBattery(null); }

// ---------- Settings, first-time list, Help, glossary, FAQ ----------
const cellar = publicText('cellar.js'), server = read('src/server.js');
for (const [k, label] of [['copyGuess', 'Prompt-lookup decoding'], ['preloadNext', 'Preload the next brain'], ['laptopMode', 'Laptop mode'], ['newCardTest', 'Auto-test a new GPU'], ['speedLog', 'Speed history'], ['engineNotes', 'Engine update notes']]) {
  check(`Settings has "${label}", always there, off unless turned on`, cellar.includes(`sswitch('${k}', settings.${k} === true, '${label}'`));
  check(`Help names "${label}"`, HELP.some((h) => h.html.includes(label)));
  check(`the first-time list offers "${label}"`, WANTS.some((w) => w.key === k && w.setting === label));
}
check('the server saves each switch and shows it', /for \(const k of EXTRA_SWITCHES\) if \(typeof b\[k\] === 'boolean'\)/.test(server) && /EXTRA_SWITCHES\.map\(\(k\) => \[k, cfg\[k\] === true\]\)/.test(server));
check('the speed history has its own address', server.includes("p === '/api/speed-log'"));
check('Help has a section for the extras, and for the memory type', HELP.some((h) => h.id === 'engine-extras') && HELP.some((h) => h.id === 'engine-extras' && /Chat memory type/.test(h.html)));
const gl = HELP.find((h) => h.id === 'glossary')?.html || '';
check('the glossary explains the new words', /<dt>Copy guessing/.test(gl) && /<dt>Laptop mode/.test(gl) && /<dt>Speed history/.test(gl) && /<dt>Chat memory type/.test(gl));
for (const id of ['faq-copy-guess', 'faq-laptop-mode', 'faq-mem-type', 'faq-new-card']) check(`FAQ ${id}`, HELP.some((h) => h.id === id && h.group === 'FAQ'));
check('Help says which platforms, and that the Android app isn\'t changed', /Android app/.test(HELP.find((h) => h.id === 'engine-extras')?.html || '') && /Windows, Mac/.test(HELP.find((h) => h.id === 'engine-extras')?.html || ''));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
