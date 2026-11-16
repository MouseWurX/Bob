// The office jobs check themselves (16 Nov 2026; MouseWurX: "starting with office files"; no broken test world may pass
// for Bob failing). A scripted brain (jobs-selftest.mjs's stand-in llama-server: no model, no internet) does every office
// job the plain way, through Bob's real loop, real tools and LibreOffice, in do-jobs, and office-score.mjs must pass every
// one. If it doesn't, the job, its files or its score is wrong, not the brain. Run it on the PC before a rental that
// carries the office jobs. The scripted calls are a check of the harness only: the runs are thrown away and never become
// lessons.
//   node model-lab/office-oracle.mjs --office <soffice> [--bob <Bob folder>] [--keep] [--lazy]   (exit 1 when any job fails)
// --lazy: a brain that does nothing and says "Done" must fail every job (the score can't be fooled by a claim).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { brainServer } from './jobs-selftest.mjs';
import { officeJobs, FILES } from './office-jobs.mjs';
import { scoreRun } from './office-score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const D = 'C:\\Users\\you\\Documents\\';
const F = (k) => FILES[k].path;
// the plain way to do each job: its calls in order and the closing words
export const PLAIN = {
  'word-read': [[['office_read', { path: F('lease') }]], 'Notice is 60 days in writing, and the rent is 1,850 a month.'],
  'excel-read': [[['office_read', { path: F('budget') }]], 'March: 640 on travel.'],
  'excel-sum': [[['office_read', { path: F('budget') }], ['calculate', { expression: '2380+2330+2920+2365+2465+2350' }]], 'The six months come to 14,810.'],
  'ppt-read': [[['office_read', { path: F('pitch') }]], 'The spring seed swap is on 12 April and the harvest supper on 27 September.'],
  'word-to-pdf': [[['convert_file', { paths: [F('lease')], to: 'pdf' }]], 'Done: Lease_Summary_Harbor_Lane.pdf is next to it.'],
  'excel-to-csv': [[['convert_file', { paths: [F('budget')], to: 'csv' }]], 'Saved Budget_2026.csv next to the spreadsheet.'],
  'excel-to-csv-taken': [[['convert_file', { paths: [F('budget')], to: 'csv' }]], 'Budget_2026.csv was taken, so the new one is Budget_2026-2.csv.'],
  'ppt-to-pdf': [[['convert_file', { paths: [F('pitch')], to: 'pdf' }]], 'Garden_Club_Pitch.pdf is on your Desktop.'],
  'word-edit': [[['office_read', { path: F('invite') }], ['office_edit', { path: F('invite'), changes: [{ op: 'replace', find: 'Saturday 14 June', replace: 'Saturday 21 June' }] }]], 'The invite now says Saturday 21 June.'],
  'excel-edit': [[['office_read', { path: F('reading') }], ['office_edit', { path: F('reading'), changes: [{ op: 'add_rows', rows: [['The Salt Road', 'M. Okafor', 312]] }] }]], 'Added The Salt Road.'],
  'ppt-add': [[['office_read', { path: F('pitch') }], ['office_edit', { path: F('pitch'), changes: [{ op: 'add_slide', at: 5, title: 'Volunteers', bullets: ['Sign up at the gate', 'Saturday mornings'] }] }]], 'Volunteers is slide 5 now, before Questions.'],
  'ppt-delete': [[['office_read', { path: F('pitch') }], ['office_edit', { path: F('pitch'), changes: [{ op: 'delete_slide', number: 3 }] }]], 'The Costs slide is gone.'],
  'word-compare': [[['compare_files', { first: F('quote1'), second: F('quote2') }]], 'The price went from 1,200 to 1,350, ten tiles became twelve, the free gutter check is gone and work starts 3 May.'],
  'excel-compare': [[['compare_files', { first: F('march'), second: F('april') }]], 'Oat milk went up from 2.40 to 2.65, plum jam is gone and rye bread (3.10) is new.'],
  'excel-make': [[['office_make', { kind: 'calc', path: `${D}Subscriptions.xlsx`, sheets: [{ name: 'Subscriptions', rows: [['Name', 'Cost'], ['Streamly', 12.99], ['CloudBox', 2.99], ['FitTrack', 7.5], ['Total', '=SUM(B2:B4)']] }] }]], 'Saved Subscriptions.xlsx: the total is 23.48.'],
  'word-make': [[['office_make', { kind: 'writer', path: `${D}Camping_List.docx`, text: '# Camping list\n- Tent\n- Sleeping bag\n- Torch\n- Water' }]], 'Saved Camping_List.docx in Documents.'],
  'word-missing': [[['list_folder', { path: 'C:\\Users\\you\\Documents' }]], "I can't find Minutes_September.docx in your Documents."]
};

