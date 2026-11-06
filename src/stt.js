// Speech to text, with no extra services.
// Default: Ollama with an audio-capable model (gemma4:e4b), run on the CPU so Bob's main brain keeps the GPU.
// Optional: any OpenAI-compatible /audio/transcriptions endpoint (provider "http").
// Own: whisper.cpp's whisper-cli.exe with a Whisper model from the cellar (provider "whispercpp"), no other service.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { exeName } from './platform.js';

const PROMPT = 'Transcribe this audio exactly as spoken, in English. Reply with only the spoken words, no quotes, no notes. If nothing is said, reply with nothing.';

export async function transcribe(cfg, wav) {
  const stt = cfg.stt || {};
  const provider = stt.provider || 'ollama';
  if (provider === 'http') return viaHttp(stt, wav);
  if (provider === 'whispercpp') return viaWhisperCpp(cfg, stt, wav);
  return viaOllama(cfg, stt, wav);
}

async function viaOllama(cfg, stt, wav) {
  if (!cfg.ollamaUrl) throw new Error('I have no ears yet. Pick a "Hearing you" model in Get models (left menu).');
  const model = stt.model || 'gemma4:e4b';
  const field = stt.audioField || 'images';
  const msg = { role: 'user', content: PROMPT, [field]: [Buffer.from(wav).toString('base64')] };
  const res = await fetch(cfg.ollamaUrl.replace(/\/$/, '') + '/api/chat', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model, messages: [msg], stream: false, keep_alive: stt.keepAlive || '10m',
      options: { temperature: 0, ...(stt.cpuOnly !== false || cfg.session === 'light' ? { num_gpu: 0 } : {}) }
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
  if (!stt.model || !fs.existsSync(stt.model)) throw new Error('I have no ears yet. Pick a "Hearing you" model in Get models (left menu).');
  const tmp = path.join(os.tmpdir(), `bob-${crypto.randomUUID()}.wav`);
  fs.writeFileSync(tmp, Buffer.from(wav));
  try {
    const out = await new Promise((resolve, reject) => execFile(exe,
      [...(stt.preArgs || []), '-m', stt.model, '-f', tmp, '-l', stt.language || 'en', '-nt', '-np', '-t', String(stt.threads || Math.min(8, os.cpus().length)), ...(stt.gpu && cfg.session !== 'light' ? [] : ['-ng'])], // 1.5.23: -ng (processor) always while Gaming is on
      { windowsHide: true, timeout: 60000, maxBuffer: 1e6 },
      (err, stdout) => (err ? reject(new Error(`Couldn't hear that (whisper.cpp: ${err.message})`)) : resolve(stdout))));
    return clean(String(out).replace(/\[[^\]]*\]/g, ' ').replace(/\s+/g, ' '));
  } finally { fs.rmSync(tmp, { force: true }); }
}

function clean(s) {
  return s.trim().replace(/^["'“”]+|["'“”]+$/g, '').replace(/^\((silence|no speech|nothing)\)$/i, '').trim();
}
