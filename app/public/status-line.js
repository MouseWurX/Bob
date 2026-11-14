// 1.5.216 (the owner, Nov 13): Bob's line under his name follows his state, like the cube does. No brain loaded, he's
// asleep ("Vacancy. Brain not included."); loading, unloading, ready, thinking, replying, working, painting, waiting on
// you and a paused job each get a few short lines in his voice. A new line picks itself when his state changes, and
// a long state now and then swaps to another of its lines; each change fades out and in over about 0.7 s (none with
// Animations off or when Windows asks for less motion).
//
// Display only: none of these words go to a brain, and nothing waits on them. Settings, How Bob works, "Funny status
// line" (cfg.statusJokes, on unless turned off: the owner asked for it) puts plain words back.

// Each line is one or two short parts; a two-part line shows on two lines ("\n", .status has white-space: pre-line),
// so none runs long across the top bar (the owner, Nov 13: "if they took up two lines it'd be nicer").
export const LINES = {
  asleep: [
    'Sleeping.\nType to wake me.',
    'Vacancy.\nBrain not included.',
    'Lights on,\nnobody home.',
    'Gone fishing.\nType to reel me in.',
    'Zzz…\nSay something.',
    'Out to lunch.\nBack when you type.'
  ],
  waking: [
    'Waking up.\nWhere\'s my coffee?',
    'Five more minutes…\nFine, I\'m up.',
    'Rubbing my eyes…'
  ],
  loading: [
    'Swapping brains…',
    'Installing brain.\nPlease hold.',
    'Screwing my head on…',
    'Brain on the way.\nMind the gap.',
    'Loading thoughts,\nfloor by floor…'
  ],
  unloading: [
    'Putting my brain away…',
    'Clocking out.',
    'It\'s not you.\nIt\'s memory.',
    'Brain back in the box.'
  ],
  idle: [
    'Coffee in hand.\nReady when you are.',
    'All ears.\nWell, all cube.',
    'Kettle on,\nbrain warm.',
    'Standing by.\nSitting, really.',
    'Ready.\nHit me with it.',
    'Idle hands.\nGive them something.'
  ],
  thinking: [
    'Thinking…',
    'Hmm. Hmmmm.',
    'Chewing on it…',
    'Asking my experts…',
    'Gears turning…',
    'Mulling it over…'
  ],
  replying: [
    'Writing back…',
    'Words incoming…',
    'Typing as fast\nas I think…',
    'Putting it into words…',
    'Spilling the beans…'
  ],
  busy: [
    'Working…',
    'Sleeves rolled up.',
    'On it.',
    'Hard at work.\nMostly.',
    'Busy as a Bob.'
  ],
  painting: [
    'Pixel is painting…',
    'Mixing colours…',
    'Brush in hand…',
    'Don\'t look yet…'
  ],
  // Nov 13 (the owner: "i asked him to make me a song, i dont know if he is or not"): music and sounds share the
  // painting state, so they read "Painting…". Now they say what they are, with how far along when the workshop says.
  composing: [
    'Making a song…',
    'Making a song…\nHumming along.',
    'Making a song…\nTuning up.'
  ],
  sound: [
    'Making a sound…',
    'Making a sound…\nFoley time.'
  ],
  waiting: [ // always starts with "Needs your OK": it must be clear at a glance
    'Needs your OK',
    'Needs your OK.\nCard\'s in the chat.',
    'Needs your OK.\nTapping my foot.'
  ],
  paused: [
    'Job on pause.\nCoffee break.',
    'On hold.\nCue the lift music.',
    'Paused.\nIt waits in Tasks.'
  ]
};

// With "Funny status line" off: one plain line per state, the same every time.
export const PLAIN = {
  asleep: 'No brain loaded. Typing loads one.',
  waking: 'Waking up...',
  loading: 'Loading a brain...',
  unloading: 'Letting go of the brain...',
  idle: 'Ready.',
  thinking: 'Thinking...',
  replying: 'Answering...',
  busy: 'Working...',
  painting: 'Painting...',
  composing: 'Making a song...',
  sound: 'Making a sound...',
  waiting: 'Needs your OK',
  paused: 'A job is paused.'
};

// The short word for the window's title bar (Bob · Thinking), never a joke.
export const TITLE = { cardbusy: 'Card busy', waking: 'Waking up', loading: 'Loading', unloading: 'Unloading', thinking: 'Thinking', replying: 'Answering', busy: 'Working', painting: 'Painting', composing: 'Making a song', sound: 'Making a sound', waiting: 'Needs your OK' };

export const FADE_MS = 350; // out, then in: about 0.7 s, like the patch pop-ups
export const UNLOAD_MS = 5000; // how long "Putting my brain away" shows after the last brain goes
export const SWAP_MS = { asleep: 60000, idle: 60000, paused: 60000, thinking: 9000, replying: 9000, busy: 12000, painting: 12000, composing: 12000, sound: 12000, loading: 9000 }; // a long state swaps lines this often; others never

// Which set of lines fits right now. state: the server's (idle, waking, loading, thinking, busy, painting, waiting).
// loaded: how many brains are in memory (null = not known yet). replying: his words are coming in. unloading: a brain
// just went. paused: a job is paused.
export function moodOf({ state = 'idle', loaded = null, replying = false, unloading = false, paused = false, detail = '' } = {}) {
  if (state === 'waiting') return 'waiting';
  if (state === 'painting' && /^Composing\b/.test(detail)) return 'composing'; // brain-making.js: music
  if (state === 'painting' && /^Making a sound\b/.test(detail)) return 'sound';
  if (state === 'loading' || state === 'waking' || state === 'painting' || state === 'busy') return state;
  if (state === 'thinking') return replying ? 'replying' : 'thinking';
  if (state !== 'idle') return state in LINES ? state : 'idle';
  if (unloading) return 'unloading';
  if (paused) return 'paused';
  if (loaded === 0) return 'asleep';
  return 'idle';
}

