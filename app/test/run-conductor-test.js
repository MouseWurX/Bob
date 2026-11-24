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
import { conductorOn, conductorPicked, conductorDefaultFits, SWITCH_IN_JOB_FROM_BE, condCacheWanted, COND_CACHE_MIB, loadAtReadStep, stepBack, SPILL_MARGIN_MIB, conductorPlan, learnStep, speedAt, noteSwitch, switchGuess, planLine, readStepFor, CHAT_STEP, READ_STEP, BIG_STEP, expectOut, cacheGrow, freeFrom, CACHE_FLIP_MAX, fitWindowOn, fitWindow, nextWindow, windowCacheMiB, WIN_STEP, fillEnv, FILL_FROM_BE, loadAtStep, mtpBlocksSwitch, MTP_SWITCH_FROM_BE, apuStepOk, APU_MAX_STEP, APU_FLOOR, mtpSpareEnv, loadStepBySpeed, cleanSpeeds, LOAD_PICK_MARGIN } from '../src/conductor.js';
import { cleanTuning, mergeTuning } from '../src/engine-tuning.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-conductor-'));

// ---------- Off by default ----------
check('on in a fresh Bob, off when another way is picked', conductorOn({}) && !conductorOn({ engineTuning: { mode: 'bob' } }) && !conductorOn({ engineTuning: { mode: 'hand' } }) && conductorOn({ engineTuning: { mode: 'conductor' } }));
check('switching inside a job comes back with Brain Engine 44', SWITCH_IN_JOB_FROM_BE === 44);
check('faster: a brain of experts bigger than the card gets the copy cache; a dense one or one that fits does not', COND_CACHE_MIB === 4096 && condCacheWanted({ experts: 256, fileBytes: 21e9, cardBytes: 16e9 }) && !condCacheWanted({ experts: 0, fileBytes: 21e9, cardBytes: 16e9 }) && !condCacheWanted({ experts: 128, fileBytes: 4e9, cardBytes: 16e9 }) && !condCacheWanted({ experts: 128, fileBytes: 21e9, cardBytes: 0 }));
check('the laptop check: it loads at the read step only where the engine sizes the card around it', loadAtReadStep({ fills: true }) && !loadAtReadStep({ fills: false }) && !loadAtReadStep());
check('on the fly: a step up that leaves under 512 MiB free goes back down', stepBack({ from: 512, to: 4096, freeMiB: 300 }) === 512 && stepBack({ from: 512, to: 4096, freeMiB: 900 }) === 0 && stepBack({ from: 4096, to: 512, freeMiB: 100 }) === 0 && stepBack({ from: 512, to: 4096, freeMiB: null }) === 0 && SPILL_MARGIN_MIB === 512);
check('the default needs Brain Engine 43, built-in graphics included; a pick covers older engines', conductorDefaultFits({ beNo: 43 }) && !conductorDefaultFits({ beNo: 42 }) && !conductorDefaultFits({ beNo: 0 }) && conductorDefaultFits({ beNo: 44, sharedGraphics: true }) && !conductorPicked({}) && conductorPicked({ engineTuning: { mode: 'conductor' } }));
check('the mode is kept when saved', cleanTuning(mergeTuning(undefined, { mode: 'conductor' })).mode === 'conductor' && cleanTuning({ mode: 'drive' }).mode === 'conductor');

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
  check('on: a place to save the reading, and it loads at the read step (Nov 23), the chat step kept for writing', b.includes('--slot-save-path') && Number(b[b.lastIndexOf('-ub') + 1]) === READ_STEP && on.condChat > 0 && on.condChat <= READ_STEP, b.join(' '));
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
  Object.assign(e, { url: `http://127.0.0.1:${port}`, current: 'big', child: { exitCode: null }, loadedOk: true, slotDir: tmp, active: 1, condStep: e.condChat, condHeld: 2000, condCacheBase: e.condCacheBase || 4096 }); // a copy cache: the Conductor only switches with one (Nov 24)
  e.condSpeeds = { big: known };
  e.perToken = {};
  e.logs = []; e.log = (_k, m) => e.logs.push(m);
  return e;
};
const longMsg = [{ role: 'user', content: 'x'.repeat(240000) }];
{ const e = live();
  e.condChat = CHAT_STEP; e.condStep = CHAT_STEP;
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  // Nov 23: at 32K the biggest step planned for at load is 4096, so the read goes no bigger (it had no room past that)
  const seq = calls.map((c) => c.replace(/ \{.*\}/, (m) => m.includes('4096') ? ' 4096' : m.includes('2048') ? ' 2048' : m));
  check('a long read: save, big step, put back, read ahead one word, save, chat step, put back',
    e.condMax === READ_STEP && JSON.stringify(seq) === JSON.stringify(['POST /slots/0?action=save', 'POST /context 4096', 'POST /slots/0?action=restore', 'POST /v1/chat/completions 1', 'POST /slots/0?action=save', 'POST /context 2048', 'POST /slots/0?action=restore']), JSON.stringify(calls));
  check('it ends at the chat step and says so in the logbook', e.condStep === CHAT_STEP && e.logs.some((l) => /Conductor: step 4096 in/.test(l)));
  check('the read-ahead taught it the big step\'s read speed', e.condSpeeds.big.read[4096] !== known.read[4096]); }
{ calls.length = 0; const e = live(); check('the laptop check: no copy cache fill, so it loads at the chat step', e.condLoad === e.condChat && e.condLoad < READ_STEP, JSON.stringify([e.condLoad, e.condChat])); e.condChat = CHAT_STEP; e.condLoad = READ_STEP; e.condStep = e.condLoad;
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  const ctx = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)).n_ubatch);
  check('Nov 23 gate rerun: loaded at the read step it reads and writes there, no switch down either (BE43 reloads on the first switch)', e.condLoad === READ_STEP && ctx.length === 0 && e.condStep === READ_STEP, JSON.stringify(calls)); }
{ calls.length = 0; const e = live(); e.condChat = CHAT_STEP; e.condStep = e.condLoad; e.tuneEnv = { LLAMA_MOE_CACHE_FILL: '1', LLAMA_MOE_CACHE_FILL_STEP: '4096' };
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  check('Nov 23 gate: with the fill sized for the read step it reads and writes there, no switch at all', calls.length === 0 && e.condStep === e.condLoad, JSON.stringify(calls)); }
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
check('from Brain Engine 42 the fill is sized for the biggest read step', fillEnv({ cacheMiB: 4096, beNo: 42, step: 4096 }).LLAMA_MOE_CACHE_FILL_STEP === '4096' && !fillEnv({ cacheMiB: 4096, beNo: 41, step: 4096 }).LLAMA_MOE_CACHE_FILL_STEP);
check('before Brain Engine 42, no fill next to borrowed reading', !fillEnv({ cacheMiB: 4096, beNo: 41, env: { LLAMA_MOE_CACHE_BORROW: '1' } }).LLAMA_MOE_CACHE_FILL && fillEnv({ cacheMiB: 4096, beNo: 42, env: { LLAMA_MOE_CACHE_BORROW: '1' } }).LLAMA_MOE_CACHE_FILL === '1');
check('the brain loads at the read step, -b at least that', loadAtStep(['-m', 'x', '-ub', '2048', '-b', '8192'], 4096).join(' ') === '-m x -ub 4096 -b 8192' && loadAtStep(['-m', 'x'], 4096).join(' ') === '-m x -ub 4096 -b 4096');
check('no read step past the one planned for at load', conductorPlan({ newTok: 30000, outTok: 300, cur: 2048, chat: 2048, speeds: { read: { 2048: 1000, 4096: 1400, 6144: 1700 }, write: { 2048: 80, 4096: 80, 6144: 77 } }, switchS: 0.5, maxStep: 4096 }).step <= 4096);
check('at a big step with a long read: read there, then one switch down to write', (() => { const p = conductorPlan({ newTok: 30000, outTok: 2000, cur: 4096, chat: 2048, speeds: { read: { 2048: 1000, 4096: 1400 }, write: { 2048: 90, 4096: 70 } }, switchS: 0.5, maxStep: 4096 }); return p.plan === 'readBig' && p.step === 4096; })());
check('with MTP on, no step switch before Brain Engine 43 (0086)', MTP_SWITCH_FROM_BE === 43 && mtpBlocksSwitch(['-m', 'x', '--spec-type', 'draft-mtp'], 42) && !mtpBlocksSwitch(['--spec-type', 'draft-mtp'], 43));
check('without MTP, or with another draft, the Conductor switches on any engine', !mtpBlocksSwitch(['-m', 'x'], 39) && !mtpBlocksSwitch(['--spec-type', 'ngram-simple'], 39) && !mtpBlocksSwitch(undefined, 0));
check('built-in graphics: a bigger step only while 1.5 GB stays free, and never past 2048', APU_MAX_STEP === 2048 && APU_FLOOR === 1.5 * 1024 ** 3 &&
  apuStepOk({ from: 512, to: 2048, freeBytes: 4 * 1024 ** 3 }) && !apuStepOk({ from: 512, to: 2048, freeBytes: 1.8 * 1024 ** 3 }) && !apuStepOk({ from: 2048, to: 4096, freeBytes: 8 * 1024 ** 3 }) && apuStepOk({ from: 2048, to: 512, freeBytes: 0 }));
