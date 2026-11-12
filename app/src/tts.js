// Bob's own voice: Piper (piper.exe, on the processor, well under a second a sentence), Kokoro (on the
// processor, more natural) or Chatterbox (graphics card, most natural, can copy a voice). Without it, the window falls back to the voices built into Windows.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { voicePython, voicesReady } from './audio.js';
import { unpackedDir } from './config.js';
import { exeName } from './platform.js';

const exists = (p) => Boolean(p) && fs.existsSync(p);

export function piperExe(cfg) {
  const t = cfg.tts || {};
  return t.exe || path.join(cfg.agentDir, 'piper', exeName('piper'));
}

export function ttsReady(cfg) {
  const t = cfg.tts || {};
  if (t.provider === 'kokoro') return voicesReady(cfg).kokoro && exists(t.model) && exists(t.voices);
  if (t.provider === 'chatterbox') return voicesReady(cfg).chatterbox;
  return t.provider === 'piper' && exists(piperExe(cfg)) && exists(t.model) && exists(t.config || `${t.model}.json`);
}

// Kokoro's voices (in the Kokoro v1.0 voice pack). a = American, b = British; f = woman, m = man.
// 1.5.203: Onyx (deep, calm, a little dry) is the voice Bob recommends and uses until someone picks another; it leads the list.
export const DEFAULT_KOKORO_VOICE = 'am_onyx';
export const KOKORO_VOICES = [
  ['am_onyx', 'Onyx (US man, deep)'], ['am_michael', 'Michael (US man)'], ['am_adam', 'Adam (US man)'], ['am_eric', 'Eric (US man)'], ['am_liam', 'Liam (US man)'], ['am_puck', 'Puck (US man, lively)'], ['am_fenrir', 'Fenrir (US man)'], ['am_echo', 'Echo (US man)'],
  ['bm_george', 'George (British man)'], ['bm_lewis', 'Lewis (British man)'], ['bm_daniel', 'Daniel (British man)'], ['bm_fable', 'Fable (British man)'],
  ['af_heart', 'Heart (US woman)'], ['af_bella', 'Bella (US woman)'], ['af_nicole', 'Nicole (US woman, soft)'], ['af_sarah', 'Sarah (US woman)'], ['af_sky', 'Sky (US woman)'], ['af_nova', 'Nova (US woman)'],
  ['bf_emma', 'Emma (British woman)'], ['bf_isabella', 'Isabella (British woman)'], ['bf_alice', 'Alice (British woman)'], ['bf_lily', 'Lily (British woman)']
];

// A voice per Bob (item 139, off unless turned on): a reply another of your Bobs thought is read in his own voice, so
// you can hear who's talking. The owner's pick for that Bob (Settings, Bob-Net), otherwise one picked from his name,
// never Bob's own voice. Only Kokoro has more than one voice; with Piper or Chatterbox every Bob sounds the same.
export const NET_VOICES = ['bm_george', 'am_puck', 'bm_lewis', 'am_eric', 'bm_daniel', 'am_liam', 'af_nova', 'bf_emma'];
export function netVoiceFor(cfg, name) {
  const n = String(name || '').trim();
  if (!n || cfg?.netVoices !== true) return '';
  const picked = cfg.netVoiceMap?.[n];
  if (picked && KOKORO_VOICES.some(([id]) => id === picked)) return picked;
  const own = cfg.tts?.voice || DEFAULT_KOKORO_VOICE;
  const list = NET_VOICES.filter((v) => v !== own);
  let h = 2166136261;
  for (const c of n.toLowerCase()) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return list[h % list.length];
}

// One Python process for Kokoro or Chatterbox, kept while Bob is talking and stopped after 10 quiet
// minutes (Chatterbox holds about 4 GB of the graphics card while it's up).
const workers = new Map();
function worker(cfg, engine) {
  const key = `${engine}:${voicePython(cfg, engine)}`;
  let w = workers.get(key);
  if (w && w.child.exitCode === null) { w.touch(); return w; }
  const script = cfg.audio?.voiceScript || path.join(unpackedDir, 'audio', 'bob-voice.py');
  const env = { ...process.env, HF_HOME: path.join(cfg.bobModelsDir || path.join(cfg.agentDir, 'models'), 'audio'), PYTHONIOENCODING: 'utf-8' };
  const child = spawn(voicePython(cfg, engine), cfg.audio?.voiceScript ? [script] : ['-u', script], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  const waiting = new Map();
  let buf = '', err = '';
  child.stdout.on('data', (d) => {
    buf += d;
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      const m = line.match(/^(OK|ERR) (\S+) ?(.*)$/);
      if (!m || !waiting.has(m[2])) continue;
      const done = waiting.get(m[2]); waiting.delete(m[2]);
      m[1] === 'OK' ? done.resolve() : done.reject(new Error(m[3] || 'The voice failed.'));
    }
  });
  child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
  const fail = (why) => { for (const d of waiting.values()) d.reject(new Error(why)); waiting.clear(); workers.delete(key); };
  child.on('error', (e) => fail(`Couldn't start the ${engine} voice (${e.message}).`));
  child.on('close', (code) => fail(`The ${engine} voice stopped (code ${code}). ${err.split('\n').filter(Boolean).slice(-2).join(' ')}`.trim()));
  let timer = null;
  w = {
    child,
    touch() { clearTimeout(timer); timer = setTimeout(() => { try { child.kill(); } catch {} }, 10 * 60e3); timer.unref?.(); },
    ask(job) {
      return new Promise((resolve, reject) => {
        waiting.set(job.id, { resolve, reject });
        child.stdin.write(JSON.stringify(job) + '\n');
      });
    }
  };
  w.touch();
  workers.set(key, w);
  return w;
}

