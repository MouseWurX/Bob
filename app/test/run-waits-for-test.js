// Nov 20 2026: brains that wait for a newer Brain Engine (a new kind of brain inside, e.g. KRAFTON's Raon) are listed
// in the Brain catalogue, never recommended, and can't be downloaded until the catalog drops their waitsFor line.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { suit, pickFor } from '../public/fit.js';
import { FAMILIES } from '../public/catalogue.js';
import { HELP } from '../public/help-content.js';
import { ModelShop } from '../src/models.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
const models = catalog.models.map((m) => ({ ...m, status: { state: 'missing' } }));
const raon = models.filter((m) => m.family === 'Raon');

check('both Raon text brains are listed', ['raon-1-nano', 'raon-1-mini-preview'].every((id) => raon.some((m) => m.id === id)));
check('each waits for Brain Engine and says why', raon.every((m) => typeof m.waitsFor === 'string' && /Brain Engine/.test(m.waitsFor)));
check('each is pinned: commit in the link, bytes and sha256', raon.every((m) => m.files.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && f.bytes > 0 && /^[0-9a-f]{64}$/.test(f.sha256))));
check('each is Q4 or better', raon.every((m) => m.files.every((f) => /Q4_K_M|Q5|Q6|Q8/.test(f.url))));
check('Raon has a family blurb', Boolean(FAMILIES.Raon));

const hw = { vramGB: 16, ramGB: 32, freeGB: 500 };
const fakeWaits = { id: 'x', category: 'chat', jobs: ['bob'], sizeGB: 2, vramGB: 3, waitsFor: 'Needs a newer engine.', files: [] };
const s = suit(fakeWaits, hw, 'win32');
check('a waiting brain is blocked with its own reason', s.level === 'blocked' && s.waits === true && s.why === 'Needs a newer engine.');
check('...on every platform', ['win32', 'darwin', 'linux'].every((p) => suit(fakeWaits, hw, p).level === 'blocked'));
check('the same brain without waitsFor is not blocked', suit({ ...fakeWaits, waitsFor: undefined }, hw, 'win32').level !== 'blocked');
const untried = raon.map((m) => ({ ...m, trial: false }));
check('never Bob\'s pick, even once tried', ['bob', 'small', 'office', 'scout'].every((j) => !untried.some((m) => pickFor(j, untried, { ...hw, platform: 'win32' })?.id === m.id)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-waits-'));
const cfg = { dataDir: tmp, bobModelsDir: path.join(tmp, 'models') };
const shop = new ModelShop(cfg, () => {});
let err = '';
try { shop.describe('raon-1-nano'); } catch (e) { err = e.message; }
check('the shop refuses to download it and says why', /can't be got yet/.test(err) && /Brain Engine/.test(err), err);
fs.rmSync(tmp, { recursive: true, force: true });

const ids = new Set(HELP.map((h) => h.id));
check('Help has the FAQ', ids.has('faq-waiting-engine'));
const gloss = HELP.find((h) => h.id === 'glossary');
check('the glossary explains the tag', /<dt>Waiting for Brain Engine<\/dt>/.test(gloss.html));
check('the catalogue Help mentions the tag', /Waiting for Brain Engine/.test(HELP.find((h) => h.id === 'catalogue').html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
