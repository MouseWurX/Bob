// Fade old messages, Clear chat (src/fade-chat.js) and 🫥 Amnesia mode (src/amnesia.js), their routes
// (src/fade-routes.js), the Settings rows (public/harness.js), the Android app's fading (logic.js fadeTurns) and Help.
// Everything runs on fake Bob folders in a temp dir: nothing reads this replicant matrix's own files or settings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { cleanFade, fadeOf, fadeWords, turnsOf, visibleHistory, dropOldTurns, sweepChat, sweepAll, clearChat, clearedAt, markCleared, FADE_MAX } from '../src/fade-chat.js';
import { startAmnesia, endAmnesia, amnesiaState, amnesiaCount, amnesiaTick, madeSince, cleanAmnesiaAuto } from '../src/amnesia.js';
import { fadeRoute } from '../src/fade-routes.js';
import { harnessView, cleanHarness } from '../src/harness.js';
import { OPT_IN, OPT_IN_GROUPS, safeStartPlan } from '../src/crash-catch.js';
import { harnessHtml, LABELS } from '../public/harness.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-fade-'));
let n = 0;
const fresh = (extra = {}) => {
  const innDir = path.join(tmp, String(++n)), dataDir = path.join(innDir, 'bob');
  fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
  return { innDir, dataDir, memoryFile: path.join(innDir, 'bob-memory.md'), noticeBoard: path.join(innDir, 'notice-board.md'), logbook: path.join(innDir, 'logbook.md'), ...extra };
};
const sess = (cfg, id) => path.join(cfg.dataDir, 'sessions', id + '.json');
const writeChat = (cfg, id, msgs) => fs.writeFileSync(sess(cfg, id), JSON.stringify(msgs));
const readJ = (f, d = null) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
// A fake brain: holds chats like Brain does (session/saveSession) and a Topics stand-in that records what was dropped.
const fakeBrain = (cfg) => {
  const sessions = new Map();
  const dropped = [];
  return {
    sessions, dropped, turns: new Map(), queue: [], logs: [],
    session(id) { if (!sessions.has(id)) sessions.set(id, readJ(sess(cfg, id), [])); return sessions.get(id); },
    saveSession(id) { fs.writeFileSync(sess(cfg, id), JSON.stringify(this.session(id))); },
    housekeeper: { topics: { dropMessages(s, ids) { dropped.push([s, ids ? [...ids] : null]); } } },
    history(id) { return this.session(id).filter((m) => m.role === 'user' || m.role === 'assistant'); },
    log(k, t) { this.logs.push(t); }, broadcast() {}
  };
};
const NOW = 1_800_000_000_000, MIN = 60e3;
const chat = () => [
  { id: 'a1', role: 'user', content: 'old question', at: NOW - 120 * MIN },
  { id: 'a2', role: 'assistant', content: 'thinking', step: true, at: NOW - 119 * MIN },
  { id: 'a3', role: 'assistant', content: 'old answer', at: NOW - 118 * MIN },
  { id: 'b1', role: 'user', content: 'new question', at: NOW - 5 * MIN },
  { id: 'b2', role: 'assistant', content: 'new answer', at: NOW - 4 * MIN }
];

// ---------- Settings ----------
{
  const v = harnessView({});
  check('fading is off on a new Bob, 1 hour, hide', v.fadeChat.on === false && v.fadeChat.minutes === 60 && v.fadeChat.mode === 'hide');
  check('Amnesia mode is off on a new Bob, keeps what he made, never turns off by itself', v.amnesiaOffer === false && v.amnesiaMade === 'keep' && v.amnesiaAutoOff === 0);
  check('fade time is kept between 1 minute and a year', cleanFade({ minutes: 0 }).minutes === 1 && cleanFade({ minutes: 9e9 }).minutes === FADE_MAX && cleanFade({ minutes: 'x' }).minutes === 60);
  check('only hide or delete', cleanFade({ mode: 'shred' }).mode === 'hide' && cleanFade({ mode: 'delete' }).mode === 'delete');
  check('only the listed auto-off times', cleanAmnesiaAuto(240) === 240 && cleanAmnesiaAuto(7) === 0 && cleanHarness('amnesiaMade', 'burn') === 'keep');
  check('plain words for times', fadeWords(5) === '5 min' && fadeWords(60) === '1 hour' && fadeWords(90) === '1 hour 30 min' && fadeWords(1440) === '1 day' && fadeWords(10080) === '1 week' && fadeWords(43200) === '30 days');
  check('safe start turns both off', OPT_IN.includes('amnesiaOffer') && OPT_IN_GROUPS.fadeChat?.[0] === 'on' && safeStartPlan({ fadeChat: { on: true, minutes: 5, mode: 'delete' }, amnesiaOffer: true }).count === 2);
  const html = harnessHtml('chats', harnessView({}), []);
  check('nothing ticked on a new Bob', !/data-hx-fade="on"[^>]*checked/.test(html) && !/data-hx="amnesiaOffer" checked/.test(html));
  check('every value can be set before switching on', /data-hx-fade="num"/.test(html) && /data-hx-fade="unit"/.test(html) && /data-hx-fadepick="5"/.test(html) && /data-hx-fadepick="43200"/.test(html) && /value="delete" data-hx-radio="fadeMode"/.test(html) && /data-hx-amnesiaauto/.test(html) && /value="delete" data-hx-radio="amnesiaMade"/.test(html) && !/disabled/.test(html));
  check('Clear this chat is in Settings too', /data-hx-clearchat/.test(html));
  check('switch descriptions are short', LABELS.fadeChat[1].length <= 220 && LABELS.amnesiaOffer[1].length <= 220);
}

