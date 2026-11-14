// 14 Nov Lab steps that run here, free, from the Steps tab (docs/LAB-STEPS-PLAN.md, slice 3). Each has a small fixed
// form: the page sends choices, never a command. One step at a time, never while another Lab protocol step runs, and
// every run writes its run record (src/lab-runs.js). Rented steps aren't run from here: they go in a Forge plan, which
// only starts on the owner's press and typed caps. Methods of the Lab class.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { forgeDir } from './lab-forge.js';
import { lessonSets, lessonSetsDir } from './lab-plan.js';
import { labDir, readJson, writeJson, slugOf } from './lab-measure.js';
import { nodeCmd } from './selftools.js';
import { stepById, stepsView } from './lab-steps.js';
import { startRun, finishRun, checkStart, listRuns } from './lab-runs.js';
import { savePipeline, readPipeline, listPipelines, pipelineProgress, pipelineScores, packBlocks, blockDraft, prevOutput, protocolPipeline, PREV } from './lab-pipelines.js';
import { VERSION } from './config.js';

const freeName = (root, base) => { let n = base, i = 2; while (fs.existsSync(path.join(root, n))) n = `${base}-${i++}`; return n; };

// The forms. needs: what the page asks for. plan(): the fixed args and where the output goes.
export const STEP_FORMS = {
  'pii-scrub': {
    needs: ['set'],
    plan({ set, lessonsRoot }) {
      const id = freeName(lessonsRoot, `${path.basename(path.dirname(set.file))}-scrub`), out = path.join(lessonsRoot, id);
      return { args: ['--in', path.dirname(set.file), '--out', out], out, kind: 'lessons', inputs: [{ kind: 'lessons', path: path.dirname(set.file) }], after: () => writeJson(path.join(out, 'write.json'), { name: `${set.name}, scrubbed`, count: set.count, done: true, scrubbedFrom: path.basename(path.dirname(set.file)) }), notes: [`A new lesson set "${set.name}, scrubbed" is made. ${set.name} itself is only read.`, 'If anything private is still there after the scrub, it stops and keeps nothing.'] };
    }
  },
  'eval-sets': {
    needs: [],
    plan({ root }) {
      const out = path.join(root, 'checks', `checks-${Date.now().toString(36)}.jsonl`);
      return { args: ['--out', out], out, kind: 'checks', inputs: [], notes: ['Only the taught questions go out. The fair tests (packs with "new" in their name) are never put in a reward pass.'] };
    }
  }
};

