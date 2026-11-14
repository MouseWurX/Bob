// "Work without asking" and the hard limits (Settings, Hands). Free mode is off by default; every hard
// limit is on by default and each can be switched off on its own; ✋ Hands and Stop everything always stop him.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanHands, freeOn, limitOn, readOnlyRoots, LIMITS } from '../src/hands-settings.js';
import { checkCommand } from '../src/hands-run.js';
import { planFiles, applyFiles, undoJob, guardPath } from '../src/hands-files.js';
import { handsTools, stopEverything, holdHands, handsPrompt, handsView } from '../src/hands.js';
import { sendOutBlock } from '../src/hands-apps.js';
import { isSensitive } from '../src/tools.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-free-'));

// ---------- Defaults ----------
{
  const h = cleanHands({});
  check('work without asking is off by default', h.free === false);
  check('every hard limit is on by default', Object.keys(LIMITS).every((k) => h.limits[k] === true));
  check('all six hard limits are there', ['recycleOnly', 'secrets', 'readOnly', 'commands', 'passwords', 'sendOut'].every((k) => LIMITS[k]?.label && LIMITS[k]?.off));
  check('junk can\'t switch free mode on or a limit off', cleanHands({ free: 'yes', limits: { secrets: 0, commands: 'false', sendOut: null } }).free === false && Object.values(cleanHands({ limits: { secrets: 0, commands: 'false' } }).limits).every(Boolean));
  check('only an explicit false switches a limit off', cleanHands({ limits: { secrets: false } }).limits.secrets === false && cleanHands({ limits: { secrets: false } }).limits.commands === true);
  check('free mode needs the master switch', !freeOn({ hands: { free: true } }) && freeOn({ hands: { enabled: true, free: true } }));
  check('✋ Hands (held) turns free mode off at once', !freeOn({ hands: { enabled: true, free: true, held: true } }));
}

// ---------- A Bob home ----------
const agentDir = path.join(tmp, 'Agent');
const innDir = path.join(agentDir, 'inn');
const dataDir = path.join(innDir, 'bob');
const work = path.join(tmp, 'Downloads');
const ro = path.join(tmp, 'DonorProject');
for (const d of [dataDir, work, ro]) fs.mkdirSync(d, { recursive: true });
const own = [dataDir];
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readOnlyRoots: [ro, dataDir], ownReadOnlyRoots: own, readRoots: [innDir, work, ro], recycleBin: false, userName: 'Sam',
  hands: { enabled: true, files: { on: true }, run: { on: true }, folders: [work, ro], timeoutMin: 1 } };
const withLimits = (limits, extra = {}) => ({ ...cfg, hands: { ...cfg.hands, ...extra, limits } });
const put = (rel, body = 'x', root = work) => { const f = path.join(root, rel); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, body); return f; };

// ---------- Secrets ----------
{
  const env = put('.env', 'TOKEN=1');
  check('secret files are off-limits with the limit on', isSensitive(cfg, env) && throws(() => guardPath(cfg, env), /keys or passwords/));
  const open = withLimits({ secrets: false });
  check('with "Keep secret files private" off, Bob may touch them', !isSensitive(open, env) && guardPath(open, env) === env);
  check('Bob\'s own config stays off-limits even then', isSensitive(open, fileURLToPath(new URL('../config.json', import.meta.url))));
  check('run refuses a secret file only while the limit is on', !checkCommand(cfg, { cmd: 'notepad', args: [env], cwd: work }).ok && checkCommand(open, { cmd: 'notepad', args: [env], cwd: work }).ok);
}

// ---------- Read-only projects ----------
{
  const f = put('a.txt', 'x', ro);
  check('read-only projects stay read-only with the limit on', readOnlyRoots(cfg).includes(ro) && throws(() => guardPath(cfg, f), /read-only/));
  const open = withLimits({ readOnly: false });
  check('with the limit off they open up', !readOnlyRoots(open).includes(ro) && guardPath(open, f) === f);
  check('Bob\'s own folders stay read-only whatever', readOnlyRoots(open).includes(dataDir) && throws(() => guardPath(open, path.join(dataDir, 'x.json'), { mustExist: false }), /read-only|own settings/));
  check('without ownReadOnlyRoots (older callers) everything stays read-only', readOnlyRoots({ ...open, ownReadOnlyRoots: undefined }).includes(ro));
  check('run in a read-only project only while the limit is on', !checkCommand(cfg, { cmd: 'git', args: ['status'], cwd: ro }).ok && checkCommand(open, { cmd: 'git', args: ['status'], cwd: ro }).ok);
  check('Settings shows the user\'s read-only folders, not Bob\'s own', JSON.stringify(handsView(cfg).readOnly) === JSON.stringify([ro]));
}

