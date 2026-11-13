// 1.5.56: the Brain catalogue (public/catalogue.js), Active models, the Gaming and Office slots, picture readers
// (mmproj) for downloaded brains, and the new catalog entries. Run: node test/run-catalogue-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogueHtml, catJobs, modelsFor, familyOf, FAMILIES, isNaughty, isCommunity, visibleModels, communityLine, NAUGHTY_WARNING, DEVIL, modelsForView, makerTag, makerOf } from '../public/catalogue.js';
import { deviceFit, sourceOf, pickFor } from '../public/fit.js';
import { allSlots, isActive } from '../public/equip.js';
import { saveNameOf } from '../src/models.js';
import { mergeSettings, ollamaModelsDir, pinokioRoots } from '../src/config.js';
import { sessionBrains } from '../src/sessions.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const catalog = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const here = new Set(['gemma4-26b', 'qwen3-coder-30b']);
const models = catalog.models.map((m) => ({ ...m, status: { state: here.has(m.id) ? 'installed' : 'missing', canDownload: true } }));
const byId = (id) => models.find((m) => m.id === id);
const roles = { current: { bob: 'gemma4:26b', tinker: 'qwen3-coder:30b' }, options: { llm: [{ value: 'gemma4:26b', label: 'Gemma 4 26B' }, { value: 'qwen3-coder:30b', label: 'Qwen3 Coder' }, { value: 'mystery:7b', label: 'mystery:7b' }] } };
const ctx = { roles, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 500, packs: catalog.packs, platform: 'win32' };

// ---- the new entries ----
{
  const want = ['qwen3.6-35b-a3b', 'qwen3.6-27b', 'qwen3.8-27b', 'qwen3.5-9b', 'qwen3.5-4b', 'qwen3.5-2b', 'gemma4-e2b'];
  check('the newer families are in the list', want.every((id) => byId(id)), want.filter((id) => !byId(id)).join(','));
  check('every new brain says which jobs it does', want.every((id) => byId(id).jobs?.length));
  check('new brains are marked New (trial) until tried; Qwen 3.8 27B and Qwen3.6 35B-A3B (raced, 1.5.63) are not', want.filter((id) => !['qwen3.8-27b', 'qwen3.6-35b-a3b'].includes(id)).every((id) => byId(id).trial) && !byId('qwen3.8-27b').trial && !byId('qwen3.6-35b-a3b').trial);
  const hf = models.flatMap((m) => m.files || []).filter((f) => /huggingface\.co/.test(f.url));
  check('every Hugging Face link is pinned to a commit, with size and checksum', hf.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && f.bytes > 0 && (f.sizeOnly || /^[0-9a-f]{64}$/.test(f.sha256))));
  const seen = new Map(), clash = [];
  // Picture models share some files on purpose (the same VAE); a shared name must be the very same file.
  for (const m of models) for (const f of m.files || []) { if (m.into) continue; const k = `${m.category}/${saveNameOf(f).toLowerCase()}`; if (seen.has(k) && seen.get(k) !== (f.sha256 || f.bytes)) clash.push(k); seen.set(k, f.sha256 || f.bytes); }
  check('no two different files are saved under the same name (the mmproj files get their own)', !clash.length, clash.join(','));
  check('a saveAs name is a plain file name only', saveNameOf({ url: 'https://huggingface.co/a/b/resolve/x/mmproj-F16.gguf', saveAs: '../evil.gguf' }) === 'mmproj-F16.gguf' && saveNameOf({ url: 'https://huggingface.co/a/b/resolve/x/mmproj-F16.gguf', saveAs: 'Qwen3.5-4B-mmproj-F16.gguf' }) === 'Qwen3.5-4B-mmproj-F16.gguf');
  check('brains that see pictures bring their picture reader', want.filter((id) => byId(id).jobs.includes('eyes') && byId(id).files).every((id) => byId(id).files.some((f) => f.role === 'mmproj')));
}

