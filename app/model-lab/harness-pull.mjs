// Harness compare, the PC's side (21 Nov 2026): the other harnesses run the repository jobs on the pod
// (forge/pod/harness); this waits for the pod's out/bench/harness/done.json, printing progress, then brings every file
// under out/bench/harness home and puts each harness's runs.jsonl where repo-score.mjs reads it (<out>/<run>-<harness>/).
// Run by forge.mjs as a benchmark command, which gives it the door (LAB_DOOR) and its token (LAB_API_KEY).
//   node harness-pull.mjs --out <bob-model-lab/out> [--minutes 50]
import fs from 'node:fs';
import path from 'node:path';

const a = process.argv.slice(2), opt = (k, d = '') => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : d; };
const door = process.env.LAB_DOOR, key = process.env.LAB_API_KEY, out = path.resolve(opt('out', '.')), minutes = Number(opt('minutes', 50));
if (!door || !key) { console.log('harness-pull: no LAB_DOOR / LAB_API_KEY (run it from forge.mjs)'); process.exit(2); }
const hdr = { 'X-Forge-Token': key }, t = () => new Date().toISOString().slice(11, 19);
const get = (p) => fetch(door + encodeURI(p), { headers: hdr, signal: AbortSignal.timeout(120000) });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const home = path.join(out, 'harness-compare', 'pod'); fs.mkdirSync(home, { recursive: true });
let files = [], last = '', done = false;
const t0 = Date.now();
while ((Date.now() - t0) / 60000 < minutes) {
  try {
    const r = await get('/status');
    if (r.ok) {
      const st = await r.json();
      files = (st.files || []).filter((f) => f.path.startsWith('bench/harness/'));
      if (files.some((f) => f.path === 'bench/harness/done.json')) { done = true; break; }
      let prog = ''; if (files.some((f) => f.path === 'bench/harness/progress.txt')) { const p = await get('/out/bench/harness/progress.txt'); if (p.ok) prog = (await p.text()).trim().replace(/\n/g, ', '); }
      const failed = files.some((f) => f.path === 'bench/harness/install-failed');
      const line = failed ? 'the install on the pod FAILED' : prog || (files.some((f) => f.path === 'bench/harness/install-ok') ? 'installed; waiting for the jobs to start' : 'installing on the pod');
      if (line !== last) { console.log(`${t()} harness compare: ${line}`); last = line; }
    } else console.log(`${t()} door answers ${r.status}`);
  } catch (e) { console.log(`${t()} door: ${String(e.message || e).slice(0, 100)}`); }
  await sleep(30000);
}
console.log(`${t()} ${done ? 'the pod says done' : `no done.json after ${minutes} min: bringing home what is there`}; fetching ${files.length} file(s)`);
let got = 0;
for (const f of files) {
  const rel = f.path.slice('bench/harness/'.length), dest = path.join(home, ...rel.split('/'));
  try { const r = await get(`/out/${f.path}`); if (!r.ok) { console.log(`  ${rel}: ${r.status}`); continue; } fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, Buffer.from(await r.arrayBuffer())); got++; } catch (e) { console.log(`  ${rel}: ${String(e.message || e).slice(0, 100)}`); }
}
// each harness's runs where repo-score reads them: <out>/<run>-<harness>/runs.jsonl
for (const d of fs.readdirSync(home, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const src = path.join(home, d.name, 'runs.jsonl');
  if (fs.existsSync(src)) { fs.mkdirSync(path.join(out, d.name), { recursive: true }); fs.copyFileSync(src, path.join(out, d.name, 'runs.jsonl')); console.log(`  ${d.name}: ${fs.readFileSync(src, 'utf8').split('\n').filter(Boolean).length} run(s) -> ${path.join(out, d.name, 'runs.jsonl')}`); }
}
for (const f of ['install.log', 'run.log', 'run-qwen-code.log', 'run-mini-swe-agent.log']) { const p = path.join(home, f); if (fs.existsSync(p)) console.log(`--- ${f} (end)\n${fs.readFileSync(p, 'utf8').trim().split('\n').slice(-6).join('\n')}`); }
console.log(`${t()} ${got} file(s) home in ${home}`);
process.exit(done ? 0 : 1);
