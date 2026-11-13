// "Learn from tool errors" (Nov 11, off by default). Two things, both kept in inn\bob\tool-learning.json:
//   1. Tool notes: when a tool fails and then works later in the same job, Bob keeps one line on what fixed it.
//      The next time he is handed that tool, the line is on it, so he gets it right the first time.
//   2. Scorecard: wins and misses for each tool. A tool that keeps failing says so on itself, and Bob offers
//      to improve it (a tool he made: make it again; one of his own: say what goes wrong).
// Nothing leaves the replicant matrix. Settings shows the scorecard and has a button that forgets it all.
import fs from 'node:fs';
import path from 'node:path';

export const toolLearnOn = (cfg) => cfg?.toolLearning === true;

const FILE = 'tool-learning.json';
const NOTES_PER_TOOL = 2;
const NOTE_MAX = 160;
const SKIP = new Set(['use_tools', 'offer_setup', 'bob_help']); // not real work: nothing to learn from them
export const OFTEN_FAILS = { misses: 3 }; // at least this many misses, and more misses than wins

const file = (cfg) => path.join(cfg.dataDir, FILE);
export function loadLearning(cfg) {
  try { const j = JSON.parse(fs.readFileSync(file(cfg), 'utf8').replace(/^﻿/, '')); return j && typeof j.tools === 'object' ? j : { tools: {} }; } catch { return { tools: {} }; }
}
function save(cfg, j) {
  try { fs.mkdirSync(cfg.dataDir, { recursive: true }); fs.writeFileSync(file(cfg), JSON.stringify(j, null, 1)); } catch {}
}
export function forgetLearning(cfg) { try { fs.rmSync(file(cfg), { force: true }); } catch {} }

const isMiss = (text) => /^Error:/.test(String(text || ''));
const declined = (text) => /said no|not now|^\(Not (?:run|done)/i.test(String(text || ''));
const short = (v, n) => { const s = typeof v === 'string' ? v : JSON.stringify(v); return s.length > n ? s.slice(0, n - 1) + '…' : s; };

// What changed between the call that failed and the one that worked, in a few words.
export function whatChanged(before = {}, after = {}) {
  const keys = [...new Set([...Object.keys(before || {}), ...Object.keys(after || {})])];
  const diff = keys.filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k]));
  if (!diff.length) return 'the same call worked on a second try';
  return diff.slice(0, 3).map((k) => (k in (after || {}) ? `${k} ${short(after[k], 50)}` : `no ${k}`)).join(', ');
}

// One tool call finished. ctx is the job (one turn); fails wait there until the same tool works.
export function recordCall(cfg, name, args, text, ctx) {
  if (!toolLearnOn(cfg) || !name || SKIP.has(name) || declined(text)) return;
  const j = loadLearning(cfg);
  const t = (j.tools[name] ||= { wins: 0, misses: 0, notes: [] });
  const fails = ctx ? (ctx.toolFails ||= {}) : {};
  if (isMiss(text)) {
    t.misses++;
    t.lastMiss = Date.now();
    fails[name] = { args: args || {}, error: String(text).replace(/^Error:\s*/, '') };
  } else {
    t.wins++;
    const f = fails[name];
    if (f) {
      delete fails[name];
      const note = short(`"${short(f.error, 70)}" was fixed by: ${whatChanged(f.args, args)}.`, NOTE_MAX);
      t.notes = [note, ...(t.notes || []).filter((n) => n.split(' was fixed by')[0] !== note.split(' was fixed by')[0])].slice(0, NOTES_PER_TOOL);
    }
  }
  save(cfg, j);
}

export const oftenFails = (t) => Boolean(t) && t.misses >= OFTEN_FAILS.misses && t.misses > t.wins;

// The words added to a tool's description while the switch is on. made = a tool Bob made himself.
export function learnedLine(cfg, name, j = loadLearning(cfg), { made = false } = {}) {
  if (!toolLearnOn(cfg)) return '';
  const t = j.tools?.[name];
  if (!t) return '';
  const parts = [];
  if (t.notes?.length) parts.push(`Last time: ${t.notes.join(' ')}`);
  if (oftenFails(t)) parts.push(`It often fails here (${t.misses} of ${t.wins + t.misses}): if it fails again, say so and offer to ${made ? 'make it again, better, with make_tool' : 'look into why'}.`);
  return parts.length ? ' ' + parts.join(' ') : '';
}

// For Settings: the scorecard, most misses first.
export function scorecard(cfg) {
  const j = loadLearning(cfg);
  return Object.entries(j.tools).map(([name, t]) => ({ name, wins: t.wins || 0, misses: t.misses || 0, notes: t.notes || [], often: oftenFails(t) }))
    .sort((a, b) => b.misses - a.misses || b.wins - a.wins || a.name.localeCompare(b.name));
}
