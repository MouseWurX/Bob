// Tier sweep (Forge build 23): one tier's run, through a fresh Bob on a rented pod, with Bob's DEFAULTS only.
// tier-run.sh starts Bob (an empty home, the newest published release) and the 1-second card log, then runs this:
//   1. Bob's own hardware check (/api/hardware) and the set he picks for it (suggestedPack).
//   2. Get Bob ready, the way the window builds it (public/equip.js readyList, from the release itself), cut to the
//      brain in the set's "bob" slot and the programs it runs on. Bob downloads them and fills the slots himself.
//   3. "hi" through Bob's chat (warm-up, loads the brain with Bob's own engine settings; not timed).
//   4. Bob's engine as he started it: its command line, /props, the build it reports.
//   5. One short held-out tool job (repo-jobs --held, the first job, Effort medium) through Bob's real turn loop
//      (do-jobs.mjs) against Bob's running engine.
//   6. One long read (the 32K cut of long-text.md plus one question; 16K when Bob's context is smaller).
//   7. One everyday turn, 3 rounds, for writing speed.
// Before each timed step the card cools under 50 C and idles 60 s (the owner's speed-test rule; max 5 min waiting).
// Bob's idle clock is kept running (/api/wake every 60 s, what typing does), so he doesn't let go of his brain mid-step.
// Writes <out>/row.json and <out>/row.md. Nothing here is uploaded or taught.
//   node drive.mjs --bob-url http://127.0.0.1:7811 --rel <release app> --harness <harness app> --out <dir> --tier <id>
//        --label <text> [--card-gb N --simulated] [--ballast-file f] [--mock] [--dl-minutes 60]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync, spawn } from 'node:child_process';

