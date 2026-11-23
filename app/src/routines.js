// Routines (the Routines Hand, off by default): routines you wire up yourself in the Routines editor
// (public/routines.html), like Unreal's Blueprints, and that plain code then runs by itself. The brain is used only
// at "Ask the brain" nodes, and only to answer: it never makes, changes or adds steps.
//
// What's kept (all on this replicant matrix, under inn\bob\routines):
//   <id>.json                the routine (public/routine-nodes.js says what's in it)
//   state.json               per routine: on/off, your OK (tied to the routine's fingerprint), what its trigger has
//                            seen (files, e-mails, the page), failures in a row
//   versions\<id>\<n>.json   every saved version (up to 30), for "Go back to this version"
//   runs\<id>\<runId>.json   each run, step by step (the last 50): what went into and came out of every node
//
// Robust by design:
//   - a run's state is saved after every step. If Bob closes or the replicant matrix sleeps mid-run, the run carries on
//     from the last finished step when Bob is back. A step that changes something and was cut off half-way isn't run
//     again (it might have happened): the run stops there and says so. Nothing happens twice.
//   - each step has a time limit, and steps that only look (or are safe to repeat) get a second try after a pause.
//   - a tool or brain node's "failed" pin takes the run somewhere else when it fails. Without one the run stops.
//   - one run of a routine at a time; more triggers wait their turn (up to 20).
//   - two failed runs in a row pause the routine and tap you on the shoulder.
//   - a routine only runs while: the Routines Hand is on, it is switched on, its OK matches what it is now
//     (change a step or a wire and it needs your OK again), and it has no problems.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { NODES, ROUTINE_TOOLS, cleanRoutine, checkRoutine, graphHash, approvalLines, isTrigger, refsIn, onlyRef, outsOf, MAX_LOOP, MAX_STEPS, MAX_WAIT_S, blankRoutine, triggerWords } from '../public/routine-nodes.js';
import { cleanWhen, nextAfter, describe } from './schedules.js';
import { writeJsonAtomic, stripBom } from './util.js';

export const MAX_ROUTINES = 100;
export const KEEP_RUNS = 50;
export const KEEP_VERSIONS = 30;
export const MAX_QUEUE = 20;
export const PAUSE_AFTER_FAILS = 2;
export const TOOL_LIMIT_MS = 5 * 60e3;
export const BRAIN_LIMIT_MS = 3 * 60e3;
export const RETRY_WAIT_MS = 3000;
export const MAIL_EVERY_MS = 5 * 60e3;
const VALUE_CAP = 100000; // characters kept for one value inside a run
const SHOW_CAP = 2000; // characters of a value shown in the run record

