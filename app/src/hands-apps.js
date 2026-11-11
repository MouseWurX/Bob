// The Apps Hand: Bob opens apps from the Start menu, looks at a window (the names of its buttons, fields and
// menus, read through Windows UI Automation) and clicks, types or presses keys in it. Off until switched on,
// like every Hand, and every single action shows a card and waits for a click.
//
// How it works: a small helper (installer\bob-apps.ps1, Windows PowerShell 5.1) runs while Bob uses apps and
// talks JSON lines over stdin/stdout. It prefers the app's own controls (press a button, set a field's text)
// over moving the mouse. While Bob is driving, a red "Bob is driving" bar sits across the top of the screen,
// and moving the mouse or pressing Esc stops him at once: the helper drops out of driving, Bob ends the
// "allow the rest of this job" for apps, and any Hand card still waiting is answered No.
//
// Never: the Run hand's jobs (terminals, PowerShell, cmd), admin tools (Registry Editor, Task Manager, MMC),
// password managers, Windows sign-in or security prompts, password fields, or Bob's own window (so he can
// never approve his own cards).
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { appDir } from './config.js';
import { handOn, handOffWhy, HANDS, limitOn } from './hands-settings.js';
import { eyesCheck, eyesOn, eyesWhy } from './eyes.js';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

// Process names (without .exe, lower case) Bob never looks at, clicks in or opens.
export const BLOCKED_PROCESSES = [
  // Terminals and script hosts: running things is the Run hand's job, with its own checks.
  'cmd', 'powershell', 'pwsh', 'powershell_ise', 'windowsterminal', 'wt', 'conhost', 'openconsole', 'wsl', 'bash', 'wscript', 'cscript', 'mshta',
  // Admin and system tools.
  'regedit', 'mmc', 'taskmgr', 'msconfig', 'gpedit', 'secpol', 'compmgmt', 'diskmgmt', 'eventvwr', 'services', 'perfmon', 'resmon', 'systempropertiesadvanced', 'useraccountcontrolsettings', 'netplwiz', 'lusrmgr', 'control', 'sysdm',
  // Sign-in, security and password prompts.
  'consent', 'credentialuibroker', 'logonui', 'lockapp', 'sechealthui', 'securityhealthsystray', 'securityhealthhost', 'msmpeng', 'smartscreen', 'useraccountbroker',
  // Password managers.
  'keepass', 'keepassxc', '1password', 'bitwarden', 'dashlane', 'lastpass', 'enpass', 'nordpass', 'roboform', 'keeper', 'protonpass',
  // Bob himself (and Electron running him from source).
  'bob', 'electron'
];
// Window titles that are never touched, whatever the app.
const BLOCKED_TITLE = /\b(password|passphrase|credential|windows security|user account control|sign[- ]?in to windows|bitlocker|recovery key|2fa|two[- ]factor|one[- ]time code)\b/i;
// Start menu names Bob won't open (the same tools by their friendly names).
const BLOCKED_APP_NAME = /\b(command prompt|powershell|terminal|registry editor|task manager|computer management|disk management|group policy|local security policy|services|event viewer|system configuration|resource monitor|performance monitor|user accounts|credential manager|windows security|bitlocker|recovery|reset this pc|control panel|wsl|ubuntu|debian|keepass|1password|bitwarden|dashlane|lastpass|enpass|nordpass|roboform|keeper|proton pass)\b/i;

// "Don't send anything out" (a hard limit, on by default): apps where typing or a Send button sends things off
// the PC. In these Bob may look and click around, but not type, press keys, or click Send/Post/Upload/Share.
const SEND_PROCESSES = /^(chrome|msedge|firefox|brave|opera|opera_gx|vivaldi|arc|iexplore|outlook|olk|hxoutlook|thunderbird|mailspring|discord|slack|teams|ms-teams|telegram|whatsapp|signal|zoom|skype|messenger|element|thunderbird)$/;
const SEND_BUTTON = /\b(send|post|submit|upload|share|publish|reply|tweet|comment|attach)\b/i;
export function sendOutBlock(cfg, w, action, target = {}) {
  if (!limitOn(cfg, 'sendOut')) return '';
  const proc = String(w?.process || '').toLowerCase().replace(/\.exe$/, '');
  if (!SEND_PROCESSES.test(proc)) return '';
  const what = `${w.process} can send things off your replicant matrix (your computer), and "Don't send anything out" is on (Settings, Hands)`;
  if (action === 'type' || action === 'keys') return `${what}, so Bob doesn't type or press keys there.`;
  if (action === 'click_at') return `${what}, so Bob doesn't click by place there (he can't tell what is under the pointer); click by name instead.`;
  if (action === 'click' && SEND_BUTTON.test(`${target.name || ''} ${target.id || ''}`)) return `${what}, so Bob doesn't click that.`;
  return '';
}

