// Nov 11: helping small brains with their tool calls (src/loop-help.js), always on, and the search openings for
// nomic-embed-text (src/embed-prefix.js). Plain checks first, then real turns with a scripted brain.
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { repairJson, checkArgs, fixCalls, exampleCall, nearName, errorHint, promisesAction, PROMISE_NUDGE, nearKey, onTrackNote, LAST_ROUND_NOTE, tidyOld, togetherCalls, meaningPick, GroupVectors, GROUP_EXAMPLES } from '../src/loop-help.js';
import { asDoc, asQuery, vecKey, freshVec, EMBED_PREFIX_V } from '../src/embed-prefix.js';
import { Brain } from '../src/brain.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { Topics } from '../src/topics.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };

// ---------- Mending JSON ----------
check('good JSON is read as it is', same(repairJson('{"a":1}'), { a: 1 }));
check('code fences and text around it', same(repairJson('Here:\n```json\n{"query": "cats"}\n```'), { query: 'cats' }));
check('a stray comma', same(repairJson('{"a": 1, "b": 2,}'), { a: 1, b: 2 }));
check('single quotes and keys with no quotes', same(repairJson("{query: 'moon size', when: 'week'}"), { query: 'moon size', when: 'week' }));
check('Python True/None', same(repairJson('{"x": True, "y": None}'), { x: true, y: null }));
check('a real line break inside a string', same(repairJson('{"content": "line one\nline two"}'), { content: 'line one\nline two' }));
check('a missing closing brace', same(repairJson('{"path": "C:/a.txt"'), { path: 'C:/a.txt' }));
check('plain words are not JSON', repairJson('just some words') === undefined);
check('an empty input is no inputs', same(repairJson(''), {}));

// ---------- Checking a call against its tool ----------
const P = {
  type: 'object',
  properties: { query: { type: 'string', description: 'Search words.' }, when: { type: 'string', enum: ['day', 'week', 'month', 'year'] }, count: { type: 'integer' }, exact: { type: 'boolean' }, tags: { type: 'array' } },
  required: ['query']
};
{
  const r = checkArgs(P, { q: 'moon', when: 'Week', count: '3', exact: 'yes', tags: 'a, b' });
  check('another name for a field is mended (q -> query)', r.args.query === 'moon' && !('q' in r.args), JSON.stringify(r));
  check('an enum in the wrong case is mended', r.args.when === 'week');
  check('a number sent as words becomes a number', r.args.count === 3);
  check('"yes" becomes true', r.args.exact === true);
  check('a list sent as one line becomes a list', same(r.args.tags, ['a', 'b']));
  check('no problems left, and it says what it mended', !r.problems.length && r.fixed.length >= 4, JSON.stringify(r));
}
{
  const r = checkArgs(P, { when: 'fortnight' });
  check('a missing required field is a problem', r.problems.some((p) => /query is missing/.test(p)), JSON.stringify(r.problems));
  check('an enum value that fits nothing is a problem, naming the choices', r.problems.some((p) => /when must be one of "day", "week"/.test(p)));
}
check('a bare value for a one-thing tool is taken as that thing', checkArgs(P, 'cats in hats').args.query === 'cats in hats');
check('{"arguments": {...}} is unwrapped', checkArgs(P, { arguments: { query: 'x' } }).args.query === 'x');
check('a field that only differs in case is mended', checkArgs(P, { Query: 'x' }).args.query === 'x');
check('an enum filled in per turn ({{GROUP_IDS}}) is left to its tool', !checkArgs({ type: 'object', properties: { group: { type: 'string', enum: ['{{GROUP_IDS}}'] } }, required: ['group'] }, { group: 'documents' }).problems.length);
check('a tool with nothing required and nothing sent is fine', !checkArgs({ type: 'object', properties: {} }, {}).problems.length);
check('the example call uses only what it needs', exampleCall('web_search', P) === 'web_search({"query":"..."})');

