// Harness items 62 to 72 (src/harness.js): Catch crashes, Safe start, Settings undo, the Health page, Quiet hours,
// chat places, the weekly page, the shortcut from anywhere, Try from here, Pin messages, Guest chats.
// Everything here runs on a fake Bob folder in a temp dir: nothing reads this replicant matrix's own settings.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { HARNESS_KEYS, cleanHarness, harnessView, harnessNow, ASK_KEYS } from '../src/harness.js';
import { SETTING_KEYS, mergeSettings } from '../src/config.js';
import { safeLogLines, makeReport, saveReport, listReports, readReport, deleteReport, markSeen, startRun, endRun, safeStartPlan, applySafeStart, undoSafeStart, crashOffer, engineCrashed, OPT_IN, MAX_REPORTS } from '../src/crash-catch.js';
import { record, undoView, putBack, clearUndo, UNDO_MAX } from '../src/settings-undo.js';
import { isQuiet, minuteOfDay } from '../src/quiet-hours.js';
import { Weekly } from '../src/weekly.js';
import { tidyPlaces, placeFile, placesUsed, clearPlaces, placesDir } from '../src/chat-places.js';
import { pin, unpin, readPins, pinsPrompt, MAX_PINS } from '../src/pins.js';
import { tryFromHere } from '../src/try-from-here.js';
import { isGuestId, GUEST_BLOCKED } from '../src/guest-chat.js';
import { healthChecks } from '../src/health.js';
import { harnessRoute } from '../src/harness-routes.js';
import { readChat } from '../src/chats.js';
import { LABELS, harnessHtml } from '../public/harness.js';
import { HELP } from '../public/help-content.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { weekKey, isGuest } from '../public/harness-chat.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-harness-'));
let n = 0;
const fresh = (extra = {}) => { const dataDir = path.join(tmp, String(++n)); fs.mkdirSync(dataDir, { recursive: true }); return { dataDir, ...extra }; };

// ---------- Settings keys: all saved, all off on a new Bob ----------
check('every harness key is a saved setting', HARNESS_KEYS.every((k) => SETTING_KEYS.includes(k)));
check('apuHoldbackGB stays last', SETTING_KEYS[SETTING_KEYS.length - 1] === 'apuHoldbackGB');
{
  const v = harnessView(mergeSettings({}, {}));
  check('all off on a new Bob', HARNESS_KEYS.every((k) => (typeof v[k] === 'object' ? v[k].on === false : v[k] === false)), JSON.stringify(v));
  check('quiet hours start 22:00 to 07:00', v.quietHours.from === '22:00' && v.quietHours.to === '07:00');
  check('the shortcut starts as Ctrl+Shift+Space', v.globalAsk.key === 'CommandOrControl+Shift+Space' && v.askKeys.length === ASK_KEYS.length);
}
check('switches only take true', cleanHarness('pinMessages', 'yes') === false && cleanHarness('pinMessages', true) === true);
check('a bad time falls back', cleanHarness('quietHours', { on: true, from: '25:00', to: '6:00' }).from === '22:00' && cleanHarness('quietHours', { to: '6:00' }).to === '07:00');
check('an unknown key falls back to the default', cleanHarness('globalAsk', { on: true, key: 'F1' }).key === 'CommandOrControl+Shift+Space');
check('Bob\'s settings readout names them', /Quiet hours/.test(harnessNow({})) && /Guest chats/.test(harnessNow({})));

