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
  'excel-sum-tricky': [[['office_read', { path: F('expenses') }], ['calculate', { expression: '84.37+62.50+41.99-39.95+17.48+6.75' }]], 'You spent 173.14 in November, after the shoe refund (the subtotal row is not counted again).'],
  'excel-plain': [[['office_read', { path: F('q3') }]], 'April came to 2,150 (North 1,200, South 950).'],
  'ppt-find': [[['list_folder', { path: 'C:\\Users\\you\\Desktop' }], ['office_read', { path: F('offsite') }]], 'At Alder Lodge, on Fernwater Lake, on 18 and 19 March.'],
  'word-desktop': [[['office_make', { kind: 'writer', path: 'C:\\Users\\you\\Desktop\\Thanks_Neighbour.docx', text: '# Thank you\nThank you so much for watering my plants while I was away.' }]], 'Saved Thanks_Neighbour.docx on your Desktop.'],
  'excel-sheets': [[['office_read', { path: F('household') }], ['calculate', { expression: '97.45-88.10' }]], 'March 2026 was 97.45 and March 2025 was 88.10, so 9.35 more.'],
  'excel-formula-read': [[['office_read', { path: F('invoice') }]], 'The total is 50.00.'],
  'excel-formula-show': [[['office_read', { path: F('invoice'), formulas: true }]], 'The total is =SUM(D2:D4): it adds the three line totals, and each line is quantity times price.'],
  'excel-formula-edit': [[['office_read', { path: F('invoice') }], ['office_edit', { path: F('invoice'), changes: [{ op: 'set_cells', cells: { B2: 12 } }] }], ['office_read', { path: F('invoice') }]], 'Hinges are 12 now, and the new total is 60.00.'],
  'word-table': [[['office_read', { path: F('committee') }]], 'The treasurer is Isla Brandt, on 0700 900 222.'],
  'word-table-edit': [[['office_read', { path: F('committee') }], ['office_edit', { path: F('committee'), changes: [{ op: 'replace', find: '0700 900 111', replace: '0700 900 444' }] }]], "Rowan's number is 0700 900 444 now."],
  'ppt-retitle': [[['office_read', { path: F('pitch') }], ['office_edit', { path: F('pitch'), changes: [{ op: 'replace', find: 'Why join', replace: 'Why you should join' }] }]], "Slide 2 is called 'Why you should join' now."],
  'word-append': [[['office_read', { path: F('lease') }], ['office_edit', { path: F('lease'), changes: [{ op: 'append', text: 'Parking: one space, number 7' }] }]], 'Added the parking line at the end.'],
  'excel-to-pdf': [[['convert_file', { paths: [F('reading')], to: 'pdf' }]], 'Saved Reading_Log.pdf next to the spreadsheet.'],
  'word-batch-pdf': [[['convert_file', { paths: [F('quote1'), F('quote2')], to: 'pdf' }]], 'Saved Roof_Quote_v1.pdf and Roof_Quote_v2.pdf in Documents.'],
  'word-old-doc': [[['office_read', { path: F('recipe') }]], 'Smoked paprika, one teaspoon.'],
  'word-readonly': [[['office_read', { path: F('contract') }], ['office_edit', { path: F('contract'), changes: [{ op: 'replace', find: '31 May 2025', replace: '30 June 2025' }] }]], "The Archive folder is read-only for me, so I didn't change it. I can save a changed copy in Documents if you like."],
  'word-broken': [[['office_read', { path: F('broken') }]], "Minutes_Oct.docx is damaged, so I can't read who chaired the meeting."],
  'excel-ambiguous': [[['list_folder', { path: 'C:\\Users\\you\\Documents' }], ['office_read', { path: F('budget') }]], 'Your rent is 1,850 a month, from Budget_2026.xlsx (there is an older 2025 budget too).'],
  'excel-big': [[['convert_file', { paths: [F('orders')], to: 'csv' }], ['query_data', { file: 'C:\\Users\\you\\Documents\\Orders_2026.csv', action: 'ask', sql: "SELECT count(*), round(sum(Amount), 2) FROM data WHERE City = 'Leeds'" }]], '428 orders came from Leeds, adding up to 195,831.51.'],
  'word-missing': [[['list_folder', { path: 'C:\\Users\\you\\Documents' }]], "I can't find Minutes_September.docx in your Documents."]
};

// lazy: the brain calls no tool and says "Done, all sorted." to every job: every job must FAIL, so a claim alone never passes
export async function oracle({ bob = path.resolve(here, '..'), office = '', keep = false, lazy = false, log = console.log } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'office-oracle-'));
  const rowsIn = officeJobs().filter((j) => office || !j.office.lo);
  // without LibreOffice the test Bob has no Office Hand: the plain way is then read_file
  const plainOf = (key) => (office ? PLAIN[key][0] : PLAIN[key][0].map(([t, a]) => [t === 'office_read' ? 'read_file' : t, a]));
    const endOf = (key) => PLAIN[key][1];
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