// ---------- Turns and what the chat shows ----------
{
  const t = turnsOf(chat());
  check('a turn is your message and everything after it', t.length === 2 && t[0].msgs.length === 3 && t[0].at === NOW - 118 * MIN);
  const cfg = fresh({ fadeChat: { on: true, minutes: 60, mode: 'hide' } });
  const v = visibleHistory(cfg, 'main', chat(), NOW);
  check('hide: the old turn (question, thinking, answer) leaves the view together', v.faded === 3 && v.list.map((m) => m.id).join() === 'b1,b2');
  check('fading off: everything shows', visibleHistory(fresh(), 'main', chat(), NOW).list.length === 5);
  const half = [{ id: 'x', role: 'user', content: 'q', at: NOW - 90 * MIN }, { id: 'y', role: 'assistant', content: 'a', at: NOW - 30 * MIN }];
  check('a turn fades by its newest message, so an answer never goes before its question', visibleHistory(cfg, 'main', half, NOW).list.length === 2);
  const untimed = [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }];
  check('messages with no time stay until the chat is cleared', visibleHistory(cfg, 'main', untimed, NOW).list.length === 2);
  const c2 = fresh();
  markCleared(c2, 'main', NOW - 10 * MIN);
  check('Clear chat (hide) hides what came before it, even with fading off', visibleHistory(c2, 'main', chat(), NOW).list.length === 2 && visibleHistory(c2, 'main', untimed, NOW).list.length === 0);
  check('the cleared mark sits beside the chats folder, never inside it', fs.existsSync(path.join(c2.dataDir, 'sessions-cleared.json')) && !fs.readdirSync(path.join(c2.dataDir, 'sessions')).length);
}

// ---------- Delete mode ----------
{
  const msgs = chat();
  const gone = dropOldTurns(msgs, NOW - 60 * MIN);
  check('delete: old turns go from the recent part, with their ids', [...gone].join() === 'a1,a2,a3' && msgs.map((m) => m.id).join() === 'b1,b2');
  const cfg = fresh({ fadeChat: { on: true, minutes: 60, mode: 'delete' } });
  writeChat(cfg, 'c1', chat());
  fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'c1.older.json'), JSON.stringify([{ id: 'o1', role: 'user', content: 'ancient', at: NOW - 999 * MIN }, { id: 'o2', role: 'assistant', content: 'ancient answer', at: NOW - 998 * MIN }]));
  fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'c1.summary.json'), JSON.stringify({ text: 'summary' }));
  const brain = fakeBrain(cfg);
  const k = sweepChat(cfg, brain, 'c1', NOW);
  check('the sweep deletes from the chat file and the older part', k === 5 && readJ(sess(cfg, 'c1')).map((m) => m.id).join() === 'b1,b2' && !fs.existsSync(path.join(cfg.dataDir, 'sessions', 'c1.older.json')));
  check('an emptied older part takes its summary with it', !fs.existsSync(path.join(cfg.dataDir, 'sessions', 'c1.summary.json')));
  check('their links come out of Topics', brain.dropped.length === 1 && brain.dropped[0][0] === 'c1' && brain.dropped[0][1].includes('a1') && brain.dropped[0][1].includes('o2'));
  check('hide mode never deletes', sweepChat(fresh({ fadeChat: { on: true, minutes: 1, mode: 'hide' } }), brain, 'c1', NOW) === 0);
  const busyCfg = fresh({ fadeChat: { on: true, minutes: 60, mode: 'delete' } });
  writeChat(busyCfg, 'c2', chat());
  const busy = fakeBrain(busyCfg); busy.turns.set('main', { sessionId: 'c2' });
  check('a chat Bob is working in is left alone', sweepAll(busyCfg, busy, ['c2'], NOW) === 0 && readJ(sess(busyCfg, 'c2')).length === 5);
  check('the sweep never touches memory or notes', !/memoryFile|quick-notes|bob-memory/.test(read('src/fade-chat.js').replace(/^\/\/.*$/gm, '')));
}

