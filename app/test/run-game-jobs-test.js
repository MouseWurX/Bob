// 23 Nov 2026 (the owner: "could we have each version produce a game that we can try? same prompt? same seed ... same
// settings", then two games in Godot): the game jobs (model-lab/game-jobs.mjs), the checker (godot-check.mjs) and do-jobs
// running one end to end. A fake brain builds a small game with Bob's own file tools, with a bug in it; a stand-in Godot
// (no Godot runs here) reports the bug; Bob is sent the checker's words exactly, fixes it, and the game passes. The seed
// of the job goes with every request, and the game is kept for the owner to play.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const G = await imp('model-lab/game-jobs.mjs');
const C = await imp('model-lab/godot-check.mjs');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'game jobs '));

// ---- the jobs ----
const rows = G.gameJobs();
check('two games, three seeds each, held-out rows with one prompt per game', rows.length === 6 && rows.every((r) => r.job === 'game' && r.held === true && /^game-(emberfall|lantern-run)-s[123]$/.test(r.id) && r.text === G.jobByKey(r.key).text) && new Set(rows.map((r) => r.seed)).size === 3);
check('the rows carry no checks (Bob never sees them)', rows.every((r) => !('check' in r)));
const fighter = G.jobByKey('emberfall').text, runner = G.jobByKey('lantern-run').text;
check('each prompt holds the owner\'s rules: the McGuffin, the moves, lives or rounds, game over and restart, Godot, keyboard and controller', /Ember Crown/.test(fighter) && /Best of 3 rounds/.test(fighter) && /super move/.test(fighter) && /Last Lantern/.test(runner) && /3 lives/.test(runner) && /boss fight/.test(runner) && [fighter, runner].every((t) => /Godot 4\.7/.test(t) && /game controller/.test(t) && /restart/.test(t) && /project\.godot/.test(t) && /original/.test(t)));

// ---- the checker's parts ----
check('the helper goes in as an autoload, an existing [autoload] section kept', /\[autoload\]\n\nBobCheck="\*res:\/\/_bob_check\.gd"\n$/.test(C.withHelper('config_version=5\r\n\r\n[application]\r\nrun/main_scene="res://m.tscn"\r\n')) && /\[autoload\]\n\nBobCheck=.*\nHud=/.test(C.withHelper('[autoload]\n\nHud="*res://hud.gd"\n')));
const out = 'Godot Engine v4.7.2\nSCRIPT ERROR: Parse Error: Identifier "speeed" not declared in the current scope.\n   at: GDScript::reload (res://player.gd:12)\nERROR: Failed to load script "res://player.gd" with error "Parse error".\nERROR: Condition "!audio" is true. AudioDriver failed\nSCRIPT ERROR: Parse Error: Identifier "speeed" not declared in the current scope.\n   at: GDScript::reload (res://player.gd:12)\nBOBCHECK {"main_scene":"res://main.tscn","current_scene":"res://main.tscn","nodes":{"Camera2D":1},"text":["Score: 0"],"moved":0}\n';
const errs = C.errorLines(out);
check('Godot\'s error lines are read once each, with where, and the headless machine\'s own left out', errs.length === 2 && errs[0] === 'SCRIPT ERROR: Parse Error: Identifier "speeed" not declared in the current scope. (GDScript::reload (res://player.gd:12))' && /Failed to load script/.test(errs[1]));
const facts = C.readFacts(out);
const common = C.commonProblems({ ran: true, errors: errs, facts });
check('a game that errors and answers no key gets both said plainly', common.some((p) => p.startsWith('Godot reported: SCRIPT ERROR')) && common.some((p) => /moved nothing/.test(p)));
check('no project.godot is said in words Bob can act on', C.commonProblems({ ran: false, why: 'There is no project.godot in the game folder, so Godot cannot open it as a project.' })[0].includes('project.godot'));
const lr = G.jobByKey('lantern-run').check({ nodes: { CharacterBody2D: 3, Camera2D: 1 }, text: ['Score: 0', 'Lives: 3'] });
const lrBad = G.jobByKey('lantern-run').check({ nodes: { Node2D: 1 }, text: [] });
const ef = G.jobByKey('emberfall').check({ nodes: { Camera3D: 1, MeshInstance3D: 6, CharacterBody3D: 2, ProgressBar: 2 }, text: ['Round 1', '60'] });
const efBad = G.jobByKey('emberfall').check({ nodes: { Camera2D: 1 }, text: ['Score 0'] });
check('each game\'s own checks pass a game that has it and name what one is missing', !lr.length && !ef.length && lrBad.length === 5 && efBad.length === 5 && efBad.some((p) => /Camera3D/.test(p)) && lrBad.some((p) => /Lives/.test(p)));

