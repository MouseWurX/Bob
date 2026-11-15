// Sets Brain Engine's live switches between benchmark commands of a Forge plan (13 Nov: the Riker sweep on the rented card).
// Live only: nothing is written to the brain, and --reset puts everything back.
//   node set-live.mjs --reset
//   node set-live.mjs --used 6                       experts per word in every layer (Brain Engine 7b12282, patch 0013)
//   node set-live.mjs --used best --from <folder>[,<folder>]   the N whose tool-score in <folder>/n<N>/ was best (ties: the smaller N)
//   node set-live.mjs --keep <keep.json> [--used N]  the expert mask from a keep list ({keep: [[ids] per layer]} or [[ids]])
// Writes the setting it made to <LAB_OUT>/live-<stamp>.json. --url or LAB_URL, and LAB_API_KEY, as the Forge sets them.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { live } from './engine-live.mjs';

// the best N from tool-score reports in <from>/n<N>/tool-score-*.json: right overall, ties to the smaller N
export function bestN(from) {
  const got = [];
  for (const base of String(from).split(',').filter(Boolean)) for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    const m = d.match(/^n(\d+)$/); if (!m) continue;
    const f = fs.readdirSync(path.join(base, d)).filter((x) => /^tool-score-.*\.json$/.test(x)).sort().pop(); if (!f) continue;
    const r = JSON.parse(fs.readFileSync(path.join(base, d, f), 'utf8')).results?.[0]; if (!r) continue;
    got.push({ n: Number(m[1]), total: r.total, of: r.totalN, tps: r.tpsAvg });
  }
  if (!got.length) return null;
  return got.sort((a, b) => b.total / Math.max(b.of, 1) - a.total / Math.max(a.of, 1) || a.n - b.n)[0];
}
export const keepOf = (j) => (Array.isArray(j) ? j : Array.isArray(j?.keep) ? j.keep : null);

async function main() {
  const a = Object.fromEntries(process.argv.slice(2).reduce((acc, x, i, arr) => (x.startsWith('--') ? [...acc, [x.slice(2), arr[i + 1] && !arr[i + 1].startsWith('--') ? arr[i + 1] : true]] : acc), []));
  const eng = live(String(a.url || process.env.LAB_URL || ''));
  const did = {};
  if (a.reset) { await eng.reset(); did.reset = true; }
  if (a.keep) {
    const f = path.resolve(String(a.keep));
    if (!fs.existsSync(f)) { console.error(`keep list ${f} not found; the mask runs are skipped`); process.exit(3); }
    const keep = keepOf(JSON.parse(fs.readFileSync(f, 'utf8'))); if (!keep) { console.error(`${f} has no keep list`); process.exit(3); }
    const own = (await eng.getUsed().catch(() => ({}))).own;
    if (Array.isArray(own) && keep.length !== own.length) { console.error(`${f} has ${keep.length} layers, the brain has ${own.length}: not this brain's keep list`); process.exit(3); }
    try { await eng.setUsed(null); } catch {} // an engine without 0013 has only the count it was started with
    await eng.setMask(keep); did.keep = { file: path.basename(f), layers: keep.length, kept: keep.filter(Array.isArray).reduce((s, x) => s + x.length, 0) };
  }
  if (a.used !== undefined && a.used !== true) {
    let n = a.used === 'best' ? bestN(String(a.from || process.env.LAB_OUT || '.').split(',').map((x) => path.resolve(x)).join(','))?.n : Number(a.used);
    if (!n) { console.error('no N to set (no tool-score reports to pick the best from?)'); process.exit(3); }
    if (a['not']) for (const x of String(a['not']).split(',').map(Number)) if (x === n) { console.error(`best N is ${n}, already run with this mask; skipped`); process.exit(3); }
    await eng.setUsed(n); did.used = n;
  }
  const now = await eng.getUsed().catch(() => null);
  did.engine = now;
  const out = process.env.LAB_OUT || '.'; try { fs.writeFileSync(path.join(out, `live-${new Date().toISOString().replace(/[:.]/g, '-')}.json`), JSON.stringify(did, null, 1)); } catch {}
  console.log(`live: ${JSON.stringify({ ...did, engine: undefined })}`);
}
if (import.meta.url === pathToFileURL(process.argv[1] || '').href) main().catch((e) => { console.error(e.message); process.exit(1); });
