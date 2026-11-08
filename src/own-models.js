// 1.5.135: brains of your own. A GGUF file already on this replicant matrix (made by hand, downloaded elsewhere, or a
// model Bob's list doesn't have) joins Bob's model list under "Your own brains": it gets an Active switch, sits in the
// Equip Bob slots and the brain menus like any other, and runs on Bob's built-in engine (llama.cpp) from where it is. Bob
// never moves, copies or deletes the file; "Remove" only takes it off his list. Marked with an explicit `own: true`
// on the entry, never guessed from a name. Settings: cfg.ownModels = [{ id, name, gguf, mmproj }].
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { ggufInfo } from './gguf.js';

export const OWN_FAMILY = 'Your own';
const MAX = 40;

const cleanName = (s) => String(s || '').replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 60);
const cleanPath = (p) => { const s = String(p || '').replace(/[\u0000-\u001f]/g, '').trim(); return s && path.isAbsolute(s) && /\.gguf$/i.test(s) ? s : ''; };

// The saved list, tidied: absolute .gguf paths only, an id of the form own-<letters>, no doubles.
export function cleanOwnModels(list) {
  if (!Array.isArray(list)) return [];
  const seen = new Set(), out = [];
  for (const o of list.slice(0, MAX)) {
    const gguf = cleanPath(o?.gguf);
    const id = /^own-[a-z0-9][a-z0-9-]{0,40}$/.test(String(o?.id || '')) ? o.id : '';
    if (!gguf || !id || seen.has(id) || seen.has(gguf.toLowerCase())) continue;
    seen.add(id); seen.add(gguf.toLowerCase());
    const mmproj = cleanPath(o?.mmproj);
    out.push({ id, name: cleanName(o?.name) || path.basename(gguf, path.extname(gguf)), gguf, ...(mmproj ? { mmproj } : {}) });
  }
  return out;
}
export const ownModels = (cfg) => cleanOwnModels(cfg?.ownModels);

// An id from the name: "own-my-qwen-remix". Unique against the list.
export function ownId(name, list = []) {
  const base = `own-${String(name || 'brain').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30) || 'brain'}`;
  let id = base, n = 2;
  while (list.some((o) => o.id === id)) id = `${base}-${n++}`;
  return id;
}

// How big a brain is, from its GGUF header or its file name ("Qwen3.6-35B-A3B" -> 35, "9B" -> 9). null when unknown.
export function paramsOf(info, file) {
  const label = [info?.name, path.basename(file || '')].filter(Boolean).join(' ');
  const m = label.toLowerCase().match(/(?:^|[^a-z0-9])e?(\d+(?:\.\d+)?)b(?![a-z0-9])/);
  return m ? Number(m[1]) : null;
}

// What the file says about itself, for the Add form (name, size, how big) and the catalogue tip.
export function inspectOwn(file, { stat = fs.statSync, info = ggufInfo } = {}) {
  const p = cleanPath(file);
  if (!p) return { error: 'That isn\'t a .gguf file.' };
  let st;
  try { st = stat(p); } catch { return { error: 'Bob can\'t find that file.' }; }
  if (!st.isFile()) return { error: 'That isn\'t a file.' };
  const i = info(p);
  if (!i) return { error: 'That file isn\'t a GGUF brain Bob can read (it may be damaged, or not a model).' };
  const params = paramsOf(i, p);
  return { file: p, name: cleanName(i.name) || path.basename(p, path.extname(p)), arch: i.arch || '', params, sizeGB: Math.round((st.size / 1e9) * 10) / 10, ctxTrain: i.ctxTrain || null };
}

// The jobs Bob offers it for, from its size and whether it has a picture reader. Honest and plain: a small brain is a
// Quick brain, a big one can think deeply; without a picture reader it never goes under Seeing pictures.
export function jobsFor(params, vision) {
  const jobs = ['bob', 'office', 'ledger', 'scout', 'painter'];
  if (params == null || params <= 8) jobs.push('small');
  if (params == null || params >= 12) jobs.push('deep', 'reviewer');
  if (params == null || params >= 7) jobs.push('tinker');
  if (vision) jobs.push('eyes');
  return jobs;
}