// ---------- Dangerous commands ----------
{
  const c = (conf, cmd, args) => checkCommand(conf, { cmd, args, cwd: work });
  const open = withLimits({ commands: false });
  check('the blocklist refuses format and shutdown with the limit on', !c(cfg, 'format', ['C:']).ok && !c(cfg, 'shutdown', ['/s']).ok && !c(cfg, 'cmd', ['/c', 'rd', '/s', '/q', 'C:\\x']).ok);
  check('with "Block dangerous commands" off they are allowed', c(open, 'format', ['C:']).ok && c(open, 'shutdown', ['/s']).ok && c(open, 'cmd', ['/c', 'rd', '/s', '/q', 'C:\\x']).ok);
  check('Bob\'s own settings stay off-limits to commands whatever', !c(withLimits({ commands: false, secrets: false }), 'notepad', [cfg.settingsFile]).ok);
  put('bad.ps1', 'Stop-Computer -Force\n');
  check('a script\'s contents follow the same switch', !c(cfg, 'powershell', ['-File', 'bad.ps1']).ok && c(open, 'powershell', ['-File', 'bad.ps1']).ok);
}

// ---------- Don't send anything out ----------
{
  const c = (conf, cmd, args) => checkCommand(conf, { cmd, args, cwd: work });
  const open = withLimits({ sendOut: false });
  const sends = [['curl -d', 'curl', ['-d', 'x=1', 'https://x']], ['curl -F', 'curl', ['-F', 'f=@a.txt', 'https://x']], ['curl -X POST', 'curl', ['-X', 'POST', 'https://x']], ['curl --upload-file', 'curl', ['--upload-file', 'a', 'https://x']],
    ['Invoke-WebRequest -Body', 'powershell', ['-Command', 'Invoke-WebRequest https://x -Method Post -Body $b']], ['irm -InFile', 'pwsh', ['-c', 'irm https://x -InFile a.zip']],
    ['git push', 'git', ['push', 'origin', 'main']], ['npm publish', 'npm', ['publish']], ['scp', 'scp', ['a.txt', 'me@host:/tmp']], ['ssh', 'ssh', ['me@host']], ['Send-MailMessage', 'powershell', ['-Command', 'Send-MailMessage -To a@b.c']],
    ['gh pr create', 'gh', ['pr', 'create']]];
  for (const [name, cmd, args] of sends) check(`"Don't send anything out" refuses ${name}`, !c(cfg, cmd, args).ok && /send anything out/.test(c(cfg, cmd, args).why), JSON.stringify(c(cfg, cmd, args)));
  check('...and allows them when switched off', sends.every(([, cmd, args]) => c(open, cmd, args).ok));
  const reads = [['curl URL', 'curl', ['https://example.com']], ['curl -o', 'curl', ['-o', 'page.html', 'https://example.com']], ['git pull', 'git', ['pull']], ['git clone', 'git', ['clone', 'https://x/y.git']], ['npm install', 'npm', ['install']], ['curl --data-free word in a URL', 'curl', ['https://x/data-sets']]];
  for (const [name, cmd, args] of reads) check(`plain downloads still work: ${name}`, c(cfg, cmd, args).ok, JSON.stringify(c(cfg, cmd, args)));
  const chrome = { process: 'chrome.exe', title: 'Mail' };
  check('Apps: no typing or keys in a browser, mail or chat app', /send anything out/.test(sendOutBlock(cfg, chrome, 'type')) && sendOutBlock(cfg, { process: 'Discord' }, 'keys') && sendOutBlock(cfg, { process: 'OUTLOOK.EXE' }, 'type'));
  check('Apps: no Send/Post/Upload clicks there, but other clicks are fine', sendOutBlock(cfg, chrome, 'click', { name: 'Send' }) && sendOutBlock(cfg, chrome, 'click', { name: 'Button "Post reply"' }) && !sendOutBlock(cfg, chrome, 'click', { name: 'Back' }));
  check('Apps: other apps (Notepad) are not affected', !sendOutBlock(cfg, { process: 'notepad.exe' }, 'type'));
  check('Apps: switched off, nothing is blocked', !sendOutBlock(open, chrome, 'type') && !sendOutBlock(open, chrome, 'click', { name: 'Send' }));
}

