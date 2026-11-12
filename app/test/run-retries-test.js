// Reliability items 193-207: errors and retries. Always on (they are fixes). Fake engines, fake Bobs and fake
// timers only: nothing real is loaded, fetched or started, and nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain, NO_ANSWER_NOTE, NO_ANSWER_PARKED } from '../src/brain.js';
import { backoffMs, jitter, rootCause, causeLine, engineFailKind, carryOnTokens, toolError, toolErrorText, ToolStrikes, badAddress, STRIKES, STRIKE_NOTE, STRUCK_OUT, fixOffer, ErrorTally, sideJob, halfDone, pause } from '../src/retry.js';
import { Lenders, SKIP_MS } from '../src/share-brains.js';
import { fetchRetry } from '../src/tools.js';
import { healthChecks } from '../src/health.js';
import { afterTool } from '../src/verify.js';
import { withRetry } from '../src/handoff.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-retries-'));
const tick = (ms = 0) => new Promise((r) => setTimeout(r, ms));
const seq = (...xs) => { let i = 0; return () => xs[Math.min(i++, xs.length - 1)]; };

// ---------- 194: waits grow, with a bit of randomness ----------
{
  const lo = () => 0, hi = () => 0.999999;
  check('194 the first wait is half to all of the base', backoffMs(0, { base: 1000, rand: lo }) === 500 && backoffMs(0, { base: 1000, rand: hi }) === 1000);
  check('194 each wait is about twice the one before', backoffMs(1, { base: 1000, rand: lo }) === 1000 && backoffMs(2, { base: 1000, rand: lo }) === 2000);
  check('194 and never past the cap', backoffMs(20, { base: 1000, max: 30000, rand: hi }) <= 30000);
  const spread = new Set(Array.from({ length: 20 }, () => backoffMs(3, { base: 1000 })));
  check('194 two waits are seldom the same (randomness)', spread.size > 5);
  check('194 jitter keeps a fixed wait within a quarter', jitter(1000, lo) === 750 && jitter(1000, hi) === 1250);
  check('194 the engine, web, connected apps and other Bobs all use it', /jitter\(this\.delays/.test(read('src/handoff.js')) && /fetchRetry\('https:\/\/html\.duckduckgo/.test(read('src/tools.js')) && /backoffMs\(0, \{ base: 1000 \}\)/.test(read('src/mcp.js')) && /jitter\(pause\[i\]/.test(read('src/share-jobs.js')));
  // withRetry: still retries, still stops at once on Stop
  let n = 0;
  const v = await withRetry(async () => { if (n++ === 0) throw new Error('flaky'); return 'ok'; }, { tries: 2, wait: 5 });
  check('194 withRetry still tries again after a short random wait', v === 'ok' && n === 2);
  const ctl = new AbortController(); ctl.abort();
  check('194 a wait ends at once on Stop', await pause(10000, ctl.signal).then(() => false, (e) => /Stopped/.test(e.message)));
}

// ---------- 207: the real cause ----------
{
  const inner = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:8080'), { code: 'ECONNREFUSED' });
  const outer = new TypeError('fetch failed', { cause: inner });
  check('207 the first error is found under the wrapper', rootCause(outer) === inner);
  check('207 the logbook line keeps both', /fetch failed \(first error: ECONNREFUSED connect ECONNREFUSED 127\.0\.0\.1:8080\)/.test(causeLine(outer)), causeLine(outer));
  check('207 an error with no cause is just its message', causeLine(new Error('plain')) === 'plain');
  check('207 a loop of causes can\'t hang it', (() => { const a = new Error('a'); const b = new Error('b', { cause: a }); a.cause = b; causeLine(a); return true; })());
  check('207 AggregateError: the first of them', rootCause(new AggregateError([inner], 'all failed')) === inner);
}

// ---------- 195: which engine failures a second try can fix ----------
{
  check('195 503 is busy', engineFailKind(Object.assign(new Error('llama-server answered 503'), { status: 503 })) === 'busy');
  check('195 "loading model" is busy', engineFailKind(new Error('{"error":{"code":503,"message":"Loading model"}}')) === 'busy');
  check('195 out of memory', engineFailKind(new Error('CUDA error: out of memory')) === 'memory' && engineFailKind(new Error('failed to allocate buffer')) === 'memory');
  check('195 a dropped connection', engineFailKind(new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) })) === 'dropped');
  check('195 anything else is not retried', engineFailKind(new Error('the template refused the message')) === '');
}

