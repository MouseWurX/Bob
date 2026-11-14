// Bob-Net icons (the owner, Nov 13 2026: "think of it like a discord overlay"). Off unless you turn it on:
// Settings, Bob-Net, "Bob-Net icons" (cfg.netOverlay).
//
// A column of small round icons under Bob's cube (a row under the top bar on a phone). An icon is there only while
// what it stands for is there:
//   - another of your Bobs, while he's paired and answering on Bob-Net right now. His icon is a little porthole like
//     Bob's own, in a colour of his own, and its cube follows his state over there (no brain, loading, thinking,
//     replying, ready), read from him every few seconds while the icons show (GET /api/bob-net/cube, signed in);
//   - a coding agent you added (Settings, Agents), with a moving sign in its app's colours.
// Click a Bob: his chat opens here in guest mode, and what you type goes to him (a "chat" job over Bob-Net, like the
// whole jobs in share-jobs.js) and never runs on this computer. Over there he has thinking, plus web search when it's on
// here: no files, folders, programs, Hands, reminders or memory on either computer. The chat isn't saved (a guest chat,
// guest-chat.js) and it stays in Bob's working memory while he's open, so you can go back and forth.
// Click an agent: its own page opens (Now running, Coding agents). Something new in one of those chats while you're
// elsewhere: a word bubble on its icon (public/net-overlay.js).
//
// Display and routing only: nothing here is added to what a brain is sent, except the one-line note a chat job carries
// to the Bob doing it (share-jobs.js guestNote), and only on that job.
import crypto from 'node:crypto';
import { COMPANIES, COMPANY_IDS, cleanChatHeads } from '../public/agent-companies.js';

export const overlayOn = (cfg) => cfg?.netOverlay === true;
export const NET_PREFIX = 'guest-net-';
export const CUBE_EVERY_MS = 2000; // how often the window asks; each Bob is asked at most this often
export const CUBE_WAIT_MS = 1500; // a Bob slower than this keeps his last state for now
export const MOODS = ['none', 'loading', 'thinking', 'replying', 'ready'];

// A short, steady name for a Bob's chat, from his address (never shown; it only has to match).
export const slugOf = (address) => crypto.createHash('sha256').update(String(address || '')).digest('hex').slice(0, 12);
export const chatIdFor = (address) => `${NET_PREFIX}${slugOf(address)}`;
export const isNetChat = (id) => typeof id === 'string' && /^guest-net-[0-9a-f]{12}$/.test(id);

// Which of your Bobs a chat goes to, or null (an ordinary chat). Only a Bob still on your list.
export function netChatTarget(bobs, sessionId) {
  if (!isNetChat(sessionId)) return null;
  return [].concat(bobs || []).find((b) => chatIdFor(b.address) === sessionId) || null;
}

// A colour of his own for each Bob, from his name: the same on every start. Kept away from teal (Bob's own light).
export function hueFor(name) {
  const h = crypto.createHash('sha256').update(String(name || '').toLowerCase()).digest();
  const hue = (h[0] * 256 + h[1]) % 300; // 0..299, then skip 160..200 (teal)
  return hue >= 160 ? hue + 40 : hue;
}

// Each coding agent's cube: its app's colours and a sign of our own that nods to it (never its logo).
export const AGENT_LOOKS = {
  claude: { hue: 15, sat: 63, sign: 'spark' },
  codex: { mono: true, sign: 'knot' },
  gemini: { hue: 222, sat: 85, sign: 'star' },
  qwen: { hue: 258, sat: 75, sign: 'ring' },
  opencode: { mono: true, sign: 'brackets' },
  custom: { mono: true, sign: 'brackets' }
};
export const agentLook = (kind) => AGENT_LOOKS[kind] || AGENT_LOOKS.custom;

// 1.5.228 Agents: one Settings section per company (public/agent-companies.js); turning its chat head on there
// (cfg.chatHeads[id], off unless turned on) puts its cube under Bob's, showing what its coding agents are doing.
export { COMPANIES, COMPANY_IDS, cleanChatHeads };
export const companyOf = (kind) => COMPANIES.find((c) => c.kind === kind) || null;
// The most pressing state among one company's agents: needs you, then working, failed, done, then ready.
const STATE_ORDER = ['needs-you', 'working', 'failed', 'done', 'stopped', 'idle'];
export function companyHeads(cfg, agents) {
  const on = cleanChatHeads(cfg?.chatHeads);
  const list = [].concat(agents?.agents || []);
  return COMPANIES.filter((c) => on[c.id]).map((c) => {
    const mine = list.filter((a) => a.kind === c.kind);
    const state = STATE_ORDER.find((st) => mine.some((a) => a.state === st)) || 'idle';
    const top = mine.find((a) => a.state === state);
    return { id: c.id, name: c.name, kind: c.kind, look: agentLook(c.kind), state, agents: mine.length, needsYou: mine.filter((a) => a.state === 'needs-you').length, last: top ? clean([].concat(top.log || []).filter((l) => !/^[—!]/.test(l)).at(-1) || '', 160) : '' };
  });
}

