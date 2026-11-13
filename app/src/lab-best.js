// 1.5.188 🧪 Playground: Best answers. A bigger brain judges; a smaller (often compressed) brain learns from its own
// best answers. The small brain answers each question several times, the big one scores every answer, and then:
// - "Best of its own": the small brain is taught its best answer to each question (best-of-N self-training).
// - "Better and worse pairs": it learns to lean toward the better answer of each pair (preference training, DPO).
// - Both: the best answers first, then the pairs.
// "Teach only these parts" puts the adapter only on the experts, layers or
// heads that an fNRI recording shows the skill uses, or that a parts list saved from the fNRI viewer names; the rest of
// the brain stays frozen. Questions with a short exact answer (a number, a word) are marked by a checker, not the judge.
// Some questions are held back: never taught, asked before and after, so the result is honest.
// Answering and judging always run here (they're just chats). Teaching runs here when the brain fits the card (the
// Trainer pack, like Teach it); when it doesn't, the best answers are saved as a Teach it Forge plan with caps at 0,
// which only the Forge tab's purchase card can start. Nothing is rented from this page.
import fs from 'node:fs';
import path from 'node:path';
import { labDir, labModelsDir, inspect, slugOf, lessonSets } from './lab.js';
import { startServer } from './lab-test.js';
import { planTeach, saveTeachPlan, trainerState, hwOf, fetchBase, foldAdapter, foldFull, quizFile, guardTool, readLessonSource, lessonsPerHour, TRAINER } from './lab-teach.js';
import { TEACH_PY, FETCH_PY } from './lab-teach-script.js';
import { watchDir, listRecordings, readRecording } from './lab-watch.js';
import { specialise } from '../public/lab-watch-math.js';
import { readJson, writeJson, canStart, makeRoom, runJob, runTool, pageLog } from './lab-jobs.js';
import { judgeTrust } from './lab-plus.js'; // Lab item 111: Check the judge first

export const ANSWERS = [2, 4, 8];          // answers the small brain gives to each question
export const ANSWERS_DEFAULT = 4;
export const LIMITS = [50, 100, 200, 500, 1000]; // questions read from the lessons
export const LIMIT_DEFAULT = 200;
export const WAYS = ['best', 'pairs', 'both'];
export const GOOD = 6;      // out of 10: a best answer below this isn't taught
export const GAP = 2;       // points between the better and the worse answer for a pair to count
export const HOLD = { share: 0.1, min: 5, max: 40 };
export const MAX_TARGETS = 20000;
export const TARGETS_FORMAT = 'bob-fnri-targets'; // the fNRI viewer's "Use these for training" files (src/lab-watch.js)
const ANSWER_TOKENS = 400, TEMP = 0.8;
export const bestDir = (cfg) => path.join(labDir(cfg), 'best');

