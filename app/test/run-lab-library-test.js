// The lesson library: sets from elsewhere converted into the Lab's lessons (chat messages, ShareGPT, instruction and
// output, rows wrapped in row_json, tool calls, thinking), earlier steps of a longer chat dropped, every set broken into
// parts by category, source and thinking, the ticked parts picked into their own folder (with a thinking-path tag), the
// Forge plan carrying the picked copy, adding a set from Hugging Face with a fake fetch, and the page's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { convertRow, addLessonSet, analyzeSet, readParts, partsOf, pickLessons, pickedCount, categoryOf, sourceOf, thinkingOf, downloadHfLessons, cleanPathName } from '../src/lab-library.js';
import { Lab, lessonSets, partsView } from '../src/lab.js';
import { makeForgePlan } from '../src/lab-forge.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-library-'));
const W = (n, s) => { const f = path.join(tmp, n); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
const rows = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean).map((x) => JSON.parse(x));

// ---- one row at a time ----
const chat = convertRow({ messages: [{ role: 'system', content: 'You are a coder.' }, { role: 'user', content: 'Fix the bug' }, { role: 'assistant', content: '', reasoning_content: 'Look at the file first.', tool_calls: [{ id: 'c1', function: { name: 'read', arguments: { path: 'a.js' } } }] }, { role: 'tool', tool_call_id: 'c1', content: 'code' }, { role: 'assistant', content: 'Fixed.' }], tools: [{ type: 'function', function: { name: 'read' } }], category: 'debug-deploy', reasoning_effort: 'high', source: 'moonshotai/kimi-k3' });
check('chat messages keep tool calls (arguments as text), tool replies and thinking; the system line moves to the toolset', chat && chat.system === 'You are a coder.' && chat.tools.length === 1 && chat.lesson.messages[0].role === 'user' && chat.lesson.messages[1].reasoning === 'Look at the file first.' && chat.lesson.messages[1].tool_calls[0].function.arguments === '{"path":"a.js"}' && chat.lesson.messages[2].role === 'tool' && chat.lesson.messages[2].tool_call_id === 'c1');
check('a row\'s category, effort and source are kept', chat.lesson.category === 'debug-deploy' && chat.lesson.effort === 'high' && chat.lesson.source === 'moonshotai/kimi-k3' && chat.lesson.think === true);
const sg = convertRow({ conversations: [{ from: 'human', value: 'Hi' }, { from: 'gpt', value: '<think>Say hello back.</think>Hello!' }] });
check('ShareGPT turns are read, and <think> at the start of an answer becomes its thinking', sg && sg.lesson.messages[1].content === 'Hello!' && sg.lesson.messages[1].reasoning === 'Say hello back.');
const ins = convertRow({ instruction: 'Add', input: '2 and 2', output: '4' });
check('instruction and output (with input) become a question and an answer', ins && ins.lesson.messages[0].content === 'Add\n\n2 and 2' && ins.lesson.messages[1].content === '4' && ins.lesson.think === false);
check('prompt and response, and question and answer, are read too', convertRow({ prompt: 'p', response: 'r' })?.lesson.messages.length === 2 && convertRow({ question: 'q', answer: 'a' })?.lesson.messages.length === 2);
check('a row wrapped in row_json is opened first', convertRow({ row_json: JSON.stringify({ messages: [{ role: 'user', content: 'u' }, { role: 'assistant', content: 'a' }] }), first_source_dataset: 'o/n' })?.lesson.source === 'o/n');
check('a row with no answer, or no question, is left out', convertRow({ messages: [{ role: 'user', content: 'u' }] }) === null && convertRow({ messages: [{ role: 'assistant', content: 'a' }] }) === null && convertRow('nope') === null && convertRow({ row_json: '{bad' }) === null);

