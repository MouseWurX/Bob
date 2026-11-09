// "Make another picture?": after a picture, 10 seconds to answer in the chat box.
// Yes keeps the picture engine loaded (a fresh grace, then it goes); No or no answer lets it go and the quick brain
// comes back. While it's asked or held, the after-job reload doesn't load the brain over the picture engine.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-more-'));
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir: tmp, innDir: path.join(tmp, 'inn'), dataDir, painterDir: path.join(tmp, 'inn', 'painter'), settingsFile: path.join(dataDir, 'settings.json'), logbook: path.join(dataDir, 'logbook.md'),
  readRoots: [], readOnlyRoots: [], models: { bob: 'quick:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const events = [];
const brain = new Brain(cfg, (e) => events.push(e));
clearInterval(brain.reminderTimer);
brain.fitCtx = async () => 8192;
const order = [];
let loaded = null;
brain.engine = { isLoaded: async (m) => loaded === m, preload: async (m) => { order.push(`load:${m}`); loaded = m; return 1; }, loaded: async () => [], estimateLoad: async () => 5, unloadAll: async () => [], unload: async () => [] };
let alive = true, idleArmed = 0;
brain.painter = { alive: () => alive, armIdle: () => { idleArmed++; }, graceMs: () => 60, yieldFor: async () => [], unload: async (why) => { order.push(`painter-off:${why}`); alive = false; return ['painter']; } };

// No answer in time
const MORE = 10;
let id = brain.offerMore('s1', 'image');
const offer = events.find((e) => e.type === 'more-pictures');
check('after a picture the chat box is asked "make another?" for 10 seconds', id && offer?.id === id && offer.seconds === MORE && offer.sessionId === 's1');
await brain.settle();
check('...and while it asks, the after-job reload doesn\'t load the brain over the picture engine', !order.some((x) => x.startsWith('load')), order.join());
check('an old or unknown card is ignored', brain.answerMore('nope', true) === false && brain.answerMore('', true) === false);
brain.answerMore(id, false, 'no answer'); await tick(10);
check('no answer: the prompt goes away, the picture engine lets go, then the quick brain comes back', events.some((e) => e.type === 'more-pictures-done' && e.id === id && e.more === false) && order.join() === 'painter-off:done making pictures,load:quick:latest', order.join());

// No
order.length = 0; loaded = null; alive = true;
id = brain.offerMore('s1');
brain.answerMore(id, false); await tick(10);
check('No: the same, straight away', order.join() === 'painter-off:done making pictures,load:quick:latest', order.join());

// Yes
order.length = 0; loaded = null; alive = true; idleArmed = 0;
id = brain.offerMore('s1');
check('Yes is taken once', brain.answerMore(id, true) === true && brain.answerMore(id, true) === false);
check('Yes: the picture engine stays loaded, with a fresh grace', alive && idleArmed === 1 && !order.length);
await brain.settle();
check('...and the after-job reload still leaves the card to it', !order.some((x) => x.startsWith('load')), order.join());
await tick(120);
check('...until the grace is over: then it lets go and the quick brain comes back', order.join() === 'painter-off:done making pictures,load:quick:latest', order.join());

// A new message while it asks
order.length = 0; loaded = null; alive = true; events.length = 0;
id = brain.offerMore('s1');
const j = brain.enqueue('s1', 'now a cat'); brain.cancelJob(j.jobId);
check('a new message clears the prompt and lets the job load what it needs (nothing unloaded behind its back)', !brain.morePictures && events.some((e) => e.type === 'more-pictures-done') && !order.some((x) => x.startsWith('painter-off')), order.join());
alive = false;
check('nothing is asked when the picture engine isn\'t kept loaded (the one-shot painter)', brain.offerMore('s1') === null);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