// ---- Questions: the lesson formats Teach it reads, but only the question is kept; its own answer becomes the key ----
export function readQuestions(file, limit = LIMIT_DEFAULT) {
  const out = [];
  let lines = []; try { lines = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n'); } catch { return out; }
  const role = (m) => m.role || { human: 'user', gpt: 'assistant', system: 'system' }[m.from] || m.from;
  const content = (m) => String(m.content ?? m.value ?? '');
  for (const line of lines) {
    if (out.length >= limit) break;
    if (!line.trim()) continue;
    let j; try { j = JSON.parse(line); } catch { continue; }
    let msgs = null, key = '';
    const list = j.messages || j.conversations;
    if (Array.isArray(list)) {
      const norm = list.map((m) => ({ role: role(m), content: content(m) })).filter((m) => ['system', 'user', 'assistant'].includes(m.role));
      const last = norm.map((m) => m.role).lastIndexOf('assistant');
      if (last >= 0) { msgs = norm.slice(0, last); key = norm[last].content; } else msgs = norm;
    } else if (j.prompt || j.question || j.instruction) {
      const q = String(j.prompt || j.question || j.instruction) + (j.input ? `\n\n${j.input}` : '');
      msgs = [{ role: 'user', content: q }]; key = String(j.completion ?? j.answer ?? j.output ?? '');
    }
    if (!msgs?.length || msgs[msgs.length - 1].role !== 'user' || !msgs[msgs.length - 1].content.trim()) continue;
    out.push({ messages: msgs, key: key.trim() });
  }
  return out;
}
// Held back: spread evenly through the list, never taught.
export function holdBack(n) {
  const k = Math.max(HOLD.min, Math.min(HOLD.max, Math.round(n * HOLD.share)));
  if (n < 2 * HOLD.min) return new Set();
  const step = n / k, out = new Set();
  for (let i = 0; i < k; i++) out.add(Math.floor(i * step + step / 2));
  return out;
}

// ---- The checker: a short exact answer (a number, or a word or two) is right or wrong, no judge needed ----
const norm = (s) => String(s || '').toLowerCase().replace(/[*_`"'“”‘’]/g, '').replace(/\s+/g, ' ').trim();
const NUM = /-?\d[\d,]*(?:\.\d+)?/g;
// 1.5.211 (PC trial: "**Answer: 4:15**" scored 0 next to "So, it arrives at **4:15**." scored 10, and "$$\boxed{30}$$" 0
// next to "**30**" 10): the final answer is read the same way from the key and from each answer. Thinking, markdown,
// $…$ and \boxed{…} go; an "Answer:" line or a \boxed{} is the answer, else the last sentence; a time or a number in it is
// compared as a value, so the wording around it doesn't matter.
const plain = (s) => String(s || '').replace(/<think>[\s\S]*?<\/think>/g, ' ').replace(/\\(?:text|mathrm|mathbf)\{([^{}]*)\}/g, '$1').replace(/\$+/g, ' ');
function finalPart(s) {
  const t = plain(s);
  const boxed = [...t.matchAll(/\\boxed\{([^{}]*)\}/g)];
  if (boxed.length) return boxed[boxed.length - 1][1];
  // The value may sit on the next line, after markdown ("**Final answer:**" then "**2, 4, 7, 9**").
  const said = [...t.matchAll(/(?:final answer|answer)\s*(?:is|:)[\s*_:]*([^\n]*[a-z0-9][^\n]*)/gi)];
  if (said.length) return said[said.length - 1][1];
  const sentences = norm(t).split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter((x) => /[a-z0-9]/.test(x));
  return sentences[sentences.length - 1] || '';
}
const NUMS = (s) => (norm(s).replace(/\b\d{1,2}:\d{2}\b/g, ' ').match(NUM) || []).map((n) => Number(n.replace(/,/g, ''))).filter(Number.isFinite);
function valueOf(s) {
  const f = norm(finalPart(s));
  const times = f.match(/\b\d{1,2}:\d{2}\b/g);
  if (times) return { time: times[times.length - 1].replace(/^0(?=\d:)/, '') };
  const nums = NUMS(f);
  // A list ("2, 4, 7, 9") is compared as the whole list in its order; one value as that value.
  if (nums.length > 1 && /^[\s\d.,;:\-–and]*$/.test(f.replace(/[.!?]+$/, '').split(/\b(?:is|are|=)\b|:/).pop())) return { list: nums };
  return nums.length ? { num: nums[nums.length - 1] } : null;
}
const shortKey = (k) => /^-?\d[\d,]*(\.\d+)?$/.test(k) || (k.length <= 24 && k.split(' ').length <= 3);
// A key with a clear final value (a \boxed{}, an Answer: line, or a short key with a number or time) is checked as a value.
// A sentence key counts only when it ends on its value ("So, it arrives at 4:15.", "It takes 150 minutes."), not
// "It is 42 because it doubles", where the reasoning is the answer.
const endsOnValue = (t) => { const w = norm(t).replace(/[.!?]+$/, '').split(' '); return w.length <= 12 && /\d/.test(w.slice(-2).join(' ')); };
const valueKey = (key) => { const t = plain(key); return (/\\boxed\{|(?:final answer|answer)\s*(?:is|:)/i.test(t) || shortKey(norm(t)) || endsOnValue(t)) ? valueOf(key) : null; };
export const checkable = (key) => { const k = norm(key); return Boolean(k) && (shortKey(k) || Boolean(valueKey(key))); };
export function checkAnswer(answer, key) {
  const v = valueKey(key);
  if (v) {
    const f = norm(finalPart(answer));
    if (v.time) return (f.match(/\b\d{1,2}:\d{2}\b/g) || []).some((t) => t.replace(/^0(?=\d:)/, '') === v.time) ? 10 : 0;
    const got = NUMS(f);
    if (v.list) return got.some((_, i) => v.list.every((n, j) => Math.abs((got[i + j] ?? NaN) - n) < 1e-9)) ? 10 : 0;
    return got.some((n) => Math.abs(n - v.num) < 1e-9) ? 10 : 0;
  }
  const k = norm(key), a = norm(plain(answer));
  return new RegExp(`(^|[^a-z0-9])${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^a-z0-9]|$)`).test(a) ? 10 : 0;
}

// ---- The judge: every answer to one question in one go, so the scores are comparable ----
export function judgeMessages(q, answers, { key = '' } = {}) {
  const ask = q.messages.map((m) => `${m.role === 'user' ? 'Question' : m.role === 'assistant' ? 'Earlier answer' : 'Instructions'}: ${m.content}`).join('\n\n');
  return [
    { role: 'system', content: 'You grade answers. Judge each answer on its own against the question (and the known good answer, if one is given), never against the other answers. Use this scale: 10 = fully correct and clear; 7 = correct with a small slip (a wrong tense, a loose word, a step skipped); 4 = partly right; 1 = wrong; 0 = no answer. Two answers that are equally correct get the same score, however differently they are worded. A wrong answer scores low however well it is written; length is not a virtue. Reply with only JSON: {"scores": [n, n, ...]}, one score per answer, in order.' },
    { role: 'user', content: `${ask}\n\n${key ? `A known good answer, for reference:\n${key}\n\n` : ''}${answers.map((a, i) => `Answer ${i + 1}:\n${a}`).join('\n\n')}\n\nScore all ${answers.length} answers.` }
  ];
}
export function parseScores(text, n) {
  const t = String(text || '').replace(/<think>[\s\S]*?<\/think>/g, '');
  let list = null;
  const m = t.match(/\{[\s\S]*\}/);
  if (m) { try { const j = JSON.parse(m[0]); if (Array.isArray(j.scores)) list = j.scores.map(Number); } catch {} }
  if (!list) { const nums = (t.match(/-?\d+(?:\.\d+)?/g) || []).map(Number); if (nums.length >= n) list = nums.slice(0, n); }
  if (!list || list.length < n || list.slice(0, n).some((x) => !Number.isFinite(x))) return null;
  return list.slice(0, n).map((x) => Math.max(0, Math.min(10, x)));
}
// 1.5.211 A steadier judge (the PC trial saw a small judge give one right answer 10 and another 0): answers that are
// the same word for word are judged once and share a score, and a list is judged twice, in order and reversed, and the
// two scores are averaged, so where an answer sits in the list matters less. ask(list) -> scores or null.
export async function steadyScores(ask, list) {
  const norm = (a) => String(a || '').trim().replace(/\s+/g, ' ').toLowerCase();
  const uniq = [], at = list.map((a) => { const k = norm(a); let i = uniq.findIndex((u) => norm(u) === k); if (i < 0) { uniq.push(a); i = uniq.length - 1; } return i; });
  const one = await ask(uniq);
  const two = uniq.length > 1 ? await ask([...uniq].reverse()).then((x) => x && x.reverse()) : null;
  const both = one && two ? one.map((x, i) => Math.round(((x + two[i]) / 2) * 10) / 10) : one || two;
  return both ? at.map((i) => both[i]) : null;
}
// Which answer is taught, and which pair counts.
export function pick(scores) {
  let hi = 0, lo = 0;
  scores.forEach((s, i) => { if (s > scores[hi]) hi = i; if (s < scores[lo]) lo = i; });
  return { best: hi, worst: lo, bestScore: scores[hi], worstScore: scores[lo], good: scores[hi] >= GOOD, pair: hi !== lo && scores[hi] - scores[lo] >= GAP && scores[hi] >= GOOD };
}

// ---- Parts to teach: fNRI's saved lists, or a skill's experts from a recording ----
const brainOf = (lab, id) => lab.brains().find((b) => b.id === String(id || ''));
const targetsFolder = (cfg, brain) => path.join(watchDir(cfg), slugOf(brain.id || brain.name));
export function listTargetFiles(cfg, brain) {
  let names = []; try { names = fs.readdirSync(targetsFolder(cfg, brain)).filter((f) => /^targets-.+\.json$/.test(f)); } catch {}
  return names.map((f) => { const j = readJson(path.join(targetsFolder(cfg, brain), f), null); return j?.format === TARGETS_FORMAT && Array.isArray(j.targets) ? { id: f.replace(/^targets-|\.json$/g, ''), label: String(j.label || '').slice(0, 120), why: String(j.why || ''), count: j.targets.length, at: Number(j.at) || 0 } : null; }).filter(Boolean).sort((a, b) => b.at - a.at);
}
export function cleanTargets(list, { layers = 0, experts = 0 } = {}) {
  if (!Array.isArray(list)) throw new Error('The parts come as a list.');
  if (list.length > MAX_TARGETS) throw new Error(`That's more than ${MAX_TARGETS.toLocaleString()} parts.`);
  const seen = new Map();
  for (const t of list) {
    const kind = String(t?.kind || ''), layer = Number(t?.layer), index = kind === 'expert' || kind === 'head' ? Number(t?.index) : 0;
    if (!['expert', 'head', 'attn', 'ffn'].includes(kind)) throw new Error('A part is an expert, a head, a floor\'s attention or a floor\'s feed-forward block.');
    if (!Number.isInteger(layer) || layer < 0 || (layers && layer >= layers)) throw new Error(`This brain has floors 1 to ${layers}.`);
    if (kind === 'expert' && (!experts || !Number.isInteger(index) || index < 0 || index >= experts)) throw new Error(experts ? `This brain has experts 0 to ${experts - 1}.` : 'This brain has no experts.');
    if (!Number.isInteger(index) || index < 0 || index > 4096) throw new Error('That head number isn\'t one.');
    seen.set(`${kind}:${layer}:${index}`, { kind, layer, index });
  }
  return [...seen.values()];
}
// t: { kind: 'none' } | { kind: 'file', id } | { kind: 'skill', recording, skill (its id) }
export function resolveTargets(lab, learnerId, t = {}) {
  if (!t || !t.kind || t.kind === 'none') return { list: null, label: '' };
  const brain = brainOf(lab, learnerId); if (!brain) throw new Error('Pick the brain that learns first.');
  let facts = null; try { facts = inspect(brain); } catch {}
  const shape = { layers: facts?.layers || 0, experts: facts?.experts || 0 };
  if (t.kind === 'file') {
    const j = readJson(path.join(targetsFolder(lab.cfg, brain), `targets-${slugOf(t.id)}.json`), null);
    if (j?.format !== TARGETS_FORMAT) throw new Error('That parts list isn\'t here any more.');
    if ((j.brain?.layers && shape.layers && Number(j.brain.layers) !== shape.layers) || (j.brain?.experts && shape.experts && Number(j.brain.experts) !== shape.experts)) throw new Error('That parts list was made for a brain of another shape.');
    return { list: cleanTargets(j.targets, shape), label: String(j.label || 'a saved parts list') };
  }
  if (t.kind === 'skill') {
    const rec = readRecording(lab, { brain: brain.id, id: String(t.recording || '') });
    if (rec.brain.kind && rec.brain.kind !== 'experts') throw new Error('That scan shows heads or neurons, not experts. Save a parts list from it in fNRI and pick that.');
    const s = rec.skills.findIndex((x) => x.id === String(t.skill || ''));
    if (s < 0) throw new Error('That skill isn\'t in the scan.');
    const sp = specialise(rec), list = [];
    sp.top.forEach((row, layer) => row.forEach((top, index) => { if (top === s) list.push({ kind: 'expert', layer, index }); }));
    if (!list.length) throw new Error(`No expert leans to ${rec.skills[s].label} in that scan. Ask it more of that skill's questions in fNRI first.`);
    return { list: cleanTargets(list, shape), label: `the experts that lean to ${rec.skills[s].label}` };
  }
  throw new Error('Pick which parts to teach.');
}

// ---- The plan ----
const tpsOf = (gb) => Math.max(4, Math.min(120, Math.round(480 / Math.max(1, gb || 4)))); // words a second, roughly, on a card
export async function planBest(lab, c = {}) {
  const learner = brainOf(lab, c.learner), judge = brainOf(lab, c.judge);
  const answers = ANSWERS.includes(Number(c.answers)) ? Number(c.answers) : ANSWERS_DEFAULT;
  const limit = LIMITS.includes(Number(c.limit)) ? Number(c.limit) : LIMIT_DEFAULT;
  const way = WAYS.includes(c.way) ? c.way : 'best';
  const rescue = c.rescue !== false, useKey = c.key !== false;
  // Teaching works on full weights: the learner's original (named in its file), or a folder/Hugging Face brain the
  // person points at (a cut brain's full-size folder, say).
  const weights = c.weights?.kind ? c.weights : { kind: 'lab', id: String(c.learner || '') };
  // Parts-only teaching changes the chosen weights themselves (no adapter), at 16-bit, so the fit line is about half.
  const parts = Boolean(c.targets?.kind && c.targets.kind !== 'none');
  const t = await planTeach(lab, { name: c.name, brain: weights, lessons: c.questions || {}, where: c.where, direct: parts });
  const problems = t.problems.filter((x) => !/Pick the lessons|lesson set isn't here|\.jsonl lesson file/.test(x)), notes = [...t.notes.filter((x) => !/teacher's odds/.test(x))];
  const qs = readLessonSource(lab, c.questions || {});
  if (qs.problems.length) problems.push(qs.problems[0].replace(/lessons|lesson file/g, 'questions'));
  let lf = null, jf = null;
  if (!learner) problems.push('Pick the brain that learns. It answers from its running file here.'); else { try { lf = inspect(learner); } catch {} }
  if (!judge) problems.push('Pick the brain that judges. A bigger brain from the same family judges best.');
  else { try { jf = inspect(judge); } catch {} }
  if (learner && judge && learner.id === judge.id) problems.push('A brain can\'t judge itself. Pick a bigger one to judge.');
  if (lf && jf) {
    if ((jf.paramsB || 0) <= (lf.paramsB || 0)) problems.push(`${judge.name} isn't bigger than ${learner.name}. A judge has to know more than the brain it judges, or it can't tell the answers apart.`);
    const fam = (f) => String(f?.arch || '').replace(/moe$|_moe$/i, '').replace(/\d+$/, '');
    if (fam(lf) && fam(jf) && fam(lf) !== fam(jf) && (learner.family || '') !== (judge.family || '')) notes.push(`${judge.name} is from another family than ${learner.name}. It can still judge, but one from the same family knows best what ${learner.name} is aiming for.`);
  }
  let targets = null;
  try { const r = resolveTargets(lab, c.learner, c.targets); if (r.list) targets = { count: r.list.length, label: r.label, experts: r.list.filter((x) => x.kind === 'expert').length }; } catch (e) { problems.push(e.message); }
  if (targets) notes.push(`Only ${targets.label} are taught (${targets.count.toLocaleString()} part${targets.count === 1 ? '' : 's'}); the rest of the brain stays frozen. Bob changes those weights themselves, one expert at a time even where the full weights keep a layer's experts packed together, so the brain is worked on at 16-bit. If a listed part isn't in the full weights, the result says how many were skipped.`);
  if (t.where === 'rented') {
    if (way !== 'best') problems.push('The Forge learns from best answers only for now. Better and worse pairs are taught here, on a brain that fits the card.');
    if (targets) problems.push('Teaching only some parts is done here for now, on a brain that fits the card. The Forge teaches the whole brain.');
  }
  const n = Math.min(limit, qs.count || limit), held = holdBack(n).size, taught = n - held;
  const answerS = (n * answers + held * 2) * (ANSWER_TOKENS * 0.6) / tpsOf(lf?.sizeGB);
  const judgeS = n * (answers * 15 + 40) / tpsOf(jf?.sizeGB) + n * 4;
  const minutes = Math.max(1, Math.round((answerS + judgeS) / 60));
  const teachHours = t.where === 'here' ? Math.max(0.1, Math.round(((taught * (way === 'pairs' ? 3 : way === 'both' ? 4 : 1)) / lessonsPerHour(t.brain.paramsB)) * 10) / 10) : null;
  if (judge && lab.cfg) { const t = judgeTrust(lab.cfg, judge.id); notes.push(t ? `Checked against your own picks: ${t.line}` : `${judge.name} hasn't been checked against your own picks yet. Test, Taste test, Check the judge shows how far to trust it.`); } // Lab item 111
  if (jf && lab.cfg && jf.sizeGB > (Number(lab.cfg.gpuVramGB) || 99)) notes.push(`${judge.name} is bigger than the card, so part of it runs from RAM while it judges: slower, the same scores.`);
  notes.push(`Of ${n} questions, ${held} are held back: never taught, asked before and after, so you see whether it really got better and didn't just learn the test.`);
  if (rescue) notes.push(`When none of ${learner?.name || 'its'} answers scores ${GOOD} or more, ${judge?.name || 'the judge'} writes its own answer for that question instead, and that's taught.`);
  return { name: t.name, slug: t.slug, learner: learner ? { id: learner.id, name: learner.name, sizeGB: lf?.sizeGB || 0 } : null, judge: judge ? { id: judge.id, name: judge.name, sizeGB: jf?.sizeGB || 0 } : null, weights: t.brain, questions: { name: qs.name, count: n, held }, answers, way, rescue, key: useKey, targets, where: t.where, fit: t.fit, trainer: t.trainer, disk: t.disk, minutes, teachHours, problems: [...new Set(problems)], notes, _teach: t };
}

