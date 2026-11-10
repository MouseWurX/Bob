// 🧪 Computer Science Lab, Playground: aiFEUI. The sums, shared by the page (it plays a recording with no
// round trip, even one opened from a file) and the server and tests (the same numbers).
// A recording (format "bob-expert-recording", version 1) is what a mixture-of-experts brain's routers picked while it
// read a set of simple questions, a few for each skill, and wrote the answers:
//   { format, version, id, name, when, engine, brain: { name, experts, layers, used },
//     skills: [{ id, label }],
//     clips: [{ skill, question, answer, prompt, words: [text], e: [[[expert ids] per layer] per word], last }] }
// One entry of `words`/`e` per word the brain read, in order: the first `prompt` are the question, the rest are its
// own answer being read back (the experts lit while reading a word are the ones that wrote the next; `last` is the
// final word written, which nothing read). Anything that writes this shape can be played: this Lab, or a rented card.
// The name, in one place: the short one for tabs and titles, the long one where there's room.
export const NAME = 'aiFEUI', LONG_NAME = 'aiFunctional Expert Utilization Imager';
export const FORMAT = 'bob-expert-recording';
export const VERSION = 1;
export const MAX_CLIPS = 200, MAX_WORDS = 400, MAX_LAYERS = 400, MAX_EXPERTS = 4096, MAX_SKILLS = 16;

