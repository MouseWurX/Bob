// Bob's Hands as tools: what he can do on the PC beyond chatting. The settings live in hands-settings.js,
// the file work in hands-files.js and running things in hands-run.js. This file turns them into tools,
// keeps track of what's running so "Stop everything" can stop it, and keeps recipes and a run log.
//
// The rules every Hand follows:
// - Off until the user turns it on (master switch plus its own switch). Off = Bob doesn't even see the tool.
// - Bob shows exactly what he'll do (the rows, or the exact command) and waits for a click, every time.
// - "Allow the rest of this job" only covers the same kind of action in the same job, and ends with the job.
// - No administrator rights, no passwords, never secret files or read-only folders, never his own settings.
// - Everything goes in the logbook; file jobs can be undone.
import { stopAll as stopDoorCalls } from './claude-door.js';
import fs from 'node:fs';
import { writeJsonAtomic } from './util.js';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { insideAny, isInside, appDir } from './config.js';
import { HANDS, LIMITS, handOn, handOffWhy, handsSettings, cleanHands, readOnlyRoots, freeOn, limitOn, handsHere, handsOs, computerWord, handHere } from './hands-settings.js';
import { planFiles, planCard, applyFiles, undoJob, loadJournal, handsRoots } from './hands-files.js';
import { planSort, sortSummary } from './sort-library.js';
import { exampleFor, TOKENS } from './sort-names.js';
import { checkCommand, runCommand, safeEnv } from './hands-run.js';
import { codeCopyRoot } from './self-work.js';
import { toolPath } from './self-work-tools.js'; // "Let Bob work on repositories": his own Git and Node first in the code copy
import { appsTools } from './hands-apps.js';
import { officeView } from './office.js';
import { makerPrompt, selfToolsView } from './selftools.js';
import { mcpTools, mcpPrompt, mcpView, stopAllServers } from './mcp.js';
import { packsTools, packsPrompt, packsView } from './toolpacks.js';
import { browserTools, browserPrompt, browserView } from './hands-browser.js';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const list = (description) => ({ type: 'array', items: { type: 'string' }, description });

// ---- What's running (so Stop and Stop everything can reach it) ----
const running = new Map(); // runId -> { controller, line, cwd, started }
export function runningNow() { return [...running.entries()].map(([id, r]) => ({ id, line: r.line, cwd: r.cwd, started: r.started })); }
// Something else a Hand keeps running (the Apps helper and its red bar): Stop everything reaches it too.
export function track({ line, stop }) {
  const id = crypto.randomUUID().slice(0, 8);
  const controller = new AbortController();
  controller.signal.addEventListener('abort', () => { running.delete(id); try { stop(); } catch {} }, { once: true });
  running.set(id, { controller, line, cwd: '', started: Date.now() });
  return () => running.delete(id);
}
export function stopRun(id) { const r = running.get(id); if (!r) return false; r.controller.abort(); return true; }

// "Stop everything": stops every running command, turns the master switch off, and tells the brain to deny
// anything waiting for approval from a Hand. Returns how many things it stopped.
// The chat-page Hands switch (1.5.3). held = true stops whatever a Hand is doing, answers waiting cards No and keeps
// every Hand from being used, without changing Settings. held = false only works when Settings has Hands on.
export function holdHands(brain, held) {
  const cur = handsSettings(brain.cfg);
  if (!held && !cur.enabled) throw new Error('Hands are off in Settings. Turn them on there first (Settings, Hands).');
  let n = 0;
  if (held) { for (const r of running.values()) { r.controller.abort(); n++; } n += brain.denyHands?.() || 0; n += stopDoorCalls(); } // and anything Claude asked for
  brain.saveHands(cleanHands({ ...cur, held }));
  brain.log?.('hands', held ? `Hands switch on the chat page: stopped (${n} thing${n === 1 ? '' : 's'} stopped)` : 'Hands switch on the chat page: back on');
  return n;
}

export function stopEverything(brain) {
  let n = 0;
  for (const r of running.values()) { r.controller.abort(); n++; }
  stopAllServers(); // connected apps Bob started (they're in running too; this catches any still starting)
  n += stopDoorCalls(); // calls from the Claude app or Claude Code (claude-door.js)
  if (brain) {
    n += brain.denyHands?.() || 0;
    const next = cleanHands({ ...handsSettings(brain.cfg), enabled: false, free: false }); // asks again next time
    brain.saveHands?.(next);
    brain.log?.('hands', `STOP EVERYTHING pressed: stopped ${n} thing${n === 1 ? '' : 's'}, all Hands off, asking again`);
  }
  return n;
}

