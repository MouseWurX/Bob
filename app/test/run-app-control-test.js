// 1.5.204 Smart App Control planning (src/app-control.js): Bob reads whether it's on, tries a new engine before it
// takes the old one's place, keeps the old one when Windows stops the new one, and the release check lists unsigned
// files. Fake registry output, fake program runs and made-up program files only: nothing real is run or read.
// Run: node test/run-app-control-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { sacFromReg, sacState, signedPe, unsignedIn, looksBlocked, countDevices, tryEngine, readBlocks, wasBlocked, noteBlocked, clearBlocked, SAC_WORDS } from '../src/app-control.js';
import { trialOrKeep, setEngineTrial, ENGINES } from '../src/engines.js';
import { tipsFrom } from '../src/pc-check.js';
import { report, markdown } from '../installer/check-signed.js';

let failures = 0, passed = 0;
const check = (ok, name) => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}`); if (ok) passed++; else failures++; };

// The registry value, as reg.exe prints it.
const reg = (v) => `\r\nHKEY_LOCAL_MACHINE\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy\r\n    VerifiedAndReputablePolicyState    REG_DWORD    0x${v}\r\n`;
check(sacFromReg(reg(1)) === 'on' && sacFromReg(reg(2)) === 'evaluation' && sacFromReg(reg(0)) === 'off', 'Smart App Control on, trial mode and off are read from the registry value');
check(sacFromReg('') === 'unknown' && sacFromReg(reg(7)) === 'unknown', 'no value, or a value Bob doesn\'t know: unknown, never a guess');
check(await sacState({ platform: 'linux', reg: async () => { throw new Error('must not be asked'); } }) === 'none', 'Linux, Mac and Android: nothing is asked');
check(await sacState({ platform: 'win32', reg: async () => reg(1) }) === 'on', 'Windows: asks the registry (a fake here)');
check(/never|keeps the old one/.test(SAC_WORDS.on) && /trial/.test(SAC_WORDS.evaluation), 'plain words for each state');

// Made-up Windows program files: a PE header with or without a security directory.
function pe({ signed, magic = 0x20b } = {}) {
  const b = Buffer.alloc(1024);
  b.writeUInt16LE(0x5a4d, 0); b.writeUInt32LE(0x80, 0x3c); b.writeUInt32LE(0x00004550, 0x80);
  const opt = 0x80 + 24; b.writeUInt16LE(magic, opt);
  const dirs = opt + (magic === 0x20b ? 112 : 96);
  b.writeUInt32LE(16, dirs - 4);
  if (signed) { b.writeUInt32LE(0x400, dirs + 32); b.writeUInt32LE(0x200, dirs + 36); }
  return b;
}
check(signedPe(pe({ signed: true })) === true && signedPe(pe({ signed: false })) === false, '64-bit program file: signed and unsigned told apart');
check(signedPe(pe({ signed: true, magic: 0x10b })) === true && signedPe(pe({ signed: false, magic: 0x10b })) === false, '32-bit program file too');
check(signedPe(Buffer.from('not a program')) === null && signedPe(Buffer.alloc(0)) === null, 'anything else: not a program file');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sac-'));
const dir = path.join(tmp, 'engine');
fs.mkdirSync(path.join(dir, 'sub'), { recursive: true });
fs.writeFileSync(path.join(dir, 'llama-server.exe'), pe({ signed: false }));
fs.writeFileSync(path.join(dir, 'cudart64_13.dll'), pe({ signed: true }));
fs.writeFileSync(path.join(dir, 'sub', 'ggml-cuda.dll'), pe({ signed: false }));
fs.writeFileSync(path.join(dir, 'README.md'), 'text');
check(JSON.stringify(unsignedIn(dir)) === JSON.stringify(['llama-server.exe', 'sub/ggml-cuda.dll']), 'the unsigned program files in a folder, sub-folders too; signed ones and text left out');
const rows = report([dir, path.join(tmp, 'nope')]);
const md = markdown(rows);
check(rows[0].files.length === 2 && rows[1].missing && /Unsigned Windows files: 2/.test(md) && /Smart App Control/.test(md), 'the release check lists them, and says a missing folder');
check(/Every Windows program file is signed/.test(markdown([{ dir: 'x', files: [] }])), 'all signed: says so');

// How Windows says "stopped".
check(looksBlocked({ error: Object.assign(new Error('spawn UNKNOWN'), { code: 'UNKNOWN', errno: -4094 }) }), 'spawn UNKNOWN (what the PC saw on 1.5.203) is a block');
check(looksBlocked({ code: 0xC0000428 }) && looksBlocked({ code: -1073740760 }), 'a library stopped (0xC0000428, either sign) is a block');
check(!looksBlocked({ code: 1 }) && !looksBlocked({ code: 0 }) && !looksBlocked({ error: Object.assign(new Error('x'), { code: 'ENOENT' }) }), 'an ordinary failure or a missing file isn\'t');
check(countDevices('Available devices:\n  CUDA0: NVIDIA GeForce RTX 5070 Ti (16302 MiB, 15000 MiB free)\n') === 1 && countDevices('Available devices:\n') === 0, 'graphics cards counted from --list-devices');

// Try before swap.
const be = { ...ENGINES.find((e) => e.id === 'brainengine'), exe: 'llama-server.exe', name: 'Brain Engine' };
const oldDir = path.join(tmp, 'old'); fs.mkdirSync(oldDir); fs.writeFileSync(path.join(oldDir, 'llama-server.exe'), pe({ signed: false }));
const card = 'Available devices:\n  CUDA0: NVIDIA GeForce RTX 5070 Ti (16302 MiB, 15000 MiB free)\n';
const runs = [];
const fake = (byDir) => async (exe, args) => { runs.push([exe, args]); return byDir[path.dirname(exe)]; };
let r = await tryEngine(dir, be, { platform: 'win32', old: oldDir, run: fake({ [dir]: { ok: false, blocked: true, code: 'UNKNOWN', out: '' } }) });
check(r.ok === false && r.why === 'blocked' && /Smart App Control/.test(r.words) && /kept the Brain Engine you have/.test(r.words), 'Windows stops the new engine: not ok, and the words say the old one stays');
check(runs[0][1].join(' ') === '--list-devices', 'the trial is --list-devices (it loads the card libraries, then exits)');
r = await tryEngine(dir, be, { platform: 'win32', old: oldDir, run: fake({ [dir]: { ok: true, blocked: false, code: 0, out: 'Available devices:\n' }, [oldDir]: { ok: true, code: 0, out: card } }) });
check(r.ok === false && r.why === 'lost-card' && /graphics card/.test(r.words), 'the new one runs but lost the card the old one sees (a stopped ggml-cuda.dll): not ok');
r = await tryEngine(dir, be, { platform: 'win32', old: oldDir, run: fake({ [dir]: { ok: true, code: 0, out: card }, [oldDir]: { ok: true, code: 0, out: card } }) });
check(r.ok === true, 'runs and sees the card: ok');
r = await tryEngine(dir, be, { platform: 'win32', run: fake({ [dir]: { ok: false, blocked: false, code: 1, out: '' } }) });
check(r.ok === true, 'an ordinary failure isn\'t treated as Windows stopping it (the usual checks handle it)');
runs.length = 0;
r = await tryEngine(dir, be, { platform: 'linux', run: fake({}) });
check(r.ok === true && runs.length === 0, 'Linux, Mac and Android: nothing is run');
r = await tryEngine(dir, { ...ENGINES.find((e) => e.id === 'piper'), exe: 'piper.exe' }, { platform: 'win32', run: fake({}) });
check(r.ok === true && runs.length === 0, 'other engines aren\'t tried');
const standIn = path.join(tmp, 'stand-in'); fs.mkdirSync(standIn); fs.writeFileSync(path.join(standIn, 'llama-server.exe'), 'not a program');
r = await tryEngine(standIn, be, { platform: 'win32', run: fake({}) });
check(r.ok === true && runs.length === 0, 'a file that isn\'t a real program (other tests\' stand-ins) is never run, even on Windows');

// The engine-install hook: blocked -> the new folder goes, the old one stays, the build is remembered.
const cfg = { agentDir: path.join(tmp, 'home') };
fs.mkdirSync(cfg.agentDir);
const folder = path.join(cfg.agentDir, 'brain-engine'); fs.mkdirSync(folder); fs.writeFileSync(path.join(folder, 'llama-server.exe'), 'old');
const stage = folder + '.new'; fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, 'llama-server.exe'), 'new');
const mark = { version: 'brain-engine-b12282', print: 'sha256:abc' };
setEngineTrial(async () => ({ ok: false, why: 'blocked', words: 'stopped' }));
let err = null;
try { await trialOrKeep(cfg, be, stage, folder, mark); } catch (e) { err = e; }
check(err?.blocked === 'blocked' && err.message === 'stopped', 'blocked: the install stops with the plain reason');
check(!fs.existsSync(stage) && fs.readFileSync(path.join(folder, 'llama-server.exe'), 'utf8') === 'old', 'the new folder is gone and the old engine is untouched');
check(wasBlocked(cfg, 'brainengine', { print: 'sha256:abc' }) && !wasBlocked(cfg, 'brainengine', { print: 'sha256:new' }), 'the stopped build is remembered by its file, so a rebuilt (signed) one is still fetched');
fs.mkdirSync(stage); fs.writeFileSync(path.join(stage, 'llama-server.exe'), 'new');
setEngineTrial(async () => ({ ok: true }));
await trialOrKeep(cfg, be, stage, folder, mark);
check(fs.existsSync(stage) && !readBlocks(cfg).brainengine, 'a build that runs goes ahead, and the old note is cleared');
setEngineTrial(null);
noteBlocked(cfg, 'llamacpp', { version: 'b12300' }, 'blocked'); clearBlocked(cfg, 'llamacpp');
check(!wasBlocked(cfg, 'llamacpp', { version: 'b12300' }), 'clearing a note works');

// Check this PC.
const tip = (sac) => tipsFrom({ sac }).tips.find((t) => t.id === 'smart-app-control');
check(/is on/.test(tip(1)?.title || '') && /never changes/.test(tip(1).steps.join(' ')), 'Check this PC: on, with "Bob never changes this setting"');
check(/trial mode/.test(tip(2)?.title || ''), 'Check this PC: trial mode explained');
check(!tip(0) && tipsFrom({ sac: 0 }).fine.some((f) => /Smart App Control is off/.test(f)), 'off: one fine line, no tip');
check(!tip(undefined) && !tipsFrom({}).fine.some((f) => /Smart App Control/.test(f)), 'not known (Linux, Mac): nothing said');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${passed} passed, ${failures} failed`);
if (failures) process.exit(1);
