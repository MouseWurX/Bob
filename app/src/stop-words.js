// Stop and wait words (Settings, Jobs; on unless switched off: reliability). Asked for 2026-11-13.
//
// The owner: "does Bob know to wait, pause, hold, belay, delay, cancel, stop, no no, or no?", "or would he reply, and
// keep working?", and "we need to be very careful with the word triggers". Before this, only a bare "stop" in the job's
// own chat was caught, and only at the next step boundary; "wait", "hold on" or "no no" got a reply and the job kept
// going. Now:
//   1. The app reads the words, the moment they're sent. Nothing is added to the brain's prompts for this.
//   2. Only a WHOLE short message counts ("stop", "no no", "hold on a sec", "wait 10 minutes"). The same word inside a
//      sentence ("don't stop the server", "how do I pause a video?", "wait for the download, then install it") is a
//      normal message, as before. A word only counts while a job of yours is running or waiting.
//   3. What each one does (Tasks shows it, and a one-line bubble says it):
//        stop    stop, cancel, abort, halt, quit, belay that, scrap it, never mind, no no, "no, stop", a bare "no":
//                stops at once, like the Stop button. What's already done stays done.
//        wrap    enough, that'll do, wrap it up, stop after this step: the step running now finishes, then he sums up.
//        pause   wait, pause, hold on, hang on, one sec, stand by: paused in Tasks. "Go on" or Resume carries on from
//                the last finished step.
//        delay   delay, later, not now, park it, or a time ("wait 10 minutes", "pause for an hour"): paused, and with a
//                time he picks it back up by himself when it's up.
//        alarm   "what are you doing?!", "what the f…", "wtf", "oh no", a bare swear: paused just in case (nothing is
//                lost), with one line saying what he was on and how to stop or carry on.
//        resume  go on, carry on, continue, keep going, resume, go ahead: only when a job in this chat is paused.
//   4. A bare "no" only stops a job when nothing is waiting on your answer: with an OK card or a question open, it's
//      left to answer that, as before.
// Works the same on Windows, Mac, Linux and Android (the phone app sends through the same queue). Guests (another Bob,
// Discord, Telegram) can't stop your jobs with words. Bob's own words run through the same app on every engine.

export const stopWordsOn = (cfg) => cfg?.stopWords !== false;

// ---------- Reading the words ----------
const NUM = '(?:\\d{1,3}(?:\\.\\d)?|a|an|one|two|three|four|five|six|seven|eight|nine|ten|fifteen|twenty|thirty|forty|forty-five|fifty|sixty|ninety|a couple(?: of)?|a few|half an?)';
const UNIT = '(?:s|secs?|seconds?|m|mins?|minutes?|h|hrs?|hours?)';
const NUMS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, fifteen: 15, twenty: 20, thirty: 30, forty: 40, 'forty-five': 45, fifty: 50, sixty: 60, ninety: 90, 'a couple': 2, 'a couple of': 2, 'a few': 3, 'half a': 0.5, 'half an': 0.5 };
export const MAX_DELAY_MS = 24 * 3600e3; // a day at most; longer is a plain pause

// Words that may sit before or after the command without changing it.
const LEAD = '(?:(?:ok(?:ay)?|hey|bob|please|oh|um+|uh+|hmm+|whoa+|woah+|sorry|actually|dude|mate|man)\\s+)*';
const TAIL = '(?:\\s+(?:please|now|right now|bob|there|then|thanks|thank you|dude|mate|man|for now|immediately|asap))*';
const BIT = '(?:a\\s+)?(?:sec|second|moment|minute|min|bit|tick|mo)';

