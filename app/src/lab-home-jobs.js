// The Forge's home ways on this computer: mix, stack, take out the refusal habit, and trying refusals.
// Methods of the Lab class. Split out of lab.js.
import { PLAY_MAX_GB } from './lab-playground.js';
import path from 'node:path';
import fs from 'node:fs';
import { MIX_IDS, planMix, planStack, mixGguf, shareOf, stackGguf } from './lab-merge.js';
import { planRefusals, pickLayers, removeRefusals, writeTeachBack, TEACH_BACK_SET, RELUCTANT_PROMPTS, PLAIN_PROMPTS, readDirections, reflexCheck, keptCheck } from './lab-refusals.js';
import { brainFacts, readGguf } from './lab-gguf.js';
import { startServer } from './lab-test.js';
import { inspect, slugOf, madeBrains, labModelsDir, writeJson, round1, GB, measureRecord, sha256File } from './lab-measure.js';
import { lessonSetsDir, run } from './lab-plan.js';

// Methods of the Lab class (src/lab.js), put on it there with the same rules as the methods written inside it.
export const homeJobs = {
  homeBrain(id, what) {
    const b = this.brains().find((x) => x.id === String(id || ''));
    if (!b) return { problem: `Pick ${what}.` };
    let f = null; try { f = inspect(b); } catch (e) { return { brain: b, problem: `Couldn't read ${b.name}'s file: ${e.message}` }; }
    if (!f.fullSize) return { brain: b, facts: f, problem: `${b.name} is a running file (${f.fileType}). This starts from the full-size copy (F16 or BF16).` };
    if (f.sizeGB > PLAY_MAX_GB) return { brain: b, facts: f, problem: `${b.name} is ${f.sizeGB} GB full size. Here it's for brains up to ${PLAY_MAX_GB} GB; bigger ones go the same way on a rented card.` };
    return { brain: b, facts: f, problem: '' };
  },
  // The plan for a home way: kind = mix | stack | refusals; form = the page's answers. Never writes anything.
  planHome(kind, form = {}) {
    const problems = [], notes = [];
    const name = String(form.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60);
    const slug = slugOf(name);
    if (!name) problems.push('Give the new brain a name.');
    else if (madeBrains(this.cfg).some((m) => m.id === `lab-${slug}`) || this.runs.some((r) => r.slug === slug && r.state === 'running')) problems.push(`You already have a Lab brain called ${name}. Pick another name.`);
    const dir = path.join(labModelsDir(this.cfg), slug), out = path.join(dir, `${slug}.gguf`);
    if (name && fs.existsSync(out)) problems.push(`There's already a file for ${name} in the Lab's folder. Pick another name.`);
    const tools = this.tools();
    let a = null, b = null, parent = null, bytes = 0, refusals = null, mix = null, stack = null;
    if (kind === 'mix') {
      a = this.homeBrain(form.a, 'the first brain'); b = this.homeBrain(form.b, 'the second brain');
      for (const x of [a, b]) if (x.problem) problems.push(x.problem);
      if (a.brain && b.brain && a.brain.id === b.brain.id) problems.push('Pick two different brains to mix.');
      const how = MIX_IDS.includes(form.how) ? form.how : 'slerp';
      if (how === 'ties') { parent = this.homeBrain(form.parent, 'the parent brain'); if (parent.problem) problems.push(parent.problem); }
      if (!problems.length) { mix = planMix({ a: a.brain.gguf, b: b.brain.gguf, parent: parent?.brain?.gguf || '', how, lean: form.lean, name }); problems.push(...mix.problems); notes.push(...mix.notes); bytes = mix.bytes; }
      if (a.brain && b.brain && a.brain.license && b.brain.license && a.brain.license !== b.brain.license) notes.push(`The mix carries both licences: ${a.brain.license} and ${b.brain.license}. The stricter one applies.`);
      if ([a.brain, b.brain].some((x) => x && /non-?commercial|\bnc\b/i.test(x.license || ''))) notes.push('One parent is non-commercial, so the mix is too.');
      notes.push('Test the mix against both parents in Challenges and Compare; a mix can\'t know anything neither parent knew.');
    } else if (kind === 'stack') {
      a = this.homeBrain(form.a, 'the first brain'); if (a.problem) problems.push(a.problem);
      if (form.b) { b = this.homeBrain(form.b, 'the second brain'); if (b.problem) problems.push(b.problem); }
      if (!problems.length) { stack = planStack({ a: a.brain.gguf, b: b?.brain?.gguf || '', ranges: Array.isArray(form.ranges) ? form.ranges : [], name }); problems.push(...stack.problems); notes.push(...stack.notes); bytes = stack.bytes; }
    } else if (kind === 'refusals') {
      a = this.homeBrain(form.from, 'a brain'); if (a.problem) problems.push(a.problem);
      const pr = planRefusals(form, { facts: a.facts, tools: { cvector: this.stepFns.direction ? { found: true } : tools.cvector, server: this.stepFns.checks ? { found: true } : tools.server } });
      refusals = pr.refusals; problems.push(...pr.problems.filter((x) => !a.problem || !/full-size|GB full size/.test(x))); notes.push(...pr.notes);
      bytes = a.facts ? a.facts.sizeGB * 1e9 : 0;
    } else problems.push('There\'s no home way by that name.');
    if (!tools.server.found && !this.stepFns.test) problems.push('The built-in engine (llama-server) isn\'t here, so the new brain can\'t be tested. Get it in Settings, Engines.');
    let freeGB = null;
    try { fs.mkdirSync(path.dirname(dir), { recursive: true }); const st = fs.statfsSync(path.dirname(dir)); freeGB = Math.round((st.bavail * st.bsize) / 1e9); } catch {}
    const diskGB = Math.round((bytes / 1e9) * 10) / 10;
    if (freeGB !== null && bytes && freeGB < diskGB + 2) problems.push(`The new brain takes about ${diskGB} GB of disk and there's ${freeGB} GB free. Free some space first.`);
    return { kind, name, slug, dir, out, a, b, parent, problems: [...new Set(problems)], notes, diskGB, refusals, mix, stack };
  },
  async startHome(kind, form = {}, { unload = false } = {}) {
    const p = this.planHome(kind, form);
    if (p.problems.length) throw new Error(p.problems[0]);
    const wait = await this.preflight({ unload }); if (wait) return wait;
    const label = { mix: 'Mix the two brains', stack: 'Write the stacked layers', refusals: 'Take the direction out of the weights' }[kind];
    const steps = [...(kind === 'refusals' ? [{ id: 'direction', label: 'Find the refusal direction' }] : []), { id: kind, label }, ...(kind === 'refusals' && p.refusals.check ? [{ id: 'check', label: 'Check the reflex and the kept refusals' }] : []), ...(kind === 'refusals' && !p.refusals.check ? [{ id: 'reflex', label: 'Check the reflex' }] : []), { id: 'test', label: 'The Lab test' }];
    const r = { id: `lab-${this.now().toString(36)}`, kind, name: p.name, slug: p.slug, from: p.a.brain.id, fromName: kind === 'mix' ? `${p.a.brain.name} and ${p.b.brain.name}` : p.a.brain.name, license: kind === 'mix' ? [...new Set([p.a.brain.license, p.b.brain.license].filter(Boolean))].join(' + ') : p.a.brain.license, state: 'running', at: this.now(), steps: steps.map((s) => ({ ...s, state: 'waiting' })), progress: 0, form: { ...form, name: p.name } };
    if (kind === 'refusals') { r.naughty = p.refusals.naughty; r.refusalsOut = true; }
    this.runs.push(r); this.save();
    const ac = new AbortController();
    this.job = { run: r, ac };
    this.goHome(r, p, ac.signal).catch(() => {});
    return { started: this.runView(r) };
  },
  async goHome(r, p, signal) {
    const log = (t) => { try { fs.mkdirSync(p.dir, { recursive: true }); fs.appendFileSync(path.join(p.dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const fx = { ...this.defaultSteps(this.tools(), log), ...this.homeSteps(log), ...this.stepFns };
    const set = (id, state) => { const i = r.steps.findIndex((s) => s.id === id); if (i < 0) return; r.steps[i].state = state; r.step = id; r.stepLabel = r.steps[i].label; this.tell(r); };
    const onProgress = (x) => { r.progress = Math.round(100 * x); this.broadcast({ type: 'lab', run: this.runView(r) }); };
    const report = {};
    try {
      fs.mkdirSync(p.dir, { recursive: true });
      let dirs = null;
      if (p.kind === 'refusals') {
        set('direction', 'running');
        dirs = await fx.direction({ src: p.a.brain.gguf, dir: p.dir }, { signal });
        set('direction', 'done');
        set('refusals', 'running');
        const blocks = pickLayers(dirs, p.refusals.layers, p.a.facts.layers);
        const res = await removeRefusals({ src: p.a.brain.gguf, out: p.out, dirs, blocks, strength: p.refusals.strength / 100, name: p.name }, { onProgress, signal });
        report.refusals = { strength: p.refusals.strength, layers: res.layers, edited: res.edited, check: p.refusals.check, teachBack: p.refusals.teachBack, naughty: p.refusals.naughty };
        log(`took the direction out of ${res.edited} weight tables in layers ${res.layers.join(',')} at ${p.refusals.strength}%`);
        set('refusals', 'done');
        set(p.refusals.check ? 'check' : 'reflex', 'running');
        const c = await fx.checks({ gguf: p.out, kept: p.refusals.check }, { signal, onProgress });
        report.refusals.reflex = c.reflex; if (c.kept) report.refusals.kept = c.kept;
        log(`reflex: declined ${c.reflex.declined} of ${c.reflex.of}${c.kept ? `; kept refusals: ${c.kept.declined} of ${c.kept.of}` : ''}`);
        set(p.refusals.check ? 'check' : 'reflex', 'done');
        if (p.refusals.teachBack) {
          const lessons = writeTeachBack(path.join(lessonSetsDir(this.cfg), TEACH_BACK_SET));
          writeJson(path.join(p.dir, 'teach-back.json'), { brain: p.out, lessons, note: 'Teach back the kept refusals: a short heal on this lesson set, on a rented card. The Forge runs it (its next build); the Lab wrote what it needs.' });
          report.refusals.teachBack = 'planned';
        }
      } else if (p.kind === 'mix') {
        set('mix', 'running');
        const how = MIX_IDS.includes(p.mix && r.form.how) ? r.form.how : 'slerp';
        await mixGguf({ a: p.a.brain.gguf, b: p.b.brain.gguf, parent: p.parent?.brain?.gguf || '', how, lean: r.form.lean, name: p.name, out: p.out }, { onProgress, signal });
        report.mix = { how, lean: Number(r.form.lean) || 0, share: Math.round(100 * shareOf(r.form.lean)), parents: [p.a.brain.name, p.b.brain.name], parent: p.parent?.brain?.name || '' };
        set('mix', 'done');
      } else if (p.kind === 'stack') {
        set('stack', 'running');
        await stackGguf({ a: p.a.brain.gguf, b: p.b?.brain?.gguf || '', ranges: r.form.ranges, name: p.name, out: p.out }, { onProgress, signal });
        report.stack = { layers: p.stack.layers, from: p.a.facts.layers, ranges: r.form.ranges, second: p.b?.brain?.name || '' };
        set('stack', 'done');
      }
      set('test', 'running');
      const test = await fx.test({ gguf: p.out }, { signal, onProgress });
      set('test', 'done');
      const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
      r.files = { gguf: p.out, mmproj: null };
      r.sizeGB = round1(size(p.out) / GB);
      r.report = { ...report, made: test, from: null, sizeGB: r.sizeGB, fromGB: round1(size(p.a.brain.gguf) / GB), at: this.now() };
      writeJson(path.join(p.dir, 'lab-report.json'), { name: r.name, kind: p.kind, from: r.fromName, form: r.form, ...r.report });
      r.stepLabel = 'Write the measurement record'; this.tell(r);
      const facts = (() => { try { return brainFacts(readGguf(p.out)); } catch { return {}; } })();
      writeJson(path.join(p.dir, 'measure.json'), measureRecord({ name: r.name, sha256: await sha256File(p.out, signal), facts, sizeGB: r.sizeGB, template: p.kind, parent: r.fromName, test, engine: this.engineName(), cfg: this.cfg, when: this.now() }));
      r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: true, score: test?.score });
    } catch (e) {
      r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it.' : e.message;
      const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
      log(`failed: ${e.stack || e.message}`);
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { this.job = null; }
  },
  // The steps the home ways add (tests swap in fakes): the direction finder and the checks on a running brain.
  homeSteps(log) {
    const tools = this.tools();
    const askOne = async (url, question, signal) => {
      const res = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: question }], temperature: 0, max_tokens: 160, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.any([signal, AbortSignal.timeout(180e3)]) });
      const j = await res.json();
      return String(j.choices?.[0]?.message?.content || '');
    };
    return {
      // llama-cvector-generator by the difference of means: direction.N per layer, N from 1. Reused when it's already there.
      direction: async (s, { signal }) => {
        const out = path.join(s.dir, 'direction.gguf');
        if (!fs.existsSync(out)) {
          const pos = path.join(s.dir, 'prompts-reluctant.txt'), neg = path.join(s.dir, 'prompts-plain.txt');
          fs.writeFileSync(pos, RELUCTANT_PROMPTS.join('\n') + '\n'); fs.writeFileSync(neg, PLAIN_PROMPTS.join('\n') + '\n');
          const args = ['-m', s.src, '--positive-file', pos, '--negative-file', neg, '-o', out, '--method', 'mean'];
          await run(tools.cvector.path, [...args, '-ngl', '999'], { signal, log }).catch((e) => { if (signal.aborted) throw e; return run(tools.cvector.path, [...args, '-ngl', '0'], { signal, log }); });
        }
        return readDirections(out);
      },
      // The reflex (a few mild prompts) and, when asked, the kept-refusals check, on the brain at `gguf`, with
      // optional control-vector flags (Try it first). Answers are never kept.
      checks: async (s, { signal, onProgress = () => {} }) => {
        const srv = await startServer({ exe: tools.server.path, gguf: s.gguf, ctx: 4096, signal, log, extra: s.extra || [] });
        try {
          const reflex = await reflexCheck(srv.url, { signal, ask: askOne });
          onProgress(0.5);
          const kept = s.kept ? await keptCheck(srv.url, { signal, ask: askOne }) : null;
          onProgress(1);
          return { reflex, kept, where: srv.where };
        } finally { srv.stop(); }
      }
    };
  },
  // Try it first: the same direction applied at run time as a control vector, nothing written. A short Lab job that
  // reports the reflex before and after, and the kept refusals after.
  async tryRefusals(form = {}, { unload = false } = {}) {
    const p = this.planHome('refusals', { ...form, name: form.name || 'try' });
    const real = p.problems.filter((x) => !/^Give the new brain|already have a Lab brain|already a file/.test(x));
    if (real.length) throw new Error(real[0]);
    const wait = await this.preflight({ unload }); if (wait) return wait;
    const dir = path.join(labModelsDir(this.cfg), 'refusals', slugOf(p.a.brain.name));
    const r = { id: `lab-${this.now().toString(36)}`, kind: 'refusals-try', name: `Try it first: ${p.a.brain.name} without the refusal habit`, from: p.a.brain.id, fromName: p.a.brain.name, state: 'running', at: this.now(), steps: [{ id: 'direction', label: 'Find the refusal direction', state: 'waiting' }, { id: 'before', label: 'Ask it as it is', state: 'waiting' }, { id: 'after', label: 'Ask it with the direction held out', state: 'waiting' }], progress: 0 };
    this.runs.push(r); this.save();
    const ac = new AbortController();
    this.job = { run: r, ac };
    (async () => {
      const signal = ac.signal, log = (t) => { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
      const fx = { ...this.homeSteps(log), ...this.stepFns };
      const set = (i, state) => { r.steps[i].state = state; r.step = r.steps[i].id; r.stepLabel = r.steps[i].label; this.tell(r); };
      try {
        fs.mkdirSync(dir, { recursive: true });
        set(0, 'running');
        const dirs = await fx.direction({ src: p.a.brain.gguf, dir }, { signal });
        const blocks = pickLayers(dirs, p.refusals.layers, p.a.facts.layers);
        set(0, 'done'); set(1, 'running');
        const before = await fx.checks({ gguf: p.a.brain.gguf, kept: false }, { signal, onProgress: (x) => { r.progress = Math.round(50 * x); } });
        set(1, 'done'); set(2, 'running');
        const extra = ['--control-vector-scaled', `${path.join(dir, 'direction.gguf')}:${-p.refusals.strength / 100}`, '--control-vector-layer-range', String(Math.min(...blocks) + 1), String(Math.max(...blocks) + 1)];
        const after = await fx.checks({ gguf: p.a.brain.gguf, kept: p.refusals.check, extra }, { signal, onProgress: (x) => { r.progress = 50 + Math.round(50 * x); } });
        set(2, 'done');
        r.report = { tried: { before: before.reflex, after: after.reflex, kept: after.kept || null, strength: p.refusals.strength, layers: blocks } };
        r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      } catch (e) {
        r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it.' : e.message;
        const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
        log(`failed: ${e.stack || e.message}`);
      } finally { this.job = null; this.tell(r); this.broadcast({ type: 'lab-done', name: r.name, ok: r.state === 'done', error: r.error }); }
    })();
    return { started: this.runView(r) };
  },
};
