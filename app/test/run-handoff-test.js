// 1.5.12 handoffs: the card lease, the gate (held until ready, retry, fallback), the ledger, and the turn checks
// that stop a picture request (make or show) from disappearing. Fake engines only; nothing is loaded for real.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { CardLease, Gate, Ledger, safeToResume, interruptedNote, withRetry } from '../src/handoff.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

// ---------- Card lease ----------
{
  const L = new CardLease(), a = {}, b = {}, c = {};
  await L.acquire(a, 'the painter');
  await L.acquire(a, 'the main brain'); // same owner: no queue
  const order = [];
  let waitedFor = '';
  const pb = L.acquire(b, 'b', { onWait: (who) => { waitedFor = who; } }).then(() => order.push('b'));
  const ctl = new AbortController();
  const pc = L.acquire(c, 'c', { signal: ctl.signal }).then(() => order.push('c'), () => order.push('c stopped'));
  await tick();
  check('a second job waits for the card instead of taking it', L.holder === a && L.waiting === 2 && order.length === 0);
  check('...and is told who has it', waitedFor === 'the main brain', waitedFor);
  ctl.abort(); await tick();
  check('a stopped job leaves the line', order.includes('c stopped') && L.waiting === 1);
  L.release(a); await pb; await tick();
  check('the card goes to the next one in line', L.holder === b && order[order.length - 1] === 'b');
  L.release(b);
  check('...and is free after the last one', L.holder === null);
}

// ---------- Fake engine for the gate ----------
function fakeEngine(script = {}) {
  const e = { loadedNow: null, loads: [], unloads: 0, flaky: { ...script.flaky }, broken: new Set(script.broken || []), noRetry: new Set(script.noRetry || []) };
  e.isLoaded = async (m) => e.loadedNow === m;
  e.preload = async (m) => {
    e.loads.push(m);
    if (e.noRetry.has(m)) throw new Error(`I can't find the model files for ${m}.`);
    if (e.broken.has(m)) throw new Error(`llama-server stopped while loading ${m} (code 1).`);
    if (e.flaky[m] > 0) { e.flaky[m]--; return 1; } // "loaded" but isn't answering
    e.loadedNow = m; return 1;
  };
  e.unload = async (m) => { e.unloads++; if (e.loadedNow === m) e.loadedNow = null; return [m]; };
  e.unloadAll = async () => { const was = e.loadedNow; e.loadedNow = null; return was ? [was] : []; };
  e.loaded = async () => (e.loadedNow ? [{ name: e.loadedNow, vram: 1 }] : []);
  e.estimateLoad = async () => 5;
  return e;
}
function fakeBrain(engine, extra = {}) {
  const b = { engine, logs: [], state: { model: null }, setState() {}, log: (k, t) => b.logs.push(`${k}: ${t}`), fallbackBrain: () => ({ model: 'main', cpu: false }), clearGpu: () => engine.unloadAll(), ...extra };
  return b;
}

