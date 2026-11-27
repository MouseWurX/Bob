// Nov 27, the owner: "We can look at it 3 dimensionally or more and see how the shape changes as each category
// optimizes, then maybe we can see how it will work on different equipment". The test-results database as a shape:
// for one brain, each measured machine is a point along card memory, memory clock, PCIe link and processor threads,
// with its measured speed at each reading step and its fastest step. Between measured machines it draws a guess
// (straight lines along card memory between the two nearest measured cards), always marked as a guess: GUPPI himself
// only ever starts from measured numbers.
//   node src/measured-shape.js [--brain <file name part>] [--data <Bob data folder>] --out shape.html
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readAll, readSeed, speedsFor } from './measured-db.js';
import { pcKey } from './measured-holdout.js';

const JOB = { readTok: 16384, outTok: 300 };
const jobS = (sp, s) => (sp?.read?.[s] > 0 && sp?.write?.[s] > 0 ? JOB.readTok / sp.read[s] + JOB.outTok / sp.write[s] : null);
const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// -> [{ pc, key, cardMiB, hw, cache, steps: { step: { read, write, jobS } }, best }] for one brain file, one point a machine
export function shapePoints(rows, file, { cache = true } = {}) {
  const pts = [];
  const mine = rows.filter((r) => r.brain.file === file);
  const seen = new Map(); for (const r of mine) { const k = pcKey(r.pc); if (!seen.has(k)) seen.set(k, r.pc); }
  for (const [key, pc] of seen) {
    const at = mine.filter((r) => pcKey(r.pc) === key);
    const be = Math.max(0, ...at.map((r) => r.be || 0));
    const sp = speedsFor(at, { file, pc, be, cache });
    if (!sp) continue;
    const steps = {};
    for (const s of Object.keys(sp.write).map(Number)) steps[s] = { read: sp.read[s] || null, write: sp.write[s], jobS: jobS(sp, s) };
    const timed = Object.entries(steps).filter(([, v]) => v.jobS);
    const best = timed.length ? Number(timed.reduce((a, b) => (b[1].jobS < a[1].jobS ? b : a))[0]) : null;
    pts.push({ key, pc, cardMiB: pc.cardMiB || 0, hw: pc.hw || {}, cache, rows: at.length, steps, best });
  }
  return pts.sort((a, b) => a.cardMiB - b.cardMiB);
}
// a guess for a card size nobody measured: each step's speeds straight-line between the two nearest measured cards
export function guessAt(pts, cardMiB) {
  const lo = [...pts].reverse().find((p) => p.cardMiB <= cardMiB), hi = pts.find((p) => p.cardMiB >= cardMiB);
  if (!lo || !hi) return null;
  const t = hi.cardMiB === lo.cardMiB ? 0 : (cardMiB - lo.cardMiB) / (hi.cardMiB - lo.cardMiB);
  const steps = {};
  for (const s of Object.keys(lo.steps).filter((k) => hi.steps[k])) {
    const mix = (w) => (lo.steps[s][w] && hi.steps[s][w] ? lo.steps[s][w] + t * (hi.steps[s][w] - lo.steps[s][w]) : null);
    const read = mix('read'), write = mix('write');
    steps[s] = { read, write, jobS: read && write ? JOB.readTok / read + JOB.outTok / write : null };
  }
  return { cardMiB, guess: true, from: [lo.key, hi.key], steps };
}

