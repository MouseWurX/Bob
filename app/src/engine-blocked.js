// 1.5.203 PC test: Windows Smart App Control (an Application Control policy) blocked Brain Engine 3's rebuilt files,
// because they aren't signed yet. spawn() then throws at once (code UNKNOWN, errno -4094, no child, no 'error' event),
// so every brain failed to wake and Bob was left without one. Now, when a thinking engine won't start because
// Windows blocked it (or any start fails within two days of an engine update) and the build from before the update
// is still kept, Bob goes back to that build by himself, says so once in plain words, and remembers it
// (engine-blocked.json in his folder) so he doesn't try the blocked build on every load and the update doesn't
// fetch it again. Settings, Engines offers Try again. Nothing here runs unless a start has already failed.
import fs from 'node:fs';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { ENGINES, engineFor, installedMarker, previousDir, goBackEngine, engineBlocked, BLOCKED_FILE } from './engines.js';

export const FRESH_MS = 2 * 864e5; // "right after an engine update"
// Windows refused to run the file: Smart App Control / App Control for Business, or the plain spawn UNKNOWN it gives.
export function windowsBlocked(err) {
  if (!err) return false;
  if (/application control|smart app control|blocked this file/i.test(String(err.message || err))) return true;
  if (err.errno === 4551 || err.errno === -4551 || /\b4551\b/.test(String(err.message || ''))) return true;
  return err.code === 'UNKNOWN' && String(err.syscall || '').startsWith('spawn');
}
// Which thinking engine a program belongs to ('' when none of Bob's own).
export function engineOf(cfg, exe) {
  for (const id of ['brainengine', 'llamacpp']) {
    const e = ENGINES.find((x) => x.id === id);
    if (!e || !cfg?.agentDir || !exe) continue;
    const r = path.relative(path.join(cfg.agentDir, e.dir), exe);
    if (r && !r.startsWith('..') && !path.isAbsolute(r)) return id;
  }
  return '';
}
// "version 3" / "built on llama.cpp b12282" / a plain tag, for the words Bob says.
export function buildWords(v) {
  const s = String(v || '');
  let m = /^brain-engine-v(\d+)$/.exec(s); if (m) return `version ${m[1]}`;
  m = /^brain-engine-(b\d+)$/.exec(s); if (m) return `the one built on llama.cpp ${m[1]}`;
  return s || 'the one before';
}
export function blockedSay(rec, name = 'Brain Engine') {
  const now = buildWords(rec.previous);
  const was = rec.version ? ` (${buildWords(rec.version)})` : '';
  return rec.windows
    ? `Windows blocked my new engine${was}, so I went back to the one I had before (${now}) and I'm using that. Windows' Smart App Control stops programs that aren't signed, and the new ${name} files aren't signed yet. Everything works as before. To try the new one again, press Try again in Settings, Engines.`
    : `My new engine${was} wouldn't start (${String(rec.why || '').slice(0, 120)}), so I went back to the one I had before (${now}) and I'm using that. To try the new one again, press Try again in Settings, Engines.`;
}
const listeners = new Set();
export const onEngineFallback = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// After a failed start of exe: go back to the kept build if that's the right thing to do. Returns the record (with
// .say) when Bob went back, else null. Only once: a second failure after going back leaves things as they are.
export function fallBackIfBlocked(cfg, exe, err, { goBack = goBackEngine, now = Date.now } = {}) {
  try {
    const id = engineOf(cfg, exe);
    if (!id || engineBlocked(cfg)) return null;
    const e = engineFor(ENGINES.find((x) => x.id === id));
    if (!fs.existsSync(previousDir(cfg, e))) return null;
    const mark = installedMarker(cfg, e);
    const windows = windowsBlocked(err);
    const at = Date.parse(mark?.at || '');
    if (!windows && !(Number.isFinite(at) && now() - at < FRESH_MS)) return null;
    goBack(cfg, id);
    const back = installedMarker(cfg, e);
    const rec = { engine: id, version: mark?.version || '', print: mark?.print || '', previous: back?.version || '', windows, why: String(err?.message || err || '').slice(0, 200), at: new Date(now()).toISOString() };
    fs.writeFileSync(path.join(cfg.agentDir, BLOCKED_FILE), JSON.stringify(rec, null, 2));
    const out = { ...rec, say: blockedSay(rec, e.name) };
    for (const fn of listeners) { try { fn(out); } catch {} }
    return out;
  } catch { return null; }
}
// spawn() that never throws: a thrown start (Windows blocking the file) comes back as an 'error' event instead, the
// same way a missing program does, so every caller's usual error path handles it.
export function safeSpawn(spawnFn, exe, args, opts) {
  try { return spawnFn(exe, args, opts); }
  catch (err) {
    const fake = Object.assign(new EventEmitter(), { pid: undefined, stdout: new EventEmitter(), stderr: new EventEmitter(), stdin: null, killed: false, exitCode: null, kill() { return false; }, unref() {} });
    setImmediate(() => fake.emit('error', err));
    fake.spawnError = err;
    return fake;
  }
}
