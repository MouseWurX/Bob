// New tests that also make training data (12 Nov, the owner's ask for "tests that offer more robust training sets").
// The teacher (the full Qwen3.6, or any strong brain on an OpenAI-style server) writes them from Bob's own lessons:
// - twins: a request rewritten with one detail changed so it flips between "needs a tool" and "no tool" ("what does a
//   scam e-mail look like?" against "is this e-mail a scam?"). Kept only when the teacher's own answer really flips, so
//   each pair teaches exactly where the line is. Aimed at the brains' biggest miss: tools fired on plain chat.
// - families: the requests the brains get wrong, each in --per (20) new phrasings (casual, typos, indirect, short,
//   polite, another language). The teacher answers every phrasing with Bob's real prompt and tools.
// Every probe carries its own split: 20% of each family (by id) is held out, so training on the rest and testing on
// those measures understanding, not memory. Twins: the whole pair goes one way, so a pair never straddles the split.
// The output is a lessons folder (lessons.jsonl + toolsets.json) that tool-score runs like any other:
//   node tool-score.mjs --lessons <out> --split train   (harvest)   or   --split holdout   (the probes' own test)
//
// node make-probes.mjs --url <teacher server> --lessons out/lessons --out out/probes [--twins 200] [--families 31]
//      [--per 20] [--fails <folder of kept answers-*.jsonl: seeds = turns every brain got wrong>]
// Seeds come only from training lessons (never the benchmark's held-out 5%). Set LAB_API_KEY / LAB_REMOTE / LAB_MODEL_NAME
// for a rented teacher. Resumable: probes already written are skipped.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { opts, chat, readJsonl, appendJsonl } from './common.mjs';

const o = opts({ twins: 200, families: 31, per: 20 });
if (!o.url || !o.lessons || !o.out) { console.error('--url <teacher server> --lessons <lessons folder> --out <folder> are needed'); process.exit(1); }
const url = String(o.url).replace(/\/+$/, ''), out = String(o.out);
fs.mkdirSync(out, { recursive: true });
const md5 = (s) => parseInt(crypto.createHash('md5').update(String(s)).digest('hex').slice(0, 8), 16) / 0xFFFFFFFF;
const isHoldout = (id) => md5(id) < 0.05;

const sets = JSON.parse(fs.readFileSync(path.join(String(o.lessons), 'toolsets.json'), 'utf8'));
const all = readJsonl(path.join(String(o.lessons), 'lessons.jsonl')).filter((l) => l.idea !== undefined && !isHoldout(l.idea));
// a seed = a lesson's first user message and the teacher's first answer to it, with that turn's tool set
export function seedOf(l) {
  const u = l.messages.find((m) => m.role === 'user'), a = l.messages.find((m) => m.role === 'assistant');
  if (!u || !a || !sets[a.set] || typeof u.content !== 'string' || !u.content.trim()) return null;
  return { idea: String(l.idea), user: u.content, set: a.set, tool: Boolean(a.tool_calls?.length), names: (a.tool_calls || []).map((c) => c.function?.name) };
}
const seeds = all.map(seedOf).filter(Boolean);
const even = (list, n) => (n >= list.length ? list : Array.from({ length: n }, (_, i) => list[Math.floor((i * list.length) / n)]));

const F = { lessons: path.join(out, 'lessons.jsonl'), sets: path.join(out, 'toolsets.json'), report: path.join(out, 'probes-report.json') };
const done = new Set(readJsonl(F.lessons).map((l) => l.idea));
const usedSets = fs.existsSync(F.sets) ? JSON.parse(fs.readFileSync(F.sets, 'utf8')) : {};
const tally = { twins: 0, 'twins not flipped': 0, phrasings: 0, 'phrasings skipped': 0, errors: 0 };

// The teacher, plain (writing new requests) and as Bob (answering one with his real prompt and tools).
const write = async (prompt) => (await chat(url, { messages: [{ role: 'user', content: prompt }], think: false, max: 2000, temperature: 0.8 })).msg.content || '';
async function answer(set, user) {
  const { msg } = await chat(url, { messages: [{ role: 'system', content: sets[set].system }, { role: 'user', content: user }], tools: sets[set].tools, think: false, max: 1500, temperature: 0 });
  return { role: 'assistant', set, content: msg.content || '', ...(msg.tool_calls?.length ? { tool_calls: msg.tool_calls.map((c) => ({ id: c.id, type: 'function', function: { name: c.function?.name, arguments: c.function?.arguments } })) } : {}) };
}
function save(idea, split, user, a, extra) {
  usedSets[a.set] = sets[a.set];
  appendJsonl(F.lessons, { idea, split, probe: extra.probe, ...extra, messages: [{ role: 'user', content: user }, a] });
  done.add(idea);
}
const listOf = (text) => { try { const j = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)); return Array.isArray(j) ? j.filter((x) => typeof x === 'string' && x.trim()) : []; } catch { return []; } };

