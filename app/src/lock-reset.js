// 🔑 Forgot the passcode? (Settings, This replicant matrix, 🔒 Passcode lock; every part off unless you set it up.)
//
// Two ways back in, both started from the lock screen ("Forgot it?"):
//
// 1. A spare key on another Bob (gets everything back, locked chats and memory too). While Bob is open, "Get a spare
//    key ready" makes a recovery key, kept here in config.json (locked by Locked secrets, secret-box.js), and a spare:
//    the chats' key locked with that recovery key. Your other Bob (desktop Bob or Bob for Android) picks the spare up
//    ONCE, over Bob-Net, when you press "Pick up a spare key" in ITS OWN Settings; after that this Bob holds no copy
//    of it. Neither half opens anything alone: the spare is useless without this Bob's recovery key, and this Bob
//    can't rebuild the spare. To reset: "Ask my other Bob" on the lock screen, then "Let it reset" in that Bob's own
//    Settings (never from a web page, and only while the ask is waiting, 15 minutes). Then a new passcode is made
//    on this lock screen, and the same chats' key is locked with it.
//
// 2. A code by email or Discord DM (gets you past the lock screen only). A one-time 8-digit code, 10 minutes, five
//    tries, sent only to your own email account (Settings, Email account) or your own Discord DMs. It can't open
//    locked chats and memory: with Lock my chats and memory on, they're set aside still locked (with their old lock,
//    so the old passcode still opens them if it comes back to you) and you start with none.
//
// Every step is logged. Nothing here loads a brain, wakes the graphics card or changes the session (Gaming stays Gaming).
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJsonFile } from './util.js';
import { saveLock, wrapKey, lockOn, MIN_LEN, lockHead } from './lock.js';
import { setKey, currentKey, hasKey, vaultFiles, isSealed } from './vault.js';
import { theBox, lockOn as secretsOn, writeSecretJson, openCopy } from './secret-box.js';

export const ASK_MINUTES = 15, OFFER_MINUTES = 15, CODE_MINUTES = 10, MAX_KEEP = 12;

