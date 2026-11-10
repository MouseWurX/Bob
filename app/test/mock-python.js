#!/usr/bin/env node
// Fake audio-workshop Python for tests: reads the job on stdin, reports progress, writes a WAV.
import fs from 'node:fs';
let s = '';
process.stdin.on('data', (d) => { s += d; });
process.stdin.on('end', () => {
  const job = JSON.parse(s);
  fs.writeFileSync(process.env.MOCK_AUDIO_LOG, JSON.stringify(job));
  if (job.prompt === 'fail') { console.error('CUDA out of memory'); process.exit(1); }
  console.log('PROGRESS 50/100');
  fs.writeFileSync(job.out, Buffer.from('RIFF0000WAVE'));
  console.log('PROGRESS 100/100');
  console.log('DONE ' + job.out);
});
