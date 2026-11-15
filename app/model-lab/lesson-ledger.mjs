// The lesson ledger (14 Nov 2026, docs/TOOL-LESSONS-PLAN.md section 6): one fingerprint for every lesson ever taught,
// and a never-taught list (held-out tests, quiz items, interview turns, eval files), so no round teaches the same thing
// twice and no test is ever learned from. A reworded copy is caught too (near match on word shingles).
//
//   node lesson-ledger.mjs --check <lessons folder> --ledger <ledger.jsonl> [--never <file,file,...>] --out <folder>
//       writes <out>/lessons.jsonl (only new lessons), <out>/dropped.jsonl (with why) and <out>/ledger-check.json
//   node lesson-ledger.mjs --add <lessons folder> --ledger <ledger.jsonl> --round <n>
//       records a round's lessons once they are taught
//
// A never-taught file can be lessons (jsonl with messages), benchmark rows (q / text / prompt / request fields), or
// plain lines of text. The quiz items in quiz-items.mjs are always on the list. Nothing here changes a source folder.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL, fileURLToPath } from 'node:url';

export const NEAR = 0.7; // estimated overlap of words and word pairs at or above this is "the same request, reworded"
const PERM = 64;

export const normText = (t) => String(t || '').toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
export const isHoldout = (id) => parseInt(crypto.createHash('md5').update(String(id)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF < 0.05;

const textOf = (c) => (typeof c === 'string' ? c : Array.isArray(c) ? c.filter((p) => p && p.type === 'text').map((p) => p.text).join(' ') : '');
// The request a lesson answers: its first user message, without a style line ("Think: Sherlock").
export function requestOf(row) {
  if (!row || typeof row !== 'object') return normText(row);
  const u = (row.messages || []).find((m) => m.role === 'user');
  const t = u ? textOf(u.content) : (row.q || row.text || row.prompt || row.request || row.question || '');
  return normText(String(t).replace(/(^|\n)\s*Think:\s*\S+[^\n]*/g, ' '));
}
export const toolPath = (row) => (row?.messages || []).flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name || c.name)).join('>');

// Words and word pairs: one changed word in a 15-word request still overlaps about 0.8, a different request far less.
function shingles(t) {
  const w = t.split(' ').filter(Boolean);
  const s = new Set(w);
  for (let i = 0; i + 2 <= w.length; i++) s.add(`${w[i]} ${w[i + 1]}`);
  return s;
}
const h32 = (s, seed) => { const b = crypto.createHash('md5').update(`${seed}:${s}`).digest(); return b.readUInt32LE(0); };
export function minhash(t) {
  const sh = [...shingles(t)]; const out = new Array(PERM).fill(0xFFFFFFFF);
  for (const s of sh) for (let k = 0; k < PERM; k++) { const v = h32(s, k); if (v < out[k]) out[k] = v; }
  return out;
}
export const similarity = (a, b) => { let n = 0; for (let k = 0; k < PERM; k++) if (a[k] === b[k]) n++; return n / PERM; };

export function fingerprint(row) {
  const req = requestOf(row);
  return { key: crypto.createHash('sha1').update(req).digest('hex').slice(0, 16), tools: toolPath(row), mh: minhash(req), words: req.split(' ').length };
}

// Banded lookup so a check against tens of thousands of rows stays quick: 16 bands of 4 hashes each.
export class Ledger {
  constructor(rows = []) { this.keys = new Map(); this.bands = new Map(); this.rows = []; for (const r of rows) this.put(r); }
  put(r) {
    const i = this.rows.length; this.rows.push(r); this.keys.set(r.key, i);
    for (let b = 0; b < PERM / 4; b++) { const k = `${b}:${r.mh.slice(b * 4, b * 4 + 4).join('.')}`; if (!this.bands.has(k)) this.bands.set(k, []); this.bands.get(k).push(i); }
  }
  // { hit: row, how: 'same' | 'near', sim } or null
  find(fp) {
    if (this.keys.has(fp.key)) return { hit: this.rows[this.keys.get(fp.key)], how: 'same', sim: 1 };
    if (fp.words < 4) return null; // two or three words ("hi there") are too short to call a near copy
    const seen = new Set(); let best = null;
    for (let b = 0; b < PERM / 4; b++) for (const i of this.bands.get(`${b}:${fp.mh.slice(b * 4, b * 4 + 4).join('.')}`) || []) {
      if (seen.has(i)) continue; seen.add(i);
      const sim = similarity(fp.mh, this.rows[i].mh);
      if (sim >= NEAR && (!best || sim > best.sim)) best = { hit: this.rows[i], how: 'near', sim };
    }
    return best;
  }
}

