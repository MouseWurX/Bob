// Tests Coding agents (src/coding-agents.js and public/coding-agents.js), OK cards on all your Bobs (src/net-cards.js),
// what a lent card shows about the brain it helps run (src/share-card.js powers), and helpers' own copies
// (src/self-work-plan.js). Pretend programs, pretend Bobs, temporary folders: nothing reads the real computer.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { fileURLToPath } from 'node:url';
import {
  KINDS, findOnPath, launchPlan, accountDir, accountEnv, readLine, endsOnQuestion, endState, handNote, passText, cleanStore,
  CodingAgents, MAX_HOPS, connectHooks, disconnectHooks, hooksConnected, hookCommand, HOOK_EVENTS, agentsRoute, claudeSettingsFile
} from '../src/coding-agents.js';
import { badgeText, agentRow } from '../public/coding-agents.js';
import { powersLine } from '../public/lend-powers.js';
import { cardForNet, NetCards, cardsOn } from '../src/net-cards.js';
import { CardLender, powersOf, cleanPowers, lendCardRoute } from '../src/share-card.js';
import { sideBySide, filesOf, openHelperCopy, closeHelperCopy, helperCopyDir, helperBranch, EDIT_TOOLS, READ_TOOLS } from '../src/self-work-plan.js';
import { cleanSharePatch, shareView } from '../src/share-brains.js';
import { HELP } from '../public/help-content.js';
import { DEFAULT_ORDER } from '../public/now-sections.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(fileURLToPath(new URL('../' + f, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tick = () => new Promise((r) => setTimeout(r, 5));
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-agents-'));
const project = path.join(dir, 'project'); fs.mkdirSync(project);
const project2 = path.join(dir, 'project2'); fs.mkdirSync(project2);

// ---- finding programs and starting them ----
{
  const have = new Set(['/usr/bin/claude', 'C:\\npm\\codex.cmd', 'C:\\bin\\gemini.exe']);
  const exists = (f) => have.has(f);
  check('PATH: found on Linux', findOnPath('claude', { env: { PATH: '/bin:/usr/bin' }, os_: 'linux', exists }) === '/usr/bin/claude');
  check('PATH: npm .cmd shim found on Windows', findOnPath('codex', { env: { Path: 'C:\\bin;C:\\npm', PATHEXT: '.EXE;.CMD' }, os_: 'win', exists }) === 'C:\\npm\\codex.cmd');
  check('PATH: .exe first where it is', findOnPath('gemini', { env: { Path: 'C:\\bin', PATHEXT: '.EXE;.CMD' }, os_: 'win', exists }) === 'C:\\bin\\gemini.exe');
  check('PATH: missing is empty', findOnPath('opencode', { env: { PATH: '/usr/bin' }, os_: 'linux', exists }) === '');
  const p = launchPlan('C:\\npm\\codex.cmd', ['exec', '--json', '-'], { os_: 'win', comspec: 'cmd.exe' });
  check('a .cmd goes through cmd.exe, verbatim', p.file === 'cmd.exe' && p.verbatim && p.args.at(-1) === '"C:\\npm\\codex.cmd exec --json -"');
  let refused = false; try { launchPlan('C:\\npm\\x.cmd', ['a & del *'], { os_: 'win' }); } catch { refused = true; }
  check('a .cmd never gets cmd\'s special characters', refused);
  check('an .exe or a Linux program starts directly', launchPlan('/usr/bin/claude', ['-p'], { os_: 'linux' }).file === '/usr/bin/claude');
  check('the task is never on the command line (stdin or a task file)', Object.values(KINDS).every((k) => k.input === 'stdin' || k.input === 'file') && !JSON.stringify(KINDS.claude.args({ edits: true, resume: 'x' })).includes('TASK'));
  check('no "skip the checks" flag anywhere', !/dangerously|bypass|yolo|--yes-always/i.test(read('src/coding-agents.js').replace(/\/\/.*$/gm, '')));
  check('May change files off: Claude Code has no edit mode and Codex reads only', !KINDS.claude.args({ edits: false }).includes('acceptEdits') && KINDS.codex.args({ edits: false }).join(' ').includes('read-only'));
  check('May change files on: each program\'s own edit mode', KINDS.claude.args({ edits: true }).includes('acceptEdits') && KINDS.codex.args({ edits: true }).includes('--full-auto') && KINDS.gemini.args({ edits: true }).includes('auto_edit'));
}

