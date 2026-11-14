// 96 Speed history (off until "Speed history" is on, Settings, Speed & memory). After each reply the engine
// already says how many words a second it wrote (speed-stats.js); with the switch on, that number is added to one
// row per day, brain and engine version, in speed-log.json in Bob's data folder. Nothing else is kept: no chat text.
// The Speed & memory panel draws it, and says when a brain got slower after an engine update.
import fs from 'node:fs';
import path from 'node:path';

export const KEEP_DAYS = 90;
export const MAX_ROWS = 2000;
export const SLOWER = 0.85; // 15% or more slower after an engine change is worth saying
export const speedLogFile = (cfg) => path.join(cfg.dataDir, 'speed-log.json');
const dayOf = (ms) => new Date(ms).toISOString().slice(0, 10);

export function readSpeedLog(cfg, { read = fs.readFileSync } = {}) {
  try { const rows = JSON.parse(read(speedLogFile(cfg), 'utf8')); return Array.isArray(rows) ? rows.filter((r) => r && r.day && r.model && r.n > 0) : []; } catch { return []; }
}

// Adds one reply to its day's row. Returns the rows (the caller saves them), or null when there's nothing to add.
export function addReply(rows, { model, tokPerSec, engine = '', now = Date.now() } = {}) {
  if (!model || !(tokPerSec > 0) || tokPerSec > 10000) return null;
  const day = dayOf(now);
  const out = rows.slice();
  const row = out.find((r) => r.day === day && r.model === model && r.engine === engine);
  if (row) { row.n += 1; row.sum = Math.round((row.sum + tokPerSec) * 10) / 10; }
  else out.push({ day, model, engine, n: 1, sum: Math.round(tokPerSec * 10) / 10 });
  const oldest = dayOf(now - KEEP_DAYS * 864e5);
  return out.filter((r) => r.day >= oldest).slice(-MAX_ROWS);
}

export function logReply(cfg, stats, engine, { read, write = fs.writeFileSync, now = Date.now() } = {}) {
  if (cfg?.speedLog !== true || !stats) return false;
  const rows = addReply(readSpeedLog(cfg, read ? { read } : {}), { model: stats.model, tokPerSec: stats.tokPerSec, engine, now });
  if (!rows) return false;
  try { write(speedLogFile(cfg), JSON.stringify(rows)); return true; } catch { return false; }
}

// For the graph: per brain, its days in order with the average words a second, and where the engine changed.
// slower: the engine version after which this brain is 15% or more slower than on the one before.
export function speedSeries(rows = []) {
  const brains = new Map();
  for (const r of [...rows].sort((a, b) => (a.day < b.day ? -1 : a.day > b.day ? 1 : 0))) {
    if (!brains.has(r.model)) brains.set(r.model, []);
    brains.get(r.model).push({ day: r.day, engine: r.engine || '', avg: Math.round((r.sum / r.n) * 10) / 10, n: r.n });
  }
  return [...brains.entries()].map(([model, points]) => {
    const byEngine = [];
    for (const p of points) {
      const last = byEngine[byEngine.length - 1];
      if (last && last.engine === p.engine) { last.sum += p.avg * p.n; last.n += p.n; } else byEngine.push({ engine: p.engine, sum: p.avg * p.n, n: p.n, from: p.day });
    }
    let slower = null;
    for (let i = 1; i < byEngine.length; i++) {
      const before = byEngine[i - 1].sum / byEngine[i - 1].n, after = byEngine[i].sum / byEngine[i].n;
      if (before > 0 && after < before * SLOWER) slower = { engine: byEngine[i].engine, from: byEngine[i - 1].engine, before: Math.round(before * 10) / 10, after: Math.round(after * 10) / 10, day: byEngine[i].from };
    }
    return { model, points, changes: byEngine.slice(1).map((e) => ({ day: e.from, engine: e.engine })), slower };
  });
}