// ---- what a lesson is ----
check('a lesson\'s category comes from its own label, then a plain guess', categoryOf({ job: 'ext-agent' }) === 'agent' && categoryOf({ category: 'Formal Math' }) === 'formal-math' && categoryOf({ messages: [{ role: 'assistant', tool_calls: [{}] }] }) === 'tools' && categoryOf({ messages: [{ role: 'assistant', content: '```js\nx\n```' }] }) === 'coding' && categoryOf({ messages: [{ role: 'user', content: 'hello' }] }) === 'chat');
check('a lesson\'s source is its own source line before any detail, or the set\'s', sourceOf({ source: 'lambda/hermes:kimi | teacher Kimi' }) === 'lambda/hermes:kimi' && sourceOf({}, 'My set') === 'My set' && sourceOf({ teacher: 'Qwen' }) === 'Qwen');
check('thinking is on, off, or on with the teacher\'s effort', thinkingOf({ messages: [{ role: 'assistant', reasoning: 'x' }] }) === 'on' && thinkingOf({ messages: [{ role: 'assistant', content: 'x' }] }) === 'off' && thinkingOf({ effort: 'Max', messages: [{ role: 'assistant', reasoning: 'x' }] }) === 'on-max');
check('a thinking path name keeps only plain characters', cleanPathName('K3 <b>low</b>\n') === 'K3 blowb');

// ---- a whole file into a set ----
const step = (n) => ({ messages: [{ role: 'user', content: 'Deploy it' }, ...Array.from({ length: n }, (_, i) => ({ role: 'assistant', content: `step ${i}` }))], category: 'debug-deploy', source: 'greg/k3-traces' });
const file = W('in/k3.jsonl', [
  JSON.stringify(step(1)), JSON.stringify(step(2)), JSON.stringify(step(3)), // three steps of one chat: only the longest stays
  JSON.stringify({ messages: [{ role: 'user', content: 'Solve x+1=2' }, { role: 'assistant', content: 'x=1', reasoning_content: 'subtract one' }], category: 'maths', source: 'greg/k3-traces', reasoning_effort: 'low' }),
  JSON.stringify({ messages: [{ role: 'user', content: 'Tell a joke' }, { role: 'assistant', content: 'A joke.' }], source: 'other/set' }),
  'not json', '',
  JSON.stringify({ messages: [{ role: 'user', content: 'only a question' }] })
].join('\r\n'));
const root = path.join(tmp, 'data', 'lab', 'lessons');
const added = addLessonSet({ root, from: file, name: 'Kimi K3 traces', source: 'greg/k3-traces', license: 'cc-by-4.0', link: 'https://huggingface.co/datasets/greg/k3', now: Date.UTC(2026, 10, 9) });
const lessons = rows(path.join(added.dir, 'lessons.jsonl'));
check('the set is converted: earlier steps of a longer chat and rows with no answer are left out', added.count === 3 && lessons.length === 3 && added.skipped === 4 && lessons.find((l) => l.category === 'debug-deploy').messages.length === 4);
check('every lesson has an id, its source and its toolset key, and the toolsets file holds the system lines', lessons.every((l) => l.idea && l.source && l.messages.filter((m) => m.role === 'assistant').every((m) => m.set)) && Object.values(JSON.parse(fs.readFileSync(path.join(added.dir, 'toolsets.json'), 'utf8'))).every((t) => 'system' in t && Array.isArray(t.tools)));
const meta = JSON.parse(fs.readFileSync(path.join(added.dir, 'added.json'), 'utf8'));
check('added.json keeps the name, source, licence and link; a set with a licence isn\'t private-only', meta.name === 'Kimi K3 traces' && meta.license === 'cc-by-4.0' && meta.privateOnly === false && meta.at.startsWith('2026-11-09'));
const parts = added.parts;
check('the set is broken into parts by category, source and thinking (with effort)', parts.total === 3 && parts.categories['debug-deploy'].count === 1 && parts.categories.maths.count === 1 && parts.categories.chat.count === 1 && parts.sources['greg-k3-traces'].count === 2 && parts.sources['other-set'].count === 1 && parts.thinking.off.count === 2 && parts.thinking['on-low'].count === 1 && /low effort/.test(parts.thinking['on-low'].label));
check('the parts are read back while the file is unchanged, and looked at again after it changes', readParts(added.dir)?.total === 3 && (fs.appendFileSync(path.join(added.dir, 'lessons.jsonl'), `${JSON.stringify({ messages: [{ role: 'user', content: 'q' }, { role: 'assistant', content: 'a' }], source: 'other/set' })}\n`), readParts(added.dir) === null) && partsOf(added.dir).total === 4);
check('a second set with the same name gets its own folder; a .parquet file is refused with a plain way out', addLessonSet({ root, from: file, name: 'Kimi K3 traces' }).id !== added.id && (() => { try { addLessonSet({ root, from: W('in/x.parquet', 'x'), name: 'p' }); return false; } catch (e) { return /\.jsonl first/.test(e.message); } })());
check('a file with nothing readable says why', (() => { try { addLessonSet({ root, from: W('in/empty.jsonl', '{"a":1}\n'), name: 'e' }); return false; } catch (e) { return /question and an answer/.test(e.message); } })());
const arr = addLessonSet({ root, from: W('in/arr.json', JSON.stringify({ data: [{ prompt: 'p1', response: 'r1' }, { prompt: 'p2', response: 'r2' }] })), name: 'Array set' });
check('a .json file holding a list (or {data: [...]}) is read', arr.count === 2 && arr.parts.sources['array-set'].count === 2);

