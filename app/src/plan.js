// Plan card (1.5.78): with "Show Bob's plan before big jobs" on (Settings, How Bob works; off unless turned on),
// Bob shows the whole job on one card before a big one starts: every step in plain words, in order, with the OKs
// those steps need ticked on the same card (together.js), so there is still only one card for the whole job.
// The person can press Go ahead, ask for a change in their own words, or say Not now. Nothing starts before that.
//
// Two ways the card comes up:
//   1. Bob calls show_plan before he starts (his instructions say when).
//   2. The safety net: he starts a big job without one. The calls wait and he is asked for his plan first; if he still
//      doesn't show one, the system puts the calls he is making on a plan card itself.
// "Big" here: a clip, a song or a cloud helper, or a third step this turn that changes something (a tool that asks
// for an OK). Questions, chat and one small thing never get a plan card.
import { gather, keepAnswers, describe, parse, stepKey } from './together.js';
import { clip } from './util.js';

export const planOn = (cfg) => cfg?.planFirst === true;
export const BIG_TOOLS = new Set(['make_video', 'make_music', 'ask_cloud']);
const MAX_STEPS = 20;
const who = (brain) => brain.cfg.userName || 'the user';

// The line in Bob's instructions. Nothing at all while the setting is off (keeps his instructions light).
export function planPrompt(cfg) {
  if (!planOn(cfg)) return '';
  return `\n\n"Show Bob's plan before big jobs" is on. Before a big job, call show_plan first, before any other tool. Big means: three or more steps, anything that changes files, runs commands or uses apps more than once, or anything that takes more than a few minutes (a video clip, a song, a cloud helper, a long coding job). List every step in plain words, in order. For a step that needs an OK, add the exact tool and args you will use, so its OK goes on the same card. Then wait for the answer and do what it says. Don't use it for questions, chat or one quick thing.`;
}

// Shows the card and waits. steps: [{ say, tool?, args? }]. Returns the text Bob is told.
export async function showPlan(brain, { goal = '', time = '', steps = [] }, ctx, { fromSystem = false } = {}) {
  const lines = [], items = [];
  const asking = brain.together?.(ctx) !== false; // "Let Bob work without asking" on: no OKs, just the plan
  for (const [i, s] of steps.slice(0, MAX_STEPS).entries()) {
    const n = i + 1;
    const name = String(s.tool || '');
    const args = parse(s.args);
    const tool = name && name !== 'show_plan' && name !== 'ask_together' ? brain.tools[name] : null;
    let item = null;
    if (tool && asking) [item] = await gather(brain, [{ tool: name, args, say: s.say }], ctx);
    if (item) items.push({ ...item, n });
    const text = clip(s.say, 200) || (tool ? describe(name, args, tool, '') : '');
    if (text) lines.push({ n, text, ok: Boolean(item) });
  }
  if (!lines.length) return 'Error: no steps given. List each step as { say } in plain words, adding tool and args for steps that need an OK.';
  goal = clip(goal, 200);
  time = clip(time, 60);
  const text = goal ? `Bob's plan: ${goal}` : "Bob's plan for this job";
  brain.log('plan', `showing ${lines.length} steps${fromSystem ? ' (put together by the system: Bob started without one)' : ''}${steps.some((x) => x?.tool) ? `, tools: ${[...new Set(steps.slice(0, MAX_STEPS).map((x) => String(x?.tool || '')).filter(Boolean))].join(', ').slice(0, 300)}` : ''}`); // item 248: no chat words in the logbook
  const answer = await brain.approve({ text, planCard: { goal, time, steps: lines, fromSystem }, ...(items.length ? { together: items } : {}) }, ctx.emit, ctx.signal, null, { hand: true });
  const note = clip(answer?.note, 500);
  if (note) {
    brain.log('plan', `${who(brain)} asked for a change (${note.length} characters)`); // item 248
    ctx.planNudged = true;
    return `${who(brain)} wants a change before you start: "${note}". Nothing has been done. Make a new plan with that change and call show_plan again (or ask one short question if the change isn't clear).`;
  }
  if (!answer?.allow) {
    brain.log('plan', 'not now');
    ctx.planDeclined = true;
    return `${who(brain)} said not now. Nothing has been done. Don't start this job or try another way; say that's fine and ask what they'd like instead.`;
  }
  ctx.planShown = true;
  let skipped = '';
  if (items.length) {
    const { okNs } = keepAnswers(brain, items, answer, ctx);
    const no = items.filter((i) => !okNs.has(i.n));
    if (no.length) skipped = ` They unticked step${no.length === 1 ? '' : 's'} ${no.map((i) => i.n).join(', ')}: skip ${no.length === 1 ? 'it' : 'them'}, and anything that needs ${no.length === 1 ? 'it' : 'them'}, and don't try another way.`;
  }
  brain.log('plan', `go ahead${skipped ? ' (some steps unticked)' : ''}`);
  if (fromSystem) return null;
  return `${who(brain)} said go ahead.${skipped} Do the steps in order, one tool call each, with the same arguments you listed. If you need a step that wasn't on the plan, say so in one line first; it asks on its own card.`;
}

