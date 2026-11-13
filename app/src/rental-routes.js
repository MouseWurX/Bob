// 1.5.127 Rented brains: the routes behind Settings (Online services), the Rented brain slot in Settings, Brains, the chat
// page's 🏗 switch and the Hire it card. Settings change only from this replicant matrix; the card can be answered
// from the phone too (like the Set it up card). Nothing here ever returns a key.
import { saveSettings } from './config.js';
import { rentalsOf, cleanRental, cleanCaps, serviceOf, readPrice, findModel, keyEnvFor, money } from './rental.js';

export async function rentRoute({ req, res, p, isLocal, brain, cfg, body, send }) {
  const rentals = brain.rentals;
  if (!rentals) return false;
  const view = () => send(res, 200, rentals.view());
  const save = (st) => { saveSettings(cfg, { rentals: st }); brain.broadcast?.({ type: 'settings-changed' }); };
  if (req.method === 'GET' && p === '/api/rent') return view(), true;
  if (req.method !== 'POST') return false;
  // The Hire it card: from the PC window or the phone.
  if (p === '/api/rent/answer') {
    const b = await body(req);
    try { return send(res, 200, brain.answerRent(String(b.id || ''), b.yes === true)), true; } catch (e) { return send(res, 200, { ok: false, why: e.message }), true; }
  }
  if (!isLocal) return send(res, 403, { error: 'Rented brains can only be changed on this replicant matrix itself.' }), true;
  const b = await body(req);
  const st = rentalsOf(cfg);
  if (p === '/api/rent/settings') {
    // Switches per service, the limits, which rental is in the slot, and "I understand" for the warning card.
    if (b.enabled && typeof b.enabled === 'object') for (const [id, on] of Object.entries(b.enabled)) if (serviceOf(id) && typeof on === 'boolean') st.enabled[id] = on;
    if (b.warned && typeof b.warned === 'object') for (const [id, on] of Object.entries(b.warned)) if (serviceOf(id) && on === true) st.warned[id] = true;
    if (b.caps && typeof b.caps === 'object') st.caps = cleanCaps({ ...st.caps, ...b.caps });
    if (typeof b.current === 'string') st.current = st.list.some((r) => r.id === b.current) ? b.current : '';
    save(st);
    brain.log('settings', `rented brains: ${Object.keys(b).join(', ')}`);
    if ('current' in b) brain.broadcast?.({ type: 'rent', action: 'slot', rental: st.list.find((r) => r.id === st.current)?.name || '' });
    return view(), true;
  }
  if (p === '/api/rent/add') {
    const r = cleanRental({ ...b, id: undefined }); // b.cards (1, 2, 4, 8) is cleaned there; Settings only sends more than 1 after its warning card
    if (!r) return send(res, 400, { error: 'That rental isn\'t complete: pick a service, type the model\'s name as the service lists it' + (b.service === 'other' ? ', and give its web address (https://…)' : '') + '.' }), true;
    const s = serviceOf(r.service);
    // Pay per answer: read the service's own price for this model, so the card quotes the real one.
    let priceNote = '';
    if (s.kind === 'answer') {
      const key = rentals.env()[keyEnvFor(r)];
      if (key) {
        try { const pr = await readPrice(r, key, rentals.fetch); if (pr) { if (pr.inPerM != null) r.inPerM = pr.inPerM; if (pr.outPerM != null) r.outPerM = pr.outPerM; } }
        catch (e) { priceNote = e.message; }
      } else priceNote = `No key for ${s.name} yet, so the price wasn't read. Add the key and press Check the price.`;
    }
    st.list.push(r);
    const slotted = !st.current && b.use !== false;
    if (slotted) st.current = r.id;
    save(st);
    if (slotted) brain.broadcast?.({ type: 'rent', action: 'slot', rental: r.name }); // 1.5.128: the chat page's 🏗 switch appears without a reload
    brain.log('settings', `rented brain added: ${r.name} (${s.name})`);
    return send(res, 200, { ...rentals.view(), added: r.id, priceNote }), true;
  }
  // 1.5.137: "Find it": look up a brain from Bob's list on a pay-per-answer service's model list (Add a rental).
  if (p === '/api/rent/find') {
    const s = serviceOf(String(b.service || ''));
    if (!s || s.kind !== 'answer') return send(res, 400, { error: 'Only a pay-per-answer service has a model list to look in.' }), true;
    if (st.enabled[s.id] !== true) return send(res, 400, { error: `Switch on Let Bob hire from ${s.name} first.` }), true;
    const key = rentals.env()[s.id === 'other' ? String(b.keyEnv || '') : s.keyEnv] || '';
    if (s.id !== 'other' && !key) return send(res, 400, { error: `No key for ${s.name} yet.` }), true;
    try {
      const model = await findModel(s.id, { hf: String(b.hf || '').slice(0, 200), name: String(b.name || '').slice(0, 100), address: s.id === 'other' ? String(b.address || '') : '' }, key, rentals.fetch);
      return send(res, 200, model ? { model } : { model: '', why: `${s.name} doesn't list it. Its model list is at ${s.modelsPage || 'its website'}.` }), true;
    } catch (e) { return send(res, 400, { error: e.message }), true; }
  }
  if (p === '/api/rent/price') {
    const r = st.list.find((x) => x.id === b.id);
    if (!r) return send(res, 404, { error: 'No such rental.' }), true;
    const key = rentals.env()[keyEnvFor(r)];
    if (!key) return send(res, 400, { error: `No key for ${serviceOf(r.service).name} yet.` }), true;
    try {
      const pr = await readPrice(r, key, rentals.fetch);
      if (pr) { if (pr.inPerM != null) r.inPerM = pr.inPerM; if (pr.outPerM != null) r.outPerM = pr.outPerM; }
      if (typeof b.perHour === 'number') r.perHour = b.perHour;
      save(st);
      return send(res, 200, { ...rentals.view(), context: pr?.context || null }), true;
    } catch (e) { return send(res, 400, { error: e.message }), true; }
  }
  if (p === '/api/rent/edit') {
    const i = st.list.findIndex((x) => x.id === b.id);
    if (i < 0) return send(res, 404, { error: 'No such rental.' }), true;
    const r = cleanRental({ ...st.list[i], ...b, id: st.list[i].id, service: st.list[i].service });
    if (!r) return send(res, 400, { error: 'That change isn\'t allowed.' }), true;
    st.list[i] = r;
    save(st);
    return view(), true;
  }
  if (p === '/api/rent/remove') {
    const r = st.list.find((x) => x.id === b.id);
    if (!r) return send(res, 404, { error: 'No such rental.' }), true;
    const run = rentals.running.get(r.id);
    if (run) await rentals.stopRun(r, run, 'the rental was removed').catch(() => {});
    st.list = st.list.filter((x) => x.id !== b.id);
    const wasSlot = st.current === b.id;
    if (wasSlot) st.current = '';
    save(st);
    if (wasSlot) brain.broadcast?.({ type: 'rent', action: 'slot', rental: '' });
    brain.log('settings', `rented brain removed: ${r.name}`);
    return view(), true;
  }
  if (p === '/api/rent/stop') {
    const out = await rentals.stopAll(b.why || 'you pressed Stop');
    return send(res, 200, { ...rentals.view(), stopped: out.filter(Boolean).length, failed: out.filter((x) => !x).length }), true;
  }
  if (p === '/api/rent/stop-leftover') {
    const m = rentals.leftover.find((x) => x.id === String(b.id));
    if (!m) return send(res, 404, { error: 'That machine isn\'t on the list any more.' }), true;
    const ok = await rentals.stopLeftover(m);
    return send(res, ok ? 200 : 502, { ...rentals.view(), stopped: ok }), true;
  }
  if (p === '/api/rent/check') { await rentals.findLeftovers(); return view(), true; }
  if (p === '/api/rent/forget') { rentals.forget(); return send(res, 200, { ok: true }), true; } // the 🏗 switch went off: the next rented message asks again
  return false;
}

export { money };
