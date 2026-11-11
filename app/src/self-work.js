// "Let Bob work on repositories" (off by default; the owner asked for it on 2026-11-09: "a skill for Bob to work on the
// app himself, long YaRN context on, my biggest model only, Bobert or Qwen 35B", then "a directory of repositories").
//
// Bob's own program folder and settings stay locked (config.js ownReadOnlyRoots): this never lifts that. Instead he
// works on a CODE COPY: a separate git copy of his code from GitHub, in inn/own-code/bob, made by the user's
// click (and the same for every repository the user adds, in inn/own-code/<name>). He wears his coding hat (the code copy of Bob), on the biggest brain by default (Bobert, else stock
// Qwen3.6 35B; any text brain can be picked in Settings) and with Long memory (YaRN) stretched past the 256K it was made for. Every edit and every command
// still shows its card; git push is still refused by the "Don't send anything out" limit. What comes out is a git
// branch and a patch file for the user to look over.
//
// No imports from config.js (config.js imports this file).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

export const SELF_REPO = 'https://github.com/MouseWurX/Bob.git';
// The owner (2026-11-09): "instead of just himself, a directory of repositories we want him to work on". Bob's own
// repository is always first and can't be removed; the user adds others (a link or a folder already on this replicant
// matrix). Every one gets its own code copy: the original (a GitHub page, or your own folder) is never changed.
export const BOB_REPO = { id: 'bob', name: 'Bob', source: SELF_REPO, own: true };
export const MAX_REPOS = 20;
export const projectName = (repo) => `${repo.name} (code copy)`;
export const CODE_COPY_PROJECT = projectName(BOB_REPO);
// Long memory sizes for this job: 512K (2x) or 1M (4x, the most Qwen's guide goes). 512K unless picked.
export const SELF_CTX = [524288, 1048576];
export const SELF_CTX_DEFAULT = 524288;
export const SELF_STEPS = 60; // a job on a whole repository reads a lot first; the usual coding hat stops at 30

export const selfWorkOn = (cfg) => cfg?.selfWork?.enabled === true;
export const codeCopyRoot = (cfg) => path.join(cfg.innDir, 'own-code');
export const codeCopyDir = (cfg, repo = BOB_REPO) => path.join(codeCopyRoot(cfg), repo.id);
export const patchDir = (cfg, repo = BOB_REPO) => path.join(codeCopyRoot(cfg), 'patches', repo.id);
const baseFile = (cfg, repo) => path.join(codeCopyRoot(cfg), `${repo.id}.json`);
export const selfCtx = (cfg) => (SELF_CTX.includes(cfg?.selfWork?.ctx) ? cfg.selfWork.ctx : SELF_CTX_DEFAULT);
// A real copy: a git folder.
export const hasCodeCopy = (cfg, repo = BOB_REPO, { exists = fs.existsSync } = {}) => Boolean(cfg?.innDir) && exists(path.join(codeCopyDir(cfg, repo), '.git'));

