// Nov 19 2026: quant levels for big brains (public/quant-steps.js). The owner's rules: brains under 35B stay at Q4;
// 35B and up may offer Q3, Q2 and 1-bit-class files; within 3% perplexity drift passes, 3 to 5% also needs the
// real-jobs check and is a smaller option (never the usual), over 5% is never offered; not-checked levels stay hidden
// unless their own switch is on; the menu is off by default. Made-up brains and computers; nothing read from this one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { quantGate, stepChoices, stepParent, isQuantStep, quantName, QUANT_MIN_PARAMS } from '../public/quant-steps.js';
import { brainsHtml, quantPickHtml } from '../public/brains.js';
import { catalogueHtml, modelsFor, BRAINS, quantStepsHtml } from '../public/catalogue.js';
import { pickFor } from '../public/fit.js';
import { mergeSettings } from '../src/config.js';
import { OPT_IN } from '../src/crash-catch.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// Made-up brains: a big one with five lower levels, each with a different check, and a small one with a Q3.
const pin = (name, bytes) => [{ role: 'gguf', url: `https://huggingface.co/x/Big-GGUF/resolve/${'a'.repeat(40)}/${name}`, sha256: 'b'.repeat(64), bytes, verify: true }];
const big = { id: 'big', name: 'Big 120B', params: 120, category: 'chat', jobs: ['bob', 'deep'], sizeGB: 64, vramGB: 16, files: pin('Big-Q4_K_M.gguf', 64e9), status: { state: 'installed' } };
const step = (id, file, sizeGB, quantCheck, extra = {}) => ({ id, name: `Big 120B ${id}`, params: 120, category: 'chat', jobs: ['bob', 'deep'], sizeGB, vramGB: 16, quantOf: 'big', quantCheck, files: pin(file, sizeGB * 1e9), status: { state: 'missing' }, ...extra });
const q3 = step('big-q3', 'Big-UD-Q3_K_XL.gguf', 50, { drift: 1.9, jobs: null });
const q2 = step('big-q2', 'Big-UD-Q2_K_XL.gguf', 40, { drift: 4.2, jobs: 'pass' });
const q2s = step('big-q2s', 'Big-Q2_K_S.gguf', 38, { drift: 4.4, jobs: null });
const iq1 = step('big-iq1', 'Big-UD-IQ1_M.gguf', 30, { drift: 7.5, jobs: null });
const tq1 = step('big-tq1', 'Big-UD-TQ1_0.gguf', 28, null);
const jobsFail = step('big-q3s', 'Big-Q3_K_S.gguf', 46, { drift: 2.1, jobs: 'fail' });
const small = { id: 'small', name: 'Small 27B', params: 27, category: 'chat', jobs: ['bob'], sizeGB: 17, files: pin('Small-Q4_K_M.gguf', 17e9), status: { state: 'installed' } };
const smallQ3 = { ...step('small-q3', 'Small-Q3_K_M.gguf', 13, { drift: 1 }), quantOf: 'small', params: 27 };
const models = [big, q3, q2, q2s, iq1, tq1, jobsFail, small, smallQ3];

// ---- the gate ----
check('within 3% passes', quantGate({ drift: 3 }).verdict === 'pass' && quantGate({ drift: -2.5 }).verdict === 'pass');
check('3 to 5% needs the real-jobs check first', quantGate({ drift: 4 }).verdict === 'needs-jobs' && quantGate({ drift: 4, jobs: 'pass' }).verdict === 'smaller');
check('over 5% fails, even with a real-jobs pass', quantGate({ drift: 5.1, jobs: 'pass' }).verdict === 'fail');
check('a failed real-jobs check fails at any drift', quantGate({ drift: 0.5, jobs: 'fail' }).verdict === 'fail');
check('no check at all is not checked yet', quantGate(null).verdict === 'untested' && quantGate({ drift: null }).verdict === 'untested');
check('the reason says the number', /4\.2%/.test(quantGate({ drift: 4.2, jobs: 'pass' }).why));

// ---- the menu ----
check('off by default: no menu at all', stepChoices(big, models).length === 0 && stepChoices(big, models, { on: false }).length === 0);
const on = stepChoices(big, models, { on: true });
check('on: the usual file first, marked usual', on[0].id === 'big' && on[0].usual && /usual/.test(on[0].label) && /Q4_K_M/.test(on[0].label));
check('on: only levels that passed (Q3) or passed real jobs as a smaller option (Q2)', JSON.stringify(on.map((s) => s.id)) === JSON.stringify(['big', 'big-q3', 'big-q2']), JSON.stringify(on.map((s) => s.id)));
check('the 3-5% one is labelled a smaller option', /smaller option/.test(on.find((s) => s.id === 'big-q2').label));
check('biggest first, each with its size', on[1].sizeGB > on[2].sizeGB && /50 GB/.test(on[1].label));
const all = stepChoices(big, models, { on: true, untested: true });
check('"not checked yet" on: unchecked and half-checked levels show, marked so', ['big-q2s', 'big-tq1'].every((id) => all.some((s) => s.id === id)) && /not checked/.test(all.find((s) => s.id === 'big-tq1').label));
check('over 5% or a failed real-jobs check never shows, even then', !all.some((s) => s.id === 'big-iq1' || s.id === 'big-q3s'));
check('brains under 35B get no menu (they stay at Q4)', stepChoices(small, models, { on: true, untested: true }).length === 0 && QUANT_MIN_PARAMS === 35);
check('a step finds its usual brain', stepParent(q3) === 'big' && isQuantStep(q3) && !isQuantStep(big));
check('the menu is the same from a step', stepChoices(q3, models, { on: true })[0].id === 'big');
check('a failed level you already use still shows, so the menu never lies', stepChoices(iq1, models, { on: true }).some((s) => s.id === 'big-iq1'));
check('1-bit-class names read right', quantName(tq1) === 'TQ1_0' && quantName(iq1) === 'IQ1_M' && quantName(q3) === 'Q3_K_XL');
check('a brain with no lower level gets no menu', stepChoices({ ...big, id: 'lonely' }, models, { on: true }).length === 0);

