// 🔐 Locked secrets (on by default, the owner's pick, Nov 11 2026: "make sure all of his files with his passwords,
// api keys, and everything has a layer of encryption", "encryption should be on by default").
//
// Every password, passcode, token and key Bob saves is kept scrambled on disk with AES-256-GCM. The key that
// scrambles them (the "box key") is made at random once per Bob and handed to the computer's own key keeper:
//   Windows: DPAPI for this Windows account (the blob sits in inn\bob\secret-box.json; only this account on this
//            PC can open it).
//   Mac:     the login Keychain ("Bob secret box").
//   Linux:   the Secret Service (GNOME Keyring, KWallet) through secret-tool.
//   Fallback (no key keeper answers, for example a Pi with no desktop): a key file only this account can read,
//            ~/.config/bob/secret-box-<id>.key, kept apart from Bob's home so a copy of his folder alone opens nothing.
// The phone does the same with the Android Keystore (android .../SecretBox.kt).
//
// What's covered: config.json's passcodes, tokens and keys (phone access, other Bobs' passcodes, bot tokens, the
// apps-door key and any later door key: see SECRET_FIELDS), the env values of the apps in "Apps Bob can use"
// (mcp-servers.json), and the keys saved in Settings (inn\bob\keys.json: the Discord bot token, any key pasted
// there). Plain secrets found at start (from an older Bob) are locked in place the first time Bob starts.
//
// A locked value is a string that starts with PREFIX. Anything else is read as it is, so an older file still opens.
// If the box key can't be had back (a keychain wiped, Bob's folder copied to another PC), Bob never makes a new one
// over the old: the locked values stay as they are, read as empty, and Settings offers "Start a new locked box".
//
// Tests never touch the real computer: pass a fake `keeper` (see memoryKeeper) to openBox.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

export const PREFIX = 'bobsecret1:';
// Under a test the real key keepers are never used (see config.js openSecrets).
export const IN_TEST = process.env.BOB_TEST === '1' || /[\\/]test[\\/]run-[\w-]+\.m?js$/.test(process.argv[1] || '');
const IV = 12, TAG = 16;
const AAD = Buffer.from('bob secret box');
const SERVICE = 'Bob secret box';

export class BoxStuck extends Error {
  constructor(how) { super(`Bob can't open his locked secrets (${how}). Settings, This replicant matrix, Locked secrets can start a new box.`); this.code = 'BOX_STUCK'; }
}

export const isLocked = (v) => typeof v === 'string' && v.startsWith(PREFIX);
export const boxId = (dataDir) => crypto.createHash('sha256').update(path.resolve(String(dataDir || ''))).digest('hex').slice(0, 16);

// ---------- the key keepers ----------
// Each keeper: { how, label, wrap(key, id) -> string kept in secret-box.json, unwrap(kept, id) -> Buffer }.
// They throw when the keeper isn't there; openBox then tries the next one.
const quiet = { stdio: ['pipe', 'pipe', 'ignore'], windowsHide: true, timeout: 20000, encoding: 'utf8' };

export function dpapiKeeper({ run = execFileSync } = {}) {
  const ps = (script, input) => run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { ...quiet, input }).trim();
  const head = "Add-Type -AssemblyName System.Security; $e=[Text.Encoding]::UTF8.GetBytes('bob secret box'); $b=[Convert]::FromBase64String([Console]::In.ReadLine());";
  return {
    how: 'dpapi', label: 'Windows (DPAPI, this Windows account only)',
    wrap(key) { const out = ps(`${head} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Protect($b,$e,'CurrentUser'))`, key.toString('base64') + '\n'); if (!/^[A-Za-z0-9+/=]{40,}$/.test(out)) throw new Error('DPAPI gave nothing back'); return out; },
    unwrap(kept) { return checkKey(Buffer.from(ps(`${head} [Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$e,'CurrentUser'))`, kept + '\n'), 'base64')); }
  };
}

export function keychainKeeper({ run = execFileSync } = {}) {
  return {
    how: 'keychain', label: 'the Mac Keychain',
    // `security -i` reads the command from stdin, so the key never shows in the list of running programs.
    wrap(key, id) { run('/usr/bin/security', ['-i'], { ...quiet, input: `add-generic-password -U -s "${SERVICE}" -a "${id}" -l "${SERVICE}" -w "${key.toString('hex')}"\n` }); this.unwrap('', id); return 'keychain'; },
    unwrap(_kept, id) { return checkKey(Buffer.from(run('/usr/bin/security', ['find-generic-password', '-s', SERVICE, '-a', id, '-w'], quiet).trim(), 'hex')); }
  };
}

