// Reliability items 241-250 (Nov 12): testing and watching.
//   241 replay tests from real records      242 a fake engine that misbehaves on cue   243 fault tests for every tool
//   244 Stop works at every stage           245 a restart never redoes a finished step  246 the loop's numbers per release
//   247 one id per turn in every log line   248 no chat words in the logbook            249 a "why did it stop" line
//   250 a weekly reliability line in Health
// Everything runs on a fake Bob folder in a temp dir with a scripted (or fake) engine: no brain, no real tools.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { tapeFrom, tapeEngine, tapeTools } from '../src/replay.js';
import { caseFor } from '../src/my-tests.js';
import { LoopStats, turnSummary, endWhy, whyLine, worseThan, reliabilityCheck, worstTool, turnLines, turnTag, STATS_FILE, MIN_JOBS_TO_COMPARE } from '../src/turn-log.js';
import { doneBefore } from '../src/handoff.js';
import { healthChecks } from '../src/health.js';
import { safeLogLines } from '../src/crash-catch.js';
import { startFakeEngine } from './fake-engine.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 5; i++) { if (f()) return true; await wait(5); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-watch-'));
process.setMaxListeners(50); // each Bob made here adds its engine's exit handler
const ENDED = ['done', 'failed', 'cancelled', 'interrupted'];

let n = 0;
function makeBob(extra = {}) {
  const agentDir = path.join(tmp, `Agent${++n}`), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { agentDir, innDir, dataDir, logbook: path.join(innDir, 'logbook.md'), settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', timeZone: 'UTC',
    models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, ...extra };
  if (extra.queue) fs.writeFileSync(path.join(dataDir, 'queue.json'), JSON.stringify(extra.queue));
  const events = [];
  const brain = new Brain(cfg, (ev) => events.push(ev));
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  brain.engine.isLoaded = async () => true;
  return { brain, cfg, events };
}
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const script = (brain, list, fallback = 'All done.') => {
  const q = [...list]; let asked = 0; const sent = [];
  brain.engine.chat = async (opts) => { asked++; sent.push(opts.messages); const r = q.shift() || { role: 'assistant', content: fallback }; return typeof r === 'function' ? r(opts) : r; };
  brain.engine.unloadAll = async () => []; brain.engine.loaded = async () => []; brain.engine.unload = async () => [];
  return { asked: () => asked, sent };
};
const runJob = async (brain, text, ms = 4000) => { const { jobId } = brain.enqueue('main', text); const job = brain.queue.find((j) => j.id === jobId); const ended = await until(() => ENDED.includes(job.state) && !brain.turns.size, ms); return { job, ended }; };
const logOf = (cfg) => { try { return fs.readFileSync(cfg.logbook, 'utf8').replace(/\r\n/g, '\n'); } catch { return ''; } };
const answer = (brain) => [...brain.session('main')].reverse().find((m) => m.role === 'assistant' && !m.tool_calls?.length);

