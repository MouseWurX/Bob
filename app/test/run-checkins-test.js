// 1.5.78 Check-ins: off by default, only speaks up when something needs you, no brain for the built-in checks,
// your own lines on the small brain on the processor (beside the main brain), never in Gaming, let go afterwards,
// one catch-up for missed rounds, no repeats within a day, the route, Help coverage and Bob knowing the setting.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { CheckIns, cleanCheckins, whenOf, says, checkinsRoute, STALL_MS, OWN_WAIT_MS, parseJson } from '../src/checkins.js';
import { CHECKS } from '../src/checkin-settings.js';
import { HELP } from '../public/help-content.js';
import { plainText, settingsNow } from '../src/self-help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime();

function setup({ engine = 'llamacpp', checkins = {}, free = 500e9 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ci-'));
  const cfg = { dataDir: path.join(tmp, 'inn', 'bob'), logbook: path.join(tmp, 'inn', 'logbook.md'), agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), engine, session: 'normal', userName: 'Sam', checkins };
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const calls = { chat: [], unload: [], loaded: false, reply: '{"checks":[]}' };
  const events = [], logs = [];
  const brain = {
    cfg, turns: new Map(), queue: [], approvals: new Map(),
    broadcast: (ev) => events.push(ev), log: (k, t) => logs.push(`${k}: ${t}`),
    shop: { dl: [], downloadsView() { return this.dl; } },
    schedules: { items: [], list() { return this.items; } },
    engine: {
      async isLoaded() { return calls.loaded; },
      async chat(o) { calls.chat.push(o); return { content: calls.reply }; },
      async unload(m, o) { calls.unload.push([m, o]); return [m]; }
    }
  };
  let clock = L(2026, 11, 4, 8, 0);
  const disk = { free };
  const c = new CheckIns(brain, { now: () => clock, statfs: () => ({ bavail: disk.free / 4096, bsize: 4096 }) });
  return { cfg, brain, c, calls, events, logs, disk, at: (t) => { clock = t; }, get now() { return clock; } };
}

// ---- settings
{
  const d = cleanCheckins();
  check('off by default, every day at 09:00, all four built-in checks ticked, no own lines', d.enabled === false && d.how === 'daily' && d.at === '09:00' && Object.keys(CHECKS).every((k) => d.checks[k] === true) && d.own.length === 0);
  const x = cleanCheckins({ enabled: 'yes', how: 'monthly', at: '25:00', hours: 99, own: ['  did  the build finish? ', '', ...Array(20).fill('x'.repeat(400))] });
  check('bad values fall back; only a real true switches it on', x.enabled === false && x.how === 'daily' && x.at === '09:00' && x.hours === 4);
  check('own lines are tidied, at most 8, at most 160 characters each', x.own[0] === 'did the build finish?' && x.own.length === 8 && x.own.every((l) => l.length <= 160));
  check('plain-English timing', says({ how: 'daily', at: '07:30' }) === 'every day at 07:30' && says({ how: 'weekdays', at: '09:00' }) === 'every weekday at 09:00' && says({ how: 'hours', hours: 3 }) === 'every 3 hours' && whenOf({ how: 'hours', hours: 1 }).everyMinutes === 60);
  check('JSON is found inside chatter', parseJson('Sure! {"checks":[{"n":1}]} done')?.checks?.length === 1 && parseJson('nope') === null);
}

// ---- off: nothing happens at all
{
  const t = setup();
  t.brain.shop.dl.push({ id: 'a', name: 'Big model', state: 'failed', error: 'checksum' });
  await t.c.tick(); t.at(L(2026, 11, 9, 12)); await t.c.tick();
  check('while off: no round, no card, no brain, no file', !t.events.length && !t.calls.chat.length && !fs.existsSync(t.c.file));
}

