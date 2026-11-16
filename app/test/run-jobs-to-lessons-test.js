// 16 Nov 2026: jobs-to-lessons.mjs (the owner: "if it does we're keeping the output as lessons"). Kept do-jobs runs become
// lessons as they ran: the right run for each kept grade (shuffled letters through a key), Bob's hidden notes left out,
// each step's thinking kept, Bob's own prompt and tools for that family, never two families in one folder, and nothing
// private written. Fake runs only: the Lab PC's user, PC name and words are passed in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { lessonMessages, groupsOf, pickRuns } = await import(pathToFileURL(path.join(app, 'model-lab', 'jobs-to-lessons.mjs')).href);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobs to lessons '));
const ME = { user: 'qwertyjo', host: 'TESTBOX-77', words: 'Zanzibarian' };

const row = (id, o = {}) => ({ id, job: 'files', text: `job ${id}`, family: 'qwen', tool_shapes: 4, bob_src: { version: 'x' }, brain: 'served',
  steps: [{ think: false, thinking: 'Read the list first.', calls: [{ name: 'use_tools', args: { group: 'files' } }] }, { think: false, thinking: '', calls: [{ name: 'read_file', args: { path: 'C:\\Users\\you\\Documents\\shop.txt' } }] }, { think: true, thinking: 'It says plums.', calls: [] }],
  messages: [{ role: 'user', content: 'what is on my list?' }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'use_tools', arguments: { group: 'files' } } }] }, { role: 'tool', tool_name: 'use_tools', content: 'Added.' },
    { role: 'system', hidden: true, content: 'You now have every tool...' }, { role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'C:\\Users\\you\\Documents\\shop.txt' } } }] }, { role: 'tool', tool_name: 'read_file', content: 'plums' }, { role: 'assistant', content: 'Your list says plums.' }], ...o });
const m = lessonMessages(row('a'));
check("a run's chat becomes a lesson's: Bob's hidden notes left out, each step's thinking and level kept, tool calls as text", m.length === 6 && !m.some((x) => x.role === 'system') && m[0].role === 'user' && m[1].reasoning === 'Read the list first.' && m[1].think === false && typeof m[1].tool_calls[0].function.arguments === 'string' && m[5].reasoning === 'It says plums.' && m[5].think === true && m[4].name === 'read_file', JSON.stringify(m).slice(0, 400));
check('the groups a run had: the ones use_tools added and those of the tools it called', [...groupsOf(row('a'), (n) => (n === 'read_file' ? 'files' : n === 'web_search' ? 'web' : ''))].join() === 'files');
const files = [{ label: 'after-low', rows: [row('j1'), row('j2')] }, { label: 'before-high', rows: [row('j1'), row('j2')] }];
const key = { j1: { A: 'after-low', B: 'before-high' }, j2: { A: 'before-high', B: 'after-low' } };
const p = pickRuns([{ id: 'j1', run: 'B', verdict: 'keep' }, { id: 'j1', run: 'A', verdict: 'fix' }, { id: 'j2', run: 'A', verdict: 'keep' }, { id: 'j3', run: 'A', verdict: 'keep' }], files, { key });
check('a kept grade with a shuffled letter picks the right settings run through the key; fixes are left out; a missing run is listed', p.kept.length === 2 && p.kept[0].label === 'before-high' && p.kept[1].label === 'before-high' && p.missing.length === 1 && /j3/.test(p.missing[0]));
check('without a letter, an id in two runs files is not guessed', pickRuns([{ id: 'j1', verdict: 'keep' }], files).kept.length === 0);

const W = (f, rows) => { const p2 = path.join(tmp, f); fs.mkdirSync(path.dirname(p2), { recursive: true }); fs.writeFileSync(p2, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); return p2; };
const runsA = W('a/runs.jsonl', [row('k1'), row('k2', { said: 'x' })]), grades = W('grades.jsonl', [{ id: 'k1', verdict: 'keep', note: 'good' }, { id: 'k2', verdict: 'discard' }]);
const cli = (extra) => spawnSync(process.execPath, ['jobs-to-lessons.mjs', '--bob', app, '--user', ME.user, '--host', ME.host, '--words', ME.words, ...extra], { cwd: path.join(app, 'model-lab'), encoding: 'utf8' });
const out = path.join(tmp, 'lessons');
const ok = cli(['--runs', runsA, '--grades', grades, '--to', out]);
const ls = fs.existsSync(path.join(out, 'lessons.jsonl')) ? fs.readFileSync(path.join(out, 'lessons.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l)) : [];
const sets = fs.existsSync(path.join(out, 'toolsets.json')) ? JSON.parse(fs.readFileSync(path.join(out, 'toolsets.json'), 'utf8')) : {};
const set = sets[ls[0]?.messages.find((x) => x.role === 'assistant')?.set];
check("only the kept run is written, stamped with its family and tool shape, with Bob's own prompt and tools (the files group in)", ok.status === 0 && ls.length === 1 && ls[0].idea === 'a:k1' && ls[0].family === 'qwen' && ls[0].tool_shapes === 4 && ls[0].think === true && /Bob/.test(set?.system || '') && set.tools.some((t) => t.function?.name === 'read_file'), ok.stdout + ok.stderr);
check("in Qwen's tool set: the two helpers it hides aren't in the tool list", set && !set.tools.some((t) => ['ask_specialist', 'pick_session'].includes(t.function?.name)));
const leak = W('b/runs.jsonl', [row('k1', { messages: [{ role: 'user', content: `save it in ${['C:', 'Users'].join('\\')}\\qwertyjo\\Desktop for the Zanzibarian team` }, { role: 'assistant', content: 'Saved.' }], steps: [{ think: false, thinking: '' }] })]);
const lk = cli(['--runs', leak, '--grades', grades, '--to', path.join(tmp, 'lessons2')]);
const l2 = fs.readFileSync(path.join(tmp, 'lessons2', 'lessons.jsonl'), 'utf8');
check("the Lab PC's user name, folders and private words are swapped for stand-ins before anything is written", lk.status === 0 && !/qwertyjo|Zanzibarian/.test(l2) && /Users\\\\you/.test(l2) && /stand-ins put in/.test(lk.stdout), lk.stdout + l2.slice(0, 300));
const mixed = W('c/runs.jsonl', [row('k1'), row('k3', { family: 'gpt-oss' })]);
const mx = cli(['--runs', mixed, '--grades', W('g2.jsonl', [{ id: 'k1', verdict: 'keep' }, { id: 'k3', verdict: 'keep' }]), '--to', path.join(tmp, 'lessons3')]);
check('two families in one lessons folder is refused (lessons are per family, never cross-trained)', mx.status === 1 && /2 families/.test(mx.stdout) && !fs.existsSync(path.join(tmp, 'lessons3')), mx.stdout);
const gp = cli(['--runs', W('d/runs.jsonl', [row('k1', { family: 'gpt-oss' })]), '--grades', grades, '--to', path.join(tmp, 'lessons4')]);
const gs = JSON.parse(fs.readFileSync(path.join(tmp, 'lessons4', 'toolsets.json'), 'utf8')); const gset = Object.values(gs)[0];
check("a GPT-OSS run gets Bob's GPT-OSS tool set (its list_folder wording; mcp_tools left out)", gp.status === 0 && gset.family === 'gpt-oss' && !gset.tools.some((t) => t.function?.name === 'mcp_tools') && (!gset.tools.some((t) => t.function?.name === 'list_folder') || gset.tools.some((t) => /Words inside files: search_files/.test(t.function?.description || ''))), gp.stdout + gp.stderr);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
