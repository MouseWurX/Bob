// 1.5.205 Calibrate (src/brain-calibrate.js): the tries, the recommendation, and the job with a made-up engine.
// No real engine, card or settings: a fake Lab object in a temp folder, and scripted speeds.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { calibrateDir, calTries, calBest, calLock, calResult, calibrated, startCalibrate, useCalibrated, CAL_CTX, calSpeedTries, calSpeedBest, CAL_LONG, calSpeedWork, speedJob } from '../src/brain-calibrate.js';
import { sharedGpuMB } from '../src/card-busy.js';
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

{
  check('speed tries: Normal, Faster, Fastest, and Turbo only for a brain with its own guesser', calSpeedTries().map((t) => t.id).join() === 'read-normal,read-faster,read-fastest' && calSpeedTries({ mtp: 1 }).at(-1).extra.join(' ') === '--spec-type draft-mtp --spec-draft-n-max 3');
  check('the long prompt is long (about 8,000 tokens) and fixed', CAL_LONG.length > 30000 && CAL_LONG === CAL_LONG.slice());
  const base = { id: 'read-normal', reading: 'normal', readTps: 400, firstWordS: 20, tps: 60 };
  const b = calSpeedBest([base, { id: 'read-faster', reading: 'faster', readTps: 900, firstWordS: 9, tps: 58 }, { id: 'read-fastest', reading: 'fastest', readTps: 1000, firstWordS: 8, tps: 50 }, { id: 'turbo', turbo: true, tps: 75, accepted: 70 }]);
  check('speed: the fastest reader wins unless writing drops over 10%, and says why', b.reading === 'faster' && /Faster: read the long prompt at 900/.test(b.why));
  check('speed: Turbo only when it writes over 5% faster, with the kept-guess rate', b.turbo === true && /70% of its guesses kept/.test(b.why) && calSpeedBest([base, { id: 'turbo', turbo: true, tps: 62 }]).turbo === false);
  check('speed: Normal stays when nothing beats it by over 10%', calSpeedBest([base, { id: 'read-fastest', reading: 'fastest', readTps: 420, tps: 60 }]).reading === 'normal' && calSpeedBest([{ id: 'read-faster', reading: 'faster', tps: 9, readTps: 9 }]) === null);
  // Nov 17: pairs of reading step and hot-experts cache (the copy kind), from the 16 GB card calibration's numbers
  const pairs = calSpeedTries({ cacheMB: 4096 });
  check('pairs: each reading step also with the cache, the copy kind (share 0); none without a cache size', pairs.map((t) => t.id).join() === 'read-normal,read-faster,read-fastest,read-normal-hot,read-faster-hot,read-fastest-hot' && pairs[4].extra.join(' ') === '-b 2048 -ub 2048 --moe-cache-mib 4096 --moe-cache-cpu-share 0 -lv 4' && pairs[4].cache === true && calSpeedTries().length === 3);
  const card16 = [{ id: 'read-normal', reading: 'normal', tps: 87.7, readTps: 1232, firstWordS: 26.6 }, { id: 'read-faster', reading: 'faster', tps: 83.9, readTps: 3074, firstWordS: 10.7 }, { id: 'read-fastest', reading: 'fastest', tps: 80.1, readTps: 4173, firstWordS: 7.9 }, { id: 'read-normal-hot', reading: 'normal', cache: true, tps: 95, readTps: 1100 }, { id: 'read-faster-hot', reading: 'faster', cache: true, tps: 109.2, readTps: 2290, firstWordS: 14.3 }, { id: 'read-fastest-hot', reading: 'fastest', cache: true, tps: 102, readTps: 3276, firstWordS: 10 }];
  const nb = calSpeedBest(card16);
  check('pairs: the fastest writer wins (16 GB card: step 2048 with the cache), and says so', nb.reading === 'faster' && nb.cache === true && /Faster with hot experts: wrote 109.2/.test(nb.why));
  const near = calSpeedBest(card16.map((r) => (r.id === 'read-fastest-hot' ? { ...r, tps: 107 } : r)));
  check('pairs: within 3% of the fastest writer, the faster reader wins', near.reading === 'fastest' && near.cache === true);
  const noHelp = calSpeedBest(card16.map((r) => (r.cache ? { ...r, tps: 70 } : r)));
  // Nov 17: the second pick, for coding and agent brains (reading weighs more): step 4096 with the cache on that card
  const wk = calSpeedWork(card16);
  check('work pick: within 10% of the fastest writer, the fastest reader (16 GB card: step 4096 with the cache), and says so', wk.reading === 'fastest' && wk.cache === true && wk.job === 'work' && /^For coding and agent work, Reading speed Fastest with hot experts: read the long prompt at 3276/.test(wk.why));
  check('work pick: a reader that writes over 10% slower than the fastest loses', calSpeedWork(card16.filter((r) => r.id !== 'read-fastest-hot')).reading === 'faster' && calSpeedWork(card16.filter((r) => r.id !== 'read-fastest-hot')).cache === true);
  check('work pick: Normal stays when nothing reads over 10% faster, and none without Normal', calSpeedWork([base, { id: 'read-fastest', reading: 'fastest', readTps: 420, tps: 60 }]).reading === 'normal' && calSpeedWork([{ id: 'read-faster', reading: 'faster', tps: 9, readTps: 9 }]) === null);
  check('work pick: chat keeps the recorded rule (step 2048 with the cache)', calSpeedBest(card16).reading === 'faster');
  check('job: coding, research, review or Coding-session brains do work; a chat-only brain does chat', speedJob({ models: { tinker: 'q' } }, 'q') === 'work' && speedJob({ models: { scout: 'q', bob: 'b', tinker: 't' } }, 'q') === 'work' && speedJob({ models: { bob: 'b', tinker: 't' }, sessionBrains: { coding: 'b' } }, 'b') === 'work' && speedJob({ models: { bob: 'b', tinker: 't' } }, 'b') === 'chat' && speedJob({ models: { bob: 'b', tinker: 't' } }, 'nobody') === 'chat');
  check('job: the main brain with no coding brain of its own, or with One brain, does the work itself', speedJob({ models: { bob: 'b' } }, 'b') === 'work' && speedJob({ oneBrain: true, models: { bob: 'b', tinker: 't' } }, 'b') === 'work');
  check('pairs: a cache that doesn\'t write faster loses, and the reading rule from before decides', noHelp.cache === false && noHelp.reading === 'fastest' && /hot experts didn't write faster|Fastest: read/.test(noHelp.why));
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
      sharedMB: async () => null, // tests never read the real card
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
  check('it starts as one job with a step for every try', r.started?.kind === 'calibrate' && r.started.steps.length === 10 && r.started.name === 'Calibrate Big Brain' && r.started.steps.slice(7).map((x) => x.label).join('|').includes('Reading speed Fastest'));
  await wait(lab);
  const rec = calResult(lab.cfg, 'big');
  check('a calibrated brain is listed for the Set up page, in a slot or not', calibrated(lab.cfg).join() === 'big' && calibrated({ ...lab.cfg, dataDir: path.join(os.tmpdir(), 'bob-no-such-folder') }).length === 0 && /\.\.\.calibrated\(cfg\)/.test(read('src/server.js')));
  check('every try ran in its own trial engine, which was stopped again', lab.served.length === 10 && lab.served.stopped === 9);
  check('the speed tries ran on the placement that won (By hand, 8)', lab.served.slice(7).every((o) => o.place?.[1] === '8') && lab.served[9].extra.join(' ') === '-b 4096 -ub 4096' && rec.speedRows?.length === 3 && rec.speed?.reading === 'normal');
  check('Auto is timed with the engine fitting it (no processor-only second try); by hand passes the number and offers every layer to the card', lab.served[0].place === undefined && lab.served[0].cpuOk === false && lab.served[2].place.join(' ') === '--n-cpu-moe 8 -ngl 999' && lab.served.every((o) => o.ctx === CAL_CTX));
  check('a try that didn\'t fit is written down as such, not as a speed', rec.rows.find((x) => x.id === 'm0').failed && !rec.rows.find((x) => x.id === 'm0').tps);
  check('the result is the fastest, with the speeds and the first-word time', rec.best.mode === 'hand' && rec.best.cpuMoe === 8 && rec.best.tps === 71.3 && rec.best.autoTps === 60 && rec.rows[0].firstWordS === 1.2, JSON.stringify(rec.best));
  check('calibrating changes no setting by itself', JSON.stringify(lab.cfg.brainPlace) === '{}' && !fs.existsSync(lab.cfg.settingsFile));
  check('the job ends done, with a line saying what it saw', lab.runs[0].state === 'done' && /Big Brain: By hand with 8 was fastest/.test(lab.runs[0].report.saw));
  const u = useCalibrated(lab, 'big');
  check('Use recommended saves it for that brain only', u.ok && JSON.stringify(lab.cfg.brainPlace) === JSON.stringify({ big: { mode: 'hand', cpuMoe: 8 } }) && JSON.parse(fs.readFileSync(lab.cfg.settingsFile, 'utf8')).brainPlace.big.cpuMoe === 8);
  check('Use recommended remembers per brain whether the copy kind won (no cache here: false)', JSON.parse(fs.readFileSync(lab.cfg.settingsFile, 'utf8')).hotExpertsCopy?.big === false && u.hotCopy === false);
  lab.cfg.hotExpertsCopy = {}; fs.writeFileSync(path.join(calibrateDir(lab.cfg), 'big.json'), JSON.stringify([{ ...rec, speed: { reading: 'faster', cache: true, turbo: false, why: 'x' } }]));
  const u2 = useCalibrated(lab, 'big');
  check('a pair with the cache turns Hot experts on, the copy kind for that brain, and its reading speed', u2.hotExperts === true && u2.hotCopy === true && u2.reading === 'faster');
  fs.writeFileSync(path.join(calibrateDir(lab.cfg), 'big.json'), JSON.stringify([{ ...rec, speed: { reading: 'faster', cache: true, turbo: false, why: 'x' }, speedWork: { reading: 'fastest', cache: true, turbo: false, why: 'y', job: 'work' } }]));
  lab.cfg.models = { bob: 'big' };
  const u3 = useCalibrated(lab, 'big');
  check('Use recommended on a brain that does the coding sets the work pick (step 4096)', u3.reading === 'fastest' && u3.job === 'work' && u3.hotCopy === true);
  lab.cfg.models = { bob: 'big', tinker: 'other' };
  const u4 = useCalibrated(lab, 'big');
  check('a chat brain gets the chat pick; asked for, either one', u4.reading === 'faster' && u4.job === 'chat' && useCalibrated(lab, 'big', { job: 'work' }).reading === 'fastest');
  check('a result from before the work pick falls back to the chat one', (fs.writeFileSync(path.join(calibrateDir(lab.cfg), 'big.json'), JSON.stringify([{ ...rec, speedWork: undefined, speed: { reading: 'faster', cache: false, turbo: false, why: 'x' } }])), useCalibrated(lab, 'big', { job: 'work' }).job === 'chat'));
  check('the Brains page gets both picks and the brain\'s job', /speedWork: cal\.speedWork \|\| null/.test(read('src/server.js')) && /job: speedJob\(cfg, model\)/.test(read('src/server.js')) && /useCalibrated\(lab, String\(b\.model \|\| ''\), \{ job: b\.job \}\)/.test(read('src/server.js')));
  check('the run saves both picks', rec.speed && 'speedWork' in rec);
}
{
  // Nov 17: a cache that doesn't fit beside a reading step steps down 1 GB at a time (to 2 GB at least)
  check('cache sizes: biggest first, 1 GB smaller each time, down to 2 GB', calSpeedTries({ cacheMB: 4096 })[3].sizes.join() === '4096,3072,2048' && calSpeedTries({ cacheMB: 2048 })[3].sizes.join() === '2048');
  const lab = mkLab({ auto: 60.04, 8: 71.26, 16: 66, 24: 50, 32: 41, 40: 30 });
  lab.cfg.gpuVramGB = 16; lab.brain.engine.buildNo = () => 12359;
  const serve0 = lab.stepFns.serve;
  lab.stepFns.serve = async (o) => { const x = o.extra || []; const mib = Number(x[x.indexOf('--moe-cache-mib') + 1]); if (x.includes('--moe-cache-mib') && x[1] === '4096' && mib >= 4096) { lab.served.push(o); throw new Error('out of memory'); } return serve0(o); };
  lab.stepFns.trace = async () => { throw new Error('no trace here'); };
  await startCalibrate(lab, [{ model: 'big', name: 'Big', experts: true }]); await wait(lab);
  const rec = calResult(lab.cfg, 'big');
  const fh = rec.speedRows.find((r) => r.id === 'read-fastest-hot'), ff = rec.speedRows.find((r) => r.id === 'read-faster-hot');
  check('a 4 GB cache that doesn\'t fit beside step 4096 steps down to 3 GB, and the row says so', fh.cacheMB === 3072 && fh.steppedDown?.join() === '4096' && !fh.failed && fh.tps > 0);
  check('one that fits runs once at its own size', ff.cacheMB === 4096 && !ff.steppedDown);
  check('a pick with a cache carries the size it ran with', calSpeedWork([{ id: 'read-normal', reading: 'normal', tps: 50, readTps: 100 }, { id: 'read-fastest-hot', reading: 'fastest', cache: true, cacheMB: 3072, tps: 55, readTps: 300 }]).cacheMB === 3072);
  fs.writeFileSync(path.join(calibrateDir(lab.cfg), 'big.json'), JSON.stringify([{ ...rec, speed: { reading: 'faster', cache: true, cacheMB: 3072, turbo: false, why: 'x' }, speedWork: undefined }]));
  const u = useCalibrated(lab, 'big', { job: 'chat' });
  check('Use recommended sets Room for hot experts to a smaller size the pick ran with', lab.cfg.hotExpertsGB === 3 && u.hotExperts === true);
}
{
  // Nov 17 (npc: step 4096 + 4 GB spilled about 0.6 GB into RAM): a pair that spills fails, and a cache steps down
  const lab = mkLab({ auto: 60.04, 8: 71.26, 16: 66, 24: 50, 32: 41, 40: 30 });
  lab.cfg.gpuVramGB = 16; lab.brain.engine.buildNo = () => 12359;
  let cur = 300, spill = false;
  const serve0 = lab.stepFns.serve;
  lab.stepFns.serve = async (o) => { const x = o.extra || []; spill = x[1] === '4096' && Number(x[x.indexOf('--moe-cache-mib') + 1]) >= 3072 || (x[1] === '4096' && !x.includes('--moe-cache-mib')); return serve0(o); };
  lab.stepFns.sharedMB = async () => { cur = spill ? cur + 600 : cur; const v = cur; return v; };
  lab.stepFns.trace = async () => { throw new Error('no trace here'); };
  await startCalibrate(lab, [{ model: 'big', name: 'Big', experts: true }]); await wait(lab);
  const rec = calResult(lab.cfg, 'big');
  const f = rec.speedRows.find((r) => r.id === 'read-fastest'), fh = rec.speedRows.find((r) => r.id === 'read-fastest-hot'), ok = rec.speedRows.find((r) => r.id === 'read-faster-hot');
  check('a reading step that spills card memory into RAM is a failure, with how much', /^Spilled: about 0\.6 GB of card memory went to RAM/.test(f.failed || '') && f.spillMB === 600);
  check('a cache that spills steps down until one doesn\'t (4 and 3 GB spilled, 2 GB ran)', fh.cacheMB === 2048 && fh.steppedDown?.join() === '4096,3072' && !fh.failed);
  check('a pair that doesn\'t spill is untouched', !ok.failed && ok.cacheMB === 4096 && ok.spillMB === undefined);
  check('the real reader is Windows only, and reads bytes as whole MB', await sharedGpuMB({ platform: 'linux' }) === null && await sharedGpuMB({ platform: 'win32', run: (exe, a, o, cb) => cb(null, '1073741824\r\n') }) === 1024 && await sharedGpuMB({ platform: 'win32', run: (exe, a, o, cb) => cb(new Error('x')) }) === null);
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
  check('Calibrate all skips the ones that can\'t be and does the rest in turn, as one job', all.started.steps.length === 20 && /^Big: /.test(all.started.steps[0].label) && all.started.name === 'Calibrate 2 brains');
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
  const two = { ...cal, speedRows: [{ id: 'read-normal', reading: 'normal', tps: 87.7, readTps: 1232, firstWordS: 26.6 }, { id: 'read-faster-hot', reading: 'faster', cache: true, tps: 109.2, readTps: 2290, firstWordS: 14.3 }, { id: 'read-fastest-hot', reading: 'fastest', cache: true, cacheMB: 3072, steppedDown: [4096], tps: 102, readTps: 3276, firstWordS: 10 }], speed: { reading: 'faster', cache: true, why: 'Chat line.' }, speedWork: { reading: 'fastest', cache: true, why: 'Work line.', job: 'work' } };
  const pick = (job) => brainsHtml({ ...ctx, setUp: 'bobert-35b', place: { ...place, brains: { ...place.brains, 'bobert-35b': { ...place.brains['bobert-35b'], cal: two, job } } } });
  check('Set up shows both picks, says which this brain gets, and stars that one', /Chat line\.<\/p><p class="muted">Work line\.<\/p><p class="muted">This brain does coding and agent work, so Use recommended sets the second one/.test(pick('work')) && /<tr class="best"><td>Reading speed Fastest, hot experts 3 GB \(4 GB didn(?:'|&#39;)t fit\)/.test(pick('work')) && /This brain does chat, so Use recommended sets the first one/.test(pick('chat')) && /<tr class="best"><td>Reading speed Faster, hot experts/.test(pick('chat')));
  check('the Set up page shows what each try measured and stars the recommended one', /<tr class="best"><td>By hand, 8 in memory<\/td><td>71\.3 words a second<\/td><td>first word 1\.1 s<\/td><td>★ recommended<\/td>/.test(one) && /<td>By hand, 0 in memory<\/td><td><span class="muted">Didn&#39;t start/.test(one) && /Last calibrated 2026-11-11\. By hand with 8 was fastest/.test(one));
  check('the recommendation sits beside the slider, and Use recommended is offered until it is in use', /★ Recommended by the last calibration: <strong>8<\/strong> by hand/.test(one) && /data-caluse="bobert-35b" >Use recommended/.test(one) && /data-caluse="bobert-35b" disabled/.test(brainsHtml({ ...ctx, setUp: 'bobert-35b', place: { ...place, brains: { ...place.brains, 'bobert-35b': { ...place.brains['bobert-35b'], set: { mode: 'hand', cpuMoe: 8 } } } } })) && /\(in use\)/.test(brainsHtml({ ...ctx, setUp: 'bobert-35b', place: { ...place, brains: { ...place.brains, 'bobert-35b': { ...place.brains['bobert-35b'], set: { mode: 'hand', cpuMoe: 8 } } } } })));
  check('not calibrated yet says so; Use recommended is there but locked', /Not calibrated yet/.test(brainsHtml({ ...ctx, setUp: 'riker-28b-q3' })) && /data-caluse="riker-28b-q3" disabled/.test(brainsHtml({ ...ctx, setUp: 'riker-28b-q3' })));
  const server = read('src/server.js');
  check('only this replicant matrix can start, use or stop a calibration', /Calibrating can only be started on this replicant matrix itself/.test(server) && /lab\.job\?\.run\?\.kind === 'calibrate' \? lab\.stop\(\)/.test(server));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