// ---------- Clear chat ----------
{
  const cfg = fresh();
  writeChat(cfg, 'c3', chat());
  fs.writeFileSync(path.join(cfg.dataDir, 'sessions', 'c3.pins.json'), '[]');
  const brain = fakeBrain(cfg);
  const r1 = clearChat(cfg, brain, 'c3', { now: NOW });
  check('Clear chat (hide) keeps the files and marks the time', r1.ok && fs.existsSync(sess(cfg, 'c3')) && clearedAt(cfg, 'c3') === NOW);
  brain.session('c3');
  const r2 = clearChat(cfg, brain, 'c3', { forGood: true });
  check('Delete it for good removes every file of the chat and its Topics links', r2.ok && !fs.existsSync(sess(cfg, 'c3')) && !fs.existsSync(path.join(cfg.dataDir, 'sessions', 'c3.pins.json')) && brain.dropped.some(([s, ids]) => s === 'c3' && ids === null) && !brain.sessions.has('c3') && clearedAt(cfg, 'c3') === 0);
  brain.turns.set('x', { sessionId: 'c4' });
  check('not while Bob is working in that chat', Boolean(clearChat(cfg, brain, 'c4').error));
}

// ---------- Amnesia mode ----------
{
  const cfg = fresh({ amnesiaOffer: true });
  fs.writeFileSync(cfg.memoryFile, 'likes tea\n');
  writeChat(cfg, 'main', chat());
  fs.writeFileSync(path.join(cfg.dataDir, 'topics.json'), JSON.stringify({ topics: [{ id: 't1', name: 'Shed' }], cursors: {} }));
  const keepFile = path.join(cfg.innDir, 'yours.txt'); fs.writeFileSync(keepFile, 'yours');
  const made = { list: [{ path: keepFile, at: 0, tool: 'write_file' }], load() { return this.list; }, save(l) { this.list = l; } };
  const r = startAmnesia(cfg, { now: NOW });
  check('turning it on saves a copy and remembers when', r.ok && amnesiaState(cfg).on && amnesiaState(cfg).since === NOW);
  // In the stretch: a memory line, a new chat, a message in an old chat, a topic, a quick note, two files.
  fs.appendFileSync(cfg.memoryFile, 'secret plan\n');
  fs.writeFileSync(path.join(cfg.innDir, 'quick-notes.md'), 'note from the stretch\n');
  writeChat(cfg, 'chat-new', [{ id: 'n1', role: 'user', content: 'secret', at: NOW + MIN }, { id: 'n2', role: 'assistant', content: 'ok', at: NOW + MIN }]);
  writeChat(cfg, 'main', [...chat(), { id: 'c1', role: 'user', content: 'also secret', at: NOW + MIN }]);
  fs.writeFileSync(path.join(cfg.dataDir, 'topics.json'), JSON.stringify({ topics: [{ id: 't1', name: 'Shed' }, { id: 't2', name: 'Secret' }], cursors: {} }));
  const newFile = path.join(cfg.innDir, 'painting.png'); fs.writeFileSync(newFile, 'png');
  made.list.unshift({ path: newFile, at: Date.now(), tool: 'paint' }, { path: keepFile, at: Date.now(), tool: 'edit_file' });
  const c = amnesiaCount(cfg, made);
  check('it counts what it would forget', c.chats === 2 && c.messages === 3 && c.memory === 1 && c.notes === 1 && c.topics === 1, JSON.stringify(c));
  const brain = fakeBrain(cfg); brain.session('main');
  brain.turns.set('main', { sessionId: 'main' });
  check('not while Bob is working', Boolean(endAmnesia(cfg, { brain, made }).error) && amnesiaState(cfg).on);
  brain.turns.clear();
  const e = endAmnesia(cfg, { brain, made, deleteMade: false });
  check('turning it off forgets the memory line', e.ok && fs.readFileSync(cfg.memoryFile, 'utf8') === 'likes tea\n');
  check('a note file that wasn\'t there goes', !fs.existsSync(path.join(cfg.innDir, 'quick-notes.md')));
  check('a chat started in the stretch goes; an older chat loses what was added', !fs.existsSync(sess(cfg, 'chat-new')) && readJ(sess(cfg, 'main')).length === 5);
  check('Topics go back', readJ(path.join(cfg.dataDir, 'topics.json')).topics.length === 1);
  check('Bob\'s working memory of the chats is let go', brain.sessions.size === 0);
  check('Keep them: what he made stays', fs.existsSync(newFile) && fs.existsSync(keepFile));
  check('the copy is gone afterwards', !fs.existsSync(path.join(cfg.dataDir, 'amnesia')) && !amnesiaState(cfg).on);

  const cfg2 = fresh({ amnesiaOffer: true, amnesiaAutoOff: 60 });
  const own = path.join(cfg2.innDir, 'mine.txt'); fs.writeFileSync(own, 'mine');
  const T = Date.now() - 1000; // real time here: "only new files" reads the file's own birth time
  startAmnesia(cfg2, { now: T });
  const made2 = { list: [], load() { return this.list; }, save(l) { this.list = l; } };
  const fresh2 = path.join(cfg2.innDir, 'clip.mp4'); fs.writeFileSync(fresh2, 'x');
  made2.list = [{ path: fresh2, at: T + 1, tool: 'video' }, { path: own, at: T + 1, tool: 'edit_file' }];
  check('only new files count, never one he only changed', madeSince(cfg2, made2, T).map((x) => x.path).join() === fresh2);
  check('it turns itself off after the set time', amnesiaState(cfg2).autoOff === T + 60 * MIN && !amnesiaTick(cfg2, { made: made2 }, T + 59 * MIN) && amnesiaTick(cfg2, { made: made2, deleteMade: true }, T + 61 * MIN));
  check('Delete them too: the new file goes, the changed one stays', !fs.existsSync(fresh2) && fs.existsSync(own) && made2.list.length === 1);
}

