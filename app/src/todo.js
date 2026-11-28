// "Keep a to-do list and check it" (Nov 27, the owner: "Do it"). Off unless turned on (cfg.keepTodo === true): it
// merges off and is turned on by default only once a test shows fewer bad tool calls (a tool feature, never Turbo). From the Nov 13 study of how open
// agents (Codex, OpenHands, Cline, Goose...) keep long jobs on track:
//   1. update_plan: the brain keeps its own to-do list for a job of several steps, and the app shows it again before
//      every step (one short system line), so a long job can't lose its place.
//   2. Checked finish: a step can only be ticked done when a tool step really worked since the list last changed
//      (checked in code against the turn's record), and when Bob answers with steps still open he gets one more go.
//   3. Proof before result: tools that hand their work to the chat window (make_diagram) say it is on its way, not
//      that it is done, so the answer never says "drew it" before the window has.
// Nothing is added to the start of a job: the tool's own short description is the only new text the brain reads
// until it calls it. Same on Windows, Mac, Linux and jobs sent from the Android app (it all runs in the server).
import { stepsDone } from './job-steps.js';

export const todoOn = (cfg) => cfg?.keepTodo === true;

const STATES = ['pending', 'doing', 'done', 'skipped'];
const MAX_STEPS = 12;
const SAY = { pending: ' ', doing: '>', done: 'x', skipped: '-' };

// The words a brain may use for a state, read kindly ("in_progress", "complete", "todo"...).
export function cleanState(s) {
  const t = String(s || '').toLowerCase().replace(/[\s-]+/g, '_');
  if (/^(done|complete|completed|finished|ok|x)$/.test(t)) return 'done';
  if (/^(doing|in_progress|active|started|current|working)$/.test(t)) return 'doing';
  if (/^(skipped|skip|cancelled|canceled|dropped|not_needed|cant|can_t)$/.test(t)) return 'skipped';
  return 'pending';
}

// The list as the brain sent it, tidied: plain strings or {step, status, why}.
export function cleanSteps(steps) {
  const list = Array.isArray(steps) ? steps : typeof steps === 'string' ? steps.split(/\n+/) : [];
  return list.map((s) => (typeof s === 'string' ? { step: s } : s && typeof s === 'object' ? s : null))
    .filter((s) => s && String(s.step ?? s.say ?? s.text ?? '').trim())
    .slice(0, MAX_STEPS)
    .map((s) => ({ step: String(s.step ?? s.say ?? s.text).replace(/\s+/g, ' ').trim().slice(0, 120), status: cleanState(s.status ?? s.state), ...(s.why ? { why: String(s.why).slice(0, 160) } : {}) }));
}

const same = (a, b) => a.toLowerCase().replace(/[^a-z0-9]+/g, '') === b.toLowerCase().replace(/[^a-z0-9]+/g, '');

// The list as one line per step, the way the brain reads it back.
export const listText = (todo) => (todo?.steps || []).map((s, i) => `[${SAY[s.status]}] ${i + 1}. ${s.step}${s.status === 'skipped' && s.why ? ` (skipped: ${s.why})` : ''}`).join('\n');
const open = (todo) => (todo?.steps || []).filter((s) => s.status === 'pending' || s.status === 'doing');

// Update the turn's list from one update_plan call. Returns the text the brain gets back.
// The check (2): a step newly ticked done needs a tool step that worked since the list last changed.
export function updatePlan(ctx, { steps, explanation } = {}) {
  const next = cleanSteps(steps);
  if (!next.length) return 'Error: no steps. Send every step of the job in order, each with a status: pending, doing, done or skipped.';
  const before = ctx.todo?.steps || [];
  const ran = stepsDone(ctx.ledger?.actions || []);
  const sinceLast = ctx.todo ? ran - ctx.todo.ranAt : ran;
  const notes = [];
  const newlyDone = next.filter((s) => s.status === 'done' && !before.some((b) => same(b.step, s.step) && b.status === 'done'));
  if (newlyDone.length && sinceLast <= 0) {
    for (const s of newlyDone) s.status = before.find((b) => same(b.step, s.step))?.status === 'doing' ? 'doing' : 'pending';
    notes.push(`Not ticked: ${newlyDone.map((s) => `"${s.step}"`).join(', ')}. No tool step has worked since your last list (or this turn), so the app can't see it done. Do it with its tool first, then tick it.`);
  } else if (newlyDone.length > 1 && sinceLast < newlyDone.length) {
    notes.push(`${newlyDone.length} steps ticked after ${sinceLast} tool step${sinceLast === 1 ? '' : 's'}. Only tick a step a tool really did.`);
  }
  for (const s of next) if (s.status === 'skipped' && !s.why) { s.status = 'pending'; notes.push(`"${s.step}" can't be skipped without a why. Do it, or send it again as skipped with why.`); }
  // Only one step at a time is "doing": the first one.
  let doing = false;
  for (const s of next) { if (s.status === 'doing') { if (doing) s.status = 'pending'; doing = true; } }
  ctx.todo = { steps: next, ranAt: ran, ...(explanation ? { why: String(explanation).slice(0, 200) } : {}) };
  try { ctx.emit?.({ type: 'todo', steps: next }); } catch {}
  const left = open(ctx.todo);
  const tail = left.length ? `Next: ${left[0].step}.` : 'All steps are done or skipped. Check the result, then answer.';
  return [`To-do list (${next.length - left.length} of ${next.length} done):`, listText(ctx.todo), ...notes, tail].join('\n');
}

// (1) The line shown again before each step while a list is open.
export function todoLine(todo) {
  if (!todo?.steps?.length) return '';
  const left = open(todo);
  if (!left.length) return '';
  return `Your to-do list for this job (update it with update_plan as each step finishes):\n${listText(todo)}`;
}

// (2) At the end: steps still open when Bob answers get one more go, or a plain why.
export function todoNudge(todo, who = 'the user') {
  const left = open(todo);
  if (!left.length) return '';
  return `Your to-do list still has ${left.length} open step${left.length === 1 ? '' : 's'}: ${left.map((s) => `"${s.step}"`).join(', ')}. Do ${left.length === 1 ? 'it' : 'them'} now with the right tools and tick ${left.length === 1 ? 'it' : 'them'} with update_plan, or mark ${left.length === 1 ? 'it' : 'them'} skipped with why and tell ${who} plainly. Then give your whole answer again: it replaces your last one.`;
}

// The update_plan tool.
export function todoTool(brain) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'update_plan',
        description: 'Use when a job needs 3 or more tool steps: list them first, then send the whole list again as each one finishes. Not for chat or one quick thing.',
        parameters: {
          type: 'object',
          properties: {
            steps: {
              type: 'array',
              description: 'Every step of the job, in order.',
              items: {
                type: 'object',
                properties: {
                  step: { type: 'string', description: 'The step in a few plain words.' },
                  status: { type: 'string', enum: STATES },
                  why: { type: 'string', description: 'Only for skipped: why.' }
                },
                required: ['step', 'status']
              }
            },
            explanation: { type: 'string', description: 'Only if the plan changed: why, in one line.' }
          },
          required: ['steps']
        }
      }
    },
    async run(args, ctx) {
      if (!todoOn(brain.cfg)) return 'The to-do list is off, so just do the job.';
      return updatePlan(ctx, args || {});
    },
    summary: ({ steps }) => `to-do list (${Array.isArray(steps) ? steps.length : 0} steps)`
  };
}
