// Nov 19-20 2026: quant levels (public/quant-steps.js). The owner's rules: every level is listed ("quality should be a
// choice the user makes"), each with its check and whether Bob recommends it: within 3% perplexity drift, or 3 to 5%
// plus the real-jobs check, on a brain of 35B or more. The usual file is the default and never replaced by Bob; the
// menu is off by default. Made-up brains and computers; nothing read from this one.
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
check('on: every level is listed, nothing hidden (the owner: quality is the user\'s choice)', JSON.stringify(on.map((s) => s.id)) === JSON.stringify(['big', 'big-q3', 'big-q3s', 'big-q2', 'big-q2s', 'big-iq1', 'big-tq1']), JSON.stringify(on.map((s) => s.id)));
const r = (id) => on.find((s) => s.id === id);
check('recommended: within 3%, and 3-5% with a real-jobs pass', r('big').recommended && r('big-q3').recommended && r('big-q2').recommended);
check('not recommended, but listed with the reason: 3-5% without real jobs, over 5%, failed real jobs, not checked', ['big-q2s', 'big-iq1', 'big-q3s', 'big-tq1'].every((id) => !r(id).recommended && /not recommended/.test(r(id).label)));
check('labels say how each did', /smaller option/.test(r('big-q2').label) && /failed my check/.test(r('big-iq1').label) && /not checked yet/.test(r('big-tq1').label) && /7\.5%/.test(r('big-iq1').why));
check('biggest first, each with its size', on.every((s, i) => !i || i === 1 || on[i - 1].sizeGB >= s.sizeGB) && /50 GB/.test(on[1].label));
const sm = stepChoices(small, models, { on: true });
check('a brain under 35B gets the menu too, its levels never recommended, with why', sm.length === 2 && !sm[1].recommended && /under 35B/.test(sm[1].why) && QUANT_MIN_PARAMS === 35);
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
check('Brains page: the small brain gets its menu too', /data-rowquant="small"/.test(page));
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
check('catalogue: unchecked and failed levels are listed too, marked not recommended', /data-get="big-tq1"/.test(catOn) && /data-get="big-iq1"/.test(catOn) && /not recommended/.test(catOn));
check('catalogue: shown on the usual brain\'s row only', quantStepsHtml(q3, { allModels: models, quantOn: true }) === '');

// ---- the real catalogue: Bob's Q3 of Qwen3.6 35B is a level, not checked yet ----
const cat = JSON.parse(read('catalog.json'));
const qwen = cat.models.find((m) => m.id === 'qwen3.6-35b-a3b');
check('real list: Qwen3.6 35B lists its Q3, not checked yet (Addendum 57 not run), not recommended', /Q3_K_XL · 17\.7 GB \(not checked yet, not recommended\)/.test(stepChoices(qwen, cat.models, { on: true })[1]?.label || ''));
check('real list: every quant level has its usual brain', cat.models.filter((m) => m.quantOf).every((m) => cat.models.some((x) => x.id === m.quantOf)));
check('real list: every quant level is pinned like any brain', cat.models.filter((m) => m.quantOf).every((m) => m.files.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && /^[0-9a-f]{64}$/.test(f.sha256))));

// ---- settings: off unless switched on, and Safe start turns them off ----
check('the switch starts off', mergeSettings({}, {}).quantPicker !== true);
check('only a real true turns them on', mergeSettings({}, { quantPicker: 'yes' }).quantPicker === false && mergeSettings({}, { quantPicker: true }).quantPicker === true);
check('Safe start turns it off', OPT_IN.includes('quantPicker'));
const pages = read('public/cellar-pages.js');
check('Settings has the switch, and no second one hiding levels', /sswitch\('quantPicker'/.test(pages) && !/quantUntested/.test(pages));
const server = read('src/server.js');
check('the server saves and returns it', /for \(const k of \['quantPicker'\]\)/.test(server) && /quantPicker: cfg\.quantPicker === true/.test(server));

// ---- Help ----
const faq = HELP.find((h) => h.id === 'faq-quant-level');
check('Help has the FAQ in Bob\'s voice, with the 3% and 5% rules, and that the choice is yours', faq && /\bI\b/.test(faq.html) && /3%/.test(faq.html) && /5%/.test(faq.html) && /35B/.test(faq.html) && /your call/.test(faq.html));
check('the FAQ says where it doesn\'t reach (the phone app)', /phone app/.test(faq.html) && /Windows, Mac and Linux/.test(faq.html));
const gl = HELP.find((h) => h.id === 'glossary').html;
check('the glossary explains Quant level and Perplexity drift', /<dt>Quant level<\/dt>/.test(gl) && /<dt>Perplexity drift<\/dt>/.test(gl));
check('the Brains page Help mentions the menu', /Quant level/.test(HELP.find((h) => h.id === 'brains-page').html));
check('the catalogue Help mentions the levels', /Quant levels/.test(HELP.find((h) => h.id === 'catalogue').html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
