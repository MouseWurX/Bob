// 🔍 "Let Bob compare files" (Settings, How Bob works, 🧰 More tools; off by default). "What changed?"
// compare_files lays two files side by side (two versions of a document, two lists, two settings files) and finds
// what was added, taken out and changed, line by line and, inside a changed line, word by word. The brain then says
// the differences in plain words. Word, Excel, PowerPoint, OpenDocument, RTF and PDF files are read as their words
// (the same reader as "Read and search my documents"); anything else as text. Both files must be in the folders
// Bob may read. Nothing is changed.
import fs from 'node:fs';
import path from 'node:path';
import { isDoc, docText } from './doc-text.js';
import { insideAny } from './config.js';
import { isSensitive } from './tools.js';

export const MAX_LINES = 50000;
export const MAX_BYTES = 30 * 1024 * 1024;
const SHOW = 14000;

// Myers' difference (the one git uses): the shortest list of keep/add/remove steps from a to b.
export function diff(a, b) {
  const n = a.length, m = b.length, max = n + m, v = new Map([[1, 0]]), trace = [];
  outer: for (let d = 0; d <= max; d++) {
    trace.push(new Map(v));
    for (let k = -d; k <= d; k += 2) {
      let x = k === -d || (k !== d && (v.get(k - 1) ?? -1) < (v.get(k + 1) ?? -1)) ? v.get(k + 1) ?? 0 : (v.get(k - 1) ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) { x++; y++; }
      v.set(k, x);
      if (x >= n && y >= m) break outer;
    }
    if (d > 4000) return null; // too different to walk: the caller says so
  }
  const ops = [];
  let x = n, y = m;
  for (let d = trace.length - 1; d >= 0 && (x > 0 || y > 0); d--) {
    const vd = trace[d], k = x - y;
    const prev = k === -d || (k !== d && (vd.get(k - 1) ?? -1) < (vd.get(k + 1) ?? -1)) ? k + 1 : k - 1;
    const px = vd.get(prev) ?? 0, py = px - prev;
    while (x > px && y > py) { ops.push({ op: '=', a: x - 1, b: y - 1 }); x--; y--; }
    if (d > 0) { if (x === px) ops.push({ op: '+', b: y - 1 }); else ops.push({ op: '-', a: x - 1 }); }
    x = px; y = py;
  }
  return ops.reverse();
}

// Inside a changed line: [-old words-] {+new words+}.
export function wordDiff(a, b) {
  const wa = a.split(/(\s+)/), wb = b.split(/(\s+)/);
  const ops = diff(wa, wb);
  if (!ops) return `[-${a}-] {+${b}+}`;
  let out = '', run = null, buf = '';
  const flush = () => { if (run) out += run === '-' ? `[-${buf}-]` : `{+${buf}+}`; run = null; buf = ''; };
  for (const o of ops) {
    if (o.op === '=') { flush(); out += wa[o.a]; continue; }
    if (run !== o.op) flush();
    run = o.op; buf += o.op === '-' ? wa[o.a] : wb[o.b];
  }
  flush();
  return out;
}

// The differences, grouped: each change with a line around it.
export function compareText(textA, textB) {
  const a = String(textA).replace(/\r\n/g, '\n').split('\n'), b = String(textB).replace(/\r\n/g, '\n').split('\n');
  if (a.length > MAX_LINES || b.length > MAX_LINES) throw new Error(`Those are over ${MAX_LINES.toLocaleString('en')} lines; I compare files up to that.`);
  const ops = diff(a, b);
  if (!ops) return { same: false, tooDifferent: true, added: b.length, removed: a.length, changed: 0, text: 'These two are too different to line up: they look like different files, not two versions of one.' };
  let added = 0, removed = 0, changed = 0;
  const blocks = [];
  for (let i = 0; i < ops.length;) {
    if (ops[i].op === '=') { i++; continue; }
    const start = i;
    while (i < ops.length && ops[i].op !== '=') i++;
    const run = ops.slice(start, i), minus = run.filter((o) => o.op === '-'), plus = run.filter((o) => o.op === '+');
    const lineA = (minus[0]?.a ?? (ops[start - 1]?.a ?? -1) + 1) + 1, lineB = (plus[0]?.b ?? (ops[start - 1]?.b ?? -1) + 1) + 1;
    const pairs = Math.min(minus.length, plus.length);
    const lines = [];
    const before = ops[start - 1];
    if (before) lines.push(`  ${a[before.a]}`);
    for (let j = 0; j < pairs; j++) { lines.push(`~ ${wordDiff(a[minus[j].a], b[plus[j].b])}`); changed++; }
    for (const o of minus.slice(pairs)) { lines.push(`- ${a[o.a]}`); removed++; }
    for (const o of plus.slice(pairs)) { lines.push(`+ ${b[o.b]}`); added++; }
    const after = ops[i];
    if (after) lines.push(`  ${a[after.a]}`);
    blocks.push(`@ first file line ${lineA}, second file line ${lineB}\n${lines.join('\n')}`);
  }
  const same = !blocks.length;
  return { same, added, removed, changed, blocks: blocks.length, text: same ? 'They are the same, word for word.' : blocks.join('\n\n') };
}

function readSide(cfg, file) {
  if (!file || !path.isAbsolute(String(file))) throw new Error('Give the full path to both files.');
  const f = path.resolve(String(file));
  if (!fs.existsSync(f)) throw new Error(`There's no file at ${f}.`);
  if (!insideAny(cfg.readRoots || [], f)) throw new Error(`I'm not allowed to read ${f}.`);
  if (isSensitive(cfg, f)) throw new Error('One of those files holds keys or passwords, so it stays off-limits to me.');
  const size = fs.statSync(f).size;
  if (size > MAX_BYTES) throw new Error(`${path.basename(f)} is over 30 MB.`);
  if (isDoc(f)) return docText(f);
  const buf = fs.readFileSync(f);
  if (buf.subarray(0, 4096).includes(0)) throw new Error(`${path.basename(f)} isn't text (a picture or a program?), so I can't say what changed in words.`);
  return buf.toString('utf8');
}

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function compareTool(cfg, on = () => true) {
  return {
    schema: fn('compare_files', 'Compare two files (two versions of a document, two lists, two configs) and get what was added, removed and changed. Then say the differences in plain words.', {
      first: { type: 'string', description: 'Full path to the older or first file.' },
      second: { type: 'string', description: 'Full path to the newer or second file.' }
    }, ['first', 'second']),
    async run({ first, second }) {
      if (!on()) return 'Comparing files is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob compare files".';
      const r = compareText(readSide(cfg, first), readSide(cfg, second));
      if (r.same) return `${path.basename(first)} and ${path.basename(second)} are the same, word for word.`;
      if (r.tooDifferent) return r.text;
      const body = r.text.length > SHOW ? `${r.text.slice(0, SHOW)}\n[More changes not shown: ${r.blocks} places in all.]` : r.text;
      return `${r.changed} line${r.changed === 1 ? '' : 's'} changed, ${r.added} added, ${r.removed} taken out, in ${r.blocks} place${r.blocks === 1 ? '' : 's'}.\nKey: "~" a changed line, with [-old words-] {+new words+}; "+" added; "-" taken out; plain lines are around the change.\n\n${body}\n\nSay what changed in plain words, most important first. Don't paste this list back.`;
    },
    summary: ({ first, second }) => `compare: ${path.basename(String(first || ''))} with ${path.basename(String(second || ''))}`
  };
}
