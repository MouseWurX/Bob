// llama.cpp's helper programs that Bob runs beside the server: the standard speed test (llama-bench), the split and
// join tool (llama-gguf-split), the card-sharing server for Bob-Net (ggml-rpc-server) and the runner for diffusion
// brains (llama-diffusion-cli). The official llama.cpp downloads carry the first three (not the diffusion runner);
// Brain Engine's download carries all four, built from the same tag (engine/README.md).
//
// Where they're looked for: the built-in engine's folder first, then Brain Engine's folder, like the direction finder
// (src/lab.js tools()). `dirs` can be passed in (tests, or the Engines page's "Engine for the Lab" pick).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

// Each tool by its id, with the file names it has had (ggml-rpc-server was rpc-server before b6000 or so).
export const TOOLS = {
  bench: { names: ['llama-bench'], what: 'the standard speed test (llama-bench)' },
  split: { names: ['llama-gguf-split'], what: 'the split and join tool (llama-gguf-split)' },
  rpc: { names: ['ggml-rpc-server', 'rpc-server'], what: 'the card-sharing server (ggml-rpc-server)' },
  diffusion: { names: ['llama-diffusion-cli'], what: 'the diffusion brain runner (llama-diffusion-cli)', brainEngineOnly: true }
};

// Brains that write a whole block at once (llama-diffusion-cli runs them; llama-server and Bob's chat can't).
export const DIFFUSION_ARCHS = ['dream', 'llada', 'llada-moe', 'rnd1'];
export const isDiffusion = (arch) => DIFFUSION_ARCHS.includes(String(arch || '').toLowerCase());

export const exeFor = (n, platform = process.platform) => (platform === 'win32' ? `${n}.exe` : n);

// The folders to look in, in order: the built-in engine's, then Brain Engine's.
export function toolDirs(cfg) {
  const server = cfg?.llamacpp?.exe || path.join(cfg?.agentDir || '.', 'llama.cpp', exeFor('llama-server'));
  const out = [path.dirname(server), path.join(cfg?.agentDir || '.', 'brain-engine')];
  return [...new Set(out)];
}

// { id, path, found, what, dir }. When it isn't anywhere, path is where it would be in the first folder.
export function findTool(cfg, id, { dirs = toolDirs(cfg), exists = fs.existsSync, platform = process.platform } = {}) {
  const t = TOOLS[id];
  if (!t) throw new Error(`no tool ${id}`);
  for (const dir of dirs) for (const n of t.names) {
    const p = path.join(dir, exeFor(n, platform));
    if (exists(p)) return { id, path: p, found: true, what: t.what, dir };
  }
  return { id, path: path.join(dirs[0], exeFor(t.names[0], platform)), found: false, what: t.what, dir: '' };
}

export const allTools = (cfg, o) => Object.fromEntries(Object.keys(TOOLS).map((id) => [id, findTool(cfg, id, o)]));

// What to say when a tool isn't here.
export function missingWords(id) {
  const t = TOOLS[id];
  return t.brainEngineOnly
    ? `${t.what} isn't here. It comes with Brain Engine (Settings > Engines), from its next build. The official llama.cpp download doesn't have it.`
    : `${t.what} isn't here. It comes with the built-in engine and with Brain Engine (Settings > Engines). Get either one again to have it.`;
}

// Runs a tool to the end. Gives { code, out, err }. Lines go to onLine as they come (stdout and stderr both: llama.cpp
// prints its progress on stderr). Stops on signal.
export function runTool(exe, args, { spawnFn = spawn, signal, onLine, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    let child;
    try { child = spawnFn(exe, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: cwd || path.dirname(exe), env: env || process.env }); }
    catch (e) { reject(e); return; }
    let out = '', err = '';
    const partial = { out: '', err: '' }; // each stream keeps its own unfinished line
    const feed = (k, d) => {
      if (!onLine) return;
      partial[k] += String(d);
      const parts = partial[k].split(/\r\n|\r|\n/);
      partial[k] = parts.pop();
      for (const l of parts) if (l.trim()) onLine(l);
    };
    child.stdout?.on('data', (d) => { if (out.length < 4e6) out += d; feed('out', d); });
    child.stderr?.on('data', (d) => { if (err.length < 1e6) err += d; feed('err', d); });
    const stop = () => { try { child.kill(); } catch {} };
    if (signal) { if (signal.aborted) stop(); else signal.addEventListener('abort', stop, { once: true }); }
    child.once('error', (e) => reject(e));
    child.once('close', (code) => {
      signal?.removeEventListener?.('abort', stop);
      for (const k of ['out', 'err']) if (partial[k].trim() && onLine) onLine(partial[k]);
      if (signal?.aborted) { reject(new Error('Stopped.')); return; }
      resolve({ code, out, err });
    });
  });
}