// This Bob's own cube, in one word, for another Bob's icon. state: brain.state.state; loaded: how many brains are in
// memory; tokenAt: when his last word streamed out.
export function cubeMood({ state = 'idle', loaded = 0, tokenAt = 0, now = Date.now() } = {}) {
  if (state === 'waking' || state === 'loading') return 'loading';
  if (state === 'thinking') return now - tokenAt < 2000 ? 'replying' : 'thinking';
  if (state === 'busy' || state === 'painting') return 'replying';
  if (!loaded) return 'none';
  return 'ready';
}

// Reads each Bob's cube, at most every CUBE_EVERY_MS each, all at once; a Bob slow to answer keeps his last mood.
export function cubeReader({ now = Date.now } = {}) {
  const last = new Map(); // address -> { mood, at, pending }
  return async function read(lenders, bob) {
    const s = last.get(bob.address) || { mood: 'ready', at: 0 };
    if (now() - s.at < CUBE_EVERY_MS - 200) return s.mood;
    if (!s.pending) {
      s.pending = lenders.call(bob, '/api/bob-net/cube', { timeout: CUBE_WAIT_MS })
        .then(async (r) => { const j = r.ok ? await r.json().catch(() => ({})) : {}; if (MOODS.includes(j.mood)) s.mood = j.mood; })
        .catch(() => {}).finally(() => { s.at = now(); s.pending = null; });
      last.set(bob.address, s);
    }
    await Promise.race([s.pending, new Promise((r) => setTimeout(r, CUBE_WAIT_MS))]);
    return s.mood;
  };
}

const clean = (s, n = 40) => String(s || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, n);

// What the icons show. bobs: your other Bobs (lenders.bobs()); seen(bob): his remembered hello; mood(bob): his cube.
// agents: the coding agents' view (only while "Run coding agents" is on).
// rooms (1.5.228): the chat bots that are on, [{ id, name, waiting, chat? }]: Discord opens its group chat, Telegram (chat:
// 'telegram') your own Telegram chat.
export async function overlayView(cfg, { bobs = [], seen = () => null, mood = async () => 'ready', agents = null, rooms = [] } = {}) {
  // 1.5.228 chat heads: a chat bot you turned on (Discord, Telegram) shows its own head under Bob's cube, whether or
  // not Bob-Net icons is on. The owner, Nov 14: "they would only appear if you have them activated".
  const heads = [].concat(rooms || []).filter((r) => r && /^[a-z]{2,20}$/.test(String(r.id))).map((r) => ({ id: String(r.id), name: clean(r.name) || 'Group chat', waiting: Math.max(0, Number(r.waiting) || 0), ...(r.chat ? { chat: clean(r.chat, 40) } : {}) }));
  const companies = companyHeads(cfg, agents);
  if (!overlayOn(cfg)) return { on: false, bobs: [], agents: [], rooms: heads, companies };
  const headed = new Set(companies.map((c) => c.kind)); // an agent whose company has its own head shows there, not twice
  const up = bobs.filter((b) => seen(b)?.up === true); // only while he's on Bob-Net right now
  const moods = await Promise.all(up.map((b) => mood(b).catch(() => 'ready')));
  return {
    on: true,
    bobs: up.map((b, i) => {
      const s = seen(b) || {};
      return { name: clean(b.name) || 'Another Bob', chat: chatIdFor(b.address), hue: hueFor(b.name), mood: moods[i], device: clean(s.device, 20), brain: clean(s.brain, 60), canChat: (s.jobs || []).includes('chat') && !s.jobsBusy };
    }),
    rooms: heads,
    companies,
    agents: agents?.on ? [].concat(agents.agents || []).filter((a) => !headed.has(a.kind)).map((a) => ({ id: String(a.id), name: clean(a.name), kind: String(a.kind || 'custom'), look: agentLook(a.kind), state: String(a.state || 'idle'), last: clean([].concat(a.log || []).filter((l) => !/^[—!]/.test(l)).at(-1) || '', 160) })) : []
  };
}

// A chat to a Bob who couldn't take it: say so in that chat, and never run it here.
export function failNetChat(brain, job, name, why = 'isn\'t taking chats right now') {
  const text = `${name} ${why}. On ${name}: Settings, Bob-Net, Accept jobs, and he needs this version of Bob too.`;
  Object.assign(job, { state: 'failed', away: undefined, error: `${name} ${why}`.slice(0, 200), doneAt: Date.now() });
  try { const msgs = brain.session(job.sessionId); msgs.push({ role: 'user', content: job.text, at: job.at || Date.now() }); msgs.push({ role: 'assistant', content: `*(${text})*`, at: Date.now() }); } catch {}
  brain.saveQueue();
  brain.broadcast({ type: 'error', text, turnId: job.id, sessionId: job.sessionId });
  brain.broadcast({ type: 'done', turnId: job.id, sessionId: job.sessionId });
}
