// Nov 16 (the owner): Patches, Bob's cat, tells the steps. Bob and the cat are two characters: Bob answers, and the cat
// (whatever she's called in Settings) narrates the short step lines in the thinking bubble ("Patches noses through
// app.js"), the line that changes while Bob works, and the done line. Bob's answers, Bob's thinking window and
// Copy the steps stay plain.
//
// Display only. The lines are made here from the step's summary (the same one the brain's tool step already has):
// nothing is sent to a brain, no tool call changes shape, and no tokens are added anywhere.
// Settings, How Bob works, "Patches tells the steps" (cfg.patchesSteps, on unless turned off: the owner asked for it).

export const PAW = '🐾';
const name = (cat) => String(cat || '').trim() || 'Patches';

// While Bob works: the cat's lines, taking turns with time (think-bubble.js swaps them every few seconds).
export const WAITING = [ // short, so a phone shows the whole line
  '{cat} watches Bob think…',
  '{cat} bats at the progress bar…',
  '{cat} keeps watch from the desk…',
  '{cat} naps on the warm card…',
  '{cat} pretends not to watch…',
  '{cat} guards the cursor…',
  '{cat} sniffs out the next step…',
  '{cat} waits, tail twitching…'
];
export function waitingLine(i, cat) {
  const n = ((Math.floor(Number(i) || 0) % WAITING.length) + WAITING.length) % WAITING.length;
  return WAITING[n].replaceAll('{cat}', name(cat));
}

// The done line: "Patches reports: 2m 10s · 7 steps". time is think-bubble.js's "2m 10s".
export function doneWords(cat, time, steps, needed = false) {
  const n = Number(steps) || 0;
  const many = `${n} step${n === 1 ? '' : 's'}`;
  const head = n ? (time ? `${time} · ${many}` : many) : `thought for ${time || '0s'}`;
  return `${name(cat)} reports: ${head}${needed ? ' · waited on you' : ''}`;
}

// One step, from its summary. prev is the step before it in this turn (its summary), so a search then a page read
// can say "found something". Each rule: [pattern, (match, cat, prev) => words]. The first that fits wins.
const RULES = [
  [/^read page: (.+)$/, (m, c, prev) => (/^search: /.test(prev) ? `${c} found something. Reading ${m[1]} now` : `${c} pads over to ${m[1]}`), 'web'],
  [/^search: (.+)$/, (m, c) => `${c} goes hunting: ${m[1]}`, 'search'],
  [/^search my documents for (.+)$/, (m, c) => `${c} digs through your documents for ${m[1]}`, 'search'],
  [/^search (.+)$/, (m, c) => `${c} searches ${m[1]}`, 'search'],
  [/^look in my memory for (.+)$/, (m, c) => `${c} checks Bob's memory for ${m[1]}`, 'read'],
  [/^list (.+)$/, (m, c) => `${c} peeks into ${m[1]}`],
  [/^read (.+)$/, (m, c, prev) => (/^list /.test(prev) ? `${c} picked one. Reading ${m[1]} now` : `${c} noses through ${m[1]}`), 'read'],
  [/^(?:write|edit|change) (.+)$/, (m, c) => `${c} nudges the changes into ${m[1]}, paws steady`, 'write'],
  [/^run: (.+)$/, (m, c) => `${c} runs ${m[1]}, ears back`, 'run'],
  [/^git (.+)$/, (m, c) => `${c} sniffs at git: ${m[1]}`, 'git'],
  [/^map the code in (.+)$/, (m, c) => `${c} maps out the code in ${m[1]}`, 'read'],
  [/^remember: (.+)$/, (m, c) => `${c} watches Bob jot a note: ${m[1]}`],
  [/^reminder: (.+)$/, (m, c) => `${c} sets a reminder: ${m[1]}`, 'plan'],
  [/^image: (.+)$/, (m, c) => `${c} watches a picture take shape: ${m[1]}`],
  [/^(?:music|sound): (.+)$/, (m, c) => `${c}'s ears perk up: ${m[1]}`],
  [/^video: (.+)$/, (m, c) => `${c} settles in to watch: ${m[1]}`],
  [/^ask: (.+)$/, (m, c) => `${c} waits for your answer: ${m[1]}`],
  [/^Help: (.+)$/, (m, c) => `${c} opens Help at ${m[1]}`, 'read'],
  [/^email: (.+)$/, (m, c) => `${c} sorts the post: ${m[1]}`, 'email'],
  [/^calendar: (.+)$/, (m, c) => `${c} checks the calendar: ${m[1]}`, 'plan'],
  [/^notice board: (.+)$/, (m, c) => `${c} hops onto the notice board: ${m[1]}`],
  [/^browser: (.+)$/, (m, c) => `${c} paws at the browser: ${m[1]}`, 'web'],
  [/^apps: (.+)$/, (m, c) => `${c} keeps an eye on the apps: ${m[1]}`, 'run']
];

