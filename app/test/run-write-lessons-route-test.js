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

const seen = [], styleSeen = []; let k = 0; const mode = { reasoning: ' find it 2. report. Options: A grep, B read. Pick: A. Check: ok.', content: 'FIXED: done, 41 errors.' };
const srv = http.createServer((q, r) => { let b = ''; q.on('data', (d) => (b += d)); q.on('end', () => {
  const j = JSON.parse(b); const first = String(j.messages[0]?.content || ''); let content;
  if (/^Write 25/.test(first)) content = JSON.stringify(Array.from({ length: 25 }, () => `please remind me about thing ${k++} at 5pm`));
  else if (/^You review training lessons/.test(first)) content = /FIXED/.test(first) ? '{"ok": true, "why": "fine"}' : '{"ok": false, "why": "saved to a wrong path"}';
  else if (j.messages.at(-1)?.role === 'assistant' && j.messages.at(-1).reasoning_content) { // a prefilled thinking turn: carry on from it
    styleSeen.push({ system: first, user: String(j.messages.find((m) => m.role === 'user')?.content || ''), prefill: j.messages.at(-1).reasoning_content, lp: !!j.logprobs });
    r.writeHead(200, { 'content-type': 'application/json' }); r.end(JSON.stringify({ choices: [{ message: { content: mode.content, reasoning_content: (mode.echo ? j.messages.at(-1).reasoning_content : '') + mode.reasoning }, finish_reason: 'stop', logprobs: { content: [{ token: ' find', logprob: -0.1, top_logprobs: [{ token: ' find', logprob: -0.1 }] }] } }] })); return;
  }
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
// ---- a prefilled style pass (GPT-OSS ignores a style prompt in its thinking; a prefill works) ----
const sty = path.join(tmp, 'think-sherlock.txt');
fs.writeFileSync(sty, 'How you think (style "Sherlock"): start with Plan:.\r\nprefix: Plan: 1.\r\nmarkers: Plan:,Options:,Pick:,Check:\r\nleak: Plan:,Options:,Pick:,Check:\r\n');
const styleRun = (dir, extra = []) => run(['--dir', dir, '--jobs', 'chat:1', '--think', 'all', '--persona', sty, '--odds', '4', '--no-fix', ...extra]);
const s1 = await styleRun('sherlock');
const sl = rows(path.join(tmp, 'sherlock', 'lessons.jsonl')), so = rows(path.join(tmp, 'sherlock', 'odds.jsonl'));
check('--think-prefix from the style file: sent as a trailing assistant thinking message', styleSeen.length > 0 && styleSeen.every((x) => x.prefill === 'Plan: 1.'), s1.o.slice(-300));
check('the prefix/markers/leak lines never reach the writer as style text', styleSeen.every((x) => /start with Plan:/.test(x.system) && !/^(prefix|markers|leak):/m.test(x.system)));
check('the saved thinking is prefix + continuation, with its style score', sl.length >= 3 && sl.every((l) => l.messages.find((m) => m.role === 'assistant').reasoning === 'Plan: 1. find it 2. report. Options: A grep, B read. Pick: A. Check: ok.' && l.style_score === 1 && l.think_prefix === 'Plan: 1.'), JSON.stringify(sl[0]?.messages?.[1]));
check('the odds rows say which words were given (no teacher odds for them)', so.length >= 3 && so.every((x) => x.turns[0].given === 'Plan: 1.' && x.turns[0].odds[0][0] === ' find'));
mode.content = 'Plan: 1. look\nOptions: A\n\nFIXED: here is the answer.';
await styleRun('sherlock-leak');
check('an answer that leaks the style markers is rejected (default)', rows(path.join(tmp, 'sherlock-leak', 'lessons.jsonl')).length === 0);
await styleRun('sherlock-strip', ['--leak-mode', 'strip']);
const st = rows(path.join(tmp, 'sherlock-strip', 'lessons.jsonl'));
check('--leak-mode strip takes the marker lines off the answer and marks it', st.length >= 3 && st.every((l) => l.messages.at(-1).content === 'FIXED: here is the answer.' && l.leak === 'stripped'), JSON.stringify(st[0]?.messages?.at(-1)));
mode.content = 'FIXED: done.'; mode.reasoning = ' just do it.';
await styleRun('sherlock-weak', ['--style-min', '0.5']);
check('--style-min rejects thinking that shows too few of the style markers', rows(path.join(tmp, 'sherlock-weak', 'lessons.jsonl')).length === 0);
// ---- live findings (13 Nov): llama-server echoes the prefill; the style slides back with Bob's full prompt ----
mode.content = 'FIXED: done, 41 errors.'; mode.reasoning = ' find it 2. report. Options: A grep, B read. Pick: A. Check: ok.'; mode.echo = true;
const n0 = styleSeen.length;
await styleRun('sherlock-echo', ['--style-position', 'user']);
const se = rows(path.join(tmp, 'sherlock-echo', 'lessons.jsonl')), seo = rows(path.join(tmp, 'sherlock-echo', 'odds.jsonl'));
check('a prefill the server sends back is not doubled ("NeedsNeeds")', se.length >= 3 && se.every((l) => l.messages.find((m) => m.role === 'assistant').reasoning === 'Plan: 1. find it 2. report. Options: A grep, B read. Pick: A. Check: ok.'), JSON.stringify(se[0]?.messages?.[1]?.reasoning));
check('the odds row says whether the given words came back in the reply', seo.length >= 3 && seo.every((x) => x.turns[0].given === 'Plan: 1.' && x.turns[0].given_echoed === true));
const sp = styleSeen.slice(n0);
check('--style-position user: the style note sits just before the ask, not in the system prompt', sp.length > 0 && sp.every((x) => !/start with Plan:/.test(x.system) && /^\(Note for how you think, never mention it: How you think/.test(x.user)), JSON.stringify(sp[0]).slice(0, 300));
check('the saved lesson keeps the plain message (the note is teacher-only)', se.every((l) => !/Note for how you think/.test(JSON.stringify(l.messages))));
fs.writeFileSync(path.join(tmp, 'think-long.txt'), 'Style.\nprefix: Plan: 1. a 2. b\\nOptions: A\nprefix-later: Saw:\n');
const n1 = styleSeen.length; await run(['--dir', 'long', '--jobs', 'chat:1', '--think', 'all', '--persona', path.join(tmp, 'think-long.txt'), '--no-fix']);
check('a longer prefix can carry line breaks (\\n in the style file)', styleSeen.slice(n1).some((x) => x.prefill === 'Plan: 1. a 2. b\nOptions: A'));
check('later thinking turns of a tool lesson get prefix-later', /step \? laterPrefix : thinkPrefix/.test(fs.readFileSync(path.join(lab, 'write-lessons.mjs'), 'utf8')));
srv.close();
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
