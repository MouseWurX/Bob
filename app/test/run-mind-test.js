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
import { DEFAULT_ORDER, applyOrder, moveId, dropBefore } from '../public/now-sections.js';
import { ORDERS, cleanOrder } from '../public/mind-view.js';
import { publicText } from './source-text.js';

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
  const html = read('public/mind.html'), js = read('public/mind.js'), view = read('public/mind-view.js'); // 1.5.138: the drawing lives in mind-view.js, shared with Now running
  check('window page has its parts', ['mindNow', 'mindBrains', 'mindLog', 'mindFollow', 'mindClear', '/mind.js', '/mind.css'].every((x) => html.includes(x)));
  check('window listens with ?mind=1', view.includes("new EventSource('/api/events?mind=1')") && js.includes('view.connect()'));
  check('window shows moots plainly', view.includes('🛰 Moot: Bob calls in'));
  check('window keeps itself small (line and text caps)', /MAX_LINES = \d+/.test(view) && /MAX_THINK = \d+/.test(view));
  check('thinking is shown as text, never as HTML', /t\.textContent = s/.test(view) && !/t\.innerHTML/.test(view));
}

// ---- 1.5.138: docked in Now running (Show here), and the sections in any order ----
{
  const idx = read('public/index.html'), lay = read('public/layout.js'), app = publicText('app.js'), css = read('public/style.css'), view = read('public/mind-view.js'), js = read('public/mind.js');
  check('Now running has a Bob\'s thinking section that opens with the [+] in its title, folded to start with', /<section id="nowMind" data-sec="mind"/.test(idx) && /id="mindDock" type="button" class="sec-fold" aria-expanded="false" aria-controls="mindDockBody" aria-label="Show Bob's thinking"[^>]*>\[\+\]</.test(idx));
  check('every other section of Now running folds to its title with [-] and [+] too, remembered in this window', /for \(const sec of document\.querySelectorAll\('#nowSections > section\[data-sec\]'\)\)/.test(lay) && /store\.set\('bob-now-folded'/.test(lay) && /aria-expanded/.test(lay) && /\.now-sections section\.folded > :not\(\.now-sec\) \{ display: none !important; \}/.test(css) && /<section data-sec="graph">/.test(idx) && /graph: 'Resource use over time'/.test(lay) && /showGraph \? '' : 'graph'/.test(lay));
  check('the section has the same parts as the window: a status line, the log, Follow along, Clear, plus Pop out', ['mindDockNow', 'mindDockLog', 'mindDockFollow', 'mindDockClear', 'mindDockPop'].every((x) => idx.includes(`id="${x}"`)) && idx.includes('<link rel="stylesheet" href="/mind.css">'));
  check('the dock and the window draw with one shared view', /createMindView\(\{ log: \$\('mindDockLog'\)/.test(lay) && /createMindView\(\{ log: \$\('mindLog'\)/.test(js) && /export function createMindView/.test(view));
  check('Bob listens only while Show here is on, the panel is in view and the window is visible (costs nothing otherwise)', /const on = docked && seen\('mind'\) && !document\.hidden;\s*if \(on\) mindView\.connect\(\); else mindView\.disconnect\(\);/.test(lay) && /function disconnect\(\) \{ if \(es\) \{ es\.close\(\); es = null; \} \}/.test(view) && /document\.addEventListener\('visibilitychange', mindListen\)/.test(lay));
  check('the choice is remembered in this window (bob-mind-dock), not in settings.json', /store\.get\('bob-mind-dock', '1'\) === '1'/.test(lay) && /store\.set\('bob-mind-dock'/.test(lay) && !/mindDock|mind-dock/.test(read('src/server.js')) && !/mindDock/.test(read('src/config.js')));
  check('with Show here on, the chat-bar button goes to the section (and says In Now running); off, it opens the window', /if \(layout\.mindDocked\(\)\) return layout\.showMind\(\);/.test(app) && app.includes("window.open('/mind.html', 'bob-mind'") && /id="mindBtnSt" hidden>In Now running</.test(idx) && /st\.hidden = !docked/.test(lay));
  check('Pop out still opens the window from the section', /\$\('mindDockPop'\)\.onclick = \(\) => \{ const w = window\.open\('\/mind\.html', 'bob-mind'/.test(lay));
  check('the log is a focusable, labelled, resizable box', /id="mindDockLog" class="mind-log" aria-live="off" tabindex="0" aria-label="Bob's thinking, newest at the bottom"/.test(idx) && /#mindDockLog \{ height: \d+px; min-height: \d+px; max-height: 70vh; resize: vertical; overflow: auto;/.test(css));
  check('every section has a grip with Move up / Move down, 32 px targets, and arrow keys', ['tasks', 'net', 'downloads', 'memory', 'graph', 'mind'].every((id) => idx.includes(`data-grip="${id}"`) && idx.includes(`data-move="-1" data-sec-id="${id}"`) && idx.includes(`data-move="1" data-sec-id="${id}"`)) && /\.sec-grip \{ min-width: 32px; min-height: 32px;/.test(css) && /moveSection\(g\.dataset\.grip, e\.key === 'ArrowUp' \? -1 : 1\)/.test(lay));
  check('a move is said out loud for screen readers and remembered (bob-now-order)', /id="nowOrderSay" class="sr-only" aria-live="polite"/.test(idx) && /say\.textContent = announce/.test(lay) && /store\.set\('bob-now-order', order\.join\(','\)\)/.test(lay));
  check('dragging a section never steals the drag of a task or download row', /const sec = g\.closest\('\[data-sec\]'\); sec\.draggable = true;/.test(lay) && /if \(!sec \|\| e\.target\.closest\('\.titem'\)\) return;/.test(lay));
  check('order helpers: unknown ids dropped, missing ones added, moves stop at the ends', applyOrder('memory,tasks,bogus').join() === 'memory,tasks,mind,net,downloads,graph' && applyOrder('').join() === DEFAULT_ORDER.join() && moveId(DEFAULT_ORDER, 'mind', -1).join() === DEFAULT_ORDER.join() && DEFAULT_ORDER[0] === 'mind' && moveId(DEFAULT_ORDER, 'graph', -1).join() === 'mind,tasks,net,downloads,graph,memory' && dropBefore(DEFAULT_ORDER, 'graph', 'tasks').join() === 'mind,graph,tasks,net,downloads,memory' && dropBefore(DEFAULT_ORDER, 'mind', null).join() === 'tasks,net,downloads,memory,graph,mind');
  check('High Contrast: the grip, the drop mark and the thinking box use system colours', /@media \(forced-colors: active\) \{\s*\.sec-grip:hover[^}]*border-color: CanvasText;[\s\S]*?\.mind-think \{ border-left-color: Highlight; \}/.test(css));
  check('the flash that points at the section is off with Animations off', /@media \(prefers-reduced-motion: reduce\) \{ \.now-sections > section\.flash \{ animation: none; \} \}/.test(css));
  // Order of the lines (the owner asked to sort them, and chose both the sections and the lines)
  check('an Order choice in the window and the section: newest at the bottom (default), newest at the top, Bob then his copies', ['mindOrder', 'mindDockOrder'].every((id, i) => new RegExp(`<select id="${id}" aria-label="Order of the lines"[^>]*><option value="time">Newest at the bottom</option><option value="newest">Newest at the top</option><option value="who">Bob, then his copies</option></select>`).test([read('public/mind.html'), idx][i])) && /order: \$\('mindOrder'\)/.test(js) && /order: \$\('mindDockOrder'\)/.test(lay));
  check('order helpers: only the three orders, time by default', cleanOrder('newest') === 'newest' && cleanOrder('who') === 'who' && cleanOrder('bogus') === 'time' && cleanOrder(null) === 'time' && ORDERS.join() === 'time,newest,who');
  check('newest at the top puts new lines first in the page (never column-reverse), and Follow along looks at the top', /const put = \(el\) => \(order === 'newest' \? log\.prepend\(el\) : log\.append\(el\)\);/.test(view) && !/column-reverse/.test(read('public/mind.css')) && /log\.scrollTop = order === 'newest' \? 0 : log\.scrollHeight/.test(view) && /order === 'newest' \? log\.scrollTop < 24 :/.test(view));
  check('by brain groups each line under who was thinking (Bob first, then his copies), kept with the line', /el\.dataset\.who = who; el\.style\.order = order === 'who'/.test(view) && /WHO_RANK = \{ bob: 0, reviewer: 1/.test(view) && /who = ev\.who \|\| 'bob'; place\(thinkEl\);/.test(view));
  check('the order is remembered per window and the log says its order to a screen reader', /localStorage\.setItem\('bob-mind-order', order\)/.test(view) && /log\.setAttribute\('aria-label', order === 'newest' \? 'Bob\\'s thinking, newest at the top'/.test(view));
  check('Help explains the [+] on the section, Pop out and the section order, in Bob\'s voice', (() => { const e = HELP.find((h) => h.id === 'mind'); return e && /Keep it in Now running instead/.test(e.html) && /set\('\[\+\] in the section\\'s title', 'Folded'/.test(read('public/help-content.js')) && /folds to its title the same way/.test(e.html) && /Pop out/.test(e.html) && /Put the sections in any order/.test(e.html) && /Move up/.test(e.html) && /I remember the order in this window of Bob/.test(e.html); })());
}

// ---- Bob.exe opens it as its own small window on top; the chat has the button ----
{
  const m = read('electron/main.cjs');
  check('Bob.exe lets only /mind.html open as a window', /url === base \+ '\/mind\.html'/.test(m));
  check('it stays on top', /setAlwaysOnTop\(true, 'floating'\)/.test(m) && /alwaysOnTop: true/.test(m));
  check('one at a time: pressing again brings it to the front', /if \(mindWin\) \{ mindWin\.show\(\); mindWin\.focus\(\); return \{ action: 'deny' \}; \}/.test(m));
  check('closing Bob closes it too', /if \(mindWin\) mindWin\.close\(\)/.test(m));
  check('it stays sandboxed like Bob\'s window', /mindOptions[\s\S]*sandbox: true[\s\S]*nodeIntegration: false/.test(m));
  const idx = read('public/index.html'), app = publicText('app.js');
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
  check('glossary has it', /Thinking first<\/dt><dd>[^<]*Bob's thinking shows it live/.test(HELP.find((h) => h.id === 'glossary').html));
  check('settings inventory lists it', /Bob's thinking/.test(read('docs/SETTINGS-INVENTORY.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
