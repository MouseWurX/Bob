// Routines (routines.js, hands-routines.js, public/routine-nodes.js): the Hand is off to start with; a routine is
// checked (red marks for missing pins, circles, wrong wire colours, the mail lock); it only runs with an OK that
// matches what it is now; tool, brain, If, For each, Make text and results run in wired order; a failed pin takes the
// run elsewhere; looks get a second try and changes don't; a run cut off mid-way carries on without doing anything
// twice; two failures in a row pause it; versions and going back; the triggers (time, new file, new e-mail, page);
// a test run changes nothing; Help, glossary and FAQ. Nothing here reads the real computer: tools, the brain, the clock,
// mail and pages are all fakes, and folders are throwaway ones.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { Routines, RoutineStore, runRoutine, fieldValue, ifTest, listFolder, globRe, dayList } from '../src/routines.js';
import { checkRoutine, graphHash, approvalLines, cleanRoutine, NODES, ROUTINE_TOOLS, runsBefore, refsIn } from '../public/routine-nodes.js';
import { writeOut, sample, callTool } from '../src/hands-routines.js';
import { AFTER_MAIL } from '../src/mail-guard.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + JSON.stringify(extra).slice(0, 400) : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-routines-'));
const cfg = { innDir: path.join(tmp, 'inn'), dataDir: path.join(tmp, 'inn', 'bob'), routinesOut: path.join(tmp, 'Out'), userName: 'Sam' };
fs.mkdirSync(cfg.dataDir, { recursive: true });
const N = (id, kind, f = {}, x = 0) => ({ id, kind, x, y: 0, f });
const W = (from, to, out = 'then') => ({ from, out, to });

// ---------- the Hand ----------
check('there is a Routines Hand with its one tool', HANDS.routines?.label === 'Routines' && HANDS.routines.tools.join() === 'routines');
check('it is off to start with, and its tool is hidden', cleanHands({}).routines.on === false && toolsOff({}).includes('routines'));
check('the Hand says Bob never makes or changes a routine', /never makes or changes a routine/.test(HANDS.routines.what));

