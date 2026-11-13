// 🔒 Passcode lock (Settings, This replicant matrix; off unless you turn it on).
// "Ask for a passcode to open Bob": Bob's window (and Settings, and anything else on this replicant matrix that opens
// his page) shows a passcode screen first. "Lock again after N minutes of nothing" locks it again when nobody has
// clicked or typed for that long (0 = only when Bob starts). "Lock my chats and memory" (src/vault.js) keeps them
// scrambled on disk with a key only the passcode opens.
//
// Kept in config.json (never settings.json, like the phone door): cfg.lock = { enabled, idleMinutes, encrypt,
// salt, wrapped }. `wrapped` is a random 32-byte data key locked with scrypt(passcode, salt): typing the passcode
// right is what opens it, so there's no copy of the passcode anywhere, and changing the passcode only locks the
// same key again (the chats needn't be redone). Forgetting it means the locked chats and memory are gone for good.
//
// Who gets in is held in Bob's memory only: a random token per window that typed the passcode, so a restart
// always asks again. Phones and your other Bobs come in through "Bob-Net access" with that
// door's own passcode; Bob for Android has its own lock on the phone (assets/www/lock.js).
import crypto from 'node:crypto';
import { readJsonFile, writeJsonAtomic } from './util.js';
import { setKey, hasKey, convertAll, vaultOn } from './vault.js';

export const MIN_LEN = 4;
export const MAX_IDLE = 24 * 60;
const SCRYPT = { N: 1 << 14, r: 8, p: 1 };

export const lockOn = (cfg) => cfg?.lock?.enabled === true && Boolean(cfg?.lock?.wrapped);
export const idleMinutes = (cfg) => { const n = Math.round(Number(cfg?.lock?.idleMinutes)); return Number.isFinite(n) && n > 0 ? Math.min(n, MAX_IDLE) : 0; };

const kek = (code, salt) => crypto.scryptSync(String(code).normalize('NFC'), Buffer.from(salt, 'base64'), 32, SCRYPT);

export function wrapKey(code, dataKey, salt = crypto.randomBytes(16).toString('base64')) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', kek(code, salt), iv);
  const ct = Buffer.concat([c.update(dataKey), c.final()]);
  return { salt, wrapped: Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64') };
}

// The data key when the passcode is right, else null.
export function unwrapKey(code, { salt, wrapped } = {}) {
  if (!salt || !wrapped) return null;
  try {
    const b = Buffer.from(wrapped, 'base64');
    const d = crypto.createDecipheriv('aes-256-gcm', kek(code, salt), b.subarray(0, 12));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  } catch { return null; }
}

export function saveLock(cfg, lock) {
  const raw = readJsonFile(cfg.configFile); // an unreadable config.json stops the save rather than being written over
  raw.lock = { ...(raw.lock || {}), ...lock };
  writeJsonAtomic(cfg.configFile, raw, 2);
  cfg.lock = raw.lock;
}

export const lockView = (cfg, lock) => ({
  enabled: lockOn(cfg), passcodeSet: Boolean(cfg.lock?.wrapped), idleMinutes: idleMinutes(cfg), encrypt: vaultOn(cfg),
  open: hasKey(), minLength: MIN_LEN, ...(lock ? { here: lock.windows() } : {})
});

export class Lock {
  constructor(cfg, { now = Date.now, log = () => {} } = {}) {
    this.cfg = cfg; this.now = now; this.log = log;
    this.tokens = new Map(); // token -> last time someone clicked or typed
    this.tries = [];
  }
  windows() { return this.tokens.size; }
  token(req) {
    const c = String(req.headers.cookie || '').split(/;\s*/).find((x) => x.startsWith('bob_lock='));
    return c ? c.slice(9) : '';
  }
  // True when this request may in: the lock is off, or it carries a token that hasn't gone idle.
  allowed(req) {
    if (!lockOn(this.cfg)) return true;
    const t = this.token(req);
    if (!t || !this.tokens.has(t)) return false;
    const idle = idleMinutes(this.cfg);
    if (idle && this.now() - this.tokens.get(t) > idle * 60000) { this.tokens.delete(t); return false; }
    return true;
  }
  touch(req) { const t = this.token(req); if (this.tokens.has(t)) this.tokens.set(t, this.now()); }
  // Five wrong tries a minute at most. Returns { token } or { error, code }.
  unlock(code) {
    const now = this.now();
    while (this.tries.length && now - this.tries[0] > 60000) this.tries.shift();
    if (this.tries.length >= 5) return { error: 'Too many tries. Wait a minute.', code: 429 };
    this.tries.push(now);
    const k = unwrapKey(code, this.cfg.lock);
    if (!k) return { error: 'That passcode isn\'t right.', code: 401 };
    setKey(k);
    this.tries = [];
    return { token: this.grant() };
  }
  // The window that just switched the lock on stays in (it didn't need a passcode a moment ago).
  grant() { const token = crypto.randomBytes(24).toString('hex'); this.tokens.set(token, this.now()); return token; }
  lockNow() { this.tokens.clear(); }
  cookie(token) { return `bob_lock=${token}; HttpOnly; SameSite=Strict; Path=/`; }