// ---------- 242: the fake engine, through Bob's real llama.cpp client ----------
{
  const fake = await startFakeEngine();
  const eng = new LlamaCpp({ dataDir: tmp, llamacpp: { port: fake.port, stallSeconds: 1 } });
  eng.unloadAll = async () => [];
  const ask = (extra = {}) => eng.chat({ model: 'm', messages: [{ role: 'user', content: 'hi' }], ...extra });
  fake.cue({ say: 'Hello there.' });
  check('242: a normal reply comes through', (await ask()).content === 'Hello there.');
  fake.cue({ call: { name: 'read_file', args: { path: 'a.txt' } } });
  const c1 = await ask({ tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }] });
  check('242: a tool call comes through with its input', c1.tool_calls?.[0]?.function?.name === 'read_file' && c1.tool_calls[0].function.arguments.path === 'a.txt', JSON.stringify(c1));
  fake.cue({ broken: { name: 'read_file', args: '{"pa' } });
  const c2 = await ask({ tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }] });
  check('242: a broken call keeps what was written, so it can be mended', c2.tool_calls?.[0]?.function?.raw === '{"pa', JSON.stringify(c2));
  fake.cue({ crash: 'Half a ' });
  let crashed = null; try { await ask(); } catch (e) { crashed = e; }
  check('242: a dropped connection is an error, not a half answer taken as whole', Boolean(crashed), String(crashed));
  fake.cue({ status: 503 });
  let busy = null; try { await ask(); } catch (e) { busy = e; }
  check('242: an HTTP error is an error with its status', /503/.test(String(busy?.message)), String(busy));
  fake.cue({ stall: 'Thinking ' });
  const t0 = Date.now(); let stalled = null; try { await ask(); } catch (e) { stalled = e; }
  check('242: a stall is let go after the stall time', /terminated/.test(String(stalled?.message)) && Date.now() - t0 < 5000, `${stalled?.message} ${Date.now() - t0} ms`);
  fake.cue({ cut: 'Partly ' }, { early: 'No end ' }, { slow: 300, say: 'Late.' });
  check('242: a reply cut at the length limit still returns its words', (await ask()).content === 'Partly ');
  // With items 208-217 (hang-guard.js), a stream that closes without its end mark is an error, so the retry asks again.
  let noEnd = null; try { await ask(); } catch (e) { noEnd = e; }
  check('242: a stream without its end mark is an error (asked again), not a half answer', /end mark/.test(String(noEnd?.message)), String(noEnd));
  check('242: a slow first word still arrives', (await ask()).content === 'Late.');
  check('242: every request reached the fake', fake.requests.length === 9 && fake.left() === 0, String(fake.requests.length));
  await fake.close();
}

// ---------- 241: replay a real turn through the loop ----------
{
  const chat = [
    { role: 'user', id: 'u1', content: 'what is in notes.txt?' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'list_folder', arguments: { path: '.' } } }] },
    { role: 'tool', tool_name: 'list_folder', content: 'notes.txt (12 bytes)' },
    { role: 'system', content: 'a hidden note', hidden: true },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: '{"path":"notes.txt"}' } }] },
    { role: 'tool', tool_name: 'read_file', content: 'buy oat milk' },
    { role: 'assistant', id: 'b1', content: 'It says: buy oat milk.' }
  ];
  const tape = tapeFrom(chat, 'b1');
  check('241: a tape is the turn\'s replies and results, notes left out', tape && tape.ask === 'what is in notes.txt?' && tape.replies.length === 3 && tape.results.length === 2 && tape.replies[1].calls[0].args.path === 'notes.txt' && tape.answer === 'It says: buy oat milk.', JSON.stringify(tape));
  check('241: the last answer is used when no id is given', tapeFrom(chat)?.answer === tape.answer);
  check('241: no answer, no tape', tapeFrom([{ role: 'user', content: 'x' }]) === null && tapeFrom(chat, 'nope') === null);
  check('241: "Save as a test" keeps the tape with the case', caseFor(chat, 'b1', { now: 1 })?.tape?.replies?.length === 3);
}
// Replaying: every shipped tape (test/replays) and the one above. The loop must ask the brain exactly as often as the
// record did, run the same tools, and end with the same answer. A loop change that adds a needless step, a nudge or
// a different ending shows up here, with no brain.
async function replay(tape) {
  const { brain, cfg } = makeBob();
  const eng = tapeEngine(tape), tools = tapeTools(tape);
  script(brain, []); brain.engine.chat = async () => eng.next();
  // Each recorded tool hands back its recorded result from inside Bob's own tool step, so the ledger, the honesty
  // checks and the logbook all see it as they did. What can't be replayed is the world: the after-check is skipped.
  brain.usable = () => true; brain.checkTool = async () => ({ ok: true });
  for (const name of new Set(tape.results.map((r) => r.name))) if (brain.tools[name]) brain.tools[name] = { ...brain.tools[name], check: undefined, run: async () => tools.run(name).text };
  const { job, ended } = await runJob(brain, tape.ask);
  return { ended, job, asked: eng.asked(), replies: tape.replies.length, ran: tools.ran, missing: tools.missing, answer: String(answer(brain)?.content || '').trim(), log: logOf(cfg) };
}
{
  const dir = path.join(here, 'replays');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')).sort();
  check('241: replay tapes ship with the tests', files.length >= 4, files.join(','));
  for (const f of files) {
    const tape = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n'));
    const r = await replay(tape);
    const wantRan = tape.expect?.ran || tape.replies.flatMap((x) => x.calls.map((c) => c.name));
    check(`241 replay ${f}: ends`, r.ended && r.job.state === 'done', r.job.state);
    check(`241 replay ${f}: same number of asks`, r.asked === (tape.expect?.asks ?? r.replies), `${r.asked} vs ${tape.expect?.asks ?? r.replies}`);
    check(`241 replay ${f}: same tools`, r.ran.join(',') === wantRan.join(',') && !r.missing.length, `${r.ran.join(',')} vs ${wantRan.join(',')}`);
    check(`241 replay ${f}: same answer`, r.answer.includes(tape.expect?.answerHas || tape.answer.trim()), r.answer);
    check(`241 replay ${f}: stopped for the recorded reason`, r.job.stopWhy === (tape.expect?.why || 'done'), r.job.stopWhy);
  }
}

