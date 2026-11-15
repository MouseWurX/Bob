// The never-taught gate (15 Nov): a training or heal plan checks every lesson it would send against the held-out and calib
// files before anything is rented. Nothing here reads the real computer: made-up lessons and tests in a temp folder.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { trains, gate, neverFilesFor, lessonFilesFor } from '../model-lab/never-gate.mjs';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-never-gate-'));
const lab = path.join(tmp, 'model lab'), out = path.join(tmp, 'out');
const w = (p, rows) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, rows.map((r) => (typeof r === 'string' ? r : JSON.stringify(r))).join('\r\n') + '\r\n'); };
const lesson = (...users) => ({ messages: [{ role: 'system', content: 'You are Bob.' }, ...users.flatMap((u) => [{ role: 'user', content: u }, { role: 'assistant', content: 'ok' }])] });
const defaults = path.join(tmp, 'never-taught.json');
fs.writeFileSync(defaults, JSON.stringify({ files: [{ path: 'heldout', recursive: false }] }));
w(path.join(out, 'heldout', 'heldout.jsonl'), [{ q: 'What is the boiling point of water at the top of Mount Everest in celsius' }, { q: 'Rename every photo in my holiday folder by the date it was taken' }]);
w(path.join(out, 'heldout', 'sort', 'near-copies.jsonl'), [{ q: 'a sorted report row that must not be read as a test because it sits in a subfolder' }]);
const opts = { modelLab: lab, outDir: out, defaults };
const clean = [lesson('Write a haiku about autumn leaves falling on a quiet pond'), lesson('List the files in my downloads folder please')];
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), clean);
const plan = (extra = {}) => ({ run: 't', rungs: [{ name: 'x' }], ...extra });

// ---- which plans are checked ----
check('training and heal plans are checked', trains(plan()) && trains({ train_teacher: {} }) && trains({ heal: {} }) && trains({ grpo: {} }) && trains({ pref: 'p' }));
check('benchmarks, rebuilds and lesson-writing-only runs are not', !trains({ benchmark_only: true, rungs: [] }) && !trains({ rebuild: {}, rungs: [{}] }) && !trains({ lessons_only: true }) && !trains({ rungs: [] }));
const g0 = await gate({ benchmark_only: true }, opts);
check('a benchmark plan passes without reading anything', g0.ok && !g0.trains);

// ---- what is read ----
const nf = neverFilesFor(plan(), opts);
check('held-out files are read, a sorted subfolder is not', nf.files.length === 1 && /heldout\.jsonl$/.test(nf.files[0]) && !nf.missing.length);
const lf = lessonFilesFor(plan({ extra_lessons: ['out/extra'], pref: 'out/pairs' }), opts);
check('the main set, extra sets and pairs are all on the list to check', lf.files.some((f) => /lessons[\\/]lessons\.jsonl$/.test(f)) && lf.files.some((f) => /extra[\\/]lessons\.jsonl$/.test(f)));

// ---- pass and stop ----
const g1 = await gate(plan(), opts);
check('clean lessons pass', g1.ok && g1.trains && g1.leaks.length === 0, g1.reason);
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), [...clean, lesson('hi', 'What is the boiling point of water at the top of Mount Everest in Celsius?')]);
const g2 = await gate(plan(), opts);
check('a test question word for word in a later user turn stops the plan', !g2.ok && g2.leaks.length === 1 && g2.leaks[0].how === 'same' && g2.leaks[0].line === 3, g2.reason);
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), [...clean, lesson('Please help: rename every photo in my holiday folder by the date it was taken, thanks')]);
const g3 = await gate(plan(), opts);
check('a test question inside a longer request stops the plan', !g3.ok && g3.leaks[0]?.how === 'inside', g3.reason);
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), [...clean, lesson('Rename every photo in my holiday folder by the date it was shot')]);
const g4 = await gate(plan(), opts);
check('a reworded copy of a test stops the plan', !g4.ok && /near/.test(g4.leaks[0]?.how || ''), g4.reason);
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), clean);
w(path.join(lab, 'out', 'pairs', 'pairs.jsonl'), [{ prompt: 'What is the boiling point of water at the top of Mount Everest in celsius', chosen: 'a', rejected: 'b' }]);
const g5 = await gate(plan({ pref: 'out/pairs' }), opts);
check('preference pairs are checked too', !g5.ok && /pairs\.jsonl$/.test(g5.leaks[0]?.file || ''), g5.reason);
w(path.join(lab, 'calib.txt'), ['How many legs does a spider have in total']);
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), [...clean, lesson('How many legs does a spider have in total?')]);
const g6 = await gate(plan({ never: ['calib.txt'] }), opts);
check('the plan\'s own never list (plain lines) is used', !g6.ok && g6.leaks[0]?.from === 'calib.txt', g6.reason);
w(path.join(lab, 'out', 'lessons', 'lessons.jsonl'), clean);

// ---- stops instead of guessing ----
const g7 = await gate(plan({ never: ['gone.jsonl'] }), opts);
check('a missing never-taught file stops the plan', !g7.ok && /missing/.test(g7.reason));
const g8 = await gate(plan(), { ...opts, defaults: null });
check('no test files at all stops the plan', !g8.ok && /no held-out/.test(g8.reason));
const g9 = await gate(plan({ lessons_set: 'lessons-v3' }), opts);
check('a lesson set on the rented drive stops the plan (this PC can\'t check it)', !g9.ok && /lessons_set/.test(g9.reason));
const g10 = await gate(plan({ extra_lessons: ['out/nothing-here'] }), opts);
check('a missing lesson file stops the plan', !g10.ok && /missing/.test(g10.reason));

// ---- the Forge runs it ----
const forge = read(path.join(here, '..', 'model-lab', 'forge', 'forge.mjs'));
const gi = forge.indexOf('await neverGate(plan'), ri = forge.indexOf('async function rent(');
check('the Forge runs the gate before renting and stops on a match', gi > 0 && gi < ri && /if \(!g\.ok\)[^\n]*Nothing was rented or sent[^\n]*process\.exit\(1\)/.test(forge));
check('lessons written on the pod for a training plan pass the gate before they go up', /planTrains\(plan\)[\s\S]{0,400}findLeaks\(\[send\]/.test(forge) && /upload\(`lessons-extra-\$\{i\}\.jsonl`, send\)/.test(forge));
const defs = JSON.parse(read(path.join(here, '..', 'model-lab', 'forge', 'never-taught.json')));
check('the default list names the held-out 534 and the calib questions', defs.files.some((f) => /heldout-534/.test(f.path)) && defs.files.some((f) => /calib/.test(f.path)));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
