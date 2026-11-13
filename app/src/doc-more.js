// Documents, three more switches (Nov 11 list, items 90 to 92). Each is off unless the user turns it on, in Settings,
// How Bob works, under "Read and search documents". Nothing is sent anywhere and nothing new runs in the background
// except the folder watch below, which only listens for the system's "this file changed" notes.
//
//  90 "Live document index" (docFresh, works with Semantic document search): Bob listens for changes in the
//     folders he may read. A document that's saved, added or deleted is read again (or dropped) within a minute or so,
//     instead of waiting for him to be idle for 10 minutes. Never in the Gaming session, and never while he's answering.
//  91 "Cite page and line" (docPlaces): find_in_documents says where in a file each find is: the page of a PDF,
//     the slide of a presentation, the sheet of a spreadsheet, the paragraph of a Word file, the line of a text file.
//     In the chat that place is a link that opens the file in the side panel at that spot.
//  92 "Search my notes apps too" (notesFolders): an Obsidian vault, or OneNote notebooks exported to a folder, joins
//     the folders find_in_documents (and the meaning index) search. Obsidian's [[links]], #tags and the settings block
//     at the top of a note are tidied out of what Bob reads. OneNote keeps its notebooks in its own closed format
//     (or online), so Bob reads them once they're exported (File, Export, as Word or PDF) into the folder picked.
import fs from 'node:fs';
import path from 'node:path';
import { isSensitive } from './tools.js';
import { insideAny } from './config.js';
import { DOC_EXT, pdfPages } from './doc-text.js';
import { cleanNotesFolders } from './notes-folders.js';

export const docFreshOn = (cfg) => cfg?.docFresh === true && cfg?.docTools === true && cfg?.docMeaning === true;
export const docPlacesOn = (cfg) => cfg?.docPlaces === true && cfg?.docTools === true;
export const notesOn = (cfg) => cfg?.docTools === true && cleanNotesFolders(cfg?.notesFolders).length > 0;

const extOf = (f) => path.extname(String(f)).slice(1).toLowerCase();

// ---- 92: notes apps ----
export { NOTES_KINDS, cleanNotesFolders } from './notes-folders.js';
// Does this folder look like an Obsidian vault? (It has a .obsidian folder.)
export const isVault = (dir, { exists = (p) => fs.existsSync(p) } = {}) => exists(path.join(String(dir || ''), '.obsidian'));

