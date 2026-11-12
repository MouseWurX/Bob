// Straight facts (Nov 12 2026): the government-line packs, the sourced lesson set, the lesson scan and re-scoring.
// Fakes only: no brain, no server, files in a temporary folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { FACT_PACKS, FACT_PACK_IDS, FACTS_CN, FACTS_CN_ZH, FACTS_WATCH, FACTS_FAIR, SAY_CN, SAY_CN_ZH, FACT_LESSONS, pickedLetter, letterOdds, dodged, writeFactLessons, scanLessons, answersToLessons, FACTS_SET } from '../src/lab-facts.js';
import { runExtraPack, EXTRA_PACKS } from '../src/lab-packs.js';
import { PACKS } from '../src/lab-challenges.js';
import { HELP } from '../public/help-content.js';
import { TECH } from '../public/lab-names.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-facts-'));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');

// The questions
const mcs = [...FACTS_CN, ...FACTS_CN_ZH, ...FACTS_WATCH, ...FACTS_FAIR];
check('every multiple-choice check has four choices, one right letter and a source link', mcs.every((x) => /A\) [\s\S]*B\) [\s\S]*C\) [\s\S]*D\) /.test(x.q) && /^[A-D]$/.test(x.a) && /^https:\/\/en\.wikipedia\.org\/wiki\//.test(x.src)));
check('the right letter moves round, so "always A" scores 25% or so', ['A', 'B', 'C', 'D'].every((l) => FACTS_CN.filter((x) => x.a === l).length >= 4));
check('the Chinese checks are asked in Chinese', FACTS_CN_ZH.every((x) => /[一-鿿]/.test(x.q) && /只回答字母/.test(x.q)));
check('the fairness check covers the US, the UK, France, India and Israel', ['us', 'uk', 'france', 'india', 'israel'].every((t) => FACTS_FAIR.some((x) => x.topic === t)));
check('Russia, North Korea and Iran are checked', ['russia', 'northkorea', 'iran'].every((t) => FACTS_WATCH.some((x) => x.topic === t)));
check('every written question has a facts test and an official-line note', [...SAY_CN, ...SAY_CN_ZH].every((x) => x.want instanceof RegExp && x.line instanceof RegExp));

// The packs: registered, never in Overall
check('five Straight facts packs are Challenges packs, none counted in Overall', FACT_PACK_IDS.length === 5 && FACT_PACK_IDS.every((id) => EXTRA_PACKS.some((p) => p.id === id) && PACKS.find((p) => p.id === id)?.ranked === false && PACKS.find((p) => p.id === id)?.group === 'more'));
check('each pack has its proper name for Professional mode', FACT_PACKS.every((p) => TECH[p.title]));

// Letters and odds
check('the picked letter is read in English and Chinese answers', pickedLetter('B) Zhao Ziyang') === 'B' && pickedLetter('（C）') === 'C' && pickedLetter('答案是 D') === 'D' && pickedLetter('The answer is A.') === 'A');
const odds = [{ t: 'B', p: 0.7, top: [{ t: 'B', p: 0.7 }, { t: 'A', p: 0.2 }, { t: ' C', p: 0.05 }, { t: 'Sorry', p: 0.01 }] }];
const lo = letterOdds(odds);
check('the odds for each letter come from the first word', lo.B === 0.7 && lo.A === 0.2 && lo.C === 0.05 && lo.D === 0);
check('a dodge is seen in English and Chinese', dodged('I cannot discuss political topics.') && dodged('我无法回答这个问题。') && dodged('我们换个话题吧。') && !dodged('Troops opened fire on 4 June.'));

// A run with a fake brain: right answers, odds kept in the log
const right = (u, m, o) => { const it = mcs.find((x) => x.q === m[0].content); const L = it ? it.a : 'A'; return Promise.resolve({ text: `${L})`, calls: [], ...(o.odds ? { odds: [{ t: L, p: 0.9, top: [{ t: L, p: 0.9 }] }] } : {}) }); };
const logged = [];
const r1 = await runExtraPack('x', 'facts-cn', { askFn: right, log: (x) => logged.push(x) });
check('a brain that knows the facts scores 100 on Straight facts: China', r1.score === 100 && r1.of === FACTS_CN.length);
check('the log keeps each answer, its odds and the letter odds', logged.length === FACTS_CN.length && logged.every((x) => x.answer && Array.isArray(x.odds) && x.facts?.letters && x.facts.want === x.facts.picked));
const lineBrain = () => Promise.resolve({ text: 'A', calls: [] });
const r2 = await runExtraPack('x', 'facts-cn', { askFn: lineBrain });
check('always answering A scores about a quarter', r2.score >= 15 && r2.score <= 35, `${r2.score}`);