// ---- never Bob's pick ----
const pickModels = [{ ...q3, trial: false, status: { state: 'installed' }, vramGB: 8, sizeGB: 5, params: 120 }];
check('a quant level is never Bob\'s pick, however well it fits', pickFor('bob', pickModels, { vramGB: 16, ramGB: 32, freeGB: 500 }) === null);

// ---- the Brains page ----
const roles = { options: { llm: [{ value: 'big', label: 'Big 120B' }, { value: 'small', label: 'Small 27B' }] }, current: { bob: 'big', reviewer: 'small' } };
const ctx = { roles, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 900 };
check('Brains page: no menu while the switch is off', !/data-rowquant/.test(brainsHtml(ctx)));
const page = brainsHtml({ ...ctx, quantOn: true });
check('Brains page: the big brain\'s row gets a Quant level menu', /Quant level <select data-rowquant="big"/.test(page));
check('Brains page: only one menu (the small brain gets none)', (page.match(/data-rowquant=/g) || []).length === 1);
check('Brains page: a level not here yet says get it first', /Q3_K_XL · 50 GB \(passed\) \(get it first\)/.test(page));
check('Brains page: the usual file is picked', /<option value="big" selected>/.test(page));
check('Brains page: a download box is ready (asks first, like Get)', /class="model quant-pick"[\s\S]*?<div class="confirm" hidden><\/div>/.test(page));
check('Brains page: the menu takes every job on the row', /data-rowquant="big" data-rowjobs="[^"]*bob/.test(page));
check('quantPickHtml is empty for a brain with no entry', quantPickHtml({ value: 'x', jobs: [], entry: null }, { ...ctx, quantOn: true }) === '');

// ---- the catalogue ----
check('catalogue: a pure quant level is not listed on its own', !modelsFor(BRAINS, models).some((m) => m.quantOf));
const catOff = catalogueHtml({ ...ctx, filters: {} });
check('catalogue: no Quant levels line while off', !/Quant levels:/.test(catOff));
const catOn = catalogueHtml({ ...ctx, quantOn: true, filters: {} });
check('catalogue: the big brain lists its other levels, each with Get', /Quant levels:/.test(catOn) && /data-get="big-q3"/.test(catOn) && /data-get="big-q2"/.test(catOn));
check('catalogue: unchecked levels stay out', !/data-get="big-tq1"/.test(catOn) && !/data-get="big-iq1"/.test(catOn));
check('catalogue: shown on the usual brain\'s row only', quantStepsHtml(q3, { allModels: models, quantOn: true }) === '');

// ---- the real catalogue: Bob's Q3 of Qwen3.6 35B is a level, not checked yet ----
const cat = JSON.parse(read('catalog.json'));
const qwen = cat.models.find((m) => m.id === 'qwen3.6-35b-a3b');
check('real list: Qwen3.6 35B has no passed level yet (Addendum 57 not run), so nothing shows', stepChoices(qwen, cat.models, { on: true }).length === 0);
check('real list: with "not checked yet" on, its Q3 shows, marked so', /Q3_K_XL · 17\.7 GB \(not checked yet\)/.test(stepChoices(qwen, cat.models, { on: true, untested: true })[1]?.label || ''));
check('real list: every quant level has a usual brain of 35B or more', cat.models.filter((m) => m.quantOf).every((m) => (cat.models.find((x) => x.id === m.quantOf)?.params || 0) >= 35));
check('real list: every quant level is pinned like any brain', cat.models.filter((m) => m.quantOf).every((m) => m.files.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && /^[0-9a-f]{64}$/.test(f.sha256))));

// ---- settings: off unless switched on, and Safe start turns them off ----
check('both switches start off', mergeSettings({}, {}).quantPicker !== true && mergeSettings({}, {}).quantUntested !== true);
check('only a real true turns them on', mergeSettings({}, { quantPicker: 'yes' }).quantPicker === false && mergeSettings({}, { quantPicker: true }).quantPicker === true);
check('Safe start turns them off', OPT_IN.includes('quantPicker') && OPT_IN.includes('quantUntested'));
const pages = read('public/cellar-pages.js');
check('Settings has both switches, always drawn', /sswitch\('quantPicker'/.test(pages) && /\$\{sswitch\('quantUntested'/.test(pages));
const server = read('src/server.js');
check('the server saves and returns both', /for \(const k of \['quantPicker', 'quantUntested'\]\)/.test(server) && /quantPicker: cfg\.quantPicker === true/.test(server));

// ---- Help ----
const faq = HELP.find((h) => h.id === 'faq-quant-level');
check('Help has the FAQ in Bob\'s voice, with the 3% and 5% rules', faq && /\bI\b/.test(faq.html) && /3%/.test(faq.html) && /5%/.test(faq.html) && /35B/.test(faq.html));
check('the FAQ says where it doesn\'t reach (the phone app)', /phone app/.test(faq.html) && /Windows, Mac and Linux/.test(faq.html));
const gl = HELP.find((h) => h.id === 'glossary').html;
check('the glossary explains Quant level and Perplexity drift', /<dt>Quant level<\/dt>/.test(gl) && /<dt>Perplexity drift<\/dt>/.test(gl));
check('the Brains page Help mentions the menu', /Quant level/.test(HELP.find((h) => h.id === 'brains-page').html));
check('the catalogue Help mentions the levels', /Quant levels/.test(HELP.find((h) => h.id === 'catalogue').html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
