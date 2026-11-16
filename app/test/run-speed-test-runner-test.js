// The speed test runner (model-lab/speed-test.mjs): plans, the order of loads, word gaps and their tail, card samples,
// throttling, the PC test lock, stop rules and the summary. Nothing here starts an engine or reads the real card: the
// engine, the stream, the card and the clock are fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { quantile, median, parseSmiLine, cardSummary, streamOnce, loadPlan, schedule, runRow, summarise, takeLock, sha256 } from '../model-lab/speed-test.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-speed-'));

check('quantiles: median and p99 by interpolation, junk skipped', median([3, 1, 2, NaN]) === 2 && quantile([0, 10], 0.99) === 9.9 && quantile([], 0.5) === null);

{ const s = parseSmiLine('2026/11/16 10:00:00.000, 71, 280.5, 300.00, 2700, 14001, 0x0000000000000004, 15123');
  check('a card sample: heat, power, clocks, memory, and a power cap counts as throttled', s.tempC === 71 && s.powerW === 280.5 && s.memMB === 15123 && s.throttled === true);
  const idle = parseSmiLine('t, 40, [N/A], 300, 210, 405, 0x0000000000000001, 900');
  check('idle is not throttling, and [N/A] is no number', idle.throttled === false && idle.powerW === null);
  check('a short line is no sample', parseSmiLine('1, 2') === null);
  const c = cardSummary([s, idle]);
  check('the card summary: peaks, lowest clock, throttled samples', c.maxTempC === 71 && c.peakMemMB === 15123 && c.minSmMHz === 210 && c.throttledSamples === 1); }

// a fake streamed answer: words arrive at the clock's times
function fakeStream(times, timings) {
  let i = 0; const clock = [0, ...times, times.at(-1) + 1];
  const now = () => clock[Math.min(i++, clock.length - 1)];
  const lines = times.map(() => `data: ${JSON.stringify({ content: 'w ' })}\n`).concat([`data: ${JSON.stringify({ content: '', stop: true, timings })}\n`]);
  const fetchImpl = async () => ({ ok: true, body: (async function* () { for (const l of lines) yield l; })() });
  return { fetchImpl, now };
}
{ const { fetchImpl, now } = fakeStream([100, 110, 120, 130, 330], { prompt_per_second: 1500.04, predicted_per_second: 40, prompt_n: 4000, predicted_n: 5, draft_n: 10, draft_n_accepted: 7 });
  const r = await streamOnce('http://x', { prompt: 'hi' }, { fetchImpl, now });
  check('first word time from the request, not the load', r.firstWordMs === 100);
  check('every gap kept, and the tail shows the one stall', r.gapsMs.join() === '10,10,10,200' && r.gaps.median === 10 && r.gaps.max === 200 && r.gaps.p99 > 190);
  check('the engine\'s own reading and writing speed', r.readTps === 1500 && r.writeTps === 40 && r.writtenN === 5);
  check('Turbo\'s kept guesses', r.draftN === 10 && r.keptPct === 70);
  check('the answer is fingerprinted, not kept', r.textSha === sha256('w w w w w ') && !('text' in r)); }

// plans
fs.writeFileSync(path.join(tmp, 'short.txt'), 'Say hi.\r\n');
const planFile = path.join(tmp, 'plan.json');
const plan = { name: 'test', brain: 'brain.gguf', engines: { be: { exe: 'be-server' }, plain: { exe: 'plain-server' } }, prompts: { short: 'short.txt' }, baseArgs: ['--jinja'], rows: [{ id: 'A', engine: 'be', prompts: ['short'] }, { id: 'B', engine: 'plain', args: ['-ub', '4096'], env: { X: '1' }, prompts: ['short'] }] };
fs.writeFileSync(planFile, JSON.stringify(plan));
{ const l = loadPlan(planFile);
  check('a good plan: no problems, prompts read with \\r\\n stripped and fingerprinted', !l.problems.length && l.prompts.short.text === 'Say hi.\n' && l.prompts.short.sha === sha256('Say hi.\n'));
  fs.writeFileSync(planFile, JSON.stringify({ ...plan, rows: [...plan.rows, { id: 'A', engine: 'none', prompts: ['long'] }] }));
  const bad = loadPlan(planFile).problems.join(' | ');
  check('a bad plan says what\'s wrong', /no engine "none"/.test(bad) && /no prompt "long"/.test(bad) && /share an id/.test(bad));
  fs.writeFileSync(planFile, JSON.stringify(plan)); }
