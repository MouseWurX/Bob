// 1.5.29: brains that write tool calls as text on Bob's engine (qwen2.5-coder: bare JSON; gpt-oss: Harmony tokens).
import { LlamaCpp, textCalls, cleanHarmony } from '../src/llamacpp.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const names = new Set(['remember', 'web_search']);

{ const r = textCalls('{"name": "remember", "arguments": {"fact": "likes tea"}}', names);
  check('qwen2.5-coder: a bare JSON call becomes a real call', r?.calls[0].function.name === 'remember' && r.calls[0].function.arguments.fact === 'likes tea' && r.text === ''); }
{ const r = textCalls('```json\n{"name": "web_search", "parameters": {"query": "weather"}}\n```', names);
  check('a fenced JSON call with "parameters" works too', r?.calls[0].function.arguments.query === 'weather'); }
{ const r = textCalls('<tool_call>\n{"name": "remember", "arguments": {"fact": "a"}}\n</tool_call>\n<tool_call>{"name": "web_search", "arguments": {"query": "b"}}</tool_call>', names);
  check('<tool_call> tags, two calls', r?.calls.length === 2 && r.calls[1].function.name === 'web_search'); }
{ const r = textCalls('<|channel|>analysis<|message|>Need to search.<|end|><|start|>assistant<|channel|>commentary to=functions.web_search <|constrain|>json<|message|>{"query":"news"}<|call|>', names);
  check('gpt-oss Harmony: the commentary call becomes a real call', r?.calls[0].function.name === 'web_search' && r.calls[0].function.arguments.query === 'news'); }
check('a tool Bob didn\'t offer is not called', textCalls('{"name": "delete_everything", "arguments": {}}', names) === null);
check('ordinary text is left alone', textCalls('Sure, I can help with that.', names) === null && textCalls('{"a": 1}', names) === null);
check('Harmony final answer is cleaned for the chat', cleanHarmony('<|channel|>analysis<|message|>think<|end|><|start|>assistant<|channel|>final<|message|>Hello there.<|return|>') === 'Hello there.');

// Through the engine: the JSON never reaches the chat, and the reply carries a real call.
const realFetch = globalThis.fetch;
const sse = (parts) => parts.map((c) => `data: ${JSON.stringify({ choices: [{ delta: { content: c } }] })}\n\n`).join('') + 'data: [DONE]\n\n';
const tools = [{ type: 'function', function: { name: 'remember', parameters: { type: 'object', properties: {} } } }];
const lc = new LlamaCpp({ agentDir: '.', dataDir: '.', llamacpp: {} });
{
  globalThis.fetch = async () => new Response(sse(['{"name": "rem', 'ember", "arguments": {"fact": "x"}}']));
  const shown = [];
  const r = await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools, onToken: (t) => shown.push(t) });
  check('engine: rescued call, nothing shown in the chat', r.tool_calls?.[0].function.name === 'remember' && shown.join('') === '' && r.content === '', JSON.stringify(shown));
}
{
  globalThis.fetch = async () => new Response(sse(['Hello', ' there.']));
  const shown = [];
  const r = await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools, onToken: (t) => shown.push(t) });
  check('engine: a normal reply still streams word by word', shown.join('') === 'Hello there.' && shown.length === 2 && !r.tool_calls);
}
{
  globalThis.fetch = async () => new Response(sse(['{"a": ', '1}']));
  const shown = [];
  await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools, onToken: (t) => shown.push(t) });
  check('engine: JSON that isn\'t a call is shown at the end', shown.join('') === '{"a": 1}');
}
globalThis.fetch = realFetch;
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
