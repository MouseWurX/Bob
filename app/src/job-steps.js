// Plan first, then check the steps (Nov 13, owner: "strengthening our tool calls by planning and execution"). The
// GPT-OSS v5 rejects were 56% planning: a needed tool skipped, steps not planned, a job stopped early. So when one ask
// holds two or more things to do ("read notes.txt and put the to-dos on my board"), the app reads them from the words
// (no model), the brain gets ONE short line naming them, and at the end the app checks that each got a tool. Nothing
// fires for a question, chat or one thing, so the start of a job stays the same size. Part of "Better tool calling"
// (loop help 'plan'); the closing check runs in verify.js afterTurn.

// Verbs that mean a tool has to do something (not "tell me", "explain" or "summarise", which the answer does).
const DO = /^(?:please\s+|pls\s+|also\s+|then\s+|and\s+|can you\s+|could you\s+)*(add|put|remind|remember|save|write|make|draw|paint|create|search|look up|find|read|open|send|convert|email|set|fix|run|list|delete|move|rename|copy|zip|download|fetch|check|schedule|edit|update|change|note|jot|book|cancel|remove)\b/i;
const SPLIT = /\s*(?:,?\s+and then\s+|,?\s+then\s+|;\s*|\.\s+(?=[A-Z])|,\s+and\s+|\s+and\s+(?=(?:also\s+)?(?:add|put|remind|remember|save|write|make|draw|paint|create|search|look up|find|read|open|send|convert|email|set|fix|run|list|delete|move|rename|copy|zip|download|fetch|check|schedule|edit|update|change|note|jot|cancel|remove)\b)|,\s+(?=(?:add|put|remind|remember|save|write|make|draw|create|search|find|read|open|send|convert|set|fix|run|schedule)\b))/i;
const QUESTION = /^(?:how|why|what|when|where|which|who|is|are|does|do you|can you tell|could you tell|should)\b[^.!]*\?\s*$/i;
const MAX = 6;

// The things to do in one ask, in order, each in its own words. [] when it's one thing, a question or chat.
export function askedSteps(text) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  if (!t || t.length > 1200 || QUESTION.test(t)) return [];
  const parts = t.split(SPLIT).map((s) => s.replace(/^[\s,.]+|[\s,.!?]+$/g, '')).filter(Boolean);
  const steps = parts.filter((p) => DO.test(p)).map((p) => p.slice(0, 80));
  return steps.length >= 2 ? steps.slice(0, MAX) : [];
}

// The one line the brain reads at the start, only when there are two or more steps.
export const planLine = (steps) => `This asks for ${steps.length} things: ${steps.map((s, i) => `${i + 1}) ${s}`).join('; ')}. Do each with its tool, in that order; answer only once all are done or you know why one can't be.`;

// Tool calls that count as doing a step (looking something up counts; adding a tool group or asking doesn't).
const NOT_A_STEP = new Set(['use_tools', 'ask_user', 'ask_together', 'show_plan', 'bob_help', 'pick_session', 'offer_setup']);
export function stepsDone(actions = []) {
  return actions.filter((a) => a && a.ok !== false && !a.declined && !NOT_A_STEP.has(a.name)).length;
}

// The closing check: the nudge when fewer tool steps ran than things were asked, or ''.
export function stepsNudge(steps, actions, who = 'the user') {
  if (!Array.isArray(steps) || steps.length < 2) return '';
  const done = stepsDone(actions);
  if (done >= steps.length) return '';
  return `${who} asked for ${steps.length} things (${steps.map((s, i) => `${i + 1}) ${s}`).join('; ')}), but only ${done} tool step${done === 1 ? '' : 's'} ran. Do the rest now with the right tools, or say plainly which one wasn't done and why.`;
}
