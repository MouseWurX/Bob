// 1.5.141 Computer Science Lab (Lab 1: free, on this replicant matrix). A recipe from the Lab page becomes a list of
// steps: count which experts the lessons use (llama-imatrix), cut the experts (Bob's own cutter, src/lab-gguf.js),
// take out sight or hearing, make the running files (llama-quantize), then the Lab test (src/lab-test.js). Nothing is
// rented and nothing is downloaded here; the rented parts are Lab 2. One Lab job at a time, never while Gaming is on.
import fs from 'node:fs';
import path from 'node:path';
import { OS } from './platform.js'; // 1.5.171 a Mac's graphics memory is shared, so the Challenges line says so
import { spawn } from 'node:child_process';
import { foldGguf, foldUse } from './lab-fold.js';
import { readGguf, brainFacts, writeGguf, readCounts, busiest, coverageKeep, checkKeep, isHearingTensor, isSightTensor } from './lab-gguf.js';
import { startServer, runQuiz } from './lab-test.js';
import { entryTools } from './lab-entry.js'; // Nov 11: the real entry test
import { recheckOn, readRecheck } from './lab-recheck.js';
import { saveSettings } from './config.js';
import { labEngineDirs, engineNameOf, LAB_ENGINES } from './engines.js';
import { gaming } from './sessions.js';
import { templateById } from '../public/lab-templates.js';
import { nodeCmd } from './selftools.js';
import { LESSON_SKILLS } from './lab-skills.js';
// 1.5.152 Lab 2c, the lesson builder: lessons from the owner's own files, with a preview before anything big runs.
import { KINDS, SAMPLE_COUNT } from './lab-build-kinds.js';
import { findOffice } from './office.js';
import { parseHfRef, hfLookup } from './lab-hf.js'; // 1.5.163
import { PACKS, runPack, brainScores, readScores, scoreboard, codeTool, CLASSES } from './lab-challenges.js'; // 1.5.153 Challenges
import { runSandboxed, sandboxHolds } from './selftools.js';
import { GEN_DEFAULT, CTX_CHOICES, MAX_REPEATS } from './lab-gen.js'; // 1.5.168 Professional mode
import { readMyPacks, CHECKS as MY_CHECKS } from './lab-mypacks.js'; // 1.5.168 your own packs
import { SETTINGS as GUARD_SETTINGS, STYLES as GUARD_STYLES } from './lab-guard.js'; // 1.5.164 Guard rails
import { forgeDir, forgePlansDir, FORGE_KEY, forgeStartProblems, onDrive } from './lab-forge.js';
import { rentKeyEnv } from './rental.js'; // 1.5.159 the Forge tab
import { LADDER, PLAY_MAX_GB, readPerplexity } from './lab-playground.js'; // 1.5.156 Playground
import { forgeDoesSenses } from './lab-senses.js';
// 1.5.164 the Forge's home ways (mix, stack, take out the refusal habit) and Peek inside
import { MIX_WAYS } from './lab-merge.js';
import { PLAIN_PROMPTS, RELUCTANT_PROMPTS, LAYER_CHOICES, KEPT } from './lab-refusals.js';
import { traceBuilt } from './lab-peek.js';
import { findTool } from './llama-tools.js';
import { labOn, WOBBLE_RUNS, WOBBLE_TEMP, MIN_RAM_GB, labRoom, RUNNING_TYPES, exeName, slugOf, GB, round1, readJson, writeJson, lessonCard, labDir, scoresDir, resultsDir, cleanResult, hardwareLine, resultText, labModelsDir, madeFile, fullSizeDirOf, madeBrains, mergeMadeBrains, labBrains, inspect, cutSizes, fitWords, cleanRecipe, measureRecord, sha256File, compareTable, compareCsv } from './lab-measure.js';
import { planRecipe, lessonText, lessonSkills, lessonSkillNames, maskFor, run, lessonSetsDir, WRITER, SECONDS_PER_LESSON, cleanWrite, teacherLicence, lessonSets, partsView, BUILDER, BUILD_MAX, BUILD_MIN, BUILD_DEFAULT, skillFromPath, cleanBuild, facts0 } from './lab-plan.js';
import { guardChat, labRoute } from './lab-routes.js';
import { lessonJobs } from './lab-lesson-jobs.js';
import { challengeJobs } from './lab-challenge-jobs.js';
import { ladderJobs } from './lab-ladder-jobs.js';
import { forgeJobs } from './lab-forge-jobs.js';
import { homeJobs } from './lab-home-jobs.js';
import { protocolJobs } from './lab-protocol.js'; // 13 Nov the training protocol's free steps
import { peekJobs } from './lab-peek-jobs.js';
export { labOn, WOBBLE_RUNS, WOBBLE_TEMP, MIN_RAM_GB, labRoom, RUNNING_TYPES, slugOf, lessonCard, labDir, scoresDir, resultsDir, cleanResult, hardwareLine, resultText, labModelsDir, madeFile, fullSizeDirOf, madeBrains, mergeMadeBrains, labBrains, inspect, cutSizes, fitWords, cleanRecipe, measureRecord, sha256File, compareTable, compareCsv } from './lab-measure.js';
export { planRecipe, lessonText, lessonSkills, lessonSkillNames, maskFor, lessonSetsDir, WRITER, SECONDS_PER_LESSON, cleanWrite, teacherLicence, lessonSets, partsView, BUILDER, BUILD_MAX, BUILD_MIN, BUILD_DEFAULT, skillFromPath, cleanBuild } from './lab-plan.js';
export { guardChat, labRoute } from './lab-routes.js';