// ---------- the spare: the chats' key, locked with the recovery key ----------
export function makeSpare(dataKey, recKey) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', recKey, iv);
  c.setAAD(Buffer.from('bob-spare-key-1'));
  const ct = Buffer.concat([c.update(dataKey), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}
export function openSpare(blob, recKey) {
  try {
    const b = Buffer.from(String(blob || ''), 'base64');
    if (b.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', recKey, b.subarray(0, 12));
    d.setAAD(Buffer.from('bob-spare-key-1'));
    d.setAuthTag(b.subarray(12, 28));
    return Buffer.concat([d.update(b.subarray(28)), d.final()]);
  } catch { return null; }
}
export const keyCheck = (dataKey) => crypto.createHmac('sha256', dataKey).update('bob-spare-check').digest('hex').slice(0, 32);
const hash = (code) => crypto.createHash('sha256').update('bob-reset-code:' + String(code)).digest();
const cleanName = (v) => String(v ?? '').replace(/[^\p{L}\p{N} '._-]/gu, '').trim().slice(0, 40) || 'another Bob';

// What the lock screen and Settings may say about reset (never a key or a code).
export const resetSettings = (cfg) => ({ email: cfg?.lock?.reset?.email === true, discord: cfg?.lock?.reset?.discord === true });

export class LockReset {
  // send: { email(text) -> Promise<{ to }>, discord(text) -> Promise, emailReady() -> bool, discordReady() -> bool }
  constructor(cfg, lock, { now = Date.now, log = () => {}, send = {}, box = theBox } = {}) {
    this.cfg = cfg; this.lock = lock; this.now = now; this.log = log; this.send = send; this.box = box;
    this.offer = null; // { blob, until }: the spare, waiting to be picked up once
    this.ask = null; // { until, approved: Buffer|null, by }
    this.code = null; // { hash, until, tries, via }
    this.sent = []; // when codes were sent (one a minute, five an hour)
    this.gives = []; // spare keys offered back (five a minute)
  }
  spare() { return this.cfg.lock?.spare || null; }
  recKey() {
    const s = this.spare(); if (!s?.key) return null;
    const v = this.box().open(s.key);
    const b = v ? Buffer.from(v, 'base64') : null;
    return b && b.length === 32 ? b : null;
  }

  // ---------- Settings (this replicant matrix, someone already in) ----------
  view() {
    const s = this.spare(), r = resetSettings(this.cfg);
    return {
      spareReady: Boolean(s?.key), keptBy: (s?.keptBy || []).map((k) => ({ name: k.name, at: k.at })),
      offerUntil: this.offer && this.offer.until > this.now() ? this.offer.until : 0,
      email: r.email, discord: r.discord,
      emailReady: Boolean(this.send.emailReady?.()), discordReady: Boolean(this.send.discordReady?.())
    };
  }
  // "Get a spare key ready": the spare waits 15 minutes for your other Bob to pick it up.
  offerSpare() {
    if (this.cfg.profileNow) return { error: 'Only the owner can do this. Lock Bob and open him with the owner\'s passcode.' };
    if (!lockOn(this.cfg)) return { error: 'Turn on Ask for a passcode to open Bob first.' };
    const dataKey = currentKey();
    if (!dataKey) return { error: 'Lock Bob and open him with your passcode first.' };
    let rec = this.recKey();
    const cur = this.spare() || {};
    if (!rec || cur.check !== keyCheck(dataKey)) {
      rec = crypto.randomBytes(32);
      const b64 = rec.toString('base64');
      const box = this.box();
      const stored = secretsOn(this.cfg) && box.ready ? box.seal(b64) : b64;
      saveLock(this.cfg, { spare: { key: stored, check: keyCheck(dataKey), keptBy: [] } }); // a new recovery key: older spares stop fitting
    }
    this.offer = { blob: makeSpare(dataKey, rec), until: this.now() + OFFER_MINUTES * 60000 };
    this.log('settings', 'passcode reset: a spare key is ready to be picked up (15 minutes)');
    return { view: this.view() };
  }
  cancelOffer() { this.offer = null; return { view: this.view() }; }
  // Stop every spare working (a lost phone, say): a new recovery key is made the next time one is got ready.
  dropSpares() { saveLock(this.cfg, { spare: null }); this.offer = null; this.log('settings', 'passcode reset: every spare key stopped working'); return { view: this.view() }; }
  setWays(b = {}) {
    const cur = resetSettings(this.cfg), next = { ...cur };
    if ('email' in b) next.email = b.email === true;
    if ('discord' in b) next.discord = b.discord === true;
    if (next.email && !cur.email && !this.send.emailReady?.()) return { error: 'Set up your account in Settings, Online services, 📧 Email account first.' };
    if (next.discord && !cur.discord && !this.send.discordReady?.()) return { error: 'Turn on Bob on Discord and Discord DMs first (Settings, Online services).' };
    saveLock(this.cfg, { reset: next });
    this.log('settings', `passcode reset by code: email ${next.email ? 'on' : 'off'}, Discord ${next.discord ? 'on' : 'off'}`);
    return { view: this.view() };
  }

  // ---------- your other Bob, over Bob-Net (never this replicant matrix's own window) ----------
  pickup(holder) {
    if (!this.offer || this.offer.until < this.now()) return { error: 'There\'s no spare key waiting. On that Bob, press Get a spare key ready first.', code: 404 };
    const { blob } = this.offer; this.offer = null;
    const s = this.spare() || {};
    const name = cleanName(holder);
    const keptBy = [...(s.keptBy || []).filter((k) => k.name !== name), { name, at: new Date(this.now()).toISOString() }].slice(-MAX_KEEP);
    saveLock(this.cfg, { spare: { ...s, keptBy } });
    this.log('settings', `passcode reset: ${name} picked up a spare key`);
    return { key: blob, check: s.check };
  }
  asking() { return Boolean(this.ask && this.ask.until > this.now() && !this.ask.approved); }
  give(blob, holder) {
    const now = this.now();
    this.gives = this.gives.filter((t) => now - t < 60000);
    if (this.gives.length >= 5) return { error: 'Too many tries. Wait a minute.', code: 429 };
    this.gives.push(now);
    if (!this.asking()) return { error: 'Nobody asked to reset this Bob. On its lock screen, press Forgot it?, then Ask my other Bob first.', code: 409 };
    const rec = this.recKey(), key = rec && openSpare(blob, rec);
    if (!key || key.length !== 32 || keyCheck(key) !== this.spare()?.check) return { error: 'That spare key doesn\'t fit this Bob any more. Get a new one ready on it once you\'re back in.', code: 400 };
    this.ask.approved = key; this.ask.by = cleanName(holder);
    this.log('settings', `passcode reset: ${this.ask.by} let this Bob reset its passcode`);
    return { ok: true };
  }

  // ---------- the lock screen ----------
  screen() {
    const s = this.spare(), r = resetSettings(this.cfg);
    return {
      spare: Boolean(s?.key && (s.keptBy || []).length), keptBy: (s?.keptBy || []).map((k) => k.name),
      asking: this.asking(), approved: Boolean(this.ask?.approved && this.ask.until > this.now()), by: this.ask?.by || '',
      email: r.email && Boolean(this.send.emailReady?.()), discord: r.discord && Boolean(this.send.discordReady?.()),
      codeSent: Boolean(this.code && this.code.until > this.now()), via: this.code?.via || '', to: this.code?.to || '',
      encrypt: this.cfg.lock?.encrypt === true
    };
  }
  askSpare() {
    const s = this.spare();
    if (!s?.key || !(s.keptBy || []).length) return { error: 'No other Bob keeps a spare key for this one.' };
    this.ask = { until: this.now() + ASK_MINUTES * 60000, approved: null, by: '' };
    this.log('settings', 'passcode reset: asked my other Bob to let me reset (15 minutes)');
    return { ok: true };
  }
  // After "Let it reset": a new passcode locks the same chats' key. Returns { token } or { error }.
  finishSpare(code, again) {
    const a = this.ask;
    if (!a?.approved || a.until < this.now()) return { error: 'Your other Bob hasn\'t said yes yet (or it took longer than 15 minutes).' };
    const bad = this.badCode(code, again); if (bad) return { error: bad };
    saveLock(this.cfg, wrapKey(String(code), a.approved));
    setKey(a.approved);
    this.ask = null;
    this.log('settings', 'passcode reset: new passcode made with the spare key; locked chats and memory kept');
    return { token: this.lock.grant() };
  }
  badCode(code, again) {
    const c = String(code || '');
    if (c.length < MIN_LEN) return `The passcode needs at least ${MIN_LEN} characters.`;
    if (c.length > 200) return 'That passcode is too long.';
    if (c !== String(again || '')) return 'The two new passcodes don\'t match.';
    return '';
  }
  async sendCode(via) {
    const scr = this.screen();
    if (!(via === 'email' ? scr.email : via === 'discord' ? scr.discord : false)) return { error: 'That way isn\'t set up.' };
    const now = this.now();
    this.sent = this.sent.filter((t) => now - t < 3600000);
    if (this.sent.length && now - this.sent[this.sent.length - 1] < 60000) return { error: 'A code was just sent. Wait a minute before asking for another.' };
    if (this.sent.length >= 5) return { error: 'Five codes in an hour is the most. Try again later.' };
    const code = String(crypto.randomInt(10_000_000, 100_000_000));
    const text = `Your code to reset Bob's passcode: ${code}\n\nIt works once, for ${CODE_MINUTES} minutes, on Bob's lock screen. If you didn't ask for it, someone at your computer did: you can ignore this, and nothing changes.`;
    let to = '';
    try { const r = via === 'email' ? await this.send.email(text) : await this.send.discord(text); to = r?.to || ''; }
    catch (e) { this.log('settings', `passcode reset: couldn't send a code by ${via} (${e.message})`); return { error: `Couldn't send it: ${e.message}` }; }
    this.sent.push(now);
    this.code = { hash: hash(code), until: now + CODE_MINUTES * 60000, tries: 0, via, to };
    this.log('settings', `passcode reset: a code was sent by ${via}`);
    return { ok: true, to };
  }
  // The code, and a new passcode twice. Returns { token, aside } or { error }.
  useCode(code, next, again) {
    const c = this.code;
    if (!c || c.until < this.now()) { this.code = null; return { error: 'That code has run out. Ask for a new one.' }; }
    if (c.tries >= 5) { this.code = null; return { error: 'Too many wrong codes. Ask for a new one.' }; }
    const bad = this.badCode(next, again); if (bad) return { error: bad };
    c.tries++;
    if (!crypto.timingSafeEqual(hash(String(code || '').replace(/\s/g, '')), c.hash)) return { error: 'That code isn\'t right.' };
    this.code = null;
    const aside = this.setAside();
    const dataKey = crypto.randomBytes(32);
    saveLock(this.cfg, { ...wrapKey(String(next), dataKey), spare: null }); // a new key: spare keys stop fitting
    setKey(dataKey);
    this.offer = null; this.ask = null;
    this.log('settings', `passcode reset: new passcode made with a code by ${c.via}${aside ? `; locked chats and memory set aside in ${path.basename(aside)}` : ''}`);
    return { token: this.lock.grant(), aside };
  }
  // Locked chats and memory can't be opened without the old passcode: they go to a folder of their own, still locked,
  // with the old lock beside them (old-lock.json), so nothing is lost or written over. '' when nothing was locked.
  setAside() {
    const locked = vaultFiles(this.cfg).filter((f) => { try { return isSealed(fs.readFileSync(f)); } catch { return false; } });
    if (!locked.length) return '';
    const stamp = new Date(this.now()).toISOString().replace(/[:T]/g, '-').slice(0, 16);
    const dir = path.join(this.cfg.dataDir, `locked-before-reset-${stamp}`);
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    const { salt, wrapped } = this.cfg.lock || {};
    fs.writeFileSync(path.join(dir, 'old-lock.json'), JSON.stringify({ salt, wrapped, note: 'The lock these files had. The old passcode opens it.' }, null, 2));
    for (const f of locked) {
      const to = path.dirname(f) === path.join(this.cfg.dataDir, 'sessions') ? path.join(dir, 'sessions', path.basename(f)) : path.join(dir, path.basename(f));
      fs.renameSync(f, to);
    }
    return dir;
  }
}

// ---------- the spare keys this Bob keeps for your other Bobs (inn\bob\spare-keys.json, locked) ----------
export class SpareKeeper {
  constructor(cfg, { call, name = () => 'Bob', now = Date.now, log = () => {} } = {}) {
    this.cfg = cfg; this.call = call; this.name = name; this.now = now; this.log = log;
    this.file = path.join(cfg.dataDir, 'spare-keys.json');
  }
  load() { try { const j = openCopy(readJsonFile(this.file)); return Array.isArray(j?.list) ? j.list.filter((x) => x && x.id && x.key) : []; } catch { return []; } }
  save(list) { writeSecretJson(this.cfg, this.file, { list: list.slice(0, MAX_KEEP) }, 2); }
  view() { return this.load().map(({ id, bob, address, at }) => ({ id, bob, address, at })); }
  async pickup(bob) {
    if (!bob) return { error: 'Pick one of your other Bobs.' };
    const r = await this.call(bob, '/api/lock/spare/pickup', { method: 'POST', body: { name: this.name() } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.key) return { error: j.error || `${bob.name} said no (${r.status}).` };
    const list = this.load().filter((x) => x.address !== bob.address);
    list.push({ id: crypto.randomBytes(6).toString('hex'), bob: cleanName(bob.name), address: bob.address, key: String(j.key), at: new Date(this.now()).toISOString() });
    this.save(list);
    this.log('settings', `passcode reset: keeping a spare key for ${bob.name}`);
    return { ok: true };
  }
  async asking(id, bobs) {
    const s = this.load().find((x) => x.id === id), bob = s && bobs.find((b) => b.address === s.address);
    if (!bob) return false;
    try { const r = await this.call(bob, '/api/lock/spare/asking'); const j = await r.json(); return j.asking === true; } catch { return false; }
  }
  // "Let it reset", pressed in this Bob's own Settings.
  async letReset(id, bobs) {
    const s = this.load().find((x) => x.id === id);
    if (!s) return { error: 'That spare key isn\'t here any more.' };
    const bob = bobs.find((b) => b.address === s.address);
    if (!bob) return { error: `${s.bob} isn't in My other Bobs any more.` };
    const r = await this.call(bob, '/api/lock/spare/give', { method: 'POST', body: { key: s.key, name: this.name() } });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return { error: j.error || `${s.bob} said no (${r.status}).` };
    this.log('settings', `passcode reset: let ${s.bob} reset its passcode (your click)`);
    return { ok: true, bob: s.bob };
  }
  forget(id) { this.save(this.load().filter((x) => x.id !== id)); return { ok: true }; }
}

// ---------- the Forgot it? page (plain forms, no scripts: works in Bob's window and any browser on this computer) ----------
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const newCodeBoxes = `<label for="n1">New passcode (${MIN_LEN} or more characters)</label><input id="n1" name="next" type="password" autocomplete="new-password" required minlength="${MIN_LEN}">
<label for="n2">Same again</label><input id="n2" name="again" type="password" autocomplete="new-password" required minlength="${MIN_LEN}">`;
export function forgotPage(st, { wrong = '', note = '' } = {}) {
  const parts = [];
  if (st.approved) {
    parts.push(`<form method="post" action="/unlock/spare-new"><h2>${esc(st.by)} said yes</h2><p class="muted">Make a new passcode. Your chats and memory stay just as they were.</p>${newCodeBoxes}<button>Save and open Bob</button></form>`);
  } else if (st.spare) {
    parts.push(`<form method="post" action="/unlock/spare-ask"><h2>Ask my other Bob</h2>
<p class="muted">Gets everything back, locked chats too. Kept by: ${esc(st.keptBy.join(', '))}.</p>
${st.asking ? `<p role="status">Asked. Now on ${esc(st.keptBy.join(' or '))}, open Bob's Settings, This replicant matrix, 🔒 Passcode lock, and press <strong>Let it reset</strong>. Then come back and press Check.</p><a href="/unlock/forgot" class="muted">Check</a>` : '<button>Ask my other Bob</button>'}</form>`);
  }
  if (!st.approved && (st.email || st.discord)) {
    const ways = [st.email ? '<button name="via" value="email">Email me a code</button>' : '', st.discord ? '<button name="via" value="discord">Send a code to my Discord</button>' : ''].join('');
    parts.push(`<form method="post" action="/unlock/send-code"><h2>Get a code</h2>
<p class="muted">Opens the lock screen only.${st.encrypt ? ' <strong>Your locked chats and memory can\'t be opened with a code.</strong> They\'re set aside, still locked, and Bob starts with none. Your old passcode still opens them if you remember it.' : ''}</p>${ways}</form>`);
    if (st.codeSent) parts.push(`<form method="post" action="/unlock/code"><p role="status">Sent${st.to ? ` to ${esc(st.to)}` : st.via === 'discord' ? ' to your Discord' : ''}. It works for 10 minutes.</p>
<label for="k">Code</label><input id="k" name="code" inputmode="numeric" autocomplete="one-time-code" required>${newCodeBoxes}<button>Save and open Bob</button></form>`);
  }
  if (!parts.length) parts.push('<p>No way to reset is set up on this Bob.</p><p class="muted">With only the lock screen on, removing the <code>lock</code> part of Bob\'s config.json opens him. Locked chats and memory need the passcode. Help, "I forgot my passcode" says more.</p>');
  return `${lockHead('Forgot the passcode?')}<body><div style="display:grid;gap:12px;width:min(360px,calc(100vw - 32px))"><h1 style="font-size:20px;margin:0">🔑 Forgot the passcode?</h1>
${wrong ? `<p class="bad" role="alert">${esc(wrong)}</p>` : ''}${note ? `<p role="status">${esc(note)}</p>` : ''}
${parts.map((x) => x.replace('<form ', '<form style="background:var(--card);padding:16px;border-radius:12px;display:grid;gap:10px" ')).join('\n')}
<p class="muted"><a href="/">Back to the lock screen</a></p></div></body></html>`;
}
