// The job queue in Bob's API: what's waiting and running, cancel, retry, move, remove, clear done jobs, and Stop.
// Split out of server.js; same rules as before.

// Returns true when it answered the request, so server.js stops looking. The send and serveFile it is handed
// return true too, so `return send(...)` here means answered.
export async function queueRoute({ req, res, p, brain, body, send }) {
  if (req.method === 'GET' && p === '/api/queue') return send(res, 200, brain.queueView());
  if (req.method === 'POST' && (p === '/api/queue/cancel' || p === '/api/queue/retry')) {
    const { id } = await body(req);
    const ok = p.endsWith('cancel') ? brain.cancelJob(String(id)) : brain.retryJob(String(id));
    return send(res, ok ? 200 : 404, { ok });
  }
  if (req.method === 'POST' && p === '/api/queue/move') {
    const { id, before } = await body(req);
    const ok = brain.moveJob(String(id), before ? String(before) : null);
    return send(res, ok ? 200 : 404, { ok });
  }
  if (req.method === 'POST' && p === '/api/queue/remove') {
    const { id } = await body(req);
    const ok = brain.removeJob(String(id));
    return send(res, ok ? 200 : 404, { ok });
  }
  if (req.method === 'POST' && p === '/api/queue/clear') return send(res, 200, { ok: brain.clearCompleted() });
  if (req.method === 'POST' && p === '/api/stop') return send(res, 200, { stopped: brain.stop() });
  return false;
}
