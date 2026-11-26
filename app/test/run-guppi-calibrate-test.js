// Nov 26 GUPPI calibrates this PC (src/guppi-calibrate.js, src/guppi-profile.js, public/guppi-cal.js, llamacpp.js).
// No real engine, card, RAM or temperature: a fake Lab in a temp folder, scripted speeds and a scripted card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseHealth, guppiTries, tryArgs, tripWhy, guppiVerdict, spillLimitMiB, coolDown, heatOf, startGuppiCalibrate, guppiCalLock, guppiCalView, forgetProfile, COOL, RAM_FLOOR_MIB, HEAT_STOP_C } from '../src/guppi-calibrate.js';
import { pcNow, pcChanged, profileFor, readProfile, seedSpeeds, profileFile, speedsFile, saveProfile } from '../src/guppi-profile.js';
import { guppiCalHtml } from '../public/guppi-cal.js';
import { writeGgufFrom } from '../src/lab-gguf.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { parseThrottle, readThrottle, heatStep, CLEAR_MS } from '../src/guppi-heat.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const GB = 2 ** 30;

// ---------- the pieces ----------
{
  const h = parseHealth('NVIDIA GeForce RTX 5070 Ti, 41, 2850, 14001, 32.10, 15000, 16303\r\n');
  check('the card\'s health line: name, temperature, clocks, power, free and total memory', h.gpu === 'NVIDIA GeForce RTX 5070 Ti' && h.tempC === 41 && h.smMHz === 2850 && h.memMHz === 14001 && h.powerW === 32.1 && h.freeMiB === 15000 && h.totalMiB === 16303, JSON.stringify(h));
  check('unknown values are null, and nothing read is null', parseHealth('Card, [N/A], [N/A], [N/A], [N/A], 900, 4096').tempC === null && parseHealth('Card, [N/A], [N/A], [N/A], [N/A], 900, 4096').freeMiB === 900 && parseHealth('') === null && parseHealth(null) === null);
  check('no copy cache: only Bob\'s pick is timed (GUPPI keeps Bob\'s step then)', guppiTries({ bobStep: 2048 }).map((t) => t.id).join() === 'bob');
  check('with the copy cache: Bob\'s pick first, then GUPPI\'s steps smallest first', guppiTries({ bobStep: 2048, cache: true }).map((t) => `${t.id}:${t.step}:${t.cache}`).join() === 'bob:2048:false,g2048:2048:true,g4096:4096:true,g6144:6144:true');
  check('Bob\'s step 0 is llama-server\'s own 512; built-in graphics stop at 2048', guppiTries({ cache: true }).map((t) => t.step).join() === '512,512,4096,6144' && guppiTries({ bobStep: 512, cache: true, apu: true }).map((t) => t.step).join() === '512,512');
  const a = tryArgs({ step: 4096, cache: true }, { beNo: 45 });
  check('GUPPI\'s try loads the way he does: the step, the copy cache, filled to the card around that step', a.extra.join(' ') === '-b 4096 -ub 4096 --moe-cache-mib 4096' && a.env.LLAMA_MOE_CACHE_FILL === '1' && a.env.LLAMA_MOE_CACHE_FILL_STEP === '4096');
  check('Bob\'s pick: no cache, no fill; step 512 adds no flags', tryArgs({ step: 2048, cache: false }).extra.join(' ') === '-b 2048 -ub 2048' && tryArgs({ step: 2048 }).env === null && tryArgs({ step: 512 }).extra.length === 0);
  check('trips: heat, the RAM floor, the card margin, a spill past the step\'s own staging buffer', /^heat/.test(tripWhy({ tempC: HEAT_STOP_C })) && /^ram/.test(tripWhy({ ramMiB: RAM_FLOOR_MIB - 1 })) && /^card/.test(tripWhy({ freeMiB: 511 })) && /^spill/.test(tripWhy({ sharedRiseMiB: spillLimitMiB(4096) + 1 }, { step: 4096 })));
  check('the edge rides: 512 MB free, the floor exactly, a staging-buffer rise are all fine', tripWhy({ freeMiB: 512, ramMiB: 512, tempC: 89, sharedRiseMiB: spillLimitMiB(6144) }, { step: 6144 }) === '' && spillLimitMiB(4096) === 512 + 512 + 80);
  check('built-in graphics: the 1.5 GB floor and 95 C, and the card margin isn\'t theirs', /^ram/.test(tripWhy({ ramMiB: 1400 }, { apu: true })) && tripWhy({ tempC: 92, freeMiB: 10 }, { apu: true }) === '' && /^heat/.test(tripWhy({ tempC: 95 }, { apu: true })));
  check('the card margin only counts while a try\'s engine is up', tripWhy({ freeMiB: 100 }, { card: false }) === '');
}

