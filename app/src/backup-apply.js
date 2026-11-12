// A restore waits in inn\restore-waiting until Bob starts again (backup.js stageRestore), so nothing Bob is using is
// written over while he runs. At the start, before settings are read (config.js loadConfig), its files go into place.
// Whatever they replace is moved to inn\archive\before restore <date>, never deleted.
import fs from 'node:fs';
import path from 'node:path';
import { writeJsonAtomic } from './util.js';

const pad = (n) => String(n).padStart(2, '0');

export function applyWaitingRestore(cfg, { now = new Date() } = {}) {
  const waiting = path.join(cfg.innDir, 'restore-waiting');
  const planFile = path.join(waiting, 'plan.json');
  if (!fs.existsSync(planFile)) return null;
  let plan = {};
  try { plan = JSON.parse(fs.readFileSync(planFile, 'utf8')); } catch {}
  const stampText = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}${pad(now.getMinutes())}`;
  const keep = path.join(cfg.archiveDir || path.join(cfg.innDir, 'archive'), `before restore ${stampText}`);
  const src = path.join(waiting, 'inn');
  let placed = 0, kept = 0;
  const failed = [];
  const move = (from, to) => {
    fs.mkdirSync(path.dirname(to), { recursive: true });
    try { fs.renameSync(from, to); } catch { fs.copyFileSync(from, to); fs.rmSync(from, { force: true }); }
  };
  const walk = (dir) => {
    for (const n of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
      const p = path.join(dir, n);
      if (fs.lstatSync(p).isDirectory()) { walk(p); continue; }
      const rel = path.relative(src, p);
      const target = path.join(cfg.innDir, rel);
      try {
        if (fs.existsSync(target)) { move(target, path.join(keep, rel)); kept++; }
        move(p, target);
        placed++;
      } catch (e) { failed.push(`${rel.split(path.sep).join('/')}: ${e.code || e.message}`); }
    }
  };
  walk(src);
  const result = { at: now.toISOString(), from: String(plan.from || ''), made: String(plan.made || ''), parts: plan.parts || [], placed, kept, keptIn: kept ? keep : '', failed: failed.slice(0, 20) };
  try { fs.rmSync(waiting, { recursive: true, force: true }); } catch {}
  try { fs.mkdirSync(cfg.dataDir, { recursive: true }); writeJsonAtomic(path.join(cfg.dataDir, 'restore-result.json'), result); } catch {}
  return result;
}
