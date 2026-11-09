// 1.5.60: "Check out github.com/MouseWurX/Bob" with web search on. Qwen3 4B answered "I have no live web access" and
// "that isn't on your PC" instead of calling fetch_page. Now the front desk opens the first link itself first.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { findLinks, normaliseUrl, linkPrompt, LINK_PROMPT, refersToLink } from '../src/web.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

// ---------- Finding links ----------
check('a bare github address is a link', findLinks('Check out github.com/MouseWurX/Bob')[0] === 'https://github.com/MouseWurX/Bob');
check('"https:/" with one slash is fixed', normaliseUrl('https:/example.com/a') === 'https://example.com/a');
check('a full link keeps its query and loses the full stop after it', findLinks('see https://x.org/p?q=1.')[0] === 'https://x.org/p?q=1');
check('a bare domain with no path is a link', findLinks('what is on docs.python.org')[0] === 'https://docs.python.org/');
for (const t of ['open config.json please', 'run build.sh', 'Bob.app is on the Mac', 'C:\\Users\\you\\notes.ca', 'v1.5.60 is out', 'save it as logo.ai'])
  check(`not a link: ${t}`, findLinks(t).length === 0, JSON.stringify(findLinks(t)));
check('at most two links, no repeats', findLinks('a.com b.com a.com c.com').length === 2);

// ---------- The prompt line ----------
check('web on: the prompt says a link is a web page and fetch_page opens it', linkPrompt({ webSearch: true }).includes(LINK_PROMPT) && /not a file on this PC/.test(LINK_PROMPT) && /fetch_page/.test(LINK_PROMPT));
check('web off: the off line instead, no link line', !linkPrompt({ webSearch: false }));

// ---------- The front desk opens the link before a brain that refuses in prose ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-links-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const make = (webSearch) => {
  const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
    models: { bob: 'qwen3-4b:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', webSearch };
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  const fetched = [];
  brain.tools.fetch_page = { ...brain.tools.fetch_page, run: async ({ url }) => { fetched.push(url); return 'Bob: a local AI helper. README ...'; } };
  const seen = [];
  // A small brain that refuses in prose unless the page is already in front of it.
  brain.engine = { chat: async ({ messages }) => {
    seen.push(messages);
    const has = messages.some((m) => m.role === 'tool' && /README/.test(m.content));
    return { role: 'assistant', content: has ? 'It is Bob, a local AI helper.' : "I don't have live web access, and that link isn't on your PC." };
  } };
  return { brain, fetched, seen };
};
const run = async (b, text) => { const evs = []; await b.brain.runOn([], text, (e) => evs.push(e), new AbortController().signal, [], null, 's1'); return evs; };

{
  const b = make(true);
  const evs = await run(b, 'Check out github.com/MouseWurX/Bob');
  check('web on: the link is opened once, normalised', b.fetched.length === 1 && b.fetched[0] === 'https://github.com/MouseWurX/Bob', JSON.stringify(b.fetched));
  check('the chat shows it as a Read the page step', evs.some((e) => e.type === 'tool' && e.name === 'fetch_page'));
  check('the brain answers from the page first time (no "I can\'t" retry)', b.seen.length === 1, String(b.seen.length));
  const first = b.seen[0];
  check('the page text is in front of the brain before its first word', first.some((m) => m.role === 'tool' && m.tool_name === 'fetch_page'));
  check('the brain is told a link is a web page', first[0].content.includes(LINK_PROMPT));
}
{
  const b = make(false);
  await run(b, 'Check out github.com/MouseWurX/Bob');
  check('web off: nothing is fetched', b.fetched.length === 0);
}
{
  const b = make(true);
  await run(b, 'hi Bob, how are you?');
  check('no link: nothing is fetched', b.fetched.length === 0);
}

