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

export function buildChangelog() {
  const files = fs.readdirSync(dir).filter((f) => /^v\d+\.\d+\.\d+\.md$/.test(f)).sort(newestFirst);
  const parts = files.map((f) => {
    const v = f.replace(/^v|\.md$/g, '');
    const lines = fs.readFileSync(path.join(dir, f), 'utf8').replace(/\r\n/g, '\n').split('\n');
    if (/^#?\s*Bob \d/.test(lines[0] || '')) lines.shift(); // the title line; we write our own
    const body = lines
      .filter((l) => !/^\*\*New to Bob\?\*\*/.test(l)) // the install/privacy line every release page carries
      .map((l) => (/^#{1,5} /.test(l) ? '#' + l.replace(/^#+/, (h) => h.length < 2 ? '##' : h) : l))
      .join('\n').replace(/\(\.\.\/\.\.\/\.\.\/([\w.-]+\.md)\)/g, '($1)').replace(/\(\.\.\/\.\.\/([\w.-]+\.md)\)/g, '(app/$1)').replace(/\(\.\.\/([A-Z]+[\w-]*\.md)\)/g, '(app/docs/$1)').trim();
    return `## ${v}\n\n${body}\n`;
  });
  return [
    '# Bob changelog',
    '',
    'What changed in each version of Bob, newest first. Each version also has its own page, with the download, under [Releases](https://github.com/MouseWurX/Bob/releases).',
    '',
    'This file is made from app/docs/releases by `node installer/make-changelog.js` (run in the app folder).',
    '',
    ...parts,
    '## Earlier versions (1.0.0 to 1.5.21)',
    '',
    '1.0.0 was Bob\'s first public release: chat with local models through Ollama or llama.cpp, a task queue, a download manager with pause and resume, voice samples, Sessions and Style themes, in-app updates, and Remove Bob in Settings. Versions up to 1.5.21 are listed on the [Releases](https://github.com/MouseWurX/Bob/releases) page.',
    '',
  ].join('\n');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  fs.writeFileSync(path.join(repo, 'CHANGELOG.md'), buildChangelog());
  console.log('Wrote CHANGELOG.md');
}
