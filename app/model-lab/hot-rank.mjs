#!/usr/bin/env node
// Make the hot-expert rankings for a speed test, the same way Calibrate does (src/brain-calibrate.js): the brain reads
// the fixed, published mix of each kind of work (src/hot-experts-mix.js) on Lamplight 9 with the expert trace on,
// the picks are counted, and one profile per kind plus mixed is saved, stamped with the mix's and the brain's
// fingerprints. Only reads; nothing is trained.
//
//   node model-lab/hot-rank.mjs --server <Lamplight 9 llama-server> --brain <gguf> --out <folder> [--port 18200]
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { HOT_KINDS, mixFor, addMass, saveProfile, profileStamp, rankingFile, parseCacheLog } from '../src/hot-experts.js';

const a = process.argv.slice(2);
const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
const exe = opt('--server'), gguf = opt('--brain'), out = opt('--out'), port = Number(opt('--port', 18200));
if (!exe || !gguf || !out) { console.log('node model-lab/hot-rank.mjs --server <llama-server> --brain <gguf> --out <folder> [--port 18200]'); process.exit(2); }
fs.mkdirSync(out, { recursive: true });
const url = `http://127.0.0.1:${port}`;
// Two loads. The engine prints the brain's fingerprint only with its expert cache on, and Lamplight 9 sends back
// no expert trace while the cache is on (found on the PC Nov 16). So: one load with the cache for the fingerprint,
// then one without it for the trace. The cache doesn't change which experts are picked.
// b12359 opens its port before the brain is loaded, so every /health check has its own 3-second limit.
const base = ['-m', gguf, '--host', '127.0.0.1', '--port', String(port), '--jinja', '-fa', 'on', '--fit', 'on', '-c', '8192', '-np', '1', '--no-webui', '-lv', '4'];
async function load(extra) {
  const child = spawn(exe, [...base, ...extra], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
  const run = { child, said: '' };
  child.stderr.on('data', (d) => { run.said += String(d).split('\n').filter((l) => /MoE cache/.test(l)).join('\n') + '\n'; });
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the engine stopped while loading (code ${child.exitCode})`);
    try { if ((await fetch(url + '/health', { signal: AbortSignal.timeout(3000) })).ok) return run; } catch {}
    if (Date.now() - t0 > 10 * 60e3) { child.kill(); throw new Error('the engine took too long to load'); }
    await new Promise((r) => setTimeout(r, 1000));
  }
}
const stop = (run) => new Promise((r) => { if (!run || run.child.exitCode !== null) return r(); run.child.once('exit', r); run.child.kill(); setTimeout(r, 15e3); });
let run = null;
try {
  run = await load(['--moe-cache-mib', '1024', '--moe-cache-cpu-share', '1']);
  const fingerprint = parseCacheLog(run.said).fingerprint;
  await stop(run); run = null;
  if (!fingerprint) throw new Error('the engine printed no brain fingerprint: Lamplight 9 or newer is needed');
  console.log(`Brain fingerprint ${fingerprint}. Loading again without the cache for the trace.`);
  run = await load([]);
  const cfg = { dataDir: out };
  const engine = 'brain-engine-9b12359';
  const model = path.basename(gguf).replace(/\.gguf$/i, '');
  const all = [];
  for (const kind of HOT_KINDS.slice(1)) {
    const acc = [];
    for (const ask of mixFor(kind)) {
      const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: ask }], temperature: 0, max_tokens: 96, cache_prompt: false, expert_trace: true, expert_trace_mass: true, chat_template_kwargs: { enable_thinking: false } }) });
      if (!r.ok) throw new Error(`the engine answered ${r.status}`);
      const trace = (await r.json()).expert_trace;
      if (!trace) throw new Error(`no expert trace came back (${kind}), so no ranking was saved`);
      addMass(acc, trace);
    }
    if (!acc.length) throw new Error(`the ${kind} trace counted no picks, so no ranking was saved`);
    const p = saveProfile(cfg, model, acc, profileStamp({ kind, gguf, fingerprint, engine }));
    console.log(`${kind}: ${p.picks} picks -> ${rankingFile(cfg, model, kind)}`);
    acc.forEach((row, il) => (row || []).forEach((n, e) => { all[il] = all[il] || []; all[il][e] = (all[il][e] || 0) + (n || 0); }));
  }
  const p = saveProfile(cfg, model, all, profileStamp({ kind: 'mixed', gguf, fingerprint, engine }));
  console.log(`mixed: ${p.picks} picks -> ${rankingFile(cfg, model, 'mixed')}`);
  console.log(`Pass the mixed file as --var RANKING_MIXED=<path>.`);
} finally { await stop(run); }
