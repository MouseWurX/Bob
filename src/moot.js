// Effort (1.5.7). The chat bar has Low / High / Extreme.
//   Low (default): today's Bob. One brain, a quick answer, nothing extra loads.
//   High: Bob calls a moot. The draft is made on the big brain (Deep thinking, or the main one), then his reviewer
//         copy (the Review slot brain) checks it once. Code problems go back to the workbench for one fix round.
//   Extreme: the same, plus coding goes in three phases (research, plan, do it) with a check after each, and a
//         second check after fixes. Slowest: on a 16 GB card every check is a brain swap.
// Big brains load only for the job; settle() lets them go when it ends, as with any big job.
// The moot is Bob and his copies meeting in The Idle Process to agree on an answer. All wording is original.
import { copyName } from './clan.js';
import { catMoment } from '../public/patches.js';
import { quarantineOn, QUARANTINE_LINE, flagFromReviewer, maybeAsk } from './quarantine.js';

// 1.5.12: Medium = one big brain thinks it through on the graphics card. No moot, no reviewer.
export const EFFORTS = ['low', 'medium', 'high', 'extreme'];
export const cleanEffort = (v) => (EFFORTS.includes(v) ? v : 'low');
export const careful = (job) => ['high', 'extreme'].includes(cleanEffort(job?.effort)); // a moot (reviewer checks)
export const bigThinker = (job) => cleanEffort(job?.effort) !== 'low'; // drafts on the big brain

// The brain that thinks at Medium, High and Extreme: Deep thinking if one is picked, otherwise the main Brain slot.
// Always on the graphics card. Medium thinks for a while (a budget on llama.cpp, 1.5.19); High and Extreme think hard.
export function draftBrain(cfg, effort = 'high') {
  const model = cfg.sessionBrains?.deep || cfg.models?.bob;
  return model ? { model, cpu: false, think: cleanEffort(effort) === 'medium' ? 'medium' : 'high', ctx: null } : null;
}
// A helper copy at Medium and up: coding on the Coding slot, everything else on the big thinker, always on the card.
// (Effort is the user's explicit choice, so it beats the session, except in the Gaming session, where bigger jobs wait until the session changes.)
export function hatBrain(cfg, hat, effort) {
  if (hat === 'tinker' && cfg.models?.tinker) return { model: cfg.models.tinker, cpu: false, think: undefined, ctx: null };
  return draftBrain(cfg, effort);
}
// The brain that checks: the Review slot, else Deep thinking, else the main brain (it then checks its own work).
export function reviewBrain(cfg) {
  const model = cfg.models?.reviewer || cfg.sessionBrains?.deep || cfg.models?.bob;
  return model ? { model, cpu: false, think: 'high', ctx: null } : null;
}

// One short paragraph, only at High and Extreme (Low adds nothing, so every-day chats stay slim).
export function effortPrompt(effort) {
  const e = cleanEffort(effort);
  if (e === 'low') return '';
  if (e === 'medium') return 'Effort is Medium: {{USER}} wants a thought-through answer. Plan briefly, check facts with your tools when it matters, and answer completely.';
  return `Effort is ${e === 'high' ? 'High' : 'Extreme'}: {{USER}} wants the best answer, not the fastest. Plan first, check facts with your tools, and answer completely. Re-read your answer for mistakes and clarity before handing it over. Your reviewer copy checks the result${e === 'extreme' ? ' (and, for code, the research and the plan first)' : ''}, so never claim something was tested or checked unless a tool result shows it.`;
}

const LOOKS_RIGHT = /^\W*looks right/i;
export const verdict = (text) => (LOOKS_RIGHT.test(String(text || '').trim()) ? 'ok' : /needs fixes/i.test(String(text || '')) ? 'fix' : 'unclear');

export const CHECK_TASK = `Check the answer Bob just gave (under "Already done this turn") before {{USER}} relies on it.
- Does it answer what was asked, completely?
- Is every fact, number, link and quote backed by a tool result above or by solid common knowledge? Flag anything that isn't.
- Code: bugs, edge cases, missing steps, and any claim that it builds or passes without a run result showing it.
- Writing: mistakes, unclear parts, wrong tone.
Read files if you need to (you can't change them).
Start with exactly "Looks right." or "Needs fixes:". If it needs fixes, list them most serious first, one line each with the smallest fix. If the answer isn't code, then add "Corrected answer:" and the whole corrected answer. Don't invent problems; if it's fine, say "Looks right." and why in one line.`;

export function fixTask(review) {
  return `Your reviewer copy checked your changes and found problems:\n${review}\n\nFix the real ones the same careful way (read first, small steps, check each). Then report honestly: what's fixed, what isn't, and what you ran. If you disagree with a point, say why in one line.`;
}

