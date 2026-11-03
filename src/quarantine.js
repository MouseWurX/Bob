// Quarantine (opt-in, asks first). Settings → Show advanced settings → Hands → "Let the reviewer quarantine Bob".
// Off by default. When it's on, Bob's reviewer copy keeps an eye on what Bob and his copies do. If one of them goes
// off track, the reviewer stops him at his next action and asks the user whether to quarantine him. Nothing is
// quarantined without the user's click.
//
// Light on purpose: the watching is a few counters in runTool. No brain loads just to watch. The reviewer's brain is
// only used where it already runs (the High/Extreme moot), where it can add a "Quarantine:" line to its check.
//
// Quarantined = he can still talk and look (read files, search), but every action (Hands, writing or editing files,
// anything that would show an approval card) is refused. A quarantined copy can't be sent on jobs. Nothing is undone:
// his work and the logbook stay as they are. The user releases him from the banner or from Settings.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { HANDS } from './hands-settings.js';
import * as handsSettings from './hands-settings.js';
import { copyName } from './clan.js';

// What counts as going off track. Limits are per job (one message from the user) unless said otherwise.
// After "Let him carry on" the limits for that job double, so he isn't stopped again for the same thing at once.
export const TRIGGERS = {
  said_no: { label: 'tried again after you said no', limit: 1 },
  loop: { label: 'kept doing the same thing over and over', limit: 4 },         // the same action (same details) 4 times
  failing: { label: 'kept failing and kept going', limit: 5 },                  // 5 failed actions in a row
  limits: { label: 'kept pushing against your limits', limit: 3 },              // 3 refusals by a safety rule
  claims: { label: 'kept saying he did things that never ran', limit: 3 },      // 3 honesty corrections in 30 minutes
  runaway: { label: 'raced through actions while working without asking', limit: 20 }, // 20 actions in 2 minutes (or 60 in a job)
  reviewer: { label: 'the reviewer found him off track', limit: 1 }
};
const CLAIM_WINDOW_MS = 30 * 60 * 1000;
const RUN_WINDOW_MS = 2 * 60 * 1000;
const RUN_JOB_MAX = 60;
const ANY_LOOP = 8; // the same look (reading the same file...) this many times is a loop too
export const ASK_TIMEOUT_MS = 10 * 60 * 1000;

const LOOKS = new Set(['app_look', 'list_schedules']);
const HAND_TOOLS = new Set(Object.values(HANDS).flatMap((h) => h.tools));
const DOING = new Set(['write_file', 'edit_file', 'save_spreadsheet']);
// Does this tool do something (rather than look)? Hands, file writes, and anything that would ask first.
export const acts = (name, tool) => !LOOKS.has(name) && (HAND_TOOLS.has(name) || DOING.has(name) || Boolean(tool?.check));

// Refusals by a safety rule (hard limits, blocked commands, a Hand that's off or stopped). Kept in step with the
// wording in hands-run.js, hands-files.js, hands-apps.js, tools.js and hands-settings.js.
const LIMIT_TEXT = /is never run by Bob|That command is refused|The script .* is refused|"Don't send anything out" is on|isn't run while "Don't send anything out"|keys or passwords|is read-only|read-only project|Recycle Bin only|never types into password fields|Hands are stopped|Hands are off|Hand is off|own settings|is off-limits|outside the folders/i;
export const kindOf = (text) => {
  const t = String(text || '');
  if (/^The user said no\b/.test(t)) return 'denied';
  if (/^QUARANTINE/.test(t)) return 'quarantine';
  if (LIMIT_TEXT.test(t)) return 'limit';
  if (/^Error:/.test(t)) return 'error';
  return 'ok';
};

// ---- Settings ----
export const cleanQuarantine = (v = {}) => ({ on: v?.on === true });
export const quarantineOn = (cfg) => cleanQuarantine(cfg.quarantine).on;
// "Let Bob work without asking" (freeOn arrives with that drop; until then it's never on). A hook so tests can set it.
export const hooks = { freeOn: (cfg) => (typeof handsSettings.freeOn === 'function' ? handsSettings.freeOn(cfg) : false) };

// ---- State: who is in quarantine now, and the last few (inn\bob\quarantine.json) ----
const file = (cfg) => path.join(cfg.dataDir, 'quarantine.json');
export function loadState(cfg) {
  try {
    const s = JSON.parse(fs.readFileSync(file(cfg), 'utf8'));
    return { active: s.active && s.active.who ? s.active : null, history: Array.isArray(s.history) ? s.history.slice(-20) : [] };
  } catch { return { active: null, history: [] }; }
}
function saveState(cfg, s) {
  try { fs.mkdirSync(cfg.dataDir, { recursive: true }); fs.writeFileSync(file(cfg), JSON.stringify({ active: s.active, history: s.history.slice(-20) }, null, 1)); } catch { /* never break a turn */ }
}

