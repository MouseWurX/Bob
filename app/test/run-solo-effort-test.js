// 16 Nov 2026: Effort on one brain (src/solo-effort.js). Bob's loop enforces each level's steps; these checks run the
// loop with fake brains (plain functions in, plain arrays out). Nothing here reads the real computer.
import fs from 'node:fs';
import { soloEffortOn, soloJob, soloLevel, soloThink, soloVerdict, notHappy, planSteps, soloMinutes, soloRun, soloBrain, soloPrompt, SOLO_ROUNDS, MAX_JOBS, planGateTask, PLAN_NOTE } from '../src/solo-effort.js';
import { stepThink } from '../src/step-thinking.js';
import { careful, draftBrain, reviewBrain } from '../src/moot.js';
import { HELP } from '../public/help-content.js';
import { OPT_IN } from '../src/crash-catch.js';

let pass = 0, fail = 0;
const check = (name, ok) => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}`); };
const read = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const on = { soloEffort: true, models: { bob: 'main-brain', reviewer: 'review-brain' }, sessionBrains: { deep: 'deep-brain' } };
const job = (effort, extra = {}) => ({ effort, ...extra });

// ---- off by default, and only for the owner's own jobs ----
check('off unless switched on', !soloEffortOn({}) && soloEffortOn(on) && OPT_IN.includes('soloEffort'));
check('side jobs and guests keep their usual way', soloJob(on, job('high')) && !soloJob(on, job('high', { side: true })) && !soloJob(on, job('high', { guest: {} })) && !soloJob({}, job('high')));
check('High and Max get Bob\'s own review turns; Low and Medium only set thinking', soloLevel(on, job('high')) === 'high' && soloLevel(on, job('extreme')) === 'max' && soloLevel(on, job('medium')) === null && soloLevel(on, job('low')) === null);

// ---- thinking per level ----
const t = (effort, o, extra) => soloThink(on, job(effort, extra), o);
check('Low: thinking off for everything', [{}, { doing: true }, { lastRound: true }].every((o) => t('low', { think: 'high', ...o }) === false));
check('Medium: thinks to plan, not for the doing or the answer', t('medium', { think: 'medium' }) === 'medium' && t('medium', { think: 'medium', doing: true }) === false && t('medium', { think: 'medium', lastRound: true }) === false);
check('Medium: a turn with no thinking set still plans with thinking on', t('medium', { think: undefined }) === true && t('medium', { think: false }) === true);
check('High: the same as Medium for plan and doing', t('high', { think: 'high' }) === 'high' && t('high', { think: 'high', doing: true }) === false);
check('Max: thinking on for everything', [{}, { doing: true }, { lastRound: true }].every((o) => t('extreme', { think: false, ...o }) === 'high'));
check('Bob\'s loop sets the phase: a plan phase thinks even after tools, a doing phase never does', t('high', { think: 'high', doing: true }, { soloPhase: 'plan' }) === 'high' && t('high', { think: 'high' }, { soloPhase: 'do' }) === false);
check('switched off: step thinking decides as before', soloThink({}, job('low'), { think: 'high' }) === undefined && stepThink({}, { think: 'high', job: job('low') }) === 'high');
check('step thinking asks it first', stepThink(on, { think: 'high', job: job('low') }) === false && stepThink(on, { think: 'medium', doing: true, job: job('medium') }) === false);
check('the Medium prompt never promises a reviewer; High and Max say he reviews his own work', !/review/i.test(soloPrompt('medium')) && /review your own work/.test(soloPrompt('high')) && /Max/.test(soloPrompt('extreme')) && soloPrompt('low') === '');

// ---- one brain, no swaps ----
check('the main brain drafts and reviews; no Deep thinking or Review brain', draftBrain(on, 'high').model === 'main-brain' && reviewBrain(on).model === 'main-brain' && soloBrain(on).model === 'main-brain' && soloBrain(on).solo === true);
check('switched off: the moot keeps its brains', draftBrain({ ...on, soloEffort: false }, 'high').model === 'deep-brain' && reviewBrain({ ...on, soloEffort: false }).model === 'review-brain');
check('the old moot doesn\'t also run', !careful(job('high', { solo: true })) && careful(job('high')));


// ---- words ----
check('a review is "Looks right." or "Improve it:"', soloVerdict('Looks right. All good.') === 'ok' && soloVerdict('Improve it: 1. the sum is wrong') === 'improve' && soloVerdict('hmm') === 'improve');
check('"Not happy with:" is read out of the improved answer', notHappy('Done.\nNot happy with: the test never ran.') === 'the test never ran.' && notHappy('All done.') === '');
check('plan steps come from numbered lines, at most 6', planSteps('Plan:\n1. Read the file\n2) Change the loop\n**3.** Run the tests\nNot a step').length === 3 && planSteps(Array.from({ length: 9 }, (_, i) => `${i + 1}. step ${i}`).join('\n')).length === MAX_JOBS && planSteps('no numbers').length === 0);
check('the result line says plainly when something is still open', /nothing open/.test(soloMinutes('high', [{ kind: 'check', n: 1, verdict: 'ok' }])) && /not checked again\. Not happy with: x/.test(soloMinutes('high', [{ kind: 'check', n: 1, verdict: 'improve' }, { kind: 'improve', unhappy: 'x' }])));

// ---- the loop, with a fake brain ----
async function fake(level, reviews, { stop = false, plan = '1. Look it up\n2. Write it down', plan2 = null, repeatAt = false, cards = null, tools = false, answer = 'Final answer: the list is written down and checked, both steps done.' } = {}) {
  const msgs = [{ role: 'user', content: 'do the thing' }];
  const calls = [], said = [];
  const signal = { aborted: false };
  const run = async (note, o = {}) => {
    calls.push({ note: note || '', ...o });
    const content = /That isn't a plan yet/.test(note || '') ? (plan2 ?? plan) : /planning|Improve the plan|wants a change/.test(note || '') ? plan : /Improve it\./.test(note || '') ? 'Better answer.\nNot happy with: one link is old.' : /the answer\./.test(note || '') ? answer : 'Did the step. It worked, and reading the output back showed it.';
    if (tools && o.phase === 'do' && /step 1 of|whole ask now/.test(note || '')) { msgs.push({ role: 'assistant', content: '', tool_calls: [{ id: 't1', function: { name: 'board_post', arguments: '{"text":"car registration due"}' } }] }); msgs.push({ role: 'tool', tool_call_id: 't1', content: 'Posted to the comm board.' }); }
    msgs.push({ role: 'assistant', content });
    if (stop) signal.aborted = true;
    return { repeatStop: Boolean(repeatAt && /step 1 of/.test(note || '')) };
  };
  const review = async (task, o = {}) => { calls.push({ review: task, ...o }); return reviews.shift() || 'Looks right.'; };
  const brain = { cfg: { userName: 'Sam' }, log: () => {} };
  let shownPlan = false;
  const card = cards ? async (steps) => { calls.push({ card: steps }); return cards.shift() || { no: true }; } : null;
  const res = await soloRun(brain, level, { run, review, emit: (e) => said.push(e), signal, msgs, turnText: 'do the thing', card, planShown: () => { shownPlan = true; }, forget: () => calls.push({ forgot: true }) });
  return { res, calls, msgs, said, shownPlan };
}
{
  const { calls, res } = await fake('high', ['Looks right.']);
  check('High: the job, then a forced review, nothing more when it looks right', calls.length === 2 && calls[0].note === '' && calls[1].review && /Review your own work/.test(calls[1].review) && /nothing open/.test(res.minutes));
}
{
  const { calls, res, msgs } = await fake('high', ['Improve it: the date is wrong']);
  const imp = calls[2];
  check('High: one round to improve it, as a doing step, with "Improve it" wording', calls.length === 3 && imp.phase === 'do' && /^Improve it\./.test(imp.note) && /the date is wrong/.test(imp.note) && /Not happy with:/.test(imp.note));
  check('High: no second review; the result says so and what he isn\'t happy with', !calls.slice(3).some((c) => c.review) && /not checked again\. Not happy with: one link is old/.test(res.minutes) && msgs.at(-1).moot === 'minutes');
}
{
  const { calls, res } = await fake('max', ['Looks right.', 'Looks right.']);
  const kinds = calls.map((c) => (c.review ? (/Review your plan/.test(c.review) ? 'gate' : 'review') : c.phase));
  check('Max: plan (with tools to look, changing nothing), plan gate, each step as its own job, whole review, then the answer', JSON.stringify(kinds) === JSON.stringify(['plan', 'gate', 'do', 'do', 'answer', 'review']) && !calls[0].noTools && /you can only look/.test(calls[0].note) && calls[4].noTools === true);
  check('the 16 Nov distill results: steps with no tools say so in words, and the answer is the only reply shown', /no tool calls written out/.test(calls[1].review) && /no tool calls written out/.test(calls[4].note) && /the only reply the user sees/.test(calls[4].note) && /Don't repeat the plan/.test(calls[4].note));
  check('Max: each job gets its own step and the whole plan', /step 1 of 2: Look it up/.test(calls[2].note) && /step 2 of 2: Write it down/.test(calls[3].note) && /The whole plan/.test(calls[3].note));
  check('Max: the result line counts the jobs', /2 jobs done/.test(res.minutes) && /nothing open/.test(res.minutes) && /^🛰 \*\*Maximus:\*\*/.test(res.minutes));
  check('Max: the plan check runs with no tools; the final review keeps its read-only tools', calls[1].noTools === true && !calls[5].noTools);
}
{
  const { calls, res } = await fake('max', [], { repeatAt: true });
  check('Max: when the repeat guard stops a job, the next jobs don\'t start; the review still runs', calls.filter((c) => c.phase === 'do').length === 1 && calls.some((c) => c.review && /Review your own work/.test(c.review)) && /stopped before job 2/.test(res.minutes));
}
{
  const { calls, res } = await fake('max', ['Improve it: step 2 is too big', 'Improve it: still too big', 'Improve it: a', 'Improve it: b']);
  const gates = calls.filter((c) => c.review && /Review your plan/.test(c.review)).length;
  const reviews = calls.filter((c) => c.review && /Review your own work/.test(c.review)).length;
  const improves = calls.filter((c) => /^Improve it\./.test(c.note || '')).length;
  check(`Max: every gate stops after ${SOLO_ROUNDS} reviews`, gates === SOLO_ROUNDS && reviews === SOLO_ROUNDS && improves === SOLO_ROUNDS);
  check('Max: only the last improve round is asked to say what he isn\'t happy with', calls.filter((c) => /^Improve it\./.test(c.note || '')).map((c) => /Not happy with:/.test(c.note)).join() === 'false,true');
  check('Max: an unfinished result is said plainly', /points still open/.test(res.minutes) && /not checked again\. Not happy with: one link is old/.test(res.minutes));
}
{
  const { calls, res } = await fake('max', [], { stop: true });
  check('Stop ends it after the current part, with no review and no result line', calls.length === 1 && !res.minutes);
}
{
  const { calls } = await fake('max', ['Looks right.', 'Looks right.'], { plan: 'I will just do it.' });
  check('Max: a plan with no numbered steps runs the ask as one job', calls.filter((c) => c.phase === 'do').length === 1);
}
// 16 Nov saved runs: 85 of 100 Max "plans" were the answer itself.
{
  const { calls, res, msgs } = await fake('max', ['Looks right.'], { plan: 'The fix is to add set -e to the hook. That is the whole answer, really.' });
  const plans = calls.filter((c) => c.phase === 'plan');
  check('Max: an answer posing as a plan gets one more go, with an example plan', plans.length === 2 && /That isn't a plan yet/.test(plans[1].note) && /1\. Read the settings file/.test(plans[1].note));
  check('Max: still no plan: the repeat guard forgets the plan tries before the one job', calls.findIndex((c) => c.forgot) > -1 && calls.findIndex((c) => c.forgot) < calls.findIndex((c) => c.phase === 'do') && /job\.soloSeen\?\.clear\?\.\(\)/.test(read('src/brain-turns.js')));
  check('Max: still no plan: no plan gate, the tries leave the chat, one job, then the answer and its review', !calls.some((c) => c.review && /Review your plan/.test(c.review)) && !msgs.some((m) => /The fix is to add/.test(m.content)) && /whole ask now/.test(calls.find((c) => c.phase === 'do').note) && calls.some((c) => c.review && /Review your own work/.test(c.review)) && /no step-by-step plan came, so one job/.test(res.minutes));
}
{
  const { calls } = await fake('max', ['Looks right.', 'Looks right.'], { plan: 'Sure, here you go.', plan2: '1. Read the hook\n2. Write the answer' });
  check('Max: the second go makes a real plan, and it is checked and split', calls.filter((c) => c.review && /Review your plan/.test(c.review)).length === 1 && calls.filter((c) => /step \d of 2/.test(c.note || '')).length === 2);
}
{
  const { calls } = await fake('max', ['Looks right.', 'Improve it: say when it is due'], { tools: true });
  const answer = calls.find((c) => c.phase === 'answer'), rev = calls.filter((c) => c.review && /Review your own work/.test(c.review)), imp = calls.find((c) => /^Improve it\./.test(c.note || ''));
  // 16 Nov rental: "The note's already on the comm board... Nothing added." about the note Bob had just posted.
  check('Max: the answer, its reviews and the improve round get the record of what Bob did this turn', [answer.note, rev[0].review, imp.note].every((t) => /What YOU did this turn/.test(t) && /board_post \{"text":"car registration due"\} → Posted to the comm board\./.test(t) && /never as "already done"/.test(t)));
  check('no tools ran: no record is added', !/What YOU did/.test((await fake('max', ['Looks right.', 'Looks right.'])).calls.find((c) => c.phase === 'answer').note));
}
{
  const { planSteps: ps, lookOnly } = await import('../src/solo-effort.js');
  // Diagnosis, 16 Nov rental (5 of 6 Max jobs ran with no plan): the plan step had every tool, so it often did the job.
  check('plan steps are read in the shapes brains write them', ps('### Step 1: Read the board\n### Step 2: Post the note').length === 2 && ps('- Step 1 — Read it\n- Step 2 — Post it').length === 2 && ps('1 - Read it').length === 1 && ps('**1.** Read it').length === 1);
  check('a small ask can be a one-step plan', ps('1. Post the note on the comm board. Worked if reading the board shows it.').length === 1);
  const tools = { write_file: { check: () => true }, read_file: {}, notice_board: {}, take_note: {}, web_search: {} };
  check('the plan step only looks: changing tools and read-and-change tools wait for the jobs', lookOnly('read_file', tools) && lookOnly('web_search', tools) && !lookOnly('write_file', tools) && !lookOnly('notice_board', tools) && !lookOnly('take_note', tools));
  const ro = read('src/brain-run-on.js');
  // 16 Nov effort-tools test: the plan step saved a file it wasn't offered, and "This asks for 2 things" came after the plan note.
  check('the plan step never runs a changing call, even one it wasn\'t offered', /if \(planPhase\) \{\s*const wait = reply\.tool_calls\.filter\(\(c\) => !lookOnly\(/.test(ro) && ro.indexOf('if (planPhase) {') < ro.indexOf('const held = await planGate('));
  check('the plan note is the newest thing the brain reads, with no "this asks for N things" line', /!job\?\.guest && !planPhase\) \{ ctx\.stepsAsked/.test(ro) && ro.indexOf("if (!again && soloNote) msgs.push") > ro.indexOf('ctx.stepsAsked = askedSteps(text)'));
  { const { nudgeOk } = await import('../src/loop-guard.js');
    // Effort-tools test: "Sam asked for a file saved" sent the plan step back to save it.
    check('the plan step gets no "go and do it" nudges or end-of-turn retries', !nudgeOk({ job: { solo: true, soloPhase: 'plan' } }) && nudgeOk({ job: { solo: true, soloPhase: 'do' } }) && /checkTurn\(ctx, reply, again\) \{\s*if \(planStep\(ctx\)\) return false;/.test(read('src/brain-tool-runs.js'))); }
  check('wired in: the plan step\'s tools are filtered', /job\.soloPhase === 'plan'\) tools = tools\.filter\(\(t\) => lookOnly\(/.test(read('src/brain-run-on.js')));
}
check('the plan gate asks whether each step is Bob\'s own, not advice for the user', /something you do yourself/.test(planGateTask('1. a\n2. b')) && /advice for the user goes in the answer/.test(PLAN_NOTE));
// The owner (16 Nov): robust, well reviewed answers. The reviews read the answer itself, and the improved one is shown.
{
  const { calls, msgs } = await fake('max', ['Looks right.', 'Improve it: the second row is wrong', 'Looks right.']);
  const kinds = calls.map((c) => (c.review ? (/Review your plan/.test(c.review) ? 'gate' : 'review') : c.phase));
  const last = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.moot);
  check('Max: answer, review, improve the answer, review again; the shown reply is the improved answer', JSON.stringify(kinds.slice(4)) === JSON.stringify(['answer', 'review', 'do', 'review']) && /answer .* will see on its own/.test(calls[5].review) && /^Better answer\./.test(last.content));
  check('an improve round is told its reply is the one shown, in full', /the only reply the user sees/.test(calls[6].note) && /never point to "above"/.test(calls[6].note));
}
{
  const { calls, msgs, res } = await fake('high', ['Improve it: add the date'], { });
  const last = [...msgs].reverse().find((m) => m.role === 'assistant' && !m.moot);
  check('High: the review reads the answer, and the improved answer is the one shown', /will see on its own/.test(calls[1].review) && /^Better answer\./.test(last.content) && /not checked again/.test(res.minutes));
}
// "Plan before big jobs" on: Max's checked plan goes on the plan card.
{
  const { calls, shownPlan, res } = await fake('max', [], { cards: [{ go: true }] });
  const at = calls.findIndex((c) => c.card);
  check('Max + plan card: the checked plan goes on the card before any job, then the jobs run without another card', at === 2 && JSON.stringify(calls[at].card) === JSON.stringify(['Look it up', 'Write it down']) && calls.slice(at + 1).filter((c) => c.phase === 'do').length >= 2 && shownPlan && /you said go ahead/.test(res.minutes));
}
{
  const { calls } = await fake('max', [], { cards: [{ change: 'skip the lookup' }, { go: true }] });
  check('Max + plan card: a change on the card makes a new plan with their words, shown again', calls.filter((c) => c.card).length === 2 && calls.some((c) => c.phase === 'plan' && /wants a change: "skip the lookup"/.test(c.note)));
}
{
  const { calls, msgs, shownPlan, res } = await fake('max', [], { cards: [{ no: true }] });
  check('Max + plan card: Not now means no job runs, and he says so', !calls.some((c) => c.phase === 'do') && /haven't started any of it/.test(msgs.at(-1).content) && !shownPlan && !res.minutes);
}
{
  const { calls } = await fake('max', []);
  check('Plan card setting off: no card', !calls.some((c) => c.card));
}
check('the plan card is wired to Max: shown by the loop, and no second card for the jobs', /solo === 'max' && planOn\(this\.cfg\)/.test(read('src/brain-turns.js')) && /job\?\.soloPlanShown \? \{ planShown: true \}/.test(read('src/brain-run-on.js')) && /ctx\.planChange = note/.test(read('src/plan.js')) && /soloPhase === 'plan'\) return 'Not now: just write the plan/.test(read('src/plan.js')));

// ---- a whole Max job through Bob's real loop, with a scripted brain ----
{
  const os = await import('node:os'); const path = await import('node:path');
  const { Brain } = await import('../src/brain.js');
  const { weakAnswer } = await import('../src/solo-effort.js');
  const job = async (script) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob solo '));
    const inn = path.join(tmp, 'inn'), dataDir = path.join(inn, 'bob'); fs.mkdirSync(dataDir, { recursive: true });
    const brain = new Brain({ agentDir: tmp, innDir: inn, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [inn], readOnlyRoots: [], recycleBin: false, userName: 'Sam', models: { bob: 'qwen3.6-35b-a3b' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', soloEffort: true }, () => {});
    clearInterval(brain.reminderTimer);
    brain.ensureModel = async () => {}; brain.fitCtx = async (m, c) => c; brain.recall = async () => '';
    brain.engine = { chat: async () => ({ role: 'assistant', content: script.shift() || 'ok' }), isLoaded: async () => true, loaded: async () => [] };
    const evs = [];
    await brain.run('s1', 'make me a small table', (e) => evs.push(e), new AbortController().signal, [], { id: 'j1', effort: 'extreme', state: 'running' });
    const shown = brain.session('s1').filter((m) => m.role === 'assistant' && !m.tool_calls?.length && !m.step && !m.moot);
    return { shown, final: evs.find((e) => e.type === 'final')?.text || '' };
  };
  const table = 'Here is the table:\n| a | b |\n|---|---|\n| 1 | 2 |';
  const good = await job(['1. Write the table\n2. Check it', 'Looks right.', table, 'Checked it.', `The table you asked for:\n| a | b |\n|---|---|\n| 1 | 2 |\nNothing is left open.`, 'Looks right.']);
  check('Max in the real loop: exactly one shown answer, the written one, and it holds the result', good.shown.length === 1 && /\| 1 \| 2 \|/.test(good.shown[0].content) && good.final === good.shown[0].content);
  const filler = await job(['1. Write the table\n2. Check it', 'Looks right.', table, 'Checked it.', "I'm here whenever you're ready.", 'See the table above.', 'Looks right.', 'Done.']);
  check('Max: a filler answer gets one more go, then the job reports are the answer; never a review note', filler.shown.length === 1 && /\| 1 \| 2 \|/.test(filler.shown[0].content) && !/My own review|Looks right/.test(filler.shown[0].content) && !/what the jobs did/i.test(filler.shown[0].content));
  check('weak answers are spotted', ['', "I'm here whenever you're ready.", 'My own review: Looks right.', 'The table is shown above, all done.', '<tool_call>{"name":"write_file"}</tool_call> Done.'].every(weakAnswer) && !weakAnswer(table + '\nAll four cells are filled in from your numbers.'));
}

// ---- wired in ----
const turns = read('src/brain-turns.js'), runOn = read('src/brain-run-on.js'), hats = read('src/brain-hats.js');
check('a job runs through soloRun at High and Max, with the main brain for reviews', /soloRun\(this, solo,/.test(turns) && /this\.runHat\('reviewer', task, out\.ctx, soloBrain\(this\.cfg, o\)\)/.test(turns) && /job\.solo = soloJob\(this\.cfg, job\)/.test(turns));
check('each part is the same ask run again with a hidden note; the plan has no tools', /Boolean\(job\?\.soloAgain\)/.test(runOn) && /noTools: Boolean\(job\?\.soloNoTools\)/.test(runOn) && /lastRound: Boolean\(ctx\.lastRound\), retryThinks, job \}\)/.test(runOn));
check('his own review never goes to another Bob or a second brain', (hats.match(/!force\.solo/g) || []).length === 2 && /wantsBorrowedCheck = .*careful\(job\)/.test(read('src/bob-net-check.js')) && /!ctx\.job\?\.solo && cleanEffort\(ctx\.job\?\.effort\) === 'extreme'/.test(hats));
check('the setting is saved, shown and explained', /'soloEffort'/.test(read('src/config.js')) && /soloEffort: cfg\.soloEffort === true/.test(read('src/server.js')) && /sswitch\('soloEffort', settings\.soloEffort === true, 'Effort on one brain'/.test(read('public/cellar-pages.js')) && /dataset\.set === 'soloEffort'/.test(read('public/cellar.js')));
check('the Effort button shows Max and the one-brain hints when it is on', /extreme: 'Thinks throughout/.test(read('public/effort.js')) && /'Max'/.test(read('public/effort.js')) && /effort\.solo\(st\.soloEffort === true\)/.test(read('public/app.js')));
const effortJs = await import('../public/effort.js');
check('the levels are named Minimus, Medius, Magnus and Maximus, with the plain level under each', JSON.stringify(effortJs.NAMES) === JSON.stringify({ low: 'Minimus', medium: 'Medius', high: 'Magnus', extreme: 'Maximus' }) && effortJs.plainLevel('extreme', true) === 'Max' && effortJs.plainLevel('extreme') === 'Extreme' && /<b id="effortNow">Minimus<\/b>/.test(read('public/index.html')) && ['Minimus', 'Medius', 'Magnus', 'Maximus'].every((n) => read('public/index.html').includes(`<b>${n}</b>`)));
const { effortSpeed, EFFORT_SPEED } = await import('../src/effort-speed.js');
check('no speeds until the benchmark measures a family; then times as long as Minimus', Object.keys(EFFORT_SPEED).length === 0 && effortSpeed('Qwen3.6-35B-A3B-Q4.gguf') === null && effortJs.speedText(null, 'high') === '' && JSON.stringify(effortSpeed('Qwen3.6-35B-A3B-Q4.gguf', { 'qwen3.5': { medium: 1.44, high: 2.2, extreme: 6 } })) === JSON.stringify({ family: 'qwen3.5', low: 1, medium: 1.4, high: 2.2, extreme: 6 }) && effortJs.speedText({ high: 2.2 }, 'high') === '2.2×');
check('the speed reaches the Effort button', /effortSpeed: effortSpeed\(cfg\.models\?\.bob\)/.test(read('src/server.js')) && (read('public/app.js').match(/effort\.speed\(st\.effortSpeed\)/g) || []).length === 2);
check('the 16 Nov distill fixes: reviews think on a budget, the plan check has no tools', soloBrain(on).think === 'medium' && soloBrain(on, { noTools: true }).noTools === true && /const stepTools = last \|\| noTools \? \[\]/.test(hats) && /noTools: force\?\.noTools === true/.test(hats));
check('a helper reply runs each identical call once and at most MAX_CALLS_PER_REPLY', /if \(keys\.has\(k\) \|\| keys\.size >= MAX_CALLS_PER_REPLY\)/.test(hats) && /droppedNote\(dropped, MAX_CALLS_PER_REPLY\)/.test(hats));
check('the repeat guard is shared by every part of a job', /Object\.defineProperty\(job, 'soloSeen'/.test(turns) && /callsSeen: job\.soloSeen/.test(runOn) && /return \{ repeatStop: Boolean\(out\.ctx\?\.repeatStop\) \}/.test(turns));
const help = HELP.find((e) => e.id === 'effort'), faq = HELP.find((e) => e.id === 'faq-solo-effort'), gl = HELP.find((e) => e.id === 'glossary');
check('Help, an FAQ in Bob\'s voice and the glossary', /Effort on one brain/.test(help.html) && /Windows, Mac, Linux and a phone/.test(help.html) && faq && /My loop enforces each step/.test(faq.html) && /<dt>Effort on one brain<\/dt>/.test(gl.html) && ["Minimus", "Medius", "Magnus", "Maximus"].every((n) => gl.html.includes(`<dt>${n}</dt>`)));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
