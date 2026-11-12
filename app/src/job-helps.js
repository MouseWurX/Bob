// Jobs (Settings, Jobs; "100 more ways" items 51 to 61): eleven small helps around how Bob works through a job.
// Each has its own switch and every one is off until it's turned on. The rules live here; brain.js only calls in.
//   steer        51 Steer him mid-job: a message typed in the job's own chat goes to the job, read before its next step
//   softStop     52 Stop after this step: the running step finishes and keeps its result, then he answers
//   timeLimit    53 A time limit per job: a bar, and a card to give him more when it runs out
//   receipt      54 A receipt at the end of a job: files changed, commands run, pages read (Open, Undo)
//   runTests     55 Run the tests after code edits (run_command asks first, as always)
//   askFirst     56 One question before a vague big job (the ask_user pick-one card)
//   rememberNo   57 Remember a "no" for the whole chat, with your reason if you gave one
//   lookupCache  58 Reuse look-ups: the same search or page within an hour comes from memory
//   sources      59 Sources under web answers: numbered links to the pages he read
//   howSure      60 Say how sure he is when pages disagree or results are thin
//   fileLinks    61 Clickable file:line links, opening your editor at that line
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const JOB_HELPS = ['steer', 'softStop', 'timeLimit', 'receipt', 'runTests', 'askFirst', 'rememberNo', 'lookupCache', 'sources', 'howSure', 'fileLinks'];
export const TIME_CHOICES = [5, 10, 15, 20, 30, 45, 60];
export const EDITORS = ['vscode', 'cursor', 'vscodium', 'system'];
export const DEFAULT_MINUTES = 10;