const argv = process.argv.slice(2);
const A = Object.fromEntries(argv.map((a, i) => a.startsWith('--') ? [a.slice(2), argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : true] : null).filter(Boolean));
const BOB = A['bob-url'] || 'http://127.0.0.1:7811';
const OUT = path.resolve(A.out || 'tier-out'); fs.mkdirSync(OUT, { recursive: true });
const MOCK = A.mock === true;
const row = { tier: A.tier || '', label: A.label || '', simulated: A.simulated === true, card_gb_sim: A['card-gb'] ? Number(A['card-gb']) : null, started: new Date().toISOString(), steps: {}, notes: [] };
const logf = path.join(OUT, 'drive.log');
const say = (...m) => { const l = `${new Date().toISOString().slice(11, 19)} ${m.join(' ')}`; console.log(l); fs.appendFileSync(logf, l + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const save = () => fs.writeFileSync(path.join(OUT, 'row.json'), JSON.stringify(row, null, 1));
const H = { 'content-type': 'application/json', 'x-bob': '1' };
async function bob(p, body, ms = 30000) {
  const r = await fetch(BOB + p, { method: body ? 'POST' : 'GET', headers: H, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(ms) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${p}: ${r.status} ${t.slice(0, 200)}`);
  return j;
}
function smi(q) { // the REAL card (never the shim), or null
  try { return execFileSync(process.env.NVSMI_REAL || 'nvidia-smi', [`--query-gpu=${q}`, '--format=csv,noheader,nounits'], { encoding: 'utf8', timeout: 5000 }).split('\n')[0].split(',').map((s) => s.trim()); } catch { return null; }
}
function fail(step, why) { row.result = 'fail'; row.failed_at = step; row.why = String(why).slice(0, 400); say(`FAILED ${step}: ${row.why}`); finish(); process.exit(2); }

// The engine Bob started: the llama-server process, its command line and port
function engineProc() {
  const out = [];
  for (const d of fs.readdirSync('/proc')) {
    if (!/^\d+$/.test(d)) continue;
    let cmd; try { cmd = fs.readFileSync(`/proc/${d}/cmdline`, 'utf8').split('\0').filter(Boolean); } catch { continue; }
    if (!cmd.length) continue;
    const exe = path.basename(cmd[0]), script = path.basename(cmd[1] || '');
    if (exe === 'llama-server' || (MOCK && script === 'fake-engine.py')) out.push({ pid: Number(d), args: MOCK && script === 'fake-engine.py' ? cmd.slice(1) : cmd });
  }
  // the chat brain: the one not started as an embedder (Bob's embedding server runs with --embedding)
  const main = out.filter((p) => !p.args.includes('--embedding') && !p.args.includes('--embeddings'));
  const p = main[0] || null;
  if (!p) return null;
  const opt = (...n) => { for (const k of n) { const i = p.args.indexOf(k); if (i >= 0) return p.args[i + 1]; } return null; };
  return { ...p, port: Number(opt('--port')) || 8091, ctx: Number(opt('-c', '--ctx-size')) || null, model: opt('-m', '--model'), all: out.length };
}
let keepAwake = null;
const awake = (on) => { clearInterval(keepAwake); if (on) keepAwake = setInterval(() => bob('/api/wake', {}).catch(() => {}), 60000); };

async function coolDown(what) {
  if (MOCK || !smi('temperature.gpu')) return;
  const t0 = Date.now(); let t = Number(smi('temperature.gpu')?.[0]);
  while (t >= 50 && Date.now() - t0 < 240000) { await sleep(5000); t = Number(smi('temperature.gpu')?.[0]); }
  await sleep(60000);
  const g = smi('temperature.gpu,clocks.sm,memory.used');
  row.steps[what] = { ...(row.steps[what] || {}), start_temp_c: Number(g?.[0]), start_sm_mhz: Number(g?.[1]), waited_s: Math.round((Date.now() - t0) / 1000) };
  say(`${what}: card ${g?.[0]} C, ${g?.[1]} MHz after ${Math.round((Date.now() - t0) / 1000)} s cool-down`);
}
async function engine(port, body, ms = 900000) {
  const r = await fetch(`http://127.0.0.1:${port}${body.__path || '/v1/chat/completions'}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, __path: undefined }), signal: AbortSignal.timeout(ms) });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`engine ${r.status} ${t.slice(0, 200)}`);
  return j;
}

function finish() {
  awake(false);
  row.ended = new Date().toISOString();
  try { row.card_log = cardSummary(); } catch (e) { row.notes.push(`card log: ${e.message}`); }
  row.pass_rule = 'loads, peak under card - 512 MiB, no crash, no reload during a job, no broken tool call, tool job right';
  if (!row.result) {
    const c = row.card_log || {};
    const checks = { loads: !!row.steps.warmup?.ok, peak_under_budget: c.peak_under_budget !== false, no_crash: !row.engine_crashes, no_reload: !row.engine_reloads, tool_calls_clean: (row.steps.tool_job?.bad_calls ?? 1) === 0, tool_job_right: row.steps.tool_job?.pass === true };
    row.checks = checks; row.result = Object.values(checks).every(Boolean) ? 'pass' : 'fail';
  }
  save(); fs.writeFileSync(path.join(OUT, 'row.md'), rowMd(row));
  say(`row: ${row.result}${row.failed_at ? ` (${row.failed_at})` : ''} -> ${path.join(OUT, 'row.json')}`);
}
// card.csv (tier-run.sh, every second, REAL card): time,used_mib,total_mib,temp_c,sm_mhz,mem_mhz,power_w,util_pct,ram_free_mib
function cardSummary() {
  const f = path.join(OUT, 'card.csv'); if (!fs.existsSync(f)) return null;
  const rows = fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').slice(1).filter(Boolean).map((l) => l.split(',').map((s) => s.trim()));
  const n = (i) => rows.map((r) => (r[i] === undefined || r[i] === '' ? NaN : Number(r[i]))).filter(Number.isFinite);
  const held = Number(ballastInfo()?.held_mib) || 0;
  const used = n(1).map((v) => v - held), ram = n(8), temp = n(3), sm = n(4);
  const total = row.simulated ? row.card_gb_sim * 1024 : Math.max(0, ...n(2));
  if (!used.length && !ram.length) return null;
  const peak = used.length ? Math.max(...used) : null, budget = total ? total - 512 : null;
  return { samples: rows.length, card_mib: total || null, ballast_mib: held || 0, peak_mib: peak, budget_mib: budget, peak_under_budget: peak === null || budget === null ? null : peak < budget,
    temp_c: temp.length ? [Math.min(...temp), Math.max(...temp)] : null, sm_mhz: sm.length ? [Math.min(...sm), Math.max(...sm)] : null, ram_free_min_mib: ram.length ? Math.min(...ram) : null };
}
function ballastInfo() { try { return JSON.parse(fs.readFileSync(A['ballast-file'], 'utf8')); } catch { return null; } }
function rowMd(r) {
  const c = r.card_log || {}, s = r.steps, e = r.engine || {};
  const t = (x) => (x === undefined || x === null ? '-' : x);
  return `# ${r.label || r.tier}: ${String(r.result || '').toUpperCase()}${r.failed_at ? ` at ${r.failed_at}` : ''}\n\n` +
    `| | |\n|---|---|\n` +
    [['Card', `${t(r.card?.name)}${r.simulated ? ` (simulated ${r.card_gb_sim} GB on a ${Math.round((r.card?.real_mib || 0) / 1024)} GB card)` : ''}`],
      ['Pod RAM', `${t(r.pod_ram_gb)} GB`], ['Bob release', t(r.bob_release)], ['Engine', `${t(e.engine_id)} ${t(e.build)} (${t(e.build_info)})`],
      ['Set Bob picked', `${t(r.hardware?.suggestedPack)} (Bob saw ${t(r.hardware?.vramGB)} GB card, ${t(r.hardware?.ramGB)} GB RAM)`],
      ['Brain', `${t(r.brain?.name)} (${t(r.brain?.file)})`], ['Context Bob set', t(e.ctx)],
      ['Reading t/s', `${t(s.long_read?.read_tps)} over ${t(s.long_read?.tokens)} tokens`], ['Writing t/s', t(s.everyday?.write_tps_median)],
      ['Card peak / budget', `${t(c.peak_mib)} / ${t(c.budget_mib)} MiB (${c.peak_under_budget === false ? 'OVER' : 'under'})`],
      ['Spill', t(e.spill)], ['Reloads / crashes', `${r.engine_reloads || 0} / ${r.engine_crashes || 0}`],
      ['Tool job', `${s.tool_job?.pass === true ? 'pass' : s.tool_job?.pass === false ? 'fail' : '-'} (${t(s.tool_job?.calls)} calls, ${t(s.tool_job?.bad_calls)} bad)`],
      ['Card C / MHz', `${(c.temp_c || []).join('-') || '-'} C, ${(c.sm_mhz || []).join('-') || '-'} MHz`],
      ['Minutes', t(r.minutes)], ['Dollars', r.dollars_per_hour ? (r.dollars_per_hour * (r.minutes || 0) / 60).toFixed(2) : '-']]
      .map(([a, b]) => `| ${a} | ${b} |`).join('\n') + '\n' + (r.simulated ? '\nSimulated card: fit, pick, spill and crashes are real; speed is the bigger card\'s, so it is not a result for this tier.\n' : '') +
    (r.why ? `\nWhy: ${r.why}\n` : '') + (r.notes.length ? `\nNotes:\n${r.notes.map((n) => `- ${n}`).join('\n')}\n` : '');
}

// ---------------------------------------------------------------------------------------------------------------
const t0 = Date.now();
row.dollars_per_hour = Number(process.env.RUNPOD_COST_PER_HR || 0) || null;
row.pod_ram_gb = Math.round(Number(fs.readFileSync('/proc/meminfo', 'utf8').match(/MemTotal:\s+(\d+)/)?.[1] || 0) / 1024 / 1024);
{ const g = smi('name,memory.total,driver_version'); row.card = g ? { name: g[0], real_mib: Number(g[1]), driver: g[2] } : { name: 'none (processor only)' }; }
if (row.simulated) row.ballast = ballastInfo();

// 1. Bob up, his hardware check and pick
for (let i = 0; i < 60; i++) { try { await bob('/api/status'); break; } catch { await sleep(2000); } }
try { const v = (await bob('/api/status')).version; row.bob_release = typeof v === 'object' ? v.label || v.version || JSON.stringify(v) : v; } catch (e) { fail('bob-start', e.message); }
const hw = await bob('/api/hardware').catch((e) => fail('hardware', e.message));
row.hardware = hw; say(`Bob ${row.bob_release}: card ${hw.gpu?.name || 'none'} ${hw.vramGB ?? '-'} GB, RAM ${hw.ramGB} GB, set ${hw.suggestedPack}`);
if (row.simulated && hw.vramGB !== row.card_gb_sim) fail('simulation', `Bob saw a ${hw.vramGB} GB card, not the simulated ${row.card_gb_sim} GB (shim not on Bob's PATH?)`);

// 2. Get Bob ready, cut to the bob-slot brain and its programs
const eq = await import(pathToFileURL(path.join(path.resolve(A.rel), 'public', 'equip.js')).href);
let models = await bob('/api/models', null, 60000);
const pack = models.packs.find((p) => p.id === hw.suggestedPack) || fail('pack', `no set ${hw.suggestedPack} in the catalog`);
const brainId = Object.entries(pack.slots || {}).find(([, s]) => s.includes('bob'))?.[0] || fail('pack', `set ${pack.id} has no bob slot`);
const rows = eq.readyList({ pack, models: models.models, engines: models.engines || [], hw: { ...hw, nvidia: Boolean(hw.gpu && !hw.gpu.integrated && !hw.gpu.unified) } });
const full = eq.readyOrder(rows, eq.readyDefaults(rows));
const br = rows.find((r) => r.id === brainId) || fail('ready-list', `${brainId} is not on Bob's Get Bob ready list`);
if (br.blocked) fail('ready-list', `${brainId}: ${br.blocked}`);
const ids = [...br.needs.filter((id) => rows.find((r) => r.id === id && !r.here)), ...(br.here ? [] : [brainId])];
const equip = { [brainId]: pack.slots[brainId] };
const m = models.models.find((x) => x.id === brainId);
row.brain = { id: brainId, name: m?.name, sizeGB: m?.sizeGB, slots: pack.slots[brainId] };
row.get_ready_full = { ids: full.ids, sizeGB: full.sizeGB, note: 'what the window ticks by default; the sweep downloads only the bob-slot brain and its programs' };
row.downloads = { ids, equip };
say(`set ${pack.id}: bob slot = ${brainId} (${m?.sizeGB} GB); downloading ${ids.join(', ') || 'nothing (all here)'}`);
save();
if (MOCK && !br.here) { // dry run: huggingface.co is not reachable from the cloud, so a stand-in file goes where Bob saves the brain
  const { saveNameOf } = await import(pathToFileURL(path.join(path.resolve(A.rel), 'src', 'models.js')).href);
  for (const f of (JSON.parse(fs.readFileSync(path.join(path.resolve(A.rel), 'catalog.json'), 'utf8')).models.find((x) => x.id === brainId)?.files || [])) {
    const p = path.join(path.resolve(A.data, '..'), 'models', 'bob', m.category, saveNameOf(f)); fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, 'GGUF mock');
  }
  await bob('/api/models/scan', {}).catch(() => {}); ids.splice(ids.indexOf(brainId), 1);
  await bob('/api/models/role', { job: 'bob', value: brainId }).catch((e) => row.notes.push(`mock role: ${e.message}`));
  row.notes.push('MOCK: the brain is a stand-in file (no download)');
}
if (ids.length) {
  await bob('/api/models/download', { ids, equip }).catch((e) => fail('download', e.message));
  const dl0 = Date.now(), lim = Number(A['dl-minutes'] || 60) * 60000;
  for (;;) {
    await sleep(MOCK ? 1000 : 10000);
    const list = await bob('/api/downloads').catch(() => null);
    const mine = (Array.isArray(list) ? list : list?.list || []).filter((d) => ids.includes(d.id));
    const bad = mine.find((d) => d.state === 'failed');
    if (bad) fail('download', `${bad.id}: ${bad.error || 'failed'}`);
    if (mine.length && mine.every((d) => d.state === 'done')) break;
    if (!mine.length) { models = await bob('/api/models', null, 60000); if (ids.every((id) => id.startsWith('engine:') ? (models.engines || []).find((e) => 'engine:' + e.id === id)?.installed : models.models.find((x) => x.id === id)?.status?.state === 'installed')) break; }
    if (Date.now() - dl0 > lim) fail('download', `not done after ${A['dl-minutes'] || 60} min: ${JSON.stringify(mine.map((d) => [d.id, d.state, d.done, d.total]))}`);
  }
  row.steps.download = { minutes: +((Date.now() - dl0) / 60000).toFixed(1) };
  say(`downloads done in ${row.steps.download.minutes} min`);
}
models = await bob('/api/models', null, 60000);
row.active = models.active; row.brain.file = path.basename(Object.values(models.models.find((x) => x.id === brainId)?.status?.located || {})[0] || '');
const be = (models.engines || []).find((e) => e.id === 'brainengine'), lc = (models.engines || []).find((e) => e.id === 'llamacpp');
row.engines_here = (models.engines || []).filter((e) => e.installed).map((e) => `${e.id}${e.version ? ' ' + e.version : ''}`);

// 3. warm-up through Bob's own chat: loads the brain with his own settings
awake(true);
async function chat(text, ms = 1200000) {
  const sid = `tier-${row.tier}`;
  const before = ((await bob(`/api/history?session=${sid}`).catch(() => [])) || []).length;
  await bob('/api/chat', { sessionId: sid, text, effort: 'low' });
  const c0 = Date.now();
  for (;;) {
    await sleep(MOCK ? 500 : 3000);
    const h = (await bob(`/api/history?session=${sid}`).catch(() => [])) || [];
    const last = h.slice(before).reverse().find((x) => x.role === 'assistant' || x.from === 'bob' || x.who === 'bob');
    if (last && (last.done !== false)) return { ms: Date.now() - c0, text: String(last.content ?? last.text ?? '').slice(0, 400) };
    if (Date.now() - c0 > ms) throw new Error(`no answer after ${Math.round(ms / 60000)} min`);
  }
}
let eng = null;
try {
  const w = await chat('hi');
  eng = engineProc();
  row.steps.warmup = { ok: Boolean(eng), seconds: Math.round(w.ms / 1000), answer: w.text };
  say(`warm-up: answered in ${row.steps.warmup.seconds} s: ${w.text.slice(0, 80)}`);
} catch (e) { row.steps.warmup = { ok: false, why: e.message }; }
eng = eng || engineProc();
if (!eng) {
  let fails = ''; try { fails = fs.readdirSync(A.data || '.').filter((f) => /load-failed/.test(f)).join(', '); } catch {}
  fail('load', `Bob's engine is not running after the warm-up${fails ? ` (failure saved: ${fails})` : ''}`);
}

// 4. the engine as Bob started it
const props = await fetch(`http://127.0.0.1:${eng.port}/props`).then((r) => r.json()).catch(() => ({}));
const has = (...k) => k.some((x) => eng.args.includes(x));
const cpuMoe = (() => { const i = eng.args.findIndex((a) => a === '--n-cpu-moe' || a === '-ncmoe'); return i >= 0 ? eng.args[i + 1] : null; })();
const ngl = (() => { const i = eng.args.findIndex((a) => a === '-ngl' || a === '--n-gpu-layers' || a === '--gpu-layers'); return i >= 0 ? eng.args[i + 1] : null; })();
row.engine = { pid: eng.pid, exe: eng.args[0], args: eng.args.slice(1).join(' '), port: eng.port, ctx: props.default_generation_settings?.n_ctx || eng.ctx, build_info: props.build_info || null,
  engine_id: /brain-engine/.test(eng.args[0]) ? 'brainengine' : 'llamacpp', build: (be?.installed ? be.version : lc?.version) || null, servers: eng.all,
  ngl, n_cpu_moe: cpuMoe, override_tensors: has('-ot', '--override-tensor') ? 'yes' : 'no',
  spill: row.card.real_mib ? (cpuMoe && cpuMoe !== '0' ? `yes (${cpuMoe} expert layers on the processor)` : has('-ot', '--override-tensor', '--cpu-moe', '-cmoe') ? 'yes (tensors on the processor)' : ngl !== null && ngl !== '99' && ngl !== '999' && ngl !== '-1' && ngl !== 'all' ? `yes (-ngl ${ngl})` : 'no') : 'n/a (processor only)' };
say(`engine: pid ${eng.pid} port ${eng.port} ctx ${row.engine.ctx} ${row.engine.build_info || ''} spill ${row.engine.spill}`);
save();
const pidNow = () => engineProc()?.pid || null;
const checkEngine = (what) => { const p = pidNow(); if (p !== eng.pid) { if (p) { row.engine_reloads = (row.engine_reloads || 0) + 1; row.notes.push(`${what}: the engine was started again (pid ${eng.pid} -> ${p})`); eng = engineProc(); } else { row.engine_crashes = (row.engine_crashes || 0) + 1; row.notes.push(`${what}: the engine was not running afterwards`); } } };

// 5. one short held-out tool job through Bob's real turn loop
await coolDown('tool_job');
{
  const lab = path.join(path.resolve(A.harness), 'model-lab');
  const jobs = A.jobs || path.join(OUT, '..', 'jobs', 'repo.jsonl');
  const dir = `tier-${row.tier}`;
  const j0 = Date.now();
  const r = await new Promise((res) => {
    const c = spawn(process.execPath, ['do-jobs.mjs', '--url', `http://127.0.0.1:${eng.port}`, '--bob', '..', '--jobs', jobs, '--dir', dir, '--out', OUT, '--count', '1', '--effort', 'medium', '--solo-effort', '--parallel', '1', '--want-shapes', '4', '--max', 'bob', '--job-minutes', '15', '--hours', '0.4'], { cwd: lab, stdio: ['ignore', fs.openSync(path.join(OUT, 'tool-job.log'), 'a'), fs.openSync(path.join(OUT, 'tool-job.log'), 'a')] });
    const kill = setTimeout(() => c.kill('SIGTERM'), 30 * 60000);
    c.on('exit', (code) => { clearTimeout(kill); res(code); });
  });
  const runs = path.join(OUT, dir, 'runs.jsonl');
  const lines = fs.existsSync(runs) ? fs.readFileSync(runs, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const calls = lines.reduce((n, x) => n + (x.steps || []).reduce((k, s) => k + (s.calls || []).length, 0), 0);
  const tj = { exit: r, runs: lines.length, calls, seconds: Math.round((Date.now() - j0) / 1000), job: lines[0]?.id || null };
  try {
    execFileSync(process.execPath, ['repo-score.mjs', '--runs', runs, '--out', path.join(OUT, 'repo-score')], { cwd: lab, stdio: 'ignore', timeout: 600000 });
    const sc = JSON.parse(fs.readFileSync(path.join(OUT, 'repo-score', 'repo-score.json'), 'utf8'));
    const one = (sc[dir]?.scores || Object.values(sc)[0]?.scores || [])[0] || {};
    tj.pass = one.verdict === 'pass';
    tj.score = { verdict: one.verdict || null, work: one.work ?? null, why: (one.why || []).slice(0, 4) };
    if (one.verdict === 'world') row.notes.push('tool job: the test world decided the run (not the brain): rerun it');
  } catch (e) { tj.score_error = String(e.message).slice(0, 200); }
  try {
    execFileSync(process.execPath, ['tool-faults.mjs', '--runs', `tier=${runs}`, '--out', path.join(OUT, 'tool-faults')], { cwd: lab, stdio: 'ignore', timeout: 300000 });
    const tf = JSON.parse(fs.readFileSync(path.join(OUT, 'tool-faults', 'tool-faults.json'), 'utf8'));
    const k = tf.sets?.[0]?.kinds || {};
    // broken calls: a call the brain wrote wrong (form, JSON, name, inputs). A tool that answered "Error" to a sensible
    // call, a repeat or a wrong group are counted beside them, not as broken.
    const BROKEN = ['text_lost', 'in_thinking', 'call_cut', 'bad_json', 'double_encoded', 'args_not_object', 'unknown_tool', 'not_offered', 'bounced_inputs', 'missing_input', 'extra_input_name', 'input_problem'];
    tj.bad_calls = BROKEN.reduce((n, x) => n + (Number(k[x]) || 0), 0);
    tj.fault_kinds = Object.fromEntries(Object.entries(k).filter(([, v]) => v));
    tj.shape_mismatch = tf.sets?.[0]?.shape_mismatch ?? null;
  } catch (e) { tj.faults_error = String(e.message).slice(0, 200); }
  row.steps.tool_job = { ...(row.steps.tool_job || {}), ...tj };
  say(`tool job ${tj.job}: ${tj.runs} run, ${calls} calls, pass ${tj.pass}, bad calls ${tj.bad_calls}`);
  checkEngine('tool job'); save();
}

// 6. one long read
await coolDown('long_read');
try {
  const ctx = Number(row.engine.ctx) || 8192;
  const want = ctx >= 40000 ? 32768 : ctx >= 20000 ? 16384 : Math.floor(ctx * 0.6);
  const text = fs.readFileSync(A.long || path.join(path.resolve(A.harness), 'model-lab', 'speed-plans', 'long-text.md'), 'utf8').replace(/\r\n/g, '\n');
  const toks = (await engine(eng.port, { __path: '/tokenize', content: text })).tokens || [];
  const cut = toks.length > want ? (await engine(eng.port, { __path: '/detokenize', tokens: toks.slice(0, want) })).content : text;
  const q = '\n\nIn one sentence: what is the text above mostly about?';
  const r = await engine(eng.port, { messages: [{ role: 'user', content: cut + q }], max_tokens: 64, temperature: 0, cache_prompt: false, chat_template_kwargs: { enable_thinking: false } }, 1800000);
  row.steps.long_read = { ...(row.steps.long_read || {}), tokens: r.timings?.prompt_n ?? null, asked_tokens: want, read_tps: r.timings?.prompt_per_second ? +r.timings.prompt_per_second.toFixed(1) : null, seconds: r.timings?.prompt_ms ? +(r.timings.prompt_ms / 1000).toFixed(1) : null, answer: String(r.choices?.[0]?.message?.content || '').slice(0, 300) };
  say(`long read: ${row.steps.long_read.tokens} tokens at ${row.steps.long_read.read_tps} t/s`);
} catch (e) { row.steps.long_read = { ...(row.steps.long_read || {}), error: e.message.slice(0, 200) }; say(`long read failed: ${e.message}`); }
checkEngine('long read'); save();

// 7. one everyday turn, 3 rounds
await coolDown('everyday');
try {
  const w = [];
  for (let i = 0; i < 3; i++) {
    const r = await engine(eng.port, { messages: [{ role: 'user', content: 'Write about 300 words on how a lighthouse lens works, in plain words.' }], max_tokens: 400, ignore_eos: true, temperature: 0, cache_prompt: false, chat_template_kwargs: { enable_thinking: false } });
    w.push(+(r.timings?.predicted_per_second || 0).toFixed(1));
  }
  const s = [...w].sort((a, b) => a - b);
  row.steps.everyday = { ...(row.steps.everyday || {}), rounds: w, write_tps_median: s[1] };
  say(`everyday: ${w.join(', ')} t/s (median ${s[1]})`);
} catch (e) { row.steps.everyday = { ...(row.steps.everyday || {}), error: e.message.slice(0, 200) }; say(`everyday failed: ${e.message}`); }
checkEngine('everyday');
row.minutes = Math.round((Date.now() - t0) / 60000);
finish();
process.exit(0);
