// Harness compare (21 Nov 2026; the owner: "we can run it at the same time cant we?"). Runs the 33 repository jobs
// (repo-jobs.mjs, the same jobs file Bob's repo1 run used) in another coding-agent harness, on the pod, against the
// same llama-server, and reads back what each run left with repo-jobs.mjs's own repoAfter, so repo-score.mjs scores
// the rows exactly as it scores Bob's.
//
// Each job: the project is planted (plantRepo: git repository, one commit, a bare "origin" in the same throwaway
// folder), the request is given with the pod's folder in place of C:\Users\you\Projects\bob-tools, the harness runs
// headless as an unprivileged user with a clean environment, then the folder is read back (repoAfter) with the pod's
// folder turned back into C:\Users\you\Projects\bob-tools.
// The harnesses have no "calls" in Bob's shape, so the scorer's calls are made from what really ran: small shims for
// node, npm and git on the harness's PATH log every start (time, arguments, exit code), and each changed file's last
// write time stands for an edit. "Ran a check after the last change" = a node/npm start after the last write.
//
//   node harness-run.mjs --jobs jobs.jsonl --harness qwen-code|mini-swe-agent|stand-in-right|stand-in-wrong
//        --root <work folder> --out <folder for runs.jsonl> [--parallel 4] [--job-minutes 8] [--turns 40]
//        [--hours 0.5] [--url http://127.0.0.1:8001/v1] [--model qwen3.6] [--only key,key] [--user hc]
//        [--node <real node>] [--qwen <cli-entry.js>] [--mini <mini binary>] [--bash <bash>] [--smoke]
//   the brain's key comes from HC_API_KEY (never on a command line)
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { plantRepo, repoAfter, REPO_DIR, gitEnv } from './repo-jobs.mjs';

const a = process.argv.slice(2);
const opt = (k, d = '') => { const i = a.indexOf(`--${k}`); return i >= 0 && a[i + 1] !== undefined && !a[i + 1].startsWith('--') ? a[i + 1] : d; };
const flag = (k) => a.includes(`--${k}`);
const H = opt('harness'), ROOT = path.resolve(opt('root', '/srv/hc')), OUT = path.resolve(opt('out', '.'));
const PAR = Math.max(1, Number(opt('parallel', 4))), JOB_MIN = Number(opt('job-minutes', 8)), TURNS = Number(opt('turns', 40)), HOURS = Number(opt('hours', 0.5));
const URL_ = opt('url', 'http://127.0.0.1:8001/v1'), MODEL = opt('model', 'qwen3.6'), KEY = process.env.HC_API_KEY || 'none';
const NODE = opt('node', process.execPath), QWEN = opt('qwen'), MINI = opt('mini'), BASH = opt('bash', 'bash'), USER = opt('user');
const WIN = process.platform === 'win32';
const HARNESSES = ['qwen-code', 'mini-swe-agent', 'stand-in-right', 'stand-in-wrong'];
if (!HARNESSES.includes(H)) { console.log(`--harness must be one of ${HARNESSES.join(', ')}`); process.exit(2); }

const ids = (() => { if (!USER || WIN) return null; const u = spawnSync('id', ['-u', USER], { encoding: 'utf8' }), g = spawnSync('id', ['-g', USER], { encoding: 'utf8' }); return u.status === 0 ? { uid: Number(u.stdout), gid: Number(g.stdout) } : null; })();
if (USER && !WIN && !ids) { console.log(`no user ${USER} on this machine`); process.exit(2); }
const chown = (p, to) => { if (ids) spawnSync('chown', ['-R', to, p]); };
const posix = (p) => (WIN ? String(p).replace(/^([A-Za-z]):[\\/]/, (m, d) => `/${d.toLowerCase()}/`).replace(/\\/g, '/') : String(p));
const log = (...x) => console.log(new Date().toISOString().slice(11, 19), `[${H}]`, ...x);

// ---- the request with the pod's folder for the project ----
const projOf = (key) => path.join(ROOT, H, key, 'bob-tools');
function toHere(text, proj) {
  const p = posix(proj);
  return String(text)
    .replace(/file:\/\/\/C:\/Users\/you\/Projects\/bob-tools/g, () => `file://${WIN ? '/' : ''}${p}`)
    .replace(/C:\/Users\/you\/Projects\/bob-tools/g, () => p)
    .replace(/C:\\Users\\you\\Projects\\bob-tools((?:\\[\w.@-]+)*)/g, (m, rest) => p + rest.replace(/\\/g, '/'));
}
function neutralFor(proj) {
  const forms = [...new Set([proj, posix(proj), (() => { try { return fs.realpathSync(proj); } catch { return proj; } })(), `file://${posix(proj)}`, `file:///${posix(proj).replace(/^\//, '')}`])].sort((x, y) => y.length - x.length);
  return (t) => { let s = String(t ?? ''); for (const f of forms) s = s.split(f).join(f.startsWith('file:') ? `file:///${REPO_DIR.replace(/\\/g, '/')}` : REPO_DIR); return s; };
}