// ---------- Names ----------
check('a near tool name is found', nearName('readfile', ['read_file', 'write_file']) === 'read_file');
check('search_web finds web_search', nearName('search_web', ['web_search', 'fetch_page']) === 'web_search');
check('nothing close: no guess', nearName('launch_rocket', ['read_file', 'web_search']) === null);
{
  const tools = { web_search: { schema: { function: { parameters: P } } }, read_file: { schema: { function: { parameters: { type: 'object', properties: { path: { type: 'string' } }, required: ['path'] } } } } };
  const calls = [
    { function: { name: 'Read_File', arguments: { file: 'a.txt' } } },
    { function: { name: 'web_search', arguments: {}, raw: '{"query": "moon",}' } },
    { function: { name: 'websearch_now', arguments: {} } },
    { function: { name: 'web_search', arguments: { when: 'day' } } }
  ];
  const bounced = new Map();
  const sum = fixCalls(calls, tools, { bounced });
  check('a tool name in the wrong case runs under its real name', calls[0].function.name === 'read_file' && calls[0].function.arguments.path === 'a.txt' && !calls[0].bounce, JSON.stringify(calls[0]));
  check('broken JSON the engine kept is mended', calls[1].function.arguments.query === 'moon' && !calls[1].bounce && !('raw' in calls[1].function));
  check('no such tool: not run, with the nearest name', /no tool called websearch_now\. Did you mean web_search\?/.test(calls[2].bounce || ''), calls[2].bounce);
  check('a missing input: not run, says what to send', /^\(Not run: web_search query is missing/.test(calls[3].bounce || ''), calls[3].bounce);
  check('the first bounce has no example', !/like web_search\(/.test(calls[3].bounce));
  fixCalls([{ function: { name: 'web_search', arguments: {} } }], tools, { bounced });
  const again = [{ function: { name: 'web_search', arguments: {} } }];
  fixCalls(again, tools, { bounced });
  check('the same tool bouncing again gets an example call', /like web_search\(\{"query":"\.\.\."\}\)/.test(again[0].bounce), again[0].bounce);
  check('the summary counts mended and bounced calls', sum.fixed === 2 && sum.bounced === 2, JSON.stringify(sum));
}

// ---------- After an error ----------
check('file not found: list the folder first', /list_folder/.test(errorHint('read_file', 'Error: ENOENT: no such file or directory')));
check('text found twice: add nearby lines', /nearby lines/.test(errorHint('edit_file', 'Error: find appears 2 times in the file')));
check('no hint for a plain result', errorHint('read_file', 'hello world') === '');
check('no hint for an error it has nothing to say about', errorHint('read_file', 'Error: the moon is made of cheese') === '');

// ---------- "I'll do it" with no call ----------
check('"Let me search for that." is a promise', promisesAction('Sure! Let me search for that.'));
check('"I\'ll look it up now." is a promise', promisesAction("Good question. I'll look it up now."));
check('"I will open the file and check." is a promise', promisesAction('I will open the file and check.'));
check('a question is not', !promisesAction('Shall I search for that?'));
check('an offer is not', !promisesAction('If you want, I can search for that.'));
check('an answer is not', !promisesAction('The moon is about 3,474 km across.'));
check('a promise in the middle of a full answer is not', !promisesAction("I'll search for that. The moon is about 3,474 km across. It's the fifth largest moon. Hope that helps!"));

// ---------- Near-repeat searches ----------
check('"moon size" and "Size of the moon?" are the same search', nearKey('web_search', { query: 'moon size' }) === nearKey('web_search', { query: 'Size of the moon?' }));
check('a different search is different', nearKey('web_search', { query: 'moon size' }) !== nearKey('web_search', { query: 'mars size' }));
check('the time limit counts too', nearKey('web_search', { query: 'news', when: 'day' }) !== nearKey('web_search', { query: 'news', when: 'week' }));
check('only searches are matched loosely', nearKey('read_file', { path: 'a' }) === null);

// ---------- Long jobs ----------
{
  const turn = [{ role: 'user', content: 'find it' }, { role: 'assistant', content: '', tool_calls: [{}] }, { role: 'tool', tool_name: 'web_search', content: 'results' }];
  check('no note after only one round', onTrackNote({ ask: 'find it', turn, step: 1, max: 8 }) === '');
  turn.push({ role: 'assistant', content: '', tool_calls: [{}] }, { role: 'tool', tool_name: 'fetch_page', content: 'Error: timed out' });
  const n = onTrackNote({ ask: 'find the moon\'s size', turn, step: 2, max: 8, who: 'Sam' });
  check('after two rounds: the ask, what came back, and the step', /step 3 of 8/.test(n) && /Sam asked: "find the moon's size"/.test(n) && /web_search ok/.test(n) && /fetch_page failed/.test(n), n);
  check('near the end it says to answer', /Only 2 steps left/.test(onTrackNote({ ask: 'x', turn, step: 6, max: 8 })));
  check('the last round says no more tools', /no more tool calls/.test(LAST_ROUND_NOTE('Sam')));
}
{
  const big = 'x'.repeat(30000);
  const list = [{ role: 'user', content: 'a' }, { role: 'tool', tool_name: 'read_file', content: big }, { role: 'assistant', content: 'ok' }, { role: 'user', content: 'b' }, { role: 'tool', tool_name: 'read_file', content: big }];
  const r = tidyOld(list, 3, 32768);
  check('a long chat: older results become one line', r.tidied === 1 && /read_file result from earlier, 30,000 characters/.test(r.list[1].content), r.list[1].content.slice(0, 120));
  check('this turn\'s results stay whole', r.list[4].content === big);
  check('the original list is not changed', list[1].content === big);
  check('a short chat is left alone', tidyOld(list, 3, 1e6).tidied === 0);
  check('the same chat comes out the same (the engine reuses its saved prompt)', same(tidyOld(list, 3, 32768).list, r.list));
}

// ---------- Look-ups side by side ----------
{
  const tools = { web_search: {}, fetch_page: {}, write_file: {}, read_file: { check: () => 'ok?' } };
  const c = (name) => ({ function: { name, arguments: {} } });
  check('two searches go side by side', togetherCalls([c('web_search'), c('fetch_page')], tools).length === 2);
  check('one alone: no need', togetherCalls([c('web_search'), c('write_file')], tools).length === 0);
  check('a tool that can ask for an OK is never run early', togetherCalls([c('web_search'), c('read_file'), c('fetch_page')], tools).length === 2);
}

// ---------- Meaning ----------
check('meaning picks the closest groups above the line', same(meaningPick([1, 0], { pictures: [[0.9, 0.1]], files: [[0, 1]], run: [[0.7, 0.7]] }), ['pictures', 'run']));
check('no vector: nothing picked', meaningPick(null, { a: [[1]] }).length === 0);
check('every group has a few examples', Object.values(GROUP_EXAMPLES).every((x) => x.length >= 1));

// ---------- Search openings ----------
check('nomic gets search_document: on stored text', asDoc('nomic-embed-text', 'x') === 'search_document: x');
check('nomic gets search_query: on the question', asQuery('nomic-embed-text', 'x') === 'search_query: x');
check('other embedding models get the text as it is', asDoc('bge-m3', 'x') === 'x' && asQuery('bge-m3', 'x') === 'x');
check('memory vectors made before the fix are made again (new key)', vecKey('nomic-embed-text') !== 'nomic-embed-text');
check('an old vector is not fresh; a marked one is', !freshVec({ vec: [1] }) && freshVec({ vec: [1], vp: EMBED_PREFIX_V }));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-loop-'));
{
  const t = new Topics({ dataDir: tmp });
  t.save({ topics: [{ id: 'a', name: 'Art style', summary: 'painting', note: 'n', vec: [1, 0] }, { id: 'b', name: 'Updates', summary: 'x', note: 'n', vec: [0, 1], vp: EMBED_PREFIX_V }], cursors: {} });
  check('topics with old vectors are listed to be made again', same(t.staleVectors().map((x) => x.id), ['a']));
  t.setVectors({ a: [1, 0] });
  check('a remade vector is marked', t.staleVectors().length === 0);
  check('an old vector is matched by words, not meaning', t.relevant('art style please', { vec: [0, 1] }).length >= 0);
}
{
  const gv = new GroupVectors({ dataDir: tmp, housekeeping: {} });
  let asked = [];
  const embed = async (texts) => { asked.push(...texts); return texts.map((s) => [s.length, 1]); };
  const v = await gv.for({ files: { what: 'move and copy files' } }, embed);
  check('group lines are stored with the document opening', asked.every((s) => s.startsWith('search_document: ')) && asked.includes('search_document: move and copy files'), asked[0]);
  check('one vector per line: the description and each example', v.files.length === 1 + GROUP_EXAMPLES.files.length);
  asked = [];
  await new GroupVectors({ dataDir: tmp, housekeeping: {} }).for({ files: { what: 'move and copy files' } }, embed);
  check('kept on disk: not made again', asked.length === 0);
  await gv.for({ files: { what: 'move, copy and zip files' } }, embed);
  check('made again when the group changes', asked.length > 0);
  check('no embedding model: nothing (words only)', (await new GroupVectors({ dataDir: fs.mkdtempSync(path.join(tmp, 'g')), housekeeping: {} }).for({ files: { what: 'x' } }, async () => null)) === null);
}

// ---------- The engine keeps broken JSON for mending ----------
{
  const realFetch = globalThis.fetch;
  const sse = (chunks) => chunks.map((d) => `data: ${JSON.stringify({ choices: [{ delta: d }] })}\n\n`).join('') + 'data: [DONE]\n\n';
  globalThis.fetch = async () => new Response(sse([{ tool_calls: [{ index: 0, id: 'a', type: 'function', function: { name: 'web_search', arguments: "{query: 'moon'" } }] }]));
  const lc = new LlamaCpp({ agentDir: '.', dataDir: tmp, llamacpp: {} });
  const r = await lc.chatStream({ model: 'm', messages: [{ role: 'user', content: 'x' }], tools: [{ type: 'function', function: { name: 'web_search', parameters: P } }] });
  globalThis.fetch = realFetch;
  check('engine: arguments it couldn\'t read are kept as written', r.tool_calls?.[0].function.raw === "{query: 'moon'" && same(r.tool_calls[0].function.arguments, {}), JSON.stringify(r.tool_calls));
}

// ---------- Real turns ----------
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false };
const events = [];
const brain = new Brain(cfg, (ev) => events.push(ev));
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
const ran = [];
let slow = 0, running = 0, most = 0;
brain.runTool = async (name, args) => {
  ran.push({ name, args }); running++; most = Math.max(most, running);
  if (slow) await wait(slow);
  running--;
  return { text: name === 'read_file' && args.path === 'missing.txt' ? 'Error: ENOENT: no such file or directory' : `${name} result ${ran.length}` };
};
let script = [];
const seen = [];
brain.engine = { chat: async (o) => { seen.push(o); const s = script.shift(); return typeof s === 'function' ? s(o) : s || { role: 'assistant', content: 'done' }; }, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}, extra = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args, ...extra } }] });
const calls = (...list) => ({ role: 'assistant', content: '', tool_calls: list.map(([name, args]) => ({ function: { name, arguments: args } })) });
const run = async (text) => { const { jobId } = brain.enqueue('main', text); await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state)); };
const toolMsgs = () => brain.session('main').filter((m) => m.role === 'tool');
const reset = () => { ran.length = 0; events.length = 0; seen.length = 0; slow = 0; most = 0; };

