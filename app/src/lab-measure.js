// The Lab's basics: is it on, is there room, its folders, made brains, reading a brain's facts, cut sizes, and measuring
// and comparing brains. Split out of lab.js (which still exports all of it).
import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs';
import { ownModels, OWN_FAMILY } from './own-models.js';
import { readGguf, brainFacts, readerFacts } from './lab-gguf.js';
import { TEMPLATE_IDS, templateById } from '../public/lab-templates.js';
import { PARTS } from './lab-test.js';
import crypto from 'node:crypto';

// 1.5.172 the Lab shows unless it is switched off (it was off until switched on before). Anything but false is on.
export const labOn = (cfg) => cfg?.computerLab !== false;
export const WOBBLE_RUNS = 3, WOBBLE_TEMP = 0.7; // Show the wobble (Nov 11)
export const MIN_RAM_GB = 12;
// Too small to run the Lab (a Raspberry Pi, an 8 GB laptop): the Lab says so, and the switch carries the reason.
export function labRoom(totalBytes = os.totalmem()) {
  const gb = totalBytes / 1024 ** 3;
  return gb < MIN_RAM_GB ? { ok: false, why: `This replicant matrix has ${Math.round(gb)} GB of memory, and the Lab needs at least ${MIN_RAM_GB} GB. Start Lab jobs from another Bob on your Bob-Net instead.` } : { ok: true, why: '' };
}

// Running files the Lab can make, best first. Q3 only for brains meant for 8 GB or less (the Q4-or-better rule).
export const RUNNING_TYPES = ['Q4_K_M', 'Q5_K_M', 'Q6_K', 'Q8_0', 'Q3_K_M'];
export const exeName = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
export const isInsideDir = (f, root) => { const rel = path.relative(path.resolve(root), path.resolve(String(f || ''))); return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel); };
export const slugOf = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'lab-brain';
export const GB = 1024 ** 3;
export const round1 = (x) => Math.round(x * 10) / 10;
export const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };
export const readJsonl = (f) => { try { return fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; } };
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
export const cell = (v) => (v === null || v === undefined ? '' : String(v).replace(/[\r\n]+/g, ' ').slice(0, 200));
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

export const factsCache = new Map();
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
    ...(s.cut.fold === true ? { fold: true } : {}), // Fold instead of drop (expert merging, src/lab-fold.js)
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
export const FIELD_LABELS = { 'brain.sizeGB': 'Size (GB)', 'brain.expertsKept': 'Experts per layer', 'brain.quant': 'File type', 'brain.template': 'Template', 'brain.parent': 'Made from', 'where.place': 'Where', 'where.card': 'Card', 'where.engine': 'Engine', 'when': 'Tested on', 'speed.tps': 'Words a second', 'speed.prefillTps': 'Reading speed (words a second)' };
export const flat = (o, pre = '', out = {}) => { for (const [k, v] of Object.entries(o || {})) { const key = pre ? `${pre}.${k}` : k; if (v && typeof v === 'object' && !Array.isArray(v)) flat(v, key, out); else out[key] = v; } return out; };
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