// ---- picking parts ----
const p4 = partsOf(added.dir);
check('the count left is worked out from the parts alone', pickedCount(p4, {}) === 4 && pickedCount(p4, { offSources: ['other-set'] }) === 2 && pickedCount(p4, { offThinking: ['off'] }) === 1 && pickedCount(p4, { offCategories: ['maths', 'chat', 'debug-deploy'] }) === 0);
check('nothing ticked off and no path name: the whole set goes as it is', pickLessons(added.dir, {}).dir === '' && pickLessons(added.dir, {}).count === 4);
const pk = pickLessons(added.dir, { offSources: ['other-set'] });
check('ticking a source off writes only the rest to a picked folder with its toolsets', pk.count === 2 && rows(path.join(pk.dir, 'lessons.jsonl')).length === 2 && fs.existsSync(path.join(pk.dir, 'toolsets.json')) && path.dirname(pk.dir) === added.dir);
const tagged = pickLessons(added.dir, { offSources: ['other-set'], pathName: 'K3' });
const tl = rows(path.join(tagged.dir, 'lessons.jsonl')), ts = JSON.parse(fs.readFileSync(path.join(tagged.dir, 'toolsets.json'), 'utf8'));
const sysOf = (l) => ts[l.messages.find((m) => m.role === 'assistant').set]?.system || '';
check('a path name tags only the lessons that show their thinking, on their system line', tl.length === 2 && /Think: K3$/.test(sysOf(tl.find((l) => l.category === 'maths'))) && !/Think:/.test(sysOf(tl.find((l) => l.category === 'debug-deploy'))));
check('only one picked copy is kept per set', fs.readdirSync(added.dir).filter((f) => f.startsWith('picked-')).length === 1 && !fs.existsSync(pk.dir));

// ---- the Forge plan ----
const fp = makeForgePlan({ rungs: [{ name: 'a', keep: 64 }], brain: { pick: 'forge:28Bob' }, lessonSets: ['k3', 'empty', 'mine'] }, { base: { skills: { chat: 1 } }, lessonSets: [{ id: 'k3', name: 'K3', dir: tagged.dir, total: 4, picked: 2, pathName: 'K3' }, { id: 'empty', name: 'Empty', dir: '/x', total: 3, picked: 0 }, { id: 'mine', name: 'Mine', dir: '/y', total: 5, picked: 5, privateOnly: true }] });
check('the plan carries the picked folder, counts what was picked, names the path, and keeps a no-licence set private', fp.plan.extra_lessons.includes(path.resolve(tagged.dir)) && fp.notes.some((n) => /2 of 4 lessons picked/.test(n)) && fp.notes.some((n) => /Think: K3/.test(n)) && fp.notes.some((n) => /Mine came with no licence/.test(n)));
check('a set with every part ticked off stops the plan', fp.problems.some((x) => /Empty: every part is ticked off/.test(x)));

