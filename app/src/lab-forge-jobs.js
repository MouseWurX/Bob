// The Lab's Forge: plans, the lesson library, Teach it from my mistakes, and starting and stopping a rented run.
// Methods of the Lab class. Split out of lab.js.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { forgeDir, forgePlansDir, FORGE_KEY, METHODS, LEFT_OUT, forgeRuns, forgeBrains, forgePlans, makeForgePlan, alive, scrub as scrubForge, forgeStartProblems, onDrive, launchForge, runPodId } from './lab-forge.js';
import { pickLessons, addLessonSet, downloadHfLessons } from './lab-library.js';
import os from 'node:os';
import { parseHfRef, hfLookup } from './lab-hf.js';
import { readMyTests, MISTAKES_NAME, MISTAKES_SKILL, seedIdeas } from './lab-mistakes.js';
import { forgeDoesSenses } from './lab-senses.js';
import { nodeCmd } from './selftools.js';
import { spawn } from 'node:child_process';
import { readJson, labModelsDir, labDir, slugOf, writeJson } from './lab-measure.js';
import { lessonSets, partsView, lessonSetsDir } from './lab-plan.js';

// Methods of the Lab class (src/lab.js), put on it there with the same rules as the methods written inside it.
export const forgeJobs = {
  // 1.5.159 The Forge tab. Keep files the Lab made (cuts, usage map, recipes), named for the page, paths kept here.
  keepFiles() {
    const out = [];
    const walk = (dir, depth) => { let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(dir, e.name); if (e.isDirectory() && depth > 0) walk(f, depth - 1); else if (e.isFile() && e.name.endsWith('-keep.json')) { const j = readJson(f, null); if (Array.isArray(j?.layers) && j.layers.length) out.push({ id: crypto.createHash('sha1').update(f).digest('hex').slice(0, 12), name: j.name || e.name.replace(/-keep\.json$/, ''), experts: Number(j.experts) || j.layers[0].length, layers: j.layers.length, path: f }); } } };
    walk(labModelsDir(this.cfg), 2); walk(path.join(labDir(this.cfg), 'usage'), 2);
    return out;
  },
  forgeView() {
    const dir = forgeDir(this.cfg);
    let saved = []; try { saved = fs.readdirSync(forgePlansDir(labDir(this.cfg))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')); } catch {}
    const live = this.forgeLive();
    return { live, allowed: this.cfg.labForgeStart === true, hasKey: Boolean(this.forgeKeys()[FORGE_KEY]), methods: METHODS, leftOut: LEFT_OUT, found: Boolean(dir), runs: forgeRuns(dir), brains: forgeBrains(dir), plans: forgePlans(dir), saved, keepFiles: this.keepFiles().map(({ path: _p, ...k }) => k), lessonSets: lessonSets(this.cfg).map((x) => ({ id: x.id, name: x.name, count: x.count, added: x.added === true, license: x.license || '', source: x.source || '', parts: partsView(path.dirname(x.file)) })), skills: (() => { const b = forgePlans(dir)[0]; return b ? Object.keys(readJson(path.join(dir, 'forge', 'plans', `${b.id}.json`), {}).skills || {}) : []; })() };
  },
  forgePlan(form = {}) {
    const dir = forgeDir(this.cfg);
    if (!dir) throw new Error('The Forge isn\'t next to this copy of Bob. It lives in the model-lab folder of Bob\'s source.');
    const id = String(form.base || '').replace(/[^\w.-]/g, '');
    const base = id ? readJson(path.join(dir, 'forge', 'plans', `${id}.json`), null) : null;
    if (id && !base) throw new Error('That Forge plan isn\'t there any more.');
    // The lesson library: a set with parts ticked off, or taught as its own thinking path, goes as a picked copy.
    const picks = form.lessonParts && typeof form.lessonParts === 'object' ? form.lessonParts : {};
    const ticked = new Set(Array.isArray(form.lessonSets) ? form.lessonSets : []);
    const sets = lessonSets(this.cfg).map((x) => {
      const dir = path.dirname(x.file), pick = picks[x.id];
      const one = { id: x.id, name: x.name, dir, total: x.count, picked: x.count, privateOnly: x.added === true && !x.license };
      if (!ticked.has(x.id) || !pick || typeof pick !== 'object') return one;
      const arr = (v) => (Array.isArray(v) ? v.map(String).slice(0, 200) : []);
      const r = pickLessons(dir, { offCategories: arr(pick.offCategories), offSources: arr(pick.offSources), offThinking: arr(pick.offThinking), pathName: String(pick.pathName || '') });
      return { ...one, dir: r.dir || dir, picked: r.count, pathName: r.dir ? String(pick.pathName || '').trim() : '' };
    });
    return makeForgePlan(form, { base: base || {}, keepFiles: this.keepFiles(), lessonSets: sets, pairsSets: this.protocolPairs ? this.protocolPairs() : [] });
  },
  // Add a lesson set from a file here or a .jsonl/.json file on Hugging Face: converted into the Lab's shape, then
  // broken into parts. The Hugging Face card's licence is kept with it; a set with none is for private use only.
  async addLibrarySet({ from = '', name = '' } = {}) {
    const root = lessonSetsDir(this.cfg); fs.mkdirSync(root, { recursive: true });
    let ref = String(from || '').trim().replace(/^"|"$/g, '').slice(0, 400);
    if (/^~[\\/]/.test(ref)) ref = path.join(os.homedir(), ref.slice(2)); // ~/lessons/set.jsonl on Mac and Linux
    if (!ref) throw new Error('Say where the lessons are: a full path to a .jsonl or .json file, or a Hugging Face set and file.');
    if (path.isAbsolute(ref) || /^[A-Za-z]:[\\/]/.test(ref)) {
      const r = addLessonSet({ root, from: ref, name, source: path.basename(ref).replace(/\.[^.]+$/, ''), now: this.now() });
      return { id: r.id, name: r.name, count: r.count, skipped: r.skipped, license: '' };
    }
    const hf = parseHfRef(/^hf:/i.test(ref) || /^https?:/i.test(ref) || /^datasets\//i.test(ref) ? ref : `hf:datasets/${ref}`, 'dataset');
    if (!hf || hf.kind !== 'dataset') throw new Error('That isn\'t a full path or a Hugging Face set. A set looks like owner/name:file.jsonl, or a huggingface.co link to the file.');
    const card = await hfLookup(hf, { fetchFn: this.hfFetch || fetch });
    if (card && card.ok === false) throw new Error(card.error || 'Hugging Face couldn\'t find that set.');
    const tmp = path.join(labDir(this.cfg), 'downloads', `lessons-${Date.now()}${path.extname(hf.file || '.jsonl')}`);
    try {
      await downloadHfLessons({ repo: hf.repo, file: hf.file, revision: hf.revision, to: tmp, fetchFn: this.hfFetch || fetch });
      const lic = String(card?.license || '').replace(/[^\w.+-]/g, '').slice(0, 60);
      const r = addLessonSet({ root, from: tmp, name: name || hf.repo.split('/')[1], source: hf.repo, license: lic, link: `https://huggingface.co/datasets/${hf.repo}`, now: this.now() });
      return { id: r.id, name: r.name, count: r.count, skipped: r.skipped, license: lic };
    } finally { try { fs.rmSync(tmp, { force: true }); } catch {} }
  },
  saveForgePlan(form = {}) {
    const r = this.forgePlan(form);
    if (r.problems.length) throw new Error(r.problems[0]);
    const dir = forgePlansDir(labDir(this.cfg)); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slugOf(r.plan.run)}.json`);
    writeJson(file, r.plan);
    return { file: path.basename(file) };
  },
  forgeLive() {
    const rec = readJson(this.forgeLiveFile(), null);
    if (!rec) return null;
    const running = rec.pid > 0 && (this.forgeAlive || alive)(rec.pid);
    let tail = []; try { tail = fs.readFileSync(rec.log, 'utf8').split(/\r?\n/).filter(Boolean).slice(-12).map(scrubForge); } catch {}
    return { plan: rec.plan, at: rec.at, running, hours: rec.hours, dollars: rec.dollars, tail, importing: Boolean(rec.importing && running), failed: rec.failed || '' };
  },
  // Nov 11: Teach it from my mistakes (lab-mistakes.js): the saved tests' asks, answered as Bob by a teacher brain.
  async startMistakes({ teacher = '' } = {}, { unload = false } = {}) {
    const cases = readMyTests(this.cfg);
    if (!cases.length) throw new Error('There are no saved tests yet. Press Save as a test on a reply that went wrong, then come back.');
    const dir = path.join(lessonSetsDir(this.cfg), slugOf(MISTAKES_NAME));
    const w = { name: MISTAKES_NAME, teacher, skills: [MISTAKES_SKILL], think: 'half', mine: true };
    const pl = this.planWrite({ ...w, count: cases.length });
    if (pl.problems.length) throw new Error(pl.problems[0]);
    const count = seedIdeas(dir, cases);
    return this.startWrite({ ...w, count }, { unload });
  },
  forgeStart({ id, hours, dollars } = {}) {
    const dir = forgeDir(this.cfg);
    const file = path.join(forgePlansDir(labDir(this.cfg)), `${slugOf(id)}.json`);
    const plan = readJson(file, null);
    const keys = this.forgeKeys();
    const problems = forgeStartProblems({ plan, allowed: this.cfg.labForgeStart === true, hasKey: Boolean(keys[FORGE_KEY]), shown: { hours, dollars }, running: Boolean(this.forgeLive()?.running), found: Boolean(dir), importer: Boolean(dir) && fs.existsSync(path.join(dir, 'import-lessons.mjs')), drive: dir ? onDrive(dir) : [], senses: forgeDoesSenses(dir) });
    if (problems.length) throw new Error(problems[0]);
    const log = path.join(labDir(this.cfg), 'forge-runs', `${slugOf(id)}-${new Date(this.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
    fs.mkdirSync(path.dirname(log), { recursive: true });
    const { file: node, env: nodeEnv } = nodeCmd();
    const live = { plan: slugOf(id), log, at: this.now(), hours: plan.hours_max, dollars: plan.dollars_max };
    const spawnFn = this.forgeSpawn || spawn;
    if (!(Array.isArray(plan.hf_lessons) && plan.hf_lessons.length)) {
      writeJson(this.forgeLiveFile(), { ...live, pid: launchForge({ dir, planFile: file, env: keys, node, nodeEnv, spawnFn, logTo: log }) });
      return { started: true };
    }
    // 1.5.163 Lessons from Hugging Face: the Forge's importer downloads and converts them here first, on a copy of the
    // plan (the saved plan keeps its Hugging Face names). It moves them into extra_lessons and drops hf_lessons; if it
    // fails, or hf_lessons is still there afterwards, the run never starts, so nothing is silently left out.
    const runPlan = log.replace(/\.log$/, '.plan.json');
    fs.copyFileSync(file, runPlan);
    const fd = fs.openSync(log, 'a');
    const imp = spawnFn(node, [path.join(dir, 'import-lessons.mjs'), '--plan', runPlan], { cwd: dir, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, ...nodeEnv } });
    fs.closeSync(fd);
    writeJson(this.forgeLiveFile(), { ...live, pid: imp.pid, importing: true });
    const done = (code) => {
      if (readJson(this.forgeLiveFile(), {})?.stopped) return; // Stop was pressed while importing: never start
      const after = readJson(runPlan, null);
      const ok = code === 0 && after && !(Array.isArray(after.hf_lessons) && after.hf_lessons.length);
      if (!ok) { try { fs.appendFileSync(log, `\nThe lessons from Hugging Face couldn't all be brought in (importer exit ${code}), so the run didn't start and nothing was rented.\n`); } catch {} writeJson(this.forgeLiveFile(), { ...live, pid: 0, importing: false, failed: 'The lessons from Hugging Face couldn\'t all be brought in, so the run didn\'t start and nothing was rented. The log says which one.' }); return; }
      writeJson(this.forgeLiveFile(), { ...live, pid: launchForge({ dir, planFile: runPlan, env: keys, node, nodeEnv, spawnFn, logTo: log }) });
    };
    if (imp.on) { imp.on('exit', (c) => done(c)); imp.on('error', () => done(-1)); } else done(-1);
    return { started: true, importing: true };
  },
  // Stop: end the Forge on this replicant matrix, then delete only this run's card (never every Forge card).
  async forgeStop() {
    const rec = readJson(this.forgeLiveFile(), null);
    if (!rec) throw new Error('No Forge run was started from the Lab.');
    if (rec.pid > 0) { try { (this.forgeKill || process.kill)(rec.pid); } catch {} } // never 0: that would mean every process in the group
    if (rec.importing) { writeJson(this.forgeLiveFile(), { ...rec, importing: false, stopped: true, pid: 0 }); return { stopped: true, pod: false }; } // nothing rented yet
    const dir = forgeDir(this.cfg), plan = readJson(path.join(forgePlansDir(labDir(this.cfg)), `${rec.plan}.json`), {}), pod = dir ? runPodId(dir, plan.run || rec.plan) : '';
    if (pod) {
      const { file: node, env: nodeEnv } = nodeCmd();
      await new Promise((resolve) => { const c = (this.forgeSpawn || spawn)(node, [path.join(dir, 'forge', 'forge.mjs'), '--kill', pod], { cwd: path.join(dir, 'forge'), stdio: 'ignore', windowsHide: true, env: { ...process.env, ...nodeEnv, ...this.forgeKeys() } }); c.on?.('exit', resolve); c.on?.('error', resolve); if (!c.on) resolve(); });
    }
    return { stopped: true, pod: Boolean(pod) };
  },
};