// One colour and one letter for each skill, so nobody needs the colours alone. The colours hold up on dark and light
// and for the common kinds of colour blindness (Okabe and Ito's set, plus more that stay apart from them, and every skill has its own letter).
export const SKILL_LOOKS = [
  ['#E69F00', 'A'], ['#56B4E9', 'B'], ['#009E73', 'C'], ['#F0E442', 'D'], ['#CC79A7', 'E'], ['#D55E00', 'F'],
  ['#0072B2', 'G'], ['#9B8CFF', 'H'], ['#7BD88F', 'I'], ['#FF8A80', 'J'], ['#B0BEC5', 'K'], ['#A1887F', 'L'],
  ['#00C2C7', 'M'], ['#C5E063', 'N'], ['#E06FE0', 'O'], ['#FFC9A8', 'P']
];
// A viewer can give a skill its own colour (the letter stays). Kept for this window only; '' or a bad value puts
// the usual colour back.
const ownColours = new Map();
export const lookOf = (i) => { const [c, l] = SKILL_LOOKS[i % SKILL_LOOKS.length]; return [ownColours.get(i) || c, l]; };
export function setColour(i, hex) { if (/^#[0-9a-f]{6}$/i.test(String(hex || ''))) ownColours.set(i, String(hex).toLowerCase()); else ownColours.delete(i); }
export function resetColours() { ownColours.clear(); }

const int = (n, max) => Number.isInteger(n) && n >= 0 && n < max;
const text = (s, n) => String(s ?? '').slice(0, n);

// Read a recording from anywhere (this Bob, a file someone hands you) into a clean one, or throw in plain words.
// Nothing in it is trusted: sizes are capped, ids are checked, text is cut to length.
export function cleanRecording(j) {
  if (!j || typeof j !== 'object' || j.format !== FORMAT) throw new Error('That isn\'t an expert recording from Bob\'s Lab.');
  if (Number(j.version) !== VERSION) throw new Error('That recording was made by a newer Bob. Update this one to play it.');
  const experts = Number(j.brain?.experts), layers = Number(j.brain?.layers);
  if (!int(experts - 1, MAX_EXPERTS) || !int(layers - 1, MAX_LAYERS)) throw new Error('That recording doesn\'t say how many experts and layers the brain has.');
  const skills = (Array.isArray(j.skills) ? j.skills : []).slice(0, MAX_SKILLS).map((s) => ({ id: text(s?.id, 40), label: text(s?.label || s?.id, 60) })).filter((s) => s.id);
  if (!skills.length) throw new Error('That recording has no skills in it.');
  const ids = new Set(skills.map((s) => s.id));
  const clips = [];
  for (const c of (Array.isArray(j.clips) ? j.clips : []).slice(0, MAX_CLIPS)) {
    if (!ids.has(c?.skill) || !Array.isArray(c.e) || !Array.isArray(c.words)) continue;
    const n = Math.min(c.e.length, c.words.length, MAX_WORDS);
    const e = [];
    for (let w = 0; w < n; w++) {
      const row = Array.isArray(c.e[w]) ? c.e[w] : [];
      e.push(Array.from({ length: layers }, (_, l) => (Array.isArray(row[l]) ? row[l].filter((x) => int(x, experts)).slice(0, 64) : [])));
    }
    if (!n) continue;
    clips.push({ skill: c.skill, question: text(c.question, 500), answer: text(c.answer, 4000), prompt: Math.max(0, Math.min(n, Number(c.prompt) || 0)), words: c.words.slice(0, n).map((w) => text(w, 80)), e, last: text(c.last, 80) });
  }
  if (!clips.length) throw new Error('That recording has no questions in it.');
  return { format: FORMAT, version: VERSION, id: text(j.id, 80), name: text(j.name, 120), when: text(j.when, 20), engine: text(j.engine, 60), brain: { name: text(j.brain?.name, 120), experts, layers, used: Math.max(0, Math.min(64, Number(j.brain?.used) || 0)), kind: j.brain?.kind === 'neurons' ? 'neurons' : 'experts', neurons: Math.max(0, Math.min(1e7, Math.floor(Number(j.brain?.neurons) || 0))) }, skills, clips };
}

// Which skill each expert leans to. For every skill, how often each expert was picked per word of that skill (so a
// skill with longer answers doesn't win by size); an expert's skill is the one with the highest rate, and its
// strength is how far that is above an even split: 0 = every skill uses it alike, 1 = only this skill ever did
// (and it was picked often enough to trust that).
// Returns { top[l][e] = skill index or -1 (never picked), strength[l][e], share[l][e][s], picks[l][e], words[s],
//           per skill: { leans, mostly }, blend (0-100: how alike the skills' experts are), used, total }.
export const LEANS = 0.15, MOSTLY = 0.5;
export function specialise(rec) {
  const S = rec.skills.length, L = rec.brain.layers, E = rec.brain.experts;
  const idx = new Map(rec.skills.map((s, i) => [s.id, i]));
  const count = Array.from({ length: L }, () => Array.from({ length: E }, () => new Array(S).fill(0)));
  const words = new Array(S).fill(0);
  for (const c of rec.clips) {
    const s = idx.get(c.skill); if (s === undefined) continue;
    words[s] += c.e.length;
    for (const row of c.e) for (let l = 0; l < L; l++) for (const x of row[l] || []) count[l][x][s]++;
  }
  const top = [], strength = [], share = [], picks = [];
  const per = rec.skills.map(() => ({ leans: 0, mostly: 0 }));
  let used = 0, sumStrength = 0, sumPicks = 0;
  for (let l = 0; l < L; l++) {
    const tl = [], sl = [], shl = [], pl = [];
    for (let e = 0; e < E; e++) {
      const c = count[l][e];
      const rates = c.map((n, s) => (words[s] ? n / words[s] : 0));
      const sum = rates.reduce((a, b) => a + b, 0), n = c.reduce((a, b) => a + b, 0);
      if (!n || !sum) { tl.push(-1); sl.push(0); shl.push(null); pl.push(0); continue; }
      let best = 0; for (let s = 1; s < S; s++) if (rates[s] > rates[best]) best = s;
      const sh = rates.map((r) => r / sum);
      // an expert picked only a handful of times looks one-sided by luck, so few picks pull the strength down
      const st = S > 1 ? Math.max(0, (sh[best] - 1 / S) / (1 - 1 / S)) * (n / (n + 4 * S)) : 0;
      tl.push(best); sl.push(st); shl.push(sh); pl.push(n);
      used++; sumStrength += st * n; sumPicks += n;
      if (st >= LEANS) per[best].leans++;
      if (st >= MOSTLY) per[best].mostly++;
    }
    top.push(tl); strength.push(sl); share.push(shl); picks.push(pl);
  }
  const blend = sumPicks ? Math.round(100 * (1 - sumStrength / sumPicks)) : 0;
  return { top, strength, share, picks, words, per, blend, used, total: L * E };
}

// The recording as one line of time: every word of every clip, in order. frames[i] = { clip, word }.
export function timeline(rec, { skills = null } = {}) {
  const frames = [];
  rec.clips.forEach((c, ci) => { if (skills && !skills.has(c.skill)) return; for (let w = 0; w < c.e.length; w++) frames.push({ clip: ci, word: w }); });
  return frames;
}

// What the page says under the picture, so the colours are never the only way to know.
export function inWords(rec, sp) {
  const S = rec.skills.length;
  const lines = [`${sp.used.toLocaleString()} of ${sp.total.toLocaleString()} experts were picked at least once; ${(sp.total - sp.used).toLocaleString()} never were for these questions.`];
  lines.push(sp.blend >= 80 ? `The skills share most of their experts (${sp.blend}% alike). That's normal: experts split work by word pattern more than by topic, so the colours are faint.`
    : sp.blend >= 50 ? `The skills share a lot of their experts (${sp.blend}% alike), with some that lean to one skill.`
      : `The skills use fairly different experts here (${sp.blend}% alike).`);
  rec.skills.forEach((s, i) => { lines.push(`${lookOf(i)[1]}, ${s.label}: ${sp.per[i].leans.toLocaleString()} experts lean to it, ${sp.per[i].mostly.toLocaleString()} of them strongly. ${sp.words[i].toLocaleString()} words read.`); });
  if (S < 2) lines.push('With one skill there is nothing to compare, so every expert it used gets its colour.');
  if (!isNeurons(rec)) return lines;
  return [`This brain isn't a mixture-of-experts one, so the scan lights groups of neurons: every layer's ${rec.brain.neurons ? rec.brain.neurons.toLocaleString() + ' ' : ''}hidden neurons are cut into ${rec.brain.experts} equal groups of neighbours, and the ${rec.brain.used} busiest light up for each word. The groups are a way of slicing, not parts the brain itself knows about.`, ...lines.map((l) => say(rec, l))];
}

// One expert up close: how its picks split between the skills, and the words it was picked for most.
export function expertDetail(rec, sp, l, e, { max = 12 } = {}) {
  const seen = new Map();
  for (const c of rec.clips) c.e.forEach((row, w) => { if ((row[l] || []).includes(e)) { const t = c.words[w].trim() || c.words[w]; seen.set(t, (seen.get(t) || 0) + 1); } });
  const words = [...seen.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).slice(0, max).map(([text_, n]) => ({ text: text_, n }));
  const sh = sp.share[l]?.[e];
  return { layer: l, expert: e, picks: sp.picks[l]?.[e] || 0, top: sp.top[l]?.[e] ?? -1, strength: sp.strength[l]?.[e] || 0, shares: sh ? sh.map((v, s) => ({ skill: s, pct: Math.round(100 * v) })).sort((a, b) => b.pct - a.pct) : [], words };
}

// Where each block sits. `side` = experts along one edge of a layer's slab (a square as near as it gets).
export const sideOf = (experts) => Math.ceil(Math.sqrt(experts));

// Which part of a clip a word belongs to, for the subtitles: 'question' (the brain is reading what was asked),
// 'thinking' (its own thoughts, between the think markers, when the scan let it think) or 'answer'.
// Returns { part, from } where `from` is the first word of that part.
const THINK_ON = /<think>/i, THINK_OFF = /<\/think>/i;
export function partOf(clip, w) {
  if (w < clip.prompt) return { part: 'question', from: 0 };
  let part = 'answer', from = clip.prompt;
  for (let i = clip.prompt; i <= w && i < clip.words.length; i++) {
    if (THINK_OFF.test(clip.words[i])) { part = 'answer'; from = i + 1; if (i === w) return { part: 'thinking', from: w }; }
    else if (THINK_ON.test(clip.words[i])) { part = 'thinking'; from = i + 1; }
  }
  return { part, from: Math.min(from, w) };
}
export const PART_LABEL = { question: 'Question', thinking: 'Thinking', answer: 'Answer' };

// A brain without experts is scanned by groups of neighbouring neurons instead (brain.kind 'neurons'): each layer's
// hidden neurons cut into equal runs, the busiest few lit for every word. The viewer is the same; only the words
// change. say(rec, text) turns a sentence written about experts into one about neuron groups.
export const isNeurons = (rec) => rec?.brain?.kind === 'neurons';
export function say(rec, s) {
  if (!isNeurons(rec)) return s;
  const B = '(?<![-\\w=.#])', A = '(?![-\\w=])'; // never inside a class, an id or an attribute
  const r = (from, to) => { s = s.replace(new RegExp(B + from + A, 'g'), to); };
  s = String(s);
  r('Not experts', 'Other parts'); r('not experts', 'not these neurons'); r('Not an expert', 'Not a neuron group'); r('the router that picks experts', 'the router');
  r('an expert', 'a neuron group'); r('An expert', 'A neuron group');
  r('Experts', 'Neuron groups'); r('experts', 'neuron groups'); r('Expert', 'Neuron group'); r('expert', 'neuron group');
  return s;
}

// Trying a cut. off[l] = the set of experts turned off on floor l: the ones whose skill is unticked (skills = a set
// of skill indexes), the never-picked ones (never = true), and all but the busiest keepN on each floor (keepN > 0).
// A floor always keeps at least as many experts as the brain picks for a word (the busiest), as the engine does.
export function cutOf(rec, sp, { skills = new Set(), never = false, keepN = 0 } = {}) {
  const E = rec.brain.experts, min = Math.max(1, rec.brain.used || 1);
  return sp.picks.map((pl, l) => {
    const byUse = pl.map((n, e) => [n, e]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, e]) => e);
    const off = new Set();
    for (let e = 0; e < E; e++) { const top = sp.top[l][e]; if (top < 0 ? never : skills.has(top)) off.add(e); }
    if (keepN > 0) byUse.slice(Math.max(min, keepN)).forEach((e) => off.add(e));
    for (const e of byUse) { if (E - off.size >= min) break; off.delete(e); }
    return off;
  });
}
// What that cut would take away, counted on this recording: every pick that went to an expert now turned off.
// { off, total, picks, lost, pct, per: [{ picks, lost, pct } per skill] }. A real brain would pick its next best
// experts instead, so this says how much it leaned on them, not how much worse it would get.
export function cutEffect(rec, off) {
  const idx = new Map(rec.skills.map((s, i) => [s.id, i]));
  const per = rec.skills.map(() => ({ picks: 0, lost: 0, pct: 0 }));
  let picks = 0, lost = 0;
  for (const c of rec.clips) {
    const p = per[idx.get(c.skill)]; if (!p) continue;
    for (const row of c.e) for (let l = 0; l < row.length; l++) for (const x of row[l]) { p.picks++; picks++; if (off[l]?.has(x)) { p.lost++; lost++; } }
  }
  per.forEach((p) => { p.pct = p.picks ? Math.round((100 * p.lost) / p.picks) : 0; });
  return { off: off.reduce((a, s) => a + s.size, 0), total: rec.brain.layers * rec.brain.experts, picks, lost, pct: picks ? Math.round((100 * lost) / picks) : 0, per };
}
// The cut as the engine takes it: the experts kept on each floor.
export const keepList = (rec, off) => off.map((s) => { const k = []; for (let e = 0; e < rec.brain.experts; e++) if (!s.has(e)) k.push(e); return k; });