  // Settings: { enabled, idleMinutes, encrypt, passcode, newPasscode, current }. Only from this replicant matrix,
  // only by someone already in. Returns { view } or { error }.
  change(b = {}) {
    const cfg = this.cfg, cur = cfg.lock || {};
    if (cfg.profileNow) return { error: 'Only the owner can change the passcode lock. Lock Bob and open him with the owner\'s passcode.' }; // 👥 profiles.js
    const out = {};
    if ('idleMinutes' in b) { const n = Math.round(Number(b.idleMinutes)); if (!Number.isFinite(n) || n < 0 || n > MAX_IDLE) return { error: `Pick 0 to ${MAX_IDLE} minutes.` }; out.idleMinutes = n; }
    if ('newPasscode' in b) {
      const code = String(b.newPasscode || '');
      if (code.length < MIN_LEN) return { error: `The passcode needs at least ${MIN_LEN} characters.` };
      if (code.length > 200) return { error: 'That passcode is too long.' };
      let dataKey;
      if (cur.wrapped) {
        dataKey = unwrapKey(String(b.current || ''), cur);
        if (!dataKey) return { error: 'Type the passcode you have now first.' };
      } else dataKey = crypto.randomBytes(32);
      Object.assign(out, wrapKey(code, dataKey));
      setKey(dataKey);
    }
    const hasCode = Boolean(out.wrapped || cur.wrapped);
    const enabled = 'enabled' in b ? b.enabled === true : cur.enabled === true;
    const encrypt = 'encrypt' in b ? b.encrypt === true : cur.encrypt === true;
    if (enabled && !hasCode) return { error: 'Make a passcode first.' };
    if (!enabled && cur.encrypt === true && encrypt) return { error: 'Turn off Lock my chats and memory first, so they\'re put back to plain files.' };
    if (encrypt && !enabled) return { error: 'Turn on Ask for a passcode to open Bob first: the passcode is what opens your locked chats.' };
    if (encrypt !== (cur.encrypt === true) && !hasKey()) return { error: 'Type the passcode again (lock Bob and open him) before changing this.' };
    out.enabled = enabled; out.encrypt = encrypt;
    const turning = encrypt !== (cur.encrypt === true);
    saveLock(cfg, out);
    let changed = 0;
    if (turning) {
      try { changed = convertAll(cfg, encrypt); }
      catch (e) { saveLock(cfg, { encrypt: !encrypt }); return { error: `Couldn't ${encrypt ? 'lock' : 'unlock'} every file (${e.message}). Nothing was switched.` }; }
    }
    if (!enabled) this.tokens.clear();
    this.log('settings', `passcode lock: ${enabled ? 'on' : 'off'}${idleMinutes(cfg) ? `, again after ${idleMinutes(cfg)} min` : ''}${encrypt ? ', chats and memory locked' : ''}${out.wrapped ? ', new passcode' : ''}${turning ? ` (${changed} file${changed === 1 ? '' : 's'} ${encrypt ? 'locked' : 'unlocked'})` : ''}`);
    return { view: lockView(cfg, this), changed };
  }
}

// What the window shows while Bob is locked. `next` is where to go after.
// people: 👥 profiles (profiles.js), [{ id, name }]; with any, the screen asks "Who's this?" first.
export function lockPage({ next = '/', wrong = '', encrypt = false, people = [] } = {}) {
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const safeNext = /^\/[a-zA-Z0-9/_.?=&%-]*$/.test(next) && !next.startsWith('//') ? next : '/';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Bob is locked</title><link rel="icon" href="/icons/bob-32.png"><style>
:root{--bg:#1d1510;--card:#2b1d14;--ink:#f3e7d3;--line:#5a4030;--accent:#e7a64a;--bad:#ff9b8a}
@media (prefers-color-scheme: light){:root{--bg:#f6efe4;--card:#fffaf2;--ink:#2b1d14;--line:#c9b39a;--accent:#b0661a;--bad:#a3261a}}
body{background:var(--bg);color:var(--ink);font:16px "Segoe UI",system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0}
form{background:var(--card);padding:24px;border-radius:12px;display:grid;gap:12px;width:min(320px,calc(100vw - 32px));box-sizing:border-box}
input,button,select{font:inherit;padding:10px;border-radius:8px;border:1px solid var(--line);min-height:44px}input,select{background:var(--bg);color:var(--ink)}
button{background:var(--accent);color:var(--card);font-weight:700;border:none;cursor:pointer}p{margin:0}.bad{color:var(--bad)}.muted{opacity:.8;font-size:14px}
</style></head><body><form method="post" action="/unlock"><img src="/icons/bob-192.png" width="64" height="64" alt="">
<h1 style="font-size:20px;margin:0">🔒 Bob is locked</h1>
${people.length ? `<label for="w">Who's this?</label><select id="w" name="who"><option value="main">The owner</option>${people.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select>` : ''}
<label for="c">Passcode</label><input id="c" name="code" type="password" autocomplete="current-password" required autofocus>
<input type="hidden" name="next" value="${esc(safeNext)}">
${wrong ? `<p class="bad" role="alert">${esc(wrong)}</p>` : ''}
<button>Open Bob</button>
<p class="muted">${encrypt ? 'Your chats and memory stay locked until the passcode is typed.' : 'Bob keeps working in the background while he\'s locked.'}</p>
</form></body></html>`;
}

// Paths that work while Bob is locked: the lock screen's picture, the check Bob's own window does to see if he's
// running (only "locked" comes back), quitting (the update window), and the lock's own door.
export const OPEN_WHILE_LOCKED = (method, p) => p.startsWith('/icons/') || p === '/favicon.ico' || (method === 'POST' && p === '/unlock')
  || (method === 'GET' && (p === '/api/status' || p === '/api/lock/state')) || (method === 'POST' && p === '/api/quit');
