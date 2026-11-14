// 1.5.53 Bob's little habits: what his face does between and during jobs. Scripted, no brain, no network, no
// setting of its own: Animations (Style page) Off or Follow Windows with reduced motion keeps him still, as before.
// Everything is a tiny change to the 16x16 picture (eyes glance, a wink, a one-pixel hop or shake) plus, now and
// then, one emoji "prop" by his picture (coffee, a thought bubble, Zs). The page asks for a frame about 12 times a
// second; nothing here allocates per frame beyond a small object.
//
// Idle: a little habit every 20 to 50 seconds. After 10 quiet minutes he dozes off (eyes shut, Zs) and wakes with a
// start when you come back. He looks over when the cat does something.
// Reactions: a nod when you send, a look-around while thinking, a busy prop while working, a hop when he's done,
// a wince on an error, a raised hand when he needs your OK, a wave when he starts.
// A second brain loaded beside the first (a reviewer sitting beside him, a quick brain beside a long job): his head grows, and it shrinks back
// when he's down to one brain again. The size follows the brain readings, so it is always the real state.

export const HABITS = {
  glance: { ms: 2600, prop: '' },
  sip: { ms: 2600, prop: '☕' },
  wink: { ms: 600, prop: '' },
  stretch: { ms: 1600, prop: '' },
  hum: { ms: 3200, prop: '♪' },
  ponder: { ms: 3000, prop: '💭' },
  idea: { ms: 1800, prop: '💡' },
  nodoff: { ms: 2200, prop: '' },
  tidy: { ms: 2400, prop: '🧹' },
  read: { ms: 3600, prop: '📖' }
};
export const HABIT_IDS = Object.keys(HABITS);

export const REACTIONS = {
  hello: { ms: 2200, prop: '👋' },
  heard: { ms: 500, prop: '' },
  done: { ms: 900, prop: '' },
  proud: { ms: 1600, prop: '✨' }, // something made (a picture, song, clip, file)
  oops: { ms: 900, prop: '💦' },
  ask: { ms: 0, prop: '✋' }, // stays while he waits for your OK
  startle: { ms: 700, prop: '❗' },
  cat: { ms: 2200, prop: '' },
  grow: { ms: 1600, prop: '🧠' }, // a second brain joined: his head grows
  shrink: { ms: 1400, prop: '💨' } // back to one brain: his head goes back to normal
};

// Head size by how many brains are loaded at once (the picture model doesn't count).
export function headFor(brains) { return brains >= 3 ? 1.27 : brains === 2 ? 1.2 : 1; }
export const HEAD_MS = 1200;
// Grows past the target a little and settles, like a balloon.
const easeBack = (x) => { const c = 2.2; return 1 + (c + 1) * Math.pow(x - 1, 3) + c * Math.pow(x - 1, 2); };

// Props held while a state lasts (thinking, working, painting).
export const STATE_PROPS = { thinking: '💭', busy: '🔧', painting: '🎨', composing: '🎵', waiting: '✋' }; // composing: a song or a sound (Nov 13)

export const DOZE_MS = 10 * 60 * 1000;

