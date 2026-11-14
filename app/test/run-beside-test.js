// 1.5.51: a second brain beside big jobs. The engine's second llama-server (on the processor only), when a quick chat
// goes beside a long job, the opt-in reviewer beside the main brain, and the chat lines. Run: node test/run-beside-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LlamaCpp, besideThreads } from '../src/llamacpp.js';
import { Brain, talkerModel, sidePick, isTalker, TALKER_LINE, TALKER_CTX, talkerCtx, besideBigOk, mootBesideOk, besideLater, bigJob, loadLine, loadMode, BIG_AFTER_MS, SIDE_LANE } from '../src/brain.js';
import { Gate } from '../src/handoff.js';
import { mergeSettings } from '../src/config.js';
import { publicText } from './source-text.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const GB = 1024 ** 3;

// ---------- When a chat goes beside a big job ----------
const job = (id, state, extra = {}) => ({ id, text: `job ${id}`, state, at: Date.now(), sessionId: 's', kind: 'chat', ...extra });
const now = Date.now();
const fakeBrain = (over = {}) => ({
// Reply between steps (mid-job.js) is on by default and replaces the second brain beside text jobs; these checks are for it switched off.
  waitOver() {}, // 1.5.111: pump takes the ⏳ line away when a job starts
  cfg: { session: 'normal', engine: 'llamacpp', chatWhileBusy: true, answerMidJob: false, models: { small: 'small:4b', bob: 'big:26b' } },
  engine: { besideServer() {}, current: 'big:26b', currentCpu: false, resolve: () => ({ gguf: '/x' }) },
  gate: { brainBytes: () => 6 * GB },
  state: { state: 'thinking' },
  turns: new Map([['talk', {}]]),
  queue: [job('big', 'working', { effort: 'medium', startedAt: now })],
  ...over
});
const plenty = { freeMem: 16 * GB, now };
const hi = job('hi', 'waiting');
check('beside a Medium job on the card, a plain chat goes beside it', besideBigOk(fakeBrain(), hi, plenty) === true);
check('not with too little free RAM (needs the brain plus 2 GB)', besideBigOk(fakeBrain(), hi, { freeMem: 7 * GB, now }) === false);
check('switch off: never', besideBigOk(fakeBrain({ cfg: { ...fakeBrain().cfg, chatWhileBusy: false } }), hi, plenty) === false);
check('Gaming: never (the processor is the game\'s)', besideBigOk(fakeBrain({ cfg: { ...fakeBrain().cfg, session: 'light' } }), hi, plenty) === false);
check('Ollama: never (it has its own way of holding brains)', besideBigOk(fakeBrain({ cfg: { ...fakeBrain().cfg, engine: 'ollama' } }), hi, plenty) === false);
check('a message with a picture, or at Medium effort, still waits', besideBigOk(fakeBrain(), job('p', 'waiting', { refs: ['r'] }), plenty) === false && besideBigOk(fakeBrain(), job('m', 'waiting', { effort: 'medium' }), plenty) === false);
check('the main brain on the processor itself: waits (two would fight)', besideBigOk(fakeBrain({ engine: { besideServer() {}, current: 'big:26b', currentCpu: true } }), hi, plenty) === false);
check('the second server holds the reviewer: waits', besideBigOk(fakeBrain({ engine: { besideServer() {}, current: 'big:26b', beside: { current: 'review:27b' } } }), hi, plenty) === false);
check('a media step is left to part 1 (sideOk)', besideBigOk(fakeBrain({ state: { state: 'painting' } }), hi, plenty) === false);
check('one quick reply beside at a time', besideBigOk(fakeBrain({ turns: new Map([['talk', {}], [SIDE_LANE, {}]]) }), hi, plenty) === false);
const lowJob = () => fakeBrain({ queue: [job('low', 'working', { startedAt: now })] });
check('a short Low job: the chat waits (the card answers fast once it\'s done)', besideBigOk(lowJob(), hi, plenty) === false && bigJob(lowJob(), now) === false);
check(`a Low job that has run ${BIG_AFTER_MS / 1000} s counts as big`, besideBigOk(lowJob(), hi, { freeMem: 16 * GB, now: now + BIG_AFTER_MS }) === true);
check('the Coding session counts as big', besideBigOk(fakeBrain({ cfg: { ...fakeBrain().cfg, session: 'coding' }, queue: [job('c', 'working', { startedAt: now })] }), hi, plenty) === true);
{
  const b = lowJob(); b.queue.push(job('w', 'waiting')); b.pump = () => {};
  const due = besideLater(b, now);
  check('a chat behind a Low job gets one more look when the job turns 20 s', due === BIG_AFTER_MS && Boolean(b.bigTimer));
  clearTimeout(b.bigTimer);
}
{
  const started = [];
  const g = { ...fakeBrain(), saveQueue() {}, startTurn(s, t, r, j, lane) { started.push(`${j.id}@${lane}`); this.turns.set(lane, {}); } };
  g.queue.push(job('hi', 'waiting'), job('hi2', 'waiting'));
  const freemem = os.freemem; os.freemem = () => 16 * GB; process.env.BOB_FREE_MEM_GB = '16'; // the env value is how a Mac's reading is set
  try { Brain.prototype.pump.call(g); } finally { os.freemem = freemem; delete process.env.BOB_FREE_MEM_GB; }
  check('pump: the chat starts in the side lane, on the second server', started.join() === 'hi@side' && g.queue[1].side === true && g.queue[1].beside === true && g.queue[2].state === 'waiting', started.join());
}