// ---------- 243: fault tests for every tool ----------
// Each of Bob's tools (as built on a fresh Bob) times out, comes back empty, hands back a huge result, and throws.
// Every time, the turn must end on its own, keep an answer in the chat, log why it stopped, and never send the brain
// more than its memory holds.
{
  const { brain, cfg } = makeBob();
  brain.usable = () => true; // every tool is reachable, so each fault really runs inside it
  const dummy = (p) => (p?.enum?.length ? p.enum[0] : p?.type === 'number' || p?.type === 'integer' ? 1 : p?.type === 'boolean' ? true : p?.type === 'array' ? [] : p?.type === 'object' ? {} : 'a.txt');
  const argsFor = (t) => { const s = t.schema?.parameters || t.schema?.function?.parameters || t.schema || {}; return Object.fromEntries((s.required || []).map((k) => [k, dummy(s.properties?.[k])])); };
  const FAULTS = {
    timeout: async () => { throw Object.assign(new Error('the tool took longer than its time limit'), { name: 'TimeoutError' }); },
    empty: async () => '',
    huge: async () => 'x'.repeat(200000),
    error: async () => { throw new Error('something broke inside'); }
  };
  const names = Object.keys(brain.tools).filter((k) => typeof brain.tools[k]?.run === 'function' && !['use_tools', 'show_plan', 'ask_together'].includes(k));
  check('243: there are tools to fault', names.length >= 20, String(names.length));
  const broken = [];
  const orig = { ...brain.tools };
  const t0 = Date.now();
  for (const name of names) for (const [fault, run] of Object.entries(FAULTS)) {
    brain.tools[name] = { ...orig[name], check: undefined, endsTurn: false, run };
    const s = script(brain, [call(name, argsFor(orig[name])), { role: 'assistant', content: 'Here is what happened.' }], 'Here is what happened.');
    const { job, ended } = await runJob(brain, `fault test ${fault}`);
    const biggest = Math.max(0, ...s.sent.flat().map((m) => String(m?.content || '').length));
    const ok = ended && ENDED.includes(job.state) && Boolean(job.stopWhy) && Boolean(answer(brain)) && s.asked() <= 12 && biggest < 8192 * 4;
    if (!ok) broken.push(`${name}/${fault}: ${job.state} ${job.stopWhy} asked ${s.asked()} biggest ${biggest}`);
    brain.tools[name] = orig[name];
  }
  check(`243: all ${names.length * 4} faults end the turn cleanly`, !broken.length, broken.slice(0, 8).join(' | '));
  check('243: a failing tool is logged as an error with its name', /\| error \| read_file: something broke inside/.test(logOf(cfg)));
  console.log(`  (fault runs took ${Date.now() - t0} ms)`);
}

