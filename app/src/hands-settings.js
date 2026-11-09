// Hands settings (no imports, so config.js can use it). Hands are the things Bob can do on the PC beyond chatting:
// work with files, run commands, schedules, and open and use apps. Every Hand is OFF until the user turns it on,
// and there is one master switch over all of them. Bob asks before every action unless the user switches on
// "Let Bob work without asking" (free, off by default). The hard limits (LIMITS) are each on by default and each
// can be switched off by the user alone. Bob's own settings, code and the ✋ kill switch are never a limit he can lift.
//
// platforms (optional): the computers a Hand works on ('win', 'mac', 'linux'). Elsewhere it is hidden and stays off.
// whatOn (optional): a different description for one computer, e.g. { mac: '...' }.
// toolsOnlyOn (optional): tools inside a Hand that only exist on some computers, e.g. { defender_scan: ['win'] }.
//
// To add a Hand, add an entry to HANDS. Its switch, its line in Settings and its tool filtering all follow from it.
export const HANDS = {
  files: {
    label: 'Files',
    what: 'Move, copy and rename files, zip and unzip, and tidy a folder such as Downloads. Only in the folders you tick below. Things he throws away go to the Recycle Bin (unless you switch off the "Recycle Bin only" limit), and every job can be undone.',
    tools: ['file_hands', 'undo_files']
  },
  run: {
    label: 'Run programs and scripts',
    what: 'Run a command, script or program you approve, with its output live in the chat and a Stop button. Never as administrator, never with passwords, and some commands are always refused (formatting disks, boot settings, system registry, antivirus, user accounts, shutdown).',
    tools: ['run_command', 'run_recipe']
  },
  schedules: {
    label: 'Schedules',
    what: 'Do a job by himself at set times (once, daily, weekly, or every so many minutes) while Bob is open. You approve each schedule, and every action inside a run still asks for your OK, so a run with nobody at this replicant matrix just waits and then does nothing (unless "Let Bob work without asking" is on: then runs go ahead by themselves). Waking Bob when he is closed is a separate switch.',
    tools: ['schedule_job', 'list_schedules', 'change_schedule']
  },
  apps: {
    label: 'Open and use apps',
    what: 'Open apps from your Start menu, read a window\'s buttons and fields, and click, type or press keys in it, one approved action at a time. A red "Bob is driving" bar shows while he does; move the mouse or press Esc to stop him at once. Never terminals, admin tools, password managers, password fields, sign-in or security prompts, or his own window.',
    tools: ['open_app', 'app_look', 'app_act'],
    platforms: ['win'] // Windows UI Automation (installer/bob-apps.ps1)
  },
  office: {
    label: 'Office documents and converting',
    what: 'Converts files (Word, Excel, PowerPoint, PDF, pictures, sound, video), reads office files, and makes or changes documents, spreadsheets and slides. Every file he makes or changes is shown on a card first; he never overwrites and backs up before changing. Documents use LibreOffice (or OpenOffice) and sound and video use FFmpeg, found on your replicant matrix or got in Settings, Show advanced settings, Engines; each runs only while it has a job. He saves only in the folders ticked below, plus his own Documents folder.',
    tools: ['convert_file', 'office_read', 'office_make', 'office_edit']
  },
  security: {
    label: 'Security and privacy',
    what: 'Checks this replicant matrix\'s protection, explains Defender alerts and runs scans, looks at suspicious files and links without opening them, and makes clean copies of photos before you share. He never turns protection off and never researches private people. Online look-ups need "Let Bob search the web".',
    tools: ['security_check', 'defender_scan', 'inspect_file', 'strip_metadata', 'osint_lookup', 'check_exposure', 'security_tips'],
    whatOn: { linux: 'Checks this replicant matrix\'s protection (firewall, updates, what starts when you sign in, what listens on the network), scans with ClamAV if it is installed, looks at suspicious files and links without opening them, and makes clean copies of photos before you share. He never turns protection off and never researches private people. Online look-ups need "Let Bob search the web".', mac: 'Checks this Mac\'s protection (firewall, FileVault, Gatekeeper, System Integrity Protection, what starts at login, what listens on the network), looks at suspicious files and links without opening them, and makes clean copies of photos before you share. He never turns protection off and never researches private people. Online look-ups need "Let Bob search the web".' },
    toolsOnlyOn: { defender_scan: ['win', 'linux'] } // Linux: ClamAV, when it's installed
  },
  maker: {
    label: 'Make his own tools',
    what: 'When none of his tools fits a job, Bob can write a small new one, tested in a sandbox and read by his reviewer, and you see one card before it\'s added. A tool he made can only use its own folder and the folders listed on its card, can\'t start other programs, and only uses the internet if the card says so. Any downloads are pinned to one exact file. Tools he made are listed under Tools Bob made, where you can turn one off, see its code or remove it.',
    tools: ['make_tool', 'use_my_tool', 'my_tools']
  },
  browser: {
    label: 'Use a browser',
    what: 'Bob gets his own browser window (part of Bob, separate from your browser and its sign-ins): he opens a page, reads its links, buttons and fields, and clicks, types, scrolls or presses keys there, one approved action at a time, and can check the result with his eyes brain. While "Don\'t send anything out" is on he may only type into search boxes and never presses Send, Post, Submit, Buy or Upload. Never password fields, never his own pages, never downloads. The window is on this replicant matrix; the phone shows the cards.',
    tools: ['browser_open', 'browser_read', 'browser_act']
  },
  mcp: {
    label: 'Connected apps (MCP)',
    what: 'Works inside apps that offer Bob their tools through MCP, such as Unreal Engine or Blender with their MCP add-on: placing things in a level, changing a scene, reading what is there. You add each app below and switch it on; Bob starts or reaches it only when a job needs it and lets it go after 5 minutes unused. Every step shows a card with the app, the tool and its exact inputs. Only apps on this replicant matrix while "Don\'t send anything out" is on.',
    tools: ['mcp_tools', 'mcp_use']
  }
};

