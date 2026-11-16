// The jobs harness checks itself (16 Nov 2026; MouseWurX: "we need to close the gaps in the harness"). Before a
// rental spends anything, do-jobs runs this: a scripted brain (a stand-in llama-server on this computer, no model, no
// internet) does one small job for each way the 800-job run's test world went wrong, through Bob's real loop and real
// tools in a throwaway home, and every run is checked with harness-faults.mjs plus the job's own check. Each job is
// built to hit one of the old faults: a sound, video, program, slide or Photoshop file; a file the request names that the
// scene left out; a scene reply cut off mid-JSON; an OK card; a script to fix; a "let me type it" choice; half an emoji
// in a reply; a diagram saved as PNG; a folder that holds the scene's folders; a "saved it" check on the test home; and
// an inbox job on the made-up mailbox (mail-world.mjs), where a draft is the most Bob can do.
//   node model-lab/jobs-selftest.mjs [--bob <Bob folder>] [--office <soffice>]   (exit 1 when any check fails)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { harnessFaults } from './harness-faults.mjs';
import { makeInbox } from './mail-world.mjs';
import { FILES as OFFICE_FILES } from './office-jobs.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const say = (t) => ({ choices: [{ message: { role: 'assistant', content: t } }], usage: { completion_tokens: 5, prompt_tokens: 900 } });
const call = (name, args, content = '') => ({ choices: [{ message: { role: 'assistant', content, tool_calls: [{ id: `c${Math.random().toString(36).slice(2, 8)}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { completion_tokens: 12, prompt_tokens: 900 } });
const HALF = '\ud83d'; // half of an emoji, as llama-server can hand back when a reply is cut mid-character

// the inbox job's mailbox (mail-world.mjs): the stand-in brain reads the catering mail by its id, drafts a reply and asks
// for a sort plan; the draft must be saved and nothing sent, the card kept, and the person's mail left where it was
const MAILBOX = { size: 120, seed: 5, flavour: 'gmail', kind: 'graded' };
const TRAP_ID = makeInbox(MAILBOX).needles['staff-trap'];

// one job per old fault: its request, the scene the stand-in brain writes, the calls it makes, and what must be true after
export const ALL_JOBS = [
  { id: 'st-files', kind: 'file_not_made', text: 'Tell me what each of these is: C:\\Users\\you\\Music\\beat_01.mp3, C:\\Users\\you\\Downloads\\setup_installer.exe, C:\\Users\\you\\Desktop\\Q3_Strategy.pptx, C:\\Users\\you\\Documents\\Icons_final.psd, C:\\Audio\\interview.wav, C:\\Users\\you\\Videos\\promo.mp4 and C:\\Users\\you\\Documents\\temp.doc.',
    scene: { files: ['C:\\Users\\you\\Music\\beat_01.mp3', 'C:\\Users\\you\\Downloads\\setup_installer.exe', 'C:\\Users\\you\\Documents\\Icons_final.psd', 'C:\\Audio\\interview.wav', 'C:\\Users\\you\\Videos\\promo.mp4'].map((p) => ({ path: p, content: '', meta: { Title: 'Demo' } }))
      .concat([{ path: 'C:\\Users\\you\\Desktop\\Q3_Strategy.pptx', content: 'Slide 1: Q3 Strategy\n- grow sales\n\nSlide 2: Risks\n- supply' }, { path: 'C:\\Users\\you\\Documents\\temp.doc', content: 'Temp notes\nCall the plumber.' }]) },
    plan: [['inspect_file', { path: 'C:\\Users\\you\\Downloads\\setup_installer.exe' }], ['read_file', { path: 'C:\\Users\\you\\Desktop\\Q3_Strategy.pptx' }], ['read_file', { path: 'C:\\Users\\you\\Documents\\temp.doc' }],
      ['list_folder', { path: 'C:\\Audio' }], ['list_folder', { path: 'C:\\Users\\you\\Videos' }], ['list_folder', { path: 'C:\\Users\\you\\Music' }], ['list_folder', { path: 'C:\\Users\\you\\Documents' }]],
    end: 'A song, a program, a deck, a Photoshop file, a recording, a video and a Word file.',
    check: (row, res) => /Windows program/i.test(res[0]) && /Q3 Strategy/.test(res[1]) && (/plumber/.test(res[2]) || /old Office fil/.test(res[2])) && /interview\.wav/.test(res[3]) && /promo\.mp4/.test(res[4]) && /beat_01\.mp3/.test(res[5]) && /Icons_final\.psd/.test(res[6]) },
  { id: 'st-named', kind: 'scene_missing_file', text: "Inspect the file 'downloaded_app.exe' in my Downloads for viruses.", scene: { files: [] },
    plan: [['inspect_file', { path: 'C:\\Users\\you\\Downloads\\downloaded_app.exe' }]], end: 'It is a small Windows program.',
    check: (row, res) => /Windows program/i.test(res[0]) },
  { id: 'st-dir', kind: 'scene_missing_folder', text: "Rename the folder 'Old Projects (2020-2021)' to 'Archived Projects - Legacy'.", scene: { files: [] },
    plan: [['list_folder', { path: 'C:\\Users\\you\\Documents' }]], end: 'Found it in Documents.',
    check: (row, res) => /Old Projects \(2020-2021\)/.test(res[0]) },
  { id: 'st-cut', kind: 'scene_lost', text: 'Look at C:\\Logs\\server.log and C:\\Logs\\notes.txt and tell me what went wrong.', cut: true,
    scene: { files: [{ path: 'C:\\Logs\\notes.txt', content: 'Restarted at 02:00.' }, { path: 'C:\\Logs\\server.log', content: '02:01 ERROR disk full\n02:02 ERROR disk full' }, { path: 'C:\\Logs\\old.log', content: '01:00 INFO start\n'.repeat(40) }] },
    plan: [['read_file', { path: 'C:\\Logs\\server.log' }], ['read_file', { path: 'C:\\Logs\\notes.txt' }]], end: 'The disk filled up after the restart.',
    check: (row, res) => /disk full/.test(res[0]) && /Restarted/.test(res[1]) },
  { id: 'st-code', kind: 'card_said_no+code_outside_project', text: 'My calc.py in Documents prints the wrong sum. Fix it so it prints 4.',
    scene: { files: [{ path: 'C:\\Users\\you\\Documents\\calc.py', content: 'print(2+3)\n' }] },
    plan: [['read_file', { path: 'C:\\Users\\you\\Documents\\calc.py' }], ['ask_together', { steps: [{ tool: 'edit_file', args: { path: 'C:\\Users\\you\\Documents\\calc.py', find: 'print(2+3)', replace: 'print(2+2)' }, say: 'fix the sum' }] }], ['edit_file', { path: 'C:\\Users\\you\\Documents\\calc.py', find: 'print(2+3)', replace: 'print(2+2)' }]],
    end: 'Fixed: it prints 4 now.',
    check: (row, res, kit) => /print\(2\+3\)/.test(res[0]) && /^Allowed/.test(res[1]) && !/said no|outside a project/i.test(res[2]) && kit.read('C:\\Users\\you\\Documents\\calc.py') === 'print(2+2)\n' },
  { id: 'st-pick', kind: 'typed_pick', text: 'Help me plan a weekend trip. Ask me what you need first.', scene: { files: [] },
    plan: [['ask_user', { question: 'Where and when?', choices: ["Here's the city:", "I'll type both"] }], ['ask_user', { question: 'Which city?', choices: ["I'll type the city", 'Paris', 'Rome'] }]], end: 'Paris it is: here is a plan.',
    check: (row, res) => /typed: nothing more to add/.test(res[0]) && /picked: Paris/.test(res[1]) },
  { id: 'st-emoji', kind: 'engine_refused', text: 'Write a cheerful note into C:\\Users\\you\\Documents\\note.txt.', scene: { files: [] }, half: true,
    plan: [['write_file', { path: 'C:\\Users\\you\\Documents\\note.txt', content: 'Have a lovely day!' }]], end: 'Saved it to C:\\Users\\you\\Documents\\note.txt.',
    check: (row, res, kit) => !row.error && kit.read('C:\\Users\\you\\Documents\\note.txt') === 'Have a lovely day!' && !JSON.stringify(row.messages || []).includes("isn't there") },
  { id: 'st-diagram', kind: 'no_window', text: 'Draw a flowchart of signing in: Start, Email, Password, Done. Save it as login_flow.png in my Documents.', scene: { files: [] },
    plan: [['make_diagram', { title: 'Sign in', mermaid: 'flowchart TD\n  A[Start] --> B[Email] --> C[Password] --> D[Done]', save_to: 'C:\\Users\\you\\Documents\\login_flow.png' }], ['list_folder', { path: 'C:\\Users\\you\\Documents' }]],
    end: 'Saved to Documents as login_flow.png.',
    check: (row, res) => /login_flow\.png/.test(res[1]) && (row.steps || []).some((s) => (s.calls || []).some((c) => /login_flow\.png$/.test(c.drawn || ''))) },
  { id: 'st-folder', kind: 'folder_not_allowed', text: "Zip the folder 'C:\\Backup\\Old Projects\\2023' into a zip called 2023_Backup.zip in C:\\Backups.",
    scene: { files: [{ path: 'C:\\Backup\\Old Projects\\2023\\ProjectA\\plan.txt', content: 'A' }, { path: 'C:\\Backup\\Old Projects\\2023\\ProjectB\\plan.txt', content: 'B' }], folders: ['C:\\Backups'] },
    plan: [['list_folder', { path: 'C:\\Backup\\Old Projects\\2023' }]], end: 'Both projects are in there.',
    check: (row, res) => /ProjectA/.test(res[0]) && /ProjectB/.test(res[0]) },
  // 16 Nov (MouseWurX: tests "to make sure bob can manage an email inbox"): the inbox world serves Bob's own email tools
  { id: 'st-mail', kind: 'mail_world', text: 'Wren from Kettle & Crumb asked about my catering order. Draft a reply saying lemon buns, then sort my inbox.', mail: MAILBOX,
    plan: [['read_email', { action: 'list', days: 7, words: 'catering' }], ['read_email', { action: 'read', id: TRAP_ID }], ['manage_email', { action: 'draft', to: 'wren.ashvale@kettlecrumb.example', subject: 'Re: Your catering order for Saturday', text: 'Hi Wren,\n\nThe lemon buns, please.\n\nThanks' }], ['manage_email', { action: 'sort', days: 30 }]],
    end: 'Saved a draft to Wren (not sent) and sorted the newsletters.',
    check: (row, res) => /catering/i.test(res[0]) && /lemon buns/.test(res[1]) && /NOT sent/.test(res[2]) && /moved|kept everything/i.test(res[3])
      && row.mail?.drafts?.length === 1 && /lemon buns/.test(row.mail.drafts[0].text) && row.mail.cards?.length === 1 && !row.mail.stats.refused.length && !row.mail.stats.expunges && !row.mail.changed[TRAP_ID] },
  // the same inbox with the mail catalog on: a bulk act from the catalog holds the person back, and code ranks replies
  { id: 'st-mail-cat', kind: 'mail_catalog', text: 'Trash everything from Kettle & Crumb, and tell me who needs a reply from me.', mail: { ...MAILBOX, catalog: true },
    plan: [['read_email', { action: 'groups', by: 'org' }], ['manage_email', { action: 'bulk', do: 'trash', org: 'Kettle & Crumb' }], ['read_email', { action: 'needs_reply', days: 14 }]],
    end: 'Trashed the Kettle & Crumb newsletters (Wren\'s own mail is kept) and listed who to answer.',
    check: (row, res) => /Catalog: 120 of 120/.test(res[0]) && /Done: moved to/.test(res[1]) && /Undo id/.test(res[1]) && new RegExp(`id ${TRAP_ID} `).test(res[2])
      && Object.values(row.mail?.changed || {}).some((c) => c.folders.some((f) => /trash/i.test(f))) && !row.mail.changed[TRAP_ID] && !row.mail.stats.refused.length && !row.mail.stats.expunges },
  // 16 Nov (MouseWurX: "starting with office files"): an office job's own made-up files are planted and read back as words,
  // and compare_files is on and gets both paths moved into the test home (they never were: it failed every time)
  { id: 'st-office-plain', kind: 'office_world', text: 'What is different between my March and April shop price lists, and what does my budget say about travel?',
    office: officeSpec(['march', 'april', 'budget']),
    plan: [['compare_files', { first: OFFICE_FILES.march.path, second: OFFICE_FILES.april.path }], ['read_file', { path: OFFICE_FILES.budget.path }]],
    end: 'Oat milk went up to 2.65, plum jam is gone and rye bread is new. Travel peaked at 640 in March.',
    check: (row, res) => /2\.65/.test(res[0]) && /Plum jam/.test(res[0]) && /640/.test(res[1]) && row.office?.files?.length === 3 && !row.office.missing.length
      && ['Shop_Prices_March.xlsx', 'Shop_Prices_April.xlsx', 'Budget_2026.xlsx'].every((n) => row.office.after.some((f) => f.path.endsWith(n) && f.text.length > 20)) },
  // with LibreOffice (--office): Bob's office_read, office_edit and convert_file really run, and the files they leave are read back
  { id: 'st-office', kind: 'office_tools', needsOffice: true, text: 'Read my lease summary, add The Salt Road to my reading log and make a PDF of the garden club deck.',
    office: officeSpec(['lease', 'reading', 'pitch'], true),
    plan: [['office_read', { path: OFFICE_FILES.lease.path }], ['office_edit', { path: OFFICE_FILES.reading.path, changes: [{ op: 'add_rows', rows: [['The Salt Road', 'M. Okafor', 312]] }] }], ['convert_file', { paths: [OFFICE_FILES.pitch.path], to: 'pdf' }]],
    end: 'Notice is 60 days. The Salt Road is in your reading log, and the deck is a PDF now.',
    check: (row, res) => /60 days/.test(res[0]) && /added 1 row/.test(res[1]) && /Saved: .*Garden_Club_Pitch\.pdf/.test(res[2])
      && row.office?.after?.some((f) => /Reading_Log\.xlsx$/.test(f.path) && /Salt Road/.test(f.text) && /Night Ferry/.test(f.text))
      && row.office.after.some((f) => /Garden_Club_Pitch\.pdf$/.test(f.path) && /Membership 45/.test(f.text)) }
];

// the jobs a self-test without LibreOffice runs (all of them but the office tools' check)
export const JOBS = ALL_JOBS.filter((j) => !j.needsOffice);
function officeSpec(keys, lo = false) { return { lo, files: keys.map((k) => ({ key: k, ...OFFICE_FILES[k] })) }; }

// The stand-in llama-server: scenes as the job says, then the job's calls one per step, then its last words.
export function brainServer(jobs) {
  const seen = { cutAsks: 0, halfSent: false, halfBack: false };
  const pickJob = (text) => jobs.find((j) => text.includes(j.text.slice(0, 40)));
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      // llama-server's JSON reader refuses half an emoji; so does this stand-in, so a broken request shows here too
      if (/\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F])/.test(b)) { seen.halfBack = true; res.statusCode = 400; res.end(JSON.stringify({ error: { code: 400, message: '[json.exception.parse_error.101] parse error: invalid string: surrogate U+D800..U+DBFF must be followed by U+DC00..U+DFFF' } })); return; }
      let q = {}; try { q = JSON.parse(b || '{}'); } catch {}
      const msgs = q.messages || [];
      const first = String(msgs[0]?.content || '');
      if (/^You set up a test computer/.test(first)) {
        const job = pickJob(String(msgs.find((m) => m.role === 'user')?.content || ''));
        const scene = JSON.stringify(job?.scene || { files: [] });
        // a reply cut off in its last file, both times it is asked (the 800-job run lost 9 scenes this way): the whole
        // files before the cut must still be planted
        if (job?.cut) { seen.cutAsks++; res.end(JSON.stringify(say(scene.slice(0, scene.indexOf('old.log') + 120)))); return; }
        res.end(JSON.stringify(say(scene))); return;
      }
      const user = msgs.filter((m) => m.role === 'user').map((m) => String(typeof m.content === 'string' ? m.content : (m.content || []).map((p) => p.text || '').join(' '))).join('\n');
      const job = pickJob(user);
      if (!job || !(q.tools || []).length) { res.end(JSON.stringify(say('All right.'))); return; }
      const done = msgs.filter((m) => m.role === 'tool').length;
      if (done < job.plan.length) {
        const [name, args] = job.plan[done];
        const out = call(name, args, job.half && done === 0 ? `On it ${HALF}` : '');
        if (job.half && done === 0) seen.halfSent = true;
        res.end(JSON.stringify(out)); return;
      }
      res.end(JSON.stringify(say(job.end)));
    });
  });
  return { srv, seen };
}

export async function selfTest({ bob = path.resolve(here, '..'), office = '', log = console.log, keep = false } = {}) {
  // the office tools' check needs LibreOffice: without --office the run has no Office Hand, so that check is not run
  const JOBS = ALL_JOBS.filter((j) => !j.needsOffice || office);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-selftest-'));
  const { srv, seen } = brainServer(JOBS);
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const jobsFile = path.join(tmp, 'selftest-jobs.jsonl');
  fs.writeFileSync(jobsFile, JOBS.map((j) => JSON.stringify({ id: j.id, job: 'selftest', text: j.text, ...(j.mail ? { mail: j.mail } : {}), ...(j.office ? { office: j.office } : {}) })).join('\n') + '\n');
  // no page outside this computer is reached: web addresses answer empty, the stand-in brain answers for real
  const offline = path.join(tmp, 'offline.mjs');
  fs.writeFileSync(offline, "const real = globalThis.fetch;\nglobalThis.fetch = async (u, o) => { const s = String(u?.url ?? u); if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(s)) return real(u, o); return new Response('', { status: 200, headers: { 'content-type': 'text/html' } }); };\n");
  const args = ['--import', pathToFileURL(offline).href, path.join(here, 'do-jobs.mjs'), '--url', url, '--bob', bob, '--out', tmp, '--dir', 'selftest', '--jobs', jobsFile, '--scene', 'make', '--parallel', '2', '--no-selftest', '--world-stop', 'off', '--job-minutes', '3', ...(office ? ['--office', office] : [])];
  const runLog = await new Promise((ok) => {
    const ch = spawn(process.execPath, args, { cwd: here, env: { ...process.env, LAB_API_KEY: 'selftest', LAB_URL: '', LAB_TAVILY_KEY: '', LAB_SELFTEST_KEEP: path.join(tmp, 'selftest', 'kept') } });
    let t = ''; ch.stdout.on('data', (d) => (t += d)); ch.stderr.on('data', (d) => (t += d));
    const stop = setTimeout(() => { ch.kill(); ok(t + '\n(self-test took too long)'); }, 300000); ch.on('exit', () => { clearTimeout(stop); ok(t); });
  });
  srv.close();
  const runsFile = path.join(tmp, 'selftest', 'runs.jsonl');
  const rows = fs.existsSync(runsFile) ? fs.readFileSync(runsFile, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const results = [];
  for (const j of JOBS) {
    const row = rows.find((r) => r.id === j.id);
    if (!row) { results.push({ id: j.id, kind: j.kind, ok: false, why: 'no run' }); continue; }
    const res = (row.steps || []).flatMap((s) => s.calls || []).filter((c) => j.plan.some(([n]) => n === c.name)).map((c) => String(c.result || ''));
    // the files the job left, read back through the same neutral names the brain used
    const world = { read: (p) => readBack(tmp, p) };
    const faults = harnessFaults(row);
    let own = false; try { own = Boolean(j.check(row, res, world)); } catch {}
    results.push({ id: j.id, kind: j.kind, ok: !faults.length && own && !row.error, ...(faults.length ? { faults: faults.map((f) => `${f.kind}: ${f.detail}`) } : {}), ...(own ? {} : { why: `its own check failed: ${res.map((x) => x.slice(0, 120)).join(' | ')}` }), ...(row.error ? { error: row.error } : {}) });
  }
  const extra = [];
  if (!seen.halfSent) extra.push({ id: 'st-emoji', ok: false, why: 'the half emoji was never sent' });
  if (seen.halfBack) extra.push({ id: 'st-emoji', ok: false, why: 'a request carried half an emoji back to llama-server' });
  if (!seen.cutAsks) extra.push({ id: 'st-cut', ok: false, why: 'no cut scene reply was sent' });
  const all = [...results, ...extra];
  for (const r of all) log(`${r.ok ? 'PASS' : 'FAIL'} self-test ${r.id} (${r.kind || 'check'})${r.ok ? '' : `: ${[r.why, r.error, ...(r.faults || [])].filter(Boolean).join('; ')}`}`);
  const ok = all.every((r) => r.ok) && rows.length === JOBS.length;
  if (!ok && rows.length !== JOBS.length) log(`self-test: ${rows.length} of ${JOBS.length} jobs ran\n${runLog.slice(-1500)}`);
  if (!keep) try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
  return { ok, results: all, log: runLog };
}

// The jobs' files are gone with their throwaway home once the run ends, so do-jobs keeps a copy of the files a self-test
// job wrote (LAB_SELFTEST_KEEP): <out>/selftest/kept/<neutral path>.
function readBack(tmp, p) {
  const f = path.join(tmp, 'selftest', 'kept', String(p).replace(/^[A-Za-z]:/, '').replace(/[\\/]+/g, '_'));
  try { return fs.readFileSync(f, 'utf8'); } catch { return null; }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  const r = await selfTest({ bob: get('--bob') || undefined, office: get('--office'), keep: a.includes('--keep') });
  console.log(r.ok ? `self-test OK: ${r.results.length} checks, the test world decided nothing` : 'SELF-TEST FAIL: the test world is not ready for a rental');
  process.exit(r.ok ? 0 : 1);
}
