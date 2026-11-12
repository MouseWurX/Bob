// 🔑 "Let Bob make passwords" (Settings, How Bob works, 🧰 More tools; off by default).
// make_password makes a password or a passphrase with the computer's own secure random numbers (crypto.randomInt),
// never by the brain, which would make guessable ones. The result goes straight to the person in a box with Copy
// (a 'secret-note' chat event): it isn't spoken aloud, isn't kept in the chat or the logbook, and the brain is only
// told that one was made and how strong it is. In Discord or Telegram it isn't made at all (a bot chat isn't private).
import crypto from 'node:crypto';
import { FOUR, FIVE } from './games-words.js';

const LOWER = 'abcdefghijkmnopqrstuvwxyz', UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ', DIGITS = '23456789', SYMBOLS = '!#$%&*+-=?@^_~';
const LOWER_ALL = 'abcdefghijklmnopqrstuvwxyz', UPPER_ALL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', DIGITS_ALL = '0123456789';
// Plain, everyday words for passphrases (4 and 5 letters from the word games, so no rude or odd words).
export const WORDS = [...new Set([...FOUR, ...FIVE].filter((w) => /^[a-z]{4,5}$/.test(w)))];

const pick = (s, rnd) => s[rnd(s.length)];
const bits = (pool, n) => Math.round(Math.log2(pool) * n);
export const strengthWords = (b) => (b >= 100 ? 'very strong' : b >= 75 ? 'strong' : b >= 55 ? 'fair' : 'weak');

// rnd(n) -> a whole number 0..n-1. Tests pass their own; Bob uses the computer's secure one.
export function makePassword({ kind = 'password', length, words, symbols = true, lookalikes = false, separator = '-', digitsOnly = false } = {}, rnd = (n) => crypto.randomInt(n)) {
  if (kind === 'passphrase') {
    const n = Math.max(3, Math.min(12, Math.round(Number(words) || 5)));
    const sep = ['-', ' ', '.', '_', ''].includes(separator) ? separator : '-';
    const list = Array.from({ length: n }, () => WORDS[rnd(WORDS.length)]);
    // One word gets a capital and a digit, which many sites ask for.
    const at = rnd(n);
    list[at] = list[at][0].toUpperCase() + list[at].slice(1) + DIGITS_ALL[rnd(10)];
    return { text: list.join(sep), bits: bits(WORDS.length, n) + Math.round(Math.log2(n * 10)), kind: 'passphrase' };
  }
  if (kind === 'pin' || digitsOnly) {
    const n = Math.max(4, Math.min(20, Math.round(Number(length) || 6)));
    return { text: Array.from({ length: n }, () => DIGITS_ALL[rnd(10)]).join(''), bits: bits(10, n), kind: 'pin' };
  }
  const n = Math.max(8, Math.min(128, Math.round(Number(length) || 20)));
  const sets = lookalikes ? [LOWER_ALL, UPPER_ALL, DIGITS_ALL] : [LOWER, UPPER, DIGITS];
  if (symbols) sets.push(SYMBOLS);
  const all = sets.join('');
  // One from each kind first (sites ask for it), the rest from all, then shuffled (Fisher-Yates).
  const chars = sets.map((s) => pick(s, rnd));
  while (chars.length < n) chars.push(pick(all, rnd));
  for (let i = chars.length - 1; i > 0; i--) { const j = rnd(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  return { text: chars.join(''), bits: bits(all.length, n), kind: 'password' };
}

const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function passwordTool(cfg, on = () => true) {
  return {
    schema: fn('make_password', 'Make a strong password, passphrase or PIN with secure random numbers. It is shown to the user in a box with Copy; you never see it. Never make one up yourself.', {
      kind: { type: 'string', enum: ['password', 'passphrase', 'pin'], description: 'Default password.' },
      length: { type: 'integer', description: 'password or pin: how many characters. Default 20 (pin 6).' },
      words: { type: 'integer', description: 'passphrase: how many words. Default 5.' },
      symbols: { type: 'boolean', description: 'password: include symbols like ! and #. Default true.' },
      count: { type: 'integer', description: 'How many to make, 1 to 5. Default 1.' }
    }, []),
    async run(args = {}, ctx = {}) {
      if (!on()) return 'Making passwords is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob make passwords".';
      if (/^(discord|telegram)/.test(String(ctx.sessionId || ''))) return 'I don\'t make passwords in a bot chat: it isn\'t private. Ask me in Bob\'s own window or the phone app.';
      const n = Math.max(1, Math.min(5, Math.round(Number(args.count) || 1)));
      const made = Array.from({ length: n }, () => makePassword(args));
      ctx.emit?.({ type: 'secret-note', title: made[0].kind === 'passphrase' ? `Your new passphrase${n > 1 ? 's' : ''}` : made[0].kind === 'pin' ? `Your new PIN${n > 1 ? 's' : ''}` : `Your new password${n > 1 ? 's' : ''}`, items: made.map((m) => m.text), note: 'Made with this computer\'s secure random numbers. Not saved anywhere and not read aloud: copy it now.' });
      return `Made ${n} ${made[0].kind}${n > 1 ? 's' : ''} (${strengthWords(made[0].bits)}, about ${made[0].bits} bits). ${n > 1 ? 'They are' : 'It is'} shown to the user in a box with a Copy button. You don't know ${n > 1 ? 'them' : 'it'}: never write a password in your reply. Say in one line it's in the box, and suggest keeping it in a password manager.`;
    },
    summary: ({ kind }) => `make ${kind || 'password'}`
  };
}
