// 1.5.53: "Bob's thinking", the small window on top that shows what's going on in Bob's brain. Checks that his
// thinking reaches it from both engines, only while a window is open (so it costs nothing otherwise), in batches,
// that the main chat never gets it, and that the window, the button and Help are all there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Ollama } from '../src/ollama.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { Brain, thinkStream } from '../src/brain.js';
import { brainsLine, toolLine, esc, thinkLabel } from '../public/mind-lines.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-mind-'));
const realFetch = globalThis.fetch;

// ---- both engines hand the thinking over, apart from the answer ----
{
  globalThis.fetch = async () => new Response('{"message":{"thinking":"hmm, "}}\n{"message":{"thinking":"let me see"}}\n{"message":{"content":"Hi!"},"done":true}\n');
  const ol = new Ollama({ ollamaUrl: 'http://127.0.0.1:1', dataDir: tmp });
  ol.show = async () => ({ capabilities: ['completion', 'thinking'] });
  let thought = '', said = '';
  const r = await ol.chat({ model: 'gemma4:26b', messages: [{ role: 'user', content: 'x' }], onThink: (t) => { thought += t; }, onToken: (t) => { said += t; } });
  check('Ollama: thinking goes to onThink', thought === 'hmm, let me see', thought);
  check('Ollama: the answer stays the answer', said === 'Hi!' && r.content === 'Hi!');
  const r2 = await ol.chat({ model: 'gemma4:26b', messages: [{ role: 'user', content: 'x' }] });
  check('Ollama: no onThink, nothing breaks', r2.content === 'Hi!');

  globalThis.fetch = async () => new Response('data: {"choices":[{"delta":{"reasoning_content":"step one. "}}]}\n\ndata: {"choices":[{"delta":{"reasoning_content":"step two."}}]}\n\ndata: {"choices":[{"delta":{"content":"Done."}}]}\n\ndata: [DONE]\n\n');
  const lc = new LlamaCpp({ agentDir: tmp, dataDir: tmp, llamacpp: {} });
  thought = ''; said = '';
  const r3 = await lc.chatOnce({ model: 'gemma4:26b', messages: [{ role: 'user', content: 'x' }], onThink: (t) => { thought += t; }, onToken: (t) => { said += t; } });
  check('llama.cpp: reasoning goes to onThink', thought === 'step one. step two.', thought);
  check('llama.cpp: the answer stays the answer', said === 'Done.' && r3.content === 'Done.');
  // With a thinking budget (Medium), the thinking still shows.
  thought = '';
  await lc.chatOnce({ model: 'gemma4:26b', messages: [{ role: 'user', content: 'x' }], think: 'medium', onThink: (t) => { thought += t; } });
  check('llama.cpp at Medium (thinking budget): thinking still shows', thought === 'step one. step two.', thought);
  globalThis.fetch = realFetch;
}

// ---- batches: a few times a second, never token by token, nothing lost ----
{
  const out = [];
  const s = thinkStream((ev) => out.push(ev), 'bob', 'm', 30);
  for (const w of ['a', 'b', 'c']) s.push(w);
  check('thinking waits for its batch', !out.some((e) => e.type === 'think'));
  check('the first thought starts the box', out.length === 1 && out[0].type === 'think-start' && out[0].who === 'bob');
  await new Promise((r) => setTimeout(r, 60));
  check('one batch for many pieces', out.length === 2 && out[1].text === 'abc' && out[1].type === 'think', JSON.stringify(out));
  s.push('d'); s.flush();
  check('flush sends what is left at once, without a second box', out.length === 3 && out[2].text === 'd');
  s.flush();
  check('an empty flush sends nothing', out.length === 3);
  const none = [];
  thinkStream((ev) => none.push(ev), 'bob', 'm').flush();
  check('a reply with no thinking leaves no empty box', none.length === 0);
}

