// What each speed setting costs in answers (the owner, Nov 18: "do perplexity tests against all the optimal settings"):
// llama-perplexity scores one fixed text with plain settings and saves every word's odds (the base), then scores the
// same text once per setting and compares: the KL divergence from the base (0 = the same odds), how often the top
// pick is the same word, and the perplexity itself. A plan holds groups; each group has its own context size, its own
// base and its rows, so a long-context group can judge cache quantization where it matters.
// Like speed-test.mjs it takes the PC test lock, stops on the plan's stop file, never compiles anything and never touches
// live Bob. Everything that starts a program or reads the disk is injected, so the tests use fakes.
//   node model-lab/perplexity-grid.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--dry] [--keep-base]
import fs from 'node:fs';
import path from 'node:path';
import { spawn as nodeSpawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { takeLock, sha256 } from './speed-test.mjs';

// The numbers llama-perplexity prints. Missing ones stay null; nothing is guessed.
export function parsePerplexity(text) {
  const s = String(text || '').replace(/\r\n/g, '\n');
  const num = (re) => { const m = s.match(re); return m ? Number(m[1]) : null; };
  return {
    ppl: num(/Final estimate: PPL = ([\d.]+)/) ?? num(/Mean PPL\(Q\)\s*:\s*([\d.]+)/),
    pplBase: num(/Mean PPL\(base\)\s*:\s*([\d.]+)/),
    kld: num(/Mean\s+KLD:\s*([\d.eE+-]+)/),
    kld99: num(/99\.0%\s+KLD:\s*([\d.eE+-]+)/),
    kldMax: num(/Maximum KLD:\s*([\d.eE+-]+)/),
    sameTop: num(/Same top p:\s*([\d.]+)/),
    tokensPerSec: num(/([\d.]+) tokens per second/)
  };
}

// Check a plan and fill ${NAME} from vars, like speed-test.mjs's loadPlan.
export function loadGrid(file, { read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n'), vars = {} } = {}) {
  const missing = new Set();
  const raw = read(file).replace(/\$\{([A-Z0-9_]+)\}/g, (m, k) => { if (vars[k] === undefined) { missing.add(k); return m; } return JSON.stringify(String(vars[k])).slice(1, -1); });
  const plan = JSON.parse(raw);
  const problems = [...missing].map((k) => `no value for \${${k}} (pass --var ${k}=...)`);
  if (!plan.brain) problems.push('no brain file');
  if (!plan.engines || !Object.keys(plan.engines).length) problems.push('no engines');
  if (!plan.text) problems.push('no text to score');
  if (!Array.isArray(plan.groups) || !plan.groups.length) problems.push('no groups');
  const ids = [];
  for (const g of plan.groups || []) {
    if (!g.id) problems.push('a group with no id');
    if (!(g.ctx > 0) || !(g.chunks > 0)) problems.push(`group ${g.id}: ctx and chunks are needed`);
    for (const r of [g.base, ...(g.rows || [])]) {
      if (!r?.id) { problems.push(`group ${g.id}: a row (or the base) with no id`); continue; }
      ids.push(`${g.id}/${r.id}`);
      if (!plan.engines?.[r.engine]) problems.push(`${g.id}/${r.id}: no engine "${r.engine}"`);
    }
  }
  if (new Set(ids).size !== ids.length) problems.push('two rows share an id');
  return { plan, textFile: plan.text ? path.resolve(path.dirname(file), plan.text) : '', problems };
}

// The command line for one row. The base writes the saved odds; every other row reads them.
export function argsFor(plan, group, row, { textFile, baseFile, isBase }) {
  return ['-m', row.brain || plan.brain, '-f', textFile, '-c', String(group.ctx), '--chunks', String(group.chunks),
    ...(plan.baseArgs || []), ...(group.args || []), ...(row.args || []),
    ...(isBase ? ['--kl-divergence-base', baseFile] : ['--kl-divergence-base', baseFile, '--kl-divergence'])];
}

// One row: run, keep the whole log, read the numbers. A failure keeps its last lines.
export async function runOne({ plan, group, row, isBase, textFile, baseFile, fx }) {
  const args = argsFor(plan, group, row, { textFile, baseFile, isBase });
  const exe = plan.engines[row.engine].exe;
  const t0 = fx.now();
  const r = await fx.run(exe, args, { ...(row.env || {}) }, plan.rowTimeoutMs || 45 * 60e3);
  const out = { group: group.id, row: row.id, base: isBase, cmd: [exe, ...args].join(' '), env: Object.keys(row.env || {}), seconds: Math.round((fx.now() - t0) / 100) / 10, code: r.code, ...parsePerplexity(r.log) };
  if (r.code !== 0 || (isBase ? out.ppl == null : out.kld == null)) out.failed = r.timedOut ? 'timed out' : `exit ${r.code}: ${String(r.log || '').trim().split('\n').slice(-6).join(' | ')}`;
  fx.saveLog(`${group.id}-${row.id}.log`, r.log || '');
  return out;
}

export async function runGrid({ plan, textFile, outDir, fx, keepBase = false }) {
  const results = [];
  for (const group of plan.groups) {
    const baseFile = path.join(outDir, `${group.id}-base.kld`);
    const free = fx.freeDiskGB(outDir);
    if (group.needDiskGB && Number.isFinite(free) && free < group.needDiskGB) { results.push({ group: group.id, row: '-', notRun: `skipped: ${free} GB free on the disk, ${group.needDiskGB} GB wanted for the saved odds` }); continue; }
    for (const [i, row] of [group.base, ...group.rows].entries()) {
      const why = fx.shouldStop();
      if (why) { results.push({ group: group.id, row: row.id, notRun: why, stopped: true }); return results; }
      fx.say(`${group.id}: ${row.id}${i === 0 ? ' (base)' : ''}`);
      const res = await runOne({ plan, group, row, isBase: i === 0, textFile, baseFile, fx });
      results.push(res);
      fx.append(res);
      if (i === 0 && res.failed) { results.push({ group: group.id, row: '(rest)', notRun: 'the base failed, so nothing can be compared' }); break; }
    }
    if (!keepBase) fx.remove(baseFile);
  }
  return results;
}

const f = (n, d = 4) => (n == null ? '-' : Number(n).toFixed(d));
export function summarise(results, plan) {
  const lines = [`# ${plan.name || 'Perplexity grid'}`, '', 'KLD: how far each row\'s odds are from its group\'s base (0 = the same). Same top: how often the most likely word is the same as the base\'s. Lower KLD and higher Same top are better.', ''];
  for (const g of plan.groups) {
    const rows = results.filter((r) => r.group === g.id);
    lines.push(`## ${g.id}: ${g.about || ''} (context ${g.ctx}, ${g.chunks} chunks)`, '', '| Row | PPL | KLD mean | KLD 99% | Same top % | Seconds | Note |', '| --- | --- | --- | --- | --- | --- | --- |');
    for (const r of rows) lines.push(`| ${r.row}${r.base ? ' (base)' : ''} | ${f(r.ppl, 3)} | ${r.base ? '-' : f(r.kld, 5)} | ${r.base ? '-' : f(r.kld99, 4)} | ${r.base ? '-' : f(r.sameTop, 2)} | ${r.seconds ?? '-'} | ${r.failed || r.notRun || ''} |`);
    lines.push('');
  }
  return lines.join('\n');
}

function realFx(outDir) {
  return {
    now: () => Date.now(),
    say: (s) => console.log(s),
    run(exe, args, env, timeoutMs) {
      return new Promise((done) => {
        let log = '', timedOut = false, child;
        try { child = nodeSpawn(exe, args, { env: { ...process.env, ...env }, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true }); } catch (e) { done({ code: -1, log: String(e.message) }); return; }
        const t = setTimeout(() => { timedOut = true; try { child.kill(); } catch {} }, timeoutMs);
        child.stdout.on('data', (d) => { log += d; });
        child.stderr.on('data', (d) => { log += d; });
        child.on('error', (e) => { log += `\n${e.message}`; });
        child.on('close', (code) => { clearTimeout(t); done({ code: timedOut ? -2 : code, log, timedOut }); });
      });
    },
    saveLog: (name, text) => fs.writeFileSync(path.join(outDir, name), text),
    append: (res) => fs.appendFileSync(path.join(outDir, 'results.jsonl'), JSON.stringify(res) + '\n'),
    remove: (file) => { try { fs.rmSync(file, { force: true }); } catch {} },
    freeDiskGB: (dir) => { try { const s = fs.statfsSync(dir); return Math.floor((s.bavail * s.bsize) / 1e9); } catch { return NaN; } },
    shouldStop: () => ''
  };
}

async function main() {
  const a = process.argv.slice(2);
  const opt = (k, d) => { const i = a.indexOf(k); return i >= 0 ? a[i + 1] : d; };
  const planFile = opt('--plan'), outDir = opt('--out');
  if (!planFile || !outDir) { console.log('node model-lab/perplexity-grid.mjs --plan <plan.json> --out <folder> [--var NAME=value ...] [--dry] [--keep-base]'); process.exit(2); }
  const vars = {};
  a.forEach((x, i) => { if (x === '--var' && a[i + 1]) { const [k, ...v] = a[i + 1].split('='); vars[k] = v.join('='); } });
  const { plan, textFile, problems } = loadGrid(planFile, { vars });
  if (problems.length) { console.error('The plan has problems:\n- ' + problems.join('\n- ')); process.exit(1); }
  const runs = plan.groups.reduce((n, g) => n + 1 + g.rows.length, 0);
  fs.mkdirSync(outDir, { recursive: true });
  let textSha = ''; try { textSha = sha256(fs.readFileSync(textFile, 'utf8')); } catch { console.error(`can't read the text ${textFile}`); process.exit(1); }
  fs.writeFileSync(path.join(outDir, 'plan-fingerprint.json'), JSON.stringify({ plan: sha256(JSON.stringify(plan)), text: textSha, runs }, null, 2));
  if (a.includes('--dry')) { console.log(`${runs} runs in ${plan.groups.length} groups. Text ${textSha.slice(0, 12)}. Nothing started.`); return; }
  const lock = takeLock(plan.lock, 'perplexity-grid');
  if (!lock.ok) { console.error(lock.why); process.exit(3); }
  const fx = realFx(outDir);
  fx.shouldStop = () => (plan.stopFile && fs.existsSync(plan.stopFile) ? 'the stop file appeared (Gaming mode or the owner)' : '');
  let results = [];
  try { results = await runGrid({ plan, textFile, outDir, fx, keepBase: a.includes('--keep-base') }); } finally { lock.release(); }
  fs.writeFileSync(path.join(outDir, 'summary.md'), summarise(results, plan));
  console.log(`Done. ${path.join(outDir, 'summary.md')}`);
}

const realOf = (p) => { try { return fs.realpathSync(p); } catch { return path.resolve(p); } };
if (process.argv[1] && realOf(process.argv[1]) === realOf(fileURLToPath(import.meta.url))) main().catch((e) => { console.error(e); process.exit(1); });
