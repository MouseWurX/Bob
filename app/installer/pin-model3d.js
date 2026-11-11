// Fills in model3d/addons-pins.json from a 3D workshop add-ons pre-release on Bob's GitHub:
//   node installer/pin-model3d.js model3d-addons-<n>
// Every wheel must be listed in that build's SHA256SUMS-<os>.txt AND match GitHub's own sha256 for the file.
// The plain-Python wheels (py3-none-any, built once by the Linux job) go in every computer's list.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, '..', 'model3d', 'addons-pins.json');
const REPO = 'MouseWurX/Bob';

export function sumsToMap(text) {
  const m = new Map();
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    const x = line.trim().match(/^([0-9a-f]{64})\s+\*?(\S+\.whl)$/);
    if (x) m.set(x[2], x[1]);
  }
  return m;
}

export function buildPins(release, assets, sums) {
  const byName = new Map(assets.map((a) => [a.name, a]));
  const entry = (name, sha) => {
    const a = byName.get(name);
    if (!a) throw new Error(`${name} is in the checksums but not on the release.`);
    const gh = String(a.digest || '').replace(/^sha256:/, '');
    if (gh && gh !== sha) throw new Error(`${name}: GitHub's sha256 doesn't match the build's SHA256SUMS.`);
    return { name, url: a.browser_download_url, sha256: sha, bytes: a.size };
  };
  const any = [...(sums['linux-x64'] || new Map())].filter(([n]) => /-none-any\.whl$/.test(n));
  const pins = { release };
  for (const key of ['win-x64', 'linux-x64']) {
    const own = [...(sums[key] || new Map())].filter(([n]) => !/-none-any\.whl$/.test(n));
    pins[key] = own.length ? [...any, ...own].map(([n, s]) => entry(n, s)) : [];
  }
  return pins;
}

async function main() {
  const tag = process.argv[2];
  if (!/^model3d-addons-\d+$/.test(tag || '')) { console.error('Say which release, like: node installer/pin-model3d.js model3d-addons-12'); process.exit(2); }
  const headers = { 'user-agent': 'Bob', accept: 'application/vnd.github+json' };
  const rel = await (await fetch(`https://api.github.com/repos/${REPO}/releases/tags/${tag}`, { headers })).json();
  if (!Array.isArray(rel.assets)) throw new Error(`No release called ${tag}.`);
  const sums = {};
  for (const key of ['win-x64', 'linux-x64']) {
    const a = rel.assets.find((x) => x.name === `SHA256SUMS-${key}.txt`);
    if (a) sums[key] = sumsToMap(await (await fetch(a.browser_download_url, { headers: { 'user-agent': 'Bob' } })).text());
  }
  const pins = buildPins(tag, rel.assets, sums);
  const old = JSON.parse(fs.readFileSync(out, 'utf8'));
  fs.writeFileSync(out, JSON.stringify({ note: old.note, ...pins }, null, 2) + '\n');
  console.log(`Pinned ${tag}: ${pins['win-x64'].length} Windows wheels, ${pins['linux-x64'].length} Linux wheels.`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e.message); process.exit(1); });
