// 1.5.141 Computer Science Lab (Lab 1: free, on this replicant matrix). A recipe from the Lab page becomes a list of
// steps: count which experts the lessons use (llama-imatrix), cut the experts (Bob's own cutter, src/lab-gguf.js),
// take out sight or hearing, make the running files (llama-quantize), then the Lab test (src/lab-test.js). Nothing is
// rented and nothing is downloaded here; the rented parts are Lab 2. One Lab job at a time, never while Gaming is on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { OS } from './platform.js'; // 1.5.171 a Mac's graphics memory is shared, so the Challenges line says so
import { spawn } from 'node:child_process';
import { readGguf, brainFacts, readerFacts, writeGguf, readCounts, busiest, coverageKeep, checkKeep, isHearingTensor, isSightTensor } from './lab-gguf.js';
import { startServer, runQuiz, PARTS } from './lab-test.js';
import { saveSettings } from './config.js';
import { labEngineDirs, engineNameOf, LAB_ENGINES } from './engines.js';
import { gaming } from './sessions.js';
import { TEMPLATE_IDS, templateById } from '../public/lab-templates.js';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { nodeCmd } from './selftools.js';
import { LESSON_SKILLS, SKILL_IDS } from './lab-skills.js';
import { learnBrain, runLearn, LEARN_CARDS } from './lab-learn.js'; // 1.5.151 the Learn tab
// 1.5.152 Lab 2c, the lesson builder: lessons from the owner's own files, with a preview before anything big runs.
import { expandItems, readFile as readSource, KIND_WORDS, MAX_FILES } from './lab-build-read.js';
import { survey, wouldLearn, scrub, userName } from './lab-build-scan.js';
import { KINDS, KIND_IDS, SAMPLE_COUNT } from './lab-build-kinds.js';
import { findOffice } from './office.js';
import { writeZip } from './zip.js';
import { parseHfRef, hfLookup } from './lab-hf.js'; // 1.5.163
import { PACKS, PACK_IDS, runPack, mergeScores, readScores, scoreboard, scoreFile, codeTool, CLASSES } from './lab-challenges.js'; // 1.5.153 Challenges
import { runSandboxed, sandboxHolds } from './selftools.js';
import { NEEDS_SANDBOX } from './lab-packs.js'; // 1.5.164 more packs
import { cleanGen, rankable, genLine, spread, GEN_DEFAULT, CTX_CHOICES, MAX_REPEATS } from './lab-gen.js'; // 1.5.168 Professional mode
import { readMyPacks, importMyPack, deleteMyPack, runMyPack, CHECKS as MY_CHECKS } from './lab-mypacks.js'; // 1.5.168 your own packs
import { ownRefusalAsks, cleanSandbox, guardLesson, saveGuardLesson, PAGE_DEMO, SANDBOX_MAX_TURNS, SETTINGS as GUARD_SETTINGS, STYLES as GUARD_STYLES } from './lab-guard.js'; // 1.5.164 Guard rails
import { METHODS, LEFT_OUT, forgeDir, forgeRuns, forgeBrains, forgePlans, makeForgePlan, forgePlansDir, FORGE_KEY, forgeStartProblems, launchForge, alive, runPodId, scrub as scrubForge, onDrive } from './lab-forge.js';
import { rentKeyEnv } from './rental.js'; // 1.5.159 the Forge tab
import { LADDER, PLAY_MAX_GB, ladderTexts, ladderDiskGB, readPerplexity, ladderTable, ladderSaw, playDir, readLadders } from './lab-playground.js'; // 1.5.156 Playground
import { pagesRoute } from './lab-pages.js'; // 1.5.16x Playground: Longer, Faster, Teach it (thinking-paths sec 15)
import { recipesRoute } from './lab-recipes.js'; // 1.5.154 cut recipes, the estimate table and the usage map
import { sensesRoute } from './lab-senses-route.js'; // Give it eyes / Give it ears
import { forgeDoesSenses } from './lab-senses.js';
// 1.5.164 the Forge's home ways (mix, stack, take out the refusal habit) and Peek inside
import { MIX_WAYS, MIX_IDS, planMix, mixGguf, planStack, stackGguf, shareOf } from './lab-merge.js';
import { planRefusals, readDirections, pickLayers, removeRefusals, keptCheck, reflexCheck, PLAIN_PROMPTS, RELUCTANT_PROMPTS, writeTeachBack, TEACH_BACK_SET, LAYER_CHOICES, KEPT } from './lab-refusals.js';
import { peekView, tallyTrace, addToTally, keepFromLit, askTraced, IDLE_MS, NO_TRACE, NO_ENGINE } from './lab-peek.js';
import { usageFolder, keepFileOf } from './lab-usage.js';
import { ownModels, OWN_FAMILY } from './own-models.js'; // Your own brains join the Lab's lists
import { fullSizeRoute } from './lab-fullsize.js'; // Bring in a full-size brain
import { benchBrain, benchLine } from './lab-bench.js'; // the standard speed test (llama-bench)
import { findTool } from './llama-tools.js';
import { diffusionRoute } from './lab-diffusion.js'; // Playground: Diffusion brains
import { partsOf, pickLessons, addLessonSet, downloadHfLessons, ADDED_FILE } from './lab-library.js'; // the lesson library: sets broken into parts

// 1.5.172 the Lab shows unless it is switched off (it was off until switched on before). Anything but false is on.
export const labOn = (cfg) => cfg?.computerLab !== false;
export const MIN_RAM_GB = 12;
// Too small to run the Lab (a Raspberry Pi, an 8 GB laptop): the Lab says so, and the switch carries the reason.
export function labRoom(totalBytes = os.totalmem()) {
  const gb = totalBytes / 1024 ** 3;
  return gb < MIN_RAM_GB ? { ok: false, why: `This replicant matrix has ${Math.round(gb)} GB of memory, and the Lab needs at least ${MIN_RAM_GB} GB. Start Lab jobs from another Bob on your Bob-Net instead.` } : { ok: true, why: '' };
}

// Running files the Lab can make, best first. Q3 only for brains meant for 8 GB or less (the Q4-or-better rule).
export const RUNNING_TYPES = ['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0', 'Q3_K_M'];
const exeName = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const isInsideDir = (f, root) => { const rel = path.relative(path.resolve(root), path.resolve(String(f || ''))); return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel); };
export const slugOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'lab-brain';
const GB = 1024 ** 3;
const round1 = (x) => Math.round(x * 10) / 10;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };
const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
// One lesson as the page shows it: the message, what Bob read, Bob's answer, the thinking (shortened), its skill and kind.
export function lessonCard(l) {
  const msgs = l.messages || [];
  const user = msgs.find((m) => m.role === 'user')?.content || '';
  const tool = msgs.find((m) => m.role === 'tool');
  const last = [...msgs].reverse().find((m) => m.role === 'assistant' && m.content);
  const clip = (s, n) => { s = String(s || ''); return s.length > n ? s.slice(0, n).replace(/\s+\S*$/, '') + ' ...' : s; };
  return { key: String(l.idea || ''), skill: l.job || '', kind: l.kind || '', think: Boolean(l.think), source: l.source || null, user: clip(user, 600), read: tool ? clip(tool.content, 700) : '', answer: clip(last?.content, 1200), thinking: clip(last?.reasoning_content, 300), tools: msgs.filter((m) => m.tool_calls).flatMap((m) => m.tool_calls.map((c) => c.function?.name)).filter(Boolean) };
}