// The catalogue-shaped entry Bob's lists use (public/catalogue.js, equip.js, fit.js). `own: true` is the marker.
export function ownEntry(o, { stat = fs.statSync, info = ggufInfo } = {}) {
  let size = 0, here = false, i = null;
  try { const st = stat(o.gguf); here = st.isFile(); size = st.size; } catch {}
  if (here) { try { i = info(o.gguf); } catch {} }
  const params = paramsOf(i, o.gguf);
  const sizeGB = Math.round((size / 1e9) * 10) / 10;
  const vision = Boolean(o.mmproj);
  const where = `From your own file: ${path.basename(o.gguf)}${vision ? `, with the picture reader ${path.basename(o.mmproj)}` : ''}.`;
  return {
    id: o.id, name: o.name, family: OWN_FAMILY, category: 'chat', own: true, jobs: jobsFor(params, vision),
    what: `${where} Bob only knows what the file says: ${params ? `about ${params}B` : 'size unknown'}${i?.arch ? `, ${i.arch}` : ''}${i?.ctxTrain ? `, made for up to ${Math.round(i.ctxTrain / 1024)}K` : ''}. How well it does its jobs is for you to judge.`,
    sizeGB, vramGB: sizeGB ? Math.max(2, Math.ceil(sizeGB * 1.15)) : null, ...(params ? { params } : {}),
    license: 'As its maker says', pick: 'optional', trial: true, trialNote: 'Your own file; Bob never recommends it over the ones he knows.',
    files: [], ownFile: o.gguf, ...(o.mmproj ? { ownMmproj: o.mmproj } : {}),
    status: here ? { state: 'installed', where: ['your file'], located: { gguf: o.gguf, ...(o.mmproj ? { mmproj: o.mmproj } : {}) }, canDownload: false }
      : { state: 'missing', where: [], located: {}, canDownload: false, gone: true }
  };
}
export const ownEntries = (cfg, deps) => ownModels(cfg).map((o) => ownEntry(o, deps));

// The engine's view of one: { gguf, mmproj } for cfg.llamacpp.models when it's equipped.
export const ownResolve = (o) => (o.mmproj ? { gguf: o.gguf, mmproj: o.mmproj } : o.gguf);

// "Pick a file" window for a .gguf (the brain) or its picture reader. Windows: PowerShell's OpenFileDialog on top of
// Bob's window. Mac: AppleScript's choose file. Linux: zenity, else kdialog. Returns the path, or '' if cancelled.
const TITLE = { gguf: 'Pick the brain file (.gguf)', mmproj: 'Pick its picture reader (mmproj .gguf), or Cancel for none' };
export function pickFileArgs(kind, platform) {
  const title = TITLE[kind] || TITLE.gguf;
  if (platform === 'win32') return ['powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', [
    '[Console]::OutputEncoding = [Text.Encoding]::UTF8', 'Add-Type -AssemblyName System.Windows.Forms',
    '$owner = New-Object System.Windows.Forms.Form -Property @{ TopMost = $true; ShowInTaskbar = $false }',
    '$d = New-Object System.Windows.Forms.OpenFileDialog', `$d.Title = '${title}'`, "$d.Filter = 'Brain files (*.gguf)|*.gguf'", '$d.Multiselect = $false',
    "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.FileName) }", '$owner.Dispose()'].join('; ')]];
  if (platform === 'darwin') return ['/usr/bin/osascript', ['-e', `POSIX path of (choose file with prompt "${title}")`]];
  return [['zenity', ['--file-selection', '--title', title, '--file-filter=Brain files (*.gguf) | *.gguf *.GGUF']], ['kdialog', ['--getopenfilename', '.', '*.gguf|Brain files', '--title', title]]];
}
export function pickFile({ kind = 'gguf', run = execFile, platform = process.platform } = {}) {
  const args = pickFileArgs(kind, platform);
  if (platform === 'linux') {
    return new Promise((resolve, reject) => {
      const next = (i) => {
        if (i >= args.length) return reject(new Error('No file picker (zenity or kdialog) on this replicant matrix. Type the file\'s path instead.'));
        run(args[i][0], args[i][1], { timeout: 10 * 60e3 }, (err, out) => { if (err && err.code === 'ENOENT') return next(i + 1); resolve(err ? '' : String(out || '').trim()); });
      };
      next(0);
    });
  }
  if (platform !== 'win32' && platform !== 'darwin') return Promise.reject(new Error('Picking a file this way only works on Windows, Mac and Linux. Type the file\'s path instead.'));
  return new Promise((resolve, reject) => {
    run(args[0], args[1], { timeout: 10 * 60e3, windowsHide: true }, (err, out, stderr) => {
      if (platform === 'darwin' && err && /-128/.test(String(stderr || err.message))) return resolve('');
      if (err && !String(out || '').trim()) return reject(new Error(`${platform === 'darwin' ? 'The Mac\'s' : 'Windows\''} file picker didn't open. Type the file's path instead.`));
      resolve(String(out || '').trim().replace(/\/$/, ''));
    });
  });
}
