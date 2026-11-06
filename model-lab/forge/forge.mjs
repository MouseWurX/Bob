// Forge: rent one GPU, send it the lessons and the plan, watch it cut and heal Bobs, download them, delete the pod.
// node forge.mjs --plan plans\24-18.json        rent + run + download + delete (asks you to type yes first)
// node forge.mjs --resume <podId> --plan ...    carry on watching a pod that is already running
// node forge.mjs --send-plan <podId> --plan ...  send an edited plan to a running pod (quants etc. for the rungs not started yet)
// node forge.mjs --restart <podId> --plan ...   stop the run on a pod, upload the current code + plan, start it again (finished steps are kept)
// node forge.mjs --status | --kill               list pods / delete every forge pod
// node forge.mjs --places [cards]               where the wanted cards are in stock with storage (read-only), and your network volumes
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = Object.fromEntries(process.argv.slice(2).map((a, i, arr) => a.startsWith('--') ? [a.slice(2), arr[i + 1]?.startsWith('--') || arr[i + 1] === undefined ? true : arr[i + 1]] : []).filter((x) => x.length));
const KEY = process.env.RUNPOD_API_KEY;
if (!KEY) { console.error('RUNPOD_API_KEY is not set (the "Save RunPod key" step).'); process.exit(1); }
const REST = 'https://rest.runpod.io/v1';
const outDir = path.join(here, '..', 'out'); fs.mkdirSync(path.join(outDir, 'forge'), { recursive: true });
const logFile = path.join(outDir, 'forge', `forge-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.log`);
const log = (...m) => { const line = `${new Date().toISOString().slice(11, 19)} ${m.join(' ')}`; console.log(line); fs.appendFileSync(logFile, line + '\n'); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// every crash lands in the log file too, not only on the screen
process.on('uncaughtException', (e) => { log(`ERROR ${e.stack || e}`); process.exit(1); });
process.on('unhandledRejection', (e) => { log(`ERROR ${e?.stack || e}`); process.exit(1); });
async function rp(method, p, body) {
  const r = await fetch(REST + p, { method, headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j = null; try { j = JSON.parse(t); } catch {}
  if (!r.ok) throw new Error(`${method} ${p}: ${r.status} ${t.slice(0, 300)}`);
  return j;
}
// RunPod's older GraphQL door (read-only here: where cards and storage are)
async function gql(query) {
  const r = await fetch(`https://api.runpod.io/graphql?api_key=${encodeURIComponent(KEY)}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query }) });
  const j = await r.json().catch(() => ({})); if (j.errors) throw new Error(JSON.stringify(j.errors).slice(0, 300)); return j.data;
}
// Where a wanted card is in stock, with storage for a network volume. Returns [{id, name, gpu, stock}] best first.
async function placesFor(gpus) {
  // RunPod's "available" flag here is stricter than pod creation (it said no for a card we were running on), so it only ranks; it never rules a place out
  const d = await gql('{ dataCenters { id location storageSupport gpuAvailability { gpuTypeId stockStatus available } } }');
  const out = [];
  for (const dc of d.dataCenters || []) for (const g of gpus) {
    const a = (dc.gpuAvailability || []).find((x) => x.gpuTypeId === g);
    if (a) { out.push({ id: dc.id, name: dc.location || dc.id, gpu: g, storage: !!dc.storageSupport, available: !!a.available, stock: a.stockStatus || '' }); break; }
  }
  return out.sort((a, b) => (gpus.indexOf(a.gpu) - gpus.indexOf(b.gpu)) || (Number(b.storage) - Number(a.storage)) || (Number(b.available) - Number(a.available)));
}
const volFile = () => path.join(outDir, 'forge', 'volume.json');
// plan.volume {gb, name}: one network volume, made once, reused by every later session (teacher, general text, healed Bobs stay on it)
async function ensureVolume(gpus) {
  if (fs.existsSync(volFile())) { const v = JSON.parse(fs.readFileSync(volFile(), 'utf8')); log(`using the network volume ${v.id} (${v.size} GB in ${v.dataCenterId})`); return v; }
  const gb = plan.volume.gb || 100;
  let dc = plan.volume.datacenter;
  if (!dc) {
    const places = (await placesFor(gpus)).filter((p) => p.storage);
    if (!places.length) { // the wanted card lives nowhere with network storage (true for the H200 NVL today): go without the volume rather than without the card
      log(`no data centre offers ${gpus.join(' or ')} together with network storage; running WITHOUT the network volume this time (adapters still come back to the PC)`);
      if (plan.volume.required) throw new Error('volume.required is set and no data centre fits'); return null;
    }
    dc = places[0].id; log(`network volume goes to ${places[0].name} (${dc}): ${places[0].gpu}${places[0].available ? ' in stock' : ' (stock unknown)'}`);
  }
  const v = await rp('POST', '/networkvolumes', { name: plan.volume.name || 'bob-forge', size: gb, dataCenterId: dc });
  fs.writeFileSync(volFile(), JSON.stringify({ id: v.id, size: v.size || gb, dataCenterId: v.dataCenterId || dc, made: new Date().toISOString() }, null, 1));
  log(`made the network volume ${v.id}: ${gb} GB in ${dc} (about $${(gb * 0.07).toFixed(2)} a month until deleted)`); return JSON.parse(fs.readFileSync(volFile(), 'utf8'));
}
const GPUS = ['NVIDIA H100 80GB HBM3', 'NVIDIA H100 PCIe', 'NVIDIA H200', 'NVIDIA A100-SXM4-80GB', 'NVIDIA A100 80GB PCIe']; // in order of preference

if (args.places) { // where are the cards + storage right now (read-only)
  const gpus = String(args.places === true ? 'NVIDIA H200 NVL,NVIDIA H200,NVIDIA B200,NVIDIA H100 80GB HBM3' : args.places).split(',');
  try { for (const p of await placesFor(gpus)) console.log(`${p.id.padEnd(10)} ${p.gpu.padEnd(24)} storage ${p.storage ? 'yes' : 'no '}  available ${p.available ? 'yes' : 'no '} ${p.stock}`); } catch (e) { console.log(`places: ${e.message}`); }
  try { const d = await gql('{ myself { networkVolumes { id name size dataCenterId } } }'); console.log('network volumes:', JSON.stringify(d.myself?.networkVolumes || [])); } catch (e) { console.log(`volumes: ${e.message}`); }
  process.exit(0);
}
if (args.status || args.kill) {
  const pods = (await rp('GET', '/pods')) || [];
  for (const p of pods) log(`${p.id} ${p.name} ${p.desiredStatus} ${p.machine?.gpuTypeId || ''} $${p.costPerHr}/h`);
  if (!pods.length) log('no pods');
  if (args.kill) for (const p of pods) if (p.name?.startsWith('bob-forge')) {
    try { const t = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); if (t.pod === p.id) { podId = p.id; base = `https://${p.id}-8000.proxy.runpod.net`; hdr['X-Forge-Token'] = t.token; await salvage(); } } catch {}
    await rp('DELETE', `/pods/${p.id}`); log(`deleted ${p.id}`);
  }
  process.exit(0);
}
const planFile = args.plan; if (!planFile) { console.error('--plan <file> is needed'); process.exit(1); }
const plan = JSON.parse(fs.readFileSync(planFile, 'utf8'));
const lessonsDir = path.resolve(here, '..', plan.lessons || 'out/lessons');
const countsFile = path.resolve(here, '..', plan.counts_file || 'out/experts/' + plan.counts);
for (const f of ['lessons.jsonl', 'toolsets.json']) if (!fs.existsSync(path.join(lessonsDir, f))) { console.error(`missing ${path.join(lessonsDir, f)}`); process.exit(1); }
if (!fs.existsSync(countsFile)) { console.error(`missing counts file ${countsFile}`); process.exit(1); }
const hoursMax = plan.hours_max || 9, dollarsMax = plan.dollars_max || 40;
const token = crypto.randomBytes(16).toString('hex');

let podId = args.resume || args.restart || args['send-plan'], price = 0, base = args.local || '';
const hdr = { 'X-Forge-Token': token };
const tokenFile = path.join(outDir, 'forge', 'pod-token.json');
if (podId) { const t = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); hdr['X-Forge-Token'] = t.token; }

async function rent() {
  const boot = zlib.gzipSync(fs.readFileSync(path.join(here, 'pod', 'bootstrap.py'))).toString('base64');
  const rungs = plan.rungs.map((r) => r.name).join(', ');
  console.log(`\nAbout to rent ONE GPU on RunPod to make: ${rungs}`);
  console.log(`Caps: ${hoursMax} hours or $${dollarsMax}, whichever comes first; the pod is deleted when the Bobs are downloaded, or at the cap.`);
  if (plan.volume) console.log(`Network volume: ${plan.volume.gb || 100} GB kept between sessions (about $${((plan.volume.gb || 100) * 0.07).toFixed(2)} a month, a standing charge until deleted${fs.existsSync(volFile()) ? '; already exists, reused' : '; MADE NOW'}).`);
  console.log(`Cards, in order of preference: ${(plan.gpus || GPUS).join(', ')}\n`);
  if (plan.write_lessons) console.log(`First the full Qwen writes ${plan.write_lessons.count || 800} extra lessons on the card (${plan.write_lessons.jobs || 'all jobs'}), then the Bobs.\n`);
  if (!args.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise((r) => rl.question('Type yes to rent now: ', r)); rl.close();
    const a = ans.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!['yes', 'y', 'yep', 'yeah'].includes(a)) { log(`Not renting: the answer was "${ans.trim().slice(0, 20)}", not yes.`); process.exit(0); }
    log('yes typed: renting');
  }
  const gpus = plan.gpus || GPUS;
  const vol = plan.volume ? await ensureVolume(gpus) : null;
  const run = plan.run || `${plan.rungs[0].name}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
  // with a network volume: the volume (/workspace) keeps the shared, slow-to-make things; this run's big working files go on the pod's own disk (/forge), gone with the pod
  const root = vol ? '/forge' : '/workspace';
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const pod = await rp('POST', '/pods', {
        name: `bob-forge-${plan.rungs[0].name}`, imageName: plan.image || 'vllm/vllm-openai:v0.28.0', cloudType: 'SECURE',
        gpuTypeIds: gpus, gpuTypePriority: 'custom', gpuCount: 1, volumeMountPath: '/workspace',
        ...(vol ? { networkVolumeId: vol.id, dataCenterIds: [vol.dataCenterId], containerDiskInGb: plan.disk_gb || 350 } : { volumeInGb: plan.disk_gb || 350, containerDiskInGb: 40 }),
        ports: plan.write_lessons ? ['8000/http', '8001/http'] : ['8000/http'], supportPublicIp: false,
        // the PC's RunPod key goes in as FORGE_RUNPOD_KEY (RunPod injects its own limited RUNPOD_API_KEY into every pod, which cannot delete) so the pod can delete itself near the time cap even if this PC falls asleep.
        env: { FORGE_TOKEN: token, FORGE_RUNPOD_KEY: KEY, HF_HUB_ENABLE_HF_TRANSFER: '0', FORGE_HOURS_MAX: String(hoursMax), FORGE_ROOT: root, FORGE_SHARED: '/workspace' },
        dockerEntrypoint: ['bash', '-c'],
        dockerStartCmd: [`mkdir -p ${root} && echo ${boot} | base64 -d | gunzip > /workspace/bootstrap.py && exec python3 /workspace/bootstrap.py`]
      });
      podId = pod.id; price = pod.costPerHr || 0; log(`rented ${pod.machine?.gpuTypeId || 'a card'}: pod ${podId}, $${price}/h`);
      fs.writeFileSync(tokenFile, JSON.stringify({ pod: podId, token, started: Date.now(), price, run, root, volume: vol?.id || null }));
      return;
    } catch (e) { log(`rent: ${e.message.slice(0, 200)}`); await sleep(20000); }
  }
  throw new Error('no card available right now; try again in a few minutes');
}
async function salvage() {
  // before a pod goes, keep its logs and status on the PC (the evidence for the next fix)
  try {
    const r = await get('/status'); if (!r.ok) return; const st = await r.json();
    const dir = path.join(outDir, 'forge', `pod-${podId}`); fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, 'status.json'), JSON.stringify(st.status || {}, null, 1));
    for (const f of st.files || []) if (/\.(log|txt|json)$/.test(f.path) && f.bytes < 50e6 && !/files\.json$/.test(f.path)) {
      try { const x = await get(`/out/${f.path}`); if (x.ok) { const p = path.join(dir, f.path.replace(/\//g, '_')); fs.writeFileSync(p, Buffer.from(await x.arrayBuffer())); } } catch {}
    }
    log(`pod logs saved to ${dir}`);
  } catch (e) { log(`could not save pod logs: ${e.message.slice(0, 80)}`); }
}
async function kill(why) {
  log(`deleting pod ${podId} (${why})`);
  if (args.local) return;
  if (!/downloaded/.test(why)) await salvage();
  for (let i = 0; i < 5; i++) { try { await rp('DELETE', `/pods/${podId}`); log('pod deleted'); return; } catch (e) { log(e.message.slice(0, 120)); await sleep(5000); } }
}
async function get(p, opts = {}) { return fetch(base + encodeURI(p), { ...opts, headers: { ...hdr, ...(opts.headers || {}) } }); }
async function upload(name, file) {
  const size = fs.statSync(file).size; log(`uploading ${name} (${(size / 1e6).toFixed(1)} MB)`);
  for (let i = 0; i < 4; i++) {
    try {
      const r = await fetch(`${base}/in/${name}`, { method: 'PUT', headers: { ...hdr, 'Content-Length': String(size), 'Content-Type': 'application/octet-stream' }, body: fs.createReadStream(file), duplex: 'half' });
      if (r.ok) return; log(`upload ${name}: ${r.status}`);
    } catch (e) { log(`upload ${name}: ${e.message.slice(0, 100)}`); }
    await sleep(5000);
  }
  throw new Error(`could not upload ${name}`);
}
async function download(rel, dest, bytes, sha) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  if (fs.existsSync(dest) && fs.statSync(dest).size === bytes) { log(`${rel} is already on the PC`); return; } // a new watcher after a restart does not fetch twice
  const part = dest + '.part';
  for (let i = 0; i < 20; i++) {
    const have = fs.existsSync(part) ? fs.statSync(part).size : 0;
    if (have >= bytes) break;
    try {
      const r = await get(`/out/${rel}`, { headers: have ? { Range: `bytes=${have}-` } : {} });
      if (!r.ok) throw new Error(`${r.status}`);
      const ws = fs.createWriteStream(part, { flags: have ? 'a' : 'w' });
      let got = have, last = Date.now();
      for await (const chunk of r.body) { ws.write(chunk); got += chunk.length; if (Date.now() - last > 30000) { last = Date.now(); log(`  ${rel}: ${(100 * got / bytes).toFixed(0)}%`); } }
      await new Promise((res) => ws.end(res));
    } catch (e) { log(`download ${rel}: ${e.message.slice(0, 100)}; retrying`); await sleep(10000); }
  }
  if (!fs.existsSync(part) || fs.statSync(part).size !== bytes) throw new Error(`${rel}: wrong size after download`);
  const h = crypto.createHash('sha256'); for await (const c of fs.createReadStream(part)) h.update(c);
  if (sha && h.digest('hex') !== sha) { fs.unlinkSync(part); throw new Error(`${rel}: checksum mismatch, deleted; will try again`); }
  fs.renameSync(part, dest); log(`downloaded ${rel} -> ${dest}`);
}

const started = Date.now();
if (args.local) { podId = 'local'; hdr['X-Forge-Token'] = process.env.FORGE_TOKEN || ''; fs.writeFileSync(tokenFile, JSON.stringify({ pod: podId, token: hdr['X-Forge-Token'], started: Date.now(), price: 0 })); }
else if (!podId) await rent();
else { const t = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); price = t.price || 0; }
if (!args.local) base = `https://${podId}-8000.proxy.runpod.net`;
const t0 = JSON.parse(fs.readFileSync(tokenFile, 'utf8')).started || started;
const cost = () => price * (Date.now() - t0) / 3.6e6;
log(`waiting for the pod door at ${base}`);
let up = false;
for (let i = 0; i < 90 && !up; i++) { try { const r = await get('/status'); up = r.ok; } catch {} if (!up) await sleep(10000); }
if (!up) { await kill('the pod never answered (15 min)'); process.exit(1); }
if (args['send-plan']) {
  // update plan.json on a running pod without touching the run (run.sh reads the plan again at the start of each rung)
  const podPlan = { ...plan, counts: 'counts.json' }; delete podPlan.counts_file; delete podPlan.lessons;
  fs.writeFileSync(path.join(outDir, 'forge', 'plan-sent.json'), JSON.stringify(podPlan, null, 1));
  await upload('plan.json', path.join(outDir, 'forge', 'plan-sent.json'));
  log('plan sent; the next rung will use it'); process.exit(0);
}
if (args.restart) {
  const tgz = path.join(outDir, 'forge', 'forge.tgz');
  const { execSync } = await import('node:child_process');
  execSync(`tar czf "${tgz}" --exclude=__pycache__ -C "${here}" pod`, { stdio: 'inherit' });
  let r = await get('/stop', { method: 'POST' }); log(`stopped the old run: ${await r.text()}`);
  await sleep(5000);
  await upload('forge.tgz', tgz);
  const podPlan = { ...plan, counts: 'counts.json' }; delete podPlan.counts_file; delete podPlan.lessons;
  fs.writeFileSync(path.join(outDir, 'forge', 'plan-sent.json'), JSON.stringify(podPlan, null, 1));
  await upload('plan.json', path.join(outDir, 'forge', 'plan-sent.json'));
  r = await get('/go', { method: 'POST' }); log(`restarted: ${await r.text()}`);
} else if (!args.resume) {
  // pack the pod scripts
  const tgz = path.join(outDir, 'forge', 'forge.tgz');
  const { execSync } = await import('node:child_process');
  execSync(`tar czf "${tgz}" --exclude=__pycache__ -C "${here}" pod`, { stdio: 'inherit' });
  await upload('forge.tgz', tgz);
  await upload('lessons.jsonl', path.join(lessonsDir, 'lessons.jsonl'));
  await upload('toolsets.json', path.join(lessonsDir, 'toolsets.json'));
  await upload('counts.json', countsFile);
  for (const r of plan.rungs) if (r.keep_file) await upload(path.basename(r.keep_file), path.resolve(here, '..', r.keep_file)); // cut exactly like an earlier Bob
  const podPlan = { ...plan, counts: 'counts.json', rungs: plan.rungs.map((r) => r.keep_file ? { ...r, keep_file: path.basename(r.keep_file) } : r) }; delete podPlan.counts_file; delete podPlan.lessons;
  fs.writeFileSync(path.join(outDir, 'forge', 'plan-sent.json'), JSON.stringify(podPlan, null, 1));
  await upload('plan.json', path.join(outDir, 'forge', 'plan-sent.json'));
  const r = await get('/go', { method: 'POST' }); log(`started: ${await r.text()}`);
}
let lessonsSent = false;
// plan.write_lessons: the pod serves the full Qwen on port 8001; this PC's lesson writer talks to it, then the lessons go up and the pod carries on
async function writeLessonsOnPod() {
  const w = plan.write_lessons; const dir = w.dir || 'lessons-extra';
  const url = args.local ? 'http://127.0.0.1:8001' : `https://${podId}-8001.proxy.runpod.net`;
  const argv = ['write-lessons.mjs', '--url', url, '--parallel', String(w.parallel || 16), '--jobs', w.jobs || 'coding', '--think', w.think || 'all', '--dir', dir, '--count', String(w.count || 800), '--hours', String(w.hours || 1.5)];
  log(`writing ${w.count || 800} extra lessons through the pod (${w.jobs || 'coding'}, thinking ${w.think || 'all'})`);
  const { spawn } = await import('node:child_process');
  const code = await new Promise((res) => spawn(process.execPath, argv, { cwd: path.join(here, '..'), stdio: 'inherit', env: { ...process.env, LAB_API_KEY: hdr['X-Forge-Token'], LAB_MODEL_NAME: 'teacher', LAB_REMOTE: '1' } }).on('exit', res));
  const ldir = path.join(outDir, dir);
  const n = fs.existsSync(path.join(ldir, 'lessons.jsonl')) ? fs.readFileSync(path.join(ldir, 'lessons.jsonl'), 'utf8').split('\n').filter(Boolean).length : 0;
  log(`lesson writer finished (exit ${code}): ${n} lessons in ${ldir}`);
  if (n < (w.min || 50)) { log(`too few lessons (${n} < ${w.min || 50}); the run cannot go on`); await kill('lesson writing failed'); process.exit(1); }
  await upload('lessons-extra.jsonl', path.join(ldir, 'lessons.jsonl'));
  await upload('toolsets-extra.json', path.join(ldir, 'toolsets.json'));
  fs.writeFileSync(path.join(outDir, 'forge', 'lessons-ready'), String(n)); await upload('lessons-ready', path.join(outDir, 'forge', 'lessons-ready'));
  log('extra lessons sent; the pod carries on');
}
const done = new Set(); const got = new Map(); let lastLog = ''; let lastPhase = ''; // got: Bob name -> files already on the PC
while (true) {
  await sleep(args.local ? 3000 : 60000);
  let st = null;
  try { const r = await get('/status'); if (r.ok) st = await r.json(); } catch (e) { log(`status: ${e.message.slice(0, 80)}`); }
  if (st) {
    const ph = `${st.status?.phase || '?'}: ${st.status?.detail || ''}`;
    if (ph !== lastPhase) { lastPhase = ph; log(`[pod] ${ph}`); }
    const tail = (st.log || '').trim().split('\n').slice(-3).join(' | ');
    if (tail && tail !== lastLog) { lastLog = tail; log(`  ${tail.slice(0, 300)}`); }
    for (const f of st.files || []) {
      const m = f.path.match(/^([^/]+)\/([^/]+)-files\.json$/);
      if (!m) continue;
      const name = m[1];
      if (done.has(name) && got.get(name)?.bytes === f.bytes) continue; // same list as before: nothing new
      try {
        const r = await get(`/out/${f.path}`); const list = await r.json();
        const dest = path.join(outDir, 'bobs', name);
        const had = got.get(name)?.files || new Set();
        for (const x of list.files) { if (had.has(x.file)) continue; await download(`${name}/${x.file}`, path.join(dest, x.file), x.bytes, x.sha256); had.add(x.file); }
        got.set(name, { files: had, bytes: f.bytes });
        for (const extra of ['heal-report.json', `counts-${name}.json`, `${name}-keep.json`, `${name}-adapter.pt`]) { // the adapter + keep list can rebuild the full-size healed Bob from the teacher
          const e = (st.files || []).find((y) => y.path === `${name}/${extra}`);
          if (e) await download(`${name}/${extra}`, path.join(dest, extra), e.bytes, null);
        }
        fs.writeFileSync(path.join(dest, `${name}-files.json`), JSON.stringify(list, null, 1));
        done.add(name); log(`${list.name || name} is on the PC: ${dest}`);
      } catch (e) { log(`${name}: ${e.message.slice(0, 160)}`); }
    }
    if (st.status?.phase === 'lessons' && /^ready/.test(st.status?.detail || '') && !lessonsSent) { lessonsSent = true; await writeLessonsOnPod(); }
    if (st.status?.phase === 'done' && done.size >= plan.rungs.length) { await kill('all Bobs downloaded'); break; }
    if (st.status?.phase === 'failed' || (st.exit !== null && st.exit !== undefined && !st.running)) {
      log(`the pod run stopped (${st.status?.detail || 'exit ' + st.exit}). Last log lines:\n${st.log}`);
      if (!args['keep-on-fail']) { await kill('run failed'); } else log('pod kept for a look (--keep-on-fail)');
      break;
    }
  }
  if ((Date.now() - t0) / 3.6e6 > hoursMax || cost() > dollarsMax) { log(`cap reached ($${cost().toFixed(2)}, ${((Date.now() - t0) / 3.6e6).toFixed(1)} h)`); await kill('cap'); break; }
}
log(`finished: ${[...done].join(', ') || 'nothing downloaded'}; about $${cost().toFixed(2)} spent on this pod${plan.volume ? '; the network volume stays (healed Bobs + teacher kept for next time)' : ''}`);
