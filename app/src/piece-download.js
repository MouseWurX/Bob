// Nov 27 2026 (the owner asked for downloads "in pieces"): one big brain file downloaded as 4 or 8 pieces at once, each its own
// HTTP Range request, written into the same .part file at its own place. One stream from Hugging Face is often slower than
// the line; several at once usually fill it (NariQ's launcher does the same with the hf tool). Off by default
// (Settings in Downloads, "Pieces at once"). Plain Node, so it works the same on Windows, Mac and Linux. The Android app's own phone-brain download (PhoneBrain.kt) is still one stream.
//
// Resume: a small "<file>.pieces.part" note keeps how far each piece got, so Pause or a lost line picks up where each
// piece stopped. A server that ignores Range requests is noticed on the first piece that doesn't start at 0, and the
// caller goes back to one stream. The checksum is worked out after the last piece lands, by reading the file once,
// because the pieces arrive out of order.
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import crypto from 'node:crypto';

export const PIECE_CHOICES = [4, 8];
export const PIECE_MIN_BYTES = 256 * 1024 * 1024; // smaller files gain little from pieces

// How many pieces for a file of this size: 1 (one stream) unless the setting is on and the file is big enough.
export function pieceCount(cfg, size, min = PIECE_MIN_BYTES) {
  const n = Number(cfg?.downloads?.pieces) || 0;
  if (!PIECE_CHOICES.includes(n) || !(size >= min)) return 1;
  return n;
}

export const stateFileOf = (part) => part.replace(/\.part$/, '') + '.pieces.part';

// [start, end) ranges covering from..size, n of them, the last one taking what's left.
export function splitRanges(from, size, n) {
  const left = size - from;
  if (left <= 0) return [];
  const each = Math.ceil(left / n);
  const out = [];
  for (let s = from; s < size; s += each) out.push({ start: s, end: Math.min(size, s + each), got: 0 });
  return out;
}

function readState(file, size) {
  try {
    const j = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (j.size !== size || !Array.isArray(j.pieces) || !j.pieces.length) return null;
    const ok = j.pieces.every((p) => Number.isInteger(p.start) && Number.isInteger(p.end) && Number.isInteger(p.got) && p.got >= 0 && p.start + p.got <= p.end);
    return ok ? j.pieces : null;
  } catch { return null; }
}

// Drop the pieces note and the half-done file (cancel, or a server that turned out not to take ranges).
export function dropPieces(part) {
  for (const f of [part, stateFileOf(part)]) { try { fs.rmSync(f, { force: true }); } catch {} }
}

// sha256 of a whole file, read once.
export async function hashFile(file) {
  const h = crypto.createHash('sha256');
  for await (const c of fs.createReadStream(file, { highWaterMark: 4 * 1024 * 1024 })) h.update(c);
  return h.digest('hex');
}

// part: the .part file. size: the file's whole size (must be known). pieces: 4 or 8.
// open(range, signal) -> Response: the caller's own fetch (it follows redirects and checks the hosts).
// onBytes(total): bytes of the file now on disk, for the progress bar (and to keep the quiet guard happy).
// Returns { ok: true } when the whole file is in part, or { ok: false, why: 'no-ranges' } (nothing is kept then).
// Throws on a failed or stopped download; the note is saved first, so the next try resumes.
export async function fetchInPieces({ part, size, pieces, open, signal, onBytes = () => {}, tries = 3 }) {
  const stateFile = stateFileOf(part);
  let list = fs.existsSync(part) ? readState(stateFile, size) : null;
  if (!list) {
    // An older one-stream .part (no note) is a run of good bytes from 0: keep it and split the rest.
    let have = 0;
    try { if (fs.existsSync(part) && !fs.existsSync(stateFile)) have = Math.min(fs.statSync(part).size, size); else fs.rmSync(part, { force: true }); } catch {}
    list = [...(have ? [{ start: 0, end: have, got: have }] : []), ...splitRanges(have, size, pieces)];
  }
  const save = () => { try { fs.writeFileSync(stateFile, JSON.stringify({ size, pieces: list })); } catch {} };
  save();
  const fh = await fsp.open(part, fs.existsSync(part) ? 'r+' : 'w+');
  const inner = new AbortController();
  const sig = signal ? AbortSignal.any([signal, inner.signal]) : inner.signal;
  const total = () => list.reduce((t, p) => t + p.got, 0);
  let noRanges = false, lastSave = Date.now();

  async function one(p) {
    for (let attempt = 1; p.start + p.got < p.end; attempt++) {
      const from = p.start + p.got;
      let res;
      try {
        res = await open(`bytes=${from}-${p.end - 1}`, sig);
        // 206 is a range answer. A 200 is the whole file: fine for a piece that starts at 0, but anywhere else the
        // server ignored the range, so pieces can't work here.
        if (res.status === 200 && from !== 0) { noRanges = true; inner.abort(new Error('no ranges')); try { await res.body?.cancel(); } catch {} return; }
        if (res.status !== 206 && res.status !== 200) { const e = new Error(`status ${res.status}`); e.status = res.status; throw e; }
        for await (const c of res.body) {
          const want = p.end - (p.start + p.got);
          const buf = c.length > want ? c.subarray(0, want) : c;
          if (buf.length) { await fh.write(buf, 0, buf.length, p.start + p.got); p.got += buf.length; onBytes(total()); }
          if (Date.now() - lastSave > 2000) { lastSave = Date.now(); save(); }
          if (p.start + p.got >= p.end) break; // a server that sent more than asked (the rest belongs to the next piece)
        }
        try { await res.body?.cancel?.(); } catch {}
      } catch (e) {
        if (sig.aborted || attempt >= tries || (e.status && e.status !== 429 && e.status < 500)) throw e;
        await new Promise((r) => setTimeout(r, 500 * attempt));
      }
    }
  }

  try {
    let first = null; // the first piece to fail stops the others (its reason is the one reported)
    await Promise.allSettled(list.map((p) => one(p).catch((e) => { if (!first) { first = e; inner.abort(e); } throw e; })));
    if (noRanges) { await fh.close().catch(() => {}); dropPieces(part); return { ok: false, why: 'no-ranges' }; }
    if (first) throw signal?.aborted ? (signal.reason instanceof Error ? signal.reason : first) : first;
  } finally {
    await fh.close().catch(() => {});
    if (!noRanges) save();
  }
  try { fs.rmSync(stateFile, { force: true }); } catch {}
  return { ok: true };
}