export function shapeHtml(rows, { brain = '' } = {}) {
  const files = [...new Set(rows.map((r) => r.brain.file))].filter((f) => !brain || f.toLowerCase().includes(brain.toLowerCase()));
  const parts = [];
  for (const file of files) {
    for (const cache of [true, false]) {
      const pts = shapePoints(rows, file, { cache });
      if (!pts.length) continue;
      const steps = [...new Set(pts.flatMap((p) => Object.keys(p.steps).map(Number)))].sort((a, b) => a - b);
      const W = 640, H = 260, pad = 44;
      const xs = pts.map((p) => p.cardMiB), x0 = Math.min(...xs, 4096), x1 = Math.max(...xs, 32768);
      const ys = pts.flatMap((p) => Object.values(p.steps).map((v) => v.write)).filter(Boolean), y1 = Math.max(...ys, 1) * 1.1;
      const X = (v) => pad + ((v - x0) / (x1 - x0 || 1)) * (W - 2 * pad), Y = (v) => H - pad - (v / y1) * (H - 2 * pad);
      const hue = (i) => `hsl(${(i * 67) % 360} 65% 45%)`;
      let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="writing speed by card memory"><line x1="${pad}" y1="${H - pad}" x2="${W - pad}" y2="${H - pad}" stroke="currentColor" opacity=".4"/><line x1="${pad}" y1="${pad / 2}" x2="${pad}" y2="${H - pad}" stroke="currentColor" opacity=".4"/>`;
      for (const g of [4, 8, 12, 16, 24, 32]) if (g * 1024 >= x0 && g * 1024 <= x1) svg += `<text x="${X(g * 1024)}" y="${H - pad + 16}" font-size="11" text-anchor="middle">${g} GB</text>`;
      svg += `<text x="${pad - 6}" y="${pad / 2 + 4}" font-size="11" text-anchor="end">${Math.round(y1)}</text><text x="${W / 2}" y="${H - 6}" font-size="11" text-anchor="middle">card memory (writing tokens a second, per reading step)</text>`;
      steps.forEach((s, i) => {
        const line = pts.filter((p) => p.steps[s]?.write);
        if (line.length > 1) svg += `<polyline fill="none" stroke="${hue(i)}" stroke-dasharray="4 4" points="${line.map((p) => `${X(p.cardMiB)},${Y(p.steps[s].write)}`).join(' ')}"/>`;
        for (const p of line) svg += `<circle cx="${X(p.cardMiB)}" cy="${Y(p.steps[s].write)}" r="${p.best === s ? 6 : 4}" fill="${hue(i)}"><title>${esc(p.key)}: step ${s}, ${p.steps[s].write} written / ${p.steps[s].read ?? '?'} read a second</title></circle>`;
        svg += `<text x="${W - pad}" y="${pad / 2 + 14 * i + 4}" font-size="11" text-anchor="end" style="fill:${hue(i)}">step ${s}</text>`;
      });
      svg += '</svg>';
      const tr = pts.map((p) => `<tr><td>${esc(p.key)}</td><td>${p.hw.cc ?? ''}</td><td>${p.hw.memClockMHz ?? ''}</td><td>${p.hw.pcieGen ? `${p.hw.pcieGen} x${p.hw.pcieWidth ?? '?'}` : ''}</td><td>${p.hw.threads ?? ''}</td><td>${p.rows}</td>${steps.map((s) => `<td>${p.steps[s]?.jobS ? `${p.steps[s].jobS.toFixed(1)} s` : ''}</td>`).join('')}<td><b>${p.best ?? ''}</b></td></tr>`).join('');
      const gaps = []; for (let i = 0; i + 1 < pts.length; i++) if (pts[i + 1].cardMiB - pts[i].cardMiB > 3072) { const mid = Math.round((pts[i].cardMiB + pts[i + 1].cardMiB) / 2048) * 1024; const g = guessAt(pts, mid); if (g) gaps.push(`<li>${Math.round(mid / 1024)} GB card (a guess between ${esc(g.from[0])} and ${esc(g.from[1])}): ${Object.entries(g.steps).map(([s, v]) => `step ${s} about ${v.jobS ? v.jobS.toFixed(1) : '?'} s`).join(', ')}</li>`); }
      parts.push(`<section><h2>${esc(file)}, ${cache ? 'with the copy cache (GUPPI\'s way)' : 'without the copy cache'}</h2>${svg}
<table><tr><th>Machine</th><th>Compute</th><th>Memory MHz</th><th>PCIe</th><th>Threads</th><th>Runs</th>${steps.map((s) => `<th>Job at ${s}</th>`).join('')}<th>Fastest step</th></tr>${tr}</table>
<p class="note">Job = a 16,384-token read and 300 tokens written, from the measured speeds. The big dot is each machine's fastest step.</p>
${gaps.length ? `<h3>Guesses between measured cards (not measured; GUPPI never uses these)</h3><ul>${gaps.join('')}</ul>` : '<p class="note">No gaps wide enough to guess across yet.</p>'}</section>`);
    }
  }
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>GUPPI test-results shape</title>
<style>:root{--bg:#fbfaf7;--fg:#1d1d1b;--line:#d8d4cc}@media (prefers-color-scheme:dark){:root{--bg:#161614;--fg:#ecebe6;--line:#3a3833}}body{background:var(--bg);color:var(--fg);font:15px/1.45 system-ui,sans-serif;margin:0 auto;max-width:900px;padding:16px}svg{width:100%;height:auto;color:var(--fg)}text{fill:currentColor}table{border-collapse:collapse;width:100%;font-size:13px;display:block;overflow-x:auto}td,th{border-bottom:1px solid var(--line);padding:4px 8px;text-align:left;white-space:nowrap}.note{opacity:.75;font-size:13px}</style></head><body>
<h1>GUPPI test-results shape</h1><p class="note">${rows.length} measured rows. Each machine is one point; the other measures (compute, memory clock, PCIe, threads) are in the table, so the shape can be read along each of them as more machines are measured.</p>
${parts.join('\n') || '<p>No brain has speeds measured yet.</p>'}</body></html>`;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const opt = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : ''; };
  const rows = opt('data') ? readAll({ dataDir: opt('data') }) : readSeed();
  const extra = opt('rows') ? fs.readFileSync(opt('rows'), 'utf8').split(/\r?\n/).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean) : [];
  const { cleanRow } = await import('./measured-db.js');
  const out = opt('out') || 'guppi-shape.html';
  fs.writeFileSync(out, shapeHtml([...extra.map(cleanRow).filter(Boolean), ...rows], { brain: opt('brain') }));
  console.log(`wrote ${out}`);
}
