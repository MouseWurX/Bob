// Nov 18 2026, from the first live RunPod try: the pod vanished within minutes (its server stopped early, then the
// after line removed it and its logs) while Bob said "starting" for 20 minutes; the account key went onto the pod; the
// rented llama-server had no --jinja; and a pod already gone gave a false COULD NOT STOP alarm. No paid run: fakes only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Machines, Rentals, serverCommand } from '../src/rental.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status });
const rental = { id: 'mach01', service: 'runpod', model: 'owner/repo/file.gguf', name: 'Test', card: '48' };

// ---- the server command ----
{
  const cmd = serverCommand('owner/repo/file.gguf', { minutes: 30, after: 'runpodctl remove pod $RUNPOD_POD_ID' });
  check('llama-server gets --jinja, so tool calls come back as calls', /\/app\/llama-server .*--jinja/.test(cmd));
  check('everything the server says is kept in a file', /2>&1 \| tee \/tmp\/bob-server\.log;/.test(cmd));
  check('stopping early prints its last 50 lines and waits 2 minutes before the machine is removed', /if ! grep -q '\^bob-exit 124\$' \/tmp\/bob-server\.log; then .*tail -n 50 \/tmp\/bob-server\.log; sleep 120; fi; runpodctl remove pod/.test(cmd));
  check('the self-destruct timer still wraps the server', /^\(timeout 1800 \/app\/llama-server/.test(cmd));
}

// ---- a machine that vanishes while it starts: fail at once, with the reason ----
{
  let t = 0;
  const mk = (podAnswer) => new Machines({ now: () => t, fetchImpl: async (url) => { if (/\/pods\/pod1$/.test(url)) return podAnswer(); throw new Error('no answer'); } });
  const sleep = global.setTimeout;
  global.setTimeout = (fn) => { t += 10000; return sleep(fn, 0); };
  const tryReady = async (m) => { try { await m.ready(rental, { id: 'pod1', url: 'https://pod1-8000.proxy.runpod.net/v1', kind: 'machine' }, 'k', { maxMs: 60000, everyMs: 10 }); return ''; } catch (e) { return e.message; } };
  const gone404 = await tryReady(mk(() => new Response('pod not found', { status: 404 })));
  check('a pod RunPod no longer has: it says so on the first look', /no machine pod1 any more/.test(gone404) && t <= 10000, gone404);
  t = 0;
  const exited = await tryReady(mk(() => json({ id: 'pod1', desiredStatus: 'EXITED', lastStatusChange: 'Exited by user' })));
  check('a pod that stopped: RunPod\'s own reason is given', /stopped before the brain came up \(exited: Exited by user\)/.test(exited), exited);
  t = 0;
  const flaky = await tryReady(mk(() => { throw new Error('network down'); }));
  check('a look that fails for another reason is not taken as gone', /didn't come up in 20 minutes/.test(flaky), flaky);
  global.setTimeout = sleep;
}

// ---- stopping a pod that is already gone ----
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-rent-fix-'));
  const events = [];
  const cfg = { dataDir: tmp, rentals: { enabled: { runpod: true }, caps: { month: 10, job: 5, minutes: 30 }, list: [rental] } };
  const r = new Rentals(cfg, { env: { RUNPOD_API_KEY: 'k' }, now: () => 600000, broadcast: (e) => events.push(e), fetchImpl: async () => new Response('{"error":"pod not found to terminate"}', { status: 404 }) });
  const ok = await r.stopRun(rental, { id: 'pod1', kind: 'machine', startedAt: 0, jobs: new Set(), usd: 0, perHour: 1.2 }, 'the job is done');
  const stop = events.find((e) => e.action === 'stop');
  check('"not found" counts as stopped: no COULD NOT STOP alarm', ok === true && stop?.stopped === true);
  clearTimeout(r.timer);
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---- the cost line says it's an estimate ----
{
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('the chat calls Bob\'s cost figure an estimate', /about \$\{esc\(ev\.usd\)\} by Bob's estimate/.test(app) && /Bob's estimate; the service's bill is the real one/.test(app));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
