#!/usr/bin/env node
// Builds CHANGELOG.md (at the top of the repository) from app/docs/releases/vX.Y.Z.md (newest first). Run it after
// adding a release note, from the app folder:
//   node installer/make-changelog.js
// installer/check-release.js fails if CHANGELOG.md is missing the current version or is out of date.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'docs', 'releases');
const repo = path.dirname(root); // CHANGELOG.md sits at the top, Bob's files in app/

const num = (f) => f.replace(/^v|\.md$/g, '').split('.').map(Number);
const newestFirst = (a, b) => { const x = num(a), y = num(b); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return y[i] - x[i]; return 0; };

// 1.5.215 (the owner: GitHub showed the changelog "for a split second then ... oops something went wrong"): one file
// with every version (2,400 lines, 320 KB) was too much for GitHub's page. CHANGELOG.md now keeps the newest RECENT
// versions; older ones go to app/docs/changelog/, one file per 25 versions (1.5.100-1.5.124.md and so on).
export const RECENT = 10, PER_FILE = 25;
const OLDER_DIR = path.join(root, 'docs', 'changelog');
const BEGINNING = '1.0.0 was Bob\'s first public release: chat with local models through Ollama or llama.cpp, a task queue, a download manager with pause and resume, voice samples, Sessions and Style themes, in-app updates, and Remove Bob in Settings. Versions up to 1.5.21 are listed on the [Releases](https://github.com/MouseWurX/Bob/releases) page.';

function sections() {
  const files = fs.readdirSync(dir).filter((f) => /^v\d+\.\d+\.\d+\.md$/.test(f)).sort(newestFirst);
  return files.map((f) => {
    const v = f.replace(/^v|\.md$/g, '');
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').split('\n');
    if (/^#?\s*Bob \d/.test(lines[0] || '')) lines.shift(); // the title line; we write our own
    const body = lines
      .filter((l) => !/^\*\*New to Bob\?\*\*/.test(l)) // the install/privacy line every release page carries
      .map((l) => (/^#{1,5} /.test(l) ? '#' + l.replace(/^#+/, (h) => h.length < 2 ? '##' : h) : l))
      .join('\n').replace(/\(\.\.\/\.\.\/\.\.\/([\w.-]+\.md)\)/g, '($1)').replace(/\(\.\.\/\.\.\/([\w.-]+\.md)\)/g, '(app/$1)').replace(/\(\.\.\/([A-Z]+[\w-]*\.md)\)/g, '(app/docs/$1)').trim();
    return { v, n: num(f), text: `## ${v}\n\n${body}\n` };
  });
}

// The older files: { 'docs/changelog/1.5.100-1.5.124.md' (from app/): text }, newest first inside each.
function olderFiles(all) {
  const groups = new Map();
  for (const s of all.slice(RECENT)) {
    const lo = Math.floor(s.n[2] / PER_FILE) * PER_FILE, key = `${s.n[0]}.${s.n[1]}.${lo}`;
    if (!groups.has(key)) groups.set(key, { first: `${s.n[0]}.${s.n[1]}.${Math.max(lo, s.n[0] === 1 && s.n[1] === 5 && lo === 0 ? 22 : lo)}`, last: `${s.n[0]}.${s.n[1]}.${lo + PER_FILE - 1}`, parts: [] });
    groups.get(key).parts.push(s);
  }
  const out = {};
  for (const g of groups.values()) {
    // Links in the release notes are written from the top of the repository; from app/docs/changelog they need ../../../
    const fix = (t) => t.replace(/\]\((?!https?:|#|mailto:)([^)]+)\)/g, (m, u) => `](../../../${u})`);
    out[`docs/changelog/${g.first}-${g.last}.md`] = [`# Bob changelog: ${g.first} to ${g.last}`, '', 'Newest first. The newest versions are in [CHANGELOG.md](../../../CHANGELOG.md).', '', ...g.parts.map((p) => fix(p.text))].join('\n');
  }
  return out;
}

export function buildOlder() { return olderFiles(sections()); }

export function buildChangelog() {
  const all = sections(), older = Object.keys(olderFiles(all));
  return [
    '# Bob changelog',
    '',
    `What changed in the newest ${RECENT} versions of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).`,
    '',
    'This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).',
    '',
    ...all.slice(0, RECENT).map((s) => s.text),
    '## Older versions',
    '',
    ...older.map((f) => `- [${path.basename(f, '.md').replace('-', ' to ')}](app/${f})`),
    `- 1.0.0 to 1.5.21: ${BEGINNING}`,
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), buildChangelog());
  const older = buildOlder();
  fs.mkdirSync(OLDER_DIR, { recursive: true });
  for (const f of fs.readdirSync(OLDER_DIR)) if (/^\d+\.\d+\.\d+-\d+\.\d+\.\d+\.md$/.test(f) && !older[`docs/changelog/${f}`]) fs.rmSync(path.join(OLDER_DIR, f));
  for (const [f, text] of Object.entries(older)) fs.writeFileSync(path.join(root, f), text);
  console.log(`Wrote CHANGELOG.md and ${Object.keys(older).length} older files in docs/changelog`);
}