const readJson = (f, fallback) => { try { return JSON.parse(stripBom(fs.readFileSync(f, 'utf8'))); } catch { return fallback; } };
const short = (s, n = SHOW_CAP) => { const t = typeof s === 'string' ? s : JSON.stringify(s); return t && t.length > n ? `${t.slice(0, n)}…` : t; };
export const safeName = (s) => String(s || 'Routine').replace(/[\\/:*?"<>|\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().replace(/^\.+/, '').slice(0, 60) || 'Routine';

export const routinesDir = (cfg) => path.join(cfg.dataDir, 'routines');
// Where a routine's "Save to a file" results go: Documents\Bob\Routines\<name> (cfg.routinesOut in tests).
export const outFolder = (cfg, r) => path.join(cfg.routinesOut || path.join(os.homedir(), 'Documents', 'Bob', 'Routines'), safeName(r.name));

// ---------------------------------------------------------------------------------------------------------------
// Running one routine
// ---------------------------------------------------------------------------------------------------------------
class StopRun extends Error { constructor(failed, why) { super(why || 'Stopped by a Stop node.'); this.failed = failed; } }
const sleepReal = (ms, signal) => new Promise((resolve) => { const t = setTimeout(resolve, ms); signal?.addEventListener?.('abort', () => { clearTimeout(t); resolve(); }, { once: true }); });

// A field's value with its {{node.pin}} wires filled in. A field that is exactly one wire keeps the value's own
// type (a list stays a list); words around wires make text.
export function fieldValue(v, values) {
  const whole = onlyRef(v);
  if (whole) return values.get(whole.node)?.[whole.pin] ?? '';
  if (typeof v !== 'string') return v;
  return v.replace(/\{\{\s*([A-Za-z0-9_-]{1,40})\.([A-Za-z0-9_]{1,40})\s*\}\}/g, (m, n, p) => asText(values.get(n)?.[p]));
}
const asText = (x) => (x == null ? '' : Array.isArray(x) ? x.join('\n') : typeof x === 'boolean' ? (x ? 'yes' : 'no') : String(x));
export const toList = (x) => (Array.isArray(x) ? x : String(x ?? '').replace(/\r\n/g, '\n').split('\n').map((l) => l.trim()).filter(Boolean));
const isYes = (x) => x === true || /^\s*(yes|true|y|1)\b/i.test(String(x ?? ''));

export function ifTest(test, value, w) {
  const a = asText(value), b = asText(w);
  if (test === 'contains') return a.toLowerCase().includes(b.toLowerCase());
  if (test === 'equals') return a.trim().toLowerCase() === b.trim().toLowerCase();
  if (test === 'empty') return !a.trim();
  if (test === 'notEmpty') return Boolean(a.trim());
  if (test === 'yes') return isYes(value);
  const x = parseFloat(a.replace(/[^\d.-]/g, '')), y = parseFloat(b.replace(/[^\d.-]/g, ''));
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
  return test === 'more' ? x > y : test === 'less' ? x < y : false;
}

// Runs a routine. deps (all optional except what the routine's nodes use):
//   callTool(name, args) -> { text, ok }     one of Bob's tools, through his usual tool runner (limits and all)
//   askBrain(question, input, { yesNo })     the small brain's answer, as text
//   writeOut(file, text, add) / made(file) / notice(text) / tap(text) / chat(text)
//   saveRun(run)    called after every step (the run state on disk)
//   sleep(ms), now(), limitMs(kind)          for tests
// opts: { run } to carry on a run that was cut off, { dry: true } for Test (changes are only described).
export async function runRoutine(r, trigger = {}, deps = {}, opts = {}) {
  const now = deps.now || Date.now;
  const sleep = deps.sleep || sleepReal;
  const byId = new Map(r.nodes.map((n) => [n.id, n]));
  const next = new Map(r.wires.map((w) => [`${w.from}.${w.out}`, w.to]));
  const run = opts.run || { id: crypto.randomUUID(), routine: r.id, name: r.name, hash: graphHash(r), dry: Boolean(opts.dry), startedAt: now(), trigger: trimValues(trigger), status: 'running', steps: [], done: {} };
  run.status = 'running';
  run.resumed = opts.run ? (run.resumed || 0) + 1 : 0;
  const values = new Map();
  let steps = 0;
  const save = () => { try { deps.saveRun?.(run); } catch {} };
  const trig = r.nodes.find((n) => isTrigger(n.kind));
  const limit = (kind) => deps.limitMs?.(kind) ?? (kind === 'brain' ? BRAIN_LIMIT_MS : TOOL_LIMIT_MS);

  // One node: returns { out, pin }.
  const doNode = async (n) => {
    const f = n.f || {};
    const val = (k) => fieldValue(f[k], values);
    switch (n.kind) {
      case 'if': return { out: {}, pin: ifTest(f.test, val('value'), val('with')) ? 'yes' : 'no' };
      case 'text': return { out: { text: asText(val('text')) } };
      case 'lines': { const l = toList(val('text')); return { out: { list: l, count: l.length } }; }
      case 'wait': { const s = Math.max(0, Math.min(MAX_WAIT_S, Number(val('seconds')) || 0)); if (!run.dry) await sleep(s * 1000, opts.signal); return { out: {} }; }
      case 'stop': throw new StopRun(f.failed === true || f.failed === 'true', asText(val('why')) || '');
      case 'tool': return toolNode(n, val);
      case 'brain': return brainNode(n, val);
      case 'out.file': {
        const name = safeName(asText(val('name')));
        const text = asText(val('text'));
        const add = f.add === true || f.add === 'true';
        if (run.dry) return { out: { path: name }, said: `Test run: would ${add ? 'add to' : 'save'} ${name} (${text.length} characters)` };
        const file = await deps.writeOut(name, text, add);
        return { out: { path: file } };
      }
      case 'out.made': { const p = asText(val('path')); if (!run.dry) await deps.made?.(p); return { out: {}, said: run.dry ? `Test run: would add ${p} to Made by Bob` : '' }; }
      case 'out.notice': { const t = asText(val('text')); if (!run.dry) await deps.notice(t); return { out: {}, said: run.dry ? `Test run: would add to the notice board: ${short(t, 200)}` : '' }; }
      case 'out.tap': { const t = asText(val('text')); if (!run.dry) await deps.tap(t); return { out: {}, said: run.dry ? `Test run: would tap you on the shoulder: ${short(t, 200)}` : '' }; }
      case 'out.chat': { const t = asText(val('text')); if (!run.dry) await deps.chat(t); return { out: {}, said: run.dry ? `Test run: would post in the Routines chat: ${short(t, 200)}` : '' }; }
      default: throw new Error(`Bob doesn't know the node "${n.kind}".`);
    }
  };
  const tries = async (n, kind, safe, go) => {
    const max = safe ? 2 : 1;
    let last;
    for (let i = 1; i <= max; i++) {
      try {
        const r2 = await withLimit(go(), limit(kind), `${NODES[n.kind]?.label || n.kind} took longer than ${Math.round(limit(kind) / 60000)} minutes`);
        return { ...r2, tries: i };
      } catch (e) { last = e; if (i < max) await sleep(RETRY_WAIT_MS * i, opts.signal); }
    }
    last.tries = max;
    throw last;
  };
  const toolNode = async (n, val) => {
    const name = n.f.tool;
    const t = ROUTINE_TOOLS[name];
    if (!t) throw new Error(`"${name}" can't be used in a routine.`);
    const args = {};
    for (const k of Object.keys(t.fields)) { const v = val(k); if (v !== '' && v != null) args[k] = t.fields[k] === 'number' ? Number(v) : asText(v); }
    if (run.dry && t.risk !== 'look') return { out: { text: '', result: '', ok: true }, said: `Test run: would use ${t.label} with ${JSON.stringify(args)}` };
    const got = await tries(n, 'tool', t.risk === 'look' || t.again, async () => {
      const res = await deps.callTool(name, args);
      const text = String(res?.text ?? res ?? '');
      if (res?.ok === false || /^Error:/.test(text)) throw new Error(text.replace(/^Error:\s*/, '') || `${t.label} didn't work.`);
      return { text };
    });
    const out = { result: got.text, text: got.text, ok: true };
    if (t.out.list) out.list = toList(got.text);
    return { out, tries: got.tries };
  };
  const brainNode = async (n, val) => {
    const yesNo = n.f.answer === 'yesno';
    const got = await tries(n, 'brain', true, async () => {
      const a = String(await deps.askBrain(asText(val('question')), asText(val('input')), { yesNo }) ?? '').trim();
      if (!a) throw new Error('The brain gave no answer.');
      return { a };
    });
    return { out: { answer: got.a, yes: isYes(got.a) }, tries: got.tries };
  };

  // Runs the chain that starts at `id`. pre: the key prefix inside For each loops ("n4#2/").
  const chain = async (id, pre = '') => {
    while (id) {
      const n = byId.get(id);
      if (!n) return;
      if (++steps > MAX_STEPS) throw new Error(`The run passed ${MAX_STEPS} steps, so it was stopped.`);
      opts.signal?.throwIfAborted?.();
      const key = pre + id;
      let pin = 'then';
      if (n.kind === 'forEach') {
        const items = toList(fieldValue(n.f.list, values)).slice(0, MAX_LOOP);
        const start = next.get(`${id}.each`);
        for (let i = 0; i < items.length; i++) {
          values.set(id, { item: items[i], index: i });
          if (start) await chain(start, `${key}#${i}/`);
        }
        rec(key, n, { out: { count: items.length } });
        pin = 'done';
      } else if (run.done[key]) {
        // Carrying on after Bob was closed: this step already finished, so its result is used, not run again.
        values.set(id, run.done[key].out);
        pin = run.done[key].pin;
      } else if (run.begun?.[key]) {
        const t = n.kind === 'tool' ? ROUTINE_TOOLS[n.f.tool] : null;
        const safe = n.kind !== 'tool' && !n.kind.startsWith('out.') ? true : Boolean(t && (t.risk === 'look' || t.again));
        if (!safe) throw Object.assign(new Error(`Bob was closed while "${label(n)}" was running, and it may have happened already, so it wasn't run again (nothing happens twice). Check it, then run the routine again if you need to.`), { node: id });
        delete run.begun[key];
        continue;
      } else {
        (run.begun ||= {})[key] = now();
        save();
        const at = now();
        let res;
        try {
          res = n === trig ? { out: trigger } : await doNode(n);
        } catch (e) {
          delete run.begun[key];
          if (e instanceof StopRun) { rec(key, n, { out: {}, said: e.message, stop: true }, at); throw e; }
          const failedPin = (n.kind === 'tool' || n.kind === 'brain') && next.get(`${id}.failed`);
          rec(key, n, { out: { ok: false }, error: String(e.message || e).slice(0, 600), tries: e.tries || 1 }, at, failedPin ? 'failed' : null);
          if (failedPin) { values.set(id, { ok: false, result: `Error: ${e.message}`, answer: '' }); id = failedPin; continue; }
          throw Object.assign(e, { node: id });
        }
        delete run.begun[key];
        pin = res.pin || 'then';
        values.set(id, res.out);
        run.done[key] = { out: trimValues(res.out), pin };
        rec(key, n, res, at, pin);
      }
      id = next.get(`${id}.${pin}`);
    }
  };
  const label = (n) => (n.kind === 'tool' ? ROUTINE_TOOLS[n.f.tool]?.label : NODES[n.kind]?.label) || n.kind;
  const rec = (key, n, res, at = now(), pin = null) => {
    run.steps.push({ key, node: n.id, label: label(n), at, ms: now() - at, ok: !res.error, ...(pin ? { pin } : {}), out: showValues(res.out), ...(res.said ? { said: res.said } : {}), ...(res.error ? { error: res.error } : {}), ...(res.tries > 1 ? { tries: res.tries } : {}) });
    if (run.steps.length > 400) run.steps.splice(1, run.steps.length - 400);
    run.at = n.id;
    save();
  };

  try {
    if (!trig) throw new Error('This routine has no "Starts when" node.');
    // Results of finished steps from before (carrying on): their values are back in place before anything runs.
    for (const [k, v] of Object.entries(run.done)) if (!k.includes('/')) values.set(k, v.out);
    await chain(trig.id);
    run.status = 'done';
  } catch (e) {
    if (e instanceof StopRun) { run.status = e.failed ? 'failed' : 'done'; if (e.failed) run.error = e.message; }
    else if (opts.signal?.aborted) { run.status = 'stopped'; run.error = 'Stopped.'; }
    else { run.status = 'failed'; run.error = String(e.message || e).slice(0, 600); run.failedAt = e.node || ''; }
  }
  run.endedAt = now();
  delete run.at;
  save();
  return run;
}
function withLimit(p, ms, why) {
  let t;
  return Promise.race([Promise.resolve(p).finally(() => clearTimeout(t)), new Promise((_, no) => { t = setTimeout(() => no(new Error(why)), ms); })]);
}
function trimValues(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) out[k] = typeof v === 'string' ? v.slice(0, VALUE_CAP) : Array.isArray(v) ? v.slice(0, MAX_LOOP).map((x) => String(x).slice(0, 4000)) : v;
  return out;
}
function showValues(o) {
  const out = {};
  for (const [k, v] of Object.entries(o || {})) out[k] = Array.isArray(v) ? v.slice(0, 50).map((x) => short(String(x), 300)) : typeof v === 'string' ? short(v) : v;
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// The store: routines, their switches and OKs, versions and runs
// ---------------------------------------------------------------------------------------------------------------
export class RoutineStore {
  constructor(cfg) { this.cfg = cfg; }
  get dir() { return routinesDir(this.cfg); }
  file(id) { return path.join(this.dir, `${id}.json`); }
  get stateFile() { return path.join(this.dir, 'state.json'); }
  state() { const s = readJson(this.stateFile, {}); return s && typeof s === 'object' ? s : {}; }
  setState(id, patch) {
    const s = this.state();
    s[id] = { ...(s[id] || {}), ...patch };
    for (const [k, v] of Object.entries(patch)) if (v === undefined) delete s[id][k];
    fs.mkdirSync(this.dir, { recursive: true });
    writeJsonAtomic(this.stateFile, s);
    return s[id];
  }
  ids() { try { return fs.readdirSync(this.dir).filter((f) => /^[A-Za-z0-9_-]{1,40}\.json$/.test(f) && f !== 'state.json').map((f) => f.slice(0, -5)); } catch { return []; } }
  get(id) {
    if (!/^[A-Za-z0-9_-]{1,40}$/.test(String(id || ''))) return null;
    const raw = readJson(this.file(id), null);
    if (!raw) return null;
    try { return cleanRoutine(raw); } catch { return null; }
  }
  list() { return this.ids().map((id) => this.get(id)).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name)); }
  // Saves a routine (new or changed). A change to what it does keeps the old version and needs a new OK.
  save(raw) {
    const r = cleanRoutine(raw);
    const old = this.get(r.id);
    if (!old && this.ids().length >= MAX_ROUTINES) throw new Error(`Up to ${MAX_ROUTINES} routines.`);
    fs.mkdirSync(this.dir, { recursive: true });
    writeJsonAtomic(this.file(r.id), r);
    if (!old || graphHash(old) !== graphHash(r)) this.keepVersion(r); // every version that did something different
    return r;
  }
  keepVersion(r) {
    const d = path.join(this.dir, 'versions', r.id);
    fs.mkdirSync(d, { recursive: true });
    const have = this.versions(r.id);
    if (have.length && have[0].hash === graphHash(r)) return;
    const n = (have[0]?.n || 0) + 1;
    writeJsonAtomic(path.join(d, `${n}.json`), { ...r, savedAt: Date.now() });
    for (const v of have.slice(KEEP_VERSIONS - 1)) try { fs.rmSync(path.join(d, `${v.n}.json`), { force: true }); } catch {}
  }
  versions(id) {
    const d = path.join(this.dir, 'versions', String(id));
    let files = [];
    try { files = fs.readdirSync(d).filter((f) => /^\d+\.json$/.test(f)); } catch {}
    return files.map((f) => { const v = readJson(path.join(d, f), null); return v && { n: Number(f.slice(0, -5)), at: v.savedAt || 0, hash: graphHash(v), nodes: (v.nodes || []).length }; }).filter(Boolean).sort((a, b) => b.n - a.n);
  }
  // Puts back an older version (it becomes the newest version). It runs only with an OK for exactly that version.
  rollback(id, n) {
    const v = readJson(path.join(this.dir, 'versions', String(id), `${Math.round(Number(n))}.json`), null);
    if (!v) throw new Error('That version isn\'t kept any more.');
    const { savedAt, ...r } = v;
    writeJsonAtomic(this.file(id), cleanRoutine({ ...r, id }));
    this.keepVersion(this.get(id));
    return this.get(id);
  }
  remove(id) {
    if (!this.get(id)) return false;
    fs.rmSync(this.file(id), { force: true });
    const s = this.state(); delete s[id]; writeJsonAtomic(this.stateFile, s);
    return true;
  }
  // Runs: saved after every step, the newest 50 kept.
  runsDir(id) { return path.join(this.dir, 'runs', String(id)); }
  saveRun(run) {
    const d = this.runsDir(run.routine);
    fs.mkdirSync(d, { recursive: true });
    writeJsonAtomic(path.join(d, `${run.startedAt}-${run.id.slice(0, 8)}.json`), run, 0);
  }
  runs(id, { full = false } = {}) {
    let files = [];
    try { files = fs.readdirSync(this.runsDir(id)).filter((f) => f.endsWith('.json')).sort().reverse(); } catch {}
    for (const f of files.slice(KEEP_RUNS)) try { fs.rmSync(path.join(this.runsDir(id), f), { force: true }); } catch {}
    return files.slice(0, KEEP_RUNS).map((f) => readJson(path.join(this.runsDir(id), f), null)).filter(Boolean).map((r) => (full ? r : { id: r.id, startedAt: r.startedAt, endedAt: r.endedAt, status: r.status, dry: r.dry, error: r.error, steps: r.steps.length, at: r.at }));
  }
  run(id, runId) { return this.runs(id, { full: true }).find((r) => r.id === runId) || null; }
  // Runs that were cut off (Bob closed or the replicant matrix slept mid-run): carried on at the next start.
  unfinished() { return this.ids().flatMap((id) => this.runs(id, { full: true }).filter((r) => r.status === 'running' && !r.dry)); }
}

