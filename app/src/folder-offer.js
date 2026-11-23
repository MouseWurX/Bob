// Nov 18: a Hand was refused a folder that isn't ticked, and Bob then asked to switch on a Hand that was already on,
// so nothing showed at all. Now the refusal itself puts up a card: "That folder isn't on my list. Add it?"
// No imports beyond node, so the test can load it alone.
import fs from 'node:fs';
import path from 'node:path';

// The words the Files and Office Hands refuse with (hands-files.js, hands-office.js).
export const FOLDER_REFUSED = /^(?:I can only (?:work with files|save) in:|No folders are ticked for the Files Hand)/;

const isAbs = (p) => /^[A-Za-z]:[\\/]/.test(p) || p.startsWith('/') || p.startsWith('\\\\');
const norm = (p) => path.resolve(p).replace(/[\\/]+$/, '').toLowerCase();
const inside = (roots, p) => roots.some((r) => { const a = norm(r), b = norm(p); return b === a || b.startsWith(a + path.sep) || b.startsWith(a + '\\') || b.startsWith(a + '/'); });

// The folder to offer: the nearest folder that exists above (or at) the first full path in the call that isn't inside
// a ticked folder. Never a drive or the top of the disk, never a folder Bob may not have (his own, read-only ones).
export function refusedFolder(args, roots = [], { exists = (p) => { try { return fs.statSync(p).isDirectory(); } catch { return false; } }, never = [] } = {}) {
  const vals = [];
  const walk = (v, d = 0) => { if (d > 2 || v == null) return; if (typeof v === 'string') vals.push(v.trim()); else if (Array.isArray(v)) v.forEach((x) => walk(x, d + 1)); else if (typeof v === 'object') Object.values(v).forEach((x) => walk(x, d + 1)); };
  walk(args);
  for (const v of vals) {
    if (!v || v.length > 400 || !isAbs(v) || inside(roots, v)) continue;
    let f = v.replace(/[\\/]+$/, '');
    for (let i = 0; i < 40 && f && !exists(f); i++) { const up = path.dirname(f); if (up === f) { f = ''; break; } f = up; }
    if (!f || path.parse(f).root.replace(/[\\/]+$/, '') === f.replace(/[\\/]+$/, '') || /^[A-Za-z]:[\\/]?$/.test(f)) continue;
    if (inside(never, f)) continue;
    return f;
  }
  return '';
}
