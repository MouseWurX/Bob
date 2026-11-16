// 15 Nov 2026: do-jobs.mjs (the owner: "so instead of having it make lessons, do we just get it to do things?"). A fake
// llama-server is the brain; Bob's real loop runs each job with real tools in its own throwaway folder, keeps the thinking,
// every call and every real result, leaves held-out requests out, and offers no tool it can't run for real.
// 16 Nov: each job's scene (the files, folders, board lists and memory its request takes for granted) is written by the
// brain, planted in a mirrored world (C:\Temp lives in the throwaway folder too), saved and reused; nothing the brain
// sees carries a real folder name.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'do jobs '));
const ossAsks = [];
let busy = 0, most = 0; const offered = new Set(); let sceneAsks = 0, leaked = '', jsonAsked = false; const systems = [];
const call = (name, args, think = '') => ({ choices: [{ message: { role: 'assistant', content: '', reasoning_content: think, tool_calls: [{ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { completion_tokens: 12, prompt_tokens: 900 } });
const say = (t, think = '') => ({ choices: [{ message: { role: 'assistant', content: t, reasoning_content: think } }], usage: { completion_tokens: 5, prompt_tokens: 950 } });
const KEY = 'tvly-FAKE0123456789abcdef'; let tavilyHits = 0, keyToBrain = false;
let usage = null; // what the stand-in Tavily's usage page says (null: it has none)
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
  if (req.url.startsWith('/tavily/search')) { // a stand-in Tavily that echoes the key back, so any leak would show
    tavilyHits++; req.resume();
    const okKey = req.headers.authorization === `Bearer ${KEY}`;
    res.statusCode = okKey ? 200 : 401; res.setHeader('content-type', 'application/json');
    res.end(JSON.stringify(okKey ? { results: [{ title: 'Weather', url: 'https://example.com', content: `echo ${KEY}` }] } : { detail: { error: `bad key ${req.headers.authorization}` } })); return;
  }
  if (req.url.startsWith('/tavily/usage')) { req.resume(); res.statusCode = usage ? 200 : 404; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(usage || {})); return; }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', async () => {
    if (b.includes(KEY)) keyToBrain = true;
    busy++; most = Math.max(most, busy); await new Promise((r) => setTimeout(r, 40));
    if (!leaked && (b.includes(tmp) || b.includes(JSON.stringify(tmp).slice(1, -1)) || /bob-lab-/.test(b) || b.includes(JSON.stringify(os.tmpdir()).slice(1, -1) + JSON.stringify(path.sep).slice(1, -1) + 'bob'))) leaked = (b.match(/.{30}(bob-lab-|do jobs ).{30}/) || ['?'])[0];
    const j = JSON.parse(b || '{}'); const names = (j.tools || []).map((t) => t.function?.name); for (const n of names) offered.add(n); const msgs = j.messages || [];
    if (/^You set up a test computer/.test(String(msgs[0]?.content || ''))) {
      sceneAsks++; jsonAsked ||= j.response_format?.type === 'json_object';
      const req = String(msgs.at(-1)?.content || '');
      const scene = /C:\\Temp/.test(req) ? { files: [{ path: 'C:\\Temp\\a.txt', content: 'first file' }, { path: 'C:\\Temp\\report.docx', content: '# Q3 report\nSales went up.', meta: { Author: 'Sam Lee' } }, { path: '..\\..\\escape.txt', content: 'x' }, { path: 'C:\\Temp\\song.mp3', content: '' }],
        folders: ['C:\\Archive'], board: [{ list: 'Work Tasks', items: ['backup database', 'email Sam'] }], memory: ['Sam is the user\'s manager.'] } : { files: [], folders: [], board: [], memory: [] };
      busy--; res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(say('```json\n' + JSON.stringify(scene) + '\n```'))); return;
    }
    if (msgs[0]?.role === 'system') systems.push(String(msgs[0].content));
    const ask = String(msgs.find((m) => m.role === 'user')?.content || '');
    if (/^GPT-OSS job/.test(ask)) ossAsks.push({ kw: j.chat_template_kwargs || {}, temp: j.temperature, top_p: j.top_p, names, listFolder: (j.tools || []).find((t) => t.function?.name === 'list_folder')?.function?.description || '', afterTool: msgs.at(-1)?.role === 'tool' });
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
    } else if (/C:\\Temp/.test(ask)) {
      const tm = msgs.filter((m) => m.role === 'tool').map((m) => String(m.content));
      if (!names.includes('read_file') || !names.includes('notice_board')) out = call('use_tools', { group: 'files' }, 'I need my tools.');
      else if (tm.length <= 1 && !tm.some((x) => /first file/.test(x))) out = call('read_file', { path: 'C:\\Temp\\a.txt' }, 'Read the first one.');
      else if (!tm.some((x) => /Sales/.test(x))) out = call('read_file', { path: 'C:\\Temp\\report.docx' }, 'And the report.');
      else if (!tm.some((x) => /not allowed|secret\.txt/i.test(x))) out = call('read_file', { path: '/home/user/secret.txt' }, 'And one it never planted.');
      else if (!tm.some((x) => /backup database|notice board/i.test(x))) out = call('notice_board', { action: 'read' }, 'Check the board.');
      else out = say('Read them all.', 'Done.');
    } else if (/picture/.test(ask)) {
      if (last.role === 'tool') out = say('Here is your fox picture.', 'It is made.');
      else out = names.includes('make_image') ? call('make_image', { prompt: 'a fox' }, 'Draw it.') : call('use_tools', { group: 'pictures' }, 'I need the picture tools.');
    } else if (/owl facts/.test(ask)) {
      const n = msgs.filter((m) => m.role === 'tool').length;
      out = n < 3 && names.includes('web_search') ? call('web_search', { query: `owl facts ${n + 1} ${ask.length}` }, 'Look it up again.') : say('Owls hunt at night.', 'Enough looking.');
    } else if (/fox facts/.test(ask)) {
      const n = msgs.filter((m) => m.role === 'tool').length;
      out = n < 2 && names.includes('web_search') ? call('web_search', { query: `fox facts ${n + 1}` }, 'Look it up.') : say('Foxes are small wild dogs.', 'Enough looking.');
    } else if (/calc\.py/.test(ask)) {
      const tm = msgs.filter((m) => m.role === 'tool').map((m) => String(m.content));
      const edit = { path: 'C:\\Users\\you\\Documents\\calc.py', find: '1+1', replace: '2+2' };
      if (!names.includes('edit_file')) out = call('use_tools', { group: 'files' }, 'I need the file tools.');
      else if (!tm.some((x) => /Allowed|said no/.test(x))) out = call('ask_together', { steps: [{ tool: 'edit_file', args: edit, say: 'fix the sum' }] }, 'Ask for the OK first.');
      else if (tm.filter((x) => /Allowed|said no/.test(x)).length && tm.length < 4 && !tm.some((x) => /calc\.py|outside a project|2\+2/.test(x) && !/Allowed/.test(x))) out = call('edit_file', edit, 'Now the edit.');
      else out = say('Fixed calc.py.', 'Done.');
    } else if (/which city/.test(ask)) {
      if (last.role === 'tool') out = say(`You picked ${/Paris/.test(String(last.content)) ? 'Paris' : 'nothing'}.`, 'Got it.');
      else out = names.includes('ask_user') ? call('ask_user', { question: 'Which city?', choices: ["I'll type the name", 'Paris', 'Rome'] }, 'Ask.') : say('Which city?', 'Ask in words.');
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
const jobs2 = path.join(tmp, 'ideas2.jsonl');
fs.writeFileSync(jobs2, JSON.stringify({ id: 'a7', job: 'files', text: 'Read the files in C:\\Temp, then check my Work Tasks list.' }) + '\n');
fs.writeFileSync(held, JSON.stringify({ id: 'h1', question: 'this exact request is a test item' }) + '\n');
// the web pages a search would reach answer nothing here (no test goes online); the stand-in servers still answer
const offline = path.join(tmp, 'offline.mjs');
// (OFFLINE_TAVILY=1: Tavily's own address answers one result, as the real one would for a working key)
fs.writeFileSync(offline, "const real = globalThis.fetch;\nglobalThis.fetch = async (u, o) => { const s = String(u?.url ?? u); if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(s)) return real(u, o); if (process.env.OFFLINE_TAVILY && /api\\.tavily\\.com\\/search/.test(s)) return new Response(JSON.stringify({ results: [{ title: 'Paris weather', url: 'https://example.com/paris', content: 'Mild, light rain.' }] }), { status: 200, headers: { 'content-type': 'application/json' } }); return new Response('', { status: 200, headers: { 'content-type': 'text/html' } }); };\n");
const jobs3 = path.join(tmp, 'ideas3.jsonl');
fs.writeFileSync(jobs3, [{ id: 'w1', job: 'web', text: 'find me some fox facts' }, { id: 'w2', job: 'chat', text: 'tell me a joke' }, { id: 'w3', job: 'chat', text: 'tell me a story' }].map((x) => JSON.stringify(x)).join('\n') + '\n');
const ledger = path.join(tmp, `tavily-searches-${new Date().toISOString().slice(0, 7)}.json`);
const jobs4 = path.join(tmp, 'ideas4.jsonl');
fs.writeFileSync(jobs4, [{ id: 'o1', job: 'web', text: 'find me some owl facts' }, { id: 'o2', job: 'web', text: 'find me a few more owl facts' }, { id: 'o3', job: 'chat', text: 'tell me a story' }].map((x) => JSON.stringify(x)).join('\n') + '\n');
const run = (extra, { jobsFile = jobs, dir = 'trial', env = {} } = {}) => new Promise((ok) => {
  const ch = spawn(process.execPath, ['--import', pathToFileURL(offline).href, 'do-jobs.mjs', '--url', url, '--bob', app, '--out', tmp, '--dir', dir, '--jobs', jobsFile, '--never', held, '--parallel', '2', ...extra], { cwd: path.join(app, 'model-lab'), env: { ...process.env, LAB_API_KEY: 'k', LAB_URL: '', LAB_TAVILY_KEY: '', LAB_TAVILY_URL: `${url}/tavily`, ...env } });
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
const s1 = await run(['--scene', 'make'], { jobsFile: jobs2, dir: 'scene1' });
const asksAfterMake = sceneAsks;
const s2 = await run(['--scene', 'reuse', '--scenes', path.join(tmp, 'scene1', 'scenes.jsonl')], { jobsFile: jobs2, dir: 'scene2' });
const asksAfterReuse = sceneAsks;
const pfs = await run(['--preflight', '--scene', 'maybe']);
const tk = await run(['--preflight', '--search', 'tavily'], { env: { LAB_TAVILY_KEY: KEY } });
const tkRun = await run(['--search', 'tavily', '--scene', 'make'], { jobsFile: jobs2, dir: 'tavily1', env: { LAB_TAVILY_KEY: KEY } });
const tkBad = await run(['--preflight', '--search', 'tavily'], { env: { LAB_TAVILY_KEY: 'tvly-WRONG0123456789abcd' } });
const tkNone = await run(['--preflight', '--search', 'tavily']);
const pr = await run(['--preflight', '--search', 'tavily', '--search-probe'], { env: { LAB_TAVILY_KEY: KEY, OFFLINE_TAVILY: '1' } });
const prNone = await run(['--preflight', '--search', 'tavily', '--search-probe'], { env: { LAB_TAVILY_KEY: KEY } });
usage = { key: { usage: 3, limit: null }, account: { current_plan: 'Researcher', plan_usage: 995, plan_limit: 1000 } };
const mU = await run(['--preflight', '--search', 'tavily', '--search-month', '1000'], { env: { LAB_TAVILY_KEY: KEY } });
usage = null; fs.writeFileSync(ledger, JSON.stringify({ used: 987 }));
const mL = await run(['--search', 'tavily', '--search-month', '1000', '--search-gap', '0', '--parallel', '1'], { jobsFile: jobs3, dir: 'budget1', env: { LAB_TAVILY_KEY: KEY } });
const ledgerAfter = JSON.parse(fs.readFileSync(ledger, 'utf8')).used;
const five = await run(['--search-gap', '0', '--parallel', '1'], { jobsFile: jobs4, dir: 'five1' });
fs.writeFileSync(ledger, JSON.stringify({ used: 100 }));
const capRun = await run(['--search', 'tavily', '--search-month', '1000', '--search-cap', '2', '--search-gap', '0', '--parallel', '1'], { jobsFile: jobs3, dir: 'cap1', env: { LAB_TAVILY_KEY: KEY } });
const ledgerCap = JSON.parse(fs.readFileSync(ledger, 'utf8')).used;
const groupFile = path.join(tmp, `tavily-searches-${new Date().toISOString().slice(0, 7)}-g1.json`);
fs.writeFileSync(groupFile, JSON.stringify({ used: 4 }));
const grp = await run(['--preflight', '--search', 'tavily', '--search-cap', '6', '--search-group', 'g1'], { env: { LAB_TAVILY_KEY: KEY } });
const grpFull = await run(['--preflight', '--search', 'tavily', '--search-cap', '6', '--search-group', 'g1'], { env: { LAB_TAVILY_KEY: KEY } });
const groupAfter = JSON.parse(fs.readFileSync(groupFile, 'utf8')).used;
{ const ossJobs = path.join(tmp, 'ideas-oss.jsonl');
  fs.writeFileSync(ossJobs, JSON.stringify({ id: 'g1', job: 'files', text: 'GPT-OSS job: what is on my shopping list in Documents\\shop.txt?', setup: [{ path: 'Documents\\shop.txt', content: 'plums\n' }] }) + '\n');
  const bad = await run(['--preflight', '--family', 'llama'], { jobsFile: ossJobs, dir: 'oss0' });
  const pfo = await run(['--preflight', '--family', 'gpt-oss'], { jobsFile: ossJobs, dir: 'oss1' });
  const ro = await run(['--family', 'gpt-oss', '--parallel', '1'], { jobsFile: ossJobs, dir: 'oss1' });
  const orow = fs.existsSync(path.join(tmp, 'oss1', 'runs.jsonl')) ? JSON.parse(fs.readFileSync(path.join(tmp, 'oss1', 'runs.jsonl'), 'utf8').trim().split('\n')[0]) : {};
  check('--family: an unknown family stops pre-flight; gpt-oss names its tool set', bad.code === 1 && /--family llama: use qwen or gpt-oss/.test(bad.log) && pfo.code === 0 && /family gpt-oss: Bob's GPT-OSS tool set \(ask_specialist, mcp_tools left out\)/.test(pfo.log), bad.log.slice(-200) + pfo.log.slice(-300));
  check("--family gpt-oss: Bob's loop uses the GPT-OSS tool set (its list_folder wording, its two helpers left out)", ro.code === 0 && ossAsks.length >= 2 && ossAsks.some((a) => /Words inside files: search_files/.test(a.listFolder)) && !ossAsks.some((a) => a.names.includes('ask_specialist') || a.names.includes('mcp_tools')), ro.log.slice(-300) + JSON.stringify(ossAsks.map((a) => a.listFolder.slice(0, 60))));
  check("--family gpt-oss: thinking is asked the GPT-OSS way (Bob's no-thinking step is reasoning low; never enable_thinking), with its own sampling", ossAsks.some((a) => a.kw.reasoning_effort === 'low') && ossAsks.every((a) => a.kw.enable_thinking === undefined && a.top_p === 1 && [undefined, 'low', 'high'].includes(a.kw.reasoning_effort)), JSON.stringify(ossAsks.map((a) => [a.afterTool, a.kw, a.temp, a.top_p])));
  check('--family gpt-oss: the run is stamped family gpt-oss, each step keeps its reasoning level, and the job was done', orow.family === 'gpt-oss' && (orow.steps || []).length >= 2 && orow.steps.every((st) => ['low', 'medium', 'high'].includes(st.effort)) && orow.steps.some((st) => st.effort === 'low') && /plums/.test(orow.said || ''), JSON.stringify({ f: orow.family, e: (orow.steps || []).map((st) => st.effort), said: orow.said })); }
{ const fixJobs = path.join(tmp, 'ideas-fix.jsonl');
  fs.writeFileSync(fixJobs, [{ id: 'c1', job: 'code', text: 'My Documents\\calc.py prints the wrong sum, fix it.', setup: [{ path: 'Documents\\calc.py', content: 'print(1+1)\n' }] }, { id: 'c2', job: 'chat', text: 'which city should we go to? ask me' }].map((x) => JSON.stringify(x)).join('\n') + '\n');
  const rf2 = await run(['--parallel', '1'], { jobsFile: fixJobs, dir: 'fix1' });
  const fr = fs.existsSync(path.join(tmp, 'fix1', 'runs.jsonl')) ? Object.fromEntries(fs.readFileSync(path.join(tmp, 'fix1', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)).map((x) => [x.id, x])) : {};
  const fc = (fr.c1?.steps || []).flatMap((st) => st.calls || []);
  const tog = fc.find((c) => c.name === 'ask_together'), ed = fc.find((c) => c.name === 'edit_file');
  check("the card with all of a job's OKs on it is answered yes, as a person tapping Allow (not \"the user said no\")", /Allowed 1 of 1/.test(tog?.result || ''), rf2.log.slice(-300) + JSON.stringify(tog || null).slice(0, 300));
  check("a coding job's planted script is in a project of the test home, so Bob's guard lets him edit it", ed && !/outside a project/.test(ed.result || '') && (fr.c1?.scene?.projects || []).length === 1 && !/outside a project/.test(JSON.stringify(fc)), JSON.stringify({ ed, p: fr.c1?.scene?.projects }).slice(0, 400));
  const au = (fr.c2?.steps || []).flatMap((st) => st.calls || []).find((c) => c.name === 'ask_user');
  check('ask_user gets the first real choice, not "I\'ll type the name"', /picked: Paris/.test(au?.result || ''), JSON.stringify(au || fr.c2?.error || null).slice(0, 300)); }
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
check("no stand-ins: tools that would act on the real computer (or need an app this home hasn't got) are never offered", !offered.has('run_command') && !offered.has('app_look') && !offered.has('schedule_job') && offered.has('read_file'), [...offered].filter((n) => /run_command|app_look|schedule_job/.test(n)).join(','));
{ const mi = (by.a2?.steps || []).flatMap((s) => s.calls).find((c) => c.name === 'make_image');
  check("no painter here: make_image gives Bob's own not-set-up answer, never a made-up picture", mi?.kind === 'setup' && /can't make pictures|Not done|Nothing made/i.test(mi.result || ''), JSON.stringify(mi || null).slice(0, 300)); }
check("Bob's prompt matches what this Bob has: the Hands that would act on the real PC are off", systems.length > 0 && !offered.has('open_app') && !offered.has('run_command'));
check('every call either ran for real, was Bob\'s own, says the tool isn\'t here or isn\'t set up', rows.flatMap((x) => x.steps.flatMap((st) => st.calls)).every((c) => ['real', 'bob', 'pick', 'none', 'setup'].includes(c.kind)) && rows.every((x) => !x.standins.length));
check('the old answer in the ideas file is never used', !JSON.stringify(rows).includes('an old answer'));
check('two jobs at a time, never more', most <= 2 && most >= 1, `most at once: ${most}`);
{ const all = JSON.stringify(rows), enc = (p) => encodeURIComponent(p);
  check('no real folder names reach the runs, plain or inside a file link', !all.includes(tmp) && !all.includes(os.homedir()) && !/bob-lab-/.test(all) && !all.includes(enc(os.tmpdir())) && !all.includes(enc(os.homedir())) && by.a6 && (by.a6.steps || []).flatMap((st) => st.calls).some((c) => c.name === 'write_file'), (all.match(/.{40}bob-lab-.{20}/) || [''])[0]); }
check('each run carries its family, tool shape and Bob copy', by.a1.family === 'qwen' && by.a1.tool_shapes != null && by.a1.bob_src && Array.isArray(by.a1.messages));
check('nothing the brain is sent carries the throwaway folder or a real folder name (prompt, tools, results)', !leaked, leaked);
{ const row = JSON.parse(fs.readFileSync(path.join(tmp, 'scene1', 'runs.jsonl'), 'utf8').trim().split('\n')[0]);
  const calls = (row.steps || []).flatMap((s) => s.calls), res = (p) => calls.find((c) => c.name === 'read_file' && c.args.path === p)?.result || '';
  check('the brain writes the scene first (JSON asked for), and it is saved', s1.code === 0 && asksAfterMake === 1 && jsonAsked && fs.readFileSync(path.join(tmp, 'scene1', 'scenes.jsonl'), 'utf8').includes('C:\\\\Temp'), s1.log.slice(-300));
  check('a folder the job names outside the home (C:\\Temp) is mirrored and its files are read for real', /first file/.test(res('C:\\Temp\\a.txt')) && row.scene.files.some((f) => /^C:[\\/]Temp[\\/]a\.txt$/.test(f)), res('C:\\Temp\\a.txt').slice(0, 200) + JSON.stringify(row.scene.files));
  check('a Word file from the scene is a real one Bob reads', /Sales went up/.test(res('C:\\Temp\\report.docx')), res('C:\\Temp\\report.docx').slice(0, 200));
  check("a folder the scene didn't plant gets Bob's own refusal, not a stand-in", /not allowed|outside the folders|no such|not find|isn't there|doesn't exist/i.test(res('/home/user/secret.txt')), res('/home/user/secret.txt').slice(0, 200));
  check('the board lists and memory from the scene are planted', /backup database/.test(calls.find((c) => c.name === 'notice_board')?.result || '') && row.scene.board === 2 && row.scene.memory === 1, JSON.stringify(row.scene));
  check("a path out of the test folders and a sound file aren't planted, and the run says so", row.scene.skipped.length === 1 && /mp3/.test(row.scene.skipped[0].path) && !row.scene.files.some((f) => /escape|mp3/.test(f)) && (row.scene.problems || []).some((p) => /escape/.test(p)), JSON.stringify(row.scene.skipped) + JSON.stringify(row.scene.problems));
  check('the folder it saves to (C:\\Archive) exists for the job', row.scene.folders.some((f) => /^C:[\\/]Archive$/.test(f)), JSON.stringify(row.scene.folders));
  const row2 = JSON.parse(fs.readFileSync(path.join(tmp, 'scene2', 'runs.jsonl'), 'utf8').trim().split('\n')[0]);
  check('--scene reuse starts a second run from the very same scene, without asking the brain again', s2.code === 0 && asksAfterReuse === asksAfterMake && row2.scene.made === 'reused' && JSON.stringify(row2.scene.files) === JSON.stringify(row.scene.files), s2.log.slice(-300));
  check('pre-flight: an unknown --scene mode stops it', pfs.code === 1 && /--scene maybe: use make or reuse/.test(pfs.log), pfs.log.slice(-200)); }
check('pre-flight checks the Lab\'s Tavily key with one search and passes', tk.code === 0 && /Tavily key works \(from LAB_TAVILY_KEY; 1 search used, 1 result\)/.test(tk.log) && tavilyHits >= 1, tk.log.slice(-300));
check('a key Tavily refuses stops pre-flight; no key at all says how to add one', tkBad.code === 1 && /Tavily refused the saved key \(error 401\)/.test(tkBad.log) && tkNone.code === 1 && /LAB_TAVILY_KEY|Save Tavily key/.test(tkNone.log), tkBad.log.slice(-200) + tkNone.log.slice(-200));
{ const files = ['tavily1/runs.jsonl', 'tavily1/scenes.jsonl', 'tavily1/summary.md'].map((f) => path.join(tmp, f)).filter((f) => fs.existsSync(f)).map((f) => fs.readFileSync(f, 'utf8')).join('\n');
  check('the key never shows: not in anything printed, saved, or sent to the brain (a wrong key neither)', tkRun.code === 0 && files.length > 0 && ![tk.log, tkRun.log, tkBad.log, tkNone.log, files].some((x) => x.includes(KEY) || x.includes('tvly-WRONG')) && !keyToBrain, [tk.log, tkRun.log, tkBad.log].find((x) => x.includes('tvly-')) || ''); }
{ const rows3 = fs.existsSync(path.join(tmp, 'budget1', 'runs.jsonl')) ? fs.readFileSync(path.join(tmp, 'budget1', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const searched = rows3[0] ? rows3[0].steps.flatMap((st) => st.calls).filter((c) => c.name === 'web_search').length : 0;
  check('pre-flight --search-probe: Bob\'s own web_search runs (its backup answers when the free pages find nothing) and passes', pr.code === 0 && /pre-flight: web search answers/.test(pr.log) && !/destructure/.test(pr.log), pr.log.slice(-300));
  check('pre-flight --search-probe: when nothing answers it stops with Bob\'s own words, not a crash', prNone.code === 1 && /PRE-FLIGHT FAIL: web search from this PC gets nothing \(No results/.test(prNone.log) && !/destructure/.test(prNone.log), prNone.log.slice(-300));
  check("pre-flight: Tavily's usage page says the month is nearly used, so nothing runs", mU.code === 1 && /995 of 1000 searches used/.test(mU.log) && /no web searches are left this month/.test(mU.log), mU.log.slice(-300));
  check("the Lab's own count: once this month's searches are used, no new job starts and the rest wait", mL.code === 0 && rows3.length === 1 && rows3[0].id === 'w1' && searched === 2 && /no new job starts; 2 wait for the next run/.test(mL.log) && /Stopped early: this month's search budget was used/.test(fs.readFileSync(path.join(tmp, 'budget1', 'summary.md'), 'utf8')), mL.log.slice(-500));
  check("every Tavily search is counted on the Lab PC: the key check, and each one Bob's own backup search made (987 + 1 + 2)", ledgerAfter === 990 && rows3[0].steps.flatMap((st) => st.calls).filter((c) => c.name === 'web_search').every((c) => /The backup search: Tavily/.test(c.result)), String(ledgerAfter) + ' ' + JSON.stringify(rows3[0]?.steps.flatMap((st) => st.calls).map((c) => c.result)).slice(0, 300)); }
{ const r5 = fs.existsSync(path.join(tmp, 'five1', 'runs.jsonl')) ? fs.readFileSync(path.join(tmp, 'five1', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  check("5 searches in a row with nothing (Bob's result as he hands it on, wrapped as outside text) stop the run", five.code === 0 && r5.length === 2 && !r5.some((x) => x.id === 'o3') && /5 web searches in a row found nothing/.test(five.log), five.log.slice(-400));
  const rc = fs.existsSync(path.join(tmp, 'cap1', 'runs.jsonl')) ? fs.readFileSync(path.join(tmp, 'cap1', 'runs.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
  const res = rc[0] ? rc[0].steps.flatMap((st) => st.calls).filter((c) => c.name === 'web_search').map((c) => c.result) : [];
  check("--search-cap: the run's own Tavily searches stop at the cap (key check + 1), Bob himself says he's at it, and no new job starts", capRun.code === 0 && ledgerCap === 102 && rc.length === 1 && res.length === 2 && /Tavily is at its monthly cap/.test(res[1]) && /this run's cap of 2/.test(capRun.log), `${ledgerCap} ${capRun.log.slice(-400)} ${JSON.stringify(res).slice(0, 300)}`); }
check('--search-group: runs of one group share the cap (4 + 1 key check leaves 1; the next start finds none and stops)', grp.code === 0 && /group g1 make at most 6 Tavily searches of their own \(--search-cap\), 5 so far/.test(grp.log) && grpFull.code === 1 && /no web searches are left under --search-cap 6 \(group g1\)/.test(grpFull.log) && groupAfter === 6, `${groupAfter} ${grp.log.slice(-300)} ${grpFull.log.slice(-200)}`);
const again = await run([]);
check('a second start picks up where it stopped (nothing run twice)', /nothing to run/.test(again.log) || /0 to go/.test(again.log), again.log.slice(-200));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
