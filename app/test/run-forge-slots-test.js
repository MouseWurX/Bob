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
{ const p2 = JSON.parse(fs.readFileSync(path.join(root, 'model-lab/forge/plans/jobs-after2.json'), 'utf8').replace(/\r\n/g, '\n'));
  const m2 = p2.benchmark.models[0], c2 = m2.commands.find((x) => /jobs-matrix/.test(x));
  check(`the after2 rerun (mail + office) fits its card (${slotsUsed(c2)} of ${m2.slots} slots, 32K each), mail at Minimus and Medius only, office scored`, slotsUsed(c2) <= m2.slots && Math.floor(m2.ctx / m2.slots) === 32768 && !/magnus|maximus/.test(c2) && /office=--jobs [^;"]*office-jobs/.test(c2) && m2.commands.some((x) => /office-score\.mjs --runs [^ ]*after2-office/.test(x))); }
{ const rd = (f) => fs.readFileSync(path.join(root, 'model-lab/forge/pod', f), 'utf8').replace(/\r\n/g, '\n');
  const b = rd('llama-server-build.sh'), r = rd('run.sh');
  check('the pod builds llama-server without the web page (after2 died on a partial UI asset set)', /-DLLAMA_BUILD_UI=OFF -DLLAMA_USE_PREBUILT_UI=OFF/.test(b) && /rm -rf \$L\/tools\/ui\/dist/.test(b));
  check('a serve-only run with no llama-server ends failed, not finished', /llama-server-ready \] \|\| die "benchmark_only: no CUDA llama-server/.test(r)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
