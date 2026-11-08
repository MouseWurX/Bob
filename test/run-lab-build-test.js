// 1.5.148 Lab 2c, the lesson builder: files into passages (text, Markdown, web pages, transcripts, ChatGPT and Claude
// exports, Bob sessions), the held-back net, the survey, the three lesson kinds against a fake teacher, the sample,
// the whole job through the Lab with fake steps, the viewer, removing lessons, the scrubbed export, and the page's words.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { classify, listFiles, chunk, stripHtml, parseChatGpt, parseClaude, parseTranscript, parseBob, parseChat, readFile, words } from '../src/lab-build-read.js';
import { heldBack, scrub, survey, wouldLearn, fingerprint } from '../src/lab-build-scan.js';
import { KINDS, KIND_IDS, SAMPLE_COUNT, gatherIdeas, pickSample, makeLessons, build } from '../src/lab-build.js';
import { Lab, cleanBuild, skillFromPath, lessonSets, lessonSkillNames, lessonCard, labRoute, BUILD_DEFAULT } from '../src/lab.js';
import { pickFileArgs } from '../src/own-models.js';
import { HELP } from '../public/help-content.js';
import { readZipList } from '../src/zip.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-lab-build-'));
const W = (n, s) => { const f = path.join(tmp, n); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, s); return f; };
const para = (i, n = 60) => Array.from({ length: n }, (_, k) => `Sentence ${k} of paragraph ${i} about the oak bench and its hardwax oil finish.`).join(' ');

// ---- what a file is ----
check('files are sorted into text, document, chat log and later kinds', classify('a.md') === 'text' && classify('b.docx') === 'office' && classify('c.pdf') === 'office' && classify('d.json') === 'chat' && classify('e.xlsx') === 'sheets' && classify('f.py') === 'code' && classify('g.png') === 'pictures' && classify('h.exe') === 'other');
const notes = path.join(tmp, 'Notes', 'Woodworking');
W('Notes/Woodworking/oak-bench.md', `# Oak bench\n\n${[1, 2, 3, 4, 5, 6].map((i) => para(i)).join('\n\n')}\n`);
W('Notes/Woodworking/short.txt', 'Too short to learn from.');
W('Notes/Woodworking/.hidden.md', para(9));
W('Notes/Woodworking/node_modules/x.md', para(9));
W('Notes/Woodworking/photo.png', 'not a picture really');
const listed = listFiles([notes]);
check('a folder is walked, hidden files and node_modules skipped, each file with its kind and size', listed.files.length === 3 && listed.files.every((f) => f.kind && f.bytes >= 0) && !listed.files.some((f) => /hidden|node_modules/.test(f.path)));
check('a single file can be added too, and the same file only once', listFiles([path.join(notes, 'oak-bench.md'), path.join(notes, 'oak-bench.md')]).files.length === 1);

// ---- passages ----
const ch = chunk([1, 2, 3, 4, 5, 6, 7, 8].map((i) => para(i, 30)).join('\n\n'));
check('passages are 300 to 600 words, cut at paragraph breaks', ch.length >= 2 && ch.every((p) => p.words >= 300 && p.words <= 600) && ch[0].at === 1 && ch[1].at > 1, JSON.stringify(ch.map((p) => p.words)));
const long = chunk(Array.from({ length: 900 }, (_, k) => `Word${k} is here.`).join(' '));
check('one huge paragraph is cut at sentences', long.length >= 3 && long.every((p) => p.words <= 600 + 5));
check('a short note under 40 words is no passage at all', chunk('Too short to learn from.').length === 0);
check('web pages lose their tags and scripts', stripHtml('<html><head><style>p{}</style><script>x()</script></head><body><h1>Title</h1><p>One &amp; two</p><p>Three</p></body></html>') === 'Title\n\nOne & two\n\nThree');

