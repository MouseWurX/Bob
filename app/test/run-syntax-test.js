// Every script the page loads must parse. A stray quote in one string blanks the whole page in the browser, and the
// other suites only read these files as text, so they don't notice. node --check parses without running anything.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
for (const dir of ['public', 'src']) {
  for (const f of fs.readdirSync(path.join(root, dir)).filter((x) => x.endsWith('.js')).sort()) {
    const r = spawnSync(process.execPath, ['--check', path.join(root, dir, f)], { encoding: 'utf8' });
    if (r.status === 0) pass++; else { fail++; console.log(`FAIL ${dir}/${f} doesn't parse:\n${(r.stderr || '').split(/\r?\n/).slice(0, 5).join('\n')}`); }
  }
}
console.log(`PASS every script in public/ and src/ parses (${pass} files)`.replace(/^PASS/, fail ? 'FAIL' : 'PASS'));
console.log(`\n${fail ? 0 : 1} passed, ${fail ? 1 : 0} failed`);
process.exit(fail ? 1 : 0);
