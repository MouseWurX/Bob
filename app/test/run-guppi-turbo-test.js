// Nov 26 GUPPI's Turbo pass and the Turbo trick parts (src/turbo-parts.js, src/guppi-calibrate.js, src/engine-extras.js,
// src/llamacpp.js turboCfg/startEnv, model-lab/turbo-start.mjs). No real engine, card or RAM: a fake Lab in a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { turboParts, sameStart, turboTricksOn, withTurboDrop, TURBO_TRICKS } from '../src/turbo-parts.js';
import { turboExperts, turboStandins, turboDriveStandins, turboKeepGuesses, memTypeOf, sinkEnv } from '../src/engine-extras.js';
import { turboTries, turboVerdict, startGuppiCalibrate, guppiCalView, TRICK_MARGIN, TURBO_SAMPLING } from '../src/guppi-calibrate.js';
import { profileFor, pcNow, saveProfile, readProfile } from '../src/guppi-profile.js';
import { guppiCalHtml } from '../public/guppi-cal.js';
import { writeGgufFrom } from '../src/lab-gguf.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { MATRIX_ROWS, rowCfg, rowStart } from '../model-lab/turbo-start.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const caps = { q3: true, q2: true, tiers: true, sink: true };

// ---------- the tricks ----------
{
  check('Turbo off: no tricks', turboTricksOn({}).length === 0 && turboTricksOn({ turbo: false, turboSink: true }).length === 0);
  const all = { turbo: true, turboStandins: true, turboDriveStandins: true, turboKeepGuesses: true, turboSink: true };
  check('every switched-on trick by name; stand-ins win over never wait on the drive', turboTricksOn(all).join() === 'mem,experts,standins,keepGuesses,sink' && turboTricksOn({ turbo: true, turboDriveStandins: true }).join() === 'mem,experts,driveStandins');
  check('4 experts per word switched off is not a trick that is on', !turboTricksOn({ turbo: true, turboExperts: false }).includes('experts'));
  const d = withTurboDrop(all, ['standins', 'sink', 'nonsense']);
  check('a left-out trick is off, the rest stay, Turbo stays on', d.turbo === true && d.turboDrop.join() === 'standins,sink' && !turboStandins(d) && turboExperts(d) && turboKeepGuesses(d) && !sinkEnv(d, 'm', 32768, caps).LLAMA_KV_SINK);
  check('nothing to leave out, or Turbo off: the same settings', withTurboDrop(all, []) === all && withTurboDrop({ turbo: false }, ['mem']).turboDrop === undefined);
  check('leaving out stand-ins doesn\'t switch never wait on the drive on untested', turboDriveStandins(withTurboDrop(all, ['standins'])) === false && turboDriveStandins(withTurboDrop({ turbo: true, turboDriveStandins: true }, [])) === true);
  const nm = withTurboDrop({ turbo: true, turboMem: 'progressive82', brainMemType: { m: 'progressive82' } }, ['mem']);
  check('leaving out Turbo chat memory goes back to the brain\'s own pick (2-bit stays Turbo only)', memTypeOf({ turbo: true, turboMem: 'smallest' }, 'm', caps) === 'smallest' && memTypeOf(withTurboDrop({ turbo: true, turboMem: 'smallest', brainMemType: { m: 'sharp' } }, ['mem']), 'm', caps) === 'sharp' && memTypeOf(nm, 'm', caps) === 'standard');
  check('every trick has a plain name', TURBO_TRICKS.length === 6);
}

