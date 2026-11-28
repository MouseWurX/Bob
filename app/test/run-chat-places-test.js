// Nov 24: Per-chat engine cache, on by default (src/chat-places.js, switchPlace and friends in src/llamacpp.js). The file
// key, the safe save (tmp- name, renamed when whole), the drive guard, the tidy, the side-request rule (a title or a
// summary in the engine's one slot is never saved under a chat's name), the save after a reply and before a stop,
// a refused file, and GUPPI's size for the engine's RAM cache. Fakes only: no engine, no real drive or RAM.
// The real engine (same tokens after a restart, a switch and the RAM cache) is engine/tests/prompt-cache.py.
// Run: node test/run-chat-places-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chatPlacesOn, placesDir, placeFile, tmpFile, placeKey, ownEnv, diskRoom, ramCacheMiB, containerFreeBytes, tidyPlaces, placesUsed, PLACES_KEEP, PLACES_MAX_BYTES, RAM_CACHE_MAX_MIB } from '../src/chat-places.js';
import { harnessView } from '../src/harness.js';
import { safeStartPlan } from '../src/crash-catch.js';
import { LlamaCpp } from '../src/llamacpp.js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const GB = 1024 ** 3, MiB = 1048576;
const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-places-'));

// ---------- on by default, and off stays off ----------
check('on when never set', chatPlacesOn({}) === true && harnessView({}).chatPlaces === true);
check('off stays off', chatPlacesOn({ chatPlaces: false }) === false && harnessView({ chatPlaces: false }).chatPlaces === false);
check('safe start leaves it as it is unless it was switched on by hand (a file the engine refuses is read again, never a crash)', safeStartPlan({}).count === 0 && safeStartPlan({ chatPlaces: true }).patch.chatPlaces === false);
check('8 chats and 16 GB', PLACES_KEEP === 8 && PLACES_MAX_BYTES === 16e9);

// ---------- the key ----------
{
  const stat = (f) => ({ size: f.includes('big') ? 2e10 : 1e9, mtimeMs: 1000 });
  const base = ['-m', '/m/big.gguf', '-c', '65536', '-ctk', 'q8_0', '-ctv', 'q8_0', '-fa', 'on', '-np', '1'];
  const k = (args, env = {}, more = {}) => placeKey({ engine: '46-12359', args, env, stat, ...more });
  const k0 = k(base);
  check('a short name-safe key', /^[0-9a-f]{10}$/.test(k0));
  check('the same engine run gives the same key', k0 === k([...base]));
  check('threads, port, save folder and RAM cache size don\'t count', k0 === k([...base, '-t', '8', '--port', '8081', '--slot-save-path', '/x', '--cache-ram', '2048', '--metrics']));
  check('where the brain sits and the reading step don\'t count (GUPPI moves those)', k0 === k([...base, '-ngl', '99', '--fit', 'on', '--fit-target', '1024', '-b', '2048', '-ub', '2048', '--n-cpu-moe', '12', '-ot', 'exps=CPU', '--no-mmap', '--moe-cache-mib', '4096']));
  check('another chat memory type counts', k0 !== k(base.map((a) => (a === 'q8_0' ? 'f16' : a))));
  check('another context counts', k0 !== k(base.map((a) => (a === '65536' ? '32768' : a))));
  check('a drafter counts', k0 !== k([...base, '-md', '/m/draft.gguf']));
  check('another engine build counts', k0 !== k(base, {}, { engine: '47-12359' }));
  check('the brain file downloaded again (new size or time) counts', k0 !== placeKey({ engine: '46-12359', args: base, stat: (f) => ({ size: 2e10, mtimeMs: 2000 }) }));
  check('a Turbo switch counts', k0 !== k(base, { LLAMA_MOE_STANDIN: '1' }) && k0 !== k(base, { LLAMA_KV_TIERS: 'q8_0:4096' }));
  check('an unknown engine switch counts', k0 !== k(base, { LLAMA_SOMETHING_NEW: '1' }));
  check('placement switches don\'t count', k0 === k(base, { LLAMA_MOE_CACHE_FILL_STEP: '2048', LLAMA_MOE_DOORBELL: '1', LLAMA_MOE_RAM_FLOOR_MIB: '512', CUDA_VISIBLE_DEVICES: '0' }));
  check('only the switches Bob adds are read', JSON.stringify(ownEnv({ PATH: '/bin', LLAMA_X: '1', LLAMA_Y: 'same' }, { LLAMA_Y: 'same' })) === '{"LLAMA_X":"1"}');
  const name = placeFile('chat-123', 'Riker Q4', 32768, k0);
  check('the file name carries the key and no chat id', name.endsWith(`-${k0}.bin`) && !name.includes('chat-123') && /^[\w.-]+$/.test(name), name);
  check('a save goes to a tmp- name first', tmpFile(name) === `tmp-${name}`);
}