export const labDir = (cfg) => path.join(cfg.dataDir, 'lab');
export const scoresDir = (cfg) => path.join(labDir(cfg), 'scores'); // 1.5.153 the Challenges scoreboard
export const resultsDir = (cfg) => path.join(labDir(cfg), 'results'); // 1.5.153 what Save writes

// 1.5.153 Save: a result table as Markdown, CSV or JSON (a picture is drawn by the page and sent as a PNG). Never
// paths, chats or names: the page only sends titles, column names and cells, and every cell is cut to plain text.
const cell = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\r\n]+/g, ' ').slice(0, 200));
export function cleanResult(b = {}) {
  const head = [].concat(b.head || []).slice(0, 20).map(cell);
  const rows = [].concat(b.rows || []).slice(0, 200).map((r) => [].concat(r || []).slice(0, head.length || 20).map(cell));
  const format = ['md', 'csv', 'json', 'png'].includes(b.format) ? b.format : 'md';
  return { title: cell(b.title).slice(0, 80) || 'Lab result', head, rows, note: cell(b.note), format, hardware: b.hardware === true };
}
export function hardwareLine(cfg, totalBytes = os.totalmem()) {
  const card = Number(cfg.gpuVramGB) || Number(cfg.cardGB) || 0;
  return `${card ? `${card} GB graphics card, ` : ''}${Math.round(totalBytes / 1024 ** 3)} GB RAM`;
}
export function resultText(r, { version = '', hardware = '', when = '' } = {}) {
  const foot = [`Made with Bob${version ? ` ${version}` : ''}'s Computer Science Lab`, when, hardware].filter(Boolean).join(' · ');
  if (r.format === 'csv') { const q = (v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v); return [r.head, ...r.rows].map((l) => l.map(q).join(',')).join('\n') + '\n'; }
  if (r.format === 'json') return JSON.stringify({ title: r.title, head: r.head, rows: r.rows, note: r.note || undefined, made: foot }, null, 1);
  const esc = (v) => v.replace(/\|/g, '\\|');
  return `# ${r.title}\n\n| ${r.head.map(esc).join(' | ')} |\n|${r.head.map(() => ' --- ').join('|')}|\n${r.rows.map((l) => `| ${l.map(esc).join(' | ')} |`).join('\n')}\n\n${r.note ? `${r.note}\n\n` : ''}_${foot}_\n`;
}
export const labModelsDir = (cfg) => path.join(cfg.bobModelsDir || path.join(cfg.agentDir, 'models', 'bob'), 'lab');
export const madeFile = (cfg) => path.join(labDir(cfg), 'made.json');
export const fullSizeDirOf = (cfg) => path.join(labModelsDir(cfg), 'full-size'); // where Bring in a full-size brain puts its downloads
export const madeBrains = (cfg) => readJson(madeFile(cfg), []).filter((m) => m && m.id && m.gguf && fs.existsSync(m.gguf));