check('with MTP and the fill on, the fill leaves the draft room too (512 + about 1.75 GB at 4096); a spare set by hand wins', mtpSpareEnv({ env: { LLAMA_MOE_CACHE_FILL: '1' }, step: 4096 }).LLAMA_MOE_CACHE_FILL_SPARE_MIB === '2304' && !mtpSpareEnv({ env: { LLAMA_MOE_CACHE_FILL: '1', LLAMA_MOE_CACHE_FILL_SPARE_MIB: '700' }, step: 4096 }).LLAMA_MOE_CACHE_FILL_SPARE_MIB && !mtpSpareEnv({ env: {}, step: 4096 }).LLAMA_MOE_CACHE_FILL_SPARE_MIB);
check('the Conductor fills the card with the copy cache from Brain Engine 39', FILL_FROM_BE === 39 && fillEnv({ cacheMiB: 4096, beNo: 39 }).LLAMA_MOE_CACHE_FILL === '1');
check('no fill before Brain Engine 39, with no copy cache, or with the fill set by hand', !fillEnv({ cacheMiB: 4096, beNo: 38 }).LLAMA_MOE_CACHE_FILL &&
  !fillEnv({ cacheMiB: 0, beNo: 40 }).LLAMA_MOE_CACHE_FILL && !fillEnv({ cacheMiB: 4096, beNo: 40, env: { LLAMA_MOE_CACHE_FILL: '0' } }).LLAMA_MOE_CACHE_FILL);
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
// ---------- The window lever (Nov 21, Avalon's idea): chat memory cut to the chat, the rest lent to the copy cache ----------
check('the window lever is off unless switched on, and only with the Conductor', !fitWindowOn({ engineTuning: { mode: 'conductor' } }) && !fitWindowOn({ engineTuning: { mode: 'bob', fitWindow: true } }) && fitWindowOn({ engineTuning: { mode: 'conductor', fitWindow: true } }));
check('the window is the chat plus its longest reply plus 4K, in 16K steps, never under 16K or over the brain\'s own',
  fitWindow({ full: 131072, total: 20000, reply: 32768 }) === 65536 && fitWindow({ full: 131072, total: 100, reply: 2048 }) === 16384 && fitWindow({ full: 131072, total: 120000, reply: 32768 }) === 131072 && fitWindow({ full: 0, total: 1 }) === 0);
