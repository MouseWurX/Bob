// The Conductor (src/conductor.js, Engine tuning "Let the Conductor drive"; off unless picked): the plan for each
// reply, what it learns, when it stops, the start line, and one real switch against a fake engine that records what
// Bob asks it (save the reading, change the step, put the reading back, read ahead, back to the chat step).
// Nothing here reads the real computer: the engine is a small local fake.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { LlamaCpp } from '../src/llamacpp.js';
import { conductorOn, conductorPlan, learnStep, speedAt, noteSwitch, switchGuess, planLine, readStepFor, CHAT_STEP, READ_STEP, BIG_STEP, expectOut, cacheGrow, freeFrom, CACHE_FLIP_MAX } from '../src/conductor.js';
import { cleanTuning, mergeTuning } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-conductor-'));

// ---------- Off by default ----------
check('off in a fresh Bob, on only when picked', !conductorOn({}) && !conductorOn({ engineTuning: { mode: 'bob' } }) && conductorOn({ engineTuning: { mode: 'conductor' } }));
check('the mode is kept when saved', cleanTuning(mergeTuning(undefined, { mode: 'conductor' })).mode === 'conductor' && cleanTuning({ mode: 'drive' }).mode === 'bob');

// ---------- Speeds ----------
const sp = learnStep(learnStep(undefined, 'read', 2048, 2657), 'write', 2048, 109.8);
check('a step it has not seen is worked out from one it has', Math.round(speedAt(sp, 'read', 4096)) === Math.round(2657 * 1.41) && speedAt(sp, 'write', 6144) < 109.8);
check('nothing known gives 0', speedAt(undefined, 'read', 2048) === 0);
check('learning is a running mean', Math.round(learnStep(sp, 'read', 2048, 3657).read[2048]) === Math.round(2657 * 0.7 + 3657 * 0.3));
check('nonsense speeds are ignored', learnStep(sp, 'read', 2048, NaN).read[2048] === 2657 && learnStep(sp, 'read', 0, 99).read[0] === undefined);
check('the read step grows at 128K', readStepFor(1000) === READ_STEP && readStepFor(140000) === BIG_STEP);

// ---------- The plan ----------
// speeds where the big steps write much slower (an older measurement), so reading big and writing small pays
const known = learnStep(learnStep(learnStep(learnStep(sp, 'read', 4096, 3638), 'write', 4096, 70), 'read', 6144, 3724), 'write', 6144, 65);
// the switch test's own numbers (Nov 19, 32K): bigger steps read much faster and write about the same
const measured = { read: { 2048: 2657, 4096: 3746, 6144: 4600 }, write: { 2048: 78, 4096: 78, 6144: 75 } };
check('a short message stays put', conductorPlan({ newTok: 200, cachedTok: 5000, outTok: 300, cur: CHAT_STEP, speeds: known }).plan === 'stay');
{ const p = conductorPlan({ newTok: 80000, cachedTok: 0, outTok: 1500, cur: CHAT_STEP, speeds: known, switchS: 0.5 });
  check('a long new read is read big, then written at the chat step', p.plan === 'readBig' && p.step === BIG_STEP && p.est < p.stayEst, JSON.stringify(p)); }
check('with slow switches it stays put', conductorPlan({ newTok: 8000, outTok: 300, cur: CHAT_STEP, speeds: known, switchS: 5 }).plan === 'stay');
{ const m = conductorPlan({ newTok: 60000, outTok: 1500, cur: CHAT_STEP, speeds: measured, switchS: 1.2 });
  check('with the measured speeds a long read moves to step 6144 and stays (one switch beats two)', m.plan === 'big' && m.step === BIG_STEP, JSON.stringify(m)); }
check('with the measured speeds a short message at the big step stays there', conductorPlan({ newTok: 100, cachedTok: 30000, outTok: 300, cur: BIG_STEP, speeds: measured, switchS: 1.2 }).plan === 'stay');
check('nothing switches before any speed is known', conductorPlan({ newTok: 30000, cur: CHAT_STEP }).plan === 'stay');
check('a big step with a short message goes back to the chat step', conductorPlan({ newTok: 100, cachedTok: 30000, outTok: 3000, cur: READ_STEP, speeds: known, switchS: 0.3 }).plan === 'back');
check('at 128K it reads at the bigger step', conductorPlan({ newTok: 60000, cachedTok: 90000, outTok: 300, cur: CHAT_STEP, speeds: known, switchS: 0.5 }).step === BIG_STEP);
check('the logbook line is plain', /Conductor: reading at step 4096, then writing at the chat step/.test(planLine('big', { plan: 'readBig', step: 4096, why: 'x' })) && planLine('big', { plan: 'stay' }) === '');

