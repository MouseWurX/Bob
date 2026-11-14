// 1.5.16x Playground: the long-context lab ("How much can it hold?", thinking-paths.md sec 15.2). Learn 3.4 shows the
// window filling up; this page measures it on a real brain, here, for free:
// - the memory meter (public/lab-context-math.js, drawn by the page as the slider moves),
// - speed against length: one long text read at 1K..128K, with words a second and time to the first word,
// - the needle at every size: a note hidden in the text, asked for at the end, pass or miss per size,
// - stretch the window (YaRN, as Long memory 1.5.150 does), then the same ladder again,
// - what gets forgotten: a 20-turn chat that doesn't fit a small window, asked about its first turn,
// - "Use this in Bob": the size that fits, written into Settings' per-brain size.
// Nothing is rented and nothing is downloaded. Results (small) in <data>/lab/context/<brain>.json.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { labDir, inspect, slugOf } from './lab.js';
import { startServer } from './lab-test.js';
import { ggufInfo } from './gguf.js';
import { saveSettings } from './config.js';
import { CTX_CHOICES } from './sessions.js';
import { ALL_CTX, canStretch, stretchMax, yarnArgs } from './model-ctx.js';
import { ladderTexts } from './lab-playground.js';
import { SQUEEZE, squeezeOf, LENGTHS, STRETCH, kLabel, ladderSizes, keptFrom, fitsAnswer, GiB } from '../public/lab-context-math.js';
import { readJson, writeJson, canStart, makeRoom, runJob, pageLog, chatOnce } from './lab-jobs.js';

export const contextDir = (cfg) => path.join(labDir(cfg), 'context');
const NEEDLES = ['lantern', 'otter', 'copper', 'meadow', 'harbour', 'quartz', 'juniper', 'falcon'];
const DEPTHS = [0.25, 0.5, 0.75];
const FORGET_WINDOW = 2048;

// The 20 turns of the forgetting demo: each one tells the brain one small thing; turn 1's is asked about at the end.
export const FORGET_FACTS = ['my cat is called Pickle', 'my bike is green', 'I was born in March', 'my sister lives in Leeds', 'I play the cello', 'my favourite soup is leek', 'my car is a 2009 estate', 'I am allergic to wasps', 'my house number is 41', 'I collect old maps', 'my boss is called Ines', 'I drink tea without sugar', 'my garden has three apple trees', 'I learned to swim at nine', 'my phone is cracked', 'I prefer trains to planes', 'my dog is scared of hoovers', 'I keep bees', 'my desk faces a window', 'I am saving for a canoe'];
export const FORGET_Q = { q: 'What is my cat called? Answer in a few words.', a: 'pickle' };
export function forgetTurns(pad = '') {
  return FORGET_FACTS.map((f, i) => [{ role: 'user', content: `Turn ${i + 1}. Something about me: ${f}. ${pad}` }, { role: 'assistant', content: `Got it: ${f.replace(/^my /, 'your ').replace(/^I am /, 'you are ').replace(/^I was /, 'you were ').replace(/^I /, 'you ')}. I'll remember that.` }]);
}

// A long text of about `tokens` tokens (Bob's own Help, repeated), with the needle sentence at `depth` (0..1).
// A token is about four letters of English; the run reads back the real count from the engine.
export function haystack(tokens, needle, depth = 0.5, source = null) {
  const t = source || (() => { const x = ladderTexts(); return `${x.tune}\n${x.score}`; })();
  const want = Math.max(200, Math.round(tokens * 3.6));
  let text = '';
  while (text.length < want) text += t + '\n';
  text = text.slice(0, want);
  const at = text.lastIndexOf('\n', Math.round(want * depth)) + 1 || Math.round(want * depth);
  return `${text.slice(0, at)}A note for later: the secret word for the blue door is ${needle}.\n${text.slice(at)}`;
}
export const NEEDLE_Q = 'What is the secret word for the blue door? Answer with the word only.';
export const found = (answer, needle) => new RegExp(`\\b${needle}\\b`, 'i').test(String(answer || ''));

