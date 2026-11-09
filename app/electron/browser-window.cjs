// Bob's own browser window, for the Browser hand (src/hands-browser.js). Runs in Bob's main process and is handed
// to the brain as globalThis.bobBrowser before src/server.js loads. One window, made when a page is first opened,
// titled "Bob is browsing" so it is never mistaken for yours. Its own profile (partition persist:bob-browser): your
// browser's cookies and sign-ins are never visible to Bob, and "Forget what Bob's browser knows" clears his.
//
// What the window itself refuses, whatever the brain asks: downloads, pop-ups and new windows (links open in the
// same window), every permission (camera, microphone, location, notifications...), and any address that isn't
// http(s) or that is one of Bob's own pages.
const { BrowserWindow, session, nativeImage } = require('electron');
const fs = require('node:fs');

const PICTURE_WIDTH = 1280; // pictures for the chat and the eyes brain are shrunk to this
const SETTLE_MS = 6000;     // how long to wait for a page to finish loading after an action

// Runs in the page: numbers everything that can be used and returns it with the page text.
// Kept to plain browser JavaScript; it never touches Bob's own code.
const SNAPSHOT_JS = (max) => `(() => {
  const max = ${Number(max) || 150};
  const vis = (el) => { const r = el.getBoundingClientRect(); if (!(r.width > 0 && r.height > 0)) return false; const s = getComputedStyle(el); return s.visibility !== 'hidden' && s.display !== 'none'; };
  const txt = (el) => (el.getAttribute('aria-label') || (el.labels && el.labels[0] && el.labels[0].innerText) || el.getAttribute('placeholder') || el.getAttribute('title') || el.getAttribute('alt') || (el.querySelector && el.querySelector('img[alt]') && el.querySelector('img[alt]').getAttribute('alt')) || el.innerText || el.value || el.getAttribute('name') || '').replace(/\\s+/g, ' ').trim().slice(0, 120);
  const TEXTY = ['text', 'search', 'email', 'url', 'tel', 'number', 'password', 'date', 'time', 'datetime-local', 'month', 'week'];
  const sel = 'a[href], button, input, textarea, select, summary, [role=button], [role=link], [role=textbox], [role=searchbox], [role=checkbox], [role=radio], [role=tab], [role=menuitem], [role=option], [role=switch], [contenteditable=true], [contenteditable=""]';
  document.querySelectorAll('[data-bob-n]').forEach((el) => el.removeAttribute('data-bob-n'));
  const items = []; let n = 0;
  for (const el of document.querySelectorAll(sel)) {
    if (items.length >= max) break;
    if (!vis(el)) continue;
    const tag = el.tagName.toLowerCase(), type = (el.getAttribute('type') || '').toLowerCase(), role = el.getAttribute('role') || '';
    if (tag === 'input' && type === 'hidden') continue;
    const it = { n: ++n, role: tag, name: txt(el), id: el.id || '', placeholder: el.getAttribute('placeholder') || '' };
    if (tag === 'a') it.role = 'link';
    else if (tag === 'button' || role === 'button' || (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type))) it.role = (tag === 'button' && el.type === 'submit') || type === 'submit' ? 'submit' : 'button';
    else if (tag === 'input' && ['checkbox', 'radio'].includes(type)) { it.role = type; it.checked = el.checked; }
    else if (tag === 'input' && type === 'file') { it.role = 'file'; it.file = true; }
    else if (tag === 'input' || tag === 'textarea' || role === 'textbox' || role === 'searchbox' || el.isContentEditable) { it.role = tag === 'textarea' || el.isContentEditable ? 'text area' : 'field'; it.typable = !el.disabled && !el.readOnly; it.password = type === 'password'; it.search = type === 'search' || role === 'searchbox' || /search|query|find/i.test(it.name + ' ' + it.id + ' ' + (el.getAttribute('name') || '')) || /^q$/i.test(el.getAttribute('name') || el.id || '') || Boolean(el.closest && el.closest('form[role=search], [role=search]')); if (!it.password && el.value) it.value = String(el.value).slice(0, 80); }
    else if (tag === 'select') { it.role = 'select'; it.options = Array.from(el.options).slice(0, 40).map((o) => o.text.trim().slice(0, 60)); const cur = el.options[el.selectedIndex]; if (cur) it.value = cur.text.trim().slice(0, 60); }
    else if (role) it.role = role;
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') it.disabled = true;
    if (tag === 'a') { const h = el.getAttribute('href') || ''; if (h && !/^(javascript|#)/i.test(h)) it.href = el.href.slice(0, 200); }
    if (!it.name && !it.typable && !it.options && it.role !== 'checkbox' && it.role !== 'radio') { n--; continue; }
    el.setAttribute('data-bob-n', String(it.n));
    items.push(it);
  }
  const text = (document.body ? document.body.innerText : '').replace(/\\u00a0/g, ' ').slice(0, 60000);
  return { url: location.href, title: document.title, text, items };
})()`;

