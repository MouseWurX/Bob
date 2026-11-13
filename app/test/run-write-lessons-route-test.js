// write-lessons: per-job teacher routing, the teacher-only tool note, effort for tool jobs, the fix after a failed review
// (13 Nov, from the v5 keep rates). Runs the real script against a made-up teacher; nothing is run or downloaded.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..'), lab = path.join(app, 'model-lab');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-wl-route-'));
let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${more}`); } };
const rows = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []);

const seen = []; let k = 0;
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
  const j = JSON.parse(b); const first = String(j.messages[0]?.content || ''); let content;
  if (/^Write 25/.test(first)) content = JSON.stringify(Array.from({ length: 25 }, () => `please remind me about thing ${k++} at 5pm`));
  else if (/^You review training lessons/.test(first)) content = /FIXED/.test(first) ? '{"ok": true, "why": "fine"}' : '{"ok": false, "why": "saved to a wrong path"}';
  else { seen.push({ system: first, kw: j.chat_template_kwargs || {} }); content = /A reviewer failed an earlier answer/.test(first) ? 'FIXED: reminder set for 5pm.' : 'Saved a reminder file in C:/temp.'; }
  r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ choices: [{ message: { content }, finish_reason: 'stop' }] }));
}); });
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const url = `http://127.0.0.1:${srv.address().port}`;
const run = (extra) => new Promise((res) => {
  const c = spawn(process.execPath, [path.join(lab, 'write-lessons.mjs'), '--url', url, '--model', path.join(tmp, 'none.gguf'), '--out', tmp, '--bob', app, '--count', '3', '--parallel', '2', '--review', '--effort', 'medium', ...extra],
    { cwd: lab, stdio: 'pipe', env: { ...process.env, LAB_REMOTE: '1', LAB_STREAM: '0', LAB_MODEL_NAME: 'fake' } });
  let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('exit', (code) => res({ code, o }));
});

const a = await run(['--dir', 'qwen-tools', '--jobs', 'reminders:1,chat:1', '--route', 'tools', '--tool-effort', 'high', '--tool-note', '--teacher', 'qwen36', '--kind', 'bob', '--think', 'none']);
const d = path.join(tmp, 'qwen-tools');
const les = rows(path.join(d, 'lessons.jsonl')), rej = rows(path.join(d, 'rejected.jsonl'));
check('--route tools keeps only the tool-heavy jobs of --jobs', /route tools: reminders$/m.test(a.o) && les.length > 0 && les.every((l) => l.job === 'reminders'), a.o.slice(-400));
check('a failed review is tried once more with the reason shown, and the fix is kept (retry: review)', les.length >= 3 && les.every((l) => l.retry === 'review' && /FIXED/.test(l.messages.at(-1).content)), a.o.slice(-300));
check('the reject stays in rejected.jsonl under the same idea, with the reviewer\'s reason', rej.length >= 3 && les.every((l) => rej.some((x) => x.idea === l.idea && x.why === 'saved to a wrong path')));
check('every lesson and reject carries its teacher and kind', les.length > 0 && [...les, ...rej].every((l) => l.teacher === 'qwen36' && l.kind === 'bob'));
const lessonCalls = seen.filter((x) => /How Bob's tools work/.test(x.system));
check('the tool note and the review reason reach the teacher on tool jobs', lessonCalls.length > 0 && seen.some((x) => /A reviewer failed an earlier answer to this same message because: saved to a wrong path/.test(x.system)));
check('tool jobs always think, at the tool effort (--think none is overruled for them)', seen.length > 0 && seen.every((x) => x.kw.enable_thinking === true && x.kw.reasoning_effort === 'high') && les.every((l) => l.think === true), JSON.stringify(seen[0]?.kw));
const sets = fs.existsSync(path.join(d, "toolsets.json")) ? JSON.parse(fs.readFileSync(path.join(d, "toolsets.json"), "utf8")) : {};
check('nothing teacher-only lands in the saved prompts (no note, no review reason)', Object.values(sets).every((x) => !/How Bob's tools work|A reviewer failed/.test(x.system)) && les.every((l) => l.messages.every((m) => !/How Bob's tools work|A reviewer failed/.test(String(m.content || '')))));
const b = await run(['--dir', 'qwen-tools', '--jobs', 'reminders:1', '--route', 'tools', '--teacher', 'gpt-oss-120b', '--kind', 'bob']);
check('a second teacher can never write into the same folder (sets never mix)', b.code === 1 && /use another --dir/.test(b.o), b.o.slice(-200));
const c = await run(['--dir', 'gptoss-general', '--jobs', 'reminders:1', '--route', 'general', '--teacher', 'gpt-oss-120b', '--kind', 'bob']);
check('--route general with only tool jobs writes nothing and says so', c.code === 0 && /none of --jobs is routed to this teacher/.test(c.o) && !fs.existsSync(path.join(tmp, 'gptoss-general', 'lessons.jsonl')), c.o.slice(-200));
const p = await new Promise((res) => { const x = spawn(process.execPath, [path.join(lab, 'make-pairs.mjs'), '--lessons', d, '--out', path.join(tmp, 'pairs')], { cwd: lab, stdio: 'pipe' }); x.on('exit', () => res(rows(path.join(tmp, 'pairs', 'pairs.jsonl')))); });
check('make-pairs turns each reject and its fix into a right-vs-wrong pair', p.length >= 3 && p.every((x) => x.why === 'saved to a wrong path' && /FIXED/.test(JSON.stringify(x.chosen))), String(p.length));
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
