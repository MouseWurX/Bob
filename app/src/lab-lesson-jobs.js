// Lab jobs that make lessons: write a lesson set with a teacher brain, build one from the owner's files, and look at,
// trim or export a set. Methods of the Lab class. Split out of lab.js.
import path from 'node:path';
import { gaming } from './sessions.js';
import fs from 'node:fs';
import { readFile as readSource, expandItems, KIND_WORDS, MAX_FILES } from './lab-build-read.js';
import { survey, userName, wouldLearn, scrub } from './lab-build-scan.js';
import { SAMPLE_COUNT } from './lab-build-kinds.js';
import { writeZip } from './zip.js';
import { cleanWrite, lessonSetsDir, teacherLicence, SECONDS_PER_LESSON, cleanBuild, skillOf, lessonSets } from './lab-plan.js';
import { slugOf, readJson, labOn, writeJson, readJsonl, lessonCard } from './lab-measure.js';

// Methods of the Lab class (src/lab.js), put on it there with the same rules as the methods written inside it.
export const lessonJobs = {
  // Write a new lesson set (its own Lab job: it takes hours, and any recipe can use the set after).
  planWrite(w) {
    const x = cleanWrite(w), problems = [], notes = [];
    const t = this.brains().find((b) => b.id === x.teacher);
    if (!x.name) problems.push('Give the lesson set a name.');
    if (!t) problems.push('Pick a teacher.');
    if (!x.skills.length) problems.push('Tick at least one skill.');
    const slug = slugOf(x.name);
    const dir = path.join(lessonSetsDir(this.cfg), slug);
    const old = readJson(path.join(dir, 'write.json'), null);
    if (old && old.teacher !== x.teacher && !x.mine) problems.push(`You already have a lesson set called ${x.name}, from another teacher. Pick another name.`);
    if (old && old.teacher === x.teacher) notes.push(`There's already a lesson set called ${x.name} from this teacher. Bob carries on with it: the lessons it has stay, and he writes the rest.`);
    if (t) {
      const lic = teacherLicence(t.license);
      if (!lic.ok) problems.push(lic.note); else if (lic.note) notes.push(lic.note);
      if (t.naughty) notes.push(`${t.name} is on the naughty list, so its lessons teach its ways too.`);
      if (!this.tools().server.found) problems.push(`${path.basename(this.tools().server.path)} isn't in Bob's engine folder. Settings, Engines, Bob's own engine has it.`);
    }
    notes.push('A teacher teaches best when it\'s at least as good as the brain you\'ll teach: the brain you\'re going to cut is often the best teacher here.');
    const hours = Math.max(1, Math.round((x.count * SECONDS_PER_LESSON) / 3600));
    return { write: x, teacher: t, problems, notes, dir, slug, out: path.join(dir, 'lessons.jsonl'), hours };
  },
  async startWrite(w, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.planWrite(w);
    if (p.problems.length) throw new Error(p.problems[0]);
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    fs.mkdirSync(p.dir, { recursive: true });
    writeJson(path.join(p.dir, 'write.json'), { ...p.write, teacherName: p.teacher.name, at: this.now(), done: false });
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: 'write', name: p.write.name, slug: p.slug, from: p.teacher.id, fromName: p.teacher.name, write: p.write, state: 'running', at: this.now(), steps: [{ id: 'teacher', label: `Start ${p.teacher.name} as the teacher`, state: 'waiting' }, { id: 'write', label: `Write ${p.write.count} lessons`, state: 'waiting' }], progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.goWrite(runRec, p, ac.signal).catch(() => {});
    return { started: this.runView(runRec) };
  },
  async goWrite(r, p, signal) {
    const log = (t) => { try { fs.appendFileSync(path.join(p.dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const fx = { ...this.defaultSteps(this.tools(), log), ...this.stepFns };
    let srv = null;
    const set = (i, state) => { r.steps[i].state = state; r.step = r.steps[i].id; r.stepLabel = r.steps[i].label; this.tell(r); };
    try {
      set(0, 'running');
      srv = await fx.serve({ gguf: p.teacher.gguf, ctx: 16384, signal, log });
      set(0, 'done');
      set(1, 'running');
      const t0 = this.now();
      let last = 0;
      const n = await fx.write({ url: srv.url, out: p.out, skills: p.write.skills, count: p.write.count, think: p.write.think, ...(p.write.mine ? { ideasOnly: true } : {}) }, { signal, log, onProgress: (d, total) => {
        r.progress = Math.round((100 * d) / total); r.stepLabel = `Write ${total} lessons: ${d} written`;
        if (Date.now() - last > 2000) { last = Date.now(); this.broadcast({ type: 'lab', run: this.runView(r) }); }
      } });
      if (!n) throw new Error(`${p.teacher.name} didn't write any lessons Bob could use. A teacher that knows tools and answers in JSON works best.`);
      set(1, 'done');
      writeJson(path.join(p.dir, 'write.json'), { ...p.write, teacherName: p.teacher.name, at: this.now(), done: true, written: n });
      r.files = { lessons: p.out };
      r.report = { lessons: n, of: p.write.count, skills: p.write.skills, minutes: Math.round((this.now() - t0) / 60000) };
      if (n < p.write.count) r.notes = [`${p.teacher.name} gave ${n} usable lessons of the ${p.write.count} asked for. Start it again with the same name to write more.`];
      r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: true });
    } catch (e) {
      r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it. The lessons written so far are kept; start it again with the same name to carry on.' : e.message;
      const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
      log(`failed: ${e.stack || e.message}`);
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { srv?.stop(); this.job = null; }
  },
  planBuild(b) {
    const x = cleanBuild(b), problems = [], notes = [];
    const t = this.brains().find((bb) => bb.id === x.teacher);
    if (!x.name) problems.push('Give the lesson set a name.');
    if (!x.items.length) problems.push('Add at least one file or folder.');
    if (!x.kinds.length) problems.push('Tick at least one kind of lesson.');
    if (!t) problems.push('Pick a teacher.');
    const slug = slugOf(x.name), dir = this.buildDir(slug);
    const old = readJson(path.join(dir, 'build.json'), null);
    if (fs.existsSync(path.join(dir, 'write.json'))) problems.push(`You already have a lesson set called ${x.name} that Bob wrote. Pick another name.`);
    if (old && old.teacher !== x.teacher) problems.push(`You already have a lesson set called ${x.name}, from another teacher. Pick another name.`);
    if (old && old.teacher === x.teacher && old.done) notes.push(`There's already a set called ${x.name} from these files. Bob carries on with it: the lessons it has stay, and he builds the rest.`);
    if (t) {
      const lic = teacherLicence(t.license);
      if (!lic.ok) problems.push(lic.note); else if (lic.note) notes.push(lic.note);
      if (!this.tools().server.found) problems.push(`${path.basename(this.tools().server.path)} isn't in Bob's engine folder. Settings, Engines, Bob's own engine has it.`);
    }
    const skills = [...new Set(x.items.map((i) => i.skill))];
    if (skills.length > 12) problems.push(`That's ${skills.length} skills. Keep it to 12 or fewer, or the coverage cut has nothing to protect: give files that belong together the same skill name.`);
    notes.push('Your files are read in place and never copied. Only the passages that become lessons are kept, here, in the Lab folder.');
    const hours = Math.max(1, Math.round((x.count * SECONDS_PER_LESSON) / 3600));
    return { build: x, teacher: t, problems, notes, dir, slug, out: path.join(dir, 'lessons.jsonl'), hours, skills, sample: readJsonl(path.join(dir, 'sample.jsonl')).map(lessonCard) };
  },
  // The survey (stage A of the preview): instant, no teacher. Text, Markdown, web pages and chat logs are read here;
  // documents that need LibreOffice are read too when it's there, up to 40 of them (the rest are counted by size).
  async surveyBuild(b, { signal, read = readSource } = {}) {
    const x = cleanBuild(b);
    const office = this.officeFor();
    const { files, over } = expandItems(x.items);
    const skillOf = (file) => files.find((f) => f.path === file)?.skill || 'My files';
    const items = [];
    let officeRead = 0, estimated = 0;
    for (const f of files) {
      if (signal?.aborted) throw new Error('Stopped.');
      if (f.kind === 'office') {
        if (!office) { items.push({ path: f.path, skill: skillOf(f.path), read: { file: f.path, name: f.name, kind: f.kind, passages: [], exchanges: [], skipped: 'needs LibreOffice to read (Settings, Engines)' } }); continue; }
        if (officeRead >= 40) { estimated++; const w = Math.round(f.bytes / 8); items.push({ path: f.path, skill: skillOf(f.path), read: { file: f.path, name: f.name, kind: f.kind, passages: Array.from({ length: Math.max(1, Math.round(w / 450)) }, (_, i) => ({ text: '', at: i + 1, words: 450, estimated: true })), exchanges: [] } }); continue; }
        officeRead++;
      }
      items.push({ path: f.path, skill: skillOf(f.path), read: await read(f.path, { cfg: this.cfg, office, signal }) });
    }
    const sv = survey(items, { user: userName() });
    const kindsFound = Object.fromEntries(Object.entries(sv.byKind).map(([k, n]) => [KIND_WORDS[k] || k, n]));
    return { ...sv, byKind: kindsFound, over, maxFiles: MAX_FILES, estimated, officeOk: Boolean(office), skills: Object.keys(sv.perSkill), wouldLearn: wouldLearn(sv, x.kinds, x.count, Object.keys(sv.perSkill)), supplyTotal: x.kinds.reduce((a, k) => a + (sv.supply[k] || 0), 0) };
  },
  // Start a build (sample = the 12 sample lessons of stage B; else the whole set). Its own Lab job, like the writer.
  async startBuild(b, { unload = false, sample = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.planBuild(b);
    if (p.problems.length) throw new Error(p.problems[0]);
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    fs.mkdirSync(p.dir, { recursive: true });
    const old = readJson(path.join(p.dir, 'build.json'), {});
    writeJson(path.join(p.dir, 'build.json'), { ...p.build, teacherName: p.teacher.name, at: this.now(), done: old.done === true && !sample ? false : old.done === true, written: old.written || 0 });
    const label = sample ? `Make ${SAMPLE_COUNT} sample lessons from your files` : `Build ${p.build.count} lessons from your files`;
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: sample ? 'sample' : 'build', name: p.build.name, slug: p.slug, from: p.teacher.id, fromName: p.teacher.name, build: p.build, state: 'running', at: this.now(), steps: [{ id: 'teacher', label: `Start ${p.teacher.name} as the teacher`, state: 'waiting' }, { id: 'build', label, state: 'waiting' }], progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.goBuild(runRec, p, ac.signal, sample).catch(() => {});
    return { started: this.runView(runRec) };
  },
  async goBuild(r, p, signal, sample) {
    const log = (t) => { try { fs.appendFileSync(path.join(p.dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const fx = { ...this.defaultSteps(this.tools(), log), ...this.stepFns };
    let srv = null;
    const set = (i, state) => { r.steps[i].state = state; r.step = r.steps[i].id; r.stepLabel = r.steps[i].label; this.tell(r); };
    try {
      set(0, 'running');
      srv = await fx.serve({ gguf: p.teacher.gguf, ctx: 16384, signal, log });
      set(0, 'done');
      set(1, 'running');
      const t0 = this.now();
      let last = 0;
      const office = this.officeFor();
      const job = { url: srv.url, dir: p.dir, items: p.build.items, kinds: p.build.kinds, count: p.build.count, think: p.build.think, resay: p.build.resay, sample, feedback: p.build.feedback, office: office ? { soffice: office.soffice, python: office.python, dir: office.dir, name: office.name } : null, agentDir: this.cfg.agentDir, user: userName() };
      const res = await fx.build(job, { signal, log, onProgress: (d, total) => {
        r.progress = total ? Math.round((100 * d) / total) : 0; r.stepLabel = `${sample ? 'Sample' : 'Build'} ${total} lessons: ${d} made`;
        if (Date.now() - last > 2000) { last = Date.now(); this.broadcast({ type: 'lab', run: this.runView(r) }); }
      } });
      const n = res.n;
      if (!n) throw new Error(`${p.teacher.name} didn't make any lessons Bob could use from these files. Check the survey: were any passages left after the held-back ones and the skipped files?`);
      set(1, 'done');
      const sources = readJson(path.join(p.dir, 'sources.json'), {});
      if (!sample) writeJson(path.join(p.dir, 'build.json'), { ...readJson(path.join(p.dir, 'build.json'), {}), done: true, written: n, at: this.now() });
      r.files = { lessons: sample ? path.join(p.dir, 'sample.jsonl') : p.out };
      r.report = { lessons: n, of: sample ? SAMPLE_COUNT : p.build.count, skills: p.skills, minutes: Math.round((this.now() - t0) / 60000), held: res.held ?? sources.held ?? 0, dupes: res.dupes ?? sources.dupes ?? 0, sample, ...(sample ? { cards: readJsonl(path.join(p.dir, 'sample.jsonl')).map(lessonCard) } : {}) };
      if (!sample && n < p.build.count) r.notes = [`Your files gave ${n} lessons of the ${p.build.count} asked for${res.held ? ` (${res.held} passages held back)` : ''}. Add more files, or start it again with the same name after adding them.`];
      r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: true });
    } catch (e) {
      r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it. The lessons made so far are kept; start it again with the same name to carry on.' : e.message;
      const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
      log(`failed: ${e.stack || e.message}`);
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { srv?.stop(); this.job = null; }
  },
  // The viewer: one built set's lessons as cards, with a search box and filters. Only sets built here (build.json).
  setLessons(id, { q = '', skill = '', file = '', kind = '', from = 0, limit = 50 } = {}) {
    const set = lessonSets(this.cfg).find((x) => x.id === slugOf(id));
    if (!set) throw new Error('That lesson set isn\'t here any more.');
    const all = readJsonl(set.file);
    const needle = String(q || '').toLowerCase();
    const hit = all.filter((l) => (!skill || l.job === skill) && (!file || l.source?.name === file) && (!kind || l.kind === kind) && (!needle || JSON.stringify(l.messages || []).toLowerCase().includes(needle)));
    const files = [...new Set(all.map((l) => l.source?.name).filter(Boolean))].sort();
    return { id: set.id, name: set.name, total: all.length, found: hit.length, from, files, skills: [...new Set(all.map((l) => l.job).filter(Boolean))], kinds: [...new Set(all.map((l) => l.kind).filter(Boolean))], cards: hit.slice(from, from + limit).map(lessonCard), sources: readJson(path.join(path.dirname(set.file), 'sources.json'), null) };
  },
  // Remove lessons by key, or every lesson from one file. The set is written again without them.
  removeLessons(id, { keys = [], file = '' } = {}) {
    const set = lessonSets(this.cfg).find((x) => x.id === slugOf(id));
    if (!set || !set.built) throw new Error('Only a set built from your files can be edited here.');
    const drop = new Set([].concat(keys || []).map(String));
    const all = readJsonl(set.file);
    const keep = all.filter((l) => !drop.has(String(l.idea)) && !(file && l.source?.name === file));
    fs.writeFileSync(set.file + '.part', keep.map((l) => JSON.stringify(l)).join('\n') + (keep.length ? '\n' : ''));
    fs.renameSync(set.file + '.part', set.file);
    if (file) { const b = readJson(path.join(path.dirname(set.file), 'build.json'), null); if (b) { b.feedback = b.feedback || {}; b.feedback.dropFiles = [...new Set([...(b.feedback.dropFiles || []), file])]; writeJson(path.join(path.dirname(set.file), 'build.json'), b); } }
    return { removed: all.length - keep.length, total: keep.length };
  },
  // Export as a file: the one way a set leaves the Lab folder. The release's scrub rules run first and what changed is
  // returned, so the owner sees it. `check` only shows what would change, without writing anything.
  exportSet(id, { folder = '', check = false } = {}) {
    const set = lessonSets(this.cfg).find((x) => x.id === slugOf(id));
    if (!set) throw new Error('That lesson set isn\'t here any more.');
    const all = readJsonl(set.file);
    const changes = new Map();
    const lines = all.map((l) => { const { text, changes: c } = scrub(JSON.stringify({ ...l, source: l.source ? { name: path.basename(l.source.name || ''), at: l.source.at } : undefined }), { user: userName() }); for (const x of c) changes.set(x.what, (changes.get(x.what) || 0) + x.n); return text; });
    const what = [...changes].map(([w, n]) => ({ what: w, n }));
    if (check) return { lessons: all.length, changes: what };
    if (!folder || !fs.existsSync(folder) || !fs.statSync(folder).isDirectory()) throw new Error('Pick the folder to save the zip in.');
    const zip = path.join(folder, `${set.id}-lessons.zip`);
    if (fs.existsSync(zip)) throw new Error(`There's already a ${path.basename(zip)} in that folder. Move it first.`);
    const readme = [`${set.name}: a lesson set built in Bob's Computer Science Lab from the owner's own files.`, '', `${all.length} lessons. Each line of lessons.jsonl is one lesson: a message, the assistant's answer (and the tools it used), the lesson's skill ("job") and kind.`, 'Names, addresses and e-mails were replaced before this file was written; check it yourself before you share it, it is your material.', '', `Made ${new Date(this.now()).toISOString().slice(0, 10)} with Bob (https://github.com/MouseWurX/Bob).`].join('\n');
    const skills = { name: set.name, skills: set.skills, kinds: set.kinds, lessons: all.length, teacher: set.teacher };
    writeZip(zip, [{ name: 'lessons.jsonl', data: Buffer.from(lines.join('\n') + '\n') }, { name: 'README.txt', data: Buffer.from(readme) }, { name: 'skills.json', data: Buffer.from(JSON.stringify(skills, null, 1)) }]);
    return { file: zip, lessons: all.length, changes: what };
  },
};
