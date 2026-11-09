// 1.5.32: a Hugging Face repo that was renamed answers the quick check with a 307 to a relative address and no file
// details. Bob used to read that hop's 127-byte length as the file's size, refuse the file, and retry for nothing.
import { headFile, hfFileInfo } from '../src/models.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const real = globalThis.fetch;
const OLD = 'https://huggingface.co/Org/Old_Name/resolve/main/split_files/m/file.safetensors';
const seen = [];
globalThis.fetch = async (url, opts = {}) => {
  seen.push(String(url));
  if (url === OLD) return new Response(null, { status: 307, headers: { location: '/Org/New-Name/resolve/main/split_files/m/file.safetensors', 'content-length': '127' } });
  if (url === 'https://huggingface.co/Org/New-Name/resolve/main/split_files/m/file.safetensors') return new Response(null, { status: 302, headers: { location: 'https://us.aws.cdn.hf.co/xet-bridge-us/abc', 'x-linked-size': '9999658848', 'x-linked-etag': '"' + 'a'.repeat(64) + '"' } });
  if (url === 'https://huggingface.co/Org/Loop/resolve/main/x') return new Response(null, { status: 302, headers: { location: '/Org/Loop/resolve/main/x' } });
  if (url === 'https://huggingface.co/Org/Away/resolve/main/x') return new Response(null, { status: 302, headers: { location: 'https://evil.example/x' } });
  if (String(url).startsWith('https://huggingface.co/api/models/Org/Old_Name/tree/main/split_files/m')) return new Response(JSON.stringify([{ type: 'file', path: 'split_files/m/file.safetensors', size: 9999658848, lfs: { oid: 'b'.repeat(64), size: 9999658848 } }]), { status: 200 });
  return new Response(null, { status: 404 });
};
const r = await headFile(OLD);
check('a renamed repo: the relative 307 is followed to the hop that names the size', r.status === 302 && r.headers.get('x-linked-size') === '9999658848');
check('the storage host itself is not asked', !seen.some((u) => u.includes('cdn.hf.co')));
check('a redirect loop stops after a few hops', (await headFile('https://huggingface.co/Org/Loop/resolve/main/x')).status === 302 && seen.filter((u) => u.endsWith('/Loop/resolve/main/x')).length <= 6);
check('a redirect to another site is not followed', (await headFile('https://huggingface.co/Org/Away/resolve/main/x')).status === 302 && !seen.some((u) => u.includes('evil.example')));
const info = await hfFileInfo(OLD);
check('Hugging Face file list gives size and sha256 when the quick check disagrees', info?.size === 9999658848 && info?.sha256 === 'b'.repeat(64));
check('not a Hugging Face link: no file list', (await hfFileInfo('https://github.com/x/y/releases/download/v1/a.zip')) === null);
globalThis.fetch = real;

// A file that really changed upstream: one clear message, no retries that can never work.
import fs from 'node:fs';
const src = fs.readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
const hopeless = new RegExp(src.match(/const hopeless = \/(.+?)\/i\.test/)[1], 'i');
check('a size or checksum mismatch on the website is not retried', hopeless.test('x.safetensors is a different size on the website than this Bob expects') && hopeless.test('x has changed on the website since this Bob was made') && !hopeless.test('fetch failed'));
check('a redirect\'s own length is never taken as the file size', /r\.status === 200 \? r\.headers\.get\('content-length'\)/.test(src));
// 1.5.33: every download link in the catalog is pinned to an exact Hugging Face commit, never a branch like "main",
// so a file can't change or move under Bob after he ships. (Made with bob-wip's pin-catalog tool; renamed repos use
// their new names.)
const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8'));
const urls = [];
(function walk(o) { if (Array.isArray(o)) o.forEach(walk); else if (o && typeof o === 'object') { for (const [k, v] of Object.entries(o)) if (typeof v === 'string' && /^https:\/\//.test(v) && /url$/i.test(k)) urls.push(v); else walk(v); } })(cat);
const loose = urls.filter((u) => /huggingface\.co\/.+\/resolve\//.test(u) && !/\/resolve\/[0-9a-f]{40}\//.test(u));
check('every catalog download link is pinned to an exact Hugging Face commit (no "main")', urls.length >= 40 && loose.length === 0, loose.slice(0, 3).join(' '));
const pinned = urls.filter((u) => /\/resolve\//.test(u));
check('every catalog file link also has its pinned size', (() => { const files = []; (function w(o) { if (Array.isArray(o)) o.forEach(w); else if (o && typeof o === 'object') { if (typeof o.url === 'string' && /\/resolve\//.test(o.url)) files.push(o); Object.values(o).forEach(w); } })(cat); return files.length === pinned.length && files.every((f) => f.bytes > 0); })());
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
