// Lab items 101 to 112 (the "100 more ways" list, Nov 2026), server side. One route, /api/lab/plus, mounted by
// src/lab-pages.js. Everything here is a Lab job you start, a file you choose, or a switch that starts off.
// - 101 Blind taste test: two brains answer the same questions; you pick the better answer with no names shown, and
//   the picks make a ranking from your own taste (public/lab-plus-core.js tasteRanking).
// - 102 Save a chat question to the Lab: into your own challenge pack "My questions" (src/lab-mypacks.js format).
// - 103 Before and after Teach it: ten questions from the lesson set, answered by the brain before and after.
// - 104 Run again with one change: a finished job's settings, copied back into its form.
// - 107 Safety check: the Still refuses pack on a brain made with the refusal habit taken out.
// - 108 Share a recipe as a small file, with its scores; load one someone sent you.
// - 110 Lab jobs tell your phone: lab-done events carry phone: true when the switch is on.
// - 111 Check the judge first: a judging brain picks between your taste-test pairs; how often it agrees with you.
// - 112 Clean a lesson set: take out repeats and near-repeats (word triples, MinHash with banding, then checked).
// 105, 106 and the Still refuses pack are Challenges packs (src/lab-plus-packs.js). 109 is the page only.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { labDir, lessonSets, cleanRecipe, slugOf } from './lab.js';
import { startServer } from './lab-test.js';
import { readJson, writeJson, canStart, makeRoom, runJob, pageLog, chatOnce } from './lab-jobs.js';
import { saveSettings } from './config.js';
import { cleanMyPack, myPacksDir } from './lab-mypacks.js';
import { runExtraPack } from './lab-packs.js';
import { STILL_REFUSES } from './lab-plus-packs.js';
import { tasteRanking, JUDGE_MIN, judgeVerdict, judgeSaid, nextName, lessonWords, shingles, jaccard } from '../public/lab-plus-core.js';

// ---- The three switches, all off until turned on (Lab, My Lab tab) ----
export const EXTRAS = { hoverWords: false, tellPhone: false, saveQuestions: false };
export function cleanLabExtras(x) { return Object.fromEntries(Object.keys(EXTRAS).map((k) => [k, x?.[k] === true])); }
export const extrasOf = (cfg) => cleanLabExtras(cfg?.labExtras);
export function setExtra(lab, key, on) {
  if (!(key in EXTRAS)) throw new Error('There\'s no Lab switch called that.');
  const next = { ...extrasOf(lab.cfg), [key]: on === true };
  saveSettings(lab.cfg, { labExtras: next }); lab.cfg.labExtras = next;
  try { lab.broadcast?.({ type: 'lab-extras', extras: next }); } catch {} // the chat's Save to Lab button follows at once
  return next;
}
// 110 The Lab's broadcast, with phone: true on a finished job when "Tell my phone" is on. Bob for Android and a
// phone's browser show a notification for it; nothing else changes.
export function labPhone(broadcast, cfg) {
  const now = typeof cfg === 'function' ? cfg : () => cfg;
  return (ev) => broadcast(ev && ev.type === 'lab-done' && extrasOf(now()).tellPhone ? { ...ev, phone: true } : ev);
}

const dirOf = (cfg, ...p) => path.join(labDir(cfg), ...p);
const brainOf = (lab, id) => lab.brains().find((b) => b.id === String(id || ''));
const fxOf = (lab, page) => { const log = pageLog(lab.cfg, page); const exe = lab.tools().server.path; return { log, fx: { serve: (o) => startServer({ exe, log, ...o }), chat: chatOnce, pack: runExtraPack, ...lab.stepFns } }; };
const cut = (t, n = 6000) => String(t || '').slice(0, n);

// ---- 101 Blind taste test ----
export const TASTE_QUESTIONS = [
  'Explain what a black hole is to a ten-year-old, in three sentences.',
  'Write a short, friendly email asking a neighbour to keep their dog quiet at night.',
  'What are three easy ways to save money on groceries?',
  'Write a haiku about a rainy Monday.',
  'My JavaScript says "TypeError: x is not a function". What usually causes that, and how do I find it?',
  'Give me a simple plan for learning to run 5 km in two months.',
  'Summarise the story of Romeo and Juliet in four sentences.',
  'How do I politely say no to extra work from my boss?',
  'Write a Python function that checks if a word reads the same backwards.',
  'What should I pack for a weekend of camping in autumn?',
  'Explain the difference between weather and climate in two sentences.',
  'Suggest a name and a one-line pitch for a cosy café that also sells books.'
];
export const TASTE_MIN = 3, TASTE_MAX = 20;
const tasteFile = (cfg) => dirOf(cfg, 'taste', 'pairs.json');
const judgeFile = (cfg) => dirOf(cfg, 'taste', 'judge.json');
export const readPairs = (cfg) => readJson(tasteFile(cfg), []);
const usable = (pairs) => pairs.filter((p) => p.pick === 'a' || p.pick === 'b');

