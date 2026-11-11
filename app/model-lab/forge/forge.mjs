// Forge: rent one GPU, send it the lessons and the plan, watch it cut and heal Bobs, download them, delete the pod.
// node forge.mjs --plan plans\24-18.json        rent + run + download + delete (asks you to type yes first)
// node forge.mjs --resume <podId> --plan ...    carry on watching a pod that is already running
// node forge.mjs --send-plan <podId> --plan ...  send an edited plan to a running pod (quants etc. for the rungs not started yet)
// node forge.mjs --send-token <podId> --plan ...  hand forge/hf-token.txt to a running pod (build 17)
// plan.benchmark (build 18): after the rungs the pod serves each listed brain (rebuilt from keep list + adapter if asked) and this PC runs the plan's test commands against it
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
// plan.volume {gb, name}: network volumes, one per data centre, made once and reused by every later session (teacher, general
// text, teacher scores, healed Bobs stay on them). Build 15: volume.json holds a LIST (`volumes`); the old one-volume file still reads.
function knownVolumes() {
  if (!fs.existsSync(volFile())) return [];
  const j = JSON.parse(fs.readFileSync(volFile(), 'utf8'));
  return Array.isArray(j.volumes) ? j.volumes : (j.id ? [j] : []);
}
function saveVolumes(list) { fs.writeFileSync(volFile(), JSON.stringify({ volumes: list }, null, 1)); }
// a volume in data centre dc (made now if there is none); the standing charge is about $0.07 per GB a month until deleted
async function volumeIn(dc, name) {
  const have = knownVolumes().find((v) => v.dataCenterId === dc);
  const gb = plan.volume.gb || 100;
  if (have) { // build 17: a volume we already have is enlarged to the plan's size first (RunPod enlarges, never shrinks); 8 Nov a 100 GB drive was reused for a 300 GB run
    if ((have.size || 0) < gb) {
      try {
        await rp('PATCH', `/networkvolumes/${have.id}`, { size: gb });
        have.size = gb; saveVolumes(knownVolumes().map((v) => v.id === have.id ? { ...v, size: gb, enlarged: new Date().toISOString() } : v));
        log(`enlarged the network volume ${have.id} to ${gb} GB (about $${(gb * 0.07).toFixed(2)} a month)`);
      } catch (e) { log(`could not enlarge the network volume ${have.id} from ${have.size || '?'} to ${gb} GB: ${e.message.slice(0, 120)}; the run may run out of room`); }
    }
    return have;
  }
  const v = await rp('POST', '/networkvolumes', { name: plan.volume.name || 'bob-forge', size: gb, dataCenterId: dc });
  const rec = { id: v.id, size: v.size || gb, dataCenterId: v.dataCenterId || dc, name: name || dc, made: new Date().toISOString() };
  saveVolumes([rec, ...knownVolumes()]);
  log(`made the network volume ${v.id}: ${gb} GB in ${rec.name} (${dc}), about $${(gb * 0.07).toFixed(2)} a month until deleted`);
  return rec;
}
// Where to rent, in order: data centres that already hold one of our volumes first (the teacher and the teacher scores are there),
// then any other data centre with network storage where a wanted card is listed. Never a data centre without storage.
async function placesWithStorage(gpus) {
  const places = (await placesFor(gpus)).filter((p) => p.storage);
  const known = knownVolumes();
  const rank = (p) => { const i = known.findIndex((v) => v.dataCenterId === p.id); return i < 0 ? 99 : i; };
  return places.sort((a, b) => rank(a) - rank(b) || (gpus.indexOf(a.gpu) - gpus.indexOf(b.gpu)) || (Number(b.available) - Number(a.available)));
}
const GPUS = ['NVIDIA H100 80GB HBM3', 'NVIDIA H100 PCIe', 'NVIDIA H200', 'NVIDIA A100-SXM4-80GB', 'NVIDIA A100 80GB PCIe']; // in order of preference
const STEP_UP = { 'NVIDIA H200': ['NVIDIA B200'], 'NVIDIA H100 80GB HBM3': ['NVIDIA H200', 'NVIDIA B200'], 'NVIDIA H100 PCIe': ['NVIDIA H100 80GB HBM3', 'NVIDIA H200'] }; // the next card up, when the wanted one is out
const stepUpFor = (gpus) => plan.step_up || [...new Set(gpus.flatMap((g) => STEP_UP[g] || []))].filter((g) => !gpus.includes(g));

