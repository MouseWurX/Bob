// 1.5.153 Computer Science Lab, part 3: Challenges. Short packs of questions, written for Bob (not copied from any
// published benchmark), asked at temperature 0 with thinking off so the same brain gets the same score twice. Scores
// are out of 100. They only mean something next to each other, on the same replicant matrix: the Help page says so.
// The questions are plain data here so anyone can read them.
import fs from 'node:fs';
import path from 'node:path';
import { QUIZ, TOOLS, runQuiz } from './lab-test.js';
import { EXTRA_PACKS, EXTRA_IDS, runExtraPack } from './lab-packs.js'; // 1.5.164 more packs and Guard rails

const stripThink = (t) => String(t || '').replace(/<think>[\s\S]*?<\/think>/g, '').replace(/^[\s\S]*<\/think>/, '').trim();
// The first letter answer in a reply: "B", "(B)", "B)", "The answer is B." Returns '' if there's none.
export function letterOf(t) {
  const s = stripThink(t);
  const m = s.match(/^\s*\(?([A-D])\)?(?:[).:\s]|$)/) || s.match(/answer(?: is)?[:\s]*\(?([A-D])\)?\b/i) || s.match(/\b([A-D])\b(?![a-z'])/);
  return m ? m[1].toUpperCase() : '';
}
// The last whole number in a reply, commas allowed ("1,250"). null if none.
export function numberOf(t) {
  const all = stripThink(t).replace(/(\d),(\d{3})\b/g, '$1$2').match(/-?\d+(?:\.\d+)?/g);
  return all ? Number(all[all.length - 1]) : null;
}

const MC = (q, choices, answer) => [`${q}\n${choices.map((c, i) => `${'ABCD'[i]}) ${c}`).join('\n')}\nAnswer with the letter only.`, answer];
export const REASONING = [
  MC('A farmer has 17 sheep. All but 9 run away. How many are left?', ['8', '9', '17', '0'], 'B'),
  MC('If all bloops are razzies and all razzies are lazzies, which must be true?', ['All lazzies are bloops', 'All bloops are lazzies', 'No bloops are lazzies', 'Some razzies are not bloops'], 'B'),
  MC('Tom is taller than Ann. Ann is taller than Sue. Who is shortest?', ['Tom', 'Ann', 'Sue', 'You can\'t tell'], 'C'),
  MC('A ball is dropped from a table. Which force pulls it to the floor?', ['Magnetism', 'Friction', 'Gravity', 'Air pressure'], 'C'),
  MC('What comes next: 2, 4, 8, 16, ...?', ['18', '24', '32', '30'], 'C'),
  MC('If today is Monday, what day is it 10 days from now?', ['Wednesday', 'Thursday', 'Friday', 'Tuesday'], 'B'),
  MC('Which of these is not a mammal?', ['Whale', 'Bat', 'Shark', 'Dog'], 'C'),
  MC('A shop sells pens at 3 for $1. How much do 12 pens cost?', ['$3', '$4', '$6', '$12'], 'B'),
  MC('Ice floats on water because ice is...', ['heavier than water', 'less dense than water', 'colder than water', 'full of air bubbles only'], 'B'),
  MC('All the doors in a house are red. The kitchen has a door. What colour is the kitchen door?', ['Red', 'White', 'You can\'t tell', 'Brown'], 'A'),
  MC('Which is the odd one out?', ['Triangle', 'Square', 'Circle', 'Pentagon'], 'C'),
  MC('If you face north and turn right twice, which way are you facing?', ['East', 'South', 'West', 'North'], 'B'),
  MC('Why do we see lightning before we hear thunder?', ['Light travels faster than sound', 'Thunder happens later', 'Our eyes are closer to the brain', 'Sound is blocked by clouds'], 'A'),
  MC('A clock shows 3:00. What is the angle between the hands?', ['45 degrees', '60 degrees', '90 degrees', '180 degrees'], 'C'),
  MC('Which would most likely make a plant grow taller toward a window?', ['Light', 'Sound', 'Wind', 'Darkness'], 'A'),
  MC('Mary\'s father has five daughters: Nana, Nene, Nini, Nono. What is the fifth daughter\'s name?', ['Nunu', 'Mary', 'Nina', 'You can\'t tell'], 'B'),
  MC('If some cats are black and Tibbles is a cat, which must be true?', ['Tibbles is black', 'Tibbles is not black', 'Tibbles may or may not be black', 'Tibbles is a dog'], 'C'),
  MC('Which uses the most energy to heat?', ['A cup of water', 'A bathtub of water', 'A spoon of water', 'They all use the same'], 'B'),
  MC('A train leaves at 9:40 and the trip takes 1 hour 35 minutes. When does it arrive?', ['10:75', '11:15', '11:05', '10:15'], 'B'),
  MC('What is the best way to check if a coin is fair?', ['Flip it once', 'Flip it many times and count', 'Look at it closely', 'Weigh it once'], 'B')
];

export const SUMS = [
  ['Sam has 12 apples. He gives 5 to a friend and buys 9 more. How many apples does he have now? Give the number only.', 16],
  ['A book costs $8 and a pen costs $3. How much do 4 books and 2 pens cost, in dollars? Give the number only.', 38],
  ['A bus carries 45 people. How many buses are needed for 200 people? Give the number only.', 5],
  ['A rectangle is 7 cm long and 4 cm wide. What is its area in square centimetres? Give the number only.', 28],
  ['Jo reads 15 pages a day. How many days does a 180-page book take? Give the number only.', 12],
  ['A pizza is cut into 8 slices. Three friends eat 2 slices each. How many slices are left? Give the number only.', 2],
  ['A car travels 60 km in one hour. How far does it go in 2 hours and 30 minutes, in km? Give the number only.', 150],
  ['There are 24 students. A third of them walk to school. How many walk? Give the number only.', 8],
  ['A shirt costs $40 and is on sale for 25% off. What is the sale price in dollars? Give the number only.', 30],
  ['Eggs come in boxes of 6. How many full boxes can you fill with 50 eggs? Give the number only.', 8],
  ['Ana is 9. Her mother is four times her age. How old will her mother be in 5 years? Give the number only.', 41],
  ['A tank holds 120 litres and is filling at 8 litres a minute. How many minutes until it is full from empty? Give the number only.', 15],
  ['What is 15% of 260? Give the number only.', 39],
  ['A garden is 10 m by 6 m. A fence goes all the way round. How many metres of fence? Give the number only.', 32],
  ['Lee saves $7 a week. How many weeks until Lee has at least $100? Give the number only.', 15]
];

export const RULES = [
  ...QUIZ.following,
  ['Reply with the word "yes" in lower case, then a full stop, and nothing else.', (t) => t.trim() === 'yes.'],
  ['Write exactly two sentences about the moon. No more, no fewer.', (t) => (t.trim().match(/[^.!?]+[.!?]+/g) || []).length === 2],
  ['Give three fruits as a comma-separated list on one line, with no other words.', (t) => { const l = t.trim(); return !/\n/.test(l) && l.split(',').filter((x) => x.trim()).length === 3 && l.split(/\s+/).length <= 6; }],
  ['Answer with a single word, all lower case: what colour is the sky on a clear day?', (t) => /^blue\.?$/.test(t.trim())],
  ['Reply in valid JSON only, an object with a key "name" set to "Bob".', (t) => { try { return JSON.parse(t.trim().replace(/^```(?:json)?\s*|```$/g, '')).name === 'Bob'; } catch { return false; } }],
  ['Count from 1 to 5, one number per line, nothing else.', (t) => t.trim().split(/\n+/).map((x) => x.trim()).join() === '1,2,3,4,5'],
  ['Write the word "cheese" backwards, and nothing else.', (t) => t.trim().replace(/[."']/g, '').toLowerCase() === 'eseehc'],
  ['Reply with no more than five words: why do birds fly south?', (t) => t.trim().split(/\s+/).length <= 5 && t.trim().length > 0]
];

export const PICK_TOOL = [
  ...QUIZ.tools,
  ['Paint me a watercolour of a lighthouse.', 'make_picture'],
  ['Do I need an umbrella in Oslo this afternoon?', 'get_weather'],
  ['Ping me at 9 tomorrow about the dentist.', 'set_reminder'],
  ['Where did I save the notes from the club meeting?', 'search_files'],
  ['How cold is it in Toronto?', 'get_weather'],
  ['Find my CV somewhere in my documents.', 'search_files']
];

// Code it: a tiny function, run in Bob's sandbox (no files, no internet, no programs) on fixed inputs.
export const CODE = [
  { q: 'Write a JavaScript function named add(a, b) that returns a + b.', fn: 'add', cases: [[[2, 3], 5], [[-1, 1], 0], [[0.5, 0.25], 0.75]] },
  { q: 'Write a JavaScript function named isEven(n) that returns true if n is even, false otherwise.', fn: 'isEven', cases: [[[4], true], [[7], false], [[0], true], [[-3], false]] },
  { q: 'Write a JavaScript function named reverse(s) that returns the string s reversed.', fn: 'reverse', cases: [[['abc'], 'cba'], [[''], ''], [['Bob'], 'boB']] },
  { q: 'Write a JavaScript function named largest(list) that returns the largest number in an array.', fn: 'largest', cases: [[[[1, 5, 3]], 5], [[[-2, -9]], -2], [[[7]], 7]] },
  { q: 'Write a JavaScript function named countVowels(s) that returns how many of a, e, i, o, u (any case) are in s.', fn: 'countVowels', cases: [[['hello'], 2], [['SKY'], 0], [['AeIoU'], 5]] },
  { q: 'Write a JavaScript function named fizz(n) that returns "Fizz" if n is divisible by 3, "Buzz" if by 5, "FizzBuzz" if by both, otherwise n as a string.', fn: 'fizz', cases: [[[3], 'Fizz'], [[10], 'Buzz'], [[15], 'FizzBuzz'], [[7], '7']] },
  { q: 'Write a JavaScript function named sumTo(n) that returns 1 + 2 + ... + n.', fn: 'sumTo', cases: [[[1], 1], [[10], 55], [[100], 5050]] },
  { q: 'Write a JavaScript function named titleCase(s) that capitalises the first letter of each word and lower-cases the rest.', fn: 'titleCase', cases: [[['hello world'], 'Hello World'], [['bOB the BUILDER'], 'Bob The Builder']] }
];

// The packs, in the order the scoreboard shows them. `minutes` is a rough guess on a 16 GB card.
export const PACKS = [
  { id: 'quiz', title: 'Quick quiz', what: 'The Lab test: general knowledge, picking the right tool, coding and following instructions.', count: Object.values(QUIZ).reduce((a, l) => a + l.length, 0), minutes: 2 },
  { id: 'reasoning', title: 'Riddles and reasoning', what: 'Short puzzles and everyday science, multiple choice.', count: REASONING.length, minutes: 2 },
  { id: 'sums', title: 'Sums', what: 'Word problems with a whole-number answer.', count: SUMS.length, minutes: 2 },
  { id: 'rules', title: 'Follow the rules', what: '"Answer only with..." tasks: format, length, case.', count: RULES.length, minutes: 1 },
  { id: 'tools', title: 'Pick the tool', what: 'Requests that should call one of four pretend tools. Nothing is really run.', count: PICK_TOOL.length, minutes: 1 },
  { id: 'code', title: 'Code it', what: 'Tiny JavaScript functions, run in my sandbox on fixed inputs.', count: CODE.length, minutes: 2 },
  // 1.5.164 the extra packs (questions in src/lab-packs-data.js). Only the plain facts go to the page.
  ...EXTRA_PACKS.map(({ id, title, what, count, minutes, version, ranked }) => ({ id, title, what, count, minutes, version, ...(ranked === false ? { ranked: false } : {}), group: 'more' }))
];
export const PACK_IDS = PACKS.map((p) => p.id);
// 1.5.164 the packs Overall averages and "ran them all" counts. Guard rails is shown but never ranked.
export const RANKED_IDS = PACKS.filter((p) => p.ranked !== false).map((p) => p.id);
// 1.5.161 Every pack has a version; a score remembers the version that made it, so the board never mixes two tests.
export const PACK_VERSION = Object.fromEntries(PACKS.map((p) => [p.id, p.version || 1]));
// The local leaderboard ranks brains within classes of models by their total weights (not by graphics card).
// A mixture of experts sits in the class of its total, with the active weights shown. Quantizing never changes a class.
export const CLASSES = [['tiny', 'Tiny', 'under 2 billion weights', 0, 2], ['small', 'Small', '2 to 5 billion', 2, 5], ['medium', 'Medium', '5 to 10 billion', 5, 10], ['large', 'Large', '10 to 20 billion', 10, 20], ['huge', 'Huge', '20 to 40 billion', 20, 40], ['giant', 'Giant', 'over 40 billion', 40, Infinity]];
export const classOf = (b) => { const n = Number(b); if (!(n > 0)) return ''; return CLASSES.find(([, , , lo, hi]) => n >= lo && n < hi)?.[0] || ''; };

async function ask(url, content, { tools, signal, max = 400 } = {}) {
  const body = { messages: [{ role: 'user', content }], temperature: 0, max_tokens: max, chat_template_kwargs: { enable_thinking: false }, ...(tools ? { tools, tool_choice: 'auto' } : {}) };
  const r = await fetch(url + '/v1/chat/completions', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body), signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(180e3)]) : AbortSignal.timeout(180e3) });
  if (!r.ok) throw new Error(`llama-server answered ${r.status}`);
  const j = await r.json();
  const m = j.choices?.[0]?.message || {};
  return { text: stripThink(m.content), calls: (m.tool_calls || []).map((c) => c.function?.name), tps: Number(j.timings?.predicted_per_second) || 0, prefillTps: Number(j.timings?.prompt_per_second) || 0 };
}