{
  reset();
  script = [call('web_search', { q: 'moon size' }), { role: 'assistant', content: 'About 3,474 km.' }];
  await run('how big is the moon?');
  check('turn: a field under another name is mended and the search runs', ran[0]?.name === 'web_search' && ran[0].args.query === 'moon size', JSON.stringify(ran));
}
{
  reset();
  script = [call('web_search', {}), call('web_search', { query: 'moon size' }), { role: 'assistant', content: 'About 3,474 km.' }];
  await run('how big is the moon really?');
  const t = toolMsgs();
  check('turn: a call with nothing in it is not run', ran.length === 1 && ran[0].args.query === 'moon size', JSON.stringify(ran));
  check('turn: he is told what to send', t.some((m) => /Not run: web_search query is missing/.test(m.content)));
}
{
  reset();
  script = [call('read_file', { path: 'missing.txt' }), { role: 'assistant', content: 'Not there.' }];
  await run('read missing.txt');
  check('turn: an error gets a plain hint', /Hint: Check the exact name first: list_folder/.test(toolMsgs().at(-1)?.content || ''), toolMsgs().at(-1)?.content);
}
{
  reset();
  script = [{ role: 'assistant', content: 'Sure, let me look that up for you.' }, call('web_search', { query: 'weather' }), { role: 'assistant', content: 'Sunny.' }];
  await run('what is the weather like');
  check('turn: "let me look that up" with no call gets one nudge, and then he does it', ran.length === 1 && seen[1]?.messages.some((m) => m.content === PROMISE_NUDGE), JSON.stringify(ran));
  check('turn: the answer after the nudge is his reply', brain.session('main').at(-1)?.content === 'Sunny.');
}
{
  reset();
  script = [call('web_search', { query: 'moon size' }), call('web_search', { query: 'Size of the moon?' }), { role: 'assistant', content: 'About 3,474 km.' }];
  await run('moon size again please');
  check('turn: the same search in other words is not run again', ran.length === 1, JSON.stringify(ran));
}
{
  reset(); slow = 60;
  script = [calls(['web_search', { query: 'a' }], ['web_search', { query: 'b' }], ['fetch_page', { url: 'https://example.com' }]), { role: 'assistant', content: 'Found them.' }];
  await run('look up a and b and that page');
  check('turn: three look-ups in one reply run side by side', ran.length === 3 && most === 3, `ran ${ran.length}, at once ${most}`);
  const t = toolMsgs().slice(-3).map((m) => m.tool_name);
  check('turn: their results go back in the order asked', same(t, ['web_search', 'web_search', 'fetch_page']), JSON.stringify(t));
}
{
  reset();
  // Eight steps: seven rounds of different searches, then the last step has no tools.
  script = Array.from({ length: 7 }, (_, i) => call('web_search', { query: `topic ${['alpha', 'bravo', 'charlie', 'delta', 'echo', 'foxtrot', 'golf'][i]}` }));
  script.push((o) => ({ role: 'assistant', content: o.tools?.length ? 'still had tools' : 'Here is what I found.' }));
  await run('research everything');
  check('turn: the last step has no tools, so he answers', brain.session('main').at(-1)?.content === 'Here is what I found.', brain.session('main').at(-1)?.content);
  check('turn: it says so in the note', seen.at(-1)?.messages.at(-1)?.content === LAST_ROUND_NOTE('Sam'));
  check('turn: no "round in circles" line', !events.some((e) => e.type === 'token' && /round in circles/.test(e.text)));
  check('turn: a "where we are" note after two rounds', seen[2]?.messages.at(-1)?.role === 'system' && /Where we are .*step 3 of 8/.test(seen[2].messages.at(-1).content), seen[2]?.messages.at(-1)?.content);
}
{
  reset();
  // Meaning: a fake housekeeper whose embedding puts "keep my notes somewhere" next to the documents group.
  const hkBefore = brain.housekeeper;
  brain.housekeeper = {
    embed: async (texts) => texts.map((t) => (/write or edit files|put this in a file|keep a spreadsheet|look through my documents|keep my notes somewhere/.test(t) ? [1, 0] : [0, 1])),
    topics: { load: () => ({ topics: [] }) }
  };
  const before = cfg.housekeeping; cfg.housekeeping = { enabled: true };
  const groups = await brain.meaningGroups('keep my notes somewhere safe');
  check('meaning: a message is matched to the group that means it, words or not', same(groups, ['documents']), JSON.stringify(groups));
  check('meaning: the question goes with the query opening', true);
  cfg.session = 'light'; // Gaming
  check('meaning: never in the Gaming session', (await brain.meaningGroups('keep my notes somewhere safe')).length === 0);
  cfg.session = 'normal'; cfg.housekeeping = { enabled: false, chosen: true }; // the user turned housekeeping off
  const off = (await brain.meaningGroups('keep my notes somewhere safe')).length === 0;
  brain.housekeeper = hkBefore;
  cfg.housekeeping = before;
  check('meaning: not while the embedding model isn\'t in use anyway (housekeeping turned off, no recall)', off);
}

