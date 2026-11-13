// The training protocol in the Lab (13 Nov 2026): the order of steps, the free steps here (clean a lesson set, make
// pairs, sweep a running brain), and the rented ones written into a Forge plan (pairs, on-policy, reward pass, targets,
// surgery edits). Made-up folders only: nothing reads this computer's own files, cards or settings.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import '../src/lab.js'; // the app loads the Lab first; its parts come in through it
import { PROTOCOL_STEPS, planProtocol, adoptCleaned, protocolJobs } from '../src/lab-protocol.js';
import { waysToPlan } from '../src/lab-forge.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');
const read = (p) => fs.readFileSync(path.join(app, p), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-protocol-'));
const rows = (r) => r.map((x) => JSON.stringify(x)).join('\r\n') + '\r\n';

// ---- the order ----
check('the protocol has its 11 steps in order', PROTOCOL_STEPS.map((s) => s.id).join() === 'baseline,clean-first,train,analyse,cut,heal,targets,finish,blend,surgery,publish');
check('every step says where it runs', PROTOCOL_STEPS.every((s) => ['here', 'rented', 'both'].includes(s.where) && s.what));

// ---- a made-up Lab: data folder with one lesson set, the real model-lab tools ----
const dataDir = path.join(tmp, 'data'), setDir = path.join(dataDir, 'lab', 'lessons', 'mine');
fs.mkdirSync(setDir, { recursive: true });
fs.writeFileSync(path.join(setDir, 'toolsets.json'), JSON.stringify({ s1: { system: 'You are Bob.', tools: [{ type: 'function', function: { name: 'web_search' } }] } }));
const ask = (t) => ({ role: 'user', content: t });
fs.writeFileSync(path.join(setDir, 'lessons.jsonl'), rows([
  { idea: 'a1', job: 'chat', messages: [ask('hello'), { role: 'assistant', set: 's1', content: 'Hi.' }] },
  { idea: 'a2', job: 'chat', messages: [ask('Hello!'), { role: 'assistant', set: 's1', content: 'Hey.' }] },
  { idea: 'a3', job: 'web', messages: [ask('news'), { role: 'assistant', set: 's1', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'made_up', arguments: '{}' } }] }] },
  { idea: 'a4', job: 'web', messages: [ask('weather'), { role: 'assistant', set: 's1', content: 'Sunny.' }] }
]));
fs.writeFileSync(path.join(setDir, 'write.json'), JSON.stringify({ name: 'My lessons', count: 4, done: true }));
const before = fs.readFileSync(path.join(setDir, 'lessons.jsonl'), 'utf8');
const cfg = { dataDir, forgeDir: path.join(app, 'model-lab') };
const lab = Object.assign({ cfg, now: () => Date.UTC(2026, 10, 13, 12), broadcast: () => {} }, protocolJobs);

// ---- the checks ----
const sets = [{ id: 'mine', name: 'My lessons', file: path.join(setDir, 'lessons.jsonl') }];
const root = path.join(dataDir, 'lab', 'protocol');
check('no Forge folder: says where the tools live', planProtocol('clean', { set: 'mine' }, { dir: '', sets, root }).problems.some((p) => /model-lab/.test(p)));
check('a step needs a lesson set', planProtocol('clean', {}, { dir: cfg.forgeDir, sets, root }).problems.includes('Pick a lesson set.'));
const pc = planProtocol('clean', { set: 'mine' }, { dir: cfg.forgeDir, sets, root, review: '/x/review.json' });
check('clean: reads the set, writes a new folder, uses the hand review', !pc.problems.length && pc.args.includes('--review') && pc.args[pc.args.indexOf('--from') + 1] === setDir && !pc.out.startsWith(setDir));
check('clean: without a review, none is passed', !planProtocol('clean', { set: 'mine', review: 'none' }, { dir: cfg.forgeDir, sets, root, review: '/x/r.json' }).args.includes('--review'));
check('pairs: says when a set has no wrong answers kept', planProtocol('pairs', { set: 'mine' }, { dir: cfg.forgeDir, sets, root }).notes.some((n) => /no wrong answers kept/.test(n)));
check('sweep: only a brain on this computer', planProtocol('sweep', { set: 'mine', url: 'http://example.com:8090' }, { dir: cfg.forgeDir, sets, root }).problems.some((p) => /this computer/.test(p)));
const ps = planProtocol('sweep', { set: 'mine', url: 'http://127.0.0.1:8090', used: '-2,+4', scales: '0.8' }, { dir: cfg.forgeDir, sets, root });
check('sweep: a local engine with experts per word and layer scales', !ps.problems.length && ps.args.includes('--used') && ps.args.includes('--layer-scale') && ps.args.includes('--targets'), ps.problems.join(';'));
check('sweep: refuses a made-up setting', planProtocol('sweep', { set: 'mine', url: 'http://127.0.0.1:8090', used: 'rm -rf' }, { dir: cfg.forgeDir, sets, root }).problems.some((p) => /whole numbers/.test(p)));
check('an unknown step is refused', planProtocol('bake', { set: 'mine' }, { dir: cfg.forgeDir, sets, root }).problems.length > 0);

