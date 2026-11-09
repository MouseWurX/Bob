#!/usr/bin/env node
// Pins the GitHub Actions in .github/workflows to full commit SHAs, using git (no GitHub login needed):
//   node installer/pin-actions.js
// It looks up the newest release tag in each listed major version (for example v5 -> v5.0.1), writes
// "owner/action@<sha> # vX.Y.Z" and prints what it chose. Check the result, then commit it.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, '..', '.github', 'workflows'); // .github is above the app folder
const semver = (t) => t.replace(/^v/, '').split('.').map(Number);
const newer = (a, b) => { const x = semver(a), y = semver(b); for (let i = 0; i < 3; i++) if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) > (y[i] || 0); return false; };

function resolve(repo, major) {
  const out = execFileSync('git', ['ls-remote', '--tags', `https://github.com/${repo}`], { encoding: 'utf8' });
  const tags = new Map();
  for (const line of out.split('\n')) {
    const m = line.match(/^([0-9a-f]{40})\trefs\/tags\/(v?\d+(?:\.\d+){0,2})(\^\{\})?$/);
    if (!m) continue;
    if (m[3] || !tags.has(m[2])) tags.set(m[2], m[1]); // the peeled (^{}) line is the commit itself
  }
  let best = '';
  for (const t of tags.keys()) if (semver(t)[0] === major && /\d+\.\d+\.\d+$/.test(t) && (!best || newer(t, best))) best = t;
  if (!best) best = [...tags.keys()].find((t) => t === `v${major}`) || '';
  if (!best) throw new Error(`No v${major} tag found for ${repo}.`);
  return { sha: tags.get(best), tag: best };
}

for (const f of fs.readdirSync(dir)) {
  const file = path.join(dir, f);
  let text = fs.readFileSync(file, 'utf8');
  const seen = new Map();
  text = text.replace(/uses:\s*([\w.-]+\/[\w./-]+)@(\S+)\s*#\s*v(\d+)[^\n]*/g, (all, repo, ref, major) => {
    const key = `${repo}@${major}`;
    if (!seen.has(key)) { seen.set(key, resolve(repo, Number(major))); console.log(`${repo} v${major} -> ${seen.get(key).tag} ${seen.get(key).sha}`); }
    const { sha, tag } = seen.get(key);
    return `uses: ${repo}@${sha} # ${tag}`;
  });
  fs.writeFileSync(file, text);
}
