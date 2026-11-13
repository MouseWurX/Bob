// 1.5.41 "Auto session" (Settings > Everyday > How Bob works). ON unless switched off: the owner asked for this
// as how Bob works ("this wouldn't be opt in"), the one exception to the opt-in rule. Off = only the picker changes it.
// With it on, Bob changes session himself, from what the chat and the job are really about: his quick brain reads the
// conversation and calls pick_session when a job would clearly go better in another session. There's no word list
// deciding it (the choice has to make sense from the context).
// A switch happens between jobs, never under one: the turn ends, the session changes (the old brains are let go), and the
// same request runs again in the new session with a note saying so. The user's message isn't repeated in the chat.
// After the work is done and Bob has been quiet for a short while (2 minutes, or less if "Free memory after Bob has been
// quiet for" is shorter), he goes back to Normal, the lightest session: with "Free memory when Bob is idle" on, nothing
// stays on the graphics card. Gaming is the exception: Bob never leaves it on his own when he goes quiet, because that
// would load the card in the middle of a game. As little input from the person as possible, so Bob never asks:
// he reads the graphics card himself (nvidia-smi). Busy with something else (a game) = he stays in Gaming, or goes into
// Gaming when he goes quiet; free = he can leave it, and goes back to Normal when quiet.
// The session picker on the chat page still works the same, and a hand-picked session is dropped back from too.
import { SESSIONS, currentSession } from './sessions.js';
import { readCard } from './gaming-card.js';
import { bigGraceMs } from './brain-mode.js';

export const autoSessionOn = (cfg) => cfg?.autoSession !== false;
const ART_ASK = /\b(?:pic|pics|picture|image|photo|draw|drawing|paint|painting|sketch|art|artwork|logo|icon|avatar|wallpaper|poster|illustrat\w*|render\w*|video|clip|animat\w*|music|song|tune|melody|beat|sound|sfx|jingle|3d)s?\b/i;

// What Bob reads in the tool (and nothing else): plain, short, so a small brain can choose well.
const PICK_IDS = { normal: 'normal', art: 'art', coding: 'coding', office: 'office', gaming: 'light' };
export const pickId = (x) => PICK_IDS[String(x || '').toLowerCase().trim()] || null;

export const PICK_SCHEMA_TEXT = {
  description: 'Switch session to suit the work, only when the whole chat clearly fits another. It goes back to normal when quiet.',
  session: 'art: pictures, clips, music; coding: multi-step coding work; office: writing, spreadsheets, research; gaming: {{USER}} is gaming; normal: the rest',
  why: 'Few words, e.g. "for the fix".'
};

// What the tool does. Returns { text, switchTo? }; the turn ends when switchTo is set (brain.js does the switch).
export async function decidePick(brain, args, ctx) {
  const cfg = brain.cfg;
  const who = cfg.userName || 'the user';
  if (!autoSessionOn(cfg)) return { text: `Error: "Auto session" is off, so only ${who} changes the session.` };
  const id = pickId(args?.session);
  if (!id || !SESSIONS[id]) return { text: 'Error: pick normal, art, coding, office or gaming.' };
  const now = currentSession(cfg);
  if (cfg.gamingLock === true && id !== 'light') return { text: `${who} locked Gaming with the 🎮 button, so you stay in Gaming until they turn it off. Card jobs wait in Tasks. Do what you can here, and say so in a line.` };
  if (now.id === id) return { text: `You're already in the ${now.label} session. Carry on with the job.` };
  if (ctx?.job?.switchedTo) return { text: `You've just switched to the ${now.label} session for this. Do the job here; don't switch again.` };
  // Something else is running in the other lane (a picture in Art): changing session now would pull the card out from under it.
  if (brain.turns?.size > 1) return { text: `Something else is still running, so stay in the ${now.label} session for now and do the job here.` };
  // Leaving Gaming loads the graphics card, so Bob looks at it first. Something else working it hard (a game): stay,
  // and the job waits in Tasks as before ("Waiting · Gaming is on"), then runs once the game is closed.
  if (now.id === 'light' && (await (brain.readCard || readCard)().then(cardBusy).catch(() => null)) === true) {
    return { text: `Something (likely ${who}'s game) is using the graphics card, so you stay in Gaming. Card jobs wait in Tasks and run by themselves once it's free. Do what you can here, and say so in a line.` };
  }
  // 1.5.207 PC check: a dinner plan was moved into Art. Art loads the picture brain and lets the chat brain go, so it
  // only happens when the ask (or a picture with it) is about pictures, clips, music or sound.
  if (id === 'art' && !ART_ASK.test(String(ctx?.job?.text || ctx?.turnText || '')) && !(ctx?.job?.refs || []).length) {
    return { text: `Stay in the ${now.label} session: Art is only for pictures, clips, music and sound. Do the job here.` };
  }
  const why = String(args?.why || '').replace(/\s+/g, ' ').trim().slice(0, 80);
  return { text: `Switching to the ${SESSIONS[id].label} session${why ? ` ${why}` : ''}.`, switchTo: id, why };
}

