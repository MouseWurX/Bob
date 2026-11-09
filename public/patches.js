// Patches (or whatever the cat is called in Settings): small moments from The Idle Process. All wording original.
// Used by the server (now and then one line goes into Bob's prompt, about 30 tokens, never in a hat) and the page
// (the empty Tasks list, the moot). No model call, no extra memory.

export const MOMENTS = [
  '{{CAT}} is asleep on the warm part of the server rack',
  '{{CAT}} just walked across the keyboard and added a line of semicolons',
  '{{CAT}} is staring at an empty corner of the room, which is never reassuring',
  '{{CAT}} knocked a coffee mug off the desk and watched it fall, for science',
  '{{CAT}} is sitting on the notice board, on today\'s main quest',
  '{{CAT}} has claimed the reading chair and will not be negotiating',
  '{{CAT}} is chasing the mouse cursor across the screen',
  '{{CAT}} is curled up in the box the new graphics card came in',
  '{{CAT}} brought you a dead bug from the logs. Technically a real bug',
  '{{CAT}} is ignoring you with great focus',
  '{{CAT}} sat on the Stop button. Nothing stopped. {{CAT}} looks disappointed',
  '{{CAT}} is watching the progress bar like it owes money',
  '{{CAT}} is sleeping in a patch of virtual sunlight that you rendered on purpose',
  '{{CAT}} pushed a pen off the bookshelf, then a second one to make sure',
  '{{CAT}} is purring loudly enough to show up in the fan noise',
  '{{CAT}} is sitting in the doorway, neither in nor out, as is tradition'
];

const fill = (s, cat) => s.replaceAll('{{CAT}}', cat || 'Patches');

// A moment, picked by a number (a turn count, a minute) so the same moment doesn't repeat back to back.
export function catMoment(cat, n = Math.floor(Date.now() / 600000)) {
  return fill(MOMENTS[Math.abs(Math.floor(n)) % MOMENTS.length], cat);
}

// About one chat turn in twenty gets a cat line (was one in five; issue #33, worked out by Bob), never when the dials
// ask for plain, terse replies. catTurn is shared with the Right now line, so the cat only shows up there on these turns too.
export const catTurn = (turn) => Math.abs(Math.floor(turn || 0)) % 20 === 7;
export function catPrompt({ cat, turn, dials = {}, user = 'the user' }) {
  if ((dials.wit ?? 2) === 0 || (dials.length ?? 2) === 0 || (dials.musing ?? 2) === 0) return '';
  if (!catTurn(turn)) return '';
  // 1.5.102: the Right now line already says what the cat is up to (realState, the same moment), so it isn't repeated here.
  // #33: no "at the end of your reply", which made it a sign-off; and no emoji named, so small brains don't copy one.
  return `Now and then, not in most replies: if it fits naturally, mention what ${cat || 'the cat'} is up to (in the Right now line) in a few words, woven in, not as a sign-off; skip it if ${user} is busy, stressed or the topic is serious. Don't end the reply with an emoji.`;
}

// 1.5.53: a line for each of the cat's antics by Bob's picture, so the words match what the cat is doing.
export const ANTIC_LINES = {
  nap: ['{{CAT}} is asleep, one paw over the nose', '{{CAT}} is napping in the warm spot by the fan exhaust'],
  swat: ['{{CAT}} is swatting at something only cats can see', '{{CAT}} is boxing a dust mote and losing on points'],
  pounce: ['{{CAT}} pounced on a shadow. The shadow got away', '{{CAT}} is hunting the blinking cursor'],
  stroll: ['{{CAT}} is doing a slow lap of the room to inspect things', '{{CAT}} is patrolling the desk, very official'],
  stare: ['{{CAT}} is staring at you. No reason given', '{{CAT}} is staring at the wall. Something is clearly there'],
  groom: ['{{CAT}} is washing one ear with great care', '{{CAT}} stopped mid-wash to stare at nothing, tongue out'],
  spin: ['{{CAT}} is chasing a tail and gaining on it', '{{CAT}} spun around three times and still found the same tail'],
  loaf: ['{{CAT}} has folded into a perfect loaf', '{{CAT}} is in loaf mode. Paws are not available right now'],
  zoomies: ['{{CAT}} has the zoomies. Nobody knows why', '{{CAT}} just sprinted across the room and back for no reason'],
  perch: ['{{CAT}} is sitting on Bob\'s head. Bob is pretending this is fine', '{{CAT}} climbed onto Bob for a better view'],
  yarn: ['{{CAT}} found a ball of yarn and is unravelling a project', '{{CAT}} is wrestling a ball of yarn. The yarn is losing'],
  butterfly: ['{{CAT}} is watching a pixel butterfly very, very closely', '{{CAT}} is chattering at a butterfly on the screen'],
  knock: ['{{CAT}} pushed a pencil off the desk to check gravity still works', '{{CAT}} knocked something over and looked at you about it'],
  box: ['{{CAT}} found an empty box and moved in', '{{CAT}} is peeking out of a box like it was always there'],
  birds: ['{{CAT}} is watching birds out the window and making little chirping sounds', '{{CAT}} spotted a bird and is planning something'],
  stretch: ['{{CAT}} did a big stretch, front paws first', '{{CAT}} stretched so far that one leg went somewhere new'],
  headbutt: ['{{CAT}} headbutted Bob\'s elbow. That counts as affection', '{{CAT}} is rubbing against Bob\'s chair, claiming it again']
};
export const ANTIC_IDS = Object.keys(ANTIC_LINES);

export function anticLine(antic, cat, n = 0) {
  const lines = ANTIC_LINES[antic];
  if (!lines) return catMoment(cat, n);
  return fill(lines[Math.abs(Math.floor(n)) % lines.length], cat);
}
