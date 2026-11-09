// "Let Bob work on his own app" (off by default; the owner asked for it on 2026-11-09: "a skill for Bob to work on the
// app himself, long YaRN context on, my biggest model only, Bobert or Qwen 35B").
//
// Bob's own program folder and settings stay locked (config.js ownReadOnlyRoots): this never lifts that. Instead he
// works on a CODE COPY: a separate git copy of his code from GitHub, in inn/own-code/bob, made by the user's
// click. He wears his coding hat (the code copy of Bob), but only on the biggest brain (Bobert, else stock
// Qwen3.6 35B) and with Long memory (YaRN) stretched past the 256K it was made for. Every edit and every command
// still shows its card; git push is still refused by the "Don't send anything out" limit. What comes out is a git
// branch and a patch file for the user to look over.
//
// No imports from config.js (config.js imports this file).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const SELF_REPO = 'https://github.com/MouseWurX/Bob.git';
export const CODE_COPY_PROJECT = 'Bob (code copy)';
// Long memory sizes for this job: 512K (2x) or 1M (4x, the most Qwen's guide goes). 512K unless picked.
export const SELF_CTX = [524288, 1048576];
export const SELF_CTX_DEFAULT = 524288;
export const SELF_STEPS = 60; // a job on his own code reads a lot first; the usual coding hat stops at 30

export const selfWorkOn = (cfg) => cfg?.selfWork?.enabled === true;
export const codeCopyRoot = (cfg) => path.join(cfg.innDir, 'own-code');
export const codeCopyDir = (cfg) => path.join(codeCopyRoot(cfg), 'bob');
export const patchDir = (cfg) => path.join(codeCopyRoot(cfg), 'patches');
export const selfCtx = (cfg) => (SELF_CTX.includes(cfg?.selfWork?.ctx) ? cfg.selfWork.ctx : SELF_CTX_DEFAULT);
// A real copy: a git folder with Bob's package.json in it.
export const hasCodeCopy = (cfg, { exists = fs.existsSync } = {}) => exists(path.join(codeCopyDir(cfg), '.git')) && exists(path.join(codeCopyDir(cfg), 'package.json'));

// Settings (config.js clean): { enabled, ctx, model }.
export function cleanSelfWork(v) {
  const o = v && typeof v === 'object' ? v : {};
  const out = { enabled: o.enabled === true, ctx: SELF_CTX.includes(o.ctx) ? o.ctx : SELF_CTX_DEFAULT };
  if (typeof o.model === 'string' && /^[\w.:/@+-]{1,160}$/.test(o.model)) out.model = o.model;
  return out;
}

// The code copy is a project while the switch is on and the copy is there, so the coding hat can search it and
// edit its code files (tools.js only edits code files inside a project). It is never saved in the projects list.
export function applyCodeCopy(cfg, deps) {
  const projects = { ...(cfg.projects || {}) };
  delete projects[CODE_COPY_PROJECT];
  if (selfWorkOn(cfg) && cfg.innDir && hasCodeCopy(cfg, deps)) projects[CODE_COPY_PROJECT] = codeCopyDir(cfg);
  cfg.projects = projects;
  return cfg;
}

// ---- Which brain ----
// Only the biggest: Bobert (Bob's own 35B cut, a file on this replicant matrix), else the stock Qwen3.6 35B-A3B from the
// catalogue or Ollama. Remixes (heretic, distilled) don't count: the owner said Bobert or Qwen 35B.
export const isBobert = (s) => /bobert/i.test(String(s || ''));
export const isStockQwen35 = (s) => /^(?:qwen3\.[56][-:]35b(?:-a3b)?(?:[-_](?:q\d\w*|ud\w*|instruct))*)$/i.test(String(s || '')) && !/heretic|abliter|distill|opus/i.test(String(s || ''));
export const bigBrainOk = (id, name = '') => isBobert(id) || isBobert(name) || isStockQwen35(id);