// ---- twins ----
const toolNames = (set) => (sets[set].tools || []).map((t) => t.function?.name).filter(Boolean);
const twinSeeds = even([...seeds.filter((s) => s.tool), ...seeds.filter((s) => !s.tool)].sort((a, b) => md5(a.idea) - md5(b.idea)), Number(o.twins));
for (const s of twinSeeds) {
  const id = `twin:${s.idea}`;
  if (done.has(`${id}:b`)) continue;
  const split = md5(id) < 0.2 ? 'holdout' : 'train';
  try {
    const flip = s.tool
      ? `Bob is an assistant with these tools: ${toolNames(s.set).join(', ')}. This message needs one of them:\n"${s.user}"\nWrite ONE message on the same topic, as close to it as you can, that Bob should answer from his own knowledge with NO tool (a general question, an opinion, an explanation). Reply with the message only.`
      : `Bob is an assistant with these tools: ${toolNames(s.set).join(', ')}. This message needs no tool:\n"${s.user}"\nWrite ONE message on the same topic, as close to it as you can, that DOES need one of those tools (it names a file, a page, a time, a thing to do or look up). Reply with the message only.`;
    const twin = (await write(flip)).trim().replace(/^"|"$/g, '');
    if (!twin || twin === s.user) { tally['twins not flipped']++; continue; }
    const [a1, a2] = [await answer(s.set, s.user), await answer(s.set, twin)];
    // kept only when the teacher's own answers land on opposite sides of the line
    if (Boolean(a1.tool_calls) === Boolean(a2.tool_calls)) { tally['twins not flipped']++; continue; }
    save(`${id}:a`, split, s.user, a1, { probe: 'twin', pair: id, from: s.idea });
    save(`${id}:b`, split, twin, a2, { probe: 'twin', pair: id, from: s.idea });
    tally.twins++;
  } catch (e) { tally.errors++; if (tally.errors <= 3) console.log(`  twin ${s.idea}: ${e.message.slice(0, 120)}`); }
  if (tally.twins % 20 === 0 && tally.twins) console.log(`  twins: ${tally.twins}`);
}

// ---- phrasing families ----
// Seeds: the turns every brain got wrong in kept answers (--fails), else an even spread of tool seeds.
let famSeeds = [];
if (o.fails) {
  const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : [path.join(d, e.name)]));
  const byTurn = new Map();
  for (const f of walk(String(o.fails)).filter((x) => /answers-.*\.jsonl$/.test(path.basename(x)))) for (const r of readJsonl(f)) if (r.idea !== undefined && r.turn === 0 && typeof r.ok === 'boolean') { const k = String(r.idea); byTurn.set(k, (byTurn.get(k) || true) && !r.ok); }
  const failed = new Set([...byTurn].filter(([, allWrong]) => allWrong).map(([k]) => k));
  // the failed chats are usually held-out ones: their requests are re-phrased, never copied, and the originals stay out
  const any = readJsonl(path.join(String(o.lessons), 'lessons.jsonl')).filter((l) => failed.has(String(l.idea))).map(seedOf).filter(Boolean);
  famSeeds = any;
  console.log(`${failed.size} turns every brain got wrong; ${any.length} usable as family seeds`);
}
if (!famSeeds.length) famSeeds = even(seeds.filter((s) => s.tool).sort((a, b) => md5(a.idea) - md5(b.idea)), Number(o.families));
famSeeds = famSeeds.slice(0, Number(o.families));
for (const s of famSeeds) {
  const fam = `family:${s.idea}`;
  if (done.has(`${fam}:${Number(o.per) - 1}`)) continue;
  let list = [];
  try {
    list = listOf(await write(`Rewrite this request to an assistant ${o.per} different ways a real person might type it: casual, with typos, indirect, very short, very polite, rambling, and two or three in other languages. Keep the same meaning and every name, file and number in it.\n"${s.user}"\nReply with a JSON list of ${o.per} strings only.`));
  } catch (e) { tally.errors++; continue; }
  for (const [i, p] of list.slice(0, Number(o.per)).entries()) {
    const id = `${fam}:${i}`;
    if (done.has(id)) continue;
    try {
      const a = await answer(s.set, p);
      // a phrasing the teacher itself answers differently from the original is a different request: left out
      const same = Boolean(a.tool_calls) === s.tool && (!s.tool || (a.tool_calls || []).some((c) => s.names.includes(c.function?.name)));
      if (!same) { tally['phrasings skipped']++; continue; }
      save(id, md5(id) < 0.2 ? 'holdout' : 'train', p, a, { probe: 'family', family: fam, from: s.idea });
      tally.phrasings++;
    } catch (e) { tally.errors++; }
  }
  console.log(`  family ${s.idea}: ${tally.phrasings} phrasings so far`);
}

fs.writeFileSync(F.sets, JSON.stringify(usedSets));
const kept = readJsonl(F.lessons);
const report = { ...tally, lessons: kept.length, train: kept.filter((l) => l.split === 'train').length, holdout: kept.filter((l) => l.split === 'holdout').length };
fs.writeFileSync(F.report, JSON.stringify(report, null, 1));
console.log(Object.entries(report).map(([k, v]) => `${k}: ${v}`).join('\n'));