// The line in the chat when Bob switches (a plain app line, his voice).
export function switchLine(id, why, by = 'bob') {
  const s = SESSIONS[id];
  if (!s) return '';
  if (by === 'idle' && id === 'light') return `${s.icon} Something's using the graphics card, so I've gone into the Gaming session to stay out of its way.`;
  if (by === 'idle') return `${s.icon} Back to the ${s.label} session, the lightest one.`;
  return `${s.icon} Switching to the ${s.label} session${why ? ` ${why}` : ''}.`;
}

// The note the job carries when it runs again in the new session (the brain sees it, the chat doesn't).
export function switchedNote(id) {
  return `[Bob note, not from the user: you switched to the ${SESSIONS[id]?.label || id} session for this. Now do what they asked; don't switch again.]`;
}

// The prompt line, only while the setting is on (about 60 tokens).
export function autoSessionPrompt(cfg) {
  if (!autoSessionOn(cfg)) return '';
  const s = currentSession(cfg);
  return `\n\nYou pick your own session (pick_session). You're in the ${s.label} session now. Switch only when the work clearly fits another one better; small talk and quick questions stay put.`;
}

// Something other than Bob is working the graphics card (a game, a render): true, false, or null when it can't be read.
// Bob's own brain idles at about 0% (and his Gaming brain lives on the processor), so the card's load is the tell.
export const CARD_OTHERS_PCT = 30;
// How long Bob is quiet before he goes back to the lightest session, and how often he looks again while idle: 2 minutes,
// or less if "Free memory after Bob has been quiet for" is shorter (the same grace big brains get).
export const IDLE_CHECK_MS = (cfg) => bigGraceMs(cfg);
export function cardBusy(card) {
  if (!card) return null;
  return card.util >= CARD_OTHERS_PCT;
}

// 1.5.211 PC check: Bob's own work on the card isn't "something else". A brain run from outside a chat, or a card lent
// to another Bob, kept it busy, and a quiet Bob took that for a game and went into Gaming (which let the brain go and
// answered the next ask with the small Gaming brain). So when Bob himself holds the card (mine) and no other program
// is on it (others, from card-busy.js), a busy reading says nothing: null, and he stays where he is.
export function whoseCard(busy, { mine = false, others = null } = {}) {
  if (busy !== true || !mine) return busy;
  return others && others.length ? true : null;
}

// Where Bob goes when he's quiet: Gaming while something else is using the card, otherwise Normal. null = stay put.
// A card that can't be read (no NVIDIA card): Normal, except that he doesn't leave Gaming then (he can't tell it's safe).
export function idleSession(cfg, busy, { stay = false } = {}) {
  if (!autoSessionOn(cfg) || cfg?.gamingLock === true) return null;
  const id = currentSession(cfg).id;
  const want = busy === true ? 'light' : busy === false ? 'normal' : stay ? id : id === 'light' ? 'light' : 'normal';
  return want === id ? null : want;
}


// The tool itself (core, sent only while the setting is on: brain.offTools leaves it out otherwise).
export function pickSessionTool(brain) {
  return {
    schema: { type: 'function', function: { name: 'pick_session', description: PICK_SCHEMA_TEXT.description, parameters: { type: 'object', properties: {
      session: { type: 'string', description: PICK_SCHEMA_TEXT.session, enum: Object.keys(PICK_IDS) },
      why: { type: 'string', description: PICK_SCHEMA_TEXT.why }
    }, required: ['session'] } } },
    async run(args, ctx) {
      const d = await decidePick(brain, args, ctx);
      if (d.switchTo) ctx.switchTo = { id: d.switchTo, why: d.why };
      return d.text;
    },
    summary: ({ session }) => `session: ${session}`
  };
}
