// 16 Nov 2026 (MouseWurX: "we need to close the gaps in the harness"): the 800-job read found 47 runs decided by the test
// world, not the brain. This checks the harness's own self-test passes (one scripted job per old fault, through Bob's
// real loop), the fault check names each kind from a run row (and leaves alone what isn't a fault), a rental stops once
// 3 in 10 runs are decided by the test world, half an emoji never reaches llama-server, and a replay of an old run in
// today's world clears its old fault. No model, no internet: stand-in servers on this computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs selftest '));
const { harnessFaults, namedFiles, TYPED_CHOICE, FAULTS } = await imp('model-lab/harness-faults.mjs');
const { selfTest, JOBS } = await imp('model-lab/jobs-selftest.mjs');
const { LlamaCpp } = await imp('src/llamacpp.js');

// ---- the fault check, from a run row alone ----
{
  const row = (extra) => ({ id: 'x', text: 'hello', scene: { made: 'new', files: [], folders: [], skipped: [], problems: [] }, steps: [], ...extra });
  const withCall = (c, scene) => row({ ...(scene ? { scene: { made: 'new', files: [], folders: [], skipped: [], problems: [], ...scene } } : {}), steps: [{ calls: [c] }] });
  const kinds = (r) => harnessFaults(r).map((f) => f.kind).join(',');
  check('a clean run has no fault', kinds(row()) === '');
  check('a scene reply that could not be read is named', kinds(row({ scene: { made: 'new', files: [], problems: ['not JSON (Unterminated string)'] } })) === 'scene_lost');
  check('a cut reply whose whole files were kept is not a fault', kinds(row({ scene: { made: 'new', files: ['C:\\a.txt'], problems: ['reply cut off; what was whole before the cut was kept'] } })) === '');
  check('a file the scene asked for and the home skipped is named', kinds(row({ scene: { made: 'new', files: [], skipped: [{ path: 'x.iso', why: "can't make .iso" }] } })) === 'file_not_made');
  check('llama-server refusing the request is named', kinds(row({ error: 'failed: llama-server 400: parse error' })) === 'engine_refused');
  check('an OK card answered "no" is named', kinds(withCall({ name: 'ask_together', result: 'The user said no to all of it.' })) === 'card_said_no');
  check("a script edit refused as outside a project is named", kinds(withCall({ name: 'edit_file', result: "Error: I don't edit program or script files outside a project." })) === 'code_outside_project');
  check('a "let me type it" pick is named; "typed: nothing more" is not', kinds(withCall({ name: 'ask_user', result: "the user picked: I'll type the city" })) === 'typed_pick'
    && kinds(withCall({ name: 'ask_user', result: "the user picked: Here's the path:\nthe user typed: nothing more to add; go on with what you have" })) === '' && kinds(withCall({ name: 'ask_user', result: 'the user picked: Paris' })) === '');
  check('a diagram nothing drew is named; one the stand-in window saved is not', kinds(withCall({ name: 'make_diagram', result: 'Drawing: the chat window draws "A"' })) === 'no_window'
    && kinds(withCall({ name: 'make_diagram', result: 'Drawing: the chat window draws "A"', drawn: 'C:\\Users\\you\\Documents\\a.png' })) === '');
  check("a refused folder is named only when it holds the scene's own folders", kinds(withCall({ name: 'list_folder', args: { path: 'C:\\Backup\\2023' }, result: "Error: I'm not allowed to look in C:\\Backup\\2023." }, { folders: ['C:\\Backup\\2023\\A'] })) === 'folder_not_allowed'
    && kinds(withCall({ name: 'list_folder', args: { path: 'C:\\Windows' }, result: "Error: I'm not allowed to look in C:\\Windows." }, { folders: ['C:\\Backup\\2023\\A'] })) === ''
    && kinds(withCall({ name: 'list_folder', args: { path: 'C:\\' }, result: "Error: I'm not allowed to look in C:\\." }, { folders: ['C:\\Backup\\2023\\A'] })) === '');
  check('a file the request names and the scene left out is named', kinds(row({ text: "Inspect 'setup.exe' in Downloads" })) === 'scene_missing_file' && kinds(row({ text: "Inspect 'setup.exe' in Downloads", scene: { made: 'new', files: ['C:\\Users\\you\\Downloads\\setup.exe'] } })) === '');
  check('a file the job asks Bob to make is not "missing"', namedFiles("Zip it into '2023_Backup.zip' and save the chart as chart.png").length === 0 && namedFiles('Shrink /home/user/Videos/trip.mp4').length === 1);
  check('a job run with no scene on purpose is never "missing" a file', kinds(row({ text: "Inspect 'setup.exe'", scene: { made: 'none', files: [] } })) === '');
  check('the "let me type it" wordings', ["I'll type the city", "Here's the script path:", "I'll type both", 'Something else', 'Let me paste it'].every((c) => TYPED_CHOICE.test(c)) && !['Paris', 'Use my location', 'Yes, go ahead'].some((c) => TYPED_CHOICE.test(c)));
  check('every kind has a plain description', Object.keys(FAULTS).length >= 9 && Object.values(FAULTS).every((t) => t.length > 20));
}