// ---- shims: node, npm and git log each start, then run the real program ----
function which(name) { const r = spawnSync(WIN ? 'where' : 'which', [name], { encoding: 'utf8' }); return String(r.stdout || '').split(/\r?\n/).find(Boolean) || ''; }
const REAL = { node: NODE, npm: (() => { const d = path.dirname(NODE); for (const f of WIN ? ['npm.cmd'] : ['npm']) if (fs.existsSync(path.join(d, f))) return path.join(d, f); return which('npm'); })(), git: which('git') };
function makeShims(dir, logFile) {
  fs.mkdirSync(dir, { recursive: true });
  for (const [name, real] of Object.entries(REAL)) {
    if (!real) continue;
    const r = posix(real);
    fs.writeFileSync(path.join(dir, name), `#!/bin/bash
if [ -n "\${HC_IN_SHIM:-}" ]; then exec "${r}" "$@"; fi
export HC_IN_SHIM=1
t0=$(date +%s%3N); "${r}" "$@"; c=$?; t1=$(date +%s%3N)
{ printf '%s\\t%s\\t%s\\t%s\\t%s' ${name} "$t0" "$t1" "$c" "$PWD"; for x in "$@"; do x=\${x//$'\\t'/ }; x=\${x//$'\\n'/\\\\n}; printf '\\t%s' "$x"; done; printf '\\n'; } >> "${posix(logFile)}"
exit $c
`, { mode: 0o755 });
  }
}
function shimCalls(logFile) {
  let lines = []; try { lines = fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean); } catch {}
  return lines.map((l) => { const [name, t0, t1, code, cwd, ...rest] = l.split('\t'); return { name: 'run_command', args: { cmd: name, args: rest.map((x) => x.replace(/\\n/g, '\n')), cwd }, result: `Finished with exit code ${code}`, t: Number(t0), t_end: Number(t1), via: 'shim' }; });
}