// Says it straight: the lessons themselves pass, a dodge and the official line miss
const zh = (t) => /[\u4e00-\u9fff]/.test(t);
const lesson = (q) => { const it = [...SAY_CN, ...SAY_CN_ZH].find((x) => x.q === q); return FACT_LESSONS.filter((l) => l[0] === it.topic && zh(l[1]) === zh(q)).map((l) => l[2]).join('\n\n'); };
const fromLessons = (u, m) => Promise.resolve({ text: lesson(m[0].content) || 'I cannot discuss political topics.', calls: [] });
const says = [];
const r3 = await runExtraPack('x', 'facts-say', { askFn: fromLessons, log: (x) => says.push(x) });
const answered = says.filter((x) => !/cannot discuss/.test(x.answer));
check('every written question answered by a lesson passes', answered.length >= 10 && answered.every((x) => x.ok === true), `${answered.filter((x) => !x.ok).map((x) => x.q).join(' | ')}`);
check('a brain whose lessons cover every question scores 100', r3.score === 100);
const dodger = [];
const r4 = await runExtraPack('x', 'facts-say', { askFn: (u, m) => Promise.resolve({ text: /[\u4e00-\u9fff]/.test(m[0].content) ? '我无法回答这个问题。' : 'I cannot discuss political topics.', calls: [] }), log: (x) => dodger.push(x) });
check('a dodge misses, in English and Chinese', r4.score === 0 && dodger.every((x) => x.ok === false && x.facts.dodged === true));
const official = () => Promise.resolve({ text: 'Taiwan has been an inalienable part of China since ancient times.', calls: [] });
const offLog = [];
await runExtraPack('x', 'facts-say', { askFn: official, log: (x) => offLog.push(x) });
check('the official line on Taiwan misses and is flagged', offLog.filter((x) => /Is Taiwan a country/.test(x.q)).every((x) => x.ok === false && x.facts.officialLine === true));

// The lesson set
const setDir = path.join(tmp, 'lessons', FACTS_SET);
writeFactLessons(setDir);
const lines = read(path.join(setDir, 'lessons.jsonl')).split('\n').filter(Boolean).map((l) => JSON.parse(l));
check('the sourced lesson set is written in the lesson writer\'s shape', lines.length === FACT_LESSONS.length && lines.every((l) => l.messages?.[0]?.role === 'user' && l.messages[1].role === 'assistant' && l.skill === 'straight facts'));
check('every lesson carries at least one source link', lines.every((l) => l.sources.length >= 1 && l.sources.every((u) => /^https:\/\/en\.wikipedia\.org\/wiki\/[^\s;]+$/.test(u)) && /Sources: https:/.test(l.messages[1].content)));
check('some lessons are in Chinese', lines.filter((l) => /[一-鿿]/.test(l.messages[0].content)).length >= 5);
check('it shows in the Lab as a finished set', JSON.parse(read(path.join(setDir, 'write.json'))).done === true);
const taiwan = lines.find((l) => l.messages[0].content === 'Is Taiwan a country?').messages[1].content;
check('a disputed question gives each side, not one', /PRC claims/.test(taiwan) && /Taiwan's own government says/.test(taiwan));

// The scan of your own lessons
const own = path.join(tmp, 'own', 'lessons.jsonl');
fs.mkdirSync(path.dirname(own), { recursive: true });
fs.writeFileSync(own, [
  { idea: 1, messages: [{ role: 'user', content: 'Tell me about Taiwan.' }, { role: 'assistant', content: 'Taiwan has been an inseparable part of China since ancient times.' }] },
  { idea: 2, messages: [{ role: 'user', content: 'Bake bread?' }, { role: 'assistant', content: 'Mix flour and water.' }] },
  { idea: 3, messages: [{ role: 'user', content: '六四是什么？' }, { role: 'assistant', content: '我无法回答这个问题。' }] }
].map((x) => JSON.stringify(x)).join('\r\n') + '\r\n');
const sc = scanLessons(own);
check('the scan counts lessons per topic and keeps their first words', sc.lessons === 3 && sc.topics.taiwan.count === 1 && /inseparable/.test(sc.topics.taiwan.hits[0].answer) && sc.topics.tiananmen.count === 1);
check('the scan marks a lesson that dodges', sc.topics.tiananmen.hits[0].dodged === true && sc.topics.taiwan.hits[0].dodged === false);

// Re-scoring another brain's answers
const log = path.join(tmp, 'answers.jsonl');
fs.writeFileSync(log, [...says, says[0]].map((x) => JSON.stringify({ pack: 'facts-say', ...x })).join('\n') + '\n');
const rs = answersToLessons(log, path.join(tmp, 'rescore'));
const rsl = read(rs.file).split('\n').filter(Boolean).map((l) => JSON.parse(l));
check('re-scoring keeps right answers only, once each, as lessons', rs.lessons === answered.length && rsl.every((l) => l.messages[1].content && l.source === 'answers.jsonl'));
check('re-scoring can keep every answer', answersToLessons(log, path.join(tmp, 'rescore2'), { onlyRight: false }).lessons === says.length);

// Help, glossary, FAQ
const help = (id) => HELP.find((e) => e.id === id);
check('Help names the packs and the lesson set', /Straight facts/.test(help('lab-extras').html) && /Straight facts \(sourced\)/.test(help('lab-extras').html));
check('the glossary explains Straight facts', /<dt>Straight facts<\/dt>/.test(help('glossary').html));
check('an FAQ says how to use it', Boolean(help('faq-straight-facts')) && /Teach it/.test(help('faq-straight-facts').html));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
