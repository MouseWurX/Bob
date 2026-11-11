// Made by Bob: one list of everything Bob has made or saved for the user (pictures, clips, sounds,
// documents, spreadsheets, zips, copies), so any of it can be called up again in his window.
// The list lives in inn\bob\made.json (newest first, at most 400). Pictures in the painter folder that
// aren't in the list (older ones, or made before this list existed) are added from the folder itself.
import fs from 'node:fs';
import { writeJsonAtomic } from './util.js';
import path from 'node:path';
import { describe, allowedFile } from './files.js';

const MAX = 400;
const MEDIA = /\.(png|jpe?g|webp|gif|mp4|webm|mov|wav|mp3|ogg|flac|m4a|stl|glb)$/i;
// The kinds the panel and show_made sort by.
export const KINDS = ['image', 'video', 'audio', 'document', 'model', 'folder', 'file'];

export function kindOf(d) {
  if (!d?.ok) return 'file';
  if (d.kind === 'text') return 'document';
  if (d.kind === 'file' && /\.(pdf|docx?|xlsx?|pptx?|odt|ods|odp|rtf)$/i.test(d.name)) return 'document';
  if (d.kind === 'file' && /\.(stl|obj|glb)$/i.test(d.name)) return 'model'; // 3D models: the side panel's 3D viewer (public/model-core.js)
  return d.kind;
}

// Paths a tool's result says it saved, e.g. "Saved C:\...\list.csv (4 lines)". Only for tools that make files.
const SAVERS = new Set(['write_file', 'edit_file', 'save_spreadsheet', 'convert_file', 'office_make', 'office_edit', 'strip_metadata']);
const WIN_PATH = /[A-Za-z]:\\[^\n\r"<>|*?]*?\.[A-Za-z0-9]{1,8}(?=$|[\s.,;:)'"]|\.\s)/g;
const POSIX_PATH = /(?:^|\s)(\/[^\s"'<>]+\.[A-Za-z0-9]{1,8})(?=$|[\s.,;:)'"])/g;
export function pathsIn(text) {
  const s = String(text || '');
  return [...new Set([...(s.match(WIN_PATH) || []), ...[...s.matchAll(POSIX_PATH)].map((m) => m[1])].map((p) => p.replace(/[.,;:]+$/, '')))];
}
export function madePaths(name, text) {
  if (!SAVERS.has(name) || /^Error|said no/i.test(String(text || ''))) return [];
  return pathsIn(text).slice(0, 6);
}

export class Made {
  constructor(cfg) {
    this.cfg = cfg;
    this.file = path.join(cfg.dataDir, 'made.json');
  }

  load() {
    try { const j = JSON.parse(fs.readFileSync(this.file, 'utf8')); return Array.isArray(j) ? j : []; } catch { return []; }
  }

  save(list) {
    try { writeJsonAtomic(this.file, list.slice(0, MAX)); } catch {}
  }

  // Add one file Bob made. Returns what the chat shows for it (or null if it isn't there or isn't allowed).
  // song (1.5.41): a song's or sound's title, style and lyrics, for its player in the chat (songInfo).
  add(file, { tool = '', chat = '', song = null } = {}) {
    const d = describe(this.cfg, file);
    if (!d.ok) return null;
    const list = this.load().filter((x) => path.resolve(x.path).toLowerCase() !== path.resolve(d.path).toLowerCase());
    const s = cleanSong(song);
    list.unshift({ path: d.path, at: Date.now(), tool: String(tool).slice(0, 40), chat: String(chat).slice(0, 80), ...(s ? { song: s } : {}) });
    this.save(list);
    return view(d, list[0]);
  }

  // Whether Bob made (or saved) this file.
  has(file) {
    const key = path.resolve(String(file || '')).toLowerCase();
    return this.load().some((x) => path.resolve(x.path).toLowerCase() === key);
  }

  // What the list knows about one song or sound (title, style, lyrics, music or sfx), or null.
  songInfo(file) {
    const key = path.resolve(String(file || '')).toLowerCase();
    return this.load().find((x) => path.resolve(x.path).toLowerCase() === key)?.song || null;
  }

