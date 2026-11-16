#!/usr/bin/env node
// Make the hot-expert rankings for a speed test, the same way Calibrate does (src/brain-calibrate.js): the brain reads
// the fixed, published mix of each kind of work (src/hot-experts-mix.js) on Brain Engine 9 with the expert trace on,
// the picks are counted, and one profile per kind plus mixed is saved, stamped with the mix's and the brain's
// fingerprints. Only reads; nothing is trained.
//
//   node model-lab/hot-rank.mjs --server <Brain Engine 9 llama-server> --brain <gguf> --out <folder> [--port 18200]
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
// the cache is on only so the engine prints the brain's fingerprint; it doesn't change which experts are picked
const child = spawn(exe, ['-m', gguf, '--host', '127.0.0.1', '--port', String(port), '--jinja', '-fa', 'on', '--fit', 'on', '-c', '8192', '-np', '1', '--no-webui', '--moe-cache-mib', '1024', '--moe-cache-cpu-share', '1'], { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true });
let said = '';
child.stderr.on('data', (d) => { said += String(d).split('\n').filter((l) => /MoE cache/.test(l)).join('\n') + '\n'; });
try {
  const t0 = Date.now();
  for (;;) {
    if (child.exitCode !== null) throw new Error(`the engine stopped while loading (code ${child.exitCode})`);
    try { if ((await fetch(url + '/health')).ok) break; } catch {}
    if (Date.now() - t0 > 10 * 60e3) throw new Error('the engine took too long to load');
    await new Promise((r) => setTimeout(r, 1000));
  }
  const fingerprint = parseCacheLog(said).fingerprint;
  if (!fingerprint) throw new Error('the engine printed no brain fingerprint: Brain Engine 9 or newer is needed');
  const cfg = { dataDir: out };
  const engine = 'brain-engine-9b12359';
  const model = path.basename(gguf).replace(/\.gguf$/i, '');
  const all = [];
  for (const kind of HOT_KINDS.slice(1)) {
    const acc = [];
    for (const ask of mixFor(kind)) {
      const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: [{ role: 'user', content: ask }], temperature: 0, max_tokens: 96, cache_prompt: false, expert_trace: true, expert_trace_mass: true, chat_template_kwargs: { enable_thinking: false } }) });
      if (!r.ok) throw new Error(`the engine answered ${r.status}`);
      addMass(acc, (await r.json()).expert_trace);
    }
    const p = saveProfile(cfg, model, acc, profileStamp({ kind, gguf, fingerprint, engine }));
    console.log(`${kind}: ${p.picks} picks -> ${rankingFile(cfg, model, kind)}`);
    acc.forEach((row, il) => (row || []).forEach((n, e) => { all[il] = all[il] || []; all[il][e] = (all[il][e] || 0) + (n || 0); }));
  }
  const p = saveProfile(cfg, model, all, profileStamp({ kind: 'mixed', gguf, fingerprint, engine }));
  console.log(`mixed: ${p.picks} picks -> ${rankingFile(cfg, model, 'mixed')}`);
  console.log(`Brain fingerprint ${fingerprint}. Pass the mixed file as --var RANKING_MIXED=<path>.`);
} finally { child.kill(); }
