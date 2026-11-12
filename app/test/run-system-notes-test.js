import fs from 'node:fs';
// 1.5.52: brains whose chat template only takes a system message first (Qwen 3.8 on Bob's engine) used to fail with
// "500 ... System message must be at the beginning" as soon as Bob added a note mid-chat. Now the notes are folded in.
import { LlamaCpp, foldSystem, MID_SYSTEM_REFUSED } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };

const chat = [
  { role: 'system', content: 'You are Bob.' }, { role: 'system', content: 'Memory notes.' },
  { role: 'user', content: 'hi' }, { role: 'system', content: 'Bob said he could not; here are all his tools.' },
  { role: 'assistant', content: 'ok' }, { role: 'user', content: 'go on' }, { role: 'system', content: 'Thinking time is up. Answer now.' }
];
const f = foldSystem(chat);
check('one system message, first', f.filter((m) => m.role === 'system').length === 1 && f[0].role === 'system' && /You are Bob\.\n\nMemory notes\./.test(f[0].content));
check('a mid-chat note joins the user turn next to it, marked as Bob\'s own', f[1].role === 'user' && /^hi\n\n\[Note from Bob's own system\] Bob said he could not/.test(f[1].content), JSON.stringify(f[1]));
check('roles still alternate (no two user turns in a row)', f.every((m, i) => i === 0 || !(m.role === 'user' && f[i - 1].role === 'user')));
check('a note after the last user turn is folded into it', /go on\n\n\[Note from Bob's own system\] Thinking time is up/.test(f.at(-1).content) && f.at(-1).role === 'user');
check('a chat with no mid-chat notes is unchanged', JSON.stringify(foldSystem(chat.slice(0, 3))) === JSON.stringify([{ role: 'system', content: 'You are Bob.\n\nMemory notes.' }, chat[2]]));
check('the "must be first" wording is recognised too (Riker, PC check 1.5.206)', MID_SYSTEM_REFUSED.test("raise_exception('System message must be first')"));
{ // a loop turn as Bob sends it: tool rounds, then the "where we are" note last
  const turn = [{ role: 'system', content: 'You are Bob.' }, { role: 'user', content: 'find the moon size and save it' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'web_search', arguments: {} } }] }, { role: 'tool', tool_name: 'web_search', content: 'moon 3,474 km' },
    { role: 'assistant', content: '', tool_calls: [{ function: { name: 'write_file', arguments: {} } }] }, { role: 'tool', tool_name: 'write_file', content: 'saved' },
    { role: 'system', content: 'Where we are (written by the app, step 3 of 12).' }];
  const strictOk = (ms) => ms.every((m, i) => m.role !== 'system' || i === 0);
  const ft = foldSystem(turn);
  check('a system-first template takes a folded loop turn, with the where-we-are note as a user note', strictOk(ft) && !strictOk(turn) && ft.at(-1).role === 'user' && /^\[Note from Bob's own system\] Where we are/.test(ft.at(-1).content) && ft.length === turn.length);
}
const loopTest = fs.readFileSync(new URL('../model-lab/loop-test.mjs', import.meta.url), 'utf8');
check('the loop test folds notes the way Bob\'s engine does', /foldSystem\(q\.messages\)/.test(loopTest) && /MID_SYSTEM_REFUSED\.test\(full\)/.test(loopTest));
check('the exact llama-server error is recognised', MID_SYSTEM_REFUSED.test("Value is not callable: raise_exception('System message must be at the beginning.')"));

// Through the engine: a mock llama-server whose template refuses mid-chat system messages.
const sse = (t) => `data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\ndata: [DONE]\n\n`;
let calls = 0, lastBody = null;
let template = '';
globalThis.fetch = async (url, init) => {
  if (String(url).endsWith('/props')) return new Response(JSON.stringify({ chat_template: template }));
  calls++;
  lastBody = JSON.parse(init.body);
  const bad = lastBody.messages.some((m, i) => m.role === 'system' && i > 0);
  if (bad) return new Response(JSON.stringify({ error: { code: 500, message: `While executing CallExpression at line 106, column 32\n${'{%- if messages[0].role == "system" %}{{- messages[0].content }}{%- endif %}'.repeat(8)}\nValue is not callable: raise_exception('System message must be at the beginning.')` } }), { status: 500 });
  return new Response(sse('Hello.'));
};
const lc = new LlamaCpp({ agentDir: '.', dataDir: '.', llamacpp: {} });
const logs = [];
lc.log = (k, t) => logs.push(t);
const r = await lc.chatStream({ model: 'qwen3.8:27b', messages: chat });
check('the refused request is tried again with the notes folded, and answers', r.content === 'Hello.' && calls === 2, `calls=${calls} content=${r.content}`);
check('the logbook says why', logs.some((t) => /only takes a system message first/.test(t)));
calls = 0;
await lc.chatStream({ model: 'qwen3.8:27b', messages: chat });
check('the next chat with that brain is folded straight away (one request)', calls === 1);
calls = 0;
const other = await lc.chatStream({ model: 'gemma4:26b', messages: [chat[0], chat[2]] });
check('other brains and plain chats go as before', other.content === 'Hello.' && calls === 1 && lastBody.messages.length === 2);
// 1.5.60: a brain whose template says so up front is folded from its very first request.
const lc2 = new LlamaCpp({ agentDir: '.', dataDir: '.', llamacpp: {} });
template = "{%- if not loop.first %}{{- raise_exception('System message must be at the beginning.') }}{%- endif %}";
calls = 0;
const r2 = await lc2.chatStream({ model: 'qwen3.8:27b', messages: chat });
check('a template that refuses mid-chat system notes is folded from the first request', r2.content === 'Hello.' && calls === 1, `calls=${calls}`);
template = '';
globalThis.fetch = async () => new Response('some other failure', { status: 500 });
let threw = '';
try { await lc.chatStream({ model: 'x', messages: chat.slice(0, 3) }); } catch (e) { threw = e.message; }
check('any other error is still reported, not retried', /llama-server returned 500: some other failure/.test(threw));

// 1.5.61: the same through Ollama (Deep = qwen3.8:27b on Ollama refused too, and nothing caught it there).
{
  const { Ollama } = await import('../src/ollama.js');
  let n = 0, body = null;
  globalThis.fetch = async (url, init) => {
    if (!String(url).endsWith('/api/chat')) return new Response('{}');
    n++; body = JSON.parse(init.body);
    if (body.messages.some((m, i) => m.role === 'system' && i > 0)) return new Response(JSON.stringify({ error: 'template: raise_exception: System message must be at the beginning.' }), { status: 500 });
    return new Response(JSON.stringify({ message: { role: 'assistant', content: 'Hi.' }, done: true }) + '\n');
  };
  const ol = new Ollama({ ollamaUrl: 'http://127.0.0.1:1', agentDir: '.', dataDir: '.' });
  ol.thinkField = async () => undefined;
  const ologs = [];
  ol.log = (k, t) => ologs.push(t);
  const a = await ol.chat({ model: 'qwen3.8:27b', messages: chat });
  check('Ollama: a refused request is tried again folded, and answers', a.content === 'Hi.' && n === 2, `n=${n} content=${a.content}`);
  check('Ollama: the logbook says why', ologs.some((t) => /only takes a system message first/.test(t)));
  n = 0; await ol.chat({ model: 'qwen3.8:27b', messages: chat });
  check('Ollama: that brain is folded straight away next time', n === 1 && !body.messages.some((m, i) => m.role === 'system' && i > 0));
  globalThis.fetch = async () => new Response('other trouble', { status: 500 });
  let t2 = ''; try { await ol.chat({ model: 'y', messages: chat }); } catch (e) { t2 = e.message; }
  check('Ollama: any other error is still reported, not retried', /Ollama chat returned 500: other trouble/.test(t2), t2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
