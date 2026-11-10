// 1.5.4: which models suit this replicant matrix, which jobs each can do, Bob's pick for each job, and the Help page.
import fs from 'node:fs';
import { canDo, suit, pickFor, picksOf, scoreFor, paramsB, unsuited, packFor } from '../public/fit.js';
import { kitFor, kitFit, slotTakes, equipHtml, SLOTS, allSlots } from '../public/equip.js';
import { HELP } from '../public/help-content.js';
import { searchHelp, helpHtml } from '../public/help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const models = catalog.models.map((m) => ({ ...m, status: { state: 'missing' } }));
const byId = (id) => models.find((m) => m.id === id);
const pc = (vramGB, ramGB) => ({ vramGB, ramGB, freeGB: 500, packs: catalog.packs, platform: 'win32' });
const slot = (id) => allSlots().find((s) => s.id === id);

// ---- what each model can do ----
{
  check('every brain in the catalog says which jobs it can do', models.filter((m) => ['chat', 'coding', 'vision'].includes(m.category)).every((m) => Array.isArray(m.jobs) && m.jobs.length));
  check('catalog jobs are real slot ids (or the phone app)', models.flatMap((m) => m.jobs || []).every((id) => id === 'phone' || allSlots().some((s) => s.id === id)));
  check('a text-only coder is never offered as Eyes', !canDo('eyes', { entry: byId('qwen3-coder-30b') }));
  check('a big brain is never offered as the Quick brain', !canDo('small', { entry: byId('gemma4-26b') }));
  check('a vision model is offered as Eyes', canDo('eyes', { entry: byId('qwen2.5-vl-7b') }));
  check('brains not in Bob\'s list: judged by what the engine says', canDo('eyes', { name: 'llava:13b', caps: ['completion', 'vision'] }) && !canDo('eyes', { name: 'mistral:7b', caps: ['completion', 'tools'] }));
  check('...and by name when the engine is asleep', canDo('eyes', { name: 'qwen2.5vl:7b' }) && !canDo('eyes', { name: 'phi4:14b' }) && !canDo('small', { name: 'llama3.3:70b' }) && canDo('small', { name: 'llama3.2:3b' }));
  check('the main brain needs tools when the engine says what it can do', !canDo('bob', { name: 'tiny:1b', caps: ['completion'] }) && canDo('bob', { name: 'x:8b', caps: ['completion', 'tools'] }));
  check('an embedding model is not a brain', !canDo('bob', { name: 'nomic-embed-text', caps: ['embedding'] }));
  check('sizes are read from names', paramsB('gemma4:e4b') === 4 && paramsB('qwen3-coder:30b') === 30 && paramsB('gpt-oss:20b') === 20 && paramsB('nomic-embed-text') === null);
}

// ---- how a model suits a PC ----
{
  check('fits the card', suit(byId('gemma4-26b'), pc(16, 32)).fits === true);
  check('a bit too big: slow, with the reason', suit(byId('gemma4-26b'), pc(12, 32)).level === 'slow' && /16 GB of graphics memory; your card has 12 GB/.test(suit(byId('gemma4-26b'), pc(12, 32)).why));
  check('far too big: doesn\'t suit, with the reason', suit(byId('ltx-2.3-22b'), pc(8, 32)).level === 'no');
  check('a brain that spills more than the RAM can spare doesn\'t suit', suit(byId('qwen3-coder-30b'), pc(8, 12)).ram === true && /RAM/.test(suit(byId('qwen3-coder-30b'), pc(8, 12)).why) && !suit(byId('qwen3-coder-30b'), pc(8, 32)).ram);
  check('no graphics card: big brains are slow, small ones are fine', suit(byId('gemma4-26b'), pc(null, 16)).level === 'slow' && suit(byId('gemma4-e4b'), pc(null, 16)).level === 'ok');
  check('not enough disk: can\'t install', suit(byId('gemma4-26b'), { vramGB: 16, freeGB: 5 }).level === 'blocked');
  check('every reason is one line', models.every((m) => !/\n/.test(suit(m, pc(6, 16)).why || '')));
}

