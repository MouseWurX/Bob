// Voice samples: a short line in each voice, so the user can hear a voice before picking it.
// Where a sample comes from, in order:
//   1. made here before and kept in <inn>\bob\voice-samples\<engine>-<voice>.wav (plays at once),
//   2. shipped with Bob in public/voice-samples/ (a few Kokoro voices; Kokoro is Apache-2.0),
//   3. made now with the engine on this PC (no download, a few seconds), then kept as in 1,
//   4. otherwise the publisher's own sample online. Bob never fetches that himself: the window only
//      gets the address back, and the browser loads it when the button is clicked.
import fs from 'node:fs';
import path from 'node:path';
import { say, KOKORO_VOICES, piperExe } from './tts.js';
import { voicesReady } from './audio.js';
import { appDir } from './config.js';

export const SAMPLE_LINE = "Hello, I'm Bob. This is how I'll sound when I read my replies out loud.";
export const PIPER_SAMPLES_PAGE = 'https://rhasspy.github.io/piper-samples/';
export const KOKORO_VOICES_PAGE = 'https://huggingface.co/hexgrad/Kokoro-82M/blob/main/VOICES.md';
// The Kokoro voices whose clips ship with Bob (installer/make-voice-samples.js makes them): all of them since 1.5.0,
// so every voice plays its sample before anything is downloaded. Each clip says SAMPLE_LINE (about 5 seconds).
export const BUNDLED_KOKORO = KOKORO_VOICES.map(([id]) => id);

const AUDIO = ['.mp3', '.ogg', '.wav'];
const safe = (s) => /^[a-z0-9_-]{1,64}$/i.test(String(s || ''));

export const cacheDir = (cfg) => path.join(cfg.dataDir || path.join(cfg.innDir, 'bob'), 'voice-samples');
export const cacheFile = (cfg, engine, voice) => path.join(cacheDir(cfg), `${engine}-${voice}.wav`);
export const bundledDir = (cfg) => cfg.voiceSamplesDir || path.join(appDir, 'public', 'voice-samples');

function bundledFile(cfg, engine, voice) {
  for (const ext of AUDIO) { const f = path.join(bundledDir(cfg), `${engine}-${voice}${ext}`); if (fs.existsSync(f)) return f; }
  return '';
}

// Piper's sample page keeps one clip per voice, laid out like the voice files on Hugging Face.
export function piperOfficial(entry) {
  const url = (entry.files || []).map((f) => f.url).find((u) => /\.onnx$/.test(u)) || '';
  const m = url.match(/piper-voices\/resolve\/[\w.-]+\/([a-z]{2})\/([a-z]{2}_[A-Z]{2})\/([^/]+)\/([^/]+)\//);
  return m ? `${PIPER_SAMPLES_PAGE}samples/${m[1]}/${m[2]}/${m[3]}/${m[4]}/speaker_0.mp3` : '';
}

// Every voice Bob knows about, with how its sample would be found. Looks at files only; fetches nothing.
export function voiceList(cfg, shop) {
  const ready = voicesReady(cfg);
  const speech = (shop?.catalog?.models || []).filter((m) => m.category === 'speech');
  const out = [];
  const kok = speech.find((m) => m.use?.tts?.provider === 'kokoro');
  const kLoc = kok ? shop.locate(kok) : {};
  const kokOn = ready.kokoro && Boolean(kLoc.model && kLoc.voices);
  for (const [id, label] of KOKORO_VOICES) out.push({ engine: 'kokoro', voice: id, label, installed: kokOn, filesHere: Boolean(kLoc.model && kLoc.voices), model: kLoc.model, voices: kLoc.voices, page: KOKORO_VOICES_PAGE, source: "Kokoro's voice list" });
  for (const m of speech.filter((x) => x.use?.tts?.provider === 'piper')) {
    const loc = shop.locate(m);
    out.push({ engine: 'piper', voice: m.id.replace(/^piper-/, ''), label: m.name, catalogId: m.id, installed: fs.existsSync(piperExe(cfg)) && Boolean(loc.model && loc.config), model: loc.model, config: loc.config, official: piperOfficial(m), page: PIPER_SAMPLES_PAGE, source: "Piper's sample page (rhasspy.github.io)" });
  }
  const ref = cfg.tts?.ref || path.join(cfg.innDir, 'voices', 'bob.wav');
  out.push({ engine: 'chatterbox', voice: 'bob', label: 'Chatterbox (copies voices\\bob.wav)', installed: ready.chatterbox, ref: fs.existsSync(ref) ? ref : '' });
  for (const v of out) v.have = sampleState(cfg, v);
  return out;
}

function fresh(cfg, v) {
  const f = cacheFile(cfg, v.engine, v.voice);
  if (!fs.existsSync(f)) return false;
  // A Chatterbox sample is out of date once bob.wav changes.
  if (v.ref && fs.statSync(v.ref).mtimeMs > fs.statSync(f).mtimeMs) return false;
  return true;
}

function sampleState(cfg, v) {
  if (fresh(cfg, v)) return 'saved';
  if (bundledFile(cfg, v.engine, v.voice)) return 'bundled';
  if (v.installed) return 'make';
  if (v.official) return 'online';
  return 'none';
}

// What the window shows in the list (no file paths).
export const publicView = (list) => list.map(({ engine, voice, label, installed, filesHere, have, official, page, source, catalogId }) => ({ engine, voice, label, installed, filesHere: Boolean(filesHere), have, official: official || '', page: page || '', source: source || '', catalogId }));

const making = new Map();
// Returns { file } to play, or { online, page, source } for the browser to load on the click, or { none }.
export async function sampleFor(cfg, shop, engine, voice) {
  if (!safe(engine) || !safe(voice)) throw new Error('No such voice.');
  const v = voiceList(cfg, shop).find((x) => x.engine === engine && x.voice === voice);
  if (!v) throw new Error('No such voice.');
  const cached = cacheFile(cfg, engine, voice);
  if (fresh(cfg, v)) return { file: cached, from: 'saved' };
  const shipped = bundledFile(cfg, engine, voice);
  if (shipped) return { file: shipped, from: 'bundled' };
  if (v.installed) {
    const key = `${engine}-${voice}`;
    if (!making.has(key)) {
      const tts = engine === 'kokoro' ? { provider: 'kokoro', model: v.model, voices: v.voices, voice, speed: 1 }
        : engine === 'piper' ? { provider: 'piper', exe: cfg.tts?.exe, preArgs: cfg.tts?.preArgs, model: v.model, config: v.config, speed: 1 }
          : { provider: 'chatterbox', ref: v.ref || undefined, speed: 1 };
      making.set(key, (async () => {
        const wav = await say({ ...cfg, tts }, SAMPLE_LINE);
        fs.mkdirSync(cacheDir(cfg), { recursive: true });
        fs.writeFileSync(cached + '.part', wav);
        fs.renameSync(cached + '.part', cached);
      })().finally(() => making.delete(key)));
    }
    await making.get(key);
    return { file: cached, from: 'made' };
  }
  if (v.official) return { online: v.official, page: v.page, source: v.source };
  return { none: true, page: v.page || '', source: v.source || '' };
}

// Forget the samples made on this PC (they're made again on the next click).
export function clearSamples(cfg) { fs.rmSync(cacheDir(cfg), { recursive: true, force: true }); }