// The words for a step (plain text: the caller escapes it). Empty summary: null, so the caller keeps its own words.
export function stepWords(summary, cat, prev = '') {
  const s = String(summary || '').trim();
  if (!s) return null;
  const c = name(cat);
  for (const [re, say] of RULES) { const m = s.match(re); if (m) return say(m, c, String(prev || '')); }
  return `${c}: ${s}`;
}

// Nov 16 (the owner): when the cat does something no cat should (reads, searches, writes code, runs programs), Bob is
// surprised, and a little worried. Not on every line: the first odd step of a turn, then every fourth odd step.
// stepKind says which kind of odd it is ('' for cat things like peeking into a folder or watching a picture).
export function stepKind(summary) {
  const s = String(summary || '').trim();
  for (const [re, , kind] of RULES) if (re.test(s)) return kind || '';
  return s ? 'other' : '';
}
export const ASIDES = {
  read: ['since when can the cat read?', 'is she… reading my files?', 'she reads faster than I do. I don\'t like it.', 'who taught her to scroll?', 'she\'s turning pages with her nose. I\'m worried.', 'I left that file open for me, not her.', 'is she skimming? She\'s skimming.', 'she just nodded at a line of code.'],
  search: ['who taught the cat to use a search engine?', 'the cat is searching the web. Should I be worried?', 'she typed that search herself. With paws.', 'her search history is going to be a mystery.', 'she found the search box before I did.', 'what else has she been looking up?', 'that search was better worded than mine.', 'she\'s using quotation marks. Properly.'],
  web: ['she\'s browsing the web. Alone.', 'the cat found a website. On her own.', 'nobody showed her how to click links.', 'she opened a page without asking. Again.', 'I hope she\'s not reading the comments.', 'she clicked the right link first time. Unsettling.', 'is she bookmarking things?', 'the cat has favourite websites now?'],
  write: ['please tell me she\'s not typing.', 'the cat is editing files. I\'m a little worried.', 'she didn\'t even ask for a code review.', 'are those paw prints in the code?', 'she writes neater code than I do.', 'did she just fix my typo? Hers or mine?', 'I\'ll be checking that change twice.', 'she\'s committing to it. Literally.'],
  run: ['she\'s running programs now?', 'the cat has root. Probably. I hope not.', 'I never gave her a keyboard.', 'she pressed Enter like she meant it.', 'the fans just sped up. So did my heart.', 'who said she could run things?', 'she\'s waiting for the output like she understands it.', 'I\'d like it noted I was against this.'],
  git: ['the cat knows git. I don\'t like this.', 'she\'s reading the commit history. Why?', 'she just checked who changed what. Suspicious.', 'does she have her own branch?', 'she knows what a merge is.', 'please don\'t let her force-push.', 'she sighed at my commit messages.', 'the cat has opinions about branching now.'],
  email: ['is the cat reading my email?', 'she\'s sorting the post. Real post never got this treatment.', 'she archived something. What was it?', 'she reads my email faster than I do.', 'please don\'t let her reply to anyone.', 'she\'s found the unsubscribe button. Good, actually.', 'she flagged that one. Why that one?', 'the cat has an inbox strategy.'],
  plan: ['the cat has a calendar?', 'she\'s scheduling things now. For whom?', 'she booked a nap. Several.', 'she\'s better organised than me.', 'that reminder had a paw print on it.', 'she knows what day it is. I don\'t.', 'she put dinner time in. Twice.', 'when did she start planning ahead?'],
  other: ['…that\'s not normal cat behaviour.', 'when did she learn to do that?', 'I\'m choosing not to ask.', 'I\'ll pretend I didn\'t see that.', 'should I call a vet? Or a programmer?', 'she\'s getting very capable. Too capable.', 'I didn\'t know cats could do that.', 'I need a coffee after that one.']
};
// A new job: where the asides start, so the first one differs from job to job.
export const asideSeed = (rand = Math.random) => Math.floor(rand() * 1000);
// n: how many odd steps came before this one in the job. seed: from asideSeed() at the start of the job.
// used: a Set kept for the job, so no line repeats in it. Returns Bob's aside, or '' (most steps get none).
export function bobAside(summary, n = 0, { seed = 0, used = null } = {}) {
  const kind = stepKind(summary);
  const i = Math.max(0, Math.floor(Number(n) || 0));
  if (!kind || i % 4) return '';
  const list = ASIDES[kind] || ASIDES.other;
  const start = Math.abs(Math.floor(Number(seed) || 0)) + Math.floor(i / 4);
  for (let k = 0; k < list.length; k++) {
    const line = list[(start + k) % list.length];
    if (!used || !used.has(line)) { used?.add(line); return line; }
  }
  return ''; // all of this kind used in this job: Bob has run out of things to say
}
// A step that went wrong (the turn's record says so).
export const snagWords = (summary, cat) => `${name(cat)} hit a snag: ${String(summary || 'a step').trim()}`;
