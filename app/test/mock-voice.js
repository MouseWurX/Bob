// Stands in for audio/bob-voice.py: one JSON job per line, writes a tiny WAV, answers OK/ERR.
import fs from 'node:fs';
import readline from 'node:readline';
console.log('READY');
const rl = readline.createInterface({ input: process.stdin });
let loads = 0;
rl.on('line', (line) => {
  const job = JSON.parse(line);
  if (job.text.includes('explode')) { console.log(`ERR ${job.id} voice model crashed`); return; }
  loads++;
  const head = Buffer.from('RIFF0000WAVEfmt ');
  fs.writeFileSync(job.out, Buffer.concat([head, Buffer.from(JSON.stringify({ engine: job.engine, voice: job.voice, ref: job.ref || null, pid: process.pid, loads }))]));
  console.log(`OK ${job.id}`);
});
