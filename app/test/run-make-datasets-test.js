// make-datasets (model-lab): a made-up kept folder is sorted into the clean set, the full set and right-vs-wrong pairs;
// the raw folder is untouched; REAP files each get their own file; private words stop it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-datasets-'));
const W = (p, t) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), t); };
const call = (name, args = {}) => ({ function: { name, arguments: JSON.stringify(args) } });
W('lessons/toolsets.json', JSON.stringify({ s1: { system: 'You are Bob.', tools: [] } }));
W('lessons/lessons.jsonl', [
  { idea: 'a', messages: [{ role: 'user', content: 'zip my project' }, { role: 'assistant', set: 's1', content: '', tool_calls: [call('file_hands', { action: 'zip' })] }] },
  { idea: 'b', messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', set: 's1', content: 'Hello.' }] }
].map((x) => JSON.stringify(x)).join('\n') + '\n');
const rows = [
  { idea: 'a', turn: 0, answer: { content: '', tool_calls: [call('file_hands', { action: 'zip' })] }, odds: [{ t: 'x', p: -0.1, top: [] }] },
  { idea: 'a', turn: 0, answer: { content: '', tool_calls: [call('list_folder')] } },
  { idea: 'b', turn: 0, answer: { content: 'Hi!' } },
  { idea: 'b', turn: 0, answer: { content: '', tool_calls: [call('web_search', { q: 'hi' })] } }
];
W('kept/riker/calibrate/keep-75/answers-keep-75-x.jsonl', rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
W('kept/bobert/calibrate/keep-100/answers-keep-100-x.jsonl', JSON.stringify(rows[0]) + '\n');
W('kept/riker/calibrate/scores.json', JSON.stringify({ by: 'mass', experts: 4, used: 2, layers: [[1, 2, 3, 4]], mass: [[1, 1, 1, 1]], lessons: 1, tokens: 9 }));
W('kept/riker/calibrate/priority.json', JSON.stringify({ layers: [[3, 2, 1, 0]] }));
W('kept/riker/calibrate/keep-75.json', JSON.stringify({ share: 0.75, keep: [[1, 2, 3]] }));
W('kept/riker/answers-quiz-riker-x.jsonl', JSON.stringify({ kind: 'fact', q: 'What is 17 times 23? Just the number.', answer: { content: '391' } }) + '\n' + JSON.stringify({ kind: 'fact', q: 'What is 17 times 23? Just the number.', answer: { content: '400' } }) + '\n');
const before = JSON.stringify(fs.readdirSync(path.join(tmp, 'kept'), { recursive: true }).sort());
const run = (extra = []) => spawnSync(process.execPath, [path.join(here, '..', 'model-lab', 'make-datasets.mjs'), '--from', path.join(tmp, 'kept'), '--lessons', path.join(tmp, 'lessons'), '--out', path.join(tmp, 'ds'), '--user', 'zorvik', '--host', 'box7', ...extra], { encoding: 'utf8' });
const r = run();
check('it finishes', r.status === 0, r.stderr);
const read = (f) => fs.readFileSync(path.join(tmp, 'ds', f), 'utf8').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
check('clean tool chats: the right answer once (two brains gave the same one)', read('chats-tool-calls.jsonl').length === 1);
check('clean no-tool chats: only the right one', read('chats-no-tool.jsonl').length === 1 && read('chats-no-tool.jsonl')[0].answer.content === 'Hi!');
const full = read('full/chats-tool-calls.jsonl');
check('the full set keeps every answer, marked', full.length === 3 && full.filter((x) => !x.ok).length === 1 && full.find((x) => !x.ok).mistake === 'wrong tool');
check('a tool called for nothing is named so', read('full/chats-no-tool.jsonl').find((x) => !x.ok).mistake === 'tool called for nothing');
const pairs = read('pairs-right-vs-wrong.jsonl');
check('each wrong answer becomes a right-vs-wrong pair', pairs.length === 2 && pairs[0].chosen.tool_calls[0].function.name === 'file_hands');
check('rows say which split they came from (old rows: held-out)', read('chats-tool-calls.jsonl')[0].split === 'holdout');
check('odds come along', read('chats-tool-calls.jsonl')[0].odds?.length === 1);
check('quiz: right fact kept, wrong one only in full', read('quiz-facts.jsonl').length === 1 && read('full/quiz-facts.jsonl').length === 2);
check('REAP files each their own', ['reap-scores-riker.json', 'experts-by-layer-riker.json', 'keep-riker-75.json'].every((f) => fs.existsSync(path.join(tmp, 'ds', f))));
check('the raw folder is untouched', JSON.stringify(fs.readdirSync(path.join(tmp, 'kept'), { recursive: true }).sort()) === before);
fs.rmSync(path.join(tmp, 'ds'), { recursive: true });
{ const r2 = run(['--private', 'zip my']); const all = fs.readdirSync(path.join(tmp, 'ds'), { recursive: true }).filter((f) => /\.jsonl?$/.test(f)).map((f) => fs.readFileSync(path.join(tmp, 'ds', f), 'utf8')).join('');
  check('a private word is scrubbed out of every file, and the check after passes', r2.status === 0 && !/zip my/i.test(all) && /private project/.test(all), r2.stderr); }
check('the output may not sit inside the raw folder', spawnSync(process.execPath, [path.join(here, '..', 'model-lab', 'make-datasets.mjs'), '--from', path.join(tmp, 'kept'), '--lessons', path.join(tmp, 'lessons'), '--out', path.join(tmp, 'kept', 'ds')]).status === 1);
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
