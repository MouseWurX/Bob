// Saving safely, and starting up clean (reliability items 229-240). Always on: these are fixes, not features, and each
// costs a few milliseconds at most. Nothing here talks to a brain or adds a word to what the brain reads.
//   229 saveFile: every save goes to a temp file next to the real one, is flushed to the disk, then takes the real name
//       in one step. A crash or power cut mid-save leaves the old file whole, never half a file.
//   231 oneWriter: a read-change-write of a shared file (settings, reminders, notes, the notice board) holds a small
//       .lock file, so two Bobs on the same folder (Bob.exe and a server copy, a second window) take turns.
//   232 Saved formats: inn\bob\saved-formats.json says which format each saved file is in. A Bob that finds a file in a
//       newer format than it knows leaves that file alone (reads it, never writes it) and says so once.
//   233 readSaved: a saved file that won't read is set aside (name.broken-<time>) with a line in the logbook, and a
//       fresh one is started. Before, an unreadable settings.json was quietly read as empty and then written over.
//   239 sweepTemp: temp files left by a save that was cut off are cleared at start-up.
//   240 startCheck: folders writable, disk space, engine there, saved files readable. One line in the logbook; a
//       note in the chat only when something is wrong.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const TMP = '.bob-tmp';
let tmpN = 0;
const nap = (ms) => { try { Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms); } catch {} };

// Files a newer Bob wrote in a format this one doesn't know: read, never written (item 232).
const handsOff = new Map(); // absolute path -> { name, theirs, ours }
const keyOf = (f) => path.resolve(String(f));
export function isHandsOff(file) { return handsOff.has(keyOf(file)); }
export class HandsOff extends Error {
  constructor(file) { super(`${path.basename(file)} was saved by a newer Bob, so this one leaves it as it is. Update Bob to change it.`); this.code = 'BOB_HANDS_OFF'; }
}

// Told before a save (the file still holds what it held) and after it. turn-changes.js listens: { before, after }.
let watcher = null;
export const watchSaves = (w) => { watcher = w && typeof w === 'object' ? w : null; };

// Write a file whole or not at all. data: a string or a Buffer. Returns the file.
export function saveFile(file, data, { fsync = true, io = fs } = {}) {
  if (isHandsOff(file)) throw new HandsOff(file);
  io.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}-${++tmpN}-${crypto.randomBytes(3).toString('hex')}${TMP}`;
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data ?? ''), 'utf8');
  try { watcher?.before?.(file); } catch {}
  const fd = io.openSync(tmp, 'w');
  try {
    io.writeSync(fd, buf, 0, buf.length, 0);
    if (fsync) { try { io.fsyncSync(fd); } catch {} } // some network drives can't; the rename still keeps it whole
  } catch (e) { try { io.closeSync(fd); } catch {} try { io.rmSync(tmp, { force: true }); } catch {} throw e; }
  io.closeSync(fd);
  // Windows: a virus scanner or the search indexer can hold the old file for a moment. Try again a few times, then
  // copy over it (never leave the temp file as the only copy).
  for (let i = 0; ; i++) {
    try { io.renameSync(tmp, file); break; } catch (e) {
      if (i < 5 && ['EPERM', 'EBUSY', 'EACCES'].includes(e.code)) { nap(20 * (i + 1)); continue; }
      try { io.copyFileSync(tmp, file); io.rmSync(tmp, { force: true }); break; } catch {}
      try { io.rmSync(tmp, { force: true }); } catch {}
      throw e;
    }
  }
  try { watcher?.after?.(file); } catch {}
  return file;
}
export const saveJson = (file, value, spaces = 1, opts) => saveFile(file, JSON.stringify(value, null, spaces), opts);

// Hold a small lock file while fn runs (read, change, write). Waits up to waitMs for another writer; a lock older than
// staleMs, or held by a program that has gone, is taken over. If the wait runs out, fn runs anyway: a late save beats a
// lost one, and every save is whole either way (saveFile).
const held = new Set();
const alive = (pid) => { try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };
export function oneWriter(file, fn, { waitMs = 2000, staleMs = 15000, now = Date.now, io = fs } = {}) {
  const lock = `${file}.lock`, key = keyOf(lock);
  if (held.has(key)) return fn(); // this Bob already holds it (one save inside another)
  const start = now();
  let mine = false;
  try { io.mkdirSync(path.dirname(file), { recursive: true }); } catch {}
  while (!mine) {
    try { io.writeFileSync(lock, `${process.pid} ${now()}`, { flag: 'wx' }); mine = true; break; } catch (e) {
      if (e.code !== 'EEXIST') break; // can't make a lock here (read-only folder): carry on without
    }
    let stale = false;
    try {
      const [pid, at] = io.readFileSync(lock, 'utf8').split(' ').map(Number);
      stale = !(now() - (at || 0) < staleMs) || (pid && pid !== process.pid && !alive(pid));
    } catch { stale = true; }
    if (stale) { try { io.rmSync(lock, { force: true }); } catch {} continue; }
    if (now() - start >= waitMs) break;
    nap(25);
  }
  if (mine) held.add(key);
  try { return fn(); } finally { if (mine) { held.delete(key); try { io.rmSync(lock, { force: true }); } catch {} } }
}

// Keep a file that won't read: it gets a new name beside the old one, and the newest 5 such copies are kept.
export function setAside(file, why = '', { log = () => {}, now = Date.now(), io = fs } = {}) {
  const stamp = new Date(now).toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const to = `${file}.broken-${stamp}`;
  try { io.renameSync(file, to); } catch { return null; }
  try {
    const dir = path.dirname(file), base = `${path.basename(file)}.broken-`;
    const old = io.readdirSync(dir).filter((n) => n.startsWith(base)).sort();
    for (const n of old.slice(0, Math.max(0, old.length - 5))) io.rmSync(path.join(dir, n), { force: true });
  } catch {}
  log(`${path.basename(file)} couldn't be read${why ? ` (${String(why).slice(0, 120)})` : ''}, so I kept it as ${path.basename(to)} and started a fresh one.`);
  (setAside.recent ||= []).push({ file, kept: to, at: now });
  return to;
}