// ---- a real cleaning, run the way the Lab runs it ----
const r = lab.protocolRun('clean', { set: 'mine', review: 'none' });
check('clean starts', r.started === true);
let tries = 0; while (lab.protocolView().job?.state === 'running' && tries++ < 300) await new Promise((res) => setTimeout(res, 50));
const v = lab.protocolView();
check('clean finishes and says what it made', v.job?.state === 'done' && /cleaned/.test(v.job.message), JSON.stringify(v.job));
const made = path.join(dataDir, 'lab', 'lessons', 'mine-clean');
check('the cleaned set is a new Lab lesson set', fs.existsSync(path.join(made, 'lessons.jsonl')) && JSON.parse(fs.readFileSync(path.join(made, 'write.json'), 'utf8')).name === 'My lessons, cleaned' && v.sets.some((x) => x.id === 'mine-clean' && x.cleaned));
check('it dropped the made-up tool call and the repeat', fs.readFileSync(path.join(made, 'lessons.jsonl'), 'utf8').split('\n').filter(Boolean).length === 2);
check('the original set is never changed', fs.readFileSync(path.join(setDir, 'lessons.jsonl'), 'utf8') === before);
check('its change list comes with it', fs.existsSync(path.join(made, 'CHANGES.md')) && fs.existsSync(path.join(made, 'flagged.jsonl')));
check('the work folder is tidied away', !fs.existsSync(path.join(root, 'clean-work', 'mine')));
check('adopting twice never overwrites', (() => { const w = path.join(tmp, 'w'); fs.mkdirSync(path.join(w, 'mine'), { recursive: true }); fs.writeFileSync(path.join(w, 'mine', 'lessons.jsonl'), '{}\n'); return adoptCleaned({ work: w, set: sets[0], lessonsRoot: path.join(dataDir, 'lab', 'lessons') }).id === 'mine-clean-2'; })());

// one at a time
const slow = Object.assign({}, lab, { protocolSpawn: () => ({ pid: 0, on: () => {} }) });
slow.protocolRun('pairs', { set: 'mine' });
let refused = ''; try { slow.protocolRun('pairs', { set: 'mine' }); } catch (e) { refused = e.message; }
check('one step at a time', /One at a time/.test(refused));
check('stop ends it', slow.protocolStop().stopped === true && slow.protocolView().job.state === 'stopped');

