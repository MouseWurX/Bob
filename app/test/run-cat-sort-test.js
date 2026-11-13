// 1.5.208 the Brain catalogue's sort, filters and maker tags (public/cat-sort.js). Made-up brains and computers only.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { makerKind, officialTag, isReap, reapTag, looksNaughty, fitsHere, cleanFilters, filtersOn, quantsOf, applyFilters, sortModels, filterBarHtml, SORTS, MAKERS, FITS } from '../public/cat-sort.js';
import { catalogueHtml, isNaughty } from '../public/catalogue.js';
import { HELP } from '../public/help-content.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const gguf = (name) => [{ url: `https://example.invalid/${name}.gguf`, role: 'gguf' }];
const brain = (id, o = {}) => ({ id, name: id, family: 'Qwen', category: 'chat', jobs: ['bob'], sizeGB: 10, vramGB: 11, license: 'Apache 2.0', files: gguf(`${id}-Q4_K_M`), ...o });
const A = brain('a-new', { published: '2026-08-01', sizeGB: 18, vramGB: 19 });
const B = brain('b-old', { published: '2025-01-01', sizeGB: 4, vramGB: 5, files: gguf('b-Q8_0') });
const C = brain('c-nodate', { sizeGB: 9, vramGB: 10, community: { by: 'somebody', base: 'Qwen', baseBy: 'Alibaba' }, files: gguf('c-Q3_K_M') });
const R = brain('r-reap', { name: 'Thing 20B REAP', sizeGB: 12, vramGB: 13, published: '2026-09-01', community: { by: 'smallteam', kind: 'reap' } });
const N = brain('n-naughty', { naughty: true, community: { by: 'x', kind: 'uncensored' } });
const BOB = brain('bob-own', { family: 'Bob', madeByBob: true });
const BIG = brain('big-experts', { sizeGB: 63, vramGB: 66, activeParams: 5, params: 117, family: 'GPT-OSS', files: gguf('big-MXFP4') });
const DENSE = brain('big-dense', { sizeGB: 63, vramGB: 66, experts: false });
const all = [A, B, C, R, N, BOB, BIG, DENSE];