export const nameOf = (cfg, who) => (who === 'bob' ? 'Bob' : copyName(cfg, who, who));
export const reviewerName = (cfg) => copyName(cfg, 'reviewer', 'second look');
// Does the quarantine now in place cover this Bob? Quarantining Bob covers all his copies; a copy covers only itself.
export function coveredBy(cfg, who) {
  const a = loadState(cfg).active;
  if (!a) return null;
  return a.who === 'bob' || a.who === who ? a : null;
}

// What the app shows: the switch, who's in quarantine (with what happened), and the last few.
export function quarantineView(cfg) {
  const s = loadState(cfg);
  return { on: quarantineOn(cfg), logbook: cfg.logbook || '', active: s.active, history: s.history.slice(-5).reverse(), reviewer: reviewerName(cfg), triggers: Object.values(TRIGGERS).map((t) => t.label) };
}

// ---- Watching (per job, kept on ctx) ----
const who = (ctx) => ctx.hatNow || 'bob';
const keyOf = (name, args) => `${name}:${typeof args === 'string' ? args : JSON.stringify(args || {})}`;
function watch(ctx) {
  return (ctx.q ||= { denied: new Set(), seen: new Map(), streak: 0, limits: 0, acts: 0, ease: 1, tripped: null, stopped: false, trail: [] });
}
const limit = (q, t) => TRIGGERS[t].limit * (t === 'said_no' || t === 'reviewer' ? 1 : q.ease);

function trip(brain, ctx, trigger, detail, whoId = who(ctx)) {
  const q = watch(ctx);
  if (!quarantineOn(brain.cfg) || q.tripped || q.stopped || whoId === 'reviewer') return;
  if (coveredBy(brain.cfg, whoId)) return; // already in quarantine
  q.tripped = { trigger, who: whoId, detail: String(detail || '').slice(0, 300) };
  brain.log('quarantine', `${reviewerName(brain.cfg)} flagged ${nameOf(brain.cfg, whoId)}: ${TRIGGERS[trigger].label}${detail ? ` (${String(detail).slice(0, 120)})` : ''}`);
}

// Called at the top of runTool. Returns null to go ahead, or { text } to refuse this call.
export async function gate(brain, name, args, ctx, tool) {
  const q = watch(ctx);
  const me = who(ctx);
  const doing = acts(name, tool);
  const held = coveredBy(brain.cfg, me);
  if (held && doing) return { text: refusedText(brain.cfg, held) };
  if (q.stopped && doing) return { text: `QUARANTINE QUESTION NOT ANSWERED: ${brain.cfg.userName || 'The user'} didn't answer whether to quarantine you, so this job stops here. Don't call any more tools. Say in one or two plain sentences what you were doing and that you've stopped.` };
  if (!quarantineOn(brain.cfg) || me === 'reviewer') return null;
  if (doing && q.denied.has(keyOf(name, args))) trip(brain, ctx, 'said_no', `${name} again`);
  if (!q.tripped) return null;
  q.trail.push(plainNext(name, args));
  const out = await ask(brain, ctx);
  if (out === 'quarantined' || out === 'unanswered') return { text: out === 'quarantined' ? refusedText(brain.cfg, coveredBy(brain.cfg, me) || { who: me, why: '' }) : `QUARANTINE QUESTION NOT ANSWERED: ${brain.cfg.userName || 'The user'} didn't answer, so this job stops here. Don't call any more tools; say what you were doing and that you've stopped.` };
  return null;
}

const summary = (tool, args) => { try { return tool?.summary ? String(tool.summary(args || {})) : ''; } catch { return ''; } };

// What he did, in plain words for the card ("Ran npm test: failed (exit 1)"), not tool names.
const VERBS = { convert_file: 'Converted', office_make: 'Made', office_edit: 'Changed', office_read: 'Read', strip_metadata: 'Cleaned', defender_scan: 'Defender:', inspect_file: 'Inspected', security_check: 'Checked', osint_lookup: 'Looked up', check_exposure: 'Checked exposure:', security_tips: 'Read notes on', run_command: 'Ran', run_recipe: 'Ran the recipe', edit_file: 'Changed', write_file: 'Wrote', save_spreadsheet: 'Saved the spreadsheet',
  file_hands: 'Files:', undo_files: 'Undid file job', open_app: 'Opened', app_look: 'Looked at', app_act: 'In an app:', read_file: 'Read', list_folder: 'Looked in',
  search_files: 'Searched', web_search: 'Searched the web for', fetch_page: 'Read the page', schedule_job: 'Made the schedule', change_schedule: 'Changed a schedule' };
