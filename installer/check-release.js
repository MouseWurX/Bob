#!/usr/bin/env node
// Release check (run in CI before a release, and by hand before tagging): every GitHub Action is pinned to
// a full 40-character commit SHA, and the version, licence and signing-policy pieces are in place.
// To pin: git ls-remote https://github.com/<owner>/<action> refs/tags/<tag>  (use the commit the tag points to)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const problems = [];
const wfDir = path.join(root, '.github', 'workflows');
for (const f of fs.existsSync(wfDir) ? fs.readdirSync(wfDir) : []) {
  fs.readFileSync(path.join(wfDir, f), 'utf8').split(/\r?\n/).forEach((l, i) => {
    const m = l.match(/uses:\s*([^\s#]+)/);
    if (m && !/^[\w.-]+\/[\w./-]+@[0-9a-f]{40}$/.test(m[1])) problems.push(`${f}:${i + 1} ${m[1]} is not pinned to a full commit SHA`);
  });
}
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
if (pkg.license !== 'GPL-3.0-or-later') problems.push('package.json license should be GPL-3.0-or-later');
if (!/^\d+\.\d+\.\d+$/.test(pkg.devDependencies?.electron || '')) problems.push('devDependencies.electron must be an exact version');
if (!/## Code signing policy/.test(fs.readFileSync(path.join(root, 'README.md'), 'utf8'))) problems.push('README is missing "## Code signing policy"');
// CHANGELOG.md is made from docs/releases (node installer/make-changelog.js) and must be current.
{
  const { buildChangelog } = await import('./make-changelog.js');
  const file = path.join(root, 'CHANGELOG.md');
  const have = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') : '';
  if (!fs.existsSync(path.join(root, 'docs', 'releases', `v${pkg.version}.md`))) problems.push(`docs/releases/v${pkg.version}.md is missing`);
  if (have !== buildChangelog()) problems.push('CHANGELOG.md is out of date: run node installer/make-changelog.js');
}
// 1.5.126: the README's download row names the files of the latest release (Bob-<version>-win-x64.zip and the rest), so
// every link must carry pkg.version; a stale row sends people to a file that isn't in the newest release.
{
  const readme = fs.readFileSync(path.join(root, 'README.md'), 'utf8');
  const stale = [...readme.matchAll(/Bob-(\d+\.\d+\.\d+)-[\w.-]+/g)].map((m) => m[1]).filter((v) => v !== pkg.version);
  if (stale.length) problems.push(`README download links name Bob-${stale[0]}-… but the version is ${pkg.version}: bump the download row`);
  if (!new RegExp(`Bob-${pkg.version.replace(/\./g, '\\.')}-win-x64\\.zip`).test(readme)) problems.push(`README download row is missing Bob-${pkg.version}-win-x64.zip`);
}
// 1.5.119: merge leftovers (*.orig, *.rej, *.bak) never ship.
{
  const skip = new Set(['node_modules', '.git', 'models', 'dist', 'out']);
  const walk = (dir, rel = '') => { for (const e of fs.readdirSync(dir, { withFileTypes: true })) { if (skip.has(e.name)) continue; const r = rel ? `${rel}/${e.name}` : e.name; if (e.isDirectory()) walk(path.join(dir, e.name), r); else if (/\.(orig|rej|bak)$/.test(e.name)) problems.push(`leftover file ${r} (remove it)`); } };
  walk(root);
}
if (problems.length) { console.log(problems.map((p) => `FAIL ${p}`).join('\n')); process.exit(1); }
console.log('PASS release check');
