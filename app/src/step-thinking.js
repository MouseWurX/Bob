// Think to plan and review, not on each step (15 Nov 2026, the owner's rule after the Riker, Bobert and GPT-OSS tool tests).
// Planning thinks, reviewing thinks, the steps in between (each tool call of a job) don't:
//   - Bobert (Qwen3.6): thinking on didn't help a single tool turn, and cost time.
//   - GPT-OSS 120B: Reasoning: high picked the right call 54% of the time against 63% at low (n=264); it stopped to ask
//     instead of doing the step.
// So within one turn of Bob's job loop:
//   step 0, before any tool has run       planning: the turn's own thinking (Medium/High effort, Deep thought, the brain's own)
//   a step after a tool result            doing: no thinking
//   the last round (no tools offered)     reviewing and the answer: the turn's own thinking again
//   Bob's one-more-go that asked to think the turn's retry thinking (loop-help 'think', the long coders)
// The Review brain's check (brain.js checkBrain) already thinks hard ('high') and isn't touched.
// GPT-OSS keeps its reasoning level at the top of its prompt, so each change re-reads the prompt once: this changes it at
// most twice a turn (plan -> steps -> answer), never back and forth.
// Settings, How Bob works, "Think to plan and review, not on each step": on unless turned off (a reliability fix).

export const stepThinkingOn = (cfg) => cfg?.stepThinking !== false;

// think: the turn's setting (undefined = the brain's own, false = off, true or 'high' = on).
export function stepThink(cfg, { think, doing = false, lastRound = false, retryThinks = false } = {}) {
  if (!stepThinkingOn(cfg) || think === false || lastRound || retryThinks) return think;
  return doing ? false : think;
}

// Has a tool run yet this turn? (msgs from the turn's start)
export const toolRanThisTurn = (msgs, turnStart = 0) => (msgs || []).slice(turnStart).some((m) => m?.role === 'tool');
