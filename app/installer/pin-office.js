// Pins the opt-in LibreOffice and FFmpeg downloads to exact versions with their sha256 (src/office-pins.json).
// Run on a PC with internet: node installer/pin-office.js [libreoffice-version] [ffmpeg-tag]
// LibreOffice: the official Windows x64 installer from The Document Foundation's archive (downloadarchive keeps
// every version, so the link keeps working after newer releases). Its sha256 is read from TDF's own checksum
// file and checked against the file itself. FFmpeg: Gyan's "essentials" build from GitHub (GyanD/codexffmpeg),
// a numbered release; GitHub's sha256 digest is used, or the file is hashed when there isn't one.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const PINS = path.join(here, '..', 'src', 'office-pins.json');
const pins = JSON.parse(fs.readFileSync(PINS, 'utf8'));
const text = async (u) => { const r = await fetch(u, { headers: { 'user-agent': 'Bob pin-office' } }); if (!r.ok) throw new Error(`${r.status} ${u}`); return r.text(); };
const hashUrl = async (u) => {
  const r = await fetch(u, { headers: { 'user-agent': 'Bob pin-office' } });
  if (!r.ok) throw new Error(`${r.status} ${u}`);
  const h = crypto.createHash('sha256'); let n = 0;
  for await (const c of r.body) { h.update(c); n += c.length; if (n % (50 << 20) < c.length) process.stderr.write(`  ${Math.round(n / 1e6)} MB\n`); }
  return { sha256: h.digest('hex'), bytes: n };
};
const vkey = (v) => v.split('.').map((x) => x.padStart(5, '0')).join('.');

// ---- LibreOffice ----
{
  const ARCH = 'https://downloadarchive.documentfoundation.org/libreoffice/old/';
  let ver = process.argv[2] || '';
  if (!ver) {
    // The newest release in the "stable" folder, then its full four-part number from the archive.
    const stable = [...(await text('https://download.documentfoundation.org/libreoffice/stable/')).matchAll(/href="(\d+\.\d+\.\d+)\/"/g)].map((m) => m[1]).sort((a, b) => (vkey(a) < vkey(b) ? 1 : -1))[0];
    const all = [...(await text(ARCH)).matchAll(/href="(\d+\.\d+\.\d+\.\d+)\/"/g)].map((m) => m[1]).filter((v) => v.startsWith(stable + '.')).sort((a, b) => (vkey(a) < vkey(b) ? 1 : -1));
    ver = all[0];
  }
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ver || '')) throw new Error(`Not a full LibreOffice version: ${ver}`);
  const short = ver.split('.').slice(0, 3).join('.');
  // The archive names the file with the full four-part version; TDF's .sha256 lives only in the stable folder,
  // under the three-part name, while that version is still current.
  const url = `${ARCH}${ver}/win/x86_64/LibreOffice_${ver}_Win_x86-64.msi`;
  const sumUrl = `https://download.documentfoundation.org/libreoffice/stable/${short}/win/x86_64/LibreOffice_${short}_Win_x86-64.msi.sha256`;
  let official = '';
  try { official = (await text(sumUrl)).match(/[0-9a-f]{64}/i)?.[0]?.toLowerCase() || ''; } catch {}
  console.error(`LibreOffice ${ver}: hashing ${url} (about 350 MB)...`);
  const got = await hashUrl(url);
  if (official && official !== got.sha256) throw new Error(`LibreOffice checksum mismatch: TDF says ${official}, the file is ${got.sha256}`);
  pins.libreoffice = { version: ver, url, sha256: got.sha256, bytes: got.bytes, checkedAgainstTdf: Boolean(official) };
}

// ---- FFmpeg ----
{
  const repo = pins.ffmpeg.repo || 'GyanD/codexffmpeg';
  const rels = JSON.parse(await text(`https://api.github.com/repos/${repo}/releases?per_page=30`));
  const want = process.argv[3] || '';
  const rel = rels.filter((r) => !r.draft && !r.prerelease && /^\d+\.\d+(\.\d+)?$/.test(r.tag_name)).find((r) => !want || r.tag_name === want);
  if (!rel) throw new Error('No numbered FFmpeg release found.');
  const asset = rel.assets.find((a) => /^ffmpeg-[\d.]+-essentials_build\.zip$/.test(a.name));
  if (!asset) throw new Error(`FFmpeg ${rel.tag_name} has no essentials zip.`);
  let sha = String(asset.digest || '').replace(/^sha256:/, '');
  if (!/^[0-9a-f]{64}$/.test(sha)) { console.error(`FFmpeg ${rel.tag_name}: hashing ${asset.name}...`); sha = (await hashUrl(asset.browser_download_url)).sha256; }
  pins.ffmpeg = { repo, tag: rel.tag_name, asset: asset.name, sha256: sha, bytes: asset.size };
}

fs.writeFileSync(PINS, JSON.stringify(pins, null, 2) + '\n');
console.log(JSON.stringify(pins, null, 2));
