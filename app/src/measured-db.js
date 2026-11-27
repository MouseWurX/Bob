// GUPPI's test-results database (Nov 27, the owner: "We need to keep a small database of all the test results so guppi
// can properly calibrate"). Every speed and fit measurement, one row each: which brain file (the quant is in its name),
// which PC (card, its memory, RAM), which engine build, which settings, and what was measured. Only measured numbers:
// nothing guessed or worked out goes in.
//   - The seed (src/measured-seed.json) ships with Bob: every measured run we have in the repository, made by
//     installer/make-measured-seed.mjs from the raw files under docs/test-results/data.
//   - This PC's own rows (<data>/conductor/measured.jsonl): GUPPI calibrates this PC and the Brains page's Calibrate add
//     theirs as they run; a rental's or a test kit's raw runs go in with `node src/measured-db.js add <runs.jsonl[.gz]>
//     --env <environment.json>`. Kept across engine builds; Forget this PC's calibration doesn't touch it.
// GUPPI reads it for a brain he has no speeds of his own for: the same brain file on this PC with this engine build,
// then the nearest build on this PC, then the same brain file on the nearest card of a similar size (within half again),
// then nothing (his built-in table).
// The numbers he takes are marked old, so his first real measurement of a step replaces them.
// A local file only: nothing is sent anywhere.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { fileURLToPath } from 'node:url';

export const SEED_FILE = fileURLToPath(new URL('./measured-seed.json', import.meta.url));
export const localFile = (cfg) => (cfg?.dataDir ? path.join(cfg.dataDir, 'conductor', 'measured.jsonl') : '');
const MAX_LOCAL = 20000; // rows kept on this PC (newest), about 5 MB
const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : null; };
const BENIGN_ENV = new Set(['LLAMA_MOE_CACHE_LOG_EVERY', 'LLAMA_MOE_CACHE_FILL', 'LLAMA_MOE_CACHE_FILL_STEP', 'LLAMA_MOE_CACHE_FILL_SPARE_MIB']);

// One row. Fields (all but brain, pc and one result optional):
//   at, source, brain: { file, bytes }, pc: { card, cardMiB, ramMB, cpu, os, apu }, be (0 = stock llama.cpp, null =
//   unknown), settings: { step, batch, cacheMiB, cacheShare, fill, kv, ctx, cpuMoe, fit, mtp, env: [] },
//   prompt: { kind, n }, result: { readTps, writeTps, firstWordS, writtenN, textSha, peakC, smMHz, throttle },
//   fit: { ok, why } (a try that didn't fit, spilled or tripped: ok false)
export function cleanRow(r) {
  if (!r || typeof r !== 'object' || !r.brain?.file || !r.pc) return null;
  const s = r.settings || {}, res = r.result || {};
  const out = {
    at: String(r.at || '').slice(0, 24), source: String(r.source || '').slice(0, 200),
    brain: { file: path.basename(String(r.brain.file)).slice(0, 200), ...(num(r.brain.bytes) ? { bytes: num(r.brain.bytes) } : {}) },
    pc: { card: String(r.pc.card || '').slice(0, 80), cardMiB: num(r.pc.cardMiB), ramMB: num(r.pc.ramMB), ...(r.pc.cpu ? { cpu: String(r.pc.cpu).trim().slice(0, 80) } : {}), ...(r.pc.os ? { os: String(r.pc.os).slice(0, 60) } : {}), ...(r.pc.apu ? { apu: true } : {}) },
    be: r.be === null || r.be === undefined ? null : num(r.be),
    settings: { step: num(s.step) || 512, ...(num(s.batch) ? { batch: num(s.batch) } : {}), cacheMiB: num(s.cacheMiB) || 0, ...(s.cacheShare != null ? { cacheShare: num(s.cacheShare) } : {}), ...(s.fill ? { fill: true } : {}), ...(s.kv ? { kv: String(s.kv) } : {}), ...(num(s.ctx) ? { ctx: num(s.ctx) } : {}), ...(s.cpuMoe != null ? { cpuMoe: num(s.cpuMoe) } : {}), ...(s.fit ? { fit: true } : {}), ...(s.mtp ? { mtp: true } : {}), ...(Array.isArray(s.env) && s.env.length ? { env: s.env.map(String).slice(0, 12) } : {}), ...(s.code ? { code: String(s.code).slice(0, 40) } : {}) },
    ...(r.prompt ? { prompt: { ...(r.prompt.kind ? { kind: String(r.prompt.kind).slice(0, 40) } : {}), ...(num(r.prompt.n) ? { n: num(r.prompt.n) } : {}) } } : {}),
    result: Object.fromEntries(Object.entries({ readTps: num(res.readTps), writeTps: num(res.writeTps), firstWordS: num(res.firstWordS), writtenN: num(res.writtenN), peakC: num(res.peakC), smMHz: num(res.smMHz) }).filter(([, v]) => v != null && v >= 0)),
    ...(r.fit ? { fit: { ok: r.fit.ok !== false, ...(r.fit.why ? { why: String(r.fit.why).slice(0, 200) } : {}) } } : {})
  };
  if (res.textSha) out.result.textSha = String(res.textSha).slice(0, 16);
  if (Array.isArray(res.throttle) && res.throttle.length) out.result.throttle = res.throttle.map(String).slice(0, 8);
  if (r.avg) out.avg = num(r.avg) || true; // an average over runs (the averaged table), not one run
  if (!Object.keys(out.result).length && !out.fit) return null;
  return out;
}

