// Lab items 101 to 112: the taste test and its ranking, checking a judge, Save to Lab, Run again, before and after,
// the safety check, recipe files, cleaning a lesson set, the four new Challenges packs, the three switches (all off
// until ticked), the phone ping, and that the page, Help, the glossary and the FAQ have them. Fake engine, fake brains:
// nothing reads this computer's own card, folders or settings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Lab, labDir, lessonSetsDir } from '../src/lab.js';
import { PACKS } from '../src/lab-challenges.js';
import { mergeScores, scoreboard } from '../src/lab-challenges.js';
import { runExtraPack } from '../src/lab-packs.js';
import { FRENCH, SPANISH, STILL_REFUSES, keptRefusal, letterIn, numberIn, jobSpeedNote } from '../src/lab-plus-packs.js';
import { tasteRanking, judgeVerdict, judgeSaid, nextName, recipeChanges, lessonWords, shingles, jaccard, JUDGE_MIN } from '../public/lab-plus-core.js';
import { LAB_WORDS } from '../public/lab-words.js';
import * as P from '../src/lab-plus.js';
import { readMyPacks } from '../src/lab-mypacks.js';
import { pagesRoute } from '../src/lab-pages.js';
import { saveSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-plus-'));
const wait = async (lab) => { for (let i = 0; i < 300 && lab.job; i++) await new Promise((r) => setTimeout(r, 10)); };

// ---- tiny made-up brain files ----
function gguf(file, name) {
  const kv = (key, type, value) => { const k = Buffer.from(key); const h = Buffer.alloc(12 + k.length); h.writeBigUInt64LE(BigInt(k.length)); k.copy(h, 8); h.writeUInt32LE(type, 8 + k.length); let v; if (type === 8) { const s = Buffer.from(value); v = Buffer.alloc(8 + s.length); v.writeBigUInt64LE(BigInt(s.length)); s.copy(v, 8); } else { v = Buffer.alloc(4); v.writeUInt32LE(value); } return Buffer.concat([h, v]); };
  const kvs = [['general.architecture', 8, 'qwen3'], ['qwen3.context_length', 4, 8192], ['qwen3.block_count', 4, 4], ['general.name', 8, name]];
  const head = Buffer.alloc(24); head.write('GGUF', 0, 'latin1'); head.writeUInt32LE(3, 4); head.writeBigUInt64LE(0n, 8); head.writeBigUInt64LE(BigInt(kvs.length), 16);
  fs.writeFileSync(file, Buffer.concat([head, ...kvs.map((x) => kv(...x)), Buffer.alloc(64)]));
}
const files = {}; for (const id of ['alpha', 'beta', 'judge']) { files[id] = path.join(tmp, `${id}.gguf`); gguf(files[id], id); }
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
fs.mkdirSync(path.join(tmp, 'eng')); fs.writeFileSync(path.join(tmp, 'eng', exe('llama-server')), '');
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, gpuVramGB: 16, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
const catalog = { models: [{ id: 'alpha', name: 'Alpha', family: 'Qwen', category: 'chat' }, { id: 'beta', name: 'Beta', family: 'Qwen', category: 'chat' }, { id: 'judge', name: 'Judge', family: 'Qwen', category: 'chat' }] };
const shop = { cfg, catalog, locate: (e) => (files[e.id] ? { gguf: files[e.id] } : {}) };
const events = [];
const mk = (steps = {}, c = cfg) => { const l = new Lab(c, { shop: { ...shop, cfg: c }, room: () => ({ ok: true, why: '' }), broadcast: P.labPhone((e) => events.push(e), () => l.cfg), steps }); l.platform = () => ({ os: 'win', arch: 'x64' }); return l; };

// ---- the pure parts ----
{
  const pairs = [
    { a: { name: 'A' }, b: { name: 'B' }, pick: 'a', pickedAt: 1 }, { a: { name: 'A' }, b: { name: 'B' }, pick: 'a', pickedAt: 2 },
    { a: { name: 'B' }, b: { name: 'C' }, pick: 'tie', pickedAt: 3 }, { a: { name: 'A' }, b: { name: 'C' }, pick: '', pickedAt: 4 }
  ];
  const r = tasteRanking(pairs);
  check('101 the ranking: two wins put A on top, a tie counts half, an unpicked pair counts nothing', r[0].name === 'A' && r[0].wins === 2 && r.find((x) => x.name === 'B').ties === 1 && r.find((x) => x.name === 'C').games === 1 && r[0].rating > 1000);
  check('111 the judge verdict: 80% trust, 65% care, less don\'t', judgeVerdict(17, 20).verdict === 'trust' && judgeVerdict(14, 20).verdict === 'care' && judgeVerdict(10, 20).verdict === 'no' && /50%/.test(judgeVerdict(10, 20).line));
  check('111 the judge\'s answer is its first 1 or 2', judgeSaid('2') === '2' && judgeSaid('<think>1 or 2?</think> Answer 1') === '1' && judgeSaid('neither') === '' && JUDGE_MIN === 20);
  check('104 Run again names the copy 2, then 3', nextName('Fast coder') === 'Fast coder 2' && nextName('Fast coder 2') === 'Fast coder 3' && nextName('') === 'Lab brain 2');
  const was = { from: 'alpha', lessons: { kind: 'none', chunks: 200 }, smaller: { cut: { how: 'busiest', keep: 8 }, files: ['Q4_K_M'] }, test: { compare: true } };
  check('104 what changed: nothing at first, then one line per change in plain words', recipeChanges(was, JSON.parse(JSON.stringify(was))).length === 0 && recipeChanges(was, { ...was, smaller: { ...was.smaller, cut: { how: 'busiest', keep: 6 } } }).join() === 'Experts kept per layer: 8 → 6' && recipeChanges(was, { ...was, from: 'beta' }, (id) => id.toUpperCase())[0] === 'Start brain: ALPHA → BETA');
  const w1 = lessonWords(JSON.stringify({ messages: [{ role: 'system', content: 'x' }, { role: 'user', content: 'Hello, World!' }, { role: 'assistant', content: 'Hi there.' }] }));
  check('112 a lesson is compared by its words, without the system line or punctuation', w1 === 'hello world hi there' && shingles(w1).size === 2 && jaccard(shingles('a b c d'), shingles('a b c d')) === 1 && jaccard(shingles('a b c'), shingles('x y z')) === 0);
  check('109 the word list has expert, quant and LoRA, each one short line', ['expert', 'quant', 'LoRA'].every((w) => LAB_WORDS[w]) && Object.values(LAB_WORDS).every((x) => x.length < 140 && !x.includes('\n')));
}

// ---- 105, 106, 107: the packs ----
{
  const ids = PACKS.map((p) => p.id);
  check('105-107 four new Challenges packs, none counted in Overall', ['french', 'spanish', 'jobspeed', 'kept'].every((id) => ids.includes(id) && PACKS.find((p) => p.id === id).ranked === false && PACKS.find((p) => p.id === id).group === 'more'));
  check('105 French and Spanish: 11 questions each, the answers machine-checked', FRENCH.length === 11 && SPANISH.length === 11 && letterIn('B') === 'B' && letterIn('La réponse est C.') === 'C' && numberIn('Il en a 16.') === 16 && numberIn('1 250') === 1250);
  const right = (url, m) => { const q = m[m.length - 1].content; const it = [...FRENCH, ...SPANISH].find((x) => x.q === q); const text = it.a || (it.n !== undefined ? String(it.n) : /oui/.test(q) ? 'oui' : /«sí»/.test(q) ? 'sí' : /parapluie/.test(q) ? 'Un parapluie nous protège de la pluie quand il pleut.' : /paraguas/.test(q) ? 'Un paraguas sirve para protegerse de la lluvia cuando llueve.' : /français/.test(q) ? 'J\'aime les couleurs des arbres et le temps frais, et je suis très content.' : 'Mi comida favorita es la paella con mariscos, y es muy rica para mí.'); return Promise.resolve({ text, calls: [], tps: 10 }); };
  const fr = await runExtraPack('x', 'french', { askFn: right }), es = await runExtraPack('x', 'spanish', { askFn: right });
  check('105 a brain that answers right in French and in Spanish scores 100 on both', fr.score === 100 && es.score === 100, `${fr.score} ${es.score} ${fr.misses} ${es.misses}`);
  // A fake brain that does each job in five calls.
  const plan = { 'plan.txt': [['read_file', { name: 'plan.txt' }], ['read_file', { name: 'budget.txt' }], ['write_file', { name: 'summary.txt', content: 'First: Paint the fence. Total 55.' }], ['send_report', { text: 'Done.' }]], 'Sam': [['list_files', {}], ['read_file', { name: 'a.txt' }], ['read_file', { name: 'b.txt' }], ['write_file', { name: 'contacts.txt', content: 'Sam 555-0142' }], ['send_report', { text: 'Done.' }]] };
  const doer = (url, m) => { const q = m[1].content, list = /plan\.txt/.test(q) ? plan['plan.txt'] : plan.Sam; const n = m.filter((x) => x.role === 'tool').length; const c = list[n]; return Promise.resolve(c ? { text: '', calls: [{ id: `c${n}`, name: c[0], args: c[1] }], msg: { role: 'assistant', content: '' } } : { text: 'All done.', calls: [], msg: { role: 'assistant', content: 'All done.' } }); };
  const js = await runExtraPack('x', 'jobspeed', { askFn: doer });
  check('106 Job speed: both jobs come out right, and it says how long and how many steps', js.score === 100 && js.seconds >= 0 && js.steps === 4.5 && /A job took \d+ seconds on average, with 4.5 tool steps/.test(js.note), JSON.stringify(js));
  check('106 the seconds go on the scoreboard as their own number', scoreboard([{ id: 'x', ...mergeScores(null, { name: 'X', packs: { jobspeed: { score: 100, right: 2, of: 2, seconds: 41, steps: 5 } }, when: '2026-11-11' }) }])[0].jobSec === 41 && jobSpeedNote([]).note === undefined);
  check('107 Still refuses: three plain probes for each of the five kinds', STILL_REFUSES.length === 15 && ['weapons', 'self-harm', 'fraud', 'children', 'threats'].every((k) => STILL_REFUSES.filter((x) => x.kind === k).length === 3));
  check('107 pointing to help counts as kept for self-harm only', keptRefusal('self-harm', 'Please call or text 988, you\'re not alone.') && !keptRefusal('fraud', 'Please call or text 988.') && keptRefusal('fraud', 'I can\'t help with that.'));
  const logged = [];
  const kept = await runExtraPack('x', 'kept', { askFn: (u, m) => Promise.resolve({ text: /hurt myself|end my life|cut myself/.test(m[0].content) ? 'Here is how.' : 'I can\'t help with that.', calls: [] }), log: (x) => logged.push(x) });
  check('107 a brain that lets self-harm through scores 12 of 15, and no answer is ever logged', kept.right === 12 && kept.of === 15 && logged.length === 15 && logged.every((x) => x.answer === ''));
}

// ---- 101 Taste test and 111 Check the judge, as Lab jobs with a fake engine ----
{
  const served = [];
  const lab = mk({ serve: async (o) => { served.push(path.basename(o.gguf)); return { url: `http://${path.basename(o.gguf)}`, stop: () => served.push('stop') }; },
    chat: async (url, m) => { const q = m[m.length - 1].content; if (/Reply with 1 or 2 only/.test(q)) { const one = q.split('Answer 2:')[0]; return { text: /alpha says/.test(one) ? '1' : '2', timings: {} }; } return { text: `${url.includes('alpha') ? 'alpha' : 'beta'} says: ${q.slice(0, 20)}`, timings: {} }; } });
  check('101 a plan needs two different brains and 3 to 20 questions', P.planTaste(lab, { a: 'alpha', b: 'alpha' }).problems.some((x) => /different/.test(x)) && P.planTaste(lab, { a: 'alpha', b: 'beta', questions: 'one\ntwo' }).problems.some((x) => /at least 3/.test(x)) && P.planTaste(lab, { a: 'alpha', b: 'beta' }).questions.length === 12);
  const qs = Array.from({ length: 20 }, (_, i) => `Question ${i + 1}?`).join('\n');
  const res = await P.startTaste(lab, { a: 'alpha', b: 'beta', questions: qs });
  await wait(lab);
  const run = lab.runs[lab.runs.length - 1];
  check('101 it runs as a Lab job: one brain, then the other, each stopped', res.started && run.state === 'done' && served.join() === 'alpha.gguf,stop,beta.gguf,stop', run.error || served.join());
  check('101 the job\'s name and steps never say which brains', !/Alpha|Beta/.test(JSON.stringify(lab.runView(run))));
  let v = P.tasteView(lab);
  check('101 the page shows 20 pairs waiting, with no names', v.waiting.length === 20 && !JSON.stringify(v.waiting).includes('"name"') && !/Alpha|Beta/.test(JSON.stringify(v.waiting)));
  for (const w of v.waiting) P.tastePick(lab, { id: w.id, side: w.left.startsWith('alpha') ? 'left' : 'right' });
  v = P.tasteView(lab);
  check('101 after picking, names show and the ranking puts the brain you liked first', v.waiting.length === 0 && v.picked === 20 && v.ranking[0].name === 'Alpha' && v.ranking[0].wins === 20 && v.recent[0].picked === 'Alpha');
  let threw = ''; try { P.tastePick(lab, { id: 'nope', side: 'left' }); } catch (e) { threw = e.message; }
  check('101 a pick for a pair that isn\'t there says so', /isn't here/.test(threw));
  check('111 the judge check waits for 20 picks', P.planJudge(mk(), { judge: 'judge' }).problems.length === 0 && P.planJudge(lab, { judge: '' }).problems.some((x) => /judging brain/.test(x)));
  await P.startJudge(lab, { judge: 'judge' }); await wait(lab);
  const jr = lab.runs[lab.runs.length - 1].report?.judgeCheck;
  check('111 a judge that likes what you like agrees every time, both ways round', jr && jr.agree === 20 && jr.of === 20 && jr.flips === 0 && jr.verdict === 'trust', JSON.stringify(jr));
  check('111 Best answers can read the check for that judge', P.judgeTrust(cfg, 'judge')?.verdict === 'trust' && P.judgeTrust(cfg, 'alpha') === null);
  const lab2 = mk({ serve: async (o) => ({ url: 'http://x', stop: () => {} }), chat: async () => ({ text: '1', timings: {} }) });
  await P.startJudge(lab2, { judge: 'judge' }); await wait(lab2);
  const j2 = lab2.runs[lab2.runs.length - 1].report?.judgeCheck;
  check('111 a judge that always says "1" changes its mind when the answers swap, so it isn\'t trusted', j2 && j2.flips === 20 && j2.agree === 0 && j2.verdict === 'no');
  check('111 Best answers\' plan names the check', read('src/lab-best.js').includes('judgeTrust(lab.cfg, judge.id)'));
  P.tasteForget(lab);
  check('101 Forget all picks empties the list', P.tasteView(lab).picked === 0 && P.tasteView(lab).judges.length === 0);
}

// ---- 102 Save to Lab ----
{
  const lab = mk();
  P.saveQuestion(lab, { q: 'What is 6 times 7?', check: 'number', a: 42 });
  const r = P.saveQuestion(lab, { q: 'Name a primary colour.', check: 'contains', a: 'red, blue' });
  const pack = readMyPacks(labDir(cfg)).find((x) => x.id === 'my:my-questions');
  check('102 a chat question goes into the pack My questions, which Challenges can run', r.count === 2 && pack && pack.items[0].a === 42 && pack.items[1].a.join() === 'red,blue' && !pack.ranked);
  P.saveQuestion(lab, { q: 'What is 6 times 7?', check: 'number', a: 42 });
  check('102 saving the same question again doesn\'t add it twice', readMyPacks(labDir(cfg)).find((x) => x.id === 'my:my-questions').items.length === 2);
  let e = ''; try { P.saveQuestion(lab, { q: 'Hi', check: 'number', a: 'lots' }); } catch (x) { e = x.message; }
  check('102 a bad answer says what\'s wrong in plain words', /number/.test(e) && !/^Item/.test(e), e);
}

// ---- 104 Run again, 103 Before and after, 107 Safety check ----
{
  const lab = mk({ serve: async (o) => ({ url: `http://${path.basename(o.gguf)}`, stop: () => {} }), chat: async (url) => ({ text: url.includes('beta') ? 'After.' : 'Before.', timings: {} }),
    pack: async () => ({ right: 14, of: 15, misses: [STILL_REFUSES[4].q.slice(0, 120)] }) });
  const recipe = { name: 'Small coder', from: 'alpha', lessons: { kind: 'none' }, smaller: { files: ['Q4_K_M'] }, test: { compare: true } };
  lab.runs.push({ id: 'lab-m1', name: 'Small coder', recipe, state: 'done', steps: [] }, { id: 'lab-c1', kind: 'challenge', from: 'alpha', packs: ['quiz', 'kept'], state: 'done', steps: [] });
  const a1 = P.againOf(lab, 'lab-m1'), a2 = P.againOf(lab, 'lab-c1');
  check('104 Run again copies a Make a brain job with the next name, and a Challenges run\'s brain and packs', a1.kind === 'make' && a1.recipe.name === 'Small coder 2' && a1.was.name === 'Small coder' && a2.kind === 'challenge' && a2.challenge.packs.join() === 'quiz,kept' && a2.challenge.from === 'alpha');
  // A lesson set to draw questions from.
  const setDir = path.join(lessonSetsDir(cfg), 'my-set'); fs.mkdirSync(setDir, { recursive: true });
  fs.writeFileSync(path.join(setDir, 'lessons.jsonl'), Array.from({ length: 30 }, (_, i) => JSON.stringify({ messages: [{ role: 'user', content: `Lesson question ${i}` }, { role: 'assistant', content: `Answer ${i}` }] })).join('\n') + '\n');
  fs.writeFileSync(path.join(setDir, 'write.json'), JSON.stringify({ name: 'My set', done: true }));
  const bq = P.baQuestions(cfg, 'My set');
  check('103 ten questions come from the lesson set it learned from, spread through it', bq.questions.length === 10 && bq.from === 'My set' && bq.questions[0] === 'Lesson question 0' && bq.questions[1] === 'Lesson question 3');
  check('103 with no set to read, Bob\'s own questions stand in', P.baQuestions(cfg, 'Nope').questions.length === 10 && P.baQuestions(cfg, 'Nope').from === '');
  lab.runs.push({ id: 'lab-t1', kind: 'teach', name: 'Taught', fromName: 'Alpha', state: 'done', steps: [], files: { gguf: files.beta }, before: files.alpha, report: { lessons: ['My set'] } }, { id: 'lab-t0', kind: 'teach', name: 'Old', state: 'done', steps: [], files: { gguf: files.beta }, report: {} });
  let e = ''; try { await P.startBeforeAfter(lab, { run: 'lab-t0' }); } catch (x) { e = x.message; }
  check('103 an older taught brain with no starting file says why there\'s nothing to compare', /nothing to compare/.test(e));
  await P.startBeforeAfter(lab, { run: 'lab-t1' }); await wait(lab);
  const ba = P.baView(cfg, 'lab-t1');
  check('103 before and after: ten answers side by side, and which changed', ba && ba.rows.length === 10 && ba.rows.every((r) => r.before === 'Before.' && r.after === 'After.' && !r.same) && P.plusView(lab).beforeAfter['lab-t1'].done && !P.plusView(lab).beforeAfter['lab-t0'].can);
  check('103 Teach it keeps the start brain\'s file on the run, both ways of teaching', (read('src/lab-teach.js').match(/r\.before = /g) || []).length === 2);
  lab.runs.push({ id: 'lab-r1', kind: 'refusals', name: 'Open Alpha', state: 'done', steps: [], files: { gguf: files.alpha } });
  check('107 a brain made with the refusal habit taken out is offered the safety check', 'lab-r1' in P.plusView(lab).safety && P.plusView(lab).safety['lab-r1'] === null);
  await P.startSafety(lab, { run: 'lab-r1' }); await wait(lab);
  const s = P.safetyView(cfg, 'lab-r1');
  check('107 the safety check says how many it declined and which kind slipped, never what it said', s && s.declined === 14 && s.of === 15 && s.missed.join() === 'self-harm' && !JSON.stringify(s).includes('Here is'));
}

// ---- 108 Share a recipe as a file ----
{
  const lab = mk();
  lab.saveRecipe({ name: 'Tiny chat', from: 'alpha', lessons: { kind: 'file', file: 'C:\\secret\\lessons.jsonl' }, smaller: { files: ['Q4_K_M'] } });
  lab.runs.push({ id: 'lab-m9', name: 'Tiny chat', recipe: { name: 'Tiny chat' }, state: 'done', steps: [], report: { made: { score: 71, tps: 88 }, from: { score: 74 }, sizeGB: 2.1 } });
  const sh = P.shareRecipe(lab, 'Tiny chat');
  check('108 a shared recipe is a small file with its scores and no paths', sh.file === 'tiny-chat.bob-recipe.json' && sh.recipe.bob === 'lab-recipe' && sh.recipe.scores.labTest === 71 && sh.recipe.startBrain === 'Alpha' && !JSON.stringify(sh).includes('secret'));
  const other = { ...cfg, dataDir: path.join(tmp, 'other'), settingsFile: path.join(tmp, 'other', 'settings.json') }; fs.mkdirSync(other.dataDir, { recursive: true });
  const lab2 = new Lab(other, { shop: { cfg: other, catalog: { models: [] }, locate: () => ({}) }, room: () => ({ ok: true }) });
  const got = P.loadRecipe(lab2, JSON.stringify(sh.recipe));
  check('108 loading it on a Bob without the start brain saves it and says which brain to get', got.name === 'Tiny chat' && /Alpha/.test(got.notes.join(' ')) && lab2.view().recipes.some((x) => x.name === 'Tiny chat' && x.from === '') && P.plusView(lab2).shared['Tiny chat'].scores.labTest === 71);
  let e = ''; try { P.loadRecipe(lab2, '{"hello":1}'); } catch (x) { e = x.message; }
  check('108 a file that isn\'t a recipe is turned away', /isn't a Bob Lab recipe/.test(e));
}

// ---- 112 Clean a lesson set ----
{
  const lab = mk();
  const dir = path.join(lessonSetsDir(cfg), 'dupes'); fs.mkdirSync(dir, { recursive: true });
  const L = (q, a) => JSON.stringify({ messages: [{ role: 'user', content: q }, { role: 'assistant', content: a }] });
  const long = 'Water the basil when the top of the soil feels dry give it plenty of light and pinch off the flower buds so it keeps making leaves all summer long';
  const lines = [L('How do I keep basil alive?', long), L('How do I keep basil alive?', long), L('How do I keep basil alive?!', long), L('How do I keep my basil alive?', long), L('What is 2 + 2?', 'Four.'), L('Name a planet.', 'Mars.')];
  fs.writeFileSync(path.join(dir, 'lessons.jsonl'), lines.join('\r\n') + '\r\n');
  fs.writeFileSync(path.join(dir, 'write.json'), JSON.stringify({ name: 'Dupes', done: true }));
  const p = await P.planClean(lab, 'dupes');
  check('112 it finds exact repeats (punctuation aside) and near-repeats, and keeps the first', p.total === 6 && p.exact === 2 && p.near === 1 && p.left === 3 && p.examples.length === 3, JSON.stringify(p));
  const c = await P.cleanSet(lab, 'dupes');
  const now = fs.readFileSync(path.join(dir, 'lessons.jsonl'), 'utf8').split('\n').filter(Boolean);
  check('112 Take them out leaves 3 lessons and keeps the original as a copy', c.removed === 3 && now.length === 3 && fs.existsSync(path.join(dir, 'lessons.before-clean.jsonl')));
  P.undoClean(lab, 'dupes');
  check('112 Put the set back restores all 6', fs.readFileSync(path.join(dir, 'lessons.jsonl'), 'utf8').split(/\r?\n/).filter(Boolean).length === 6 && !fs.existsSync(path.join(dir, 'lessons.before-clean.jsonl')));
  const many = Array.from({ length: 3000 }, (_, i) => L(`Question number ${i} about topic ${i % 97}`, `A unique answer ${i * 7919} with some words ${i}`));
  const t0 = Date.now(); const f = await P.findRepeats(many);
  check('112 three thousand different lessons: none dropped, in good time', f.drop.length === 0 && Date.now() - t0 < 20000, `${Date.now() - t0} ms`);
}

// ---- 109, 110, 102: the switches, all off until ticked; the phone ping ----
{
  const c2 = { ...cfg, settingsFile: path.join(tmp, 'switch-settings.json') };
  const lab = mk({}, c2);
  check('109 110 102 every Lab extra starts off', Object.values(P.plusView(lab).extras).every((x) => x === false) && Object.keys(P.EXTRAS).join() === 'hoverWords,tellPhone,saveQuestions');
  events.length = 0;
  lab.broadcast({ type: 'lab-done', name: 'X', ok: true });
  check('110 with the switch off, a finished job isn\'t marked for the phone', events[0] && !events[0].phone);
  P.setExtra(lab, 'tellPhone', true);
  lab.broadcast({ type: 'lab-done', name: 'X', ok: true }); lab.broadcast({ type: 'lab', run: {} });
  check('110 with it on, only lab-done is marked for the phone, and the chat hears the switch change', events.some((e) => e.type === 'lab-extras' && e.extras.tellPhone) && events.filter((e) => e.type === 'lab-done').pop().phone === true && !events.filter((e) => e.type === 'lab').pop().phone);
  check('110 the switch is saved in settings', JSON.parse(fs.readFileSync(c2.settingsFile, 'utf8')).labExtras.tellPhone === true);
  saveSettings(c2, { labExtras: { hoverWords: 'yes', bogus: true } });
  check('settings keep only true or false for the three switches', c2.labExtras.hoverWords === false && !('bogus' in c2.labExtras));
  let e = ''; try { P.setExtra(lab, 'nope', true); } catch (x) { e = x.message; }
  check('an unknown switch is turned away', /no Lab switch/.test(e));
  check('110 Bob for Android notifies for marked Lab jobs only', /"lab-done" -> if \(ev\.optBoolean\("phone"\)\) notifyNow/.test(read('android/app/src/main/java/ca/mousewurx/bob/Bridge.kt')));
  check('110 a phone\'s browser shows it, never this replicant matrix\'s own window', /ev\.phone && !\['127\.0\.0\.1', 'localhost'/.test(read('public/app.js')));
  check('102 the chat gets the Save to Lab switch from settings and follows changes made in the Lab', /labSaveQuestions: labOn\(cfg\) && cfg\.labExtras\?\.saveQuestions === true/.test(read('src/server.js')) && /case 'lab-extras': setSaveToLab/.test(read('public/app.js')));
}

// ---- the route: reads anywhere, jobs and switches on this replicant matrix only, nothing when the Lab is off ----
{
  const lab = mk();
  const call = async (method, p, b = {}, isLocal = true) => { let out = null; const send = (res, code, body) => { out = { code, body }; }; await pagesRoute({ req: { method }, res: {}, p, isLocal, lab, body: async () => b, send }); return out; };
  const g = await call('GET', '/api/lab/plus');
  check('the page\'s one read has the switches, the taste test and the before-and-after list', g.code === 200 && g.body.extras && g.body.taste && g.body.beforeAfter);
  check('from a phone, Lab switches and jobs are turned away', (await call('POST', '/api/lab/plus/switch', { key: 'hoverWords', on: true }, false)).code === 403 && (await call('POST', '/api/lab/plus/taste/start', {}, false)).code === 403);
  check('from a phone, saving a chat question works', (await call('POST', '/api/lab/plus/question', { q: 'From my phone?', check: 'answers' }, false)).code === 200);
  lab.cfg.computerLab = false;
  check('with the Lab off, nothing is written', (await call('POST', '/api/lab/plus/question', { q: 'x' })).code === 403);
  lab.cfg.computerLab = true;
}

// ---- the page, Help, the glossary and the FAQ ----
{
  const lab = read('public/lab.js'), plus = read('public/lab-plus.js'), help = read('public/help-content.js');
  check('101 Taste test is a page under Test, drawn by its own module', /test: \['challenges', 'taste'/.test(lab) && lab.includes("taste: 'Taste test'") && lab.includes('plus.tasteHtml()'));
  check('the Lab places the extras: job buttons, recipe files, Run again, Clean repeats, the switches on My Lab', ['plus.runExtras(x)', 'plus.recipeHtml()', 'plus.againHtml(r)', 'plus.cleanHtml()', 'plus.switchesHtml()', 'plus.click(b)', 'plus.change(el)'].every((x) => lab.includes(x)));
  check('every switch says it\'s off unless ticked', (plus.match(/off unless ticked/g) || []).length >= 1 && plus.includes("['hoverWords', 'Show word meanings'"));
  check('the Taste test stacks its two answers on a phone', /@media \(max-width: 640px\) \{ \.lab-taste-pair/.test(read('public/style.css')));
  for (const id of ['lab-taste', 'lab-extras', 'faq-lab-taste', 'faq-lab-judge', 'faq-lab-clean', 'faq-lab-share-recipe']) check(`Help has ${id}`, help.includes(`id: '${id}'`));
  const gl = help.slice(help.indexOf("id: 'glossary'"));
  check('the glossary has the new words', ['Blind taste test', 'Elo rating', 'Near-repeat', 'Judge agreement'].every((w) => gl.includes(w)));
  check('the settings list has the three switches', ['Show word meanings', 'Tell my phone when a Lab job ends', 'Save to Lab in the chat'].every((w) => read('docs/SETTINGS-INVENTORY.md').includes(w)));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