// The hard limits. Each is ON unless the user switches it off in Settings (only on the PC itself).
// off: one plain line on what switching it off allows, shown as a warning next to the switch.
export const LIMITS = {
  recycleOnly: { label: 'Recycle Bin only', on: 'Things Bob throws away go to the Recycle Bin, so you can get them back.', off: 'Bob can delete files for good with the Files Hand. They skip the Recycle Bin and can\'t be undone.' },
  secrets: { label: 'Keep secret files private', on: 'Bob never reads, lists, moves, zips or writes files with keys or passwords (.env, keystores, SSH keys, password databases).', off: 'Bob can read, move and change files with keys and passwords, and run commands that touch them.' },
  readOnly: { label: 'Read-only projects stay read-only', on: 'The read-only projects listed under this switch can be read but never changed.', off: 'Bob can change files in projects you marked read-only. His own code and settings stay locked.' },
  commands: { label: 'Block dangerous commands', on: 'Commands that format disks, change boot or the system registry, touch antivirus or user accounts, ask for admin, shut down, or delete many files at once are refused.', off: 'Bob can run any command, including ones that wipe disks, change the registry or shut down this replicant matrix.' },
  sendOut: { label: "Don't send anything out", on: 'Bob\'s Hands never send your things off this replicant matrix (your computer): no uploads, posts, git push, or typing and Send in browsers, email or chat apps.', more: 'Web searches and opening a page still work (the search words and the address go to that site). Cloud helpers have their own switch.', off: 'Bob can upload files, post to websites, push code and type or send in browsers, email and chat apps.' },
  passwords: { label: 'Never type into password fields', on: 'Bob never types into a password box in an app.', off: 'Bob can type into password boxes in apps (he still can\'t read what is in them).' }
};

// 'win', 'mac' or 'linux' (the same as src/platform.js osKey; this file has no imports). BOB_PLATFORM is for tests.
export function handsOs(platform = (typeof process !== 'undefined' && (process.env.BOB_PLATFORM || process.platform)) || 'win32') {
  return platform === 'win32' || platform === 'win' ? 'win' : platform === 'darwin' || platform === 'mac' ? 'mac' : 'linux';
}
// 1.5.102: what Bob's instructions call the computer he runs on (they said "Windows PC" on every system before).
export const computerWord = (os_ = handsOs()) => ({ win: 'Windows PC', mac: 'Mac', linux: 'Linux computer' })[os_] || 'computer';
// Does this Hand exist on this computer?
export const handHere = (id, os_ = handsOs()) => Boolean(HANDS[id]) && (!HANDS[id].platforms || HANDS[id].platforms.includes(os_));
// The Hands this computer has, with their description for it.
export const handsHere = (os_ = handsOs()) => Object.entries(HANDS).filter(([id]) => handHere(id, os_)).map(([id, h]) => ({ id, label: h.label, what: h.whatOn?.[os_] || h.what }));

