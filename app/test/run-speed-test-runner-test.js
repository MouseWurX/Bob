// The speed test runner (model-lab/speed-test.mjs): plans, the order of loads, word gaps and their tail, card samples,
// throttling, the PC test lock, stop rules and the summary. Nothing here starts an engine or reads the real card: the
// engine, the stream, the card and the clock are fakes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { quantile, median, parseSmiLine, cardSummary, realThrottled, streamOnce, loadPlan, schedule, runRow, summarise, liveSummary, lineSplitter, takeLock, sha256, cpuBusy, parseSystem, SYSTEM_PS, parseHwinfo, hwinfoColumns, parseDiskstats, parseDiskRaw, diskUse, parseSharedMB } from '../model-lab/speed-test.mjs';

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
{ const line = (mhz, r) => parseSmiLine(`t, 60, 150, 300, ${mhz}, 14001, ${r}, 15000, 95, 40, 60, 4, 16`);
  const busy = [line(2887, '0x0'), line(2887, '0x0'), line(2880, '0x4')];
  check('a power-cap-only blip at full clocks is not throttling (Nov 17)', realThrottled(busy).length === 0 && cardSummary(busy).powerCapBlips === 1);
  check('a power cap that drops clocks more than 3% is throttling', realThrottled([...busy, line(2700, '0x4')]).length === 1);
  check('heat always counts', realThrottled([...busy, line(2887, '0x20')]).length === 1); }

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
  check('the answer is fingerprinted, and handed on for a plan that keeps it (saveText)', r.textSha === sha256('w w w w w ') && r.text === 'w w w w w '); }

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
  fs.writeFileSync(planFile, JSON.stringify({ ...plan, promptRepeat: { short: 3 } }));
  check('promptRepeat lays a prompt file end to end N times', loadPlan(planFile).prompts.short.text === 'Say hi.\n\n\nSay hi.\n\n\nSay hi.\n');
  fs.writeFileSync(planFile, JSON.stringify(plan)); }
check('rows taken in turn, round after round', schedule([{ id: 1 }, { id: 2 }], 3).map((x) => `${x.round}${x.row.id}`).join() === '01,02,11,12,21,22');

// a row, with a fake engine
function fx({ up = true, stopAfter = Infinity, log = '' } = {}) {
  const seen = { starts: [], streams: [], stops: 0 }; let n = 0;
  return { seen, port: async () => 9000, start: (exe, args, env) => { seen.starts.push({ exe, args, env }); return { url: 'http://fake', log: () => log, ready: async () => (up ? { ok: true } : { ok: false, why: 'out of memory' }), stop: async () => { seen.stops++; } }; },
    post: async (url, p, body) => { seen.posts = [...(seen.posts || []), { p, body }]; return p === '/bad' ? { ok: false, status: 400, why: 'no' } : { ok: true }; },
    get: async () => ({ n_expert: 4 }),
    template: async (url, chat) => `T:${chat.messages.map((m) => m.content).join('|')}`,
    tokenize: async (url, text) => text.split(' '), detokenize: async (url, toks) => toks.join(' '),
    stream: async (url, body) => { seen.streams.push(body); return { firstWordMs: 50 + n, readTps: 1000, writeTps: 40 + n++, gaps: { median: 25, p99: 30, max: 31 }, gapsMs: [] }; },
    sampleCard: () => ({ stop: () => [parseSmiLine('t, 60, 200, 300, 2700, 14001, 0x0, 14000')] }),
    shouldStop: () => (seen.streams.length > stopAfter ? 'game started' : '') };
}
{ const { prompts } = loadPlan(planFile); const f = fx({ log: 'llama_moe_cache: ranked fill: 10 experts (40.00 MiB) from x (10 lines, s)\n' });
  const res = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: f });
  check('a row starts its own engine with the base and row flags and environment', f.seen.starts[0].exe === 'plain-server' && f.seen.starts[0].args.join(' ').includes('--jinja -ub 4096') && f.seen.starts[0].env.X === '1');
  check('the runner starts from a folder with a space in its name (fileURLToPath, never .pathname)', (() => { const src = fs.readFileSync(new URL('../model-lab/speed-test.mjs', import.meta.url), 'utf8'); return /realOf\(fileURLToPath\(import\.meta\.url\)\)/.test(src) && !/import\.meta\.url\)\.pathname/.test(src); })());
  check('every engine starts at -lv 4 so its info lines (cache totals, prefetch count) are printed', f.seen.starts[0].args.join(' ').endsWith('-lv 4'));
  check('a warm-up first (untimed), then the timed run', f.seen.streams.length === 2 && f.seen.streams[0].n_predict === 16 && res.runs.length === 1 && res.runs[0].writeTps === 41);
  check('speed runs: temperature 0, seed 42, 300 words, no prompt cache', f.seen.streams[1].temperature === 0 && f.seen.streams[1].seed === 42 && f.seen.streams[1].n_predict === 300 && f.seen.streams[1].ignore_eos === true && f.seen.streams[1].cache_prompt === false);
  check('the card and the engine\'s cache lines go with it, and the engine stops', res.runs[0].card.peakMemMB === 14000 && res.load.filled === 10 && f.seen.stops === 1); }
{ const { prompts } = loadPlan(planFile); const f = fx({ up: false });
  const res = await runRow({ plan, prompts, row: plan.rows[0], round: 0, fx: f });
  check('a row that can\'t start is not run, with why, and nothing is timed', res.notRun === 'out of memory' && !res.runs.length && f.seen.stops === 1); }
{ const { prompts } = loadPlan(planFile); const f = fx({ stopAfter: 0 });
  const res = await runRow({ plan, prompts, row: plan.rows[0], round: 0, fx: f });
  check('a game starting stops the row and frees the card', res.stopped === 'game started' && !res.runs.length && f.seen.stops === 1); }