// Where a repository comes from: an https link (no password in it) or a full folder path on this replicant matrix.
// ssh links (git@...) need keys, which stay off-limits to Bob, so they aren't taken.
export function cleanSource(v) {
  const t = String(v || '').trim();
  if (!t || t.length > 400 || /[\u0000-\u001f]/.test(t)) return '';
  if (/^https:\/\//i.test(t)) { try { const u = new URL(t); return !u.username && !u.password && !/\s/.test(t) ? u.toString().replace(/\/$/, '') : ''; } catch { return ''; } }
  return path.isAbsolute(t) || /^[a-zA-Z]:[\\/]/.test(t) ? t : '';
}
export const repoSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
// The name a link or folder suggests: the last part, without .git.
export const nameFrom = (source) => String(source || '').replace(/[\\/]+$/, '').split(/[\\/]/).pop().replace(/\.git$/i, '') || 'repo';
export function cleanRepos(list) {
  const out = [];
  const seen = new Set(['bob', 'patches']);
  for (const r of Array.isArray(list) ? list : []) {
    const source = cleanSource(r?.source);
    if (!source) continue;
    const name = String(r?.name || nameFrom(source)).replace(/[\u0000-\u001f<>{}"`\\]/g, '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const id = repoSlug(name);
    if (!name || !id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name, source });
    if (out.length >= MAX_REPOS) break;
  }
  return out;
}
// Every repository Bob may work on, his own first.
export const reposOf = (cfg) => [BOB_REPO, ...cleanRepos(cfg?.selfWork?.repos)];
export function repoNamed(cfg, want) {
  const w = String(want || '').trim().toLowerCase();
  const all = reposOf(cfg);
  if (!w) return BOB_REPO;
  return all.find((r) => r.id === w || r.name.toLowerCase() === w || projectName(r).toLowerCase() === w) || all.find((r) => repoSlug(w) === r.id) || null;
}
// The tool group's words, plus the names of the user's repositories (3 letters or more).
export function selfWorkWords(cfg, base) {
  const names = cleanRepos(cfg?.selfWork?.repos).map((r) => r.name).filter((n) => n.length >= 3).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return names.length ? new RegExp(`${base.source}|\\b(?:${names.join('|')})\\b`, 'i') : base;
}
export const readyRepos = (cfg, deps) => reposOf(cfg).filter((r) => hasCodeCopy(cfg, r, deps));

// Settings (config.js clean): { enabled, ctx, model, repos }.
export function cleanSelfWork(v) {
  const o = v && typeof v === 'object' ? v : {};
  const out = { enabled: o.enabled === true, ctx: SELF_CTX.includes(o.ctx) ? o.ctx : SELF_CTX_DEFAULT, repos: cleanRepos(o.repos), helpers: o.helpers === true };
  if (typeof o.model === 'string' && /^[\w.:/@+-]{1,160}$/.test(o.model)) out.model = o.model;
  return out;
}

// Each code copy is a project while the switch is on and the copy is there, so the coding hat can search it and
// edit its code files (tools.js only edits code files inside a project). They are never saved in the projects list.
const under = (root, p) => { const r = path.relative(root, p); return r === '' || (!r.startsWith('..') && !path.isAbsolute(r)); };
export function applyCodeCopy(cfg, deps) {
  const projects = { ...(cfg.projects || {}) };
  if (cfg.innDir) for (const [k, v] of Object.entries(projects)) if (typeof v === 'string' && under(codeCopyRoot(cfg), v)) delete projects[k];
  if (selfWorkOn(cfg) && cfg.innDir) for (const r of readyRepos(cfg, deps)) projects[projectName(r)] = codeCopyDir(cfg, r);
  cfg.projects = projects;
  return cfg;
}

// ---- Which brain ----
// Recommended: the biggest, Bobert (Bob's own 35B cut) else the stock Qwen3.6 35B-A3B (the owner on 2026-11-09:
// "Bobert or Qwen 35B"). The owner on 2026-11-11: the picker must also offer the catalogue's brains and the tuned
// brains given a job, so any text brain can be picked; the biggest stays the default.
export const isBobert = (s) => /bobert/i.test(String(s || ''));
export const isStockQwen35 = (s) => /^(?:qwen3\.[56][-:]35b(?:-a3b)?(?:[-_](?:q\d\w*|ud\w*|instruct))*)$/i.test(String(s || '')) && !/heretic|abliter|distill|opus/i.test(String(s || ''));
export const bigBrainOk = (id, name = '') => isBobert(id) || isBobert(name) || isStockQwen35(id);

// The job names Settings uses for each brain slot (cfg.models keys).
export const JOB_NAMES = { bob: 'Brain', small: 'Quick brain', deep: 'Deep thinking', tinker: 'Coding', reviewer: 'Review', eyes: 'Seeing pictures', ledger: 'Spreadsheets', scout: 'Research', painter: 'Prompt writer' };
// The picker's groups, in order: big (recommended), jobs (your own tuned brains and the ones doing a job), here (other
// catalogue brains on this replicant matrix), get (in the catalogue, not downloaded yet).
export const BRAIN_GROUPS = ['big', 'jobs', 'here', 'get'];

// candidates: [{ id, name, sizeGB, here?, own?, jobs? }]. Only the Bobert/Qwen 35B ones, Bobert first (bigger file first),
// then Qwen 35B (bigger first). Kept for Bob-Net helpers (self-work-plan.js) and the default pick.
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

const readCatalog = () => { try { return JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url), 'utf8')).models || []; } catch { return []; } };
// A catalogue entry that can do this job: a text brain (chat or coding) with a GGUF file. Naughty-list brains only when
// that list is switched on (Settings, the same as Get models).
const textBrain = (e, cfg) => e && ['chat', 'coding'].includes(e.category) && !e.diffusion && (e.files || []).some((f) => f.role === 'gguf') && (e.naughty !== true || cfg?.naughtyList === true);

