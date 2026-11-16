// Speech to text (Hearing you), with Bob's own parts only by default.
// Nov 16 2026 (the owner: "by default i want bob to only use the things that are native to him"):
// Default ("brainengine"): Bob's own engine hears you, with Gemma 4 E4B on the processor (src/hearing.js).
// Own, lighter: whisper.cpp's whisper-cli with a Whisper model from Get models (provider "whispercpp").
// Opt-in only: Ollama (provider "ollama", needs "Use Ollama too" in Settings, Engines; src/ollama-optin.js), and any
// OpenAI-compatible /audio/transcriptions address written into config.json by hand (provider "http").
// Gaming mode pauses Bob's own hearing (his engine and whisper.cpp), so the game keeps the processor.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { exeName } from './platform.js';
import { gaming } from './sessions.js';
import { ollamaOn, ollamaUrl } from './ollama-optin.js';
import { earsFor, HEAR_MODEL, PAUSED_IN_GAMING } from './hearing.js';

const PROMPT = 'Transcribe this audio exactly as spoken, in English. Reply with only the spoken words, no quotes, no notes. If nothing is said, reply with nothing.';
const NO_EARS = 'I have no ears yet. Pick a "Hearing you" model in Get models (left menu).';

// The way Bob hears on this PC. Ollama counts only while it's switched on; otherwise Bob's own engine.
export function sttProvider(cfg) {
  const p = cfg?.stt?.provider || 'brainengine';
  if (p === 'ollama' && !ollamaOn(cfg)) return 'brainengine';
  return ['brainengine', 'whispercpp', 'http', 'ollama'].includes(p) ? p : 'brainengine';
}

export async function transcribe(cfg, wav, { ears } = {}) {
  const stt = cfg.stt || {};
  const provider = sttProvider(cfg);
  if (provider === 'http') return viaHttp(stt, wav);
  if (gaming(cfg)) throw new Error(PAUSED_IN_GAMING);
  if (provider === 'whispercpp') return viaWhisperCpp(cfg, stt, wav);
  if (provider === 'ollama') return viaOllama(cfg, stt, wav);
  const model = stt.provider === 'brainengine' && stt.model ? stt.model : HEAR_MODEL;
  return clean(await (ears || earsFor(cfg)).hear(wav, { model, language: stt.language || 'en' }));
}

async function viaOllama(cfg, stt, wav) {
  const url = ollamaUrl(cfg);
  if (!url) throw new Error(NO_EARS);
  const model = stt.model || 'gemma4:e4b';
  const field = stt.audioField || 'images';
  const msg = { role: 'user', content: PROMPT, [field]: [Buffer.from(wav).toString('base64')] };
  const res = await fetch(url + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, messages: [msg], stream: false, keep_alive: stt.keepAlive || '10m',
      options: { temperature: 0, ...(stt.cpuOnly !== false ? { num_gpu: 0 } : {}) }
    }),
    signal: AbortSignal.timeout(90000)
  });
  if (!res.ok) throw new Error(`Couldn't hear that (Ollama ${res.status}: ${(await res.text()).slice(0, 200)})`);
  const j = await res.json();
  return clean(j.message?.content || '');
}

async function viaHttp(stt, wav) {
  if (!stt.url) throw new Error('Voice input needs stt.url in config.json.');
  const key = stt.apiKey || (stt.apiKeyEnv ? process.env[stt.apiKeyEnv] : '');
  const form = new FormData();
  form.append('file', new Blob([wav], { type: 'audio/wav' }), 'speech.wav');
  if (stt.model) form.append('model', stt.model);
  form.append('language', stt.language || 'en');
  const res = await fetch(stt.url, {
    method: 'POST', headers: key ? { authorization: `Bearer ${key}` } : undefined, body: form, signal: AbortSignal.timeout(60000)
  });
  if (!res.ok) throw new Error(`Speech service returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const j = await res.json();
  return clean(String(j.text ?? j.transcript ?? ''));
}

async function viaWhisperCpp(cfg, stt, wav) {
  const exe = stt.exe || path.join(cfg.agentDir, 'whisper.cpp', exeName('whisper-cli'));
  if (!stt.model || !fs.existsSync(stt.model)) throw new Error(NO_EARS);
  const tmp = path.join(os.tmpdir(), `bob-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(tmp, Buffer.from(wav));
  try {
    const out = await new Promise((resolve, reject) => execFile(exe,
      [...(stt.preArgs || []), '-m', stt.model, '-f', tmp, '-l', stt.language || 'en', '-nt', '-np', '-t', String(stt.threads || Math.min(8, os.cpus().length)), ...(stt.gpu ? [] : ['-ng'])],
      { windowsHide: true, timeout: 60000, maxBuffer: 1e6 },
      (err, stdout) => (err ? reject(new Error(`Couldn't hear that (whisper.cpp: ${err.message})`)) : resolve(stdout))));
    return clean(String(out).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' '));
  } finally { fs.rmSync(tmp, { force: true }); }
}

export function clean(s) {
  return String(s || '').trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/^\((silence|no speech|nothing)\)$/i, '').trim();
}