// What the page needs: every brain the Lab sees, with its shape and limit, this machine's card and RAM, past results.
export function contextView(lab) {
  const cardGB = Number(lab.cfg.gpuVramGB) || Number(lab.cfg.cardGB) || 0;
  const brains = lab.brains().map((b) => {
    let info = null, f = null; try { info = ggufInfo(b.gguf); f = inspect(b); } catch {}
    let bytes = 0; try { bytes = fs.statSync(b.gguf).size; } catch {}
    return { id: b.id, name: b.name, max: info?.ctxTrain || null, perToken: info?.shape?.perToken || 0, memLayers: info?.shape?.memLayers || 0, layers: info?.shape?.layers || 0, fileBytes: bytes, sizeGB: f?.sizeGB || Math.round((bytes / GiB) * 10) / 10, bobStretch: canStretch(info), stretchMost: stretchMax(info) };
  }).filter((b) => b.fileBytes > 0);
  return { brains, cardBytes: cardGB * GiB, ramBytes: os.totalmem(), squeeze: SQUEEZE, lengths: LENGTHS, stretch: STRETCH, runs: readRuns(lab.cfg), forgetWindow: FORGET_WINDOW };
}
function readRuns(cfg) {
  const dir = contextDir(cfg);
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch {}
  return files.flatMap((f) => readJson(path.join(dir, f), [])).sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 12);
}

export function planContext(lab, c = {}) {
  const v = contextView(lab), problems = [], notes = [];
  const b = v.brains.find((x) => x.id === String(c.brain || ''));
  if (!b) return { problems: ['Pick a brain.'], notes };
  const stretch = STRETCH.includes(Number(c.stretch)) ? Number(c.stretch) : 1;
  const squeeze = squeezeOf(c.squeeze).id;
  const sizes = ladderSizes(b.max, stretch).filter((s) => s.ok && [].concat(c.sizes || LENGTHS).map(Number).includes(s.n)).map((s) => s.n);
  if (!sizes.length) problems.push('Tick at least one size this brain can read.');
  if (!b.max) notes.push(`Bob couldn't read the longest text ${b.name} was made for, so the ladder stops at ${kLabel(32768)} unless you stretch it.`);
  if (stretch > 1) notes.push(`Stretched ${stretch}x: ${b.name}'s positions are spread out so it can read up to ${kLabel((b.max || 32768) * stretch)}. Stretching trades a little sharpness everywhere for reach; compare the needle results with a plain run.`);
  const top = Math.max(...sizes, c.forget ? 8192 : 0);
  const fit = fitsAnswer({ name: b.name, fileBytes: b.fileBytes, perToken: b.perToken, max: null, squeeze, cardBytes: v.cardBytes, ramBytes: v.ramBytes });
  if (b.perToken && fit.all && top > fit.all) problems.push(`${kLabel(top)} won't fit next to ${b.name} on this replicant matrix (it holds about ${kLabel(fit.all)}). Untick the biggest sizes or pick a smaller cache.`);
  else if (b.perToken && fit.card && top > fit.card) notes.push(`From ${kLabel(fit.card * 2)} up, part of it runs from RAM, so the speed drop you see there is the spill as well as the length.`);
  if (!lab.tools().server.found) problems.push(`${path.basename(lab.tools().server.path)} isn't in Bob's engine folder. Settings > Engines: the built-in engine has it.`);
  const minutes = Math.max(1, Math.round(sizes.reduce((a, n) => a + n / 1500, 0) / 60));
  notes.push(`About ${minutes} minute${minutes === 1 ? '' : 's'} on a fast card; much longer if it spills into RAM.`);
  return { brain: b, sizes, stretch, squeeze, forget: c.forget === true, top, problems, notes };
}

