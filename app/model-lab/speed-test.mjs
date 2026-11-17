#!/usr/bin/env node
// The speed test runner for docs/test-results/2026-11-16-speed-test-method.md (pre-registered, addenda 1 to 4).
//
//   node model-lab/speed-test.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--rounds 5] [--dry]
//
// A plan names the engines (exe + environment), the brain file, the prompts (text files, read once, sha256 recorded)
// and the rows (one setting each: engine, extra flags, environment, live switches set after load (`setup`), which
// prompts, how many words). `promptTokens` cuts a prompt to an exact count of the brain's own tokens, and `question`
// adds a fixed question after the cut. For every round,
// each row is loaded in turn (so heat and background load fall evenly across settings), gets one untimed warm-up, one
// timed run per prompt, and is unloaded. Each timed run streams its answer, so the arrival of every word is kept, and
// the card is sampled every 250 ms with nvidia-smi (temperature, power, clocks, throttle reasons, memory).
//
// Written out, never summarised away: runs.jsonl (every run, every word gap, every card sample, the command line and
// the engine's cache lines), then summary.md (median, min and max per row and prompt; word gap median, p95, p99 and
// longest; throttled runs counted and flagged, not dropped). A row that can't start is recorded as not run, with why.
// With "diskReads": true in the plan, each timed run also records what the disks read (for brains bigger than the
// RAM; /proc/diskstats on Linux, the PhysicalDisk counter on Windows), and the summary gets a disk table.
// While it runs, summary-so-far.md holds the same table from the loads done so far (rewritten between loads, never
// during a timed run), so the columns fill in as it goes. Open it in Notepad and reopen it to see new rows.
//
// Stop rules: the test stops between runs, frees the card and keeps what finished, when the stop file appears (Bob's
// Gaming mode or the owner can write it) or a process on the plan's `games` list starts. It takes the PC test lock
// (plan.lock) and refuses to start while someone else holds it. It never compiles anything and never touches live Bob:
// its own port and folder. Nothing here reads keys.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import os from 'node:os';
import crypto from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { parseCacheLog } from '../src/hot-experts.js';