// ---- chat logs ----
const gpt = [{ title: 't', mapping: { a: { message: { author: { role: 'system' }, content: { parts: ['sys'] }, create_time: 1 } }, b: { message: { author: { role: 'user' }, content: { parts: ['How do I sand oak?'] }, create_time: 2 } }, c: { message: { author: { role: 'assistant' }, content: { parts: ['Start with 120 grit, then 180, then 220 along the grain.'] }, create_time: 3 } }, d: { message: { author: { role: 'user' }, content: { parts: ['and finish?'] }, create_time: 4 } }, e: { message: { author: { role: 'assistant' }, content: { parts: ['Hardwax oil, two thin coats.'] }, create_time: 5 } } } }];
const g = parseChatGpt(gpt);
check('a ChatGPT export becomes exchanges in time order, system lines dropped', g.length === 2 && g[0].user === 'How do I sand oak?' && /120 grit/.test(g[0].assistant) && g[1].user === 'and finish?' && g[0].who === 'other');
const cl = parseClaude([{ chat_messages: [{ sender: 'human', text: 'Plan my week' }, { sender: 'assistant', text: 'Monday: sand. Tuesday: oil. Wednesday: rest.' }] }]);
check('a Claude export becomes exchanges', cl.length === 1 && cl[0].user === 'Plan my week' && /Monday/.test(cl[0].assistant));
const bobChat = parseBob([{ role: 'user', content: 'remind me at 3', id: 'x' }, { role: 'assistant', content: '', tool_calls: [{}] }, { role: 'tool', content: 'ok' }, { role: 'assistant', content: 'Reminder set for 3pm, I will nudge you then.', rating: 'up' }]);
check('a Bob session becomes exchanges, tool turns skipped, thumbs-up kept', bobChat.length === 1 && bobChat[0].assistant.startsWith('Reminder set') && bobChat[0].up === true && bobChat[0].who === 'bob');
const tr = parseTranscript('[10:02] Sam: what wood for a bench\n[10:03] Bot: Oak or ash, both hard enough for a seat.\nSam: and the finish?\nBot: Hardwax oil is forgiving.\nIt also smells fine.');
check('a Name: line transcript pairs the first speaker with the second, with wrapped lines joined', tr.length === 2 && tr[0].user === 'what wood for a bench' && /smells fine/.test(tr[1].assistant));
check('prose with a colon or two is not a transcript', parseTranscript('Note: the bench is done.\nIt took a week of evenings and some swearing.\nThe oil smells fine.\nNext: a table.') === null);
check('parseChat picks the shape by itself', parseChat(JSON.stringify(gpt), 'conversations.json').length === 2 && parseChat('Sam: hi there\nBot: hello, what are we making today\nSam: a bench\nBot: good choice, oak or ash', 'log.txt').length === 2);
const chatFile = W('Chats/conversations.json', JSON.stringify(gpt));
const rf = await readFile(chatFile);
check('readFile sorts a chat log into exchanges', rf.kind === 'chat' && rf.exchanges.length === 2 && !rf.skipped);
const rtxt = await readFile(path.join(notes, 'oak-bench.md'));
check('readFile sorts a Markdown note into passages', rtxt.kind === 'text' && rtxt.passages.length >= 1 && !rtxt.skipped);
check('readFile says why a file is skipped', (await readFile(path.join(notes, 'short.txt'))).skipped.includes('too short') && (await readFile(path.join(notes, 'photo.png'))).skipped.includes('later') && (await readFile(W('d.docx', 'x'), { office: null })).skipped.includes('LibreOffice'));

// ---- the held-back net and the scrub ----
const KEY = ['sk', 'live', 'abcdefghijklmnopqrstuvwxyz1234'].join('_'), LAN = [192, 168, 1, 20].join('.'), MAIL = ['sam', 'example.test'].join('@'), HOME = ['', 'home', 'sam', 'Notes'].join('/'); // built from pieces: the public-words check must not read them as real
check('keys, passwords, card numbers, LAN and tailnet addresses, e-mails and the user folder are held back', heldBack(`my key is ${KEY}`) && heldBack('password: hunter22') && heldBack('card 4111 1111 1111 1111') && heldBack(`ssh ${LAN} now`) && heldBack('the pi at 100.101.5.9') && heldBack(`mail ${MAIL}`) && heldBack(`${HOME}/x`, { user: 'sam' }));
check('ordinary text, a long serial and a phone number pass', !heldBack('The bench took 12 hours and 1234567890123 is the order number, call 555-0100.') && !heldBack('Users of the bench liked it', { user: 'sam' }));
const sc = scrub(`Mail ${MAIL}, the box at ${LAN} and ${HOME}, key ${KEY}`, { user: 'sam' });
check('the scrub swaps every hit for a stand-in and says what it changed', sc.text === `Mail ${['you', 'example.com'].join('@')}, the box at ${[192, 168, 0, 10].join('.')} and /home/you/Notes, key [key removed]` && sc.changes.length === 4, sc.text);
check('fingerprints ignore case and spacing', fingerprint('Hello  World') === fingerprint('hello world'));

