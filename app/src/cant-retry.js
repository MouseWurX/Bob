// "I can't" and one more go with every tool (brain-run-on.js, the router test fix), without stacking two answers.
// Jobs run 3 (16 Nov 2026), the most common runner error (v5-d24-1-r1, ql-4, t65-0287, v5-d6-3-r0, v5-d12-0-r1):
// Bob's first answer was good and honest, the nudge fired anyway, and the retry's answer was added under it. Twice the
// second one also leaked the loop ("this last step forbids another tool call").
// Now:
//   - no nudge when the "can't" has a real reason: a tool this turn was refused (off limits, read-only, said no), or
//     the reply names a Hand that is switched off. More tools change nothing then.
//   - after the nudge, one answer stays. If the retry ran a tool, its answer replaces the first. If it ran nothing,
//     there was nothing new, so the first answer stays and the retry's words are dropped.
//   - 20 Nov (after1 real jobs: 4 of Qwen's 20 failed, fx-b2d940db44, fx-ee37a53bd4, fx-35c1c1c3cb, fx-67cb3ac73f): the
//     first answer was only a tool call written as text, the text-call check gave one more go, and the retry wrote the
//     real answer from what was already read, with no new tool (the last step allows none). "Nothing new ran" then
//     put the bare call back and threw the real answer away. A first answer that is only call text (or empty) is
//     never kept over a retry that answered in words.
import { HANDS, handOn } from './hands-settings.js';
import { bareTextCall } from './clean-answer.js';

const REFUSED = /off limits|not allowed|outside (?:any|the|a) (?:project|allowed)|read-only|said no|access is denied|EACCES|EPERM|refus/i;

// Why the nudge would change nothing ('' when it may help). turnMsgs: this turn's messages so far.
export function cantReason(cfg, text, turnMsgs = []) {
  if (turnMsgs.some((m) => m?.role === 'tool' && REFUSED.test(String(m.content || '').slice(0, 400)))) return 'a tool was refused this turn';
  const t = String(text || '');
  for (const [id, h] of Object.entries(HANDS)) {
    if (handOn(cfg, id)) continue;
    // Nov 16 (800-job run, fx-5fd65adeaa): he says it short too ("the Office Hand is off"): the label, its first word, or its id.
    const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const first = h.label.split(/\s+/)[0]; // not "Use", "Open" or "Make": too common to name a Hand
    const label = [...new Set([h.label, ...(/^(?:use|open|make|tool|connected)$/i.test(first) ? [] : [first]), id])].map(esc).join('|');
    if (new RegExp(`\\b(?:${label})\\b[^.\\n]{0,40}\\bHand\\b|\\bHand\\b[^.\\n]{0,20}\\b(?:${label})\\b`, 'i').test(t)) return `the ${h.label} Hand is off`;
  }
  return '';
}

// Before the nudge: remember the first answer and how many tool results there were.
export const markCant = (ctx, reply, msgs) => { ctx.cantAt = { reply, tools: msgs.filter((m) => m?.role === 'tool').length }; };

// A later answer in words (reply, already the last message): keep one. Returns 'replaced', 'kept' or ''.
export function settleCant(ctx, reply, msgs) {
  const at = ctx.cantAt;
  if (!at || reply === at.reply) return '';
  ctx.cantAt = null;
  const i = msgs.indexOf(at.reply);
  if (i < 0) return '';
  const ranTools = msgs.filter((m) => m?.role === 'tool').length > at.tools;
  msgs.splice(i, 1);
  if (ranTools) return 'replaced';
  const first = String(at.reply.content || '');
  if ((!first.trim() || bareTextCall(first)) && String(reply.content || '').trim() && !bareTextCall(reply.content)) return 'replaced';
  reply.content = at.reply.content; // nothing new was done: the first answer is the answer
  return 'kept';
}