// ---------- Recycle Bin only ----------
{
  const f = put('del/old.txt');
  check('delete for good is refused while "Recycle Bin only" is on', throws(() => planFiles(cfg, { action: 'delete', paths: [f] }), /Recycle Bin only/));
  const open = withLimits({ recycleOnly: false });
  const plan = planFiles(open, { action: 'delete', paths: [f] });
  check('with it off, the plan says it can\'t be undone', /for good/.test(plan.label) && /can't be undone/.test(plan.rows[0].note));
  check('a delete plan made earlier is refused if the limit is back on', applyFiles(cfg, plan).failed.length === 1 && fs.existsSync(f));
  const r = applyFiles(open, plan);
  check('it deletes for good', r.done.length === 1 && !fs.existsSync(f));
  const u = undoJob(open, r.job.id);
  check('Undo says plainly it can\'t come back', u.failed.length === 1 && /deleted for good/.test(u.failed[0]));
  check('secret folders are still left alone when deleting', (() => { put('del2/.env', 'k'); const p = planFiles(open, { action: 'delete', paths: [path.join(work, 'del2')] }); return Boolean(p.rows[0].blocked); })());
}

// ---------- No cards while free; logged; cloud still asks; ✋ ----------
{
  const logs = [], events = [];
  const fake = Object.create(Brain.prototype);
  const c2 = { ...cfg, hands: { ...cfg.hands, free: false } };
  Object.assign(fake, { cfg: c2, tools: {}, approvals: new Map(), handApprovals: new Set(), state: { state: 'idle' }, setState() {}, log: (k, t) => logs.push(`${k}: ${t}`), broadcast: (e) => events.push(e), saveHands(next) { c2.hands = next; } });
  Object.assign(fake.tools, handsTools(fake));
  let cards = 0;
  const ctx = () => ({ emit: (e) => { events.push(e); if (e.type === 'approval') { cards++; setTimeout(() => fake.answerApproval(e.id, true), 5); } }, signal: new AbortController().signal, allowAll: new Set() });
  const a = put('free/a.txt');
  await fake.runTool('file_hands', { action: 'copy', paths: [a], to: path.join(work, 'f1') }, ctx());
  check('with free mode off, a card is shown', cards === 1 && fs.existsSync(path.join(work, 'f1', 'a.txt')));
  c2.hands = { ...c2.hands, free: true };
  const r = await fake.runTool('file_hands', { action: 'copy', paths: [a], to: path.join(work, 'f2') }, ctx());
  check('with free mode on, no card and the job is done', cards === 1 && fs.existsSync(path.join(work, 'f2', 'a.txt')), r.text);
  check('it is logged as done without asking', logs.some((l) => /^approval: done without asking: Copy 1 item/.test(l)));
  check('the chat gets a line saying what he did', events.some((e) => e.type === 'auto-approved' && /Copy 1 item/.test(e.text)));
  const rc = await fake.runTool('run_command', { cmd: 'format', args: ['C:'], cwd: work }, ctx());
  check('hard limits still refuse in free mode', /^Error:.*never run/.test(rc.text) && cards === 1);
  check('Bob\'s prompt says no cards, and that limits still apply', /work without asking/.test(handsPrompt(c2)) && /hard limits still apply/i.test(handsPrompt(c2)) && !/Every action shows a card/.test(handsPrompt(c2)));
  check('Bob is told which limits were switched off', /switched off: Recycle Bin only/.test(handsPrompt({ ...c2, hands: { ...c2.hands, limits: { recycleOnly: false } } })));

  const cloud = { check: () => 'Send this job to a cloud helper. It costs money.', run: async () => 'ok', alwaysAsk: true };
  fake.tools.ask_cloud_test = cloud;
  const before = cards;
  fake.usable = () => true;
  await fake.runTool('ask_cloud_test', {}, ctx());
  check('cloud helpers still ask (they cost money)', cards === before + 1);
  delete fake.usable;
  check('the real ask_cloud tool is marked to always ask', /t\.ask_cloud = \{[\s\S]*?alwaysAsk: true/.test(fs.readFileSync(new URL('../src/tools.js', import.meta.url), 'utf8')));

  holdHands(fake, true);
  check('✋ Hands stops free mode', !freeOn(c2) && /stopped/.test((await fake.runTool('file_hands', { action: 'copy', paths: [a], to: path.join(work, 'f3') }, ctx())).text));
  holdHands(fake, false);
  check('letting Hands carry on brings free mode back (it is still on in Settings)', freeOn(c2));
  stopEverything(fake);
  check('Stop everything turns free mode off for good (asks again next time)', c2.hands.free === false && c2.hands.enabled === false);
}

// ---------- The page (settings review) ----------
{
  const ui = fs.readFileSync(new URL('../public/hands.js', import.meta.url), 'utf8');
  const html = fs.readFileSync(new URL('../public/index.html', import.meta.url), 'utf8');
  const css = fs.readFileSync(new URL('../public/style.css', import.meta.url), 'utf8');
  check('turning it on asks first, in the page (no browser dialog)', /'hfree' in el\.dataset && el\.checked\) \{ el\.checked = false; return askFree\(\); \}/.test(ui) && /Work without asking\?<\/strong> He'll move files/.test(ui) && !/confirm\(/.test(ui));
  check('the confirm mentions schedules, limits and ✋ Hands', /Scheduled jobs will also run by themselves\. Hard limits still apply, and ✋ Hands stops him at any time\./.test(ui));
  check('Settings has no separate Stop everything button (✋ Hands is the one kill switch)', !/data-hstopall>/.test(ui));
  check('the banner button says ✋ Stop Hands', /id="freeBannerStop"[^>]*>✋ Stop Hands</.test(html));
  check('working without asking shows orange on 🔓 Autonomy, not twice on ✋ Hands', /free-btn\[data-free="true"\] \.st \{ background: var\(--warn\)/.test(css) && !/hands-btn\[data-free/.test(css) && !/not asking/.test(fs.readFileSync(new URL('../public/hands-switch.js', import.meta.url), 'utf8')));
}

console.log(`\n${pass} passed, ${fail} failed`);
fs.rmSync(tmp, { recursive: true, force: true });
process.exit(fail ? 1 : 0);
