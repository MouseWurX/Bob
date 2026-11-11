// Smarter memory (setting memoryRecall, "Remember only what fits", off unless the user turns it on).
// Off: Bob's whole memory file (its last 4,000 characters) goes into every prompt, as before.
// On: each message gets only the memory lines that fit it (up to 8, about 1,500 characters at most), plus any line
// the user marked [always]. Each project keeps its own memory bank: lines tagged [project: Name]. While a chat is
// about one project, Bob reads that project's bank and the general lines, never another project's bank. On no
// project, every bank can be matched.
// Matching uses the Memory slot's embedding model (the CPU-only embedder) when it's ready, and plain word overlap
// otherwise (always in the Gaming session, where the embedder never starts). No database, no service: the vectors
// are a small JSON file in inn\bob, filled in by housekeeping when Bob is idle, so a turn only embeds the message.
import fs from 'node:fs';
import { writeJsonAtomic } from './util.js';
import path from 'node:path';
import crypto from 'node:crypto';
import { normName, overlap, cosine } from './topics.js';

export const RECALL_K = 8;          // memory lines per message at most
export const RECALL_CHARS = 1500;   // and never more than this many characters
export const RECENT = 2;            // the newest lines in the bank are kept as a tie-breaker for "what we just did"
const VEC_BATCH = 32;
const VEC_PER_RUN = 256;            // lines embedded per idle housekeeping run

export const recallOn = (cfg) => cfg?.memoryRecall === true;

const PROJECT_TAG = /\[project:\s*([^\]]+)\]/i;
const ALWAYS_TAG = /\[always\]/i;
export const projectOf = (line) => { const m = String(line).match(PROJECT_TAG); return m ? m[1].trim() : ''; };
// What a line says, without the bullet, date and tags (what's matched and what's keyed).
export const factText = (line) => String(line).replace(/^\s*[-*]\s*/, '').replace(/\[(?:topic|project|from|until):[^\]]*\]/gi, '').replace(/\[always\]/gi, '').replace(/\(\d{4}-\d{2}-\d{2}\)/g, '').replace(/\s+/g, ' ').trim();
export const lineKey = (line) => crypto.createHash('sha1').update(normName(factText(line))).digest('hex').slice(0, 16);