// The small cube in Bob's thinking. liveTrace: one reply's trace from Brain Engine, cut down to what the cube plays
// (the end of what Bob read, then everything he wrote), so a long chat doesn't send megabytes to the page.
export const LIVE_PROMPT = 32, LIVE_WORDS = 400, LIVE_CLIPS = 6;
export function liveTrace(raw, { keepPrompt = LIVE_PROMPT, max = LIVE_WORDS } = {}) {
  if (!raw || !Array.isArray(raw.rows) || !raw.rows.length) return null;
  const P = Math.max(0, Math.min(raw.rows.length, Number(raw.n_prompt) || 0));
  const from = Math.max(0, P - keepPrompt);
  const rows = raw.rows.slice(from, from + max);
  return { kind: raw.kind === 'neurons' ? 'neurons' : 'experts', experts: Number(raw.n_expert) || 0, layers: Number(raw.n_layer) || 0, used: Number(raw.n_expert_used) || 0, neurons: Number(raw.n_ff) || 0,
    prompt: Math.min(rows.length, P - from), words: rows.map((r) => String(r?.t ?? '').slice(0, 80)), e: rows.map((r) => (Array.isArray(r?.e) ? r.e : [])), last: String(raw.last ?? '').slice(0, 80) };
}
// The cube's recording: Bob's last few replies as clips of one "skill". null when there is nothing to show.
export function liveRecording(traces, name = 'Bob') {
  const last = traces[traces.length - 1]; if (!last || !last.experts || !last.layers) return null;
  const same = traces.filter((t) => t.experts === last.experts && t.layers === last.layers && t.kind === last.kind).slice(-LIVE_CLIPS);
  try {
    return cleanRecording({ format: FORMAT, version: VERSION, id: 'live', name, brain: { name, experts: last.experts, layers: last.layers, used: last.used, kind: last.kind, neurons: last.neurons },
      skills: [{ id: 'reply', label: 'Bob\'s replies' }], clips: same.map((t) => ({ skill: 'reply', question: 'What Bob just read and wrote', answer: '', prompt: t.prompt, words: t.words, e: t.e, last: t.last })) });
  } catch { return null; }
}
