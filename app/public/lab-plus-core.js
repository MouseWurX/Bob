// Lab items 101 to 112: the small pure pieces both the page and the server use, so the maths is the same on both sides
// and the tests can check it without a brain. No DOM, no Node.

// 101 Blind taste test: a rating from your picks, like chess ratings. Everyone starts at 1000; a win against a
// stronger brain moves you more than a win against a weaker one. Ties count half. Names, not ids, so a brain removed
// and got again keeps its record.
export function tasteRanking(pairs = [], k = 24) {
  const rate = new Map(), st = new Map();
  const g = (n) => rate.get(n) ?? 1000;
  const s = (n) => { if (!st.has(n)) st.set(n, { wins: 0, losses: 0, ties: 0 }); return st.get(n); };
  const picked = pairs.filter((p) => p && ['a', 'b', 'tie'].includes(p.pick) && p.a?.name && p.b?.name && p.a.name !== p.b.name).sort((x, y) => (x.pickedAt || 0) - (y.pickedAt || 0));
  for (const p of picked) {
    const A = p.a.name, B = p.b.name, sa = p.pick === 'a' ? 1 : p.pick === 'b' ? 0 : 0.5;
    const ea = 1 / (1 + 10 ** ((g(B) - g(A)) / 400));
    const ra = g(A), rb = g(B);
    rate.set(A, ra + k * (sa - ea)); rate.set(B, rb + k * ((1 - sa) - (1 - ea)));
    if (sa === 1) { s(A).wins++; s(B).losses++; } else if (sa === 0) { s(B).wins++; s(A).losses++; } else { s(A).ties++; s(B).ties++; }
  }
  return [...rate.keys()].map((name) => ({ name, rating: Math.round(g(name)), ...s(name), games: s(name).wins + s(name).losses + s(name).ties })).sort((x, y) => y.rating - x.rating || x.name.localeCompare(y.name));
}

// 111 Check the judge first: how far to trust a judging brain, from how often it picked what you picked.
export const JUDGE_MIN = 20;
export function judgeVerdict(agree, of) {
  if (!of) return { pct: 0, verdict: 'no', line: 'Nothing to compare yet.' };
  const pct = Math.round((100 * agree) / of);
  const verdict = pct >= 80 ? 'trust' : pct >= 65 ? 'care' : 'no';
  return { pct, verdict, line: verdict === 'trust' ? `It agreed with you ${pct}% of the time. Its scores are worth trusting for answers like these.` : verdict === 'care' ? `It agreed with you ${pct}% of the time. Use its scores with care, and look at a few answers yourself.` : `It agreed with you only ${pct}% of the time. Don't trust its scores; try a bigger judge.` };
}
// The judge's answer: "1" or "2", the first one it gives. '' when it gave neither.
export const judgeSaid = (t) => (String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').match(/[12]/) || [''])[0];

// 104 Run again with one change: the next name ("Fast coder" -> "Fast coder 2" -> "Fast coder 3").
export function nextName(name) {
  const s = String(name || '').trim() || 'Lab brain';
  const m = s.match(/^(.*?)\s(\d+)$/);
  return (m ? `${m[1]} ${Number(m[2]) + 1}` : `${s} 2`).slice(0, 60);
}
// What changed between the run you copied and the recipe as it is now, in plain words. [] when nothing did.
export function recipeChanges(was, now, brainName = (id) => id) {
  if (!was || !now) return [];
  const out = [];
  const w = was, n = now, ws = w.smaller || {}, ns = n.smaller || {}, wc = ws.cut || null, nc = ns.cut || null;
  if ((w.from || '') !== (n.from || '')) out.push(`Start brain: ${brainName(w.from) || 'none'} → ${brainName(n.from) || 'none'}`);
  if ((w.template || '') !== (n.template || '')) out.push(`Template: ${w.template || 'none'} → ${n.template || 'none'}`);
  const wl = w.lessons || {}, nl = n.lessons || {};
  if ((wl.kind || 'none') !== (nl.kind || 'none') || (wl.set || '') !== (nl.set || '') || (wl.file || '') !== (nl.file || '')) out.push(`Lessons: ${wl.set || wl.kind || 'none'} → ${nl.set || nl.kind || 'none'}`);
  else if ((wl.chunks || 0) !== (nl.chunks || 0) && nl.kind !== 'none') out.push(`Lessons used: ${wl.chunks} → ${nl.chunks}`);
  for (const [k, label] of [['sight', 'Take out sight'], ['hearing', 'Take out hearing'], ['measure', 'Measure each size']]) if (Boolean(ws[k]) !== Boolean(ns[k])) out.push(`${label}: ${ws[k] ? 'on' : 'off'} → ${ns[k] ? 'on' : 'off'}`);
  if (Boolean(wc) !== Boolean(nc)) out.push(`Cut experts: ${wc ? 'on' : 'off'} → ${nc ? 'on' : 'off'}`);
  else if (wc && nc) {
    if ((wc.how || '') !== (nc.how || '')) out.push(`How to cut: ${wc.how} → ${nc.how}`);
    if ((wc.keep || 0) !== (nc.keep || 0)) out.push(`Experts kept per layer: ${wc.keep || 'by the rule'} → ${nc.keep || 'by the rule'}`);
    if ((wc.cover || 0) !== (nc.cover || 0)) out.push(`Coverage: ${Math.round((wc.cover || 0) * 100)}% → ${Math.round((nc.cover || 0) * 100)}%`);
    if (Boolean(wc.fold) !== Boolean(nc.fold)) out.push(`Fold instead of drop: ${wc.fold ? 'on' : 'off'} → ${nc.fold ? 'on' : 'off'}`);
    if ([...(wc.strong || [])].sort().join() !== [...(nc.strong || [])].sort().join()) out.push('Skills to protect changed');
  }
  if ([...(ws.files || [])].sort().join() !== [...(ns.files || [])].sort().join()) out.push(`Running files: ${(ws.files || []).join(', ') || 'none'} → ${(ns.files || []).join(', ') || 'none'}`);
  if (Boolean(w.test?.compare !== false) !== Boolean(n.test?.compare !== false)) out.push(`Test the start brain too: ${w.test?.compare !== false ? 'on' : 'off'} → ${n.test?.compare !== false ? 'on' : 'off'}`);
  return out;
}

// 112 Clean a lesson set: the words a lesson is compared by. Lower case, no punctuation, single spaces.
export function lessonWords(line) {
  let j = line; if (typeof line === 'string') { try { j = JSON.parse(line); } catch { return ''; } }
  const parts = Array.isArray(j?.messages) ? j.messages.filter((m) => m && m.role !== 'system').map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content ?? ''))) : [JSON.stringify(j ?? '')];
  return parts.join(' ').toLowerCase().replace(/<think>[\s\S]*?<\/think>/g, ' ').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
}
// Word triples (shingles), at most the first 400 words, so a long lesson costs no more than a short one.
export function shingles(words) {
  const w = String(words || '').split(' ').filter(Boolean).slice(0, 400), out = new Set();
  if (w.length < 3) { if (w.length) out.add(w.join(' ')); return out; }
  for (let i = 0; i + 2 < w.length; i++) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}
export function jaccard(a, b) {
  if (!a.size && !b.size) return 1;
  let both = 0; const [s, l] = a.size < b.size ? [a, b] : [b, a];
  for (const x of s) if (l.has(x)) both++;
  return both / (a.size + b.size - both);
}