{ const { prompts } = loadPlan(planFile); const f = fx();
  const p2 = { ...plan, promptTokens: { short: 1 }, question: { short: ' Q?' } };
  const res = await runRow({ plan: p2, prompts, row: { ...plan.rows[0], setup: [{ path: '/expert-mask', body: { keep: [1] } }] }, round: 0, fx: f });
  check('live switches are set after load, before the warm-up', f.seen.posts?.[0]?.p === '/expert-mask' && res.runs.length === 1);
  check('a prompt cut to an exact token count, with the fixed question after', f.seen.streams[1].prompt === 'Say Q?'); }
{ const { prompts } = loadPlan(planFile); const f = fx();
  const res = await runRow({ plan, prompts, row: { ...plan.rows[0], setup: [{ path: '/bad', body: {} }] }, round: 0, fx: f });
  check('a refused switch: the row is not run, with why', /setup \/bad refused/.test(res.notRun) && !res.runs.length); }
{ const { prompts } = loadPlan(planFile); const f = fx();
  const res = await runRow({ plan: { ...plan, promptTokens: { short: 99 } }, prompts, row: plan.rows[0], round: 0, fx: f });
  check('a prompt too short for its token count: not run, with why', /only 2 tokens, 99 wanted/.test(res.notRun)); }

{ fs.writeFileSync(path.join(tmp, 'start.json'), JSON.stringify({ messages: [{ role: 'system', content: 'S' }, { role: 'user', content: 'hi' }], tools: [] }));
  fs.writeFileSync(planFile, JSON.stringify({ ...plan, prompts: { start: 'start.json' }, rows: [{ id: 'A', engine: 'be', prompts: ['start'] }] }));
  const l = loadPlan(planFile); const f = fx();
  await runRow({ plan: l.plan, prompts: l.prompts, row: l.plan.rows[0], round: 0, fx: f });
  check('a chat prompt (Bob\'s real start) goes through the brain\'s own template', f.seen.streams[1].prompt === 'T:S|hi');
  fs.writeFileSync(planFile, JSON.stringify(plan)); }

