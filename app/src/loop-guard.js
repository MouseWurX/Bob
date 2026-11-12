// Reliability 151-164 (Nov 12): guard rails for Bob's own loop, always on. Common practice for agent loops: one small
// retry budget, a ceiling on calls and time per turn, catching loops that make no progress, and an honest ending.
// Nothing here adds to what the brain reads at the start of a job. The checks run in code; a note reaches the brain
// only when a check fires, and it is one line.
import crypto from 'node:crypto';
import { cleanJobHelps } from './job-helps.js';

export const NUDGE_BUDGET = 2;          // 152: the honesty, empty, can't, promise and tests nudges share two sends-back per turn
export const CALLS_PER_TURN = 40;       // 157: tool calls one turn may run, across all its replies
// 161 (Nov 12): the safety net is always on and uses the job time limit's minutes (Settings, Jobs), whether
// that switch is on or off, so no Bob runs away. Card waits don't count (163).
// Read fresh from the live settings at every check, never copied, so a change in Settings counts at once, even for
// work already running.
export const ceilingMins = (cfg) => cleanJobHelps(cfg?.jobHelps).minutes;
export const ceilingMs = (cfg) => ceilingMins(cfg) * 60000;
export const STALE_ROUNDS = 3;          // 154: rounds in a row that find nothing new
// 159: rounds in a row where every call failed. Four: one tool is set aside after three fails in a row (item 200,
// the owner's rule), and its fourth call comes back "not run"; this is the backstop one round after that.
export const ERROR_ROUNDS = 4;
export const CARRIED_MIN_STEPS = 3;     // 164: a job that runs again keeps at least this many steps

// ---------- 152 + 153: one retry budget per turn ----------
export const nudgeOk = (ctx) => (ctx.nudges || 0) < NUDGE_BUDGET;
export function spendNudge(ctx) { ctx.nudges = (ctx.nudges || 0) + 1; return ctx.nudges; }

