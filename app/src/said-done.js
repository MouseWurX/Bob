// "Said but not done" (1.5.207, always on; PC check: Riker told the owner "Web search is now on" while the Switch it
// on card was still waiting). The app checks Bob's finished reply against what really happened in that turn, in code,
// after the reply: no extra instructions for the brain. When the reply says a switch is on that is still off, or that
// something was sent or looked up when no tool did it, one short correction shows under the reply.
// The brain only ever reads one short line, and only while an offer waits for a press (pendingLine).

import { ON_FR_ES, WEB_FR_ES, SENT_FR_ES, LOOKED_FR_ES, NOT_YET as HONEST_NOT_YET, plain } from './honest.js';

const NAMES = {
  web: `web search(?:ing)?|search(?:ing)? the (?:web|internet)|internet search|web access|the web|${WEB_FR_ES}`,
  workshop: 'the workshop|advanced workshop|comfy ?ui',
  'hand:files': 'files? hands?|the files hand|file hands',
  'hand:sort': 'sort and rename',
  'hand:run': 'run(?:ning)? (?:programs|commands|scripts)|run programs and scripts',
  'hand:apps': 'apps? hands?|using apps|app control',
  'hand:screen': 'screen use|the screen hand',
};
const ON = /\b(?:(?:is|are|'s|'re)\s+(?:now\s+|all\s+)?(?:on|enabled|switched on|turned on|active|live|ready to go)|(?:turned|switched|flipped)\s+(?:it\s+)?on|enabled|activated|have access(?: now)?|can now)\b/i;
const NOT_YET = /\b(?:not|n't|once|when|if|after|until|as soon as|press|tap|click|needs?|waiting|would|could|should|ask|want)\b|\?\s*$/i;
// Nov 12 (items 182, 189): French and Spanish too, and more switches than these (honest.js MORE_SWITCHES).
const NOT_YET_ALL = (s) => NOT_YET.test(s) || HONEST_NOT_YET.test(s);
const sentences = (t) => String(t || '').replace(/\s+/g, ' ').split(/(?<=[.!?])\s+/).filter(Boolean);
const okRun = (a) => a && a.ok !== false && !a.declined;

// The first switch the reply says is on while it is still off. off: [{ key, name, where }] (brain.switchesOff()).
export function switchClaim(reply, off = []) {
  for (const s of sentences(reply)) {
    if (!(ON.test(s) || ON_FR_ES.test(s)) || NOT_YET_ALL(s)) continue;
    for (const sw of off) {
      const words = NAMES[sw.key] || sw.words || String(sw.name || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (words && new RegExp(`(?<![\\p{L}\\p{N}_])(?:${words})(?![\\p{L}\\p{N}_])`, 'iu').test(s)) return sw;
    }
  }
  return null;
}

const SENT = /\b(?:i(?:'ve| have)?\s+(?:just\s+)?(?:sent|emailed|messaged|posted|texted)|(?:it|the (?:message|email|note|report))(?:'s| is| has been| was)\s+(?:now\s+)?(?:sent|posted|delivered))\b/i;
const SEND_TOOLS = /send|post|email|discord|telegram|notify|tell_phone/;
const LOOKED = /\b(?:i (?:just )?(?:looked (?:it |that |this )?up|searched (?:the web|online|for it)|checked (?:online|the web))|according to (?:my|the) (?:search|web search)|i found (?:online|on the web))\b/i;
const LOOK_TOOLS = new Set(['web_search', 'fetch_page', 'browse', 'browser_open', 'browser_read']);

// What the reply says happened that didn't. actions: the turn's tool runs ({ name, ok, declined }).
// Returns { kind, note } or null. pending: the switch keys offered and still waiting for a press.
export function saidNotDone(reply, { actions = [], off = [], pending = new Set() } = {}) {
  const t = plain(reply);
  if (!t.trim()) return null;
  const sw = switchClaim(t, off);
  if (sw) return { kind: 'switch', key: sw.key, note: `Not yet: ${sw.name} is still off. ${pending.has(sw.key) ? 'It switches on when you press Switch it on on the card.' : `It's in ${sw.where}.`}` };
  const ran = actions.filter(okRun).map((a) => String(a.name || ''));
  if (sentences(t).some((s) => (SENT.test(s) || SENT_FR_ES.test(s)) && !NOT_YET_ALL(s)) && !ran.some((n) => SEND_TOOLS.test(n))) return { kind: 'sent', note: 'Nothing was sent this time: no message went out.' };
  if ((LOOKED.test(t) || LOOKED_FR_ES.test(t)) && !ran.some((n) => LOOK_TOOLS.has(n))) return { kind: 'looked', note: 'I didn\'t look anything up this time, so that comes from what I already know.' };
  return null;
}

// The one line the brain reads while offers wait: "web search: offered, not on yet".
export function pendingLine(off = [], pending = new Set()) {
  const names = off.filter((s) => pending.has(s.key)).map((s) => s.name);
  return names.length ? `${names.join('; ')}: offered, not on yet (waiting for a press on the card).` : '';
}
