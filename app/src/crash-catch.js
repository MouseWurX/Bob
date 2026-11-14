// "Catch crashes" and "Safe start after two crashes" (Settings, This replicant matrix, 🩺 Health and history).
// Both are off unless the owner turns them on.
//
// How a crash is noticed: while Bob runs, a small marker file (inn\bob\running.json) says so. A normal quit removes
// it. If it is still there at the next start, the last run ended without closing (a crash, a power cut, the process
// killed). The engine (llama-server) stopping by itself after a brain loaded counts too.
//
// The report is short and has no chat words: when, Bob's version, the system, the engine's last lines and the last
// logbook lines with the chat, notes and memory lines left out. It stays on this replicant matrix; Bob offers it at the
// next start (Show, Delete), and nothing is sent anywhere.
//
// Safe start: after two unclean ends in a row, Bob offers to switch every opt-in switch off. What was on is saved first
// (inn\bob\before-safe-start.json), and "Put my switches back" restores exactly those.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const crashOn = (cfg) => cfg?.crashCatcher === true;
export const safeStartOn = (cfg) => cfg?.safeStart === true;
export const runningFile = (cfg) => path.join(cfg.dataDir, 'running.json');
export const reportsDir = (cfg) => path.join(cfg.dataDir, 'crash-reports');
export const beforeSafeFile = (cfg) => path.join(cfg.dataDir, 'before-safe-start.json');
export const MAX_REPORTS = 10;
export const STREAK_FOR_SAFE = 2;

// Logbook kinds that can carry someone's words: never in a report.
const PRIVATE_KINDS = /^(chat|notes?|memory|reminder|howtos?|topics?|remember|ask|guest|telegram|discord)$/i;

const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); const t = f + '.tmp'; fs.writeFileSync(t, JSON.stringify(v, null, 2)); fs.renameSync(t, f); };

// The last logbook lines, minus anything private, with the home folder shortened to ~.
export function safeLogLines(text, { n = 40, home = os.homedir() } = {}) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n').filter((l) => l.startsWith('- '));
  const keep = lines.filter((l) => { const kind = (l.split(' | ')[1] || '').trim(); return kind && !PRIVATE_KINDS.test(kind); });
  return keep.slice(-n).map((l) => (home ? l.split(home).join('~') : l));
}

export function makeReport({ kind, when = new Date(), version = '', started = '', engineTail = '', logText = '', model = '', code = null, system = {} } = {}) {
  const sys = { os: system.os || `${os.type()} ${os.release()}`, arch: system.arch || process.arch, node: system.node || process.versions.node, electron: system.electron ?? (process.versions.electron || ''), ramGB: system.ramGB ?? Math.round(os.totalmem() / 1e9) };
  const head = kind === 'engine'
    ? `The engine stopped by itself${model ? ` while running ${model}` : ''}${code != null ? ` (code ${code})` : ''}.`
    : `Bob didn't close properly last time${started ? ` (that run started ${started})` : ''}.`;
  const tail = String(engineTail || '').replace(/\r\n/g, '\n').split('\n').filter(Boolean).slice(-30);
  return [
    `Bob crash report, ${when.toISOString()}`,
    head,
    '',
    `Bob ${version || '?'} · ${sys.os} · ${sys.arch} · Node ${sys.node}${sys.electron ? ` · Electron ${sys.electron}` : ''} · ${sys.ramGB} GB RAM`,
    ...(tail.length ? ['', 'The engine\'s last lines:', ...tail] : []),
    '',
    'The logbook\'s last lines (chat, notes and memory lines left out):',
    ...(safeLogLines(logText).length ? safeLogLines(logText) : ['(none)']),
    '',
    'No chat words are in this report. It stays on this replicant matrix unless you share it yourself.'
  ].join('\n') + '\n';
}

export function listReports(cfg) {
  let names = [];
  try { names = fs.readdirSync(reportsDir(cfg)).filter((f) => /^crash-[\w-]+\.txt$/.test(f)).sort().reverse(); } catch {}
  const seen = readJson(path.join(reportsDir(cfg), 'seen.json'), []);
  return names.map((f) => {
    let first = '';
    try { first = fs.readFileSync(path.join(reportsDir(cfg), f), 'utf8').replace(/\r\n/g, '\n').split('\n')[1] || ''; } catch {}
    return { id: f.slice(0, -4), summary: first, seen: seen.includes(f.slice(0, -4)) };
  });
}

export function saveReport(cfg, text, now = new Date()) {
  fs.mkdirSync(reportsDir(cfg), { recursive: true });
  const id = `crash-${now.toISOString().replace(/[:.]/g, '-')}`;
  fs.writeFileSync(path.join(reportsDir(cfg), id + '.txt'), text);
  // Only the newest few are kept.
  for (const r of listReports(cfg).slice(MAX_REPORTS)) fs.rmSync(path.join(reportsDir(cfg), r.id + '.txt'), { force: true });
  return id;
}

const cleanId = (id) => (/^crash-[\w-]{1,60}$/.test(String(id || '')) ? String(id) : '');
export function readReport(cfg, id) {
  const ok = cleanId(id);
  if (!ok) return null;
  try { return fs.readFileSync(path.join(reportsDir(cfg), ok + '.txt'), 'utf8'); } catch { return null; }
}
export function deleteReport(cfg, id) {
  const ok = cleanId(id);
  if (ok) fs.rmSync(path.join(reportsDir(cfg), ok + '.txt'), { force: true });
  return Boolean(ok);
}
export function markSeen(cfg, ids) {
  const f = path.join(reportsDir(cfg), 'seen.json');
  const all = listReports(cfg).map((r) => r.id);
  const seen = new Set(readJson(f, []).filter((x) => all.includes(x)));
  for (const id of [].concat(ids || [])) if (all.includes(id)) seen.add(id);
  try { writeJson(f, [...seen]); } catch {}
}

