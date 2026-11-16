// Re-check old runs in today's test world (16 Nov 2026; after the 800-job read, MouseWurX: "we need to close the gaps in
// the harness"). Each chosen run is done again with its own saved scene, and a stand-in brain on this computer makes
// the very same tool calls the real brain made, in the same order, then says what it said. Bob's real loop and real
// tools answer them in a fresh throwaway home. No model, no rental, no internet. What changes is only the test world,
// so whatever harness-faults.mjs still finds is a gap still open. Run's words and calls stay the old brain's: this
// checks the world, never grades the brain.
//   node model-lab/jobs-recheck.mjs --runs <runs.jsonl> --scenes <scenes.jsonl> [--ids a,b,c | --read <opus-read.jsonl>]
//        [--bob <Bob folder>] [--out <folder>]   (--read: the runs the read marked runner_error)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { harnessFaults } from './harness-faults.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rows = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } }).filter(Boolean);
const say = (t) => ({ choices: [{ message: { role: 'assistant', content: t } }], usage: { completion_tokens: 5, prompt_tokens: 900 } });

export async function recheck({ runs, scenes, ids, bob = path.resolve(here, '..'), out = '', log = console.log }) {
  const old = new Map(rows(runs).map((r) => [r.id, r]));
  const pick = ids.map((id) => old.get(id)).filter(Boolean);
  const tmp = out || fs.mkdtempSync(path.join(os.tmpdir(), 'jobs-recheck-'));
  fs.mkdirSync(tmp, { recursive: true });
  // each run's calls, one per step, in the order the real brain made them
  const plans = new Map(pick.map((r) => [r.id, { text: r.text, calls: (r.steps || []).flatMap((s) => s.calls || []).filter((c) => c.name).map((c) => ({ name: c.name, args: c.args && typeof c.args === 'object' ? c.args : {} })), said: r.said || 'Done.' }]));
  const byText = (t) => [...plans.values()].find((p) => t.includes(p.text.slice(0, 60)));
  const srv = http.createServer((req, res) => {
    if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
    let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
      res.setHeader('content-type', 'application/json');
      // as strict as llama-server about half an emoji
      if (/\\u[dD][89abAB][0-9a-fA-F]{2}(?!\\u[dD][c-fC-F])/.test(b)) { res.statusCode = 400; res.end(JSON.stringify({ error: { code: 400, message: '[json.exception.parse_error.101] parse error: invalid string: surrogate' } })); return; }
      let q = {}; try { q = JSON.parse(b || '{}'); } catch {}
      const msgs = q.messages || [];
      const user = msgs.filter((m) => m.role === 'user').map((m) => String(typeof m.content === 'string' ? m.content : '')).join('\n');
      const p = byText(user);
      if (/^You set up a test computer/.test(String(msgs[0]?.content || '')) || !p || !(q.tools || []).length) { res.end(JSON.stringify(say(p ? p.said : 'All right.'))); return; }
      const done = msgs.filter((m) => m.role === 'tool').length;
      if (done >= p.calls.length) { res.end(JSON.stringify(say(p.said))); return; }
      const c = p.calls[done];
      res.end(JSON.stringify({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `r${done}`, type: 'function', function: { name: c.name, arguments: JSON.stringify(c.args) } }] } }], usage: { completion_tokens: 10, prompt_tokens: 900 } }));
    });
  });
  await new Promise((ok) => srv.listen(0, '127.0.0.1', ok));
  const url = `http://127.0.0.1:${srv.address().port}`;
  const jobsFile = path.join(tmp, 'recheck-jobs.jsonl');
  fs.writeFileSync(jobsFile, pick.map((r) => JSON.stringify({ id: r.id, job: r.job || '', text: r.text })).join('\n') + '\n');
  const offline = path.join(tmp, 'offline.mjs');
  fs.writeFileSync(offline, "const real = globalThis.fetch;\nglobalThis.fetch = async (u, o) => { const s = String(u?.url ?? u); if (/^https?:\\/\\/(127\\.0\\.0\\.1|localhost)[:/]/.test(s)) return real(u, o); return new Response('', { status: 200, headers: { 'content-type': 'text/html' } }); };\n");
  try { fs.rmSync(path.join(tmp, 'recheck'), { recursive: true, force: true }); } catch {}
  const args = ['--import', pathToFileURL(offline).href, path.join(here, 'do-jobs.mjs'), '--url', url, '--bob', bob, '--out', tmp, '--dir', 'recheck', '--jobs', jobsFile, '--scene', 'reuse', '--scenes', scenes, '--parallel', '4', '--no-selftest', '--world-stop', 'off', '--search-stop', 'off', '--job-minutes', '3'];
  const runLog = await new Promise((ok) => {
    const ch = spawn(process.execPath, args, { cwd: here, env: { ...process.env, LAB_API_KEY: 'recheck', LAB_URL: '', LAB_TAVILY_KEY: '' } });
    let t = ''; ch.stdout.on('data', (d) => (t += d)); ch.stderr.on('data', (d) => (t += d)); ch.on('exit', () => ok(t));
  });
  srv.close();
  const freshFile = path.join(tmp, 'recheck', 'runs.jsonl');
  if (!fs.existsSync(freshFile)) { log(runLog.slice(-2000)); throw new Error('the replay ran no jobs (its log is above)'); }
  const fresh = new Map(rows(freshFile).map((r) => [r.id, r]));
  const report = pick.map((r) => {
    const before = harnessFaults(r), now = fresh.get(r.id);
    // a scene whose reply was lost was saved without the reply, so its fix (a cut reply's whole files kept, a shorter
    // retry) can't be replayed from it; the self-test's cut job checks that one. The rest of the run is still checked.
    const after = now ? harnessFaults(now).filter((f) => f.kind !== 'scene_lost') : [{ kind: 'not run', detail: '' }];
    return { id: r.id, before: before.map((f) => f.kind), after: after.map((f) => `${f.kind}: ${f.detail}`), ...(now && harnessFaults(now).some((f) => f.kind === 'scene_lost') ? { lostScene: true } : {}), ...(now?.error ? { error: now.error } : {}) };
  });
  if (fresh.size < pick.length) log(runLog.slice(-1500));
  return { report, dir: path.join(tmp, 'recheck') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = process.argv.slice(2), get = (k) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : ''; };
  const ids = get('--ids') ? get('--ids').split(',').map((x) => x.trim()).filter(Boolean) : get('--read') ? rows(get('--read')).filter((r) => r.verdict === 'runner_error').map((r) => r.id) : [];
  if (!get('--runs') || !get('--scenes') || !ids.length) { console.log('use: --runs <runs.jsonl> --scenes <scenes.jsonl> (--ids a,b | --read <opus-read.jsonl>)'); process.exit(1); }
  const { report, dir } = await recheck({ runs: get('--runs'), scenes: get('--scenes'), ids, bob: get('--bob') || undefined, out: get('--out') });
  for (const r of report) console.log(`${r.after.length ? 'STILL' : 'CLEAR'} ${r.id} before: ${r.before.join(', ') || '(none the check names)'}${r.after.length ? ` | now: ${r.after.join('; ')}` : ''}${r.lostScene ? ' (its scene reply was lost and not saved: the self-test checks that fix)' : ''}`);
  const still = report.filter((r) => r.after.length).length, lost = report.filter((r) => r.lostScene).length;
  console.log(`\n${report.length - still} of ${report.length} runs now have no test-world fault${lost ? ` (${lost} of them had a lost scene reply, which can't be replayed; the self-test checks that fix)` : ''}; ${still} still do. New runs: ${dir}`);
  process.exit(still ? 1 : 0);
}