let seedCache = null;
export function readSeed(file = SEED_FILE) {
  if (seedCache && seedCache.file === file) return seedCache.rows;
  let rows = [];
  try { rows = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')).rows || []; } catch {}
  seedCache = { file, rows };
  return rows;
}
export function readLocal(cfg) {
  const f = localFile(cfg); if (!f) return [];
  let text = ''; try { text = fs.readFileSync(f, 'utf8'); } catch { return []; }
  return text.split(/\r?\n/).map((l) => { try { return cleanRow(JSON.parse(l)); } catch { return null; } }).filter(Boolean);
}
export const readAll = (cfg, { seedFile } = {}) => [...readLocal(cfg), ...readSeed(seedFile)];

// add rows to this PC's file (newest MAX_LOCAL kept). -> how many went in
export function append(cfg, rows) {
  const f = localFile(cfg); if (!f) return 0;
  const clean = (Array.isArray(rows) ? rows : [rows]).map(cleanRow).filter(Boolean);
  if (!clean.length) return 0;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.appendFileSync(f, clean.map((r) => JSON.stringify(r)).join('\n') + '\n');
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean);
    if (lines.length > MAX_LOCAL) fs.writeFileSync(f, lines.slice(-MAX_LOCAL).join('\n') + '\n');
  } catch { return 0; }
  return clean.length;
}

// ---- reading it for GUPPI ----
export const samePc = (a, b) => Boolean(a && b) && Math.abs((a.cardMiB || 0) - (b.cardMiB || 0)) <= 512 && Math.abs((a.ramMB || 0) - (b.ramMB || 0)) <= 2048 && Boolean(a.apu) === Boolean(b.apu);
const median = (xs) => { const a = xs.filter((x) => x > 0).sort((p, q) => p - q); if (!a.length) return 0; const m = a.length >> 1; return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2; };
const round1 = (n) => Math.round(n * 10) / 10;
// a row GUPPI can learn a step's speed from: his own way (copy cache or not, as he'll load), no guesser, no test switch
const plainWay = (r, cache) => !r.settings.mtp && (r.settings.cacheMiB > 0) === cache && !(r.settings.env || []).some((e) => !BENIGN_ENV.has(e)) && r.fit?.ok !== false;