// ---- Recipes: saved commands the user can run in one click (or ask Bob for by name) ----
const recipesFile = (cfg) => path.join(cfg.dataDir, 'hands-recipes.json');
export function loadRecipes(cfg) {
  try { const r = JSON.parse(fs.readFileSync(recipesFile(cfg), 'utf8')); return Array.isArray(r) ? r.filter((x) => x && x.name && x.cmd) : []; } catch { return []; }
}
export function saveRecipe(cfg, { name, cmd, args = [], cwd }) {
  name = String(name || '').trim().slice(0, 60);
  if (!/^[\p{L}\p{N} ._'()-]{1,60}$/u.test(name)) throw new Error('Give the recipe a short plain name.');
  const c = checkCommand(cfg, { cmd, args, cwd });
  if (!c.ok) throw new Error(c.why);
  const all = loadRecipes(cfg).filter((r) => r.name.toLowerCase() !== name.toLowerCase());
  all.push({ name, cmd, args, cwd, saved: Date.now() });
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  writeJsonAtomic(recipesFile(cfg), all.slice(-50));
  return all;
}
export function removeRecipe(cfg, name) {
  const all = loadRecipes(cfg).filter((r) => r.name.toLowerCase() !== String(name).toLowerCase());
  writeJsonAtomic(recipesFile(cfg), all);
  return all;
}

// ---- The run log (newest last, last 50) ----
const runsFile = (cfg) => path.join(cfg.dataDir, 'hands-runs.json');
export function loadRuns(cfg) { try { const r = JSON.parse(fs.readFileSync(runsFile(cfg), 'utf8')); return Array.isArray(r) ? r : []; } catch { return []; } }
function saveRun(cfg, r) {
  fs.mkdirSync(cfg.dataDir, { recursive: true });
  writeJsonAtomic(runsFile(cfg), [...loadRuns(cfg), r].slice(-50));
}

// Runs an approved command: live output to the chat (emit), registered so Stop can reach it.
export async function runApproved(cfg, { cmd, args = [], cwd }, { emit = () => {}, signal, log = () => {} } = {}) {
  const c = checkCommand(cfg, { cmd, args, cwd }); // checked again right before it starts
  if (!c.ok) throw new Error(c.why);
  const id = crypto.randomUUID().slice(0, 8);
  const controller = new AbortController();
  const onAbort = () => controller.abort();
  signal?.addEventListener?.('abort', onAbort, { once: true });
  running.set(id, { controller, line: c.line, cwd, started: Date.now() });
  emit({ type: 'run-start', runId: id, line: c.line, cwd });
  log('hands', `run: ${c.line} (in ${cwd})`);
  const timeoutMs = handsSettings(cfg).timeoutMin * 60_000;
  let res;
  try {
    res = await runCommand({ cmd, args, cwd, timeoutMs, signal: controller.signal, ...(isInside(codeCopyRoot(cfg), cwd) ? { env: toolPath(cfg, safeEnv()) } : {}), onOutput: (text) => emit({ type: 'run-output', runId: id, text }) });
  } finally {
    running.delete(id);
    signal?.removeEventListener?.('abort', onAbort);
  }
  emit({ type: 'run-end', runId: id, code: res.code, killed: res.killed, why: res.why });
  saveRun(cfg, { id, at: Date.now(), line: c.line, cwd, code: res.code, killed: res.killed || '', why: res.why || '' });
  log('hands', `run ended: ${c.line} -> ${res.why || (res.killed ? res.killed : `exit ${res.code}`)}`);
  const tail = res.out.length > 6000 ? '[...]\n' + res.out.slice(-6000) : res.out;
  if (res.why) return `It didn't start: ${res.why}`;
  return `${res.killed === 'stopped' ? 'Stopped by the user.' : res.killed === 'timeout' ? `Stopped: it ran past the ${handsSettings(cfg).timeoutMin}-minute limit.` : `Finished with exit code ${res.code}${res.code === 0 ? ' (success)' : ''}.`}\nOutput (end):\n${tail || '(no output)'}`;
}

const off = (cfg, id) => { if (!handOn(cfg, id)) throw new Error(handOffWhy(cfg, id)); };
// Undo belongs to Files and to Sort and rename: either one on is enough.
const offUndo = (cfg) => { if (!handOn(cfg, 'files') && !handOn(cfg, 'sort')) off(cfg, 'files'); };

// The tools. brain is used for its logbook.
export function handsTools(brain, opts = {}) {
  const cfg = brain.cfg;
  const log = (k, t) => brain.log?.(k, t);
  const t = {};

  t.file_hands = {
    schema: fn('file_hands', "Move, copy, rename (one or many), zip, unzip, tidy a folder into subfolders by kind, or recycle files, in the folders {{USER}} allowed. Never overwrites; all but delete undo. Use recycle; delete is for good, only when told and only if {{USER}} turned off Recycle Bin only.", {
      action: str('What to do', { enum: ['move', 'copy', 'rename', 'tidy', 'zip', 'unzip', 'recycle', 'delete'] }),
      paths: list('Full paths (tidy: the folder; unzip: the zip).'),
      to: str('move/copy: the folder to put them in. zip: the new zip (optional). unzip: where to unpack (optional).'),
      newName: str('rename one item: the new name.'),
      find: str('rename many: text to find in each name.'),
      replace: str('rename many: what to put instead.'),
      prefix: str('rename many: text to put in front.'),
      suffix: str('rename many: text to put before the extension.'),
      pattern: str('rename many: a pattern like "Holiday {n}" ({n} = 1, 2, 3...; {name} = the old name).')
    }, ['action', 'paths']),
    approvalGroup: 'files',
    check(args, ctx) {
      off(cfg, 'files');
      const plan = planFiles(cfg, args);
      if (!plan.rows.length) throw new Error('There is nothing to do there (no files match).');
      if (ctx) ctx.handsPlan = plan;
      return planCard(plan);
    },
    async run(args, ctx) {
      off(cfg, 'files');
      const plan = ctx?.handsPlan || planFiles(cfg, args);
      if (ctx) ctx.handsPlan = null;
      const res = applyFiles(cfg, plan, ctx?.picked ?? null);
      // Copies, zips and unzipped folders are new things Bob made: they get a card in the chat (made.js).
      if (ctx) ctx.made = res.done.filter((r) => ['copy', 'zip', 'unzip'].includes(r.op) && r.to).map((r) => r.to);
      if (res.job) log('hands', `files: ${plan.label}: ${res.done.length} done${res.failed.length ? `, ${res.failed.length} failed` : ''} (undo id ${res.job.id})`);
      ctx?.emit?.({ type: 'files-done', job: res.job ? { id: res.job.id, label: res.job.label } : null, done: res.done.length, failed: res.failed.map((f) => ({ from: f.from, why: f.why })) });
      const lines = [`${plan.label}: ${res.done.length} done.`];
      if (res.failed.length) lines.push(`Not done: ${res.failed.map((f) => `${f.from} (${f.why})`).join('; ')}`);
      const skipped = plan.rows.length - res.done.length - res.failed.length;
      if (skipped) lines.push(`${skipped} left as they were (blocked or not ticked).`);
      if (res.job) lines.push(`Undo id: ${res.job.id} (the user can also press Undo).`);
      return lines.join('\n');
    },
    summary: ({ action, paths }) => `files: ${action} ${[].concat(paths || []).length} item(s)`
  };

  t.undo_files = {
    schema: fn('undo_files', 'Undo a file job (the latest, or one by its undo id). {{USER}} approves it.', { id: str('Undo id (optional; default the latest job).') }, []),
    approvalGroup: 'files',
    check({ id }) {
      offUndo(cfg);
      const j = id ? loadJournal(cfg).find((x) => x.id === id) : [...loadJournal(cfg)].reverse().find((x) => !x.undone);
      if (!j) throw new Error('There is no file job to undo.');
      if (j.undone) throw new Error('That job was already undone.');
      return `Undo "${j.label}" (${j.steps.length} step${j.steps.length === 1 ? '' : 's'}): moved things go back, things I made go to the Recycle Bin.`;
    },
    async run({ id }) {
      offUndo(cfg);
      const r = undoJob(cfg, id);
      log('hands', `undo: ${r.job.label}: ${r.done.length} done${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
      return [`Undid "${r.job.label}".`, r.failed.length ? `Couldn't undo: ${r.failed.join('; ')}` : '', r.manual.length ? `These are in the Windows Recycle Bin; restore them from there: ${r.manual.join('; ')}` : ''].filter(Boolean).join('\n');
    },
    summary: ({ id }) => `undo files${id ? ' ' + id : ''}`
  };

  // Sort and rename (sort-library.js): plans moves to the user's naming rules; the Files card shows every row.
  t.sort_files = {
    schema: fn('sort_files', "Rename and move music, videos or photos in a folder (library, Downloads) to {{USER}}'s naming rules. Undo with undo_files.", {
      folder: str('Full path.'),
      kinds: list('Only these rules: music, tv, films, photos.'),
      subfolders: { type: 'boolean', description: 'Default true.' }
    }, ['folder']),
    approvalGroup: 'files',
    check(args, ctx) {
      off(cfg, 'sort');
      const plan = planSort(cfg, args);
      if (!plan.rows.length) throw new Error(`Nothing to rename there${plan.fine ? `: ${sortSummary(plan)}` : ' (no files match the naming rules that are on)'}.`);
      if (ctx) ctx.handsPlan = plan;
      const card = planCard(plan);
      if (plan.more) card.text += ` ${plan.more} more after this; ask again for the next lot.`;
      return card;
    },
    async run(args, ctx) {
      off(cfg, 'sort');
      const plan = ctx?.handsPlan || planSort(cfg, args);
      if (ctx) ctx.handsPlan = null;
      const res = applyFiles(cfg, plan, ctx?.picked ?? null);
      if (res.job) log('hands', `sort: ${plan.label}: ${res.done.length} done${res.failed.length ? `, ${res.failed.length} failed` : ''} (undo id ${res.job.id})`);
      ctx?.emit?.({ type: 'files-done', job: res.job ? { id: res.job.id, label: res.job.label } : null, done: res.done.length, failed: res.failed.map((f) => ({ from: f.from, why: f.why })) });
      const lines = [`${plan.label}: ${res.done.length} done.`];
      if (res.failed.length) lines.push(`Not done: ${res.failed.slice(0, 20).map((f) => `${f.from} (${f.why})`).join('; ')}${res.failed.length > 20 ? `; and ${res.failed.length - 20} more` : ''}`);
      const skipped = plan.rows.length - res.done.length - res.failed.length;
      if (skipped) lines.push(`${skipped} left as they were (blocked or not ticked).`);
      const extra = sortSummary(plan);
      if (extra) lines.push(`Also: ${extra}.`);
      if (res.job) lines.push(`Undo id: ${res.job.id} (the user can also press Undo).`);
      return lines.join('\n');
    },
    summary: ({ folder }) => `sort and rename in ${folder || '?'}`
  };

  const runCheck = (args) => {
    off(cfg, 'run');
    const a = { cmd: String(args.cmd || ''), args: [].concat(args.args || []).map(String), cwd: String(args.cwd || '') };
    const c = checkCommand(cfg, a);
    if (!c.ok) throw new Error(c.why);
    return { a, c };
  };
  const runCard = (c, cwd, why) => ({ text: `Run this ${c.kind}${why ? ` (${String(why).slice(0, 200)})` : ''}. Output shows live, with a Stop button. Not as administrator.`, command: c.line, cwd });

  t.run_command = {
    schema: fn('run_command', 'Run one program or script in a folder. No shell: give the program and its arguments apart (cmd "npm", args ["run","build"]). Never as administrator; password prompts won\'t work. Use file_hands for moving, zipping or deleting files.', {
      cmd: str('The program, like "git", "npm" or "python".'),
      args: list('Its arguments, one per item.'),
      cwd: str('Full path of the folder to run it in.'),
      why: str('One short line: what this is for.')
    }, ['cmd', 'cwd']),
    approvalGroup: (args) => `run:${String(args.cmd || '').toLowerCase()}|${String(args.cwd || '').toLowerCase()}`,
    check(args) { const { c, a } = runCheck(args); return runCard(c, a.cwd, args.why); },
    async run(args, ctx) { const { a } = runCheck(args); return runApproved(cfg, a, { emit: ctx?.emit, signal: ctx?.signal, log }); },
    summary: ({ cmd, args }) => `run: ${cmd} ${[].concat(args || []).join(' ')}`.slice(0, 120)
  };

  t.run_recipe = {
    schema: fn('run_recipe', 'Run one of {{USER}}\'s saved commands (recipes) by name, or list them.', {
      action: str('run or list', { enum: ['run', 'list'] }),
      name: str('The recipe name (for run).')
    }, ['action']),
    approvalGroup: (args) => `recipe:${String(args.name || '').toLowerCase()}`,
    check(args) {
      off(cfg, 'run');
      if (args.action === 'list') return false;
      const r = loadRecipes(cfg).find((x) => x.name.toLowerCase() === String(args.name || '').toLowerCase());
      if (!r) throw new Error(`No recipe called "${args.name}". Saved: ${loadRecipes(cfg).map((x) => x.name).join(', ') || 'none yet'}.`);
      const { c } = runCheck(r);
      return runCard(c, r.cwd, `recipe "${r.name}"`);
    },
    async run(args, ctx) {
      off(cfg, 'run');
      const all = loadRecipes(cfg);
      if (args.action === 'list') return all.length ? all.map((r) => `${r.name}: ${[r.cmd, ...(r.args || [])].join(' ')} (in ${r.cwd})`).join('\n') : 'No recipes saved yet. The user can save one from a command card or in Settings, Hands.';
      const r = all.find((x) => x.name.toLowerCase() === String(args.name || '').toLowerCase());
      return runApproved(cfg, r, { emit: ctx?.emit, signal: ctx?.signal, log });
    },
    summary: ({ action, name }) => `recipe: ${action}${name ? ' ' + name : ''}`
  };

  Object.assign(t, appsTools(brain, { track, ...(opts.apps || {}) }), mcpTools(brain, { track }), packsTools(brain), browserTools(brain, { track, ...(opts.browser || {}) }));
  return t;
}

// A line for Bob's system prompt saying which Hands he has right now (only when one is on).
// 1.5.102: each rule is said once. A copy of Bob (hat) only gets what it can act on: its tools are files and commands,
// it has no offer_setup or ask_together, so it gets no off list, no Office/Security/Apps notes and no ask_together line.
export function handsPrompt(cfg, { hat = null } = {}) {
  const who = cfg.userName || 'the user', Who = cfg.userName || 'The user';
  const on = Object.entries(HANDS).filter(([id]) => handOn(cfg, id));
  // Hands that are off have no tools, so Bob is told why; otherwise he can only refuse vaguely or invent a reason.
  const offIds = Object.keys(HANDS).filter((id) => !handOn(cfg, id));
  // "The X Hand is off. Sam can turn it on in Settings, ..." once per Hand said the same thing over and over (eight times
  // with Hands off, the default): Hands that are simply switched off get one line between them.
  const hs = handsSettings(cfg);
  const plain = (id) => handHere(id) && !hs.held && hs[id]?.on !== true;
  const plainIds = offIds.filter(plain);
  const why = [...new Set(offIds.filter((id) => !plain(id)).map((id) => handOffWhy(cfg, id)))];
  if (plainIds.length === 1) why.push(handOffWhy(cfg, plainIds[0]));
  else if (plainIds.length) why.push(hs.enabled ? `${Who} can turn them on in Settings, Hands.` : `Hands are off in Settings. ${Who} can turn on "Let Bob use Hands" and the Hand they want in Settings, Hands.`);
  const offLine = offIds.length && !hat ? `\n\nHands that are off right now (you have no tool for them): ${offIds.map((id) => HANDS[id].label).join('; ')}. ${why.join(' ')} If asked for one of these, call offer_setup with hand:<its id> (${offIds.join(', ')}): the app shows a card that switches it on with one press, and the job carries on after. Say in one line that it's off; don't refuse without a reason or make one up.` : '';
  // Bob's backstory is a replicant in a virtual world; Hands are not. Without this he blamed a "simulated OS".
  const realLine = `\n\nNever say you did something on ${who}'s ${computerWord()} (opened, typed, clicked, moved, ran) unless a tool result in this turn says it was done. Hands act on it for real. When a Hand tool fails, tell ${who} the error it gave you, in plain words, and never blame a simulation or a virtual OS. If an earlier try in this chat failed, call the tool again instead of repeating that result: you may have been updated since.`;
  if (!on.length) return realLine + offLine;
  const roots = handsRoots(cfg);
  const askLine = freeOn(cfg)
    ? ` ${Who} switched on "work without asking": there are no approval cards right now, so just do the job step by step with the tools and say what you did. Don't ask in words first either. The hard limits still apply: when a tool refuses, say why plainly and don't try a way round it.${limitsLine(cfg)}`
    : ` Every action shows a card and waits for a click, so describe the plan briefly and call the tool; don't ask in words first.${hat ? '' : ` When a job needs two or more OKs, call ask_together first.`} If ${who} says no, don't try another way round.`;
  if (hat) return `\n\nHands ${who} switched on: ${on.map(([, h]) => h.label).join('; ')}.${askLine}${realLine}`;
  const secWhere = handsOs() === 'win' ? 'in Windows Security' : 'in the system\'s own security settings';
  return `\n\nHands ${who} switched on: ${on.map(([, h]) => h.label).join('; ')}.${handOn(cfg, 'files') ? ` Files: only in ${roots.join('; ') || '(no folders ticked yet)'}. To undo a file job, call undo_files; it keeps the record, so don't answer from memory.` : ''}${handOn(cfg, 'sort') ? ` Sort and rename: sort_files works in ${roots.join('; ') || '(no folders ticked yet)'} with ${cfg.userName || 'the user'}'s rules from Settings (${handsSettings(cfg).sortRules.filter((r) => r.on && r.pattern).map((r) => r.label).join(', ') || 'none on'}); only they change them.` : ''}${handOn(cfg, 'office') ? ` Office: read Word, Excel, PowerPoint or PDF with office_read, not read_file; office_edit after reading. Saves in ${[...roots, path.join(cfg.innDir || '', 'documents')].join('; ')}.` : ''}${handOn(cfg, 'security') ? ` Security: you defend only; read security_tips before safety advice. Never switch protection off, allow or restore threats, or research private people; say how the user does those first ones ${secWhere}.` : ''}${browserPrompt(cfg)}${mcpPrompt(cfg)}${packsPrompt(cfg)}${makerPrompt(cfg)}${askLine}${realLine}${offLine}`;
}

// Hard limits the user switched off, so Bob knows what he may now do (and that nothing else changed).
function limitsLine(cfg) {
  const off = Object.entries(LIMITS).filter(([k]) => !limitOn(cfg, k)).map(([, l]) => l.label);
  return off.length ? ` Limits ${cfg.userName || 'the user'} switched off: ${off.join('; ')}.` : '';
}

// For the Settings page.
// Folders offered as tick boxes: the usual ones in the user's home, plus the folders Bob may already read.
export function folderCandidates(cfg) {
  const home = os.homedir();
  const ro = [...readOnlyRoots(cfg), appDir, cfg.dataDir, cfg.innDir].filter(Boolean);
  const list = [...['Downloads', 'Desktop', 'Documents', 'Pictures', 'Videos', 'Music'].map((d) => path.join(home, d)), ...(cfg.readRoots || [])];
  return [...new Set(list)].filter((d) => { try { return fs.statSync(d).isDirectory() && !insideAny(ro, d); } catch { return false; } });
}

export function handsView(cfg) {
  return { candidates: folderCandidates(cfg), settings: handsSettings(cfg), hands: handsHere(), limits: Object.entries(LIMITS).map(([id, l]) => ({ id, ...l })), readOnly: (cfg.readOnlyRoots || []).filter((f) => !(cfg.ownReadOnlyRoots || []).includes(f)), roots: handsRoots(cfg), recipes: loadRecipes(cfg), journal: loadJournal(cfg).slice(-15).reverse().map((j) => ({ id: j.id, at: j.at, label: j.label, steps: j.steps.length, undone: Boolean(j.undone) })), runs: loadRuns(cfg).slice(-15).reverse(), running: runningNow(), office: officeView(cfg), selfTools: selfToolsView(cfg), mcp: mcpView(cfg), packs: packsView(cfg), browser: browserView(cfg), sort: { tokens: TOKENS, examples: Object.fromEntries(handsSettings(cfg).sortRules.map((r) => [r.id, exampleFor(r)])) } };
}
