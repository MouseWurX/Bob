// 1.5.154 The usage map (bob-design/blend-and-cut-recipes.md section 1, the owner's ask of 8 Nov: "determine experts
// that are used and not used for things tested for"). Pick a brain and what to test it on: the Lab quiz part by part,
// your chats with Bob, a lesson set (one count per skill), or a file or folder of your own text. Bob reads each one
// through llama-imatrix, which counts how many words every expert in every layer handled, and writes the result in
// the format the Lab's Peek inside shares (bob-design/cs-lab-learn-and-tinker.md section 5):
//   <brain>-keep.json   the Lab keep file: experts used on anything tested, per layer, padded to one size
//   peek-counts.json    brain {name, sha256, experts, expertUsed, layers}, when, engine, total (layers x experts) and
//                       things [{name, source, tokens, counts}], plain integers, the orientation keep.py reads
// From those it lists, in words, the cold experts (no words at all), the faint ones (the last 5% of the work) and the
// ones only one thing uses, and how much of each thing a cut to N experts keeps. With Brain Engine it can try the
// brain with the cold and faint ones switched off and give the Lab test again, before any file is written.
// It's a Lab job like a cut: free, on this replicant matrix, one at a time, never while Gaming is on.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { readCounts, coverageKeep } from './lab-gguf.js';
import { QUIZ, TOOLS, PARTS } from './lab-test.js';
import { labOn, labDir, lessonSkills, lessonSets, slugOf, sha256File, inspect, cutSizes, maskFor } from './lab.js';
import { gaming } from './sessions.js';

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v)); fs.renameSync(f + '.part', f); };
export const usageDir = (cfg) => path.join(labDir(cfg), 'usage');
export const usageFolder = (cfg, brain) => path.join(usageDir(cfg), slugOf(brain.id || brain.name));
export const peekFile = (cfg, brain) => path.join(usageFolder(cfg, brain), 'peek-counts.json');
export const keepFileOf = (cfg, brain) => path.join(usageFolder(cfg, brain), `${slugOf(brain.name)}-keep.json`);
export const readPeek = (cfg, brain) => readJson(peekFile(cfg, brain), null);
const TEXT_EXT = /\.(txt|md|markdown|rst|html?|css|js|mjs|cjs|ts|tsx|jsx|json|jsonl|py|c|cc|cpp|h|hpp|cs|java|kt|kts|rs|go|rb|php|lua|sh|ps1|bat|cmd|sql|xml|yaml|yml|toml|ini|cfg|uproject|uplugin|gd|swift|m|mm)$/i;
export const MAX_TEXT = 4 << 20; // 4 MB of text per thing is plenty to see which experts it wakes

// What the page can offer as things to test on.
export function usageOptions(cfg) {
  const sets = lessonSets(cfg).map((s) => ({ id: `set:${s.id}`, label: `Lesson set: ${s.name}`, hint: `${s.count} lessons, one count for each skill in it.` }));
  return [
    ...Object.entries(PARTS).map(([k, label]) => ({ id: `quiz:${k}`, label: `The Lab test: ${label}`, hint: 'The questions of that part of the Lab test. They\'re short, so they\'re read several times over: the map shows which experts they use, not how much.' })),
    { id: 'chats', label: 'My chats with Bob', hint: 'Everything you and Bob have said in your saved chats.' },
    ...sets,
    { id: 'path', label: 'A file or folder of my own', hint: 'Text, documents in plain text, or code: what does it use when it reads your project? Only on this replicant matrix.', local: true }
  ];
}

// The quiz part as the brain sees it (Qwen's chat layout), the tool list included for the tools part.
function quizText(part) {
  const list = QUIZ[part] || [];
  const sys = part === 'tools' ? `<|im_start|>system\nYou can call these tools:\n${JSON.stringify(TOOLS)}<|im_end|>\n` : '';
  return list.map(([q]) => `${sys}<|im_start|>user\n${q}<|im_end|>\n<|im_start|>assistant\n`).join('\n');
}