{ const { prompts } = loadPlan(planFile); const f = fx();
  await runRow({ plan, prompts, row: { ...plan.rows[0], setup: [{ path: '/expert-mask', allBut: 0 }] }, round: 0, fx: f });
  check('the mask keeping all experts but one, however many the brain has', JSON.stringify(f.seen.posts[0].body) === '{"keep":[1,2,3]}'); }
{ fs.writeFileSync(planFile, JSON.stringify({ ...plan, brain: '${BRAIN}' }));
  check('places come from --var, never written in the plan', loadPlan(planFile, { vars: { BRAIN: 'C:\\b "x".gguf' } }).plan.brain === 'C:\\b "x".gguf' && /pass --var BRAIN/.test(loadPlan(planFile).problems.join()));
  fs.writeFileSync(planFile, JSON.stringify(plan)); }

// the summary
{ const mk = (row, w, thr = false) => ({ row, round: 0, runs: [{ prompt: 'short', firstWordMs: 50, readTps: 1000, writeTps: w, gaps: { median: 25, p99: 30, max: 31 }, card: { peakMemMB: 14000 }, throttled: thr }] });
  const md = summarise([mk('A', 40), mk('A', 44, true), mk('A', 42, true), { row: 'C', round: 0, notRun: 'no room', runs: [] }], { prompts: { short: { sha: sha256('x') } }, plan });
  check('median with min and max, never a mean alone', /\| A \| short \| 3 \| 50 \(50 to 50\) \| 1000 \(1000 to 1000\) \| 42 \(40 to 44\) \|/.test(md));
  check('throttled runs kept and counted, and two of them flag a re-run', /\| 2 \|$/m.test(md) && /More than one throttled run/.test(md));
  check('a row not run says why', /\| C \| - \| 0 \| not run: no room/.test(md));
  const live = liveSummary([mk('A', 40), mk('A', 44)], { prompts: {}, plan, total: 6, now: new Date(2026, 10, 16, 19, 10) });
  check('the table so far says how far along the run is, then the same table', /In progress: 2 of 6 loads done/.test(live) && /\| A \| short \| 2 \| 50 \(50 to 50\) \| 1000 \(1000 to 1000\) \| 42 \(40 to 44\) \|/.test(live));
  check('the table so far is written between loads, never during a timed run', /appendFileSync\(jsonl[\s\S]{0,200}summary-so-far\.md/.test(fs.readFileSync(new URL('../model-lab/speed-test.mjs', import.meta.url), 'utf8').replace(/\r\n/g, '\n'))); }

// the lock
{ const lock = path.join(tmp, 'lock.txt');
  const a = takeLock(lock, 'speed-test'); const b = takeLock(lock, 'other');
  check('the PC test lock: taken once, refused while held, freed after', a.ok && !b.ok && /speed-test/.test(b.why) && (a.release(), takeLock(lock, 'other').ok)); }

// ---------- System conditions (all fakes: no real processor, card or Windows is read) ----------
{ const full = parseSmiLine('t, 61, 250, 300, 2800, 14001, 0x0, 15000, 97, 45, [N/A], 4, 16');
  check('card samples also carry busy %, fan, memory temperature (null when the card has none) and the PCIe link', full.utilPct === 97 && full.fanPct === 45 && full.memTempC === null && full.pcieGen === 4 && full.pcieWidth === 16);
  const old = parseSmiLine('t, 61, 250, 300, 2800, 14001, 0x0, 15000');
  check('an 8-field line (older driver) still reads, the new fields null', old && old.memMB === 15000 && old.utilPct === null);
  const sum = cardSummary([full, parseSmiLine('t, 66, 260, 300, 2700, 14001, 0x0, 15100, 99, 50, [N/A], 3, 16')]);
  check('the run summary keeps the hottest card, busiest card, fastest fan and lowest PCIe gen', sum.maxTempC === 66 && sum.maxUtilPct === 99 && sum.maxFanPct === 50 && sum.maxMemTempC === null && sum.minPcieGen === 3); }
{ const t = (u, i) => ({ times: { user: u, nice: 0, sys: 0, idle: i, irq: 0 } });
  check('processor busy share over all cores between two readings', cpuBusy([t(100, 900), t(100, 900)], [t(150, 950), t(200, 900)]) === 75 && cpuBusy([], []) === null); }
{ const s = parseSystem('{"top":[{"name":"llama-server","pct":40.2}],"cpuTempC":[51.3,48],"powerPlan":"Power Scheme GUID: x (Balanced)"}', { freeMB: 9000, totalMB: 32000 });
  check('the system reading: top processes, the hottest thermal zone, the power plan and RAM', s.top[0].name === 'llama-server' && s.cpuTempC === 51.3 && /Balanced/.test(s.powerPlan) && s.freeRamMB === 9000);
  const none = parseSystem('', { freeMB: 1, totalMB: 2 });
  check('no processor temperature from Windows is said plainly, never guessed', none.cpuTempC === null && /not reported/.test(none.cpuTempNote));
  check('the system reading uses only Windows\' own tools (Get-Counter, CIM, powercfg), nothing installed', /Get-Counter/.test(SYSTEM_PS) && /MSAcpi_ThermalZoneTemperature/.test(SYSTEM_PS) && /powercfg/.test(SYSTEM_PS)); }
{ const { prompts } = loadPlan(planFile); const f = { ...fx(), system: async () => ({ freeRamMB: 5, cpuTempC: 50, top: [] }), cpuMark: () => ({ stop: () => ({ busyPct: 12, freeRamMB: 4 }) }) };
  const res = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: f });
  check('each load records the system before and after, and each timed run its processor use', res.sysBefore?.cpuTempC === 50 && res.sysAfter?.freeRamMB === 5 && res.runs[0].cpu?.busyPct === 12);
  const md = summarise([res], { prompts: {}, plan });
  check('the summary has a conditions table and the processor temperature line', /Conditions during the timed runs/.test(md) && /Processor temperature before each load/.test(md)); }

