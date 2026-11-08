// 1.5.135 Computer Science Lab (Lab 1: free, on this replicant matrix). A recipe from the Lab page becomes a list of
// steps: count which experts the lessons use (llama-imatrix), cut the experts (Bob's own cutter, src/lab-gguf.js),
// take out sight or hearing, make the running files (llama-quantize), then the Lab test (src/lab-test.js). Nothing is
// rented and nothing is downloaded here; the rented parts are Lab 2. One Lab job at a time, never while Gaming is on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readGguf, brainFacts, readerFacts, writeGguf, readCounts, busiest, checkKeep, isHearingTensor, isSightTensor } from './lab-gguf.js';
import { startServer, runQuiz, PARTS } from './lab-test.js';
import { saveSettings } from './config.js';
import { gaming } from './sessions.js';

export const labOn = (cfg) => cfg?.computerLab === true;
export const MIN_RAM_GB = 12;
// Too small to run the Lab (a Raspberry Pi, an 8 GB laptop): the switch is greyed out with this reason.
export function labRoom(totalBytes = os.totalmem()) {
  const gb = totalBytes / 1024 ** 3;
  return gb < MIN_RAM_GB ? { ok: false, why: `This replicant matrix has ${Math.round(gb)} GB of memory, and the Lab needs at least ${MIN_RAM_GB} GB. Start Lab jobs from another Bob on your Bob-Net instead.` } : { ok: true, why: '' };
}

// Running files the Lab can make, best first. Q3 only for brains meant for 8 GB or less (the Q4-or-better rule).
export const RUNNING_TYPES = ['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0', 'Q3_K_M'];
const exeName = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
export const slugOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'lab-brain';
const GB = 1024 ** 3;
const round1 = (x) => Math.round(x * 10) / 10;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };

export const labDir = (cfg) => path.join(cfg.dataDir, 'lab');
export const labModelsDir = (cfg) => path.join(cfg.bobModelsDir || path.join(cfg.agentDir, 'models', 'bob'), 'lab');
export const madeFile = (cfg) => path.join(labDir(cfg), 'made.json');
export const madeBrains = (cfg) => readJson(madeFile(cfg), []).filter((m) => m && m.id && m.gguf && fs.existsSync(m.gguf));

// Lab-made brains that were put into Bob show in the catalogue next to their family, with no download.
export function mergeMadeBrains(catalog, cfg) {
  const have = new Set(catalog.models.map((m) => m.id));
  for (const m of madeBrains(cfg)) {
    if (have.has(m.id)) continue;
    catalog.models.push({ id: m.id, family: m.family || 'Lab', category: m.category || 'chat', jobs: m.jobs || ['bob'], name: m.name, what: m.what, sizeGB: m.sizeGB, vramGB: Math.ceil(m.sizeGB + 1), license: m.license || '', madeInLab: true, files: [] });
  }
  return catalog;
}

// The brains on this replicant matrix the Lab can start from: every downloaded catalogue brain that runs on Bob's
// engine (a .gguf), plus the Lab's own.
export function labBrains(shop) {
  const out = [];
  for (const e of shop.catalog.models) {
    if (!['chat', 'coding', 'vision', 'thinking', 'small', 'tiny'].includes(e.category) && !e.madeInLab) continue;
    let loc = {};
    if (e.madeInLab) { const m = madeBrains(shop.cfg).find((x) => x.id === e.id); if (m) loc = { gguf: m.gguf, mmproj: m.mmproj || null }; }
    else { try { loc = shop.locate(e); } catch {} }
    if (!loc.gguf || !/\.gguf$/i.test(loc.gguf)) continue;
    out.push({ id: e.id, name: e.name, family: e.family || '', category: e.category, jobs: e.jobs || [], license: e.license || '', community: Boolean(e.community), naughty: Boolean(e.naughty), madeInLab: Boolean(e.madeInLab), gguf: loc.gguf, mmproj: loc.mmproj || null });
  }
  return out;
}

