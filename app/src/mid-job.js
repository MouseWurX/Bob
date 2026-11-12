// Answer messages mid-job (Settings, Brains; on unless switched off: reliability). Asked for 2026-11-12.
//
// Before this, a message sent while Bob worked on a long job waited until the whole job was done, or went to a
// second, smaller brain beside it (more memory, and a brain that knew nothing about the job). Now the brain that is
// already loaded answers it, between two steps of the job, in code, so it can't be skipped:
//   1. Step boundary. When a step ends (a tool is done), the app looks for messages that came in, before the next
//      step. Nothing is added to the job's prompt for this; the check is code.
//   2. Sorted, cheaply. Plain rules catch the clear ones ("stop", "also...", "use the other file", a question,
//      "write me a poem"). Anything unclear goes to the quick reply, where the brain itself may answer [TASK] or
//      [CHANGE] instead of an answer (no extra call).
//        answer  a quick reply, from its own small context: the message, one line about the job, and the last few
//                turns of that chat. Not the job's steps, and no tools.
//        task    new work: it waits in Tasks and runs after this job, as it always did. A one-liner says so.
//        change  "also do X", "use the other file": folded into the job as a note it reads at this same step.
//                "stop" is Stop after this step: the step that ran finishes, then he wraps up with what he has.
//   3. Resume. The job's own messages are never touched, so he carries on at the exact step he was on. With "Each chat
//      keeps its place" on, the engine keeps the job's place in its memory too (the quick reply has its own place).
//   4. Clock. The time spent on quick replies doesn't count against the job's time limit or the safety net.
// A message that waits more than ACK_AFTER_MS (a long step) gets a one-liner at once, so it never looks ignored.
// Media steps (pictures, songs, clips) still use the small brain beside the job: the big brain is let go then.
// Works on every engine (Bob's own and Ollama), on Windows, Mac, Linux and Android: it only uses the loaded brain.

export const midJobOn = (cfg) => cfg?.answerMidJob !== false;

export const ACK_AFTER_MS = 8000;
export const QUICK_TURNS = 4; // earlier messages of that chat the quick reply sees
export const QUICK_KEEP = 600; // characters of each

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const mins = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'under a minute' : m === 1 ? '1 minute' : `${m} minutes`; };

export const ACK_LINE = "📥 Got it. I'll answer as soon as the step I'm on is done.";
export const QUEUED_LINE = (title) => `📋 That's a new job, so it's in Tasks. I'll start it when "${clip(title, 60)}" is done.`;
export const WAITS_LINE = "I couldn't answer that between steps, so it waits until the job is done.";

