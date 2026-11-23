// Nov 16 2026 (the owner: "isn't brain engine able to handle this? why are we offloading to another service?"):
// Bob hears you with his own engine. Brain Engine (or, where it has no build yet, the plain llama.cpp that came with
// Bob) runs a brain that can hear, Gemma 4 E4B with its sound-and-picture reader (mmproj), in its own small
// llama-server on the processor only: the card is hidden from it (CUDA_VISIBLE_DEVICES=-1, -ngl 0,
// --no-mmproj-offload), below normal priority, with at most half the processor's threads. It starts on the first
// recording and stops after ten minutes unused (the old Ollama keep_alive). Never in Gaming mode: the game keeps the
// processor, and the ears stop the moment Gaming is on. No Ollama, no outside service.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { safeSpawn } from './engine-blocked.js';
import { exeName } from './platform.js';
import { gaming } from './sessions.js';
import { catalogFileFor } from './llamacpp.js';

export const HEAR_IDLE_MS = 10 * 60_000;
export const HEAR_CTX = 4096; // about 30 seconds of sound plus the reply fits
export const HEAR_MODEL = 'gemma4-e4b'; // the catalog's brain that hears (Get models, Hearing you)
export const PAUSED_IN_GAMING = 'I\'m not listening while Gaming mode is on, so your game keeps the processor. Turn Gaming off and I\'ll hear you again.';
const PROMPT = 'Transcribe this audio exactly as spoken. Reply with only the spoken words, no quotes, no notes. If nothing is said, reply with nothing.';

// Threads for the ears: half the processor, at least 2, at most 8, so the main brain and the game keep the rest.
export const hearThreads = (cpus = os.cpus().length) => Math.max(2, Math.min(8, Math.floor((cpus || 4) / 2)));

export function hearArgs({ gguf, mmproj }, port, threads = hearThreads()) {
  return ['-m', gguf, '--mmproj', mmproj, '--no-mmproj-offload', '--host', '127.0.0.1', '--port', String(port),
    '-c', String(HEAR_CTX), '-ngl', '0', '-t', String(threads), '-np', '1'];
}

// The request Brain Engine's llama-server takes: one WAV, sent as OpenAI-style input_audio, with the words asked for.
export function hearBody(wav, language = 'en') {
  return {
    messages: [{ role: 'user', content: [
      { type: 'text', text: language && language !== 'en' ? `${PROMPT} The language is ${language}.` : `${PROMPT} The language is English.` },
      { type: 'input_audio', input_audio: { data: Buffer.from(wav).toString('base64'), format: 'wav' } }
    ] }],
    temperature: 0, max_tokens: 512, stream: false, chat_template_kwargs: { enable_thinking: false }
  };
}

// Whether a catalog brain can hear: listed for the Hearing you job, with a sound-and-picture reader file.
export const canHear = (entry) => Boolean(entry && (entry.jobs || []).includes('voice') && (entry.files || []).some((f) => f.role === 'gguf') && (entry.files || []).some((f) => f.role === 'mmproj'));

export class Ears {
  // resolve(model) -> { gguf, mmproj } or null (catalogFileFor by default). spawnFn and fetchFn are for tests.
  constructor(cfg, { resolve, port, spawnFn = spawn, fetchFn = (...a) => fetch(...a), now = () => Date.now() } = {}) {
    this.cfg = cfg;
    this.resolve = resolve || ((m) => catalogFileFor(cfg, m));
    this.port = port || cfg.llamacpp?.hearPort || (cfg.llamacpp?.port || 8091) + 3;
    this.url = `http://127.0.0.1:${this.port}`;
    this.spawnFn = spawnFn;
    this.fetchFn = fetchFn;
    this.now = now;
    this.child = null;
    this.current = null;
    this.lastUse = 0;
    this.timer = setInterval(() => this.tick(), 30_000);
    this.timer.unref?.();
    process.on('exit', () => { try { this.child?.kill(); } catch {} });
  }

  // Every half minute: let go after ten minutes unused, and at once when Gaming is on.
  tick() { if (this.child && (gaming(this.cfg) || this.now() - this.lastUse > HEAR_IDLE_MS)) this.stop(); }

  exe() { return this.cfg.llamacpp?.exe || path.join(this.cfg.agentDir, 'llama.cpp', exeName('llama-server')); }

  files(model) { try { const f = this.resolve(model); return f?.gguf && f?.mmproj && fs.existsSync(f.gguf) && fs.existsSync(f.mmproj) ? f : null; } catch { return null; } }

  // This PC can hear with Bob's own engine: the brain, its reader and the engine are all here.
  ready(model = HEAR_MODEL) { return Boolean(this.files(model) && fs.existsSync(this.exe())); }

  async health() { try { return (await this.fetchFn(this.url + '/health', { signal: AbortSignal.timeout(2000) })).ok; } catch { return false; } }

  async start(model) {
    const f = this.files(model);
    if (!f) throw new Error('I have no ears yet. Pick a "Hearing you" model in Get models (left menu).');
    this.stop();
    let log = '';
    const child = safeSpawn(this.spawnFn, this.exe(), [...(this.cfg.llamacpp?.preArgs || []), ...hearArgs(f, this.port, this.cfg.stt?.threads || hearThreads())], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CUDA_VISIBLE_DEVICES: '-1' } });
    try { os.setPriority(child.pid, os.constants.priority.PRIORITY_BELOW_NORMAL); } catch {}
    child.stdout?.on('data', (d) => { log = (log + d).slice(-2000); });
    child.stderr?.on('data', (d) => { log = (log + d).slice(-2000); });
    const died = new Promise((_, no) => {
      child.once('error', (e) => no(new Error(`Couldn't start my ears (${e.message}).`)));
      child.once('exit', (code) => no(new Error(`My ears stopped while loading (code ${code}). ${log.slice(-300)}`)));
    });
    this.child = child;
    this.current = model;
    const up = (async () => {
      const until = this.now() + 120_000;
      while (this.now() < until) { if (await this.health()) return; await new Promise((r) => setTimeout(r, 300)); }
      throw new Error('My ears took too long to load.');
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

  async hear(wav, { model = HEAR_MODEL, language = 'en' } = {}) {
    if (gaming(this.cfg)) { this.stop(); throw new Error(PAUSED_IN_GAMING); }
    this.lastUse = this.now();
    if (this.current !== model || !this.child || this.child.exitCode !== null) await this.start(model);
    try {
      const res = await this.fetchFn(this.url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(hearBody(wav, language)), signal: AbortSignal.timeout(90_000) });
      if (!res.ok) throw new Error(`Couldn't hear that (my engine said ${res.status}: ${(await res.text()).slice(0, 200)})`);
      const j = await res.json();
      return String(j.choices?.[0]?.message?.content ?? '');
    } finally { this.lastUse = this.now(); }
  }
}

// One pair of ears per Bob.
let shared = null;
export const earsFor = (cfg) => (shared && shared.cfg === cfg ? shared : (shared = new Ears(cfg)));
export const stopEars = () => shared?.stop();