const WHERE_JS = (n) => `(() => { const el = document.querySelector('[data-bob-n="${Number(n)}"]'); if (!el) return null; el.scrollIntoView({ block: 'center', inline: 'center' }); const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, name: (el.getAttribute('aria-label') || el.innerText || el.value || '').replace(/\\s+/g, ' ').trim().slice(0, 60) }; })()`;
const FOCUS_JS = (n, selectAll) => `(() => { const el = document.querySelector('[data-bob-n="${Number(n)}"]'); if (!el) return false; el.scrollIntoView({ block: 'center' }); el.focus(); ${selectAll ? "if (el.select) el.select(); else if (el.isContentEditable) { const r = document.createRange(); r.selectNodeContents(el); const s = getSelection(); s.removeAllRanges(); s.addRange(r); }" : ''} return document.activeElement === el; })()`;
const VALUE_JS = (n) => `(() => { const el = document.querySelector('[data-bob-n="${Number(n)}"]'); return el ? String(el.value != null ? el.value : el.innerText || '').slice(0, 200) : ''; })()`;
const SELECT_JS = (n, option) => `(() => { const el = document.querySelector('[data-bob-n="${Number(n)}"]'); if (!el || !el.options) return 'That select box is gone.'; const want = ${JSON.stringify(String(option).toLowerCase())}; const o = Array.from(el.options).find((x) => x.text.trim().toLowerCase() === want) || Array.from(el.options).find((x) => x.text.trim().toLowerCase().includes(want)); if (!o) return 'No option called ' + ${JSON.stringify(String(option))} + '.'; el.value = o.value; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); return ''; })()`;
const SCROLL_JS = (dir) => `(() => { window.scrollBy({ top: ${dir === 'up' ? '-' : ''}Math.round(innerHeight * 0.8), behavior: 'instant' }); return Math.round(scrollY); })()`;

