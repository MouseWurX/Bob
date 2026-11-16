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
//
// Stop rules: the test stops between runs, frees the card and keeps what finished, when the stop file appears (Bob's
// Gaming mode or the owner can write it) or a process on the plan's `games` list starts. It takes the PC test lock
// (plan.lock) and refuses to start while someone else holds it. It never compiles anything and never touches live Bob:
// its own port and folder. Nothing here reads keys.
import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import crypto from 'node:crypto';
import { spawn as nodeSpawn } from 'node:child_process';
import { parseCacheLog } from '../src/hot-experts.js';

export const SMI_FIELDS = ['timestamp', 'temperature.gpu', 'power.draw', 'power.limit', 'clocks.sm', 'clocks.mem', 'clocks_throttle_reasons.active', 'memory.used'];
// nvidia-smi's throttle reasons that mean the card slowed itself (power cap, heat): anything but idle (0x1) or none
const THROTTLE_MASK = 0x2 | 0x4 | 0x8 | 0x20 | 0x40 | 0x80;

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export function quantile(xs, q) {
  const a = xs.filter(Number.isFinite).sort((x, y) => x - y);
  if (!a.length) return null;
  const i = (a.length - 1) * q, lo = Math.floor(i), hi = Math.ceil(i);
  return a[lo] + (a[hi] - a[lo]) * (i - lo);
}
export const median = (xs) => quantile(xs, 0.5);
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10);

// One nvidia-smi line -> a sample. Unknown values ("[N/A]") become null.
export function parseSmiLine(line) {
  const p = String(line || '').split(',').map((s) => s.trim());
  if (p.length < SMI_FIELDS.length) return null;
  const n = (s) => { const v = Number(s); return Number.isFinite(v) ? v : null; };
  const reasons = /^0x[0-9a-f]+$/i.test(p[6]) ? parseInt(p[6], 16) : null;
  return { at: p[0], tempC: n(p[1]), powerW: n(p[2]), powerLimitW: n(p[3]), smMHz: n(p[4]), memMHz: n(p[5]), reasons, throttled: reasons !== null && (reasons & THROTTLE_MASK) !== 0, memMB: n(p[7]) };
}
export function cardSummary(samples) {
  const s = samples.filter(Boolean);
  if (!s.length) return { samples: 0 };
  const max = (k) => s.reduce((m, x) => (x[k] !== null && x[k] > m ? x[k] : m), -Infinity);
  return { samples: s.length, maxTempC: max('tempC'), maxPowerW: max('powerW'), peakMemMB: max('memMB'), minSmMHz: s.reduce((m, x) => (x.smMHz !== null && x.smMHz < m ? x.smMHz : m), Infinity), throttledSamples: s.filter((x) => x.throttled).length };
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
export async function runRow({ plan, prompts, row, round, fx }) {
  const eng = plan.engines[row.engine];
  const port = await fx.port();
  const args = ['-m', row.brain || plan.brain, '--host', '127.0.0.1', '--port', String(port), ...(row.noBase ? [] : plan.baseArgs || []), ...(row.args || [])];
  const env = { ...(eng.env || {}), ...(row.env || {}) };
  const out = { round, row: row.id, engine: row.engine, cmd: [eng.exe, ...args].join(' '), env: Object.keys(env), runs: [] };
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
      const card = fx.sampleCard();
      let r;
      try { r = await fx.stream(srv.url, body(textOf(p))); } catch (e) { r = { failed: String(e.message || e) }; }
      const samples = card.stop();
      out.runs.push({ prompt: p, ...r, card: cardSummary(samples), throttled: samples.some((x) => x?.throttled), cardSamples: samples });
    }
    out.cache = parseCacheLog(srv.log()); // with LLAMA_MOE_CACHE_LOG_EVERY set, the latest totals
  } finally { await srv.stop(); }
  return out;
}

// The tables: per row and prompt, median with min and max, never a mean alone.
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
  const twice = [...by.values()].filter((g) => g.runs.filter((x) => x.throttled).length > 1).map((g) => `${g.row}/${g.prompt}`);
  if (twice.length) lines.push('', `More than one throttled run (to be run again, both sets published, per the method): ${twice.join(', ')}.`);
  const cache = results.filter((x) => x.cache?.small || x.load?.refused);
  if (cache.length) {
    lines.push('', '| Row | Round | Ranked fill | Refused | Small batches: hits / misses (on the CPU) | CPU share | MB copied |', '|---|---|---|---|---|---|---|');
    for (const x of cache) lines.push(`| ${x.row} | ${x.round + 1} | ${x.load?.filled ?? '-'} | ${x.load?.refused || '-'} | ${x.cache?.small ? `${x.cache.small.hits} / ${x.cache.small.misses} (${x.cache.small.cpu})` : '-'} | ${x.cache?.small ? x.cache.small.cpuShare + '%' : '-'} | ${x.cache?.small?.uploadedMiB ?? '-'} |`);
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
      child.stderr.on('data', (d) => { log.write(d); for (const line of String(d).split('\n')) if (/MoE cache|ranked fill|llama_moe_cache:/.test(line)) said += line + '\n'; });
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
    sampleCard() {
      const samples = [];
      let smi = null;
      try { smi = nodeSpawn('nvidia-smi', [`--query-gpu=${SMI_FIELDS.join(',')}`, '--format=csv,noheader,nounits', '-lms', '250'], { stdio: ['ignore', 'pipe', 'ignore'], windowsHide: true }); smi.on('error', () => {}); smi.stdout.on('data', (d) => { for (const l of String(d).split('\n')) { const s = parseSmiLine(l); if (s) samples.push(s); } }); } catch {}
      return { stop: () => { try { smi?.kill(); } catch {} return samples; } };
    },
    shouldStop() {
      if (plan.stopFile && fs.existsSync(plan.stopFile)) return 'the stop file appeared (Gaming mode or the owner)';
      return '';
    }
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
  if (problems.length) { console.error('The plan has problems:\n- ' + problems.join('\n- ')); process.exit(1); }
  const rounds = Number(opt('--rounds', plan.rounds || 5));
  const order = schedule(plan.rows, rounds);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'plan-fingerprint.json'), JSON.stringify({ plan: sha256(JSON.stringify(plan)), prompts: Object.fromEntries(Object.entries(prompts).map(([k, v]) => [k, v.sha])), rounds, loads: order.length }, null, 2));
  if (a.includes('--dry')) { console.log(`${order.length} loads (${plan.rows.length} rows x ${rounds} rounds). Prompts: ${Object.entries(prompts).map(([k, v]) => `${k} ${v.sha.slice(0, 12)}`).join(', ')}. Nothing started.`); return; }
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
      if (res.stopped) break;
    }
  } finally { lock.release(); }
  fs.writeFileSync(path.join(outDir, 'summary.md'), summarise(results, { prompts, plan }));
  console.log(`Done. ${path.join(outDir, 'summary.md')}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))) main().catch((e) => { console.error(e); process.exit(1); });
