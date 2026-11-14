// Lab runs and the data index (14 Nov 2026, docs/LAB-STEPS-PLAN.md section 3). Every step run gets one record,
// <lab>/runs/<id>/run.json: the step, its settings, Bob's version, the inputs and outputs by content hash, the smoke
// test, its state, times, scores and cost. Every output also goes in <lab>/index.json with its kind, its parents and
// its tags, so a lesson set's versions and a brain's family tree can be read back. Outputs of steps that must never
// train (surgery, steering, sweeps, harm evals) are tagged neverTrain, get a NEVER-TRAIN file beside them, and every
// training step refuses them as input. Records never hold a key: settings pass through dropSecrets first.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { stepById, GATE_EXIT } from './lab-steps.js';

export const NEVER_TRAIN_FILE = 'NEVER-TRAIN';
export const RUN_STATES = ['smoke', 'running', 'done', 'failed', 'stopped', 'gated'];
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };

export const runsDir = (labRoot) => path.join(labRoot, 'runs');
export const indexFile = (labRoot) => path.join(labRoot, 'index.json');

// A file's or folder's content id (the NEVER-TRAIN tag file is left out, so tagging doesn't change it): sha256 over every file's relative path and bytes, in sorted order. Large brain
// files are hashed by size, first and last megabyte, so a 20 GB file doesn't take minutes (marked "quick").
const QUICK_OVER = 512 * 1024 * 1024, MB = 1024 * 1024;
export function contentId(p) {
  const h = crypto.createHash('sha256'); let quick = false;
  const add = (f, rel) => {
    const st = fs.statSync(f); h.update(`${rel}\0${st.size}\0`);
    if (st.size > QUICK_OVER) {
      quick = true; const fd = fs.openSync(f, 'r'); const b = Buffer.alloc(MB);
      try { fs.readSync(fd, b, 0, MB, 0); h.update(b); fs.readSync(fd, b, 0, MB, st.size - MB); h.update(b); } finally { fs.closeSync(fd); }
    } else h.update(fs.readFileSync(f));
  };
  const st = fs.statSync(p);
  if (st.isDirectory()) {
    const walk = (d, rel) => { for (const n of fs.readdirSync(d).sort()) { if (n === NEVER_TRAIN_FILE) continue; const f = path.join(d, n), r = rel ? `${rel}/${n}` : n; if (fs.statSync(f).isDirectory()) walk(f, r); else add(f, r); } };
    walk(p, '');
  } else add(p, path.basename(p));
  return `sha256:${h.digest('hex')}${quick ? ':quick' : ''}`;
}

// Settings go into the record with anything that looks like a key, token or passcode taken out, by name and by shape.
const SECRET_NAME = /(key|token|secret|pass(word|code)?|auth|cookie|credential)/i;
const SECRET_SHAPE = /^(hf_[A-Za-z0-9]{20,}|sk-[A-Za-z0-9_-]{16,}|rpa_[A-Za-z0-9]{16,}|bobsecret\d*:.+|[A-Za-z0-9_-]{40,})$/;
export function dropSecrets(v) {
  if (Array.isArray(v)) return v.map(dropSecrets);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).filter(([k]) => !SECRET_NAME.test(k)).map(([k, x]) => [k, dropSecrets(x)]));
  if (typeof v === 'string' && SECRET_SHAPE.test(v.trim())) return '(left out)';
  return v;
}

export function readIndex(labRoot) { const i = readJson(indexFile(labRoot), null); return i && Array.isArray(i.items) ? i : { items: [] }; }
export const findItem = (labRoot, id) => readIndex(labRoot).items.find((x) => x.id === id) || null;
// True when a path (or anything it came from) is tagged never-train: by its index entry, or a NEVER-TRAIN file in it
// or beside it. A copy made outside the Lab keeps the file, so the tag travels with it.
export function isNeverTrain(labRoot, p) {
  if (!p) return false;
  const dir = fs.existsSync(p) && fs.statSync(p).isDirectory() ? p : path.dirname(p);
  if (fs.existsSync(path.join(dir, NEVER_TRAIN_FILE))) return true;
  const items = readIndex(labRoot).items, byId = new Map(items.map((x) => [x.id, x]));
  const seen = new Set(); const up = (x) => { if (!x || seen.has(x.id)) return false; seen.add(x.id); return x.neverTrain || (x.parents || []).some((pid) => up(byId.get(pid))); };
  const abs = path.resolve(p);
  return items.some((x) => x.path && path.resolve(x.path) === abs && up(x));
}

// Checks before a step starts: every input is there, a training step gets no never-train input, and a rented step
// has a smoke test. Returns problems in words; an empty list means it may start.
export function checkStart(labRoot, stepId, inputs = []) {
  const s = stepById(stepId), problems = [];
  if (!s) return ['There\'s no step by that name.'];
  for (const i of inputs) if (!i.path || !fs.existsSync(i.path)) problems.push(`${i.kind || 'An input'} isn't there any more: ${i.path || '(none)'}.`);
  const trains = s.makes.includes('brain') || s.makes.includes('adapter');
  if (trains) for (const i of inputs) if (i.kind !== 'brain' && isNeverTrain(labRoot, i.path)) problems.push(`${path.basename(i.path)} is marked never-train (it came from surgery, steering or a sweep). It can be studied or published, never taught.`);
  return problems;
}