// ---------- The reviewer beside the main brain (opt-in) ----------
const mootBrain = (over = {}) => fakeBrain({ cfg: { ...fakeBrain().cfg, mootBeside: true }, ...over });
check('moot beside: on, with room, the reviewer goes beside', mootBesideOk(mootBrain(), 'review:27b', 32768, plenty) === true);
check('moot beside: off to start with', mootBesideOk(fakeBrain(), 'review:27b', 32768, plenty) === false);
check('moot beside: no room, swap as usual', mootBesideOk(mootBrain(), 'review:27b', 32768, { freeMem: 4 * GB }) === false);
check('moot beside: the reviewer is the main brain already, nothing to add', mootBesideOk(mootBrain(), 'big:26b', 32768, plenty) === false);
check('moot beside: not while a quick reply uses the second server', mootBesideOk(mootBrain({ turns: new Map([['talk', {}], [SIDE_LANE, { beside: true }]]) }), 'review:27b', 32768, plenty) === false);
check('moot beside: never in Gaming', mootBesideOk(mootBrain({ cfg: { ...mootBrain().cfg, session: 'light' } }), 'review:27b', 32768, plenty) === false);
check('settings: mootBeside is only on when switched on', mergeSettings({}, { mootBeside: 'yes' }).mootBeside === false && mergeSettings({}, { mootBeside: true }).mootBeside === true);

// ---------- Chat lines ----------
const label = (m, who) => (who === 'reviewer' ? `Review brain (${m})` : m === 'small' ? `Quick brain (${m})` : `Brain (${m})`);
const plan = { drop: [], keep: ['big'], beside: true };
check('a beside plan is an add', loadMode(plan) === 'add');
const q = loadLine({ mode: 'add', who: 'bob', model: 'small', from: 'big', secs: 6, label, beside: true });
check('quick brain beside: says processor, and that the main brain keeps working', /^Adding the quick brain \(small\) on the processor, so my main brain \(big\) keeps working on the graphics card\. About 6 seconds/.test(q), q);
const r = loadLine({ mode: 'add', who: 'reviewer', model: 'rev', from: 'big', copy: 'Bobby', secs: 9, label, beside: true });
check('reviewer beside: a moot, on the processor, honest about speed', /^🛰 Moot: Bobby joins me to check the answer, on the review brain \(rev\)\. It loads beside mine, on the processor, about 9 seconds\. Reviews there are slower/.test(r), r);

const qc = loadLine({ mode: 'add', who: 'bob', model: 'small', from: 'big', secs: 3, label, beside: true, onCard: true });
check('quick brain beside on the card: says so', /^Adding the quick brain \(small\) beside my main brain \(big\) on the graphics card, which has room for both\. About 3 seconds\.$/.test(qc), qc);
check('reviewer beside on the card: the usual add line, no processor warning', !/processor/.test(loadLine({ mode: 'add', who: 'reviewer', model: 'rev', from: 'big', copy: 'B', secs: 9, label, beside: true, onCard: true })));

