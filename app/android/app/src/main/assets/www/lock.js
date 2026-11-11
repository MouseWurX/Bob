// Bob for Android: 🔒 Passcode lock (Settings, Passcode lock; off unless you turn it on). Same idea as desktop Bob's
// (src/lock.js): a passcode screen before the app opens, again after some minutes of nothing, and "Lock my chats and
// memory" keeps this phone's chats and memory scrambled in the app's storage (AES-GCM, key from the passcode with
// PBKDF2). The data key is random and kept only locked by the passcode, so changing the passcode doesn't redo the
// chats; a forgotten passcode means the locked chats and memory are gone for good.
// No imports or exports: the page loads it with a <script> tag before phone.js, the tests with import();
// both read globalThis.BobLock. phone.js starts only once BobLock.ready() says the phone is open.
(() => {
  const KEY = 'bob.lock';
  const SEALED = ['chats', 'memory']; // the store keys that get locked
  const ITER = 210000;
  const MIN_LEN = 4;
  const LOST = 'If you forget the passcode, your locked chats and memory are gone for good. Nobody can open them, not even Bob, and there is no reset.';
  const subtle = globalThis.crypto?.subtle;
  const ls = () => globalThis.localStorage;
  const b64 = (buf) => { let s = ''; for (const x of new Uint8Array(buf)) s += String.fromCharCode(x); return btoa(s); };
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const readCfg = () => { try { return JSON.parse(ls().getItem(KEY)) || {}; } catch { return {}; } };
  const writeCfg = (c) => { try { ls().setItem(KEY, JSON.stringify(c)); } catch {} };

  let dataKey = null; // CryptoKey, in memory only
  const plain = new Map(); // store key -> JSON text, while the phone is open
  let lastInput = Date.now();

  const kek = async (code, salt) => subtle.deriveKey({ name: 'PBKDF2', salt, iterations: ITER, hash: 'SHA-256' },
    await subtle.importKey('raw', new TextEncoder().encode(String(code).normalize('NFC')), 'PBKDF2', false, ['deriveKey']),
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
  const importData = (raw) => subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);

  async function wrap(code, raw) {
    const salt = crypto.getRandomValues(new Uint8Array(16)), iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, await kek(code, salt), raw);
    return { salt: b64(salt), iv: b64(iv), wrapped: b64(ct) };
  }
  async function unwrap(code, c) {
    if (!c.wrapped) return null;
    try { return new Uint8Array(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(c.iv) }, await kek(code, unb64(c.salt)), unb64(c.wrapped))); } catch { return null; }
  }
  async function seal(text) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await subtle.encrypt({ name: 'AES-GCM', iv }, dataKey, new TextEncoder().encode(text));
    return JSON.stringify({ bobSealed: 1, iv: b64(iv), data: b64(ct) });
  }
  const sealedValue = (v) => { try { const j = JSON.parse(v); return j && j.bobSealed === 1 ? j : null; } catch { return null; } };
  async function unseal(j) { return new TextDecoder().decode(await subtle.decrypt({ name: 'AES-GCM', iv: unb64(j.iv) }, dataKey, unb64(j.data))); }

  const on = () => { const c = readCfg(); return c.enabled === true && Boolean(c.wrapped); };
  const encOn = () => on() && readCfg().encrypt === true;

  // Open the phone with the passcode: unlock the key and read the locked values into memory.
  async function open(code) {
    const raw = await unwrap(code, readCfg());
    if (!raw) return false;
    dataKey = await importData(raw);
    for (const k of SEALED) {
      const v = ls().getItem(`bob.${k}`);
      const j = v && sealedValue(v);
      if (j) plain.set(k, await unseal(j));
    }
    return true;
  }

  // Every store key: a locked one comes from memory, the rest straight from storage.
  function get(k) {
    if (plain.has(k)) return plain.get(k);
    const v = ls().getItem(`bob.${k}`);
    return v && sealedValue(v) ? null : v; // never hand a locked value to the page as if it were the value
  }
  let writing = Promise.resolve();
  function set(k, text) {
    if (!SEALED.includes(k) || !encOn() || !dataKey) { plain.delete(k); ls().setItem(`bob.${k}`, text); return; }
    plain.set(k, text);
    writing = writing.then(async () => ls().setItem(`bob.${k}`, await seal(plain.get(k)))).catch(() => {});
  }
  const flush = () => writing;

  // Settings. Returns '' when done, or what's wrong.
  async function change(b = {}) {
    if (!subtle) return 'This phone\'s browser part can\'t do the scrambling a passcode needs.';
    const c = readCfg();
    if ('idleMinutes' in b) { const n = Math.round(Number(b.idleMinutes)); if (!Number.isFinite(n) || n < 0 || n > 1440) return 'Pick 0 to 1440 minutes.'; c.idleMinutes = n; }
    if ('newPasscode' in b) {
      const code = String(b.newPasscode || '');
      if (code.length < MIN_LEN) return `The passcode needs at least ${MIN_LEN} characters.`;
      let raw;
      if (c.wrapped) { raw = await unwrap(String(b.current || ''), c); if (!raw) return 'Type the passcode you have now first.'; }
      else raw = crypto.getRandomValues(new Uint8Array(32));
      Object.assign(c, await wrap(code, raw));
      dataKey = await importData(raw);
    }
    const enabled = 'enabled' in b ? b.enabled === true : c.enabled === true;
    const encrypt = 'encrypt' in b ? b.encrypt === true : c.encrypt === true;
    if (enabled && !c.wrapped) return 'Make a passcode first.';
    if (!enabled && c.encrypt === true && encrypt) return 'Turn off Lock my chats and memory first, so they\'re put back to plain.';
    if (encrypt && !enabled) return 'Turn on Ask for a passcode first: the passcode is what opens your locked chats.';
    if (encrypt !== (c.encrypt === true) && !dataKey) return 'Close and open Bob, type the passcode, then try again.';
    const turning = encrypt !== (c.encrypt === true);
    if (turning) {
      // Read everything as it is now, then write it the new way.
      const now = {};
      for (const k of SEALED) now[k] = plain.has(k) ? plain.get(k) : ls().getItem(`bob.${k}`);
      c.enabled = enabled; c.encrypt = encrypt; writeCfg(c);
      for (const k of SEALED) {
        if (now[k] == null) continue;
        if (encrypt) { plain.set(k, now[k]); ls().setItem(`bob.${k}`, await seal(now[k])); } else { plain.delete(k); ls().setItem(`bob.${k}`, now[k]); }
      }
    } else { c.enabled = enabled; c.encrypt = encrypt; writeCfg(c); }
    return '';
  }
  const view = () => { const c = readCfg(); return { enabled: on(), passcodeSet: Boolean(c.wrapped), idleMinutes: Number(c.idleMinutes) || 0, encrypt: encOn(), can: Boolean(subtle) }; };

  // ---------- On the screen ----------
  const $ = (id) => document.getElementById(id);
  function showLock() {
    const box = $('lock-screen');
    if (!box) return Promise.resolve();
    box.classList.remove('hidden');
    $('lock-note').textContent = encOn() ? 'Your chats and memory stay locked until the passcode is typed.' : '';
    return new Promise((resolve) => {
      let tries = [];
      $('lock-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const now = Date.now(); tries = tries.filter((t) => now - t < 60000);
        if (tries.length >= 5) { $('lock-wrong').textContent = 'Too many tries. Wait a minute.'; return; }
        tries.push(now);
        const ok = await open($('lock-code').value);
        if (!ok) { $('lock-wrong').textContent = 'That passcode isn\'t right.'; $('lock-code').value = ''; return; }
        $('lock-code').value = ''; $('lock-wrong').textContent = '';
        box.classList.add('hidden');
        resolve();
      });
      setTimeout(() => $('lock-code')?.focus(), 50);
    });
  }
  // Lock again after the minutes of nothing: the page reloads and asks first.
  function watchIdle() {
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) document.addEventListener(ev, () => { lastInput = Date.now(); }, { passive: true });
    const check = () => { const n = readCfg().idleMinutes; if (on() && n > 0 && Date.now() - lastInput > n * 60000) flush().then(() => location.reload()); };
    setInterval(check, 30000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
  function lockNow() { flush().then(() => location.reload()); }

  function drawSettings() {
    const v = view();
    if (!$('lock-on')) return;
    $('lock-on').checked = v.enabled; $('lock-enc').checked = v.encrypt; $('lock-idle').value = v.idleMinutes;
    $('lock-save').textContent = v.passcodeSet ? 'Change the passcode' : 'Save passcode';
    $('lock-warn').textContent = `⚠ ${LOST}`;
    if (!v.can) $('lock-msg').textContent = 'This phone\'s browser part can\'t do the scrambling a passcode needs, so the lock isn\'t available here.';
  }
  function wireSettings() {
    if (!$('lock-on')) return;
    const say = (t) => { $('lock-msg').textContent = t; drawSettings(); };
    const run = async (b, done) => { const err = await change(b); say(err || done); };
    $('lock-on').addEventListener('change', (e) => run({ enabled: e.target.checked }, e.target.checked ? 'On. Bob asks for the passcode next time he opens.' : 'Off.'));
    $('lock-idle').addEventListener('change', (e) => run({ idleMinutes: Number(e.target.value) || 0 }, 'Saved.'));
    $('lock-enc').addEventListener('change', (e) => {
      if (e.target.checked && !view().encrypt) { $('lock-ask').classList.remove('hidden'); return; }
      if (!e.target.checked && view().encrypt) run({ encrypt: false }, 'Your chats and memory are plain again.');
    });
    $('lock-enc-yes').addEventListener('click', () => { $('lock-ask').classList.add('hidden'); run({ encrypt: true }, 'Locked. Your chats and memory are scrambled on this phone now.'); });
    $('lock-enc-no').addEventListener('click', () => { $('lock-ask').classList.add('hidden'); drawSettings(); });
    $('lock-save').addEventListener('click', () => {
      if ($('lock-new').value !== $('lock-again').value) return say('The two new passcodes don\'t match.');
      run({ newPasscode: $('lock-new').value, current: $('lock-current').value }, 'Passcode saved.').then(() => { for (const id of ['lock-new', 'lock-again', 'lock-current']) $(id).value = ''; });
    });
    $('lock-now').addEventListener('click', () => (on() ? lockNow() : say('Turn on Ask for a passcode first.')));
  }

  let readyP = null;
  function ready() {
    if (!readyP) readyP = (async () => {
      if (typeof document !== 'undefined') {
        if (on() && subtle) await showLock();
        wireSettings(); drawSettings(); watchIdle();
      }
    })();
    return readyP;
  }

  globalThis.BobLock = { ready, get, set, flush, change, view, open, drawSettings, LOST, SEALED, _reset: () => { dataKey = null; plain.clear(); readyP = null; } };
})();
