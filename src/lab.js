// 1.5.135 Computer Science Lab (Lab 1: free, on this replicant matrix). A recipe from the Lab page becomes a list of
// steps: count which experts the lessons use (llama-imatrix), cut the experts (Bob's own cutter, src/lab-gguf.js),
// take out sight or hearing, make the running files (llama-quantize), then the Lab test (src/lab-test.js). Nothing is
// rented and nothing is downloaded here; the rented parts are Lab 2. One Lab job at a time, never while Gaming is on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readGguf, brainFacts, readerFacts, writeGguf, readCounts, busiest, coverageKeep, checkKeep, isHearingTensor, isSightTensor } from './lab-gguf.js';
import { startServer, runQuiz, PARTS } from './lab-test.js';
import { saveSettings } from './config.js';
import { gaming } from './sessions.js';
import { TEMPLATE_IDS, templateById } from '../public/lab-templates.js';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nodeCmd } from './selftools.js';
import { LESSON_SKILLS, SKILL_IDS } from './lab-skills.js';

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
  const how = ['file', 'cover'].includes(s.cut?.how) ? s.cut.how : 'busiest';
  const cut = s.cut && typeof s.cut === 'object' ? {
    how, keep: how === 'cover' && !Number(s.cut.keep) ? 0 : Math.max(1, Math.min(1024, Number(s.cut.keep) || 0)), file: typeof s.cut.file === 'string' ? s.cut.file : '',
    ...(how === 'cover' ? { cover: [0.9, 0.95, 0.99].includes(Number(s.cut.cover)) ? Number(s.cut.cover) : 0.95, strong: [...new Set([].concat(s.cut.strong || []).map((x) => String(x).slice(0, 40)))].slice(0, 30) } : {})
  } : null;
  const l = r.lessons || {};
  return {
    template: TEMPLATE_IDS.includes(r.template) ? r.template : '',
    name: String(r.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    from: String(r.from || '').slice(0, 120),
    lessons: { kind: ['file', 'chats', 'none', 'set'].includes(l.kind) ? l.kind : 'none', file: typeof l.file === 'string' ? l.file : '', set: l.kind === 'set' ? slugOf(l.set) : '', chunks: Math.max(20, Math.min(2000, Number(l.chunks) || 200)) },
    smaller: { sight: s.sight === true, hearing: s.hearing === true, cut, files: [...new Set([].concat(s.files || []).filter((t) => RUNNING_TYPES.includes(t)))], measure: s.measure === true, try: Boolean(cut) && s.try === true, tryStop: Boolean(cut) && s.try === true && s.tryStop !== false },
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
export function planRecipe(recipe, { brain, facts, tools, outDir, skillNamesFor = () => [] }) {
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
  if (s.cut && facts.experts && !(s.cut.how === 'cover' && !s.cut.keep) && (s.cut.keep < facts.used || s.cut.keep >= facts.experts)) problems.push(`Keep between ${facts.used} and ${facts.experts - 1} experts per layer (this brain picks ${facts.used} for every word).`);
  if (s.files.length && !facts.fullSize) problems.push(`${brain.name}'s file is already a running file (${facts.fileType}). Making running files needs the full-size copy (F16 or BF16). Untick Make the running files, or start from a full-size copy.`);
  if (s.files.includes('Q3_K_M')) notes.push('Q3 is only worth it for brains meant for 8 GB or less.');
  if (s.cut?.how === 'busiest' && r.lessons.kind === 'none') problems.push('Keeping the busiest experts needs lessons to count them on. Pick a lesson set in step 2, or use an expert list you have.');
  if (s.cut?.how === 'cover' && r.lessons.kind === 'none') problems.push('Keeping every skill covered needs lessons to count each skill on. Pick a lesson set in step 2.');
  const skills = s.cut?.how === 'cover' && r.lessons.kind !== 'none' ? lessonSkillNames(r.lessons, skillNamesFor) : [];
  if (s.cut?.how === 'cover' && r.lessons.kind !== 'none' && skills.length === 1) notes.push(`These lessons have one skill (${skills[0]}), so the coverage cut keeps what that one needs. A lesson set with several skills (a "job" or "skill" on each lesson) protects each of them.`);
  if (s.cut?.how === 'cover') for (const x of s.cut.strong) if (!skills.includes(x)) problems.push(`There's no skill called ${x} in these lessons.`);
  if (s.cut?.how === 'file' && !s.cut.file) problems.push('Pick the expert list file.');
  if (r.lessons.kind === 'file' && !r.lessons.file) problems.push('Pick the lesson file.');
  for (const [k, p] of Object.entries(tools)) if (!p.found && ((k === 'imatrix' && s.cut?.how === 'busiest') || (k === 'quantize' && s.files.length) || k === 'server')) problems.push(`${path.basename(p.path)} isn't in Bob's engine folder. Get models, Engines, Bob's own engine has it; download the engine again if it's missing.`);

  let file = brain.gguf;
  if (s.cut?.how === 'busiest') {
    const corpus = path.join(dir, 'lessons.txt'), counts = path.join(dir, 'counts.gguf');
    steps.push({ id: 'lessons', label: r.lessons.kind === 'chats' ? 'Gather your chats with Bob as lessons' : 'Read the lesson set', cmd: `# Bob writes the lessons as one text file: ${q(corpus)}`, corpus });
    steps.push({ id: 'count', label: 'Count which experts the lessons use', cmd: `${q(tools.imatrix.path)} -m ${q(brain.gguf)} -f ${q(corpus)} -o ${q(counts)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, corpus, counts, card: true });
  } else if (s.cut?.how === 'cover' && skills.length) {
    // The coverage cut: one lesson file and one count per skill, then a keep list that holds every skill's share.
    const corpus = path.join(dir, 'lessons.txt');
    const corpora = skills.map((sk) => ({ skill: sk, file: path.join(dir, `lessons-${slugOf(sk)}.txt`) }));
    steps.push({ id: 'lessons', label: 'Sort the lessons by skill', cmd: `# Bob writes one text file per skill (${skills.join(', ')}) and one with them all: ${q(corpus)}`, corpus, corpora });
    for (const c of corpora) {
      const counts = path.join(dir, `counts-${slugOf(c.skill)}.gguf`);
      steps.push({ id: 'count', label: `Count which experts ${c.skill} uses`, cmd: `${q(tools.imatrix.path)} -m ${q(brain.gguf)} -f ${q(c.file)} -o ${q(counts)} -c 4096 --chunks ${r.lessons.chunks} --fit on`, corpus: c.file, counts, skill: c.skill, card: true });
    }
  }
  if (s.try) {
    // Try it first: Brain Engine runs the whole brain with only the kept experts switched on, so the Lab test shows
    // what the cut will do before any file is written. The same run, with every expert on, is the "before" score.
    if (!tools.brainEngine?.found) problems.push('Try it first needs Brain Engine, Bob\'s Lab engine, on this replicant matrix. Get it in Get models > Engines: Brain Engine (test build), or untick Try it first.');
    steps.push({ id: 'try', label: 'Try it first: test with only the kept experts switched on', cmd: `${q(tools.brainEngine?.path || 'brain-engine/llama-server')} -m ${q(brain.gguf)} -c 8192 --jinja --fit on\n# the Lab test with every expert on, then POST /expert-mask {"keep": <the keep list>} and the Lab test again${s.tryStop ? '\n# stop here if it scores more than 10 points lower on the Lab test' : ''}`, gguf: brain.gguf, card: true });
  }
  if (s.cut) {
    const out = path.join(dir, `${slug}-${s.cut.keep || 'cover'}x.gguf`);
    const n = s.cut.keep || 'the coverage number of';
    steps.push({ id: 'cut', label: s.cut.keep ? `Cut to ${s.cut.keep} experts per layer` : 'Cut to the experts every skill needs', cmd: `# Bob's own cutter (no command-line tool does this yet): keep ${n} of ${facts.experts} experts per layer\n#   from ${q(brain.gguf)}\n#   to   ${q(out)}${s.cut.how === 'file' ? `\n#   with the expert list ${q(s.cut.file)}` : ''}${s.cut.how === 'cover' ? `\n#   coverage rule: every skill keeps ${Math.round(s.cut.cover * 100)}% of its routing in every layer${s.cut.strong.length ? ` (99% for ${s.cut.strong.join(', ')})` : ''}, the Forge's keep.py rule` : ''}`, src: file, out });
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
  if (r.test.compare && s.try) notes.push(`Try it first already tests ${brain.name} with every expert on, so that's the score to compare with.`);
  if (r.test.compare && !s.try) steps.push({ id: 'compare', label: `Test ${brain.name} too, to compare`, cmd: `${q(tools.server.path)} -m ${q(brain.gguf)} -c 8192 --jinja --fit on`, gguf: brain.gguf, mmproj: null, card: true });
  if (finals[0] === brain.gguf && !s.cut && !s.files.length) notes.push(`The new brain uses ${brain.name}'s own brain file; only the reader changes. Nothing big is copied.`);
  return { recipe: r, problems, notes, steps, slug, dir, finals, reader };
}

// One lesson text from a lesson file (lessons.jsonl from the model lab, or plain text) or from the owner's chats.
export function lessonText(cfg, lessons) { return [...lessonSkills(cfg, lessons).values()].flat().join('\n'); }

// The lessons by skill: a lessons.jsonl line's "skill" or "job" names its skill; chats and plain text are one skill.
const CHATS_SKILL = 'your chats';
export function lessonSkills(cfg, lessons) {
  const by = new Map();
  let parts = [];
  const add = (role, text) => { if (text && typeof text === 'string') parts.push(`<|im_start|>${role}\n${text}<|im_end|>`); };
  const into = (skill) => { if (!by.has(skill)) by.set(skill, []); parts = by.get(skill); };
  if (lessons.kind === 'chats') {
    into(CHATS_SKILL);
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
        into(skillOf(l));
        for (const m of l.messages || []) add(m.role === 'tool' ? 'user' : m.role, m.content || (m.tool_calls || []).map((c) => `<tool_call>${c.function?.name}</tool_call>`).join(''));
      }
    } else { into('lessons'); parts.push(raw); }
  }
  for (const [k, v] of by) if (!v.length) by.delete(k);
  return by;
}
const skillOf = (l) => String(l.skill || l.job || 'lessons').slice(0, 40);

// Skill names for planning, without reading the whole file again on every click (cached by file and its date).
const skillCache = new Map();
export function lessonSkillNames(lessons, fromFile = () => []) {
  if (lessons.kind === 'chats') return [CHATS_SKILL];
  if (lessons.kind !== 'file' || !lessons.file) return [];
  let st; try { st = fs.statSync(lessons.file); } catch { return []; }
  const key = `${lessons.file}|${st.mtimeMs}|${st.size}`;
  if (!skillCache.has(key)) {
    let names = fromFile(lessons.file);
    if (!names?.length) {
      const set = new Set();
      if (/\.jsonl$/i.test(lessons.file)) { for (const line of fs.readFileSync(lessons.file, 'utf8').split(/\r?\n/)) { if (!line.trim()) continue; try { set.add(skillOf(JSON.parse(line))); } catch {} } }
      else set.add('lessons');
      names = [...set];
    }
    skillCache.set(key, names);
  }
  return skillCache.get(key);
}

// Brain Engine's mask: one list per layer, null for a layer without experts (it keeps them all).
export function maskFor(keep, facts) {
  const n = Math.max(facts.layers || 0, keep?.length || 0);
  return Array.from({ length: n }, (_, i) => (Array.isArray(keep?.[i]) ? keep[i] : null));
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


// 1.5.143 Lab 2a: write a new lesson set with a teacher brain on this replicant matrix. The lessons land in
// <Bob's data>/lab/lessons/<name>/lessons.jsonl, one skill per lesson ("job"), so the coverage cut can count each one.
export const lessonSetsDir = (cfg) => path.join(labDir(cfg), 'lessons');
export const WRITER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lab-write.js');
export const SECONDS_PER_LESSON = 25; // a rough guess for a 30B teacher on a 16 GB card; the job shows the real pace
export function cleanWrite(w = {}) {
  return {
    name: String(w.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    teacher: String(w.teacher || '').slice(0, 120),
    skills: [...new Set([].concat(w.skills || []).filter((x) => SKILL_IDS.includes(x)))],
    count: Math.max(100, Math.min(20000, Math.round(Number(w.count) || 500))),
    think: ['on', 'off', 'half'].includes(w.think) ? w.think : 'half'
  };
}
// A licence that lets the teacher's answers teach another brain. Apache and MIT do; an unknown one is checked by you.
export function teacherLicence(license = '') {
  const l = String(license).toLowerCase();
  if (!l) return { ok: true, note: 'I don\'t know this teacher\'s licence. Check its model card says you may train other brains on what it writes.' };
  if (/non-?commercial|research only|no derivatives|\bnc\b/.test(l)) return { ok: false, note: `This teacher's licence (${license}) doesn't allow it.` };
  if (/apache|mit\b|^mit/.test(l)) return { ok: true, note: '' };
  return { ok: true, note: `Check this teacher's licence (${license}) lets you train other brains on what it writes.` };
}
export function lessonSets(cfg) {
  const root = lessonSetsDir(cfg), out = [];
  let dirs = []; try { dirs = fs.readdirSync(root, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name); } catch {}
  for (const d of dirs) {
    const file = path.join(root, d, 'lessons.jsonl');
    if (!fs.existsSync(file)) continue;
    const meta = readJson(path.join(root, d, 'write.json'), {});
    let count = 0; try { count = fs.readFileSync(file, 'utf8').split('\n').filter((x) => x.trim()).length; } catch {}
    out.push({ id: d, name: meta.name || d, file, count, want: meta.count || 0, skills: meta.skills || [], teacher: meta.teacherName || '', done: meta.done === true });
  }
  return out;
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
    const t = { server, imatrix: path.join(dir, exeName('llama-imatrix')), quantize: path.join(dir, exeName('llama-quantize')), brainEngine: path.join(this.cfg.agentDir, 'brain-engine', exeName('llama-server')) };
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
    const cardGB = Number(this.cfg.gpuVramGB) || 0;
    const brains = this.brains().map((b) => { let f = null; try { f = inspect(b); } catch (e) { return { ...b, gguf: undefined, mmproj: undefined, error: e.message }; } return { id: b.id, name: b.name, family: b.family, community: b.community, naughty: b.naughty, madeInLab: b.madeInLab, license: b.license, facts: f && { arch: f.arch, experts: f.experts, used: f.used, groups: f.groups, layers: f.layers, fileType: f.fileType, fullSize: f.fullSize, sizeGB: f.sizeGB, sight: f.sight, hearing: f.hearing, readerGB: f.readerGB }, cuts: f ? cutSizes(f).map((c) => ({ ...c, fit: fitWords(c.gb, cardGB) })) : [], fit: f ? fitWords(f.sizeGB, cardGB) : '' }; });
    return { on: labOn(this.cfg), room, cardGB, brains, runs: this.runs.slice(-20).reverse().map((r) => this.runView(r)), recipes: readJson(this.recipesFile, []), made: madeBrains(this.cfg).map((m) => ({ id: m.id, name: m.name, sizeGB: m.sizeGB, from: m.fromName })), busy: Boolean(this.job), gaming: gaming(this.cfg), types: RUNNING_TYPES, lessonSkills: LESSON_SKILLS.map(({ id, label, hint }) => ({ id, label, hint })), lessonSets: lessonSets(this.cfg).map(({ file, ...x }) => x), secondsPerLesson: SECONDS_PER_LESSON, brainEngine: this.tools().brainEngine.found };
  }

  runView(r) { return { id: r.id, kind: r.kind || 'make', name: r.name, from: r.fromName, state: r.state, step: r.step, stepLabel: r.stepLabel, progress: r.progress, steps: r.steps?.map((s) => ({ id: s.id, label: s.label, state: s.state })), error: r.error, notes: r.notes || [], report: r.report, at: r.at, used: Boolean(r.used), sizeGB: r.sizeGB }; }

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
    if (old && old.teacher !== x.teacher) problems.push(`You already have a lesson set called ${x.name}, from another teacher. Pick another name.`);
    if (old && old.teacher === x.teacher) notes.push(`There's already a lesson set called ${x.name} from this teacher. Bob carries on with it: the lessons it has stay, and he writes the rest.`);
    if (t) {
      const lic = teacherLicence(t.license);
      if (!lic.ok) problems.push(lic.note); else if (lic.note) notes.push(lic.note);
      if (t.naughty) notes.push(`${t.name} is on the naughty list, so its lessons teach its ways too.`);
      if (!this.tools().server.found) problems.push(`${path.basename(this.tools().server.path)} isn't in Bob's engine folder. Get models, Engines, Bob's own engine has it.`);
    }
    notes.push('A teacher teaches best when it\'s at least as good as the brain you\'ll teach: the brain you\'re going to cut is often the best teacher here.');
    const hours = Math.max(1, Math.round((x.count * SECONDS_PER_LESSON) / 3600));
    return { write: x, teacher: t, problems, notes, dir, slug, out: path.join(dir, 'lessons.jsonl'), hours };
  }

  async startWrite(w, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.planWrite(w);
    if (p.problems.length) throw new Error(p.problems[0]);
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
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
  }

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
      const n = await fx.write({ url: srv.url, out: p.out, skills: p.write.skills, count: p.write.count, think: p.write.think }, { signal, log, onProgress: (d, total) => {
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
  }

  save() { writeJson(this.runsFile, this.runs.slice(-50)); }
  tell(r) { this.save(); this.broadcast({ type: 'lab', run: this.runView(r) }); }

  async go(r, p, brain, signal) {
    const log = (t) => { try { fs.mkdirSync(p.dir, { recursive: true }); fs.appendFileSync(path.join(p.dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
    const tools = this.tools();
    const fx = { ...this.defaultSteps(tools, log), ...this.stepFns };
    let keep = null, coverage = null, tried = null, keepDone = false; const tests = {}; const skillCounts = [];
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
          if (!counts.filter(Boolean).length) throw new Error('llama-imatrix gave no per-expert counts. Bob\'s engine may be too old for that; update it in Get models, Engines.');
          if (s.skill) skillCounts.push({ name: s.skill, counts });
          else {
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
      if (tried && !tests.compare) tests.compare = { ...tried.full, engine: 'Brain Engine' };
      r.report = { ...(tried ? { tried: { full: tried.full.score, masked: tried.masked.score } } : {}), made: tests.test, from: tests.compare || null, sizeGB: r.sizeGB, fromGB: round1(size(brain.gguf) / GB), at: this.now(), ...(coverage ? { coverage } : {}) };
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
      serve: ({ gguf, ctx, signal, log: l }) => startServer({ exe: tools.server.path, gguf, ctx, signal, log: l || log }),
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

// /api/lab: the page's calls. Starting, stopping and Use in Bob only from this replicant matrix itself, or a Bob on
// the Bob-Net the owner let in (the phone starts and watches jobs; the door's own rules still apply).
export async function labRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!p.startsWith('/api/lab')) return false;
  try {
    if (req.method === 'GET' && p === '/api/lab') { send(res, 200, lab.view()); return true; }
    if (req.method === 'GET' && p === '/api/lab/measures') { send(res, 200, { measures: lab.measures().map(({ rec, ...m }) => m) }); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (p === '/api/lab/compare' && !b.save) { send(res, 200, lab.compare(b.ids)); return true; }
    if (!isLocal && !['/api/lab/plan', '/api/lab/write/plan'].includes(p)) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
    if (p === '/api/lab/plan') { const pl = lab.plan(b.recipe); send(res, 200, { problems: pl.problems, notes: pl.notes, skills: pl.skills || [], steps: pl.steps.map((s) => ({ id: s.id, label: s.label })), text: isLocal ? pl.text : '' }); return true; }
    if (p === '/api/lab/write/plan') { const pl = lab.planWrite(b.write); send(res, 200, { problems: pl.problems, notes: pl.notes, hours: pl.hours, file: isLocal ? pl.out : '' }); return true; }
    if (p === '/api/lab/write') { send(res, 200, await lab.startWrite(b.write, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/start') { send(res, 200, await lab.start(b.recipe, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/stop') { send(res, 200, lab.stop()); return true; }
    if (p === '/api/lab/use') { send(res, 200, lab.use(String(b.run || ''))); return true; }
    if (p === '/api/lab/compare') { const c = lab.compare(b.ids, b.save === 'csv' ? 'csv' : 'json'); send(res, 200, { table: c.table, file: path.basename(c.file) }); return true; }
    if (p === '/api/lab/recipe') { send(res, 200, { recipes: lab.saveRecipe(b.recipe) }); return true; }
    send(res, 404, { error: 'no' }); return true;
  } catch (e) { send(res, 400, { error: e.message }); return true; }
}