// The show_plan tool.
export function showPlanTool(brain) {
  return {
    schema: {
      type: 'function',
      function: {
        name: 'show_plan',
        description: 'Before a big job, show {{USER}} your plan on one card and wait. Give every step in plain words; for a step that needs an OK, add the exact tool and args, so its OK is on the card too.',
        parameters: {
          type: 'object',
          properties: {
            goal: { type: 'string', description: 'One short line: what the whole job is for.' },
            time: { type: 'string', description: 'Roughly how long it will take, like "about 5 minutes". Leave out if you don\'t know.' },
            steps: {
              type: 'array',
              description: 'Every step, in order.',
              items: {
                type: 'object',
                properties: {
                  say: { type: 'string', description: 'The step in a few plain words.' },
                  tool: { type: 'string', description: 'Only for a step that needs an OK: the tool you will call.' },
                  args: { type: 'object', description: 'Only with tool: the exact arguments you will call it with.' }
                },
                required: ['say']
              }
            }
          },
          required: ['steps']
        }
      }
    },
    async run({ goal, time, steps }, ctx) {
      if (!planOn(brain.cfg)) return 'Plans are off, so just do the job.';
      const list = (Array.isArray(steps) ? steps : []).map((s) => (typeof s === 'string' ? { say: s } : s)).filter((s) => s && (s.say || s.tool));
      return showPlan(brain, { goal, time, steps: list }, ctx);
    },
    summary: ({ steps }) => `showed his plan (${Array.isArray(steps) ? steps.length : 0} steps)`
  };
}

const HOLD = (u) => `(Not done yet: "Show Bob's plan before big jobs" is on and this is a big job. Call show_plan first with every step of the job, in order, then do them once ${u} says go ahead.)`;

// The safety net, before the tool calls in one of Bob's replies run. Returns null (go on and run them) or
// { hold: text } (don't run them; each call gets this text back).
export async function planGate(brain, calls, ctx) {
  if (!planOn(brain.cfg) || ctx.planShown || !Array.isArray(calls) || !calls.length) return null;
  // 1.5.133 lost-song fix: a job from another Bob is one job the owner already asked for over there, and the plan nudge
  // here made the brain talk about the song instead of making it (the owner's PC, Nov 8: nudged, then no make_music at all).
  if (ctx.job?.guest) return null;
  const names = calls.map((c) => String(c.function?.name || ''));
  if (names.includes('show_plan')) return null;
  const changing = names.filter((n) => brain.tools[n]?.check && brain.usable(n)).length;
  const big = names.some((n) => BIG_TOOLS.has(n) && brain.usable(n)) || (ctx.planSteps || 0) + changing >= 3;
  if (!big) { ctx.planSteps = (ctx.planSteps || 0) + changing; return null; }
  if (ctx.planDeclined) return { hold: `(Not done: ${who(brain)} said not now to this job's plan. Don't do it; ask what they'd like instead.)` };
  if (!ctx.planNudged) {
    ctx.planNudged = true;
    brain.log('plan', `Bob started a big job without a plan (${names.join(', ')}); asked him for one first`);
    return { hold: HOLD(who(brain)) };
  }
  // Asked once already and still no plan: put these calls on a plan card ourselves.
  const steps = calls.map((c) => ({ tool: c.function?.name, args: parse(c.function?.arguments) }))
    .filter((s) => brain.tools[s.tool] && s.tool !== 'ask_together')
    .map((s) => ({ ...s, say: describe(s.tool, s.args, brain.tools[s.tool], '') }));
  const said = await showPlan(brain, { steps }, ctx, { fromSystem: true });
  return said ? { hold: `(Not done: ${said})` } : null;
}

export { stepKey };