export const SMI_FIELDS = ['timestamp', 'temperature.gpu', 'power.draw', 'power.limit', 'clocks.sm', 'clocks.mem', 'clocks_throttle_reasons.active', 'memory.used', 'utilization.gpu', 'fan.speed', 'temperature.memory', 'pcie.link.gen.current', 'pcie.link.width.current'];
// nvidia-smi's throttle reasons that mean the card slowed itself (power cap, heat): anything but idle (0x1) or none
const THROTTLE_MASK = 0x2 | 0x4 | 0x8 | 0x20 | 0x40 | 0x80;
// Nov 17: on the test PC every flagged sample was the power cap alone (0x4) at 152 W of 300 W, clocks 0.2% below
// normal: the boost trimming a spike shorter than one sample. A power-cap-only sample counts as throttled only when
// its clock is more than 3% under the run's busy, unflagged median; any other reason always counts.
const POWER_CAP = 0x4;
export function realThrottled(samples) {
  const s = samples.filter(Boolean);
  const free = s.filter((x) => !x.throttled && x.smMHz !== null && !((x.reasons ?? 0) & 0x1) && (x.utilPct ?? 100) >= 50).map((x) => x.smMHz).sort((a, b) => a - b);
  const med = free.length ? free[Math.floor(free.length / 2)] : null;
  return s.filter((x) => x.throttled && (x.reasons !== POWER_CAP || med === null || x.smMHz === null || x.smMHz < 0.97 * med));
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function quantile(xs, q) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
export const median = (xs) => quantile(xs, 0.5);
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

// PowerShell's sum of shared GPU memory in bytes (a number, maybe with a decimal comma) -> whole MB, or null.
export function parseSharedMB(text) { const n = Number(String(text || '').trim().replace(',', '.')); return String(text || '').trim() && Number.isFinite(n) ? Math.round(n / 1048576) : null; }
// One nvidia-smi line -> a sample. Unknown values ("[N/A]") become null.
// Text arrives in chunks that can end mid-line: keep the piece until its line ends.
export function lineSplitter(onLine) {
  let rest = '';
  return (chunk) => { const parts = (rest + String(chunk)).split(/\r?\n/); rest = parts.pop(); for (const l of parts) onLine(l); };
}

export function parseSmiLine(line) {
  const p = String(line || '').split(',').map((s) => s.trim());
  // A whole line has every field we ask for (or the first 8, on an older driver). Anything else is a piece of a line
  // (night 1, Nov 16: pieces were read as whole lines, so card temperatures of 13801 °C appeared).
  if (p.length !== SMI_FIELDS.length && p.length !== 8) return null;
  const n = (s) => { const v = Number(s); return Number.isFinite(v) ? v : null; };
  const reasons = /^0x[0-9a-f]+$/i.test(p[6]) ? parseInt(p[6], 16) : null;
  return { at: p[0], tempC: n(p[1]), powerW: n(p[2]), powerLimitW: n(p[3]), smMHz: n(p[4]), memMHz: n(p[5]), reasons, throttled: reasons !== null && (reasons & THROTTLE_MASK) !== 0, memMB: n(p[7]), utilPct: n(p[8]), fanPct: n(p[9]), memTempC: n(p[10]), pcieGen: n(p[11]), pcieWidth: n(p[12]) };
}
export function cardSummary(samples) {
  const s = samples.filter(Boolean);
  if (!s.length) return { samples: 0 };
  const max = (k) => s.reduce((m, x) => (x[k] !== null && x[k] > m ? x[k] : m), -Infinity);
  const fin = (v) => (Number.isFinite(v) ? v : null);
  return { samples: s.length, maxTempC: max('tempC'), maxMemTempC: fin(max('memTempC')), maxUtilPct: fin(max('utilPct')), maxFanPct: fin(max('fanPct')), minPcieGen: fin(s.reduce((m, x) => (x.pcieGen !== null && x.pcieGen !== undefined && x.pcieGen < m ? x.pcieGen : m), Infinity)), maxPowerW: max('powerW'), peakMemMB: max('memMB'), minSmMHz: s.reduce((m, x) => (x.smMHz !== null && x.smMHz < m ? x.smMHz : m), Infinity), throttledSamples: realThrottled(s).length, powerCapBlips: s.filter((x) => x.throttled).length - realThrottled(s).length };
}

// Processor busy share between two os.cpus() readings, over all cores (0 to 100).
export function cpuBusy(a, b) {
  let busy = 0, all = 0;
  (b || []).forEach((c, i) => {
    const t0 = a?.[i]?.times, t1 = c?.times;
    if (!t0 || !t1) return;
    const d = (k) => Math.max(0, (t1[k] || 0) - (t0[k] || 0));
    const tot = d('user') + d('nice') + d('sys') + d('idle') + d('irq');
    busy += tot - d('idle'); all += tot;
  });
  return all > 0 ? r1((100 * busy) / all) : null;
}
// The PowerShell that reads the system once (Windows only), outside the timed parts: the top 5 processes by
// processor use over one second, the top 5 by graphics use (Windows' own GPU Engine counters), and the processor temperature if the firmware reports one (often it doesn't,
// or only to an administrator; then it says so instead of guessing).
export const SYSTEM_PS = [
  "$ErrorActionPreference='SilentlyContinue'",
  "$p = (Get-Counter '\\Process(*)\\% Processor Time' -SampleInterval 1 -MaxSamples 1).CounterSamples | Where-Object { $_.InstanceName -notin @('_total','idle') } | Sort-Object CookedValue -Descending | Select-Object -First 5 | ForEach-Object { @{ name = $_.InstanceName; pct = [math]::Round($_.CookedValue / [Environment]::ProcessorCount, 1) } }",
  "$t = Get-CimInstance -Namespace root/wmi -ClassName MSAcpi_ThermalZoneTemperature | ForEach-Object { [math]::Round($_.CurrentTemperature / 10 - 273.15, 1) }",
  "$plan = (powercfg /getactivescheme) -join ' '",
  "$g = (Get-Counter '\\GPU Engine(*)\\Utilization Percentage' -MaxSamples 1).CounterSamples | Where-Object { $_.InstanceName -match 'pid_(\\d+)_' } | ForEach-Object { [pscustomobject]@{ id = [int]($_.InstanceName -replace '^pid_(\\d+)_.*$','$1'); v = $_.CookedValue } } | Group-Object id | ForEach-Object { @{ name = (Get-Process -Id ([int]$_.Name)).ProcessName; pct = [math]::Round(($_.Group | Measure-Object v -Sum).Sum, 1) } } | Sort-Object { $_.pct } -Descending | Select-Object -First 5",
  "@{ top = @($p); gpuTop = @($g); cpuTempC = @($t); powerPlan = $plan } | ConvertTo-Json -Compress -Depth 4"
].join('; ');
export function parseSystem(json, { freeMB, totalMB }) {
  let j = {}; try { j = JSON.parse(String(json || '').trim() || '{}'); } catch {}
  const temps = (Array.isArray(j.cpuTempC) ? j.cpuTempC : []).filter(Number.isFinite);
  return { freeRamMB: freeMB, totalRamMB: totalMB, top: Array.isArray(j.top) ? j.top.slice(0, 5) : [], gpuTop: Array.isArray(j.gpuTop) ? j.gpuTop.slice(0, 5) : [], cpuTempC: temps.length ? Math.max(...temps) : null, cpuTempNote: temps.length ? 'ACPI thermal zone (firmware; may lag the cores)' : 'not reported by Windows on this PC', powerPlan: typeof j.powerPlan === 'string' ? j.powerPlan.slice(0, 200) : '' };
}

// HWiNFO's sensor log (a CSV it appends to once a second, started by the owner): the processor's temperature and
// power over one timed run. Only the lines written during the run are read, so no clock or date format is parsed.
// The columns are found by name: Tctl/Tdie or CPU Package for the temperature, CPU Package Power for the power.
export function splitCsv(line) { const out = []; let cur = '', q = false; for (const ch of String(line)) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out.map((x) => x.trim()); }
// Disk reads, for brains bigger than the RAM: bytes read from the disks so far, read before and after each timed run.
// Linux and Android: /proc/diskstats, whole disks only (sectors read x 512). Windows: the raw "Disk Read Bytes/sec"
// counter of PhysicalDisk _Total, which is a running total of bytes. Anything else: not measured (null).
export function parseDiskstats(text) {
  let sectors = 0, seen = 0;
  for (const l of String(text || '').split(/\r?\n/)) {
    const f = l.trim().split(/\s+/);
    if (f.length < 6 || !/^(sd[a-z]+|vd[a-z]+|xvd[a-z]+|hd[a-z]+|nvme\d+n\d+|mmcblk\d+)$/.test(f[2])) continue;
    const n = Number(f[5]); if (Number.isFinite(n)) { sectors += n; seen++; }
  }
  return seen ? sectors * 512 : null;
}
export function parseDiskRaw(text) {
  const n = Number(String(text || '').trim().split(/\r?\n/).pop());
  return Number.isFinite(n) && n >= 0 && String(text || '').trim() !== '' ? n : null;
}
export function diskUse(before, after, written) {
  if (!Number.isFinite(before) || !Number.isFinite(after) || after < before) return null;
  const readMB = r1((after - before) / 1048576);
  return { readMB, mbPerWord: written > 0 ? Math.round(((after - before) / 1048576 / written) * 1000) / 1000 : null };
}

export function hwinfoColumns(header) {
  const h = splitCsv(header);
  const find = (re) => h.findIndex((x) => re.test(x));
  return { temp: find(/(Tctl\/Tdie|CPU \(Tctl|CPU Package|CPU \(Tdie\)|CPU Die).*(°C|\[C\]|C\])/i), power: find(/CPU Package Power/i) };
}
export function parseHwinfo(header, lines) {
  const c = hwinfoColumns(header);
  if (c.temp < 0) return { cpuMaxC: null, cpuNote: 'HWiNFO log has no processor temperature column' };
  const num = (s) => { const v = Number(String(s || '').replace(',', '.')); return Number.isFinite(v) ? v : null; };
  const t = [], w = [];
  for (const l of lines) { if (!l.trim() || /Date|Time/.test(l.slice(0, 12))) continue; const p = splitCsv(l); const a = num(p[c.temp]); if (a !== null) t.push(a); if (c.power >= 0) { const b = num(p[c.power]); if (b !== null) w.push(b); } }
  return { cpuMaxC: t.length ? Math.max(...t) : null, cpuMedianC: t.length ? r1(median(t)) : null, cpuMaxW: w.length ? Math.max(...w) : null, cpuSamples: t.length, ...(t.length ? {} : { cpuNote: 'HWiNFO wrote no lines during this run (is its logging on?)' }) };
}

// One streamed /completion: the time to the first word, every gap between words, and the engine's own timings.
// fetchImpl and now are passed in so the tests run without an engine.
export async function streamOnce(url, body, { fetchImpl = fetch, now = () => performance.now(), timeoutMs = 20 * 60e3 } = {}) {
  const t0 = now();
  const res = await fetchImpl(url + '/completion', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, stream: true }), signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`the engine answered ${res.status}`);
  const arrivals = [];
  let timings = null, buf = '', text = '';
  const dec = new TextDecoder();
  for await (const chunk of res.body) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch { continue; }
      if (typeof ev.content === 'string' && ev.content.length) { arrivals.push(now()); text += ev.content; }
      if (ev.timings) timings = ev.timings;
    }
  }
  const gaps = arrivals.slice(1).map((t, k) => t - arrivals[k]);
  return {
    firstWordMs: arrivals.length ? r1(arrivals[0] - t0) : null,
    totalMs: r1(now() - t0),
    words: arrivals.length,
    gaps: { median: r1(median(gaps)), p95: r1(quantile(gaps, 0.95)), p99: r1(quantile(gaps, 0.99)), max: r1(gaps.length ? Math.max(...gaps) : null) },
    gapsMs: gaps.map(r1),
    readTps: r1(Number(timings?.prompt_per_second)), writeTps: r1(Number(timings?.predicted_per_second)),
    promptN: timings?.prompt_n ?? null, writtenN: timings?.predicted_n ?? null,
    ...(timings?.draft_n ? { draftN: timings.draft_n, draftKept: timings.draft_n_accepted, keptPct: r1((100 * timings.draft_n_accepted) / timings.draft_n) } : {}),
    textSha: sha256(text)
  };
}

