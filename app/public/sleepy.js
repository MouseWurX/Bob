// Sleepy Bob: small scripted asides while the Gaming session keeps him on his small brain. No model call and
// nothing added to his prompt. They are feelings only (slow, foggy, yawning), never claims about jobs or files.
// All wording original. Used by the server (picks a line) and the page (shows it under a reply).

// Now and then under a reply, while in Gaming.
export const SLEEPY = [
  'Hang on, it\'s coming... there it is.',
  'Running on the small brain right now. Bear with me.',
  'Bit sluggish at the moment. Don\'t mind me.',
  'Feels like thinking through porridge. Got there, though.',
  '*blinks slowly* Right. Where was I? Ah, there.',
  'Small brain, big effort.',
  'My thoughts are arriving one at a time, in a polite queue.',
  'It\'s on the tip of my... buffer. Got it.',
  'Running on low power and cold coffee.',
  'If I\'m slow, it\'s because your game is fast. Fair trade.',
  '*yawns* Sorry. Low-power mode does that.',
  'I\'m thinking in a smaller room for now. Cozy, mostly.',
  'Everything feels half a second behind. Including this sentence.',
  'I had something clever to add. It\'s still loading.',
  'Give me a moment to find the thought... found it. It was under the couch.',
  'Not my sharpest hour, but I\'m here.',
  'Bit foggy in here.',
  'Somewhere my bigger brain is napping. I\'m holding the fort.',
  'Words are coming in a little slow. They all showed up in the end.',
  '*rubs the sleep out of the circuits* Okay. Still with you.'
];

// When Gaming starts and when it ends.
export const SLEEPY_ENTER = [
  'Going quiet so your game gets the graphics card. I\'ll be slow, but I\'m here.',
  'Handing the graphics card over. I\'ll be the sleepy one in the corner.',
  'Powering down the big thoughts. Have a good game.'
];
export const SLEEPY_LEAVE = [
  '*stretches* Ah, the graphics card. Room to think again.',
  '*yawns* Oh, that\'s better. Everything\'s back in focus.',
  '*sigh of relief* Whole brain back. What did I miss?'
];

export const SLEEPY_SESSION = 'light';

// How many replies between asides, from the personality dials: more often when Outlook leans gloomy, a bit
// less when he's relentlessly sunny. None at all when Talkative is Terse or Dry wit is Plain.
export function sleepyGap(dials = {}) {
  if ((dials.length ?? 2) === 0 || (dials.wit ?? 2) === 0) return 0;
  const mood = dials.mood ?? 2;
  return mood <= 1 ? 4 : mood >= 4 ? 6 : 5;
}

const pick = (list, recent, rng) => {
  const fresh = list.map((_, i) => i).filter((i) => !recent.includes(i));
  const pool = fresh.length ? fresh : list.map((_, i) => i);
  return pool[Math.floor(rng() * pool.length) % pool.length];
};

// Call once per finished chat reply in Gaming. Returns a line, or '' most of the time. `state` lives on the brain:
// { since: replies since the last aside, recent: the last few lines used }. Never two in a row, never the same
// line again until about half the pool has been used.
export function sleepyAfterReply(state, dials, rng = Math.random) {
  state.since = (state.since || 0) + 1;
  state.recent = state.recent || [];
  const gap = sleepyGap(dials);
  if (!gap || state.since < gap) return '';
  const i = pick(SLEEPY, state.recent, rng);
  state.since = 0;
  state.recent = [...state.recent, i].slice(-Math.floor(SLEEPY.length / 2));
  return SLEEPY[i];
}

// One line when the session changes into or out of Gaming (and nothing for any other switch). The count restarts,
// so the first sleepy aside comes a few replies after the "going quiet" line.
export function sleepySwitch(state, from, to, dials, rng = Math.random) {
  if (from === to || !sleepyGap(dials)) return '';
  if (to === SLEEPY_SESSION) { state.since = 0; return SLEEPY_ENTER[Math.floor(rng() * SLEEPY_ENTER.length) % SLEEPY_ENTER.length]; }
  if (from === SLEEPY_SESSION) { state.since = 0; return SLEEPY_LEAVE[Math.floor(rng() * SLEEPY_LEAVE.length) % SLEEPY_LEAVE.length]; }
  return '';
}
