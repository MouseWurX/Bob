// Lab, Learn, Lessons (15 Nov 2026): the course's data, Try it against a fake engine, progress in a temp folder, the
// route's off switch, and the page, setting, Help and glossary wiring. Never reads the real computer: the engine, its
// replies and the brain file's facts are all passed in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LEVELS, UNITS, LESSONS, LESSON_PAGES, cleanTry, runTry, factsOf, ggufTour, readProgress, markDone, resetProgress, lessonsRoute, LONG_TEXT, WEATHER_TOOL } from '../src/lab-lessons.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');

// ---- the course ----
const KINDS = ['tokens', 'next', 'temps', 'context', 'facts', 'chat', 'gguf', 'page'];
check('three levels: Foundations, Advanced, Engineering', LEVELS.map((l) => l.id).join(' ') === 'foundations advanced engineering');
check('every unit sits in a level', UNITS.every((u) => LEVELS.some((l) => l.id === u.level)));
check('Foundations has the five units in order', UNITS.filter((u) => u.level === 'foundations').map((u) => u.title).join('|') === 'Words|Inside a brain|Talking to a brain|Changing a brain|Judging a brain');
check('Engineering starts with Build the tools', UNITS.find((u) => u.level === 'engineering')?.id === 'tools' && LESSONS.filter((l) => l.unit === 'tools').length === 3);
check('every unit in every level has lessons', UNITS.every((u) => LESSONS.some((l) => l.unit === u.id)), UNITS.filter((u) => !LESSONS.some((l) => l.unit === u.id)).map((u) => u.id).join(','));
check('lesson ids are unique', new Set(LESSONS.map((l) => l.id)).size === LESSONS.length);
check('every lesson is in a unit, has a title, a proper name and something to read', LESSONS.every((l) => UNITS.some((u) => u.id === l.unit) && l.title && l.pro && l.read.length >= 1));
check('every Try it is a known kind', LESSONS.every((l) => KINDS.includes(l.try.kind)), LESSONS.filter((l) => !KINDS.includes(l.try.kind)).map((l) => l.id).join(','));
check('every page link goes to a real Lab tab', LESSONS.filter((l) => l.try.kind === 'page').every((l) => LESSON_PAGES[l.try.page]));
const labTabs = [...read('public/lab.js').match(/const TABS = (\[\[.*?\]\]);/)[1].matchAll(/\['(\w+)'/g)].map((m) => m[1]);
check('the page links match the Lab\'s own tabs', Object.values(LESSON_PAGES).every((t) => labTabs.includes(t)));
check('every lesson has two questions, each with exactly one right answer and a why for every answer', LESSONS.every((l) => l.check.length === 2 && l.check.every((q) => q.answers.length >= 2 && q.answers.filter((a) => a.right).length === 1 && q.answers.every((a) => a.t && a.why))));
check('the right answer is not always first', LESSONS.flatMap((l) => l.check).some((q) => !q.answers[0].right));
check('lessons follow units in order (the list reads top to bottom)', LESSONS.every((l, i) => i === 0 || UNITS.findIndex((u) => u.id === l.unit) >= UNITS.findIndex((u) => u.id === LESSONS[i - 1].unit)));
check('Real results name a published doc that exists', LESSONS.filter((l) => l.real).length >= 4 && LESSONS.filter((l) => l.real).every((l) => l.real.text && fs.existsSync(fileURLToPath(new URL(`../${l.real.from}`, import.meta.url)))));
check('From the research: authors, year and an https link, kept apart from Real results (16 Nov)', LESSONS.filter((l) => l.cite).length >= 5 && LESSONS.filter((l) => l.cite).every((l) => l.cite.text && /\(\d{4}\)/.test(l.cite.who) && /^https:\/\//.test(l.cite.url) && l.cite.text !== l.real?.text));
check('the MoE unit has its router health lesson', LESSONS.some((l) => l.id === 'routerhealth' && l.unit === 'moe'));
check('Real results carry no unchecked figures (fact-check, Nov 15)', !LESSONS.some((l) => /6 to 9|72 to 76/.test(l.real?.text || '')));
check('lesson words carry no folders', !/[A-Z]:\\|\/home\/|\/Users\//.test(JSON.stringify(LESSONS)));

// ---- what Try it may send ----
check('cleanTry: unknown lesson', !cleanTry({ id: 'nope' }).lesson);
check('cleanTry: text is cut short, except for Context', cleanTry({ id: 'tokens', text: 'x'.repeat(5000) }).text.length === 2000 && cleanTry({ id: 'context', text: 'x'.repeat(50000) }).text.length === LONG_TEXT);
check('cleanTry: a non-string text is dropped', cleanTry({ id: 'tokens', text: { a: 1 } }).text === '');

// ---- Try it against a fake engine ----
const calls = [];
const fakeFetch = async (url, init) => {
  const body = JSON.parse(init.body); calls.push({ url, body });
  const ok = (j) => ({ ok: true, json: async () => j });
  if (url.endsWith('/tokenize')) return ok({ tokens: body.with_pieces ? [{ id: 1, piece: 'Hi' }, { id: 2, piece: ' there' }] : [1, 2, 3, 4] });
  if (url.endsWith('/completion')) return ok({ content: ' sunny', completion_probabilities: [{ token: ' Paris', top_logprobs: [{ token: ' Paris', logprob: -0.1 }, { token: ' a', logprob: -3 }] }] });
  if (url.endsWith('/v1/chat/completions')) {
    if (body.tools) return ok({ choices: [{ message: { content: '', tool_calls: [{ function: { name: 'get_weather', arguments: '{"city":"Calgary"}' } }] } }] });
    const sys = body.messages[0].role === 'system' ? body.messages[0].content : '';
    if (body.chat_template_kwargs?.enable_thinking) return ok({ choices: [{ message: { content: '5 cents.', reasoning_content: 'Ball x, bat x+1...' } }] });
    return ok({ choices: [{ message: { content: `<think>hidden</think>${sys ? 'Arr' : '10 cents.'}` } }] });
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
const engine = { url: 'http://fake', current: 'brain-a', child: { exitCode: null }, currentCtx: 8192, active: 0, now: () => 1, resolve: () => ({ gguf: 'fake.gguf' }) };
const brain = { cfg: { engine: 'llamacpp' }, engine };
const opts = { fetch: fakeFetch, exists: () => true, readFacts: () => ({ name: 'Fake', engineLayers: 40, layers: 41, paramsB: 35, activeB: 3, experts: 256, used: 8, fileType: 'Q4_K_M', fullSize: false, size: 20e9, params: 35e9 }),
  readGguf: () => ({ version: 3, meta: { 'general.architecture': 'qwen', 'general.name': 'Fake', 'qwen.block_count': 41, 'qwen.expert_count': 256, secret: 'x' }, tensors: Array.from({ length: 10 }, (_, i) => ({ name: `blk.${i}.w`, dims: [4n, 2n], type: 12, offset: BigInt(i * 8) })), dataStart: 4096 }) };

const tok = await runTry(brain, { id: 'tokens', text: 'Hi there' }, opts);
check('Tokens: splits into pieces', tok.kind === 'tokens' && tok.tokens.length === 2 && tok.tokens[1].text === ' there');
const nx = await runTry(brain, { id: 'odds' }, opts);
check('Next-word odds: uses the lesson\'s own start when none is typed', nx.kind === 'next' && nx.top.length >= 1 && calls.at(-1).body.prompt === LESSONS.find((l) => l.id === 'odds').try.text);
calls.length = 0;
const tp = await runTry(brain, { id: 'temperature', text: 'Rain is' }, opts);
check('Temperature: two cold and two hot', tp.cold.length === 2 && tp.hot.length === 2 && calls.some((c) => c.body.temperature === 0.2) && calls.some((c) => c.body.temperature === 1.5));
const cx = await runTry(brain, { id: 'context', text: 'abcd' }, opts);
check('Context: counts tokens against the context', cx.tokens === 4 && cx.ctx === 8192 && cx.share === Math.round((4 / 8192) * 1000) / 10);
check('Context: an empty text counts nothing and asks nothing', (await runTry(brain, { id: 'context', text: '   ' }, opts)).tokens === 0);
const fx = await runTry(brain, { id: 'experts' }, opts);
check('Experts: reads the brain file\'s numbers', fx.kind === 'facts' && fx.experts === 256 && fx.used === 8 && fx.activeB === 3 && fx.layers === 40);
check('Quantization: bits per weight from size and weights', factsOf('x', opts.readFacts).bits === Math.round(((20e9 * 8) / 35e9) * 10) / 10);
const gg = await runTry(brain, { id: 'gguf' }, opts);
check('Reading a brain file: header and first 8 tensors, plain numbers', gg.kind === 'gguf' && gg.first.length === 8 && typeof gg.first[0].offset === 'number' && gg.tensors === 10 && gg.facts.some(([k]) => k === 'qwen.expert_count'));
check('Reading a brain file: only the chosen header facts, never the path', !gg.facts.some(([k]) => k === 'secret') && !JSON.stringify(gg).includes('fake.gguf'));
check('ggufTour on a brain with no architecture', ggufTour({ version: 3, meta: {}, tensors: [], dataStart: 0 }).facts.length === 0);
calls.length = 0;
const sy = await runTry(brain, { id: 'system', text: 'What is a token?' }, opts);
check('Instructions: two answers, thinking stripped', sy.answers.length === 2 && sy.answers.every((a) => a.text === 'Arr') && calls.every((c) => c.body.chat_template_kwargs?.enable_thinking === false));
const th = await runTry(brain, { id: 'thinking' }, opts);
check('Thinking: off then on, with its thinking shown', th.answers[0].text === '10 cents.' && th.answers[1].thinks && th.answers[1].thought.startsWith('Ball'));
const tl = await runTry(brain, { id: 'tools' }, opts);
check('Tool calls: the brain gets one tool and the call is read back', tl.right === true && tl.calls[0].name === 'get_weather' && JSON.stringify(calls.at(-1).body.tools) === JSON.stringify([WEATHER_TOOL]));
let threw = '';
try { await runTry(brain, { id: 'finetune' }, opts); } catch (e) { threw = e.message; }
check('a page lesson runs nothing', /opens a Lab page/.test(threw));
try { await runTry({ cfg: { engine: 'ollama' }, engine: {} }, { id: 'tokens' }, opts); threw = ''; } catch (e) { threw = e.message; }
check('without Brain Engine it says why', /Brain Engine/.test(threw));
check('the brain counts as in use only while trying', engine.active === 0);

// ---- progress ----
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lessons-'));
check('progress starts empty', Object.keys(readProgress(tmp).done).length === 0);
markDone(tmp, 'tokens', true, () => '2026-11-15T00:00:00Z');
check('a lesson is marked done', readProgress(tmp).done.tokens === '2026-11-15T00:00:00Z');
fs.writeFileSync(path.join(tmp, 'lessons-progress.json'), '﻿{"done":{"tokens":"d","bogus":"x","odds":5}}');
check('unknown lessons and bad values are dropped, a BOM is fine', JSON.stringify(readProgress(tmp).done) === '{"tokens":"d"}');
markDone(tmp, 'tokens', false);
check('a lesson can be un-done', !readProgress(tmp).done.tokens);
try { markDone(tmp, '../x'); threw = ''; } catch (e) { threw = e.message; }
check('an unknown lesson id is refused', /don't know/.test(threw));
markDone(tmp, 'odds'); resetProgress(tmp);
check('Start over clears it', Object.keys(readProgress(tmp).done).length === 0);

// ---- the route ----
const sent = [];
const send = (res, code, j) => sent.push({ code, j });
const route = (cfg, method, p, b = {}) => lessonsRoute({ req: { method }, res: {}, p, lab: { cfg, brain }, body: async () => b, send, labOn: (c) => c.computerLab !== false, labDir: () => tmp });
await route({ labLessons: false }, 'GET', '/api/lab/lessons');
check('GET lists the course and says off while switched off', sent.at(-1).code === 200 && sent.at(-1).j.on === false && sent.at(-1).j.lessons.length === LESSONS.length && sent.at(-1).j.levels.length === 3);
await route({ labLessons: false }, 'POST', '/api/lab/lessons/done', { id: 'tokens' });
check('nothing is written while switched off', sent.at(-1).code === 403 && !readProgress(tmp).done.tokens);
await route({ labLessons: true, computerLab: false }, 'POST', '/api/lab/lessons/done', { id: 'tokens' });
check('nothing is written while the Lab is off', sent.at(-1).code === 403);
await route({ labLessons: true }, 'POST', '/api/lab/lessons/done', { id: 'tokens' });
check('switched on, done is saved', sent.at(-1).code === 200 && readProgress(tmp).done.tokens);
check('other paths are left alone', (await route({}, 'GET', '/api/lab/learn')) === false);
fs.rmSync(tmp, { recursive: true, force: true });

// ---- never training data ----
const srcFiles = fs.readdirSync(fileURLToPath(new URL('../src/', import.meta.url))).filter((f) => f.endsWith('.js') && f !== 'lab-lessons.js');
const users = srcFiles.filter((f) => /lab-lessons\.js/.test(read(`src/${f}`)));
check('only the Lab\'s route reads the lessons (no lesson set, Forge or training script does)', users.join(',') === 'lab-routes.js', users.join(','));

// ---- the switch, the page, Help ----
const cfg = read('src/config.js');
check('Lab: Lessons is a setting, off unless switched on', /'labLessons'/.test(cfg) && /out\.labLessons = out\.labLessons === true/.test(cfg));
check('safe start turns it off', /'labLessons'/.test(read('src/crash-catch.js')));
check('the switch is in Settings, Brains, and saves', /sswitch\('labLessons', settings\.labLessons === true, 'Lab: Lessons'/.test(read('public/cellar-pages.js')) && /el\.dataset\.set === 'labLessons'/.test(read('public/cellar.js')));
check('Settings\' Lab: Professional mode switch saves too', /el\.dataset\.set === 'labPro'/.test(read('public/cellar.js')));
const lab = read('public/lab.js');
check('Lessons shows under Learn only while switched on', /view\?\.lessons === true \? \['learn', 'lessons', 'diffusion'\]/.test(lab) && /lessons: 'Lessons'/.test(lab) && /lessons: this\.cfg\.labLessons === true/.test(read('src/lab.js')));
check('switched off while showing, Learn falls back to Experiments', /sub\.learn === 'lessons' && !view\.lessons\) sub\.learn = 'learn'/.test(lab));
const page = read('public/lab-lessons.js');
check('each lesson is Read, Try it, Check', /1\. Read/.test(page) && /2\. Try it/.test(page) && /3\. Check/.test(page));
check('questions are real radio groups in fieldsets with legends', /<fieldset><legend>/.test(page) && /type="radio" name="lq-/.test(page));
check('the proper name opens the glossary and has an (i)', /data-lessongloss/.test(page) && /tip\(/.test(page));
const css = read('public/style.css'), ours = css.slice(css.indexOf('/* 15 Nov Lab, Learn, Lessons */'));
check('the lesson styles use theme colours only', ours.length > 100 && !/#[0-9a-f]{3,8}\b|rgb\(|hsl\(/i.test(ours));
const topic = HELP.find((h) => h.id === 'lab-lessons'), faq = HELP.find((h) => h.id === 'faq-lab-lessons'), gloss = HELP.find((h) => h.id === 'glossary');
check('Help has a Lessons page and an FAQ', topic && faq && /Lab: Lessons/.test(topic.html) && /never used as training data/.test(topic.html));
check('the glossary has the new words', ['Held-out test', 'Lessons (Lab course)', 'System prompt', 'Tool call (function calling)'].every((w) => gloss.html.includes(`<dt>${w}</dt>`)));
check('Help says where it does not work', /Android app has no Lab/.test(topic.html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
