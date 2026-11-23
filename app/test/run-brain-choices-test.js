// Nov 18 2026: one rule for every brain menu (public/brain-choices.js), the Brains page as one row per brain, the
// catalogue's one Brains list, and no brain listed twice. Made-up roles and computers; nothing read from this one.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { takesJob, brainChoices, choiceOptions } from '../public/brain-choices.js';
import { brainsHtml, brainRows, rowChoices, addableJobs, specHtml } from '../public/brains.js';
import { catalogueHtml, modelsFor, BRAINS, madeForHtml } from '../public/catalogue.js';
import { slotTakes, kitFor, allSlots, entryOf, isActive } from '../public/equip.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('catalog.json'));
const have = ['qwen3.6-35b-a3b', 'gpt-oss-120b-mxfp4', 'gpt-oss-20b', 'qwen3-4b'];
const models = catalog.models.map((m) => ({ ...m, status: { state: have.includes(m.id) ? 'installed' : 'missing', located: {} } }));
const options = { llm: have.map((id) => ({ value: id, label: models.find((m) => m.id === id).name })) };
const byId = (id) => models.find((m) => m.id === id);
const slot = (id) => allSlots().find((s) => s.id === id);

// ---- the one rule ----
check('a brain made for a job takes it, and says so', takesJob('bob', { entry: byId('qwen3.6-35b-a3b') }).made === true);
check('a big brain can be the Quick brain if you pick it (not made for it)', takesJob('small', { entry: byId('gpt-oss-120b-mxfp4') }).ok === true && takesJob('small', { entry: byId('gpt-oss-120b-mxfp4') }).made === false);
check('Gaming stays strict: only brains timed on a busy processor', takesJob('gaming', { entry: byId('gpt-oss-120b-mxfp4') }).ok === false && takesJob('gaming', { entry: byId('qwen3-4b') }).ok === true);
check('Seeing pictures needs a brain that sees', takesJob('eyes', { entry: byId('gpt-oss-20b') }).ok === false && takesJob('eyes', { entry: byId('qwen3.6-35b-a3b') }).ok === true);
check('a picture model is never offered for a thinking job', takesJob('bob', { entry: { id: 'z', category: 'images' } }).ok === false);
check('a brain the engine knows only by name, that chats, is offered', takesJob('reviewer', { name: 'mystery:7b', caps: ['completion'] }).ok === true);

const list = brainChoices('bob', { options: options.llm, entryOf: byId, current: 'qwen3.6-35b-a3b' });
check('the main brain menu lists every brain on this computer', have.every((id) => list.some((c) => c.value === id)), JSON.stringify(list.map((c) => c.value)));
check('the one in the job now comes first', list[0].value === 'qwen3.6-35b-a3b');
const small = brainChoices('small', { options: options.llm, entryOf: byId });
check('brains made for the job come before the rest', small[0].value === 'qwen3-4b' && small.slice(1).every((c) => !c.made));
check('a brain not made for the job is marked, never hidden', /gpt-oss 120B \(not made for this job\)/.test(choiceOptions(small)));
check('a picked brain whose file is gone still shows as the one picked', brainChoices('small', { options: options.llm, entryOf: byId, current: 'gemma4-e4b' })[0].value === 'gemma4-e4b' && /not on this replicant matrix/.test(brainChoices('small', { options: options.llm, entryOf: byId, current: 'gemma4-e4b' })[0].label));
check('Active off hides a brain from the menus', !brainChoices('bob', { options: options.llm, entryOf: byId, isActive: (k) => k.value !== 'gpt-oss-20b' }).some((c) => c.value === 'gpt-oss-20b'));
const naughty = { llm: [...options.llm, { value: 'n1', label: 'N' }] };
const nEntry = (v) => (v === 'n1' ? { id: 'n1', category: 'chat', jobs: ['bob'], naughty: true } : byId(v));
check('the naughty list stays out of the menus while its switch is off', !brainChoices('bob', { options: naughty.llm, entryOf: nEntry }).some((c) => c.value === 'n1') && brainChoices('bob', { options: naughty.llm, entryOf: nEntry, naughtyOn: true }).some((c) => c.value === 'n1'));

const ctx = { roles: { options, current: { bob: 'qwen3.6-35b-a3b', reviewer: 'gpt-oss-120b-mxfp4' } }, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 900, spec: '16 GB card · 8-core processor · 32 GB memory' };
check('every picker uses the same rule (slotTakes)', slotTakes(slot('small'), 'gpt-oss-120b-mxfp4', ctx) === true && slotTakes(slot('gaming'), 'gpt-oss-120b-mxfp4', ctx) === false);
check('the Senses-style kit lists a brain you have for any thinking job', kitFor(slot('small'), ctx).some((k) => k.installed && k.value === 'gpt-oss-120b-mxfp4'));
check('downloads in a kit stay the ones made for the job', !kitFor(slot('small'), ctx).some((k) => !k.installed && k.entry?.id === 'gpt-oss-120b-mxfp4'));

