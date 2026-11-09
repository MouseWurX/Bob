// 1.4.0: the Schedules hand, wired: off by default, every schedule approved, runs go through the chat (so every
// action inside still asks), "Stop everything" stops them, and the Windows task stays a separate opt-in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { scheduleTools, schedulesFor, runScheduled, schedulesView, whenFrom, SCHEDULE_SESSION } from '../src/hands-schedules.js';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { stopEverything } from '../src/hands.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-hsched-'));
const dataDir = path.join(dir, 'inn', 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, settingsFile: path.join(dataDir, 'settings.json'), userName: 'Sam' };
const queued = [], sent = [];
const brain = { cfg, log() {}, enqueue: (sid, text) => { queued.push({ sid, text }); return { jobId: 'abcdef123456' }; }, broadcast: (e) => sent.push(e), saveHands(h) { cfg.hands = h; }, denyHands: () => 0 };
const t = scheduleTools(brain);
const args = { name: 'Tidy Downloads', task: 'Tidy my Downloads folder.', type: 'weekly', days: ['mon'], at: '09:00' };

check('Schedules is a Hand with its own switch and tools', HANDS.schedules && HANDS.schedules.tools.join() === 'schedule_job,list_schedules,change_schedule');
check('off by default: its tools are hidden', ['schedule_job', 'list_schedules', 'change_schedule'].every((n) => toolsOff(cfg).includes(n)));
let threw = '';
try { t.schedule_job.check(args); } catch (e) { threw = e.message; }
check('and refuse to work if asked anyway', /switched off/.test(threw));
cfg.hands = cleanHands({ enabled: true, schedules: { on: true } });
check('switched on (master + Schedules): the tools appear', !toolsOff(cfg).includes('schedule_job'));
const card = t.schedule_job.check(args);
check('adding a schedule always asks, and the card says when and what', /Add the schedule "Tidy Downloads"/.test(card.text) && /Monday/i.test(card.text) && /Tidy my Downloads/.test(card.text) && /still asks/.test(card.text));
check('weekdays by name work', whenFrom({ type: 'weekly', days: ['Mon', 'thu'], at: '9:30' }).days.join() === '1,4');
const out = await t.schedule_job.run(args);
const list = schedulesFor(brain).list();
check('once approved it is saved and switched on', /Scheduled "Tidy Downloads"/.test(out) && list.length === 1 && list[0].enabled && list[0].job.task === 'Tidy my Downloads folder.');
check('switching one off never needs asking; on and remove do', t.change_schedule.check({ id: list[0].id, action: 'off' }) === false && /Switch on/.test(t.change_schedule.check({ id: list[0].id, action: 'on' }).text) && /Remove/.test(t.change_schedule.check({ id: list[0].id, action: 'remove' }).text));
const r = runScheduled(brain, { ...list[0], says: 'every Monday at 09:00', late: true });
check('a due schedule starts in the Schedules chat like a message, clearly marked', r.ok && queued[0].sid === SCHEDULE_SESSION && /^\(Scheduled job "Tidy Downloads"/.test(queued[0].text) && /catching up/.test(queued[0].text) && sent.some((e) => e.type === 'schedule-run'));
check('nothing is due before its time', schedulesFor(brain).due(Date.now()).length === 0);
const far = Date.now() + 8 * 24 * 3600e3;
check('it comes due at its time', schedulesFor(brain).due(far).length === 1);
stopEverything(brain);
check('"Stop everything" turns Hands off, so nothing is due any more', schedulesFor(brain).due(far).length === 0);
const v = schedulesView(brain);
check('the window gets the list, and the Windows task is off by default', v.list.length === 1 && v.windowsTask === false && v.on === false);
const ui = fs.readFileSync(new URL('../public/hands.js', import.meta.url), 'utf8');
check('Settings shows each schedule with a switch, Remove, and the separate Windows-task opt-in', /data-hsched=/.test(ui) && /data-hscheddel=/.test(ui) && /data-hschedtask/.test(ui) && /Off by default/.test(ui));
const srv = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
check('the ticker starts with Bob, and changes are PC-only', /startSchedules\(brain\)/.test(srv) && /Schedules can only be changed on this replicant matrix itself/.test(fs.readFileSync(new URL('../src/hands-schedules.js', import.meta.url), 'utf8')));

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