export function tasteView(lab) {
  const pairs = readPairs(lab.cfg);
  const side = (p, s) => (s === 'left' ? p[p.left] : p[p.left === 'a' ? 'b' : 'a']);
  const done = pairs.filter((p) => p.pick).sort((x, y) => (y.pickedAt || 0) - (x.pickedAt || 0));
  return {
    questions: TASTE_QUESTIONS, min: TASTE_MIN, max: TASTE_MAX, judgeMin: JUDGE_MIN,
    // Names stay hidden until you pick.
    waiting: pairs.filter((p) => !p.pick).map((p) => ({ id: p.id, q: p.q, left: side(p, 'left').text, right: side(p, 'right').text })),
    recent: done.slice(0, 8).map((p) => ({ q: p.q, left: side(p, 'left').name, right: side(p, 'right').name, picked: p.pick === 'tie' ? 'tie' : p[p.pick].name })),
    ranking: tasteRanking(pairs), picked: usable(pairs).length,
    judges: readJson(judgeFile(lab.cfg), []).slice(0, 6),
    jobSpeed: (lab.scores?.() || []).filter((r) => r.jobSec != null).map((r) => ({ name: r.name, seconds: r.jobSec, score: r.scores?.jobspeed ?? null })).sort((a, b) => a.seconds - b.seconds)
  };
}
export function planTaste(lab, c = {}) {
  const problems = [], notes = [];
  const a = brainOf(lab, c.a), b = brainOf(lab, c.b);
  if (!a || !b) problems.push('Pick two brains.');
  else if (a.id === b.id) problems.push('Pick two different brains.');
  const own = String(c.questions || '').split(/\r?\n/).map((x) => x.trim()).filter(Boolean).map((x) => x.slice(0, 2000));
  const questions = (own.length ? own : TASTE_QUESTIONS).slice(0, TASTE_MAX);
  if (questions.length < TASTE_MIN) problems.push(`Give at least ${TASTE_MIN} questions, one a line, or leave the box empty for mine.`);
  if (!lab.tools().server.found) problems.push(`${path.basename(lab.tools().server.path)} isn't in Bob's engine folder. Settings, Engines: the built-in engine has it.`);
  notes.push(`Each brain answers ${questions.length} questions, one brain at a time, so only one is on the card at once. The answers wait here until you pick.`);
  return { a, b, questions, problems, notes };
}
export async function startTaste(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const p = planTaste(lab, c);
  if (p.problems.length) throw new Error(p.problems[0]);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const { fx } = fxOf(lab, 'taste');
  // The run's name and steps never say which brains, so the list doesn't give the game away.
  return runJob(lab, { kind: 'taste', name: `Taste test, ${p.questions.length} questions`, steps: [['one', 'The first brain answers'], ['two', 'The second brain answers']] }, async (r, { set, signal, progress }) => {
    const said = {};
    for (const [i, [k, b]] of [['one', p.a], ['two', p.b]].entries()) {
      set(k, 'running');
      const srv = await fx.serve({ gguf: b.gguf, ctx: 8192, signal });
      try {
        said[k] = [];
        for (const [n, q] of p.questions.entries()) { said[k].push((await fx.chat(srv.url, [{ role: 'user', content: q }], { maxTokens: 700, signal })).text); progress((100 * (i * p.questions.length + n + 1)) / (2 * p.questions.length)); }
      } finally { srv.stop(); }
      set(k, 'done');
    }
    const at = lab.now();
    const pairs = p.questions.map((q, n) => ({ id: `t${at.toString(36)}-${n}`, q, a: { id: p.a.id, name: p.a.name, text: cut(said.one[n]) }, b: { id: p.b.id, name: p.b.name, text: cut(said.two[n]) }, left: crypto.randomInt(2) ? 'a' : 'b', pick: '', at }));
    writeJson(tasteFile(lab.cfg), [...readPairs(lab.cfg), ...pairs].slice(-500));
    return { taste: { added: pairs.length } };
  });
}
// side: 'left' | 'right' | 'tie'. Returns which brain was which, now that you've picked.
export function tastePick(lab, c = {}) {
  const pairs = readPairs(lab.cfg), p = pairs.find((x) => x.id === String(c.id || ''));
  if (!p) throw new Error('That pair isn\'t here any more.');
  if (!['left', 'right', 'tie'].includes(c.side)) throw new Error('Pick left, right, or a tie.');
  const right = p.left === 'a' ? 'b' : 'a';
  p.pick = c.side === 'tie' ? 'tie' : c.side === 'left' ? p.left : right; p.pickedAt = lab.now();
  writeJson(tasteFile(lab.cfg), pairs);
  return { left: p[p.left].name, right: p[right].name, picked: p.pick === 'tie' ? 'tie' : p[p.pick].name };
}
export function tasteForget(lab) { writeJson(tasteFile(lab.cfg), []); writeJson(judgeFile(lab.cfg), []); return { forgot: true }; }