// ---- the survey ----
const items = [
  { path: path.join(notes, 'oak-bench.md'), skill: 'Woodworking', read: rtxt },
  { path: path.join(notes, 'oak-bench.md'), skill: 'Woodworking', read: { ...rtxt, name: 'copy.md' } },
  { path: path.join(notes, 'short.txt'), skill: 'Woodworking', read: await readFile(path.join(notes, 'short.txt')) },
  { path: W('Letters/secret.txt', `${para(1, 40)} password: hunter22`), skill: 'Letters', read: await readFile(path.join(tmp, 'Letters', 'secret.txt')) },
  { path: chatFile, skill: 'Chats', read: rf }
];
const sv = survey(items, { user: 'sam' });
check('the survey counts files, passages, exchanges, skips, repeats and held-back passages per skill', sv.files === 5 && sv.skipped.length === 1 && sv.dupes === rtxt.passages.length && sv.held.length === 1 && sv.held[0].why.includes('password') && sv.perSkill.Letters.held === 1 && sv.exchanges === 2 && sv.otherPeople, JSON.stringify({ d: sv.dupes, h: sv.held, s: sv.skipped }));
check('the supply says how many lessons each kind can give', sv.supply.material === sv.passages * 2 && sv.supply.voice === sv.passages && sv.supply.chats === 2);
const wl = wouldLearn(sv, ['material', 'chats'], 300, ['Woodworking', 'Chats']);
check('what the brain would learn is built from the counts and ends with the honest line', /working with your material/.test(wl) && /past conversations/.test(wl) && !/writing in your voice/.test(wl) && /not learn the facts/.test(wl), wl);

// ---- the three lesson kinds against a fake teacher ----
const kit = { turn: () => ({ system: 'You are Bob.', tools: [{ type: 'function', function: { name: 'read_file', parameters: {} } }] }), guessGroups: () => [], useTools: () => '', done: () => {} };
const calls = [];
const fakeChat = async (url, { messages, tools, think }) => {
  const last = messages.at(-1); calls.push({ last, tools, think });
  const text = last.content || '';
  if (/Write 2 different messages/.test(text)) return { content: '["What finish did I pick for the oak bench?", "Turn my bench notes into a checklist"]' };
  if (/typed to their desktop AI assistant to get exactly this written/.test(text)) return { content: 'Write up my notes on finishing the oak bench, casual, for my own records.' };
  if (last.role === 'tool') return { content: 'You went with hardwax oil, two coats, after the Danish oil blotched.', reasoning_content: think ? 'The passage says hardwax oil.' : undefined };
  if (messages[0]?.role === 'system' && /Another assistant answered/.test(messages[0].content)) return { content: 'Start at 120 grit and work up to 220, always along the grain.' };
  return { content: 'All set.' };
};
const passage = rtxt.passages[0];
const mat = await makeLessons({ key: 'material:abc', kind: 'material', skill: 'Woodworking', name: 'oak-bench.md', at: 1, text: passage.text }, { url: 'x', kit, think: true, chatFn: fakeChat });
check('working with my material: two questions, each a lesson with read_file and the passage as its result', mat.length === 2 && mat.every((l) => l.kind === 'material' && l.job === 'Woodworking' && l.messages[1].tool_calls[0].function.name === 'read_file' && l.messages[2].role === 'tool' && l.messages[2].content.includes(passage.text.slice(0, 50)) && l.messages[3].role === 'assistant' && l.messages[3].reasoning_content));
check('the read_file path in a lesson is a neutral Documents path, never the owner\'s', mat.every((l) => JSON.parse(l.messages[1].tool_calls[0].function.arguments).path === 'Documents/oak-bench.md') && !JSON.stringify(mat).includes(tmp));
check('the teacher answered with Bob\'s system prompt and tools in front of it', calls.some((c) => c.last.role === 'tool' && c.tools?.length === 1));
const voice = await makeLessons({ key: 'voice:abc', kind: 'voice', skill: 'Letters', name: 'oak-bench.md', at: 1, text: passage.text }, { url: 'x', kit, chatFn: fakeChat });
check('writing in my voice: the passage is the answer, the teacher wrote the request, no thinking', voice.length === 1 && voice[0].messages[1].content === passage.text && /Write up my notes/.test(voice[0].messages[0].content) && voice[0].think === false);
const ex = { key: 'chats:abc', kind: 'chats', skill: 'Chats', name: 'conversations.json', at: 0, user: 'How do I sand oak?', assistant: 'Start with 120 grit, then 180, then 220 along the grain.' };
const resaid = await makeLessons(ex, { url: 'x', kit, chatFn: fakeChat });
const kept = await makeLessons(ex, { url: 'x', kit, chatFn: fakeChat, resay: false });
check('my past conversations: re-said in Bob\'s voice, or kept word for word when asked', /always along the grain/.test(resaid[0].messages[1].content) && kept[0].messages[1].content === ex.assistant);
check('the re-say prompt carries the other answer and Bob\'s own instructions', calls.some((c) => c.last.content === 'How do I sand oak?' ));

