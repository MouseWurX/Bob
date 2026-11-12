// Harness extras (items 62 to 72 of "100 more ways to make Bob better"). Every switch here is off unless the owner
// turns it on. This file only names and cleans the settings; each feature lives in its own file:
//   crashCatcher  "Catch crashes"                         src/crash-catch.js   (a short report, no chat words)
//   safeStart     "Offer a safe start after two crashes"  src/crash-catch.js   (every opt-in switch off, one button back)
//   settingsUndo  "Keep the last 20 Settings changes"     src/settings-undo.js (each with Put it back)
//   (no switch)   the Health page                         src/health.js        (a page you open; it only looks)
//   quietHours    "Quiet hours"                           src/quiet-hours.js   (no pop-ups, sounds or check-ins)
//   chatPlaces    "Each chat keeps its place in the engine" src/chat-places.js (engine memory saved per chat)
//   weeklyReport  "Count what Bob did each week"          src/weekly.js        (counts only, never words)
//   globalAsk     "A shortcut from anywhere"              electron/main.cjs + public/ask.html
//   tryFromHere   "Try from here"                         src/try-from-here.js (a copy of the chat up to a message)
//   pinMessages   "Pin messages"                          src/pins.js          (kept in mind however long the chat)
//   guestChat     "Guest chats"                           src/guest-chat.js    (nothing saved, no memory)

export const HARNESS_KEYS = ['crashCatcher', 'safeStart', 'settingsUndo', 'weeklyReport', 'quietHours', 'globalAsk', 'chatPlaces', 'tryFromHere', 'pinMessages', 'guestChat'];
const SWITCHES = ['crashCatcher', 'safeStart', 'settingsUndo', 'weeklyReport', 'chatPlaces', 'tryFromHere', 'pinMessages', 'guestChat'];

// The keys a person can pick for "A shortcut from anywhere", as Electron names them, and as Help shows them.
export const ASK_KEYS = [
  ['CommandOrControl+Shift+Space', 'Ctrl+Shift+Space'],
  ['CommandOrControl+Space', 'Ctrl+Space'],
  ['CommandOrControl+Alt+B', 'Ctrl+Alt+B'],
  ['Alt+Shift+B', 'Alt+Shift+B']
];
export const ASK_DEFAULT = ASK_KEYS[0][0];
export const QUIET_DEFAULT = { on: false, from: '22:00', to: '07:00' };

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const cleanTime = (v, d) => (typeof v === 'string' && TIME.test(v.trim()) ? v.trim() : d);

export function cleanHarness(key, v) {
  if (SWITCHES.includes(key)) return v === true;
  if (key === 'quietHours') {
    const q = v && typeof v === 'object' ? v : {};
    return { on: q.on === true, from: cleanTime(q.from, QUIET_DEFAULT.from), to: cleanTime(q.to, QUIET_DEFAULT.to) };
  }
  if (key === 'globalAsk') {
    const g = v && typeof v === 'object' ? v : {};
    return { on: g.on === true, key: ASK_KEYS.some(([k]) => k === g.key) ? g.key : ASK_DEFAULT };
  }
  return undefined;
}

// What the Settings panels show (public/harness.js). Nothing here is a secret.
export function harnessView(cfg = {}) {
  const out = {};
  for (const k of HARNESS_KEYS) out[k] = cleanHarness(k, cfg[k]);
  out.askKeys = ASK_KEYS.map(([key, label]) => ({ key, label }));
  return out;
}

// Plain names for the Settings undo list and Bob's own settings readout.
export const HARNESS_LABELS = {
  crashCatcher: 'Catch crashes', safeStart: 'Offer a safe start after two crashes', settingsUndo: 'Keep the last 20 Settings changes',
  weeklyReport: 'Count what Bob did each week', quietHours: 'Quiet hours', globalAsk: 'A shortcut from anywhere',
  chatPlaces: 'Each chat keeps its place in the engine', tryFromHere: 'Try from here', pinMessages: 'Pin messages', guestChat: 'Guest chats'
};

export function harnessNow(cfg = {}) {
  const v = harnessView(cfg);
  const on = (x) => (x ? 'on' : 'off');
  return [
    `${HARNESS_LABELS.crashCatcher}: ${on(v.crashCatcher)}`, `${HARNESS_LABELS.safeStart}: ${on(v.safeStart)}`, `${HARNESS_LABELS.settingsUndo}: ${on(v.settingsUndo)}`,
    `${HARNESS_LABELS.quietHours}: ${v.quietHours.on ? `${v.quietHours.from} to ${v.quietHours.to}` : 'off'}`,
    `${HARNESS_LABELS.weeklyReport}: ${on(v.weeklyReport)}`,
    `${HARNESS_LABELS.globalAsk}: ${v.globalAsk.on ? (ASK_KEYS.find(([k]) => k === v.globalAsk.key) || ASK_KEYS[0])[1] : 'off'}`,
    `${HARNESS_LABELS.chatPlaces}: ${on(v.chatPlaces)}`, `${HARNESS_LABELS.tryFromHere}: ${on(v.tryFromHere)}`,
    `${HARNESS_LABELS.pinMessages}: ${on(v.pinMessages)}`, `${HARNESS_LABELS.guestChat}: ${on(v.guestChat)}`
  ].join('; ');
}