// ---- Bob passes thinking along only while a window is open ----
{
  const dataDir = path.join(tmp, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
  const cfg = { agentDir: tmp, innDir: path.join(tmp, 'inn'), dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [], readOnlyRoots: [], userName: 'Sam', models: { bob: 'gemma4:e4b' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
  const brain = new Brain(cfg, () => {});
  clearInterval(brain.reminderTimer);
  let got = null;
  brain.engine = { chat: async (opts) => { got = opts; opts.onThink?.('thinking hard'); return { role: 'assistant', content: 'ok' }; }, isLoaded: async () => true };
  const evs = [];
  const emit = (ev) => evs.push(ev);
  await brain.chatSafe({ model: 'gemma4:26b', messages: [] }, { emit });
  check('no window open: no onThink, no events (costs nothing)', !got.onThink && !evs.length, JSON.stringify(evs));
  let open = 1;
  brain.mindWatchers = () => open;
  await brain.chatSafe({ model: 'gemma4:26b', messages: [] }, { emit, who: 'reviewer' });
  check('window open: a thinking block starts, named by brain and copy', evs[0]?.type === 'think-start' && evs[0].who === 'reviewer' && evs[0].model === 'gemma4:26b', JSON.stringify(evs));
  check('window open: the thinking arrives when the reply ends', evs.some((e) => e.type === 'think' && e.text === 'thinking hard'), JSON.stringify(evs));
  evs.length = 0; open = 0;
  await brain.chatSafe({ model: 'gemma4:26b', messages: [] }, { emit });
  check('window closed again: stops', !evs.length);
  // A brain that dropped out mid-answer: the retry still streams to the window.
  open = 1; evs.length = 0; let calls = 0;
  brain.ensureModel = async (m) => m;
  brain.engine = { chat: async (opts) => { if (!calls++) throw new Error('fetch failed'); opts.onThink?.('again'); return { role: 'assistant', content: 'ok' }; }, isLoaded: async () => false };
  await brain.chatSafe({ model: 'gemma4:26b', messages: [] }, { emit });
  check('a retried reply still shows its thinking', evs.some((e) => e.type === 'think' && e.text === 'again'), JSON.stringify(evs));
}

// ---- the server sends thinking only to the thinking window ----
{
  const s = read('src/server.js');
  check('server: thinking goes only to windows that asked (?mind=1)', /ev\?\.type === 'think' \|\| ev\?\.type === 'think-start' \? mindClients : clients/.test(s) && /searchParams\.get\('mind'\) === '1'/.test(s));
  check('server: a closed window is forgotten', /mindClients\.delete\(res\)/.test(s));
  check('server: Bob knows whether a window is open', /brain\.mindWatchers = \(\) => mindClients\.size/.test(s));
}

// ---- the window ----
{
  check('header names every brain and where it sits', brainsLine({ models: [{ label: 'Gemma 4 26B', onCard: true, chat: true }, { label: 'Gemma 4 E4B', beside: true, onCard: false }] }) === 'Loaded: Gemma 4 26B (chat brain) on the graphics card · Gemma 4 E4B (beside) on the processor');
  check('header when nothing is loaded', brainsLine({ models: [] }) === 'Loaded: nothing (memory freed)');
  check('header shows the picture model too', /picture model on the graphics card \(busy\)/.test(brainsLine({ models: [], picture: { state: 'busy' } })));
  check('thinking label: Bob and his brain by name', thinkLabel({ who: 'bob', label: 'Qwen 3.8 27B', model: 'qwen3.8:27b' }) === '💭 Bob thinking on Qwen 3.8 27B');
  check('thinking label: a copy by name and job, like the Moot line', thinkLabel({ who: 'reviewer', label: 'GPT-OSS 20B' }, { reviewer: 'Bobcat' }) === '💭 Bobcat (reviewer) thinking on GPT-OSS 20B');
  check('thinking label: a copy with no name yet', thinkLabel({ who: 'tinker', label: 'Qwen3 Coder 30B' }) === "💭 Bob's coding copy thinking on Qwen3 Coder 30B");
  check('server names the brain for the window', /think-start' && ev\.model\) ev = \{ \.\.\.ev, label: friendlyName\(ev\.model\) \}/.test(read('src/server.js')));
  check('thinking text in the normal font, wrapping; tool steps in monospace', /\.mind-think \.text \{ white-space: pre-wrap; overflow-wrap: anywhere; color: var\(--text\); \}/.test(read('public/mind.css')) && /\.mind-tool \{ font-family: var\(--mono\)/.test(read('public/mind.css')));
  check('a note Bob keeps reads as a note to self', toolLine({ name: 'remember', summary: 'remember: likes tea' })[0] === '📝 Note to self: likes tea');
  check('other tools read as steps', toolLine({ name: 'read_file', summary: 'read_file: a.txt' })[0] === '🔧 read_file: a.txt');
  check('hat tool lines are left to the hat line', toolLine({ name: 'x', summary: 'hat: tinker' }) === null);
  check('text is escaped', esc('<b>&"') === '&lt;b&gt;&amp;&quot;');
  const html = read('public/mind.html'), js = read('public/mind.js');
  check('window page has its parts', ['mindNow', 'mindBrains', 'mindLog', 'mindFollow', 'mindClear', '/mind.js', '/mind.css'].every((x) => html.includes(x)));
  check('window listens with ?mind=1', js.includes("new EventSource('/api/events?mind=1')"));
  check('window shows moots plainly', js.includes('🛰 Moot: Bob calls in'));
  check('window keeps itself small (line and text caps)', /MAX_LINES = \d+/.test(js) && /MAX_THINK = \d+/.test(js));
  check('thinking is shown as text, never as HTML', /t\.textContent = s/.test(js) && !/t\.innerHTML/.test(js));
}

// ---- Bob.exe opens it as its own small window on top; the chat has the button ----
{
  const m = read('electron/main.cjs');
  check('Bob.exe lets only /mind.html open as a window', /url === base \+ '\/mind\.html'/.test(m));
  check('it stays on top', /setAlwaysOnTop\(true, 'floating'\)/.test(m) && /alwaysOnTop: true/.test(m));
  check('one at a time: pressing again brings it to the front', /if \(mindWin\) \{ mindWin\.show\(\); mindWin\.focus\(\); return \{ action: 'deny' \}; \}/.test(m));
  check('closing Bob closes it too', /if \(mindWin\) mindWin\.close\(\)/.test(m));
  check('it stays sandboxed like Bob\'s window', /mindOptions[\s\S]*sandbox: true[\s\S]*nodeIntegration: false/.test(m));
  const idx = read('public/index.html'), app = read('public/app.js');
  check('chat bar has the button', idx.includes('id="mindBtn"') && idx.includes("💭 Bob's thinking"));
  check('button opens the window', app.includes("window.open('/mind.html', 'bob-mind'"));
}

// ---- Help in Bob's voice, the glossary and the FAQ ----
{
  const e = HELP.find((h) => h.id === 'mind');
  check('Help has a section for it', e && /💭 Bob's thinking/.test(e.html) && /Follow along/.test(e.html) && /Clear/.test(e.html));
  check('Help is in Bob\'s voice (first person)', e && /\bmy\b|\bI\b/.test(e.html));
  check('Help is honest about Low effort and saving', e && /Low effort\) replies skip the thinking/.test(e.html) && /none of it is saved/.test(e.html));
  check('FAQ has it', HELP.some((h) => h.id === 'faq-mind' && h.group === 'FAQ'));
  check('glossary has it', /Thinking \(Bob's thinking window\)/.test(HELP.find((h) => h.id === 'glossary').html));
  check('settings inventory lists it', /Bob's thinking/.test(read('docs/SETTINGS-INVENTORY.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