// candidates: [{ id, name, sizeGB }] of brains on this replicant matrix (the caller gathers them: own files, the
// catalogue's files, equipped slots). Bobert first (bigger file first), then Qwen 35B (bigger first).
export function bigBrains(candidates = []) {
  const seen = new Set();
  const list = [];
  for (const c of candidates) {
    if (!c?.id || seen.has(c.id) || !bigBrainOk(c.id, c.name)) continue;
    seen.add(c.id);
    list.push({ id: c.id, name: c.name || c.id, sizeGB: Number(c.sizeGB) || 0, bobert: isBobert(c.id) || isBobert(c.name) });
  }
  return list.sort((a, b) => (b.bobert - a.bobert) || (b.sizeGB - a.sizeGB));
}
// Gathers the candidates from what's on this replicant matrix. own: ownEntries(cfg) (own-models.js); catalogFile(id):
// catalogFileFor (llamacpp.js), { gguf } or null; size(file): bytes. Equipped slots count too (an Ollama name).
export const STOCK_IDS = ['qwen3.6-35b-a3b', 'qwen3.6-35b-a3b-q3'];
export function gatherBrains(cfg, { own = [], catalogFile = () => null, size = (f) => fs.statSync(f).size } = {}) {
  const gb = (f) => { try { return Math.round((size(f) / 1e9) * 10) / 10; } catch { return 0; } };
  const out = [];
  for (const e of own) if (e?.status?.state === 'installed') out.push({ id: e.id, name: e.name, sizeGB: e.sizeGB || 0 });
  for (const id of STOCK_IDS) { let f = null; try { f = catalogFile(id); } catch {} if (f?.gguf) out.push({ id, name: id === STOCK_IDS[0] ? 'Qwen3.6 35B-A3B' : 'Qwen3.6 35B-A3B (Q3)', sizeGB: gb(f.gguf) }); }
  for (const m of Object.values(cfg?.models || {})) if (typeof m === 'string') out.push({ id: m, name: m, sizeGB: 0 });
  return bigBrains(out);
}
// The one Bob uses: the picked one while it's still here, else the first.
export function pickBigBrain(cfg, list) {
  const want = cfg?.selfWork?.model;
  return (want && list.find((b) => b.id === want)) || list[0] || null;
}

// ---- The job ----
const slug = (s) => String(s || 'change').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'change';

// What the coding hat is told. {{USER}} is filled in by the system prompt's user name.
export function selfWorkTask(cfg, job, { today = new Date().toISOString().slice(0, 10), runOn = true } = {}) {
  const dir = codeCopyDir(cfg);
  const branch = `bob/${slug(job)}-${today}`;
  const steps = [
    `1. Look first. Read ${path.join(dir, 'CLAUDE.md')} and ${path.join(dir, '.github', 'CONTRIBUTING.md')} and follow them. Then search_files (project "${CODE_COPY_PROJECT}") and read_file until you understand every function you'll touch. Never guess what a file says.`,
    runOn
      ? `2. Start clean. run_command git status (cwd ${dir}). If it shows changes from an earlier job, stop and tell {{USER}} instead of mixing them in. Otherwise: git switch main, git pull (to start from the newest code), then git switch -c ${branch}.`
      : '2. The Run programs Hand is off, so you can\'t make a branch or run the tests. Edit the files, and say so in your report: switching on Run programs (Settings, Hands) lets you do both next time.',
    '3. Plan in a few numbered lines (what, where, why, how you\'ll check it), then make small, focused edits with edit_file and write_file. House rules: anything new is off by default; it works on Windows, Mac, Linux and Android or says plainly where it doesn\'t; it gets Help in your own voice, a glossary entry and an FAQ in public/help-content.js, using the names on screen; tests never read the real computer (pass fakes in).',
    ...(runOn ? [
      `4. Check. run_command node --run test (cwd ${dir}): that's npm test, run by Node itself. Read the output, fix what fails and run it again. Never skip, delete or weaken a test to get it green.`,
      `5. Keep it. When the tests pass: git add -A, then git commit -m "<one line on what changed>", then git format-patch main -o ${patchDir(cfg)}. Never push: {{USER}} looks it over and sends it.`
    ] : []),
    `${runOn ? 6 : 4}. Report honestly: ${runOn ? `the branch (${branch}), ` : ''}the files changed and why, what you ran and the real result (passed, failed or not run)${runOn ? ', and the patch file' : ''}. Anything failing or unfinished goes first.`
  ];
  return [
    `You're working on your own app: Bob's source code. Work only in the code copy at ${dir}. It is a separate git copy of Bob from GitHub. The Bob that is running now (his program folder and his settings) is a different folder, it stays locked, and nothing you do here changes him until {{USER}} reviews the change and takes it in.`,
    '',
    `## What {{USER}} asked\n${String(job || '').trim()}`,
    '',
    '## How to work',
    ...steps
  ].join('\n');
}