// An Obsidian note as plain words: the settings block at the top goes, [[Note|shown words]] becomes the shown words,
// ![[picture.png]] embeds go, and #tags lose the #.
export function obsidianText(md) {
  return String(md || '')
    .replace(/^﻿?---\r?\n[\s\S]*?\r?\n---\r?\n/, '')
    .replace(/!\[\[[^\]]*\]\]/g, '')
    .replace(/\[\[([^\]|#]*)(?:#[^\]|]*)?\|([^\]]+)\]\]/g, '$2')
    .replace(/\[\[([^\]|#]+)(?:#[^\]]*)?\]\]/g, '$1')
    .replace(/(^|\s)#([\p{L}\p{N}_/-]+)/gu, '$1$2');
}
// Is this file in one of the Obsidian vaults picked? (Only those notes are tidied.)
export function inVault(cfg, file) {
  const vaults = cleanNotesFolders(cfg?.notesFolders).filter((n) => n.kind === 'obsidian').map((n) => n.path);
  return vaults.length > 0 && /\.(md|markdown)$/i.test(String(file)) && insideAny(vaults, file);
}

// ---- 91: where in a file a find is ----
// text: the file's words as Bob read them. word: what was looked for. readPdf(file) -> the pages' words (tests pass a fake).
// Returns { kind: 'page'|'slide'|'sheet'|'paragraph'|'line', n?, name? } or null.
export function placeOf(file, text, word, { readPdf = (f) => pdfPages(fs.readFileSync(f)) } = {}) {
  const w = String(word || '').toLowerCase();
  if (!w) return null;
  const ext = extOf(file);
  if (ext === 'pdf') {
    let pages = [];
    try { pages = readPdf(file); } catch { return null; }
    const i = pages.findIndex((p) => String(p).toLowerCase().includes(w));
    return i >= 0 ? { kind: 'page', n: i + 1 } : null;
  }
  const s = String(text || '');
  const at = s.toLowerCase().indexOf(w);
  if (at < 0) return null;
  const before = s.slice(0, at);
  if (['pptx', 'ppsx', 'odp'].includes(ext)) {
    const m = [...before.matchAll(/(?:^|\n)Slide (\d+)\n/g)].pop();
    return m ? { kind: 'slide', n: Number(m[1]) } : null;
  }
  if (['xlsx', 'xlsm', 'ods'].includes(ext)) {
    const m = [...before.matchAll(/(?:^|\n)(?:Sheet|Table): ([^\n]+)\n/g)].pop();
    return m ? { kind: 'sheet', name: m[1].trim().slice(0, 60) } : null;
  }
  if (DOC_EXT.includes(ext)) return { kind: 'paragraph', n: before.split('\n').slice(0, -1).filter((l) => l.trim()).length + 1 };
  return { kind: 'line', n: before.split('\n').length };
}
// The words put after the file name: "page 3", "line 12", "sheet Budget".
export const placeWords = (p) => (!p ? '' : p.kind === 'sheet' ? `sheet ${p.name}` : `${p.kind} ${p.n}`);
// The same, read back from a reply ("(page 3)" after a path): { kind, n } or null. The chat and the panel use it.
export function parsePlace(s) {
  const m = String(s || '').match(/^\s*\((page|slide|line|paragraph) (\d{1,6})\)/i);
  return m ? { kind: m[1].toLowerCase(), n: Number(m[2]) } : null;
}

// ---- 90: listening for changed documents ----
// onChange(files) is called with the documents that changed, at most once every `wait` ms. watch is fs.watch (tests
// pass a fake). Folders where the system can't listen (some network drives) are simply left to the idle walk.
export class DocWatcher {
  constructor(cfg, onChange, { watch = fs.watch, wait = 20e3, exts = [] } = {}) {
    this.cfg = cfg; this.onChange = onChange; this.watch = watch; this.wait = wait; this.exts = new Set(exts);
    this.watchers = new Map(); this.pending = new Set(); this.timer = null;
  }
  get roots() { return [...this.watchers.keys()]; }
  // Listen to exactly these folders (the old ones that aren't in the list stop).
  sync(roots) {
    const want = new Set(roots);
    for (const [r, w] of this.watchers) if (!want.has(r)) { try { w.close(); } catch {} this.watchers.delete(r); }
    for (const r of want) {
      if (this.watchers.has(r)) continue;
      try {
        const w = this.watch(r, { recursive: true, persistent: false }, (type, name) => this.heard(r, name));
        w.on?.('error', () => { try { w.close(); } catch {} this.watchers.delete(r); });
        this.watchers.set(r, w);
      } catch { /* this folder can't be listened to here: the idle walk still catches its changes */ }
    }
    return this.roots;
  }
  heard(root, name) {
    if (!name) return;
    const file = path.join(root, String(name));
    const parts = String(name).split(/[\\/]/);
    if (parts.some((p) => p.startsWith('.') || p.startsWith('~$'))) return; // hidden files and Office's lock files
    if (!this.exts.has(extOf(file)) || isSensitive(this.cfg, file)) return;
    this.pending.add(file);
    if (this.pending.size > 500) this.pending = new Set([...this.pending].slice(-500));
    if (!this.timer) { this.timer = setTimeout(() => this.flush(), this.wait); this.timer.unref?.(); }
  }
  // Files that couldn't be done yet (Bob was answering): tried again after the next wait.
  again(files) {
    for (const f of files) this.pending.add(f);
    if (!this.timer && this.pending.size) { this.timer = setTimeout(() => this.flush(), this.wait); this.timer.unref?.(); }
  }
  flush() {
    this.timer = null;
    const files = [...this.pending];
    this.pending.clear();
    if (files.length) Promise.resolve(this.onChange(files)).catch(() => {});
    return files;
  }
  stop() { this.sync([]); if (this.timer) clearTimeout(this.timer); this.timer = null; this.pending.clear(); }
}
