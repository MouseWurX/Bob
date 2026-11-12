// The real entry test (Nov 11): the tool part of the Lab test, the test every brain takes before it goes into Bob.
// It used to be 8 one-shot questions with 4 made-up tools. Now each job uses Bob's REAL tool descriptions (read from
// tools.js, so they never drift) and goes round a short version of his turn loop with the same loop helps he uses
// (loop-help.js, PR #144): calls are checked and mended before they "run", a call missing something bounces with one
// line saying what to send, errors get a hint, long jobs get a "where we are" note, and the last round has no tools so
// the brain answers. The tools are stand-ins with fixed results: nothing on this computer is touched.
//
// model-lab/loop-test.mjs shares the multi-step jobs and stand-in results below, and runs them through Bob's whole
// Brain (his real prompt, toolbox and retries) for a deeper look on the PC.
import { fixCalls, errorHint, onTrackNote, LAST_ROUND_NOTE } from './loop-help.js';

// The real tools the entry test hands over: enough to need a choice, all of them ones Bob uses every day.
export const ENTRY_TOOLS = ['web_search', 'fetch_page', 'read_file', 'list_folder', 'write_file', 'edit_file', 'search_files', 'notice_board', 'remember', 'reminders', 'save_spreadsheet', 'make_image'];

// One-step jobs: the right tool has to run with everything it needs.
export const SINGLE = [
  { text: 'What\'s the weather like in Lisbon right now?', need: ['web_search'] },
  { text: 'Make me a picture of a cat wearing a hat.', need: ['make_image'] },
  { text: 'Remind me to call my mum at 6 pm.', need: ['reminders'] },
  { text: 'Find the file where I wrote my shopping list.', need: ['search_files'] },
  { text: 'Put "buy bread" on my to-do list.', need: ['notice_board'] },
  { text: 'Remember that my sister\'s birthday is on March 3rd.', need: ['remember'] },
  { text: 'What\'s in my inn folder?', need: ['list_folder'] },
  { text: 'Read notes.txt and tell me what\'s on it.', need: ['read_file'] }
];
// Jobs that take several steps (loop-test.mjs runs these too). `group`: the toolbox group the loop test checks.
export const MULTI = [
  { text: 'find out how tall the eiffel tower is and save it in a text file called tower.txt', group: 'documents', need: ['web_search', 'write_file'] },
  { text: 'read notes.txt and put the to-dos from it on my notice board', group: null, need: ['read_file', 'notice_board'] },
  { text: 'look up the weather in Calgary and Denver and tell me which is warmer', group: null, need: ['web_search'] },
  { text: 'check report.txt, it says the total is wrong, fix the total line', group: 'documents', need: ['read_file', 'edit_file'] },
  { text: 'what is in missing.txt? if it is not there, look in the inn folder for something like it', group: null, need: ['read_file', 'list_folder'] },
  { text: 'search for the three newest llama.cpp releases and put them in a spreadsheet', group: 'documents', need: ['web_search', 'save_spreadsheet'] },
  { text: 'remember that my cat is called Patches, then remind me tomorrow at 9 to feed him', group: null, need: ['remember', 'reminders'] },
  { text: 'read the page https://example.com/news and give me the two main points', group: null, need: ['fetch_page'] }
];
// The tool part of the quiz as [text, need] pairs (the shape every quiz part has: the question first).
export const ENTRY_JOBS = [...SINGLE, ...MULTI].map((j) => [j.text, j.need]);

// Stand-in tools: fixed results, a couple of failures on purpose to see the brain recover.
export const RESULTS = {
  web_search: (a) => `1. ${a.query} - Example Encyclopedia: ${a.query} is about 330 m (as of 2026). https://example.org/a\n2. More on ${a.query}: https://example.org/b`,
  fetch_page: (a) => `Page ${a.url}: The council approved the new bridge. Bus fares go up 5% in March. Weather: sunny.`,
  read_file: (a) => (/missing/i.test(a.path || '') ? 'Error: ENOENT: no such file or directory' : /report/i.test(a.path || '') ? 'Line 1: apples 3\nLine 2: pears 4\nTotal: 9' : 'To do: call the plumber\nTo do: buy milk'),
  list_folder: () => 'notes.txt\nreport.txt\nmissing-old.txt',
  edit_file: (a) => (a.find ? `Changed ${a.path}.` : 'Error: find is missing'),
  write_file: (a) => `Saved ${a.path}.`,
  save_spreadsheet: () => 'Saved ledger\\releases.csv.',
  notice_board: (a) => (a.action === 'write' ? 'Saved the board.' : 'The notice board is empty.'),
  remember: () => 'Remembered.',
  reminders: () => 'Reminder set for tomorrow 09:00.',
  search_files: () => 'Documents\\shopping list.txt (line 1: eggs, milk, bread)',
  make_image: () => 'Saved the picture as pictures\\cat-in-a-hat.png.'
};
export const standIn = (name, args) => { const f = RESULTS[name]; return f ? f(args || {}) : `${name}: done (test stand-in).`; };

