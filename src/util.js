// Small helpers several parts of Bob share (they used to be copied into each file).
import fs from 'node:fs';
import path from 'node:path';

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// One line of text, at most n characters.
export const clip = (s, n) => String(s ?? '').replace(/\s+/g, ' ').trim().slice(0, n);
// A file's size in bytes, or 0 if it isn't there.
export const fileSize = (p) => { try { return fs.statSync(p).size; } catch { return 0; } };
// The first {...} in a brain's answer, or null.
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