const STOP_CORE = [
  'stop(?:\\s+(?:it|that|this|everything|the job|the task|what you(?:\'re| are) doing))?',
  'cancel(?:\\s+(?:it|that|this|everything|the job|the task))?',
  'abort(?:\\s+(?:it|that|this|the job|the task))?',
  'halt', 'quit(?:\\s+it)?', 'kill it', 'cut it out',
  'belay(?:\\s+(?:that|it|the job|the task|that order))?',
  'scrap (?:it|that|this)', 'forget (?:it|that)', 'never ?mind', 'nvm', 'don\'?t(?:\\s+do\\s+(?:it|that|this))?', 'do not(?:\\s+do\\s+(?:it|that|this))?'
];
// "no no", "nooo", "no, stop", "no no no stop": a run of no's, maybe with a stop word after it.
const NOS = '(?:no+|nope|nah)(?:\\s+(?:no+|nope|nah))+';
const STOP_RE = new RegExp(`^${LEAD}(?:(?:no+|nope|nah|wait)\\s+)*(?:(?:${STOP_CORE.join('|')})(?:\\s+(?:${STOP_CORE.join('|')}))*|${NOS}|no{3,})${TAIL}$`);
const BARE_NO = /^(?:no+|nope|nah)$/;
const WRAP_RE = new RegExp(`^${LEAD}(?:(?:that(?:'?s| is) )?enough(?: now| already)?|that(?:'?ll| will) do|wrap (?:it |this |things )?up|stop after this(?: step)?|finish (?:this|that|the) step and stop|you can stop(?: now)?|ok that'?s good)${TAIL}$`);
const PAUSE_CORE = `(?:wait(?:\\s+wait)*(?:\\s+up)?|pause(?:\\s+(?:it|that|this|the job|the task))?|hold(?:\\s+(?:on|up|it|that|off|the job|everything))?(?:\\s+(?:on|up))?|hang on|freeze|stand ?by|one ${BIT.replace('(?:a\\s+)?', '')}|just a ${BIT.replace('(?:a\\s+)?', '')}|give me a ${BIT.replace('(?:a\\s+)?', '')}|gimme a ${BIT.replace('(?:a\\s+)?', '')}|sec|one sec|a sec)`;
const PAUSE_RE = new RegExp(`^${LEAD}${PAUSE_CORE}(?:\\s+(?:a\\s+)?${BIT})?(?:\\s+(?:for\\s+(?:now|a\\s+bit|a\\s+sec(?:ond)?|a\\s+moment|a\\s+minute)))?${TAIL}$`);
const DELAY_RE = new RegExp(`^${LEAD}(?:delay(?:\\s+(?:it|that|this|the job|the task))?|(?:do (?:it|that|this) )?later|not (?:now|yet|right now)|maybe later|come back to (?:it|this|that) later|put (?:it|this|that) on hold|park (?:it|this|that))${TAIL}$`);
// A time: "wait 10 minutes", "pause for an hour", "delay it 5 min", "give me 2 minutes", "do it in 20 minutes".
const TIMED_RE = new RegExp(`^${LEAD}(?:wait|pause|hold(?:\\s+(?:on|off|it))?|hang on|delay(?:\\s+(?:it|that|this))?|give me|gimme|do (?:it|that|this) in|try again in|come back in|in)(?:\\s+for)?\\s+(${NUM})\\s*(${UNIT})${TAIL}$`);
const RESUME_RE = new RegExp(`^${LEAD}(?:(?:ok(?:ay)?|yes|yeah|yep|fine|alright|right|sorry|it'?s (?:ok|okay|fine)|all good|false alarm|my bad),?\\s+)*(?:go(?:\\s+on)?|go ahead|carry on|continue|keep going|resume|unpause|proceed|as you were|back to (?:it|work)|you can (?:go on|continue|carry on|keep going)|start (?:it )?again|you(?:'ve)? got it|go for it|do it|all yours)${TAIL}$`);
// Alarm: the owner's "what are you doing", "what the fucks". Paused just in case, never stopped.
const SWEAR = '(?:f+u+c+k+(?:s|ing)?|f+\\*+k?|f+[-*]+|fk|fck|shit+|crap|damn(?:it)?|bloody hell|hell|heck)';
const ALARM_RE = new RegExp(`^${LEAD}(?:(?:what|wth|wtf|why|whoa|woah|oh no|no)[\\s,]+)*(?:what (?:are|r) (?:you|u) doing|wh?at (?:the|da) ${SWEAR}(?:\\s+(?:are you doing|is (?:this|that)|was that|just happened))?|wtf+(?:\\s+(?:are you doing|is (?:this|that)|was that))?|wth|why (?:are|r) (?:you|u) doing (?:that|this)|why did (?:you|u) do (?:that|this)|what did (?:you|u) (?:just )?do|what was that|oh no+|oh (?:my god|god|${SWEAR})|omg|${SWEAR}(?:\\s+${SWEAR})*)${TAIL}$`);

