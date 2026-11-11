// Let Bob fix his own messages (src/edit-own.js): off unless turned on, only his own recent words in the chat he's in,
// the first wording kept, the window, Discord DMs, Telegram and the phone told, and Help, glossary and FAQ there.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Brain } from '../src/brain.js';
import { CORE } from '../src/toolbox.js';
import { mergeSettings } from '../src/config.js';
import { editOwnOn, ownMessages, applyEdit, editOwnTool, LOOK_BACK } from '../src/edit-own.js';
import { DiscordBridge, DM_SESSION } from '../src/discord.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 3000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---------- The switch ----------
check('off unless turned on', !editOwnOn({}) && !editOwnOn({ editOwn: 'yes' }) && editOwnOn({ editOwn: true }));
check('only true turns it on when saved', mergeSettings({}, { editOwn: 'true' }).editOwn === false && mergeSettings({}, { editOwn: true }).editOwn === true);
check('the tool is in the core list (hidden while off)', CORE.includes('edit_my_message'));

// ---------- Which messages ----------
const chat = () => [
  { role: 'user', content: 'how big is the moon?', id: 'u1' },
  { role: 'assistant', content: 'About 3,474 km across.', id: 'a1' },
  { role: 'user', content: 'and the sun?', id: 'u2' },
  { role: 'assistant', content: 'Working on it: step 1 of 3.', id: 'a2', media: [{ type: 'image', url: '/images/sun.png' }] },
  { role: 'system', content: 'note', hidden: true },
  { role: 'assistant', content: '', correction: 'x', failed: true },
  { role: 'assistant', content: 'Let me fix that.', tool_calls: [{ function: { name: 'edit_my_message', arguments: {} } }] }
];
{
  const own = ownMessages(chat());
  check('only his own spoken words, newest first, not the step calling the tool', own.map((m) => m.id).join() === 'a2,a1', own.map((m) => m.id).join());
  const many = Array.from({ length: 40 }, (_, i) => ({ role: 'assistant', content: `line ${i}` }));
  check(`at most the last ${LOOK_BACK}`, ownMessages(many).length === LOOK_BACK && ownMessages(many)[0].content === 'line 39');
}

// ---------- The change ----------
{
  const msgs = chat();
  const r = applyEdit(msgs, { find: 'step 1 of 3', replace: 'step 2 of 3' }, 1000);
  check('find and replace changes only those words', !r.error && msgs[3].content === 'Working on it: step 2 of 3.', r.error);
  check('the first wording is kept, with the time and a count', msgs[3].was === 'Working on it: step 1 of 3.' && msgs[3].edited === 1000 && msgs[3].edits === 1);
  check('pictures and files he made stay as they were', msgs[3].media.length === 1 && msgs[3].media[0].url === '/images/sun.png');
  applyEdit(msgs, { back: 1, text: 'Done: all 3 steps.' }, 2000);
  check('a second change keeps the very first wording', msgs[3].content === 'Done: all 3 steps.' && msgs[3].was === 'Working on it: step 1 of 3.' && msgs[3].edits === 2);
  applyEdit(msgs, { back: 2, find: '3,474', replace: '3,475' });
  check('back picks an older message', msgs[1].content === 'About 3,475 km across.');
  check('case-insensitive find works when the exact words don\'t', !applyEdit(msgs, { find: 'about 3,475 KM', replace: 'Roughly 3,475 km' }).error && msgs[1].content === 'Roughly 3,475 km across.');
  check('never the user\'s messages', applyEdit(msgs, { find: 'how big is the moon' }).error && msgs[0].content === 'how big is the moon?');
  check('never to nothing', /can't be changed to nothing/.test(applyEdit(msgs, { back: 1, text: '   ' }).error || 'x') || /Say what to change/.test(applyEdit(msgs, { back: 1, text: '   ' }).error));
  check('never emptied by find and replace', /nothing/.test(applyEdit(msgs, { find: 'Done: all 3 steps.', replace: '' }).error || ''));
  check('back out of range is refused', /whole number/.test(applyEdit(msgs, { back: 9, text: 'x' }).error || ''));
  check('nothing asked: refused', /Say what to change/.test(applyEdit(msgs, {}).error || ''));
  check('same words: nothing changed', /already says/.test(applyEdit(msgs, { back: 1, text: 'Done: all 3 steps.' }).error || ''));
  const fresh = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'Hello there' }];
  applyEdit(fresh, { text: 'Hello!' }, 5);
  check('a message from this very turn gets an id when changed', typeof fresh[1].id === 'string' && fresh[1].id.length === 8 && fresh[1].at === 5);
  check('no earlier message: refused', /no earlier message/.test(applyEdit([{ role: 'user', content: 'hi' }], { text: 'x' }).error || ''));
}

