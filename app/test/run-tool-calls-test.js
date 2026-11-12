// Tool calls (reliability items 165-180, Nov 12): ids that pair each result with its call, one table of what each
// tool risks, results that say ok or failed, are plain text, are cut where they're made and say plainly when they
// found nothing, a time limit for every tool, a dry run on more cards, connected apps that reconnect and pause,
// and calls this step can't offer that don't run. All always on. Nothing here reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  TOOL_KINDS, kindOf, riskOf, repeatSafe, isVolatile, SIDE_EFFECT, WAIT_IF_CUT, limitMs, LOOK_MIN, CHANGE_MIN,
  RESULT_CAP, RESULT_MAX, capFor, capResult, cleanResult, NOTHING_FOUND, isNothingFound, failedResult, giveIds, toolMessage, lastFinished
} from '../src/tool-kinds.js';
import { LlamaCpp } from '../src/llamacpp.js';
import { cleanLendRequest } from '../src/share-brains.js';
import { withApp, appPaused, resetPauses, PAUSE_AFTER, stopAllServers } from '../src/mcp.js';
import { lineChanges } from '../src/tools.js';
import { undoPreview } from '../src/hands-files.js';
import { LOOK_TOGETHER } from '../src/loop-help.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-toolcalls-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], userName: 'Sam', models: { bob: 'x' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };

// ---------- 165, 166: each result goes with its own call ----------
{
  const msgs = [
    { role: 'user', content: 'read both' },
    { role: 'assistant', content: '', tool_calls: [{ id: 'call_a', function: { name: 'read_file', arguments: { path: 'a.txt' } } }, { id: 'call_b', function: { name: 'read_file', arguments: { path: 'b.txt' } } }] },
    // the results came back the other way round
    { role: 'tool', tool_name: 'read_file', tool_call_id: 'call_b', content: 'B' },
    { role: 'tool', tool_name: 'read_file', tool_call_id: 'call_a', content: 'A' }
  ];
  const out = LlamaCpp.toOpenAI(msgs);
  check('165: two calls to the same tool keep their own results', out[2].tool_call_id === 'call_b' && out[2].content === 'B' && out[3].tool_call_id === 'call_a' && out[3].content === 'A', JSON.stringify(out));
  check('166: the call ids sent are the ones kept, not new ones', out[1].tool_calls.map((c) => c.id).join() === 'call_a,call_b');
  check('166: the same chat reads the same way on every request', JSON.stringify(LlamaCpp.toOpenAI(msgs)) === JSON.stringify(out));
  const old = LlamaCpp.toOpenAI([{ role: 'assistant', content: '', tool_calls: [{ function: { name: 'web_search', arguments: {} } }, { function: { name: 'read_file', arguments: {} } }] }, { role: 'tool', tool_name: 'read_file', content: 'R' }, { role: 'tool', tool_name: 'web_search', content: 'W' }]);
  check('165: an older chat with no ids still pairs by tool name', old[1].tool_call_id === old[0].tool_calls[1].id && old[2].tool_call_id === old[0].tool_calls[0].id);
}
{
  const calls = [{ function: { name: 'x' } }, { id: 'eng_1', function: { name: 'y' } }];
  giveIds(calls);
  const first = calls[0].id;
  giveIds(calls);
  check('165: a call without an id gets one, once', /^call_/.test(first) && calls[0].id === first && calls[1].id === 'eng_1');
  const m = toolMessage(calls[1], 'done', true);
  check('165: the result names the call it answers', m.tool_call_id === 'eng_1' && m.tool_name === 'y' && m.ok === true);
}
{
  // The engine's own ids come back with the calls (a fake stream, nothing real).
  const lc = Object.create(LlamaCpp.prototype);
  const lines = [
    { choices: [{ delta: { tool_calls: [{ index: 0, id: 'eng_x', function: { name: 'read_file', arguments: '{"path":' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: '"a.txt"}' } }] } }] },
    { choices: [{ delta: { tool_calls: [{ index: 1, id: 'eng_y', function: { name: 'read_file', arguments: '{"path":"b.txt"}' } }] } }] }
  ].map((o) => `data: ${JSON.stringify(o)}\n`).join('') + 'data: [DONE]\n';
  const res = { body: [new TextEncoder().encode(lines)] };
  const reply = await lc.readStream(res, { model: 'm', messages: [], tools: [{ function: { name: 'read_file' } }] });
  check('166: the engine\'s own call ids are kept', reply.tool_calls?.map((c) => c.id).join() === 'eng_x,eng_y' && reply.tool_calls[0].function.arguments.path === 'a.txt', JSON.stringify(reply));
}
{
  const r = cleanLendRequest({ messages: [{ role: 'user', content: 'hi' }, { role: 'assistant', content: '', tool_calls: [{ id: 'call_1', function: { name: 'read_file', arguments: {} } }] }, { role: 'tool', tool_name: 'read_file', tool_call_id: 'call_1', content: 'x' }, { role: 'tool', tool_name: 'read_file', tool_call_id: 'bad id!', content: 'y' }] });
  check('165: a request lent to another Bob keeps the ids', r.messages[1].tool_calls[0].id === 'call_1' && r.messages[2].tool_call_id === 'call_1' && !('tool_call_id' in r.messages[3]));
}

