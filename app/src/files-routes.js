// Files in Bob's API: previews of files Bob mentions, song players, thumbnails, Made by Bob, Open and Copy,
// pictures Bob saved, and moving Bob's home folder. Split out of server.js; same rules as before.
// Returns false when the request is not one of these, so server.js keeps looking; anything else means it was answered.
import path from 'node:path';
import { findOutput } from './config.js';
import { describe as describeFile, openFile, peek as peekFile } from './files.js';
import { cloudWarning, homeProblem, homeView, synced } from './home.js';
import { canThumb, thumbFor } from './thumbs.js';
import { wavePeaks } from './wave.js';

export async function filesRoute({ req, res, p, url, isLocal, cfg, brain, body, send, serveFile }) {
  // Files Bob mentions: a preview in the chat, plus Open / Show in folder / Copy (open and copy only on the PC itself).
  if (req.method === 'POST' && p === '/api/file/info') {
    const b = await body(req);
    return send(res, 200, [].concat(b.paths || []).slice(0, 20).map((x) => { const d = describeFile(cfg, x); return { mention: String(x).slice(0, 1000), ...d, path: isLocal ? d.path : undefined }; }));
  }
  if (req.method === 'GET' && p === '/api/file') {
    const d = describeFile(cfg, url.searchParams.get('path') || '');
    if (!d.ok || d.kind === 'folder' || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep))) return send(res, 404, { error: 'not found' });
    // A page or picture Bob wrote is shown, never run: no scripts, no reaching Bob's own pages.
    return serveFile(res, path.dirname(d.path), path.basename(d.path), { 'content-security-policy': 'sandbox; default-src \'none\'; img-src \'self\' data:; media-src \'self\'; style-src \'unsafe-inline\'' });
  }
  // The side panel: the start of a text file, and the list of everything Bob made.
  if (req.method === 'GET' && p === '/api/file/peek') {
    const d = describeFile(cfg, url.searchParams.get('path') || '');
    if (!d.ok || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep))) return send(res, 404, { error: 'not found' });
    const r = peekFile(cfg, d.path, url.searchParams.get('max'));
    return r.ok ? send(res, 200, r) : send(res, 404, { error: 'not found' });
  }
  // 1.5.41: a song's player: its title, style and lyrics (from the Made by Bob list) and the bars of its shape (wave.js).
  if (req.method === 'GET' && p === '/api/song') {
    const d = describeFile(cfg, url.searchParams.get('path') || '');
    if (!d.ok || d.kind !== 'audio' || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep) && !brain.made.has(d.path))) return send(res, 404, { error: 'not found' });
    const w = wavePeaks(d.path, url.searchParams.get('bars'));
    return send(res, 200, { ok: true, name: d.name, bytes: d.bytes, ...(brain.made.songInfo(d.path) || {}), seconds: w.seconds, peaks: w.peaks });
  }
  // 1.5.125: a small picture for the chest and Made by Bob, made once and kept (src/thumbs.js). 404 means "show the
  // file itself or the kind's icon". Same rules as /api/file: over the home network only what's in the inn or on the Made list.
  if (req.method === 'GET' && p === '/api/thumb') {
    const d = describeFile(cfg, url.searchParams.get('path') || '');
    if (!d.ok || d.kind === 'folder' || !canThumb(d.name) || (!isLocal && !d.path.startsWith(path.resolve(cfg.innDir) + path.sep) && !brain.made.has(d.path))) return send(res, 404, { error: 'not found' });
    const t = await thumbFor(cfg, d.path);
    if (!t.ok) return send(res, 404, { error: t.why });
    return serveFile(res, path.dirname(t.file), path.basename(t.file), { 'cache-control': 'private, max-age=86400' });
  }
  // 1.5.125 Bob's home folder: his home folder (models, programs, notes, settings) and a move to another one.
  if (req.method === 'GET' && p === '/api/home') {
    if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
    return send(res, 200, homeView(cfg));
  }
  if (req.method === 'POST' && p === '/api/home') {
    if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
    const b = await body(req);
    const folder = String(b.folder || '').trim();
    const why = homeProblem(folder, { current: cfg.agentDir });
    if (why) return send(res, 200, { ok: false, error: why });
    if (path.resolve(folder).toLowerCase() === path.resolve(cfg.agentDir).toLowerCase()) return send(res, 200, { ok: true, same: true });
    // The chosen folder goes AFTER homeView's spread (whose `folder` is the current home), so the confirm card and the move
    // itself name the folder that was picked (PC test 2026-11-06: the card read "Move everything to <current home>?").
    if (!b.confirm) return send(res, 200, { ok: true, ready: true, ...homeView(cfg), folder: path.resolve(folder), pickedCloud: synced(folder), pickedCloudWarning: cloudWarning(synced(folder)) });
    if (!globalThis.bobHome?.move) return send(res, 200, { ok: false, error: 'Moving only works from Bob\'s own window (Bob.exe, Bob.app, or Bob on Linux), not from a browser.' });
    brain.log('settings', `moving Bob's home to ${folder}`);
    brain.broadcast({ type: 'announce', text: `Moving my things to ${folder}. I'll close, copy everything across and open again. Big models take a while.` });
    send(res, 200, { ok: true, moving: true });
    setTimeout(() => globalThis.bobHome.move(path.resolve(folder)), 800);
    return;
  }
  if (req.method === 'GET' && p === '/api/made') {
    const list = brain.made.list({ kind: url.searchParams.get('kind') || '', q: url.searchParams.get('q') || '', limit: Math.min(200, Number(url.searchParams.get('limit')) || 60) });
    const inn = path.resolve(cfg.innDir) + path.sep;
    // 1.5.133: over the door, the same rule as /images/ below: anything Bob made that the door would hand out (his own
    // inn\ folder, or a Made by Bob file in any save folder), so a Bob whose save folder was moved no longer shows the
    // phone an empty Chest. Paths never leave this Bob.
    const servable = (x) => { try { return path.resolve(findOutput(cfg, path.basename(x.path))) === path.resolve(x.path); } catch { return false; } };
    return send(res, 200, isLocal ? list : list.filter((x) => x.path && (x.path.startsWith(inn) || servable(x))).map((x) => ({ ...x, path: undefined })));
  }
  if (req.method === 'POST' && (p === '/api/open' || p === '/api/clipboard')) {
    if (!isLocal) return send(res, 403, { error: 'Only on this replicant matrix itself.' });
    const b = await body(req);
    if (p === '/api/clipboard') {
      if (!globalThis.bobShell?.copy) return send(res, 200, { ok: false });
      globalThis.bobShell.copy(String(b.text ?? '').slice(0, 2e6));
      return send(res, 200, { ok: true });
    }
    try { const r = openFile(cfg, String(b.path || ''), { reveal: b.reveal === true }); brain.log('open', `${b.reveal ? 'showed in folder' : 'opened'} ${path.basename(r.file)}`); return send(res, 200, { ok: true }); }
    catch (e) { return send(res, 409, { error: e.message }); }
  }
  if (req.method === 'GET' && p.startsWith('/images/')) {
    const f = findOutput(cfg, decodeURIComponent(p.slice(8))); // 1.5.41: where Bob saves now, his own folder, or an older pick
    // Over the home network, a folder the user picked only gives out what Bob made there (it can hold their own files too).
    if (!isLocal && path.resolve(path.dirname(f)) !== path.resolve(cfg.defaultPainterDir) && !brain.made.has(f)) return send(res, 404, { error: 'not found' });
    return serveFile(res, path.dirname(f), path.basename(f));
  }
  return false;
}