// The code from a reply: the first fenced block if there is one, else the whole reply.
export function codeOf(t) {
  const m = String(t || '').match(/```(?:[a-zA-Z]*)\n?([\s\S]*?)```/);
  return (m ? m[1] : String(t || '')).trim();
}

// A sandbox tool that loads the brain's code and calls its function on each case. The code is plain text inside a
// Function body, so a reply can't add imports; the sandbox itself stops files, programs and the internet.
export function codeTool(code, fn) {
  return `export function run(input) {
  const make = new Function(${JSON.stringify(`${code}\n;return typeof ${fn} === 'function' ? ${fn} : null;`)});
  const f = make();
  if (!f) return JSON.stringify({ missing: true });
  return JSON.stringify(input.cases.map((args) => { try { return { ok: true, v: f(...args) }; } catch (e) { return { ok: false }; } }));
}
`;
}
const same = (a, b) => (typeof a === 'number' && typeof b === 'number' ? Math.abs(a - b) < 1e-9 : JSON.stringify(a) === JSON.stringify(b));

// Run one pack against a llama-server. `sandbox` = { run(code, fn, cases) -> results | null } (null: the sandbox is
// unavailable on this machine, so the pack is skipped and says why). Returns { right, of, score, misses, tps, prefillTps }.
export async function runPack(url, id, { signal, onStep = () => {}, sandbox = null, holdAsks = [] } = {}) {
  if (EXTRA_IDS.includes(id)) return runExtraPack(url, id, { signal, onStep, sandbox, holdAsks });
  if (id === 'quiz') { const q = await runQuiz(url, { signal, onStep }); return { right: Object.values(q.parts).reduce((a, p) => a + p.right, 0), of: Object.values(q.parts).reduce((a, p) => a + p.of, 0), score: q.score, misses: q.misses.map((m) => m.q), tps: q.tps, prefillTps: q.prefillTps }; }
  const list = { reasoning: REASONING, sums: SUMS, rules: RULES, tools: PICK_TOOL, code: CODE }[id];
  if (!list) throw new Error(`There's no challenge called ${id}.`);
  if (id === 'code' && !sandbox) return { right: 0, of: list.length, score: null, skipped: 'My sandbox isn\'t working on this replicant matrix, so I won\'t run code a brain wrote. Self-made tools say why.', misses: [], tps: 0, prefillTps: 0 };
  let right = 0, done = 0; const misses = [], speeds = [], reads = [];
  for (const item of list) {
    if (signal?.aborted) throw new Error('Stopped.');
    const q = id === 'code' ? `${item.q} Reply with only the code.` : item[0];
    let ok = false;
    try {
      const a = await ask(url, q, { tools: id === 'tools' ? TOOLS : null, signal, max: id === 'code' ? 600 : 300 });
      if (a.tps) speeds.push(a.tps); if (a.prefillTps) reads.push(a.prefillTps);
      if (id === 'reasoning') ok = letterOf(a.text) === item[1];
      else if (id === 'sums') ok = numberOf(a.text) === item[1];
      else if (id === 'rules') ok = item[1](a.text);
      else if (id === 'tools') ok = a.calls[0] === item[1];
      else if (id === 'code') { const res = await sandbox.run(codeOf(a.text), item.fn, item.cases.map((c) => c[0])); ok = Array.isArray(res) && res.length === item.cases.length && res.every((r, i) => r.ok && same(r.v, item.cases[i][1])); }
    } catch (e) { if (signal?.aborted) throw e; }
    if (ok) right++; else misses.push(id === 'code' ? item.q : item[0].split('\n')[0]);
    onStep(++done, list.length);
  }
  const avg = (l) => (l.length ? l.reduce((a, b) => a + b, 0) / l.length : 0);
  return { right, of: list.length, score: Math.round((100 * right) / list.length), misses, tps: Math.round(avg(speeds) * 10) / 10, prefillTps: Math.round(avg(reads)) };
}

