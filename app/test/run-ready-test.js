// 1.5.91 "Bob ready in a few clicks": one Get Bob ready list (every program and model tickable), slots filled by Bob
// himself when a download is in, his own Python, and the chat's Set it up card instead of errors.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readyList, readyDefaults, readyToggle, readyOrder, packFor, MUSIC_ID, coreEngines, readyPlan } from '../public/equip.js';
import { planFor, switchFor, applySwitch, NEEDS, SWITCH_KEYS, SetupOffers, HAND_CAN } from '../src/setup-offer.js';
import { ModelShop } from '../src/models.js';
import { Brain } from '../src/brain.js';
import { OWN_PYTHON, getOwnPython, ownPythonExe } from '../src/audio.js';
import { OS } from '../src/platform.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const catalog = JSON.parse(read('catalog.json'));
const ENG = { llamacpp: 'llama.cpp', sdcpp: 'stable-diffusion.cpp', whispercpp: 'whisper.cpp', kokoro: 'Kokoro voices', audio: 'Audio tools', piper: 'Piper' };
const engines = (over = {}) => Object.entries(ENG).map(([id, name]) => ({ id, name, sizeGB: id === 'audio' ? 12 : 0.5, installed: false, available: true, ...(over[id] || {}) }));
const models = (here = []) => catalog.models.map((m) => ({ ...m, status: { state: here.includes(m.id) ? 'installed' : 'missing' } }));

