// 1.5.74 "engines first": first start gets the core engines and one small starter brain before anything else,
// and checks that each engine really starts. Run: node test/run-engines-first-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { starterBrain, readyPlan, CORE_ENGINES } from '../public/equip.js';
import { checkEngine, seedBundledEngine, bundledEngine, engineStatus } from '../src/engines.js';
import { exeName } from '../src/platform.js';
import { publicText } from './source-text.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const cat = JSON.parse(fs.readFileSync(path.join(here, '..', 'catalog.json'), 'utf8'));

// The starter brain for each device.
check(starterBrain({ vramGB: 16, ramGB: 32 }) === 'gemma4-e4b', 'PC with a 16 GB card: Gemma 4 E4B');
check(starterBrain({ vramGB: 8, ramGB: 16 }) === 'gemma4-e4b', 'PC with an 8 GB card: E4B');
check(starterBrain({ vramGB: 6, ramGB: 32 }) === 'gemma4-e2b', 'laptop with a 6 GB card: E2B');
check(starterBrain({ ramGB: 32 }) === 'gemma4-e2b', 'no graphics card: E2B');
check(starterBrain({ vramGB: 16, ramGB: 32, integrated: true }) === 'gemma4-e4b', 'built-in graphics with 32 GB (Legion Go): E4B');
check(starterBrain({ vramGB: 6, ramGB: 16, unified: true }) === 'gemma4-e4b' && starterBrain({ vramGB: 5, ramGB: 8, unified: true }) === 'gemma4-e2b', 'Mac: E4B from 16 GB, E2B on 8 GB');
for (const id of ['gemma4-e4b', 'gemma4-e2b']) check(cat.models.find((m) => m.id === id)?.files?.some((f) => f.role === 'gguf'), `${id} downloads without Ollama`);

// What step 1 queues: missing core engines first (none that this computer has no build of), then the brain.
const models = cat.models.map((m) => ({ ...m, status: { state: 'missing' } }));
const engines = [{ id: 'llamacpp', installed: false }, { id: 'sdcpp', installed: true }, { id: 'whispercpp', installed: false, available: false }, { id: 'piper', installed: false }];
const p = readyPlan({ vramGB: 16, ramGB: 32 }, models, engines);
check(p.ids.join() === 'engine:llamacpp,gemma4-e4b', `queues only what's missing, engines first (${p.ids.join()})`);
check(p.engines.map((e) => e.id).join() === 'llamacpp,sdcpp', 'shows the core engines this computer can have (not whisper.cpp on a Mac, not Piper)');
const done = readyPlan({ vramGB: 16 }, models.map((m) => (m.id === 'gemma4-e4b' ? { ...m, status: { state: 'installed' } } : m)), engines.map((e) => ({ ...e, installed: true })));
check(done.ids.length === 0, 'nothing to queue once everything is here');
check(CORE_ENGINES.join() === 'llamacpp,sdcpp,whispercpp', 'core engines: llama.cpp, stable-diffusion.cpp, whisper.cpp');

// Does each engine start? (run is replaced: no real program is started.)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-engcheck-'));
const cfg = { agentDir: tmp };
check((await checkEngine(cfg, 'llamacpp')).why === 'not downloaded yet', 'not downloaded: says so');
fs.mkdirSync(path.join(tmp, 'llama.cpp'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'llama.cpp', exeName('llama-server')), 'x');
let asked = null;
const ok = await checkEngine(cfg, 'llamacpp', { run: (exe, args, o, cb) => { asked = args; cb(null, 'usage: llama-server [options]', ''); } });
check(ok.ok && asked.join() === '--help', 'starts with --help and prints: works');
const dll = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { code: -1073741515 }), '', '') });
check(!dll.ok && /0xC0000135/.test(dll.why) && /runtime file/.test(dll.why), `a missing runtime file is named (${dll.why})`);
const gone = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { code: 'ENOENT' }), '', '') });
check(!gone.ok && /couldn't be started/.test(gone.why), 'a program that can\'t start says so');
const quiet = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(null, '', '') });
check(!quiet.ok, 'silence is not "works"');
const slow = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { killed: true }), '', '') });
check(!slow.ok && /20 seconds/.test(slow.why), 'no answer in time');
const help1 = await checkEngine(cfg, 'llamacpp', { run: (exe, a, o, cb) => cb(Object.assign(new Error('x'), { code: 1 }), '', 'usage: ...') });
check(help1.ok, 'an old build that exits 1 after printing its help still works');
fs.rmSync(tmp, { recursive: true, force: true });