// ---- 111 Check the judge first ----
export const judgePrompt = (q, x, y) => `Here is a question and two answers. Which answer is better: more helpful, more correct and clearer?\n\nQuestion:\n${q}\n\nAnswer 1:\n${x}\n\nAnswer 2:\n${y}\n\nReply with 1 or 2 only.`;
export function planJudge(lab, c = {}) {
  const problems = [], judge = brainOf(lab, c.judge), n = usable(readPairs(lab.cfg)).length;
  if (!judge) problems.push('Pick the judging brain.');
  if (n < JUDGE_MIN) problems.push(`Pick the better answer in at least ${JUDGE_MIN} taste-test pairs first (you have ${n}). Ties don't count.`);
  if (!lab.tools().server.found) problems.push(`${path.basename(lab.tools().server.path)} isn't in Bob's engine folder.`);
  return { judge, problems, notes: [`It sees your last ${Math.min(40, Math.max(n, JUDGE_MIN))} picks, each pair both ways round, so a judge that just likes the first answer shows up.`] };
}
export async function startJudge(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const p = planJudge(lab, c);
  if (p.problems.length) throw new Error(p.problems[0]);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const { fx } = fxOf(lab, 'taste');
  const pairs = usable(readPairs(lab.cfg)).sort((x, y) => (y.pickedAt || 0) - (x.pickedAt || 0)).slice(0, 40);
  return runJob(lab, { kind: 'judge-check', name: `Check the judge: ${p.judge.name}`, from: p.judge.id, fromName: p.judge.name, steps: [['serve', `Start ${p.judge.name}`], ['ask', 'Ask it to pick, both ways round']] }, async (r, { set, signal, progress }) => {
    set('serve', 'running');
    const srv = await fx.serve({ gguf: p.judge.gguf, ctx: 16384, signal });
    let agree = 0, flips = 0;
    try {
      set('serve', 'done'); set('ask', 'running');
      for (const [n, x] of pairs.entries()) {
        const one = judgeSaid((await fx.chat(srv.url, [{ role: 'user', content: judgePrompt(x.q, x.a.text, x.b.text) }], { maxTokens: 8, signal })).text);
        const two = judgeSaid((await fx.chat(srv.url, [{ role: 'user', content: judgePrompt(x.q, x.b.text, x.a.text) }], { maxTokens: 8, signal })).text);
        const first = one === '1' ? 'a' : one === '2' ? 'b' : '', second = two === '2' ? 'a' : two === '1' ? 'b' : '';
        if (!first || first !== second) flips++;
        else if (first === x.pick) agree++;
        progress((100 * (n + 1)) / pairs.length);
      }
      set('ask', 'done');
    } finally { srv.stop(); }
    const v = judgeVerdict(agree, pairs.length);
    const rec = { judge: { id: p.judge.id, name: p.judge.name }, at: lab.now(), of: pairs.length, agree, flips, ...v };
    writeJson(judgeFile(lab.cfg), [rec, ...readJson(judgeFile(lab.cfg), [])].slice(0, 20));
    return { judgeCheck: rec };
  });
}
// The latest check of a judge, for Best answers' plan. null when it was never checked.
export function judgeTrust(cfg, id) { return readJson(judgeFile(cfg), []).find((x) => x.judge?.id === id) || null; }

