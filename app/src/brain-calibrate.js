// 1.5.205 Calibrate (the Brains page): time one brain on this replicant matrix a few ways and say which was fastest.
// Each try starts the brain in a trial engine of its own, asks one fixed question, reads the words a second, and
// stops it again: first as Auto does it (the engine fits the brain to the card), then by hand with more and more
// layers' experts waiting in memory. The result is a recommendation only: nothing is changed until the owner
// presses "Use recommended". Only for brains made of experts that the built-in engine runs. It keeps the card and
// the processor busy, so it asks before unloading a brain that is in use, never runs beside another Lab job, and
// waits while Gaming is on. Nothing is downloaded and nothing leaves this replicant matrix.
// Results (small) in <data>/lab/calibrate/<brain>.json: [{ at, ctx, rows: [{ id, cpuMoe, tps, firstWordS, failed }], best }].
import path from 'node:path';
import { labDir, slugOf } from './lab.js';
import { startServer } from './lab-test.js';
import { ggufInfo } from './gguf.js';
import { saveSettings } from './config.js';
import { gaming } from './sessions.js';
import { readJson, writeJson, makeRoom, runJob, pageLog, chatOnce } from './lab-jobs.js';

export const calibrateDir = (cfg) => path.join(labDir(cfg), 'calibrate');
export const CAL_CTX = 32768; // the chat memory brains usually load with, so the card is as full as in real use
export const CAL_PROMPT = 'Explain in two short paragraphs how a bicycle gear system works, for someone who has never fixed a bike.';
const round1 = (n) => Math.round(n * 10) / 10;

// The tries for a brain with `layers` layers: Auto first, then by hand from "everything on the card" to "every
// layer's experts in memory", in five even steps.
export function calTries(layers) {
  const out = [{ id: 'auto', cpuMoe: null, label: 'Auto: the engine fits it to the card' }];
  if (!(layers > 0)) return out;
  const steps = [...new Set([0, 0.2, 0.4, 0.6, 0.8, 1].map((f) => Math.round(f * layers)))];
  for (const n of steps) out.push({ id: `m${n}`, cpuMoe: n, label: n === 0 ? 'By hand: everything on the card' : `By hand: ${n} of ${layers} layers' experts in memory` });
  return out;
}

// The recommendation from the rows that ran. By hand has to beat Auto by more than 5% to be recommended, because Auto
// also adapts when something else is using the card. -> { mode, cpuMoe?, tps, autoTps, why }
export function calBest(rows) {
  const ok = rows.filter((r) => !r.failed && r.tps > 0);
  if (!ok.length) return null;
  const auto = ok.find((r) => r.id === 'auto') || null;
  const hand = ok.filter((r) => r.id !== 'auto').sort((a, b) => b.tps - a.tps)[0] || null;
  if (hand && (!auto || hand.tps > auto.tps * 1.05)) return { mode: 'hand', cpuMoe: hand.cpuMoe, tps: hand.tps, autoTps: auto?.tps || null, why: auto ? `By hand with ${hand.cpuMoe} was fastest: about ${hand.tps} words a second against ${auto.tps} on Auto.` : `By hand with ${hand.cpuMoe} was fastest: about ${hand.tps} words a second. Auto didn't start in the test.` };
  return { mode: 'auto', tps: auto.tps, autoTps: auto.tps, why: hand ? `Auto was as fast as anything set by hand (about ${auto.tps} words a second; the best by hand was ${hand.tps}).` : `Auto ran at about ${auto.tps} words a second. Nothing set by hand started.` };
}

// Why this brain can't be calibrated here, or '' when it can. hasExperts comes from the page's own rule (place.js).
export function calLock(lab, model, { experts = true } = {}) {
  if (lab.cfg.engine !== 'llamacpp') return 'Calibrating needs my built-in engine.';
  const info = lab.brain?.engine?.placeInfo?.(model) || null;
  if (!info?.layers) return 'My built-in engine doesn\'t run this brain.';
  if (!experts) return 'This brain has no experts to move, so there is nothing to calibrate: Auto already fits it.';
  if (!lab.tools().server.found) return 'The engine\'s program isn\'t on this replicant matrix yet.';
  return '';
}

export const calResult = (cfg, model) => readJson(path.join(calibrateDir(cfg), `${slugOf(model)}.json`), [])[0] || null;

