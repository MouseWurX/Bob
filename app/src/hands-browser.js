// The Browser Hand: Bob gets his own browser window (electron/browser-window.cjs, part of Bob's app: nothing to
// install, works on Windows, Mac and Linux, and is separate from the person's own browser, cookies and
// sign-ins). He opens a page, reads it as text plus a numbered list of what can be used (links, buttons,
// fields, boxes), and clicks, types, scrolls or presses keys by number, one approved action at a time, then
// checks the result with his eyes brain when asked to (src/eyes.js). Off until switched on, like every Hand.
//
// Rules this file keeps (the window keeps its own: no downloads, no pop-ups, no permissions, http(s) only):
// - Never Bob's own pages (his port), never file:, chrome:, about: or javascript: addresses.
// - "Don't send anything out" (hard limit, on by default): he may open, read, scroll, click links and type into a
//   search box (what a web search already does), but not fill other fields, press Enter in them, click Send,
//   Post, Submit, Upload, Buy or Pay, or pick files. Off: all of that is allowed, still one card each.
// - "Never type into password fields" holds here too (password boxes are marked on the page).
// - Only inside Bob's app: as a bare server (npm run server, tests) the Hand says so, unless a driver is given.
import path from 'node:path';
import fs from 'node:fs';
import { handOn, handOffWhy, limitOn } from './hands-settings.js';
import { pieceOf } from './tools.js';
import { eyesCheck, eyesOn } from './eyes.js';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });

export const BROWSER_TOOLS = ['browser_open', 'browser_read', 'browser_act'];
const MAX_PAGE = 15000;   // characters of page text per part (like fetch_page)
const MAX_ITEMS = 150;    // things Bob can use, per read
export const KEYS = ['enter', 'tab', 'esc', 'escape', 'up', 'down', 'left', 'right', 'pageup', 'pagedown', 'home', 'end', 'backspace', 'delete', 'space'];

// Buttons that send things off the computer (plus the Apps hand's list): never clicked while "Don't send anything out" is on.
const SEND_BUTTON = /\b(send|post|submit|upload|share|publish|reply|tweet|comment|attach|buy|pay|checkout|order|confirm|subscribe|sign ?up|register|apply|donate|purchase|place order|add to (?:cart|basket)|transfer|book now)\b/i;
const SEARCH_LIKE = /\b(search|query|find|look ?up|keywords?)\b|^q$/i;
export const searchLike = (item = {}) => item.search === true || [item.name, item.id, item.placeholder].some((f) => SEARCH_LIKE.test(String(f || '').trim()));

// Why an address can't be opened (empty when it can). Bob's own port is never opened: he can't approve his own cards.
export function urlProblem(cfg, url) {
  let u;
  try { u = new URL(String(url || '').trim()); } catch { return `"${String(url || '').slice(0, 80)}" isn't a web address. Give a full address like https://example.com.`; }
  if (!/^https?:$/.test(u.protocol)) return `Bob's browser only opens http and https pages, not ${u.protocol.replace(':', '')} addresses.`;
  const host = u.hostname.toLowerCase();
  const own = Number(cfg?.port || 7777);
  const port = Number(u.port || (u.protocol === 'https:' ? 443 : 80));
  if (['localhost', '127.0.0.1', '[::1]', '::1', '0.0.0.0'].includes(host) && port === own) return "That's Bob's own page. Bob never opens or clicks his own pages.";
  return '';
}

// Why an action is refused by a hard limit (empty when it's fine).
export function browserBlock(cfg, action, item = {}, { host = '' } = {}) {
  if (item.file) return 'That is a file picker. Bob never uploads or picks files in the browser.';
  if ((action === 'type' || action === 'keys') && item.password && limitOn(cfg, 'passwords')) return 'Bob never types into password fields ("Never type into password fields" is on in Settings, Hands).';
  if (!limitOn(cfg, 'sendOut')) return '';
  const what = `"Don't send anything out" is on (Settings, Hands)`;
  if (action === 'type' && !searchLike(item)) return `${what}, so Bob only types into search boxes in the browser, and "${item.name || 'that field'}" isn't one.`;
  if (action === 'keys' && /^(enter|return)$/i.test(String(item.key || '')) && !searchLike(item)) return `${what}, so Bob only presses Enter in a search box.`;
  if (action === 'click' && (item.role === 'button' || item.role === 'submit') && SEND_BUTTON.test(String(item.name || ''))) return `${what}, so Bob doesn't press "${item.name}"${host ? ` on ${host}` : ''}.`;
  return '';
}

