// Nov 23 2026: catalogue brains that only a newer Lamplight runs (engineMin, e.g. 37 for KRAFTON's Raon-1).
// Read from a fake Lamplight marker passed in; nothing on the real computer is read.
import fs from 'node:fs';
import { engineShort } from '../src/models.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const marker = (version) => () => JSON.stringify({ version });
const none = () => { throw new Error('ENOENT'); };
const raon = { name: 'Raon-1 nano', engineMin: 37 };

check('an ordinary brain needs nothing', engineShort({ name: 'x' }, { read: none }) === '');
check('no Lamplight here: says so', /needs Lamplight 37 or newer/.test(engineShort(raon, { read: none })) && /has none/.test(engineShort(raon, { read: none })));
check('an older Lamplight: names both', /has Lamplight 36\b/.test(engineShort(raon, { read: marker('brain-engine-36b12359') })));
check('Lamplight 37: fine', engineShort(raon, { read: marker('brain-engine-37b12359') }) === '');
check('a later one: fine', engineShort(raon, { read: marker('brain-engine-40b12400') }) === '');
check('an old-style name counts as too old', /needs/.test(engineShort(raon, { read: marker('brain-engine-b12282') })));
check('it says where to update', /Settings, Engines, Lamplight/.test(engineShort(raon, { read: none })));

const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
for (const id of ['raon-1-mini-preview', 'raon-1-nano']) {
  const m = cat.models.find((x) => x.id === id);
  check(`${id}: in the catalogue, needs Lamplight 37`, m && m.engineMin === 37 && m.family === 'Raon');
  check(`${id}: pinned file with its checksum`, m && m.files.length === 1 && /\/resolve\/[0-9a-f]{40}\//.test(m.files[0].url) && /^[0-9a-f]{64}$/.test(m.files[0].sha256) && m.files[0].bytes > 1e9);
  check(`${id}: not marked gated (KRAFTON's GGUF repos say gated: false, Nov 23 2026)`, m && !m.gated);
}
const shop = fs.readFileSync(new URL('../public/cellar-shop.js', import.meta.url), 'utf8');
check('the card shows the note', /needs a newer Lamplight/.test(shop) && /engineWhy/.test(shop));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
