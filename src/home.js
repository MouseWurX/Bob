// 1.5.125: Bob's home folder (his models, engines, notes and settings), chosen when Bob is installed or first
// opened, never by editing a file. It must be a real, visible folder: never AppData, Library caches or any other
// place a "clean up temporary files" tool might empty, because the models in it take tens of gigabytes and hours
// to download again. Pure helpers; electron/main.cjs asks the question and does the move.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// Where a fresh Bob suggests keeping his things: a "Bob" folder in the user's own home folder, on every system.
// Visible in Explorer, Finder and the file manager, not synced by OneDrive (Desktop and Documents often are),
// and not under AppData, which Windows' own Storage Sense and third-party cleaners treat as throwaway.
export function suggestedHome({ home = os.homedir(), platform = process.platform } = {}) {
  return path.join(home, platform === 'win32' ? 'Bob' : 'Bob');
}

// Folders that get emptied by clean-up tools, or vanish with the app: AppData, Temp, the Mac's Caches, Linux cache.
export function tempLike(dir, { home = os.homedir(), env = process.env, platform = process.platform, tmpDir = os.tmpdir() } = {}) {
  const d = path.resolve(String(dir || '')).replace(/[\\/]+$/, '');
  const low = d.toLowerCase();
  const under = (base) => base && (low === path.resolve(base).toLowerCase() || low.startsWith(path.resolve(base).toLowerCase() + path.sep));
  if (under(tmpDir)) return 'a temporary folder';
  if (platform === 'win32') {
    if (under(env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')) || under(env.APPDATA || path.join(home, 'AppData', 'Roaming')) || /\\appdata\\/i.test(d + path.sep)) return 'AppData';
    if (/\\windows(\\|$)/i.test(d)) return 'the Windows folder';
  }
  if (platform === 'darwin' && under(path.join(home, 'Library', 'Caches'))) return 'the Caches folder';
  if (platform === 'linux' && under(env.XDG_CACHE_HOME || path.join(home, '.cache'))) return 'the cache folder';
  return '';
}

// A OneDrive, Dropbox or iCloud folder would sync every model to the cloud: allowed, but Bob says so.
export function synced(dir) {
  const d = String(dir || '');
  if (/onedrive/i.test(d)) return 'OneDrive';
  if (/dropbox/i.test(d)) return 'Dropbox';
  if (/Mobile Documents|iCloud/i.test(d)) return 'iCloud';
  if (/google drive/i.test(d)) return 'Google Drive';
  return '';
}

// Why a folder can't be Bob's home, or '' when it can. Checks the folder itself (or the nearest folder that exists,
// for one Bob would create). current = the home in use, which is fine to "pick" again (nothing happens).
export function homeProblem(dir, { current = '', platform = process.platform, env = process.env, home = os.homedir(), probe = true, tmpDir = os.tmpdir() } = {}) {
  const d = String(dir || '').trim();
  if (!d) return 'Pick a folder.';
  if (d.includes('\0') || d.length > 500) return 'That doesn\'t look like a folder.';
  if (!path.isAbsolute(d) && !/^[a-zA-Z]:[\\/]/.test(d)) return 'Give the whole path, like D:\\Bob (Windows) or /home/you/Bob.';
  const full = path.resolve(d);
  if (full === path.parse(full).root || /^[a-z]:[\\/]?$/i.test(d) || /^[a-z]:\\?$/i.test(full)) return 'Pick a folder, not a whole drive. A "Bob" folder on that drive is fine.';
  if (current && full.toLowerCase() === path.resolve(current).toLowerCase()) return '';
  const t = tempLike(full, { home, env, platform, tmpDir });
  if (t) return `That's inside ${t}, which clean-up tools empty. Bob's models would be lost. Pick a folder of your own, like ${suggestedHome({ home, platform })}.`;
  if (current && full.toLowerCase().startsWith(path.resolve(current).toLowerCase() + path.sep)) return 'That folder is inside Bob\'s current home. Pick one outside it.';
  let st = null;
  try { st = fs.statSync(full); } catch {}
  if (st && !st.isDirectory()) return 'That\'s a file, not a folder.';
  if (st) {
    let names = [];
    try { names = fs.readdirSync(full); } catch { return `Bob can't read ${full}.`; }
    const bobs = names.some((n) => n === 'inn');
    if (names.length && !bobs) return 'That folder already has other things in it. Pick an empty folder, or a new "Bob" folder inside it, so Bob\'s things stay separate from yours.';
  }
  if (probe) {
    // The nearest folder that exists must let Bob write (a Bob folder is made on the way).
    let p = full;
    while (!fs.existsSync(p)) { const up = path.dirname(p); if (up === p) break; p = up; }
    const test = path.join(p, `.bob-write-test-${process.pid}`);
    try { fs.writeFileSync(test, ''); fs.rmSync(test, { force: true }); } catch { return `Bob isn't allowed to save in ${p}. Pick a folder you can save files in.`; }
  }
  return '';
}

// How big a folder is (bytes), stopping after `budget` entries so a huge models folder doesn't hold Bob up.
export function folderBytes(dir, { budget = 20000 } = {}) {
  let bytes = 0, seen = 0, partial = false;
  const walk = (d) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (++seen > budget) { partial = true; return; }
      const p = path.join(d, e.name);
      if (e.isSymbolicLink()) continue;
      if (e.isDirectory()) walk(p);
      else { try { bytes += fs.statSync(p).size; } catch {} }
    }
  };
  walk(dir);
  return { bytes, partial };
}

// Free space on the drive a folder is on (0 when unknown).
export function freeBytes(dir) {
  try { let p = path.resolve(dir); while (!fs.existsSync(p)) { const up = path.dirname(p); if (up === p) break; p = up; } return Number(fs.statfsSync(p).bavail) * Number(fs.statfsSync(p).bsize); } catch { return 0; }
}

export const gbText = (bytes) => { if (!bytes) return '0 MB'; const g = bytes / 1e9; return g >= 10 ? `${Math.round(g)} GB` : g >= 1 ? `${g.toFixed(1)} GB` : `${Math.max(1, Math.round(bytes / 1e6))} MB`; };

// What the Settings row and the first-run screen show about Bob's home.
export function homeView(cfg, { platform = process.platform, env = process.env, home = os.homedir(), tmpDir = os.tmpdir() } = {}) {
  const dir = cfg.agentDir || '';
  const models = folderBytes(path.join(dir, 'models'));
  const engines = ['llama.cpp', 'sd.cpp', 'whisper.cpp', 'piper', 'python', 'audio-workshop'].reduce((n, f) => n + folderBytes(path.join(dir, f), { budget: 4000 }).bytes, 0);
  return {
    folder: dir,
    modelsBytes: models.bytes, modelsText: gbText(models.bytes) + (models.partial ? '+' : ''),
    enginesBytes: engines, totalText: gbText(models.bytes + engines),
    tempLike: tempLike(dir, { platform, env, home, tmpDir }),
    synced: synced(dir),
    suggested: suggestedHome({ home, platform }),
    canMove: Boolean(globalThis.bobHome?.move)
  };
}
