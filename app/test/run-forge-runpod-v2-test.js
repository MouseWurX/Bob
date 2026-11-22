// 16 Nov 2026: RunPod retired rest.runpod.io/v1 mid-rent (the name stopped resolving; RunPod's docs: "REST API v1 is
// deprecated and no longer available") and the Forge moved to v2 at api.runpod.io (model-lab/forge/runpod-v2.mjs). This
// suite checks, with a made-up v2 RunPod on this computer and no real key or money: the rent body is v2's nested shape,
// each wanted card is asked for in turn (v2 takes one type a request), a broken body stops at once, pod reads come back in
// the shape the Forge reads, and --status, --kill, --urls and --drop-volume all speak v2. The pod's own self-delete
// (run.sh) uses the v2 address too.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { V2, podBodyV2, podV1, listOf, createPod, volumeV1, volumeBodyV2 } from '../model-lab/forge/runpod-v2.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const lab = fileURLToPath(new URL('../model-lab', import.meta.url));
const read = (p) => fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n');
const fm = read(path.join(lab, 'forge', 'forge.mjs')), sh = read(path.join(lab, 'forge', 'pod', 'run.sh'));

// ---- the addresses ----
check('v2 lives at api.runpod.io/v2', V2 === 'https://api.runpod.io/v2');
// 16 Nov: every pod run keeps a hardware log (GPU temp, power, clocks, VRAM, load, slowdown reasons, processor load, memory)
const hw = (sh.match(/hw_log\(\) \{[\s\S]*?\n\}/) || [''])[0];
check('the pod logs GPU temp, power, limit, clocks, VRAM, load and slowdown reasons', ['temperature.gpu', 'power.draw', 'power.limit', 'clocks.sm', 'clocks.mem', 'memory.used', 'utilization.gpu', 'temperature.memory', 'fan.speed', 'pcie.link.gen.current', 'clocks_throttle_reasons.active'].every((k) => hw.includes(k)));
check('the hardware log also has processor load and memory, every 5 s, into out/ (the PC keeps out/*.log)', /\/proc\/loadavg/.test(hw) && /free -m/.test(hw) && /sleep 5/.test(hw) && /\$OUT\/hw-telemetry\.log/.test(hw));
check('an older driver without slowdown reasons still logs the rest', /\|\| Q=timestamp[^\n]*utilization\.gpu\n/.test(hw));
check('once per run it writes the card, driver, VBIOS, OS, processor and RAM', /driver_version,vbios_version/.test(hw) && /\/proc\/cpuinfo/.test(hw) && /hw-environment\.log/.test(hw));
check('the hardware and machine logs never go up to Hugging Face', /EXC\+=\(--exclude "hw-\*" --exclude "\*\/hw-\*"\)/.test(sh));
check('the hardware logs keep model names only: never a serial, UUID or hostname', !/serial|uuid|hostname|\$HOSTNAME|whoami|\$USER/i.test(hw));
check('the hardware logger stops when the run ends', /hw_log & HWL=\$!; trap '[^']*kill \$WD \$HWL/.test(sh));
check('the Forge and the pod no longer use rest.runpod.io', !/['"`]https:\/\/rest\.runpod\.io/.test(fm) && !/rest\.runpod\.io/.test(sh));
check('the pod deletes itself through v2 (normal end and the time cap)', (sh.match(/'https:\/\/api\.runpod\.io\/v2\/pods\/'\+os\.environ\['RUNPOD_POD_ID'\], method='DELETE'/g) || []).length === 2);
check('v2 network-volume paths', /rp\('PATCH', `\/network-volumes\/\$\{have\.id\}`/.test(fm) && /rp\('POST', '\/network-volumes'/.test(fm) && /rp\('DELETE', `\/network-volumes\/\$\{id\}`/.test(fm) && !/\/networkvolumes/.test(fm));
check('while the door is shut, each "still waiting" line says what RunPod reports (status, uptime, ports)', /still waiting for the pod door \(.*\$\{await podState\(\)\}/.test(fm) && /RunPod says \$\{p\.status/.test(fm) && /not started on its host yet/.test(fm));
check('renting asks for each wanted card in turn (22 Nov: each card set in turn, with its own count)', /pod = await createPod\(rp, \{/.test(fm) && /\}, ask\.cards\);/.test(fm) && /gpuCount: ask\.count/.test(fm));

// ---- the body ----
const v1 = { name: 'bob-forge-x', imageName: 'vllm/vllm-openai:v0.28.0', cloudType: 'SECURE', gpuTypeIds: ['A', 'B'], gpuTypePriority: 'custom', gpuCount: 1, volumeMountPath: '/workspace', networkVolumeId: 'vol1', dataCenterIds: ['US-KS-2'], containerDiskInGb: 350, ports: ['8000/tcp', '8001/tcp'], supportPublicIp: true, env: { FORGE_TOKEN: 't' }, dockerEntrypoint: ['bash', '-c'], dockerStartCmd: ['echo hi'] };
const b = podBodyV2(v1, 'A');
check('v2 body: image, one card, container disk, env map, ports', b.image === v1.imageName && b.gpu.id === 'A' && b.gpu.count === 1 && b.disk === 350 && b.env.FORGE_TOKEN === 't' && b.ports.join() === '8000/tcp,8001/tcp' && b.cloud === 'SECURE');
check('v2 body: the entrypoint and start command carry over (bash -c "...")', b.entrypoint.join(' ') === 'bash -c' && b.cmd.length === 1 && b.cmd[0] === 'echo hi');
check('v2 body: a network volume mounts at /workspace, with no host disk beside it', b.mounts.network?.[0]?.volumeId === 'vol1' && b.mounts.network[0].path === '/workspace' && !b.mounts.persistent && b.dataCenterIds[0] === 'US-KS-2');
check('v2 body: v1-only fields are gone (v2 answers 422 to unknown fields)', !('gpuTypeIds' in b) && !('gpuTypePriority' in b) && !('supportPublicIp' in b) && !('imageName' in b) && !('dockerStartCmd' in b) && !('volumeInGb' in b));
const bare = podBodyV2({ ...v1, networkVolumeId: undefined, dataCenterIds: undefined, volumeInGb: 350, containerDiskInGb: 40 }, 'B');
check('v2 body without a volume: a 350 GB host disk at /workspace, any data centre', bare.mounts.persistent?.size === 350 && bare.mounts.persistent.path === '/workspace' && !bare.mounts.network && !('dataCenterIds' in bare) && bare.disk === 40);

// ---- reading pods and volumes back ----
const pod = podV1({ id: 'p1', name: 'bob-forge-x', status: 'RUNNING', cost: 2.99, gpu: { id: 'NVIDIA H100 80GB HBM3', count: 1 }, dataCenterId: 'US-KS-2', runtime: { ports: [{ private: 8000, public: 40001, type: 'tcp', ip: '1.2.3.4' }, { private: 8001, public: 40002, type: 'tcp', ip: '1.2.3.4' }, { private: 8888, public: null, type: 'http', ip: null }] } });
check('a v2 pod reads as the Forge expects (price, card, data centre, status)', pod.costPerHr === 2.99 && pod.machine.gpuTypeId === 'NVIDIA H100 80GB HBM3' && pod.machine.dataCenterId === 'US-KS-2' && pod.desiredStatus === 'RUNNING');
check('a v2 pod\'s tcp ports become the direct address', pod.publicIp === '1.2.3.4' && pod.portMappings['8000'] === 40001 && pod.portMappings['8001'] === 40002 && !('8888' in pod.portMappings));
check('a pod still starting (no runtime) has no direct ports', Object.keys(podV1({ id: 'p2', status: 'STARTING', runtime: null }).portMappings).length === 0);
check('v2 lists are unwrapped; a bare array still reads', listOf({ pods: [{ id: 1 }] }, 'pods').length === 1 && listOf([{ id: 1 }, { id: 2 }], 'pods').length === 2 && listOf(null, 'pods').length === 0);
check('v2 volumes: dataCenter in and out', volumeBodyV2({ name: 'n', size: 300, dataCenterId: 'EU-RO-1' }).dataCenter === 'EU-RO-1' && !('dataCenterId' in volumeBodyV2({ name: 'n', size: 1, dataCenterId: 'x' })) && volumeV1({ id: 'v', dataCenter: 'EU-RO-1' }).dataCenterId === 'EU-RO-1');

// ---- createPod: each card in turn; a broken body stops at once ----
{
  const asked = [];
  const rp = async (m, p, body) => { asked.push(body.gpu.id); if (body.gpu.id !== 'C') throw new Error(`POST /pods: 400 {"title":"Bad Request","detail":"no capacity"}`); return { id: 'p9', cost: 3.5, gpu: { id: 'C' } }; };
  const got = await createPod(rp, v1, ['A', 'B', 'C', 'D']);
  check('no capacity for the first cards: the next one is asked for, and the first pod made is kept', got.id === 'p9' && got.machine.gpuTypeId === 'C' && got.costPerHr === 3.5 && asked.join() === 'A,B,C');
  const asked2 = [];
  let err = '';
  try { await createPod(async (m, p, body) => { asked2.push(body.gpu.id); throw new Error('POST /pods: 422 {"title":"Unprocessable"}'); }, v1, ['A', 'B']); } catch (e) { err = e.message; }
  check('a 422 (broken body) stops at the first card and says why', asked2.length === 1 && /422/.test(err));
  err = '';
  try { await createPod(async () => { throw new Error('POST /pods: 400 no capacity'); }, v1, ['A', 'B']); } catch (e) { err = e.message; }
  check('no card anywhere: one error naming each card', /A: .*\| B: /.test(err));
}

// ---- the Forge itself against a made-up v2 RunPod ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'forge-v2-'));
  const brain = http.createServer((q, r) => { r.writeHead(q.url === '/health' ? 200 : 404); r.end('{}'); });
  await new Promise((res) => brain.listen(0, '127.0.0.1', res));
  const seen = [];
  const pods = () => [
    { id: 'podx', name: 'bob-forge-counts-v2test', status: 'RUNNING', cost: 2.5, gpu: { id: 'NVIDIA H200', count: 1 }, dataCenterId: 'US-KS-2', runtime: { ports: [{ private: 8000, public: 1, type: 'tcp', ip: '127.0.0.1' }, { private: 8001, public: brain.address().port, type: 'tcp', ip: '127.0.0.1' }] } },
    { id: 'theirs', name: 'someone-else', status: 'RUNNING', cost: 1, gpu: { id: 'NVIDIA A40' }, runtime: null }
  ];
  const rest = http.createServer((q, r) => { let body = ''; q.on('data', (d) => (body += d)); q.on('end', () => {
    seen.push(`${q.method} ${q.url}`);
    r.setHeader('content-type', 'application/json');
    if (!q.url.startsWith('/v2/')) { r.writeHead(404); r.end('{"title":"Not Found"}'); return; }
    if (q.headers.authorization !== 'Bearer k') { r.writeHead(401); r.end('{"title":"Unauthorized"}'); return; }
    if (q.method === 'GET' && q.url === '/v2/pods') { r.end(JSON.stringify({ pods: pods(), pagination: { nextCursor: null, hasNextPage: false } })); return; }
    if (q.method === 'GET' && q.url === '/v2/pods/podx') { r.end(JSON.stringify(pods()[0])); return; }
    if (q.method === 'DELETE') { r.writeHead(204); r.end(); return; }
    r.writeHead(404); r.end('{"title":"Not Found"}');
  }); });
  await new Promise((res) => rest.listen(0, '127.0.0.1', res));
  const fo = path.join(tmp, 'out'); fs.mkdirSync(path.join(fo, 'forge'), { recursive: true });
  const env = { ...process.env, RUNPOD_API_KEY: 'k', FORGE_REST: `http://127.0.0.1:${rest.address().port}/v2`, FORGE_OUT: fo };
  const run = (extra) => new Promise((res) => { const c = spawn(process.execPath, [path.join(lab, 'forge', 'forge.mjs'), ...extra], { stdio: 'pipe', env, cwd: path.join(lab, 'forge') }); let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('exit', (code) => res({ code, o })); });

  const st = await run(['--status']);
  check('--status lists the pods from a v2 answer with their card and price', st.code === 0 && /podx bob-forge-counts-v2test RUNNING NVIDIA H200 \$2\.5\/h/.test(st.o) && /theirs someone-else/.test(st.o), st.o.slice(-300));
  seen.length = 0;
  const k = await run(['--kill', 'podx']);
  check('--kill <pod> deletes only that Forge pod, through v2', k.code === 0 && seen.includes('DELETE /v2/pods/podx') && !seen.some((s) => /DELETE .*theirs/.test(s)) && /deleted podx/.test(k.o), k.o.slice(-300));

  const les = path.join(tmp, 'lessons'); fs.mkdirSync(les); fs.writeFileSync(path.join(les, 'lessons.jsonl'), '\n'); fs.writeFileSync(path.join(les, 'toolsets.json'), '{}'); fs.writeFileSync(path.join(les, 'counts.json'), '{}');
  const pf = path.join(tmp, 'plan.json'); fs.writeFileSync(pf, JSON.stringify({ run: 'v2test', direct: true, rungs: [], lessons: les, counts_file: path.join(les, 'counts.json'), benchmark: { models: [] } }));
  fs.writeFileSync(path.join(fo, 'forge', 'pod-token-v2test.json'), JSON.stringify({ pod: 'podx', token: 't', started: Date.now(), price: 1 }));
  const u = await run(['--urls', 'podx', '--plan', pf]);
  check('--urls finds the direct brain in a v2 pod\'s runtime ports', u.code === 0 && u.o.includes(`set LAB_URL=http://127.0.0.1:${brain.address().port}`), u.o.slice(-300));

  fs.writeFileSync(path.join(fo, 'forge', 'volume.json'), JSON.stringify({ volumes: [{ id: 'vol7', size: 300, dataCenterId: 'US-KS-2' }] }));
  seen.length = 0;
  const dv = await run(['--drop-volume', 'vol7']);
  check('--drop-volume deletes through /v2/network-volumes and forgets it', dv.code === 0 && seen.includes('DELETE /v2/network-volumes/vol7') && JSON.parse(fs.readFileSync(path.join(fo, 'forge', 'volume.json'), 'utf8')).volumes.length === 0, dv.o.slice(-300));
  // pre-flight asks RunPod (read-only) before anything is rented: a dead address stops it
  const pp = path.join(tmp, 'pre.json'); fs.writeFileSync(pp, JSON.stringify({ run: 'pre', rungs: [], lessons: les, counts_file: path.join(les, 'counts.json'), hours_max: 1, dollars_max: 5 }));
  seen.length = 0;
  const ok = await run(['--plan', pp, '--preflight']);
  check('pre-flight asks RunPod for the pod list (read-only) and passes when it answers', ok.code === 0 && seen.includes('GET /v2/pods') && !seen.some((x) => /^(POST|DELETE|PATCH)/.test(x)) && /RunPod answers at/.test(ok.o), ok.o.slice(-400));
  const dead = await new Promise((res) => { const c = spawn(process.execPath, [path.join(lab, 'forge', 'forge.mjs'), '--plan', pp, '--preflight'], { stdio: 'pipe', env: { ...env, FORGE_REST: 'http://127.0.0.1:9/v1' }, cwd: path.join(lab, 'forge') }); let o = ''; c.stdout.on('data', (d) => (o += d)); c.stderr.on('data', (d) => (o += d)); c.on('exit', (code) => res({ code, o })); });
  check('a RunPod address that does not answer fails pre-flight, so nothing is rented', dead.code === 1 && /PRE-FLIGHT FAIL: RunPod's rental address/.test(dead.o) && /Not renting/.test(dead.o), dead.o.slice(-400));
  brain.close(); rest.close();
  try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
