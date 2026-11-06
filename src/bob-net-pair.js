// 1.5.99 Pair with my other Bobs (Settings, Bob-Net, My other Bobs). Before this, joining two Bobs meant typing each
// one's Tailscale address and its door passcode (shown only once) on the other. Now:
//   1. On any Bob, press "Find my other Bobs". He asks Tailscale which of your devices are online and knocks on each.
//   2. Press "Pair" next to one (or "Pair with all of them"). That Bob shows a card with a 4-digit number; this one shows
//      the same number. Press "Yes, pair us" there.
//   3. The two swap passcodes over Tailscale and each puts the other in "My other Bobs". No typing, no files.
// Nothing switches on by itself: pairing only fills the list. Lend, borrow and the job switches stay as you set them.
//
// Protocol (pair v1), served only through the "Let my other replicant matrices in" door (Tailscale addresses only),
// before the passcode check, because the whole point is that the asker doesn't know the passcode yet:
//   GET  /api/pair/hello              -> { bob: true, pair: 1, name, device, version, door: true }
//   POST /api/pair/ask    { pair, name, address, code }  -> { id }   (card shown here; address must be the caller's own)
//   POST /api/pair/status { id }      -> { state: 'waiting' | 'no' | 'gone' } or { state: 'yes', passcode, name, address }
//   POST /api/pair/finish { id, passcode? } -> { ok }  (the asker's own passcode, only after a yes, so a Bob that says
//                                                   no never learns it; empty when the asker's door is off)
// Limits: 3 asks a minute, one waiting card per caller, cards and answers forgotten after 3 minutes, the passcode is
// handed over once, and only to the address that asked.
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { isTailscaleIp, tailscaleExe } from './phone-access.js';
import { cleanSharePatch, saveShare, doorOpen, cleanAddress } from './share-brains.js';

export const PAIR = 1;
export const ASK_FOR_MS = 3 * 60000;
const ASKS_A_MINUTE = 3;
const POLL_MS = 2000;
const HELLO_MS = 2000;