check('rows taken in turn, round after round', schedule([{ id: 1 }, { id: 2 }], 3).map((x) => `${x.round}${x.row.id}`).join() === '01,02,11,12,21,22');

// a row, with a fake engine
function fx({ up = true, stopAfter = Infinity, log = '' } = {}) {
  const seen = { starts: [], streams: [], stops: 0 }; let n = 0;
  return { seen, port: async () => 9000, start: (exe, args, env) => { seen.starts.push({ exe, args, env }); return { url: 'http://fake', log: () => log, ready: async () => (up ? { ok: true } : { ok: false, why: 'out of memory' }), stop: async () => { seen.stops++; } }; },
    stream: async (url, body) => { seen.streams.push(body); return { firstWordMs: 50 + n, readTps: 1000, writeTps: 40 + n++, gaps: { median: 25, p99: 30, max: 31 }, gapsMs: [] }; },
    sampleCard: () => ({ stop: () => [parseSmiLine('t, 60, 200, 300, 2700, 14001, 0x0, 14000')] }),
    shouldStop: () => (seen.streams.length > stopAfter ? 'game started' : '') };
}
{ const { prompts } = loadPlan(planFile); const f = fx({ log: 'llama_moe_cache: ranked fill: 10 experts (40.00 MiB) from x (10 lines, s)\n' });
  const res = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: f });
  check('a row starts its own engine with the base and row flags and environment', f.seen.starts[0].exe === 'plain-server' && f.seen.starts[0].args.join(' ').includes('--jinja -ub 4096') && f.seen.starts[0].env.X === '1');
  check('a warm-up first (untimed), then the timed run', f.seen.streams.length === 2 && f.seen.streams[0].n_predict === 16 && res.runs.length === 1 && res.runs[0].writeTps === 41);
  check('speed runs: temperature 0, seed 42, 300 words, no prompt cache', f.seen.streams[1].temperature === 0 && f.seen.streams[1].seed === 42 && f.seen.streams[1].n_predict === 300 && f.seen.streams[1].ignore_eos === true && f.seen.streams[1].cache_prompt === false);
  check('the card and the engine\'s cache lines go with it, and the engine stops', res.runs[0].card.peakMemMB === 14000 && res.load.filled === 10 && f.seen.stops === 1); }
{ const { prompts } = loadPlan(planFile); const f = fx({ up: false });
  const res = await runRow({ plan, prompts, row: plan.rows[0], round: 0, fx: f });
  check('a row that can\'t start is not run, with why, and nothing is timed', res.notRun === 'out of memory' && !res.runs.length && f.seen.stops === 1); }
{ const { prompts } = loadPlan(planFile); const f = fx({ stopAfter: 0 });
  const res = await runRow({ plan, prompts, row: plan.rows[0], round: 0, fx: f });
  check('a game starting stops the row and frees the card', res.stopped === 'game started' && !res.runs.length && f.seen.stops === 1); }

// the summary
{ const mk = (row, w, thr = false) => ({ row, round: 0, runs: [{ prompt: 'short', firstWordMs: 50, readTps: 1000, writeTps: w, gaps: { median: 25, p99: 30, max: 31 }, card: { peakMemMB: 14000 }, throttled: thr }] });
  const md = summarise([mk('A', 40), mk('A', 44, true), mk('A', 42, true), { row: 'C', round: 0, notRun: 'no room', runs: [] }], { prompts: { short: { sha: sha256('x') } }, plan });
  check('median with min and max, never a mean alone', /\| A \| short \| 3 \| 50 \(50 to 50\) \| 1000 \(1000 to 1000\) \| 42 \(40 to 44\) \|/.test(md));
  check('throttled runs kept and counted, and two of them flag a re-run', /\| 2 \|$/m.test(md) && /More than one throttled run/.test(md));
  check('a row not run says why', /\| C \| - \| 0 \| not run: no room/.test(md)); }

// the lock
{ const lock = path.join(tmp, 'lock.txt');
  const a = takeLock(lock, 'speed-test'); const b = takeLock(lock, 'other');
  check('the PC test lock: taken once, refused while held, freed after', a.ok && !b.ok && /speed-test/.test(b.why) && (a.release(), takeLock(lock, 'other').ok)); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
