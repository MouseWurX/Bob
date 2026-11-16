// Nov 16 (Maximus rerun, 8 bad_args faults): a brain guessed a file's folder (C:\Users\you\scraper.py when it was in
// Documents), got "isn't there", and guessed again, or gave up and asked. Here a missing file or folder is looked for
// by its name in the folders Bob may read, a few levels down, and the error says where it is. Read-only and capped:
// it never opens a file, skips hidden folders, AppData and package folders, and stops after a few thousand entries.
import fs from 'node:fs';
import path from 'node:path';

const SKIP_DIR = /^(\.|node_modules$|AppData$|__pycache__$|\$Recycle\.Bin$|Library$|venv$|\.venv$)/i;
export const FIND_DEPTH = 4;
export const FIND_ENTRIES = 4000;

// The full paths (up to `max`) under roots whose last part is `name` (case-insensitive), nearest first.
// skip(full) = true leaves that path out (Bob's secret files). fsx is passed in by tests.
export function findByName(roots, name, { skip = () => false, depth = FIND_DEPTH, entries = FIND_ENTRIES, max = 3, fsx = fs } = {}) {
  const want = String(name || '').trim().toLowerCase();
  if (!want || /[\\/]/.test(want) || want === '.' || want === '..') return [];
  const hits = [];
  let seen = 0;
  let level = [...new Set((roots || []).filter(Boolean))].map((r) => path.resolve(r));
  for (let d = 0; d <= depth && level.length && hits.length < max && seen < entries; d++) {
    const next = [];
    for (const dir of level) {
      let list;
      try { list = fsx.readdirSync(dir, { withFileTypes: true }); } catch { continue; }
      for (const e of list) {
        if (++seen > entries) break;
        const full = path.join(dir, e.name);
        if (skip(full)) continue;
        if (e.name.toLowerCase() === want && !hits.includes(full)) { hits.push(full); if (hits.length >= max) break; }
        if (e.isDirectory() && !SKIP_DIR.test(e.name)) next.push(full);
      }
      if (hits.length >= max || seen > entries) break;
    }
    level = next;
  }
  return hits;
}

// The path a tool call named, for the look-up: path, file, paths[0] or from.
export function pathArg(args = {}) {
  const p = args.path ?? args.file ?? (Array.isArray(args.paths) ? args.paths[0] : args.paths) ?? args.from;
  return typeof p === 'string' && p.trim() ? p.trim() : '';
}

// An error that means "not there": ENOENT, or the tools' own words for it.
export const NOT_THERE = /isn't there|doesn't exist|no file called|no such file|ENOENT/i;

// One line for the error: where a file or folder with that name is. '' when none is found, or when the only one
// found is the very path that failed.
export function foundLine(hits, asked = '') {
  const same = (h) => path.resolve(h).toLowerCase() === path.resolve(asked || '.').toLowerCase();
  const list = (hits || []).filter((h) => !asked || !same(h));
  if (!list.length) return '';
  const name = path.basename(list[0]);
  return list.length === 1
    ? `${name} is at ${list[0]}: use that full path.`
    : `There are ${list.length === 3 ? '3 or more' : list.length} called ${name}: ${list.join('; ')}. Use the full path of the right one.`;
}

// The error's "Next:" with where the missing path is, from the folders Bob may read (roots) less skip(path).
// '' when the error isn't about a missing path, or nothing by that name is found.
export function whereItIs(roots, skip, args, text) {
  try {
    if (!NOT_THERE.test(String(text || ''))) return '';
    const asked = pathArg(args);
    if (!asked) return '';
    const name = asked.replace(/[\\/]+$/, '').split(/[\\/]/).pop(); // either slash, whatever this computer uses
    const line = foundLine(findByName(roots, name, { skip }), asked);
    if (!line) return '';
    const plain = String(text).replace(/\s*Next:[\s\S]*$/, '').replace(/\s*Give its full path\.[\s\S]*$/, '').replace(/\.?\s*$/, '.');
    return `${plain} Next: ${line}`;
  } catch { return ''; }
}
