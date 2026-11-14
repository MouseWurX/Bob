// OK cards on all your Bobs (Settings, Bob-Net: "OK cards on all Bobs", off unless you turn it on).
// the owner, Nov 13: "waiting on you and cards that are not pairing cards should be pushed through bob-net to all
// devices, and cleared when dealt with."
//
// - When this Bob shows an OK card (an approval, a question with choices, a plan), he sends it to every Bob on your
//   Bob-Net list. When it's answered, anywhere, or times out, he tells them all to take it down.
// - A Bob that gets one shows it in his chat, marked with who it's from, and in Now running's Bob-Net list. Answering
//   it there sends the answer back to the Bob that asked; that Bob does the rest, exactly as if you'd pressed it there.
// - Your phone app already listens to your other Bob: with this on, it shows every one of his cards, not only the
//   ones from chats on the phone (the cards say `everywhere`).
// - Pairing cards never travel: pairing is its own card, on the Bob being paired, by design.
// - A missed message can't leave a card stuck: every minute each Bob asks the others which of their cards are still
//   waiting, and takes down any that aren't.
// What travels: the card's words and choices, between your own Bobs, through the same passcode door as the rest of
// Bob-Net. Nothing goes to Bob's brain; no start-up words.
export const cardsOn = (cfg) => cfg?.share?.cardsEverywhere === true;
export const SYNC_MS = 60000;
export const MAX_SHOWN = 50;

const str = (s, n) => String(s ?? '').slice(0, n);
// The parts of a card another Bob can show and answer. Only plain data; sizes capped.
export function cardForNet(ev) {
  if (!ev || ev.type !== 'approval' || !ev.id || ev.net || ev.pairing) return null;
  const c = { id: str(ev.id, 80), text: str(ev.text, 2000) };
  if (ev.diff) c.diff = str(ev.diff, 6000);
  if (ev.ask && Array.isArray(ev.ask.choices)) c.ask = { question: str(ev.ask.question, 300), choices: ev.ask.choices.slice(0, 6).map((x) => str(x, 120)) };
  if (Array.isArray(ev.plan)) c.plan = ev.plan.slice(0, 200).map((r) => ({ id: str(r?.id, 80), text: str(r?.text ?? r?.label, 300), blocked: r?.blocked === true }));
  if (Array.isArray(ev.together)) c.together = ev.together.slice(0, 50).map((t) => ({ n: Number(t?.n) || 0, text: str(t?.text, 500), ...(t?.command ? { command: str(t.command, 500) } : {}) }));
  if (ev.planCard && typeof ev.planCard === 'object') c.planCard = { goal: str(ev.planCard.goal, 300), time: str(ev.planCard.time, 200), steps: (ev.planCard.steps || []).slice(0, 30).map((s) => ({ text: str(s?.text, 300), ok: s?.ok === true })) };
  if (ev.sortCard && typeof ev.sortCard === 'object') { // the email sort plan (email-manage.js), for the phone and other Bobs
    const sc = ev.sortCard;
    c.sortCard = {
      batches: (sc.batches || []).slice(0, 13).map((b) => ({ key: str(b?.key, 10), name: str(b?.name, 60), why: str(b?.why, 200), action: str(b?.action, 12), folder: str(b?.folder, 80),
        items: (b?.items || []).slice(0, 100).map((it) => ({ id: Number(it?.id) || 0, subject: str(it?.subject, 120), from: str(it?.from, 40), unread: it?.unread === true, danger: (it?.danger || []).slice(0, 6).map((d) => str(d, 200)) })) })),
      folders: (sc.folders || []).slice(0, 80).map((f) => str(f, 80)),
      replyFirst: (sc.replyFirst || []).slice(0, 8).map((r) => ({ id: Number(r?.id) || 0, subject: str(r?.subject, 120), from: str(r?.from, 40), why: str(r?.why, 120) }))
    };
  }
  if (ev.command) { c.command = str(ev.command, 1000); c.cwd = str(ev.cwd, 300); }
  for (const k of ['where', 'button', 'kind']) if (ev[k]) c[k] = str(ev[k], 120);
  if (ev.allowAll) c.allowAll = true;
  if (ev.hand) c.hand = true;
  return c;
}

// The host part of an address ("100.1.2.3:7777" -> "100.1.2.3"), and of a socket's address ("::ffff:172.16.0.5").
const hostOf = (a) => String(a || '').replace(/^::ffff:/, '').replace(/^\[|\](:\d+)?$/g, '').replace(/:\d+$/, '');

export class NetCards {
  // brain: broadcast(), lenders (bobs(), call(), nearAll), cfg, log(), waitingCards.
  constructor(brain, { name = () => 'Bob', now = Date.now } = {}) {
    Object.assign(this, { brain, name, now });
    this.shown = new Map(); // card id -> { address, from } : cards from other Bobs shown here
    this.timer = null;
  }
  get cfg() { return this.brain.cfg; }
  bobs() { return this.brain.lenders?.bobs?.() || []; }

