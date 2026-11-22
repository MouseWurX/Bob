// Reliability 151-164 (Nov 12): guard rails on Bob's own loop, always on (src/loop-guard.js). Plain checks first,
// then real turns with a scripted brain. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_ROUNDS, NUDGE_BUDGET, CALLS_PER_TURN, nudgeOk, spendNudge, Progress, findCycle, resultHash, WRAP_NOTES, wrapUp, droppedNote, outOfStepsLine, noteWait, waitedFor, busyMs, pastCeiling, ceilingMs, ceilingMins, stage, carriedBudget, keepBudget, CARRIED_MIN_STEPS, CAP_SKIP, EXTRA_STEPS, extraSteps } from '../src/loop-guard.js';
import { Brain, MAX_CALLS_PER_REPLY, loopSteps } from '../src/brain.js';
const S = 8; // the mechanics are tested with a cap of 8 (cfg.stepCap); the app itself has none since 21 Nov
import { saveSettings } from '../src/config.js';

let pass = 0, fail = 0;
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };

// ---------- 152: one small budget ----------
{
  const ctx = {};
  check('152: the budget starts open', nudgeOk(ctx));
  for (let i = 0; i < 12; i++) spendNudge(ctx);
  check('152: no shared count (the owner, 21 Nov): every kind of nudge still gets its one go', nudgeOk(ctx) && NUDGE_BUDGET === Infinity && ctx.nudges === 12);
  check('152: each kind sends him back once a turn, so nudges cannot loop', ['claimChecked', 'observeChecked', 'jobGuessChecked', 'cantRetried', 'promiseChecked'].every((f) => new RegExp(`ctx\\.${f} = true`).test(read('src/brain-run-on.js'))) && /ctx\.testsNudged = true/.test(read('src/job-helps.js')));
}

// ---------- 154-156: progress ----------
{
  check('same words, other spacing and case, are the same result', resultHash('Found  3 files') === resultHash('found 3 files\n'));
  const p = new Progress();
  check('a first result is new', p.record('read|a', 'hello') === 'new');
  check('another call with the same words is old', p.record('read|b', 'hello') === 'old');
  check('156: the same call with the same result again is same', p.record('read|a', 'hello') === 'same');
  check('the same call with a changed result is new', p.record('read|a', 'hello there') === 'new');
  const q = new Progress();
  check('154: one round with nothing new is fine', q.round({ ran: 1, fresh: 0, failed: 0 }) === '');
  q.round({ ran: 1, fresh: 0, failed: 0 });
  check('154: three in a row is stale', q.round({ ran: 1, fresh: 0, failed: 0 }) === 'stale');
  const r = new Progress();
  r.round({ ran: 1, fresh: 0, failed: 0 }); r.round({ ran: 1, fresh: 1, failed: 0 });
  check('154: something new starts the count over', r.round({ ran: 1, fresh: 0, failed: 0 }) === '');
  const e = new Progress();
  check('159: one all-error round is fine', e.round({ ran: 2, fresh: 1, failed: 2 }) === '');
  for (let i = 2; i < ERROR_ROUNDS; i++) e.round({ ran: 1, fresh: 1, failed: 1 });
  check(`159: ${ERROR_ROUNDS} all-error rounds in a row`, e.round({ ran: 1, fresh: 1, failed: 1 }) === 'errors');
  const f = new Progress();
  f.round({ ran: 2, fresh: 2, failed: 2 });
  check('159: a round with one success breaks the run', f.round({ ran: 2, fresh: 2, failed: 1 }) === '' && f.round({ ran: 1, fresh: 1, failed: 1 }) === '');
}
{
  check('155: read, write, read, write with the same results is a loop', findCycle(['r#1', 'w#2', 'r#1', 'w#2']) === 2);
  check('155: a loop of three', findCycle(['x#0', 'a#1', 'b#2', 'c#3', 'a#1', 'b#2', 'c#3']) === 3);
  check('155: the same pair with a changed result is not a loop', findCycle(['look#1', 'click#2', 'look#3', 'click#2']) === 0);
  check('155: an exact repeat is left to the repeat guard', findCycle(['a#1', 'a#1', 'a#1', 'a#1']) === 0);
  check('155: too short to tell', findCycle(['a#1', 'b#2', 'a#1']) === 0);
}

