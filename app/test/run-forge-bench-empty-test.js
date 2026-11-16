// 15 Nov 2026: a benchmark-only Forge run from a fresh copy of Bob. It has no out/lessons or expert counts, and it never
// needs them (run.sh stops at its benchmark step first), so the Forge sends empty stand-ins instead of stopping with
// "missing ...lessons.jsonl" or borrowing an old kit's lessons and tool list. The pre-flight rents nothing.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const forge = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'model-lab', 'forge');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge bench '));
const plan = { run: 'bench-empty-test', benchmark_only: true, counts: 'no-such-counts.json', lessons: 'out/no-such-lessons', gpus: ['NVIDIA H200'], disk_gb: 170, hours_max: 1, dollars_max: 1, rungs: [],
  benchmark: { models: [{ name: 'teacher', file: 'hf:someone/some-GGUF:a.gguf', slots: 1, ctx: 32768, commands: ['node -e 0 -- --hours 0.1 --gate 10:0.6'] }] } };
const planFile = path.join(tmp, 'plan.json');
fs.writeFileSync(planFile, JSON.stringify(plan));
const r = spawnSync(process.execPath, ['forge.mjs', '--plan', planFile, '--preflight'], { cwd: forge, encoding: 'utf8', env: { ...process.env, RUNPOD_API_KEY: 'test-not-a-key', FORGE_NO_RUNPOD_CHECK: '1', FORGE_OUT: tmp, HF_TOKEN: '' } });
const out = `${r.stdout || ''}${r.stderr || ''}`.replace(/\r\n/g, '\n');
check('a benchmark-only plan passes the file check with no lessons or counts on this PC', r.status === 0 && !/missing /.test(out) && /pre-flight OK: nothing rented/.test(out), out.slice(-400));
const stand = path.join(tmp, 'forge', 'bench-empty');
check('the pod gets empty stand-ins, not an old lesson set or tool list', fs.readFileSync(path.join(stand, 'lessons.jsonl'), 'utf8') === '' && fs.readFileSync(path.join(stand, 'toolsets.json'), 'utf8').trim() === '{}' && fs.readFileSync(path.join(stand, 'counts.json'), 'utf8').trim() === '{}');
const p2 = { ...plan, benchmark_only: false, run: 'not-bench' }; fs.writeFileSync(planFile, JSON.stringify(p2));
const r2 = spawnSync(process.execPath, ['forge.mjs', '--plan', planFile, '--preflight'], { cwd: forge, encoding: 'utf8', env: { ...process.env, RUNPOD_API_KEY: 'test-not-a-key', FORGE_NO_RUNPOD_CHECK: '1', FORGE_OUT: tmp, HF_TOKEN: '' } });
check('any other plan still stops when its lessons are missing', r2.status !== 0 && /missing .*no-such-lessons/.test(`${r2.stdout}${r2.stderr}`));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
