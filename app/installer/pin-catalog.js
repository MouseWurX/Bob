// Pins every Hugging Face link in catalog.json to an exact commit, so a file can never change (or move) under Bob.
// Read-only on the network (Hugging Face's public API). Usage: node pin-catalog.js <catalog.json> [--write]
// For each /resolve/<branch>/ link: find the repo's current name and newest commit, check the file there has the pinned
// sha256 (or size), and if not, walk back through the repo's commits to the one that does. Prints a report.
import fs from 'node:fs';
const [file, flag] = process.argv.slice(2);
const cat = JSON.parse(fs.readFileSync(file, 'utf8'));
const RE = /^https:\/\/huggingface\.co\/([\w.-]+\/[\w.-]+)\/resolve\/([^/]+)\/(.+)$/;
const get = async (u) => { const r = await fetch(u); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.json(); };
const trees = new Map();
async function fileAt(repo, rev, p) {
  const dir = p.includes('/') ? p.slice(0, p.lastIndexOf('/')) : '';
  const key = `${repo}@${rev}/${dir}`;
  if (!trees.has(key)) trees.set(key, await get(`https://huggingface.co/api/models/${repo}/tree/${rev}${dir ? '/' + dir : ''}`).catch(() => []));
  return trees.get(key).find((x) => x.path === p) || null;
}
const matches = (hit, f) => hit && (f.sha256 ? hit.lfs?.oid === f.sha256 : (!f.bytes || Number(hit.lfs?.size ?? hit.size) === f.bytes));
const files = [];
(function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { if (typeof o.url === 'string' && RE.test(o.url)) files.push(o); Object.values(o).forEach(walk); } })(cat);
const repos = new Map();
let ok = 0, bad = 0;
for (const f of files) {
  const [, repo0, rev, p] = f.url.match(RE);
  if (/^[0-9a-f]{40}$/.test(rev)) { ok++; console.log(`already pinned  ${f.url}`); continue; }
  if (!repos.has(repo0)) { const info = await get(`https://huggingface.co/api/models/${repo0}`); repos.set(repo0, { id: info.id, sha: info.sha, commits: null }); }
  const R = repos.get(repo0);
  let pin = null;
  if (matches(await fileAt(R.id, R.sha, p), f)) pin = R.sha;
  else {
    R.commits ||= (await get(`https://huggingface.co/api/models/${R.id}/commits/${rev}`).catch(() => [])).map((c) => c.id);
    for (const c of R.commits.slice(0, 60)) if (matches(await fileAt(R.id, c, p), f)) { pin = c; break; }
  }
  if (!pin) { bad++; console.log(`NO MATCH        ${f.url} (pinned sha ${f.sha256 || '-'}, bytes ${f.bytes || '-'})`); continue; }
  const next = `https://huggingface.co/${R.id}/resolve/${pin}/${p}`;
  console.log(`${pin === R.sha ? 'pinned (latest)' : 'pinned (older) '} ${f.url}\n                -> ${next}`);
  f.url = next; ok++;
}
console.log(`\n${ok} pinned, ${bad} without a match`);
if (flag === '--write' && !bad) { fs.writeFileSync(file, JSON.stringify(cat, null, 2) + '\n'); console.log('catalog written'); }
else if (flag === '--write') console.log('not written: fix the ones without a match first');
