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
// 23 Nov (after2-qwen): every variant said "0 to go" and the Forge still rented a card for nothing
const pf = (cmds) => { fs.writeFileSync(planFile, JSON.stringify({ ...plan, run: 'to-go', rent_minutes: 30, benchmark: { models: [{ ...plan.benchmark.models[0], commands: cmds }] } })); const x = spawnSync(process.execPath, ['forge.mjs', '--plan', planFile, '--preflight'], { cwd: forge, encoding: 'utf8', env: { ...process.env, RUNPOD_API_KEY: 'test-not-a-key', FORGE_NO_RUNPOD_CHECK: '1', FORGE_OUT: tmp, HF_TOKEN: '' } }); return { code: x.status, out: `${x.stdout}${x.stderr}` }; };
let sayN = 0;
const say = (lines) => { const f = path.join(tmp, `say-${++sayN}`, 'do-jobs.mjs'); fs.mkdirSync(path.dirname(f), { recursive: true }); // a stand-in do-jobs that prints its pre-flight lines
  fs.writeFileSync(f, `console.log(${JSON.stringify(lines.join('\n'))});`); return `node "${f}" --hours 0.1`; };
const none = pf([say(['[a] pre-flight: 30 already run in this folder, 0 to go', '[b] pre-flight: 36 already run in this folder, 0 to go'])]);
check('a benchmark-only plan with nothing left to run is refused: nothing is rented', none.code !== 0 && /PRE-FLIGHT FAIL: nothing to run: every job in the plan's 2 job folder\(s\) has already run/.test(none.out) && /Not renting/.test(none.out), none.out.slice(-400));
const some = pf([say(['[a] pre-flight: 30 already run in this folder, 0 to go', '[b] pre-flight: 0 already run in this folder, 14 to go'])]);
check('one job left to run is enough to rent', some.code === 0 && /pre-flight OK: nothing rented/.test(some.out), some.out.slice(-400));
// 23 Nov 2026: office protect's pod sat an hour after the PC finished (a llama-server that wouldn't stop on a plain kill)
const runSh = fs.readFileSync(path.join(forge, 'pod', 'run.sh'), 'utf8').replace(/\r\n/g, '\n');
const fn = (runSh.match(/^stop_bench_server\(\) \{[\s\S]*?; \}\n/m) || [''])[0];
check('the pod stops each benchmark brain with a time limit, then a hard kill', /kill -9/.test(fn) && /stop_bench_server \$BS/.test(runSh) && !/kill \$BS 2>\/dev\/null; wait \$BS/.test(runSh));
if (process.platform !== 'win32' && fn) {
  const t0 = Date.now();
  const b = spawnSync('bash', ['-c', `${fn}\nsleep() { command sleep 0.05; }\nbash -c 'trap "" TERM; while :; do command sleep 1; done' & P=$!\ncommand sleep 0.5\nstop_bench_server $P\nkill -0 $P 2>/dev/null && echo ALIVE || echo GONE`], { encoding: 'utf8', timeout: 30000 });
  check('a server that ignores the stop signal is killed hard, without the hour-long wait', /GONE/.test(b.stdout) && /killed hard/.test(b.stdout) && Date.now() - t0 < 20000, `${b.stdout}${b.stderr}`.slice(-200));
}
const fm = fs.readFileSync(path.join(forge, 'forge.mjs'), 'utf8');
check('the PC deletes the pod itself when every brain is done here and the pod never says done', /bench-grace-minutes/.test(fm) && /the pod never said done/.test(fm) && /want\.every\(\(n\) => benchDone\.has\(n\)\)/.test(fm));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