// ---- through the Lab ----
const dataDir = path.join(tmp, 'data');
W('model-lab/forge/forge.mjs', '// fake');
W('model-lab/forge/plans/base.json', JSON.stringify({ run: 'base', skills: { chat: 1 }, rungs: [{ name: 'x', keep: 64 }] }));
const cfg = { dataDir, agentDir: tmp, settingsFile: path.join(dataDir, 'settings.json'), computerLab: true };
const hfCalls = [];
const hfFetch = async (url) => {
  hfCalls.push(url);
  if (/\/api\/datasets\//.test(url)) return { ok: true, status: 200, json: async () => ({ cardData: { license: 'cc-by-4.0' }, siblings: [{ rfilename: 'data/train.jsonl' }] }) };
  const body = `${JSON.stringify({ messages: [{ role: 'user', content: 'hf q' }, { role: 'assistant', content: 'hf a', reasoning_content: 'think' }], category: 'coding' })}\n`;
  return { ok: true, status: 200, body: [Buffer.from(body)] };
};
const lab = new Lab(cfg, { shop: { cfg, catalog: { models: [] }, locate: () => ({}) }, room: () => ({ ok: true, why: '' }), broadcast: () => {} });
lab.hfFetch = hfFetch;
const hfAdded = await lab.addLibrarySet({ from: 'greg/k3:data/train.jsonl', name: 'K3 from HF' });
check('adding a Hugging Face file reads its card, downloads the file, converts it and keeps the licence', hfAdded.count === 1 && hfAdded.license === 'cc-by-4.0' && hfCalls.some((u) => u.includes('/api/datasets/greg/k3')) && hfCalls.some((u) => u.endsWith('/datasets/greg/k3/resolve/main/data/train.jsonl')) && !fs.readdirSync(path.join(dataDir, 'lab', 'downloads')).length);
check('a set kept only as .parquet on Hugging Face is sent to the Forge plan instead', await lab.addLibrarySet({ from: 'greg/k3:data/train.parquet' }).then(() => false, (e) => /Forge plan instead|has no file/.test(e.message)));
check('a plain name with no file and an empty answer both say what to type', await lab.addLibrarySet({ from: '' }).then(() => false, (e) => /Say where the lessons are/.test(e.message)));
const localAdded = await lab.addLibrarySet({ from: file, name: 'From a file' });
check('a full path on this replicant matrix is added the same way', localAdded.count === 3 && lessonSets(cfg).some((x) => x.id === localAdded.id && x.added && x.source === 'k3'));
const fv = lab.forgeView();
const k3v = fv.lessonSets.find((x) => x.id === hfAdded.id);
check('the Forge page gets each set\'s parts, licence and source', k3v && k3v.added && k3v.license === 'cc-by-4.0' && k3v.parts.total === 1 && k3v.parts.categories[0].id === 'coding' && k3v.parts.thinking[0].id === 'on' && typeof k3v.parts.cells === 'object');
const lp = lab.forgePlan({ base: 'base', rungs: [{ name: 'a', keep: 64 }], brain: { pick: 'forge:28Bob' }, lessonSets: [localAdded.id], lessonParts: { [localAdded.id]: { offSources: ['other-set'], pathName: 'K3' } } });
check('the Lab\'s Forge plan picks the parts and tags the path', lp.plan.extra_lessons.length === 1 && /picked-[0-9a-f]{12}$/.test(lp.plan.extra_lessons[0]) && lp.notes.some((n) => /2 of 3 lessons picked/.test(n)));
const whole = lab.forgePlan({ base: 'base', rungs: [{ name: 'a', keep: 64 }], brain: { pick: 'forge:28Bob' }, lessonSets: [localAdded.id] });
check('a set with nothing picked off goes whole', whole.plan.extra_lessons[0] === path.resolve(path.join(dataDir, 'lab', 'lessons', localAdded.id)));
check('partsView lists the biggest part first', partsView(path.join(dataDir, 'lab', 'lessons', localAdded.id)).sources[0].count >= partsView(path.join(dataDir, 'lab', 'lessons', localAdded.id)).sources.at(-1).count);
check('downloadHfLessons refuses a file that isn\'t .jsonl or .json, and a too-big one', await downloadHfLessons({ repo: 'a/b', file: 'x.csv', to: path.join(tmp, 'd') }).then(() => false, () => true) && await downloadHfLessons({ repo: 'a/b', file: 'x.jsonl', to: path.join(tmp, 'd.jsonl'), fetchFn: async () => ({ ok: true, body: [Buffer.alloc(10)] }), maxBytes: 5 }).then(() => false, (e) => /2 GB/.test(e.message)));

// ---- the page and its words ----
const page = read('public/lab-forge.js');
check('the Forge page has the part pickers, the path name and the add-a-set panel', /data-forgepart=/.test(page) && /data-forgepathname=/.test(page) && /Add a lesson set to the Lab/.test(page) && /\/api\/lab\/library\/add/.test(page));
const help = JSON.stringify(HELP);
check('Help explains the lesson library, its parts and thinking paths in plain words', /Pick its parts/.test(help) && /Add a lesson set to the Lab/.test(help) && /Think: /.test(help));
check('the trainer teaches a lesson without thinking the way thinking off works', /empty think/i.test(read('model-lab/forge/pod/data.py')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
