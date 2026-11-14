// Timeouts and hangs (reliability items 208-217, src/hang-guard.js): always on. Plain checks first, then the engine
// with a scripted llama-server (fetch is faked: nothing here reaches a real engine, card or network).
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import {
  firstWordMs, learnReadSpeed, FIRST_WORD_MIN_MS, FIRST_WORD_MAX_MS, replyEnd, CUT_CALL, CUT_REPLY_NOTE, EARLY_END,
  trackChild, survivors, afterStop, _resetTracked, TimerBag, timersFor, raceTimeout, loadDeadline, awakeTimeout,
  startWatchdog, frozeLine, deadline, quietGuard
} from '../src/hang-guard.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { Ollama } from '../src/ollama.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const keepAlive = setInterval(() => {}, 1000); // the engine's timers don't hold the process open (as in Bob)
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hang-'));
const src = (f) => fs.readFileSync(new URL(`../src/${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---------- 208: the first word ----------
check('208 a short chat on the card gets the 3-minute floor', firstWordMs({ promptTokens: 500 }) === FIRST_WORD_MIN_MS);
check('208 a long chat on the processor gets longer', firstWordMs({ promptTokens: 30000, cpu: true }) > firstWordMs({ promptTokens: 30000 }));
check('208 never more than 30 minutes', firstWordMs({ promptTokens: 1e7, cpu: true }) === FIRST_WORD_MAX_MS);
check('208 a brain measured as fast waits less than the guess', firstWordMs({ promptTokens: 100000, readPerSec: 2000 }) < firstWordMs({ promptTokens: 100000 }));
check('208 over Wi-Fi (spread) it doubles', firstWordMs({ promptTokens: 500, spread: true }) === 2 * FIRST_WORD_MIN_MS);
check('208 config.json can set it outright', firstWordMs({ promptTokens: 1e6, seconds: 7 }) === 7000);
check('208 reading speed learned from long reads only', learnReadSpeed(0, { prompt_n: 100, prompt_per_second: 999 }) === 0 && learnReadSpeed(0, { prompt_n: 2000, prompt_per_second: 800 }) === 800);
check('208 reading speed smoothed', learnReadSpeed(800, { prompt_n: 2000, prompt_per_second: 100 }) === 590);

// ---------- 210, 211: how a reply ended ----------
check('211 end mark: ok', replyEnd({ done: true }) === 'ok');
check('211 a reason but no end mark: ok', replyEnd({ finish: 'stop' }) === 'ok');
check('211 neither: early', replyEnd({}) === 'early');
check('210 length wins', replyEnd({ done: true, finish: 'length' }) === 'length');
check('210 the cut-call line is one line and names the tool', !CUT_CALL('write_file').includes('\n') && CUT_CALL('write_file').includes('write_file') && CUT_CALL('x').startsWith('(Not run'));

// ---------- 215: timers ----------
{
  const bag = new TimerBag();
  let fired = 0;
  bag.set(() => fired++, 30); bag.set(() => fired++, 40);
  const left = bag.close();
  await wait(70);
  check('215 closing the bag clears what waits', left === 2 && fired === 0);
  check('215 a closed bag takes no new timers', bag.set(() => fired++, 1) === null);
  const sig = new AbortController().signal;
  check('215 one bag per turn', timersFor(sig) === timersFor(sig));
  const t0 = Date.now();
  const v = await raceTimeout(Promise.resolve(5), 10_000, 0);
  check('215 raceTimeout gives the answer and doesn\'t wait', v === 5 && Date.now() - t0 < 1000);
  check('215 raceTimeout falls back', (await raceTimeout(new Promise(() => {}), 20, 'late')) === 'late');
  check('215 the brain uses raceTimeout, not bare Promise.race timers', !/Promise\.race\(\[[^\]]*setTimeout/.test(brainText()));
}

// ---------- 216: long loads ----------
check('216 never loaded: the full limit', JSON.stringify(loadDeadline(0, 300)) === JSON.stringify({ soft: 300, hard: 300 }));
check('216 usually 40 s: stopped at 80 s', loadDeadline(40, 300).soft === 80);
check('216 usually 5 s: at least 30 s', loadDeadline(5, 300).soft === 30);
check('216 never past the hard limit', loadDeadline(200, 300).soft === 300);

// ---------- 217: card time-outs don't count sleep ----------
{
  let clock = 0, fired = false;
  const h = awakeTimeout(() => { fired = true; }, 100, { tick: 10, now: () => clock });
  // The PC sleeps for an hour: one tick's worth counts, not an hour.
  clock += 3_600_000;
  await wait(25);
  check('217 an hour asleep doesn\'t end a 10-minute card', !fired && h.spent() <= 20, String(h.spent()));
  for (let i = 0; i < 12 && !fired; i++) { clock += 10; await wait(12); }
  check('217 awake time still runs out', fired);
  let f2 = false;
  const bag = new TimerBag();
  awakeTimeout(() => { f2 = true; }, 30, { tick: 5, bag });
  check('217/215 the card timer goes in the turn\'s bag', bag.close() === 1);
  await wait(60);
  check('217/215 and is cleared with it', !f2);
  check('217 approval, ask_user and busy-card choice cards use it', (brainText().match(/awakeTimeout\(\(\) => (?:\{ out\.timedOut = true; )?done\(false\)(?:; \})?, (?:this\.approvalMs \|\| )?APPROVAL_TIMEOUT_MS/g) || []).length === 3);
}

// ---------- 212: deadlines ----------
{
  const d = deadline(null, 20);
  await wait(50);
  check('212 a deadline ends', d.aborted);
  const outer = new AbortController();
  const d2 = deadline(outer.signal, 10_000); outer.abort();
  check('212 and ends with the caller', d2.aborted);
  const q = quietGuard(null, 40);
  await wait(25); q.poke(); await wait(25);
  check('212 a download that keeps coming isn\'t stopped', !q.signal.aborted);
  await wait(60);
  check('212 one that goes quiet is', q.signal.aborted && q.quiet());
  q.done();
  for (const [f, rx] of [['github-update.js', /withDeadline\(signal, 30_000\)/], ['models.js', /quietGuard\(signal\)/], ['engines.js', /quietGuard\(signal\)/], ['ollama.js', /withDeadline\(signal/], ['telegram.js', /withDeadline\(signal/], ['discord.js', /withDeadline\(null, form \? 120_000 : 30_000\)/]]) check(`212 ${f} has its deadline`, rx.test(src(f)));
}

// ---------- 213: Stop really stops ----------
{
  _resetTracked();
  const child = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, pid: 1 });
  const done = Object.assign(new EventEmitter(), { exitCode: null, signalCode: null, pid: 2 });
  const job = new AbortController();
  trackChild(child, job.signal, 'npm'); trackChild(done, job.signal, 'git');
  check('213 nothing counts before Stop', survivors().length === 0);
  job.abort();
  done.exitCode = 0; done.emit('exit', 0);
  const killed = [], lines = [];
  let reset = 0;
  const forced = await afterStop({ waitMs: 5, kill: (c) => killed.push(c.pid), log: (k, t) => lines.push(t), engine: { busy: () => true, reset: async () => { reset++; } } });
  check('213 the one still running is forced, the one that ended isn\'t', killed.length === 1 && killed[0] === 1 && forced.includes('npm') && !forced.includes('git'));
  check('213 an engine still busy with a stopped reply is restarted', reset === 1 && forced.includes('the engine'));
  check('213 the logbook says so', lines.some((l) => /npm still running/.test(l)));
  check('213 commands and made tools are tracked', /trackChild\(child, signal/.test(src('hands-run.js')) && /trackChild\(child, signal/.test(src('selftools.js')));
  const lc = new LlamaCpp({ agentDir: '.', dataDir: tmp, llamacpp: {} });
  const a = new AbortController();
  lc.inflight = new Set([{ signal: a.signal }]);
  check('213 engine: a live reply isn\'t stuck', !lc.stuckAfterStop());
  a.abort();
  check('213 engine: a stopped one still in flight is', lc.stuckAfterStop());
}

// ---------- 214: the watchdog ----------
{
  const logbook = path.join(tmp, 'logbook.md');
  fs.writeFileSync(logbook, '');
  let back = null;
  const w = startWatchdog({ logbook, stuckMs: 1000, beatMs: 100, checkMs: 200, onBack: (m) => { back = m; } });
  await wait(400);
  const end = Date.now() + 2600; while (Date.now() < end) { /* the server is stuck */ }
  await wait(900);
  w.stop();
  check('214 a stuck server is noted in the logbook', /\| watchdog \| Bob's server hasn't answered for \d+ s/.test(fs.readFileSync(logbook, 'utf8')), fs.readFileSync(logbook, 'utf8'));
  check('214 and when it\'s back, the window hears how long', back && back.secs >= 2, JSON.stringify(back));
  check('214 the line says so plainly', /^I froze for about 3 seconds/.test(frozeLine(3)) && /4 minutes/.test(frozeLine(240)));
  const server = src('server.js'), app = publicText('app.js');
  check('214 the events send a beat the window watches', /"type":"beat"/.test(server) && /Date\.now\(\) - heard > 65000/.test(app) && /ev\.type === 'froze'/.test(app));
}

// ---------- the engine: first word, stalls, cut-off and early ends ----------
const realFetch = globalThis.fetch;
const sse = (evs, end = true) => evs.map((e) => `data: ${JSON.stringify(e)}\n\n`).join('') + (end ? 'data: [DONE]\n\n' : '');
const tools = [{ type: 'function', function: { name: 'write_file', parameters: { type: 'object', properties: { path: { type: 'string' } } } } }];
const engine = () => {
  const lc = new LlamaCpp({ agentDir: '.', dataDir: tmp, llamacpp: {} });
  lc.templateRead = new Set(['m']);
  return lc;
};
{
  globalThis.fetch = async () => new Response(sse([{ choices: [{ delta: { content: 'Half an ans' } }] }], false));
  const lc = engine();
  let err = '';
  try { await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }] }); } catch (e) { err = e.message; }
  check('211 a stream with no end mark is not taken as whole', err === EARLY_END && /^terminated/.test(err), err);

  globalThis.fetch = async () => new Response(sse([{ choices: [{ delta: { content: 'All' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }] }]));
  const ok = await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
  check('211 a whole one is', ok.content === 'All' && !ok.cut);

  globalThis.fetch = async () => new Response(sse([{ choices: [{ delta: { content: 'A long answer that' } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }]));
  const cut = await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
  check('210 an answer at the length limit is marked', cut.cut === 'length' && cut.content === 'A long answer that');

  globalThis.fetch = async () => new Response(sse([{ choices: [{ delta: { tool_calls: [{ index: 0, function: { name: 'write_file', arguments: '{"path": "a.txt", "content": "half of' } }] } }] }, { choices: [{ delta: {}, finish_reason: 'length' }] }]));
  const call = await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools });
  check('210 a tool call cut part way is marked and never kept for mending', call.tool_calls?.[0].cut === true && call.tool_calls[0].function.raw === undefined, JSON.stringify(call));

  globalThis.fetch = async () => new Response(sse([{ choices: [{ delta: { content: 'hi' } }], timings: { prompt_n: 4000, prompt_per_second: 1200, predicted_n: 1 } }]));
  await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }] });
  check('208 the engine learns how fast the brain reads', lc.readSpeed.m === 1200);
}
{
  // 208 + 209: a brain that never sends a first word is let go, alone.
  globalThis.fetch = (url, o) => new Promise((_, no) => o.signal.addEventListener('abort', () => no(Object.assign(new Error('aborted'), { name: 'AbortError' }))));
  const lc = engine();
  lc.cfg.llamacpp = { firstWordSeconds: 0.05 };
  let stopped = 0, all = 0, side = 0;
  lc.stopServer = async () => { stopped++; };
  lc.unloadAll = async () => { all++; };
  lc.dropBeside = async () => { side++; };
  lc.embedServer = { stop: () => { all++; } };
  let err = '';
  try { await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }] }); } catch (e) { err = e.message; }
  check('208 no first word in time: stopped, and "terminated" so it is asked again', /^terminated: the brain sent no first word/.test(err), err);
  check('209 only the stalled brain is let go (not the Quick brain or meaning search)', stopped === 1 && all === 0 && side === 0);
  // While another reply holds the engine, this one may be waiting its turn: not timed.
  lc.active = 2;
  const user = new AbortController();
  setTimeout(() => user.abort(), 150);
  err = '';
  try { await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }], signal: user.signal }); } catch (e) { err = e.message; }
  check('208 not timed while another reply holds the engine', stopped === 1 && !/first word/.test(err), err);
}
{
  // Ollama: no "done" line means the reply was cut short.
  globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: 'par' } }) + '\n');
  const ol = new Ollama({ ollamaUrl: 'http://127.0.0.1:1', dataDir: tmp });
  ol.thinkField = async () => undefined;
  let err = '';
  try { await ol.chatOnce({ model: 'm', messages: [] }); } catch (e) { err = e.message; }
  check('211 Ollama: no done line is not a whole reply', err === EARLY_END, err);
  globalThis.fetch = async () => new Response(JSON.stringify({ message: { content: 'long' } }) + '\n' + JSON.stringify({ done: true, done_reason: 'length' }) + '\n');
  const r = await ol.chatOnce({ model: 'm', messages: [] });
  check('210 Ollama: done at the length limit is marked', r.cut === 'length');
}
globalThis.fetch = realFetch;

// ---------- the loop: cut calls and cut answers ----------
{
  const logs = [];
  const fake = { helpOff: () => false, tools: { write_file: { schema: tools[0] } }, log: (k, t) => logs.push(t) };
  const calls = [{ function: { name: 'write_file', arguments: {} }, cut: true }, { function: { name: 'write_file', arguments: { path: 'b.txt' } } }];
  Brain.prototype.mendCalls.call(fake, calls, {});
  check('210 the cut call isn\'t run; one line goes back', calls[0].bounce === CUT_CALL('write_file') && !calls[0].cut);
  check('210 the whole call beside it still runs', !calls[1].bounce);
  const offFake = { ...fake, helpOff: () => true };
  const c2 = [{ function: { name: 'write_file', arguments: {} }, cut: true }];
  Brain.prototype.mendCalls.call(offFake, c2, {});
  check('210 even with Better tool calling off', c2[0].bounce === CUT_CALL('write_file'));
  const evs = [];
  const reply = { role: 'assistant', content: 'A long', cut: 'length' };
  Brain.prototype.cutNote.call(fake, reply, (e) => evs.push(e));
  check('210 a cut answer gets a note under it, for the person only', evs[0]?.type === 'correction' && evs[0].text === CUT_REPLY_NOTE && reply.correction === CUT_REPLY_NOTE && !('cut' in reply));
  const plain = { role: 'assistant', content: 'Fine' };
  Brain.prototype.cutNote.call(fake, plain, (e) => evs.push(e));
  check('210 a whole answer gets nothing', evs.length === 1 && !plain.correction);
}

// ---------- nothing added to what the brain reads at the start ----------
{
  const b = brainText();
  check('no new start-of-job words: the notes go only where a check fires', !/CUT_REPLY_NOTE[^\n]*role: 'system'/.test(b) && !/hang-guard[^\n]*system prompt/i.test(b));
}

clearInterval(keepAlive);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