// Clean the message for reading: lower case, plain quotes, no emoji or end marks, one space between words.
export function plainWords(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[‘’ʼ`]/g, "'")
    .replace(/[“”"]/g, '')
    .replace(/[^\p{L}\p{N}'*\-\s.,!?]/gu, ' ') // emoji and odd marks
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function durationMs(num, unit) {
  const n = /^\d/.test(num) ? Number(num) : NUMS[num] ?? NUMS[num.replace(/\s+of$/, '')] ?? 1;
  const u = unit[0];
  const ms = n * (u === 's' ? 1e3 : u === 'h' ? 3600e3 : 60e3);
  return Math.round(ms);
}

// What a short message means mid-job, or null for a normal message.
// asking: an OK card or a question is waiting for the user's answer (a bare "no" is left to answer it).
// Returns { kind: 'stop'|'wrap'|'pause'|'delay'|'alarm'|'resume', ms? }.
export function readStopWord(text, { asking = false } = {}) {
  const raw = String(text ?? '');
  if (!raw.trim() || raw.length > 80 || /\n/.test(raw.trim())) return null; // a long message is never a command
  const t = plainWords(raw);
  if (!t || t.split(' ').length > 9) return null;
  if (BARE_NO.test(t)) return asking ? null : { kind: 'stop', bare: true };
  if (asking && /^(?:no+|nope|nah)(?:\s+(?:no+|nope|nah))*$/.test(t)) return null;
  const timed = t.match(TIMED_RE);
  if (timed) {
    if (/^an?$/.test(timed[1]) && !/^h/.test(timed[2])) return { kind: 'pause' }; // "wait a minute", "give me a sec": a way of saying hold on
    const ms = durationMs(timed[1], timed[2]);
    return ms > 0 && ms <= MAX_DELAY_MS ? { kind: 'delay', ms } : { kind: 'pause' };
  }
  if (WRAP_RE.test(t)) return { kind: 'wrap' };
  if (STOP_RE.test(t)) return { kind: 'stop' };
  if (RESUME_RE.test(t)) return { kind: 'resume' };
  if (DELAY_RE.test(t)) return { kind: 'delay' };
  if (PAUSE_RE.test(t)) return { kind: 'pause' };
  if (ALARM_RE.test(t)) return { kind: 'alarm' };
  return null;
}

// ---------- The lines Bob says (one short bubble each, in his voice) ----------
const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
const span = (ms) => { const m = Math.round(ms / 60000); if (ms < 60000) return `${Math.max(1, Math.round(ms / 1000))} seconds`; if (m < 60) return m === 1 ? 'a minute' : `${m} minutes`; const h = Math.round(m / 6) / 10; return h === 1 ? 'an hour' : `${h} hours`; };
export const LINES = {
  stop: '🛑 Stopped. Anything I already finished stays done.',
  stopWaiting: '🛑 Cancelled. I won\'t pick it up again.',
  wrap: '⏸ Stopping after this step, as asked. Then I\'ll sum up what I have.',
  pause: '⏸ Paused. Say "go on" (or press Resume in Tasks) and I\'ll carry on from the last finished step.',
  delay: (ms) => (ms ? `⏰ Paused. I'll pick it back up in ${span(ms)}. "Go on" starts it sooner, "stop" ends it.` : '⏰ Paused for later. Say "go on" (or press Resume in Tasks) when you want it.'),
  alarm: (on) => `⏸ Paused, just in case. ${on ? `I was on: ${clip(on, 80)}. ` : ''}Say "stop" to end it or "go on" to carry on.`,
  resume: '▶ Carrying on from where I stopped.',
  resumedLater: '▶ Time\'s up, so I\'m carrying on with it.',
  cantPause: '⚠ That one is with another of your Bobs, so I can\'t pause it. Say "stop" to end it.'
};

// ---------- Acting on them ----------
const ownJob = (j) => j && !j.guest && !j.dropAfter;
// The job the words are about: the one running in this chat; else the newest waiting there; else, for a stop or a
// pause, the only job of yours running anywhere. A resume is about the newest paused job in this chat.
export function targetJob(queue, sessionId, kind) {
  const q = (queue || []).filter(ownJob);
  if (kind === 'resume') return q.filter((j) => j.state === 'paused' && j.sessionId === sessionId).sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0))[0] || null;
  const here = q.filter((j) => j.sessionId === sessionId);
  const working = here.find((j) => j.state === 'working');
  if (working) return working;
  const waiting = here.filter((j) => j.state === 'waiting');
  if (waiting.length) return waiting[waiting.length - 1];
  const paused = here.filter((j) => j.state === 'paused').sort((a, b) => (b.pausedAt || 0) - (a.pausedAt || 0))[0];
  if (paused) return paused; // "stop" after "hold on" ends it; "wait 10 minutes" sets its wake-up
  const anywhere = q.filter((j) => j.state === 'working');
  return anywhere.length === 1 ? anywhere[0] : null;
}

// Is a card or question waiting for the user's answer? Then a bare "no" answers it.
const asking = (brain) => Boolean(brain.approvals?.size) || Boolean(brain.gate?.waitingNow > 0);

// What the job was last doing, for the alarm line (from the job's own record).
function lastStep(brain, job) {
  const w = brain.watch?.for?.(job) || (brain.watch?.job?.id === job.id ? brain.watch.job : null);
  const s = w?.steps?.[w.steps.length - 1];
  return s?.what || (job.state === 'working' ? clip(job.text, 60) : '');
}

// Stop a job in any state: a paused one is simply cancelled (it isn't running, so there's nothing to stop).
function endJob(brain, job) {
  if (job.state !== 'paused') return brain.cancelJob(job.id);
  Object.assign(job, { state: 'cancelled', pausedFrom: undefined, pausedAt: undefined, doneAt: Date.now() });
  brain.saveQueue?.();
  return true;
}

