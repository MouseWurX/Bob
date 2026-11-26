#!/usr/bin/env node
// The Turbo test matrix (Nov 26, the owner: "We need to test all the turbo features to make sure they still add speed
// with the other tricks, that guppi can compensate and optimize those tricks too if possible" / "Also to see if they
// affect answer quality"). Each row is one set of Bob's own settings; its engine start (flags, environment, experts
// per word) comes from Bob's own LlamaCpp.buildArgs and startEnv, so the matrix tests exactly what Bob would start.
//
//   node model-lab/turbo-start.mjs row  --row <id> --gguf <file> --exe <llama-server> [--be 47 --build 12359 --ctx 81920 --card-gb 16 --data <dir>]
//        -> JSON { row, base, args, env, perWord, dirs, stock, temperature }
//   node model-lab/turbo-start.mjs plan --gguf <file> --exe <Lamplight server> --stock-exe <llama.cpp server> --out <plan.json>
//        [--rows a,b] [--idle-c 35] [--rounds 3] [--long <text file>] ...   -> a speed-test.mjs plan (depth 0, 16K, 64K)
//
// The engine's chat memory types (3-bit, 2-bit, Progressive, the sharp start) are read from the exe's own --help.
// Nothing is downloaded, nothing is compiled, no key is read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LlamaCpp } from '../src/llamacpp.js';
import { ownEnv } from '../src/chat-places.js';
import { helpHasQ3, helpHasQ2, helpHasTiers, helpHasSink, turboExperts } from '../src/engine-extras.js';

export const BRAIN = 'turbo-brain';
const T = { turbo: true, turboExperts: false }; // Turbo with only its chat memory: the base every lone trick is put on
const MTP = { mtp: true }; // the Lab's own MTP pick for the brain (llamacpp.turbo[brain]): exact drafting, a drafter for keep more guesses
// id, what it is, Bob's settings, the Lab's MTP pick, the row it is compared with, extra engine keys (no Bob setting yet)
export const MATRIX_ROWS = [
  { id: 'stock', what: 'Bob on plain llama.cpp b12359 (no Lamplight patches)', cfg: {}, base: null, stock: true },
  { id: 'lossless', what: 'Lamplight with every default-on trick (all lossless), no Turbo', cfg: {}, base: 'stock' },
  { id: 'lossless-mtp', what: 'Lossless plus the brain\'s own guesser (MTP, exact)', cfg: {}, mtp: MTP, base: 'lossless' },
  { id: 't-mem-small', what: 'Turbo chat memory: Smaller (4-bit)', cfg: { ...T }, base: 'lossless' },
  { id: 't-mem-smallest', what: 'Turbo chat memory: Smallest (3-bit)', cfg: { ...T, turboMem: 'smallest' }, base: 'lossless' },
  { id: 't-mem-p83', what: 'Turbo chat memory: Progressive 8+3', cfg: { ...T, turboMem: 'progressive83' }, base: 'lossless' },
  { id: 't-mem-p84', what: 'Turbo chat memory: Progressive 8+4', cfg: { ...T, turboMem: 'progressive84' }, base: 'lossless' },
  { id: 't-mem-p82', what: 'Turbo chat memory: Progressive 8+2 (2-bit base)', cfg: { ...T, turboMem: 'progressive82' }, base: 'lossless' },
  { id: 't-experts4', what: '4 experts per word (Turbo\'s default, with 4-bit memory)', cfg: { turbo: true }, base: 't-mem-small' },
  { id: 't-standins', what: 'Stand-ins: up to 2 missed experts a layer stood in for', cfg: { ...T, turboStandins: true }, base: 't-mem-small' },
  { id: 't-drive', what: 'Never wait on the drive (only matters when experts drop out of RAM)', cfg: { ...T, turboDriveStandins: true }, base: 't-mem-small' },
  { id: 't-mtp', what: '4-bit memory plus MTP (exact): the base for keep more guesses', cfg: { ...T }, mtp: MTP, base: 't-mem-small' },
  { id: 't-keep', what: 'Keep more guesses (mb-MTP, 0120)', cfg: { ...T, turboKeepGuesses: true }, mtp: MTP, base: 't-mtp' },
  { id: 't-sink', what: 'Sharp start: the first 128 tokens at 16-bit (0122)', cfg: { ...T, turboSink: true }, base: 't-mem-small' },
  { id: 't-sealed', what: 'Sealed blocks 3/3 over Progressive 8+3 (0123, engine key only)', cfg: { ...T, turboMem: 'progressive83' }, env: { LLAMA_KV_BODY: '3/3' }, base: 't-mem-p83' },
  // Nov 26 (the upstream ports thread): Lamplight 0128-0134's upstream keys, off unless set: CUDA M-RoPE fusion, MTP
  // replay (needs draft-mtp), async input copies, YaRN keys. GGML_VK_MIXED_DOT is Vulkan only, so not on this card.
  // Its row A is lossless-mtp; this is its row B. Needs an engine built with 0126-0134.
  { id: 'up-keys', what: 'Upstream keys 0128-0134 on (M-RoPE fusion, MTP replay, async inputs, YaRN keys)', cfg: {}, mtp: MTP, env: { GGML_CUDA_FUSE_MROPE: '1', LLAMA_RS_REPLAY: '1', GGML_CUDA_ASYNC_INPUTS: '1', LLAMA_YARN_KEYS: '1' }, base: 'lossless-mtp' },
  { id: 'all-on', what: 'Every Turbo trick on (4-bit memory, 4 experts, stand-ins, keep more guesses with MTP, sharp start)', cfg: { turbo: true, turboStandins: true, turboKeepGuesses: true, turboSink: true }, mtp: MTP, base: 'lossless-mtp' }
];
export const rowOf = (id) => MATRIX_ROWS.find((r) => r.id === id) || null;
export const rowCfg = (id) => ({ ...(rowOf(id)?.cfg || {}) });
// Bob's own sampling for Qwen chat (temperature 0.7) with a fixed seed, for every row: keep more guesses does nothing at 0
export const SAMPLING = { temperature: 0.7, seed: 42 };

