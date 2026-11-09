// 1.5.62: no test may reach the computer's real Recycle Bin or Trash. On Windows, test scratch files ended up in
// the owner's real Recycle Bin (run-linux-test, then run-selftools-test through removeTool). recycle() now keeps
// to Bob's own trash folder whenever it runs under a test, even with the bin switched on.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { recycle, IN_TEST } from '../src/recycle.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
check('a test run is recognised', IN_TEST === true);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob no bin '));
const inn = path.join(tmp, 'inn'), dataDir = path.join(inn, 'bob'), work = path.join(tmp, 'work');
for (const d of [dataDir, work]) fs.mkdirSync(d, { recursive: true });
const f = path.join(work, 'old notes #1.txt');
fs.writeFileSync(f, 'x');
const cfg = { innDir: inn, dataDir, agentDir: tmp, readRoots: [work], readOnlyRoots: [], recycleBin: true };
const r = recycle(cfg, [f], { roots: [work] });
check('with the bin switched on, a test still throws away into Bob\'s own trash folder', r.gone.length === 1 && r.trashed[path.resolve(f)] && fs.existsSync(r.trashed[path.resolve(f)]), JSON.stringify(r));
check('the file really left its folder', !fs.existsSync(f));
check('...and it is inside the test\'s own folder, not the computer\'s bin', String(r.trashed[path.resolve(f)] || '').startsWith(tmp));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
