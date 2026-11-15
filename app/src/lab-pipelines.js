// 14 Nov Lab pipelines (docs/LAB-STEPS-PLAN.md, slice 5). A pipeline is a saved list of steps with their settings,
// <lab>/pipelines/<slug>.json. Its progress is read back from the run records (each run notes its pipeline and its
// place in it), so a pipeline that stopped picks up at the first step not done, with nothing extra to keep in step.
// Rented steps in a row are packed into one block, so the card starts once; a block only becomes a Forge plan with the
// owner's press and typed caps, which start at $0. Pure file work: nothing here runs, rents or reads a key.
import fs from 'node:fs';
import path from 'node:path';
import { STEPS, stepById } from './lab-steps.js';
import { listRuns, dropSecrets } from './lab-runs.js';

export const PREV = '@prev'; // a form value meaning "what the step before made"
export const MAX_STEPS = 40;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = `${f}.tmp`; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };
export const pipelinesDir = (labRoot) => path.join(labRoot, 'pipelines');
export const slugOfName = (name) => String(name || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);

// Where a step's run goes: a rented card, or here. A heavy step that can run either way goes on a card, because heavy
// work never wears out this computer's card (it may be gaming).
export const runsOn = (s) => (s.where === 'rented' || (s.where === 'both' && s.heavy) ? 'rented' : 'here');

// A pipeline as the page sent it, made safe: a short name, known steps only, forms of plain strings and numbers with
// anything key-shaped left out. Returns { pipeline, problems }.
export function cleanPipeline(p = {}) {
  const problems = [], name = String(p.name || '').trim().slice(0, 60), slug = slugOfName(name);
  if (!slug) problems.push('Give the pipeline a name.');
  const raw = Array.isArray(p.steps) ? p.steps : [];
  if (!raw.length) problems.push('Pick at least one step.');
  if (raw.length > MAX_STEPS) problems.push(`A pipeline holds at most ${MAX_STEPS} steps.`);
  const steps = [];
  for (const x of raw.slice(0, MAX_STEPS)) {
    const s = stepById(String(x?.id || ''));
    if (!s) { problems.push(`There's no step called ${String(x?.id || '(blank)').slice(0, 40)}.`); continue; }
    const form = {};
    for (const [k, v] of Object.entries(x.form && typeof x.form === 'object' ? x.form : {})) if (/^[a-z][a-zA-Z0-9]{0,30}$/.test(k) && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')) form[k] = typeof v === 'string' ? v.slice(0, 200) : v;
    steps.push({ id: s.id, form: dropSecrets(form) });
  }
  const first = steps.findIndex((x) => x.form.set === PREV);
  if (first === 0) problems.push('The first step has no step before it to take from.');
  return { pipeline: { name, slug, steps, notes: String(p.notes || '').slice(0, 500) }, problems };
}

export function savePipeline(labRoot, p, now = Date.now()) {
  const { pipeline, problems } = cleanPipeline(p);
  if (problems.length) return { problems };
  const f = path.join(pipelinesDir(labRoot), `${pipeline.slug}.json`), old = readJson(f, null);
  writeJson(f, { ...pipeline, made: old?.made || new Date(now).toISOString(), changed: new Date(now).toISOString() });
  return { problems: [], slug: pipeline.slug };
}
export const readPipeline = (labRoot, slug) => readJson(path.join(pipelinesDir(labRoot), `${slugOfName(slug)}.json`), null);
export function listPipelines(labRoot) {
  let names = []; try { names = fs.readdirSync(pipelinesDir(labRoot)).filter((n) => n.endsWith('.json')); } catch {}
  return names.map((n) => readJson(path.join(pipelinesDir(labRoot), n), null)).filter((p) => p && Array.isArray(p.steps)).sort((a, b) => String(b.changed).localeCompare(String(a.changed)));
}

// Ready-made starts: the whole protocol (every built step, in order), or a past run's settings to change.
export function protocolPipeline(view = STEPS) {
  return { name: 'The whole protocol', steps: view.filter((s) => s.ready !== false && !s.planned).map((s) => ({ id: s.id, form: {} })) };
}
export const fromRun = (run) => ({ name: `${run.name} again`, steps: [{ id: run.step, form: { ...(run.settings || {}) } }] });

// Steps in a row that run on a card become one block (one rental); steps that run here are blocks of their own.
export function packBlocks(steps) {
  const blocks = [];
  steps.forEach((x, i) => {
    const s = stepById(x.id); if (!s) return;
    const on = runsOn(s), last = blocks[blocks.length - 1];
    if (on === 'rented' && last?.on === 'rented') last.steps.push(i); else blocks.push({ on, steps: [i] });
  });
  return blocks;
}
// A rented block as a Forge plan draft: the step keys, with caps at $0 and 0 hours for the owner to type.
export function blockDraft(p, block) {
  const ids = block.steps.map((i) => p.steps[i].id);
  return { run: `${p.slug}-${block.steps[0] + 1}`, steps: ids, plan_keys: [...new Set(ids.map((id) => stepById(id)?.plan).filter(Boolean))], hours_max: 0, dollars_max: 0, note: 'Caps start at 0. Nothing rents until you type them and press Start in the Forge.' };
}

// Progress, from the run records: each step's latest run in this pipeline. Next = the first step not done.
export function pipelineProgress(labRoot, p, runs = listRuns(labRoot, { limit: 2000 })) {
  const mine = runs.filter((r) => r.pipeline === p.slug && Number.isInteger(r.pipelineStep));
  const steps = p.steps.map((x, i) => {
    const r = mine.filter((m) => m.pipelineStep === i && m.step === x.id).sort((a, b) => String(b.started).localeCompare(String(a.started)))[0] || null;
    const s = stepById(x.id);
    const skipped = (p.skipped || []).includes(i) && r?.state !== 'done';
    return { i, id: x.id, name: s?.name || x.id, on: s ? runsOn(s) : 'here', state: skipped ? 'skipped' : r ? r.state : 'waiting', run: r?.id || '', outputs: r?.outputs || [], scores: r?.scores || {}, cost: r?.cost?.usd ?? null };
  });
  const next = steps.findIndex((x) => x.state !== 'done' && x.state !== 'skipped');
  const running = steps.some((x) => x.state === 'running' || x.state === 'smoke');
  const cost = Math.round(steps.reduce((t, x) => t + (Number(x.cost) || 0), 0) * 100) / 100;
  return { steps, next, running, done: next === -1, cost, state: next === -1 ? 'done' : running ? 'running' : steps.some((x) => x.state !== 'waiting' && x.state !== 'skipped') ? 'stopped part way' : 'not started' };
}

// One score chart per pipeline: a line per score, a point per step that has it.
export function pipelineScores(progress) {
  const keys = [...new Set(progress.steps.flatMap((x) => Object.keys(x.scores || {})))].sort();
  return keys.map((k) => ({ score: k, points: progress.steps.filter((x) => typeof x.scores?.[k] === 'number').map((x) => ({ i: x.i, name: x.name, v: x.scores[k] })) })).filter((l) => l.points.length);
}

// What the step before made, for a form value of PREV: its first output of the kind asked for.
export function prevOutput(progress, i, kind) {
  for (let j = i - 1; j >= 0; j--) { const o = (progress.steps[j].outputs || []).find((x) => x.kind === kind); if (o) return o; }
  return null;
}
