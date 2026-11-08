// 1.5.32: chat templates and sampling per brain family (src/gguf.js, src/model-family.js, LlamaCpp hooks).
// Run: node test/run-family-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ggufInfo } from '../src/gguf.js';
import { familyOf, templateFor, samplingFor, TEMPLATE_DIR, TOOL_TEMP, replyTokens, cleanPresets } from '../src/model-family.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { FRONT_DESK, CORE } from '../src/persona.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-family-'));

// A tiny GGUF writer: header + key/values, no tensors. Includes a big token list to skip over.
function gguf(file, kv) {
  const parts = [];
  const u32 = (v) => { const b = Buffer.alloc(4); b.writeUInt32LE(v); parts.push(b); };
  const u64 = (v) => { const b = Buffer.alloc(8); b.writeBigUInt64LE(BigInt(v)); parts.push(b); };
  const str = (s) => { const b = Buffer.from(s, 'utf8'); u64(b.length); parts.push(b); };
  const entries = [['tokenizer.ggml.tokens', 'tokens'], ['tokenizer.ggml.scores', 'scores'], ['general.file_type', 'u32'], ...Object.entries(kv)];
  parts.push(Buffer.from('GGUF')); u32(3); u64(0); u64(entries.length);
  for (const [k, v] of entries) {
    str(k);
    if (v === 'tokens') { u32(9); u32(8); u64(200000); for (let i = 0; i < 200000; i++) str(`tok${i}`); }
    else if (v === 'scores') { u32(9); u32(6); u64(200000); parts.push(Buffer.alloc(800000)); }
    else if (v === 'u32') { u32(4); u32(15); }
    else { u32(8); str(v); }
  }
  fs.writeFileSync(file, Buffer.concat(parts));
  return file;
}

const bare = gguf(path.join(tmp, 'gemma-blob'), { 'general.architecture': 'gemma4', 'general.name': 'Gemma 4 E4B It' });
const own = gguf(path.join(tmp, 'qwen-own.gguf'), { 'general.architecture': 'qwen3', 'general.name': 'Qwen3 4B Instruct 2507', 'tokenizer.chat_template': '{{ tools }}<|im_start|>' });
const oss = gguf(path.join(tmp, 'oss-blob'), { 'general.architecture': 'gpt-oss' });
const coder = gguf(path.join(tmp, 'coder-blob'), { 'general.architecture': 'qwen3moe', 'general.name': 'Qwen3 Coder 30B A3B Instruct' });
const odd = gguf(path.join(tmp, 'odd-blob'), { 'general.architecture': 'llama' });
fs.writeFileSync(path.join(tmp, 'not-gguf'), 'GGUF');

// Reading headers
{
  const i = ggufInfo(bare);
  check('reads arch and name past a 200k-token list', i?.arch === 'gemma4' && /Gemma 4 E4B/.test(i.name) && i.template === '', JSON.stringify(i));
  check('reads a chat template when the file has one', ggufInfo(own)?.template.includes('tools'));
  check('a file that is not a GGUF is null, not an error', ggufInfo(path.join(tmp, 'not-gguf')) === null && ggufInfo(path.join(tmp, 'missing')) === null);
}

// Families
check('family: gemma4 from the file', familyOf('gemma4:e4b', ggufInfo(bare)) === 'gemma4');
check('family: gpt-oss', familyOf('gpt-oss:20b', ggufInfo(oss)) === 'gpt-oss');
check('family: qwen3 coder (moe arch + name)', familyOf('qwen3-coder:30b', ggufInfo(coder)) === 'qwen3-coder');
check('family: names alone', familyOf('qwen3:1.7b') === 'qwen3' && familyOf('qwen2.5-coder:7b') === 'qwen2.5' && familyOf('qwen3.8:27b') === 'qwen3.5' && familyOf('qwen3-4b-instruct-2507') === 'qwen3');
check('family: unknown stays unknown', familyOf('llama3:8b', ggufInfo(odd)) === null && familyOf('gemma3:12b') === null);

