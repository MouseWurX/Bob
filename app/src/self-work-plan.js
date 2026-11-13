// "Work on repositories": how a big job is run (the owner, 2026-11-09: "smartly manage memory between tasks and
// as his output and research gets more dense it should compress, don't want him running out of context; divide work
// up into different tasks to do systematically and intelligently, and maybe delegate to other Bobs on the network").
//
// 1. Plan: the workbench copy reads (no edits) and writes a numbered task list, each task tagged research, edit or check.
// 2. Notes: one notes file per job (inn/own-code/notes/<repo>/<job>.md) holds the job, the task list with each one's
//    state, and what was learned. Every task starts fresh with only the job, the notes and its own task, so no single
//    run carries the whole job's history. When the notes grow past NOTES_MAX they are compressed (same brain, no tools)
//    to the facts that still matter: files, decisions, results, open problems.
// 3. Inside one task, old tool results are cut down once the conversation nears the brain's memory (compactMessages).
// 4. Helpers (opt-in, "Let my other Bobs help"): research tasks can go to your other Bobs on Bob-Net that run a big
//    brain (Bobert or Qwen 35B), at the same time as this Bob works. They only think: the tools they ask for run here,
//    and only the reading ones (list, read, search, web). Edits, commands and the wrap-up always stay here.
// 5. Helpers' own copies (the owner, Nov 13: "each helper bob makes its own copy or fork of a repo, is fine by me"): with
//    helpers on, edit tasks next to each other in the plan that name their files, and share none, are done at the same
//    time: one here, the others each by a helper Bob in a copy of his own (a git worktree of the code copy, on its own
//    branch, in inn/own-code/helpers). Every edit still shows its card. When a helper is done, his branch is merged
//    back; if it doesn't merge cleanly, it's dropped and the task is done again here. Checks and the wrap-up stay here.
import fs from 'node:fs';
import path from 'node:path';
import { codeCopyRoot, codeCopyDir, bigBrainOk, repoSlug, runGit } from './self-work.js';
import { giveIds, toolMessage } from './tool-kinds.js';

export const NOTES_MAX = 24000; // characters (~6K tokens); past this the notes are compressed
export const NOTES_TARGET = 9000;
export const MAX_TASKS = 12;
export const TASK_STEPS = 40;
export const READ_TOOLS = ['list_folder', 'code_map', 'read_file', 'search_files', 'git_look', 'web_search', 'fetch_page'];
export const helpersOn = (cfg) => cfg?.selfWork?.helpers === true;
export const EDIT_TOOLS = [...READ_TOOLS, 'edit_file', 'write_file'];