// ---- ideas, the sample and the whole build ----
const job = { url: 'x', dir: path.join(tmp, 'set'), items: [{ path: path.join(notes, 'oak-bench.md'), skill: 'Woodworking' }, { path: path.join(tmp, 'Letters', 'secret.txt'), skill: 'Letters' }, { path: chatFile, skill: 'Chats' }], kinds: ['material', 'voice', 'chats'], count: 300, think: 'half', resay: true, user: 'sam', office: null, feedback: {} };
const gi = await gatherIdeas(job);
check('ideas come from every passage and exchange, held-back ones left out and counted', gi.ideas.filter((i) => i.kind === 'material').length === rtxt.passages.length && gi.ideas.filter((i) => i.kind === 'voice').length === rtxt.passages.length && gi.ideas.filter((i) => i.kind === 'chats').length === 2 && gi.held === 1 && gi.files.length === 3);
check('feedback leaves a file out, or one kind for one file, before the teacher sees it', (await gatherIdeas({ ...job, feedback: { dropFiles: ['oak-bench.md'] } })).ideas.every((i) => i.kind === 'chats') && (await gatherIdeas({ ...job, feedback: { notKinds: { 'oak-bench.md': ['voice'] } } })).ideas.every((i) => i.kind !== 'voice'));
const sm = pickSample(gi.ideas, 4);
check('the sample is spread over the kinds', sm.length === 4 && new Set(sm.map((i) => i.kind)).size === 3);
const sres = await build({ ...job, sample: true }, { kit, chatFn: fakeChat });
const sampleLines = fs.readFileSync(path.join(tmp, 'set', 'sample.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x));
check('the sample run writes sample.jsonl and sources.json, with up to 12 lessons and no file paths', sres.n === sampleLines.length && sampleLines.length <= SAMPLE_COUNT + 1 && sampleLines.length >= 3 && fs.existsSync(path.join(tmp, 'set', 'sources.json')) && !fs.readFileSync(path.join(tmp, 'set', 'sources.json'), 'utf8').includes(tmp));
let prog = [];
const full = await build({ ...job, count: 5 }, { kit, chatFn: fakeChat, onProgress: (d, t) => prog.push([d, t]) });
check('the build stops at the count asked for and reports progress against it', full.n >= 5 && full.n <= 6 && prog.at(-1)[1] === 5 && full.held === 1);
const again = await build({ ...job, count: 5 }, { kit, chatFn: fakeChat });
check('running again with the same folder keeps what is there (resumable)', again.n === full.n);
check('every lesson has the writer\'s shape plus its kind and source', fs.readFileSync(path.join(tmp, 'set', 'lessons.jsonl'), 'utf8').trim().split('\n').map((x) => JSON.parse(x)).every((l) => l.idea && l.job && KIND_IDS.includes(l.kind) && typeof l.think === 'boolean' && l.source?.name && l.messages[0].role === 'user' && l.messages.at(-1).role === 'assistant'));

// ---- through the Lab: plan, survey, the job with fake steps, the viewer, remove, export ----
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(path.join(dataDir, 'sessions'), { recursive: true });
const exe = (n) => (process.platform === 'win32' ? `${n}.exe` : n);
const cfg = { dataDir, agentDir: tmp, bobModelsDir: path.join(tmp, 'models', 'bob'), settingsFile: path.join(dataDir, 'settings.json'), computerLab: true, llamacpp: { exe: path.join(tmp, 'eng', exe('llama-server')) } };
fs.mkdirSync(path.join(tmp, 'eng'), { recursive: true }); for (const n of ['llama-server', 'llama-imatrix', 'llama-quantize']) fs.writeFileSync(path.join(tmp, 'eng', exe(n)), '');
const brainFile = W('models/moe.gguf', 'GGUF');
const catalog = { models: [{ id: 'test-moe', name: 'Test MoE', family: 'Test', category: 'chat', jobs: ['bob'], license: 'Apache 2.0', files: [{ role: 'gguf', url: 'https://x/moe.gguf' }] }, { id: 'nc', name: 'Research Only', family: 'Test', category: 'chat', jobs: ['bob'], license: 'non-commercial', files: [] }] };
const shop = { cfg, catalog, locate: (e) => (e.id === 'test-moe' || e.id === 'nc' ? { gguf: brainFile } : {}) };
const big = () => ({ ok: true, why: '' });
const events = [];
const lab = new Lab(cfg, { shop, room: big, broadcast: (e) => events.push(e), steps: {
  serve: async () => ({ url: 'http://fake', stop: () => {} }),
  build: async (j, { onProgress }) => { const r = await build(j, { kit, chatFn: fakeChat, onProgress }); return { n: r.n, held: r.held, dupes: r.dupes }; }
} });
const cb = cleanBuild({ name: ' My Bench \n', teacher: 'test-moe', items: [{ path: `"${notes}"` }, { path: chatFile, skill: 'Chats' }, { path: '' }], kinds: ['material', 'nope', 'chats'], count: 99999, think: 'odd', feedback: { dropFiles: ['a'], notKinds: { 'a.md': ['voice', 'x'] }, badIdeas: ['k'] } });
check('a build plan is cleaned: name, paths unquoted, a skill from the folder name, kinds and count within bounds', cb.name === 'My Bench' && cb.items.length === 2 && cb.items[0].path === notes && cb.items[0].skill === 'Woodworking' && cb.kinds.join() === 'material,chats' && cb.count === 5000 && cb.think === 'half' && cb.feedback.notKinds['a.md'].join() === 'voice' && cleanBuild({}).count === BUILD_DEFAULT);
check('a skill name from a path: the folder or file name, tidied', skillFromPath('C:\\Notes\\oak_bench-notes.md') === 'Oak bench notes' && skillFromPath('/home/sam/Letters') === 'Letters');
const bp0 = lab.planBuild({ name: '', items: [], kinds: [], teacher: '' });
check('the plan names what is missing, in order', bp0.problems.length === 4 && /name/.test(bp0.problems[0]) && /file or folder/.test(bp0.problems[1]) && /kind of lesson/.test(bp0.problems[2]) && /teacher/.test(bp0.problems[3]));
check('a teacher whose licence forbids it is refused', lab.planBuild({ name: 'x', items: [{ path: notes }], kinds: ['material'], teacher: 'nc' }).problems.some((p) => /licence/.test(p)));
const bld = { name: 'My Bench', teacher: 'test-moe', items: [{ path: notes, skill: 'Woodworking' }, { path: chatFile, skill: 'Chats' }], kinds: ['material', 'voice', 'chats'], count: 40, think: 'half' };
const bp = lab.planBuild(bld);
check('a good plan is ready, with its skills, hours and the privacy note', !bp.problems.length && bp.skills.join() === 'Woodworking,Chats' && bp.hours >= 1 && bp.notes.some((n) => /never copied/.test(n)), JSON.stringify(bp.problems));
const sv2 = await lab.surveyBuild(bld);
check('the survey through the Lab reads the folder and the chat log, by kind and skill', sv2.files === 4 && sv2.passages === rtxt.passages.length && sv2.exchanges === 2 && sv2.skills.join() === 'Woodworking,Chats' && sv2.skipped.length === 2 && /text document/.test(Object.keys(sv2.byKind).join()) && sv2.supplyTotal > 0 && sv2.wouldLearn.length > 40, JSON.stringify({ f: sv2.files, k: sv2.byKind, s: sv2.skipped }));
const ss = await lab.startBuild(bld, { sample: true });
check('the sample job starts as its own Lab job', ss.started?.state === 'running' && ss.started.kind === 'sample');
while (lab.job) await new Promise((r) => setTimeout(r, 20));
const sdone = lab.runs.at(-1);
check('the sample job finishes with cards for the page', sdone.state === 'done' && sdone.report.sample && sdone.report.cards.length >= 3 && sdone.report.cards.every((c) => c.user && c.answer && c.skill && c.kind), sdone.error || '');
check('the plan then carries the sample cards, so the page shows them under the builder', lab.planBuild(bld).sample.length === sdone.report.cards.length);
check('a card has the message, what Bob read, the answer, a shortened thought, and no paths', (() => { const c = lessonCard(mat[0]); return c.user.startsWith('What finish') && c.read.includes('oak bench') && /hardwax/.test(c.answer) && c.thinking && c.tools.join() === 'read_file' && !JSON.stringify(c).includes(tmp); })());
const bs = await lab.startBuild({ ...bld, feedback: { dropFiles: [], notKinds: {}, badIdeas: [] } });
check('the build job starts', bs.started?.state === 'running' && bs.started.kind === 'build');
while (lab.job) await new Promise((r) => setTimeout(r, 20));
const bdone = lab.runs.at(-1);
check('the build finishes, the set is listed for step 2 as built, with its skills and kinds', bdone.state === 'done' && bdone.report.lessons >= 5 && (() => { const set = lessonSets(cfg).find((x) => x.name === 'My Bench'); return set && set.built && set.done && set.skills.join() === 'Woodworking,Chats' && set.kinds.length === 3 && set.count === bdone.report.lessons; })(), bdone.error || '');
check('the page heard the job and the lab-done event', events.some((e) => e.type === 'lab' && e.run.kind === 'build') && events.filter((e) => e.type === 'lab-done' && e.ok).length === 2);
check('a coverage cut can count each built skill', lessonSkillNames({ kind: 'file', file: path.join(dataDir, 'lab', 'lessons', 'my-bench', 'lessons.jsonl') }).sort().join() === 'Chats,Woodworking');
const v1 = lab.setLessons('my-bench', {});
check('the viewer lists the lessons as cards with files, skills and kinds to filter by', v1.total === bdone.report.lessons && v1.cards.length === v1.total && v1.files.includes('oak-bench.md') && v1.skills.includes('Chats') && v1.kinds.length === 3 && v1.sources);
check('the viewer searches and filters', lab.setLessons('my-bench', { q: 'grit' }).found >= 1 && lab.setLessons('my-bench', { skill: 'Chats' }).cards.every((c) => c.skill === 'Chats') && lab.setLessons('my-bench', { file: 'oak-bench.md', kind: 'voice' }).cards.every((c) => c.kind === 'voice'));
const rm = lab.removeLessons('my-bench', { keys: [v1.cards[0].key] });
check('one lesson can be removed, and the set is written again', rm.removed === 1 && lab.setLessons('my-bench', {}).total === v1.total - 1);
const rmf = lab.removeLessons('my-bench', { file: 'conversations.json' });
check('everything from one file can be removed, and the file is left out of later builds', rmf.removed >= 1 && !lab.setLessons('my-bench', {}).files.includes('conversations.json') && JSON.parse(fs.readFileSync(path.join(dataDir, 'lab', 'lessons', 'my-bench', 'build.json'), 'utf8')).feedback.dropFiles.includes('conversations.json'));
check('a set Bob wrote (not built) cannot be edited here', (() => { fs.mkdirSync(path.join(dataDir, 'lab', 'lessons', 'wrote'), { recursive: true }); fs.writeFileSync(path.join(dataDir, 'lab', 'lessons', 'wrote', 'lessons.jsonl'), '{"idea":"i0","job":"chat","messages":[]}\n'); fs.writeFileSync(path.join(dataDir, 'lab', 'lessons', 'wrote', 'write.json'), '{"name":"Wrote","done":true}'); try { lab.removeLessons('wrote', { keys: ['i0'] }); return false; } catch (e) { return /built from your files/.test(e.message); } })());
// export: plant an e-mail in a lesson, check first, then write the zip
const setFile = path.join(dataDir, 'lab', 'lessons', 'my-bench', 'lessons.jsonl');
fs.appendFileSync(setFile, JSON.stringify({ idea: 'planted', job: 'Woodworking', kind: 'voice', think: false, source: { name: 'oak-bench.md', at: 1 }, messages: [{ role: 'user', content: `mail ${MAIL} at ${LAN}` }, { role: 'assistant', content: 'done' }] }) + '\n');
const chk = lab.exportSet('my-bench', { check: true });
check('the export check shows what the scrub would change, without writing anything', chk.changes.some((c) => /e-mail/.test(c.what)) && chk.changes.some((c) => /LAN/.test(c.what)) && !fs.existsSync(path.join(tmp, 'out', 'my-bench-lessons.zip')));
check('an export needs a folder', (() => { try { lab.exportSet('my-bench', { folder: '' }); return false; } catch (e) { return /folder/.test(e.message); } })());
fs.mkdirSync(path.join(tmp, 'out'));
const ex1 = lab.exportSet('my-bench', { folder: path.join(tmp, 'out') });
const zipList = readZipList(ex1.file).entries.map((e) => e.name).sort();
check('the zip holds the scrubbed lessons, a README and the skills, and nothing else', zipList.join() === 'README.txt,lessons.jsonl,skills.json' && ex1.changes.length >= 2, zipList.join());
check('the zip is never overwritten', (() => { try { lab.exportSet('my-bench', { folder: path.join(tmp, 'out') }); return false; } catch (e) { return /already/.test(e.message); } })());

// ---- the door ----
const route = async (p, b, isLocal = true) => { let out = null; const req = { method: 'POST', on: () => {} }; await labRoute({ req, res: {}, p, isLocal, lab, body: async () => b, send: (res, code, j) => { out = { code, j }; } }); return out; };
check('the builder\'s calls answer only this replicant matrix (file paths)', (await route('/api/lab/build/plan', { build: bld }, false)).code === 403 && (await route('/api/lab/set', { id: 'my-bench' }, false)).code === 403 && (await route('/api/lab/set/export', { id: 'my-bench', check: true }, false)).code === 403);
check('locally, the plan and the viewer answer', (await route('/api/lab/build/plan', { build: bld })).j.skills.join() === 'Woodworking,Chats' && (await route('/api/lab/set', { id: 'my-bench' })).j.total >= 1);
check('the page gets the lesson kinds, the sample size and whether LibreOffice is there', (() => { const v = lab.view(); return v.lessonKinds.length === KINDS.length && v.sampleCount === SAMPLE_COUNT && typeof v.officeOk === 'boolean' && v.lessonSets.some((s) => s.built); })());
const win = pickFileArgs('docs', 'win32');
check('the file picker has a documents kind that shows every file', /Documents and chat logs/.test(win[1].join(' ')) && /All files/.test(win[1].join(' ')) && !pickFileArgs('docs', 'linux')[0][1].some((a) => /gguf/.test(a)));

// ---- the page's words ----
const page = read('public/lab.js'), help = HELP.find((e) => e.id === 'lab'), faq = HELP.find((e) => e.id === 'faq-share-built-set'), css = read('public/style.css'), server = read('src/server.js');
check('the page has the builder: files and folders, the three kinds, the survey, sample lessons, Not like this, Build the set, the viewer and Export', ['Build a new set from my files', 'Add a folder', 'Add a file', 'Survey my files', 'sample lessons', 'Not like this', 'Build the set', 'Open the set', 'Export as a file', 'Remove this lesson', 'data-bkind', 'lab-b-count-n', 'aria-live'].every((w) => page.includes(w)));
check('the page offers no upload anywhere and says so', /No upload anywhere/.test(page) && !/upload/i.test(page.replace(/No upload anywhere[^<]*/, '')));
check('the rented teacher is "later", never offered', /later\('A big rented brain as the teacher'/.test(page));
check('Help explains the builder in Bob\'s voice: the three kinds, held back, the sample, export and the honest line', ['Build a new set from my files', 'Working with my material', 'Writing in my voice', 'My past conversations', 'hold back', 'Show me 12 sample lessons', 'Not like this', 'Export as a file', 'not the facts in your files by heart', 'Open the set'].every((w) => help.html.includes(w)) && faq && /only the lessons my owner wrote or paid for/.test(faq.html));
check('the builder\'s styles are there and use theme variables only', /\.lab-card \{/.test(css) && /\.lab-survey/.test(css) && !/#[0-9a-f]{3,6}\b/i.test(css.slice(css.indexOf('1.5.148 Lab 2c'))));
check('the pick-file door takes the documents kind', /\['mmproj', 'docs'\]/.test(server));
check('the builder runs as its own process and finds itself with fileURLToPath', /fileURLToPath\(import\.meta\.url\)/.test(read('src/lab-build.js')) && /BUILDER/.test(read('src/lab.js')));
check('the release note exists and names the builder', fs.existsSync(new URL('../docs/releases/v1.5.148.md', import.meta.url)) && /Build a new set from my files/.test(read('docs/releases/v1.5.148.md')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
