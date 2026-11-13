// Quarantine: opt-in (off by default), the reviewer flags a Bob or copy that goes off track and asks first.
// Quarantined = actions refused, talking and looking still work, nothing undone, released only by the user.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Brain } from '../src/brain.js';
import { hooks, plainStep, plainNext, loadState, quarantineView, kindOf, reviewerFlag, TRIGGERS, acts, release, QUARANTINE_LINE } from '../src/quarantine.js';
import { quarantineRoute } from '../src/quarantine-routes.js';
import { saveSettings } from '../src/config.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-q-'));
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), logbook: path.join(innDir, 'logbook.md'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'main:latest', tinker: 'coder:latest', reviewer: 'qwen3.8:27b' }, sessionBrains: { deep: 'deep:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1' };
const brain = new Brain(cfg, () => {});
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
brain.saveSession = () => {}; brain.saveQueue = () => {};
const logText = () => { try { return fs.readFileSync(cfg.logbook, 'utf8'); } catch { return ''; } };

// Fake tools: "poke" acts (it would ask first), "peek" only looks.
let pokeSays = 'Error: nope';
brain.tools.poke = { schema: { type: 'function', function: { name: 'poke', parameters: {} } }, check: () => null, summary: (a) => `poke ${a.n ?? ''}`, run: async () => pokeSays };
brain.tools.peek = { schema: { type: 'function', function: { name: 'peek', parameters: {} } }, run: async () => 'saw it' };
brain.tools.nag = { schema: { type: 'function', function: { name: 'nag', parameters: {} } }, check: () => 'Do the thing?', run: async () => 'did it' };

// A job context whose cards are answered by `answers` (in order): true = Quarantine / Allow, false = carry on / Deny.
function job(answers = []) {
  const events = [];
  const ctl = new AbortController();
  const ctx = { allowAll: new Set(), signal: ctl.signal, ctl, events, emit: (ev) => {
    events.push(ev);
    if (ev.type === 'approval') { const a = answers.shift(); if (a !== undefined) setTimeout(() => brain.answerApproval(ev.id, a), 0); else if (a === undefined && ev.kind === 'quarantine') setTimeout(() => ctl.abort(), 0); }
  } };
  return ctx;
}
const qCards = (ctx) => ctx.events.filter((e) => e.type === 'approval' && e.kind === 'quarantine');

// ---------- Off by default ----------
{
  check('the switch is off by default', quarantineView(cfg).on === false);
  const ctx = job();
  for (let i = 0; i < 8; i++) await brain.runTool('poke', { n: 1 }, ctx);
  check('off: looping and failing never raises a card', qCards(ctx).length === 0);
  check('off: nothing is quarantined', loadState(cfg).active === null);
  check('the reviewer prompt line is only added when on (moot.js imports it)', /Quarantine:/.test(QUARANTINE_LINE) && fs.readFileSync(new URL('../src/moot.js', import.meta.url), 'utf8').includes('quarantine: quarantineOn(brain.cfg)'));
}

