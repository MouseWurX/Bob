// Search my documents by meaning (Settings, How Bob works, under "Read and search my documents"; off unless the
// user turns both on). find_in_documents then also finds files that mean what was asked, not only ones with the
// exact words: "the paper about my rent going up" finds the lease that says "the monthly payment will increase".
//
// How: while Bob is idle (never in the Gaming session), the housekeeper reads the documents in the folders Bob may
// read, cuts their words into pieces of about 1,200 letters, and asks the Memory slot's embedding model
// (nomic-embed-text, run by embedder.js on the processor, or by Ollama) for each piece's meaning as a list of numbers.
// Those numbers go in one file, inn\bob\doc-index.json. A search turns the question into numbers the same way and
// picks the pieces that point the most alike (cosine).
//
// What the index keeps: each file's path, size and date, and per piece where it starts, how long it is and its
// numbers (squeezed to one byte each). Never the words themselves: a snippet is read from the file when it's found.
// Files that changed are done again, files that are gone are dropped, secret files are never read. Turning the
// switch off deletes the file. Nothing is sent anywhere.
import fs from 'node:fs';
import path from 'node:path';
import { insideAny } from './config.js';
import { isSensitive } from './tools.js';
import { docToolsOn, walkFiles, readWords, TEXT_EXT } from './my-docs.js';
import { DOC_EXT } from './doc-text.js';
import { writeJsonAtomic } from './util.js';

export const docMeaningOn = (cfg) => docToolsOn(cfg) && cfg?.docMeaning === true;
export const INDEX = { files: 3000, piecesPerFile: 40, piece: 1200, overlap: 200, perRun: 150, runMs: 90e3, batch: 16, hits: 8, minScore: 0.45 };

// nomic-embed-text was taught to tell questions from passages by these two openings; other models don't need them.
import { asDoc, asQuery } from './embed-prefix.js';

// Where each piece starts and how long it is. Pieces overlap a little so a sentence cut in two is whole in one of them.
export function pieces(text, { size = INDEX.piece, overlap = INDEX.overlap, max = INDEX.piecesPerFile } = {}) {
  const s = String(text || '');
  const out = [];
  if (!s.trim()) return out;
  let at = 0;
  while (at < s.length && out.length < max) {
    let end = Math.min(s.length, at + size);
    if (end < s.length) { const sp = s.lastIndexOf(' ', end); if (sp > at + size / 2) end = sp; } // end on a space
    if (s.slice(at, end).trim().length >= 20) out.push({ at, len: end - at });
    if (end >= s.length) break;
    at = Math.max(at + 1, end - overlap); // the next piece starts a little before this one ended
  }
  return out;
}

// A vector to one signed byte per number (after making its length 1), stored as base64. Plenty for ranking.
export function squeeze(vec) {
  let n = 0;
  for (const x of vec) n += x * x;
  n = Math.sqrt(n) || 1;
  const b = new Int8Array(vec.length);
  for (let i = 0; i < vec.length; i++) b[i] = Math.max(-127, Math.min(127, Math.round((vec[i] / n) * 127)));
  return Buffer.from(b.buffer).toString('base64');
}
export function unsqueeze(s) {
  const buf = Buffer.from(String(s || ''), 'base64');
  return new Int8Array(buf.buffer, buf.byteOffset, buf.length);
}
// How alike a question (plain numbers) and a stored piece are, from -1 to 1.
export function alike(q, b) {
  let d = 0, n = 0;
  for (let i = 0; i < q.length && i < b.length; i++) { d += q[i] * b[i]; n += q[i] * q[i]; }
  return n ? d / (Math.sqrt(n) * 127) : 0;
}

