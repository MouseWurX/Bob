// The standard speed test (llama-bench): the number other people post, so a Lab brain can be compared with them.
// pp512 = how fast a brain reads (512 words of prompt), tg128 = how fast it writes (128 words), each the average of 3
// runs, in words (tokens) a second. The Challenges' own speed is what a brain did on Bob's real questions; this one is
// the same fixed test for everyone. It loads the brain on its own, so Bob's own brain has to be off the card first
// (the Challenges job already asks), and it places layers like Bob does (--fit-target, a 1 GB margin on each card).
import path from 'node:path';
import { findTool, runTool, missingWords } from './llama-tools.js';

export const BENCH = { prompt: 512, gen: 128, repeats: 3, marginMiB: 1024 };

export const benchArgs = (gguf, { prompt = BENCH.prompt, gen = BENCH.gen, repeats = BENCH.repeats, marginMiB = BENCH.marginMiB, cpu = false } = {}) =>
  ['-m', gguf, '-p', String(prompt), '-n', String(gen), '-r', String(repeats), '-o', 'json', ...(cpu ? ['-ngl', '0'] : ['-fitt', String(marginMiB)])];

// llama-bench -o json prints one array: a row per test, with n_prompt, n_gen and avg_ts. Gives
// { read, write, prompt, gen, build, backend } or null when there's nothing to read.
export function readBench(text) {
  const s = String(text || ''), i = s.indexOf('['), j = s.lastIndexOf(']');
  if (i < 0 || j < i) return null;
  let rows; try { rows = JSON.parse(s.slice(i, j + 1)); } catch { return null; }
  if (!Array.isArray(rows) || !rows.length) return null;
  const pp = rows.find((r) => Number(r.n_prompt) > 0 && !Number(r.n_gen));
  const tg = rows.find((r) => Number(r.n_gen) > 0 && !Number(r.n_prompt));
  if (!pp && !tg) return null;
  const r1 = (x) => Math.round(Number(x) * 10) / 10;
  const any = pp || tg;
  return { read: pp ? r1(pp.avg_ts) : null, write: tg ? r1(tg.avg_ts) : null, prompt: pp ? Number(pp.n_prompt) : null, gen: tg ? Number(tg.n_gen) : null, build: String(any.build_number || any.build_commit || '').slice(0, 20), backend: String(any.backends || any.backend || '').slice(0, 40) };
}

// One line for a card or a Save: "Standard speed (llama-bench): reads 1,234 and writes 87.5 words a second (pp512 / tg128)".
export function benchLine(b) {
  if (!b || (b.read == null && b.write == null)) return '';
  const n = (x) => Number(x).toLocaleString('en-US');
  const parts = [b.read != null && `reads ${n(b.read)}`, b.write != null && `writes ${n(b.write)}`].filter(Boolean).join(' and ');
  const tag = [b.read != null && `pp${b.prompt || BENCH.prompt}`, b.write != null && `tg${b.gen || BENCH.gen}`].filter(Boolean).join(' / ');
  return `Standard speed (llama-bench): ${parts} words a second (${tag})`;
}

// Run it on one brain. { ok: true, ...readBench } or { ok: false, error }.
export async function benchBrain(cfg, gguf, { tool = findTool(cfg, 'bench'), run = runTool, signal, onLine, cpu = false } = {}) {
  if (!tool.found) return { ok: false, error: missingWords('bench') };
  const r = await run(tool.path, benchArgs(gguf, { cpu }), { signal, onLine, cwd: path.dirname(tool.path) });
  const b = readBench(r.out);
  if (r.code !== 0 || !b) {
    const last = String(r.err || '').trim().split(/\r?\n/).filter(Boolean).pop() || '';
    return { ok: false, error: `The speed test didn't finish${last ? ` (${last.slice(0, 200)})` : ''}.` };
  }
  return { ok: true, ...b };
}