// ---------- 193: the words already shown aren't shown twice ----------
{
  const out = []; let undo = 0;
  const c = carryOnTokens('Hello wor', (t) => out.push(t), (n) => { undo += n; });
  for (const t of ['Hel', 'lo w', 'orld', ', fine.']) c.onToken(t);
  c.finish();
  check('193 the retry\'s repeat is held back; only the new words show', out.join('') === 'ld, fine.' && undo === 0, JSON.stringify(out));
  const out2 = []; let undo2 = 0;
  const c2 = carryOnTokens('Hello world', (t) => out2.push(t), (n) => { undo2 += n; });
  for (const t of ['Hello', ' there']) c2.onToken(t);
  check('193 a retry that goes another way takes back only the words that differ', undo2 === 'world'.length && out2.join('') === 'there', `${undo2} ${out2}`);
  const out3 = []; let undo3 = 0;
  const c3 = carryOnTokens('Hello world', (t) => out3.push(t), (n) => { undo3 += n; });
  c3.onToken('Hello'); c3.finish();
  check('193 a retry that ends shorter takes back the rest', undo3 === ' world'.length && !out3.length);
  check('193 the desktop window, the phone and a job from another Bob all know token-undo', /case 'token-undo'/.test(read('public/app.js')) && /token-undo/.test(read('android/app/src/main/assets/www/phone.js')) && /token-undo/.test(read('src/share-jobs.js')));
}