check('it grows whenever the chat needs it, and shrinks only when that halves it',
  nextWindow({ cur: 65536, want: 81920 }) === 81920 && nextWindow({ cur: 65536, want: 49152 }) === 65536 && nextWindow({ cur: 65536, want: 16384 }) === 16384 && nextWindow({ cur: 0, want: 32768 }) === 32768);
check('the cache gains the chat memory freed, in whole 256 MiB pieces', windowCacheMiB(2 * 2 ** 30, 2 ** 29) === 1536 && windowCacheMiB(2 ** 29, 2 ** 30) === 0 && windowCacheMiB(null, 1) === 0);
check('cleanTuning keeps the switch only when it is on, and a change can turn it off', cleanTuning({ mode: 'conductor', fitWindow: true }).fitWindow === true && !('fitWindow' in cleanTuning({ mode: 'conductor', fitWindow: 'yes' }))
  && mergeTuning({ mode: 'conductor' }, { fitWindow: true }).fitWindow === true && !('fitWindow' in mergeTuning({ mode: 'conductor', fitWindow: true }, { fitWindow: false })));
{ const on = engineOf({ engineTuning: { mode: 'conductor', fitWindow: true }, readingSpeed: 'fastest' }); const a = on.buildArgs('big', { ctx: 131072 });
  check('switched on with a copy cache, it knows the whole window it loaded with', a.includes('--moe-cache-mib') ? on.condWinFull === 131072 : on.condWinFull === 0, a.join(' '));
  const off = engineOf({ engineTuning: { mode: 'conductor' }, readingSpeed: 'fastest' }); off.buildArgs('big', { ctx: 131072 });
  check('switched off, no window', off.condWinFull === 0); }
{ calls.length = 0; const e = live(); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.condCacheBase = 4096; e.condHeld = 0;
  e.condWinFull = 131072; e.condWin = 131072; e.condWinExtra = 0; e.currentCtx = 131072; e.condWinCache = (_m, w) => (w < 131072 ? 1536 : 0);
  await e.conduct({ model: 'big', messages: [{ role: 'user', content: 'x'.repeat(3000) }] });
  const ctx = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)));
  check('a new short chat: the window shrinks to fit (no reading to save) and the cache takes the room', ctx.length === 1 && ctx[0].n_ctx === 49152 && ctx[0].moe_cache_mib === 5632 && !('_winExtra' in ctx[0]) && !calls.some((c) => /save/.test(c)) && e.condWin === 49152 && e.condRead() === 5632, JSON.stringify(calls));
  check('it says so in the logbook', e.logs.some((l) => /window 131072 -> 49152 tokens, expert copy cache 4096 -> 5632 MiB/.test(l)));
  calls.length = 0; e.condHeld = 3000;
  await e.conduct({ model: 'big', messages: [{ role: 'user', content: 'x'.repeat(3600) }] });
  check('the same chat a little longer: no switch', calls.length === 0, JSON.stringify(calls));
  calls.length = 0; e.condHeld = 1000;
  await e.conduct({ model: 'big', messages: [{ role: 'user', content: 'x'.repeat(60000) }] });
  const grow = calls.filter((c) => c.startsWith('POST /context')).map((c) => JSON.parse(c.slice(14)));
  check('the chat outgrows it: the reading saved, the window grows before the reply, put back', grow[0]?.n_ctx === 65536 && calls[0] === 'POST /slots/0?action=save' && calls[2] === 'POST /slots/0?action=restore' && e.condWin === 65536, JSON.stringify(calls)); }
{ calls.length = 0; const e = live(); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.condCacheBase = 4096; e.condHeld = 0; e.currentCtx = 131072;
  await e.conduct({ model: 'big', messages: [{ role: 'user', content: 'x'.repeat(3000) }] });
  check('switched off: the window is never touched', !calls.some((c) => /n_ctx/.test(c)), JSON.stringify(calls)); }
{ calls.length = 0; const e = live(); e.beNo = () => 44; e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.condMax = READ_STEP; e.condCacheBase = 0;
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  const ctx = calls.filter((c) => c.startsWith('POST /context'));
  check('Bob\'s real path on the test PC: with no copy cache it keeps Bob\'s step and never switches', ctx.length === 0 && e.condStep === CHAT_STEP && e.logs.some((l) => /nothing to trade/.test(l)), JSON.stringify(calls)); }
{ calls.length = 0; const e = live({ sharedGraphics: true }); e.condChat = CHAT_STEP; e.condStep = CHAT_STEP; e.condMax = READ_STEP;
  await e.conduct({ model: 'big', messages: longMsg, tools: [], task: 'code' });
  check('the Legion Go check: built-in graphics never switch inside a chat', !calls.some((c) => c.startsWith('POST /context')), JSON.stringify(calls)); }
