// The code map (Nov 11): one short line per source file, so a small brain sees the shape of a big codebase
// in a few thousand tokens and opens only the file it needs, instead of reading file after file.
// Each line: the file, its length, what its first comment says it is for, and the main names in it.
// Built fresh on each call from the files themselves, so it can't go stale. Read-only.
import fs from 'node:fs';
import path from 'node:path';

export const MAP_SKIP = new Set(['.git', 'node_modules', 'Binaries', 'Intermediate', 'Saved', 'DerivedDataCache', 'build', '.gradle', '.idea', '.vs', 'Build', 'dist', 'out', 'vendor', '__pycache__', '.venv', 'venv', 'target', 'coverage']);
export const CODE_EXT = /\.(c|h|hpp|cpp|cc|cs|rs|kt|kts|java|py|js|mjs|cjs|ts|tsx|jsx|go|swift|lua|gd|sh|ps1)$/i;
const MAX_FILES = 2000;
export const MAP_CHARS = 14000; // about 4,000 tokens: fits a small brain's context with room to work

// What the file says it is for: its first comment line.
export function purposeOf(text) {
  const lines = String(text).replace(/\r\n/g, '\n').split('\n').slice(0, 30);
  for (const l of lines) {
    const m = l.match(/^\s*(?:\/\/+|#(?!!|include|pragma|define|if|endif)|\/\*+|\*|"""|''')\s*(.+?)\s*(?:\*\/|"""|''')?\s*$/);
    if (m && /[a-z]{3}/i.test(m[1]) && !/^(?:eslint|@ts-|-\*-|copyright|license|spdx|use strict)/i.test(m[1])) return m[1].replace(/\s+/g, ' ').replace(/^(?:\d+\.\d+\.\d+\w*:?\s+)+/, '').replace(/\s*\(\d+\.\d+\.\d+\w*\)/g, '');
  }
  return '';
}

// The main names a file defines: exported or top-level functions and classes.
export function namesIn(text) {
  const t = String(text).replace(/\r\n/g, '\n');
  const rx = [
    /^export\s+(?:default\s+)?(?:async\s+)?(?:function\*?|class|const|let)\s+([A-Za-z_$][\w$]*)/gm, // JS / TS
    /^(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
    /^(?:class|def)\s+(?:[A-Z_]+_API\s+)?([A-Za-z_]\w*)/gm, // Python, and top-level classes
    /^\s*(?:public\s+|internal\s+|private\s+)?(?:abstract\s+|sealed\s+|static\s+|partial\s+)*(?:class|struct|interface|enum)\s+(?:[A-Z_]+_API\s+)?([A-Za-z_]\w*)/gm, // C#, C++, Java, Kotlin
    /^\s*pub\s+(?:fn|struct|enum|trait)\s+([A-Za-z_]\w*)/gm, // Rust
    /^\s*fun\s+([A-Za-z_]\w*)/gm, // Kotlin
    /^func\s+(?:\([^)]*\)\s*)?([A-Za-z_]\w*)/gm // Go
  ];
  const out = [];
  for (const r of rx) for (const m of t.matchAll(r)) if (!out.includes(m[1])) out.push(m[1]);
  return out;
}

const lineCount = (text) => String(text).split('\n').length;

export function codeMap(root, { skip = () => false, maxChars = MAP_CHARS } = {}) {
  const files = [];
  const walk = (dir) => {
    if (files.length >= MAX_FILES) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    entries.sort((a, b) => a.name.localeCompare(b.name));
    for (const e of entries) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { if (!MAP_SKIP.has(e.name) && !e.name.startsWith('.')) walk(full); continue; }
      if (!CODE_EXT.test(e.name) || skip(full)) continue;
      files.push(full);
      if (files.length >= MAX_FILES) return;
    }
  };
  walk(root);
  const items = [];
  let total = 0;
  for (const f of files) {
    let text = '';
    try { if (fs.statSync(f).size > 2e6) continue; text = fs.readFileSync(f, 'utf8'); } catch { continue; }
    const n = lineCount(text);
    total += n;
    items.push({ rel: path.relative(root, f).split(path.sep).join('/'), n, what: purposeOf(text), names: namesIn(text) });
  }
  if (!items.length) return `No source files in ${root}.`;
  const head = `${items.length} source files, ${total} lines, in ${root}. Open only the file you need with read_file (with line for an error's file:line).\n`;
  const cut = (x, k) => (x.length > k ? x.slice(0, k - 1) + '…' : x);
  // Shorter and shorter until it fits: full lines, then shorter notes, then names only, then one line per folder.
  const tiers = [[110, 8], [60, 3], [40, 2], [55, 0], [0, 4], [0, 0]];
  for (const [w, k] of tiers) {
    const body = items.map((x) => `${x.rel} (${x.n})${w && x.what ? `: ${cut(x.what, w)}` : ''}${k && x.names.length ? ` [${x.names.slice(0, k).join(', ')}${x.names.length > k ? ', …' : ''}]` : ''}`).join('\n');
    if (head.length + body.length <= maxChars) return head + body;
  }
  const byDir = new Map();
  for (const x of items) { const d = x.rel.includes('/') ? x.rel.split('/')[0] : '.'; byDir.set(d, (byDir.get(d) || 0) + 1); }
  const folded = [...byDir].map(([d, n]) => `${d}/ (${n} files)`).join('\n');
  return `${head}${cut(folded, maxChars)}\n(Too many files for one map: call code_map again with one of these folders.)`;
}

// Lines around one line of a file, numbered, for jumping straight to an error.
export function linesAround(text, line, around = 30) {
  const all = String(text).replace(/\r\n/g, '\n').split('\n');
  const n = Math.min(Math.max(1, Math.floor(Number(line)) || 1), all.length);
  const from = Math.max(1, n - around), to = Math.min(all.length, n + around);
  const w = String(to).length;
  const body = all.slice(from - 1, to).map((l, i) => `${String(from + i).padStart(w)}${from + i === n ? '>' : '|'} ${l}`).join('\n');
  return `(Lines ${from} to ${to} of ${all.length}; line ${n} is marked >. For more, call read_file with another line.)\n${body}`;
}