// Templates
{
  const t = templateFor({}, 'gemma4:26b', gguf(path.join(tmp, 'g26b'), { 'general.architecture': 'gemma4' }));
  check('a file with no template gets its family\'s template', t === path.join(TEMPLATE_DIR, 'gemma4.jinja') && fs.existsSync(t));
  check('the bundled Gemma 4 template is the current official one (llama.cpp detects it)', fs.readFileSync(t, 'utf8').includes("'<|tool_call>call:'") && fs.readFileSync(t, 'utf8').includes('OpenAI Chat Completions'));
  check('Gemma 4 E4B gets the small-model template (no empty thought block)', /gemma4-small\.jinja$/.test(templateFor({}, 'gemma4:e4b', bare)) && !fs.readFileSync(templateFor({}, 'gemma4:e4b', bare), 'utf8').includes("'<|channel>thought\\n<channel|>'"));
  check('Gemma 4 26B gets the large-model template', /gemma4\.jinja$/.test(templateFor({}, 'gemma4:26b', gguf(path.join(tmp, 'g26'), { 'general.architecture': 'gemma4', 'general.name': 'Gemma 4 26B A4B It' }))));
  check('a file with its own template keeps it', templateFor({}, 'qwen3-4b-instruct-2507', own) === null);
  check('gpt-oss and coder blobs get theirs', /gpt-oss\.jinja$/.test(templateFor({}, 'gpt-oss:20b', oss)) && /qwen3-coder\.jinja$/.test(templateFor({}, 'qwen3-coder:30b', coder)));
  check('unknown family: left to llama.cpp, as before', templateFor({}, 'llama3:8b', odd) === null && templateFor({}, 'x', path.join(tmp, 'not-gguf')) === null);
  check('config can set a template, or keep the file\'s ("own")', templateFor({ templates: { 'gemma4:e4b': 'C:\\t.jinja' } }, 'gemma4:e4b', bare) === 'C:\\t.jinja' && templateFor({ templates: { 'gemma4:e4b': 'own' } }, 'gemma4:e4b', bare) === null);
  for (const f of ['gemma4', 'gemma4-small', 'gpt-oss', 'qwen3', 'qwen3-coder', 'qwen3.5', 'qwen2.5']) check(`template file ships: ${f}.jinja`, fs.statSync(path.join(TEMPLATE_DIR, `${f}.jinja`)).size > 1000);
  check('templates folder has the licence texts', fs.existsSync(path.join(TEMPLATE_DIR, 'LICENSE-Apache-2.0.txt')) && fs.existsSync(path.join(TEMPLATE_DIR, 'LICENSE-llama.cpp-MIT.txt')));
}

// llama-server arguments
{
  const lc = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: { models: { 'gemma4:e4b': bare, 'qwen3-4b': own } } });
  const a = lc.buildArgs('gemma4:e4b');
  const i = a.indexOf('--chat-template-file');
  check('buildArgs: --chat-template-file for a template-less brain, with --jinja', i > 0 && /gemma4-small\.jinja$/.test(a[i + 1]) && a.includes('--jinja'));
  check('buildArgs: nothing added when the file has a template', !lc.buildArgs('qwen3-4b').includes('--chat-template-file'));
  const lc2 = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: { models: { 'gemma4:e4b': bare }, modelArgs: { 'gemma4:e4b': ['--chat-template', 'chatml'] } } });
  check('buildArgs: a template set by hand in args wins', !lc2.buildArgs('gemma4:e4b').includes('--chat-template-file'));
  clearInterval(lc.idleTimer); clearInterval(lc2.idleTimer);
}