// Lab-made brains that were put into Bob show in the catalogue next to their family, with no download.
export function mergeMadeBrains(catalog, cfg) {
  const have = new Set(catalog.models.map((m) => m.id));
  for (const m of madeBrains(cfg)) {
    if (have.has(m.id)) continue;
    catalog.models.push({ id: m.id, family: m.family || 'Lab', category: m.category || 'chat', jobs: m.jobs || ['bob'], name: m.name, what: m.what, sizeGB: m.sizeGB, vramGB: Math.ceil(m.sizeGB + 1), license: m.license || '', madeInLab: true, files: [], ...(m.refusalsOut ? { refusalsOut: true, naughty: m.naughty === true } : {}) }); // 1.5.164 never recommended, never a quiet pick: Lab brains carry no rec flag
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
  // Your own brains (Get models > Add your own brain, or the Lab's Bring in a full-size brain): the way a full-size file
  // gets here, since the catalogue only downloads running files.
  for (const o of ownModels(shop.cfg)) {
    if (!/\.gguf$/i.test(o.gguf) || !fs.existsSync(o.gguf) || out.some((b) => b.gguf === o.gguf)) continue;
    out.push({ id: o.id, name: o.name, family: OWN_FAMILY, category: 'chat', jobs: [], license: '', community: false, naughty: false, madeInLab: false, own: true, gguf: o.gguf, mmproj: o.mmproj || null });
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
    if (!tools.brainEngine?.found) problems.push('Try it first needs Brain Engine, Bob\'s Lab engine, on this replicant matrix. Get it in Get models > Engines: Brain Engine, or untick Try it first.');
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
    const built = readJson(path.join(root, d, 'build.json'), null); // a set built from the owner's files (Lab 2c)
    const added = built ? null : readJson(path.join(root, d, ADDED_FILE), null); // a set added from elsewhere (the lesson library)
    const meta = built || added || readJson(path.join(root, d, 'write.json'), {});
    let count = 0; try { count = fs.readFileSync(file, 'utf8').split('\n').filter((x) => x.trim()).length; } catch {}
    out.push({ id: d, name: meta.name || d, file, count, want: meta.count || 0, skills: built ? [...new Set((built.items || []).map((i) => i.skill).filter(Boolean))] : meta.skills || [], teacher: meta.teacherName || '', done: meta.done === true || Boolean(added), built: Boolean(built), kinds: built?.kinds || [], ...(added ? { added: true, source: added.source || '', license: added.license || '', link: added.link || '' } : {}) });
  }
  return out;
}

// A set's parts for the page: each category, source and way of thinking with its count, plus the counts of every
// combination so the page can show how many lessons are left as boxes are ticked off.
export function partsView(dir) {
  const p = partsOf(dir);
  if (!p) return null;
  const list = (o) => Object.entries(o || {}).map(([id, v]) => ({ id, label: v.label, count: v.count })).sort((a, b) => b.count - a.count);
  return { total: p.total, categories: list(p.categories), sources: list(p.sources), thinking: list(p.thinking), cells: p.cells };
}

// ---- Lab 2c: a lesson set built from the owner's own files ----
export const BUILDER = path.join(path.dirname(fileURLToPath(import.meta.url)), 'lab-build.js');
export const BUILD_MAX = 5000, BUILD_MIN = 20, BUILD_DEFAULT = 300;
const skillName = (s) => String(s || '').replace(/[\r\n]/g, ' ').trim().slice(0, 40);
// A skill name from a path: the folder's name (or the file's, without its ending), so C:\Notes\Woodworking gives Woodworking.
export const skillFromPath = (p) => { const b = String(p || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop().replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ').trim(); return skillName(b ? b[0].toUpperCase() + b.slice(1) : 'My files'); };
export function cleanBuild(b = {}) {
  const items = [].concat(b.items || []).filter((i) => i && typeof i.path === 'string' && i.path.trim()).slice(0, 200).map((i) => { const p = i.path.trim().replace(/^"|"$/g, ''); return { path: p, skill: skillName(i.skill) || skillFromPath(p) }; });
  const fb = b.feedback || {};
  return {
    name: String(b.name || '').replace(/[\r\n]/g, ' ').trim().slice(0, 60),
    teacher: String(b.teacher || '').slice(0, 120),
    items,
    kinds: [...new Set([].concat(b.kinds || []).filter((k) => KIND_IDS.includes(k)))],
    count: Math.max(BUILD_MIN, Math.min(BUILD_MAX, Math.round(Number(b.count) || BUILD_DEFAULT))),
    think: ['on', 'off', 'half'].includes(b.think) ? b.think : 'half',
    resay: b.resay !== false,
    feedback: { dropFiles: [].concat(fb.dropFiles || []).map(String).slice(0, 500), notKinds: Object.fromEntries(Object.entries(fb.notKinds || {}).slice(0, 500).map(([k, v]) => [String(k), [].concat(v).filter((x) => KIND_IDS.includes(x))])), badIdeas: [].concat(fb.badIdeas || []).map(String).slice(0, 500) }
  };
}

// The start brain's size, kept on the job so the estimate table can scale past step times to another brain (1.5.154).
const facts0 = (b) => { try { return inspect(b)?.sizeGB || 0; } catch { return 0; } };

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
    const brains = this.brains().map((b) => { let f = null; try { f = inspect(b); } catch (e) { return { ...b, gguf: undefined, mmproj: undefined, error: e.message }; } return { id: b.id, name: b.name, family: b.family, community: b.community, naughty: b.naughty, madeInLab: b.madeInLab, license: b.license, facts: f && { arch: f.arch, experts: f.experts, used: f.used, groups: f.groups, layers: f.layers, fileType: f.fileType, fullSize: f.fullSize, sizeGB: f.sizeGB, sight: f.sight, hearing: f.hearing, readerGB: f.readerGB }, cuts: f ? cutSizes(f).map((c) => ({ ...c, fit: fitWords(c.gb, cardGB) })) : [], fit: f ? fitWords(f.sizeGB, cardGB) : '' }; });
    return { on: labOn(this.cfg), mode: this.cfg.labPro === true ? 'pro' : 'simple', engine: this.engineView(), room, cardGB, sharedMemory: (this.platform?.() || { os: OS }).os === 'mac', brains, runs: this.runs.slice(-20).reverse().map((r) => this.runView(r)), recipes: readJson(this.recipesFile, []), made: madeBrains(this.cfg).map((m) => ({ id: m.id, name: m.name, sizeGB: m.sizeGB, from: m.fromName })), busy: Boolean(this.job), gaming: gaming(this.cfg), types: RUNNING_TYPES, lessonSkills: LESSON_SKILLS.map(({ id, label, hint }) => ({ id, label, hint })), lessonSets: lessonSets(this.cfg).map(({ file, ...x }) => x), secondsPerLesson: SECONDS_PER_LESSON, lessonKinds: KINDS, sampleCount: SAMPLE_COUNT, buildMax: BUILD_MAX, officeOk: Boolean(this.officeFor()), brainEngine: this.tools().brainEngine.found, packs: PACKS, myPacks: readMyPacks(labDir(this.cfg)).map(({ items, ...m }) => m), pro: { gen: { ...GEN_DEFAULT }, ctxChoices: CTX_CHOICES, maxRepeats: MAX_REPEATS, checks: MY_CHECKS, settings: GUARD_SETTINGS, styles: GUARD_STYLES }, scores: this.scores(), classes: CLASSES.map(([id, label, hint]) => ({ id, label, hint })), ladders: this.ladders(), playMaxGB: PLAY_MAX_GB, ladderSteps: LADDER.map(({ type, label }) => ({ type, label })), hardware: hardwareLine(this.cfg), version: this.version || '', mixWays: MIX_WAYS, layerChoices: LAYER_CHOICES.map(([id, label]) => ({ id, label })), kept: KEPT.map(({ id, label }) => ({ id, label })), homeMaxGB: PLAY_MAX_GB, cvector: this.tools().cvector.found || Boolean(this.stepFns.direction), benchHere: this.benchTool().found || Boolean(this.stepFns.bench), full: this.fullSize ? this.fullSize.view() : null, fullDir: fullSizeDirOf(this.cfg), peekLive: this.tools().brainEngine.found || Boolean(this.stepFns.peekServe), plainPrompts: PLAIN_PROMPTS, reluctantPrompts: RELUCTANT_PROMPTS };
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
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
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

  // ---- Lab 2c: build a lesson set from the owner's own files ----
  officeFor() { try { return findOffice(this.cfg); } catch { return null; } }
  buildDir(slug) { return path.join(lessonSetsDir(this.cfg), slug); }

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
      if (!this.tools().server.found) problems.push(`${path.basename(this.tools().server.path)} isn't in Bob's engine folder. Get models, Engines, Bob's own engine has it.`);
    }
    const skills = [...new Set(x.items.map((i) => i.skill))];
    if (skills.length > 12) problems.push(`That's ${skills.length} skills. Keep it to 12 or fewer, or the coverage cut has nothing to protect: give files that belong together the same skill name.`);
    notes.push('Your files are read in place and never copied. Only the passages that become lessons are kept, here, in the Lab folder.');
    const hours = Math.max(1, Math.round((x.count * SECONDS_PER_LESSON) / 3600));
    return { build: x, teacher: t, problems, notes, dir, slug, out: path.join(dir, 'lessons.jsonl'), hours, skills, sample: readJsonl(path.join(dir, 'sample.jsonl')).map(lessonCard) };
  }

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
  }

  // Start a build (sample = the 12 sample lessons of stage B; else the whole set). Its own Lab job, like the writer.
  async startBuild(b, { unload = false, sample = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.planBuild(b);
    if (p.problems.length) throw new Error(p.problems[0]);
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
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
  }

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
  }

  // The viewer: one built set's lessons as cards, with a search box and filters. Only sets built here (build.json).
  setLessons(id, { q = '', skill = '', file = '', kind = '', from = 0, limit = 50 } = {}) {
    const set = lessonSets(this.cfg).find((x) => x.id === slugOf(id));
    if (!set) throw new Error('That lesson set isn\'t here any more.');
    const all = readJsonl(set.file);
    const needle = String(q || '').toLowerCase();
    const hit = all.filter((l) => (!skill || l.job === skill) && (!file || l.source?.name === file) && (!kind || l.kind === kind) && (!needle || JSON.stringify(l.messages || []).toLowerCase().includes(needle)));
    const files = [...new Set(all.map((l) => l.source?.name).filter(Boolean))].sort();
    return { id: set.id, name: set.name, total: all.length, found: hit.length, from, files, skills: [...new Set(all.map((l) => l.job).filter(Boolean))], kinds: [...new Set(all.map((l) => l.kind).filter(Boolean))], cards: hit.slice(from, from + limit).map(lessonCard), sources: readJson(path.join(path.dirname(set.file), 'sources.json'), null) };
  }

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
  }

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
  }

  benchTool() { return findTool(this.cfg, 'bench'); }

  // 1.5.153 Challenges: run packs against one brain as a Lab job; the scoreboard keeps the newest score per pack.
  scores() { return scoreboard(readScores(scoresDir(this.cfg))); }

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
    const gen = cleanGen(c.gen || {}); // 1.5.168 Simple mode sends nothing, so the defaults
    if (!this.tools().server.found) throw new Error(`${path.basename(this.tools().server.path)} isn't in Bob's engine folder. Get models, Engines, Bob's own engine has it.`);
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const title = (id) => (PACKS.find((p) => p.id === id) || mine.find((m) => m.id === id)).title;
    // The standard speed test after the challenges, when ticked (off unless ticked) and the tool is here.
    const bench = c.bench === true;
    if (bench && !this.benchTool().found && !this.stepFns.bench) throw new Error('The standard speed test (llama-bench) isn\'t here. It comes with the built-in engine and with Brain Engine (Get models > Engines). Untick it, or get one of them again.');
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: 'challenge', name: `Challenges for ${brain.name}`, from: brain.id, fromName: brain.name, packs, gen, bench, state: 'running', at: this.now(), steps: [{ id: 'serve', label: `Start ${brain.name}`, state: 'waiting' }, ...packs.map((id) => ({ id, label: title(id), state: 'waiting' })), ...(bench ? [{ id: 'bench', label: 'The standard speed test (llama-bench)', state: 'waiting' }] : [])], progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.goChallenge(runRec, brain, packs, ac.signal, gen, mine).catch(() => {});
    return { started: this.runView(runRec) };
  }

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
      const sandbox = packs.some((id) => id === 'code' || NEEDS_SANDBOX.includes(id)) ? await fx.sandbox({ signal }) : null;
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
      if (ranked && Object.keys(boardPacks).length) writeJson(file, mergeScores(readJson(file, null), { name: brain.name, sha256, sizeGB: facts.sizeGB, quant: facts.fileType, paramsB: facts.paramsB, activeB: facts.experts ? facts.activeB : 0, experts: facts.experts, madeHere: Boolean(brain.madeInLab), packs: boardPacks, tps, prefillTps, when: new Date(this.now()).toISOString().slice(0, 10), engine: this.engineName(), where: srv.where, bench: bench?.ok ? bench : null }));
      const titleOf = (id) => (PACKS.find((p) => p.id === id) || mine.find((m) => m.id === id))?.title || id;
      r.report = { challenges: packs.map((id) => ({ id, title: titleOf(id), score: results[id].score, right: results[id].right, of: results[id].of, skipped: results[id].skipped || '', ...(results[id].parts ? { parts: results[id].parts } : {}), ...(results[id].groups ? { groups: results[id].groups } : {}), ...(results[id].spread ? { spread: results[id].spread } : {}), ...(results[id].note ? { note: results[id].note } : {}) })), tps, settings: genLine(gen), ranked, hasLog: fs.existsSync(logFile), ...(bench ? { bench: bench.ok ? { read: bench.read, write: bench.write, prompt: bench.prompt, gen: bench.gen, line: benchLine(bench) } : { error: bench.error } } : {}) };
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
  }

  // 1.5.156 Playground: the quantization ladder. Results (small) in <data>/lab/playground/<slug>/ladder.json; the
  // running files (big) in <Bob's models>/lab/playground/<slug>/, which Delete all removes.
  ladders() {
    return readLadders(playDir(labDir(this.cfg))).map((l) => ({ id: l.id, brain: l.brain, when: l.when, state: l.state, deleted: Boolean(l.deleted), diskGB: l.diskGB, rows: ladderTable(l.rungs || []), saw: ladderSaw(ladderTable(l.rungs || [])), asked: l.asked || null, notes: l.notes || [] }));
  }

  planLadder(from) {
    const brain = this.brains().find((b) => b.id === String(from || ''));
    const problems = [], notes = [];
    if (!brain) return { problems: ['Pick a brain for the ladder.'], notes };
    let f = null; try { f = inspect(brain); } catch (e) { problems.push(e.message); }
    if (f && !f.fullSize) problems.push(`${brain.name} is already a running file (${f.fileType}). The ladder starts from the full-size copy (F16 or BF16).`);
    if (f && f.sizeGB > PLAY_MAX_GB) problems.push(`${brain.name} is ${f.sizeGB} GB. The ladder is for small brains, up to ${PLAY_MAX_GB} GB full size, so it fits in an evening and on the disk.`);
    const t = this.tools();
    for (const k of ['quantize', 'imatrix', 'server']) if (!t[k].found) problems.push(`${path.basename(t[k].path)} isn't in the built-in engine's folder. Get models > Engines: the built-in engine has it; download the engine again if it's missing.`);
    if (!t.perplexity.found) notes.push(`${path.basename(t.perplexity.path)} isn't in the built-in engine's folder, so the ladder skips the surprise score and uses the Lab test alone.`);
    const diskGB = f ? ladderDiskGB(f.sizeGB) : 0;
    const out = path.join(labModelsDir(this.cfg), 'playground', slugOf(brain.name));
    let freeGB = null;
    try { fs.mkdirSync(path.dirname(out), { recursive: true }); const st = fs.statfsSync(path.dirname(out)); freeGB = Math.round((st.bavail * st.bsize) / 1e9); } catch {}
    if (freeGB !== null && freeGB < diskGB + 5) problems.push(`The ladder needs about ${diskGB} GB of disk and there's ${freeGB} GB free. Free some space first.`);
    return { brain, facts: f, problems, notes, diskGB, out, slug: slugOf(brain.name) };
  }

  async startLadder(c = {}, { unload = false } = {}) {
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    const room = this.room();
    if (!room.ok) throw new Error(room.why);
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const p = this.planLadder(c.from);
    if (p.problems.length) throw new Error(p.problems[0]);
    this.freePeek(); // 1.5.164 Peek inside's engine goes first
    if (this.brain?.engine?.loaded) {
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    const runRec = { id: `lab-${this.now().toString(36)}`, kind: 'ladder', name: `Ladder for ${p.brain.name}`, slug: p.slug, from: p.brain.id, fromName: p.brain.name, state: 'running', at: this.now(), steps: [{ id: 'measure', label: 'Measure which weights matter most', state: 'waiting' }, ...LADDER.map((x) => ({ id: x.type, label: `Make and test ${x.label}`, state: 'waiting' }))], progress: 0 };
    this.runs.push(runRec); this.save();
    const ac = new AbortController();
    this.job = { run: runRec, ac };
    this.goLadder(runRec, p, ac.signal).catch(() => {});
    return { started: this.runView(runRec) };
  }

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
      for (let i = 0; i < LADDER.length; i++) {
        const x = LADDER[i];
        set(i + 1, 'running');
        const out = path.join(p.out, `${p.slug}-${x.type}.gguf`);
        await fx.quantize({ src: p.brain.gguf, out, type: x.type, imatrix }, { signal });
        let ppl = null;
        if (this.tools().perplexity.found || this.stepFns.perplexity) ppl = await fx.perplexity({ gguf: out, text: score }, { signal }).catch((e) => { if (signal.aborted) throw e; log(`perplexity: ${e.message}`); return null; });
        const t = await fx.test({ gguf: out }, { signal, onProgress: (d) => { r.progress = Math.round((100 * (i + 1 + d)) / (LADDER.length + 1)); } });
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
  }

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
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
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
  }

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
  }

  // 1.5.159 The Forge tab. Keep files the Lab made (cuts, usage map, recipes), named for the page, paths kept here.
  keepFiles() {
    const out = [];
    const walk = (dir, depth) => { let ents = []; try { ents = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; } for (const e of ents) { const f = path.join(dir, e.name); if (e.isDirectory() && depth > 0) walk(f, depth - 1); else if (e.isFile() && e.name.endsWith('-keep.json')) { const j = readJson(f, null); if (Array.isArray(j?.layers) && j.layers.length) out.push({ id: crypto.createHash('sha1').update(f).digest('hex').slice(0, 12), name: j.name || e.name.replace(/-keep\.json$/, ''), experts: Number(j.experts) || j.layers[0].length, layers: j.layers.length, path: f }); } } };
    walk(labModelsDir(this.cfg), 2); walk(path.join(labDir(this.cfg), 'usage'), 2);
    return out;
  }

  forgeView() {
    const dir = forgeDir(this.cfg);
    let saved = []; try { saved = fs.readdirSync(forgePlansDir(labDir(this.cfg))).filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, '')); } catch {}
    const live = this.forgeLive();
    return { live, allowed: this.cfg.labForgeStart === true, hasKey: Boolean(this.forgeKeys()[FORGE_KEY]), methods: METHODS, leftOut: LEFT_OUT, found: Boolean(dir), runs: forgeRuns(dir), brains: forgeBrains(dir), plans: forgePlans(dir), saved, keepFiles: this.keepFiles().map(({ path: _p, ...k }) => k), lessonSets: lessonSets(this.cfg).map((x) => ({ id: x.id, name: x.name, count: x.count, added: x.added === true, license: x.license || '', source: x.source || '', parts: partsView(path.dirname(x.file)) })), skills: (() => { const b = forgePlans(dir)[0]; return b ? Object.keys(readJson(path.join(dir, 'forge', 'plans', `${b.id}.json`), {}).skills || {}) : []; })() };
  }

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
    return makeForgePlan(form, { base: base || {}, keepFiles: this.keepFiles(), lessonSets: sets });
  }

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
  }

  saveForgePlan(form = {}) {
    const r = this.forgePlan(form);
    if (r.problems.length) throw new Error(r.problems[0]);
    const dir = forgePlansDir(labDir(this.cfg)); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `${slugOf(r.plan.run)}.json`);
    writeJson(file, r.plan);
    return { file: path.basename(file) };
  }

  // ---- 1.5.160+ slice C: a Forge run started from the Lab ----
  // 1.5.163 a brain or lesson set on Hugging Face: read its card (licence, size, files) before it goes in a plan
  async forgeHf(ref, kind) { const r = parseHfRef(ref, kind === 'dataset' ? 'dataset' : 'model'); return hfLookup(r || String(ref || ''), { fetchFn: this.hfFetch || fetch }); }
  forgeKeys() { const e = this.rentEnv ? this.rentEnv() : rentKeyEnv(); return e?.[FORGE_KEY] ? { [FORGE_KEY]: e[FORGE_KEY] } : {}; }
  forgeLiveFile() { return path.join(labDir(this.cfg), 'forge-live.json'); }
  forgeLive() {
    const rec = readJson(this.forgeLiveFile(), null);
    if (!rec) return null;
    const running = rec.pid > 0 && (this.forgeAlive || alive)(rec.pid);
    let tail = []; try { tail = fs.readFileSync(rec.log, 'utf8').split(/\r?\n/).filter(Boolean).slice(-12).map(scrubForge); } catch {}
    return { plan: rec.plan, at: rec.at, running, hours: rec.hours, dollars: rec.dollars, tail, importing: Boolean(rec.importing && running), failed: rec.failed || '' };
  }
  // 1.5.168 Keep it simple / Professional: one switch for the whole Lab, saved in settings, read by every tab as view.mode.
  setLabMode(mode) { const pro = mode === 'pro'; saveSettings(this.cfg, { labPro: pro }); this.cfg.labPro = pro; return { mode: pro ? 'pro' : 'simple' }; }
  allowForge(on) { saveSettings(this.cfg, { labForgeStart: on === true }); this.cfg.labForgeStart = on === true; return { allowed: this.cfg.labForgeStart }; }
  forgeCard(id) { // what the purchase card shows: read from the saved plan, nothing else
    const plan = readJson(path.join(forgePlansDir(labDir(this.cfg)), `${slugOf(id)}.json`), null);
    if (!plan) throw new Error('That plan isn\'t saved.');
    const dir = forgeDir(this.cfg);
    const problems = forgeStartProblems({ plan, allowed: this.cfg.labForgeStart === true, hasKey: Boolean(this.forgeKeys()[FORGE_KEY]), shown: { hours: plan.hours_max, dollars: plan.dollars_max }, running: Boolean(this.forgeLive()?.running), found: Boolean(dir), importer: Boolean(dir) && fs.existsSync(path.join(dir, 'import-lessons.mjs')), drive: dir ? onDrive(dir) : [], senses: forgeDoesSenses(dir) });
    return { id: slugOf(id), brains: (plan.rungs || []).map((r) => ({ name: r.name, nickname: r.nickname || '', keep: r.keep, hours: r.hours })), quants: plan.quants || '', cards: plan.gpus || [], hours: plan.hours_max, dollars: plan.dollars_max, volume: plan.volume ? plan.volume.gb || 100 : 0, problems };
  }
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
  }
  // Stop: end the Forge on this replicant matrix, then delete only this run's card (never every Forge card).
  async forgeStop() {
    const rec = readJson(this.forgeLiveFile(), null);
    if (!rec) throw new Error('No Forge run was started from the Lab.');
    if (rec.pid > 0) { try { process.kill(rec.pid); } catch {} } // never 0: that would mean every process in the group
    if (rec.importing) { writeJson(this.forgeLiveFile(), { ...rec, importing: false, stopped: true, pid: 0 }); return { stopped: true, pod: false }; } // nothing rented yet
    const dir = forgeDir(this.cfg), plan = readJson(path.join(forgePlansDir(labDir(this.cfg)), `${rec.plan}.json`), {}), pod = dir ? runPodId(dir, plan.run || rec.plan) : '';
    if (pod) {
      const { file: node, env: nodeEnv } = nodeCmd();
      await new Promise((resolve) => { const c = (this.forgeSpawn || spawn)(node, [path.join(dir, 'forge', 'forge.mjs'), '--kill', pod], { cwd: path.join(dir, 'forge'), stdio: 'ignore', windowsHide: true, env: { ...process.env, ...nodeEnv, ...this.forgeKeys() } }); c.on?.('exit', resolve); c.on?.('error', resolve); if (!c.on) resolve(); });
    }
    return { stopped: true, pod: Boolean(pod) };
  }

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
  }

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
        r.steps[i].state = 'done'; r.steps[i].ms = Date.now() - t0; r.progress = 100; this.tell(r);
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
          return { ...(await runQuiz(srv.url, { signal, onStep: (d, t) => onProgress(d / t) })), where: srv.where, engine };
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
      const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
    }
    return null;
  }

  homeBrain(id, what) {
    const b = this.brains().find((x) => x.id === String(id || ''));
    if (!b) return { problem: `Pick ${what}.` };
    let f = null; try { f = inspect(b); } catch (e) { return { brain: b, problem: `Couldn't read ${b.name}'s file: ${e.message}` }; }
    if (!f.fullSize) return { brain: b, facts: f, problem: `${b.name} is a running file (${f.fileType}). This starts from the full-size copy (F16 or BF16).` };
    if (f.sizeGB > PLAY_MAX_GB) return { brain: b, facts: f, problem: `${b.name} is ${f.sizeGB} GB full size. Here it's for brains up to ${PLAY_MAX_GB} GB; bigger ones go the same way on a rented card.` };
    return { brain: b, facts: f, problem: '' };
  }

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
    if (!tools.server.found && !this.stepFns.test) problems.push('The built-in engine (llama-server) isn\'t here, so the new brain can\'t be tested. Get it in Get models, Engines.');
    let freeGB = null;
    try { fs.mkdirSync(path.dirname(dir), { recursive: true }); const st = fs.statfsSync(path.dirname(dir)); freeGB = Math.round((st.bavail * st.bsize) / 1e9); } catch {}
    const diskGB = Math.round((bytes / 1e9) * 10) / 10;
    if (freeGB !== null && bytes && freeGB < diskGB + 2) problems.push(`The new brain takes about ${diskGB} GB of disk and there's ${freeGB} GB free. Free some space first.`);
    return { kind, name, slug, dir, out, a, b, parent, problems: [...new Set(problems)], notes, diskGB, refusals, mix, stack };
  }

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
  }

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
  }

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
  }

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
        const extra = ['--control-vector-scaled', path.join(dir, 'direction.gguf'), String(-p.refusals.strength / 100), '--control-vector-layer-range', String(Math.min(...blocks) + 1), String(Math.max(...blocks) + 1)];
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
  }

  // ---- 1.5.164 Peek inside (Playground) ----
  peek(brainId) {
    const brain = this.brains().find((b) => b.id === String(brainId || ''));
    if (!brain) throw new Error('Pick a brain to peek inside.');
    let facts = null; try { facts = inspect(brain); } catch {}
    return peekView(this.cfg, brain, facts, { engineFound: this.tools().brainEngine.found || Boolean(this.stepFns.peekServe), traceOk: this.peekTraceOk ?? null });
  }

  // Brain Engine stays loaded between questions; any other job, or a while idle, unloads it.
  freePeek() { if (this.peekSrv) { try { this.peekSrv.srv.stop(); } catch {} clearTimeout(this.peekSrv.timer); this.peekSrv = null; } return { stopped: true }; }

  async peekAsk({ brain: id, question, mask = null, maskCounts = null, tally = false } = {}, { unload = false } = {}) {
    const q = String(question || '').replace(/\s+/g, ' ').trim().slice(0, 500);
    if (!q) throw new Error('Type a question to ask.');
    const brain = this.brains().find((b) => b.id === String(id || ''));
    if (!brain) throw new Error('Pick a brain to peek inside.');
    const facts = inspect(brain);
    if (!facts?.experts) throw new Error(`${brain.name} isn't a mixture-of-experts brain, so there's nothing to peek at.`);
    if (Array.isArray(maskCounts) && maskCounts.length) mask = keepFromLit(maskCounts, facts); // Keep only these: the lit-up set, padded to one size
    const tools = this.tools();
    if (!tools.brainEngine.found && !this.stepFns.peekServe) throw new Error(NO_ENGINE);
    if (this.peekTraceOk === false) throw new Error(NO_TRACE);
    if (!labOn(this.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
    if (this.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
    if (gaming(this.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    if (!this.peekSrv || this.peekSrv.gguf !== brain.gguf) {
      this.freePeek();
      if (this.brain?.engine?.loaded) {
        const loaded = (await this.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
        if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
        if (loaded.length) await this.brain.engine.unloadAll().catch(() => {});
      }
    }
    const ac = new AbortController();
    const r = { id: `peek-${this.now().toString(36)}`, kind: 'peek', name: `Peek inside ${brain.name}`, state: 'running', steps: [] };
    this.job = { run: r, ac };
    try {
      const serve = this.stepFns.peekServe || (({ gguf, signal }) => startServer({ exe: tools.brainEngine.path, gguf, ctx: 4096, signal, log: () => {} }));
      if (!this.peekSrv) { const srv = await serve({ gguf: brain.gguf, signal: ac.signal }); this.peekSrv = { gguf: brain.gguf, srv, timer: null, sha: '' }; }
      const s = this.peekSrv;
      clearTimeout(s.timer);
      const url = s.srv.url;
      const post = async (body) => { const res = await fetch(url + '/expert-mask', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(30000) }); if (!res.ok) throw new Error(`Brain Engine wouldn't switch the experts: ${(await res.text()).slice(0, 200)}`); };
      let masked = false;
      if (Array.isArray(mask) && mask.length) { const why = checkKeep(readGguf(brain.gguf), mask); if (why) throw new Error(why); await post({ keep: maskFor(mask, facts) }); masked = true; }
      let got;
      try { got = await (this.stepFns.peekAsk || askTraced)(url, q, { signal: ac.signal }); }
      finally { if (masked) await post({ keep: null }).catch(() => {}); }
      this.peekTraceOk = true;
      const t = tallyTrace(got.trace, got.tokens, { experts: facts.experts, layers: facts.layers });
      let tallied = null;
      if (tally) {
        if (!s.sha) s.sha = await (this.stepFns.fingerprint || sha256File)(brain.gguf, ac.signal);
        tallied = addToTally(this.cfg, brain, { sha256: s.sha, facts, counts: t.counts, tokens: t.words.length, when: new Date(this.now()).toISOString().slice(0, 10) });
      }
      return { answer: got.answer, words: t.words, lit: t.lit, counts: t.counts, used: t.used, share: t.share, tps: got.tps || 0, where: s.srv.where || '', masked, tallied: tallied && { tokens: tallied.tokens, keepFile: path.basename(tallied.keepFile) } };
    } catch (e) {
      if (e.message === NO_TRACE) { this.peekTraceOk = false; this.freePeek(); }
      throw e;
    } finally {
      this.job = null;
      if (this.peekSrv) this.peekSrv.timer = setTimeout(() => this.freePeek(), IDLE_MS).unref?.();
    }
  }

  // A keep file for Cut these out: the tally's (default), or one from a lit-up set the page sends.
  peekKeep({ brain: id, counts = null } = {}) {
    const brain = this.brains().find((b) => b.id === String(id || ''));
    if (!brain) throw new Error('Pick a brain first.');
    const facts = inspect(brain);
    if (Array.isArray(counts) && counts.length) {
      const layers = keepFromLit(counts, facts);
      const file = path.join(usageFolder(this.cfg, brain), `${slugOf(brain.name)}-lit-keep.json`);
      writeJson(file, { name: `${brain.name} (lit experts)`, experts: layers.find(Boolean)?.length || 0, layers, source: 'peek', brain: { name: brain.name } });
      return { file, experts: layers.find(Boolean)?.length || 0 };
    }
    const file = keepFileOf(this.cfg, brain);
    if (!fs.existsSync(file)) throw new Error('There\'s no tally for this brain yet. Tick Keep count and ask it a few things first, or run the usage map.');
    const j = readJson(file, {});
    return { file, experts: Number(j.experts) || 0 };
  }

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

// 1.5.164 One sandbox turn on Bob's loaded brain, with the person's own system prompt. Ordinary settings, not temperature 0:
// the point is to see what the brain does in use.
export async function guardChat(brain, b = {}, { fetch: f = globalThis.fetch } = {}) {
  const g = learnBrain(brain);
  if (!g.ready) return { ok: false, why: g.why || 'No brain is ready.' };
  const x = cleanSandbox(b);
  if (!x.messages.length || x.messages[x.messages.length - 1].role !== 'user') return { ok: false, why: 'Type something to the brain first.' };
  const r = await f(g.url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [...(x.system ? [{ role: 'system', content: x.system }] : []), ...x.messages], max_tokens: 600, chat_template_kwargs: { enable_thinking: false } }), signal: AbortSignal.timeout(180e3) });
  if (!r.ok) return { ok: false, why: `My engine said ${r.status}.` };
  const j = await r.json();
  const text = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { ok: true, text, turns: x.messages.filter((m) => m.role === 'user').length };
}

// /api/lab: the page's calls. Starting, stopping and Use in Bob only from this replicant matrix itself (403 from the
// door); another device, the phone included, only sees the plan, without the commands or any file paths.
export async function labRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!p.startsWith('/api/lab')) return false;
  try {
    if (await recipesRoute({ req, res, p, isLocal, lab, body, send })) return true; // 1.5.154
    if (await sensesRoute({ req, res, p, isLocal, lab, body, send })) return true; // Give it eyes / Give it ears
    if (await pagesRoute({ req, res, p, isLocal, lab, body, send })) return true;
    if (await fullSizeRoute({ req, res, p, isLocal, lab, body, send })) return true;
    if (await diffusionRoute({ req, res, p, isLocal, lab, body, send })) return true; // Playground: Diffusion brains // Bring in a full-size brain // 1.5.16x Playground: Longer, Faster, Teach it
    if (req.method === 'GET' && p === '/api/lab') { send(res, 200, lab.view()); return true; }
    if (req.method === 'GET' && p === '/api/lab/measures') { send(res, 200, { measures: lab.measures().map(({ rec, ...m }) => m) }); return true; }
    // 1.5.151 Learn: experiments on the brain Bob has loaded. Read-only, nothing is written, so any device Bob lets in may use them.
    if (req.method === 'GET' && p === '/api/lab/learn') { const b = learnBrain(lab.brain); send(res, 200, { on: labOn(lab.cfg), ready: b.ready, why: b.why || '', wake: b.wake === true, busy: b.busy === true, brain: b.ready ? (lab.brain?.brainLabel?.(b.model) || b.model) : '', ctx: b.ctx || 0, cards: LEARN_CARDS }); return true; }
    if (req.method === 'GET' && p === '/api/lab/forge') { const v = lab.forgeView(); send(res, 200, isLocal ? v : { ...v, keepFiles: [] }); return true; } // 1.5.159 read-only
    // 1.5.164 Guard rails sandbox: chat with the brain Bob has loaded, like Learn. Nothing is saved unless you press Save as lesson.
    if (req.method === 'GET' && p === '/api/lab/guard') { const g = learnBrain(lab.brain); send(res, 200, { on: labOn(lab.cfg), ready: g.ready, why: g.why || '', brain: g.ready ? (lab.brain?.brainLabel?.(g.model) || g.model) : '', demo: PAGE_DEMO, maxTurns: SANDBOX_MAX_TURNS, canSave: isLocal, settings: GUARD_SETTINGS, styles: GUARD_STYLES }); return true; }
    if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
    const b = await body(req);
    if (p === '/api/lab/guard/chat') { if (!labOn(lab.cfg)) { send(res, 403, { error: 'The Lab is off.' }); return true; } send(res, 200, await guardChat(lab.brain, b)); return true; }
    if (p === '/api/lab/compare' && !b.save) { send(res, 200, lab.compare(b.ids)); return true; }
    if (p.startsWith('/api/lab/learn/')) { if (!labOn(lab.cfg)) { send(res, 403, { error: 'The Lab is off.' }); return true; } send(res, 200, await runLearn(lab.brain, p.slice('/api/lab/learn/'.length), b)); return true; }
    if (p === '/api/lab/peek') { const v = lab.peek(b.brain); send(res, 200, isLocal ? v : { ...v, keepFile: '' }); return true; } // 1.5.164 read-only
    if (!isLocal && !['/api/lab/plan', '/api/lab/write/plan', '/api/lab/home/plan'].includes(p)) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
    if (p === '/api/lab/engine') { send(res, 200, lab.setLabEngine(String(b.engine ?? ''))); return true; } // 1.5.17x the Lab's engine, from its next job
    if (p === '/api/lab/plan') { const pl = lab.plan(b.recipe); send(res, 200, { problems: pl.problems, notes: pl.notes, skills: pl.skills || [], steps: pl.steps.map((s) => ({ id: s.id, label: s.label })), text: isLocal ? pl.text : '' }); return true; }
    if (p === '/api/lab/write/plan') { const pl = lab.planWrite(b.write); send(res, 200, { problems: pl.problems, notes: pl.notes, hours: pl.hours, file: isLocal ? pl.out : '' }); return true; }
    if (p === '/api/lab/write') { send(res, 200, await lab.startWrite(b.write, { unload: b.unload === true })); return true; }
    // Lab 2c: the lesson builder (file paths, so this replicant matrix only).
    if (p === '/api/lab/build/plan') { const pl = lab.planBuild(b.build); send(res, 200, { problems: pl.problems, notes: pl.notes, hours: pl.hours, skills: pl.skills, sample: pl.sample, file: pl.out }); return true; }
    if (p === '/api/lab/build/survey') { send(res, 200, await lab.surveyBuild(b.build)); return true; }
    if (p === '/api/lab/build/sample') { send(res, 200, await lab.startBuild(b.build, { unload: b.unload === true, sample: true })); return true; }
    if (p === '/api/lab/build') { send(res, 200, await lab.startBuild(b.build, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/set') { send(res, 200, lab.setLessons(String(b.id || ''), b)); return true; }
    if (p === '/api/lab/set/remove') { send(res, 200, lab.removeLessons(String(b.id || ''), b)); return true; }
    if (p === '/api/lab/set/export') { send(res, 200, lab.exportSet(String(b.id || ''), { folder: String(b.folder || ''), check: b.check === true })); return true; }
    if (p === '/api/lab/start') { send(res, 200, await lab.start(b.recipe, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/stop') { send(res, 200, lab.stop()); return true; }
    if (p === '/api/lab/use') { send(res, 200, lab.use(String(b.run || ''))); return true; }
    if (p === '/api/lab/compare') { const c = lab.compare(b.ids, b.save === 'csv' ? 'csv' : 'json'); send(res, 200, { table: c.table, file: path.basename(c.file) }); return true; }
    if (p === '/api/lab/guard/save') { send(res, 200, saveGuardLesson(path.join(lessonSetsDir(lab.cfg), 'guard-rails-practice'), guardLesson(b))); return true; } // 1.5.164 into the person's own lesson set
    // 1.5.168 Professional mode: your own packs, and the question-by-question log of a run.
    if (p === '/api/lab/mypack/import') { send(res, 200, importMyPack(labDir(lab.cfg), String(b.text || ''))); return true; }
    if (p === '/api/lab/mypack/delete') { send(res, 200, deleteMyPack(labDir(lab.cfg), b.id)); return true; }
    if (p === '/api/lab/challenge/log') { send(res, 200, lab.challengeLog(String(b.id || ''), { save: b.save === 'csv' || b.save === 'jsonl' ? b.save : '' })); return true; }
    if (p === '/api/lab/challenge') { send(res, 200, await lab.startChallenge(b.challenge, { unload: b.unload === true })); return true; } // 1.5.153
    if (p === '/api/lab/ladder/plan') { const pl = lab.planLadder(b.from); send(res, 200, { problems: pl.problems, notes: pl.notes, diskGB: pl.diskGB }); return true; } // 1.5.156
    if (p === '/api/lab/ladder') { send(res, 200, await lab.startLadder({ from: b.from }, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/ladder/ask') { send(res, 200, await lab.startLadderAsk({ id: b.id, question: b.question }, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/ladder/delete') { send(res, 200, lab.deleteLadder(String(b.id || ''))); return true; }
    if (p === '/api/lab/forge/plan') { const r = lab.forgePlan(b.form); send(res, 200, { problems: r.problems, notes: r.notes, hours: r.hours, text: JSON.stringify(r.plan, null, 1) }); return true; } // 1.5.159
    if (p === '/api/lab/forge/hf') { send(res, 200, await lab.forgeHf(String(b.ref || '').slice(0, 400), b.kind)); return true; } // 1.5.163
    if (p === '/api/lab/mode') { send(res, 200, lab.setLabMode(String(b.mode || ''))); return true; } // 1.5.168
    if (p === '/api/lab/forge/allow') { send(res, 200, lab.allowForge(b.on === true)); return true; }
    if (p === '/api/lab/forge/card') { send(res, 200, lab.forgeCard(String(b.id || ''))); return true; }
    if (p === '/api/lab/forge/start') { send(res, 200, lab.forgeStart({ id: String(b.id || ''), hours: b.hours, dollars: b.dollars })); return true; }
    if (p === '/api/lab/forge/stop') { send(res, 200, await lab.forgeStop()); return true; }
    if (p === '/api/lab/forge/save') { send(res, 200, lab.saveForgePlan(b.form)); return true; }
    if (p === '/api/lab/library/add') { send(res, 200, await lab.addLibrarySet({ from: String(b.from || ''), name: String(b.name || '').slice(0, 60) })); return true; } // the lesson library
    if (p === '/api/lab/home/plan') { const pl = lab.planHome(String(b.kind || ''), b.form); send(res, 200, { problems: pl.problems, notes: pl.notes, diskGB: pl.diskGB, layers: pl.stack?.layers || 0 }); return true; } // 1.5.164
    if (p === '/api/lab/home/start') { send(res, 200, await lab.startHome(String(b.kind || ''), b.form, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/refusals/try') { send(res, 200, await lab.tryRefusals(b.form, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/peek/ask') { send(res, 200, await lab.peekAsk(b, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/peek/stop') { send(res, 200, lab.freePeek()); return true; }
    if (p === '/api/lab/peek/keep') { send(res, 200, lab.peekKeep(b)); return true; }
    if (p === '/api/lab/save') { const out = lab.saveResult(b, { version: lab.version || '' }); send(res, 200, { file: out.file }); return true; }
    if (p === '/api/lab/recipe') { send(res, 200, { recipes: lab.saveRecipe(b.recipe) }); return true; }
    send(res, 404, { error: 'no' }); return true;
  } catch (e) { send(res, 400, { error: e.message }); return true; }
}
