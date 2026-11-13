// The Lab Playground's ladder: make a brain in several sizes, ask them all the same thing, and delete a ladder.
// Methods of the Lab class. Split out of lab.js.
import { readLadders, playDir, ladderTable, ladderSaw, LADDER, PLAY_MAX_GB, ladderDiskGB, ladderTexts } from './lab-playground.js';
import path from 'node:path';
import fs from 'node:fs';
import { gaming } from './sessions.js';
import { labDir, inspect, labModelsDir, slugOf, labOn, writeJson, readJson, isInsideDir } from './lab-measure.js';

// Methods of the Lab class (src/lab.js), put on it there with the same rules as the methods written inside it.
export const ladderJobs = {
  // 1.5.156 Playground: the quantization ladder. Results (small) in <data>/lab/playground/<slug>/ladder.json; the
  // running files (big) in <Bob's models>/lab/playground/<slug>/, which Delete all removes.
  ladders() {
    return readLadders(playDir(labDir(this.cfg))).map((l) => ({ id: l.id, brain: l.brain, when: l.when, state: l.state, deleted: Boolean(l.deleted), diskGB: l.diskGB, rows: ladderTable(l.rungs || []), saw: ladderSaw(ladderTable(l.rungs || [])), asked: l.asked || null, notes: l.notes || [] }));
  },
  planLadder(from, types) {
    const brain = this.brains().find((b) => b.id === String(from || ''));
    const problems = [], notes = [];
    // Professional mode picks which sizes to make; anything not on the ladder is ignored, none picked means all six.
    const steps = Array.isArray(types) && types.length ? LADDER.filter((x) => types.includes(x.type)) : LADDER;
    if (Array.isArray(types) && types.length && !steps.length) problems.push('None of those sizes is on the ladder. Pick from Q8 down to Q2.');
    if (!brain) return { problems: ['Pick a brain for the ladder.'], notes };
    let f = null; try { f = inspect(brain); } catch (e) { problems.push(e.message); }
    if (f && !f.fullSize) problems.push(`${brain.name} is already a running file (${f.fileType}). The ladder starts from the full-size copy (F16 or BF16).`);
    if (f && f.sizeGB > PLAY_MAX_GB) problems.push(`${brain.name} is ${f.sizeGB} GB. The ladder is for small brains, up to ${PLAY_MAX_GB} GB full size, so it fits in an evening and on the disk.`);
    const t = this.tools();
    for (const k of ['quantize', 'imatrix', 'server']) if (!t[k].found) problems.push(`${path.basename(t[k].path)} isn't in the built-in engine's folder. Settings > Engines: the built-in engine has it; download the engine again if it's missing.`);
    if (!t.perplexity.found) notes.push(`${path.basename(t.perplexity.path)} isn't in the built-in engine's folder, so the ladder skips the surprise score and uses the Lab test alone.`);
    const diskGB = f ? ladderDiskGB(f.sizeGB, steps) : 0;
    const out = path.join(labModelsDir(this.cfg), 'playground', slugOf(brain.name));
    let freeGB = null;
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); const st = fs.statfsSync(path.dirname(out)); freeGB = Math.round((st.bavail * st.bsize) / 1e9); } catch {}
    if (freeGB !== null && freeGB < diskGB + 5) problems.push(`The ladder needs about ${diskGB} GB of disk and there's ${freeGB} GB free. Free some space first.`);
    return { brain, facts: f, problems, notes, diskGB, out, slug: slugOf(brain.name), steps };
  },
  async startLadder(c = {}, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    const room = this.room();
    if (!room.ok) throw new Error(room.why);
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.planLadder(c.from, c.types);
    if (p.problems.length) throw new Error(p.problems[0]);
    this.freePeek(); // 1.5.164 Peek inside's engine goes first
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: 'ladder', name: `Ladder for ${p.brain.name}`, slug: p.slug, from: p.brain.id, fromName: p.brain.name, state: 'running', at: this.now(), steps: [{ id: 'measure', label: 'Measure which weights matter most', state: 'waiting' }, ...p.steps.map((x) => ({ id: x.type, label: `Make and test ${x.label}`, state: 'waiting' }))], progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.goLadder(runRec, p, ac.signal).catch(() => {});
    return { started: this.runView(runRec) };
  },
  async goLadder(r, p, signal) {
    const dir = path.join(playDir(labDir(this.cfg)), p.slug);
    const log = (t) => { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const fx = { ...this.defaultSteps(this.tools(), log), ...this.stepFns };
    const set = (i, state) => { r.steps[i].state = state; r.step = r.steps[i].id; r.stepLabel = r.steps[i].label; this.tell(r); };
    const texts = ladderTexts();
    fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(p.out, { recursive: true });
    const tune = path.join(dir, 'tune.txt'), score = path.join(dir, 'score.txt');
    fs.writeFileSync(tune, texts.tune); fs.writeFileSync(score, texts.score);
    const record = { brain: { name: p.brain.name, sizeGB: p.facts.sizeGB, quant: p.facts.fileType }, when: new Date(this.now()).toISOString().slice(0, 10), state: 'running', diskGB: p.diskGB, rungs: [], notes: p.notes, files: {} };
    const keep = () => writeJson(path.join(dir, 'ladder.json'), record);
    keep();
    try {
      set(0, 'running');
      const imatrix = path.join(p.out, 'imatrix.gguf');
      await fx.imatrix({ src: p.brain.gguf, corpus: tune, out: imatrix }, { recipe: { lessons: { chunks: 20 } }, signal });
      set(0, 'done');
      const ladder = p.steps || LADDER;
      for (let i = 0; i < ladder.length; i++) {
        const x = ladder[i];
        set(i + 1, 'running');
        const out = path.join(p.out, `${p.slug}-${x.type}.gguf`);
        await fx.quantize({ src: p.brain.gguf, out, type: x.type, imatrix }, { signal });
        let ppl = null;
        if (this.tools().perplexity.found || this.stepFns.perplexity) ppl = await fx.perplexity({ gguf: out, text: score }, { signal }).catch((e) => { if (signal.aborted) throw e; log(`perplexity: ${e.message}`); return null; });
        const t = await fx.test({ gguf: out }, { signal, onProgress: (d) => { r.progress = Math.round((100 * (i + 1 + d)) / (ladder.length + 1)); } });
        let size = 0; try { size = Math.round((fs.statSync(out).size / 1e9) * 10) / 10; } catch {}
        record.rungs.push({ type: x.type, sizeGB: size, score: t.score, tps: t.tps || null, ppl });
        record.files[x.type] = out;
        keep();
        set(i + 1, 'done');
      }
      record.state = 'done'; keep();
      r.report = { ladder: ladderTable(record.rungs), saw: ladderSaw(ladderTable(record.rungs)), id: p.slug };
      r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: true });
    } catch (e) {
      record.state = signal.aborted ? 'stopped' : 'failed'; keep();
      r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it. The sizes finished so far are kept; Delete all takes them back.' : e.message;
      const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
      log(`failed: ${e.stack || e.message}`);
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { this.job = null; }
  },
  // The same question, asked of every size the ladder made, one after another at temperature 0.
  async startLadderAsk(c = {}, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    this.freePeek(); // 1.5.164
    const id = slugOf(c.id), question = String(c.question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    const file = path.join(playDir(labDir(this.cfg)), id, 'ladder.json');
    const rec = readJson(file, null);
    if (!rec?.brain) throw new Error('There\'s no ladder by that name. Make one first.');
    if (rec.deleted) throw new Error('This ladder\'s files were deleted. Make it again to ask it questions.');
    const have = LADDER.filter((x) => rec.files?.[x.type] && fs.existsSync(rec.files[x.type]));
    if (!have.length) throw new Error('None of this ladder\'s files are here any more.');
    if (!question) throw new Error('Type a question to ask every size.');
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: 'ladder-ask', name: `Same question, every size: ${rec.brain.name}`, from: id, fromName: rec.brain.name, state: 'running', at: this.now(), steps: have.map((x) => ({ id: x.type, label: `Ask ${x.label}`, state: 'waiting' })), progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    (async () => {
      const signal = ac.signal, fx = { ...this.defaultSteps(this.tools(), () => {}), ...this.stepFns };
      const answers = [];
      try {
        for (let i = 0; i < have.length; i++) {
          runRec.steps[i].state = 'running'; runRec.stepLabel = runRec.steps[i].label; this.tell(runRec);
          const t0 = this.now();
          const text = await fx.ask({ gguf: rec.files[have[i].type], question }, { signal });
          answers.push({ type: have[i].type, label: have[i].label, text: String(text || '').slice(0, 4000), seconds: Math.round((this.now() - t0) / 100) / 10 });
          runRec.steps[i].state = 'done'; runRec.progress = Math.round((100 * (i + 1)) / have.length); this.tell(runRec);
        }
        rec.asked = { question, answers, when: new Date(this.now()).toISOString().slice(0, 10) }; writeJson(file, rec);
        runRec.report = { asked: rec.asked }; runRec.state = 'done'; runRec.stepLabel = '';
      } catch (e) {
        runRec.state = signal.aborted ? 'stopped' : 'failed'; runRec.error = signal.aborted ? 'You stopped it.' : e.message;
      } finally { this.job = null; this.tell(runRec); this.broadcast({ type: 'lab-done', name: runRec.name, ok: runRec.state === 'done' }); }
    })();
    return { started: this.runView(runRec) };
  },
  // Delete all: the ladder's running files go; the small results stay, so the table is still there to look at.
  deleteLadder(id) {
    if (this.job?.run?.kind?.startsWith('ladder') && slugOf(this.job.run.slug || this.job.run.from) === slugOf(id)) throw new Error('This ladder is still running. Stop it first.');
    const file = path.join(playDir(labDir(this.cfg)), slugOf(id), 'ladder.json');
    const rec = readJson(file, null);
    if (!rec?.brain) throw new Error('There\'s no ladder by that name.');
    const root = path.join(labModelsDir(this.cfg), 'playground', slugOf(id));
    let freed = 0;
    for (const f of [...Object.values(rec.files || {}), path.join(root, 'imatrix.gguf')]) {
      if (!isInsideDir(f, root)) continue; // only files the ladder made, in its own folder
      try { freed += fs.statSync(f).size; fs.rmSync(f, { force: true }); } catch {}
    }
    try { fs.rmdirSync(root); } catch {}
    rec.deleted = true; rec.files = {}; writeJson(file, rec);
    return { freedGB: Math.round((freed / 1e9) * 10) / 10 };
  },
};
