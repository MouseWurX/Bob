// Read and search my documents (Settings, How Bob works; off unless the user turns it on).
//
// With it on:
//   - read_file reads Word, Excel, PowerPoint, OpenDocument, e-book, Rich Text and PDF files as text, with nothing
//     extra installed (doc-text.js). Off, read_file only reads plain text, as before.
//   - Bob gets find_in_documents: plain word search through the folders he may read (your Documents, Desktop
//     and Downloads unless config.json lists others), inside those documents as well as text files and in file names.
// What it never does: read secret files (keys, passwords, his own settings), look outside the folders he may read,
// keep an index on disk, run in the background or send anything anywhere. The search is a walk done when asked,
// capped in files, size and time, and the words of recently read documents are kept in memory only while Bob runs.
import fs from 'node:fs';
import path from 'node:path';
import { insideAny } from './config.js';
import { isSensitive } from './tools.js';
import { DOC_EXT, MAX_DOC_BYTES, docText } from './doc-text.js';

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

function snippet(text, ts, n = 200) {
  const s = String(text || '').replace(/\s+/g, ' ');
  const i = Math.max(0, s.toLowerCase().indexOf(ts[0]) - 60);
  return (i ? '…' : '') + s.slice(i, i + n) + (s.length > i + n ? '…' : '');
}

// The search itself. roots: folders to walk. Returns { hits: [{ file, where, snippet }], scanned, stopped }.
export async function findInDocuments(cfg, roots, q, { kind = 'any', signal, now = () => Date.now(), read } = {}) {
  const ts = terms(q);
  if (!ts.length) throw new Error('Give me a word or two to look for (at least 2 letters).');
  const want = kind === 'documents' ? DOC_EXT : kind === 'text' ? TEXT_EXT : [...DOC_EXT, ...TEXT_EXT];
  const hits = [];
  const start = now();
  let scanned = 0, stopped = '', tick = 0;
  const walk = async (dir, depth) => {
    if (stopped || depth > LIMITS.depth) return;
    let entries = [];
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (stopped) return;
      if (signal?.aborted) { stopped = 'stopped'; return; }
      if (hits.length >= LIMITS.hits) { stopped = 'hits'; return; }
      if (scanned >= LIMITS.files) { stopped = 'files'; return; }
      if (now() - start > LIMITS.ms) { stopped = 'time'; return; }
      const full = path.join(dir, e.name);
      if (e.name.startsWith('.') || e.name.startsWith('~$')) continue; // hidden files and Office's lock files
      if (isSensitive(cfg, full)) continue;
      if (e.isDirectory()) { if (!SKIP_DIRS.has(e.name.toLowerCase())) await walk(full, depth + 1); continue; }
      if (!e.isFile()) continue;
      const ext = extOf(e.name);
      if (!want.includes(ext)) continue;
      scanned++;
      if (++tick % 25 === 0) await new Promise((r) => setImmediate(r)); // let Bob answer other things meanwhile
      const name = e.name.toLowerCase().replace(/[-_.]/g, ' ');
      let st;
      try { st = fs.statSync(full); } catch { continue; }
      let text = '';
      const isDocFile = DOC_EXT.includes(ext);
      if (isDocFile ? st.size <= Math.min(LIMITS.docBytes, MAX_DOC_BYTES) : st.size <= LIMITS.textBytes) {
        if (isDocFile) text = wordsOf(full, st, read);
        else { try { text = fs.readFileSync(full, 'utf8'); } catch {} }
      }
      const low = text.toLowerCase();
      if (!ts.every((w) => low.includes(w) || name.includes(w))) continue;
      const inText = ts.some((w) => low.includes(w));
      hits.push({ file: full, where: inText ? 'inside' : 'name', snippet: inText ? snippet(text, ts.filter((w) => low.includes(w))) : '' });
    }
  };
  for (const r of roots) await walk(r, 0);
  return { hits, scanned, stopped };
}

const STOPPED = { hits: 'I stopped at the first 30 finds.', files: `I stopped after ${LIMITS.files} files.`, time: 'I stopped after 25 seconds.', stopped: 'Stopped.' };

export function findDocsTool(cfg) {
  return {
    schema: fn('find_in_documents', 'Search {{USER}}\'s own files for words: inside Word, Excel, PowerPoint, OpenDocument, PDF, e-book and text files, and in file names, in the folders you may read. Gives each file with the line it was found in; read one with read_file.', {
      words: str('The words to look for. Every word must be in the file (any order).'),
      folder: str('Optional: one folder to search (full path). Leave out to search every folder you may read.'),
      kind: str('Optional: documents (Word, PDF...), text (plain text files) or any. Default any.', { enum: ['any', 'documents', 'text'] })
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
      const r = await findInDocuments(cfg, roots, words, { kind: kind || 'any', signal: ctx.signal });
      const tail = [r.stopped ? STOPPED[r.stopped] : '', `${r.scanned} ${r.scanned === 1 ? 'file' : 'files'} looked at.`].filter(Boolean).join(' ');
      if (!r.hits.length) return `Nothing has all of "${words}". ${tail}`;
      return `${r.hits.map((h) => `${h.file}${h.where === 'name' ? ' (in the name)' : `\n  ${h.snippet}`}`).join('\n')}\n\n${tail}`;
    },
    summary: ({ words, folder }) => `search my documents for "${words}"${folder ? ` in ${folder}` : ''}`
  };
}