// ---------- Card lines split across chunks (night 1, Nov 16: 13801 °C read from a piece of a line) ----------
{ const got = []; const feed = lineSplitter((l) => { const s = parseSmiLine(l); if (s) got.push(s); });
  const line = '2026/11/16 18:48:55.672, 46.36, 132.11, 300.00, 2887, 13801, 0x0000000000000400, 15019, 76, 30, [N/A], 4, 16';
  feed(line.slice(0, 40)); feed(line.slice(40) + '\r\n' + line.slice(0, 70)); feed(line.slice(70) + '\n');
  check('nvidia-smi lines split across chunks are joined before reading', got.length === 2 && got.every((x) => x.tempC === 46.36 && x.memMHz === 13801 && x.memMB === 15019));
  check('a piece of a line is never read as a sample', parseSmiLine(line.slice(30)) === null && parseSmiLine('1024, 15019, 48, 30') === null); }

// ---------- Laptops: cool-down before each load, time spent throttled (fakes: no real card is read) ----------
{ const { prompts } = loadPlan(planFile); const temps = [78, 71, 64, 58]; const slept = [];
  const f = { ...fx(), cardTempC: async () => temps.shift() ?? 58, sleep: async (ms) => { slept.push(ms); } };
  const res = await runRow({ plan: { ...plan, coolDown: { cardC: 60, maxWaitS: 60, everyS: 5 } }, prompts, row: plan.rows[1], round: 0, fx: f });
  check('a hot card is waited on before the load, and the wait is recorded', res.coolDown?.startC === 78 && res.coolDown.endC === 58 && res.coolDown.waitedS === 15 && !res.coolDown.hitLimit && slept.length === 3);
  const g = { ...fx(), cardTempC: async () => 90, sleep: async () => {} };
  const hot = await runRow({ plan: { ...plan, coolDown: { cardC: 60, maxWaitS: 10, everyS: 5 } }, prompts, row: plan.rows[1], round: 0, fx: g });
  check('a card that never cools still runs after the longest wait, and says so', hot.coolDown.waitedS === 10 && hot.coolDown.hitLimit && hot.runs.length > 0);
  const none = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: f });
  check('no cool-down unless the plan asks for one', none.coolDown === undefined);
  const mk = (w, thr) => ({ prompt: 'short', writeTps: w, firstWordMs: 1, readTps: 1, gaps: {}, card: { samples: 100, throttledSamples: thr }, throttled: thr > 0 });
  const md = summarise([{ row: 'L', round: 0, runs: [mk(30, 0)], coolDown: res.coolDown }, { row: 'L', round: 1, runs: [mk(22, 40)], coolDown: hot.coolDown }], { prompts: {}, plan: { coolDown: { cardC: 60 } } });
  check('the summary shows the time spent throttled and the writing speed least and most throttled', /\| L \| short \| 20 \(0 to 40\) \| 30 \| 22 \|/.test(md));
  check('the summary shows the cool-down waits and loads that started hot', /Cool-down before each load \(to 60 °C\)/.test(md) && /1 of 2 loads started above the target/.test(md)); }

