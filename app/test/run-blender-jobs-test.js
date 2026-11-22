// 22 Nov 2026: the held-out Blender jobs (model-lab/blender-jobs.mjs). The scenes in test/fixtures/blender-scenes.json
// were made in a real Blender (5.2, its Python module) by blender-jobs.mjs's own setups: each job as set up, done the
// plain right way, and for most a planted wrong way (changing a shared material, deleting by a looser name, the array's
// default spacing, a camera that doesn't look, parenting that moves things). The checks must fail the scene as set up,
// pass the right one and fail the wrong one; the score (blender-score.mjs) reads runs the same way; the test Blender
// (blender-world.mjs) offers the two tools a person's Blender add-on does; do-jobs wires it in. No Blender runs here.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (f) => import(pathToFileURL(path.join(app, f)).href);
const J = await imp('model-lab/blender-jobs.mjs');
const { scoreRun, scoreRuns, report } = await imp('model-lab/blender-score.mjs');
const { TOOLS } = await imp('model-lab/blender-world.mjs');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const FX = JSON.parse(read('test/fixtures/blender-scenes.json'));

const rows = J.blenderJobs();
check('every Blender job is a row do-jobs reads, held-out, with its own setup', rows.length >= 12 && rows.every((r) => r.id === `blender-${r.key}` && r.job === 'blender' && r.held === true && /bpy/.test(r.blender.setup)) && new Set(rows.map((r) => r.key)).size === rows.length);
check('the rows carry no answer and no checks (Bob never sees them)', rows.every((r) => !('answer' in r) && !('check' in r) && !JSON.stringify(r).includes('answer')));
check('every job has a scene made in a real Blender', J.BLENDER_JOBS.every((j) => FX[j.key]?.before?.objects && FX[j.key]?.right?.objects));

const asSet = J.BLENDER_JOBS.filter((j) => j.type !== 'question').filter((j) => !j.check(FX[j.key].before, FX[j.key].before).length).map((j) => j.key);
check('the scene as set up fails every job that asks for a change', asSet.length === 0, asSet.join(', '));
const right = J.BLENDER_JOBS.filter((j) => j.check(FX[j.key].right, FX[j.key].before).length).map((j) => `${j.key}: ${j.check(FX[j.key].right, FX[j.key].before).join('; ')}`);
check('the plain right way passes every job', right.length === 0, right.join(' | '));
const wrongs = Object.keys(FX).filter((k) => FX[k].wrong);
const missed = wrongs.filter((k) => !J.jobByKey(k).check(FX[k].wrong, FX[k].before).length);
check(`each planted wrong way fails (${wrongs.length}: ${wrongs.join(', ')})`, wrongs.length >= 6 && missed.length === 0, missed.join(', '));
const why = (k) => J.jobByKey(k).check(FX[k].wrong, FX[k].before).join('; ');
check('the reasons name what went wrong', /Grey material/.test(why('b-material')) && /temple_gate/.test(why('b-cleanup')) && /not 9\.1 m/.test(why('b-array')) && /does not look at the statue/.test(why('b-camera')) && /moved/.test(why('b-parent')) && /ends at frame 250/.test(why('b-animate')));

// ---- the score, from rows as do-jobs writes them ----
const row = (k, after, said = 'Done.', calls = 2) => ({ id: `blender-${k}`, job: 'blender', key: k, said, steps: [{ calls: Array.from({ length: calls }, () => ({ name: 'mcp_use', args: { app: 'Blender', tool: 'execute_blender_code' }, result: 'Done (nothing printed).' })) }], blender: { before: FX[k].before, after } });
const good = J.BLENDER_JOBS.map((j) => scoreRun(row(j.key, FX[j.key].right, j.key === 'b-count' ? '8 objects use Brass: the seven knobs and Hinge_Mixed.' : 'Done.')));
check('every job done right scores pass', good.every((s) => s.verdict === 'pass'), good.filter((s) => s.verdict !== 'pass').map((s) => `${s.key}: ${s.why.join('; ')}`).join(' | '));
check('the question job also needs the right number in the answer', scoreRun(row('b-count', FX['b-count'].right, 'There are 7.')).verdict === 'fail');
check('a run that never used Blender fails, saying so', (() => { const s = scoreRun({ id: 'blender-b-table', key: 'b-table', said: 'I made a table.', steps: [], blender: { missing: 'Blender was never started (no scene written)' } }); return s.verdict === 'fail' && s.why[0] === 'never used Blender'; })());
check('a test Blender with no starting scene is the world\'s, never a fail', scoreRun({ id: 'blender-b-table', key: 'b-table', steps: [], blender: { before: {}, after: FX['b-table'].right } }).verdict === 'world');
const res = scoreRuns({ held: [...J.BLENDER_JOBS.map((j) => row(j.key, FX[j.key].right, j.key === 'b-count' ? 'Eight.' : 'Done.')), row('b-material', FX['b-material'].wrong)] });
check('the report adds them up, with Blender calls counted', res.held.runs === 13 && res.held.pass === 12 && res.held.fail === 1 && res.held.blender_calls === 26 && /\| held \| 13 \| 12 \| 1 \|/.test(report(res)));

// ---- the test Blender and do-jobs ----
check('the test Blender offers the add-on\'s two working tools, the scene one marked read-only', TOOLS.map((t) => t.name).join(',') === 'get_scene_info,execute_blender_code' && TOOLS[0].annotations?.readOnlyHint === true && TOOLS[1].inputSchema.required[0] === 'code');
const w = read('model-lab/blender-world.mjs'), br = read('model-lab/blender-bridge.py'), dj = read('model-lab/do-jobs.mjs');
check('it writes the scene as set up once and as it is after every call', /before \?\?= now; fs\.writeFileSync\(o\.dump, JSON\.stringify\(\{ before, after: now \}\)\)/.test(w) && /await save\(\);\n\s+send\(/.test(w));
check('the bridge reads the scene with its modifiers, after an update', /evaluated_get\(bpy\.context\.evaluated_depsgraph_get\(\)\)/.test(br) && /bpy\.context\.view_layer\.update\(\)/.test(br));
check('do-jobs gives a Blender job the MCP hand and its own test Blender, and leaves the jobs out without --blender-python', /const blenderKitOpts = \{ \.\.\.kitOpts, hands: \[\.\.\.HANDS_HERE, 'mcp'\] \};/.test(dj) && /!\(j\.blender && n === 'mcp_use'\)/.test(dj) && /const bw = j\.blender \? fitBlender\(kit, j\.blender\) : null;/.test(dj) && /blender: await blenderAfter\(bw\)/.test(dj) && /Blender job\(s\) left out: they need --blender-python/.test(dj) && /const id = `blender-\$\{process\.pid\}-\$\{\+\+blenderN\}`;/.test(dj));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