const off = loadLine({ mode: 'swap', who: 'reviewer', model: 'rev', from: 'big', copy: 'B', secs: 9, label, single: true });
const on = loadLine({ mode: 'swap', who: 'reviewer', model: 'rev', from: 'big', copy: 'B', secs: 9, label, single: true, besideOn: true });
check('moot swap, switch off: a plain swap line, no tip unless asked', /^🛰 Moot: B checks the answer\. My main brain \(big\) steps out and the review brain \(rev\) comes in, about 9 seconds\.$/.test(off), off);
const tipped = loadLine({ mode: 'swap', who: 'reviewer', model: 'rev', from: 'big', copy: 'B', secs: 9, label, single: true, tip: true });
check('moot swap, first time: the tip names the switch and its full path', /\(To keep both loaded, turn on "Reviewer beside main brain" in Settings, Brains\.\)$/.test(tipped), tipped);
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob tip '));
  const fake = { cfg: { dataDir: dir } };
  const first = Brain.prototype.besideTipOnce.call(fake), second = Brain.prototype.besideTipOnce.call(fake), afterRestart = Brain.prototype.besideTipOnce.call({ cfg: { dataDir: dir } });
  check('the tip shows once only, even after a restart', first === true && second === false && afterRestart === false);
  fs.rmSync(dir, { recursive: true, force: true });
}
check('moot swap, switch on but no room: says so', /There isn't room for both right now, so my main brain \(big\) steps out/.test(on), on);
{
  const seen = [];
  const b = { cfg: { session: 'normal' }, turns: new Map([['talk', {}], [SIDE_LANE, { beside: true, turnId: 't1', sessionId: 's1' }]]), broadcast: (e) => seen.push(e),
    engine: { beside: { currentCard: 'whole' }, unloadGpu: async () => ['big', 'small'] } };
  await Brain.prototype.clearGpu.call(b);
  check('a picture needs the card: the quick reply says its brain moves to the processor', seen.length === 1 && seen[0].turnId === 't1' && /^Moving my quick brain to the processor so the picture can use the graphics card/.test(seen[0].text));
  b.engine.beside.currentCard = 'none'; seen.length = 0;
  await Brain.prototype.clearGpu.call(b);
  check('already on the processor: no line', seen.length === 0);
}

// ---------- The gate: a second brain that won't start never falls back to the main brain ----------
{
  const brain = { cfg: { session: 'normal' }, turns: new Map(), fallbackBrain: () => ({ model: 'big:26b' }), log() {}, setState() {} };
  brain.engine = { isLoaded: async () => false, preload: async () => { throw new Error('out of memory'); }, unload: async () => [] };
  const gate = new Gate(brain, { delays: [] }); gate.label = (m) => m;
  let err = null;
  try { await gate.needBrain({ model: 'small:4b', opts: { cpu: true, beside: true } }, { emit() {} }); } catch (e) { err = e; }
  check('a second brain that won\'t start: error code "beside", no fallback swap', err?.code === 'beside', err?.message);
  // A quick reply on the second server doesn't hold up the main job's brain load.
  let waited = false;
  brain.turns = new Map([['side', { beside: true, controller: new AbortController() }]]);
  brain.sideIdle = async () => { waited = true; };
  brain.engine = { isLoaded: async () => true };
  gate.hold = async () => {};
  await gate.needBrain({ model: 'big:26b', opts: { cpu: true } }, { emit() {} });
  check('the main job doesn\'t wait for a quick reply that runs on the second server', waited === false);
}

// ---------- The engine: two llama-servers (fake ones) ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob beside-'));
const models = path.join(tmp, 'models');
const addModel = (name, tag, hex) => {
  const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', name);
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
  fs.writeFileSync(path.join(models, 'blobs', `sha256-${hex}`), 'GGUF');
  fs.writeFileSync(path.join(dir, tag), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: `sha256:${hex}` }] }));
};
addModel('big', '26b', 'aaa111');
addModel('small', '4b', 'bbb222');
const cfg = { dataDir: tmp, agentDir: tmp, engine: 'llamacpp', models: {}, llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18291, fit: false } };
const eng = new LlamaCpp(cfg);
// No real card reading in tests: a PC with nvidia-smi and a free card would otherwise put the second brain on it.
const NO_CARD = { card: async () => null };
eng.cardReaders = NO_CARD;
try {
  await eng.preload('big:26b', undefined, {});
  await eng.preload('small:4b', undefined, { beside: true, cpu: true });
  check('main and second server both answer', (await eng.isLoaded('big:26b')) && (await eng.isLoaded('small:4b', { beside: true })));
  check('the second server is on the next port', eng.beside.port === 18292);
  const list = await eng.loaded();
  check('loaded lists both, the second one marked beside', list.length === 2 && list[0].name === 'big:26b' && !list[0].beside && list[1].name === 'small:4b' && list[1].beside === true, JSON.stringify(list.map((m) => [m.name, m.beside])));
  const p = await eng.loadPlan('small:4b', { beside: true });
  check('a beside load plan keeps the main brain (add)', loadMode(p) === 'add' && p.keep.join() === 'big:26b' && p.beside === true, JSON.stringify(p));
  check('a normal load plan still swaps the main brain', loadMode(await eng.loadPlan('other:1b')) === 'swap');
  const env = await (await fetch(`http://127.0.0.1:${eng.beside.port}/test-env`)).json();
  check('the second server never sees the graphics card', env.cuda === '-1');
  const args = fs.readFileSync(path.join(tmp, 'llama-server-beside-args.txt'), 'utf8');
  check('the second server runs on the processor with half the cores', / -ngl 0 /.test(args) && args.includes(` -t ${besideThreads()} `) && besideThreads() >= 2, args);
  check('its own pid file, so a restart never kills the wrong one', fs.existsSync(path.join(tmp, 'llama-server-beside.pid')) && fs.existsSync(path.join(tmp, 'llama-server.pid')));
  const said = await eng.chat({ model: 'small:4b', messages: [{ role: 'user', content: 'hi' }], beside: true });
  check('a beside chat is answered by the second server', /Hello from sha256-bbb222/.test(said.content), said.content);
  const main = await eng.chat({ model: 'big:26b', messages: [{ role: 'user', content: 'hi' }] });
  check('a normal chat is still answered by the main brain', /Hello from sha256-aaa111/.test(main.content), main.content);
  await eng.unloadGpu();
  check('making room on the card stops only the main server', !(await eng.isLoaded('big:26b')) && (await eng.isLoaded('small:4b', { beside: true })));
  await eng.preload('big:26b', undefined, {});
  check('unload of a normal brain leaves the second server alone', (await eng.unload('small:4b')).length === 0 && (await eng.isLoaded('small:4b', { beside: true })));
  const dropped = await eng.dropBeside();
  check('dropBeside lets the second brain go, the main one stays', dropped.join() === 'small:4b' && !(await eng.isLoaded('small:4b', { beside: true })) && (await eng.isLoaded('big:26b')));
  // 1.5.51 (the owner): on the graphics card when it has room for both, otherwise the processor; never in Gaming.
  check('no card reading (no nvidia-smi): the processor', (await eng.besidePlace('small:4b')) === 'none');
  eng.cardReaders = { card: async () => ({ util: 95, freeMB: 12000 }) };
  check('a busy card: the processor', (await eng.besidePlace('small:4b')) === 'none');
  eng.cardReaders = { card: async () => ({ util: 10, freeMB: 3000 }) };
  check('not enough room on the card (brain + chat memory + 1.5 GB): the processor', (await eng.besidePlace('small:4b')) === 'none');
  eng.cardReaders = { card: async () => ({ util: 10, freeMB: 12000 }) };
  cfg.session = 'light';
  check('Gaming: never on the card', (await eng.besidePlace('small:4b')) === 'none');
  cfg.session = 'normal';
  // 1.5.133 (last night's crash): a 256K talker on an empty card looked like it fitted (chat memory capped at 128K in
  // the sum), then the job's brain loaded on top of it and llama-server fell over.
  const placeLog = []; eng.log = (k, t) => placeLog.push(t);
  check('a 256K chat memory is counted in full: 12 GB free is not enough', (await eng.besidePlace('small:4b', 262144)) === 'none');
  check('room kept for the main brain counts: 10 GB kept, 12 GB free: the processor', (await eng.besidePlace('small:4b', 32768, { reserveMB: 10240 })) === 'none');
  check('without the main brain coming: the card', (await eng.besidePlace('small:4b', 32768)) === 'whole');
  check('each pick is logged in one line: where, the chat memory, and the sums', placeLog.some((t) => /^second brain small:4b: on the processor, chat memory 262144 \(card free 12000 MB, needs \d+ MB\)/.test(t)) && placeLog.some((t) => /on the graphics card, chat memory 32768/.test(t)) && placeLog.some((t) => /incl\. 10240 MB kept for the main brain/.test(t)), placeLog.join(' | '));
  eng.beside.placed = { model: 'small:4b', place: 'whole', at: Date.now(), reserveMB: 0 };
  check('a recent pick made without room kept does not count for a load that asks to keep some', /reserveMB \|\| 0\) >= \(reserveMB \|\| 0\)/.test(fs.readFileSync(new URL('../src/llamacpp.js', import.meta.url), 'utf8')));
  eng.beside.placed = null;
  cfg.session = 'normal';
  // 1.5.133: place 'none' (the talker beside a job) means the processor even with a free card.
  await eng.preload('small:4b', undefined, { beside: true, place: 'none', ctx: 32768 });
  const envPl = await (await fetch(`http://127.0.0.1:${eng.beside.port}/test-env`)).json();
  const argsPl = fs.readFileSync(path.join(tmp, 'llama-server-beside-args.txt'), 'utf8');
  check('a talker kept beside a job stays on the processor, card free or not (no -ngl 999, card hidden)', / -ngl 0 /.test(argsPl) && !/ -ngl 999 /.test(argsPl) && envPl.cuda === '-1' && / -c 32768 /.test(argsPl), argsPl);
  await eng.dropBeside();
  const cp = await eng.loadPlan('small:4b', { beside: true });
  check('room on the card: the plan says so', cp.onCard === true && loadMode(cp) === 'add');
  await eng.preload('small:4b', undefined, { beside: true });
  const envCard = await (await fetch(`http://127.0.0.1:${eng.beside.port}/test-env`)).json();
  const argsCard = fs.readFileSync(path.join(tmp, 'llama-server-beside-args.txt'), 'utf8');
  check('on the card: all layers on the card, and the card is visible', / -ngl 999 /.test(argsCard) && envCard.cuda === null, argsCard);
  const lc = await eng.loaded();
  check('loaded marks it as on the card', lc.find((m) => m.beside)?.onCard === true);
  await eng.unloadGpu();
  check('making room on the card lets an on-card second brain go too', !(await eng.isLoaded('small:4b', { beside: true })));
  eng.cardReaders = NO_CARD;
  await eng.preload('big:26b', undefined, {});
  await eng.preload('small:4b', undefined, { beside: true });
  const all = await eng.unloadAll();
  check('unloadAll stops both', all.sort().join() === 'big:26b,small:4b' && (await eng.loaded()).length === 0, all.join());
} finally {
  await eng.unloadAll().catch(() => {});
  clearInterval(eng.idleTimer); if (eng.beside) clearInterval(eng.beside.idleTimer);
}