export const stepRunJobs = {
  lessonSetsList() { return lessonSets(this.cfg).map((x) => ({ id: x.id, name: x.name, count: x.count })); },
  stepRunFile() { return path.join(labDir(this.cfg), 'protocol', 'step-job.json'); },
  stepCheck(id, form = {}) {
    const s = stepById(id), f = STEP_FORMS[id], problems = [], notes = [];
    if (!s || !f) return { problems: ['That step doesn\'t run from here yet.'], notes };
    if (s.where !== 'here') problems.push('This step runs on a rented card, through a Forge plan.');
    const dir = forgeDir(this.cfg);
    if (!dir) problems.push('Bob can\'t find the model-lab folder.');
    else if (s.script && !fs.existsSync(path.join(dir, s.script))) problems.push(`${s.script} isn't in this copy's model-lab folder yet.`);
    let set = null;
    if (f.needs.includes('set')) { set = lessonSets(this.cfg).find((x) => x.id === String(form.set || '')); if (!set) problems.push('Pick a lesson set.'); }
    if (problems.length) return { problems, notes };
    const p = f.plan({ set, lessonsRoot: lessonSetsDir(this.cfg), root: path.join(labDir(this.cfg), 'protocol') });
    problems.push(...checkStart(labDir(this.cfg), id, p.inputs));
    return { problems, notes: [...notes, ...(p.notes || [])], p, s, dir };
  },
  stepRun(id, form = {}, { pipeline = '', pipelineStep = null } = {}) {
    const job = readJson(this.stepRunFile(), null);
    if (job?.state === 'running') throw new Error('A step is already running. One at a time.');
    if (readJson(path.join(labDir(this.cfg), 'protocol', 'job.json'), null)?.state === 'running') throw new Error('A protocol step is running. One at a time.');
    const c = this.stepCheck(id, form);
    if (c.problems.length) throw new Error(c.problems[0]);
    const { p, s, dir } = c, lab = labDir(this.cfg);
    fs.mkdirSync(path.dirname(this.stepRunFile()), { recursive: true });
    const log = path.join(path.dirname(this.stepRunFile()), `${slugOf(id)}-${new Date(this.now()).toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
    const run = startRun(lab, { step: id, settings: form, inputs: p.inputs, pipeline, pipelineStep, bob: VERSION.label || '', now: this.now() });
    const { file: node, env } = nodeCmd();
    const fd = fs.openSync(log, 'a');
    const child = (this.stepSpawn || spawn)(node, [path.join(dir, s.script), ...p.args], { cwd: dir, stdio: ['ignore', fd, fd], windowsHide: true, env: { ...process.env, ...env } });
    fs.closeSync(fd);
    const rec = { step: id, name: s.name, state: 'running', at: this.now(), log, pid: child.pid || 0, run: run.id, out: p.kind === 'lessons' ? p.out : '', pipeline };
    writeJson(this.stepRunFile(), rec);
    const done = (code) => {
      if (readJson(this.stepRunFile(), null)?.state === 'stopped') return; // stopped by hand: stepStop wrote it all
      let state = code === 0 ? 'done' : 'failed', message = code === 0 ? `${s.name} is done.` : `It stopped (exit ${code}). The last lines of its log say why.`;
      if (code === 0) { try { p.after?.(); } catch (e) { state = 'failed'; message = e.message; } }
      try { finishRun(lab, run.id, { state, outputs: state === 'done' ? [{ kind: p.kind, path: p.out }] : [], message, now: this.now() }); } catch {}
      if (state !== 'done' && p.out && p.kind === 'lessons') { try { fs.rmSync(p.out, { recursive: true, force: true }); } catch {} } // nothing half-made is kept
      writeJson(this.stepRunFile(), { ...rec, state, pid: 0, message });
      this.broadcast?.({ type: 'lab-step', state });
      // in a pipeline, a step that finished well hands on to the next one when that one also runs here, free
      if (state === 'done' && pipeline) { try { this.pipelineGo(pipeline, { auto: true }); } catch {} }
    };
    if (child.on) { child.on('exit', (code) => done(code)); child.on('error', () => done(-1)); } else done(-1);
    return { started: true, run: run.id, notes: c.notes };
  },
  stepStop() {
    const job = readJson(this.stepRunFile(), null);
    if (!job || job.state !== 'running') return { stopped: false };
    if (job.pid > 0) { try { (this.stepKill || process.kill)(job.pid); } catch {} }
    try { finishRun(labDir(this.cfg), job.run, { state: 'stopped', message: 'Stopped by hand.', now: this.now() }); } catch {}
    if (job.out) { try { fs.rmSync(job.out, { recursive: true, force: true }); } catch {} }
    writeJson(this.stepRunFile(), { ...job, state: 'stopped', pid: 0, message: 'Stopped. Nothing it was making was kept.' });
    return { stopped: true };
  },
  // ---- pipelines (slice 5) ----
  pipelinesView() {
    const lab = labDir(this.cfg), runs = listRuns(lab, { limit: 2000 }), view = stepsView(forgeDir(this.cfg));
    return { pipelines: listPipelines(lab).map((p) => { const pr = pipelineProgress(lab, p, runs); return { ...p, progress: pr, chart: pipelineScores(pr), blocks: packBlocks(p.steps).map((b) => ({ ...b, draft: b.on === 'rented' ? blockDraft(p, b) : null })) }; }), protocol: protocolPipeline(view) };
  },
  pipelineSave(p) { return savePipeline(labDir(this.cfg), p, this.now()); },
  // A step that runs from its own page (or one you don't need this time) can be skipped; the page says it was.
  pipelineSkip(slug, i, skip = true) {
    const lab = labDir(this.cfg), p = readPipeline(lab, slug);
    if (!p || !Number.isInteger(i) || !p.steps[i]) throw new Error('There\'s no such step in that pipeline.');
    const set = new Set(p.skipped || []); if (skip) set.add(i); else set.delete(i);
    writeJson(path.join(lab, 'pipelines', `${p.slug}.json`), { ...p, skipped: [...set].sort((a, b) => a - b) });
    return { skipped: [...set] };
  },
  // Runs the pipeline's next step when it runs here, free, and has a form; otherwise says in words what's next and
  // where it starts. Started again after a stop, it picks up at the first step not done.
  pipelineGo(slug, { auto = false } = {}) {
    const lab = labDir(this.cfg), p = readPipeline(lab, slug);
    if (!p) throw new Error('There\'s no pipeline by that name.');
    const pr = pipelineProgress(lab, p);
    if (pr.done) return { started: false, done: true, message: `${p.name} is done: every step finished.` };
    if (pr.running) return { started: false, message: 'A step of it is running now.' };
    const i = pr.next, x = p.steps[i], s = stepById(x.id), at = `Step ${i + 1} of ${p.steps.length}, ${s.name}`;
    const block = packBlocks(p.steps).find((b) => b.steps.includes(i));
    if (block.on === 'rented') { const names = block.steps.map((j) => stepById(p.steps[j].id).name); return { started: false, waiting: 'rented', message: `${at}, runs on a rented card${names.length > 1 ? ` with ${names.length - 1} more step${names.length > 2 ? 's' : ''} in a row (${names.join(', ')}), packed so the card starts once` : ''}. Start it from the Forge with your own caps; they start at $0.`, draft: blockDraft(p, block) }; }
    if (!STEP_FORMS[x.id]) return { started: false, waiting: 'page', message: `${at}, starts from its own page. When it's done, press Continue here.` };
    const form = { ...x.form };
    if (form.set === PREV) { const o = prevOutput(pr, i, 'lessons'); if (!o) return { started: false, message: `${at}, takes the lessons the step before made, and that step made none.` }; form.set = path.basename(o.path); }
    if (auto && readJson(this.stepRunFile(), null)?.state === 'running') return { started: false };
    const r = this.stepRun(x.id, form, { pipeline: p.slug, pipelineStep: i });
    return { ...r, message: `${at}, started.` };
  },
  stepJob() { const j = readJson(this.stepRunFile(), null); return j ? { step: j.step, name: j.name, state: j.state, message: j.message || '' } : null; }
};