export function createBobLife({ rnd = Math.random, now = Date.now } = {}) {
  let state = 'idle', still = false;
  let act = null; // { id, kind: 'habit'|'reaction', start, ms }
  let nextHabit = now() + 20000 + rnd() * 30000;
  let lastSeen = now(); // the last time you did something (typed, clicked, sent) or he finished a job
  let recent = [];
  let headFrom = 1, headTo = 1, headAt = -Infinity;
  const headNow = (t) => {
    if (still) return headTo;
    const k = Math.min(1, (t - headAt) / HEAD_MS);
    return k >= 1 ? headTo : headFrom + (headTo - headFrom) * easeBack(k);
  };

  const begin = (id, kind, t = now()) => {
    const def = (kind === 'habit' ? HABITS : REACTIONS)[id];
    act = { id, kind, start: t, ms: def.ms };
  };
  const pickHabit = () => {
    const pool = HABIT_IDS.filter((h) => !recent.includes(h));
    const id = pool[Math.floor(rnd() * pool.length) % pool.length];
    recent = [...recent, id].slice(-4);
    return id;
  };
  const dozing = (t) => state === 'idle' && t - lastSeen > DOZE_MS;

  return {
    // The server's status: idle, thinking, loading, busy, painting, waiting.
    state(s) {
      if (s === state) return;
      const t = now();
      if (dozing(t)) begin('startle', 'reaction', t);
      if (state === 'waiting' && act?.id === 'ask') act = null;
      state = s;
      lastSeen = t;
      if (s === 'waiting') begin('ask', 'reaction', t);
      if (s === 'idle') nextHabit = t + 20000 + rnd() * 30000;
    },
    react(id) {
      if (!REACTIONS[id]) return;
      const t = now();
      if (dozing(t) && id !== 'cat') { lastSeen = t; return begin('startle', 'reaction', t); }
      if (id === 'cat' && dozing(t)) return; // a sleeping Bob doesn't look at the cat
      if (act?.id === 'ask' && id !== 'oops') return; // waiting for your OK wins
      lastSeen = id === 'cat' ? lastSeen : t;
      begin(id, 'reaction', t);
    },
    // You moved the mouse in the window, typed or clicked: a dozing Bob wakes with a start.
    poke() {
      const t = now();
      if (dozing(t)) begin('startle', 'reaction', t);
      lastSeen = t;
    },
    setStill(on) { still = !!on; },
    // From each brain reading: how many brains are loaded right now. A second one makes his head bigger.
    brains(n) {
      const t = now(), to = headFor(n);
      if (to === headTo) return;
      headFrom = headNow(t); headAt = t;
      const grew = to > headTo;
      headTo = to;
      if (!(act?.id === 'ask')) begin(grew ? 'grow' : 'shrink', 'reaction', t);
    },
    get head() { return headTo; },
    // Plays a habit at once (tests and screenshots).
    habit(id) { if (HABITS[id]) begin(id, 'habit'); },
    // What to draw now: { look, wink, shut, dx, dy, prop, propClass }. shut = eyes closed (dozing, nodding off).
    frame(t = now()) {
      const f = { look: 0, wink: false, shut: false, dx: 0, dy: 0, prop: '', propClass: '', head: headNow(t) };
      if (still) return f;
      if (act && act.ms && t - act.start > act.ms) act = null;
      if (!act && state === 'idle' && !dozing(t) && t >= nextHabit) {
        begin(pickHabit(), 'habit', t);
        nextHabit = t + 20000 + rnd() * 30000;
      }
      if (!act && dozing(t)) {
        const z = Math.floor((t - lastSeen - DOZE_MS) / 1500) % 3;
        return { ...f, shut: true, dy: 1, prop: ['z', 'zz', 'zZ'][z], propClass: 'zz' };
      }
      if (!act) {
        if (state === 'thinking') { // looks around while he thinks
          const k = Math.floor(t / 1400) % 4;
          return { ...f, look: k === 1 ? -1 : k === 3 ? 1 : 0, prop: STATE_PROPS.thinking, propClass: 'float' };
        }
        if (STATE_PROPS[state]) return { ...f, prop: STATE_PROPS[state], propClass: state === 'waiting' ? 'wave' : 'work' };
        return f;
      }
      const e = t - act.start, def = act.kind === 'habit' ? HABITS[act.id] : REACTIONS[act.id];
      const out = { ...f, prop: def.prop, propClass: act.id };
      switch (act.id) {
        case 'glance': out.look = e < 900 ? -1 : e < 1300 ? 0 : e < 2200 ? 1 : 0; break;
        case 'sip': out.dy = e > 600 && e < 1800 ? -1 : 0; out.look = e > 600 && e < 1800 ? -1 : 0; break;
        case 'wink': out.wink = true; break;
        case 'stretch': out.dy = e < 1200 ? -1 : 0; out.shut = e > 300 && e < 1000; break;
        case 'hum': out.dy = Math.floor(e / 400) % 2 ? -1 : 0; break;
        case 'ponder': out.look = e > 400 && e < 2600 ? 1 : 0; break;
        case 'idea': out.dy = e < 300 ? -1 : 0; break;
        case 'nodoff': out.shut = e < 1700; out.dy = e > 600 && e < 1700 ? 1 : 0; if (e >= 1700) out.prop = '❗'; break;
        case 'tidy': out.look = Math.floor(e / 600) % 2 ? 1 : -1; break;
        case 'read': out.look = Math.floor(e / 1200) % 2 ? 0 : -1; break;
        case 'hello': out.dy = Math.floor(e / 300) % 2 ? -1 : 0; break;
        case 'heard': out.dy = e < 250 ? 1 : 0; break;
        case 'done': out.dy = e < 220 || (e > 440 && e < 660) ? -1 : 0; break;
        case 'proud': out.dy = e < 300 ? -1 : 0; out.wink = e > 500 && e < 1100; break;
        case 'oops': out.dx = Math.floor(e / 90) % 2 ? 1 : -1; if (e > 540) out.dx = 0; out.shut = e < 400; break;
        case 'ask': out.look = 0; break;
        case 'startle': out.dy = e < 250 ? -2 : 0; break;
        case 'cat': out.look = 1; break;
        case 'grow': out.look = e > 400 && e < 1200 ? -1 : 0; out.wink = e > 1200; break;
        case 'shrink': out.shut = e > 200 && e < 700; break;
      }
      return out;
    },
    get dozing() { return dozing(now()); }
  };
}