// ---- Helpers' own copies ----
const slugName = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'helper';
export const helperCopyDir = (cfg, repo, name) => path.join(codeCopyRoot(cfg), 'helpers', `${repo.id}-${slugName(name)}`);
export const helperBranch = (name, n) => `bob-helper/${slugName(name)}-task-${Number(n) || 0}`;
export const filesOf = (t) => [...new Set(String(t?.files || '').split(/[,;\s]+/).map((f) => f.trim().replace(/^\.?\//, '').replace(/\\/g, '/')).filter((f) => f && f.length < 300))];
// Edit tasks that can be done side by side: the run of edit tasks at the front of the list, each naming its files,
// none sharing a file with another. At most max. Fewer than two: nothing to share.
export function sideBySide(list, max) {
  const out = [], taken = new Set();
  for (const t of list) {
    if (out.length >= max || t.kind !== 'edit' || t.state === 'done') break;
    const fs_ = filesOf(t);
    if (!fs_.length || fs_.some((f) => taken.has(f))) break;
    fs_.forEach((f) => taken.add(f)); out.push(t);
  }
  return out.length >= 2 ? out : [];
}
// A helper's own copy: a git worktree of the code copy, on its own branch, starting where the copy is now.
export async function openHelperCopy(git, run, { dir, copy, branch }) {
  try { await run(git, ['-C', dir, 'worktree', 'remove', '--force', copy], { cwd: dir }); } catch {} // a copy left from a stopped job
  const r = await run(git, ['-C', dir, 'worktree', 'add', '-B', branch, copy, 'HEAD'], { cwd: dir });
  if (r?.code !== 0) throw new Error(`couldn't make his copy (${String(r?.out || '').trim().slice(0, 160)})`);
  return copy;
}
// His work goes back into the code copy: committed on his branch, merged in. A merge that isn't clean is undone and
// reported (the task is then done here). His copy and branch are removed either way.
export async function closeHelperCopy(git, run, { dir, copy, branch, message }) {
  let merged = false, why = '';
  try {
    await run(git, ['-C', copy, 'add', '-A'], { cwd: copy });
    const c = await run(git, ['-C', copy, 'commit', '-q', '-m', String(message || 'helper task').slice(0, 200)], { cwd: copy });
    if (c?.code !== 0 && !/nothing to commit/i.test(c?.out || '')) why = 'his changes couldn\'t be saved';
    else {
      const m = await run(git, ['-C', dir, 'merge', '--no-ff', '--no-edit', branch], { cwd: dir });
      if (m?.code === 0) merged = true;
      else { why = 'his changes clash with the ones made here'; await run(git, ['-C', dir, 'merge', '--abort'], { cwd: dir }).catch(() => {}); }
    }
  } catch (e) { why = e.message; }
  try { await run(git, ['-C', dir, 'worktree', 'remove', '--force', copy], { cwd: dir }); } catch {}
  try { await run(git, ['-C', dir, 'branch', '-D', branch], { cwd: dir }); } catch {}
  return { merged, why };
}

export const notesDir = (cfg, repo) => path.join(codeCopyRoot(cfg), 'notes', repo.id);
export const notesFile = (cfg, repo, jobId) => path.join(notesDir(cfg, repo), `${jobId}.md`);
export const jobId = (job, now = new Date()) => `${now.toISOString().slice(0, 16).replace(/[:T]/g, '-')}-${repoSlug(job).slice(0, 30) || 'job'}`;

// ---- The plan ----
export function planTask(brief) {
  return `${brief}

## Right now: plan only
Read and search only: don't edit, write or run anything yet. Look until you know which files matter. Then split the job into small tasks, each one a step that can be done and checked on its own, in the order to do them. Tag each one:
- [research] reading or looking something up, no changes (another Bob may do these at the same time as you);
- [edit] changing files;
- [check] running the tests or a build and fixing what fails.
Don't add the final commit and patch: that comes by itself at the end. At most ${MAX_TASKS} tasks; one is fine for a small job.

End your answer with exactly this block:
TASKS
1. [research] <what to find out> | files: <paths or "-">
2. [edit] <what to change> | files: <paths>
3. [check] <what to run>
END TASKS`;
}

// "1. [edit] Add the switch | files: a.js, b.js" -> { n, kind, title, files }
export function parseTasks(text) {
  const t = String(text || '');
  // The last line that is just "TASKS" (not the "END TASKS" after it), up to the "END TASKS" after that.
  const heads = [...t.matchAll(/^[ \t#*]*TASKS[ \t*:]*$/gm)];
  if (!heads.length) return [];
  const start = heads[heads.length - 1].index + heads[heads.length - 1][0].length;
  const end = t.indexOf('END TASKS', start);
  const body = t.slice(start, end < 0 ? undefined : end);
  const out = [];
  for (const line of body.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d{1,2})[.)]\s*\[(research|edit|check)\]\s*(.+?)\s*$/i);
    if (!m) continue;
    const [title, files = ''] = m[3].split(/\s*\|\s*files?:\s*/i);
    if (!title.trim()) continue;
    out.push({ n: out.length + 1, kind: m[2].toLowerCase(), title: title.trim().slice(0, 300), files: files.trim() === '-' ? '' : files.trim().slice(0, 300), state: 'to do' });
    if (out.length >= MAX_TASKS) break;
  }
  return out;
}

// ---- The notes ----
export function notesText({ repo, job, tasks, learned = [] }) {
  return [
    `# ${repo.name}: ${String(job).trim().split('\n')[0].slice(0, 120)}`,
    '', '## The job', String(job).trim(),
    '', '## Tasks', ...tasks.map((t) => `${t.n}. [${t.kind}] ${t.title}${t.files ? ` (files: ${t.files})` : ''}: ${t.state}${t.by ? `, by ${t.by}` : ''}`),
    '', '## What we know so far', ...(learned.length ? learned : ['(nothing yet)'])
  ].join('\n');
}
export const needsCompress = (learned, max = NOTES_MAX) => learned.join('\n').length > max;
export function compressTask(learned, target = NOTES_TARGET) {
  return `These are your working notes from a coding job that's still going. They've grown too long. Rewrite them in under ${Math.round(target / 6)} words, as short bullets. Keep every file path, function name, decision, test result and open problem that the remaining tasks could need; drop repetition, raw tool output and anything already settled and no longer needed. Don't add anything that isn't in the notes. Use no tools. Answer with the bullets only.

${learned.join('\n')}`;
}
// What a finished task adds to the notes: its own report, cut to size (the full text went to the chat).
export const learnedFrom = (task, text, max = 2500) => `- Task ${task.n} (${task.kind}, ${task.title}): ${String(text || '(no report)').replace(/\s+\n/g, '\n').trim().slice(-max)}`;

export function taskBrief(brief, notes, task, { runOn = true, steps = TASK_STEPS } = {}) {
  const how = task.kind === 'research'
    ? 'Read and search only; change nothing. End with what you found, in short bullets with file paths.'
    : task.kind === 'check'
      ? (runOn ? 'Run the check with run_command, read the output, fix what fails and run it again. Never skip, delete or weaken a test.' : 'Run programs is off, so say exactly how to run the check instead.')
      : 'Make this change only, in small edits (read before you edit). End with what you changed, file by file.';
  return `${brief}

## Where the job stands (your notes)
${notes}

## Your task now: ${task.n}. [${task.kind}] ${task.title}${task.files ? `\nFiles: ${task.files}` : ''}
${how} Do this task only; the notes say what the others are. You have about ${steps} steps for it.`;
}

// ---- Inside one task: keep the conversation inside the brain's memory ----
// Old tool results (everything but the newest `keep`) are cut to their first lines once the whole conversation passes
// maxChars. The system message, the task and the brain's own words are never cut.
export function compactMessages(messages, maxChars, { keep = 6, stub = 400 } = {}) {
  const size = () => messages.reduce((n, m) => n + String(m.content || '').length, 0);
  if (!(maxChars > 0) || size() <= maxChars) return 0;
  const tools = messages.map((m, i) => (m.role === 'tool' ? i : -1)).filter((i) => i >= 0);
  let cut = 0;
  // Oldest first, keeping the newest few whole; if that isn't enough, keep only the newest two.
  for (const k of [keep, Math.min(keep, 2)]) {
    for (const i of tools.slice(0, Math.max(0, tools.length - k))) {
      const c = String(messages[i].content || '');
      if (c.length <= stub + 200) continue;
      messages[i] = { ...messages[i], content: `${c.slice(0, stub)}\n[... ${c.length - stub} more characters of this older result were set aside to save memory; read it again if you need it]` };
      cut++;
      if (size() <= maxChars) return cut;
    }
  }
  return cut;
}
// Characters a brain's memory holds, roughly (3 per token), with room left for its answer.
export const charsFor = (ctxTokens) => Math.floor((Number(ctxTokens) || 32768) * 3 * 0.7);

// ---- Helpers on Bob-Net ----
// Your other Bobs that answer right now with a big brain (the owner: Bobert or Qwen 35B), or the same brain picked for
// these jobs here (the owner, 2026-11-11: any brain can be picked), free, and not this one.
export async function pickHelpers(lenders, { max = 3, same = '' } = {}) {
  if (!lenders?.bobs) return [];
  const list = lenders.bobs().filter((b) => !lenders.busyHere(b.address));
  const seen = await Promise.all(list.map((b) => lenders.hello(b).catch(() => ({ ok: false }))));
  const out = list.map((bob, i) => ({ ...bob, brain: seen[i]?.brain || '', ok: seen[i]?.ok })).filter((b) => b.ok && (bigBrainOk(b.brain) || (same && b.brain === same))).slice(0, max);
  for (const b of out) lenders.hold(b.address, 60_000);
  return out;
}

// One research task on a helper Bob: his brain thinks, the reading tools run here (and only those).
export const HELPER_READ = 'You are Bob, helping another Bob with one research task for a coding job. Read and look things up with the tools; change nothing. Be brief and exact: end with what you found, in short bullets with file paths.';
export const HELPER_EDIT = 'You are Bob, helping another Bob with one task of a coding job, in a copy of the code of your own. Make this change only, in small edits (read before you edit), only in the folder the task names. End with what you changed, file by file.';
export async function helperTask(brain, helper, brief, ctx, { steps = 20, tools = READ_TOOLS, system = HELPER_READ } = {}) {
  const schemas = brain.toolSchemas(tools);
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: brief }
  ];
  let final = '';
  for (let i = 0; i < steps; i++) {
    const reply = await brain.lenders.chat(helper, { messages, tools: schemas, signal: ctx.signal, from: brain.cfg.windowsName || 'Bob' });
    messages.push(reply);
    final = reply.content || final;
    if (!reply.tool_calls) break;
    giveIds(reply.tool_calls); // item 165: each result names its call
    for (const call of reply.tool_calls) {
      const name = call.function?.name;
      const res = tools.includes(name) ? await brain.runTool(name, call.function?.arguments, ctx) : { text: `Error: only ${tools === READ_TOOLS ? 'reading tools' : 'reading and editing tools'} on this task.` };
      messages.push(toolMessage(call, String(res.text || ''), res.ok));
    }
    compactMessages(messages, charsFor(helper.ctx || 32768));
  }
  return final || '(No answer.)';
}

// ---- The whole managed job ----
// runHat(task, opts) runs the workbench copy on the job's brain; compress(text) runs it with no tools.
export async function runManaged(brain, ctx, { cfg, repo, job, brief, setup = '', wrapUp, runOn, force, write = (f, t) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, t); }, now = new Date(), notesMax = NOTES_MAX, git = '', run = runGit, dir = codeCopyDir(cfg, repo) }) {
  const say = (text) => ctx.emit?.({ type: 'token', text });
  const file = notesFile(cfg, repo, jobId(job, now));
  const hat = (task, extra = {}) => brain.runHat('tinker', task, ctx, { ...force, ...extra });
  const learned = [];
  let tasks = [];
  const save = () => { try { write(file, notesText({ repo, job, tasks, learned })); } catch {} };
  const remember = async (line) => {
    learned.push(line);
    if (needsCompress(learned, notesMax)) {
      ctx.emit?.({ type: 'announce', text: '🗜 My notes for this job got long, so I\'m squeezing them down to what still matters.' });
      const short = await hat(compressTask(learned), { maxSteps: 1 }).catch(() => '');
      if (short && short.length < learned.join('\n').length) learned.splice(0, learned.length, `- (Compressed notes) ${short.trim()}`);
    }
    save();
  };

  if (setup) { say('**Getting the code copy ready:**\n\n'); await remember(learnedFrom({ n: 0, kind: 'setup', title: 'branch' }, await hat(setup, { maxSteps: 10 }), 800)); }
  say('\n\n**Planning:**\n\n');
  const planText = await hat(planTask(brief), { maxSteps: TASK_STEPS });
  tasks = parseTasks(planText);
  if (!tasks.length) tasks = [{ n: 1, kind: 'edit', title: 'Do the whole job', files: '', state: 'to do' }];
  await remember(learnedFrom({ n: 0, kind: 'plan', title: 'the plan' }, planText.split('TASKS')[0], 3000));
  ctx.emit?.({ type: 'announce', text: `📋 ${tasks.length} task${tasks.length === 1 ? '' : 's'}: ${tasks.map((t) => `${t.n}. ${t.title}`).join(' · ')}. Notes: ${file}` });

  // Research first: on helpers (at the same time) when allowed, the rest here.
  const research = tasks.filter((t) => t.kind === 'research');
  const helpers = research.length && helpersOn(cfg) ? await pickHelpers(brain.lenders, { max: research.length, same: force?.model || '' }) : [];
  const away = research.slice(0, helpers.length).map((t, i) => {
    t.state = 'in progress'; t.by = helpers[i].name;
    ctx.emit?.({ type: 'announce', text: `🛰 ${helpers[i].name} takes task ${t.n} (${t.title}) on Bob-Net. He only reads, and the reading happens here.` });
    return helperTask(brain, helpers[i], taskBrief(brief, notesText({ repo, job, tasks, learned }), t, { runOn: false, steps: 20 }), ctx)
      .then((text) => ({ t, text }))
      .catch((e) => ({ t, failed: e.message }))
      .finally(() => brain.lenders?.release?.(helpers[i].address));
  });
  save();
  const order = [...research.slice(helpers.length), ...tasks.filter((t) => t.kind !== 'research')];
  const retry = [];
  let collected = false;
  const collect = async () => {
    if (collected) return;
    collected = true;
    for (const r of await Promise.all(away)) {
      if (r.failed) { r.t.state = 'to do'; r.t.by = ''; ctx.emit?.({ type: 'announce', text: `🛰 Task ${r.t.n} came back without an answer (${r.failed}), so I'll do it myself.` }); retry.push(r.t); continue; }
      r.t.state = 'done';
      await remember(learnedFrom(r.t, r.text));
    }
  };
  for (let i = 0; i < order.length; i++) {
    // Edits and checks wait for the helpers' findings (and redo any they couldn't); research here runs alongside them.
    if (order[i].kind !== 'research') { await collect(); if (retry.length) order.splice(i, 0, ...retry.splice(0)); }
    const t = order[i];
    if (t.state === 'done') continue;
    // Helpers' own copies: edit tasks side by side, one here and the rest on helpers.
    if (git && helpersOn(cfg) && t.kind === 'edit') {
      const group = sideBySide(order.slice(i), 4);
      const free = group.length ? await pickHelpers(brain.lenders, { max: group.length - 1, same: force?.model || '' }).catch(() => []) : [];
      if (free.length) {
        const mine = group[0], theirs = group.slice(1, free.length + 1);
        const notes = notesText({ repo, job, tasks, learned });
        const jobs = theirs.map(async (task, k) => {
          const helper = free[k], copy = helperCopyDir(cfg, repo, helper.name), branch = helperBranch(helper.name, task.n);
          task.state = 'in progress'; task.by = helper.name;
          try {
            await openHelperCopy(git, run, { dir, copy, branch });
            ctx.emit?.({ type: 'announce', text: `🛰 ${helper.name} takes task ${task.n} (${task.title}) in a copy of his own at ${copy}. Every change still shows its card here.` });
            const text = await helperTask(brain, helper, taskBrief(brief.split(dir).join(copy), notes.split(dir).join(copy), task, { runOn: false, steps: TASK_STEPS }), ctx, { steps: TASK_STEPS, tools: EDIT_TOOLS, system: HELPER_EDIT });
            const back = await closeHelperCopy(git, run, { dir, copy, branch, message: `Task ${task.n}: ${task.title} (by ${helper.name})` });
            return { task, text, ...back };
          } catch (e) { await closeHelperCopy(git, run, { dir, copy, branch, message: '' }).catch(() => {}); return { task, merged: false, why: e.message }; }
          finally { brain.lenders?.release?.(helper.address); }
        });
        mine.state = 'in progress'; mine.by = ''; save();
        say(`\n\n---\n**Task ${mine.n} of ${tasks.length} (${mine.kind}): ${mine.title}**${theirs.length ? ` (tasks ${theirs.map((x) => x.n).join(', ')} on ${free.slice(0, theirs.length).map((h) => h.name).join(', ')} at the same time)` : ''}\n\n`);
        const text = await hat(taskBrief(brief, notes, mine, { runOn }), { maxSteps: TASK_STEPS });
        mine.state = 'done';
        await remember(learnedFrom(mine, `${text}${ctx.hatNotes ? `\n${ctx.hatNotes}` : ''}`));
        for (const r of await Promise.all(jobs)) {
          if (r.merged) { r.task.state = 'done'; await remember(learnedFrom(r.task, r.text)); ctx.emit?.({ type: 'announce', text: `🛰 ${r.task.by}'s work on task ${r.task.n} is merged in.` }); }
          else { ctx.emit?.({ type: 'announce', text: `🛰 Task ${r.task.n} came back without merging (${r.why || 'no changes'}), so I'll do it myself.` }); r.task.state = 'to do'; r.task.by = ''; }
        }
        save();
        i--; // look at this place in the list again: the tasks still to do there run next
        continue;
      }
    }
    t.state = 'in progress'; t.by = ''; save();
    say(`\n\n---\n**Task ${t.n} of ${tasks.length} (${t.kind}): ${t.title}**\n\n`);
    const text = await hat(taskBrief(brief, notesText({ repo, job, tasks, learned }), t, { runOn }), { maxSteps: TASK_STEPS });
    t.state = 'done';
    await remember(learnedFrom(t, `${text}${ctx.hatNotes ? `\n${ctx.hatNotes}` : ''}`));
  }
  await collect();
  for (const t of retry.splice(0)) { // only when every task was research
    say(`\n\n---\n**Task ${t.n} of ${tasks.length} (${t.kind}): ${t.title}**\n\n`);
    const text = await hat(taskBrief(brief, notesText({ repo, job, tasks, learned }), t, { runOn }), { maxSteps: TASK_STEPS });
    t.state = 'done';
    await remember(learnedFrom(t, text));
  }
  say('\n\n---\n**Wrapping up:**\n\n');
  const final = await hat(`${wrapUp}\n\n## Where the job stands (your notes)\n${notesText({ repo, job, tasks, learned })}`, { maxSteps: 20 });
  await remember(learnedFrom({ n: tasks.length + 1, kind: 'wrap-up', title: 'commit, patch and report' }, final));
  return final;
}