// -> { read: { step: t/s }, write: { step: t/s }, old, from: { level, rows, be, pc } } or null
//   file: the brain's file name; pc: { cardMiB, ramMB, apu }; be: this engine build; cache: GUPPI loads it with the copy
//   cache; ctx: the context it loads with (rows from the nearest context measured count); kv: its chat memory type
export function speedsFor(rows, { file, pc, be = 0, cache = false, ctx = 32768, kv = 'q8_0' } = {}) {
  const name = path.basename(String(file || '')).toLowerCase();
  if (!name) return null;
  const mine = rows.filter((r) => r.brain.file.toLowerCase() === name && plainWay(r, cache) && (r.result.readTps > 0 || r.result.writeTps > 0));
  if (!mine.length) return null;
  const pick = (set, level) => {
    if (!set.length) return null;
    if (cache) { // GUPPI's cache is the copy kind, filled to the card: the copy kind, and the biggest cache measured
      const copy = set.filter((r) => r.settings.cacheShare === 0 || r.settings.fill); if (copy.length) set = copy;
      const big = Math.max(...set.map((r) => r.settings.cacheMiB)); set = set.filter((r) => r.settings.fill || r.settings.cacheMiB === big);
    }
    const sameKv = set.filter((r) => (r.settings.kv || 'f16') === kv);
    if (sameKv.length) set = sameKv; // the chat memory type changes speeds: the same one when it was measured
    const ctxs = [...new Set(set.map((r) => r.settings.ctx || 0))];
    const near = ctxs.sort((a, b) => Math.abs(a - ctx) - Math.abs(b - ctx))[0];
    let use = set.filter((r) => (r.settings.ctx || 0) === near);
    // steps compared on the same prompts: a step measured on fewer kinds of prompt than the best-covered one is left out
    const kindsAt = (st) => new Set(use.filter((r) => r.settings.step === st).map((r) => r.prompt?.kind || ''));
    const steps0 = [...new Set(use.map((r) => r.settings.step))];
    const most = Math.max(...steps0.map((st) => kindsAt(st).size));
    const full = [...kindsAt(steps0.find((st) => kindsAt(st).size === most))];
    use = use.filter((r) => full.every((k) => kindsAt(r.settings.step).has(k)) && full.includes(r.prompt?.kind || ''));
    const read = {}, write = {};
    for (const step of [...new Set(use.map((r) => r.settings.step))]) {
      const at = use.filter((r) => r.settings.step === step);
      const rd = median(at.filter((r) => !(r.prompt?.n > 0) || r.prompt.n >= 4096).map((r) => r.result.readTps || 0));
      const wr = median(at.map((r) => r.result.writeTps || 0));
      if (rd > 0) read[step] = round1(rd);
      if (wr > 0) write[step] = round1(wr);
    }
    if (!Object.keys(write).length) return null;
    return { read, write, old: { read: Object.keys(read).map(Number), write: Object.keys(write).map(Number) }, from: { level, rows: use.length, be: use[0].be, ctx: near || null, card: use[0].pc.card || '', cardMiB: use[0].pc.cardMiB || null } };
  };
  const here = mine.filter((r) => samePc(r.pc, pc));
  const exact = pick(here.filter((r) => r.be === be), 'this PC, this engine build');
  if (exact) return exact;
  // the nearest build on this PC (a known build before an unknown one)
  const builds = [...new Set(here.map((r) => r.be))].sort((a, b) => (a == null) - (b == null) || Math.abs((a ?? 0) - be) - Math.abs((b ?? 0) - be));
  for (const b of builds) { const got = pick(here.filter((r) => r.be === b), b == null ? 'this PC, engine build not recorded' : (b ? `this PC, engine build ${b}` : "this PC, stock llama.cpp")); if (got) return got; }
  // the same brain on the nearest card
  // only a card of a similar size (within half again either way): a 16 GB card's numbers say little about a 6 GB one
  const near = (c) => pc?.cardMiB > 0 && c > 0 && Math.max(c, pc.cardMiB) / Math.min(c, pc.cardMiB) <= 1.5;
  const cards = [...new Set(mine.map((r) => r.pc.cardMiB || 0))].filter(near).sort((a, b) => Math.abs(a - (pc?.cardMiB || 0)) - Math.abs(b - (pc?.cardMiB || 0)));
  for (const c of cards) {
    const set = mine.filter((r) => (r.pc.cardMiB || 0) === c);
    const bs = [...new Set(set.map((r) => r.be))].sort((a, b) => (a == null) - (b == null) || Math.abs((a ?? 0) - be) - Math.abs((b ?? 0) - be));
    for (const b of bs) { const got = pick(set.filter((r) => r.be === b), `another PC (${set[0].pc.card || `${Math.round(c / 1024)} GB card`})`); if (got) return got; }
  }
  return null;
}

// one row from one of Bob's own timed tries (GUPPI calibrates this PC, the Brains page's Calibrate). pc: pcNow's
// { os, cardGB, ramGB, sharedGraphics } plus the card's name and MiB when read; extra/env: the try's engine flags
export function rowFromTry({ at, source, gguf, fileBytes, pc = {}, be = null, extra = [], env = null, ctx = null, kv = null, promptN = null, result = {}, fit = null } = {}) {
  const st = settingsFromCmd((extra || []).join(' '), Object.keys(env || {}));
  return cleanRow({
    at: at ? new Date(at).toISOString() : '', source, brain: { file: String(gguf || '').replace(/\\/g, '/'), bytes: fileBytes || null },
    pc: { card: pc.gpu || '', cardMiB: pc.cardMiB || (pc.cardGB ? pc.cardGB * 1024 : null), ramMB: pc.ramGB ? Math.round(pc.ramGB * 1024) : null, os: pc.os || '', apu: pc.sharedGraphics === true },
    be, settings: { ...st, ctx: ctx || st.ctx, ...(kv ? { kv } : {}) }, prompt: { kind: source, n: promptN }, result, fit
  });
}

