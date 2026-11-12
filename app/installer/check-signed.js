#!/usr/bin/env node
// 1.5.204 Unsigned-file check (Smart App Control planning). Lists every Windows program file (exe, dll, node, sys,
// pyd) without a signature in the folders given, so a release never surprises anyone: Windows' Smart App Control
// stops unsigned files it hasn't seen before, and that's what held 1.5.203.
//
//   node installer/check-signed.js <folder> [<folder>...] [--require] [--summary <file>]
//
// It reports and exits 0, unless --require is given: then any unsigned file fails the check. CI passes --require
// only once the repository variable REQUIRE_SIGNED is "true" (after signing is set up), so until then a release
// is never stopped by it and nobody gets a failed-build e-mail. --summary appends the list as Markdown (for
// GitHub's job summary). Runs on Windows, Linux and a Mac: it reads the files' headers, it runs nothing.
import fs from 'node:fs';
import { unsignedIn } from '../src/app-control.js';

export function report(dirs, { fsx = fs } = {}) {
  const rows = [];
  for (const d of dirs) {
    if (!fsx.existsSync(d)) { rows.push({ dir: d, missing: true, files: [] }); continue; }
    rows.push({ dir: d, files: unsignedIn(d, { fsx }) });
  }
  return rows;
}
export function markdown(rows) {
  const n = rows.reduce((a, r) => a + r.files.length, 0);
  const out = [`### Unsigned Windows files: ${n}`, ''];
  if (!n) out.push('Every Windows program file is signed.');
  for (const r of rows) {
    if (r.missing) { out.push(`- \`${r.dir}\`: not there`); continue; }
    if (!r.files.length) continue;
    out.push(`- \`${r.dir}\`: ${r.files.length}`);
    for (const f of r.files.slice(0, 60)) out.push(`  - \`${f}\``);
    if (r.files.length > 60) out.push(`  - and ${r.files.length - 60} more`);
  }
  if (n) out.push('', 'Windows Smart App Control may stop these on PCs that have it on. They need signing before they can be trusted there (app/docs/SIGNING.md).');
  return out.join('\n') + '\n';
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/').split('/').pop());
if (isMain) {
  const args = process.argv.slice(2);
  const require_ = args.includes('--require');
  const si = args.indexOf('--summary');
  const summary = si >= 0 ? args[si + 1] : '';
  const dirs = args.filter((a, i) => !a.startsWith('--') && !(si >= 0 && i === si + 1));
  if (!dirs.length) { console.error('Usage: node installer/check-signed.js <folder> [<folder>...] [--require] [--summary <file>]'); process.exit(2); }
  const rows = report(dirs);
  const text = markdown(rows);
  process.stdout.write(text);
  if (summary) { try { fs.appendFileSync(summary, text); } catch {} }
  const n = rows.reduce((a, r) => a + r.files.length, 0);
  if (require_ && (n || rows.some((r) => r.missing))) { console.error(`${n} unsigned Windows file(s): signing is required for this release.`); process.exit(1); }
}