// Start one job that calibrates each brain in `brains` ([{ model, name, experts }]) in turn. One brain or all of them.
export async function startCalibrate(lab, brains = [], { unload = false } = {}) {
  if (lab.job) throw new Error('I\'m already busy with a Lab job. Wait for it, or stop it.');
  if (gaming(lab.cfg)) throw new Error('Gaming is on, so calibrating waits. Switch the session to Normal to run it.');
  const list = brains.filter((b) => b && typeof b.model === 'string' && !calLock(lab, b.model, b)).slice(0, 16);
  if (!list.length) throw new Error(brains.length === 1 ? calLock(lab, brains[0].model, brains[0]) || 'Nothing to calibrate.' : 'None of these brains can be calibrated here.');
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const log = pageLog(lab.cfg, 'calibrate');
  const exe = lab.tools().server.path;
  const fx = { serve: (o) => startServer({ exe, log, ...o }), chat: chatOnce, ...lab.stepFns };
  const plans = list.map((b) => { const r = lab.brain.engine.resolve(b.model); const layers = ggufInfo(r.gguf)?.shape?.layers || lab.brain.engine.placeInfo(b.model).layers; return { ...b, name: b.name || b.model, gguf: r.gguf, layers, tries: calTries(layers) }; });
  const steps = plans.flatMap((p, i) => p.tries.map((t) => [`${i}:${t.id}`, plans.length > 1 ? `${p.name}: ${t.label}` : t.label]));
  const total = steps.length;
  return runJob(lab, { kind: 'calibrate', name: plans.length === 1 ? `Calibrate ${plans[0].name}` : `Calibrate ${plans.length} brains`, from: plans[0].model, fromName: plans[0].name, steps }, async (r, { set, signal, progress }) => {
    const msg = [{ role: 'user', content: CAL_PROMPT }];
    const out = [];
    let done = 0;
    for (let i = 0; i < plans.length; i++) {
      const p = plans[i];
      const rows = [];
      for (const t of p.tries) {
        const id = `${i}:${t.id}`;
        set(id, 'running');
        let row = { id: t.id, cpuMoe: t.cpuMoe };
        let srv = null;
        try {
          // Auto: --fit only (no processor-only second try, which would time something else). By hand: the number, all layers offered to the card.
          srv = await fx.serve({ gguf: p.gguf, ctx: CAL_CTX, signal, cpuOk: false, ...(t.cpuMoe == null ? {} : { place: ['--n-cpu-moe', String(t.cpuMoe), '-ngl', '999'] }) });
          const a = await fx.chat(srv.url, msg, { maxTokens: 200, signal });
          row = { ...row, tps: round1(Number(a.timings?.predicted_per_second) || 0), firstWordS: a.timings?.prompt_ms ? round1(a.timings.prompt_ms / 1000) : null };
          if (!(row.tps > 0)) row.failed = 'It answered, but gave no speed.';
        } catch (e) {
          if (signal.aborted) throw e;
          row.failed = t.cpuMoe == null ? 'Didn\'t start.' : 'Didn\'t start: too much for the card this way.';
        } finally { try { srv?.stop(); } catch {} }
        rows.push(row);
        set(id, row.failed ? 'failed' : 'done');
        progress((100 * ++done) / total);
      }
      const rec = { at: lab.now(), when: new Date(lab.now()).toISOString().slice(0, 10), model: p.model, name: p.name, layers: p.layers, ctx: CAL_CTX, rows, best: calBest(rows) };
      const file = path.join(calibrateDir(lab.cfg), `${slugOf(p.model)}.json`);
      writeJson(file, [rec, ...readJson(file, [])].slice(0, 10));
      out.push(rec);
    }
    return { calibrate: out, saw: out.map((x) => `${x.name}: ${x.best ? x.best.why : 'no try ran.'}`).join(' ') };
  });
}

// "Use recommended": save the newest result's recommendation as this brain's placement.
export function useCalibrated(lab, model) {
  const rec = calResult(lab.cfg, model);
  if (!rec?.best) throw new Error('This brain has no calibration result yet.');
  const cur = lab.cfg.brainPlace?.[model] || {};
  const set = rec.best.mode === 'hand' ? { mode: 'hand', cpuMoe: rec.best.cpuMoe } : { ...cur, mode: 'auto' };
  saveSettings(lab.cfg, { brainPlace: { ...(lab.cfg.brainPlace || {}), [model]: set } });
  return { ok: true, set: lab.cfg.brainPlace[model] };
}
