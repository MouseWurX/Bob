// 1.5.205 the Brains page (public/brains.js): each brain, its jobs and where it sits. Made-up roles and computers.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { setUpHtml, handLock, SETUPS, setupOf, setupPlan, duoNeedsQuick, brainsHtml, brainsInUse, emptyJobs, spareBrains, jobsFor, placeBarHtml, budget, brainJobs, senseSlots, listTopHtml, listRowHtml, listSetUpHtml } from '../public/brains.js';
import { HELP } from '../public/help-content.js';
import { readyList, readyDefaults, readyOrder, SPLITS, splitPicks } from '../public/equip.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${ok ? '' : ' ' + extra}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('catalog.json'));
const have = ['gemma4-e4b', 'bobert-35b', 'riker-28b-q3', 'qwen3-4b'];
const models = catalog.models.map((m) => ({ ...m, status: { state: have.includes(m.id) ? 'installed' : 'missing' } }));
const roles = {
  current: { bob: 'riker-28b-q3', tinker: 'bobert-35b', reviewer: 'bobert-35b', eyes: 'gemma4-e4b', image: '', speech: 'windows', voice: '' },
  options: { llm: have.map((id) => ({ value: id, label: models.find((m) => m.id === id).name })), images: [], edit: [], video: [], voice: [], speech: [{ value: 'windows', label: 'Windows voices' }], embed: [] }
};
const ctx = { roles, models, brains: { small: 'gemma4-e4b', deep: 'bobert-35b' }, embed: '', selected: 'bob', vramGB: 16, ramGB: 32, freeGB: 400, active: {}, packs: [] };