// ---- accounts ----
{
  const cfg = { dataDir: path.join(dir, 'inn') };
  const d = accountDir(cfg, 'claude', 'Sam\'s Account!');
  check('an account has its own folder per program', d.endsWith(path.join('agent-accounts', 'claude-sam-s-account')) && accountDir(cfg, 'claude', '') === '');
  check('Claude Code: CLAUDE_CONFIG_DIR', accountEnv('claude', d).CLAUDE_CONFIG_DIR === d);
  check('Codex: CODEX_HOME', accountEnv('codex', 'X').CODEX_HOME === 'X');
  check('Gemini on Windows: USERPROFILE and HOME', accountEnv('gemini', 'X', { os_: 'win' }).USERPROFILE === 'X' && accountEnv('gemini', 'X', { os_: 'win' }).HOME === 'X');
  check('OpenCode: its XDG folders', accountEnv('opencode', 'X').XDG_CONFIG_HOME === path.join('X', 'config'));
  check('no account: nothing changes', Object.keys(accountEnv('claude', '')).length === 0);
}

// ---- reading what they say ----
{
  const run = { text: '', said: '', session: '', denied: [], error: '' };
  readLine('claude-json', JSON.stringify({ type: 'system', subtype: 'init', session_id: 'sess-1' }), run);
  const shown = readLine('claude-json', JSON.stringify({ type: 'assistant', message: { content: [{ type: 'text', text: 'Looking.' }, { type: 'tool_use', name: 'Edit' }] } }), run);
  readLine('claude-json', JSON.stringify({ type: 'result', result: 'All done.', session_id: 'sess-1', permission_denials: [{ tool_name: 'Edit' }, { tool_name: 'Edit' }] }), run);
  check('Claude Code: session, words, tools, result, refusals', run.session === 'sess-1' && shown.includes('→ uses Edit') && run.said === 'All done.' && run.denied.join() === 'Edit');
  check('a refused tool means it needs you', endState(run, 0).state === 'needs-you' && /May change files/.test(endState(run, 0).why));
  const cx = { text: '', said: '', session: '', denied: [], error: '' };
  readLine('codex-json', JSON.stringify({ type: 'thread.started', thread_id: 't1' }), cx);
  readLine('codex-json', JSON.stringify({ type: 'item.completed', item: { type: 'agent_message', text: 'Fixed it.' } }), cx);
  check('Codex: thread and answer', cx.session === 't1' && cx.said === 'Fixed it.' && endState(cx, 0).state === 'done');
  check('a question at the end needs you', endsOnQuestion('I found two ways.\nShould I use the first one?') && endsOnQuestion('Want me to push it') && !endsOnQuestion('Done. Why? Because it was broken. All fixed.'));
  check('a bad exit code fails, Stop stops', endState({ said: '' }, 1).state === 'failed' && endState({}, 0, { stopped: true }).state === 'stopped');
}

// ---- a pretend program ----
function fakeSpawn(script) {
  const calls = [];
  const spawn = (file, args, opts) => {
    const c = new EventEmitter();
    c.stdout = new PassThrough(); c.stderr = new PassThrough();
    let input = '';
    c.stdin = { end: (t) => { input = String(t || ''); setTimeout(() => script(c, input, { file, args, opts }), 1); } };
    c.pid = 4242; c.exitCode = null;
    calls.push({ file, args, opts, get input() { return input; }, child: c });
    return c;
  };
  return { spawn, calls };
}
const say = (c, lines, code = 0) => { for (const l of lines) c.stdout.write(l + '\n'); c.stdout.end(); setTimeout(() => { c.exitCode = code; c.emit('close', code); }, 1); };

