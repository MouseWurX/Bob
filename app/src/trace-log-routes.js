// Settings, This replicant matrix, "Monitoring log" in Bob's API (src/trace-log.js). Off unless turned on.
// GET /api/trace-log: the switch, the size limit, how much is on disk and the last turns for the timeline.
// GET /api/trace-log/text: the end of the live file as plain text (the "Show the log" button opens it in a tab).
// POST: { on }, { details } (Include details), { maxMB } (one of SIZES_MB), { clear: true }, { keepTurn: tag },
// { keepFile: true } or { clearKept: true } (deletes the log files; the switch stays).
// From this computer only. Returns false when the request is not this one, so server.js keeps looking.
import { saveSettings } from './config.js';
import { cleanTraceLog, SIZES_MB, logFiles, recentView, logTail, deleteLog, trimOld, sizeLabel, keepTurn, keepLiveFile, deleteKept } from './trace-log.js';

export function traceLogView(cfg, deps = {}) {
  const t = cleanTraceLog(cfg?.traceLog);
  return { ...t, gaming: cfg?.session === 'light', sizes: SIZES_MB.map((mb) => ({ mb, label: sizeLabel(mb) })), ...logFiles(cfg, deps), recent: recentView() };
}

export async function traceLogRoute({ req, res, p, isLocal, cfg, body, send, log = () => {} }) {
  if (p !== '/api/trace-log' && p !== '/api/trace-log/text') return false;
  if (!isLocal) return send(res, 403, { error: 'The monitoring log is on this replicant matrix itself.' });
  if (p === '/api/trace-log/text') {
    if (req.method !== 'GET') return send(res, 404, { error: 'not found' });
    return send(res, 200, logTail(cfg) || 'The monitoring log is empty. Turn it on in Settings, then ask me something.', 'text/plain; charset=utf-8');
  }
  if (req.method === 'GET') return send(res, 200, traceLogView(cfg));
  if (req.method !== 'POST') return send(res, 404, { error: 'not found' });
  const b = await body(req).catch(() => ({}));
  const next = { ...cleanTraceLog(cfg.traceLog) };
  if (typeof b?.on === 'boolean') next.on = b.on;
  if (typeof b?.details === 'boolean') next.details = b.details;
  if (b?.maxMB !== undefined) {
    if (!SIZES_MB.includes(Number(b.maxMB))) return send(res, 400, { error: 'Pick one of the sizes in the list.' });
    next.maxMB = Number(b.maxMB);
  }
  saveSettings(cfg, { traceLog: cleanTraceLog(next) });
  if (typeof b?.on === 'boolean') log('settings', `Monitoring log ${b.on ? 'on' : 'off'}`);
  if (typeof b?.details === 'boolean') log('settings', `Monitoring log details ${b.details ? 'on' : 'off'}`);
  if (b?.maxMB !== undefined) { log('settings', `Monitoring log limit: ${sizeLabel(next.maxMB)}`); trimOld(cfg); }
  if (typeof b?.keepTurn === 'string') {
    if (!keepTurn(cfg, b.keepTurn)) return send(res, 404, { error: 'That turn is no longer in the list, so I can\'t keep it. Keep the current file instead.' });
    log('settings', 'Monitoring log: kept one turn');
  }
  if (b?.keepFile === true) {
    if (!keepLiveFile(cfg)) return send(res, 404, { error: 'There is no current file to keep yet.' });
    log('settings', 'Monitoring log: kept the current file');
  }
  if (b?.clearKept === true) log('settings', `Monitoring log kept files deleted (${deleteKept(cfg)})`);
  let cleared = null;
  if (b?.clear === true) { cleared = deleteLog(cfg); log('settings', `Monitoring log files deleted (${cleared})`); }
  return send(res, 200, { ...traceLogView(cfg), ...(cleared !== null ? { cleared } : {}) });
}
