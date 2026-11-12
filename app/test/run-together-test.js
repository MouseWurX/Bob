// Ask together (1.5.41): when a job needs more than one OK and "Let Bob work without asking" is off, every OK goes
// on one card. Allowed steps don't ask again (that exact step, once); denied ones aren't done; anything not on the
// card, or changed since, asks on its own; the hard limits still refuse; Stop everything denies the card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handsTools, handsPrompt, stopEverything } from '../src/hands.js';
import { stepKey, askTogether, askTogetherTool } from '../src/together.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-together-'));
const agentDir = path.join(tmp, 'Agent');
const innDir = path.join(agentDir, 'inn');
const dataDir = path.join(innDir, 'bob');
const work = path.join(tmp, 'Downloads');
for (const d of [dataDir, work]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readOnlyRoots: [dataDir], ownReadOnlyRoots: [dataDir], readRoots: [innDir, work], recycleBin: false, userName: 'Sam',
  hands: { enabled: true, files: { on: true }, run: { on: true }, folders: [work], timeoutMin: 1 } };
const put = (rel, body = 'x') => { const f = path.join(work, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- The same step, written a little differently ----------
{
  const a = stepKey('file_hands', { action: 'copy', paths: ['C:\\Users\\you\\a.txt'], to: 'C:\\Users\\you\\Out\\', why: 'tidy' });
  const b = stepKey('file_hands', JSON.stringify({ to: 'c:/users/you/out', paths: ['c:/users/you/A.TXT'], action: 'copy ' }));
  check('key ignores order, case and slashes in paths, and Bob\'s own "why"', a === b, `${a} vs ${b}`);
  check('key still tells different steps apart', stepKey('file_hands', { action: 'move', paths: ['a'] }) !== stepKey('file_hands', { action: 'copy', paths: ['a'] }));
  check('key keeps text that isn\'t a path exactly (case matters in what gets typed)', stepKey('app_act', { window: 'Notepad', action: 'type', text: 'Hi' }) !== stepKey('app_act', { window: 'notepad', action: 'type', text: 'hi' }));
}

// ---------- A fake Bob ----------
function makeBob(over = {}) {
  const logs = [], events = [];
  const fake = Object.create(Brain.prototype);
  const c = { ...cfg, hands: { ...cfg.hands, ...over } };
  Object.assign(fake, { cfg: c, tools: {}, approvals: new Map(), handApprovals: new Set(), state: { state: 'idle' }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`), broadcast: (e) => events.push(e), saveHands(next) { c.hands = next; } });
  Object.assign(fake.tools, handsTools(fake));
  fake.tools.ask_together = askTogetherTool(fake);
  const cards = [];
  let reply = (e) => ({ allow: true });
  const ctx = { emit: (e) => { events.push(e); if (e.type === 'approval') { cards.push(e); const r = reply(e); if (r) setTimeout(() => fake.answerApproval(e.id, r.allow, r.rows, r.items), 5); } }, signal: new AbortController().signal, allowAll: new Set() };
  return { fake, ctx, cards, logs, events, setReply: (f) => { reply = f; } };
}
const copy = (name, to) => ({ tool: 'file_hands', args: { action: 'copy', paths: [path.join(work, name)], to: path.join(work, to) }, say: `copy ${name}` });
const run = (cmd, args) => ({ tool: 'run_command', args: { cmd, args, cwd: work } });

// ---------- Allow all: one card, then no more ----------
{
  put('j1/a.txt'); put('j1/b.txt');
  const { fake, ctx, cards, logs, events } = makeBob();
  const steps = [copy('j1/a.txt', 'o1'), copy('j1/b.txt', 'o2'), run('node', ['--version'])];
  const res = await fake.runTool('ask_together', { why: 'Back up two notes and check Node', steps }, ctx);
  check('one card with all three OKs on it', cards.length === 1 && cards[0].together?.length === 3, JSON.stringify(cards));
  check('the card shows each step\'s real details (rows, the exact command)', Array.isArray(cards[0].together[0].plan) && cards[0].together[2].command === 'node --version', JSON.stringify(cards[0].together));
  check('the card can be stopped by Stop everything (it is a Hands card)', cards[0].hand === true);
  check('Bob\'s own reason stays off the card (it can\'t be checked against the steps); the logbook notes it by size, not words (item 248)', !cards[0].text.includes('Back up two notes') && logs.some((l) => /Bob gave a reason \(\d+ characters\)/.test(l)) && !logs.some((l) => /Back up two notes/.test(l)));
  check('the card doesn\'t leak the internal step keys', cards[0].together.every((i) => !('key' in i)));
  check('Bob is told all three are allowed', /Allowed 3 of 3/.test(res.text), res.text);
  await fake.runTool('file_hands', steps[0].args, ctx);
  await fake.runTool('file_hands', { ...steps[1].args, why: 'second' }, ctx);
  check('the allowed steps run without another card', cards.length === 1 && fs.existsSync(path.join(work, 'o1', 'a.txt')) && fs.existsSync(path.join(work, 'o2', 'b.txt')));
  check('the chat says each was allowed on the card above', events.filter((e) => e.type === 'allowed-earlier').length === 2);
  check('the logbook says so too', logs.filter((l) => /allowed on the combined card/.test(l)).length === 2 && logs.some((l) => /together: allowed 3 of 3/.test(l)));
  await fake.runTool('file_hands', steps[0].args, ctx);
  check('each OK is for one use: doing the same step again asks again', cards.length === 2 && /wasn't on the list you saw/.test(cards[1].text), cards[1]?.text);
  await fake.runTool('file_hands', { action: 'copy', paths: [path.join(work, 'j1/a.txt')], to: path.join(work, 'elsewhere') }, ctx);
  check('a step that wasn\'t on the card gets its own card, saying so', cards.length === 3 && /wasn't on the list you saw/.test(cards[2].text));
}

// ---------- Allow ticked: some yes, some no ----------
{
  put('j2/a.txt'); put('j2/b.txt');
  const { fake, ctx, cards, setReply } = makeBob();
  const steps = [copy('j2/a.txt', 'p1'), copy('j2/b.txt', 'p2')];
  setReply(() => ({ allow: true, items: [{ n: 1 }] }));
  const res = await fake.runTool('ask_together', { steps }, ctx);
  check('Bob hears which were allowed and which weren\'t', /Allowed 1 of 2/.test(res.text) && /Said no to: 2\./.test(res.text), res.text);
  const r2 = await fake.runTool('file_hands', steps[1].args, ctx);
  check('a step unticked on the card isn\'t done, and doesn\'t ask again', /said no to this on the card/.test(r2.text) && !fs.existsSync(path.join(work, 'p2')) && cards.length === 1);
  await fake.runTool('file_hands', steps[0].args, ctx);
  check('the ticked one runs', fs.existsSync(path.join(work, 'p1', 'a.txt')) && cards.length === 1);
}

// ---------- Rows ticked inside a step ----------
{
  put('j3/a.txt'); put('j3/b.txt');
  const { fake, ctx, cards, setReply } = makeBob();
  const steps = [{ tool: 'file_hands', args: { action: 'copy', paths: [path.join(work, 'j3/a.txt'), path.join(work, 'j3/b.txt')], to: path.join(work, 'q1') } }, run('node', ['--version'])];
  setReply((e) => ({ allow: true, items: [{ n: 1, rows: [String(e.together[0].plan[1].id)] }, { n: 2 }] }));
  await fake.runTool('ask_together', { steps }, ctx);
  await fake.runTool('file_hands', steps[0].args, ctx);
  check('only the rows ticked on the card are done', !fs.existsSync(path.join(work, 'q1', 'a.txt')) && fs.existsSync(path.join(work, 'q1', 'b.txt')) && cards.length === 1);
}

// ---------- Changed since the card ----------
{
  put('j4/a.txt');
  const { fake, ctx, cards } = makeBob();
  const steps = [{ tool: 'file_hands', args: { action: 'copy', paths: [path.join(work, 'j4/a.txt')], to: path.join(work, 'r1') } }, run('node', ['--version'])];
  await fake.runTool('ask_together', { steps }, ctx);
  put('r1/a.txt', 'already here'); // so the copy now lands under another name
  await fake.runTool('file_hands', steps[0].args, ctx);
  check('files that changed since the card ask again, saying why', cards.length === 2 && /changed since the list you saw/.test(cards[1].text), cards[1]?.text);
}

// ---------- Deny all ----------
{
  put('j5/a.txt');
  const { fake, ctx, cards, setReply } = makeBob();
  setReply(() => ({ allow: false }));
  const steps = [copy('j5/a.txt', 's1'), run('node', ['--version'])];
  const res = await fake.runTool('ask_together', { steps }, ctx);
  check('Deny all: Bob is told no to all of it', /said no to all of it/.test(res.text));
  const r = await fake.runTool('file_hands', steps[0].args, ctx);
  check('and a denied step isn\'t done or asked again', /said no to this on the card/.test(r.text) && cards.length === 1 && !fs.existsSync(path.join(work, 's1')));
}

// ---------- Hard limits still refuse ----------
{
  const { fake, ctx, cards } = makeBob();
  const steps = [run('format', ['C:']), run('node', ['--version'])];
  await fake.runTool('ask_together', { steps }, ctx);
  check('a blocked step is still shown on the card, marked to be checked', cards[0].together?.length === 2 && cards[0].together[0].later, JSON.stringify(cards[0]?.together?.[0]));
  const r = await fake.runTool('run_command', steps[0].args, ctx);
  check('allowing it on the card doesn\'t get past the hard limit', /^Error:/.test(r.text) && cards.length === 1, r.text);
}

// ---------- A step that can't be checked yet, in words ----------
{
  const { fake, ctx, cards } = makeBob();
  fake.tools.app_act = { check: () => { throw new Error('There is no open window called "Notepad".'); }, run: async () => 'ok', summary: () => 'apps: click' };
  fake.usable = () => true;
  await fake.runTool('ask_together', { steps: [{ tool: 'app_act', args: { window: 'Notepad', action: 'click', type: 'Button', name: 'Save' } }, run('node', ['--version'])] }, ctx);
  const it = cards[0].together[0];
  check('a step that waits says what it does in words', it.text === 'Click the Save button in Notepad', it.text);
  check('and its details name the kind of thing', /Button: Save/.test(it.details) && !/Name: Save/.test(it.details), it.details);
}

// ---------- Only one OK: the usual card ----------
{
  put('j6/a.txt');
  const { fake, ctx, cards } = makeBob();
  const res = await fake.runTool('ask_together', { steps: [copy('j6/a.txt', 't1')] }, ctx);
  check('one step on its own still gets one card (the same choices)', cards.length === 1 && cards[0].together?.length === 1 && /Allowed 1 of 1/.test(res.text));
  const none = await fake.runTool('ask_together', { steps: [{ tool: 'list_folder', args: { path: work } }] }, ctx);
  check('steps that need no OK: no card', /needs an OK/.test(none.text) && cards.length === 1);
}

// ---------- Several calls in one reply ----------
{
  put('j7/a.txt'); put('j7/b.txt');
  const { fake, ctx, cards } = makeBob();
  const calls = [copy('j7/a.txt', 'u1'), copy('j7/b.txt', 'u2')].map((s) => ({ function: { name: s.tool, arguments: JSON.stringify(s.args) } }));
  const n = await askTogether(fake, calls, ctx);
  for (const c of calls) await fake.runTool(c.function.name, c.function.arguments, ctx);
  check('two OKs in one reply go on one card, then both run', n === 2 && cards.length === 1 && fs.existsSync(path.join(work, 'u1', 'a.txt')) && fs.existsSync(path.join(work, 'u2', 'b.txt')));
  const one = await askTogether(fake, calls.slice(0, 1), ctx);
  check('a reply with only one OK keeps the usual card', one === 0 && cards.length === 1);
}

// ---------- Work without asking: no cards at all ----------
{
  put('j8/a.txt'); put('j8/b.txt');
  const { fake, ctx, cards } = makeBob({ free: true });
  const calls = [copy('j8/a.txt', 'v1'), copy('j8/b.txt', 'v2')].map((s) => ({ function: { name: s.tool, arguments: s.args } }));
  check('with "work without asking" on, nothing is gathered', (await askTogether(fake, calls, ctx)) === 0 && cards.length === 0);
  check('and ask_together just says to go ahead', /No cards right now/.test((await fake.runTool('ask_together', { steps: [copy('j8/a.txt', 'v1')] }, ctx)).text) || /can't be used|no tool/.test((await fake.runTool('ask_together', { steps: [] }, ctx)).text));
  check('ask_together is hidden from Bob while it\'s on', fake.offTools().has('ask_together'));
  check('the prompt only mentions ask_together when cards are on', /ask_together/.test(handsPrompt({ ...cfg })) && !/ask_together/.test(handsPrompt(fake.cfg)));
}

// ---------- Stop everything ----------
{
  put('j9/a.txt');
  const { fake, ctx, cards, setReply } = makeBob();
  setReply(() => null); // nobody answers
  const p = fake.runTool('ask_together', { steps: [copy('j9/a.txt', 'w1'), run('node', ['--version'])] }, ctx);
  await sleep(20);
  stopEverything(fake);
  const res = await p;
  check('Stop everything answers the combined card No', cards.length === 1 && /said no to all of it/.test(res.text), res.text);
}

// ---------- The window ----------
{
  const hands = fs.readFileSync(new URL('../public/hands.js', import.meta.url), 'utf8');
  const app = fs.readFileSync(new URL('../public/app.js', import.meta.url), 'utf8');
  const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  check('the chat page draws the combined card before the single ones', app.indexOf('togetherApproval(ev') > 0 && app.indexOf('togetherApproval(ev') < app.indexOf('handsApproval(ev'));
  check('the card has Allow all, Allow ticked and Deny all, with a box per step', /Allow all/.test(hands) && /Allow ticked/.test(hands) && /Deny all/.test(hands) && /class="pick"/.test(hands));
  check('the server passes the ticked steps on', /answerApproval\(id, allow, rows, items(, note)?\)/.test(server));
  const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8');
  check('Help explains the combined card', /all on one card/i.test(help));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