// ---------- Sorting a message ----------
const TASK_VERB = '(?:make|write|build|create|draw|paint|generate|compose|design|find|search|research|look up|look into|fix|code|program|plan|download|install|set up|summari[sz]e|translate|edit|rewrite|convert|send|book|schedule|organi[sz]e|sort|rename|clean up|scan|test|check)';
const STOP = /^(?:ok(?:ay)?,?\s+|please\s+|bob,?\s+)*(?:stop|cancel(?: (?:that|it|the job))?|halt|abort|never ?mind|that'?s enough|enough|wrap (?:it )?up|stop after this(?: step)?|you can stop)(?:\s+(?:now|please|for now|there))?[.!\s]*$/i;
const CHANGE = new RegExp(`^(?:oh,?\\s+|wait,?\\s+|actually,?\\s+|and\\s+|bob,?\\s+|please\\s+)*(?:also|plus|instead|don'?t|do not|make sure|remember to|skip|only|use|change|switch to|add|leave out|keep it|make it|no,? (?:use|make|do)|tell (?:the job|it) to)\\b`, 'i');
const ANSWERY = /^(?:hi|hey|hello|thanks|thank you|ty|cheers|ok|okay|cool|nice|great|good|lol|yes|no|sure|morning|good (?:morning|night|evening))\b[\s!.,]*\S{0,20}[\s!.]*$/i;
const ASK_TASK = new RegExp(`^(?:can|could|would|will) you (?:please )?(?:also )?${TASK_VERB}\\b`, 'i');
const DO_TASK = new RegExp(`^(?:please\\s+|bob,?\\s+|now\\s+|next,?\\s+)*${TASK_VERB}\\b`, 'i');
const ABOUT_JOB = /\b(?:how(?:'s| is| are)? (?:it|the job|that|things)(?: \w+)? going|progress|status|still (?:working|going|busy)|done yet|finished yet|what(?:'s| is| are) you (?:doing|on|up to))\b/i;

// sameChat: the message was typed in the running job's own chat (only then can it change the job).
// Returns 'stop', 'change', 'answer', 'task', or '' (unclear: the quick reply decides).
export function sortMessage(text, { sameChat = false } = {}) {
  const t = String(text || '').trim();
  if (!t) return 'answer';
  if (sameChat && STOP.test(t)) return 'stop';
  if (sameChat && CHANGE.test(t)) return 'change';
  if (ABOUT_JOB.test(t) || ANSWERY.test(t)) return 'answer';
  if (ASK_TASK.test(t) || DO_TASK.test(t)) return 'task';
  if (/\?\s*$/.test(t)) return 'answer';
  return '';
}

// The brain's own call on an unclear message: its reply starts with [TASK] or [CHANGE] instead of an answer.
export function replyTag(text) {
  const m = String(text || '').trim().match(/^\[?\s*(TASK|CHANGE)\s*\]?/i);
  return m ? m[1].toLowerCase() : '';
}
// While streaming: could what's arrived so far still turn out to be a tag? Then hold it back.
export const maybeTag = (soFar) => /^\s*\[?\s*(?:T(?:A(?:S(?:K)?)?)?|C(?:H(?:A(?:N(?:G(?:E)?)?)?)?)?)?\s*\]?\s*$/i.test(String(soFar || ''));

// ---------- The quick reply's own context ----------
// One line about the job, written by the app from the job's record (meanwhile.js JobWatch), so every word is true.
export function jobLine(w, now = Date.now()) {
  if (!w) return 'You are partway through a job.';
  const n = w.steps?.length || 0;
  const last = w.steps?.[n - 1];
  return `You are partway through a job: "${clip(w.title, 80)}", ${mins(now - (w.startedAt ?? now))} in, ${n ? `${n} step${n === 1 ? '' : 's'} done${last ? ` (last: ${clip(last.what, 60)})` : ''}` : 'no steps yet'}.`;
}

export function quickPrompt({ who = 'the user', line = '', unsure = false, sameChat = false, language = '' } = {}) {
  const tags = unsure
    ? `\nIf the message asks for new work (making, writing, finding or fixing something), reply with only [TASK].${sameChat ? ' If it changes or adds to the job you are on, reply with only [CHANGE].' : ''}`
    : '';
  return `You are Bob, ${who}'s helper on their own computer. ${line} You stopped between two steps to answer one message from ${who}.
Answer it briefly and plainly, with no tools. The job carries on by itself straight after, so don't do it here, and don't guess how long it has left.${tags}${language ? `\n${who} writes in ${language}; answer in the same language.` : ''}`;
}

// The last few plain turns of that chat (words only: no tool calls, no tool results, no hidden notes).
export function quickHistory(list, { turns = QUICK_TURNS, keep = QUICK_KEEP } = {}) {
  const plain = (Array.isArray(list) ? list : []).filter((m) => (m.role === 'user' || (m.role === 'assistant' && !m.tool_calls?.length)) && !m.hidden && String(m.text ?? m.content ?? '').trim());
  return plain.slice(-turns).map((m) => ({ role: m.role, content: clip(m.text ?? m.content, keep) }));
}

// The messages waiting for this job's next step boundary, oldest first.
export const waitingFor = (queue, job) => (queue || []).filter((j) => j.state === 'waiting' && j.midJob && j.midJob === job?.id);

// A message that may be answered mid-job: plain words, Bob's own (not a guest or another Bob), no pictures.
export function midJobFits(cfg, main, extra = {}, attach = []) {
  if (!midJobOn(cfg) || !main || main.guest || main.side) return false;
  if (extra.guest || extra.rent || extra.redo || [].concat(attach || []).length) return false;
  return true;
}
