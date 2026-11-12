// 1.5.123 Bob-Net, two more pieces (asked for by the owner, 2026-11-05):
//
// 1. The party: a "Bob-Net" section in Now running (the right pane) that shows every Bob in My other Bobs and what each
//    is doing for the others right now (thinking a reply for me, making a picture for me, ready, gaming, not reachable),
//    plus this Bob's own line (thinking for the handheld, a job for the phone). It only shows up once Bob-Net is in use
//    (a Bob in the list, or Lend / Take jobs on), so a fresh Bob has nothing new on screen. partyView() is the reading;
//    the page polls GET /api/bob-net/party while the pane is open, and refreshes early on a lend, borrow, sent job or
//    pairing. The hellos it uses are the same cached ones the borrow pick uses (30 s good, 60 s down), so a lender is
//    knocked on at most every half minute.
//
// 2. "Pass my Bob-Net along" (off): your Bobs with this on introduce each other. When this Bob is paired with two Bobs
//    that both have it on, it tells each the other's name and Tailscale address, and the two pair with each other the
//    usual way (src/bob-net-pair.js) but with a one-time token in place of the Yes card, so nobody has to press anything.
//    The owner's example: the phone is paired with the handheld; the handheld passes the phone along to the PC, and the
//    PC and the phone are on each other's lists without a card on either. Passcodes still only ever travel between the
//    two Bobs being paired, after the (vouched) yes, exactly as in pairing. Nothing switches on over there: a Bob that's
//    introduced lands in My other Bobs, and Lend, Borrow and the job switches stay as its owner set them.
//
// Protocol (pair v1 addition, all optional), through the door and signed in (the introducer already holds our passcode):
//   POST /api/bob-net/introduce { pair, token, role: 'ask' | 'expect', from, bob: { name, address, device } }
//     -> { ok: true, asking: true }     (role ask: this Bob now pairs with `bob`, sending `token` in /api/pair/ask)
//     -> { ok: true, expecting: true }  (role expect: an ask for `bob.address` carrying `token` gets a yes, no card)
//     -> { ok: true, already: true }    (bob is on this list already)
//     -> 409 { busy: 'off' }            (Pass my Bob-Net along is off here), 404 on a Bob too old to know the route.
//   POST /api/pair/ask { ..., token }   (as before; with a vouched token the state is 'yes' at once)
// The introducer tells the answering side first ("expect"), then the asking side ("ask"); a computer asks and a phone
// answers (the phone app can only answer, for now); between two computers the first on your list asks. A token is good
// for 3 minutes, once. A pair is introduced again after an hour if it didn't take, after a day if it did.
import crypto from 'node:crypto';
import { doorOpen, cleanAddress } from './share-brains.js';
import { myName, PAIR, ASK_FOR_MS } from './bob-net-pair.js';
import { LOOK_ID_RE } from './look.js';

const HOUR = 3600e3, DAY = 24 * HOUR;
const clean = (s, n = 40) => String(s || '').replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, n);
const plainIp = (a) => String(a || '').replace(/^::ffff:/, '');

// ---------- The party (Now running) ----------
// One reading of Bob-Net as this Bob sees it. No network here: the lenders' remembered hellos, what we timed, and this
// Bob's own lending and guest jobs. server.js refreshes the hellos (cached) before calling this.
export function partyView(brain, { now = Date.now } = {}) {
  const cfg = brain.cfg || {};
  const s = cfg.share || {};
  const L = brain.lenders;
  const door = doorOpen(cfg);
  const guests = (brain.queue || []).filter((j) => j.guest && (j.state === 'working' || j.state === 'waiting')).map((j) => ({ from: j.guest.from, need: j.guest.need, state: j.state }));
  const away = new Map(); // address -> the kind of job he's doing for us
  for (const a of (brain.awayJobs || new Map()).values()) if (a?.address) away.set(a.address, a.need);
  const bobs = (L?.bobs?.() || []).map((b) => {
    const st = L.state.get(b.address) || {};
    return {
      name: b.name, address: b.address, device: st.device || '', ok: st.ok === undefined ? null : st.ok, why: st.why || '', brain: st.brain || '',
      ctx: st.ctx || 0, speed: st.measured?.tokPerSec || st.speed || 0, jobs: st.jobs || [], jobsBusy: st.jobsBusy || '', queue: st.queue || 0,
      thinking: L.live?.get(b.address) === 'thinking', doing: away.get(b.address) || '',
      look: LOOK_ID_RE.test(String(st.look || '')) ? st.look : '', // his avatar, from his hello ('' from a phone or an older Bob)
      lastUsed: st.measured?.lastUsed || 0, passAlong: st.passAlong === true, checkedAt: st.at || 0
    };
  });
  return {
    on: bobs.length > 0 || s.lend === true || s.takeJobs === true,
    at: now(),
    here: { name: myName(), look: LOOK_ID_RE.test(String(cfg.look || '')) ? cfg.look : '', door, lend: s.lend === true && door, takeJobs: s.takeJobs === true && door, passAlong: s.passAlong === true, lending: brain.lending ? { for: brain.lending.for, since: brain.lending.since } : null, guests },
    bobs
  };
}

