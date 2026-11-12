// Check again after every engine update (Nov 11), off unless switched on (Settings, Lab: "Check my main brain after
// engine updates"). Engines update about weekly. When the Lab's engine build changes, the quick quiz is queued for
// Bob's main brain; it runs from the Lab's queue once Bob has been quiet for a while. When it's done, its score and
// speed are set beside the ones from before the update, and Bob says so in chat if either dropped by more than luck.
import path from 'node:path';
import { readJson, writeJson } from './lab-jobs.js';

export const recheckOn = (cfg) => cfg?.labRecheck === true;
export const DROP_POINTS = 5;   // a score drop smaller than this (or than the measured wobble) is luck
export const DROP_SPEED = 0.1;  // 10% slower is worth a word
export const QUIET_MIN = 10;    // minutes Bob must have been quiet before the check runs

const fileOf = (cfg) => path.join(cfg.dataDir, 'lab', 'recheck.json');
export const readRecheck = (cfg) => readJson(fileOf(cfg), {});

// The row the scoreboard has for a brain: by its id, or by its name for scores made before ids were kept.
export const rowFor = (rows, brain) => (rows || []).find((r) => (r.brainId && r.brainId === brain.id)) || (rows || []).find((r) => r.name === brain.name) || null;
const quizOf = (row) => (row && row.scores?.quiz != null && !(row.old || []).includes('quiz') ? { score: row.scores.quiz, tps: row.tps ?? null, wobble: row.wobble?.quiz ?? null } : null);

// What changed, in words, or '' when nothing dropped by more than luck. before/after: { score, tps, wobble }.
export function dropLine(name, before, after, engine = '') {
  if (!before || !after) return '';
  const luck = Math.max(DROP_POINTS, before.wobble || 0, after.wobble || 0);
  const out = [];
  if (before.score - after.score > luck) out.push(`the Lab test went from ${before.score} to ${after.score}`);
  if (before.tps && after.tps && (before.tps - after.tps) / before.tps > DROP_SPEED) out.push(`speed went from ${before.tps} to ${after.tps} words a second`);
  if (!out.length) return '';
  return `🧪 After the engine update${engine ? ` (${engine})` : ''}, ${name} slipped: ${out.join(', and ')}. Settings, Engines has Go back if you'd rather the old build.`;
}

// One look, from the Lab queue's timer. ctx: { lab, queue, mainId, version, engine, rows }.
// Returns what it did: 'off', 'same', 'baseline', 'queued', 'waiting', 'checked', 'nobrain'.
export function recheckTick({ lab, queue, mainId, version, engine = '', rows = [] }) {
  const cfg = lab.cfg;
  if (!recheckOn(cfg)) return 'off';
  const st = readRecheck(cfg);
  // A queued check that has finished: compare, say so, keep the result.
  if (st.pending) {
    const item = queue.items.find((x) => x.id === st.pending.queueId);
    if (item && (item.state === 'waiting' || item.state === 'running')) return 'waiting';
    const brain = lab.brains().find((b) => b.id === st.pending.brainId);
    const after = brain ? quizOf(rowFor(rows, brain)) : null;
    const ran = item?.state === 'done' && Boolean(after);
    const line = ran ? dropLine(st.pending.name, st.pending.before, after, st.pending.engine) : '';
    const last = { name: st.pending.name, engine: st.pending.engine, before: st.pending.before, after: ran ? after : null, when: new Date().toISOString().slice(0, 10), warn: line, ...(ran ? {} : { note: item?.note || 'The check didn\'t finish.' }) };
    writeJson(fileOf(cfg), { version: st.version, last });
    if (line) lab.broadcast({ type: 'lab-recheck', text: line });
    return 'checked';
  }
  if (!version) return 'same';
  if (!st.version) { writeJson(fileOf(cfg), { ...st, version }); return 'baseline'; } // switched on: this build is the one to compare against
  if (st.version === version) return 'same';
  const brain = lab.brains().find((b) => b.id === mainId);
  if (!brain) { writeJson(fileOf(cfg), { ...st, version }); return 'nobrain'; } // the main brain isn't one the Lab can run
  const before = quizOf(rowFor(rows, brain));
  const q = queue.add({ kind: 'challenge', label: `Check ${brain.name} after the engine update`, body: { challenge: { from: brain.id, packs: ['quiz'] } }, idle: true });
  const queueId = q.items.at(-1)?.id;
  writeJson(fileOf(cfg), { ...st, version, pending: { queueId, brainId: brain.id, name: brain.name, engine, before } });
  return 'queued';
}
