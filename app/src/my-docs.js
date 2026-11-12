// Read and search my documents (Settings, How Bob works; off unless the user turns it on).
//
// With it on:
//   - read_file reads Word, Excel, PowerPoint, OpenDocument, e-book, Rich Text and PDF files as text, with nothing
//     extra installed (doc-text.js). Off, read_file only reads plain text, as before.
//   - Bob gets find_in_documents: plain word search through the folders he may read (your Documents, Desktop
//     and Downloads unless config.json lists others), inside those documents as well as text files and in file names.
//   - with "Search my documents by meaning" on as well (doc-index.js), find_in_documents also lists files that mean what
//     was asked in other words, from an index made while Bob is idle. That index is the one thing kept on disk.
// What it never does: read secret files (keys, passwords, his own settings), look outside the folders he may read,
// or send anything anywhere. Without meaning search it keeps no index and doesn't run in the background. The search is a walk done when asked,
// capped in files, size and time, and the words of recently read documents are kept in memory only while Bob runs.
import fs from 'node:fs';
import path from 'node:path';
import { insideAny } from './config.js';
import { isSensitive } from './tools.js';
import { DOC_EXT, MAX_DOC_BYTES, docText } from './doc-text.js';
import { docMeaningOn } from './doc-index.js';
import { docPlacesOn, placeOf, placeWords, inVault, obsidianText } from './doc-more.js'; // items 91 and 92, off by default

export const docToolsOn = (cfg) => cfg?.docTools === true;
export const TEXT_EXT = ['txt', 'md', 'markdown', 'csv', 'tsv', 'json', 'log', 'html', 'htm', 'xml', 'yml', 'yaml', 'ini', 'toml', 'tex', 'srt', 'vtt'];
export const LIMITS = { files: 5000, hits: 30, ms: 25000, textBytes: 5 * 1024 * 1024, docBytes: 25 * 1024 * 1024, cache: 300, depth: 12 };
const SKIP_DIRS = new Set(['node_modules', '.git', '.svn', '.hg', '__pycache__', '$recycle.bin', 'system volume information', 'appdata', '.cache', 'library', '.trash', 'binaries', 'intermediate', 'deriveddatacache']);

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const extOf = (f) => path.extname(f).slice(1).toLowerCase();
const terms = (q) => String(q || '').toLowerCase().split(/\s+/).map((w) => w.replace(/^["']|["']$/g, '')).filter((w) => w.length > 1).slice(0, 8);

// Words of documents read lately: path -> { key, text }. Memory only, the oldest dropped first.
const cache = new Map();
function wordsOf(file, st, read = docText) {
  const key = `${st.size}:${st.mtimeMs}`;
  const was = cache.get(file);
  if (was && was.key === key) { cache.delete(file); cache.set(file, was); return was.text; }
  let text = '';
  try { text = read(file); } catch { text = ''; }
  cache.set(file, { key, text: text.slice(0, 400000) });
  while (cache.size > LIMITS.cache) cache.delete(cache.keys().next().value);
  return text;
}
export const clearDocCache = () => cache.clear();
export const forgetWords = (file) => cache.delete(file); // "Keep my documents fresh": a changed file is read again

function snippet(text, ts, n = 200) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const i = Math.max(0, s.toLowerCase().indexOf(ts[0]) - 60);
  return (i ? '…' : '') + s.slice(i, i + n) + (s.length > i + n ? '…' : '');
}

// Walk the folders Bob may read, the same way for a word search and the meaning index: hidden, lock and secret files
// and program folders skipped, capped in depth, files and time. visit(file, stat, ext) may return a word to stop
// (the word comes back as stopped). Returns { scanned, stopped }.
export async function walkFiles(cfg, roots, want, visit, { signal, now = () => Date.now(), ms = LIMITS.ms, files = LIMITS.files } = {}) {
  const start = now();
  let scanned = 0, stopped = '', tick = 0;
  const walk = async (dir, depth) => {
    if (stopped || depth > LIMITS.depth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (stopped) return;
      if (signal?.aborted) { stopped = 'stopped'; return; }
      if (scanned >= files) { stopped = 'files'; return; }
      if (now() - start > ms) { stopped = 'time'; return; }
      const full = path.join(dir, e.name);
      if (e.name.startsWith('.') || e.name.startsWith('~$')) continue; // hidden files and Office's lock files
      if (isSensitive(cfg, full)) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) await walk(full, depth + 1); continue; }
      if (!e.isFile()) continue;
      const ext = extOf(e.name);
      if (!want.includes(ext)) continue;
      scanned++;
      if (++tick % 25 === 0) await new Promise((r) => setImmediate(r)); // let Bob answer other things meanwhile
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      const r = await visit(full, st, ext);
      if (typeof r === 'string' && r) { stopped = r; return; }
    }
  };
  for (const r of roots) { if (stopped) break; await walk(r, 0); }
  return { scanned, stopped };
}

// The words of a file, within the size limits ('' when too big or unreadable). Documents go through the cache.
// cfg: with an Obsidian vault picked (Search my notes apps too), its notes are read without links' brackets and tags' #.
export function readWords(file, st, read, cfg = null) {
  const isDocFile = DOC_EXT.includes(extOf(file));
  if (isDocFile ? st.size > Math.min(LIMITS.docBytes, MAX_DOC_BYTES) : st.size > LIMITS.textBytes) return '';
  if (isDocFile) return wordsOf(file, st, read);
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return ''; }
  return cfg && inVault(cfg, file) ? obsidianText(text) : text;
}

