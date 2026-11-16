// 15 Nov 2026: loop-test.mjs --real (the owner: "see how good it is at just working", "can we let it do web search"). A fake
// llama-server drives Bob's real loop; with --real the file tool really runs in the throwaway home (its own folder,
// C:\Users\you), the job's setup file is planted first, and every step is kept with its real result. The key is sent.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'loop real '));
const auth = [];
const call = (name, args) => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }] });
const say = (t) => ({ choices: [{ message: { role: 'assistant', content: t } }] });
const srv = http.createServer((req, res) => {
  auth.push(req.headers.authorization || '');
  if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    const j = JSON.parse(b || '{}'); const names = (j.tools || []).map((t) => t.function?.name); const msgs = j.messages || [];
    const last = [...msgs].reverse().find((m) => m.role === 'tool' || m.role === 'user') || {}; // Bob adds a 'where we are' note after a result
    let out;
    const realHomeFile = path.join(os.homedir(), 'Documents', `loop-real-${process.pid}.txt`), outside = path.join(path.parse(os.homedir()).root, 'loop-real-outside', `x-${process.pid}.txt`);
    if (last.role === 'tool' && /plums/.test(String(last.content))) out = call('write_file', { path: realHomeFile, content: 'plums' });
    else if (last.role === 'tool' && /outside the folders|Not done again/i.test(String(last.content))) out = say('The list says plums.');
    else if (last.role === 'tool' && /^Saved .*loop-real-\d+\.txt/.test(String(last.content))) out = call('write_file', { path: outside, content: 'no' });
    else if (last.role === 'tool') out = names.includes('read_file') ? call('read_file', { path: 'C:\\Users\\you\\Documents\\shop.txt' }) : say('No.');
    else out = names.includes('read_file') ? call('read_file', { path: 'C:\\Users\\you\\Documents\\shop.txt' }) : call('use_tools', { group: 'files' });
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}`;
const mine = path.join(tmp, 'jobs.jsonl');
fs.writeFileSync(mine, JSON.stringify({ text: 'what is on my shopping list in Documents\\shop.txt?', group: 'files', need: ['read_file'], setup: [{ path: 'Documents\\shop.txt', content: 'plums\n' }] }) + '\n');
const ch = spawn(process.execPath, ['loop-test.mjs', '--url', url, '--bob', app, '--out', tmp, '--real', '--only-mine', '--mine', mine], { cwd: path.join(app, 'model-lab'), env: { ...process.env, LAB_API_KEY: 'test-key', LAB_URL: '' } });
let log = ''; ch.stdout.on('data', (d) => (log += d)); ch.stderr.on('data', (d) => (log += d));
await new Promise((ok) => { const t = setTimeout(() => { ch.kill(); ok(); }, 120000); ch.on('exit', () => { clearTimeout(t); ok(); }); });
srv.close();
const rep = fs.readdirSync(tmp).find((f) => /^loop-test-real-.*\.json$/.test(f));
const rows = rep ? JSON.parse(fs.readFileSync(path.join(tmp, rep), 'utf8')) : [];
const r = rows[0] || {};
const rf = (r.steps_run || []).find((x) => x.name === 'read_file');
check('--only-mine runs just the given job', rows.length === 1, log.slice(-400));
check('--real: read_file really ran on the planted file in the throwaway home', rf?.real === true && /plums/.test(String(rf.result)), JSON.stringify(r.steps_run || []).slice(0, 300));
check('the job is kept with its words and its steps', /plums/.test(r.said || '') && r.needs === true);
check('the key goes with every request', auth.length > 1 && auth.every((a) => a === 'Bearer test-key'));
const writes = (r.steps_run || []).filter((x) => x.name === 'write_file');
const realHomeFile = path.join(os.homedir(), 'Documents', `loop-real-${process.pid}.txt`);
check('a path in the real home folder is moved into the throwaway home: nothing lands in the real Documents', writes[0] && /^Saved/.test(String(writes[0].result)) && !fs.existsSync(realHomeFile), JSON.stringify(writes).slice(0, 300));
check('a path outside the throwaway folder is refused before the tool runs', writes[1] && /outside the folders Bob may use here/.test(String(writes[1].result)) && !fs.existsSync(path.join(path.parse(os.homedir()).root, 'loop-real-outside')), JSON.stringify(writes[1] || {}).slice(0, 300));
check('no real folder names leak into the saved steps', !JSON.stringify(rows).includes(tmp) && !JSON.stringify(rows).includes(os.homedir()));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
