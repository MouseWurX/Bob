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

const secret = { tool: 'clean', hfToken: 'hf_abcdefghijklmnopqrstuvwxyz123456', nested: { RUNPOD_API_KEY: 'x', note: 'hf_abcdefghijklmnopqrstuvwxyz123456', ok: 'fine' }, list: ['sk-abcdefghijklmnopqrstuv'] };
const clean = dropSecrets(secret);
check('keys and tokens are left out of a run\'s settings, by name and by shape', !JSON.stringify(clean).includes('hf_abc') && !JSON.stringify(clean).includes('sk-abc') && !('hfToken' in clean) && !('RUNPOD_API_KEY' in clean.nested) && clean.nested.ok === 'fine' && clean.tool === 'clean');

const r1 = startRun(lab, { step: 'dataset-cleaning', settings: secret, inputs: [{ kind: 'lessons', path: set }], bob: '1.5.0', now: Date.UTC(2026, 10, 14) });
check('a free step with no smoke test starts running', r1.state === 'running' && r1.smoke === null);
check('the record on disk holds no key', !fs.readFileSync(path.join(lab, 'runs', r1.id, 'run.json'), 'utf8').includes('hf_abc'));
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
check('Help: an FAQ on why a step stopped before it started', /id: 'faq-lab-smoke'/.test(help));
check('Help: an FAQ on never-train data', /id: 'faq-lab-never-train'/.test(help));
check('Help: glossary entries for smoke test, never-train and run record', /<dt>Smoke test<\/dt>/.test(help) && /<dt>Never-train<\/dt>/.test(help) && /<dt>Run record<\/dt>/.test(help));
check('the plan doc is linked from the docs index', /LAB-STEPS-PLAN\.md/.test(read('docs/README.md')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