export async function freePort() {
  return new Promise((ok, bad) => { const s = net.createServer(); s.unref(); s.on('error', bad); s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => ok(port)); }); });
}

// Check a plan, read its prompts and fingerprint everything. -> { plan, prompts: {id: {text, sha}}, problems: [] }
// ${NAME} in the plan is filled from `vars` (the command line's --var NAME=value), so one plan serves every PC: the
// brain's and engines' places are given when it runs, never written into the plan.
export function loadPlan(file, { read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'), vars = {} } = {}) {
  const missing = new Set();
  const raw = read(file).replace(/\$\{([A-Z0-9_]+)\}/g, (m, k) => { if (vars[k] === undefined) { missing.add(k); return m; } return JSON.stringify(String(vars[k])).slice(1, -1); });
  const plan = JSON.parse(raw);
  const base = path.dirname(file);
  const problems = [...missing].map((k) => `no value for \${${k}} (pass --var ${k}=...)`);
  if (!plan.brain) problems.push('no brain file');
  if (!plan.engines || !Object.keys(plan.engines).length) problems.push('no engines');
  if (!Array.isArray(plan.rows) || !plan.rows.length) problems.push('no rows');
  const prompts = {};
  for (const [id, f] of Object.entries(plan.prompts || {})) {
    try {
      const text = read(path.resolve(base, f));
      let chat = null;
      if (/\.json$/i.test(f)) { try { const j = JSON.parse(text); if (Array.isArray(j.messages)) chat = j; } catch {} if (!chat) problems.push(`prompt ${id}: a .json prompt needs "messages"`); }
      prompts[id] = { text, sha: sha256(text), ...(chat ? { chat } : {}) };
    } catch { problems.push(`prompt ${id} can't be read`); }
  }
  for (const r of plan.rows || []) {
    if (!r.id) problems.push('a row with no id');
    if (!plan.engines?.[r.engine]) problems.push(`row ${r.id}: no engine "${r.engine}"`);
    for (const p of r.prompts || []) if (!prompts[p]) problems.push(`row ${r.id}: no prompt "${p}"`);
  }
  const ids = (plan.rows || []).map((r) => r.id);
  if (new Set(ids).size !== ids.length) problems.push('two rows share an id');
  return { plan, prompts, problems };
}

// The order of loads: every row once per round, rows in turn (1, 2, 3, 1, 2, 3...).
export const schedule = (rows, rounds) => Array.from({ length: rounds }, (_, round) => rows.map((row) => ({ round, row }))).flat();

// One load of one row: start, warm up, one timed run per prompt, stop. Everything is injected for the tests.
// Nov 17 (the owner: "if 4 doesn't load and 2 does, maybe 3 would be a sweet spot?"): row.cacheDown [3072, 2048]
// steps a hot-experts cache that doesn't fit down to the next size: when the load doesn't start, or a run fails (out
// of memory, or a spill). The load ends at the biggest size that ran cleanly, and says so (cacheMiB, steppedDown).
// A stop (game, stop file) or a skip for a busy card is never stepped down.
export async function runRow({ plan, prompts, row, round, fx }) {
  const at = (row.args || []).indexOf('--moe-cache-mib');
  if (!(at >= 0 && Array.isArray(row.cacheDown) && row.cacheDown.length)) return runRowOnce({ plan, prompts, row, round, fx });
  const sizes = [Number(row.args[at + 1]), ...row.cacheDown.map(Number)].filter((n) => n > 0);
  const steppedDown = [];
  let res = null;
  for (const mib of sizes) {
    const args = row.args.slice(); args[at + 1] = String(mib);
    res = await runRowOnce({ plan, prompts, row: { ...row, args }, round, fx });
    res.cacheMiB = mib;
    const bad = res.notRun || res.runs.find((x) => x.failed)?.failed;
    if (res.stopped || !bad || /^skipped:/.test(res.notRun || '')) break;
    if (mib !== sizes[sizes.length - 1]) steppedDown.push({ mib, why: bad });
  }
  if (steppedDown.length) res.steppedDown = steppedDown;
  return res;
}
async function runRowOnce({ plan, prompts, row, round, fx }) {
  const eng = plan.engines[row.engine];
  const port = await fx.port();
  const args = ['-m', row.brain || plan.brain, '--host', '127.0.0.1', '--port', String(port), ...(row.noBase ? [] : plan.baseArgs || []), ...(row.args || [])];
  // Every engine prints its info lines (cache totals, ranked fill, prefetch count): llama-server hides them below -lv 4.
  if (!args.some((a) => ['-lv', '--verbosity', '--log-verbosity', '-v', '--verbose', '--log-verbose'].includes(a))) args.push('-lv', '4');
  const env = { ...(eng.env || {}), ...(row.env || {}) };
  const out = { round, row: row.id, engine: row.engine, cmd: [eng.exe, ...args].join(' '), env: Object.keys(env), runs: [] };
  // plan.coolDown {cardC, maxWaitS}: before each load, wait for the card to cool to cardC (laptops), so a hot row
  // never hands its heat to the next one. The wait and the start temperature are recorded, never hidden.
  if (plan.coolDown && fx.cardTempC) {
    const want = plan.coolDown.cardC ?? 60, most = plan.coolDown.maxWaitS ?? 300, step = plan.coolDown.everyS ?? 5;
    let t = await fx.cardTempC(), waited = 0;
    const startC = t;
    while (Number.isFinite(t) && t > want && waited < most && !fx.shouldStop()) { await fx.sleep(step * 1000); waited += step; t = await fx.cardTempC(); }
    out.coolDown = { startC, endC: t, waitedS: waited, hitLimit: Number.isFinite(t) && t > want };
  }
  // Nov 17 (the owner: "if 6 doesn't fit my computer won't crash, will it?"): row.needFreeMB skips a load when the card
  // has less free than that before it starts (something else is on it), written down as not run, never as slow.
  if (row.needFreeMB && fx.cardFreeMB) {
    const free = await fx.cardFreeMB();
    out.cardFreeMB = free;
    if (Number.isFinite(free) && free < row.needFreeMB) { out.notRun = `skipped: ${free} MB free on the card before loading, ${row.needFreeMB} MB wanted`; return out; }
  }
  // plan.spillCheck: on Windows the driver can quietly put card memory in RAM when the card is full ("sysmem
  // fallback"). Shared GPU memory is read before the load and after each timed run; a rise over plan.spillMB (512)
  // marks that run failed, so a spilled run never counts as a slow speed.
  const spill0 = plan.spillCheck && fx.sharedGpuMB ? await fx.sharedGpuMB() : null;
  out.sysBefore = await fx.system?.(); // processor and RAM, CPU temperature if Windows gives it, top processes; before the load
  const srv = await fx.start(eng.exe, args, env);
  try {
    const up = await srv.ready();
    if (!up.ok) { out.notRun = up.why || 'the engine didn\'t start'; return out; }
    out.load = parseCacheLog(srv.log());
    // live switches a row sets after load (Brain Engine: expert mask, dials, experts per word), each a POST
    for (const c of row.setup || []) {
      let b = c.body;
      // {"allBut": N}: the expert mask keeping every expert but N, however many the brain has
      if (c.allBut !== undefined) { const n = (await fx.get(srv.url, '/experts-per-word'))?.n_expert || 0; b = { keep: Array.from({ length: n }, (_, i) => i).filter((i) => i !== c.allBut) }; }
      const r = await fx.post(srv.url, c.path, b);
      if (!r.ok) { out.notRun = `setup ${c.path} refused: ${r.why || r.status}`; return out; }
    }
    // a prompt cut to an exact number of the brain's own tokens (plan.prompts.<id>.tokens), done once per load
    const cut = {};
    for (const p of row.prompts || []) {
      // a chat prompt (a JSON file with messages and tools, Bob's real start) goes through the brain's own template
      if (prompts[p].chat) { cut[p] = await fx.template(srv.url, prompts[p].chat); continue; }
      const want = plan.promptTokens?.[p];
      if (!want) continue;
      const toks = await fx.tokenize(srv.url, prompts[p].text);
      if (toks.length < want) { out.notRun = `prompt ${p} has only ${toks.length} tokens, ${want} wanted`; return out; }
      cut[p] = await fx.detokenize(srv.url, toks.slice(0, want));
    }
    const textOf = (p) => (cut[p] !== undefined ? cut[p] + (plan.question?.[p] || '') : prompts[p].text);
    const body = (text) => ({ prompt: text, n_predict: row.maxTokens ?? plan.maxTokens ?? 300, temperature: 0, seed: 42, ignore_eos: true, cache_prompt: false, ...(row.body || {}) });
    await fx.stream(srv.url, { ...body(row.prompts?.[0] ? textOf(row.prompts[0]) : 'Hello.'), n_predict: 16 }); // warm-up, untimed
    for (const p of row.prompts || []) {
      if (fx.shouldStop()) { out.stopped = fx.shouldStop(); break; }
      const disk0 = plan.diskReads ? await fx.diskReadBytes?.() : null; // off unless the plan asks (a PowerShell call each side on Windows)
      const card = fx.sampleCard();
      const cpu = fx.cpuMark?.();
      let r;
      try { r = await fx.stream(srv.url, body(textOf(p))); } catch (e) { r = { failed: String(e.message || e) }; }
      const samples = card.stop();
      const proc = cpu?.stop();
      const disk = plan.diskReads ? diskUse(disk0, await fx.diskReadBytes?.(), r?.writtenN ?? r?.words ?? 0) : null;
      if (Number.isFinite(spill0)) {
        const now = await fx.sharedGpuMB();
        const rise = Number.isFinite(now) ? now - spill0 : null;
        // Nov 17 (npc engine logs): the engine pins a RAM staging buffer for the card sized to the reading step
        // ("CUDA_Host compute buffer", -ub / 8 MiB: 512 MiB at 4096), and Windows counts it as shared GPU memory.
        // It is not a spill, so with plan.spillMinusStep the rise past that buffer is what's judged.
        const ub = Number(args[args.lastIndexOf('-ub') + 1]) || 512;
        const own = plan.spillMinusStep ? Math.round(ub / 8) : 0;
        r = { ...r, sharedRiseMB: rise, ...(own ? { stagingMB: own } : {}) };
        if (rise - own > (plan.spillMB ?? 512) && !r.failed) r.failed = `spilled: shared GPU memory rose ${rise} MB during the load${own ? ` (${own} MB of it the engine's own staging buffer)` : ''} (card memory put in RAM)`;
      }
      out.runs.push({ prompt: p, ...r, ...(proc ? { cpu: proc } : {}), ...(disk ? { disk } : {}), card: cardSummary(samples), throttled: realThrottled(samples).length > 0, cardSamples: samples });
    }
    out.cache = parseCacheLog(srv.log()); // with LLAMA_MOE_CACHE_LOG_EVERY set, the latest totals
  } finally { await srv.stop(); }
  out.sysAfter = await fx.system?.();
  return out;
}

// The tables: per row and prompt, median with min and max, never a mean alone.
// The same table as summary.md, from the loads done so far, with how far along the run is on top.
export function liveSummary(results, { prompts = {}, plan = {}, total = 0, now = new Date() } = {}) {
  const done = results.filter((r) => !r.notRun).length;
  const head = `> In progress: ${done} of ${total} loads done (updated ${now.toLocaleTimeString()}). Medians firm up as rounds finish; summary.md is written at the end.\n\n`;
  return head + summarise(results, { prompts, plan });
}

export function summarise(results, { prompts = {}, plan = {} } = {}) {
  const by = new Map();
  for (const res of results) {
    if (res.notRun) { by.set(`${res.row}|-`, { row: res.row, prompt: '-', notRun: res.notRun, runs: [] }); continue; }
    for (const run of res.runs) {
      const k = `${res.row}|${run.prompt}`;
      if (!by.has(k)) by.set(k, { row: res.row, prompt: run.prompt, runs: [] });
      by.get(k).runs.push(run);
    }
  }
  const mm = (xs) => { const a = xs.filter(Number.isFinite); return a.length ? `${r1(median(a))} (${r1(Math.min(...a))} to ${r1(Math.max(...a))})` : '-'; };
  const lines = [
    `# Speed test results: ${plan.name || 'unnamed plan'}`, '',
    'Median, with min and max in brackets, over the timed runs. Throttled runs are kept and counted. Raw numbers: runs.jsonl.', '',
    `Prompts: ${Object.entries(prompts).map(([id, p]) => `${id} sha256 ${p.sha.slice(0, 16)}`).join('; ') || 'none'}.`, '',
    '| Row | Prompt | Runs | First word (ms) | Reading (t/s) | Writing (t/s) | Gap p50 / p99 / max (ms) | Kept guesses | Peak card MB | Throttled |',
    '|---|---|---|---|---|---|---|---|---|---|'
  ];
  for (const g of by.values()) {
    if (g.notRun) { lines.push(`| ${g.row} | - | 0 | not run: ${g.notRun} | | | | | | |`); continue; }
    const ok = g.runs.filter((x) => !x.failed);
    lines.push(`| ${g.row} | ${g.prompt} | ${ok.length}${g.runs.length > ok.length ? ` (+${g.runs.length - ok.length} failed)` : ''} | ${mm(ok.map((x) => x.firstWordMs))} | ${mm(ok.map((x) => x.readTps))} | ${mm(ok.map((x) => x.writeTps))} | ${r1(median(ok.map((x) => x.gaps?.median)))} / ${r1(median(ok.map((x) => x.gaps?.p99)))} / ${r1(Math.max(...ok.map((x) => x.gaps?.max ?? -Infinity)))} | ${ok.some((x) => x.keptPct !== undefined) ? mm(ok.map((x) => x.keptPct)) + '%' : '-'} | ${mm(ok.map((x) => x.card?.peakMemMB))} | ${ok.filter((x) => x.throttled).length} |`);
  }
  const cond = [...by.values()].filter((g) => !g.notRun && g.runs.some((x) => x.card?.samples || x.cpu));
  if (cond.length) {
    lines.push('', 'Conditions during the timed runs (median, with min and max):', '', '| Row | Prompt | Card max °C | Card memory max °C | Card busy max % | Fan max % | Lowest core MHz | Processor busy % | Processor max °C (HWiNFO) | Free RAM MB |', '|---|---|---|---|---|---|---|---|---|---|');
    for (const g of cond) { const ok = g.runs.filter((x) => !x.failed); lines.push(`| ${g.row} | ${g.prompt} | ${mm(ok.map((x) => x.card?.maxTempC))} | ${mm(ok.map((x) => x.card?.maxMemTempC))} | ${mm(ok.map((x) => x.card?.maxUtilPct))} | ${mm(ok.map((x) => x.card?.maxFanPct))} | ${mm(ok.map((x) => x.card?.minSmMHz))} | ${mm(ok.map((x) => x.cpu?.busyPct))} | ${mm(ok.map((x) => x.cpu?.cpuMaxC))} | ${mm(ok.map((x) => x.cpu?.freeRamMB))} |`); }
  }
  const diskRows = [...by.values()].filter((g) => !g.notRun && g.runs.some((x) => x.disk));
  if (diskRows.length) {
    lines.push('', 'Read from the disk during the timed runs (median, with min and max; all programs, so near zero means the brain stayed in RAM):', '', '| Row | Prompt | Read MB | MB per written word |', '|---|---|---|---|');
    for (const g of diskRows) { const ok = g.runs.filter((x) => !x.failed); lines.push(`| ${g.row} | ${g.prompt} | ${mm(ok.map((x) => x.disk?.readMB))} | ${mm(ok.map((x) => x.disk?.mbPerWord))} |`); }
  }
  const hwNotes = [...new Set(results.flatMap((x) => (x.runs || []).map((r) => r.cpu?.cpuNote)).filter(Boolean))];
  if (hwNotes.length) lines.push('', `Processor temperature notes: ${hwNotes.join('; ')}.`);
  const temps = results.map((x) => x.sysBefore?.cpuTempC).filter(Number.isFinite);
  if (results.some((x) => x.sysBefore)) lines.push('', temps.length ? `Processor temperature before each load (ACPI thermal zone): ${r1(median(temps))} °C median (${r1(Math.min(...temps))} to ${r1(Math.max(...temps))}).` : (results.some((x) => (x.runs || []).some((r) => Number.isFinite(r.cpu?.cpuMaxC))) ? 'Before each load, Windows itself reports no processor temperature here; the per-run figures above come from HWiNFO.' : 'Processor temperature: not reported by Windows on this PC, and no HWiNFO log was given.'));
  // How much of each run the card spent slowed by heat or its power cap (laptops): share of the 250 ms samples.
  const share = (x) => (x.card?.samples ? (100 * (x.card.throttledSamples || 0)) / x.card.samples : null);
  const slowed = [...by.values()].filter((g) => g.runs.some((x) => share(x) > 0));
  if (slowed.length) {
    lines.push('', 'Time the card spent throttled (share of samples, median with min and max; then the writing speed of the least and most throttled run):', '', '| Row | Prompt | Throttled % | Writing t/s, least throttled | Writing t/s, most throttled |', '|---|---|---|---|---|');
    for (const g of slowed) { const ok = g.runs.filter((x) => !x.failed && share(x) !== null).sort((a, b) => share(a) - share(b)); lines.push(`| ${g.row} | ${g.prompt} | ${mm(ok.map(share))} | ${r1(ok[0]?.writeTps)} | ${r1(ok[ok.length - 1]?.writeTps)} |`); }
  }
  const cools = results.map((x) => x.coolDown).filter(Boolean);
  if (cools.length) { const w = cools.map((c) => c.waitedS); lines.push('', `Cool-down before each load (to ${plan.coolDown?.cardC ?? 60} °C): waited ${r1(median(w))} s median (${r1(Math.min(...w))} to ${r1(Math.max(...w))}); card ${r1(median(cools.map((c) => c.startC).filter(Number.isFinite)))} °C median at the start; ${cools.filter((c) => c.hitLimit).length} of ${cools.length} loads started above the target after the longest wait.`); }
  const twice = [...by.values()].filter((g) => g.runs.filter((x) => x.throttled).length > 1).map((g) => `${g.row}/${g.prompt}`);
  if (twice.length) lines.push('', `More than one throttled run (to be run again, both sets published, per the method): ${twice.join(', ')}.`);
  const cache = results.filter((x) => x.cache?.small || x.load?.refused);
  if (cache.length) {
    lines.push('', '| Row | Round | Ranked fill | Refused | Small batches: hits / misses (on the CPU) | CPU share | MB copied |', '|---|---|---|---|---|---|---|');
    for (const x of cache) lines.push(`| ${x.row} | ${x.round + 1} | ${x.load?.filled ?? '-'} | ${x.load?.refused || '-'} | ${x.cache?.small ? `${x.cache.small.hits} / ${x.cache.small.misses} (${x.cache.small.cpu})` : '-'} | ${x.cache?.small ? x.cache.small.cpuShare + '%' : '-'} | ${x.cache?.small?.uploadedMiB ?? '-'} |`);
  }
  const sized = results.filter((x) => x.cacheMiB);
  if (sized.some((x) => x.steppedDown)) {
    lines.push('', 'Hot-experts cache each load ran with (a size that didn\'t load or failed a run was stepped down):', '', '| Row | Round | Ran with | Stepped down from |', '|---|---|---|---|');
    for (const x of sized) lines.push(`| ${x.row} | ${x.round + 1} | ${x.notRun ? 'none (not run)' : `${x.cacheMiB} MiB`} | ${(x.steppedDown || []).map((d) => `${d.mib} MiB (${d.why})`).join('; ') || '-'} |`);
  }
  const stopped = results.find((x) => x.stopped);
  if (stopped) lines.push('', `Stopped early: ${stopped.stopped}. Rows after that are not run.`);
  return lines.join('\n') + '\n';
}

// The real world: spawn the engine, sample the card, the stop rules, the lock.
function realFx(plan, outDir) {
  const logDir = path.join(outDir, 'engine-logs');
  fs.mkdirSync(logDir, { recursive: true });
  let n = 0;
  return {
    port: freePort,
    start(exe, args, env) {
      const file = path.join(logDir, `${String(++n).padStart(3, '0')}.log`);
      const child = nodeSpawn(exe, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
      let said = '';
      const log = fs.createWriteStream(file);
      const keep = lineSplitter((line) => { if (/MoE cache|ranked fill|llama_moe_cache:/.test(line)) said += line + '\n'; });
      child.stderr.on('data', (d) => { log.write(d); keep(d); });
      const url = `http://127.0.0.1:${args[args.indexOf('--port') + 1]}`;
      return {
        url, log: () => said,
        async ready() {
          const t0 = Date.now();
          while (Date.now() - t0 < (plan.loadTimeoutMs || 10 * 60e3)) {
            if (child.exitCode !== null) return { ok: false, why: `stopped while loading (code ${child.exitCode}); see ${path.basename(file)}` };
            try { if ((await fetch(url + '/health', { signal: AbortSignal.timeout(2000) })).ok) return { ok: true }; } catch {}
            await new Promise((r) => setTimeout(r, 1000));
          }
          return { ok: false, why: 'took too long to load' };
        },
        async stop() { try { child.kill(); } catch {} await new Promise((r) => { if (child.exitCode !== null) r(); else { child.once('exit', r); setTimeout(r, 10e3); } }); log.end(); }
      };
    },
    stream: (url, body) => streamOnce(url, body),
    async get(url, p) { try { const r = await fetch(url + p, { signal: AbortSignal.timeout(30e3) }); return r.ok ? await r.json() : null; } catch { return null; } },
    async post(url, p, body) { try { const r = await fetch(url + p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.timeout(60e3) }); return { ok: r.ok, status: r.status, why: r.ok ? '' : (await r.text()).slice(0, 200) }; } catch (e) { return { ok: false, why: String(e.message || e) }; } },
    async template(url, chat) { const r = await fetch(url + '/apply-template', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: chat.messages, tools: chat.tools, chat_template_kwargs: { enable_thinking: false } }) }); if (!r.ok) throw new Error(`apply-template ${r.status}`); return (await r.json()).prompt; },
    async tokenize(url, content) { const r = await fetch(url + '/tokenize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ content }) }); return (await r.json()).tokens || []; },
    async detokenize(url, tokens) { const r = await fetch(url + '/detokenize', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tokens }) }); return (await r.json()).content || ''; },
    async cardTempC() { return new Promise((r) => { let o = ''; try { const c = nodeSpawn('nvidia-smi', ['--query-gpu=temperature.gpu', '--format=csv,noheader,nounits'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); c.on('error', () => r(null)); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => { const n = parseFloat(o); r(Number.isFinite(n) ? n : null); }); } catch { r(null); } }); },
    sleep(ms) { return new Promise((r) => setTimeout(r, ms)); },
    async cardFreeMB() { return new Promise((r) => { let o = ''; try { const c = nodeSpawn('nvidia-smi', ['--query-gpu=memory.free', '--format=csv,noheader,nounits'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); c.on('error', () => r(null)); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => { const n = parseFloat(o); r(Number.isFinite(n) ? n : null); }); } catch { r(null); } }); },
    // Windows only: the sum of every graphics adapter's shared memory in use, in MB (null elsewhere or on error).
    async sharedGpuMB() {
      if (process.platform !== 'win32') return null;
      return new Promise((r) => { let o = ''; try { const c = nodeSpawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', "((Get-Counter '\\GPU Adapter Memory(*)\\Shared Usage').CounterSamples | Measure-Object CookedValue -Sum).Sum"], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); c.on('error', () => r(null)); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => r(parseSharedMB(o))); setTimeout(() => { try { c.kill(); } catch {} r(parseSharedMB(o)); }, 20e3); } catch { r(null); } });
    },
    async diskReadBytes() {
      if (process.platform === 'linux' || process.platform === 'android') { try { return parseDiskstats(fs.readFileSync('/proc/diskstats', 'utf8')); } catch { return null; } }
      if (process.platform !== 'win32') return null;
      return new Promise((r) => { let o = ''; try { const c = nodeSpawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', "(Get-CimInstance Win32_PerfRawData_PerfDisk_PhysicalDisk -Filter \"Name='_Total'\").DiskReadBytesPersec"], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); c.on('error', () => r(null)); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => r(parseDiskRaw(o))); setTimeout(() => { try { c.kill(); } catch {} r(parseDiskRaw(o)); }, 20e3); } catch { r(null); } });
    },
    sampleCard() {
      const samples = [];
      let smi = null;
      try { smi = nodeSpawn('nvidia-smi', [`--query-gpu=${SMI_FIELDS.join(',')}`, '--format=csv,noheader,nounits', '-lms', '250'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); smi.on('error', () => {}); smi.stdout.on('data', lineSplitter((l) => { const s = parseSmiLine(l); if (s) samples.push(s); })); } catch {}
      return { stop: () => { try { smi?.kill(); } catch {} return samples; } };
    },
    cpuMark() {
      const a = os.cpus();
      const hw = plan.hwinfoCsv; let from = 0;
      if (hw) { try { from = fs.statSync(hw).size; } catch { from = -1; } }
      return { stop: () => {
        const out = { busyPct: cpuBusy(a, os.cpus()), freeRamMB: Math.round(os.freemem() / 1048576) };
        if (!hw) return out;
        try {
          if (from < 0) return { ...out, cpuNote: 'HWiNFO log not found' };
          const all = fs.readFileSync(hw, 'latin1');
          const header = all.slice(0, all.indexOf('\n')).replace(/\r$/, '');
          const fresh = all.slice(from).split('\n').map((l) => l.replace(/\r$/, ''));
          return { ...out, ...parseHwinfo(header, fresh) };
        } catch (e) { return { ...out, cpuNote: `HWiNFO log unreadable: ${e.message}` }; }
      } };
    },
    async system() {
      const base = { freeMB: Math.round(os.freemem() / 1048576), totalMB: Math.round(os.totalmem() / 1048576) };
      if (process.platform !== 'win32') return parseSystem('', base);
      const json = await new Promise((r) => { let o = ''; try { const c = nodeSpawn('powershell', ['-NoProfile', '-NonInteractive', '-Command', SYSTEM_PS], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); c.on('error', () => r('')); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => r(o)); setTimeout(() => { try { c.kill(); } catch {} r(o); }, 20e3); } catch { r(''); } });
      return parseSystem(json, base);
    },
    shouldStop() {
      if (plan.stopFile && fs.existsSync(plan.stopFile)) return 'the stop file appeared (Gaming mode or the owner)';
      return '';
    }
  };
}

// Once per test: the card and its driver, Windows, the processor, RAM, node, each engine's sha256 and the brain's size.
async function environment(plan) {
  const run = (exe, args) => new Promise((r) => { let o = ''; try { const c = nodeSpawn(exe, args, { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); c.on('error', () => r('')); c.stdout.on('data', (d) => { o += d; }); c.on('exit', () => r(o.trim())); } catch { r(''); } });
  const fileSha = (f) => new Promise((r) => { try { const h = crypto.createHash('sha256'); fs.createReadStream(f).on('data', (d) => h.update(d)).on('end', () => r(h.digest('hex'))).on('error', () => r('')); } catch { r(''); } });
  const engines = {};
  for (const [k, e] of Object.entries(plan.engines || {})) engines[k] = { exe: path.basename(e.exe || ''), sha256: await fileSha(e.exe) };
  let brainBytes = null; try { brainBytes = fs.statSync(plan.brain).size; } catch {}
  return {
    at: new Date().toISOString(),
    card: await run('nvidia-smi', ['--query-gpu=name,driver_version,vbios_version,memory.total,power.limit,pcie.link.gen.max,pcie.link.width.max', '--format=csv,noheader']),
    os: `${os.type()} ${os.release()} ${typeof os.version === 'function' ? os.version() : ''}`.trim(),
    cpu: os.cpus()?.[0]?.model || '', cores: os.cpus()?.length || 0, ramMB: Math.round(os.totalmem() / 1048576), node: process.version,
    engines, brain: { file: path.basename(plan.brain || ''), bytes: brainBytes }
  };
}

export function takeLock(lockFile, who, { exists = fs.existsSync, write = fs.writeFileSync, read = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  if (!lockFile) return { ok: true, release: () => {} };
  if (exists(lockFile)) { let held = ''; try { held = read(lockFile).trim().split('\n')[0]; } catch {} return { ok: false, why: `the PC test lock is held: ${held || 'by someone'}` }; }
  write(lockFile, `${who} since ${new Date().toISOString()}\n`);
  return { ok: true, release: () => { try { fs.rmSync(lockFile, { force: true }); } catch {} } };
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const planFile = opt('--plan');
  const outDir = opt('--out');
  if (!planFile || !outDir) { console.log('node model-lab/speed-test.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--rounds 5] [--dry]'); process.exit(2); }
  const vars = {};
  a.forEach((x, i) => { if (x === '--var' && a[i + 1]) { const [k, ...v] = a[i + 1].split('='); vars[k] = v.join('='); } });
  const { plan, prompts, problems } = loadPlan(planFile, { vars });
  if (opt('--hwinfo')) plan.hwinfoCsv = opt('--hwinfo'); // HWiNFO's sensor log, for the processor temperature
  if (problems.length) { console.error('The plan has problems:\n- ' + problems.join('\n- ')); process.exit(1); }
  const rounds = Number(opt('--rounds', plan.rounds || 5));
  const order = schedule(plan.rows, rounds);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'plan-fingerprint.json'), JSON.stringify({ plan: sha256(JSON.stringify(plan)), prompts: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.sha])), rounds, loads: order.length }, null, 2));
  if (a.includes('--dry')) { console.log(`${order.length} loads (${plan.rows.length} rows x ${rounds} rounds). Prompts: ${Object.entries(prompts).map(([k, v]) => `${k} ${v.sha.slice(0, 12)}`).join(', ')}. Nothing started.`); return; }
  fs.writeFileSync(path.join(outDir, 'environment.json'), JSON.stringify(await environment(plan), null, 2));
  const lock = takeLock(plan.lock, 'speed-test');
  if (!lock.ok) { console.error(lock.why); process.exit(3); }
  const fx = realFx(plan, outDir);
  const results = [];
  const jsonl = path.join(outDir, 'runs.jsonl');
  try {
    for (const { round, row } of order) {
      const why = fx.shouldStop();
      if (why) { results.push({ round, row: row.id, notRun: why, stopped: why, runs: [] }); break; }
      console.log(`round ${round + 1}/${rounds}: ${row.id}`);
      const res = await runRow({ plan, prompts, row, round, fx });
      results.push(res);
      fs.appendFileSync(jsonl, JSON.stringify(res) + '\n');
      // Between loads, never during a timed run: the table so far, for anyone watching (open it in Notepad).
      fs.writeFileSync(path.join(outDir, 'summary-so-far.md'), liveSummary(results, { prompts, plan, total: order.length }));
      if (res.stopped) break;
    }
  } finally { lock.release(); }
  fs.writeFileSync(path.join(outDir, 'summary.md'), summarise(results, { prompts, plan }));
  console.log(`Done. ${path.join(outDir, 'summary.md')}`);
}

const realOf = (f) => { try { return fs.realpathSync(f); } catch { return path.resolve(f); } };
// fileURLToPath, not .pathname: a folder with a space comes back as %20 and main() never ran.
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e); process.exit(1); });
