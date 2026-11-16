import fs from 'node:fs';
// 1.5.205 Calibrate (the Brains page): time one brain on this replicant matrix a few ways and say which was fastest.
// Each try starts the brain in a trial engine of its own, asks one fixed question, reads the words a second, and
// stops it again: first as Auto does it (the engine fits the brain to the card), then by hand with more and more
// layers' experts waiting in memory. The result is a recommendation only: nothing is changed until the owner
// presses "Use recommended". Only for brains made of experts that the built-in engine runs. It keeps the card and
// the processor busy, so it asks before unloading a brain that is in use, never runs beside another Lab job, and
// waits while Gaming is on. Nothing is downloaded and nothing leaves this replicant matrix.
// Results (small) in <data>/lab/calibrate/<brain>.json: [{ at, ctx, rows: [{ id, cpuMoe, tps, firstWordS, failed }], best,
//   speedRows, speed }].
// Nov 16 (the owner: "an automatic calibration for performance, as well as configurable, manual switches"): after the
// placement tries, the best placement is timed again with each Reading speed (Normal, Faster, Fastest) and, for a
// brain with its own guesser, with Turbo. Each speed try reads one long prompt (about 8,000 tokens: reading speed and
// time to the first word) and writes one short answer (writing speed, and for Turbo how many guesses were kept).
// Then, with Brain Engine on llama.cpp b12359 or newer, the hot-expert profiles: the brain reads the fixed mix of each
// kind of work (src/hot-experts-mix.js) with the expert trace on, the picks are counted, and one profile per kind is
// saved; then one more try times the cache filled from the mixed profile against Normal.
// Lock brain memory isn't timed here: it helps the first reply after a long break, which a few minutes can't show.
import path from 'node:path';
import { labDir, slugOf } from './lab.js';
import { startServer } from './lab-test.js';
import { ggufInfo } from './gguf.js';
import { draftNumArgs, TURBO_EVERYDAY_MAX, READING_STEPS } from './engine-extras.js';
import { BRAIN_ENGINE_PIN } from './engines.js';
import { HOT_KINDS, mixFor, addMass, saveProfile, profileStamp, rankingFile, hotCacheMB, parseCacheLog, RANKING_ENV } from './hot-experts.js';
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

// ---- Speed options (Reading speed, Turbo), timed on the best placement ----
// One fixed long prompt: the same paragraph many times over (about 8,000 tokens with Qwen's words), then a short ask.
const CAL_PARA = 'A bicycle gear system moves the chain between sprockets of different sizes. A small front ring with a large rear sprocket makes pedalling light for climbing hills, while a large front ring with a small rear sprocket makes each turn of the pedals carry the bike further on flat roads. The derailleurs push the chain sideways when the rider shifts, and the chain climbs onto the next sprocket as the pedals turn. ';
export const CAL_LONG = CAL_PARA.repeat(90) + '\n\nIn one sentence, what does the text above explain?';
export function calSpeedTries({ mtp = 0 } = {}) {
  const r = (pick, n, label) => ({ id: `read-${pick}`, reading: pick, extra: n ? ['-b', String(n), '-ub', String(n)] : [], label });
  const out = [r('normal', 0, 'Reading speed Normal (512 at a time)'), r('faster', READING_STEPS.faster, 'Reading speed Faster (2,048 at a time)'), r('fastest', READING_STEPS.fastest, 'Reading speed Fastest (4,096 at a time)')];
  if (mtp > 0) out.push({ id: 'turbo', turbo: true, extra: ['--spec-type', 'draft-mtp', ...draftNumArgs(0, TURBO_EVERYDAY_MAX)], label: 'Turbo: the brain\'s own guesser' });
  return out;
}
// The recommendation: the reading speed that reads the long prompt fastest, if it beats Normal by more than 10% and
// keeps writing within 10% of Normal's; Turbo when it writes more than 5% faster than Normal.
// -> { reading, turbo, why } or null when Normal didn't run.
export function calSpeedBest(rows) {
  const ok = rows.filter((r) => !r.failed && r.tps > 0);
  const base = ok.find((r) => r.id === 'read-normal');
  if (!base) return null;
  const reads = ok.filter((r) => r.reading && r.readTps > 0 && r.tps >= base.tps * 0.9).sort((a, b) => b.readTps - a.readTps);
  const top = reads[0] && reads[0].reading !== 'normal' && reads[0].readTps > (base.readTps || 0) * 1.1 ? reads[0] : base;
  const t = ok.find((r) => r.id === 'turbo');
  const turbo = Boolean(t && t.tps > base.tps * 1.05);
  const name = { normal: 'Normal', faster: 'Faster', fastest: 'Fastest' }[top.reading];
  const readWhy = top === base ? `Reading speed Normal: bigger pieces didn't read the long prompt more than 10% faster without slowing writing (${base.readTps} tokens a second).` : `Reading speed ${name}: read the long prompt at ${top.readTps} tokens a second against ${base.readTps} on Normal (first word ${top.firstWordS} s against ${base.firstWordS} s), writing ${top.tps} against ${base.tps}.`;
  const turboWhy = !t ? '' : turbo ? ` Turbo on: ${t.tps} words a second against ${base.tps}${t.accepted != null ? `, ${t.accepted}% of its guesses kept` : ''}.` : ` Turbo off: ${t.tps} words a second against ${base.tps}, not enough to be worth it.`;
  return { reading: top.reading, turbo, why: readWhy + turboWhy };
}

