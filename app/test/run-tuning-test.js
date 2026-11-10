// Tests "Speed for this replicant matrix" (1.5.24): the three switches, this replicant matrix check tips and the speed test.
// Run: node test/run-tuning-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tuning, cpuPlan, paintFlags, pictureFitFailed, pictureFitReset, SAFE_PAINT, startFile, promptHash } from '../src/tuning.js';
import { tipsFrom, ratedSpeed, gatherFacts } from '../src/pc-check.js';
import { LlamaCpp } from '../src/llamacpp.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------- switches ----------
check(same(tuning({}), { readyWhileTyping: false, gamesFirst: false, pictureFit: false }), 'all three switches are off unless turned on');
check(tuning({ gamesFirst: 'yes' }).gamesFirst === false, 'only a real true turns a switch on');

// ---------- Let games go first ----------
const cpus = (model, n) => Array.from({ length: n }, () => ({ model }));
check(cpuPlan({}, { cpus: cpus('AMD Ryzen 7 9800X3D 8-Core Processor', 16) }) === null, 'games first off: no change to cores or priority');
const one = cpuPlan({ gamesFirst: true }, { cpus: cpus('AMD Ryzen 7 9800X3D 8-Core Processor', 16) });
check(one.threads === 6 && one.range === null && one.lowPriority, 'one-chip 8-core: 6 cores at lower priority');
const two = cpuPlan({ gamesFirst: true }, { cpus: cpus('AMD Ryzen 9 7950X3D 16-Core Processor', 32) });
check(two.threads === 8 && two.range === '16-31' && two.twoChips, 'two-chip Ryzen 9: the second chip only, leaving the cache chip to games');
check(cpuPlan({ gamesFirst: true, llamacpp: { threads: 4 } }, { cpus: cpus('AMD Ryzen 7 9800X3D', 16) }).threads === 4, 'threads set by hand still win');
check(cpuPlan({ gamesFirst: true }, { cpus: cpus('Intel(R) Core(TM) i5', 4) }).threads === 2, 'small processors keep at least 2 cores');

// ---------- Match picture settings ----------
const sd = (extra = {}) => ({ painter: { sdcpp: { ...extra } } });
check(same(paintFlags(sd(), 'image', {}, { gb: 16, files: 11 }).extra, SAFE_PAINT), 'switch off: small-card settings on every card');
check(same(paintFlags({ ...sd(), pictureFit: true }, 'image', {}, { gb: 16, files: 11 }).extra, ['--diffusion-fa']), '16 GB card with an 11 GB picture model: all on the card, no tiles');
check(same(paintFlags({ ...sd(), pictureFit: true }, 'image', {}, { gb: 16, files: 19 }).extra, ['--offload-to-cpu', '--diffusion-fa']), '16 GB card with a 19 GB model: still swapped in, but no tiles');
const small = paintFlags({ ...sd(), pictureFit: true }, 'image', {}, { gb: 6, files: 11 });
check(small.size === 768 && small.clipOnCpu === true && same(small.extra, SAFE_PAINT), '6 GB card: 768-pixel pictures, text reader on the processor');
check(same(paintFlags({ ...sd(), pictureFit: true }, 'video', {}, { gb: 16, files: 11 }).extra, SAFE_PAINT), 'clips keep the small-card settings');
check(same(paintFlags({ ...sd({ extraArgs: ['--diffusion-fa'] }) }, 'image', {}, { gb: 6, files: 1 }).extra, ['--diffusion-fa']), 'flags set by hand are kept as they are');
check(paintFlags({ ...sd(), pictureFit: true }, 'image', {}, { gb: 0, files: 11 }).fit === 'safe', 'unknown card: small-card settings');
pictureFitFailed();
check(paintFlags({ ...sd(), pictureFit: true }, 'image', {}, { gb: 16, files: 11 }).fit === 'safe', 'after a failure: back to the small-card settings');
pictureFitReset();

