// Harness compare, on this PC before any rental (21 Nov 2026). Nothing is installed or downloaded here.
//  1. writes the 33 repository jobs (repo-jobs.mjs, the same jobs Bob's repo1 run used), proves each is sound, and puts
//     them with a copy of repo-jobs.mjs into forge/pod/harness/, which goes to the pod inside forge.tgz
//  2. proves the pod-side runner end to end with stand-in harnesses (no brain): it plants each job, runs the stand-in
//     through the node/npm/git shims, reads back with repoAfter and scores with repo-score.mjs. The "right" stand-in
//     must pass, the "wrong" one must fail, and a run-tests stand-in must pass, or this stops with exit 1
//  3. checks harness.sh parses (bash -n) and that the pinned Node.js, Qwen Code and mini-swe-agent versions exist
//     (registry pages only; nothing is fetched to run)
//   node harness-prep.mjs [--no-net]
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { repoJobs, checkJobs } from './repo-jobs.mjs';
import { scoreRun } from './repo-score.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const pod = path.join(here, 'forge', 'pod', 'harness');
const bad = [], say = (s) => console.log(`[harness prep] ${s}`);
const rows = repoJobs(), unsound = checkJobs(rows);
for (const b of unsound) bad.push(`job not sound: ${b}`);
fs.writeFileSync(path.join(pod, 'jobs.jsonl'), rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
fs.copyFileSync(path.join(here, 'repo-jobs.mjs'), path.join(pod, 'repo-jobs.mjs'));
say(`${rows.length} jobs written to forge/pod/harness/jobs.jsonl (${unsound.length ? 'NOT all sound' : 'all sound'}); repo-jobs.mjs copied beside them`);

// 2. stand-ins through the real runner
const gitBash = ['C:\\Program Files\\Git\\bin\\bash.exe', 'C:\\Program Files\\Git\\usr\\bin\\bash.exe'].find((p) => fs.existsSync(p)) || 'bash';
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-prep-'));
const run = (h, only) => {
  const out = path.join(tmp, 'out', h);
  const r = spawnSync(process.execPath, [path.join(pod, 'harness-run.mjs'), '--jobs', path.join(pod, 'jobs.jsonl'), '--harness', h, '--root', path.join(tmp, 'w'), '--out', out, '--only', only, '--parallel', '2', '--job-minutes', '2', ...(process.platform === 'win32' ? ['--bash', gitBash] : [])], { encoding: 'utf8', windowsHide: true, timeout: 300000 });
  if (r.status !== 0) bad.push(`stand-in ${h} ended with exit ${r.status}: ${String(r.stderr || r.stdout).trim().slice(-400)}`);
  let list = []; try { list = fs.readFileSync(path.join(out, 'runs.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch {}
  return list;
};
const want = { 'stand-in-right': { 'fix-history': 'pass', 'keep-tests': 'pass', 'run-tests': 'pass' }, 'stand-in-wrong': { 'fix-history': 'fail', 'keep-tests': 'fail' } };
for (const [h, exp] of Object.entries(want)) {
  const got = run(h, Object.keys(exp).join(','));
  for (const [k, v] of Object.entries(exp)) {
    const row = got.find((r) => r.key === k);
    if (!row) { bad.push(`${h} ${k}: no run came back`); continue; }
    const s = scoreRun(row);
    const shims = (row.steps?.[0]?.calls || []).filter((c) => c.via === 'shim').length;
    say(`${h.padEnd(14)} ${k.padEnd(12)} -> ${s.verdict.padEnd(5)} (wanted ${v}; ${shims} shim-logged start(s); changed ${(s.changed || []).join(', ') || '-'}; ${[...(s.world || []), ...(s.why || [])].join('; ').slice(0, 160) || 'no faults'})`);
    if (s.verdict !== v) bad.push(`${h} ${k}: scored ${s.verdict}, wanted ${v}`);
    if (h === 'stand-in-right' && k !== 'run-tests' && !s.ran_after) bad.push(`${h} ${k}: the shim did not see the check after the edit`);
  }
}
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}

// 3. the pod script parses, and the pinned versions exist
const sh = spawnSync(gitBash, ['-n', path.join(pod, 'harness.sh')], { encoding: 'utf8', windowsHide: true });
if (sh.status !== 0) bad.push(`harness.sh does not parse: ${sh.stderr.trim().slice(0, 300)}`); else say('harness.sh parses (bash -n)');
if (!process.argv.includes('--no-net')) {
  const pins = Object.fromEntries([...fs.readFileSync(path.join(pod, 'harness.sh'), 'utf8').matchAll(/^(NODE_V|QWEN_V|MINI_V)=(\S+)/gm)].map((m) => [m[1], m[2]]));
  const checks = [
    ['Node.js', `https://nodejs.org/dist/${pins.NODE_V}/node-${pins.NODE_V}-linux-x64.tar.xz`, 'HEAD'],
    ['Qwen Code', `https://registry.npmjs.org/@qwen-code/qwen-code/${pins.QWEN_V}`, 'GET'],
    ['mini-swe-agent', `https://pypi.org/pypi/mini-swe-agent/${pins.MINI_V}/json`, 'GET']];
  for (const [name, url, method] of checks) {
    try {
      const r = await fetch(url, { method, signal: AbortSignal.timeout(20000) });
      let extra = '';
      if (r.ok && name === 'Qwen Code') { const j = await r.json(); extra = ` (needs node ${j.engines?.node || '?'}, bin ${Object.keys(j.bin || {}).join(',')})`; }
      if (r.ok && name === 'mini-swe-agent') { const j = await r.json(); extra = ` (python ${j.info?.requires_python || '?'})`; }
      if (r.ok) say(`${name} ${url.split('/').slice(-2).join('/')} exists${extra}`); else bad.push(`${name}: ${url} answers ${r.status}`);
    } catch (e) { bad.push(`${name}: ${url}: ${String(e.message || e).slice(0, 120)}`); }
  }
}
if (bad.length) { for (const b of bad) console.log(`[harness prep] NOT READY: ${b}`); process.exit(1); }
say('READY: jobs, runner, read-back and score proven on this PC with stand-ins; the real harnesses can only be proven on the pod');