export function blockedWindow(w, { ownPids = [] } = {}) {
  if (!w) return 'That window is gone.';
  const proc = String(w.process || '').toLowerCase().replace(/\.exe$/, '');
  if (ownPids.includes(Number(w.pid))) return "That's Bob's own window. Bob never clicks his own buttons.";
  if (BLOCKED_PROCESSES.includes(proc)) {
    if (['cmd', 'powershell', 'pwsh', 'powershell_ise', 'windowsterminal', 'wt', 'conhost', 'openconsole', 'wsl', 'bash', 'wscript', 'cscript', 'mshta'].includes(proc)) return 'Terminals are off limits to the Apps hand. Commands go through the Run hand, which shows the exact command.';
    if (proc === 'bob' || proc === 'electron') return "That's Bob's own window. Bob never clicks his own buttons.";
    return `${w.process} is off limits (admin, security or password app).`;
  }
  if (BLOCKED_TITLE.test(String(w.title || ''))) return 'That window looks like a password or security prompt, so Bob leaves it to you.';
  return '';
}
export const blockedApp = (name) => (BLOCKED_APP_NAME.test(String(name || '')) ? `${name} is off limits to the Apps hand.` : '');

// Keys Bob may press. Returns the SendKeys string, or throws. No Windows key, no Ctrl+Alt combinations.
const KEYMAP = { enter: '{ENTER}', tab: '{TAB}', esc: '{ESC}', escape: '{ESC}', up: '{UP}', down: '{DOWN}', left: '{LEFT}', right: '{RIGHT}', home: '{HOME}', end: '{END}', pageup: '{PGUP}', pagedown: '{PGDN}', backspace: '{BACKSPACE}', delete: '{DELETE}', del: '{DELETE}', space: ' ', insert: '{INSERT}' };
for (let i = 1; i <= 12; i++) KEYMAP[`f${i}`] = `{F${i}}`;
export function keysFor(combo) {
  const parts = String(combo || '').toLowerCase().replace(/\s+/g, '').split('+').filter(Boolean);
  if (!parts.length || parts.length > 3) throw new Error('Say one key or combination, like "Enter" or "Ctrl+S".');
  const key = parts.pop();
  const mods = new Set(parts);
  for (const m of mods) if (!['ctrl', 'control', 'shift', 'alt'].includes(m)) throw new Error(m === 'win' || m === 'windows' || m === 'meta' ? 'Bob never presses the Windows key.' : `Unknown key "${m}".`);
  const ctrl = mods.has('ctrl') || mods.has('control');
  if (ctrl && mods.has('alt')) throw new Error('Bob never presses Ctrl+Alt combinations.');
  let k = KEYMAP[key];
  if (!k && /^[a-z0-9]$/.test(key)) k = key;
  if (!k) throw new Error(`Bob doesn't press "${key}".`);
  if (mods.has('alt') && key === 'f4') k = '{F4}'; // allowed: closing a window, which still asks to save
  return `${ctrl ? '^' : ''}${mods.has('shift') ? '+' : ''}${mods.has('alt') ? '%' : ''}${k}`;
}