const NO_OFFICE_MAKE = [['save_spreadsheet', { name: 'Subscriptions', csv: 'Name,Cost\nStreamly,12.99\nCloudBox,2.99\nFitTrack,7.50\nTotal,23.48' }]];
// lazy: the brain calls no tool and says "Done, all sorted." to every job: every job must FAIL, so a claim alone never passes
export async function oracle({ bob = path.resolve(here, '..'), office = '', keep = false, lazy = false, log = console.log } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-oracle-'));
  const rowsIn = officeJobs().filter((j) => office || !j.office.lo);
  // without LibreOffice the test Bob has no Office Hand: the plain way is then read_file and save_spreadsheet
  const plainOf = (key) => (office ? PLAIN[key][0] : key === 'excel-make' ? NO_OFFICE_MAKE : PLAIN[key][0].map(([t, a]) => [t === 'office_read' ? 'read_file' : t, a]));
  // save_spreadsheet names its own file (with the day), so that answer names no file
  const endOf = (key) => (!office && key === 'excel-make' ? 'Saved your subscriptions spreadsheet: the total is 23.48.' : PLAIN[key][1]);
  const jobs = rowsIn.map((j) => ({ ...j, plan: lazy ? [] : plainOf(j.key), end: lazy ? 'Done, all sorted.' : endOf(j.key) }));
  const { srv } = brainServer(jobs);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const jobsFile = path.join(tmp, 'office-jobs.jsonl');
  fs.writeFileSync(jobsFile, rowsIn.map((j) => JSON.stringify(j)).join('\n') + '\n');
  const offline = path.join(tmp, 'offline.mjs');
  fs.writeFileSync(offline, "const real = globalThis.fetch;\nglobalThis.fetch = async (u, o) => { const s = String(u?.url ?? u); if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(s)) return real(u, o); return new Response('', { status: 200 }); };\n");
  const args = ['--import', pathToFileURL(offline).href, path.join(here, 'do-jobs.mjs'), '--url', `http://127.0.0.1:${srv.address().port}`, '--bob', bob, '--out', tmp, '--dir', 'oracle', '--jobs', jobsFile, '--parallel', '2', '--no-selftest', '--world-stop', 'off', '--job-minutes', '4', ...(office ? ['--office', office] : [])];
  const runLog = await new Promise((ok) => {
    const ch = spawn(process.execPath, args, { cwd: here, env: { ...process.env, LAB_API_KEY: 'oracle', LAB_URL: '', LAB_TAVILY_KEY: '' } });
    let t = ''; ch.stdout.on('data', (d) => (t += d)); ch.stderr.on('data', (d) => (t += d));
    const stop = setTimeout(() => { ch.kill(); ok(t + '\n(took too long)'); }, 900000); ch.on('exit', () => { clearTimeout(stop); ok(t); });
  });
  srv.close();
  const f = path.join(tmp, 'oracle', 'runs.jsonl');
  const rows = fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const scores = rowsIn.map((j) => { const r = rows.find((x) => x.id === j.id); return r ? scoreRun(r) : { id: j.id, key: j.key, verdict: 'no run', why: [] }; });
  const want = lazy ? 'fail' : 'pass';
  for (const s of scores) log(`${s.verdict === want ? 'PASS' : 'FAIL'} office ${s.key}${lazy ? ` (a do-nothing brain: ${s.verdict})` : s.verdict === 'pass' ? '' : ` (${s.verdict}): ${[...(s.world || []), ...(s.why || []), s.error || ''].filter(Boolean).join('; ')}`}`);
  const ok = scores.length === rowsIn.length && scores.every((s) => s.verdict === want);
  if (!ok && rows.length < rowsIn.length) log(runLog.slice(-1500));
  if (!keep) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {} else log(`kept: ${tmp}`);
  return { ok, scores, left_out: office ? 0 : officeJobs().length - rowsIn.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  const r = await oracle({ bob: get('--bob') || undefined, office: get('--office'), keep: a.includes('--keep'), lazy: a.includes('--lazy') });
  console.log(r.ok ? `office oracle OK: ${r.scores.length} jobs ${a.includes('--lazy') ? 'fail for a do-nothing brain' : 'pass the plain way'}${r.left_out ? ` (${r.left_out} left out: no --office)` : ''}` : 'OFFICE ORACLE FAIL: a job, its files or its score is wrong');
  process.exit(r.ok ? 0 : 1);
}