// The scoreboard file for one brain: <lab>/scores/<slug>.json. One row per brain, newest result per pack kept.
export function scoreFile(dir, slug) { return path.join(dir, `${slug}.json`); }
export function mergeScores(old, { name, sha256, sizeGB, quant, paramsB, activeB, experts, madeHere, packs, tps, prefillTps, when, engine, where }) {
  const out = { brain: { ...(old?.brain || {}), name, ...(sha256 ? { sha256 } : {}), ...(sizeGB ? { sizeGB } : {}), ...(quant ? { quant } : {}), ...(paramsB ? { paramsB } : {}), ...(activeB ? { activeB } : {}), ...(experts ? { experts } : {}), ...(madeHere ? { madeHere: true } : {}) }, packs: { ...(old?.packs || {}) }, when, ...(engine ? { engine } : {}), ...(where ? { where } : {}) };
  for (const [id, p] of Object.entries(packs)) out.packs[id] = { score: p.score, right: p.right, of: p.of, v: PACK_VERSION[id] || 1, ...(p.skipped ? { skipped: p.skipped } : {}), ...(p.parts ? { parts: Object.fromEntries(Object.entries(p.parts).map(([k, x]) => [k, { score: x.score, right: x.right, of: x.of }])) } : {}), when };
  const speed = { ...(old?.speed || {}) };
  if (tps) speed.tps = tps; if (prefillTps) speed.prefillTps = prefillTps;
  if (Object.keys(speed).length) out.speed = speed;
  return out;
}
export function readScores(dir) {
  let files = []; try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.json')); } catch {}
  return files.map((f) => { try { return { id: f.replace(/\.json$/, ''), ...JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')) }; } catch { return null; } }).filter((x) => x?.brain?.name);
}
// The scoreboard as rows for the page and for Save: one per brain, a cell per pack (null when not run).
export function scoreboard(list) {
  return list.map((s) => {
    const cur = (id) => { const p = s.packs?.[id]; return p && (p.v || 1) === PACK_VERSION[id] ? p : null; }; // an old version's score shows, greyed, but doesn't count
    const scores = Object.fromEntries(PACK_IDS.map((id) => [id, s.packs?.[id]?.score ?? null]));
    const old = PACK_IDS.filter((id) => s.packs?.[id] && !cur(id));
    const counted = RANKED_IDS.map((id) => cur(id)?.score).filter((x) => typeof x === 'number');
    // The overall mark counts packs not run as missing, never as skipped: a brain can't win by leaving out the hard one.
    const overall = counted.length ? Math.round(counted.reduce((a, x) => a + x, 0) / counted.length) : null;
    const b = s.brain;
    return { id: s.id, name: b.name, sizeGB: b.sizeGB ?? null, quant: b.quant || '', paramsB: b.paramsB ?? null, activeB: b.activeB ?? null, moe: Boolean(b.experts), madeHere: Boolean(b.madeHere), cls: classOf(b.paramsB), tps: s.speed?.tps ?? null, when: s.when || '', scores, old, overall, ran: counted.length, all: counted.length === RANKED_IDS.length, ...(s.packs?.guard?.parts && cur('guard') ? { guard: s.packs.guard.parts } : {}) };
  }).sort((a, b) => a.name.localeCompare(b.name));
}
// One class's board: brains that ran every current challenge first (so skipping the hard one never wins),
// then best overall, ties broken by speed, then by the smaller file.
export const boardOrder = (a, b) => Number(Boolean(b.all)) - Number(Boolean(a.all)) || (b.overall ?? -1) - (a.overall ?? -1) || (b.tps ?? 0) - (a.tps ?? 0) || (a.sizeGB ?? 0) - (b.sizeGB ?? 0);
export function classBoard(rows, cls) {
  return rows.filter((r) => r.cls === cls).sort(boardOrder);
}
