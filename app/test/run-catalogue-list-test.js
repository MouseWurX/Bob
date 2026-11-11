// 1.5.137: the full brain list. Every brain has a release date; "New" = one of the five newest releases in its family
// (and under a year old); "Dated" = newer brains do its job better (kept, never removed); brains too big for this
// replicant matrix and every Bob on the Bob-Net leave the catalogue's job lists for Rented brains; the really big brains
// are listed in Add a rental; Bob can fetch his newest brain list from GitHub (off unless switched on); and a file Bob
// downloaded himself has no "(downloaded by Bob)" bracket. Run: node test/run-catalogue-list-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { catalogueHtml, newIds, dayWords, datedLine, rentPicks, NEW_PER_FAMILY, familyOf, FAMILIES } from '../public/catalogue.js';
import { tooBigEverywhere, roomOn, pickFor } from '../public/fit.js';
import { matchModel, findModel, serviceOf } from '../src/rental.js';
import { checkList, overlay, badModel, CatalogUpdates, LIST_URL, onFor } from '../src/catalog-update.js';
import { cleanAbilities, helloFor, bobNetRooms } from '../src/share-brains.js';
import { rentAsOf, fileLabel } from '../src/models.js';
import { mergeSettings } from '../src/config.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');
const catalog = JSON.parse(read('catalog.json'));
const models = catalog.models.map((m) => ({ ...m, rentAs: rentAsOf(m), status: { state: 'missing', canDownload: true } }));
const byId = (id) => models.find((m) => m.id === id);
const NOW = Date.parse('2026-11-08T12:00:00Z');
const ctx = { roles: { current: {}, options: { llm: [] } }, models, brains: {}, active: {}, vramGB: 16, ramGB: 32, freeGB: 500, packs: catalog.packs, platform: 'win32', now: NOW };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---- the list itself ----
{
  const brains = models.filter((m) => m.jobs);
  check('the list is dated', DATE.test(catalog.updated || ''), catalog.updated);
  check('every brain says when its maker put it out', brains.every((m) => DATE.test(m.published || '')), brains.filter((m) => !DATE.test(m.published || '')).map((m) => m.id).join(','));
  check('no release date is in the future', brains.every((m) => m.published <= catalog.updated), brains.filter((m) => m.published > catalog.updated).map((m) => m.id).join(','));
  const NEWB = ['nemotron-3.5-bolt-e4b', 'granite-4.1-3b', 'qwen3.5-0.8b', 'mimo-9b', 'granite-4.1-8b', 'ministral-3-8b', 'gemma4-12b', 'ministral-3-14b', 'nemotron-3.5-lightning', 'laguna-xs-2.1', 'glm-4.7-flash', 'devstral-small-2', 'gemma4-31b', 'granite-4.1-30b', 'nemotron-3.5-bolt-74b', 'gemma4-12b-heretic', 'gemma4-e4b-heretic', 'qwen3.5-4b-heretic'];
  check('the 18 brains from the full list are in', NEWB.every((id) => byId(id)), NEWB.filter((id) => !byId(id)).join(','));
  check('they are all untried (never recommended yet)', NEWB.every((id) => byId(id).trial === true));
  check('their files are pinned to exact commits with size and sha256, Q4 or better', NEWB.every((id) => byId(id).files.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && f.bytes > 0 && /^[0-9a-f]{64}$/.test(f.sha256)) && !/Q3_|Q2_|IQ3|IQ2/.test(byId(id).files[0].url)), NEWB.filter((id) => !byId(id).files.every((f) => /\/resolve\/[0-9a-f]{40}\//.test(f.url) && /^[0-9a-f]{64}$/.test(f.sha256 || ''))).join(','));
  check('every family has its blurb', [...new Set(brains.map(familyOf))].every((f) => FAMILIES[f]), [...new Set(brains.map(familyOf))].filter((f) => !FAMILIES[f]).join(','));
  check('dated brains name newer brains that are in the list, and say why', models.filter((m) => m.dated).length >= 3 && models.filter((m) => m.dated).every((m) => m.dated.why && m.dated.newer?.length && m.dated.newer.every((id) => byId(id))));
  check('nothing was taken away: the dated brains are still there', ['qwen2.5-coder-7b', 'qwen2.5-vl-7b', 'qwen3-coder-30b'].every((id) => byId(id) && byId(id).dated));
  const big = catalog.bigBrains || [];
  check('the really big brains are listed (DeepSeek, GLM, Kimi, Mistral Large and more)', big.length >= 15 && ['deepseek', 'glm', 'kimi', 'mistral-large'].every((k) => big.some((b) => b.id.includes(k))));
  check('each big brain has a Hugging Face name, a date, a maker and a way to rent it', big.every((b) => /^[\w.-]+\/[\w.-]+$/.test(b.hf) && DATE.test(b.published) && b.by && b.license && (b.rent?.answerOnly === true || (['24', '48', '80', '141'].includes(String(b.rent?.card)) && [1, 2, 4, 8].includes(b.rent?.cards)))), big.filter((b) => !/^[\w.-]+\/[\w.-]+$/.test(b.hf || '')).map((b) => b.id).join(','));
  check('no big brain id clashes with a catalogue brain', !big.some((b) => byId(b.id)));
  check('the shipped list passes the same checks as a fetched one (its own size-only voices as they ship)', checkList(catalog, { shipped: catalog }).ok, checkList(catalog, { shipped: catalog }).why || '');
  check('but a size-only file that isn\'t exactly as it ships is refused', !checkList({ ...catalog, models: catalog.models.map((m) => (m.id === 'piper-ryan-high' ? { ...m, files: m.files.map((f) => ({ ...f, bytes: f.bytes + 1 })) } : m)) }, { shipped: catalog }).ok);
}

// ---- New and Dated ----
{
  const ids = newIds(models, { now: NOW });
  const fam = (f) => models.filter((m) => m.jobs && familyOf(m) === f);
  for (const f of ['Qwen', 'Gemma', 'Nemotron']) {
    const dates = [...new Set(fam(f).map((m) => m.published))].sort().reverse().filter((d) => NOW - Date.parse(d) <= 365 * 864e5).slice(0, NEW_PER_FAMILY);
    check(`${f}: New = the brains from its five newest release days (under a year old)`, fam(f).every((m) => ids.has(m.id) === dates.includes(m.published)));
  }
  check('a brain more than a year old is never New, even in a small family', !ids.has('qwen2.5-coder-7b') && !ids.has('gpt-oss-20b') && !newIds([{ id: 'a', jobs: ['bob'], family: 'X', published: '2024-01-01' }], { now: NOW }).size);
  check('a brain with no date (or a media model) is never New', !newIds([{ id: 'a', jobs: ['bob'], family: 'X' }, { id: 'b', family: 'X', published: '2026-11-01' }], { now: NOW }).size);
  check('at most five release days per family', !newIds([1, 2, 3, 4, 5, 6, 7].map((n) => ({ id: `m${n}`, jobs: ['bob'], family: 'X', published: `2026-10-0${n}` })), { now: NOW }).has('m1'));
  check('dates read as words', dayWords('2026-10-23') === 'October 23, 2026' && dayWords('nope') === '');
  const html = catalogueHtml({ ...ctx, showUnsuited: true });
  const row = (id) => (html.match(new RegExp(`<li class="[^"]*" id="cat-[a-z]+-${id.replace(/\./g, '\\.')}">[^]*?</li>`)) || [''])[0];
  check('a New brain wears the New tag, with its family and day in the tag\'s tip', /class="tag new-tag" tabindex="0" data-tip="New: one of the five newest releases in the Nemotron family\. Released October 23, 2026\.">New<\/span>/.test(row('nemotron-3.5-bolt-e4b')));
  check('an old brain has no New tag; its i says the day it came out', !/new-tag/.test(row('qwen2.5-coder-7b')) && /Released September 19, 2024/.test(row('qwen2.5-coder-7b')));
  check('a dated brain wears Dated, its tip names the newer brains and says it stays', /class="tag dated-tag" tabindex="0" data-tip="Dated: [^"]*Newer ones to try: Qwen3\.5 9B[^"]*It stays on the list; nothing is taken away\.">Dated<\/span>/.test(row('qwen2.5-coder-7b')), datedLine(byId('qwen2.5-coder-7b'), models));
  check('an untried brain says so in its tip, not with a tag', /Not tried on a real replicant matrix yet, so I don&#39;t recommend it yet/.test(row('granite-4.1-8b')) && !/<span class="tag">New<\/span>/.test(html));
  check('New and Dated never make a brain Bob\'s pick (untried brains still never are)', ['bob', 'tinker', 'small', 'eyes'].every((j) => !byId(pickFor(j, models, ctx)?.id || 'x')?.trial));
}

// ---- too big for every Bob on the Bob-Net: Rented brains ----
{
  const small = { vramGB: 6, ramGB: 16 }, bolt = byId('nemotron-3.5-bolt-74b');
  const r70 = byId('deepseek-r1-distill-llama-70b');
  check('on a 6 GB laptop alone, the 42 GB DeepSeek R1 70B is too big everywhere', tooBigEverywhere(r70, small, []) && tooBigEverywhere(bolt, { vramGB: 6, ramGB: 8 }, []));
  check('1.5.205: the card alone no longer decides: the Bolt 74B (made of experts) stays, partly read from the drive', !tooBigEverywhere(bolt, small, []) && !tooBigEverywhere(byId('qwen3.6-35b-a3b'), small, []) && tooBigEverywhere(byId('qwen3.6-27b'), small, []));
  check('with a 16 GB card Bob on the Bob-Net it isn\'t (it runs, slowly, there)', !tooBigEverywhere(bolt, small, [{ name: 'npc', vramGB: 16, ramGB: 32 }]));
  check('a brain that runs well on a Bob-Net Bob names him', roomOn(byId('qwen3.6-27b'), [{ name: 'Go', vramGB: 8, ramGB: 16 }, { name: 'npc', vramGB: 24, ramGB: 32 }]) === 'npc' && roomOn(byId('qwen3.6-27b'), [{ name: 'Go', vramGB: 8 }]) === '');
  check('only "won\'t run well" counts: slow, installed, half downloaded, your own or a squeezed file never leave', !tooBigEverywhere(byId('qwen3.6-27b'), { vramGB: 16, ramGB: 32 }, []) && !tooBigEverywhere({ ...bolt, status: { state: 'installed' } }, small, []) && !tooBigEverywhere({ ...bolt, status: { state: 'partial' } }, small, []) && !tooBigEverywhere({ ...bolt, own: true }, small, []) && !tooBigEverywhere({ ...bolt, maxCardGB: 8 }, { vramGB: 16 }, []));
  check('media models are never moved', !tooBigEverywhere({ id: 'v', category: 'video', vramGB: 40 }, small, []));
  const lap = catalogueHtml({ ...ctx, vramGB: 6, ramGB: 16, showUnsuited: true });
  check('on the laptop the catalogue leaves it out and says where it went', !/id="cat-[a-z]+-deepseek-r1-distill-llama-70b"/.test(lap) && /id="cat-[a-z]+-nemotron-3\.5-bolt-74b"/.test(lap) && /class="muted too-big-note">\d+ more (is|are) too big for this replicant matrix\. [^<]*<button type="button" class="link" data-rentsettings>Rented brains<\/button>/.test(lap));
  const lapNet = catalogueHtml({ ...ctx, vramGB: 6, ramGB: 16, showUnsuited: true, bobNet: [{ name: 'npc', vramGB: 16, ramGB: 32 }] });
  check('with the big computer on the Bob-Net it stays, and the i says which Bob it fits', /id="cat-[a-z]+-nemotron-3\.5-bolt-74b"/.test(lapNet) && /Fits npc on your Bob-Net\./.test(lapNet));
  const big16 = models.filter((m) => tooBigEverywhere(m, { vramGB: 16, ramGB: 32 }, [])).map((m) => m.id);
  check('on the 16 GB computer only the DeepSeek R1 70B is too big, and the footer says one more', big16.join() === 'deepseek-r1-distill-llama-70b' && /class="muted too-big-note">1 more is too big/.test(catalogueHtml({ ...ctx, showUnsuited: true })), big16.join());
}

// ---- the hello carries the room; Bob-Net rooms come from the cached hellos ----
{
  const brain = { cfg: { share: {} }, queue: [], engine: {} };
  const h = helloFor(brain, { why: 'off', quick: null, can: {}, version: 'x', label: () => '', room: { vramGB: 16, ramGB: 32 } });
  check('a desktop hello says his graphics card and memory', h.room?.vramGB === 16 && h.room?.ramGB === 32);
  check('the asker keeps only numbers, capped; a hello without a room has none', JSON.stringify(cleanAbilities({ room: { vramGB: '16', ramGB: 1e9, evil: '<x>' } }).room) === JSON.stringify({ vramGB: 16, ramGB: 16384 }) && !('room' in cleanAbilities({})) && !('room' in cleanAbilities({ room: { vramGB: -3 } })));
  const L = { bobs: () => [{ name: 'npc', address: 'a' }, { name: 'phone', address: 'b' }, { name: 'old', address: 'c' }], state: new Map([['a', { ok: true, room: { vramGB: 16, ramGB: 32 } }], ['b', { ok: true, device: 'phone', room: { vramGB: 0, ramGB: 8 } }], ['c', { ok: true }]]) };
  check('Bob-Net rooms: computers that said their room; phones and older Bobs left out', JSON.stringify(bobNetRooms(L)) === JSON.stringify([{ name: 'npc', vramGB: 16, ramGB: 32 }]));
  const server = read('src/server.js');
  check('/api/models adds the rooms, asking only Bobs already listed, never for more than 2.5 s', /bobNet: bobNetRooms\(brain\.lenders\)/.test(server) && /setTimeout\(r, 2500\)/.test(server) && /room: myRoom/.test(server));
}

// ---- Rented brains: Pick a brain from Bob's list ----
{
  const picks = rentPicks(models, catalog.bigBrains, { vramGB: 6, ramGB: 8 }, [], 'win32');
  check('the picker lists every really big brain', catalog.bigBrains.every((b) => picks.some((p) => p.key === `big:${b.id}`)));
  check('and the catalogue brains too big for your Bobs, as a GGUF file a rented machine can fetch', picks.some((p) => p.key === 'cat:nemotron-3.5-bolt-74b' && /^nvidia\/[\w.-]+\/[\w.-]+\.gguf$/.test(p.model) && p.card === '48'));
  check('no squeezed file, and naughty ones only when the caller passes them (Settings passes only what\'s visible)', !picks.some((p) => p.key === 'cat:qwen3.6-35b-a3b-q3') && /rentPicks\(visibleModels\(data\?\.models \|\| \[\], naughtyOn\(\)\)/.test(read('public/cellar.js')));
  check('none that fit one of your Bobs', !rentPicks(models, [], { vramGB: 6 }, [{ name: 'npc', vramGB: 24, ramGB: 64 }]).some((p) => p.key === 'cat:nemotron-3.5-bolt-74b'));
  check('pay-per-answer-only brains carry no machine model; multi-card ones say how many', picks.filter((p) => p.answerOnly).every((p) => p.model === '') && picks.some((p) => p.cards === 8));
  check('rentAsOf turns a pinned file into Owner/Repo/file.gguf, and nothing else', rentAsOf({ files: [{ role: 'gguf', url: 'https://huggingface.co/a/b/resolve/0123456789abcdef0123456789abcdef01234567/x.gguf' }] }) === 'a/b/x.gguf' && rentAsOf({ files: [{ role: 'gguf', url: 'https://evil.example/a/b/resolve/0123456789abcdef0123456789abcdef01234567/x.gguf' }] }) === '' && rentAsOf({}) === '');
  const list = [{ id: 'deepseek/deepseek-v4-pro' }, { id: 'z-ai/glm-5.3' }, { id: 'google/gemma-4-31b-it' }, { id: 'qwen/qwen3.6-27b' }];
  check('Find it matches by Hugging Face name or plain name, ignoring FP8/BF16/GGUF and punctuation', matchModel(list, { hf: 'zai-org/GLM-5.3-FP8' }) === 'z-ai/glm-5.3' && matchModel(list, { hf: 'unsloth/Qwen3.6-27B-GGUF' }) === 'qwen/qwen3.6-27b' && matchModel(list, { name: 'Gemma 4 31B' }) === 'google/gemma-4-31b-it' && matchModel(list, { hf: 'a/Kimi-K3' }) === null);
  let asked = '';
  const fake = async (url) => { asked = url; return { ok: true, json: async () => ({ data: list }) }; };
  check('Find it reads the service\'s own model list (https only) and never for a machine service', await findModel('openrouter', { hf: 'deepseek-ai/DeepSeek-V4-Pro-0813', name: 'DeepSeek V4 Pro' }, 'k', fake) === 'deepseek/deepseek-v4-pro' && asked === 'https://openrouter.ai/api/v1/models' && await findModel('runpod', { hf: 'x/y' }, 'k', fake) === null && await findModel('other', { hf: 'x/y', address: 'http://plain' }, '', fake) === null);
  const routes = read('src/rental-routes.js');
  check('/api/rent/find needs this replicant matrix, the service switched on, and its key', /p === '\/api\/rent\/find'/.test(routes) && routes.indexOf("p === '/api/rent/find'") > routes.indexOf('if (!isLocal)') && /st\.enabled\[s\.id\] !== true/.test(routes));
  const cellar = read('public/cellar.js');
  check('Add a rental has the picker and Find it; it never sets more than one card by itself', /Pick a brain from Bob's list/.test(cellar) && /data-rentfind/.test(cellar) && !/\[data-rentadd="cards"\]'\)\.value = String\(p\.cards/.test(cellar) && /Set Cards on the machine to \$\{p\.cards\}/.test(cellar));
}

// ---- the newest brain list from GitHub ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-list-'));
  const pin = (n) => ({ role: 'gguf', url: `https://huggingface.co/o/r/resolve/${'a'.repeat(40)}/f${n}.gguf`, bytes: 10, sha256: 'b'.repeat(64) });
  const nb = { id: 'shiny-9b', name: 'Shiny 9B', family: 'Qwen', category: 'llm', jobs: ['bob'], published: '2026-12-01', files: [pin(1)], vramGB: 7, sizeGB: 6, license: 'Apache 2.0', trial: true };
  const later = { updated: '2026-12-02', models: [nb, { ...byId('qwen3-4b'), status: undefined, what: 'Updated words.' }], bigBrains: [] };
  check('the switch is off unless turned on', mergeSettings({}, {}).catalogUpdates !== true && mergeSettings({}, { catalogUpdates: 'yes' }).catalogUpdates === false && mergeSettings({}, { catalogUpdates: true }).catalogUpdates === true && !onFor({}));
  check('a list must be newer than the one Bob has', !checkList({ ...later, updated: '2026-11-01' }, { have: '2026-11-08' }).ok && checkList(later, { have: '2026-11-08' }).ok);
  check('every file must be pinned with size and sha256', badModel({ ...nb, files: [{ ...pin(1), url: 'https://huggingface.co/o/r/resolve/main/f.gguf' }] }) && badModel({ ...nb, files: [{ ...pin(1), sha256: '' }] }) && badModel({ ...nb, files: [{ ...pin(1), bytes: 0 }] }) && badModel({ ...nb, files: [{ ...pin(1), url: 'https://evil.example/o/r/resolve/' + 'a'.repeat(40) + '/f.gguf' }] }));
  check('no fetched brain may claim to be yours or Bob\'s own, or pick its own folder', badModel({ ...nb, own: true }) && badModel({ ...nb, madeByBob: true }) && badModel({ ...nb, into: 'x' }) && badModel({ ...nb, files: [{ ...pin(1), saveAs: '../x.gguf' }] }));
  check('1.5.169: Bob\'s own brain is fine exactly as it shipped, refused with other files or when it didn\'t ship as his', !badModel({ ...nb, madeByBob: true }, { ...nb, madeByBob: true }) && badModel({ ...nb, madeByBob: true, files: [pin(2)] }, { ...nb, madeByBob: true }) && badModel({ ...nb, madeByBob: true }, { ...nb }));
  check('one bad brain spoils the list (it is kept whole or not at all)', !checkList({ ...later, models: [nb, { ...nb, id: 'bad', files: [] }] }).ok);
  const merged = overlay(catalog, later);
  check('a newer list adds and updates by id, and never takes a brain away', merged.models.length === catalog.models.length + 1 && merged.models.find((m) => m.id === 'qwen3-4b').what === 'Updated words.' && catalog.models.every((m) => merged.models.some((x) => x.id === m.id)) && merged.packs === catalog.packs && merged.updated === '2026-12-02');
  check('an older list changes nothing', overlay(catalog, { ...later, updated: '2020-01-01' }) === catalog);
  let calls = 0;
  const fetchOk = async (url) => { calls++; check('it reads Bob\'s own list on GitHub', url === LIST_URL && /^https:\/\/raw\.githubusercontent\.com\/MouseWurX\/Bob\/main\/app\/catalog\.json$/.test(url)); return { ok: true, text: async () => JSON.stringify(later) }; };
  const off = new CatalogUpdates({ dataDir: tmp }, { fetch: fetchOk });
  check('off: no fetch at all, and the shipped list', (await off.check(catalog)).why === 'off' && calls === 0 && off.merge(catalog) === catalog && !off.due());
  const cfg = { dataDir: tmp, catalogUpdates: true };
  const on = new CatalogUpdates(cfg, { fetch: fetchOk, now: () => NOW });
  const r = await on.check(catalog);
  check('on: it fetches, checks, saves and says what it got', r.ok && r.added === 1 && calls === 1 && fs.existsSync(path.join(tmp, 'catalog-latest.json')) && /1 new brain/.test(r.why));
  check('and the merged list has the new brain', on.merge(catalog).models.some((m) => m.id === 'shiny-9b'));
  cfg.catalogUpdates = false;
  check('turning it off goes back to the shipped list', on.merge(catalog) === catalog);
  cfg.catalogUpdates = true;
  const bad = new CatalogUpdates(cfg, { fetch: async () => ({ ok: true, text: async () => JSON.stringify({ ...later, updated: '2026-12-09', models: [{ ...nb, files: [{ ...pin(1), sha256: 'x' }] }] }) }) });
  check('a list that fails a check is not saved, and the saved one stays', !(await bad.check(catalog)).ok && JSON.parse(fs.readFileSync(path.join(tmp, 'catalog-latest.json'), 'utf8')).updated === '2026-12-02');
  const down = new CatalogUpdates(cfg, { fetch: async () => { throw new Error('The operation was aborted due to timeout'); } });
  check('GitHub not answering is said plainly', (await down.check(catalog)).why === 'GitHub didn\'t answer in time.');
  fs.rmSync(tmp, { recursive: true, force: true });
  const server = read('src/server.js'), cellar = read('public/cellar.js');
  check('the server merges it at start, checks once a day only when due, and Check now is this replicant matrix only', /shop\.catalog = mergeAdded\(listUpdates\.merge\(shop\.shipped\), cfg\)/.test(server) && /if \(listUpdates\.due\(\)\)/.test(server) && /p === '\/api\/catalog\/latest'\) \{\s*if \(!isLocal\)/.test(server));
  check('Settings: "Let Bob fetch his newest brain list" under Going online, off, with Check now', /sswitch\('catalogUpdates', settings\.catalogUpdates === true, 'Let Bob fetch his newest brain list', keep\('Off unless you turn it on\./.test(cellar) && /data-listcheck>Check now/.test(cellar));
}

// ---- DeepSeek's thinking brains (the owner, Nov 10: "i want to have access to their thinking") ----
{
  const R1 = ['deepseek-r1-distill-qwen-1.5b', 'deepseek-r1-distill-qwen-7b', 'deepseek-r1-distill-llama-8b', 'deepseek-r1-0528-qwen3-8b', 'deepseek-r1-distill-qwen-14b', 'deepseek-r1-distill-qwen-32b', 'deepseek-r1-distill-llama-70b'];
  check('the seven R1 distills are in, under DeepSeek, untried, thinking brains', R1.every((id) => byId(id)?.family === 'DeepSeek' && byId(id).trial && byId(id).thinks === true && byId(id).jobs.includes('deep')), R1.filter((id) => !byId(id)).join(','));
  check('each is one pinned Q4_K_M file with size and sha256', R1.every((id) => byId(id).files.length === 1 && /\/resolve\/[0-9a-f]{40}\/DeepSeek-R1-[\w.-]+-Q4_K_M\.gguf$/.test(byId(id).files[0].url) && byId(id).files[0].bytes > 0 && /^[0-9a-f]{64}$/.test(byId(id).files[0].sha256)));
  check('they say who taught them and on what, and carry the Llama licence where it applies', R1.every((id) => byId(id).distilledFrom?.teacher === 'DeepSeek-R1' && byId(id).distilledFrom.base) && /Llama 3\.1/.test(byId('deepseek-r1-distill-llama-8b').license) && /Llama 3\.3/.test(byId('deepseek-r1-distill-llama-70b').license));
  check('all but the newest are over a year old, so none is New, and each is Dated (kept, with newer ones named)', !R1.some((id) => newIds(models, { now: NOW }).has(id)) && R1.every((id) => byId(id).dated?.newer?.every((n) => byId(n))));
  const tip = datedLine(byId('deepseek-r1-distill-qwen-14b'), models);
  check('the Dated line never ends in two full stops', !/\.\./.test(tip) && !/\.\./.test(datedLine(byId('qwen2.5-coder-7b'), models)), tip);
  const html = catalogueHtml({ ...ctx, showUnsuited: true });
  check('their i says they write out their thinking, and who taught them', /Writes out its thinking before it answers; you can read it under Bob&#39;s thinking\.|Writes out its thinking before it answers; you can read it under Bob's thinking\./.test(html) && /Taught to think by DeepSeek-R1, on Alibaba&#39;s Qwen2\.5 14B\.|Taught to think by DeepSeek-R1, on Alibaba's Qwen2\.5 14B\./.test(html));
  check('the 70B is offered under Rented brains on a 16 GB card, as a GGUF file a rented machine fetches', rentPicks(models, catalog.bigBrains, { vramGB: 16, ramGB: 32 }, []).some((p) => p.key === 'cat:deepseek-r1-distill-llama-70b' && /^unsloth\/DeepSeek-R1-Distill-Llama-70B-GGUF\/DeepSeek-R1-Distill-Llama-70B-Q4_K_M\.gguf$/.test(p.model) && p.card === '80'));
  check('the DeepSeek family has its blurb', /R1 thinking/.test(FAMILIES.DeepSeek || ''));
}

// ---- no "(downloaded by Bob)" ----
check('a file Bob downloaded himself is just its name', fileLabel({ name: 'Qwen3 4B' }) === 'Qwen3 4B' && !/downloaded by Bob\)|Bob's downloaded copy\)/.test(read('src/models.js') + read('src/brain.js')));

// ---- Help ----
{
  const h = (id) => HELP.find((e) => e.id === id);
  check('Help explains New and Dated, in Bob\'s voice', /five newest release/.test(h('faq-new-dated')?.html || '') && /I don't take it off the list/.test(h('faq-new-dated')?.html || ''));
  check('Help says why a big brain went to Rented brains and how to pick it there', /Rented brains/.test(h('faq-too-big')?.html || '') && /Pick a brain from Bob's list/.test(h('faq-too-big')?.html || '') && /Find it on this service/.test(h('faq-too-big')?.html || ''));
  check('Help explains the newest brain list: off, pinned, never removes, nothing about you sent', /off to start with/.test(h('faq-brain-list-updates')?.html || '') && /pinned/.test(h('faq-brain-list-updates')?.html || '') && /never takes one away/.test(h('faq-brain-list-updates')?.html || '') && /Nothing about you is sent/.test(h('faq-brain-list-updates')?.html || ''));
  check('the catalogue page and the glossary mention New, Dated and the too-big line', /five newest releases/.test(h('catalogue').html) && /Dated/.test(h('catalogue').html) && /Rented brains/.test(h('catalogue').html) && /Really big brains/.test(h('glossary').html));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
