// npm test (1.5.211b): every suite in package.json's "testSuites", one after another, stopping at the first that fails.
// The list used to be one long "node a && node b && ..." line, and at 238 suites it passed Windows' 8,191-character
// command-line limit ("The command line is too long."), so the release build ran no tests at all. Now the line is short
// and the list can grow. installer/check-release.js checks every test/run-*.js file is in the list.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const suites = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8').replace(/^﻿/, '')).testSuites || [];
if (!suites.length) { console.error('package.json has no testSuites'); process.exit(1); }
let n = 0;
for (const s of suites) {
  n++;
  const r = spawnSync(process.execPath, [s], { cwd: app, stdio: 'inherit' });
  if (r.status !== 0) { console.error(`\nnpm test stopped at ${s} (${n} of ${suites.length}), exit ${r.status ?? r.signal}`); process.exit(r.status || 1); }
}
console.log(`\nAll ${suites.length} test suites passed.`);
