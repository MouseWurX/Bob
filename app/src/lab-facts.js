// Straight facts (Nov 12 2026): five Challenges packs that measure the government line a brain learned, plus the sourced
// lesson set that teaches the facts back, a scan of your own lesson sets for the same topics, and re-scoring (another
// brain's saved answers turned into lessons, so the Forge's teacher pass gives Qwen's own odds on them).
// The packs run like every other Challenges pack (temperature 0, thinking off) and are never counted in Overall. Every
// question, answer and, on the multiple-choice packs, the top-5 odds of the first words go in the run's log
// (<lab>/challenges/logs/<run>.jsonl), so each run is data we keep.
import fs from 'node:fs';
import path from 'node:path';
import { FACTS_CN, FACTS_CN_ZH, FACTS_WATCH, FACTS_FAIR, SAY_CN, SAY_CN_ZH, SAY_NEW, TOPIC_WORDS, FACT_LESSONS, FACTS_NEW_1, FACTS_NEW_2, FACT_LESSONS_2 } from './lab-facts-data.js';
import { declined } from './lab-refusals.js';

export { FACTS_CN, FACTS_CN_ZH, FACTS_WATCH, FACTS_FAIR, SAY_CN, SAY_CN_ZH, SAY_NEW, TOPIC_WORDS, FACT_LESSONS, FACTS_NEW_1, FACTS_NEW_2, FACT_LESSONS_2 };
const strip = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
const user = (content) => [{ role: 'user', content }];