// ---------- The tool ----------
{
  const evs = [];
  const brain = { cfg: {}, log: () => {} };
  const tool = editOwnTool(brain);
  const msgs = chat();
  check('the tool says the switch is off while it is', /is off/.test(await tool.run({ find: 'step 1', replace: 'step 2' }, { msgs, emit: (e) => evs.push(e) })) && msgs[3].content === 'Working on it: step 1 of 3.');
  brain.cfg.editOwn = true;
  check('never for a job from Discord or another Bob', /not for this job/.test(await tool.run({ find: 'step 1', replace: 'step 2' }, { msgs, emit: (e) => evs.push(e), job: { guest: { from: 'Discord', public: true } } })));
  const out = await tool.run({ find: 'step 1', replace: 'step 2' }, { msgs, emit: (e) => evs.push(e) });
  check('on: changed, and Bob is told not to repeat it', /Changed/.test(out) && /Don't repeat the fix/.test(out));
  const ev = evs.find((e) => e.type === 'edited');
  check('the window is told: id, new words, the words before and the first wording', ev?.id === 'a2' && ev.text === 'Working on it: step 2 of 3.' && ev.before === 'Working on it: step 1 of 3.' && ev.was === 'Working on it: step 1 of 3.');
  check('errors come back as Error lines', /^Error:/.test(await tool.run({ find: 'not there' }, { msgs, emit: () => {} })));
}

// ---------- A real turn through the queue ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-edit-own-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const seen = [];
let script = [];
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), messages }); return script.shift() || { role: 'assistant', content: 'done' }; },
  unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const run = async (text) => { const { jobId } = brain.enqueue('main', text); await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state)); };
{
  script = [{ role: 'assistant', content: 'The moon is about 3,747 km across.' }];
  await run('how big is the moon?');
  check('off: the tool isn\'t offered', seen.length && !seen.at(-1).names.includes('edit_my_message'));
  check('off: no ids sent ahead', !events.some((e) => e.type === 'said'));
  cfg.editOwn = true;
  script = [call('edit_my_message', { find: '3,747', replace: '3,474' }), { role: 'assistant', content: 'Fixed that above.' }];
  await run('are you sure about that number?');
  check('on: the tool is offered', seen.at(-2)?.names.includes('edit_my_message'));
  const msgs = brain.session('main');
  const moon = msgs.find((m) => m.role === 'assistant' && /moon/.test(m.content));
  check('the earlier message is changed in the chat', moon?.content === 'The moon is about 3,474 km across.' && moon.was === 'The moon is about 3,747 km across.', moon?.content);
  check('saved to disk too', JSON.parse(fs.readFileSync(path.join(dataDir, 'sessions', 'main.json'), 'utf8')).some((m) => m.content === 'The moon is about 3,474 km across.' && m.edited));
  const h = brain.history('main').find((m) => m.role === 'assistant' && /moon/.test(m.content));
  check('history carries edited and the first wording for the window', h?.edited > 0 && h.was === 'The moon is about 3,747 km across.');
  check('the window got the edit with the message id', events.some((e) => e.type === 'edited' && e.id === moon.id && e.sessionId === 'main'));
  check('what he says gets its id as he says it (on)', events.some((e) => e.type === 'said' && e.id === msgs.find((m) => m.content === 'Fixed that above.')?.id));
  check('only one new reply bubble of words this turn', msgs.filter((m) => m.role === 'assistant' && !m.tool_calls && m.content).length === 2);
}