// ---------- Switch time ----------
check('the switch guess grows with the chat memory: about 0.9 s at 32K, 2.4 s at 123K', Math.abs(switchGuess(32768) - 0.9) < 0.05 && Math.abs(switchGuess(122880) - 2.4) < 0.05);
check('a brain whose switches ran twice as long guesses twice as long', Math.abs(switchGuess(32768, noteSwitch(undefined, { seconds: 1.8, guess: 0.9, held: 32768 }).ratio) - 1.8) < 0.01);

// ---------- Stopping ----------
{ let st;
  for (let i = 0; i < 3; i++) st = noteSwitch(st, { seconds: 3, guess: 0.6 });
  check('three switches slower than guessed in a row stop it for that brain', st.stopped && st.slow === 3);
  let ok = noteSwitch(noteSwitch(undefined, { seconds: 3, guess: 0.6 }), { seconds: 0.5, guess: 0.6 });
  check('a switch on time resets the count', !ok.stopped && ok.slow === 0 && ok.switchS > 0); }

// ---------- The start line ----------
const big = path.join(tmp, 'big.gguf');
fs.writeFileSync(big, 'x');
const engineOf = (extra = {}, lc = {}) => { const e = new LlamaCpp({ agentDir: tmp, dataDir: tmp, ...extra, llamacpp: { models: { big }, ...lc } }); clearInterval(e.idleTimer); return e; };
{ const off = engineOf(); const a = off.buildArgs('big');
  check('no Conductor and no save place while it is off', !off.condChat && !a.includes('--slot-save-path'));
  const on = engineOf({ engineTuning: { mode: 'conductor' }, readingSpeed: 'fastest' }); const b = on.buildArgs('big');
  check('on: a place to save the reading, and the start step is the chat step', b.includes('--slot-save-path') && on.condChat === Number(b[b.lastIndexOf('-ub') + 1]), b.join(' '));
  const handSet = engineOf({ engineTuning: { mode: 'conductor' } }, { ubatch: 1024 }); handSet.buildArgs('big');
  check('a step set by hand means no Conductor', !handSet.condChat);
  const cpu = engineOf({ engineTuning: { mode: 'conductor' } }); cpu.buildArgs('big', { cpu: true });
  check('not on the processor', !cpu.condChat); }