// ---------- One-line notes ----------
{
  const all = Object.keys(WRAP_NOTES).map((k) => WRAP_NOTES[k]('Sam', 10));
  check('every wrap-up note is one line and short', all.every((t) => !t.includes('\n') && t.length < 200), all.join(' | '));
  check('the time note names the limit', WRAP_NOTES.time('Sam', 15).includes('15 minutes'));
  const ctx = {}, msgs = [];
  check('wrapUp fires once', wrapUp(ctx, msgs, 'stale', 'Sam') && !wrapUp(ctx, msgs, 'errors', 'Sam') && msgs.length === 1);
  check('wrapUp turns tools off and hides its note', ctx.noTools && ctx.lastRound && msgs[0].hidden && msgs[0].role === 'system');
  const d = droppedNote([{ function: { name: 'read_file' } }, { function: { name: 'read_file' } }, { function: { name: 'web_search' } }], 6);
  check('158: the dropped calls are named once each', d === '(Not run: 3 more calls in that reply, past the 6 one reply may run: read_file, web_search. Call again any you still need.)', d);
}

// ---------- 160: a real ending ----------
{
  const a = outOfStepsLine({ done: ['Wrote a.txt', 'Wrote a.txt', 'Edited b.js'], failed: ['Ran npm test'] });
  check('160: says what was done and what failed', a.includes('Done: Wrote a.txt; Edited b.js.') && a.includes("Didn't work: Ran npm test.") && !/circles/.test(a), a);
  check('160: nothing done, but looked', outOfStepsLine({ looked: 3 }).includes('I looked 3 times but changed nothing yet.'));
  check('160: nothing at all', outOfStepsLine().includes('Nothing was changed yet.'));
}

// ---------- 161 + 163: the clock ----------
{
  const sig = new AbortController().signal;
  check('no waits yet', waitedFor(sig) === 0);
  noteWait(sig, 60000); noteWait(sig, 30000);
  check('163: card waits add up per job', waitedFor(sig) === 90000);
  check('163: card waits are taken off the turn time', busyMs(0, sig, 100000) === 10000);
  check('161: the net is off for now (21 Nov), on with loopTimeNet: the job time limit (default 10 minutes)', ceilingMs({}) === Infinity && ceilingMs({ loopTimeNet: true }) === 600000 && ceilingMins({ jobHelps: { minutes: 30 } }) === 30);
  check('161: a strange minutes value goes back to the default', ceilingMins({ jobHelps: { minutes: 7 } }) === 10);
  check('161: past the ceiling', pastCeiling(0, sig, 600000 + 90000, 600000) && !pastCeiling(0, sig, 600000, 600000));
}

// ---------- 162: stages ----------
{
  const lines = [], ctx = {};
  const log = (k, t) => lines.push(`${k}: ${t}`);
  stage(ctx, 'reading', 0, log); stage(ctx, 'reading', 0, log); stage(ctx, 'acting', 0, log, '2 calls'); stage(ctx, 'reading', 1, log);
  check('162: one log line per stage change', lines.join(' / ') === 'loop: step 1: reading / loop: step 1: acting (2 calls) / loop: step 2: reading', lines.join(' / '));
}

