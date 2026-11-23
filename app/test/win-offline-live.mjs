// Nov 23 2026: the live check for the Windows sandbox (src/win-offline.cs, .js). Run it on a real Windows PC:
//   node test\win-offline-live.mjs
// It builds bob-offline.exe in a throwaway folder (with the C# compiler Windows already has; nothing is downloaded),
// starts a tiny server on this PC's own address, and checks that inside the sandbox an ordinary command still works
// (it can read and write its own folder) while every way out fails: node fetch GET with data in the address, node
// fetch POST, PowerShell Invoke-WebRequest, curl.exe POST. The same fetch from outside the sandbox must work, so the
// check proves something. Nothing leaves the PC. When it passes, WIN_SANDBOX_READY in src/win-offline.js can be true.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawnSync } from 'node:child_process';
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
const inBox = (file, args) => { const p = sandboxPlan(exe, work, { file, args }); return spawnSync(p.file, p.args, { cwd: work, encoding: 'utf8', timeout: 60000, env: { ...process.env, TEMP: work, TMP: work } }); };

const local = inBox(process.execPath, ['-e', "require('fs').writeFileSync('made.txt','hi'); console.log('LOCAL ' + require('fs').readFileSync('made.txt','utf8'))"]);
check('an ordinary command still works in the sandbox: it reads and writes its own folder', /LOCAL hi/.test(local.stdout), (local.stdout + local.stderr).slice(0, 300));
const tricks = [
  ['node fetch GET with the data in the address', process.execPath, ['-e', `fetch('${url}/leak?secret=GET1').then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`]],
  ['node fetch POST', process.execPath, ['-e', `fetch('${url}/up',{method:'POST',body:'secret=POST2'}).then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`]],
  ['PowerShell Invoke-WebRequest POST', 'powershell.exe', ['-NoProfile', '-Command', `try { Invoke-WebRequest -UseBasicParsing -Method Post -Body 'secret=PS3' -Uri '${url}/ps' -TimeoutSec 5 | Out-Null; 'SENT' } catch { 'BLOCKED' }`]],
  ['curl.exe POST', 'curl.exe', ['-s', '-m', '5', '-d', 'secret=CURL4', `${url}/c`, '-o', 'NUL', '-w', '%{http_code}']]
];
for (const [name, file, args] of tricks) {
  const r = inBox(file, args);
  const out = (r.stdout || '').trim();
  check(`in the sandbox: ${name} gets nowhere`, file === 'curl.exe' ? !/^2\d\d$/.test(out) : /BLOCKED/.test(out) && !/SENT/.test(out), (out + ' ' + (r.stderr || '')).slice(0, 300));
}
check('nothing reached the server', got.length === 0, got.join(' | '));
const outside = spawnSync(process.execPath, ['-e', `fetch('${url}/out',{method:'POST',body:'x'}).then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`], { encoding: 'utf8' });
check('outside the sandbox the same fetch does reach it (so the check proves something)', /SENT/.test(outside.stdout) && got.length === 1);
srv.close();
spawnSync(exe, ['ungrant', work]); spawnSync(exe, ['ungrant', path.dirname(process.execPath)]);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
