// Lab steps and runs (14 Nov 2026, docs/LAB-STEPS-PLAN.md): the step list's rules, the run record, smoke-first with
// the gate, never-train tags, the data index and lineage. Everything runs in a temp folder with fakes: no card, no
// engine, no key store, no real folders.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { STEPS, STAGES, KINDS, GATE_EXIT, stepById, stepsView, smokeReady, trainingSteps } from '../src/lab-steps.js';
import { startRun, smokeDone, finishRun, runWithSmoke, checkStart, isNeverTrain, readIndex, listRuns, lineage, contentId, dropSecrets, readRun, NEVER_TRAIN_FILE } from '../src/lab-runs.js';

let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${more ? ` ${more}` : ''}`); } };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');

// ---- the step list ----
const stageIds = STAGES.map(([id]) => id);
check('every step id is unique', new Set(STEPS.map((s) => s.id)).size === STEPS.length);
check('every step sits in a protocol stage', STEPS.every((s) => stageIds.includes(s.stage)));
check('steps are listed in protocol order', STEPS.every((s, i) => i === 0 || stageIds.indexOf(s.stage) >= stageIds.indexOf(STEPS[i - 1].stage)));
check('names are short (30 characters at most)', STEPS.every((s) => s.name.length <= 30), STEPS.filter((s) => s.name.length > 30).map((s) => s.name).join(', '));
check('every (i) text is one short plain sentence', STEPS.every((s) => s.plain.length <= 70 && /\.$/.test(s.plain) && s.plain.split(/\. /).length === 1), STEPS.filter((s) => s.plain.length > 70).map((s) => s.id).join(', '));
check('takes and makes use known kinds', STEPS.every((s) => [...s.takes, ...s.makes].every((k) => KINDS.includes(k))));
check('where is here, rented or both', STEPS.every((s) => ['here', 'rented', 'both'].includes(s.where)));
check('every rented step needs the owner\'s go to rent', STEPS.filter((s) => s.where === 'rented').every((s) => s.needsGo.includes('rent')));
check('publishing needs the owner\'s go to upload', stepById('publish').needsGo.includes('upload'));
check('baking dials needs the owner\'s go to bake', stepById('weight-editing').needsGo.includes('bake'));
check('surgery, steering, sweeps and harm evals never train', ['harm-eval', 'activation-steering', 'ablation-sweep', 'activation-patching', 'sae-features', 'abliteration', 'inference-sweep'].every((id) => stepById(id).neverTrain));
check('no training step is itself never-train', trainingSteps().every((s) => !s.neverTrain));
check('a rented step without a smoke test can\'t start on a card', !smokeReady({ where: 'rented', smoke: { how: 'todo' } }) && !smokeReady({ where: 'both', smoke: null }) && smokeReady({ where: 'here', smoke: null }));
check('the steering and sweep steps use their script\'s own gate', ['activation-steering', 'ablation-sweep'].every((id) => stepById(id).smoke.how === 'gate' && stepById(id).smoke.args.includes('--gate')));
check('training steps smoke-test with the pod self-test', ['full-fine-tune', 'lora', 'distillation', 'on-policy-grpo', 'model-merging'].every((id) => stepById(id).smoke.how === 'selftest'));
check('the gate exit code is 86, as the scripts use', GATE_EXIT === 86);
check('the three protocol tools map to steps', ['clean', 'pairs', 'sweep'].every((t) => STEPS.some((s) => s.protocol === t)));

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob lab steps-')); // a space in the path on purpose
const dir = path.join(tmp, 'model-lab'); fs.mkdirSync(dir); fs.writeFileSync(path.join(dir, 'clean-lessons.mjs'), '');
const view = stepsView(dir);
check('a step whose script is here is ready', view.find((s) => s.id === 'dataset-cleaning').ready);
check('a step whose script isn\'t here says so in words', /isn't in this copy's model-lab folder/.test(view.find((s) => s.id === 'preference-pairs').why));
check('a planned step says it is planned', view.find((s) => s.id === 'activation-patching').why === 'Planned, not built yet.');
check('with no model-lab folder, steps say Bob can\'t find it', /can't find the model-lab/.test(stepsView('').find((s) => s.id === 'pii-scrub').why));

// ---- runs ----
const lab = path.join(tmp, 'lab');
const set = path.join(tmp, 'lessons', 'mine'); fs.mkdirSync(set, { recursive: true }); fs.writeFileSync(path.join(set, 'lessons.jsonl'), '{"a":1}\n');
check('content ids are stable and change with the content', contentId(set) === contentId(set) && (() => { const a = contentId(set); fs.appendFileSync(path.join(set, 'lessons.jsonl'), '{"a":2}\n'); return contentId(set) !== a; })());

const fakeHf = ['hf', 'abc'.repeat(10)].join('_'), fakeSk = ['sk', 'abc'.repeat(8)].join('-'); // built in pieces so the public check never sees a key shape
const secret = { tool: 'clean', hfToken: fakeHf, nested: { RUNPOD_API_KEY: 'x', note: fakeHf, ok: 'fine' }, list: [fakeSk] };
const clean = dropSecrets(secret);
check('keys and tokens are left out of a run\'s settings, by name and by shape', !JSON.stringify(clean).includes(fakeHf) && !JSON.stringify(clean).includes(fakeSk) && !('hfToken' in clean) && !('RUNPOD_API_KEY' in clean.nested) && clean.nested.ok === 'fine' && clean.tool === 'clean');

const r1 = startRun(lab, { step: 'dataset-cleaning', settings: secret, inputs: [{ kind: 'lessons', path: set }], bob: '1.5.0', now: Date.UTC(2026, 10, 14) });
check('a free step with no smoke test starts running', r1.state === 'running' && r1.smoke === null);
check('the record on disk holds no key', !fs.readFileSync(path.join(lab, 'runs', r1.id, 'run.json'), 'utf8').includes(fakeHf));
const out1 = path.join(tmp, 'lessons', 'mine-clean'); fs.mkdirSync(out1); fs.writeFileSync(path.join(out1, 'lessons.jsonl'), '{"a":1}\n');
const f1 = finishRun(lab, r1.id, { outputs: [{ kind: 'lessons', path: out1 }] });
check('a finished run lists its output by hash', f1.state === 'done' && f1.outputs[0].id.startsWith('sha256:') && f1.ended);
check('the output is in the index with its parent', readIndex(lab).items.some((x) => x.path === out1 && x.parents[0] === r1.inputs[0].id));
check('a clean output is not never-train', !isNeverTrain(lab, out1) && !fs.existsSync(path.join(out1, NEVER_TRAIN_FILE)));

// smoke first, and the gate
const rs = startRun(lab, { step: 'activation-steering', inputs: [{ kind: 'brain', path: set }] });
check('a step with a smoke test starts at the smoke test', rs.state === 'smoke' && rs.smoke.how === 'gate');
let gated = null, mainRan = false;
const g = await runWithSmoke(lab, rs, { smoke: async () => GATE_EXIT, main: async () => { mainRan = true; return { code: 0 }; }, onGated: async (r) => { gated = r.id; } });
check('a gate stop ends the run before the real step', g.state === 'gated' && !mainRan && /can't do its job here/.test(g.message));
check('a gate stop calls the card stop with that run', gated === rs.id);
const rs2 = startRun(lab, { step: 'ablation-sweep', inputs: [] });
const sweepOut = path.join(tmp, 'sweep'); fs.mkdirSync(sweepOut);
const g2 = await runWithSmoke(lab, rs2, { smoke: async () => 0, main: async () => { fs.writeFileSync(path.join(sweepOut, 'report.md'), 'x'); return { code: 0, outputs: [{ kind: 'report', path: sweepOut }], scores: { harsh: 0.1 } }; } });
check('a passed smoke test goes on to the real step', g2.state === 'done' && readRun(lab, rs2.id).smoke.ok === true && g2.scores.harsh === 0.1);
check('a never-train step\'s output gets a NEVER-TRAIN file and tag', fs.existsSync(path.join(sweepOut, NEVER_TRAIN_FILE)) && isNeverTrain(lab, sweepOut) && readIndex(lab).items.find((x) => x.path === sweepOut).neverTrain);
const failed = await runWithSmoke(lab, startRun(lab, { step: 'dataset-cleaning' }), { smoke: async () => 0, main: async () => ({ code: 3 }) });
check('a step that fails says so with its exit code', failed.state === 'failed' && /exit 3/.test(failed.message) && failed.outputs.length === 0);
check('a smoke failure that isn\'t the gate says so', smokeDone(lab, startRun(lab, { step: 'lora' }).id, { code: 1 }).message.includes('exit 1'));

// never-train can't be taught, and the tag follows copies and children
check('a training step refuses a never-train input', checkStart(lab, 'lora', [{ kind: 'lessons', path: sweepOut }]).some((p) => /never-train/.test(p)));
check('a training step takes a clean input', checkStart(lab, 'lora', [{ kind: 'lessons', path: out1 }]).length === 0);
check('a study step may read never-train data', checkStart(lab, 'harm-eval', [{ kind: 'report', path: sweepOut }]).length === 0);
const copy = path.join(tmp, 'copied'); fs.cpSync(sweepOut, copy, { recursive: true });
check('a copy made outside the Lab keeps the tag', isNeverTrain(lab, copy));
const child = startRun(lab, { step: 'pii-scrub', inputs: [{ kind: 'lessons', path: sweepOut }] });
const childOut = path.join(tmp, 'child'); fs.mkdirSync(childOut); fs.writeFileSync(path.join(childOut, 'x.jsonl'), '1');
finishRun(lab, child.id, { outputs: [{ kind: 'lessons', path: childOut }] });
check('data made from never-train data is never-train too', isNeverTrain(lab, childOut) && checkStart(lab, 'distillation', [{ kind: 'lessons', path: childOut }]).length > 0);
check('a missing input is refused in words', checkStart(lab, 'pii-scrub', [{ kind: 'lessons', path: path.join(tmp, 'gone') }]).some((p) => /isn't there any more/.test(p)));

// listing and lineage
check('runs list newest first', listRuns(lab).length >= 5 && listRuns(lab).every((r, i, a) => i === 0 || String(a[i - 1].started) >= String(r.started)));
const childId = readIndex(lab).items.find((x) => x.path === childOut).id;
const tree = lineage(lab, childId);
check('lineage walks back through parents', tree[0].id === childId && tree.some((x) => x.path === sweepOut && x.depth === 1));

// ---- wiring and words ----
check('the routes are read-only GETs and hide paths from other devices', /GET' && p === '\/api\/lab\/steps'/.test(read('src/lab-routes.js')) && /GET' && p === '\/api\/lab\/runs'[^\n]*isLocal \? runs :[^\n]*path: _p/.test(read('src/lab-routes.js')));
check('Try it first passes the vector as FILE:SCALE (the form b12282 takes)', /`\$\{path\.join\(dir, 'direction\.gguf'\)\}:\$\{-p\.refusals\.strength \/ 100\}`/.test(read('src/lab-home-jobs.js')));
const help = read('public/help-content.js');
check('Help: the Steps tab has its own entry in Bob\'s voice', /id: 'lab-steps'/.test(help) && /Every method my Lab has/.test(help));
check('Help: an FAQ on why a step stopped before it started', /id: 'faq-lab-smoke'/.test(help));
check('Help: an FAQ on never-train data', /id: 'faq-lab-never-train'/.test(help));
check('Help: glossary entries for smoke test, never-train and run record', /<dt>Smoke test<\/dt>/.test(help) && /<dt>Never-train<\/dt>/.test(help) && /<dt>Run record<\/dt>/.test(help));
check('the plan doc is linked from the docs index', /LAB-STEPS-PLAN\.md/.test(read('docs/README.md')));


// ---- the Steps tab ----
{
  const g = help.slice(help.indexOf("{ id: 'glossary'"));
  const terms = new Set([...g.matchAll(/<dt>(.*?)<\/dt>/g)].map((m) => m[1]));
  const missing = STEPS.filter((s) => s.glossary && !terms.has(s.glossary)).map((s) => s.id);
  check('every step name links to a glossary entry that exists', missing.length === 0, missing.join(', '));
  globalThis.document = globalThis.document || { dispatchEvent() {} };
  globalThis.CustomEvent = globalThis.CustomEvent || class { constructor(t, o) { this.type = t; this.detail = o?.detail; } };
  const { createStepsPage } = await import('../public/lab-steps-page.js');
  const api = async (u) => (u.endsWith('/steps') ? { stages: STAGES, steps: STEPS.map((s) => ({ ...s, ready: s.id !== 'sae-features', why: s.id === 'sae-features' ? 'Planned, not built yet.' : '', smokeReady: smokeReady(s) })) } : { runs: [{ id: 'r', name: 'Ablation sweep', state: 'gated', message: 'stopped', started: '2026-11-14T00:00:00Z', outputs: [{ kind: 'report', neverTrain: true }] }] });
  const pg = createStepsPage({ api }); pg.html(false); await new Promise((r) => setTimeout(r, 20));
  const simple = pg.html(false), pro = pg.html(true);
  check('the Steps tab shows one card per step, each with an (i)', (simple.match(/class="lab-step-card"/g) || []).length === STEPS.length && (simple.match(/class="tip-i"/g) || []).length >= STEPS.length);
  check('the Steps tab groups steps under every stage heading', STAGES.every(([id]) => simple.includes(`id="steps-h-${id}"`)));
  check('names open the glossary from a real button', /<button type="button" class="link lab-step-name" data-stepgloss/.test(simple));
  check('a step that isn\'t built says so instead of a button', simple.includes('Planned, not built yet.'));
  check('Professional adds the script name; Keep it simple doesn\'t', /<code>evil-sweep\.mjs<\/code>/.test(pro) && !/<code>/.test(simple));
  check('the runs table says a gate stop and a never-train output in words', /Stopped by its smoke test/.test(simple) && /report \(never-train\)/.test(simple) && /<th scope="col">/.test(simple));
  check('nothing on the tab starts, rents or uploads', !/data-(start|rent|upload|protogo)/.test(pro));
  check('the Lab has a Steps tab', /\['steps', 'Steps'\]/.test(read('public/lab.js')) && /steps: 'Professional adds/.test(read('public/lab.js')));
}

// ---- card health: a card type that keeps freezing at start-up is changed for another ----
{
  const ch = await import('../model-lab/forge/card-health.mjs');
  const f = path.join(tmp, 'forge out', ch.STARTUP_LOG), now = Date.UTC(2026, 10, 14, 12);
  ch.recordStartup(f, { gpu: 'NVIDIA A40', dc: 'EU-1', ok: false, why: 'never answered', at: now - 3 * 864e5 });
  ch.recordStartup(f, { gpu: 'NVIDIA A40', dc: 'EU-2', ok: false, why: 'never answered', at: now - 864e5 });
  ch.recordStartup(f, { gpu: 'NVIDIA L40S', dc: 'EU-1', ok: false, at: now - 2 * 864e5 });
  ch.recordStartup(f, { gpu: 'NVIDIA L40S', dc: 'EU-1', ok: true, at: now - 864e5 });
  ch.recordStartup(f, { gpu: 'NVIDIA H200', dc: 'US-1', ok: false, at: now - 30 * 864e5 });
  ch.recordStartup(f, { gpu: 'NVIDIA H200', dc: 'US-1', ok: false, at: now - 29 * 864e5 });
  const rows = ch.readStartups(f), bad = ch.freezingCards(rows, { now });
  check('a card type that froze twice this week is marked', bad.has('NVIDIA A40'));
  check('a good start clears earlier freezes', !bad.has('NVIDIA L40S'));
  check('old freezes (over a week) don\'t count', !bad.has('NVIDIA H200'));
  check('freezing types go to the back, not out', JSON.stringify(ch.orderCards(['NVIDIA A40', 'NVIDIA L40S'], { freezing: bad })) === JSON.stringify(['NVIDIA L40S', 'NVIDIA A40']));
  check('a type that froze in this run isn\'t asked for again', JSON.stringify(ch.orderCards(['NVIDIA A40', 'NVIDIA L40S'], { avoidNow: new Set(['NVIDIA A40']) })) === '["NVIDIA L40S"]');
  check('when every type froze in this run, nothing is left to rent', ch.orderCards(['NVIDIA A40'], { avoidNow: new Set(['NVIDIA A40']) }).length === 0);
  check('the start-up summary is per card type and data centre', ch.startupSummary(rows).some((l) => l === 'NVIDIA A40 @ EU-1: 0 started, 1 froze'));
  const fg = read('model-lab/forge/forge.mjs');
  check('a retry asks no second yes, and only a run that rented its own pod re-rents', /if \(!args\.yes && !again\)/.test(fg) && /if \(rentedHere\) \{/.test(fg) && /await rent\(\); rentedHere = true;/.test(fg));
  check('a retry keeps the caps counting from the first rent', /t\.started = first; fs\.writeFileSync\(tokenFile/.test(fg));
  check('a retry deletes the frozen pod first and leaves out its card type', /avoidNow\.add\(on\.gpu\)[\s\S]{0,200}await kill\(/.test(fg) && /orderCards\(cards, \{ avoidNow, freezing: freezingCards/.test(fg));
  check('retries are capped (plan.startup_retries, at most 5)', /Math\.min\(5, Number\(plan\.startup_retries \?\? 2\)\)/.test(fg));
}

// ---- a free step run from the Steps tab (fake spawn: no real scrub reads this computer) ----
{
  await import('../src/lab.js');
  const { stepRunJobs, STEP_FORMS } = await import('../src/lab-step-run.js');
  const dataDir = path.join(tmp, 'data'), setDir = path.join(dataDir, 'lab', 'lessons', 'mine');
  fs.mkdirSync(setDir, { recursive: true }); fs.writeFileSync(path.join(setDir, 'lessons.jsonl'), '{"idea":"a","messages":[]}\n'); fs.writeFileSync(path.join(setDir, 'write.json'), JSON.stringify({ name: 'My lessons', count: 1, done: true }));
  const fakeDir = path.join(tmp, 'ml'); fs.mkdirSync(fakeDir, { recursive: true }); fs.writeFileSync(path.join(fakeDir, 'scrub-data.mjs'), ''); fs.writeFileSync(path.join(fakeDir, 'make-checks.mjs'), ''); fs.mkdirSync(path.join(fakeDir, 'forge')); fs.writeFileSync(path.join(fakeDir, 'forge', 'forge.mjs'), '');
  let seen = null, exitWith = 0, hold = false;
  const fakeSpawn = (node, args) => { seen = args; const ev = {}; const ch = { pid: 0, on: (k, fn) => { ev[k] = fn; } }; setTimeout(() => { if (hold) return; const out = args[args.indexOf('--out') + 1]; if (exitWith === 0 && args.includes('--in')) fs.cpSync(args[args.indexOf('--in') + 1], out, { recursive: true }); ev.exit?.(exitWith); }, 5); return ch; };
  const lab = Object.assign({ cfg: { dataDir, forgeDir: fakeDir }, now: () => Date.UTC(2026, 10, 14, 12), broadcast: () => {}, stepSpawn: fakeSpawn }, stepRunJobs);
  check('only free steps with a form run from the tab', Object.keys(STEP_FORMS).every((id) => stepById(id).where === 'here'));
  check('a step with no form says it doesn\'t run from here', lab.stepCheck('lora', {}).problems[0] === 'That step doesn\'t run from here yet.');
  check('the scrub needs a lesson set', lab.stepCheck('pii-scrub', {}).problems.includes('Pick a lesson set.'));
  const ok = lab.stepCheck('pii-scrub', { set: 'mine' });
  check('the scrub reads the set and writes a new one beside it', !ok.problems.length && ok.p.args[1] === setDir && ok.p.out !== setDir && /scrubbed/.test(ok.notes.join(' ')));
  const r = lab.stepRun('pii-scrub', { set: 'mine' });
  check('it starts with fixed args only', r.started && seen[0].endsWith('scrub-data.mjs') && seen.slice(1).join(' ') === `--in ${setDir} --out ${ok.p.out}`);
  let refused = ''; try { lab.stepRun('pii-scrub', { set: 'mine' }); } catch (e) { refused = e.message; }
  check('one step at a time', /One at a time/.test(refused));
  await new Promise((res) => setTimeout(res, 40));
  const rec = listRuns(path.join(dataDir, 'lab')).find((x) => x.step === 'pii-scrub');
  check('a finished scrub is a new lesson set with its run record', lab.stepJob().state === 'done' && fs.existsSync(path.join(ok.p.out, 'write.json')) && JSON.parse(fs.readFileSync(path.join(ok.p.out, 'write.json'), 'utf8')).name === 'My lessons, scrubbed' && rec?.state === 'done' && rec.outputs[0].kind === 'lessons');
  exitWith = 2; const r2 = lab.stepRun('pii-scrub', { set: 'mine' }); await new Promise((res) => setTimeout(res, 40));
  const out2 = lab.stepCheck('pii-scrub', { set: 'mine' }).p.out;
  check('a failed scrub keeps nothing half-made and says why', r2.started && lab.stepJob().state === 'failed' && /exit 2/.test(lab.stepJob().message) && !fs.existsSync(path.join(path.dirname(out2), 'mine-scrub-2')));
  exitWith = 0; hold = true; lab.stepRun('eval-sets', {});
  check('stop ends a running step and its record', lab.stepStop().stopped === true && lab.stepJob().state === 'stopped' && listRuns(path.join(dataDir, 'lab')).find((x) => x.step === 'eval-sets')?.state === 'stopped');
  check('a step can\'t start while a protocol step runs', (() => { fs.writeFileSync(path.join(dataDir, 'lab', 'protocol', 'job.json'), JSON.stringify({ state: 'running' })); try { lab.stepRun('eval-sets', {}); return false; } catch (e) { return /protocol step is running/.test(e.message); } })());
  check('step runs start only from this computer', /\/api\/lab\/step\/run'/.test(read('src/lab-routes.js')) && read('src/lab-routes.js').indexOf("'/api/lab/step/run'") > read('src/lab-routes.js').indexOf('can only be started on this replicant matrix'));
}

// ---- compare runs side by side ----
{
  const { compareRuns } = await import('../public/lab-steps-page.js');
  const a = { name: 'Dataset cleaning', state: 'done', bob: '1.5.226', started: '2026-11-14T10:00:00Z', ended: '2026-11-14T10:12:00Z', smoke: null, cost: null, inputs: [{ kind: 'lessons', id: 'sha256:aaaaaaaaaaaa' }], outputs: [], settings: { review: 'v4', lightWeight: 0.5 }, scores: { tools: 71 } };
  const b2 = { ...a, ended: '2026-11-14T10:20:00Z', settings: { review: 'none', lightWeight: 0.5 }, scores: { tools: 74, quiz: 60 }, cost: { usd: 0.4, card: 'A40' } };
  const rows = compareRuns([a, b2]), row = (l) => rows.find((x) => x.label === l);
  check('compare marks settings that differ and not ones that match', row('Setting: review').differs && !row('Setting: lightWeight').differs);
  check('compare lines up scores, with a dash where one run has none', row('Score: tools').vals.join() === '71,74' && row('Score: quiz').vals.join() === '-,60');
  check('compare shows minutes and cost per run', row('Minutes').vals.join() === '12,20' && row('Cost').vals[1] === '$0.40 (A40)');
  check('compare shows inputs by short hash', /lessons aaaaaaaaaa/.test(row('Inputs').vals[0]));
}
// ---- pipelines: saved steps, packed card blocks, picking up where it stopped, the score chart (fakes only) ----
{
  const { stepRunJobs } = await import('../src/lab-step-run.js');
  const P = await import('../src/lab-pipelines.js');
  const { scoreChart } = await import('../public/lab-steps-page.js');
  const dataDir = path.join(tmp, 'data-pipe'), setDir = path.join(dataDir, 'lab', 'lessons', 'mine'), lab0 = path.join(dataDir, 'lab');
  fs.mkdirSync(setDir, { recursive: true }); fs.writeFileSync(path.join(setDir, 'lessons.jsonl'), '{"idea":"a","messages":[]}\n'); fs.writeFileSync(path.join(setDir, 'write.json'), JSON.stringify({ name: 'My lessons', count: 1, done: true }));
  const fakeDir = path.join(tmp, 'ml-pipe'); fs.mkdirSync(path.join(fakeDir, 'forge'), { recursive: true }); for (const f of ['scrub-data.mjs', 'make-checks.mjs', 'forge/forge.mjs']) fs.writeFileSync(path.join(fakeDir, f), '');
  let exitWith = 0; const started = [];
  const idle = async () => { for (let i = 0; i < 200; i++) { await new Promise((res) => setTimeout(res, 10)); if (lab.stepJob()?.state !== 'running') return; } };
  const fakeSpawn = (node, args) => { started.push(path.basename(args[0])); const ev = {}; setTimeout(() => { const out = args[args.indexOf('--out') + 1]; if (exitWith === 0) { if (args.includes('--in')) fs.cpSync(args[args.indexOf('--in') + 1], out, { recursive: true }); else { fs.mkdirSync(path.dirname(out), { recursive: true }); fs.writeFileSync(out, '{}\n'); } } ev.exit?.(exitWith); }, 5); return { pid: 0, on: (k, fn) => { ev[k] = fn; } }; };
  const lab = Object.assign({ cfg: { dataDir, forgeDir: fakeDir }, now: () => Date.UTC(2026, 10, 14, 13), broadcast: () => {}, stepSpawn: fakeSpawn }, stepRunJobs);
  const bad = P.cleanPipeline({ name: '', steps: [{ id: 'nope' }, { id: 'pii-scrub', form: { set: '@prev', hfToken: 'hf_' + 'a'.repeat(30), 'bad key': 1 } }] });
  check('a pipeline needs a name and known steps', bad.problems.includes('Give the pipeline a name.') && bad.problems.some((x) => /no step called nope/.test(x)));
  check('a pipeline form keeps no key and no odd field names', !JSON.stringify(bad.pipeline).includes('hf_') && !('bad key' in bad.pipeline.steps[0].form));
  check('the first step can\'t take from a step before it', bad.problems.some((x) => /first step has no step before/.test(x)));
  check('heavy steps that run either way go on a card, never this computer', P.runsOn(stepById('lora')) === 'rented' && P.runsOn(stepById('pii-scrub')) === 'here' && P.runsOn(stepById('attribution-transfer')) === 'here');
  const steps = [{ id: 'pii-scrub', form: { set: 'mine' } }, { id: 'pii-scrub', form: { set: '@prev' } }, { id: 'lora' }, { id: 'distillation' }, { id: 'expert-profiling' }, { id: 'eval-sets' }];
  const saved = lab.pipelineSave({ name: 'Clean then teach', steps });
  check('a pipeline saves under its name, in the Lab folder', !saved.problems.length && saved.slug === 'clean-then-teach' && fs.existsSync(path.join(lab0, 'pipelines', 'clean-then-teach.json')));
  const blocks = P.packBlocks(steps);
  check('rented steps in a row pack into one card block', blocks.length === 5 && blocks[2].on === 'rented' && blocks[2].steps.join() === '2,3');
  const draft = P.blockDraft(P.readPipeline(lab0, 'clean-then-teach'), blocks[2]);
  check('a card block draft starts with $0 and 0 hours caps', draft.dollars_max === 0 && draft.hours_max === 0 && draft.steps.join() === 'lora,distillation');
  check('a new pipeline is not started, next is step 1', (() => { const v = lab.pipelinesView().pipelines[0]; return v.progress.state === 'not started' && v.progress.next === 0 && v.progress.cost === 0; })());
  const g1 = lab.pipelineGo('clean-then-teach');
  check('Start runs the first free step, tagged with its pipeline place', g1.started && /Step 1 of 6/.test(g1.message) && listRuns(lab0).find((r) => r.pipeline === 'clean-then-teach')?.pipelineStep === 0);
  await idle(); await idle();
  const pr = P.pipelineProgress(lab0, P.readPipeline(lab0, 'clean-then-teach'));
  check('a finished free step hands on to the next free step by itself', started.join() === 'scrub-data.mjs,scrub-data.mjs' && pr.steps[0].state === 'done' && pr.steps[1].state === 'done');
  const r2 = listRuns(lab0).find((r) => r.pipelineStep === 1);
  check('"the step before" means the set that step made', r2.inputs[0].path === pr.steps[0].outputs[0].path);
  check('a rented block waits for you: nothing rents from a pipeline', pr.next === 2 && (() => { const g = lab.pipelineGo('clean-then-teach'); return !g.started && g.waiting === 'rented' && /2 steps|1 more step/.test(g.message) && /\$0/.test(g.message); })() && started.length === 2);
  lab.pipelineSkip('clean-then-teach', 2); lab.pipelineSkip('clean-then-teach', 3);
  const g4 = lab.pipelineGo('clean-then-teach');
  check('a step that starts from its own page says so', !g4.started && g4.waiting === 'page' && /Expert profiling/.test(g4.message));
  lab.pipelineSkip('clean-then-teach', 4);
  check('skipped steps show as skipped, never done', P.pipelineProgress(lab0, P.readPipeline(lab0, 'clean-then-teach')).steps[2].state === 'skipped');
  exitWith = 3; lab.pipelineGo('clean-then-teach'); await idle();
  check('a failed step stops the pipeline part way', (() => { const q = P.pipelineProgress(lab0, P.readPipeline(lab0, 'clean-then-teach')); return q.state === 'stopped part way' && q.next === 5 && q.steps[5].state === 'failed'; })());
  exitWith = 0; const again = lab.pipelineGo('clean-then-teach'); await idle();
  check('Continue picks up at the first step not done and leaves done ones alone', again.started && /Step 6 of 6/.test(again.message) && started.filter((x) => x === 'scrub-data.mjs').length === 2);
  check('when every step is done it says so', P.pipelineProgress(lab0, P.readPipeline(lab0, 'clean-then-teach')).done && lab.pipelineGo('clean-then-teach').done === true);
  const fakePr = { steps: [{ i: 0, name: 'Baseline eval', scores: { tools: 60 } }, { i: 1, name: 'LoRA', scores: { tools: 72, quiz: 50 } }, { i: 2, name: 'Iterative pruning', scores: {} }] };
  const lines = P.pipelineScores(fakePr);
  check('the score chart has a line per score, a point per step that has it', lines.length === 2 && lines.find((l) => l.score === 'tools').points.length === 2 && lines.find((l) => l.score === 'quiz').points.length === 1);
  const ch = scoreChart(lines, fakePr.steps, 'Test');
  check('the chart has a table beside it for screen readers', /role="img"/.test(ch) && /<table/.test(ch) && /<th scope="row">2\. LoRA<\/th><td>50<\/td><td>72<\/td>/.test(ch));
  check('pipelines start only from this computer', read('src/lab-routes.js').indexOf("'/api/lab/pipeline/go'") > read('src/lab-routes.js').indexOf('can only be sta'));
  check('the pipeline FAQ and glossary entry are there', /faq-lab-pipeline/.test(read('public/help-content.js')) && /<dt>Pipeline \(Lab\)<\/dt>/.test(read('public/help-content.js')));
}
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
