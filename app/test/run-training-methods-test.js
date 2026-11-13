// New ways for the Forge to teach small Bobs (13 Nov 2026): preference pairs (make-pairs.mjs + heal.py --pref), on-policy
// teaching, the reward pass (grpo.py + tool_reward.py) and blends (merge.py). The pod code needs a card and torch, so here we
// check the Lab side for real (make-pairs on made-up folders, the tool judge on shared cases) and the pod side by reading it:
// everything new is off unless a plan asks, held-out chats are never trained on, and a reward pass that doesn't help is dropped.
// The pod's own dry run on a tiny model is model-lab/forge/pod/selftest_training.py.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync, spawn } from 'node:child_process';
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
check('run.sh hands the heal the new options only from the plan', /heal\.py --model \$W\/cut-\$NAME[\s\S]{0,300}\$GEN \$NEWARGS \$TGT; then/.test(sh) && /pr=r\.get\('pref',h\.get\('pref'\)\)/.test(sh));
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

// ---- one target at a time or several at once (the owner, 13 Nov) ----
const tg = read('model-lab/forge/pod/targets.py');
check('targets: a job belongs to one target, weights are 0 or more', /is in two targets/.test(tg) && /weight must be 0 or more/.test(tg));
check('heal: each target measured on its own and a guard for a loss on any one', /tests\[f"target:\{k\}"\]/.test(heal) && /report\["no_target_worse"\]/.test(heal));
check('run.sh: plan.targets reaches every training step', /\$GEN \$NEWARGS \$TGT; then/.test(sh) && /\$GEN \$TARGS \$TGT \|\| die/.test(sh) && (sh.match(/r\.get\('no_target_worse',True\)/g) || []).length === 2);
check('run.sh: training can start from any model on the drive, and blends stay there for a re-train', /TFROM=\$\(plan "\['train_teacher'\]\.get\('from','teacher'\)"\)/.test(sh) && /mv \$W\/merged-\$MN \$S\/bobs\/\$MN\/model/.test(sh));
check('merge: chosen experts only, the rest from the base or the trained Bob', /--only/.test(merge) && /"rest": "base"/.test(merge) && /chosen experts only/.test(st));
check('surgery: single neurons, whole experts and heads, baked in from a list; dry-run checks it', /\"neuron\"/.test(read('model-lab/forge/pod/surgery.py')) && /full attention/.test(read('model-lab/forge/pod/surgery.py')) && /the chosen neuron is silent/.test(st));
check('facts checks reward the facts, never learn from a fair test', /if "new" in str\(c\.get\("pack", ""\)\): continue/.test(grpo) && /if \(\/new\/\.test\(pack\)\) continue/.test(read('model-lab/make-checks.mjs')));
check('the dry run covers targets', /--targets/.test(st) && /the mix follows the weights/.test(st));

// ---- expert sweep: a made-up Brain Engine answers; more experts per word fixes tools, a scaled-down layer breaks plain chat ----
{
  const http = await import('node:http');
  const state = { used: null, dials: [], keep: null }, calls = [];
  const srv = http.createServer((req, res) => {
    let body = ''; req.on('data', (c) => { body += c; }); req.on('end', () => {
      const j = body ? JSON.parse(body) : {}; calls.push(`${req.method} ${req.url}`);
      const send = (x) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(x)); };
      if (req.url === '/experts-per-word') { if (req.method === 'POST') state.used = j.used; return send({ own: [8, 8, 8, 8], used: state.used }); }
      if (req.url === '/dials') { state.dials = j.dials; return send({ dials: j.dials }); }
      if (req.url === '/expert-mask') { state.keep = j.keep; return send({}); }
      // the made-up brain: calls the reminder tool only with 10+ experts per word; with layer 0's feed-forward turned down it calls a tool on plain chat too
      const plain = !/remind/i.test(j.messages.at(-1).content), more = Array.isArray(state.used) && state.used[0] >= 10, broken = (state.dials || []).some((d) => d.kind === 'ffn' && d.layer === 0 && d.scale < 1);
      const call = (more && !plain) || broken ? [{ type: 'function', function: { name: 'set_reminder', arguments: JSON.stringify({ when: '7:00' }) } }] : undefined;
      send({ choices: [{ message: { content: call ? '' : 'Paris.', ...(call ? { tool_calls: call } : {}) } }] });
    });
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const sw = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-sweep-'));
  fs.mkdirSync(path.join(sw, 'lessons'));
  fs.writeFileSync(path.join(sw, 'lessons', 'toolsets.json'), JSON.stringify({ s1: { system: 'You are Bob.', tools: [{ type: 'function', function: { name: 'set_reminder' } }] } }));
  // held-out ideas by the Forge's rule (md5 under 5%): idea-12, -39, -43, -52, -56
  const L = [['idea-12', 'reminders', 'remind me at 7', true], ['idea-39', 'reminders', 'remind me at 7', true], ['idea-43', 'restraint', 'capital of France?', false], ['idea-52', 'restraint', 'capital of France?', false], ['idea-0', 'reminders', 'remind me at 7', true]];
  fs.writeFileSync(path.join(sw, 'lessons', 'lessons.jsonl'), L.map(([idea, job, q, tool]) => JSON.stringify({ idea, job, messages: [ask(q), { role: 'assistant', set: 's1', content: tool ? '' : 'Paris.', ...(tool ? { tool_calls: [call('set_reminder', { when: '7:00' })] } : {}) }] })).join('\n') + '\n');
  fs.writeFileSync(path.join(sw, 'targets.json'), JSON.stringify({ tools: { jobs: ['reminders'] }, restraint: { jobs: ['restraint'] } }));
  const r2 = await new Promise((resolve) => { const c = spawn(process.execPath, [path.join(app, 'model-lab', 'expert-sweep.mjs'), '--url', `http://127.0.0.1:${srv.address().port}`, '--lessons', path.join(sw, 'lessons'), '--targets', path.join(sw, 'targets.json'), '--used', '-2,+2', '--layer-scale', '0.5', '--groups', '2', '--out', path.join(sw, 'out')], { encoding: 'utf8' }); let e = ''; c.stderr.on('data', (d) => { e += d; }); c.on('close', (code) => resolve({ code, e })); });
  srv.close();
  check('the sweep finishes against a Brain Engine', r2.code === 0, r2.e);
  const f = fs.existsSync(path.join(sw, 'out')) ? fs.readdirSync(path.join(sw, 'out')).find((x) => x.endsWith('.json')) : null;
  const rep = f ? JSON.parse(fs.readFileSync(path.join(sw, 'out', f), 'utf8')) : { results: [] };
  const by = (name) => rep.results.find((x) => x.name === name);
  check('only held-out chats are used, split by target', rep.targets?.tools === 2 && rep.targets?.restraint === 2);
  check('the baseline: tools 0/2, plain chat 2/2', by('as built')?.targets.tools.right === 0 && by('as built')?.targets.restraint.right === 2);
  check('fewer experts per word is tried too (relative to the brain\'s own count)', Boolean(by('experts per word -2')) && by('experts per word -2').targets.tools.change === 0);
  check('more experts per word: tools +2, plain chat unchanged', by('experts per word +2')?.targets.tools.change === 2 && by('experts per word +2')?.targets.restraint.change === 0 && !by('experts per word +2').mixed);
  const hurt = by('ffn x0.5, layers 0-1');
  check('a layer turned down that fixes one target and breaks another is flagged as mixed', hurt?.targets.restraint.change === -2 && hurt?.targets.tools.change === 2 && hurt.mixed === true, JSON.stringify(hurt));
  check('attention is swept separately from the feed-forward', Boolean(by('attn x0.5, layers 0-1')));
  check('the engine is put back at the end (own counts, no dials, every expert on)', state.used === null && Array.isArray(state.dials) && !state.dials.length && state.keep === null);
  fs.rmSync(sw, { recursive: true, force: true });
}

// ---- clean-lessons: a new version, the old one only read ----
{
  const cl = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-clean-'));
  const put = (p, t) => { fs.mkdirSync(path.dirname(path.join(cl, p)), { recursive: true }); fs.writeFileSync(path.join(cl, p), t); };
  const rows = (r) => r.map((x) => JSON.stringify(x)).join('\r\n') + '\r\n';
  put('v3/lessons/toolsets.json', JSON.stringify({ s1: { system: 'You are Bob.', tools: [{ type: 'function', function: { name: 'web_search' } }] } }));
  put('v3/lessons/lessons.jsonl', rows([
    { idea: 'i1', job: 'chat', think: false, messages: [ask('hello there'), { role: 'assistant', set: 's1', content: 'Hi.' }] },
    { idea: 'i2', job: 'chat', think: false, messages: [ask('Hello there!'), { role: 'assistant', set: 's1', content: 'Hey.' }] },
    { idea: 'i3', job: 'chat', think: true, messages: [ask('hello there'), { role: 'assistant', set: 's1', content: 'Hi (thought).' }] },
    { idea: 'i4', job: 'web', think: false, messages: [ask('news?'), { role: 'assistant', set: 's1', content: '', tool_calls: [call('made_up_tool')] }] },
    { idea: 'i5', job: 'web', think: false, messages: [ask('news today?'), { role: 'assistant', set: 's1', content: 'I cannot access the internet.' }] }
  ]));
  put('v3/kimi-traces/lessons.jsonl', rows([{ idea: 'k1', job: 'ext-agent', messages: [ask('x'), { role: 'assistant', content: 'y' }] }]));
  put('review.json', JSON.stringify({ wrong: [{ folder: 'lessons', idea: 'i5', why: 'web search was offered' }] }));
  const before = fs.readFileSync(path.join(cl, 'v3/lessons/lessons.jsonl'), 'utf8');
  const go = (o) => spawnSync(process.execPath, [path.join(app, 'model-lab', 'clean-lessons.mjs'), '--from', path.join(cl, 'v3'), '--out', o, '--review', path.join(cl, 'review.json')], { encoding: 'utf8' });
  const r = go(path.join(cl, 'v4'));
  check('clean-lessons finishes', r.status === 0, r.stderr);
  const kept = fs.readFileSync(path.join(cl, 'v4/lessons/lessons.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).idea);
  const rej = fs.readFileSync(path.join(cl, 'v4/lessons/rejected.jsonl'), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  check('clean-lessons drops a call to a tool that was not offered', !kept.includes('i4'));
  check('clean-lessons keeps one copy of a repeated prompt, but both thinking modes', kept.filter((i) => ['i1', 'i2'].includes(i)).length === 1 && kept.includes('i3'), kept.join(','));
  check('clean-lessons moves a reviewed lesson to the wrong side with its reason', !kept.includes('i5') && rej[0]?.idea === 'i5' && /offered/.test(rej[0].why));
  check('clean-lessons moves other models\' answers to distill/', fs.existsSync(path.join(cl, 'v4/distill/kimi-traces/lessons.jsonl')) && !fs.existsSync(path.join(cl, 'v4/kimi-traces')));
  check('clean-lessons writes train and heal weights', JSON.parse(fs.readFileSync(path.join(cl, 'v4/targets-train.json'), 'utf8')).light.weight === 0.5 && JSON.parse(fs.readFileSync(path.join(cl, 'v4/targets-heal.json'), 'utf8')).light.weight === 1);
  check('clean-lessons never changes the old version', fs.readFileSync(path.join(cl, 'v3/lessons/lessons.jsonl'), 'utf8') === before);
  put('v3/lessons-fic/lessons.jsonl', rows([{ idea: 'f1', job: 'writing', messages: [ask('Write a scene where a villain poisons the king'), { role: 'assistant', content: "I can't help with that." }] }]));
  const r2 = go(path.join(cl, 'v4b'));
  check('clean-lessons lists a refusal in a fiction ask to read by hand', r2.status === 0 && /"f1"/.test(fs.readFileSync(path.join(cl, 'v4b/flagged.jsonl'), 'utf8')), r2.stderr);
  const r3 = spawnSync(process.execPath, [path.join(app, 'model-lab', 'clean-lessons.mjs'), '--from', path.join(cl, 'v3/lessons-fic'), '--out', path.join(cl, 'one')], { encoding: 'utf8' });
  check('clean-lessons takes a single lesson set too', r3.status === 0 && fs.existsSync(path.join(cl, 'one/lessons-fic/lessons.jsonl')), r3.stderr);
  // a mix with repeats, an old full copy beside it, and a held-out file of its own
  const facts = { idea: 'fx', job: 'facts', messages: [ask('who wrote it?'), { role: 'assistant', content: 'She did.' }] };
  put('mix/lessons.jsonl', rows([facts, facts, facts, { idea: 'g2', job: 'chat', messages: [ask('hey'), { role: 'assistant', content: 'Hi.' }] }]));
  put('mix/lessons-full.jsonl', rows([facts, { idea: 'zz', messages: [ask('old'), { role: 'assistant', content: 'old' }] }]));
  put('mix/new-folded.jsonl', rows([{ idea: 'n1', job: 'chat', messages: [ask('fold'), { role: 'assistant', content: 'ok' }] }]));
  put('mix/new-folded-heldout.jsonl', rows([{ idea: 'h1', job: 'chat', messages: [ask('hey'), { role: 'assistant', content: 'Hello.' }] }]));
  const lines = (p) => fs.readFileSync(path.join(cl, p), 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l).idea);
  const mixGo = (o2, extra = []) => spawnSync(process.execPath, [path.join(app, 'model-lab', 'clean-lessons.mjs'), '--from', path.join(cl, 'mix'), '--out', path.join(cl, o2), ...extra], { encoding: 'utf8' });
  put('mix2/lessons.jsonl', rows([0, 1, 2].map((r) => ({ ...facts, idea: `fx-r${r}` }))));
  const m0 = spawnSync(process.execPath, [path.join(app, 'model-lab', 'clean-lessons.mjs'), '--from', path.join(cl, 'mix2'), '--out', path.join(cl, 'mix2-v4')], { encoding: 'utf8' });
  check('clean-lessons keeps a mix\'s copies named idea-r0, idea-r1 ...', m0.status === 0 && lines('mix2-v4/mix2/lessons.jsonl').length === 3, m0.stderr);
  const m1 = mixGo('mix-v4');
  check('clean-lessons keeps a mix\'s repeated copies of the same lesson', m1.status === 0 && lines('mix-v4/mix/lessons.jsonl').filter((i) => i === 'fx').length === 3, m1.stderr);
  check('clean-lessons reads lessons.jsonl and leaves a full copy beside it out', !fs.existsSync(path.join(cl, 'mix-v4/mix/lessons-full.jsonl')));
  const m2 = mixGo('mix-v4b', ['--files', 'new-folded*.jsonl']);
  check('clean-lessons --files picks other files and writes each under its own name', m2.status === 0 && lines('mix-v4b/mix/new-folded.jsonl').join() === 'n1' && lines('mix-v4b/mix/new-folded-heldout.jsonl').join() === 'h1', m2.stderr);
  const m3 = spawnSync(process.execPath, [path.join(app, 'model-lab', 'clean-lessons.mjs'), '--from', cl, '--sets', 'mix', '--files', 'lessons.jsonl,new-folded-heldout.jsonl', '--out', path.join(cl, 'mix-v4c')], { encoding: 'utf8' });
  check('clean-lessons --sets picks named sets; a held-out file is never thinned', m3.status === 0 && !fs.existsSync(path.join(cl, 'mix-v4c/v3')) && fs.readFileSync(path.join(cl, 'mix-v4c/mix/new-folded-heldout.jsonl'), 'utf8').includes('"h1"') && !fs.readFileSync(path.join(cl, 'mix-v4c/mix/lessons.jsonl'), 'utf8').includes('"g2"'), m3.stderr + m3.stdout);
  check('clean-lessons refuses to write into the old version or a full folder', go(path.join(cl, 'v3', 'lessons', 'v4')).status === 1 && go(path.join(cl, 'v3')).status === 1 && go(path.join(cl, 'v4')).status === 1);
  fs.rmSync(cl, { recursive: true, force: true }); fs.rmSync(cl + '-v4c', { recursive: true, force: true });
}

// ---- Help: FAQ in Bob's voice + glossary ----
const help = read('public/help-content.js');
check('Help has an FAQ on the Forge\'s ways to teach', /id: 'faq-forge-ways'/.test(help) && /Kept only if he does better on the held-out chats/.test(help));
check('the glossary has Blend, On-policy teaching and Reward pass', ['<dt>Blend (merge)</dt>', '<dt>On-policy teaching</dt>', '<dt>Reward pass (GRPO)</dt>'].every((d) => help.includes(d)));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