// What the editor and Settings show for one routine.
export function routineView(store, r, { tools = null, afterMail = null } = {}) {
  const st = store.state()[r.id] || {};
  const hash = graphHash(r);
  const problems = checkRoutine(r, { tools, afterMail });
  const approved = Boolean(st.approved && st.approved.hash === hash);
  const trig = r.nodes.find((n) => isTrigger(n.kind));
  return { ...r, hash, problems, approved, approvedAt: approved ? st.approved.at : 0, changedSinceOk: Boolean(st.approved && !approved), on: st.on === true && approved && !problems.length, paused: st.paused || '', fails: st.fails || 0, lastRun: st.lastRun || null, nextDue: st.nextDue || 0, starts: trig ? triggerWords(trig) : '', lines: approvalLines(r) };
}

// ---------------------------------------------------------------------------------------------------------------
// The runner: triggers, the queue, carrying on after a restart
// ---------------------------------------------------------------------------------------------------------------
// deps: { isOn() (the Routines Hand), hold() (another user is in, quiet hours...), tools(), afterMail, runDeps(r) for
// runRoutine, log(kind, text), tap(text), listMail(opts), readMail(uid), checkPage(watch), listFolder(dir), now() }
export class Routines {
  constructor(cfg, deps = {}) {
    this.cfg = cfg;
    this.deps = deps;
    this.store = new RoutineStore(cfg);
    this.running = new Map(); // id -> { run, ac }
    this.queue = new Map(); // id -> [trigger data]
    this.mailChecked = 0;
  }
  now() { return this.deps.now ? this.deps.now() : Date.now(); }
  log(t) { this.deps.log?.('routines', t); }
  view(r) { return routineView(this.store, r, { tools: this.deps.tools?.() || null, afterMail: this.deps.afterMail || null }); }
  list() { return this.store.list().map((r) => this.view(r)); }
  get(id) { const r = this.store.get(id); return r && this.view(r); }
  create(name) {
    const id = `r${crypto.randomBytes(5).toString('hex')}`;
    return this.view(this.store.save(blankRoutine(id, String(name || 'New routine').slice(0, 80))));
  }
  save(raw) {
    const r = this.store.save(raw);
    const v = this.view(r);
    if (v.changedSinceOk) this.log(`"${r.name}" changed, so it needs your OK again before it runs`);
    return v;
  }
  // Your OK (the click on the switch-on card, on this replicant matrix): tied to exactly what the routine is now.
  approve(id, hash) {
    const r = this.store.get(id);
    if (!r) throw new Error('No such routine.');
    const v = this.view(r);
    if (v.problems.length) throw new Error(`Fix the ${v.problems.length === 1 ? 'problem' : `${v.problems.length} problems`} first (the red marks).`);
    if (hash !== v.hash) throw new Error('The routine changed since that card was drawn. Look at it again.');
    this.store.setState(id, { approved: { hash, at: this.now(), lines: v.lines.map((l) => l.text) }, on: true, paused: undefined, fails: 0, seen: undefined, lastUid: undefined, page: undefined, onAt: this.now(), nextDue: undefined });
    this.log(`"${r.name}" switched on with your OK: ${v.lines.map((l) => l.text).join('; ').slice(0, 300)}`);
    return this.get(id);
  }
  setOn(id, on) {
    const v = this.get(id);
    if (!v) throw new Error('No such routine.');
    if (on && !v.approved) throw new Error('Switching it on needs your OK on its card first (in the Routines editor).');
    if (on && v.problems.length) throw new Error('It has problems to fix first (the red marks in the editor).');
    this.store.setState(id, { on: Boolean(on), ...(on ? { paused: undefined, fails: 0, onAt: this.now() } : {}) });
    if (!on) this.running.get(id)?.ac.abort();
    this.log(`"${v.name}" switched ${on ? 'on' : 'off'}`);
    return this.get(id);
  }
  remove(id) { this.running.get(id)?.ac.abort(); return this.store.remove(id); }
  rollback(id, n) { const r = this.store.rollback(id, n); this.log(`"${r.name}" went back to version ${n}; it needs your OK again`); return this.view(r); }

