// Files Bob mentions in his replies: previews in the chat, and Open, Show in folder and Copy for the user.
// Only files inside the inn folder or a folder Bob may read (Models and settings, projects) are served or
// opened, never secrets (keys, passwords, his config), and Open never starts a program or script.
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { insideAny, outputDirs, findOutput } from './config.js';
import { isSensitive } from './tools.js';

// Open works only for pictures, sounds, clips, documents and art files (an allowlist, so nothing that runs code
// on opening: programs, scripts, shortcuts, web pages, .blend files with their Python). Show in folder works for anything allowed.
const OPEN_OK = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif', '.bmp', '.tif', '.tiff', '.wav', '.mp3', '.ogg', '.flac', '.m4a', '.mp4', '.webm', '.mov', '.mkv', '.avi',
  '.txt', '.md', '.csv', '.tsv', '.json', '.log', '.pdf', '.docx', '.xlsx', '.pptx', '.odt', '.ods', '.odp', '.rtf', '.glb', '.gltf', '.obj', '.fbx', '.stl', '.psd', '.kra', '.xcf']);
// Files the side panel can show as text (the first part of them; never run).
export const TEXT_EXT = new Set(['.txt', '.md', '.csv', '.tsv', '.json', '.log', '.html', '.htm', '.css', '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.py', '.c', '.h', '.cpp', '.hpp', '.cs', '.rs', '.java', '.kt', '.kts', '.gradle', '.xml', '.yml', '.yaml', '.ini', '.cfg', '.toml', '.ps1', '.bat', '.cmd', '.sh', '.lua', '.gd', '.sql', '.svg', '.srt', '.vtt', '.scad']);
const PEEK_MAX = 256 * 1024;
const canOpen = (file, dir) => dir || OPEN_OK.has(path.extname(file).toLowerCase());

// A path from a reply: absolute, "inn\painter\x.png" (from the Bob folder), or just a file name Bob painted.
export function resolveMention(cfg, p) {
  let s = String(p || '').trim().replace(/^["'`]+|["'`.,;:!?)]+$/g, '');
  if (!s || s.length > 1000 || s.includes('\0')) return null;
  if (/^\/images\//.test(s)) s = findOutput(cfg, decodeURIComponent(s.slice(8).split('?')[0]));
  else if (/^inn[\\/]/i.test(s)) s = path.join(cfg.agentDir, s.replace(/^inn/i, 'inn'));
  else if (!path.isAbsolute(s) && !/^[a-zA-Z]:[\\/]/.test(s)) s = findOutput(cfg, s);
  return path.resolve(s.replace(/[\\/]/g, path.sep));
}

export function allowedFile(cfg, file) {
  if (!file) return false;
  const roots = [cfg.innDir, ...outputDirs(cfg), ...(cfg.readRoots || []), ...Object.values(cfg.projects || {})].filter(Boolean);
  if (!insideAny(roots, file)) return false;
  if (isSensitive(cfg, file)) return false;
  if (path.resolve(file) === path.resolve(path.join(cfg.agentDir, 'inn', 'bob', 'settings.json'))) return false;
  return true;
}

// What the chat shows for a mention: kind (image, audio, video, file), a URL the window can load, and whether it exists.
export function describe(cfg, p) {
  const file = resolveMention(cfg, p);
  if (!file || !allowedFile(cfg, file)) return { ok: false };
  let st = null;
  try { st = fs.statSync(file); } catch {}
  if (!st) return { ok: false, missing: true, name: path.basename(file) };
  const ext = path.extname(file).toLowerCase();
  const kind = /\.(png|jpe?g|webp|gif)$/.test(ext) ? 'image' : /\.(wav|mp3|ogg|flac|m4a)$/.test(ext) ? 'audio' : /\.(mp4|webm|mov)$/.test(ext) ? 'video' : st.isDirectory() ? 'folder' : TEXT_EXT.has(ext) ? 'text' : 'file';
  return { ok: true, kind, name: path.basename(file), path: file, bytes: st.isDirectory() ? 0 : st.size, url: st.isDirectory() ? '' : `/api/file?path=${encodeURIComponent(file)}`, canOpen: canOpen(file, st.isDirectory()) };
}

// Open (with the file's own app) or show in Explorer. In Bob.exe this is Electron's shell; otherwise Explorer.
export function openFile(cfg, p, { reveal = false } = {}) {
  const file = resolveMention(cfg, p);
  if (!file || !allowedFile(cfg, file)) throw new Error("That file is outside the folders Bob may open.");
  if (!fs.existsSync(file)) throw new Error('That file isn\'t there any more.');
  if (!reveal && !canOpen(file, fs.statSync(file).isDirectory())) throw new Error('Bob doesn\'t open that kind of file (programs, scripts, shortcuts and web pages stay shut). Use Show in folder instead.');
  const sh = globalThis.bobShell;
  if (sh) { reveal ? sh.showItemInFolder(file) : sh.openPath(file); return { ok: true, file }; }
  if (process.platform !== 'win32') throw new Error('Opening files works on this replicant matrix itself.');
  const explorer = path.join(process.env.SystemRoot || 'C:\\Windows', 'explorer.exe');
  spawn(explorer, reveal ? [`/select,${file}`] : [file], { detached: true, stdio: 'ignore', windowsHide: false }).unref();
  return { ok: true, file };
}

// The start of a text file for the side panel and the chat preview (at most 256 KB, read as UTF-8).
export function peek(cfg, p, max = PEEK_MAX) {
  const d = describe(cfg, p);
  if (!d.ok || d.kind !== 'text') return { ok: false };
  const n = Math.min(d.bytes, Math.max(1, Math.min(PEEK_MAX, Number(max) || PEEK_MAX)));
  const buf = Buffer.alloc(n);
  const fd = fs.openSync(d.path, 'r');
  try { fs.readSync(fd, buf, 0, n, 0); } finally { fs.closeSync(fd); }
  return { ok: true, name: d.name, ext: path.extname(d.path).toLowerCase(), text: buf.toString('utf8').replace(/\uFFFD+$/, ''), cut: d.bytes > n, bytes: d.bytes };
}
