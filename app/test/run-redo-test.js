// Try again and Edit (src/redo.js): off unless turned on, Try again keeps your message and takes back the answer, Edit
// changes your words, earlier versions are kept, a busy chat can't be changed, the brain never sees your message twice,
// and the window, the Android app, Settings, Help, glossary and FAQ have it.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { mergeSettings } from '../src/config.js';
import { redoOn, rewind, redo, chatBusy, KEEP_VERSIONS, REDO_NOTE, EDIT_NOTE } from '../src/redo.js';
import { HELP } from '../public/help-content.js';
import { WANTS } from '../public/wants.js';
import { RELAY } from '../public/settings-link.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---------- The switch ----------
check('on unless turned off (owner\'s exception)', redoOn({}) && redoOn({ chatRedo: true }) && !redoOn({ chatRedo: false }));
check('only false turns it off when saved', mergeSettings({}, { chatRedo: 'no' }).chatRedo === true && mergeSettings({}, { chatRedo: false }).chatRedo === false);

// ---------- The change itself ----------
const chat = () => [
  { role: 'user', content: 'how big is the moon?', id: 'u1', at: 1 },
  { role: 'assistant', content: 'About 3,474 km across.', id: 'a1', at: 2 },
  { role: 'user', content: 'and the sun?', id: 'u2', at: 3 },
  { role: 'assistant', content: '', tool_calls: [{ function: { name: 'web_search', arguments: {} } }] },
  { role: 'tool', content: 'results' },
  { role: 'system', content: 'note', hidden: true },
  { role: 'assistant', content: 'About 1.39 million km.', id: 'a2', at: 4, media: [{ type: 'image', url: '/images/sun.png' }] }
];
{
  const msgs = chat();
  const r = rewind(msgs, {}, 100);
  check('Try again keeps your latest message and takes back what came after', !r.error && msgs.length === 3 && msgs[2].id === 'u2' && r.text === 'and the sun?' && !r.edited);
  const v = msgs[2].versions?.[0];
  check('the old answer is kept as an earlier version (spoken words only, things made too)', v?.text === 'and the sun?' && v.said.length === 1 && v.said[0].content === 'About 1.39 million km.' && v.said[0].media?.length === 1, JSON.stringify(v));
  check('your words aren\'t marked edited by Try again', !msgs[2].edited);
  for (let i = 0; i < 7; i++) { msgs.push({ role: 'assistant', content: `answer ${i}` }); rewind(msgs, {}, 200 + i); }
  check(`only the last ${KEEP_VERSIONS} versions are kept`, msgs[2].versions.length === KEEP_VERSIONS && msgs[2].versions.at(-1).said[0].content === 'answer 6');
}
{
  const msgs = chat();
  const r = rewind(msgs, { id: 'u1', text: 'how far is the moon?' }, 100);
  check('Edit on an earlier message: new words, everything after it taken back', !r.error && r.edited && msgs.length === 1 && msgs[0].content === 'how far is the moon?' && r.text === 'how far is the moon?');
  check('the first wording is kept, and it says edited', msgs[0].was === 'how big is the moon?' && msgs[0].edited === 100);
  const said = msgs[0].versions[0].said.map((m) => m.content);
  check('the whole rest of the chat is kept with the earlier version', said.join('|') === 'About 3,474 km across.|and the sun?|About 1.39 million km.', said.join('|'));
  rewind(msgs, { id: 'u1', text: 'how heavy is the moon?' }, 200);
  check('a second edit keeps the very first wording', msgs[0].was === 'how big is the moon?' && msgs[0].versions.length === 2 && msgs[0].versions[1].text === 'how far is the moon?');
}
{
  const msgs = chat();
  check('edit the latest message without an id (the phone app)', !rewind(msgs, { last: true, text: 'and Mars?' }).error && msgs.at(-1).content === 'and Mars?' && msgs.length === 3);
  check('same words: refused', /already says that/.test(rewind(chat(), { id: 'u2', text: 'and the sun?' }).error || ''));
  check('empty: refused', /empty/.test(rewind(chat(), { id: 'u2', text: '   ' }).error || ''));
  check('an id not in the recent part: refused', /older part/.test(rewind(chat(), { id: 'gone', text: 'x' }).error || ''));
  check('no message of yours: refused', /no message of yours/.test(rewind([{ role: 'assistant', content: 'hi' }]).error || ''));
  const pic = [{ role: 'user', content: 'draw her\n\n[Attached picture "cat.png"]', text: 'draw her', refs: ['abcd1234'], id: 'p1' }];
  rewind(pic, { id: 'p1', text: 'draw her in red' });
  check('pictures you attached stay attached and described', pic[0].content === 'draw her in red\n\n[Attached picture "cat.png"]' && pic[0].text === 'draw her in red' && pic[0].refs[0] === 'abcd1234');
  const hint = [{ role: 'user', content: 'hello\n\nold carry-on note', text: 'hello', id: 'h1' }];
  rewind(hint, { id: 'h1', text: 'hi there' });
  check('old notes added to your words are dropped with them', hint[0].content === 'hi there' && hint[0].text === undefined);
}