// A line for the mood, not the one showing now when there's a choice.
export function pickLine(mood, { jokes = true, prev = '', rnd = Math.random } = {}) {
  if (!jokes) return PLAIN[mood] || PLAIN.idle;
  const list = LINES[mood] || LINES.idle;
  const pool = list.length > 1 ? list.filter((t) => t !== prev) : list;
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

// el: Bob's status line. still(): no fades. Returns what the page tells it as things change.
export function createStatusLine(el, { still = () => false, rnd = Math.random, setTimer = setTimeout, clearTimer = clearTimeout } = {}) {
  let state = 'idle', loaded = null, replying = false, unloading = false, paused = false, jokes = true;
  let mood = '', text = '', held = false, swapT = 0, fadeT = 0, unloadT = 0;
  // Nov 13 (card-guard.js): another program holds the graphics card ("Card busy: llama-server, 10.7 GB"). Shown
  // instead of his resting line, so it's plain before anyone sends a message; his working lines stay as they are.
  let cardBusy = '';
  let detail = '', pct = '';

  function show(next, { quiet = false } = {}) {
    if (next === text) return;
    text = next;
    // A swap within the same state isn't news: the screen reader stays quiet for it. A new state is said.
    el.setAttribute('aria-live', quiet ? 'off' : 'polite');
    clearTimer(fadeT);
    if (still() || !el.textContent) { el.classList.remove('fading'); el.textContent = next; return; }
    el.classList.add('fading');
    fadeT = setTimer(() => { el.textContent = text; el.classList.remove('fading'); }, FADE_MS);
  }
  function swapLater() {
    clearTimer(swapT);
    const every = jokes && SWAP_MS[mood];
    if (every) swapT = setTimer(() => { if (!held) show(withPct(pickLine(mood, { jokes, prev: text, rnd })), { quiet: true }); swapLater(); }, every);
  }
  function draw(force = false) {
    if (held) return;
    const base = moodOf({ state, loaded, replying, unloading, paused, detail });
    const m = cardBusy && (base === 'idle' || base === 'asleep') ? 'cardbusy' : base;
    if (m === mood && !force) return;
    mood = m;
    el.dataset.mood = m;
    if (m === 'cardbusy') { clearTimer(swapT); show(`⚠ ${cardBusy.replace(/^Card busy: /, 'Card busy:\n')}`); return; }
    show(withPct(pickLine(m, { jokes, prev: text, rnd })));
    swapLater();
  }
  // Making a song or a sound: how far along, on its own line ("Making a song…\n40% done"), when the workshop says.
  // Or what the music engine is doing first ("Starting the music engine", "Setting up the music engine").
  const stageOf = () => { const m = /^Composing \(([^:)]+)/.exec(detail); return m && m[1] !== 'composing' ? m[1].charAt(0).toUpperCase() + m[1].slice(1) : ''; };
  const withPct = (line) => {
    if (mood !== 'composing' && mood !== 'sound') return line;
    const extra = pct ? `${pct}% done` : stageOf();
    return extra ? `${line.split('\n')[0]}\n${extra}` : line;
  };
  return {
    // The server's status event ({ state, ... }). A new state lets go of any held line.
    status(s) {
      const next = s?.state || 'idle';
      if (next !== 'thinking') replying = false;
      const changed = next !== state || held;
      state = next; held = false;
      detail = String(s?.detail || '');
      const p = (/(\d{1,3})%/.exec(detail) || [])[1] || '';
      if (!changed && (mood === 'composing' || mood === 'sound') && moodOf({ state, detail }) === mood) { pct = p; show(withPct(text), { quiet: true }); return; }
      pct = p;
      draw(changed);
    },
    // A brain reading (/api/brain, the bob-brain-status event): how many brains are in memory.
    brains(st) {
      const n = Array.isArray(st?.models) ? st.models.length : null;
      if (n == null) return;
      // Mid-swap the engine holds nothing for a moment: not an unload.
      if (loaded > 0 && n === 0 && !['waking', 'working', 'loading'].includes(st?.state) && state === 'idle') {
        unloading = true; clearTimer(unloadT);
        unloadT = setTimer(() => { unloading = false; draw(); }, UNLOAD_MS);
      }
      if (n > 0) { unloading = false; clearTimer(unloadT); }
      loaded = n;
      const c = String(st?.cardBusy || ''); if (c !== cardBusy) { cardBusy = c; draw(true); return; } // /api/brain says so too
      draw();
    },
    // Another program holds the graphics card ('' = not any more).
    card(words) { const c = String(words || ''); if (c === cardBusy) return; cardBusy = c; draw(true); },
    // His words started coming in (true), or the turn ended (false).
    replying(on) { if (replying === Boolean(on)) return; replying = Boolean(on); draw(); },
    // The job list: is one paused?
    jobs(list) { paused = (list || []).some((j) => j?.state === 'paused'); draw(); },
    // Funny status line on or off (Settings).
    jokes(on) { const v = on !== false; if (v === jokes) return; jokes = v; draw(true); },
    // A line that isn't a state (Listening..., Bob isn't answering): stays until the next status event.
    hold(words) { held = true; clearTimer(swapT); clearTimer(fadeT); el.classList.remove('fading'); text = words; el.setAttribute('aria-live', 'polite'); el.textContent = words; },
    mood: () => mood,
    title: () => TITLE[mood] || ''
  };
}
