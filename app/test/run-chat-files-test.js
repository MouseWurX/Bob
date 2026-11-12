// "Save chats as files and bring chats in" (Nov 2026, src/chat-files.js, public/topics.js): a chat saved as Markdown,
// JSON or PDF, and chats exported from ChatGPT, Claude or Open WebUI brought in as chats of their own. Off unless
// turned on. Made-up chats in a temporary folder only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { shareChat, shareScrubber, sharePageHtml } from '../src/chat-files.js';
import { fitLines, pictureLayout } from '../public/chat-share.js';
import { chatFilesOn, saveChat, toMarkdown, toJson, toPdf, pdfBytes, wrap, fileNameFor, lookAtFile, bringIn, importId, chatForSaving, MAX_IMPORT_BYTES } from '../src/chat-files.js';
import { writeChat, writeOlder, readChat, readOlder, chatInfo, chatIds, wholeChat, keepOlder } from '../src/chats.js';
import { conversationsOf, parseChat, parseOpenWebUi } from '../src/lab-build-read.js';
import { pdfText } from '../src/doc-text.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { WANTS } from '../public/wants.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-chatfiles-'));
const dataDir = path.join(tmp, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, chatFiles: true };
const T0 = Date.UTC(2026, 10, 5, 15, 0);

// ---------- Off unless turned on ----------
check('starts off, only true turns it on', !chatFilesOn({}) && !chatFilesOn({ chatFiles: 'yes' }) && chatFilesOn({ chatFiles: true }));
check('saved as a setting, cleaned to true or false', SETTING_KEYS.includes('chatFiles') && mergeSettings({}, { chatFiles: 'true' }).chatFiles === false && mergeSettings({}, { chatFiles: true }).chatFiles === true && !mergeSettings({}, {}).chatFiles);
check('on the Welcome list as an off-by-default switch', WANTS.some((w) => w.key === 'chatFiles' && w.setting === 'Save chats as files and bring chats in'));
const server = read('src/server.js');
check('the server saves the switch and refuses while off', server.includes("typeof b.chatFiles === 'boolean'") && (server.match(/if \(!chatFilesOn\(cfg\)\) return send\(res, 403/g) || []).length === 3);
check('bringing chats in is only on this replicant matrix itself', /\/api\/chats\/bring-in'\)\) \{\s*if \(!isLocal\)/.test(server));

// ---------- Saving ----------
writeOlder(cfg, 'chat-1', [{ id: 'a1', at: T0, role: 'user', content: 'What wood for a bench?' }, { id: 'a2', at: T0 + 60000, role: 'assistant', content: 'Oak or ash, both **hard** enough.' }]);
writeChat(cfg, 'chat-1', [
  { id: 'b1', at: T0 + 120000, role: 'user', content: 'and the finish? café “oil” 🙂', text: 'and the finish? café “oil” 🙂' },
  { id: 'b2', at: T0 + 130000, role: 'assistant', content: '', tool_calls: [{ function: { name: 'web_search' } }] },
  { role: 'tool', content: 'secret tool result' },
  { id: 'b3', at: T0 + 140000, role: 'assistant', content: 'Hardwax oil, two thin coats.', media: [{ kind: 'image', url: '/images/2026-11-05-bench.png' }] },
  { id: 'b4', at: T0 + 150000, role: 'user', content: '[forgotten]', forgotten: true }
]);
const c = chatForSaving(cfg, 'chat-1');
check('a saved chat has what was said, older part first, no tool work or forgotten lines', c.messages.length === 4 && c.messages[0].text === 'What wood for a bench?' && !JSON.stringify(c).includes('secret tool result') && !c.messages.some((m) => m.text === '[forgotten]'));
const md = toMarkdown(c, T0);
check('Markdown: title, who said it, when, every word and the picture name', md.startsWith('# What wood for a bench?') && /### You · 2026-11-0\d \d\d:\d\d/.test(md) && md.includes('### Bob') && md.includes('café “oil” 🙂') && md.includes('2026-11-05-bench.png'));
const js = JSON.parse(toJson(c, T0));
check('JSON: marked as a Bob chat, with times', js.bob === 'chat' && js.version === 1 && js.messages.length === 4 && js.messages[0].at === new Date(T0).toISOString());
check('a file name safe everywhere', fileNameFor({ title: 'a/b:c*?"<>| é' }, 'md', T0) === 'Bob chat - a b c e - 2026-11-05.md' && fileNameFor({ title: '' }, 'pdf', T0).endsWith('chat - 2026-11-05.pdf'));
check('saving a chat that isn\'t there gives nothing', saveChat(cfg, 'nope', 'md') === null && saveChat(cfg, 'chat-1', 'md').type.startsWith('text/markdown') && saveChat(cfg, 'chat-1', 'odd').name.endsWith('.md'));

// PDF: a real PDF whose table of contents points at its parts, with the words in it.
const pdf = toPdf(c, T0);
const s = pdf.toString('latin1');
check('PDF: starts and ends like a PDF', s.startsWith('%PDF-1.4') && s.trimEnd().endsWith('%%EOF'));
const xref = Number(s.match(/startxref\n(\d+)/)[1]);
const offs = [...s.slice(xref).matchAll(/^(\d{10}) 00000 n $/gm)].map((m) => Number(m[1]));
check('PDF: every part is where the table says', s.slice(xref).startsWith('xref') && offs.length > 4 && offs.every((o, i) => s.slice(o).startsWith(`${i + 1} 0 obj`)));
const lens = [...s.matchAll(/<< \/Length (\d+) >>\nstream\n/g)];
check('PDF: every page\'s length is right', lens.length >= 1 && lens.every((m) => s.slice(m.index + m[0].length + Number(m[1])).startsWith('\nendstream')));
const words = pdfText(pdf);
check('PDF: Bob\'s own PDF reader gets the words back', /What wood for a bench\?/.test(words) && /Hardwax oil, two thin coats\./.test(words) && /caf/.test(words), words.slice(0, 300));
check('PDF: Western letters and curly quotes kept, emoji left out, others "?"', Buffer.from(pdfBytes('café “x” 🙂 Ж')).equals(Buffer.from([0x63, 0x61, 0x66, 0xe9, 0x20, 0x93, 0x78, 0x94, 0x20, 0x20, 0x3f])));
check('PDF: long lines wrap and a huge word is cut', wrap('word '.repeat(200), 300, 10).length > 5 && wrap('x'.repeat(400), 300, 10).every((l) => l.length < 200));
const long = { title: 'Long', messages: Array.from({ length: 120 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', at: T0, text: `Line ${i} `.repeat(20) })) };
const lp = toPdf(long, T0).toString('latin1');
const pages = Number(lp.match(/\/Count (\d+)/)[1]);
check('PDF: a long chat runs onto more pages, numbered', pages > 3 && lp.includes(Buffer.from(pdfBytes(`1 of ${pages}`)).toString('hex')));

// ---------- Reading other assistants' exports ----------
const gpt = [{ title: 'Bench plans', conversation_id: 'g1', create_time: 1762300000, current_node: 'e', mapping: {
  root: { id: 'root', parent: null, message: null },
  a: { id: 'a', parent: 'root', message: { author: { role: 'system' }, content: { parts: ['sys'] }, metadata: { is_visually_hidden_from_conversation: true } } },
  b: { id: 'b', parent: 'a', message: { author: { role: 'user' }, content: { parts: ['How do I sand oak?'] }, create_time: 1762300001 } },
  c: { id: 'c', parent: 'b', message: { author: { role: 'assistant' }, content: { parts: ['Start at 120 grit.'] }, create_time: 1762300002 } },
  x: { id: 'x', parent: 'b', message: { author: { role: 'assistant' }, content: { parts: ['A branch you threw away.'] }, create_time: 1762300003 } },
  d: { id: 'd', parent: 'c', message: { author: { role: 'user' }, content: { parts: ['and then?'] }, create_time: 1762300004 } },
  e: { id: 'e', parent: 'd', message: { author: { role: 'assistant' }, content: { parts: ['180, then 220.'] }, create_time: 1762300005 } } } }];
const g = conversationsOf(JSON.stringify(gpt), 'conversations.json');
check('ChatGPT: one chat, its title, only the branch you last saw', g.length === 1 && g[0].source === 'chatgpt' && g[0].title === 'Bench plans' && g[0].turns.map((t) => t.text).join('|') === 'How do I sand oak?|Start at 120 grit.|and then?|180, then 220.' && g[0].turns[0].at === 1762300001000);
const claude = [{ uuid: 'c1', name: 'Week plan', created_at: '2026-11-01T10:00:00Z', chat_messages: [{ sender: 'human', text: 'Plan my week', created_at: '2026-11-01T10:00:00Z' }, { sender: 'assistant', text: '', content: [{ type: 'text', text: 'Monday: sand.' }, { type: 'tool_use', text: 'hidden' }] }] }, { uuid: 'c2', name: 'Empty', chat_messages: [] }];
const cl = conversationsOf(JSON.stringify(claude), 'conversations.json');
check('Claude: titles kept, tool parts and empty chats left out', cl.length === 1 && cl[0].source === 'claude' && cl[0].title === 'Week plan' && cl[0].turns[1].text === 'Monday: sand.');
const ow = [{ id: 'w1', title: 'Pi setup', created_at: 1762000000, chat: { title: 'Pi setup', messages: [], history: { currentId: 'm3', messages: {
  m1: { id: 'm1', parentId: null, role: 'user', content: 'Set up my Pi', timestamp: 1762000001 },
  m2: { id: 'm2', parentId: 'm1', role: 'assistant', content: 'Flash the card first.', timestamp: 1762000002 },
  m9: { id: 'm9', parentId: 'm1', role: 'assistant', content: 'Old regenerated answer.', timestamp: 1762000003 },
  m3: { id: 'm3', parentId: 'm2', role: 'user', content: 'Done.', timestamp: 1762000004 } } } } }];
const o = conversationsOf(JSON.stringify(ow), 'chat-export.json');
check('Open WebUI: title, the branch you last saw', o.length === 1 && o[0].source === 'openwebui' && o[0].title === 'Pi setup' && o[0].turns.map((t) => t.text).join('|') === 'Set up my Pi|Flash the card first.|Done.');
check('Open WebUI files make lessons in the Lab too', parseOpenWebUi(ow)?.length === 1 && parseChat(JSON.stringify(ow), 'x.json')?.length === 1);
const back = conversationsOf(toJson(c, T0), 'saved.json');
check('a chat Bob saved as JSON comes back the same', back.length === 1 && back[0].source === 'bob' && back[0].title === c.title && back[0].turns.length === 4 && back[0].turns[3].text === 'Hardwax oil, two thin coats.');
const backMd = conversationsOf(md, 'saved.md');
check('a chat Bob saved as Markdown comes back too', backMd?.length === 1 && backMd[0].turns.length === 4 && backMd[0].turns[0].role === 'user' && backMd[0].turns[1].text.includes('Oak or ash'));
check('a transcript with Name: lines is one chat', conversationsOf('Sam: hi there\nBot: hello, what are we making\nSam: a bench\nBot: oak then', 'log.txt')?.[0]?.turns.length === 4);
check('a jsonl file of chats, one per line', conversationsOf(gpt.map((x) => JSON.stringify(x)).join('\n') + '\n' + JSON.stringify(claude[0]), 'all.jsonl')?.length === 2);
check('a byte-order mark at the start is fine', conversationsOf('\uFEFF' + JSON.stringify(claude), 'c.json')?.length === 1);
check('anything else is not a chat', conversationsOf('{"hello": 1}', 'x.json') === null && conversationsOf('just some notes', 'x.md') === null && !lookAtFile(cfg, 'nope', 'x.txt').ok);

// ---------- Bringing chats in ----------
const big = JSON.stringify([...gpt, { title: 'Long one', conversation_id: 'g2', mapping: Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`n${i}`, { id: `n${i}`, message: { author: { role: i % 2 ? 'assistant' : 'user' }, content: { parts: [`message ${i}`] }, create_time: 1762400000 + i } }])) }]);
const look = lookAtFile(cfg, big, 'conversations.json');
check('looking lists the chats and keeps nothing yet', look.ok && look.chats.length === 2 && look.chats[0].title === 'Bench plans' && look.chats[0].from === 'ChatGPT' && look.chats[0].messages === 4 && !look.chats[0].here && chatIds(cfg).length === 1);
const r = bringIn(cfg, look.convs, [0, 1, 7], T0);
check('the ticked chats are brought in', r.done.length === 2 && chatIds(cfg).length === 3);
const id1 = importId(look.convs[0]), id2 = importId(look.convs[1]);
check('ids are safe and the same every time', /^in-chatgpt-[0-9a-f]{16}$/.test(id1) && importId(conversationsOf(big, 'c.json')[0]) === id1);
const info = chatInfo(cfg, id1);
check('it shows in Past chats with its own title, where it came from and its date', info.title === 'Bench plans' && info.from === 'chatgpt' && info.messages === 4 && info.lastTouched === 1762300005000);
check('a long chat: the last 40 are the recent part, the rest the older part', readChat(cfg, id2).length === 40 && readOlder(cfg, id2).length === 20 && chatInfo(cfg, id2).title === 'Long one' && wholeChat(cfg, id2)[0].content === 'message 0');
check('every message has an id and a time', readChat(cfg, id1).every((m) => /^[0-9a-f]{8}$/.test(m.id) && m.at > 0));
const again = lookAtFile(cfg, big, 'conversations.json');
const r2 = bringIn(cfg, again.convs, [0, 1], T0);
check('the same file twice makes no copies', again.chats.every((x) => x.here) && r2.done.length === 0 && r2.skipped.length === 2 && chatIds(cfg).length === 3);
// The title survives when the first message moves to the older part.
const msgs = readChat(cfg, id1);
keepOlder(cfg, id1, msgs.slice(0, 2)); writeChat(cfg, id1, msgs.slice(2));
check('the title stays when the start of the chat moves to the older part', chatInfo(cfg, id1).title === 'Bench plans' && chatInfo(cfg, id1).from === 'chatgpt');
check('a file over the limit is refused before reading (200 MB)', MAX_IMPORT_BYTES === 200 * 1024 * 1024 && server.includes('rawBody(req, MAX_IMPORT_BYTES)'));

// ---------- Sharing a chat ----------
const opts = { home: 'C:\\Users\\you', host: 'desk-pc', user: 'you', env: {} };
const scrub = shareScrubber({ userName: 'Sam', callMe: 'Sammy' }, ['Starfall'], opts);
check('names, the machine name and extra words go', scrub('Sammy said Sam built it on desk-pc for Starfall') === '[name] said [name] built it on the replicant matrix for [hidden]');
check('folders go, file names stay (spaces in Windows folders too)', scrub('C:\\Users\\you\\Documents\\plan.docx and C:\\My Projects\\Game 01\\bob.exe and D:\\x\\y.txt') === '…\\plan.docx and …\\bob.exe and …\\y.txt' && scrub('see /home/you/notes/a.txt, ~/b.md and /Users/x/c.png') === 'see …/a.txt, …/b.md and …/c.png' && scrub('\\\\nas\\share\\x.pdf') === '…\\x.pdf');
check('home network addresses, emails and keys go; web links and sums stay', scrub('at 172.16.4.9 and 172.31.0.2, mail sam@example.test, key hf_abcdefghijklmnopqrstuvwx') === 'at [home network address] and [home network address], mail [email], key [hidden]' && scrub('3/4 of https://github.com/a/b at 8.8.8.8') === '3/4 of https://github.com/a/b at 8.8.8.8');
writeChat(cfg, 'chat-share', [{ id: 's1', at: T0, role: 'user', content: 'Sam here, open C:\\Users\\you\\Desktop\\Starfall notes.txt <script>alert(1)</script>' }, { id: 's2', at: T0 + 1, role: 'assistant', content: 'Opened it, Sam.' }, { id: 's3', at: T0 + 2, role: 'user', content: 'thanks' }]);
const sh = shareChat({ ...cfg, userName: 'Sam' }, 'chat-share', { hide: ['Starfall'], scrubOpts: opts, now: T0 });
check('the share is tidied before the window sees it', sh && !/Sam\b|Users|Desktop|Starfall/.test(JSON.stringify(sh)) && sh.messages[0].text.includes('…\\[hidden] notes.txt') && sh.changed === 2 && sh.total === 3, JSON.stringify(sh?.messages));
check('the page is one file with no scripts, and the words are escaped', sh.html.startsWith('<!doctype html>') && !/<script/i.test(sh.html) && sh.html.includes('&lt;script&gt;') && sh.html.includes("default-src 'none'") && sh.html.includes('prefers-color-scheme: dark') && /\.html$/.test(sh.name));
check('only the last few messages, when asked', shareChat(cfg, 'chat-share', { last: 2, scrubOpts: opts }).messages.length === 2 && shareChat(cfg, 'nope', { scrubOpts: opts }) === null);
const measure = (t) => t.length * 8;
check('picture lines fit, a huge word is cut', fitLines('word '.repeat(100), 200, measure).every((l) => measure(l) <= 200) && fitLines('x'.repeat(100), 200, measure).length === 4);
const lay = pictureLayout({ title: 't', messages: Array.from({ length: 400 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', text: 'line '.repeat(60) })) }, measure);
check('a picture too tall keeps the newest messages and says so', lay.height <= 14000 && lay.left > 0 && lay.items.length + lay.left === 400 && lay.items[0].y >= 90);
check('Past chats has Share with a preview and two saves', ['data-share', 'Save as a page', 'Save as a picture', 'Also hide', 'sandbox srcdoc'].every((w) => read('public/topics.js').includes(w)) && read('src/server.js').includes("p === '/api/chats/share'"));

// ---------- The page and Help ----------
const topics = read('public/topics.js'), cellar = read('public/cellar.js');
check('Past chats has Save as Markdown, JSON and PDF links, Bring in chats and a Turn it on button', topics.includes('/api/chats/save?id=') && ['Markdown', 'JSON', 'PDF', 'Bring in chats…', 'Bring in the ticked chats', 'data-chatfileson', 'Tick all', 'Cancel'].every((w) => topics.includes(w)));
check('the file is sent as it is with the page\'s header', /fetch\('\/api\/chats\/look', \{ method: 'POST', headers: \{ 'content-type': 'application\/octet-stream', 'x-bob': '1'/.test(topics));
check('the switch is in Settings, How Bob works', cellar.includes("sswitch('chatFiles', settings.chatFiles === true, 'Save chats as files and bring chats in'"));
const help = HELP.find((e) => e.id === 'chat-files'), faq = HELP.find((e) => e.id === 'faq-chat-files'), gl = HELP.find((e) => e.id === 'glossary');
check('Help says how, for ChatGPT, Claude and Open WebUI, and where it works', help && ['ChatGPT', 'Claude', 'Open WebUI', 'Markdown', 'JSON', 'PDF', 'Windows, Mac, Linux', 'Android', 'off unless you turn it on', 'Share…', 'Save as a picture'].every((w) => help.html.includes(w)));
check('Bring in imports MAX_CHATS where it uses it (it was used without an import, so picking chats failed)', /import \{[^}]*\bMAX_CHATS\b[^}]*\} from '\.\/chat-files\.js'/.test(server) && server.includes('.slice(0, MAX_CHATS)'));
check('an FAQ and glossary words', faq && /\?$/.test(faq.title) && gl.html.includes('<dt>Bring in chats</dt>') && gl.html.includes('<dt>Export (a chat)</dt>') && gl.html.includes('<dt>Share (a chat)</dt>'));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