// ---------- 164: carrying on ----------
{
  check('164: a fresh job gets its whole budget', carriedBudget({}, 12).maxSteps === 12);
  const b = carriedBudget({ loopUsed: { steps: 5, nudges: 1, calls: 9 } }, 12);
  check('164: a job that runs again carries on', b.maxSteps === 7 && b.nudges === 1 && b.calls === 9 && b.steps === 5, JSON.stringify(b));
  check(`164: but always keeps at least ${CARRIED_MIN_STEPS} steps`, carriedBudget({ loopUsed: { steps: 50 } }, 8).maxSteps === CARRIED_MIN_STEPS);
  check('164: Try again and Edit start fresh', carriedBudget({ redo: 'again', loopUsed: { steps: 5, nudges: 2 } }, 8).maxSteps === 8);
  const job = {}, ctx = { carriedSteps: 5, nudges: 2, callsRun: 11 };
  keepBudget(job, ctx, 3);
  check('164: the job keeps what it used', job.loopUsed.steps === 8 && job.loopUsed.nudges === 2 && job.loopUsed.calls === 11);
  const guest = { guest: { from: 'x' } }; keepBudget(guest, ctx, 3);
  check('164: a guest job keeps nothing', !guest.loopUsed);
}

// ---------- Nov 16 (the owner): a couple more steps to finish, never an endless loop ----------
{
  const live = () => { const p = new Progress(); p.record('read|a', 'one'); p.round({ ran: 1, fresh: 1, failed: 0 }); return { progress: p }; };
  const a = live();
  check(`extra: still finding new things at the last step gets ${EXTRA_STEPS} more`, extraSteps(a) === EXTRA_STEPS && EXTRA_STEPS === 2);
  check('extra: only once a turn', extraSteps(a) === 0);
  const b = live(); b.progress.round({ ran: 1, fresh: 0, failed: 0 });
  check('extra: none when the last round found nothing new', extraSteps(b) === 0);
  const c = live(); c.progress.round({ ran: 1, fresh: 1, failed: 1 });
  check('extra: none when the last round failed', extraSteps(c) === 0);
  check('extra: none at the call ceiling', extraSteps({ ...live(), capHit: true }) === 0 && (!Number.isFinite(CALLS_PER_TURN) || extraSteps({ ...live(), callsRun: CALLS_PER_TURN - 1 }) === 0));
  check('extra: none in a round with no tools', extraSteps({ ...live(), noTools: true }) === 0);
  check('extra: none before any tool ran', extraSteps({ progress: new Progress() }) === 0);
}