// ---------- a trick as parts of a start ----------
{
  const cfg = { turbo: true, turboStandins: true, turboSink: true, turboKeepGuesses: true };
  const p = turboParts(cfg, 'm', { caps, ctx: 32768, args: ['--moe-cache-mib', '4096'], be: 47, build: 12359 });
  check('Turbo: 4-bit chat memory, stand-ins (with the copy cache), sharp start, 4 experts per word', p.extra.join(' ') === '-fa on -ctk q4_0 -ctv q4_0' && p.env.LLAMA_MOE_STANDIN === 'rank' && p.env.LLAMA_KV_SINK === 'f16:128' && p.perWord === true && p.mem === 'small', JSON.stringify(p));
  check('no copy cache: no stand-ins', !turboParts(cfg, 'm', { caps, ctx: 32768, be: 47 }).env.LLAMA_MOE_STANDIN);
  check('keep more guesses with no drafter: nothing, so it does nothing here', sameStart(turboParts(cfg, 'm', { caps, ctx: 32768, be: 47 }), turboParts(withTurboDrop(cfg, ['keepGuesses']), 'm', { caps, ctx: 32768, be: 47 })));
  const mtp = turboParts(cfg, 'm', { caps, ctx: 32768, be: 47, build: 12359, mtp: ['--spec-type', 'draft-mtp'] });
  check('with the brain\'s own guesser: MTP 8 ahead, sampled guesses and the keep key', mtp.extra.includes('draft-mtp') && mtp.extra.join(' ').includes('--spec-draft-n-max 8') && mtp.extra.join(' ').includes('--spec-draft-sampling probabilistic') && mtp.env.LLAMA_SPEC_MB === '1', JSON.stringify(mtp));
  const noKeep = turboParts(withTurboDrop(cfg, ['keepGuesses']), 'm', { caps, ctx: 32768, be: 47, build: 12359, mtp: ['--spec-type', 'draft-mtp'] });
  check('left out, MTP still drafts (checked exactly), so only the keeping is measured', noKeep.extra.includes('draft-mtp') && !noKeep.extra.includes('--spec-draft-sampling') && !noKeep.env.LLAMA_SPEC_MB);
  const prog = turboParts({ turbo: true, turboMem: 'progressive83', turboSink: true }, 'm', { caps, ctx: 65536, be: 47 });
  check('Progressive 8+3: 3-bit base, the 8-bit ring, and the sharp start beside it', prog.extra.join(' ') === '-fa on -ctk q3_0 -ctv q3_0' && prog.env.LLAMA_KV_TIERS === 'q8_0:2048' && prog.env.LLAMA_KV_SINK === 'f16:128', JSON.stringify(prog));
}

// ---------- the verdict ----------
{
  const t = turboTries(['mem', 'experts', 'standins'], { step: 4096, cache: true });
  check('the pass: every trick on first, then each left out once, at GUPPI\'s step', t.map((x) => x.id).join() === 'turbo-all,turbo-no-mem,turbo-no-experts,turbo-no-standins' && t.every((x) => x.step === 4096 && x.cache) && turboTries([]).length === 0);
  const all = { id: 'turbo-all', readTps: 3000, tps: 80 };
  const v = turboVerdict([all, { id: 'turbo-no-mem', readTps: 2900, tps: 70 }, { id: 'turbo-no-experts', readTps: 3000, tps: 79 }, { id: 'turbo-no-standins', readTps: 3000, tps: 81 }, { id: 'turbo-no-sink', failed: 'x' }], ['mem', 'experts', 'standins', 'sink', 'keepGuesses'], { noEffect: ['keepGuesses'] });
  check('a trick that adds 3% stays; one that adds less, costs speed or does nothing is left out', v.keep.join() === 'mem,sink' && v.drop.join() === 'experts,standins,keepGuesses' && v.gains.mem > TRICK_MARGIN && v.gains.standins < 0, JSON.stringify(v));
  check('it says why, and that answers are the real-jobs test\'s call', /keep more guesses does nothing on this start/.test(v.why) && /real-jobs test/.test(v.why) && /stand-ins cost/.test(v.why));
  const bad = turboVerdict([{ id: 'turbo-all', trip: 'card: x' }, { id: 'turbo-no-mem', failed: 'x' }, { id: 'turbo-no-standins', readTps: 2000, tps: 60 }], ['mem', 'standins']);
  check('every trick on trips a safety line: the trick whose leaving out runs safely is left out', bad.drop.join() === 'standins' && bad.keep.join() === 'mem');
  const none = turboVerdict([{ id: 'turbo-all', failed: 'x' }, { id: 'turbo-no-mem', failed: 'x' }], ['mem']);
  check('nothing ran safely: every trick is left out for that brain', none.drop.join() === 'mem' && /every trick is left out/.test(none.why));
  check('keep more guesses is timed above temperature 0, with a fixed seed', TURBO_SAMPLING.temperature > 0 && Number.isInteger(TURBO_SAMPLING.seed));
}