const factsCache = new Map();
// What the Lab can do to one brain, read from its files (cached by file and time).
export function inspect(b) {
  const key = `${b.gguf}|${b.mmproj || ''}`;
  let st; try { st = fs.statSync(b.gguf).mtimeMs; } catch { return null; }
  const hit = factsCache.get(key);
  if (hit && hit.st === st) return hit.v;
  const g = readGguf(b.gguf);
  const f = brainFacts(g);
  let reader = null;
  if (b.mmproj) { try { reader = readerFacts(readGguf(b.mmproj)); } catch {} }
  const v = { ...f, sight: Boolean(reader?.sight), hearing: Boolean(reader?.hearing), readerGB: reader ? round1(reader.size / GB) : 0, sizeGB: round1(f.size / GB) };
  factsCache.set(key, { st, v });
  return v;
}

// Sizes the expert cut offers: from a little under the brain's own count down to its picks per word, in steps that
// make sense, each with the file size it gives. expertShare is how much of the file the experts are.
export function cutSizes(facts, expertShare = 0.9) {
  if (!facts.experts) return [];
  const steps = [0.75, 0.6, 0.5, 0.4, 0.3, 0.25].map((x) => Math.max(facts.used, Math.round((facts.experts * x) / 8) * 8)).filter((n, i, a) => n < facts.experts && a.indexOf(n) === i);
  return steps.map((n) => ({ keep: n, gb: round1((facts.size * (1 - expertShare) + facts.size * expertShare * (n / facts.experts)) / GB) }));
}

// What fits where, in words (the clarity rules: no ticks and crosses, no brand names).
export function fitWords(gb, cardGB = 0) {
  const here = cardGB ? (gb + 1 <= cardGB ? 'Fits this replicant matrix\'s card.' : gb + 1 <= cardGB * 1.6 ? 'Runs on this replicant matrix, partly on the processor.' : 'Too big for this replicant matrix\'s card.') : '';
  const hand = gb + 1.5 <= 16 ? (gb + 3 <= 16 ? 'Fits a 16 GB handheld.' : 'Fits a 16 GB handheld, but only just.') : 'Too big for a 16 GB handheld.';
  const phone = gb <= 5 ? 'Small enough for phones.' : 'Too big for phones.';
  return [here, hand, phone].filter(Boolean).join(' ');
}