function walkText(root, out = [], budget = { left: MAX_TEXT }, depth = 0) {
  if (budget.left <= 0 || depth > 4) return out;
  let st; try { st = fs.statSync(root); } catch { return out; }
  if (st.isFile()) {
    if (!TEXT_EXT.test(root) || st.size > MAX_TEXT) return out;
    try { const t = fs.readFileSync(root, 'utf8').slice(0, budget.left); budget.left -= t.length; out.push(t); } catch {}
    return out;
  }
  let names = []; try { names = fs.readdirSync(root); } catch { return out; }
  for (const n of names.sort()) {
    if (n.startsWith('.') || ['node_modules', 'AppData', 'Binaries', 'Intermediate', 'DerivedDataCache', 'Saved', '__pycache__', 'dist', 'build'].includes(n)) continue;
    walkText(path.join(root, n), out, budget, depth + 1);
    if (budget.left <= 0) break;
  }
  return out;
}

// The things a request asks for, as [{ name, text }]: one per quiz part, one for chats, one per skill in a lesson
// set, one for a file or folder. Throws with a plain reason when a thing has no text.
export function thingTexts(cfg, ids = [], { file = '' } = {}) {
  const out = [];
  for (const id of [...new Set(ids)].slice(0, 12)) {
    if (id.startsWith('quiz:') && QUIZ[id.slice(5)]) out.push({ name: PARTS[id.slice(5)], text: quizText(id.slice(5)), short: true });
    else if (id === 'chats') { const t = [...lessonSkills(cfg, { kind: 'chats' }).values()].flat().join('\n'); if (t) out.push({ name: 'Your chats', text: t.slice(0, MAX_TEXT) }); else throw new Error('There are no saved chats with Bob to count on yet.'); }
    else if (id.startsWith('set:')) {
      const set = lessonSets(cfg).find((s) => s.id === id.slice(4));
      if (!set) throw new Error('That lesson set isn\'t here any more.');
      for (const [skill, parts] of lessonSkills(cfg, { kind: 'file', file: set.file })) out.push({ name: skill, text: parts.join('\n').slice(0, MAX_TEXT) });
    } else if (id === 'path') {
      const p = String(file || '').trim().replace(/^"|"$/g, '');
      if (!p || !fs.existsSync(p)) throw new Error('Pick a file or folder that\'s on this replicant matrix.');
      const t = walkText(p).join('\n\n');
      if (t.length < 2000) throw new Error('That file or folder has too little text Bob can read (plain text and code files; Word and PDF files need saving as text first).');
      out.push({ name: path.basename(p) || p, text: t });
    }
  }
  return out;
}

// The counter's context and chunk count for a text of this length (about 4 characters a word-piece). A short text
// is repeated until the counter has enough to read; the counts then show which experts, not how much.
export function countShape(text, maxChunks = 200) {
  const guess = text.length / 4;
  const ctx = guess < 8192 ? 512 : guess < 65536 ? 2048 : 4096;
  let t = text;
  while (t.length / 4 < 2 * ctx) t += '\n' + text;
  return { text: t, ctx, chunks: Math.max(1, Math.min(maxChunks, Math.floor(t.length / 4 / ctx))), repeated: t !== text };
}

const ints = (counts) => counts.map((row) => (row ? row.map((v) => Math.round(v)) : null));
const sumRows = (a, b) => a.map((row, i) => (row || b[i] ? (row || b[i].map(() => 0)).map((v, e) => v + ((b[i] || [])[e] || 0)) : null));

// Merge new things into peek-counts.json (same brain file only). Things from Peek inside (source "peek") stay.
export function mergePeek(old, { brain, things, engine, when }) {
  const keepOld = old && old.brain?.sha256 === brain.sha256 ? old.things.filter((t) => !things.some((n) => n.name === t.name && (n.source || 'imatrix') === (t.source || 'imatrix'))) : [];
  const all = [...keepOld, ...things];
  const L = Math.max(...all.map((t) => t.counts.length));
  let total = Array.from({ length: L }, () => null);
  for (const t of all) total = sumRows(total, t.counts);
  return { brain, when, engine, source: [...new Set(all.map((t) => t.source || 'imatrix'))].join(','), total, things: all };
}

