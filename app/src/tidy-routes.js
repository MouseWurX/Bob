// Housekeeping, topics, past chats and search in Bob's API. Reading works from the phone too; changes only on this computer.
// Split out of server.js; same rules as before.
import { search } from './search.js';
import { hkSettings, KINDS, UNITS } from './housekeeping.js';

// Returns true when it answered the request, so server.js stops looking. The send and serveFile it is handed
// return true too, so `return send(...)` here means answered.
export async function tidyRoute({ req, res, p, url, isLocal, cfg, brain, body, send, broadcast }) {
  // Housekeeping, topics, past chats and search. Reading works from the phone too; changes only on the PC.
  const hk = brain.housekeeper;
  if (req.method === 'GET' && p === '/api/chats') return send(res, 200, { chats: hk.chats(), tidied: hk.summaries().slice(0, 200) });
  if (req.method === 'GET' && p === '/api/topics') return send(res, 200, hk.topics.list());
  if (req.method === 'GET' && p === '/api/topics/messages') {
    const t = hk.topics.get(String(url.searchParams.get('id') || ''));
    if (!t) return send(res, 404, { error: 'No such topic.' });
    return send(res, 200, hk.topicMessages(t));
  }
  if (req.method === 'GET' && p === '/api/topics/forget-preview') {
    try { return send(res, 200, hk.forgetPreview(String(url.searchParams.get('id') || ''), { mode: url.searchParams.get('mode') === 'all' ? 'all' : 'note' })); }
    catch (e) { return send(res, 404, { error: e.message }); }
  }
  if (req.method === 'GET' && p === '/api/search') return send(res, 200, search(cfg, { topics: hk.topics, summaries: hk.summaries() }, String(url.searchParams.get('q') || '').slice(0, 200)));
  if (req.method === 'GET' && p === '/api/hk') { const st = hk.state(); return send(res, 200, { settings: hkSettings(cfg), kinds: KINDS, units: Object.keys(UNITS), items: hk.publicItems(), lastRun: st.lastRun, lastScan: st.lastScan, working: hk.working }); }
  if (req.method === 'POST' && (p.startsWith('/api/hk/') || p.startsWith('/api/topics/') || p === '/api/pin')) {
    if (!isLocal) return send(res, 403, { error: 'Tidying and topics can only be changed on this replicant matrix itself.' });
    const b = await body(req);
    try {
      if (p === '/api/hk/scan') return send(res, 200, { items: hk.publicItems(hk.scan()) });
      if (p === '/api/hk/tidy') { if (!hk.items.length) hk.scan(); return send(res, 200, { results: await hk.tidy([].concat(b.choices || []).slice(0, 2000)), items: hk.publicItems() }); }
      if (p === '/api/hk/run') {
        if (hk.working) return send(res, 200, { busy: true });
        hk.tick({ force: true }).then((did) => broadcast({ type: 'tidy-done', ...did })).catch((e) => broadcast({ type: 'tidy-done', error: e.message }));
        return send(res, 200, { started: true });
      }
      if (p === '/api/pin') return send(res, 200, { pins: hk.pin(String(b.kind), String(b.id), b.pinned === true) });
      const id = String(b.id || '');
      if (p === '/api/topics/rename') return send(res, 200, hk.topics.rename(id, b.name, b.project));
      if (p === '/api/topics/edit') return send(res, 200, hk.topics.edit(id, { note: b.note, summary: b.summary, open: b.open }));
      if (p === '/api/topics/pin') return send(res, 200, hk.topics.pin(id, b.pinned === true));
      if (p === '/api/topics/fade') return send(res, 200, hk.topics.fade(id, b.after && UNITS[b.after.unit] ? { n: Number(b.after.n), unit: b.after.unit } : null));
      if (p === '/api/topics/merge') { const into = hk.topics.merge(id, String(b.into || '')); brain.log('topics', `merged a topic into ${into}`); return send(res, 200, { id: into }); }
      if (p === '/api/topics/move') return send(res, 200, { ok: hk.topics.moveMessage(String(b.session || ''), String(b.msgId || ''), String(b.to || '')) });
      if (p === '/api/topics/forget') return send(res, 200, hk.forget(id, { mode: b.mode === 'all' ? 'all' : 'note', pictures: b.pictures === true }));
      if (p === '/api/topics/accept') return send(res, 200, hk.topics.change(id, (t) => { if (t.suggested) { t.note = t.suggested.note || t.note; t.summary = t.suggested.summary || t.summary; t.suggested = undefined; } }));
      return send(res, 404, { error: 'not found' });
    } catch (e) { return send(res, 409, { error: e.message }); }
  }
  return false;
}