// Extreme (1.5.12): the workbench works in three phases with a check between each: research, plan, then do it.
// The last check is the moot's own, after the job. (Before 1.5.12 the reviewer checked every single edit: slow, little gain.)
export function gateTask(phase, work) {
  return `Gate check (${phase}): Bob's workbench copy just finished the ${phase} phase of a coding job. Check only that: ${phase === 'research' ? 'did it read the right files and find what matters? Anything missed or misread?' : 'is the plan correct, complete, safe and the smallest change that works? Is the way it will be checked good enough?'} Under 150 words.
The ${phase}:
${String(work || '(nothing written)').slice(-5000)}
Start with exactly "Looks right." or "Needs fixes:".`;
}

export function phaseTask(phase, task, { research = '', plan = '', notes = '' } = {}) {
  if (phase === 'research') return `${task}\n\nPhase 1 of 3, research: read and search only. Don't edit or run anything yet. End with a short summary: what you found and which files matter.`;
  if (phase === 'plan') return `${task}\n\nPhase 2 of 3, plan. What you found:\n${String(research).slice(-4000)}\n\nReviewer's notes on the research:\n${notes}\n\nWrite only the numbered plan: what, where, why, and how you'll check it. Don't edit yet.`;
  return `${task}\n\nPhase 3 of 3, do it. The plan:\n${String(plan).slice(-4000)}\n\nReviewer's notes on the plan:\n${notes}\n\nCarry out the plan in small steps, check each, then report honestly.`;
}

export async function phasedWork(brain, hat, task, ctx) {
  ctx.phased = true;
  const rev = copyName(brain.cfg, 'reviewer', 'second look');
  const force = reviewBrain(brain.cfg);
  const say = (text) => ctx.emit({ type: 'token', text });
  const gate = async (phase, work) => {
    say(`\n\n---\n**${rev}, checking the ${phase}:**\n\n`);
    const text = await brain.runHat('reviewer', gateTask(phase, work), { ...ctx, hatNotes: '' }, force);
    (ctx.mootRounds ||= []).push({ kind: 'gate', phase, verdict: verdict(text) === 'ok' ? 'ok' : 'fix' });
    return text;
  };
  say('**Research:**\n\n');
  const research = await brain.runHat(hat, phaseTask('research', task), ctx);
  const n1 = await gate('research', research);
  say('\n\n---\n**Plan:**\n\n');
  const plan = await brain.runHat(hat, phaseTask('plan', task, { research, notes: n1 }), ctx);
  const n2 = await gate('plan', plan);
  say('\n\n---\n**Doing it:**\n\n');
  return brain.runHat(hat, phaseTask('do', task, { plan, notes: n2 }), ctx);
}

const plain = (hat) => ({ tinker: 'workbench', scout: 'scouting', ledger: 'ledger', painter: 'painter', reviewer: 'reviewer' }[hat] || hat);

// The opening line of a moot, shown as a note in the chat.
export function mootOpening(cfg, effort, turnNo = 0) {
  const rev = copyName(cfg, 'reviewer', 'second look');
  const e = cleanEffort(effort);
  const draft = draftBrain(cfg)?.model || 'the main brain';
  const check = reviewBrain(cfg)?.model || 'the main brain';
  const cat = turnNo % 3 === 0 ? ` ${catMoment(cfg.catName, turnNo)}.` : '';
  return `🛰 Bob calls a moot in The Idle Process. He drafts on the big brain (${draft}), then ${rev} checks it (${check})${e === 'extreme' ? ', and for code also checks the research and the plan before anything changes' : ''}. Slower, more careful.${cat}`;
}

// What happened at the moot, in a few words, kept with the reply. "Not done" is said plainly when it isn't.
export function mootMinutes(rounds, rev) {
  if (!rounds.length) return '';
  const words = rounds.map((r) => r.kind === 'check' ? `${rev} checked: ${r.verdict === 'ok' ? 'looks right' : r.verdict === 'fix' ? 'needs fixes' : 'no clear verdict'}`
    : r.kind === 'fix' ? `${r.copy} fixed what was found`
    : r.kind === 'gate' ? `${rev} checked the ${r.phase}: ${r.verdict === 'ok' ? 'fine' : 'needs fixes'}` : '');
  const last = [...rounds].reverse().find((r) => r.kind === 'check');
  const fixedAfter = rounds.at(-1)?.kind === 'fix';
  const end = !last ? '' : fixedAfter ? `Result: fixes made; ${rev} hasn't checked them again (Extreme effort does).` : last.verdict === 'ok' ? 'Result: checked, nothing open.'
    : last.corrected ? `Result: use ${rev}'s corrected answer above.`
    : `Result: not finished. ${rev}'s points above are still open.`;
  return `🛰 **Moot over:** ${words.filter(Boolean).join(' · ')}. ${end}`.trim(); // 1.5.49: was "Moot minutes"
}