export function secretToolKeeper({ run = execFileSync } = {}) {
  return {
    how: 'libsecret', label: 'the Linux key keeper (Secret Service)',
    wrap(key, id) { run('secret-tool', ['store', `--label=${SERVICE}`, 'service', 'bob-secret-box', 'account', id], { ...quiet, input: key.toString('hex') }); this.unwrap('', id); return 'libsecret'; },
    unwrap(_kept, id) { return checkKey(Buffer.from(run('secret-tool', ['lookup', 'service', 'bob-secret-box', 'account', id], quiet).trim(), 'hex')); }
  };
}

// The last resort: a key file only this account can read, outside Bob's home.
export function fileKeeper({ home = os.homedir(), fsx = fs } = {}) {
  const at = (id) => path.join(home, '.config', 'bob', `secret-box-${id}.key`);
  return {
    how: 'file', label: 'a key file only your account can read',
    wrap(key, id) { const f = at(id); fsx.mkdirSync(path.dirname(f), { recursive: true }); fsx.writeFileSync(f, key.toString('hex') + '\n', { mode: 0o600 }); try { fsx.chmodSync(f, 0o600); } catch {} return 'file'; },
    unwrap(_kept, id) { return checkKey(Buffer.from(String(fsx.readFileSync(at(id), 'utf8')).replace(/\r?\n/g, '').trim(), 'hex')); }
  };
}

// For tests: a keeper that keeps keys in a Map (and can be told to fail).
export function memoryKeeper(how = 'memory') {
  const kept = new Map();
  return { how, label: `test keeper (${how})`, kept, broken: false,
    wrap(key, id) { if (this.broken) throw new Error('broken'); kept.set(id, Buffer.from(key)); return how; },
    unwrap(_k, id) { if (this.broken || !kept.has(id)) throw new Error('not there'); return Buffer.from(kept.get(id)); } };
}

function checkKey(buf) { if (!Buffer.isBuffer(buf) || buf.length !== 32) throw new Error('not a box key'); return buf; }

// The keepers to try on this computer, best first.
export function keepersFor(platform = process.platform, opts = {}) {
  const list = platform === 'win32' ? [dpapiKeeper(opts)] : platform === 'darwin' ? [keychainKeeper(opts)] : platform === 'android' ? [] : [secretToolKeeper(opts)];
  return [...list, fileKeeper(opts)];
}

// ---------- the box ----------
export class Box {
  constructor({ key = null, how = '', label = '', stuck = false, file = '', opened = Boolean(key || stuck) } = {}) { this.key = key; this.how = how; this.label = label; this.stuck = stuck; this.file = file; this.opened = opened; }
  get ready() { return Boolean(this.key); }
  seal(text) {
    if (text === '' || text == null) return '';
    if (isLocked(text)) return text;
    if (!this.key) throw new BoxStuck(this.label || 'no key');
    const iv = crypto.randomBytes(IV);
    const c = crypto.createCipheriv('aes-256-gcm', this.key, iv);
    c.setAAD(AAD);
    const body = Buffer.concat([c.update(Buffer.from(String(text), 'utf8')), c.final()]);
    return PREFIX + Buffer.concat([iv, c.getAuthTag(), body]).toString('base64');
  }
  // The plain words; '' when the box can't open it (no key, or it was locked by another box).
  open(v) {
    if (!isLocked(v)) return v;
    if (!this.key) return '';
    try {
      const buf = Buffer.from(v.slice(PREFIX.length), 'base64');
      const d = crypto.createDecipheriv('aes-256-gcm', this.key, buf.subarray(0, IV));
      d.setAAD(AAD);
      d.setAuthTag(buf.subarray(IV, IV + TAG));
      return Buffer.concat([d.update(buf.subarray(IV + TAG)), d.final()]).toString('utf8');
    } catch { return ''; }
  }
}

