// 23 Nov 2026 (the owner, on REAP's 80% level: "yes add the redirect in the rental"; the review: redirect "tests whether
// the kept expert can substitute as-is", not a merge): the pairs for the live redirect. Reads llama-expert-pair's per-layer
// output likeness (sim-<il>.f32, the mean cosine of two experts' outputs on the same token, measured on prompts that are not
// held-out) and a keep list, and pairs each expert that is off with the kept expert in its layer whose outputs are most like
// its own. The rules the engine applies (pod patch 0016), written down so the report can say them:
//   - gate weight: a kept expert's router share becomes its own softmax share plus the shares of every off expert paired
//     with it, before the top-k pick (and before the brain's own top-k weight normalising, if it has one);
//   - duplicates: none can happen, since off experts are out of the pick and a kept expert is one candidate however many
//     off experts it took in; two picks never land on the same expert.
//   node expert-redirect.mjs --sim <expert-pair dir> --keep <keep.json> --out <redirect.json>
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

// sims[il] = Float32Array(n*n) or null; keep = per-layer kept ids (null = whole layer)
export function pairUp(keep, sims, n) {
  const to = [], layers = [];
  for (let il = 0; il < keep.length; il++) {
    const k = keep[il];
    if (!Array.isArray(k)) { to.push(null); continue; }
    const kept = new Set(k);
    const sim = sims[il];
    if (!sim) throw new Error(`no output likeness for layer ${il}, which has experts switched off`);
    const row = new Array(n), best = [];
    const load = new Map();
    for (let e = 0; e < n; e++) {
      if (kept.has(e)) { row[e] = e; continue; }
      let b = -1, bv = -Infinity;
      for (const c of k) { const v = sim[e * n + c]; if (v > bv) { bv = v; b = c; } }
      row[e] = b; best.push(bv); load.set(b, (load.get(b) || 0) + 1);
    }
    to.push(row);
    const sorted = [...best].sort((a, b) => a - b);
    layers.push({ layer: il, off: best.length, mean_cos: best.length ? +(best.reduce((a, b) => a + b, 0) / best.length).toFixed(4) : null, min_cos: best.length ? +sorted[0].toFixed(4) : null, most_taken_in: Math.max(0, ...load.values()) });
  }
  return { to, layers };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  if (!opt('sim') || !opt('keep') || !opt('out')) { console.error('--sim <expert-pair dir> --keep <keep.json> --out <redirect.json> are needed'); process.exit(1); }
  const info = JSON.parse(fs.readFileSync(path.join(opt('sim'), 'info.json'), 'utf8'));
  const k = JSON.parse(fs.readFileSync(opt('keep'), 'utf8').replace(/^﻿/, ''));
  const keep = Array.isArray(k) ? k : k.keep, n = info.n_expert;
  const sims = keep.map((_, il) => { const f = path.join(opt('sim'), `sim-${il}.f32`); if (!fs.existsSync(f)) return null; const b = fs.readFileSync(f); return new Float32Array(b.buffer, b.byteOffset, b.length / 4); });
  let r;
  try { r = pairUp(keep, sims, n); } catch (e) { console.log(`GATE STOP: ${e.message}`); process.exit(86); }
  const m = r.layers.filter((l) => l.mean_cos !== null);
  const out = { keep, to: r.to, from_keep: path.basename(opt('keep')), measured_on: { prompts: info.prompts, prompts_in_file: info.prompts_in_file ?? null, tokens: info.tokens, complete: info.done !== false, measure: info.measure }, rules: { gate_weight: 'kept share + paired off shares, before top-k', duplicates: 'none possible' }, layers: r.layers, mean_cos: m.length ? +(m.reduce((s, l) => s + l.mean_cos, 0) / m.length).toFixed(4) : null };
  fs.mkdirSync(path.dirname(path.resolve(opt('out'))), { recursive: true });
  fs.writeFileSync(opt('out'), JSON.stringify(out));
  console.log(`${opt('out')}: ${m.reduce((s, l) => s + l.off, 0)} off experts paired over ${m.length} layers; mean output likeness ${out.mean_cos} (cosine), lowest layer mean ${Math.min(...m.map((l) => l.mean_cos))}; measured on ${info.tokens} tokens${info.done === false ? ` (cut short by the time limit: ${info.prompts} of ${info.prompts_in_file} asks)` : ''}`);
}
