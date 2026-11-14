// 🔑 Forgot the passcode? in Bob's API (src/lock-reset.js does the work; public/lock-settings.js draws the panel).
//
// This replicant matrix only (Settings, someone already in):
//   GET  /api/lock/reset                 what's set up (never a key or a code)
//   POST /api/lock/reset { offer | cancel | drop | email, discord }
//   GET  /api/spares                     the spare keys this Bob keeps for your other Bobs (+ which are asking)
//   POST /api/spares { pickup: address | letReset: id | forget: id }
// Your other Bobs, over Bob-Net (through the door, with its passcode; never this replicant matrix's own window):
//   POST /api/lock/spare/pickup { name }   the waiting spare, once
//   GET  /api/lock/spare/asking            is this Bob waiting for a yes?
//   POST /api/lock/spare/give { key, name } "Let it reset" from the Bob that keeps the spare
// The lock screen's own forms (GET /unlock/forgot, POST /unlock/...) are in forgotRoute below.
import { forgotPage } from './lock-reset.js';

export async function lockResetRoute({ req, res, p, isLocal, body, send, reset, keeper, bobs }) {
  if (p === '/api/lock/spare/pickup' || p === '/api/lock/spare/give' || p === '/api/lock/spare/asking') {
    if (isLocal) return send(res, 403, { error: 'Spare keys go between your Bobs, over Bob-Net.' }), true;
    if (p.endsWith('/asking')) return send(res, 200, { asking: req.method === 'GET' && reset.asking() }), true;
    if (req.method !== 'POST') return send(res, 405, { error: 'POST' }), true;
    const b = await body(req);
    const r = p.endsWith('/pickup') ? reset.pickup(b.name) : reset.give(b.key, b.name);
    return send(res, r.error ? r.code || 400 : 200, r.error ? { error: r.error } : r), true;
  }
  if (p === '/api/lock/reset' && (req.method === 'GET' || req.method === 'POST')) {
    if (!isLocal) return send(res, 403, { error: 'This can only be changed on this replicant matrix itself.' }), true;
    if (req.method === 'GET') return send(res, 200, reset.view()), true;
    const b = await body(req);
    const r = b.offer ? reset.offerSpare() : b.cancel ? reset.cancelOffer() : b.drop ? reset.dropSpares() : reset.setWays(b);
    return send(res, r.error ? 400 : 200, r.error ? { error: r.error } : r.view), true;
  }
  if (p === '/api/spares' && (req.method === 'GET' || req.method === 'POST')) {
    if (!isLocal) return send(res, 403, { error: 'Only in this Bob\'s own Settings.' }), true;
    const list = bobs();
    if (req.method === 'GET') {
      const kept = keeper.view();
      const asking = await Promise.all(kept.map((k) => keeper.asking(k.id, list)));
      return send(res, 200, { kept: kept.map((k, i) => ({ ...k, asking: asking[i] })), bobs: list.map((x) => ({ name: x.name, address: x.address })) }), true;
    }
    const b = await body(req);
    let r;
    try {
      r = b.pickup ? await keeper.pickup(list.find((x) => x.address === String(b.pickup)))
        : b.letReset ? await keeper.letReset(String(b.letReset), list)
          : b.forget ? keeper.forget(String(b.forget)) : { error: 'Nothing to do.' };
    } catch (e) { r = { error: `Couldn't reach that Bob (${e.message}).` }; }
    return send(res, r.error ? 400 : 200, r), true;
  }
  return false;
}

// The lock screen's Forgot it? page and forms (only while the lock is on, on this replicant matrix).
// Returns true when it answered. `grant(token)` sends the window on into Bob.
export async function forgotRoute({ req, res, p, send, reset, host, grant }) {
  if (!p.startsWith('/unlock/')) return false;
  const html = (code, opts) => send(res, code, forgotPage(reset.screen(), opts), 'text/html; charset=utf-8', { 'cache-control': 'no-store' });
  if (req.method === 'GET' && p === '/unlock/forgot') return html(200), true;
  if (req.method !== 'POST') return false;
  const origin = String(req.headers.origin || '').toLowerCase();
  if (origin && origin !== `http://${host}`) return send(res, 403, { error: 'refused (other website)' }), true;
  let raw = '';
  for await (const c of req) { raw += c; if (raw.length > 2000) break; }
  const f = new URLSearchParams(raw);
  let r;
  if (p === '/unlock/spare-ask') r = reset.askSpare();
  else if (p === '/unlock/spare-new') r = reset.finishSpare(f.get('next'), f.get('again'));
  else if (p === '/unlock/send-code') r = await reset.sendCode(f.get('via'));
  else if (p === '/unlock/code') r = reset.useCode(f.get('code'), f.get('next'), f.get('again'));
  else return html(404, { wrong: 'Not here.' }), true;
  if (r.error) return html(400, { wrong: r.error }), true;
  if (r.token) return grant(r.token, r.aside), true;
  return html(200), true;
}