  // Every event this Bob broadcasts passes through here (brain.js). Only its own cards go out.
  local(ev) {
    if (!cardsOn(this.cfg) || !ev?.id || ev.net) return;
    if (ev.type === 'approval') { const card = cardForNet(ev); if (card) this.tell({ action: 'show', from: this.name(), card }); }
    else if (ev.type === 'approval-result' && !this.shown.has(String(ev.id))) this.tell({ action: 'clear', id: String(ev.id) });
  }
  tell(body) {
    for (const bob of this.bobs()) this.brain.lenders.call(bob, '/api/bob-net/cards', { method: 'POST', body, timeout: 5000 }).catch(() => {});
  }

  // Which of my other Bobs sent this, by the address it came from (his door address, home or Tailscale), else by name.
  bobFrom(ip, name = '') {
    const h = hostOf(ip), list = this.bobs();
    const near = this.brain.lenders?.nearAll;
    return list.find((b) => [b.address, b.home, b.ts].some((a) => a && hostOf(a) === h) || (near?.get?.(b.address) || []).some((f) => f.host === h))
      || (name ? list.find((b) => b.name === name) : null) || null;
  }

  // POST /api/bob-net/cards from another Bob: show or clear.
  receive(b, ip) {
    const bob = this.bobFrom(ip, str(b?.from, 40));
    if (!bob) return { status: 403, body: { error: 'Not one of my Bobs.' } };
    if (b?.action === 'clear') { this.drop(String(b.id || '')); return { status: 200, body: { ok: true } }; }
    if (b?.action !== 'show') return { status: 400, body: { error: 'no' } };
    const card = cardForNet({ ...b.card, type: 'approval' });
    if (!card) return { status: 400, body: { error: 'no card' } };
    if (this.brain.waitingCards?.has(card.id) && !this.shown.has(card.id)) return { status: 200, body: { ok: true } }; // it's one of mine
    if (this.shown.size >= MAX_SHOWN) this.drop(this.shown.keys().next().value);
    const from = str(b.from, 40) || bob.name;
    this.shown.set(card.id, { address: bob.address, from });
    this.brain.broadcast({ type: 'approval', ...card, sessionId: `net:${bob.address}`, net: { from } });
    return { status: 200, body: { ok: true } };
  }
  drop(id) {
    if (!this.shown.has(id)) return;
    this.shown.delete(id);
    this.brain.broadcast({ type: 'approval-result', id, net: true, sessionId: 'net:' });
  }

  // GET /api/bob-net/cards: my own cards still waiting (for the minute-by-minute check).
  mine() { return cardsOn(this.cfg) ? [...(this.brain.waitingCards?.values() || [])].map(cardForNet).filter(Boolean) : []; }

  // Answered here: the answer goes back to the Bob that asked. True when he took it.
  async answer(id, b) {
    const s = this.shown.get(String(id));
    if (!s) return null;
    const bob = this.bobs().find((x) => x.address === s.address);
    if (!bob) { this.drop(String(id)); return false; }
    const r = await this.brain.lenders.call(bob, '/api/approve', { method: 'POST', body: { id, allow: b.allow, rows: b.rows, items: b.items, note: b.note }, timeout: 8000 }).catch(() => null);
    if (r?.ok || r?.status === 404) this.drop(String(id)); // 404: already answered over there
    return Boolean(r?.ok);
  }

  // Every minute: ask each Bob which of his cards still wait; show the missing ones, take down the gone ones.
  async sync() {
    const bobs = this.bobs();
    await Promise.all(bobs.map(async (bob) => {
      let list;
      try { const r = await this.brain.lenders.call(bob, '/api/bob-net/cards', { timeout: 4000 }); if (!r.ok) return; list = (await r.json()).cards; } catch { return; }
      if (!Array.isArray(list)) return;
      const ids = new Set(list.map((c) => String(c?.id)));
      for (const [id, s] of [...this.shown]) if (s.address === bob.address && !ids.has(id)) this.drop(id);
      for (const c of list) if (!this.shown.has(String(c?.id))) this.receive({ action: 'show', from: bob.name, card: c }, hostOf(bob.address));
    }));
    for (const [id, s] of [...this.shown]) if (!bobs.some((b) => b.address === s.address)) this.drop(id); // a Bob taken off the list
  }
  start() { if (this.timer) return; this.timer = setInterval(() => { if (this.bobs().length) this.sync().catch(() => {}); }, SYNC_MS); this.timer.unref?.(); }
  stop() { clearInterval(this.timer); this.timer = null; }

  // For Now running's Bob-Net list: how many cards each Bob has waiting on you here.
  counts() { const out = {}; for (const s of this.shown.values()) out[s.address] = (out[s.address] || 0) + 1; return out; }
}