// The memory file as lines Bob can pick from (headings and blank lines left out).
// today (YYYY-MM-DD, with "Let memories run out" on): lines whose [until: day] has passed are left out (memory-more.js).
export function parseMemory(text, { today = '' } = {}) {
  return String(text || '').split('\n').map((raw) => raw.trimEnd()).filter((raw) => raw.trim() && !/^\s*#/.test(raw) && factText(raw).length > 3)
    .filter((raw) => { if (!today) return true; const u = raw.match(/\[until:\s*(\d{4}-\d{2}-\d{2})\]/i); return !u || u[1] >= today; })
    .map((raw, i) => ({ raw, i, text: factText(raw), project: projectOf(raw), always: ALWAYS_TAG.test(raw), key: lineKey(raw) }));
}

// Memory banks: the general one plus one per project, with how many lines each holds (for Settings).
export function banks(cfg, text) {
  const lines = parseMemory(text);
  const out = new Map([['', 0]]);
  for (const p of Object.keys(cfg?.projects || {})) out.set(p, 0);
  for (const l of lines) {
    const name = l.project ? ([...out.keys()].find((k) => k && normName(k) === normName(l.project)) ?? l.project) : '';
    out.set(name, (out.get(name) || 0) + 1);
  }
  return [...out].map(([name, lines]) => ({ name, lines }));
}

// Which project's bank a message belongs to: one named in the message, else the one this chat was on,
// else the project of the closest topic note, else the user's main project. '' means general only.
export function activeProject(cfg, text, { sticky = '', topicProject = '', bankNames = [] } = {}) {
  const names = [...new Set([...Object.keys(cfg?.projects || {}), ...bankNames].filter(Boolean))];
  const said = ` ${normName(text)} `;
  const named = names.filter((n) => normName(n) && said.includes(` ${normName(n)} `)).sort((a, b) => b.length - a.length)[0];
  if (named) return { project: named, why: 'named' };
  if (sticky) return { project: sticky, why: 'chat' };
  if (topicProject && names.some((n) => normName(n) === normName(topicProject))) return { project: names.find((n) => normName(n) === normName(topicProject)), why: 'topic' };
  if (cfg?.defaultProject && names.includes(cfg.defaultProject)) return { project: cfg.defaultProject, why: 'main' };
  return { project: '', why: '' };
}

// The lines for one message. lines from parseMemory; vecs: { key: vector } (may be empty); qvec: the message's vector.
// strict ("Keep project memories to their project", memory-more.js): on no project, only the general lines.
export function pickMemories(lines, { text = '', project = '', qvec = null, vecs = {}, k = RECALL_K, maxChars = RECALL_CHARS, strict = false } = {}) {
  // On a project: its bank and the general lines only. On no project: every bank, general lines first on a near tie.
  const inBank = (l) => !l.project || (!project && !strict) || (project && normName(l.project) === normName(project));
  const pool = lines.filter(inBank);
  const always = pool.filter((l) => l.always);
  const rest = pool.filter((l) => !l.always);
  const newest = new Set(rest.slice(-RECENT).map((l) => l.key));
  const scored = rest.map((l) => {
    const v = qvec && vecs[l.key];
    let s = v ? cosine(qvec, v) : overlap(text, l.text) * 0.9;
    if (project && l.project) s += 0.05;        // this project's own bank first, on a near tie
    if (!project && l.project) s -= 0.03;
    if (newest.has(l.key)) s += 0.03;
    return { l, s, by: v ? 'meaning' : 'words' };
  }).filter((x) => x.s >= (x.by === 'meaning' ? 0.55 : 0.34)).sort((a, b) => b.s - a.s);
  const out = [];
  let chars = 0;
  for (const l of always) { out.push(l); chars += l.text.length; }
  for (const { l } of scored) {
    if (out.length >= always.length + k || chars + l.text.length > maxChars) break;
    out.push(l); chars += l.text.length;
  }
  return out.sort((a, b) => a.i - b.i); // in the file's order, which is the order they were learned
}

// The text Bob gets: one short block, the bank named so he knows which project it's from.
export function recallText(picked, { project = '', user = 'the user' } = {}) {
  if (!picked.length) return '';
  const head = project ? `Things you remember that fit this message (${user}'s general memories and the ${project} memory bank):` : `Things you remember about ${user} that fit this message (from your memory file):`;
  return `${head}\n${picked.map((l) => `- ${l.text}${l.project ? ` [${l.project}]` : ''}`).join('\n')}`;
}

// What stays in the instructions when recall is on: only the lines the user marked [always].
export function alwaysText(text, { today = '' } = {}) {
  return parseMemory(text, { today }).filter((l) => l.always).map((l) => `- ${l.text}`).join('\n');
}

// Tag a fact for a project's bank (or leave it general).
export function tagLine(fact, project) {
  const p = String(project || '').replace(/[\][]/g, '').trim().slice(0, 60);
  return p ? `${fact} [project: ${p}]` : fact;
}

// The vectors for memory lines: inn\bob\memory-vectors.json, { model, vecs: { key: [..] } }. Lines that change get a
// new key; keys whose line is gone are dropped on the next fill. Rebuilt from scratch if the embedding model changes.
export class MemoryVectors {
  constructor(cfg) { this.cfg = cfg; this.file = path.join(cfg.dataDir, 'memory-vectors.json'); this.cache = null; }
  load(model) {
    if (!this.cache) { try { this.cache = JSON.parse(fs.readFileSync(this.file, 'utf8')); } catch { this.cache = {}; } }
    if (!this.cache.vecs || (model && this.cache.model && this.cache.model !== model)) this.cache = { model, vecs: {} };
    return this.cache.vecs;
  }
  save() { try { writeJsonAtomic(this.file, this.cache, 0); } catch {} }
  // embed(texts) -> vectors or null. Returns how many lines got a vector.
  async fill(lines, embed, model) {
    const vecs = this.load(model);
    this.cache.model = model;
    const live = new Set(lines.map((l) => l.key));
    let dropped = 0;
    for (const k of Object.keys(vecs)) if (!live.has(k)) { delete vecs[k]; dropped++; }
    const need = lines.filter((l) => !vecs[l.key]).slice(0, VEC_PER_RUN);
    let added = 0;
    for (let i = 0; i < need.length; i += VEC_BATCH) {
      const part = need.slice(i, i + VEC_BATCH);
      const got = await embed(part.map((l) => `${l.project ? l.project + ': ' : ''}${l.text}`));
      if (!got) break;
      part.forEach((l, j) => { if (Array.isArray(got[j])) { vecs[l.key] = got[j]; added++; } });
    }
    if (added || dropped) this.save();
    return added;
  }
  clear() { this.cache = { vecs: {} }; try { fs.rmSync(this.file, { force: true }); } catch {} }
}
