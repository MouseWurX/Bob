// 1.5.95 "Save as": every picture, clip, song, sound and diagram Bob makes can be kept in another file type.
// The chat shows a Save as row under each one; a type named in the ask ("a song as an mp3") is saved straight away.
// Pictures, clips and sounds are converted here (FFmpeg; Windows and Mac convert PNG/JPG/GIF themselves). Diagrams
// are turned into files by the window that drew them (diagram.js saveExport). The original is always kept.
import fs from 'node:fs';
import path from 'node:path';
import { findOutput, outputDirs } from './config.js';
import { findFfmpeg, pictureJob, mediaJob } from './office.js';

// The file types offered for each kind of thing Bob makes, in the order the row shows them.
export const SAVE_AS = {
  image: ['png', 'jpg', 'webp', 'gif'],
  video: ['mp4', 'webm', 'gif'],
  audio: ['wav', 'mp3', 'ogg', 'flac'],
  diagram: ['png', 'svg', 'pdf']
};
// What each type is good for, for the row's tooltips and Bob's words.
export const TYPE_NOTE = {
  png: 'sharp, no quality lost', jpg: 'small, for photos', webp: 'small, for the web', gif: 'plays anywhere, low colour',
  mp4: 'plays anywhere', webm: 'small, for the web', wav: 'full quality, large', mp3: 'small, plays anywhere', ogg: 'small, open format', flac: 'full quality, smaller than WAV',
  svg: 'scales to any size', pdf: 'for printing and sharing'
};
const EXT_KIND = { png: 'image', jpg: 'image', jpeg: 'image', webp: 'image', gif: 'image', bmp: 'image', mp4: 'video', webm: 'video', mov: 'video', wav: 'audio', mp3: 'audio', ogg: 'audio', flac: 'audio', m4a: 'audio', mmd: 'diagram' };
const extOf = (f) => path.extname(String(f || '')).slice(1).toLowerCase();
const MAC = process.platform === 'darwin', WIN = process.platform === 'win32';
const BUILT_IN = ['png', 'jpg', 'jpeg', 'gif', 'bmp']; // pictures Windows and Mac convert without FFmpeg

export const kindOfMade = (name) => EXT_KIND[extOf(name)] || null;

// A file type named in the user's words: "as an mp3", "in jpg", "a png of", "mp3 please". '' when none is named.
const TYPE_WORDS = { png: 'png', jpg: 'jpe?g', webp: 'webp', gif: 'gif', mp4: 'mp4', webm: 'webm', wav: 'wav', mp3: 'mp3', ogg: 'ogg', flac: 'flac', svg: 'svg', pdf: 'pdf' };
export function namedType(text) {
  const t = String(text || '');
  for (const [ext, w] of Object.entries(TYPE_WORDS)) {
    if (new RegExp(`\\b(?:as|in|into|to|save (?:it|that|this|them) as)\\s+(?:an?\\s+)?\\.?${w}\\b|\\.?\\b${w}\\s+(?:file|format|please|version)\\b|\\b${w}\\s+of\\b`, 'i').test(t)) return ext;
  }
  return '';
}

// Is this a name Bob made, in one of his folders? The full path, or null.
function madeFile(cfg, name) {
  const base = path.basename(String(name || ''));
  if (!base || base.startsWith('.')) return null;
  const f = findOutput(cfg, base);
  if (!fs.existsSync(f)) return null;
  const dirs = outputDirs(cfg).map((d) => path.resolve(d).toLowerCase());
  return dirs.includes(path.resolve(path.dirname(f)).toLowerCase()) ? f : null;
}

// Does this conversion need FFmpeg on this replicant matrix?
export function needsFfmpeg(from, to) {
  if (EXT_KIND[from] === 'image' && EXT_KIND[to] === 'image') return !((WIN || MAC) && BUILT_IN.includes(from) && BUILT_IN.includes(to));
  return true;
}