export async function startContext(lab, c = {}, { unload = false } = {}) {
  canStart(lab);
  const p = planContext(lab, c);
  if (p.problems.length) throw new Error(p.problems[0]);
  const ask = await makeRoom(lab, unload); if (ask) return ask;
  const brain = lab.brains().find((x) => x.id === p.brain.id);
  const log = pageLog(lab.cfg, 'context');
  const fx = { serve: (o) => startServer({ exe: lab.tools().server.path, log, ...o }), chat: chatOnce, tokens: countTokens, ...lab.stepFns };
  const steps = [['start', `Start ${p.brain.name}${p.stretch > 1 ? `, stretched ${p.stretch}x` : ''}`], ...p.sizes.map((n) => [`n${n}`, `Read ${kLabel(n)} and find the note`]), ...(p.forget ? [['forget', 'A 20-turn chat in a 2K window']] : [])];
  return runJob(lab, { kind: 'context', name: `How much can ${p.brain.name} hold?`, from: p.brain.id, fromName: p.brain.name, steps }, async (r, { set, signal, progress }) => {
    set('start', 'running');
    const t = squeezeOf(p.squeeze).type;
    const native = p.brain.max || 32768;
    const ctx = Math.max(p.top, p.forget ? 8192 : 0) + 1024;
    const args = ['-fa', 'on', '-ctk', t, '-ctv', t, ...(p.stretch > 1 ? yarnArgs(native * p.stretch, native) : [])];
    const srv = await fx.serve({ gguf: brain.gguf, ctx, args, signal });
    const rows = [];
    const rec = { at: lab.now(), when: new Date(lab.now()).toISOString().slice(0, 10), brain: { id: p.brain.id, name: p.brain.name, max: p.brain.max }, stretch: p.stretch, squeeze: p.squeeze, where: srv.where, rows, forget: null };
    try {
      set('start', 'done');
      for (let i = 0; i < p.sizes.length; i++) {
        const n = p.sizes[i], needle = NEEDLES[i % NEEDLES.length], depth = DEPTHS[i % DEPTHS.length];
        set(`n${n}`, 'running');
        const hay = haystack(n, needle, depth);
        const a = await fx.chat(srv.url, [{ role: 'user', content: `${hay}\n\n${NEEDLE_Q}` }], { maxTokens: 24, cache: true, signal });
        progress((100 * (i + 0.6)) / (p.sizes.length + (p.forget ? 1 : 0)));
        const w = await fx.chat(srv.url, [{ role: 'user', content: `${hay}\n\nNow write about 100 words on why rivers bend.` }], { maxTokens: 160, cache: true, signal });
        rows.push({ n, label: kLabel(n), tokens: Number(a.timings.prompt_n) || null, firstWordS: a.timings.prompt_ms ? Math.round(a.timings.prompt_ms / 100) / 10 : null, readTps: Math.round(Number(a.timings.prompt_per_second) || 0) || null, writeTps: Math.round((Number(w.timings.predicted_per_second) || 0) * 10) / 10 || null, found: found(a.text, needle), depth: Math.round(depth * 100), answer: a.text.slice(0, 80), past: Boolean(p.brain.max) && n > p.brain.max });
        set(`n${n}`, 'done');
      }
      if (p.forget) {
        set('forget', 'running');
        rec.forget = await forgetDemo(srv.url, fx, signal);
        set('forget', 'done');
      }
    } finally { srv.stop(); }
    rec.saw = contextSaw(rec);
    const file = path.join(contextDir(lab.cfg), `${slugOf(p.brain.id)}.json`);
    writeJson(file, [rec, ...readJson(file, [])].slice(0, 10));
    return { context: rec, saw: rec.saw };
  });
}

