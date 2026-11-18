// The perplexity grid runner (model-lab/perplexity-grid.mjs): reading llama-perplexity's numbers, plans, the command
// lines, the order of runs, a failed base, a stop, the disk check and the summary. Nothing here starts an engine or
// reads the real computer: the engine, the clock and the disk are fakes.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parsePerplexity, loadGrid, argsFor, runGrid, summarise } from '../model-lab/perplexity-grid.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const KLD_LOG = `perplexity: 12.34 seconds per pass\r\n[1]5.4321,[2]5.6789,\r\nFinal estimate: PPL = 5.6789 +/- 0.12\r\n====== Perplexity statistics ======\r\nMean PPL(Q)                   :   5.701234 ±   0.120000\r\nMean PPL(base)                :   5.678900 ±   0.110000\r\n====== KL divergence statistics ======\r\nMean    KLD:   0.012345 ±   0.000400\r\nMaximum KLD:   3.210000\r\n99.0%   KLD:   0.150000\r\n====== Token probability statistics ======\r\nSame top p: 97.123 ± 0.200 %\r\n`;
{ const p = parsePerplexity(KLD_LOG);
  check('reads PPL, KLD (mean, 99%, max) and same-top from a Windows log', p.ppl === 5.6789 && p.pplBase === 5.6789 && p.kld === 0.012345 && p.kld99 === 0.15 && p.kldMax === 3.21 && p.sameTop === 97.123, JSON.stringify(p));
  const none = parsePerplexity('error: unknown argument: --moe-cache-mib');
  check('a log with no numbers gives nulls, never guesses', none.ppl === null && none.kld === null && none.sameTop === null); }

const here = path.dirname(fileURLToPath(import.meta.url));
const real = path.join(here, '..', 'model-lab', 'speed-plans', 'perplexity-grid.json');
{ const { plan, problems } = loadGrid(real, { vars: { BRAIN: 'b.gguf', BE15_PERPLEXITY: 'ppl.exe', LOCK: 'lock.txt', STOP_FILE: 'stop.txt' } });
  check('the shipped plan loads with no problems', problems.length === 0, problems.join('; '));
  check('the shipped plan: two groups, every row on be15', plan.groups.length === 2 && plan.groups.every((g) => [g.base, ...g.rows].every((r) => r.engine === 'be15')));
  const ctxOk = plan.groups.every((g) => g.ctx * 2 <= 37000);
  check('every group fits the text: the tool needs twice the context in tokens (long-text.md holds about 37K)', ctxOk);
  const missing = loadGrid(real, { vars: {} }).problems;
  check('missing vars are named', missing.some((m) => m.includes('BE15_PERPLEXITY'))); }

const plan = { name: 'T', brain: 'b.gguf', engines: { e: { exe: 'ppl.exe' } }, text: 't.md', baseArgs: ['-fa', 'on'],
  groups: [{ id: 'g1', ctx: 8192, chunks: 2, needDiskGB: 5, base: { id: 'base', engine: 'e', args: ['-ctk', 'f16'] }, rows: [{ id: 'a', engine: 'e', args: ['-ctk', 'q8_0'], env: { X: '1' } }, { id: 'b', engine: 'e' }] },
    { id: 'g2', ctx: 4096, chunks: 1, base: { id: 'base', engine: 'e' }, rows: [{ id: 'c', engine: 'e' }] }] };
{ const base = argsFor(plan, plan.groups[0], plan.groups[0].base, { textFile: 't.md', baseFile: 'g1.kld', isBase: true });
  const row = argsFor(plan, plan.groups[0], plan.groups[0].rows[0], { textFile: 't.md', baseFile: 'g1.kld', isBase: false });
  check('the base saves the odds; a row reads them and compares', base.join(' ').endsWith('--kl-divergence-base g1.kld') && !base.includes('--kl-divergence') && row.join(' ').endsWith('--kl-divergence-base g1.kld --kl-divergence'));
  check('context, chunks, plan args then row args', row.join(' ').startsWith('-m b.gguf -f t.md -c 8192 --chunks 2 -fa on -ctk q8_0')); }

function fakeFx({ logs = {}, stopAt = '', free = 100 } = {}) {
  const calls = [], removed = [], saved = {}; let t = 0;
  return { calls, removed, saved, now: () => (t += 1000), say: () => {}, append: () => {}, saveLog: (n, s) => { saved[n] = s; }, remove: (f) => removed.push(path.basename(f)), freeDiskGB: () => free,
    shouldStop: () => (calls.length && calls.at(-1).row === stopAt ? 'stop file' : ''),
    run: async (exe, args, env) => { const isBase = !args.includes('--kl-divergence'); const id = `${args[args.indexOf('-c') + 1]}:${isBase ? 'base' : calls.length}`; calls.push({ exe, args, env, row: id }); const l = logs[calls.length - 1]; return l || { code: 0, log: isBase ? 'Final estimate: PPL = 6.0' : KLD_LOG }; } };
}
{ const fx = fakeFx();
  const res = await runGrid({ plan, textFile: 't.md', outDir: 'out', fx });
  check('runs every group: base first, then its rows, in order', fx.calls.length === 5 && res.map((r) => `${r.group}/${r.row}`).join() === 'g1/base,g1/a,g1/b,g2/base,g2/c');
  check('row env is passed through', fx.calls[1].env.X === '1');
  check('each base file is removed after its group (they are big)', fx.removed.join() === 'g1-base.kld,g2-base.kld');
  check('logs kept per row', Object.keys(fx.saved).includes('g1-a.log'));
  const md = summarise(res, plan);
  check('summary has a table per group with KLD and same-top', md.includes('## g1') && md.includes('| a | 5.679 | 0.01235 | 0.1500 | 97.12 |')); }
{ const fx = fakeFx({ logs: { 0: { code: 1, log: 'error: unknown argument: --moe-cache-mib' } } });
  const res = await runGrid({ plan, textFile: 't.md', outDir: 'out', fx });
  check('a failed base skips its rows (nothing to compare) and moves to the next group', res[0].failed.includes('unknown argument') && res[1].notRun.includes('base failed') && res[2].group === 'g2'); }
{ const fx = fakeFx({ logs: { 1: { code: 0, log: 'Final estimate: PPL = 6.1' } } });
  const res = await runGrid({ plan, textFile: 't.md', outDir: 'out', fx });
  check('a row that prints no KLD counts as failed', Boolean(res[1].failed)); }
{ const fx = fakeFx({ free: 2 });
  const res = await runGrid({ plan, textFile: 't.md', outDir: 'out', fx });
  check('too little disk for the saved odds skips the group, says why', res[0].notRun.includes('2 GB free') && res[1].group === 'g2'); }
{ const fx = fakeFx({ stopAt: '8192:base' });
  const res = await runGrid({ plan, textFile: 't.md', outDir: 'out', fx });
  check('the stop file ends the grid at once', res.at(-1).stopped === true && fx.calls.length === 1); }

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