// ---------- the drive guard ----------
{
  const drive = (totalGB, freeGB) => () => ({ blocks: totalGB * 1e9 / 4096, bsize: 4096, bavail: freeGB * 1e9 / 4096 });
  check('a big free drive saves', diskRoom('/x', 3e9, { statfs: drive(2000, 600) }).ok === true);
  check('5% of a 400 GB drive (20 GB) stays free', diskRoom('/x', 3e9, { statfs: drive(400, 22) }).ok === false && diskRoom('/x', 3e9, { statfs: drive(400, 24) }).ok === true);
  check('at least 8 GB stays free on a small drive', diskRoom('/x', 1e9, { statfs: drive(64, 8.5) }).ok === false && diskRoom('/x', 1e9, { statfs: drive(64, 9.5) }).ok === true);
  check('no more than 32 GB is held back on a huge drive', diskRoom('/x', 1e9, { statfs: drive(8000, 34) }).ok === true);
  check('a drive that can\'t be asked doesn\'t stop the save', diskRoom('/x', 1e9, { statfs: () => { throw new Error('no'); } }).ok === true);
}

// ---------- GUPPI's RAM cache size ----------
{
  check('half of what is left, after the brain and the floor', ramCacheMiB({ freeBytes: 20 * GB, brainRamBytes: 4 * GB, keepBytes: 512 * MiB }) === Math.floor((16 * GB - 512 * MiB) / 2 / MiB));
  check('never more than llama.cpp\'s own 8 GB', ramCacheMiB({ freeBytes: 64 * GB }) === RAM_CACHE_MAX_MIB);
  check('nothing when the brain and the floor take it all', ramCacheMiB({ freeBytes: 6 * GB, brainRamBytes: 6 * GB, keepBytes: 512 * MiB }) === 0);
  const e = Object.create(LlamaCpp.prototype);
  e.cfg = { sharedGraphics: false, gpuVramGB: 16 }; e.role = 'main'; e.freeRam = () => 24 * GB; e.tuneEnv = {};
  const f = path.join(tmpRoot, 'brain.gguf'); fs.writeFileSync(f, Buffer.alloc(16)); // sizes are faked below
  const sized = (bytes, cpu = false, over = {}) => { Object.assign(e, over); const real = fs.statSync; fs.statSync = (p, ...r) => (p === f ? { size: bytes, mtimeMs: 1 } : real(p, ...r)); try { return e.ramCacheSize(f, cpu); } finally { fs.statSync = real; } };
  const big = sized(36 * GB);
  check('a brain bigger than the card: only its RAM part counts', big === ramCacheMiB({ freeBytes: 24 * GB, brainRamBytes: 20 * GB, keepBytes: 512 * MiB }), String(big));
  check('a card of unknown size: the whole brain counts', sized(20 * GB, false, { cfg: { sharedGraphics: false } }) === ramCacheMiB({ freeBytes: 24 * GB, brainRamBytes: 20 * GB, keepBytes: 512 * MiB }));
  check('on the processor the whole brain counts', sized(20 * GB, true) === ramCacheMiB({ freeBytes: 24 * GB, brainRamBytes: 20 * GB, keepBytes: 512 * MiB }));
  check('a floor set by hand is the one kept', sized(20 * GB, true, { tuneEnv: { LLAMA_MOE_RAM_FLOOR_MIB: '4096' } }) === ramCacheMiB({ freeBytes: 24 * GB, brainRamBytes: 20 * GB, keepBytes: 4096 * MiB }));
  const shared = sized(8 * GB, false, { cfg: { sharedGraphics: true, gpuVramGB: 8 }, tuneEnv: {}, freeRam: () => 12 * GB });
  check('built-in graphics: the whole brain counts and GUPPI keeps his bigger amount free', shared < ramCacheMiB({ freeBytes: 12 * GB, brainRamBytes: 8 * GB, keepBytes: 512 * MiB }), String(shared));
  // Nov 27 (35B rental try 6): with the expert copy cache every expert stays in RAM, so the whole brain counts.
  { const real = fs.statSync; fs.statSync = (p, ...r) => (p === f ? { size: 22 * GB, mtimeMs: 1 } : real(p, ...r));
    try { Object.assign(e, { cfg: { sharedGraphics: false, gpuVramGB: 16 }, tuneEnv: {}, freeRam: () => 26 * GB });
      const withCache = e.ramCacheSize(f, false, ['--moe-cache-mib', '4096']), without = e.ramCacheSize(f, false, []);
      check('with the copy cache the whole brain counts as RAM (32 GB PC, 22 GB brain: a small cache, not 8 GB)', withCache === ramCacheMiB({ freeBytes: 26 * GB, brainRamBytes: 22 * GB, keepBytes: 512 * MiB }) && withCache < 2048 && without === RAM_CACHE_MAX_MIB, `${withCache} / ${without}`); }
    finally { fs.statSync = real; } }
  const fake = (files) => (p) => { if (p in files) return files[p]; throw new Error('ENOENT'); };
  check('a container\'s own limit counts (cgroup v2: limit minus used)', containerFreeBytes(fake({ '/sys/fs/cgroup/memory.max': '31000000000\n', '/sys/fs/cgroup/memory.current': '1000000000\n' }), 'linux') === 30e9);
  check('...and cgroup v1', containerFreeBytes(fake({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': '8000000000', '/sys/fs/cgroup/memory/memory.usage_in_bytes': '3000000000' }), 'linux') === 5e9);
  check('no limit ("max", v1\'s huge number, no files) or not Linux: no cap', containerFreeBytes(fake({ '/sys/fs/cgroup/memory.max': 'max' }), 'linux') === Infinity && containerFreeBytes(fake({ '/sys/fs/cgroup/memory/memory.limit_in_bytes': '9223372036854771712' }), 'linux') === Infinity && containerFreeBytes(fake({}), 'linux') === Infinity && containerFreeBytes(fake({ '/sys/fs/cgroup/memory.max': '1' }), 'win32') === Infinity);
  check('the engine start sizes from the smaller of the two', /Math\.min\(os\.freemem\(\), containerFreeBytes\(\)\)/.test(read('src/llamacpp.js')));
  const ll = read('src/llamacpp.js');
  check('the engine gets the size (engines that know --cache-ram)', /args\.push\('--cache-ram', String\(this\.ramCacheSize\(gguf, cpu, args\)\)\)/.test(ll) && /buildNo\(\) >= 7000/.test(ll));
}

// ---------- the tidy ----------
{
  const dir = path.join(tmpRoot, 'tidy');
  fs.mkdirSync(dir, { recursive: true });
  for (let i = 0; i < 10; i++) { const p = path.join(dir, `place-${i}.bin`); fs.writeFileSync(p, Buffer.alloc(10)); fs.utimesSync(p, new Date(1e12 + i * 1e6), new Date(1e12 + i * 1e6)); }
  fs.writeFileSync(path.join(dir, 'tmp-place-old.bin'), 'half');
  fs.writeFileSync(path.join(dir, 'conductor-8080.bin'), 'GUPPI');
  tidyPlaces(dir, { keepName: 'place-0.bin' });
  const left = fs.readdirSync(dir);
  check('the newest 8 stay, and the one in use', left.filter((f) => f.startsWith('place-')).length === 8 && left.includes('place-0.bin') && left.includes('place-9.bin') && !left.includes('place-1.bin'), left.join());
  check('a half-written tmp- file goes', !left.includes('tmp-place-old.bin'));
  check('GUPPI\'s own file is never touched', left.includes('conductor-8080.bin'));
  check('the count is only whole chat files', placesUsed({ dataDir: path.join(tmpRoot, 'nothere') }).count === 0);
}

// ---------- switching, saving and the side requests, on a fake engine ----------
function fakeEngine() {
  const dataDir = path.join(tmpRoot, `run-${Math.random().toString(36).slice(2)}`);
  const e = Object.create(LlamaCpp.prototype);
  e.cfg = { dataDir, llamacpp: { ctx: 32768 } }; e.role = 'main'; e.current = 'big'; e.currentCtx = 32768; e.loadedOk = true;
  e.child = { exitCode: null }; e.slotDir = placesDir(e.cfg); e.placeKeyNow = 'k1'; e.active = 0; e.logs = []; e.log = (k, t) => e.logs.push(t);
  e.hasVision = async () => false; e.inflight = new Set(); e.now = () => Date.now();
  fs.mkdirSync(e.slotDir, { recursive: true });
  e.calls = [];
  e.engineHolds = null; // what the fake engine's slot holds
  e.slotAction = async (action, name) => {
    e.calls.push(`${action} ${name}`);
    const file = path.join(e.slotDir, name);
    if (action === 'save') fs.writeFileSync(file, `state of ${e.engineHolds}`);
    else { const t = fs.readFileSync(file, 'utf8'); if (!t.startsWith('state of ')) throw new Error('slot restore: 400'); e.engineHolds = t.slice(9); }
  };
  e.chatOnce = async (opts) => { e.engineHolds = opts.chatId || 'side'; return { ok: true }; };
  return e;
}
{
  const e = fakeEngine();
  const file = (id) => path.join(e.slotDir, placeFile(id, 'big', 32768, 'k1'));
  await e.chat({ model: 'big', chatId: 'A', messages: [] });
  check('the first chat: nothing to save or load', e.calls.length === 0 && e.placeChat === 'A' && e.placeDirty === true);
  await e.chat({ model: 'big', chatId: 'B', messages: [] });
  check('switching saves A under a tmp- name, then renames it whole', e.calls[0] === `save ${tmpFile(path.basename(file('A')))}` && fs.existsSync(file('A')) && !fs.existsSync(path.join(e.slotDir, tmpFile(path.basename(file('A'))))));
  check('and A\'s file holds A', fs.readFileSync(file('A'), 'utf8') === 'state of A');
  e.calls.length = 0;
  await e.chat({ model: 'big', messages: [] }); // a title or a summary: no chat id
  check('a side request takes the slot and is marked', e.engineHolds === 'side' && e.placeOther === true);
  await e.chat({ model: 'big', chatId: 'A', messages: [] });
  check('switching after a side request never saves the side request as B', !fs.existsSync(file('B')) && !e.calls.some((c) => c.startsWith('save')), e.calls.join());
  check('and A comes back from its file', e.calls.includes(`restore ${path.basename(file('A'))}`) && e.placeOther === false);
  // a file cut short (made by an older engine or a crash): refused, gone, the chat read again
  fs.writeFileSync(file('B'), 'garbage');
  e.calls.length = 0;
  e.placeDirty = false; // nothing new in A since it was loaded
  await e.chat({ model: 'big', chatId: 'B', messages: [] });
  check('an unchanged chat isn\'t saved again on a switch', !e.calls.some((c) => c.startsWith('save')), e.calls.join());
  check('a file the engine refuses goes, and the chat is read again', !fs.existsSync(file('B')) && e.logs.some((l) => /didn't load/.test(l)) && e.placeChat === 'B');
  // another engine run (new key) never loads A's old file
  e.placeKeyNow = 'k2'; e.placeChat = null; e.calls.length = 0;
  await e.chat({ model: 'big', chatId: 'A', messages: [] });
  check('a file from another engine key is never loaded', !e.calls.some((c) => c.startsWith('restore')), e.calls.join());
  // busy: another reply is running
  e.active = 1; e.calls.length = 0;
  check('no switch while another reply runs', (await e.switchPlace('C', 'big')) === 'busy' && e.calls.length === 0);
  e.active = 0;
  // another chat's request while a reply runs: it shares the slot, so the running chat is never saved from it
  e.placeChat = 'A'; e.placeOther = false; e.placeDirty = true; e.active = 1; e.calls.length = 0;
  await e.chat({ model: 'big', chatId: 'C', messages: [] });
  check('a chat that came in while another reply ran marks the slot, and A stays the chat in place', e.placeOther === true && e.placeChat === 'A' && e.calls.length === 0, e.calls.join());
  e.active = 0;
  await e.placeBeforeStop();
  check('so stopping then saves nothing under A', e.calls.length === 0, e.calls.join());
  // the drive is low
  const real = fs.statfsSync; fs.statfsSync = () => ({ blocks: 1e6, bsize: 4096, bavail: 10 }); // a nearly full 4 GB drive
  try { e.placeDirty = true; e.placeOther = false; check('no save when the drive is low', (await e.savePlace('A', 'big')) === false && e.logs.some((l) => /drive is low/.test(l))); } finally { fs.statfsSync = real; }
  // pictures and the second brain beside a job: never
  e.hasVision = async () => true; e.placeChat = null;
  check('not for brains that see pictures', (await e.switchPlace('D', 'big')) === 'none');
  e.hasVision = async () => false; e.role = 'beside';
  check('not for the second brain beside a job', (await e.switchPlace('D', 'big')) === 'none');
}

// ---------- the save after a reply and before a stop ----------
{
  const e = fakeEngine();
  const file = (id) => path.join(e.slotDir, placeFile(id, 'big', 32768, 'k1'));
  const timers = [];
  const realSet = globalThis.setTimeout, realClear = globalThis.clearTimeout;
  globalThis.setTimeout = (fn, ms) => { const t = { fn, ms, unref() {} }; timers.push(t); return t; };
  globalThis.clearTimeout = (t) => { if (t) t.cleared = true; };
  try {
    await e.chat({ model: 'big', chatId: 'A', messages: [] });
    const t = timers.at(-1);
    check('a reply sets the save for 20 s later', t && t.ms === 20000);
    t.fn(); await new Promise((r) => realSet(r, 10));
    check('20 s later, with nothing running, the chat is on disk', fs.existsSync(file('A')) && e.placeDirty === false);
    e.calls.length = 0;
    await e.chat({ model: 'big', chatId: 'A', messages: [] });
    await e.chat({ model: 'big', messages: [] }); // a title right after
    timers.filter((x) => !x.cleared).forEach((x) => x.fn()); await new Promise((r) => realSet(r, 10));
    check('a side request in between: the timer saves nothing', !e.calls.some((c) => c.startsWith('save')), e.calls.join());
    e.engineHolds = 'A'; e.placeOther = false; e.placeDirty = true; e.calls.length = 0;
    await e.placeBeforeStop();
    check('before the engine stops, the chat it holds is saved', e.calls.some((c) => c.startsWith('save')) && fs.readFileSync(file('A'), 'utf8') === 'state of A');
    e.calls.length = 0; e.placeDirty = true; e.loadedOk = false;
    await e.placeBeforeStop();
    check('an engine that never finished loading is stopped without a save', e.calls.length === 0);
  } finally { globalThis.setTimeout = realSet; globalThis.clearTimeout = realClear; }
  const ll = read('src/llamacpp.js');
  check('stopServer saves first', /async stopServer\(\) \{\n    await this\.placeBeforeStop\(\);/.test(ll));
  check('warming up marks the slot as not a chat', /if \(this\.role !== BESIDE\) this\.placeOther = true; \/\/ Nov 24: the instructions alone/.test(ll));
  check('each engine run gets its key before it starts', /this\.placeKeyNow = placeKey\(\{ exe, engine: `\$\{this\.beNo\(\)\}-\$\{this\.buildNo\(\)\}`, args, env: ownEnv\(env\) \}\)/.test(ll));
}

// ---------- the words for people ----------
{
  const help = read('public/help-content.js'), ui = read('public/harness.js');
  check('Help says it is on by default', /Per-chat engine cache<\/strong> \(Settings, How Bob works, 💬 Chat extras; on unless you turn it off\)/.test(help));
  check('Settings line says 8 chats and 16 GB', /Up to 8 chats and 16 GB/.test(ui));
  check('the FAQ and the glossary are there', /faq-slow-switch/.test(help) && /<dt>Chat place<\/dt>/.test(help));
  check('the engine test is listed beside the patch', /0121-prompt-cache-ram-floor\.patch/.test(read('engine/README.md')) && /tests\/prompt-cache\.py/.test(read('engine/README.md')));
}

fs.rmSync(tmpRoot, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