export function capsOf(exe) {
  try { const r = spawnSync(exe, ['--help'], { timeout: 15000, encoding: 'utf8' }); const t = `${r.stdout || ''}${r.stderr || ''}`; const q3 = helpHasQ3(t); return { q3, q2: q3 && helpHasQ2(t), tiers: q3 && helpHasTiers(t), sink: helpHasSink(t) }; } catch { return {}; }
}

// One row's engine start, from Bob's own code. cfg: the base settings (dataDir, agentDir, gpuVramGB); drop: Turbo tricks
// GUPPI left out for this PC (the "after GUPPI" rows). freeRamBytes: what the engine's RAM cache is sized from.
export function rowStart(id, { cfg = {}, gguf, exe, ctx = 81920, be = 47, build = 12359, caps = null, drop = [], freeRamBytes = null } = {}) {
  const row = rowOf(id);
  if (!row) throw new Error(`no row ${id}`);
  const ownBe = row.stock ? 0 : be;
  const c = { ...cfg, ...row.cfg, llamacpp: { ...(cfg.llamacpp || {}), exe, ctx, models: { [BRAIN]: gguf }, ...(row.mtp ? { turbo: { [BRAIN]: { on: true, ...row.mtp, max: 8 } } } : {}) } };
  const eng = new LlamaCpp(c);
  clearInterval(eng.idleTimer);
  const k = caps || (row.stock ? {} : capsOf(exe));
  eng.beNo = () => ownBe;
  eng.buildNo = () => build;
  eng.exePath = () => exe;
  eng.kvCaps = () => ({ exe, has: Boolean(k.q3), tiers: Boolean(k.tiers), q2: Boolean(k.q2), sink: Boolean(k.sink) });
  eng.guppiProfile = () => (drop.length ? { turboDrop: drop } : null);
  if (Number.isFinite(freeRamBytes)) eng.freeRam = () => freeRamBytes;
  eng.log = () => {};
  const args = eng.buildArgs(BRAIN, { ctx });
  const env = { ...ownEnv(eng.startEnv(BRAIN, args, { ctx }), {}), ...(row.env || {}) };
  const dirs = args.flatMap((a, i) => (a === '--slot-save-path' ? [args[i + 1]] : []));
  return { row: id, what: row.what, base: row.base, args, env, perWord: !row.stock && turboExperts(eng.turboCfg(BRAIN)), dirs, stock: Boolean(row.stock), ...SAMPLING };
}

// the flags without the brain, address and port (speed-test.mjs and the jobs kit add their own)
export function serverFlags(args) {
  const out = [];
  for (let i = 0; i < args.length; i++) { if (['-m', '--host', '--port'].includes(args[i])) { i++; continue; } out.push(args[i]); }
  return out;
}