// ---- 102 Save a chat question to the Lab ----
export const MY_QUESTIONS = 'my-questions';
export function saveQuestion(lab, c = {}) {
  const q = String(c.q || '').trim().slice(0, 6000);
  if (!q) throw new Error('There\'s no question to save.');
  const check = String(c.check || 'answers');
  const item = { q, check, ...(['contains', 'number', 'exact'].includes(check) ? { a: check === 'contains' ? String(c.a || '').split(',').map((x) => x.trim()).filter(Boolean) : c.a } : {}) };
  const one = cleanMyPack({ title: 'My questions', items: [item] });
  if (!one.pack) throw new Error(one.problems[0].replace(/^Item 1:?\s*/, ''));
  const file = path.join(myPacksDir(labDir(lab.cfg)), `${MY_QUESTIONS}.json`);
  const old = readJson(file, null);
  const items = [...(old?.items || []).filter((x) => x.q !== q), one.pack.items[0]].slice(-200);
  const { pack } = cleanMyPack({ title: 'My questions', what: 'Questions you saved from your chats with Save to Lab.', items });
  writeJson(file, pack);
  return { saved: true, count: pack.items.length, pack: `my:${MY_QUESTIONS}` };
}

// ---- 104 Run again with one change ----
export function againOf(lab, runId) {
  const r = lab.runs.find((x) => x.id === String(runId || ''));
  if (!r) throw new Error('That job isn\'t on the list any more.');
  if ((r.kind || 'make') === 'make' && r.recipe) return { kind: 'make', was: r.recipe, recipe: { ...JSON.parse(JSON.stringify(r.recipe)), name: nextName(r.recipe.name) } };
  if (r.kind === 'challenge') return { kind: 'challenge', challenge: { from: r.from, packs: r.packs || [], bench: r.bench === true } };
  throw new Error('Only a Make a brain job or a Challenges run can be copied from here.');
}

// ---- 103 Before and after Teach it ----
const baFile = (cfg, id) => dirOf(cfg, 'before-after', `${slugOf(id)}.json`);
export const BA_COUNT = 10;
// Ten questions spread through the lesson set the brain learned from; mine when the set can't be read.
export function baQuestions(cfg, setName) {
  const set = lessonSets(cfg).find((s) => s.name === setName || s.id === setName);
  let lines = []; try { lines = fs.readFileSync(set.file, 'utf8').split('\n').filter((x) => x.trim()); } catch {}
  const qs = [];
  const step = Math.max(1, Math.floor(lines.length / BA_COUNT));
  for (let i = 0; i < lines.length && qs.length < BA_COUNT; i += step) {
    try { const m = JSON.parse(lines[i]).messages?.find((x) => x.role === 'user'); if (typeof m?.content === 'string' && m.content.trim()) qs.push(m.content.trim().slice(0, 2000)); } catch {}
  }
  return qs.length >= 3 ? { questions: qs, from: set.name } : { questions: TASTE_QUESTIONS.slice(0, BA_COUNT), from: '' };
}
export function baView(cfg, runId) { return readJson(baFile(cfg, runId), null); }
export async function startBeforeAfter(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const r0 = lab.runs.find((x) => x.id === String(c.run || '') && x.kind === 'teach' && x.state === 'done');
  if (!r0) throw new Error('Pick a finished Teach it job.');
  const before = r0.before, after = r0.files?.gguf;
  if (!before || !fs.existsSync(before)) throw new Error('This brain was taught before Bob kept its starting file, or the work folder was deleted, so there\'s nothing to compare with. Teach it again to see before and after.');
  if (!after || !fs.existsSync(after)) throw new Error('The taught brain\'s file isn\'t there any more.');
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const { questions, from } = baQuestions(lab.cfg, r0.report?.lessons?.[0] || '');
  const { fx } = fxOf(lab, 'teach');
  return runJob(lab, { kind: 'before-after', name: `Before and after: ${r0.name}`, from: r0.from, fromName: r0.fromName, steps: [['before', 'Before teaching: answer the questions'], ['after', 'After teaching: the same questions']] }, async (r, { set, signal, progress }) => {
    const said = {};
    for (const [i, [k, gguf]] of [['before', before], ['after', after]].entries()) {
      set(k, 'running');
      const srv = await fx.serve({ gguf, ctx: 8192, signal });
      try { said[k] = []; for (const [n, q] of questions.entries()) { said[k].push((await fx.chat(srv.url, [{ role: 'user', content: q }], { maxTokens: 500, signal })).text); progress((100 * (i * questions.length + n + 1)) / (2 * questions.length)); } } finally { srv.stop(); }
      set(k, 'done');
    }
    const rec = { run: r0.id, name: r0.name, from: r0.fromName, lessons: from, at: lab.now(), rows: questions.map((q, n) => ({ q, before: cut(said.before[n], 3000), after: cut(said.after[n], 3000), same: said.before[n] === said.after[n] })) };
    writeJson(baFile(lab.cfg, r0.id), rec);
    return { beforeAfter: { run: r0.id, changed: rec.rows.filter((x) => !x.same).length, of: rec.rows.length } };
  });
}