// ---------- 244: Stop works at every stage of a turn ----------
{
  const stopAt = async (label, setup, { when = () => true, extra } = {}) => {
    const { brain, cfg, events } = makeBob();
    const probe = { ran: [] };
    await setup(brain, probe);
    const { jobId } = brain.enqueue('main', 'please do the thing');
    const job = brain.queue.find((j) => j.id === jobId);
    await until(() => job.state === 'working' && when(probe), 3000);
    const pressed = Date.now();
    brain.cancelJob(jobId);
    const ended = await until(() => ENDED.includes(job.state) && !brain.turns.size, 3000);
    check(`244: Stop ${label}`, ended && job.state === 'cancelled' && job.stopWhy === 'stop' && Date.now() - pressed < 2500, `${job.state} ${job.stopWhy} ${Date.now() - pressed} ms`);
    check(`244: Stop ${label}: the logbook says so`, /turn ended: Stop was pressed/.test(logOf(cfg)));
    if (extra) await extra(brain, probe, events);
  };
  const untilAbort = (signal) => new Promise((_, no) => { const go = () => no(Object.assign(new Error('aborted'), { name: 'AbortError' })); if (signal?.aborted) go(); else signal?.addEventListener('abort', go, { once: true }); });
  await stopAt('while the brain loads', async (b, p) => { b.ensureModel = async (m, e, signal) => { p.loading = true; await untilAbort(signal); }; script(b, []); }, { when: (p) => p.loading });
  await stopAt('before the first word', async (b, p) => { script(b, []); b.engine.chat = async (o) => { p.asking = true; await untilAbort(o.signal); }; }, { when: (p) => p.asking });
  await stopAt('while words are coming', async (b, p) => { script(b, []); b.engine.chat = async (o) => { o.onToken?.('Half '); p.words = true; await untilAbort(o.signal); }; }, { when: (p) => p.words });
  await stopAt('while a tool runs', async (b, p) => { script(b, [call('read_file', { path: 'a.txt' })]); b.runTool = async (name, a, ctx) => { p.tool = true; await untilAbort(ctx.signal); }; }, { when: (p) => p.tool });
  await stopAt('while a card waits for an answer', async (b, p) => { script(b, [call('ask_user', { question: 'Which one?', choices: ['A', 'B'] })]); }, { when: () => true });
  await stopAt('between the calls of one reply', async (b, p) => {
    script(b, [{ role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: { path: 'a.txt', content: '1' } } }, { function: { name: 'write_file', arguments: { path: 'b.txt', content: '2' } } }] }]);
    b.tools.write_file = { ...b.tools.write_file, check: undefined }; // no card: this is about the round, not the OK
    b.runTool = async (name, a) => { p.ran.push(a.path); p.first = true; await wait(150); return { text: `Wrote ${a.path}` }; }; // ignores Stop, like a tool without a signal
  }, { when: (p) => p.first, extra: async (b, p) => check('244: the second call of the reply never ran', p.ran.join(',') === 'a.txt', p.ran.join(',')) });
  // The real llama.cpp client against the fake engine, mid-stream.
  const fake = await startFakeEngine({ cues: [{ stall: 'Working on it ' }] });
  await stopAt('with the real engine client mid-stream', async (b, p) => { const eng = new LlamaCpp({ dataDir: tmp, llamacpp: { port: fake.port } }); eng.unloadAll = async () => []; b.engine = eng; b.engine.isLoaded = async () => true; b.engine.chat = ((orig) => async (o) => { p.asking = true; return orig.call(eng, o); })(eng.chat); }, { when: (p) => p.asking && fake.requests.length > 0 });
  await fake.close();
}