// ---------- the verdict ----------
{
  const bob = { id: 'bob', step: 2048, readTps: 2000, tps: 80 };
  const v = guppiVerdict([bob, { id: 'g2048', step: 2048, readTps: 2100, tps: 84 }, { id: 'g4096', step: 4096, readTps: 3400, tps: 83 }, { id: 'g6144', step: 6144, trip: 'card: only 300 MB left free on the card, under the 512 MB margin' }]);
  check('GUPPI beats Bob\'s pick: his fastest safe step, the edge named, the cap below it', v.beatsBob && !v.keepBob && v.guppiStep === 4096 && v.cap === 4096 && /beat Bob's pick/.test(v.why) && /Step 6144 was the edge/.test(v.why), JSON.stringify(v));
  check('only GUPPI\'s own rows become his speeds', JSON.stringify(v.speeds) === JSON.stringify({ read: { 2048: 2100, 4096: 3400 }, write: { 2048: 84, 4096: 83 } }));
  const close = guppiVerdict([bob, { id: 'g2048', step: 2048, readTps: 2050, tps: 81 }]);
  check('under 5% better isn\'t beating Bob: Bob\'s pick is kept, and it says so', close.keepBob && !close.beatsBob && close.guppiStep === 0 && /keeps Bob's own step and adds no copy cache/.test(close.why));
  check('nothing of GUPPI\'s ran: Bob\'s pick, no cap', guppiVerdict([bob, { id: 'g2048', step: 2048, failed: 'x' }]).keepBob && guppiVerdict([bob, { id: 'g2048', step: 2048, failed: 'x' }]).cap === 0);
  check('no copy cache: only Bob\'s pick, kept, in plain words', /No copy cache/.test(guppiVerdict([bob]).why) && guppiVerdict([bob]).keepBob);
  check('Bob\'s pick didn\'t run but GUPPI did: GUPPI, and it says why', guppiVerdict([{ id: 'bob', step: 2048, failed: 'Didn\'t start' }, { id: 'g2048', step: 2048, readTps: 2000, tps: 70 }]).beatsBob);
}

// ---------- the profile ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob guppi '));
{
  const cfg = { dataDir: tmp, gpuVramGB: 16 };
  const now = pcNow(cfg, { beNo: 46, ramBytes: 32 * GB, osKey: 'windows' });
  check('this PC: the card, the RAM, the graphics kind and the engine build', now.cardGB === 16 && now.ramGB === 32 && now.be === 46 && now.sharedGraphics === false);
  check('a profile from another card, RAM or engine doesn\'t fit, and says why', pcChanged(now, now) === '' && /Brain Engine 46/.test(pcChanged(now, { ...now, be: 47 })) && /16 GB card and this one has 12 GB/.test(pcChanged(now, { ...now, cardGB: 12 })) && /RAM/.test(pcChanged(now, { ...now, ramGB: 64 })) && pcChanged(now, { ...now, ramGB: 32.4 }) === '');
  saveProfile(cfg, { v: 1, pc: now, brains: { big: { cap: 4096, keepBob: false, why: 'w' }, small: { cap: 0, keepBob: true } } });
  check('for GUPPI at load: the cap and the verdict for a brain, stale on another PC, nothing for an unknown brain', profileFor(cfg, 'big', now).cap === 4096 && profileFor(cfg, 'small', now).keepBob === true && /Brain Engine/.test(profileFor(cfg, 'big', { ...now, be: 45 }).stale) && profileFor(cfg, 'other', now) === null);
  check('the profile lives in the conductor folder of the data folder', profileFile(cfg) === path.join(tmp, 'conductor', 'pc-profile.json') && readProfile(cfg).v === 1 && readProfile({ dataDir: path.join(tmp, 'nope') }) === null);
  fs.mkdirSync(path.dirname(speedsFile(cfg)), { recursive: true });
  fs.writeFileSync(speedsFile(cfg), JSON.stringify({ be: 46, speeds: { big: { read: { 2048: 1 }, write: { 2048: 1, 6144: 9 } }, other: { read: { 2048: 5 }, write: {} } } }));
  seedSpeeds(cfg, 'big', { read: { 2048: 2100, 4096: 3400 }, write: { 2048: 84, 4096: 83 } }, 46);
  const s = JSON.parse(fs.readFileSync(speedsFile(cfg), 'utf8'));
  check('measured speeds replace GUPPI\'s learned ones for those steps, and keep the rest', s.be === 46 && s.speeds.big.read[2048] === 2100 && s.speeds.big.write[6144] === 9 && s.speeds.other.read[2048] === 5);
  seedSpeeds(cfg, 'big', { read: { 2048: 7 }, write: { 2048: 7 } }, 47);
  const s2 = JSON.parse(fs.readFileSync(speedsFile(cfg), 'utf8'));
  check('another engine build\'s speeds file starts over', s2.be === 47 && !s2.speeds.other && s2.speeds.big.read[2048] === 7);
  fs.rmSync(path.join(tmp, 'conductor'), { recursive: true, force: true });
}

// ---------- cooling down ----------
{
  const slept = []; const temps = [52, 48, 44, 43];
  const fx = { sleep: async (ms) => { slept.push(ms); }, health: async () => ({ tempC: temps.length ? temps.shift() : 43 }) };
  const c = await coolDown(fx, { idleC: 40 });
  check('cool down: at least 35 s, then until within 3 C of idle', c.cool === true && c.startC === 43 && c.waitedS === COOL.minS + 3 * COOL.everyS && slept[0] === 35000, JSON.stringify(c));
  const hotFx = { sleep: async () => {}, health: async () => ({ tempC: 70 }) };
  const h = await coolDown(hotFx, { idleC: 40 });
  check('cool down gives up after 5 minutes and says it isn\'t cool', h.cool === false && h.waitedS >= COOL.maxS && h.waitedS < COOL.maxS + COOL.everyS);
  const none = await coolDown({ sleep: async () => {}, health: async () => null }, { idleC: null });
  check('no temperature (no NVIDIA card): the 35 s wait, cool unknown', none.cool === null && none.waitedS === COOL.minS);
  const hs = heatOf([{ tempC: 50, smMHz: 2800, freeMiB: 900, ramMiB: 9000.4 }, { tempC: 63, smMHz: 2600, freeMiB: 700, ramMiB: 8000.2, sharedRiseMiB: 300 }, { tempC: 58, smMHz: 2700 }]);
  check('each try logs the peak temperature, median and lowest clock, lowest card and RAM free, the spill', hs.peakC === 63 && hs.smMedMHz === 2700 && hs.smMinMHz === 2600 && hs.minFreeMiB === 700 && hs.minRamMiB === 8000 && hs.spillMiB === 300, JSON.stringify(hs));
}

// ---------- the job, with a made-up engine and card ----------
const moe = path.join(tmp, 'moe.gguf');
{ const buf = Buffer.alloc(4096); await writeGgufFrom(moe, { kvs: [{ key: 'general.architecture', type: 8, value: 'qwen3moe' }, { key: 'qwen3moe.block_count', type: 4, value: 2 }, { key: 'qwen3moe.expert_count', type: 4, value: 8 }], tensors: [{ name: 'blk.0.ffn_up_exps.weight', dims: [32, 16, 2], type: 0, bytes: buf.length, data: async () => buf }] }); }
// speeds: { tryKey: { read, write } }, cardFree: { tryKey: MiB }, plus temp/ram/shared scripts. tryKey = `${step}:${cache}`
const mkLab = ({ speeds = {}, cardFree = {}, throttle = () => '0x0000000000000004', temp = () => 40, ram = () => 12000, shared = () => null, loaded = [], other = null, over = {} } = {}) => {
  let cur = null;
  const served = [], slept = [];
  const lab = {
    cfg: { dataDir: tmp, settingsFile: path.join(tmp, 'settings.json'), engine: 'llamacpp', gpuVramGB: 1e-6, ...over.cfg }, job: null, runs: [], served, slept,
    now: () => 1795700000000, save() {}, tell() {}, broadcast() {}, runView: (r) => r, stop() { if (!this.job) return { stopped: false }; this.job.ac.abort(); return { stopped: true }; },
    tools: () => ({ server: { path: 'llama-server', found: true } }),
    brain: { engine: { resolve: () => ({ gguf: moe }), beNo: () => 46, loaded: async () => loaded, unloadAll: async () => { lab.unloaded = true; }, guppiReload: () => { lab.reloaded = (lab.reloaded || 0) + 1; }, recentPrompts: [] } },
    guppiFns: {
      serve: async (o) => {
        served.push(o);
        const ub = o.extra.lastIndexOf('-ub'); const step = ub >= 0 ? Number(o.extra[ub + 1]) : 512; const cache = o.extra.includes('--moe-cache-mib');
        const key = `${step}:${cache}`;
        if (!speeds[key]) throw new Error('out of memory');
        cur = key;
        return { url: `fake:${key}`, stop() { served.stopped = (served.stopped || 0) + 1; cur = null; } };
      },
      chat: async (url, msgs, { maxTokens }) => { const s = speeds[url.slice(5)]; return { text: s.text || 'same', timings: maxTokens === 24 ? { prompt_per_second: s.read, prompt_ms: 4000 } : { predicted_per_second: s.write } }; },
      health: async () => ({ gpu: 'Test card', tempC: temp(cur), smMHz: 2800, memMHz: 14000, freeMiB: null, totalMiB: 16303 }),
      card: async () => (other ? { freeMB: 1000, totalMB: 16303, others: [other] } : { freeMB: cur ? cardFree[cur] ?? 900 : 15000, totalMB: 16303, others: [] }),
      throttle: async () => parseThrottle(throttle(cur)), ram: () => ram(cur), shared: async () => shared(cur), sleep: async (ms) => { slept.push(ms); }, watchMs: 0
    },
    ...over.lab
  };
  return lab;
};
const wait = async (lab) => { for (let i = 0; i < 500 && lab.job; i++) await new Promise((r) => setTimeout(r, 5)); };
const fast = { '512:false': { read: 1000, write: 60, text: 'bob words' }, '512:true': { read: 1100, write: 70, text: 'bob words' }, '4096:true': { read: 3000, write: 72, text: 'other words' }, '6144:true': { read: 3500, write: 71 } };

{
  const lab = mkLab({ speeds: fast, cardFree: { '6144:true': 300 } });
  const r = await startGuppiCalibrate(lab, { model: 'big', name: 'Big Brain', osKey: 'windows' });
  check('it starts as one job: measure, Bob\'s pick, GUPPI\'s three steps, save', r.started?.kind === 'guppi-calibrate' && r.started.steps.map((s) => s.id).join() === 'pc,bob,g512,g4096,g6144,save' && r.started.name === 'GUPPI calibrates this PC: Big Brain');
  await wait(lab);
  const p = readProfile(lab.cfg), b = p?.brains?.big;
  check('the job ends done and says what it found', lab.runs[0].state === 'done' && /Big Brain: GUPPI at step 4096 beat Bob's pick/.test(lab.runs[0].report?.saw || ''), lab.runs[0].report?.saw || lab.runs[0].error);
  check('the step that left the card under 512 MB is the edge: GUPPI is capped below it', b.cap === 4096 && b.beatsBob === true && b.keepBob === false && /^card/.test(b.rows.find((x) => x.id === 'g6144').trip));
  check('Bob\'s pick ran with no cache at his own step; GUPPI\'s with the cache and the fill', lab.served[0].extra.length === 0 && !lab.served[0].env && lab.served[2].extra.join(' ') === '-b 4096 -ub 4096 --moe-cache-mib 4096' && lab.served[2].env.LLAMA_MOE_CACHE_FILL_STEP === '4096');
  check('every try cooled down first (35 s at least) and every trial engine was stopped', lab.slept.filter((ms) => ms === 35000).length === 4 && lab.served.stopped >= 4);
  check('three reads and writes per try, the median kept; the words checked against Bob\'s pick', b.rows.find((x) => x.id === 'g4096').readTps === 3000 && b.rows.find((x) => x.id === 'g512').sameWords === true && b.rows.find((x) => x.id === 'g4096').sameWords === false);
  check('temperature and clocks are logged with each try', b.rows.every((x) => x.peakC === 40) && b.rows.find((x) => x.id === 'g4096').smMedMHz === 2800 && p.pc.gpu === 'Test card' && p.pc.idleC === 40);
  const sp = JSON.parse(fs.readFileSync(speedsFile(lab.cfg), 'utf8'));
  check('GUPPI\'s measured speeds are seeded for this engine build, and the engine reads them again', sp.be === 46 && sp.speeds.big.read[4096] === 3000 && sp.speeds.big.write[512] === 70 && lab.reloaded === 1);
  check('calibrating changes no setting', !fs.existsSync(lab.cfg.settingsFile));
  const view = guppiCalView(lab.cfg, lab, p.pc);
  check('Settings sees the result: the cap, the verdict and each try', view.brains[0].cap === 4096 && view.brains[0].beatsBob && view.brains[0].rows.length === 4 && view.stale === '' && view.run === null);
  const html = guppiCalHtml(view, { models: ['big'], pick: 'big' });
  check('the Settings box: the button, what was found, each try in plain words, and Forget', /Calibrate GUPPI for this PC/.test(html) && /reading step at most 4096/.test(html) && /stopped, card: only 300 MB/.test(html) && /reads 3000 and writes 72 tokens a second/.test(html) && /different words/.test(html) && /data-gcforget/.test(html));
  check('the box says when the result is from another PC', /isn't used: it was made with Brain Engine 46/.test(guppiCalHtml(guppiCalView(lab.cfg, lab, { ...p.pc, be: 47 }), { models: ['big'] })));
}

{
  const lab = mkLab({ speeds: { '512:false': { read: 1000, write: 60 }, '512:true': { read: 1010, write: 61 }, '4096:true': { read: 1020, write: 61 }, '6144:true': { read: 1030, write: 60 } } });
  await startGuppiCalibrate(lab, { model: 'close', osKey: 'linux' }); await wait(lab);
  const b = readProfile(lab.cfg).brains.close;
  check('when GUPPI doesn\'t beat Bob\'s pick by 5%, the profile keeps Bob\'s pick for that brain', b.keepBob === true && b.beatsBob === false && b.cap === 6144 && readProfile(lab.cfg).brains.big?.cap === 4096);
}

{
  const lab = mkLab({ speeds: fast, temp: (cur) => (cur === '512:true' ? 91 : 40) });
  await startGuppiCalibrate(lab, { model: 'hot', osKey: 'windows' }); await wait(lab);
  const b = readProfile(lab.cfg).brains.hot;
  check('too hot: the try stops at once and nothing after it runs', /^heat/.test(b.rows.find((x) => x.id === 'g512').trip) && /too hot/.test(b.rows.find((x) => x.id === 'g4096').failed) && lab.served.length === 2 && b.keepBob);
}

{
  const lab = mkLab({ speeds: fast, ram: (cur) => (cur === '4096:true' ? 400 : 12000) });
  await startGuppiCalibrate(lab, { model: 'tight', osKey: 'windows' }); await wait(lab);
  const b = readProfile(lab.cfg).brains.tight;
  check('free RAM under the 512 MB floor stops the try and makes that step the edge', /^ram/.test(b.rows.find((x) => x.id === 'g4096').trip) && /past the edge/.test(b.rows.find((x) => x.id === 'g6144').failed) && b.cap === 512 && lab.served.length === 3);
}

{
  const lab = mkLab({ speeds: fast, shared: (cur) => (cur === '4096:true' ? 2000 : 100) });
  await startGuppiCalibrate(lab, { model: 'spill', osKey: 'windows' }); await wait(lab);
  const b = readProfile(lab.cfg).brains.spill;
  check('a spill into shared memory makes that step the edge', /^spill/.test(b.rows.find((x) => x.id === 'g4096').trip) && b.cap === 512);
}

{
  const lab = mkLab({ speeds: fast, loaded: [{ name: 'Qwen', vram: 9 }] });
  const r = await startGuppiCalibrate(lab, { model: 'big', osKey: 'windows' });
  check('a brain on the card: it asks before unloading it', r.needUnload === true && r.names[0] === 'Qwen' && !lab.job);
  let why = '';
  try { await startGuppiCalibrate(mkLab({ speeds: fast, other: { name: 'StarGame', mb: 9000 } }), { model: 'big', osKey: 'windows' }); } catch (e) { why = e.message; }
  check('another program holding the card: it waits, and names it', /StarGame/.test(why));
  try { why = ''; await startGuppiCalibrate(mkLab({ over: { cfg: { session: 'light' } } }), { model: 'big', osKey: 'windows' }); } catch (e) { why = e.message; }
  check('Gaming on: it waits', /Gaming is on/.test(why));
  check('not on a Mac, not without my engine, not without a brain', /Mac/.test(guppiCalLock(mkLab(), 'big', { osKey: 'mac' })) && /built-in engine/.test(guppiCalLock(mkLab({ over: { cfg: { engine: 'ollama' } } }), 'big', { osKey: 'linux' })) && /Pick a brain/.test(guppiCalLock(mkLab(), '', { osKey: 'linux' })) && guppiCalLock(mkLab(), 'big', { osKey: 'windows' }) === '');
  const brainOnly = mkLab({ speeds: fast, over: { cfg: { gpuVramGB: 64 } } });
  await startGuppiCalibrate(brainOnly, { model: 'fits', osKey: 'windows' }); await wait(brainOnly);
  check('a brain that fits the card (no copy cache): only Bob\'s pick is timed, and kept', brainOnly.served.length === 1 && readProfile(brainOnly.cfg).brains.fits.keepBob === true);
  const f = forgetProfile(brainOnly.cfg, brainOnly.brain.engine);
  check('Forget deletes this PC\'s profile and the engine reads again', f.forgotten && readProfile(brainOnly.cfg) === null && brainOnly.reloaded >= 2);
}

// ---------- GUPPI at load ----------
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-guppi-load-'));
  const mk = () => { const e = new LlamaCpp({ agentDir: d, dataDir: d, gpuVramGB: 1e-6, llamacpp: { models: { moe } } }); clearInterval(e.idleTimer); e.beNo = () => 46; e.totalRam = () => 32 * GB; e.said = []; e.log = (_k, t) => e.said.push(t); return e; };
  const pc = pcNow({ gpuVramGB: 1e-6 }, { beNo: 46, ramBytes: 32 * GB });
  const plain = mk(); const a0 = plain.buildArgs('moe');
  check('no profile: GUPPI loads as before (copy cache on, reads up to the read step)', a0.includes('--moe-cache-mib') && plain.condMax > 2048, a0.join(' '));
  saveProfile({ dataDir: d }, { v: 1, pc, brains: { moe: { cap: 2048, keepBob: false } } });
  const capped = mk(); capped.buildArgs('moe');
  check('the profile\'s edge caps GUPPI\'s step for that brain, and the logbook says so', capped.condMax <= 2048 && capped.said.some((t) => /GUPPI calibration: reading step at most 2048/.test(t)), capped.said.join(' | '));
  saveProfile({ dataDir: d }, { v: 1, pc, brains: { moe: { cap: 6144, keepBob: true } } });
  const keep = mk(); const a2 = keep.buildArgs('moe');
  check('GUPPI didn\'t beat Bob\'s pick here: no copy cache and no step past Bob\'s', !a2.includes('--moe-cache-mib') && keep.condMax === keep.condChat && keep.said.some((t) => /keeps Bob's step/.test(t)), a2.join(' '));
  saveProfile({ dataDir: d }, { v: 1, pc: { ...pc, be: 45 }, brains: { moe: { cap: 2048, keepBob: true } } });
  const stale = mk(); const a3 = stale.buildArgs('moe');
  check('a profile from another engine build isn\'t used, and the logbook says to calibrate again', a3.includes('--moe-cache-mib') && stale.said.some((t) => /isn't used: it was made with Brain Engine 45.*Calibrate again/.test(t)));
  fs.rmSync(d, { recursive: true, force: true });
}


// ---------- throttle reasons (Nov 26, the owner: logged with every run, and GUPPI adjusts for them) ----------
{
  const t = parseThrottle('0x0000000000000024\r\n');
  check('throttle reasons: the driver\'s bit mask in plain names', t.mask === 0x24 && t.ids.join() === 'power-cap,sw-thermal' && t.hot === true && t.hard === false);
  check('the power cap alone or an idle card isn\'t heat; the hardware brakes are hard', parseThrottle('0x4').hot === false && parseThrottle('0x1').hot === false && parseThrottle('0x40').hard && parseThrottle('0x80').hard && parseThrottle('0x8').hard);
  check('nothing or [N/A] read is null', parseThrottle('') === null && parseThrottle('[N/A]') === null && parseThrottle(null) === null);
  const asked = [];
  const r = await readThrottle(async (args) => { asked.push(args[0]); return args[0].includes('event') ? '[N/A]' : '0x20'; });
  check('the newer field name first, the older one on older drivers', r.ids.join() === 'sw-thermal' && asked.join() === '--query-gpu=clocks_event_reasons.active,--query-gpu=clocks_throttle_reasons.active');
  let st = heatStep(null, parseThrottle('0x20'), 1000);
  check('hot as soon as a heat reason shows, with why', st.hot && st.since === 1000 && /driver thermal slowdown/.test(st.why));
  st = heatStep(st, parseThrottle('0x4'), 2000);
  check('a clear reading doesn\'t end it at once', st.hot && st.clearSince === 2000);
  check('an unknown reading changes nothing', heatStep(st, null, 99999).hot === true);
  check('heat again restarts the clear clock', heatStep(st, parseThrottle('0x40'), 3000).clearSince === 0);
  check('clear for a minute: carries on as before', heatStep(st, parseThrottle('0x0'), 2000 + CLEAR_MS).hot === false);
  check('calibrating: a hardware brake stops the try like 90 C', /^heat: the driver slowed the card \(hardware thermal slowdown\)/.test(tripWhy({ throttle: parseThrottle('0x40') })) && tripWhy({ throttle: parseThrottle('0x24') }) === '');
}
{
  const lab = mkLab({ speeds: fast, throttle: (cur) => (cur === '4096:true' ? '0x24' : cur === '6144:true' ? '0x44' : '0x4') });
  await startGuppiCalibrate(lab, { model: 'slowed', osKey: 'windows' }); await wait(lab);
  const b = readProfile(lab.cfg).brains.slowed;
  check('each try logs the driver\'s throttle reasons beside temperature and clocks', b.rows.find((x) => x.id === 'g4096').throttle.join() === 'power-cap,sw-thermal' && b.rows.find((x) => x.id === 'bob').throttle.join() === 'power-cap' && Array.isArray(readProfile(lab.cfg).pc.idleThrottle));
  check('a hardware thermal brake stops that try as heat, and nothing after it runs', /^heat: the driver slowed/.test(b.rows.find((x) => x.id === 'g6144').trip) && b.cap === 4096);
  const html = guppiCalHtml(guppiCalView(lab.cfg, lab, readProfile(lab.cfg).pc), { models: ['slowed'], pick: 'slowed' });
  check('Settings shows when the driver slowed the card (not for the normal power cap)', /the driver slowed the card \(sw-thermal\)/.test(html) && !/slowed the card \(power-cap\)/.test(html));
}
{
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-guppi-heat-'));
  const e = new LlamaCpp({ agentDir: d, dataDir: d, llamacpp: { models: { moe } } }); clearInterval(e.idleTimer); e.beNo = () => 46;
  const said = []; e.log = (_k, t) => said.push(t);
  let reading = '0x24'; e.throttleRead = async () => parseThrottle(reading);
  const switched = []; e.condSwitch = async (_m, step) => { switched.push(step); e.condStep = step; return true; };
  Object.assign(e, { condChat: 2048, condStep: 4096, condMax: 4096, condCacheBase: 4096, current: 'moe', slotDir: d, child: { exitCode: null }, active: 1, condHeld: 0 });
  const msgs = [{ role: 'user', content: 'x'.repeat(60000) }];
  await e.conduct({ model: 'moe', messages: msgs, tools: [], task: 'chat' });
  check('GUPPI live: the card slowed for heat, so he steps back to the chat step and says why', switched.join() === '2048' && said.some((t) => /GUPPI: the card is slowed \(driver thermal slowdown\), so he backs off to the chat step 2048/.test(t)), said.join(' | '));
  switched.length = 0; e.heatAt = 0;
  await e.conduct({ model: 'moe', messages: msgs, tools: [], task: 'chat' });
  check('while it stays slowed he takes no bigger step for a long read', switched.length === 0);
  reading = '0x4'; e.heatAt = 0; await e.guppiHot('moe');
  e.heatAt = 0; e.heat.clearSince = Date.now() - CLEAR_MS - 1; await e.guppiHot('moe');
  check('clear for a minute: he carries on as before, and says so', e.heat.hot === false && said.some((t) => /clear of heat and power limits for a minute/.test(t)));
  check('he reads the card at most every 10 s', await (async () => { let n = 0; e.throttleRead = async () => { n++; return null; }; e.heatAt = 0; await e.guppiHot('moe'); await e.guppiHot('moe'); return n === 1; })());
  fs.rmSync(d, { recursive: true, force: true });
}
// ---------- wiring, Help ----------
{
  const srv = read('src/server.js'), help = read('public/help-content.js'), eng = read('public/cellar-engines.js'), cel = read('public/cellar.js');
  check('the routes: GET the view, POST start, stop and forget, from this computer only', /p === '\/api\/guppi-cal'\)/.test(srv) && /\/api\/guppi-cal\/start/.test(srv) && /\/api\/guppi-cal\/stop/.test(srv) && /\/api\/guppi-cal\/forget/.test(srv) && /GUPPI can only be calibrated on this computer itself/.test(srv));
  check('the box sits under Let the Conductor drive and is mounted', /guppi-cal-box/.test(eng) && /mountGuppiCal\(dlg\.querySelector\('\.guppi-cal-box'\)\)/.test(cel));
  check('Help: the setting, an FAQ and a glossary entry, with where it doesn\'t run', /set\('GUPPI calibrates this PC'/.test(help) && /id: 'faq-guppi-calibrate'/.test(help) && /<dt>GUPPI calibrates this PC<\/dt>/.test(help) && /not on a Mac or my Android app/.test(help));
  check('nothing runs until pressed: no timer or start-up hook calls it', !/startGuppiCalibrate/.test(read('src/llamacpp.js')) && (srv.match(/startGuppiCalibrate\(/g) || []).length === 1);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