// ---------- The Get Bob ready list ----------
{
  const hw = { vramGB: 16, ramGB: 32, nvidia: true };
  const pack = packFor(catalog.packs, 16, false);
  const rows = readyList({ pack, models: models(), engines: engines(), hw });
  const ids = rows.map((r) => r.id);
  check('every program and model has its own row', ['engine:llamacpp', 'engine:sdcpp', 'engine:whispercpp', 'engine:kokoro', 'bobert-35b', 'riker-28b-q3', 'z-image-turbo', 'wan2.2-ti2v-5b', 'kokoro-v1', 'nomic-embed-text'].every((id) => ids.includes(id)), ids.join(','));
  const picks = readyDefaults(rows);
  check('the recommended ones come ticked', picks.has('wan2.2-ti2v-5b') && picks.has('z-image-turbo') && picks.has('engine:sdcpp'));
  check('music is offered but left unticked (a large optional download)', ids.includes(MUSIC_ID) && !picks.has(MUSIC_ID) && !picks.has('engine:audio'));
  const order = readyOrder(rows, picks);
  check('programs download before the models that run on them', order.ids.indexOf('engine:sdcpp') < order.ids.indexOf('z-image-turbo') && order.ids[0].startsWith('engine:'));
  check('each ticked model has its slots to fill', order.equip['z-image-turbo']?.includes('image') && order.equip['wan2.2-ti2v-5b']?.includes('video') && order.equip['kokoro-v1']?.includes('speech'));
  const withMusic = readyToggle(rows, picks, MUSIC_ID, true);
  check('ticking a model ticks the program it runs on', withMusic.has('engine:audio'));
  check('music goes in the Music slot', readyOrder(rows, withMusic).equip[MUSIC_ID]?.[0] === 'music');
  const noSd = readyToggle(rows, picks, 'engine:sdcpp', false);
  check('unticking a program a ticked model needs is pointed out', readyOrder(rows, noSd).missing.some((x) => x.engine === 'stable-diffusion.cpp'));
  const less = readyToggle(rows, picks, 'qwen-image-edit-2509', false);
  check('unticking a model takes its size off the total', readyOrder(rows, less).sizeGB < order.sizeGB);
  const mac = readyList({ pack, models: models(), engines: engines({ whispercpp: { available: false, note: 'no Mac build' } }), hw });
  check('a program that has no build here is left off the list', !mac.some((r) => r.id === 'engine:whispercpp'));
  const here = readyList({ pack, models: models(['z-image-turbo']), engines: engines({ sdcpp: { installed: true } }), hw });
  check('what is already here is shown, not downloaded again', !readyOrder(here, readyDefaults(here)).ids.includes('z-image-turbo') && here.find((r) => r.id === 'z-image-turbo').here);
  const small = readyList({ pack: packFor(catalog.packs, 6, false), models: models(), engines: engines(), hw: { vramGB: 6 } });
  check('a 6 GB card gets the light versions', small.some((r) => r.id === 'wan2.2-ti2v-5b-q4') && !small.some((r) => r.id === 'wan2.2-ti2v-5b'));
  const go = (ram) => readyList({ pack: packFor(catalog.packs, 0, true), models: models(), engines: engines(), hw: { integrated: true, ramGB: ram } });
  check('built-in graphics with 32 GB: Gemma 4 26B and Qwen 3.8 27B are offered, unticked', go(32).some((r) => r.id === 'gemma4-26b') && go(32).some((r) => r.id === 'qwen3.8-27b') && !readyDefaults(go(32)).has('qwen3.8-27b') && !readyDefaults(go(32)).has('gemma4-26b'));
  check('...but not with 16 GB', !go(16).some((r) => r.id === 'qwen3.8-27b'));
  const both = readyToggle(go(32), readyToggle(go(32), readyDefaults(go(32)), 'gemma4-26b', true), 'qwen3.8-27b', true);
  const eq = readyOrder(go(32), both).equip;
  check('both ticked: Qwen 3.8 27B thinks deep, Gemma 4 26B does Office', eq['qwen3.8-27b']?.join() === 'deep' && eq['gemma4-26b']?.join() === 'office');
  const welcome = read('public/cellar.js');
  check('the Welcome has one Get Bob ready button and sends the slots to Bob', /data-getready>Get Bob ready \(about/.test(welcome) && /equip: order\.equip/.test(welcome) && !/data-getpack/.test(welcome));
}

// ---------- Set it up: what to get for one job ----------
{
  const list = { models: models(), engines: engines(), packs: catalog.packs };
  const v = planFor('video', { list, hw: { vramGB: 16, freeGB: 500 } });
  check('video on a 16 GB card: the program and the pack\'s video model', v.kind === 'download' && v.ids[0] === 'engine:sdcpp' && v.ids.includes('wan2.2-ti2v-5b') && v.equip['wan2.2-ti2v-5b'][0] === 'video', JSON.stringify(v.ids));
  const v8 = planFor('video', { list, hw: { vramGB: 8, freeGB: 500 } });
  check('video on an 8 GB card: the light version', v8.ids.includes('wan2.2-ti2v-5b-q4'));
  const p = planFor('pictures', { list, hw: { vramGB: 16, freeGB: 10 } });
  check('not enough disk is worked out before the card shows', p.short > 0);
  const e = planFor('edits', { list, hw: { vramGB: 16 } });
  check('picture edits pick an edit model', e.ids.includes('qwen-image-edit-2509'));
  const m = planFor('music', { list, hw: { vramGB: 16 } });
  check('music: the audio tools and the music models', m.ids.includes('engine:audio') && m.ids.includes(MUSIC_ID));
  const s = planFor('sfx', { list, hw: { vramGB: 16 } });
  check('sound effects: just the audio tools', s.ids.length === 1 && s.ids[0] === 'engine:audio');
  const already = planFor('video', { list: { ...list, models: models(['wan2.2-ti2v-5b']), engines: engines({ sdcpp: { installed: true } }) }, hw: { vramGB: 16 } });
  check('a model already here but not in its slot: one click, no download', already.kind === 'equip' && already.model.id === 'wan2.2-ti2v-5b' && !already.ids.length);
  const mac = planFor('hearing', { list: { ...list, engines: engines({ whispercpp: { available: false, note: 'There\'s no ready-made Mac download of whisper.cpp.' } }) }, hw: {} });
  check('nothing that runs here: said plainly, no card', mac.kind === 'none' && /Mac/.test(mac.why));
  check('every capability has words for Bob', Object.values(NEEDS).every((n) => n.say && n.what && (n.slot || n.engine))); // 1.5.95: a program (FFmpeg) has no slot
}

// ---------- Settings in the way ----------
{
  check('web search off: offered with its setting name and the privacy line', switchFor({}, 'web')?.name === 'Let Bob search the web' && switchFor({}, 'web').where === 'Settings, How Bob works' && /Only the search words and page addresses leave your replicant matrix \(your computer\)\./.test(switchFor({}, 'web').privacy) && switchFor({ webSearch: true }, 'web') === null);
  check('every Hand has its own short line for the card', Object.keys(HAND_CAN).length === 8 && Object.values(HAND_CAN).every((t) => /^[a-z]/.test(t) && !/\.$/.test(t)) && switchFor({ hands: {} }, 'hand:files').what === HAND_CAN.files);
  const h = switchFor({ hands: { enabled: false } }, 'hand:files');
  check('a Hand that is off: the card turns on Hands and that Hand', h && /Let Bob use Hands, Files/.test(h.name) && h.hands.enabled && h.hands.files.on && h.folders);
  check('a Hand stopped with the ✋ switch is never switched back on from a card', switchFor({ hands: { enabled: true, held: true, files: { on: true } } }, 'hand:files')?.held === true && applySwitch({ hands: { enabled: true, held: true, files: { on: true } } }, 'hand:files', { saveHands: () => { throw new Error('no'); } }) === null);
  let saved = null;
  applySwitch({ hands: {} }, 'hand:files', { saveHands: (x) => { saved = x; } });
  check('switching a Hand on goes through the brain like the Settings page', saved?.enabled === true && saved?.files?.on === true);
  check('every switch key is known', SWITCH_KEYS.includes('web') && SWITCH_KEYS.includes('hand:run'));
  const o = new SetupOffers();
  const id = o.add({ sw: 'web' });
  check('a card can be answered once', o.take(id)?.sw === 'web' && o.take(id) === null);
}

// ---------- Bob fills the slots himself ----------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ready-'));
  const cfg = { agentDir: tmp, dataDir: tmp, bobModelsDir: path.join(tmp, 'models'), settingsFile: path.join(tmp, 'settings.json') };
  const shop = new ModelShop(cfg, () => {});
  shop.planEquip({ 'z-image-turbo': ['image'], nope: ['image'], 'kokoro-v1': ['not-a-slot'] });
  const plan = shop.loadEquip();
  check('the slot plan is kept by Bob (a file, not the browser)', fs.existsSync(path.join(tmp, 'equip-plan.json')) && plan['z-image-turbo'][0] === 'image' && !plan.nope && !plan['kokoro-v1']);
  const filled = [];
  shop.equipHook = async (slot, value) => { filled.push([slot.id, value]); };
  shop.ollamaNames = async () => null;
  shop.roles = async () => ({ options: { images: [{ value: 'z-image-turbo' }] }, current: {} });
  shop.statusOf = async (e) => ({ state: e.id === 'z-image-turbo' ? 'installed' : 'missing' });
  await shop.applyEquip();
  check('a finished model goes in its slot by itself', filled.some(([s, v]) => s === 'image' && v === 'z-image-turbo'));
  check('...and comes off the plan', !shop.loadEquip()['z-image-turbo']);
  const src = read('src/models.js');
  check('slots are filled before "done" goes out (a waiting job starts then)', src.indexOf('await this.applyEquip()') < src.indexOf("pub.phase = 'done'; d.state = 'done'"));
}

