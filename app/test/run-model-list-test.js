// The README's "Supported brains" list is written from catalog.json by installer/make-model-list.js. This keeps the
// two in step: after changing catalog.json, run `node installer/make-model-list.js` from the app folder.
import fs from 'node:fs';
import { quantOf, tierOf, statusOf, licenceOf, modelList, writeList, MEASURED } from '../installer/make-model-list.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('../catalog.json'));

check('quant levels are read from file names', quantOf('Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf') === 'UD-Q4_K_XL' && quantOf('gemma-4-E4B-it-Q4_0.gguf') === 'Q4_0' && quantOf('gpt-oss-20b-MXFP4.gguf') === 'MXFP4' && quantOf('x-IQ4_XS.gguf') === 'IQ4_XS' && quantOf('model.safetensors') === '');
check('tiers come from the graphics memory a brain wants, with RAM for the rest', tierOf({ vramGB: 2, sizeGB: 1 }).startsWith('Any computer') && tierOf({ vramGB: 6, sizeGB: 5 }) === '6 GB card' && tierOf({ vramGB: 16, sizeGB: 23.3 }) === '16 GB card, the rest in RAM' && /several cards/.test(tierOf({ vramGB: 66, sizeGB: 63 })));
check('untried brains say unproven, in those words', statusOf({ trial: true }) === 'Unproven in our lab, as we have yet to test' && statusOf({}) === 'Tried in our lab');
check('every measured brain is in the catalogue', Object.keys(MEASURED).every((id) => catalog.models.some((m) => m.id === id)));
check('a licence that limits commercial use says so', /limits commercial use/.test(licenceOf({ license: 'X', commercial: false })) && licenceOf({ license: 'MIT', commercial: true }) === 'MIT');
const list = modelList(catalog);
check('every catalogue entry is listed once', catalog.models.filter((m) => !m.gated).every((m) => list.split('\n').filter((l) => l.startsWith(`| ${m.name.replace(/\|/g, '/')} |`)).length >= 1));
check('uncensored brains are kept in their own folded list', (() => { const i = list.indexOf('Uncensored brains'); return catalog.models.filter((m) => m.naughty).every((m) => list.indexOf(`| ${m.name} |`, i) > i); })());
const readme = read('../../README.md');
check('README.md\'s model list matches catalog.json (run node installer/make-model-list.js)', writeList(readme, catalog) === readme);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