// ---------- Busy chats and the switch on the server ----------
{
  const fake = { cfg: { chatRedo: false }, turns: new Map(), queue: [], sess: chat(), session() { return this.sess; }, saved: 0, saveSession() { this.saved++; }, sent: [], broadcast(ev) { this.sent.push(ev); } };
  check('off: refused, nothing changed', /is off/.test(redo(fake, 'main').error || '') && fake.sess.length === 7);
  fake.cfg.chatRedo = true;
  fake.queue.push({ sessionId: 'main', state: 'waiting' });
  check('a waiting job in that chat: busy', chatBusy(fake, 'main') && /still on this chat/.test(redo(fake, 'main').error || ''));
  fake.queue = [{ sessionId: 'other', state: 'working' }];
  fake.turns.set('talk', { sessionId: 'main' });
  check('a running turn in that chat: busy', chatBusy(fake, 'main'));
  fake.turns.clear();
  check('another chat busy: this one is free', !chatBusy(fake, 'main'));
  const r = redo(fake, 'main');
  check('free: changed, saved and the other windows told', r.ok && r.id === 'u2' && fake.saved === 1 && fake.sent.some((e) => e.type === 'rewound' && e.sessionId === 'main' && e.id === 'u2'));
}

// ---------- A real turn through the queue ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-redo-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, chatRedo: true };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const seen = [];
let script = [];
brain.engine = { chat: async ({ messages }) => { seen.push(messages); return script.shift() || { role: 'assistant', content: 'done' }; },
  unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const run = async (text, extra) => { const { jobId } = brain.enqueue('main', text, [], 'low', extra); await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state)); };
{
  script = [{ role: 'assistant', content: 'Pluto is a dwarf planet.' }];
  await run('is pluto a planet?');
  const asked = events.find((e) => e.type === 'asked');
  const you = brain.session('main').find((m) => m.role === 'user');
  check('the window is told the id of what you sent', asked?.id && asked.id === you?.id);
  const r = redo(brain, 'main');
  check('Try again on a real chat', r.ok && r.text === 'is pluto a planet?' && !brain.session('main').some((m) => m.role === 'assistant'));
  script = [{ role: 'assistant', content: 'Since 2006 it counts as a dwarf planet.' }];
  await run(r.text, { redo: 'again' });
  const users = brain.session('main').filter((m) => m.role === 'user');
  check('your message is in the chat once, not twice', users.length === 1, String(users.length));
  const sent = seen.at(-1);
  check('the brain sees your message once, then the hidden Try again note', sent.filter((m) => m.role === 'user' && /pluto/.test(m.content)).length === 1 && sent.some((m) => m.role === 'system' && m.content === REDO_NOTE));
  check('the brain doesn\'t see the old answer', !sent.some((m) => /dwarf planet\.$/.test(m.content || '') && m.role === 'assistant'));
  const h = brain.history('main');
  check('history: the new answer, and the old one as an earlier version', h.some((m) => m.content === 'Since 2006 it counts as a dwarf planet.') && h.find((m) => m.role === 'user')?.versions?.[0]?.said?.[0]?.content === 'Pluto is a dwarf planet.');
  const e = redo(brain, 'main', { id: you.id, text: 'is pluto a moon?' });
  script = [{ role: 'assistant', content: 'No, Pluto has moons of its own.' }];
  await run(e.text, { redo: 'edit' });
  const now = brain.history('main');
  check('Edit: your new words, marked edited, both earlier versions kept', now[0].content === 'is pluto a moon?' && now[0].edited && now[0].was === 'is pluto a planet?' && now[0].versions.length === 2 && now.length === 2, JSON.stringify(now[0]));
  check('the brain gets the Edit note', seen.at(-1).some((m) => m.role === 'system' && m.content === EDIT_NOTE));
  check('saved to disk', JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions', 'main.json'), 'utf8').replace(/\r\n/g, '\n')).some((m) => m.role === 'user' && m.versions?.length === 2));
  check('an unknown redo value is ignored', !('redo' in (brain.queue.find((j) => j.id === brain.enqueue('x', 'hi', [], 'low', { redo: 'nonsense' }).jobId) || {})));
}

// ---------- The window, the phone, Settings, Help ----------
{
  const app = publicText('app.js');
  check('Try again (Bob\'s latest answer) and Edit (your messages) are in the ... menu', /msg === redoTarget\(\)\) list\.push\(\['redo', 'Try again'/.test(app) && /'edit-msg' : 'edit-bob', 'Edit'/.test(app) && /'Change what you said and send it again'/.test(app));
  check('they wait while Bob is busy', /const wait = busy \|\| redoing;/.test(app) && /drawRedo\(\); \/\/ Try again and Edit hide while Bob is busy/.test(app));
  check('the window sends the message again with redo after taking back', /\/api\/chat\/redo/.test(app) && /redo: r\.data\.edited \? 'edit' : 'again'/.test(app));
  check('earlier versions show under your message, also after a reload', /if \(m\.versions\?\.length\) markVersions\(el, m\.versions\)/.test(app));
  check('the edit box: Send again, Cancel, Esc and Enter', /Send again/.test(app) && /data-edit-cancel/.test(app) && /e\.key === 'Escape'/.test(app));
  check('the switch from the Settings window reaches the chat', RELAY.includes('bob-chat-redo') && /addEventListener\('bob-chat-redo'/.test(app));
  const server = read('src/server.js');
  check('the server: the redo route, the setting saved and shown', /p === '\/api\/chat\/redo'/.test(server) && /typeof b\.chatRedo === 'boolean'/.test(server) && /chatRedo: cfg\.chatRedo !== false/.test(server));
  const cellar = publicText('cellar.js');
  check('the switch is in How Bob works, on unless turned off', /sswitch\('chatRedo', settings\.chatRedo !== false, 'Try again, Edit and Delete', '/.test(cellar));
  check('not on the Do you want me to list (that list is for things that start off)', !WANTS.some((w) => w.key === 'chatRedo'));
  check('Bob can read the setting in his own Help', /Try again, Edit and Delete/.test(read('src/self-help.js')));
  const phone = read('android/app/src/main/assets/www/phone.js');
  check('the Android app: its own switch, on to start with', /redo: true[,}]/.test(phone) && /id="redo"/.test(read('android/app/src/main/assets/www/index.html')));
  check('the Android app: Try again and Edit, earlier versions kept, the Bob on the network told', /\['Try again', /.test(phone) && /\['Edit', /.test(phone) && /you\.versions = /.test(phone) && /\/api\/chat\/redo/.test(phone));
  const entry = HELP.find((e) => e.id === 'redo'), faq = HELP.find((e) => e.id === 'faq-redo'), gl = HELP.find((e) => e.id === 'glossary');
  check('Help in Bob\'s voice, with where it works', entry && /I take that answer back/.test(entry.html) && /Windows, Mac, Linux/.test(entry.html) && /Android app/.test(entry.html));
  check('an FAQ', faq?.group === 'FAQ' && /\?$/.test(faq.title));
  check('glossary entries', /<dt>Try again<\/dt>/.test(gl.html) && /<dt>Earlier version<\/dt>/.test(gl.html));
  const ph = read('android/app/src/main/assets/www/help.js');
  check('the Android app\'s Help, glossary and questions', /id: 'redo'/.test(ph) && /<dt>Try again<\/dt>/.test(ph) && /No Try again, Edit or Delete in the … menu/.test(ph));
  check('in the settings inventory', /Try again, Edit and Delete/.test(read('docs/SETTINGS-INVENTORY.md')));
  // Back to the newest message: the round down-arrow button, with breathing dots while Bob works.
  check('a go-to-bottom button in the chat window and the Android app', /id="toBottom"/.test(read('public/index.html')) && /id="to-bottom"/.test(read('android/app/src/main/assets/www/index.html')));
  check('scrolled up: new words don\'t pull you down; sending does', /if \(stick\) log\.scrollTop = log\.scrollHeight;/.test(app) && /stick = true; \/\/ sending takes you to the bottom/.test(app));
  check('the dots show only while Bob is busy, and breathe unless animations are off', /toggle\('working', !toBottom\.hidden && busy\)/.test(app) && /body\.still \.to-bottom \.tb-dots i \{ animation: none/.test(read('public/style.css')) && /prefers-reduced-motion: reduce\) \{ \.to-bottom/.test(read('android/app/src/main/assets/www/phone.css')));
  check('Help for it, here and on Android', HELP.some((e) => e.id === 'to-bottom') && /id: 'to-bottom'/.test(ph));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
