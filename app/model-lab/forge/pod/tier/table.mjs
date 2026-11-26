// Tier sweep (Forge build 23): one table from every tier's row.json, for the README and the dissertation.
//   node table.mjs <folder with <tier>/row.json, or unzipped pods' folders> [more folders]  -> markdown on stdout
import fs from 'node:fs';
import path from 'node:path';

const rows = [];
const walk = (d, depth = 0) => {
  let list = []; try { list = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
  for (const e of list) {
    const p = path.join(d, e.name);
    if (e.isFile() && e.name === 'row.json') { try { rows.push(JSON.parse(fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n'))); } catch {} }
    else if (e.isDirectory() && depth < 4) walk(p, depth + 1);
  }
};
for (const d of process.argv.slice(2)) walk(path.resolve(d));
const order = ['t08-sim', 't12-sim', 't24-ampere', 't24-ada', 't32', 't48', 'tcpu'];
rows.sort((a, b) => (order.indexOf(a.tier) + 1 || 99) - (order.indexOf(b.tier) + 1 || 99));
const t = (x) => (x === undefined || x === null || x === '' ? '-' : x);
const out = ['# GPU tier sweep: Bob\'s defaults', '', `Rows: ${rows.length}. Simulated rows: fit, pick, spill and crashes are real; their speeds are the bigger card's and are left out.`, '',
  '| Tier | Card | Pod RAM | Set | Brain | Context | Read t/s | Write t/s | Peak / budget MiB | Spill | Reloads / crashes | Tool job | Result | Minutes | $ | Bob / engine |',
  '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|'];
for (const r of rows) {
  const c = r.card_log || {}, s = r.steps || {}, e = r.engine || {};
  const sim = r.simulated;
  out.push(`| ${t(r.label || r.tier)} | ${t(r.card?.name)}${sim ? ` (as ${r.card_gb_sim} GB)` : ''} | ${t(r.pod_ram_gb)} GB | ${t(r.hardware?.suggestedPack)} | ${t(r.brain?.name)} | ${t(e.ctx)} | ${sim ? '(sim)' : t(s.long_read?.read_tps)} | ${sim ? '(sim)' : t(s.everyday?.write_tps_median)} | ${t(c.peak_mib)} / ${t(c.budget_mib)} | ${t(e.spill)} | ${r.engine_reloads || 0} / ${r.engine_crashes || 0} | ${s.tool_job?.pass === true ? 'pass' : s.tool_job?.pass === false ? 'fail' : '-'} (${t(s.tool_job?.bad_calls)} bad) | ${String(t(r.result)).toUpperCase()}${r.failed_at ? ` (${r.failed_at})` : ''} | ${t(r.minutes)} | ${r.dollars_per_hour ? (r.dollars_per_hour * (r.minutes || 0) / 60).toFixed(2) : '-'} | ${t(r.bob_release)} / ${t(e.build || e.build_info)} |`);
}
const fails = rows.filter((r) => r.result !== 'pass');
if (fails.length) { out.push('', '## Not passed', ''); for (const r of fails) out.push(`- ${r.label || r.tier}: ${r.failed_at ? `stopped at ${r.failed_at}: ${r.why || ''}` : Object.entries(r.checks || {}).filter(([, v]) => !v).map(([k]) => k).join(', ')}`); }
console.log(out.join('\n'));
