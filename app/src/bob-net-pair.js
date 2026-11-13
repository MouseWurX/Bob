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
//   POST /api/pair/status { id }      -> { state: 'waiting' | 'no' | 'gone' } or { state: 'yes', passcode, name, address, linkKey }
//                                        (linkKey, from 1.5.205: the pair's key for sealed SCUT packets, src/scut-seal.js)
//   POST /api/pair/finish { id, passcode? } -> { ok }  (the asker's own passcode, only after a yes, so a Bob that says
//                                                   no never learns it; empty when the asker's door is off)
// Limits: 3 asks a minute, one waiting card per caller, cards and answers forgotten after 3 minutes, the passcode is
// handed over once, and only to the address that asked.
//
// 1.5.213 Sealed pairing (both Bobs new enough; hello says seal: 1). Bob-Net can now pair over a plain home network
// ("Also over the home network"), where nothing is scrambled for us the way Tailscale does it. So the passcodes never
// cross the wire as plain text:
//   ask    adds commit = sha256(asker's one-time public key)      -> { id, pub } (the asked Bob's one-time key)
//   status adds pub (the asker's key, once, checked against commit) -> the card shows only now
//   The number on both screens comes from both keys, so a Bob in the middle shows a different number (the asker
//   commits to his key before he sees the other one, so a middleman can't pick keys that make the numbers match).
//   Passcodes and the SCUT link key then travel sealed (X25519 + AES-256-GCM) as { sealed } in status and finish.
// Over the home network sealed pairing is a must; over Tailscale an older Bob still pairs the old way.
// After pairing, everyday Bob-to-Bob traffic on the home network is plain HTTP, as Help says.
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { isTailscaleIp, tailscaleExe } from './phone-access.js';
import { cleanSharePatch, saveShare, doorOpen, cleanAddress, cleanBobAddress, cleanHomeAddress, homeOn, BAD_ADDRESS } from './share-brains.js';
import { doorIps as realHomeIps, sameNet, isLinkLocal } from './share-card.js';
import { newLinkKey, saveLinkKey, KEY_RE } from './scut-seal.js'; // sealed SCUT packets: a link key per pair

export const PAIR = 1;
export const ASK_FOR_MS = 3 * 60000;
const ASKS_A_MINUTE = 3;
const POLL_MS = 2000;
const HELLO_MS = 2000;
// Find my other Bobs on the home network: knock on this replicant matrix's own /24 (or smaller) only, at most 2
// networks, 254 addresses each, 64 at a time, each given a short time (a home network answers in a few ms).
export const SCAN_NETS = 2, SCAN_AT_ONCE = 64, SCAN_HELLO_MS = 700;

// ---------- Sealed pairing ----------
const b64 = (x) => Buffer.from(x).toString('base64');
const SPKI = Buffer.from('302a300506032b656e032100', 'hex'); // X25519 public key wrapper (DER), then 32 raw bytes
export function oneTimeKey() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('x25519');
  return { pub: b64(publicKey.export({ format: 'der', type: 'spki' }).subarray(12)), priv: privateKey };
}
const rawPub = (p) => { const r = Buffer.from(String(p || ''), 'base64'); return r.length === 32 && /^[A-Za-z0-9+/]{43}=$/.test(String(p)) ? r : null; };
export const commitOf = (pub) => crypto.createHash('sha256').update('bob-pair-commit:' + pub).digest('hex');
// Both Bobs work this out alone: the key to seal with, and the 4-digit number to compare. a = asker's key, b = asked.
export function sealKey(priv, theirPub, aPub, bPub) {
  const raw = rawPub(theirPub);
  if (!raw) return null;
  const shared = crypto.diffieHellman({ privateKey: priv, publicKey: crypto.createPublicKey({ key: Buffer.concat([SPKI, raw]), format: 'der', type: 'spki' }) });
  const salt = Buffer.from(`${aPub}|${bPub}`);
  const key = Buffer.from(crypto.hkdfSync('sha256', shared, salt, 'bob-pair-v2 seal', 32));
  const n = crypto.createHash('sha256').update('bob-pair-v2 number|' + salt).digest().readUInt32BE(0) % 9000 + 1000;
  return { key, number: String(n) };
}
export function seal(key, obj) {
  const iv = crypto.randomBytes(12), c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([c.update(JSON.stringify(obj)), c.final()]);
  return b64(Buffer.concat([iv, c.getAuthTag(), ct]));
}
export function unseal(key, box) {
  try {
    const r = Buffer.from(String(box || ''), 'base64');
    if (r.length < 29) return null;
    const d = crypto.createDecipheriv('aes-256-gcm', key, r.subarray(0, 12));
    d.setAuthTag(r.subarray(12, 28));
    return JSON.parse(Buffer.concat([d.update(r.subarray(28)), d.final()]).toString());
  } catch { return null; }
}