// ---------- 245: a restart never redoes a finished step ----------
{
  const done = { name: 'write_file', args: JSON.stringify({ path: 'report.txt', content: 'hello' }), ok: true, text: 'Wrote report.txt (5 bytes)', at: 1 };
  const queue = [{ id: 'j1', sessionId: 'main', text: 'write the report and then read it back', state: 'working', at: 1, startedAt: 1, steps: [], effort: 'low', handoff: { actions: [done], outputs: [], steps: [], current: null } }];
  const { brain, cfg } = makeBob({ resumeJobs: true, queue });
  const ran = [];
  brain.runTool = async (name, a) => { ran.push(`${name}:${a.path}:${a.content ?? ''}`); return { text: `${name} ok` }; };
  // The brain forgets and asks for the finished step again (keys in another order), then a new one.
  const s = script(brain, [call('write_file', { content: 'hello', path: 'report.txt' }), call('read_file', { path: 'report.txt' }), { role: 'assistant', content: 'Written and read back.' }]);
  const job = brain.queue.find((j) => j.id === 'j1');
  check('245: the cut-off job is picked up after the restart', job.state === 'waiting' && job.pickUp === true && job.before?.length === 1, JSON.stringify({ s: job.state, p: job.pickUp }));
  await until(() => job.state === 'done' && !brain.turns.size, 5000);
  check('245: the finished write isn\'t done again', !ran.some((r) => r.startsWith('write_file')), ran.join(' | '));
  check('245: the next step still runs', ran.includes('read_file:report.txt:'), ran.join(' | '));
  check('245: the brain gets the earlier result back', brain.session('main').some((m) => m.role === 'tool' && /already finished before Bob was restarted.*Wrote report\.txt/.test(m.content)));
  check('245: the logbook says it wasn\'t run again', /write_file: not run again, it finished before the restart/.test(logOf(cfg)));
  check('245: a different input is a different step', !doneBefore({ before: [done] }, 'write_file', { path: 'report.txt', content: 'changed' }) && Boolean(doneBefore({ before: [done] }, 'write_file', '{"path":"report.txt","content":"hello"}')));
  check('245: looks are never blocked (only actions)', !doneBefore({ before: [{ name: 'read_file', args: '{"path":"a"}', ok: true }] }, 'read_file', { path: 'a' }));
  check('245: no job, nothing blocked', !doneBefore(null, 'write_file', {}) && !doneBefore({}, 'write_file', {}));
  void s;
}