// ---------- Gate: ready, retry, fallback ----------
{
  const eng = fakeEngine({ flaky: { big: 1 } });
  const br = fakeBrain(eng);
  const gate = new Gate(br, { delays: [1, 1], freeWaitMs: 50 });
  const sig = new AbortController().signal;
  const ledger = new Ledger({});
  gate.track(sig, ledger);
  const used = await gate.need({ id: 'brain', model: 'big', opts: {} }, { signal: sig, who: 'tinker' });
  check('a brain that "loaded" but doesn\'t answer is loaded again until it really is ready', used === 'big' && eng.loads.length === 2 && eng.loadedNow === 'big', eng.loads.join());
  check('...and the ledger shows the failed load and the retry', ledger.steps.some((s) => s.kind === 'load' && s.state === 'failed') && ledger.steps.some((s) => s.kind === 'retry'));
  check('already-ready brains aren\'t loaded again', (await gate.need({ id: 'brain', model: 'big', opts: {} }, { signal: sig })) === 'big' && eng.loads.length === 2);
  gate.done(sig);
}
{
  const eng = fakeEngine({ broken: ['big'] });
  const br = fakeBrain(eng);
  const gate = new Gate(br, { delays: [1, 1] });
  const events = [];
  const sig = new AbortController().signal;
  const used = await gate.need({ id: 'brain', model: 'big', opts: {} }, { signal: sig, emit: (e) => events.push(e), who: 'tinker' });
  check('a brain that won\'t load is tried three times', eng.loads.filter((m) => m === 'big').length === 3, eng.loads.join());
  check('...then the main brain takes the job', used === 'main' && eng.loadedNow === 'main');
  check('...and the user is told, not left hanging', events.some((e) => e.type === 'announce' && /wouldn't load/.test(e.text) && /main brain/.test(e.text)));
  gate.done(sig);
}
{
  const eng = fakeEngine({ noRetry: ['gone'] });
  const gate = new Gate(fakeBrain(eng), { delays: [1, 1] });
  const sig = new AbortController().signal;
  await gate.need({ id: 'brain', model: 'gone', opts: {} }, { signal: sig });
  check('missing model files aren\'t retried (straight to the fallback)', eng.loads.filter((m) => m === 'gone').length === 1);
  gate.done(sig);
}
{
  const eng = fakeEngine({ broken: ['main'] });
  const gate = new Gate(fakeBrain(eng), { delays: [1, 1] });
  let err = null;
  try { await gate.need({ id: 'brain', model: 'main', opts: {} }, { signal: new AbortController().signal }); } catch (e) { err = e; }
  check('the main brain failing is a real error (after its retries)', err && /stopped while loading main/.test(err.message) && eng.loads.length === 3);
}

// 1.5.133: a second brain on the card is let go before the job's brain is tried again (last night's crash loop)
{
  const eng = fakeEngine({ broken: ['big'] });
  const dropped = [];
  eng.beside = { currentCard: 'whole', current: 'qwen3-4b' };
  eng.besideLoaded = () => Boolean(eng.beside.current);
  eng.dropBeside = async () => { dropped.push(eng.beside.current); eng.beside.current = null; return dropped; };
  const br = fakeBrain(eng);
  const gate = new Gate(br, { delays: [1, 1] });
  const sig = new AbortController().signal;
  await gate.need({ id: 'brain', model: 'big', opts: {} }, { signal: sig, who: 'tinker' });
  check('1.5.133: the second brain on the card goes before the retry, once, and it is logged', dropped.join() === 'qwen3-4b' && br.logs.some((l) => /letting the second brain \(qwen3-4b\) off the card before trying big again/.test(l)), br.logs.join(' | '));
  gate.done(sig);
  const eng2 = fakeEngine({ broken: ['big'] });
  let drops = 0;
  eng2.beside = { currentCard: 'none', current: 'qwen3-4b' }; eng2.besideLoaded = () => true; eng2.dropBeside = async () => { drops++; return []; };
  const g2 = new Gate(fakeBrain(eng2), { delays: [1, 1] });
  const s2 = new AbortController().signal;
  await g2.need({ id: 'brain', model: 'big', opts: {} }, { signal: s2 });
  check('...but a second brain on the processor stays (it takes nothing from the card)', drops === 0);
  g2.done(s2);
}

// ---------- Gate: painter and two jobs at once ----------
{
  const eng = fakeEngine();
  eng.loadedNow = 'main';
  const painter = { calls: [], status: () => ({ state: 'off' }), ensureReady: async (k) => { painter.calls.push(`ready:${k}`); }, yieldFor: async (m) => { painter.calls.push(`yield:${m}`); } };
  const br = fakeBrain(eng, { painter });
  const gate = new Gate(br, { delays: [1, 1], freeWaitMs: 100 });
  const t1 = new AbortController().signal, t2 = new AbortController().signal;
  const gone = await gate.need({ id: 'painter', kind: 'image' }, { signal: t1 });
  check('the painter gets the card only after the brain is gone', gone.join() === 'main' && eng.loadedNow === null && painter.calls.includes('ready:image'));
  check('the status flags say the picture engine has the card', gate.flags().card === 'the picture engine', JSON.stringify(gate.flags()));
  let second = false;
  const p2 = gate.need({ id: 'brain', model: 'main', opts: {} }, { signal: t2 }).then(() => { second = true; });
  await tick(20);
  check('another job\'s brain waits while the painter works (it isn\'t loaded over it)', !second && eng.loadedNow === null && gate.flags().waiting === 1);
  // The painting job swaps back to its own brain without waiting behind itself.
  await gate.need({ id: 'brain', model: 'main', opts: {} }, { signal: t1 });
  check('the painting job gets its brain back straight away', eng.loadedNow === 'main' && painter.calls.includes('yield:main'));
  gate.done(t1); await p2;
  check('when the first job ends, the waiting one runs', second);
  gate.done(t2);
  const painter2 = { status: () => ({ state: 'off' }), ensureReady: async () => { const e = new Error('no server'); e.code = 'painter_load_failed'; throw e; } };
  const g2 = new Gate(fakeBrain(fakeEngine(), { painter: painter2 }), { freeWaitMs: 10 });
  let ok = true; try { await g2.need({ id: 'painter', kind: 'image' }, { signal: new AbortController().signal }); } catch { ok = false; }
  check('a picture engine that won\'t start doesn\'t stop the picture (the one-shot painter still runs)', ok);
  const stopped = { status: () => ({ state: 'off' }), ensureReady: async () => { const e = new Error('Stopped.'); e.code = 'stopped'; throw e; } };
  const g3 = new Gate(fakeBrain(fakeEngine(), { painter: stopped }), { freeWaitMs: 10 });
  ok = false; try { await g3.need({ id: 'painter', kind: 'image' }, { signal: new AbortController().signal }); } catch { ok = true; }
  check('...but Stop still stops it', ok);
}

// ---------- withRetry, resume ----------
{
  let n = 0;
  const r = await withRetry(async () => { if (n++ === 0) throw new Error('out of memory'); return 'ok'; }, { wait: 1 });
  check('a failed step is tried once more', r === 'ok' && n === 2);
  n = 0; let err;
  try { await withRetry(async () => { n++; const e = new Error('Stopped.'); throw e; }, { wait: 1 }); } catch (e) { err = e; }
  check('...but never after a Stop', err && n === 1);
  check('a job that only chatted is safe to pick up again', safeToResume({ handoff: { actions: [{ name: 'web_search', ok: true }] } }));
  check('a job that typed into an app is not', !safeToResume({ handoff: { actions: [{ name: 'app_act', ok: true }] } }));
  check('...and its note says what it already did', /it had started typing/i.test(interruptedNote({ handoff: { actions: [{ name: 'app_act', ok: true, args: '{"window":"Notepad","action":"type"}' }], outputs: [] } })), interruptedNote({ handoff: { actions: [{ name: 'app_act', ok: true, args: '{"window":"Notepad","action":"type"}' }], outputs: [] } }));
}

// ---------- The whole turn, with a fake engine ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-handoff-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), painterDir = path.join(innDir, 'painter');
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(painterDir, { recursive: true });
const fakeFile = (n) => { const f = path.join(tmp, n); fs.writeFileSync(f, 'x'); return f; };
const cfg = { agentDir, innDir, dataDir, painterDir, settingsFile: path.join(dataDir, 'settings.json'), logbook: path.join(dataDir, 'logbook.md'), memoryFile: path.join(dataDir, 'memory.md'),
  readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', allTools: true,
  models: { bob: 'main:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1',
  painter: { engine: 'sdcpp', sdcpp: { exe: fakeFile('sd-cli.exe'), image: { diffusionModel: fakeFile('z.gguf') } } } };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.gate.delays = [1, 1]; brain.gate.freeWaitMs = 20;
brain.fitCtx = async () => 8192; brain.recall = async () => '';
const eng = fakeEngine();
let replies = [];
let chats = 0;
eng.chat = async ({ model, messages }) => { chats++; const r = replies.shift(); if (r instanceof Error) { eng.loadedNow = null; throw r; } return r || { role: 'assistant', content: 'ok' }; };
brain.engine = eng;
let paints = [];
brain.painter = { status: () => ({ state: 'ready' }), ensureReady: async () => {}, yieldFor: async () => {},
  paint: async (kind, args) => {
    const name = `p${paints.length}.png`, file = path.join(painterDir, name);
    fs.writeFileSync(file, paints.length === 0 && brain.badFirst ? Buffer.alloc(0) : PNG);
    paints.push(args.prompt);
    return { file, name, via: 'server' };
  } };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const say = (content) => ({ role: 'assistant', content });
let n = 0;
async function turn(text, script) {
  replies = [...script]; paints = []; chats = 0;
  const events = [];
  const job = { id: `j${++n}`, sessionId: `s${n}`, text, kind: 'picture', state: 'working' };
  brain.queue.push(job);
  const sig = new AbortController().signal;
  try { await brain.run(`s${n}`, text, (ev) => events.push(ev), sig, [], job); } finally { brain.gate.done(sig); }
  return { events, job, hist: brain.session(`s${n}`) };
}

{
  const r = await turn('make me a picture of a fox', [say('Sure! Here is a lovely fox for you.'), call('make_image', { prompt: 'a fox' }), say('Here it is.')]);
  check('"make me a picture" answered with only words gets one more go, and the picture is made', paints.length === 1 && r.events.filter((e) => e.type === 'image').length === 1, `${paints.length} ${r.events.map((e) => e.type).join()}`);
  check('...the picture is kept with Bob\'s reply (still there after a reload)', r.hist.some((m) => m.media?.some((x) => x.type === 'image')));
  check('...and the job\'s ledger (saved in the queue) lists the output and the action', r.job.handoff?.outputs?.length === 1 && r.job.handoff.outputs[0].tool === 'make_image' && r.job.handoff.actions.some((a) => a.name === 'make_image' && a.ok), JSON.stringify(r.job.handoff?.outputs));
  // 1.5.20 quick hand-back: the picture was all that was asked, so the brain isn't loaded back just to say so.
  const loadsAfter = (job) => { const st = job.handoff.steps; const i = st.findIndex((s) => /painter/.test(s.what || '')); return st.slice(i + 1).filter((s) => s.kind === 'load').length; };
  check('...the picture goes through the gate, and the brain is NOT loaded back after it (quick hand-back)', r.job.handoff.steps.some((s) => /painter/.test(s.what || '') && s.state === 'done') && loadsAfter(r.job) === 0 && replies.length === 1, JSON.stringify(r.job.handoff.steps.map((s) => `${s.kind}:${s.what}:${s.state}`)));
  await tick(5); eng.loadedNow = null; eng.loads = [];
  await brain.settle();
  check('...and right after, the quick brain loads again in the background for a fast follow-up', eng.loads.includes('main:latest'), JSON.stringify(eng.loads));
  check('...Bob\'s reply is the short hand-back line, kept with the picture', r.hist.some((m) => m.role === 'assistant' && /^Here's the picture\. Tell me what to change/.test(m.content) && m.media?.some((x) => x.type === 'image')), JSON.stringify(r.hist.map((m) => [m.role, m.content])));
}
{
  cfg.pictureNoWait = false;
  const r = await turn('make me a picture of an owl', [call('make_image', { prompt: 'an owl' }), say('Here is your owl.')]);
  delete cfg.pictureNoWait;
  const st = r.job.handoff.steps, i = st.findIndex((s) => /painter/.test(s.what || ''));
  check('with "Show pictures without waiting" off, the brain loads back and answers the old way', i >= 0 && st.slice(i + 1).some((s) => s.kind === 'load') && r.hist.some((m) => m.content === 'Here is your owl.'), JSON.stringify(st.map((s) => `${s.kind}:${s.what}`)));
}
{
  const r = await turn('make me a picture of a boat and save it to a file called boat.png', [call('make_image', { prompt: 'a boat' }), say('Saved it too.')]);
  check('a picture plus something else asked for: the brain loads back to finish the job', r.hist.some((m) => m.content === 'Saved it too.'), JSON.stringify(r.hist.map((m) => m.content)));
}
{
  const r = await turn('show me a picture of the fox', [say('Sure, here you go!'), say('There it is!')]);
  check('"show me a picture" ignored twice ends with a plain note, not silence', r.events.some((e) => e.type === 'correction' && /didn't make a picture you asked for/.test(e.text)), r.events.map((e) => e.type).join());
  check('...and only one extra go (no loop)', chats === 2, String(chats));
}
{
  brain.badFirst = true;
  const r = await turn('make me a picture of a cat', [call('make_image', { prompt: 'a cat' }), say('Done.')]);
  brain.badFirst = false;
  check('an empty picture file is never shown; the painter tries again and the real one is shown', paints.length === 2 && r.events.filter((e) => e.type === 'image').length === 1 && /p1\.png/.test(r.events.find((e) => e.type === 'image')?.url || ''), `${paints.length} ${JSON.stringify(r.events.filter((e) => e.type === 'image'))}`);
}
{
  const drop = new Error('fetch failed: socket hang up');
  const r = await turn('hello there', [drop, say('Hi Sam!')]);
  check('the brain dropping out mid-answer is loaded again and the answer still comes', r.hist.some((m) => m.role === 'assistant' && m.content === 'Hi Sam!') && r.job.handoff.steps.some((s) => s.kind === 'retry'), JSON.stringify(r.hist.map((m) => m.content)));
}
{
  // Restart: the queue file had a running job.
  const q = () => [
    { id: 'a', text: 'tell me a joke', state: 'working', handoff: { actions: [] } },
    { id: 'b', text: 'type it in notepad', state: 'working', handoff: { actions: [{ name: 'app_act', ok: true, args: '{"window":"Notepad","action":"type"}', text: 'typed' }], outputs: [] } },
    { id: 'c', text: 'paint a fox then write a song about it', state: 'working', handoff: { actions: [{ name: 'make_image', ok: true, args: '{"prompt":"a fox"}', text: 'made fox.png' }], outputs: [{ type: 'image', file: 'C:/p/fox.png' }], current: { name: 'make_music', args: '{"prompt":"fox song","seconds":60}' } } },
    { id: 'd', text: 'move my photos', state: 'working', handoff: { actions: [{ name: 'list_folder', ok: true, args: '{}', text: '3 files' }], outputs: [], current: { name: 'move_files', args: '{"to":"D:/Photos"}' } } },
    { id: 'e', text: 'keeps crashing', state: 'working', resumed: 2, handoff: { actions: [] } },
    { id: 'f', text: 'old flag', state: 'working', resumed: true, handoff: { actions: [] } }
  ];
  fs.writeFileSync(brain.queueFile, JSON.stringify(q()));
  let got = brain.loadQueue();
  const J = (id) => got.find((j) => j.id === id);
  check('by default a cut-off job waits for Try again (opt-in rule)', got.every((j) => j.state === 'interrupted'));
  check('...and its note says Carry on picks up from where it stopped', /Carry on picks up from where it stopped/.test(J('c').error), J('c').error);
  check('...and the carry-on note is ready for Try again', /Already finished\. Do NOT do these again/.test(J('c').carryOn || '') && /make_image/.test(J('c').carryOn) && /Cut off before it finished: make_music/.test(J('c').carryOn));
  check('a cut-off move says so plainly, so the user checks first', /in the middle of/.test(J('d').error) && /in the middle of this step: .+\. Check how far it got first \(it may be half done\), then press Carry on/.test(J('d').error), J('d').error);
  cfg.resumeJobs = true;
  fs.writeFileSync(brain.queueFile, JSON.stringify(q()));
  got = brain.loadQueue();
  check('with "Resume jobs after restart" on, a job that did nothing yet starts again, with no note', J('a').state === 'waiting' && J('a').pickUp && !J('a').carryOn && J('a').resumed === 1);
  check('...a job that already typed (finished) carries on, told not to type again', J('b').state === 'waiting' && /app_act/.test(J('b').carryOn) && /Do NOT do these again/.test(J('b').carryOn));
  check('...a song cut off mid-way is made again with the same settings, after the finished picture', J('c').state === 'waiting' && /"prompt":"fox song"/.test(J('c').carryOn) && /Files already made: C:\/p\/fox\.png/.test(J('c').carryOn), J('c').carryOn);
  check('...a move cut off mid-way waits in Tasks instead (it may be half done)', J('d').state === 'interrupted' && /then press Carry on/.test(J('d').error));
  check('...a job cut off twice already stops coming back by itself', J('e').state === 'interrupted' && /2 times/.test(J('e').error), J('e').error);
  check('...an old true/false flag counts as one pick-up', J('f').state === 'waiting' && J('f').resumed === 2);
  const { carryOnLine, carryOnPlan } = await import('../src/handoff.js');
  check('a file job (move, delete...) cut off mid-way waits too', carryOnPlan({ handoff: { actions: [], current: { name: 'file_hands', args: '{"action":"move"}' } } }).mode === 'wait');
  check('the chat line for a carried-on job says what is kept and what is redone', /Picking up where I left off: 1 step was already done, so I won't redo it, and I'm doing .* again from the start\./.test(carryOnLine(J('c'))), carryOnLine(J('c')));
  check('...and for one that starts again', /starting it again/.test(carryOnLine(J('a'))));
  // Try again on an interrupted job keeps the note; on a failed job it starts clean.
  brain.queue = got; brain.pump = () => {};
  J('d').state = 'interrupted';
  brain.retryJob('d');
  check('Try again on an interrupted job carries on (the note stays)', J('d').state === 'waiting' && J('d').pickUp && /move_files/.test(J('d').carryOn) && J('d').resumed === 0);
  J('b').state = 'failed';
  brain.retryJob('b');
  check('Try again on a failed job starts it from nothing', J('b').state === 'waiting' && !J('b').carryOn && !J('b').pickUp);
  delete brain.pump;
  brain.queue = [];
  cfg.resumeJobs = false;
}
{
  // The brain is told what finished; the chat keeps only the user's words.
  const job = { id: 'carry1', sessionId: 'carry', text: 'paint a fox then a song', kind: 'picture', state: 'working', pickUp: true, before: [{ name: 'make_image', args: '{}', text: 'ok' }], carryOn: '[Bob note, not from the user: Already finished. Do NOT do these again: 1. make_image]' };
  let seen = '';
  const keepChat = eng.chat;
  eng.chat = async ({ messages }) => { seen = messages.filter((m) => m.role === 'user').map((m) => m.content).join('\n'); return { role: 'assistant', content: 'Carrying on.' }; };
  brain.queue.push(job);
  const sig = new AbortController().signal;
  try { await brain.run('carry', job.text, () => {}, sig, [], job); } finally { brain.gate.done(sig); eng.chat = keepChat; }
  const { said } = await import('../src/chats.js');
  const userMsg = brain.session('carry').find((m) => m.role === 'user');
  check('a carried-on job: the brain sees the note', /Do NOT do these again/.test(seen), seen);
  check('...and the chat shows only what the user typed', said(userMsg) === 'paint a fox then a song');
  brain.queue = [];
}
{
  // The ledger knows which step was running, and forgets it when the step ends.
  const job = {};
  const L = new Ledger({ job });
  L.begin('make_music', { prompt: 'x' });
  check('a running step is saved with the job (so a restart knows it was cut off)', job.handoff.current?.name === 'make_music');
  L.action('make_music', { prompt: 'x' }, true, 'ok');
  check('...and cleared when it finishes', job.handoff.current === null && job.handoff.actions.length === 1);
}
{
  // A song waiting for its music models download.
  const dl = [{ id: 'ace-step-music', name: 'ACE-Step 1.5 music models', state: 'downloading' }];
  brain.shop = { dl, describe: (id) => ({ id, name: 'ACE-Step 1.5 music models' }) };
  const started = [];
  const keepStart = brain.startTurn;
  brain.startTurn = (sid, text, refs, job) => { started.push(job.id); job.state = 'done'; };
  const job = { id: 'song1', sessionId: 's', text: 'make me a song about foxes', kind: 'chat', state: 'done', at: 1 };
  brain.queue = [job];
  check('pressing Download from the chat puts the request back in line, waiting for it', brain.waitForDownload('song1', 'ace-step-music') && job.state === 'waiting' && job.after?.id === 'ace-step-music');
  check('...Tasks says it waits for the download', brain.queueView()[0].waitsFor === 'ACE-Step 1.5 music models');
  brain.pump();
  check('...it doesn\'t run while downloading', !started.length && job.state === 'waiting');
  dl[0].state = 'paused'; brain.downloadsChanged();
  check('...or while the download is paused', !started.length);
  dl[0].state = 'done'; brain.downloadsChanged();
  check('...and runs by itself when the download is done, told the models are there', started[0] === 'song1' && !job.after && /on the PC now/.test(job.carryOn));
  const job2 = { id: 'song2', sessionId: 's', text: 'another song', kind: 'chat', state: 'done', at: 1 };
  brain.queue = [job2]; dl[0].state = 'downloading';
  brain.waitForDownload('song2', 'ace-step-music');
  dl[0].state = 'cancelled'; brain.downloadsChanged();
  check('a cancelled download sends the waiting request to Tasks with a plain reason (never waits forever)', job2.state === 'interrupted' && /was cancelled/.test(job2.error) && /press Carry on/.test(job2.error), job2.error);
  const job3 = { id: 'song3', sessionId: 's', text: 'a third song', kind: 'chat', state: 'working', at: 1 };
  brain.queue = [job3]; dl[0].state = 'downloading';
  brain.waitForDownload('song3', 'ace-step-music');
  check('pressed while the reply is still being written: it stays running for now', job3.state === 'working' && job3.after);
  brain.startTurn = keepStart;
  delete brain.shop;
  brain.queue = [];
}
{
  cfg.models.small = 'gemma4:e4b';
  check('brains are named by their Equip slot and catalog name, never a model id', brain.brainLabel('qwen3-coder:30b', 'tinker') === 'Coding brain (Qwen3 Coder 30B)' && brain.brainLabel('gemma4:e4b', 'bob') === 'Quick brain (Gemma 4 E4B)' && brain.brainLabel('main:latest', 'bob') === 'Brain (main)', `${brain.brainLabel('qwen3-coder:30b', 'tinker')} / ${brain.brainLabel('gemma4:e4b', 'bob')}`);
  const g = new Gate(brain, { delays: [1, 1] });
  const ev = [];
  const e2 = fakeEngine({ broken: ['qwen3-coder:30b'] }); const keep = brain.engine; brain.engine = e2;
  brain.fallbackBrain = () => ({ model: 'gemma4:e4b' });
  const sg = new AbortController().signal;
  await g.need({ id: 'brain', model: 'qwen3-coder:30b', opts: {} }, { signal: sg, emit: (e) => ev.push(e), who: 'tinker' });
  g.done(sg); brain.engine = keep; delete brain.fallbackBrain; delete cfg.models.small;
  const said = ev.find((e) => /wouldn't load/.test(e.text))?.text || '';
  check('the fallback line reads "The Coding brain (Qwen3 Coder 30B) wouldn\'t load, so my Quick brain (Gemma 4 E4B) is taking this one."', said === "The Coding brain (Qwen3 Coder 30B) wouldn't load, so my Quick brain (Gemma 4 E4B) is taking this one.", said);
}
{
  const s = await brain.brainStatus();
  check('the brain status carries the handoff flags', s.handoff && 'card' in s.handoff && 'waiting' in s.handoff);
}

{
  const { quickHandBack } = await import('../src/brain.js');
  const pic = { tool_calls: [{ function: { name: 'make_image' } }] };
  const ask = { ledger: { expect: { kind: 'picture' } } };
  check('quick hand-back: brain stayed on the card (fits, or on the processor) -> usual reply', quickHandBack({}, { ...ask, painted: { kind: 'image', count: 1, brainLeft: false } }, pic) === null);
  check('quick hand-back: the paint call failed -> usual reply', quickHandBack({}, { ...ask, painted: null }, pic) === null);
  check('quick hand-back: a clip gets its own line', /^Here's the clip/.test(quickHandBack({}, { ledger: { expect: { kind: 'video' } }, painted: { kind: 'video', count: 1, brainLeft: true } }, { tool_calls: [{ function: { name: 'make_video' } }] }) || ''));
  check('quick hand-back: a picture next to another tool call -> usual reply', quickHandBack({}, { ...ask, painted: { kind: 'image', count: 1, brainLeft: true } }, { tool_calls: [...pic.tool_calls, { function: { name: 'web_search' } }] }) === null);
  check('quick hand-back: Bob painted without being asked -> usual reply', quickHandBack({}, { ledger: { expect: null }, painted: { kind: 'image', count: 1, brainLeft: true } }, pic) === null);
}
{
  const r = await turn('make 3 pictures of a fox', [call('make_image', { prompt: 'fox 1' }), call('make_image', { prompt: 'fox 2' }), call('make_image', { prompt: 'fox 3' }), say('Three foxes.')]);
  check('"make 3 pictures" painted one at a time: no hand-back until all three are done', paints.length === 3 && r.events.filter((e) => e.type === 'image').length === 3, `${paints.length}`);
  check('...then the short line, without loading the brain back for it', r.hist.some((m) => /^Here are the pictures\./.test(m.content)) && replies.length === 1, JSON.stringify(r.hist.map((m) => m.content)));
}
{
  const { askedCount } = await import('../src/brain.js');
  const cases = [['make me a picture of a fox', 1], ['make 3 pictures of a fox', 3], ['give me a few images of cats', 3], ['a couple of pictures', 2], ['pictures of foxes please', 2], ['a picture of two dogs', 1], ['make a clip', 1]];
  const bad = cases.filter(([t, n]) => askedCount(t) !== n);
  check('how many pictures were asked for is read from the words', !bad.length, JSON.stringify(bad.map(([t]) => [t, askedCount(t)])));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
