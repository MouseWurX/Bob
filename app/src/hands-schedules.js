// The Schedules hand: "every Monday at 9 tidy my Downloads", "every 2 hours check the build".
// A schedule is a job in words. When it's due, Bob starts it in the "Schedules" chat as if you'd typed it,
// so every action inside it still needs your OK on a card (nobody there to click = denied, nothing happens).
// Adding or switching one on always asks. Off by default, and "Stop everything" stops schedules too
// (it turns the master switch off, and nothing is due while the Hand is off).
import { Schedules, startTicker, describe, cleanWhen, setWindowsTask } from './schedules.js';
import { handOn, HANDS, freeOn } from './hands-settings.js';
import { saveSettings } from './config.js';

export const SCHEDULE_SESSION = 'schedules';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const off = (cfg) => { if (!handOn(cfg, 'schedules')) throw new Error(`The ${HANDS.schedules.label} Hand is switched off. ${cfg.userName || 'The user'} can turn it on in Settings, Hands.`); };

export function schedulesFor(brain) {
  if (!brain.schedules) brain.schedules = new Schedules(brain.cfg, { isOn: () => handOn(brain.cfg, 'schedules'), log: (k, t) => brain.log?.(k, t) });
  return brain.schedules;
}

// What the model gives us, turned into a "when".
export function whenFrom({ type, at, date, days, everyMinutes }) {
  const dayNames = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const d = [].concat(days || []).map((x) => (typeof x === 'number' ? x : dayNames.indexOf(String(x).slice(0, 3).toLowerCase()))).filter((x) => x >= 0 && x <= 6);
  return cleanWhen({ type, at, date, days: d, everyMinutes: everyMinutes != null ? Number(everyMinutes) : undefined });
}

export function scheduleTools(brain) {
  const cfg = brain.cfg;
  const S = () => schedulesFor(brain);
  const t = {};
  t.schedule_job = {
    schema: fn('schedule_job', 'Set up a job Bob does by himself on a schedule (once, daily, weekly, or every N minutes, in local time). The job is plain words, like a chat request. {{USER}} approves the schedule, and every action inside each run still asks for an OK.', {
      name: str('Short name, like "Tidy Downloads".'),
      task: str('What to do, in words, as you would ask yourself.'),
      type: str('How often', { enum: ['once', 'daily', 'weekly', 'interval'] }),
      at: str('Time of day, 24 hour, like 09:00 (not for interval).'),
      date: str('once: the date, YYYY-MM-DD.'),
      days: { type: 'array', items: { type: 'string' }, description: 'weekly: days, like ["mon","thu"].' },
      everyMinutes: { type: 'number', description: 'interval: minutes between runs (at least 5).' }
    }, ['name', 'task', 'type']),
    approvalGroup: 'schedules',
    check(args) {
      off(cfg);
      const when = whenFrom(args);
      const task = String(args.task || '').trim();
      if (!task) throw new Error('Say what the schedule should do.');
      return { text: `Add the schedule "${String(args.name || '').slice(0, 80)}": ${describe(when)}, Bob will: ${task.slice(0, 300)}. It starts switched on. ${freeOn(cfg) ? 'While "Let Bob work without asking" is on, runs go ahead without asking.' : 'Each run still asks before every action.'}`, hand: 'schedules' };
    },
    async run(args) {
      off(cfg);
      const e = S().add({ name: args.name, job: { kind: 'chat', task: String(args.task).trim().slice(0, 2000) }, when: whenFrom(args), enabled: true });
      return `Scheduled "${e.name}" (${e.says}). Next: ${e.nextDue ? new Date(e.nextDue).toLocaleString() : 'none'}. It can be switched off or removed in Settings, Hands.`;
    },
    summary: ({ name }) => `schedule: ${name}`
  };
  t.list_schedules = {
    schema: fn('list_schedules', 'List Bob\'s schedules with their next run.', {}, []),
    async run() {
      off(cfg);
      const l = S().list();
      return l.length ? l.map((e) => `- ${e.id}: "${e.name}" (${e.says}), ${e.enabled ? `on, next ${e.nextDue ? new Date(e.nextDue).toLocaleString() : 'none'}` : 'off'}${e.lastResult ? `, last run ${e.lastResult.ok ? 'done' : 'did not finish'}` : ''}`).join('\n') : 'No schedules yet.';
    },
    summary: () => 'list schedules'
  };
  t.change_schedule = {
    schema: fn('change_schedule', 'Switch a schedule on or off, or remove it. Use the id from list_schedules.', {
      id: str('The schedule id.'),
      action: str('What to do', { enum: ['on', 'off', 'remove'] })
    }),
    approvalGroup: 'schedules',
    check({ id, action }) {
      off(cfg);
      const e = S().get(String(id));
      if (!e) throw new Error('No schedule with that id.');
      if (action === 'off') return false; // switching something off never needs asking
      return { text: `${action === 'remove' ? 'Remove' : 'Switch on'} the schedule "${e.name}" (${e.says}).`, hand: 'schedules' };
    },
    async run({ id, action }) {
      off(cfg);
      if (action === 'remove') return S().remove(String(id)) ? 'Removed.' : 'It was already gone.';
      const e = S().update(String(id), { enabled: action === 'on' });
      return `"${e.name}" is ${e.enabled ? 'on' : 'off'}.`;
    },
    summary: ({ id, action }) => `schedule ${id}: ${action}`
  };
  return t;
}

