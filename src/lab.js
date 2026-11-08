// 1.5.141 Computer Science Lab (Lab 1: free, on this replicant matrix). A recipe from the Lab page becomes a list of
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
import { TEMPLATE_IDS, templateById } from '../public/lab-templates.js';
import crypto from 'node:crypto';

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
    template: TEMPLATE_IDS.includes(r.template) ? r.template : '',
    name: String(r.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    from: String(r.from || '').slice(0, 120),
    lessons: { kind: ['file', 'chats', 'none'].includes(l.kind) ? l.kind : 'none', file: typeof l.file === 'string' ? l.file : '', chunks: Math.max(20, Math.min(2000, Number(l.chunks) || 200)) },
    smaller: { sight: s.sight === true, hearing: s.hearing === true, cut, files: [...new Set([].concat(s.files || []).filter((t) => RUNNING_TYPES.includes(t)))], measure: s.measure === true },
    test: { compare: r.test?.compare !== false }
  };
}

// 1.5.142 One measurement record per tested brain (measure.json, bob-design/cut-and-train-templates.md section 3),
// the same shape the Forge and the PC benchmarks write, so Compare can put any of them side by side. Missing parts are
// left out, never zeroed. No paths, host names or people.
export function measureRecord({ name, sha256, facts = {}, sizeGB, template, parent, test, engine, cfg = {}, when }) {
  const rec = { brain: { name } };
  if (sha256) rec.brain.sha256 = sha256;
  if (facts.fileType) rec.brain.quant = facts.fileType;
  if (facts.experts) rec.brain.expertsKept = facts.experts;
  if (sizeGB) rec.brain.sizeGB = sizeGB;
  if (template) rec.brain.template = template;
  if (parent) rec.brain.parent = parent;
  rec.where = { place: 'home' };
  if (test?.where === 'card' && Number(cfg.gpuVramGB)) rec.where.card = `${Number(cfg.gpuVramGB)} GB card`;
  else if (test?.where === 'processor') rec.where.card = 'processor only';
  if (engine || test?.engine) rec.where.engine = test?.engine || engine;
  rec.where.settings = '-c 8192 --jinja --fit on, thinking off, temperature 0';
  rec.when = new Date(when || Date.now()).toISOString().slice(0, 10);
  if (test?.parts) {
    rec.scores = {};
    for (const [k, v] of Object.entries(test.parts)) rec.scores[PARTS[k] || k] = v.score;
    rec.scores['Lab test (all)'] = test.score;
  }
  if (test?.tps || test?.prefillTps) rec.speed = { ...(test.tps ? { tps: test.tps } : {}), ...(test.prefillTps ? { prefillTps: test.prefillTps } : {}) };
  return rec;
}

// sha256 of a brain file, read in pieces so a 20 GB file never sits in memory and Bob keeps answering.
export function sha256File(file, signal) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const st = fs.createReadStream(file, { highWaterMark: 16 << 20 });
    const stop = () => { st.destroy(); reject(new Error('Stopped.')); };
    signal?.addEventListener?.('abort', stop, { once: true });
    st.on('data', (d) => h.update(d));
    st.on('error', reject);
    st.on('end', () => { signal?.removeEventListener?.('abort', stop); resolve(h.digest('hex')); });
  });
}