// ---------- the job, with a made-up engine and card ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob guppi turbo '));
const moe = path.join(tmp, 'moe.gguf');
{ const buf = Buffer.alloc(4096); await writeGgufFrom(moe, { kvs: [{ key: 'general.architecture', type: 8, value: 'qwen3moe' }, { key: 'qwen3moe.block_count', type: 4, value: 2 }, { key: 'qwen3moe.expert_count', type: 4, value: 8 }], tensors: [{ name: 'blk.0.ffn_up_exps.weight', dims: [32, 16, 2], type: 0, bytes: buf.length, data: async () => buf }] }); }
const runs = new Map(); let n = 0;
const mkLab = (cfgMore = {}) => {
  const served = [];
  const lab = {
    cfg: { dataDir: tmp, settingsFile: path.join(tmp, 'settings.json'), engine: 'llamacpp', gpuVramGB: 1e-6, ...cfgMore }, job: null, runs: [], served,
    now: () => 1795700000000, save() {}, tell() {}, broadcast() {}, runView: (r) => r, stop() {},
    tools: () => ({ server: { path: 'llama-server', found: true } }),
    brain: { engine: { resolve: () => ({ gguf: moe }), beNo: () => 47, buildNo: () => 12359, memCaps: () => caps, loaded: async () => [], unloadAll: async () => {}, guppiReload: () => {}, recentPrompts: [] } },
    guppiFns: {
      serve: async (o) => { served.push(o); const url = `fake:${++n}`; runs.set(url, { o, perWord: false }); return { url, stop() {} }; },
      perWord: async (url) => { runs.get(url).perWord = true; return 4; },
      chat: async (url, msgs, { maxTokens, temperature }) => {
        const { o, perWord } = runs.get(url); const x = o.extra.join(' '), e = o.env || {};
        const step = Number(x.match(/-ub (\d+)/)?.[1] || 512), cache = x.includes('--moe-cache-mib');
        let read = step === 4096 && cache ? 3000 : cache ? 1100 : 1000, write = cache ? 72 : 60;
        if (x.includes('-ctk q4_0')) { write *= 1.2; read *= 1.05; }
        if (perWord) write *= 1.15;
        if (e.LLAMA_MOE_STANDIN) write *= 1.01;
        if (e.LLAMA_KV_SINK) write *= 0.99;
        lab.temps = [...(lab.temps || []), temperature];
        return { text: 'w', timings: maxTokens === 24 ? { prompt_per_second: read, prompt_ms: 4000 } : { predicted_per_second: write } };
      },
      health: async () => ({ gpu: 'Test card', tempC: 40, smMHz: 2800, memMHz: 14000, freeMiB: null, totalMiB: 16303 }),
      card: async () => ({ freeMB: 900, totalMB: 16303, others: [] }),
      ram: () => 12000, shared: async () => null, sleep: async () => {}, watchMs: 0
    }
  };
  return lab;
};
const wait = async (lab) => { for (let i = 0; i < 800 && lab.job; i++) await new Promise((r) => setTimeout(r, 5)); };
{
  const lab = mkLab({ turbo: true, turboStandins: true, turboSink: true, turboKeepGuesses: true });
  const r = await startGuppiCalibrate(lab, { model: 'big', osKey: 'windows' });
  check('Turbo on: the job adds the Turbo pass after GUPPI\'s steps', r.started.steps.map((s) => s.id).join() === 'pc,bob,g512,g4096,g6144,turbo-all,turbo-no-mem,turbo-no-experts,turbo-no-standins,turbo-no-keepGuesses,turbo-no-sink,save', r.started.steps.map((s) => s.id).join());
  await wait(lab);
  const b = readProfile(lab.cfg)?.brains?.big;
  check('the pass runs at GUPPI\'s winning step with the copy cache', b?.turbo?.step === 4096 && b.turbo.cache === true && lab.runs[0].state === 'done', JSON.stringify(b?.turbo || lab.runs[0].error));
  check('Turbo chat memory and 4 experts stay; stand-ins (1%), sharp start (-1%) and keep more guesses (no drafter) are left out', b.turbo.keep.join() === 'mem,experts' && b.turbo.drop.join() === 'standins,keepGuesses,sink', JSON.stringify(b.turbo));
  check('keep more guesses with no drafter was never started: the same start', b.turbo.rows.find((x) => x.id === 'turbo-no-keepGuesses').same === true);
  check('4 experts per word was set on every try that has it, after the engine started', [...runs.values()].filter((x) => x.perWord).length === 4 && lab.served.length === 9, String(lab.served.length));
  check('the Turbo rows ran above temperature 0 (keep more guesses is on), GUPPI\'s own at 0', lab.temps.slice(-30).every((t) => t === TURBO_SAMPLING.temperature) && !lab.temps[0]);
  const now = pcNow(lab.cfg, { beNo: 47, ramBytes: os.totalmem() });
  check('at load GUPPI reads which tricks to leave out for that brain', profileFor(lab.cfg, 'big', readProfile(lab.cfg).pc).turboDrop.join() === 'standins,keepGuesses,sink');
  const view = guppiCalView(lab.cfg, lab, now);
  const html = guppiCalHtml(view, { models: ['big'], pick: 'big' });
  check('Settings shows the Turbo verdict and each Turbo try', /Turbo:<\/strong>/.test(html) && /Turbo without stand-ins/.test(html) && /the same start, so it does nothing here/.test(html), html.slice(0, 300));
  check('the job\'s summary names what GUPPI leaves out', /GUPPI leaves out stand-ins, keep more guesses, sharp start/.test(lab.runs[0].report.saw));
  fs.rmSync(path.join(tmp, 'conductor'), { recursive: true, force: true });
}
{
  const lab = mkLab({});
  const r = await startGuppiCalibrate(lab, { model: 'big', osKey: 'windows' });
  check('Turbo off: no Turbo pass, the same steps as before', !r.started.steps.some((s) => /^turbo/.test(s.id)));
  await wait(lab);
  check('and no Turbo verdict in the profile', readProfile(lab.cfg)?.brains?.big && !readProfile(lab.cfg).brains.big.turbo);
  fs.rmSync(path.join(tmp, 'conductor'), { recursive: true, force: true });
}

