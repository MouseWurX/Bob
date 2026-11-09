// Fake whisper-cli for tests: checks it got a WAV and a model, prints a transcript.
import fs from 'node:fs';
const a = process.argv.slice(2);
const wav = fs.readFileSync(a[a.indexOf('-f') + 1]);
if (wav.subarray(0, 4).toString() !== 'RIFF' || !a.includes('-m')) { console.error('bad input'); process.exit(2); }
console.log('[00:00:00.000 --> 00:00:01.500]   Hey Bob, what\'s on my board?');
