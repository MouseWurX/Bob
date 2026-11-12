// Bob's time zone (1.5.207 PC check, round 3). On Windows, Node's time-zone library (ICU) can fail to match the
// zone Windows reports: Node then gave no zone name, its own clock ran an hour off, Bob fell back to UTC and the
// logbook, quiet hours and reminders were all in the wrong time. Windows itself always knows the real offset
// (the registry's ActiveTimeBias, which already counts summer time), so on Windows that wins.
// Rules: a named zone that agrees with the real offset is used as it is; otherwise a fixed zone for the real offset
// (Etc/GMT+6 for six hours behind UTC). Never UTC on a computer whose clock isn't UTC.
import { execFileSync } from 'node:child_process';

// Windows zone ids to IANA names (CLDR windowsZones, the common ones). Anything not here still gets the right
// offset from the registry.
export const WIN_TO_IANA = {
  'Dateline Standard Time': 'Etc/GMT+12', 'UTC-11': 'Etc/GMT+11', 'Aleutian Standard Time': 'America/Adak',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Alaskan Standard Time': 'America/Anchorage',
  'Pacific Standard Time': 'America/Los_Angeles', 'Pacific Standard Time (Mexico)': 'America/Tijuana',
  'US Mountain Standard Time': 'America/Phoenix', 'Mountain Standard Time': 'America/Denver', 'Alberta Standard Time': 'America/Edmonton',
  'Mountain Standard Time (Mexico)': 'America/Mazatlan', 'Yukon Standard Time': 'America/Whitehorse',
  'Central America Standard Time': 'America/Guatemala', 'Central Standard Time': 'America/Chicago',
  'Canada Central Standard Time': 'America/Regina', 'Central Standard Time (Mexico)': 'America/Mexico_City',
  'Easter Island Standard Time': 'Pacific/Easter', 'SA Pacific Standard Time': 'America/Bogota',
  'Eastern Standard Time': 'America/New_York', 'Eastern Standard Time (Mexico)': 'America/Cancun',
  'US Eastern Standard Time': 'America/Indianapolis', 'Haiti Standard Time': 'America/Port-au-Prince',
  'Cuba Standard Time': 'America/Havana', 'Atlantic Standard Time': 'America/Halifax',
  'Venezuela Standard Time': 'America/Caracas', 'SA Western Standard Time': 'America/La_Paz',
  'Pacific SA Standard Time': 'America/Santiago', 'Newfoundland Standard Time': 'America/St_Johns',
  'E. South America Standard Time': 'America/Sao_Paulo', 'Argentina Standard Time': 'America/Buenos_Aires',
  'SA Eastern Standard Time': 'America/Cayenne', 'Greenland Standard Time': 'America/Godthab',
  'Montevideo Standard Time': 'America/Montevideo', 'UTC-02': 'Etc/GMT+2', 'Azores Standard Time': 'Atlantic/Azores',
  'Cape Verde Standard Time': 'Atlantic/Cape_Verde', 'UTC': 'Etc/UTC', 'GMT Standard Time': 'Europe/London',
  'Greenwich Standard Time': 'Atlantic/Reykjavik', 'Morocco Standard Time': 'Africa/Casablanca',
  'W. Europe Standard Time': 'Europe/Berlin', 'Central Europe Standard Time': 'Europe/Budapest',
  'Romance Standard Time': 'Europe/Paris', 'Central European Standard Time': 'Europe/Warsaw',
  'W. Central Africa Standard Time': 'Africa/Lagos', 'GTB Standard Time': 'Europe/Bucharest',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev', 'Israel Standard Time': 'Asia/Jerusalem',
  'Egypt Standard Time': 'Africa/Cairo', 'South Africa Standard Time': 'Africa/Johannesburg',
  'Turkey Standard Time': 'Europe/Istanbul', 'Arab Standard Time': 'Asia/Riyadh', 'Russian Standard Time': 'Europe/Moscow',
  'E. Africa Standard Time': 'Africa/Nairobi', 'Iran Standard Time': 'Asia/Tehran', 'Arabian Standard Time': 'Asia/Dubai',
  'Afghanistan Standard Time': 'Asia/Kabul', 'Pakistan Standard Time': 'Asia/Karachi', 'India Standard Time': 'Asia/Calcutta',
  'Sri Lanka Standard Time': 'Asia/Colombo', 'Nepal Standard Time': 'Asia/Katmandu', 'Bangladesh Standard Time': 'Asia/Dhaka',
  'Myanmar Standard Time': 'Asia/Rangoon', 'SE Asia Standard Time': 'Asia/Bangkok', 'China Standard Time': 'Asia/Shanghai',
  'Singapore Standard Time': 'Asia/Singapore', 'Taipei Standard Time': 'Asia/Taipei', 'W. Australia Standard Time': 'Australia/Perth',
  'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul', 'Cen. Australia Standard Time': 'Australia/Adelaide',
  'AUS Central Standard Time': 'Australia/Darwin', 'E. Australia Standard Time': 'Australia/Brisbane',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'Tasmania Standard Time': 'Australia/Hobart',
  'West Pacific Standard Time': 'Pacific/Port_Moresby', 'New Zealand Standard Time': 'Pacific/Auckland',
  'Fiji Standard Time': 'Pacific/Fiji', 'Tonga Standard Time': 'Pacific/Tongatapu', 'Line Islands Standard Time': 'Pacific/Kiritimati',
};
// Offsets that aren't whole hours have no Etc/GMT zone: a real place with that offset all year.
const PART_HOURS = { 330: 'Asia/Kolkata', 345: 'Asia/Kathmandu', 270: 'Asia/Kabul', 390: 'Asia/Yangon', 570: 'Australia/Darwin', 525: 'Australia/Eucla', 210: 'Asia/Tehran', [-570]: 'Pacific/Marquesas', [-210]: 'America/St_Johns', 765: 'Pacific/Chatham', 630: 'Australia/Lord_Howe' };
export const UTCISH = /^(?:utc|etc\/utc|etc\/gmt|gmt|etc\/universal|universal|zulu|etc\/zulu|etc\/gmt[+-]0)$/i;