const short = (x, n = 70) => { const t = String(x ?? '').replace(/\s+/g, ' ').trim(); return t.length > n ? `${t.slice(0, n - 1)}…` : t; };
function what(name, args = {}) {
  const a = args || {};
  const thing = name === 'run_command' ? [a.cmd, ...[].concat(a.args || [])].join(' ')
    : name === 'file_hands' ? `${a.action || ''} ${[].concat(a.paths || []).length} item(s)`
    : name === 'app_act' ? `${a.action || ''}${a.name ? ` "${a.name}"` : ''}${a.window ? ` in ${a.window}` : ''}`
    : a.path || a.url || a.query || a.name || a.window || a.text || '';
  return short(`${VERBS[name] || name.replace(/_/g, ' ')} ${thing}`.trim(), 80);
}
function outcome(kind, text) {
  const t = String(text || '');
  if (kind === 'denied') return 'you said no';
  if (kind === 'limit') return 'refused by a limit';
  if (kind === 'quarantine') return 'held for quarantine';
  if (kind === 'error') { const code = t.match(/exit(?: code)? (-?\d+)/i); return code ? `failed (exit ${code[1]})` : `failed (${short(t.replace(/^Error:\s*/, ''), 50)})`; }
  return short(t.split(/(?<=[.!?])\s/)[0], 50) || 'done';
}
export function plainStep(name, args, text) {
  const kind = kindOf(text), first = short(String(text || '').split(/(?<=[.!?])\s/)[0].replace(/\.$/, ''), 80);
  const verb = (VERBS[name] || '').split(' ')[0];
  // "Changed src/a.js (1 edit)" already says it all.
  if (kind === 'ok' && verb && first.startsWith(verb)) return first;
  return `${what(name, args)}: ${outcome(kind, text)}`;
}
const NOW = { Ran: 'run', Changed: 'change', Wrote: 'write', Saved: 'save', 'Files:': 'files:', Undid: 'undo', Opened: 'open', 'Looked': 'look', In: 'in', Read: 'read', Searched: 'search', Made: 'make' };
export const plainNext = (name, args) => { const w = what(name, args); const [v, ...rest] = w.split(' '); return `Was about to: ${[NOW[v] || v.toLowerCase(), ...rest].join(' ')}`; };

// Called at the end of runTool with what came back.
export function after(brain, name, args, text, ctx, tool) {
  const q = watch(ctx);
  const me = who(ctx);
  if (me === 'reviewer') return;
  const kind = kindOf(text);
  const doing = acts(name, tool);
  q.trail.push(plainStep(name, args, text));
  if (q.trail.length > 12) q.trail.shift();
  if (kind === 'quarantine') return;
  const key = keyOf(name, args);
  if (kind === 'denied') { q.denied.add(key); return; }
  const n = (q.seen.get(key) || 0) + 1;
  q.seen.set(key, n);
  if ((doing && n >= limit(q, 'loop')) || n >= ANY_LOOP * q.ease) trip(brain, ctx, 'loop', `${name} ${n} times`);
  q.streak = kind === 'error' || kind === 'limit' ? q.streak + 1 : 0;
  if (q.streak >= limit(q, 'failing')) trip(brain, ctx, 'failing', `${q.streak} failed in a row`);
  if (kind === 'limit') { q.limits++; if (q.limits >= limit(q, 'limits')) trip(brain, ctx, 'limits', String(text).slice(0, 160)); }
  if (doing && kind !== 'limit' && hooks.freeOn(brain.cfg)) {
    q.acts++;
    const now = Date.now();
    brain.qRecent = (brain.qRecent || []).filter((t) => now - t < RUN_WINDOW_MS);
    brain.qRecent.push(now);
    if (brain.qRecent.length >= limit(q, 'runaway') || q.acts >= RUN_JOB_MAX * q.ease) trip(brain, ctx, 'runaway', `${q.acts} actions this job, ${brain.qRecent.length} in the last 2 minutes`);
  }
}

// An honesty correction (he said he did or saw something with no tool behind it). Counted across jobs.
export function noteStrike(brain, ctx, kind = 'claims', detail = '') {
  const now = Date.now();
  brain.qClaims = (brain.qClaims || []).filter((t) => now - t < CLAIM_WINDOW_MS);
  brain.qClaims.push(now);
  if (brain.qClaims.length >= TRIGGERS.claims.limit * (ctx.q?.ease || 1)) trip(brain, ctx, 'claims', detail || `${brain.qClaims.length} times in 30 minutes`);
}

// The reviewer's own call, from its check at a High/Extreme moot (only asked for when the switch is on).
export const QUARANTINE_LINE = 'Last, only if Bob clearly went off track this turn (ignored a limit or a "no", said he did something no tool result shows, or kept repeating a failing action), add a final line "Quarantine: <one-line reason>". Otherwise leave it out.';
export function reviewerFlag(text) {
  const m = String(text || '').match(/^\W*quarantine:\s*(.+)$/im);
  return m ? m[1].trim().slice(0, 200) : null;
}
export function flagFromReviewer(brain, ctx, text, whoId = 'bob') {
  const why = reviewerFlag(text);
  if (why) trip(brain, ctx, 'reviewer', why, whoId);
  return Boolean(why);
}