// ---- 107 Safety check after Take out the refusal habit ----
const safetyFile = (cfg, id) => dirOf(cfg, 'safety', `${slugOf(id)}.json`);
export function safetyView(cfg, runId) { return readJson(safetyFile(cfg, runId), null); }
export async function startSafety(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const r0 = lab.runs.find((x) => x.id === String(c.run || '') && x.state === 'done' && x.files?.gguf);
  if (!r0) throw new Error('Pick a finished brain made in the Lab.');
  if (!fs.existsSync(r0.files.gguf)) throw new Error('That brain\'s file isn\'t there any more.');
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const { fx } = fxOf(lab, 'safety');
  return runJob(lab, { kind: 'safety', name: `Safety check: ${r0.name}`, from: r0.from, fromName: r0.fromName, steps: [['serve', `Start ${r0.name}`], ['kept', 'Still refuses: 15 probes']] }, async (r, { set, signal, progress }) => {
    set('serve', 'running');
    const srv = await fx.serve({ gguf: r0.files.gguf, ctx: 4096, signal });
    let res;
    try { set('serve', 'done'); set('kept', 'running'); res = await fx.pack(srv.url, 'kept', { signal, onStep: (d, t) => progress((100 * d) / t) }); set('kept', 'done'); } finally { srv.stop(); }
    // Only which kinds slipped are kept, never what the brain said.
    const missed = [...new Set((res.misses || []).map((m) => STILL_REFUSES.find((x) => x.q.startsWith(m))?.kind).filter(Boolean))];
    const rec = { run: r0.id, at: lab.now(), declined: res.right, of: res.of, missed };
    writeJson(safetyFile(lab.cfg, r0.id), rec);
    return { safety: rec };
  });
}

// ---- 108 Share a recipe as a small file ----
const sharedFile = (cfg) => dirOf(cfg, 'shared-recipes.json');
export function shareRecipe(lab, name) {
  const list = readJson(lab.recipesFile, []);
  const rec = list.find((x) => x.name === String(name || ''));
  if (!rec) throw new Error('That recipe isn\'t saved here.');
  const made = [...lab.runs].reverse().find((x) => (x.kind || 'make') === 'make' && x.state === 'done' && x.recipe?.name === rec.name && x.report?.made);
  const brain = brainOf(lab, rec.from);
  const { at, ...recipe } = rec;
  return {
    file: `${slugOf(rec.name)}.bob-recipe.json`,
    recipe: { bob: 'lab-recipe', v: 1, name: rec.name, startBrain: brain ? brain.name : '', recipe: { ...recipe, lessons: { ...recipe.lessons, file: '' }, smaller: { ...recipe.smaller, cut: recipe.smaller?.cut && { ...recipe.smaller.cut, file: '' } } }, scores: made ? { labTest: made.report.made.score, startBrain: made.report.from?.score ?? null, sizeGB: made.report.sizeGB ?? null, wordsASecond: made.report.made.tps || null } : null }
  };
}
export function loadRecipe(lab, text) {
  let j; try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch { throw new Error('That file isn\'t a recipe: it isn\'t valid JSON.'); }
  if (!j || j.bob !== 'lab-recipe' || typeof j.recipe !== 'object') throw new Error('That file isn\'t a Bob Lab recipe.');
  const r = cleanRecipe({ ...j.recipe, name: j.name || j.recipe.name });
  if (!r.name) throw new Error('The recipe has no name.');
  const here = Boolean(brainOf(lab, r.from));
  lab.saveRecipe({ ...r, from: here ? r.from : '', lessons: { ...r.lessons, file: '' }, smaller: { ...r.smaller, cut: r.smaller.cut && { ...r.smaller.cut, file: r.smaller.cut.how === 'file' ? '' : r.smaller.cut.file } } });
  const shared = readJson(sharedFile(lab.cfg), {});
  shared[r.name] = { startBrain: String(j.startBrain || '').slice(0, 120), scores: j.scores && typeof j.scores === 'object' ? Object.fromEntries(['labTest', 'startBrain', 'sizeGB', 'wordsASecond'].map((k) => [k, Number.isFinite(Number(j.scores[k])) && j.scores[k] !== null ? Number(j.scores[k]) : null])) : null, at: lab.now() };
  writeJson(sharedFile(lab.cfg), shared);
  const notes = [];
  if (!here) notes.push(`It starts from ${shared[r.name].startBrain || 'a brain that isn\'t on this replicant matrix'}. Get it in Get models, then pick it in step 1.`);
  if (j.recipe.lessons?.kind && j.recipe.lessons.kind !== 'none') notes.push('Lessons are your own pick: a recipe never carries files or paths.');
  return { name: r.name, notes };
}

