// 🧰 More tools (Settings, How Bob works, 🧰 More tools). Fourteen small tools, each with its own switch, all off
// until the user turns them on. Everything is kept in one setting, cfg.moreTools, cleaned here.
//
//   python          Python in the sandbox (run_in_sandbox language "python"; py-sandbox.js)
//   calculator      calculate: exact sums and unit conversions by code (calc.js)
//   passwords       make_password: passwords and passphrases by code, shown to the user only (passwords.js)
//   repeatReminders reminders that repeat ("every Monday at 9"; reminders tool, tools.js)
//   phoneReminders  reminders also pop up in Bob for Android (brain.js checkReminders, phone.js)
//   email           read_email: read-only IMAP with an app password (email-read.js)
//   emailTidy       manage_email: mark, flag, move, archive, trash (never deleted for good), drafts (never sent), undo
//   calendar        read_calendar: a calendar link or .ics file, read-only (calendar-read.js)
//   pageWatch       watch_page: check a page every few hours, say when the part you care about changes (page-watch.js)
//   webApi          call_api: a web service with a saved key; reading needs no card, anything else asks (web-api.js)
//   dataQuery       query_data: SQL over a CSV or a database file, read-only (data-query.js)
//   charts          make_chart: a chart picture from a CSV or a table (charts.js)
//   spellCheck      check_spelling: spelling and simple grammar, offline (spell.js)
//   meetingNotes    meeting_notes: a recording to a transcript with who said what (meeting-notes.js)
//   compareFiles    compare_files: what changed between two files, in words (compare-files.js)
//
// Passwords, app passwords, private calendar links and service keys are never kept here: they go in Bob's locked
// store (secret-box.js keys.json, locked with the computer's own key keeper, as in 1.5.205) under the names below.
export const SWITCHES = [
  { key: 'calculator', label: 'Let Bob use a calculator', tools: ['calculate'] },
  { key: 'python', label: 'Let Bob use Python in the sandbox', tools: [] },
  { key: 'passwords', label: 'Let Bob make passwords', tools: ['make_password'] },
  { key: 'repeatReminders', label: 'Let reminders repeat', tools: [] },
  { key: 'phoneReminders', label: 'Show reminders on my phone', tools: [] },
  { key: 'email', label: 'Let Bob read my email', tools: ['read_email'] },
  { key: 'emailTidy', label: 'Let Bob tidy my email', tools: ['manage_email'] }, // email-manage.js: needs 'email' on too
  { key: 'calendar', label: 'Let Bob read my calendar', tools: ['read_calendar'] },
  { key: 'pageWatch', label: 'Let Bob watch web pages', tools: ['watch_page'] },
  { key: 'webApi', label: 'Let Bob call web services', tools: ['call_api'] },
  { key: 'dataQuery', label: 'Let Bob ask questions of data files', tools: ['query_data'] },
  { key: 'charts', label: 'Let Bob draw charts from data', tools: ['make_chart'] },
  { key: 'spellCheck', label: 'Let Bob check spelling', tools: ['check_spelling'] },
  { key: 'meetingNotes', label: 'Let Bob turn recordings into notes', tools: ['meeting_notes'] },
  { key: 'compareFiles', label: 'Let Bob compare files', tools: ['compare_files'] }
];
export const SWITCH_KEYS = SWITCHES.map((s) => s.key);
export const MORE_TOOLS = SWITCHES.flatMap((s) => s.tools);

// Names in the locked store (secret-box.js KEY_NAME: capitals, digits and _).
export const EMAIL_KEY = 'BOB_EMAIL_PASSWORD';
export const calendarKey = (id) => `BOB_CALENDAR_${String(id).toUpperCase()}`;
export const apiKeyName = (id) => `BOB_API_${String(id).toUpperCase()}`;

export const MAX_CALENDARS = 8;
export const MAX_APIS = 12;
export const WATCH_HOURS = [1, 3, 6, 12, 24];

const clip = (v, n) => String(v ?? '').replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, n);
const idOf = (v) => (/^[a-z0-9]{1,12}$/.test(String(v || '')) ? String(v) : '');
export const newId = () => Math.random().toString(36).slice(2, 10);

// A web address someone typed for a calendar or a service: https only (http only for this computer itself).
export function cleanBase(v) {
  let u;
  try { u = new URL(String(v || '').trim()); } catch { return ''; }
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(u.host.replace(/:\d+$/, '')))) return '';
  if (u.username || u.password) return '';
  u.hash = '';
  return u.toString().replace(/\/$/, '');
}

