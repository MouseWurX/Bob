// The tool record (Nov 13, the owner: "we have notes and a memory system for him", "it may not save it in a way that
// is helpful?", "we should look at what is saved and how"). The job ledger already keeps every call word for word
// (handoff.js), but only while the job is on the list, without the ask or the thinking, and Bob can't read it back.
// This keeps the same entries after the job, so Bob can look up his real reasons instead of guessing.
// - Code writes it, never the brain: one fixed entry per tool call, word for word, nothing summarized.
//   { at, job, turn, ask, plan, tool, args, ok, result, thought }
//   ask = the person's message (start of it); plan = the steps read from it (job-steps.js), if there were several;
//   args = the exact inputs; ok = true, false or "declined"; result = the raw answer (start of it);
//   thought = the end of the brain's thinking just before the call, word for word (empty if the brain doesn't think).
// - E-mail is never kept (read_email and manage_email results are left out), nor guest or other Bobs' jobs.
// - Bob reads it with tool_record: by tool, by worked or missed, by job, or by words. It's fetched only when needed,
//   so nothing is added to the start of a job. A tool set aside after three misses points to its entries.
// - One file on this replicant matrix, <data>/tool-record.jsonl, the newest 500 entries. Settings, How Bob works,
//   "Keep a record of my tool calls" (on: it's a reliability fix); turning it off deletes the file.
// - Nov 14 (the owner): when the live tool shapes change (tool-sets.js shapeStamp), the record starts fresh. The old
//   history isn't deleted: it moves to <data>/tool-record-archive/, named by date and shape, for lessons.
import fs from 'node:fs';
import path from 'node:path';
import { shapeStamp } from './tool-sets.js';

export const KEEP = 500;
export const SIZES = { ask: 400, args: 2000, result: 1000, thought: 800, plan: 6 };
const NOT_KEPT = new Set(['read_email', 'manage_email', 'tool_record']);
export const recordOn = (cfg) => cfg?.toolRecord !== false;
export const recordFile = (cfg) => path.join(cfg.dataDir || cfg.innDir || '.', 'tool-record.jsonl');
export const shapeFile = (cfg) => path.join(path.dirname(recordFile(cfg)), 'tool-record.shape');
export const archiveDir = (cfg) => path.join(path.dirname(recordFile(cfg)), 'tool-record-archive');