// ---------- checks (the red marks) ----------
{
  const empty = checkRoutine({ nodes: [], wires: [] });
  check('an empty routine says to add a start', empty.some((p) => /Starts when/.test(p.text)));
  const two = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('b', 'trigger.manual')], wires: [] });
  check('only one "Starts when" node', two.some((p) => /Only one/.test(p.text)));
  const lonely = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('b', 'text', { text: 'hi' })], wires: [] });
  check('a node nothing runs into is marked', lonely.some((p) => p.node === 'b' && /never run/.test(p.text)));
  const circle = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('b', 'text', { text: 'x' }), N('c', 'text', { text: 'y' })], wires: [W('a', 'b'), W('b', 'c'), W('c', 'b')] });
  check('a circle of wires is marked (only For each repeats)', circle.some((p) => /circle/.test(p.text)));
  const twice = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('b', 'text', { text: 'x' }), N('c', 'text', { text: 'y' })], wires: [W('a', 'b'), W('a', 'c')] });
  check('one pin goes to one place', twice.some((p) => /only go to one place/.test(p.text)));
  const colour = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('b', 'text', { text: 'x' }), N('c', 'forEach', { list: '{{b.text}}' })], wires: [W('a', 'b'), W('b', 'c')] });
  check('a wire of the wrong colour is marked (text into a list)', colour.some((p) => p.node === 'c' && /takes list, not text/.test(p.text)));
  const later = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('b', 'text', { text: '{{c.text}}' }), N('c', 'text', { text: 'x' })], wires: [W('a', 'b'), W('b', 'c')] });
  check('using a value from a node that runs later is marked', later.some((p) => p.node === 'b' && /doesn't always run before/.test(p.text)));
  const branch = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('i', 'if', { value: 'x', test: 'empty' }), N('b', 'text', { text: 'x' }), N('c', 'text', { text: '{{b.text}}' })], wires: [W('a', 'i'), W('i', 'b', 'yes'), W('i', 'c', 'no')] });
  check('a value from only one side of an If is marked', branch.some((p) => p.node === 'c' && /doesn't always run before/.test(p.text)));
  const badTool = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('t', 'tool', { tool: 'run_command' })], wires: [W('a', 't')] });
  check('tools that don\'t fit a routine are refused (run_command)', badTool.some((p) => /can't be used in a routine/.test(p.text)));
  check('no tool that waits on a person or always asks is on the list', !['ask_user', 'hire_brain', 'ask_cloud', 'use_pack_tool', 'run_command', 'browser_act', 'app_act', 'mcp_use', 'make_tool'].some((t) => ROUTINE_TOOLS[t]));
  const mail = checkRoutine({ nodes: [N('a', 'trigger.mail'), N('t', 'tool', { tool: 'fetch_page', url: 'https://example.com/?{{a.subject}}' })], wires: [W('a', 't')] }, { afterMail: [...AFTER_MAIL] });
  check('the mail lock: a routine that reads e-mail can\'t fetch pages', mail.some((p) => p.node === 't' && /mail lock/.test(p.text)));
  const mailOk = checkRoutine({ nodes: [N('a', 'trigger.mail'), N('t', 'tool', { tool: 'notice_board', action: 'add', content: '{{a.subject}}' })], wires: [W('a', 't')] }, { afterMail: [...AFTER_MAIL] });
  check('the mail lock lets the notice board through', !mailOk.length, mailOk);
  const time = checkRoutine({ nodes: [N('a', 'trigger.time', { type: 'daily' })], wires: [] });
  check('a time start needs its time', time.some((p) => /Set the time/.test(p.text)));
  const outName = checkRoutine({ nodes: [N('a', 'trigger.manual'), N('o', 'out.file', { name: '..\\..\\x.txt', text: 'hi' })], wires: [W('a', 'o')] });
  check('a result file name can\'t climb out of its folder', outName.some((p) => p.node === 'o' && /can't have/.test(p.text)));
  check('refsIn finds wires in mixed words', refsIn('New: {{n2.name}} in {{n1.path}}').map((r) => `${r.node}.${r.pin}`).join() === 'n2.name,n1.path');
  check('runsBefore: the start runs before everything', runsBefore({ nodes: [N('a', 'trigger.manual'), N('b', 'text')], wires: [W('a', 'b')] }, 'a', 'b'));
  let threw = ''; try { cleanRoutine({ id: '../x' }); } catch (e) { threw = e.message; }
  check('a routine id can\'t be a path', /id of letters/.test(threw));
}

// ---------- fingerprint and the OK card ----------
const daily = {
  id: 'daily', name: 'Bank summary',
  nodes: [N('t', 'trigger.manual'), N('r', 'tool', { tool: 'read_file', path: 'C:\\Work\\bank.txt' }), N('b', 'brain', { question: 'Sum it up', input: '{{r.text}}' }), N('o', 'out.file', { name: 'summary.md', text: '# Today\n{{b.answer}}' }), N('n', 'out.notice', { text: 'Bank: {{b.answer}}' })],
  wires: [W('t', 'r'), W('r', 'b'), W('b', 'o'), W('o', 'n')]
};
{
  const moved = { ...daily, nodes: daily.nodes.map((n) => ({ ...n, x: n.x + 50 })) };
  check('moving boxes around doesn\'t change the fingerprint', graphHash(moved) === graphHash(daily));
  const changed = { ...daily, nodes: daily.nodes.map((n) => (n.id === 'o' ? { ...n, f: { ...n.f, name: 'other.md' } } : n)) };
  check('changing a field does', graphHash(changed) !== graphHash(daily));
  const lines = approvalLines(daily).map((l) => l.text);
  check('the OK card lists what it reads, asks and saves', lines.some((l) => /Looks: Read a file/.test(l)) && lines.some((l) => /Asks the brain/.test(l) && /can't add steps/.test(l)) && lines.some((l) => /Saves "summary.md"/.test(l)) && lines.some((l) => /notice board/.test(l)), lines);
}

// ---------- running ----------
const fakeDeps = (over = {}) => {
  const calls = [], wrote = [], notes = [], taps = [], chats = [];
  return {
    calls, wrote, notes, taps, chats,
    callTool: async (name, args) => { calls.push({ name, args }); return over.tool ? over.tool(name, args) : { text: `contents of ${args.path || args.url || ''}`, ok: true }; },
    askBrain: async (q, input, o) => (over.brain ? over.brain(q, input, o) : `Summary (${input.length} chars)`),
    writeOut: async (name, text, add) => { wrote.push({ name, text, add }); return `/out/${name}`; },
    notice: async (t) => notes.push(t), tap: async (t) => taps.push(t), chat: async (t) => chats.push(t), made: async () => {},
    sleep: async () => {}, saveRun: () => {}
  };
};
{
  const d = fakeDeps();
  const run = await runRoutine(daily, { at: 'now' }, d);
  check('a routine runs in wired order', run.status === 'done' && run.steps.map((s) => s.node).join() === 't,r,b,o,n', run);
  check('values travel along the wires', d.calls[0].args.path === 'C:\\Work\\bank.txt' && d.wrote[0].text === '# Today\nSummary (28 chars)' && d.notes[0] === 'Bank: Summary (28 chars)', { w: d.wrote, n: d.notes });
  check('every step is recorded with what came out', run.steps.find((s) => s.node === 'b').out.answer === 'Summary (28 chars)');
}
{
  const r = { id: 'loop', name: 'Each line', nodes: [N('t', 'trigger.manual'), N('l', 'lines', { text: 'a\nb\n\nc' }), N('e', 'forEach', { list: '{{l.list}}' }), N('i', 'if', { value: '{{e.item}}', test: 'equals', with: 'b' }), N('x', 'text', { text: 'item {{e.index}}: {{e.item}}' }), N('c', 'out.chat', { text: '{{x.text}}' }), N('done', 'out.tap', { text: '{{l.count}} lines' })],
    wires: [W('t', 'l'), W('l', 'e'), W('e', 'i', 'each'), W('i', 'x', 'no'), W('x', 'c'), W('e', 'done', 'done')] };
  check('the For each routine has no problems', !checkRoutine(r).length, checkRoutine(r));
  const d = fakeDeps();
  const run = await runRoutine(r, {}, d);
  check('For each runs its steps per item, If skips one, done runs after', run.status === 'done' && d.chats.join('|') === 'item 0: a|item 2: c' && d.taps[0] === '3 lines', { c: d.chats, t: d.taps, run });
}
{
  // a failing look: tried twice; a failing change: tried once; the failed pin takes it elsewhere
  let n = 0;
  const d = fakeDeps({ tool: (name) => { n++; return name === 'read_file' ? { text: 'Error: no such file', ok: false } : { text: 'Error: folder not allowed', ok: false }; } });
  const looks = { id: 'f1', name: 'x', nodes: [N('t', 'trigger.manual'), N('r', 'tool', { tool: 'read_file', path: 'C:\\a.txt' }), N('tap', 'out.tap', { text: 'failed: {{r.result}}' })], wires: [W('t', 'r'), W('r', 'tap', 'failed')] };
  const run = await runRoutine(looks, {}, d);
  check('a look that fails gets a second try', n === 2 && run.steps.find((s) => s.node === 'r').tries === 2);
  check('its "failed" pin takes the run on, with the error in hand', run.status === 'done' && /no such file/.test(d.taps[0]), d.taps);
  n = 0;
  const change = { id: 'f2', name: 'y', nodes: [N('t', 'trigger.manual'), N('w', 'tool', { tool: 'write_file', path: 'C:\\x.txt', content: 'hi' })], wires: [W('t', 'w')] };
  const run2 = await runRoutine(change, {}, d);
  check('a change that fails is not tried twice, and with no failed pin the run stops', n === 1 && run2.status === 'failed' && /folder not allowed/.test(run2.error) && run2.failedAt === 'w', run2);
}
{
  // Stop node; brain yes/no into If
  const d = fakeDeps({ brain: (q, i, o) => (o.yesNo ? 'Yes, it is urgent.' : '?') });
  const r = { id: 's', name: 'z', nodes: [N('t', 'trigger.manual'), N('b', 'brain', { question: 'Urgent?', input: 'x', answer: 'yesno' }), N('i', 'if', { value: '{{b.yes}}', test: 'yes' }), N('st', 'stop', { failed: true, why: 'it was urgent' })], wires: [W('t', 'b'), W('b', 'i'), W('i', 'st', 'yes')] };
  const run = await runRoutine(r, {}, d);
  check('a yes/no brain answer drives an If, and Stop can mark a failure', run.status === 'failed' && run.error === 'it was urgent', run);
}
{
  // a test run: looks really run, changes and results are only described
  const d = fakeDeps();
  const r = { ...daily, nodes: [...daily.nodes, N('w', 'tool', { tool: 'write_file', path: 'C:\\x.txt', content: 'x' })], wires: [...daily.wires, W('n', 'w')] };
  const run = await runRoutine(r, {}, d, { dry: true });
  check('a test run changes nothing', run.dry && run.status === 'done' && !d.wrote.length && !d.notes.length && d.calls.every((c) => c.name === 'read_file'), { d: d.calls, run });
  check('a test run says what it would have done', run.steps.some((s) => /would use Write a file/.test(s.said || '')) && run.steps.some((s) => /would save summary.md/.test(s.said || '')));
}
{
  // time limit
  const d = fakeDeps({ tool: () => new Promise(() => {}) });
  d.limitMs = () => 30;
  const r = { id: 'slow', name: 'slow', nodes: [N('t', 'trigger.manual'), N('w', 'tool', { tool: 'write_file', path: 'C:\\x', content: 'x' })], wires: [W('t', 'w')] };
  const run = await runRoutine(r, {}, d);
  check('a step past its time limit fails plainly', run.status === 'failed' && /took longer than/.test(run.error), run);
}
{
  // carrying on after Bob was closed mid-run
  const d = fakeDeps();
  const cut = { id: 'old', routine: 'daily', name: 'Bank summary', hash: graphHash(daily), startedAt: 1, trigger: {}, status: 'running', steps: [], done: { t: { out: {}, pin: 'then' }, r: { out: { text: 'bank lines', result: 'bank lines', ok: true }, pin: 'then' } } };
  const run = await runRoutine(daily, {}, d, { run: cut });
  check('a cut-off run carries on from the last finished step', run.status === 'done' && !d.calls.length && d.wrote.length === 1 && /Summary \(10 chars\)/.test(d.wrote[0].text), { run, d: d.wrote });
  const d2 = fakeDeps();
  const half = { ...cut, id: 'old2', status: 'running', done: { t: { out: {}, pin: 'then' }, r: { out: { text: 'x', ok: true }, pin: 'then' }, b: { out: { answer: 'A', yes: false }, pin: 'then' } }, begun: { o: 5 } };
  const run2 = await runRoutine(daily, {}, d2, { run: half });
  check('a change that was cut off half-way isn\'t done again', run2.status === 'failed' && /nothing happens twice/.test(run2.error) && !d2.wrote.length, run2);
}
check('fieldValue keeps a list a list, and words make text', Array.isArray(fieldValue('{{a.l}}', new Map([['a', { l: ['x', 'y'] }]]))) && fieldValue('n={{a.n}}', new Map([['a', { n: 3 }]])) === 'n=3');
check('If tests', ifTest('contains', 'Hello World', 'world') && ifTest('more', 'Price: $12.50', '10') && !ifTest('less', 'abc', '3') && ifTest('empty', '  ', '') && ifTest('yes', 'Yes.', ''));
check('days and file patterns', dayList('mon, thu').join() === '1,4' && globRe('*.pdf; report-??.csv').test('report-01.csv') && !globRe('*.pdf').test('a.pdf.exe'));

// ---------- the store, the OK, switching on, versions, pausing ----------
{
  const R = new Routines(cfg, { isOn: () => true, tools: () => Object.keys(ROUTINE_TOOLS), afterMail: [...AFTER_MAIL], runDeps: () => fakeDeps(), tap: (t) => taps.push(t) });
  const taps = [];
  R.deps.tap = (t) => taps.push(t);
  const v = R.save(daily);
  check('a saved routine starts off and needs an OK', !v.on && !v.approved);
  let e1 = ''; try { R.setOn('daily', true); } catch (e) { e1 = e.message; }
  check('it can\'t be switched on without the OK', /needs your OK/.test(e1));
  let e2 = ''; try { await R.start('daily', {}, { manual: true }); } catch (e) { e2 = e.message; }
  check('Run now needs the OK too', /OK/.test(e2));
  let e3 = ''; try { R.approve('daily', 'wrong'); } catch (e) { e3 = e.message; }
  check('an OK for a different version of it is refused', /changed since/.test(e3));
  const ok = R.approve('daily', v.hash);
  check('with the OK it is on', ok.on && ok.approved);
  const ran = await R.start('daily', {}, { manual: true });
  check('Run now runs it, and the run is kept', ran.status === 'done' && R.store.runs('daily').length === 1 && R.store.runs('daily')[0].status === 'done');
  const changed = R.save({ ...daily, nodes: daily.nodes.map((n) => (n.id === 'o' ? { ...n, f: { ...n.f, name: 'other.md' } } : n)) });
  check('a change needs a new OK, and it stops running until then', !changed.on && !changed.approved && changed.changedSinceOk);
  check('the old version is kept', R.store.versions('daily').length === 2);
  const back = R.rollback('daily', 1);
  check('going back to version 1 puts its steps back (and still needs an OK, as it was OK\'d before)', back.nodes.find((n) => n.id === 'o').f.name === 'summary.md' && back.approved === true);
  // two failures in a row pause it
  const bad = { id: 'bad', name: 'Bad', nodes: [N('t', 'trigger.manual'), N('w', 'tool', { tool: 'write_file', path: 'C:\\x', content: 'x' })], wires: [W('t', 'w')] };
  R.deps.runDeps = () => fakeDeps({ tool: () => ({ text: 'Error: nope', ok: false }) });
  const bv = R.save(bad); R.approve('bad', bv.hash);
  await R.start('bad', {}, { manual: true });
  check('one failure taps you, and it stays on', R.get('bad').on && taps.some((t) => /didn't finish/.test(t)));
  await R.start('bad', {}, { manual: true });
  check('two failures in a row pause it and say so', !R.get('bad').on && /Paused after 2/.test(R.get('bad').paused) && taps.some((t) => /is paused/.test(t)));
  R.deps.isOn = () => false;
  let e4 = ''; try { await R.start('daily', {}, { manual: true }); } catch (e) { e4 = e.message; }
  check('nothing runs while the Routines Hand is off', /Routines Hand is off/.test(e4));
  check('remove', R.remove('bad') && !R.get('bad'));
  R.deps.isOn = () => true;
  // a run left "running" on disk (Bob closed) is carried on at start
  const cut = { id: 'cut-run-1', routine: 'daily', name: 'Bank summary', hash: R.get('daily').hash, startedAt: 2, trigger: {}, status: 'running', steps: [], done: { t: { out: {}, pin: 'then' } } };
  R.store.saveRun(cut);
  const seen = [];
  R.deps.runDeps = () => { const d = fakeDeps(); d.callTool = async (n, a) => { seen.push(n); return { text: 'x', ok: true }; }; return d; };
  await R.carryOn();
  check('at start, a run that was cut off carries on', R.store.run('daily', 'cut-run-1')?.status === 'done' && seen.join() === 'read_file');
}

// ---------- triggers ----------
{
  let now = new Date(2026, 10, 23, 8, 0).getTime();
  const started = [];
  const watch = path.join(tmp, 'Inbox');
  fs.mkdirSync(watch, { recursive: true });
  fs.writeFileSync(path.join(watch, 'old.pdf'), 'x');
  const mailbox = [{ uid: 5, from: 'bank (made up)', subject: 'Old' }];
  let page = 'Price: $20';
  const R = new Routines({ ...cfg, dataDir: path.join(tmp, 'inn2') }, {
    isOn: () => true, hold: () => false, now: () => now, tools: () => Object.keys(ROUTINE_TOOLS), afterMail: [...AFTER_MAIL],
    runDeps: () => fakeDeps(),
    listMail: async () => ({ mail: mailbox }), readMail: async (uid) => ({ ...mailbox.find((m) => m.uid === uid), text: 'Body' }),
    checkPage: async (w, o) => { const part = page; const changed = w.part && w.part !== part; return { watch: { ...w, checked: o.now, part }, changed, before: w.part, now: part }; }
  });
  R.startSoon = async (id, data) => started.push({ id, data });
  const add = (r) => { const v = R.save(r); R.approve(r.id, v.hash); };
  add({ id: 'tm', name: 'Morning', nodes: [N('t', 'trigger.time', { type: 'daily', at: '09:00' }), N('c', 'out.tap', { text: 'morning' })], wires: [W('t', 'c')] });
  add({ id: 'fl', name: 'New PDFs', nodes: [N('t', 'trigger.file', { folder: watch, pattern: '*.pdf' }), N('c', 'out.tap', { text: '{{t.name}}' })], wires: [W('t', 'c')] });
  add({ id: 'ml', name: 'Bank mail', nodes: [N('t', 'trigger.mail', { from: 'bank', subject: 'statement' }), N('c', 'out.notice', { text: '{{t.subject}}' })], wires: [W('t', 'c')] });
  add({ id: 'pg', name: 'Price', nodes: [N('t', 'trigger.page', { url: 'https://example.com/item', find: 'Price', hours: 1 }), N('c', 'out.tap', { text: '{{t.now}}' })], wires: [W('t', 'c')] });
  await R.tick();
  check('the first look starts nothing (files and mail already there don\'t count)', !started.length, started);
  fs.writeFileSync(path.join(watch, 'new.pdf'), 'x'); fs.writeFileSync(path.join(watch, 'skip.txt'), 'x');
  mailbox.push({ uid: 6, from: 'bank (made up)', subject: 'Your statement' }, { uid: 7, from: 'bank (made up)', subject: 'An offer' });
  page = 'Price: $15';
  now += 61 * 60e3; // 09:01
  await R.tick();
  const ids = started.map((s) => s.id).sort().join();
  check('a time, a new matching file, new matching mail and a changed page each start their routine', ids === 'fl,ml,pg,tm', started);
  check('the trigger values are handed over', started.find((s) => s.id === 'fl')?.data.name === 'new.pdf' && started.find((s) => s.id === 'ml')?.data.subject === 'Your statement' && started.find((s) => s.id === 'ml')?.data.text === 'Body' && started.find((s) => s.id === 'pg')?.data.before === 'Price: $20');
  started.length = 0;
  now += 2 * 60e3;
  await R.tick();
  check('nothing starts twice for the same time, file, mail or page', !started.length, started);
  R.deps.hold = () => true;
  now += 24 * 3600e3;
  check('nothing is looked at while held (another user in, Quiet hours)', (await R.tick()) === 0);
  check('listFolder skips half-downloaded files', listFolder(watch, '*').every((f) => !/\.crdownload$/.test(f.name)));
}

// ---------- Bob's side ----------
{
  const file = writeOut(cfg, { name: 'Bank: summary?' }, 'a.md', 'one', false);
  writeOut(cfg, { name: 'Bank: summary?' }, 'a.md', 'two', true);
  check('results are saved in the routine\'s own folder, named safely, and can be added to', file === path.join(cfg.routinesOut, 'Bank summary', 'a.md') && fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n') === 'one\ntwo');
  let threw = ''; try { writeOut(cfg, { name: 'x' }, '..', 'x', false); } catch (e) { threw = e.message; }
  check('and never outside it', Boolean(threw) || !fs.existsSync(path.join(cfg.routinesOut, '..', 'x')));
  check('a test run gets made-up trigger values', sample({ nodes: [N('t', 'trigger.mail')] }).subject.startsWith('Test e-mail'));
  // the tool step goes through the brain's usual runner, marked as OK'd by the routine
  let seenCtx = null;
  const fakeBrain = { cfg, runTool: async (name, args, ctx) => { seenCtx = ctx; return { text: 'ok', ok: true }; } };
  const res = await callTool(fakeBrain, { id: 'r1' }, 'read_file', { path: 'x' });
  check('tool steps go through Bob\'s tool runner with the routine\'s OK', res.ok && seenCtx.routineOk === true && seenCtx.routine === 'r1');
  check('a tool that isn\'t for routines never reaches the runner', (await callTool(fakeBrain, { id: 'r1' }, 'run_command', {})).ok === false);
  const src = fs.readFileSync(new URL('../src/brain-tool-runs.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('the runner still runs check() first, so hard limits hold, and skips the card only for routine steps', /need && ctx\.routineOk && !tool\.alwaysAsk/.test(src) && src.indexOf('ctx.routineOk') > src.indexOf('let need = tool.check'));
}

// ---------- Help ----------
{
  const help = (id) => HELP.find((e) => e.id === id);
  check('Help has the Hand, the editor, the glossary word and an FAQ', help('hands-routines') && help('faq-routines') && /Routines/.test(help('settings-hands').html) && /<dt>Routine<\/dt>/.test(help('glossary').html));
  check('Help says where it works', /Windows, Mac and Linux/.test(help('hands-routines')?.html || '') && /Android/.test(help('hands-routines')?.html || ''));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
