// Tests "Pieces at once" (Nov 27 2026): one file fetched as 4 or 8 Range requests at the same time into one .part
// file, with resume from a pieces note, a clean fall back to one stream for servers without ranges, and the queue
// using it only when the setting is on. A fake Hugging Face serves random bytes; nothing touches the real network.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fetchInPieces, pieceCount, splitRanges, stateFileOf, PIECE_MIN_BYTES } from '../src/piece-download.js';
import { ModelShop } from '../src/models.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const until = async (fn, ms = 8000) => { const t = Date.now(); while (Date.now() - t < ms) { if (fn()) return true; await new Promise((r) => setTimeout(r, 15)); } return false; };
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-pieces-'));
const content = crypto.randomBytes(2_000_003);
const sha = crypto.createHash('sha256').update(content).digest('hex');

// A server answering Range requests. mode: 'ok' | 'norange' (whole file, 200) | 'noend' (ignores the end of a range)
// | 'fail-once' (one piece's first request breaks) | 'slow' (time to pause).
function server(mode = 'ok') {
  const asked = [];
  let failed = false;
  const open = async (range, signal) => {
    asked.push(range);
    const m = /bytes=(\d+)-(\d*)/.exec(range || '');
    let from = m ? Number(m[1]) : 0, to = m && m[2] ? Number(m[2]) + 1 : content.length;
    if (mode === 'norange') { from = 0; to = content.length; }
    if (mode === 'noend') to = content.length;
    if (mode === 'fail-once' && !failed && from > 0) { failed = true; throw new Error('fetch failed (connection reset)'); }
    const body = content.subarray(from, to);
    const step = mode === 'slow' ? 20000 : 65536;
    const r = new Response(new ReadableStream({
      async start(c) {
        for (let i = 0; i < body.length; i += step) {
          if (signal?.aborted) { c.error(signal.reason); return; }
          c.enqueue(body.subarray(i, i + step));
          await new Promise((x) => setTimeout(x, mode === 'slow' ? 10 : 0));
        }
        c.close();
      }
    }), { status: mode === 'norange' ? 200 : 206 });
    return r;
  };
  return { open, asked };
}
const same = (f) => fs.existsSync(f) && crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex') === sha;

// 1. Settings: off by default, only 4 or 8, only for big files.
check('off by default: one stream', pieceCount({}, 5e9) === 1 && pieceCount({ downloads: {} }, 5e9) === 1);
check('4 or 8 pieces for a big file, one stream for a small one', pieceCount({ downloads: { pieces: 4 } }, 5e9) === 4 && pieceCount({ downloads: { pieces: 8 } }, 5e9) === 8 && pieceCount({ downloads: { pieces: 8 } }, PIECE_MIN_BYTES - 1) === 1);
check('settings keep only 0, 4 or 8', mergeSettings({}, { downloads: { pieces: 8 } }).downloads.pieces === 8 && mergeSettings({}, { downloads: { pieces: 3 } }).downloads.pieces === 0 && mergeSettings({}, { downloads: {} }).downloads.pieces === 0);
const sr = splitRanges(10, 100, 4);
check('pieces cover the rest of the file with no gap or overlap', sr.length === 4 && sr[0].start === 10 && sr.at(-1).end === 100 && sr.every((p, i) => i === 0 || p.start === sr[i - 1].end));

