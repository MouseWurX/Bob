// jobs-extra.mjs: hands a running pod's key to do-jobs without ever printing it (16 Nov 2026)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = path.join(root, 'model-lab', 'jobs-extra.mjs');
let pass = 0, fail = 0;
const check = (name, ok, info = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${info ? `\n  ${info}` : ''}`); } };
const run = (args) => new Promise((ok) => { const ch = spawn(process.execPath, [script, ...args], { env: { ...process.env, LAB_API_KEY: '' } }); let log = ''; ch.stdout.on('data', (d) => { log += d; }); ch.stderr.on('data', (d) => { log += d; }); ch.on('exit', (code) => ok({ code, log })); });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs extra '));
const tok = path.join(tmp, 'pod-token-x.json');
const secret = 'sekret-' + Math.random().toString(36).slice(2);
fs.writeFileSync(tok, JSON.stringify({ pod: 'p', token: secret }));
const a = await run(['--token-file', path.join(tmp, 'nope.json'), '--', '--url', 'http://127.0.0.1:1']);
check('a missing token file stops it', a.code === 1 && /JOBS EXTRA STOP: --token-file/.test(a.log), a.log);
const b = await run(['--token-file', tok, '--', '--dir', 'x']);
check('no --url for do-jobs stops it', b.code === 1 && /--url/.test(b.log), b.log);
// a server that checks the key do-jobs sends
let seen = '';
const srv = http.createServer((req, res) => { seen = req.headers.authorization || seen; res.writeHead(500); res.end(`bad key ${req.headers.authorization || ''}`); });
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;
const jobs = path.join(tmp, 'ideas.jsonl'); fs.writeFileSync(jobs, JSON.stringify({ id: 'j1', job: 'chat', text: 'say hello' }) + '\n');
const c = await run(['--token-file', tok, '--', '--url', url, '--bob', root, '--out', tmp, '--dir', 'x', '--jobs', jobs, '--count', '1', '--hours', '0.02', '--job-minutes', '0.3']);
srv.close();
check('do-jobs gets the pod key as its brain key', seen === `Bearer ${secret}`, `seen ${seen ? 'a key' : 'nothing'}`);
check('the key is never printed', !c.log.includes(secret), 'the key showed in the output');
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
