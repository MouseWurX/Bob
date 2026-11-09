// Check-in settings (no imports, so config.js can use it). Off unless switched on.
//   { enabled, how: 'daily' | 'weekdays' | 'hours', at: 'HH:MM', hours: 1-24, checks: { downloads, tasks, schedules, disk }, own: [lines] }
export const CHECKS = {
  downloads: { label: 'Downloads that failed or stopped moving' },
  tasks: { label: 'Tasks that failed or wait for your OK' },
  schedules: { label: 'Scheduled jobs that didn\'t finish' },
  disk: { label: 'Disk space running low' }
};
export const HOW = ['daily', 'weekdays', 'hours'];
export const MAX_OWN = 8;
export const OWN_LEN = 160;
export const LOW_DISK_GB = 10;

export function cleanCheckins(v = {}) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(String(v.at || '').trim());
  const at = m && +m[1] <= 23 && +m[2] <= 59 ? `${m[1].padStart(2, '0')}:${m[2]}` : '09:00';
  const hours = Math.round(Number(v.hours));
  const checks = {};
  for (const k of Object.keys(CHECKS)) checks[k] = v.checks?.[k] !== false; // each one ticked to start with (nothing runs until check-ins are on)
  const own = [].concat(v.own || []).map((l) => String(l ?? '').replace(/\s+/g, ' ').trim().slice(0, OWN_LEN)).filter(Boolean).slice(0, MAX_OWN);
  return { enabled: v.enabled === true, how: HOW.includes(v.how) ? v.how : 'daily', at, hours: hours >= 1 && hours <= 24 ? hours : 4, checks, own };
}
export const checkinSettings = (cfg) => cleanCheckins(cfg?.checkins || {});
