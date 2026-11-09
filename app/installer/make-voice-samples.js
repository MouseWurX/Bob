#!/usr/bin/env node
// Makes the voice samples that ship with Bob (public/voice-samples/), using the Kokoro voice on this PC.
// Bob must be running (it uses his own "Hear a sample" route, so nothing is downloaded).
//   node installer/make-voice-samples.js          all 22 Kokoro voices (npm run voice-samples)
//   node installer/make-voice-samples.js --only am_michael,bf_emma    just these
// If ffmpeg is on PATH the clips are saved as small MP3s (about 40 KB each), otherwise as WAV.
// Only Kokoro (Apache-2.0) clips are shipped; Piper voices have mixed data licences, so they play
// from Piper's own sample page instead.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BUNDLED_KOKORO } from '../src/voice-samples.js';
import { KOKORO_VOICES } from '../src/tts.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.resolve(here, '..', 'public', 'voice-samples');
const port = Number(process.argv[process.argv.indexOf('--port') + 1]) || 7777;
const only = process.argv.includes('--only') ? String(process.argv[process.argv.indexOf('--only') + 1] || '').split(',') : null;
const list = only ? KOKORO_VOICES.map(([id]) => id).filter((id) => only.includes(id)) : BUNDLED_KOKORO;
const ffmpeg = spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;
fs.mkdirSync(out, { recursive: true });

let made = 0;
for (const voice of list) {
  const r = await fetch(`http://127.0.0.1:${port}/api/voice/sample`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ engine: 'kokoro', voice }) }).catch((e) => ({ ok: false, error: e }));
  if (!r.ok || !String(r.headers?.get('content-type')).startsWith('audio/')) { console.log(`skip ${voice}: ${r.error?.message || (await r.json?.().catch(() => ({})))?.error || 'no audio (is Kokoro set up, and Bob running?)'}`); continue; }
  const wav = path.join(out, `kokoro-${voice}.wav`);
  fs.writeFileSync(wav, Buffer.from(await r.arrayBuffer()));
  if (ffmpeg) {
    const mp3 = wav.replace(/\.wav$/, '.mp3');
    if (spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', wav, '-ac', '1', '-b:a', '64k', mp3]).status === 0) fs.rmSync(wav);
  }
  made++;
  console.log(`made ${voice}`);
}
console.log(`\n${made} of ${list.length} samples in ${out}${ffmpeg ? '' : ' (WAV: install ffmpeg for smaller MP3s)'}`);
process.exit(made ? 0 : 1);
