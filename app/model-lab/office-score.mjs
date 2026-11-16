// Office job scores (16 Nov 2026; MouseWurX: test Bob's untested features "one category at a time. starting with office
// files"). Reads do-jobs runs of the office jobs (office-jobs.mjs) and scores what code can check: did Bob use a tool
// that does the job (and the one the job is there to cover), is every fact in his answer, and do the files he left
// (read back by do-jobs, row.office.after) say what they should, with the originals unchanged where they should be.
// A run the test world decided (row.harness: LibreOffice missing, a planted file not made, a path not moved into the
// test home) is "world", never a fail. It also counts every office tool call over all runs (the coverage the 900-run
// read never saw). Opus still reads every run; nothing here replaces that read.
//
//   node model-lab/office-score.mjs --runs <runs.jsonl>[,<more>] [--out <folder>]
//   -> <out>/office-score.json and <out>/office-score.md
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { jobByKey, fileWords, FILES } from './office-jobs.mjs';

export const OFFICE_TOOLS = ['office_read', 'office_edit', 'office_make', 'convert_file', 'compare_files', 'find_in_documents', 'read_file', 'save_spreadsheet'];
const calls = (row) => (row?.steps || []).flatMap((s) => s.calls || []);
const failed = (c) => /^Error|^There's no LibreOffice|is off\. It's in Settings|Give the full path/.test(String(c.result || ''));

export function scoreRun(row) {
  const key = row.key || String(row.id || '').replace(/^office-/, '');
  const job = jobByKey(key);
  if (!job) return { id: row.id, key, verdict: 'unknown', why: ['no such office job'] };
  const sc = job.score, why = [];
  const all = calls(row), used = [...new Set(all.map((c) => c.name))];
  const worked = new Set(all.filter((c) => !failed(c)).map((c) => c.name));
  const world = (row.harness || []).map((f) => f.kind);
  const said = String(row.said || '');
  const after = row.office?.after || [];
  const routeOk = sc.route.some((t) => worked.has(t));
  if (!routeOk) why.push(`no ${sc.route.join('/')} that worked (used: ${used.join(', ') || 'no tool'})`);
  for (const re of sc.said || []) if (!re.test(said)) why.push(`answer lacks ${re}`);
  if (sc.honest && !sc.honest.test(said)) why.push('does not say the file is not there');
  for (const want of sc.files || []) {
    const hits = after.filter((f) => want.like.test(f.path));
    const good = hits.find((f) => (want.has || []).every((re) => re.test(f.text)) && !(want.lacks || []).some((re) => re.test(f.text)) && inOrder(f.text, want.order));
    if (!good) {
      if (!hits.length) why.push(`no file like ${want.like}`);
      else {
        const f = hits.at(-1);
        for (const re of want.has || []) if (!re.test(f.text)) why.push(`${base(f.path)} lacks ${re}`);
        for (const re of want.lacks || []) if (re.test(f.text)) why.push(`${base(f.path)} still has ${re}`);
        if (want.order && !inOrder(f.text, want.order)) why.push(`${base(f.path)}: not in the order ${want.order.join(' > ')}`);
      }
    }
  }
  for (const k of sc.kept || []) {
    const f = after.find((x) => base(x.path).toLowerCase() === base(FILES[k].path).toLowerCase());
    if (!f) why.push(`${base(FILES[k].path)} is gone`);
    else if (!fileWords(k).every((w) => f.text.includes(w))) why.push(`${base(FILES[k].path)} was changed`);
  }
  const verdict = world.length ? 'world' : row.error ? 'error' : why.length ? 'fail' : 'pass';
  return { id: row.id, key, verdict, best: worked.has(sc.best), used, why, ...(world.length ? { world } : {}), ...(row.error ? { error: String(row.error).slice(0, 200) } : {}), steps: row.asks || 0, secs: Math.round(row.secs || 0) };
}
const base = (p) => String(p).split(/[\\/]/).pop();
function inOrder(text, words) {
  if (!words) return true;
  let at = -1;
  for (const w of words) { const i = text.indexOf(w, at + 1); if (i < 0) return false; at = i; }
  return true;
}

// every office tool call over the runs: how often, how often it worked
export function toolCounts(rows) {
  const t = Object.fromEntries(OFFICE_TOOLS.map((n) => [n, { calls: 0, worked: 0, runs: 0 }]));
  for (const r of rows) {
    const seen = new Set();
    for (const c of calls(r)) { if (!t[c.name]) continue; t[c.name].calls++; if (!failed(c)) t[c.name].worked++; seen.add(c.name); }
    for (const n of seen) t[n].runs++;
  }
  return t;
}

export function scoreRuns(rowsByName) {
  const out = {};
  for (const [name, rows] of Object.entries(rowsByName)) {
    const office = rows.filter((r) => r.job === 'office' || /^office-/.test(String(r.id)));
    const scores = office.map(scoreRun);
    const n = (v) => scores.filter((s) => s.verdict === v).length;
    out[name] = { runs: scores.length, pass: n('pass'), fail: n('fail'), world: n('world'), error: n('error'), best_tool: scores.filter((s) => s.best).length, tools: toolCounts(office), scores };
  }
  return out;
}

export function report(res) {
  const lines = ['# Office jobs: code scores', '', 'Pass = a tool that does the job worked, every fact is in the answer, and the files say what they should. World = the test world decided the run (left out of pass and fail). Opus still reads every run.', ''];
  lines.push('| Run | Jobs | Pass | Fail | World | Error | Used the covered tool |', '|---|---|---|---|---|---|---|');
  for (const [name, r] of Object.entries(res)) lines.push(`| ${name} | ${r.runs} | ${r.pass} | ${r.fail} | ${r.world} | ${r.error} | ${r.best_tool} |`);
  for (const [name, r] of Object.entries(res)) {
    lines.push('', `## ${name}`, '', '| Tool | Calls | Worked | Runs |', '|---|---|---|---|');
    for (const [t, c] of Object.entries(r.tools)) lines.push(`| ${t} | ${c.calls} | ${c.worked} | ${c.runs} |`);
    lines.push('', '| Job | Verdict | Tools | Why |', '|---|---|---|---|');
    for (const s of r.scores) lines.push(`| ${s.key} | ${s.verdict}${s.best ? '' : ' (not the covered tool)'} | ${s.used.join(', ') || '-'} | ${[...(s.world || []).map((w) => `world: ${w}`), ...s.why, s.error || ''].filter(Boolean).join('; ').replace(/\|/g, '/') || '-'} |`);
  }
  return lines.join('\n') + '\n';
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  const files = get('--runs').split(',').map((x) => x.trim()).filter(Boolean);
  if (!files.length) { console.log('node office-score.mjs --runs <runs.jsonl>[,<more>] [--out <folder>]'); process.exit(1); }
  const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  const res = scoreRuns(Object.fromEntries(files.filter((f) => fs.existsSync(f)).map((f) => [path.basename(path.dirname(f)), read(f)])));
  const out = get('--out') || path.join(path.dirname(files[0]), '..', 'office-score');
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'office-score.json'), JSON.stringify(res, (k, v) => (v instanceof RegExp ? String(v) : v), 1));
  fs.writeFileSync(path.join(out, 'office-score.md'), report(res));
  console.log(report(res));
}