// 1.5.76: the basic llama.cpp inside Bob's download.
const t2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-bundle-'));
const bundle = path.join(t2, 'app', 'engines', 'llama.cpp');
fs.mkdirSync(bundle, { recursive: true });
fs.writeFileSync(path.join(bundle, exeName('llama-server')), 'x');
fs.writeFileSync(path.join(bundle, 'ggml-vulkan.dll'), 'x');
fs.writeFileSync(path.join(bundle, 'bob-llamacpp.json'), JSON.stringify({ version: 'b9999', asset: 'llama-b9999-bin-win-vulkan-x64.zip', bundled: true }));
const c2 = { agentDir: path.join(t2, 'home') };
check(seedBundledEngine(c2, bundle) && fs.existsSync(path.join(c2.agentDir, 'llama.cpp', 'ggml-vulkan.dll')), 'first start: the bundled llama.cpp is set up in Bob\'s engine folder');
check(bundledEngine(c2) && engineStatus(c2).find((e) => e.id === 'llamacpp').bundled === true, 'and is known as the bundled (basic) build');
fs.writeFileSync(path.join(c2.agentDir, 'llama.cpp', 'mine.txt'), 'x');
check(!seedBundledEngine(c2, bundle) && fs.existsSync(path.join(c2.agentDir, 'llama.cpp', 'mine.txt')), 'an engine already there is never overwritten');
check(!seedBundledEngine({ agentDir: path.join(t2, 'other') }, path.join(t2, 'nothing')), 'no bundle (installed from source): nothing happens');
fs.rmSync(t2, { recursive: true, force: true });
const bEng = [{ id: 'llamacpp', installed: true, bundled: true }, { id: 'sdcpp', installed: true }, { id: 'whispercpp', installed: true }];
const done2 = models.map((m) => (m.id === 'gemma4-e4b' ? { ...m, status: { state: 'installed' } } : m));
check(readyPlan({ vramGB: 16, nvidia: true }, done2, bEng).ids.join() === 'engine:llamacpp', 'NVIDIA card: Get Bob ready swaps in the faster CUDA build');
check(readyPlan({ vramGB: 16, ramGB: 32, integrated: true }, done2, bEng).ids.length === 0, 'built-in graphics or no NVIDIA card: the bundled build is the right one');
const engSrc = fs.readFileSync(path.join(here, '..', 'src', 'engines.js'), 'utf8');
check(/const replacing = \(id === 'llamacpp' && Boolean\(bundledEngine\(cfg\)\)\)/.test(engSrc) && /try \{ swapIn\(folder, stage\); \}/.test(engSrc) && /fs\.renameSync\(stage, folder\)/.test(engSrc), // 1.5.17x: swapIn keeps the old build for Go back
   'replacing the bundled build: the new one downloads to a side folder, then takes its place in one step (1.5.116; no two builds side by side, and never no engine)');
const mk = fs.readFileSync(path.join(here, '..', 'installer', 'make-release.ps1'), 'utf8');
const mac = fs.readFileSync(path.join(here, '..', 'installer', 'make-release-mac.sh'), 'utf8');
const lin = fs.readFileSync(path.join(here, '..', '..', '.github', 'workflows', 'linux.yml'), 'utf8');
check(/bundle-engine\.mjs/.test(mk) && /bundle-engine\.mjs/.test(mac) && /bundle-engine\.mjs/.test(lin), 'Windows zip, Mac app and Linux AppImage all carry it');
const pk = JSON.parse(fs.readFileSync(path.join(here, '..', 'package.json'), 'utf8'));
check(pk.build.asarUnpack.includes('engines/**') && pk.build.files.includes('engines/**'), 'AppImage: the engine sits outside the asar so it can run');

// Welcome wiring.
const cellar = publicText('cellar.js');
// 1.5.91: one list (Get me ready) instead of step 1 and step 2.
check(/<h3>Get me ready<\/h3>/.test(cellar) && /data-getready/.test(cellar) && /\/api\/engines\/check/.test(cellar), 'Welcome has the Get me ready list with its checks');
check(!/readyTried/.test(cellar) && /Get Bob ready \(about \$\{gb\(order\.sizeGB\)\}\)/.test(cellar), 'one click on Get Bob ready, with its size; never started by itself');
check(/data-readypause/.test(cellar) && /data-readystop/.test(cellar) && /data-readyresume/.test(cellar), 'Pause, Stop and Resume sit on the list');
check(/Not enough free disk: free up \$\{short\} GB, or untick something, then press Try again\./.test(cellar) && /needGB \+ 2/.test(cellar), 'won\'t start without its size plus 2 GB free');
check(/Free disk: \$\{hw\.freeGB/.test(cellar.slice(cellar.indexOf('Get me ready</h3>'))), 'size and free disk are shown before anything moves');
const server = fs.readFileSync(path.join(here, '..', 'src', 'server.js'), 'utf8');
check(/'\/api\/engines\/check'/.test(server), 'the server answers /api/engines/check');

{
  const cel = publicText('cellar.js');
  check(/came with me \(basic version\)/.test(cel) && !/basic build/.test(cel), 'Welcome row: "llama.cpp: came with me (basic version)", no jargon');
  check(/r\.swap \? 'came with me \(basic version\); this gets the faster NVIDIA version'/.test(cel) && /const swap = e\.bundled && hw\.nvidia/.test(fs.readFileSync(new URL('../public/equip.js', import.meta.url), 'utf8')), 'the NVIDIA swap line shows only when the swap is planned (NVIDIA cards)');
}

check(/^b\d+$/.test(JSON.parse(fs.readFileSync(new URL('../package.json', import.meta.url), 'utf8')).bob?.bundledLlamaTag || ''), 'the bundled llama.cpp is pinned to one release (bob.bundledLlamaTag), so every release carries the same tested build');

console.log(`\n${failures ? failures + ' failed' : 'all passed'}`);
process.exit(failures ? 1 : 0);
