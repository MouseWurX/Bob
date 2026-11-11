// 1.5.72: Bob's own engine runs the Memory slot's embedding model (nomic-embed-text) itself, so Topics can be matched
// by meaning without Ollama. Its own small llama-server (--embedding) on the processor only (the card is hidden from
// it), below normal priority and with two threads, started on first use and stopped after two minutes unused,
// like Ollama's keep_alive for embeddings. Never started in the Gaming session: Topics fall back to matching words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { safeSpawn } from './engine-blocked.js'; // 1.5.203: a blocked program comes back as 'error', not a throw
import { exeName } from './platform.js';
import { gaming } from './sessions.js';

export const EMBED_IDLE_MS = 120_000;
export const EMBED_CTX = 2048; // nomic-embed-text reads up to 2048 tokens in one go
const MAX_CHARS = 6000; // about 1,500 tokens: longer texts are cut so one batch always fits

export function embedArgs(gguf, port) {
  return ['-m', gguf, '--host', '127.0.0.1', '--port', String(port), '--embedding', '--pooling', 'mean',
    '-c', String(EMBED_CTX), '-b', String(EMBED_CTX), '-ub', String(EMBED_CTX), '-ngl', '0', '-t', '2', '-np', '1'];
}

export class Embedder {
  // resolve(model) -> { gguf } or null: the downloaded file (Bob's models folder).
  constructor(cfg, { resolve, port } = {}) {
    this.cfg = cfg;
    this.resolve = resolve;
    this.port = port || cfg.llamacpp?.embedPort || (cfg.llamacpp?.port || 8091) + 2;
    this.url = `http://127.0.0.1:${this.port}`;
    this.child = null;
    this.current = null;
    this.lastUse = 0;
    this.now = () => Date.now();
    this.timer = setInterval(() => { if (this.child && this.now() - this.lastUse > EMBED_IDLE_MS) this.stop(); }, 30_000);
    this.timer.unref?.();
    process.on('exit', () => { try { this.child?.kill(); } catch {} });
  }

  exe() { return this.cfg.llamacpp?.exe || path.join(this.cfg.agentDir, 'llama.cpp', exeName('llama-server')); }

  // Whether this PC can embed with Bob's own engine: the model file and llama-server are both here.
  ready(model) {
    let file = null;
    try { file = this.resolve(model)?.gguf; } catch {}
    return Boolean(file && fs.existsSync(file) && (this.cfg.llamacpp?.exe || fs.existsSync(this.exe())));
  }

  async health() {
    try { return (await fetch(this.url + '/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; }
  }

  async start(model) {
    const file = this.resolve(model)?.gguf;
    if (!file || !fs.existsSync(file)) throw new Error(`${model} isn't downloaded.`);
    this.stop();
    let log = '';
    const child = safeSpawn(spawn, this.exe(), [...(this.cfg.llamacpp?.preArgs || []), ...embedArgs(file, this.port)], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1' } });
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    child.stdout.on('data', (d) => { log = (log + d).slice(-2000); });
    child.stderr.on('data', (d) => { log = (log + d).slice(-2000); });
    const died = new Promise((_, no) => {
      child.once('error', (e) => no(new Error(`Couldn't start llama-server for ${model} (${e.message}).`)));
      child.once('exit', (code) => no(new Error(`llama-server stopped while loading ${model} (code ${code}). ${log.slice(-300)}`)));
    });
    this.child = child;
    this.current = model;
    const up = (async () => {
      const until = this.now() + 60_000;
      while (this.now() < until) { if (await this.health()) return; await new Promise((r) => setTimeout(r, 300)); }
      throw new Error(`${model} took too long to load.`);
    })();
    try { await Promise.race([up, died]); } catch (e) { this.stop(); throw e; }
    died.catch(() => {});
  }

  stop() {
    const c = this.child;
    this.child = null;
    this.current = null;
    try { if (c && c.exitCode === null) c.kill(); } catch {}
  }

  async embed(model, input) {
    if (gaming(this.cfg)) throw new Error('No memory matching in the Gaming session.');
    const texts = [].concat(input).map((t) => String(t ?? '').slice(0, MAX_CHARS));
    this.lastUse = this.now();
    if (this.current !== model || !this.child || this.child.exitCode !== null) await this.start(model);
    try {
      const res = await fetch(this.url + '/v1/embeddings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ model, input: texts }), signal: AbortSignal.timeout(60_000) });
      if (!res.ok) throw new Error(`llama-server returned ${res.status}`);
      const j = await res.json();
      const rows = [...(j.data || [])].sort((a, b) => (a.index ?? 0) - (b.index ?? 0)).map((d) => d.embedding);
      if (rows.length !== texts.length || !rows.every(Array.isArray)) throw new Error('no embeddings');
      return rows;
    } finally { this.lastUse = this.now(); }
  }
}