const readRows = (file) => {
  const text = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
  return text.split('\n').filter((l) => l.trim()).map((l) => { try { return JSON.parse(l); } catch { return l; } });
};
export function readLedger(file) { return fs.existsSync(file) ? readRows(file).filter((r) => r && r.key && Array.isArray(r.mh)) : []; }

// The never-taught list: quiz items always, plus the given files (each row tagged with where it came from).
export async function neverTaught(files = [], { quiz = true, here = path.dirname(fileURLToPath(import.meta.url)) } = {}) {
  const rows = [];
  if (quiz) {
    try {
      const q = await import(pathToFileURL(path.join(here, 'quiz-items.mjs')).href);
      for (const [t] of [...(q.FACTS || []), ...(q.CODE || [])]) rows.push({ ...fingerprint({ q: t }), from: 'quiz-items' });
    } catch {}
  }
  for (const f of files) for (const r of readRows(f)) { const fp = fingerprint(r); if (fp.words) rows.push({ ...fp, from: path.basename(f) }); }
  return new Ledger(rows);
}

// Sort a set: what's new, what was taught before, what is a test. Held-out ideas (the Forge's 5%) count as tests.
export function checkLessons(lessons, { ledger, never }) {
  const keep = [], drop = [], inSet = new Ledger();
  for (const l of lessons) {
    const fp = fingerprint(l);
    if (l.idea !== undefined && isHoldout(l.idea)) { drop.push({ ...l, why: 'held out (the Forge keeps this idea for checks)' }); continue; }
    const t = never && never.find(fp); if (t) { drop.push({ ...l, why: `a test item (${t.how} as ${t.hit.from || 'never-taught list'})` }); continue; }
    const o = ledger && ledger.find(fp); if (o) { drop.push({ ...l, why: `taught before (${o.how}, round ${o.hit.round ?? '?'})` }); continue; }
    // routes of one request share a round, so a repeat inside this set is fine when it takes another tool path
    const d = inSet.find(fp); if (d && d.hit.tools === fp.tools && d.how === 'same' && !l.route) { drop.push({ ...l, why: 'a duplicate inside this set' }); continue; }
    inSet.put({ ...fp }); keep.push(l);
  }
  return { keep, drop };
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const { opts } = await import('./common.mjs');
  const o = opts({});
  const ledgerFile = o.ledger ? String(o.ledger) : '';
  if (!ledgerFile) { console.error('--ledger <ledger.jsonl> is needed'); process.exit(1); }
  const lessonsOf = (d) => readRows(path.join(String(d), 'lessons.jsonl')).filter((r) => r && r.messages);
  if (o.add) {
    const round = Number(o.round); if (!Number.isInteger(round) || round < 1) { console.error('--round <n> is needed with --add'); process.exit(1); }
    const have = new Ledger(readLedger(ledgerFile)); let n = 0;
    for (const l of lessonsOf(o.add)) { const fp = fingerprint(l); if (have.find(fp)?.how === 'same') continue; const r = { ...fp, round, idea: l.idea, job: l.job }; fs.appendFileSync(ledgerFile, JSON.stringify(r) + '\n'); have.put(r); n++; }
    console.log(`${n} lessons recorded as taught in round ${round} -> ${ledgerFile}`);
  } else if (o.check) {
    if (!o.out) { console.error('--out <folder> is needed with --check'); process.exit(1); }
    const never = await neverTaught(o.never ? String(o.never).split(',').filter(Boolean) : []);
    const { keep, drop } = checkLessons(lessonsOf(o.check), { ledger: new Ledger(readLedger(ledgerFile)), never });
    const out = String(o.out); fs.mkdirSync(out, { recursive: true });
    fs.writeFileSync(path.join(out, 'lessons.jsonl'), keep.map((r) => JSON.stringify(r)).join('\n') + (keep.length ? '\n' : ''));
    fs.writeFileSync(path.join(out, 'dropped.jsonl'), drop.map((r) => JSON.stringify({ idea: r.idea, job: r.job, why: r.why })).join('\n') + (drop.length ? '\n' : ''));
    for (const f of ['toolsets.json']) if (fs.existsSync(path.join(String(o.check), f))) fs.copyFileSync(path.join(String(o.check), f), path.join(out, f));
    const why = {}; for (const d of drop) { const k = d.why.replace(/\(.*\)/, '').trim(); why[k] = (why[k] || 0) + 1; }
    fs.writeFileSync(path.join(out, 'ledger-check.json'), JSON.stringify({ kept: keep.length, dropped: drop.length, why, never: never.rows.length }, null, 2));
    console.log(`${keep.length} new lessons kept, ${drop.length} dropped ${JSON.stringify(why)} -> ${out}`);
  } else { console.error('--check <lessons folder> or --add <lessons folder>'); process.exit(1); }
}
