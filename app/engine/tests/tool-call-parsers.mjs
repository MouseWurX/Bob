#!/usr/bin/env node
// Brain Engine 0104 test: upstream llama.cpp's tool-call parser fixes (Gemma 4 calls before the thought is closed,
// the lazy grammar on bare JSON calls, token-aware parsing, the PEG debug fix). Bob's own templates (src/templates) get
// Bob's real tool lists (all tools on: Bob's own wording, the Qwen 3.5 set and the GPT-OSS set), and a set of replies a
// brain might write is parsed the way the server does it: token by token with the model's vocabulary (llama.cpp's
// models/ggml-vocab-qwen35.gguf and ggml-vocab-gemma-4.gguf), then checked against the server's grammar.
// With an old tree as well, the prompts must be the same in both (the tool shapes don't change) and every reply must
// parse at least as well as before.
//   node engine/tests/tool-call-parsers.mjs <llama.cpp checkout with the patches, built> [old checkout, built] [work folder]
// Each checkout needs build/bin/libllama-common.so (cmake -DLLAMA_BUILD_TESTS=ON, then ninja llama-common).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..', '..');
const [newTree, oldTree, workArg] = process.argv.slice(2);
if (!newTree) { console.error('usage: tool-call-parsers.mjs <new llama.cpp, built> [old llama.cpp, built] [work folder]'); process.exit(2); }
const work = workArg ? path.resolve(workArg) : fs.mkdtempSync(path.join(os.tmpdir(), 'tcp-'));
fs.mkdirSync(work, { recursive: true });
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

// 1. Bob's real tool lists.
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-tcp-'));
  const conf = path.join(tmp, 'config.json');
  fs.copyFileSync(path.join(app, 'config.example.json'), conf);
  process.env.BOB_CONFIG = conf; process.env.BOB_AGENT_DIR = tmp;
  const imp = (p) => import(pathToFileURL(path.join(app, p)).href);
  const { loadConfig } = await imp('src/config.js');
  const { Brain } = await imp('src/brain.js');
  const { HANDS } = await imp('src/hands-settings.js');
  const { SETS } = await imp('src/tool-sets.js');
  const cfg = loadConfig(); cfg.userName = 'Sam'; cfg.timeZone = 'UTC'; cfg.readRoots = [tmp]; cfg.webSearch = true; cfg.allTools = true;
  cfg.hands = { enabled: true, ...Object.fromEntries(Object.keys(HANDS).map((h) => [h, { on: true }])) };
  const brain = new Brain(cfg, () => {}); clearInterval(brain.reminderTimer);
  const names = Object.keys(brain.tools);
  fs.writeFileSync(path.join(work, 'tools-bob.json'), JSON.stringify(brain.toolSchemas(names)));
  for (const fam of ['qwen3.5', 'gpt-oss']) fs.writeFileSync(path.join(work, `tools-${fam}.json`), JSON.stringify(brain.toolSchemas(names, { id: fam, ...SETS[fam] })));
}