export function stopVoices() { for (const w of workers.values()) { try { w.child.kill(); } catch {} } workers.clear(); }

async function sayPython(cfg, engine, words, signal, voice = '') {
  const t = cfg.tts || {};
  const out = path.join(os.tmpdir(), `bob-say-${crypto.randomUUID().slice(0, 8)}.wav`);
  const job = { id: crypto.randomUUID().slice(0, 8), engine, text: words, out, speed: t.speed || 1 };
  if (engine === 'kokoro') Object.assign(job, { model: t.model, voices: t.voices, voice: (voice && KOKORO_VOICES.some(([id]) => id === voice) ? voice : '') || t.voice || DEFAULT_KOKORO_VOICE });
  if (engine === 'chatterbox') {
    // Copying a voice: a clear 10 to 20 second recording at <inn>\voices\bob.wav (or tts.ref).
    const ref = t.ref || path.join(cfg.innDir, 'voices', 'bob.wav');
    if (exists(ref)) job.ref = ref;
  }
  const w = worker(cfg, engine);
  // The first sentence also loads the model (Chatterbox fetches about 3 GB the very first time).
  const limit = new Promise((_, reject) => { const tm = setTimeout(() => reject(new Error('The voice took too long.')), 15 * 60e3); tm.unref?.(); signal?.addEventListener('abort', () => reject(new Error('Stopped.')), { once: true }); });
  await Promise.race([w.ask(job), limit]);
  const buf = fs.readFileSync(out);
  fs.rmSync(out, { force: true });
  return buf;
}

// Plain words only: code, links and markdown are skipped so he doesn't read out symbols.
export function speakable(text) {
  return String(text || '')
    .replace(/```[\s\S]*?```/g, ' (code) ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/[*_#>|~]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 1500);
}

// Returns a WAV file as a Buffer.
export function say(cfg, text, { signal, voice = '' } = {}) {
  const t = cfg.tts || {};
  if (!ttsReady(cfg)) return Promise.reject(new Error('Bob\'s own voice isn\'t set up. Pick one in Settings, Brains (Senses and tools, Voice).'));
  const words = speakable(text);
  if (!words) return Promise.reject(new Error('Nothing to say.'));
  if (t.provider === 'kokoro' || t.provider === 'chatterbox') return sayPython(cfg, t.provider, words, signal, voice);
  const out = path.join(os.tmpdir(), `bob-say-${crypto.randomUUID().slice(0, 8)}.wav`);
  const args = [...(t.preArgs || []), '--model', t.model, '--config', t.config || `${t.model}.json`, '--output_file', out];
  if (t.speed && t.speed !== 1) args.push('--length_scale', String(Math.min(2, Math.max(0.5, 1 / t.speed))));
  if (Number.isInteger(t.speaker)) args.push('--speaker', String(t.speaker));
  return new Promise((resolve, reject) => {
    const child = spawn(piperExe(cfg), args, { windowsHide: true, stdio: ['pipe', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err = (err + d).slice(-1500); });
    const kill = () => { try { child.kill(); } catch {} };
    signal?.addEventListener('abort', kill, { once: true });
    const timer = setTimeout(kill, 60000);
    child.on('error', (e) => { clearTimeout(timer); reject(new Error(`Couldn't start Piper (${e.message}).`)); });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (code !== 0 || !fs.existsSync(out)) return reject(new Error(`Piper failed (code ${code}): ${err.slice(-300)}`));
      const buf = fs.readFileSync(out);
      fs.rmSync(out, { force: true });
      resolve(buf);
    });
    child.stdin.end(words + '\n');
  });
}
