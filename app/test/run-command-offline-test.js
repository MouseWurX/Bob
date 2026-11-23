// Nov 23 2026 (the owner's plan: commands get no internet by default, and "a leak test" must show the known tricks
// fail; the owner's pick: commands follow the Web switch). With Web off (src/hands-run.js commandNet, offlineWay/offlinePlan):
// on Linux a command runs in its own empty network, on a Mac in a sandbox with no network. The leak test starts a small
// server on this machine's own address and tries three ways out from inside: a GET with the data in the address, a
// Python urllib POST and a node fetch POST. Each must fail offline and work with Web on (so the test proves
// something). Where this system can't keep commands offline (Windows, or Linux without user namespaces), the live part
// is skipped and the card's note is checked instead. Nothing leaves this machine either way.
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import { spawnSync } from 'node:child_process';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const { offlineWay, offlinePlan, runCommand, OFFLINE_NOTE, commandNet, NO_SANDBOX } = await imp('src/hands-run.js');
const { LIMITS } = await imp('src/hands-settings.js');

{
  check('commands follow the Web switch (the owner\'s pick): offline unless Web is on', commandNet({}) === 'off' && commandNet({ webSearch: false }) === 'off' && commandNet({ webSearch: true }) === 'open' && !LIMITS.noNet);
  const yes = () => true, no = () => false, onlyR = (f, a) => a[0] === '-rn';
  check('Linux uses its own empty network, as your own user where it can', offlineWay({ os_: 'linux', probe: yes }) === 'unshare-c' && offlineWay({ os_: 'linux', probe: onlyR }) === 'unshare' && offlineWay({ os_: 'linux', probe: no }) === '');
  check('a Mac uses a no-network sandbox; Windows has no way yet', offlineWay({ os_: 'darwin', probe: yes }) === 'sandbox-exec' && offlineWay({ os_: 'win32', probe: yes }) === '');
  const p = { file: 'python3', args: ['-c', 'x'] };
  check('the command runs inside the wrapper, its own words untouched', JSON.stringify(offlinePlan(p, 'unshare-c')) === JSON.stringify({ file: 'unshare', args: ['--map-current-user', '-n', '--', 'python3', '-c', 'x'] }) && offlinePlan(p, 'sandbox-exec').args.slice(-3).join(' ') === 'python3 -c x' && offlinePlan(p, '') === p);
  check('where it can\'t be kept offline, the result says so plainly', /can still reach the internet/.test(OFFLINE_NOTE));
  const hands = fs.readFileSync(path.join(app, 'src/hands.js'), 'utf8').replace(/\r\n/g, '\n');
  check('the Run hand runs commands by the Web switch, and says so when they ran offline', /net: commandNet\(cfg\)/.test(hands) && /Web is off, so commands are offline too/.test(hands));
  check('with Web off and no sandbox here, a command doesn\'t run at all (cut off, never run unprotected)', /no_sandbox|NO_SANDBOX/i.test(hands) && /commandNet\(cfg\) === 'off' && !offlineWay\(\)\) throw new Error\(NO_SANDBOX\)/.test(hands) && /^Not run: Web is off/.test(NO_SANDBOX));
  const card = (await imp('src/privacy-services.js')).PRIVACY_SERVICES['web-search'];
  check('the Web card says commands go online too while it is on', /commands/i.test(card.sends) && /commands/i.test(card.sees));
}

{
  const { runApproved } = await imp('src/hands.js');
  const tmp0 = fs.mkdtempSync(path.join(os.tmpdir(), 'no sandbox '));
  process.env.BOB_NO_SANDBOX = '1';
  let err = '';
  try { await runApproved({ dataDir: tmp0, innDir: tmp0, agentDir: tmp0 }, { cmd: process.execPath, args: ['-e', '1'], cwd: tmp0 }); } catch (e) { err = e.message; }
  delete process.env.BOB_NO_SANDBOX;
  check('on a computer with no sandbox (Windows today), with Web off, the Run hand refuses and says why', /^Not run: Web is off/.test(err), err);
  fs.rmSync(tmp0, { recursive: true, force: true });
}

// ---- the leak test (live, on this machine's own address only)
const way = offlineWay();
if (!way) console.log('SKIP the live leak test: this system can\'t keep commands offline (the note above covers it)');
else {
  const got = [];
  const srv = http.createServer((q, r) => { let b = ''; q.on('data', (c) => (b += c)); q.on('end', () => { got.push(`${q.method} ${q.url} ${b}`); r.end('ok'); }); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'offline '));
  const py = spawnSync('python3', ['--version']).status === 0;
  const curl = spawnSync('curl', ['--version']).status === 0;
  const tricks = [
    ['a GET with the data in the address (node)', process.execPath, ['-e', `fetch('${url}/leak?secret=GET1').then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`]],
    ['a node fetch POST', process.execPath, ['-e', `fetch('${url}/up',{method:'POST',body:'secret=POST2'}).then(()=>console.log('SENT'),()=>console.log('BLOCKED'))`]],
    ...(curl ? [['a curl GET with the data in the address', 'curl', ['-s', '-m', '5', `${url}/c?secret=CURL1`, '-o', '/dev/null', '-w', '%{http_code}']], ['a curl POST', 'curl', ['-s', '-m', '5', '-d', 'secret=CURL2', `${url}/c2`, '-o', '/dev/null', '-w', '%{http_code}']]] : []),
    ...(py ? [['a raw Python socket', 'python3', ['-c', `import socket\ntry:\n s=socket.create_connection(('127.0.0.1', ${srv.address().port}), 5); s.sendall(b'POST /raw HTTP/1.0\\r\\n\\r\\nsecret=RAW'); s.recv(10); print('SENT')\nexcept Exception: print('BLOCKED')`]]] : []),
    ...(py ? [['a Python urllib POST', 'python3', ['-c', `import urllib.request\ntry:\n urllib.request.urlopen('${url}/py', data=b'secret=PY3', timeout=5); print('SENT')\nexcept Exception: print('BLOCKED')`]]] : [])
  ];
  for (const [name, cmd, args] of tricks) {
    const r = await runCommand({ cmd, args, cwd: tmp, timeoutMs: 20000, net: 'off', way });
    const blocked = cmd === 'curl' ? r.offline === true && !/^(200|2\d\d)$/.test(r.out.trim()) : r.offline === true && /BLOCKED/.test(r.out) && !/SENT/.test(r.out);
    check(`offline: ${name} gets nowhere`, blocked, r.out.slice(0, 200));
  }
  check('offline: nothing reached the server', got.length === 0, got.join(' | '));
  const open = await runCommand({ cmd: tricks[1][1], args: tricks[1][2], cwd: tmp, timeoutMs: 20000, net: 'open' });
  check('with Web on the same command does reach it (so the test proves something)', /SENT/.test(open.out) && got.length === 1 && open.offline === false);
  if (!py) console.log('SKIP the Python tricks: no python3 here');
  if (!curl) console.log('SKIP the curl tricks: no curl here');
  srv.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