// ---------- 1.5.133: a load that falls over keeps llama-server's whole output in a file ----------
{
  const tmp2 = fs.mkdtempSync(path.join(os.tmpdir(), 'bob loadfail-'));
  const crash = path.join(tmp2, 'crash-server.js');
  fs.writeFileSync(crash, "console.error('ggml_cuda_init: found 1 device'); console.error('x'.repeat(6000)); console.error('CUDA error: out of memory'); process.exit(3);\n");
  const cfg2 = { ...cfg, dataDir: tmp2, llamacpp: { ...cfg.llamacpp, port: 18295, preArgs: [crash] } };
  const e2 = new LlamaCpp(cfg2);
  e2.cardReaders = NO_CARD;
  const logs2 = []; e2.log = (k, t) => logs2.push(t);
  let err = null;
  try { await e2.preload('big:26b', undefined, {}); } catch (e) { err = e; }
  const file = path.join(tmp2, 'llama-server-load-failed.txt');
  const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  check('the load fails with the short message as before', err && /stopped while loading big:26b \(code 3\)/.test(err.message), err?.message);
  check('the whole output is saved, start to end (more than the 4,000 characters the message keeps)', saved.includes('ggml_cuda_init: found 1 device') && saved.includes('CUDA error: out of memory') && saved.length > 6000, String(saved.length));
  check('and the log says where it went', logs2.some((t) => /big:26b: stopped while loading \(code 3\); full llama-server output saved to llama-server-load-failed\.txt/.test(t)), logs2.join(' | '));
  clearInterval(e2.idleTimer);
  fs.rmSync(tmp2, { recursive: true, force: true });
}