// Minutes ahead of UTC in that zone at that moment (Calgary in winter = -420), or null when the zone isn't known.
export function zoneOffset(timeZone, now = new Date()) {
  try {
    const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', { timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })
      .formatToParts(now).map((x) => [x.type, x.value]));
    const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute);
    return Math.round((asUtc - Math.floor(now.getTime() / 60000) * 60000) / 60000);
  } catch { return null; }
}

// A zone for a plain offset: 0 = UTC, whole hours = Etc/GMT (whose sign is the other way round), else a real place.
export function zoneForOffset(mins) {
  const m = Math.round(Number(mins) || 0);
  if (m === 0) return 'UTC';
  if (m % 60 === 0 && Math.abs(m) <= 14 * 60) return `Etc/GMT${m > 0 ? '-' : '+'}${Math.abs(m) / 60}`;
  return PART_HOURS[m] && zoneOffset(PART_HOURS[m]) !== null ? PART_HOURS[m] : `Etc/GMT${m > 0 ? '-' : '+'}${Math.round(Math.abs(m) / 60)}`;
}

// Windows' own zone: { key, offset } from the registry (offset = minutes ahead of UTC, summer time counted), or null.
export function windowsZone(run = execFileSync) {
  try {
    const out = String(run('reg', ['query', 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\TimeZoneInformation'], { encoding: 'utf8', timeout: 3000, windowsHide: true }));
    const val = (name) => out.match(new RegExp(`^\\s*${name}\\s+REG_\\w+\\s+(.*?)\\s*$`, 'mi'))?.[1];
    const raw = val('ActiveTimeBias');
    if (raw === undefined) return null;
    let bias = /^0x/i.test(raw) ? parseInt(raw, 16) : Number(raw);
    if (!Number.isFinite(bias)) return null;
    if (bias > 0x7fffffff) bias -= 0x100000000; // a DWORD: east of UTC comes out as 0xffff...
    return { key: val('TimeZoneKeyName') || val('StandardName') || '', offset: -bias };
  } catch { return null; }
}

// The zone Bob should use. Everything it looks at can be passed in (the tests do).
export function pickZone({ platform = process.env.BOB_PLATFORM || process.platform, intl = safeIntl(), now = new Date(), win = undefined, run } = {}) {
  const good = (z) => z && zoneOffset(z, now) !== null;
  if (platform === 'win32') {
    const w = win !== undefined ? win : process.platform === 'win32' || run ? windowsZone(run) : null;
    if (w && Number.isFinite(w.offset)) {
      for (const z of [WIN_TO_IANA[w.key], intl]) if (good(z) && zoneOffset(z, now) === w.offset && !(UTCISH.test(z) && w.offset !== 0)) return z;
      return zoneForOffset(w.offset);
    }
  }
  const nodeOffset = -now.getTimezoneOffset();
  if (good(intl) && !(UTCISH.test(intl) && nodeOffset !== 0)) return intl;
  return zoneForOffset(nodeOffset);
}

function safeIntl() { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || ''; } catch { return ''; } }

// Sets Bob's zone, and Node's own clock with it when they disagree (backup names, chat stamps use Node's clock).
// Bob runs for days, so on Windows it checks again every half hour (summer time, or the zone changed in Settings).
export function applyZone(cfg, { pick = pickZone, env = process.env, every = 30 * 60 * 1000 } = {}) {
  if (cfg.timeZoneSet) return cfg.timeZone; // set by hand in config.json
  const set = () => {
    const z = pick();
    if (!z) return;
    cfg.timeZone = z;
    if (safeIntl() !== z) env.TZ = z;
  };
  set();
  if (every && process.platform === 'win32' && !cfg.zoneTimer) {
    cfg.zoneTimer = setInterval(set, every); cfg.zoneTimer.unref?.();
    Object.defineProperty(cfg, 'zoneTimer', { enumerable: false, value: cfg.zoneTimer, writable: true });
  }
  return cfg.timeZone;
}