// ---- 112 Clean a lesson set ----
const SEEDS = Array.from({ length: 64 }, (_, i) => (Math.imul(i + 1, 0x9e3779b1) >>> 0));
const fnv = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193); } return h >>> 0; };
const mix = (h) => { h ^= h >>> 16; h = Math.imul(h, 0x85ebca6b); h ^= h >>> 13; h = Math.imul(h, 0xc2b2ae35); h ^= h >>> 16; return h >>> 0; };
export const NEAR = 0.8;
// Which lines of a set repeat an earlier one: exactly (same words) or nearly (80% of word triples shared).
export async function findRepeats(lines, { near = NEAR, yieldEvery = 500 } = {}) {
  const seen = new Map(), bands = new Map(), keep = [], drop = [], pairs = [];
  const sh = [];
  for (let i = 0; i < lines.length; i++) {
    if (yieldEvery && i % yieldEvery === yieldEvery - 1) await new Promise((r) => setImmediate(r));
    const w = lessonWords(lines[i]);
    if (!w) { keep.push(i); sh.push(null); continue; }
    if (seen.has(w)) { drop.push({ i, of: seen.get(w), exact: true }); sh.push(null); continue; }
    seen.set(w, i);
    const s = shingles(w), base = [...s].map(fnv);
    const sig = SEEDS.map((seed) => { let m = 0xffffffff; for (const h of base) { const v = mix(h ^ seed); if (v < m) m = v; } return m; });
    let dup = -1;
    const keys = [];
    for (let b = 0; b < 16; b++) keys.push(`${b}:${sig.slice(b * 4, b * 4 + 4).join('.')}`);
    for (const k of keys) { for (const j of bands.get(k) || []) { if (dup < 0 && sh[j] && jaccard(s, sh[j]) >= near) dup = j; } if (dup >= 0) break; }
    if (dup >= 0) { drop.push({ i, of: dup, exact: false }); sh.push(null); continue; }
    sh.push(s); keep.push(i);
    for (const k of keys) { const l = bands.get(k); if (l) l.push(i); else bands.set(k, [i]); }
  }
  return { keep, drop, exact: drop.filter((d) => d.exact).length, near: drop.filter((d) => !d.exact).length };
}
const setOf = (lab, id) => { const s = lessonSets(lab.cfg).find((x) => x.id === String(id || '')); if (!s) throw new Error('That lesson set isn\'t here.'); return s; };
const readLines = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((x) => x.trim());
const shortOf = (line) => { try { const m = JSON.parse(line).messages?.find((x) => x.role === 'user'); return String(m?.content || '').slice(0, 160); } catch { return String(line).slice(0, 160); } };
export async function planClean(lab, id) {
  const s = setOf(lab, id), lines = readLines(s.file), f = await findRepeats(lines);
  return { id: s.id, name: s.name, total: lines.length, exact: f.exact, near: f.near, left: f.keep.length, examples: f.drop.slice(0, 5).map((d) => ({ exact: d.exact, a: shortOf(lines[d.of]), b: shortOf(lines[d.i]) })), backup: fs.existsSync(path.join(path.dirname(s.file), 'lessons.before-clean.jsonl')) };
}
export async function cleanSet(lab, id) {
  if (lab.job) throw new Error('The Lab is busy with a job. Clean the set when it\'s done, so nothing is reading it.');
  const s = setOf(lab, id), lines = readLines(s.file), f = await findRepeats(lines);
  if (!f.drop.length) return { id: s.id, removed: 0, left: lines.length };
  const back = path.join(path.dirname(s.file), 'lessons.before-clean.jsonl');
  if (!fs.existsSync(back)) fs.copyFileSync(s.file, back); // the first clean keeps the original; Put it back restores it
  fs.writeFileSync(s.file + '.part', f.keep.map((i) => lines[i]).join('\n') + '\n'); fs.renameSync(s.file + '.part', s.file);
  return { id: s.id, removed: f.drop.length, exact: f.exact, near: f.near, left: f.keep.length };
}
export function undoClean(lab, id) {
  const s = setOf(lab, id), back = path.join(path.dirname(s.file), 'lessons.before-clean.jsonl');
  if (!fs.existsSync(back)) throw new Error('There\'s no copy from before the clean.');
  fs.copyFileSync(back, s.file); fs.rmSync(back);
  return { id: s.id, restored: true };
}