// ---- half an emoji never goes to llama-server (Bob's own engine; 2 of the 800 runs died on it) ----
{
  const half = 'ok ' + '\ud83d' + ' end';
  const out = JSON.stringify(LlamaCpp.toOpenAI([{ role: 'user', content: half }, { role: 'assistant', content: half, tool_calls: [{ function: { name: 'x', arguments: { a: half } } }] }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'y', arguments: JSON.stringify({ a: half }) } }] }, { role: 'tool', tool_name: 'x', content: half }]));
  check('half an emoji is made whole in every message and call', !/\\ud83d(?!\\ude)/i.test(out) && /\\ufffd|\ufffd/.test(out), out.slice(0, 300));
  check('a whole emoji stays as it is', JSON.stringify(LlamaCpp.toOpenAI([{ role: 'user', content: 'fine 😀' }])).includes('😀'));
}

// ---- the self-test itself passes, one job per old fault ----
{
  const r = await selfTest({ bob: app, log: () => {} });
  check(`the harness self-test passes: ${JOBS.length} jobs, the test world decided nothing`, r.ok && r.results.length === JOBS.length, JSON.stringify(r.results.filter((x) => !x.ok)).slice(0, 800) + r.log.slice(-600));
  check('it covers every old fault kind', ['file_not_made', 'scene_missing_file', 'scene_lost', 'card_said_no', 'code_outside_project', 'typed_pick', 'engine_refused', 'no_window', 'folder_not_allowed'].every((k) => JOBS.some((j) => j.kind.includes(k))));
  const dj = fs.readFileSync(path.join(app, 'model-lab', 'do-jobs.mjs'), 'utf8').replace(/\r\n/g, '\n');
  check('do-jobs runs it before any job, and a failure stops the run', /selfTest\(/.test(dj) && dj.indexOf('selfTest(') < dj.indexOf('async function runJob') && /fail\('the test world failed its self-test/.test(dj));
}

// ---- a rental stops once 3 in 10 runs are decided by the test world ----
const say = (t) => ({ choices: [{ message: { role: 'assistant', content: t } }], usage: { completion_tokens: 5, prompt_tokens: 900 } });
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    res.setHeader('content-type', 'application/json');
    const q = JSON.parse(b || '{}'), first = String(q.messages?.[0]?.content || '');
    // every scene asks for a disk image, a kind the test home can't make
    res.end(JSON.stringify(say(/^You set up a test computer/.test(first) ? JSON.stringify({ files: [{ path: 'C:\\Users\\you\\Downloads\\disk.iso', content: '' }] }) : 'There is a disk image there.')));
  });
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}`;
const offline = path.join(tmp, 'offline.mjs');
fs.writeFileSync(offline, "const real = globalThis.fetch;\nglobalThis.fetch = async (u, o) => { const s = String(u?.url ?? u); if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(s)) return real(u, o); return new Response('', { status: 200, headers: { 'content-type': 'text/html' } }); };\n");
const jobs = path.join(tmp, 'iso-jobs.jsonl');
fs.writeFileSync(jobs, Array.from({ length: 14 }, (_, i) => JSON.stringify({ id: `iso${i}`, job: 'files', text: `What is on disk image number ${i} in my Downloads?` })).join('\n') + '\n');
const run = (extra, dir) => new Promise((ok) => {
  const ch = spawn(process.execPath, ['--import', pathToFileURL(offline).href, 'do-jobs.mjs', '--url', url, '--bob', app, '--out', tmp, '--dir', dir, '--jobs', jobs, '--scene', 'make', '--parallel', '1', '--no-selftest', ...extra], { cwd: path.join(app, 'model-lab'), env: { ...process.env, LAB_API_KEY: 'k', LAB_URL: '', LAB_TAVILY_KEY: '' } });
  let log = ''; ch.stdout.on('data', (d) => (log += d)); ch.stderr.on('data', (d) => (log += d));
  const t = setTimeout(() => { ch.kill(); ok({ code: -1, log }); }, 240000); ch.on('exit', (code) => { clearTimeout(t); ok({ code, log }); });
});
{
  const r = await run([], 'world-stop');
  const rows = fs.readFileSync(path.join(tmp, 'world-stop', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  check('each run keeps what the test world got wrong, and the log says so', rows.every((x) => x.harness?.[0]?.kind === 'file_not_made') && /test world: file_not_made/.test(r.log), r.log.slice(-500));
  check('once 10 runs are in and 3 in 10 were the world, no new job starts', rows.length === 10 && /were decided by the test world, not the brain/.test(r.log), `${rows.length} runs`);
  check('the summary counts them by kind', /Decided by the test world, not the brain: 10 \(file_not_made 10\)/.test(fs.readFileSync(path.join(tmp, 'world-stop', 'summary.md'), 'utf8')) && /Stopped early: 3 in 10/.test(fs.readFileSync(path.join(tmp, 'world-stop', 'summary.md'), 'utf8')));
  const r2 = await run(['--world-stop', 'off'], 'world-go');
  check('--world-stop off runs them all (a run meant to find such faults)', fs.readFileSync(path.join(tmp, 'world-go', 'runs.jsonl'), 'utf8').trim().split('\n').length === 14, r2.log.slice(-300));
}
srv.close();

// ---- a replay of an old run in today's world: same calls, new world ----
{
  const { recheck } = await imp('model-lab/jobs-recheck.mjs');
  const runs = path.join(tmp, 'old-runs.jsonl'), scenes = path.join(tmp, 'old-scenes.jsonl');
  const text = 'What is in my Music folder? I think beat_01.mp3 is there.';
  fs.writeFileSync(scenes, JSON.stringify({ id: 'old1', text, scene: { files: [{ path: 'C:\\Users\\you\\Music\\beat_01.mp3', content: '' }], folders: [], board: [], memory: [] }, problems: [], ok: true }) + '\n');
  fs.writeFileSync(runs, JSON.stringify({ id: 'old1', job: 'files', text, scene: { made: 'new', files: [], folders: [], skipped: [{ path: 'C:\\Users\\you\\Music\\beat_01.mp3', why: "this test home can't make .mp3 files" }], problems: [] }, said: 'The folder is empty.', steps: [{ calls: [{ name: 'list_folder', args: { path: 'C:\\Users\\you\\Music' }, result: '(empty folder)' }] }] }) + '\n');
  const { report, dir } = await recheck({ runs, scenes, ids: ['old1'], bob: app, out: path.join(tmp, 'replay'), log: () => {} });
  const fresh = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l))[0];
  const listed = (fresh?.steps || []).flatMap((s) => s.calls || []).find((c) => c.name === 'list_folder');
  check("a replay makes the old run's very calls in today's world, and its old fault is gone", report[0].before.join() === 'file_not_made' && report[0].after.length === 0 && /beat_01\.mp3/.test(listed?.result || ''), JSON.stringify(report) + JSON.stringify(listed));
}

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
