// Honest reporting, the record side (reliability items 190-192, Nov 12; always on).
//   190 Corrections show once: when a corrected reply is tried again, the old words are marked as replaced, so the
//       window folds them away (here and after a reload) instead of leaving them above the new answer.
//   191 The record of a job shows its corrections: each one is a step in "How I got here" and is kept with the job.
//   192 A per-brain honesty score: answers and corrections counted per brain, shown on the Brains page.
// The score is one small file in Bob's data folder (honesty.json), written whole to a new file and then moved into
// place, so a crash mid-write never leaves half a file. Nothing here is sent to a brain.
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './util.js';

export const KIND_WORDS = {
  claims: 'said he did something no step did', record: 'said he did something no step did', switch: 'said a switch was on that was off',
  setting: 'said a switch was on that was off', sent: 'said he sent something', looked: 'said he looked something up',
  number: 'gave a number no result had', quote: 'quoted something he hadn\'t read', link: 'gave a link he hadn\'t read', other: 'was corrected'
};
const clip = (t, n) => String(t ?? '').replace(/\s+/g, ' ').trim().slice(0, n);

// 191: a correction as a step for "How I got here" (the same shape as brain.js traceStep, marked as a correction).
export function correctionStep(text, kind = 'other', brain = '') {
  return { tool: 'correction', what: `App's note: ${clip(text, 150)}`, ok: false, ms: 0, chars: 0, correction: true, kind: KIND_WORDS[kind] ? kind : 'other', ...(brain ? { brain: clip(brain, 80) } : {}) };
}

// 190: the turn's messages (msgs.slice(base)). An answer with words and a correction that has a later answer with
// words after it in the same turn was tried again: it's marked replaced. Returns how many were marked.
export function markReplaced(added = []) {
  let n = 0;
  const said = (m) => m && m.role === 'assistant' && !m.tool_calls?.length && String(m.content || '').trim();
  added.forEach((m, i) => {
    if (!said(m) || !m.correction || m.replaced) return;
    if (added.slice(i + 1).some(said)) { m.replaced = true; n++; }
  });
  return n;
}

// 192: per brain, how many answers and how many needed a correction, and of what kind.
export class HonestyScores {
  constructor(cfg = {}, { file } = {}) {
    this.file = file || (cfg.dataDir ? path.join(cfg.dataDir, 'honesty.json') : null);
    this.data = null;
  }
  load() {
    if (this.data) return this.data;
    let d = {};
    try { if (this.file) d = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')); } catch {}
    this.data = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
    return this.data;
  }
  save() {
    if (!this.file) return;
    try { writeJsonAtomic(this.file, this.data, 0); } catch {}
  }
  // One finished answer by this brain, with the kinds of corrections it got (none: an empty list).
  record(model, kinds = []) {
    const key = clip(model, 200);
    if (!key) return null;
    const d = this.load();
    const row = d[key] && typeof d[key] === 'object' ? d[key] : { answers: 0, corrected: 0, kinds: {} };
    row.answers = (Number(row.answers) || 0) + 1;
    if (kinds.length) {
      row.corrected = (Number(row.corrected) || 0) + 1;
      row.kinds ||= {};
      for (const k of new Set(kinds.map((x) => (KIND_WORDS[x] ? x : 'other')))) row.kinds[k] = (Number(row.kinds[k]) || 0) + 1;
      row.last = Date.now();
    }
    d[key] = row;
    // Only brains that answered: at most 200 kept, the busiest first.
    const keys = Object.keys(d);
    if (keys.length > 200) for (const k of keys.sort((a, b) => (d[a].answers || 0) - (d[b].answers || 0)).slice(0, keys.length - 200)) delete d[k];
    this.save();
    return row;
  }
  // For the Brains page: { "<model>": { answers, corrected, score, kinds } }. score: share of answers that stood with
  // no correction, out of 100, once a brain has 10 answers (fewer says too little).
  view() {
    const d = this.load(), out = {};
    for (const [k, r] of Object.entries(d)) {
      const answers = Number(r?.answers) || 0, corrected = Math.min(answers, Number(r?.corrected) || 0);
      if (!answers) continue;
      const row = { answers, corrected, score: answers >= 10 ? Math.round(100 * (answers - corrected) / answers) : null, kinds: r.kinds || {} };
      out[k] = { ...row, line: honestyLine(row) };
    }
    return out;
  }
  reset() { this.data = {}; this.save(); }
}

// The line the Brains page shows under a brain.
export function honestyLine(s) {
  if (!s || !s.answers) return '';
  if (s.score == null) return `Honesty: ${s.corrected} correction${s.corrected === 1 ? '' : 's'} in ${s.answers} answer${s.answers === 1 ? '' : 's'} so far`;
  const top = Object.entries(s.kinds || {}).sort((a, b) => b[1] - a[1])[0];
  return `Honesty: ${s.score} out of 100 (${s.corrected} of ${s.answers} answers corrected${top ? `; most often he ${KIND_WORDS[top[0]] || KIND_WORDS.other}` : ''})`;
}
