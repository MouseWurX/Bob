// 22 Nov 2026 (flashnext-tools read of repo1: 21 run_command calls in 6 runs were node with no arguments). With no
// shell and no keyboard a bare interpreter starts, reads nothing and ends with "exit code 0, no output", which reads as
// success. run_command now refuses it before any card and says what to give instead; node with a script still runs.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
process.env.BOB_PLATFORM = 'win32';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-bare-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob'), proj = path.join(tmp, 'proj');
fs.mkdirSync(dataDir, { recursive: true }); fs.mkdirSync(proj, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), logbook: path.join(innDir, 'logbook.md'), readRoots: [innDir, proj], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', projects: { proj }, hands: { enabled: true, run: { on: true }, files: { on: false }, apps: { on: false }, folders: [proj] } };
const brain = new Brain(cfg, () => {});
const t = brain.tools.run_command;
const tryCheck = (a) => { try { t.check(a); return ''; } catch (e) { return String(e.message || e); } };
check('the Run hand gives run_command here', Boolean(t?.check));
const bare = tryCheck({ cmd: 'node', cwd: proj });
check('node with no arguments is refused before any card, with what to give instead', /^Not run: node with no arguments/.test(bare) && /\["test\/run\.js"\]/.test(bare) && /\["-e"/.test(bare), bare);
check('blank arguments count as none', /^Not run: python with no arguments/.test(tryCheck({ cmd: 'python', args: [' '], cwd: proj })) && /\["-c"/.test(tryCheck({ cmd: 'python.exe', args: [], cwd: proj })));
check('node with a script is not refused for this', !/with no arguments/.test(tryCheck({ cmd: 'node', args: ['test/run.js'], cwd: proj })));
check('a program that needs no arguments is not refused for this (git status still has its own rules)', !/with no arguments/.test(tryCheck({ cmd: 'git', args: [], cwd: proj })));
// 22 Nov (repo1: 11 right fixes never ran a check): a request that names one of the user's projects starts with the Run group
check('naming a project by name starts with the Run tools', brain.startGroups('s1', 'Track numbers come out wrong in my proj project: track 3 turns into "30 Song".').has('run'));
check('naming a project by its folder does too', brain.startGroups('s2', `The load figure is upside down in ${proj}. Fix it.`).has('run'));
check('a request about no project does not', !brain.startGroups('s3', 'What is the capital of France?').has('run'));
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