{
  const cfg = { dataDir: path.join(dir, 'inn-a'), port: 7777 };
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const events = [];
  let answer = (c, input) => say(c, [JSON.stringify({ type: 'result', result: `Answer to: ${input.split('\n')[0]}`, session_id: 's-9' })]);
  const { spawn, calls } = fakeSpawn((c, input, x) => answer(c, input, x));
  const ag = new CodingAgents(cfg, { spawn, find: (n) => `/fake/${n}`, broadcast: (e) => events.push(e), os_: 'linux', node: () => 'node', kill: (c) => { c.emit('close', null); } });
  let off = ''; try { ag.add({ kind: 'claude', folder: project }); ag.ask(ag.store.agents[0].id, 'x'); } catch (e) { off = e.message; }
  check('off until turned on', /off/i.test(off) && ag.store.on === false);
  ag.setSettings({ on: true });
  const a = ag.store.agents[0];
  check('added with a plain name, reads only, usual sign-in', a.name === 'claude-1' && a.edits === false && a.account === '');
  let bad = ''; try { ag.add({ kind: 'claude', folder: 'relative/folder' }); } catch (e) { bad = e.message; }
  check('a folder must be picked', /folder/i.test(bad));
  ag.ask(a.id, 'Find the bug');
  check('working right away, badge says so', a.state === 'working' && events.some((e) => e.type === 'coding-agents' && e.summary.working === 1));
  await ag.wait(a.id, 2000);
  check('done, with what it said and its session', a.state === 'done' && a.said === 'Answer to: Find the bug' && a.session === 's-9');
  check('the task went in on stdin, in the agent\'s folder, with its run settings', calls[0].input.startsWith('Find the bug') && calls[0].opts.cwd === project && calls[0].opts.env.BOB_AGENT_NAME === 'claude-1' && calls[0].opts.env.BOB_AGENT_TOKEN && calls[0].opts.env.BOB_AGENTS_URL.includes('/api/coding-agents/ask'));
  ag.ask(a.id, 'And the second one');
  await ag.wait(a.id, 2000);
  check('Claude Code carries on its own session', calls[1].args.includes('--resume') && calls[1].args.includes('s-9') && !calls[1].input.includes('Earlier in this job'));
  // Two agents, a chain, and an account
  const b = ag.add({ kind: 'gemini', folder: project2, account: 'Sam', owner: 'Sam' });
  answer = (c, input, x) => (x.opts.cwd === project2 ? say(c, ['Checked it. Looks right.']) : say(c, [JSON.stringify({ type: 'result', result: 'Wrote the fix.', session_id: 's-9' })]));
  ag.change(a.id, { then: b.id });
  ag.ask(a.id, 'Fix it');
  await ag.wait(a.id, 2000); await tick(); await ag.wait(b.id, 2000);
  const toB = calls.at(-1);
  check('When done, pass to: the next one gets the work', b.state === 'done' && toB.input.includes('claude-1') && toB.input.includes('Wrote the fix.') && b.said === 'Checked it. Looks right.');
  check('the next one runs under its own account', toB.opts.env.HOME === path.join(cfg.dataDir, 'agent-accounts', 'gemini-sam'));
  check('a follow-up for a program with no sessions carries a note of what it said', (() => { ag.change(a.id, { then: '' }); return true; })());
  ag.ask(b.id, 'Now the tests');
  await ag.wait(b.id, 2000);
  check('…and gets that note', calls.at(-1).input.startsWith('Earlier in this job you said:\nChecked it.'));
  // Pass to, by hand
  ag.pass(a.id, b.id, 'Check the edge cases');
  await ag.wait(b.id, 2000);
  check('Pass to sends the work and your note', calls.at(-1).input.includes('Your part: Check the edge cases'));
  // needs you
  answer = (c) => say(c, [JSON.stringify({ type: 'result', result: 'Two ways. Which one do you want?', session_id: 's-9' })]);
  ag.ask(a.id, 'Pick');
  await ag.wait(a.id, 2000);
  check('ended on a question: needs you, and the badge counts it', a.state === 'needs-you' && ag.summary().needsYou === 1 && badgeText(ag.summary()).includes('1 needs you'));
  // Stop
  answer = () => {}; // never ends by itself
  ag.ask(a.id, 'Long job');
  check('busy agents say so', (() => { try { ag.ask(a.id, 'again'); return false; } catch (e) { return /busy/.test(e.message); } })());
  ag.stop(a.id); await tick();
  check('Stop stops it', a.state === 'stopped');
  // Agents hand work to each other
  ag.setSettings({ handOff: true });
  let token = '';
  answer = (c, input, x) => { if (x.opts.cwd === project) token = x.opts.env.BOB_AGENT_TOKEN; else say(c, ['From gemini: done.']); };
  ag.ask(a.id, 'Ask the other');
  token = ag.runs.get(a.id).token;
  check('with hand-off on, the task tells it who else is here and how to ask', calls.at(-1).input.includes(b.name) && calls.at(-1).input.includes('agent-ask.mjs'));
  const r = await ag.askFromAgent({ token, to: b.name, text: 'Check this' });
  check('one agent asks another and gets its answer', r.status === 200 && r.body.said === 'From gemini: done.');
  check('a wrong token is refused', (await ag.askFromAgent({ token: 'nope', to: b.name, text: 'x' })).status === 403);
  ag.runs.get(a.id).hops = MAX_HOPS;
  check(`no more than ${MAX_HOPS} hand-ons in a row`, (await ag.askFromAgent({ token, to: b.name, text: 'x' })).status === 429);
  ag.stop(a.id); await tick();
  // Saved, and a run can't outlive Bob
  const raw = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'coding-agents.json'), 'utf8'));
  raw.agents[0].state = 'working';
  check('after a restart a run that was going says it stopped', cleanStore(raw).agents[0].state === 'stopped' && /closed/.test(cleanStore(raw).agents[0].why));
  check('turning it off stops every run', (() => { answer = () => {}; ag.ask(b.id, 'x'); ag.setSettings({ on: false }); return ag.runs.size === 0 || [...ag.runs.values()].every((x) => x.stopped); })());
  await tick();
  // The row on screen
  const row = agentRow(ag.view().agents.find((x) => x.id === b.id), ag.view().agents);
  check('a row shows whose account, the folder and Pass to', row.includes('Sam') && row.includes('account') && row.includes(project2) && row.includes('Pass to'));
  check('the badge is empty when off', badgeText({ on: false, working: 3 }) === '');
  // Claude Code status
  check('hooks are refused until connected', !ag.hookOk('x'));
  ag.store.claudeStatus = true; const key = ag.newHookKey();
  check('the hook key works, only it', ag.hookOk(key) && !ag.hookOk(key + 'x'));
  ag.hook({ session_id: 'out-1', hook_event_name: 'UserPromptSubmit', cwd: '/home/me/site' });
  check('an outside Claude Code chat shows as working', ag.view().outside[0]?.state === 'working' && ag.view().outside[0].name === 'Claude Code in site');
  ag.hook({ session_id: 'out-1', hook_event_name: 'Notification', message: 'Claude needs your permission to use Bash' });
  check('…needs you, with its words', ag.view().outside[0].state === 'needs-you' && /permission/.test(ag.view().outside[0].why));
  ag.hook({ session_id: 'out-1', hook_event_name: 'SessionEnd' });
  check('…and goes when it ends', ag.view().outside.length === 0);
}

