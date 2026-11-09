// 1.5.167 Computer Science Lab, Professional mode: how a challenge run asks its questions. Simple mode (and every
// score on the leaderboard) uses the defaults: temperature 0, thinking off, 8,192 tokens of room, one run. Professional
// mode can change them, and repeat a run to show the spread. A run with other settings is a study, not a ranking:
// it gets its report and its question-by-question log, but never touches the scoreboard.

export const GEN_DEFAULT = Object.freeze({ temperature: 0, seed: 42, think: false, ctx: 8192, repeats: 1 });
export const CTX_CHOICES = [4096, 8192, 16384, 32768];
export const MAX_REPEATS = 5;
export const THINK_EXTRA = 2048; // room for the thinking before the answer when thinking is on

const num = (v, lo, hi, dflt) => { const n = Number(v); return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : dflt; };
export function cleanGen(g = {}) {
  return {
    temperature: Math.round(num(g.temperature, 0, 2, 0) * 100) / 100,
    seed: Math.round(num(g.seed, 0, 2147483647, GEN_DEFAULT.seed)),
    think: g.think === true,
    ctx: CTX_CHOICES.includes(Number(g.ctx)) ? Number(g.ctx) : GEN_DEFAULT.ctx,
    repeats: Math.round(num(g.repeats, 1, MAX_REPEATS, 1))
  };
}
// True when a run's answers can go on the scoreboard (the settings every ranked score was made with).
export const rankable = (g) => { const x = cleanGen(g); return x.temperature === 0 && !x.think && x.ctx === GEN_DEFAULT.ctx; };
// The fields of a /v1/chat/completions body that the settings decide. `repeat` (0-based) moves the seed, so repeats
// at a temperature above 0 differ from each other but the same run can be made again.
export function genBody(g, max, repeat = 0) {
  const x = cleanGen(g);
  return { temperature: x.temperature, seed: x.seed + repeat, max_tokens: x.think ? max + THINK_EXTRA : max, chat_template_kwargs: { enable_thinking: x.think } };
}
// A short line for reports and Save: what the run was asked with.
export function genLine(g) {
  const x = cleanGen(g);
  return `Temperature ${x.temperature}, thinking ${x.think ? 'on' : 'off'}, ${x.ctx.toLocaleString('en')} tokens of room${x.repeats > 1 ? `, ${x.repeats} runs (seed ${x.seed} and up)` : ''}.`;
}
// The spread of repeated scores: lowest, highest, and the average.
export function spread(scores = []) {
  const s = scores.filter((x) => typeof x === 'number');
  if (!s.length) return null;
  return { low: Math.min(...s), high: Math.max(...s), mean: Math.round(s.reduce((a, b) => a + b, 0) / s.length), runs: s.length };
}