  // Can this routine run right now? '' when it can, or why not.
  whyNot(v) {
    if (!this.deps.isOn?.()) return 'The Routines Hand is off (Settings, Hands).';
    if (!v.approved) return v.changedSinceOk ? 'It changed since your OK, so it needs your OK again.' : 'It needs your OK first.';
    if (v.problems.length) return 'It has problems to fix first.';
    return '';
  }
  // Starts a run (or queues it behind the one going). manual: Run now (works while switched off, still needs the OK).
  async start(id, trigger = {}, { manual = false, dry = false } = {}) {
    const v = this.get(id);
    if (!v) throw new Error('No such routine.');
    if (!dry) {
      const no = this.whyNot(v);
      if (no) throw new Error(no);
      if (!manual && !v.on) return null;
    } else if (v.problems.length) throw new Error('Fix the problems first (the red marks).');
    if (this.running.has(id)) {
      const q = this.queue.get(id) || [];
      if (q.length >= MAX_QUEUE) { this.log(`"${v.name}": ${MAX_QUEUE} runs already waiting, so this one was dropped`); return null; }
      q.push(trigger); this.queue.set(id, q);
      return { queued: q.length };
    }
    return this.go(this.store.get(id), trigger, { dry });
  }
  async go(r, trigger, { dry = false, run = null } = {}) {
    const ac = new AbortController();
    const entry = { ac, run: null };
    this.running.set(r.id, entry);
    let result;
    try {
      const runDeps = { ...(this.deps.runDeps?.(r) || {}), saveRun: (x) => { entry.run = x; this.store.saveRun(x); } };
      result = await runRoutine(r, trigger, runDeps, { dry, signal: ac.signal, run });
    } finally {
      this.running.delete(r.id);
    }
    if (!dry) this.after(r, result);
    const q = this.queue.get(r.id);
    if (q?.length) { const t = q.shift(); if (!q.length) this.queue.delete(r.id); setTimeout(() => this.start(r.id, t).catch((e) => this.log(`"${r.name}": ${e.message}`)), 0).unref?.(); }
    return result;
  }
  after(r, run) {
    const st = this.store.state()[r.id] || {};
    const failed = run.status === 'failed';
    const fails = failed ? (st.fails || 0) + 1 : 0;
    const patch = { fails, lastRun: { at: run.startedAt, status: run.status, error: run.error || '' } };
    this.log(`"${r.name}" ${run.status === 'done' ? 'ran' : run.status === 'stopped' ? 'was stopped' : `failed: ${run.error}`}`);
    if (failed && fails >= PAUSE_AFTER_FAILS && st.on) {
      patch.on = false; patch.paused = `Paused after ${fails} failed runs in a row. Last: ${run.error}`;
      this.deps.tap?.(`Routine "${r.name}" is paused: it failed ${fails} times in a row. Last time: ${run.error}`);
    } else if (failed) this.deps.tap?.(`Routine "${r.name}" didn't finish: ${run.error}`);
    this.store.setState(r.id, patch);
  }
  stop(id) { const e = this.running.get(id); if (!e) return false; e.ac.abort(); return true; }
  live(id) { return this.running.get(id)?.run || null; }