// A speed-test.mjs plan: every row at depth 0 (Bob's real start prompt), 16K and 64K, Bob's sampling with a fixed seed,
// the card cooled to idle + 3 C (at least 35 s) before every load, rows interleaved over the rounds.
export function makePlan({ rows = MATRIX_ROWS.map((r) => r.id), gguf, exe, stockExe, ctx = 81920, be, build, cfg, idleC = null, rounds = 3, long = 'long-text.md', start = 'start.json', freeRamBytes = null, drop = [] } = {}) {
  const out = { name: `Turbo matrix: ${path.basename(gguf || '')}, ${rows.length} rows, depth 0 / 16K / 64K`, method: 'app/docs/test-results/2026-11-26-turbo-matrix-method.md', brain: gguf, engines: { ll: { exe }, stock: { exe: stockExe } }, prompts: { d0: start, d16k: long, d64k: long }, promptTokens: { d16k: 16384, d64k: 65536 }, question: { d16k: '\n\nIn two sentences, what is this text about?', d64k: '\n\nIn two sentences, what is this text about?' }, maxTokens: 300, rounds, loadTimeoutMs: 900000, saveText: true, rows: [] };
  if (Number.isFinite(idleC)) out.coolDown = { cardC: idleC + 3, minS: 35, maxWaitS: 300, everyS: 5 };
  for (const id of rows) {
    const s = rowStart(id, { cfg, gguf, exe: rowOf(id)?.stock ? stockExe : exe, ctx, be, build, drop: rowOf(id)?.stock ? [] : drop, freeRamBytes });
    for (const d of s.dirs) fs.mkdirSync(d, { recursive: true });
    out.rows.push({ id, what: s.what, base: s.base, engine: s.stock ? 'stock' : 'll', noBase: true, args: serverFlags(s.args), env: s.env, prompts: ['d0', 'd16k', 'd64k'], body: { temperature: s.temperature, seed: s.seed }, setup: s.perWord ? [{ path: '/experts-per-word', body: { used: 4 } }] : [] });
  }
  return out;
}

const opt = (a, k, d = null) => { const i = a.indexOf(k); return i >= 0 && a[i + 1] !== undefined ? a[i + 1] : d; };
if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const a = process.argv.slice(2), cmd = a[0];
  const data = path.resolve(opt(a, '--data', path.join(os.tmpdir(), 'turbo-matrix-bob')));
  const cfg = { dataDir: data, agentDir: data, gpuVramGB: Number(opt(a, '--card-gb', 16)) };
  fs.mkdirSync(data, { recursive: true });
  const common = { cfg, gguf: path.resolve(opt(a, '--gguf', '')), ctx: Number(opt(a, '--ctx', 81920)), be: Number(opt(a, '--be', 47)), build: Number(opt(a, '--build', 12359)), freeRamBytes: opt(a, '--free-ram-gb') ? Number(opt(a, '--free-ram-gb')) * 2 ** 30 : null, drop: String(opt(a, '--drop', '')).split(',').filter(Boolean) };
  if (cmd === 'row') {
    const id = opt(a, '--row');
    const s = rowStart(id, { ...common, exe: path.resolve(rowOf(id)?.stock ? opt(a, '--stock-exe', opt(a, '--exe')) : opt(a, '--exe')) });
    for (const d of s.dirs) fs.mkdirSync(d, { recursive: true });
    console.log(JSON.stringify({ ...s, flags: serverFlags(s.args) }));
  } else if (cmd === 'plan') {
    const rows = opt(a, '--rows') ? opt(a, '--rows').split(',') : undefined;
    const p = makePlan({ ...common, rows, exe: path.resolve(opt(a, '--exe')), stockExe: path.resolve(opt(a, '--stock-exe', opt(a, '--exe'))), idleC: opt(a, '--idle-c') !== null ? Number(opt(a, '--idle-c')) : null, rounds: Number(opt(a, '--rounds', 3)), long: opt(a, '--long', 'long-text.md'), start: opt(a, '--start', 'start.json') });
    fs.writeFileSync(opt(a, '--out', 'turbo-plan.json'), JSON.stringify(p, null, 1));
    console.log(`plan: ${p.rows.length} rows -> ${opt(a, '--out', 'turbo-plan.json')}`);
  } else {
    console.log('usage: turbo-start.mjs row --row <id> ... | plan --out <plan.json> ...  rows: ' + MATRIX_ROWS.map((r) => r.id).join(' '));
  }
}
