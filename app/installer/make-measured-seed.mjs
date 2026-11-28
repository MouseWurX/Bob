#!/usr/bin/env node
// Builds src/measured-seed.json, the measured rows GUPPI's test-results database ships with (src/measured-db.js), from
// the raw and averaged results in docs/test-results/data. Run it in the app folder after adding results there:
//   node installer/make-measured-seed.mjs
// Only measured numbers go in. Each row names the file it came from.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { rowsFromRuns, readRunsFile, pcFromEnv, cleanRow } from '../src/measured-db.js';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const data = path.join(app, 'docs', 'test-results', 'data');
const rel = (f) => path.relative(app, f).replace(/\\/g, '/');
const rows = [];

// 1. The speed test runner's raw runs: one folder per night, <name>-runs.jsonl.gz beside <name>-environment.json
for (const dir of fs.readdirSync(data).sort()) {
  const d = path.join(data, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter((x) => /-runs\.jsonl(\.gz)?$/.test(x)).sort()) {
    const envFile = path.join(d, f.replace(/-runs\.jsonl(\.gz)?$/, '-environment.json'));
    const env = fs.existsSync(envFile) ? JSON.parse(fs.readFileSync(envFile, 'utf8').replace(/^﻿/, '')) : {};
    rows.push(...rowsFromRuns(readRunsFile(path.join(d, f)), env, rel(path.join(d, f))));
  }
}

// 2. The averaged table (Nov 16 to 18, Lamplight 8 to 15, the 16 GB test PC): codes like 2x4 = step 2048 with a
// 4 GB copy cache. The build of each row wasn't recorded, so be is null. Rows with a test switch (lend, a read layout,
// a busy card, unpinned, mask...) keep it as a note, which keeps them out of GUPPI's lookups.
const avg = path.join(data, '2026-11-18-averaged', 'all-settings-averaged.csv');
if (fs.existsSync(avg)) {
  const env = JSON.parse(fs.readFileSync(path.join(data, '2026-11-16-speed', 'calibrate-environment.json'), 'utf8'));
  const pc = pcFromEnv(env);
  const lines = fs.readFileSync(avg, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean);
  const split = (l) => { const out = []; let cur = '', q = false; for (const ch of l) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
  const head = split(lines[0]);
  const CTX = { '32K': 32768, '64K': 65536, '128K': 131072, '256K': 262144 };
  for (const l of lines.slice(1)) {
    const c = Object.fromEntries(split(l).map((v, i) => [head[i], v]));
    const m = /^(\d+(?:\.\d+)?)x(\d+(?:\.\d+)?)(.*)$/.exec(c.code || '');
    if (!m) continue; // plain / stock: their own defaults, no step recorded
    const rest = m[3].trim();
    const kv = (/\b(q4|q5_1|q8|f16|f8_e4m3)\b/.exec(rest) || [])[1];
    const fit = (/fit(\d+)/.exec(rest) || [])[1];
    const share = (/share ([\d.]+)/.exec(rest) || [])[1];
    const notes = rest.replace(/\b(q4|q5_1|q8|f16|f8_e4m3)\b/g, '').replace(/fit\d+/, '').replace(/share [\d.]+/, '').replace(/\(recheck\)|\(stock run\)/, '').replace(/q8\/q4/, '').trim();
    const row = cleanRow({
      at: '2026-11-18', source: `${rel(avg)} (${c.context}, ${c.code})`, avg: Number(c.test_runs_averaged) || 1,
      brain: { file: 'Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf', bytes: env.brain?.bytes }, pc, be: /stock/.test(c.code) ? 0 : null,
      settings: { step: Math.round(Number(m[1]) * 1024), cacheMiB: Math.round(Number(m[2]) * 1024), kv: kv ? (kv === 'q4' ? 'q4_0' : kv === 'q8' ? 'q8_0' : kv) : 'q8_0', ctx: CTX[c.context] || null, fit: Boolean(fit), ...(share ? { cacheShare: Number(share) } : {}), mtp: /MTP\d/.test(rest), env: notes ? [`note:${notes}`] : [], code: c.code },
      prompt: { kind: c.context },
      result: { readTps: Number(String(c.reading_tps).replace(/,/g, '')) || null, writeTps: Number(c.writing_tps) || null, firstWordS: Number(c.first_word_s) || null }
    });
    if (row) rows.push(row);
  }
}

// 3. Rows already in the database's own shape (GUPPI calibrate on rentals and the owner's own computers): any
// *measured*.jsonl in a data folder, one row a line
for (const dir of fs.readdirSync(data).sort()) {
  const d = path.join(data, dir);
  if (!fs.statSync(d).isDirectory()) continue;
  for (const f of fs.readdirSync(d).filter((x) => /measured.*\.jsonl$/.test(x)).sort()) {
    for (const l of fs.readFileSync(path.join(d, f), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean)) {
      let r = null; try { r = cleanRow({ ...JSON.parse(l), source: `${rel(path.join(d, f))}` }); } catch {}
      if (r) rows.push(r);
    }
  }
}

const out = path.join(app, 'src', 'measured-seed.json');
fs.writeFileSync(out, JSON.stringify({ about: 'GUPPI\'s test-results database seed: measured rows only, made by installer/make-measured-seed.mjs from docs/test-results/data. Do not edit by hand.', rows }) + '\n');
console.log(`Wrote ${rows.length} rows to ${rel(out)}`);