// Sampling
{
  const g = samplingFor({}, 'gemma4:e4b', bare, { tools: false });
  check('gemma4 normal reply: Google\'s settings (temp 1.0, top-k 64, top-p 0.95)', g.temperature === 1.0 && g.top_k === 64 && g.top_p === 0.95);
  check(`with tools offered the temperature is capped at ${TOOL_TEMP}`, samplingFor({}, 'gemma4:e4b', bare, { tools: true }).temperature === TOOL_TEMP && samplingFor({}, 'gemma4:e4b', bare, { tools: true }).top_k === 64);
  check('qwen3 hybrid: thinking settings unless thinking is off', samplingFor({}, 'qwen3:1.7b', null, {}).top_p === 0.95 && samplingFor({}, 'qwen3:1.7b', null, { think: false }).top_p === 0.8);
  check('qwen3 2507 instruct: non-thinking settings (by name or by the file)', samplingFor({}, 'qwen3-4b-instruct-2507', null, {}).top_p === 0.8 && samplingFor({}, 'qwen3-4b', own, {}).top_p === 0.8);
  check('unknown family: nothing sent (llama-server defaults, as before)', Object.keys(samplingFor({}, 'llama3:8b', odd, { tools: true })).length === 0);
  check('sampling:false turns it off; per-model values replace the family\'s', Object.keys(samplingFor({ sampling: false }, 'gemma4:e4b', bare)).length === 0 && samplingFor({ sampling: { 'gemma4:e4b': { temperature: 0.3 } } }, 'gemma4:e4b', bare).temperature === 0.3);
  // 1.5.148: Qwen3.6 Best Practices by mode.
  const q = (o) => samplingFor({}, 'qwen3.6-35b-a3b', null, o);
  const tg = q({}), tc = q({ task: 'coding' }), nt = q({ think: false });
  check('qwen3.6 thinking, general: 1.0 / 0.95 / 20, min_p 0, repetition 1.0', tg.temperature === 1.0 && tg.top_p === 0.95 && tg.top_k === 20 && tg.min_p === 0 && tg.repeat_penalty === 1.0);
  check('qwen3.6 thinking, coding: 0.6 / 0.95 / 20', tc.temperature === 0.6 && tc.top_p === 0.95 && tc.top_k === 20);
  check('qwen3.6 no-think: 0.7 / 0.8 / 20, presence 1.5', nt.temperature === 0.7 && nt.top_p === 0.8 && nt.top_k === 20 && nt.presence_penalty === 1.5);
  check('qwen3.6 thinking keeps presence 1.5 (1.5.68 circles fix)', tg.presence_penalty === 1.5 && tc.presence_penalty === 1.5);
  check('qwen3.6 general thinking with tools: cooled to the tool temperature', q({ tools: true }).temperature === TOOL_TEMP);
  check('a coding task on another family changes nothing', samplingFor({}, 'gemma4:e4b', bare, { task: 'coding' }).temperature === 1.0);
  const mine = { on: true, thinking: { temperature: 0.8, presence_penalty: 0 }, quick: { top_k: 999 } };
  check('own presets: used only when switched on', q({ own: mine }).temperature === 0.8 && q({ own: mine }).presence_penalty === 0 && q({ own: { ...mine, on: false } }).temperature === 1.0);
  check('own presets: numbers kept in range', q({ think: false, own: mine }).top_k === 200);
  check('own presets: a hand-picked temperature is not cooled for tools', q({ tools: true, own: mine }).temperature === 0.8);
  check('own presets: junk is dropped', JSON.stringify(cleanPresets({ on: 'yes', coding: { temperature: 'hot', top_p: '' }, x: { temperature: 1 } })) === '{"on":false}');
  check('reply length: 32K on a big context, half on a small one, never under 2K', replyTokens(262144) === 32768 && replyTokens(16384) === 8192 && replyTokens(2048) === 2048 && replyTokens(undefined) === 32768);
}

