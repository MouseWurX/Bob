// The never-taught gate (15 Nov 2026, docs/ROADMAP-ONE-MODEL.md "Held-out tests are never taught"). A review found 519 of the
// 534 held-out test questions word for word in training-side lesson files, while data.py only holds out a 5% id-hash split.
// So before a training or heal plan sends any lesson to a pod, every user turn of every lesson it would send is checked
// against the never-taught list (the quiz items, the held-out and calib files in forge/never-taught.json, and the plan's own
// "never" list). One match and the plan stops before anything is rented or sent.
//
//   node never-gate.mjs --plan <plan.json>        prints the result, writes out/forge/never-gate-<run>.json, exit 1 on a match
//
// A match is: the same request (after lower-casing and squeezing spaces), a test question found inside a longer user turn,
// or a near copy of a lesson's first request (lesson-ledger.mjs's word-overlap check). Nothing here changes a lesson file.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import { neverTaught, fingerprint, normText } from './lesson-ledger.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const MIN_INSIDE = 6; // a test question of 6+ words found inside a longer user turn counts; shorter ones only as the whole turn

// Does this plan teach anything? Benchmarks, rebuilds, publishes and lesson-writing-only runs don't.
export function trains(plan) {
  if (!plan || plan.benchmark_only || plan.rebuild || plan.lessons_only) return false;
  return Boolean((plan.rungs || []).length || plan.train_teacher || plan.heal || plan.grpo || plan.pref);
}

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join(' ') : '');
const readText = (f) => fs.readFileSync(f, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');

// Rows of a never-taught file: jsonl (lessons or benchmark rows), a .json array (or an object holding one), or plain lines.
export function readNeverRows(file) {
  const text = readText(file);
  if (file.endsWith('.json')) {
    try {
      const j = JSON.parse(text);
      const arr = Array.isArray(j) ? j : Object.values(j).find(Array.isArray) || [];
      return arr.map((r) => (typeof r === 'string' ? { q: r } : r));
    } catch { return []; }
  }
  return text.split('\n').filter((l) => l.trim()).map((l) => { try { const r = JSON.parse(l); return typeof r === 'string' ? { q: r } : r; } catch { return { q: l }; } });
}
const NEVER_EXT = /\.(jsonl|json|txt)$/i;
function filesIn(p, recursive) {
  if (!fs.existsSync(p)) return null;
  if (fs.statSync(p).isFile()) return [p];
  const out = [];
  for (const e of fs.readdirSync(p, { withFileTypes: true })) {
    const f = path.join(p, e.name);
    if (e.isDirectory()) { if (recursive) out.push(...(filesIn(f, true) || [])); } else if (NEVER_EXT.test(e.name)) out.push(f);
  }
  return out;
}

// The never-taught files for a plan: forge/never-taught.json (paths under out/) plus plan.never (paths under model-lab/, or
// absolute). Every listed path must exist; a missing one is a stop, not a skip, so a moved test file can't quietly let leaks by.
export function neverFilesFor(plan, { modelLab = here, outDir = path.join(here, 'out'), defaults = path.join(here, 'forge', 'never-taught.json') } = {}) {
  const list = [];
  if (defaults && fs.existsSync(defaults)) for (const e of JSON.parse(readText(defaults)).files || []) list.push({ at: path.resolve(outDir, e.path), recursive: e.recursive !== false, from: 'forge/never-taught.json' });
  for (const e of plan.never || []) { const p = typeof e === 'string' ? e : e.path; list.push({ at: path.resolve(modelLab, p), recursive: typeof e === 'string' || e.recursive !== false, from: 'plan.never' }); }
  const files = [], missing = [];
  for (const e of list) { const f = filesIn(e.at, e.recursive); if (f === null) missing.push(`${e.at} (${e.from})`); else files.push(...f); }
  return { files: [...new Set(files)], missing };
}

// The lesson files a plan sends to the pod.
export function lessonFilesFor(plan, { modelLab = here } = {}) {
  const files = [], unchecked = [];
  if (plan.lessons_set) unchecked.push(`lessons_set ${plan.lessons_set} (it lives on the rented drive, so this PC can't check it)`);
  else files.push(path.resolve(modelLab, plan.lessons || 'out/lessons', 'lessons.jsonl'));
  if (!plan.lessons_set) for (const d of plan.extra_lessons || []) { const dd = path.resolve(modelLab, d); files.push(d.endsWith('.jsonl') ? dd : path.join(dd, 'lessons.jsonl')); }
  if (plan.pref) for (const f of ['pairs.jsonl', 'kto.jsonl']) { const p = path.resolve(modelLab, plan.pref, f); if (fs.existsSync(p)) files.push(p); }
  return { files, unchecked };
}

const userTurns = (row) => {
  if (!row || typeof row !== 'object') return [];
  const turns = (row.messages || row.prompt_messages || []).filter((m) => m && m.role === 'user').map((m) => textOf(m.content));
  for (const k of ['prompt', 'q', 'request', 'question', 'instruction']) if (typeof row[k] === 'string') turns.push(row[k]);
  if (Array.isArray(row.prompt)) for (const m of row.prompt) if (m && m.role === 'user') turns.push(textOf(m.content));
  return turns.map((t) => normText(String(t).replace(/(^|\n)\s*Think:\s*\S+[^\n]*/g, ' '))).filter(Boolean);
};

// Every match in the given lesson files: { file, line, how, test, from }.
export function findLeaks(lessonFiles, never) {
  const tests = never.rows.map((r, i) => ({ i, r })), long = [];
  const exact = new Map();
  for (const { r } of tests) exact.set(r.key, r);
  // the normalised text isn't kept in a ledger row, so the "inside a longer turn" check keeps its own copy
  for (const r of never.textRows || []) if (r.words >= MIN_INSIDE) long.push(r);
  const leaks = [];
  for (const file of lessonFiles) {
    if (!fs.existsSync(file)) { leaks.push({ file, line: 0, how: 'missing', test: 'the lesson file is not there', from: '' }); continue; }
    const lines = readText(file).split('\n');
    lines.forEach((l, n) => {
      if (!l.trim()) return;
      let row; try { row = JSON.parse(l); } catch { return; }
      const turns = userTurns(row); if (!turns.length) return;
      for (const [k, t] of turns.entries()) {
        const fp = fingerprint({ q: t });
        const ex = exact.get(fp.key);
        if (ex) { leaks.push({ file, line: n + 1, how: 'same', test: t.slice(0, 160), from: ex.from }); return; }
        const inside = long.find((r) => t.length > r.text.length && (` ${t} `).includes(` ${r.text} `));
        if (inside) { leaks.push({ file, line: n + 1, how: 'inside', test: inside.text.slice(0, 160), from: inside.from }); return; }
        if (k === 0) { const near = never.find(fp); if (near && near.how === 'near') { leaks.push({ file, line: n + 1, how: `near (${near.sim.toFixed(2)})`, test: t.slice(0, 160), from: near.hit.from }); return; } }
      }
    });
  }
  return leaks;
}

export async function loadNever(files, opts = {}) {
  const never = await neverTaught([], opts); // quiz items
  never.textRows = [];
  for (const f of files) for (const r of readNeverRows(f)) for (const t of userTurns(r)) {
    const fp = fingerprint({ q: t }); if (!fp.words) continue;
    never.put({ ...fp, from: path.basename(f) }); never.textRows.push({ text: t, words: fp.words, from: path.basename(f) });
  }
  return never;
}

// The whole gate. ok:false with a reason means the plan must not rent or send anything.
export async function gate(plan, opts = {}) {
  if (!trains(plan)) return { ok: true, trains: false, reason: 'this plan teaches nothing, so there is nothing to check' };
  const nf = neverFilesFor(plan, opts);
  if (nf.missing.length) return { ok: false, trains: true, reason: `never-taught files are missing: ${nf.missing.join('; ')}`, missing: nf.missing };
  if (!nf.files.length) return { ok: false, trains: true, reason: 'no held-out or calib files to check against: list them in forge/never-taught.json or the plan\'s "never"' };
  const lf = lessonFilesFor(plan, opts);
  if (lf.unchecked.length) return { ok: false, trains: true, reason: `can't check ${lf.unchecked.join('; ')}: check that set on this PC and send it as extra_lessons instead` };
  const never = await loadNever(nf.files, opts);
  const leaks = findLeaks(lf.files, never);
  const missingLessons = leaks.filter((x) => x.how === 'missing');
  if (missingLessons.length) return { ok: false, trains: true, reason: `lesson files are missing: ${missingLessons.map((x) => x.file).join('; ')}`, leaks };
  return { ok: leaks.length === 0, trains: true, reason: leaks.length ? `${leaks.length} lesson(s) hold a never-taught test item` : 'no lesson holds a never-taught test item', checked: lf.files, against: nf.files, tests: never.rows.length, leaks };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const i = process.argv.indexOf('--plan'); const pf = i > 0 ? process.argv[i + 1] : null;
  if (!pf) { console.error('--plan <plan.json> is needed'); process.exit(1); }
  const plan = JSON.parse(readText(pf));
  const outDir = process.env.FORGE_OUT || path.join(here, 'out');
  const r = await gate(plan, { outDir });
  fs.mkdirSync(path.join(outDir, 'forge'), { recursive: true });
  fs.writeFileSync(path.join(outDir, 'forge', `never-gate-${String(plan.run || 'run').replace(/[^\w.-]/g, '_')}.json`), JSON.stringify({ when: new Date().toISOString(), ...r }, null, 1));
  console.log(`never-taught gate: ${r.ok ? 'PASS' : 'STOP'}: ${r.reason}`);
  for (const x of (r.leaks || []).slice(0, 20)) console.log(`  ${path.basename(x.file)}:${x.line} ${x.how} (${x.from}): ${x.test}`);
  process.exit(r.ok ? 0 : 1);
}
