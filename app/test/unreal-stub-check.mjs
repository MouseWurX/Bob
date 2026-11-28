// Runs Bob's two Unreal scripts (src/unreal-tools.js) in Python against a stand-in "unreal" module
// (test/unreal-stub/unreal.py), to check their logic without an editor. Not part of npm test: it needs python3.
//   node test/unreal-stub-check.mjs
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { LOOK_SCRIPT, EDIT_SCRIPT } from '../src/unreal-tools.js';

const stub = path.join(path.dirname(fileURLToPath(import.meta.url)), 'unreal-stub');
const wrap = (body) => `import json\ntry:\n${body.split('\n').map((l) => `    ${l}`).join('\n')}\nexcept Exception as e:\n    print('BOBJSON:' + json.dumps({'ok': False, 'error': str(e)}))\n`;
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 400) : ''}`); };
const run = (code) => {
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'bob-ue-')), 'job.py');
  fs.writeFileSync(f, code);
  return execFileSync('python3', [f], { env: { PYTHONPATH: stub, PATH: process.env.PATH }, encoding: 'utf8' }).trim().split('\n').map((l) => JSON.parse(l.slice('BOBJSON:'.length)));
};
const [ed, look] = run(`${wrap(EDIT_SCRIPT([{ op: 'spawn', kind: 'cube', label: 'Crate', location: [0, 0, 50] }, { op: 'spawn', kind: 'point_light', location: [0, 0, 300] }, { op: 'move', actor: 'Crate', by: [100, 0, 0] }, { op: 'set_material', actor: 'Crate', material: '/Game/M_Red' }, { op: 'rename', actor: 'Floor', new_label: 'Ground' }, { op: 'move', actor: 'Ground', scale: [2, 2, 1] }, { op: 'import', file: '/tmp/x/chair.fbx', folder: '/Game/Bob' }, { op: 'save_level' }]))}\n${wrap(LOOK_SCRIPT)}`);
check('every step runs, labels made by earlier steps count', ed.ok && ed.done.length === 8, JSON.stringify(ed));
check('look sees the result', look.count === 3 && look.actors.find((a) => a.label === 'Crate')?.location[0] === 100 && look.actors.find((a) => a.label === 'Ground')?.scale[0] === 2, JSON.stringify(look));
const [bad, after] = run(`${wrap(EDIT_SCRIPT([{ op: 'spawn', kind: 'cube', label: 'X' }, { op: 'delete', actor: 'X' }, { op: 'move', actor: 'X', location: [0, 0, 0] }]))}\n${wrap(LOOK_SCRIPT)}`);
check('a wrong step: nothing changes', !bad.ok && /step 3 \(move\): there is no actor labelled "X"/.test(bad.error) && after.count === 1, JSON.stringify([bad, after]));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