// One chat at a set temperature. Thinking off: the answer is what's judged.
export async function sample(url, messages, { temperature = 0, seed = 0, maxTokens = ANSWER_TOKENS, signal } = {}) {
  const res = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, temperature, seed, max_tokens: maxTokens, chat_template_kwargs: { enable_thinking: false } }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(600e3)]) : AbortSignal.timeout(600e3) });
  if (!res.ok) throw new Error(`The engine answered ${res.status}.`);
  const j = await res.json();
  return String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
}
const jsonl = (f, rows) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, rows.map((r) => JSON.stringify(r)).join('\n') + (rows.length ? '\n' : '')); };

// ---- The job ----
export async function startBest(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const p = await planBest(lab, c);
  if (p.problems.length) throw new Error(p.problems[0]);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const log = pageLog(lab.cfg, 'best'), here = p.where === 'here';
  const learner = brainOf(lab, p.learner.id), judge = brainOf(lab, p.judge.id);
  const fx = { tool: runTool, quiz: quizFile, serve: (gguf, signal) => startServer({ exe: lab.tools().server.path, gguf, signal, log }), chat: sample, ...lab.stepFns };
  fx.tool = guardTool(fx.tool);
  const data = path.join(bestDir(lab.cfg), p.slug), work = path.join(labModelsDir(lab.cfg), 'best', p.slug);
  const targets = resolveTargets(lab, p.learner.id, c.targets).list;
  const steps = [['questions', `Read the questions (${p.questions.name})`], ['answers', `${p.learner.name} answers each ${p.answers} times`], ['judge', `${p.judge.name} judges every answer`],
    ...(here ? [['teach', `Teach ${p.way === 'pairs' ? 'the better-or-worse pairs' : p.way === 'both' ? 'the best answers, then the pairs' : 'the best answers'}${p.teachHours ? ` (about ${p.teachHours} h)` : ''}`], ['fold', 'Fold it into a new brain file'], ['after', 'Ask the held-back questions again, and the Quick quiz']] : [['plan', 'Save the best answers as a Forge plan']])];
  return runJob(lab, { kind: 'best', name: p.name, from: learner.id, fromName: learner.name, steps, stopped: 'You stopped it. The answers and scores so far are kept in the Lab\'s folder; nothing was put into Bob.' }, async (r, { set, signal, progress }) => {
    r.slug = `best-${p.slug}`;
    r.origin = p._teach?.brain?.repo || '';
    fs.mkdirSync(data, { recursive: true });
    set('questions', 'running');
    let qfile = p._teach.lessons.file;
    if (p._teach.lessons.repo || p._teach.lessons.url) {
      qfile = path.join(data, 'questions.jsonl');
      const dl = lab.stepFns.download || (async (url, out) => { const res = await fetch(url, { signal }); if (!res.ok) throw new Error(`The download answered ${res.status}.`); fs.writeFileSync(out, Buffer.from(await res.arrayBuffer())); });
      const url = p._teach.lessons.url || `https://huggingface.co/datasets/${p._teach.lessons.repo}/resolve/${encodeURIComponent(p._teach.lessons.revision || 'main')}/${p._teach.lessons.hfFile.split('/').map(encodeURIComponent).join('/')}`;
      await dl(url, qfile, { signal, maxBytes: 4e9 });
    }
    const qs = readQuestions(qfile, p.questions.count);
    if (qs.length < 4) throw new Error('Fewer than 4 questions could be read from those lessons.');
    const held = holdBack(qs.length);
    set('questions', 'done'); set('answers', 'running');
    // 1. The small brain answers: several times each (some randomness, so the answers differ), and once plainly for
    // the held-back questions (the before score).
    const cand = qs.map(() => []), before = new Map();
    let srv = await fx.serve(learner.gguf, signal);
    try {
      for (let i = 0; i < qs.length; i++) {
        if (held.has(i)) before.set(i, await fx.chat(srv.url, qs[i].messages, { temperature: 0, signal }));
        else for (let k = 0; k < p.answers; k++) cand[i].push(await fx.chat(srv.url, qs[i].messages, { temperature: TEMP, seed: 1000 + k, signal }));
        progress(5 + (45 * (i + 1)) / qs.length, `${p.learner.name} answers: question ${i + 1} of ${qs.length}`);
      }
    } finally { srv.stop(); }
    set('answers', 'done'); set('judge', 'running');
    // 2. The big brain judges (or the checker marks), and writes its own answer where none was good enough.
    const rows = [], bestRows = [], pairRows = [];
    let checked = 0, judged = 0, unreadable = 0, rescued = 0, heldScore = 0, heldN = 0;
    const score = async (url, q, list) => {
      if (p.key && q.key && checkable(q.key)) { checked++; return list.map((a) => checkAnswer(a, q.key)); }
      const s = await steadyScores(async (l) => parseScores(await fx.chat(url, judgeMessages(q, l, { key: p.key ? q.key.slice(0, 2000) : '' }), { temperature: 0, maxTokens: 120, signal }), l.length), list);
      if (s) judged++; else unreadable++;
      return s;
    };
    srv = await fx.serve(judge.gguf, signal);
    try {
      for (let i = 0; i < qs.length; i++) {
        const q = qs[i];
        if (held.has(i)) { const s = await score(srv.url, q, [before.get(i)]); if (s) { heldScore += s[0]; heldN++; } rows.push({ i, held: true, before: before.get(i), score: s?.[0] ?? null }); }
        else {
          const s = await score(srv.url, q, cand[i]);
          if (!s) { rows.push({ i, answers: cand[i], scores: null }); continue; }
          const pk = pick(s);
          let best = cand[i][pk.best], from = 'own';
          if (!pk.good && p.rescue) { best = await fx.chat(srv.url, q.messages, { temperature: 0, signal }); from = 'judge'; rescued++; }
          if (pk.good || from === 'judge') bestRows.push({ messages: [...q.messages, { role: 'assistant', content: best }] });
          if (pk.pair) pairRows.push({ messages: q.messages, chosen: cand[i][pk.best], rejected: cand[i][pk.worst] });
          rows.push({ i, answers: cand[i], scores: s, best: pk.best, worst: pk.worst, from });
        }
        progress(50 + (25 * (i + 1)) / qs.length, `${p.judge.name} judges: question ${i + 1} of ${qs.length}`);
      }
    } finally { srv.stop(); }
    jsonl(path.join(data, 'answers.jsonl'), rows.map((x) => ({ ...x, question: qs[x.i].messages[qs[x.i].messages.length - 1].content })));
    const bestFile = path.join(data, 'best.jsonl'), pairsFile = path.join(data, 'pairs.jsonl');
    jsonl(bestFile, bestRows); jsonl(pairsFile, pairRows);
    const scored = rows.filter((x) => x.scores);
    const avgAll = scored.length ? Math.round((10 * scored.reduce((a, x) => a + x.scores.reduce((m, v) => m + v, 0) / x.scores.length, 0)) / scored.length) : null;
    const avgBest = scored.length ? Math.round((10 * scored.reduce((a, x) => a + x.scores[x.best], 0)) / scored.length) : null;
    const examples = scored.filter((x) => x.scores[x.best] - x.scores[x.worst] >= GAP).slice(0, 3).map((x) => ({ question: qs[x.i].messages[qs[x.i].messages.length - 1].content.slice(0, 300), best: x.answers[x.best].slice(0, 600), bestScore: x.scores[x.best], worst: x.answers[x.worst].slice(0, 600), worstScore: x.scores[x.worst] }));
    const report = { asked: qs.length, answers: p.answers, judged, checked, unreadable, taughtBest: bestRows.length, pairs: pairRows.length, rescued, held: held.size, before: { judge: heldN ? Math.round((10 * heldScore) / heldN) : null }, average: avgAll, bestOf: avgBest, examples, way: p.way, judgeName: p.judge.name, targets: p.targets };
    if (unreadable) log(`${unreadable} judgements couldn't be read as scores`);
    set('judge', 'done');
    const useBest = p.way !== 'pairs', usePairs = p.way !== 'best';
    if (useBest && !bestRows.length && !(usePairs && pairRows.length)) throw new Error('None of the answers scored well enough to teach, and there were no pairs. Try more answers per question, or let the judge write its own.');
    if (!useBest && !pairRows.length) throw new Error('No pair of answers was far enough apart to teach from. Try more answers per question, or Best of its own.');

    if (!here) {
      set('plan', 'running');
      const saved = await saveTeachPlan(lab, { name: p.name, brain: c.weights?.kind ? c.weights : { kind: 'lab', id: learner.id }, lessons: { kind: 'local', value: bestFile } });
      set('plan', 'done');
      return { ...report, forgePlan: saved.file, line: saved.line };
    }

    set('teach', 'running');
    const tr = trainerState(lab.cfg, hwOf(lab)), env = { ...process.env, PYTHONIOENCODING: 'utf-8', HF_HUB_DISABLE_TELEMETRY: '1' };
    fs.mkdirSync(work, { recursive: true });
    fs.writeFileSync(path.join(tr.dir, 'teach.py'), TEACH_PY); fs.writeFileSync(path.join(tr.dir, 'fetch.py'), FETCH_PY);
    const base = await fetchBase(lab, p._teach, work, { fx, signal, log, env, tr, progress });
    // 1.5.190 with parts, teach.py --direct changes just those weights (each expert's own slice too) and saves the
    // whole brain; without, it teaches an adapter that's folded in as before.
    const adapter = path.join(work, targets ? 'taught' : 'adapter'), tfile = path.join(data, 'targets.json');
    if (targets) writeJson(tfile, { targets });
    let lastLoss = null, skipped = 0, learned = 0, mods = null, fell = 0, pairWon = null;
    const args = [path.join(tr.dir, 'teach.py'), '--base', base, '--out', adapter, '--epochs', '1',
      ...(useBest && bestRows.length ? ['--lessons', bestFile] : []), ...(usePairs && pairRows.length ? ['--pairs', pairsFile] : []), ...(targets ? ['--targets', tfile, '--direct'] : [])];
    await fx.tool(tr.python, args, { signal, log, env, onLine: (l) => {
      let m;
      if ((m = l.match(/^progress (\d+) (\d+)/))) progress(75 + (12 * Number(m[1])) / Number(m[2]), `Teach: ${m[1]} of ${m[2]}${lastLoss !== null ? `, loss ${lastLoss}` : ''}`);
      else if ((m = l.match(/^loss ([\d.]+)/))) lastLoss = Number(m[1]);
      else if ((m = l.match(/^skipped (\d+)/))) skipped = Number(m[1]);
      else if ((m = l.match(/^targets (\d+) (\d+)/))) { mods = Number(m[1]); fell = Number(m[2]); }
      else if ((m = l.match(/^pairs (\d+) (\d+)/))) pairWon = Number(m[2]);
      else if ((m = l.match(/^done (\d+)/))) learned = Number(m[1]);
    } });
    set('teach', 'done'); set('fold', 'running');
    let beforeFile = learner.gguf, after = path.join(work, `${p.slug}-Q4_K_M.gguf`);
    if (targets) {
      await foldFull(lab, adapter, { [after]: 'Q4_K_M' }, work, 'taught', { fx, signal, log, env, tr });
      fs.rmSync(adapter, { recursive: true, force: true });
      if (p._teach.brain.repo && base.startsWith(work)) fs.rmSync(path.join(work, 'base'), { recursive: true, force: true });
    } else ({ before: beforeFile, after } = await foldAdapter(lab, p._teach, work, base, adapter, { fx, signal, log, env, tr, progress }));
    set('fold', 'done'); set('after', 'running');
    // 3. After: the new brain answers the held-back questions plainly, the judge scores them; then the Quick quiz.
    const afterAns = new Map();
    srv = await fx.serve(after, signal);
    try { for (const i of held) afterAns.set(i, await fx.chat(srv.url, qs[i].messages, { temperature: 0, signal })); } finally { srv.stop(); }
    let aScore = 0, aN = 0;
    srv = await fx.serve(judge.gguf, signal);
    try { for (const i of held) { const s = await score(srv.url, qs[i], [afterAns.get(i)]); if (s) { aScore += s[0]; aN++; } } } finally { srv.stop(); }
    const was = await fx.quiz(lab, learner.gguf || beforeFile, signal).catch((e) => { if (signal.aborted) throw e; log(`before quiz: ${e.message}`); return null; });
    const now = await fx.quiz(lab, after, signal);
    set('after', 'done');
    let sizeGB = 0; try { sizeGB = Math.round((fs.statSync(after).size / 1e9) * 10) / 10; } catch {}
    r.files = { gguf: after }; r.sizeGB = sizeGB;
    const out = { ...report, after: { judge: aN ? Math.round((10 * aScore) / aN) : null }, made: { score: now.score, tps: now.tps }, from: was ? { score: was.score } : null, sizeGB, madeHere: true, lessons: [`best answers judged by ${p.judge.name}`], learned, skipped, loss: lastLoss, ...(targets ? { parts: { modules: mods, fellBack: fell } } : {}), ...(pairWon !== null ? { pairsLeaned: pairWon } : {}) };
    out.saw = bestSaw(out, p);
    writeJson(path.join(data, 'best.json'), { name: p.name, from: learner.name, judge: p.judge.name, way: p.way, ...out, examples: undefined, at: lab.now() });
    return out;
  });
}

