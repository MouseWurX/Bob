// Settings, Jobs: "Fix until the tests pass" (src/fix-loop.js) and "Undo the whole coding job" (src/job-undo.js), both off
// unless turned on. Plain checks first, then real turns with a scripted brain and a stand-in run_command (no program
// really runs, nothing goes online, nothing outside a temp folder is read).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { testOutcome, failLines, failSig, failExcerpt, fixLoopStep, fixAfterTool, SAME_FAILS, PASS_LINE } from '../src/fix-loop.js';
import { projectRoot, takeCheckpoint, changesSince, jobUndoBefore, jobUndoFinish, undoCodingJob, undoCodingLine, pruneJobUndo, SKIP_DIRS } from '../src/job-undo.js';
import { cleanJobHelps, testsNudge, JOB_HELPS } from '../src/job-helps.js';
import { jobUndoHtml } from '../public/job-helps.js';
import { NOT_BACKED_UP } from '../src/backup.js';
import { HELP } from '../public/help-content.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-fixloop-'));

const FAIL_OUT = (n = 1) => `Finished with exit code 1.\nOutput (end):\n✔ adds (1.2ms)\n✖ subtracts (0.8ms)\n  AssertionError [ERR_ASSERTION]: 1 !== ${n}\n# fail 1`;
const PASS_OUT = 'Finished with exit code 0 (success).\nOutput (end):\n✔ adds\n✔ subtracts\n# fail 0';