// ---------- Discord DMs ----------
{
  const sent = [];
  const b = Object.create(DiscordBridge.prototype);
  Object.assign(b, { running: true, turns: new Map(), cfg: { discord: { dmChannel: '123456789012345678' } }, log: () => {} });
  b.settings = () => ({ dmEnabled: true, ownerId: '223456789012345678' });
  let n = 0;
  b.rest = async (method, route, body) => { sent.push({ method, route, body }); return method === 'POST' ? { id: String(900 + n++) } : null; };
  b.watch({ type: 'token', turnId: 't1', sessionId: DM_SESSION, text: 'Step 1 of 3.' });
  b.watch({ type: 'said', turnId: 't1', sessionId: DM_SESSION, id: 'm1' });
  b.watch({ type: 'done', turnId: 't1', sessionId: DM_SESSION });
  await until(() => b.dmSent?.has('m1'));
  check('a one-message reply is sent as one DM and remembered', sent.length === 1 && sent[0].body.content === 'Step 1 of 3.' && b.dmSent?.get('m1')?.id === '900');
  b.watch({ type: 'edited', turnId: 't2', sessionId: DM_SESSION, id: 'm1', before: 'Step 1 of 3.', text: 'Step 2 of 3.' });
  await until(() => sent.length === 2);
  check('a fix to it changes that DM, no new DM', sent[1]?.method === 'PATCH' && sent[1].route === '/channels/123456789012345678/messages/900' && sent[1].body.content === 'Step 2 of 3.');
  b.watch({ type: 'token', turnId: 't3', sessionId: DM_SESSION, text: 'It is 3,747 km.' });
  b.watch({ type: 'edited', turnId: 't3', sessionId: DM_SESSION, id: 'm9', before: 'It is 3,747 km.', text: 'It is 3,474 km.' });
  b.watch({ type: 'done', turnId: 't3', sessionId: DM_SESSION });
  await until(() => sent.length === 3);
  check('fixed before it was sent: only the fixed words go', sent[2]?.body.content === 'It is 3,474 km.' && sent.length === 3);
  b.watch({ type: 'edited', turnId: 't4', sessionId: DM_SESSION, id: 'unknown', before: 'old', text: 'new words' });
  await until(() => sent.length === 4);
  check('otherwise one short "Fixed an earlier message" DM', /Fixed an earlier message/.test(sent[3]?.body.content || '') && /new words/.test(sent[3].body.content));
}

// ---------- The window, Telegram, the phone, Settings, Help ----------
{
  const app = read('public/app.js');
  check('the window marks the bubble with its id as he says it', /case 'said':/.test(app) && /dataset\.mid = /.test(app));
  check('the window redraws a changed message in place, with "edited" to show what it said first', /case 'edited': editedMsg\(ev\)/.test(app) && /First said:/.test(app) && /aria-expanded/.test(app));
  check('a reloaded chat shows "edited" too', /if \(m\.edited\) markEdited\(el, m\.was\)/.test(app));
  check('no extra tool line for an edit', /ev\.name !== 'edit_my_message'/.test(app));
  check('Telegram gets the fix', /case 'edited':/.test(read('src/telegram.js')));
  check('the phone app gets the fix', /ev\.type === 'edited'/.test(read('android/app/src/main/assets/www/phone.js')));
  const cellar = read('public/cellar.js');
  check('the switch is in How Bob works, off unless turned on', /sswitch\('editOwn', settings\.editOwn === true, 'Let Bob fix his own messages', 'Off unless you turn it on/.test(cellar));
  const server = read('src/server.js');
  check('the server saves and shows it', /typeof b\.editOwn === 'boolean'/.test(server) && /editOwn: cfg\.editOwn === true/.test(server));
  check('Bob can read the setting in his own Help', /Let Bob fix his own messages/.test(read('src/self-help.js')));
  const entry = HELP.find((e) => e.id === 'edit-own'), faq = HELP.find((e) => e.id === 'faq-edit-own'), gl = HELP.find((e) => e.id === 'glossary');
  check('Help in Bob\'s voice', entry && /I change my earlier message/.test(entry.html) && /Windows, Mac, Linux and the Android app/.test(entry.html));
  check('an FAQ', faq?.group === 'FAQ' && /\?$/.test(faq.title));
  check('a glossary entry', /<dt>Edited<\/dt>/.test(gl.html));
  check('in the settings inventory', /Let Bob fix his own messages/.test(read('docs/SETTINGS-INVENTORY.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