// ---- the harnesses ----
function harnessCommand(job, proj, home, work) {
  const text = toHere(job.text, proj);
  if (H === 'qwen-code') {
    fs.mkdirSync(path.join(home, '.qwen'), { recursive: true });
    fs.writeFileSync(path.join(home, '.qwen', 'settings.json'), JSON.stringify({
      modelProviders: { openai: [{ id: MODEL, name: 'llama-server on the pod', envKey: 'OPENAI_API_KEY', baseUrl: URL_ }] },
      security: { auth: { selectedType: 'openai' }, folderTrust: { enabled: false } },
      model: { name: MODEL, maxSessionTurns: TURNS },
      privacy: { usageStatisticsEnabled: false }, telemetry: { enabled: false },
      tools: { exclude: ['web_fetch', 'web_search', 'google_web_search'] }
    }, null, 1));
    return { cmd: NODE, args: [QWEN, '-p', text, '--yolo', '--output-format', 'json', '--max-session-turns', String(TURNS)], text };
  }
  if (H === 'mini-swe-agent') {
    const cfg = path.join(work, 'hc-mini.yaml');
    fs.writeFileSync(cfg, `model:\n  model_name: "openai/${MODEL}"\n  cost_tracking: ignore_errors\n  model_kwargs:\n    api_base: "${URL_}"\n    drop_params: true\nagent:\n  step_limit: ${TURNS}\n  cost_limit: 0\nenvironment:\n  timeout: 120\n`);
    return { cmd: MINI, args: ['-c', 'mini.yaml', '-c', cfg, '-t', text, '-y', '--exit-immediately', '-o', path.join(work, 'traj.json'), '-l', '0'], text };
  }
  // stand-ins (pre-flight on the PC, no brain): "right" puts the planted bug back as it was, runs the tests and names
  // the file; "wrong" touches a test file it may not and runs nothing. They prove the plant, shims, read-back and score.
  const stage = path.join(work, 'stage'); fs.mkdirSync(stage, { recursive: true });
  let script = 'echo "I looked and did nothing."';
  if (H === 'stand-in-right' && job.fix) { fs.writeFileSync(path.join(stage, 'fixed'), job.fix.content); script = `cp "${posix(path.join(stage, 'fixed'))}" "${job.fix.path}" && node test/run.js > /dev/null; echo "Fixed ${job.fix.path}: put the line back as it should be; node test/run.js passes."`; }
  if (H === 'stand-in-right' && job.type === 'run') script = `node test/run.js | tail -1; echo "All ${job.repo.passed} checks pass, 0 fail."`;
  if (H === 'stand-in-wrong') script = `printf '// touched\\n' >> test/run.js; echo "Done."`;
  return { cmd: BASH, args: ['-c', script], text };
}
function readAnswer(out, work) {
  if (H === 'qwen-code') {
    let arr = null; try { arr = JSON.parse(out); } catch { const m = out.match(/\[\s*\{[\s\S]*\}\s*\]\s*$/); try { arr = m ? JSON.parse(m[0]) : null; } catch {} }
    if (!Array.isArray(arr)) return { said: '', asks: 0, tools: [], bad: 'no JSON answer from qwen' };
    const last = arr[arr.length - 1] || {}, assistants = arr.filter((m) => m.type === 'assistant');
    const tools = assistants.flatMap((m) => (m.message?.content || []).filter((c) => c.type === 'tool_use').map((c) => c.name));
    return { said: String(last.result ?? ''), asks: assistants.length, tools, ...(last.is_error ? { bad: `qwen says: ${String(last.subtype || last.result || 'error').slice(0, 200)}` } : {}) };
  }
  if (H === 'mini-swe-agent') {
    let t = null; try { t = JSON.parse(fs.readFileSync(path.join(work, 'traj.json'), 'utf8')); } catch {}
    if (!t) return { said: '', asks: 0, tools: [], bad: 'no trajectory from mini-swe-agent' };
    const msgs = t.messages || [], asst = msgs.filter((m) => m.role === 'assistant');
    const lastText = [...asst].reverse().map((m) => (typeof m.content === 'string' ? m.content : (m.content || []).map((c) => c.text || '').join(''))).find((x) => x && x.trim()) || '';
    const said = [String(t.info?.submission || '').trim(), lastText.trim()].filter(Boolean).join('\n\n');
    return { said, asks: Number(t.info?.model_stats?.api_calls) || asst.length, tools: asst.flatMap((m) => (m.extra?.actions || []).map((x) => String(x.command || '').slice(0, 120))), exit_status: t.info?.exit_status || '' };
  }
  const lines = out.trim().split(/\r?\n/);
  return { said: lines[lines.length - 1] || '', asks: 1, tools: ['bash'] };
}

function runOnce(cmd, args, { cwd, env, ms }) {
  return new Promise((res) => {
    const t0 = Date.now(); let out = '', err = '', killed = false;
    let ch; try { ch = spawn(cmd, args, { cwd, env, stdio: ['ignore', 'pipe', 'pipe'], detached: !WIN, windowsHide: true, ...(ids ? ids : {}) }); } catch (e) { res({ code: -1, out, err: String(e.message || e), secs: 0, killed }); return; }
    const timer = setTimeout(() => { killed = true; try { if (WIN) ch.kill(); else process.kill(-ch.pid, 'SIGKILL'); } catch {} }, ms);
    ch.stdout.on('data', (d) => { if (out.length < 4e6) out += d; }); ch.stderr.on('data', (d) => { if (err.length < 2e5) err += d; });
    ch.on('error', (e) => { err += String(e.message || e); });
    ch.on('close', (code) => { clearTimeout(timer); res({ code, out, err, secs: (Date.now() - t0) / 1000, killed }); });
  });
}

function envFor(home, shims) {
  const g = Object.fromEntries(Object.entries(gitEnv({})).filter(([k]) => /^GIT_|^GCM_/.test(k)));
  const base = WIN ? { SystemRoot: process.env.SystemRoot, TEMP: process.env.TEMP, TMP: process.env.TMP, PATHEXT: process.env.PATHEXT, USERPROFILE: home, APPDATA: path.join(home, 'AppData') } : {};
  const sys = WIN ? process.env.PATH : '/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin';
  return { ...base, PATH: `${WIN ? shims : shims}${path.delimiter}${path.dirname(NODE)}${MINI ? path.delimiter + path.dirname(MINI) : ''}${path.delimiter}${sys}`, HOME: home, USER: USER || 'hc', LOGNAME: USER || 'hc', LANG: 'C.UTF-8', LC_ALL: 'C.UTF-8', TERM: 'dumb', NO_COLOR: '1', ...g,
    OPENAI_API_KEY: KEY, OPENAI_BASE_URL: URL_, OPENAI_API_BASE: URL_, OPENAI_MODEL: MODEL,
    QWEN_CODE_SUPPRESS_YOLO_WARNING: '1', MSWEA_CONFIGURED: 'true', MSWEA_COST_TRACKING: 'ignore_errors', MSWEA_GLOBAL_COST_LIMIT: '0', MSWEA_GLOBAL_CALL_LIMIT: '0', PYTHONUNBUFFERED: '1' };
}