// ---------- Reading a test run ----------
{
  check('exit 0 passes', testOutcome(PASS_OUT).kind === 'pass');
  check('a non-zero exit fails', testOutcome(FAIL_OUT()).kind === 'fail' && testOutcome('Finished with exit code 101.\n').kind === 'fail');
  check('a run past the time limit fails', testOutcome('Stopped: it ran past the 10-minute limit.\nOutput (end):\n...').kind === 'fail');
  check('a denied card, a stop or a missing program: not run, with why', testOutcome('Sam said no.').kind === 'notrun' && /denied/.test(testOutcome('Sam said no.').why) && testOutcome('Stopped by the user.').kind === 'notrun' && /didn't start: npm not found/.test(testOutcome("It didn't start: npm not found").why));
  const lines = failLines(FAIL_OUT());
  check('the failure lines are picked out, times taken off', lines.some((l) => l === '✖ subtracts') && lines.some((l) => /AssertionError/.test(l)) && !lines.some((l) => /adds/.test(l)) && !lines.some((l) => /fail 0|# fail 1/.test(l) && /0/.test(l)), JSON.stringify(lines));
  check('pytest, cargo and go lines are seen', failLines('FAILED tests/test_a.py::test_x - assert 1 == 2').length === 1 && failLines("thread 'main' panicked at src/lib.rs:3").length === 1 && failLines('--- FAIL: TestAdd (0.00s)').length === 1);
  check('the same failures with other times look the same', failSig(FAIL_OUT()) === failSig(FAIL_OUT().replace('0.8ms', '3.1ms')) && failSig(FAIL_OUT(1)) !== failSig(FAIL_OUT(2)));
  check('what goes back names the failures and the end of the output', /What failed:\n- ✖ subtracts/.test(failExcerpt(FAIL_OUT())) && /End of the output:/.test(failExcerpt(FAIL_OUT())) && failExcerpt('x'.repeat(9000)).length <= 3500);
}

// ---------- The loop, with a stand-in brain ----------
const fakeBrain = (runs, on = true) => {
  const b = { cfg: { jobHelps: cleanJobHelps({ fixLoop: on }), userName: 'Sam' }, ran: [], logs: [], log(k, t) { b.logs.push(`${k}: ${t}`); }, usable: () => true,
    runTool: async (name, args) => { b.ran.push({ name, args }); return { text: runs.shift() ?? PASS_OUT }; } };
  return b;
};
const T = { root: '/p', cmd: 'npm', args: ['test'] };
const find = () => T;
{
  let b = fakeBrain([]), ctx = { job: { id: 'j' }, emit() {} };
  check('off, or no code changed: nothing happens', await fixLoopStep(fakeBrain([], false), { job: {}, codeEdits: ['/p/a.js'] }, { find }) === null && await fixLoopStep(b, ctx, { find }) === null && !b.ran.length);
  check('a guest job, a side job or a stopped job is left alone', await fixLoopStep(b, { job: { guest: { from: 'x' } }, codeEdits: ['/p/a.js'] }, { find }) === null && await fixLoopStep(b, { job: { side: true }, codeEdits: ['/p/a.js'] }, { find }) === null && await fixLoopStep(b, { job: {}, noTools: true, codeEdits: ['/p/a.js'] }, { find }) === null);

  // Fail, fix, pass.
  b = fakeBrain([FAIL_OUT(), PASS_OUT]); const said = [];
  ctx = { job: { id: 'j' }, codeEdits: ['/p/a.js'], emit: (e) => said.push(e) };
  let r = await fixLoopStep(b, ctx, { find });
  check('he runs the tests himself, through run_command (the card still asks)', b.ran[0]?.name === 'run_command' && b.ran[0].args.cmd === 'npm' && b.ran[0].args.cwd === '/p');
  check('failing: the failures go back with "fix them"', /fail after your changes/.test(r?.note) && /✖ subtracts/.test(r.note) && /Never skip, delete or weaken a test/.test(r.note) && said.some((e) => e.type === 'announce' && /round 1/.test(e.text)));
  ctx.codeEdits.push('/p/a.js');
  r = await fixLoopStep(b, ctx, { find });
  check('after a fix they run again, and passing says so', b.ran.length === 2 && r?.line === PASS_LINE(T, 1) && /✅ Tests pass \(npm test, after 1 round of fixes\)/.test(r.line));
  check('then the answer goes through', await fixLoopStep(b, ctx, { find }) === null && b.ran.length === 2);

  // Out of ideas: he answers again without changing code.
  b = fakeBrain([FAIL_OUT()]); said.length = 0;
  ctx = { job: { id: 'j' }, codeEdits: ['/p/a.js'], emit: (e) => said.push(e) };
  await fixLoopStep(b, ctx, { find });
  r = await fixLoopStep(b, ctx, { find });
  check('no change since the last failing run: he stops and reports what is still broken', b.ran.length === 1 && /Stop fixing now/.test(r?.note) && /which tests still fail/.test(r.note) && said.some((e) => /stopped fixing \(no new change to try\)/.test(e.text)));
  r = await fixLoopStep(b, ctx, { find });
  check('and the app adds its own ❌ line naming the failures', /❌ The tests still fail \(npm test, last run\): ✖ subtracts/.test(r?.line), r?.line);
  check('only once', await fixLoopStep(b, ctx, { find }) === null);

  // Round in circles: the same failures SAME_FAILS runs in a row, code changed each time.
  b = fakeBrain(Array(SAME_FAILS).fill(FAIL_OUT()));
  ctx = { job: { id: 'j' }, codeEdits: ['/p/a.js'], emit() {} };
  const notes = [];
  for (let i = 0; i < SAME_FAILS; i++) { notes.push(await fixLoopStep(b, ctx, { find })); ctx.codeEdits.push('/p/a.js'); }
  check(`the same failures ${SAME_FAILS} runs in a row stop it`, notes.slice(0, -1).every((n) => /fail after your changes/.test(n?.note)) && /Stop fixing now: the same tests failed the same way/.test(notes.at(-1)?.note));

  // Progress is never cut off by a count.
  b = fakeBrain([...Array(8)].map((_, i) => FAIL_OUT(i + 2)).concat([PASS_OUT]));
  ctx = { job: { id: 'j' }, codeEdits: ['/p/a.js'], emit() {} };
  let last;
  for (let i = 0; i < 9; i++) { last = await fixLoopStep(b, ctx, { find }); ctx.codeEdits.push('/p/a.js'); }
  check('different failures each round: no count stops him', b.ran.length === 9 && /after 8 rounds of fixes/.test(last?.line), last?.line);

  // Can't run.
  b = fakeBrain(['Sam said no.']);
  r = await fixLoopStep(b, { job: {}, codeEdits: ['/p/a.js'], emit() {} }, { find });
  check('a denied card: a 🧪 line says they weren\'t run', /🧪 The tests weren't run \(npm test\): the command card was denied/.test(r?.line));
  b = fakeBrain([]); b.usable = (n) => n !== 'run_command';
  r = await fixLoopStep(b, { job: {}, codeEdits: ['/p/a.js'], emit() {} }, { find });
  check('the Run Hand off: says so, runs nothing', /Run Hand is off/.test(r?.line) && !b.ran.length);

  // His own run after his last change stands for the check.
  const proj = path.join(tmp, 'own'); fs.mkdirSync(proj, { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), '{"scripts":{"test":"node t.js"}}');
  b = fakeBrain([]); ctx = { job: {}, codeEdits: [path.join(proj, 'a.js')], emit() {} };
  fixAfterTool(b, 'run_command', { cmd: 'npm', args: ['test'], cwd: proj }, { text: PASS_OUT }, ctx);
  r = await fixLoopStep(b, ctx);
  check('his own test run after his last edit is used, not run twice', !b.ran.length && /✅ Tests pass/.test(r?.line));
  // The Lab's test world: the brain sees made-up paths; realPath/shownPath map them.
  b = fakeBrain([PASS_OUT]); b.realPath = (p) => p.replace('C:\\you\\own', proj).replace(/\\/g, '/'); b.shownPath = (p) => p.replace(proj, 'C:\\you\\own');
  r = await fixLoopStep(b, { job: {}, codeEdits: ['C:\\you\\own\\a.js'], emit() {} });
  check('made-up paths (the Lab) are mapped both ways', /✅/.test(r?.line) && b.ran[0]?.args.cwd === 'C:\\you\\own', JSON.stringify(b.ran[0]));
  check('with it on, the one-time "run its tests" note steps aside', testsNudge({ cfg: { jobHelps: { runTests: true, fixLoop: true } } }, { job: {}, testedAfterEdit: false, codeEdits: [path.join(proj, 'a.js')] }) === '');
}

// ---------- Undo the whole coding job ----------
const dataDir = path.join(tmp, 'data'); fs.mkdirSync(dataDir, { recursive: true });
const cfg = { dataDir, jobHelps: cleanJobHelps({ jobUndo: true }) };
{
  const has = (...fs_) => (p) => fs_.some((f) => p === path.resolve(f));
  check('the repository top wins over a nearer package.json', projectRoot('/w/repo/app/src', { exists: has('/w/repo/.git', '/w/repo/app/package.json'), home: '/h' }) === path.resolve('/w/repo'));
  check('no repository: the nearest project file', projectRoot('/w/proj/src', { exists: has('/w/proj/package.json'), home: '/h' }) === path.resolve('/w/proj'));
  check('never the home folder or a drive top, never a plain folder', projectRoot('/h/docs', { exists: has('/h/.git'), home: '/h' }) === null && projectRoot('/x', { exists: has('/.git'), home: '/h' }) === null && projectRoot('/w/notes', { exists: () => false, home: '/h' }) === null);
  check('dependency and build folders are left out', ['node_modules', '.git', 'dist', 'target', 'venv', '__pycache__'].every((d) => SKIP_DIRS.has(d)));

  const root = path.join(tmp, 'repo'); fs.mkdirSync(path.join(root, 'src'), { recursive: true }); fs.mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
  fs.mkdirSync(path.join(root, '.git'));
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'let a = 1;\n'); fs.writeFileSync(path.join(root, 'src', 'b.js'), 'let b = 1;\n'); fs.writeFileSync(path.join(root, 'old.txt'), 'old\n');
  fs.writeFileSync(path.join(root, 'node_modules', 'x', 'i.js'), 'dep\n');
  const said = [];
  const b = { cfg, log() {} };
  const ctx = { job: { id: 'j1' }, sessionId: 's', askId: 'a', emit: (e) => said.push(e) };
  check('off: no copy', jobUndoBefore({ cfg: { dataDir, jobHelps: {} }, log() {} }, 'write_file', { path: path.join(root, 'src', 'a.js') }, { job: {} }) === null);
  check('a look (read_file) keeps no copy', jobUndoBefore(b, 'read_file', { path: path.join(root, 'src', 'a.js') }, ctx) === null);
  check('a guest job keeps no copy', jobUndoBefore(b, 'write_file', { path: path.join(root, 'src', 'a.js') }, { job: { guest: { from: 'x' } } }) === null);
  const id = jobUndoBefore(b, 'write_file', { path: path.join(root, 'src', 'a.js') }, ctx);
  check('the first change in a project keeps a copy, once', id && jobUndoBefore(b, 'run_command', { cmd: 'npx', cwd: path.join(root, 'src') }, ctx) === id && ctx.checkpoints.size === 1);
  // What the job does: an edit, a command's changes (a formatter rewrote b.js and deleted old.txt), a new file, a dependency.
  fs.writeFileSync(path.join(root, 'src', 'a.js'), 'let a = 2;\n'); fs.writeFileSync(path.join(root, 'src', 'b.js'), 'let b = 1; // formatted\n');
  fs.rmSync(path.join(root, 'old.txt')); fs.writeFileSync(path.join(root, 'src', 'new.js'), 'new\n'); fs.writeFileSync(path.join(root, 'node_modules', 'x', 'i.js'), 'dep 2\n');
  const bl = { cfg, log() {}, realPath: (p) => p.replace('C:\\you\\repo', root).replace(/\\/g, '/') }, cl = { job: {}, emit() {} };
  check('made-up paths (the Lab) find the same project', jobUndoBefore(bl, 'edit_file', { path: 'C:\\you\\repo\\src\\a.js' }, cl) && [...cl.checkpoints.keys()][0] === root);
  const cf = { job: {}, emit() {} };
  check('a move or delete (file_hands) as the first change keeps a copy too', jobUndoBefore(b, 'file_hands', { action: 'move', from: [path.join(root, 'src', 'b.js')], to: path.join(root, 'lib') }, cf) && [...cf.checkpoints.keys()][0] === root);
  const cards = jobUndoFinish(b, ctx);
  check('the card says what changed, made and deleted (commands too, not the dependencies)', cards.length === 1 && cards[0].changed === 2 && cards[0].created === 1 && cards[0].deleted === 1 && said.some((e) => e.type === 'job-undo' && e.id === id) && !cards[0].files.some((f) => /node_modules/.test(f)), JSON.stringify(cards[0]));
  check('the card draws with its one button', /Undo the whole job/.test(jobUndoHtml(cards[0])) && /data-jh-undoall="/.test(jobUndoHtml(cards[0])) && !/data-jh-undoall/.test(jobUndoHtml(cards[0], { local: false })));
  // The owner edits b.js again before pressing Undo: that one is left alone.
  fs.writeFileSync(path.join(root, 'src', 'b.js'), 'let b = 3; // mine\n');
  const r = undoCodingJob(cfg, id, { now: () => 42 });
  check('Undo puts the job\'s files back and restores the deleted one', fs.readFileSync(path.join(root, 'src', 'a.js'), 'utf8') === 'let a = 1;\n' && fs.readFileSync(path.join(root, 'old.txt'), 'utf8') === 'old\n');
  check('a file changed since is left as it is, and named', fs.readFileSync(path.join(root, 'src', 'b.js'), 'utf8') === 'let b = 3; // mine\n' && r.skipped.some((s) => s.rel === 'src/b.js' && s.why === 'changed since') && /src\/b\.js \(changed since\)/.test(undoCodingLine(r)));
  check('a file the job made goes to the backups folder, not deleted', !fs.existsSync(path.join(root, 'src', 'new.js')) && fs.readFileSync(path.join(dataDir, 'backups', 'undone', '42-repo', 'src', 'new.js'), 'utf8') === 'new\n');
  check('dependencies are left as they are', fs.readFileSync(path.join(root, 'node_modules', 'x', 'i.js'), 'utf8') === 'dep 2\n');
  let again = ''; try { undoCodingJob(cfg, id); } catch (e) { again = e.message; }
  check('it can only be undone once', /too old to undo, or it was already undone/.test(again));
  let bad = ''; try { undoCodingJob(cfg, '../../etc'); } catch (e) { bad = e.message; }
  check('a made-up id reaches nothing', /too old/.test(bad));
  // A job that changed nothing leaves no copy and no card.
  const ctx2 = { job: { id: 'j2' }, emit() {} };
  const id2 = jobUndoBefore(b, 'run_command', { cmd: 'npm', cwd: root }, ctx2);
  check('nothing changed: no card, the copy is dropped', jobUndoFinish(b, ctx2).length === 0 && !fs.existsSync(path.join(dataDir, 'job-undo', id2)));
  const id3 = takeCheckpoint(cfg, root);
  fs.utimesSync(path.join(dataDir, 'job-undo', id3), new Date(0), new Date(0));
  check('copies go after a week', pruneJobUndo(cfg) >= 1 && !fs.existsSync(path.join(dataDir, 'job-undo', id3)));
  check('copies are never in a backup', NOT_BACKED_UP.includes('bob/job-undo/'));
  check('big files are noted, not copied', (() => { const m = { root, files: { 'big.bin': { size: 9e9, mtimeMs: 0, h: null } } }; return !changesSince(m).some((c) => c.rel === 'big.bin'); })());
}

// ---------- Wiring, settings and Help ----------
{
  const c = cleanJobHelps({});
  check('both switches start off', JOB_HELPS.includes('fixLoop') && JOB_HELPS.includes('jobUndo') && c.fixLoop === false && c.jobUndo === false);
  const runOn = read('../src/brain-run-on.js'), runs = read('../src/brain-tool-runs.js'), server = read('../src/server.js'), cellar = read('../public/cellar-pages.js'), phone = read('../android/app/src/main/assets/www/phone.js');
  check('the loop sits where he says done, before the one-time tests note', runOn.indexOf('await fixLoopStep(this, ctx)') > 0 && runOn.indexOf('await fixLoopStep(this, ctx)') < runOn.indexOf('testsNudge(this, ctx)'));
  check('every tool goes past the copy and the own-run check', /jobUndoBefore\(this, name, args, ctx\)/.test(runs) && /fixAfterTool\(this, name, args, res, ctx\)/.test(runs));
  check('the Undo route is on this replicant matrix only', /p === '\/api\/jobs\/undo-all'\) \{\n\s+if \(!isLocal\) return send\(res, 403/.test(server) && /pruneJobUndo\(cfg\)/.test(server));
  check('Settings has both switches', cellar.includes("sw('fixLoop', 'Fix until the tests pass'") && cellar.includes("sw('jobUndo', 'Undo the whole coding job'"));
  check('the phone shows the card as text', /ev\.type === 'job-undo'/.test(phone));
  const help = HELP.find((e) => e.id === 'settings-jobs').html, glossary = HELP.find((e) => e.id === 'glossary').html;
  check('Help, glossary and FAQ', ['Fix until the tests pass', 'Undo the whole coding job'].every((l) => help.includes(l)) && glossary.includes('<dt>Fix until the tests pass</dt>') && glossary.includes('<dt>Job checkpoint</dt>') && ['faq-fix-loop', 'faq-job-undo'].every((id) => HELP.some((e) => e.id === id && e.group === 'FAQ')));
}

// ---------- A real turn, with a scripted brain ----------
{
  const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dd = path.join(innDir, 'bob');
  fs.mkdirSync(dd, { recursive: true });
  const proj = path.join(innDir, 'proj'); fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), '{"scripts":{"test":"node t.js"}}'); fs.writeFileSync(path.join(proj, 'src', 'a.js'), 'let a = 1;\n');
  const cfg2 = { agentDir, innDir, dataDir: dd, settingsFile: path.join(dd, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam', projects: { proj },
    models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, jobHelps: cleanJobHelps({ fixLoop: true, jobUndo: true }) };
  const events = [];
  const brain = new Brain(cfg2, (ev) => { events.push(ev); if (ev.type === 'approval') setTimeout(() => brain.answerApproval(ev.id, true), 0); });
  clearInterval(brain.reminderTimer);
  brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
  brain.offTools = () => new Set(); // the Run Hand on, for this turn
  const testRuns = [FAIL_OUT(), PASS_OUT];
  brain.tools.run_command = { schema: { type: 'function', function: { name: 'run_command', description: 'Run', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } }, run: async () => testRuns.shift() || PASS_OUT, summary: (a) => `run ${a.cmd}` };
  const seen = [];
  const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
  const file = path.join(proj, 'src', 'a.js');
  const script = [call('write_file', { path: file, content: 'let a = 3;\n' }), { role: 'assistant', content: 'Changed it.' }, call('write_file', { path: file, content: 'let a = 2;\n' }), { role: 'assistant', content: 'Fixed the subtract bug.' }];
  brain.engine = { chat: async ({ messages }) => { seen.push(messages); return script.shift() || { role: 'assistant', content: 'done' }; }, unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
  const { jobId } = brain.enqueue('main', 'change a to 2 in my project src/a.js', [], 'low');
  await until(() => ['done', 'failed', 'cancelled'].includes(brain.queue.find((j) => j.id === jobId)?.state), 8000);
  check('a real turn: the failures reach him, he fixes, they pass', seen.some((m) => m.some((x) => x.role === 'system' && /fail after your changes/.test(x.content))) && /✅ Tests pass \(npm test, after 1 round of fixes\)/.test(brain.session('main').at(-1)?.content || ''), brain.session('main').at(-1)?.content);
  const card = events.find((e) => e.type === 'job-undo');
  check('and the ↩ card is under the answer', card && card.changed === 1 && card.root === proj);
  const r = undoCodingJob(cfg2, card.id);
  check('one press puts the project back', fs.readFileSync(file, 'utf8') === 'let a = 1;\n' && r.restored.includes('src/a.js'));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