// A recipe as the page sends it, cleaned. No paths from the page except a lesson or keep-list file the owner picked.
export function cleanRecipe(r = {}) {
  const s = r.smaller || {};
  const cut = s.cut && typeof s.cut === 'object' ? { how: s.cut.how === 'file' ? 'file' : 'busiest', keep: Math.max(1, Math.min(1024, Number(s.cut.keep) || 0)), file: typeof s.cut.file === 'string' ? s.cut.file : '' } : null;
  const l = r.lessons || {};
  return {
    name: String(r.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    from: String(r.from || '').slice(0, 120),
    lessons: { kind: ['file', 'chats', 'none'].includes(l.kind) ? l.kind : 'none', file: typeof l.file === 'string' ? l.file : '', chunks: Math.max(20, Math.min(2000, Number(l.chunks) || 200)) },
    smaller: { sight: s.sight === true, hearing: s.hearing === true, cut, files: [...new Set([].concat(s.files || []).filter((t) => RUNNING_TYPES.includes(t)))] },
    test: { compare: r.test?.compare !== false }
  };
}

// The steps a recipe makes, and what's wrong with it (problems stop it; notes don't). Every step has the command it
// runs (for Show the recipe) and, for the cutter, a plain line saying it's Bob's own.
export function planRecipe(recipe, { brain, facts, tools, outDir }) {
  const r = cleanRecipe(recipe);
  const problems = [], notes = [], steps = [];
  if (!brain) return { recipe: r, problems: ['Pick a brain to start from.'], notes, steps };
  if (!r.name) problems.push('Give the new brain a name.');
  const slug = slugOf(r.name || brain.name);
  const dir = path.join(outDir, slug);
  const q = (p) => (/\s/.test(p) ? `"${p}"` : p);
  const s = r.smaller;
  if (!s.sight && !s.hearing && !s.cut && !s.files.length) problems.push('Pick at least one way to make it smaller in step 3.');
  if (s.sight && !facts.sight) problems.push(`${brain.name} can't see pictures, so there's no sight to take out.`);
  if (s.hearing && !facts.hearing) problems.push(`${brain.name} can't hear sound, so there's no hearing to take out.`);
  if (s.cut && !facts.experts) problems.push(`${brain.name} isn't a mixture-of-experts brain, so it has no experts to cut.`);
  if (s.cut && facts.groups > 1) problems.push(`${brain.name} groups its experts, and the Lab can't cut those yet.`);
  if (s.cut && facts.experts && (s.cut.keep < facts.used || s.cut.keep >= facts.experts)) problems.push(`Keep between ${facts.used} and ${facts.experts - 1} experts per layer (this brain picks ${facts.used} for every word).`);
  if (s.files.length && !facts.fullSize) problems.push(`${brain.name}'s file is already a running file (${facts.fileType}). Making running files needs the full-size copy (F16 or BF16). Untick Make the running files, or start from a full-size copy.`);
  if (s.files.includes('Q3_K_M')) notes.push('Q3 is only worth it for brains meant for 8 GB or less.');
  if (s.cut?.how === 'busiest' && r.lessons.kind === 'none') problems.push('Keeping the busiest experts needs lessons to count them on. Pick a lesson set in step 2, or use an expert list you have.');
  if (s.cut?.how === 'file' && !s.cut.file) problems.push('Pick the expert list file.');
  if (r.lessons.kind === 'file' && !r.lessons.file) problems.push('Pick the lesson file.');
  for (const [k, p] of Object.entries(tools)) if (!p.found && ((k === 'imatrix' && s.cut?.how === 'busiest') || (k === 'quantize' && s.files.length) || k === 'server')) problems.push(`${path.basename(p.path)} isn't in Bob's engine folder. Get models, Engines, Bob's own engine has it; download the engine again if it's missing.`);

  let file = brain.gguf;
  if (s.cut?.how === 'busiest') {
    const corpus = path.join(dir, 'lessons.txt'), counts = path.join(dir, 'counts.gguf');
    steps.push({ id: 'lessons', label: r.lessons.kind === 'chats' ? 'Gather your chats with Bob as lessons' : 'Read the lesson set', cmd: `# Bob writes the lessons as one text file: ${q(corpus)}`, corpus });
    steps.push({ id: 'count', label: 'Count which experts the lessons use', cmd: `${q(tools.imatrix.path)} -m ${q(brain.gguf)} -f ${q(corpus)} -o ${q(counts)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, corpus, counts, card: true });
  }
  if (s.cut) {
    const out = path.join(dir, `${slug}-${s.cut.keep}x.gguf`);
    steps.push({ id: 'cut', label: `Cut to ${s.cut.keep} experts per layer`, cmd: `# Bob's own cutter (no command-line tool does this yet): keep ${s.cut.keep} of ${facts.experts} experts per layer\n#   from ${q(brain.gguf)}\n#   to   ${q(out)}${s.cut.how === 'file' ? `\n#   with the expert list ${q(s.cut.file)}` : ''}`, src: file, out });
    file = out;
  }
  let reader = brain.mmproj;
  const dropSight = s.sight && facts.sight, dropHearing = s.hearing && facts.hearing;
  if (brain.mmproj && (dropSight || dropHearing)) {
    const keepsOne = (facts.sight && !dropSight) || (facts.hearing && !dropHearing);
    if (!keepsOne) { steps.push({ id: 'reader', label: dropSight && dropHearing ? 'Take out sight and hearing' : dropSight ? 'Take out sight' : 'Take out hearing', cmd: `# The new brain leaves the reader file behind: ${q(brain.mmproj)}`, drop: 'all' }); reader = null; }
    else {
      const out = path.join(dir, `${slug}-reader.gguf`);
      steps.push({ id: 'reader', label: dropSight ? 'Take out sight (hearing stays)' : 'Take out hearing (sight stays)', cmd: `# Bob's own cutter: copy the reader without its ${dropSight ? 'picture' : 'sound'} part\n#   from ${q(brain.mmproj)}\n#   to   ${q(out)}`, src: brain.mmproj, out, drop: dropSight ? 'sight' : 'hearing' });
      reader = out;
    }
  } else if (brain.mmproj && (s.cut || s.files.length)) {
    const out = path.join(dir, `${slug}-reader.gguf`);
    steps.push({ id: 'reader', label: 'Copy the picture and sound reader', cmd: `# copy ${q(brain.mmproj)} to ${q(out)}`, src: brain.mmproj, out, drop: 'none' });
    reader = out;
  }
  const finals = [];
  for (const t of s.files) {
    const out = path.join(dir, `${slug}-${t}.gguf`);
    steps.push({ id: 'quantize', label: `Make the ${t} running file`, cmd: `${q(tools.quantize.path)} ${q(file)} ${q(out)} ${t}`, src: file, out, type: t });
    finals.push(out);
  }
  if (!finals.length) finals.push(file);
  steps.push({ id: 'test', label: 'Test the new brain', cmd: `${q(tools.server.path)} -m ${q(finals[0])}${reader ? ` --mmproj ${q(reader)}` : ''} -c 8192 --jinja --fit on\n# then the Lab test: ${Object.values(PARTS).join(', ')}`, gguf: finals[0], mmproj: reader, card: true });
  if (r.test.compare) steps.push({ id: 'compare', label: `Test ${brain.name} too, to compare`, cmd: `${q(tools.server.path)} -m ${q(brain.gguf)} -c 8192 --jinja --fit on`, gguf: brain.gguf, mmproj: null, card: true });
  if (finals[0] === brain.gguf && !s.cut && !s.files.length) notes.push(`The new brain uses ${brain.name}'s own brain file; only the reader changes. Nothing big is copied.`);
  return { recipe: r, problems, notes, steps, slug, dir, finals, reader };
}

// One lesson text from a lesson file (lessons.jsonl from the model lab, or plain text) or from the owner's chats.
export function lessonText(cfg, lessons) {
  const parts = [];
  const add = (role, text) => { if (text && typeof text === 'string') parts.push(`<|im_start|>${role}\n${text}<|im_end|>`); };
  if (lessons.kind === 'chats') {
    const dir = path.join(cfg.dataDir, 'sessions');
    let files = []; try { files = fs.readdirSync(dir).filter((f) => /\.json$/.test(f) && !/\.summary\.json$/.test(f)); } catch {}
    for (const f of files) {
      const j = readJson(path.join(dir, f), []);
      for (const m of Array.isArray(j) ? j : j.messages || []) if (m.role === 'user' || m.role === 'assistant') add(m.role, typeof m.content === 'string' ? m.content : '');
    }
  } else if (lessons.kind === 'file') {
    const raw = fs.readFileSync(lessons.file, 'utf8');
    if (/\.jsonl$/i.test(lessons.file)) {
      for (const line of raw.split(/\r?\n/)) {
        if (!line.trim()) continue;
        let l; try { l = JSON.parse(line); } catch { continue; }
        for (const m of l.messages || []) add(m.role === 'tool' ? 'user' : m.role, m.content || (m.tool_calls || []).map((c) => `<tool_call>${c.function?.name}</tool_call>`).join(''));
      }
    } else parts.push(raw);
  }
  return parts.join('\n');
}

function run(exe, args, { signal, log }) {
  return new Promise((resolve, reject) => {
    log(`${path.basename(exe)} ${args.join(' ')}`);
    const c = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
    let tail = '';
    const keep = (d) => { tail = (tail + d).slice(-3000); };
    c.stdout.on('data', keep); c.stderr.on('data', keep);
    const stop = () => { try { c.kill(); } catch {} };
    signal?.addEventListener('abort', stop, { once: true });
    c.once('error', (e) => reject(new Error(`Couldn't start ${path.basename(exe)}: ${e.message}`)));
    c.once('exit', (code) => { signal?.removeEventListener('abort', stop); if (signal?.aborted) reject(new Error('Stopped.')); else if (code === 0) resolve(tail); else reject(new Error(`${path.basename(exe)} stopped (code ${code}): ${tail.split('\n').filter(Boolean).slice(-2).join(' | ')}`)); });
  });
}

export class Lab {
  constructor(cfg, { shop, brain, broadcast = () => {}, now = Date.now, steps = {} } = {}) {
    this.cfg = cfg; this.shop = shop; this.brain = brain; this.broadcast = broadcast; this.now = now;
    this.runsFile = path.join(labDir(cfg), 'runs.json');
    this.recipesFile = path.join(labDir(cfg), 'recipes.json');
    this.runs = readJson(this.runsFile, []);
    for (const r of this.runs) if (r.state === 'running') { r.state = 'failed'; r.error = 'Bob closed while this was running.'; }
    this.job = null;
    this.stepFns = steps; // tests swap in fakes
  }

  tools() {
    const server = this.cfg.llamacpp?.exe || path.join(this.cfg.agentDir, 'llama.cpp', exeName('llama-server'));
    const dir = path.dirname(server);
    const t = { server, imatrix: path.join(dir, exeName('llama-imatrix')), quantize: path.join(dir, exeName('llama-quantize')) };
    return Object.fromEntries(Object.entries(t).map(([k, p]) => [k, { path: p, found: fs.existsSync(p) }]));
  }

  brains() { return labBrains(this.shop); }

  view() {
    const room = labRoom();
    const cardGB = Number(this.cfg.gpuVramGB) || 0;
    const brains = this.brains().map((b) => { let f = null; try { f = inspect(b); } catch (e) { return { ...b, gguf: undefined, mmproj: undefined, error: e.message }; } return { id: b.id, name: b.name, family: b.family, community: b.community, naughty: b.naughty, madeInLab: b.madeInLab, license: b.license, facts: f && { arch: f.arch, experts: f.experts, used: f.used, groups: f.groups, layers: f.layers, fileType: f.fileType, fullSize: f.fullSize, sizeGB: f.sizeGB, sight: f.sight, hearing: f.hearing, readerGB: f.readerGB }, cuts: f ? cutSizes(f).map((c) => ({ ...c, fit: fitWords(c.gb, cardGB) })) : [], fit: f ? fitWords(f.sizeGB, cardGB) : '' }; });
    return { on: labOn(this.cfg), room, cardGB, brains, runs: this.runs.slice(-20).reverse().map((r) => this.runView(r)), recipes: readJson(this.recipesFile, []), made: madeBrains(this.cfg).map((m) => ({ id: m.id, name: m.name, sizeGB: m.sizeGB, from: m.fromName })), busy: Boolean(this.job), gaming: gaming(this.cfg), types: RUNNING_TYPES };
  }

  runView(r) { return { id: r.id, name: r.name, from: r.fromName, state: r.state, step: r.step, stepLabel: r.stepLabel, progress: r.progress, steps: r.steps?.map((s) => ({ id: s.id, label: s.label, state: s.state })), error: r.error, report: r.report, at: r.at, used: Boolean(r.used), sizeGB: r.sizeGB }; }

  plan(recipe) {
    const r = cleanRecipe(recipe);
    const brain = this.brains().find((b) => b.id === r.from);
    let facts = null;
    if (brain) { try { facts = inspect(brain); } catch (e) { return { recipe: r, problems: [`Couldn't read ${brain.name}'s file: ${e.message}`], notes: [], steps: [] }; } }
    const p = planRecipe(r, { brain, facts: facts || {}, tools: this.tools(), outDir: labModelsDir(this.cfg) });
    if (p.slug && madeBrains(this.cfg).some((m) => m.id === `lab-${p.slug}`)) p.problems.push(`You already have a Lab brain called ${r.name}. Pick another name.`);
    p.text = p.steps.map((s, i) => `# ${i + 1}. ${s.label}\n${s.cmd}`).join('\n\n');
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
    if (!labRoom().ok) throw new Error(labRoom().why);
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.plan(recipe);
    if (p.problems.length) throw new Error(p.problems[0]);
    if (p.steps.some((s) => s.card) && this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const brain = this.brains().find((b) => b.id === p.recipe.from);
    const runRec = { id: `lab-${this.now().toString(36)}`, name: p.recipe.name, slug: p.slug, from: brain.id, fromName: brain.name, recipe: p.recipe, state: 'running', at: this.now(), steps: p.steps.map((s) => ({ id: s.id, label: s.label, state: 'waiting' })), progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.go(runRec, p, brain, ac.signal).catch(() => {});
    return { started: this.runView(runRec) };
  }

  stop() { if (!this.job) return { stopped: false }; this.job.ac.abort(); return { stopped: true }; }

  save() { writeJson(this.runsFile, this.runs.slice(-50)); }
  tell(r) { this.save(); this.broadcast({ type: 'lab', run: this.runView(r) }); }

  async go(r, p, brain, signal) {
    const log = (t) => { try { fs.mkdirSync(p.dir, { recursive: true }); fs.appendFileSync(path.join(p.dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const tools = this.tools();
    const fx = { ...this.defaultSteps(tools, log), ...this.stepFns };
    let keep = null; const tests = {};
    try {
      fs.mkdirSync(p.dir, { recursive: true });
      for (let i = 0; i < p.steps.length; i++) {
        const s = p.steps[i];
        r.step = s.id; r.stepLabel = s.label; r.steps[i].state = 'running'; r.progress = 0; this.tell(r);
        const onProgress = (x) => { r.progress = Math.round(100 * x); this.broadcast({ type: 'lab', run: this.runView(r) }); };
        if (s.id === 'lessons') {
          const text = lessonText(this.cfg, p.recipe.lessons);
          if (text.length < 20000) throw new Error('There isn\'t enough lesson text to count the experts on (it needs at least a few pages). Pick a bigger lesson set.');
          fs.writeFileSync(s.corpus, text);
        } else if (s.id === 'count') {
          await fx.count(s, { brain, recipe: p.recipe, signal });
          const counts = readCounts(s.counts);
          if (!counts.filter(Boolean).length) throw new Error('llama-imatrix gave no per-expert counts. Bob\'s engine may be too old for that; update it in Get models, Engines.');
          keep = busiest(counts, p.recipe.smaller.cut.keep);
          writeJson(path.join(p.dir, `${p.slug}-keep.json`), { name: p.recipe.name, experts: p.recipe.smaller.cut.keep, layers: keep });
        } else if (s.id === 'cut') {
          if (p.recipe.smaller.cut.how === 'file') keep = readJson(p.recipe.smaller.cut.file, {}).layers;
          const why = checkKeep(readGguf(s.src), keep);
          if (why) throw new Error(why);
          await fx.cut(s, { keep, onProgress, signal });
        } else if (s.id === 'reader') {
          if (s.drop === 'none') fs.copyFileSync(s.src, s.out);
          else if (s.drop !== 'all') await fx.reader(s, { signal });
        } else if (s.id === 'quantize') {
          await fx.quantize(s, { signal });
        } else if (s.id === 'test' || s.id === 'compare') {
          tests[s.id] = await fx.test(s, { signal, onProgress });
        }
        r.steps[i].state = 'done'; r.progress = 100; this.tell(r);
      }
      const size = (f) => { try { return fs.statSync(f).size; } catch { return 0; } };
      r.files = { gguf: p.finals[0], mmproj: p.reader || null };
      r.sizeGB = round1(size(p.finals[0]) / GB);
      r.report = { made: tests.test, from: tests.compare || null, sizeGB: r.sizeGB, fromGB: round1(size(brain.gguf) / GB), at: this.now() };
      writeJson(path.join(p.dir, 'lab-report.json'), { name: r.name, from: brain.name, recipe: p.recipe, ...r.report });
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
      cut: async (s, { keep, onProgress, signal }) => writeGguf(s.src, s.out, { keep, onProgress, signal }),
      reader: async (s, { signal }) => writeGguf(s.src, s.out, { drop: (t) => (s.drop === 'sight' ? isSightTensor(t.name) : isHearingTensor(t.name)), set: s.drop === 'sight' ? { 'clip.has_vision_encoder': false } : { 'clip.has_audio_encoder': false }, signal }),
      quantize: (s, { signal }) => run(tools.quantize.path, [s.src, s.out, s.type], { signal, log }),
      test: async (s, { signal, onProgress }) => {
        const srv = await startServer({ exe: tools.server.path, gguf: s.gguf, mmproj: s.mmproj, signal, log });
        try { return { ...(await runQuiz(srv.url, { signal, onStep: (d, t) => onProgress(d / t) })), where: srv.where }; } finally { srv.stop(); }
      }
    };
  }

  // Use in Bob: only after a test. Bob's engine runs it by id (lab-<name>), and it shows in Get models next to its family.
  use(runId) {
    const r = this.runs.find((x) => x.id === runId);
    if (!r || r.state !== 'done' || !r.report?.made) throw new Error('Only a brain that finished its Lab test can go into Bob.');
    const brain = this.brains().find((b) => b.id === r.from) || {};
    const id = `lab-${r.slug}`;
    const list = readJson(madeFile(this.cfg), []).filter((m) => m.id !== id);
    const t = r.report;
    const what = `Made in the Lab from ${r.fromName}. Lab test: ${t.made.score} out of 100${t.from ? ` (${r.fromName}: ${t.from.score})` : ''}, ${t.sizeGB} GB.`;
    const entry = { id, name: `${r.name} (made in the Lab)`, fromName: r.fromName, family: brain.family, category: brain.category, jobs: brain.jobs, license: brain.license, gguf: r.files.gguf, mmproj: r.files.mmproj, sizeGB: r.sizeGB, what, at: this.now() };
    list.push(entry);
    writeJson(madeFile(this.cfg), list);
    saveSettings(this.cfg, { llamacpp: { models: { [id]: r.files.mmproj ? { gguf: r.files.gguf, mmproj: r.files.mmproj } : { gguf: r.files.gguf } } } });
    if (this.shop?.catalog) mergeMadeBrains(this.shop.catalog, this.cfg);
    r.used = true; this.save();
    return { id, name: entry.name };
  }
}

// /api/lab: the page's calls. Starting, stopping and Use in Bob only from this replicant matrix itself, or a Bob on
// the Bob-Net the owner let in (the phone starts and watches jobs; the door's own rules still apply).
export async function labRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!p.startsWith('/api/lab')) return false;
  try {
    if (req.method === 'GET' && p === '/api/lab') { send(res, 200, lab.view()); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (!isLocal && !['/api/lab/plan'].includes(p)) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
    if (p === '/api/lab/plan') { const pl = lab.plan(b.recipe); send(res, 200, { problems: pl.problems, notes: pl.notes, steps: pl.steps.map((s) => ({ id: s.id, label: s.label })), text: isLocal ? pl.text : '' }); return true; }
    if (p === '/api/lab/start') { send(res, 200, await lab.start(b.recipe, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/stop') { send(res, 200, lab.stop()); return true; }
    if (p === '/api/lab/use') { send(res, 200, lab.use(String(b.run || ''))); return true; }
    if (p === '/api/lab/recipe') { send(res, 200, { recipes: lab.saveRecipe(b.recipe) }); return true; }
    send(res, 404, { error: 'no' }); return true;
  } catch (e) { send(res, 400, { error: e.message }); return true; }
}
