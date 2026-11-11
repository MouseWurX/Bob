// Housekeeping settings (no imports, so config.js can use it).
export const UNITS = { minutes: 60e3, hours: 3600e3, days: 864e5, weeks: 7 * 864e5, months: 30 * 864e5 };
export const KINDS = {
  chats: { label: 'Chats', def: { n: 3, unit: 'months' } },
  pictures: { label: 'Pictures and clips Bob made', def: { n: 6, unit: 'months' } },
  sounds: { label: 'Sounds and music Bob made', def: { n: 3, unit: 'months' } },
  tasks: { label: 'Finished tasks', def: { n: 3, unit: 'days' } },
  logs: { label: 'Logbook and update logs', def: { n: 3, unit: 'months' } },
  // Nov 11: files in folders the user points him to (extraFolders). Always "ask first": never tidied by itself.
  folders: { label: 'Files in folders you added', def: { n: 6, unit: 'months' }, askOnly: true }
};
export const MAX_FOLDERS = 20;

export const ageMs = (a) => (a && a.n > 0 && UNITS[a.unit] ? a.n * UNITS[a.unit] : Infinity);

// A folder the user may add: a full path, not a whole drive. Returns the cleaned path or ''.
export function cleanFolder(f) {
  if (typeof f !== 'string') return '';
  const s = f.trim().replace(/^"(.*)"$/, '$1').replace(/[\\/]+$/, '');
  if (!s || s.length > 400 || /[\0\n\r]/.test(s)) return '';
  if (!(/^[a-zA-Z]:[\\/]/.test(s) || s.startsWith('/'))) return ''; // a full path (Windows or Mac/Linux/Android)
  if (/^[a-zA-Z]:$/.test(s) || s === '' || /^\/[^/]*$/.test(s) && s.split('/').length < 2) return '';
  return s;
}

// The housekeeping settings, cleaned (config.js calls this for the "housekeeping" key).
// Nov 11: ON by default (the owner asked). Before, every save wrote enabled:false, so an old false only counts once the user
// has flipped the switch themselves (chosen). By default he only touches his own files; extraFolders adds more.
export function cleanHousekeeping(v = {}) {
  const chosen = v.chosen === true;
  const out = { enabled: chosen ? v.enabled === true : true, wakeBrain: v.wakeBrain === true };
  if (chosen) out.chosen = true;
  const seen = new Set();
  out.extraFolders = [].concat(v.extraFolders || []).map(cleanFolder).filter((f) => f && !seen.has(f.toLowerCase()) && seen.add(f.toLowerCase())).slice(0, MAX_FOLDERS);
  if (typeof v.embedModel === 'string' && /^[\w.:/-]{1,80}$/.test(v.embedModel)) out.embedModel = v.embedModel;
  for (const k of Object.keys(KINDS)) {
    const c = v[k] || {};
    const n = Math.round(Number(c.n));
    out[k] = { n: n >= 1 && n <= 999 ? n : KINDS[k].def.n, unit: UNITS[c.unit] ? c.unit : KINDS[k].def.unit, mode: c.mode === 'auto' && !KINDS[k].askOnly ? 'auto' : 'ask' };
  }
  return out;
}
export const hkSettings = (cfg) => cleanHousekeeping(cfg.housekeeping || {});

