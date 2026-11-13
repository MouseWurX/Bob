// Pins the opt-in OpenSCAD download (3D parts) to one exact version with its sha256 (src/openscad-pins.json).
// Run on a computer with internet: node installer/pin-openscad.js <version>
//   e.g. node installer/pin-openscad.js 2021.01
// It takes the official files from files.openscad.org: the Windows 64-bit zip and the Linux AppImages (x86-64 and
// ARM 64-bit, where that version has them). Each file's sha256 is read from the .sha256 file OpenSCAD publishes
// next to it, then checked against the file itself. A file that isn't there for that version is left empty, so Bob
// simply offers no download on that computer.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PINS = path.join(here, '..', 'src', 'openscad-pins.json');
const ver = process.argv[2] || '';
if (!/^\d{4}\.\d{2}(?:\.[\w.]+)?$/.test(ver)) { console.error('Give the OpenSCAD version to pin, e.g.: node installer/pin-openscad.js 2021.01'); process.exit(1); }
const BASE = 'https://files.openscad.org/';
const FILES = { 'win-x64': `OpenSCAD-${ver}-x86-64.zip`, 'linux-x64': `OpenSCAD-${ver}-x86_64.AppImage`, 'linux-arm64': `OpenSCAD-${ver}-aarch64.AppImage` };
const get = (u) => fetch(u, { headers: { 'user-agent': 'Bob pin-openscad' } });

const pins = JSON.parse(fs.readFileSync(PINS, 'utf8'));
pins.version = ver;
for (const [key, name] of Object.entries(FILES)) {
  const url = BASE + name;
  const sum = await get(url + '.sha256');
  if (!sum.ok) { console.log(`${key}: no ${name} for ${ver} (${sum.status}), left empty`); pins[key] = { url: '', sha256: '', bytes: 0 }; continue; }
  const want = ((await sum.text()).match(/\b[0-9a-f]{64}\b/i) || [''])[0].toLowerCase();
  if (!want) throw new Error(`${name}.sha256 has no checksum in it`);
  const r = await get(url);
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  const h = crypto.createHash('sha256'); let n = 0;
  for await (const c of r.body) { h.update(c); n += c.length; }
  const got = h.digest('hex');
  if (got !== want) throw new Error(`${name}: the file's sha256 (${got}) doesn't match OpenSCAD's own (${want})`);
  pins[key] = { url, sha256: got, bytes: n };
  console.log(`${key}: ${name} ${Math.round(n / 1e6)} MB ${got}`);
}
fs.writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n');
console.log(`Pinned OpenSCAD ${ver} in ${path.relative(process.cwd(), PINS)}`);