const clean = (s, n = 40) => String(s || '').replace(/[\u0000-\u001f<>"'`]/g, '').trim().slice(0, n);
const plainIp = (a) => String(a || '').replace(/^::ffff:/, '');

// This Bob's name on Bob-Net: the computer's name ("desk", "handheld"), as Tailscale shows it too.
export const myName = () => clean(os.hostname().split('.')[0], 40) || 'Bob';

// The devices Tailscale knows, from `tailscale status --json`: [{ name, ip, os, online }]. Pure, so tests can feed it.
export function peersFromStatus(j) {
  const out = [];
  for (const p of Object.values(j?.Peer || {})) {
    const ip = (p?.TailscaleIPs || []).find(isTailscaleIp);
    if (!ip) continue;
    const name = clean(p.HostName || String(p.DNSName || '').split('.')[0] || ip);
    out.push({ name, ip, os: clean(p.OS, 20), online: p.Online === true });
  }
  return out.sort((a, b) => Number(b.online) - Number(a.online) || a.name.localeCompare(b.name));
}

export function tailnetPeers({ exe = tailscaleExe(), run = execFile } = {}) {
  return new Promise((resolve) => {
    run(exe, ['status', '--json'], { timeout: 4000, windowsHide: true, maxBuffer: 8e6 }, (err, out) => {
      if (err) return resolve(null); // no Tailscale program here (or it's not running): the page offers "Pair by address"
      try { resolve(peersFromStatus(JSON.parse(out))); } catch { resolve(null); }
    });
  });
}

export const matchCode = () => String(crypto.randomInt(1000, 10000));

export class Pairing {
  // 1.5.123 vouched(address, token): the name of the Bob that introduced this caller (Pass my Bob-Net along), or ''.
  constructor(cfg, { fetchFn = globalThis.fetch, now = Date.now, broadcast = () => {}, log = () => {}, version = '', peers = tailnetPeers, ownAddresses = () => [], pollMs = POLL_MS, vouched = () => '' } = {}) {
    Object.assign(this, { cfg, fetch: fetchFn, now, broadcast, log, version, peers, ownAddresses, pollMs, vouched });
    this.asks = new Map(); // id -> { id, name, address, ip, code, at, state }  (cards on this Bob)
    this.askTimes = [];
    this.outgoing = new Map(); // address -> { state, code, name, why }  (this Bob asking others)
  }

  // ---------- The Bob being asked ----------
  hello() { return { bob: true, pair: PAIR, name: myName(), device: 'computer', version: this.version, door: doorOpen(this.cfg) }; }

  tidy() { const now = this.now(); for (const [id, a] of this.asks) if (now - a.at > ASK_FOR_MS) { this.asks.delete(id); if (a.state === 'waiting') this.broadcast({ type: 'pair-gone', id }); } }

  ask(b, remoteIp) {
    this.tidy();
    const ip = plainIp(remoteIp);
    if (!isTailscaleIp(ip)) return { code: 403, error: 'Tailscale only' };
    if (Number(b?.pair) !== PAIR) return { code: 400, error: 'Different Bob-Net pairing. Update both Bobs.' };
    const address = cleanAddress(b?.address);
    // The address he wants us to save must be his own: the one he's calling from.
    if (!address || address.split(':')[0] !== ip) return { code: 400, error: 'That address isn\'t the one you called from.' };
    const code = String(b?.code || '');
    if (!/^\d{4}$/.test(code)) return { code: 400, error: 'no number' };
    const now = this.now();
    while (this.askTimes.length && now - this.askTimes[0] > 60000) this.askTimes.shift();
    if (this.askTimes.length >= ASKS_A_MINUTE) return { code: 429, error: 'Too many pairing asks. Wait a minute.' };
    for (const a of this.asks.values()) if (a.ip === ip && a.state === 'waiting') { this.asks.delete(a.id); this.broadcast({ type: 'pair-gone', id: a.id }); }
    this.askTimes.push(now);
    const ask = { id: crypto.randomBytes(16).toString('hex'), name: clean(b?.name) || ip, address, ip, code, at: now, state: 'waiting' };
    // 1.5.123: an ask that carries the token one of your Bobs gave us for this address is a yes at once, no card.
    // A token nobody gave us is refused outright (never a card for a stranger's guess).
    if (b?.token !== undefined) {
      const by = this.vouched(address, b.token);
      if (!by) return { code: 403, error: 'Nobody here is expecting that introduction.' };
      Object.assign(ask, { state: 'yes', by });
      this.asks.set(ask.id, ask);
      this.log('bob-net', `${by} introduced ${ask.name} (${ip}): pairing without a card`);
      return { code: 200, id: ask.id };
    }
    this.asks.set(ask.id, ask);
    this.broadcast(this.card(ask));
    this.log('bob-net', `${ask.name} (${ip}) asked to pair`);
    return { code: 200, id: ask.id };
  }

  card(a) { return { type: 'pair-ask', id: a.id, name: a.name, address: a.address, number: a.code, already: this.known(a.address) }; }
  known(address) { return (this.cfg.share?.borrow?.bobs || []).some((x) => x.address === address); }
  // Cards still waiting, for a window that opens (or reconnects) after the ask came in.
  waiting() { this.tidy(); return [...this.asks.values()].filter((a) => a.state === 'waiting').map((a) => this.card(a)); }

  // The owner pressed Yes or No on the card (this replicant matrix only).
  answer(id, yes) {
    this.tidy();
    const a = this.asks.get(String(id || ''));
    if (!a || a.state !== 'waiting') return { ok: false, why: 'That pairing card is too old now. Press Pair again on the other Bob.' };
    if (yes && !doorOpen(this.cfg)) return { ok: false, why: 'Turn on "Let my other replicant matrices in" here first.' };
    a.state = yes ? 'yes' : 'no';
    a.at = this.now(); // the asker has 3 minutes from now to collect the answer
    this.broadcast({ type: 'pair-gone', id: a.id });
    this.log('bob-net', `pairing with ${a.name}: ${yes ? 'yes' : 'no'} (your click)`);
    return { ok: true, name: a.name };
  }

  status(id, remoteIp) {
    this.tidy();
    const a = this.asks.get(String(id || ''));
    if (!a || a.ip !== plainIp(remoteIp)) return { state: 'gone' };
    if (a.state !== 'yes') return { state: a.state };
    if (a.handed) return { state: 'gone' };
    a.handed = true; // the passcode goes out once
    const mine = this.ownAddresses()[0] || '';
    return { state: 'yes', passcode: String(this.cfg.remote?.passcode || ''), name: myName(), address: mine };
  }

  // The asker's own passcode, after our yes. Puts him in My other Bobs here. Without one (his door is off) he can use
  // this Bob, but this Bob can't use him, and the page there says how to fix that.
  finish(b, remoteIp) {
    const a = this.asks.get(String(b?.id || ''));
    if (!a || a.ip !== plainIp(remoteIp) || a.state !== 'yes' || a.finished) return { ok: false };
    a.finished = true;
    const passcode = String(b?.passcode || '').trim();
    if (passcode.length >= 6) {
      const out = cleanSharePatch(this.cfg, { addBob: { name: a.name, address: a.address, passcode } });
      if (out.error) { this.log('bob-net', `couldn't add ${a.name}: ${out.error}`); return { ok: false, why: out.error }; }
      saveShare(this.cfg, out.share);
    }
    this.asks.delete(a.id);
    this.broadcast({ type: 'pair-done', name: a.name, both: passcode.length >= 6, by: a.by || undefined });
    return { ok: true, added: passcode.length >= 6 };
  }

  // ---------- The Bob asking ----------
  async knock(ip, port = this.cfg.port || 7777) {
    try {
      const r = await this.fetch(`http://${ip}:${port}/api/pair/hello`, { redirect: 'manual', signal: AbortSignal.timeout(HELLO_MS) });
      const j = r.ok ? await r.json().catch(() => ({})) : {};
      if (j.bob === true) return { bob: true, pair: Number(j.pair) || 0, version: clean(j.version, 20), device: clean(j.device, 20), name: clean(j.name) };
      return { bob: false, why: r.status === 403 ? 'door' : 'other' };
    } catch { return { bob: false, why: 'quiet' }; }
  }

  // Your devices on Tailscale, each with whether a Bob answered there and whether he's already in your list.
  async find() {
    const peers = await this.peers();
    if (!peers) return { tailscale: false, bobs: [] };
    const online = peers.filter((p) => p.online).slice(0, 20);
    const seen = await Promise.all(online.map((p) => this.knock(p.ip)));
    const port = this.cfg.port || 7777;
    const bobs = online.map((p, i) => {
      const address = `${p.ip}:${port}`;
      return { name: seen[i].name || p.name, device: p.name, os: p.os, address, ...seen[i], paired: this.known(address), pairing: this.outgoing.get(address) || null };
    });
    return { tailscale: true, bobs, offline: peers.filter((p) => !p.online).map((p) => p.name) };
  }

  // Ask one Bob. Returns at once with the number to match; the answer is collected in the background.
  // 1.5.123 { token, by }: pairing by introduction (Pass my Bob-Net along): the token goes with the ask, no card there.
  async pairWith(addressIn, { token, by } = {}) {
    const address = cleanAddress(addressIn);
    if (!address) return { error: 'That isn\'t a Tailscale address. It looks like 100.x.y.z or name.something.ts.net.' };
    const cur = this.outgoing.get(address);
    if (cur?.state === 'waiting') return { address, ...cur };
    const mine = this.ownAddresses()[0];
    if (!mine) return { error: 'This replicant matrix isn\'t on Tailscale right now. Open Tailscale and sign in, then try again.' };
    const code = matchCode();
    let r, j;
    try {
      r = await this.fetch(`http://${address}/api/pair/ask`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ pair: PAIR, name: myName(), address: mine, code, ...(token ? { token } : {}) }) });
      j = await r.json().catch(() => ({}));
    } catch { return { error: 'No Bob answered there. Is Bob open on it, with "Let my other replicant matrices in" on?' }; }
    if (r.status === 403) return { error: 'That Bob\'s door is shut. Turn on "Let my other replicant matrices in" there, then press Pair again.' };
    if (r.status === 404) return { error: 'That Bob is too old to pair. Update him, or add him by hand under More.' };
    if (!r.ok || !j.id) return { error: j.error || `That Bob said no (${r.status}).` };
    const job = { state: 'waiting', code, since: this.now(), by: by || undefined };
    this.outgoing.set(address, job);
    this.collect(address, j.id, job).catch((e) => { job.state = 'failed'; job.why = String(e.message || e).slice(0, 120); });
    return { address, ...job };
  }

  async collect(address, id, job) {
    const post = (path, body) => this.fetch(`http://${address}${path}`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(body) }).then((r) => r.json()).catch(() => ({ state: 'quiet' }));
    let quiet = 0;
    while (this.now() - job.since < ASK_FOR_MS + 10000) {
      await new Promise((ok) => setTimeout(ok, this.pollMs));
      const s = await post('/api/pair/status', { id });
      if (s.state === 'quiet') { if (++quiet >= 10) break; continue; }
      quiet = 0;
      if (s.state === 'waiting') continue;
      if (s.state === 'no') { job.state = 'no'; return; }
      if (s.state !== 'yes') break;
      const them = String(s.passcode || '');
      const name = clean(s.name) || address.split(':')[0];
      const out = cleanSharePatch(this.cfg, { addBob: { name, address, passcode: them } });
      if (out.error) { job.state = 'failed'; job.why = out.error; await post('/api/pair/finish', { id }); return; }
      saveShare(this.cfg, out.share);
      // Ours goes over only now, after their yes, and only if our door is open (else they couldn't use it anyway).
      const ours = doorOpen(this.cfg) ? String(this.cfg.remote.passcode) : '';
      await post('/api/pair/finish', { id, passcode: ours });
      Object.assign(job, { state: 'paired', name, both: Boolean(ours) });
      this.log('bob-net', `paired with ${name}${ours ? ' (both ways)' : ' (one way: this door is off)'}${job.by ? `, introduced by ${job.by}` : ''}`);
      this.broadcast({ type: 'pair-done', name, both: Boolean(ours), asker: true, by: job.by });
      return;
    }
    job.state = 'timeout';
  }

  outgoingView() { return Object.fromEntries([...this.outgoing].map(([a, j]) => [a, { state: j.state, code: j.code, name: j.name, both: j.both, why: j.why, by: j.by }])); }
}