{ const header = '"Date","Time","Core VIDs (avg) [V]","CPU (Tctl/Tdie) [°C]","CPU Die (average) [°C]","CPU Package Power [W]"';
  check('HWiNFO columns are found by name', hwinfoColumns(header).temp === 3 && hwinfoColumns(header).power === 5);
  const r = parseHwinfo(header, ['"16.11.2026","23:10:01.1","1.1","71.5","66","88.2"', '"16.11.2026","23:10:02.1","1.1","74.0","68","91.0"', '', header]);
  check('HWiNFO lines during a run give the hottest and median processor temperature and peak power', r.cpuMaxC === 74 && r.cpuMedianC === 72.8 && r.cpuMaxW === 91 && r.cpuSamples === 2);
  check('a comma decimal (European HWiNFO) still reads', parseHwinfo(header, ['"16.11.2026","23:10:01","1,1","70,5","66","80"']).cpuMaxC === 70.5);
  check('no lines written during a run is said plainly', parseHwinfo(header, []).cpuMaxC === null && /no lines/.test(parseHwinfo(header, []).cpuNote));
  check('a log without a processor temperature column is said plainly', /no processor temperature/.test(parseHwinfo('"Date","Time","GPU [°C]"', ['x']).cpuNote)); }


// ---------- Disk reads (brains bigger than the RAM, Nov 17) ----------
{ const ds = '   8       0 sda 100 0 2000 0 0 0 0 0 0 0 0\n   8       1 sda1 90 0 1800 0 0 0 0 0 0 0 0\n 259       0 nvme0n1 10 0 1000 0 0 0 0 0 0 0 0\n 259       1 nvme0n1p1 9 0 900 0 0 0 0 0 0 0 0\n   7       0 loop0 5 0 500 0';
  check('disk reads: whole disks only, partitions and loop devices left out', parseDiskstats(ds) === 3000 * 512 && parseDiskstats('') === null);
  check('disk reads: Windows\' raw counter is a running total of bytes', parseDiskRaw('123456789\r\n') === 123456789 && parseDiskRaw('') === null && parseDiskRaw('Get-CimInstance : error') === null);
  const u = diskUse(0, 300 * 1048576, 300);
  check('disk use per run: MB read and MB per written word; no reading, no number', u.readMB === 300 && u.mbPerWord === 1 && diskUse(null, 5, 1) === null && diskUse(10, 5, 1) === null);
  const { prompts } = loadPlan(planFile); let n = 0;
  const f = { ...fx(), diskReadBytes: async () => (n++ % 2 ? 50 * 1048576 : 0) };
  const res = await runRow({ plan: { ...plan, diskReads: true }, prompts, row: plan.rows[1], round: 0, fx: f });
  const off = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: f });
  check('disk reads are off unless the plan asks', off.runs.every((r) => r.disk === undefined));
  check('each timed run records what was read from the disk', res.runs.length > 0 && res.runs.every((r) => r.disk?.readMB === 50));
  const md = summarise([res], { prompts: {}, plan });
  check('the summary has a disk table when there are disk readings, and none without', /Read from the disk during the timed runs/.test(md) && /\| 50 \(50 to 50\) \|/.test(md) && !/Read from the disk/.test(summarise([{ ...res, runs: res.runs.map(({ disk, ...r }) => r) }], { prompts: {}, plan }))); }