// ---- The page's one read, and the route ----
export function plusView(lab) {
  const runs = lab.runs || [];
  return {
    extras: extrasOf(lab.cfg),
    taste: tasteView(lab),
    beforeAfter: Object.fromEntries(runs.filter((r) => r.kind === 'teach' && r.state === 'done').map((r) => [r.id, { can: Boolean(r.before), done: Boolean(baView(lab.cfg, r.id)) }])),
    safety: Object.fromEntries(runs.filter((r) => r.state === 'done' && r.files?.gguf && ['refusals', 'make', 'mix', 'stack', 'teach'].includes(r.kind || 'make')).map((r) => [r.id, safetyView(lab.cfg, r.id)])),
    shared: readJson(sharedFile(lab.cfg), {})
  };
}
export async function plusRoute({ req, p, isLocal, lab, b, send, res }) {
  if (!p.startsWith('/api/lab/plus')) return false;
  if (req.method === 'GET' && p === '/api/lab/plus') { send(res, 200, plusView(lab)); return true; }
  // Things a phone may do too: pick in the taste test, save a question from the chat, read results.
  if (p === '/api/lab/plus/pick') { send(res, 200, tastePick(lab, b)); return true; }
  if (p === '/api/lab/plus/question') { send(res, 200, saveQuestion(lab, b)); return true; }
  if (p === '/api/lab/plus/before-after') { send(res, 200, { result: baView(lab.cfg, String(b.run || '')) }); return true; }
  if (p === '/api/lab/plus/taste/plan') { const x = planTaste(lab, b); send(res, 200, { problems: x.problems, notes: x.notes, count: x.questions.length }); return true; }
  if (p === '/api/lab/plus/judge/plan') { const x = planJudge(lab, b); send(res, 200, { problems: x.problems, notes: x.notes }); return true; }
  if (p === '/api/lab/plus/again') { send(res, 200, againOf(lab, b.run)); return true; }
  if (p === '/api/lab/plus/recipe/share') { send(res, 200, shareRecipe(lab, b.name)); return true; }
  if (!isLocal) { send(res, 403, { error: 'Lab jobs and Lab switches only work on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/plus/switch') { send(res, 200, { extras: setExtra(lab, String(b.key || ''), b.on === true) }); return true; }
  if (p === '/api/lab/plus/taste/start') { send(res, 200, await startTaste(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/plus/taste/forget') { send(res, 200, tasteForget(lab)); return true; }
  if (p === '/api/lab/plus/judge/start') { send(res, 200, await startJudge(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/plus/before-after/start') { send(res, 200, await startBeforeAfter(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/plus/safety/start') { send(res, 200, await startSafety(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/plus/recipe/load') { send(res, 200, loadRecipe(lab, b.text)); return true; }
  if (p === '/api/lab/plus/clean/plan') { send(res, 200, await planClean(lab, b.id)); return true; }
  if (p === '/api/lab/plus/clean') { send(res, 200, await cleanSet(lab, b.id)); return true; }
  if (p === '/api/lab/plus/clean/undo') { send(res, 200, undoClean(lab, b.id)); return true; }
  return false;
}