export class DocIndex {
  constructor(cfg) { this.cfg = cfg; this.file = path.join(cfg.dataDir, 'doc-index.json'); this.data = null; this.building = false; }
  load(model) {
    if (!this.data) { try { this.data = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.data = null; } }
    if (!this.data?.files || (model && this.data.model && this.data.model !== model)) this.data = { v: 1, model: model || '', files: {}, lastFull: 0 };
    return this.data;
  }
  save() { try { fs.mkdirSync(path.dirname(this.file), { recursive: true }); writeJsonAtomic(this.file, this.data, 0); } catch {} }
  clear() { this.data = null; try { fs.rmSync(this.file, { force: true }); } catch {} }
  view() {
    const d = this.load();
    const files = Object.values(d.files);
    return { files: files.filter((f) => f.p?.length).length, pieces: files.reduce((n, f) => n + (f.p?.length || 0), 0), building: this.building, lastFull: d.lastFull || 0 };
  }

  // Bring the index up to date: new and changed files are read and embedded (up to perRun files or runMs a go),
  // files that are gone are dropped once a whole walk got through. embed(texts) -> vectors or null (no model here).
  // Returns { added, dropped, left }; left > 0 means there's more to do next time.
  async fill(roots, embed, model, { now = () => Date.now(), read, signal } = {}) {
    if (this.building) return { added: 0, dropped: 0, left: 0, busy: true };
    this.building = true;
    try {
      const d = this.load(model);
      d.model = model;
      const start = now();
      const seen = new Set();
      const todo = [];
      const w = await walkFiles(this.cfg, roots, [...DOC_EXT, ...TEXT_EXT], (file, st) => {
        if (seen.size >= INDEX.files) return 'cap'; // the rest stay out, so the index keeps its size
        seen.add(file);
        const key = `${st.size}:${st.mtimeMs}`;
        if (d.files[file]?.k !== key) todo.push({ file, key, st });
      }, { signal, now, ms: 60e3, files: 20000 });
      let dropped = 0;
      if (!w.stopped || w.stopped === 'cap') for (const f of Object.keys(d.files)) if (!seen.has(f)) { delete d.files[f]; dropped++; }
      let added = 0, done = 0;
      for (const t of todo) {
        if (signal?.aborted || done >= INDEX.perRun || now() - start > INDEX.runMs) break;
        const text = readWords(t.file, t.st, read);
        const ps = pieces(text);
        const vecs = [];
        for (let i = 0; i < ps.length; i += INDEX.batch) {
          const part = ps.slice(i, i + INDEX.batch);
          const got = await embed(part.map((p) => asDoc(model, text.slice(p.at, p.at + p.len).replace(/\s+/g, ' '))));
          if (!got) { if ((added || dropped) && this.data === d) this.save(); return { added, dropped, left: todo.length - done, noModel: true }; }
          part.forEach((p, j) => { if (Array.isArray(got[j])) vecs.push([p.at, p.len, squeeze(got[j])]); });
        }
        d.files[t.file] = { k: t.key, p: vecs };
        done++; added++;
      }
      if (done >= todo.length && (!w.stopped || w.stopped === 'cap')) d.lastFull = now();
      if ((added || dropped) && this.data === d) this.save(); // not if the index was forgotten meanwhile
      return { added, dropped, left: todo.length - done };
    } finally { this.building = false; }
  }

  // The files whose pieces mean the most what qvec means. Only files Bob may still read, in the folders given.
  search(qvec, { roots, k = INDEX.hits, min = INDEX.minScore } = {}) {
    const d = this.load();
    const best = [];
    for (const [file, f] of Object.entries(d.files)) {
      if (!f.p?.length) continue;
      if (roots && !insideAny(roots, file)) continue;
      if (!insideAny(this.cfg.readRoots, file) || isSensitive(this.cfg, file)) continue;
      let top = null;
      for (const [at, len, v] of f.p) { const s = alike(qvec, unsqueeze(v)); if (!top || s > top.score) top = { file, at, len, score: s }; }
      if (top && top.score >= min) best.push(top);
    }
    return best.sort((a, b) => b.score - a.score).slice(0, k);
  }
}

// The question's numbers, or null when there's no embedding model here (or it's the Gaming session).
export async function queryVector(hk, q, model, ms = 8000) {
  if (!hk?.embed) return null;
  const v = await Promise.race([hk.embed([asQuery(model, String(q))]), new Promise((r) => setTimeout(() => r(null), ms).unref?.())]).catch(() => null);
  return Array.isArray(v?.[0]) ? v[0] : null;
}
