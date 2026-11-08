// 1.5.63: The owner switched the Coding brain to Qwen3.6 35B-A3B after the race (Qwen3 Coder 30B stays installed).
import fs from 'node:fs';
import { brainDefaults } from '../src/sessions.js';
import { samplingFor, familyOf } from '../src/model-family.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url)));
const q = cat.models.find((m) => m.id === 'qwen3.6-35b-a3b');
check('Qwen3.6 35B-A3B has passed its PC test (no New tag)', q && !q.trial);
const big = cat.packs.find((p) => p.id === 'big');
check('the 16 GB starter set equips it for Brain and Coding, Gemma 4 26B for Office and Deep thinking', ['bob', 'tinker'].every((x) => big.slots['qwen3.6-35b-a3b']?.includes(x)) && ['deep', 'office'].every((x) => big.slots['gemma4-26b']?.includes(x)) && !big.slots['gemma4-26b'].includes('bob') && !big.models.includes('qwen3-coder-30b'));
check('Qwen3 Coder 30B is still in the catalogue to pick', cat.models.some((m) => m.id === 'qwen3-coder-30b' && m.jobs.includes('tinker')));

const id = 'qwen3.6-35b-a3b';
check('Coding thinks at every effort, at 256K', ['low', 'medium', 'high', 'extreme'].every((e) => JSON.stringify(brainDefaults(id, 'tinker', e)) === JSON.stringify({ ctx: 262144 })));
check('everyday chat (Brain) never thinks first, and uses the same 256K load', ['low', 'medium', 'high'].every((e) => JSON.stringify(brainDefaults(id, 'bob', e)) === JSON.stringify({ ctx: 262144, think: false })));
check('every other copy on it gets 256K too, so a hand-off never reloads it', brainDefaults(id, 'scout', 'low').ctx === 262144 && !('think' in brainDefaults(id, 'scout', 'low')));
check('other brains are untouched', JSON.stringify(brainDefaults('qwen3-coder:30b', 'tinker', 'low')) === '{}' && JSON.stringify(brainDefaults('gemma4:26b', 'bob', 'low')) === '{}');

check('family is the Qwen3.5/3.6 one', familyOf(id, null) === 'qwen3.5');
const think = samplingFor({}, id, null, { think: undefined, task: 'coding' });
check('thinking through code: temp 0.6, top_p 0.95, top_k 20, min_p 0, presence_penalty 1.5', think.temperature === 0.6 && think.top_p === 0.95 && think.top_k === 20 && think.min_p === 0 && think.presence_penalty === 1.5, JSON.stringify(think));
const thinkAny = samplingFor({}, id, null, { think: undefined });
check('1.5.148 thinking, general: temp 1.0 (Qwen3.6 Best Practices)', thinkAny.temperature === 1.0 && thinkAny.top_p === 0.95, JSON.stringify(thinkAny));
const plain = samplingFor({}, id, null, { think: false });
check('no thinking: temp 0.7, top_p 0.8, top_k 20, presence_penalty 1.5', plain.temperature === 0.7 && plain.top_p === 0.8 && plain.top_k === 20 && plain.presence_penalty === 1.5, JSON.stringify(plain));
check('with tools the temperature keeps Bob\'s 0.6 cap', samplingFor({}, id, null, { think: false, tools: true }).temperature === 0.6);

