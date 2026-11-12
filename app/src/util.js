// Small helpers several parts of Bob share (they used to be copied into each file).
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { saveFile } from './saving.js';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// One line of text, at most n characters.
export const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// A file's size in bytes, or 0 if it isn't there.
export const fileSize = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
// The first {...} in a brain's answer, or null.
// 1.5.201: a JSON file as it's saved. A file written by Windows PowerShell (Set-Content, Out-File) starts with a UTF-8
// byte-order mark, which JSON.parse refuses; it's dropped first. A file that still can't be read throws, so a caller
// never takes "unreadable" for "empty" and writes over it.
export const stripBom = (t) => String(t ?? '').replace(/^\uFEFF/, '');
export const readJsonFile = (file) => JSON.parse(stripBom(fs.readFileSync(file, 'utf8')));
export function parseJson(text) {
  const s = String(text || '');
  const a = s.indexOf('{'), b = s.lastIndexOf('}');
  if (a < 0 || b <= a) return null;
  try { return JSON.parse(s.slice(a, b + 1)); } catch { return null; }
}
// report.pdf -> report-2.pdf (then -3 …) when the name is taken on disk or by another file in the same job.
export function freeName(p, taken = new Set()) {
  const { dir, name, ext } = path.parse(p);
  let c = p;
  for (let i = 2; fs.existsSync(c) || taken.has(c.toLowerCase()); i++) c = path.join(dir, `${name}-${i}${ext}`);
  return c;
}
// Write a JSON file so a crash or power cut mid-write never leaves a half file: the text goes to
// a sibling .part file first, then takes the real name in one step (rename is atomic on every platform).
// Since item 229 (saving.js): a temp name of its own per save, flushed to the disk before the rename, and a retry when
// Windows holds the old file for a moment.
export function writeJsonAtomic(file, value, spaces = 1) {
  saveFile(file, JSON.stringify(value, null, spaces));
}

// The command line of a running process ('' when it is gone or can't be read), so a stale pid file never
// stops some other program that got the same number after a reboot.
export function commandLineOf(pid) {
  return new Promise((resolve) => {
    if (!pid || pid === process.pid) return resolve('');
    if (process.platform === 'win32') {
      const ps = `(Get-CimInstance Win32_Process -Filter "ProcessId=${Number(pid)}").CommandLine`;
      execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true, timeout: 8000 }, (err, out) => {
        if (!err && String(out).trim()) return resolve(String(out));
        execFile('tasklist', ['/FI', `PID eq ${Number(pid)}`, '/FO', 'CSV', '/NH'], { windowsHide: true, timeout: 3000 }, (e2, o2) => resolve(e2 ? '' : String(o2)));
      });
    } else {
      try { return resolve(fs.readFileSync(`/proc/${pid}/cmdline`, 'utf8')); } catch {}
      execFile('ps', ['-p', String(pid), '-o', 'command='], { timeout: 3000 }, (err, out) => resolve(err ? '' : String(out)));
    }
  });
}