// The search itself. roots: folders to walk. Returns { hits: [{ file, where, snippet }], scanned, stopped }.
export async function findInDocuments(cfg, roots, q, { kind = 'any', signal, now = () => Date.now(), read, readPdf } = {}) {
  const ts = terms(q);
  if (!ts.length) throw new Error('Give me a word or two to look for (at least 2 letters).');
  const want = kind === 'documents' ? DOC_EXT : kind === 'text' ? TEXT_EXT : [...DOC_EXT, ...TEXT_EXT];
  const hits = [];
  const { scanned, stopped } = await walkFiles(cfg, roots, want, (full, st) => {
    if (hits.length >= LIMITS.hits) return 'hits';
    const name = path.basename(full).toLowerCase().replace(/[-_.]/g, ' ');
    const text = readWords(full, st, read, cfg);
    const low = text.toLowerCase();
    if (!ts.every((w) => low.includes(w) || name.includes(w))) return;
    const inText = ts.some((w) => low.includes(w));
    const first = ts.find((w) => low.includes(w));
    // "Show the page and line" (doc-more.js): where in the file, for the first 10 finds (a PDF is read again for its pages).
    const place = inText && docPlacesOn(cfg) && hits.length < 10 ? placeOf(full, text, first, readPdf ? { readPdf } : {}) : null;
    hits.push({ file: full, where: inText ? 'inside' : 'name', snippet: inText ? snippet(text, ts.filter((w) => low.includes(w))) : '', place });
  }, { signal, now });
  return { hits, scanned, stopped };
}

// The meaning finds that the word search didn't already give, with a snippet read from the file now.
function meaningHits(list, hits, kind, cfg = null) {
  if (!list?.length) return '';
  const have = new Set(hits.map((h) => h.file));
  const want = kind === 'documents' ? DOC_EXT : kind === 'text' ? TEXT_EXT : null;
  const rows = [];
  for (const m of list) {
    if (have.has(m.file) || (want && !want.includes(extOf(m.file)))) continue;
    let st;
    try { st = fs.statSync(m.file); } catch { continue; }
    const text = readWords(m.file, st, undefined, cfg).slice(m.at, m.at + m.len).replace(/\s+/g, ' ').trim();
    rows.push(`${m.file} (${Math.round(m.score * 100)}% alike)${text ? `\n  ${text.slice(0, 200)}${text.length > 200 ? '…' : ''}` : ''}`);
  }
  return rows.join('\n');
}

const STOPPED = { hits: 'I stopped at the first 30 finds.', files: `I stopped after ${LIMITS.files} files.`, time: 'I stopped after 25 seconds.', stopped: 'Stopped.' };

// keeper(): the housekeeper, for "Search my documents by meaning" (doc-index.js); leave out for words only.
export function findDocsTool(cfg, { keeper = () => null } = {}) {
  return {
    schema: fn('find_in_documents', 'Search inside {{USER}}\'s files (Word, Excel, PowerPoint, PDF, e-books, text) and file names, in folders you may read. With meaning search on, also finds files that mean the same in other words. Gives each file with the matching line; open one with read_file.', {
      words: str('Every word must be in the file, any order.'),
      folder: str('Optional: one folder (full path). Default all you may read.'),
      kind: str('Optional: documents, text or any (default).', { enum: ['any', 'documents', 'text'] })
    }, ['words']),
    async run({ words, folder, kind }, ctx = {}) {
      if (!docToolsOn(cfg)) return 'Searching inside documents is off. It\'s in Settings, How Bob works: "Read and search my documents".';
      let roots = (cfg.readRoots || []).filter((r) => r !== cfg.innDir);
      if (folder) {
        if (!path.isAbsolute(String(folder))) throw new Error('Give the folder as a full path.');
        const f = path.resolve(String(folder));
        if (!insideAny(cfg.readRoots, f)) throw new Error(`I'm not allowed to look in ${f}. I may read: ${(cfg.readRoots || []).join('; ')}`);
        if (isSensitive(cfg, f)) throw new Error('That folder holds keys or passwords, so it stays off-limits.');
        roots = [f];
      }
      if (!roots.length) return 'There are no folders of yours I may read on this replicant matrix (no Documents, Desktop or Downloads folder).';
      const meaning = docMeaningOn(cfg) ? Promise.resolve(keeper()?.docsByMeaning(words, folder ? roots : null)).catch(() => null) : null;
      const r = await findInDocuments(cfg, roots, words, { kind: kind || 'any', signal: ctx.signal });
      const tail = [r.stopped ? STOPPED[r.stopped] : '', `${r.scanned} ${r.scanned === 1 ? 'file' : 'files'} looked at.`].filter(Boolean).join(' ');
      const at = (h) => (h.place ? ` (${placeWords(h.place)})` : '');
      const found = r.hits.length ? `${r.hits.map((h) => `${h.file}${h.where === 'name' ? ' (in the name)' : `${at(h)}\n  ${h.snippet}`}`).join('\n')}\n\n${tail}${r.hits.some((h) => h.place) ? '\nWhen you name one of these files in your answer, keep its place right after the path, like "(page 3)", so a click opens it there.' : ''}` : `Nothing has all of "${words}". ${tail}`;
      const near = meaningHits(await meaning, r.hits, kind, cfg);
      if (!near) return found + (meaning && !(await meaning) ? '\n(Meaning search isn\'t ready: the document index is empty or still being made, or the Memory slot\'s embedding model isn\'t on this replicant matrix.)' : '');
      return `${found}\n\nClose in meaning (other words, same idea):\n${near}`;
    },
    summary: ({ words, folder }) => `search my documents for "${words}"${folder ? ` in ${folder}` : ''}`
  };
}
