// forge/slots.mjs: how many slots a plan command keeps busy (the forge pre-flight's "--parallel within the slots").
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { slotsUsed } = await import(pathToFileURL(path.join(root, 'model-lab/forge/slots.mjs')).href);
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
check('a variant\'s own --parallel wins, the rest take the matrix\'s', slotsUsed('node jobs-matrix.mjs --variants "a=--effort low;b=--parallel 4;c=--parallel 3" --parallel 3 --hours 1') === 10);
check('no --parallel anywhere: do-jobs\' default of 2 each', slotsUsed('node jobs-matrix.mjs --variants "a=x;b=y" --hours 1') === 4);
check('a plain do-jobs command uses its own --parallel', slotsUsed('node do-jobs.mjs --parallel 5 --hours 1') === 5);
const plan = JSON.parse(fs.readFileSync(path.join(root, 'model-lab/forge/plans/jobs-after1-mail-real.json'), 'utf8').replace(/\r\n/g, '\n'));
const m = plan.benchmark.models[0], c = m.commands.find((x) => /jobs-matrix/.test(x));
check(`the after1 plan fits its card (${slotsUsed(c)} of ${m.slots} slots, 32K each)`, slotsUsed(c) <= m.slots && Math.floor(m.ctx / m.slots) === 32768);
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