{
  const used = brainsInUse(ctx);
  const row = (id) => used.find((b) => b.value === id);
  check('one row per brain, with every job it holds', used.length === 3 && row('bobert-35b').jobs.map((s) => s.id).sort().join() === 'deep,reviewer,tinker' && row('gemma4-e4b').jobs.map((s) => s.id).sort().join() === 'eyes,small' && row('riker-28b-q3').jobs.map((s) => s.id).join() === 'bob', JSON.stringify(used.map((b) => [b.value, b.jobs.map((s) => s.id)])));
  check('a brain on this replicant matrix with no job is offered under Add a brain', spareBrains(ctx).map((b) => b.value).join() === 'qwen3-4b');
  check('...unless it was switched off as inactive', spareBrains({ ...ctx, active: { 'qwen3-4b': false } }).length === 0);
  check('jobs with no brain of their own are listed', emptyJobs(ctx).some((s) => s.id === 'office') && !emptyJobs(ctx).some((s) => s.id === 'bob'));
  check('+ job only lists jobs the brain can do and doesn\'t hold', !jobsFor('bobert-35b', ctx).some((s) => ['tinker', 'deep', 'reviewer'].includes(s.id)) && jobsFor('bobert-35b', ctx).some((s) => s.id === 'bob') && !jobsFor('qwen3-4b', ctx).some((s) => s.id === 'eyes'));
  check('the rented brain and the senses are not brain jobs', !brainJobs().some((s) => s.id === 'rent' || s.kind !== 'llm') && senseSlots().some((s) => s.id === 'rent') && senseSlots().some((s) => s.id === 'voice'));
}
{
  const bolt = models.find((m) => m.id === 'nemotron-3.5-bolt-74b');
  const bar = placeBarHtml(bolt, ctx);
  check('the bar says each part in words, and reads aloud as one sentence', /class="pb-card"[^>]*>Card \d/.test(bar) && /class="pb-mem"[^>]*>Memory \d/.test(bar) && /role="img" aria-label="Card \+ memory: Card [\d.]+ GB, Memory [\d.]+ GB"/.test(bar), bar);
  check('a brain that fits is one green part', /pb-card/.test(placeBarHtml(models.find((m) => m.id === 'riker-28b-q3'), ctx)) && !/pb-mem/.test(placeBarHtml(models.find((m) => m.id === 'riker-28b-q3'), ctx)));
  check('too big for home says so in words, with no bar', /Too big for home/.test(placeBarHtml(models.find((m) => m.id === 'deepseek-r1-distill-llama-70b'), ctx)) && !/place-bar/.test(placeBarHtml(models.find((m) => m.id === 'deepseek-r1-distill-llama-70b'), ctx)));
  check('a brain not in Bob\'s list gets no guess', /can't say/.test(placeBarHtml(null, ctx)));
  check('built-in graphics: nothing is put on a card', !/pb-card/.test(placeBarHtml(models.find((m) => m.id === 'qwen3-4b'), { ...ctx, integrated: true })));
  const b = budget(ctx);
  check('the top bars show the biggest brain in use', b.top?.name === models.find((m) => m.id === 'bobert-35b').name && b.top.cardGB > 0, JSON.stringify(b.top));
}
{
  const html = brainsHtml(ctx);
  check('the page has its four parts', ['This replicant matrix', 'Brains in use', 'Add a brain', 'Senses and tools'].every((h) => html.includes(`<h3>${h}`)));
  check('each brain row shows size and quantization', /21 GB · Q4_K_M/.test(html) && /14 GB · Q3_K_M/.test(html));
  check('job chips: a job that can go without has a ✕ with a spoken name; the main brain has none', /data-unequip="tinker" aria-label="Take [^"]+ off Coding"/.test(html) && !/data-unequip="bob"/.test(html));
  check('+ job is a labelled menu on each brain', /<select class="job-add" data-brainjob="bobert-35b" aria-label="Give [^"]+ another job">/.test(html));
  check('an empty job says what happens meanwhile and offers a brain or the catalogue', /data-jobbrain="office"/.test(html) && /data-catjob="office"/.test(html) && /Uses the Spreadsheets helper or the main brain/.test(html));
  check('senses: every one listed with Change or Pick; nothing chosen shows no kit', senseSlots().every((s) => html.includes(`data-slotpick="${s.id}"`)) && /<section class="kit-panel" aria-live="polite"><\/section>/.test(html));
  check('picking a sense opens its choices right there', /<section class="kit-panel" aria-live="polite"><h3>🎨 Painter/.test(brainsHtml({ ...ctx, selected: 'image' })));
  check('the paper doll and the plain list are one press away, and the catalogue too', /data-eqview="doll"/.test(html) && /data-eqview="list"/.test(html) && /data-tab="catalogue"/.test(html));
  check('the chest is not on this page (it belongs to the Adventure page)', !/data-chest\b/.test(html) && !/chest-tile/.test(html));
  check('no computer specs yet: the page still draws', /Brains in use/.test(brainsHtml({ ...ctx, vramGB: null, ramGB: null })));
}
{
  const cellar = read('public/cellar.js');
  check('Equip Bob opens on the Brains page unless another view was chosen', /getItem\('bob-brains-view'\) \|\| 'brains'/.test(cellar) && /brainsHtml\(brainsCtx\(\)\)/.test(cellar));
  check('the two menus save through the same call the doll uses', /el\.dataset\.brainjob && el\.value\) \{[^}]*await equip\(el\.value, el\.dataset\.brainjob/.test(cellar) && /el\.dataset\.jobbrain && el\.value\) \{[^}]*await equip\(el\.dataset\.jobbrain, el\.value/.test(cellar));
  check('Help has the page, in Bob\'s voice, and the glossary names it', HELP.some((h) => h.id === 'brains-page' && /I load one big brain at a time/.test(h.html)) && /<dt>Brains page<\/dt>/.test(HELP.find((h) => h.id === 'glossary').html));
}
// ---- 1.5.207: the Brains page lives in Settings, Brains, and the plain list has the same tools ----
{
  const cellar = read('public/cellar.js'), app = read('public/app.js');
  const place = { engineHere: true, brains: { 'bobert-35b': { layers: 41, set: { mode: 'hand', cpuMoe: 16 } }, 'riker-28b-q3': { layers: 0, set: { mode: 'auto' } } } };
  const c = { ...ctx, place };
  const top = listTopHtml(c);
  check('the plain list has the setups and Calibrate all on top', SETUPS.every((s) => top.includes(`data-setup="${s.id}"`)) && /data-calibrate="\*"/.test(top));
  const rowHtml = listRowHtml('bobert-35b', { ...c, rowId: 'tinker' });
  check('a job with a brain shows where it sits, By hand or Auto, Calibrate and Set up', /place-bar/.test(rowHtml) && /By hand/.test(rowHtml) && /data-calibrate="bobert-35b"/.test(rowHtml) && /data-brainsetup="bobert-35b"/.test(rowHtml));
  const locked = listRowHtml('riker-28b-q3', { ...c, rowId: 'bob' });
  check('a brain that cannot be calibrated keeps the button, locked, with the reason', /data-calibrate="riker-28b-q3" disabled[^>]*title="[^"]+"/.test(locked) && /data-brainsetup="riker-28b-q3"/.test(locked));
  check('a job with no brain shows no tools, and two jobs on one brain get their own ids', listRowHtml('', c) === '' && listRowHtml('bobert-35b', { ...c, rowId: 'reviewer' }).includes('id="brain-bobert-35b-reviewer"'));
  check('Set up opens from the list: that brain\'s page, or nothing when none is open', /Where it sits/.test(listSetUpHtml({ ...c, setUp: 'bobert-35b' })) && listSetUpHtml(c) === '' && listSetUpHtml({ ...c, setUp: 'nope' }) === '');
  check('the list in cellar.js uses them', /listSetUpHtml\(brainsCtx\(\)\)/.test(cellar) && /\$\{listTopHtml\(bx\)\}/.test(cellar) && /listRowHtml\(cur, \{ \.\.\.bx, rowId: j\.id \}\)/.test(cellar));
  check('Settings, Brains opens on the Brains page', /\['brains', '🧠 Brains', [^\n]*\(\) => brainsPanelHtml\(\) \+/.test(cellar) && /brainsHtml\(brainsCtx\(\{ inSettings: true \}\)\)/.test(cellar));
  check('in Settings the page offers the plain list, not the paper doll', !/data-eqview="doll"/.test(brainsHtml({ ...ctx, inSettings: true })) && /data-eqview="list"/.test(brainsHtml({ ...ctx, inSettings: true })));
  check('Bob\'s picture opens Settings, Brains', /cellar\.open\('settings', null, \{ jump: 'adv-brains' \}\)/.test(app) && !/cellar\.open\('shop', 'roles'\)[^\n]*bobCanvas/.test(app));
  check('Help says where the page is', /Settings, Brains/.test(HELP.find((h) => h.id === 'brains-page').html) && /brains-page/.test(HELP.find((h) => h.id === 'settings-brains').html));
}
// ---- first-time setup: How should I split my brains? ----
{
  const pack = catalog.packs.find((p) => p.id === 'big') || catalog.packs.find((p) => (p.cardGB || 0) >= 16) || catalog.packs[0];
  const fresh = catalog.models.map((m) => ({ ...m, status: { state: 'missing' } }));
  const engines = (catalog.engines || []).map((e) => ({ ...e, installed: false }));
  const rows = readyList({ pack, models: fresh, engines, hw: { vramGB: 16, ramGB: 32, nvidia: true }, mainEmpty: true });
  const brainRows = rows.filter((r) => r.kind === 'model' && ['chat', 'coding', 'vision'].includes(r.category));
  const ticked = (split) => brainRows.filter((r) => splitPicks(rows, split).has(r.id));
  const all = readyDefaults(rows);
  check('Specialists is exactly my usual picks, so nothing changes unless you choose', [...splitPicks(rows, 'specialists')].sort().join() === [...all].sort().join() && [...splitPicks(rows)].sort().join() === [...all].sort().join());
  check('One brain ticks only the main brain', ticked('one').length >= 1 && ticked('one').every((r) => r.slots.includes('bob')) && ticked('one').length <= ticked('specialists').length, ticked('one').map((r) => r.id).join());
  check('Quick + Big ticks the main, quick and deep brains and no other brain', ticked('duo').every((r) => r.slots.some((x) => ['bob', 'small', 'deep'].includes(x))) && ticked('duo').length >= ticked('one').length && ticked('duo').length <= ticked('specialists').length);
  const notBrain = (set) => rows.filter((r) => r.kind === 'model' && !['chat', 'coding', 'vision'].includes(r.category) && set.has(r.id)).map((r) => r.id).sort().join();
  check('pictures, clips and voices keep their ticks in every split', notBrain(splitPicks(rows, 'one')) === notBrain(all) && notBrain(splitPicks(rows, 'duo')) === notBrain(all));
  check('fewer brains is never a bigger download', readyOrder(rows, splitPicks(rows, 'one')).sizeGB <= readyOrder(rows, splitPicks(rows, 'duo')).sizeGB && readyOrder(rows, splitPicks(rows, 'duo')).sizeGB <= readyOrder(rows, all).sizeGB);
  check('the programs the ticked brains run on are still ticked', rows.filter((r) => r.kind === 'engine' && r.core && !r.here).every((r) => splitPicks(rows, 'one').has(r.id)));
  check('four choices; Across my Bobs is shown, locked, and says when it opens', SPLITS.map((x) => x.id).join() === 'one,duo,specialists,bobs' && /Bob-Net/.test(SPLITS[3].lock) && SPLITS.slice(0, 3).every((x) => !x.lock));
  const cellar = read('public/cellar.js');
  check('the first-time screen offers it as labelled radio buttons, Specialists chosen at the start', /let wSplit = 'specialists'/.test(cellar) && /<legend><strong>How should I split my brains\?<\/strong>/.test(cellar) && /type="radio" name="wsplit" data-wsplit=/.test(cellar) && /wPicks = splitPicks\(rows, wSplit\)/.test(cellar));
}
// ---- Set up: one brain's own page ----
{
  const place = { engine: 'llamacpp', brains: { 'bobert-35b': { layers: 40, set: { mode: 'auto', cpuMoe: 12 }, pinned: false }, 'riker-28b-q3': { layers: 40, set: { mode: 'hand', cpuMoe: 6 }, pinned: false }, 'gemma4-e4b': { layers: null, set: { mode: 'auto' }, pinned: false } } };
  const c = { ...ctx, place };
  const used = brainsInUse(c);
  const b = (id) => used.find((x) => x.value === id);
  check('every brain row has a Set up button and says Auto or By hand in words', /data-brainsetup="bobert-35b" aria-label="Set up [^"]+">Set up/.test(brainsHtml(c)) && /<span class="muted">By hand<\/span><span><button type="button" class="mini" data-calibrate="riker-28b-q3"[^>]*>⏱ Calibrate<\/button> <button type="button" class="mini" data-brainsetup="riker-28b-q3"/.test(brainsHtml(c)));
  const page = brainsHtml({ ...c, setUp: 'bobert-35b' });
  check('Set up opens that brain alone, with a way back, its jobs and + job', /data-brainsetup="">← All brains/.test(page) && /<h3>35Bob Bobert<\/h3>/.test(page) && /40 layers · made of experts/.test(page) && /data-unequip="tinker"/.test(page) && /data-brainjob="bobert-35b"/.test(page) && !/Senses and tools/.test(page));
  check('Auto and By hand are two buttons that say which is on', /data-placemode="auto" data-model="bobert-35b" aria-pressed="true"/.test(page) && /data-placemode="hand" data-model="bobert-35b" aria-pressed="false" >By hand/.test(page));
  check('the slider and the number box carry the same value and limits, and can be set while still on Auto', /type="range" id="place-moe" min="0" max="40" step="1" value="12" data-placemoe="bobert-35b"  aria-describedby/.test(page) && /type="number" min="0" max="40" step="1" value="12" data-placemoenum="bobert-35b" /.test(page) && /used once you switch to By hand/.test(page) && !/data-placemoe[^>]*disabled|data-placemode[^>]*disabled/.test(page), page.slice(page.indexOf('num-row'), page.indexOf('num-row') + 900));
  check('By hand says it is in use and when it takes effect', /By hand: 6 of 40 layers keep their experts in memory/.test(brainsHtml({ ...c, setUp: 'riker-28b-q3' })) && /Takes effect the next time this brain loads/.test(brainsHtml({ ...c, setUp: 'riker-28b-q3' })));
  const e4b = brainsHtml({ ...c, setUp: 'gemma4-e4b' });
  check('a brain that can\'t be set by hand keeps the controls on the page, locked, with the reason', /data-placemoe="gemma4-e4b" disabled/.test(e4b) && /data-placemode="hand"[^>]*disabled/.test(e4b) && /🔒 This brain has no experts to move/.test(e4b));
  check('the reasons: no experts, a number in the settings file, not read yet', /no experts to move/.test(handLock({ value: 'x', entry: { id: 'x', name: 'Plain 8B' } }, { place: { brains: { x: { layers: 30, set: {} } } } })) && /settings file/.test(handLock(b('bobert-35b'), { place: { brains: { 'bobert-35b': { layers: 40, set: {}, pinned: true } } } })) && /Reading/.test(handLock(b('bobert-35b'), {})) && handLock(b('bobert-35b'), c) === '');
  const cellar = read('public/cellar.js');
  check('the slider and the number box stay in step while moving, and save one brain at a time', /if \(d\.placemoe\) \{ const n = dlg\.querySelector\('\[data-placemoenum\]'\); if \(n\) n\.value = e\.target\.value; \}/.test(cellar) && /brainPlace: \{ \[model\]: \{ \.\.\.cur, \.\.\.patch \} \}/.test(cellar));
}
// ---- setups ----
{
  const plan = (id, c = ctx) => setupPlan(id, c).map((x) => `${x.slot.id}=${x.value}`).sort().join();
  check('four setups, each says what it does and who it is for', SETUPS.map((s) => s.id).join() === 'one,duo,specialists,bobs' && SETUPS.every((s) => s.does && s.who));
  check('the setup in use is told from the jobs themselves', setupOf(ctx) === 'specialists' && setupOf({ ...ctx, roles: { ...roles, current: { bob: 'riker-28b-q3' } }, brains: {} }) === 'one' && setupOf({ ...ctx, roles: { ...roles, current: { bob: 'bobert-35b' } }, brains: { small: 'gemma4-e4b', deep: 'bobert-35b' } }) === 'duo' && setupOf({ ...ctx, roles: { ...roles, current: {} }, brains: {} }) === '');
  check('One brain: optional jobs come off, the main brain stays, Seeing pictures is left alone', plan('one') === 'deep=,reviewer=,small=,tinker=', plan('one'));
  check('Quick + Big: the Deep thinker becomes the big brain for the main job too; the Quick brain is kept', plan('duo') === 'bob=bobert-35b,reviewer=,tinker=', plan('duo'));
  check('Specialists and Across my Bobs change nothing by themselves', plan('specialists') === '' && plan('bobs') === '');
  check('Quick + Big says when the Quick slot has no small brain of its own', !duoNeedsQuick(ctx) && duoNeedsQuick({ ...ctx, brains: { deep: 'bobert-35b' } }) && duoNeedsQuick({ ...ctx, brains: { small: 'bobert-35b', deep: 'bobert-35b' } }));
  const html = brainsHtml(ctx);
  check('the setups are buttons that say which is in use, in words', SETUPS.every((s) => html.includes(`data-setup="${s.id}"`)) && /data-setup="specialists" aria-pressed="true"><strong>[^<]*<\/strong> <span class="tag good">in use<\/span>/.test(html) && !/setup-ask/.test(html));
  const ask = brainsHtml({ ...ctx, setupAsk: 'one' });
  check('pressing one shows the list of changes first, with Apply and Cancel', /class="setup-ask"/.test(ask) && /data-setupapply="one"/.test(ask) && /<strong>Coding<\/strong>: no brain of its own \(the main brain codes\)/.test(ask) && /No brain is deleted/.test(ask), ask.slice(ask.indexOf('setup-ask'), ask.indexOf('setup-ask') + 700));
  check('nothing to change: no Apply button', !/data-setupapply/.test(brainsHtml({ ...ctx, roles: { ...roles, current: { bob: 'riker-28b-q3' } }, brains: {}, setupAsk: 'one' })));
  check('Across my Bobs points at the Bob-Net settings and says it is all off until turned on', /data-setupbobnet/.test(brainsHtml({ ...ctx, setupAsk: 'bobs' })) && /off until you turn it on/.test(brainsHtml({ ...ctx, setupAsk: 'bobs' })));
  const cellar = read('public/cellar.js');
  check('Apply saves each job through the usual call, then reloads', /for \(const c of plan\) await equipSlot\(c\.slot, c\.value\);/.test(cellar) && /jumpTo = 'adv-bobnet'/.test(cellar));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
