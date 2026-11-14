// 👥 Users (Settings, 🗓 Everyday helpers: "Users"; off unless you turn it on).
//
// Each person you add gets their own chats, memory, spending sheet and email account (user-email.js), in their own
// folder (inn\profiles\<id>). A passcode is up to them:
// - With a passcode: their things are locked on disk (AES-256-GCM) with a key only that passcode opens, so nobody
//   else signed in (the owner included) can read them. Forget it and their things are gone for good.
// - Without one: their things are kept apart from everyone else's, but anyone who switches to them can see them.
// Neither needs the owner's 🔒 passcode lock or "Lock my chats and memory". With the owner's lock on, the lock screen
// asks "Who's this?"; with it off, 👥 Switch user in the menu picks a person. Getting back to the owner needs the
// owner's passcode only when the owner has one.
//
// Kept in config.json beside the lock (never settings.json): cfg.profiles = { list: [{ id, name, salt?, wrapped? }] }.
// `wrapped` is that person's random 32-byte key locked with scrypt(passcode, salt), the same way as the lock's own
// (lock.js wrapKey), so no passcode is stored anywhere. No `wrapped`: a person without a passcode.
//
// What a user shares with the owner: Bob's brains, settings, tools, Hands and schedules (schedules wait while someone
// else is in: hands-schedules.js). Switching people never loads or lets go of a brain and never touches 🎮 Gaming.
// Only the owner (signed in as the owner) can add or remove a person. Nothing here goes online, and Bob for Android
// keeps its own lock.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJsonFile, writeJsonAtomic } from './util.js';
import { wrapKey, unwrapKey, lockOn, MIN_LEN } from './lock.js';
import { setKey, seal, unseal, isSealed, readText, writeText } from './vault.js';
import { useUserKeys } from './secret-box.js';
import { saveFile } from './saving.js';
import { forgetUserEmail, sealUserEmail } from './user-email.js';