// ---------- Real turns ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-guard-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false };
const events = [], logs = [];
const brain = new Brain(cfg, (ev) => { events.push(ev); if (ev?.type === 'approval') setTimeout(() => brain.answerApproval(ev.id, true), 0); }); // every card says yes
brain.cfg.stepCap = S;
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const realLog = brain.log.bind(brain);
brain.log = (k, t) => { logs.push(`${k}: ${t}`); try { realLog(k, t); } catch {} };
const ran = [];
let toolImpl = null;
brain.runTool = async (name, args) => { ran.push(name); return toolImpl ? toolImpl(name, args) : { text: `${name} result ${ran.length}` }; };
let script = [], asked = 0, seenTools = [], seenMsgs = [];
brain.engine = { chat: async (o) => { asked++; seenTools.push((o.tools || []).length); seenMsgs.push(o.messages); const r = script.shift(); return typeof r === 'function' ? r(o) : r || { role: 'assistant', content: 'done' }; }, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const calls = (...list) => ({ role: 'assistant', content: '', tool_calls: list.map(([name, args]) => ({ function: { name, arguments: args || {} } })) });
const call = (name, args = {}) => calls([name, args]);
const run = async (text, extra) => { const { jobId } = brain.enqueue('main', text, extra); await until(() => ['done', 'failed', 'cancelled'].includes(brain.queue.find((j) => j.id === jobId)?.state)); return brain.queue.find((j) => j.id === jobId); };
const said = () => events.filter((e) => e.type === 'token').map((e) => e.text).join('');
const reset = () => { ran.length = 0; events.length = 0; logs.length = 0; asked = 0; seenTools = []; seenMsgs = []; toolImpl = null; };
const hiddenNotes = () => brain.session('main').filter((m) => m.role === 'system' && m.hidden).map((m) => m.content);

{ // 151: Stop between calls in one round
  reset();
  toolImpl = (name) => { brain.stop(); return { text: `${name} ok` }; };
  script = [calls(['write_file', { path: 'a.txt', content: 'a' }], ['write_file', { path: 'b.txt', content: 'b' }], ['write_file', { path: 'c.txt', content: 'c' }]), { role: 'assistant', content: 'never' }];
  await run('write three files');
  check('151: after Stop, the rest of the round does not run', ran.length === 1, ran.join(','));
  check('151: the turn says Stopped', said().includes('(Stopped.)'), said());
}
{ // 158: dropped calls are named back
  reset();
  const many = Array.from({ length: MAX_CALLS_PER_REPLY + 2 }, (_, i) => ['web_search', { query: `q${i}` }]);
  script = [calls(...many), { role: 'assistant', content: 'Here you go.' }];
  await run('search eight things');
  check('158: only the first six ran', ran.length === MAX_CALLS_PER_REPLY);
  const second = seenMsgs[1] || [];
  check('158: the brain is told which calls did not run', second.some((m) => m.role === 'system' && /^\(Not run: 2 more calls in that reply/.test(m.content)), JSON.stringify(second.slice(-3)));
}
{ // 159: two all-error rounds -> answer
  reset();
  toolImpl = (name) => ({ text: `Error: ${name} broke (${ran.length})` });
  script = [...Array.from({ length: ERROR_ROUNDS }, (_, i) => call('web_search', { query: `x${i + 1}` })), (o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'The search kept failing.' })];
  await run('find x');
  check(`159: after ${ERROR_ROUNDS} failing rounds, the next has no tools`, seenTools[ERROR_ROUNDS] === 0, seenTools.join(','));
  check('159: he says what failed', brain.session('main').at(-1)?.content === 'The search kept failing.');
  check('159: one hidden line told him why', hiddenNotes().some((t) => t === WRAP_NOTES.errors('Sam')));
}
{ // 154: three rounds with nothing new -> answer
  reset();
  toolImpl = () => ({ text: 'No results.' });
  script = [call('web_search', { query: 'a' }), call('web_search', { query: 'b' }), call('web_search', { query: 'c' }), call('web_search', { query: 'd' }), { role: 'assistant', content: 'Nothing turned up.' }];
  await run('find something rare');
  check('154: stale after the rounds stopped adding anything', seenTools.at(-1) === 0 && ran.length <= 4, `${seenTools.join(',')} ran ${ran.length}`);
  check('154: answered', brain.session('main').at(-1)?.content === 'Nothing turned up.');
}
{ // 155: two actions taking turns (each clears the repeat count), with nothing changing
  reset();
  toolImpl = () => ({ text: 'Saved.' });
  const a = ['write_file', { path: 'a.txt', content: 'x' }], b = ['write_file', { path: 'b.txt', content: 'y' }];
  script = [calls(a), calls(b), calls(a), calls(b), (o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'Saving keeps undoing itself.' })];
  await run('save both files');
  check('155: the back-and-forth is caught after two loops', ran.length === 4 && seenTools[4] === 0, `${ran.join(',')} | ${brain.session('main').at(-1)?.content}`);
  check('155: one hidden line told him why', hiddenNotes().some((t) => t === WRAP_NOTES.cycle('Sam')));
}
{ // a round with no tools runs no calls, even when the brain writes some
  reset();
  toolImpl = () => ({ text: 'Error: broke' });
  script = Array.from({ length: ERROR_ROUNDS + 1 }, (_, i) => call('web_search', { query: `q${i}` }));
  await run('find a');
  check('no tools offered: his calls do not run', ran.length === ERROR_ROUNDS, ran.join(','));
  check('no tools offered and no words: the plain ending', /^\(I stopped there\. Didn't work: .+\. Ask me to carry on/.test(brain.session('main').at(-1)?.content || ''), brain.session('main').at(-1)?.content);
}
{ // 156: an action in between no longer wipes the repeat count when the result never changes
  reset();
  let w = 0;
  toolImpl = (name) => ({ text: name === 'read_file' ? 'old text' : `Wrote a.txt (${++w})` });
  script = [call('read_file', { path: 'a.txt' }), call('write_file', { path: 'a.txt', content: 'x1' }), call('read_file', { path: 'a.txt' }), call('write_file', { path: 'a.txt', content: 'x2' }), call('read_file', { path: 'a.txt' }), call('write_file', { path: 'a.txt', content: 'x3' }), call('read_file', { path: 'a.txt' }), (o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'The file will not change.' })];
  await run('fix a.txt');
  check('156: same read, same result, three times: he answers', brain.session('main').at(-1)?.content === 'The file will not change.', `${ran.join(',')} | ${brain.session('main').at(-1)?.content}`);
}
{ // 152 + 153: the honesty nudges share a budget of two, and don't use up steps
  reset();
  // Each reply promises an action and runs nothing; the promise nudge fires once, then can't-nudge and so on.
  script = [
    { role: 'assistant', content: "I'll look that up now." },
    { role: 'assistant', content: "I can't do that." },
    { role: 'assistant', content: "I can't do that, sorry." },
    { role: 'assistant', content: 'never reached' }
  ];
  await run('what is the weather?');
  check('152: no more than 3 asks (the first try and 2 sends-back)', asked <= 3, String(asked));
}
if (!Number.isFinite(CALLS_PER_TURN)) { // 21 Nov (the owner: "NO STEP LIMITS"): no calls-per-turn ceiling
  check('157: no calls-per-turn ceiling any more', CALLS_PER_TURN === Infinity);
} else { // 157: the calls-per-turn ceiling
  reset();
  let n = 0;
  const round = () => calls(...Array.from({ length: MAX_CALLS_PER_REPLY }, () => ['web_search', { query: `q${n++}` }]));
  script = Array.from({ length: Math.ceil((CALLS_PER_TURN + 1) / MAX_CALLS_PER_REPLY) }, round);
  script.push((o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'Stopping here.' }));
  brain.cfg.jobHelps = { minutes: 60 };
  const j = await run('search lots', { effort: 'extreme' });
  check(`157: no more than ${CALLS_PER_TURN} calls ran in one turn`, ran.length === CALLS_PER_TURN, String(ran.length));
  check('157: then he answers with no tools', brain.session('main').at(-1)?.content === 'Stopping here.', brain.session('main').at(-1)?.content);
  check('157: the calls past it got the plain line', seenMsgs.at(-1).some((m) => m.role === 'tool' && String(m.content).startsWith(CAP_SKIP)));
  check('164: the job kept its count', j?.loopUsed?.calls === CALLS_PER_TURN, JSON.stringify(j?.loopUsed));
  delete brain.cfg.jobHelps;
}
{ // Nov 16 (the owner): "if he needs a couple more steps to finish the job we should allow that, but never an infinite loop"
  reset();
  let n = 0;
  toolImpl = () => ({ text: `page ${n++}` });
  script = [...Array.from({ length: S + 1 }, (_, i) => call('fetch_page', { url: `https://example.com/${i}` })), { role: 'assistant', content: 'All nine pages read.' }];
  await run('read the whole site');
  check(`extra: one more step past the usual ${S} lets him finish`, ran.length === S + 1 && brain.session('main').at(-1)?.content === 'All nine pages read.', `${ran.length} | ${brain.session('main').at(-1)?.content}`);
  check('extra: the logbook says why', logs.some((l) => /still found something new: 2 more steps to finish \(once a turn\)/.test(l)), logs.filter((l) => l.startsWith('loop')).join(' / '));
  reset();
  n = 0;
  toolImpl = () => ({ text: `page ${n++}` });
  script = Array.from({ length: S + 6 }, (_, i) => (o) => (o.tools?.length ? call('fetch_page', { url: `https://example.com/${i}` }) : { role: 'assistant', content: 'Here is what I read so far.' }));
  await run('read the whole site');
  check(`extra: never endless: ${S} + 2 steps, the last with no tools`, ran.length === S + 1 && seenTools.length === S + 2 && seenTools.at(-1) === 0, `${ran.length} ran, ${seenTools.join(',')}`);
  check('extra: he answers with what he has', brain.session('main').at(-1)?.content === 'Here is what I read so far.');
  reset();
  toolImpl = () => ({ text: 'No results.' });
  script = Array.from({ length: S + 6 }, (_, i) => (o) => (o.tools?.length ? call('web_search', { query: `q${i}` }) : { role: 'assistant', content: 'Nothing found.' }));
  await run('find something rare');
  check('extra: nothing new coming in: no extra steps', !logs.some((l) => /more steps to finish/.test(l)) && seenTools.length <= S, seenTools.join(','));
}
{ // 160: steps run out -> a real ending
  reset();
  let n = 0;
  toolImpl = (name, args) => ({ text: `page ${n++}` });
  script = Array.from({ length: S }, (_, i) => call('fetch_page', { url: `https://example.com/${i}` }));
  brain.helpOff = (k) => k === 'last'; // the last step keeps its tools, so the steps really run out
  await run('read the whole site');
  delete brain.helpOff;
  check('160: no fixed circles line', !said().includes('round in circles'), said());
  check('160: the ending says what was looked at', /\(I ran out of steps before finishing\. I looked \d+ times but changed nothing yet\./.test(said()), said().slice(-200));
  check('160: the ending is kept in the chat', /^\(I ran out of steps/.test(brain.session('main').at(-1)?.content || ''));
}
{ // 161: the safety net uses the job time limit, card waits aside
  reset();
  brain.cfg.loopTimeNet = true;
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  toolImpl = (name) => { skew += 11 * 60000; return { text: `${name} ok ${skew}` }; }; // each call "takes" 11 minutes
  script = [call('web_search', { query: 'a' }), (o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'Out of time, here is what I have.' })];
  await run('a long job');
  Date.now = realNow;
  check('161: past the 10-minute limit the next round has no tools', seenTools[1] === 0, seenTools.join(','));
  check('161: and he wraps up', brain.session('main').at(-1)?.content === 'Out of time, here is what I have.');
  check('161: the note names the limit', hiddenNotes().some((t) => t === WRAP_NOTES.time('Sam', 10)));
  delete brain.cfg.loopTimeNet;
}
{ // 161: the limit is read fresh at every check, so a change in Settings counts at once, even mid-job
  for (const [from, to, wraps] of [[60, 10, true], [10, 30, false]]) {
    reset();
    brain.cfg.loopTimeNet = true;
    saveSettings(brain.cfg, { jobHelps: { minutes: from } });
    const realNow = Date.now;
    let skew = 0;
    Date.now = () => realNow() + skew;
    toolImpl = (name) => { skew += 11 * 60000; saveSettings(brain.cfg, { jobHelps: { minutes: to } }); return { text: `${name} ok ${skew}` }; };
    script = [call('web_search', { query: 'a' }), (o) => ({ role: 'assistant', content: o.tools?.length ? 'still going' : 'Out of time.' })];
    await run('a long job');
    Date.now = realNow;
    check(`161: the limit changed from ${from} to ${to} minutes mid-job ${wraps ? 'wraps it up' : 'lets it carry on'}`, (seenTools[1] === 0) === wraps && brain.session('main').at(-1)?.content === (wraps ? 'Out of time.' : 'still going'), seenTools.join(','));
  }
  saveSettings(brain.cfg, { jobHelps: { minutes: 10 } });
}
{ // 162: stages in the log
  reset();
  script = [call('web_search', { query: 'moon' }), { role: 'assistant', content: 'Big.' }];
  await run('how big is the moon');
  const st = logs.filter((l) => l.startsWith('loop: step'));
  check('162: reading, acting, reading, checking, answering', st.join(' / ') === 'loop: step 1: reading / loop: step 1: acting (1 call) / loop: step 2: reading / loop: step 2: checking / loop: step 2: answering', st.join(' / '));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