// Read a saved JSON file. Missing: the fallback. Unreadable: set aside, then the fallback. check(value) can refuse a
// value of the wrong shape (an object where a list belongs) the same way.
export function readSaved(file, fallback, { log = () => {}, check = null, now = Date.now(), io = fs } = {}) {
  let text;
  try { text = io.readFileSync(file, 'utf8'); } catch (e) { return e.code === 'ENOENT' ? fallback : fallback; }
  let v;
  try { v = JSON.parse(text.replace(/^﻿/, '')); } catch (e) { setAside(file, e.message, { log, now, io }); return fallback; }
  if (check && !check(v)) { setAside(file, 'not the shape Bob saves', { log, now, io }); return fallback; }
  return v;
}

// ---------- 232 Saved formats ----------
// Each file Bob keeps in inn\bob, by name, and the format this Bob saves it in. Change a file's layout in a way an older
// Bob would misread: raise its number here.
export const FORMATS = { 'settings.json': 1, 'queue.json': 1, 'reminders.json': 1, 'schedules.json': 1, 'checkins.json': 1, 'turn-changes': 1, 'memory-changes.jsonl': 1 };
export const formatsFile = (cfg) => path.join(cfg.dataDir, 'saved-formats.json');
export function checkFormats(cfg, { version = '', log = () => {}, formats = FORMATS, io = fs } = {}) {
  const f = formatsFile(cfg);
  const saved = readSaved(f, {}, { log, io, check: (v) => v && typeof v === 'object' && !Array.isArray(v) });
  const theirs = saved.files && typeof saved.files === 'object' ? saved.files : {};
  const newer = [];
  for (const [name, n] of Object.entries(theirs)) {
    const ours = formats[name];
    if (ours && Number(n) > ours) { newer.push(name); handsOff.set(keyOf(path.join(cfg.dataDir, name)), { name, theirs: Number(n), ours }); }
  }
  const files = { ...theirs };
  for (const [name, n] of Object.entries(formats)) files[name] = Math.max(Number(files[name]) || 0, n);
  const changed = JSON.stringify(files) !== JSON.stringify(theirs) || (!newer.length && saved.by !== version);
  if (changed) { try { saveJson(f, { by: newer.length ? saved.by || version : version, files }, 1, { io }); } catch {} }
  if (newer.length) log(`a newer Bob (${saved.by || 'a later version'}) saved ${newer.join(', ')} in a format I don't know, so I'm leaving ${newer.length === 1 ? 'it' : 'them'} as they are. Update Bob to use them again.`);
  return { newer };
}
export const handsOffList = () => [...handsOff.values()];
export const clearHandsOff = () => handsOff.clear(); // tests