// Start a run's record. state starts at 'smoke' when the step has a smoke test to run first, else 'running'.
export function startRun(labRoot, { step, settings = {}, inputs = [], pipeline = '', bob = '', now = Date.now() }) {
  const s = stepById(step); if (!s) throw new Error('There\'s no step by that name.');
  const id = `run-${new Date(now).toISOString().replace(/[-:]/g, '').replace(/\..*/, '')}-${crypto.randomBytes(3).toString('hex')}`;
  const rec = {
    id, step, name: s.name, pipeline, bob, settings: dropSecrets(settings),
    inputs: inputs.map((i) => ({ kind: i.kind, path: i.path, id: fs.existsSync(i.path || '') ? contentId(i.path) : null })),
    outputs: [], smoke: s.smoke && s.smoke.how !== 'todo' ? { how: s.smoke.how, ok: null } : null,
    state: s.smoke && s.smoke.how !== 'todo' ? 'smoke' : 'running', started: new Date(now).toISOString(), ended: null, scores: {}, cost: null, message: ''
  };
  writeJson(path.join(runsDir(labRoot), id, 'run.json'), rec);
  return rec;
}
const runFile = (labRoot, id) => path.join(runsDir(labRoot), id, 'run.json');
export const readRun = (labRoot, id) => readJson(runFile(labRoot, id), null);
function update(labRoot, id, f) { const r = readRun(labRoot, id); if (!r) throw new Error('That run has no record.'); const n = f(r) || r; writeJson(runFile(labRoot, id), n); return n; }

// The smoke test's result. A failure (or the gate's exit 86) ends the run as 'gated': nothing else runs, and the
// caller stops the card by its id.
export function smokeDone(labRoot, id, { code, seconds = 0, now = Date.now() }) {
  return update(labRoot, id, (r) => {
    r.smoke = { ...(r.smoke || {}), ok: code === 0, seconds, code };
    if (code === 0) { r.state = 'running'; return r; }
    r.state = 'gated'; r.ended = new Date(now).toISOString();
    r.message = code === GATE_EXIT ? 'The smoke test said this step can\'t do its job here, so it stopped before the real run.' : `The smoke test failed (exit ${code}), so it stopped before the real run.`;
    return r;
  });
}

// The run's end: its outputs go into the index with the run's inputs as parents, tagged never-train when the step is.
export function finishRun(labRoot, id, { state = 'done', outputs = [], scores = {}, cost = null, message = '', now = Date.now() }) {
  const r0 = readRun(labRoot, id); if (!r0) throw new Error('That run has no record.');
  const s = stepById(r0.step);
  const outs = state === 'done' ? outputs.filter((o) => o.path && fs.existsSync(o.path)).map((o) => ({ kind: o.kind, path: o.path, id: contentId(o.path), neverTrain: Boolean(s?.neverTrain || o.neverTrain) })) : [];
  for (const o of outs) if (o.neverTrain) { const d = fs.statSync(o.path).isDirectory() ? o.path : path.dirname(o.path); fs.writeFileSync(path.join(d, NEVER_TRAIN_FILE), `Made by ${r0.name} (${r0.id}). Study or publish it; never teach it.\n`); }
  if (outs.length) {
    const idx = readIndex(labRoot); const parents = r0.inputs.map((i) => i.id).filter(Boolean);
    for (const o of outs) { idx.items = idx.items.filter((x) => !(x.id === o.id && x.path === o.path)); idx.items.push({ id: o.id, kind: o.kind, path: o.path, run: id, step: r0.step, parents, neverTrain: o.neverTrain, at: new Date(now).toISOString() }); }
    writeJson(indexFile(labRoot), idx);
  }
  return update(labRoot, id, (r) => ({ ...r, state, outputs: outs, scores, cost: cost ? dropSecrets(cost) : null, message, ended: new Date(now).toISOString() }));
}

// Every run, newest first (for the Runs page), and a family tree for one index item (its parents, then theirs).
export function listRuns(labRoot, { limit = 200 } = {}) {
  let ids = []; try { ids = fs.readdirSync(runsDir(labRoot)).filter((n) => n.startsWith('run-')); } catch {}
  return ids.map((n) => readRun(labRoot, n)).filter(Boolean).sort((a, b) => String(b.started).localeCompare(String(a.started))).slice(0, limit);
}
export function lineage(labRoot, itemId) {
  const items = readIndex(labRoot).items, out = [], seen = new Set();
  const walk = (id, depth) => { if (seen.has(id) || depth > 50) return; seen.add(id); const x = items.find((i) => i.id === id); if (!x) return; out.push({ ...x, depth }); for (const p of x.parents || []) walk(p, depth + 1); };
  walk(itemId, 0);
  return out;
}

// Runs a step's smoke test, then the step, with an injected spawn (tests pass a fake). Stops at the smoke test when
// it fails; onGated is where a rented step stops its card, by id only.
export async function runWithSmoke(labRoot, rec, { smoke, main, onGated = async () => {}, now = Date.now }) {
  if (rec.state === 'smoke') {
    const t0 = now(); const code = await smoke();
    const r = smokeDone(labRoot, rec.id, { code, seconds: Math.round((now() - t0) / 1000), now: now() });
    if (r.state === 'gated') { await onGated(r); return r; }
  }
  const res = await main();
  return finishRun(labRoot, rec.id, { ...res, state: res.code === 0 ? 'done' : 'failed', message: res.message || (res.code === 0 ? '' : `It stopped (exit ${res.code}).`), now: now() });
}