// The addresses to knock on for one home network: same /24 at most, never this replicant matrix itself.
export function scanList({ address, netmask }) {
  const q = String(address).split('.').map(Number), m = String(netmask || '255.255.255.0').split('.').map(Number);
  if (q.length !== 4 || m.length !== 4 || q.some((x) => !(x >= 0 && x <= 255))) return [];
  const m3 = m[3] & 255, out = []; // a wider network (a /16) still only scans its own /24
  for (let x = 1; x < 255; x++) if (x !== q[3] && (x & m3) === (q[3] & m3)) out.push(`${q[0]}.${q[1]}.${q[2]}.${x}`);
  return out;
}

const OLD_OR_SHUT = 'That Bob won\'t pair over the home network. If it\'s older than 1.5.213, update it first: home-network pairing is new in 1.5.213. If it\'s up to date, its door is shut: turn on "Let my other replicant matrices in" and "Also over the home network" there, then press Pair again.';
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
  // 1.5.213 home(): this replicant matrix's home-network addresses [{ address, netmask }] (used only while
  // "Also over the home network" is on), passed in so tests can use fake network cards.
  constructor(cfg, { fetchFn = globalThis.fetch, now = Date.now, broadcast = () => {}, log = () => {}, version = '', peers = tailnetPeers, ownAddresses = () => [], pollMs = POLL_MS, vouched = () => '', home = realHomeIps } = {}) {
    // version: the label ("1.5.213"), never the VERSION object (PC check: Find showed "[object Object]").
    Object.assign(this, { cfg, fetch: fetchFn, now, broadcast, log, version: String(version?.label ?? version ?? ''), peers, ownAddresses, pollMs, vouched, home });
    this.selfId = crypto.randomBytes(8).toString('hex'); // this running Bob, so Find never lists him to himself
    this.asks = new Map(); // id -> { id, name, address, ip, code, at, state }  (cards on this Bob)
    this.askTimes = [];
    this.outgoing = new Map(); // address -> { state, code, name, why }  (this Bob asking others)
  }

  // ---------- The Bob being asked ----------
  hello() { return { bob: true, pair: PAIR, seal: 1, id: this.selfId, name: myName(), device: 'computer', version: this.version, door: doorOpen(this.cfg) }; }
  // A caller on one of our home networks, while "Also over the home network" is on here.
  homeCaller(ip) { return homeOn(this.cfg) && Boolean(cleanHomeAddress(ip, this.home())); }
  // Our own address on the home network the other Bob is on, or ''.
  homeMine(ip) { const m = homeOn(this.cfg) ? this.home().find((q) => sameNet(q.address, ip, q.netmask)) : null; return m ? `${m.address}:${this.cfg.port || 7777}` : ''; }

  tidy() { const now = this.now(); for (const [id, a] of this.asks) if (now - a.at > ASK_FOR_MS) { this.asks.delete(id); if (a.state === 'waiting') this.broadcast({ type: 'pair-gone', id }); } }

  ask(b, remoteIp) {
    this.tidy();
    const ip = plainIp(remoteIp);
    const home = !isTailscaleIp(ip) && this.homeCaller(ip);
    if (!isTailscaleIp(ip) && !home) return { code: 403, error: 'Tailscale or this home network only' };
    if (Number(b?.pair) !== PAIR) return { code: 400, error: 'Different Bob-Net pairing. Update both Bobs.' };
    const commit = /^[0-9a-f]{64}$/.test(String(b?.commit || '')) ? String(b.commit) : '';
    // Over the home network nothing is scrambled for us, so only sealed pairing (an older Bob must update first).
    if (home && !commit) return { code: 400, error: 'Pairing over the home network needs Bob 1.5.213 or newer on both. Update the other Bob.' };
    const address = cleanBobAddress(this.cfg, b?.address, { home: this.home });
    // The address he wants us to save must be his own: the one he's calling from.
    if (!address || address.split(':')[0] !== ip) return { code: 400, error: 'That address isn\'t the one you called from.' };
    const code = String(b?.code || '');
    if (!/^\d{4}$/.test(code)) return { code: 400, error: 'no number' };
    const now = this.now();
    while (this.askTimes.length && now - this.askTimes[0] > 60000) this.askTimes.shift();
    if (this.askTimes.length >= ASKS_A_MINUTE) return { code: 429, error: 'Too many pairing asks. Wait a minute.' };
    for (const a of this.asks.values()) if (a.ip === ip && a.state === 'waiting') { this.asks.delete(a.id); this.broadcast({ type: 'pair-gone', id: a.id }); }
    this.askTimes.push(now);
    const ask = { id: crypto.randomBytes(16).toString('hex'), name: clean(b?.name) || ip, address, ip, code, at: now, state: 'waiting', home };
    // Sealed: our one-time key goes back now; the card waits for his key (status) so the number can be worked out.
    if (commit) Object.assign(ask, { commit, key: oneTimeKey(), shown: false });
    // 1.5.123: an ask that carries the token one of your Bobs gave us for this address is a yes at once, no card.
    // A token nobody gave us is refused outright (never a card for a stranger's guess).
    if (b?.token !== undefined) {
      const by = this.vouched(address, b.token);
      if (!by) return { code: 403, error: 'Nobody here is expecting that introduction.' };
      Object.assign(ask, { state: 'yes', by });
      this.asks.set(ask.id, ask);
      this.log('bob-net', `${by} introduced ${ask.name} (${ip}): pairing without a card`);
      return { code: 200, id: ask.id, ...(commit ? { pub: ask.key.pub } : {}) };
    }
    this.asks.set(ask.id, ask);
    if (!commit) this.broadcast(this.card(ask));
    this.log('bob-net', `${ask.name} (${ip}) asked to pair${home ? ' over the home network' : ''}`);
    return { code: 200, id: ask.id, ...(commit ? { pub: ask.key.pub } : {}) };
  }

  // Sealed pairing: the asker's key, once, matching what he committed to. Then the number is known and the card shows.
  reveal(a, pub) {
    if (a.seal || !a.commit || a.revealed) return;
    a.revealed = true; // one go: a wrong key ends this ask
    const k = commitOf(String(pub || '')) === a.commit ? sealKey(a.key.priv, pub, String(pub), a.key.pub) : null;
    if (!k) { a.state = 'no'; this.log('bob-net', `pairing with ${a.name}: its key didn't match, so no`); return; }
    a.seal = k.key; a.code = k.number; a.shown = true;
    if (a.state === 'waiting') this.broadcast(this.card(a));
  }

  card(a) { return { type: 'pair-ask', id: a.id, name: a.name, address: a.address, number: a.code, already: this.known(a.address) }; }
  known(address) { return (this.cfg.share?.borrow?.bobs || []).some((x) => x.address === address); }
  // Cards still waiting, for a window that opens (or reconnects) after the ask came in.
  waiting() { this.tidy(); return [...this.asks.values()].filter((a) => a.state === 'waiting' && a.shown !== false).map((a) => this.card(a)); }

  // The owner pressed Yes or No on the card (this replicant matrix only).
  answer(id, yes) {
    this.tidy();
    const a = this.asks.get(String(id || ''));
    if (!a || a.state !== 'waiting' || a.shown === false) return { ok: false, why: 'That pairing card is too old now. Press Pair again on the other Bob.' };
    if (yes && !doorOpen(this.cfg)) return { ok: false, why: 'Turn on "Let my other replicant matrices in" here first.' };
    a.state = yes ? 'yes' : 'no';
    a.at = this.now(); // the asker has 3 minutes from now to collect the answer
    this.broadcast({ type: 'pair-gone', id: a.id });
    this.log('bob-net', `pairing with ${a.name}: ${yes ? 'yes' : 'no'} (your click)`);
    return { ok: true, name: a.name };
  }

  status(id, remoteIp, pub) {
    this.tidy();
    const a = this.asks.get(String(id || ''));
    if (!a || a.ip !== plainIp(remoteIp)) return { state: 'gone' };
    // Sealed: the asker's key arrives in its own call (the answer is collected on the next one); nothing goes out before.
    if (a.commit && !a.seal) { if (pub !== undefined) this.reveal(a, pub); return { state: a.seal && a.state !== 'no' ? 'waiting' : a.seal ? 'no' : a.state === 'waiting' && !a.revealed ? 'waiting' : 'no' }; }
    if (a.state !== 'yes') return { state: a.state };
    if (a.handed) return { state: 'gone' };
    a.handed = true; // the passcode goes out once
    const mine = a.home ? this.homeMine(a.ip) : this.ownAddresses()[0] || '';
    // Sealed SCUT packets: the pair's link key, made here, kept by both, handed over once with the passcode.
    const linkKey = newLinkKey();
    const kept = saveLinkKey(this.cfg, a.ip, linkKey);
    const secret = { passcode: String(this.cfg.remote?.passcode || ''), ...(kept ? { linkKey } : {}) };
    if (a.seal) return { state: 'yes', name: myName(), address: mine, sealed: seal(a.seal, secret) };
    return { state: 'yes', ...secret, name: myName(), address: mine };
  }

  // The asker's own passcode, after our yes. Puts him in My other Bobs here. Without one (his door is off) he can use
  // this Bob, but this Bob can't use him, and the page there says how to fix that.
  finish(b, remoteIp) {
    const a = this.asks.get(String(b?.id || ''));
    if (!a || a.ip !== plainIp(remoteIp) || a.state !== 'yes' || a.finished) return { ok: false };
    a.finished = true;
    const passcode = String((a.seal ? unseal(a.seal, b?.sealed)?.passcode : b?.passcode) || '').trim();
    if (passcode.length >= 6) {
      const out = cleanSharePatch(this.cfg, { addBob: { name: a.name, address: a.address, passcode } }, { home: this.home });
      if (out.error) { this.log('bob-net', `couldn't add ${a.name}: ${out.error}`); return { ok: false, why: out.error }; }
      saveShare(this.cfg, out.share);
    }
    this.asks.delete(a.id);
    this.broadcast({ type: 'pair-done', name: a.name, both: passcode.length >= 6, by: a.by || undefined });
    return { ok: true, added: passcode.length >= 6 };
  }

  // ---------- The Bob asking ----------
  async knock(ip, port = this.cfg.port || 7777, ms = HELLO_MS) {
    try {
      const r = await this.fetch(`http://${ip}:${port}/api/pair/hello`, { redirect: 'manual', signal: AbortSignal.timeout(ms) });
      const j = r.ok ? await r.json().catch(() => ({})) : {};
      if (j.bob === true) return { bob: true, pair: Number(j.pair) || 0, seal: Number(j.seal) || 0, self: Boolean(j.id) && j.id === this.selfId, id: clean(j.id, 24), version: clean(j.version, 20), kind: clean(j.device, 20), name: clean(j.name) };
      // A Bob before 1.5.213 (or one with the home switch off) turns a home-network hello away with this 403.
      if (r.status === 403) { const e = await r.json().catch(() => ({})); return { bob: false, why: 'door', old: /^Pairing goes over/.test(String(e?.error || '')) }; }
      return { bob: false, why: 'other' };
    } catch { return { bob: false, why: 'quiet' }; }
  }

  // Your devices on Tailscale, each with whether a Bob answered there and whether he's already in your list.
  // 1.5.213: with "Also over the home network" on, also knocks across this replicant matrix's own home network
  // (its /24 at most) and lists only the addresses where a Bob answered. No Tailscale needed.
  async find() {
    const peers = await this.peers();
    const port = this.cfg.port || 7777;
    const rows = [];
    if (peers) {
      const online = peers.filter((p) => p.online).slice(0, 20);
      // PC check 1.5.214: this Bob's own port first, then the usual 7777 (a test Bob on :7799 still finds the usual ones).
      const seen = await Promise.all(online.map(async (p) => {
        let h = await this.knock(p.ip, port), at = port;
        if (!h.bob && port !== 7777) { const h2 = await this.knock(p.ip, 7777); if (h2.bob || (h2.why === 'door' && h.why !== 'door')) { h = h2; at = 7777; } }
        return { ...h, at };
      }));
      online.forEach((p, i) => { const { at, ...h } = seen[i]; if (!h.self) rows.push({ ...h, name: h.name || p.name, device: p.name, os: p.os, address: `${p.ip}:${at}`, via: 'tailscale' }); });
    }
    const home = homeOn(this.cfg) ? await this.scanHome(port) : null;
    for (const h of home || []) rows.push({ ...h, device: h.name || h.address.split(':')[0], os: '', via: 'home' });
    if (!peers && !home) return { tailscale: false, home: false, bobs: [] };
    return { tailscale: Boolean(peers), home: Boolean(home), bobs: this.group(rows), offline: (peers || []).filter((p) => !p.online).map((p) => p.name) };
  }

  // 1.5.214 (the owner: "if you have a home network it should just work, tailscale is the fall back for being
  // mobile"): one row per Bob, however many addresses he answered on (the Go on two home addresses and Tailscale).
  // The address Pair uses is the home one when the home network is on, so pairing saves it and works with Tailscale
  // off; his other addresses ride along. A Bob already paired by his Tailscale address gets his home address saved
  // too (src/share-brains.js Lenders tries it first), so he keeps working when Tailscale is off.
  group(rows) {
    const groups = new Map();
    const host = (x) => String(x || '').split('.')[0].toLowerCase();
    // Rows that answered group by their hello id (else name); a Tailscale device that didn't answer joins the row of
    // the Bob with the same computer name, so no "No Bob answering" row sits beside his home row (PC check 1.5.214).
    const later = [];
    for (const r of rows) {
      if (!r.id && !r.bob && r.via === 'tailscale') { later.push(r); continue; }
      const key = r.id ? `id:${r.id}` : r.bob && r.name ? `name:${host(r.name)}` : `at:${r.address}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(r);
    }
    for (const r of later) {
      const mate = [...groups.values()].find((list) => list.some((x) => x.name && host(x.name) === host(r.device)));
      if (mate) mate.push(r); else groups.set(`at:${r.address}`, [r]);
    }
    const homeFirst = homeOn(this.cfg);
    const rank = (r) => (r.bob && !r.needsUpdate && r.pair >= 1 ? 0 : 2) + (homeFirst ? (r.via === 'home' ? 0 : 1) : (r.via === 'home' ? 1 : 0));
    const saved = this.cfg.share?.borrow?.bobs || [];
    let changed = false;
    const out = [];
    for (const list of groups.values()) {
      const all = list.slice().sort((a, b) => rank(a) - rank(b));
      const top = all[0], addrs = [...new Set(all.map((r) => r.address))];
      const homeAt = all.find((r) => r.via === 'home' && r.bob && !r.needsUpdate)?.address || '';
      const tsRow = all.find((r) => r.via === 'tailscale');
      // His saved entry: by any of his addresses, or a Tailscale entry under his name.
      const entry = saved.find((x) => addrs.includes(x.address)) || (top.bob && top.name ? saved.find((x) => x.name === top.name && isTailscaleIp(String(x.address).split(':')[0])) : null);
      if (entry && homeAt && homeAt !== entry.address && entry.home !== homeAt) { entry.home = homeAt; changed = true; }
      out.push({ ...top, device: tsRow?.device || top.name || top.device, os: tsRow?.os || top.os || '', also: addrs.filter((a) => a !== top.address), paired: Boolean(entry), pairing: this.outgoing.get(top.address) || null });
    }
    if (changed) { try { saveShare(this.cfg, this.cfg.share); this.log('settings', 'Bob-Net: saved the home-network address of an already paired Bob, so he works without Tailscale'); } catch {} }
    return out;
  }

  // PC check 1.5.213: never this computer itself (any of its own addresses, or a hello carrying our own id), no
  // 169.254 sweep (see share-card.js scanIps), and the usual port 7777 too, so a Bob on another port still finds them.
  async scanHome(port) {
    const nets = this.home().filter((m) => !isLinkLocal(m.address)).slice(0, SCAN_NETS);
    const own = new Set(this.home().map((m) => m.address));
    for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) own.add(n.address);
    const list = [...new Set(nets.flatMap((n) => scanList(n)))].filter((ip) => !own.has(ip));
    const ports = [...new Set([port, 7777])];
    const tries = list.flatMap((ip) => ports.map((p) => [ip, p]));
    const out = [];
    for (let i = 0; i < tries.length; i += SCAN_AT_ONCE) {
      const part = tries.slice(i, i + SCAN_AT_ONCE);
      const seen = await Promise.all(part.map(([ip, p]) => this.knock(ip, p, SCAN_HELLO_MS)));
      // PC check: a Bob that can't pair over the home network yet (older than 1.5.213, or its door shut there) is still
      // listed, so people see their un-updated Bobs.
      part.forEach(([ip, p], j) => { const h = seen[j]; if ((h.bob && !h.self) || h.old) out.push({ address: `${ip}:${p}`, ...h, ...(h.old || (h.bob && !h.seal) ? { needsUpdate: true } : {}) }); });
    }
    return out;
  }

  // Ask one Bob. Returns at once with the number to match; the answer is collected in the background.
  // 1.5.123 { token, by }: pairing by introduction (Pass my Bob-Net along): the token goes with the ask, no card there.
  async pairWith(addressIn, { token, by } = {}) {
    const address = cleanAddress(addressIn) || (homeOn(this.cfg) ? cleanHomeAddress(addressIn, this.home()) : null);
    if (!address) return { error: BAD_ADDRESS(this.cfg).replace(/:7777/g, '') };
    const home = !cleanAddress(addressIn);
    const cur = this.outgoing.get(address);
    if (cur?.state === 'waiting') return Pairing.view(address, cur);
    const mine = home ? this.homeMine(address.split(':')[0]) : this.ownAddresses()[0];
    if (!mine) return { error: 'This replicant matrix isn\'t on Tailscale right now. Open Tailscale and sign in, then try again.' };
    let code = matchCode();
    const key = oneTimeKey();
    let r, j;
    try {
      r = await this.fetch(`http://${address}/api/pair/ask`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ pair: PAIR, name: myName(), address: mine, code, commit: commitOf(key.pub), ...(token ? { token } : {}) }) });
      j = await r.json().catch(() => ({}));
    } catch { return { error: 'No Bob answered there. Is Bob open on it, with "Let my other replicant matrices in" on?' }; }
    // PC check 1.5.213: an older Bob (before 1.5.213) has no "Also over the home network" switch to turn on.
    if (r.status === 403) return { error: home ? OLD_OR_SHUT : 'That Bob\'s door is shut. Turn on "Let my other replicant matrices in" there, then press Pair again.' };
    if (r.status === 404) return { error: 'That Bob is too old to pair. Update him, or add him by hand under More.' };
    if (!r.ok || !j.id) return { error: j.error || `That Bob said no (${r.status}).` };
    // Sealed pairing: the number comes from both keys; ours goes over now so his card can show it.
    let sealWith = null;
    if (j.pub) {
      const k = sealKey(key.priv, j.pub, key.pub, String(j.pub));
      if (!k) return { error: 'That Bob sent a broken pairing key. Press Pair again.' };
      sealWith = k.key; code = k.number;
      try { await this.fetch(`http://${address}/api/pair/status`, { method: 'POST', redirect: 'manual', signal: AbortSignal.timeout(4000), headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ id: j.id, pub: key.pub }) }); } catch {}
    } else if (home) return { error: 'That Bob is too old to pair over the home network. Update him to 1.5.213 or newer.' };
    const job = { state: 'waiting', code, since: this.now(), by: by || undefined, seal: sealWith };
    this.outgoing.set(address, job);
    this.collect(address, j.id, job).catch((e) => { job.state = 'failed'; job.why = String(e.message || e).slice(0, 120); });
    return Pairing.view(address, job);
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
      const box = job.seal ? unseal(job.seal, s.sealed) : s;
      if (!box) { job.state = 'failed'; job.why = 'The passcode didn\'t arrive safely. Press Pair again.'; return; }
      const them = String(box.passcode || '');
      const name = clean(s.name) || address.split(':')[0];
      const out = cleanSharePatch(this.cfg, { addBob: { name, address, passcode: them } }, { home: this.home });
      if (out.error) { job.state = 'failed'; job.why = out.error; await post('/api/pair/finish', { id }); return; }
      saveShare(this.cfg, out.share);
      if (KEY_RE.test(String(box.linkKey || ''))) saveLinkKey(this.cfg, address, box.linkKey); // an older Bob sends none: made at the first lend
      // Ours goes over only now, after their yes, and only if our door is open (else they couldn't use it anyway).
      const ours = doorOpen(this.cfg) ? String(this.cfg.remote.passcode) : '';
      await post('/api/pair/finish', job.seal ? { id, sealed: seal(job.seal, { passcode: ours }) } : { id, passcode: ours });
      Object.assign(job, { state: 'paired', name, both: Boolean(ours) });
      this.log('bob-net', `paired with ${name}${ours ? ' (both ways)' : ' (one way: this door is off)'}${job.by ? `, introduced by ${job.by}` : ''}`);
      this.broadcast({ type: 'pair-done', name, both: Boolean(ours), asker: true, by: job.by });
      return;
    }
    job.state = 'timeout';
  }

  outgoingView() { return Object.fromEntries([...this.outgoing].map(([a, j]) => [a, { state: j.state, code: j.code, name: j.name, both: j.both, why: j.why, by: j.by }])); }
  // What pairWith hands the page: never the seal key.
  static view(address, j) { return { address, state: j.state, code: j.code, since: j.since, by: j.by }; }
}
