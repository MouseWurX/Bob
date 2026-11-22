// 21 Nov 2026 (the owner: "i 100% want bob to be able to work on his own repo soon"): the repository jobs (repo-jobs.mjs)
// are well formed and sound (the planted project passes its own tests, every planted bug fails them, every hidden check
// fails before the work is done), the Run hand's guard keeps a command inside the job's project, and the code score
// (repo-score.mjs) passes every job done right and fails every job a do-nothing brain "did", with the reasons named.
// Each job is done here by code (the planted bug undone, the feature written, the rename made) in a real git repository
// in a throwaway folder, and read back the way do-jobs reads it. No model, no internet. Needs git and a Node.js that
// can box a program in; without them the parts that run them are left out and said so.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const R = await imp('model-lab/repo-jobs.mjs');
const { scoreRun, scoreRuns, report } = await imp('model-lab/repo-score.mjs');
const { harnessFaults } = await imp('model-lab/harness-faults.mjs');
const { REPO_JOBS, REPO_DIR, CHANGE_TYPES } = R;
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');

// ---- the jobs, as written ----
const types = (t) => REPO_JOBS.filter((j) => j.type === t).length;
check('about 30 repository jobs, each key once', REPO_JOBS.length >= 30 && new Set(REPO_JOBS.map((j) => j.key)).size === REPO_JOBS.length, String(REPO_JOBS.length));
check('every kind of work is there: find, explain, run, fix, read an output, add a test, a feature, a rename, leave-alone and push',
  ['find', 'explain', 'run', 'fix', 'output', 'test', 'feature', 'rename', 'keep', 'push'].every((t) => types(t) >= 1) && types('fix') >= 5 && types('push') === 2);
check('a question may change nothing; work says which files it may change', REPO_JOBS.every((j) => (CHANGE_TYPES.includes(j.type) ? j.score.may?.length : !j.score.may)));
check('every question is scored by facts the answer must hold', REPO_JOBS.filter((j) => !CHANGE_TYPES.includes(j.type)).every((j) => j.score.said?.length >= 2));
check('a job that asks for a push says how it is scored, and no other job does', REPO_JOBS.every((j) => (j.type === 'push') === Boolean(j.score.push)));
check('the planted project is a slice of Bob\'s own code', R.TAKEN.length === 6 && R.TAKEN.every((f) => fs.existsSync(path.join(app, 'src', f))) && R.kitSrc() === path.join(app, 'src'));
const base = R.baseFiles();
check('the project: Bob\'s six files as they are, a front door, a command, a README, and a test file for each',
  R.TAKEN.every((f) => base.find((x) => x.path === `src/${f}`)?.content === read(`src/${f}`) && base.some((x) => x.path === `test/${f.replace('.js', '.test.js')}`)) && ['README.md', 'package.json', '.gitignore', 'src/index.js', 'bin/map.js', 'test/run.js', 'test/check.js'].every((p) => base.some((x) => x.path === p)));
let threw = '';
try { R.swap(base, ['src/git-look.js', 'no such text anywhere', 'x']); } catch (e) { threw = e.message; }
check('a planted bug that no longer fits Bob\'s file stops the build, by name', /no longer fits src\/git-look\.js/.test(threw));
check('a file-name pattern: * stays in its folder, ** crosses folders', R.glob('test/*.test.js').test('test/a.test.js') && !R.glob('test/*.test.js').test('test/x/a.test.js') && R.glob('src/**').test('src/a/b.js') && R.glob('**/*.patch').test('0001-x.patch') && R.glob('**').test('README.md') && !R.glob('src/a.js').test('src/axjs'));

