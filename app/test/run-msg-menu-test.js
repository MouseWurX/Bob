// The "..." menu on a chat message (src/msg-menu.js): Copy always; Edit on Bob's message changes his words without
// sending anything; Delete takes your message out with Bob's answer to it, or just one answer of his; tool steps stay
// readable; the switch, a busy chat and the older part of a chat stop it; the window, Help, glossary and FAQ have it.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { changeBob, removeMsg, msgMenu } from '../src/msg-menu.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

const chat = () => [
  { role: 'user', content: 'how big is the moon?', id: 'u1', at: 1 },
  { role: 'assistant', content: 'About 3,747 km across.', id: 'a1', at: 2 },
  { role: 'user', content: 'and the sun?', id: 'u2', at: 3 },
  { role: 'assistant', content: 'Let me look.', id: 'a2', tool_calls: [{ id: 't1', function: { name: 'web_search', arguments: {} } }] },
  { role: 'tool', content: 'results', tool_call_id: 't1' },
  { role: 'assistant', content: 'About 1.39 million km.', id: 'a3', at: 4, media: [{ type: 'image', url: '/images/sun.png' }] },
  { role: 'user', content: 'thanks', id: 'u3', at: 5 }
];

// ---------- Edit on Bob's message ----------
{
  const msgs = chat();
  const r = changeBob(msgs, { id: 'a1', text: 'About 3,474 km across.\r\n' }, 100);
  check('Bob\'s words change, nothing else in the chat moves', !r.error && msgs.length === 7 && msgs[1].content === 'About 3,474 km across.');
  check('marked edited by you, with what he said first', msgs[1].edited === 100 && msgs[1].editedBy === 'you' && msgs[1].was === 'About 3,747 km across.' && msgs[1].edits === 1);
  changeBob(msgs, { id: 'a1', text: 'About 3,475 km.' }, 200);
  check('what he said first is kept through a second edit', msgs[1].was === 'About 3,747 km across.' && msgs[1].edits === 2);
  check('never to nothing', /can't be changed to nothing/.test(changeBob(msgs, { id: 'a1', text: '   ' }).error || ''));
  check('the same words change nothing', /already says that/.test(changeBob(msgs, { id: 'a1', text: 'About 3,475 km.' }).error || ''));
  check('only Bob\'s messages (yours go through Edit and send again)', /older part/.test(changeBob(msgs, { id: 'u1', text: 'x' }).error || ''));
  check('a message not in the recent part says so', /older part/.test(changeBob(msgs, { id: 'zz', text: 'x' }).error || ''));
}

// ---------- Delete ----------
{
  const msgs = chat();
  const r = removeMsg(msgs, { id: 'u2' });
  check('your message goes with Bob\'s answer to it, tool steps and all', !r.error && r.role === 'user' && msgs.map((m) => m.id || m.role).join(',') === 'u1,a1,u3' && r.removed.join(',') === 'u2,a2,a3');
}
{
  const msgs = chat();
  const r = removeMsg(msgs, { id: 'a1' });
  check('Bob\'s answer goes alone', !r.error && msgs.length === 6 && !msgs.some((m) => m.id === 'a1') && msgs[0].id === 'u1' && msgs[1].id === 'u2');
}
{
  const msgs = chat();
  removeMsg(msgs, { id: 'a2' });
  check('a step with a tool keeps the tool part and loses only his words', msgs.length === 7 && msgs[3].content === '' && msgs[3].tool_calls?.length === 1 && msgs[4].role === 'tool');
}
{
  const msgs = chat();
  removeMsg(msgs, { id: 'u3' });
  check('your latest message, with no answer yet, goes alone', msgs.length === 6 && msgs.at(-1).id === 'a3');
  check('a message not in the recent part says so', /older part/.test(removeMsg(msgs, { id: 'gone' }).error || ''));
  check('hidden notes and tool results can\'t be picked', /older part/.test(removeMsg([{ role: 'tool', id: 'x' }], { id: 'x' }).error || ''));
}

// ---------- The step, as the server runs it ----------
const fakeBrain = (cfg = {}, extra = {}) => {
  const msgs = chat(), events = [], logs = [];
  let saved = 0;
  return { cfg, msgs, events, logs, saved: () => saved, turns: new Map(), queue: [], session: () => msgs, saveSession: () => { saved++; }, broadcast: (e) => events.push(e), log: (k, t) => logs.push(t), ...extra };
};
{
  const b = fakeBrain();
  const r = msgMenu(b, 'main', 'edit', { id: 'a1', text: 'Fixed words.' });
  check('edit: saved, and the windows of this chat are told under their own event name', r.ok && b.saved() === 1 && b.events[0]?.type === 'msg-edited' && b.events[0].sessionId === 'main' && b.events[0].by === 'you' && b.events[0].text === 'Fixed words.');
  check('never the event Discord and Telegram act on (Bob fixing a message he sent there)', !b.events.some((e) => e.type === 'edited'));
  const d = msgMenu(b, 'main', 'delete', { id: 'u2' });
  check('delete: saved, and the other windows redraw the chat', d.ok && b.saved() === 2 && b.events[1]?.type === 'rewound' && d.removed.includes('a3'));
}
{
  const b = fakeBrain({ chatRedo: false });
  check('the switch off stops Edit and Delete, and says where it is', /Try again, Edit and Delete" is off/.test(msgMenu(b, 'main', 'delete', { id: 'a1' }).error || '') && b.msgs.length === 7);
}
{
  const b = fakeBrain({}, { queue: [{ sessionId: 'main', state: 'working' }] });
  check('not while Bob is on this chat', /still on this chat/.test(msgMenu(b, 'main', 'delete', { id: 'a1' }).error || '') && b.msgs.length === 7 && b.saved() === 0);
  const other = fakeBrain({}, { queue: [{ sessionId: 'other', state: 'working' }] });
  check('a job in another chat doesn\'t stop it', msgMenu(other, 'main', 'delete', { id: 'a1' }).ok);
}

// ---------- The server, the brain, the window ----------
{
  const server = read('src/server.js');
  check('the server has the two routes', /\/api\/chat\/msg-edit/.test(server) && /\/api\/chat\/msg-delete/.test(server) && /msgMenu\(brain/.test(server));
  const brain = brainText();
  check('every answer Bob says gets its id at once (so the menu works on it before a reload)', /if \(!job\?\.guest && typeof reply\.content === 'string' && reply\.content\.trim\(\)\) \{ reply\.id \|\|= newMsgId\(\)/.test(brain));
  check('the saved chat says who edited a message', /editedBy: 'you'/.test(brain));
  const app = publicText('app.js');
  check('every message gets the ... button, labelled for screen readers', /class="msg-more" data-msg-more aria-haspopup="menu" aria-expanded="false" aria-label="Message menu: Try again, Edit, Copy, Delete"/.test(app));
  check('the menu has Try again, Edit, Copy and Delete, in that order', (() => { const a = app.indexOf("'Try again', wait"), b = app.indexOf("'Edit', wait"), c = app.indexOf("['copy-msg', 'Copy'"), d = app.indexOf("'Delete', wait"); return a > 0 && a < b && b < c && c < d; })());
  check('Delete asks once, in the menu itself, never a pop-up box', /Delete this message and Bob\\'s answer to it\?/.test(app) && /data-m="del-yes"/.test(app) && /data-m="del-no"/.test(app) && !/confirm\(/.test(app.slice(app.indexOf('const msgMenu'), app.indexOf('return { toggle, pick, close }'))));
  check('Edit on Bob\'s message sends nothing', /\/api\/chat\/msg-edit/.test(app) && /Nothing is sent\. Bob reads the new words from now on/.test(app));
  check('the keyboard works: arrows, Home, End, Esc', ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Escape'].every((k) => app.includes(`e.key === '${k}'`)));
  check('the menu stays open when Delete swaps its buttons to ask', /e\.target\.isConnected && !open\.msg\.contains/.test(app));
  check('greyed out (not hidden) while Bob is busy', /aria-disabled="true"/.test(app) && /const wait = busy \|\| redoing/.test(app));
  check('copying leaves the button labels out', /\.msg-more, \.msg-menu'\)\) x\.remove\(\)/.test(app));
  check('the window redraws a message you fixed', /case 'msg-edited': editedMsg\(ev\)/.test(app) && /You changed Bob\\'s words here/.test(app));
  const css = read('public/style.css');
  check('top right, shown on mouse-over and keyboard focus', /\.msg-more \{ position: absolute; top: -12px; right: 6px;/.test(css) && /\.msg:hover > \.msg-more, \.msg:focus-within > \.msg-more/.test(css));
  check('always shown on a touch screen', /@media \(hover: none\) \{ \.msg-more \{ opacity: \.7; \} \}/.test(css));
  check('menu items are big enough to press', /\.msg-menu button \{[^}]*min-height: 32px/.test(css));
}

// ---------- The phone screen and the Android app ----------
{
  const www = read('android/app/src/main/assets/www/phone.js');
  check('phone: every message gets the ... button', /node\.append\(moreButton\(\)\)/.test(www) && /class: 'msg-more', text: '…'/.test(www));
  check('phone: Try again, Edit, Copy, Delete in that order', (() => { const a = www.indexOf("['Try again',"), b = www.indexOf("['Edit',"), c = www.indexOf("['Copy',"), d = www.indexOf("['Delete',"); return a > 0 && a < b && b < c && c < d; })());
  check('phone: Delete asks once, yours goes with the answer to it', /Delete this message and Bob\\'s answer to it\?/.test(www) && /if \(m\.who === 'you'\) while \(end < c\.msgs\.length && c\.msgs\[end\]\.who !== 'you'\) end\+\+;/.test(www));
  check('phone: Edit on Bob\'s words saves here, nothing sent', /function editBob\(node\)/.test(www) && /m\.edited = Date\.now\(\); saveChats\(\);/.test(www));
  check('phone: no style attribute set from code (its CSP)', !/setAttribute\('style'/.test(www));
  check('the phone screen (iPhone) is the same copy', read('public/phone/phone.js') === www);
  check('phone Settings names Delete', /Try again, Edit and Delete/.test(read('android/app/src/main/assets/www/index.html')));
  const ph = read('android/app/src/main/assets/www/help.js');
  check('phone Help, glossary and FAQ', /The … menu: Try again, Edit, Copy, Delete/.test(ph) && /<dt>… menu<\/dt>/.test(ph) && /Can I get a deleted message back\?/.test(ph));
}

// ---------- Help, glossary, FAQ, Settings ----------
{
  const topic = HELP.find((h) => h.id === 'msg-menu');
  check('Help has a topic in Bob\'s voice', topic && /On mine, fix my words/.test(topic.html) && /Try again/.test(topic.html) && /Copy/.test(topic.html) && /Delete/.test(topic.html) && /phone screen and the Android app/.test(topic.html));
  const faq = HELP.find((h) => h.id === 'faq-msg-delete');
  check('an FAQ says a deleted message is gone for good', faq && /for good/.test(faq.html));
  const all = HELP.map((h) => h.html).join('\n');
  check('the glossary has it', /<dt>Message menu \(…\)<\/dt>/.test(all));
  check('Settings names Delete on the switch', /sswitch\('chatRedo', settings\.chatRedo !== false, 'Try again, Edit and Delete'/.test(publicText('cellar.js')));
  check('the user guide has it', /\*\*Try again, Edit and Delete\*\*/.test(read('docs/USER-GUIDE.md')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
