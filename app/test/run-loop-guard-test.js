// Reliability 151-164 (Nov 12): guard rails on Bob's own loop, always on (src/loop-guard.js). Plain checks first,
// then real turns with a scripted brain. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ERROR_ROUNDS, STALE_ROUNDS, REFUSED_IN_A_ROW, LOUD_LINES, loudLine, isRefusal, ALWAYS_ON_CEILING, NUDGE_BUDGET, CALLS_PER_TURN, nudgeOk, spendNudge, Progress, findCycle, resultHash, WRAP_NOTES, wrapUp, droppedNote, outOfStepsLine, noteWait, waitedFor, busyMs, pastCeiling, ceilingMs, ceilingMins, stage, carriedBudget, keepBudget, CARRIED_MIN_STEPS, CAP_SKIP } from '../src/loop-guard.js';
import { Brain, MAX_CALLS_PER_REPLY } from '../src/brain.js';
import { saveSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };

// ---------- 152: one small budget ----------
{
  const ctx = {};
  check('152: the budget starts open', nudgeOk(ctx));
  for (let i = 0; i < 12; i++) spendNudge(ctx);
  check('152: no shared count (as #275): every kind of nudge still gets its one go', nudgeOk(ctx) && NUDGE_BUDGET === Infinity && ctx.nudges === 12);
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
  for (let i = 2; i < STALE_ROUNDS; i++) q.round({ ran: 1, fresh: 0, failed: 0 });
  check(`154: ${STALE_ROUNDS} in a row is stale`, q.round({ ran: 1, fresh: 0, failed: 0 }) === 'stale');
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
{ // Nov 23: refusals by a safety rule in a row
  check('a folder refusal is a refusal', isRefusal("Error: I'm not allowed to look in C:\\x. Allowed: C:\\y") && isRefusal('Error: That file is outside the folders Bob may open.'));
  check('a plain failure is not', !isRefusal('Error: no such file') && !isRefusal('Found 3 files'));
  const g = new Progress();
  for (let i = 0; i < REFUSED_IN_A_ROW; i++) g.refusal("Error: I'm not allowed to look in C:\\x");
  check(`${REFUSED_IN_A_ROW} refusals in a row end the tools`, g.round({ ran: 1, fresh: 1, failed: 1 }) === 'refused');
  const h = new Progress();
  h.refusal("Error: I'm not allowed to read a"); h.refusal('Found 3 files'); h.refusal("Error: I'm not allowed to read b");
  check('a call that worked starts the count over', h.round({ ran: 1, fresh: 1, failed: 0 }) === '');
  check('every guard has a loud line for the chat', Object.keys(WRAP_NOTES).every((k) => loudLine(k).startsWith('(I stopped')), Object.keys(WRAP_NOTES).filter((k) => !loudLine(k)).join(','));
  check('no step, call or time cap by default', CALLS_PER_TURN === Infinity && ALWAYS_ON_CEILING === false);
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
  check('161: the ceiling is the job time limit (default 10 minutes)', ceilingMs({}) === 600000 && ceilingMins({ jobHelps: { minutes: 30 } }) === 30);
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

// ---------- Real turns ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-guard-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false };
const events = [], logs = [];
const brain = new Brain(cfg, (ev) => { events.push(ev); if (ev?.type === 'approval') setTimeout(() => brain.answerApproval(ev.id, true), 0); }); // every card says yes
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
  script = [...Array.from({ length: STALE_ROUNDS + 1 }, (_, i) => call('web_search', { query: `q${i}` })), { role: 'assistant', content: 'Nothing turned up.' }];
  await run('find something rare');
  check('154: stale after the rounds stopped adding anything', seenTools.at(-1) === 0 && ran.length <= STALE_ROUNDS + 1, `${seenTools.join(',')} ran ${ran.length}`);
  check('Nov 23: the stop is said in the chat', events.some((e) => e.type === 'announce' && e.text === LOUD_LINES.stale));
  check('Nov 23: and a warn line in the logbook', logs.some((l) => l.startsWith('warn: a guard stopped the tools: stale')));
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
  check('152: no more than 3 asks (each kind of send-back once)', asked <= 3, String(asked));
}
{ // 157, Nov 23: no calls-per-turn cap (was 40): 42 searches that keep finding new things all run
  reset();
  let n = 0;
  const round = () => calls(...Array.from({ length: MAX_CALLS_PER_REPLY }, () => ['web_search', { query: `q${n++}` }]));
  script = Array.from({ length: 7 }, round);
  script.push((o) => ({ role: 'assistant', content: o.tools?.length ? 'All found.' : 'tools gone' }));
  const j = await run('search lots', { effort: 'low' });
  check('157: all 42 calls ran in one turn', ran.length === 42, String(ran.length));
  check('157: and he still had his tools after them', brain.session('main').at(-1)?.content === 'All found.', brain.session('main').at(-1)?.content);
  check('164: the job kept its count', j?.loopUsed?.calls === 42, JSON.stringify(j?.loopUsed));
}
{ // 160, Nov 23: no step cap (was 8 at Low effort): a job that keeps finding new pages goes past 8 steps
  reset();
  let n = 0;
  toolImpl = (name, args) => ({ text: `page ${n++}` });
  script = [...Array.from({ length: 12 }, (_, i) => call('fetch_page', { url: `https://example.com/${i}` })), { role: 'assistant', content: 'Read it all.' }];
  await run('read the whole site');
  check('160: all 12 pages were read', ran.length === 12, String(ran.length));
  check('160: no "ran out of steps" ending', !said().includes('ran out of steps') && brain.session('main').at(-1)?.content === 'Read it all.', said().slice(-200));
}
{ // Nov 23 (Legion Go): folder after folder refused -> he stops looking, says so, and answers
  reset();
  toolImpl = (name, args) => ({ text: `Error: I'm not allowed to look in ${args?.path}. Allowed: C:\\inn` });
  script = [...Array.from({ length: REFUSED_IN_A_ROW }, (_, i) => call('list_folder', { path: `C:\\x${i}` })), (o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'this.cfg is part of your paste.' })];
  await run('what does this.cfg do?');
  check(`after ${REFUSED_IN_A_ROW} refusals, the next round has no tools`, ran.length === REFUSED_IN_A_ROW && brain.session('main').at(-1)?.content === 'this.cfg is part of your paste.', `${ran.length} | ${brain.session('main').at(-1)?.content}`);
  check('the stop is said in the chat', events.some((e) => e.type === 'announce' && e.text === LOUD_LINES.refused));
}
{ // Nov 23: a long pasted text gets one line: answer from the message
  reset();
  script = [{ role: 'assistant', content: 'It sets the config.' }];
  await run(`What does this do?\n${'const a = this.cfg.x; '.repeat(200)}`);
  check('a long paste: answer from the message', hiddenNotes().some((t) => /pasted the text into the message itself/.test(t)));
  const before = hiddenNotes().filter((t) => /pasted the text/.test(t)).length;
  reset();
  script = [{ role: 'assistant', content: 'Hi.' }];
  await run('hello there');
  check('a short message gets no paste line', hiddenNotes().filter((t) => /pasted the text/.test(t)).length === before);
}
{ // 161: the safety net uses the job time limit, card waits aside
  reset();
  const realNow = Date.now;
  let skew = 0;
  Date.now = () => realNow() + skew;
  toolImpl = (name) => { skew += 11 * 60000; return { text: `${name} ok ${skew}` }; }; // each call "takes" 11 minutes
  script = [call('web_search', { query: 'a' }), (o) => ({ role: 'assistant', content: o.tools?.length ? 'tools still there' : 'Out of time, here is what I have.' })];
  await run('a long job');
  Date.now = realNow;
  // Nov 23 (the owner's rule: no time caps): with the job time limit switch off, nothing ends a turn on time.
  check('161: past 10 minutes, the tools are still there', seenTools[1] > 0 && brain.session('main').at(-1)?.content === 'tools still there', seenTools.join(','));
}
{ // 161: the limit is read fresh at every check, so a change in Settings counts at once, even mid-job
  for (const [from, to, wraps] of [[60, 10, false], [10, 30, false]]) { // Nov 23: no always-on ceiling, so neither wraps
    reset();
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
