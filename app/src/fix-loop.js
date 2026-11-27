// Settings, Jobs, "Fix until the tests pass" (off by default; Nov 27, the owner: "running tests without fixing isn't a
// loop that will ever work"). When he's about to say a coding job is done, Bob runs the project's tests himself, through
// run_command (so the command card still asks first, and the Run Hand has to be on). Failing: the failures go back to
// him with "fix them, then answer again", and the tests run again when he does. It ends when:
//   - they pass (a ✅ line under the answer says so),
//   - he's out of ideas: he answers again without changing any code since the last failing run, or the exact same
//     failures came back SAME_FAILS runs in a row although he changed code each time (going round in circles),
//   - the tests can't run (the card was denied, the Run Hand is off, the program isn't there).
// No count of tries ends it (the owner's rule: stuck checks only). When it stops with tests still failing, he gets one
// last go to say plainly what's still broken, and the app adds its own ❌ line naming the failures, so the report never
// rests on the brain's word alone. Not in Turbo; nothing here reaches the brain unless the switch is on and code changed.
import crypto from 'node:crypto';
import { jobHelp, testCommandFor } from './job-helps.js';

export const SAME_FAILS = 3; // the same failures this many runs in a row, with code changed in between: going in circles
const clip = (s, n) => { const t = String(s ?? ''); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const ownJob = (job) => !job?.guest;
const cmdLine = (t) => [t.cmd, ...t.args].join(' ');
// A path as the brain wrote it -> where it is on disk, and back (the Lab's test world gives the brain made-up paths;
// in the app both are the same path).
const real = (brain, p) => (typeof brain.realPath === 'function' ? brain.realPath(p) || p : p);
const shown = (brain, p) => (typeof brain.shownPath === 'function' ? brain.shownPath(p) || p : p);

// How a run_command result ended: 'pass', 'fail' or 'notrun' (with why).
export function testOutcome(text) {
  const s = String(text ?? '');
  if (/^Finished with exit code 0\b/m.test(s)) return { kind: 'pass' };
  if (/^Finished with exit code -?\d+/m.test(s) || /^Stopped: it ran past/m.test(s)) return { kind: 'fail' };
  if (/said no/i.test(s)) return { kind: 'notrun', why: 'the command card was denied' };
  if (/^Stopped by the user/m.test(s)) return { kind: 'notrun', why: 'it was stopped' };
  if (/^It didn't start: (.+)/m.test(s)) return { kind: 'notrun', why: `it didn't start: ${clip(s.match(/^It didn't start: (.+)/m)[1], 120)}` };
  return { kind: 'notrun', why: clip(s.replace(/^Error:\s*/, '').split('\n')[0] || 'no result came back', 160) };
}

// The lines that name what failed (node:test, Jest, Mocha, TAP, pytest, cargo, go test, and plain "Error:" lines),
// with times and counters taken out so the same failures look the same from run to run.
const FAIL_LINE = /(?:✖|✗|×|\bFAIL(?:ED)?\b|^not ok\b|--- FAIL:|panicked at|AssertionError|\bError:|\bfailed\b|^E\s{2,})/i;
export function failLines(text, max = 12) {
  const out = [];
  for (const raw of String(text ?? '').replace(/\r\n/g, '\n').split('\n')) {
    const l = raw.trim();
    if (!l || l.length > 300 || !FAIL_LINE.test(l) || /^\s*#?\s*(?:fail|failed|failures?)\s*[:=]?\s*0\b/i.test(l)) continue;
    const n = l.replace(/\(?\b\d+(?:\.\d+)?\s?m?s\)?/g, '').replace(/\s+/g, ' ').trim();
    if (!out.includes(n)) out.push(n);
    if (out.length >= max) break;
  }
  return out;
}
export const failSig = (text) => {
  const lines = failLines(text, 40);
  const basis = lines.length ? [...lines].sort().join('\n') : String(text ?? '').replace(/\d+(?:\.\d+)?\s?m?s\b/g, '').slice(-2000);
  return crypto.createHash('sha1').update(basis).digest('hex').slice(0, 16);
};
// What goes back to him: the failure lines first, then the end of the output, kept short.
export function failExcerpt(text, max = 3500) {
  const lines = failLines(text);
  const tail = String(text ?? '').replace(/\r\n/g, '\n').replace(/^Finished with exit code[^\n]*\n(?:Output \(end\):\n)?/, '').split('\n').slice(-40).join('\n');
  return clip(`${lines.length ? `What failed:\n${lines.map((l) => `- ${l}`).join('\n')}\n\n` : ''}End of the output:\n${tail}`, max);
}

export const FIX_NOTE = (who, t, excerpt) => `The tests in ${t.root} fail after your changes (${cmdLine(t)}). Don't say this is done yet. Read the failures below, find the cause, and fix the code. Never skip, delete or weaken a test to make it pass. If a failure clearly has nothing to do with this job, don't change unrelated code: say so in your answer instead. When you've fixed it, answer again and the tests run again by themselves; you don't need to run them.\n\n${excerpt}`;
export const REPORT_NOTE = (who, t, why, excerpt) => `Stop fixing now: ${why}. No more changes. Tell ${who} plainly, in a few lines: which tests still fail (from the output below), what you tried, and your best guess at the cause and what to try next. Don't say the job is done.\n\n${excerpt}`;
export const PASS_LINE = (t, fixes) => `\n\n✅ Tests pass (${cmdLine(t)}${fixes ? `, after ${fixes} round${fixes === 1 ? '' : 's'} of fixes` : ''}).`;
export const FAIL_LINE_SAID = (t, lines) => `\n\n❌ The tests still fail (${cmdLine(t)}, last run)${lines.length ? `: ${lines.slice(0, 6).map((l) => clip(l, 140)).join('; ')}${lines.length > 6 ? '; …' : ''}` : '.'}`;
export const NOT_RUN_LINE = (t, why) => `\n\n🧪 The tests weren't run (${t ? cmdLine(t) : 'no test command'}): ${why}. So I can't say they pass.`;
const OUT_OF_IDEAS = ['you answered without changing any code since the tests last failed, so you are out of ideas', 'no new change to try'];
const CIRCLES = [`the same tests failed the same way ${SAME_FAILS} runs in a row although you changed code each time`, `the same failures ${SAME_FAILS} runs in a row`];

export const fixState = (ctx) => (ctx.fix ||= { runs: 0, fixes: 0, sigs: [], last: null, own: null, done: false, line: '' });

// After any tool: he ran the test command himself after his last edit, so that run can stand for the check.
export function fixAfterTool(brain, name, args, res, ctx) {
  if (!ctx || name !== 'run_command' || !jobHelp(brain.cfg, 'fixLoop') || !ctx.codeEdits?.length) return;
  const t = testCommandFor(real(brain, ctx.codeEdits.at(-1)));
  if (!t) return;
  const a = [].concat(args?.args || []).map(String);
  if (String(args?.cmd || '').toLowerCase() !== t.cmd || a.join(' ') !== t.args.join(' ')) return;
  fixState(ctx).own = { edits: ctx.codeEdits.length, text: String(res?.text ?? '') };
}

// The answer is ready. Returns null (let it through), { line } (add this line under it) or { note } (send him back).
export async function fixLoopStep(brain, ctx, { find = testCommandFor } = {}) {
  if (!ctx || !jobHelp(brain.cfg, 'fixLoop') || !ownJob(ctx.job) || ctx.job?.side || ctx.noTools || ctx.signal?.aborted) return null;
  const edits = ctx.codeEdits?.length || 0;
  if (!edits) return null;
  const f = fixState(ctx);
  const who = brain.cfg.userName || 'the user';
  if (f.done) { if (f.line) { const line = f.line; f.line = ''; return { line }; } return null; }
  const t = find(real(brain, ctx.codeEdits.at(-1)));
  if (!t) return null;
  f.t = t;
  const stop = ([why, plain], text) => {
    f.done = true; f.line = FAIL_LINE_SAID(t, failLines(text));
    brain.log?.('warn', `fix loop stopped with tests failing: ${plain}`);
    ctx.emit?.({ type: 'announce', text: `🧪 Tests still fail and I've stopped fixing (${plain}). I'll say what's still broken.` });
    return { note: REPORT_NOTE(who, t, why, failExcerpt(text)) };
  };
  if (f.last && f.last.edits === edits) return stop(OUT_OF_IDEAS, f.last.text);
  if (brain.usable && !brain.usable('run_command')) { f.done = true; return { line: NOT_RUN_LINE(t, 'the Run Hand is off (Settings, Hands)') }; }
  let text;
  if (f.own?.edits === edits) { text = f.own.text; brain.log?.('jobs', 'fix loop: he ran the tests himself after his last change; using that run'); }
  else {
    brain.log?.('jobs', `fix loop: running ${cmdLine(t)} in ${t.root}`);
    const res = await brain.runTool('run_command', { cmd: t.cmd, args: t.args, cwd: shown(brain, t.root), why: 'checking the tests after my changes' }, ctx);
    text = String(res?.text ?? '');
  }
  f.runs++;
  const out = testOutcome(text);
  if (out.kind === 'pass') { f.done = true; brain.log?.('jobs', `fix loop: tests pass after ${f.fixes} round(s) of fixes`); return { line: PASS_LINE(t, f.fixes) }; }
  if (out.kind === 'notrun') { f.done = true; brain.log?.('jobs', `fix loop: tests not run (${out.why})`); return { line: NOT_RUN_LINE(t, out.why) }; }
  const sig = failSig(text);
  f.sigs.push(sig);
  f.last = { edits, text };
  if (f.sigs.length >= SAME_FAILS && f.sigs.slice(-SAME_FAILS).every((s) => s === sig)) return stop(CIRCLES, text);
  f.fixes++;
  brain.log?.('jobs', `fix loop: tests fail (round ${f.fixes}); the failures go back to him to fix`);
  ctx.emit?.({ type: 'announce', text: `🧪 Tests fail (${cmdLine(t)}). Fixing them (round ${f.fixes}).` });
  return { note: FIX_NOTE(who, t, failExcerpt(text)) };
}