// Opens (or makes, the first time) the box for this Bob. Never throws: a box that can't be opened comes back stuck.
// fresh: true sets the old secret-box.json aside and makes a new key (Settings, "Start a new locked box").
export function openBox({ dataDir, platform = process.platform, keepers, fresh = false, now = Date.now, log = () => {} } = {}) {
  const file = path.join(dataDir, 'secret-box.json');
  const id = boxId(dataDir);
  keepers = keepers || keepersFor(platform);
  let saved = null;
  try { saved = JSON.parse(fs.readFileSync(file, 'utf8').replace(/^﻿/, '')); } catch {}
  if (saved && fresh) {
    try { fs.renameSync(file, path.join(dataDir, `secret-box.old-${new Date(now()).toISOString().slice(0, 10)}-${now()}.json`)); } catch {}
    saved = null;
  }
  if (saved && saved.how) {
    const k = keepers.find((x) => x.how === saved.how);
    if (k) {
      try { return new Box({ key: k.unwrap(saved.kept, id), how: k.how, label: k.label, file }); }
      catch (e) { log(`locked secrets: ${k.label} didn't hand the box key back (${e.code || e.message || 'error'})`); }
    }
    return new Box({ how: saved.how, label: k?.label || saved.how, stuck: true, file });
  }
  const key = crypto.randomBytes(32);
  for (const k of keepers) {
    try {
      const kept = k.wrap(key, id);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(file + '.part', JSON.stringify({ v: 1, how: k.how, kept, made: new Date(now()).toISOString() }, null, 1), { mode: 0o600 });
      fs.renameSync(file + '.part', file);
      return new Box({ key, how: k.how, label: k.label, file });
    } catch (e) { log(`locked secrets: ${k.label} isn't available (${e.code || e.message || 'error'})`); }
  }
  return new Box({ how: 'none', label: 'no key keeper', stuck: true, file });
}

// ---------- the one box this Bob uses ----------
let current = new Box();
export const theBox = () => current;
export function useBox(box) { current = box || new Box(); return current; }
export const lockOn = (cfg) => cfg?.lockSecrets !== false; // on by default
// loadConfig opens the box at start. Code that runs without it (a helper, a test with a hand-made cfg) opens it here,
// from cfg.dataDir, the first time a secret is written.
// Without a dataDir, the folder of config.json stands in.
export function ensureBox(cfg) {
  const dir = cfg?.dataDir || (cfg?.configFile ? path.dirname(cfg.configFile) : '');
  if (!current.opened && dir) useBox(openBox({ dataDir: dir, keepers: IN_TEST ? [memoryKeeper('test')] : undefined }));
  if (!keysFile && dir) useKeysFile(path.join(dir, 'keys.json'));
  return current;
}

// ---------- secrets inside JSON ----------
// Field names that hold a secret, wherever they sit in config.json. A new door that keeps a key in config.json
// gets locked by naming its field here (or using one of these names).
export const SECRET_FIELDS = new Set(['passcode', 'password', 'token', 'key', 'apiKey', 'secret', 'botToken', 'doorKey']);

// Walks an object and changes every secret field's string with fn. Returns the count changed. `all` changes every
// string value (used for an env map, where every value may be a key).
export function mapSecrets(obj, fn, { all = false, depth = 0 } = {}) {
  let n = 0;
  if (!obj || typeof obj !== 'object' || depth > 10) return 0;
  for (const [k, v] of Object.entries(obj)) {
    if (typeof v === 'string' && v && (all || SECRET_FIELDS.has(k))) { const out = fn(v); if (out !== v) { obj[k] = out; n++; } }
    else if (v && typeof v === 'object') n += mapSecrets(v, fn, { all, depth: depth + 1 });
  }
  return n;
}
// A copy with every secret locked (for writing) or opened (for reading).
export const sealCopy = (obj, box = current, opts) => { const c = structuredClone(obj); mapSecrets(c, (v) => box.seal(v), opts); return c; };
export const openCopy = (obj, box = current, opts) => { const c = structuredClone(obj); mapSecrets(c, (v) => box.open(v), opts); return c; };
// How many plain (not yet locked) secrets an object holds.
export const plainCount = (obj, opts) => { let n = 0; mapSecrets(structuredClone(obj), (v) => { if (!isLocked(v)) n++; return v; }, opts); return n; };
export const lockedCount = (obj, opts) => { let n = 0; mapSecrets(structuredClone(obj), (v) => { if (isLocked(v)) n++; return v; }, opts); return n; };

// Writes JSON with its secrets locked (when the switch is on and the box is open), in one go.
// When the switch is on but the box is stuck, the write stops (BoxStuck) rather than putting a secret down plain.
export function writeSecretJson(cfg, file, value, spaces = 2, opts) {
  let out = value;
  if (lockOn(cfg)) {
    ensureBox(cfg);
    if (current.ready) out = sealCopy(value, current, opts);
    else if (plainCount(value, opts)) throw new BoxStuck(current.label || 'no key');
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file + '.part', JSON.stringify(out, null, spaces));
  fs.renameSync(file + '.part', file);
}