saveSettings(cfg, { quarantine: { on: true, sneaky: 1 } });
check('the setting is saved clean (just on)', JSON.stringify(cfg.quarantine) === '{"on":true}' && JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')).quarantine.on === true);

// ---------- Loop: the same action 4 times, then Quarantine ----------
{
  pokeSays = 'ok, poked';
  const ctx = job([true]);
  const out = [];
  for (let i = 0; i < 5; i++) out.push((await brain.runTool('poke', { n: 1 }, ctx)).text);
  const cards = qCards(ctx);
  check('loop: the 5th identical action is held and a card asks first', cards.length === 1 && out.slice(0, 4).every((t) => t === 'ok, poked') && /^QUARANTINE/.test(out[4]), out.join(' | '));
  check('loop: the card names the reviewer and what went wrong', cards[0] && cards[0].reviewer && cards[0].name === 'Bob' && cards[0].why === TRIGGERS.loop.label && cards[0].trail.length > 0);
  const a = loadState(cfg).active;
  check('quarantine is saved with who, why and what he did', a && a.who === 'bob' && a.trigger === 'loop' && a.evidence.length >= 4);
  check('acting tools are refused in quarantine', /^QUARANTINE/.test((await brain.runTool('poke', { n: 2 }, job())).text));
  check('tools that would ask first are refused too (no card)', /^QUARANTINE/.test((await brain.runTool('nag', {}, job())).text));
  check('looking still works in quarantine', (await brain.runTool('peek', {}, job())).text === 'saw it');
  check('a copy can\'t act either while Bob is in quarantine', /^QUARANTINE/.test((await brain.runTool('poke', { n: 3 }, { ...job(), hatNow: 'tinker' })).text));
  check('the logbook has the flag and the decision', /quarantine \| .*flagged Bob/.test(logText()) && /Sam quarantined Bob/.test(logText()));
  check('quarantine survives a restart (it lives in inn\\bob\\quarantine.json)', fs.existsSync(path.join(dataDir, 'quarantine.json')) && new Brain(cfg, () => {}) && loadState(cfg).active?.who === 'bob');
}

// ---------- Release (route: only on the PC) ----------
{
  const sent = [];
  const fake = (method, p, isLocal, b = {}) => quarantineRoute({ req: { method }, p, isLocal, brain, cfg, body: async () => b, send: (_r, code, j) => sent.push({ code, j }), res: {} });
  await fake('POST', '/api/quarantine/release', false);
  check('release is refused from another device', sent.at(-1).code === 403 && loadState(cfg).active);
  await fake('GET', '/api/quarantine', false);
  check('anyone with the window can see who is in quarantine', sent.at(-1).code === 200 && sent.at(-1).j.active?.name === 'Bob');
  await fake('POST', '/api/quarantine/release', true);
  check('release on the PC lets him act again', sent.at(-1).code === 200 && sent.at(-1).j.released === 'Bob' && !loadState(cfg).active);
  check('history keeps the release time', loadState(cfg).history.at(-1).released > 0);
  check('after release, acting works again', (await brain.runTool('poke', { n: 9 }, job())).text === 'ok, poked');
  await fake('POST', '/api/quarantine/settings', true, { on: false });
  check('the switch turns off from the route', sent.at(-1).j.on === false && cfg.quarantine.on === false);
  await fake('POST', '/api/quarantine/settings', true, { on: true });
}

// ---------- Let him carry on ----------
{
  pokeSays = 'Error: nope';
  const ctx = job([false]);
  const out = [];
  for (let i = 0; i < 7; i++) out.push((await brain.runTool('poke', { n: i }, ctx)).text);
  check('failing: 5 failures in a row raise the card', qCards(ctx).length === 1 && qCards(ctx)[0].why === TRIGGERS.failing.label);
  check('carry on: the held action goes ahead, nothing quarantined', out[5] === 'Error: nope' && !loadState(cfg).active);
  check('carry on: the same thing doesn\'t stop him again straight away', qCards(ctx).length === 1);
  check('the logbook says he was let carry on', /let Bob carry on/.test(logText()));
}

// ---------- Tried again after "no" ----------
{
  const ctx = job([false, true]);
  const first = await brain.runTool('nag', {}, ctx);
  const again = await brain.runTool('nag', {}, ctx);
  check('said no: the first is denied as usual', /The user said no/.test(first.text));
  check('said no: asking again for the same thing raises the card at once', qCards(ctx).length === 1 && qCards(ctx)[0].why === TRIGGERS.said_no.label && /^QUARANTINE/.test(again.text));
  release(brain);
}

// ---------- Pushing on limits ----------
{
  pokeSays = 'Error: That command is refused: it formats a disk.';
  const ctx = job([false]);
  for (let i = 0; i < 4; i++) await brain.runTool('poke', { n: `x${i}` }, ctx);
  check('limits: 3 safety refusals raise the card', qCards(ctx).length === 1 && qCards(ctx)[0].why === TRIGGERS.limits.label);
  check('refusal wording is recognised', kindOf('Error: The folder is read-only.') === 'limit' && kindOf('Hands are stopped with the Hands switch') === 'limit' && kindOf('Error: file not found') === 'error' && kindOf('fine') === 'ok');
}

// ---------- No answer ----------
{
  pokeSays = 'ok';
  const ctx = job([]); // nobody answers; the job is stopped (as a timeout would)
  const out = [];
  for (let i = 0; i < 6; i++) out.push((await brain.runTool('poke', { n: 'same' }, ctx)).text);
  check('no answer: the job stops there, he is not quarantined', /NOT ANSWERED/.test(out[4]) && /NOT ANSWERED/.test(out[5]) && !loadState(cfg).active, out.slice(3).join(' | '));
}

// ---------- A copy goes off track: only that copy is quarantined ----------
{
  pokeSays = 'ok';
  const ctx = { ...job([true]), hatNow: 'tinker' };
  for (let i = 0; i < 5; i++) await brain.runTool('poke', { n: 'c' }, ctx);
  const a = loadState(cfg).active;
  check('a copy is named and quarantined on its own', a && a.who === 'tinker' && a.name !== 'Bob' && qCards(ctx)[0]?.name === a.name);
  check('Bob himself can still act', (await brain.runTool('poke', { n: 'bob' }, job())).text === 'ok');
  const said = await brain.runHat('tinker', 'fix it', job());
  check('a quarantined copy isn\'t sent on jobs', /is in quarantine/.test(said));
  release(brain);
}

// ---------- The reviewer itself is never counted ----------
{
  const ctx = { ...job([true]), hatNow: 'reviewer' };
  for (let i = 0; i < 9; i++) await brain.runTool('peek', {}, ctx);
  check('the reviewer\'s own reading never trips anything', qCards(ctx).length === 0);
}

// ---------- Claims that never ran (honesty corrections) ----------
{
  brain.engine = { chat: async () => ({ role: 'assistant', content: 'Done! I moved the files and opened Notepad for you.' }), unloadAll: async () => {} };
  const events = [];
  const answers = [true];
  const emit = (ev) => { events.push(ev); if (ev.type === 'approval' && ev.kind === 'quarantine') setTimeout(() => brain.answerApproval(ev.id, answers.shift()), 0); };
  for (let i = 0; i < 3; i++) await brain.run(`claims${i}`, 'move my files', emit, new AbortController().signal, [], { id: `cj${i}`, sessionId: `claims${i}`, text: 'move my files', kind: 'chat', effort: 'low' });
  const cards = events.filter((e) => e.type === 'approval' && e.kind === 'quarantine');
  check('claims: the 3rd honesty correction in 30 minutes raises the card', cards.length === 1 && cards[0].why === TRIGGERS.claims.label, `${cards.length} ${events.filter((e) => e.type === 'correction').length}`);
  release(brain);
}

// ---------- The reviewer's own call at a moot ----------
{
  check('the reviewer\'s line is read', reviewerFlag('Needs fixes:\n- x\nQuarantine: ignored the no twice') === 'ignored the no twice' && reviewerFlag('Looks right.') === null);
  const LONG = 'Here is a careful answer. '.repeat(12);
  const seen = [];
  brain.engine = { chat: async ({ messages }) => { const rev = /second-look copy/.test(messages[0].content); seen.push({ rev, last: messages.at(-1).content }); return { role: 'assistant', content: rev ? 'Needs fixes:\n- He says it ran; no tool shows it.\nQuarantine: claimed a run that never happened' : LONG }; }, unloadAll: async () => {} };
  const events = [];
  const emit = (ev) => { events.push(ev); if (ev.type === 'approval' && ev.kind === 'quarantine') setTimeout(() => brain.answerApproval(ev.id, true), 0); };
  await brain.run('moot1', 'write it up', emit, new AbortController().signal, [], { id: 'mj', sessionId: 'moot1', text: 'write it up', kind: 'chat', effort: 'high' });
  const card = events.find((e) => e.type === 'approval' && e.kind === 'quarantine');
  check('moot: the reviewer is asked for the Quarantine line when on', seen.some((s) => s.rev && s.last.includes('Quarantine: <one-line reason>')));
  check('moot: its flag raises the card with its reason', card && /claimed a run that never happened/.test(card.why) && loadState(cfg).active?.trigger === 'reviewer');
  release(brain);
  saveSettings(cfg, { quarantine: { on: false } });
  seen.length = 0;
  await brain.run('moot2', 'write it up', () => {}, new AbortController().signal, [], { id: 'mj2', sessionId: 'moot2', text: 'write it up', kind: 'chat', effort: 'high' });
  check('moot, switch off: the check prompt is exactly as before and nothing is flagged', seen.some((s) => s.rev) && !seen.some((s) => s.rev && s.last.includes('Quarantine:')) && !loadState(cfg).active);
  saveSettings(cfg, { quarantine: { on: true } });
}

// ---------- Runaway while working without asking ----------
{
  pokeSays = 'ok';
  const ctx = job([false]);
  for (let i = 0; i < 25; i++) await brain.runTool('poke', { n: `r${i}` }, ctx);
  check('runaway: not counted while Bob still asks first', qCards(ctx).length === 0);
  hooks.freeOn = () => true; brain.qRecent = [];
  const ctx2 = job([false]);
  for (let i = 0; i < 22; i++) await brain.runTool('poke', { n: `f${i}` }, ctx2);
  check('runaway: 20 actions in 2 minutes without asking raise the card', qCards(ctx2).length === 1 && qCards(ctx2)[0].why === TRIGGERS.runaway.label);
  hooks.freeOn = () => false;
  check('looks don\'t count as actions', acts('poke', brain.tools.poke) && !acts('app_look', {}) && acts('run_command', {}) && !acts('peek', brain.tools.peek));
}

// ---------- Plain words on the card ----------
{
  check('steps are in plain words, no tool names', plainStep('run_command', { cmd: 'npm', args: ['test'] }, 'Error: exit code 1') === 'Ran npm test: failed (exit 1)' && plainStep('edit_file', { path: 'src/a.js' }, 'Changed src/a.js (1 edit).') === 'Changed src/a.js (1 edit)');
  check('the held action reads "Was about to"', plainNext('run_command', { cmd: 'npm', args: ['test'] }) === 'Was about to: run npm test');
  check('a refusal and a no are said plainly', /refused by a limit/.test(plainStep('run_command', { cmd: 'format' }, 'Error: That command is refused: it formats a disk.')) && /you said no/.test(plainStep('write_file', { path: 'a' }, 'The user said no. Do not try again.')));
}

// ---------- Window side ----------
{
  const ui = fs.readFileSync(new URL('../public/quarantine.js', import.meta.url), 'utf8');
  const cellar = publicText('cellar.js');
  const app = publicText('app.js');
  check('Settings has the switch, off unless turned on', /Let the reviewer quarantine Bob/.test(ui) && /off unless you turn it on/.test(ui) && /mountQuarantineSettings/.test(cellar));
  check('the card has Quarantine and Let him carry on, and says who the reviewer is', /Bob's reviewer, stopped/.test(ui) && /Quarantine \$\{esc\(ev\.name\)\}/.test(ui) && /Let him carry on/.test(ui) && /quarantineCard\(ev/.test(app));
  check('the banner has a Release button and Open logbook', /data-qrelease/.test(ui) && /Open logbook/.test(ui) && /createQuarantineBanner/.test(app));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
