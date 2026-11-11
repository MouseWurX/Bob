// How-tos and Bob's own kit in Bob's API: the how-to list, answers and edits, and the tools and how-tos Bob made
// (Delete to the shelf, Put back, Delete for good). Split out of server.js; same rules as before.
import { ownKitView, ownKitDelete, ownKitRestore, ownKitPurge } from './own-kit.js';

// Returns true when it answered the request, so server.js stops looking. The send and serveFile it is handed
// return true too, so `return send(...)` here means answered.
export async function howtosRoute({ req, res, p, isLocal, cfg, brain, body, send }) {
  // 1.5.79 How-tos: the list (Settings), the chat card's answer (the phone too), and the person's own edits (PC only). Stored on this PC only.
  if (req.method === 'GET' && p === '/api/howtos') return send(res, 200, { on: cfg.howtos === true, howtos: brain.howtos.list() });
  if (req.method === 'POST' && p === '/api/howtos/answer') {
    const b = await body(req);
    return send(res, 200, await brain.answerHowto(String(b.id || ''), b.save === true, typeof b.name === 'string' ? b.name : ''));
  }
  if (req.method === 'POST' && p === '/api/howtos/edit') {
    if (!isLocal) return send(res, 403, { error: 'How-tos can only be changed on this replicant matrix itself.' });
    const b = await body(req);
    try { return send(res, 200, { ok: true, howto: brain.howtos.edit(String(b.id || ''), { name: b.name, when: b.when, steps: b.steps }) }); }
    catch (e) { return send(res, 400, { error: e.message }); }
  }
  if (req.method === 'POST' && p === '/api/howtos/delete') {
    if (!isLocal) return send(res, 403, { error: 'How-tos can only be changed on this replicant matrix itself.' });
    const b = await body(req);
    return send(res, 200, { ok: brain.howtos.remove(String(b.id || '')) });
  }
  // 1.5.144 🧰 Tools and how-tos Bob made (src/own-kit.js): the list, Delete (to the shelf, 30 days), Put back,
  // Delete for good. Delete and Put back work from a paired phone too; Delete for good only on this PC.
  if (req.method === 'GET' && p === '/api/own-kit') return send(res, 200, ownKitView(cfg, brain));
  if (req.method === 'POST' && (p === '/api/own-kit/delete' || p === '/api/own-kit/restore' || p === '/api/own-kit/purge')) {
    if (p === '/api/own-kit/purge' && !isLocal) return send(res, 403, { error: 'Delete for good only works on this replicant matrix itself. From the phone you can delete (30 days to put it back) and put back.' });
    const b = await body(req);
    try {
      const did = p.endsWith('/delete') ? ownKitDelete(cfg, brain, b) : p.endsWith('/restore') ? ownKitRestore(cfg, brain, b) : ownKitPurge(cfg, brain, b);
      return send(res, 200, { ...did, view: ownKitView(cfg, brain) });
    } catch (e) { return send(res, 400, { error: e.message }); }
  }
  return false;
}
