// Computer Science Lab: Give it eyes / Give it ears, the Lab's side (the card is public/lab-senses.js; the pure parts
// are src/lab-senses.js). Finding and checking readers is read-only. Attach, Try and Measure are Lab jobs (one at a
// time, never while Gaming is on) and only start on this replicant matrix itself. Sharpen only writes a Forge plan.
import fs from 'node:fs';
import path from 'node:path';
import { readGguf, readerFacts } from './lab-gguf.js';
import { labOn, labDir, labModelsDir, madeFile, mergeMadeBrains, slugOf } from './lab.js';
import { forgeDir, forgePlansDir } from './lab-forge.js';
import { hfLookup } from './lab-hf.js';
import { saveSettings } from './config.js';
import { gaming } from './sessions.js';
import { startServer, runQuiz } from './lab-test.js';
import { capabilities } from './capabilities.js';
import {
  SENSES, SENSE_IDS, WAYS, parseSource, hfFileUrl, sourceWords, peekReader, downloadReader, readerFit, catalogReaders,
  sensesDir, sensesDataDir, safeName, sensesBrains, looksLikeReader, picturePack, soundPack, askSense, runSensePack,
  cleanUpload, makeSensesPlan, forgeDoesSenses, writeBuiltinLessons, readOwnLessons, BUILTIN_LESSONS
} from './lab-senses.js';

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };
const attachedFile = (cfg) => path.join(sensesDataDir(labDir(cfg)), 'attached.json');
const measuresFile = (cfg) => path.join(sensesDataDir(labDir(cfg)), 'measures.json');
const ROUTES = ['/api/lab/senses', '/api/lab/senses/match', '/api/lab/senses/check', '/api/lab/senses/attach', '/api/lab/senses/try', '/api/lab/senses/measure', '/api/lab/senses/noeyes', '/api/lab/senses/plan', '/api/lab/senses/save', '/api/lab/senses/lessons', '/api/lab/senses/forget'];
const LOCAL_ONLY = new Set(['/api/lab/senses/attach', '/api/lab/senses/try', '/api/lab/senses/measure', '/api/lab/senses/noeyes', '/api/lab/senses/save', '/api/lab/senses/lessons', '/api/lab/senses/forget', '/api/lab/senses/check']);

// Every reader file on this replicant matrix: catalogue brains' readers that are downloaded, own brains' readers, and
// the ones the Lab attached. [{ id, name, path }]
export function readersHere(lab) {
  const out = new Map();
  const add = (p, name) => { if (p && /\.gguf$/i.test(p) && fs.existsSync(p) && !out.has(p)) out.set(p, { id: `here-${Buffer.from(p).toString('base64url').slice(-16)}`, name, path: p }); };
  for (const e of lab.shop?.catalog?.models || []) { if (!(e.files || []).some((f) => f.role === 'mmproj')) continue; try { add(lab.shop.locate(e).mmproj, `${e.name}'s reader`); } catch {} }
  for (const o of lab.cfg.ownModels || []) add(o.mmproj, `${o.name}'s reader`);
  for (const b of lab.brains()) add(b.mmproj, `${b.name}'s reader`);
  try { for (const d of fs.readdirSync(sensesDir(labModelsDir(lab.cfg)), { withFileTypes: true })) if (d.isDirectory()) for (const f of fs.readdirSync(path.join(sensesDir(labModelsDir(lab.cfg)), d.name))) if (/\.gguf$/i.test(f)) add(path.join(sensesDir(labModelsDir(lab.cfg)), d.name, f), f); } catch {}
  return [...out.values()];
}