// ---------- the engine at load ----------
{
  const cfg = { dataDir: tmp, agentDir: tmp, turbo: true, turboStandins: true, turboSink: true, llamacpp: {} };
  const eng = new LlamaCpp(cfg); clearInterval(eng.idleTimer);
  eng.memCaps = () => caps; eng.beNo = () => 47;
  eng.guppiProfile = () => null;
  const on = eng.startEnv('m', ['--moe-cache-mib', '4096', '-fa', 'on'], { ctx: 32768 });
  check('Bob\'s start: stand-ins and the sharp start, as before', on.LLAMA_MOE_STANDIN === 'rank' && on.LLAMA_KV_SINK === 'f16:128');
  const said = []; eng.log = (k, s) => said.push(s);
  eng.guppiProfile = () => ({ cap: 4096, turboDrop: ['standins'] });
  const off = eng.startEnv('m', ['--moe-cache-mib', '4096', '-fa', 'on'], { ctx: 32768 });
  check('with this PC\'s Turbo verdict: the left-out trick is gone, the rest stay, and the logbook says why', !off.LLAMA_MOE_STANDIN && off.LLAMA_KV_SINK === 'f16:128' && said.some((s) => /GUPPI leaves out stand-ins here/.test(s)));
  eng.guppiProfile = () => ({ turboDrop: ['mem'] });
  check('Turbo chat memory left out: the room counter and the start use the brain\'s own memory', eng.turboCfg('m').turboDrop.join() === 'mem' && memTypeOf(eng.turboCfg('m'), 'm', caps) === 'standard');
  cfg.turbo = false;
  check('Turbo off: the profile changes nothing', eng.turboCfg('m') === cfg);
}

