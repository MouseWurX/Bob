// Memory that notices it disagrees with itself (item 16, Nov 11). Housekeeping already drops exact repeats, but "likes
// tea" and "hates tea" sat side by side and Bob used whichever recall picked. When a new fact is remembered, the memory
// lines about the same thing are found here (plain word matching, no brain call); remember then hands them back with
// the fact, and Bob asks which is right, then forgets the wrong one. Pure functions.
const SKIP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had', 'are', 'was', 'were', 'is', 'his', 'her', 'their', 'they', 'them', 'she', 'him', 'you', 'your', 'user', 'likes', 'like', 'loves', 'love', 'hates', 'hate', 'prefers', 'prefer', 'wants', 'want', 'does', 'doesn', 'not', 'never', 'always', 'uses', 'use', 'own', 'owns', 'about', 'into', 'over', 'very', 'really', 'now', 'than', 'more', 'less', 'only', 'also']);
// Words that turn a fact around: one line has them and the other doesn't.
const TURN = /\b(?:not|never|no longer|doesn'?t|don'?t|isn'?t|won'?t|can'?t|hates?|dislikes?|stopped|quit|used to|anymore|any more)\b/i;

export const keyWords = (line) => [...new Set(String(line || '').toLowerCase().replace(/\(\d{4}-\d{2}-\d{2}\)/g, ' ').replace(/\[[^\]]*\]/g, ' ').match(/[\p{L}\p{N}]{3,}/gu) || [])].filter((w) => !SKIP.has(w));

// The earlier memory lines that may disagree with this new fact: they share most of their key words with it (the same
// subject) but aren't the same line, and either one turns it around or they differ in a number or a name.
export function clashes(fact, memoryText, { max = 3 } = {}) {
  const want = keyWords(fact);
  if (want.length < 2) return [];
  const out = [];
  for (const raw of String(memoryText || '').replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.replace(/^\s*-\s*/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const have = keyWords(line);
    if (!have.length) continue;
    const shared = want.filter((w) => have.includes(w)).length;
    const small = Math.min(want.length, have.length);
    if (shared < 2 || shared / small < 0.6) continue;
    const a = String(fact).toLowerCase(), b = line.toLowerCase().replace(/\s*\(\d{4}-\d{2}-\d{2}\)\s*/g, ' ').trim();
    if (a.replace(/\W+/g, '') === b.replace(/\W+/g, '')) continue; // the same fact again
    const turned = TURN.test(a) !== TURN.test(b);
    const otherDetail = want.some((w) => !have.includes(w)) && have.some((w) => !want.includes(w));
    if (turned || otherDetail) out.push(line);
    if (out.length >= max) break;
  }
  return out;
}

// What remember adds to its answer when there are clashes: Bob is asked to check with the person.
export const clashNote = (lines, who = 'the user') => (lines.length ? ` This may disagree with what I remembered before: ${lines.map((l) => `"${l}"`).join('; ')}. Ask ${who} which is right. If the new one is, call remember again with the same fact and replaces set to the old line, word for word. If both are true, leave them.` : '');