const clip = (s, n) => { const t = String(s ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };

// The saved setting, cleaned: every switch false unless it is exactly true.
export function cleanJobHelps(v) {
  const src = v && typeof v === 'object' && !Array.isArray(v) ? v : {};
  const out = {};
  for (const k of JOB_HELPS) out[k] = src[k] === true;
  const m = Number(src.minutes);
  out.minutes = TIME_CHOICES.includes(m) ? m : DEFAULT_MINUTES;
  out.editor = EDITORS.includes(src.editor) ? src.editor : 'vscode';
  return out;
}
export const jobHelp = (cfg, k) => cfg?.jobHelps?.[k] === true;
// Not for guests (Discord, Telegram, a job from another Bob): those chats aren't the owner's.
const ownJob = (job) => !job?.guest;

// ---------------- 51 Steer him mid-job ----------------
// The job running on the main lane for this chat, or null.
export function steerTarget(brain, sessionId) {
  const w = brain.watch?.job;
  if (!w) return null;
  const job = (brain.queue || []).find((j) => j.id === w.id && j.state === 'working');
  return job && job.sessionId === sessionId && !job.side && !job.guest ? job : null;
}
export const STEER_LINE = (text) => `📨 Got it. I'll read this before my next step: "${clip(text, 120)}"`;
// enqueue: a plain message typed in the chat of the running job is passed to the job instead of waiting behind it.
// A question about the job itself ("how's it going?") is left to the Quick brain, when that's on.
export function steerNote(brain, sessionId, text, attach = [], extra = {}, { asksAboutJob = () => false, meanwhile = false } = {}) {
  if (!jobHelp(brain.cfg, 'steer') || extra.guest || [].concat(attach || []).length || !String(text || '').trim()) return null;
  if (meanwhile && asksAboutJob(text)) return null;
  const job = steerTarget(brain, sessionId);
  if (!job) return null;
  const r = brain.watch.note(text, { direct: true });
  if (r.error) return null; // three notes already waiting: this one waits its turn like any message
  const answer = STEER_LINE(text);
  brain.log?.('jobs', 'a message typed in the job\'s chat was passed to the job (Steer him mid-job)');
  setTimeout(() => brain.broadcast?.({ type: 'busy-note', sessionId, text: answer }), 0);
  return { jobId: null, turnId: null, ahead: 0, answered: answer, steered: true };
}

// ---------------- 52 Stop after this step ----------------
export function stopAfterStep(brain, id = '') {
  const t = brain.turns?.get('talk');
  if (!t || (id && t.turnId !== id)) return false;
  const job = (brain.queue || []).find((j) => j.id === t.turnId);
  if (!job || job.state !== 'working') return false;
  job.stopAfter = true;
  brain.log?.('jobs', 'Stop after this step pressed: the step running now finishes, then he answers');
  return true;
}
export const SOFT_STOP_NOTE = (who) => `${who} pressed "Stop after this step". Don't start anything new: no more tool calls. Say plainly what you did and found, what is left undone, and how to carry on.`;
export const SOFT_STOP_LINE = '⏸ Stopping after this step, as asked. Wrapping up with what I have.';

// ---------------- 53 A time limit per job ----------------
export const timeLimitMs = (cfg) => (cleanJobHelps(cfg?.jobHelps).minutes) * 60000;
export const TIME_ASK = (mins) => `keep going for ${mins} more minutes. This job has used the ${mins} minutes it was given. (Deny and I wrap up now with what I have.)`;
export const TIME_UP_NOTE = (who, mins) => `This job has used its time limit (${mins} minutes), and ${who} didn't give more. No more tool calls: say plainly what you did and found, what is left, and how to carry on.`;
export const TIME_ASK_WAIT_MS = 120000; // no answer in 2 minutes: he wraps up
// Called at the top of each step. Returns 'go' or 'wrap'.
export async function timeCheck(brain, ctx, { now = Date.now, waitMs = TIME_ASK_WAIT_MS } = {}) {
  const job = ctx.job;
  if (!jobHelp(brain.cfg, 'timeLimit') || !job || job.side || !ownJob(job) || ctx.timeUp) return 'go';
  const mins = cleanJobHelps(brain.cfg.jobHelps).minutes;
  if (!ctx.timeEnds) {
    ctx.timeEnds = (job.startedAt || now()) + mins * 60000;
    ctx.emit?.({ type: 'job-clock', startedAt: job.startedAt || now(), endsAt: ctx.timeEnds });
  }
  if (now() < ctx.timeEnds) return 'go';
  const id = crypto.randomUUID();
  const timer = setTimeout(() => brain.answerApproval?.(id, false), waitMs);
  timer.unref?.();
  let more = false;
  try { more = Boolean(await brain.approve(TIME_ASK(mins), ctx.emit, ctx.signal, null, { id })); } finally { clearTimeout(timer); }
  if (more) {
    ctx.timeEnds = now() + mins * 60000;
    ctx.emit?.({ type: 'job-clock', startedAt: job.startedAt || now(), endsAt: ctx.timeEnds });
    brain.log?.('jobs', `the job got ${mins} more minutes`);
    return 'go';
  }
  ctx.timeUp = true;
  ctx.emit?.({ type: 'job-clock', done: true });
  brain.log?.('jobs', 'the job used its time limit; he wraps up');
  return 'wrap';
}

// ---------------- 54 A receipt at the end of a job ----------------
const MAX_UNDO_BYTES = 2 * 1024 * 1024;
const receiptsDir = (cfg) => path.join(cfg.dataDir, 'receipts');
const hash = (s) => crypto.createHash('sha256').update(String(s)).digest('hex');
// Before a file tool runs: what the file held, so Undo can put it back.
export function receiptBefore(brain, name, args, ctx) {
  if (!jobHelp(brain.cfg, 'receipt') || !ctx || !ownJob(ctx.job) || !['write_file', 'edit_file'].includes(name)) return null;
  const file = String(args?.path || '');
  if (!file || !path.isAbsolute(file)) return { file };
  try {
    if (!fs.existsSync(file)) return { file, existed: false };
    const st = fs.statSync(file);
    if (!st.isFile() || st.size > MAX_UNDO_BYTES) return { file, existed: true };
    return { file, existed: true, before: fs.readFileSync(file, 'utf8') };
  } catch { return { file }; }
}
const failed = (text) => /^Error:|said no|^\(Not (?:run|done|read)/.test(String(text || ''));
// After a tool runs: one line on the receipt (and the look-up record the sources and "how sure" use).
export function receiptAfter(brain, name, args, res, ctx, before = null) {
  if (!ctx) return;
  const text = String(res?.text ?? '');
  const web = ctx.web ||= { searches: 0, empty: 0, pages: [], titles: new Map() };
  if (name === 'web_search') {
    web.searches++;
    if (/^No results|^Error:/.test(text)) web.empty++;
    for (const m of text.matchAll(/^\d+\.\s+(.+)\n\s+(https?:\/\/\S+)/gm)) if (!web.titles.has(m[2])) web.titles.set(m[2], clip(m[1], 90));
  }
  if (name === 'fetch_page' && !failed(text) && !/not a page/.test(text)) {
    const url = String(args?.url || '');
    if (/^https?:\/\//.test(url) && !web.pages.includes(url)) web.pages.push(url);
  }
  if (['write_file', 'edit_file'].includes(name) && !failed(text)) {
    (ctx.codeEdits ||= []).push(String(args?.path || ''));
    ctx.testedAfterEdit = false;
  }
  if (name === 'run_command' && !failed(text)) ctx.testedAfterEdit = true;
  if (!jobHelp(brain.cfg, 'receipt') || !ownJob(ctx.job) || failed(text)) return;
  const items = ctx.receipt ||= [];
  if (items.length >= 40) return;
  if (['write_file', 'edit_file'].includes(name)) {
    const file = String(args?.path || before?.file || '');
    let undo = '';
    if (before && 'existed' in before && (before.existed === false || typeof before.before === 'string')) {
      try {
        const after = fs.readFileSync(file, 'utf8');
        undo = crypto.randomUUID().slice(0, 12);
        fs.mkdirSync(receiptsDir(brain.cfg), { recursive: true });
        fs.writeFileSync(path.join(receiptsDir(brain.cfg), `${undo}.json`), JSON.stringify({ file, existed: before.existed, before: before.before ?? null, afterHash: hash(after), at: Date.now() }));
      } catch { undo = ''; }
    }
    items.push({ kind: 'file', what: name === 'write_file' ? (before?.existed === false ? 'Created' : 'Wrote') : 'Edited', path: file, ...(undo ? { undo } : {}) });
  } else if (name === 'run_command') {
    let sum = name; try { sum = brain.tools?.[name]?.summary ? brain.tools[name].summary(args || {}) : name; } catch {}
    items.push({ kind: 'command', what: 'Ran', text: clip(sum, 200) });
  } else if (name === 'fetch_page') {
    const url = String(args?.url || '');
    if (/^https?:\/\//.test(url) && !items.some((i) => i.kind === 'page' && i.url === url)) items.push({ kind: 'page', what: 'Read', url });
  }
}
// Undo one file change from a receipt (the user's own click). Only while the file still holds what Bob wrote.
export function undoReceipt(cfg, id) {
  if (!/^[\w-]{6,40}$/.test(String(id || ''))) throw new Error('That receipt line is too old to undo.');
  const f = path.join(receiptsDir(cfg), `${id}.json`);
  if (!fs.existsSync(f)) throw new Error('That receipt line is too old to undo.');
  const r = JSON.parse(fs.readFileSync(f, 'utf8'));
  const now = fs.existsSync(r.file) ? fs.readFileSync(r.file, 'utf8') : null;
  if (now === null || hash(now) !== r.afterHash) throw new Error('That file has changed since, so I left it as it is.');
  if (r.existed) fs.writeFileSync(r.file, r.before ?? '');
  else {
    // A file Bob created: it goes to his backups folder, never deleted for good.
    const to = path.join(cfg.dataDir, 'backups', 'undone', `${Date.now()}-${path.basename(r.file)}`);
    fs.mkdirSync(path.dirname(to), { recursive: true });
    fs.renameSync(r.file, to);
  }
  fs.rmSync(f, { force: true });
  return { file: r.file, restored: Boolean(r.existed) };
}
// Old undo records go after a week.
export function pruneReceipts(cfg, { now = Date.now(), keepMs = 7 * 864e5 } = {}) {
  try { for (const n of fs.readdirSync(receiptsDir(cfg))) { const f = path.join(receiptsDir(cfg), n); if (now - fs.statSync(f).mtimeMs > keepMs) fs.rmSync(f, { force: true }); } } catch {}
}

// ---------------- 55 Run the tests after code edits ----------------
const CODE_EXT = /\.(?:[cm]?[jt]sx?|py|rs|go|java|kt|kts|cs|cpp|cc|c|h|hpp|rb|php|swift|dart|lua|scala|ex|exs|vue|svelte)$/i;
// The test command for the project a file sits in: { root, cmd, args } or null. Looks up at most 8 folders.
export function testCommandFor(file, { exists = fs.existsSync, read = (f) => fs.readFileSync(f, 'utf8') } = {}) {
  if (!file || !CODE_EXT.test(file)) return null;
  let dir = path.dirname(path.resolve(file));
  for (let i = 0; i < 8; i++) {
    const at = (n) => path.join(dir, n);
    if (exists(at('package.json'))) {
      try {
        const t = JSON.parse(String(read(at('package.json'))).replace(/^\uFEFF/, '')).scripts?.test;
        if (typeof t === 'string' && t.trim() && !/no test specified/.test(t)) return { root: dir, cmd: 'npm', args: ['test'] };
      } catch {}
    }
    if (exists(at('Cargo.toml'))) return { root: dir, cmd: 'cargo', args: ['test'] };
    if (exists(at('go.mod'))) return { root: dir, cmd: 'go', args: ['test', './...'] };
    if (exists(at('pytest.ini')) || exists(at('conftest.py'))) return { root: dir, cmd: 'python', args: ['-m', 'pytest', '-q'] };
    if (exists(at('pyproject.toml')) && /\[tool\.pytest/.test(String(read(at('pyproject.toml'))))) return { root: dir, cmd: 'python', args: ['-m', 'pytest', '-q'] };
    if (exists(at('.git'))) return null; // the top of the repository, and nothing to run
    const up = path.dirname(dir);
    if (up === dir) return null;
    dir = up;
  }
  return null;
}
export const TESTS_NOTE = (who, t) => `Before you say this is done: you changed code in ${t.root}. Run its tests with run_command (cmd "${t.cmd}", args ${JSON.stringify(t.args)}, in that folder). ${who} sees the exact command and says yes first. If any test fails, fix what you broke and run them again. If ${who} says no, say the tests weren't run.`;
// The answer is ready: should he run the tests first? Returns the note to add, or ''.
export function testsNudge(brain, ctx, { find = testCommandFor } = {}) {
  if (!jobHelp(brain.cfg, 'runTests') || !ownJob(ctx.job) || ctx.testsNudged || ctx.testedAfterEdit !== false || !ctx.codeEdits?.length) return '';
  if (brain.usable && !brain.usable('run_command')) return '';
  const t = find(ctx.codeEdits.at(-1));
  if (!t) return '';
  ctx.testsNudged = true;
  brain.log?.('jobs', `code changed in ${t.root}: asking him to run ${t.cmd} ${t.args.join(' ')} first`);
  return TESTS_NOTE(brain.cfg.userName || 'the user', t);
}

// ---------------- 56 One question before a vague big job ----------------
const DOING = /\b(?:make|build|write|create|fix|set ?up|clean|tidy|organi[sz]e|sort|change|update|redo|rewrite|refactor|plan|move|rename|delete|convert|install|improve|add)\b/i;
export function bigAsk(text, job) {
  const t = String(text || '');
  const words = t.trim().split(/\s+/).filter(Boolean).length;
  if (!DOING.test(t) || words < 3) return false;
  return ['medium', 'high', 'extreme'].includes(job?.effort) || words >= 6;
}
export const ASK_FIRST_NOTE = (who) => `Before a big job: if ${who}'s ask could fairly mean two or more different things, and guessing wrong would waste several steps, call ask_user once now with a short question and the readings as choices, then do the one picked. If the ask is clear, don't ask: just do it. Ask at most once.`;
export function askFirstNote(brain, ctx, text) {
  if (!jobHelp(brain.cfg, 'askFirst') || !ownJob(ctx.job) || ctx.job?.side || !brain.tools?.ask_user || !bigAsk(text, ctx.job)) return '';
  return ASK_FIRST_NOTE(brain.cfg.userName || 'the user');
}

// ---------------- 57 Remember a "no" for the whole chat ----------------
// The reason typed on a card's Deny, kept a minute for the tool that card was for.
export function keepDenyNote(brain, note) {
  const t = clip(note, 200);
  if (t) brain.denyNote = { text: t, at: Date.now() };
}
export const NO_NOTE = (who, what, why) => `${who} said no to: ${what}${why ? ` (their reason: "${why}")` : ''}. Remember this for the rest of this chat: don't offer or try the same thing again, in other words or by another tool, unless ${who} asks for it. Ask what they'd like instead.`;
export function noteNo(brain, ctx, name, args, text) {
  if (!jobHelp(brain.cfg, 'rememberNo') || !ownJob(ctx.job) || !/said no/.test(String(text || ''))) return;
  let what = name; try { what = brain.tools?.[name]?.summary ? brain.tools[name].summary(args || {}) : name; } catch {}
  const why = brain.denyNote && Date.now() - brain.denyNote.at < 60000 ? brain.denyNote.text : '';
  brain.denyNote = null;
  (ctx.noes ||= []).push(NO_NOTE(brain.cfg.userName || 'the user', clip(what, 160), why));
}
// After a round of tool results (never between them): the "no"s go into the chat itself, so they last.
export function flushNoes(ctx, msgs) {
  if (!ctx.noes?.length) return 0;
  const n = ctx.noes.length;
  for (const content of ctx.noes.splice(0)) msgs.push({ role: 'system', content, hidden: true, no: true });
  return n;
}

// ---------------- 58 Reuse look-ups ----------------
export const CACHE_MS = 3600000;
const CACHE_MAX = 200;
const cacheKey = (name, args) => `${name} ${JSON.stringify(Object.keys(args || {}).sort().map((k) => [k, typeof args[k] === 'string' ? args[k].trim().toLowerCase() : args[k]]))}`;
export class LookCache {
  constructor({ now = Date.now } = {}) { this.map = new Map(); this.now = now; }
  get(name, args) {
    const e = this.map.get(cacheKey(name, args));
    if (!e || this.now() - e.at > CACHE_MS) return null;
    return e;
  }
  put(name, args, text) {
    if (failed(text)) return;
    this.map.set(cacheKey(name, args), { text: String(text), at: this.now() });
    while (this.map.size > CACHE_MAX) this.map.delete(this.map.keys().next().value);
  }
}
const ago = (ms) => { const m = Math.round(ms / 60000); return m < 1 ? 'under a minute ago' : m === 1 ? 'a minute ago' : `${m} minutes ago`; };
// A search or page read again within the hour: the saved answer, said plainly. Null when it has to go to the web.
export function cachedLook(brain, name, args, ctx) {
  if (!jobHelp(brain.cfg, 'lookupCache') || !['web_search', 'fetch_page'].includes(name)) return null;
  const e = (brain.lookCache ||= new LookCache()).get(name, args);
  if (!e) return null;
  let sum = name; try { sum = brain.tools?.[name]?.summary ? brain.tools[name].summary(args || {}) : name; } catch {}
  ctx?.emit?.({ type: 'tool', name, summary: `${sum} (from ${ago(brain.lookCache.now() - e.at)})` });
  brain.log?.('jobs', `${name}: reused a look-up from ${ago(brain.lookCache.now() - e.at)}`);
  return { text: `(From the same look-up ${ago(brain.lookCache.now() - e.at)}.)\n${e.text}` };
}
export function keepLook(brain, name, args, res) {
  if (!jobHelp(brain.cfg, 'lookupCache') || !['web_search', 'fetch_page'].includes(name)) return;
  (brain.lookCache ||= new LookCache()).put(name, args, res?.text);
}

// ---------------- 59 Sources and 60 How sure ----------------
export function sourcesBlock(web) {
  if (!web?.pages?.length) return '';
  const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };
  const md = (s) => String(s).replace(/[[\]]/g, '');
  return `\n\n**Sources**\n${web.pages.slice(0, 10).map((u, i) => `${i + 1}. [${md(web.titles?.get(u) || host(u))}](${u})`).join('\n')}`;
}
export const SURE_PROMPT = 'When you answer from web pages: if the pages you read disagree, or what you found is thin (few results, nothing current, one source only), add one short line saying how sure you are and why. If they agree and are solid, don\'t.';
export function thinLine(web) {
  if (!web || !web.searches && !web.pages.length) return '';
  if (web.pages.length) return '';
  return web.searches && web.empty >= web.searches
    ? '\n\n*How sure: not very. My searches came back empty, so this is from what I already knew.*'
    : '\n\n*How sure: not very. I only saw search snippets, not the pages themselves.*';
}

// ---------------- 61 Clickable file:line links ----------------
export const FILE_LINKS_PROMPT = 'When you point at a place in code, write the file\'s full path and the line, like /home/me/app/src/main.js:42 or C:\\work\\app\\main.py:7, so it shows as a link that opens the editor there.';
// The address the editor opens for a file and line, or '' for "the system's own app".
export function editorUrl(editor, file, line = 0) {
  if (!EDITORS.includes(editor) || editor === 'system') return '';
  const f = String(file).replace(/\\/g, '/');
  return `${editor}://file/${encodeURI(f.replace(/^\/+/, '')).replace(/#/g, '%23').replace(/\?/g, '%3F')}${Number(line) > 0 ? `:${Math.floor(Number(line))}` : ''}`;
}

// ---------------- what his instructions get ----------------
export function jobHelpsPrompt(cfg, job) {
  if (!ownJob(job)) return '';
  const out = [];
  if (jobHelp(cfg, 'howSure')) out.push(SURE_PROMPT);
  if (jobHelp(cfg, 'fileLinks')) out.push(FILE_LINKS_PROMPT);
  return out.join(' ');
}

// The answer is out: sources and the thin-ground line go under it (kept in the chat), the receipt goes as a card.
export function afterAnswer(brain, ctx, reply) {
  if (!ctx || !reply || !ownJob(ctx.job)) return '';
  let add = '';
  if (jobHelp(brain.cfg, 'sources')) add += sourcesBlock(ctx.web);
  if (jobHelp(brain.cfg, 'howSure') && !/how sure|not sure|unsure|uncertain|can't be sure|couldn't confirm/i.test(String(reply.content || ''))) add += thinLine(ctx.web);
  if (add) { ctx.emit?.({ type: 'token', text: add }); reply.content = `${String(reply.content || '')}${add}`; }
  if (jobHelp(brain.cfg, 'receipt') && ctx.receipt?.length) {
    ctx.emit?.({ type: 'receipt', items: ctx.receipt.slice(0, 40) });
    reply.receipt = ctx.receipt.slice(0, 40);
    brain.log?.('jobs', `receipt: ${ctx.receipt.length} line${ctx.receipt.length === 1 ? '' : 's'}`);
  }
  if (ctx.timeEnds) ctx.emit?.({ type: 'job-clock', done: true });
  return add;
}

// What Bob tells someone who asks how he's set up (self-help.js).
export const jobHelpsNow = (cfg) => {
  const j = cleanJobHelps(cfg?.jobHelps);
  const on = JOB_HELPS.filter((k) => j[k]);
  return `Jobs (Settings, Jobs): ${on.length ? on.join(', ') : 'all off'}${j.timeLimit ? `; time limit ${j.minutes} minutes` : ''}`;
};