// ---- who made it ----
check('a catalogue brain in a lab\'s family is an official release by that lab', makerKind(A).kind === 'official' && makerKind(A).by === 'Alibaba' && makerKind(BIG).by === 'OpenAI');
check('a community build and a naughty brain are community; Bob\'s own is its own kind', makerKind(C).kind === 'community' && makerKind(C).by === 'somebody' && makerKind(N).kind === 'community' && makerKind(BOB).kind === 'bob');
check('an added page is official only from a lab\'s own account', makerKind({ source: { repo: 'Qwen/Qwen3-GGUF' } }).kind === 'official' && makerKind({ source: { repo: 'nvidia/x' } }).by === 'NVIDIA' && makerKind({ source: { repo: 'somebody/Qwen3-GGUF' } }).kind === 'community' && makerKind({ source: { repo: 'somebody/Qwen3-GGUF' } }).by === 'somebody');
check('the Official tag names the lab and only official brains wear it', /Official · Alibaba/.test(officialTag(A)) && officialTag(C) === '' && officialTag(BOB) === '');
// ---- REAP is not naughty ----
check('a REAP cut is known by its mark or its name', isReap(R) && isReap({ reap: true }) && isReap({ name: 'qwen-reap-20b' }) && !isReap(A) && !isReap({ name: 'Reaper 7B' }));
check('a REAP cut is not naughty, and its tag says the refusals are untouched', !isNaughty(R) && !looksNaughty(R.name) && /REAP cut/.test(reapTag(R)) && /not a naughty-list brain/.test(reapTag(R)) && reapTag(A) === '');
check('only refusal words make a name look naughty', looksNaughty('Qwen3 abliterated') && looksNaughty('gemma-heretic') && looksNaughty('x-uncensored') && !looksNaughty('Qwen3 REAP pruned') && !looksNaughty('Qwen3 20B'));
// ---- runs here: card, memory, experts on the drive, another Bob, and drive room ----
const pc = { vramGB: 16, ramGB: 32, freeGB: 400 }, laptop = { vramGB: 6, ramGB: 16, freeGB: 400 }, noCard = { vramGB: 0, ramGB: 16, freeGB: 400 };
check('a brain that fits the card just fits, with no tag', fitsHere(B, pc).ok && fitsHere(B, pc).how === 'card' && fitsHere(B, pc).word === '');
check('bigger than the card: fits with memory, and says so', fitsHere(A, pc).ok && fitsHere(A, pc).how === 'memory' && fitsHere(A, pc).word === 'Fits with memory');
check('made of experts and bigger than card and memory: fits with experts on the drive', fitsHere(BIG, pc).ok && fitsHere(BIG, pc).how === 'storage' && fitsHere(BIG, pc).word === 'Fits with experts on the drive');
check('the same size with no experts does not run here', !fitsHere(DENSE, pc).ok && fitsHere(DENSE, pc).how === 'rent');
check('another Bob lending a hand is counted and named', fitsHere(DENSE, pc, [{ name: 'Den', vramGB: 24, ramGB: 64 }]).ok && fitsHere(DENSE, pc, [{ name: 'Den', vramGB: 24, ramGB: 64 }]).word === 'Fits with Den on Bob-Net');
check('no room on the drive: it does not fit, whatever the card', !fitsHere(B, { ...pc, freeGB: 2 }).ok && fitsHere(B, { ...pc, freeGB: 2 }).how === 'drive' && fitsHere({ ...B, status: { state: 'installed' } }, { ...pc, freeGB: 2 }).ok);
check('a small laptop: the 63 GB brain does not run, the 4 GB one does; no card: it runs in memory', !fitsHere(BIG, laptop).ok && fitsHere(B, laptop).ok && fitsHere(B, noCard).ok && fitsHere(B, noCard).how === 'memory');
check('specs not known yet: nothing is ruled out', fitsHere(BIG, {}).ok);
// ---- filters and sorting ----
check('wrong or missing choices fall back to the defaults', JSON.stringify(cleanFilters({ sort: 'x', maker: 7, fits: null, quant: '<b>' })) === JSON.stringify({ sort: 'bob', maker: 'all', fits: 'all', quant: 'all' }) && !filtersOn({}) && filtersOn({ sort: 'newest' }));
check('Made by: official, community, Bob\'s own', applyFilters(all, { maker: 'official' }).every((m) => makerKind(m).kind === 'official') && applyFilters(all, { maker: 'community' }).map((m) => m.id).join() === 'c-nodate,r-reap,n-naughty' && applyFilters(all, { maker: 'bob' }).map((m) => m.id).join() === 'bob-own');
check('Quantization: the list comes from the brains shown, sharpest first, and filters', quantsOf(all).join() === 'Q8_0,MXFP4,Q4_K_M,Q3_K_M' && applyFilters(all, { quant: 'Q8_0' }).map((m) => m.id).join() === 'b-old');
check('Runs here keeps what this computer can run; Fits the card alone keeps less', applyFilters(all, { fits: 'runs' }, pc).some((m) => m.id === 'big-experts') && !applyFilters(all, { fits: 'runs' }, pc).some((m) => m.id === 'big-dense') && !applyFilters(all, { fits: 'card' }, pc).some((m) => m.id === 'a-new' || m.id === 'big-experts') && applyFilters(all, { fits: 'card' }, pc).some((m) => m.id === 'b-old'));
check('the same filter on a smaller computer gives a different list', applyFilters(all, { fits: 'runs' }, laptop).length < applyFilters(all, { fits: 'runs' }, pc).length);
check('newest first, oldest first: brains with no date go last', sortModels([C, B, A], 'newest').map((m) => m.id).join() === 'a-new,b-old,c-nodate' && sortModels([C, B, A], 'oldest').map((m) => m.id).join() === 'b-old,a-new,c-nodate');
check('smallest and biggest first; Bob\'s order leaves the list alone and never changes the one passed in', sortModels([A, B, C], 'small').map((m) => m.id).join() === 'b-old,c-nodate,a-new' && sortModels([A, B, C], 'big')[0].id === 'a-new' && sortModels([C, A, B], 'bob').map((m) => m.id).join() === 'c-nodate,a-new,b-old');
// ---- the bar ----
const bar = filterBarHtml({}, all, 8);
check('the bar always has all four menus and Reset, each labelled', ['sort', 'maker', 'quant', 'fits'].every((k) => new RegExp(`<select data-catfilter="${k}" aria-label="[^"]+">`).test(bar)) && /data-catfilter-reset disabled/.test(bar) && SORTS.length === 6 && MAKERS.length === 4 && FITS.length === 3);
check('with a filter on, Reset unlocks and the count is said', /data-catfilter-reset >/.test(filterBarHtml({ maker: 'official' }, all, 3)) && /3 models match/.test(filterBarHtml({ maker: 'official' }, all, 3)) && /1 model match/.test(filterBarHtml({ quant: 'Q8_0' }, all, 1)));
check('a remembered quantization that no brain has now stays in the menu', /<option value="Q6_K" selected>/.test(filterBarHtml({ quant: 'Q6_K' }, all, 0)));
// ---- in the catalogue ----
{
  const models = all.map((m) => ({ ...m, status: { state: 'missing' } }));
  const ctx = { models, roles: { current: {}, options: { llm: [] } }, brains: {}, active: {}, packs: [], bobNet: [], vramGB: 16, ramGB: 32, freeGB: 400, naughtyOn: false, catView: 'well', showUnsuited: true, famOpen: {} };
  const html = catalogueHtml(ctx);
  check('the catalogue shows the bar, the Official tag and the REAP tag', /class="cat-filters"/.test(html) && /Official · Alibaba/.test(html) && /✂ REAP cut/.test(html));
  check('a REAP cut is in the Well behaved list with the switch off; the naughty brain is not', /id="cat-bob-r-reap"/.test(html) && !/id="cat-bob-n-naughty"/.test(html));
  const sorted = catalogueHtml({ ...ctx, filters: { sort: 'newest' } });
  check('a picked sort lists a job in one run, newest first', /class="kit-list cat-list cat-flat"/.test(sorted) && sorted.indexOf('id="cat-bob-r-reap"') < sorted.indexOf('id="cat-bob-a-new"') && sorted.indexOf('id="cat-bob-a-new"') < sorted.indexOf('id="cat-bob-b-old"') && !/class="kit-list cat-list cat-flat"/.test(html));
  const official = catalogueHtml({ ...ctx, filters: { maker: 'community' } });
  check('Made by: Community leaves the official ones out', /id="cat-bob-c-nodate"/.test(official) && !/id="cat-bob-a-new"/.test(official));
  check('a job left empty by the filters says so', /Nothing here matches the filters above\./.test(catalogueHtml({ ...ctx, filters: { quant: 'Q6_K' } })));
  check('the fit tag says how: memory, or experts on the drive', /place-tag"[^>]*>Fits with memory</.test(html) && /place-tag"[^>]*>Fits with experts on the drive</.test(html));
}
{
  const cellar = publicText('cellar.js');
  check('the choices are remembered in the browser and cleaned when read', /localStorage\.getItem\('bob-cat-filters'\)/.test(cellar) && /cleanFilters\(JSON\.parse/.test(cellar) && /el\.dataset\.catfilter\) \{/.test(cellar) && /'catfilterReset' in b\.dataset/.test(cellar));
  check('no computer is written into the code: the page passes in what it measured', !/vramGB: 16|ramGB: 32/.test(read('public/cat-sort.js')));
  const glossary = HELP.find((h) => h.id === 'glossary').html;
  check('Help: the catalogue page, an FAQ and three glossary entries', /Sort and filter\./.test(HELP.find((h) => h.id === 'catalogue').html) && HELP.some((h) => h.id === 'faq-catalogue-sort' && /Is a REAP cut a naughty brain\?<\/strong> No\./.test(h.html)) && ['Official release', 'REAP cut', 'Runs here'].every((t) => glossary.includes(`<dt>${t}</dt>`)));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
