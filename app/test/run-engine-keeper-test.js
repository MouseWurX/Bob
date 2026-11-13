// 1.5.184 Keep engines up to date (src/engine-keeper.js): on unless switched off, checks at start and about daily,
// updates Brain Engine (new or rebuilt build) and Bob's own llama.cpp (only up to the tested build), only while no
// brain is loaded on that engine and nothing is busy, and says so in chat. Fake folders, a fake GitHub and fake
// downloads only; nothing reads the real computer.
// Run: node test/run-engine-keeper-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { EngineKeeper, keeperOn, keeperCandidates, dueUpdate, buildNumber, DAY_MS, FIRST_CHECK_MS } from '../src/engine-keeper.js';
import { engineFor, ENGINES, engineWhole, NOT_WHOLE, pickAsset } from '../src/engines.js';
import { collect, writeZip, unzip } from '../src/zip.js';
import { mergeSettings } from '../src/config.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let failures = 0, passed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passed++; else failures++; };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-keeper-'));
const exeOf = (id) => engineFor(ENGINES.find((e) => e.id === id)).exe;
const put = (A, dir, id, version) => { const d = path.join(A, dir); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, exeOf(id)), 'x'); if (version) fs.writeFileSync(path.join(d, `bob-${id}.json`), JSON.stringify({ version })); };
let n = 0;
const home = () => path.join(tmp, `A${++n}`);
const beOk = !engineFor(ENGINES.find((e) => e.id === 'brainengine')).unavailable; // no Brain Engine build on a Mac or ARM board

// The switch: on unless switched off, and it survives a save.
{
  check(keeperOn({}) && keeperOn({ engineUpdates: {} }) && !keeperOn({ engineUpdates: { auto: false } }), 'Keep engines up to date is on unless switched off');
  check(mergeSettings({}, { engineUpdates: { auto: false } }).engineUpdates?.auto === false && mergeSettings({}, { engineUpdates: { auto: 'x' } }).engineUpdates?.auto === true, 'the setting saves, and anything but false counts as on');
}

// Which engines: only Bob's own copies with a marker, only Brain Engine and llama.cpp.
{
  const A = home();
  check(keeperCandidates({ agentDir: A }).length === 0, 'nothing installed: nothing to keep up to date');
  put(A, 'llama.cpp', 'llamacpp', null);
  check(keeperCandidates({ agentDir: A }).length === 0, 'a copy with no marker (put there by hand) is left alone');
  put(A, 'llama.cpp', 'llamacpp', 'b100'); put(A, 'sd.cpp', 'sdcpp', 'master-1');
  if (beOk) put(A, 'brain-engine', 'brainengine', 'brain-engine-b100');
  const ids = keeperCandidates({ agentDir: A }).map((e) => e.id).sort();
  check(JSON.stringify(ids) === JSON.stringify(beOk ? ['brainengine', 'llamacpp'] : ['llamacpp']), 'only Brain Engine and llama.cpp, never the picture, hearing, voice or helper engines');
}

// What counts as due.
{
  check(buildNumber('b12032') === 12032 && Number.isNaN(buildNumber('brain-engine-b1')), 'llama.cpp build numbers compare');
  const A = home(); put(A, 'llama.cpp', 'llamacpp', 'b100');
  const cfg = { agentDir: A }, ll = engineFor(ENGINES.find((e) => e.id === 'llamacpp'));
  let asked = 0; const gh = async () => { asked++; return { newer: true, latest: 'b999' }; };
  const up = await dueUpdate(cfg, ll, { check: gh, tested: 'b200' });
  check(up?.to === 'b200' && asked === 0, 'llama.cpp older than the tested build: due, to the tested build, with no GitHub question');
  check(!(await dueUpdate(cfg, ll, { check: gh, tested: 'b100' })), 'llama.cpp on the tested build: not due');
  check(!(await dueUpdate(cfg, ll, { check: gh, tested: 'b50' })), 'llama.cpp newer than the tested build (picked by hand): never taken back');
  const be = { id: 'brainengine', dir: 'brain-engine' };
  put(A, 'brain-engine', 'brainengine', 'brain-engine-b100');
  check((await dueUpdate(cfg, be, { check: async () => ({ newer: true, rebuilt: true, installed: 'brain-engine-b100', latest: 'brain-engine-b100' }) }))?.rebuilt === true, 'a rebuilt Brain Engine (same name, new checksum) is due');
  check(!(await dueUpdate(cfg, be, { check: async () => ({ newer: false, latest: 'brain-engine-b100' }) })), 'Brain Engine up to date: not due');
}