// ---------- Big rows: free card memory first, spills into RAM (Nov 17) ----------
{ const { prompts } = loadPlan(planFile);
  const f = { ...fx(), cardFreeMB: async () => 9000 };
  const skip = await runRow({ plan, prompts, row: { ...plan.rows[1], needFreeMB: 14000 }, round: 0, fx: f });
  check('a row wanting more free card memory than there is: skipped before loading, said as not run', /^skipped: 9000 MB free on the card before loading, 14000 MB wanted$/.test(skip.notRun) && !f.seen.starts.length && !skip.runs.length);
  const g = { ...fx(), cardFreeMB: async () => 15000 };
  const go = await runRow({ plan, prompts, row: { ...plan.rows[1], needFreeMB: 14000 }, round: 0, fx: g });
  check('with enough free it loads, and the free memory is written down', !go.notRun && go.cardFreeMB === 15000 && go.runs.length === 1);
  let k = 0; const h = { ...fx(), sharedGpuMB: async () => [300, 1400][Math.min(k++, 1)] };
  const sp = await runRow({ plan: { ...plan, spillCheck: true }, prompts, row: plan.rows[1], round: 0, fx: h });
  check('shared GPU memory rising over 512 MB during a load marks the run failed as a spill, not slow', /^spilled: shared GPU memory rose 1100 MB/.test(sp.runs[0].failed) && sp.runs[0].sharedRiseMB === 1100);
  let j = 0; const q = { ...fx(), sharedGpuMB: async () => [300, 500][Math.min(j++, 1)] };
  const fine = await runRow({ plan: { ...plan, spillCheck: true }, prompts, row: plan.rows[1], round: 0, fx: q });
  const offSp = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: h });
  check('a small rise is fine, and the check is off unless the plan asks', !fine.runs[0].failed && fine.runs[0].sharedRiseMB === 200 && offSp.runs[0].sharedRiseMB === undefined);
  check('shared memory: bytes to MB; nothing or an error is no number', parseSharedMB('2147483648\r\n') === 2048 && parseSharedMB('') === null && parseSharedMB('Get-Counter : error') === null); }

// ---------- Stepping a cache down that doesn't fit (Nov 17) ----------
{ const { prompts } = loadPlan(planFile);
  const big = { id: 'S', engine: 'be', prompts: ['short'], args: ['-ub', '6144', '--moe-cache-mib', '4096'], cacheDown: [3072, 2048] };
  const mk = (failAt) => { const f = fx(); const start = f.start; f.start = (exe, args, env) => { const s0 = start(exe, args, env); const mib = Number(args[args.indexOf('--moe-cache-mib') + 1]); return { ...s0, ready: async () => (mib >= failAt ? { ok: false, why: 'out of memory' } : { ok: true }) }; }; return f; };
  const f = mk(4096);
  const r3 = await runRow({ plan, prompts, row: big, round: 0, fx: f });
  check('a 4 GB cache that doesn\'t load steps down to 3 GB, and says so', r3.cacheMiB === 3072 && r3.runs.length === 1 && r3.steppedDown?.length === 1 && r3.steppedDown[0].mib === 4096 && f.seen.starts.map((x) => x.args[x.args.indexOf('--moe-cache-mib') + 1]).join() === '4096,3072');
  const r2 = await runRow({ plan, prompts, row: big, round: 0, fx: mk(3072) });
  check('and to 2 GB when 3 doesn\'t either', r2.cacheMiB === 2048 && r2.steppedDown.map((d) => d.mib).join() === '4096,3072');
  const none = await runRow({ plan, prompts, row: big, round: 0, fx: mk(1) });
  check('when nothing loads, the last try is the result, not run', none.notRun === 'out of memory' && none.cacheMiB === 2048);
  const ok = await runRow({ plan, prompts, row: big, round: 0, fx: mk(99999) });
  check('a cache that fits runs once at its own size', ok.cacheMiB === 4096 && !ok.steppedDown);
  let k = 0; const sp = { ...fx(), sharedGpuMB: async () => (k++ < 2 ? [0, 2000][k - 1] : 0) };
  const spilled = await runRow({ plan: { ...plan, spillCheck: true }, prompts, row: big, round: 0, fx: sp });
  check('a spill steps down too', spilled.cacheMiB === 3072 && /spilled/.test(spilled.steppedDown[0].why));
  const busy = await runRow({ plan, prompts, row: { ...big, needFreeMB: 14000 }, round: 0, fx: { ...fx(), cardFreeMB: async () => 5000 } });
  check('a busy card is skipped, not stepped down', /^skipped/.test(busy.notRun) && busy.cacheMiB === 4096 && !busy.steppedDown);
  const md = summarise([r3, ok], { prompts: {}, plan });
  check('the summary says which size each load ran with', /\| S \| 1 \| 3072 MiB \| 4096 MiB \(out of memory\) \|/.test(md) && /\| S \| 1 \| 4096 MiB \| - \|/.test(md)); }

