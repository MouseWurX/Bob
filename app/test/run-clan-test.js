// Tests the Bob clan names: puns on Bob, stable per copy, never repeated.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { copyName, readRoll, FOUNDERS, POOL, BY_JOB, RETIRED } from '../src/clan.js';
import { systemPrompt } from '../src/persona.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-clan-'));
const cfg = { dataDir };

check('workbench copy is Bobcat', copyName(cfg, 'tinker') === 'Bobcat');
check('the same copy keeps its name', copyName(cfg, 'tinker') === 'Bobcat');
const names = ['ledger', 'scout', 'painter'].map((k) => copyName(cfg, k));
check('founders get their own names', names.join() === 'Robert,Bobolink,Bobcasso', names.join());
const rev = copyName(cfg, 'reviewer');
check('the reviewer takes a fresh name from the roll, never Bub', rev === POOL[0] && rev !== 'Bub', rev);
// An older roll (before 1.5.7) that still has Bub as the reviewer moves on to a fresh name, and Bub is never given again.
const oldDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-clan-old-'));
fs.writeFileSync(path.join(oldDir, 'clan.json'), JSON.stringify({ copies: [{ key: 'tinker', name: 'Bobcat' }, { key: 'reviewer', name: 'Bub' }] }));
const moved = copyName({ dataDir: oldDir }, 'reviewer');
const oldRoll = readRoll({ dataDir: oldDir }).copies;
check('an old roll with Bub as reviewer rolls a fresh name and keeps Bub retired', moved === POOL[0] && oldRoll.some((c) => c.name === 'Bub' && c.key === 'reviewer:retired') && copyName({ dataDir: oldDir }, 'reviewer') === moved, moved);
check('Bub is never handed out again', RETIRED.reviewer.includes('Bub') && Array.from({ length: 40 }, (_, i) => copyName({ dataDir: oldDir }, `cloud:x${i}`)).every((n) => n !== 'Bub'));
fs.rmSync(oldDir, { recursive: true, force: true });
const extra = Array.from({ length: POOL.length + 5 }, (_, i) => copyName(cfg, `cloud:test${i}`));
const all = readRoll(cfg).copies.map((c) => c.name.toLowerCase());
check('no two copies ever share a name, even past the name list', new Set(all).size === all.length, `${all.length} copies`);
check('new copies get Bob puns first', extra[0] === 'Bobby Tables' && extra[1] === 'Bob++');
check('after the Bob puns, cloud copies get sci-fi names suited to the job', extra[POOL.length - 1] === 'Zaphod', extra[POOL.length - 1]);
check('every name in the list plays on Bob', [...Object.values(FOUNDERS).map((f) => f.name), ...POOL].every((n) => /bob|bub|robert/i.test(n)));
const sp = systemPrompt({ hat: 'tinker', now: 'now', copy: 'Bobcat' });
check('the workbench prompt knows its name', sp.includes('you go by Bobcat') && !sp.includes('{{'));
check('no leftover placeholders at the front desk', !systemPrompt({ now: 'now' }).includes('{{'));
fs.rmSync(dataDir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