export function keyFor(k) {
  const key = String(k || '').toLowerCase().replace(/\s+/g, '');
  if (!key) throw new Error('Say which key (Enter, Tab, Esc, Up, Down, PageDown...).');
  if (key.includes('+')) throw new Error('Bob presses single keys in the browser (Enter, Tab, Esc, arrows), not combinations.');
  if (!KEYS.includes(key)) throw new Error(`Bob doesn't press "${k}" in the browser. Keys: Enter, Tab, Esc, Up, Down, Left, Right, PageUp, PageDown, Home, End, Backspace, Delete, Space.`);
  return key === 'escape' ? 'esc' : key;
}

const hostOf = (url) => { try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return 'the page'; } };
const itemLine = (x) => `${x.n}. ${x.role}${x.name ? ` "${String(x.name).slice(0, 80)}"` : ''}${x.password ? ' (password field: never typed in)' : x.file ? ' (file picker: not used)' : x.typable ? (x.search ? ' (search box: you can type here)' : ' (you can type here)') : ''}${x.checked === true ? ' (ticked)' : x.checked === false ? ' (not ticked)' : ''}${x.disabled ? ' (greyed out)' : ''}${x.value ? ` = "${String(x.value).slice(0, 60)}"` : ''}${x.options?.length ? ` options: ${x.options.slice(0, 12).map((o) => `"${String(o).slice(0, 30)}"`).join(', ')}${x.options.length > 12 ? '…' : ''}` : ''}${x.href ? ` -> ${String(x.href).slice(0, 90)}` : ''}`;
const describe = (x) => `${x.role === 'link' ? 'link' : x.role} "${String(x.name || '').slice(0, 60) || `#${x.n}`}"`;

// The driver: electron/browser-window.cjs sets globalThis.bobBrowser when Bob runs in his app; tests pass one in.
export const defaultDriver = () => globalThis.bobBrowser || null;

