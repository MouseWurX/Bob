// Tests Bob's schedules: storing them, once/daily/weekly/interval in local time, one catch-up for missed
// runs, off by default, the opt-in Windows task script, and that Remove Bob removes the task.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Schedules, cleanWhen, nextAfter, describe, startTicker, taskArgs, setWindowsTask, removeTaskCommand, TASK_NAME } from '../src/schedules.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const throws = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sched-'));
const cfg = { dataDir: path.join(tmp, 'inn', 'bob'), logbook: path.join(tmp, 'inn', 'logbook.md'), port: 7777 };
fs.mkdirSync(cfg.dataDir, { recursive: true });
const L = (y, mo, d, h = 0, mi = 0) => new Date(y, mo - 1, d, h, mi).getTime(); // local time
const job = { kind: 'files', what: 'back up a project' };

// --- "when" checks and the clock maths
check('when must be once, daily, weekly or interval', throws(() => cleanWhen({ type: 'hourly' }), /once, daily, weekly/) && throws(() => cleanWhen(null), /when/));
check('times are 24-hour HH:MM and get tidied', cleanWhen({ type: 'daily', at: '9:05' }).at === '09:05' && throws(() => cleanWhen({ type: 'daily', at: '25:00' }), /09:00/) && throws(() => cleanWhen({ type: 'daily', at: 'noon' }), /09:00/));
check('once needs a real date', throws(() => cleanWhen({ type: 'once', at: '09:00', date: '2026-02-30' }), /date/) && cleanWhen({ type: 'once', at: '09:00', date: '2026-11-09' }).date === '2026-11-09');
check('weekly needs at least one day 0-6, tidied and sorted', throws(() => cleanWhen({ type: 'weekly', at: '09:00', days: [9] }), /day/) && cleanWhen({ type: 'weekly', at: '09:00', days: [4, 1, 1] }).days.join() === '1,4');
check('interval is at least 5 minutes', throws(() => cleanWhen({ type: 'interval', everyMinutes: 1 }), /5 minutes/) && cleanWhen({ type: 'interval', everyMinutes: '30' }).everyMinutes === 30);

const daily9 = cleanWhen({ type: 'daily', at: '09:00' });
check('daily: later the same day, else tomorrow', nextAfter(daily9, L(2026, 11, 3, 8, 0)) === L(2026, 11, 3, 9) && nextAfter(daily9, L(2026, 11, 3, 9, 0)) === L(2026, 11, 4, 9));
const mon = cleanWhen({ type: 'weekly', days: [1], at: '09:00' }); // 2026-11-09 is a Monday
check('weekly: the next chosen weekday', nextAfter(mon, L(2026, 11, 3, 12)) === L(2026, 11, 9, 9) && new Date(L(2026, 11, 9)).getDay() === 1);
check('weekly: on the day but past the time goes a week on', nextAfter(mon, L(2026, 11, 9, 9, 1)) === L(2026, 11, 16, 9));
const once = cleanWhen({ type: 'once', date: '2026-11-09', at: '09:00' });
check('once: fires once, never after', nextAfter(once, L(2026, 11, 1)) === L(2026, 11, 9, 9) && nextAfter(once, L(2026, 11, 9, 9)) === null);
// Daylight saving: across the change the wall-clock time stays 09:00 (in zones that have one).
const across = nextAfter(daily9, L(2026, 3, 7, 10)); // into the next day, near a spring change in North America
check('daily stays on local wall-clock time across daylight saving', new Date(across).getHours() === 9 && new Date(nextAfter(daily9, L(2026, 10, 31, 10))).getHours() === 9);
check('plain-English descriptions', describe(mon) === 'every Monday at 09:00' && describe(cleanWhen({ type: 'weekly', days: [1, 2, 3, 4, 5], at: '08:30' })) === 'every weekday at 08:30' && describe(cleanWhen({ type: 'interval', everyMinutes: 120 })) === 'every 2 hours' && describe(daily9) === 'every day at 09:00' && describe(once) === 'once, on 2026-11-09 at 09:00');

// --- storing, off by default
let clock = L(2026, 11, 2, 12);
let handOn = false;
const s = new Schedules(cfg, { isOn: () => handOn, now: () => clock });
check('no file and nothing scheduled at first', s.list().length === 0 && !fs.existsSync(path.join(cfg.dataDir, 'schedules.json')));
const a = s.add({ name: 'Back up the project', job, when: { type: 'weekly', days: [1], at: '09:00' } });
check('a new schedule is switched off unless asked', a.enabled === false && a.nextDue === '' && a.says === 'every Monday at 09:00');
check('it is saved in inn\\bob\\schedules.json', JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'schedules.json'), 'utf8')).schedules[0].name === 'Back up the project');
check('name and job are required', throws(() => s.add({ job, when: daily9 }), /name/) && throws(() => s.add({ name: 'x', when: daily9 }), /do/) && throws(() => s.add({ name: 'x', job: [], when: daily9 }), /do/));
s.update(a.id, { enabled: true });
check('switched on, it knows its next run (saved for the Windows task too)', s.get(a.id).nextDue === new Date(L(2026, 11, 9, 9)).toISOString() && JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'schedules.json'), 'utf8')).schedules[0].nextDue === s.get(a.id).nextDue);
clock = L(2026, 11, 9, 9, 0);
check('while the Schedules hand is off nothing is ever due', s.due().length === 0);
handOn = true;
check('with the hand on, it is due at its time', s.due().map((e) => e.id).join() === a.id && s.due()[0].late === false);