// After the draft (runOn) at High or Extreme: the reviewer checks, code gets a fix round, Extreme checks again.
export async function runMoot(brain, { msgs, base, emit, signal, job, ctx, quick = null }) {
  const effort = cleanEffort(job?.effort);
  const added = msgs.slice(base);
  const draft = [...added].reverse().find((m) => m.role === 'assistant' && !m.tool_calls && m.content);
  const used = added.flatMap((m) => (m.tool_calls || []).map((c) => c.function?.name));
  const toolText = added.filter((m) => m.role === 'tool').map((m) => String(m.content)).join('\n');
  if (!draft || ['picture', 'video'].includes(job?.kind) || used.some((n) => /^(make_image|make_video|make_music|make_sound|workshop_run)$/.test(n))) return null;
  if (String(draft.content).length < 200 && !used.length) {
    if (quick) return null; // #30: a quick look skips short chit-chat without a word
    emit({ type: 'announce', text: 'Short reply, so the moot skipped the second look.' });
    return null;
  }
  const rev = copyName(brain.cfg, 'reviewer', 'second look');
  const force = reviewBrain(brain.cfg);
  // #30: Low and Medium effort: one quick check by a paired Bob over Bob-Net, only when one is free. No fix rounds.
  let lender = null;
  if (quick) {
    lender = await quick();
    if (!lender) return null;
    emit({ type: 'announce', text: `🛰 ${lender.name} gives this a quick second look over Bob-Net (${lender.brain}).` });
  }
  // Code was changed this turn: a workbench note "edit_file <path>: <result>" that isn't an error, or Bob's own edit.
  const changedCode = /\b(?:edit_file|write_file)\b[^|\]]*?:\s*(?!Error|.*said no)/.test(toolText)
    || added.some((m, i) => m.role === 'tool' && ['edit_file', 'write_file'].includes(m.tool_name) && !/^Error|said no/i.test(String(m.content)) && i >= 0);
  const rounds = [...(ctx.mootRounds || [])];
  const say = (text) => { emit({ type: 'token', text }); };
  let held = false; // the user quarantined Bob after the reviewer flagged him: no fix rounds
  const check = async (n) => {
    say(`\n\n---\n**${rev}, second look${n > 1 ? ' (again)' : ''}:**\n\n`);
    // Quarantine on (opt-in): the reviewer may also say Bob went off track. Off: the check is exactly as before.
    ctx.reviewLender = lender;
    let text;
    try { text = await brain.runHat('reviewer', quarantineOn(brain.cfg) ? `${CHECK_TASK}\n${QUARANTINE_LINE}` : CHECK_TASK, ctx, force); }
    finally { ctx.reviewLender = null; }
    msgs.push({ role: 'assistant', content: `${rev}, second look: ${text}`, moot: 'check' });
    if (quarantineOn(brain.cfg) && flagFromReviewer(brain, ctx, text, 'bob')) held = (await maybeAsk(brain, ctx)) === 'quarantined';
    const v = verdict(text);
    rounds.push({ kind: 'check', verdict: v, corrected: /corrected answer:/i.test(text) });
    return { text, v };
  };
  let res = await check(1);
  const maxFix = lender && quick ? 0 : effort === 'extreme' ? 2 : 1;
  for (let i = 0; i < maxFix && res.v !== 'ok' && changedCode && !held && !signal?.aborted; i++) {
    const copy = copyName(brain.cfg, 'tinker', 'workbench');
    say(`\n\n---\n**${copy}, fixing:**\n\n`);
    const fixed = await brain.runHat('tinker', fixTask(res.text), ctx);
    msgs.push({ role: 'assistant', content: fixed, moot: 'fix' });
    rounds.push({ kind: 'fix', copy });
    // High trusts one fix round (the report says what was fixed); Extreme checks the fix again.
    if (effort === 'extreme') res = await check(i + 2);
    else break;
  }
  const minutes = mootMinutes(rounds, rev);
  if (minutes) { say(`\n\n${minutes}`); msgs.push({ role: 'assistant', content: minutes, moot: 'minutes' }); }
  brain.log('moot', `${effort}${quick ? ' (quick look over Bob-Net)' : ''}: ${rounds.map((r) => r.kind + (r.verdict ? `:${r.verdict}` : '')).join(', ')}`);
  return { rounds, minutes };
}

export { plain as hatWord };