// Keep one of Bob's files as another type. Returns { file, name, url, kind } (the existing file when it's already there),
// or { need: 'ffmpeg' } when FFmpeg is missing. Throws a plain message otherwise.
// Tests pass run (the converters) and ffmpeg (found or null) instead of the real ones.
export async function saveAs(cfg, { name, format }, { signal, env = process.env, run = { pictureJob, mediaJob }, ffmpeg: found } = {}) {
  const src = madeFile(cfg, name);
  if (!src) throw new Error('That isn\'t something Bob made (or it was moved).');
  const kind = kindOfMade(src);
  const to = String(format || '').toLowerCase().replace(/^jpeg$/, 'jpg');
  if (!kind || kind === 'diagram') throw new Error('Diagrams are saved by the window that drew them.');
  if (!SAVE_AS[kind].includes(to)) throw new Error(`${kind === 'image' ? 'Pictures' : kind === 'video' ? 'Clips' : 'Songs and sounds'} can be saved as ${SAVE_AS[kind].join(', ').toUpperCase()}.`);
  const from = extOf(src);
  const out = src.slice(0, -path.extname(src).length) + '.' + to;
  const done = () => ({ file: out, name: path.basename(out), url: `/images/${encodeURIComponent(path.basename(out))}`, kind: kindOfMade(out) === 'video' && to === 'gif' ? 'image' : kindOfMade(out) });
  if (from === to || (from === 'jpeg' && to === 'jpg')) return { file: src, name: path.basename(src), url: `/images/${encodeURIComponent(path.basename(src))}`, kind };
  if (fs.existsSync(out) && fs.statSync(out).size > 0) return done();
  const ffmpeg = found !== undefined ? found : findFfmpeg(cfg, env);
  if (needsFfmpeg(from, to) && !ffmpeg) return { need: 'ffmpeg' };
  if (kind === 'image') await run.pictureJob({ src, out }, { signal, ffmpeg });
  else await run.mediaJob({ src, out }, { signal, ffmpeg });
  if (!fs.existsSync(out) || !fs.statSync(out).size) throw new Error('The converter finished but left no file.');
  return done();
}

// save_as: for "save that song as an mp3" after the fact. "last" = the newest thing Bob made of a kind that fits.
export function saveAsTool() {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'save_as',
        description: 'Keep a picture, clip, song or sound you made as another file type (the original stays). Pictures: png, jpg, webp, gif. Clips: mp4, webm, gif. Songs and sounds: wav, mp3, ogg, flac. Diagrams: the Save as row under the diagram does it.',
        parameters: { type: 'object', properties: {
          name: { type: 'string', description: 'The file name you made (like 2026-11-04-ab12cd34.wav), or "last" for the newest thing that can be that type.' },
          format: { type: 'string', enum: ['png', 'jpg', 'webp', 'gif', 'mp4', 'webm', 'wav', 'mp3', 'ogg', 'flac'] }
        }, required: ['name', 'format'] }
      }
    },
    async run({ name, format }, ctx) {
      const brain = ctx.brain;
      let n = String(name || '').trim();
      const to = String(format || '').toLowerCase();
      if (!n || /^(?:the )?(?:last|latest|newest)\b/i.test(n)) {
        const kinds = Object.entries(SAVE_AS).filter(([k, list]) => k !== 'diagram' && list.includes(to)).map(([k]) => k);
        const last = kinds.flatMap((k) => brain.made.list({ kind: k, limit: 1 })).sort((a, b) => b.at - a.at)[0];
        if (!last) return `There's nothing I made yet that can be saved as ${to.toUpperCase()}.`;
        n = last.name || path.basename(last.path);
      }
      const r = await saveAs(ctx.cfg, { name: n, format: to }, { signal: ctx.signal, ...(brain.saveAsOpts || {}) });
      if (r.need === 'ffmpeg') return brain.offerSetup('ffmpeg', ctx);
      ctx.emit({ type: 'made', items: [{ kind: r.kind, url: r.url, name: r.name, path: r.file }] });
      try { brain.made.add(r.file, { tool: 'save_as', chat: ctx.sessionId || '' }); } catch {}
      return `Saved ${path.basename(n)} as ${to.toUpperCase()}: ${r.file} (the original is kept). Tell the user in one line.`;
    },
    summary: ({ name, format }) => `save as ${String(format || '').toUpperCase()}: ${String(name || 'last').slice(0, 60)}`
  };
}
