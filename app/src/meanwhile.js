// Let Bob's Quick brain see the big job (Settings, Brains; off unless you turn it on). Asked for 2026-11-11.
//
// With "Keep chatting while Bob is busy", a quick reply runs on the small Quick brain beside a long job on the big
// brain. Before this, the Quick brain knew nothing about that job, so "how's it going?" got a guess. With this on:
//   1. The Meanwhile line. The app (never a brain) writes one short line from the running job's own record: what it
//      is, how long it has run, which step it's on (of about how many, when it showed a plan) and how the last step
//      went. It goes beside the "Right now" line, only for quick replies beside a job. About 40 tokens.
//   2. look_at_job. The Quick brain can read the job's steps so far, and, while Bob's thinking window is open (the
//      only time thinking is passed along at all), the newest part of the big brain's thinking.
//   3. pass_note. When you ask, the Quick brain leaves a note in the job's inbox. The big brain reads it at its next
//      step, and the job's chat shows that it did. A note never stops or pauses the job: only you do that, with the
//      Stop button and its confirmation.
// The two brains never talk to each other: everything goes through this record, which the app writes. Nothing is
// saved to disk, and nothing goes over Bob-Net (sharing the line with your other Bobs is a later step).
export const meanwhileOn = (cfg) => cfg?.quickSeesJob === true && cfg?.chatWhileBusy !== false;