// ---------- The chat's Set it up card ----------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-offer-'));
  const cfg = { agentDir: tmp, innDir: tmp, dataDir: tmp, settingsFile: path.join(tmp, 'settings.json'), userName: 'Sam', models: { bob: 'x' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', painter: { engine: 'sdcpp' } };
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  const got = [];
  brain.shop = { list: async () => ({ models: models(), engines: engines(), packs: catalog.packs }), hardware: async () => ({ vramGB: 16, freeGB: 500 }), planEquip: (e) => got.push(['equip', e]), applyEquip: async () => [], download: async (id, { queue }) => got.push(['download', [id, ...queue]]), describe: (id) => ({ name: id }), dl: [] };
  const evs = [];
  check('make_video stays in his tools when video isn\'t set up', !brain.offTools().has('make_video') && !brain.offTools().has('make_image'));
  const text = await brain.makeVideo({ prompt: 'a cat' }, { emit: (e) => evs.push(e), job: null });
  const card = evs.find((e) => e.type === 'offer-setup');
  check('asking for a clip with no video maker shows a Set it up card, not an error', card && card.kind === 'download' && card.need === 'video' && card.items.length >= 2, JSON.stringify(card));
  check('Bob is told to say it in one line, not as an error', /Set it up/.test(text) && /isn't an error/.test(text));
  brain.queue = [{ id: 'j1', text: 'make a clip of a cat', state: 'done' }];
  brain.saveQueue = () => {};
  brain.pump = () => {};
  const card2 = []; await brain.makeVideo({ prompt: 'a cat' }, { emit: (e) => card2.push(e), job: { id: 'j1' } });
  const r = await brain.answerSetup(card2[0].id, true);
  check('Set it up downloads the program and the model, and plans the slot', r.ok && r.done === 'download' && got.some(([k, v]) => k === 'download' && v.includes('engine:sdcpp') && v.includes('wan2.2-ti2v-5b')) && got.some(([k, v]) => k === 'equip' && v['wan2.2-ti2v-5b']));
  const j = brain.queue[0];
  check('the job waits for every download, then carries on by itself', j.state === 'waiting' && j.after.ids.length === 2 && /Do what they asked/.test(j.carryOn));
  brain.shop.dl = [{ id: 'engine:sdcpp', state: 'done' }, { id: 'wan2.2-ti2v-5b', state: 'downloading' }];
  check('...not while one is still downloading', brain.downloadReady(j) === false && j.state === 'waiting');
  brain.shop.dl[1].state = 'done';
  check('...and goes once all are in', brain.downloadReady(j) === true);
  check('Not now changes nothing', (await brain.answerSetup((await (async () => { const e = []; await brain.makeVideo({ prompt: 'x' }, { emit: (x) => e.push(x) }); return e[0].id; })()), false)).done === 'none');
  check('an old card says so', (await brain.answerSetup('nope', true)).ok === false);
  const web = [];
  const wt = await brain.offerSetup('web', { emit: (e) => web.push(e) });
  check('web search off: a Switch it on card', web[0]?.kind === 'switch' && web[0].name === 'Let Bob search the web' && /Only the search words/.test(web[0].privacy) && /Switch it on/.test(wt));
  await brain.answerSetup(web[0].id, true);
  check('...which switches only that setting on', cfg.webSearch === true);
  check('offer_setup is listed only while something is missing or off', brain.tools.offer_setup && typeof brain.offerNeeded() === 'boolean');
  check('a job from another Bob gets no card here', /Not here/.test(await brain.offerSetup('video', { emit: () => { throw new Error('no card'); }, job: { guest: { from: 'Laptop Bob' } } })));
  const app = read('public/app.js'), phone = read('android/app/src/main/assets/www/phone.js');
  check('the PC window shows the card', /case 'offer-setup'/.test(app) && /\/api\/setup\/answer/.test(app));
  check('the phone app shows the same card', /ev\.type === 'offer-setup'/.test(phone) && /\/api\/setup\/answer/.test(phone) && /Set it up \(about/.test(phone));
  check('the server answers the card from the phone too (the card id is the permission)', /p === '\/api\/setup\/answer'/.test(read('src/server.js')));
}

// ---------- Bob's own Python ----------
{
  check('pinned to the PSF-signed package with a checksum', /^https:\/\/api\.nuget\.org\//.test(OWN_PYTHON.url) && /^[0-9a-f]{64}$/.test(OWN_PYTHON.sha256));
  const audio = read('src/audio.js');
  check('setup gets his own Python instead of "install Python first"', /py = await getOwnPython\(cfg/.test(audio) && !/Install it from \$\{PYTHON_DOWNLOAD\} with the normal installer, then click Get again/.test(audio));
  check('no screen tells people to install Python by hand any more', !/python\.org/.test(read('public/cellar.js')));
  if (OS === 'win') {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-py-'));
    const bad = async () => ({ ok: true, url: OWN_PYTHON.url, body: (async function* () { yield Buffer.from('not python'); })() });
    let why = '';
    try { await getOwnPython({ agentDir: tmp }, { fetchImpl: bad }); } catch (e) { why = e.message; }
    check('a damaged Python download is refused', /checksum/.test(why) && !fs.existsSync(ownPythonExe({ agentDir: tmp })));
  } else {
    let args = null;
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-py-'));
    try { await getOwnPython({ agentDir: tmp }, { runImpl: async (exe, a, o) => { args = { a, o }; } }); } catch { /* no python made by the fake */ }
    check('Mac and Linux: uv gets Python 3.12 into Bob\'s folder', args?.a.join(' ') === `python install ${OWN_PYTHON.version}` && args.o.env.UV_PYTHON_INSTALL_DIR.startsWith(tmp));
  }
}

// ---------- 1.5.202: Brain Engine, not plain llama.cpp, where it has a build ----------
{
  const withBE = (be = {}) => [...engines(), { id: 'brainengine', name: 'Brain Engine', sizeGB: 0.7, installed: false, available: true, ...be }];
  const hw = { vramGB: 16, ramGB: 32, nvidia: true };
  const pack = packFor(catalog.packs, 16, false);
  const rows = readyList({ pack, models: models(), engines: withBE(), hw });
  const ids = rows.map((r) => r.id), picks = readyDefaults(rows);
  check('Get me ready offers Brain Engine and ticks it', ids.includes('engine:brainengine') && picks.has('engine:brainengine'));
  check('plain llama.cpp is not offered where Brain Engine has a build', !ids.includes('engine:llamacpp'), ids.join());
  check('whisper.cpp (ears) and the picture engine stay', picks.has('engine:whispercpp') && picks.has('engine:sdcpp'));
  check('the bundled llama.cpp is not swapped for an NVIDIA one either', !rows.some((r) => r.swap) && !readyOrder(rows, picks).ids.includes('engine:llamacpp'));
  const mac = readyList({ pack, models: models(), engines: withBE({ available: false }), hw: { vramGB: 16, ramGB: 32 } });
  check('no Brain Engine build (Mac, ARM): llama.cpp as before', mac.some((r) => r.id === 'engine:llamacpp') && !mac.some((r) => r.id === 'engine:brainengine'));
  check('core list', coreEngines(withBE()).join() === 'brainengine,sdcpp,whispercpp' && coreEngines(engines()).join() === 'llamacpp,sdcpp,whispercpp');
  check('the starter plan uses Brain Engine too', readyPlan(hw, models(), withBE({}).map((e) => (e.id === 'llamacpp' ? { ...e, installed: true, bundled: true } : e))).ids.every((id) => id !== 'engine:llamacpp'));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