  // At start: runs that were cut off carry on from their last finished step.
  async carryOn() {
    for (const run of this.store.unfinished()) {
      const r = this.store.get(run.routine);
      if (!r || graphHash(r) !== run.hash || !this.deps.isOn?.()) { run.status = 'stopped'; run.error = r ? 'The routine changed, or Routines were off, while this run was cut off, so it wasn\'t carried on.' : 'The routine is gone.'; run.endedAt = this.now(); this.store.saveRun(run); continue; }
      this.log(`"${r.name}": carrying on a run that was cut off`);
      await this.go(r, run.trigger, { run }).catch((e) => this.log(`"${r.name}": ${e.message}`));
    }
  }

  // One look at every trigger (once a minute). Returns how many runs it started.
  async tick() {
    if (!this.deps.isOn?.() || this.deps.hold?.()) return 0;
    let n = 0;
    const now = this.now();
    const mailDue = now - this.mailChecked >= MAIL_EVERY_MS;
    for (const v of this.list()) {
      if (!v.on || v.problems.length) continue;
      const trig = v.nodes.find((x) => isTrigger(x.kind));
      try {
        for (const data of await this.fired(v, trig, now, mailDue)) { await this.startSoon(v.id, data); n++; }
      } catch (e) { this.log(`"${v.name}": couldn't check what starts it (${e.message})`); }
    }
    if (mailDue) this.mailChecked = now;
    return n;
  }
  async startSoon(id, data) { Promise.resolve().then(() => this.start(id, data)).catch((e) => this.log(`routine ${id}: ${e.message}`)); }