// ---- on: due at the time, only speaks when something needs you, catch-up once
{
  const t = setup();
  t.c.change({ enabled: true, at: '09:00' });
  check('switching on counts from now: next is today at 09:00', t.c.view().next === new Date(L(2026, 11, 4, 9)).toISOString());
  await t.c.tick();
  check('not due yet: nothing', !t.events.length && !t.c.state().lastRun);
  t.at(L(2026, 11, 4, 9, 0)); await t.c.tick();
  check('all fine: a round runs but nobody is bothered', t.c.state().lastRun && !t.events.length && t.c.view().last.needs.length === 0 && t.logs.some((l) => /check-in: all fine/.test(l)));
  check('no own lines: the brain is never touched', !t.calls.chat.length && !t.calls.unload.length);
  // Problems appear
  t.brain.shop.dl.push({ id: 'm1', name: 'Qwen big', state: 'failed', error: 'checksum did not match' });
  t.brain.approvals.set('x', () => {});
  t.brain.queue.push({ id: 'j1', text: 'make a song about cats', state: 'failed', error: 'music engine missing', doneAt: L(2026, 11, 4, 20) });
  t.brain.queue.push({ id: 'j0', text: 'old failure', state: 'failed', doneAt: L(2026, 11, 1, 10) });
  t.brain.schedules.items.push({ id: 's1', name: 'Tidy Downloads', says: 'every day at 08:00', enabled: true, lastResult: { ok: false, note: 'nothing to do', at: new Date(L(2026, 11, 5, 8)).toISOString() } });
  t.disk.free = 4e9;
  t.at(L(2026, 11, 7, 12)); await t.c.tick(); // away 3 days
  const ev = t.events.at(-1);
  const titles = ev?.items?.map((i) => i.title).join(' | ') || '';
  check('something needs you: one Check-in card', t.events.length === 1 && ev.type === 'checkin');
  check('it lists the failed download, the waiting OK card, the failed task, the schedule and low disk', /Download failed: Qwen big/.test(titles) && /1 OK card waiting/.test(titles) && /Task didn't finish: make a song/.test(titles) && /Scheduled job didn't run: Tidy Downloads/.test(titles) && /Only 4 GB free/.test(titles), titles);
  check('failures from before the last check-in are not dug up again', !/old failure/.test(titles));
  await t.c.tick();
  check('three missed days catch up once, not three times', t.events.length === 1 && t.c.state().lastRun === new Date(L(2026, 11, 7, 12)).toISOString());
  // Next round: same issues within a day are not repeated
  t.c.change({ how: 'hours', hours: 1 });
  t.at(L(2026, 11, 7, 13, 1)); await t.c.tick();
  check('the same things an hour later: no second card', t.events.length === 1 && t.c.view().last.needs.length >= 2);
  t.brain.shop.dl.push({ id: 'm2', name: 'Kokoro', state: 'failed', error: 'offline' });
  t.at(L(2026, 11, 7, 14, 2)); await t.c.tick();
  check('a new problem: a card again', t.events.length === 2 && t.events[1].items.some((i) => /Kokoro/.test(i.title)));
  t.at(L(2026, 11, 8, 11, 0)); await t.c.tick();
  check('still there after most of a day: one reminder', t.events.length === 3);
  // Unticked checks are skipped
  t.c.change({ checks: { disk: false, downloads: false, tasks: false, schedules: false } });
  t.at(L(2026, 11, 8, 12, 1)); await t.c.tick();
  check('unticked checks are not looked at', t.c.view().last.needs.length === 0);
  // Off again
  t.c.change({ enabled: false }); const n = t.events.length;
  t.at(L(2026, 11, 9, 12)); await t.c.tick();
  check('switched off: nothing more', t.events.length === n && t.c.view().next === '');
}

// ---- stalled downloads are told apart from moving ones
{
  const t = setup({ checkins: { enabled: true, how: 'hours', hours: 1 } });
  t.c.change({ enabled: true });
  const d = { id: 'big', name: 'Gemma 26B', state: 'downloading', done: 100, total: 1000 };
  const m = { id: 'mov', name: 'Moving one', state: 'downloading', done: 100, total: 1000 };
  t.brain.shop.dl.push(d, m);
  for (let i = 0; i <= 60; i++) { t.at(L(2026, 11, 4, 8, i)); m.done += 5; await t.c.tick(); }
  const titles = (t.events.at(-1)?.items || []).map((i) => i.title).join(' | ');
  check('a download with no progress for 15 minutes "stopped moving"; a moving one is fine', /stopped moving: Gemma 26B/.test(titles) && !/Moving one/.test(titles), titles);
  check('STALL_MS is 15 minutes', STALL_MS === 15 * 60e3);
}