// --- missed runs catch up once
clock = L(2026, 11, 30, 18); // three Mondays missed
const late = s.due();
check('three missed Mondays are due once, marked late', late.length === 1 && late[0].late === true && late[0].dueAt === new Date(L(2026, 11, 9, 9)).toISOString());
check('start() takes it so the next tick does not run it twice', s.start(a.id) && !s.start(a.id) && s.due().length === 0);
s.markRan(a.id, { ok: true, note: 'copied 12 files' });
const after = s.get(a.id);
check('after the catch-up the next run is the next real Monday', s.due().length === 0 && after.nextDue === new Date(L(2026, 12, 7, 9)).toISOString() && after.runs === 1 && after.lastResult.ok && after.lastResult.note === 'copied 12 files');

// --- interval
const iv = s.add({ name: 'Tidy Downloads', job, when: { type: 'interval', everyMinutes: 60 }, enabled: true });
check('interval counts from when it was switched on', iv.nextDue === new Date(clock + 3600000).toISOString() && s.due().length === 0);
clock += 5 * 3600000; // asleep five hours
check('interval: a long gap fires once', s.due().filter((e) => e.id === iv.id).length === 1);
s.markRan(iv.id);
check('interval: then counts from the run', s.get(iv.id).nextDue === new Date(clock + 3600000).toISOString() && s.due().length === 0);

// --- once
const o = s.add({ name: 'One-off', job, when: { type: 'once', date: '2026-12-01', at: '08:00' }, enabled: true });
clock = L(2026, 12, 2, 10); // missed it
check('a missed one-off still runs once', s.due().some((e) => e.id === o.id));
s.markRan(o.id, { ok: false, note: 'folder missing' });
const od = s.get(o.id);
check('after running, a one-off is done and off, and a failure is recorded', od.done && !od.enabled && od.nextDue === '' && od.lastResult.ok === false && !s.due().some((e) => e.id === o.id));

// --- update / turning back on does not fire old catch-ups
s.update(a.id, { enabled: false });
clock = L(2027, 1, 20, 12);
s.update(a.id, { enabled: true });
check('turning a schedule back on counts from now (no surprise catch-up)', !s.due().some((e) => e.id === a.id) && s.get(a.id).nextDue === new Date(L(2027, 1, 25, 9)).toISOString());
s.update(a.id, { when: { type: 'daily', at: '07:00' }, name: '  Morning   backup ' });
check('changing the time starts fresh; names are tidied', s.get(a.id).nextDue === new Date(L(2027, 1, 21, 7)).toISOString() && s.get(a.id).name === 'Morning backup');
check('bad changes are refused and nothing is lost', throws(() => s.update(a.id, { when: { type: 'daily', at: '99:00' } }), /09:00/) && s.get(a.id).when.at === '07:00' && throws(() => s.update('nope', {}), /gone/));
check('nextRun gives the soonest upcoming one', s.nextRun()?.id === a.id || s.nextRun()?.id === iv.id);

// --- remove, limits, broken file, logbook
check('remove takes it off the list', s.remove(o.id) && !s.get(o.id) && s.remove(o.id) === false);
const lb = fs.readFileSync(cfg.logbook, 'utf8');
check('every change and run goes in the logbook', /\| schedules \| added "Back up the project"/.test(lb) && /ran "Back up the project": done \(copied 12 files\)/.test(lb) && /removed "One-off"/.test(lb) && /did not finish \(folder missing\)/.test(lb));
fs.writeFileSync(path.join(cfg.dataDir, 'schedules.json'), '{ not json');
const s2 = new Schedules(cfg, { isOn: () => true, now: () => clock });
check('a broken file is kept to one side and Bob starts an empty list', s2.list().length === 0 && fs.readdirSync(cfg.dataDir).some((f) => f.startsWith('schedules.json.broken-')));
check('the default switch is off', new Schedules(cfg).due(L(2030, 1, 1)).length === 0);

