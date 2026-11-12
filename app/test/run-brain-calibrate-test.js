// 1.5.205 Calibrate (src/brain-calibrate.js): the tries, the recommendation, and the job with a made-up engine.
// No real engine, card or settings: a fake Lab object in a temp folder, and scripted speeds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calTries, calBest, calLock, calResult, startCalibrate, useCalibrated, CAL_CTX } from '../src/brain-calibrate.js';
import { brainsHtml, calLock as pageLock, canCalibrate, brainsInUse } from '../public/brains.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

{
  check('the tries: Auto first, then by hand in even steps from 0 to every layer', calTries(40).map((t) => t.id).join() === 'auto,m0,m8,m16,m24,m32,m40' && calTries(3).map((t) => t.cpuMoe).join() === ',0,1,2,3' && calTries(0).length === 1);
  check('by hand is recommended only when it beats Auto by more than 5%', calBest([{ id: 'auto', tps: 60 }, { id: 'm8', cpuMoe: 8, tps: 70 }]).mode === 'hand' && calBest([{ id: 'auto', tps: 60 }, { id: 'm8', cpuMoe: 8, tps: 62 }]).mode === 'auto');
  check('a try that didn\'t start never wins; nothing ran means no recommendation', calBest([{ id: 'auto', tps: 60 }, { id: 'm0', cpuMoe: 0, tps: 999, failed: 'x' }]).mode === 'auto' && calBest([{ id: 'auto', failed: 'x' }]) === null);
  check('Auto not starting still gives a by-hand answer, and says so', /Auto didn't start/.test(calBest([{ id: 'auto', failed: 'x' }, { id: 'm8', cpuMoe: 8, tps: 40 }]).why));
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob cal '));
const mkLab = (speeds, over = {}) => {
  const served = [];
  const lab = {
    cfg: { dataDir: tmp, settingsFile: path.join(tmp, 'settings.json'), engine: 'llamacpp', brainPlace: {} }, job: null, runs: [], events: [], served,
    now: () => 1794400000000, save() {}, tell() {}, broadcast(e) { this.events.push(e); }, runView: (r) => r, stop() { if (!this.job) return { stopped: false }; this.job.ac.abort(); return { stopped: true }; },
    tools: () => ({ server: { path: 'llama-server', found: true } }),
    brain: { engine: { placeInfo: (m) => (m === 'big' ? { layers: 40 } : m === 'plain' ? { layers: 30 } : null), resolve: (m) => ({ gguf: path.join(tmp, `${m}.gguf`) }), loaded: async () => over.loaded || [], unloadAll: async () => { lab.unloaded = true; } } },
    stepFns: {
      serve: async (o) => { served.push(o); const key = o.place ? Number(o.place[1]) : 'auto'; if (speeds[key] === undefined) throw new Error('out of memory'); return { url: `fake:${key}`, stop() { served.stopped = (served.stopped || 0) + 1; }, where: 'card' }; },
      chat: async (url) => ({ text: 'ok', timings: { predicted_per_second: speeds[url.slice(5) === 'auto' ? 'auto' : Number(url.slice(5))], prompt_ms: 1200 } })
    },
    ...over.lab
  };
  return lab;
};
const wait = async (lab) => { for (let i = 0; i < 300 && lab.job; i++) await new Promise((r) => setTimeout(r, 10)); };

{
  const lab = mkLab({ auto: 60.04, 8: 71.26, 16: 66, 24: 50, 32: 41, 40: 30 }); // 0 doesn't fit the card
  const r = await startCalibrate(lab, [{ model: 'big', name: 'Big Brain', experts: true }]);
  check('it starts as one job with a step for every try', r.started?.kind === 'calibrate' && r.started.steps.length === 7 && r.started.name === 'Calibrate Big Brain');
  await wait(lab);
  const rec = calResult(lab.cfg, 'big');
  check('every try ran in its own trial engine, which was stopped again', lab.served.length === 7 && lab.served.stopped === 6);
  check('Auto is timed with the engine fitting it (no processor-only second try); by hand passes the number and offers every layer to the card', lab.served[0].place === undefined && lab.served[0].cpuOk === false && lab.served[2].place.join(' ') === '--n-cpu-moe 8 -ngl 999' && lab.served.every((o) => o.ctx === CAL_CTX));
  check('a try that didn\'t fit is written down as such, not as a speed', rec.rows.find((x) => x.id === 'm0').failed && !rec.rows.find((x) => x.id === 'm0').tps);
  check('the result is the fastest, with the speeds and the first-word time', rec.best.mode === 'hand' && rec.best.cpuMoe === 8 && rec.best.tps === 71.3 && rec.best.autoTps === 60 && rec.rows[0].firstWordS === 1.2, JSON.stringify(rec.best));
  check('calibrating changes no setting by itself', JSON.stringify(lab.cfg.brainPlace) === '{}' && !fs.existsSync(lab.cfg.settingsFile));
  check('the job ends done, with a line saying what it saw', lab.runs[0].state === 'done' && /Big Brain: By hand with 8 was fastest/.test(lab.runs[0].report.saw));
  const u = useCalibrated(lab, 'big');
  check('Use recommended saves it for that brain only', u.ok && JSON.stringify(lab.cfg.brainPlace) === JSON.stringify({ big: { mode: 'hand', cpuMoe: 8 } }) && JSON.parse(fs.readFileSync(lab.cfg.settingsFile, 'utf8')).brainPlace.big.cpuMoe === 8);
}
{
  const lab = mkLab({ auto: 60, 0: 61, 8: 55, 16: 50, 24: 45, 32: 40, 40: 30 });
  lab.cfg.brainPlace = { big: { mode: 'hand', cpuMoe: 12 } };
  await startCalibrate(lab, [{ model: 'big', name: 'Big', experts: true }]); await wait(lab);
  useCalibrated(lab, 'big');
  check('when Auto is as fast, Use recommended goes back to Auto and keeps the typed number', lab.cfg.brainPlace.big.mode === 'auto' && lab.cfg.brainPlace.big.cpuMoe === 12);
}
{
  const lab = mkLab({ auto: 60 });
  check('a brain without experts, one another engine runs, or no engine: locked with the reason', /no experts/.test(calLock(lab, 'plain', { experts: false })) && /couldn't read this brain's layers/.test(calLock(lab, 'ollama-thing', { experts: true })) && /built-in engine/.test(calLock({ ...lab, cfg: { ...lab.cfg, engine: 'ollama' } }, 'big', { experts: true })) && calLock(lab, 'big', { experts: true }) === '');
  check('asked to calibrate only such a brain, it says why and starts nothing', await startCalibrate(lab, [{ model: 'plain', name: 'Plain', experts: false }]).then(() => false, (e) => /no experts/.test(e.message)) && !lab.job);
  const all = await startCalibrate(lab, [{ model: 'plain', experts: false }, { model: 'big', name: 'Big', experts: true }, { model: 'big', name: 'Big again', experts: true }]);
  check('Calibrate all skips the ones that can\'t be and does the rest in turn, as one job', all.started.steps.length === 14 && /^Big: /.test(all.started.steps[0].label) && all.started.name === 'Calibrate 2 brains');
  check('a second job can\'t start while one runs', await startCalibrate(lab, [{ model: 'big', experts: true }]).then(() => false, (e) => /already busy/.test(e.message)));
  await wait(lab);
  check('use with no result says so', (() => { try { useCalibrated(lab, 'never'); return false; } catch (e) { return /no calibration result/.test(e.message); } })());
}
{
  const lab = mkLab({ auto: 60 }, { loaded: [{ name: 'Riker', vram: 12 }] });
  const r = await startCalibrate(lab, [{ model: 'big', name: 'Big', experts: true }]);
  check('a brain in use is never unloaded without asking', r.needUnload === true && r.names.join() === 'Riker' && !lab.job && !lab.unloaded);
  await startCalibrate(lab, [{ model: 'big', name: 'Big', experts: true }], { unload: true }); await wait(lab);
  check('...and is unloaded once the owner says so', lab.unloaded === true);
  const g = mkLab({ auto: 60 }); g.cfg.session = 'gaming'; g.cfg.gaming = true;
  check('stopping ends the job as stopped', await (async () => { const s = mkLab({ auto: 60, 0: 1, 8: 1, 16: 1, 24: 1, 32: 1, 40: 1 }); s.stepFns.chat = async (u, m, { signal }) => new Promise((res, rej) => signal.addEventListener('abort', () => rej(new Error('Stopped.')))); await startCalibrate(s, [{ model: 'big', experts: true }]); await new Promise((r2) => setTimeout(r2, 30)); s.stop(); await wait(s); return s.runs[0].state === 'stopped' && calResult(s.cfg, 'bigx') === null; })());
}
// ---- the page ----
{
  const catalog = JSON.parse(read('catalog.json'));
  const have = ['gemma4-e4b', 'bobert-35b', 'riker-28b-q3'];
  const models = catalog.models.map((m) => ({ ...m, status: { state: have.includes(m.id) ? 'installed' : 'missing' } }));
  const roles = { current: { bob: 'riker-28b-q3', tinker: 'bobert-35b', eyes: 'gemma4-e4b', speech: 'windows' }, options: { llm: have.map((id) => ({ value: id, label: models.find((m) => m.id === id).name })), images: [], edit: [], video: [], voice: [], speech: [], embed: [] } };
  const cal = { when: '2026-11-11', best: { mode: 'hand', cpuMoe: 8, tps: 71.3, autoTps: 60, why: 'By hand with 8 was fastest: about 71.3 words a second against 60 on Auto.' }, rows: [{ id: 'auto', cpuMoe: null, tps: 60, firstWordS: 1.2 }, { id: 'm0', cpuMoe: 0, failed: 'Didn\'t start: too much for the card this way.' }, { id: 'm8', cpuMoe: 8, tps: 71.3, firstWordS: 1.1 }] };
  const place = { engine: 'llamacpp', engineHere: true, busy: false, job: null, brains: { 'bobert-35b': { layers: 40, set: { mode: 'auto' }, pinned: false, cal }, 'riker-28b-q3': { layers: 40, set: { mode: 'auto' }, pinned: false, cal: null }, 'gemma4-e4b': { layers: null, set: { mode: 'auto' }, cal: null } } };
  const ctx = { roles, models, brains: { small: 'gemma4-e4b' }, embed: '', selected: 'bob', vramGB: 16, ramGB: 32, active: {}, packs: [], place };
  const page = brainsHtml(ctx);
  check('Calibrate all, and a Calibrate on every brain; locked ones stay, with the reason', /data-calibrate="\*"\s+title=/.test(page) && /data-calibrate="bobert-35b"  aria-label="Calibrate 35Bob Bobert">/.test(page) && /data-calibrate="gemma4-e4b" disabled aria-label="Calibrate [^"]+" title="This brain has no experts to move/.test(page), page.slice(page.indexOf('data-calibrate="gemma4-e4b"'), page.indexOf('data-calibrate="gemma4-e4b"') + 200));
  check('only brains that can be calibrated are in Calibrate all', canCalibrate(ctx).map((b) => b.value).sort().join() === 'bobert-35b,riker-28b-q3' && /busy with another job/.test(pageLock(brainsInUse(ctx)[0], { ...ctx, place: { ...place, busy: true } })));
  const ask = brainsHtml({ ...ctx, calAsk: { models: ['bobert-35b', 'riker-28b-q3'] } });
  check('pressing it asks first: how long, that chat waits, and that nothing is changed at the end', /Calibrating 2 brains, one after another, takes about 16 minutes/.test(ask) && /I can't chat while it runs/.test(ask) && /Nothing is changed at the end/.test(ask) && /data-calgo>Calibrate</.test(ask) && /data-calcancel/.test(ask));
  check('a loaded brain is named before it is unloaded', /Riker is loaded\. Calibrating unloads it first/.test(brainsHtml({ ...ctx, calAsk: { models: ['bobert-35b'], needUnload: true, names: ['Riker'] } })) && /data-calgo data-unload="1">Unload and calibrate/.test(brainsHtml({ ...ctx, calAsk: { models: ['bobert-35b'], needUnload: true, names: ['Riker'] } })));
  const run = brainsHtml({ ...ctx, place: { ...place, job: { state: 'running', stepLabel: 'By hand: 8 of 40 layers\' experts in memory', progress: 43 } } });
  check('while it runs: what it is doing, how far, a Stop button, and no second start', /role="status"><strong>Calibrating\.<\/strong> By hand: 8 of 40 layers&#39; experts in memory <span class="muted">43%/.test(run) && /data-calstop/.test(run) && /data-calibrate="bobert-35b" disabled/.test(run) && /data-calibrate="\*" disabled/.test(run));
  const one = brainsHtml({ ...ctx, setUp: 'bobert-35b' });
  check('the Set up page shows what each try measured and stars the recommended one', /<tr class="best"><td>By hand, 8 in memory<\/td><td>71\.3 words a second<\/td><td>first word 1\.1 s<\/td><td>★ recommended<\/td>/.test(one) && /<td>By hand, 0 in memory<\/td><td><span class="muted">Didn&#39;t start/.test(one) && /Last calibrated 2026-11-11\. By hand with 8 was fastest/.test(one));
  check('the recommendation sits beside the slider, and Use recommended is offered until it is in use', /★ Recommended by the last calibration: <strong>8<\/strong> by hand/.test(one) && /data-caluse="bobert-35b" >Use recommended/.test(one) && /data-caluse="bobert-35b" disabled/.test(brainsHtml({ ...ctx, setUp: 'bobert-35b', place: { ...place, brains: { ...place.brains, 'bobert-35b': { ...place.brains['bobert-35b'], set: { mode: 'hand', cpuMoe: 8 } } } } })) && /\(in use\)/.test(brainsHtml({ ...ctx, setUp: 'bobert-35b', place: { ...place, brains: { ...place.brains, 'bobert-35b': { ...place.brains['bobert-35b'], set: { mode: 'hand', cpuMoe: 8 } } } } })));
  check('not calibrated yet says so; Use recommended is there but locked', /Not calibrated yet/.test(brainsHtml({ ...ctx, setUp: 'riker-28b-q3' })) && /data-caluse="riker-28b-q3" disabled/.test(brainsHtml({ ...ctx, setUp: 'riker-28b-q3' })));
  const server = read('src/server.js');
  check('only this replicant matrix can start, use or stop a calibration', /Calibrating can only be started on this replicant matrix itself/.test(server) && /lab\.job\?\.run\?\.kind === 'calibrate' \? lab\.stop\(\)/.test(server));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
