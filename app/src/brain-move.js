// 1.5.245 (the owner, Nov 16 2026): stock Qwen3.6 35B-A3B is Bob's default brain on 16 GB and 8 GB cards, in place of
// Riker and Bobert, until one of Bob's own brains beats it on a held-out test. A new default reaches everyone
// (NEW_DEFAULTS in config.js, id 'stock-qwen-brains'), so on the first start after the update any job still on a
// Riker or Bobert file moves to stock Qwen once. Only when the Qwen file is already on this PC: Bob never points a job
// at a brain that isn't there. Otherwise the job keeps its brain, and the Brains page shows Qwen as the ★ pick.
// Riker and Bobert stay in the list; a job switched back to one of them later is left alone.
import fs from 'node:fs';
import path from 'node:path';

// Bob's own files (28Bob-*.gguf, 35Bob-*.gguf, in any folder) and the stock file that replaces each.
export const BOB_FILE = /(?:^|[\\/])(28|35)Bob-[^\\/]*?(Q3|Q4)[^\\/]*\.gguf$/i;
export const STOCK = {
  full: { id: 'qwen3.6-35b-a3b', category: 'coding', file: 'Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf' },
  small: { id: 'qwen3.6-35b-a3b-q3', category: 'coding', file: 'Qwen3.6-35B-A3B-UD-Q3_K_XL.gguf' }
};

// Where a catalog download can be on this PC: Bob's models folder by category (how Get models saves it), or a
// folder named after the model beside it (a hand download, models.js idFolderFile). Never half downloaded.
export function stockFile(cfg, which, exists = fs.existsSync) {
  const s = STOCK[which];
  const bobDir = cfg.bobModelsDir || path.join(cfg.agentDir || '', 'models', 'bob');
  for (const p of [path.join(bobDir, s.category, s.file), path.join(path.dirname(bobDir), s.id, s.file)]) {
    if (exists(p) && !exists(p + '.part')) return p;
  }
  return '';
}

// { models, moved: [{ job, from, to }] }: the jobs on a Riker or Bobert file, moved to stock Qwen where it's here.
// Bobert's squeezed (Q3, 8 GB card) file moves to Qwen's squeezed file; every other Bob file to the full one, falling
// back to the squeezed one when only that is here.
export function moveBobBrains(cfg, { exists = fs.existsSync } = {}) {
  const models = { ...(cfg.models || {}) }, moved = [];
  for (const [job, from] of Object.entries(models)) {
    const hit = typeof from === 'string' && from.match(BOB_FILE);
    if (!hit) continue;
    const squeezed = hit[1] === '35' && hit[2].toUpperCase() === 'Q3';
    const to = squeezed ? stockFile(cfg, 'small', exists) || stockFile(cfg, 'full', exists) : stockFile(cfg, 'full', exists) || stockFile(cfg, 'small', exists);
    if (!to) continue;
    models[job] = to;
    moved.push({ job, from, to });
  }
  return { models, moved };
}