// ---------- 1.5.53: Instruct talks on the processor, E4B only on the card; a talker starts before a big brain ----------
{
  const files = { 'small:4b': '/f/e4b', 'qwen3-4b': '/f/instruct' };
  const mk = (over = {}) => ({
    cfg: { session: 'normal', engine: 'llamacpp', chatWhileBusy: true, answerMidJob: false, models: { small: 'small:4b', bob: 'big:26b' }, sessionBrains: { small: 'small:4b', gaming: 'qwen3-4b' } },
    engine: { besideServer() {}, resolve: (m) => (files[m] ? { gguf: files[m] } : (() => { throw new Error('no file'); })()), besidePlace: async () => 'none', besideLoaded: () => false, loaded: async () => [{ name: 'small:4b' }], preload: async (m, sig, o) => { mk.loads.push([m, o]); } },
    gate: { brainBytes: () => 5 * GB }, turns: new Map([['talk', {}]]), queue: [], log() {}, brainLabel: (m) => `Brain (${m === 'qwen3-4b' ? 'Qwen3 4B Instruct' : m})`,
    ...over
  });
  mk.loads = [];
  check('the talker on the processor is Instruct when it is downloaded', talkerModel(mk()) === 'qwen3-4b');
  check('without Instruct on the PC: no talker (E4B never runs on the processor)', !talkerModel(mk({ engine: { ...mk().engine, resolve: (m) => (m === 'small:4b' ? { gguf: 'x' } : (() => { throw new Error('none'); })()) } })));
  check('both count as talkers, a big brain doesn\'t', isTalker(mk(), 'qwen3-4b') && isTalker(mk(), 'small:4b') && !isTalker(mk(), 'big:26b'));
  const pc = await sidePick(mk(), { beside: true });
  check('a quick reply beside a job, card full: Instruct on the processor', pc.model === 'qwen3-4b' && pc.cpu && pc.beside, JSON.stringify(pc));
  const card = await sidePick(mk({ engine: { ...mk().engine, besidePlace: async () => 'whole' } }), { beside: true });
  check('room on the card: E4B goes there', card.model === 'small:4b' && card.beside, JSON.stringify(card));
  const held = await sidePick(mk({ engine: { ...mk().engine, beside: { current: 'qwen3-4b' }, besideLoaded: () => true, besidePlace: async () => 'whole' } }), { beside: true });
  check('a talker already beside answers, no new load', held.model === 'qwen3-4b');
  check('beside a picture (single server): Instruct on the processor, never E4B', (await sidePick(mk(), { side: true })).model === 'qwen3-4b');

  const emitted = [];
  const b = mk(); b.cfg = { ...b.cfg };
  const did = await Brain.prototype.keepTalker.call(b, 'big:26b', {}, (e) => emitted.push(e), { freeMem: 16 * GB });
  check('a big brain about to load: the talker starts first, beside, on the processor', did === true && mk.loads.length === 1 && mk.loads[0][0] === 'qwen3-4b' && mk.loads[0][1].beside === true && mk.loads[0][1].cpu === true, JSON.stringify(mk.loads));
  check('1.5.133: the talker always goes on the processor (place none), with at most 32K of chat memory', mk.loads[0][1].place === 'none' && mk.loads[0][1].ctx === TALKER_CTX, JSON.stringify(mk.loads[0][1]));
  { mk.loads = []; const big = mk(); big.cfg = { ...big.cfg, ctx: { normal: 262144 }, chatCtx: 262144, sessionCtx: { normal: 262144 } };
    const want = talkerCtx(big.cfg);
    await Brain.prototype.keepTalker.call(big, 'big:26b', {}, () => {}, { freeMem: 16 * GB });
    check('...even when the chat brain is set to 256K (the crash had the talker at 262144)', want <= TALKER_CTX && (!mk.loads.length || mk.loads[0][1].ctx <= TALKER_CTX), `${want} ${JSON.stringify(mk.loads)}`); }
  mk.loads = [];
  check('and the chat says so', emitted[0]?.text === TALKER_LINE('Qwen3 4B Instruct') && /^Keeping a small brain \(Qwen3 4B Instruct 2507\) on the processor, so we can keep talking/.test(emitted[0].text), emitted[0]?.text);
  mk.loads = [];
  const no = async (o, name, args = ['big:26b', {}]) => check(name, (await Brain.prototype.keepTalker.call(o, ...args, () => {}, { freeMem: 16 * GB })) === false && mk.loads.length === 0);
  await no(mk({ cfg: { ...mk().cfg, session: 'light' } }), 'never in Gaming');
  await no(mk({ cfg: { ...mk().cfg, chatWhileBusy: false } }), 'not with Keep chatting off');
  await no(mk(), 'not for a talker itself', ['qwen3-4b', {}]);
  await no(mk(), 'not for a brain on the processor', ['big:26b', { cpu: true }]);
  await no(mk({ engine: { ...mk().engine, besideLoaded: () => true } }), 'not when something is already beside');
  await no(mk({ engine: { ...mk().engine, loaded: async () => [{ name: 'big:26b' }] } }), 'not when the big brain is already loaded (nothing pushed out)');
  check('not with too little RAM', (await Brain.prototype.keepTalker.call(mk(), 'big:26b', {}, () => {}, { freeMem: 5 * GB })) === false);
  {
    const e = []; const sig = new AbortController().signal; const t = mk();
    await Brain.prototype.keepTalker.call(t, 'big:26b', {}, (x) => e.push(x), { freeMem: 16 * GB, signal: sig });
    await Brain.prototype.keepTalker.call(t, 'coder:30b', {}, (x) => e.push(x), { freeMem: 16 * GB, signal: sig });
    check('the talker line shows once per job, not on every brain swap in it', e.length === 1, String(e.length));
    mk.loads = [];
  }
  check('Gaming: never E4B, even with room on the card', (await sidePick(mk({ cfg: { ...mk().cfg, session: 'light' }, engine: { ...mk().engine, besidePlace: async () => 'whole' } }), { beside: true })).model === 'qwen3-4b');
  const fresh = fakeBrain({ engine: { besideServer() {}, current: 'big:26b', currentCpu: false, beside: { current: 'qwen3-4b' }, besideLoaded: () => true, resolve: () => ({ gguf: '/x' }) }, queue: [job('low', 'working', { startedAt: now })] });
  fresh.cfg.sessionBrains = { small: 'small:4b', gaming: 'qwen3-4b' };
  check('a talker waiting beside: a chat goes there at once, even behind a short job', besideBigOk(fresh, hi, { freeMem: 1 * GB, now }) === true);
}
{
  const seen = [];
  const e2 = new LlamaCpp({ ...cfg, llamacpp: { ...cfg.llamacpp, port: 18391 } });
  e2.cardReaders = NO_CARD;
  e2.onBeside = (ev) => seen.push(`${ev.action}:${ev.model}:${ev.where || ''}`);
  try {
    await e2.preload('small:4b', undefined, { beside: true });
    await e2.dropBeside();
    check('second-brain events: join (with where) when it starts, leave when it stops', seen.join() === 'join:small:4b:processor,leave:small:4b:', seen.join());
  } finally { await e2.unloadAll().catch(() => {}); clearInterval(e2.idleTimer); if (e2.beside) clearInterval(e2.beside.idleTimer); }
}

// ---------- Help and settings text ----------
const help = fs.readFileSync(path.join(here, '..', 'public', 'help-content.js'), 'utf8');
const cellar = publicText('cellar.js');
check('Settings has the reviewer-beside switch, off unless set', /sswitch\('mootBeside', settings\.mootBeside === true, 'Reviewer beside main brain'/.test(cellar));
check('Help explains it, and the long-job part of Keep chatting', /set\('Reviewer beside main brain', 'Off'/.test(help) && /Adding the quick brain \.\.\. on the processor/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