// ---------- The engine's own staging buffer isn't a spill (Nov 17) ----------
{ const { prompts } = loadPlan(planFile);
  let k = 0; const h = { ...fx(), sharedGpuMB: async () => [1000, 1592][Math.min(k++, 1)] };
  const x = await runRow({ plan: { ...plan, spillCheck: true, spillMinusStep: true }, prompts, row: { ...plan.rows[1], args: ['-b', '4096', '-ub', '4096'] }, round: 0, fx: h });
  check('with spillMinusStep, the -ub / 8 MB staging buffer is taken off before judging (step 4096: 592 MB rise passes)', !x.runs[0].failed && x.runs[0].sharedRiseMB === 592 && x.runs[0].stagingMB === 512);
  let j = 0; const g = { ...fx(), sharedGpuMB: async () => [1000, 2200][Math.min(j++, 1)] };
  const y = await runRow({ plan: { ...plan, spillCheck: true, spillMinusStep: true }, prompts, row: { ...plan.rows[1], args: ['-b', '4096', '-ub', '4096'] }, round: 0, fx: g });
  check('a rise well past the staging buffer still fails, and says how much was the buffer', /rose 1200 MB during the load \(512 MB of it the engine's own staging buffer\)/.test(y.runs[0].failed || '')); }

// ---------- Same answer, fair writing comparison (Nov 17) ----------
{ const run = (prompt, sha, w) => ({ prompt, textSha: sha, writeTps: w, readTps: 1, firstWordMs: 1, gaps: {}, card: {} });
  const md = summarise([{ row: 'A', round: 0, runs: [run('short', 'aaaa1111bbbb', 90), run('long', 'cc', 80)] }, { row: 'B', round: 0, runs: [run('short', 'aaaa1111bbbb', 95), run('long', 'dd', 70)] }], { prompts: {}, plan: {} });
  check('writing compared only between runs that wrote the same answer', /\| short \| aaaa1111 \| A 90, B 95 \|/.test(md) && !/\| long \| cc/.test(md)); }

// ---------- The written answers, kept when a plan asks (Nov 17) ----------
{ const { prompts } = loadPlan(planFile);
  const f = { ...fx(), stream: async () => ({ writeTps: 40, gaps: { median: 25 }, gapsMs: [], textSha: 'abc', text: 'Hello there.' }) };
  const off = await runRow({ plan, prompts, row: plan.rows[1], round: 0, fx: f });
  const on = await runRow({ plan: { ...plan, saveText: true }, prompts, row: plan.rows[1], round: 0, fx: f });
  check('answers are left out unless the plan asks, the fingerprint always kept', off.runs.length > 0 && off.runs.every((r) => r.text === undefined && r.textSha === 'abc'));
  check('with saveText each run keeps what was written', on.runs.length > 0 && on.runs.every((r) => r.text === 'Hello there.')); }

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