// ---------- the matrix's starts ----------
{
  const ids = MATRIX_ROWS.map((r) => r.id);
  check('the matrix: stock, lossless, each Turbo trick alone, every trick on', ids[0] === 'stock' && ids[1] === 'lossless' && ids.includes('all-on') && ids.includes('up-keys') && ['t-mem-small', 't-mem-smallest', 't-mem-p83', 't-mem-p84', 't-mem-p82', 't-experts4', 't-standins', 't-drive', 't-mtp', 't-keep', 't-sink', 't-sealed'].every((x) => ids.includes(x)), ids.join());
  check('rows are made of Bob\'s own settings', rowCfg('t-sink').turboSink === true && rowCfg('t-sink').turbo === true && rowCfg('lossless').turbo !== true && rowCfg('t-mem-small').turboExperts === false);
  const cfg = { dataDir: tmp, agentDir: tmp, gpuVramGB: 16 };
  const s = rowStart('t-sink', { cfg, gguf: moe, ctx: 65536, be: 47, build: 12359, caps, exe: path.join(tmp, 'llama-server') });
  check('a row\'s start comes from Bob\'s own buildArgs and startEnv: 4-bit memory and the sharp start', s.args.includes('q4_0') && s.env.LLAMA_KV_SINK === 'f16:128' && s.args.includes('-c') && s.args[s.args.indexOf('-c') + 1] === '65536', JSON.stringify(s).slice(0, 400));
  const l = rowStart('lossless', { cfg, gguf: moe, ctx: 65536, be: 47, build: 12359, caps, exe: path.join(tmp, 'llama-server') });
  check('lossless: Bob\'s 8-bit chat memory, no Turbo keys', l.args.join(' ').includes('-ctk q8_0') && !l.env.LLAMA_KV_SINK && !l.env.LLAMA_MOE_STANDIN && l.perWord === false);
  const sealed = rowStart('t-sealed', { cfg, gguf: moe, ctx: 65536, be: 47, build: 12359, caps, exe: path.join(tmp, 'llama-server') });
  check('sealed blocks (engine key only, no Bob setting yet): Progressive 8+3 with LLAMA_KV_BODY 3/3', sealed.env.LLAMA_KV_BODY === '3/3' && /q8_0/.test(sealed.env.LLAMA_KV_TIERS || ''));
  // a brain of experts bigger than the card (a made-up card), with its own guesser: GUPPI's copy cache and fill come in
  const mtpBrain = path.join(tmp, 'mtp.gguf');
  { const buf = Buffer.alloc(4096); await writeGgufFrom(mtpBrain, { kvs: [{ key: 'general.architecture', type: 8, value: 'qwen35moe' }, { key: 'qwen35moe.block_count', type: 4, value: 2 }, { key: 'qwen35moe.expert_count', type: 4, value: 8 }, { key: 'qwen35moe.nextn_predict_layers', type: 4, value: 1 }], tensors: [{ name: 'blk.0.ffn_up_exps.weight', dims: [32, 16, 2], type: 0, bytes: buf.length, data: async () => buf }, { name: 'blk.2.nextn.eh_proj.weight', dims: [32, 16], type: 0, bytes: 2048, data: async () => buf.subarray(0, 2048) }] }); }
  const big = { dataDir: tmp, agentDir: tmp, gpuVramGB: 1e-6 };
  const all = rowStart('all-on', { cfg: big, gguf: mtpBrain, ctx: 65536, be: 47, build: 12359, caps, exe: path.join(tmp, 'llama-server'), freeRamBytes: 24 * 2 ** 30 });
  const fl = all.args.join(' ');
  check('every trick on, on a brain bigger than the card: copy cache, fill, stand-ins, MTP with sampled guesses, sharp start, 4 experts', fl.includes('--moe-cache-mib') && all.env.LLAMA_MOE_CACHE_FILL === '1' && all.env.LLAMA_MOE_STANDIN === 'rank' && fl.includes('--spec-type draft-mtp') && fl.includes('--spec-draft-sampling probabilistic') && all.env.LLAMA_SPEC_MB === '1' && all.env.LLAMA_KV_SINK === 'f16:128' && all.perWord, fl + JSON.stringify(all.env));
  check('the Lab\'s MTP pick with GUPPI\'s fill leaves the guesser\'s room free (as everyday MTP does)', Number(all.env.LLAMA_MOE_CACHE_FILL_SPARE_MIB) > 512);
  const drive = rowStart('t-drive', { cfg: big, gguf: mtpBrain, ctx: 65536, be: 47, build: 12359, caps, exe: path.join(tmp, 'llama-server') });
  check('never wait on the drive: its key, with the copy cache', drive.env.LLAMA_MOE_STANDIN === 'drive');
  check('the stock row is plain llama.cpp flags with no Lamplight keys', rowStart('stock', { cfg, gguf: moe, ctx: 65536, be: 0, build: 12359, caps: {}, exe: path.join(tmp, 'llama-server') }).stock === true);
}

// ---------- Help ----------
{
  const h = read('public/help-content.js');
  check('Help: the Turbo pass in the setting, its FAQ and a glossary entry', /Turbo pass/.test(h) && /faq-guppi-turbo/.test(h) && /<dt>GUPPI's Turbo pass<\/dt>/.test(h));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