// New tool shapes: the history so far goes to the archive and the record starts fresh. A record with no stamp yet was
// made with the shapes live today, so it just gets stamped. Returns the archive file when one was made.
export function newShapeCheck(cfg, stamp = shapeStamp(cfg), now = new Date()) {
  const f = recordFile(cfg), sf = shapeFile(cfg);
  let was = '';
  try { was = fs.readFileSync(sf, 'utf8').trim(); } catch {}
  if (was === stamp) return null;
  let moved = null;
  if (was && fs.existsSync(f)) {
    const day = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    fs.mkdirSync(archiveDir(cfg), { recursive: true });
    let to = path.join(archiveDir(cfg), `tool-record-${day}-shape-${was.replace(/[^\w+.-]/g, '_')}.jsonl`);
    for (let n = 2; fs.existsSync(to); n++) to = to.replace(/(?:-\d+)?\.jsonl$/, `-${n}.jsonl`);
    fs.renameSync(f, to);
    moved = to;
  }
  fs.mkdirSync(path.dirname(sf), { recursive: true });
  fs.writeFileSync(sf, stamp + '\n');
  return moved;
}
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n)}…` : t; };
const tail = (s, n) => { const t = String(s ?? '').trim(); return t.length > n ? `…${t.slice(-n)}` : t; };

// The fixed entry for one call. Pure: tests build entries with it.
export function entryOf({ name, args, text, ctx = {}, at = Date.now() }) {
  const t = String(text ?? '');
  const ok = /^The user said no|said no to this/i.test(t) ? 'declined' : !/^Error:|^Not run:/.test(t);
  return {
    at, job: String(ctx.job?.id || ''), turn: String(ctx.askId || ''),
    ask: clip(ctx.turnText, SIZES.ask),
    plan: Array.isArray(ctx.stepsAsked) ? ctx.stepsAsked.slice(0, SIZES.plan).map((s) => clip(s, 120)) : [],
    tool: String(name || ''),
    args: clip(typeof args === 'string' ? args : JSON.stringify(args ?? {}), SIZES.args),
    ok,
    result: NOT_KEPT.has(name) ? '(e-mail: not kept in the record)' : clip(t, SIZES.result),
    thought: tail(ctx.lastThought?.text, SIZES.thought)
  };
}

// Adds one entry (after every tool call). Never throws: a record that can't be written never breaks a job.
export function keepRecord(cfg, name, args, text, ctx) {
  try {
    if (!recordOn(cfg) || !name || NOT_KEPT.has(name) || ctx?.job?.guest) return null;
    const e = entryOf({ name, args, text, ctx });
    const f = recordFile(cfg);
    fs.mkdirSync(path.dirname(f), { recursive: true });
    try { newShapeCheck(cfg); } catch {}
    fs.appendFileSync(f, JSON.stringify(e) + '\n');
    if (fs.statSync(f).size > KEEP * 6000) trim(cfg);
    return e;
  } catch { return null; }
}
export function trim(cfg, keep = KEEP) {
  const all = readRecord(cfg);
  if (all.length > keep) fs.writeFileSync(recordFile(cfg), all.slice(-keep).map((e) => JSON.stringify(e)).join('\n') + '\n');
}
export function readRecord(cfg) {
  try { return fs.readFileSync(recordFile(cfg), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean); } catch { return []; }
}
export function forgetRecord(cfg) { try { fs.rmSync(recordFile(cfg), { force: true }); } catch {} }

// Search, newest first. outcome: missed | worked | any. job: "this" (the current job), "last" (the one before), or an id.
export function findRecord(cfg, { tool = '', outcome = 'any', job = '', words = '', last = 5 } = {}, ctx = {}) {
  let all = readRecord(cfg);
  if (job === 'this') all = all.filter((e) => e.job && e.job === String(ctx.job?.id || ''));
  else if (job === 'last') { const ids = [...new Set(all.map((e) => e.job).filter((j) => j && j !== String(ctx.job?.id || '')))]; const id = ids.at(-1); all = all.filter((e) => e.job === id); }
  else if (job) all = all.filter((e) => e.job === String(job));
  if (tool) all = all.filter((e) => e.tool === String(tool) || e.tool.startsWith(`${tool}:`));
  if (outcome === 'missed') all = all.filter((e) => e.ok === false);
  else if (outcome === 'worked') all = all.filter((e) => e.ok === true);
  if (words) { const w = String(words).toLowerCase(); all = all.filter((e) => [e.ask, e.args, e.result, e.thought].join(' ').toLowerCase().includes(w)); }
  return all.slice(-Math.max(1, Math.min(10, Number(last) || 5))).reverse();
}

const when = (t) => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
export function showEntry(e) {
  return [`— ${when(e.at)} · ${e.tool} · ${e.ok === true ? 'worked' : e.ok === 'declined' ? 'the user said no' : 'missed'}${e.job ? ` · job ${e.job.slice(0, 8)}` : ''}`,
    e.ask ? `Asked: ${e.ask}` : '', e.plan?.length ? `Steps read from the ask: ${e.plan.join(' / ')}` : '',
    e.thought ? `Thinking just before: ${e.thought}` : 'Thinking just before: (none saved)', `Inputs: ${e.args}`, `Result: ${e.result}`].filter(Boolean).join('\n');
}

const fn = (name, description, properties) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required: [] } } });
export function toolRecordTool(cfg) {
  return {
    schema: fn('tool_record', 'Your saved tool calls, word for word (ask, inputs, result, thinking). For "why did you...". Quote it; never guess.', {
      tool: { type: 'string' },
      outcome: { type: 'string', enum: ['missed', 'worked', 'any'] },
      job: { type: 'string', description: 'this, last or an id' },
      words: { type: 'string' },
      last: { type: 'integer', description: '1-10' }
    }),
    async run(args = {}, ctx = {}) {
      if (!recordOn(cfg)) return 'The tool record is off (Settings, How Bob works, "Keep a record of my tool calls"), so there\'s nothing saved to look at.';
      const found = findRecord(cfg, args, ctx);
      if (!found.length) return `Nothing in the tool record${args.tool ? ` for ${args.tool}` : ''}${args.outcome && args.outcome !== 'any' ? ` that ${args.outcome}` : ''}. Say so; don't guess a reason.`;
      return `The tool record (saved by the app as it happened, ${found.length} entr${found.length === 1 ? 'y' : 'ies'}, newest first):\n${found.map(showEntry).join('\n')}`;
    },
    summary: ({ tool, outcome }) => `record: ${tool || 'tools'}${outcome && outcome !== 'any' ? ` (${outcome})` : ''}`
  };
}