// ---- Claude Code's settings file ----
{
  const f = path.join(dir, 'claude', 'settings.json');
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, JSON.stringify({ model: 'x', hooks: { Stop: [{ hooks: [{ type: 'command', command: 'echo mine' }] }] } }));
  const r = connectHooks(f, { port: 7777, key: 'bobhook_k' });
  const d = JSON.parse(fs.readFileSync(f, 'utf8'));
  check('connect: a backup first, their own hooks kept, ours added', fs.existsSync(r.backup) && d.model === 'x' && d.hooks.Stop.length === 2 && hooksConnected(f));
  connectHooks(f, { port: 7777, key: 'bobhook_k2' });
  check('connecting again replaces ours, never doubles it', JSON.parse(fs.readFileSync(f, 'utf8')).hooks.Stop.length === 2);
  check('the hook never waits long and asks Bob for nothing back', hookCommand(7777, 'k').includes('-m 2') && HOOK_EVENTS.includes('Notification'));
  disconnectHooks(f);
  const e = JSON.parse(fs.readFileSync(f, 'utf8'));
  check('disconnect takes only ours out', !hooksConnected(f) && e.hooks.Stop.length === 1 && !e.hooks.Notification);
  check('settings file follows CLAUDE_CONFIG_DIR', claudeSettingsFile({ env: { CLAUDE_CONFIG_DIR: '/x' }, platform: 'linux' }) === '/x/settings.json');
}