// Runs one due schedule: queues it in the Schedules chat, like a message from you, clearly marked.
export function runScheduled(brain, e) {
  const task = e.job?.kind === 'chat' ? e.job.task : '';
  if (!task) return { ok: false, note: 'nothing to do' };
  const text = `(Scheduled job "${e.name}", ${e.says}${e.late ? ', catching up on a missed run' : ''}.) ${task}`;
  const r = brain.enqueue(SCHEDULE_SESSION, text);
  brain.broadcast?.({ type: 'schedule-run', name: e.name, session: SCHEDULE_SESSION });
  return { ok: true, note: `started in the Schedules chat (${r.jobId.slice(0, 8)})` };
}

export function startSchedules(brain) {
  return startTicker(schedulesFor(brain), (e) => runScheduled(brain, e));
}

export function schedulesView(brain) {
  const s = schedulesFor(brain);
  return { on: handOn(brain.cfg, 'schedules'), list: s.list(), next: s.nextRun(), windowsTask: brain.cfg.scheduleTask === true, platform: process.platform };
}

// GET /api/hands/schedules, POST /api/hands/schedules {id, on} | {remove} | {windowsTask}. Your click is the OK.
export async function schedulesRoute({ req, p, isLocal, brain, body, send, res }) {
  if (p !== '/api/hands/schedules') return false;
  if (req.method === 'GET') { send(res, 200, schedulesView(brain)); return true; }
  if (!isLocal) { send(res, 403, { error: 'Schedules can only be changed on this replicant matrix itself.' }); return true; }
  const b = await body(req);
  try {
    const s = schedulesFor(brain);
    if (b.remove) { s.remove(String(b.remove)); brain.log('hands', 'schedule removed (your click)'); }
    else if (b.id && 'on' in b) { s.update(String(b.id), { enabled: b.on === true }); brain.log('hands', `schedule ${b.on ? 'on' : 'off'} (your click)`); }
    else if ('windowsTask' in b) {
      const on = b.windowsTask === true;
      await setWindowsTask(brain.cfg, on);
      saveSettings(brain.cfg, { scheduleTask: on });
      brain.log('hands', `Windows task "Bob schedules" ${on ? 'added' : 'removed'} (your click)`);
    }
    send(res, 200, schedulesView(brain));
  } catch (e) { send(res, 409, { error: e.message }); }
  return true;
}