function view(lab, isLocal) {
  const noEyes = lab.cfg.llamacpp?.noEyes || [];
  const caps = capabilities(lab.cfg);
  const att = readJson(attachedFile(lab.cfg), []).filter((a) => fs.existsSync(a.reader || ''));
  return {
    on: labOn(lab.cfg), senses: SENSES, ways: WAYS, builtinLessons: BUILTIN_LESSONS,
    brains: sensesBrains(lab.brains(), { noEyes }),
    catalog: catalogReaders(lab.shop?.catalog).map(({ url, sha256, ...r }) => r),
    attached: att.map((a) => ({ id: a.id, name: a.name, brain: a.brain, senses: a.senses, from: a.from, at: a.at, ...(isLocal ? { reader: a.reader } : {}) })),
    measures: readJson(measuresFile(lab.cfg), []).slice(-30),
    pipeline: { hearing: Boolean(caps.hearing), voice: Boolean(caps.voice) },
    forgeReady: forgeDoesSenses(forgeDir(lab.cfg)), forgeFound: Boolean(forgeDir(lab.cfg)),
    busy: Boolean(lab.job)
  };
}

const brainOf = (lab, id) => {
  const b = lab.brains().find((x) => x.id === String(id || ''));
  if (!b) throw new Error('Pick a brain first.');
  return b;
};

// Check one reader against a brain: a file here, a catalogue reader, a Hugging Face file or another link.
// Far-away files are checked from their first few megabytes, never downloaded whole for this.
export async function checkReader(lab, brain, src, { signal } = {}) {
  const bg = readGguf(brain.gguf);
  if (src.kind === 'file') {
    if (!fs.existsSync(src.path)) throw new Error('That file isn\'t there.');
    return { ...readerFit(bg, readGguf(src.path)), where: sourceWords(src), bytes: fs.statSync(src.path).size };
  }
  if (src.kind === 'hf' && !src.file) {
    const info = await hfLookup({ kind: 'model', repo: src.repo, revision: src.revision, file: '' }, { fetchFn: lab.hfFetch || fetch });
    if (!info.ok) throw new Error(info.error);
    const files = (info.gguf || []).filter(looksLikeReader);
    return { pick: files.slice(0, 20), license: info.license || '', words: files.length ? `${src.repo} has ${files.length === 1 ? 'one reader file' : `${files.length} reader files`}. Pick one to check.` : `${src.repo} has no reader file (a .gguf with mmproj in its name). Readers usually sit next to the brain's own GGUF files.` };
  }
  const url = src.kind === 'hf' ? hfFileUrl(src) : src.url;
  const { g, bytes } = await peekReader(url, { fetchFn: lab.hfFetch || fetch, dir: sensesDataDir(labDir(lab.cfg)), signal });
  return { ...readerFit(bg, g), where: sourceWords(src), bytes };
}

const sourceFrom = (lab, b) => {
  if (b.catalog) { const c = catalogReaders(lab.shop?.catalog).find((x) => x.id === b.catalog); if (!c) throw new Error('That catalogue reader isn\'t in the list any more.'); return { kind: 'hf', repo: c.repo, revision: c.revision, file: c.file, sha256: c.sha256, saveAs: c.saveAs, words: c.name, license: c.license }; }
  if (b.here) { const h = readersHere(lab).find((x) => x.id === b.here); if (!h) throw new Error('That reader isn\'t on this replicant matrix any more.'); return { kind: 'file', path: h.path }; }
  const s = parseSource(b.source);
  if (!s) throw new Error('That isn\'t a file, a Hugging Face name or link, or a https link to a .gguf.');
  return s;
};

