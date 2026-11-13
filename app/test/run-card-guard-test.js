// Nov 13: the busy card (src/card-guard.js). A test's llama-server held the card, a message loaded Bob's own brain on top
// of it, and the PC froze. Now he looks first, asks, waits, or answers on the brain already there (a test that can
// pause pauses after its step). Also: a message sent while the brain still loads keeps the load showing (cube, status
// line). Fakes only: no real card, no real engine, no real Agent folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { readCardUse } from '../src/card-busy.js';
import { guardLoad, heldByOthers, busyChoices, pickedKey, CHOICE, serverUrlFrom, busyShort, askPause, liftPause, pausedTest, pausableTest, HELD_MB, SPARE_MB } from '../src/card-guard.js';
import { cardPausePoint } from '../model-lab/common.mjs';
import { cubePulse, statusKeepsPhase, cubeState } from '../public/mind-cube.js';
import { moodOf } from '../public/status-line.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log('PASS', name); } else { fail++; console.log('FAIL', name, extra); } };
const read = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const none = async () => null;
const smi = (free, apps) => async (args) => (args[0].includes('memory.free') ? free : apps);

// ---- reading the card: a llama-server Bob didn't start is another program ----
const apps = '4100, C:\\lab\\llama-server.exe, 11000\n2222, C:\\Bob\\engines\\llama-server.exe, 1200\n';
const plain = await readCardUse(smi('2900, 16303\n', apps), none);
const mine = await readCardUse(smi('2900, 16303\n', apps), none, { ownPids: new Set([2222]) });
check('without Bob\'s own process ids, engine names count as his (as before)', plain.others.length === 0);
check('with them, a test\'s llama-server is named with its size, and Bob\'s own is still left out', mine.others.length === 1 && mine.others[0].name === 'llama-server' && mine.others[0].mb === 11000 && mine.others[0].engine === true && mine.others[0].pid === 4100);
check('the card\'s size comes back too', mine.totalMB === 16303 && mine.freeMB === 2900);

