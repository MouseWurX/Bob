// Blender job scores (22 Nov 2026): reads do-jobs runs of the Blender jobs (blender-jobs.mjs, all held-out) and scores
// the scene Bob left in the test Blender with each job's own checks (row.blender.before / after, written by
// blender-world.mjs), plus what his answer must say. A run that never started Blender fails ("never used Blender");
// a run whose test Blender broke (setup failed) is "world". Every run is still read in full afterwards.
//
//   node model-lab/blender-score.mjs --runs <runs.jsonl>[,<more>] [--out <folder>]
//   -> <out>/blender-score.json and <out>/blender-score.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobByKey } from './blender-jobs.mjs';

const calls = (row) => (row?.steps || []).flatMap((s) => s.calls || []);

export function scoreRun(row, job = jobByKey(row.key || String(row.id || '').replace(/^blender-/, ''))) {
  const key = job?.key || row.key || '';
  if (!job) return { id: row.id, key, verdict: 'unknown', why: ['no such Blender job'] };
  const b = row.blender || {}, said = String(row.said || ''), used = calls(row).filter((c) => c.name === 'mcp_use');
  const base = { id: row.id, key, type: job.type, steps: row.asks || 0, secs: Math.round(row.secs || 0), blender_calls: used.length, code_errors: used.filter((c) => /^Error|Traceback|Error:\n/.test(String(c.result || ''))).length };
  if (row.error && !b.after) return { ...base, verdict: 'error', why: [], error: String(row.error).slice(0, 200) };
  if (!b.after) return { ...base, verdict: 'fail', why: ['never used Blender'] };
  if (!b.before?.objects) return { ...base, verdict: 'world', why: [], world: ['the test Blender had no starting scene'] };
  let why;
  try { why = job.check(b.after, b.before); } catch (e) { return { ...base, verdict: 'world', why: [], world: [`the check broke: ${e.message}`] }; }
  for (const re of job.said || []) if (!re.test(said)) why.push(`answer lacks ${re}`);
  const verdict = row.error ? 'error' : why.length ? 'fail' : 'pass';
  return { ...base, verdict, why, ...(row.error ? { error: String(row.error).slice(0, 200) } : {}) };
}

export function scoreRuns(rowsByName) {
  const out = {};
  for (const [name, rows] of Object.entries(rowsByName)) {
    const scores = rows.filter((r) => r.job === 'blender' || /^blender-/.test(String(r.id))).map((r) => scoreRun(r));
    const n = (v) => scores.filter((s) => s.verdict === v).length;
    out[name] = { runs: scores.length, pass: n('pass'), fail: n('fail'), world: n('world'), error: n('error'), blender_calls: scores.reduce((a, s) => a + (s.blender_calls || 0), 0), code_errors: scores.reduce((a, s) => a + (s.code_errors || 0), 0), scores };
  }
  return out;
}

export function report(res) {
  const lines = ['# Blender jobs: code scores (held-out set)', '', "Pass = the scene Bob left passes the job's checks (sizes, places, names, materials, modifiers, lights, camera, animation; the rest left as it was) and his answer says what was asked. World = the test Blender broke. Every run is still read in full afterwards.", ''];
  lines.push('| Run | Jobs | Pass | Fail | World | Error | Blender calls | Code that failed |', '|---|---|---|---|---|---|---|---|');
  for (const [name, r] of Object.entries(res)) lines.push(`| ${name} | ${r.runs} | ${r.pass} | ${r.fail} | ${r.world} | ${r.error} | ${r.blender_calls} | ${r.code_errors} |`);
  for (const [name, r] of Object.entries(res)) {
    lines.push('', `## ${name}`, '', '| Job | Kind | Verdict | Blender calls | Why |', '|---|---|---|---|---|');
    for (const s of r.scores) lines.push(`| ${s.key} | ${s.type || '-'} | ${s.verdict} | ${s.blender_calls ?? '-'} | ${[...(s.world || []).map((w) => `world: ${w}`), ...(s.why || []), s.error || ''].filter(Boolean).join('; ').replace(/\|/g, '/').slice(0, 400) || '-'} |`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  const files = get('--runs').split(',').map((x) => x.trim()).filter(Boolean);
  if (!files.length) { console.log('node blender-score.mjs --runs <runs.jsonl>[,<more>] [--out <folder>]'); process.exit(1); }
  const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  for (const f of files) if (!fs.existsSync(f)) console.log(`no runs file ${f} (left out)`);
  const res = scoreRuns(Object.fromEntries(files.filter((f) => fs.existsSync(f)).map((f) => [path.basename(path.dirname(f)), read(f)])));
  const out = get('--out') || path.join(path.dirname(files[0]), '..', 'blender-score');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'blender-score.json'), JSON.stringify(res, null, 1));
  fs.writeFileSync(path.join(out, 'blender-score.md'), report(res));
  console.log(report(res));
}