async function needCard(lab, unload) {
  if (!lab.brain?.engine?.loaded) return null;
  const loaded = (await lab.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
  if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
  if (loaded.length) await lab.brain.engine.unloadAll().catch(() => {});
  return null;
}
function canStart(lab) {
  if (!labOn(lab.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
  const room = lab.room(); if (!room.ok) throw new Error(room.why);
  if (lab.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
  if (gaming(lab.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
  if (!lab.tools().server.found) throw new Error(`${path.basename(lab.tools().server.path)} isn't in Bob's engine folder. Settings, Engines, Bob's own engine has it.`);
}

// Put the brain and its new reader into Bob as a brain of their own (same brain file, nothing copied).
export function registerPair(lab, brain, readerPath, fit, words) {
  const senses = SENSE_IDS.filter((s) => fit.senses[s]?.fits !== false && fit.senses[s]);
  const tag = senses.length === 2 ? 'eyes and ears' : senses[0] === 'hearing' ? 'ears' : 'eyes';
  const id = `lab-${slugOf(brain.name)}-${senses.length === 2 ? 'senses' : senses[0] === 'hearing' ? 'ears' : 'eyes'}`.slice(0, 64);
  const name = `${brain.name.replace(/ \(made in the Lab\)$/, '')} with ${tag} (made in the Lab)`;
  const list = readJson(madeFile(lab.cfg), []).filter((m) => m.id !== id);
  let sizeGB = 0; try { sizeGB = Math.round(((fs.statSync(brain.gguf).size + fs.statSync(readerPath).size) / 1024 ** 3) * 10) / 10; } catch {}
  const jobs = [...new Set([...(brain.jobs || ['bob']), ...(senses.includes('sight') ? ['eyes'] : [])])];
  list.push({ id, name, fromName: brain.name, family: brain.family, category: senses.includes('sight') && brain.category === 'tiny' ? 'tiny' : brain.category, jobs, license: brain.license, gguf: brain.gguf, mmproj: readerPath, sizeGB, what: `${brain.name} with ${tag} borrowed from ${words}. Attached in the Lab; not sharpened yet, so it may see a bit blurry.`, at: lab.now() });
  writeJson(madeFile(lab.cfg), list);
  saveSettings(lab.cfg, { llamacpp: { models: { [id]: { gguf: brain.gguf, mmproj: readerPath } } } });
  if (lab.shop?.catalog) mergeMadeBrains(lab.shop.catalog, lab.cfg);
  const att = readJson(attachedFile(lab.cfg), []).filter((a) => a.id !== id);
  att.push({ id, name, brain: brain.id, senses, reader: readerPath, from: words, at: lab.now() });
  writeJson(attachedFile(lab.cfg), att);
  return { id, name, senses };
}

async function attach(lab, b) {
  canStart(lab);
  const brain = brainOf(lab, b.brain);
  const src = sourceFrom(lab, b);
  if (src.kind === 'hf' && !src.file) throw new Error('Pick which file in that repo is the reader.');
  const words = src.words || sourceWords(src);
  const runRec = { id: `lab-${lab.now().toString(36)}`, kind: 'senses-attach', name: `Attach a reader to ${brain.name}`, from: brain.id, fromName: brain.name, state: 'running', at: lab.now(), steps: [{ id: 'check', label: 'Check it lines up', state: 'running' }, { id: 'get', label: src.kind === 'file' ? 'Use your file where it is' : 'Download the reader', state: 'waiting' }, { id: 'add', label: 'Put the pair into Bob', state: 'waiting' }], progress: 0 };
  lab.runs.push(runRec); lab.save();
  const ac = new AbortController();
  lab.job = { run: runRec, ac };
  (async () => {
    const signal = ac.signal;
    const set = (i, st) => { runRec.steps[i].state = st; runRec.step = runRec.steps[i].id; runRec.stepLabel = runRec.steps[i].label; lab.tell(runRec); };
    try {
      const fit = await checkReader(lab, brain, src, { signal });
      if (!Object.keys(fit.senses).length || (!fit.ok && !fit.unsure)) throw new Error(fit.words);
      set(0, 'done'); set(1, 'running');
      let file = src.path;
      if (src.kind !== 'file') {
        file = path.join(sensesDir(labModelsDir(lab.cfg)), slugOf(src.kind === 'hf' ? src.repo : new URL(src.url).hostname), safeName(src.saveAs || path.basename(src.kind === 'hf' ? src.file : new URL(src.url).pathname)));
        if (!fs.existsSync(file)) {
          let last = 0;
          await downloadReader(src.kind === 'hf' ? hfFileUrl(src) : src.url, file, { fetchFn: lab.hfFetch || fetch, signal, sha256: src.sha256 || '', onProgress: (got, total) => { if (total) runRec.progress = Math.round((100 * got) / total); if (Date.now() - last > 2000) { last = Date.now(); lab.tell(runRec); } } });
        }
        const again = readerFit(readGguf(brain.gguf), readGguf(file)); // the whole file, now it's here
        if (!again.ok && !again.unsure) { try { fs.unlinkSync(file); } catch {} throw new Error(again.words); }
      }
      set(1, 'done'); set(2, 'running');
      const made = registerPair(lab, brain, file, fit, words);
      set(2, 'done');
      runRec.report = { attached: made, words: fit.words };
      runRec.state = 'done'; runRec.stepLabel = ''; runRec.progress = 100;
      lab.broadcast({ type: 'lab-done', name: runRec.name, ok: true });
    } catch (e) {
      runRec.state = signal.aborted ? 'stopped' : 'failed'; runRec.error = signal.aborted ? 'You stopped it. Nothing was attached.' : e.message;
      const i = runRec.steps.findIndex((x) => x.state === 'running'); if (i >= 0) runRec.steps[i].state = 'failed';
      lab.broadcast({ type: 'lab-done', name: runRec.name, ok: false, error: runRec.error });
    } finally { lab.job = null; lab.tell(runRec); }
  })();
  return { started: lab.runView(runRec) };
}

const pairOf = (lab, id) => {
  const b = lab.brains().find((x) => x.id === String(id || ''));
  if (!b) throw new Error('Pick a brain first.');
  if (!b.mmproj) throw new Error(`${b.name} has no eyes or ears to try. Attach a reader first.`);
  return b;
};

// Try: one question with the person's own picture or sound (or the pack's first one), answered at temperature 0.
async function tryIt(lab, b) {
  canStart(lab);
  const brain = pairOf(lab, b.brain);
  const sense = SENSE_IDS.includes(b.sense) ? b.sense : 'sight';
  const r = readerFacts(readGguf(brain.mmproj));
  if (!r[sense]) throw new Error(`${brain.name}'s reader has no ${SENSES[sense].label}.`);
  const up = cleanUpload(b.upload, sense);
  const sample = sense === 'hearing' ? soundPack()[1] : picturePack().find((x) => x.id === 'two-colours');
  const question = String(b.question || '').replace(/\s+/g, ' ').trim().slice(0, 500) || (up ? (sense === 'hearing' ? 'What do you hear?' : 'What is in this picture?') : sample.q);
  const card = await needCard(lab, b.unload === true); if (card) return card;
  const ac = new AbortController();
  lab.job = { run: { id: 'senses-try', kind: 'senses-try', name: `Try ${brain.name}` }, ac };
  let srv = null;
  try {
    srv = await (lab.stepFns.serve || ((o) => startServer({ exe: lab.tools().server.path, ...o })))({ gguf: brain.gguf, mmproj: brain.mmproj, ctx: 8192, signal: ac.signal });
    const t0 = Date.now();
    const answer = await askSense(srv.url, question, sense === 'hearing' ? { sound: up || sample.sound } : { picture: up || sample.picture }, { signal: ac.signal });
    return { answer: answer.slice(0, 4000), question, sample: !up, seconds: Math.round((Date.now() - t0) / 100) / 10, where: srv.where };
  } finally { srv?.stop(); lab.job = null; }
}

// Measure: the sense pack, then the quick quiz, as a Lab job. Kept in senses/measures.json for before-and-after.
async function measure(lab, b) {
  canStart(lab);
  const brain = pairOf(lab, b.brain);
  const r = readerFacts(readGguf(brain.mmproj));
  const senses = SENSE_IDS.filter((s) => r[s]);
  const card = await needCard(lab, b.unload === true); if (card) return card;
  const runRec = { id: `lab-${lab.now().toString(36)}`, kind: 'senses-measure', name: `Measure ${brain.name}`, from: brain.id, fromName: brain.name, state: 'running', at: lab.now(), steps: [{ id: 'serve', label: `Start ${brain.name}`, state: 'waiting' }, ...senses.map((s) => ({ id: s, label: SENSES[s].pack, state: 'waiting' })), { id: 'quiz', label: 'Quick quiz (text)', state: 'waiting' }], progress: 0 };
  lab.runs.push(runRec); lab.save();
  const ac = new AbortController();
  lab.job = { run: runRec, ac };
  (async () => {
    const signal = ac.signal; let srv = null;
    const set = (i, st) => { runRec.steps[i].state = st; runRec.step = runRec.steps[i].id; runRec.stepLabel = runRec.steps[i].label; lab.tell(runRec); };
    try {
      set(0, 'running');
      srv = await (lab.stepFns.serve || ((o) => startServer({ exe: lab.tools().server.path, ...o })))({ gguf: brain.gguf, mmproj: brain.mmproj, ctx: 8192, signal });
      set(0, 'done');
      const packs = {};
      for (let i = 0; i < senses.length; i++) { set(i + 1, 'running'); packs[senses[i]] = await (lab.stepFns.sensePack || runSensePack)(srv.url, senses[i], { signal }); set(i + 1, 'done'); }
      set(senses.length + 1, 'running');
      const quiz = await (lab.stepFns.quiz || runQuiz)(srv.url, { signal });
      set(senses.length + 1, 'done');
      const rec = { brain: brain.id, name: brain.name, when: new Date(lab.now()).toISOString().slice(0, 10), packs: Object.fromEntries(Object.entries(packs).map(([k, v]) => [k, { score: v.score, right: v.right, of: v.of }])), quiz: quiz.score, where: srv.where };
      writeJson(measuresFile(lab.cfg), [...readJson(measuresFile(lab.cfg), []), rec].slice(-200));
      runRec.report = { senses: rec, misses: Object.fromEntries(Object.entries(packs).map(([k, v]) => [k, v.misses.slice(0, 6)])) };
      runRec.state = 'done'; runRec.stepLabel = ''; runRec.progress = 100;
      lab.broadcast({ type: 'lab-done', name: runRec.name, ok: true });
    } catch (e) {
      runRec.state = signal.aborted ? 'stopped' : 'failed'; runRec.error = signal.aborted ? 'You stopped it.' : e.message;
      const i = runRec.steps.findIndex((x) => x.state === 'running'); if (i >= 0) runRec.steps[i].state = 'failed';
      lab.broadcast({ type: 'lab-done', name: runRec.name, ok: false, error: runRec.error });
    } finally { srv?.stop(); lab.job = null; lab.tell(runRec); }
  })();
  return { started: lab.runView(runRec) };
}

// Forget an attached pair: it leaves Bob's list. A reader the Lab downloaded is deleted; your own file never is.
function forget(lab, id) {
  const att = readJson(attachedFile(lab.cfg), []);
  const a = att.find((x) => x.id === id);
  if (!a) throw new Error('That pair isn\'t attached.');
  if (lab.job) throw new Error('The Lab is busy. Wait for it first.');
  writeJson(attachedFile(lab.cfg), att.filter((x) => x.id !== id));
  writeJson(madeFile(lab.cfg), readJson(madeFile(lab.cfg), []).filter((m) => m.id !== id));
  saveSettings(lab.cfg, { llamacpp: { models: { [id]: null } } });
  if (lab.shop?.catalog) lab.shop.catalog.models = lab.shop.catalog.models.filter((m) => m.id !== id);
  const ours = path.resolve(sensesDir(labModelsDir(lab.cfg)));
  const rel = path.relative(ours, path.resolve(a.reader));
  const stillUsed = att.some((x) => x.id !== id && x.reader === a.reader);
  if (rel && !rel.startsWith('..') && !path.isAbsolute(rel) && !stillUsed) { try { fs.unlinkSync(a.reader); } catch {} }
  return { forgot: id };
}

export async function sensesRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!ROUTES.includes(p)) return false;
  if (req.method === 'GET' && p === '/api/lab/senses') { send(res, 200, view(lab, isLocal)); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  const b = await body(req);
  if (LOCAL_ONLY.has(p) && !isLocal) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/senses/match') {
    const brain = brainOf(lab, b.brain);
    let bg; try { bg = readGguf(brain.gguf); } catch (e) { send(res, 200, { error: e.message }); return true; }
    const here = readersHere(lab).filter((h) => h.path !== brain.mmproj).map((h) => { try { return { ...h, path: isLocal ? h.path : undefined, ...readerFit(bg, readGguf(h.path)) }; } catch { return null; } }).filter((h) => h && (h.ok || h.unsure));
    const fam = String(brain.family || '').toLowerCase();
    const cat = catalogReaders(lab.shop?.catalog).filter((c) => !fam || String(c.family).toLowerCase() === fam).map(({ url, sha256, ...c }) => c);
    send(res, 200, { brain: { id: brain.id, name: brain.name }, here, catalog: cat }); return true;
  }
  if (p === '/api/lab/senses/check') { const brain = brainOf(lab, b.brain); send(res, 200, await checkReader(lab, brain, sourceFrom(lab, b))); return true; }
  if (p === '/api/lab/senses/attach') { send(res, 200, await attach(lab, b)); return true; }
  if (p === '/api/lab/senses/try') { send(res, 200, await tryIt(lab, b)); return true; }
  if (p === '/api/lab/senses/measure') { send(res, 200, await measure(lab, b)); return true; }
  if (p === '/api/lab/senses/forget') { send(res, 200, forget(lab, String(b.id || ''))); return true; }
  if (p === '/api/lab/senses/noeyes') {
    const brain = brainOf(lab, b.brain);
    const list = new Set(lab.cfg.llamacpp?.noEyes || []);
    if (b.on === true) list.add(brain.id); else list.delete(brain.id);
    saveSettings(lab.cfg, { llamacpp: { noEyes: [...list] } });
    send(res, 200, { noEyes: list.has(brain.id) }); return true;
  }
  if (p === '/api/lab/senses/lessons') {
    const sense = SENSE_IDS.includes(b.sense) ? b.sense : 'sight';
    if (b.dir) { const r = readOwnLessons(String(b.dir), sense); send(res, 200, { dir: path.resolve(String(b.dir)), count: r.count }); return true; }
    const dir = path.join(sensesDataDir(labDir(lab.cfg)), `lessons-${sense}`);
    const r = fs.existsSync(path.join(dir, 'lessons.jsonl')) ? { file: path.join(dir, 'lessons.jsonl'), count: BUILTIN_LESSONS } : writeBuiltinLessons(dir, { sense });
    send(res, 200, r); return true;
  }
  if (p === '/api/lab/senses/plan' || p === '/api/lab/senses/save') {
    const r = makeSensesPlan(b.form || {}, { forgeReady: forgeDoesSenses(forgeDir(lab.cfg)) });
    if (p === '/api/lab/senses/plan') { send(res, 200, { problems: r.problems, notes: r.notes, hours: r.hours, text: isLocal ? JSON.stringify(r.plan, null, 1) : '' }); return true; }
    if (r.problems.length) throw new Error(r.problems[0]);
    const dir = forgePlansDir(labDir(lab.cfg)); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slugOf(r.plan.run)}.json`);
    writeJson(file, r.plan);
    send(res, 200, { file: path.basename(file), notes: r.notes }); return true;
  }
  return false;
}