export function cleanMoreTools(v) {
  const x = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  for (const k of SWITCH_KEYS) out[k] = x[k] === true;
  // Email: where to read from. The app password itself is in the locked store (EMAIL_KEY).
  out.emailHost = clip(x.emailHost, 120).replace(/[^\w.-]/g, '');
  const port = Math.round(Number(x.emailPort));
  out.emailPort = port >= 1 && port <= 65535 ? port : 993;
  out.emailUser = clip(x.emailUser, 160);
  out.emailFolder = clip(x.emailFolder, 80).replace(/["\\]/g, '') || 'INBOX';
  // Calendars: a name and where it is. A web link is private (it opens the whole calendar), so it's in the locked
  // store under calendarKey(id); a file is a plain path on this computer.
  out.calendars = (Array.isArray(x.calendars) ? x.calendars : []).map((c) => ({
    id: idOf(c?.id) || newId(), name: clip(c?.name, 40) || 'Calendar', kind: c?.kind === 'file' ? 'file' : 'link', file: c?.kind === 'file' ? clip(c?.file, 400) : ''
  })).filter((c) => c.kind === 'link' || c.file).slice(0, MAX_CALENDARS);
  // Web services: a name, the address every call starts with, and how the key is sent. The key is locked (apiKeyName).
  out.apis = (Array.isArray(x.apis) ? x.apis : []).map((a) => ({
    id: idOf(a?.id) || newId(), name: clip(a?.name, 40).replace(/[^\w .-]/g, ''), base: cleanBase(a?.base),
    header: clip(a?.header, 60).replace(/[^\w-]/g, '') || 'Authorization', prefix: clip(a?.prefix, 20).replace(/[^\w -]/g, '')
  })).filter((a) => a.name && a.base).slice(0, MAX_APIS);
  out.watchHours = WATCH_HOURS.includes(Number(x.watchHours)) ? Number(x.watchHours) : 6;
  return out;
}

export const moreTools = (cfg) => cleanMoreTools(cfg?.moreTools);
export const toolOn = (cfg, key) => cfg?.moreTools?.[key] === true;

// The tools to keep out of Bob's list while their switch is off (brain.js offTools).
export function moreToolsOff(cfg) {
  return SWITCHES.filter((s) => !toolOn(cfg, s.key)).flatMap((s) => s.tools);
}

// One line for "what's switched on" (self-help.js settingsNow).
export function moreToolsLine(cfg) {
  const on = SWITCHES.filter((s) => toolOn(cfg, s.key)).map((s) => s.label);
  return `🧰 More tools: ${on.length ? on.join('; ') : 'all off'}`;
}

// The toolbox group words (toolbox.js): each tool comes in only when a message needs it.
export const GROUP_WORDS = {
  calc: /\b(calculat\w*|what(?:'s| is) \d|how much is|\d+\s*[-+*/x×÷^%]\s*\d+|square root|percent\w*|convert\w*|in (?:km|miles|kg|lbs?|pounds|celsius|fahrenheit|inches|cm|feet|foot|metres|meters|litres|liters|gallons|ounces|grams|cups|mph|km\/h|kph)|how many (?:km|miles|kg|pounds|inches|cm|feet|metres|meters|litres|liters|gallons|ounces|grams|cups|bytes|mb|gb)|passwords?|passphrases?|pass ?codes?|pin number|random (?:password|key))\b/i,
  mail: /\b(e-?mails?|inbox|mail|messages? (?:from|today)|what came in|calendar|agenda|schedule (?:for|tomorrow|today|this week)|what(?:'s| is) on (?:today|tomorrow|this week|monday|tuesday|wednesday|thursday|friday|saturday|sunday)|meetings?|appointments?|events?|\.ics)\b/i,
  webtools: /\b(watch (?:a |the |this |that )?(?:page|site|price|link)|keep an eye on|tell me when (?:it|the|this|that) changes?|price (?:drop|change)|(?:new )?release|in stock|watches|api|web service|endpoint|webhook|json api|call (?:the |my )?(?:\w+ )?(?:api|service))\b/i,
  data: /\b(csv|tsv|sqlite|database|\.db\b|sql|query|rows?|columns?|table|spreadsheet data|chart|graph|plot|bar chart|line chart|pie chart|spell\w*|grammar|typos?|proofread\w*|compare|diff\w*|what changed|differences?|versions?)\b/i,
  meeting: /\b(meeting|recording|recorded|transcri\w*|minutes|who said what|interview|lecture|podcast|voice memo|audio file|\.(?:mp3|wav|m4a|ogg|webm|flac))\b/i
};
export const GROUP_TOOLS = {
  calc: ['calculate', 'make_password'],
  mail: ['read_email', 'manage_email', 'read_calendar'],
  webtools: ['watch_page', 'call_api'],
  data: ['query_data', 'make_chart', 'check_spelling', 'compare_files'],
  meeting: ['meeting_notes']
};
export const GROUP_WHAT = {
  calc: 'exact sums and unit conversions with a calculator; make a password or passphrase',
  mail: 'read the user\'s email and calendar; tidy email (mark, move, archive, trash, drafts) when that is on',
  webtools: 'watch a web page for a change; call a web service the user saved',
  data: 'ask questions of a CSV or database file; draw a chart from data; check spelling and grammar; compare two files',
  meeting: 'turn a meeting recording into a transcript with who said what, for notes'
};