const faq = HELP.find((h) => h.id === 'faq-coding-think');
check('Help has the FAQ in Bob\'s voice: coding always thinks, chat answers straight off', faq && /For coding, always/.test(faq.html) && /straight off/.test(faq.html) && faq.title === 'When does Bob think things through first?');
check('the glossary says coding always thinks and chat doesn\'t', /Thinking first<\/dt><dd>[^<]*Low doesn't, and with Qwen3.6 coding jobs always do/.test(HELP.find((h) => h.id === 'glossary').html));
// ---------- 1.5.66: his own one more go thinks it through ----------
{
  const os = await import('node:os'); const path = await import('node:path');
  const { Brain } = await import('../src/brain.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob coding '));
  const inn = path.join(tmp, 'inn'), dataDir = path.join(inn, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const make = (bob) => {
    const brain = new Brain({ agentDir: tmp, innDir: inn, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [inn], readOnlyRoots: [], recycleBin: false, userName: 'Sam', models: { bob }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' }, () => {});
    clearInterval(brain.reminderTimer);
    brain.ensureModel = async () => {}; brain.fitCtx = async (m, c) => c; brain.recall = async () => '';
    const calls = [];
    const replies = [{ role: 'assistant', content: "Sorry, I can't do that." }, { role: 'assistant', content: 'Here it is: 42.' }];
    brain.engine = { chat: async (o) => { calls.push({ think: o.think, ctx: o.ctx }); return replies.shift() || { role: 'assistant', content: 'ok' }; } };
    return { brain, calls };
  };
  const run = async (b) => { const evs = []; await b.brain.runOn([], 'what is six times seven', (e) => evs.push(e), new AbortController().signal, [], null, 's1'); return evs; };
  const q = make('qwen3.6-35b-a3b');
  const evs = await run(q);
  check('everyday chat on Qwen3.6: the first answer doesn\'t think, at 256K', q.calls[0]?.think === false && q.calls[0]?.ctx === 262144, JSON.stringify(q.calls));
  check('his one more go thinks it through, on the same 256K load', q.calls.length === 2 && q.calls[1].think !== false && q.calls[1].ctx === 262144, JSON.stringify(q.calls));
  check('the chat says so plainly', evs.some((e) => e.type === 'announce' && /thinking it through this time/.test(e.text)));
  const g = make('gemma4:26b');
  const gevs = await run(g);
  check('another brain retries as before (no thinking line)', g.calls.length === 2 && g.calls[1].think === false && !gevs.some((e) => e.type === 'announce' && /thinking it through/.test(e.text)), JSON.stringify(g.calls));
  check('Help says the second go thinks it through', /second go thinks it through: same brain, no reload/.test(faq.html));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- 1.5.67: waking the chat brain after a job loads the job's 256K (no 32K reload in between) ----------
{
  const os = await import('node:os'); const path = await import('node:path');
  const { Brain } = await import('../src/brain.js');
  const { chatBrain } = await import('../src/brain-mode.js');
  const { modelFor } = await import('../src/sessions.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob wake '));
  const inn = path.join(tmp, 'inn'), dataDir = path.join(inn, 'bob');
  fs.mkdirSync(dataDir, { recursive: true });
  const make = (bob, extra = {}) => {
    const brain = new Brain({ agentDir: tmp, innDir: inn, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [inn], readOnlyRoots: [], recycleBin: false, userName: 'Sam', models: { bob }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', ...extra }, () => {});
    clearInterval(brain.reminderTimer);
    brain.ensureModel = async () => {}; brain.fitCtx = async (m, c) => c; brain.recall = async () => '';
    const calls = [], wakes = [];
    brain.engine = { chat: async (o) => { calls.push(o.ctx); return { role: 'assistant', content: 'ok' }; }, isLoaded: async () => false, preload: async (m, k, o) => { wakes.push(o.ctx); return 1; } };
    return { brain, calls, wakes };
  };
  const q = make('qwen3.6-35b-a3b');
  await q.brain.runOn([], 'hi', () => {}, new AbortController().signal, [], null, 's1');
  await q.brain.wake('back to the quick brain after a job');
  check('Qwen3.6: waking the chat brain after a job uses the job\'s 256K, so it doesn\'t reload', q.calls[0] === 262144 && q.wakes[0] === q.calls[0], JSON.stringify({ job: q.calls, wake: q.wakes }));
  check('the chat brain itself is 256K (wake, read-ahead, room checks, lending and the speed test all use it)', chatBrain(q.brain.cfg).ctx === 262144);
  check('every copy on it in Normal is 256K too', modelFor({ models: { bob: 'qwen3.6-35b-a3b', tinker: 'qwen3.6-35b-a3b' } }, 'tinker').ctx === 262144);
  const hand = make('qwen3.6-35b-a3b', { sessionCtx: { normal: 32768 } });
  check('a context picked by hand for Normal still wins', chatBrain(hand.brain.cfg).ctx === 32768);
  const g = make('gemma4:26b');
  check('other brains keep the Normal 32K', chatBrain(g.brain.cfg).ctx === 32768);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- 1.5.68: the always-thinking Coding copy can't think forever ----------
{
  const os = await import('node:os'); const path = await import('node:path');
  const { LlamaCpp, thinkBudget, LONG_THINK_BUDGET, MAX_REPLY_TOKENS, THINK_BUDGET } = await import('../src/llamacpp.js');
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob budget '));
  const lc = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: {} });
  check('Qwen3.6 thinking has a budget at Low (Coding thinks by default) and at High', thinkBudget(id, undefined) === LONG_THINK_BUDGET && thinkBudget(id, 'high') === LONG_THINK_BUDGET && LONG_THINK_BUDGET >= 8192 && LONG_THINK_BUDGET <= 16384);
  check('Medium keeps its own shorter budget; no thinking means no budget', thinkBudget(id, 'medium') === THINK_BUDGET.medium && thinkBudget(id, false) === 0);
  check('other brains thinking at High are left as they were', thinkBudget('qwen3.8-27b', 'high') === 0 && thinkBudget('gemma4:26b', undefined) === 0);
  const realFetch = globalThis.fetch;
  const bodies = [];
  const thinkChunks = (n) => Array.from({ length: n }, () => 'data: {"choices":[{"delta":{"reasoning_content":"hm"}}]}\n\n').join('');
  globalThis.fetch = async (url, init) => {
    if (!init?.body) throw new Error('no props here');
    const b = JSON.parse(init.body); bodies.push(b);
    if (b.chat_template_kwargs?.enable_thinking === false) return new Response('data: {"choices":[{"delta":{"content":"answer"}}]}\n\ndata: [DONE]\n\n');
    const stream = new ReadableStream({ async pull(c) { if (init.signal.aborted) { c.error(new DOMException('aborted', 'AbortError')); return; } c.enqueue(new TextEncoder().encode(thinkChunks(500))); await new Promise((r) => setTimeout(r, 0)); } });
    return new Response(stream);
  };
  for (const [label, think] of [['Low', undefined], ['High', 'high']]) {
    bodies.length = 0;
    const r = await lc.chatOnce({ model: id, messages: [{ role: 'user', content: 'tidy this Unreal helper' }], think });
    check(`${label} Coding on Qwen3.6: endless thinking is stopped at the budget, then it answers`, r.content === 'answer' && bodies.length === 2 && /Thinking time is up/.test(JSON.stringify(bodies[1].messages)), JSON.stringify({ r, n: bodies.length }));
    check(`${label} Coding on Qwen3.6 sends presence_penalty 1.5 and a reply ceiling`, bodies[0].presence_penalty === 1.5 && bodies[0].max_tokens === MAX_REPLY_TOKENS && bodies[1].max_tokens === MAX_REPLY_TOKENS);
  }
  bodies.length = 0;
  globalThis.fetch = async (url, init) => { if (!init?.body) throw new Error('no props'); bodies.push(JSON.parse(init.body)); return new Response('data: {"choices":[{"delta":{"content":"hi"}}]}\n\ndata: [DONE]\n\n'); };
  await lc.chatOnce({ model: 'gemma4:26b', messages: [{ role: 'user', content: 'x' }], think: false });
  check('every request has the reply ceiling, any brain', bodies[0].max_tokens === MAX_REPLY_TOKENS);
  globalThis.fetch = realFetch;
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
