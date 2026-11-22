// 22 Nov 2026 (deepseek-tools): a pod with several cards. 3fff3cf asked RunPod for gpuCount 1 whatever the plan said and
// told the owner "About to rent ONE GPU" for a 2-card plan, and when 2 x H200 NVL was out nothing else was tried. With a
// made-up RunPod on this computer (no real key, nothing rented: every rent answers "no instances"), this checks that
// plan.gpu_count posts that many cards and says so, and that plan.card_sets asks for each set in order with its own count,
// prices them from RunPod's card list, and leaves out a set over the dollar cap or too small for the brain.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const lab = fileURLToPath(new URL('../model-lab', import.meta.url));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-cardsets-'));
const posts = [];
const PRICES = [
  { id: 'NVIDIA H200 NVL', securePrice: 3.79, memoryInGb: 143 },
  { id: 'NVIDIA H200', securePrice: 5.29, memoryInGb: 141 },
  { id: 'NVIDIA RTX PRO 6000 Blackwell Server Edition', securePrice: 2.69, memoryInGb: 96 },
  { id: 'NVIDIA H100 80GB HBM3', securePrice: 4.39, memoryInGb: 80 }
];
const srv = http.createServer((q, r) => { let body = ''; q.on('data', (d) => (body += d)); q.on('end', () => {
  r.setHeader('content-type', 'application/json');
  if (q.url.startsWith('/graphql')) { r.end(JSON.stringify({ data: { gpuTypes: PRICES } })); return; }
  if (q.method === 'GET' && q.url === '/v2/pods') { r.end(JSON.stringify({ pods: [] })); return; }
  if (q.method === 'POST' && q.url === '/v2/pods') { try { posts.push(JSON.parse(body)); } catch { posts.push({ bad: body }); } r.writeHead(400); r.end(JSON.stringify({ detail: 'There are no longer any instances available with the requested specifications.' })); return; }
  r.writeHead(404); r.end('{}');
}); });
await new Promise((res) => srv.listen(0, '127.0.0.1', res));
const base = `http://127.0.0.1:${srv.address().port}`;
const fo = path.join(tmp, 'out'); fs.mkdirSync(path.join(fo, 'forge'), { recursive: true });
const les = path.join(tmp, 'lessons'); fs.mkdirSync(les); for (const [f, t] of [['lessons.jsonl', '\n'], ['toolsets.json', '{}'], ['counts.json', '{}']]) fs.writeFileSync(path.join(les, f), t);
const env = { ...process.env, RUNPOD_API_KEY: 'k', FORGE_REST: `${base}/v2`, FORGE_GQL: `${base}/graphql`, FORGE_OUT: fo };
const run = (plan, extra = []) => new Promise((res) => {
  const pf = path.join(tmp, `${plan.run}.json`); fs.writeFileSync(pf, JSON.stringify({ rungs: [], lessons: les, counts_file: path.join(les, 'counts.json'), hours_max: 3, dollars_max: 25, rent_minutes: 0.02, benchmark_only: true, benchmark: { models: [] }, ...plan }));
  const c = spawn(process.execPath, [path.join(lab, 'forge', 'forge.mjs'), '--plan', pf, ...extra], { stdio: 'pipe', env, cwd: path.join(lab, 'forge') });
  let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d));
  const kill = setTimeout(() => c.kill(), 60000);
  c.on('close', (code) => { clearTimeout(kill); res({ code, o }); });
});

// plan.gpu_count: 2 cards in the post, and the message says so
posts.length = 0;
const two = await run({ run: 'two', gpus: ['NVIDIA H200 NVL'], gpu_count: 2 }, ['--yes']);
check('gpu_count 2: the pod request asks for 2 cards', posts.length >= 1 && posts.every((b) => b.gpu?.count === 2 && b.gpu?.id === 'NVIDIA H200 NVL'), JSON.stringify(posts.map((b) => b.gpu)));
check('gpu_count 2: the message names the count, never "ONE GPU"', /About to rent ONE pod with 2 GPUs/.test(two.o) && !/ONE GPU/.test(two.o) && /2 of one type in the pod/.test(two.o), two.o.slice(0, 400));
check('nothing was rented: every ask answered "no instances", and it ends with nothing rented', two.code !== 0 && /no card available/.test(two.o), two.o.slice(-300));
posts.length = 0;
const one = await run({ run: 'one', gpus: ['NVIDIA H200'] }, ['--yes']);
check('no gpu_count: one card, as before', posts.length >= 1 && posts.every((b) => b.gpu?.count === 1) && /About to rent ONE GPU/.test(one.o), JSON.stringify(posts.map((b) => b.gpu)));