// The Lab keep file from the tally: every expert used on anything tested, per layer, padded to one size (a GGUF has
// one expert count for every layer) with the busiest of the rest.
export function keepFromPeek(peek, name) {
  const rows = peek.total.map((r) => (r ? r.map((v, e) => [v, e]) : null));
  const K = Math.max(peek.brain.expertUsed || 1, ...rows.filter(Boolean).map((r) => r.filter(([v]) => v > 0).length));
  const layers = rows.map((r) => (r ? r.sort((a, b) => b[0] - a[0] || a[1] - b[1]).slice(0, K).map(([, e]) => e).sort((a, b) => a - b) : null));
  const tokens = peek.things.reduce((a, t) => a + (t.tokens || 0), 0);
  return { name, experts: K, layers, source: [...new Set(peek.things.map((t) => t.source || 'imatrix'))].join(','), things: peek.things.map((t) => t.name), tokens, brain: { name: peek.brain.name, sha256: peek.brain.sha256 } };
}

// Cold, faint and only-for lists, the per-layer table and the kept share at a few sizes. faint = the experts that
// together do the last `faint` share of a layer's work (the ones a 95% cut drops first).
export function usageLists(peek, { faint = 0.05, sizes = [] } = {}) {
  const E = peek.brain.experts || Math.max(...peek.total.filter(Boolean).map((r) => r.length));
  const layers = [];
  let cold = 0, weak = 0, count = 0;
  for (let li = 0; li < peek.total.length; li++) {
    const row = peek.total[li]; if (!row) continue;
    count++;
    const t = row.reduce((a, b) => a + b, 0) || 1;
    const c = row.map((v, e) => [v, e]).filter(([v]) => v === 0).map(([, e]) => e);
    const order = row.map((v, e) => [v, e]).filter(([v]) => v > 0).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const f = []; let s = 0;
    for (const [v, e] of order) { if ((s + v) / t > faint) break; s += v; f.push(e); }
    cold += c.length; weak += f.length;
    layers.push({ layer: li, used: E - c.length, cold: c, faint: f.sort((a, b) => a - b) });
  }
  // Only for X: at least 1% of that thing's work in the layer, under 0.1% of every other thing's.
  const onlyFor = peek.things.length < 2 ? [] : peek.things.map((th, ti) => {
    const per = [];
    for (let li = 0; li < peek.total.length; li++) {
      const r = th.counts[li]; if (!r) continue;
      const t = r.reduce((a, b) => a + b, 0) || 1;
      const others = peek.things.filter((_, j) => j !== ti).map((o) => { const x = o.counts[li] || []; return { x, t: x.reduce((a, b) => a + b, 0) || 1 }; });
      const ids = r.map((v, e) => e).filter((e) => r[e] / t >= 0.01 && others.every((o) => (o.x[e] || 0) / o.t < 0.001));
      if (ids.length) per.push({ layer: li, experts: ids });
    }
    return { name: th.name, total: per.reduce((a, p) => a + p.experts.length, 0), layers: per };
  });
  // How much of each thing's work a cut keeps (the busiest N overall, each thing weighed the same).
  const kept = sizes.filter((n) => n > 0 && n < E).map((n) => {
    const cov = coverageKeep(peek.things.map((t) => ({ name: t.name, counts: t.counts })), { keep: n, cover: 0, min: 1 });
    return { keep: n, things: cov.shares.map((x) => ({ name: x.name, average: Math.round(1000 * x.average) / 10, worst: Math.round(1000 * x.worst) / 10, worstLayer: x.worstLayer })) };
  });
  const all = count * E || 1;
  return { experts: E, layers: count, cold, faint: weak, coldShare: Math.round((1000 * cold) / all) / 10, faintShare: Math.round((1000 * weak) / all) / 10, perLayer: layers, onlyFor, kept };
}

// What the page shows for one brain: the things measured so far and the lists.
export function usageView(cfg, brain, facts) {
  const peek = readPeek(cfg, brain);
  if (!peek?.things?.length) return { brain: brain.id, have: false };
  const sizes = facts ? cutSizes(facts).map((c) => c.keep) : [];
  const lists = usageLists(peek, { sizes: sizes.slice(0, 4) });
  return { brain: brain.id, have: true, when: peek.when, engine: peek.engine, things: peek.things.map((t) => ({ name: t.name, source: t.source || 'imatrix', tokens: t.tokens })), lists, files: ['peek-counts.json', path.basename(keepFileOf(cfg, brain))], tried: peek.tried || null };
}