// 2. Replies a brain might write. want: the tool names the reply must give (null: not checked, only compared).
const P = (s) => '\x01' + s + '\x02'; // typed as plain text, not the special token
const qcall = (name, args) => `<tool_call>\n<function=${name}>\n` + Object.entries(args).map(([k, v]) => `<parameter=${k}>\n${v}\n</parameter>\n`).join('') + '</function>\n</tool_call>';
const QWEN = [
  ['one call, thinking off', false, qcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['one call, thinking on', true, 'The user wants their notes. I will read the file.\n</think>\n\n' + qcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['text then call', false, 'Let me read it.\n\n' + qcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['two calls', false, qcall('read_file', { path: '~/a.txt' }) + '\n' + qcall('read_file', { path: '~/b.txt' }), ['read_file', 'read_file']],
  ['code with < and tag-like text in a value', false, qcall('write_file', { path: '~/x.html', content: '<html>\n<body><p>a < b && c > d</p>\n<!-- </parameter> is text here -->\n</body>\n</html>' }), ['write_file']],
  ['a boolean input', false, qcall('notice_board', { action: 'write', content: '- one\n- two', drop: 'true' }), ['notice_board']],
  ['plain answer', false, 'Your notes file is empty, so there is nothing to read.', []],
  ['plain answer naming <tool_call> as text', false, 'To call a tool, a model writes ' + P('<tool_call>') + ' and then the function.', null],
  ['call while still thinking (no </think>)', true, 'I should read the notes.\n\n' + qcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['bare JSON call', false, '{"name": "read_file", "arguments": {"path": "~/notes.txt"}}', null],
  ['JSON inside <tool_call>', false, '<tool_call>\n{"name": "read_file", "arguments": {"path": "~/notes.txt"}}\n</tool_call>', null],
  ['unicode and quotes in a value', false, qcall('remember', { fact: 'Sam\'s café "Le Mûr" — opens 9 AM 🐭' }), ['remember']],
];
const gcall = (name, args) => `<|tool_call>call:${name}{` + Object.entries(args).map(([k, v]) => `${k}:<|"|>${v}<|"|>`).join(',') + '}<tool_call|>';
const GEMMA = [
  ['one call', false, gcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['text then call', false, 'Let me read it.\n' + gcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['two calls', false, gcall('read_file', { path: '~/a.txt' }) + gcall('read_file', { path: '~/b.txt' }), ['read_file', 'read_file']],
  ['thought then call', true, '<|channel>thought\nThe user wants the notes.<channel|>' + gcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['call before the thought is closed (upstream #32232)', true, '<|channel>thought\nI will read the notes.' + gcall('read_file', { path: '~/notes.txt' }), ['read_file']],
  ['code with braces in a value (inputs in A-Z order, as the grammar asks)', false, gcall('write_file', { content: 'def f(a, b):\n    return {"a": a, "b": [b]}\n', path: '~/x.py' }), ['write_file']],
  ['plain answer', false, 'Your notes file is empty.', []],
  ['plain answer naming call: as text', false, 'In Gemma the call looks like ' + P('<|tool_call>call:read_file{}') + ' in the text.', null],
  ['unicode in a value', false, gcall('remember', { fact: 'café "Le Mûr" — 9 AM 🐭' }), ['remember']],
];
const ocall = (name, json) => `<|channel|>commentary to=functions.${name} <|constrain|>json<|message|>${json}<|call|>`;
const GPTOSS = [
  ['one call', false, ocall('read_file', '{"path":"~/notes.txt"}'), ['read_file']],
  ['analysis then call', true, '<|channel|>analysis<|message|>Need to read notes.<|end|><|start|>assistant' + ocall('read_file', '{"path":"~/notes.txt"}'), ['read_file']],
  ['final answer', false, '<|channel|>final<|message|>Your notes file is empty.', []],
  ['analysis then final', true, '<|channel|>analysis<|message|>Nothing to do.<|end|><|start|>assistant<|channel|>final<|message|>Done.', []],
  ['code with quotes in the JSON', false, ocall('write_file', '{"path":"~/x.js","content":"const a = \\"<b>\\";\\nconsole.log(a);"}'), ['write_file']],
  ['call without <|constrain|>', false, '<|channel|>commentary to=functions.read_file<|message|>{"path":"~/notes.txt"}<|call|>', ['read_file']],
];
const sets = { qwen: QWEN, gemma: GEMMA, gptoss: GPTOSS };
for (const [k, list] of Object.entries(sets)) fs.writeFileSync(path.join(work, `cases-${k}.json`), JSON.stringify(list.map(([name, think, text]) => ({ name, think, text }))));

// 3. Which template gets which vocabulary, tools and replies. qwen3.jinja (Qwen3's JSON calls) only takes the JSON reply.
const RUNS = [
  ['qwen3.5', 'ggml-vocab-qwen35.gguf', 'qwen3.5', 'qwen'],
  ['qwen3-coder', 'ggml-vocab-qwen35.gguf', 'bob', 'qwen'],
  ['gemma4-small', 'ggml-vocab-gemma-4.gguf', 'bob', 'gemma'],
  ['gemma4', 'ggml-vocab-gemma-4.gguf', 'bob', 'gemma'],
  ['gpt-oss', null, 'gpt-oss', 'gptoss'],
];
function build(tree, name) {
  const out = path.join(work, name);
  const inc = ['common', 'include', 'ggml/include', 'vendor'].flatMap((d) => ['-I', path.join(tree, d)]);
  const lib = path.join(tree, 'build', 'bin');
  execFileSync('g++', ['-std=c++17', '-O1', path.join(here, 'tool-call-parsers-check.cpp'), ...inc, '-L', lib, '-lllama-common', '-lllama', '-lggml', '-lggml-base', `-Wl,-rpath,${lib}`, '-o', out], { stdio: 'inherit' });
  return out;
}
function runAll(tree, bin, tag) {
  const res = {};
  for (const [tpl, vocab, tools, cases] of RUNS) {
    const o = path.join(work, `${tag}-${tpl}.json`);
    execFileSync(bin, [path.join(app, 'src', 'templates', `${tpl}.jinja`), vocab ? path.join(tree, 'models', vocab) : '-', path.join(work, `tools-${tools}.json`), path.join(work, `cases-${cases}.json`), o], { stdio: ['ignore', 'ignore', 'inherit'] });
    res[tpl] = JSON.parse(fs.readFileSync(o, 'utf8').replace(/\r\n/g, '\n'));
  }
  return res;
}
const names = (c) => (c.final?.calls || []).map((x) => x.name);
const argsOk = (c) => (c.final?.calls || []).every((x) => { try { JSON.parse(x.args); return true; } catch { return false; } });

const now = runAll(newTree, build(newTree, 'check-new'), 'new');
for (const [tpl, , , cases] of RUNS) {
  const r = now[tpl];
  sets[cases].forEach(([name, , , want], i) => {
    const c = r.cases[i];
    if (want) check(`${tpl}: ${name}: gives ${want.join(', ') || 'no call'}`, !c.error && !c.final_error && JSON.stringify(names(c)) === JSON.stringify(want) && argsOk(c), JSON.stringify(c).slice(0, 300));
    if (want?.length && 'grammar_ok' in c) check(`${tpl}: ${name}: the grammar lets it through`, c.grammar_ok === true, c.grammar_error);
  });
}
if (oldTree) {
  const before = runAll(oldTree, build(oldTree, 'check-old'), 'old');
  for (const [tpl] of RUNS) {
    for (const k of ['think_off', 'think_on']) check(`${tpl} (${k}): the prompt and tool list are the same as before`, before[tpl][k].prompt === now[tpl][k].prompt && before[tpl][k].format === now[tpl][k].format);
    now[tpl].cases.forEach((c, i) => {
      const b = before[tpl].cases[i];
      const better = names(c).length >= names(b).length && (!c.error || b.error);
      check(`${tpl}: ${c.name}: parses at least as well as before`, better, `before ${JSON.stringify(names(b))}, now ${JSON.stringify(names(c))}`);
      if (JSON.stringify(c.final) !== JSON.stringify(b.final)) console.log(`  changed: ${tpl}: ${c.name}: before ${JSON.stringify(b.final)} now ${JSON.stringify(c.final)}`);
    });
  }
}
console.log(`\n${pass} passed, ${fail} failed (work folder ${work})`);
process.exit(fail ? 1 : 0);