export class Lab {
  constructor(cfg, { shop, brain, broadcast = () => {}, now = Date.now, steps = {}, room = () => labRoom() } = {}) {
    this.room = room; // tests pass their own, so the result doesn't depend on the tester's memory
    this.cfg = cfg; this.shop = shop; this.brain = brain; this.broadcast = broadcast; this.now = now;
    this.runsFile = path.join(labDir(cfg), 'runs.json');
    this.recipesFile = path.join(labDir(cfg), 'recipes.json');
    this.runs = readJson(this.runsFile, []);
    for (const r of this.runs) if (r.state === 'running') { r.state = 'failed'; r.error = 'Bob closed while this was running.'; }
    this.job = null;
    this.stepFns = steps; // tests swap in fakes
    entryTools().catch(() => {}); // Nov 11: Bob's real tool list for the Lab test, read once
  }

  // 1.5.17x The Lab's engine (Settings > Engines, or the Lab's own picker): its folder is looked in first, then the
  // others, so a tool only one download carries (the direction finder, the adapter folder) is still found.
  tools() {
    const dirs = labEngineDirs(this.cfg);
    const find = (name) => { const n = exeName(name); for (const d of dirs) { const p = path.join(d, n); if (fs.existsSync(p)) return p; } return path.join(dirs[0], n); };
    const t = { server: find('llama-server'), imatrix: find('llama-imatrix'), quantize: find('llama-quantize'), perplexity: find('llama-perplexity'), cvector: find('llama-cvector-generator'), brainEngine: path.join(this.cfg.agentDir, 'brain-engine', exeName('llama-server')) };
    return Object.fromEntries(Object.entries(t).map(([k, p]) => [k, { path: p, found: fs.existsSync(p) }]));
  }