// llama-server's own token count for a piece of text.
async function countTokens(url, content, signal) {
  const res = await fetch(url + '/tokenize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }), signal: AbortSignal.any([signal, AbortSignal.timeout(30e3)]) });
  const j = await res.json();
  return (j.tokens || []).length;
}

// The forgetting demo: 20 turns with a little padding so they outgrow a 2K window; asked with the whole chat, then
// with only what fits the window (the newest turns, as any brain sees a chat that's too long).
export async function forgetDemo(url, fx, signal) {
  const pad = 'Here is some small talk to fill the chat a little, the way real chats ramble about the weather, the week and what is for dinner, before getting to the point.';
  const turns = forgetTurns(pad);
  const sizes = [];
  for (const [u, a] of turns) sizes.push((await fx.tokens(url, u.content, signal)) + (await fx.tokens(url, a.content, signal)) + 10);
  const from = keptFrom(sizes, FORGET_WINDOW, 300);
  const all = await fx.chat(url, [...turns.flat(), { role: 'user', content: FORGET_Q.q }], { maxTokens: 30, signal });
  const kept = await fx.chat(url, [...turns.slice(from).flat(), { role: 'user', content: FORGET_Q.q }], { maxTokens: 30, signal });
  return { window: FORGET_WINDOW, turns: turns.length, keptFrom: from + 1, totalTokens: sizes.reduce((a, b) => a + b, 0), whole: { text: all.text.slice(0, 160), right: all.text.toLowerCase().includes(FORGET_Q.a) }, windowed: { text: kept.text.slice(0, 160), right: kept.text.toLowerCase().includes(FORGET_Q.a) } };
}

// The line under the results, in plain words.
export function contextSaw(rec) {
  const rows = rec.rows || [];
  if (!rows.length) return '';
  const a = rows[0], z = rows[rows.length - 1];
  const parts = [];
  if (a.writeTps && z.writeTps && rows.length > 1) parts.push(`Writing went from ${a.writeTps} words a second at ${a.label} to ${z.writeTps} at ${z.label}${z.firstWordS ? `, and the first word took ${z.firstWordS} s to arrive at ${z.label}` : ''}.`);
  const miss = rows.filter((x) => !x.found);
  parts.push(miss.length ? `It missed the note at ${miss.map((x) => x.label).join(', ')}.` : 'It found the note at every size.');
  if (rec.stretch > 1) parts.push(`This run was stretched ${rec.stretch}x; run it plain to see what stretching cost at the short sizes.`);
  if (rec.forget) parts.push(rec.forget.whole.right && !rec.forget.windowed.right ? `With the whole chat it remembered the cat; in a 2K window turns 1 to ${rec.forget.keptFrom - 1} fell off the end and it couldn't.` : rec.forget.windowed.right ? 'It still remembered the cat in the small window, so the first turn fitted this time.' : 'It didn\'t remember the cat even with the whole chat.');
  return parts.join(' ');
}

// Use this in Bob: the picked size (or the biggest that fits on the card) becomes Settings' size for this brain.
// Sizes past what the brain was made for are only kept for brains Bob's Long memory covers, and switch it on.
export function useContext(lab, c = {}) {
  const v = contextView(lab);
  const b = v.brains.find((x) => x.id === String(c.brain || ''));
  if (!b) throw new Error('Pick a brain.');
  let want = Number(c.ctx) || 0;
  if (!want) want = fitsAnswer({ name: b.name, fileBytes: b.fileBytes, perToken: b.perToken, max: b.max, squeeze: 'half', cardBytes: v.cardBytes, ramBytes: v.ramBytes }).card;
  const stretchOk = b.bobStretch;
  // 1.5.167: stretched only as far as Long memory takes that brain (Qwen3.5/3.6 to 1M, Qwen3 to 128K; 1.5.158).
  const choices = stretchOk && b.stretchMost ? ALL_CTX.filter((x) => (!b.max || x <= b.max) || x <= b.stretchMost) : CTX_CHOICES.filter((x) => !b.max || x <= b.max);
  const pick = choices.filter((x) => x <= want).pop();
  if (!pick) throw new Error(`${b.name} needs at least ${kLabel(CTX_CHOICES[0])} to be useful, and that doesn't fit here.`);
  const stretched = Boolean(b.max) && pick > b.max;
  saveSettings(lab.cfg, { brainCtxOn: true, brainCtx: { ...(lab.cfg.brainCtx || {}), [b.id]: pick }, ...(stretched ? { brainCtxStretch: true } : {}) });
  return { ctx: pick, label: kLabel(pick), line: `${b.name} now keeps ${kLabel(pick)} in mind. It's in Settings, How Bob works, Brains, "Context size per brain"${stretched ? ', and Long memory is on for it' : ''}. It applies the next time it loads.` };
}

export async function contextRoute({ req, p, isLocal, lab, b, send, res }) {
  if (!p.startsWith('/api/lab/context')) return false;
  if (req.method === 'GET' && p === '/api/lab/context') { send(res, 200, contextView(lab)); return true; }
  if (p === '/api/lab/context/plan') { const x = planContext(lab, b); send(res, 200, { problems: x.problems, notes: x.notes, sizes: x.sizes || [] }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Lab jobs can only be started on this replicant matrix itself for now.' }); return true; }
  if (p === '/api/lab/context/start') { send(res, 200, await startContext(lab, b, { unload: b.unload === true })); return true; }
  if (p === '/api/lab/context/use') { send(res, 200, useContext(lab, b)); return true; }
  return false;
}