// ---------- 247, 248, 249: the logbook ----------
{
  const { brain, cfg } = makeBob();
  const SECRET = 'purple-elephant-4417';
  script(brain, [call('ask_user', { question: `Is ${SECRET} right?`, choices: ['yes', 'no'] }), { role: 'assistant', content: `Noted ${SECRET}.` }]);
  brain.runTool = async (name, a, ctx) => ({ text: await brain.askUser(a, ctx) });
  const { jobId } = brain.enqueue('main', `remember ${SECRET} for me`);
  const job = brain.queue.find((j) => j.id === jobId);
  await until(() => [...brain.approvals.keys()].length > 0);
  for (const [, done] of brain.approvals) done(true, null, null, 'yes');
  await until(() => job.state === 'done' && !brain.turns.size);
  fs.writeFileSync(path.join(cfg.dataDir, 'reminders.json'), JSON.stringify([{ at: 1, text: `call about ${SECRET}` }]));
  try { brain.checkReminders(); } catch {}
  const log = logOf(cfg);
  check('248: no chat words in the logbook (message, question, answer, reminder)', log.length > 0 && !log.includes(SECRET) && !log.includes('purple'), log);
  check('248: the message is logged by size', /\| chat \| Sam: a message \(\d+ characters\)/.test(log), log);
  check('248: the question is logged as a question with choices, and whether it was answered', /asked a question with 2 choices: answered/.test(log));
  const tag = turnTag(jobId);
  const mine = turnLines(log, jobId);
  check('247: every line the turn wrote ends with its turn id', mine.length >= 3 && log.split('\n').filter((l) => /\| chat \|/.test(l)).every((l) => l.endsWith(` | turn ${tag}`)), log);
  check('247: lines outside a turn have no id', !log.split('\n').filter((l) => /\| reminder \|/.test(l)).some((l) => /\| turn /.test(l)));
  check('247: crash reports still read the kind of each line', safeLogLines(log).every((l) => !/\| chat \|/.test(l)) && safeLogLines(log).some((l) => /\| turn \|/.test(l)));
  check('249: the turn\'s last line says why it stopped, with counts and time', /\| turn \| turn ended: answered; 2 steps, 0 retries, 0 corrections, [\d.]+ s \| turn /.test(log), log);
  check('249: the job record keeps why it stopped', job.stopWhy === 'done' && JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'queue.json'), 'utf8')).find((j) => j.id === jobId)?.stopWhy === 'done');
}
{
  // Steps used up, an error, repeats: each says so.
  const { brain, cfg } = makeBob();
  brain.runTool = async (name, a) => ({ text: `result ${a.path}` });
  let i = 0;
  script(brain, []); brain.engine.chat = async () => call('read_file', { path: `f${i++}.txt` });
  const { job } = await runJob(brain, 'read every file', 8000);
  // With the safety net (items 154-161), an endless list of reads stops at the calls-per-turn limit first.
  check('249: running out of steps (or calls) is named', (job.stopWhy === 'steps' && /turn ended: ran out of steps/.test(logOf(cfg))) || (job.stopWhy === 'calls' && /turn ended: the calls-per-turn limit was reached/.test(logOf(cfg))), `${job.stopWhy}`);
  script(brain, [call('read_file', { path: 'x' }), call('read_file', { path: 'x' }), call('read_file', { path: 'x' })]);
  const r2 = await runJob(brain, 'read x');
  check('249: three identical calls are named', r2.job.stopWhy === 'repeats', r2.job.stopWhy);
  brain.engine.chat = async () => { throw new Error('the engine said no'); };
  brain.engine.isLoaded = async () => true;
  const r3 = await runJob(brain, 'hello');
  check('249: an error is named, with its cause', r3.job.stopWhy === 'error' && /turn ended: an error \(the engine said no\)/.test(logOf(cfg)), r3.job.stopWhy);
}
check('249: endWhy, plain cases', endWhy({ ok: true }) === 'done' && endWhy({ aborted: true }) === 'stop' && endWhy({ parked: true, aborted: true }) === 'parked' && endWhy({ error: { code: 'card_busy' } }) === 'busy' && endWhy({ ok: true, ctx: { endWhy: 'time' } }) === 'time' && endWhy({ ok: true, ctx: { repeatStop: true } }) === 'repeats');
check('249: the line has no chat words and reads plainly', whyLine('time', { steps: 1, retries: 2, corrections: 1, ms: 1500 }) === "turn ended: the job's time limit was used up; 1 step, 2 retries, 1 correction, 1.5 s");