// The Brain Engine patches this Bob carries (engine/patches), for the profile stamp.
export const enginePatches = (dir = new URL('../engine/patches/', import.meta.url)) => { try { return fs.readdirSync(dir).filter((f) => /^\d{4}-.*\.patch$/.test(f)).map((f) => f.replace(/\.patch$/, '')).sort(); } catch { return []; } };
export const HOT_STEPS = [{ id: 'hot-count', label: 'Hot experts: count the picks on each kind of work' }, { id: 'hot-time', label: 'Hot experts: time the card cache filled from them' }];
// One answer with the expert trace and its mass (patches 0002 and 0009): how many times each expert was picked.
export async function traceOnce(url, messages, { maxTokens = 96, signal, timeoutMs = 600e3 } = {}) {
  const res = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, temperature: 0, max_tokens: maxTokens, cache_prompt: false, expert_trace: true, expert_trace_mass: true, chat_template_kwargs: { enable_thinking: false } }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`The brain answered ${res.status}`);
  return res.json();
}

// Why this brain can't be calibrated here, or '' when it can. hasExperts comes from the page's own rule (place.js).
export function calLock(lab, model, { experts = true } = {}) {
  if (lab.cfg.engine !== 'llamacpp') return 'Calibrating needs my built-in engine.';
  if (!experts) return 'This brain has no experts to move, so there is nothing to calibrate: Auto already fits it.';
  const info = lab.brain?.engine?.placeInfo?.(model) || null;
  if (!info?.layers) return 'I couldn\'t read this brain\'s layers from its file, so there is nothing to calibrate: Auto places it.';
  if (!lab.tools().server.found) return 'The engine\'s program isn\'t on this replicant matrix yet.';
  return '';
}