// ---- do-jobs, end to end ----
const fakeGodot = path.join(tmp, 'fake-godot.mjs');
fs.writeFileSync(fakeGodot, `import fs from 'node:fs'; import path from 'node:path';
const a = process.argv.slice(2); const dir = a[a.indexOf('--path') + 1];
if (a.includes('--import')) process.exit(0);
const ok = /fixed/.test(fs.readFileSync(path.join(dir, 'player.gd'), 'utf8')) && fs.existsSync(path.join(dir, '_bob_check.gd')) && /BobCheck=/.test(fs.readFileSync(path.join(dir, 'project.godot'), 'utf8'));
if (!ok) console.log('SCRIPT ERROR: Parse Error: Identifier "speeed" not declared in the current scope.\\n   at: GDScript::reload (res://player.gd:3)');
console.log('BOBCHECK ' + JSON.stringify({ main_scene: 'res://main.tscn', current_scene: 'res://main.tscn', nodes: { CharacterBody2D: 3, Camera2D: 1, Label: 2 }, text: ['Score: 0', 'Lives: 3'], moved: ok ? 120 : 0 }));
`);
const seeds = [], nudges = [];
const call = (name, args) => ({ choices: [{ message: { role: 'assistant', content: '', tool_calls: [{ id: `c${Math.random()}`, type: 'function', function: { name, arguments: JSON.stringify(args) } }] } }], usage: { completion_tokens: 12, prompt_tokens: 900 } });
const say = (t) => ({ choices: [{ message: { role: 'assistant', content: t } }], usage: { completion_tokens: 5, prompt_tokens: 950 } });
const D = 'C:\\Users\\you\\Documents\\Games\\LanternRun';
const srv = http.createServer((req, res) => {
  if (req.url.startsWith('/props')) { res.end(JSON.stringify({ chat_template: '' })); return; }
  let b = ''; req.on('data', (d) => (b += d)); req.on('end', () => {
    const j = JSON.parse(b || '{}'); const msgs = j.messages || []; const names = (j.tools || []).map((t) => t.function?.name);
    seeds.push(j.seed);
    const users = msgs.filter((m) => m.role === 'user').map((m) => String(m.content));
    const lastUser = users.at(-1) || '';
    const tools = msgs.slice(msgs.findLastIndex((m) => m.role === 'user')).filter((m) => m.role === 'tool').map((m) => String(m.content));
    let out;
    if (!/Lantern Run/.test(users[0] || '')) out = say('OK.');
    else if (/check found these problems/.test(lastUser)) {
      if (!nudges.includes(lastUser)) nudges.push(lastUser);
      out = tools.length ? say('Fixed the typo; it runs now.') : call('write_file', { path: `${D}\\player.gd`, content: 'extends CharacterBody2D\n# fixed\nvar speed = 200\n' });
    } else if (!names.includes('write_file')) out = call('use_tools', { group: 'files' });
    else if (tools.length < 3) out = call('write_file', [{ path: `${D}\\project.godot`, content: 'config_version=5\n\n[application]\n\nrun/main_scene="res://main.tscn"\n' }, { path: `${D}\\main.tscn`, content: '[gd_scene format=3]\n\n[node name="Main" type="Node2D"]\n' }, { path: `${D}\\player.gd`, content: 'extends CharacterBody2D\nvar speed = 200\nfunc _ready(): print(speeed)\n' }][tools.length]);
    else out = say('Lantern Run is ready: open the folder in Godot and press F5.');
    res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(out));
  });
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}`;
const jobsFile = path.join(tmp, 'games.jsonl');
fs.writeFileSync(jobsFile, JSON.stringify(G.gameJobs({ seeds: [7] }).find((r) => r.key === 'lantern-run')) + '\n');
const run = (extra) => new Promise((ok) => {
  const ch = spawn(process.execPath, ['do-jobs.mjs', '--url', url, '--bob', app, '--out', tmp, '--dir', 'games-run', '--jobs', jobsFile, '--parallel', '1', ...extra], { cwd: path.join(app, 'model-lab'), env: { ...process.env, LAB_API_KEY: 'k', LAB_URL: '', LAB_TAVILY_KEY: '' } });
  let log = ''; ch.stdout.on('data', (d) => (log += d)); ch.stderr.on('data', (d) => (log += d));
  const t = setTimeout(() => { ch.kill(); ok({ code: -1, log }); }, 180000); ch.on('exit', (code) => { clearTimeout(t); ok({ code, log }); });
});
const pf = await run(['--preflight']);
check('without --godot the game jobs are left out, never run as Bob failing', pf.code === 0 && /1 game job\(s\) left out: they need --godot/.test(pf.log), pf.log.slice(-300));
const r = await run(['--godot', fakeGodot, '--effort', 'low']);
srv.close();
let row = null; try { row = JSON.parse(fs.readFileSync(path.join(tmp, 'games-run', 'runs.jsonl'), 'utf8').trim().split('\n')[0]); } catch {}
const g = row?.game;
check('the game is checked after the build: the Godot error and "moved nothing" found', g?.checks?.[0]?.after === 'build' && g.checks[0].problems.some((p) => p.includes('Identifier "speeed" not declared')) && g.checks[0].problems.some((p) => /moved nothing/.test(p)), JSON.stringify(g?.checks?.[0] || r.log.slice(-600)));
check('Bob is sent the checker\'s problems word for word, once', nudges.length === 1 && g?.checks?.[0]?.problems.every((p) => nudges[0].includes(p)), nudges.join(' | '));
check('after his fix the game passes: one nudge, passed', g?.checks?.length === 2 && g.checks[1].after === 'nudge 1' && g.checks[1].problems.length === 0 && g.nudges === 1 && g.passed === true, JSON.stringify(g || {}).slice(0, 400));
check('every request carries the job\'s seed', seeds.length > 3 && seeds.every((s) => s === 7) && row?.seed === 7, JSON.stringify(seeds));
const kept = path.join(tmp, 'games-run', g?.kept || 'none');
check('the game Bob made is kept for the owner to play (his files, not the checker\'s)', g?.files === 3 && fs.existsSync(path.join(kept, 'project.godot')) && /fixed/.test(fs.readFileSync(path.join(kept, 'player.gd'), 'utf8')) && !fs.existsSync(path.join(kept, '_bob_check.gd')));
check('nothing the brain saw names the real folder', !JSON.stringify(row?.messages || []).includes(tmp) && !JSON.stringify(g || {}).includes(tmp));

// ---- blind labels ----
const B = await imp('model-lab/game-blind.mjs');
const fakeRuns = (lab, n) => { const d = path.join(tmp, `runs-${lab}`); fs.mkdirSync(path.join(d, 'games', 'x'), { recursive: true }); fs.writeFileSync(path.join(d, 'games', 'x', 'project.godot'), 'config_version=5\n'); fs.writeFileSync(path.join(d, 'runs.jsonl'), Array.from({ length: n }, (_, i) => JSON.stringify({ id: `game-${i % 2 ? 'emberfall' : 'lantern-run'}-s${i}`, key: i % 2 ? 'emberfall' : 'lantern-run', seed: i, secs: 600, game: { kept: 'games/x', files: 1, passed: i === 0, nudges: 1, checks: [{ problems: i ? ['The score is not on screen (no "Score" label).'] : [] }] } })).join('\n') + '\n'); return d; };
const bo = path.join(tmp, 'blind');
const key = B.blind({ q2: fakeRuns('q2', 2), q4: fakeRuns('q4', 2) }, { out: bo, godot: 'C:\\Godot\\godot.exe', seed: 3 });
const names = fs.readdirSync(bo).sort();
check('blind labels: each game a letter, nothing in its name or folder says which brain made it; the key is apart', key.length === 4 && names.includes('Emberfall A') && names.includes('Emberfall B') && names.includes('Lantern Run A') && names.includes('Lantern Run B') && names.includes('WHO MADE WHICH - open after playing.json') && !names.some((n) => /q2|q4/i.test(n)) && ['Emberfall A', 'Lantern Run B'].every((n) => !/q2|q4/i.test(fs.readFileSync(path.join(bo, n, 'checker.txt'), 'utf8') + fs.readFileSync(path.join(bo, n, 'Play.cmd'), 'utf8'))), names.join(','));
check('each has a Play.cmd that opens it in Godot and the checker\'s last word', /"C:\\Godot\\godot\.exe" --path \./.test(fs.readFileSync(path.join(bo, 'Emberfall A', 'Play.cmd'), 'utf8')) && /Nudges used: 1/.test(fs.readFileSync(path.join(bo, 'Emberfall A', 'checker.txt'), 'utf8')));
const again = path.join(tmp, 'blind2'); const key2 = B.blind({ q2: path.join(tmp, 'runs-q2'), q4: path.join(tmp, 'runs-q4') }, { out: again, seed: 3 });
check('the same seed gives the same letters', JSON.stringify(key.map((k) => [k.game, k.brain, k.seed])) === JSON.stringify(key2.map((k) => [k.game, k.brain, k.seed])));

// ---- the three plans ----
const plans = ['q2', 'iq3', 'q4'].map((t) => JSON.parse(read(`model-lab/forge/plans/games-flashnext-${t}.json`)));
const cmdOf = (p) => p.benchmark.models[0].commands.find((c) => /do-jobs\.mjs/.test(c));
check('the three sizes run the same game command but the folder (same jobs, settings, Godot, nudges)', new Set(plans.map((p) => cmdOf(p).replace(/--dir g\w+-games/, ''))).size === 1 && /--godot \S+Godot_v4\.7\.2-stable_win64_console\.exe/.test(cmdOf(plans[0])) && /--nudges 3 --game-minutes 30 --nudge-minutes 10/.test(cmdOf(plans[0])) && /--effort medium/.test(cmdOf(plans[0])));
check('only the file differs between the sizes; nothing is uploaded; caps set', new Set(plans.map((p) => p.benchmark.models[0].file)).size === 3 && plans.every((p) => p.benchmark_only === true && p.publish.models.length === 0 && p.hours_max <= 2.5 && p.dollars_max <= 12 && p.rent_minutes > 0));

// ---- wiring ----
const dj = read('model-lab/do-jobs.mjs');
check('do-jobs: a game job\'s folder is one of Bob\'s projects, and the nudges and minutes can be set', /kit\.cfg\.projects = \{ \.\.\.\(kit\.cfg\.projects \|\| \{\}\), \[path\.basename\(d\)\]: d \}/.test(dj) && /o\.nudges === undefined \? 3/.test(dj) && /o\['game-minutes'\] \?\? 30/.test(dj) && /o\['nudge-minutes'\] \?\? 10/.test(dj));
const gd = read('model-lab/godot-check.gd');
check('the helper presses start, then the game\'s own actions and keys, reads the screen and quits', /Input\.action_press\("ui_accept"\)/.test(gd) && /InputMap\.get_actions\(\)/.test(gd) && /print\("BOBCHECK " \+ JSON\.stringify\(out\)\)/.test(gd) && /get_tree\(\)\.quit\(\)/.test(gd));

if (process.env.KEEP_TMP) console.log(tmp); else fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