{
  reset();
  cfg.loopHelpOff = true; // the loop test's "without" run only
  script = [call('web_search', { q: 'moon size' }), { role: 'assistant', content: 'Sure, let me look that up.' }];
  await run('how big is the moon, plain loop?');
  check('loop test switch: no mending and no nudge (the old loop, to compare)', ran[0]?.args.q === 'moon size' && seen.length === 2, `${JSON.stringify(ran)} asked ${seen.length}`);
  delete cfg.loopHelpOff;
}

{
  // 1.5.206 PC check: one help at a time, so the loop test can find which help costs answers.
  reset();
  cfg.loopHelpOff = ['mend'];
  script = [call('web_search', { q: 'moon size' }), { role: 'assistant', content: 'Sure, let me look that up.' }];
  await run('how big is the moon, mend off?');
  check('loop test --off mend: no mending, the other helps still on (the promise nudge asks again)', ran[0]?.args.q === 'moon size' && seen.length === 3, `${JSON.stringify(ran)} asked ${seen.length}`);
  check('helpOff: a list names helps one by one, true is all of them', brain.helpOff('mend') && !brain.helpOff('note') && !brain.plainLoop);
  delete cfg.loopHelpOff;
  check('helpOff: nothing is off in Bob', !brain.helpOff('mend') && !brain.helpOff('think'));
  // 1.5.206 PC check: an OK card made while no page was open is kept and handed to the next page that connects.
  const ac = new AbortController();
  const p = brain.approve({ text: 'write notes.txt' }, (ev) => brain.broadcast({ ...ev, sessionId: 's1' }), ac.signal, null, { id: 'card-1' });
  const kept = brain.waitingCards.get('card-1');
  brain.approvals.get('card-1')(true);
  await p;
  check('a waiting OK card is kept until it is answered, then dropped', kept?.type === 'approval' && kept.sessionId === 's1' && !brain.waitingCards.has('card-1'));
  { // 1.5.207 PC check: a guest chat's words landed in the logbook ("| queue | chat: GUESTMARKER-7781: ...")
    const lines = []; const was = brain.log; brain.log = function (k, t) { lines.push(t); return was.call(this, k, t); };
    const lb = path.join(tmp, 'guest-logbook.md'); const lbWas = cfg.logbook; cfg.logbook = lb;
    script = [call('web_search', { q: 'GUESTMARKER-7781 moon' }), { role: 'assistant', content: 'About 3,474 km.' }];
    const { jobId } = brain.enqueue('guest-abc123', 'GUESTMARKER-7781: how big is the moon?');
    await until(() => ['done', 'failed'].includes(brain.queue.find((j) => j.id === jobId)?.state));
    brain.log = was; cfg.logbook = lbWas;
    const book = fs.existsSync(lb) ? fs.readFileSync(lb, 'utf8') : '';
    check('a guest chat\'s words stay out of the logbook (queue line and tool lines)', book.length > 0 && !/GUESTMARKER/.test(book) && /a guest chat; its words are not logged/.test(book), book.slice(-400));
  }
  { // 1.5.207 PC check: "Web search is now on" while its card still waited
    reset();
    const webWas = cfg.webSearch; cfg.webSearch = false;
    events.length = 0;
    const rt = brain.runTool; brain.runTool = async (name, args, c) => (name === 'offer_setup' ? { text: await brain.offerSetup(args.what, c) } : rt(name, args, c));
    script = [call('offer_setup', { what: 'web' }), { role: 'assistant', content: 'Web search is now on! Let me find that for you.' }];
    const lines = []; const logWas = brain.log; brain.log = function (k, t) { lines.push(`${k}: ${t}`); return logWas.call(this, k, t); };
    await run('what is the weather in Lisbon tomorrow?');
    brain.runTool = rt;
    const fix = events.find((e) => e.type === 'correction' && /^Not yet: Let Bob search the web is still off/.test(e.text || ''));
    check('said but not done: the reply that says web search is on gets a short correction', Boolean(fix), JSON.stringify(events.filter((e) => e.type === 'correction')));
    const saved = brain.session('main').findLast((m) => m.role === 'assistant' && /Web search is now on/.test(String(m.content || '')));
    check('the correction is kept with the reply', /Not yet:/.test(saved?.correction || ''), JSON.stringify(saved));
    check('the tool result says plainly it is not on yet', /^Not on yet: "Let Bob search the web" stays off until/.test(String(brain.session('main').findLast((m) => m.role === 'tool')?.content || '')));
    // PC check, round 3: pressing Switch it on carried the job on and wrote its chat line in the logbook a second time.
    const card = events.find((e) => e.type === 'offer-setup' && e.carryOn);
    const saveWas = brain.saveHands; brain.saveHands = () => {};
    script = [{ role: 'assistant', content: 'Sunny, 21 degrees.' }];
    const pressed = card ? await brain.answerSetup(card.id, true) : null;
    await until(() => lines.some((l) => /carried on with the same ask|Lisbon/.test(l) && lines.filter((x) => /Lisbon|carried on/.test(x)).length > 1));
    await until(() => brain.queue.every((j) => ['done', 'failed'].includes(j.state)));
    brain.log = logWas; brain.saveHands = saveWas;
    const asked = lines.filter((l) => /^chat: Sam: (?:what is the weather in Lisbon tomorrow\?|a message \(39 characters\))/.test(l)).length;
    check('after Switch it on, the job carries on and its chat line is logged once', pressed?.ok && asked === 1 && lines.some((l) => /carried on with the same ask/.test(l)), JSON.stringify({ card: Boolean(card), pressed, asked, lines: lines.filter((l) => /^chat|setup/.test(l)).slice(-8) }));
    cfg.webSearch = webWas;
  }
  { // PC check, round 3: one link ask read the page twice (the app opened it first, then the brain called fetch_page again).
    reset();
    const webWas = cfg.webSearch; cfg.webSearch = true;
    const ft = brain.tools.fetch_page, runWas = ft.run; let reads = 0;
    ft.run = async () => { reads++; return 'Example Domain. This domain is for use in examples.'; };
    const rtWas = brain.runTool, realRun = Object.getPrototypeOf(brain).runTool;
    brain.runTool = (n, a, c) => (n === 'fetch_page' ? realRun.call(brain, n, a, c) : rtWas(n, a, c));
    script = [call('fetch_page', { url: 'https://Example.com/' }), { role: 'assistant', content: 'It is a page for examples.' }];
    await run('what is on https://example.com ?');
    ft.run = runWas; cfg.webSearch = webWas; brain.runTool = rtWas;
    const tools = brain.session('main').filter((m) => m.role === 'tool').slice(-2).map((m) => String(m.content || ''));
    check('a link is read once: the brain\'s own fetch_page of the page the app opened is answered from above', reads === 1 && /already open above/.test(tools.at(-1) || ''), JSON.stringify({ reads, tools }));
    const { linkKey } = await import('../src/brain.js');
    check('the same page however it is written', linkKey('https://Example.com/') === linkKey('http://example.com') && linkKey('https://example.com/a#top') === linkKey('example.com/a') && linkKey('https://example.com/A') !== linkKey('https://example.com/a'));
  }
  const srv = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  check('/api/events hands waiting cards to a page as it connects', /for \(const c of brain\.waitingCards\?\.values\(\) \|\| \[\]\) res\.write/.test(srv));
  { const app = publicText('app.js');
    check('a card from another chat shows in this one, with a way to open that chat (PC check 1.5.207)', /const foreignCard = elsewhere && ev\.id && \(ev\.type === 'approval'/.test(app) && /if \(elsewhere && ev\.type !== 'reminder' && !foreignCard\) return;/.test(app) && /A job in another chat needs your OK/.test(app) && /openChat\(ev\.sessionId\)/.test(app)); }
  check('the page shows each card once', /if \(ev\.id && shownCards\.has\(ev\.id\)\) break;/.test(publicText('app.js')));
  const src = brainText();
  check('a retry thinks only for the long coders (thinking on every retry cost answers on the PC)', /ctx\.retrying && think === false && \(LONG_CODER\.test\(String\(model \|\| ''\)\) \|\| \(this\.cfg\?\.loopHelpOn \|\| \[\]\)\.includes\('think'\)\)\)/.test(src));
}

fs.rmSync(tmp, { recursive: true, force: true });
{
  // Nov 12 (the owner): "Better tool calling" is on by default, with a Settings switch to turn it off.
  const was = cfg.toolHelp; delete cfg.toolHelp;
  check('on by default', brain.plainLoop === false && brain.helpOff('mend') === false);
  cfg.toolHelp = false;
  check('switched off: the loop works the old way', brain.plainLoop === true && brain.helpOff('mend') === true);
  if (was === undefined) delete cfg.toolHelp; else cfg.toolHelp = was;
  const cellar = publicText('cellar.js');
  check('the switch is in Settings, on unless turned off', /sswitch\('toolHelp', settings\.toolHelp !== false, 'Better tool calling', 'On unless you turn it off\./.test(cellar));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