// ---------- keys saved in Settings (inn\bob\keys.json) ----------
// NAME -> locked value. Bob reads these after the environment, so a key pasted in Settings works wherever a
// Windows user variable or a line in ~/.config/bob/env worked.
export const KEY_NAME = /^[A-Z][A-Z0-9_]{2,63}$/;
let keysFile = '';
let keysCache = null;
export function useKeysFile(file) { keysFile = file || ''; keysCache = null; }
function loadKeys() {
  if (keysCache) return keysCache;
  let raw = {};
  try { raw = JSON.parse(fs.readFileSync(keysFile, 'utf8').replace(/^﻿/, '')); } catch {}
  keysCache = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return keysCache;
}
export const keyNames = () => Object.keys(loadKeys()).filter((k) => KEY_NAME.test(k)).sort();
export function savedKey(name) { const v = loadKeys()[name]; return typeof v === 'string' ? current.open(v) : ''; }
export function saveKey(cfg, name, value) {
  if (!KEY_NAME.test(name || '')) throw new Error('A key name is capital letters, digits and _, like HF_TOKEN.');
  ensureBox(cfg);
  if (!keysFile) throw new Error('Bob has no settings folder yet.');
  const all = { ...loadKeys() };
  const v = String(value ?? '').trim();
  if (v) all[name] = v; else delete all[name];
  writeSecretJson(cfg, keysFile, all, 1, { all: true });
  keysCache = null;
}
// A key by name: the environment first (as before), then the keys saved in Settings.
export function keyValue(name, env = process.env) { return String(env?.[name] || '') || savedKey(name); }

// ---------- what Settings shows ----------
export function boxView(cfg, extra = {}) {
  return { on: lockOn(cfg), ready: current.ready, stuck: current.stuck, how: current.how, label: current.label, keys: keyNames(), ...extra };
}

// ---------- plain keys from older Bobs ----------
// ~/.config/bob/env (Mac, Linux) is Bob's own file: every NAME=value line in it moves into keys.json, locked, and
// the file keeps a note in its place. On Windows, only Bob's own user variables (BOB_DISCORD_TOKEN, which older Bobs
// wrote, and BOB_TELEGRAM_TOKEN) move; variables like HF_TOKEN or OPENROUTER_API_KEY belong to the owner and other
// programs may use them, so they stay. Returns the names moved.
export const OWN_VARS = ['BOB_DISCORD_TOKEN', 'BOB_TELEGRAM_TOKEN'];
export const ENV_NOTE = '# Bob moved the keys that were here into his locked store (Settings, This replicant matrix, Locked secrets).\n# A NAME=value line added here still works, and is locked the next time Bob starts.\n';
export function lockPlainKeys(cfg, { platform = process.platform, home = os.homedir(), run = execFileSync } = {}) {
  const moved = [];
  if (!lockOn(cfg) || !current.ready) return moved;
  if (platform === 'win32') {
    for (const name of OWN_VARS) {
      let value = '';
      try { const out = run('reg', ['query', 'HKCU\\Environment', '/v', name], quiet); const m = String(out).match(/REG_(?:EXPAND_)?SZ\s+(.+?)\s*$/m); value = m ? m[1].trim() : ''; } catch {}
      if (!value) continue;
      try { if (!savedKey(name)) saveKey(cfg, name, value); run('reg', ['delete', 'HKCU\\Environment', '/v', name, '/f'], quiet); moved.push(name); } catch {}
    }
    return moved;
  }
  const f = path.join(home, '.config', 'bob', 'env');
  let text = '';
  try { text = fs.readFileSync(f, 'utf8'); } catch { return moved; }
  const keep = [];
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(?:export\s+)?([A-Z][A-Z0-9_]{2,63})\s*=\s*(.*?)\s*$/);
    const value = m ? m[2].replace(/^(["'])(.*)\1$/, '$2') : '';
    if (m && value) {
      try { saveKey(cfg, m[1], value); moved.push(m[1]); continue; } catch {}
    }
    if (line.trim() && !line.startsWith('# Bob moved') && !line.startsWith('# A NAME=value')) keep.push(line);
  }
  if (!moved.length) return moved;
  fs.writeFileSync(f, ENV_NOTE + (keep.length ? keep.join('\n') + '\n' : ''), { mode: 0o600 });
  try { fs.chmodSync(f, 0o600); } catch {}
  return moved;
}

// Takes one plain copy of a key away (after it was saved locked): the Windows user variable, or its line in
// ~/.config/bob/env. Only for Bob's own variables.
export function forgetPlainKey(name, { platform = process.platform, home = os.homedir(), run = execFileSync } = {}) {
  if (!KEY_NAME.test(name)) return;
  if (platform === 'win32') { if (OWN_VARS.includes(name)) try { run('reg', ['delete', 'HKCU\\Environment', '/v', name, '/f'], quiet); } catch {} return; }
  const f = path.join(home, '.config', 'bob', 'env');
  try {
    const lines = fs.readFileSync(f, 'utf8').split(/\r?\n/);
    const keep = lines.filter((l) => !new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l));
    if (keep.length !== lines.length) fs.writeFileSync(f, keep.join('\n'), { mode: 0o600 });
  } catch {}
}