if (args.places) { // where are the cards + storage right now (read-only)
  const gpus = String(args.places === true ? 'NVIDIA H200 NVL,NVIDIA H200,NVIDIA B200,NVIDIA H100 80GB HBM3' : args.places).split(',');
  try { for (const p of await placesFor(gpus)) console.log(`${p.id.padEnd(10)} ${p.gpu.padEnd(24)} storage ${p.storage ? 'yes' : 'no '}  available ${p.available ? 'yes' : 'no '} ${p.stock}`); } catch (e) { console.log(`places: ${e.message}`); }
  try { const d = await gql('{ myself { networkVolumes { id name size dataCenterId } } }'); console.log('network volumes:', JSON.stringify(d.myself?.networkVolumes || [])); } catch (e) { console.log(`volumes: ${e.message}`); }
  process.exit(0);
}
if (args['drop-volume']) { // 9 Nov: two empty volumes were made by the rent loop in data centres that only had the card for a minute; this deletes one by id and forgets it
  const id = String(args['drop-volume']); const known = knownVolumes();
  if (!known.find((v) => v.id === id)) { log(`${id} is not in ${volFile()}; nothing deleted (only volumes Forge made are dropped here)`); process.exit(1); }
  await rp('DELETE', `/networkvolumes/${id}`); saveVolumes(known.filter((v) => v.id !== id)); log(`deleted the network volume ${id} and forgot it`); process.exit(0);
}
if (args.status || args.kill) {
  const pods = (await rp('GET', '/pods')) || [];
  for (const p of pods) log(`${p.id} ${p.name} ${p.desiredStatus} ${p.machine?.gpuTypeId || ''} $${p.costPerHr}/h`);
  if (!pods.length) log('no pods');
  if (args.kill) for (const p of pods) if (p.name?.startsWith('bob-forge')) {
    if (args.kill !== true && String(args.kill) !== p.id) { log(`${p.id} kept (--kill ${args.kill} names another pod)`); continue; } // build 19: two runs side by side; --kill <podId> touches one
    for (const tfn of fs.readdirSync(path.join(outDir, 'forge')).filter((n) => /^pod-token.*\.json$/.test(n))) {
      try { const t = JSON.parse(fs.readFileSync(path.join(outDir, 'forge', tfn), 'utf8')); if (t.pod === p.id) { podId = p.id; base = `https://${p.id}-8000.proxy.runpod.net`; hdr['X-Forge-Token'] = t.token; await salvage(); } } catch {}
    }
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

let podId = args.resume || args.restart || args['send-plan'] || args['send-token'], price = 0, base = args.local || '';
const hdr = { 'X-Forge-Token': token };
// build 19: one pod record per run (two Forge windows can run side by side without touching each other's rental); an older run's single pod-token.json still works for --resume/--send-*
const runTokenFile = path.join(outDir, 'forge', `pod-token-${String(plan.run || 'run').replace(/[^\w.-]/g, '_')}.json`), legacyTokenFile = path.join(outDir, 'forge', 'pod-token.json');
const tokenFile = (podId && !fs.existsSync(runTokenFile) && fs.existsSync(legacyTokenFile)) ? legacyTokenFile : runTokenFile;
if (podId) { const t = JSON.parse(fs.readFileSync(tokenFile, 'utf8')); hdr['X-Forge-Token'] = t.token; }

async function rent() {
  const boot = zlib.gzipSync(fs.readFileSync(path.join(here, 'pod', 'bootstrap.py'))).toString('base64');
  const rungs = plan.benchmark_only ? `benchmark only: the card serves ${(plan.benchmark?.models || []).map((m) => `${m.name}${m.nickname ? ` (${m.nickname})` : ''} from ${String(m.file || '').replace(/^hf:/, 'Hugging Face ')}`).join(' and ')} and this PC runs ${(plan.benchmark?.commands || []).length || 1} test command(s) against each; nothing is trained, cut, uploaded or downloaded but the reports` : plan.rebuild ? ((plan.rebuild.models || []).every((m) => m.weights_only) ? `upload the full-size weights of ${(plan.rebuild.models || []).map((m) => `${m.name}${m.nickname ? ` (${m.nickname}, ${m.private === false ? 'PUBLIC' : 'private'})` : ''}`).join(' and ')} from the drive to Hugging Face (${plan.publish?.user}); nothing is rebuilt or trained, nothing comes down to this PC` : `rebuild ${(plan.rebuild.models || []).map((m) => `${m.name}${m.nickname ? ` (${m.nickname}, ${m.private === false ? 'PUBLIC' : 'private'})` : ''}`).join(' and ')} from the stock teacher + adapter and put GGUFs, full weights, adapters and cards on Hugging Face (${plan.publish?.user}); nothing is trained, nothing comes down to this PC`) : plan.lessons_only ? `lessons only: ${plan.teacher_gguf ? `the GGUF teacher ${plan.teacher_gguf.repo} (${plan.teacher_gguf.file})` : 'the full Qwen'} writes them, nothing is scored, cut or healed` : (plan.train_teacher ? `${plan.train_teacher.name || '35Bob'} (the full Qwen trained on every lesson, no cut)${plan.rungs.length ? ', then ' : ''}` : '') + (plan.rungs.length ? plan.rungs.map((r) => r.name).join(', ') : plan.train_teacher ? '' : plan.skills ? 'expert counts per skill only (no Bob is cut; the counts come back for the differential table)' : 'lessons and the teacher scores only (no Bob is cut)') + (plan.publish ? ` -- Hugging Face (${plan.publish.user}, private): ${[plan.publish.odds ? 'the teacher odds' : '', ...(plan.publish.models || []).map((m) => `${m} (tested, from the drive)`)].filter(Boolean).join(', ') || 'nothing this run'}; no untested Bob is uploaded` : '') + (plan.download_quants ? `; only ${plan.download_quants.join(', ')} GGUF files come down to this PC, the rest stay on the drive` : '');
  console.log(`\nAbout to rent ONE GPU on RunPod to make: ${rungs}`);
  // 10 Nov: a rebuild run can carry a benchmark and the brain scans; the yes-prompt must say so (the PC's check caught a summary that did not)
  if (plan.rebuild && plan.benchmark) console.log(`Then a benchmark on the same card: it serves ${(plan.benchmark.models || []).map((m) => `${m.name}${m.nickname ? ` (${m.nickname})` : ''}`).join(', ')} in turn (${plan.benchmark.hours_each || 2} h cap each) and this PC runs ${(plan.benchmark.commands || []).length || 1} test command(s) against each; the reports land under out/bench. This window must stay open for that.`);
  if (plan.scan) console.log(`Then brain scans (FNRI): the card builds a patched llama.cpp, makes the stock ${plan.scan.stock || 'teacher'} Q4 from the teacher, scans ${(plan.scan.brains || []).join(', ')} one by one, and the recordings come down to this PC as ${plan.scan.zip || 'a zip under out/fnri'}. About 1 to 1.5 hours of card time.`);
  console.log(`Caps: ${hoursMax} hours or $${dollarsMax}, whichever comes first; the pod is deleted when the Bobs are downloaded, or at the cap.`);
  if (plan.volume) { const kv = knownVolumes(); console.log(`Network volume: ${plan.volume.gb || 100} GB kept between sessions (about $${((plan.volume.gb || 100) * 0.07).toFixed(2)} a month each, a standing charge until deleted). Have: ${kv.length ? kv.map((v) => `${v.id} in ${v.name || v.dataCenterId}`).join(', ') : 'none'}. ${plan.data_centers ? `Only in: ${plan.data_centers.join(', ')} (plan.data_centers).` : 'A card is only taken in a data centre with a volume'}${plan.volume_new === false || plan.rebuild ? '; NO new volume is made this run' : '; a new volume is made where the card is if ours are out'}.`); }
  const stepUpShown = stepUpFor(plan.gpus || GPUS);
  console.log(`Cards, in order of preference: ${(plan.gpus || GPUS).join(', ')}`);
  if (stepUpShown.length) console.log(`Step-up card(s) if none is free after ${plan.volume_wait_minutes || 20} minutes: ${stepUpShown.join(', ')}${plan.step_up_note ? ` (${plan.step_up_note})` : ''}\n`); else console.log('');
  if (plan.write_lessons) { const ws = Array.isArray(plan.write_lessons) ? plan.write_lessons : [plan.write_lessons]; console.log(`First the full Qwen writes ${ws.reduce((t, w) => t + (w.count || 800), 0)} extra lessons on the card (${ws.map((w) => w.jobs || 'coding').join(', ')}).`); }
  if (!args.yes) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const ans = await new Promise((r) => rl.question('Type yes to rent now: ', r)); rl.close();
    const a = ans.trim().toLowerCase().replace(/[^a-z]/g, '');
    if (!['yes', 'y', 'yep', 'yeah'].includes(a)) { log(`Not renting: the answer was "${ans.trim().slice(0, 20)}", not yes.`); process.exit(0); }
    log('yes typed: renting');
  }
  const gpus = plan.gpus || GPUS;
  const run = plan.run || `${plan.rungs[0]?.name || 'counts'}-${new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')}`;
  // Build 15 rules (the owner's): (1) a card is taken ONLY in a data centre with a network volume; if our volumes' data centres are
  // out of cards, a volume is made in another data centre that has storage and the card (the teacher downloads again there, once);
  // (2) when the wanted card is out everywhere for volume_wait_minutes, the next card up (step_up) is tried as well, same rules;
  // (3) only plan.volume_fallback === true allows the old "any data centre, no volume" fallback, and then only after the step-up wait.
  // Once a minute for up to plan.rent_minutes (default 90). With a volume the pod's big working files live on its own disk (/forge).
  const rentMinutes = Number(plan.rent_minutes || 90), volWait = Number(plan.volume_wait_minutes || 20);
  const stepUp = stepUpFor(gpus);
  const t0 = Date.now();
  const tried = new Set(); let stepped = false, bare = false;
  for (let attempt = 0; Date.now() - t0 < rentMinutes * 60000; attempt++) {
    const minutes = Math.round((Date.now() - t0) / 60000);
    let cards = gpus;
    if (!stepped && stepUp.length && Date.now() - t0 > volWait * 60000) { stepped = true; log(`no ${gpus.join('/')} anywhere with a volume for ${volWait} minutes: the step-up card(s) ${stepUp.join(', ')} are tried too`); }
    if (stepped) cards = [...gpus, ...stepUp];
    // where to ask this minute: our volumes' data centres first, then other storage data centres that list a wanted card
    let targets = [];
    if (plan.volume) {
      let places = [];
      try { places = await placesWithStorage(cards); } catch (e) { if (attempt % 5 === 0) log(`places: ${e.message.slice(0, 120)}`); }
      for (const v of knownVolumes()) if (!targets.find((t) => t.dc === v.dataCenterId)) targets.push({ dc: v.dataCenterId, name: v.name || v.dataCenterId, vol: v });
      for (const p of places) if (!targets.find((t) => t.dc === p.id)) targets.push({ dc: p.id, name: p.name, vol: null, gpu: p.gpu, available: p.available });
      if (plan.volume_fallback === true && stepped && Date.now() - t0 > 2 * volWait * 60000 && !bare) { bare = true; log('volume_fallback is on: trying any data centre WITHOUT a volume as well (the teacher downloads again; nothing is kept)'); }
      if (bare) targets.push({ dc: null, name: 'anywhere', vol: null });
      // 9 Nov: a rebuild run (or volume_new: false) reads files off a specific drive, so no new volume is ever made; plan.data_centers pins the places
      if (plan.volume_new === false || plan.rebuild) targets = targets.filter((t) => t.vol);
      if (Array.isArray(plan.data_centers)) targets = targets.filter((t) => t.dc && plan.data_centers.includes(t.dc));
      if (!targets.length && attempt % 5 === 0) log(`no data centre to ask in this minute (our volumes: ${knownVolumes().map((v) => v.dataCenterId).join(', ') || 'none'}${plan.data_centers ? `; allowed: ${plan.data_centers.join(', ')}` : ''})`);
    } else targets = [{ dc: null, name: 'anywhere', vol: null }];
    for (const t of targets) {
      // a new volume only where the card is listed as in stock (RunPod's flag is strict, so this holds back only the "no" cases) and only once per run
      if (plan.volume && t.dc && !t.vol) { if (t.available === false || tried.has(t.dc)) continue; }
      try {
        let useVol = t.vol, root = '/workspace';
        if (plan.volume && t.dc && !useVol) { tried.add(t.dc); useVol = await volumeIn(t.dc, t.name); }
        if (useVol) root = '/forge';
        const pod = await rp('POST', '/pods', {
          name: `bob-forge-${plan.rungs[0]?.name || (plan.lessons_only ? 'lessons' : 'counts')}-${String(plan.run || '').replace(/[^\w.-]/g, '_').slice(0, 40)}`, imageName: plan.image || 'vllm/vllm-openai:v0.28.0', cloudType: 'SECURE',
          gpuTypeIds: cards, gpuTypePriority: 'custom', gpuCount: 1, volumeMountPath: '/workspace',
          ...(useVol ? { networkVolumeId: useVol.id, dataCenterIds: [useVol.dataCenterId], containerDiskInGb: plan.disk_gb || 350 } : { volumeInGb: plan.disk_gb || 350, containerDiskInGb: 40 }),
          ports: (plan.write_lessons || plan.benchmark) ? ['8000/http', '8001/http'] : ['8000/http'], supportPublicIp: false,
          // the PC's RunPod key goes in as FORGE_RUNPOD_KEY (RunPod injects its own limited RUNPOD_API_KEY into every pod, which cannot delete) so the pod can delete itself near the time cap even if this PC falls asleep.
          env: { FORGE_TOKEN: token, FORGE_RUNPOD_KEY: KEY, HF_HUB_ENABLE_HF_TRANSFER: '0', FORGE_HOURS_MAX: String(hoursMax), FORGE_ROOT: root, FORGE_SHARED: '/workspace' },
          dockerEntrypoint: ['bash', '-c'],
          dockerStartCmd: [`mkdir -p ${root} && echo ${boot} | base64 -d | gunzip > /workspace/bootstrap.py && exec python3 /workspace/bootstrap.py`]
        });
        podId = pod.id; price = pod.costPerHr || 0;
        const got = pod.machine?.gpuTypeId || 'a card';
        log(`rented ${got}: pod ${podId}, $${price}/h, in ${t.name}${useVol ? ` with volume ${useVol.id}` : ' WITHOUT a volume'}${stepUp.includes(got) ? ' (the STEP-UP card: the wanted one was out)' : ''}`);
        fs.writeFileSync(tokenFile, JSON.stringify({ pod: podId, token, started: Date.now(), price, run, root, volume: useVol?.id || null, gpu: got, dataCenter: t.dc }));
        return;
      } catch (e) { if (attempt % 5 === 0) log(`rent in ${t.name}: ${e.message.slice(0, 160)} (asking again every minute, ${minutes} min so far)`); }
    }
    await sleep(60000);
  }
  throw new Error(`no card available in ${rentMinutes} minutes; nothing was rented. Try again later.`);
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
  // 10 Nov: tell the pod the PC has everything, so its own self-delete (run.sh `run_done`) does not wait out the grace period if this delete fails
  try { const mk = path.join(outDir, 'forge', 'pc-finished'); fs.writeFileSync(mk, new Date().toISOString()); await upload('pc-finished', mk); } catch {}
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
// the pod has to pull its container image before bootstrap.py can answer; a cold pod with no volume in a slow region can take
// well over 15 min, so the door wait is configurable (plan.door_minutes, default 15) and longer for no-volume runs
const doorMin = plan.door_minutes || (plan.volume ? 15 : 25);
const doorTries = Math.max(1, Math.round(doorMin * 6));
for (let i = 0; i < doorTries && !up; i++) { try { const r = await get('/status'); up = r.ok; } catch {} if (!up) { if (i && i % 30 === 0) log(`still waiting for the pod door (${i / 6 | 0} min of ${doorMin})`); await sleep(10000); } }
if (!up) { await kill(`the pod never answered (${doorMin} min)`); process.exit(1); }
if (args['send-token']) {
  // build 17: hand the Hugging Face token to a running pod after the fact (node forge.mjs --send-token <podId> --plan <plan>); the pod reads
  // in/hf-token only at upload time, so this works any time before the odds or a listed Bob go up
  const tf = path.join(here, 'hf-token.txt'); const tok = (process.env.HF_TOKEN || (fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8') : '')).trim();
  if (!tok) { log('no Hugging Face token: put it in forge/hf-token.txt (one line) or HF_TOKEN'); process.exit(1); }
  const tmp = path.join(outDir, 'forge', 'hf-token'); fs.writeFileSync(tmp, tok); await upload('hf-token', tmp); fs.unlinkSync(tmp);
  log('Hugging Face token is on the pod; uploads the plan allows will use it'); process.exit(0);
}
if (args['send-plan']) {
  // update plan.json on a running pod without touching the run (run.sh reads the plan again at the start of each rung)
  // same shape as the start path: keep files live on the pod by their bare names (build 14i)
  const podPlan = { ...plan, counts: 'counts.json', rungs: plan.rungs.map((r) => r.keep_file ? { ...r, keep_file: path.basename(r.keep_file) } : r) }; delete podPlan.counts_file; delete podPlan.lessons;
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
  if (plan.publish || plan.benchmark_only) { // build 17: the pod uploads the GGUF files to Hugging Face itself; the token lives in forge/hf-token.txt (never in the plan or the repo). 10 Nov: a benchmark-only run gets it too, so a brain on a private page can be fetched
    const tf = path.join(here, 'hf-token.txt'); const tok = (process.env.HF_TOKEN || (fs.existsSync(tf) ? fs.readFileSync(tf, 'utf8') : '')).trim();
    if (!tok) log(plan.publish ? 'plan.publish is set but there is no Hugging Face token (forge/hf-token.txt, one line, or HF_TOKEN): the pod will keep the files for download instead' : 'no Hugging Face token (forge/hf-token.txt or HF_TOKEN): a brain on a private page cannot be fetched for the benchmark');
    else { const tmp = path.join(outDir, 'forge', 'hf-token'); fs.writeFileSync(tmp, tok); await upload('hf-token', tmp); fs.unlinkSync(tmp); log(plan.publish ? `Hugging Face token sent to the pod (uploads go to ${plan.publish.user}/...)` : 'Hugging Face token sent to the pod (to fetch the benchmark brains; nothing is uploaded)'); }
  }
  for (const r of plan.rungs) if (r.keep_file) await upload(path.basename(r.keep_file), path.resolve(here, '..', r.keep_file)); // cut exactly like an earlier Bob
  if (plan.scan?.from) { // 10 Nov: the FNRI scan bundle (a folder per brain) goes up as in/scan.tgz; run.sh unpacks it on the drive
    const from = path.resolve(here, plan.scan.from); if (!fs.existsSync(from)) { log(`plan.scan.from is missing: ${from}`); process.exit(1); }
    const stgz = path.join(outDir, 'forge', 'scan.tgz'); execSync(`tar czf "${stgz}" -C "${from}" .`, { stdio: 'inherit' }); await upload('scan.tgz', stgz); log(`scan bundle sent (${plan.scan.brains?.join(', ') || 'no brains listed'})`);
  }
  // build 18: a benchmark brain rebuilt from his keep list + adapter: files not on Hugging Face (no hf: prefix) go up from out/bobs/<name>/
  for (const m of plan.benchmark?.models || []) if (m.file === 'rebuild') {
    for (const k of ['keep_file', 'adapter']) if (m[k] && !/^hf:/.test(m[k])) await upload(m[k], path.join(outDir, 'bobs', m.name, m[k]));
    if (!m.cards) for (const c of fs.existsSync(path.join(outDir, 'bobs', m.name)) ? fs.readdirSync(path.join(outDir, 'bobs', m.name)).filter((f) => f.endsWith('.bob.json')) : []) await upload(c, path.join(outDir, 'bobs', m.name, c));
  }
  // lesson sets already on the PC (e.g. out/lessons-coding) go up as extra sets too; the pod merges them with the rest
  if (plan.lessons_set) log(`lessons_set ${plan.lessons_set}: the pod takes that lesson set from the drive; the PC's extra sets are not sent`);
  for (const [i, d] of (plan.lessons_set ? [] : (plan.extra_lessons || [])).entries()) { // a folder (its lessons.jsonl) or a .jsonl file (with the toolsets.json beside it)
    const dd = path.resolve(here, '..', d); const lf = d.endsWith('.jsonl') ? dd : path.join(dd, 'lessons.jsonl'); const tf = path.join(path.dirname(lf), 'toolsets.json');
    await upload(`lessons-extra-pc${i}.jsonl`, lf); await upload(`toolsets-extra-pc${i}.json`, tf);
  }
  const podPlan = { ...plan, counts: 'counts.json', rungs: plan.rungs.map((r) => r.keep_file ? { ...r, keep_file: path.basename(r.keep_file) } : r) }; delete podPlan.counts_file; delete podPlan.lessons;
  fs.writeFileSync(path.join(outDir, 'forge', 'plan-sent.json'), JSON.stringify(podPlan, null, 1));
  await upload('plan.json', path.join(outDir, 'forge', 'plan-sent.json'));
  const r = await get('/go', { method: 'POST' }); log(`started: ${await r.text()}`);
}
let lessonsSent = false;
// plan.write_lessons: the pod serves the full Qwen on port 8001; this PC's lesson writer talks to it, then the lessons go up and the pod carries on
async function writeLessonsOnPod() {
  const sets = Array.isArray(plan.write_lessons) ? plan.write_lessons : [plan.write_lessons];
  let total = 0;
  for (let i = 0; i < sets.length; i++) total += await writeOneSet(sets[i], i);
  if (total < (plan.lessons_min || 50)) { log(`too few lessons (${total}); the run cannot go on`); await kill('lesson writing failed'); process.exit(1); }
  const lr = path.join(outDir, 'forge', `lessons-ready-${String(plan.run || 'run').replace(/[^\w.-]/g, '_')}`); fs.writeFileSync(lr, String(total)); await upload('lessons-ready', lr);
  log(`extra lessons sent (${total}); the pod carries on`);
}
async function writeOneSet(w, i) {
  const dir = w.dir || 'lessons-extra';
  const url = args.local ? 'http://127.0.0.1:8001' : `https://${podId}-8001.proxy.runpod.net`;
  const argv = ['write-lessons.mjs', '--url', url, '--parallel', String(w.parallel || 16), '--jobs', w.jobs || 'coding', '--think', w.think || 'all', '--dir', dir, '--count', String(w.count || 800), '--hours', String(w.hours || 1.5), ...(w.drop_tools ? ['--drop-tools', w.drop_tools] : []), ...(w.persona ? ['--persona', path.resolve(here, '..', w.persona)] : [])];
  log(`writing ${w.count || 800} extra lessons through the pod (${w.jobs || 'coding'}, thinking ${w.think || 'all'})`);
  const { spawn } = await import('node:child_process');
  const code = await new Promise((res) => spawn(process.execPath, argv, { cwd: path.join(here, '..'), stdio: 'inherit', env: { ...process.env, LAB_API_KEY: hdr['X-Forge-Token'], LAB_MODEL_NAME: 'teacher', LAB_REMOTE: '1' } }).on('exit', res));
  const ldir = path.join(outDir, dir);
  const n = fs.existsSync(path.join(ldir, 'lessons.jsonl')) ? fs.readFileSync(path.join(ldir, 'lessons.jsonl'), 'utf8').split('\n').filter(Boolean).length : 0;
  log(`lesson writer finished (exit ${code}): ${n} lessons in ${ldir}`);
  if (n < (w.min || 50)) { log(`too few lessons (${n} < ${w.min || 50}) in the ${w.jobs} set; skipping it, the run carries on with the other sets`); return 0; } // one bad set must not cost the whole rental
  await upload(`lessons-extra-${i}.jsonl`, path.join(ldir, 'lessons.jsonl'));
  await upload(`toolsets-extra-${i}.json`, path.join(ldir, 'toolsets.json'));
  return n;
}
const done = new Set(); const got = new Map(); let lastLog = ''; let lastPhase = ''; // got: Bob name -> files already on the PC
let teacherAnswered = false;
async function answerTeacherKey() {
  const ans = path.join(outDir, 'forge', 'teacher-answer');
  try {
    const r = await get('/out/teacher/teacher-key.txt'); const key = (await r.text()).trim();
    const dir = path.join(outDir, 'teacher', key);
    const have = /^[0-9a-f]{8,}$/.test(key) && fs.existsSync(path.join(dir, 'teacher.pt')) && fs.existsSync(path.join(dir, 'lessons-tok.pt')) && !fs.existsSync(path.join(dir, 'teacher.pt.part'));
    fs.writeFileSync(ans, have ? 'have' : 'none'); await upload('teacher-answer', ans);
    if (!have) { log(`teacher scores for lesson set ${key}: none on this PC; the pod does the teacher pass`); return; }
    log(`teacher scores for lesson set ${key} are on this PC: uploading them (${(fs.statSync(path.join(dir, 'teacher.pt')).size / 1e9).toFixed(1)} GB) instead of a teacher pass`);
    await upload('lessons-tok.pt', path.join(dir, 'lessons-tok.pt'));
    await upload('teacher.pt', path.join(dir, 'teacher.pt'));
    fs.writeFileSync(path.join(outDir, 'forge', 'teacher-ready'), key); await upload('teacher-ready', path.join(outDir, 'forge', 'teacher-ready'));
    log('teacher scores uploaded; the pod carries on');
  } catch (e) { log(`teacher-key answer failed: ${e.message.slice(0, 120)} (the pod will do the teacher pass)`); }
}
// build 18: the pod serves one benchmark brain at a time; this PC runs the plan's commands against it ({{url}}, {{name}}, {{out}} are filled
// in), saves what they print under out/bench/<run>/<name>/, then tells the pod to move on (in/bench-done-<name>).
const benchDone = new Set();
async function benchOnPod(name) {
  const url = args.local ? 'http://127.0.0.1:8001' : `https://${podId}-8001.proxy.runpod.net`;
  const dir = path.join(outDir, 'bench', plan.run || 'run', name); fs.mkdirSync(dir, { recursive: true });
  const cmds = plan.benchmark.commands?.length ? plan.benchmark.commands : ['node experts-test.mjs --url {{url}} --counts 8 --out {{out}}'];
  log(`benchmark: ${name} is served by the card; running ${cmds.length} test command(s) on this PC`);
  for (const [i, c] of cmds.entries()) {
    const cmd = c.replace(/{{url}}/g, url).replace(/{{name}}/g, name).replace(/{{out}}/g, dir).replace(/{{run}}/g, plan.run || 'run');
    const lf = path.join(dir, `${String(i + 1).padStart(2, '0')}.log`); fs.writeFileSync(lf, `$ ${cmd}\n`);
    log(`  ${cmd}`);
    const code = await new Promise((res) => { const ch = spawn(cmd, { cwd: path.join(here, '..'), shell: true, windowsHide: true, env: { ...process.env, LAB_URL: url, LAB_API_KEY: hdr['X-Forge-Token'], LAB_MODEL_NAME: name, LAB_REMOTE: '1', LAB_OUT: dir } }); const w = (d) => { fs.appendFileSync(lf, d); process.stdout.write(d); }; ch.stdout.on('data', w); ch.stderr.on('data', w); ch.on('exit', res); ch.on('error', (e) => { w(`${e.message}\n`); res(1); }); });
    fs.appendFileSync(lf, `\n[exit ${code}]\n`); if (code) log(`  command ${i + 1} ended with code ${code} (see ${lf})`);
  }
  const mk = path.join(outDir, 'forge', `bench-done-${name}`); fs.writeFileSync(mk, new Date().toISOString()); await upload(`bench-done-${name}`, mk);
  benchDone.add(name); log(`benchmark: ${name} done; reports in ${dir}`);
}
// 10 Nov: the FNRI recordings (out/fnri/files.json lists them) come home to out/fnri/<run>/ once the pod says done
let scanDone = false;
async function fetchScan() {
  if (!plan.scan || scanDone) return; scanDone = true;
  try {
    const r = await get('/out/fnri/files.json'); if (!r.ok) { log(`scan: no files.json on the pod (${r.status}); nothing to bring home`); return; }
    const list = await r.json(); const dir = path.join(outDir, 'fnri', plan.run || 'run');
    for (const f of list.files || []) await download(`fnri/${f.file}`, path.join(dir, f.file), f.bytes, null);
    log(`FNRI recordings are on the PC: ${dir} (${(list.files || []).filter((f) => f.file.endsWith('recording.json')).length} recording(s))`);
    if (plan.scan.zip) { // the owner, 10 Nov: "download videos when complete bundled in a zip" -- one zip of everything that came home, where the plan says
      const zip = path.resolve(here, plan.scan.zip); fs.mkdirSync(path.dirname(zip), { recursive: true }); fs.rmSync(zip, { force: true });
      const { execSync } = await import('node:child_process');
      try { execSync(process.platform === 'win32' ? `tar -a -c -f "${zip}" -C "${dir}" .` : `cd "${dir}" && zip -qr "${zip}" .`, { stdio: 'inherit' }); log(`FNRI zip: ${zip}`); } catch (e) { log(`FNRI zip failed: ${e.message.slice(0, 120)}; the files are still in ${dir}`); }
    }
  } catch (e) { log(`scan download: ${e.message.slice(0, 160)}`); }
}
let driveBytes = -1; // 9 Nov: out/drive.json from the pod = the Forge-made brains really usable on the drive; kept at out/forge/drive.json for the Lab
while (true) {
  await sleep(args.local ? 3000 : 60000);
  let st = null;
  try { const r = await get('/status'); if (r.ok) st = await r.json(); } catch (e) { log(`status: ${e.message.slice(0, 80)}`); }
  // 10 Nov: Bill's run lost its watcher mid-way (an error inside one pass of this loop ended the process), so the benchmark never ran
  // and the pod sat idle at "done". One bad pass is now logged and the next minute tries again; only the loop's own breaks end it.
  let ended = false;
  try { ended = await pass(st); } catch (e) { log(`watcher: ${(e && e.stack) || e}; trying again next minute`); }
  if (ended) break;
}
async function pass(st) {
  if (st) {
    const ph = `${st.status?.phase || '?'}: ${st.status?.detail || ''}`;
    if (ph !== lastPhase) { lastPhase = ph; log(`[pod] ${ph}`); }
    const tail = (st.log || '').trim().split('\n').slice(-3).join(' | ');
    if (tail && tail !== lastLog) { lastLog = tail; log(`  ${tail.slice(0, 300)}`); }
    // build 15: the pod names the lesson set (out/teacher/teacher-key.txt); if this PC already has that set's teacher scores
    // (out/teacher/<key>/teacher.pt, from an earlier run), they go up instead of a 2-3 h teacher pass; otherwise the pod is told "none"
    if (!teacherAnswered && (st.files || []).find((f) => f.path === 'teacher/teacher-key.txt')) { teacherAnswered = true; await answerTeacherKey(); }
    const dj = (st.files || []).find((f) => f.path === 'drive.json');
    if (dj && dj.bytes !== driveBytes) { try { const r = await get('/out/drive.json'); if (r.ok) { fs.writeFileSync(path.join(outDir, 'forge', 'drive.json'), JSON.stringify(await r.json(), null, 1)); driveBytes = dj.bytes; log('drive list saved (out/forge/drive.json)'); } } catch (e) { log(`drive list: ${e.message.slice(0, 80)}`); } }
    for (const f of st.files || []) {
      const m = f.path.match(/^([^/]+)\/([^/]+)-files\.json$/);
      if (!m) continue;
      const name = m[1];
      if (done.has(name) && got.get(name)?.bytes === f.bytes) continue; // same list as before: nothing new
      try {
        const r = await get(`/out/${f.path}`); const list = await r.json();
        const dest = name === 'counts' ? path.join(outDir, 'counts', plan.run || 'run') : name === 'teacher' ? path.join(outDir, 'teacher', list.key || 'unknown') : path.join(outDir, 'bobs', name);
        const had = got.get(name)?.files || new Set();
        for (const x of list.files) {
          if (had.has(x.file)) continue;
          if (x.published && !plan.download_published) { log(`${x.file} is on Hugging Face (${x.published}); not downloaded (plan.download_published: true to download anyway)`); had.add(x.file); continue; }
          if (x.volume && !plan.download_published) { log(`${x.file} stays on the network drive (${x.volume}); not downloaded (plan.download_quants names what comes down)`); had.add(x.file); continue; }
          await download(`${name}/${x.file}`, path.join(dest, x.file), x.bytes, x.sha256); had.add(x.file);
        }
        got.set(name, { files: had, bytes: f.bytes });
        for (const extra of ['heal-report.json', 'train-report.json', `counts-${name}.json`, `${name}-keep.json`, `${name}-adapter.pt`, 'coverage.md', 'README.md', 'publish.log', ...list.files.map((x) => x.file.replace(/\.gguf$/, '.bob.json'))]) { // the adapter + keep list can rebuild the full-size healed Bob from the teacher
          const e = (st.files || []).find((y) => y.path === `${name}/${extra}`);
          if (e) await download(`${name}/${extra}`, path.join(dest, extra), e.bytes, null);
        }
        fs.writeFileSync(path.join(dest, `${name}-files.json`), JSON.stringify(list, null, 1));
        done.add(name); log(`${list.name || name} is on the PC: ${dest}`);
      } catch (e) { log(`${name}: ${e.message.slice(0, 160)}`); }
    }
    if (st.status?.phase === 'lessons' && /^ready/.test(st.status?.detail || '') && !lessonsSent) { lessonsSent = true; await writeLessonsOnPod(); }
    if (st.status?.phase === 'bench' && plan.benchmark) { const bm = (st.status.detail || '').match(/^(\S+) ready:/); if (bm && !benchDone.has(bm[1])) await benchOnPod(bm[1]); }
    const scoresOnly = !plan.rungs.length && !plan.skills; // no rungs, no counts: the run only writes lessons and makes the teacher scores
    const trained = plan.train_teacher ? (plan.train_teacher.name || '35Bob') : null; // build 17: the trained teacher comes back (or is published) like a Bob
    const gotTrained = !trained || done.has(trained);
    const noOdds = plan.odds === false && !plan.rungs.length; // 9 Nov: a teach-it run (train_teacher, no rungs, odds: false) ends when the taught Bob is back; no teacher scores are made
    const rebuildOnly = Boolean(plan.rebuild); // 9 Nov: a rebuild-and-publish run puts everything on Hugging Face; nothing is downloaded, so the pod's "done" is the end
    const benchOnly = plan.benchmark_only === true; // 10 Nov: a benchmark-only run ends when the pod says done; the reports are already on this PC
    const finished = plan.lessons_only ? lessonsSent : rebuildOnly || benchOnly ? true : gotTrained && (scoresOnly ? (noOdds ? true : done.has('teacher')) : [...done].filter((n) => n !== 'teacher' && n !== trained).length >= Math.max(1, plan.rungs.length));
    if (st.status?.phase === 'done' && plan.scan) await fetchScan();
    if (st.status?.phase === 'done' && finished) { await kill(plan.lessons_only ? 'lessons written; they are on this PC' : rebuildOnly ? 'rebuild finished; the Bobs are on Hugging Face' : benchOnly ? `benchmark finished; the reports are in ${path.join(outDir, 'bench', plan.run || 'run')}` : noOdds ? 'the taught Bob is back; no odds were made (odds: false)' : plan.rungs.length ? 'all Bobs downloaded' : scoresOnly ? 'teacher scores downloaded' : 'counts downloaded'); return true; }
    if (st.status?.phase === 'failed' || (st.exit !== null && st.exit !== undefined && !st.running)) {
      log(`the pod run stopped (${st.status?.detail || 'exit ' + st.exit}). Last log lines:\n${st.log}`);
      if (!args['keep-on-fail']) { await kill('run failed'); } else log('pod kept for a look (--keep-on-fail)');
      return true;
    }
  }
  if ((Date.now() - t0) / 3.6e6 > hoursMax || cost() > dollarsMax) { log(`cap reached ($${cost().toFixed(2)}, ${((Date.now() - t0) / 3.6e6).toFixed(1)} h)`); await kill('cap'); return true; }
  return false;
}
log(`finished: ${[...done].join(', ') || 'nothing downloaded'}; about $${cost().toFixed(2)} spent on this pod${plan.volume ? '; the network volume stays (healed Bobs + teacher kept for next time)' : ''}`);