// --- ticker
{
  let t = L(2026, 11, 9, 9, 0);
  const s3 = new Schedules({ ...cfg, dataDir: path.join(tmp, 'tick') }, { isOn: () => true, now: () => t });
  const e = s3.add({ name: 'Tick', job, when: { type: 'interval', everyMinutes: 5 }, enabled: true });
  t += 6 * 60000;
  const ran = [];
  const tk = startTicker(s3, async (x) => { ran.push(x.id); return { ok: true, note: 'fine' }; }, { everyMs: 3600000 });
  await tk.tick(); await tk.tick();
  await new Promise((r) => setTimeout(r, 20));
  tk.stop();
  check('the ticker runs a due job once and records it', ran.length === 1 && ran[0] === e.id && s3.get(e.id).runs === 1);
}

// --- the opt-in Windows task
const ps = fs.readFileSync(new URL('../installer/bob-schedule.ps1', import.meta.url), 'utf8');
check('the task script is plain ASCII with no PowerShell 7 syntax', !/[^\x00-\x7F]/.test(ps) && !/\?\?/.test(ps) && !/\?\./.test(ps));
check('the task runs as you, only while signed in, never as admin', /-LogonType Interactive -RunLevel Limited/.test(ps) && !/RunLevel Highest|NT AUTHORITY|UserId SYSTEM|-Verb RunAs/i.test(ps));
check('the task only wakes Bob (hidden) when something is due and he is not open', /'Wake' \{\s*if \(Test-BobOpen\)[^\n]*\n\s*if \(-not \(Test-SomethingDue\)\)/.test(ps) && /-ArgumentList '--hidden'/.test(ps));
check('it only ever starts the real Bob.exe', /function Test-IsBob/.test(ps) && /\.name -eq 'bob'/.test(ps) && /if \(-not \(Test-IsBob \$BobExe\)\) \{ throw/.test(ps));
check('the task name matches what Remove Bob deletes', ps.includes(`$TaskName = '${TASK_NAME}'`) && removeTaskCommand({ SystemRoot: 'C:\\Windows' })[1].join(' ') === `/Delete /TN \\${TASK_NAME} /F`);
check('adding the task needs the installed Bob.exe', throws(() => taskArgs(cfg, true, {}), /installed Bob\.exe/));
{
  const appDir2 = path.join(tmp, 'Bob app');
  fs.mkdirSync(appDir2, { recursive: true }); fs.writeFileSync(path.join(appDir2, 'Bob.exe'), 'MZ');
  const t = taskArgs(cfg, true, { BOB_APP_DIR: appDir2 });
  check('Add passes Bob.exe, the data folder and the port', t.args.includes('Add') && t.args.includes(path.join(appDir2, 'Bob.exe')) && t.args.includes(cfg.dataDir) && t.args.includes('7777'));
  check('Remove passes nothing else', taskArgs(cfg, false, {}).args.slice(-2).join() === '-Action,Remove');
  let seen = null;
  const fake = (exe, args) => { seen = { exe, args }; const h = {}; const on = (k, f) => { h[k] = f; return child; }; const child = { on, stdout: { on: (k, f) => { if (k === 'data') setTimeout(() => f('Added the Bob schedules task.\n'), 1); } }, stderr: { on() {} } }; setTimeout(() => h.exit?.(0), 5); return child; };
  const r = await setWindowsTask(cfg, true, { spawnImpl: fake, env: { BOB_APP_DIR: appDir2, SystemRoot: 'C:\\Windows' } });
  check('setWindowsTask runs Windows PowerShell 5.1 and reports the result', /WindowsPowerShell/.test(seen.exe) && r.ok && r.out === 'Added the Bob schedules task.');
}

// --- Remove Bob deletes the task
const un = fs.readFileSync(new URL('../src/uninstall.js', import.meta.url), 'utf8');
check('Remove Bob deletes the Bob schedules task before the removal window starts', /import \{ removeTaskCommand \} from '\.\/schedules\.js'/.test(un) && un.indexOf('removeTaskCommand(env)') > 0 && un.indexOf('removeTaskCommand(env)') < un.indexOf('launchCommand(args)'));
if (process.platform === 'win32') {
  const { startUninstall } = await import('../src/uninstall.js');
  const home = path.join(tmp, 'Bob home'); const app = path.join(home, 'Bob app');
  fs.mkdirSync(path.join(app, 'resources', 'app'), { recursive: true }); fs.writeFileSync(path.join(app, 'Bob.exe'), 'MZ');
  const calls = [];
  startUninstall({ agentDir: home, innDir: path.join(home, 'inn'), dataDir: path.join(home, 'inn', 'bob'), bobModelsDir: path.join(home, 'models', 'bob') }, {}, { env: { BOB_APP_DIR: app, APPDATA: path.join(tmp, 'R'), SystemRoot: 'C:\\Windows' }, spawnImpl: (exe, args) => { calls.push({ exe, args }); return { unref() {}, on() {} }; } });
  check('on Windows, schtasks /Delete runs first', /schtasks/.test(calls[0].exe) && calls[0].args.includes('/Delete') && calls.length === 2);
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
