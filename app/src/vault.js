// "Lock my chats and memory" (part of 🔒 Passcode lock, src/lock.js; off unless you turn it on).
// When it's on, Bob's chats (inn\bob\sessions) and his memory file (inn\bob-memory.md) are kept on disk scrambled
// with AES-256-GCM. The key that scrambles them is made at random once and kept in config.json only locked by the
// passcode (scrypt), so it's in Bob's memory only after someone types the passcode, and gone when Bob closes.
//
// A locked file starts with MAGIC; anything else is read as plain text, so files written before the switch went
// on (or after it went off) still open, and turning it on or off converts every file in one go (sealAll/openAll).
// While Bob holds no key (he started and nobody has typed the passcode yet) a locked file can't be read or
// written: reads and writes throw VaultLocked instead of handing back nothing, so nothing gets written over.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { saveFile } from './saving.js'; // item 229: whole or not at all, flushed to disk
import { beforeChange, afterChange, logMemoryChange } from './turn-changes.js'; // items 237-238

export const MAGIC = Buffer.from('BOBVAULT1\n');
const IV = 12, TAG = 16;
let key = null; // the data key, in memory only

export class VaultLocked extends Error {
  constructor() { super('Bob is locked: type the passcode to open your chats and memory.'); this.code = 'VAULT_LOCKED'; }
}

// 👥 A profile's chats and memory (profiles.js) are always locked, with that person's own key.
export const vaultOn = (cfg) => Boolean(cfg?.profileNow) || (cfg?.lock?.encrypt === true && cfg?.lock?.enabled === true);
export const hasKey = () => Boolean(key);
export function setKey(k) { key = k ? Buffer.from(k) : null; }

export const isSealed = (buf) => Buffer.isBuffer(buf) && buf.length >= MAGIC.length && buf.subarray(0, MAGIC.length).equals(MAGIC);

export function seal(text, k = key) {
  if (!k) throw new VaultLocked();
  const iv = crypto.randomBytes(IV);
  const c = crypto.createCipheriv('aes-256-gcm', k, iv);
  const body = Buffer.concat([c.update(Buffer.from(String(text), 'utf8')), c.final()]);
  return Buffer.concat([MAGIC, iv, c.getAuthTag(), body]);
}

export function unseal(buf, k = key) {
  if (!isSealed(buf)) return buf.toString('utf8');
  if (!k) throw new VaultLocked();
  const iv = buf.subarray(MAGIC.length, MAGIC.length + IV), tag = buf.subarray(MAGIC.length + IV, MAGIC.length + IV + TAG);
  const d = crypto.createDecipheriv('aes-256-gcm', k, iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(buf.subarray(MAGIC.length + IV + TAG)), d.final()]).toString('utf8');
}

// Plain or locked, the words in a file. Throws like fs does when it isn't there.
export const readText = (file) => unseal(fs.readFileSync(file));

// Writes in one go (a .part file, then a rename), locked when the switch is on.
// Item 237: a change to the memory file is logged (memory-changes.jsonl beside it), with the turn that made it.
const isMemory = (cfg, file) => Boolean(cfg?.memoryFile) && path.resolve(file) === path.resolve(cfg.memoryFile);
const memIo = (cfg) => ({ append: (f, t) => appendText(cfg, f, t, { plain: true }), read: (f) => readText(f), write: (f, t) => writeText(cfg, f, t) });
const oldText = (file) => { try { return readText(file); } catch (e) { if (e.code === 'VAULT_LOCKED') throw e; return ''; } };
export function writeText(cfg, file, text, { who = '' } = {}) {
  const out = vaultOn(cfg) ? seal(text) : Buffer.from(String(text), 'utf8');
  const before = isMemory(cfg, file) ? oldText(file) : null;
  saveFile(file, out);
  if (before !== null) logMemoryChange(cfg, before, String(text), { who, io: memIo(cfg) });
}

// Adds to the end. A locked file has to be opened and written again whole.
export function appendText(cfg, file, text, { who = '', plain = false } = {}) {
  let old = null;
  try { old = fs.readFileSync(file); } catch {}
  const mem = !plain && isMemory(cfg, file);
  if (!vaultOn(cfg) && !(old && isSealed(old))) {
    beforeChange(file); // item 238: Undo of the turn puts the old end back
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.appendFileSync(file, text);
    afterChange(file);
    if (mem) logMemoryChange(cfg, old ? old.toString('utf8') : '', (old ? old.toString('utf8') : '') + text, { who, io: memIo(cfg) });
    return;
  }
  writeText(cfg, file, (old ? unseal(old) : '') + text, { who: mem ? who : '' });
}

export function readJson(file, d) {
  let buf;
  try { buf = fs.readFileSync(file); } catch { return d; }
  const text = unseal(buf); // VaultLocked goes up: never treat a locked chat as empty
  try { return JSON.parse(text); } catch { return d; }
}
export const writeJson = (cfg, file, v, spaces = 0) => writeText(cfg, file, JSON.stringify(v, null, spaces || undefined));

// The files this covers: every chat file and the memory file.
export function vaultFiles(cfg) {
  const dir = path.join(cfg.dataDir, 'sessions');
  let chats = [];
  try { chats = fs.readdirSync(dir).filter((f) => /\.json$/.test(f)).map((f) => path.join(dir, f)); } catch {}
  const memLog = cfg.memoryFile ? path.join(path.dirname(cfg.memoryFile), 'memory-changes.jsonl') : ''; // item 237: locked with the memory
  return [...chats, ...(cfg.memoryFile && fs.existsSync(cfg.memoryFile) ? [cfg.memoryFile] : []), ...(memLog && fs.existsSync(memLog) ? [memLog] : [])];
}

// Turn every file locked (on = true) or plain (on = false). Needs the key. Returns how many files changed.
export function convertAll(cfg, on) {
  if (!key) throw new VaultLocked();
  let n = 0;
  for (const f of vaultFiles(cfg)) {
    const buf = fs.readFileSync(f);
    if (isSealed(buf) === on) continue;
    const text = unseal(buf);
    saveFile(f, on ? seal(text) : Buffer.from(text, 'utf8'));
    n++;
  }
  return n;
}