const inside = (root, p) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
async function doJob(job) {
  const jd = path.join(ROOT, H, job.key), proj = projOf(job.key), work = path.join(ROOT, '.work', H, job.key), home = path.join(ROOT, '.homes', H, job.key);
  for (const d of [jd, work, home]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  const neutral = neutralFor(proj), world = [];
  const kit = { tmp: jd, cfg: {}, brain: null, neutral, place: (p) => (p === REPO_DIR ? proj : path.isAbsolute(p) && inside(jd, p) ? p : '') };
  const planted = plantRepo(kit, job.repo);
  if (planted.missing.length) return { id: job.id, job: 'repo', type: job.type, key: job.key, text: job.text, said: '', steps: [], asks: 0, secs: 0, harness: planted.missing.map((m) => ({ kind: m })), harness_name: H };
  const callLog = path.join(work, 'calls.tsv'), shims = path.join(work, 'bin');
  makeShims(shims, callLog); fs.writeFileSync(callLog, '');
  // the stand-in's "right" fix: the planted file as it was before the bug
  if (H.startsWith('stand-in') && job.bug) job.fix = job.bug;
  const { cmd, args, text } = harnessCommand(job, proj, home, work);
  if (ids) { for (const d of [jd, work, home]) chown(d, `${ids.uid}:${ids.gid}`); }
  const r = await runOnce(cmd, args, { cwd: proj, env: envFor(home, shims), ms: JOB_MIN * 60000 });
  if (ids) chown(jd, '0:0');
  fs.writeFileSync(path.join(work, 'stdout.txt'), r.out); fs.writeFileSync(path.join(work, 'stderr.txt'), r.err);
  const ans = readAnswer(r.out, work);
  const shim = shimCalls(callLog);
  const after = repoAfter(kit, planted, job.repo, [{ calls: shim }]);
  // each changed file's last write stands for an edit (a deleted file: its folder's last change)
  const edits = after.changed.map((c) => { const p = path.join(proj, ...c.path.split('/')); let t = 0; try { t = fs.statSync(c.how === 'deleted' ? path.dirname(p) : p).mtimeMs; } catch {} return { name: c.how === 'deleted' ? 'file_hands' : c.how === 'added' ? 'write_file' : 'edit_file', args: { path: c.path }, result: 'done (read back from the file\'s last write time)', t, via: 'mtime' }; });
  const calls = [...shim, ...edits].sort((x, y) => x.t - y.t);
  const nothing = !ans.said && !after.changed.length && !shim.length;
  const error = r.killed && nothing ? `the harness ran past ${JOB_MIN} min and left nothing` : (r.code !== 0 && nothing) ? `the harness did not run (exit ${r.code}): ${(r.err || ans.bad || '').trim().split('\n').slice(-3).join(' | ').slice(0, 300)}` : '';
  const transcript = path.join(OUT, 'transcripts', `${job.key}.txt`); fs.mkdirSync(path.dirname(transcript), { recursive: true });
  fs.writeFileSync(transcript, `$ ${H} in ${proj}\n--- request\n${text}\n--- exit ${r.code}${r.killed ? ' (killed at the time cap)' : ''}, ${Math.round(r.secs)} s\n--- answer\n${ans.said}\n--- node/npm/git starts\n${shim.map((c) => `${new Date(c.t).toISOString().slice(11, 19)} ${c.args.cmd} ${c.args.args.join(' ')} -> ${c.result}`).join('\n')}\n--- tools\n${(ans.tools || []).join('\n')}\n--- stderr (last 4000)\n${r.err.slice(-4000)}\n--- stdout (last 20000)\n${r.out.slice(-20000)}\n`);
  return { id: job.id, job: 'repo', type: job.type, key: job.key, text: job.text, harness_name: H, said: neutral(ans.said), steps: [{ calls }], asks: ans.asks, secs: r.secs, exit: r.code, ...(r.killed ? { timed_out: true } : {}), ...(ans.exit_status ? { exit_status: ans.exit_status } : {}), ...(ans.bad ? { harness_note: ans.bad } : {}),
    harness: world, repo: { passed: job.repo.passed, after }, ...(error ? { error } : {}) };
}

// ---- smoke: one tiny ask, so a harness that can't reach the brain is found before 33 jobs are spent on it ----
async function smoke() {
  const proj = path.join(ROOT, '.smoke', H); fs.rmSync(proj, { recursive: true, force: true }); fs.mkdirSync(proj, { recursive: true });
  const home = path.join(ROOT, '.homes', H, '_smoke'), work = path.join(ROOT, '.work', H, '_smoke');
  for (const d of [home, work]) { fs.rmSync(d, { recursive: true, force: true }); fs.mkdirSync(d, { recursive: true }); }
  const job = { key: '_smoke', type: 'find', text: 'Reply with the single word READY and nothing else. Do not run any command.', repo: {} };
  const { cmd, args } = harnessCommand(job, proj, home, work);
  if (ids) for (const d of [proj, home, work]) chown(d, `${ids.uid}:${ids.gid}`);
  const r = await runOnce(cmd, args, { cwd: proj, env: envFor(home, path.join(work, 'bin')), ms: 4 * 60000 });
  const ans = readAnswer(r.out, work);
  fs.writeFileSync(path.join(OUT, 'smoke.txt'), `exit ${r.code}, ${Math.round(r.secs)} s\nanswer: ${ans.said}\n--- stderr\n${r.err.slice(-6000)}\n--- stdout\n${r.out.slice(-6000)}\n`);
  const ok = /READY/i.test(ans.said);
  log(`smoke: ${ok ? 'OK' : 'FAILED'} (exit ${r.code}, ${Math.round(r.secs)} s): ${ans.said.slice(0, 80) || (r.err || ans.bad || '').trim().split('\n').slice(-2).join(' | ').slice(0, 300)}`);
  process.exit(ok ? 0 : 3);
}

fs.mkdirSync(OUT, { recursive: true });
if (flag('smoke')) await smoke();
const only = new Set(opt('only').split(',').map((x) => x.trim()).filter(Boolean));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l));
const jobs = read(opt('jobs')).filter((j) => j.job === 'repo' && (!only.size || only.has(j.key)));
// the stand-in's "right" fix needs the planted file as it was: the jobs file carries only the planted project
if (H.startsWith('stand-in')) {
  const { swap } = await import('./repo-jobs.mjs');
  const BUGS = JSON.parse(fs.readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), 'stand-in-fixes.json'), 'utf8'));
  for (const j of jobs) { const b = BUGS[j.key]; if (b) { const f = j.repo.files.find((x) => x.path === b[0]); if (f) j.bug = { path: b[0], content: swap([f], [b[0], b[2], b[1]])[0].content }; } }
}
const runsFile = path.join(OUT, 'runs.jsonl'); fs.writeFileSync(runsFile, '');
const t0 = Date.now(), queue = [...jobs]; let done = 0;
log(`${jobs.length} job(s), ${PAR} at a time, ${JOB_MIN} min each at most, ${TURNS} turns, ${HOURS} h for the lot; brain ${URL_} (${MODEL})`);
async function worker() {
  while (queue.length) {
    if ((Date.now() - t0) / 3.6e6 > HOURS) { const left = queue.splice(0); log(`time is up (${HOURS} h): ${left.length} job(s) not started: ${left.map((j) => j.key).join(', ')}`); fs.writeFileSync(path.join(OUT, 'not-started.txt'), left.map((j) => j.key).join('\n') + '\n'); return; }
    const job = queue.shift();
    let row; try { row = await doJob(job); } catch (e) { row = { id: job.id, job: 'repo', type: job.type, key: job.key, text: job.text, harness_name: H, said: '', steps: [], asks: 0, secs: 0, error: `harness-run: ${String(e.stack || e).slice(0, 400)}` }; }
    fs.appendFileSync(runsFile, JSON.stringify(row) + '\n');
    log(`${String(++done).padStart(2)} done ${job.key}: ${row.error ? `ERROR ${row.error.slice(0, 120)}` : `${row.repo?.after?.changed?.length || 0} file(s) changed, ${row.steps?.[0]?.calls?.filter((c) => c.via === 'shim').length || 0} node/npm/git start(s), ${row.asks} turn(s), ${Math.round(row.secs)} s${row.timed_out ? ', cut at the time cap' : ''}`}`);
  }
}
await Promise.all(Array.from({ length: Math.min(PAR, jobs.length || 1) }, worker));
log(`finished: ${done} run(s) in ${Math.round((Date.now() - t0) / 60000)} min -> ${runsFile}`);