// ---- Bob's pick for each job: covers more jobs and lighter scores higher ----
{
  const big = pc(16, 32);
  // 1.5.169: Bob's own brains (bobPick) win their jobs first; the scoring below them is checked on the stock brains.
  const stock = models.filter((m) => !m.madeByBob);
  check('1.5.169: 16 GB card: 28Bob Riker (quick, the Q3) is the Brain, as Bob\'s own default', pickFor('bob', models, big)?.id === 'riker-28b-q3' && /Bob's own brain/.test(pickFor('bob', models, big).why));
  check('16 GB card, stock brains: Gemma 4 26B is the Brain (covers the most jobs, fits the card)', pickFor('bob', stock, big)?.id === 'gemma4-26b');
  check('16 GB card: the Quick brain is the light Gemma 4 E4B', pickFor('small', models, big)?.id === 'gemma4-e4b');
  check('16 GB card, stock brains: Coding is Qwen3.6 35B-A3B (it won the race, 1.5.63)', pickFor('tinker', stock, big)?.id === 'qwen3.6-35b-a3b', pickFor('tinker', stock, big)?.id);
  check('1.5.169: 16 GB card: 35Bob Bobert is the Coding and Deep thinking pick', pickFor('tinker', models, big)?.id === 'bobert-35b' && pickFor('deep', models, big)?.id === 'bobert-35b');
  check('8 GB card: nothing too big is picked', ['bob', 'small', 'tinker', 'eyes'].every((s) => { const p = pickFor(s, models, pc(8, 32)); return !p || byId(p.id).vramGB <= 8; }));
  check('8 GB card: no Deep thinking pick (nothing strong enough fits)', pickFor('deep', models, pc(8, 32)) === null);
  check('6 GB card (a laptop): the light Qwen3 4B is the Brain and the Quick brain', pickFor('bob', models, pc(6, 32))?.id === 'qwen3-4b' && pickFor('small', models, pc(6, 32))?.id === 'qwen3-4b');
  check('...and says it was picked for being light', /Light, so it leaves room on your card for longer chats · 4\.0 GB/.test(pickFor('bob', models, pc(6, 32)).why));
  check('...while Gemma 4 E4B sees pictures and hears you', pickFor('eyes', models, pc(6, 32))?.id === 'gemma4-e4b' && pickFor('voice', models, pc(6, 32))?.id === 'gemma4-e4b');
  check('the 6 GB starter set agrees', (() => { const p = catalog.packs.find((x) => x.id === 'small'); return p.slots['qwen3-4b'].join() === 'bob,small' && p.slots['gemma4-e4b'].join() === 'eyes,voice'; })());
  check('8 GB and up keep Gemma 4 E4B / 26B as the Brain', pickFor('bob', models, pc(8, 32))?.id === 'gemma4-e4b' && pickFor('bob', stock, pc(16, 32))?.id === 'gemma4-26b');
  check('a spill into RAM costs more than being heavy', scoreFor(byId('qwen3-coder-30b'), 'tinker', pc(8, 32)) < scoreFor(byId('qwen2.5-coder-7b'), 'tinker', pc(8, 32)));
  check('lighter wins when the rest is equal', scoreFor({ ...byId('gemma4-e4b'), vramGB: 4 }, 'bob', big) > scoreFor(byId('gemma4-e4b'), 'bob', big));
  check('the pick says why', /Covers \d+ jobs, so fewer brain swaps · 16 GB/.test(pickFor('bob', stock, big).why));
  check('pictures, video and voices come from the starter set for the card', pickFor('image', models, big)?.id === 'z-image-turbo' && pickFor('image', models, pc(8, 32))?.id === 'z-image-turbo-q5' && pickFor('speech', models, big)?.id === 'kokoro-v1');
  check('a model lists every job it is the pick for', picksOf(byId('gemma4-26b'), stock, big).includes('bob') && picksOf(byId('gemma4-e4b'), models, big).includes('small') && picksOf(byId('riker-28b-q3'), models, big).includes('bob'));
  check('only models that don\'t suit, aren\'t picks and aren\'t here are hidden', unsuited(byId('ltx-2.3-22b'), [], suit(byId('ltx-2.3-22b'), pc(8, 32))) && !unsuited({ ...byId('ltx-2.3-22b'), status: { state: 'installed' } }, [], suit(byId('ltx-2.3-22b'), pc(8, 32))));
  check('the starter set is still chosen by the card', packFor(catalog.packs, 16).id === 'big' && packFor(catalog.packs, 6).id === 'small');
}

// ---- Equip Bob: each slot only lists what can do its job ----
{
  const roles = { current: { bob: 'gemma4:26b' }, options: { llm: [{ value: 'gemma4:26b', label: 'Gemma 4 26B' }, { value: 'qwen3-coder:30b', label: 'Qwen3 Coder' }, { value: 'llava:13b', label: 'llava:13b', caps: ['completion', 'vision'] }], images: [], edit: [], video: [], voice: [], speech: [], embed: [] } };
  const ctx = { roles, models, brains: {}, embed: '', selected: 'eyes', ...pc(16, 32) };
  const eyes = kitFor(slot('eyes'), ctx).map((k) => k.value);
  check('Eyes lists models that see, and not the text-only coder', eyes.includes('gemma4:26b') && eyes.includes('llava:13b') && !eyes.includes('qwen3-coder:30b') && !eyes.includes('qwen3-4b'));
  check('Quick brain doesn\'t list the 26B', !kitFor(slot('small'), ctx).some((k) => k.value === 'gemma4:26b' || k.value === 'gemma4-26b'));
  check('the slot\'s pick carries "★ Recommended", with why in its tip', kitFit({ entry: byId('riker-28b-q3') }, slot('bob'), ctx).rec && /Bob's own brain/.test(kitFit({ entry: byId('riker-28b-q3') }, slot('bob'), ctx).recWhy) && /★ Recommended/.test(equipHtml({ ...ctx, models: ctx.models.filter((m) => !m.madeByBob), selected: 'bob' })) && /Covers \d+ jobs/.test(equipHtml({ ...ctx, models: ctx.models.filter((m) => !m.madeByBob), selected: 'bob' })));
  check('each kit row is one line; its size and licence sit in an "i" tip', /class="tip-i"[^>]*><span class="tip-src" hidden>[^<]*licence Apache 2\.0/.test(equipHtml({ ...ctx, selected: 'tinker' })));
  check('a model not in Bob\'s list says Bob can\'t judge it', /can&#39;t say how well it runs/.test(equipHtml(ctx)));
  const small = { ...ctx, ...pc(8, 16), selected: 'bob', active: { 'gpt-oss-20b': true } };
  check('active downloads that don\'t suit are hidden behind a button', !/data-get="gpt-oss-20b"/.test(equipHtml(small)) && /(don't|doesn't) suit this replicant matrix\. <button type="button" class="link" data-unsuited>Show them/.test(equipHtml(small)));
  check('...and shown, with the reason, when asked', /data-get="gpt-oss-20b"/.test(equipHtml({ ...small, showUnsuited: true })) && /Doesn't suit this replicant matrix/.test(equipHtml({ ...small, showUnsuited: true })));
  // 1.5.56: Active models and Get more
  const doll = (extra) => equipHtml({ ...ctx, selected: 'bob', ...extra });
  check('models not downloaded stay out of the slots until made active', !/data-get="qwen3.6-35b-a3b"/.test(doll()) && /data-get="qwen3.6-35b-a3b"/.test(doll({ active: { 'qwen3.6-35b-a3b': true } })));
  check('a model on this replicant matrix can be made inactive, and then it is hidden', /data-equip="qwen3-coder:30b"/.test(doll()) && !/data-equip="qwen3-coder:30b"/.test(doll({ active: { 'qwen3-coder-30b': false } })));
  check('what is equipped always shows, even when made inactive', /data-equip="gemma4:26b"/.test(doll({ active: { 'gemma4-26b': false } })));
  check('every kit ends with Get more, saying how many wait in the catalogue', /data-catjob="bob">📚 Get more \(\d+ in the catalogue\)/.test(doll()));
  check('Gaming takes only the timed Qwen3 4B Instruct 2507, never E4B or another brain', canDo('gaming', { entry: byId('qwen3-4b') }) && !canDo('gaming', { entry: byId('gemma4-e4b') }) && !canDo('gaming', { name: 'gemma4:e4b' }) && !canDo('gaming', { entry: { ...byId('gemma4-e4b'), jobs: ['gaming'] } }) && !canDo('gaming', { name: 'qwen3:1.7b' }) && kitFor(slot('gaming'), { ...ctx, models }).every((k) => k.entry?.id === 'qwen3-4b'));
  check('Gaming and Office are slots on the paper doll', ['gaming', 'office'].every((id) => slot(id)?.how === 'brain'));
  check('new brains are listed but not recommended until tried', models.filter((m) => m.trial).every((m) => !picksOf(m, models, pc(16, 32)).length && !picksOf(m, models, pc(8, 16)).length && !picksOf(m, models, pc(6, 16)).length));
  check('dragging only lands on slots that can do the job', !slotTakes(slot('eyes'), 'qwen3-coder:30b', ctx) && slotTakes(slot('bob'), 'qwen3-coder:30b', ctx) && slotTakes(slot('image'), 'anything', ctx));
  check('a "?" on Equip Bob opens Help at how models are picked', /data-help="recommended"/.test(equipHtml(ctx)));
}

// ---- Help ----
{
  const ids = HELP.map((e) => e.id);
  check('every Help entry has its own id, a title and text', new Set(ids).size === ids.length && HELP.every((e) => e.title && e.html && e.group));
  const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
  const advIds = [...cellar.matchAll(/\['(\w+)', '[^']+', '[^']*', \(\) =>/g)].map((m) => m[1]);
  check('every advanced Settings section has a Help entry for its "?"', advIds.length >= 8 && advIds.every((id) => ids.includes('settings-' + id)), advIds.filter((id) => !ids.includes('settings-' + id)).join(','));
  check('every link inside Help goes to an entry that exists', HELP.every((e) => [...e.html.matchAll(/data-helpgo="([^"]+)"/g)].every((m) => ids.includes(m[1]))));
  check('search finds troubleshooting by plain words', searchHelp('parsec copy').some((e) => e.id === 'trouble') && searchHelp('smart app control').some((e) => e.id === 'trouble'));
  check('search finds the Recommended explanation', searchHelp('recommended')[0]?.id === 'recommended');
  check('search with no match says so', /Nothing in Help matches/.test(helpHtml('zzzqqq')));
  check('the glossary is there', ids.includes('glossary') && /Graphics card, graphics memory/.test(HELP.find((e) => e.id === 'glossary').html));
  check('Help covers getting started, pages, Hands, memory, troubleshooting', ['start', 'around', 'equip', 'hands', 'memory-brains', 'trouble'].every((id) => ids.includes(id)));
  check('search text can\'t inject HTML', !/<script>/.test(helpHtml('<script>x</script>')));
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  check('Help is in the menu and has its own page', /id="helpBtn"/.test(html) && /<dialog id="help"/.test(html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
