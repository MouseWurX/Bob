// Computer Science Lab, Playground: Diffusion brains (llama-diffusion-cli). Most brains write one word after another.
// A diffusion brain (Dream, LLaDA, LLaDA-MoE, RND1) starts from a block of blanks and fills them all in over a number
// of steps, the way picture makers clear up noise. Bob's chat can't run them (llama-server doesn't), so they live
// here: pick one, ask, and watch the block fill in. Only Brain Engine carries the runner (the official llama.cpp
// downloads leave it out). One at a time, never while Gaming or a Lab job runs, and Bob's own brain leaves the card
// first (asked, like the Challenges).
import { labOn } from './lab.js';
import fs from 'node:fs';
import path from 'node:path';
import { ggufInfo } from './gguf.js';
import { findTool, missingWords, DIFFUSION_ARCHS, isDiffusion } from './llama-tools.js';
import { spawn } from 'node:child_process';
import { gaming } from './sessions.js';

export { DIFFUSION_ARCHS, isDiffusion };
export const STEPS = [32, 64, 128, 256];
export const LENGTHS = [128, 256, 512];
export const ROUTES = ['/api/lab/diffusion', '/api/lab/diffusion/try', '/api/lab/diffusion/stop'];
const CLEAR = '\u001b[2J\u001b[H';

// LLaDA brains fill in block by block (32 words a block); Dream and RND1 go by timesteps. The runner wants one or the other.
export function diffusionArgs(gguf, arch, { prompt, steps = 64, length = 256, temp = 0, seed = 1 } = {}) {
  const a = String(arch || '').toLowerCase();
  const room = Math.max(256, Math.min(2048, length + 256)); // the runner's whole block: the prompt and the answer together
  return ['-m', gguf, '-p', String(prompt || ''), '-ub', String(room), '-b', String(room), '-c', String(room), '--diffusion-steps', String(steps), '--temp', String(temp), '--seed', String(seed), '--diffusion-visual',
    ...(a.startsWith('llada') ? ['--diffusion-block-length', '32'] : ['--diffusion-eps', '0.001', ...(a === 'rnd1' ? ['--diffusion-algorithm', '1'] : ['--diffusion-algorithm', '4'])])];
}

// The runner's screen output, in frames (it clears the screen before each). Each frame: "diffusion step: n/m [...] p%"
// then the text so far, blanks as spaces. The last frame after the steps is the answer. Gives { step, of, text }.
export function readFrames(out) {
  const frames = String(out || '').split(CLEAR).slice(1);
  let step = 0, of = 0, text = '';
  for (const f of frames) {
    const m = f.match(/diffusion step: (\d+)\/(\d+)/);
    if (m) { step = Number(m[1]); of = Number(m[2]); text = f.slice(f.indexOf('\n', m.index) + 1); }
    else text = f;
  }
  return { step, of, text: text.replace(/^\n+/, '').replace(/^ /, '').replace(/\s+$/, '') };
}

export class Diffusion {
  constructor(lab, { spawnFn = spawn } = {}) { this.lab = lab; this.spawnFn = spawnFn; this.cur = null; this.last = null; }

  brains() {
    const out = [];
    for (const b of this.lab.brains()) { let i = null; try { i = ggufInfo(b.gguf); } catch {} if (i && isDiffusion(i.arch)) out.push({ id: b.id, name: b.name, arch: i.arch, sizeGB: (() => { try { return Math.round(fs.statSync(b.gguf).size / 1e8) / 10; } catch { return null; } })() }); }
    return out;
  }

  view() { const t = findTool(this.lab.cfg, 'diffusion'); return { tool: t.found, toolWhy: t.found ? '' : missingWords('diffusion'), brains: this.brains(), steps: STEPS, lengths: LENGTHS, now: this.state() }; }
  state() { const c = this.cur || this.last; return c ? { brain: c.name, prompt: c.prompt, step: c.step, of: c.of, text: c.text, state: c.state, error: c.error || '', seconds: c.seconds || 0 } : null; }