  // The Lab's engine as the Lab page shows it: the pick, and the engine and build the Lab's own server will run.
  engineView() {
    const server = this.tools().server;
    const dir = path.dirname(server.path);
    let version = '';
    for (const f of ['bob-brainengine.json', 'bob-llamacpp.json']) { try { version = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).version || ''; if (version) break; } catch {} }
    return { pick: LAB_ENGINES.includes(this.cfg.labEngine) ? this.cfg.labEngine : '', name: engineNameOf(this.cfg, dir), version, found: server.found, brainEngineHere: this.tools().brainEngine.found };
  }
  setLabEngine(pick) { const v = LAB_ENGINES.includes(pick) ? pick : ''; saveSettings(this.cfg, { labEngine: v }); this.cfg.labEngine = v; return this.engineView(); }

  brains() { return labBrains(this.shop); }

  engineName() { return engineNameOf(this.cfg, path.dirname(this.tools().server.path)); }

  // Every measurement record in the Lab folder: <brain folder>/measure.json and measure-parent.json.
  measures() {
    const root = labModelsDir(this.cfg), out = [];
    let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
    for (const d of dirs) for (const f of ['measure.json', 'measure-parent.json']) {
      const rec = readJson(path.join(root, d, f), null);
      if (rec?.brain?.name) out.push({ id: `${d}/${f}`, name: rec.brain.name, when: rec.when || '', where: rec.where?.place || '', parentOf: f === 'measure-parent.json' ? d : '', rec });
    }
    return out;
  }

  compare(ids, save) {
    const all = this.measures();
    const picked = [].concat(ids || []).map((id) => all.find((m) => m.id === id)).filter(Boolean);
    if (picked.length < 2) throw new Error('Pick at least two brains to compare.');
    const table = compareTable(picked.map((m) => m.rec));
    if (!save) return { table };
    const dir = path.join(labModelsDir(this.cfg), 'compare');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date(this.now()).toISOString().replace(/[:T]/g, '-').slice(0, 19);
    const file = path.join(dir, `compare-${stamp}.${save === 'csv' ? 'csv' : 'json'}`);
    fs.writeFileSync(file, save === 'csv' ? compareCsv(table) : JSON.stringify({ records: picked.map((m) => m.rec), table }, null, 1));
    return { table, file };
  }

  view() {
    const room = this.room();
    const cardGB = Number(this.cfg.gpuVramGB) || Number(this.cfg.cardGB) || 0; // the set size, or the card the hardware scan found
    const brains = this.brains().map((b) => { let f = null; try { f = inspect(b); } catch (e) { return { ...b, gguf: undefined, mmproj: undefined, error: e.message }; } return { id: b.id, name: b.name, family: b.family, community: b.community, naughty: b.naughty, madeInLab: b.madeInLab, license: b.license, facts: f && { arch: f.arch, experts: f.experts, used: f.used, groups: f.groups, layers: f.layers, engineLayers: f.engineLayers || f.layers, fileType: f.fileType, fullSize: f.fullSize, sizeGB: f.sizeGB, sight: f.sight, hearing: f.hearing, readerGB: f.readerGB }, cuts: f ? cutSizes(f).map((c) => ({ ...c, fit: fitWords(c.gb, cardGB) })) : [], fit: f ? fitWords(f.sizeGB, cardGB) : '' }; });
    return { on: labOn(this.cfg), mode: this.cfg.labPro === true ? 'pro' : 'simple', engine: this.engineView(), room, cardGB, sharedMemory: (this.platform?.() || { os: OS }).os === 'mac', brains, runs: this.runs.slice(-20).reverse().map((r) => this.runView(r)), recipes: readJson(this.recipesFile, []), made: madeBrains(this.cfg).map((m) => ({ id: m.id, name: m.name, sizeGB: m.sizeGB, from: m.fromName })), busy: Boolean(this.job), gaming: gaming(this.cfg), types: RUNNING_TYPES, lessonSkills: LESSON_SKILLS.map(({ id, label, hint }) => ({ id, label, hint })), lessonSets: lessonSets(this.cfg).map(({ file, ...x }) => x), secondsPerLesson: SECONDS_PER_LESSON, lessonKinds: KINDS, sampleCount: SAMPLE_COUNT, buildMax: BUILD_MAX, officeOk: Boolean(this.officeFor()), brainEngine: this.tools().brainEngine.found, packs: PACKS, myPacks: readMyPacks(labDir(this.cfg)).map(({ items, ...m }) => m), pro: { gen: { ...GEN_DEFAULT }, ctxChoices: CTX_CHOICES, maxRepeats: MAX_REPEATS, checks: MY_CHECKS, settings: GUARD_SETTINGS, styles: GUARD_STYLES }, scores: this.scores(), classes: CLASSES.map(([id, label, hint]) => ({ id, label, hint })), ladders: this.ladders(), playMaxGB: PLAY_MAX_GB, ladderSteps: LADDER.map(({ type, label }) => ({ type, label })), hardware: hardwareLine(this.cfg), version: this.version || '', mixWays: MIX_WAYS, layerChoices: LAYER_CHOICES.map(([id, label]) => ({ id, label })), kept: KEPT.map(({ id, label }) => ({ id, label })), homeMaxGB: PLAY_MAX_GB, cvector: this.tools().cvector.found || Boolean(this.stepFns.direction), benchHere: this.benchTool().found || Boolean(this.stepFns.bench), full: this.fullSize ? this.fullSize.view() : null, fullDir: fullSizeDirOf(this.cfg), peekLive: this.tools().brainEngine.found || Boolean(this.stepFns.peekServe), plainPrompts: PLAIN_PROMPTS, reluctantPrompts: RELUCTANT_PROMPTS, queue: this.queue ? this.queue.view() : { paused: false, items: [] }, recheck: { on: recheckOn(this.cfg), last: readRecheck(this.cfg).last || null }, scans: this.listScans ? this.listScans() : [] };
  }

  runView(r) { return { id: r.id, kind: r.kind || 'make', name: r.name, from: r.fromName, naughty: r.naughty, refusalsOut: r.refusalsOut, state: r.state, step: r.step, stepLabel: r.stepLabel, progress: r.progress, steps: r.steps?.map((s) => ({ id: s.id, label: s.label, state: s.state })), error: r.error, notes: r.notes || [], report: r.report, at: r.at, used: Boolean(r.used), sizeGB: r.sizeGB }; }

  plan(recipe) {
    const r = cleanRecipe(recipe);
    // A lesson set Bob wrote is picked by its name; its file stays on this replicant matrix.
    let setMissing = false;
    if (r.lessons.kind === 'set') { const set = lessonSets(this.cfg).find((x) => x.id === r.lessons.set); if (set) r.lessons = { ...r.lessons, kind: 'file', file: set.file }; else { setMissing = true; r.lessons = { ...r.lessons, kind: 'none' }; } }
    const brain = this.brains().find((b) => b.id === r.from);
    let facts = null;
    if (brain) { try { facts = inspect(brain); } catch (e) { return { recipe: r, problems: [`Couldn't read ${brain.name}'s file: ${e.message}`], notes: [], steps: [] }; } }
    const p = planRecipe(r, { brain, facts: facts || {}, tools: this.tools(), outDir: labModelsDir(this.cfg) });
    p.skills = r.lessons.kind === 'none' ? [] : lessonSkillNames(r.lessons);
    if (setMissing) p.problems.unshift('That lesson set isn\'t here any more. Pick another one in step 2.');
    if (p.slug && madeBrains(this.cfg).some((m) => m.id === `lab-${p.slug}`)) p.problems.push(`You already have a Lab brain called ${r.name}. Pick another name.`);
    p.text = p.steps.map((s, i) => `# ${i + 1}. ${s.label}\n${s.cmd}`).join('\n\n');
    const t = templateById(r.template);
    if (t) p.text = `# Template: ${t.title}${t.forge ? `\n# The same method as a Forge plan (fill in the <...> parts):\n${JSON.stringify({ template: t.template, ...t.forge }, null, 1).split('\n').map((x) => `#   ${x}`).join('\n')}` : ''}\n\n${p.text}`;
    return p;
  }

  saveRecipe(recipe) {
    const r = cleanRecipe(recipe);
    if (!r.name) throw new Error('Give the recipe a name.');
    // A saved recipe holds choices, not paths, so it can be shared.
    const keepable = { ...r, lessons: { ...r.lessons, file: '' }, smaller: { ...r.smaller, cut: r.smaller.cut && { ...r.smaller.cut, file: '' } } };
    const list = readJson(this.recipesFile, []).filter((x) => x.name !== r.name);
    list.push({ ...keepable, at: this.now() });
    writeJson(this.recipesFile, list.slice(-50));
    return list;
  }

  async start(recipe, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    const room = this.room();
    if (!room.ok) throw new Error(room.why);
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.plan(recipe);
    if (p.problems.length) throw new Error(p.problems[0]);
    this.freePeek(); // 1.5.164 Peek inside's engine goes first
    if (p.steps.some((s) => s.card) && this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const brain = this.brains().find((b) => b.id === p.recipe.from);
    const runRec = { id: `lab-${this.now().toString(36)}`, name: p.recipe.name, slug: p.slug, from: brain.id, fromName: brain.name, fromGB: facts0(brain), recipe: p.recipe, state: 'running', at: this.now(), steps: p.steps.map((s) => ({ id: s.id, label: s.label, state: 'waiting' })), progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.go(runRec, p, brain, ac.signal).catch(() => {});
    return { started: this.runView(runRec) };
  }

  stop() { if (!this.job) return { stopped: false }; this.job.ac.abort(); return { stopped: true }; }

  // ---- Lab 2c: build a lesson set from the owner's own files ----
  officeFor() { try { return findOffice(this.cfg); } catch { return null; } }
  buildDir(slug) { return path.join(lessonSetsDir(this.cfg), slug); }

  benchTool() { return findTool(this.cfg, 'bench'); }

  // 1.5.153 Challenges: run packs against one brain as a Lab job; the scoreboard keeps the newest score per pack.
  scores() { return scoreboard(readScores(scoresDir(this.cfg))); }

  // ---- 1.5.160+ slice C: a Forge run started from the Lab ----
  // 1.5.163 a brain or lesson set on Hugging Face: read its card (licence, size, files) before it goes in a plan
  async forgeHf(ref, kind) { const r = parseHfRef(ref, kind === 'dataset' ? 'dataset' : 'model'); return hfLookup(r || String(ref || ''), { fetchFn: this.hfFetch || fetch }); }
  forgeKeys() { const e = this.rentEnv ? this.rentEnv() : rentKeyEnv(); return e?.[FORGE_KEY] ? { [FORGE_KEY]: e[FORGE_KEY] } : {}; }
  forgeLiveFile() { return path.join(labDir(this.cfg), 'forge-live.json'); }
  // 1.5.168 Keep it simple / Professional: one switch for the whole Lab, saved in settings, read by every tab as view.mode.
  setLabMode(mode) { const pro = mode === 'pro'; saveSettings(this.cfg, { labPro: pro }); this.cfg.labPro = pro; return { mode: pro ? 'pro' : 'simple' }; }
  // Nov 11: Check again after every engine update (lab-recheck.js), off unless switched on.
  setRecheck(on) { saveSettings(this.cfg, { labRecheck: on === true }); this.cfg.labRecheck = on === true; return { on: recheckOn(this.cfg), last: readRecheck(this.cfg).last || null }; }
  // Nov 11: Lab scores on the Brains page.
  brainScores() { return brainScores(readScores(scoresDir(this.cfg)), this.brains()); }
  allowForge(on) { saveSettings(this.cfg, { labForgeStart: on === true }); this.cfg.labForgeStart = on === true; return { allowed: this.cfg.labForgeStart }; }
  forgeCard(id) { // what the purchase card shows: read from the saved plan, nothing else
    const plan = readJson(path.join(forgePlansDir(labDir(this.cfg)), `${slugOf(id)}.json`), null);
    if (!plan) throw new Error('That plan isn\'t saved.');
    const dir = forgeDir(this.cfg);
    const problems = forgeStartProblems({ plan, allowed: this.cfg.labForgeStart === true, hasKey: Boolean(this.forgeKeys()[FORGE_KEY]), shown: { hours: plan.hours_max, dollars: plan.dollars_max }, running: Boolean(this.forgeLive()?.running), found: Boolean(dir), importer: Boolean(dir) && fs.existsSync(path.join(dir, 'import-lessons.mjs')), drive: dir ? onDrive(dir) : [], senses: forgeDoesSenses(dir) });
    return { id: slugOf(id), brains: (plan.rungs || []).map((r) => ({ name: r.name, nickname: r.nickname || '', keep: r.keep, hours: r.hours })), quants: plan.quants || '', cards: plan.gpus || [], hours: plan.hours_max, dollars: plan.dollars_max, volume: plan.volume ? plan.volume.gb || 100 : 0, problems };
  }

  save() { writeJson(this.runsFile, this.runs.slice(-50)); }
  tell(r) { this.save(); this.broadcast({ type: 'lab', run: this.runView(r) }); }

  async go(r, p, brain, signal) {
    const log = (t) => { try { fs.mkdirSync(p.dir, { recursive: true }); fs.appendFileSync(path.join(p.dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const tools = this.tools();
    const fx = { ...this.defaultSteps(tools, log), ...this.stepFns };
    let keep = null, coverage = null, tried = null, keepDone = false, lastCounts = null, foldedInfo = null; const tests = {}; const skillCounts = [];
    // The keep list, worked out once (by Try it first, or by the cut): from the busiest count, an expert list, or the
    // coverage rule over every skill's count.
    const keepNow = (src) => {
      keepDone = true;
      const c = p.recipe.smaller.cut;
      if (c.how === 'file') return readJson(c.file, {}).layers;
      if (c.how !== 'cover') return keep;
      const f = brainFacts(readGguf(src));
      const cov = coverageKeep(skillCounts, { cover: c.cover, strong: c.strong, strongCover: 0.99, keep: c.keep, min: f.used });
      if (cov.K >= f.experts) throw new Error(`Covering every skill at ${Math.round(c.cover * 100)}% needs all ${f.experts} experts in some layer, so there's nothing to cut. Pick 90%, or set how many experts to keep.`);
      coverage = { experts: cov.K, of: f.experts, sizes: cov.sizes, skills: cov.shares.map((x) => ({ name: x.name, average: Math.round(1000 * x.average) / 10, worst: Math.round(1000 * x.worst) / 10, worstLayer: x.worstLayer })) };
      writeJson(path.join(p.dir, `${p.slug}-keep.json`), { name: p.recipe.name, experts: cov.K, cover: c.cover, strong: c.strong, strong_cover: 0.99, skills: skillCounts.map((x) => x.name), layers: cov.keep });
      writeJson(path.join(p.dir, 'coverage.json'), coverage);
      log(`coverage cut: keeping ${cov.K} of ${f.experts}; ${coverage.skills.map((x) => `${x.name} ${x.average}% (worst ${x.worst}%)`).join(', ')}`);
      return cov.keep;
    };
    try {
      fs.mkdirSync(p.dir, { recursive: true });
      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i];
        r.step = s.id; r.stepLabel = s.label; r.steps[i].state = 'running'; r.progress = 0; this.tell(r);
        const t0 = Date.now(); // 1.5.154: how long each step really took, for the estimate table
        const onProgress = (x) => { r.progress = Math.round(100 * x); this.broadcast({ type: 'lab', run: this.runView(r) }); };
        if (s.id === 'lessons') {
          const by = lessonSkills(this.cfg, p.recipe.lessons);
          const text = [...by.values()].flat().join('\n');
          if (text.length < 20000) throw new Error('There isn\'t enough lesson text to count the experts on (it needs at least a few pages). Pick a bigger lesson set.');
          fs.writeFileSync(s.corpus, text);
          for (const c of s.corpora || []) {
            const t = (by.get(c.skill) || []).join('\n');
            if (t.length < 4000) { log(`skill ${c.skill}: only ${t.length} characters, counted with the rest`); c.small = true; fs.writeFileSync(c.file, text); }
            else fs.writeFileSync(c.file, t);
          }
          const small = (s.corpora || []).filter((c) => c.small).map((c) => c.skill);
          if (small.length) r.notes = [...(r.notes || []), `Too few lessons for ${small.join(', ')} to count on their own, so they were counted with the rest.`];
        } else if (s.id === 'count') {
          await fx.count(s, { brain, recipe: p.recipe, signal });
          const counts = readCounts(s.counts);
          if (!counts.filter(Boolean).length) throw new Error('llama-imatrix gave no per-expert counts. Bob\'s engine may be too old for that; update it in Settings, Engines.');
          if (s.skill) skillCounts.push({ name: s.skill, counts });
          else {
            lastCounts = counts;
            keep = busiest(counts, p.recipe.smaller.cut.keep);
            writeJson(path.join(p.dir, `${p.slug}-keep.json`), { name: p.recipe.name, experts: p.recipe.smaller.cut.keep, layers: keep });
          }
        } else if (s.id === 'try') {
          keep = keepNow(brain.gguf);
          const t = await fx.try(s, { keep: maskFor(keep, brainFacts(readGguf(brain.gguf))), signal, onProgress });
          tried = t;
          r.report = { ...(r.report || {}), tried: { full: t.full.score, masked: t.masked.score } };
          log(`try it first: every expert ${t.full.score}, kept experts only ${t.masked.score}`);
          if (p.recipe.smaller.tryStop && t.masked.score < t.full.score - 10) throw new Error(`Tried first: with only the kept experts switched on it scored ${t.masked.score}, against ${t.full.score} with all of them, so I stopped before cutting. Keep more experts, or protect more skills.`);
        } else if (s.id === 'cut') {
          if (!keepDone) keep = keepNow(s.src);
          const why = checkKeep(readGguf(s.src), keep);
          if (why) throw new Error(why);
          // Fold instead of drop: each expert weighs what it's used. Every skill's count weighs the same (shares), as in the coverage rule.
          const use = !s.fold ? null : skillCounts.length ? foldUse(skillCounts.map((x) => x.counts)) : lastCounts;
          if (s.fold && !use) r.notes = [...(r.notes || []), 'There were no counts for this cut (it used an expert list), so each kept expert weighs half and the experts folded into it share the other half.'];
          const done = await fx.cut(s, { keep, fold: s.fold, counts: use, onProgress, signal });
          if (s.fold && done?.folded != null) { foldedInfo = { experts: done.folded, kept: done.kept }; log(`fold: ${done.folded} experts folded into the ${done.kept} kept per layer`); }
        } else if (s.id === 'reader') {
          if (s.drop === 'none') fs.copyFileSync(s.src, s.out);
          else if (s.drop !== 'all') await fx.reader(s, { signal });
        } else if (s.id === 'imatrix') {
          await fx.imatrix(s, { recipe: p.recipe, signal });
        } else if (s.id === 'quantize') {
          await fx.quantize(s, { signal });
        } else if (s.id === 'test' || s.id === 'compare') {
          tests[s.id] = await fx.test(s, { signal, onProgress });
        }
        r.steps[i].state = 'done'; r.steps[i].ms = Date.now() - t0; r.progress = 100; this.tell(r);
      }
      const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
      r.files = { gguf: p.finals[0], mmproj: p.reader || null };
      r.sizeGB = round1(size(p.finals[0]) / GB);
      if (tried && !tests.compare) tests.compare = { ...tried.full, engine: 'Brain Engine' };
      r.report = { ...(tried ? { tried: { full: tried.full.score, masked: tried.masked.score } } : {}), made: tests.test, from: tests.compare || null, sizeGB: r.sizeGB, fromGB: round1(size(brain.gguf) / GB), at: this.now(), ...(coverage ? { coverage } : {}), ...(foldedInfo ? { folded: foldedInfo } : {}) };
      writeJson(path.join(p.dir, 'lab-report.json'), { name: r.name, from: brain.name, recipe: p.recipe, ...r.report });
      r.stepLabel = 'Write the measurement record'; this.tell(r);
      const facts = (() => { try { return brainFacts(readGguf(p.finals[0])); } catch { return {}; } })();
      const parentFacts = (() => { try { return brainFacts(readGguf(brain.gguf)); } catch { return {}; } })();
      const made = measureRecord({ name: r.name, sha256: await sha256File(p.finals[0], signal), facts, sizeGB: r.sizeGB, template: p.recipe.template, parent: brain.name, test: tests.test, engine: this.engineName(), cfg: this.cfg, when: this.now() });
      writeJson(path.join(p.dir, 'measure.json'), made);
      if (tests.compare) writeJson(path.join(p.dir, 'measure-parent.json'), measureRecord({ name: brain.name, sha256: await sha256File(brain.gguf, signal), facts: parentFacts, sizeGB: r.report.fromGB, test: tests.compare, engine: this.engineName(), cfg: this.cfg, when: this.now() }));
      r.state = 'done'; r.step = ''; r.stepLabel = '';
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: true, score: tests.test?.score });
    } catch (e) {
      r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it.' : e.message;
      const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
      log(`failed: ${e.stack || e.message}`);
      this.tell(r);
      this.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { this.job = null; }
  }

  defaultSteps(tools, log) {
    return {
      count: (s, { recipe, brain, signal }) => run(tools.imatrix.path, ['-m', brain.gguf, '-f', s.corpus, '-o', s.counts, '-c', '4096', '--chunks', String(recipe.lessons.chunks), '--fit', 'on'], { signal, log })
        .catch((e) => { if (signal.aborted) throw e; return run(tools.imatrix.path, ['-m', brain.gguf, '-f', s.corpus, '-o', s.counts, '-c', '4096', '--chunks', String(recipe.lessons.chunks), '-ngl', '0'], { signal, log }); }),
      cut: async (s, { keep, fold, counts, onProgress, signal }) => (fold ? foldGguf(s.src, s.out, { keep, counts, onProgress, signal }) : writeGguf(s.src, s.out, { keep, onProgress, signal })),
      reader: async (s, { signal }) => writeGguf(s.src, s.out, { drop: (t) => (s.drop === 'sight' ? isSightTensor(t.name) : isHearingTensor(t.name)), set: s.drop === 'sight' ? { 'clip.has_vision_encoder': false } : { 'clip.has_audio_encoder': false }, signal }),
      imatrix: (s, { recipe, signal }) => run(tools.imatrix.path, ['-m', s.src, '-f', s.corpus, '-o', s.out, '-c', '4096', '--chunks', String(recipe.lessons.chunks), '--fit', 'on'], { signal, log })
        .catch((e) => { if (signal.aborted) throw e; return run(tools.imatrix.path, ['-m', s.src, '-f', s.corpus, '-o', s.out, '-c', '4096', '--chunks', String(recipe.lessons.chunks), '-ngl', '0'], { signal, log }); }),
      quantize: (s, { signal }) => run(tools.quantize.path, [...(s.imatrix ? ['--imatrix', s.imatrix] : []), s.src, s.out, s.type], { signal, log }),
      serve: ({ gguf, ctx, signal, log: l }) => startServer({ exe: tools.server.path, gguf, ctx, signal, log: l || log }),
      pack: (url, id, opts) => runPack(url, id, opts), // 1.5.153
      perplexity: async (s, { signal }) => { // 1.5.156 the ladder's surprise score
        const out = await run(tools.perplexity.path, ['-m', s.gguf, '-f', s.text, '-c', '512', '--fit', 'on'], { signal, log })
          .catch((e) => { if (signal.aborted) throw e; return run(tools.perplexity.path, ['-m', s.gguf, '-f', s.text, '-c', '512', '-ngl', '0'], { signal, log }); });
        return readPerplexity(out);
      },
      ask: async (s, { signal }) => {
        const srv = await startServer({ exe: tools.server.path, gguf: s.gguf, ctx: 4096, signal, log });
        try {
          const res = await fetch(srv.url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: s.question }], temperature: 0, max_tokens: 300, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.any([signal, AbortSignal.timeout(180e3)]) });
          const j = await res.json();
          return String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
        } finally { srv.stop(); }
      },
      fingerprint: (file, signal) => sha256File(file, signal),
      // Code a brain wrote runs in the same sandbox as Bob's self-made tools, only if the sandbox holds on this machine.
      sandbox: async () => {
        const held = await sandboxHolds(this.cfg).catch(() => ({ ok: false }));
        if (!held.ok) return null;
        const dir = path.join(labDir(this.cfg), 'challenges', 'sandbox');
        return { run: async (code, fn, cases) => { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(path.join(dir, 'tool.mjs'), codeTool(code, fn)); const res = await runSandboxed({ dir, input: { cases }, timeoutSec: 10 }); try { return res.ok ? JSON.parse(res.out) : null; } catch { return null; } } };
      },
      // The writer runs as its own process: the throwaway Bob it builds never touches this Bob.
      write: (job, { signal, onProgress }) => new Promise((resolve, reject) => {
        const { file, env } = nodeCmd();
        const c = spawn(file, [WRITER, JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ...env } });
        let tail = '', buf = '', n = 0;
        c.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const x of lines) { const m = x.match(/^progress (\d+) (\d+)/); if (m) onProgress(Number(m[1]), Number(m[2])); const k = x.match(/^done (\d+)/); if (k) n = Number(k[1]); } });
        c.stderr.on('data', (d) => { tail = (tail + d).slice(-2000); });
        const stop = () => { try { c.kill(); } catch {} };
        signal?.addEventListener('abort', stop, { once: true });
        c.once('error', (e) => reject(new Error(`Couldn't start the lesson writer: ${e.message}`)));
        c.once('exit', (code) => { signal?.removeEventListener('abort', stop); if (signal?.aborted) reject(new Error('Stopped.')); else if (code === 0) resolve(n); else { log(tail); reject(new Error(`The lesson writer stopped: ${tail.trim().split('\n').slice(-1)[0] || `code ${code}`}`)); } });
      }),
      // The lesson builder too (Lab 2c): same shape, its own script; it also prints "held <n>" and "dupes <n>".
      build: (job, { signal, onProgress }) => new Promise((resolve, reject) => {
        const { file, env } = nodeCmd();
        const c = spawn(file, [BUILDER, JSON.stringify(job)], { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, env: { ...process.env, ...env } });
        let tail = '', buf = '', n = 0, held = 0, dupes = 0;
        c.stdout.on('data', (d) => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); for (const x of lines) { let m; if ((m = x.match(/^progress (\d+) (\d+)/))) onProgress(Number(m[1]), Number(m[2])); else if ((m = x.match(/^done (\d+)/))) n = Number(m[1]); else if ((m = x.match(/^held (\d+)/))) held = Number(m[1]); else if ((m = x.match(/^dupes (\d+)/))) dupes = Number(m[1]); } });
        c.stderr.on('data', (d) => { tail = (tail + d).slice(-2000); });
        const stop = () => { try { c.kill(); } catch {} };
        signal?.addEventListener('abort', stop, { once: true });
        c.once('error', (e) => reject(new Error(`Couldn't start the lesson builder: ${e.message}`)));
        c.once('exit', (code) => { signal?.removeEventListener('abort', stop); if (signal?.aborted) reject(new Error('Stopped.')); else if (code === 0) resolve({ n, held, dupes }); else { log(tail); reject(new Error(`The lesson builder stopped: ${tail.trim().split('\n').slice(-1)[0] || `code ${code}`}`)); } });
      }),
      try: async (s, { keep, signal, onProgress }) => {
        const srv = await startServer({ exe: tools.brainEngine.path, gguf: s.gguf, signal, log });
        try {
          const post = async (body) => { const res = await fetch(srv.url + '/expert-mask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); if (!res.ok) throw new Error(`Brain Engine wouldn't switch the experts: ${(await res.text()).slice(0, 200)}`); };
          await post({ keep: null });
          const full = { ...(await runQuiz(srv.url, { signal, onStep: (d, t) => onProgress(d / t / 2) })), where: srv.where, engine: 'Brain Engine' };
          await post({ keep });
          const masked = { ...(await runQuiz(srv.url, { signal, onStep: (d, t) => onProgress(0.5 + d / t / 2) })), where: srv.where, engine: 'Brain Engine' };
          return { full, masked };
        } finally { srv.stop(); }
      },
      test: async (s, { signal, onProgress }) => {
        const srv = await startServer({ exe: tools.server.path, gguf: s.gguf, mmproj: s.mmproj, signal, log });
        try {
          let engine = 'llama.cpp';
          try { if ((await fetch(srv.url + '/expert-mask', { signal: AbortSignal.timeout(3000) })).ok) engine = 'Brain Engine'; } catch {}
          const sandbox = await (this.stepFns.sandbox || this.defaultSteps(tools, log).sandbox)({ signal }).catch(() => null); // Nov 11: coding answers run, when the sandbox holds
          return { ...(await runQuiz(srv.url, { signal, sandbox, onStep: (d, t) => onProgress(d / t) })), where: srv.where, engine };
        } finally { srv.stop(); }
      }
    };
  }

  // ---- 1.5.164 The Forge's home ways: Mix two brains, Stack layers, Take out the refusal habit (free, here) ----
  // The checks every home job shares. Returns { needUnload, names } when Bob's brain is on the card and `unload` wasn't given.
  async preflight({ unload = false, card = true } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    const room = this.room(); if (!room.ok) throw new Error(room.why);
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    this.freePeek();
    if (card && this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    return null;
  }

  // Whether the Brain Engine here was built with the trace, read from the program file (null: can't tell, or a test's fake).
  traceProbe() { if (this.stepFns.peekServe) return null; const be = this.tools().brainEngine; return be.found ? traceBuilt(be.path) : null; }

  // Brain Engine stays loaded between questions; any other job, or a while idle, unloads it.
  freePeek() { if (this.peekSrv) { try { this.peekSrv.srv.stop(); } catch {} clearTimeout(this.peekSrv.timer); this.peekSrv = null; } return { stopped: true }; }

  // Use in Bob: only after a test. Bob's engine runs it by id (lab-<name>), and it shows in Get models next to its family.
  use(runId) {
    const r = this.runs.find((x) => x.id === runId);
    if (!r || r.state !== 'done' || !r.report?.made) throw new Error('Only a brain that finished its Lab test can go into Bob.');
    const brain = this.brains().find((b) => b.id === r.from) || {};
    const id = `lab-${r.slug}`;
    const list = readJson(madeFile(this.cfg), []).filter((m) => m.id !== id);
    const t = r.report;
    // 1.5.164 the home ways: a mix carries both parents' licences; a brain with the refusal habit taken out keeps its plain line and, unless turned off, goes behind the naughty-list switch.
    const extra = r.kind === 'refusals' ? ` Made in the Lab with the refusal habit taken out.${t.refusals?.kept ? ` Kept-refusals check: declines ${t.refusals.kept.declined} of ${t.refusals.kept.of}.` : ' The kept-refusals check was turned off.'}${t.refusals?.teachBack === 'planned' ? ' Teaching back the kept refusals is planned, not done yet.' : ''}` : r.kind === 'mix' ? ` A mix of ${r.fromName}.` : r.kind === 'stack' ? ' Stacked layers: expect rambling until it\'s taught back.' : '';
    const what = `Made in the Lab from ${r.fromName}. Lab test: ${t.made.score} out of 100${t.from ? ` (${r.fromName}: ${t.from.score})` : ''}, ${t.sizeGB} GB.${extra}`;
    const entry = { id, name: `${r.name} (made in the Lab)`, fromName: r.fromName, family: brain.family, category: brain.category, jobs: brain.jobs, license: r.license || brain.license, gguf: r.files.gguf, mmproj: r.files.mmproj, sizeGB: r.sizeGB, what, at: this.now(), ...(r.kind === 'refusals' ? { refusalsOut: true, naughty: r.naughty !== false } : {}) };
    list.push(entry);
    writeJson(madeFile(this.cfg), list);
    saveSettings(this.cfg, { llamacpp: { models: { [id]: r.files.mmproj ? { gguf: r.files.gguf, mmproj: r.files.mmproj } : { gguf: r.files.gguf } } } });
    if (this.shop?.catalog) mergeMadeBrains(this.shop.catalog, this.cfg);
    r.used = true; this.save();
    return { id, name: entry.name };
  }
}

// The Lab class is written in parts: these files hold groups of its methods (same rules as the ones written here).
for (const part of [lessonJobs, challengeJobs, ladderJobs, forgeJobs, homeJobs, peekJobs, protocolJobs]) {
  for (const [k, d] of Object.entries(Object.getOwnPropertyDescriptors(part))) Object.defineProperty(Lab.prototype, k, { ...d, enumerable: false });
}