// ---------- Check this replicant matrix ----------
check(ratedSpeed('UD5-6000') === 6000 && ratedSpeed('CMK32GX5M2B6000C36') === 6000 && ratedSpeed('F5-6000J3038F16G') === 6000 && ratedSpeed('M425R1GB4BB0') === 0, 'rated memory speed is read from part numbers');
const today = new Date('2026-11-02');
const slow = tipsFrom({ memory: [{ speed: 4800, configured: 4800, part: 'UD5-6000' }, { speed: 4800, configured: 4800, part: 'UD5-6000' }] }, { today });
check(slow.tips.some((t) => t.id === 'memory-speed' && /4800.*6000/.test(t.title) && /MT\/s/.test(t.title) && /^This is a BIOS setting.*Bob can't change it/.test(t.steps[0])), 'memory below its rated speed: EXPO tip that says Bob can\'t change it');
const fast = tipsFrom({ memory: [{ speed: 4800, configured: 6000, part: 'UD5-6000' }] }, { today });
check(!fast.tips.length && fast.fine.some((f) => /6000/.test(f)), 'memory at its rated speed: listed as fine');
check(tipsFrom({ battery: [{ status: 1 }] }, { today }).tips.some((t) => t.id === 'battery'), 'laptop on battery: plug-in tip');
check(!tipsFrom({ battery: [{ status: 2 }] }, { today }).tips.length, 'laptop plugged in: no battery tip');
check(tipsFrom({ video: [{ name: 'NVIDIA GeForce RTX 3060 Laptop GPU', date: '2025-12-01' }] }, { today }).tips.some((t) => t.id === 'driver'), 'old NVIDIA driver: update tip');
check(!tipsFrom({ video: [{ name: 'NVIDIA GeForce RTX 5070 Ti', date: '2026-09-15' }] }, { today }).tips.length, 'recent driver: no tip');
check(tipsFrom({ disk: { media: 'HDD', bus: 'SATA' }, drive: 'D' }, { today }).tips.some((t) => t.id === 'disk'), 'models on a hard drive: move tip');
check(!tipsFrom({ disk: { media: 'SSD', bus: 'NVMe' }, drive: 'C' }, { today }).tips.length, 'models on an SSD: no tip');
const busy = tipsFrom({ nvidia: { totalGB: 16, usedGB: 9, apps: [{ name: 'python.exe', gb: 6 }] } }, { today });
check(busy.tips.some((t) => t.id === 'card-busy' && /python\.exe/.test(t.steps[0])), 'other apps holding graphics memory: named, with sizes');
check(busy.tips.some((t) => t.id === 'sysmem-fallback' && t.level === 'optional'), 'the NVIDIA fallback setting is offered as optional');
check(!tipsFrom({}, { today }).tips.length, 'nothing known: no tips');

// ---------- Get ready while you type (with a fake llama-server) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob tune '));
const models = path.join(tmp, 'models');
const add = (name, tag, hex) => {
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', name);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
  fs.writeFileSync(path.join(models, 'blobs', `sha256-${hex}`), 'GGUF');
  fs.writeFileSync(path.join(dir, tag), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${hex}` }] }));
};
add('qwen3', '4b', 'ccc333');
const lcCfg = (extra = {}) => ({ dataDir: path.join(tmp, 'data'), agentDir: tmp, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18095, fit: false }, ...extra });
fs.mkdirSync(path.join(tmp, 'data'), { recursive: true });
{
  const lc = new LlamaCpp(lcCfg());
  const a = lc.buildArgs('qwen3:4b', { cpu: true });
  check(!a.includes('--slot-save-path') && !a.includes('--cpu-range'), 'switches off: the engine starts as before');
  // 1.5.90: brains partly in RAM are read in at load, not paged in during the first reply.
  const ver = (v) => { fs.mkdirSync(path.join(tmp, 'llama.cpp'), { recursive: true }); fs.writeFileSync(path.join(tmp, 'llama.cpp', 'bob-llamacpp.json'), JSON.stringify({ version: v })); };
  const has = (args, ...xs) => xs.every((x) => args.includes(x));
  lc.cfg.llamacpp.fit = true; ver('b12032');
  check(has(lc.buildArgs('qwen3:4b', {}), '--fit', '--load-mode', 'none'), 'fit on: the brain is read in at load (--load-mode none)');
  // A brain bigger than the card's share plus RAM stays memory-mapped, so the rest is read from the drive (gpt-oss 120B on 16 GB + 32 GB).
  lc.totalRam = () => 32e9; lc.cfg.gpuVramGB = 16;
  check(has(lc.buildArgs('qwen3:4b', {}), '--fit', '--load-mode', 'none'), 'a brain that fits card and RAM is still read in at load');
  lc.totalRam = () => 6e9 + 1; lc.cfg.gpuVramGB = 0;
  check(lc.buildArgs('qwen3:4b', {}).includes('--fit') && !lc.buildArgs('qwen3:4b', {}).includes('--load-mode'), 'bigger than card and RAM: left memory-mapped (the rest from the drive)');
  check(!lc.biggerThanMemory(path.join(tmp, 'no-such.gguf')), 'a file that is not there is not too big');
  lc.totalRam = () => 64e9; delete lc.cfg.gpuVramGB;
  ver('b11500'); lc.cfg.llamacpp.fit = false; lc.cfg.llamacpp.nCpuMoe = { 'qwen3:4b': 8 };
  check(has(lc.buildArgs('qwen3:4b', {}), '--n-cpu-moe', '--no-mmap'), 'older build with experts in RAM: --no-mmap');
  delete lc.cfg.llamacpp.nCpuMoe;
  check(!lc.buildArgs('qwen3:4b', {}).some((x) => ['--load-mode', '--no-mmap'].includes(x)), 'all on the card: no change');
  check(!lc.buildArgs('qwen3:4b', { cpu: true }).some((x) => ['--load-mode', '--no-mmap'].includes(x)), 'on the processor: no change');
  lc.cfg.llamacpp.fit = true; ver('b12032'); lc.cfg.llamacpp.loadMode = 'mmap';
  check(!lc.buildArgs('qwen3:4b', {}).includes('--load-mode'), 'loadMode "mmap" keeps the old way');
  delete lc.cfg.llamacpp.loadMode; lc.cfg.llamacpp.args = ['-fa', 'on', '--mmap'];
  check(!lc.buildArgs('qwen3:4b', {}).includes('--load-mode'), 'a load mode set by hand wins');
  delete lc.cfg.llamacpp.args;
  // 1.5.91: no marker anywhere (bundled engine, an exe set by hand): no guessed flag, so b12032 still starts.
  fs.rmSync(path.join(tmp, 'llama.cpp'), { recursive: true, force: true }); lc._loadFlag = null;
  check(lc.buildArgs('qwen3:4b', {}).includes('--fit') && !lc.buildArgs('qwen3:4b', {}).some((x) => ['--load-mode', '--no-mmap'].includes(x)), 'no build marker: no load flag at all (b12032 refuses --no-mmap)');
  // A marker next to the exe counts (the bundled engine has its own).
  const exeDir = path.join(tmp, 'own-engine'); fs.mkdirSync(exeDir, { recursive: true }); fs.writeFileSync(path.join(exeDir, 'bob-llamacpp.json'), JSON.stringify({ version: 'b12032' }));
  const keepExe = lc.cfg.llamacpp.exe; lc.cfg.llamacpp.exe = path.join(exeDir, 'llama-server.exe'); lc._loadFlag = null;
  check(lc.loadFlag() === 'load-mode', 'the marker next to the exe is read');
  lc.cfg.llamacpp.exe = keepExe; lc._loadFlag = null; fs.rmSync(exeDir, { recursive: true, force: true });
  lc.cfg.llamacpp.fit = false;
  clearInterval(lc.idleTimer);
}
{
  const lc = new LlamaCpp(lcCfg({ readyWhileTyping: true, gamesFirst: true }));
  const cpuArgs = lc.buildArgs('qwen3:4b', { cpu: true, ctx: 8192 });
  check(cpuArgs.includes('--slot-save-path') && cpuArgs.includes('-t'), 'on the processor: saved readings and fewer cores');
  check(!lc.buildArgs('qwen3:4b', { cpu: false }).includes('--slot-save-path'), 'on the graphics card: no saved readings (reading ahead is fast enough)');
  const start = { messages: [{ role: 'system', content: 'You are Bob.' }], tools: [] };
  await lc.preload('qwen3:4b', undefined, { cpu: true, ctx: 8192 });
  check(await lc.prime('qwen3:4b', { cpu: true, ctx: 8192, ...start }) === 'saved', 'first wake on the processor: reads ahead and saves the reading');
  const saved = path.join(tmp, 'data', 'chat-start', startFile('qwen3:4b', 8192));
  check(fs.existsSync(saved) && fs.existsSync(saved.replace(/\.bin$/, '.json')), 'the reading is saved in Bob\'s data folder');
  await lc.stopServer();
  await lc.preload('qwen3:4b', undefined, { cpu: true, ctx: 8192 });
  check(lc.primedHash === promptHash(start.messages, start.tools), 'next load: the saved reading comes back');
  check(await lc.prime('qwen3:4b', { cpu: true, ctx: 8192, ...start }) === 'ready', 'and nothing has to be read again');
  check(await lc.prime('qwen3:4b', { cpu: true, ctx: 8192, messages: [{ role: 'system', content: 'Changed.' }], tools: [] }) === 'saved', 'changed instructions are read and saved again');
  await lc.stopServer();
  clearInterval(lc.idleTimer);
}

// ---------- Settings, speed test and PC check through the app ----------
const cfg = { ...JSON.parse(fs.readFileSync(path.join(here, '..', 'config.example.json'), 'utf8')), userName: 'Sam', engine: 'llamacpp', models: { bob: 'qwen3:4b' }, stt: { provider: 'ollama', model: 'qwen3:4b' } };
cfg.llamacpp = { ...cfg.llamacpp, exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18096 };
cfg.readRoots = []; cfg.readOnlyRoots = [];
fs.writeFileSync(path.join(tmp, 'config.json'), JSON.stringify(cfg));
const PORT = 7811;
const bob = spawn(process.execPath, [path.join(here, '..', 'src', 'server.js')], {
  env: { ...process.env, BOB_CONFIG: path.join(tmp, 'config.json'), BOB_AGENT_DIR: path.join(tmp, 'Bob home'), BOB_PORT: String(PORT) },
  stdio: ['ignore', 'pipe', 'inherit']
});
await new Promise((r) => bob.stdout.once('data', r));
const base = `http://127.0.0.1:${PORT}`;
const post = (p, b) => fetch(base + p, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(b) }).then(async (r) => ({ status: r.status, ...(await r.json()) }));
try {
  let s = await (await fetch(base + '/api/settings')).json();
  check(s.readyWhileTyping === false && s.gamesFirst === false && s.pictureFit === false, 'settings page: all three off at first');
  s = await post('/api/settings', { readyWhileTyping: true, pictureFit: 'yes' });
  check(s.readyWhileTyping === true && s.pictureFit === undefined, 'a switch turns on; a bad value is ignored');
  check((await (await fetch(base + '/api/settings')).json()).readyWhileTyping === true, 'the switch is kept');
  const before = await (await fetch(base + '/api/speed-test')).json();
  check(Array.isArray(before.history) && before.history.length === 0, 'speed test: no results yet');
  const t = await post('/api/speed-test', {});
  check(t.status === 200 && t.result?.first?.firstWord >= 0 && t.result.first.full >= t.result.first.firstWord && t.result.switches.readyWhileTyping === true, 'speed test: times the first word and the full answer, with the switches that were on');
  check(t.history.length === 1, 'speed test: the result is kept for comparing');
  const pc = await (await fetch(base + '/api/pc-check')).json();
  check(Array.isArray(pc.tips) && Array.isArray(pc.fine), 'Check this replicant matrix answers with tips and what looked fine');
} finally {
  bob.kill();
}
const html = fs.readFileSync(path.join(here, '..', 'public', 'cellar.js'), 'utf8');
check(/Get Bob ready while you type/.test(html) && /Let games go first/.test(html) && /Match picture settings to my graphics card/.test(html) && /Test Bob's speed/.test(html) && /Check this replicant matrix/.test(html) && /<th>Load<\/th>/.test(html) && /<th>Second reply<\/th>/.test(html), 'the settings page has the switches and both buttons');


// 1.5.27: saved chat starts are kept for the newest 2 brains only.
{
  const { tidyStarts, MAX_STARTS } = await import('../src/tuning.js');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-starts-'));
  const put = (n, age) => { for (const e of ['bin', 'json']) { const f = path.join(d, `${n}.${e}`); fs.writeFileSync(f, 'x'); const t = new Date(Date.now() - age * 1000); fs.utimesSync(f, t, t); } };
  put('a-8192', 30); put('b-8192', 20); put('c-8192', 10); put('c-4096', 40);
  tidyStarts(d, 'c', 'c-8192.bin');
  const left = fs.readdirSync(d).sort().join();
  check(MAX_STARTS === 2 && left === 'b-8192.bin,b-8192.json,c-8192.bin,c-8192.json', 'saved chat starts: one per brain, newest 2 brains only (' + left + ')');
  fs.rmSync(d, { recursive: true, force: true });
}

// ---- 1.5.133, by CitizenFog and Bob (#25): detect the cards Windows lists; nvidia-smi only when one is NVIDIA ----
{
  const fakeRun = (video, smi = '') => { const calls = []; return { calls, run: async (file) => { calls.push(file); if (/powershell/i.test(file)) return JSON.stringify({ video }); if (file === 'nvidia-smi') return smi || null; return null; } }; };
  const cfg = { agentDir: 'C:\\Bob home' };
  const amdOnly = fakeRun([{ name: 'AMD Radeon(TM) Graphics', date: '2026-09-01', vendor: 'Advanced Micro Devices, Inc.' }]);
  const fa = await gatherFacts(cfg, { platform: 'win32', run: amdOnly.run });
  const ta = tipsFrom(fa, { today });
  check(!amdOnly.calls.includes('nvidia-smi') && !fa.nvidia, 'AMD only (a Legion Go): nvidia-smi is never asked');
  check(ta.fine.includes('AMD graphics found: AMD Radeon Graphics.') && !ta.tips.some((t) => t.id === 'driver' || t.id === 'sysmem-fallback') && !ta.fine.some((f) => /NVIDIA/.test(f)), 'AMD only: "AMD graphics found" (without Windows\'s (TM) mark), and no NVIDIA tips');
  const nv = fakeRun([{ name: 'NVIDIA GeForce RTX 5070 Ti', date: '2026-10-01', vendor: 'NVIDIA' }], 'NVIDIA GeForce RTX 5070 Ti, 581.0, 1024, 16303');
  const fn = await gatherFacts(cfg, { platform: 'win32', run: nv.run });
  const tn = tipsFrom(fn, { today });
  check(nv.calls.includes('nvidia-smi') && fn.nvidia?.name === 'NVIDIA GeForce RTX 5070 Ti', 'NVIDIA: nvidia-smi is asked, as before');
  check(tn.fine.some((f) => /^NVIDIA driver is recent/.test(f)) && tn.tips.some((t) => t.id === 'sysmem-fallback') && !tn.fine.some((f) => /AMD graphics/.test(f)), 'NVIDIA: the NVIDIA lines and the Sysmem Fallback tip, nothing about AMD');
  const both = fakeRun([{ name: 'AMD Radeon 780M', date: '2026-08-01', vendor: 'Advanced Micro Devices, Inc.' }, { name: 'NVIDIA GeForce RTX 4060 Laptop GPU', date: '2025-01-01', vendor: 'NVIDIA' }], 'NVIDIA GeForce RTX 4060 Laptop GPU, 560.0, 200, 8188');
  const fb = await gatherFacts(cfg, { platform: 'win32', run: both.run });
  const tb = tipsFrom(fb, { today });
  check(both.calls.includes('nvidia-smi') && fb.nvidia && tb.fine.includes('AMD graphics found: AMD Radeon 780M.') && tb.tips.some((t) => t.id === 'driver') && tb.tips.some((t) => t.id === 'sysmem-fallback'), 'AMD laptop with an NVIDIA card: both seen, NVIDIA tips for the NVIDIA card');
  const intel = tipsFrom({ video: [{ name: 'Intel(R) Arc(TM) Graphics', vendor: 'Intel Corporation' }] }, { today });
  check(intel.fine.includes('Intel graphics found: Intel Arc Graphics.'), 'Intel only: "Intel graphics found: Intel Arc Graphics."');
  const linux = fakeRun(null, '');
  await gatherFacts(cfg, { platform: 'linux', run: linux.run });
  check(linux.calls.join() === 'nvidia-smi', 'Linux or Mac (no Windows list): nvidia-smi is still tried, nothing else runs');
}

console.log(failures ? `\n${failures} failed` : '\nAll tuning tests passed');
process.exit(failures ? 1 : 0);