// Through the engine: the request carries the sampling, and thinking switches are unchanged.
{
  const realFetch = globalThis.fetch;
  const bodies = [];
  globalThis.fetch = async (url, o) => { bodies.push(JSON.parse(o.body)); return new Response('data: ' + JSON.stringify({ choices: [{ delta: { content: 'hi' } }] }) + '\n\ndata: [DONE]\n\n'); };
  const lc = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: { models: { 'gemma4:e4b': bare } } });
  const tools = [{ type: 'function', function: { name: 'remember', parameters: { type: 'object', properties: {} } } }];
  await lc.chatStream({ model: 'gemma4:e4b', messages: [{ role: 'user', content: 'x' }], tools, think: false });
  await lc.chatStream({ model: 'gemma4:e4b', messages: [{ role: 'user', content: 'x' }] });
  check('request with tools: temperature capped, top_k sent, enable_thinking:false kept', bodies[0].temperature === TOOL_TEMP && bodies[0].top_k === 64 && bodies[0].chat_template_kwargs?.enable_thinking === false);
  check('request without tools: full family temperature, no thinking switch added', bodies[1].temperature === 1.0 && !bodies[1].chat_template_kwargs);
  globalThis.fetch = realFetch;
  clearInterval(lc.idleTimer);
}

// Prompt: act, don't announce
// 1.5.102: the picture half is said once, in the brain's picture line (withLimits), not in FRONT_DESK as well.
check('front desk: the tool call goes in the same reply as "I\'ll draw it"', /the tool call goes in that same reply/.test(FRONT_DESK) && /call make_image yourself straight away, in the same reply/.test(fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8')) && !/To make an actual picture/.test(FRONT_DESK));
check('front desk: an assumption is enough to act on', /If you can say "I assume\.\.\.", you know enough: do it/.test(FRONT_DESK) && /a spreadsheet, a schedule/.test(FRONT_DESK) && /wrong guess would delete, overwrite, move or send something\. Then ask first/.test(FRONT_DESK));
check('core: "mention it and ask" is only about extras nobody asked for', /only about extras nobody asked for/.test(CORE));


// Tools the brains kept asking about instead of using (PC rerun, 15:36)
{
  const { buildTools } = await import('../src/tools.js');
  const { webPrompt } = await import('../src/web.js');
  const a = path.join(tmp, 'projA'), b = path.join(tmp, 'projB');
  fs.mkdirSync(a, { recursive: true }); fs.mkdirSync(b, { recursive: true });
  fs.writeFileSync(path.join(a, 'Enemy.cpp'), 'void SpawnEnemy();');
  fs.writeFileSync(path.join(b, 'Wave.cpp'), 'SpawnEnemy(3);');
  const cfg = { agentDir: tmp, dataDir: tmp, innDir: tmp, readRoots: [tmp], readOnlyRoots: [], projects: { Alpha: a, Beta: b } };
  const t = buildTools(cfg);
  const sch = t.search_files.schema.function;
  check('search_files: project is optional', JSON.stringify(sch.parameters.required) === '["text"]' && /leave project out/.test(sch.description));
  const all = await t.search_files.run({ text: 'spawnenemy' });
  check('search_files with no project searches every project', all.includes('Enemy.cpp') && all.includes('Wave.cpp'));
  const one = await t.search_files.run({ project: 'Beta', text: 'spawnenemy' });
  check('search_files with a project searches only that one', one.includes('Wave.cpp') && !one.includes('Enemy.cpp'));
  let err = '';
  try { await buildTools({ ...cfg, projects: {} }).search_files.run({ text: 'xx' }); } catch (e) { err = e.message; }
  check('no projects: a plain error with another way to look', /No projects are set up yet/.test(err));
  check('make_music: picks a style when none was given', /pick one that fits/.test(t.make_music.schema.function.parameters.properties.prompt.description));
  check('ask_specialist: passes the job on without asking for paths', /don't ask for paths or line numbers first/.test(t.ask_specialist.schema.function.parameters.properties.task.description));
  check('web search off: offers the switch (1.5.91: the Set it up card)', /offer_setup with "web"/.test(webPrompt({ userName: 'Sam' })) && /switch/i.test(webPrompt({ userName: 'Sam' })));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
