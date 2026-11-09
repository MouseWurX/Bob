#!/usr/bin/env node
// Fake sd-cli for tests: logs its args, prints progress, writes the output file.
import fs from 'node:fs';
const a = process.argv.slice(2);
fs.writeFileSync(process.env.MOCK_SD_ARGS, JSON.stringify(a));
const out = a[a.indexOf('-o') + 1];
const slow = a.includes('slow');
for (let i = 1; i <= 4; i++) process.stdout.write(`  |=====| ${i}/4 - 0.1s/it\n`);
setTimeout(() => {
  if (process.env.MOCK_SD_FAIL) { console.error('CUDA out of memory'); process.exit(1); }
  fs.writeFileSync(out, Buffer.from(/\.webm$/.test(out) ? '1a45dfa39f4286810142f7810142f281' : '89504e470d0a1a0a', 'hex'));
}, slow ? 5000 : 50);