// ---- routes ----
{
  const cfg = { dataDir: path.join(dir, 'inn-r'), port: 7777 };
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  const ag = new CodingAgents(cfg, { spawn: fakeSpawn(() => {}).spawn, find: () => '', os_: 'linux' });
  const out = [];
  const send = (res, code, b) => out.push({ code, b });
  const body = async () => ({ on: true });
  await agentsRoute({ req: { method: 'POST', headers: {} }, res: {}, p: '/api/coding-agents', isLocal: false, agents: ag, body, send, hooksFile: path.join(dir, 'none.json') });
  check('settings only on this replicant matrix', out.at(-1).code === 403 && !ag.store.on);
  await agentsRoute({ req: { method: 'POST', headers: {} }, res: {}, p: '/api/coding-agents', isLocal: true, agents: ag, body, send, hooksFile: path.join(dir, 'none.json') });
  check('turned on here', out.at(-1).code === 200 && ag.store.on);
  const res = { code: 0, writeHead(c) { this.code = c; }, end() {} };
  await agentsRoute({ req: { method: 'POST', headers: { 'x-bob-hook': 'wrong' } }, res, p: '/api/coding-agents/hook', isLocal: true, agents: ag, body, send });
  check('a hook with the wrong key is refused', res.code === 403);
  const a = ag.add({ kind: 'qwen', folder: project });
  await agentsRoute({ req: { method: 'POST', headers: {} }, res: {}, p: `/api/coding-agents/${a.id}/ask`, isLocal: true, agents: ag, body: async () => ({ text: 'hi' }), send });
  check('a program that isn\'t there says so plainly', out.at(-1).code === 409 && /isn't on this computer/.test(out.at(-1).b.error));
}

// ---- OK cards on all your Bobs ----
{
  const card = cardForNet({ type: 'approval', id: 'c1', text: 'Run npm test', command: 'npm test', cwd: '/x', allowAll: true, ask: undefined });
  check('a card travels as plain words', card.id === 'c1' && card.command === 'npm test' && card.allowAll);
  check('a card from another Bob, or a pairing card, never travels on', cardForNet({ type: 'approval', id: 'x', net: { from: 'Go' } }) === null && cardForNet({ type: 'approval', id: 'x', pairing: true }) === null);
  check('off unless switched on', !cardsOn({}) && cardsOn({ share: { cardsEverywhere: true } }));
  const cfg = { share: { cardsEverywhere: true } };
  const calls = [];
  const bobs = [{ name: 'Go', address: '100.64.0.2:7777' }];
  const mkBrain = () => {
    const b = { cfg, events: [], waitingCards: new Map(), lenders: { bobs: () => bobs, call: async (bob, p, o) => { calls.push({ bob: bob.name, p, o }); return { ok: true, status: 200, json: async () => ({ cards: [] }) }; } } };
    b.broadcast = (ev) => { b.events.push(ev); if (ev.type === 'approval') b.waitingCards.set(ev.id, ev); if (ev.type === 'approval-result') b.waitingCards.delete(ev.id); };
    return b;
  };
  const pc = mkBrain();
  const n = new NetCards(pc, { name: () => 'PC' });
  n.local({ type: 'approval', id: 'c1', text: 'Delete 3 files' });
  check('a new card goes to every Bob on the list', calls.length === 1 && calls[0].p === '/api/bob-net/cards' && calls[0].o.body.action === 'show' && calls[0].o.body.card.text === 'Delete 3 files');
  n.local({ type: 'approval-result', id: 'c1', allowed: true });
  check('…and comes down there once answered', calls.at(-1).o.body.action === 'clear' && calls.at(-1).o.body.id === 'c1');
  // the other side
  const go = mkBrain();
  const g = new NetCards(go, { name: () => 'Go' });
  const pcBobs = [{ name: 'PC', address: '100.64.0.1:7777', home: '172.16.1.5:7777' }];
  go.lenders.bobs = () => pcBobs;
  check('a stranger can\'t show a card', g.receive({ action: 'show', from: 'Evil', card: { id: 'z', text: 'x' } }, '172.20.9.9').status === 403);
  check('one of my Bobs can (by his home address)', g.receive({ action: 'show', from: 'PC', card: { id: 'c2', text: 'Send the report' } }, '::ffff:172.16.1.5').status === 200);
  const shown = go.events.at(-1);
  check('it shows here, marked with who it\'s from', shown.type === 'approval' && shown.net.from === 'PC' && shown.sessionId.startsWith('net:') && go.waitingCards.has('c2') && g.counts()['100.64.0.1:7777'] === 1);
  check('…and is never sent on again from here', (() => { const before = calls.length; g.local(shown); return calls.length === before; })());
  const ans = await g.answer('c2', { allow: true });
  check('answering here sends it back to the Bob that asked, then takes it down', ans === true && calls.at(-1).bob === 'PC' && calls.at(-1).p === '/api/approve' && calls.at(-1).o.body.allow === true && !g.shown.has('c2') && go.events.at(-1).type === 'approval-result');
  check('a card that isn\'t from another Bob isn\'t answered here', (await g.answer('nope', {})) === null);
  g.receive({ action: 'show', from: 'PC', card: { id: 'c3', text: 'x' } }, '100.64.0.1');
  await g.sync(); // the PC says nothing waits any more
  check('the minute-by-minute check takes down a card answered while a message was lost', !g.shown.has('c3'));
  check('the phone app shows every card marked everywhere', read('public/phone/phone.js').includes('ev.everywhere === true') && read('public/phone/phone.js') === read('android/app/src/main/assets/www/phone.js'));
  check('a card answered anywhere is taken down on the desktop page too', read('public/app.js').includes('data-card="${CSS.escape(String(ev.id))}"'));
  const sp = cleanSharePatch({ share: {} }, { cardsEverywhere: true });
  check('the Bob-Net switch saves, off to start with', sp.share.cardsEverywhere === true && shareView({ share: {} }).cardsEverywhere === false);
}

// ---- a lent card shows what the brain it helps run has on ----
{
  check('powers from Hands settings', JSON.stringify(powersOf({ enabled: true, free: true, files: { on: true }, apps: { on: false }, browser: { on: true } })) === JSON.stringify({ hands: true, autonomy: true, screen: true }));
  check('Hands off or stopped: nothing to show', powersOf({ enabled: false, free: true }) === null && powersOf({ enabled: true, held: true, files: { on: true } }) === null && cleanPowers({}) === null);
  const seen = [];
  const lender = new CardLender({ share: {} }, { log: () => {} });
  lender.onPowers = (p, to) => seen.push({ p, to });
  lender.child = { exitCode: null, kill() {} }; lender.from = 'PC';
  lender.setPowers({ hands: true, autonomy: true });
  check('the lending Bob is told at once', seen.length === 1 && seen[0].p.autonomy && seen[0].to === 'PC' && lender.view().powers.hands);
  lender.setPowers({ hands: true, autonomy: true });
  check('…once, not every 5 seconds', seen.length === 1);
  lendCardRoute(lender, {}, { action: 'keep', powers: null });
  check('…and cleared the moment they\'re off', seen.length === 2 && seen[1].p === null);
  lender.setPowers({ screen: true }); lender.close();
  check('…or the lend ends', seen.at(-1).p === null && !lender.view().powers);
  check('the strip says it in plain words', /helping run PC's brain, and that brain has Hands and Autonomy on over there, so it acts without asking first/.test(powersLine({ hands: true, autonomy: true }, 'PC')) && powersLine(null) === '');
  check('the asking Bob sends them with every keep', read('src/share-card.js').includes("body: { action: 'keep', powers: this.powers() }"));
}

// ---- helpers' own copies ----
{
  const tasks = [{ n: 1, kind: 'edit', files: 'src/a.js', state: 'to do' }, { n: 2, kind: 'edit', files: 'src/b.js, src/c.js', state: 'to do' }, { n: 3, kind: 'edit', files: 'src/a.js', state: 'to do' }, { n: 4, kind: 'check', state: 'to do' }];
  check('edit tasks side by side only while their files don\'t meet', sideBySide(tasks, 4).map((t) => t.n).join() === '1,2');
  check('a task with no files named stays on its own', sideBySide([{ kind: 'edit', files: '' }, { kind: 'edit', files: 'x' }], 4).length === 0 && filesOf({ files: './src/x.js; src\\y.js' }).join() === 'src/x.js,src/y.js');
  const cfg = { innDir: path.join(dir, 'inn-h') };
  check('each helper\'s copy is his own, under the code copies', helperCopyDir(cfg, { id: 'bob' }, 'Legion Go').endsWith(path.join('own-code', 'helpers', 'bob-legion-go')) && helperBranch('Legion Go', 3) === 'bob-helper/legion-go-task-3');
  check('helpers editing get the edit tools, research helpers only reading ones', EDIT_TOOLS.includes('edit_file') && !READ_TOOLS.includes('edit_file') && !EDIT_TOOLS.includes('run_command'));
  const ran = [];
  const run = async (git, args) => { ran.push(args.join(' ')); return { code: /merge --no-ff/.test(args.join(' ')) && ran.some((x) => x.includes('CLASH')) ? 1 : 0, out: '' }; };
  await openHelperCopy('git', run, { dir: '/c', copy: '/c-h', branch: 'bob-helper/go-task-2' });
  check('his copy is a worktree on its own branch', ran.some((x) => x === '-C /c worktree add -B bob-helper/go-task-2 /c-h HEAD'));
  const ok = await closeHelperCopy('git', run, { dir: '/c', copy: '/c-h', branch: 'bob-helper/go-task-2', message: 'Task 2' });
  check('his work is committed and merged back, his copy removed', ok.merged && ran.some((x) => x.startsWith('-C /c-h commit')) && ran.some((x) => x.startsWith('-C /c merge --no-ff')) && ran.some((x) => x.includes('worktree remove --force /c-h')));
  ran.push('CLASH');
  const no = await closeHelperCopy('git', run, { dir: '/c', copy: '/c-h', branch: 'b', message: 'x' });
  check('a clash is undone and the task comes back here', !no.merged && /clash/.test(no.why) && ran.some((x) => x === '-C /c merge --abort'));
}

// ---- nothing in Bob's brain; Help, glossary, FAQ, Settings ----
{
  const brainFiles = ['src/prompts.js', 'src/brain-prompting.js', 'src/system-notes.js'].filter((f) => fs.existsSync(fileURLToPath(new URL('../' + f, import.meta.url))));
  check('no start-up words for Bob\'s brain', brainFiles.every((f) => !/coding-agents|net-cards|cardsEverywhere|lend-powers/.test(read(f))));
  const ids = new Set(HELP.map((h) => h.id));
  check('Help pages', ['coding-agents', 'faq-coding-agents', 'faq-two-accounts', 'faq-cards-everywhere'].every((id) => ids.has(id)));
  const gl = HELP.find((h) => h.id === 'glossary')?.html || '';
  check('glossary entries', /Coding agent/.test(gl) && /Agent account/.test(gl));
  check('Now running has the section, folded to start', DEFAULT_ORDER.includes('agents') && read('public/layout.js').includes("folded.add('agents')"));
  check('Settings shows the box and the Bob-Net switch', read('public/cellar-pages.js').includes('agentsSettingsHtml()') && read('public/share-brains.js').includes('data-share-cards'));
}

fs.rmSync(dir, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
