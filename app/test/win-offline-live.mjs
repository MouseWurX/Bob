// Nov 23 2026: the live check for the Windows sandbox (src/win-offline.cs, .js). Run it on a real Windows PC:
//   node test\win-offline-live.mjs
// It builds bob-offline.exe in a throwaway folder (with the C# compiler Windows already has; nothing is downloaded),
// starts a tiny server on this PC's own address, and checks that inside the sandbox an ordinary command still works
// (it can read and write its own folder) while every way out fails: node fetch GET with data in the address, node
// fetch POST, PowerShell Invoke-WebRequest, curl.exe POST. Each trick is run outside the sandbox first and must work, so the
// check proves something. Nothing leaves the PC. When it passes, WIN_SANDBOX_READY in src/win-offline.js can be true.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { ensureSandbox, grantFolder, sandboxPlan, compilerPath } = await import(pathToFileURL(path.join(app, 'src/win-offline.js')).href);
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
if (process.platform !== 'win32') { console.log('Run this on Windows.'); process.exit(0); }

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob offline '));
const work = path.join(tmp, 'work folder'); fs.mkdirSync(work);
const cfg = { dataDir: path.join(tmp, 'data') };
console.log(`compiler: ${compilerPath() || 'none found'}`);
const exe = ensureSandbox(cfg);
check('bob-offline.exe builds with the compiler Windows has', Boolean(exe), exe);
if (!exe) process.exit(1);
const sid = spawnSync(exe, ['sid'], { encoding: 'utf8' });
check('the sandbox has its own id', sid.status === 0 && /^S-1-15-2-/.test(sid.stdout.trim()), sid.stdout + sid.stderr);
check('its folder can be granted', grantFolder(exe, work, 'change'));
grantFolder(exe, path.dirname(process.execPath), 'read'); // best effort, as in Bob (Program Files needs admin, and sandboxes can read it already)

const got = [];
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { got.push(`${q.method} ${q.url} ${b}`); r.end('ok'); }); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;
// Probes run with async spawn so this process's server can still answer while they run (spawnSync would freeze it,
// and then every probe would "fail" from a timeout, sandbox or not). Each one is killed after 30 s.
const runAsync = (file, args, opts = {}) => new Promise((resolve) => {
  let stdout = '', stderr = '', done = false;
  const c = spawn(file, args, { cwd: work, windowsHide: true, ...opts });
  const t = setTimeout(() => { try { c.kill(); } catch {} finish(null); }, 30000);
  const finish = (status) => { if (done) return; done = true; clearTimeout(t); resolve({ status, stdout, stderr, timedOut: status === null }); };
  c.stdout.on('data', (d) => (stdout += d)); c.stderr.on('data', (d) => (stderr += d));
  c.on('error', (e) => { stderr += String(e); finish(-1); }); c.on('close', (code) => finish(code));
});
const env = { ...process.env, TEMP: work, TMP: work };
const inBox = (file, args) => { const p = sandboxPlan(exe, work, { file, args }); return runAsync(p.file, p.args, { env }); };
const settle = () => new Promise((r) => setTimeout(r, 1500)); // let any late request land before counting

const local = await inBox(process.execPath, ['-e', "require('fs').writeFileSync('made.txt','hi'); console.log('LOCAL ' + require('fs').readFileSync('made.txt','utf8'))"]);
check('an ordinary command still works in the sandbox: it reads and writes its own folder', /LOCAL hi/.test(local.stdout), (local.stdout + local.stderr).slice(0, 300));
const tricks = [
  ['node fetch GET with the data in the address', process.execPath, (tag) => ['-e', `fetch('${url}/leak?secret=${tag}',{signal:AbortSignal.timeout(10000)}).then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`]],
  ['node fetch POST', process.execPath, (tag) => ['-e', `fetch('${url}/up',{method:'POST',body:'secret=${tag}',signal:AbortSignal.timeout(10000)}).then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`]],
  ['PowerShell Invoke-WebRequest POST', 'powershell.exe', (tag) => ['-NoProfile', '-Command', `try { Invoke-WebRequest -UseBasicParsing -Method Post -Body 'secret=${tag}' -Uri '${url}/ps' -TimeoutSec 10 | Out-Null; 'SENT' } catch { 'BLOCKED' }`]],
  ['curl.exe POST', 'curl.exe', (tag) => ['-s', '-m', '10', '-d', `secret=${tag}`, `${url}/c`, '-o', 'NUL', '-w', '%{http_code}']]
];
const sent = (file, out) => (file === 'curl.exe' ? /^2\d\d$/.test(out) : /SENT/.test(out) && !/BLOCKED/.test(out));
let i = 0;
for (const [name, file, args] of tricks) {
  i++;
  // Outside first: the same trick must work without the sandbox, or a block below proves nothing.
  const outTag = `OUT${i}`, inTag = `IN${i}`;
  const o = await runAsync(file, args(outTag), { env });
  await settle();
  check(`outside the sandbox: ${name} does reach this PC's test server (so the check proves something)`, sent(file, (o.stdout || '').trim()) && got.some((g) => g.includes(outTag)), ((o.stdout || '') + ' ' + (o.stderr || '')).trim().slice(0, 300));
  const t0 = Date.now();
  const r = await inBox(file, args(inTag));
  await settle();
  const out = (r.stdout || '').trim();
  check(`in the sandbox: ${name} gets nowhere`, !sent(file, out) && !got.some((g) => g.includes(inTag)), (out + ' ' + (r.stderr || '')).slice(0, 300));
  console.log(`  (inside took ${((Date.now() - t0) / 1000).toFixed(1)} s${r.timedOut ? ', killed at 30 s' : ''})`);
}
check('nothing from inside the sandbox reached the server', !got.some((g) => /secret=IN\d/.test(g)), got.filter((g) => /IN\d/.test(g)).join(' | '));
srv.close();
spawnSync(exe, ['ungrant', work]); spawnSync(exe, ['ungrant', path.dirname(process.execPath)]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