// 2. A whole file in 4 pieces comes out byte for byte.
{
  const part = path.join(root, 'a.gguf.part'); const s = server();
  const r = await fetchInPieces({ part, size: content.length, pieces: 4, open: s.open });
  check('4 pieces at once make the same file', r.ok && same(part) && s.asked.length === 4 && !fs.existsSync(stateFileOf(part)), JSON.stringify(s.asked));
}
// 3. A server that sends past the end of each range: each piece keeps only its own bytes.
{
  const part = path.join(root, 'b.gguf.part'); const s = server('noend');
  const r = await fetchInPieces({ part, size: content.length, pieces: 8, open: s.open });
  check('a server that ignores the end of a range still gives the right file', r.ok && same(part) && fs.statSync(part).size === content.length);
}
// 4. No ranges: nothing kept, the caller goes back to one stream.
{
  const part = path.join(root, 'c.gguf.part'); const s = server('norange');
  const r = await fetchInPieces({ part, size: content.length, pieces: 4, open: s.open });
  check('a server without ranges is noticed and nothing is kept', !r.ok && r.why === 'no-ranges' && !fs.existsSync(part) && !fs.existsSync(stateFileOf(part)));
}
// 5. Pause mid-way, then resume from the pieces note: each piece asks only for what it still lacks.
{
  const part = path.join(root, 'd.gguf.part'); const s = server('slow'); const ac = new AbortController();
  let seen = 0;
  const run = fetchInPieces({ part, size: content.length, pieces: 4, open: s.open, signal: ac.signal, onBytes: (n) => { seen = n; } });
  await until(() => seen > 600000);
  ac.abort(new Error('pause'));
  let threw = false; try { await run; } catch { threw = true; }
  const note = JSON.parse(fs.readFileSync(stateFileOf(part), 'utf8'));
  const kept = note.pieces.reduce((t, p) => t + p.got, 0);
  check('pause keeps the pieces note and what came', threw && kept > 0 && kept < content.length, `${kept}`);
  const s2 = server();
  const r = await fetchInPieces({ part, size: content.length, pieces: 4, open: s2.open });
  const firsts = s2.asked.map((a) => Number(/bytes=(\d+)-/.exec(a)[1]));
  check('resume asks each piece only for the rest, and the file checks out', r.ok && same(part) && firsts.every((f, i) => f === note.pieces.filter((p) => p.start + p.got < p.end)[i].start + note.pieces.filter((p) => p.start + p.got < p.end)[i].got), JSON.stringify(firsts));
}
// 6. A one-stream .part from before (no note) is kept and only the rest is fetched in pieces.
{
  const part = path.join(root, 'e.gguf.part'); fs.writeFileSync(part, content.subarray(0, 700000)); const s = server();
  const r = await fetchInPieces({ part, size: content.length, pieces: 4, open: s.open });
  check('a half file from one stream is kept, the rest comes in pieces', r.ok && same(part) && s.asked.every((a) => Number(/bytes=(\d+)-/.exec(a)[1]) >= 700000), JSON.stringify(s.asked));
}
// 7. One piece's line breaks once: that piece tries again, the file is right.
{
  const part = path.join(root, 'f.gguf.part'); const s = server('fail-once');
  const r = await fetchInPieces({ part, size: content.length, pieces: 4, open: s.open });
  check('a piece that breaks once tries again', r.ok && same(part) && s.asked.length === 5);
}

// 8. The download queue uses pieces only when the setting is on, and the file is checked against its sha256.
const dataDir = path.join(root, 'inn', 'bob'); fs.mkdirSync(dataDir, { recursive: true });
const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8').replace(/\r\n/g, '\n'));
for (const m of cat.models) for (const f of m.files || []) { delete f.sha256; delete f.bytes; delete f.sizeOnly; }
fs.writeFileSync(path.join(dataDir, 'catalog.json'), JSON.stringify(cat));
const ranges = [];
let norange = false;
globalThis.fetch = async (url, opts = {}) => {
  const u = String(url);
  if (u.includes('127.0.0.1:1')) throw new Error('ECONNREFUSED');
  if (opts.method === 'HEAD') return new Response(null, { status: 302, headers: { 'x-linked-etag': `"${sha}"`, 'x-linked-size': String(content.length) } });
  const range = opts.headers?.range || '';
  ranges.push(range);
  const m = /bytes=(\d+)-(\d*)/.exec(range);
  const from = !norange && m ? Number(m[1]) : 0, to = !norange && m && m[2] ? Number(m[2]) + 1 : content.length;
  const r = new Response(content.subarray(from, to), { status: !norange && m ? 206 : 200 });
  Object.defineProperty(r, 'url', { value: u });
  return r;
};
const cfg = { catalogFile: path.join(dataDir, 'catalog.json'), agentDir: root, dataDir, bobModelsDir: path.join(root, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), modelSearchRoots: [], ollamaUrl: 'http://127.0.0.1:1', engine: 'ollama', models: {} };
const shop = new ModelShop(cfg, () => {});
shop.pieceMin = 1; // the fake file is small; real ones need 256 MB before pieces start
const item = (id) => shop.dl.find((d) => d.id === id);
const fileOf = (id) => { const e = shop.catalog.models.find((m) => m.id === id); return path.join(cfg.bobModelsDir, e.category, path.basename(new URL(e.files[0].url).pathname)); };
const A = 'whisper-base-en', B = 'whisper-large-v3-turbo', C = 'qwen3-4b';
await shop.download(A);
await until(() => ['done', 'failed'].includes(item(A)?.state));
check('setting off: one stream, as before', item(A).state === 'done' && same(fileOf(A)) && ranges.length === 1 && ranges[0] === '', JSON.stringify(ranges));
mergeSettings(cfg, { downloads: { pieces: 4 } });
ranges.length = 0;
await shop.download(B);
await until(() => ['done', 'failed'].includes(item(B)?.state));
check('setting on: 4 range requests, file checks out', item(B).state === 'done' && same(fileOf(B)) && ranges.length === 4 && ranges.every((r) => /^bytes=\d+-\d+$/.test(r)), (item(B).error || '') + JSON.stringify(ranges));
norange = true; ranges.length = 0;
await shop.download(C);
await until(() => ['done', 'failed'].includes(item(C)?.state));
check('a server without ranges: falls back to one stream and finishes', item(C).state === 'done' && same(fileOf(C)), item(C).error || '');

fs.rmSync(root, { recursive: true, force: true });
console.log(`\npiece downloads: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