srv.close();

// ---------- Settings, Help, FAQ, glossary ----------
check('Settings offers the window lever under the Conductor', /data-tunefit/.test(read('public/cellar-engines.js')) && /tunefit/.test(read('public/cellar.js')));
check('Help, the FAQ and the glossary explain the window lever', /Fit the chat memory to the chat/.test(HELP.find((h) => h.id === 'settings-speed')?.html || '') && /window/i.test(HELP.find((h) => h.id === 'faq-conductor-window')?.html || '') && /<dt>Chat memory window<\/dt>/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));
check('Settings offers "Let the Conductor drive"', /radio\('conductor', 'Let the Conductor drive'\)/.test(read('public/cellar-engines.js')));
check('Settings Help names it', /Let the Conductor drive/.test(HELP.find((h) => h.id === 'settings-speed')?.html || ''));
check('the FAQ answers it and says where it works', /Android app/.test(HELP.find((h) => h.id === 'faq-conductor' && h.group === 'FAQ')?.html || ''));
check('the glossary explains it', /<dt>Conductor<\/dt>/.test(HELP.find((h) => h.id === 'glossary')?.html || ''));

// Nov 24: the top step by measured speed, not the biggest that fits
{ const sp = { read: { 2048: 3000, 4096: 3100 }, write: { 2048: 90, 4096: 70 } };
  check('the top step stays until it has been measured', loadStepBySpeed({ speeds: { read: { 2048: 3000 }, write: { 2048: 90 } }, chat: 2048, max: 4096 }).step === 4096);
  check('a smaller step measured faster wins, and says why', (() => { const r = loadStepBySpeed({ speeds: sp, chat: 2048, max: 4096, readTok: 16384 }); return r.step === 2048 && /measured faster/.test(r.why); })());
  check('a bigger step measured faster keeps it', loadStepBySpeed({ speeds: { read: { 2048: 2000, 4096: 3400 }, write: { 2048: 90, 4096: 89 } }, chat: 2048, max: 4096 }).step === 4096);
  check('a win inside the margin keeps the top step (no flip on noise)', loadStepBySpeed({ speeds: { read: { 2048: 3000, 4096: 3000 }, write: { 2048: 90, 4096: 90 * (1 - LOAD_PICK_MARGIN / 2) } }, chat: 2048, max: 4096, readTok: 0, outTok: 300 }).step === 4096);
  check('a step only guessed from another (no measured write) never wins', loadStepBySpeed({ speeds: { read: { 2048: 9000, 4096: 3000 }, write: { 4096: 80 } }, chat: 2048, max: 4096 }).step === 4096);
  check('saved speeds count only for the same Brain Engine and only clean numbers', cleanSpeeds({ be: 45, speeds: { big: { read: { 4096: 3000, x: 5, 2048: -1 }, write: { 4096: 'fast' } } } }, 45).big.read[4096] === 3000 && Object.keys(cleanSpeeds({ be: 45, speeds: { big: { read: { 4096: 3000, x: 5, 2048: -1 } } } }, 45).big.read).length === 1 && Object.keys(cleanSpeeds({ be: 44, speeds: { big: sp } }, 45)).length === 0 && Object.keys(cleanSpeeds(null, 45)).length === 0);
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-cond-speeds-'));
  const a = new LlamaCpp({ agentDir: d, dataDir: d, llamacpp: { models: { big } } }); clearInterval(a.idleTimer); a.beNo = () => 45;
  a.condSpeedsAll().big = sp; a.condSpeedsSave();
  const b = new LlamaCpp({ agentDir: d, dataDir: d, llamacpp: { models: { big } } }); clearInterval(b.idleTimer); b.beNo = () => 45;
  const c = new LlamaCpp({ agentDir: d, dataDir: d, llamacpp: { models: { big } } }); clearInterval(c.idleTimer); c.beNo = () => 46;
  check('measured speeds come back on the next run of the same engine, not a new one', b.condSpeedsAll().big?.write?.[2048] === 90 && !c.condSpeedsAll().big);
  fs.rmSync(d, { recursive: true, force: true }); }
