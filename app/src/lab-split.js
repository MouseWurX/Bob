// Brains in parts (llama-gguf-split). Big brains often come as name-00001-of-00003.gguf and friends: Hugging Face takes
// files up to 50 GB, so anything bigger is split. llama-server reads the parts as they are (point it at the first), but
// the Lab's own ways (Mix, Stack, the refusal habit, Peek inside, the brain facts) read one file. So:
// - joinParts: the Lab's "Bring in a full-size brain" joins downloaded parts into one file in its full-size folder and
//   throws the parts away once the join checks out. A brain picked from your own folders is joined into the Lab's
//   folder too, and your parts are left alone.
// - splitArgs / UPLOAD_PART_GB: the same tool splits a brain for an upload over Hugging Face's 50 GB limit (the Forge
//   does this on the rented card before it uploads; model-lab/forge/pod/run.sh).
import fs from 'node:fs';
import path from 'node:path';
import { findTool, runTool, missingWords } from './llama-tools.js';

export const PART = /^(.*)-(\d{5})-of-(\d{5})\.gguf$/i;
export const HF_FILE_LIMIT_GB = 50;
export const UPLOAD_PART_GB = 45; // a margin under Hugging Face's limit
const GB = 1e9;
const round1 = (x) => Math.round(x * 10) / 10;

// The parts a file belongs to: { first, n, stem, files: [all n paths], have: [those that exist], missing: [...] }, or
// null for a file that isn't a part.
export function partsOf(file, { exists = fs.existsSync } = {}) {
  const dir = path.dirname(file), m = path.basename(file).match(PART);
  if (!m) return null;
  const n = Number(m[3]);
  if (!(n >= 2 && n <= 999)) return null;
  const files = Array.from({ length: n }, (_, i) => path.join(dir, `${m[1]}-${String(i + 1).padStart(5, '0')}-of-${m[3]}.gguf`));
  const have = files.filter((f) => exists(f));
  return { first: files[0], n, stem: m[1], files, have, missing: files.filter((f) => !have.includes(f)) };
}

// The one file the parts become: name.gguf, in `dir` (default: next to the parts).
export const joinedName = (first, dir = path.dirname(first)) => path.join(dir, `${path.basename(first).match(PART)?.[1] || path.basename(first, '.gguf')}.gguf`);

export const joinArgs = (first, out) => ['--merge', first, out];
// Split for an upload: out-00001-of-0000N.gguf and so on, each under maxGB.
export const splitArgs = (file, outPrefix, maxGB = UPLOAD_PART_GB) => ['--split', '--split-max-size', `${maxGB}G`, file, outPrefix];
export const needsSplitForUpload = (bytes) => bytes > (HF_FILE_LIMIT_GB - 1) * GB;

// Join the parts of `first` into one file in `outDir`. Checks every part is there and that there's room, runs the tool,
// checks the result is about the size of the parts together, and (with dropParts) deletes the parts. Gives
// { ok: true, file, gb } or { ok: false, error, keepParts: true }; the parts are never deleted on a failure.
export async function joinParts(cfg, first, { outDir = path.dirname(first), dropParts = false, tool = findTool(cfg, 'split'), run = runTool, signal, onProgress, freeBytes } = {}) {
  const p = partsOf(first);
  if (!p) return { ok: false, error: 'That isn\'t a brain in parts.', keepParts: true };
  if (p.missing.length) return { ok: false, error: `${p.missing.length} of its ${p.n} parts aren't here (${path.basename(p.missing[0])} first). Every part has to be in the same folder.`, keepParts: true };
  if (!tool.found) return { ok: false, error: missingWords('split'), keepParts: true };
  const bytes = p.files.reduce((a, f) => a + fs.statSync(f).size, 0);
  try { fs.mkdirSync(outDir, { recursive: true }); } catch {}
  let free = freeBytes ?? null;
  if (free === null) { try { const st = fs.statfsSync(outDir); free = st.bavail * st.bsize; } catch {} }
  if (free !== null && free < bytes + GB) return { ok: false, error: `Joining needs about ${round1(bytes / GB)} GB free next to the parts and there's ${round1(free / GB)} GB. The parts are kept; the brain still runs from them.`, keepParts: true };
  const out = joinedName(p.first, outDir);
  if (fs.existsSync(out)) return { ok: false, error: `${path.basename(out)} is already there. Use that one, or move it away first.`, keepParts: true };
  let seen = 0;
  const r = await run(tool.path, joinArgs(p.first, out), { signal, onLine: (l) => { if (/^gguf_merge: reading metadata|^gguf_merge: writing tensors/i.test(l)) { seen++; onProgress?.(Math.min(0.95, seen / (p.n * 2))); } } }).catch((e) => ({ code: -1, err: e.message }));
  const size = (() => { try { return fs.statSync(out).size; } catch { return 0; } })();
  // The joined file holds the same tensors with one header instead of n, so it's a little smaller than the parts.
  if (r.code !== 0 || !size || size < bytes * 0.98 || size > bytes * 1.01) {
    try { fs.unlinkSync(out); } catch {}
    return { ok: false, error: signal?.aborted ? 'Stopped. The parts are kept.' : `The join didn't work${r.err ? ` (${String(r.err).trim().split(/\r?\n/).pop().slice(0, 200)})` : ''}. The parts are kept; the brain still runs from them.`, keepParts: true };
  }
  if (dropParts) for (const f of p.files) { try { fs.unlinkSync(f); } catch {} }
  onProgress?.(1);
  return { ok: true, file: out, gb: round1(size / GB), parts: p.n };
}
