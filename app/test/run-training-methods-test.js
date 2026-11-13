// New ways for the Forge to teach small Bobs (13 Nov 2026): preference pairs (make-pairs.mjs + heal.py --pref), on-policy
// teaching, the reward pass (grpo.py + tool_reward.py) and blends (merge.py). The pod code needs a card and torch, so here we
// check the Lab side for real (make-pairs on made-up folders, the tool judge on shared cases) and the pod side by reading it:
// everything new is off unless a plan asks, held-out chats are never trained on, and a reward pass that doesn't help is dropped.
// The pod's own dry run on a tiny model is model-lab/forge/pod/selftest_training.py.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const app = path.join(here, '..');
const read = (p) => fs.readFileSync(path.join(app, p), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-pairs-'));
const W = (p, rows) => { fs.mkdirSync(path.dirname(path.join(tmp, p)), { recursive: true }); fs.writeFileSync(path.join(tmp, p), typeof rows === 'string' ? rows : rows.map((r) => JSON.stringify(r)).join('\r\n') + '\r\n'); };
const call = (name, args = {}) => ({ id: 'c1', type: 'function', function: { name, arguments: JSON.stringify(args) } });
const ask = (t) => ({ role: 'user', content: t });

// ---- make-pairs on made-up lessons and benchmark answers ----
W('lessons/toolsets.json', JSON.stringify({ s1: { system: 'You are Bob.', tools: [] } }));
W('lessons/lessons.jsonl', [
  { idea: 'idea-0', think: false, messages: [ask('remind me at 7'), { role: 'assistant', set: 's1', content: '', tool_calls: [call('set_reminder', { when: '7:00' })] }, { role: 'tool', content: 'ok' }, { role: 'assistant', set: 's1', content: 'Done.' }] },
  { idea: 'idea-1', think: false, messages: [ask('capital of France?'), { role: 'assistant', set: 's1', content: 'Paris.' }] },
  { idea: 'idea-12', think: false, messages: [ask('hi'), { role: 'assistant', set: 's1', content: 'Hello.' }] },
  { idea: 'idea-2', think: false, messages: [ask('Think: Sherlock\nwho did it?'), { role: 'assistant', set: 's1', content: 'The butler.' }] }
]);
W('lessons/rejected.jsonl', [
  { idea: 'idea-0', think: false, why: 'wrong time', messages: [ask('remind me at 7'), { role: 'assistant', set: 's1', content: '', tool_calls: [call('set_reminder', { when: '8:00' })] }, { role: 'tool', content: 'ok' }, { role: 'assistant', set: 's1', content: 'Done.' }] },
  { idea: 'idea-1', think: false, why: 'tool for nothing', messages: [ask('capital of France?'), { role: 'assistant', set: 's1', content: '', tool_calls: [call('web_search', { q: 'France' })] }] },
  { idea: 'idea-12', think: false, why: 'rude', messages: [ask('hi'), { role: 'assistant', set: 's1', content: 'What.' }] },
  { idea: 'idea-9', think: false, why: 'no final answer', messages: [ask('zip it'), { role: 'assistant', set: 's1', content: '', tool_calls: [call('file_hands')] }] }
]);
W('lessons/needs-review.jsonl', [{ idea: 'idea-3', messages: [ask('x'), { role: 'assistant', content: 'y' }] }]);
W('ds/toolsets.json', JSON.stringify({ s2: { system: 'You are Bob (bench).', tools: [] } }));
const hist = [ask('zip my project')];
W('ds/pairs-right-vs-wrong.jsonl', [
  { brain: 'riker', split: 'train', idea: 'p-1', turn: 0, toolset: 's2', messages: hist, mistake: 'wrong tool', chosen: { content: '', tool_calls: [call('file_hands', { action: 'zip' })] }, rejected: { content: '', tool_calls: [call('list_folder')] } },
  { brain: 'riker', split: 'holdout', idea: 'p-2', turn: 0, toolset: 's2', messages: hist, mistake: 'wrong tool', chosen: { content: '', tool_calls: [call('file_hands', { action: 'zip' })] }, rejected: { content: 'Sure!' } }
]);
W('ds/full/chats-tool-calls.jsonl', [
  { brain: 'riker', split: 'train', idea: 'p-1', turn: 0, toolset: 's2', messages: hist, ok: true, answer: { content: '', tool_calls: [call('file_hands', { action: 'zip' })] }, odds: [{ t: 'x', p: -0.1 }] },
  { brain: 'riker', split: 'holdout', idea: 'p-2', turn: 0, toolset: 's2', messages: hist, ok: false, answer: { content: 'Sure!' } }
]);
const before = JSON.stringify(fs.readdirSync(tmp, { recursive: true }).sort().map((f) => [f, fs.statSync(path.join(tmp, f)).size]));
const run = (extra = []) => spawnSync(process.execPath, [path.join(app, 'model-lab', 'make-pairs.mjs'), '--lessons', path.join(tmp, 'lessons'), '--out', path.join(tmp, 'pref'), ...extra], { encoding: 'utf8' });
const r = run(['--datasets', path.join(tmp, 'ds')]);
check('make-pairs finishes', r.status === 0, r.stderr);
const rows = (f) => fs.readFileSync(path.join(tmp, 'pref', f), 'utf8').replace(/\r\n/g, '\n').trim().split('\n').filter(Boolean).map((l) => JSON.parse(l));
const pairs = rows('pairs.jsonl'), kto = rows('kto.jsonl');
const lp = pairs.filter((p) => p.source === 'lessons');
check('a kept and a rejected lesson for the same idea make a pair, the kept one chosen', lp.length === 3 && lp.find((p) => p.idea === 'idea-0').chosen[0].tool_calls[0].function.arguments.includes('7:00'));
check('the pair\'s prompt is the user\'s message; both answers carry their whole turn (tool results too)', lp.find((p) => p.idea === 'idea-0').prompt.length === 1 && lp.find((p) => p.idea === 'idea-0').rejected.length === 3);
check('a rejected lesson with no kept twin is still a marked "failed" answer', kto.some((k) => k.idea === 'idea-9' && k.ok === false) && !pairs.some((p) => p.idea === 'idea-9'));
check('unsure (needs-review) answers are left out', !kto.some((k) => k.idea === 'idea-3') && !pairs.some((p) => p.idea === 'idea-3'));
check('a lesson with a style line never goes into Bob\'s pairs (style sets train their own model)', !kto.some((k) => k.idea === 'idea-2'));
const bp = pairs.filter((p) => p.source.startsWith('benchmark'));
check('benchmark right-vs-wrong answers become pairs, with Bob\'s tool set named on every answer', bp.length === 2 && bp.every((p) => [...p.prompt, ...p.chosen, ...p.rejected].filter((m) => m.role === 'assistant').every((m) => m.set === 's2')));
check('tool-score\'s held-out chats are marked held out (measured, never learned)', bp.find((p) => p.idea === 'p-2').holdout === true && !bp.find((p) => p.idea === 'p-1').holdout && kto.find((k) => k.idea === 'p-2').holdout === true);
check('marked benchmark answers keep their odds', kto.find((k) => k.idea === 'p-1' && k.source.startsWith('benchmark')).odds?.length === 1);
const info = JSON.parse(fs.readFileSync(path.join(tmp, 'pref', 'pref-info.json'), 'utf8'));
// idea-12 is in the Forge's 5% hold-out (pod/data.py: md5 of the idea, first 8 hex digits, under 0.05); idea-0 and idea-1 are not
check('the 5% hold-out matches the Forge\'s rule (idea-12 held out, idea-0/1 not) and the benchmark marks add to it', info.pairs_held_out === 2 && info.kind === 'bob', JSON.stringify(info));
const ts = JSON.parse(fs.readFileSync(path.join(tmp, 'pref', 'toolsets.json'), 'utf8'));
check('both folders\' tool sets go along', ts.s1 && ts.s2);
check('the lessons and benchmark folders are only read, never changed', JSON.stringify(fs.readdirSync(tmp, { recursive: true }).filter((f) => !f.startsWith('pref')).sort().map((f) => [f, fs.statSync(path.join(tmp, f)).size])) === JSON.stringify(JSON.parse(before)));
check('an unknown kind is refused', run(['--kind', 'mixed']).status === 1);
check('without --out it explains what it needs', spawnSync(process.execPath, [path.join(app, 'model-lab', 'make-pairs.mjs'), '--lessons', 'x'], { encoding: 'utf8' }).status === 1);

// ---- the reward judge: the Python one (pod/tool_reward.py) must agree with tool-score's on the shared cases ----
const { judgeTurn } = await import(pathToFileURL(path.join(app, 'model-lab', 'tool-judge.mjs')).href);
const cases = JSON.parse(read('model-lab/forge/pod/tool_reward_cases.json'));
check(`the shared judge cases still match tool-score (${cases.length})`, cases.length >= 12 && cases.every((c) => judgeTurn(c.want, c.got) === c.right));
check('the cases cover right, wrong and tool-for-nothing answers', cases.some((c) => c.right) && cases.some((c) => !c.right && !c.want.length) && cases.some((c) => !c.right && c.want.length));
const tr = read('model-lab/forge/pod/tool_reward.py');
check('the reward reads both Qwen tool-call styles and skips the thinking', /<function=/.test(tr) && /json\.loads\(block/.test(tr) && /<\/think>/.test(tr));
check('a tool on a plain chat costs the most (the owner\'s main worry)', /NOTHING, BROKEN = 1\.0, 0\.3, 0\.0, 0\.0, -0\.5, -0\.5/.test(tr));

// ---- the pod side, read: every new way is off unless the plan asks ----
const heal = read('model-lab/forge/pod/heal.py');
check('heal: no pairs and no on-policy unless asked', /"--pref", default=None/.test(heal) && /"--onpolicy-frac", type=float, default=0\.0/.test(heal) && /--onpolicy-frac needs --onpolicy-teacher/.test(heal));
check('heal: held-out pairs measured before and after', /report\["pref_before"\]/.test(heal) && /report\["pref_after"\]/.test(heal));
check('heal: orpo mixes into the heal; dpo and kto are a pass after it from the healed Bob', /a\.pref_kind == "orpo"/.test(heal) && /a\.pref_kind in \("dpo", "kto"\)/.test(heal) && heal.indexOf('P.stage(') > heal.indexOf('while step < steps_total'));
const pref = read('model-lab/forge/pod/pref.py');
check('pref: held out by the lessons\' 5% or the Lab\'s mark', /row\.get\("holdout"\)\) or D\.is_holdout/.test(pref));
check('pref: unsure answers teach nothing', /if k\.get\("ok"\) is None: continue/.test(pref));
const sh = read('model-lab/forge/pod/run.sh');
check('run.sh hands the heal the new options only from the plan', /heal\.py --model \$W\/cut-\$NAME[\s\S]{0,300}\$GEN \$NEWARGS; then/.test(sh) && /pr=r\.get\('pref',h\.get\('pref'\)\)/.test(sh));
check('run.sh: the on-policy teacher is the run\'s own teacher', /\[ -n "\$ONPOLICY" \] && NEWARGS="\$NEWARGS --onpolicy-teacher \$TEACHER_DIR"/.test(sh));
check('run.sh: a reward pass is kept only if the held-out grade is no worse', /r\['after'\]\['reward'\]>=r\['before'\]\['reward'\]/.test(sh) && /reward pass did not help on the held-out chats/.test(sh));
check('run.sh: blends only when the plan lists them, each made into GGUF files to test at home', /MG=\$\(plan "\.get\('merge'\)"\)/.test(sh) && /python3 merge\.py --base \$MB --tuned \$MT/.test(sh));
check('run.sh: the pairs folder is assembled from what the PC sent', /mv \$IN\/pref-\$f \$IN\/pref\/\$f/.test(sh));
const forge = read('model-lab/forge/forge.mjs');
check('forge.mjs sends the pairs folder only when the plan names one, and never the PC path', /if \(plan\.pref\)/.test(forge) && /upload\(`pref-\$\{f\}`/.test(forge) && /delete podPlan\.pref/.test(forge));
const merge = read('model-lab/forge/pod/merge.py');
check('merge: four ways, a cut Bob blended expert by expert through its keep list', ['"linear"', '"ties"', '"dare"', '"dare_ties"'].every((m) => merge.includes(m)) && /bob-keep\.json/.test(merge) && /PER = re\.compile/.test(merge));
const grpo = read('model-lab/forge/pod/grpo.py');
check('grpo: never learns from held-out chats, grades them before and after', /\(test if D\.is_holdout\(l\["idea"\]\) else train\)/.test(grpo) && /report\["after"\] = evaluate/.test(grpo));
const st = read('model-lab/forge/pod/selftest_training.py');
check('the pod\'s dry run covers every new way', ['orpo', 'dpo', 'kto', '--onpolicy-frac', 'grpo.py', 'merge.py'].every((w) => st.includes(w)));

// ---- Help: FAQ in Bob's voice + glossary ----
const help = read('public/help-content.js');
check('Help has an FAQ on the Forge\'s ways to teach', /id: 'faq-forge-ways'/.test(help) && /Kept only if he does better on the held-out chats/.test(help));
check('the glossary has Blend, On-policy teaching and Reward pass', ['<dt>Blend (merge)</dt>', '<dt>On-policy teaching</dt>', '<dt>Reward pass (GRPO)</dt>'].every((d) => help.includes(d)));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