// ---------- 1.5.65: a link from earlier in the chat ----------
check('"the github page i told you about" points back at a link', refersToLink('check out the github page i told you about now'));
check('"that link" and "the repo" do too', refersToLink('what does that link say?') && refersToLink('look at the repo'));
check('a plain chat does not', !refersToLink('hi Bob, how are you?') && !refersToLink('make me a picture of a fox'));
const history = [{ role: 'user', content: 'Check out github.com/MouseWurX/Bob', text: 'Check out github.com/MouseWurX/Bob' }, { role: 'assistant', content: 'Will do.' }];
const runWith = async (b, prior, text) => { await b.brain.runOn(prior.map((m) => ({ ...m })), text, () => {}, new AbortController().signal, [], null, 's2'); };
{
  const b = make(true);
  await runWith(b, history, 'check out the github page i told you about now');
  check('web on: "the page I told you about" opens the link from earlier', b.fetched[0] === 'https://github.com/MouseWurX/Bob' && b.seen.length === 1, JSON.stringify(b.fetched));
}
{
  const b = make(false);
  await runWith(b, history, 'check out the github page i told you about now');
  check('web off: nothing from earlier is opened either', b.fetched.length === 0);
}
{
  // No pointing-back words, the brain refuses: the earlier link is opened and he gets one more go.
  const b = make(true);
  await runWith(b, history, 'so what is it?');
  check('a refusal with a link from earlier: the page is opened and he answers on the second go', b.fetched.length === 1 && b.seen.length === 2, `fetched=${b.fetched.length} calls=${b.seen.length}`);
}
{
  const b = make(false);
  await runWith(b, history, 'so what is it?');
  check('web off: a refusal never opens a page', b.fetched.length === 0);
}

// ---------- 1.5.69: with the Quick brain on the processor, a link goes to the main Brain ----------
{
  const { linkTurn } = await import('../src/web.js');
  check('a message with a link is a link turn', linkTurn('what is on https://github.com/MouseWurX/Bob ?'));
  check('"that page" is a link turn only with a link in the last few messages', linkTurn('what does that page say?', [{ role: 'user', content: 'see github.com/MouseWurX/Bob' }]) && !linkTurn('what does that page say?', [{ role: 'user', content: 'hello' }]));
  check('a plain message is not', !linkTurn('hi Bob'));
  const quick = (extra) => {
    const b = make(true);
    Object.assign(b.brain.cfg, { quickOnCpu: true, models: { bob: 'qwen3.6-35b-a3b' }, sessionBrains: { small: 'qwen3-4b:latest' } }, extra);
    const calls = [];
    const inner = b.brain.engine.chat;
    b.brain.engine.chat = async (o) => { calls.push({ model: o.model, cpu: o.cpu, think: o.think }); return inner(o); };
    b.brain.engine.isLoaded = async () => false; b.brain.engine.estimateLoad = async () => 40;
    return { ...b, calls };
  };
  const a = quick();
  const evs = await run(a, 'what is on https://github.com/MouseWurX/Bob ?');
  check('Quick brain on the processor + a link: the main Brain answers, on the card, without thinking first', a.calls[0]?.model === 'qwen3.6-35b-a3b' && a.calls[0].cpu === false && a.calls[0].think === false, JSON.stringify(a.calls));
  check('the chat says plainly that the main Brain takes it', evs.some((e) => e.type === 'announce' && /link in it, so my main Brain takes it/.test(e.text)));
  check('not loaded yet: the line says it is loading and about how long', evs.some((e) => e.type === 'announce' && /takes it \(loading it, about 40 seconds\)\.$/.test(e.text)), JSON.stringify(evs.filter((e) => e.type === 'announce')));
  const l = quick(); l.brain.engine.isLoaded = async () => true;
  const levs = await run(l, 'what is on https://github.com/MouseWurX/Bob ?');
  check('already loaded: no bracket', levs.some((e) => e.type === 'announce' && e.text === 'This one has a link in it, so my main Brain takes it.'));
  check('the page is still opened first', a.fetched.length === 1);
  const b = quick();
  await run(b, 'hi Bob');
  check('no link: the Quick brain answers on the processor as before', b.calls[0]?.model === 'qwen3-4b:latest' && b.calls[0].cpu === true, JSON.stringify(b.calls));
  const g = quick({ session: 'light' });
  const gevs = await run(g, 'what is on https://github.com/MouseWurX/Bob ?');
  check('Gaming: a link stays on the Gaming brain, on the processor (never E4B, never the card)', g.calls.every((c) => c.cpu === true && !/e4b|qwen3\.6/i.test(c.model)) && !gevs.some((e) => e.type === 'announce' && /main Brain/.test(e.text)), JSON.stringify(g.calls));
  const off = quick({ webSearch: false });
  await run(off, 'what is on https://github.com/MouseWurX/Bob ?');
  check('web search off: no swap (the page can\'t be opened anyway)', off.calls[0]?.model === 'qwen3-4b:latest');
  const n = quick({ quickOnCpu: false, models: { bob: 'qwen3.6-35b-a3b' } });
  await run(n, 'what is on https://github.com/MouseWurX/Bob ?');
  check('switch off: the main Brain answered anyway, no announcement needed', n.calls[0]?.model === 'qwen3.6-35b-a3b');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
