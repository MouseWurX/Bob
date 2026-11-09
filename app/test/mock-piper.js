#!/usr/bin/env node
// Fake piper.exe for tests: reads the words on stdin, writes a tiny WAV and logs its args.
import fs from 'node:fs';
const a = process.argv.slice(2);
let words = '';
process.stdin.on('data', (d) => { words += d; });
process.stdin.on('end', () => {
  fs.writeFileSync(process.env.MOCK_PIPER_LOG, JSON.stringify({ args: a, words }));
  fs.writeFileSync(a[a.indexOf('--output_file') + 1], Buffer.from('RIFF0000WAVE'));
});