// ---- your own lines: small brain, processor, beside, never in Gaming, let go after
{
  const t = setup();
  t.c.change({ enabled: true, own: ['Did the build finish?', 'Did the backup run?'] });
  t.calls.reply = 'Here you go: {"checks":[{"n":1,"needs":true,"why":"The build task failed at 03:10."},{"n":2,"needs":"unsure","why":""}]}';
  t.brain.cfg.session = 'light'; // Gaming
  t.at(L(2026, 11, 4, 9, 0)); await t.c.tick();
  check('in Gaming: built-in checks run, no brain, own lines wait', t.c.state().lastRun && !t.calls.chat.length && t.c.state().ownWaiting && /Gaming session ends/.test(t.c.view().last.ownNote));
  t.at(L(2026, 11, 4, 9, 5)); await t.c.tick();
  check('still Gaming a few minutes later: still no brain', !t.calls.chat.length);
  t.brain.cfg.session = 'normal'; t.brain.turns.set('t', {});
  t.at(L(2026, 11, 4, 9, 6)); await t.c.tick();
  check('Gaming over but Bob is answering: waits', !t.calls.chat.length);
  t.brain.turns.clear();
  t.at(L(2026, 11, 4, 9, 7)); await t.c.tick();
  const o = t.calls.chat[0] || {};
  check('Bob free: the small brain reads the lines once', t.calls.chat.length === 1 && o.model === 'gemma4:e4b');
  check('on the processor, beside the main brain (no swap), no thinking', o.cpu === true && o.beside === true && o.think === false);
  check('it is given the lines and the facts, and asked for JSON', /Did the build finish\?/.test(o.messages[1].content) && /Logbook/.test(o.messages[1].content) && /JSON/.test(o.messages[0].content));
  check('a brain loaded just for this is let go after (same place)', t.calls.unload.length === 1 && t.calls.unload[0][0] === 'gemma4:e4b' && t.calls.unload[0][1].beside === true);
  const ev = t.events.at(-1);
  check('a line that needs you is on the card with its reason', ev?.type === 'checkin' && ev.items.some((i) => i.title === 'Did the build finish?' && /03:10/.test(i.detail)));
  check('"unsure" stays in Settings, not on the card', !ev.items.some((i) => /backup/.test(i.title)) && t.c.view().last.own.find((x) => /backup/.test(x.line)).needs === 'unsure');
  check('nothing waits any more', !t.c.state().ownWaiting);
  // Already loaded (or "Free memory when Bob is idle" off): left as it was
  t.calls.loaded = true; t.calls.unload.length = 0;
  await t.c.run({ force: true });
  check('a brain that was already loaded stays loaded', t.calls.unload.length === 0);
  t.calls.loaded = false; t.brain.cfg.brainMode = 'always';
  await t.c.run({ force: true });
  check('"Free memory when Bob is idle" off: not unloaded either', t.calls.unload.length === 0);
}
{
  const t = setup({ engine: 'ollama' });
  t.c.change({ enabled: true, own: ['Anything stuck?'] });
  t.calls.reply = '{"checks":[{"n":1,"needs":false,"why":"All tasks finished."}]}';
  t.at(L(2026, 11, 4, 9)); await t.c.tick();
  const o = t.calls.chat[0] || {};
  check('Ollama: on the processor, no beside flag; all fine means no card', o.cpu === true && !('beside' in o) && !t.events.length && t.calls.unload.length === 1);
  t.calls.chat.length = 0; t.brain.cfg.session = 'light';
  const r = await t.c.run({ force: true });
  check('"Check in now" in Gaming still never loads a brain', !t.calls.chat.length && /Gaming/.test(r.ownNote));
}
{
  const t = setup();
  t.c.change({ enabled: true, own: ['x'] });
  t.brain.cfg.session = 'light';
  t.at(L(2026, 11, 4, 9)); await t.c.tick();
  t.brain.cfg.session = 'normal';
  t.at(L(2026, 11, 4, 9) + OWN_WAIT_MS + 60e3); t.brain.turns.set('t', {}); await t.c.tick();
  check('own lines that waited 6 hours are skipped for that round, never piled up', !t.c.state().ownWaiting && /skipped/.test(t.c.view().last.ownNote) && !t.calls.chat.length);
}
{
  const t = setup();
  t.c.change({ enabled: true, own: ['x'] });
  t.brain.engine.chat = async () => { throw new Error('engine stopped'); };
  t.at(L(2026, 11, 4, 9)); await t.c.tick();
  check('a brain error is a note, not a crash, and the brain is still let go', /couldn't read your own checks/.test(t.c.view().last.ownNote) && t.calls.unload.length === 1);
}

// ---- the route
{
  const t = setup();
  const res = {}; let got = null;
  const send = (_r, code, body) => { got = { code, body }; };
  const call = async (method, isLocal, b) => { got = null; await checkinsRoute({ req: { method }, p: '/api/checkins', isLocal, brain: t.brain, body: async () => b, send, res }); return got; };
  const g = await call('GET', false);
  check('GET shows the settings (your other devices can look)', g.code === 200 && g.body.enabled === false && g.body.says === 'every day at 09:00' && g.body.checkLabels.downloads === CHECKS.downloads.label);
  check('changes from another device are refused', (await call('POST', false, { enabled: true })).code === 403 && t.c.settings.enabled === false);
  const on = await call('POST', true, { enabled: true, how: 'weekdays', at: '07:15', own: ['Did the build finish?'] });
  check('changes on the PC are saved to settings.json', on.code === 200 && on.body.enabled && on.body.how === 'weekdays' && JSON.parse(fs.readFileSync(t.cfg.settingsFile, 'utf8')).checkins.at === '07:15');
  t.brain.shop.dl.push({ id: 'z', name: 'Z', state: 'failed', error: 'checksum did not match' });
  const now = await call('POST', true, { runNow: true });
  check('"Check in now" runs a round and reports it', now.code === 200 && now.body.ran.needs.length >= 1 && now.body.last);
  check('panel shows the display name, not the engine tag', (() => { t.brain.shop.catalog = { models: [{ id: 'gemma4-e4b', name: 'Gemma 4 E4B', ollama: 'gemma4:e4b' }] }; return t.c.view().smallBrain === 'Gemma 4 E4B'; })());
  check('a failed download reads as two sentences', /did not match\. Downloads has Try again\./.test(t.c.builtIn(0).find((f) => /dl-failed/.test(f.key))?.detail || ''));
  check('Bob knows the setting (bob_help)', /Check-ins: on, every weekday at 07:15, 1 of your own check/.test(settingsNow(t.cfg)) && /Check-ins: off/.test(settingsNow({})));
}

// ---- Help, glossary, FAQ, and every label on the panel
{
  const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
  const norm = (s) => plainText(s).replace(/\\'/g, "'").replace(/\s+/g, ' ').toLowerCase();
  const help = norm(HELP.map((e) => `${e.title} ${e.html}`).join(' '));
  const panel = read('public/checkins.js');
  const labels = [...panel.matchAll(/<strong>([^<$]{3,60})<\/strong>/g)].map((m) => m[1].replace(/\\'/g, "'").replace(/:$/, ''));
  const opts = [...panel.matchAll(/<option [^>]*>([^<]+)<\/option>/g)].map((m) => m[1]);
  const buttons = ['Save my checks', 'Check in now'];
  const gone = [...new Set([...labels, ...opts, ...buttons, ...Object.values(CHECKS).map((c) => c.label)])].filter((l) => !help.includes(norm(l)));
  check('every label, option, button and check on the panel is in Help', labels.length >= 5 && !gone.length, gone.join(' | '));
  check('Help has the feature, its settings, a glossary line and FAQs', ['checkins', 'settings-checkins', 'faq-checkins-games', 'faq-checkins-quiet'].every((id) => HELP.some((e) => e.id === id)) && /<dt>Check-in<\/dt>/.test(read('public/help-content.js')));
  check('Help says it starts off and never changes anything', /off unless you turn it on/.test(help) && /it only looks/.test(help));
  check('the panel is in Settings, Show advanced settings', /\['checkins', '🔔 Check-ins'/.test(read('public/cellar.js')) && /mountCheckins\(/.test(read('public/cellar.js')));
  check('the chat shows a Check-in card for the event', /case 'checkin'/.test(read('public/app.js')));
  check('the settings inventory lists it', /\| Check-ins \| Check in on a schedule \|/.test(read('docs/SETTINGS-INVENTORY.md')));
  check('no platform-only code: no Windows paths, PowerShell or schtasks', !/powershell|schtasks|\\\\|win32/i.test(read('src/checkins.js')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