// Gathers every brain the picker offers. own: ownEntries(cfg) (own-models.js); catalog: catalog.json's models;
// catalogFile(id): catalogFileFor (llamacpp.js), { gguf } or null when it isn't on this replicant matrix; size(file): bytes.
// Equipped slots (cfg.models, a catalogue id or an Ollama name) count too and give their brain its job names.
// Returns [{ id, name, sizeGB, here, group, jobs: ['Coding', ...] }] in picker order.
export function gatherBrains(cfg, { own = [], catalog, catalogFile = () => null, size = (f) => fs.statSync(f).size } = {}) {
  if (!Array.isArray(catalog)) catalog = readCatalog();
  const gb = (f) => { try { return Math.round((size(f) / 1e9) * 10) / 10; } catch { return 0; } };
  const byId = new Map();
  const add = (b) => { if (b?.id && !byId.has(b.id)) byId.set(b.id, { jobs: [], ...b }); return byId.get(b?.id); };
  for (const e of own) if (e?.status?.state === 'installed') add({ id: e.id, name: e.name || e.id, sizeGB: Number(e.sizeGB) || 0, here: true, own: true });
  for (const e of catalog) {
    if (!textBrain(e, cfg)) continue;
    let f = null; try { f = catalogFile(e.id); } catch {}
    add({ id: e.id, name: e.name || e.id, sizeGB: f?.gguf ? gb(f.gguf) || Number(e.sizeGB) || 0 : Number(e.sizeGB) || 0, here: Boolean(f?.gguf), ollama: e.ollama || '' });
  }
  // The brain in each job slot: it gets the job's name; a slot holding a name Bob has no entry for (an Ollama brain) is
  // its own row.
  for (const [job, m] of Object.entries(cfg?.models || {})) {
    if (typeof m !== 'string' || !m) continue;
    const hit = byId.get(m) || [...byId.values()].find((b) => b.ollama && (b.ollama === m || `${b.ollama}:latest` === m || b.ollama === `${m}:latest`));
    const b = hit || add({ id: m, name: m, sizeGB: 0, here: true });
    const label = JOB_NAMES[job] || job;
    if (!b.jobs.includes(label)) b.jobs.push(label);
    b.inJob = true;
  }
  const bigIds = new Set(bigBrains([...byId.values()].filter((b) => b.here)).map((b) => b.id));
  const out = [...byId.values()].map((b) => ({
    id: b.id, name: b.name, sizeGB: b.sizeGB, here: b.here === true, jobs: b.jobs,
    group: bigIds.has(b.id) ? 'big' : !b.here ? 'get' : (b.own || b.inJob) ? 'jobs' : 'here',
    bobert: isBobert(b.id) || isBobert(b.name)
  }));
  return out.sort((a, b) => (BRAIN_GROUPS.indexOf(a.group) - BRAIN_GROUPS.indexOf(b.group)) || (b.bobert - a.bobert) || (b.sizeGB - a.sizeGB) || a.name.localeCompare(b.name));
}
// The one Bob uses: the picked one while it's on this replicant matrix, else the biggest (Bobert, then Qwen 35B), else
// the brain doing the Coding job. null when none of those is here.
export function pickBigBrain(cfg, list) {
  const want = cfg?.selfWork?.model;
  const here = list.filter((b) => b.here !== false);
  return (want && here.find((b) => b.id === want)) || here.find((b) => (b.group ? b.group === 'big' : bigBrainOk(b.id, b.name)))
    || here.find((b) => b.jobs?.includes(JOB_NAMES.tinker)) || null;
}
// The picked brain when it isn't on this replicant matrix (in the catalogue, not downloaded yet), else null.
export function pickedMissing(cfg, list) {
  const want = cfg?.selfWork?.model;
  return (want && list.find((b) => b.id === want && b.here === false)) || null;
}

