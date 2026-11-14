// 👥 Each user's own email account (profiles.js, Settings, Online services, 📧 Email account).
//
// While a user is in, the Email account page, "Let Bob read my email" and tidying the inbox all use that user's
// account, never the owner's. The owner's stays where it always was (settings.json moreTools.email*, password in the
// locked store as BOB_EMAIL_PASSWORD), and a passcode reset code always goes to the owner's (email-account.js).
//
// Where a user's account is kept: inn\profiles\<id>\email.json (server, address, folders).
// - With a passcode: the file is locked with their own key (vault.js) and the app password is inside it, so nobody
//   else signed in can read either.
// - Without one: the file is plain (it holds no password) and the app password is in Bob's locked store as
//   BOB_EMAIL_PASSWORD_<ID>, kept by the computer's own key keeper like every other key (secret-box.js).
// Setting or taking off a passcode moves the password between the two (sealUserEmail). Removing the user forgets it.
import fs from 'node:fs';
import path from 'node:path';
import { readJson, writeJson, seal, unseal, isSealed } from './vault.js';
import { keyValue, saveKey, savedKey } from './secret-box.js';
import { saveFile } from './saving.js';

const FIELDS = ['host', 'port', 'user', 'folder', 'sendHost', 'sendPort'];
export const userEmailFile = (cfg, id = cfg?.profileNow) => path.join(cfg.innDir, 'profiles', id, 'email.json');
export const userKeyName = (id) => `BOB_EMAIL_PASSWORD_${String(id).toUpperCase()}`;
const clip = (v, n) => String(v ?? '').trim().slice(0, n);
const portOf = (v, d) => { const n = Math.round(Number(v)); return n >= 1 && n <= 65535 ? n : d; };

// The same cleaning the owner's details get (more-tools.js cleanMoreTools).
export function cleanAccount(x = {}) {
  return {
    host: clip(x.host, 120).replace(/[^\w.-]/g, ''), port: portOf(x.port, 993), user: clip(x.user, 160),
    folder: clip(x.folder, 80).replace(/["\\]/g, '') || 'INBOX',
    sendHost: clip(x.sendHost, 120).replace(/[^\w.-]/g, ''), sendPort: x.sendPort ? portOf(x.sendPort, 0) : 0
  };
}

function load(cfg) {
  try { return readJson(userEmailFile(cfg), {}) || {}; } catch (e) { if (e.code === 'VAULT_LOCKED') throw e; return {}; }
}

// The signed-in user's account, or null when the owner is in.
export function userAccount(cfg) {
  if (!cfg?.profileNow) return null;
  return cleanAccount(load(cfg));
}

export function userPassword(cfg) {
  if (!cfg?.profileNow) return '';
  if (cfg.profileKeyed) return String(load(cfg).password || '');
  try { return keyValue(userKeyName(cfg.profileNow), {}); } catch { return ''; }
}

// patch: any of FIELDS; password: a new app password; forget: true drops it.
export function saveUserAccount(cfg, patch = {}, { password, forget = false } = {}) {
  if (!cfg?.profileNow) throw new Error('Nobody but the owner is in.');
  const file = userEmailFile(cfg), old = load(cfg);
  const next = { ...cleanAccount({ ...old, ...Object.fromEntries(Object.entries(patch).filter(([k]) => FIELDS.includes(k))) }) };
  const pass = typeof password === 'string' && password.trim() ? password.trim() : forget ? '' : null;
  if (cfg.profileKeyed) { const p = pass === null ? old.password : pass; if (p) next.password = p; }
  else if (pass !== null) saveKey(cfg, userKeyName(cfg.profileNow), pass);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  writeJson(cfg, file, next, 2);
  return userAccount(cfg);
}

// A passcode was set (on: true) or taken off: the app password moves into their locked file, or out to the store.
// profiles.js has already locked or opened the file itself with `key`.
export function sealUserEmail(cfg, id, key, on) {
  const file = userEmailFile(cfg, id), name = userKeyName(id);
  let data = {};
  try { const b = fs.readFileSync(file); data = JSON.parse(isSealed(b) ? unseal(b, key) : b.toString('utf8')); } catch {}
  if (on) {
    let pass = '';
    try { pass = savedKey(name); } catch {}
    if (!pass && !fs.existsSync(file)) return;
    if (pass) data.password = pass;
    fs.mkdirSync(path.dirname(file), { recursive: true });
    saveFile(file, seal(JSON.stringify(data, null, 2), key));
    if (pass) saveKey(cfg, name, '');
  } else {
    const pass = String(data.password || '');
    delete data.password;
    if (fs.existsSync(file)) saveFile(file, Buffer.from(JSON.stringify(data, null, 2), 'utf8'));
    if (pass) saveKey(cfg, name, pass);
  }
}

// The user was removed: their folder is gone already; their app password in the store goes too.
export function forgetUserEmail(cfg, id) {
  try { if (savedKey(userKeyName(id))) saveKey(cfg, userKeyName(id), ''); } catch {}
}