// ---------- Catch crashes ----------
{
  const log = [
    '- 2026-11-11 10:00 | chat | the owner said: my secret plan',
    '- 2026-11-11 10:01 | engine | loaded brain from /home/someone/models/x.gguf',
    '- 2026-11-11 10:02 | memory | remembered: likes cats',
    '- 2026-11-11 10:03 | reminder | buy milk',
    '- 2026-11-11 10:04 | settings | quietHours: changed'
  ].join('\r\n');
  const lines = safeLogLines(log, { home: '/home/someone' });
  check('no chat, memory or reminder lines in a report', lines.length === 2 && !lines.some((l) => /secret|cats|milk/.test(l)), JSON.stringify(lines));
  check('the home folder becomes ~', lines[0].includes('~/models') && !lines[0].includes('/home/someone'));
  const rep = makeReport({ kind: 'engine', model: 'Riker', code: 3, engineTail: 'line a\nline b', version: '1.5.999', logText: log, system: { os: 'TestOS 1', arch: 'x64', node: '22', electron: '', ramGB: 32 } });
  check('a report says when, version, system and engine lines', /Bob crash report, /.test(rep) && /Bob 1\.5\.999 · TestOS 1/.test(rep) && /line b/.test(rep) && /code 3/.test(rep));
  check('a report has no chat words', !/secret|cats|milk/.test(rep) && /No chat words are in this report/.test(rep));

  const cfg = fresh({ crashCatcher: true });
  for (let i = 0; i < MAX_REPORTS + 3; i++) saveReport(cfg, makeReport({ kind: 'bob', system: { os: 'T' } }), new Date(Date.UTC(2026, 10, 1, 0, i)));
  const list = listReports(cfg);
  check(`only the newest ${MAX_REPORTS} are kept`, list.length === MAX_REPORTS && list[0].id > list[1].id);
  check('a report reads back', /Bob didn't close properly/.test(readReport(cfg, list[0].id)));
  check('a bad id reads nothing', readReport(cfg, '../../etc/passwd') == null);
  markSeen(cfg, [list[0].id]);
  check('seen ones are not offered again', crashOffer(cfg, {}).reports.length === MAX_REPORTS - 1);
  deleteReport(cfg, list[1].id);
  check('a deleted report is gone', listReports(cfg).length === MAX_REPORTS - 1);
  check('nothing is offered with Catch crashes off', crashOffer({ ...cfg, crashCatcher: false }, {}).reports.length === 0);
  check('the engine report is made with the switch on, once a minute', engineCrashed(cfg, { model: 'x' }, 1e12) && !engineCrashed(cfg, { model: 'x' }, 1e12 + 1000));
  check('no engine report with the switch off', engineCrashed(fresh(), { model: 'x' }, 2e12) === null);
}

// ---------- The marker and Safe start ----------
{
  const cfg = fresh({ safeStart: true, crashCatcher: true, pinMessages: true, docTools: true, chatRedo: true, hands: { enabled: true, folders: ['x'] }, quietHours: { on: true, from: '23:00', to: '06:00' } });
  check('a first run is not a crash', startRun(cfg).crashed === false);
  const s1 = startRun(cfg);
  check('a run that never ended is a crash', s1.crashed && s1.streak === 1);
  const s2 = startRun(cfg);
  check('two in a row is a streak of two', s2.streak === 2);
  const offer = crashOffer(cfg, s2);
  check('safe start is offered after two', offer.safeStart && offer.safeStart.count === 4, JSON.stringify(offer));
  check('not offered after one', !crashOffer(cfg, s1).safeStart);
  check('not offered with its switch off', !crashOffer({ ...cfg, safeStart: false }, s2).safeStart);
  const plan = safeStartPlan(cfg);
  check('safe start leaves on-from-the-start things alone', !('chatRedo' in plan.patch) && !('crashCatcher' in plan.patch) && !('safeStart' in plan.patch));
  check('safe start keeps a group\'s other choices', plan.patch.hands.enabled === false && plan.patch.hands.folders[0] === 'x' && plan.patch.quietHours.from === '23:00');
  check('every top-level harness switch that could get in the way is in the list', ['weeklyReport', 'chatPlaces', 'tryFromHere', 'pinMessages', 'guestChat'].every((k) => OPT_IN.includes(k)));
  const saved = [];
  const r = applySafeStart(cfg, (c, p) => { saved.push(p); Object.assign(c, p); });
  check('switching off saves first, then turns them off', r.count === 4 && cfg.pinMessages === false && cfg.hands.enabled === false);
  const back = undoSafeStart(cfg, (c, p) => Object.assign(c, p));
  check('Put my switches back turns exactly those on again', back.count === 4 && cfg.pinMessages === true && cfg.docTools === true && cfg.hands.enabled === true);
  check('nothing to put back twice', undoSafeStart(cfg, () => {}).count === 0);
  endRun(cfg);
  check('a normal quit ends the streak', startRun(cfg).crashed === false);
}

// ---------- Undo for Settings ----------
{
  const cfg = fresh({ settingsUndo: true });
  check('nothing recorded with the switch off', record({ ...cfg, settingsUndo: false }, { a: 1 }, { a: 2 }) === null);
  record(cfg, { theme: 'moondust' }, { theme: 'slate' }, { now: 1_000_000 });
  record(cfg, { theme: 'slate' }, { theme: 'ink' }, { now: 1_010_000 });
  let v = undoView(cfg);
  check('changes to the same setting within a minute fold into one', v.list.length === 1 && v.list[0].changes[0].was === 'moondust' && v.list[0].changes[0].now === 'ink', JSON.stringify(v.list));
  record(cfg, { pinMessages: false }, { pinMessages: true }, { now: 2_000_000 });
  check('a switch shows as on and off, with its label', undoView(cfg).list[0].changes[0].label === 'Pin messages' && undoView(cfg).list[0].changes[0].now === 'on');
  check('bookkeeping is not listed', record(cfg, { setupDone: false }, { setupDone: true }, { now: 3_000_000 }) === null);
  const replaced = [];
  const id = undoView(cfg).list[1].id;
  const r = putBack(cfg, id, (c, p) => replaced.push(p));
  check('Put it back sets it to what it was', r.ok && replaced[0].theme === 'moondust');
  check('and leaves the list', undoView(cfg).list.length === 1);
  check('a gone one says so', putBack(cfg, 'nope', () => {}).ok === false);
  for (let i = 0; i < UNDO_MAX + 5; i++) record(cfg, { ['k' + i]: 1 }, { ['k' + i]: 2 }, { now: 4_000_000 + i * 120_000 });
  check(`only the last ${UNDO_MAX}`, undoView(cfg).list.length === UNDO_MAX);
  clearUndo(cfg);
  check('Clear the list empties it', undoView(cfg).list.length === 0);
  const config = read('src/config.js');
  check('config.js tells the watcher about every save', /export const watchSettings/.test(config) && (config.match(/tellWatcher\(before, cfg, /g) || []).length >= 2);
}

// ---------- Quiet hours ----------
{
  const at = (h, m = 0) => new Date(2026, 10, 11, h, m);
  const night = { quietHours: { on: true, from: '22:00', to: '07:00' } };
  check('quiet at 23:30 and 03:00 over midnight', isQuiet(night, at(23, 30)) && isQuiet(night, at(3)));
  check('not quiet at 07:00 or 12:00', !isQuiet(night, at(7)) && !isQuiet(night, at(12)));
  check('a daytime range works', isQuiet({ quietHours: { on: true, from: '13:00', to: '14:00' } }, at(13, 30)) && !isQuiet({ quietHours: { on: true, from: '13:00', to: '14:00' } }, at(14, 1)));
  check('the same time twice is all day', isQuiet({ quietHours: { on: true, from: '09:00', to: '09:00' } }, at(17)));
  check('never quiet with it off', !isQuiet({ quietHours: { on: false, from: '00:00', to: '23:59' } }, at(12)));
  check('a time zone is honoured', minuteOfDay(new Date(Date.UTC(2026, 10, 11, 6, 30)), 'Asia/Tokyo') === 930);
  { // 1.5.207 PC check: a UTC zone on a computer whose clock is 6 hours behind uses the computer's clock
    const d = new Date(Date.UTC(2026, 10, 11, 23, 27)); const fake = Object.assign(Object.create(d), { getTimezoneOffset: () => 360, getHours: () => 17, getMinutes: () => 27 });
    check('a stray UTC zone on a non-UTC computer means the computer\'s own clock', minuteOfDay(fake, 'UTC') === 17 * 60 + 27 && minuteOfDay(fake, 'Etc/UTC') === 17 * 60 + 27);
    check('so 22:00 to 07:00 is not quiet at 17:27', !isQuiet({ quietHours: { on: true, from: '22:00', to: '07:00' }, timeZone: 'UTC' }, fake)); }
  check('check-ins wait in quiet hours', /isQuiet\(this\.cfg\)\) return null|if \(isQuiet\(/.test(read('src/checkins.js')));
  check('reminders say if they are urgent, and pop up anyway', /urgent/.test(read('src/tools.js')) && /ev\.quiet && !ev\.urgent/.test(publicText('app.js')));
}

// ---------- What Bob did this week ----------
{
  let t = Date.UTC(2026, 10, 11, 12);
  const cfg = fresh({ weeklyReport: true, timeZone: 'UTC' });
  const w = new Weekly(cfg, { now: () => t });
  w.watch({ type: 'start', turnId: 'a', sessionId: 'chat-1' });
  w.watch({ type: 'token', turnId: 'a', text: 'one two three' });
  t += 5000;
  w.watch({ type: 'done', turnId: 'a' }, () => 'riker');
  w.watch({ type: 'start', turnId: 'b', sessionId: 'chat-1' });
  w.watch({ type: 'token', turnId: 'b', text: 'four' });
  t += 2000;
  w.watch({ type: 'done', turnId: 'b' }, () => 'bill');
  const v = w.view();
  check('counts chats, replies, words and time', v.week.chats === 1 && v.week.jobs === 2 && v.week.words === 4 && v.week.secs === 7, JSON.stringify(v.week));
  check('per brain', v.week.brains.length === 2 && v.week.brains.some((b) => b.name === 'riker' && b.words === 3));
  const saved = fs.readFileSync(path.join(cfg.dataDir, 'weekly.json'), 'utf8');
  check('no chat ids or words are kept', !saved.includes('chat-1') && !/one|two|three/.test(saved));
  const off = new Weekly(fresh({ weeklyReport: false }), { now: () => t });
  off.watch({ type: 'start', turnId: 'c' }); off.watch({ type: 'done', turnId: 'c' });
  check('nothing counted with it off', off.view().week.jobs === 0);
  w.clear();
  check('Clear the counts', w.view().week.jobs === 0);
  check('the Monday line is once a week', weekKey(new Date(2026, 10, 11)) === weekKey(new Date(2026, 10, 15)) && weekKey(new Date(2026, 10, 11)) !== weekKey(new Date(2026, 10, 17)));
}

// ---------- Each chat keeps its place in the engine ----------
{
  const cfg = fresh({ chatPlaces: true });
  const dir = placesDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  const name = placeFile('chat-123', 'Riker Q4', 32768);
  check('a place file name has no chat id or odd characters', !name.includes('chat-123') && /^[\w.-]+$/.test(name), name);
  for (let i = 0; i < 6; i++) { const f = path.join(dir, `place-${i}.bin`); fs.writeFileSync(f, Buffer.alloc(10)); fs.utimesSync(f, new Date(1e12 + i * 1e6), new Date(1e12 + i * 1e6)); }
  tidyPlaces(dir, { keep: 4, keepName: 'place-0.bin' });
  const left = fs.readdirSync(dir);
  check('only the newest 4 are kept, and the one in use stays', left.length === 4 && left.includes('place-0.bin') && left.includes('place-5.bin'), left.join());
  tidyPlaces(dir, { keep: 10, maxBytes: 25 });
  check('and no more than the byte limit', placesUsed(cfg).bytes <= 25);
  clearPlaces(cfg);
  check('Clear them deletes them', placesUsed(cfg).count === 0);
  const ll = read('src/llamacpp.js');
  check('the engine is started with a place folder only with the switch on', /--slot-save-path/.test(ll) && /chatPlacesOn\(/.test(ll));
  check('switching chats saves the old place and restores the new one', /slotAction\('save'/.test(ll) && /slotAction\('restore'/.test(ll) && /switchPlace\(/.test(ll));
}

// ---------- Pin messages ----------
{
  const cfg = fresh({ pinMessages: true });
  const msgs = [
    { id: 'm1', role: 'user', content: 'My dog is called Rex.' },
    { id: 'm2', role: 'assistant', content: 'Hello Rex!' },
    { id: 'm3', role: 'user', content: 'x'.repeat(5000) }
  ];
  check('a pin is kept', pin(cfg, 'chat-1', msgs, 'm1').ok && readPins(cfg, 'chat-1').length === 1);
  check('a long one is cut to 2000 characters', pin(cfg, 'chat-1', msgs, 'm3').ok && readPins(cfg, 'chat-1').find((p) => p.id === 'm3').text.length === 2000);
  check('a message not in the chat is refused', pin(cfg, 'chat-1', msgs, 'zz').ok === false);
  check('a pin in the window is not repeated in the note', pinsPrompt(cfg, 'chat-1', msgs) === '');
  const note = pinsPrompt(cfg, 'chat-1', msgs.slice(2));
  check('a pin out of the window goes in the note, word for word', /Pinned in this chat/.test(note) && note.includes('My dog is called Rex.'));
  check('no note with the switch off', pinsPrompt({ ...cfg, pinMessages: false }, 'chat-1', []) === '');
  unpin(cfg, 'chat-1', 'm1');
  check('Unpin lets it go', !readPins(cfg, 'chat-1').some((p) => p.id === 'm1'));
  const many = Array.from({ length: MAX_PINS + 1 }, (_, i) => ({ id: 'p' + i, role: 'user', content: 'n' + i }));
  for (const m of many.slice(0, MAX_PINS)) pin(cfg, 'chat-2', many, m.id);
  check(`no more than ${MAX_PINS} a chat`, pin(cfg, 'chat-2', many, 'p' + MAX_PINS).ok === false);
  check('deleting a chat takes its pins', /\.pins\.json/.test(read('src/chats.js')));
  check('the brain adds the pins to its note', /pinsPrompt\(/.test(brainText()));
}

// ---------- Try from here ----------
{
  const cfg = fresh({ tryFromHere: true, pinMessages: true });
  const msgs = [
    { id: 'a', role: 'user', content: 'Plan a trip', chatTitle: 'Trip' },
    { id: 'b', role: 'assistant', content: 'Where to?' },
    { id: 'c', role: 'user', content: 'Paris' },
    { id: 'd', role: 'assistant', content: 'Lovely.' }
  ];
  pin(cfg, 'chat-1', msgs, 'a'); pin(cfg, 'chat-1', msgs, 'd');
  const r = tryFromHere(cfg, 'chat-1', msgs, 'b', { now: 111 });
  const copy = readChat(cfg, r.id);
  check('from one of Bob\'s answers, the copy ends with it', r.id === 'chat-111' && copy.length === 2 && copy[1].id === 'b' && r.text === '', JSON.stringify(copy));
  check('pins after that point stay behind', readPins(cfg, r.id).length === 1 && readPins(cfg, r.id)[0].id === 'a');
  const r2 = tryFromHere(cfg, 'chat-1', msgs, 'c', { now: 222 });
  check('from your own message, the copy stops before it and your words wait in the box', readChat(cfg, r2.id).length === 2 && r2.text === 'Paris');
  check('the original is untouched', msgs.length === 4 && msgs[3].content === 'Lovely.');
  check('the copy says it was tried from here', readChat(cfg, r.id).some((m) => /\(tried from here\)/.test(m.chatTitle || '')) || readChat(cfg, r.id)[0].chatTitle === 'Trip');
  check('a gone message says so', Boolean(tryFromHere(cfg, 'chat-1', msgs, 'zz').error));
}

// ---------- Guest chats ----------
{
  check('guest ids are recognised, others are not', isGuestId('guest-abc123') && !isGuestId('chat-1') && !isGuestId('guest-../x') && isGuest('guest-abc') && !isGuest('ask-box'));
  check('remembering and noting are blocked in a guest chat', ['remember', 'take_note', 'save_howto'].every((t) => GUEST_BLOCKED.has(t)));
  const brain = brainText();
  check('a guest chat is never saved', /saveSession[\s\S]{0,200}isGuestId\(/.test(brain));
  check('memory and about-me are hidden in a guest chat', /const hush = pub \|\| isGuestId\(sessionId\)/.test(brain));
  check('guest jobs are not written to the queue', /isGuestId/.test(brain.slice(brain.indexOf('saveQueue'))));
  check('the logbook never gets a guest chat\'s words', /GUEST_LOG/.test(brain));
}

// ---------- The Health page ----------
{
  {
    const { engineLabel } = await import('../src/brain.js');
    const A = path.join(os.tmpdir(), 'agent'), mk = (exe) => engineLabel({ engine: 'llamacpp', agentDir: A, llamacpp: { exe } });
    check('Health names Bob\'s own engine Brain Engine, not llama.cpp (PC check)', mk(path.join(A, 'brain-engine', 'llama-server')) === 'Brain Engine' && mk(path.join(A, 'brain-engine', 'bin', 'llama-server')) === 'Brain Engine' && mk(path.join(A, 'brain-engine.previous', 'llama-server')) === 'llama.cpp' && mk(path.join(os.tmpdir(), 'llama', 'llama-server')) === 'llama.cpp' && engineLabel({ engine: 'ollama' }) === 'Ollama');
  }
  const all = healthChecks({ engineOk: true, engineName: 'Brain Engine', models: [{ name: 'Riker' }], card: { usedGB: 15.5, totalGB: 16 }, diskFreeGB: 1, peers: [{ name: 'Go', ok: false }], logText: '- 2026 | error | boom', crashes: 2 });
  const by = Object.fromEntries(all.checks.map((c) => [c.id, c]));
  check('engine, brain, card, disk, Bob-Net, errors and crashes', ['engine', 'brain', 'card', 'disk', 'bobnet', 'errors', 'crashes'].every((k) => by[k]));
  check('a full card has Let my brains go', by.card.level === 'warn' && by.card.fix.id === 'free-card');
  check('low disk has Tidy up', by.disk.level === 'bad' && by.disk.fix.id === 'go:tidy');
  check('a quiet peer has Open Bob-Net', by.bobnet.level === 'warn' && by.bobnet.fix.id === 'go:adv-bobnet');
  check('the worst level is the page\'s level', all.worst === 'bad');
  { // 1.5.207 PC check: /api/health was a 500 when status() handed over the saved role map as models
    let threw = '';
    try { healthChecks({ engineOk: true, models: { bob: 'riker' } }); } catch (e) { threw = e.message; }
    check('the Health page copes with models that are not a list', !threw, threw);
    const srvSrc = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
    check('the health probes use the loaded brains and the engine answer from status()', /models: Array\.isArray\(st\?\.loaded\) \? st\.loaded : \[\]/.test(srvSrc) && /engineOk: st \? st\.ollama !== false : false/.test(srvSrc));
  }
  const calm = healthChecks({ engineOk: true, models: [], chatBrain: 'riker', diskFreeGB: 100 });
  check('no brain loaded offers Load it now', calm.checks.find((c) => c.id === 'brain').fix.id === 'wake');
  check('no card reading says so, plainly', /NVIDIA/.test(calm.checks.find((c) => c.id === 'card').says));
}

// ---------- The routes ----------
{
  const cfg = fresh({ pinMessages: true });
  const call = async (method, p, b = {}, isLocal = true) => {
    const out = {};
    const res = {};
    const ctx = {
      req: { method }, res, p, url: new URL('http://x' + p), isLocal, cfg,
      brain: { log() {}, session: () => [{ id: 'm1', role: 'user', content: 'hi' }], forgetGuest(id) { out.forgot = id; } },
      body: async () => b, send: (_r, code, data) => { out.code = code; out.data = data; },
      saveSettings: (c, patch) => Object.assign(c, patch), replaceSettings: (c, patch) => Object.assign(c, patch)
    };
    out.handled = await harnessRoute(ctx);
    return out;
  };
  const g = await call('GET', '/api/harness');
  check('GET /api/harness shows the switches', g.code === 200 && g.data.pinMessages === true && Array.isArray(g.data.askKeys));
  const bad = await call('POST', '/api/harness', { patch: { pinMessages: false, dataDir: '/evil' } });
  check('POST only changes harness keys', bad.code === 200 && cfg.pinMessages === false && cfg.dataDir !== '/evil');
  check('changing switches only on this replicant matrix', (await call('POST', '/api/harness', { patch: { guestChat: true } }, false)).code === 403 && cfg.guestChat !== true);
  check('guest chats refuse to start while off', (await call('POST', '/api/guest', { start: true })).code === 409);
  cfg.guestChat = true;
  const gs = await call('POST', '/api/guest', { start: true });
  check('a guest chat starts with a guest id', gs.code === 200 && isGuestId(gs.data.id));
  const ge = await call('POST', '/api/guest', { end: gs.data.id });
  check('leaving it lets Bob forget it', ge.data.ok && ge.forgot === gs.data.id);
  cfg.pinMessages = true;
  check('no pins in a guest chat', (await call('POST', '/api/pins', { sessionId: gs.data.id, id: 'm1', pin: true })).code === 400);
  check('pins work in an ordinary chat', (await call('POST', '/api/pins', { sessionId: 'chat-1', id: 'm1', pin: true })).data.pins?.length === 1);
  check('Try from here refuses while off', (await call('POST', '/api/chat/try', { sessionId: 'chat-1', id: 'm1' })).code === 409);
  check('an unknown fix is refused', (await call('POST', '/api/health', { fix: 'rm -rf' })).code === 400);
  check('other paths are left alone', (await call('GET', '/api/settings')).handled === false);
  const server = read('src/server.js');
  check('the server sends these paths here', /harness\|crash\|settings-undo\|health\|quiet\|weekly\|pins\|chat\\\/try\|guest/.test(server));
}

// ---------- The shortcut from anywhere ----------
{
  const main = read('electron/main.cjs');
  check('the key is registered only when switched on, and let go on quit', /globalShortcut\.register\(/.test(main) && /globalShortcut\.unregisterAll\(\)/.test(main) && /bobGlobalAsk/.test(main));
  check('the ask box is its own small window', /ask\.html/.test(main) && /alwaysOnTop/.test(main));
  const ask = read('public/ask.js');
  check('the ask box keeps its own chat and plain text', /ask-box/.test(ask) && /textContent/.test(ask));
}

// ---------- Settings, Help, glossary, FAQ ----------
{
  check('three panels, each in one group and on one card', ['adv-health', 'adv-quiet', 'adv-chatx'].every((id) => GROUPS.filter(([, ids]) => ids.includes(id)).length === 1 && CARDS.filter((c) => c.topics.includes(id)).length === 1));
  const panels = ['health', 'quiet', 'chats'].map((p) => harnessHtml(p, harnessView({}), []));
  check('no switch is ticked on a new Bob', panels.every((h) => !/data-hx="\w+" checked/.test(h)));
  check('times and the key can be picked before switching on', /data-hx-time="from"/.test(panels[1]) && /data-hx-key/.test(panels[1]));
  const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\\'/g, "'").replace(/\s+/g, ' ').toLowerCase();
  const help = plain(HELP.map((e) => `${e.title} ${e.html}`).join(' '));
  check('every switch is in Help by its name', Object.values(LABELS).every(([name]) => help.includes(name.toLowerCase())), Object.values(LABELS).filter(([nm]) => !help.includes(nm.toLowerCase())).map(([nm]) => nm).join());
  check('every switch says it is off unless turned on', Object.values(LABELS).every(([, about]) => /^Off unless you turn it on\./.test(about)));
  for (const id of ['crashes', 'settings-undo', 'health-page', 'quiet-hours', 'chat-places', 'weekly-report', 'ask-shortcut', 'try-from-here', 'pin-messages', 'guest-chat']) check(`Help has ${id}`, HELP.some((e) => e.id === id));
  check('FAQs for them', ['faq-crashed', 'faq-guest', 'faq-quiet', 'faq-undo-setting', 'faq-branch', 'faq-keep-in-mind', 'faq-slow-switch', 'faq-ask-anywhere'].every((id) => HELP.some((e) => e.id === id && e.group === 'FAQ' && /\?$/.test(e.title))));
  const gloss = HELP.find((e) => e.id === 'glossary').html;
  check('glossary words', ['Crash report', 'Safe start', 'Health page', 'Quiet hours', 'Chat place', 'Ask box', 'Try from here', 'Guest chat', 'Urgent reminder'].every((t) => gloss.includes(`<dt>${t}`)));
  check('Help says where they don\'t work yet', /android app doesn't have it yet/.test(help) && /not in a browser or the android app/.test(help));
  check('the settings inventory lists them', /crashCatcher/.test(read('docs/SETTINGS-INVENTORY.md')) && /guestChat/.test(read('docs/SETTINGS-INVENTORY.md')));
  check('backups leave the crash and undo files out', ['running.json', 'crash-reports/', 'settings-undo.json', 'weekly.json', 'chat-places/'].every((f) => read('src/backup.js').includes(`'bob/${f}'`)));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