// Every brain that has a calibration result on this replicant matrix (its id, from the newest record of each file).
export function calibrated(cfg) {
  let names = []; try { names = fs.readdirSync(calibrateDir(cfg)); } catch { return []; }
  return names.filter((n) => n.endsWith('.json')).map((n) => readJson(path.join(calibrateDir(cfg), n), [])[0]?.model).filter((m) => typeof m === 'string' && m).slice(0, 64);
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
  const fx = { serve: (o) => startServer({ exe, log, ...o }), chat: chatOnce, trace: traceOnce, ...lab.stepFns };
  const plans = list.map((b) => { const r = lab.brain.engine.resolve(b.model); const info = ggufInfo(r.gguf); const layers = info?.shape?.layers || lab.brain.engine.placeInfo(b.model).layers; return { ...b, name: b.name || b.model, gguf: r.gguf, layers, tries: calTries(layers), speedTries: calSpeedTries({ mtp: info?.mtp || 0 }), hot: (lab.brain.engine.buildNo?.() || 0) >= 12359 }; });
  const steps = plans.flatMap((p, i) => [...p.tries, ...p.speedTries, ...(p.hot ? HOT_STEPS : [])].map((t) => [`${i}:${t.id}`, plans.length > 1 ? `${p.name}: ${t.label}` : t.label]));
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
      const best = calBest(rows);
      // The speed options, on the placement that won (Auto when nothing ran).
      const place = best?.mode === 'hand' ? ['--n-cpu-moe', String(best.cpuMoe), '-ngl', '999'] : null;
      const speedRows = [];
      for (const t of p.speedTries) {
        const id = `${i}:${t.id}`;
        set(id, 'running');
        let row = { id: t.id, reading: t.reading || null, turbo: t.turbo === true };
        let srv = null;
        try {
          srv = await fx.serve({ gguf: p.gguf, ctx: CAL_CTX, signal, cpuOk: false, extra: t.extra, ...(place ? { place } : {}) });
          const long = await fx.chat(srv.url, [{ role: 'user', content: CAL_LONG }], { maxTokens: 24, signal });
          const short = await fx.chat(srv.url, msg, { maxTokens: 200, signal });
          const dn = Number(short.timings?.draft_n) || 0, da = Number(short.timings?.draft_n_accepted) || 0;
          row = { ...row, readTps: round1(Number(long.timings?.prompt_per_second) || 0), firstWordS: long.timings?.prompt_ms ? round1(long.timings.prompt_ms / 1000) : null, tps: round1(Number(short.timings?.predicted_per_second) || 0), ...(t.turbo && dn ? { accepted: Math.round((100 * da) / dn) } : {}) };
          if (!(row.tps > 0)) row.failed = 'It answered, but gave no speed.';
        } catch (e) {
          if (signal.aborted) throw e;
          row.failed = 'Didn\'t start: too much for the card this way.';
        } finally { try { srv?.stop(); } catch {} }
        speedRows.push(row);
        set(id, row.failed ? 'failed' : 'done');
        progress((100 * ++done) / total);
      }
      // Hot experts: count the picks on each kind's mix, save the profiles, then time the cache filled from the mixed one.
      let hot = null;
      if (p.hot) {
        hot = { profiles: [], tps: null };
        const mb = hotCacheMB(lab.cfg) || 4096;
        const cacheArgs = ['--moe-cache-mib', String(mb), '--moe-cache-cpu-share', '1', '-lv', '4']; // -lv 4: the fingerprint is an info line
        let fingerprint = '';
        const stamp = (kind) => profileStamp({ kind, gguf: p.gguf, fingerprint, engine: `b${lab.brain.engine.buildNo?.() || 0}${BRAIN_ENGINE_PIN?.tag ? ` (Bob pins ${BRAIN_ENGINE_PIN.tag})` : ''}`, patches: enginePatches() });
        set(`${i}:hot-count`, 'running');
        let srv = null;
        try {
          // Two loads: the engine prints the brain's fingerprint only with the cache on, and Brain Engine 9 sends back
          // no expert trace while the cache is on (found on the PC Nov 16). So one load with the cache for the
          // fingerprint, then the counting load without it (the cache doesn't change which experts are picked).
          srv = await fx.serve({ gguf: p.gguf, ctx: CAL_CTX, signal, cpuOk: false, extra: cacheArgs, ...(place ? { place } : {}) });
          fingerprint = parseCacheLog(srv.cacheLog?.() || '').fingerprint;
          try { srv.stop(); } catch {}
          srv = null;
          if (!fingerprint) throw Object.assign(new Error('no fingerprint'), { why: 'The engine didn\'t print the brain\'s fingerprint (Brain Engine 9 or newer needed), so no profile was made.' });
          srv = await fx.serve({ gguf: p.gguf, ctx: CAL_CTX, signal, cpuOk: false, ...(place ? { place } : {}) });
          for (const kind of HOT_KINDS.slice(1)) {
            const acc = [];
            for (const ask of mixFor(kind)) addMass(acc, (await fx.trace(srv.url, [{ role: 'user', content: ask }], { maxTokens: 96, signal }))?.expert_trace);
            if (acc.length) hot.profiles.push(saveProfile(lab.cfg, p.model, acc, stamp(kind)));
            hot[kind] = acc;
          }
          const mixed = [];
          for (const kind of HOT_KINDS.slice(1)) (hot[kind] || []).forEach((row, il) => (row || []).forEach((n, e) => { mixed[il] = mixed[il] || []; mixed[il][e] = (mixed[il][e] || 0) + (n || 0); }));
          if (mixed.length) hot.profiles.push(saveProfile(lab.cfg, p.model, mixed, stamp('mixed')));
          for (const kind of HOT_KINDS.slice(1)) delete hot[kind];
          set(`${i}:hot-count`, hot.profiles.length ? 'done' : 'failed');
        } catch (e) {
          if (signal.aborted) throw e;
          hot.failed = e.why || 'The trace didn\'t come back, so no profile was made.';
          set(`${i}:hot-count`, 'failed');
        } finally { try { srv?.stop(); } catch {} }
        progress((100 * ++done) / total);
        set(`${i}:hot-time`, 'running');
        srv = null;
        try {
          if (!hot.profiles.some((x) => x.kind === 'mixed')) throw new Error('no profile');
          srv = await fx.serve({ gguf: p.gguf, ctx: CAL_CTX, signal, cpuOk: false, extra: cacheArgs, env: { [RANKING_ENV]: rankingFile(lab.cfg, p.model, 'mixed') }, ...(place ? { place } : {}) });
          const said = parseCacheLog(srv.cacheLog?.() || '');
          if (said.refused) throw Object.assign(new Error('refused'), { why: `The engine refused the profile: ${said.refused}.` });
          hot.filled = said.filled;
          const a = await fx.chat(srv.url, msg, { maxTokens: 200, signal });
          hot.tps = round1(Number(a.timings?.predicted_per_second) || 0);
          hot.mb = mb;
          set(`${i}:hot-time`, hot.tps > 0 ? 'done' : 'failed');
        } catch (e) {
          if (signal.aborted) throw e;
          hot.timeFailed = e.why || 'Didn\'t start with the cache: too much for the card this way.';
          set(`${i}:hot-time`, 'failed');
        } finally { try { srv?.stop(); } catch {} }
        progress((100 * ++done) / total);
        const base = speedRows.find((x) => x.id === 'read-normal' && !x.failed);
        hot.on = Boolean(base && hot.tps > base.tps * 1.05);
        hot.why = !hot.tps ? (hot.failed || hot.timeFailed || 'Hot experts weren\'t timed.') : hot.on ? `Hot experts on: ${hot.tps} words a second with ${Math.round(hot.mb / 1024 * 10) / 10} GB of the card for them, against ${base.tps} without.` : `Hot experts off: ${hot.tps} words a second against ${base?.tps ?? '?'} without, not enough to be worth it.`;
      }
      const rec = { at: lab.now(), when: new Date(lab.now()).toISOString().slice(0, 10), model: p.model, name: p.name, layers: p.layers, ctx: CAL_CTX, rows, best, speedRows, speed: calSpeedBest(speedRows), ...(hot ? { hot } : {}) };
      const file = path.join(calibrateDir(lab.cfg), `${slugOf(p.model)}.json`);
      writeJson(file, [rec, ...readJson(file, [])].slice(0, 10));
      out.push(rec);
    }
    return { calibrate: out, saw: out.map((x) => `${x.name}: ${x.best ? x.best.why : 'no try ran.'}${x.speed ? ' ' + x.speed.why : ''}${x.hot ? ' ' + x.hot.why : ''}`).join(' ') };
  });
}

