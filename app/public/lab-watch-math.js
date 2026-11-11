// 🧪 Computer Science Lab, Playground: FNRI. The sums, shared by the page (it plays a recording with no
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
export const NAME = 'FNRI', LONG_NAME = 'Functional Neural Response Imager';
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
    // a (optional): how hard each layer worked for each word, for Floors only
    const a = Array.isArray(c.a) && c.a.length >= n ? c.a.slice(0, n).map((row) => Array.from({ length: layers }, (_, l) => { const v = Number(Array.isArray(row) ? row[l] : 0); return Number.isFinite(v) && v > 0 ? v : 0; })) : null;
    clips.push({ skill: c.skill, question: text(c.question, 500), answer: text(c.answer, 4000), prompt: Math.max(0, Math.min(n, Number(c.prompt) || 0)), words: c.words.slice(0, n).map((w) => text(w, 80)), e, last: text(c.last, 80), ...(a ? { a } : {}) });
  }
  if (!clips.length) throw new Error('That recording has no questions in it.');
  return { format: FORMAT, version: VERSION, id: text(j.id, 80), name: text(j.name, 120), when: text(j.when, 20), engine: text(j.engine, 60), brain: { name: text(j.brain?.name, 120), experts, layers, used: Math.max(0, Math.min(64, Number(j.brain?.used) || 0)), kind: ['neurons', 'heads'].includes(j.brain?.kind) ? j.brain.kind : 'experts', neurons: Math.max(0, Math.min(1e7, Math.floor(Number(j.brain?.neurons) || 0))) }, skills, clips };
}

