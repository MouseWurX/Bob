// Nov 27: "GUPPI fits his working memory to the card" (src/step-fit.js, wired into llamacpp.js), off unless switched on.
// The laptop's GUPPI probe found Inkling 2 Mini wanting 7.4 GB of working memory on a 6 GB card at step 512 and 32K.
// Run: node test/run-step-fit-test.js. Uses the fake llama-server; never reads the real card, RAM or folders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cardUse, fitDeficitMiB, shortest, stepFitPlan, fitPlanEarly, growCap, withStep, ubOf, stepFitOn, stepFitLine, STEP_FIT_MIN_UB, STEP_FIT_MIN_CTX } from '../src/step-fit.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { EXTRA_SWITCHES } from '../src/engine-extras.js';
import { mergeSettings } from '../src/config.js';
import { HELP } from '../public/help-content.js';

process.setMaxListeners(100);
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
let failures = 0, passes = 0;
const check = (ok, name, more = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok || !more ? '' : `  [${more}]`}`); if (ok) passes++; else failures++; };

// ---------- the engine's own words, as the laptop's probe logged them (Windows, so \r\n) ----------
const probe = [
  '  engine: 0.00.787.164 I llama_prepare_model_devices: using device CUDA0 (NVIDIA GeForce RTX 3060 Laptop GPU) (0000:01:00.0) - 5130 MiB free',
  '  engine: load_tensors:   CPU_Mapped model buffer size =   234.65 MiB',
  '  engine: 0.01.839.950 I load_tensors:        CUDA0 model buffer size =   946.42 MiB',
  '  engine: 0.02.255.737 I llama_kv_cache:      CUDA0 KV buffer size =  1024.00 MiB',
  '  engine: 0.02.283.476 I llama_kv_cache:      CUDA0 KV buffer size =   720.00 MiB',
  '  engine: 0.02.285.844 I llama_memory_recurrent:      CUDA0 RS buffer size =    14.62 MiB',
  '  engine: 0.02.457.941 I sched_reserve:      CUDA0 compute buffer size =  7434.90 MiB',
  '  engine: 0.02.457.949 I sched_reserve:  CUDA_Host compute buffer size =   118.52 MiB',
].join('\r\n');
{
  const u = cardUse(probe).CUDA0;
  check(u && u.free === 5130 && Math.round(u.model) === 946 && Math.round(u.kv) === 1759 && Math.round(u.compute) === 7435 && Object.keys(cardUse(probe)).length === 1, 'reads the card\'s free memory, the brain\'s part, the chat memory and the working memory from the engine\'s lines (not CUDA_Host, which is RAM)', JSON.stringify(cardUse(probe)));
  const s = shortest(probe);
  check(s.dev === 'CUDA0' && s.short === Math.round(946.42 + 1758.62 + 7434.9 + 512 - 5130), 'the shortfall is what it put there plus 512 MB spare, less what was free', JSON.stringify(s));
  const p = stepFitPlan({ log: probe, ub: 512, ctx: 32768 });
  check(p && p.ub === 128 && p.ctx === 32768 && /7435 MiB at step 512/.test(p.why), 'Inkling at 32K on the 6 GB card: step 128 (its working memory then about 1.9 GB) and the 32K chat memory kept', JSON.stringify(p));
  check(stepFitPlan({ log: probe, ub: 128, ctx: 32768 }) === null || stepFitPlan({ log: probe.replace('7434.90', '1858.73'), ub: 128, ctx: 32768 }) === null, 'at step 128 the same brain fits: nothing more to do');
}
{
  // the fit's own run: it gave up and put no layers on the card, but its deficit says how short it really is
  const fit = ['common_params_fit_impl: cannot meet free memory target of 1024 MiB, need to reduce device memory by 9512 MiB',
    'common_params_fit_impl: with only dense weights in device memory there is still a total deficit of 6033 MiB',
    'llama_prepare_model_devices: using device CUDA0 (NVIDIA GeForce RTX 3060 Laptop GPU) (0000:01:00.0) - 5130 MiB free',
    'sched_reserve:      CUDA0 compute buffer size =  7981.67 MiB'].join('\n');
  check(fitDeficitMiB(fit) === 6033 - 512, 'the fit\'s deficit is counted against its own 1024 MB target, so the part over our 512 MB margin comes off', String(fitDeficitMiB(fit)));
  const p = stepFitPlan({ log: fit, ub: 512, ctx: 32768 });
  check(p?.ub === 128, 'with the fit on, its deficit wins over what the card shows (the weights went to RAM, so the card looked less short)', JSON.stringify(p));
}
{
  const small = 'using device CUDA0 (X) (0000:01:00.0) - 15000 MiB free\nCUDA0 model buffer size = 14000.00 MiB\nCUDA0 compute buffer size = 600.00 MiB';
  check(stepFitPlan({ log: small, ub: 512, ctx: 32768 }) === null, 'a card short by the weights, with a small working memory: left to the fit (moving weights), the step isn\'t cut');
  check(stepFitPlan({ log: 'using device CUDA0 (X) (0000:01:00.0) - 9000 MiB free\nCUDA0 compute buffer size = 3000.00 MiB', ub: 512, ctx: 32768 }) === null, 'everything fits with room to spare: nothing changes');
  check(stepFitPlan({ log: '', ub: 512, ctx: 32768 }) === null && stepFitPlan({ log: 'MTL0 compute buffer size = 9000.00 MiB', ub: 512 }) === null, 'no engine lines, or a Mac (MTL0, shared memory): nothing changes');
  const vk = 'using device Vulkan0 (AMD Radeon RX 7600) (0000:03:00.0) - 7800 MiB free\nVulkan0 model buffer size = 4000.00 MiB\nVulkan0 KV buffer size = 1000.00 MiB\nVulkan0 compute buffer size = 4000.00 MiB';
  check(stepFitPlan({ log: vk, ub: 512, ctx: 32768 })?.ub === 256, 'a Vulkan card (AMD, Intel) is read the same way', JSON.stringify(stepFitPlan({ log: vk, ub: 512, ctx: 32768 })));
  const huge = 'using device CUDA0 (X) (0000:01:00.0) - 3000 MiB free\nCUDA0 model buffer size = 2000.00 MiB\nCUDA0 compute buffer size = 16000.00 MiB';
  const h = stepFitPlan({ log: huge, ub: 512, ctx: 65536 });
  check(h?.ub === STEP_FIT_MIN_UB && h.ctx === 32768, 'still short at the smallest step: the chat memory halves too', JSON.stringify(h));
  check(stepFitPlan({ log: huge, ub: STEP_FIT_MIN_UB, ctx: STEP_FIT_MIN_CTX }) === null, '...but never under the 64 step and a 16K chat memory');
  const oom = 'using device CUDA0 (X) (0000:01:00.0) - 5130 MiB free\nCUDA0 model buffer size = 946.00 MiB\nggml_backend_cuda_buffer_type_alloc_buffer: allocating 7434.90 MiB on device 0: cudaMalloc failed: out of memory';
  check(stepFitPlan({ log: oom, ub: 512, ctx: 32768 })?.ub === 128, 'a load that failed allocating its working memory (Linux) is read the same way');
}
{
  const plan = ['common_memory_breakdown_print: |   - CUDA0 (NVIDIA GeForce RTX 3060 Laptop GPU) |  6143 = 5130 + (13618 =  8469 +    1758 +    3390) +      -12605 |',
    'common_params_fit_impl: cannot meet free memory target of 1024 MiB, need to reduce device memory by 9512 MiB',
    'common_params_fit_impl: getting device memory data with all MoE tensors moved to system memory:',
    'common_memory_breakdown_print: |   - CUDA0 (NVIDIA GeForce RTX 3060 Laptop GPU) |  6143 = 5130 + (10139 =   946 +    1758 +    7434) +       -9126 |',
    'common_params_fit_impl: with only dense weights in device memory there is still a total deficit of 6033 MiB'].join('\r\n');
  const p = fitPlanEarly({ log: plan, ub: 512, ctx: 32768 });
  check(p?.ub === 128 && p.ctx === 32768 && /7434 MiB at step 512/.test(p.why), 'the fit\'s plan (the probe\'s own lines, before any weights load): open at step 128', JSON.stringify(p));
  check(fitPlanEarly({ log: plan.split('\r\n').slice(0, 4).join('\n'), ub: 512 }) === null, 'until the fit says even every expert in RAM is short, nothing is decided');
  check(growCap({ ub: 128, perUbMiB: 14.52 }) === 128 && growCap({ ub: 256, perUbMiB: 1.5 }) === 512 && growCap({ ub: 512 }) === 512, 'how far GUPPI may raise the step: the 512 MB the fit leaves over our margin, at the brain\'s own cost per token of step');
}
check(withStep(['-m', 'x', '-b', '2048', '-ub', '2048', '--fit', 'on'], 128).join(' ') === '-m x -b 2048 --fit on -ub 128' && withStep(['-b', '64'], 128).join(' ') === '-b 128 -ub 128' && ubOf(['-ub', '256']) === 256 && ubOf([]) === 512, 'the step goes in once, and the batch is never smaller than it');
check(/didn't fit the graphics card/.test(stepFitLine('Inkling', 128, 32768, 32768)) && !/chat memory/.test(stepFitLine('Inkling', 128, 32768, 32768)) && /16K chat memory/.test(stepFitLine('Inkling', 64, 16384, 32768)), 'the chat line says what changed, in plain words');

// ---------- off by default ----------
check(!stepFitOn({}) && stepFitOn({ smallStepFit: true }) && EXTRA_SWITCHES.includes('smallStepFit') && mergeSettings({}, { smallStepFit: 'yes' }).smallStepFit === false && mergeSettings({}, { smallStepFit: true }).smallStepFit === true, 'off in a fresh Bob; only true turns it on, and it saves like the other extras');
check(fs.readdirSync(path.join(here, '..', 'src')).filter((f) => f.endsWith('.js') && /smallStepFit/.test(read(`src/${f}`))).sort().join() === 'config.js,engine-extras.js,self-help.js,step-fit.js', 'only its own switch turns it on: Turbo doesn\'t');

// ---------- the engine, with the fake llama-server ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-step-fit-'));
const models = path.join(tmp, 'models');
const blob = (name, tag, hex) => {
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', name);
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
  fs.writeFileSync(path.join(models, 'blobs', `sha256-${hex}`), 'GGUF');
  fs.writeFileSync(path.join(dir, tag), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${hex}` }] }));
};
blob('inkling', 'latest', 'b1');
let n = 0;
const all = [];
const make = (cfgOver = {}, lcOver = {}) => {
  const dataDir = path.join(tmp, `data-${++n}`);
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { dataDir, agentDir: tmp, smallStepFit: true, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 19700 + n * 20, ...lcOver }, engineTuning: { mode: 'bob' }, ...cfgOver };
  const e = new LlamaCpp(cfg);
  e.logs = []; e.log = (k, t) => e.logs.push(t);
  e.cardReaders = { card: async () => null }; e.freeRam = () => 16 * 1024 ** 3;
  clearInterval(e.idleTimer);
  all.push(e);
  return e;
};
const argsOf = (e) => fs.readFileSync(path.join(e.cfg.dataDir, 'llama-server-args.txt'), 'utf8');
const ubNow = (e) => ubOf(argsOf(e).trim().split(' '));
const env = { MOCK_COMPUTE_MIB: '7434.9', MOCK_FREE_MIB: '5130', MOCK_MODEL_MIB: '946.42', MOCK_KV_MIB: '1758.62' };
const setEnv = (o) => { for (const [k, v] of Object.entries(o)) { if (v === null) delete process.env[k]; else process.env[k] = v; } };
try {
  setEnv(env);
  // GUPPI's way (the owner, Nov 27): no reloads. With the fit on, its plan is read as the engine starts and the brain opens at
  // a step that fits; the first start is stopped before any weights load.
  let saved = null;
  {
    const e = make({}, { fit: true });
    let spawns = 0; const spawnLog = e.log; e.log = (k, t) => { spawnLog(k, t); };
    const t0 = Date.now();
    await e.preload('inkling', undefined, { ctx: 32768 });
    saved = JSON.parse(fs.readFileSync(path.join(e.cfg.dataDir, 'engine-care.json'), 'utf8'));
    check(await e.isLoaded('inkling', { ctx: 32768 }) && ubNow(e) === 128 && e.currentCtx === 32768 && /--fit on/.test(argsOf(e)), 'the fit\'s plan said the working memory won\'t fit: the brain opens at step 128, the 32K chat memory kept', argsOf(e));
    check(e.logs.some((t) => /read the engine's plan before any weights loaded: the working memory was 743\d MiB at step 512 .*opens it at step 128/.test(t)) && !e.logs.some((t) => /load-failed|stopped while loading/.test(t)) && !fs.existsSync(path.join(e.cfg.dataDir, 'llama-server-load-failed.txt')), 'the logbook says why, and the stopped start isn\'t counted as a failed load', e.logs.join(' | '));
    check(saved.stepFit?.['inkling|32768']?.ub === 128 && saved.stepFit['inkling|32768'].perUbMiB > 14, 'the step and the working memory per token of step are remembered', JSON.stringify(saved.stepFit));
    check(e.takeNotes().some((t) => /working memory didn't fit the graphics card/.test(t)), 'the chat is told once');
    check(Date.now() - t0 < 8000, 'no second full load: the first start stops as soon as the plan is printed', String(Date.now() - t0));
    await e.stopServer();
    void spawns;
  }
  {
    const e2 = make(); e2.careData.stepFit = saved.stepFit;
    const a = e2.buildArgs('inkling', { ctx: 32768 });
    const first = make({}, { fit: true }).buildArgs('inkling', { ctx: 32768 });
    check(first.join(' ').includes('-lv 4') && !a.includes('-lv') && !make({ smallStepFit: false }).buildArgs('inkling', { ctx: 32768 }).includes('-lv'), 'the first load of a brain asks the engine for its plan and buffer sizes (log level 4, the usual level prints none); once the step is known, or with the switch off, it doesn\'t', first.join(' '));
    check(ubOf(a) === 128 && a.filter((x) => x === '-ub').length === 1 && e2.logs.some((t) => /reading step 128, because/.test(t)) && !e2.stepFitEarly, 'the next load (after a restart too) opens straight at step 128', a.join(' '));
    const off = make({ smallStepFit: false }); off.careData.stepFit = saved.stepFit;
    check(ubOf(off.buildArgs('inkling', { ctx: 32768 })) === 512, 'switched off: the remembered step isn\'t used');
    const other = make(); other.careData.stepFit = { 'inkling|32768': { ...saved.stepFit['inkling|32768'], be: 99 } };
    check(ubOf(other.buildArgs('inkling', { ctx: 32768 })) === 512, 'a step found on another engine build isn\'t used (a newer engine may need less)');
  }
  {
    // GUPPI driving on Brain Engine 46: the step is raised for long reads only as far as the room the fit leaves
    const g = make({ engineTuning: { mode: 'conductor' } }); g.beNo = () => 46; g.buildNo = () => 12359; g.careData.stepFit = { 'inkling|32768': { ub: 128, ctx: 32768, perUbMiB: 14.52, be: 46 } };
    g.buildArgs('inkling', { ctx: 32768 });
    check(g.condChat === 128 && g.condMax === 128, 'GUPPI reads at up to the step there\'s room for (Inkling: 512 MB at 14.5 MB a token keeps it at 128)', JSON.stringify({ chat: g.condChat, max: g.condMax }));
    const h = make({ engineTuning: { mode: 'conductor' } }); h.beNo = () => 46; h.buildNo = () => 12359; h.careData.stepFit = { 'inkling|32768': { ub: 256, ctx: 32768, perUbMiB: 1.5, be: 46 } };
    h.buildArgs('inkling', { ctx: 32768 });
    check(h.condChat === 256 && h.condMax === 512, 'a brain with a lighter working memory gets room to read at a bigger step, and GUPPI steps back if the card says it\'s short', JSON.stringify({ chat: h.condChat, max: h.condMax }));
  }
  {
    // no fit (a placement pinned), the load spills anyway: on Brain Engine the step goes down in place, no reload
    setEnv({ MOCK_CONTEXT: '1' });
    const e = make({}, { fit: false }); e.beNo = () => 46;
    await e.preload('inkling', undefined, { ctx: 32768 });
    const pid1 = e.child?.pid;
    const live = await (await fetch(`${e.url}/test-ctx`)).json();
    check(live.n_ubatch === 128 && live.pid === pid1 && ubOf(e.lastArgs) === 128 && e.logs.some((t) => /switched it to step 128 in place, the brain kept loaded/.test(t)), 'a brain that loaded short switches to step 128 in place: same engine, no reload', JSON.stringify(live));
    await e.stopServer();
    setEnv({ MOCK_CONTEXT: null });
    const old = make({}, { fit: false });
    await old.preload('inkling', undefined, { ctx: 32768 });
    check(ubNow(old) === 512 && old.logs.some((t) => /next load opens at step 128/.test(t)) && old.careData.stepFit?.['inkling|32768']?.ub === 128, 'an engine that can\'t change the step in place: no reload either, the next load opens at it', argsOf(old));
    await old.stopServer();
  }
  {
    const e = make({ smallStepFit: false });
    await e.preload('inkling', undefined, { ctx: 32768 });
    check(ubNow(e) === 512 && !e.logs.some((t) => /opens it at step|switched it to step|next load opens/.test(t)), 'off (the default): the brain loads as before, at step 512', argsOf(e));
    await e.stopServer();
  }
  {
    const e = make(); e.guppiProfile = () => ({ cap: 512, keepBob: true, ubCap: 256 });
    const a = e.buildArgs('inkling', { ctx: 32768 });
    check(e.stepFitHand === true && !e.stepFitCan(), 'a step Calibrate found for this brain wins: GUPPI\'s load-time fit stands back', a.join(' '));
  }
  {
    const e = make({}, { ubatch: 256, fit: true });
    await e.preload('inkling', undefined, { ctx: 32768 });
    check(ubNow(e) === 256 && !e.logs.some((t) => /opens it at step|switched it to step|next load opens/.test(t)), 'a reading step set by hand wins', argsOf(e));
    await e.stopServer();
  }
  {
    const e = make({ sharedGraphics: true, gpuVramGB: 7, reservedGraphicsGB: 0.5 });
    await e.preload('inkling', undefined, { ctx: 32768 });
    check(!e.logs.some((t) => /opens it at step|switched it to step|next load opens/.test(t)), 'built-in graphics keep their own fitting (apu-fit.js)');
    await e.stopServer();
  }
  {
    setEnv({ MOCK_CARD_OOM: '1' });
    const e = make({}, { fit: false });
    await e.preload('inkling', undefined, { ctx: 32768 });
    check(await e.isLoaded('inkling', { ctx: 32768 }) && ubNow(e) === 128 && e.currentCtx === 32768 && e.logs.some((t) => /ran out of card memory while loading; .* step 128/.test(t)), 'Linux-style failure (out of card memory while loading): a smaller step first, the 32K chat memory kept', argsOf(e));
    await e.stopServer();
    setEnv({ MOCK_CARD_OOM: null });
  }
  {
    setEnv({ MOCK_COMPUTE_MIB: '3000', MOCK_FREE_MIB: '9000' });
    const e = make({}, { fit: true });
    await e.preload('inkling', undefined, { ctx: 32768 });
    check(ubNow(e) === 512 && !e.logs.some((t) => /opens it at step|switched it to step|next load opens/.test(t)), 'a card with room: one load, step unchanged', argsOf(e));
    await e.stopServer();
  }
} finally {
  setEnv({ MOCK_COMPUTE_MIB: null, MOCK_FREE_MIB: null, MOCK_MODEL_MIB: null, MOCK_KV_MIB: null, MOCK_CARD_OOM: null, MOCK_CONTEXT: null });
  for (const e of all) { try { await e.stopServer(); } catch {} clearInterval(e.idleTimer); }
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

// ---------- Help, glossary, FAQ, Settings ----------
{
  const ex = HELP.find((h) => h.id === 'engine-extras')?.html || '';
  const faq = HELP.find((h) => h.id === 'faq-step-fit')?.html || '';
  const all = HELP.map((h) => h.html).join('\n');
  check(/GUPPI fits his working memory to the card/.test(all) && !/GUPPI fits his working memory/.test(ex) && /'GUPPI fits his working memory to the card', 'Off'/.test(read('public/help-content.js')), 'Settings Help names it under Engine tuning, off, and Engine extras no longer lists it');
  check(/smaller step/.test(faq) && /Nothing loads twice/.test(faq) && /Windows and Linux/.test(faq) && /Android app/.test(faq) && /unproven in our lab/.test(faq), 'an FAQ in Bob\'s voice says what it does, where it works and that it\'s untested');
  check(/<dt>Working memory \(compute buffer\)<\/dt>/.test(all), 'a glossary entry');
  check(read('public/cellar-engines.js').indexOf("sswitch('smallStepFit'") > read('public/cellar-engines.js').indexOf('<strong>Engine tuning</strong>') && read('public/cellar-engines.js').indexOf("sswitch('smallStepFit'") < read('public/cellar-engines.js').indexOf('function engineExtrasHtml') && read('public/cellar.js').includes("'smallStepFit'"), 'the switch is in Settings, Engine tuning (GUPPI\'s), not Engine extras');
}

console.log(`\n${passes} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
