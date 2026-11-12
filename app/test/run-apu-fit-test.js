// Nov 12: brains on built-in graphics load reliably (src/apu-fit.js, wired into llamacpp.js, brain.js, share-card.js).
// Run: node test/run-apu-fit-test.js. Uses the fake llama-server; never reads the real card, RAM or folders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { apuNeed, apuPlace, nextStep, lendRoom, computeBytes, apuHoldbackGB, apuKeepBytes, APU_DRIVER_BYTES, LEND_MIN_MB } from '../src/apu-fit.js';
import { LlamaCpp, spreadArgs, SPREAD_FIT_TARGET_MIB } from '../src/llamacpp.js';
import { apuRoom } from '../src/brain.js';
import { engineFailKind } from '../src/retry.js';
import { CardLender, CardBorrower, LEND_NO } from '../src/share-card.js';
import { readJson } from '../src/engine-care.js';

process.setMaxListeners(100);
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
let failures = 0, passes = 0;
const check = (ok, name, more = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !more ? '' : `  [${more}]`}`); if (ok) passes++; else failures++; };
const GB = 1024 ** 3;

// ---------- sizing ----------
// The Go's case: Qwen3 4B (~2.5 GB file), 32K chat memory at 8-bit (~2.4 GB), 6.6 GB free, graphics budget 7 GB.
const go = apuNeed({ fileBytes: 2.5 * GB, kvBytes: 2.4 * GB });
check(go.card === 2.5 * GB + 2.4 * GB + computeBytes(512) + APU_DRIVER_BYTES && go.cpu < go.card, 'the need counts the file, the chat memory, the working buffers and the driver; the processor needs less (file read as needed)', JSON.stringify(go));
check(computeBytes(2048) === 4 * computeBytes(512) && computeBytes(256) === computeBytes(512), 'working buffers grow with bigger steps, never under the 512 figure');
check(apuNeed({ fileBytes: 0 }) === null, 'no file: no figure');
let p = apuPlace({ need: go, layers: 36, freeBytes: 6.6 * GB, keepBytes: 2 * GB, budgetBytes: 7 * GB });
check(p.place === 'split' && p.layers > 9 && p.layers < 36, 'the Go at 32K: part of the layers on the graphics, the rest on the processor (not all on the graphics, which ran out)', JSON.stringify(p));
p = apuPlace({ need: go, layers: 36, freeBytes: 12 * GB, keepBytes: 2 * GB, budgetBytes: 7 * GB });
check(p.place === 'card' && p.layers === -1, 'plenty free: wholly on the graphics');
p = apuPlace({ need: go, layers: 36, freeBytes: 3.6 * GB, keepBytes: 2 * GB, budgetBytes: 7 * GB });
check(p.place === 'cpu' && p.layers === 0, 'only a few layers would fit: the processor alone');
p = apuPlace({ need: go, layers: 36, freeBytes: 12 * GB, keepBytes: 2 * GB, budgetBytes: 7 * GB, share: 0.5 });
check(p.place === 'split', 'after running out of memory once: half the graphics room, so part of it moves to the processor', JSON.stringify(p));
p = apuPlace({ need: go, layers: 36, freeBytes: 12 * GB, keepBytes: 2 * GB, budgetBytes: 7 * GB, share: 0 });
check(p.place === 'cpu', '...and after that, the processor alone');
check(apuPlace({ need: go, layers: 0, freeBytes: 6.6 * GB, keepBytes: 2 * GB, budgetBytes: 7 * GB }).place === 'cpu', 'layers unknown and it won\'t all fit: the processor alone');
check(JSON.stringify(nextStep({ share: 1, ctx: 32768 })) === '{"share":0.5}' && JSON.stringify(nextStep({ share: 0.5, ctx: 32768 })) === '{"share":0}' && JSON.stringify(nextStep({ share: 0, ctx: 32768 })) === '{"ctx":16384}' && nextStep({ share: 0, ctx: 8192 }) === null, 'steps down: half the graphics, the processor alone, then half the chat memory, never under 8K');
check(JSON.stringify(nextStep({ share: 1, ctx: 32768, cpu: true })) === '{"ctx":16384}', 'a brain already on the processor goes straight to a shorter chat memory');
check(apuHoldbackGB({}) === 2 && apuKeepBytes({ apuHoldbackGB: 0 }) === 1 * GB && apuKeepBytes({ apuHoldbackGB: 3 }) === 3 * GB, 'Memory kept for Windows starts at 2 GB, and at least 1 GB is always kept');

// ---------- the room check uses the engine's figure ----------
const brainWith = (need, extra = {}) => ({ cfg: { sharedGraphics: true, reservedGraphicsGB: 0.5, ...extra }, gate: { brainBytes: () => 99 * GB }, engine: { loaded: async () => [], apuNeed: (m, c) => need(c) } });
const kvAt = (c) => (2.4 * GB * c) / 32768;
let r = await apuRoom(brainWith((c) => apuNeed({ fileBytes: 2.5 * GB, kvBytes: kvAt(c) })), 'qwen3-4b', 32768, { freeMem: 6.6 * GB });
check(r.ok && r.ctx === 32768 && !r.shortened, 'the Go, 6.6 GB free, 2 GB kept: Qwen3 4B keeps its 32K chat memory (it fits split or on the processor)', JSON.stringify(r));
r = await apuRoom(brainWith((c) => apuNeed({ fileBytes: 2.5 * GB, kvBytes: kvAt(c) })), 'qwen3-4b', 32768, { freeMem: 4.5 * GB });
check(r.ok && r.shortened && r.ctx < 32768, 'tighter: the chat memory is shortened', JSON.stringify(r));
r = await apuRoom(brainWith((c) => apuNeed({ fileBytes: 20 * GB, kvBytes: kvAt(c) })), 'big', 32768, { freeMem: 6.6 * GB });
check(!r.ok && typeof r.line === 'string', 'a brain that fits no way is refused with the plain line', JSON.stringify(r));

// ---------- retries ----------
check(engineFailKind(new Error('llama-server: Invalid input batch.')) === 'state' && engineFailKind(new Error('Compute error.')) === 'state', '"Invalid input batch" and "Compute error": the engine is started fresh');
check(engineFailKind(new Error('decode() failed: vk::Device::allocateMemory: ErrorOutOfDeviceMemory')) === 'memory', 'a Vulkan out-of-memory is an out-of-memory failure');
const brainSrc = read('src/brain.js');
check(/kind === 'memory' && !opts\.beside\) this\.engine\.apuStepDown/.test(brainSrc) && /memoryFailure\(this\.engine\.lastWords\?\.\(\)/.test(brainSrc) && /kind !== 'state'\) throw e/.test(brainSrc), 'a reply that ran out of memory steps the brain down and loads it again; the engine\'s last words count');
check(/this\.engine\.noReuse\.add\(model\)/.test(brainSrc) && /messages: fitContext\(opts\.messages, real/.test(brainSrc), 'out of step: fresh engine without reusing its reading; a shorter chat memory gets the chat fitted again');

// ---------- the engine, with the fake llama-server ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-apu-'));
const models = path.join(tmp, 'models');
const blob = (name, tag, hex) => {
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', name);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
  fs.writeFileSync(path.join(models, 'blobs', `sha256-${hex}`), 'GGUF');
  fs.writeFileSync(path.join(dir, tag), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${hex}` }] }));
};
blob('alpha', 'latest', 'a1');
let n = 0;
const all = [];
const make = (cfgOver = {}, free = 16 * GB) => {
  const dataDir = path.join(tmp, `data-${++n}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { dataDir, agentDir: tmp, sharedGraphics: true, gpuVramGB: 7, reservedGraphicsGB: 0.5, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 19400 + n * 20 }, ...cfgOver };
  const e = new LlamaCpp(cfg);
  e.logs = []; e.log = (k, t) => e.logs.push(t);
  e.cardReaders = { card: async () => null }; e.freeRam = () => free;
  e.restartDelayMs = 50;
  clearInterval(e.idleTimer);
  all.push(e);
  return e;
};
const argsOf = (e) => fs.readFileSync(path.join(e.cfg.dataDir, 'llama-server-args.txt'), 'utf8');
try {
  {
    const e = make();
    await e.preload('alpha', undefined, { ctx: 32768 });
    check(/ -ngl 999/.test(argsOf(e)) && !/--fit /.test(argsOf(e)) && e.logs.some((t) => /built-in graphics, wholly on the graphics/.test(t)), 'plenty free: the brain goes wholly on the built-in graphics, and the logbook says why', argsOf(e));
    await e.stopServer();
  }
  {
    const e = make({}, 3.5 * GB);
    await e.preload('alpha', undefined, { ctx: 32768 });
    check(/ -ngl 0/.test(argsOf(e)) && e.logs.some((t) => /on the processor alone/.test(t)), 'little free: the processor alone, at the chat memory asked for', argsOf(e));
    check(e.currentCtx === 32768, '...keeping the 32K chat memory');
    await e.stopServer();
  }
  {
    const e = make();
    process.env.MOCK_VK_OOM_NGL = '0';
    await e.preload('alpha', undefined, { ctx: 32768 });
    const saved = readJson(path.join(e.cfg.dataDir, 'engine-care.json'), {});
    check(await e.isLoaded('alpha', { ctx: 32768 }) && / -ngl 0/.test(argsOf(e)) && e.currentCtx === 32768, 'a Vulkan out-of-memory while loading: loaded again with less on the graphics, chat memory kept', argsOf(e));
    check(saved.apuFit?.alpha?.share < 1 && e.logs.some((t) => /ran out of memory on built-in graphics .*from now on/.test(t)), 'what worked is remembered for this brain and written in the logbook', JSON.stringify(saved.apuFit));
    await e.stopServer();
    const e2 = new LlamaCpp(e.cfg); e2.logs = []; e2.log = (k, t) => e2.logs.push(t); e2.freeRam = () => 16 * GB; e2.cardReaders = { card: async () => null }; clearInterval(e2.idleTimer); all.push(e2);
    check(e2.careData.apuFit.alpha.share === saved.apuFit.alpha.share, '...and still known after Bob restarts');
    delete process.env.MOCK_VK_OOM_NGL;
  }
  {
    const e = make();
    const s1 = e.apuStepDown('alpha', { ctx: 32768, why: 'test' });
    const s2 = e.apuStepDown('alpha', { ctx: 32768, why: 'test' });
    const s3 = e.apuStepDown('alpha', { ctx: 32768, why: 'test' });
    check(s1.share === 0.5 && s2.share === 0 && s3.ctx === 16384 && e.realCtx('alpha', 32768) === 16384, 'running out during replies: half, processor alone, then a 16K chat memory the chat is fitted to');
    check(e.takeNotes().some((t) => /16K chat memory/.test(t)), '...and the chat is told once when the chat memory gets shorter');
    check(make({ sharedGraphics: false }).apuStepDown('alpha', { ctx: 32768 }) === null, 'a real graphics card: none of this');
  }
  {
    const e = make({ llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 19990, gpuLayers: 20 } }, 3 * GB);
    const args = e.buildArgs('alpha', { ctx: 32768 });
    e.apuFit('alpha', args, 32768);
    check(args.join(' ').includes('-ngl 20') && !/ -ngl 0/.test(args.join(' ')), 'layers set by hand are never changed');
  }
  {
    const e = make();
    e.noReuse.add('alpha');
    check(!e.buildArgs('alpha', { ctx: 8192 }).includes('--cache-reuse'), 'after "Invalid input batch" the brain loads without --cache-reuse');
  }
} finally {
  for (const e of all) { try { await e.stopServer(); } catch {} clearInterval(e.idleTimer); }
}

// ---------- lending ----------
check(lendRoom({ sharedGraphics: false }, { freeBytes: 1 }) === null, 'a real card reports its memory truly: nothing added');
const lr = lendRoom({ sharedGraphics: true, gpuVramGB: 7, reservedGraphicsGB: 0.5 }, { freeBytes: 6 * GB });
check(lr.roomMB > 2000 && lr.roomMB < 4000 && lr.marginMB === 7 * 1024 - lr.roomMB, 'built-in graphics lend what the RAM really has, and tell the asker how much to leave free', JSON.stringify(lr));
check(spreadArgs(['--fit', 'on'], [4000, 0]).join(' ') === `--fit-target 4000,${SPREAD_FIT_TARGET_MIB},${SPREAD_FIT_TARGET_MIB} -ub 512` && spreadArgs(['--fit', 'on']).join(' ') === `--fit-target ${SPREAD_FIT_TARGET_MIB} -ub 512`, 'the asking engine leaves that much free on each lent card (lent cards first), the usual room elsewhere');
{
  const cfg = { sharedGraphics: true, gpuVramGB: 7, reservedGraphicsGB: 0.5, share: { lendCard: true }, remote: { enabled: true, passcode: 'abcdefgh' } };
  const logs = [];
  const lender = new CardLender(cfg, { tool: () => ({ found: true, path: 'x' }), ips: () => ['100.64.0.2'], freeMem: () => 2 * GB, log: (k, t) => logs.push(t) });
  const res = await lender.open({ localAddr: '100.64.0.2', remoteAddr: '100.64.0.3' });
  check(res.ok === false && res.why === 'no room' && /said no, only about/.test(logs.join(' ')) && /too full/.test(LEND_NO['no room']), 'a handheld with too little free says no instead of failing the asker\'s load');
  check(LEND_MIN_MB >= 1024, 'the least worth lending is at least 1 GB');
}
{
  const b = new CardBorrower({}, {});
  b.using = [{ bob: { name: 'go' }, marginMB: 4000 }, { bob: { name: 'pc' }, marginMB: 0 }];
  check(JSON.stringify(b.fitTargets()) === '[4000,0]', 'the borrower passes each lent card\'s room on, in the order the engine gets them');
  b.using = [{ bob: { name: 'pc' } }];
  check(b.fitTargets() === null, '...and nothing when no card said');
}
const llSrc = read('src/llamacpp.js');
check(/spreadArgs\(args, this\.spread\?\.fitTargets\?\.\(\) \|\| null\)/.test(llSrc), 'a spread load uses the lent cards\' own room');
const help = read('public/help-content.js');
check(/id: 'faq-apu-memory'/.test(help) && /<dt>Graphics share<\/dt>/.test(help), 'Help: an FAQ and a glossary entry');

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
