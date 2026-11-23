// forge/store-key.mjs: the Forge reads RUNPOD_API_KEY from Bob's saved keys when the launcher's environment has none
// (the owner: "the key is in bob's environment tables"). A made-up key in a temp folder; never the real store.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { storeKey, storeDataDir } = await import(pathToFileURL(path.join(root, 'model-lab/forge/store-key.mjs')).href);
const { Box } = await import(pathToFileURL(path.join(root, 'src/secret-box.js')).href);
let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) pass++; else fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-store-key-'));
try {
  const home = path.join(tmp, 'Bob'), data = path.join(home, 'inn', 'bob');
  fs.mkdirSync(data, { recursive: true });
  const box = new Box({ key: crypto.randomBytes(32), how: 'test', label: 'test' });
  fs.writeFileSync(path.join(data, 'keys.json'), JSON.stringify({ RUNPOD_API_KEY: box.seal('made-up-key-1') }));
  check('no secret-box.json: nothing read, and no new box made', storeKey('RUNPOD_API_KEY', { home, open: () => box }) === '' && !fs.existsSync(path.join(data, 'secret-box.json')));
  fs.writeFileSync(path.join(data, 'secret-box.json'), '{"v":1,"how":"test"}');
  check('finds inn\\bob under Bob\'s home', storeDataDir(home) === data);
  check('opens the saved key with Bob\'s box', storeKey('RUNPOD_API_KEY', { home, open: () => box }) === 'made-up-key-1');
  check('a box that cannot open it gives nothing', storeKey('RUNPOD_API_KEY', { home, open: () => new Box({ stuck: true }) }) === '');
  check('a key that is not saved gives nothing', storeKey('HF_TOKEN', { home, open: () => box }) === '');
  check('no home given: nothing', storeKey('RUNPOD_API_KEY', { home: '', open: () => box }) === '');
  const forge = fs.readFileSync(path.join(root, 'model-lab/forge/forge.mjs'), 'utf8').replace(/\r\n/g, '\n');
  check('the Forge falls back to the store only with FORGE_BOB_HOME, and never puts the key in process.env', /process\.env\.RUNPOD_API_KEY \|\| \(process\.env\.FORGE_BOB_HOME \?/.test(forge) && !/process\.env\.RUNPOD_API_KEY\s*=/.test(forge));
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