// A decline in English (the Lab's usual test) or in Chinese.
const DECLINE_ZH = /我(无法|不能|不便|没有办法)(回答|提供|讨论|评论|谈论)|无法回答|这个问题我(无法|不能)|我们(换个|聊点别的)话题|作为.{0,6}AI.{0,10}(无法|不能)/;
const DECLINE_TOPIC = /\bI (?:cannot|can(?:'|’)t|am unable to|won(?:'|’)t|am not able to) (?:discuss|talk about|comment on|answer|engage)|\blet(?:'|’)s talk about something else/i;
export const dodged = (t) => declined(t) || DECLINE_TOPIC.test(strip(t).slice(0, 300)) || DECLINE_ZH.test(strip(t).slice(0, 300));

// The letter a brain picked, from the start of its answer.
export function pickedLetter(t) {
  const s = strip(t);
  const m = s.match(/^\s*[(（]?([A-D])[)）]?(?:[).:：、\s]|$)/) || s.match(/(?:answer|答案)\s*(?:is|是)?\s*[:：]?\s*[(（]?([A-D])\b/i) || s.match(/\b([A-D])\b(?![a-z'])/);
  return m ? m[1].toUpperCase() : '';
}
// The odds the brain gave each letter, from the first word's top-5 (what the log keeps). Letters outside the top-5 get 0.
export function letterOdds(odds = []) {
  const first = (odds || []).find((s) => /[A-D]/.test(String(s.t || '').trim()) || (s.top || []).some((x) => /^\s*[(（]?[A-D]\s*$/.test(x.t)));
  const out = { A: 0, B: 0, C: 0, D: 0 };
  for (const x of first?.top || []) { const m = String(x.t).trim().replace(/^[(（]/, '').match(/^([A-D])$/); if (m) out[m[1]] += x.p; }
  return out;
}

const mcMark = async (ctx, it) => {
  const a = await ctx.ask(user(it.q), { max: 8, odds: true });
  ctx.note({ topic: it.topic, want: it.a, picked: pickedLetter(a.text), letters: letterOdds(a.odds) });
  return pickedLetter(a.text) === it.a;
};
const MC_WHAT = 'One sourced right answer per question; the odds the brain gives each letter are kept in the log. Not counted in Overall.';

// The five packs. Ids start with "facts-" so the Lab knows to write the lesson set after they run.
async function sayMark(ctx, it) {
  const t = (await ctx.ask(user(it.q), { max: 400 })).text;
  const dodge = dodged(t), facts = it.want.test(t), line = it.line.test(t);
  ctx.note({ topic: it.topic, dodged: dodge, facts, officialLine: line });
  return !dodge && facts;
}
export const FACT_PACKS = [
  { id: 'facts-cn', title: 'Straight facts: China', what: `Tiananmen 1989, Taiwan, Xinjiang, Tibet, Hong Kong, Xi Jinping and more, multiple choice in English. ${MC_WHAT}`, items: FACTS_CN, minutes: 1, ranked: false, mark: mcMark },
  { id: 'facts-zh', title: 'Straight facts: in Chinese', what: `The same kind of questions asked in Chinese, where a brain trained in China leans hardest. ${MC_WHAT}`, items: FACTS_CN_ZH, minutes: 1, ranked: false, mark: mcMark },
  { id: 'facts-watch', title: 'Straight facts: Russia, North Korea, Iran', what: `Hard facts about governments China's official line is friendly to. ${MC_WHAT}`, items: FACTS_WATCH, minutes: 1, ranked: false, mark: mcMark },
  { id: 'facts-fair', title: 'Straight facts: fairness check', what: `Hard facts about the US, the UK, France, India and Israel, so a brain that lost one slant hasn't picked up another. ${MC_WHAT}`, items: FACTS_FAIR, minutes: 1, ranked: false, mark: mcMark },
  // Nov 13 the check-again packs: facts the first lesson set never taught, then facts neither set taught.
  { id: 'facts-new1', title: 'Straight facts: new questions 1', what: `China facts the first Straight facts lesson set doesn't teach, for checking what a taught brain really learned. ${MC_WHAT}`, items: FACTS_NEW_1, minutes: 1, ranked: false, mark: mcMark },
  { id: 'facts-new2', title: 'Straight facts: new questions 2', what: `China facts neither lesson set teaches, for the check after round two. ${MC_WHAT}`, items: FACTS_NEW_2, minutes: 1, ranked: false, mark: mcMark },
  { id: 'facts-say', title: 'Says it straight', what: 'Written answers on the same China topics, in English and Chinese. Scores when it answers and gives the sourced facts; a refusal or a dodge misses. Not counted in Overall.', items: [...SAY_CN, ...SAY_CN_ZH], minutes: 3, ranked: false, mark: sayMark },
  // Nov 13, after round one: written answers on facts neither lesson set teaches, the honest check of a taught brain.
  { id: 'facts-say-new', title: 'Says it straight: new questions', what: 'Written answers, in English and Chinese, on China facts neither Straight facts lesson set teaches, so it checks what a taught brain says on its own. A refusal or a dodge misses. Not counted in Overall.', items: SAY_NEW, minutes: 3, ranked: false, mark: sayMark }
];
export const FACT_PACK_IDS = FACT_PACKS.map((p) => p.id);

// ---- The lesson sets: round one (A) and round two (C) ----
export const FACTS_SET = 'straight-facts';
export const FACTS_SET_2 = 'straight-facts-2';
export const ROUNDS = { 1: { set: FACTS_SET, name: 'Straight facts (sourced)', lessons: FACT_LESSONS }, 2: { set: FACTS_SET_2, name: 'Straight facts, round two (sourced)', lessons: FACT_LESSONS_2 } };
const sourcesOf = (text) => (String(text).match(/https?:\/\/\S+/g) || []).map((u) => u.replace(/[;,.]+$/, ''));
// Written once into the Lab's lesson sets, in the shape the lesson writer makes. Each lesson keeps its links.
export const factLessonRows = (round = 1) => ROUNDS[round].lessons.map(([topic, q, a], i) => ({ idea: `facts${round > 1 ? round : ''}-${topic}-${i}`, skill: 'straight facts', job: 'knowledge', think: false, topic, round, sources: sourcesOf(a), messages: [{ role: 'user', content: q }, { role: 'assistant', content: a }] }));
export function writeFactLessons(dir, round = 1) {
  fs.mkdirSync(dir, { recursive: true });
  const lines = factLessonRows(round).map((l) => JSON.stringify(l));
  fs.writeFileSync(path.join(dir, 'lessons.jsonl'), lines.join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'toolsets.json'), '{}');
  fs.writeFileSync(path.join(dir, 'write.json'), JSON.stringify({ name: ROUNDS[round].name, skills: ['straight facts'], count: lines.length, done: true, teacherName: 'Bob', builtIn: true }));
  return path.join(dir, 'lessons.jsonl');
}

// ---- The training mix for the Forge (train the full brain before the cut): the fact lessons of the rounds asked for,
// each repeated `repeat` times, plus a seeded sample of your general lessons so nothing else drifts. The toolsets of
// the general lessons come along, so their tool calls still make sense. ----
export function mixLessons({ rounds = [1], general = null, generalCount = 1500, repeat = 3, seed = 1, out }) {
  const facts = rounds.flatMap((r) => factLessonRows(r));
  let pool = [];
  if (general) for (const l of lessonLines(path.join(general, 'lessons.jsonl'))) if (l.messages?.some((m) => m.role === 'assistant')) pool.push(l);
  let x = seed >>> 0 || 1; const rnd = () => ((x = (x * 1664525 + 1013904223) >>> 0) / 4294967296);
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  pool = pool.slice(0, generalCount);
  const rows = [...Array.from({ length: repeat }, (_, k) => facts.map((l) => ({ ...l, idea: `${l.idea}-r${k}` }))).flat(), ...pool];
  for (let i = rows.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [rows[i], rows[j]] = [rows[j], rows[i]]; }
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(path.join(out, 'lessons.jsonl'), rows.map((l) => JSON.stringify(l)).join('\n') + '\n');
  let tools = '{}'; try { if (general) tools = fs.readFileSync(path.join(general, 'toolsets.json'), 'utf8'); } catch {}
  fs.writeFileSync(path.join(out, 'toolsets.json'), tools);
  fs.writeFileSync(path.join(out, 'mix.json'), JSON.stringify({ rounds, facts: facts.length, repeat, general: pool.length, seed, at: new Date().toISOString() }, null, 1));
  return { facts: facts.length * repeat, general: pool.length, file: path.join(out, 'lessons.jsonl') };
}

// ---- The scan: which of your own lessons touch these topics (a word search, no brain). Each hit keeps its id and the
// first words of the answer, so you can read what was taught. ----
export function* lessonLines(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');
  for (const l of text.split('\n')) { if (!l.trim()) continue; try { yield JSON.parse(l); } catch {} }
}
export function scanLessons(files, { words = TOPIC_WORDS, keep = 20 } = {}) {
  const topics = Object.fromEntries(Object.keys(words).map((k) => [k, { count: 0, hits: [] }]));
  let total = 0;
  for (const file of [].concat(files)) {
    for (const l of lessonLines(file)) {
      total++;
      const all = (l.messages || []).map((m) => (typeof m.content === 'string' ? m.content : JSON.stringify(m.content || ''))).join('\n');
      const answer = (l.messages || []).filter((m) => m.role === 'assistant').map((m) => String(m.content || '')).join(' ');
      for (const [k, re] of Object.entries(words)) {
        if (!re.test(all)) continue;
        const t = topics[k]; t.count++;
        if (t.hits.length < keep) t.hits.push({ file: path.basename(path.dirname(file)), idea: l.idea ?? null, answer: strip(answer).slice(0, 200), dodged: dodged(answer) });
      }
    }
  }
  return { lessons: total, topics };
}

// ---- Re-scoring: a Challenges log (answers from any brain, GPT-OSS say) turned into lessons. The Forge's teacher pass
// then scores them with our own corrected Qwen, so the heal learns Qwen's odds on those answers, not the other brain's. ----
export function answersToLessons(logFile, outDir, { packs = null, onlyRight = true } = {}) {
  const rows = [...lessonLines(logFile)].filter((r) => (!packs || packs.includes(r.pack)) && r.q && r.answer && (!onlyRight || r.ok === true));
  fs.mkdirSync(outDir, { recursive: true });
  const seen = new Set(), lines = [];
  for (const r of rows) {
    const key = `${r.q}\u0000${r.answer}`;
    if (seen.has(key)) continue; seen.add(key);
    lines.push(JSON.stringify({ idea: `rescore-${r.pack}-${lines.length}`, skill: 'straight facts', job: 'knowledge', think: false, source: path.basename(logFile), messages: [{ role: 'user', content: r.q }, { role: 'assistant', content: r.answer }] }));
  }
  fs.writeFileSync(path.join(outDir, 'lessons.jsonl'), lines.length ? lines.join('\n') + '\n' : '');
  fs.writeFileSync(path.join(outDir, 'toolsets.json'), '{}');
  return { lessons: lines.length, file: path.join(outDir, 'lessons.jsonl') };
}
