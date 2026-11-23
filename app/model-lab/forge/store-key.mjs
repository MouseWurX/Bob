// 23 Nov 2026 (the owner: "the key is in bob's environment tables"): when the Forge is started from a launcher and
// RUNPOD_API_KEY isn't in its environment, it reads the key from Bob's own locked store (Settings, saved keys:
// inn\bob\keys.json, opened with Bob's box, src/secret-box.js). FORGE_BOB_HOME names Bob's home folder (the one with
// inn\ in it). The key stays in this process: it is never printed, logged or handed to the commands the Forge runs.
// A store that isn't there is left alone (no new box is made).
import fs from 'node:fs';
import path from 'node:path';
import { openBox, useBox, useKeysFile, savedKey } from '../../src/secret-box.js';

export function storeDataDir(home) {
  if (!home) return '';
  for (const d of [path.join(home, 'inn', 'bob'), path.join(home, 'bob'), home]) if (fs.existsSync(path.join(d, 'keys.json'))) return d;
  return '';
}

export function storeKey(name, { home = process.env.FORGE_BOB_HOME || '', open = openBox } = {}) {
  const dir = storeDataDir(home);
  if (!dir || !fs.existsSync(path.join(dir, 'secret-box.json'))) return '';
  useBox(open({ dataDir: dir }));
  useKeysFile(path.join(dir, 'keys.json'));
  try { return savedKey(name) || ''; } catch { return ''; }
}