function run(exe, args, { signal, log }) {
  return new Promise((resolve, reject) => {
    log(`${path.basename(exe)} ${args.join(' ')}`);
    const c = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
    let tail = '';
    c.stderr.on('data', (d) => { tail = (tail + d).slice(-4000); });
    const stop = () => { try { c.kill(); } catch {} };
    signal?.addEventListener('abort', stop, { once: true });
    c.once('error', (e) => reject(new Error(`Couldn't start ${path.basename(exe)}: ${e.message}`)));
    c.once('exit', (code) => { signal?.removeEventListener('abort', stop); if (signal?.aborted) reject(new Error('Stopped.')); else if (code === 0) resolve(); else { log(tail); reject(new Error(`${path.basename(exe)} stopped: ${tail.trim().split('\n').slice(-1)[0] || `code ${code}`}`)); } });
  });
}

// Default steps (tests swap in fakes through lab.stepFns: usageCount returns counts per layer, fingerprint a hash).
function usageSteps(lab, log) {
  const tools = lab.tools();
  return {
    fingerprint: (gguf, signal) => sha256File(gguf, signal),
    usageCount: async (s, { brain, signal }) => {
      const args = ['-m', brain.gguf, '-f', s.corpus, '-o', s.counts, '-c', String(s.ctx), '--chunks', String(s.chunks)];
      await run(tools.imatrix.path, [...args, '--fit', 'on'], { signal, log }).catch((e) => { if (signal.aborted) throw e; return run(tools.imatrix.path, [...args, '-ngl', '0'], { signal, log }); });
      return readCounts(s.counts);
    }
  };
}