// Bob's real tool descriptions for the entry tools, read from tools.js with a throwaway set of settings (nothing is
// opened or written: building the list only describes the tools). Cached: they only change with Bob's version.
let cached = null;
export async function entryTools() {
  if (cached) return cached;
  const [{ buildTools }, { tidySchema }] = await Promise.all([import('./tools.js'), import('./toolbox.js')]);
  const stub = { dataDir: '.', agentDir: '.', innDir: '.', readRoots: [], readOnlyRoots: [], hands: {}, models: {} };
  const all = buildTools(stub);
  const list = ENTRY_TOOLS.filter((n) => all[n]?.schema).map((n) => tidySchema(JSON.parse(JSON.stringify(all[n].schema).replaceAll('{{USER}}', 'the user').replaceAll('{{HOME}}', 'home'))));
  cached = list;
  return list;
}

// The list when it's already been read (for code that can't wait), else null.
export const entryToolsNow = () => cached;

export const SYSTEM = 'You are Bob, an assistant on the user\'s own computer. Use your tools to do what the user asks, then tell them plainly what you did or found.';
export const MAX_STEPS = 6;
const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();

// Tool calls written in the reply's text by brains whose chat layout the engine doesn't turn into calls:
// <tool_call>{"name": "...", "arguments": {...}}</tool_call>, the usual Qwen and Hermes way.
export function callsInText(text, names) {
  const out = [];
  for (const m of String(text || '').matchAll(/<tool_call>\s*([\s\S]*?)\s*<\/tool_call>/g)) {
    let o = null; try { o = JSON.parse(m[1]); } catch {}
    if (o?.name && names.has(o.name)) out.push({ function: { name: o.name, arguments: o.arguments ?? o.parameters ?? {} } });
  }
  return out;
}

// One job through the loop. ask(messages, tools) -> { content, tool_calls: [{ function: { name, arguments } }], tps }.
// Returns { ok, ran: [names], bounced, mended, steps, answer, tps }.
export async function runEntryJob(job, tools, ask, { maxSteps = MAX_STEPS, signal } = {}) {
  const [text, need] = Array.isArray(job) ? job : [job.text, job.need];
  const byName = Object.fromEntries(tools.map((t) => [t.function.name, { schema: t }]));
  const names = new Set(Object.keys(byName));
  const msgs = [{ role: 'system', content: SYSTEM }, { role: 'user', content: text }];
  const turn = [];
  const ran = [], speeds = [];
  let bounced = 0, mended = 0, answer = '', steps = 0, n = 0;
  const bouncedBy = new Map();
  for (let step = 0; step < maxSteps; step++) {
    if (signal?.aborted) throw new Error('Stopped.');
    const last = step === maxSteps - 1;
    const note = last ? LAST_ROUND_NOTE('the user') : onTrackNote({ ask: text, turn, step, max: maxSteps });
    const send = note ? [...msgs, { role: 'system', content: note }] : msgs;
    steps++;
    const r = await ask(send, last ? null : tools);
    if (r.tps) speeds.push(r.tps);
    let calls = r.tool_calls || [];
    if (!calls.length && !last) calls = callsInText(r.content, names);
    if (!calls.length || last) { answer = stripThink(r.content).replace(/<tool_call>[\s\S]*?<\/tool_call>/g, '').trim(); break; }
    const sum = fixCalls(calls, byName, { bounced: bouncedBy });
    bounced += sum.bounced; mended += sum.fixed;
    const asst = { role: 'assistant', content: stripThink(r.content), tool_calls: calls.map((c) => ({ id: `call_${++n}`, type: 'function', function: { name: c.function.name, arguments: JSON.stringify(c.function.arguments || {}) } })) };
    msgs.push(asst); turn.push({ ...asst });
    for (const [i, c] of calls.entries()) {
      const out = c.bounce || standIn(c.function.name, c.function.arguments);
      if (!c.bounce) ran.push(c.function.name);
      const content = out + errorHint(c.function.name, out);
      msgs.push({ role: 'tool', tool_call_id: asst.tool_calls[i].id, content });
      turn.push({ role: 'tool', tool_name: c.function.name, content });
    }
  }
  const ok = need.every((x) => ran.includes(x)) && Boolean(answer);
  const tps = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  return { ok, ran, bounced, mended, steps, answer, tps };
}

// The ask for a llama-server's OpenAI-style door, with the quiz's settings (temperature 0, thinking off unless gen says).
export function serverAsk(url, { signal, body = {} } = {}) {
  return async (messages, tools) => {
    const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180e3)]) : AbortSignal.timeout(180e3),
      body: JSON.stringify({ messages, temperature: 0, max_tokens: 700, chat_template_kwargs: { enable_thinking: false }, ...body, ...(tools?.length ? { tools, tool_choice: 'auto' } : {}) }) });
    if (!r.ok) throw new Error(`llama-server answered ${r.status}`);
    const j = await r.json();
    const m = j.choices?.[0]?.message || {};
    const calls = (m.tool_calls || []).map((c) => { const a = c.function?.arguments; let args = a; if (typeof a === 'string') { try { args = JSON.parse(a); } catch { args = a; } } return { function: { name: c.function?.name, arguments: args, ...(typeof args === 'string' ? { raw: args } : {}) } }; });
    return { content: m.content || '', tool_calls: calls, tps: Number(j.timings?.predicted_per_second) || 0, prefillTps: Number(j.timings?.prompt_per_second) || 0 };
  };
}