// ---------- 167: ok or failed in a field ----------
check('167: a result marked failed is failed, whatever its words', failedResult({ content: 'It went fine', ok: false }));
check('167: a result marked ok is ok, even if it starts like an error', !failedResult({ content: 'Error: the word Error in a file', ok: true }));
check('167: an older result without the field is read from its words', failedResult({ content: 'Error: nope' }) && !failedResult({ content: 'fine' }));

// ---------- 168: cut where it's made ----------
{
  const big = 'S'.repeat(30_000) + 'M'.repeat(200_000) + 'E'.repeat(30_000);
  const c = capResult(big);
  check('168: a huge result is cut to the cap, with its start and its end', c.text.length < RESULT_CAP + 200 && c.text.startsWith('SSS') && c.text.endsWith('EEE') && /characters cut from the middle/.test(c.text) && c.cut > 0);
  check('168: a normal result is left alone', capResult('short').text === 'short' && capResult('short').cut === 0);
  // "Intelligent exceptions" (owner, Nov 12): not a blind cut.
  const log = Array.from({ length: 5000 }, (_, i) => (i === 2000 ? 'src/auth.ts(41,7): error TS2345: wrong type' : i === 3100 ? 'Grimbold,dwarf,9120' : `  compiling module ${i} ... ok ${'.'.repeat(30)}`)).join('\n');
  const smart = capResult(log, RESULT_CAP, { ask: "what is Grimbold's score", saved: '/inn/bob/tool-results/x.txt' });
  check('168: a problem line from the middle is kept, with its line number', /2001: src\/auth\.ts\(41,7\): error TS2345/.test(smart.text), smart.text.slice(0, 300));
  check('168: a line that matches the ask is kept too', /3101: Grimbold,dwarf,9120/.test(smart.text) && smart.kept === 2);
  check('168: the first line says where the whole result is, and how to read more', /^\(Long result: [\d,]+ characters\. The whole of it is saved at \/inn\/bob\/tool-results\/x\.txt: read more with read_file/.test(smart.text));
  check('168: room the picked lines don\'t need goes to the start and the end', smart.text.length > RESULT_CAP - 400 && smart.text.length <= RESULT_CAP);
  check('168: the limit grows with the brain\'s memory', capFor(0) === RESULT_CAP && capFor(65536) === 98304 && capFor(10_000_000) === RESULT_MAX);
}

// ---------- 169: plain text only ----------
check('169: undefined becomes nothing, and says so', cleanResult(undefined).text === '' && /undefined/.test(cleanResult(undefined).fixed));
check('169: an object becomes its JSON, not [object Object]', cleanResult({ a: 1 }).text === '{"a":1}' && cleanResult({ a: 1 }).fixed);
check('169: an object with text gives its text', cleanResult({ text: 'hello' }).text === 'hello');
check('169: control characters are taken out, tabs and new lines kept', cleanResult('a\u0000b\tc\nd').text === 'ab\tc\nd');
check('169: a plain string is untouched', cleanResult('fine').text === 'fine' && !cleanResult('fine').fixed);

// ---------- 170, 172, 180: one table ----------
check('170: making a picture is safe to repeat; an edit is not', repeatSafe('make_image') && repeatSafe('write_file') && !repeatSafe('edit_file') && !repeatSafe('run_command'));
check('172: looks are read-only, actions are not', riskOf('read_file') === 'look' && riskOf('write_file') === 'change' && riskOf('mcp_use') === 'send');
check('172: a tool nobody listed is treated carefully', riskOf('brand_new_tool') === 'change' && !repeatSafe('brand_new_tool') && WAIT_IF_CUT.test('brand_new_tool'));
check('172: a tool can say it itself', riskOf('brand_new_tool', { risk: 'look' }) === 'look' && kindOf('read_file', { min: 2 }).min === 2);
check('172: restarts keep their old rules', SIDE_EFFECT.test('app_act') && SIDE_EFFECT.test('make_image') && !SIDE_EFFECT.test('web_search') && WAIT_IF_CUT.test('edit_file') && WAIT_IF_CUT.test('run_command') && !WAIT_IF_CUT.test('make_image') && !WAIT_IF_CUT.test('write_file'));
check('180: only looks that wait on nobody run side by side', LOOK_TOGETHER.has('web_search') && LOOK_TOGETHER.has('read_file') && !LOOK_TOGETHER.has('ask_user') && !LOOK_TOGETHER.has('app_look') && !LOOK_TOGETHER.has('write_file'));
check('180: a window look is never a repeat', isVolatile('app_look') && isVolatile('list_schedules') && !isVolatile('read_file'));

// ---------- 171: an action key across a restart ----------
{
  const before = [{ name: 'write_file', args: '{"path":"a.txt","content":"x"}', text: 'Wrote a.txt' }, { name: 'web_search', args: '{"query":"q"}', text: 'r' }];
  const l = lastFinished(before);
  check('171: the last finished action is found, with its inputs', l?.name === 'write_file' && l.args.path === 'a.txt');
  check('171: inputs cut short when saved give no key', lastFinished([{ name: 'write_file', args: '{"path":"a.txt","content":"xx', text: 'w' }]) === null);
  check('171: only looks before: nothing to guard', lastFinished([{ name: 'web_search', args: '{}' }]) === null);
}

// ---------- 175: every tool has a time limit ----------
check('175: looks get 5 minutes, changes 15', limitMs('read_file') === LOOK_MIN * 60_000 && limitMs('edit_file') === CHANGE_MIN * 60_000);
check('175: a tool with its own limit gets that plus 2', limitMs('run_command', null, { ownMin: 60 }) === 62 * 60_000);
check('175: a tool that waits on a person has none', limitMs('ask_user') === 0 && limitMs('show_plan') === 0);
check('175: a long maker gets longer', limitMs('make_video') === 90 * 60_000);

// ---------- 178: nothing back, said plainly ----------
check('178: one fixed form for nothing found', isNothingFound(NOTHING_FOUND('search_files')) && !isNothingFound('found 3 files'));

// ---------- 179: tool descriptions are tested for size, and every tool is in the table ----------
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
{
  const missing = Object.keys(brain.tools).filter((n) => !(n in TOOL_KINDS));
  check('179: every tool says what it risks (a new tool must be added to tool-kinds.js)', !missing.length, missing.join(', '));
  const big = Object.values(brain.tools).map((t) => [t.schema.function.name, JSON.stringify(t.schema.function).length]).filter(([, n]) => n > 2000);
  check('179: no single tool reads longer than 2,000 characters', !big.length, big.map((x) => x.join(' ')).join(', '));
  const unknown = Object.keys(TOOL_KINDS).filter((n) => !brain.tools[n]);
  check('179: the table lists no tool that is gone', !unknown.length, unknown.join(', '));
}

// ---------- runTool: the same rules for every tool ----------
{
  const job = { emit: () => {}, signal: new AbortController().signal, allowAll: new Set() };
  brain.tools.t_look = { schema: { type: 'function', function: { name: 't_look', description: 'test', parameters: { type: 'object', properties: {} } } }, risk: 'look', run: async () => undefined };
  const r1 = await brain.runTool('t_look', {}, job);
  check('178: a look that gives back nothing says so', r1.text === NOTHING_FOUND('t_look') && r1.ok === true, JSON.stringify(r1));
  brain.tools.t_obj = { schema: { type: 'function', function: { name: 't_obj', description: 'test', parameters: { type: 'object', properties: {} } } }, risk: 'look', run: async () => ({ rows: 2 }) };
  const r2 = await brain.runTool('t_obj', {}, job);
  check('169: a tool that gives back an object hands on text', r2.text === '{"rows":2}');
  brain.tools.t_big = { schema: { type: 'function', function: { name: 't_big', description: 'test', parameters: { type: 'object', properties: {} } } }, risk: 'look', run: async () => 'x'.repeat(300_000) };
  const r3 = await brain.runTool('t_big', {}, job);
  check('168: a huge result is cut before it goes anywhere', r3.text.length <= RESULT_CAP);
  const kept = (r3.text.match(/saved at (.+?\.txt):/) || [])[1];
  check('168: and the whole of it is saved in Bob\'s own folder for read_file', kept && kept.startsWith(path.join(dataDir, 'tool-results')) && fs.readFileSync(kept, 'utf8').length === 300_000, String(kept));
  const rf = kept ? await brain.runTool('read_file', { path: kept }, job) : { text: '' };
  check('168: read_file can open the saved result', /x{100}/.test(rf.text) && !/^Error/.test(rf.text), rf.text.slice(0, 200));
  brain.cfg.lock = { enabled: true, wrapped: 'w' };
  const r3b = await brain.runTool('t_big', {}, job);
  check('168: with the passcode lock on, no plain copy is saved', !/saved at/.test(r3b.text) && r3b.text.length <= RESULT_CAP);
  delete brain.cfg.lock;
  let gotSignal = null;
  brain.tools.t_hang = { schema: { type: 'function', function: { name: 't_hang', description: 'test', parameters: { type: 'object', properties: {} } } }, risk: 'look', run: (a, ctx) => { gotSignal = ctx.signal; return new Promise(() => {}); } };
  brain.toolLimitMs = () => 60;
  const r4 = await brain.runTool('t_hang', {}, job);
  check('175: a tool that hangs is let go at its limit, and fails plainly', /^Error: t_hang didn't finish within .* stopped waiting/.test(r4.text) && r4.ok === false, JSON.stringify(r4));
  check('175: the tool keeps the job\'s own Stop signal (the card\'s line is keyed by it)', gotSignal === job.signal);
  delete brain.toolLimitMs;
  brain.tools.t_fail = { schema: { type: 'function', function: { name: 't_fail', description: 'test', parameters: { type: 'object', properties: {} } } }, risk: 'look', run: async () => { throw new Error('broke'); } };
  const r5 = await brain.runTool('t_fail', {}, job);
  check('167: a failed tool is marked failed in the field', r5.ok === false && /^Error: broke/.test(r5.text));
  for (const n of ['t_look', 't_obj', 't_big', 't_hang', 't_fail']) delete brain.tools[n];
}

// ---------- 173: calls this step can't offer ----------
{
  brain.tools.t_act = { schema: { type: 'function', function: { name: 't_act', description: 'test', parameters: { type: 'object', properties: {} } } }, run: async () => 'did it' };
  const offered = brain.toolSchemas(['read_file']);
  const calls = [{ function: { name: 't_act', arguments: {} } }, { function: { name: 'web_search', arguments: { query: 'x' } } }, { function: { name: 'read_file', arguments: { path: 'a' } } }];
  brain.notOffered(calls, offered, { loaded: new Set() });
  check('173: an action in no group this job has goes back', /isn't offered here/.test(calls[0].bounce || ''));
  check('173: a look still runs', !calls[1].bounce && !calls[2].bounce);
  const hatCalls = [{ function: { name: 'write_file', arguments: {} } }];
  brain.notOffered(hatCalls, offered, {}, { hat: true });
  check('173: a helper\'s action outside its own list goes back', /isn't one of the tools for this job/.test(hatCalls[0].bounce || ''));
  const quiet = [{ function: { name: 'write_file', arguments: {} } }];
  brain.notOffered(quiet, [], { noTools: true, loaded: new Set() });
  check('173: once a step has no tools, an action goes back', /no tools are offered/.test(quiet[0].bounce || ''));
  const grouped = [{ function: { name: 'write_file', arguments: {} } }];
  brain.notOffered(grouped, offered, { loaded: new Set() });
  check('173: a tool from a group the job can add still runs, as before', !grouped[0].bounce);
  delete brain.tools.t_act;
}

// ---------- A whole turn: two calls to the same tool, each result with its call ----------
{
  const b2 = new Brain(cfg, () => {});
  clearInterval(b2.reminderTimer);
  b2.ensureModel = async () => {}; b2.fitCtx = async () => 8192; b2.recall = async () => '';
  b2.runTool = async (name, args) => (name === 'read_file' ? { text: `contents of ${args.path}`, ok: true } : { text: 'x', ok: true });
  const script = [{ role: 'assistant', content: '', tool_calls: [{ function: { name: 'read_file', arguments: { path: 'one.txt' } } }, { function: { name: 'read_file', arguments: { path: 'two.txt' } } }] }, { role: 'assistant', content: 'Read both.' }];
  b2.engine = { chat: async () => script.shift() || { role: 'assistant', content: 'done' }, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
  const { jobId } = b2.enqueue('main', 'read one.txt and two.txt in my documents');
  await until(() => ['done', 'failed'].includes(b2.queue.find((j) => j.id === jobId)?.state));
  const s = b2.session('main');
  const asked = s.find((m) => m.role === 'assistant' && m.tool_calls?.length === 2);
  const results = s.filter((m) => m.role === 'tool');
  const byId = Object.fromEntries(results.map((m) => [m.tool_call_id, m.content]));
  check('165: in a real turn, each call has an id and its own result', asked && asked.tool_calls.every((c) => c.id) && byId[asked.tool_calls[0].id] === 'contents of one.txt' && byId[asked.tool_calls[1].id] === 'contents of two.txt', JSON.stringify(results));
  check('167: and each result says ok in its field', results.every((m) => m.ok === true));
  b2.stop?.();
}

// ---------- 174: a dry run first ----------
{
  const d = lineChanges('a\nb\nc\nd\n', 'a\nB\nc\nd\n');
  check('174: overwriting a file shows the lines that really change', d && d.gone === 1 && d.added === 1 && d.from === 2 && /- b\n\+ B/.test(d.diff), JSON.stringify(d));
  check('174: the same content changes nothing', lineChanges('x\r\ny', 'x\ny') === null);
  const f = path.join(innDir, 'note.txt');
  fs.writeFileSync(f, 'one\ntwo\n');
  const need = brain.tools.write_file.check({ path: f, content: 'one\nTWO\n' });
  check('174: the write card shows the change', typeof need === 'object' && /1 line out, 1 in/.test(need.text) && /\+ TWO/.test(need.diff), JSON.stringify(need));
  const from = path.join(innDir, 'from.txt'), to = path.join(innDir, 'moved', 'from.txt'), made = path.join(innDir, 'made.zip');
  fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, 'x'); fs.writeFileSync(made, 'z');
  const rows = undoPreview({ steps: [{ op: 'move', from, to }, { op: 'create', path: made }, { op: 'deleted', from: path.join(innDir, 'gone.txt') }] });
  check('174: an undo lists what will really happen, and what can\'t', rows.length === 3 && rows.some((r) => /Move back/.test(r.line)) && rows.some((r) => /Recycle Bin/.test(r.line)) && rows.some((r) => r.cant && /deleted for good/.test(r.line)), JSON.stringify(rows));
}

// ---------- 176, 177: connected apps reconnect and pause ----------
{
  resetPauses();
  const s = { id: 'app1', name: 'Blender' };
  let opens = 0, tries = 0;
  const out = await withApp(s, null, async () => { opens++; return {}; }, async () => { tries++; if (tries === 1) throw Object.assign(new Error('forgot'), { forgot: true }); return 'ok'; });
  check('176: an app that forgot the connection is connected again and tried once more', out === 'ok' && opens === 2 && tries === 2);
  let n = 0;
  const failing = () => withApp(s, null, async () => ({}), async () => { n++; throw new Error('no answer'); }).catch((e) => e.message);
  for (let i = 0; i < PAUSE_AFTER; i++) await failing();
  check('177: after three failures in a row the app is paused', appPaused('app1') > 0);
  const msg = await failing();
  check('177: while paused it isn\'t called, and the reason is plain', n === PAUSE_AFTER && /paused for \d+ more minute/.test(msg), msg);
  resetPauses();
  for (let i = 0; i < PAUSE_AFTER + 1; i++) await withApp(s, null, async () => ({}), async () => { throw Object.assign(new Error('bad input'), { appSaid: true }); }).catch(() => {});
  check('177: the app saying no to a call is an answer, not a failure', appPaused('app1') === 0);
  resetPauses();
  stopAllServers();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