// ---------- 198: plain words, from the error's own code ----------
{
  const e = Object.assign(new Error("ENOENT: no such file or directory, stat 'C:\\x\\a.txt'"), { code: 'ENOENT', path: 'C:\\x\\a.txt' });
  const t = toolErrorText(e);
  check('198 ENOENT in plain words with what to try next', t.text === 'Error: "C:\\x\\a.txt" isn\'t there. Next: check the name and folder with list_files, then try once more.' && t.hinted && !t.transient, t.text);
  check('198 a busy file is worth a second go; a missing one isn\'t', toolErrorText(Object.assign(new Error('x'), { code: 'EBUSY' })).transient && !t.transient);
  check('198 the code under a fetch wrapper is found', toolErrorText(new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ENOTFOUND', hostname: 'nope.example' }) })).code === 'ENOTFOUND');
  check('198 a tool can say it itself', toolErrorText(toolError('the printer is off', 'switch it on')).text === 'Error: the printer is off. Next: switch it on.');
  check('198 an error with no code keeps its words', toolErrorText(new Error('Only http and https links.')).text === 'Error: Only http and https links.');
  // verify.js: the code decides the second go, not the words
  const v1 = await afterTool('write_file', { path: 'x' }, 'Error: something timed out', { toolError: { code: 'ENOENT', transient: false } });
  const v2 = await afterTool('write_file', { path: 'x' }, 'Error: nothing helpful here', { toolError: { code: 'EBUSY', transient: true } });
  check('198 the check after a tool goes by the code when there is one', v1.retry === false && v2.retry === true, JSON.stringify([v1, v2]));
}

// ---------- 200: three strikes for a tool (the owner's rule) ----------
{
  const s = new ToolStrikes();
  check('200 one failure: not set aside', s.record('read_file', false) === 1 && !s.blocked('read_file'));
  check('200 a success clears it', s.record('read_file', true) === 0 && s.record('read_file', false) === 1);
  check('200 two in a row: still not set aside', s.record('read_file', false) === 2 && !s.blocked('read_file'));
  check('200 three in a row: set aside', STRIKES === 3 && s.record('read_file', false) === 3 && s.blocked('read_file'));
  check('200 asking the user never counts', s.record('ask_user', false) === 0 && s.record('ask_user', false) === 0 && !s.blocked('ask_user'));
  check('200 the notes are one line each', !/\n/.test(STRIKE_NOTE('x', 'Sam')) && !/\n/.test(STRUCK_OUT('x', 'Sam')));
  check('200 the offer after the job is one line, naming the tools', fixOffer(['read_file']) === '🔧 read_file kept failing on this job, so I set it aside. Want me to look at it harder and try to fix it?' && /web_search and read_file .* set them aside/.test(fixOffer(['web_search', 'read_file'])) && fixOffer([]) === '');
}

// ---------- 206: errors counted per tool per day ----------
{
  let now = new Date(2026, 10, 1, 12).getTime();
  const f = path.join(tmp, 'tool-errors.json');
  const T = new ErrorTally(f, { now: () => now, saveMs: 1 });
  for (let d = 0; d < 7; d++) { T.add('web_search'); now += 86400000; } // one a day for a week
  for (let i = 0; i < 6; i++) T.add('web_search');
  T.add('read_file');
  check('206 today\'s count per tool', T.today().web_search === 6 && T.today().read_file === 1);
  check('206 its usual day', T.usual('web_search') === 1);
  check('206 far more than usual is called out; a little isn\'t', T.unusual().length === 1 && T.unusual()[0].tool === 'web_search');
  T.save();
  const again = new ErrorTally(f, { now: () => now });
  check('206 kept on disk (counts only, no words)', again.today().web_search === 6 && !/Error|http/.test(fs.readFileSync(f, 'utf8')));
  const h = healthChecks({ toolErrors: T.view() });
  const line = h.checks.find((c) => c.id === 'tool-errors');
  check('206 the Health page names the tool that broke', line?.level === 'warn' && /web_search/.test(line.says) && line.lines.some((l) => /web_search: 6 today \(usually 1 a day\)/.test(l)), JSON.stringify(line));
  check('206 no tool errors: no line', !healthChecks({ toolErrors: [] }).checks.some((c) => c.id === 'tool-errors'));
  for (let i = 0; i < 40; i++) { now += 86400000; T.add('x'); }
  check('206 only the last 30 days are kept', Object.keys(T.days).length === 30);
}

// ---------- 204: side jobs ----------
{
  const logs = [];
  const log = (k, t) => logs.push(`${k}: ${t}`);
  const a = sideJob(log, 'the how-to card', () => { throw new Error('boom'); }, 'fallback');
  const b = await sideJob(log, 'memory', async () => { throw new Error('disk'); });
  check('204 a side job that throws never breaks the reply', a === 'fallback' && b === undefined);
  check('204 each failure is one logbook line', logs.length === 2 && logs.every((l) => /^side: .* didn't work: /.test(l) && !/\n/.test(l)), JSON.stringify(logs));
  check('204 a side job that works gives its answer', sideJob(log, 'x', () => 5) === 5);
}

// ---------- 197: look before trying again ----------
{
  const f = path.join(tmp, 'half.txt');
  fs.writeFileSync(f, 'all of it');
  check('197 write_file: the file is there with what was sent, so no second go', halfDone('write_file', { path: f, content: 'all of it' }).done);
  check('197 write_file: different content, so a second go', !halfDone('write_file', { path: f, content: 'something else' }).done);
  const out = path.join(tmp, 'pics'); fs.mkdirSync(out);
  const t0 = Date.now() - 50;
  check('197 a picture: nothing new in the output folder, so a second go', !halfDone('make_image', {}, t0, { outputDirs: [out] }).done);
  fs.writeFileSync(path.join(out, 'late.png'), 'png');
  const h = halfDone('make_image', {}, t0, { outputDirs: [out] });
  check('197 a picture that came out late is found, not made twice', h.done && h.files[0].endsWith('late.png'));
}

// ---------- A Bob with a fake engine ----------
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', allTools: true,
  memoryFile: path.join(innDir, 'memory.md'), models: { bob: 'main:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.fitCtx = async () => 8192;
const loads = [];
brain.ensureModel = async (m) => { loads.push(m); return m; };
const logs = [];
const origLog = brain.log.bind(brain);
brain.log = (k, t) => { logs.push(`${k}: ${t}`); try { origLog(k, t); } catch {} };
let chatImpl = async () => ({ role: 'assistant', content: 'Done.' });
const eng = { chat: (o) => chatImpl(o), unloadAll: async () => {}, unload: async () => {}, isLoaded: async () => false };
brain.engine = eng;
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });

// 193 / 195 / 201 through chatRetry
{
  let n = 0;
  chatImpl = async ({ onToken }) => {
    n++;
    if (n === 1) { onToken('Hello wor'); throw new TypeError('fetch failed', { cause: Object.assign(new Error('socket'), { code: 'ECONNRESET' }) }); }
    for (const t of ['Hello', ' world', ', all fine.']) onToken(t);
    return { role: 'assistant', content: 'Hello world, all fine.' };
  };
  const evs = [], shown = [];
  loads.length = 0;
  const r = await brain.chatRetry({ model: 'main:latest', messages: [], signal: new AbortController().signal, onToken: (t) => shown.push(t) }, { emit: (e) => evs.push(e), who: 'bob' });
  check('193 a drop-out mid-answer: loaded again and asked once more', n === 2 && loads.includes('main:latest') && r.content === 'Hello world, all fine.');
  check('193 the words already shown are not shown twice', shown.join('') === 'Hello world, all fine.', JSON.stringify(shown));
  check('193 the drop-out is a note line, not words inside the answer', evs.some((e) => e.type === 'retry-note') && !evs.some((e) => e.type === 'token'));
  check('207 the logbook has the real cause', logs.some((l) => /dropped out mid-answer \(fetch failed \(first error: ECONNRESET socket\)\)/.test(l)), logs.filter((l) => /dropped/.test(l)).join(' | '));
}
{
  let n = 0;
  chatImpl = async () => { n++; if (n < 3) throw Object.assign(new Error('llama-server answered 503 (Loading model)'), { status: 503 }); return { role: 'assistant', content: 'ok' }; };
  loads.length = 0;
  const t0 = Date.now();
  const r = await brain.chatRetry({ model: 'main:latest', messages: [], signal: new AbortController().signal }, { emit: () => {}, who: 'bob' });
  check('195 503 busy: asked again after a short wait, without reloading the brain', r.content === 'ok' && n === 3 && loads.length === 0 && Date.now() - t0 >= 700, `${n} ${loads}`);
}
{
  let n = 0;
  chatImpl = async () => { n++; throw new Error('the template refused it'); };
  const r = await brain.chatRetry({ model: 'main:latest', messages: [], signal: new AbortController().signal }, { emit: () => {}, who: 'bob' }).then(() => 'ok', (e) => e.message);
  eng.isLoaded = async () => true;
  n = 0;
  const r2 = await brain.chatRetry({ model: 'main:latest', messages: [], signal: new AbortController().signal }, { emit: () => {}, who: 'bob' }).then(() => 'ok', (e) => e.message);
  eng.isLoaded = async () => false;
  check('195 a failure a retry can\'t fix, with the brain still there, isn\'t retried', r2 === 'the template refused it' && n === 1, `${r2} ${n}`);
  check('195 ...(a brain that died is still loaded again once)', r === 'the template refused it');
}
{
  cfg.models.bob = 'main:latest';
  const used = [];
  chatImpl = async ({ model }) => { used.push(model); if (model === 'big:latest') throw new Error('CUDA error: out of memory'); return { role: 'assistant', content: `from ${model}` }; };
  const evs = [];
  const sig = new AbortController().signal;
  const ledger = { step: () => ({ done() {} }) };
  brain.gate.track(sig, ledger);
  const r = await brain.chatRetry({ model: 'big:latest', messages: [], signal: sig, onToken: () => {} }, { emit: (e) => evs.push(e), who: 'bob' });
  check('201 a brain that keeps failing a job: the next brain that fits takes it, once', r.content === 'from main:latest' && used.join() === 'big:latest,big:latest,main:latest', used.join());
  check('201 ...and says so', evs.some((e) => e.type === 'announce' && /kept failing on this/.test(e.text)) && ledger.brainMoved === true);
  used.length = 0;
  chatImpl = async ({ model }) => { used.push(model); throw new Error('CUDA error: out of memory'); };
  const r2 = await brain.chatRetry({ model: 'big:latest', messages: [], signal: sig }, { emit: () => {}, who: 'bob' }).then(() => 'ok', () => 'failed');
  check('201 ...only once a job', r2 === 'failed' && !used.includes('main:latest'), used.join());
}

// 198 / 200 / 206 / 207 through a real tool (read_file on a missing file)
{
  const missing = path.join(innDir, 'nope.txt');
  let script = [call('read_file', { path: missing }), call('read_file', { path: missing + '2' }), call('read_file', { path: missing + '3' }), call('read_file', { path: missing + '4' }), { role: 'assistant', content: 'It is not there.' }];
  chatImpl = async () => script.shift() || { role: 'assistant', content: 'Done.' };
  const msgs = [];
  logs.length = 0;
  const before = brain.errorTally.today().read_file || 0;
  await brain.runOn(msgs, 'read nope.txt', () => {}, new AbortController().signal, [], null, 'tools-1');
  const results = msgs.filter((m) => m.role === 'tool' && m.tool_name === 'read_file').map((m) => m.content);
  check('198 the tool\'s error is plain words with what to try next', /^Error: ".*nope\.txt" isn't there\. Next: check the name and folder with list_files/.test(results[0] || ''), results[0]);
  check('198 ...and the guessed hint isn\'t added on top', !/\(Hint:/.test(results[0] || ''));
  check('200 the second failure isn\'t set aside yet', !/set aside/.test(results[1] || ''), results[1]);
  check('200 the third failure in a row says it is set aside', results[2]?.includes('failed three times in this job, so it\'s set aside'), results[2]);
  check('200 the fourth call isn\'t run', results[3]?.startsWith('Error: not run. read_file failed three times in this job'), results[3]);
  const last = msgs.at(-1)?.content || '';
  check('200 after the job, one line offers to look at the tool harder and fix it', last.startsWith('It is not there.') && last.endsWith(fixOffer(['read_file'])) && logs.some((l) => /offered to look at read_file after the job/.test(l)), last);
  check('206 each error is counted for its tool today (not the one that wasn\'t run)', (brain.errorTally.today().read_file || 0) - before === 3);
  check('207 the logbook keeps the first error (ENOENT) under the plain words', logs.some((l) => /^error: read_file: ENOENT/.test(l)), logs.join(' | '));
}

// 196: a card nobody answered isn't a no
{
  brain.approvalMs = 30;
  const f = path.join(tmp, 'outside.txt'); // outside the inn: writing it asks first
  cfg.readRoots.push(tmp);
  let script = [call('write_file', { path: f, content: 'x' }), { role: 'assistant', content: 'Waiting for your OK.' }];
  let toolsAfter = null;
  chatImpl = async ({ tools }) => { if (!script.length) return { role: 'assistant', content: 'Done.' }; if (script.length === 1) toolsAfter = tools; return script.shift(); };
  const job = { id: 'card-1', sessionId: 'card-s', text: 'save it', state: 'working', steps: [] };
  brain.queue.push(job);
  const evs = [];
  brain.turns.clear();
  const done = new Promise((r) => { const was = brain.broadcast; brain.broadcast = (ev) => { evs.push(ev); was?.call(brain, ev); if (ev.type === 'done' && ev.turnId === 'card-1') { brain.broadcast = was; r(); } }; });
  brain.startTurn('card-s', 'save it', [], job, 'talk');
  await done;
  const said = brain.session('card-s').find((m) => m.role === 'tool' && m.tool_name === 'write_file')?.content || '';
  check('196 Bob is told it timed out, not that the user said no', said === NO_ANSWER_NOTE('Sam') && !/said no/.test(said.replace("didn't say no", '')), said);
  check('196 the next round has no tools, so he just says so', Array.isArray(toolsAfter) && toolsAfter.length === 0, String(toolsAfter?.length));
  check('196 the job is parked in Tasks, waiting for the OK (not failed, not done)', job.state === 'interrupted' && job.error === NO_ANSWER_PARKED && /timed out with no answer/.test(job.carryOn || ''), `${job.state} ${job.carryOn}`);
  check('196 ...and the chat says so', evs.some((e) => e.type === 'announce' && /Waiting for your OK/.test(e.text)));
  brain.pump = () => {}; // Carry on would start it again at once; here only its state is checked
  check('196 Carry on asks again', brain.retryJob('card-1') && job.pickUp === true);
  brain.queue = brain.queue.filter((j) => j !== job);
  brain.turns.clear();
  brain.approvalMs = 0;
}

// 199: a check that breaks is a broken check, not "all fine"
{
  logs.length = 0;
  const ctx = { get ledger() { throw new Error('ledger gone'); } };
  const v = await brain.checkTool('write_file', {}, 'Saved x.', ctx);
  check('199 a broken check after a tool says "not checked"', v.unchecked === true && /not checked/.test(v.why));
  check('199 ...and the logbook calls it a broken check (an error line)', logs.some((l) => /^error: check of write_file broke, so it wasn't checked: ledger gone/.test(l)), logs.join(' | '));
  const steps = [];
  const ctx2 = { ledger: { step: (k, x) => { steps.push([k, x]); return { done() {} }; } } };
  brain.brokenCheck(ctx2, 'end-of-turn check', new Error('oops'));
  check('199 the job\'s record has it too', steps.some(([k, x]) => k === 'note' && /end-of-turn check broke: not checked/.test(x.what)) && ctx2.ledger.unchecked === 1);
  check('199 the end-of-turn and said-but-not-done checks use it', /brokenCheck\(ctx, 'end-of-turn check'/.test(read('src/brain.js')) && /brokenCheck\(ctx, 'said-but-not-done check'/.test(read('src/brain.js')));
}

// 203: an uncaught error marks a stuck job failed and tells you
{
  const evs = [];
  const was = brain.broadcast;
  brain.broadcast = (ev) => evs.push(ev);
  brain.turns.clear();
  const stuck = { id: 'stuck-1', sessionId: 'stuck-s', text: 'do a thing', state: 'working', steps: [{ state: 'in progress' }] };
  const fine = { id: 'wait-1', sessionId: 'stuck-s', text: 'later', state: 'waiting' };
  brain.queue.push(stuck, fine);
  brain.session('stuck-s').push({ role: 'user', content: 'do a thing', at: Date.now() });
  brain.pump = () => {};
  brain.onUncaught(new Error('timer blew up'));
  check('203 a job left on Working with nothing running is marked failed', stuck.state === 'failed' && /Something broke inside Bob: timer blew up/.test(stuck.error) && stuck.steps[0].state === 'failed');
  check('203 ...and you are told, in the chat too', evs.some((e) => e.type === 'error' && e.sessionId === 'stuck-s') && brain.session('stuck-s').some((m) => m.failed && /timer blew up/.test(m.correction)));
  check('203 a waiting job is left alone', fine.state === 'waiting');
  // A running turn that shows no sign of life after the error is stopped.
  const quiet = { id: 'quiet-1', sessionId: 'q-s', text: 'x', state: 'working', steps: [] };
  const busy = { id: 'busy-1', sessionId: 'b-s', text: 'y', state: 'working', steps: [] };
  brain.queue.push(quiet, busy);
  const c1 = new AbortController(), c2 = new AbortController();
  brain.turns.set('talk', { turnId: 'quiet-1', sessionId: 'q-s', controller: c1, lastEv: Date.now() - 1000 });
  brain.turns.set('side', { turnId: 'busy-1', sessionId: 'b-s', controller: c2, lastEv: Date.now() - 1000 });
  brain.onUncaught(new Error('later'), { quietMs: 40 });
  setTimeout(() => { const t = brain.turns.get('side'); if (t) t.lastEv = Date.now(); }, 10); // this one carries on
  await tick(80);
  check('203 a turn quiet since the error is stopped and marked failed', quiet.state === 'failed' && c1.signal.aborted && !brain.turns.has('talk'));
  check('203 a turn still showing signs of life is left alone', busy.state === 'working' && !c2.signal.aborted);
  check('203 server.js hands uncaught errors to it', (read('src/server.js').match(/brain\.onUncaught\?\.\(e\)/g) || []).length === 2);
  brain.turns.clear();
  brain.queue = brain.queue.filter((j) => ![stuck, fine, quiet, busy].includes(j));
  brain.broadcast = was;
}

// 205: a rented brain that fails falls back once, and the record says the reply came from here
{
  let rentCalls = 0;
  brain.rentals = { current: () => ({ id: 'r1', name: 'Big Rental' }), approved: () => true, view: () => ({ rentals: [] }), turnDone() {}, offer() {},
    chat: async (r, { onToken }) => { rentCalls++; onToken('Half an ans'); throw new Error('the machine went away'); } };
  chatImpl = async ({ onToken }) => { onToken?.('Whole answer from here.'); return { role: 'assistant', content: 'Whole answer from here.' }; };
  const job = { id: 'rent-1', sessionId: 'rent-s', text: 'big job', state: 'working', steps: [], rent: true, rentOk: true };
  brain.queue.push(job);
  const evs = [], msgs = [];
  const sig = new AbortController().signal;
  const steps = [];
  brain.gate.track(sig, { step: (k, x) => { steps.push([k, x]); return { done() {} }; }, actions: [] });
  await brain.runOn(msgs, 'big job', (e) => evs.push(e), sig, [], job, 'rent-s');
  check('205 the rented brain is tried once, then this computer answers', rentCalls === 1 && msgs.at(-1)?.content === 'Whole answer from here.', `${rentCalls} ${msgs.at(-1)?.content}`);
  check('205 its half answer is taken back, so nothing shows twice', evs.some((e) => e.type === 'token-undo' && e.chars === 'Half an ans'.length));
  check('205 the record says the reply came from here', job.ranHere === true && msgs.at(-1).ranHere === true && brain.queueView().find((j) => j.id === 'rent-1')?.ranHere === true && brain.queueView().find((j) => j.id === 'rent-1')?.status !== 'rented');
  brain.queue = brain.queue.filter((j) => j !== job);
}

// 202: a lender Bob that fails twice is skipped for an hour
{
  let now = 1_000_000;
  let hellos = 0;
  const fetchFn = async (url) => {
    if (/hello/.test(url)) { hellos++; return new Response(JSON.stringify({ lend: true, brain: 'Quick' }), { status: 200, headers: { 'content-type': 'application/json' } }); }
    throw new TypeError('fetch failed', { cause: Object.assign(new Error('x'), { code: 'ECONNRESET' }) });
  };
  const L = new Lenders({ share: { borrow: { bobs: [{ name: 'Laptop', address: '100.64.0.2:7777', passcode: '123456' }] } } }, { fetchFn, now: () => now });
  const skipped = [];
  L.onSkip = (bob, why) => skipped.push(`${bob.name} ${why}`);
  const bob = (await L.pick())?.address ? { name: 'Laptop', address: '100.64.0.2:7777' } : null;
  check('202 a lender that answers is picked', Boolean(bob));
  await L.chat(bob, { messages: [], signal: new AbortController().signal }).catch(() => {});
  now += 61000;
  check('202 one failure: still asked', Boolean(await L.pick()));
  L.release(bob.address);
  await L.chat(bob, { messages: [], signal: new AbortController().signal }).catch(() => {});
  now += 61000;
  const h0 = hellos;
  check('202 two failures: skipped, and not even knocked on', (await L.pick()) === null && hellos === h0 && skipped.length === 1, `${skipped} ${hellos - h0}`);
  now += SKIP_MS;
  check('202 asked again after the hour', Boolean(await L.pick()));
  // Saying busy is a polite no, not a failure.
  const L2 = new Lenders({ share: { borrow: { bobs: [{ name: 'Go', address: '100.64.0.3:7777' }] } } }, { fetchFn, now: () => now });
  L2.markDown({ address: '100.64.0.3:7777' }, 'gaming'); L2.markDown({ address: '100.64.0.3:7777' }, 'gaming');
  check('202 "busy" twice isn\'t a failure', !L2.skipped('100.64.0.3:7777'));
}

// 194: a web look-up that got 503 goes once more
{
  let n = 0;
  const fetchImpl = async () => (++n === 1 ? new Response('busy', { status: 503 }) : new Response('<html>ok</html>', { status: 200 }));
  const r = await fetchRetry('https://example.com', {}, null, { fetchImpl, waitMs: () => 5 });
  check('194 web: a 503 is tried once more', r.status === 200 && n === 2);
  n = 0;
  const all503 = async () => { n++; return new Response('busy', { status: 503 }); };
  const r2 = await fetchRetry('https://example.com', {}, null, { fetchImpl: all503, waitMs: () => 5 });
  check('194 web: only once', r2.status === 503 && n === 2);
  n = 0;
  const timeout = async () => { n++; throw Object.assign(new Error('t'), { name: 'TimeoutError' }); };
  check('194 web: a time-out isn\'t tried again', await fetchRetry('https://example.com', {}, null, { fetchImpl: timeout, waitMs: () => 5 }).then(() => false, () => n === 1));
}

// No standing words added to the start-of-job prompt.
{
  const src = read('src/retry.js');
  check('no switch: these are always on', !/cfg\.|settings/.test(src.replace(/\/\/.*$/gm, '')));
  const sys = [];
  chatImpl = async ({ messages }) => { sys.push(messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n')); return { role: 'assistant', content: 'Hi.' }; };
  brain.rentals = { current: () => null, view: () => ({ rentals: [] }), turnDone() {} };
  await brain.runOn([], 'hello', () => {}, new AbortController().signal, [], null, 'quiet-start');
  check('nothing new in the start-of-job prompt', !/set aside|failed three times|timed out|first error|Next:|🔧/.test(sys.join('\n')));
}

fs.rmSync(tmp, { recursive: true, force: true });
// 1.5.210 (208 PC check): a made-up address is the address's fault, not a strike.
check('an address that doesn\'t exist is not the tool\'s fault', badAddress('Error: getaddrinfo ENOTFOUND bob-test.invalid') && badAddress('Error: fetch failed (could not resolve host)') && badAddress('Error: that page came back 404 Not Found') && !badAddress('Error: the page timed out') && !badAddress('Error: Unexpected token in JSON'));
check('...and the loop skips the strike and the daily count for it', /if \(!v\.declined && !\(!ok && badAddress\(text\)\)\)/.test(fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8')));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