// ---------- Routes ----------
{
  const cfg = fresh({ fadeChat: { on: true, minutes: 60, mode: 'hide' }, amnesiaOffer: true });
  writeChat(cfg, 'main', chat().map((m) => ({ ...m, at: Date.now() - (m.id.startsWith('a') ? 120 : 1) * MIN })));
  const brain = fakeBrain(cfg); brain.made = { load: () => [], save() {} };
  const call = async (method, p, b = {}, isLocal = true) => {
    const out = {};
    out.handled = await fadeRoute({ req: { method }, res: {}, p: p.split('?')[0], url: new URL('http://x' + p), isLocal, cfg, brain, body: async () => b, send: (_r, code, data) => { out.code = code; out.data = data; } });
    return out;
  };
  const g = await call('GET', '/api/fade?session=main');
  check('GET /api/fade says how many faded', g.code === 200 && g.data.faded === 3 && g.data.fade.on === true);
  check('Amnesia mode starts only once offered', (await call('POST', '/api/amnesia', { on: true }, true)).code === 200 && (await call('POST', '/api/amnesia', { on: false })).code === 200);
  cfg.amnesiaOffer = false;
  check('...and refuses while not offered', (await call('POST', '/api/amnesia', { on: true })).code === 409);
  cfg.amnesiaOffer = true;
  check('Amnesia mode only from this replicant matrix', (await call('POST', '/api/amnesia', { on: true }, false)).code === 403 && !amnesiaState(cfg).on);
  check('Delete it for good only from this replicant matrix', (await call('POST', '/api/chat/clear', { sessionId: 'main', forGood: true }, false)).code === 403 && fs.existsSync(sess(cfg, 'main')));
  check('a guest chat can\'t be cleared (it isn\'t saved)', (await call('POST', '/api/chat/clear', { sessionId: 'guest-abc' })).code === 400);
  check('other paths are left to other routes', (await call('GET', '/api/other')).handled === false);
  const srv = read('src/server.js');
  check('/api/history leaves faded turns out unless asked (Show them)', /searchParams\.get\('all'\) === '1' \? brain\.history\(id\) : visibleHistory\(cfg, id, brain\.history\(id\)\)\.list/.test(srv));
  check('the server sweeps once a minute and runs the auto-off', /sweepAll\(cfg, brain, chatIds\(cfg\)\)/.test(srv) && /amnesiaTick\(cfg/.test(srv) && /, 60_000\)\.unref\(\)/.test(srv));
  check('profiles keep them private', /'\/api\/fade', '\/api\/amnesia'\]/.test(srv));
}