// ---- the catalogue page ----
{
  const ids = catJobs().map((j) => j.id);
  check('the catalogue has a section per brain job, the phone and media', ['small', 'gaming', 'bob', 'deep', 'reviewer', 'tinker', 'office', 'eyes', 'phone', 'voice', 'speech', 'image', 'edit', 'video', 'music', 'embed'].every((id) => ids.includes(id)));
  check('every job except Sound effects is a slot (or the phone)', ids.every((id) => id === 'phone' || allSlots().some((s) => s.id === id)));
  check('every brain job has at least two choices', ['small', 'bob', 'deep', 'reviewer', 'tinker', 'office', 'eyes'].every((id) => modelsFor(catJobs().find((j) => j.id === id), models).length >= 2));
  check('Gaming lists only Qwen3 4B Instruct 2507', modelsFor(catJobs().find((j) => j.id === 'gaming'), models).map((m) => m.id).join() === 'qwen3-4b');
  check('the phone list has Gemma 4 E2B, Qwen3.5 2B and Qwen3 4B', ['gemma4-e2b', 'qwen3.5-2b', 'qwen3-4b'].every((id) => modelsFor({ id: 'phone' }, models).some((m) => m.id === id)));
  const html = catalogueHtml(ctx);
  check('each row has an Active switch', /data-active="qwen3.6-35b-a3b"/.test(html) && /role="switch" aria-checked="true" data-active="gemma4-26b"/.test(html) && /role="switch" aria-checked="false" data-active="qwen3.6-35b-a3b"/.test(html));
  check('the switch follows what was saved', /aria-checked="true" data-active="qwen3.6-35b-a3b"/.test(catalogueHtml({ ...ctx, active: { 'qwen3.6-35b-a3b': true } })) && /aria-checked="false" data-active="gemma4-26b"/.test(catalogueHtml({ ...ctx, active: { 'gemma4-26b': false } })));
  check('models here get Equip (or say equipped); the rest get Get', /data-catequip="tinker" data-catvalue="gemma4:26b"/.test(html) && /equipped/.test(html) && /data-get="qwen3.6-35b-a3b"/.test(html));
  check('1.5.137: a brain not tried yet has no New tag for that (the tip says it), and is never ★ Recommended', !/<span class="tag">New<\/span>/.test(html) && /Not tried on a real replicant matrix yet, so I don&#39;t recommend it yet|Not tried on a real replicant matrix yet, so I don't recommend it yet/.test(html) && !Object.keys(Object.fromEntries(catJobs().map((j) => [j.id, 1]))).some((j) => models.filter((m) => m.trial).some((m) => pickFor(j, models, ctx)?.id === m.id)));
  check('the detail sits in an "i" tip: size on other machines and licence; the source is on the ↗ (1.5.101: said once)', /class="tip-i"[^>]*><span class="tip-src" hidden>[^<]*(<br>[^<]*)*6 GB laptop card[^]*?Licence Apache 2\.0[^]*?data-tip="Where it comes from: unsloth\/Qwen3\.6-35B-A3B-GGUF @ a483e9e"/.test(html) && !/tip-src" hidden>[^]*?From unsloth/.test(html));
check('each machine answer is said once (grouped), and Active is explained once at the top, not on every row', /Runs well on every card and with no graphics card|Runs well: /.test(html) && !/16 GB graphics card: Runs well · 8 GB graphics card: Runs well/.test(html) && !/data-active="[^"]*" data-tip=/.test(html));
  check('the source link opens the exact commit', /href="https:\/\/huggingface\.co\/unsloth\/Qwen3\.6-35B-A3B-GGUF\/tree\/a483e9e6cbd595906af30beda3187c2663a1118c"/.test(html) && /href="https:\/\/huggingface\.co\/unsloth\/Qwen3\.8-27B-GGUF\/tree\/4ca720788d1e01f1bff70c033e0d0028fd02e502"/.test(catalogueHtml({ ...ctx, showUnsuited: true })));
  check('1.5.205: a brain bigger than the card is listed and says how it runs here; its row shows the quantization', /id="cat-deep-qwen3.8-27b"/.test(html) && /class="tag warn place-tag"[^>]*>Fits with memory<\/span>/.test((html.match(/<li class="[^"]*" id="cat-deep-qwen3\.8-27b">[^]*?<\/li>/) || [''])[0]) && /<span class="muted">18 GB · Q4_K_XL<\/span>/.test(html));
  check('a brain too big even with memory and the drive is not in the job lists', !/id="cat-[a-z]+-deepseek-r1-distill-llama-70b"/.test(catalogueHtml({ ...ctx, showUnsuited: true })));
  check('brains not in Bob\'s list get their own Active switch', /Other brains on this replicant matrix[^]*data-active="mystery:7b"/.test(html));
  check('the phone section has no Active switch or Get', !/id="cat-phone-[^"]*"[^]*?data-active[^]*?<\/li>/.test(html.slice(html.indexOf('catjob-phone'), html.indexOf('catjob-voice'))));
  check('nothing nasty gets through a model name', !/<script/.test(catalogueHtml({ ...ctx, roles: { ...roles, options: { llm: [{ value: 'x', label: '<script>x</script>' }] } } })));
}

// ---- 1.5.101: model families, each behind its own header ----
{
  check('every catalog model names its family', models.every((m) => typeof m.family === 'string' && m.family), models.filter((m) => !m.family).map((m) => m.id).join(','));
  check('every family has a line about who makes it', [...new Set(models.map(familyOf))].every((f) => FAMILIES[f]), [...new Set(models.map(familyOf))].filter((f) => !FAMILIES[f]).join(','));
  check('a model without a family falls back to the first word of its name', familyOf({ name: 'Mistral Small 3' }) === 'Mistral');
  const html = catalogueHtml(ctx);
  const tinker = html.slice(html.indexOf('id="catjob-tinker"'), html.indexOf('id="catjob-office"'));
  check('Coding has one header per family (Qwen, Gemma, GPT-OSS)', ['Qwen', 'Gemma', 'GPT-OSS'].every((f) => tinker.includes(`data-fam="tinker:${f}"`)));
  check('families start closed', !/<details class="cat-fam"[^>]* open>/.test(html));
  check('a family opened before stays open', /data-fam="tinker:Qwen" id="catfam-tinker-Qwen" open>/.test(catalogueHtml({ ...ctx, famOpen: { 'tinker:Qwen': true } })) && !/data-fam="bob:Qwen"[^>]* open>/.test(catalogueHtml({ ...ctx, famOpen: { 'tinker:Qwen': true } })));
  check('each model row sits inside its family', /data-fam="tinker:Qwen"[^]*?id="cat-tinker-qwen3-coder-30b"[^]*?<\/details>/.test(tinker) && !/data-fam="tinker:Gemma"[^>]*>(?:(?!<\/details>)[^])*cat-tinker-qwen3-coder-30b/.test(tinker));
  check('a closed header says how many, the size range, and what is here', /data-fam="tinker:Qwen"[^]*?<summary>[^]*?\d+ models · [\d.]+ (GB|MB) to [\d.]+ GB[^]*?On this replicant matrix|data-fam="tinker:Qwen"[^]*?<summary>[^]*?on this replicant matrix/.test(tinker));
  const pick = byId(pickFor('tinker', models, ctx).id);
  check('the header of the family holding Bob\'s pick says so', new RegExp(`data-fam="tinker:${familyOf(pick)}"[^>]*>\\s*<summary>(?:(?!</summary>)[^])*★ Recommended inside`).test(tinker));
  check('the family with Bob\'s pick comes first', tinker.indexOf(`data-fam="tinker:${familyOf(pick)}"`) === tinker.indexOf('data-fam="tinker:'));
  check('Open all families and Close all buttons are there', /data-famall="open">Open all families/.test(html) && /data-famall="close">Close all/.test(html));
  check('a family name can\'t inject markup', !/<img/.test(catalogueHtml({ ...ctx, models: [...models, { ...byId('qwen3-4b'), id: 'evil', family: '<img src=x>' }] })));
}

// ---- fit on other machines ----
{
  const f = deviceFit(byId('qwen3.6-35b-a3b'));
  check('a 16 GB-card brain: fine on 16 GB, not on 6 GB or a phone', f.find((d) => d.id === 'big').level === 'ok' && f.find((d) => d.id === 'small').level !== 'ok' && f.find((d) => d.id === 'phone').level === 'no');
  check('Gemma 4 E2B fits everything, phone included', deviceFit(byId('gemma4-e2b')).every((d) => d.level === 'ok'));
  check('source of a pinned file names the repo and short commit', sourceOf(byId('gemma4-e2b')).label === 'ggml-org/gemma-4-E2B-it-GGUF @ b4243c1');
}

// ---- Active models ----
{
  check('not set: on this replicant matrix means active, not downloaded means not', isActive({ value: 'a', installed: true }) && !isActive({ value: 'b', installed: false }));
  check('a saved switch wins', !isActive({ value: 'a', installed: true }, { a: false }) && isActive({ value: 'b' }, { b: true }));
  const saved = mergeSettings({}, { activeModels: { 'qwen3.6-35b-a3b': true, 'gemma4:26b': false, 'bad key!': true, x: 'yes' } }).activeModels;
  check('only true/false switches with plain names are saved', saved['qwen3.6-35b-a3b'] === true && saved['gemma4:26b'] === false && !('bad key!' in saved) && !('x' in saved));
}

// ---- Gaming never gets E4B ----
{
  check('a saved E4B Gaming brain is refused', !('gaming' in (mergeSettings({}, { sessionBrains: { gaming: 'gemma4:e4b' } }).sessionBrains || {})));
  check('an old settings file with E4B in Gaming falls back to Qwen3 4B Instruct 2507', sessionBrains({ sessionBrains: { gaming: 'gemma4:e4b' } }).gaming === 'qwen3-4b' && sessionBrains({ sessionBrains: { gaming: 'qwen3-4b' } }).gaming === 'qwen3-4b');
}

// ---- 1.5.132: the naughty list (uncensored community builds) and the community marker ----
{
  const NAUGHTY = ['qwen3.6-35b-a3b-heretic', 'qwen3.6-27b-heretic', 'qwen3.8-27b-heretic', 'gemma4-26b-heretic', 'gemma4-31b-heretic', 'qwen3.5-9b-heretic', 'gemma4-12b-heretic', 'gemma4-e4b-heretic', 'qwen3.5-4b-heretic'];
  check('the six uncensored remixes are in the list', NAUGHTY.every((id) => byId(id)), NAUGHTY.filter((id) => !byId(id)).join(','));
  check('each is marked naughty by an explicit field, not by its name', NAUGHTY.every((id) => byId(id).naughty === true && isNaughty(byId(id))) && !isNaughty({ name: 'Qwen Heretic Uncensored' }));
  check('every naughty entry is a community build that says who made it and from what', models.filter(isNaughty).every((m) => isCommunity(m) && m.community.by && m.community.base && m.community.baseBy));
  check('no stock model is marked naughty or community', !['gemma4-26b', 'qwen3.6-35b-a3b', 'qwen3.6-27b', 'qwen3.8-27b', 'qwen3.5-9b'].some((id) => isNaughty(byId(id)) || isCommunity(byId(id))));
  check('naughty entries are never Bob\'s pick (trial) and sit under their base family (Qwen or Gemma), named after the base', models.filter(isNaughty).every((m) => m.trial && m.pick === 'optional' && ['Qwen', 'Gemma'].includes(m.family) && FAMILIES[m.family]) && ['qwen3.6-35b-a3b', 'qwen3.6-27b', 'qwen3.8-27b', 'gemma4-26b', 'qwen3.5-9b'].every((id) => byId(`${id}-heretic`).name === `${byId(id).name} Heretic` && byId(`${id}-heretic`).family === byId(id).family));
  check('each naughty brain says what it is and warns in its blurb', models.filter(isNaughty).every((m) => /refusals cut out/.test(m.what) && /without refusing/.test(m.what)));
  check('every naughty brain is Q4 or better and sees pictures through a picture reader', models.filter(isNaughty).every((m) => /Q4_K_[MS]|Q4_0/.test(m.files[0].url) && m.files.some((f) => f.role === 'mmproj')));
  check('a shared picture reader is the very same file as the stock one', byId('qwen3.6-35b-a3b-heretic').files[1].sha256 === byId('qwen3.6-35b-a3b').files[1].sha256 && byId('gemma4-26b-heretic').files[1].sha256 === byId('gemma4-26b').files[1].sha256 && byId('qwen3.5-9b-heretic').files[1].sha256 === byId('qwen3.5-9b').files[1].sha256);
  check('the credit line names the remixer, the base and its maker', /remix by llmfan46 from Alibaba's Qwen3.6 35B-A3B; files packed by mradermacher\. Not a release by Alibaba\./.test(communityLine(byId('qwen3.6-35b-a3b-heretic'))) && communityLine(byId('gemma4-26b')) === '');
  // Off (the default): nowhere.
  check('with the switch off, visibleModels drops every naughty entry and keeps the rest', !visibleModels(models, false).some(isNaughty) && visibleModels(models, false).length === models.length - NAUGHTY.length && visibleModels(models, true).length === models.length);
  const off = catalogueHtml({ ...ctx, showUnsuited: true });
  check('with the switch off, the catalogue lists no naughty brain, in any job', !NAUGHTY.some((id) => off.includes(`id="cat-`) && new RegExp(`id="cat-[a-z]+-${id.replace(/\./g, '\\.')}"`).test(off)));
  check('the toggle shows, Naughty list greyed, with "Show the naughty list" and the warning in a tip', /data-catview="well">😇 Well behaved/.test(off) && /aria-checked="false" data-catview="naughty" aria-disabled="true"><svg class="devil"[^]*?<\/svg> Naughty list \(9\)/.test(off) && /data-naughtyon>Show the naughty list/.test(off) && off.includes('refusals cut out'));
  // On, Well behaved side: still no naughty brain listed, toggle live.
  const onWell = catalogueHtml({ ...ctx, showUnsuited: true, naughtyOn: true });
  check('switch on, Well behaved side: no naughty brain listed, no greyed button, no "Show the naughty list" link', !/cat-[a-z]+-qwen3\.6-35b-a3b-heretic/.test(onWell) && !/aria-disabled/.test(onWell) && !/data-naughtyon/.test(onWell));
  // On, Naughty list side: only the naughty ones, the warning in Bob's words, no stock model, no Other brains.
  const on = catalogueHtml({ ...ctx, showUnsuited: true, naughtyOn: true, catView: 'naughty' });
  check('Naughty list side lists all six and nothing else', NAUGHTY.every((id) => new RegExp(`id="cat-[a-z]+-${id.replace(/\./g, '\\.')}"`).test(on)) && !/id="cat-[a-z]+-gemma4-26b"/.test(on) && !/id="cat-[a-z]+-qwen3\.6-35b-a3b"/.test(on) && !/Other brains on this replicant matrix/.test(on));
  check('the warning is at the top in Bob\'s words with a Help link, and no job is empty', on.includes('naughty-note') && on.includes('what it says is on you') && /data-help="faq-naughty"/.test(on) && !/Nothing in Bob's list for this job yet/.test(on) && !/catjob-gaming/.test(on));
  check('each naughty row wears the red devil tag with the remixer\'s name, and its tip credits the remixer', /cat-tinker-qwen3\.6-35b-a3b-heretic[^]*?<span class="tag warn maker-tag" tabindex="0" data-tip="Community build: uncensored remix by llmfan46[^"]*"[^>]*><svg class="devil"[^]*?<\/svg> Naughty list · llmfan46<\/span>/.test(on) && /Community build: uncensored remix by llmfan46/.test(on));
  check('a naughty brain is never ★ Recommended, even on its own list', !/<span class="tag rec">★ Recommended/.test(on));
  check('the toggle on the Naughty side is checked and not greyed', /aria-checked="true" data-catview="naughty"><svg class="devil"/.test(on) && !/aria-disabled/.test(on));
  check('asking for the Naughty side with the switch off still shows Well behaved', !/cat-[a-z]+-qwen3\.6-35b-a3b-heretic/.test(catalogueHtml({ ...ctx, showUnsuited: true, catView: 'naughty' })));
  check('the warning says they are not the makers\' releases and that the answers are on you', /not Alibaba's or Google's releases/.test(NAUGHTY_WARNING) && /what it says is on you/.test(NAUGHTY_WARNING));
  // The setting itself.
  check('naughtyList is a known setting, off unless true', mergeSettings({}, { naughtyList: 'yes' }).naughtyList === false && mergeSettings({}, { naughtyList: true }).naughtyList === true && mergeSettings({}, {}).naughtyList !== true);
  const cellar = publicText('cellar.js');
  check('the Settings switch is "Show the naughty list", off unless you turn it on, and the menus skip naughty brains while off', /sswitch\('naughtyList', settings\.naughtyList === true, 'Show the naughty list', keep\('Off unless you turn it on/.test(cellar) && /naughtyOn\(\) \|\| !isNaughty\(entryOf\(data\.models, o\.value\)\)/.test(cellar));
  const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8');
  check('Help has the FAQ, the glossary lines and the Settings row', /id: 'faq-naughty'/.test(help) && /<dt>Naughty list<\/dt>/.test(help) && /<dt>Abliterated \(heretic\)<\/dt>/.test(help) && /<dt>Community build<\/dt>/.test(help) && /set\('Show the naughty list', 'Off'/.test(help));
}

// ---- 1.5.133: the red devil, the Community side and Bob's quiet pick ----
{
  const COMM = ['qwen3.6-35b-a3b-opus-distilled', 'qwen3.6-35b-a3b-distill-3.8', 'mimo-9b'];
  check('the red devil is a drawing, not an emoji: red face, orange horns, nothing nasty inside', /<svg class="devil"/.test(DEVIL) && /#d7263d/.test(DEVIL) && /#f28c28/.test(DEVIL) && !/<script|on\w+=/.test(DEVIL) && !/[\u{1F47F}\u{1F608}]/u.test(DEVIL));
  check('the three well-behaved community builds are in, marked community (not naughty), pinned, trial, under Qwen', COMM.every((id) => byId(id) && isCommunity(byId(id)) && !isNaughty(byId(id)) && byId(id).trial && byId(id).family === 'Qwen' && byId(id).community.by && byId(id).community.kind === 'distilled' && /\/resolve\/[0-9a-f]{40}\//.test(byId(id).files[0].url) && byId(id).files.some((f) => f.role === 'mmproj')));
  check('their credit line names the maker and the base, and says it is not the base maker\'s release', /Community build: remix by hesamation from Alibaba's Qwen3.6 35B-A3B\. Not a release by Alibaba\./.test(communityLine(byId(COMM[0]))));
  check('modelsForView: well = all but naughty, community = community but not naughty, naughty only with the switch', !modelsForView(models, 'well').some(isNaughty) && modelsForView(models, 'well').some((m) => COMM.includes(m.id)) && modelsForView(models, 'community').map((m) => m.id).sort().join() === [...COMM].sort().join() && modelsForView(models, 'naughty', false).length === models.length - models.filter(isNaughty).length && modelsForView(models, 'naughty', true).every(isNaughty));
  const well = catalogueHtml({ ...ctx, showUnsuited: true });
  check('Well behaved lists the community builds with a Community tag carrying the maker\'s name, never a devil', /cat-tinker-qwen3\.6-35b-a3b-opus-distilled[^]*?<span class="tag maker-tag" tabindex="0" data-tip="Community build: remix by hesamation[^"]*"[^>]*>Community · hesamation<\/span>/.test(well) && !/devil-rec/.test(well) && !/<svg class="devil"[^]*?<\/svg> Naughty list/.test(well.slice(well.indexOf('</nav>'))));
  // 1.5.133 (the owner: "i can't tell community models apart"): a stripe that differs in shape, not only colour.
  const naughtyHtml = catalogueHtml({ ...ctx, showUnsuited: true, naughtyOn: true, catView: 'naughty' });
  const rowClass = (html, id) => (html.match(new RegExp(`<li class="([^"]*)" id="cat-[a-z]+-${id.replace(/\./g, '\\.')}"`)) || [])[1] || '';
  check('community rows carry the community class, naughty rows the naughty class, stock rows neither', rowClass(well, COMM[0]).split(' ').includes('community') && !rowClass(well, COMM[0]).includes('naughty') && rowClass(naughtyHtml, "qwen3.6-35b-a3b-heretic").split(' ').includes('naughty') && !/community|naughty/.test(rowClass(well, 'qwen3.6-35b-a3b')), [rowClass(well, COMM[0]), rowClass(naughtyHtml, "qwen3.6-35b-a3b-heretic"), rowClass(well, 'qwen3.6-35b-a3b')].join(' / '));
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  check('the stripes differ in shape (solid vs dashed), use theme colours, and fall back plainly', /\.cat-row\.community \{ border-left: 5px solid var\(--good\)/.test(css) && /\.cat-row\.naughty \{ border-left: 5px dashed var\(--bad\)/.test(css) && /forced-colors: active/.test(css));
  check('Help says what the stripes mean, shape first', /a community build's row has a <strong>solid<\/strong> stripe[^<]*and a naughty list row has a <strong>dashed<\/strong> stripe/.test(fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8')));
  const cellarSrc = publicText('cellar.js');
  check('the How Bob works summary is redrawn after every switch, so "Naughty list: off" shows straight away', /const howSum = howSumNow\(\);/.test(cellarSrc) && /dlg\.addEventListener\('change', async \(e\) => \{ try \{ await onChange\(e\); \} finally \{ refreshHowSum\(\); \} \}\);/.test(cellarSrc) && /Naughty list: \$\{onoff\(settings\.naughtyList === true\)\}/.test(cellarSrc));
  // 1.5.133: a team gets its name on the tag and its members in the tip; a stock model gets no tag at all.
  const team = { ...byId('qwen3.6-35b-a3b'), id: 'team-build', name: 'Qwen3.6 35B-A3B Teamed', community: { team: 'Unsloth', members: ['Daniel', 'Michael'], base: 'Qwen3.6 35B-A3B', baseBy: 'Alibaba', kind: 'repack' } };
  check('a team build: tag says the team, tip lists the members; a solo build names the person; a stock model has no tag', makerOf(team) === 'Unsloth' && /Community · Unsloth<\/span>/.test(makerTag(team)) && /data-tip="Community build: remix by the Unsloth team \(Daniel, Michael\) from Alibaba&#39;s Qwen3\.6 35B-A3B\. Not a release by Alibaba\."/.test(makerTag(team)) && makerTag(byId('gemma4-26b')) === '' && makerOf(byId('qwen3.5-9b-heretic')) === 'darkc0de');
  check('a maker\'s name can\'t inject markup into the tag', !/<img/.test(makerTag({ ...team, community: { ...team.community, team: '<img src=x>' } })));
  const comm = catalogueHtml({ ...ctx, showUnsuited: true, catView: 'community' });
  check('the Community side lists only the community builds, with its own words and Help', COMM.every((id) => new RegExp(`id="cat-[a-z]+-${id.replace(/\./g, '\\.')}"`).test(comm)) && !/id="cat-[a-z]+-gemma4-26b"/.test(comm) && !/id="cat-[a-z]+-[a-z0-9.-]*-heretic"/.test(comm) && /aria-checked="true" data-catview="community">🤝 Community \(3\)/.test(comm) && /data-help="faq-community"/.test(comm));
  check('a community build is recommendable once tried: with trial off it takes ★ Recommended for Coding on a 16 GB card', (() => { const tried = models.map((m) => (m.id === COMM[0] ? { ...m, trial: false, raced: 'test' } : m)).filter((m) => m.id !== 'qwen3.6-35b-a3b' && !m.madeByBob); return pickFor('tinker', tried, ctx)?.id === COMM[0] && /cat-tinker-qwen3\.6-35b-a3b-opus-distilled[^]*?★ Recommended<\/span>/.test(catalogueHtml({ ...ctx, models: tried, catView: 'community' })); })());
  // The quiet pick: a naughty brain that has been tried gets the red devil on its own, on the naughty side only.
  const tried = models.map((m) => (m.id === 'qwen3.6-35b-a3b-heretic' ? { ...m, trial: false } : m));
  check('a naughty brain is never Bob\'s pick among the well-behaved, even once tried and with the switch on', pickFor('tinker', tried, ctx)?.id !== 'qwen3.6-35b-a3b-heretic' && !/devil-rec/.test(catalogueHtml({ ...ctx, models: tried, naughtyOn: true })) && !/devil-rec/.test(catalogueHtml({ ...ctx, models: tried, naughtyOn: true, catView: 'community' })));
  const onTried = catalogueHtml({ ...ctx, showUnsuited: true, models: tried, naughtyOn: true, catView: 'naughty' });
  check('on the naughty side the tried brain wears the red devil alone where ★ would be, with a tip, and its family header says "inside"', /cat-tinker-qwen3\.6-35b-a3b-heretic[^]*?<span class="tag rec devil-rec" tabindex="0" data-tip="Bob's quiet pick[^"]*" aria-label="Bob's quiet pick for this job"><svg class="devil"/.test(onTried) && !/<span class="tag rec">★ Recommended/.test(onTried) && /<span class="tag rec devil-rec" aria-label="Bob's quiet pick is inside"><svg class="devil"[^]*?<\/svg> inside<\/span>/.test(onTried) && pickFor('tinker', tried, { ...ctx, naughtyPick: true })?.id === 'qwen3.6-35b-a3b-heretic');
  const onNew = catalogueHtml({ ...ctx, showUnsuited: true, naughtyOn: true, catView: 'naughty' });
  check('with every naughty brain still New, the naughty side has no quiet pick', !/devil-rec/.test(onNew));
  check('the quiet pick is explained at the top of the naughty side', /red devil on its own, where ★ Recommended would be, is my quiet pick/.test(onNew));
  const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8');
  check('Help: the community FAQ, the quiet pick glossary line, and no emoji devil anywhere in the app text', /id: 'faq-community'/.test(help) && /<dt>Quiet pick<\/dt>/.test(help) && !/[\u{1F608}\u{1F47F}]/u.test(help + fs.readFileSync(new URL('../public/catalogue.js', import.meta.url), 'utf8') + publicText('cellar.js')));
}

// ---- llama.cpp finds a downloaded brain's picture reader ----
{
  const { LlamaCpp } = await import('../src/llamacpp.js').catch(() => ({}));
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-cat-'));
  const dir = path.join(tmp, 'models', 'bob', 'chat');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'Qwen3.5-4B-Q4_K_M.gguf'), 'x');
  fs.writeFileSync(path.join(dir, 'Qwen3.5-4B-mmproj-F16.gguf'), 'x');
  if (LlamaCpp) {
    const lc = Object.create(LlamaCpp.prototype);
    lc.cfg = { agentDir: tmp };
    const got = lc.catalogFile('qwen3.5-4b');
    check('a downloaded brain resolves to its GGUF and its own picture reader', got?.gguf?.endsWith('Qwen3.5-4B-Q4_K_M.gguf') && got?.mmproj?.endsWith('Qwen3.5-4B-mmproj-F16.gguf'), JSON.stringify(got));
    fs.rmSync(path.join(dir, 'Qwen3.5-4B-mmproj-F16.gguf'));
    check('without the picture reader it still runs, just without sight', lc.catalogFile('qwen3.5-4b')?.gguf && !lc.catalogFile('qwen3.5-4b').mmproj);
  } else check('llamacpp exports its engine class', false);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- no assumptions about how this replicant matrix is laid out ----
{
  const no = () => false;
  check('Ollama models: OLLAMA_MODELS wins', ollamaModelsDir({ agentDir: '/bob', env: { OLLAMA_MODELS: '/big/ollama' }, home: '/h', exists: no }) === '/big/ollama');
  check('...then Bob\'s own models folder if Ollama keeps its files there', ollamaModelsDir({ agentDir: '/bob', env: {}, home: '/h', exists: (p) => p === path.join('/bob', 'models', 'manifests') }) === path.join('/bob', 'models'));
  check('...else Ollama\'s usual folder in the user\'s home', ollamaModelsDir({ agentDir: '/bob', env: {}, home: '/h', exists: (p) => p === path.join('/h', '.ollama', 'models') }) === path.join('/h', '.ollama', 'models'));
  check('Pinokio is looked for on any drive and in the home folder, not only C:', pinokioRoots({ platform: 'win32', home: '/h', exists: (p) => p === 'E:\\pinokio' }).length === 2 && pinokioRoots({ platform: 'linux', home: '/h', exists: (p) => p === path.join('/h', 'pinokio') }).length === 2 && !pinokioRoots({ platform: 'win32', home: '/h', exists: no }).length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