  async start({ brain, prompt, steps, length }, { unload = false } = {}) {
    if (this.cur) throw new Error('A diffusion brain is already writing. Wait for it, or stop it.');
    if (this.lab.job) throw new Error('The Lab is busy with a job. Wait for it, or stop it.');
    if (gaming(this.lab.cfg)) throw new Error('Gaming is on, so the Lab waits. Switch the session to Normal to run it.');
    const t = findTool(this.lab.cfg, 'diffusion');
    if (!t.found) throw new Error(missingWords('diffusion'));
    const b = this.lab.brains().find((x) => x.id === String(brain || ''));
    let info = null; try { info = b && ggufInfo(b.gguf); } catch {}
    if (!b || !info || !isDiffusion(info.arch)) throw new Error('Pick one of the diffusion brains.');
    const q = String(prompt || '').trim().slice(0, 2000);
    if (!q) throw new Error('Type something to ask.');
    const st = STEPS.includes(Number(steps)) ? Number(steps) : 64, len = LENGTHS.includes(Number(length)) ? Number(length) : 256;
    if (this.lab.brain?.engine?.loaded) {
      const loaded = (await this.lab.brain.engine.loaded().catch(() => [])).filter((m) => m.vram > 0 || m.onCard || m.usesCard);
      if (loaded.length && !unload) return { needUnload: true, names: loaded.map((m) => m.name) };
      if (loaded.length) await this.lab.brain.engine.unloadAll().catch(() => {});
    }
    const c = { name: b.name, prompt: q, step: 0, of: st, text: '', state: 'running', at: Date.now() };
    this.cur = c;
    const child = this.spawnFn(t.path, diffusionArgs(b.gguf, info.arch, { prompt: q, steps: st, length: len }), { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(t.path) });
    c.child = child;
    let out = '', err = '', last = 0;
    const tell = (force) => { if (force || Date.now() - last > 700) { last = Date.now(); this.lab.broadcast({ type: 'lab-diffusion', now: this.state() }); } };
    child.stdout.on('data', (d) => { out += d; if (out.length > 8e6) out = CLEAR + out.slice(out.lastIndexOf(CLEAR) + CLEAR.length); const f = readFrames(out); Object.assign(c, { step: f.step || c.step, of: f.of || c.of, text: f.text }); tell(); });
    child.stderr.on('data', (d) => { err = (err + d).slice(-4000); });
    const end = (code) => {
      if (this.cur !== c) return;
      const f = readFrames(out);
      c.seconds = Math.round((Date.now() - c.at) / 1000);
      if (c.stopped) { c.state = 'stopped'; c.error = 'You stopped it.'; }
      else if (code === 0 && f.text) { c.state = 'done'; c.text = f.text; c.step = c.of; }
      else { c.state = 'failed'; c.error = `The diffusion runner stopped${err ? ` (${err.trim().split(/\r?\n/).pop().slice(0, 200)})` : ''}.`; }
      delete c.child; this.last = c; this.cur = null; tell(true);
    };
    child.once('error', () => end(-1));
    child.once('close', end);
    tell(true);
    return { started: this.state() };
  }

  stop() { if (this.cur?.child) { this.cur.stopped = true; try { this.cur.child.kill(); } catch {} return true; } return false; }
}

export function diffusion(lab) { if (!lab.diffusion) lab.diffusion = new Diffusion(lab); return lab.diffusion; }

// Routes. Looking is fine from the phone; starting and stopping only on this replicant matrix (it takes the card).
export async function diffusionRoute({ req, res, p, isLocal, lab, body, send }) {
  if (!ROUTES.includes(p)) return false;
  if (!lab.cfg || !labOn(lab.cfg)) { send(res, 403, { error: 'The Computer Science Lab is off.' }); return true; } // 1.5.181 the Lab is on unless switched off, so Diffusion follows labOn like every other page
  const d = diffusion(lab);
  if (req.method === 'GET' && p === '/api/lab/diffusion') { send(res, 200, d.view()); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Diffusion brains run on this replicant matrix itself, not from the phone.' }); return true; }
  const b = await body(req).catch(() => ({}));
  try {
    if (p === '/api/lab/diffusion/try') { send(res, 200, await d.start(b, { unload: b.unload === true })); return true; }
    if (p === '/api/lab/diffusion/stop') { send(res, 200, { stopped: d.stop() }); return true; }
  } catch (e) { send(res, 400, { error: e.message }); return true; }
  return false;
}
