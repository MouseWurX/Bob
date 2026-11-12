// Talk with Bob (1.5.210): the plain rules, kept apart from the screen so the tests can check them.
// public/talk.js runs the talk; src/talk.js has the hearing and voice behind it. The phone app's Hands-free uses
// the same short-reply rule (phone/logic.js shortSay); a test checks the two agree.

// The short version of a reply, for saying aloud: its first sentence or two, up to about 220 letters. Code, links
// and marks are left out. The whole reply is always in the chat; when some is left out, he says so.
export const SHORT_MAX = 220;
export const REST_LINE = 'The rest is in the chat.';
export function shortSay(text, max = SHORT_MAX) {
  const plain = String(text || '')
    .replace(/```[\s\S]*?```/g, ' (some code) ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/https?:\/\/\S+/g, 'a link')
    .replace(/^\s*[-*+]\s+/gm, '')
    .replace(/^\s*\d+[.)]\s+/gm, '')
    .replace(/\*\*([^*\n]+)\*\*/g, '$1') // bold words are said
    .replace(/\*[^*\n]+\*\s*/g, '') // stage directions like *yawns* are not
    .replace(/[*_#>|`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!plain) return { say: '', cut: false };
  const sentences = plain.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) || [plain];
  let say = '', n = 0;
  for (const s of sentences) {
    const next = say ? `${say} ${s.trim()}` : s.trim();
    if (n >= 2 || (say && next.length > max)) break;
    say = next; n++;
  }
  if (say.length > max) { const cut = say.lastIndexOf(' ', max); say = `${say.slice(0, cut > max / 2 ? cut : max).replace(/[,;:]$/, '')}…`; }
  const cut = say.length < plain.length;
  return { say: cut ? `${say} ${REST_LINE}` : say, cut };
}

// Words that end the talk, said on their own.
export function endsTalk(text) {
  return /^\W*(?:(?:ok(?:ay)?|thanks?|thank you|bob)\W+)*(?:good ?bye|bye(?: bye)?|see you|that'?s all|we'?re done|end (?:the )?talk|stop talking|stop listening|talk later)(?:\W+(?:bob|for now|then|now|thanks?))*\W*$/i.test(String(text || '').trim());
}

// The line under the dot, by what's happening. Fixed words on the screen: never sent to the brain.
export const TALK_LINES = {
  starting: 'Opening the microphone…',
  listening: 'Listening. Just talk.',
  hearing: 'Got it. Working out what you said…',
  thinking: 'Bob is thinking…',
  working: 'Bob is still on it. Keep talking: he answers between steps.',
  talking: 'Bob is talking. Just speak to cut in.',
  paused: 'Paused. Press Listen when you\'re ready.',
  ended: 'Talk ended.'
};
