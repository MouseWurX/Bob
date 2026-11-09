// 1.5.2: keep Bob light. "Free memory when Bob is idle" (on by default) vs off (small brain stays loaded),
// typing loads the small brain, big brains are freed right after their job, only Bob's own brains are touched,
// and the label's numbers. A fake engine for the brain logic; the fake Ollama and llama-server for the engines.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { Ollama } from '../src/ollama.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { startMockOllama } from './mock-ollama.js';
import { brainMode, holdsChatBrain, sameModel, isBobs, sleepAfterText } from '../src/brain-mode.js';
import { saveSettings } from '../src/config.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- the setting ----
check('default is "Free memory when Bob is idle" on', brainMode({}) === 'wake' && !holdsChatBrain({ models: { bob: 'a' } }));
check('off keeps the small brain', brainMode({ brainMode: 'always' }) === 'always' && holdsChatBrain({ brainMode: 'always', models: { bob: 'a' } }));
check('Advanced "Never" (an old -1 keep-alive) is the same as the switch off', brainMode({ ollamaKeepAlive: '-1' }) === 'always');
check('off does not hold a big brain: the Coding session still frees it', !holdsChatBrain({ brainMode: 'always', session: 'coding', models: { bob: 'a' } }) && holdsChatBrain({ brainMode: 'always', session: 'light', models: { bob: 'a' } }));
check('the label says the idle time in words', sleepAfterText({}) === '5 minutes' && sleepAfterText({ ollamaKeepAlive: '1h' }) === '1 hour' && sleepAfterText({ ollamaKeepAlive: '30m' }) === '30 minutes' && sleepAfterText({ ollamaKeepAlive: '-1' }) === null);
{
  const { msText, bigGraceMs, keepTime } = await import('../src/brain-mode.js');
  check('new times read naturally: 1 minute, 2½ minutes, 15 minutes', sleepAfterText({ ollamaKeepAlive: '1m' }) === '1 minute' && sleepAfterText({ ollamaKeepAlive: '150s' }) === '2½ minutes' && sleepAfterText({ ollamaKeepAlive: '15m' }) === '15 minutes' && msText(90000) === '1½ minutes');
  check('big brains go after 2 minutes, or sooner if the time is shorter', bigGraceMs({ ollamaKeepAlive: '1m' }) === 60000 && bigGraceMs({ ollamaKeepAlive: '30m' }) === 120000 && bigGraceMs({ brainMode: 'always' }) === 120000);
  check('an old Never ("-1") shows as switch off plus 5 minutes', keepTime({ ollamaKeepAlive: '-1' }) === '5m' && brainMode({ ollamaKeepAlive: '-1' }) === 'always' && keepTime({ ollamaKeepAlive: '150s' }) === '150s');
  const srv = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  check('picking a time never flips the chat-page switch', /ollamaKeepAlive: b\.ollamaKeepAlive, brainMode: brainMode\(cfg\)/.test(srv) && !/brainMode: 'wake' \}\);/.test(srv));
}
check('model names match with or without :latest', sameModel('gemma4', 'gemma4:latest') && !sameModel('gemma4:e4b', 'gemma4:26b'));
{
  const sc = { settingsFile: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bob-set-')), 'settings.json') };
  saveSettings(sc, { brainMode: 'always' }); const a = sc.brainMode;
  saveSettings(sc, { brainMode: 'junk' });
  check('settings: the switch is saved, and junk falls back to on', a === 'always' && sc.brainMode === 'wake' && JSON.parse(fs.readFileSync(sc.settingsFile, 'utf8')).brainMode === 'wake');
}

// ---- the brain, with a fake engine ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-light-'));
const inn = path.join(tmp, 'inn');
const cfg = {
  agentDir: tmp, innDir: inn, dataDir: path.join(inn, 'bob'), painterDir: path.join(inn, 'painter'), archiveDir: path.join(inn, 'archive'),
  logbook: path.join(inn, 'logbook.md'), memoryFile: path.join(inn, 'bob-memory.md'), noticeBoard: path.join(inn, 'notice-board.md'),
  ollamaUrl: 'http://127.0.0.1:1', quickOnCpu: false, engine: 'ollama', models: { bob: 'small:4b', tinker: 'coder:30b', reviewer: 'thinker:20b' }, userName: 'Sam', timeZone: 'America/Edmonton',
  readRoots: [inn], readOnlyRoots: [], recycleBin: false, housekeeping: { enabled: false }
};
for (const d of [cfg.dataDir, cfg.painterDir, cfg.archiveDir, path.join(inn, 'references')]) fs.mkdirSync(d, { recursive: true });
const events = [];
const real0 = new Brain(cfg, () => {}); // keeps its real engine, to check what the engine is told
const brain = new Brain(cfg, (ev) => events.push(ev));
const loaded = new Map();
const preloads = [];
brain.engine = {
  isLoaded: async (m) => loaded.has(m),
  loaded: async () => [...loaded].map(([name, gb]) => ({ name, size: gb * 1024 ** 3, vram: gb * 1024 ** 3 })),
  estimateLoad: async () => 6,
  preload: async (m) => { preloads.push(m); await wait(50); loaded.set(m, m === 'small:4b' ? 5.8 : 18); return 0.05; },
  unload: async (m) => (loaded.delete(m) ? [m] : []),
  unloadAll: async () => { const n = [...loaded.keys()]; loaded.clear(); return n; },
  touch: async () => {},
  maxCtx: async () => null
};

let s = await brain.brainStatus();
check('label: nothing loaded reads as memory freed', s.state === 'asleep' && s.gb === 0 && s.mode === 'wake' && s.wakeSeconds === 6);
const w = brain.wake('typing');
await wait(10);
check('typing loads the small brain; the label shows it loading', (await brain.brainStatus()).state === 'waking');
check('a second keystroke while loading does not load it twice', (await Promise.all([w, brain.wake('typing')]))[0] === true && preloads.length === 1);
s = await brain.brainStatus();
check('label: loaded, with its size', s.state === 'awake' && s.gb === 5.8 && s.models[0].chat === true);
check('typing when it is already loaded loads nothing', (await brain.wake('typing')) === false && preloads.length === 1);
brain.turns.set('talk', {});
check('never loads anything in the middle of a job', (loaded.clear(), (await brain.wake('typing')) === false) && preloads.length === 1);
brain.turns.delete('talk');

// a job used the coding brain: it goes right after; the small brain stays (its own idle timer frees it)
loaded.clear(); loaded.set('small:4b', 5.8); loaded.set('coder:30b', 18); loaded.set('someone-elses:7b', 4);
let gone = await brain.settle();
check('after a job, the big brain is freed right away', gone.includes('coder:30b') && !loaded.has('coder:30b'));
check('the small brain is left to its idle timer', loaded.has('small:4b'));
check('another app\'s model in Ollama (Open WebUI) is never touched or counted', loaded.has('someone-elses:7b') && !(await brain.brainStatus()).models.some((m) => m.name === 'someone-elses:7b'));
loaded.delete('someone-elses:7b');
brain.queue.push({ id: 'x', state: 'waiting' });
loaded.set('coder:30b', 18);
check('a waiting job keeps its brain (nothing freed between jobs)', (await brain.settle()).length === 0 && loaded.has('coder:30b'));
brain.queue.pop();

// switch off: the small brain stays and comes back after a big brain pushed it out
cfg.brainMode = 'always';
loaded.clear(); loaded.set('thinker:20b', 13);
preloads.length = 0;
gone = await brain.settle();
check('off: after a big job, the big brain goes and the small brain is loaded again', gone.includes('thinker:20b') && loaded.has('small:4b') && preloads.join() === 'small:4b');
check('off: the engines are told to hold the small brain (and only it)', real0.engine.holdModel() === 'small:4b' && real0.engine.keepFor('small:4b') === -1 && real0.engine.keepFor('coder:30b') === undefined);
check('label says off', (await brain.brainStatus()).mode === 'always' && (await brain.brainStatus()).holds === true);

// Coding: the chat brain is big; off doesn't hold it, a 2-minute grace does
cfg.session = 'coding'; cfg.sessionBrains = { coding: 'thinker:20b' };
loaded.clear(); loaded.set('thinker:20b', 13);
preloads.length = 0;
await brain.settle();
check('Coding: its big brain is kept for a follow-up (2-minute grace), not reloaded as the small one', loaded.has('thinker:20b') && preloads.length === 0 && brain.graceTimer);
check('label: Coding says it is a big-brain session', (await brain.brainStatus()).bigSession === true && (await brain.brainStatus()).holds === false);
clearTimeout(brain.graceTimer);
delete cfg.session; delete cfg.sessionBrains; cfg.brainMode = 'wake';

// ---- Ollama: keep_alive per model, freeing one model ----
const { server, calls } = await startMockOllama(18190);
const o = new Ollama({ ...cfg, ollamaUrl: 'http://127.0.0.1:18190', dataDir: cfg.dataDir });
const real = new Brain({ ...cfg, ollamaUrl: 'http://127.0.0.1:18190' }, () => {});
o.keepFor = real.engine.keepFor;
check('Ollama, switch on: the small brain gets the idle time (5 minutes)', o.keepAlive('small:4b') === '5m');
real.cfg.brainMode = 'always';
check('Ollama, switch off: the small brain is held (-1); big brains still get the idle time', o.keepAlive('small:4b') === -1 && o.keepAlive('coder:30b') === '5m');
await o.preload('small:4b');
check('Ollama: the load asks to hold it', calls.some((c) => c.path === '/api/generate' && c.body.model === 'small:4b' && c.body.keep_alive === -1));
check('Ollama: freeing one model frees just that one', (await o.unload('small:4b')).join() === 'small:4b' && (await o.loaded()).length === 0);
server.close();

// ---- llama.cpp: off holds the brain through the idle check ----
const models = path.join(tmp, 'models');
const dir = path.join(models, 'manifests', 'registry.ollama.ai', 'library', 'small');
fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(models, 'blobs'), { recursive: true });
fs.writeFileSync(path.join(models, 'blobs', 'sha256-bbb'), 'GGUF-1234');
fs.writeFileSync(path.join(dir, '4b'), JSON.stringify({ layers: [{ mediaType: 'application/vnd.ollama.image.model', digest: 'sha256:bbb' }] }));
const lc = new LlamaCpp({ agentDir: tmp, dataDir: cfg.dataDir, ollamaKeepAlive: '5m', llamacpp: { exe: process.execPath, preArgs: [path.join(here, 'mock-llama-server.js')], ollamaModelsDir: models, port: 18094, args: [] } });
let t = 1e6; lc.now = () => t;
await lc.preload('small:4b');
lc.holdModel = () => 'small:4b';
t += 3600_000;
check('llama.cpp, switch off: an hour quiet and the small brain is still loaded', !(await lc.idleTick()) && Boolean(lc.child));
lc.holdModel = () => null;
t += 5 * 60_000 + 1;
check('llama.cpp, switch on: freed after 5 minutes quiet', await lc.idleTick() && !lc.child);
await lc.preload('small:4b');
const l = await lc.loaded();
check('llama.cpp: the label gets a size even when nvidia-smi gives none (file size)', l[0].size === 9);
check('llama.cpp: freeing one model', (await lc.unload('other')).length === 0 && (await lc.unload('small:4b')).join() === 'small:4b' && !lc.child);
check('the chat page label only counts Bob\'s brains', isBobs(cfg, 'coder:30b') && !isBobs(cfg, 'someone-elses:7b'));
clearInterval(lc.idleTimer);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