// ---- Making the copy (the Settings button) ----
const gitHelp = (os_) => (os_ === 'win32'
  ? 'Git isn\'t on this replicant matrix yet. Get it from git-scm.com (the usual installer is fine), then press Make the code copy again.'
  : os_ === 'darwin'
    ? 'Git isn\'t on this Mac yet. Open Terminal, type xcode-select --install, then press Make the code copy again.'
    : 'Git isn\'t on this computer yet. Install it with your system\'s software manager (it\'s called git), then press Make the code copy again.');

// run(cmd, args, { cwd, timeoutMs }) -> Promise<{ code, out }>; it rejects with code ENOENT when git isn't there.
export function runGit(cmd, args, { cwd, timeoutMs = 10 * 60_000 } = {}) {
  return new Promise((resolve, reject) => {
    let out = '';
    let child;
    try { child = spawn(cmd, args, { cwd, windowsHide: true, shell: false, stdio: ['ignore', 'pipe', 'pipe'] }); } catch (e) { reject(e); return; }
    const timer = setTimeout(() => { try { child.kill(); } catch {} }, timeoutMs);
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); resolve({ code, out: out.slice(-2000) }); });
  });
}

// Clones Bob's code from GitHub into the code copy folder. Never touches an existing copy (it may hold work).
// git: the Git program to use (self-work-tools.js ensureTool finds or fetches it first).
export async function makeCodeCopy(cfg, { git = 'git', run = runGit, exists = fs.existsSync, mkdir = (d) => fs.mkdirSync(d, { recursive: true }), platform = process.platform } = {}) {
  const dir = codeCopyDir(cfg);
  if (hasCodeCopy(cfg, { exists })) return { ok: true, already: true, dir };
  if (exists(dir)) return { ok: false, dir, why: `There's already a folder at ${dir} that isn't a code copy. Move it or delete it, then press Make the code copy again.` };
  mkdir(codeCopyRoot(cfg));
  mkdir(patchDir(cfg));
  let r;
  try { r = await run(git, ['clone', '--quiet', SELF_REPO, dir], { cwd: codeCopyRoot(cfg) }); }
  catch (e) { return { ok: false, dir, why: e?.code === 'ENOENT' ? gitHelp(platform) : `Git couldn't start: ${e.message}` }; }
  if (r.code !== 0) return { ok: false, dir, why: `Git couldn't copy Bob's code from GitHub (is the internet on?). It said: ${String(r.out || '').trim().slice(-300) || `exit code ${r.code}`}` };
  // Commits need a name; this copy's own, so the computer's Git settings are never changed.
  for (const [k, v] of [['user.name', 'Bob'], ['user.email', 'bob@code-copy.invalid']]) { try { await run(git, ['-C', dir, 'config', k, v], { cwd: dir }); } catch {} }
  return { ok: true, dir };
}

// What Settings shows.
export function selfWorkView(cfg, brains = [], deps) {
  const pick = pickBigBrain(cfg, brains);
  return {
    enabled: selfWorkOn(cfg), ctx: selfCtx(cfg), ctxChoices: SELF_CTX, model: pick?.id || '', brains: brains.map((b) => ({ id: b.id, name: b.name })),
    dir: cfg.innDir ? codeCopyDir(cfg) : '', ready: cfg.innDir ? hasCodeCopy(cfg, deps) : false, patches: cfg.innDir ? patchDir(cfg) : ''
  };
}