// ---------- Android app ----------
{
  await import(pathToFileURL(path.join(app, 'android/app/src/main/assets/www/logic.js')));
  const L = globalThis.BobLogic;
  const msgs = [{ who: 'you', at: NOW - 120 * MIN }, { who: 'bob', at: NOW - 119 * MIN }, { who: 'you', at: NOW - MIN }, { who: 'bob' }];
  const r = L.fadeTurns(msgs, { fade: { on: true, minutes: 60 }, now: NOW });
  check('Android: an old turn fades as one', r.gone.length === 2 && r.keep.length === 2);
  check('Android: off means nothing fades; Clear chat hides what came before', L.fadeTurns(msgs, { now: NOW }).gone.length === 0 && L.fadeTurns(msgs, { clearedAt: NOW, now: NOW }).gone.length === 4);
  check('Android: same words for times', L.fadeWords(1440) === '1 day' && L.fadeWords(5) === '5 min');
  const html = read('android/app/src/main/assets/www/index.html'), js = read('android/app/src/main/assets/www/phone.js');
  check('Android: the settings are there, fading off to start with', /id="fade-on"/.test(html) && /id="fade-num"/.test(html) && /name="fade-mode" value="delete"/.test(html) && /fade: \{ on: false, minutes: 60, mode: 'hide' \}/.test(js));
  check('Android: messages get a time', /m\.at \|\|= Date\.now\(\)/.test(js) && /by, q, at: Date\.now\(\)/.test(js));
  check('Android: says Amnesia mode is on the computer only', /Amnesia mode is on your computer's Bob only/.test(html));
}

// ---------- The chat window, Help and the brain ----------
{
  const pub = read('public/fade-chat.js'), appJs = read('public/app.js');
  check('the chat asks before clearing, Delete it for good unticked', /title: 'Clear this chat\?'/.test(pub) && /tick: \{ on: false, label: 'Delete it for good'/.test(pub));
  check('turning Amnesia mode off asks first, with what goes', /title: 'Turn off Amnesia mode\?'/.test(pub) && /memory line/.test(pub) && /yes: 'Forget it all'/.test(pub));
  check('the banner and the purple edge show while it\'s on', /amnesia-bar/.test(pub) && /classList\.toggle\('amnesia-on'/.test(pub) && /body\.amnesia-on \.composer/.test(read('public/style.css')));
  check('the 🫥 button is a switch, hidden until offered', /setAttribute\('role', 'switch'\)/.test(pub) && /btn\.hidden = !\(a\.offered \|\| a\.on\)/.test(pub));
  check('one redraw at a time (no chat drawn twice)', /if \(drawing\) \{ again = true; return drawing; \}/.test(pub));
  check('app.js asks for faded turns only with Show them', /fadeChat\?\.showAll \? '&all=1' : ''/.test(appJs) && /el\.dataset\.at = m\.at/.test(appJs));
  check('Clear chat is in Find anything', /label: 'Clear chat', kind: 'Tool'/.test(appJs));
  check('nothing new goes in the brain\'s start prompt', !/fade|amnesia/i.test(read('src/brain-prompting.js')));
  const ids = ['fade-chat', 'amnesia-mode', 'faq-fade', 'faq-amnesia'];
  check('Help pages and FAQs', ids.every((id) => HELP.some((e) => e.id === id)) && HELP.filter((e) => ids.slice(2).includes(e.id)).every((e) => e.group === 'FAQ' && /\?$/.test(e.title)));
  const gloss = HELP.find((e) => e.id === 'glossary').html;
  check('glossary words', ['Fade old messages', 'Clear chat', 'Amnesia mode'].every((t) => gloss.includes(`<dt>${t}</dt>`)));
  const all = HELP.map((e) => e.html).join(' ');
  check('Help says where it doesn\'t work yet', /The phone page and the Android app don't have it yet/.test(all) && /Windows, Mac and Linux/.test(all));
  check('Help says his notes stay when fading deletes', /My notes, memory lines and the summary of a chat's older part stay/.test(all));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