// ---------- 246 and 250: the numbers per release and per week ----------
{
  const day = Date.UTC(2026, 10, 12, 12);
  let now = day;
  const cfg = { dataDir: path.join(tmp, 'stats'), timeZone: 'UTC' };
  const old = new LoopStats(cfg, { now: () => now, version: '1.5.207' });
  for (let k = 0; k < MIN_JOBS_TO_COMPARE; k++) old.record({ why: 'done', ms: 1000, steps: 2, retries: 0, corrections: 0, toolErrors: {} });
  const st = new LoopStats(cfg, { now: () => now, version: '1.5.208' });
  for (let k = 0; k < MIN_JOBS_TO_COMPARE; k++) st.record({ why: k % 3 ? 'done' : 'error', ms: 2000, steps: 4, retries: 1, corrections: k % 2, toolErrors: k % 2 ? { web_search: 1 } : { fetch_page: 0 } });
  const rel = st.releases();
  check('246: numbers are kept per version', rel.now.version === '1.5.208' && rel.before.version === '1.5.207' && rel.now.jobs === MIN_JOBS_TO_COMPARE && rel.before.steps === 2 * MIN_JOBS_TO_COMPARE);
  const worse = worseThan(rel.now, rel.before);
  check('246: a release that got worse is caught', worse.some((w) => /failed jobs/.test(w)) && worse.some((w) => /steps per job 2 to 4/.test(w)), worse.join('; '));
  check('246: too few jobs to say', worseThan({ ...rel.now, jobs: 3 }, rel.before).length === 0);
  check('246: the same is not worse', worseThan(rel.before, rel.before).length === 0);
  const wk = st.week();
  check('250: the week counts both versions\' jobs', wk.jobs === 2 * MIN_JOBS_TO_COMPARE && wk.failed === 7 && wk.corrected === 10 && wk.retried === MIN_JOBS_TO_COMPARE, JSON.stringify(wk));
  check('250: the worst tool is named', worstTool(wk.tools)?.name === 'web_search' && worstTool({}) === null);
  const line = reliabilityCheck(wk, rel);
  check('250: the Health line says finished, failed, corrected, retried and the worst tool', /33 jobs finished, 7 failed, 10 corrected, 20 retried/.test(line.says) && /web_search \(10 times\)/.test(line.says) && line.level === 'warn' && /Worse since the last version/.test(line.says), line.says);
  check('250: the Health page shows it', healthChecks({ loopWeek: wk, loopReleases: rel }).checks.some((c) => c.id === 'reliability'));
  check('250: no line without numbers (tests, a fresh Bob)', !healthChecks({}).checks.some((c) => c.id === 'reliability'));
  check('250: a quiet week says so', /No jobs in the last 7 days/.test(reliabilityCheck({ jobs: 0 }).says));
  now = day + 8 * 864e5;
  check('250: last week\'s jobs leave the week', new LoopStats(cfg, { now: () => now, version: '1.5.208' }).week().jobs === 0);
  const raw = fs.readFileSync(path.join(cfg.dataDir, STATS_FILE), 'utf8');
  check('246: the file holds numbers, versions and tool names only', !/[a-z]{3,} [a-z]{3,}/i.test(raw.replace(/"(web_search|fetch_page)"/g, '')), raw.slice(0, 200));
  fs.writeFileSync(path.join(cfg.dataDir, STATS_FILE), '{"days":{"2026-11-12":{"jobs":"lots","failed":-3,"tools":{"x":"y"}}},"releases":{"../evil":{}},"order":"no"}');
  const bad = new LoopStats(cfg, { now: () => day, version: '1.5.208' });
  check('246: a bad file reads as empty numbers, not a broken page', bad.week().jobs === 0 && !bad.releases().now && reliabilityCheck(bad.week(), bad.releases()).level === 'info');
  const sum = turnSummary({ why: 'done', ms: 12.4, asks: 3, corrections: 1, ledger: { nudged: 1, steps: [{ kind: 'retry' }, { kind: 'load' }], actions: [{ name: 'web_search', ok: false, text: 'Error' }, { name: 'write_file', ok: false, text: 'declined' }, { name: 'read_file', ok: true }] } });
  check('246: a turn\'s summary counts steps, retries and failed tools (a "no" isn\'t a failure)', sum.steps === 3 && sum.retries === 2 && sum.corrections === 1 && JSON.stringify(sum.toolErrors) === '{"web_search":1}', JSON.stringify(sum));
}
{
  // Real turns feed the numbers.
  const { brain, cfg } = makeBob();
  script(brain, [{ role: 'assistant', content: 'Hi Sam.' }]);
  await runJob(brain, 'hello');
  const f = path.join(cfg.dataDir, STATS_FILE);
  const d = fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, 'utf8')) : {};
  const rows = Object.values(d.days || {});
  check('246: each turn adds to today and to this version', rows.length === 1 && rows[0].jobs === 1 && rows[0].finished === 1 && Object.values(d.releases || {})[0]?.jobs === 1, JSON.stringify(d));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