// ---- turning the speed test runner's raw files (our npc, laptop and rental runs) into rows ----
const flag = (a, f) => { const i = a.lastIndexOf(f); return i >= 0 ? a[i + 1] : undefined; };
export function settingsFromCmd(cmd = '', env = []) {
  const a = String(cmd).split(/\s+/);
  const spec = flag(a, '--spec-type') || flag(a, '--spec-types') || '';
  return {
    step: num(flag(a, '-ub') ?? flag(a, '--ubatch-size')) || 512, batch: num(flag(a, '-b') ?? flag(a, '--batch-size')) || null,
    cacheMiB: num(flag(a, '--moe-cache-mib')) || 0, cacheShare: flag(a, '--moe-cache-cpu-share') != null ? num(flag(a, '--moe-cache-cpu-share')) : null,
    fill: (env || []).includes('LLAMA_MOE_CACHE_FILL'), kv: flag(a, '-ctk') || flag(a, '--cache-type-k') || null, ctx: num(flag(a, '-c') ?? flag(a, '--ctx-size')) || null,
    cpuMoe: flag(a, '--n-cpu-moe') != null ? num(flag(a, '--n-cpu-moe')) : null, fit: a.includes('--fit'), mtp: /draft|mtp/.test(spec) || a.includes('-md') || a.includes('--model-draft'), env: (env || []).map(String)
  };
}
export const beOf = (engine) => { const m = /^(?:be|brain-engine-?|ll)(\d+)/i.exec(String(engine || '')); return m ? Number(m[1]) : /^(plain|stock)$/i.test(String(engine || '')) ? 0 : null; };
export function pcFromEnv(env = {}) {
  const parts = String(env.card || '').split(',').map((x) => x.trim());
  const mib = num((/(\d+)\s*MiB/.exec(env.card || '') || [])[1]);
  return { card: parts[0] || '', cardMiB: mib, ramMB: num(env.ramMB), cpu: env.cpu || '', os: env.os || '' };
}
// one row per prompt of each load in a runs.jsonl (the speed test runner's format)
export function rowsFromRuns(lines, env, source = '') {
  const pc = pcFromEnv(env || {});
  const out = [];
  for (const l of lines) {
    let j; try { j = typeof l === 'string' ? JSON.parse(l) : l; } catch { continue; }
    if (!j?.cmd || !Array.isArray(j.runs)) continue;
    const file = (/-m\s+(\S+)/.exec(j.cmd) || [])[1] || env?.brain?.file || '';
    const settings = settingsFromCmd(j.cmd, j.env);
    for (const r of j.runs) {
      const row = cleanRow({ at: env?.at || '', source: `${source}${j.row ? ` row ${j.row}` : ''}${j.round != null ? ` round ${j.round}` : ''}`, brain: { file: String(file).replace(/\\/g, '/'), bytes: env?.brain?.bytes }, pc, be: beOf(j.engine), settings: { ...settings, code: j.row || '' }, prompt: { kind: r.prompt, n: r.promptN }, result: { readTps: r.readTps, writeTps: r.writeTps, firstWordS: r.firstWordMs != null ? r.firstWordMs / 1000 : null, writtenN: r.writtenN, textSha: r.textSha, throttle: r.throttled ? ['throttled'] : [] } });
      if (row) out.push(row);
    }
  }
  return out;
}
export const readRunsFile = (f) => { const buf = fs.readFileSync(f); return (f.endsWith('.gz') ? zlib.gunzipSync(buf) : buf).toString('utf8').split(/\r?\n/).filter(Boolean); };

// `node src/measured-db.js add <runs.jsonl[.gz]> --env <environment.json> [--data <Bob's data folder>]`
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const [cmd, file] = process.argv.slice(2);
  const opt = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ''; };
  if (cmd !== 'add' || !file) { console.log('node src/measured-db.js add <runs.jsonl[.gz]> --env <environment.json> --data <Bob data folder>'); process.exit(2); }
  const env = opt('env') ? JSON.parse(fs.readFileSync(opt('env'), 'utf8').replace(/^﻿/, '')) : {};
  const data = opt('data');
  if (!data) { console.error('--data <Bob data folder> is needed'); process.exit(2); }
  const n = append({ dataDir: data }, rowsFromRuns(readRunsFile(file), env, path.basename(file)));
  console.log(`${n} rows added to ${localFile({ dataDir: data })}`);
}
