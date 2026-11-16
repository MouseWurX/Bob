// 15 Nov 2026: do-jobs.mjs (the owner: "so instead of having it make lessons, do we just get it to do things?"). A fake
// llama-server is the brain; Bob's real loop runs each job with real tools in its own throwaway folder, keeps the thinking,
// every call and every real result, leaves held-out requests out, and offers no tool it can't run for real.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'do jobs '));
let busy = 0, most = 0; const offered = new Set();
const call = (name, args, think = '') => ({ choices: [{ message: { role: 'assistant', content: '', reasoning_content: think, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { completion_tokens: 12, prompt_tokens: 900 } });
const say = (t, think = '') => ({ choices: [{ message: { role: 'assistant', content: t, reasoning_content: think } }], usage: { completion_tokens: 5, prompt_tokens: 950 } });
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', async () => {
    busy++; most = Math.max(most, busy); await new Promise((r) => setTimeout(r, 40));
    const j = JSON.parse(b || '{}'); const names = (j.tools || []).map((t) => t.function?.name); for (const n of names) offered.add(n); const msgs = j.messages || [];
    const ask = String(msgs.find((m) => m.role === 'user')?.content || '');
    const last = [...msgs].reverse().find((m) => m.role === 'tool' || m.role === 'user') || {};
    let out;
    if (msgs.some((m) => m.role !== 'assistant' && (m.content === undefined || m.content === null || m.content === ''))) { busy--; res.statusCode = 400; res.end(JSON.stringify({ error: { code: 400, message: "All non-assistant messages must contain 'content'" } })); return; }
    if (/say hi/.test(ask) && last.role === 'user' && names.includes('bob_help')) out = call('bob_help', { topic: 'plan card' }, 'Check my own help first.');
    else if (/hi\.txt/.test(ask)) {
      if (!names.includes('write_file')) out = call('use_tools', { group: 'files' }, 'I need the file tools.');
      else if (!msgs.some((m) => m.role === 'tool' && /hi\.txt/i.test(String(m.content)))) out = call('write_file', { path: 'C:\\Users\\you\\Documents\\hi.txt', content: 'hi' }, 'Write it.');
      else out = say('Saved Documents\\hi.txt.', 'Done.');
    } else if (/todo\.txt/.test(ask)) {
      const tm = msgs.map((m, i) => [m, i]).filter(([m]) => m.role === 'tool');
      const readAt = tm.find(([m]) => /water the plants/.test(String(m.content)))?.[1] ?? -1;
      if (!names.includes('read_file') || !names.includes('notice_board')) out = call('use_tools', { group: 'files' }, 'I need my tools.');
      else if (readAt < 0) out = call('read_file', { path: 'C:\\Users\\you\\Documents\\todo.txt' }, 'Read it first.');
      else if (!tm.some(([, i]) => i > readAt)) out = call('notice_board', { action: 'add', content: 'water the plants' }, 'Now put it on the board.');
      else out = say('Done: "water the plants" is on your notice board.', 'Both steps ran.');
    } else if (/shop/.test(ask)) {
      if (last.role === 'tool' && /plums/.test(String(last.content))) out = say('Your list says plums.', 'The file says plums, so I tell them.');
      else out = names.includes('read_file') ? call('read_file', { path: 'C:\\Users\\you\\Documents\\shop.txt' }, 'I should read the list first.') : call('use_tools', { group: 'files' }, 'I need the file tools.');
    } else if (/picture/.test(ask)) {
      if (last.role === 'tool') out = say('Here is your fox picture.', 'It is made.');
      else out = names.includes('make_image') ? call('make_image', { prompt: 'a fox' }, 'Draw it.') : call('use_tools', { group: 'pictures' }, 'I need the picture tools.');
    } else out = say('Hello.', 'Say hi.');
    busy--; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
});
await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
const url = `http://127.0.0.1:${srv.address().port}`;
const jobs = path.join(tmp, 'ideas.jsonl'), held = path.join(tmp, 'heldout.jsonl');
fs.writeFileSync(jobs, [
  { id: 'a1', job: 'files', text: 'what is on my shopping list in Documents\\shop.txt?', setup: [{ path: 'Documents\\shop.txt', content: 'plums\n' }], note: 'an old answer that must never be used' },
  { id: 'a2', job: 'pictures', text: 'make me a picture of a fox' },
  { id: 'a3', job: 'chat', text: 'This exact request is a test item' },
  { id: 'a4', job: 'chat', text: 'say hi' },
  { id: 'a6', job: 'files', text: 'Write hi into Documents\\hi.txt please.' },
  { id: 'a5', job: 'plans', text: 'Read Documents\\todo.txt, and then add what it says to my notice board.', setup: [{ path: 'Documents\\todo.txt', content: 'water the plants\n' }] }
].map((x) => JSON.stringify(x)).join('\n') + '\n');
fs.writeFileSync(held, JSON.stringify({ id: 'h1', question: 'this exact request is a test item' }) + '\n');
const run = (extra) => new Promise((ok) => {
  const ch = spawn(process.execPath, ['do-jobs.mjs', '--url', url, '--bob', app, '--out', tmp, '--dir', 'trial', '--jobs', jobs, '--never', held, '--parallel', '2', ...extra], { cwd: path.join(app, 'model-lab'), env: { ...process.env, LAB_API_KEY: 'k', LAB_URL: '' } });
  let log = ''; ch.stdout.on('data', (d) => (log += d)); ch.stderr.on('data', (d) => (log += d));
  const t = setTimeout(() => { ch.kill(); ok({ code: -1, log }); }, 180000); ch.on('exit', (code) => { clearTimeout(t); ok({ code, log }); });
});
const pf = await run(['--preflight', '--want-shapes', 'x']);
check('pre-flight: a tool shape other than the one asked for stops it', pf.code === 1 && /PRE-FLIGHT FAIL: Bob's tools are shape/.test(pf.log), pf.log.slice(-300));
const pf2 = await run(['--preflight']);
check('pre-flight: says how many jobs, how many held-out ones are left out, and passes', pf2.code === 0 && /6 rows/.test(pf2.log) && /1 held-out request\(s\) left out \(--never: 1 file/.test(pf2.log) && /pre-flight OK/.test(pf2.log), pf2.log.slice(-400));
const nd = path.join(tmp, 'never-dir'); fs.mkdirSync(path.join(nd, 'sub'), { recursive: true }); fs.copyFileSync(held, path.join(nd, 'sub', 'h.jsonl')); fs.writeFileSync(path.join(nd, 'skip.txt'), 'this exact request is a test item\n');
const pf3 = await run(['--preflight', '--never', nd]);
check('pre-flight: a --never folder counts every .jsonl file in it and below, nothing else', pf3.code === 0 && /1 held-out request\(s\) left out \(--never: 1 file/.test(pf3.log), pf3.log.slice(-400));
const ed = path.join(tmp, 'never-empty'); fs.mkdirSync(ed, { recursive: true });
const pf4 = await run(['--preflight', '--never', ed]);
check('pre-flight: a --never folder with no .jsonl files stops it', pf4.code !== 0 && /holds no \.jsonl files/.test(pf4.log), pf4.log.slice(-300));
const r = await run([]);
srv.close();
const rows = fs.readFileSync(path.join(tmp, 'trial', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const by = Object.fromEntries(rows.map((x) => [x.id, x]));
check('every job but the held-out one ran', rows.length === 5 && !by.a3 && by.a1 && by.a2 && by.a4, r.log.slice(-400));
check('Bob\'s own tools give a real tool message, so the next step isn\'t refused', !by.a4?.error && (by.a4?.steps || []).flatMap((s) => s.calls).some((c) => c.name === 'bob_help' && c.kind === 'bob' && c.result) && /Hello/.test(by.a4?.said || ''), JSON.stringify(by.a4?.error || by.a4?.steps?.map((s) => s.calls.map((c) => c.name))));
const a5calls = (by.a5?.steps || []).flatMap((st) => st.calls).map((c) => c.name);
check('Bob\'s own step record sees the real steps: no false "nothing did it" nudge, so the answer is given once', a5calls.includes('read_file') && a5calls.includes('notice_board') && (by.a5?.messages || []).filter((m) => m.role === 'assistant' && String(m.content || '').trim()).length === 1 && !(by.a5?.messages || []).some((m) => m.role === 'system' && /nothing did it|tool steps? ran/.test(String(m.content))), JSON.stringify(a5calls) + ' ' + String(by.a5?.error || '').slice(0, 200));
const rf = (by.a1?.steps || []).flatMap((s) => s.calls).find((c) => c.name === 'read_file');
check('the planted file was read for real in the job\'s own throwaway folder', rf?.kind === 'real' && /plums/.test(rf.result) && /plums/.test(by.a1.said), JSON.stringify(by.a1?.steps || []).slice(0, 300));
check('the brain\'s thinking is kept for every step', (by.a1?.steps || []).length >= 2 && by.a1.steps.every((s) => typeof s.thinking === 'string') && by.a1.steps.some((s) => /read the list first/.test(s.thinking)));
check("no stand-ins: tools that would act on the real computer (or need an app this home hasn't got) are never offered", !offered.has('make_image') && !offered.has('run_command') && !offered.has('app_look') && offered.has('read_file'), [...offered].filter((n) => /make_image|run_command|app_look/.test(n)).join(','));
check('every call either ran for real, was Bob\'s own, or says the tool isn\'t here', rows.flatMap((x) => x.steps.flatMap((st) => st.calls)).every((c) => ['real', 'bob', 'pick', 'none'].includes(c.kind)) && rows.every((x) => !x.standins.length));
check('the old answer in the ideas file is never used', !JSON.stringify(rows).includes('an old answer'));
check('two jobs at a time, never more', most <= 2 && most >= 1, `most at once: ${most}`);
{ const all = JSON.stringify(rows), enc = (p) => encodeURIComponent(p);
  check('no real folder names reach the runs, plain or inside a file link', !all.includes(tmp) && !all.includes(os.homedir()) && !/bob-lab-/.test(all) && !all.includes(enc(os.tmpdir())) && !all.includes(enc(os.homedir())) && by.a6 && (by.a6.steps || []).flatMap((st) => st.calls).some((c) => c.name === 'write_file'), (all.match(/.{40}bob-lab-.{20}/) || [''])[0]); }
check('each run carries its family, tool shape and Bob copy', by.a1.family === 'qwen' && by.a1.tool_shapes != null && by.a1.bob_src && Array.isArray(by.a1.messages));
const again = await run([]);
check('a second start picks up where it stopped (nothing run twice)', /nothing to run/.test(again.log) || /0 to go/.test(again.log), again.log.slice(-200));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