// ---- the rented steps in a Forge plan ----
const pairsSets = [{ id: 'mine', path: path.join(tmp, 'pairs', 'mine'), pairs: 12, marked: 40 }, { id: 'marked-only', path: path.join(tmp, 'pairs', 'm'), pairs: 0, marked: 9 }];
const ways = (w) => { const plan = { heal: { experts: 'lora', epochs: 1 } }, problems = [], notes = []; waysToPlan(w, { plan, problems, notes, pairsSets, rungs: [{ name: 'Homer' }] }); return { plan, problems, notes }; };
const off = ways({});
check('new ways are all off unless picked', !off.plan.pref && !off.plan.grpo && !off.plan.targets && !off.plan.surgery && !off.plan.heal.pref && !off.plan.heal.onpolicy && !off.problems.length);
check('pairs: needs a pairs folder', ways({ pref: 'orpo' }).problems.some((p) => /pick the pairs/.test(p)));
const orpo = ways({ pref: 'orpo', pairs: 'mine' });
check('pairs: ORPO writes heal.pref and the pairs folder', orpo.plan.heal.pref.kind === 'orpo' && orpo.plan.pref === path.resolve(pairsSets[0].path) && !orpo.problems.length);
check('pairs: DPO needs real pairs, KTO doesn\'t', ways({ pref: 'dpo', pairs: 'marked-only' }).problems.length === 1 && !ways({ pref: 'kto', pairs: 'marked-only' }).problems.length);
check('on-policy: a share, at most half', ways({ onpolicy: 20 }).plan.heal.onpolicy.frac === 0.2 && ways({ onpolicy: 60 }).problems.length === 1);
check('reward pass: on with its hours', ways({ grpo: true, grpoHours: 2 }).plan.grpo.hours === 2);
const tg = ways({ targets: [{ name: 'facts', jobs: 'straight-facts, knowledge', weight: 2 }, { name: 'tools', jobs: 'precise', weight: 1 }] });
check('targets: names, jobs and weights', tg.plan.targets.facts.jobs.join() === 'straight-facts,knowledge' && tg.plan.targets.tools.weight === 1);
check('targets: a job in two targets is refused', ways({ targets: [{ name: 'a', jobs: 'x', weight: 1 }, { name: 'b', jobs: 'x', weight: 1 }] }).problems.some((p) => /two targets/.test(p)));
check('surgery: unreadable edits are refused', ways({ surgery: 'not json' }).problems.length === 1);
check('surgery: a scale above 8 is refused', ways({ surgery: '[{"layer": 1, "expert": 2, "scale": 9}]' }).problems.length === 1);
const sg = ways({ surgery: '{"edits": [{"layer": 12, "expert": 37, "neuron": 401, "scale": 1.3}, {"layer": 3, "head": 7, "scale": 0.8}, {"layer": 2, "expert": "shared", "scale": 0}]}' });
check('surgery: neuron, head and shared-expert edits go in the plan, and it says they are baked into every brain', sg.plan.surgery.edits.length === 3 && sg.plan.surgery.edits[1].head === 7 && sg.notes.some((n) => /baked into every brain this run makes \(Homer\)/.test(n)));

// ---- the pod, the routes, the page, Help ----
const run = read('model-lab/forge/pod/run.sh');
check('the pod bakes surgery edits after the heal, keeps the brain if it fails', /surgery\.py --model \$W\/healed-\$NAME --edits \$IN\/surgery\.json/.test(run) && /surgery failed .* the brain stays as it was/.test(run) && /\[ -z "\$\{RAW:-\}" \] && \[ -n "\$\(plan "\.get\('surgery'\)"\)" \]/.test(run));
check('the plan maker uses the new ways and counts the reward pass hours', /waysToPlan\(form\.ways/.test(read('src/lab-forge.js')) && /plan\.grpo \? plan\.grpo\.hours \* rungs\.length/.test(read('src/lab-forge.js')));
const routes = read('src/lab-routes.js');
check('the routes: read-only view for any device, runs on this computer only', /'\/api\/lab\/protocol'\)/.test(routes) && routes.indexOf("'/api/lab/protocol/run'") > routes.indexOf('Lab jobs can only be started on this replicant matrix itself'));
const page = read('public/lab-forge.js');
check('the Forge tab shows the protocol and the new ways, always visible', /createProtocol/.test(page) && /\$\{pr\.html\(\)\}/.test(page) && /\$\{waysHtml\(\)\}/.test(page) && !/proOnly\(`<fieldset id="forge-ways"/.test(page));
check('the protocol page keeps nothing in browser storage', !/localStorage|sessionStorage/.test(read('public/lab-protocol.js')));
const help = read('public/help-content.js');
check('Help: an FAQ in Bob\'s voice on the protocol, on the Forge page', /id: 'faq-protocol'/.test(help) && /'faq-protocol': 'lab-forge'/.test(help) && /Nothing gets cut, trained or rented until you say so/.test(help));
check('Help: glossary entries', ['Brain surgery', 'Expert sweep', 'Training protocol'].every((t) => help.includes(`<dt>${t}</dt>`)));
check('Help: says where it runs (Windows, Mac, Linux; Android reads)', /Windows, Mac and Linux\. On Android you can read/.test(help));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
