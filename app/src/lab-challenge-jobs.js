// Lab Challenges: run the test packs on a brain, its log, and saving a result. Methods of the Lab class. Split out of lab.js.
import { gaming } from './sessions.js';
import { readMyPacks, runMyPack } from './lab-mypacks.js';
import { PACK_IDS, PACKS, scoreFile, mergeScores, mergeWobble, wobbleOf } from './lab-challenges.js';
import { cleanGen, spread, rankable, genLine } from './lab-gen.js';
import path from 'node:path';
import fs from 'node:fs';
import { NEEDS_SANDBOX } from './lab-packs.js';
import { ownRefusalAsks } from './lab-guard.js';
import { benchBrain, benchLine } from './lab-bench.js';
import { labOn, labDir, WOBBLE_RUNS, WOBBLE_TEMP, inspect, scoresDir, slugOf, writeJson, readJson, resultsDir, cell, cleanResult, resultText, hardwareLine } from './lab-measure.js';
import { lessonSets, lessonSetsDir, run } from './lab-plan.js';
import { FACT_PACK_IDS, FACTS_SET, FACTS_SET_2, writeFactLessons } from './lab-facts.js'; // Nov 12 Straight facts

// Methods of the Lab class (src/lab.js), put on it there with the same rules as the methods written inside it.
export const challengeJobs = {
  async startChallenge(c = {}, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    const room = this.room();
    if (!room.ok) throw new Error(room.why);
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const brain = this.brains().find((b) => b.id === String(c.from || ''));
    if (!brain) throw new Error('Pick a brain to challenge.');
    const mine = readMyPacks(labDir(this.cfg)); // 1.5.168 your own packs, by id "my:<name>"
    const packs = [...new Set([].concat(c.packs || []).filter((id) => PACK_IDS.includes(id) || mine.some((m) => m.id === id)))];
    if (!packs.length) throw new Error('Tick at least one challenge.');
    let gen = cleanGen(c.gen || {}); // 1.5.168 Simple mode sends nothing, so the defaults
    // Show the wobble (Nov 11): three runs, a little randomness so they can differ, and the ± beside the score.
    // The scores of a wobble run don't go on the board (only temperature 0 does); its ± does.
    const wobble = c.wobble === true;
    if (wobble) gen = cleanGen({ ...gen, repeats: Math.max(WOBBLE_RUNS, gen.repeats), temperature: gen.temperature || WOBBLE_TEMP });
    if (!this.tools().server.found) throw new Error(`${path.basename(this.tools().server.path)} isn't in Bob's engine folder. Settings, Engines, Bob's own engine has it.`);
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const title = (id) => (PACKS.find((p) => p.id === id) || mine.find((m) => m.id === id)).title;
    // The standard speed test after the challenges, when ticked (off unless ticked) and the tool is here.
    const bench = c.bench === true;
    if (bench && !this.benchTool().found && !this.stepFns.bench) throw new Error('The standard speed test (llama-bench) isn\'t here. It comes with the built-in engine and with Brain Engine (Settings > Engines). Untick it, or get one of them again.');
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: 'challenge', name: `Challenges for ${brain.name}`, from: brain.id, fromName: brain.name, packs, gen, bench, ...(wobble ? { wobble: true } : {}), state: 'running', at: this.now(), steps: [{ id: 'serve', label: `Start ${brain.name}`, state: 'waiting' }, ...packs.map((id) => ({ id, label: title(id), state: 'waiting' })), ...(bench ? [{ id: 'bench', label: 'The standard speed test (llama-bench)', state: 'waiting' }] : [])], progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.goChallenge(runRec, brain, packs, ac.signal, gen, mine).catch(() => {});
    return { started: this.runView(runRec) };
  },
  async goChallenge(r, brain, packs, signal, gen = cleanGen({}), mine = []) {
    const dir = path.join(labDir(this.cfg), 'challenges');
    const log = (t) => { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const fx = { ...this.defaultSteps(this.tools(), log), ...this.stepFns };
    let srv = null;
    const set = (i, state) => { r.steps[i].state = state; r.step = r.steps[i].id; r.stepLabel = r.steps[i].label; this.tell(r); };
    try {
      set(0, 'running');
      srv = await fx.serve({ gguf: brain.gguf, ctx: gen.ctx, signal, log });
      set(0, 'done');
      const sandbox = packs.some((id) => id === 'code' || id === 'quiz' || NEEDS_SANDBOX.includes(id)) ? await fx.sandbox({ signal }) : null;
      const holdAsks = packs.includes('guard') ? ownRefusalAsks(lessonSets(this.cfg).map((x) => path.dirname(x.file))) : []; // 1.5.164 the person's own refusal lessons
      // 1.5.168 every question and answer goes in a log beside the run, and Professional mode can repeat the run.
      const logFile = path.join(dir, 'logs', `${r.id}.jsonl`);
      try { fs.mkdirSync(path.dirname(logFile), { recursive: true }); fs.writeFileSync(logFile, ''); } catch {}
      const results = {}, runs = {}; let last = 0;
      const total = packs.length * gen.repeats;
      for (let rep = 0; rep < gen.repeats; rep++) {
        for (let i = 0; i < packs.length; i++) {
          const id = packs[i], k = rep * packs.length + i;
          set(i + 1, 'running');
          if (gen.repeats > 1) { r.stepLabel = `${r.steps[i + 1].label} (run ${rep + 1} of ${gen.repeats})`; this.tell(r); }
          const itemLog = (x) => { try { fs.appendFileSync(logFile, JSON.stringify({ pack: id, run: rep + 1, ...x, q: String(x.q || '').slice(0, 4000), answer: String(x.answer || '').slice(0, 4000) }) + '\n'); } catch {} };
          const onStep = (d, t) => {
            r.progress = Math.round((100 * (k + d / t)) / total);
            if (Date.now() - last > 2000) { last = Date.now(); this.broadcast({ type: 'lab', run: this.runView(r) }); }
          };
          const my = mine.find((m) => m.id === id);
          const res = my ? await (fx.myPack || runMyPack)(srv.url, my, { signal, onStep, gen, repeat: rep, log: itemLog }) : await fx.pack(srv.url, id, { signal, sandbox, holdAsks, gen, repeat: rep, log: itemLog, onStep });
          (runs[id] ||= []).push(res);
          set(i + 1, 'done');
        }
      }
      // Straight facts: after any of its packs, the sourced lesson set is ready for Teach it (written once, never over yours).
      if (packs.some((id) => FACT_PACK_IDS.includes(id))) { try { for (const [round, set] of [[1, FACTS_SET], [2, FACTS_SET_2]]) { const d = path.join(lessonSetsDir(this.cfg), set); if (!fs.existsSync(path.join(d, 'lessons.jsonl'))) writeFactLessons(d, round); } } catch (e) { log(`straight facts lessons: ${e.message}`); } }
      // The standard speed test loads the brain on its own, so the challenge server goes first.
      let bench = null;
      if (r.bench) {
        srv?.stop(); srv = { ...srv, stop() {} };
        const bi = r.steps.findIndex((x) => x.id === 'bench');
        set(bi, 'running');
        bench = await (fx.bench || ((g, o) => benchBrain(this.cfg, g, { ...o, tool: this.benchTool() })))(brain.gguf, { signal, onLine: (l) => { if (/benchmark \d+\/\d+/.test(l)) log(`bench: ${l.trim().slice(0, 200)}`); } });
        if (signal.aborted) throw new Error('Stopped.');
        set(bi, bench.ok ? 'done' : 'failed');
        if (!bench.ok) log(`bench: ${bench.error}`);
      }
      for (const id of packs) { // the last run's details, with the average score and the spread when it was repeated
        const all = runs[id], lastRun = all[all.length - 1], sp = all.length > 1 ? spread(all.map((x) => x.score)) : null;
        results[id] = sp ? { ...lastRun, score: sp.mean, spread: sp } : lastRun;
      }
      let facts = {}; try { facts = inspect(brain); } catch {}
      const sha256 = await fx.fingerprint(brain.gguf, signal).catch(() => '');
      const speeds = Object.values(results).filter((x) => x.tps);
      const tps = speeds.length ? Math.round((10 * speeds.reduce((a, x) => a + x.tps, 0)) / speeds.length) / 10 : 0;
      const reads = Object.values(results).filter((x) => x.prefillTps);
      const prefillTps = reads.length ? Math.round(reads.reduce((a, x) => a + x.prefillTps, 0) / reads.length) : 0;
      const file = scoreFile(scoresDir(this.cfg), slugOf(brain.name));
      // 1.5.168 only runs made with the ranked settings go on the scoreboard, and never your own packs.
      const ranked = rankable(gen), boardPacks = Object.fromEntries(Object.entries(results).filter(([id]) => PACK_IDS.includes(id)));
      if (ranked && Object.keys(boardPacks).length) writeJson(file, mergeScores(readJson(file, null), { name: brain.name, brainId: brain.id, sha256, sizeGB: facts.sizeGB, quant: facts.fileType, paramsB: facts.paramsB, activeB: facts.experts ? facts.activeB : 0, experts: facts.experts, madeHere: Boolean(brain.madeInLab), packs: boardPacks, tps, prefillTps, when: new Date(this.now()).toISOString().slice(0, 10), engine: this.engineName(), where: srv.where, bench: bench?.ok ? bench : null }));
      // Show the wobble (Nov 11): repeated runs put their ± beside the brain's scores, ranked or not.
      const wobbled = Object.fromEntries(Object.entries(results).filter(([id, x]) => PACK_IDS.includes(id) && x.spread?.runs > 1).map(([id, x]) => [id, x.spread]));
      if (Object.keys(wobbled).length && r.wobble) writeJson(file, mergeWobble(readJson(file, null), { name: brain.name, brainId: brain.id, packs: wobbled, when: new Date(this.now()).toISOString().slice(0, 10) }));
      const titleOf = (id) => (PACKS.find((p) => p.id === id) || mine.find((m) => m.id === id))?.title || id;
      r.report = { challenges: packs.map((id) => ({ id, title: titleOf(id), score: results[id].score, right: results[id].right, of: results[id].of, skipped: results[id].skipped || '', ...(results[id].parts ? { parts: results[id].parts } : {}), ...(results[id].groups ? { groups: results[id].groups } : {}), ...(results[id].spread ? { spread: results[id].spread, wobble: wobbleOf(results[id].spread) } : {}), ...(results[id].note ? { note: results[id].note } : {}) })), tps, settings: genLine(gen), ranked, hasLog: fs.existsSync(logFile), ...(bench ? { bench: bench.ok ? { read: bench.read, write: bench.write, prompt: bench.prompt, gen: bench.gen, line: benchLine(bench) } : { error: bench.error } } : {}) };
      r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: true });
    } catch (e) {
      r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it. Nothing was added to the scoreboard.' : e.message;
      const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
      log(`failed: ${e.stack || e.message}`);
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { srv?.stop(); this.job = null; }
  },
  // 1.5.168 A challenge run's log: every question, the answer, and whether it passed. Read it, or save it as JSONL or CSV.
  challengeLog(id, { save = '' } = {}) {
    const run = this.runs.find((x) => x.id === id && x.kind === 'challenge');
    if (!run) throw new Error('That run isn\'t here any more.');
    const file = path.join(labDir(this.cfg), 'challenges', 'logs', `${run.id}.jsonl`);
    let rows = []; try { rows = fs.readFileSync(file, 'utf8').split('\n').filter((l) => l.trim()).map((l) => JSON.parse(l)); } catch { throw new Error('There\'s no log for that run. Runs from before 1.5.168 didn\'t keep one.'); }
    if (!save) return { rows: rows.slice(0, 2000), total: rows.length, settings: run.report?.settings || '' };
    const dir = resultsDir(this.cfg); fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(this.now()).toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const out = path.join(dir, `${slugOf(run.name)}-log-${stamp}.${save}`);
    const cell = (v) => { const t = String(v ?? '').replace(/\r?\n/g, ' '); return /[",]/.test(t) || /^[=+\-@]/.test(t) ? `"${t.replace(/^([=+\-@])/, "'$1").replace(/"/g, '""')}"` : t; };
    const okText = (v) => (v === true ? 'pass' : v === false ? 'miss' : String(v));
    fs.writeFileSync(out, save === 'jsonl' ? rows.map((x) => JSON.stringify(x)).join('\n') + '\n' : ['Challenge,Run,Group,Question,Answer,Result', ...rows.map((x) => [x.pack, x.run, x.group || '', x.q, x.answer, okText(x.ok)].map(cell).join(','))].join('\n') + '\n');
    return { file: path.basename(out) };
  },
  // Save a result the page sends (a table, or a picture of one) in the Lab's results folder. Returns the file name.
  saveResult(body, { version = '' } = {}) {
    const r = cleanResult(body);
    if (!r.head.length) throw new Error('There\'s nothing to save yet.');
    const dir = resultsDir(this.cfg);
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(this.now()).toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = path.join(dir, `${slugOf(r.title)}-${stamp}.${r.format}`);
    if (r.format === 'png') {
      const m = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(String(body.png || ''));
      if (!m) throw new Error('The picture didn\'t come through. Try again.');
      const buf = Buffer.from(m[1], 'base64');
      if (buf.length > 8 * 1024 * 1024 || buf.subarray(1, 4).toString('latin1') !== 'PNG') throw new Error('That isn\'t a picture I can save.');
      fs.writeFileSync(file, buf);
    } else fs.writeFileSync(file, resultText(r, { version, hardware: r.hardware ? hardwareLine(this.cfg) : '', when: new Date(this.now()).toISOString().slice(0, 10) }));
    return { file: path.basename(file), folder: dir };
  },
};
