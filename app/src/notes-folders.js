// "Search my notes apps too" (doc-more.js, item 92): the notes folders picked in Settings, How Bob works. Kept apart
// from doc-more.js so config.js can use it without importing Bob's tools.
import fs from 'node:fs';
import path from 'node:path';

export const NOTES_KINDS = { obsidian: 'Obsidian vault', onenote: 'OneNote export' };

// [{ kind, path }]: full paths only, no repeats, at most 10.
export function cleanNotesFolders(v) {
  const out = [];
  for (const x of Array.isArray(v) ? v : []) {
    const p = typeof x?.path === 'string' ? x.path.trim() : '';
    if (!p || p.length > 1024 || !(path.isAbsolute(p) || /^[A-Za-z]:[\\/]/.test(p))) continue;
    if (out.some((o) => o.path === p)) continue;
    out.push({ kind: x.kind === 'onenote' ? 'onenote' : 'obsidian', path: p });
  }
  return out.slice(0, 10);
}

const isDir = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } };

// The notes folders join the folders Bob may read while "Read and search my documents" is on, and leave them when
// they're taken off the list (or the switch goes off). Bob's own folders never join this way.
export function applyNotes(cfg, { exists = isDir } = {}) {
  if (!Array.isArray(cfg?.readRoots)) return cfg;
  const before = new Set(cfg.notesReadRoots || []);
  const own = (p) => (cfg.ownReadOnlyRoots || []).some((r) => p === r || p.startsWith(r + path.sep));
  const add = cfg.docTools === true ? cleanNotesFolders(cfg.notesFolders).map((n) => n.path).filter((p) => exists(p) && !own(p)) : [];
  const base = cfg.readRoots.filter((r) => !before.has(r));
  cfg.notesReadRoots = add.filter((p) => !base.includes(p));
  cfg.readRoots = [...base, ...cfg.notesReadRoots];
  return cfg;
}