// ---------------------------------------------------------------- the marker
// Called once when Bob starts. Returns what the last run left behind: { crashed, started, streak }.
// The streak (unclean ends in a row) is kept even with the switches off, so turning one on later is honest.
export function startRun(cfg, { version = '', now = new Date(), pid = process.pid } = {}) {
  const f = runningFile(cfg);
  const was = readJson(f, null);
  const crashed = Boolean(was && was.running);
  const streak = crashed ? (Number(was.streak) || 0) + 1 : 0;
  try { writeJson(f, { running: true, started: now.toISOString(), version, pid, streak }); } catch {}
  return { crashed, started: was?.started || '', streak, version: was?.version || '' };
}

// A normal quit: the marker says so (and the streak starts again).
export function endRun(cfg) {
  try { writeJson(runningFile(cfg), { running: false, ended: new Date().toISOString(), streak: 0 }); } catch {}
}

// ---------------------------------------------------------------- safe start
// Every opt-in switch: off unless the owner turned it on. Safe start turns these off. Things that only show (themes,
// the cat's name) and things that were on from the start (the tray, Try again and Edit) stay as they are.
export const OPT_IN = [
  'smartNotes', 'toolLearning', 'quickNotes', 'docTools', 'docView', 'sandboxCode', 'parts3d', 'model3d', 'planFirst', 'oneBrain', 'allTools',
  'quickOnCpu', 'mootBeside', 'resumeJobs', 'readyWhileTyping', 'gamesFirst', 'pictureFit', 'webSearch', 'howtos', 'memoryRecall', 'brainCtxOn',
  'brainCtxStretch', 'naughtyList', 'catalogUpdates', 'labForgeStart', 'netReview', 'editOwn', 'quickSeesJob', 'docMeaning', 'chatPresets',
  'chatFiles', 'mathView', 'shortcuts', 'promptMenu', 'weeklyReport', 'chatPlaces', 'tryFromHere', 'pinMessages', 'guestChat', 'amnesiaOffer'
];
// Switches kept inside a group: { key: [the part that switches it, its off value] }.
export const OPT_IN_GROUPS = { hands: ['enabled', false], checkins: ['enabled', false], quietHours: ['on', false], globalAsk: ['on', false], fadeChat: ['on', false] };

// What safe start would change: only the switches that are on now.
export function safeStartPlan(cfg) {
  const patch = {}, before = {};
  for (const k of OPT_IN) if (cfg[k] === true) { patch[k] = false; before[k] = true; }
  for (const [k, [part, off]] of Object.entries(OPT_IN_GROUPS)) {
    const v = cfg[k];
    if (v && typeof v === 'object' && v[part] && v[part] !== off) { patch[k] = { ...v, [part]: off }; before[k] = JSON.parse(JSON.stringify(v)); }
  }
  return { patch, before, count: Object.keys(patch).length };
}

export function applySafeStart(cfg, save, { now = new Date() } = {}) {
  const plan = safeStartPlan(cfg);
  if (!plan.count) return { count: 0 };
  writeJson(beforeSafeFile(cfg), { at: now.toISOString(), before: plan.before });
  save(cfg, plan.patch);
  return { count: plan.count, keys: Object.keys(plan.patch) };
}

export const safeStartSaved = (cfg) => readJson(beforeSafeFile(cfg), null);

export function undoSafeStart(cfg, replace) {
  const saved = safeStartSaved(cfg);
  if (!saved?.before || !Object.keys(saved.before).length) return { count: 0 };
  replace(cfg, saved.before);
  fs.rmSync(beforeSafeFile(cfg), { force: true });
  return { count: Object.keys(saved.before).length, keys: Object.keys(saved.before) };
}

// ---------------------------------------------------------------- what the chat offers at start
// state: what startRun returned. Reports are listed when "Catch crashes" is on; the safe start card only when its own
// switch is on, the streak reached two and something is on to switch off.
export function crashOffer(cfg, state = {}) {
  const reports = crashOn(cfg) ? listReports(cfg).filter((r) => !r.seen) : [];
  const safe = safeStartOn(cfg) && (state.streak || 0) >= STREAK_FOR_SAFE && !state.safeDone ? safeStartPlan(cfg).count : 0;
  return { reports, streak: state.streak || 0, safeStart: safe > 0 ? { count: safe } : null, canPutBack: Boolean(safeStartSaved(cfg)) };
}

// Called once when Bob's server starts: the marker, and a report for an unclean end (only with Catch crashes on).
export function watchRuns(cfg, { version = '', logText = () => '', onExit = (fn) => process.on('exit', fn) } = {}) {
  const state = startRun(cfg, { version });
  if (state.crashed && crashOn(cfg)) {
    try { saveReport(cfg, makeReport({ kind: 'bob', version: state.version || version, started: state.started, logText: logText() })); } catch {}
  }
  onExit(() => endRun(cfg));
  return state;
}

// The engine stopped by itself. Only with Catch crashes on; at most one report a minute.
let lastEngineReport = 0;
export function engineCrashed(cfg, { model = '', code = null, tail = '', version = '', logText = '' } = {}, now = Date.now()) {
  if (!crashOn(cfg) || now - lastEngineReport < 60_000) return null;
  lastEngineReport = now;
  try { return saveReport(cfg, makeReport({ kind: 'engine', model, code, engineTail: tail, version, logText })); } catch { return null; }
}