  // Newest first. kind: image / video / audio / document / model / folder / file (or empty for all). q: words in the name.
  list({ kind = '', q = '', limit = 60 } = {}) {
    const seen = new Set();
    const rows = [];
    for (const x of this.load()) {
      const key = path.resolve(x.path).toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ ...x });
    }
    // Pictures, clips and sounds in the painter folder that the list doesn't know about yet.
    try {
      // 1.5.41: Bob's own folder only. A folder the user picked for saving can hold their own files, which
      // aren't "made by Bob"; what he saves there is on the list already (add()).
      const own = this.cfg.defaultPainterDir || this.cfg.painterDir;
      for (const n of fs.readdirSync(own)) {
        if (!MEDIA.test(n)) continue;
        const p = path.join(own, n);
        const key = path.resolve(p).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        let at = 0;
        try { at = fs.statSync(p).mtimeMs; } catch { continue; }
        rows.push({ path: p, at, tool: 'painter' });
      }
    } catch {}
    rows.sort((a, b) => b.at - a.at);
    const words = String(q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const out = [];
    for (const x of rows) {
      if (out.length >= limit) break;
      if (words.length && !words.every((w) => path.basename(x.path).toLowerCase().includes(w))) continue;
      if (!allowedFile(this.cfg, x.path)) continue;
      const d = describe(this.cfg, x.path);
      if (!d.ok) continue;
      const v = view(d, x);
      if (kind && v.kind !== kind) continue;
      out.push(v);
    }
    return out;
  }
}

// 1.5.41: what a song card shows. Short plain text only; lyrics at most 4000 characters.
export function cleanSong(song) {
  if (!song || typeof song !== 'object') return null;
  const line = (v, n) => String(v || '').replace(/[\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, n);
  const out = { title: line(song.title, 80), style: line(song.style, 200), sound: song.sound === 'sfx' ? 'sfx' : 'music' };
  const lyrics = String(song.lyrics || '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b-\u001f]/g, '').trim().slice(0, 4000);
  if (lyrics) out.lyrics = lyrics;
  return out.title || out.style || out.lyrics ? out : null;
}

function view(d, x) {
  return { type: 'file', kind: kindOf(d), name: d.name, path: d.path, url: d.url, bytes: d.bytes, canOpen: d.canOpen, at: x.at, tool: x.tool || '', ...(x.song?.title ? { title: x.song.title, sound: x.song.sound } : {}) };
}

const WORDS = { picture: 'image', pictures: 'image', image: 'image', images: 'image', photo: 'image', pic: 'image', video: 'video', clip: 'video', clips: 'video', sound: 'audio', sounds: 'audio', song: 'audio', music: 'audio', audio: 'audio', document: 'document', documents: 'document', doc: 'document', spreadsheet: 'document', model: 'model', models: 'model', '3d': 'model', stl: 'model', part: 'model', parts: 'model', file: '', files: '', anything: '' };

// show_made: call up something Bob already made, in the chat and in the side panel. Always in the core
// tools (about 90 tokens), so "show me the last picture" works without adding a group first.
export function showMadeTool(brain) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'show_made',
        description: 'Show {{USER}} things you ALREADY made or saved (pictures, clips, sounds, documents, files), newest first, in the chat and the side panel. For a new picture use make_image instead.',
        parameters: {
          type: 'object',
          properties: {
            kind: { type: 'string', enum: ['image', 'video', 'audio', 'document', 'model', 'any'], description: 'What kind (default any; model = a 3D model)' },
            name: { type: 'string', description: 'Words from the file name (optional)' },
            count: { type: 'integer', description: 'How many, newest first (default 1, at most 6)' }
          },
          required: []
        }
      }
    },
    async run(args = {}, ctx) {
      let kind = String(args.kind || '').toLowerCase().trim();
      if (kind in WORDS) kind = WORDS[kind];
      if (kind === 'any' || !KINDS.includes(kind)) kind = '';
      const count = Math.max(1, Math.min(6, Number(args.count) || 1));
      const items = brain.made.list({ kind, q: args.name || '', limit: count });
      if (!items.length) return `Nothing like that made yet${kind ? ` (no ${kind === 'image' ? 'pictures' : kind === 'model' ? '3D models' : kind + 's'})` : ''}${args.name ? ` with "${args.name}" in the name` : ''}. Say so plainly.`;
      ctx?.emit?.({ type: 'made', items, show: true });
      return `Shown to ${brain.cfg.userName || 'the user'} in the chat and the side panel: ${items.map((x) => `${x.name} (${when(x.at)})`).join('; ')}. Say in one short line what it is; don't paste paths or links.`;
    },
    summary: ({ kind, name } = {}) => `showing ${name ? `"${name}"` : { image: 'the latest picture', video: 'the latest clip', audio: 'the latest sound', document: 'the latest document', model: 'the latest 3D model' }[kind] || 'what I made'}`
  };
}

function when(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 2) return 'just now';
  if (m < 60) return `${m} minutes ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  return new Date(t).toISOString().slice(0, 10);
}