// ---------- 154 + 155 + 156: progress ----------
// A result's fingerprint: the same words (case and spacing aside) are the same result.
export const resultHash = (text) => crypto.createHash('sha1').update(String(text ?? '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 8000)).digest('hex').slice(0, 16);

export class Progress {
  constructor() { this.seen = new Set(); this.byKey = new Map(); this.trail = []; this.stale = 0; this.errors = 0; }
  // One call that ran: returns 'new', 'same' (this exact call gave this exact result before this turn, even with
  // an action in between, 156) or 'old' (another call already gave these words).
  record(key, text) {
    const h = resultHash(text);
    this.trail.push(`${key}#${h}`);
    const mine = this.byKey.get(key) || new Set();
    const was = mine.has(h) ? 'same' : this.seen.has(h) ? 'old' : 'new';
    mine.add(h); this.byKey.set(key, mine); this.seen.add(h);
    return was;
  }
  // A call that was not run (a repeat, a bounce): it still counts in the trail, so a cycle through it is seen.
  skipped(key) { this.trail.push(`${key}#skip`); }
  // End of a round: ran = how many calls really ran, fresh = how many found something new, failed = how many failed.
  // Returns 'stale' (STALE_ROUNDS with nothing new), 'errors' (ERROR_ROUNDS all failed), 'cycle' (back and forth) or ''.
  round({ ran, fresh, failed }) {
    this.stale = fresh ? 0 : this.stale + 1;
    if (ran) this.errors = failed === ran ? this.errors + 1 : 0;
    if (this.errors >= ERROR_ROUNDS) return 'errors';
    if (findCycle(this.trail)) return 'cycle';
    if (this.stale >= STALE_ROUNDS) return 'stale';
    return '';
  }
}

// 155: the last calls go round the same short loop twice with the same results (read, write, read, write), and
// the loop has at least two different calls in it (an exact repeat is caught elsewhere). Returns the loop's length.
export function findCycle(trail, periods = [2, 3, 4]) {
  for (const p of periods) {
    if (trail.length < 2 * p) continue;
    const a = trail.slice(-2 * p, -p), b = trail.slice(-p);
    if (new Set(b).size < 2) continue;
    if (a.every((x, i) => x === b[i])) return p;
  }
  return 0;
}

// ---------- One-line notes, sent only when a check fires ----------
export const WRAP_NOTES = {
  stale: (who) => `The last ${STALE_ROUNDS} rounds of tools found nothing new. No more tool calls: tell ${who} what you found and what you couldn't.`,
  cycle: (who) => `You are going back and forth between the same calls with the same results. No more tool calls: tell ${who} what you have and where it's stuck.`,
  errors: (who) => `Every tool call failed ${ERROR_ROUNDS} rounds in a row. No more tool calls: tell ${who} plainly what failed and why.`,
  calls: (who) => `This turn has used ${CALLS_PER_TURN} tool calls, the most one turn may. No more tool calls: tell ${who} what's done and what isn't.`,
  time: (who, mins) => `This job has run ${mins} minutes, its time limit. No more tool calls: tell ${who} what's done and what's left.`
};
export const WRAP_LOGS = {
  stale: `${STALE_ROUNDS} rounds in a row found nothing new; the next round has no tools, so he answers`,
  cycle: 'going back and forth between the same calls; the next round has no tools, so he answers',
  errors: `every call failed ${ERROR_ROUNDS} rounds in a row; the next round has no tools, so he says what failed`,
  calls: `${CALLS_PER_TURN} tool calls this turn; the next round has no tools, so he answers`,
  time: 'the job reached its time limit (the safety net); the next round has no tools, so he wraps up'
};
// Turns off the tools for the next round with one line to the brain, once per turn. Returns true when it fired.
export function wrapUp(ctx, msgs, why, who, log = () => {}, mins = 10) {
  if (ctx.wrapped || !WRAP_NOTES[why]) return false;
  ctx.wrapped = why; ctx.noTools = true; ctx.lastRound = true;
  msgs.push({ role: 'system', content: WRAP_NOTES[why](who, mins), hidden: true });
  log('loop', WRAP_LOGS[why]);
  return true;
}

// 157: a call past the turn's ceiling is not run.
export const CAP_SKIP = `(Not run: this turn has used its ${CALLS_PER_TURN} tool calls.)`;

// 158: calls past the most one reply may run are named back to the brain, so he doesn't think they ran.
export function droppedNote(calls, max) {
  const names = [...new Set(calls.map((c) => String(c?.function?.name || 'a tool')))];
  return `(Not run: ${calls.length} more call${calls.length === 1 ? '' : 's'} in that reply, past the ${max} one reply may run: ${names.join(', ')}. Call again any you still need.)`;
}

// ---------- 160: a real ending when the steps run out ----------
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
export function outOfStepsLine({ done = [], failed = [], looked = 0, lead = 'I ran out of steps before finishing.' } = {}) {
  const d = [...new Set(done.map((x) => clip(x, 80)).filter(Boolean))].slice(-4);
  const f = [...new Set(failed.map((x) => clip(x, 80)).filter(Boolean))].slice(-3);
  const parts = [];
  if (d.length) parts.push(`Done: ${d.join('; ')}.`);
  if (f.length) parts.push(`Didn't work: ${f.join('; ')}.`);
  if (!d.length && !f.length) parts.push(looked ? `I looked ${looked === 1 ? 'once' : `${looked} times`} but changed nothing yet.` : 'Nothing was changed yet.');
  return `(${lead} ${parts.join(' ')} Ask me to carry on, or say it another way.)`;
}

// ---------- 161 + 163: the turn's clock, without card waits ----------
// Card waits are kept per job signal, so approve() and ask_user don't need the turn's ctx.
const waits = new WeakMap();
export function noteWait(signal, ms) { if (signal && typeof signal === 'object' && ms > 0) waits.set(signal, (waits.get(signal) || 0) + ms); }
export const waitedFor = (signal) => (signal && typeof signal === 'object' ? waits.get(signal) || 0 : 0);
// The turn's own time: wall time less card waits.
export const busyMs = (startedAt, signal, now = Date.now()) => Math.max(0, now - startedAt - waitedFor(signal));
export const pastCeiling = (startedAt, signal, now = Date.now(), ceiling = 10 * 60000) => busyMs(startedAt, signal, now) >= ceiling;

// ---------- 162: the turn's stages in the log ----------
export const STAGES = ['reading', 'acting', 'checking', 'answering'];
export function stage(ctx, name, step, log = () => {}, extra = '') {
  if (ctx.stage === name && ctx.stageStep === step) return;
  ctx.stage = name; ctx.stageStep = step; ctx.stageAt = Date.now();
  log('loop', `step ${step + 1}: ${name}${extra ? ` (${extra})` : ''}`);
}

// ---------- 164: a job that runs again keeps its count ----------
// A job runs again after a session switch, a rented-brain card, Gaming or a restart. The run before used some steps
// and nudges; the next run carries on from there instead of getting a whole new budget each time. Try again and Edit
// are new asks, so they start fresh.
export function carriedBudget(job, maxSteps) {
  const used = job?.loopUsed;
  if (!used || job?.redo) return { maxSteps, steps: 0, nudges: 0, calls: 0 };
  const steps = Math.max(0, Number(used.steps) || 0);
  return {
    maxSteps: Math.max(CARRIED_MIN_STEPS, maxSteps - steps),
    steps,
    nudges: Math.min(NUDGE_BUDGET, Math.max(0, Number(used.nudges) || 0)),
    calls: Math.min(CALLS_PER_TURN - 1, Math.max(0, Number(used.calls) || 0))
  };
}
// Kept on the job (it is saved with the queue, so it lasts a restart). steps = steps this run has started.
export function keepBudget(job, ctx, steps) {
  if (!job || job.guest) return;
  job.loopUsed = { steps: (ctx.carriedSteps || 0) + steps, nudges: ctx.nudges || 0, calls: ctx.callsRun || 0 };
}
