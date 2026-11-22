// Runs every test file in this folder (test/*.test.js), one after another, in this one program.
// A file that stops with an error counts as one failed check and its error is printed.
// Ends with exit code 1 when any check failed.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { check, totals } from './check.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const files = fs.readdirSync(here).filter((f) => f.endsWith('.test.js')).sort();
for (const f of files) {
  console.log(`# ${f}`);
  try { await import(pathToFileURL(path.join(here, f)).href); }
  catch (e) { check(`${f} ran to the end`, false, 'it stopped with an error'); console.log(e?.stack || String(e)); }
}
const t = totals();
console.log(`\n${t.pass} passed, ${t.fail} failed (${files.length} test files)`);
process.exit(t.fail ? 1 : 0);