// Programs whose windows are plain text: Markdown marks would show up as literal * and #.
export const PLAIN_TEXT_APPS = ['notepad'];
// Markdown -> plain text, for typing into a plain-text window.
export function plainText(md) {
  return String(md || '')
    .replace(/\r\n/g, '\n')
    .replace(/^```[^\n]*\n?/gm, '')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/\*\*(.+?)\*\*|__(.+?)__/g, (m, a, b) => a ?? b)
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^_\w])_(?!\s)([^_\n]+?)_(?!\w)/g, '$1$2')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/!?\[([^\]]+)\]\(([^)\s]+)\)/g, '$1 ($2)')
    .replace(/^>\s?/gm, '')
    .replace(/^\s*([-*_])\s*\1\s*\1[\s\1]*$/gm, '');
}
// Typing more than this is slow and fragile: Bob is pointed at writing a .txt file instead.
export const LONG_TYPING = 1500;
// Loose title match: Notepad renames "Untitled - Notepad" to "*hello - Notepad" after the first typing.
const tidyTitle = (t) => String(t || '').toLowerCase().replace(/^\*\s*/, '').trim();

// ---- The helper process ----
export class AppsDriver {
  // command: [exe, ...args] (tests use a mock); default is Windows PowerShell running installer\bob-apps.ps1.
  constructor({ command = null, spawnImpl = spawn, env = process.env, onEvent = () => {}, idleMs = 120000 } = {}) {
    this.command = command;
    this.spawnImpl = spawnImpl;
    this.env = env;
    this.onEvent = onEvent;
    this.idleMs = idleMs;
    this.child = null;
    this.waiting = new Map();
    this.buf = '';
    this.idle = null;
  }

  defaultCommand() {
    const ps = path.join(this.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const script = path.join(appDir, 'installer', 'bob-apps.ps1');
    return [ps, '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-STA', '-File', script, '-BobPid', String(process.pid), '-BobParent', String(process.ppid || 0)];
  }

  start() {
    if (this.child) return;
    if (!this.command && process.platform !== 'win32') throw new Error('The Apps hand works on Windows.');
    const [exe, ...args] = this.command || this.defaultCommand();
    const child = this.spawnImpl(exe, args, { shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    this.child = child;
    child.stdout.setEncoding?.('utf8');
    child.stdout.on('data', (d) => this.#data(d));
    child.stderr?.on?.('data', () => {});
    const gone = (why) => {
      if (this.child !== child) return;
      this.child = null;
      for (const [, w] of this.waiting) w.reject(new Error(why));
      this.waiting.clear();
      this.onEvent({ event: 'closed' });
    };
    child.on('error', (e) => gone(`The apps helper didn't start: ${e.message}`));
    child.on('exit', () => gone('The apps helper stopped.'));
  }

  #data(d) {
    this.buf += d;
    let i;
    while ((i = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, i).trim();
      this.buf = this.buf.slice(i + 1);
      if (!line) continue;
      let m; try { m = JSON.parse(line); } catch { continue; }
      if (m.event) { this.onEvent(m); continue; }
      const w = this.waiting.get(m.id);
      if (!w) continue;
      this.waiting.delete(m.id);
      clearTimeout(w.timer);
      m.ok ? w.resolve(m) : w.reject(new Error(m.error || 'The app did not answer.'));
    }
  }

  request(op, data = {}, { timeoutMs = 20000 } = {}) {
    this.start();
    this.#touch();
    const id = crypto.randomUUID().slice(0, 8);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.waiting.delete(id); reject(new Error('The app took too long to answer.')); }, timeoutMs);
      timer.unref?.();
      this.waiting.set(id, { resolve, reject, timer });
      this.child.stdin.write(JSON.stringify({ id, op, ...data }) + '\n');
    });
  }

  #touch() {
    clearTimeout(this.idle);
    this.idle = setTimeout(() => this.stop(), this.idleMs);
    this.idle.unref?.();
  }

  // Ends the helper: the red bar goes with it.
  stop() {
    clearTimeout(this.idle);
    const c = this.child;
    if (!c) return false;
    this.child = null;
    try { c.stdin.end(JSON.stringify({ id: 'bye', op: 'quit' }) + '\n'); } catch {}
    setTimeout(() => { try { c.kill(); } catch {} }, 1500).unref?.();
    return true;
  }
}

