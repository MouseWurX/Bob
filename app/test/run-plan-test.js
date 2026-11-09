// Plan card (1.5.78): with "Show Bob's plan before big jobs" on (off unless turned on), a big job's steps go on one
// card before it starts, with the OKs those steps need ticked on the same card. Go ahead / Change something / Not now.
// A big job started without a plan waits, Bob is asked for one, and if he still doesn't, the system makes the card.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { handsTools } from '../src/hands.js';
import { askTogetherTool } from '../src/together.js';
import { showPlanTool, planGate, planOn, planPrompt } from '../src/plan.js';
import { Brain } from '../src/brain.js';
import { mergeSettings } from '../src/config.js';
import { settingsNow } from '../src/self-help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-plan-'));
const agentDir = path.join(tmp, 'Agent');
const innDir = path.join(agentDir, 'inn');
const dataDir = path.join(innDir, 'bob');
const work = path.join(tmp, 'Downloads');
for (const d of [dataDir, work]) fs.mkdirSync(d, { recursive: true });
const base = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readOnlyRoots: [dataDir], ownReadOnlyRoots: [dataDir], readRoots: [innDir, work], recycleBin: false, userName: 'Sam',
  hands: { enabled: true, files: { on: true }, run: { on: true }, folders: [work], timeoutMin: 1 } };
