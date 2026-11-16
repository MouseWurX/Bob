// 1.5.245 stock Qwen in place of Riker and Bobert (src/brain-move.js): on the first start after the update, a job on a
// Riker or Bobert file moves to stock Qwen3.6 35B-A3B once, only when Qwen's file is on this PC. Fake folders only.
// Run: node test/run-brain-move-test.js
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { moveBobBrains, stockFile, STOCK } from '../src/brain-move.js';
import { NEW_DEFAULTS, newDefaults } from '../src/config.js';

let failures = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (!ok) failures++; };

const bobDir = path.join('home', 'models', 'bob');
const full = path.join(bobDir, 'coding', STOCK.full.file), small = path.join(bobDir, 'coding', STOCK.small.file);
const here = (...files) => (p) => files.includes(p);
const riker = path.join(bobDir, 'chat', '28Bob-Q3_K_M.gguf'), bobert = path.join(bobDir, 'coding', '35Bob-Q4_K_M.gguf');
const bobertQ3 = path.join(bobDir, 'coding', '35Bob-Q3_K_M.gguf'), gemma = path.join(bobDir, 'chat', 'gemma-4-26B.gguf');
const cfg = { bobModelsDir: bobDir, models: { bob: riker, tinker: bobert, deep: bobert, office: gemma, painter: '' } };

{
  const { models, moved } = moveBobBrains(cfg, { exists: here(full) });
  check(models.bob === full && models.tinker === full && models.deep === full, 'Riker and Bobert jobs move to stock Qwen');
  check(models.office === gemma && models.painter === '', 'other jobs are left alone');
  check(moved.map((m) => m.job).join() === 'bob,tinker,deep', `the move says which jobs (${moved.map((m) => m.job).join()})`);
  check(cfg.models.bob === riker, 'the settings passed in are not changed in place');
}
{
  const { models, moved } = moveBobBrains(cfg, { exists: here() });
  check(!moved.length && models.bob === riker && models.tinker === bobert, 'no Qwen file here: nothing moves (a job never points at a missing brain)');
  const part = moveBobBrains(cfg, { exists: here(full, full + '.part') });
  check(!part.moved.length, 'a half-downloaded Qwen file doesn\'t count');
}
{
  const c8 = { bobModelsDir: bobDir, models: { tinker: bobertQ3 } };
  check(moveBobBrains(c8, { exists: here(full, small) }).models.tinker === small, 'Bobert\'s 8 GB file moves to Qwen\'s 8 GB file');
  check(moveBobBrains(c8, { exists: here(full) }).models.tinker === full, '...or to the full Qwen when only that is here');
  check(moveBobBrains(cfg, { exists: here(small) }).models.bob === small, 'Riker moves to Qwen\'s 8 GB file when only that is here');
}
{
  const hand = path.join('home', 'models', STOCK.full.id, STOCK.full.file);
  check(stockFile({ bobModelsDir: bobDir }, 'full', here(hand)) === hand, 'a hand copy in a folder named after the model counts');
  const win = { bobModelsDir: bobDir, models: { bob: 'C:\\Bob\\models\\bob\\chat\\28Bob-Riker-Q3_K_M.gguf' } };
  check(moveBobBrains(win, { exists: here(full) }).models.bob === full, 'a Windows path to a Riker file is found too');
  check(!moveBobBrains({ bobModelsDir: bobDir, models: { bob: path.join(bobDir, 'chat', 'Qwen3-4B.gguf') } }, { exists: here(full) }).moved.length, 'a stock brain is never moved');
}
{
  check(NEW_DEFAULTS.some((d) => d.id === 'stock-qwen-brains' && Array.isArray(d.keys) && !d.keys.length && d.moves === 'models'), 'it is a new default that drops no saved setting');
  const kept = { models: { bob: riker }, defaultsSeen: NEW_DEFAULTS.map((d) => d.id).filter((id) => id !== 'stock-qwen-brains') }, applied = [];
  newDefaults(kept, applied);
  check(applied.join() === 'stock-qwen-brains' && kept.models.bob === riker && kept.defaultsSeen.includes('stock-qwen-brains'), 'it runs once, and the saved brains are kept for the move');
  const again = []; newDefaults(kept, again);
  check(!again.length, 'the next start doesn\'t run it again (a switch back to Riker is kept)');
}
{
  const catalog = JSON.parse(fs.readFileSync(fileURLToPath(new URL('../catalog.json', import.meta.url)), 'utf8').replace(/\r\n/g, '\n'));
  for (const s of Object.values(STOCK)) {
    const m = catalog.models.find((x) => x.id === s.id), f = m?.files?.find((x) => x.role === 'gguf');
    check(m && m.category === s.category && f && f.url.endsWith('/' + s.file), `${s.id}: the file name matches catalog.json`);
  }
}

console.log(failures ? `\n${failures} failed` : '\nAll passed');
process.exit(failures ? 1 : 0);