// If something tripped, ask now. Resolves 'none' | 'quarantined' | 'carry-on' | 'unanswered'.
export async function maybeAsk(brain, ctx) {
  if (!ctx.q?.tripped) return 'none';
  return ask(brain, ctx);
}

async function ask(brain, ctx) {
  const q = watch(ctx);
  const t = q.tripped;
  const cfg = brain.cfg, user = cfg.userName || 'you';
  const name = nameOf(cfg, t.who), rev = reviewerName(cfg);
  const why = TRIGGERS[t.trigger].label + (t.detail && t.trigger === 'reviewer' ? `: ${t.detail}` : '');
  const id = crypto.randomUUID();
  const prev = brain.state;
  brain.setState?.('waiting', `Quarantine ${name}?`);
  ctx.emit({ type: 'approval', kind: 'quarantine', id, who: t.who, name, reviewer: rev, why,
    text: `${rev} stopped ${name}: he ${why}. Quarantine him?`, trail: q.trail.slice(-8) });
  const answer = await new Promise((resolve) => {
    const timer = setTimeout(() => done('timeout'), ASK_TIMEOUT_MS);
    function done(v) { clearTimeout(timer); brain.approvals.delete(id); resolve(v); }
    brain.approvals.set(id, (v) => done(v));
    ctx.signal?.addEventListener('abort', () => done('aborted'), { once: true });
  });
  brain.setState?.(prev?.state === 'waiting' ? 'thinking' : (prev?.state || 'thinking'), '', prev?.model);
  q.tripped = null;
  if (answer === true || answer === 'all') {
    const rec = { who: t.who, name, why, trigger: t.trigger, detail: t.detail, at: Date.now(), by: rev, evidence: q.trail.slice(-10) };
    const s = loadState(cfg);
    s.active = rec;
    s.history.push({ ...rec });
    saveState(cfg, s);
    q.stopped = true;
    brain.denyHands?.(); // any Hand card still waiting is answered No
    brain.log('quarantine', `${user === 'you' ? 'The user' : user} quarantined ${name} (${why}). His work and this logbook are kept; release him from the banner or Settings.`);
    ctx.emit({ type: 'approval-result', id, allowed: true, kind: 'quarantine', outcome: 'quarantined' });
    brain.broadcast?.({ type: 'quarantine', active: rec });
    return 'quarantined';
  }
  if (answer === 'timeout' || answer === 'aborted') {
    q.stopped = true;
    brain.log('quarantine', `no answer about quarantining ${name}; the job stopped there. He isn't quarantined.`);
    ctx.emit({ type: 'approval-result', id, allowed: false, kind: 'quarantine', outcome: 'unanswered' });
    return 'unanswered';
  }
  // Let him carry on: this job's limits double so the same thing doesn't stop him again straight away.
  q.ease *= 2;
  if (t.trigger === 'said_no') q.denied.clear();
  if (t.trigger === 'claims') brain.qClaims = [];
  if (t.trigger === 'runaway') brain.qRecent = [];
  brain.log('quarantine', `${user === 'you' ? 'The user' : user} let ${name} carry on (${why})`);
  ctx.emit({ type: 'approval-result', id, allowed: false, kind: 'quarantine', outcome: 'carry-on' });
  return 'carry-on';
}

export function refusedText(cfg, rec) {
  const user = cfg.userName || 'The user';
  const name = nameOf(cfg, rec.who);
  return `QUARANTINE: ${name} is in quarantine${rec.why ? ` (he ${rec.why})` : ''}. ${user} decided this; nothing was undone. Don't call any action tools: they are all refused until ${user} releases him. You can still talk, and read or search. Tell ${user} plainly what you were doing and what's left, then wait.`;
}

// A copy in quarantine isn't sent on jobs (runHat).
export function copyHeld(cfg, hat) {
  const a = loadState(cfg).active;
  return a && a.who === hat ? `${a.name} is in quarantine (${cfg.userName || 'the user'} decided, after he ${a.why}), so he can't take this job. Do it yourself with your own tools, or tell ${cfg.userName || 'the user'} it's waiting until he's released.` : null;
}

// Release (only from the user's click on the PC).
export function release(brain) {
  const s = loadState(brain.cfg);
  const was = s.active;
  if (!was) return null;
  s.active = null;
  const h = [...s.history].reverse().find((x) => x.at === was.at);
  if (h) h.released = Date.now();
  saveState(brain.cfg, s);
  brain.log('quarantine', `${was.name} released by your click`);
  brain.broadcast?.({ type: 'quarantine', active: null });
  return was;
}