// Which skill each expert leans to. For every skill, how often each expert was picked per word of that skill (so a
// skill with longer answers doesn't win by size); an expert's skill is the one with the highest rate, and its
// strength is how far that is above an even split: 0 = every skill uses it alike, 1 = only this skill ever did
// (and it was picked often enough to trust that).
// Returns { top[l][e] = skill index or -1 (never picked), strength[l][e], share[l][e][s], picks[l][e], words[s],
//           per skill: { leans, mostly }, blend (0-100: how alike the skills' experts are), used, total,
//           even[l][e] = every skill uses it about alike AND it was picked often enough to say so (an all-rounder,
//           not a rarely used one), evens = how many }.
export const LEANS = 0.15, MOSTLY = 0.5, EVEN_PICKS = 4; // an all-rounder was picked at least EVEN_PICKS times per skill
export function specialise(rec) {
  const S = rec.skills.length, L = rec.brain.layers, E = rec.brain.experts;
  const idx = new Map(rec.skills.map((s, i) => [s.id, i]));
  const count = Array.from({ length: L }, () => Array.from({ length: E }, () => new Array(S).fill(0)));
  const words = new Array(S).fill(0);
  for (const c of rec.clips) {
    const s0 = idx.get(c.skill); if (s0 === undefined) continue;
    // c.by (optional): a skill for every word instead of one for the clip; the patterns Bob finds use it
    c.e.forEach((row, w) => { const s = c.by ? c.by[w] : s0; words[s]++; for (let l = 0; l < L; l++) for (const x of row[l] || []) count[l][x][s]++; });
  }
  const top = [], strength = [], share = [], picks = [], even = [];
  const per = rec.skills.map(() => ({ leans: 0, mostly: 0 }));
  let used = 0, sumStrength = 0, sumPicks = 0, evens = 0;
  for (let l = 0; l < L; l++) {
    const tl = [], sl = [], shl = [], pl = [], el = [];
    for (let e = 0; e < E; e++) {
      const c = count[l][e];
      const rates = c.map((n, s) => (words[s] ? n / words[s] : 0));
      const sum = rates.reduce((a, b) => a + b, 0), n = c.reduce((a, b) => a + b, 0);
      if (!n || !sum) { tl.push(-1); sl.push(0); shl.push(null); pl.push(0); el.push(false); continue; }
      let best = 0; for (let s = 1; s < S; s++) if (rates[s] > rates[best]) best = s;
      const sh = rates.map((r) => r / sum);
      // an expert picked only a handful of times looks one-sided by luck, so few picks pull the strength down
      const raw = S > 1 ? Math.max(0, (sh[best] - 1 / S) / (1 - 1 / S)) : 0;
      const st = raw * (n / (n + 4 * S));
      const ev = S > 1 && raw < LEANS && n >= EVEN_PICKS * S; el.push(ev); if (ev) evens++;
      tl.push(best); sl.push(st); shl.push(sh); pl.push(n);
      used++; sumStrength += st * n; sumPicks += n;
      if (st >= LEANS) per[best].leans++;
      if (st >= MOSTLY) per[best].mostly++;
    }
    top.push(tl); strength.push(sl); share.push(shl); picks.push(pl); even.push(el);
  }
  const blend = sumPicks ? Math.round(100 * (1 - sumStrength / sumPicks)) : 0;
  return { top, strength, share, picks, words, per, blend, used, total: L * E, even, evens, count };
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
  lines.push(sp.blend >= 80 ? (isNeurons(rec) ? `The skills share most of their experts (${sp.blend}% alike), so the colours are faint.` : `The skills share most of their experts (${sp.blend}% alike). That's normal: experts split work by word pattern more than by topic, so the colours are faint.`)
    : sp.blend >= 50 ? `The skills share a lot of their experts (${sp.blend}% alike), with some that lean to one skill.`
      : `The skills use fairly different experts here (${sp.blend}% alike).`);
  rec.skills.forEach((s, i) => { lines.push(`${lookOf(i)[1]}, ${s.label}: ${sp.per[i].leans.toLocaleString()} experts lean to it, ${sp.per[i].mostly.toLocaleString()} of them strongly. ${sp.words[i].toLocaleString()} words read.`); });
  if (sp.evens) lines.push(`${sp.evens.toLocaleString()} experts are all-rounders: every skill used them about alike, and often. They have a dashed white outline. A faint expert with no outline was only picked a few times.`);
  if (S < 2) lines.push('With one skill there is nothing to compare, so every expert it used gets its colour.');
  if (isHeads(rec)) return [`This scan lights attention heads: the parts of each layer that decide which earlier words to look at. Every layer has ${rec.brain.experts} of them, and the ${rec.brain.used} busiest light up for each word. They are real parts of the brain, so a colour here means that head works hardest for that skill.`, ...lines.map((l) => say(rec, l))];
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
export const isHeads = (rec) => rec?.brain?.kind === 'heads'; // any brain, scanned by its attention heads
export function say(rec, s) {
  if (isHeads(rec)) {
    const B = '(?<![-\\w=.#])', A = '(?![-\\w=])';
    const r = (from, to) => { s = s.replace(new RegExp(B + from + A, 'g'), to); };
    s = String(s);
    // in a heads scan attention is what lights, so the grey is the feed-forward layers, the tuning rows and the word tables
    r('Attention, the router, the tuning rows', 'The feed-forward layers, the tuning rows'); r('attention, the router and the tuning rows', 'the feed-forward layers and the tuning rows');
    r('Not experts', 'Other parts'); r('not experts', 'not attention heads'); r('Not an expert', 'Not an attention head'); r('the router that picks experts', 'the router');
    r('an expert', 'an attention head'); r('An expert', 'An attention head');
    r('Experts', 'Attention heads'); r('experts', 'attention heads'); r('Expert', 'Attention head'); r('expert', 'attention head');
    return s;
  }
  if (!isNeurons(rec)) return s;
  const B = '(?<![-\\w=.#])', A = '(?![-\\w=])'; // never inside a class, an id or an attribute
  const r = (from, to) => { s = s.replace(new RegExp(B + from + A, 'g'), to); };
  s = String(s);
  r('Attention, the router, the tuning rows', 'Attention, the tuning rows'); r('attention, the router and the tuning rows', 'attention and the tuning rows');
  r('Not experts', 'Other parts'); r('not experts', 'not in the neuron groups'); r('Not an expert', 'Not a neuron group'); r('the router that picks experts', 'the router');
  r('an expert', 'a neuron group'); r('An expert', 'A neuron group');
  r('Experts', 'Neuron groups'); r('experts', 'neuron groups'); r('Expert', 'Neuron group'); r('expert', 'neuron group');
  return s;
}

// Trying a cut. off[l] = the set of experts turned off on floor l: the ones whose skill is unticked (skills = a set
// of skill indexes), the never-picked ones (never = true), and all but the busiest keepN on each floor (keepN > 0).
// A floor always keeps at least as many experts as the brain picks for a word (the busiest), as the engine does.
// cover (0.9, 0.95, 0.99) is the Lab's own cut instead of keepN: see coverKeep.
export function cutOf(rec, sp, { skills = new Set(), never = false, keepN = 0, cover = 0 } = {}) {
  const E = rec.brain.experts, min = Math.max(1, rec.brain.used || 1);
  const kept = cover ? coverKeep(rec, sp, cover).keep : null;
  return sp.picks.map((pl, l) => {
    if (kept) { const off = new Set(); for (let e = 0; e < E; e++) if (!kept[l].has(e)) off.add(e); return off; }
    const byUse = pl.map((n, e) => [n, e]).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, e]) => e);
    const off = new Set();
    for (let e = 0; e < E; e++) { const top = sp.top[l][e]; if (top < 0 ? never : skills.has(top)) off.add(e); }
    if (keepN > 0) byUse.slice(Math.max(min, keepN)).forEach((e) => off.add(e));
    for (const e of byUse) { if (E - off.size >= min) break; off.delete(e); }
    return off;
  });
}
// The cut the Lab makes ("keep what every skill needs", src/lab-gguf.js coverageKeep), worked out on this scan's
// counts: on each floor, for each skill, the busiest experts that carry `cover` of that skill's picks; all the skills'
// lists together; then every floor brought to one size K (the biggest list) by overall use, every skill weighing the
// same. So it removes a mixture: the experts no skill leans on much, whatever their colour. { keep: [Set per floor], K }.
export const COVERS = [0.99, 0.95, 0.9];
export function coverKeep(rec, sp, cover = 0.95) {
  const S = rec.skills.length, E = rec.brain.experts, L = rec.brain.layers, min = Math.max(1, rec.brain.used || 1);
  const unions = [], overall = [];
  for (let l = 0; l < L; l++) {
    const u = new Set(), o = new Array(E).fill(0);
    for (let s = 0; s < S; s++) {
      let t = 0; for (let e = 0; e < E; e++) t += sp.count[l][e][s];
      if (!t) continue;
      const order = []; for (let e = 0; e < E; e++) { const v = sp.count[l][e][s]; o[e] += v / t; order.push([v, e]); }
      order.sort((a, b) => b[0] - a[0] || a[1] - b[1]);
      let sum = 0; for (const [v, e] of order) { u.add(e); sum += v; if (sum / t >= cover) break; }
    }
    unions.push(u); overall.push(o);
  }
  const K = Math.min(E, Math.max(min, ...unions.map((u) => u.size)));
  const keep = unions.map((u, l) => {
    const byUse = (a, b) => overall[l][b] - overall[l][a] || a - b;
    let ids = [...u];
    if (ids.length > K) ids = ids.sort(byUse).slice(0, K);
    else for (const e of Array.from({ length: E }, (_, i) => i).sort(byUse)) { if (ids.length >= K) break; if (!u.has(e)) ids.push(e); }
    return new Set(ids);
  });
  return { keep, K };
}
// The sizes the Lab's plain cut offers for a brain (src/lab.js cutSizes): how many experts to keep on each floor.
export const cutSteps = (experts, used) => [0.75, 0.6, 0.5, 0.4, 0.3, 0.25].map((x) => Math.max(used || 1, Math.round((experts * x) / 8) * 8)).filter((n, i, a) => n < experts && a.indexOf(n) === i);
// What that cut would take away, counted on this recording: every pick that went to an expert now turned off.
// { off, total, picks, lost, pct, per: [{ picks, lost, pct } per skill] }. A real brain would pick its next best
// experts instead, so this says how much it leaned on them, not how much worse it would get.
export function cutEffect(rec, off) {
  const idx = new Map(rec.skills.map((s, i) => [s.id, i]));
  const per = rec.skills.map(() => ({ picks: 0, lost: 0, pct: 0 }));
  let picks = 0, lost = 0;
  for (const c of rec.clips) {
    const p0 = per[idx.get(c.skill)]; if (!p0) continue;
    c.e.forEach((row, w) => { const p = c.by ? per[c.by[w]] : p0; for (let l = 0; l < row.length; l++) for (const x of row[l]) { p.picks++; picks++; if (off[l]?.has(x)) { p.lost++; lost++; } } });
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

// The colours of a scan, small enough to send to the small cube: which skill each expert leans to, how strongly
// (0-100) and which are all-rounders. skillMap makes it from a recording; mapLook turns it back into what the
// drawing reads. null when the map is not for a brain of this shape.
export function skillMap(rec, sp = specialise(rec)) {
  return { experts: rec.brain.experts, layers: rec.brain.layers, kind: rec.brain.kind || 'experts', name: rec.name || '', skills: rec.skills.map((s) => ({ id: s.id, label: s.label })),
    top: sp.top, strength: sp.strength.map((r) => r.map((v) => Math.round(v * 100))), even: sp.even.map((r) => r.map((v) => (v ? 1 : 0))) };
}
export function mapLook(map, { experts, layers, kind = 'experts' }) {
  if (!map || map.experts !== experts || map.layers !== layers || (map.kind || 'experts') !== kind || !Array.isArray(map.skills) || !map.skills.length || map.skills.length > MAX_SKILLS) return null;
  const ok = (a) => Array.isArray(a) && a.length === layers && a.every((r) => Array.isArray(r) && r.length === experts);
  if (!ok(map.top) || !ok(map.strength) || !ok(map.even)) return null;
  const S = map.skills.length;
  return { skills: map.skills.map((s) => ({ id: String(s.id), label: String(s.label).slice(0, 60) })),
    sp: { top: map.top.map((r) => r.map((v) => (Number.isInteger(v) && v >= 0 && v < S ? v : -1))), strength: map.strength.map((r) => r.map((v) => Math.max(0, Math.min(1, (Number(v) || 0) / 100)))), even: map.even.map((r) => r.map(Boolean)) } };
}
// What the experts lit for one word are for, in words: [{ label, n }] busiest first, and how many are all-rounders.
export function litSkills(look, row) {
  const n = new Array(look.skills.length).fill(0); let evens = 0, never = 0;
  row.forEach((ids, l) => { for (const e of ids || []) { const t = look.sp.top[l]?.[e] ?? -1; if (t < 0) never++; else if (look.sp.even[l][e]) evens++; else n[t]++; } });
  return { skills: n.map((c, i) => ({ label: look.skills[i].label, n: c })).filter((x) => x.n).sort((a, b) => b.n - a.n), evens, never };
}

// ---- two more ways to look, both worked out here from the scan itself (no helper to train, nothing to rent) ----

// Floors only: how hard each floor worked for each word, 0 to 1, each floor against its own usual range (so a floor
// that is always loud doesn't drown the rest). null when the scan has no such numbers (an experts scan).
// floorScale(rec) -> { lo[l], hi[l] }; floorsAt(rec, scale, clip, word) -> [0..1 per floor].
export const hasFloors = (rec) => Boolean(rec?.clips?.length) && rec.clips.every((c) => Array.isArray(c.a));
export function floorScale(rec) {
  if (!hasFloors(rec)) return null;
  const L = rec.brain.layers, lo = [], hi = [];
  for (let l = 0; l < L; l++) {
    const v = []; for (const c of rec.clips) for (const row of c.a) if (row[l] > 0) v.push(row[l]);
    v.sort((a, b) => a - b);
    lo.push(v.length ? v[Math.floor(v.length * 0.05)] : 0); hi.push(v.length ? v[Math.min(v.length - 1, Math.floor(v.length * 0.95))] : 0);
  }
  return { lo, hi };
}
export function floorsAt(rec, scale, clip, word) {
  const row = rec.clips[clip]?.a?.[word]; if (!row || !scale) return null;
  return row.map((v, l) => (scale.hi[l] > scale.lo[l] ? Math.max(0, Math.min(1, (v - scale.lo[l]) / (scale.hi[l] - scale.lo[l]))) : v > 0 ? 0.5 : 0));
}

// Patterns Bob found: words that light the same blocks are put together, with nobody telling Bob what the groups
// should be. Every word is the set of blocks it lit; the words are sorted into k groups (k-means on those sets,
// rarer blocks counting for more), and each group is named by the words most its own. The answer is a copy of the
// recording whose "skills" are the patterns, with a pattern for every word (clip.by), so the rest of the viewer
// (colours, all-rounders, cuts) works on it unchanged. Always the same answer for the same recording.
export const PATTERN_CHOICES = [6, 8, 12, 16], PATTERN_DEFAULT = 8, PATTERN_SAMPLE = 6000, PATTERN_ROUNDS = 10;
export function findPatterns(rec, { k = PATTERN_DEFAULT } = {}) {
  const L = rec.brain.layers, E = rec.brain.experts, U = L * E;
  const all = []; // [clip, word]
  rec.clips.forEach((c, ci) => { for (let w = 0; w < c.e.length; w++) all.push([ci, w]); });
  const N = all.length; k = Math.max(2, Math.min(MAX_SKILLS, k, N));
  const units = (ci, w) => { const out = []; const row = rec.clips[ci].e[w]; for (let l = 0; l < L; l++) for (const x of row[l]) out.push(l * E + x); return out; };
  // rarer blocks say more about a word than the ones every word lights
  const df = new Float32Array(U); for (const [ci, w] of all) for (const u of units(ci, w)) df[u]++;
  const idf = new Float32Array(U); for (let u = 0; u < U; u++) idf[u] = df[u] ? Math.log(1 + N / df[u]) : 0;
  const step = Math.max(1, Math.ceil(N / PATTERN_SAMPLE));
  const sample = []; for (let i = 0; i < N; i += step) sample.push(all[i]);
  const su = sample.map(([ci, w]) => units(ci, w));
  const norm = su.map((us) => Math.sqrt(us.reduce((a, u) => a + idf[u] * idf[u], 0)) || 1);
  const cents = [];
  const sim = (c, us, n) => { let s = 0; for (const u of us) s += c[u] * idf[u]; return s / n; };
  const centOf = (members) => { const c = new Float32Array(U); for (const i of members) for (const u of su[i]) c[u] += idf[u] / norm[i]; let n = 0; for (let u = 0; u < U; u++) n += c[u] * c[u]; n = Math.sqrt(n) || 1; for (let u = 0; u < U; u++) c[u] /= n; return c; };
  // start: the first word, then each time the word least like every centre so far
  cents.push(centOf([0]));
  const best = new Float32Array(sample.length).fill(-1);
  while (cents.length < k) {
    const c = cents[cents.length - 1]; let far = 0;
    for (let i = 0; i < sample.length; i++) { best[i] = Math.max(best[i], sim(c, su[i], norm[i])); if (best[i] < best[far]) far = i; }
    cents.push(centOf([far]));
  }
  const assign = new Int32Array(sample.length);
  for (let round = 0; round < PATTERN_ROUNDS; round++) {
    let moved = 0; const groups = Array.from({ length: k }, () => []);
    for (let i = 0; i < sample.length; i++) { let b = 0, bs = -1; for (let j = 0; j < k; j++) { const s = sim(cents[j], su[i], norm[i]); if (s > bs) { bs = s; b = j; } } if (assign[i] !== b) moved++; assign[i] = b; groups[b].push(i); }
    for (let j = 0; j < k; j++) if (groups[j].length) cents[j] = centOf(groups[j]);
    if (!moved && round) break;
  }
  // every word gets its pattern; biggest pattern first
  const by = rec.clips.map((c) => new Array(c.e.length).fill(0)), size = new Array(k).fill(0);
  for (const [ci, w] of all) { const us = units(ci, w); const n = Math.sqrt(us.reduce((a, u) => a + idf[u] * idf[u], 0)) || 1; let b = 0, bs = -1; for (let j = 0; j < k; j++) { const s = sim(cents[j], us, n); if (s > bs) { bs = s; b = j; } } by[ci][w] = b; size[b]++; }
  const order = size.map((n, j) => [n, j]).filter(([n]) => n).sort((a, b) => b[0] - a[0] || a[1] - b[1]).map(([, j]) => j);
  const rank = new Map(order.map((j, i) => [j, i]));
  // a name from the words most its own: often in this pattern, seldom in the others
  const tidy = (t) => String(t).replace(/\s+/g, ' ').trim().slice(0, 16);
  const total = new Map(), per = order.map(() => new Map());
  for (const [ci, w] of all) { const t = tidy(rec.clips[ci].words[w]); if (!t) continue; total.set(t, (total.get(t) || 0) + 1); const m = per[rank.get(by[ci][w])]; m.set(t, (m.get(t) || 0) + 1); }
  const skills = order.map((j, i) => {
    const top = [...per[i].entries()].map(([t, n]) => [n * (n / total.get(t)), t, n]).sort((a, b) => b[0] - a[0] || (a[1] < b[1] ? -1 : 1)).slice(0, 3).map(([, t]) => t);
    return { id: `p${i}`, label: `Pattern ${i + 1}${top.length ? `: ${top.join(' · ')}` : ''}`.slice(0, 60), words: size[j] };
  });
  const clips = rec.clips.map((c, ci) => { const b = by[ci].map((j) => rank.get(j)); const n = new Array(skills.length).fill(0); for (const x of b) n[x]++; let m = 0; for (let i = 1; i < n.length; i++) if (n[i] > n[m]) m = i; return { ...c, skill: skills[m].id, by: b }; });
  return { ...rec, skills: skills.map(({ id, label }) => ({ id, label })), clips, patterns: skills };
}

// ---- Load in, load out ----
// The block builds itself voxel by voxel when a brain or a recording loads, and takes itself apart the same way when
// it goes. The order is the person's pick, named after the ways a 3D printer lays plastic down. loadOrder gives every
// place in the block (floor f, cell i of a W x D floor: f * W * D + i) a number from 0 to 1: a voxel is drawn once
// the load has passed its number. 'none' is everything at once.
export const LOAD_STYLES = [['random', 'Random'], ['spiral', 'Archimedean spiral'], ['lines', 'Rectilinear'], ['rings', 'Concentric'], ['vase', 'Vase, then fill'], ['none', 'All at once']];
export const loadStyle = (s) => (LOAD_STYLES.some(([id]) => id === s) ? s : 'vase'); // Vase, then fill is the one Bob starts with (the owner's pick)
function seeded(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
// Vase, then fill: the inside rises like water poured in, its surface tipping one way then the other as it climbs and
// settling as it nears the top. slosh = how high the water must be (in floors) before this place is under it. The tip
// turns slower than the water climbs, so every column still fills from the bottom up (nothing floats).
export function slosh(f, x, z, W, D, floors) {
  const nx = W > 1 ? x / (W - 1) - 0.5 : 0, nz = D > 1 ? z / (D - 1) - 0.5 : 0, k = floors > 1 ? f / (floors - 1) : 0;
  const tip = Math.min(3, Math.max(1, floors * 0.12)) * (1 - 0.7 * k), turn = f * 0.45;
  return f + tip * (Math.cos(turn) * nx + Math.sin(turn) * 0.7 * nz) + 0.35 * Math.sin(nx * 9 + f * 0.9) * Math.cos(nz * 7 - f * 0.6) * (1 - 0.5 * k);
}
export function loadOrder(style, { W, D, floors, seed = 1 }) {
  const per = W * D, n = per * floors, rank = new Float32Array(n);
  style = loadStyle(style);
  if (style === 'none' || n < 1) return rank; // all 0: everything shows from the first moment
  const seq = []; // every place, in the order it appears
  const cx = (W - 1) / 2, cz = (D - 1) / 2;
  const ring = (i) => Math.min(i % W, W - 1 - (i % W), Math.floor(i / W), D - 1 - Math.floor(i / W)); // 0 = the outer wall
  const around = (i) => Math.atan2(Math.floor(i / W) - cz, (i % W) - cx);
  const snake = (f, cells) => { // back and forth in rows, turned a quarter on every other floor, the way a printer fills
    const key = (i) => { const x = i % W, z = Math.floor(i / W); return f % 2 ? [x, x % 2 ? D - 1 - z : z] : [z, z % 2 ? W - 1 - x : x]; };
    return cells.map((i) => [key(i), i]).sort((a, b) => a[0][0] - b[0][0] || a[0][1] - b[0][1]).map((p) => p[1]);
  };
  const cells = Array.from({ length: per }, (_, i) => i);
  if (style === 'random') {
    for (let i = 0; i < n; i++) seq.push(i);
    const r = seeded(seed); for (let i = n - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [seq[i], seq[j]] = [seq[j], seq[i]]; }
  } else if (style === 'spiral') { // each floor from its middle outward along r = theta / 2pi: one cell further out with every turn
    const key = (i) => { const r = Math.hypot((i % W) - cx, Math.floor(i / W) - cz), a = around(i) + Math.PI; return a + 2 * Math.PI * Math.max(0, Math.round(r - a / (2 * Math.PI))); };
    const one = cells.map((i) => [key(i), i]).sort((a, b) => a[0] - b[0]).map((p) => p[1]);
    for (let f = 0; f < floors; f++) for (const i of one) seq.push(f * per + i);
  } else if (style === 'lines') {
    for (let f = 0; f < floors; f++) for (const i of snake(f, cells)) seq.push(f * per + i);
  } else if (style === 'rings') { // each floor's outer wall first, then ring by ring to the middle
    const one = cells.map((i) => [ring(i), around(i), i]).sort((a, b) => a[0] - b[0] || a[1] - b[1]).map((p) => p[2]);
    for (let f = 0; f < floors; f++) for (const i of one) seq.push(f * per + i);
  } else { // vase: the outer wall alone, round and round to the top, then the inside poured in like water
    const wall = cells.filter((i) => ring(i) === 0).sort((a, b) => around(a) - around(b)), inside = cells.filter((i) => ring(i) > 0);
    for (let f = 0; f < floors; f++) for (const i of wall) seq.push(f * per + i);
    const pour = [];
    for (let f = 0; f < floors; f++) for (const i of inside) pour.push([slosh(f, i % W, Math.floor(i / W), W, D, floors), f * per + i]);
    pour.sort((a, b) => a[0] - b[0]); for (const p of pour) seq.push(p[1]);
  }
  seq.forEach((slot, k) => { rank[slot] = k / n; });
  return rank;
}

// ---- Dials: turn a part of the brain up or down ----
// A dial multiplies what one part adds: one expert or one attention head on a floor, a floor's whole attention, or a
// floor's whole feed-forward block (its experts together). 1 is as built, 0 is silent, 2 is twice as loud. It's the
// same as scaling that part's output weights, done live in Brain Engine: the brain's file is never changed.
// A dial: { kind: 'expert' | 'head' | 'attn' | 'ffn', layer, index (expert or head number; 0 for the floor kinds), scale }.
export const DIAL_KINDS = ['expert', 'head', 'attn', 'ffn'];
export const DIAL_MAX = 4, MAX_DIALS = 20000;
export const dialKey = (d) => `${d.kind}:${d.layer}:${d.kind === 'expert' || d.kind === 'head' ? d.index : 0}`;
export const dialScale = (v) => { const n = Number(v); return Number.isFinite(n) ? Math.round(Math.max(0, Math.min(DIAL_MAX, n)) * 100) / 100 : 1; };
// Checked and tidied: known kinds, whole numbers in range, one dial for each part (the last one wins), nothing left
// at 1. `experts` 0 = the brain has none, so expert dials are refused; head numbers are checked by Brain Engine,
// which knows how many heads each layer has.
export function cleanDials(list, { experts = 0, layers = 0 } = {}) {
  if (!Array.isArray(list)) throw new Error('Dials come as a list.');
  if (list.length > MAX_DIALS) throw new Error(`That's more than ${MAX_DIALS.toLocaleString()} dials.`);
  const by = new Map();
  for (const d of list) {
    const kind = String(d?.kind || ''), layer = Number(d?.layer), part = kind === 'expert' || kind === 'head', index = part ? Number(d?.index) : 0;
    if (!DIAL_KINDS.includes(kind)) throw new Error('A dial is for an expert, a head, a floor\'s attention or a floor\'s feed-forward block.');
    if (!Number.isInteger(layer) || layer < 0 || layer >= layers) throw new Error(`This brain has floors 1 to ${layers}.`);
    if (kind === 'expert' && !experts) throw new Error('This brain has no experts to dial.');
    if (!Number.isInteger(index) || index < 0 || (kind === 'expert' && index >= experts) || index > 4096) throw new Error(kind === 'expert' ? `This brain has experts 0 to ${experts - 1}.` : 'That head number isn\'t one.');
    const x = { kind, layer, index, scale: dialScale(d?.scale) };
    by.delete(dialKey(x)); if (x.scale !== 1) by.set(dialKey(x), x);
  }
  return [...by.values()];
}
// Every expert that leans to one skill (or pattern), all on one setting: turning a whole skill up or down.
export function skillDials(sp, skill, scale) {
  const out = [];
  sp.top.forEach((row, layer) => row.forEach((t, index) => { if (t === skill) out.push({ kind: 'expert', layer, index, scale: dialScale(scale) }); }));
  return out;
}
// The dials in a sentence, for under the picture and for a screen reader.
export function dialWords(dials) {
  if (!dials?.length) return 'Every part is as built.';
  const n = (k) => dials.filter((d) => d.kind === k).length, bits = [];
  const many = (c, one) => `${c.toLocaleString()} ${one}${c === 1 ? '' : 's'}`;
  if (n('expert')) bits.push(many(n('expert'), 'expert'));
  if (n('head')) bits.push(many(n('head'), 'attention head'));
  if (n('attn')) bits.push(`the attention of ${many(n('attn'), 'floor')}`);
  if (n('ffn')) bits.push(`the feed-forward block of ${many(n('ffn'), 'floor')}`);
  const up = dials.filter((d) => d.scale > 1).length, down = dials.length - up;
  return `${dials.length.toLocaleString()} dial${dials.length === 1 ? '' : 's'} set (${bits.join(', ')}): ${up ? `${up.toLocaleString()} turned up` : ''}${up && down ? ', ' : ''}${down ? `${down.toLocaleString()} turned down` : ''}.`;
}

// ---- Before and after ----
// Two scans of the same brain with the same questions (the second made with dials set or experts off), compared.
// The words of each question are the same in both, so their picks line up word for word: `moved` is the share of
// the question's picks that changed (0..1). Answers are compared as text. Clips are matched by skill and question.
export function compareScans(before, after) {
  const key = (c) => `${c.skill}\n${c.question}`;
  const old = new Map(before.clips.map((c, i) => [key(c), i]));
  const clips = [], per = after.skills.map((s) => ({ id: s.id, label: s.label, same: 0, changed: 0, moved: 0, n: 0 }));
  let same = 0, changed = 0, movedSum = 0;
  after.clips.forEach((c, ai) => {
    const bi = old.get(key(c)); if (bi === undefined) return;
    const b = before.clips[bi];
    const n = Math.min(c.prompt, b.prompt, c.e.length, b.e.length);
    let all = 0, kept = 0;
    for (let w = 0; w < n; w++) for (let l = 0; l < c.e[w].length; l++) {
      const was = new Set(b.e[w]?.[l] || []);
      for (const x of c.e[w][l]) { all++; if (was.has(x)) kept++; }
    }
    const moved = all ? 1 - kept / all : 0, sameAnswer = b.answer.trim() === c.answer.trim();
    clips.push({ before: bi, after: ai, skill: c.skill, question: c.question, moved, sameAnswer });
    if (sameAnswer) same++; else changed++;
    movedSum += moved;
    const p = per.find((x) => x.id === c.skill); if (p) { p.n++; p.moved += moved; if (sameAnswer) p.same++; else p.changed++; }
  });
  for (const p of per) p.moved = p.n ? p.moved / p.n : 0;
  return { clips, per: per.filter((p) => p.n), same, changed, moved: clips.length ? movedSum / clips.length : 0 };
}
export function compareWords(cmp) {
  if (!cmp.clips.length) return 'These two scans don\'t share any questions, so there\'s nothing to compare.';
  const pct = (v) => `${Math.round(v * 100)}%`;
  const most = [...cmp.per].sort((a, b) => b.moved - a.moved)[0], least = [...cmp.per].sort((a, b) => a.moved - b.moved)[0];
  return `${cmp.changed} of ${cmp.clips.length} answers changed. Reading the same questions, ${pct(cmp.moved)} of the picks moved to other blocks.${cmp.per.length > 1 ? ` ${most.label} moved most (${pct(most.moved)}), ${least.label} least (${pct(least.moved)}).` : ''}`;
}

// ---- Use these for training ----
// The blocks a training run may change, everything else stays frozen (the Lab's judge training reads them). The
// same shape as a dial without its scale. `moved`: the experts whose share of the picks changed most between two
// scans of the same brain (before and after), over the words of the questions, which are the same in both.
export function movedBlocks(before, after, { n = 64 } = {}) {
  const key = (c) => `${c.skill}\n${c.question}`, old = new Map(before.clips.map((c) => [key(c), c]));
  const diff = new Map();
  const add = (l, x, v) => { const k = `${l}:${x}`; diff.set(k, (diff.get(k) || 0) + v); };
  for (const c of after.clips) {
    const b = old.get(key(c)); if (!b) continue;
    const words = Math.min(c.prompt, b.prompt, c.e.length, b.e.length);
    for (let w = 0; w < words; w++) for (let l = 0; l < c.e[w].length; l++) { for (const x of c.e[w][l]) add(l, x, 1); for (const x of b.e[w]?.[l] || []) add(l, x, -1); }
  }
  return [...diff.entries()].filter(([, v]) => v !== 0).sort((a, b) => Math.abs(b[1]) - Math.abs(a[1]) || (a[0] < b[0] ? -1 : 1)).slice(0, Math.max(1, n))
    .map(([k]) => { const [layer, index] = k.split(':').map(Number); return { kind: 'expert', layer, index }; });
}
export const targetsOf = (list) => list.map((d) => ({ kind: d.kind, layer: d.layer, index: d.kind === 'expert' || d.kind === 'head' ? d.index : 0 }));
export const TARGET_FORMAT = 'bob-fnri-targets';

// ---- two different brains side by side ----
// A cut brain's keep list says which of the stock brain's experts each of its experts was: layers[l][j] = the stock
// id of its expert j on floor l (the forge's bob-keep.json, the Lab's <name>-keep.json). Checked against both brains;
// null when it doesn't fit.
export function keepMap(keep, { layers, experts, of = 0 }) {
  const L = keep?.layers;
  if (!Array.isArray(L) || L.length !== layers) return null;
  const before = of || Number(keep.experts_before) || Number(keep.of) || 0;
  for (const k of L) {
    if (!Array.isArray(k) || k.length !== experts || new Set(k).size !== k.length) return null;
    if (!k.every((x) => Number.isInteger(x) && x >= 0 && (!before || x < before))) return null;
  }
  return L.map((k) => k.slice());
}
// The cut brain's scan with its experts renamed to the stock brain's, so the two can be compared block for block.
export function lineUp(rec, map, experts) {
  return { ...rec, brain: { ...rec.brain, experts }, clips: rec.clips.map((c) => ({ ...c, e: c.e.map((row) => row.map((ids, l) => ids.map((x) => map[l]?.[x] ?? x))) })) };
}
// Can these two scans be compared, and how: { a, b } ready for compareScans (b may be lined up), or { why }.
// a = the other scan, b = this one. keepA / keepB: each one's keep list, when it has one.
export function pairUp(a, b, { keepA = null, keepB = null } = {}) {
  if (a.brain.kind !== b.brain.kind) return { why: 'one scan is of experts and the other of neuron groups or attention heads, so the blocks don\'t line up' };
  if (a.brain.layers !== b.brain.layers) return { why: `the two brains have a different number of floors (${a.brain.layers} and ${b.brain.layers}), so the blocks don't line up` };
  if (a.brain.experts === b.brain.experts) return { a, b, lined: '' };
  if (a.brain.kind !== 'experts') return { why: 'the two brains are a different size, so the blocks don\'t line up' };
  const small = a.brain.experts < b.brain.experts ? 'a' : 'b', big = small === 'a' ? b : a, cut = small === 'a' ? a : b;
  const map = keepMap(small === 'a' ? keepA : keepB, { layers: cut.brain.layers, experts: cut.brain.experts, of: big.brain.experts });
  if (!map) return { why: `${cut.brain.name || 'one brain'} has ${cut.brain.experts} experts on each floor and ${big.brain.name || 'the other'} ${big.brain.experts}, and Bob has no list of which experts the smaller one kept (its keep file), so the blocks can't be lined up` };
  const lined = lineUp(cut, map, big.brain.experts);
  return small === 'a' ? { a: lined, b, lined: 'a' } : { a, b: lined, lined: 'b' };
}
export function pairWords(cmp, nameA, nameB) {
  if (!cmp.clips.length) return 'These two scans don\'t share any questions, so there\'s nothing to compare.';
  const pct = (v) => `${Math.round(v * 100)}%`;
  const most = [...cmp.per].sort((a, b) => b.moved - a.moved)[0], least = [...cmp.per].sort((a, b) => a.moved - b.moved)[0];
  return `${nameA} and ${nameB} gave the same answer to ${cmp.same} of ${cmp.clips.length} questions. Reading the same questions, ${pct(cmp.moved)} of the picks went to different experts.${cmp.per.length > 1 ? ` ${most.label} differed most (${pct(most.moved)}), ${least.label} least (${pct(least.moved)}).` : ''}`;
}
// A video's file name, the owner's way: model-skill-quantization (riker-coding-q4_k_m), and for two brains
// riker-vs-qwen-3.6-35b-a3b-coding-q4_k_m. The quantization is read from the brain's or the scan's name.
export const QUANT_RE = /\b(I?Q\d(?:_[0-9A-Z]+)*|F16|BF16|F32|MXFP4)\b/i;
export function videoName(rec, { skill = '', other = null } = {}) {
  const quant = (s) => (String(s || '').match(QUANT_RE)?.[1] || '').toLowerCase();
  const model = (r) => String(r.brain.name || 'brain').replace(QUANT_RE, '').toLowerCase().replace(/[^a-z0-9.]+/g, '-').replace(/^-+|-+$/g, '') || 'brain';
  const q = quant(rec.brain.name) || quant(rec.name) || (other ? quant(other.brain.name) || quant(other.name) : '');
  const sk = String(skill || 'all-skills').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return [other ? `${model(rec)}-vs-${model(other)}` : model(rec), sk, q].filter(Boolean).join('-');
}
