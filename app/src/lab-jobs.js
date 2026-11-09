// 1.5.16x The Playground's Longer, Faster and Teach it pages (thinking-paths.md sec 15) run their work as ordinary Lab
// jobs: one at a time (lab.job), on the Lab's run list, stoppable, asking before Bob's own brain is unloaded. This is
// the shared shape, so each page only says what its steps do. Same rules as the ladder (src/lab.js startLadder).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { labOn, labDir } from './lab.js';
import { gaming } from './sessions.js';

export const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
export const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };
export const isInsideDir = (f, root) => { const rel = path.relative(path.resolve(root), path.resolve(String(f || ''))); return Boolean(rel) && !rel.startsWith('..') && !path.isAbsolute(rel); };
export const exeName = (n) => (process.platform === 'win32' ? `${n}.exe` : n);

// The checks every Lab job makes before it starts. Throws in plain words.
export function canStart(lab, { room = true } = {}) {
  if (!labOn(lab.cfg)) throw new Error('The Computer Science Lab is off. Turn it on in Settings, How Bob works, Brains.');
  if (room) { const r = lab.room(); if (!r.ok) throw new Error(r.why); }
  if (lab.job) throw new Error('The Lab is already busy with a job. Wait for it, or stop it.');
  if (gaming(lab.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
}

// Bob's own brain leaves the card first, but only after asking. Returns { needUnload, names } to ask, or null to go.
export async function makeRoom(lab, unload) {
  if (!lab.brain?.engine?.loaded) return null;
  const loaded = (await lab.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard);
  if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
  if (loaded.length) await lab.brain.engine.unloadAll().catch(() => {});
  return null;
}

// Start a job: a run record on the Lab's list, and `work(run, { set, signal, progress })` in the background.
// work returns the report; a throw marks it failed (or stopped, when Stop was pressed).
export function runJob(lab, { kind, name, from = '', fromName = '', steps, stopped = 'You stopped it.' }, work) {
  const r = { id: `lab-${lab.now().toString(36)}`, kind, name, from, fromName, state: 'running', at: lab.now(), steps: steps.map(([id, label]) => ({ id, label, state: 'waiting' })), progress: 0 };
  lab.runs.push(r); lab.save();
  const ac = new AbortController();
  lab.job = { run: r, ac };
  const set = (id, state, label) => { const s = r.steps.find((x) => x.id === id); if (!s) return; s.state = state; if (label) s.label = label; r.step = id; r.stepLabel = s.label; lab.tell(r); };
  let last = 0;
  const progress = (pc, label) => { r.progress = Math.max(0, Math.min(100, Math.round(pc))); if (label) r.stepLabel = label; if (Date.now() - last > 1500) { last = Date.now(); lab.broadcast({ type: 'lab', run: lab.runView(r) }); } };
  (async () => {
    try {
      r.report = await work(r, { set, signal: ac.signal, progress });
      r.state = 'done'; r.step = ''; r.stepLabel = ''; r.progress = 100;
      lab.broadcast({ type: 'lab-done', name: r.name, ok: true });
    } catch (e) {
      r.state = ac.signal.aborted ? 'stopped' : 'failed'; r.error = ac.signal.aborted ? stopped : e.message;
      const s = r.steps.find((x) => x.state === 'running'); if (s) s.state = 'failed';
      lab.broadcast({ type: 'lab-done', name: r.name, ok: false, error: r.error });
    } finally { lab.job = null; lab.tell(r); }
  })();
  return { started: lab.runView(r) };
}

// A program run to the end, its last words kept for the error. onLine sees each line of its output (for progress).
export function runTool(exe, args, { signal, log = () => {}, onLine = () => {}, env, cwd } = {}) {
  return new Promise((resolve, reject) => {
    log(`${path.basename(exe)} ${args.join(' ')}`);
    let c;
    try { c = spawn(exe, args, { stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, ...(env ? { env } : {}), ...(cwd ? { cwd } : {}) }); } catch (e) { reject(new Error(`Couldn't start ${path.basename(exe)}: ${e.message}`)); return; }
    let tail = '', buf = '';
    const keep = (d) => { tail = (tail + d).slice(-4000); buf += d; const lines = buf.split(/\r?\n|\r/); buf = lines.pop(); for (const l of lines) { try { onLine(l); } catch {} } };
    c.stdout.on('data', keep); c.stderr.on('data', keep);
    const stop = () => { try { c.kill(); } catch {} };
    signal?.addEventListener('abort', stop, { once: true });
    c.once('error', (e) => reject(new Error(`Couldn't start ${path.basename(exe)}: ${e.message}`)));
    c.once('exit', (code) => { signal?.removeEventListener('abort', stop); log(tail.slice(-1500)); if (signal?.aborted) reject(new Error('Stopped.')); else if (code === 0) resolve(tail); else reject(new Error(`${path.basename(exe)} stopped (code ${code}): ${tail.split('\n').filter(Boolean).slice(-2).join(' | ')}`)); });
  });
}

// A log file for one page's job, under <data>/lab/<page>/.
export function pageLog(cfg, page) {
  const dir = path.join(labDir(cfg), page);
  return (t) => { try { fs.mkdirSync(dir, { recursive: true }); fs.appendFileSync(path.join(dir, 'lab.log'), `${new Date().toISOString()} ${t}\n`); } catch {} };
}

// One chat request to a Lab server at temperature 0, thinking off. Returns the text and llama-server's timings.
export async function chatOnce(url, messages, { maxTokens = 200, signal, cache = false, timeoutMs = 600e3 } = {}) {
  const res = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages, temperature: 0, max_tokens: maxTokens, cache_prompt: cache, chat_template_kwargs: { enable_thinking: false } }), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`The brain answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  const text = String(j.choices?.[0]?.message?.content || '').replace(/<think>[\s\S]*?<\/think>/g, '').trim();
  return { text, timings: j.timings || {} };
}