export const STEP_KEEP = 40; // steps kept per job
export const THINK_KEEP = 6000; // characters of the newest thinking kept
export const NOTE_MAX = 400; // characters per note
export const NOTES_MAX = 3; // notes waiting at once

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const mins = (ms) => { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? 'under a minute' : m === 1 ? '1 minute' : `${m} minutes`; };
const worked = (text) => (/^Error:|said no|declined|not allowed|couldn't|could not|failed/i.test(String(text || '')) ? 'it failed' : 'it worked');

// The record of the job running on the big brain. One at a time (the main lane runs one job).
export class JobWatch {
  constructor() { this.job = null; }

  start(job, { now = Date.now(), session = '' } = {}) {
    if (!job || job.side || job.guest) { this.job = null; return; }
    this.job = { id: job.id, title: clip(job.text, 80), session, startedAt: job.startedAt ?? now, steps: [], planned: 0, thinking: '', notes: [], read: 0, chars: 0, tail: '' };
  }
  end(jobId) { if (this.job && (!jobId || this.job.id === jobId)) this.job = null; }
  for(job) { return job && this.job && this.job.id === job.id ? this.job : null; }

  // A tool the big brain called (summary is the same plain line the chat shows), and later its result.
  step(job, what, now = Date.now()) {
    const w = this.for(job); if (!w) return;
    w.steps.push({ what: clip(what, 120), at: now, result: '' });
    if (w.steps.length > STEP_KEEP) w.steps.splice(0, w.steps.length - STEP_KEEP);
  }
  result(job, text) { const w = this.for(job); const s = w?.steps[w.steps.length - 1]; if (s && !s.result) s.result = clip(text, 200) || '(no answer)'; }
  plan(job, count) { const w = this.for(job); if (w && count > 0) w.planned = Math.min(99, Math.round(count)); }
  // What the big brain has written so far (PC test 1.5.203: a 6,000-word answer has no steps, so the line said nothing).
  wrote(job, text) { const w = this.for(job); if (!w) return; const t = String(text || ''); w.chars += t.length; w.tail = (w.tail + t).slice(-300); }
  think(job, text) { const w = this.for(job); if (!w) return; w.thinking = (w.thinking + String(text || '')).slice(-THINK_KEEP); }

  // pass_note: a note for the big brain. Returns { ok } or { error }.
  note(text, { now = Date.now() } = {}) {
    const w = this.job;
    if (!w) return { error: 'No job is running on the big brain right now, so there is nobody to pass a note to.' };
    const t = clip(text, NOTE_MAX);
    if (!t) return { error: 'The note is empty.' };
    if (w.notes.length >= NOTES_MAX) return { error: `${NOTES_MAX} notes are already waiting for the big brain's next step. Say that, and offer to pass this one along after.` };
    w.notes.push({ text: t, at: now });
    return { ok: true, title: w.title };
  }
  // The big brain's next step takes the notes waiting for it (each once).
  takeNotes(job) { const w = this.for(job); if (!w || !w.notes.length) return []; const out = w.notes.splice(0); w.read += out.length; return out; }
}

// 1. The line beside "Right now". Written by the app from the record, so every word of it is true.
export function meanwhileLine(w, now = Date.now()) {
  if (!w) return '';
  const n = w.steps.length;
  const last = w.steps[n - 1];
  const words = Math.round((w.chars || 0) / 6 / 50) * 50; // about 6 characters a word, to the nearest 50
  const at = n ? `step ${n}${w.planned >= n ? ` of about ${w.planned}` : ''}` : words ? 'writing its answer' : 'no steps yet';
  const writ = words ? `, about ${words.toLocaleString('en-US')} words written so far` : '';
  const lastBit = last ? `; last step: ${clip(last.what, 60)}, ${last.result ? worked(last.result) : 'still going'}` : '';
  const waiting = w.notes.length ? `; ${w.notes.length === 1 ? 'a note is' : `${w.notes.length} notes are`} waiting for it` : '';
  return `Meanwhile (real, from the app): the job running right now is "${clip(w.title, 60)}"${w.session ? ` (${w.session} session)` : ''}, ${mins(now - w.startedAt)} in, ${at}${writ}${lastBit}${waiting}. Earlier replies in this chat are about jobs that already finished. That is all you know about this one; for more, call look_at_job. Never guess how long it has left.`;
}

// 2. What look_at_job hands back.
export function jobDetail(w, { thinkingOn = false, now = Date.now() } = {}) {
  if (!w) return 'No job is running on the big brain right now.';
  const steps = w.steps.length
    ? w.steps.map((s, i) => `${i + 1}. ${s.what} (${mins(s.at - w.startedAt)} in)${s.result ? `: ${worked(s.result)}. ${clip(s.result, 160)}` : ': still going'}`).join('\n')
    : '(no steps yet: it is still thinking about the first one)';
  const think = !thinkingOn
    ? "Its thinking isn't passed along while Bob's thinking window is closed."
    : w.thinking ? `The newest part of its thinking (it may change its mind):\n${w.thinking.slice(-2000)}` : 'No thinking yet.';
  const words = Math.round((w.chars || 0) / 6);
  const writing = words ? `\nWritten so far: about ${words.toLocaleString('en-US')} words. It ends: "…${clip(w.tail, 200)}"` : '';
  return `The job on the big brain: "${w.title}", ${mins(now - w.startedAt)} in${w.planned ? `, with a plan of about ${w.planned} steps` : ''}.\nSteps so far:\n${steps}${writing}\n${think}\nTell the user in plain words; don't guess what comes next or how long is left.`;
}

// 3. How a note reaches the big brain at its next step.
export const noteForBig = (notes, who) => `${notes.length === 1 ? 'A note' : 'Notes'} from ${who}, passed along by your Quick brain while you work:\n${notes.map((n) => `- "${n.text}"`).join('\n')}\nTake it into account from this step on. A note is not an order to stop: only ${who} stops or pauses a job, with the Stop button.`;
// The job gave its answer before its next step: the note goes in once more, and the big brain says what changes.
export const noteAfterAnswer = (notes, who) => `${noteForBig(notes, who)}\nYour answer above is already shown to ${who}. If the note changes it, do or say what changes now; if not, say in one line that you saw it.`;
// The job ended (stopped, failed, or a second note came after the last step) with a note nobody read.
export const noteMissedLine = (notes) => `📨 The job finished before it could read ${notes.length === 1 ? `your note ("${clip(notes[0].text, 100)}")` : `your ${notes.length} notes`}. Send it as a new message if you still want it.`;
// A quick reply about the job, with no job running any more: say so, so an older answer isn't taken for it.
export const asksAboutJob = (text) => /\b(?:how(?:'s| is| are)? (?:it|the job|that|things|my|the) ?(?:\w+ )?going|progress|status|still (?:working|going|busy)|done yet|finished yet|tell (?:the|my|your) (?:job|big brain)|pass (?:it|this|that|a note) (?:on|along)|what(?:'s| is) (?:it|the job|your big brain) (?:doing|on))\b/i.test(String(text || ''));
// "tell the job to keep it short": the app passes it along by itself when the Quick brain can't take the message
// right now (PC test 1.5.203: it waited behind the job and never arrived). Returns the note's words, or ''.
export function noteAsk(text) {
  const m = String(text || '').trim().match(/^(?:(?:can|could) you |please |hey,? )*(?:tell|ask|remind) (?:the job|my job|your job|the big brain|my big brain|your big brain|it|bob's big brain)(?: to| that)?[ ,:]+(.{2,400})$/i)
    || String(text || '').trim().match(/^(?:pass (?:this|it|a note) (?:on|along)(?: to the job)?|note for the job)[ ,:]+(.{2,400})$/i);
  return m ? m[1].replace(/[.!]+$/, '').trim() : '';
}
// The app's own answer to "how's it going?" when no Quick brain can take it right now: the record, word for word.
export const statusLine = (w, now = Date.now()) => meanwhileLine(w, now).replace(/^Meanwhile \(real, from the app\): the job running right now is/, 'My big brain is on').replace(/ Earlier replies in this chat.*$/, '');
export const noteQueuedLine = (text) => `📨 Passed along to the job: "${clip(text, 120)}". My big brain reads it at its next step.`;
export const NO_JOB_LINE = 'Meanwhile (real, from the app): no job is running on the big brain right now; anything earlier in this chat is about jobs that already finished.';
export const noteGotLine = (notes) => (notes.length === 1 ? `📨 Your note reached me: "${clip(notes[0].text, 120)}"` : `📨 ${notes.length} notes reached me.`);

// The Quick brain's two tools. They only work in a quick reply beside a job (ctx.job.side), with the setting on.
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
export const WATCH_TOOLS = ['look_at_job', 'pass_note'];

export function watchTools(brain) {
  const ready = (ctx) => {
    if (!meanwhileOn(brain.cfg)) return 'Error: "Let Bob\'s Quick brain see the big job" is off.';
    if (!ctx?.job?.side) return 'Error: only for a quick reply beside a job.';
    return '';
  };
  return {
    look_at_job: {
      schema: fn('look_at_job', 'Read the steps so far of the job your big brain is working on (and its newest thinking, if Bob\'s thinking window is open). Use it when {{USER}} asks for more than the Meanwhile line says.', {}, []),
      async run(args, ctx) {
        const no = ready(ctx); if (no) return no;
        return jobDetail(brain.watch?.job, { thinkingOn: Boolean(brain.mindWatchers?.()) });
      },
      summary: () => 'looked at the big job'
    },
    pass_note: {
      schema: fn('pass_note', 'Leave a note for your big brain, which reads it at its next step. Only when {{USER}} asks you to tell the job something (a change, a detail, a preference). Never to stop or pause it: for that, tell {{USER}} to press Stop on the job in Tasks.', {
        note: { type: 'string', description: 'The note, in {{USER}}\'s words where you can.' }
      }, ['note']),
      async run(args, ctx) {
        const no = ready(ctx); if (no) return no;
        const r = brain.watch?.note(args?.note) || { error: 'No job is running on the big brain right now.' };
        if (r.error) return `Error: ${r.error}`;
        brain.log?.('meanwhile', 'a note was passed along to the big job');
        return 'Passed along. The big brain reads it at its next step, and its chat says when it does. Tell the user that in a few words.';
      },
      summary: (args = {}) => `passed a note along: "${clip(args.note, 50)}"`
    }
  };
}

// The honesty check (brain.js claimsObservation) covers the job too: a Quick brain that says how far along the job is,
// or how long it has left, with nothing behind it. Only for quick replies beside a job with this on.
export function claimsJobGuess(text) {
  const t = String(text || '');
  return /\b\d{1,3}\s?(?:%|percent)\s+(?:done|finished|through|complete|of the way)\b/i.test(t)
    || /\b(?:about|around|maybe|roughly|another|only)?\s*(?:\d+|a few|a couple of|one|two|three|five|ten)\s+(?:more\s+)?(?:minutes?|mins?|seconds?|hours?)\s+(?:left|to go|remaining|more)\b/i.test(t)
    || /\b(?:it|the job|the big brain|my big brain)(?:'s| is| should be)\s+(?:almost|nearly)\s+(?:done|finished|there)\b/i.test(t);
}
export const JOB_GUESS_CORRECTION = "Nobody knows how long the job has left. That part was a guess; the Meanwhile line only says how far it's got.";
export const JOB_GUESS_NUDGE = 'You said how far along the big job is or how long it has left, but nothing tells you that. Answer again in a line or two from the Meanwhile line only (what it is on, how long it has run, its last step), or call look_at_job.';