export const MAX_PROFILES = 8;
export const MAIN = 'main';
// 👤 Guest: where Sign out lands. An empty user (no chats, memory, email, keys or agents kept): its folder
// (inn\profiles\guest) is wiped when anyone signs in, and when Bob starts.
export const GUEST = 'guest';
// With the lock AND "Lock my chats and memory", the owner's chats and memory stay locked with the owner's key while
// someone else is in, so not even Bob's file tools can read them for that person. Without, they're the owner's own
// but not private (Settings says so).
export const ownerLocked = (cfg) => lockOn(cfg) && cfg?.lock?.encrypt === true;
export const profilesOn = (cfg) => cfg?.profilesOn === true;
export const keyed = (p) => Boolean(p?.wrapped && p?.salt);
export const profileDir = (cfg, id) => path.join(cfg.innDir, 'profiles', id);
const cleanName = (v) => String(v ?? '').replace(/[^\p{L}\p{N} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
export const listOf = (cfg) => (Array.isArray(cfg?.profiles?.list) ? cfg.profiles.list : []).filter((p) => p && /^[a-f0-9]{12}$/.test(p.id) && typeof p.name === 'string' && p.name);
// The files Bob locks in a person's folder when they set a passcode (and opens when they take it off). Others there
// (topics, summaries) are plain JSON written by their own modules and stay as they are.
export function userFiles(dir) {
  const own = ['bob-memory.md', 'memory-changes.jsonl', 'spending.json', 'email.json', 'keys.json'].map((f) => path.join(dir, f));
  let chats = [];
  try { chats = fs.readdirSync(path.join(dir, 'sessions')).filter((f) => /\.json$/.test(f)).map((f) => path.join(dir, 'sessions', f)); } catch {}
  return [...chats, ...own].filter((f) => fs.existsSync(f));
}

function saveList(cfg, list) {
  const raw = readJsonFile(cfg.configFile); // an unreadable config.json stops the save rather than being written over
  raw.profiles = { list };
  writeJsonAtomic(cfg.configFile, raw, 2);
  cfg.profiles = raw.profiles;
}

export class Profiles {
  constructor(cfg, { brain = null, now = Date.now, log = () => {} } = {}) {
    this.cfg = cfg; this.brain = brain; this.now = now; this.log = log;
    this.mainMemory = cfg.memoryFile;
    this.tries = [];
    this.#wipeGuest();
  }
  current() { return this.cfg.profileNow || MAIN; }
  // The names the lock screen offers ("Who's this?"). Empty while the switch is off.
  people() { return profilesOn(this.cfg) ? listOf(this.cfg).map((p) => ({ id: p.id, name: p.name, passcode: keyed(p) })) : []; }
  view() {
    const cur = this.current();
    return { on: this.cfg.profilesOn === true, ownerName: String(this.cfg.userName || '').slice(0, 30) || 'Owner', lockOn: lockOn(this.cfg), ownerLocked: ownerLocked(this.cfg), list: listOf(this.cfg).map((p) => ({ id: p.id, name: p.name, passcode: keyed(p) })), current: cur, currentPasscode: keyed(listOf(this.cfg).find((p) => p.id === cur)), currentCodeAsked: listOf(this.cfg).find((p) => p.id === cur)?.codeAsked === true, currentName: cur === MAIN ? '' : cur === GUEST ? 'Guest' : (listOf(this.cfg).find((p) => p.id === cur)?.name || ''), guest: cur === GUEST, max: MAX_PROFILES, minLength: MIN_LEN };
  }

  add(name, code) {
    if (this.current() !== MAIN) return { error: 'Only the owner can add a person. Lock Bob and open him with your own passcode.' };
    const n = cleanName(name);
    if (!n) return { error: 'Give the person a name.' };
    const list = listOf(this.cfg);
    if (list.length >= MAX_PROFILES) return { error: `${MAX_PROFILES} people at most.` };
    if (list.some((p) => p.name.toLowerCase() === n.toLowerCase())) return { error: 'There\'s already someone with that name.' };
    const c = String(code || '');
    const bad = c && this.#badCode(c);
    if (bad) return { error: bad };
    const id = crypto.randomBytes(6).toString('hex');
    const p = { id, name: n, ...(c ? wrapKey(c, crypto.randomBytes(32)) : {}) };
    fs.mkdirSync(path.join(profileDir(this.cfg, id), 'sessions'), { recursive: true });
    saveList(this.cfg, [...list, p]);
    this.log('settings', `users: added ${n}${c ? ', with a passcode' : ', no passcode'}`);
    return { view: this.view() };
  }

  // Nov 14 (the owner): a person picks their own passcode after their own first time in, if they want one. Bob asks
  // once, in the chat; either answer is remembered here, so the question never comes back (and the first-time setup
  // never asks at all).
  codeAsked() {
    const cur = this.current();
    if (cur === MAIN || cur === GUEST) return { error: 'Only a person who is in can answer that.' };
    const list = listOf(this.cfg);
    if (!list.some((p) => p.id === cur)) return { error: 'That person isn\'t on the list.' };
    saveList(this.cfg, list.map((x) => (x.id === cur ? { ...x, codeAsked: true } : x)));
    return { view: this.view() };
  }

  // A new name for a person. Their chats, memory and passcode stay as they are. The owner only.
  rename(id, name) {
    if (this.current() !== MAIN) return { error: 'Only the owner can rename a person.' };
    const list = listOf(this.cfg);
    const p = list.find((x) => x.id === id);
    if (!p) return { error: 'That person isn\'t on the list.' };
    const n = cleanName(name);
    if (!n) return { error: 'Give the person a name.' };
    if (list.some((x) => x.id !== id && x.name.toLowerCase() === n.toLowerCase())) return { error: 'There\'s already someone with that name.' };
    const old = p.name;
    saveList(this.cfg, list.map((x) => (x.id === id ? { ...x, name: n } : x)));
    this.log('settings', `users: renamed ${old} to ${n}`);
    return { view: this.view() };
  }

  // Deletes the person and their locked chats and memory. The owner only.
  remove(id) {
    if (this.current() !== MAIN) return { error: 'Only the owner can remove a person.' };
    const list = listOf(this.cfg);
    const p = list.find((x) => x.id === id);
    if (!p) return { error: 'That person isn\'t on the list.' };
    try { fs.rmSync(profileDir(this.cfg, id), { recursive: true, force: true }); } catch (e) { return { error: `Couldn't delete their folder (${e.message}).` }; }
    forgetUserEmail(this.cfg, id);
    saveList(this.cfg, list.filter((x) => x.id !== id));
    this.log('settings', `users: removed ${p.name} and their chats and memory`);
    return { view: this.view() };
  }

  // The lock screen or 👥 Switch user: a person, with their passcode if they have one. Five wrong tries a minute at
  // most. Returns { ok } or { error, code }.
  open(id, code) {
    const p = profilesOn(this.cfg) && listOf(this.cfg).find((x) => x.id === id);
    if (!p) return { error: 'That person isn\'t on the list.', code: 404 };
    if (!keyed(p)) { this.use(p.id, null); this.log('settings', `users: ${p.name} is in`); return { ok: true }; }
    const now = this.now();
    while (this.tries.length && now - this.tries[0] > 60000) this.tries.shift();
    if (this.tries.length >= 5) return { error: 'Too many tries. Wait a minute.', code: 429 };
    this.tries.push(now);
    const key = unwrapKey(code, p);
    if (!key) return { error: 'That passcode isn\'t right.', code: 401 };
    this.tries = [];
    this.use(p.id, key);
    this.log('settings', `users: ${p.name} opened Bob`);
    return { ok: true };
  }

  // The person who's in sets a passcode for themselves: a new key, and their files are locked with it.
  setPasscode(code) {
    const cur = this.current(), list = listOf(this.cfg), p = list.find((x) => x.id === cur);
    if (!p) return { error: 'Only a user sets their own passcode here. The owner\'s is 🔒 Passcode lock.' };
    if (keyed(p)) return { error: 'You have a passcode already. Take it off first to pick a new one.' };
    const c = String(code || ''), bad = this.#badCode(c);
    if (bad) return { error: bad };
    const key = crypto.randomBytes(32);
    try { this.#convert(key, true); }
    catch (e) { return { error: `Couldn't lock every file (${e.message}). Nothing was changed.` }; }
    saveList(this.cfg, list.map((x) => (x.id === cur ? { id: x.id, name: x.name, ...wrapKey(c, key) } : x)));
    setKey(key); this.cfg.profileKeyed = true; this.#keys();
    sealUserEmail(this.cfg, cur, key, true);
    this.log('settings', `users: ${p.name} set a passcode; their things are locked`);
    return { view: this.view() };
  }

  // ... or takes it off, with that passcode: their files go back to plain.
  clearPasscode(code) {
    const cur = this.current(), list = listOf(this.cfg), p = list.find((x) => x.id === cur);
    if (!p || !keyed(p)) return { error: 'There\'s no passcode to take off.' };
    const key = unwrapKey(String(code || ''), p);
    if (!key) return { error: 'That passcode isn\'t right.' };
    try { this.#convert(key, false); }
    catch (e) { return { error: `Couldn't open every file (${e.message}). Nothing was changed.` }; }
    saveList(this.cfg, list.map((x) => (x.id === cur ? { id: x.id, name: x.name } : x)));
    setKey(null); this.cfg.profileKeyed = false; this.#keys();
    sealUserEmail(this.cfg, cur, key, false);
    this.log('settings', `users: ${p.name} took their passcode off; their things are plain`);
    return { view: this.view() };
  }

  #badCode(c) {
    if (c.length < MIN_LEN) return `A passcode needs at least ${MIN_LEN} characters.`;
    if (c.length > 200) return 'That passcode is too long.';
    if (this.cfg.lock?.wrapped && unwrapKey(c, this.cfg.lock)) return 'Pick a passcode that isn\'t the owner\'s.';
    if (listOf(this.cfg).some((p) => keyed(p) && unwrapKey(c, p))) return 'Someone else has that passcode. Pick another.';
    return '';
  }

  // Locks (on) or opens (off) every file in the current person's folder, all read first so a bad one changes nothing.
  #convert(key, on) {
    const files = userFiles(profileDir(this.cfg, this.current()));
    const texts = files.map((f) => { const b = fs.readFileSync(f); return isSealed(b) ? unseal(b, key) : b.toString('utf8'); });
    files.forEach((f, i) => saveFile(f, on ? seal(texts[i], key) : Buffer.from(texts[i], 'utf8')));
  }

  // Point chats and memory at a person's folder, with their key (null: no passcode, so their files are plain and
  // nobody's key stays in Bob's memory, the owner's included).
  use(id, key) {
    const was = this.current();
    const dir = profileDir(this.cfg, id);
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    setKey(key);
    Object.assign(this.cfg, { profileNow: id, profileKeyed: Boolean(key), profileDir: dir, sessionsDir: path.join(dir, 'sessions'), memoryFile: path.join(dir, 'bob-memory.md') });
    this.#keys();
    this.#reset();
    if (was === GUEST && id !== GUEST) this.#wipeGuest();
  }

  // 👤 Sign out: into Guest, fresh and empty, with no one's key in memory.
  signOut() {
    if (this.current() === GUEST) return { ok: true };
    this.#wipeGuest();
    this.use(GUEST, null);
    this.log('settings', 'users: signed out; Guest is in');
    return { ok: true };
  }

  #wipeGuest() { try { fs.rmSync(profileDir(this.cfg, GUEST), { recursive: true, force: true }); } catch {} }

  // Back to the owner: after the owner's passcode when there's a lock (lock.js has set the owner's key already);
  // without one, the person's key leaves Bob's memory.
  useMain() {
    if (!this.cfg.profileNow) return;
    const was = this.cfg.profileNow;
    if (!lockOn(this.cfg)) setKey(null);
    delete this.cfg.profileNow; delete this.cfg.profileKeyed; delete this.cfg.profileDir; delete this.cfg.sessionsDir;
    this.cfg.memoryFile = this.mainMemory;
    useUserKeys(null); // the owner's keys again
    this.#reset();
    if (was === GUEST) this.#wipeGuest();
  }

  // 👥 Their own API keys and sign-ins (secret-box.js useUserKeys): inn\profiles\<id>\keys.json, locked with their key
  // when they have a passcode. Nobody else's keys, the owner's included, are seen while they're in.
  #keys() {
    const file = path.join(profileDir(this.cfg, this.current()), 'keys.json');
    useUserKeys({ read: () => { try { return readText(file); } catch (e) { if (e.code === 'ENOENT') return '{}'; throw e; } }, write: (text) => writeText(this.cfg, file, text) });
  }

  #reset() {
    const b = this.brain;
    if (!b) return;
    b.sessionDir = this.cfg.sessionsDir || path.join(this.cfg.dataDir, 'sessions');
    try { fs.mkdirSync(b.sessionDir, { recursive: true }); } catch {}
    b.sessions?.clear?.(); // no one else's chat stays in Bob's memory
  }
}