export function browserTools(brain, { driver = null, track = () => () => {} } = {}) {
  const cfg = brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const state = { untrack: null, items: [], url: '', title: '' };
  const drv = () => {
    const d = driver || defaultDriver();
    if (!d) throw new Error("Bob's browser is only there inside Bob's app (Bob.exe, Bob.app or the Linux app), not when his brain runs on its own. Say so plainly; fetch_page can still read a page as text.");
    return d;
  };
  const off = () => { if (!handOn(cfg, 'browser')) throw new Error(handOffWhy(cfg, 'browser')); };
  const ensure = () => { if (!state.untrack) state.untrack = track({ line: 'Browser hand', stop: () => { try { drv().close(); } catch {} state.untrack = null; } }); };
  const where = () => `${state.title ? `"${String(state.title).slice(0, 80)}"` : 'the page'} (${hostOf(state.url)})`;

  async function snapshot() {
    const s = await drv().snapshot({ max: MAX_ITEMS });
    state.url = s.url || state.url; state.title = s.title || '';
    // Where Bob can type first, so a small brain doesn't aim at a label.
    const all = (s.items || []).filter((x) => x && x.n != null);
    state.items = [...all.filter((x) => x.typable && !x.password && !x.file), ...all.filter((x) => !(x.typable && !x.password && !x.file))];
    return { ...s, items: state.items };
  }
  const findItem = (n) => {
    const want = Number(n);
    if (!Number.isInteger(want) || want < 1) throw new Error('Say which thing by its number from browser_read.');
    const it = state.items.find((x) => Number(x.n) === want);
    if (!it) throw new Error(`There is no ${want} on the page as Bob last read it. Call browser_read to get the current numbers.`);
    return it;
  };
  // A picture of the page into the chat (and for the eyes check).
  async function picture(ctx) {
    const name = `browser-${Date.now()}.png`;
    const file = path.join(cfg.painterDir || cfg.dataDir, name);
    await drv().picture(file);
    if (fs.existsSync(file) || driver) ctx?.emit?.({ type: 'image', url: `/images/${encodeURIComponent(name)}`, file });
    return file;
  }

  const t = {};

  t.browser_open = {
    schema: fn('browser_open', 'Open a web address in Bob\'s own browser window (not {{USER}}\'s). {{USER}} approves first. Then read it with browser_read. http and https only.', { url: str('The full address, like https://example.com/page.') }),
    approvalGroup: (a) => `browser-open:${hostOf(a.url)}`,
    async check(args, ctx) {
      off();
      const url = String(args.url || '').trim();
      const p = urlProblem(cfg, url); if (p) throw new Error(p);
      drv();
      return { text: `Open ${url.length > 120 ? url.slice(0, 117) + '...' : url} in Bob's own browser window.`, command: `Open ${hostOf(url)}`, cwd: "Bob's browser", button: 'Open it' };
    },
    async run(args, ctx) {
      off();
      const url = String(args.url || '').trim();
      const p = urlProblem(cfg, url); if (p) throw new Error(p);
      ensure();
      let r;
      try { r = await drv().open(url); }
      catch (e) { log('hands', `browser: open ${url} failed: ${e.message}`); throw new Error(`The page didn't open: ${e.message} (That is the real reason. Tell ${cfg.userName || 'the user'} plainly; don't say it opened.)`); }
      const s = await snapshot().catch(() => ({ items: [] }));
      state.url = r?.url || s.url || url; state.title = r?.title || s.title || '';
      log('hands', `browser: opened ${state.url} (${state.title})`);
      return `Opened ${where()}: ${state.url}. ${s.items.length} thing${s.items.length === 1 ? '' : 's'} on it can be used. Call browser_read to read the page and get their numbers.`;
    },
    summary: ({ url }) => `browser: open ${hostOf(url)}`
  };

  t.browser_read = {
    schema: fn('browser_read', 'Read the page in Bob\'s browser: its text and a numbered list of links, buttons and fields for browser_act. A long page comes in parts. No OK needed.', {
      part: { type: 'integer', description: 'Which part (1 = first).' },
      find: str('Jump to the part with this text.'),
      picture: { type: 'boolean', description: 'Also show a picture of the page in the chat.' },
      ask: str('A question about how the page looks, answered from a picture (charts, pictures, layout).')
    }, []),
    async run(args, ctx) {
      off();
      ensure();
      const s = await snapshot();
      const items = s.items.slice(0, MAX_ITEMS);
      const typeHere = items.filter((x) => x.typable && !x.password && !x.file);
      log('hands', `browser: read ${state.url} (${items.length} things)`);
      let pic = '';
      if (args.picture || args.ask) {
        const file = await picture(ctx);
        pic = args.picture ? '\nA picture of the page is in the chat.' : '';
        if (args.ask) { const e = await eyesCheck(brain, { file, ask: String(args.ask) }, { emit: ctx?.emit, signal: ctx?.signal }); pic += `\n${e.line}`; }
      }
      const text = pieceOf(String(s.text || '').replace(/\n{3,}/g, '\n\n'), { part: args.part, find: args.find }, MAX_PAGE, 'browser_read again with');
      const head = typeHere.length ? `You can type in: ${typeHere.slice(0, 5).map((x) => `${x.n} (${x.role} "${String(x.name || '').slice(0, 50)}"${x.search ? ', a search box' : ''})`).join('; ')}. Everything else is for clicking or reading.` : 'Nothing on this page takes typing.';
      return `Page: ${where()}\n${state.url}\n${head}\nThings you can use (call browser_act with the number):\n${items.map(itemLine).join('\n') || '(nothing to click or type in)'}${pic}\n\nPage text:\n${text}`;
    },
    summary: ({ ask }) => ask ? 'browser: look at the page' : 'browser: read the page'
  };

  t.browser_act = {
    schema: fn('browser_act', 'Do one thing on the page in Bob\'s browser: click, type, press a key, scroll, go back or pick an option, by its number from browser_read. {{USER}} approves each action. Give expect so Bob\'s eyes check the result.', {
      action: str('What to do', { enum: ['click', 'type', 'keys', 'scroll', 'back', 'select'] }),
      n: { type: 'integer', description: 'Its number from browser_read.' },
      text: str('type: the text. It replaces what is in the field.'),
      keys: str('keys: one key, like Enter, Tab, Esc, Down or PageDown.'),
      option: str('select: the option to pick, by its words.'),
      direction: str('scroll: down (default) or up.', { enum: ['down', 'up'] }),
      expect: str('What should be true afterwards, in one sentence. Bob\'s eyes check it.')
    }, ['action']),
    approvalGroup: () => `browser-act:${hostOf(state.url)}`,
    async check(args, ctx) {
      off();
      drv();
      const action = String(args.action || '');
      if (!['click', 'type', 'keys', 'scroll', 'back', 'select'].includes(action)) throw new Error('The action should be click, type, keys, scroll, back or select.');
      const host = hostOf(state.url);
      let item = null, what;
      if (['click', 'type', 'select'].includes(action) || (action === 'keys' && args.n != null)) item = findItem(args.n);
      if (action === 'click') { if (item.disabled) throw new Error(`${describe(item)} is greyed out.`); what = `Click ${describe(item)}`; }
      else if (action === 'type') {
        if (!item.typable) throw new Error(`${describe(item)} doesn't take typing. Pick one marked "you can type here".`);
        if (args.text == null || String(args.text).length > 4000) throw new Error('Say the text to type (at most 4000 characters).');
        const said = String(args.text); what = `Type into ${describe(item)}: "${said.slice(0, 200)}${said.length > 200 ? '...' : ''}"`;
      } else if (action === 'keys') { const k = keyFor(args.keys); if (ctx) ctx.browserKey = k; what = `Press ${args.keys}${item ? ` in ${describe(item)}` : ''}`; if (item) item = { ...item, key: k }; else item = { key: k, search: true }; }
      else if (action === 'select') { if (!item.options?.length) throw new Error(`${describe(item)} isn't a select box.`); if (!args.option) throw new Error('Say which option to pick.'); what = `Pick "${String(args.option).slice(0, 60)}" in ${describe(item)}`; }
      else if (action === 'scroll') what = `Scroll ${args.direction === 'up' ? 'up' : 'down'}`;
      else what = 'Go back one page';
      const b = browserBlock(cfg, action, item || {}, { host }); if (b) throw new Error(b);
      if (ctx) { ctx.browserItem = item; ctx.browserWhat = what; }
      return { text: `${what} on ${where()}. Nothing else happens on the page.`, command: what, cwd: `Bob's browser, ${host}`, button: 'Do it' };
    },
    async run(args, ctx) {
      off();
      ensure();
      const action = String(args.action || '');
      const item = ctx?.browserItem ?? ((['click', 'type', 'select'].includes(action) || (action === 'keys' && args.n != null)) ? findItem(args.n) : null);
      const key = action === 'keys' ? (ctx?.browserKey || keyFor(args.keys)) : '';
      const what = ctx?.browserWhat || action;
      if (ctx) { ctx.browserItem = null; ctx.browserKey = null; ctx.browserWhat = null; }
      // Checked again right before acting (the card may have waited a while).
      const b = browserBlock(cfg, action, item ? { ...item, key } : { key, search: true }, { host: hostOf(state.url) }); if (b) throw new Error(b);
      let r;
      try { r = await drv().act({ action, n: item?.n, text: action === 'type' ? String(args.text ?? '') : '', key, option: action === 'select' ? String(args.option || '') : '', direction: args.direction === 'up' ? 'up' : 'down' }); }
      catch (e) { log('hands', `browser: ${what} failed: ${e.message}`); throw new Error(`${e.message} (That is the real reason, from the browser. Tell ${cfg.userName || 'the user'} plainly; nothing else was done.)`); }
      state.url = r?.url || state.url; state.title = r?.title || state.title;
      log('hands', `browser: ${what}: ${r?.did || 'done'} (now ${state.url})`);
      let eyes = '';
      if (args.expect && eyesOn(cfg)) { const file = await picture(null).catch(() => ''); const e = await eyesCheck(brain, { file, expect: String(args.expect) }, { emit: ctx?.emit, signal: ctx?.signal }); eyes = `\n${e.line}`; }
      else if (args.expect) { const { eyesWhy } = await import('./eyes.js'); eyes = `\n(Not checked by eye: ${eyesWhy(cfg)}.)`; }
      return `Done: ${r?.did || what}. Now at ${where()}: ${state.url}.${eyes}\nCall browser_read before the next step if the page may have changed.`;
    },
    summary: ({ action, n, keys }) => `browser: ${action}${n != null ? ` #${n}` : ''}${keys ? ` ${keys}` : ''}`
  };

  return t;
}

// A line for Bob's instructions when the Hand is on.
export function browserPrompt(cfg) {
  if (!handOn(cfg, 'browser')) return '';
  return ` Browser: browser_open opens a page in Bob's own window, browser_read gives the page text and numbered things to use, browser_act does one step by number (click, type, keys, scroll, back, select). Read, act, read again. Pass expect on steps that should change the page so your eyes check it; when the check says no, read the page before trying anything else.${limitOn(cfg, 'sendOut') ? ' While "Don\'t send anything out" is on you type only into search boxes and never press Send, Post, Submit, Buy or Upload.' : ''}`;
}

// For the Settings page.
export function browserView(cfg, driver = defaultDriver()) {
  return { available: Boolean(driver), eyes: String(cfg?.models?.eyes || ''), eyesCheck: cfg?.hands?.eyesCheck !== false };
}