  // What fired since the last look: a list of trigger data (one per run).
  async fired(v, trig, now, mailDue) {
    const st = this.store.state()[v.id] || {};
    const f = trig.f || {};
    const stamp = new Date(now).toLocaleString();
    if (trig.kind === 'trigger.time') {
      const when = cleanWhen({ type: f.type, at: f.at, date: f.date, everyMinutes: f.everyMinutes, days: dayList(f.days) });
      const due = st.nextDue || nextAfter(when, st.onAt || now, { anchorMs: st.onAt || now });
      if (!due) return [];
      if (!st.nextDue) { this.store.setState(v.id, { nextDue: due }); }
      if (now < due) return [];
      const after = nextAfter(when, now, { anchorMs: now });
      this.store.setState(v.id, { nextDue: after || 0, ...(after ? {} : { on: false }) });
      return [{ at: stamp, says: describe(when) }];
    }
    if (trig.kind === 'trigger.file') {
      const list = (this.deps.listFolder || listFolder)(f.folder, f.pattern);
      const seen = st.seen || null;
      const nowSeen = Object.fromEntries(list.map((x) => [x.name, x.mtime]));
      this.store.setState(v.id, { seen: nowSeen });
      if (!seen) return []; // the first look only notes what's already there
      return list.filter((x) => !(x.name in seen)).slice(0, MAX_QUEUE).map((x) => ({ path: x.path, name: x.name }));
    }
    if (trig.kind === 'trigger.mail') {
      if (!mailDue || !this.deps.listMail) return [];
      const got = await this.deps.listMail({ days: 2, from: f.from || '', limit: 20 });
      const mail = (got?.mail || []).filter((m) => !f.subject || String(m.subject || '').toLowerCase().includes(String(f.subject).toLowerCase()));
      const top = Math.max(0, ...(got?.mail || []).map((m) => Number(m.uid) || 0));
      const last = st.lastUid;
      this.store.setState(v.id, { lastUid: Math.max(top, last || 0) });
      if (last == null) return [];
      const fresh = mail.filter((m) => Number(m.uid) > last).sort((a, b) => a.uid - b.uid).slice(0, MAX_QUEUE);
      const out = [];
      for (const m of fresh) {
        const full = await this.deps.readMail?.(m.uid).catch(() => null);
        out.push({ id: String(m.uid), from: full?.from || m.from || '', subject: full?.subject || m.subject || '', text: String(full?.text || '').slice(0, 20000) });
      }
      return out;
    }
    if (trig.kind === 'trigger.page') {
      if (!this.deps.checkPage) return [];
      const hours = Math.max(1, Math.min(24, Number(f.hours) || 6));
      const w = st.page || { url: f.url, find: f.find || '' };
      if (w.checked && now - w.checked < hours * 3600e3) return [];
      const r = await this.deps.checkPage({ ...w, url: f.url, find: f.find || '' }, { now });
      this.store.setState(v.id, { page: r.watch });
      return r.changed ? [{ url: f.url, before: r.before || '', now: r.now || '' }] : [];
    }
    return [];
  }
}

const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
export const dayList = (s) => String(s || '').toLowerCase().split(/[\s,;]+/).map((d) => (/^\d$/.test(d) ? Number(d) : DAYS.indexOf(d.slice(0, 3)))).filter((d) => d >= 0 && d <= 6);

// The files in a folder that match a simple pattern (*.pdf, report-*.csv; empty = every file), not folders.
export function listFolder(dir, pattern = '') {
  const re = globRe(pattern);
  let names = [];
  try { names = fs.readdirSync(dir, { withFileTypes: true }).filter((d) => d.isFile()).map((d) => d.name); } catch { return []; }
  return names.filter((n) => re.test(n) && !/^~\$|\.(crdownload|part|tmp|download)$/i.test(n)).slice(0, 2000).map((name) => {
    const p = path.join(dir, name);
    let mtime = 0; try { mtime = fs.statSync(p).mtimeMs; } catch {}
    return { name, path: p, mtime };
  });
}
export function globRe(pattern) {
  const p = String(pattern || '').trim();
  if (!p) return /.*/;
  return new RegExp(`^(?:${p.split(/[;,]\s*/).map((x) => x.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.')).join('|')})$`, 'i');
}

export { outsOf, refsIn };