// ---- The job ----
const slug = (s) => repoSlug(s) || 'change';
// The branch the copy started on (saved when it was made), else main.
export function baseOf(cfg, repo, { read = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  try { const b = JSON.parse(read(baseFile(cfg, repo))).base; return /^[\w./-]{1,100}$/.test(b || '') ? b : 'main'; } catch { return 'main'; }
}

// What the coding hat is told, in three parts: brief (where, the job, the house rules), setup (a clean branch) and
// wrapUp (checks, commit, patch, report). runManaged (self-work-plan.js) runs them around the task list;
// selfWorkTask is all of it in one, for a single run.
export function selfWorkParts(cfg, job, { repo = BOB_REPO, base = 'main', today = new Date().toISOString().slice(0, 10), runOn = true } = {}) {
  const dir = codeCopyDir(cfg, repo);
  const branch = `bob/${slug(job)}-${today}`;
  const where = repo.own
    ? `You're working on your own app: Bob's source code. Work only in the code copy at ${dir}. It is a separate git copy of Bob from GitHub. The Bob that is running now (his program folder and his settings) is a different folder, it stays locked, and nothing you do here changes him until {{USER}} reviews the change and takes it in.`
    : `You're working on {{USER}}'s repository "${repo.name}". Work only in its code copy at ${dir}, a separate git copy of ${repo.source}. The original is never changed: {{USER}} reviews your change and takes it in.`;
  const look = repo.own
    ? `Look first: read ${path.join(dir, 'CLAUDE.md')} and ${path.join(dir, '.github', 'CONTRIBUTING.md')} and follow them. Start with code_map (project "${projectName(repo)}") to see which files matter, then search_files and read_file only those (an error's file:line: read_file with line) until you understand every function you'll touch. Never guess what a file says.`
    : `Look first: read the house rules this repository has, if any (README, CONTRIBUTING, CLAUDE.md or AGENTS.md, in ${dir} or its .github folder), and follow them. Start with code_map (project "${projectName(repo)}") to see which files matter, then search_files and read_file only those (an error's file:line: read_file with line) until you understand every function you'll touch. Never guess what a file says.`;
  const rules = repo.own
    ? 'Make small, focused edits with edit_file and write_file. House rules: anything new is off by default; it works on Windows, Mac, Linux and Android or says plainly where it doesn\'t; it gets Help in your own voice, a glossary entry and an FAQ in public/help-content.js, using the names on screen; tests never read the real computer (pass fakes in).'
    : 'Make small, focused edits with edit_file and write_file, in the style the code already has.';
  const check = repo.own
    ? `Check: run_command node --run test (cwd ${dir}): that's npm test, run by Node itself. Read the output, fix what fails and run it again. Never skip, delete or weaken a test to get it green.`
    : `Check: find how this repository checks itself (its house rules, package.json scripts, a Makefile, a test folder) and run that with run_command (cwd ${dir}); for an npm script use node --run <script>. Read the output, fix what fails and run it again. Never skip, delete or weaken a test to get it green. If it has no tests, say so; don't invent a pass.`;
  const brief = [where, '', `## What {{USER}} asked\n${String(job || '').trim()}`, '', '## House rules', look, rules, ...(runOn ? [check] : ['The Run programs Hand is off, so you can\'t make a branch or run the tests. Edit the files, and say so in your report: switching on Run programs (Settings, Hands) lets you do both next time.'])].join('\n');
  const setup = runOn
    ? `${where}\n\nGet the code copy ready, nothing else: run_command git status (cwd ${dir}). If it shows changes from an earlier job, stop and say so instead of mixing them in. Otherwise: git switch ${base}, git pull (to start from the newest code), then git switch -c ${branch}. Say the branch name.`
    : '';
  const wrapUp = runOn
    ? `${brief}\n\n## Wrapping up\n1. Run the check once more and read the result. If it fails, fix it if it's small; otherwise report it.\n2. When it passes: git add -A, then git commit -m "<one line on what changed>", then git format-patch ${base} -o ${patchDir(cfg, repo)}. Never push: {{USER}} looks it over and sends it.\n3. Report honestly: the branch (${branch}), the files changed and why, what you ran and the real result (passed, failed or not run), and the patch file. Anything failing or unfinished goes first.`
    : `${brief}\n\n## Wrapping up\nReport honestly: the files changed and why, and that nothing was run. Anything unfinished goes first.`;
  return { brief, setup, wrapUp, branch, dir };
}
export function selfWorkTask(cfg, job, opts = {}) {
  const { brief, setup, wrapUp } = selfWorkParts(cfg, job, opts);
  return [brief, setup && `## First\n${setup.split('\n\n').pop()}`, wrapUp.split('\n\n').slice(-1)[0]].filter(Boolean).join('\n\n');
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

// Clones a repository into its code copy folder. Never touches an existing copy (it may hold work), and never the
// original. git: the Git program to use (self-work-tools.js ensureTool finds or fetches it first).
export async function makeCodeCopy(cfg, repo = BOB_REPO, { git = 'git', run = runGit, exists = fs.existsSync, mkdir = (d) => fs.mkdirSync(d, { recursive: true }), write = (f, t) => fs.writeFileSync(f, t), platform = process.platform } = {}) {
  const dir = codeCopyDir(cfg, repo);
  if (hasCodeCopy(cfg, repo, { exists })) return { ok: true, already: true, dir };
  if (exists(dir)) return { ok: false, dir, why: `There's already a folder at ${dir} that isn't a code copy. Move it or delete it, then press Make the code copy again.` };
  const source = cleanSource(repo.source);
  if (!source) return { ok: false, dir, why: 'That repository needs an https link or a full folder path.' };
  if (!/^https:/i.test(source) && !exists(source)) return { ok: false, dir, why: `The folder ${source} isn't there.` };
  mkdir(codeCopyRoot(cfg));
  mkdir(patchDir(cfg, repo));
  let r;
  try { r = await run(git, ['clone', '--quiet', source, dir], { cwd: codeCopyRoot(cfg) }); }
  catch (e) { return { ok: false, dir, why: e?.code === 'ENOENT' ? gitHelp(platform) : `Git couldn't start: ${e.message}` }; }
  if (r.code !== 0) return { ok: false, dir, why: `Git couldn't copy ${repo.name}${/^https:/i.test(source) ? ' (is the internet on? A private repository needs Git on this replicant matrix to know your sign-in already; a folder you cloned yourself works too)' : ''}. It said: ${String(r.out || '').trim().slice(-300) || `exit code ${r.code}`}` };
  // Commits need a name; this copy's own, so the computer's Git settings are never changed.
  for (const [k, v] of [['user.name', 'Bob'], ['user.email', 'bob@code-copy.invalid']]) { try { await run(git, ['-C', dir, 'config', k, v], { cwd: dir }); } catch {} }
  // The branch it started on, so jobs branch from (and patches compare with) the right one.
  try { const h = await run(git, ['-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir }); const b = String(h?.out || '').trim(); if (h?.code === 0 && /^[\w./-]{1,100}$/.test(b) && b !== 'HEAD') write(baseFile(cfg, repo), JSON.stringify({ base: b, source, at: new Date().toISOString() }, null, 2)); } catch {}
  return { ok: true, dir };
}

// What Settings shows.
export function selfWorkView(cfg, brains = [], deps) {
  const pick = pickBigBrain(cfg, brains);
  return {
    enabled: selfWorkOn(cfg), helpers: cfg?.selfWork?.helpers === true, ctx: selfCtx(cfg), ctxChoices: SELF_CTX, model: pick?.id || '', picked: cfg?.selfWork?.model || '', missing: pickedMissing(cfg, brains)?.name || '', brains: brains.map((b) => ({ id: b.id, name: b.name, here: b.here !== false, group: b.group || 'big', jobs: b.jobs || [] })), maxRepos: MAX_REPOS,
    repos: reposOf(cfg).map((r) => ({ ...r, own: r.own === true, dir: cfg.innDir ? codeCopyDir(cfg, r) : '', ready: hasCodeCopy(cfg, r, deps), patches: cfg.innDir ? patchDir(cfg, r) : '' }))
  };
}