// Compare: rows of fields, one column per record, and a difference column (second minus first) when there are two.
const FIELD_LABELS = { 'brain.sizeGB': 'Size (GB)', 'brain.expertsKept': 'Experts per layer', 'brain.quant': 'File type', 'brain.template': 'Template', 'brain.parent': 'Made from', 'where.place': 'Where', 'where.card': 'Card', 'where.engine': 'Engine', 'when': 'Tested on', 'speed.tps': 'Words a second', 'speed.prefillTps': 'Reading speed (words a second)' };
const flat = (o, pre = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { const key = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = v; } return out; };
export function compareTable(records) {
  const flats = records.map((r) => flat(r));
  const keys = [];
  for (const f of flats) for (const k of Object.keys(f)) if (!keys.includes(k) && k !== 'brain.name' && k !== 'brain.sha256' && k !== 'where.settings') keys.push(k);
  const order = (k) => (k.startsWith('scores.') ? 0 : k.startsWith('speed.') ? 1 : k.startsWith('memory.') ? 2 : k.startsWith('brain.') ? 3 : 4);
  keys.sort((a, b) => order(a) - order(b));
  const rows = keys.map((k) => {
    const values = flats.map((f) => (k in f ? (k === 'brain.template' ? templateById(f[k])?.title || f[k] : f[k]) : null));
    const row = { field: k, label: FIELD_LABELS[k] || (k.startsWith('scores.') ? `${k.slice(7)} (out of 100)` : k), values };
    if (values.length === 2 && typeof values[0] === 'number' && typeof values[1] === 'number') {
      const d = Math.round((values[1] - values[0]) * 10) / 10;
      row.diff = d; row.diffText = `${d > 0 ? '+' : ''}${d}${values[0] ? ` (${d > 0 ? '+' : ''}${Math.round((100 * d) / values[0])}%)` : ''}`;
    }
    return row;
  });
  return { names: records.map((r) => r.brain?.name || '?'), rows };
}
export function compareCsv(table) {
  const cell = (v) => (v === null || v === undefined ? '' : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
  const two = table.names.length === 2;
  const lines = [['Field', ...table.names, ...(two ? ['Difference'] : [])].map(cell).join(',')];
  for (const r of table.rows) lines.push([r.label, ...r.values, ...(two ? [r.diffText || ''] : [])].map(cell).join(','));
  return lines.join('\r\n') + '\r\n';
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
  // Measure before making the running files: an importance matrix from the CUT file (expert counts change in a cut,
  // so one made on the source brain doesn't line up), passed to llama-quantize so the running files lose less.
  let imatrix = null;
  if (s.measure && s.files.length) {
    if (r.lessons.kind === 'none') problems.push('Measuring before making the running files needs lessons to measure on. Pick a lesson set in step 2, or untick Measure.');
    else {
      const corpus = path.join(dir, 'lessons.txt');
      if (!steps.some((x) => x.id === 'lessons')) steps.unshift({ id: 'lessons', label: r.lessons.kind === 'chats' ? 'Gather your chats with Bob as lessons' : 'Read the lesson set', cmd: `# Bob writes the lessons as one text file: ${q(corpus)}`, corpus });
      imatrix = path.join(dir, 'imatrix.gguf');
      steps.push({ id: 'imatrix', label: 'Measure which weights matter most', cmd: `${q(tools.imatrix.path)} -m ${q(file)} -f ${q(corpus)} -o ${q(imatrix)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, src: file, corpus, out: imatrix, card: true });
      if (!tools.imatrix?.found && !problems.some((x) => x.includes(path.basename(tools.imatrix.path)))) problems.push(`${path.basename(tools.imatrix.path)} isn't in Bob's engine folder. Get models, Engines, Bob's own engine has it; download the engine again if it's missing.`);
    }
  }
  const finals = [];
  for (const t of s.files) {
    const out = path.join(dir, `${slug}-${t}.gguf`);
    steps.push({ id: 'quantize', label: `Make the ${t} running file`, cmd: `${q(tools.quantize.path)} ${imatrix ? `--imatrix ${q(imatrix)} ` : ''}${q(file)} ${q(out)} ${t}`, src: file, out, type: t, imatrix });
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
  constructor(cfg, { shop, brain, broadcast = () => {}, now = Date.now, steps = {}, room = () => labRoom() } = {}) {
    this.room = room; // tests pass their own, so the result doesn't depend on the tester's memory
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

  engineName() { return 'llama.cpp'; }

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
        } else if (s.id === 'imatrix') {
          await fx.imatrix(s, { recipe: p.recipe, signal });
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
      cut: async (s, { keep, onProgress, signal }) => writeGguf(s.src, s.out, { keep, onProgress, signal }),
      reader: async (s, { signal }) => writeGguf(s.src, s.out, { drop: (t) => (s.drop === 'sight' ? isSightTensor(t.name) : isHearingTensor(t.name)), set: s.drop === 'sight' ? { 'clip.has_vision_encoder': false } : { 'clip.has_audio_encoder': false }, signal }),
      imatrix: (s, { recipe, signal }) => run(tools.imatrix.path, ['-m', s.src, '-f', s.corpus, '-o', s.out, '-c', '4096', '--chunks', String(recipe.lessons.chunks), '--fit', 'on'], { signal, log })
        .catch((e) => { if (signal.aborted) throw e; return run(tools.imatrix.path, ['-m', s.src, '-f', s.corpus, '-o', s.out, '-c', '4096', '--chunks', String(recipe.lessons.chunks), '-ngl', '0'], { signal, log }); }),
      quantize: (s, { signal }) => run(tools.quantize.path, [...(s.imatrix ? ['--imatrix', s.imatrix] : []), s.src, s.out, s.type], { signal, log }),
      test: async (s, { signal, onProgress }) => {
        const srv = await startServer({ exe: tools.server.path, gguf: s.gguf, mmproj: s.mmproj, signal, log });
        try {
          let engine = 'llama.cpp';
          try { if ((await fetch(srv.url + '/expert-mask', { signal: AbortSignal.timeout(3000) })).ok) engine = 'Brain Engine'; } catch {}
          return { ...(await runQuiz(srv.url, { signal, onStep: (d, t) => onProgress(d / t) })), where: srv.where, engine };
        } finally { srv.stop(); }
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

// /api/lab: the page's calls. Starting, stopping and Use in Bob only from this replicant matrix itself (403 from the
// door); another device, the phone included, only sees the plan, without the commands or any file paths.
export async function labRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!p.startsWith('/api/lab')) return false;
  try {
    if (req.method === 'GET' && p === '/api/lab') { send(res, 200, lab.view()); return true; }
    if (req.method === 'GET' && p === '/api/lab/measures') { send(res, 200, { measures: lab.measures().map(({ rec, ...m }) => m) }); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (p === '/api/lab/compare' && !b.save) { send(res, 200, lab.compare(b.ids)); return true; }
    if (!isLocal && !['/api/lab/plan'].includes(p)) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
    if (p === '/api/lab/plan') { const pl = lab.plan(b.recipe); send(res, 200, { problems: pl.problems, notes: pl.notes, steps: pl.steps.map((s) => ({ id: s.id, label: s.label })), text: isLocal ? pl.text : '' }); return true; }
    if (p === '/api/lab/start') { send(res, 200, await lab.start(b.recipe, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/stop') { send(res, 200, lab.stop()); return true; }
    if (p === '/api/lab/use') { send(res, 200, lab.use(String(b.run || ''))); return true; }
    if (p === '/api/lab/compare') { const c = lab.compare(b.ids, b.save === 'csv' ? 'csv' : 'json'); send(res, 200, { table: c.table, file: path.basename(c.file) }); return true; }
    if (p === '/api/lab/recipe') { send(res, 200, { recipes: lab.saveRecipe(b.recipe) }); return true; }
    send(res, 404, { error: 'no' }); return true;
  } catch (e) { send(res, 400, { error: e.message }); return true; }
}