// "Use recommended": save the newest result's recommendation as this brain's placement.
export function useCalibrated(lab, model) {
  const rec = calResult(lab.cfg, model);
  if (!rec?.best) throw new Error('This brain has no calibration result yet.');
  const cur = lab.cfg.brainPlace?.[model] || {};
  const set = rec.best.mode === 'hand' ? { mode: 'hand', cpuMoe: rec.best.cpuMoe } : { ...cur, mode: 'auto' };
  saveSettings(lab.cfg, { brainPlace: { ...(lab.cfg.brainPlace || {}), [model]: set } });
  // Nov 16: the speed options too, for this brain only. Turbo only goes on (a Turbo set by hand is never switched off).
  if (rec.hot?.on && lab.cfg.hotExperts !== true) saveSettings(lab.cfg, { hotExperts: true });
  if (rec.speed) {
    saveSettings(lab.cfg, { readingFor: { ...(lab.cfg.readingFor || {}), [model]: rec.speed.reading } });
    if (rec.speed.turbo && !lab.cfg.llamacpp?.turbo?.[model]?.on) saveSettings(lab.cfg, { llamacpp: { turbo: { ...(lab.cfg.llamacpp?.turbo || {}), [model]: { on: true, mtp: true, max: TURBO_EVERYDAY_MAX } } } });
  }
  return { ok: true, set: lab.cfg.brainPlace[model], reading: lab.cfg.readingFor?.[model] || null, turbo: lab.cfg.llamacpp?.turbo?.[model]?.on === true, hotExperts: lab.cfg.hotExperts === true };
}