// ---------- One reply against a fake engine ----------
const calls = [];
let refuse = false, freeMiB = null;
const srv = http.createServer((req, res) => {
  let body = '';
  req.on('data', (c) => (body += c));
  req.on('end', () => {
    calls.push(`${req.method} ${req.url}${req.url === '/context' ? ' ' + body : ''}${req.url === '/v1/chat/completions' ? ' ' + JSON.parse(body).max_tokens : ''}`);
    if (req.url === '/context' && refuse) { res.writeHead(404); return res.end('no'); }
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.url === '/v1/chat/completions') return res.end(JSON.stringify({ choices: [{ message: { content: '.' } }], timings: { prompt_n: 30000, prompt_per_second: 3600, cache_n: 0 } }));
    res.end(req.url === '/context' && freeMiB != null ? JSON.stringify({ devices: [{ name: 'CUDA0', free_mib: freeMiB, total_mib: 16303 }] }) : '{}');
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const port = srv.address().port;
const live = (extra = {}) => {
  const e = engineOf({ engineTuning: { mode: 'conductor' }, ...extra });
  e.buildArgs('big');
  Object.assign(e, { url: `http://127.0.0.1:${port}`, current: 'big', child: { exitCode: null }, loadedOk: true, slotDir: tmp, active: 1, condStep: e.condChat, condHeld: 2000 });
  e.condSpeeds = { big: known };
  e.perToken = {};
  e.logs = []; e.log = (_k, m) => e.logs.push(m);
  return e;
};
const longMsg = [{ role: 'user', content: 'x'.repeat(240000) }];
{ const e = live();
  e.condChat = CHAT_STEP; e.condStep = CHAT_STEP;
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  const seq = calls.map((c) => c.replace(/ \{.*\}/, (m) => m.includes('6144') ? ' 6144' : m.includes('2048') ? ' 2048' : m));
  check('a long read: save, big step, put back, read ahead one word, save, chat step, put back',
    JSON.stringify(seq) === JSON.stringify(['POST /slots/0?action=save', 'POST /context 6144', 'POST /slots/0?action=restore', 'POST /v1/chat/completions 1', 'POST /slots/0?action=save', 'POST /context 2048', 'POST /slots/0?action=restore']), JSON.stringify(calls));
  check('it ends at the chat step and says so in the logbook', e.condStep === CHAT_STEP && e.logs.some((l) => /Conductor: step 6144 in/.test(l)));
  check('the read-ahead taught it the big step\'s read speed', e.condSpeeds.big.read[6144] !== known.read[6144]); }
{ calls.length = 0; const e = live(); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP;
  await e.conduct({ model: 'big', messages: [{ role: 'user', content: 'hi' }] });
  check('a short message asks the engine nothing', calls.length === 0); }
{ calls.length = 0; refuse = true; const e = live(); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP;
  await e.conduct({ model: 'big', messages: longMsg }).catch((x) => e.condStop('big', x.message));
  check('an engine that refuses turns it off for the run, and the reply goes ahead', Boolean(e.condOff) && e.logs.some((l) => /Conductor off for this engine run/.test(l)));
  calls.length = 0; await e.conduct({ model: 'big', messages: longMsg });
  check('once off it asks nothing more', calls.length === 0); refuse = false; }
{ calls.length = 0; const e = live({ }); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.active = 2;
  await e.conduct({ model: 'big', messages: longMsg });
  check('never while another reply holds the engine', calls.length === 0);
  e.active = 1; e.spreadNow = true; await e.conduct({ model: 'big', messages: longMsg });
  check('never while spread over other Bobs\' cards', calls.length === 0); }
// ---------- The cache grown for writing (Nov 20, the owner's idea) ----------
check('long replies are expected with thinking or a code or file job', expectOut({ think: true }) === 2500 && expectOut({ task: 'code' }) === 1500 && expectOut({}) === 300);
check('the cache grows by what the card has free, up to 2 GB, keeping 768 MiB', cacheGrow({ total: 30000, outTok: 2500, cacheMiB: 4096, freeMiB: 5000 }) === 2048 && cacheGrow({ total: 30000, outTok: 2500, cacheMiB: 4096, freeMiB: 2000 }) === 1024);
check('it doesn\'t grow for a short reply, a long chat, no cache, unknown free memory, little room or when already grown',
  [{ outTok: 300 }, { total: CACHE_FLIP_MAX }, { cacheMiB: 0 }, { freeMiB: null }, { freeMiB: 1200 }, { grown: 1024 }].every((o) => cacheGrow({ total: 30000, outTok: 2500, cacheMiB: 4096, freeMiB: 5000, ...o }) === 0));
check('the free memory comes from the engine\'s answer (the tightest card), or null', freeFrom({ devices: [{ free_mib: 3000 }, { free_mib: 2500 }] }) === 2500 && freeFrom({}) === null);
{ calls.length = 0; freeMiB = 3000; const e = live({ engineTuning: { mode: 'conductor', growGuess: true } }); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.condCacheBase = 4096; e.condHeld = 0;
  const msg = [{ role: 'user', content: 'x'.repeat(3000) }];
  await e.conduct({ model: 'big', messages: msg, think: true });
  const ctx = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)).moe_cache_mib);
  check('thinking on: asks the free memory once, reads at the reading cache, then writes with it grown', JSON.stringify(ctx) === '[4096,6144]' && calls.some((c) => c === 'POST /v1/chat/completions 1') && e.condGrown === 2048, JSON.stringify(calls));
  check('it says so in the logbook', e.logs.some((l) => /copy cache grows from 4096 to 6144 MiB/.test(l)));
  calls.length = 0; e.condHeld = 1000;
  await e.conduct({ model: 'big', messages: longMsg });
  const back = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)).moe_cache_mib);
  check('a long read next: the cache goes back to the reading size first', back[0] === 4096 && e.condGrown === 0, JSON.stringify(calls));
  calls.length = 0; freeMiB = null; const old = live({ engineTuning: { mode: 'conductor', growGuess: true } }); old.condChat = CHAT_STEP; old.condStep = CHAT_STEP; old.condCacheBase = 4096; old.condHeld = 0;
  await old.conduct({ model: 'big', messages: msg, think: true });
  check('an engine that doesn\'t report free memory never grows the cache', !calls.some((c) => /moe_cache_mib":6144/.test(c)) && !old.condGrown, JSON.stringify(calls)); }
{ calls.length = 0; freeMiB = 3000; const e = live(); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.condCacheBase = 4096; e.condHeld = 0;
  await e.conduct({ model: 'big', messages: [{ role: 'user', content: 'x'.repeat(3000) }], think: true });
  check('growing on a guess is off unless the test switch is set (job replies are short: median 81 tokens with thinking)', !calls.some((c) => /moe_cache_mib/.test(c)) && !e.condGrown, JSON.stringify(calls)); freeMiB = null; }
srv.close();

// ---------- Settings, Help, FAQ, glossary ----------
check('Settings offers "Let the Conductor drive"', /radio\('conductor', 'Let the Conductor drive'\)/.test(read('public/cellar-engines.js')));
check('Settings Help names it', /Let the Conductor drive/.test(HELP.find((h) => h.id === 'settings-speed')?.html || ''));
check('the FAQ answers it and says where it works', /Android app/.test(HELP.find((h) => h.id === 'faq-conductor' && h.group === 'FAQ')?.html || ''));
check('the glossary explains it', /<dt>Conductor<\/dt>/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