fs.rmSync(tmp, { recursive: true, force: true });
{ const e = engineOf({}, { testSeed: 7 }); let sent = null; const was = globalThis.fetch;
  globalThis.fetch = async (_u, o) => { sent = JSON.parse(o.body); return { ok: true }; };
  try { await e.post('big', [{ role: 'user', content: 'hi' }], [], null, false, 'chat', 0.7); } finally { globalThis.fetch = was; }
  const e2 = engineOf(); let sent2 = null; globalThis.fetch = async (_u, o) => { sent2 = JSON.parse(o.body); return { ok: true }; };
  try { await e2.post('big', [{ role: 'user', content: 'hi' }], [], null, false, 'chat'); } finally { globalThis.fetch = was; }
  check('a test seed makes replies greedy and seeded, and only when set', sent?.seed === 7 && sent.temperature === 0 && sent.top_k === 1 && sent2 && !('seed' in sent2)); }
// Nov 24 (the Legion Go's hand install): a marker written with a byte-order mark still reads, and one that can't be read says so
{ const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-mark-'));
  const exe = path.join(d, 'llama-server');
  const mk = () => { const e = new LlamaCpp({ agentDir: d, dataDir: d, llamacpp: { exe, models: {} } }); clearInterval(e.idleTimer); const said = []; e.log = (_k, t) => said.push(t); return { e, said }; };
  fs.writeFileSync(path.join(d, 'bob-brainengine.json'), '\uFEFF' + JSON.stringify({ version: 'brain-engine-45b12359', base: 'b12359' }));
  const a = mk(); check('a Brain Engine marker with a byte-order mark still counts (PowerShell writes one)', a.e.beNo() === 45, String(a.e.beNo()));
  fs.writeFileSync(path.join(d, 'bob-brainengine.json'), '{ not json');
  const b = mk(); check('an unreadable marker counts as plain llama.cpp and says so once', b.e.beNo() === 0 && b.e.beNo() === 0 && b.said.filter((t) => /marker .* can't be read/.test(t)).length === 1, b.said.join(' | '));
  fs.rmSync(d, { recursive: true, force: true }); }
// Nov 24 (npc's BE45 real path: the 35B never got its copy cache): the expert count is read from the file itself
{ const { writeGgufFrom } = await import('../src/lab-gguf.js');
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-moe-'));
  const moe = path.join(d, 'moe.gguf'), buf = Buffer.alloc(4096);
  await writeGgufFrom(moe, { kvs: [{ key: 'general.architecture', type: 8, value: 'qwen3moe' }, { key: 'qwen3moe.block_count', type: 4, value: 2 }, { key: 'qwen3moe.expert_count', type: 4, value: 8 }], tensors: [{ name: 'blk.0.ffn_up_exps.weight', dims: [32, 16, 2], type: 0, bytes: buf.length, data: async () => buf }] });
  const e = new LlamaCpp({ agentDir: d, dataDir: d, gpuVramGB: 1e-6, llamacpp: { models: { moe } } }); clearInterval(e.idleTimer); e.beNo = () => 45;
  const a = e.buildArgs('moe');
  check('GUPPI by default turns the copy cache on for a brain of experts bigger than the card (read from its file)', a.includes('--moe-cache-mib'), a.join(' '));
  fs.rmSync(d, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