// plan.card_sets: in order, each with its own count, priced, over-cap and too-small sets left out
const sets = { card_sets: [{ gpus: ['NVIDIA H200 NVL'], count: 2 }, { gpus: ['NVIDIA H200'], count: 2 }, { gpus: ['NVIDIA RTX PRO 6000 Blackwell Server Edition'], count: 3 }, { gpus: ['NVIDIA H100 80GB HBM3'], count: 2 }], vram_gb: 270, expected_hours: 2.5, dollars_max: 25 };
// H200 NVL 2 x 3.79 = 7.58/h, 18.95 for 2.5 h: in; H200 2 x 5.29 = 10.58/h, 26.45: over $25, out; RTX PRO 6000 3 x 2.69 = 8.07/h,
// 288 GB: in; H100 2 x 80 = 160 GB: under 270 GB, out
const pf = await run({ run: 'setspf', ...sets }, ['--preflight']);
check('pre-flight prices every set and says which are left out and why', pf.code === 0 && /card set 2 x NVIDIA H200 NVL \(286 GB\), \$7\.58\/h, about \$18\.95 expected/.test(pf.o) && /2 x NVIDIA H200 \(282 GB\), \$10\.58\/h, about \$26\.45 expected: LEFT OUT, expected \$26\.45 \(2\.5 h\) is over the \$25 cap/.test(pf.o) && /2 x NVIDIA H100 80GB HBM3 \(160 GB\).*LEFT OUT, 160 GB of VRAM, the brain needs 270 GB/.test(pf.o), pf.o.slice(-900));
posts.length = 0;
const rs = await run({ run: 'sets', ...sets }, ['--yes']);
check('card sets: asked in order, each with its own count, the left-out ones never asked', posts.length >= 2 && posts[0].gpu?.id === 'NVIDIA H200 NVL' && posts[0].gpu?.count === 2 && posts[1].gpu?.id === 'NVIDIA RTX PRO 6000 Blackwell Server Edition' && posts[1].gpu?.count === 3 && !posts.some((b) => /^NVIDIA H200$|H100/.test(b.gpu?.id || '')), JSON.stringify(posts.map((b) => b.gpu)));
check('card sets: the message names each set and its count', /About to rent ONE pod \(the first free of: 2 x NVIDIA H200 NVL, then 3 x NVIDIA RTX PRO 6000 Blackwell Server Edition\)/.test(rs.o), rs.o.slice(0, 500));
const none = await run({ run: 'none', ...sets, dollars_max: 5 }, ['--preflight']);
check('every set over the cap: pre-flight fails and nothing is asked for', none.code === 1 && /PRE-FLIGHT FAIL: no card set fits/.test(none.o), none.o.slice(-300));
posts.length = 0;
const rp = await run({ run: 'rentplan', ...sets }, ['--rent-plan']);
check('--rent-plan shows what each set would post and posts nothing', rp.code === 0 && /would post: \{"gpu":\{"id":"NVIDIA H200 NVL","count":2\}/.test(rp.o) && posts.length === 0, rp.o.slice(-400));

// 22 Nov 2026 (DeepSeek try 1: 395 GB at 40 MB/s ate the 3 h cap, $24, no job ran): the retry plan asks for H200 sets only
// (the owner: "dont run it on a slow card"), waits for stock, and the pod stops a download that projects past the limit.
{
  const here = path.dirname(fileURLToPath(import.meta.url));
  const rd = (f) => fs.readFileSync(path.join(here, '..', 'model-lab', 'forge', f), 'utf8').replace(/\r\n/g, '\n');
  const dp = JSON.parse(rd('plans/jobs-deepseek-tools.json'));
  check('deepseek plan: H200 sets only', dp.card_sets.length > 0 && dp.card_sets.every((c) => c.gpus.every((g) => /H200/.test(g))));
  check('deepseek plan: download limit and size set, caps 3 h / $28', dp.benchmark.download_max_minutes > 0 && dp.benchmark.models[0].download_gb > 0 && dp.hours_max === 3 && dp.dollars_max === 28);
  const sh = rd('pod/run.sh');
  check('run.sh: the split-GGUF download goes through dl_watched, which fails the run when too slow', /dl_watched\(\) \{/.test(sh) && /dl_watched \$W\/bench\/hf-\$BN "\$BGB" "\$BDM" hf download/.test(sh) && /die "download too slow/.test(sh));
}

srv.close();
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
