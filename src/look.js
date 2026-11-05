// What Bob looks like: the little pixel-art avatar picked in Style. He knows it, can describe it and has an
// opinion on it. When it changes, his next reply gets a one-off note so he can react (Personality, on by default
// only because it costs nothing: it's a line in the next reply, never a message of its own).
import { getLook, DEFAULT_LOOK, LOOKS } from '../public/bob-sprite.js';
import { AVATAR_GROUPS } from '../public/avatars.js';

// A look id: one of Bob's own ("sysop"), an avatar ("robot-3") or a design from the character screen ("c:" + parts).
export const LOOK_ID_RE = /^(?:[a-z]{1,20}(?:-\d{1,2})?|c:[a-z0-9.]{1,80})$/;

const GROUP_WORD = { m: 'a man', f: 'a woman', alien: 'an alien', robot: 'a robot', pc: 'a computer', odd: 'an oddity' };

export function lookText(id) {
  const look = getLook(id) || LOOKS[DEFAULT_LOOK];
  const lid = getLook(id) ? id : DEFAULT_LOOK;
  const grp = /^([a-z]+)-\d+$/.exec(lid)?.[1];
  const kind = grp && AVATAR_GROUPS.some((g) => g.id === grp) ? `, drawn as ${GROUP_WORD[grp] || grp}` : '';
  return `"${look.name}"${kind}: ${look.what.replace(/\.$/, '')}`;
}

export function lookPrompt(cfg) {
  const now = `Your look: {{USER}} picked a little 16x16 pixel-art avatar for you, shown blinking and talking in the corner of the app. Right now it is ${lookText(cfg.look)}. You know this is how you appear and you have opinions about it; if asked what you look like, describe it.`;
  const ch = cfg.lookChange;
  if (!ch || cfg.lookComments !== true) return now; // 1.5.116: opt-in
  return `${now}\n{{USER}} just changed your look from ${lookText(ch.from)} to ${lookText(ch.to)}. In this reply, after answering, add one short in-character line with your honest opinion of the new look. Only this once.`;
}