// ---------- Pass my Bob-Net along ----------
export class Introductions {
  constructor(cfg, { lenders, pairing, log = () => {}, now = Date.now, name = myName } = {}) {
    Object.assign(this, { cfg, lenders, pairing, log, now, name });
    this.expected = new Map(); // address -> { token, from, name, at }  (introductions this Bob was told to expect)
    this.done = new Map(); // 'a|b' -> { at, state, a, b, why }  (pairs this Bob introduced, as the introducer)
    this.timer = null;
  }
  on() { return this.cfg.share?.passAlong === true; }

  // Another of your Bobs (through the door, signed in with our passcode) introduces a third.
  receive(b, remoteIp) {
    if (!this.on() || !doorOpen(this.cfg)) return { code: 409, busy: 'off' };
    if (Number(b?.pair) !== PAIR) return { code: 400, error: 'Different Bob-Net pairing. Update both Bobs.' };
    const token = String(b?.token || '');
    if (!/^[0-9a-f]{32}$/.test(token)) return { code: 400, error: 'no token' };
    const address = cleanAddress(b?.bob?.address);
    if (!address) return { code: 400, error: 'That isn\'t a Tailscale address.' };
    const ip = plainIp(remoteIp);
    if (address.split(':')[0] === ip) return { code: 400, error: 'That\'s you.' };
    const role = b?.role === 'ask' ? 'ask' : 'expect';
    const from = clean(b?.from) || ip;
    const name = clean(b?.bob?.name) || address.split(':')[0];
    this.tidy();
    const known = this.pairing.known(address);
    // Even a Bob we know gets an "expect": if he was told to ask us, his ask must find its token here.
    if (role === 'expect' || !known) this.expected.set(address, { token, from, name, at: this.now() });
    if (known) return { code: 200, ok: true, already: true };
    this.log('bob-net', `${from} introduced ${name}${role === 'ask' ? '; pairing with him' : ''}`);
    if (role === 'ask') {
      Promise.resolve().then(() => this.pairing.pairWith(address, { token, by: from })).catch(() => {});
      return { code: 200, ok: true, asking: true };
    }
    return { code: 200, ok: true, expecting: true };
  }

  // For Pairing.ask(): the name of the Bob that vouched for this address with this token, or '' (the card is shown then
  // only if the ask carried no token at all; a wrong token is refused outright).
  vouched(address, token) {
    this.tidy();
    const e = this.expected.get(address);
    if (!e || e.token !== String(token || '')) return '';
    this.expected.delete(address); // once
    return e.from;
  }
  tidy() { const now = this.now(); for (const [a, e] of this.expected) if (now - e.at > ASK_FOR_MS) this.expected.delete(a); }

  // ---------- This Bob as the introducer ----------
  soon(ms = 3000) { clearTimeout(this.timer); this.timer = setTimeout(() => this.run().catch(() => {}), ms); this.timer.unref?.(); }
  async run() {
    if (!this.on()) return;
    const bobs = this.lenders.bobs();
    if (bobs.length < 2) return;
    await Promise.all(bobs.map((b) => this.lenders.hello(b).catch(() => null)));
    for (let i = 0; i < bobs.length; i++) for (let j = i + 1; j < bobs.length; j++) {
      const key = [bobs[i].address, bobs[j].address].sort().join('|');
      const d = this.done.get(key);
      if (d && this.now() - d.at < (d.state === 'introduced' || d.state === 'already' ? DAY : HOUR)) continue;
      await this.introduce(bobs[i], bobs[j], key);
    }
  }
  device(b) { return this.lenders.state.get(b.address)?.device || ''; }
  async introduce(a, b, key = [a.address, b.address].sort().join('|')) {
    // A computer asks and a phone answers; between two computers, the first on your list asks.
    const [asker, other] = this.device(a) === 'phone' && this.device(b) !== 'phone' ? [b, a] : [a, b];
    const token = crypto.randomBytes(16).toString('hex');
    const tell = async (to, role, about) => {
      try {
        const r = await this.lenders.call(to, '/api/bob-net/introduce', { method: 'POST', body: { pair: PAIR, token, role, from: this.name(), bob: { name: about.name, address: about.address, device: this.device(about) } }, timeout: 4000 });
        const j = await r.json().catch(() => ({}));
        if (r.status === 409) return 'off';
        if (r.status === 404) return 'old';
        if (!r.ok) return 'no';
        return j.already ? 'already' : 'ok';
      } catch { return 'quiet'; }
    };
    const rec = (state, who, why = '') => { this.done.set(key, { at: this.now(), state, a: asker.name, b: other.name, who: who?.name || '', why }); this.log('bob-net', `introducing ${asker.name} to ${other.name}: ${state}${who ? ` (${who.name})` : ''}`); };
    const first = await tell(other, 'expect', asker);
    if (first === 'off' || first === 'old' || first === 'quiet' || first === 'no') return rec(first, other);
    const second = await tell(asker, 'ask', other);
    if (second === 'off' || second === 'old' || second === 'quiet' || second === 'no') return rec(second, asker);
    rec(second === 'already' && first === 'already' ? 'already' : 'introduced');
  }

  // For Settings: what came of each introduction this Bob made.
  view() {
    return [...this.done.values()].sort((x, y) => y.at - x.at).slice(0, 12).map((d) => ({ a: d.a, b: d.b, state: d.state, who: d.who, at: d.at }));
  }
}
