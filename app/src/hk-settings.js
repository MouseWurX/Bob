// Housekeeping settings (no imports, so config.js can use it).
export const UNITS = { minutes: 60e3, hours: 3600e3, days: 864e5, weeks: 7 * 864e5, months: 30 * 864e5 };
export const KINDS = {
  chats: { label: 'Chats', def: { n: 3, unit: 'months' } },
  pictures: { label: 'Pictures and clips Bob made', def: { n: 6, unit: 'months' } },
  sounds: { label: 'Sounds and music Bob made', def: { n: 3, unit: 'months' } },
  tasks: { label: 'Finished tasks', def: { n: 3, unit: 'days' } },
  logs: { label: 'Logbook and update logs', def: { n: 3, unit: 'months' } }
};

export const ageMs = (a) => (a && a.n > 0 && UNITS[a.unit] ? a.n * UNITS[a.unit] : Infinity);

// The housekeeping settings, cleaned (config.js calls this for the "housekeeping" key).
export function cleanHousekeeping(v = {}) {
  const out = { enabled: v.enabled === true, wakeBrain: v.wakeBrain === true };
  if (typeof v.embedModel === 'string' && /^[\w.:/-]{1,80}$/.test(v.embedModel)) out.embedModel = v.embedModel;
  for (const k of Object.keys(KINDS)) {
    const c = v[k] || {};
    const n = Math.round(Number(c.n));
    out[k] = { n: n >= 1 && n <= 999 ? n : KINDS[k].def.n, unit: UNITS[c.unit] ? c.unit : KINDS[k].def.unit, mode: c.mode === 'auto' ? 'auto' : 'ask' };
  }
  return out;
}
export const hkSettings = (cfg) => cleanHousekeeping(cfg.housekeeping || {});