// The keeper: checks when due, waits while a brain is loaded on the engine, queues the download, says so.
function rig({ cfg, newer = true, loaded = [], busy = '', pin = null, latest = 'brain-engine-b100', print = 'sha256:new' } = {}) {
  const said = [], queued = [], dls = new Map(), timers = [];
  let t = 1_000_000_000_000, checks = 0;
  const r = {
    said, queued, dls, timers, get checks() { return checks; },
    set loaded(v) { loaded = v; }, set busy(v) { busy = v; }, advance(ms) { t += ms; },
    keeper: new EngineKeeper(cfg, {
      now: () => t, setTimer: (fn, ms) => { timers.push(ms); return { fn, ms }; }, clearTimer: () => {},
      check: async (id) => { checks++; return { id, newer, rebuilt: true, installed: 'brain-engine-b100', latest, print }; }, pin,
      tested: 'b100', loaded: async () => loaded, busy: () => busy,
      queue: async (id) => { queued.push(id); dls.set(id, { state: 'queued' }); },
      download: (id) => dls.get(id) || null, say: (s) => said.push(s)
    })
  };
  return r;
}
if (beOk) {
  const A = home(); put(A, 'brain-engine', 'brainengine', 'brain-engine-b100');
  const exe = path.join(A, 'brain-engine', exeOf('brainengine'));
  const cfg = { agentDir: A, engine: 'llamacpp', llamacpp: { exe } };
  const r = rig({ cfg, loaded: [{ name: 'riker' }] });
  r.keeper.start();
  check(r.timers[0] === FIRST_CHECK_MS, 'the first check is a couple of minutes after start');
  { const r2 = rig({ cfg: { agentDir: A, engine: 'ollama' } }); r2.keeper.state.lastCheck = Date.now() * 2; const t0 = []; r2.keeper.d.setTimer = (fn, ms) => { t0.push(fn); return {}; }; r2.keeper.start(); await t0[0](); await new Promise((res) => setTimeout(res, 20)); check(r2.checks === 1, 'the look after start always asks, even if Bob checked earlier today'); }
  await r.keeper.tick();
  check(r.checks === 1 && r.queued.length === 0 && /no brain is loaded/.test(r.said[0] || ''), 'a brain loaded on Brain Engine: it waits, and says why once');
  await r.keeper.tick();
  check(r.said.length === 1 && r.checks === 1, 'waiting again says nothing more, and doesn\'t ask GitHub again inside a day');
  r.loaded = []; r.busy = 'the Lab is busy';
  await r.keeper.tick();
  check(r.queued.length === 0, 'the Lab busy: still waits');
  r.busy = '';
  await r.keeper.tick();
  check(r.queued[0] === 'brainengine' && /Updating Brain Engine/.test(r.said.at(-1)) && /Go back/.test(r.said.at(-1)), 'free: the update goes on the Downloads list, and Bob says so (with Go back)');
  r.dls.set('brainengine', { state: 'done' });
  await r.keeper.tick();
  check(/up to date/.test(r.said.at(-1)) && r.keeper.view().waiting.length === 0, 'done: Bob says it\'s up to date');
  r.advance(DAY_MS);
  await r.keeper.tick();
  check(r.checks === 2, 'about a day later it checks again');
  const saved = JSON.parse(fs.readFileSync(path.join(A, 'engine-updates.json'), 'utf8'));
  check(saved.lastCheck > 0, 'the last check is remembered across restarts');
}
if (beOk) {
  // Ollama runs the brains: a loaded brain there doesn't hold Brain Engine.
  const A = home(); put(A, 'brain-engine', 'brainengine', 'brain-engine-b100');
  const r = rig({ cfg: { agentDir: A, engine: 'ollama' }, loaded: [{ name: 'gemma' }] });
  await r.keeper.tick();
  check(r.queued[0] === 'brainengine', 'brains on Ollama: Brain Engine updates even with a brain loaded there');
  r.dls.set('brainengine', { state: 'failed', error: 'GitHub didn\'t answer' });
  await r.keeper.tick();
  check(/didn't work/.test(r.said.at(-1)) && /kept the one you have/.test(r.said.at(-1)), 'a failed update says so and keeps the old build');
}
{
  // Switched off: nothing is asked or downloaded.
  const A = home(); put(A, 'llama.cpp', 'llamacpp', 'b1');
  const r = rig({ cfg: { agentDir: A, engineUpdates: { auto: false } } });
  await r.keeper.tick({ force: true });
  check(r.checks === 0 && r.queued.length === 0 && r.said.length === 0, 'switched off: nothing is checked or downloaded');
  r.keeper.cfg.engineUpdates.auto = true;
  await r.keeper.tick({ force: true });
  check(r.queued[0] === 'llamacpp' && r.checks === 0, 'switched on: an old llama.cpp moves up to the tested build');
}

// The window, Help, glossary and FAQ.
{
  const read = (f) => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  const cellar = publicText('cellar.js');
  check(/sswitch\('engineAuto', settings\.engineUpdates\?\.auto !== false, 'Keep engines up to date'/.test(cellar), 'Settings, Engines has the switch, on unless switched off');
  check(/engineUpdates: engineKeeper\.view\(\)/.test(read('src/server.js')) && /new EngineKeeper\(/.test(read('src/server.js')), 'the server starts the keeper and shows its state');
  const help = (id) => HELP.find((h) => h.id === id)?.html || '';
  check(/Keep engines up to date/.test(help('settings-engines')) && /no brain is loaded/.test(help('settings-engines')), 'Help: Settings, Engines explains the switch');
  check(Boolean(help('faq-engine-auto')) && /Android/.test(help('faq-engine-auto')) && /Mac/.test(help('faq-engine-auto')), 'FAQ: Does Bob update his engines by himself? (and where it doesn\'t apply)');
  check(/<dt>Keep engines up to date<\/dt>/.test(help('glossary')), 'the glossary has it');
  check(/Engine updates/.test(help('privacy')) && /Engine updates/.test(read('docs/legal/PRIVACY.md')), 'privacy pages say what goes out');
}

// ---- 1.5.185 (PC test of 1.5.184): an overlay-only Brain Engine zip must never replace a whole engine ----
{ const be = { ...engineFor(ENGINES.find((x) => x.id === 'brainengine')), os: 'win', exe: 'llama-server.exe' };
  const put = (dir, names) => { fs.mkdirSync(dir, { recursive: true }); for (const n of names) fs.writeFileSync(path.join(dir, n), 'x'); };
  const whole = ['llama-server.exe', 'llama.dll', 'ggml.dll', 'ggml-base.dll', 'ggml-cpu-haswell.dll', 'ggml-cuda.dll', 'ggml-rpc.dll'];
  const oldDir = path.join(tmp, 'brain-engine'); put(oldDir, whole);
  // the republished zip: Bob's own files only, as a real zip, unpacked the way an update unpacks it
  const src = path.join(tmp, 'own-only'); put(src, ['llama-server.exe', 'llama-cli.exe', 'bob-brainengine-notes.txt']);
  const zipFile = path.join(tmp, 'brain-engine-win-x64.zip'); writeZip(zipFile, collect([src], src));
  const stage = path.join(tmp, 'brain-engine.new'); unzip(zipFile, stage);
  const why = engineWhole(stage, be, oldDir);
  check(why === "its ggml libraries aren't in it", 'a fake zip with no ggml libraries is refused before the swap: ' + why);
  check(/^The new Brain Engine download isn't a whole engine \(its ggml libraries aren't in it\), so I kept the one you have\. Nothing changed\.$/.test(NOT_WHOLE('Brain Engine', why)), 'and the line says the old engine stays');
  const part = path.join(tmp, 'part'); put(part, ['llama-server.exe', 'ggml.dll', 'ggml-cpu-haswell.dll']);
  check(/^(llama\.dll, ggml-base\.dll|ggml-base\.dll, llama\.dll) aren't in it$/.test(engineWhole(part, be, oldDir)), 'a build missing the core libraries the old one had is refused too: ' + engineWhole(part, be, oldDir));
  const full = path.join(tmp, 'full'); put(full, whole);
  check(engineWhole(full, be, oldDir) === '', 'a whole build goes in');
  const cpu = path.join(tmp, 'cpu'); put(cpu, whole.filter((n) => !/cuda/.test(n)));
  check(engineWhole(cpu, be, oldDir) === '', 'a whole build without the graphics-card library (a CPU build) still goes in');
  check(engineWhole(path.join(tmp, 'nothing'), be, oldDir) === "llama-server.exe isn't in it", 'no program, no swap');
  check(engineWhole(src, { id: 'sdcpp', exe: 'sd-cli.exe', os: 'win' }, oldDir) === '', 'other engines are not judged by llama.cpp\'s libraries');
  // 1.5.186: the update paths now hold an incomplete build aside with missingParts (test/run-engine-libs-test.js).
}

// ---- 1.5.185: the CUDA runtime zip is never picked as the engine (both orders of a real release's asset list) ----
{ const ll = ENGINES.find((x) => x.id === 'llamacpp'); const win = engineFor(ll, 'win', 'x64');
  const names = ['cudart-llama-bin-win-cuda-12.4-x64.zip', 'cudart-llama-bin-win-cuda-13.1-x64.zip', 'llama-b7100-bin-win-cpu-arm64.zip', 'llama-b7100-bin-win-cpu-x64.zip', 'llama-b7100-bin-win-cuda-12.4-x64.zip', 'llama-b7100-bin-win-cuda-13.1-x64.zip', 'llama-b7100-bin-win-hip-radeon-x64.zip', 'llama-b7100-bin-win-sycl-x64.zip', 'llama-b7100-bin-win-vulkan-x64.zip'];
  const list = names.map((name) => ({ name }));
  for (const [label, l] of [['as listed', list], ['reversed', [...list].reverse()]]) {
    const n = pickAsset(l, win, true)?.name, c = pickAsset(l, win, false)?.name;
    check(n === 'llama-b7100-bin-win-cuda-13.1-x64.zip' && c === 'llama-b7100-bin-win-vulkan-x64.zip', `${label}: with NVIDIA the newest CUDA engine (${n}), never a cudart- runtime zip; without, Vulkan (${c})`);
  }
  const only = [{ name: 'cudart-llama-bin-win-cuda-12.4-x64.zip' }, { name: 'llama-b7100-bin-win-cpu-x64.zip' }];
  check(pickAsset(only, win, true)?.name === 'llama-b7100-bin-win-cpu-x64.zip', 'a release with only the runtime for CUDA falls back to a real engine build');
}

// 1.5.196 (the owner: Brain Engine updates with Bob, not on its own). The engine's own marker against the build this Bob names.
{
  const { brainEnginePin, brainEngineStale, BRAIN_ENGINE_PIN } = await import('../src/engines.js');
  check(BRAIN_ENGINE_PIN?.tag?.startsWith('brain-engine-') && /^sha256:[0-9a-f]{64}$/.test(BRAIN_ENGINE_PIN['win-x64']) && /^sha256:[0-9a-f]{64}$/.test(BRAIN_ENGINE_PIN['linux-x64']), 'this Bob names his Brain Engine build: the release and each file\'s checksum');
  const pins = { tag: 'brain-engine-b200', 'win-x64': 'sha256:w', 'linux-x64': 'sha256:l' };
  check(brainEnginePin(pins, 'win32', 'x64').print === 'sha256:w' && brainEnginePin(pins, 'linux', 'x64').print === 'sha256:l' && brainEnginePin(pins, 'darwin', 'arm64') === null && brainEnginePin(pins, 'linux', 'arm64') === null, 'the pin for this replicant matrix; none on a Mac or an ARM board');
  const pin = { tag: 'brain-engine-b200', print: 'sha256:w' };
  check(brainEngineStale({ version: 'brain-engine-b100', print: 'sha256:w' }, pin) && brainEngineStale({ version: 'brain-engine-b200', print: 'sha256:old' }, pin) && !brainEngineStale({ version: 'brain-engine-b200', print: 'sha256:w' }, pin), 'stale when the release or the file differs (a rebuild under the same name counts)');
  check(!brainEngineStale(null, pin) && !brainEngineStale({ version: 'x' }, null), 'no marker (not here, or put there by hand) or no pin: left alone');
}
if (beOk) {
  const A = home(); put(A, 'brain-engine', 'brainengine', 'brain-engine-b100');
  const pin = { tag: 'brain-engine-b200', print: 'sha256:new' };
  const r = rig({ cfg: { agentDir: A, engine: 'llamacpp', engineUpdates: { auto: false } }, pin, latest: 'brain-engine-b200', print: 'sha256:new' });
  r.keeper.start();
  check(r.timers[1] === 5000, 'Brain Engine is looked at right after start, before the first brain loads');
  await r.keeper.withBob();
  check(r.queued[0] === 'brainengine' && /the build that goes with this Bob/.test(r.said.at(-1) || ''), 'Bob is new, the engine is old: the matching build comes along, even with Keep engines up to date off', r.said.join(' | '));
  const mk = path.join(A, 'brain-engine', 'bob-brainengine.json');
  fs.writeFileSync(mk, JSON.stringify({ version: 'brain-engine-b100', print: 'sha256:x' }));
  const r2 = rig({ cfg: { agentDir: A, engine: 'llamacpp' }, pin, latest: 'brain-engine-b100', print: 'sha256:x' });
  await r2.keeper.withBob();
  check(r2.queued.length === 0 && r2.checks === 1, 'GitHub has nothing different from what\'s here: nothing fetched again and again');
  await r2.keeper.tick({ force: true });
  check(r2.checks === 1, 'and Brain Engine no longer follows the newest build on its own');
  fs.writeFileSync(mk, JSON.stringify({ version: 'brain-engine-b200', print: 'sha256:new' }));
  const r3 = rig({ cfg: { agentDir: A, engine: 'llamacpp' }, pin });
  await r3.keeper.withBob();
  check(r3.checks === 0 && r3.queued.length === 0, 'already the build that goes with this Bob: no question, no download');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