// ---- The tools ----
export function appsTools(brain, { driver = null, track = () => () => {}, openWaitMs = 500, openWaitTries = 16 } = {}) {
  const cfg = brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const ownPids = [process.pid, process.ppid].filter(Boolean);
  const state = { stoppedCtx: null, windows: new Map(), lastCtx: null, untrack: null, driving: false, seen: new Map() };
  // Every title a window has had (by hwnd), so a window Bob opened or looked at is still found after it renames itself.
  const remember = (w) => { if (!w) return; const k = String(w.hwnd); if (!state.seen.has(k)) state.seen.set(k, new Set()); state.seen.get(k).add(tidyTitle(w.title)); };

  const onEvent = (m) => {
    if (m.event === 'stopped') {
      state.driving = false;
      const why = m.why === 'esc' ? 'pressed Esc' : 'moved the mouse';
      log('hands', `apps: ${cfg.userName || 'the user'} ${why}; Bob stopped driving`);
      const ctx = state.lastCtx;
      if (ctx) {
        state.stoppedCtx = ctx;
        for (const g of [...(ctx.allowAll || [])]) if (String(g).startsWith('apps-')) ctx.allowAll.delete(g);
        ctx.emit?.({ type: 'apps-stopped', why });
      }
      brain.denyHands?.();
    }
    if (m.event === 'closed') { state.driving = false; state.untrack?.(); state.untrack = null; }
  };
  const drv = driver || new AppsDriver({ onEvent });
  if (driver) driver.onEvent = onEvent;
  const ensure = () => {
    // Registered with Hands so "Stop everything" ends the helper (and its red bar) too.
    if (!state.untrack) state.untrack = track({ line: 'Apps hand', stop: () => { state.driving = false; drv.stop(); } });
  };

  const off = () => { if (!handOn(cfg, 'apps')) throw new Error(handOffWhy(cfg, 'apps')); };
  const notStopped = (ctx) => { if (ctx && state.stoppedCtx === ctx) throw new Error(`${cfg.userName || 'The user'} took back the mouse, so Bob stopped using apps for this job. Don't try again; ask what they'd like instead.`); };

  async function windows() {
    ensure();
    const r = await drv.request('windows');
    const list = (r.windows || []).filter((w) => w && w.title);
    state.windows = new Map(list.map((w) => [String(w.hwnd), w]));
    return list;
  }
  // "window" may be the number from a list, part of a title, or a program name.
  async function findWindow(want) {
    const list = await windows();
    const s = String(want || '').trim().toLowerCase();
    if (!s) throw new Error('Say which window.');
    const hits = list.filter((w) => String(w.hwnd) === s);
    let byTitle = hits.length ? hits : list.filter((w) => w.title.toLowerCase() === s || w.title.toLowerCase().includes(s) || tidyTitle(w.title) === tidyTitle(s) || String(w.process).toLowerCase() === s.replace(/\.exe$/, ''));
    // A window Bob already used, under an older title ("Untitled - Notepad" is now "*hello - Notepad").
    if (!byTitle.length) byTitle = list.filter((w) => state.seen.get(String(w.hwnd))?.has(tidyTitle(s)));
    // "... - Notepad" when exactly one Notepad window is open.
    if (!byTitle.length) {
      const words = s.split(/[^a-z0-9.+]+/).filter((x) => x.length > 2);
      const procs = [...new Set(list.map((w) => String(w.process).toLowerCase()))].filter((p) => words.includes(p));
      if (procs.length === 1) { const same = list.filter((w) => String(w.process).toLowerCase() === procs[0]); if (same.length === 1) byTitle = same; }
    }
    if (!byTitle.length) throw new Error(`No open window matches "${want}". Open ones: ${list.filter((w) => !blockedWindow(w, { ownPids })).slice(0, 15).map((w) => `${w.title} (${w.process})`).join('; ') || 'none'}.`);
    const ok = byTitle.filter((w) => !blockedWindow(w, { ownPids }));
    if (!ok.length) throw new Error(blockedWindow(byTitle[0], { ownPids }));
    remember(ok[0]);
    return ok[0];
  }
  const label = (w) => `${w.title} (${w.process})`;
  const targetText = (t = {}) => [t.type || '', t.name ? `"${t.name}"` : '', t.id ? `[id ${t.id}]` : '', t.nth > 1 ? `#${t.nth}` : ''].filter(Boolean).join(' ') || 'the window';
  // For the card: no "[id 15]" bits, and a field by its name alone ('Document "Text editor"' -> 'Text editor').
  const plain = (l) => String(l || '').replace(/\s*\[id [^\]]*\]/g, '').trim();
  const field = (l) => { const m = plain(l).match(/"([^"]+)"/); return m ? m[1] : plain(l); };
  // A picture of the window: into the chat when ctx is given, and for the eyes brain (src/eyes.js).
  async function picture(w, ctx) {
    const name = `window-${Date.now()}.png`;
    const file = path.join(cfg.painterDir || cfg.dataDir, name);
    await drv.request('picture', { hwnd: w.hwnd, file });
    if (ctx && (fs.existsSync(file) || driver)) ctx.emit?.({ type: 'image', url: `/images/${encodeURIComponent(name)}`, file });
    return file;
  }
  // After an action: did it work? Only with expect given and an eyes brain in its slot.
  async function eyesAfter(w, expect, ctx) {
    if (!expect) return '';
    if (!eyesOn(cfg)) return `\n(Not checked by eye: ${eyesWhy(cfg)}.)`;
    const file = await picture(w, null).catch(() => '');
    const e = await eyesCheck(brain, { file, expect: String(expect) }, { emit: ctx?.emit, signal: ctx?.signal });
    return `\n${e.line}`;
  }

  const t = {};

  t.open_app = {
    schema: fn('open_app', 'Open an app by its Start menu name (like "Notepad" or "Blender"). {{USER}} approves first. Not terminals or admin tools.', { name: str('The app\'s name as it shows in the Start menu.') }),
    approvalGroup: (a) => `apps-open:${String(a.name || '').toLowerCase()}`,
    async check(args, ctx) {
      off(); notStopped(ctx);
      ensure();
      const want = String(args.name || '').trim();
      if (!want) throw new Error('Say which app.');
      const b = blockedApp(want); if (b) throw new Error(b);
      const r = await drv.request('apps');
      const apps = (r.apps || []).filter((a) => a && a.name && a.appId && !blockedApp(a.name));
      const lw = want.toLowerCase();
      const hit = apps.find((a) => a.name.toLowerCase() === lw) || apps.find((a) => a.name.toLowerCase().startsWith(lw)) || apps.find((a) => a.name.toLowerCase().includes(lw));
      if (!hit) throw new Error(`No Start menu app called "${want}".`);
      if (ctx) ctx.appsOpen = hit;
      return { text: `Open ${hit.name} (as you, not as administrator; if it asks for admin, Windows asks you).`, command: `Open ${hit.name}`, cwd: 'the Start menu', button: 'Open it' };
    },
    async run(args, ctx) {
      off(); notStopped(ctx);
      const hit = ctx?.appsOpen; if (ctx) ctx.appsOpen = null;
      if (!hit) throw new Error('Nothing to open.');
      const before = new Set((await windows()).map((w) => String(w.hwnd)));
      try { await drv.request('open', { appId: hit.appId }); }
      catch (e) { log('hands', `apps: open ${hit.name} failed: ${e.message}`); throw new Error(`${hit.name} did not open: ${e.message} (That is the real reason, from Windows. Tell ${cfg.userName || 'the user'} it plainly; don't say it opened.)`); }
      // Only say it opened once a new window is really there.
      for (let i = 0; i < openWaitTries; i++) {
        await new Promise((r) => setTimeout(r, openWaitMs));
        const fresh = (await windows()).filter((w) => !before.has(String(w.hwnd)));
        if (fresh.length) {
          const w = fresh[0];
          remember(w);
          log('hands', `apps: opened ${hit.name} (${label(w)})`);
          return `Opened ${hit.name}: its window "${w.title}" is open. Use app_look on it before clicking or typing.`;
        }
      }
      log('hands', `apps: asked Windows to open ${hit.name}, but no new window appeared`);
      return `Windows was asked to open ${hit.name}, but no new window appeared within ${Math.round(openWaitTries * openWaitMs / 1000)} seconds. It may still be starting: check the taskbar, or ask Bob to try again. Do not say it opened. Tell ${cfg.userName || 'the user'} that, and offer to try again or check with app_look (it may have opened behind, or reused a window that was already open).`;
    },
    summary: ({ name }) => `apps: open ${name}`
  };

  t.app_look = {
    schema: fn('app_look', 'List the open windows (leave window empty), or read one: its buttons, fields, menus and text. Never reads password fields. {{USER}} approves each look.', {
      window: str('Part of the window title or program name. Empty lists the windows.'),
      picture: { type: 'boolean', description: 'Also show a picture of the window in the chat.' },
      ask: str('A question about how the window looks, answered from a picture (for canvases, games and unnamed buttons). Its pixels are the x, y for app_act click_at.')
    }, []),
    approvalGroup: (a) => `apps-look:${String(a.window || '*').toLowerCase()}`,
    async check(args, ctx) {
      off(); notStopped(ctx);
      if (!args.window) return { text: 'See which windows are open (just their titles).', command: 'List open windows', cwd: 'your desktop', button: 'Allow' };
      const w = await findWindow(args.window);
      if (ctx) ctx.appsWindow = w;
      return { text: `Look at ${label(w)}: read the names of its buttons, fields and menus${args.picture || args.ask ? ', and take a picture of it' : ''}${args.ask ? ` so Bob's eyes brain can answer: "${String(args.ask).slice(0, 120)}"` : ''}. Password fields are never read.`, command: `Look at ${w.title}`, cwd: w.process, button: 'Allow' };
    },
    async run(args, ctx) {
      off(); notStopped(ctx);
      if (!args.window) {
        const list = (await windows()).filter((w) => !blockedWindow(w, { ownPids }));
        log('hands', `apps: listed ${list.length} windows`);
        return list.length ? `Open windows:\n${list.slice(0, 40).map((w) => `- ${w.title} (${w.process})`).join('\n')}` : 'No windows Bob may use are open.';
      }
      const w = ctx?.appsWindow || await findWindow(args.window);
      if (ctx) ctx.appsWindow = null;
      const r = await drv.request('look', { hwnd: w.hwnd, max: 150 });
      const all = (r.items || []).filter((x) => x && (x.name || x.id || x.type === 'Edit'));
      // Where he can type comes first, so a small brain doesn't aim at a label (Notepad's "ContentTextBlock").
      const items = [...all.filter((x) => x.typable && !x.password), ...all.filter((x) => !(x.typable && !x.password))];
      const typeHere = items.filter((x) => x.typable && !x.password);
      log('hands', `apps: looked at ${label(w)} (${items.length} things)`);
      let pic = '';
      if (args.picture || args.ask) {
        const file = await picture(w, args.picture ? ctx : null);
        if (args.picture) pic = '\nA picture of the window is in the chat.';
        if (args.ask) { const e = await eyesCheck(brain, { file, ask: String(args.ask) }, { emit: ctx?.emit, signal: ctx?.signal }); pic += `\n${e.line}`; }
      }
      if (!items.length && !args.ask) pic += `\nNothing readable here: this app doesn't name its buttons for UI Automation. To work in it, call app_look again with ask (a question about what the window shows; your eyes brain answers from a picture), then app_act with action click_at and x, y in that picture's pixels.`;
      const lines = items.slice(0, 150).map((x) => `- ${x.type}${x.name ? ` "${String(x.name).slice(0, 80)}"` : ''}${x.id ? ` [id ${String(x.id).slice(0, 40)}]` : ''}${x.password ? ' (password field: never typed in)' : x.typable ? ' (you can type here)' : ''}${x.enabled === false ? ' (greyed out)' : ''}${x.value ? ` = "${String(x.value).slice(0, 60)}"` : ''}`);
      const head = typeHere.length ? `You can type in: ${typeHere.slice(0, 5).map((x) => `${x.type} "${String(x.name || x.id).slice(0, 60)}"`).join('; ')}. Anything else is for clicking or reading.\n` : 'Nothing in this window takes typing.\n';
      return `Window: ${label(w)}\n${head}${lines.join('\n') || '(nothing readable; this app may not support UI Automation)'}${pic}\nTo use one, call app_act with its type and name (and id if names repeat). To type, pick one marked "you can type here".`;
    },
    summary: ({ window }) => `apps: look ${window || '(windows)'}`
  };

  t.app_act = {
    schema: fn('app_act', 'Do one thing in an open window: click, type, press keys, or click_at x, y when nothing has names. Get the names from app_look first. {{USER}} approves each action and can stop you with the mouse or Esc. Never in password fields. Give expect so Bob\'s eyes check the result.', {
      window: str('Part of the window title, or the program name.'),
      action: str('What to do', { enum: ['click', 'type', 'keys', 'focus', 'click_at'] }),
      type: str('The kind, as app_look listed it (Button, Edit, MenuItem...).'),
      name: str('Its name, as app_look listed it.'),
      id: str('Its id, if listed (use it when names repeat).'),
      nth: { type: 'integer', description: 'If several match, which (1 = first).' },
      text: str('type: the text. A one-line field is replaced; a document gets it at the end (the window alone is enough).'),
      keys: str('keys: like "Enter" or "Ctrl+S".'),
      x: { type: 'integer', description: 'click_at: pixels from the left of the picture.' },
      y: { type: 'integer', description: 'click_at: pixels from the top of the picture.' },
      expect: str('What should be true afterwards, in one sentence. Bob\'s eyes check it.')
    }, ['window', 'action']),
    approvalGroup: (a) => `apps-act:${String(a.window || '').toLowerCase()}`,
    async check(args, ctx) {
      off(); notStopped(ctx);
      const w = await findWindow(args.window);
      const target = { type: args.type ? String(args.type).replace(/[^A-Za-z]/g, '') : '', name: args.name ? String(args.name).slice(0, 200) : '', id: args.id ? String(args.id).slice(0, 200) : '', nth: Math.max(1, Math.min(50, Number(args.nth) || 1)) };
      // Ask the helper what this would really land on, so the card shows that (not just what Bob named).
      let real = '', note = '';
      if (args.action === 'click_at') {
        const x = Number(args.x), y = Number(args.y);
        if (!Number.isInteger(x) || !Number.isInteger(y) || x < 0 || y < 0 || x > 20000 || y > 20000) throw new Error('click_at needs x and y: whole numbers of pixels from the top-left of the window picture (take one with app_look, picture or ask).');
        const sentAt = sendOutBlock(cfg, w, 'click_at'); if (sentAt) throw new Error(sentAt);
        if (ctx) { ctx.appsWindow = w; ctx.appsAt = { x, y }; }
        return { text: `Click at ${x}, ${y} (pixels from the top-left of the window picture) in ${label(w)}. A red bar shows while Bob drives; move the mouse or press Esc to stop him.`, command: `Click at ${x}, ${y}`, cwd: label(w), button: 'Do it' };
      }
      if (['type', 'focus'].includes(args.action) || target.name || target.id) {
        if (!['click', 'type', 'keys', 'focus'].includes(args.action)) throw new Error('The action should be click, type, keys, focus or click_at.');
        const r = await drv.request('resolve', { hwnd: w.hwnd, action: args.action, target });
        if (r.password && limitOn(cfg, 'passwords')) throw new Error('Bob never types into password fields ("Never type into password fields" is on in Settings, Hands).');
        if (r.enabled === false) throw new Error(`${r.label} is greyed out.`);
        real = r.label || '';
        if (r.swapped) note = ` (${plain(r.swapped)} doesn't accept typing, so Bob will type into the window's main text area instead)`;
      }
      const sent = sendOutBlock(cfg, w, args.action, { name: `${target.name} ${real}`, id: target.id });
      if (sent) throw new Error(sent);
      const tt = () => plain(real || targetText(target)); // ids stay off the card (they're for Bob, not you)
      let what;
      if (args.action === 'click') { if (!target.name && !target.id) throw new Error('Say what to click (its name or id from app_look).'); what = `Click ${tt()}`; }
      else if (args.action === 'type') {
        if (args.text == null || String(args.text).length > 4000) throw new Error('Say the text to type (at most 4000 characters).');
        if (limitOn(cfg, 'passwords') && /password|passwd|pwd|\bpin\b/i.test(`${target.name} ${target.id}`)) throw new Error('Bob never types into password fields ("Never type into password fields" is on in Settings, Hands).');
        let text = String(args.text);
        // Plain-text windows get plain text: no literal ** and # marks.
        if (PLAIN_TEXT_APPS.includes(String(w.process).toLowerCase().replace(/\.exe$/, ''))) text = plainText(text);
        if (text.length > LONG_TYPING) { const mins = Math.max(1, Math.ceil(text.length / 100 / 60)); const who = cfg.userName || 'the user'; throw new Error(`That's ${text.length} characters, too long to type key by key (it would take about ${mins} minute${mins === 1 ? '' : 's'}). Offer ${who} to save it as a .txt file instead (one approval) and open it in Notepad, then say where it is. (For you: use write_file. Never name tools like write_file to ${who}.)`); }
        if (ctx) ctx.appsText = text;
        const said = `${text.slice(0, 300)}${text.length > 300 ? '...' : ''}`;
        // A one-line field gets the text in place of what is there; a document gets it added at the end (same as the helper).
        what = /^Edit\b/.test(real) ? `Replace what's in "${field(real || targetText(target))}" with: "${said}"` : `Add to the end of "${field(real || targetText(target))}"${note}: "${said}"`;
      } else if (args.action === 'keys') { const k = keysFor(args.keys); if (ctx) ctx.appsKeys = k; what = `Press ${String(args.keys)}${target.name || target.id ? ` in ${tt()}` : ''}${/%\{F4\}$/.test(k) ? ' (this closes the window)' : ''}`; }
      else if (args.action === 'focus') what = `Put the cursor in ${tt()}${note}`;
      else throw new Error('The action should be click, type, keys, focus or click_at.');
      if (ctx) { ctx.appsWindow = w; ctx.appsTarget = target; ctx.appsExpect = real; }
      return { text: `${what} in ${label(w)}. A red bar shows while Bob drives; move the mouse or press Esc to stop him.`, command: what, cwd: label(w), button: 'Do it' };
    },
    async run(args, ctx) {
      off(); notStopped(ctx);
      const w = ctx?.appsWindow || await findWindow(args.window);
      const target = ctx?.appsTarget || { type: args.type || '', name: args.name || '', id: args.id || '', nth: Number(args.nth) || 1 };
      const keys = args.action === 'keys' ? (ctx?.appsKeys || keysFor(args.keys)) : '';
      // What the card showed: if the window now resolves to something else, the helper does nothing.
      const expect = ctx?.appsExpect || '';
      const typed = ctx?.appsText ?? String(args.text ?? '');
      const at = args.action === 'click_at' ? (ctx?.appsAt || { x: Number(args.x), y: Number(args.y) }) : null;
      if (['click', 'type', 'focus'].includes(args.action) && !expect) throw new Error('Bob had no approved target for that action, so he did nothing. Ask again.');
      if (at && !(Number.isInteger(at.x) && Number.isInteger(at.y))) throw new Error('Bob had no approved place to click, so he did nothing. Ask again.');
      if (ctx) { ctx.appsWindow = null; ctx.appsTarget = null; ctx.appsKeys = null; ctx.appsExpect = null; ctx.appsText = null; ctx.appsAt = null; state.lastCtx = ctx; }
      // Check the window again right before acting: it may have changed title (a password prompt) or closed.
      const now = (await windows()).find((x) => String(x.hwnd) === String(w.hwnd));
      const b = blockedWindow(now, { ownPids }); if (b) throw new Error(b);
      const group = `apps-act:${String(args.window || '').toLowerCase()}`;
      const streak = Boolean(ctx?.allowAll?.has?.(group));
      await drv.request('drive', { on: true });
      state.driving = true;
      let r;
      try {
        const sent = sendOutBlock(cfg, now, args.action, { name: `${target.name} ${expect}`, id: target.id });
        if (sent) throw new Error(sent);
        r = at ? await drv.request('clickat', { hwnd: w.hwnd, x: at.x, y: at.y })
          : await drv.request('act', { hwnd: w.hwnd, action: args.action, target, text: args.action === 'type' ? typed : '', keys, expect, allowPassword: !limitOn(cfg, 'passwords') });
      } catch (e) {
        // Windows' own reason, word for word, so Bob passes it on instead of inventing one.
        log('hands', `apps: ${args.action} in ${label(w)} failed: ${e.message}`);
        throw new Error(`${e.message} (That is the real reason, from Windows. Tell ${cfg.userName || 'the user'} it in plain words; don't blame a "simulation" or guess another cause. Nothing else was done.)`);
      } finally {
        // With per-action approval the mouse is yours again between actions (you need it for the next card);
        // only an "allow the rest of this job" streak keeps the red bar up until the helper goes idle.
        clearTimeout(state.offTimer);
        if (!streak && state.driving) { state.driving = false; await drv.request('drive', { on: false }).catch(() => {}); }
        else if (state.driving) {
          state.offTimer = setTimeout(() => { if (state.driving) { state.driving = false; drv.request('drive', { on: false }).catch(() => {}); } }, 10000);
          state.offTimer.unref?.();
        }
      }
      log('hands', `apps: ${args.action} ${at ? `at ${at.x}, ${at.y}` : targetText(target)} in ${label(w)}: ${r.did || 'done'}`);
      const eyes = await eyesAfter(w, args.expect, ctx);
      if (/wasn't there/.test(r.did || '')) return `Not sure it worked: ${r.did}. Have a look at the window to check. (Bob: say so plainly and use app_look before trying again.)${eyes}`;
      return `Done: ${r.did || args.action}. Use app_look to check the result if it matters.${eyes}`;
    },
    summary: ({ action, window, name, x, y }) => `apps: ${action}${name ? ` "${name}"` : ''}${action === 'click_at' ? ` ${x}, ${y}` : ''} in ${window}`
  };

  return t;
}
