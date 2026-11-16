// 16 Nov 2026: Effort on one brain (src/solo-effort.js). Bob's loop enforces each level's steps; these checks run the
// loop with fake brains (plain functions in, plain arrays out). Nothing here reads the real computer.
import fs from 'node:fs';
import { soloEffortOn, soloJob, soloLevel, soloThink, soloVerdict, notHappy, planSteps, soloMinutes, soloRun, soloBrain, soloPrompt, SOLO_ROUNDS, MAX_JOBS } from '../src/solo-effort.js';
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
async function fake(level, reviews, { stop = false, plan = '1. Look it up\n2. Write it down' } = {}) {
  const msgs = [{ role: 'user', content: 'do the thing' }];
  const calls = [], said = [];
  const signal = { aborted: false };
  const run = async (note, o = {}) => {
    calls.push({ note: note || '', ...o });
    const content = /planning|Improve the plan/.test(note || '') ? plan : /Improve it\./.test(note || '') ? 'Better answer.\nNot happy with: one link is old.' : /the answer\./.test(note || '') ? 'Final answer.' : 'Did the step. Worked.';
    msgs.push({ role: 'assistant', content });
    if (stop) signal.aborted = true;
  };
  const review = async (task) => { calls.push({ review: task }); return reviews.shift() || 'Looks right.'; };
  const brain = { cfg: { userName: 'Sam' }, log: () => {} };
  const res = await soloRun(brain, level, { run, review, emit: (e) => said.push(e), signal, msgs, turnText: 'do the thing' });
  return { res, calls, msgs, said };
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
  check('Max: plan (no tools), plan gate, each step as its own job, whole review, then the answer', JSON.stringify(kinds) === JSON.stringify(['plan', 'gate', 'do', 'do', 'review', 'answer']) && calls[0].noTools === true && calls.at(-1).noTools === true);
  check('Max: each job gets its own step and the whole plan', /step 1 of 2: Look it up/.test(calls[2].note) && /step 2 of 2: Write it down/.test(calls[3].note) && /The whole plan/.test(calls[3].note));
  check('Max: the result line counts the jobs', /2 jobs done/.test(res.minutes) && /nothing open/.test(res.minutes));
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

// ---- wired in ----
const turns = read('src/brain-turns.js'), runOn = read('src/brain-run-on.js'), hats = read('src/brain-hats.js');
check('a job runs through soloRun at High and Max, with the main brain for reviews', /soloRun\(this, solo,/.test(turns) && /this\.runHat\('reviewer', task, out\.ctx, soloBrain\(this\.cfg\)\)/.test(turns) && /job\.solo = soloJob\(this\.cfg, job\)/.test(turns));
check('each part is the same ask run again with a hidden note; the plan has no tools', /Boolean\(job\?\.soloAgain\)/.test(runOn) && /noTools: Boolean\(job\?\.soloNoTools\)/.test(runOn) && /lastRound: Boolean\(ctx\.lastRound\), retryThinks, job \}\)/.test(runOn));
check('his own review never goes to another Bob or a second brain', (hats.match(/!force\.solo/g) || []).length === 2 && /wantsBorrowedCheck = .*careful\(job\)/.test(read('src/bob-net-check.js')) && /!ctx\.job\?\.solo && cleanEffort\(ctx\.job\?\.effort\) === 'extreme'/.test(hats));
check('the setting is saved, shown and explained', /'soloEffort'/.test(read('src/config.js')) && /soloEffort: cfg\.soloEffort === true/.test(read('src/server.js')) && /sswitch\('soloEffort', settings\.soloEffort === true, 'Effort on one brain'/.test(read('public/cellar-pages.js')) && /dataset\.set === 'soloEffort'/.test(read('public/cellar.js')));
check('the Effort button shows Max and the one-brain hints when it is on', /extreme: 'Thinks throughout/.test(read('public/effort.js')) && /'Max'/.test(read('public/effort.js')) && /effort\.solo\(st\.soloEffort === true\)/.test(read('public/app.js')));
const help = HELP.find((e) => e.id === 'effort'), faq = HELP.find((e) => e.id === 'faq-solo-effort'), gl = HELP.find((e) => e.id === 'glossary');
check('Help, an FAQ in Bob\'s voice and the glossary', /Effort on one brain/.test(help.html) && /Windows, Mac, Linux and a phone/.test(help.html) && faq && /My loop enforces each step/.test(faq.html) && /<dt>Effort on one brain<\/dt>/.test(gl.html) && /<dt>Max effort<\/dt>/.test(gl.html));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