const isAbs = (p) => typeof p === 'string' && p.length < 400 && !p.includes('\0') && (/^[a-zA-Z]:[\\/]/.test(p) || p.startsWith('/'));

// The settings, cleaned. enabled = the master switch (Settings). held = the chat-page kill switch: it can only stop
// Hands that Settings has on, never switch anything on. Each Hand has { on }. folders = where the Files hand may work.
export function cleanHands(v = {}) {
  // free = "Let Bob work without asking". Off unless the user turns it on.
  const out = { enabled: v.enabled === true, held: v.held === true, free: v.free === true };
  for (const id of Object.keys(HANDS)) out[id] = { on: v[id]?.on === true };
  out.folders = [...new Set([].concat(v.folders || []).filter(isAbs))].slice(0, 30);
  out.readOnlyFolders = [...new Set([].concat(v.readOnlyFolders || []).filter(isAbs))].slice(0, 30); // 1.5.117: read-only projects added in Settings
  out.limits = {};
  for (const k of Object.keys(LIMITS)) out.limits[k] = v.limits?.[k] !== false;
  out.timeoutMin = [1, 5, 15, 30, 60, 120].includes(Number(v.timeoutMin)) ? Number(v.timeoutMin) : 15;
  out.eyesCheck = v.eyesCheck !== false; // "Bob checks his work with his eyes" (src/eyes.js): on, used only when an eyes brain is equipped
  return out;
}
export const handsSettings = (cfg) => cleanHands(cfg.hands || {});

// Is this Hand usable right now? The master switch and its own switch must be on, and the chat-page switch not stopped.
export function handOn(cfg, id) {
  const h = handsSettings(cfg);
  return handHere(id) && h.enabled && !h.held && h[id]?.on === true;
}
// Is Bob working without asking right now? Needs the master switch, the free switch, and the ✋ switch not stopped.
export function freeOn(cfg) {
  const h = handsSettings(cfg);
  return h.enabled && h.free && !h.held;
}
// Is this hard limit in force? On unless the user switched it off.
export const limitOn = (cfg, k) => handsSettings(cfg).limits[k] !== false;
// The read-only folders right now: Bob's own (always) plus the user's read-only projects (unless that limit is off).
// cfg.ownReadOnlyRoots is set by config.js; without it (older callers, tests) every read-only folder stays read-only.
export function readOnlyRoots(cfg) {
  if (!cfg.ownReadOnlyRoots || limitOn(cfg, 'readOnly')) return [...new Set([...(cfg.readOnlyRoots || []), ...handsSettings(cfg).readOnlyFolders])];
  return cfg.ownReadOnlyRoots;
}

// Why a Hand can't be used, in words for Bob to pass on.
export function handOffWhy(cfg, id) {
  const who = cfg.userName || 'The user', h = handsSettings(cfg);
  const label = HANDS[id].label;
  if (!handHere(id)) return `The "${label}" Hand only works on ${HANDS[id].platforms.map((o) => ({ win: 'Windows', mac: 'a Mac', linux: 'Linux' })[o]).join(' and ')}, so it isn't on this replicant matrix.`;
  if (h.enabled && h.held && h[id]?.on) return `Hands are stopped with the Hands switch on the chat page. ${who} can switch them back on there.`;
  if (!h.enabled && h[id]?.on) return `Hands are off in Settings (the "Let Bob use Hands" switch). ${who} can turn it on in Settings, Show advanced settings, Hands.`;
  if (!h.enabled) return `Hands are off in Settings. ${who} can turn on "Let Bob use Hands" and "${label}" in Settings, Show advanced settings, Hands.`;
  return `The "${label}" Hand is off. ${who} can turn it on in Settings, Show advanced settings, Hands.`;
}

// The tool names that belong to Hands that are off right now (brain.toolSchemas hides them; each tool checks again when run).
export function toolsOff(cfg) {
  const off = [];
  const os_ = handsOs();
  for (const [id, hand] of Object.entries(HANDS)) {
    if (!handOn(cfg, id)) off.push(...hand.tools);
    else for (const [tool, where] of Object.entries(hand.toolsOnlyOn || {})) if (!where.includes(os_)) off.push(tool);
  }
  return off;
}
