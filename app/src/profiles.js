// 👥 Profiles on a shared replicant matrix (Settings, 🗓 Everyday helpers: "Profiles for other people"; off unless
// you turn it on, and it needs 🔒 "Ask for a passcode to open Bob").
//
// Each person you add gets their own chats and their own memory, in their own folder (inn\profiles\<id>), always
// locked on disk (AES-256-GCM) with a key only their own passcode opens. The lock screen asks "Who's this?": the
// owner's passcode opens the owner's Bob as before; a person's passcode opens only their chats and memory. Nobody
// else's are readable while they're in, because the key in Bob's memory is theirs alone.
//
// Kept in config.json beside the lock (never settings.json): cfg.profiles = { list: [{ id, name, salt, wrapped }] }.
// `wrapped` is that person's random 32-byte key locked with scrypt(passcode, salt), the same way as the lock's own
// (lock.js wrapKey), so no passcode is stored anywhere. Forget it and that person's chats and memory are gone for good.
//
// What a profile shares with the owner: Bob's brains, settings, tools, Hands and schedules. Only chats, memory and the
// spending sheet are the person's own. Only the owner (signed in as the owner) can add or remove a person. Switching
// people is "🔒 Lock now" and then the lock screen. Nothing here goes online, and Bob for Android keeps its own lock.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { readJsonFile, writeJsonAtomic } from './util.js';
import { wrapKey, unwrapKey, lockOn, MIN_LEN } from './lock.js';
import { setKey } from './vault.js';

export const MAX_PROFILES = 8;
export const MAIN = 'main';
// Needs the lock AND "Lock my chats and memory": then the owner's chats and memory stay locked with the owner's key
// while someone else is in, so not even Bob's file tools can read them for that person.
export const ownerLocked = (cfg) => lockOn(cfg) && cfg?.lock?.encrypt === true;
export const profilesOn = (cfg) => cfg?.profilesOn === true && ownerLocked(cfg);
export const profileDir = (cfg, id) => path.join(cfg.innDir, 'profiles', id);
const cleanName = (v) => String(v ?? '').replace(/[^\p{L}\p{N} '.-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 30);
export const listOf = (cfg) => (Array.isArray(cfg?.profiles?.list) ? cfg.profiles.list : []).filter((p) => p && /^[a-f0-9]{12}$/.test(p.id) && p.wrapped);

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
  }
  current() { return this.cfg.profileNow || MAIN; }
  // The names the lock screen offers ("Who's this?"). Empty while the switch is off.
  people() { return profilesOn(this.cfg) ? listOf(this.cfg).map(({ id, name }) => ({ id, name })) : []; }
  view() {
    const cur = this.current();
    return { on: this.cfg.profilesOn === true, lockOn: lockOn(this.cfg), ownerLocked: ownerLocked(this.cfg), list: listOf(this.cfg).map(({ id, name }) => ({ id, name })), current: cur, currentName: cur === MAIN ? '' : (listOf(this.cfg).find((p) => p.id === cur)?.name || ''), max: MAX_PROFILES, minLength: MIN_LEN };
  }

  add(name, code) {
    if (this.current() !== MAIN) return { error: 'Only the owner can add a person. Lock Bob and open him with your own passcode.' };
    if (!ownerLocked(this.cfg)) return { error: 'Turn on 🔒 Ask for a passcode to open Bob and Lock my chats and memory first: profiles sit behind them.' };
    const n = cleanName(name);
    if (!n) return { error: 'Give the person a name.' };
    const list = listOf(this.cfg);
    if (list.length >= MAX_PROFILES) return { error: `${MAX_PROFILES} people at most.` };
    if (list.some((p) => p.name.toLowerCase() === n.toLowerCase())) return { error: 'There\'s already someone with that name.' };
    const c = String(code || '');
    if (c.length < MIN_LEN) return { error: `Their passcode needs at least ${MIN_LEN} characters.` };
    if (c.length > 200) return { error: 'That passcode is too long.' };
    if (unwrapKey(c, this.cfg.lock || {})) return { error: 'Pick a passcode that isn\'t the owner\'s.' };
    const id = crypto.randomBytes(6).toString('hex');
    const p = { id, name: n, ...wrapKey(c, crypto.randomBytes(32)) };
    fs.mkdirSync(path.join(profileDir(this.cfg, id), 'sessions'), { recursive: true });
    saveList(this.cfg, [...list, p]);
    this.log('settings', `profiles: added ${n}`);
    return { view: this.view() };
  }

  // Deletes the person and their locked chats and memory. The owner only.
  remove(id) {
    if (this.current() !== MAIN) return { error: 'Only the owner can remove a person.' };
    const list = listOf(this.cfg);
    const p = list.find((x) => x.id === id);
    if (!p) return { error: 'That person isn\'t on the list.' };
    try { fs.rmSync(profileDir(this.cfg, id), { recursive: true, force: true }); } catch (e) { return { error: `Couldn't delete their folder (${e.message}).` }; }
    saveList(this.cfg, list.filter((x) => x.id !== id));
    this.log('settings', `profiles: removed ${p.name} and their chats and memory`);
    return { view: this.view() };
  }

  // The lock screen: a person's passcode. Five wrong tries a minute at most. Returns { ok } or { error, code }.
  open(id, code) {
    const now = this.now();
    while (this.tries.length && now - this.tries[0] > 60000) this.tries.shift();
    if (this.tries.length >= 5) return { error: 'Too many tries. Wait a minute.', code: 429 };
    this.tries.push(now);
    const p = profilesOn(this.cfg) && listOf(this.cfg).find((x) => x.id === id);
    const key = p && unwrapKey(code, p);
    if (!key) return { error: 'That passcode isn\'t right.', code: 401 };
    this.tries = [];
    this.use(p.id, key);
    this.log('settings', `profiles: ${p.name} opened Bob`);
    return { ok: true };
  }

  // Point chats and memory at a person's folder, with their key.
  use(id, key) {
    const dir = profileDir(this.cfg, id);
    fs.mkdirSync(path.join(dir, 'sessions'), { recursive: true });
    setKey(key);
    Object.assign(this.cfg, { profileNow: id, profileDir: dir, sessionsDir: path.join(dir, 'sessions'), memoryFile: path.join(dir, 'bob-memory.md') });
    this.#reset();
  }

  // Back to the owner (after the owner's passcode; lock.js has set the owner's key already).
  useMain() {
    if (!this.cfg.profileNow) return;
    delete this.cfg.profileNow; delete this.cfg.profileDir; delete this.cfg.sessionsDir;
    this.cfg.memoryFile = this.mainMemory;
    this.#reset();
  }

  #reset() {
    const b = this.brain;
    if (!b) return;
    b.sessionDir = this.cfg.sessionsDir || path.join(this.cfg.dataDir, 'sessions');
    try { fs.mkdirSync(b.sessionDir, { recursive: true }); } catch {}
    b.sessions?.clear?.(); // no one else's chat stays in Bob's memory
  }
}