// enqueue calls this first. Returns the same shape as steerNote ({ answered }) when the words were handled, else null.
export function heedStopWord(brain, sessionId, text, attach = [], extra = {}, { now = Date.now } = {}) {
  if (!stopWordsOn(brain.cfg) || extra.guest || extra.rent || [].concat(attach || []).length) return null;
  const word = readStopWord(text, { asking: asking(brain) });
  if (!word) return null;
  const job = targetJob(brain.queue, sessionId, word.kind);
  if (!job) return null; // nothing of yours is running or paused: a normal message
  // Careful (the owner: "be very careful with the word triggers"): a bare "no" or an alarm only counts for a job that is
  // running or waiting in this same chat. A paused job, or one running in another chat, needs a plain command.
  const loose = word.bare || word.kind === 'alarm';
  if (word.kind !== 'resume' && (job.state === 'paused' || job.sessionId !== sessionId)) {
    if (loose) return null;
    if (job.state === 'paused' && (word.kind === 'pause' || (word.kind === 'delay' && !word.ms))) return null; // already paused
  }
  let line = '';
  const k = word.kind;
  if (k === 'resume') {
    if (!brain.resumeJob(job.id)) return null;
    clearDelay(brain, job);
    line = LINES.resume;
  } else if (k === 'stop') {
    const waiting = job.state === 'waiting' || job.state === 'paused';
    if (!endJob(brain, job)) return null;
    clearDelay(brain, job);
    line = waiting ? LINES.stopWaiting : LINES.stop;
  } else if (k === 'wrap') {
    if (job.state === 'working' && brain.turns?.get?.('talk')?.turnId === job.id) { job.stopAfter = true; line = LINES.wrap; }
    else { const waiting = job.state === 'waiting' || job.state === 'paused'; if (!endJob(brain, job)) return null; clearDelay(brain, job); line = waiting ? LINES.stopWaiting : LINES.stop; }
  } else {
    // pause, delay and alarm all pause (nothing is lost); a delay with a time comes back by itself.
    const on = k === 'alarm' ? lastStep(brain, job) : '';
    if (job.away) line = LINES.cantPause;
    else {
      if (job.state === 'paused') { /* already paused: a new time just moves the wake-up */ }
      else if (!brain.pauseJob(job.id)) return null;
      clearDelay(brain, job);
      if (k === 'delay' && word.ms) { job.resumeAt = now() + word.ms; armDelay(brain, job, now); }
      line = k === 'alarm' ? LINES.alarm(on) : k === 'delay' ? LINES.delay(word.ms) : LINES.pause;
    }
    brain.saveQueue?.();
  }
  brain.log?.('jobs', `stop and wait words: "${k}" for a ${job.state} job`);
  setTimeout(() => brain.broadcast?.({ type: 'busy-note', sessionId, text: line }), 0);
  return { jobId: null, turnId: null, ahead: 0, answered: line, heard: k };
}

// ---------- Delays: back by itself when the time is up (and after a restart) ----------
export function clearDelay(brain, job) {
  const t = brain.delayTimers?.get(job.id);
  if (t) clearTimeout(t);
  brain.delayTimers?.delete(job.id);
  job.resumeAt = undefined;
}
export function armDelay(brain, job, now = Date.now) {
  if (!job.resumeAt) return;
  const timers = (brain.delayTimers ||= new Map());
  if (timers.get(job.id)) clearTimeout(timers.get(job.id));
  const t = setTimeout(() => {
    timers.delete(job.id);
    const j = (brain.queue || []).find((x) => x.id === job.id);
    if (!j || j.state !== 'paused' || !j.resumeAt) return; // resumed, stopped or removed meanwhile
    j.resumeAt = undefined;
    if (brain.resumeJob(j.id)) {
      brain.log?.('jobs', 'a delayed job picked itself back up');
      brain.broadcast?.({ type: 'busy-note', sessionId: j.sessionId, text: LINES.resumedLater });
    }
  }, Math.max(0, job.resumeAt - now()));
  t.unref?.();
  timers.set(job.id, t);
}
// At start-up: delayed jobs left from last time get their timers back (one whose time passed while Bob was closed
// carries on straight away).
export function armDelays(brain, now = Date.now) {
  for (const j of brain.queue || []) if (j.state === 'paused' && j.resumeAt) armDelay(brain, j, now);
}

// ---------- When the brain reads an unclear message mid-job ----------
// The quick reply between steps (mid-job.js) may answer [STOP] or [PAUSE] for words the list above doesn't know
// ("hang fire a sec", "hold your horses"). That's said only in the quick reply's own small prompt, never the job's.
export const BRAIN_TAGS = ' If it tells you to stop or end the job, reply with only [STOP]. If it tells you to wait, pause or hold off, reply with only [PAUSE].';