// Start a usage job. req = { brain, things: [ids], file, chunks, tryWithout }.
export async function startUsage(lab, req = {}, { unload = false, isLocal = true } = {}) {
  const cfg = lab.cfg;
  if (!labOn(cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
  const room = lab.room(); if (!room.ok) throw new Error(room.why);
  if (lab.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
  if (gaming(cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
  const brain = lab.brains().find((b) => b.id === req.brain);
  if (!brain) throw new Error('Pick a brain to measure.');
  const facts = inspect(brain);
  if (!facts?.experts) throw new Error(`${brain.name} isn't a mixture-of-experts brain, so there are no experts to count.`);
  const ids = [].concat(req.things || []).map(String).filter((id) => isLocal || id !== 'path');
  if (!ids.length) throw new Error('Tick at least one thing to test it on.');
  const tools = lab.tools();
  if (!tools.imatrix.found && !lab.stepFns.usageCount) throw new Error(`${path.basename(tools.imatrix.path)} isn't in the built-in engine's folder. Get models, Engines: the built-in engine has it; download the engine again if it's missing.`);
  const tryWithout = req.tryWithout === true;
  if (tryWithout && !tools.brainEngine.found && !lab.stepFns.try) throw new Error('Trying without the cold and faint experts needs Brain Engine, the Lab\'s engine. It isn\'t ready yet. Untick it for now.');
  const things = thingTexts(cfg, ids, { file: req.file });
  if (lab.brain?.engine?.loaded) {
    const loaded = (await lab.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
    if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
    if (loaded.length) await lab.brain.engine.unloadAll().catch(() => {});
  }
  const steps = [{ id: 'fingerprint', label: `Fingerprint ${brain.name}` }, ...things.map((t) => ({ id: 'count', label: `Count which experts ${t.name} uses`, thing: t.name })), ...(tryWithout ? [{ id: 'try', label: 'Try it without the cold and faint experts' }] : [])];
  const r = { id: `lab-${lab.now().toString(36)}`, kind: 'usage', name: `Usage map of ${brain.name}`, from: brain.id, fromName: brain.name, fromGB: facts.sizeGB, state: 'running', at: lab.now(), steps: steps.map((s) => ({ id: s.id, label: s.label, state: 'waiting' })), progress: 0 };
  lab.runs.push(r); lab.save();
  const ac = new AbortController();
  lab.job = { run: r, ac };
  goUsage(lab, r, { brain, facts, things, steps, chunks: Math.max(10, Math.min(400, Number(req.chunks) || 200)) }, ac.signal).catch(() => {});
  return { started: lab.runView(r) };
}

async function goUsage(lab, r, { brain, facts, things, steps, chunks }, signal) {
  const cfg = lab.cfg, dir = usageFolder(cfg, brain);
  fs.mkdirSync(dir, { recursive: true });
  const log = (t) => { try { fs.appendFileSync(path.join(dir, 'usage.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
  const fx = { ...lab.defaultSteps(lab.tools(), log), ...usageSteps(lab, log), ...lab.stepFns };
  const counted = []; let sha = '', repeated = [];
  try {
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i], t0 = Date.now();
      r.step = s.id; r.stepLabel = s.label; r.steps[i].state = 'running'; r.progress = Math.round((100 * i) / steps.length); lab.tell(r);
      if (s.id === 'fingerprint') sha = await fx.fingerprint(brain.gguf, signal);
      else if (s.id === 'count') {
        const th = things.find((x) => x.name === s.thing);
        const shape = countShape(th.text, chunks);
        if (shape.repeated || th.short) repeated.push(th.name);
        const corpus = path.join(dir, `text-${slugOf(th.name)}.txt`), counts = path.join(dir, `counts-${slugOf(th.name)}.gguf`);
        fs.writeFileSync(corpus, shape.text);
        const c = await fx.usageCount({ corpus, counts, ctx: shape.ctx, chunks: shape.chunks, thing: th.name }, { brain, signal });
        try { fs.rmSync(corpus, { force: true }); } catch {}
        if (!c?.filter(Boolean).length) throw new Error('llama-imatrix gave no per-expert counts. The built-in engine may be too old for that; update it in Get models, Engines.');
        const n = ints(c);
        const first = n.find(Boolean) || [];
        counted.push({ name: th.name, source: 'imatrix', tokens: Math.round(first.reduce((a, b) => a + b, 0) / (facts.used || 1)), counts: n });
      } else if (s.id === 'try') {
        const peek = mergePeek(readPeek(cfg, brain), { brain: { name: brain.name, sha256: sha, experts: facts.experts, expertUsed: facts.used, layers: facts.layers }, things: counted, engine: 'llama.cpp', when: '' });
        const lists = usageLists(peek);
        const off = new Map(lists.perLayer.map((l) => [l.layer, new Set([...l.cold, ...l.faint])]));
        const keep = peek.total.map((row, li) => (row ? row.map((_, e) => e).filter((e) => !off.get(li)?.has(e)) : null));
        for (const k of keep) if (k && k.length < facts.used) throw new Error('Switching the cold and faint experts off would leave too few in a layer for this brain to run.');
        const t = await fx.try({ gguf: brain.gguf }, { keep: maskFor(keep, facts), signal, onProgress: (x) => { r.progress = Math.round(100 * x); lab.broadcast({ type: 'lab', run: lab.runView(r) }); } });
        r.report = { ...(r.report || {}), tried: { full: t.full.score, masked: t.masked.score, off: lists.cold + lists.faint } };
      }
      r.steps[i].state = 'done'; r.steps[i].ms = Date.now() - t0; lab.tell(r);
    }
    const when = new Date(lab.now()).toISOString().slice(0, 10);
    const peek = mergePeek(readPeek(cfg, brain), { brain: { name: brain.name, sha256: sha, experts: facts.experts, expertUsed: facts.used, layers: facts.layers }, things: counted, engine: 'llama.cpp', when });
    if (r.report?.tried) peek.tried = r.report.tried;
    writeJson(peekFile(cfg, brain), peek);
    writeJson(keepFileOf(cfg, brain), keepFromPeek(peek, brain.name));
    const lists = usageLists(peek);
    r.report = { ...(r.report || {}), usage: { things: peek.things.length, cold: lists.cold, faint: lists.faint, coldShare: lists.coldShare } };
    if (repeated.length) r.notes = [`${repeated.join(', ')} ${repeated.length > 1 ? 'were' : 'was'} short, so Bob read ${repeated.length > 1 ? 'them' : 'it'} several times over. The map shows which experts ${repeated.length > 1 ? 'they use' : 'it uses'}, not how much.`];
    r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
    lab.tell(r);
    lab.broadcast({ type: 'lab-done', name: r.name, ok: true });
  } catch (e) {
    r.state = signal.aborted ? 'stopped' : 'failed'; r.error = signal.aborted ? 'You stopped it. Nothing was saved.' : e.message;
    const i = r.steps.findIndex((x) => x.state === 'running'); if (i >= 0) r.steps[i].state = 'failed';
    log(`failed: ${e.stack || e.message}`);
    lab.tell(r);
    lab.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
  } finally { lab.job = null; }
}