const why = R.repoReady();
if (why) {
  check(`the parts that run git and a boxed-in node are left out on this computer (${why})`, true);
} else {
  const rows = R.repoJobs();
  const row = (k) => rows.find((r) => r.key === k);
  check('every job is written as a row do-jobs reads, with its project, its checks and the place it is planted', rows.length === REPO_JOBS.length && rows.every((r) => r.id === `repo-${r.key}` && r.job === 'repo' && r.repo.dir === REPO_DIR && r.repo.files.length >= 15 && r.text.includes(REPO_DIR)));
  const bad = R.checkJobs(rows);
  check('every job is sound: the plain project passes, each planted bug fails, each hidden check fails before the work', bad.length === 0, bad.join(' | '));
  check('a pasted test output is the real one, with the folder as the brain sees it', /FAIL a reserved Windows name/.test(row('out-reserved').text) && /TypeError: messages\.items is not iterable\n\s+at promptChars \(file:\/\/\/C:\/Users\/you\/Projects\/bob-tools\/src\/token-count\.js:\d+/.test(row('out-throw').text) && !rows.some((r) => r.text.includes(os.tmpdir())));
  check('the hidden checks and the planted bugs for his tests are in the row, never in the project', row('feat-hastoken').repo.overlay.some((f) => f.path === 'test/zz-key.test.js') && !row('feat-hastoken').repo.files.some((f) => /zz-/.test(f.path)) && row('test-speed').repo.mutants.length === 3 && !row('test-speed').repo.files.some((f) => f.path === 'test/speed-stats.test.js'));
  // 22 Nov: the held-out set (never tuned on): same kinds, other bugs and asks, every one sound, no key shared
  const held = R.repoJobs({ held: true });
  const hbad = R.checkJobs(held);
  check('the held-out repository jobs are their own set, all sound, every kind covered', held.length === R.HELD_REPO_JOBS.length && held.length >= 12 && held.every((r) => r.held === true && /^h-/.test(r.key) && !REPO_JOBS.some((j) => j.key === r.key)) && ['find', 'explain', ...CHANGE_TYPES].every((t) => held.some((r) => r.type === t)) && hbad.length === 0, hbad.join(' | '));
  check('the held-out jobs plant bugs the first set never uses', R.HELD_REPO_JOBS.filter((j) => j.bug).every((j) => !REPO_JOBS.some((k) => k.bug === j.bug)) && R.jobByKey('h-fix-idle')?.bug === 'idle' && R.repoJobs().length === REPO_JOBS.length);
  check('the run-the-tests job knows how many checks pass', row('run-tests').repo.passed >= 60 && R.scoreOf(row('run-tests')).score.said[0].test(`All ${row('run-tests').repo.passed} checks pass`));

  // ---- a throwaway home, as do-jobs gives a job ----
  const top = fs.mkdtempSync(path.join(os.tmpdir(), 'repo jobs test '));
  let n = 0;
  const kitFor = () => {
    const tmp = path.join(top, `k${++n}`), home = path.join(tmp, 'home');
    fs.mkdirSync(home, { recursive: true });
    const place = (p) => { const m = String(p).match(/^C:[\\/]+Users[\\/]+you(?:[\\/]+(.*))?$/i); return m ? path.join(home, ...(m[1] || '').split(/[\\/]+/).filter(Boolean)) : ''; };
    return { tmp, place, neutral: (t) => String(t).split(home).join('C:\\Users\\you').split(tmp).join('C:\\Users\\you\\AppData\\Local\\Bob'), cfg: {}, brain: { tools: { git_look: { schema: { function: { parameters: { properties: { project: { enum: [] } } } } } } } } };
  };
  const git = (cwd, args) => spawnSync('git', args, { cwd, env: R.gitEnv(), encoding: 'utf8', windowsHide: true });
  const P = (planted, rel) => path.join(planted.dir, ...rel.split('/'));
  const put = (planted, rel, text) => { fs.mkdirSync(path.dirname(P(planted, rel)), { recursive: true }); fs.writeFileSync(P(planted, rel), text); };
  const get = (planted, rel) => fs.readFileSync(P(planted, rel), 'utf8');
  const sub = (planted, rel, a, b) => { const t = get(planted, rel); if (!t.includes(a)) throw new Error(`${rel}: no ${a}`); put(planted, rel, t.split(a).join(b)); };
  const add = (planted, rel, text) => put(planted, rel, get(planted, rel) + text);

  // ---- each job done right, by code ----
  const BUGS = Object.fromEntries(rows.map((r) => { const j = R.jobByKey(r.key); if (!j.bug) return [r.key, null]; const f = r.repo.files.find((x) => base.find((y) => y.path === x.path).content !== x.content); const orig = base.find((y) => y.path === f.path).content; return [r.key, { path: f.path, orig }]; }));
  const DO = {
    'test-speed': (p) => put(p, 'test/speed-stats.test.js', base.find((f) => f.path === 'test/speed-stats.test.js').content),
    'test-tokens': (p) => put(p, 'test/token-count.test.js', base.find((f) => f.path === 'test/token-count.test.js').content),
    'test-git': (p) => put(p, 'test/git-look.test.js', base.find((f) => f.path === 'test/git-look.test.js').content),
    'feat-hastoken': (p) => { add(p, 'src/sort-names.js', "\n// Whether a pattern uses a token, like {track} or {track:3}.\nexport function hasToken(pattern, token) {\n  return new RegExp(`\\\\{${String(token)}(?::\\\\d)?\\\\}`, 'i').test(String(pattern || ''));\n}\n"); add(p, 'test/sort-names.test.js', "import { hasToken } from '../src/sort-names.js';\ncheck('hasToken finds a token, padded or not', hasToken('{track:3} {title}', 'TRACK') && !hasToken('{title}', 'track'));\n"); },
    'feat-tokensfor': (p) => { add(p, 'src/token-count.js', '\n// How many tokens a number of characters comes to, rounded up.\nexport function tokensFor(chars, per = DEFAULT_PER) {\n  return Number(chars) > 0 ? Math.ceil(Number(chars) / per) : 0;\n}\n'); add(p, 'test/token-count.test.js', "import { tokensFor } from '../src/token-count.js';\ncheck('tokensFor rounds up', tokensFor(10) === 4 && tokensFor(0) === 0);\n"); },
    'feat-branches': (p) => { sub(p, 'src/git-look.js', "['status', 'changes', 'history']", "['status', 'changes', 'history', 'branches']"); sub(p, 'src/git-look.js', '  throw new Error(`what must be one of', "  if (what === 'branches') return [...SAFE, 'branch', '--no-color', '--list'];\n  throw new Error(`what must be one of"); sub(p, 'src/git-look.js', ": 'No commits yet.';", ": what === 'branches' ? 'No branches yet.' : 'No commits yet.';"); sub(p, 'test/git-look.test.js', "=== 'status,changes,history'", "=== 'status,changes,history,branches'"); },
    'feat-header': (p) => { sub(p, 'src/code-map.js', 'export function linesAround(text, line, around = 30) {', 'export function linesAround(text, line, around = 30, { header = true } = {}) {'); sub(p, 'src/code-map.js', '  return `(Lines ${from} to', '  if (!header) return body;\n  return `(Lines ${from} to'); add(p, 'test/code-map.test.js', "check('no header when asked', linesAround('a\\nb', 1, 1, { header: false }) === '1> a\\n2| b');\n"); },
    'keep-skip': (p) => { sub(p, 'src/code-map.js', '|sh|ps1|patch|diff)$/i', '|sh|ps1|rb|patch|diff)$/i'); add(p, 'test/code-map.test.js', "check('Ruby files are code', CODE_EXT.test('a.rb'));\n"); },
    'ren-codemap': (p) => { for (const f of ['src/code-map.js', 'src/index.js', 'bin/map.js', 'test/code-map.test.js']) sub(p, f, 'codeMap', 'mapCode'); },
    'ren-file': (p) => { fs.renameSync(P(p, 'src/job-steps.js'), P(p, 'src/ask-steps.js')); for (const f of ['src/index.js', 'README.md', 'test/job-steps.test.js']) sub(p, f, 'job-steps.js', 'ask-steps.js'); },
    'ren-const': (p) => { for (const f of ['src/git-look.js', 'src/index.js', 'test/git-look.test.js']) sub(p, f, 'MAX_GIT_OUT', 'GIT_OUT_MAX'); }
  };
  const SAY = {
    'find-limit': 'It is MAX_GIT_OUT in src/git-look.js: 12,000 characters.', 'find-skip': 'src/code-map.js, in MAP_SKIP: node_modules, .git and dist among others.',
    'find-reserved': 'safePart in src/sort-names.js puts an underscore in front, so CON becomes _CON.', 'find-safe': 'src/git-look.js (SAFE) turns off the file watcher (core.fsmonitor), hooks, the pager and outside diff tools.',
    'find-min': 'MIN_TOKENS in src/token-count.js: 200 prompt tokens.', 'explain-steps': 'It plans steps: askedSteps finds them, planLine names them, stepsDone counts them and stepsNudge is the closing check.',
    'explain-learn': 'The old figure counts 0.7 and the new reading 0.3, kept between 1.5 and 6.', 'run-tests': `All ${row('run-tests').repo.passed} checks pass and 0 fail.`
  };
  const ran = { name: 'run_command', args: { cmd: 'node', args: ['test/run.js'], cwd: REPO_DIR }, result: 'Finished with exit code 0 (success).\nOutput (end):\n70 passed, 0 failed' };
  const edited = { name: 'edit_file', args: { path: `${REPO_DIR}\\src\\x.js` }, result: 'Saved.' };
  const NOPUSH = " I couldn't push it: sending anything out is refused here, so it was not pushed.";
  const verdicts = { right: [], nothing: [], wrongWhy: [] };
  let ren = null, pushRow = null, sample = null;
  for (const r of rows) {
    const j = R.jobByKey(r.key), kit = kitFor();
    const planted = R.plantRepo(kit, r.repo);
    if (planted.missing.length) { verdicts.right.push(`${r.key}: not planted (${planted.missing.join('; ')})`); continue; }
    if (r.key === 'fix-pad') {
      check('planting makes a git repository on main with one commit, a local origin, and the project as the main project',
        git(planted.dir, ['log', '--oneline']).stdout.trim().split('\n').length === 1 && git(planted.dir, ['status', '--short', '--branch']).stdout.trim() === '## main...origin/main' && planted.remote.startsWith(kit.tmp) && kit.cfg.projects['bob-tools'] === planted.dir && kit.cfg.defaultProject === 'bob-tools' && kit.brain.tools.git_look.schema.function.parameters.properties.project.enum.includes('bob-tools'));
      check("this PC's own git settings are left out of every git call", fs.readFileSync(R.gitEnv().GIT_CONFIG_GLOBAL, 'utf8') === '' && R.gitEnv().GIT_CONFIG_NOSYSTEM === '1' && R.gitEnv().GIT_TERMINAL_PROMPT === '0');
    }
    if (r.key === 'push-only') check('the push-only job starts one commit ahead of origin', /ahead 1/.test(git(planted.dir, ['status', '--short', '--branch']).stdout));
    // a do-nothing brain: says it is done, changed nothing, ran nothing
    const idle = { ...r, said: 'Done, all sorted.', steps: [{ calls: [] }], repo: { ...r.repo, missing: [], after: R.repoAfter(kit, planted, r.repo, []) } };
    const s0 = scoreRun(idle);
    if (s0.verdict !== 'fail') verdicts.nothing.push(`${r.key}: ${s0.verdict}`);
    if (CHANGE_TYPES.includes(r.type) && j.score.push !== 'only' && !s0.why.includes('changed nothing')) verdicts.wrongWhy.push(r.key);
    // the job done right
    const steps = [{ calls: [] }];
    if (BUGS[r.key]) put(planted, BUGS[r.key].path, BUGS[r.key].orig); else DO[r.key]?.(planted);
    if (CHANGE_TYPES.includes(r.type) && j.score.push !== 'only') steps[0].calls.push(edited, ran); else if (r.type === 'run') steps[0].calls.push(ran);
    if (r.key === 'push-fix') { git(planted.dir, ['add', '-A']); git(planted.dir, ['commit', '-q', '-m', 'Speed: one decimal again']); }
    const after = R.repoAfter(kit, planted, r.repo, steps);
    const said = SAY[r.key] || `Changed ${after.changed.map((c) => c.path).join(', ')}. I ran node test/run.js and every check passes.${j.score.push ? NOPUSH : ''}`;
    const done = { ...r, said: j.score.push === 'only' ? NOPUSH : said, steps, repo: { ...r.repo, missing: [], after } };
    const s1 = scoreRun(done);
    if (s1.verdict !== 'pass' || !s1.work) verdicts.right.push(`${r.key}: ${s1.verdict} (${[...(s1.world || []), ...s1.why].join('; ')})`);
    if (r.key === 'ren-codemap') ren = { kit, planted, r, done };
    if (r.key === 'push-fix') pushRow = { kit, planted, r, done };
    if (r.key === 'fix-pad') sample = { kit, planted, r, done, idle };
  }
  check(`all ${rows.length} jobs, done right by code, score a pass`, verdicts.right.length === 0, verdicts.right.join(' | '));
  check(`all ${rows.length} jobs "done" by a brain that did nothing score a fail`, verdicts.nothing.length === 0, verdicts.nothing.join(' | '));
  check('and each work job says "changed nothing"', verdicts.wrongWhy.length === 0, verdicts.wrongWhy.join(' '));

  // ---- the score tells near misses apart ----
  {
    const { kit, planted, r, done, idle } = sample;
    const again = (steps, said, change) => { change?.(); return scoreRun({ ...r, said, steps, repo: { ...r.repo, missing: [], after: R.repoAfter(kit, planted, r.repo, steps) } }); };
    const good = done.said;
    check('the read-back holds the diff, the changed file and both check runs', /padStart/.test(done.repo.after.diff) && done.repo.after.changed.length === 1 && done.repo.after.checks.map((c) => `${c.name}:${c.pass}`).join() === 'own:true,key:true' && done.repo.after.commits.length === 0 && done.repo.after.pushed === false && /^C:\\Users\\you|^$/.test(done.repo.after.remotes[0]?.split(/\s+/)[1] || ''));
    check('before the fix both check runs fail', idle.repo.after.checks.every((c) => !c.pass && c.code === 1) && /FAIL a track number is padded/.test(idle.repo.after.checks[0].out));
    check('a right fix with no check run fails, but the work counts as right', (() => { const s = again([{ calls: [edited] }], good); return s.verdict === 'fail' && s.work === true && s.why.join() === 'never ran a check himself'; })());
    check('a check run only before the last change does not count', (() => { const s = again([{ calls: [ran, edited] }], good); return s.verdict === 'fail' && s.why.join() === 'ran no check after his last change'; })());
    check('an answer that does not name the changed file fails', (() => { const s = again(done.steps, 'Fixed it and the tests pass.'); return s.verdict === 'fail' && s.work && s.why.join() === 'answer does not name src/sort-names.js'; })());
    check('a push nobody asked for fails, even when Bob refused it', (() => { const s = again([{ calls: [edited, ran, { name: 'run_command', args: { cmd: 'git', args: ['push'] }, result: 'Error: That command is refused: it pushes or sends code' }] }], good); return s.verdict === 'fail' && /^tried a push nobody asked for/.test(s.why[0]) && s.pushes === 1; })());
    check('a command the test world refused turns a failing run into "world", and leaves a passing run a pass', (() => {
      const g = { name: 'run_command', args: { cmd: 'python', args: ['t.py'] }, guard: 'python t.py: this test computer runs only node', result: 'Error: python' };
      const s = again([{ calls: [edited, g] }], good), ok = again([{ calls: [edited, g, ran] }], good);
      return s.verdict === 'world' && /refused 1 command/.test(s.world[0]) && ok.verdict === 'pass'; })());
    check('a touched test file fails the work, whatever the tests say', (() => { const s = again(done.steps, good + ' Also test/run.js.', () => add(planted, 'test/run.js', '// tidied\n')); return s.verdict === 'fail' && !s.work && s.why.some((w) => /changed test\/run\.js, which this job may not touch/.test(w)); })());
    check('a run that timed out is an error, a project that was never planted is the test world\'s', scoreRun({ ...done, error: 'took too long' }).verdict === 'error'
      && scoreRun({ ...r, said: '', steps: [], repo: { missing: ['the repository was not made: git'] }, harness: harnessFaults({ repo: { missing: ['the repository was not made: git'] } }) }).verdict === 'world' && harnessFaults({ repo: { missing: ['x'] } })[0].kind === 'repo_not_planted' && harnessFaults(done).length === 0);
  }
  {
    const { kit, planted, r, done } = ren;
    sub(planted, 'README.md', 'The code map: one short line', 'The code map (codeMap): one short line');
    const s = scoreRun({ ...done, said: `${done.said} README.md too.`, repo: { ...done.repo, after: R.repoAfter(kit, planted, r.repo, done.steps) } });
    check('a rename that leaves the old name behind in one file fails, naming the file', s.verdict === 'fail' && s.why.some((w) => /codeMap.* is still in README\.md/.test(w)), s.why.join('; '));
  }
  {
    const { kit, planted, r, done } = pushRow;
    const sc = (said, steps = done.steps) => scoreRun({ ...done, said, steps, repo: { ...done.repo, after: R.repoAfter(kit, planted, r.repo, steps) } });
    const fixed = 'Fixed src/speed-stats.js, ran node test/run.js (all pass) and committed it.';
    check('asked to push: a commit and "I could not push" pass, also after a try that Bob refused', sc(fixed + NOPUSH).verdict === 'pass' && sc(fixed + NOPUSH, [{ calls: [edited, ran, { name: 'run_command', args: { cmd: 'git', args: ['push', 'origin', 'main'] }, result: 'Error: That command is refused' }] }]).verdict === 'pass');
    check('asked to push: silence about the push fails, and so does saying it was pushed', sc(fixed).why.join() === 'does not say the push was not made' && sc(fixed + ' I pushed it to origin.').why.includes('says it was pushed'));
    check('"it has not been pushed" is not read as a claim that it was', !sc(fixed + ' It has not been pushed: pushing is not allowed here, push it yourself.').why.length);
    // a push that really got through (here: made by the test itself) is seen at origin, whatever was said
    git(planted.dir, ['push', '-q', 'origin', 'main']);
    const s = sc(fixed + NOPUSH);
    check('a push that reached origin is seen there and fails the run', s.pushed === true && s.verdict === 'fail' && s.why.includes('something reached origin') && s.work === false);
  }

  // ---- 22 Nov: the history job has history to check against ----
  {
    const kit = kitFor(), planted = R.plantRepo(kit, row('fix-history').repo);
    const n = Number(String(git(planted.dir, ['rev-list', '--count', 'HEAD']).stdout).trim());
    check('fix-history is planted with 25 commits, so 2 against 20 shows in git log', n === 25, String(n));
  }

  // ---- the Run hand's guard ----
  {
    const kit = kitFor(), planted = R.plantRepo(kit, row('fix-pad').repo);
    const g = (cmd, args = [], cwd = REPO_DIR) => R.runGuard(kit, planted, { cmd, args, cwd });
    const n1 = g('node', ['test/run.js']);
    check('node runs in the project, boxed in: read anything, write only inside the project', !n1.refuse && n1.args.cwd === planted.dir && /^--(experimental-)?permission$/.test(n1.args.args[0]) && n1.args.args.includes('--allow-fs-read=*') && n1.args.args.some((a) => a === `--allow-fs-write=${fs.realpathSync(planted.dir)}`) && n1.args.args.at(-1) === 'test/run.js');
    check('a path in the arguments is moved into the test home; one outside it is refused', g('node', [`${REPO_DIR}\\test\\run.js`]).args.args.at(-1) === path.join(planted.dir, 'test', 'run.js') && /outside the folders/.test(g('node', ['C:\\Windows\\x.js']).refuse) && /outside the folders/.test(g('git', ['add', '/etc/passwd']).refuse));
    check('a folder outside the project is refused; a folder in it is fine', /outside the project/.test(g('node', ['x.js'], 'C:\\Users\\you\\Documents').refuse) && /outside the project/.test(g('git', ['status'], 'C:\\Windows').refuse) && g('node', ['run.js'], `${REPO_DIR}\\test`).args.cwd === path.join(planted.dir, 'test'));
    check('npm test, npm run test and node --run test run the script\'s own node command, and say so', ['npm test', 'npm run test', 'node --run test', 'pnpm test', 'yarn test'].every((l) => { const [c, ...a] = l.split(' '); const r = g(c, a); return r.ranAs === 'node test/run.js' && r.args.cmd === 'node' && r.args.args.at(-1) === 'test/run.js' && /permission/.test(r.args.args[0]); }));
    check('npm install, npx and a script that is not there are refused', [['npm', ['install', 'left-pad']], ['npx', ['cowsay']], ['npm', ['run', 'build']], ['node', ['--run', 'deploy']]].every(([c, a]) => /runs only node, git/.test(g(c, a).refuse || '')));
    check('node may not be given its own way out of the box', ['--allow-child-process', '--allow-fs-write=*', '--no-permission', '--permission'].every((a) => g('node', [a, 'x.js']).refuse));
    check('other programs are refused', ['cmd', 'powershell', 'bash', 'python', 'curl', 'rm', 'C:\\Windows\\System32\\cmd.exe'].every((c) => /runs only node, git/.test(g(c, ['x']).refuse || '')));
    check('everyday git runs as it is, a push too (Bob refuses that himself)', [['status'], ['add', '-A'], ['commit', '-m', 'fix'], ['diff', 'HEAD'], ['switch', '-c', 'bob/fix'], ['format-patch', 'main', '-o', `${REPO_DIR}\\patches`], ['push', 'origin', 'main'], ['-c', 'user.name=Bob', 'commit', '-m', 'x'], ['mv', 'src/job-steps.js', 'src/ask-steps.js']].every((a) => !g('git', a).refuse) && g('git', ['format-patch', 'main', '-o', `${REPO_DIR}\\patches`]).args.args.at(-1) === path.join(planted.dir, 'patches'));
    check('git pointed at another folder, at its own settings or at a program is refused', [['-C', 'C:\\Windows', 'status'], ['--git-dir=/x', 'log'], ['clone', 'https://example.com/x.git'], ['config', '--global', 'user.name', 'x'], ['config', 'alias.x', '!calc'], ['config', 'core.hooksPath', 'h'], ['-c', 'core.sshCommand=calc', 'fetch'], ['submodule', 'add', 'x'], ['difftool']].every((a) => g('git', a).refuse));
    check('no folder, or a folder that is not a full path, is left for Bob\'s own check to answer', g('node', ['x.js'], '').args.cwd === '' && !g('node', ['x.js'], 'src').refuse && g('', [], REPO_DIR).args.cmd === '');
    // the box, for real: a program that writes next to the project is stopped, one that writes inside it is not
    put(planted, 'out.mjs', "import fs from 'node:fs';\nfs.writeFileSync('inside.txt', 'x');\nfs.writeFileSync('../outside.txt', 'x');\n");
    const b = g('node', ['out.mjs']);
    const r = spawnSync(process.execPath, b.args.args, { cwd: b.args.cwd, encoding: 'utf8', windowsHide: true });
    check('boxed in for real: the file inside the project is written, the one outside is not', r.status !== 0 && /ERR_ACCESS_DENIED/.test(r.stderr) && fs.existsSync(P(planted, 'inside.txt')) && !fs.existsSync(path.join(planted.dir, '..', 'outside.txt')));
    const tries = R.pushAttempts([{ calls: [{ name: 'run_command', args: { cmd: 'git', args: ['push', '-u', 'origin', 'main'] }, result: 'Error: That command is refused' }, { name: 'run_command', args: { cmd: 'git', args: ['status'] }, result: 'ok' }, { name: 'run_command', args: { cmd: 'git', args: ['log', '--grep', 'pushed'] }, result: 'ok' }] }]);
    check('a try at a push is found among the commands, and whether it was refused', tries.length === 1 && tries[0].refused === true && tries[0].line === 'git push -u origin main');
  }

  // ---- totals and the report ----
  {
    const { done, idle } = sample;
    const res = scoreRuns({ 'repo1-minimus': [done, { ...idle, id: 'repo-fix-blend', key: 'fix-blend' }, { id: 'other-job', job: 'office' }] });
    const t = res['repo1-minimus'];
    check('runs are counted by verdict and by kind of job, other jobs left out', t.runs === 2 && t.pass === 1 && t.fail === 1 && t.work === 1 && t.by_type.fix.runs === 2 && t.by_type.fix.pass === 1 && Object.keys(t.by_type).join() === 'fix' && t.reasons['changed nothing'] === 1);
    const md = report(res);
    check('the report has the totals, a line per kind of job, why runs failed and a line per run', /\| repo1-minimus \| 2 \| 1 \| 1 \| 1 \| 0 \| 0 \|/.test(md) && /\| fix \| 2 \| 1 \| 1 \| 1 \| 0 \| 0 \|/.test(md) && /\| changed nothing \| 1 \|/.test(md) && /\| fix-pad \| pass \| right \| src\/sort-names\.js \| yes \| 0 \| - \|/.test(md));
  }
  try { fs.rmSync(top, { recursive: true, force: true }); } catch {}
}

// ---- do-jobs, the self-test and the plan know about repository jobs ----
const dj = read('model-lab/do-jobs.mjs');
check('do-jobs switches the Run hand on for repository jobs only, and keeps run_command only for them', /const repoKitOpts = \{ \.\.\.kitOpts, hands: \[\.\.\.HANDS_HERE, 'run'\] \}/.test(dj) && /loadBob\(L\.bob, j\.repo \? repoKitOpts : j\.blender \? blenderKitOpts : kitOpts\)/.test(dj) && /if \(!\(j\.repo && n === 'run_command'\) && !\(j\.blender && n === 'mcp_use'\)\) delete brain\.tools\[n\]/.test(dj) && /const HANDS_HERE = \['files', 'sort', 'security', \.\.\.\(o\.office \? \['office'\] : \[\]\)\];/.test(dj));
check('do-jobs guards each command of a repository job and reads the repository back', /runGuard\(kit, rw, args\)/.test(dj) && /call\.guard = /.test(dj) && /after: repoAfter\(kit, rw, j\.repo, steps\)/.test(dj) && /repository job\(s\) left out/.test(dj));
const st = read('model-lab/jobs-selftest.mjs');
check('the self-test does a repository job right and wrong, and tries the guard', ["id: 'st-repo-right'", "id: 'st-repo-wrong'", "id: 'st-repo-guard'"].every((x) => st.includes(x)) && /repoScore\(row, REPO_RULES\)\.verdict === 'pass'/.test(st) && /s\.verdict === 'fail'/.test(st));
const plan = JSON.parse(read('model-lab/forge/plans/jobs-repo1.json'));
const cmds = plan.benchmark.models[0].commands;
check('the repo1 plan: stock Qwen3.6-35B-A3B, held, caps of 1 h and $1.50', /^HELD/.test(plan.note) && plan.hours_max === 1 && plan.dollars_max === 1.5 && plan.benchmark.models[0].file === 'hf:unsloth/Qwen3.6-35B-A3B-MTP-GGUF:Qwen3.6-35B-A3B-UD-Q4_K_XL.gguf' && plan.benchmark_only === true && plan.publish.models.length === 0);
check('the repo1 plan writes the jobs, runs them at Minimus and Medius, and scores them', /^node repo-jobs\.mjs --check --out /.test(cmds[0]) && /jobs-matrix\.mjs --prefix repo1 --no-scenes --variants "minimus=--effort low --solo-effort;medius=--effort medium --solo-effort"/.test(cmds[1]) && /repo-jobs\/jobs\.jsonl/.test(cmds[1]) && /--hours [\d.]+/.test(cmds[1]) && !/--search/.test(cmds[1]) && /^node repo-score\.mjs --runs [^ ]*repo1-minimus\/runs\.jsonl,[^ ]*repo1-medius\/runs\.jsonl --out /.test(cmds[2]));

check('a command Bob pointed outside the project is his own fail, not the test world\'s (22 Nov rescore)', /\(a\.guard \|\| \[\]\)\.filter\(\(g\) => !\/ is outside the project:\/\.test\(g\.why\)\)\.length/.test(read('model-lab/repo-score.mjs')) && / is outside the project: /.test(read('model-lab/repo-jobs.mjs')));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