// ---- the Brains page: one row per brain ----
const { main, others } = brainRows(ctx);
check('the main brain is its own row', main?.value === 'qwen3.6-35b-a3b' && others.length === 1 && others[0].value === 'gpt-oss-120b-mxfp4');
const html = brainsHtml(ctx);
check('the main row has one picker and says it does every other job', /🧠 Main brain/.test(html) && /data-rowbrain="qwen3\.6-35b-a3b"/.test(html) && /Every job no other brain has\./.test(html));
check('a row for each other brain, with its own picker', /data-rowbrain="gpt-oss-120b-mxfp4" data-rowjobs="reviewer"/.test(html));
check('+ Add a brain: pick a brain, tick its jobs', /\+ Add a brain/.test(html) && /data-addbrain/.test(html) && addableJobs().every((s) => html.includes(`data-addjob="${s.id}"`)) && !html.includes('data-addjob="bob"'));
check('a brain file can be added right there', /data-ownadd/.test(html));
check('no setup cards or Unassigned jobs any more', !/setup-card/.test(html) && !/Unassigned jobs/.test(html));
check('this computer as read: card, processor, memory, free drive', /16 GB card · 8-core processor · 32 GB memory · 900 GB free on the drive/.test(specHtml(ctx)));
check('Calibrate stays on every row', (html.match(/data-calibrate="/g) || []).length >= 3);
const one = brainsHtml({ ...ctx, oneBrain: true });
check('One brain: one picker only, the other picks kept', (one.match(/data-rowbrain=/g) || []).length === 1 && /keeps its jobs for when it's off/.test(one) && /Adding a brain turns One brain off/.test(one));
check('One brain: the main picker offers every brain you have', have.every((id) => new RegExp(`<option value="${id.replace(/\./g, '\\.')}"`).test(one.split('data-rowbrain')[1].split('</select>')[0])));
const gamingRow = rowChoices([slot('gaming')], ctx, 'qwen3-4b');
check('a row with Gaming only offers brains that can game', gamingRow.every((c) => c.value === 'qwen3-4b'));

// ---- the catalogue: each brain once ----
const cat = catalogueHtml({ ...ctx, models, naughtyOn: false, catView: 'well', filters: {} });
const rows120 = (cat.match(/id="cat-[\w-]+-gpt-oss-120b[\w-]*"/g) || []);
check('gpt-oss 120B is listed once in the catalogue', rows120.length === 1, JSON.stringify(rows120));
check('brains sit in one Brains list, not under every job', /id="catjob-brains"/.test(cat) && !/id="catjob-deep"/.test(cat) && !/id="catjob-bob"/.test(cat));
check('each brain row says the jobs it was made for', /Brain · Deep thinking · Review · Coding · Office/.test(madeForHtml(byId('gpt-oss-120b-mxfp4')).replace(/<[^>]+>/g, '')));
check('the Brains list can show only one job\'s brains', /data-catbrainjob/.test(cat) && !catalogueHtml({ ...ctx, models, naughtyOn: false, catView: 'well', filters: {}, focus: 'gaming' }).includes('id="cat-brains-gpt-oss-120b-mxfp4"'));
check('a brain here says In use, or offers to be the main brain', /data-catequip="bob" data-catvalue="gpt-oss-20b">Use as main brain/.test(cat) && /cat-brains-gpt-oss-120b-mxfp4[\s\S]*?In use/.test(cat));
check('the media jobs keep their own sections', /id="catjob-voice"/.test(cat) && /id="catjob-image"/.test(cat));
check('every brain job has its brains in the one list', modelsFor(BRAINS, models).length >= modelsFor(slot('bob'), models).length);

// ---- the catalogue file: no brain twice ----
const seen = new Map();
for (const m of catalog.models) for (const f of m.files || []) if (f.sha256 && /^gguf/.test(f.role)) { if (seen.has(f.sha256)) check(`one entry per brain file (${m.id} and ${seen.get(f.sha256)})`, false); seen.set(f.sha256, m.id); }
const names = new Map();
for (const m of catalog.models) { const k = m.name.toLowerCase(); if (names.has(k)) check(`one entry per brain name (${m.id} and ${names.get(k)})`, false); names.set(k, m.id); }
check('no two catalogue entries share a brain file or a name', true);
check('the merged 120B kept the old id and gained its experts and Research', byId('gpt-oss-120b-mxfp4').experts === true && byId('gpt-oss-120b-mxfp4').jobs.includes('scout') && !byId('gpt-oss-120b-gguf'));

// ---- the scan looks again ----
const src = read('src/models.js'), server = read('src/server.js');
check('Bob looks for brain files at every start, not only the first', /\nshop\.scan\(\)\.catch/.test(server) && !/if \(!shop\.found\.at\) shop\.scan/.test(server));
check('an old look is refreshed in the background when the list is asked for', /freshen\(maxAgeMs = 10 \* 60e3\)/.test(src) && /async list\(\) \{\n    this\.freshen\(\);/.test(src));
check('the window picker falls back to Bob\'s own picker when it answers empty at once', /Date\.now\(\) - t0 < 500/.test(read('public/cellar.js')));

// ---- Help ----
const help = (id) => HELP.find((h) => h.id === id)?.html || '';
check('Help: the Brains page explains the main brain and + Add a brain', /Main brain/.test(help('brains-page')) && /\+ Add a brain/.test(help('brains-page')));
check('FAQ: any brain for any job', /any brain/i.test(HELP.find((h) => h.id === 'faq-pick-any-brain')?.title || ''));
check('Glossary: Main brain and Not made for this job', /<dt>Main brain<\/dt>/.test(help('glossary')) && /<dt>Not made for this job<\/dt>/.test(help('glossary')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