const KEYCODES = { enter: 'Enter', tab: 'Tab', esc: 'Escape', up: 'Up', down: 'Down', left: 'Left', right: 'Right', pageup: 'PageUp', pagedown: 'PageDown', home: 'Home', end: 'End', backspace: 'Backspace', delete: 'Delete', space: 'Space' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function makeBobBrowser({ base, icon } = {}) {
  let win = null;
  const ses = () => session.fromPartition('persist:bob-browser');
  const okUrl = (url) => { try { const u = new URL(url); if (!/^https?:$/.test(u.protocol)) return false; return !(base && url.startsWith(base)); } catch { return false; } };

  function ensure() {
    if (win && !win.isDestroyed()) return win;
    const s = ses();
    // No downloads, no permissions: the window is for looking and clicking, nothing more.
    if (!s.bobGuarded) {
      s.bobGuarded = true;
      s.on('will-download', (e) => e.preventDefault());
      s.setPermissionRequestHandler((wc, perm, cb) => cb(false));
      s.setPermissionCheckHandler(() => false);
    }
    win = new BrowserWindow({
      width: 1100, height: 800, minWidth: 400, minHeight: 300, title: 'Bob is browsing', icon, autoHideMenuBar: true, backgroundColor: '#ffffff',
      webPreferences: { partition: 'persist:bob-browser', sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, spellcheck: false }
    });
    win.setMenu?.(null);
    const wc = win.webContents;
    wc.on('page-title-updated', (e, title) => { e.preventDefault(); if (!win.isDestroyed()) win.setTitle(`Bob is browsing: ${String(title || '').slice(0, 80) || wc.getURL()}`); });
    wc.setWindowOpenHandler(({ url }) => { if (okUrl(url)) wc.loadURL(url).catch(() => {}); return { action: 'deny' }; });
    wc.on('will-navigate', (e, url) => { if (!okUrl(url)) e.preventDefault(); });
    wc.on('will-redirect', (e, url) => { if (!okUrl(url)) e.preventDefault(); });
    win.on('closed', () => { win = null; });
    return win;
  }
  const wc = () => { if (!win || win.isDestroyed()) throw new Error("Bob's browser window is closed. Open a page first (browser_open)."); return win.webContents; };
  async function settle() {
    const c = wc();
    const until = Date.now() + SETTLE_MS;
    await sleep(250);
    while (c.isLoading() && Date.now() < until) await sleep(100);
    await sleep(150);
  }
  const here = () => { const c = wc(); return { url: c.getURL(), title: c.getTitle() }; };

  return {
    available: () => true,
    isOpen: () => Boolean(win && !win.isDestroyed()),
    async open(url) {
      if (!okUrl(url)) throw new Error('Only http and https pages, and never Bob\'s own pages.');
      const w = ensure();
      w.show();
      // ERR_ABORTED is what Electron says when the page itself moved on (a redirect); the page still loads.
      try { await w.webContents.loadURL(url); } catch (e) { if (!/ERR_ABORTED/.test(String(e?.message))) throw new Error(String(e?.message || e).replace(/^Error invoking remote method [^:]*: /, '')); }
      await settle();
      return here();
    },
    async snapshot({ max = 150 } = {}) {
      const c = wc();
      const s = await c.executeJavaScript(SNAPSHOT_JS(max), true);
      return s || { ...here(), text: '', items: [] };
    },
    async act({ action, n, text = '', key = '', option = '', direction = 'down' } = {}) {
      const c = wc();
      let did;
      if (action === 'click') {
        const at = await c.executeJavaScript(WHERE_JS(n), true);
        if (!at) throw new Error('That thing is no longer on the page. Read the page again.');
        await sleep(80);
        const x = Math.round(at.x), y = Math.round(at.y);
        c.sendInputEvent({ type: 'mouseMove', x, y });
        c.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 });
        c.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 });
        did = `clicked "${at.name || `#${n}`}"`;
      } else if (action === 'type') {
        const ok = await c.executeJavaScript(FOCUS_JS(n, true), true);
        if (!ok) throw new Error("The page wouldn't put the cursor in that field, so nothing was typed.");
        await c.insertText(String(text));
        await sleep(120);
        const now = await c.executeJavaScript(VALUE_JS(n), true);
        did = `typed into #${n}${String(now).includes(String(text).slice(0, 50)) ? ', and checked it is there' : ' (the field now shows: "' + String(now).slice(0, 80) + '")'}`;
      } else if (action === 'keys') {
        const code = KEYCODES[String(key).toLowerCase()];
        if (!code) throw new Error(`Bob doesn't press "${key}" in the browser.`);
        if (n != null) await c.executeJavaScript(FOCUS_JS(n, false), true);
        c.sendInputEvent({ type: 'keyDown', keyCode: code });
        if (code === 'Enter') c.sendInputEvent({ type: 'char', keyCode: 'Enter' });
        if (code === 'Space') c.sendInputEvent({ type: 'char', keyCode: ' ' });
        c.sendInputEvent({ type: 'keyUp', keyCode: code });
        did = `pressed ${code}`;
      } else if (action === 'select') {
        const problem = await c.executeJavaScript(SELECT_JS(n, option), true);
        if (problem) throw new Error(problem);
        did = `picked "${option}" in #${n}`;
      } else if (action === 'scroll') {
        const y = await c.executeJavaScript(SCROLL_JS(direction), true);
        did = `scrolled ${direction} (now ${y} px down the page)`;
      } else if (action === 'back') {
        const h = c.navigationHistory;
        if (!(h?.canGoBack ? h.canGoBack() : c.canGoBack())) throw new Error('There is no earlier page to go back to.');
        if (h?.goBack) h.goBack(); else c.goBack();
        did = 'went back';
      } else throw new Error('Unknown action.');
      await settle();
      return { did, ...here() };
    },
    async picture(file) {
      const c = wc();
      let img = await c.capturePage();
      const size = img.getSize();
      if (size.width > PICTURE_WIDTH) img = img.resize({ width: PICTURE_WIDTH });
      fs.writeFileSync(file, img.toPNG());
      return file;
    },
    close() { if (win && !win.isDestroyed()) win.destroy(); win = null; return true; },
    async forget() {
      this.close();
      const s = ses();
      await s.clearStorageData();
      await s.clearCache();
      return true;
    }
  };
}

module.exports = { makeBobBrowser, nativeImage };