// ---------- 239 Old temp files ----------
// Left by a save, a backup or a note that was cut off. Only Bob's own temp names, and only once they're older than
// maxAgeMs (another Bob on the same folder may be mid-save). Downloads keep their .part files: they pick up from them.
const OWN_TMP = /\.bob-tmp$|\.(?:json|jsonl|md|txt|csv)\.(?:part|tmp)$|\.lock$/;
export function sweepTemp(dirs, { maxAgeMs = 10 * 60e3, now = Date.now(), depth = 2, io = fs } = {}) {
  let n = 0, bytes = 0;
  const walk = (dir, d) => {
    let names = [];
    try { names = io.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of names) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { if (d > 0 && !/^(models|engine|brain-engine|sessions-old|node_modules)$/i.test(e.name)) walk(p, d - 1); continue; }
      if (!OWN_TMP.test(e.name)) continue;
      try { const st = io.statSync(p); if (now - st.mtimeMs < maxAgeMs) continue; io.rmSync(p, { force: true }); n++; bytes += st.size; } catch {}
    }
  };
  for (const d of [...new Set(dirs.filter(Boolean))]) walk(d, depth);
  return { files: n, bytes };
}

// ---------- 240 The start-up check ----------
const GB = 1024 ** 3;
export const LOW_DISK = 2 * GB;
export function startCheck(cfg, { io = fs, statfs = io.statfsSync, savedFiles = null } = {}) {
  const problems = [], parts = [];
  // Folders Bob saves in.
  const dirs = [cfg.innDir, cfg.dataDir, cfg.painterDir].filter(Boolean);
  const stuck = [];
  for (const d of [...new Set(dirs)]) {
    const probe = path.join(d, `.bob-check-${process.pid}${TMP}`);
    try { io.mkdirSync(d, { recursive: true }); io.writeFileSync(probe, 'ok'); io.rmSync(probe, { force: true }); } catch { stuck.push(d); }
  }
  if (stuck.length) problems.push(`I can't save in ${stuck.join(' or ')}. Check that the folder still exists and isn't read-only.`);
  parts.push(stuck.length ? 'a folder is not writable' : 'folders ok');
  // Disk space where the inn is.
  let free = null;
  try { if (typeof statfs === 'function' && cfg.innDir) { const s = statfs(cfg.innDir); free = Number(s.bavail) * Number(s.bsize); } } catch {}
  if (free != null && Number.isFinite(free)) {
    parts.push(`${(free / GB).toFixed(free < 10 * GB ? 1 : 0)} GB free`);
    if (free < LOW_DISK) problems.push(`Only ${(free / GB).toFixed(1)} GB is free on the drive I save on. Saves and downloads may fail; free some space.`);
  }
  // The engine for the brains, when one is set.
  const exe = cfg.llamacpp?.exe;
  if (exe) {
    const there = (() => { try { return io.existsSync(exe); } catch { return false; } })();
    parts.push(there ? 'engine there' : 'engine missing');
    if (!there) problems.push(`My brain engine isn't where it should be (${exe}). Settings, Engines can get it again.`);
  }
  // Saved files: each one reads (the ones that didn't were set aside before this, and are named here).
  const files = savedFiles || ['settings.json', 'queue.json', 'reminders.json', 'schedules.json', 'checkins.json'].map((n) => path.join(cfg.dataDir, n));
  const bad = [];
  for (const f of files) {
    try { if (io.existsSync(f)) JSON.parse(io.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { bad.push(path.basename(f)); }
  }
  const setAsideNow = (setAside.recent || []).map((x) => path.basename(x.file));
  for (const n of setAsideNow) if (!bad.includes(n)) bad.push(n);
  if (bad.length) problems.push(`${bad.join(', ')} couldn't be read, so I kept ${bad.length === 1 ? 'a copy' : 'copies'} beside ${bad.length === 1 ? 'it' : 'them'} and started fresh.`);
  const newer = handsOffList().map((x) => x.name);
  if (newer.length) problems.push(`${newer.join(', ')} ${newer.length === 1 ? 'was' : 'were'} saved by a newer Bob, so I'm leaving ${newer.length === 1 ? 'it' : 'them'} alone. Update Bob to use ${newer.length === 1 ? 'it' : 'them'} again.`);
  parts.push(bad.length ? `${bad.length} saved file${bad.length === 1 ? '' : 's'} set aside` : 'saved files ok');
  return { ok: !problems.length, line: `start check: ${parts.join(', ')}`, problems };
}
