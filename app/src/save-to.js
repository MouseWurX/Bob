// "save_to" (Nov 15, ready-made tools study): the 5 save tools (make_image, make_music, make_video, make_sound,
// save_as) and make_diagram can be told where to keep the file. Before this they had no output folder or name, so
// a brain asked for "logo.png in Pictures" made the file under an automatic name and then said it was saved where
// asked: 62 of GPT-OSS's traced failures, and the same in Riker's coached lessons.
// The made file stays in Bob's own folder as before; a copy goes to save_to, through the same "may Bob save here?"
// rule as every other tool (canWrite: the Hands folders and Bob's Documents folder). Nothing is overwritten. A
// different ending (".jpg" for a painted PNG) is converted with Save as first. Every result starts with
// "Saved: <path>" or "Error: ...", so the brain reads what really happened, and the path it reports is the real one.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canWrite, officeDir } from './hands-office.js';
import { freeName } from './util.js';

export const SAVE_TO_HELP = 'Optional: where to keep a copy, like ~/Pictures/logo.png.';

// Where save_to points. ~ is the home folder; a bare name goes in Bob's Documents folder; a folder path without a
// file name keeps the made file's name; a path under the home folder ("Pictures/logo.png") is taken from home.
export function whereTo(cfg, saveTo, madeName, { home = os.homedir() } = {}) {
  let p = String(saveTo || '').trim().replace(/^["']|["']$/g, '');
  if (!p) return null;
  if (/^~(?:[\\/]|$)/.test(p)) p = path.join(home, p.slice(1));
  else if (!path.isAbsolute(p) && !/^[a-zA-Z]:[\\/]/.test(p)) p = /[\\/]/.test(p) ? path.join(home, p) : path.join(officeDir(cfg), p);
  if (/[\\/]$/.test(p) || !path.extname(p)) p = path.join(p, madeName);
  return path.resolve(p);
}

const extOf = (f) => path.extname(String(f || '')).slice(1).toLowerCase().replace(/^jpeg$/, 'jpg');

// Copy (or convert, then copy) one made file to save_to. Returns { path } or throws a plain message.
// convert(name, format) is Save as (save-as.js saveAs), passed in so tests need no converter.
export async function keepAt(cfg, made, saveTo, { convert, home } = {}) {
  if (!made || !fs.existsSync(made)) throw new Error('the file I made isn\'t there any more');
  let src = made;
  let dest = whereTo(cfg, saveTo, path.basename(made), { home });
  if (!dest) return null;
  const want = extOf(dest), have = extOf(made);
  if (want && want !== have) {
    if (!convert) throw new Error(`I can't turn a .${have} into a .${want}`);
    const r = await convert(path.basename(made), want);
    if (!r?.file) throw new Error(r?.need === 'ffmpeg' ? `turning it into .${want} needs FFmpeg (Settings, Hands, Office)` : `I couldn't turn it into .${want}`);
    src = r.file;
  }
  dest = canWrite(cfg, freeName(dest));
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
  return { path: dest };
}

// The line that opens a tool's result: the real path, or why not. A taken name gets "-2" and says so.
export function savedLine(asked, r, err) {
  if (err) return `Error: not saved to ${asked} (${err.message || err}). The file is still in the chat. Tell the user the real reason.`;
  if (!r) return '';
  const moved = path.basename(r.path) !== path.basename(String(asked || '')) && path.extname(String(asked || '')) ? ` (${path.basename(String(asked))} was taken, so it's ${path.basename(r.path)})` : '';
  return `Saved: ${r.path}${moved}`;
}

// For a tool: make the thing, then keep it at save_to. newest() finds what the call made (Bob's made list).
export async function withSaveTo(cfg, args, run, { newest, convert, since = Date.now() }) {
  const out = await run();
  if (!args?.save_to) return out;
  const made = newest(since);
  if (!made) return `Error: nothing was made, so nothing was saved to ${args.save_to}.\n${out}`;
  let r = null, err = null;
  try { r = await keepAt(cfg, made, args.save_to, { convert }); } catch (e) { err = e; }
  return `${savedLine(args.save_to, r, err)}\n${out}`;
}