// ---- the rule ----
const busy = { freeMB: 2900, totalMB: 16303, others: [{ name: 'llama-server', mb: 11000, pid: 4100, engine: true }] };
const g = guardLoad({ card: busy, needMB: 22000, ownMB: 0 });
check('a 22 GB brain with a test holding 11 GB of a 16 GB card: not loaded, and the line says why in plain words', g && /^⚠ The graphics card is busy: llama-server holds about 10\.7 GB of it\. This brain needs about 21\.5 GB and only 2\.1 GB is left/.test(g.line) && /freeze this computer\. I haven't loaded it\./.test(g.line), g?.line);
check('a small brain that fits beside it loads as usual', guardLoad({ card: busy, needMB: 1500 }) === null);
check('Bob\'s own brains count as room (he lets them go first)', guardLoad({ card: busy, needMB: 6000, ownMB: 4500 }) === null && guardLoad({ card: busy, needMB: 6000, ownMB: 0 }) !== null);
check('room keeps a little spare for Windows', SPARE_MB > 0 && guardLoad({ card: busy, needMB: 2900 }) !== null);
check('a browser or overlay holding under 2 GB isn\'t "busy": the brain loads as usual (part on the processor if need be)', HELD_MB === 2048 && guardLoad({ card: { freeMB: 15000, totalMB: 16303, others: [{ name: 'msedge', mb: 700 }] }, needMB: 22000 }) === null);
check('nothing else on the card: no guard at all', guardLoad({ card: { freeMB: 15800, totalMB: 16303, others: [] }, needMB: 22000 }) === null);
check('no card reading (no NVIDIA card): no guard', guardLoad({ card: null, needMB: 22000 }) === null);
check('named programs with no sizes: what\'s used and isn\'t Bob\'s counts, less what the desktop usually holds', heldByOthers({ freeMB: 3000, totalMB: 16000, others: [{ name: 'x', mb: 0 }] }, 1000) === 12000 - 1536 && heldByOthers({ freeMB: 13000, totalMB: 16000, others: [{ name: 'discord', mb: 0 }] }) < 2048);
check('the short form for the status line', busyShort(busy.others) === 'Card busy: llama-server, 10.7 GB');

// ---- the choices ----
check('choices: wait first, the brain on the card only when there is one, another Bob only when set up, leave it last', busyChoices().join('|') === [CHOICE.wait, CHOICE.leave].join('|') && busyChoices({ brainOnCard: true, borrow: true }).join('|') === [CHOICE.wait, CHOICE.use, CHOICE.borrow, CHOICE.leave].join('|'));
check('no answer, or words of his own: wait (the safe one)', pickedKey('') === 'wait' && pickedKey('hmm') === 'wait' && pickedKey(CHOICE.use) === 'use' && pickedKey(CHOICE.leave) === 'leave');
check('a test\'s server address from its command line', serverUrlFrom('"C:\\lab\\llama-server.exe" -m riker.gguf --port 8091 --host 0.0.0.0') === 'http://127.0.0.1:8091' && serverUrlFrom('llama-server -m x.gguf') === 'http://127.0.0.1:8080' && serverUrlFrom('game.exe --port 9') === '');

// ---- the test pause, both sides ----
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-card-'));
let calls = [];
const free = await cardPausePoint({ url: 'http://127.0.0.1:8091', dir, log: () => {} });
check('a lab step with nothing asked carries straight on, and says it can pause', free === 0 && pausableTest(dir)?.url === 'http://127.0.0.1:8091' && !pausedTest(dir));
askPause(dir);
const paused = cardPausePoint({ url: 'http://127.0.0.1:8091', dir, log: () => {}, pollMs: 10, onPause: async () => calls.push('all experts on'), onResume: async () => calls.push('resume') });
await wait(40);
check('asked: the test pauses after its step, puts every expert back on, and tells Bob where its brain is', pausedTest(dir)?.url === 'http://127.0.0.1:8091' && calls.join() === 'all experts on');
liftPause(dir);
const took = await paused;
check('Bob done: it carries on, and the pause is cleaned up', took > 0 && calls.join() === 'all experts on,resume' && !fs.existsSync(path.join(dir, 'card-paused.json')) && !fs.existsSync(path.join(dir, 'card-pause.json')));
check('an old pause (Bob closed mid-answer) is ignored', (askPause(dir, { now: () => Date.now() - 31 * 60e3 }), await cardPausePoint({ url: 'u', dir, log: () => {} })) === 0);
liftPause(dir);
check('reap-calibrate pauses between lessons and between steps (all experts on while Bob answers)', /await cardPausePoint\(\{ url \}\);/.test(read('model-lab/reap-calibrate.mjs')) && /cardPausePoint\(\{ url, onPause: \(\) => post\('\/expert-mask', \{ keep: null \}/.test(read('model-lab/reap-calibrate.mjs')));

// ---- the brain, with a fake engine and a fake card ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-guard-'));
const inn = path.join(tmp, 'inn');
const cfg = {
  agentDir: tmp, innDir: inn, dataDir: path.join(inn, 'bob'), painterDir: path.join(inn, 'painter'), archiveDir: path.join(inn, 'archive'),
  logbook: path.join(inn, 'logbook.md'), memoryFile: path.join(inn, 'bob-memory.md'), noticeBoard: path.join(inn, 'notice-board.md'),
  ollamaUrl: 'http://127.0.0.1:1', quickOnCpu: false, engine: 'ollama', models: { bob: 'big:35b' }, userName: 'Sam', timeZone: 'America/Edmonton',
  readRoots: [inn], readOnlyRoots: [], recycleBin: false, housekeeping: { enabled: false }
};
for (const d of [cfg.dataDir, cfg.painterDir, cfg.archiveDir, path.join(inn, 'references')]) fs.mkdirSync(d, { recursive: true });
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
const loaded = new Map(); const preloads = [];
brain.engine = {
  isLoaded: async (m) => loaded.has(m), loaded: async () => [...loaded].map(([name, gb]) => ({ name, vram: gb * 2 ** 30 })),
  estimateLoad: async () => 6, preload: async (m) => { preloads.push(m); await wait(40); loaded.set(m, 20); return 0.04; },
  unload: async (m) => (loaded.delete(m) ? [m] : []), unloadAll: async () => { loaded.clear(); return []; }, touch: async () => {}, maxCtx: async () => null
};
brain.gate.brainBytes = () => 22000 * 2 ** 20;
let cardNow = busy;
brain.readCardUse = async () => cardNow;
brain.cardRecheckMs = 20;

check('typing doesn\'t warm a brain up on top of a busy card, and the window hears the card is busy', (await brain.wake('typing')) === false && preloads.length === 0 && events.some((e) => e.type === 'card-busy' && e.busy && e.short === 'Card busy: llama-server, 10.7 GB'));

const ask = async (pickWords, opts = {}) => {
  const out = [];
  const p = brain.cardGuard('big:35b', {}, (e) => { out.push(e); if (e.type === 'approval' && e.ask) setTimeout(() => brain.answerApproval(e.id, true, null, null, pickWords), 5); }, opts.signal || new AbortController().signal, { chat: true, ...opts });
  return { out, p };
};
{
  const { out, p } = await ask(CHOICE.leave);
  const e = await p.catch((x) => x);
  check('the ⚠ line comes at once, then a card with the choices', out[0]?.type === 'announce' && /graphics card is busy/.test(out[0].text) && out[1]?.type === 'approval' && out[1].ask.choices.includes(CHOICE.wait));
  check('"Leave it for now": nothing loads, and the job ends with a plain line', e?.code === 'card_busy' && /left my brain unloaded/.test(e.message) && preloads.length === 0);
}
{
  const { out, p } = await ask(CHOICE.wait);
  setTimeout(() => { cardNow = { freeMB: 15800, totalMB: 16303, others: [] }; }, 80);
  const r = await p;
  check('"Wait": he looks again until the card has room, then loads as usual', r.go === true && out.some((e) => /as soon as the card has room/.test(e.text || '')) && out.some((e) => /The card has room now/.test(e.text || '')));
  check('…and the window hears the card is free again', events.some((e) => e.type === 'card-busy' && !e.busy));
  cardNow = busy;
}
{
  const ac = new AbortController();
  const { p } = await ask(CHOICE.wait, { signal: ac.signal });
  setTimeout(() => ac.abort(), 60);
  const e = await p.catch((x) => x);
  check('Stop ends the wait', /Stopped/.test(e?.message || ''));
}
{
  await cardPausePoint({ url: 'http://127.0.0.1:8091', dir: tmp, log: () => {} }); // a test that can pause is running
  brain.pausePollMs = 5;
  const { out, p } = await ask(CHOICE.use);
  const testSide = (async () => { while (!fs.existsSync(path.join(tmp, 'card-pause.json'))) await wait(5); return cardPausePoint({ url: 'http://127.0.0.1:8091', dir: tmp, log: () => {}, pollMs: 5 }); })();
  const r = await p;
  check('"Use the brain already on the card": the test is asked to pause, and he answers on its brain once it has', r.use?.url === 'http://127.0.0.1:8091' && r.use.paused === true && out.some((e) => e.type === 'approval' && e.ask.choices.includes(CHOICE.use)) && out.some((e) => /pause after its current step/.test(e.text || '')));
  brain.liftCardPause();
  const pausedFor = await testSide;
  check('the turn over, the test carries on', pausedFor > 0 && !fs.existsSync(path.join(tmp, 'card-pause.json')));
}
{
  fs.rmSync(path.join(tmp, 'card-test.json'), { force: true });
  brain.commandLineOf = async () => '"C:\\lab\\llama-server.exe" -m riker.gguf --port 8091';
  const { p } = await ask(CHOICE.use);
  const r = await p;
  check('an older test that can\'t pause: its brain is used straight away (the choice says its timings will be off)', r.use?.url === 'http://127.0.0.1:8091' && r.use.paused === false && !fs.existsSync(path.join(tmp, 'card-pause.json')));
}
check('the choice says a test pauses, or that an older one\'s timings will be off', /A test that can pause stops after its current step/.test(read('src/card-guard.js')) && /its timings will be off/.test(read('src/card-guard.js')));
check('a chat turn asks before it loads; other loads ask too (wait or leave)', /const pick = await this\.cardGuard\(model,/.test(read('src/brain-run-on.js')) && /if \(!opts\.cpu && !cardChecked\) await this\.cardGuard\(/.test(read('src/brain-loading.js')));
check('a paused test is let go when the turn ends, whatever happened', /\.finally\(\(\) => \{\n\s+this\.liftCardPause\?\.\(\);/.test(read('src/brain-turns.js')));

// ---- a message sent while the brain still loads (the cube went empty) ----
{
  cardNow = { freeMB: 15800, totalMB: 16303, others: [] };
  loaded.clear(); events.length = 0;
  const w = brain.wake('typing');
  await wait(10);
  brain.turns.set('talk', {}); // Enter pressed: a turn starts while it loads
  check('the turn doesn\'t mark him thinking while the brain is still loading', /if \(!this\.waking\) this\.setState\('thinking', '', this\.state\.model\);/.test(read('src/brain-run-on.js')) && brain.state.state === 'waking');
  await w;
  check('once it\'s in, he goes from loading to thinking', brain.state.state === 'thinking' && events.filter((e) => e.type === 'status').map((e) => e.state).join() === 'waking,thinking');
  brain.turns.delete('talk');
}
check('the server tells the cube a brain is loading while the state is waking or loading', /\['waking', 'loading'\]\.includes\(ev\.state\)/.test(read('src/server.js')));
check('the status line says loading for both', moodOf({ state: 'waking' }) === 'waking' && moodOf({ state: 'loading' }) === 'loading');
check('the cube doesn\'t pulse while its brain fills, and pulses once it\'s in', !cubePulse({ phase: 'wait', loading: true }) && cubePulse({ phase: 'wait', loading: false }) && !cubePulse({ phase: 'idle' }));
check('a loading status keeps the cube waiting for his first word', statusKeepsPhase('waking') && statusKeepsPhase('loading') && !statusKeepsPhase('thinking'));
check('the cube says loading before thinking', cubeState({ shell: { label: 'Bob' }, loadingNow: 'Bob', phase: 'wait' }) === 'Bob\'s brain cube (Bob): loading.');

// ---- "i asked him to make me a song, i dont know if he is or not" ----
{
  const { createStatusLine, PLAIN, TITLE } = await import('../public/status-line.js');
  check('music and sounds say what they are, not "Painting"', moodOf({ state: 'painting', detail: 'Composing 40%' }) === 'composing' && moodOf({ state: 'painting', detail: 'Making a sound' }) === 'sound' && moodOf({ state: 'painting', detail: 'Workshop: x' }) === 'painting' && PLAIN.composing === 'Making a song...' && TITLE.composing === 'Making a song');
  const el = { textContent: '', dataset: {}, classList: { add() {}, remove() {} }, setAttribute() {} };
  const line = createStatusLine(el, { still: () => true, rnd: () => 0, setTimer: () => 0, clearTimer: () => {} });
  line.status({ state: 'painting', detail: 'Composing' });
  const first = el.textContent;
  line.status({ state: 'painting', detail: 'Composing 40%' });
  check('…with how far along on its own line once the workshop says', /^Making a song…/.test(first) && el.textContent === 'Making a song…\n40% done', JSON.stringify([first, el.textContent]));
  line.status({ state: 'painting', detail: 'Composing (setting up the music engine: Downloading torch (2.4GiB))' });
  check('a song whose engine is setting itself up says so, not a made-up percent', el.textContent === 'Making a song…\nSetting up the music engine', el.textContent);
  const { aceSetupLine } = await import('../src/audio.js');
  check('uv\'s own lines are what says it', aceSetupLine('Creating virtual environment at: .venv') === 'setting up the music engine' && aceSetupLine('Downloading torch (2.4GiB)') === 'setting up the music engine: Downloading torch (2.4GiB)' && aceSetupLine('INFO: Uvicorn running') === '');
  check('the music wait no longer counts time as progress', !/Math\.min\(95, Math\.round\(\(Date\.now\(\) - t0\) \/ 600\)\)/.test(read('src/audio.js')) && /Date\.now\(\) - t0 < ACE_SETUP_MS/.test(read('src/audio.js')));
  line.status({ state: 'idle' }); line.brains({ models: [], cardBusy: 'Card busy: llama-server, 10.7 GB' });
  check('resting while another program holds the card, the line says so', el.textContent === '⚠ Card busy:\nllama-server, 10.7 GB' && line.title() === 'Card busy', el.textContent);
  line.status({ state: 'thinking' });
  check('…and his working lines still show while he works', !/Card busy/.test(el.textContent));
  line.status({ state: 'idle' }); line.card('');
  check('…and it goes when the card is free', !/Card busy/.test(el.textContent));
}
check('the brain button says his brain is set aside for a job, not "working, 0 GB"', /st\.state === 'working' && !st\.models\.length\) \{ text = 'Brain: set aside for a job'/.test(read('public/brain-bar.js')) && /· ⚠ Card busy`/.test(read('public/brain-bar.js')));
check('the porthole dims while another program holds the card', /\.card-busy \.mind-cube\.porthole \.port \{ opacity: \.55;/.test(read('public/style.css')) && /classList\.toggle\('card-busy'/.test(read('public/app.js')));
check('a lend never lets go of the lender\'s own brain unless its switch says so', /if \(!lendFreesOwn\(this\.cfg\)\)/.test(read('src/share-card.js')) && /data-share-freesown/.test(read('public/share-brains.js')));
check('Help, an FAQ and the glossary say it in Bob\'s voice', /Wait for the card, then load my brain/.test(read('public/help-content.js')) && /<dt>Card busy<\/dt>/.test(read('public/help-content.js')) && /set\('Let a lend unload my brain', 'Off'/.test(read('public/help-content.js')));

for (const d of [dir, tmp]) fs.rmSync(d, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