// One line on what happened, in words.
export function bestSaw(t, p) {
  const bits = [];
  if (typeof t.before?.judge === 'number' && typeof t.after?.judge === 'number') bits.push(`On the ${t.held} held-back questions, ${p.judge.name} scored it ${t.before.judge} out of 100 before and ${t.after.judge} after.`);
  if (typeof t.average === 'number' && typeof t.bestOf === 'number') bits.push(`Its answers averaged ${t.average}; picking the best of ${t.answers} each time averaged ${t.bestOf}, and that gap is what it was taught.`);
  if (t.parts) bits.push(`Only ${t.parts.modules} parts of the brain changed${t.parts.fellBack ? ` (${t.parts.fellBack} picked parts couldn't be changed on their own, so the block around each one learned instead)` : ''}.`);
  return bits.join(' ');
}

// Use in Bob: the Lab's own Use in Bob, then the card says it was made here and how.
export function useBest(lab, runId) {
  const r = lab.runs.find((x) => x.id === runId && x.kind === 'best');
  if (!r) throw new Error('That isn\'t a brain from the Best answers page.');
  const out = lab.use(runId);
  const file = path.join(labDir(lab.cfg), 'made.json'), list = readJson(file, []);
  const e = list.find((m) => m.id === `lab-${r.slug}`);
  if (e) { e.madeHere = true; e.origin = r.origin || ''; e.lessons = r.report?.lessons || []; e.what = `Taught here from ${r.fromName}'s own best answers, judged by ${r.report?.judgeName || 'a bigger brain'}. ${e.what || ''}`.trim(); writeJson(file, list); }
  return out;
}

export function bestView(lab) {
  const tr = trainerState(lab.cfg, hwOf(lab));
  const brains = lab.brains().map((b) => { let f = null; try { f = inspect(b); } catch {} return { id: b.id, name: b.name, family: b.family || '', paramsB: f?.paramsB || 0, sizeGB: f?.sizeGB || 0, experts: f?.experts || 0, layers: f?.layers || 0 }; });
  return { trainer: { ok: tr.ok, supported: tr.supported, sizeGB: tr.sizeGB, uv: TRAINER.uv }, brains, sets: lessonSets(lab.cfg).map(({ id, name, count }) => ({ id, name, count })), answers: ANSWERS, answersDefault: ANSWERS_DEFAULT, limits: LIMITS, limitDefault: LIMIT_DEFAULT, good: GOOD, gap: GAP, runs: lab.runs.filter((r) => r.kind === 'best').slice(-5).reverse().map((r) => lab.runView(r)) };
}
// What fNRI has for one brain: its scans (with their skills) and the parts lists saved from the viewer.
export function bestParts(lab, brainId) {
  const brain = brainOf(lab, brainId); if (!brain) return { recordings: [], lists: [] };
  const recs = listRecordings(lab.cfg, brain).slice(0, 12).map((r) => { let skills = []; try { skills = readRecording(lab, { brain: brain.id, id: r.id }).skills; } catch {} return { id: r.id, name: r.name, when: r.when, skills }; });
  return { recordings: recs, lists: listTargetFiles(lab.cfg, brain) };
}

export async function bestRoute({ req, p, isLocal, lab, b, send, res }) {
  if (!p.startsWith('/api/lab/best')) return false;
  if (req.method === 'GET' && p === '/api/lab/best') { send(res, 200, bestView(lab)); return true; }
  if (p === '/api/lab/best/parts') { send(res, 200, bestParts(lab, String(b.brain || ''))); return true; }
  if (!isLocal) { send(res, 403, { error: 'This can only be started on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/best/plan') { const x = await planBest(lab, b); const { _teach, weights, ...view } = x; send(res, 200, { ...view, weights: { name: weights.name, paramsB: weights.paramsB, repo: weights.repo } }); return true; }
  if (p === '/api/lab/best/start') { send(res, 200, await startBest(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/best/use') { send(res, 200, useBest(lab, String(b.id || ''))); return true; }
  return false;
}