const put = (rel, body = 'x') => { const f = path.join(work, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };

function makeBob({ plan = true, free = false } = {}) {
  const logs = [], events = [];
  const fake = Object.create(Brain.prototype);
  const c = { ...base, planFirst: plan, hands: { ...base.hands, ...(free ? { free: true } : {}) } };
  Object.assign(fake, { cfg: c, tools: {}, approvals: new Map(), handApprovals: new Set(), state: { state: 'idle' }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`), broadcast: (e) => events.push(e), saveHands(next) { c.hands = next; } });
  Object.assign(fake.tools, handsTools(fake));
  fake.tools.ask_together = askTogetherTool(fake);
  fake.tools.show_plan = showPlanTool(fake);
  const cards = [];
  let reply = () => ({ allow: true });
  const ctx = { emit: (e) => { events.push(e); if (e.type === 'approval') { cards.push(e); const r = reply(e); if (r) setTimeout(() => fake.answerApproval(e.id, r.allow, r.rows, r.items, r.note), 5); } }, signal: new AbortController().signal, allowAll: new Set() };
  return { fake, ctx, cards, logs, events, setReply: (f) => { reply = f; } };
}
const copy = (name, to) => ({ tool: 'file_hands', args: { action: 'copy', paths: [path.join(work, name)], to: path.join(work, to) } });
const call = (s) => ({ function: { name: s.tool, arguments: JSON.stringify(s.args) } });

// ---------- The setting ----------
{
  check('off unless turned on', !planOn({}) && !planOn({ planFirst: 'yes' }) && planOn({ planFirst: true }));
  check('only true turns it on when saved', mergeSettings({}, { planFirst: 'true' }).planFirst === false && mergeSettings({}, { planFirst: true }).planFirst === true);
  check('nothing added to his instructions while off', planPrompt({}) === '');
  check('his instructions say when to show a plan while on', /call show_plan first/.test(planPrompt({ planFirst: true })) && /Don't use it for questions, chat or one quick thing/.test(planPrompt({ planFirst: true })));
  const { fake: off } = makeBob({ plan: false });
  const { fake: on } = makeBob();
  check('show_plan is not offered while off, and is while on', !off.usable('show_plan') && on.usable('show_plan'));
  check('Bob can tell someone whether it is on', settingsNow({ planFirst: true }).includes("Show Bob's plan before big jobs: on") && settingsNow({}).includes("Show Bob's plan before big jobs: off"));
  const cellar = read('public/cellar.js'), server = read('src/server.js');
  check('the switch is on the everyday Settings page, off unless turned on', /sswitch\('planFirst', settings\.planFirst === true, 'Show Bob\\'s plan before big jobs', keep\('Off unless you turn it on/.test(cellar));
  check('the closed panel shows it', /Plans before big jobs: \$\{onoff\(settings\.planFirst === true\)\}/.test(cellar));
  check('the server saves and shows it', /typeof b\.planFirst === 'boolean'/.test(server) && /planFirst: cfg\.planFirst === true/.test(server));
  check('the server passes the change the person typed', /answerApproval\(id, allow, rows, items, note\)/.test(server));
}

// ---------- Go ahead: one card with the plan and its OKs ----------
{
  put('a/one.txt'); put('a/two.txt');
  const { fake, ctx, cards, events } = makeBob();
  const steps = [{ say: 'Look at what is in the folder' }, { say: 'Copy one.txt to Out', ...copy('a/one.txt', 'out1') }, { say: 'Copy two.txt to Out', ...copy('a/two.txt', 'out2') }, { say: 'Tell you what I did' }];
  const res = await fake.runTool('show_plan', { goal: 'Back up two notes', time: 'about a minute', steps }, ctx);
  const c = cards[0];
  check('one card', cards.length === 1, String(cards.length));
  check('it has every step in order, with the goal and time', c.planCard?.steps.length === 4 && c.planCard.steps.map((s) => s.n).join() === '1,2,3,4' && c.text === "Bob's plan: Back up two notes" && c.planCard.time === 'about a minute', JSON.stringify(c));
  check('the steps that need an OK are on the same card, numbered as their step', c.together?.length === 2 && c.together.map((i) => i.n).join() === '2,3' && c.planCard.steps.filter((s) => s.ok).length === 2);
  check('the card shows each OK step\'s real files', Array.isArray(c.together[0].plan));
  check('Stop everything can answer it (it is a Hands card), and there is no "rest of this job" button', c.hand === true && c.allowAll === false);
  check('Bob is told to go ahead', /said go ahead/.test(res.text), res.text);
  await fake.runTool('file_hands', steps[1].args, ctx);
  await fake.runTool('file_hands', steps[2].args, ctx);
  check('the OK steps then run without another card', cards.length === 1 && fs.existsSync(path.join(work, 'out1', 'one.txt')) && fs.existsSync(path.join(work, 'out2', 'two.txt')));
  check('the chat says each was allowed on the card above', events.filter((e) => e.type === 'allowed-earlier').length === 2);
  const g = await planGate(fake, [call(copy('a/one.txt', 'x1')), call(copy('a/one.txt', 'x2')), call(copy('a/one.txt', 'x3'))], ctx);
  check('once a plan is shown, the safety net leaves the job alone', g === null);
}

// ---------- Go ahead with some OKs unticked ----------
{
  put('b/one.txt'); put('b/two.txt');
  const { fake, ctx, cards, setReply } = makeBob();
  setReply(() => ({ allow: true, items: [{ n: 1 }] }));
  const steps = [{ say: 'Copy one', ...copy('b/one.txt', 'p1') }, { say: 'Copy two', ...copy('b/two.txt', 'p2') }];
  const res = await fake.runTool('show_plan', { steps }, ctx);
  check('Bob hears which step was unticked, and to skip it', /unticked step 2/.test(res.text), res.text);
  const r = await fake.runTool('file_hands', steps[1].args, ctx);
  check('the unticked step isn\'t done and doesn\'t ask again', /said no to this on the card/.test(r.text) && cards.length === 1 && !fs.existsSync(path.join(work, 'p2')));
}

// ---------- Change something ----------
{
  put('c/one.txt');
  const { fake, ctx, cards, events, logs, setReply } = makeBob();
  setReply(() => ({ allow: false, note: 'Use my Backups folder instead' }));
  const steps = [{ say: 'Copy one', ...copy('c/one.txt', 'q1') }, { say: 'Zip it' }, { say: 'Done' }];
  const res = await fake.runTool('show_plan', { steps }, ctx);
  check('Bob gets the change in the person\'s words, and is told to plan again', /Use my Backups folder instead/.test(res.text) && /call show_plan again/.test(res.text), res.text);
  check('nothing was allowed on that card', !ctx.preOk?.size);
  check('the card closed as not allowed', events.some((e) => e.type === 'approval-result' && e.allowed === false));
  check('the change is noted in the logbook', logs.some((l) => /asked for a change: Use my Backups folder instead/.test(l)));
}

// ---------- Not now ----------
{
  put('d/one.txt');
  const { fake, ctx, setReply } = makeBob();
  setReply(() => ({ allow: false }));
  const res = await fake.runTool('show_plan', { steps: [{ say: 'Copy one', ...copy('d/one.txt', 'r1') }, { say: 'b' }, { say: 'c' }] }, ctx);
  check('Not now: Bob is told not to start or try another way', /said not now/.test(res.text) && /Don't start this job or try another way/.test(res.text));
  const g = await planGate(fake, [call(copy('d/one.txt', 'r1')), call(copy('d/one.txt', 'r2')), call(copy('d/one.txt', 'r3'))], ctx);
  check('and if he starts it anyway, it is held', /said not now/.test(g?.hold || ''), JSON.stringify(g));
}

// ---------- The safety net ----------
{
  put('e/one.txt');
  const { fake, ctx, cards, logs } = makeBob();
  check('one small thing goes straight through', await planGate(fake, [call(copy('e/one.txt', 's1'))], ctx) === null);
  check('so does a reply with no tools that change things', await planGate(fake, [{ function: { name: 'read_file', arguments: '{}' } }], ctx) === null);
  const big = [call(copy('e/one.txt', 's2')), call(copy('e/one.txt', 's3'))];
  const g1 = await planGate(fake, big, ctx);
  check('the third step that changes something this turn makes it a big job: held, and Bob is asked for his plan', /Call show_plan first/.test(g1?.hold || '') && cards.length === 0, JSON.stringify(g1));
  check('the logbook says why', logs.some((l) => /started a big job without a plan/.test(l)));
  const g2 = await planGate(fake, big, ctx);
  check('asked once and still no plan: the system shows the steps he was about to do', g2 === null && cards.length === 1 && cards[0].planCard?.fromSystem === true && cards[0].planCard.steps.length === 2 && cards[0].together?.length === 2, JSON.stringify(cards[0]));
  await fake.runTool('file_hands', JSON.parse(big[0].function.arguments), ctx);
  check('allowed there, the steps run without another card', cards.length === 1 && fs.existsSync(path.join(work, 's2', 'one.txt')));
  const { fake: f2, ctx: c2 } = makeBob();
  check('a show_plan call itself never gets held', await planGate(f2, [{ function: { name: 'show_plan', arguments: '{}' } }, ...big, ...big], c2) === null);
  const { fake: f3, ctx: c3 } = makeBob();
  f3.tools.make_video = { schema: { type: 'function', function: { name: 'make_video' } }, run: async () => 'ok' };
  f3.usable = (n) => Boolean(f3.tools[n]);
  check('a video clip on its own counts as big', /Call show_plan first/.test((await planGate(f3, [{ function: { name: 'make_video', arguments: '{}' } }], c3))?.hold || ''));
  const { fake: f5, ctx: c5 } = makeBob();
  f5.tools.make_video = f3.tools.make_video; f5.usable = f3.usable; c5.job = { guest: { from: 'Go', need: 'video' } };
  check('a job from another Bob is never held for a plan (1.5.133 lost song)', await planGate(f5, [{ function: { name: 'make_video', arguments: '{}' } }], c5) === null);
  const { fake: f4, ctx: c4 } = makeBob({ plan: false });
  check('with the setting off, nothing is ever held', await planGate(f4, [...big, ...big], c4) === null);
}

// ---------- With "Let Bob work without asking" on ----------
{
  put('f/one.txt');
  const { fake, ctx, cards } = makeBob({ free: true });
  await fake.runTool('show_plan', { steps: [{ say: 'Copy one', ...copy('f/one.txt', 't1') }, { say: 'b' }] }, ctx);
  check('the plan still shows (it was asked for), without OK boxes', cards.length === 1 && cards[0].planCard && !cards[0].together);
}

// ---------- Errors ----------
{
  const { fake, ctx, cards } = makeBob();
  const r = await fake.runTool('show_plan', { steps: [] }, ctx);
  check('no steps: Bob is told how to list them, no card', /^Error: no steps/.test(r.text) && !cards.length);
  const { fake: off, ctx: c2 } = makeBob({ plan: false });
  const r2 = await off.runTool('show_plan', { steps: [{ say: 'x' }] }, c2);
  check('with the setting off, show_plan can\'t be used', !/said go ahead/.test(r2.text) && !c2.planShown, r2.text);
}

// ---------- The window ----------
{
  const card = read('public/plan-card.js'), app = read('public/app.js'), hands = read('public/hands.js');
  check('the chat shows the plan card before any other card, and sends the typed change', /planApproval\(ev, \{ add, answer: \(allow, items, note\) => post\('\/api\/approve', \{ id: ev\.id, allow, items, note \}\) \}\)/.test(app) && app.indexOf('planApproval(ev') < app.indexOf('togetherApproval(ev'));
  check('its buttons are verbs, as the style guide asks', ['Go ahead', 'Change something', 'Not now (Bob drops this job)', 'Send to Bob', 'Back'].every((b) => card.includes(`>${b}<`)));
  check('the card with all of a job\'s OKs leaves plan cards alone', /if \(!Array\.isArray\(ev\.together\) \|\| ev\.planCard\) return null;/.test(hands));
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
