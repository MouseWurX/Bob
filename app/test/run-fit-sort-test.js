// 1.5.210 "Fits your card" badges and Best fit first in the Brain catalogue (public/fit-sort.js). Made-up machines
// only: nothing here reads this computer's card, memory or folders.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fitOf, byFit, sortOf, SORTS, FIT_RANK } from '../public/fit-sort.js';
import { catalogueHtml } from '../public/catalogue.js';
import { placeFor } from '../public/place.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('catalog.json'));
const models = catalog.models.map((m) => ({ ...m, status: { state: 'missing' } }));
const byId = (id) => models.find((m) => m.id === id);

// Machines of every kind, none of them this one.
const BIG = { vramGB: 16, ramGB: 32, freeGB: 900 };
const LAPTOP = { vramGB: 6, ramGB: 16, freeGB: 300 };
const MAC = { vramGB: 27, ramGB: 36, unified: true, freeGB: 500 };
const NOCARD = { vramGB: 0, ramGB: 16, freeGB: 200 };
const UNREAD = {};

{
  check('a small brain fits a 16 GB card, with the plain badge', fitOf(byId('qwen3-4b'), BIG)?.where === 'card' && fitOf(byId('qwen3-4b'), BIG).word === 'Fits your card' && fitOf(byId('qwen3-4b'), BIG).good);
  check('a brain bigger than the card but not memory: card + memory', fitOf(byId('qwen3.6-27b'), BIG)?.where === 'memory');
  const big = byId('gpt-oss-120b-mxfp4');
  check('a 63 GB brain made of experts on 16 GB + 32 GB: part read from the drive', fitOf(big, BIG)?.where === 'storage' && fitOf(big, BIG).word === 'Card + memory + storage');
  check('the same brain on a 6 GB laptop is too big for home', fitOf(big, LAPTOP)?.where === 'rent');
  check('...unless another Bob on the Bob-Net lends his card: then with his help', fitOf(big, LAPTOP, [{ name: 'Den Bob', vramGB: 24, ramGB: 64 }])?.where === 'help' && /Den Bob's help/.test(fitOf(big, LAPTOP, [{ name: 'Den Bob', vramGB: 24, ramGB: 64 }]).word));
  check('the badge and the Brains page agree (both use placeFor)', ['qwen3-4b', 'qwen3.6-27b', 'gpt-oss-120b-mxfp4', 'qwen3.6-35b-a3b'].every((id) => fitOf(byId(id), BIG).where === placeFor(byId(id), BIG, []).where));
  check('a Mac says Fits in memory, not your card', fitOf(byId('qwen3.6-27b'), MAC)?.word === 'Fits in memory');
  check('no graphics card: a brain runs in memory on the processor, said plainly, and no card badge', fitOf(byId('qwen3-4b'), NOCARD)?.where === 'memory' && fitOf(byId('qwen3-4b'), NOCARD).word === 'In memory, on the processor' && !fitOf(byId('qwen3-4b'), NOCARD).good);
  check('a machine not read yet gets no badge (no guessing)', fitOf(byId('qwen3-4b'), UNREAD) === null);
  check('a squeezed file meant for smaller cards says so on a big card', fitOf(byId('qwen3.6-35b-a3b-q3'), BIG)?.where === 'squeezed');
  check('no room on the drive: can\'t install here', fitOf(byId('qwen3.6-27b'), { ...BIG, freeGB: 1 })?.where === 'blocked');
}

{
  const list = ['gpt-oss-120b-mxfp4', 'qwen3.6-27b', 'qwen3-4b', 'gemma4-e4b', 'qwen3.6-35b-a3b-q3'].map(byId);
  const out = byFit(list, BIG).map((m) => m.id);
  check('Best fit first: card, then card + memory, then storage, then the squeezed file last', out.indexOf('gemma4-e4b') < out.indexOf('qwen3.6-27b') && out.indexOf('qwen3.6-27b') < out.indexOf('gpt-oss-120b-mxfp4') && out.at(-1) === 'qwen3.6-35b-a3b-q3', out.join());
  check('inside a place the bigger brain comes first', out.indexOf('gemma4-e4b') < out.indexOf('qwen3-4b'));
  check('the order follows the machine, not a fixed list', byFit(list, LAPTOP).map((m) => m.id).join() !== out.join());
  check('an unread machine keeps the list as it is', byFit(list, UNREAD).map((m) => m.id).join() === list.map((m) => m.id).join());
  check('every rank is a number and card is first', Object.values(FIT_RANK).every((n) => typeof n === 'number') && FIT_RANK.card === 0);
  check('the remembered sort is pick unless fit was chosen', sortOf('fit') === 'fit' && sortOf('x') === 'pick' && sortOf(null) === 'pick' && SORTS.map((s) => s.id).join() === 'pick,fit');
}

{
  const ctx = { roles: { current: {}, options: {} }, models, brains: {}, embed: '', active: {}, packs: [], famOpen: {}, bobNet: [], ...BIG };
  const pick = catalogueHtml(ctx), fit = catalogueHtml({ ...ctx, catSort: 'fit' });
  check('the sort bar is on the catalogue, with my pick chosen to start', /class="cat-sort"/.test(pick) && /aria-checked="true" data-catsort="pick"/.test(pick) && /data-catsort="fit"/.test(pick));
  check('Best fit first shows one list per job instead of family folds', /fit-list/.test(fit) && !/<details class="cat-fam"/.test(fit) && /<details class="cat-fam"/.test(pick));
  check('rows that fit the card carry the badge', /class="tag good fit-tag"[^>]*>Fits your card</.test(pick));
  check('the same catalogue on a laptop shows fewer card badges', (catalogueHtml({ ...ctx, ...LAPTOP }).match(/fit-tag/g) || []).length < (pick.match(/fit-tag/g) || []).length);
  check('no badges before the machine is read', !/fit-tag/.test(catalogueHtml({ ...ctx, vramGB: null, ramGB: null, freeGB: null })));
  check('the sort adds nothing to what the brain reads (it lives in the page only)', !/fit-sort/.test(read('src/brain.js')) && !/catSort/.test(read('src/brain.js')));
}

{
  const h = HELP.find((x) => x.id === 'catalogue');
  check('Help explains the badge and the sort in Bob\'s words', h && /Fits your card/.test(h.html) && /Best fit first/.test(h.html));
  const g = HELP.find((x) => x.id === 'glossary');
  check('glossary: Best fit first', /<dt>Best fit first<\/dt>/.test(g.html));
  check('FAQ: which brain fits my computer', HELP.some((x) => x.id === 'faq-what-fits' && /Best fit first/.test(x.html)));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
