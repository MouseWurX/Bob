// Bob-Net: spread one brain over several of your Bobs' graphics cards (llama.cpp's RPC server). Both halves are off
// unless you turn them on. The asking always goes through the door over Tailscale, like the rest of Bob-Net; the
// brain's numbers then go over the home network when both Bobs are on it ("Use the home network first", the owner's
// pick: quicker, with Tailscale as the backup), else over Tailscale.
//
// "Lend my graphics card" (this Bob lends): another Bob of yours may ask, through the door "Let my other replicant
// matrices in" opens (passcode cookie, Tailscale only), for a share of this replicant matrix's card. Bob then starts
// ggml-rpc-server on this machine only (127.0.0.1), and puts a gate in front of it on port 50052: on this machine's
// home-network address when the asker is on the same home network, else on its own Tailscale address (never 0.0.0.0,
// never a public address). The gate lets in the asking Bob's address and nothing else. The RPC server has no passcode
// of its own (llama.cpp says never to put it on an open network), which is why it's never reachable directly, only
// opens on request from a paired Bob, and only while it's needed: it stops when the asking Bob lets go, or after
// 3 minutes with no word from it. It says no while Gaming.
// What travels: the brain's weights and the numbers it works on, between your own Bobs over Tailscale. No chats, no
// files. The weights are kept in memory only while lent.
//
// "Spread big brains over my other Bobs' cards" (this Bob borrows): when a brain is loaded that's too big (the choice
// says what too big means), Bob asks each Bob on the list whose card is lent and adds the ones that say yes to the
// engine (--rpc). llama.cpp then puts part of the brain on each card. If none says yes, the brain loads here like always.
import { isTailscaleIp } from './phone-access.js';
import { findTool, missingWords } from './llama-tools.js';
import { spawn } from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';

export const RPC_PORT = 50052; // the gate other Bobs reach
export const INNER_PORT = 50053; // the card server itself, on 127.0.0.1 only
export const IDLE_MS = 3 * 60000; // a lent card with no word from the asker for this long is closed
export const KEEP_MS = 60000; // the asker says "still using it" this often
export const SPREAD = ['off', 'toobig', 'big'];
const DOWN_MS = 10 * 60000; // a Bob whose card failed a load isn't asked again for this long

export const lendCardOn = (cfg) => cfg.share?.lendCard === true && Boolean(cfg.remote?.enabled && String(cfg.remote?.passcode || '').length >= 6);
export const spreadOf = (cfg) => (SPREAD.includes(cfg.share?.spread) ? cfg.share.spread : 'off');
// This machine's own Tailscale addresses.
export const tailscaleIps = () => { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && isTailscaleIp(n.address)) out.push(n.address); return out; };
const plainIp = (a) => String(a || '').replace(/^::ffff:/i, '');

// ---------- The home network ----------
const quad = (a) => { const m = String(a || '').match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); return m && m.slice(1).every((x) => +x <= 255) ? m.slice(1).map(Number) : null; };
const num = (q) => ((q[0] << 24) >>> 0) + (q[1] << 16) + (q[2] << 8) + q[3];
// A home-network (private) address: 10.x, 172.16-31.x or 192.168.x. Tailscale's 100.64-127.x are not.
export const isHomeIp = (a) => { const q = quad(plainIp(a)); return Boolean(q && (q[0] === 10 || (q[0] === 172 && q[1] >= 16 && q[1] <= 31) || (q[0] === 192 && q[1] === 168))); };
export const sameNet = (a, b, mask) => { const x = quad(plainIp(a)), y = quad(plainIp(b)), m = quad(mask); return Boolean(x && y && m && (num(x) & num(m)) === (num(y) & num(m))); };
// This machine's own home-network addresses: [{ address, netmask }].
export const homeIps = (ifaces = os.networkInterfaces()) => { const out = []; for (const list of Object.values(ifaces)) for (const n of list || []) if (n.family === 'IPv4' && !n.internal && isHomeIp(n.address)) out.push({ address: n.address, netmask: n.netmask || '255.255.255.0' }); return out; };
// Mine and theirs on the same home network: { host (mine), peer (theirs) }, or null.
export function pickHome(mine, theirs) {
  for (const m of mine || []) for (const t of theirs || []) if (isHomeIp(t) && sameNet(m.address, t, m.netmask)) return { host: m.address, peer: plainIp(t) };
  return null;
}
export const homeFirst = (cfg) => cfg.share?.homeNet !== false; // on unless switched off (it only matters with the card lent or spread)
export const admit = (allow, remote) => Boolean(allow) && plainIp(remote) === allow;

// The gate: listens on host:port and passes only `allow` through to the card server on 127.0.0.1. Gives { close }.
export function openGate({ host, port = RPC_PORT, allow, inner = INNER_PORT, log = () => {} }) {
  return new Promise((resolve, reject) => {
    const socks = new Set();
    const srv = net.createServer((sock) => {
      if (!admit(allow, sock.remoteAddress)) { log('bob-net', `lent graphics card: turned away ${plainIp(sock.remoteAddress)}`); sock.destroy(); return; }
      const up = net.connect({ host: '127.0.0.1', port: inner });
      for (const s of [sock, up]) { socks.add(s); s.setNoDelay(true); s.once('close', () => socks.delete(s)); s.on('error', () => { sock.destroy(); up.destroy(); }); }
      sock.pipe(up); up.pipe(sock);
    });
    srv.once('error', reject);
    srv.listen(port, host, () => { srv.off('error', reject); resolve({ port: srv.address().port, close: () => { srv.close(); for (const s of socks) s.destroy(); } }); });
  });
}

// Does this brain go over other cards? 'toobig': bigger than this card and memory can hold together (a few GB kept
// for the system). 'big': anything that wouldn't fit on this card alone.
export function wantsSpread(cfg, { sizeGB, cardGB = Number(cfg.gpuVramGB) || Number(cfg.cardGB) || 0, ramGB = os.totalmem() / 1e9 } = {}) {
  const how = spreadOf(cfg);
  if (how === 'off' || !(sizeGB > 0)) return false;
  // 1.5.195: built-in graphics share the memory (the handheld), and an unknown card can't be judged, so "bigger than
  // my card" counts only on a real card. There, and on 'toobig', a brain that fits this machine stays here: the
  // handheld spread its own 2.3 GB chat brain over Wi-Fi to another Bob's card, and its chats waited behind that.
  if (how === 'big' && cardGB > 0 && cfg.sharedGraphics !== true) return sizeGB > cardGB * 0.9;
  return sizeGB > (cfg.sharedGraphics === true ? 0 : cardGB * 0.9) + Math.max(0, ramGB - 8);
}

// ---------- Lending ----------
export class CardLender {
  constructor(cfg, { spawnFn = spawn, tool = () => findTool(cfg, 'rpc'), ips = tailscaleIps, home = homeIps, gate = openGate, gaming = () => false, now = Date.now, log = () => {} } = {}) {
    Object.assign(this, { cfg, spawnFn, tool, ips, home, gate, gaming, now, log });
    this.child = null; this.gateway = null; this.host = ''; this.allow = ''; this.via = ''; this.port = 0; this.last = 0; this.from = ''; this.timer = null;
  }

  // Why not, or ''. localAddr: the address the request came in on.
  refusal(localAddr) {
    if (!lendCardOn(this.cfg)) return 'off';
    if (this.gaming()) return 'gaming';
    const ip = plainIp(localAddr);
    // Asked through the door: on its Tailscale address, or on its home-network address with "Also over the home network" on.
    const door = (isTailscaleIp(ip) && this.ips().includes(ip)) || (this.cfg.remote?.homeNet === true && this.home().some((m) => m.address === ip));
    if (!door) return 'not tailscale';
    if (!this.tool().found) return 'no tool';
    return '';
  }

  view() { return { lending: Boolean(this.child), to: this.from, via: this.via, since: this.child ? this.last : 0 }; }

  // localAddr / remoteAddr: the two ends of the door request (over Tailscale). home: the asker's home-network
  // addresses, when it would like the home network.
  async open({ localAddr, remoteAddr, from = '', home = [] } = {}) {
    const why = this.refusal(localAddr);
    if (why) return { ok: false, why, error: why === 'no tool' ? missingWords('rpc') : why };
    const near = homeFirst(this.cfg) && Array.isArray(home) ? pickHome(this.home(), home.slice(0, 8)) : null;
    const host = near ? near.host : plainIp(localAddr), allow = near ? near.peer : plainIp(remoteAddr), via = near || isHomeIp(host) ? 'home' : 'tailscale';
    if (!allow) return { ok: false, why: 'failed', error: 'Bob couldn\'t tell who was asking.' };
    if (this.child && this.host === host && this.allow === allow) { this.keep(); return { ok: true, host, port: this.port, via }; }
    this.close();
    const t = this.tool();
    const child = this.spawnFn(t.path, ['-H', '127.0.0.1', '-p', String(INNER_PORT), '-c'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(t.path) });
    let out = '';
    const ready = await new Promise((resolve) => {
      const done = (v) => { clearTimeout(timer); resolve(v); };
      const look = (d) => { out = (out + d).slice(-4000); if (/endpoint|Starting RPC server|accepting/i.test(out)) done(true); };
      child.stdout?.on('data', look); child.stderr?.on('data', look);
      child.once('error', () => done(false));
      child.once('exit', () => done(false));
      const timer = setTimeout(() => done(child.exitCode === null), 5000); // no banner, still running: count it
    });
    if (!ready) { try { child.kill(); } catch {} return { ok: false, why: 'failed', error: `The card-sharing server didn't start${out ? ` (${out.trim().split(/\r?\n/).pop().slice(0, 160)})` : ''}.` }; }
    let gateway;
    try { gateway = await this.gate({ host, port: RPC_PORT, allow, inner: INNER_PORT, log: this.log }); }
    catch (e) { try { child.kill(); } catch {} return { ok: false, why: 'failed', error: `The card-sharing gate didn't open on ${host}:${RPC_PORT} (${String(e.message || e).slice(0, 120)}).` }; }
    child.once('exit', () => { if (this.child === child) { this.close(); this.log('bob-net', 'lent graphics card: the card-sharing server stopped'); } });
    Object.assign(this, { child, gateway, host, allow, via, port: RPC_PORT, from: String(from).slice(0, 40) });
    this.keep();
    this.log('bob-net', `lent graphics card to ${this.from || 'another Bob'} over ${via === 'home' ? 'the home network' : 'Tailscale'} (${host}:${RPC_PORT}, only ${allow} let in)`);
    return { ok: true, host, port: RPC_PORT, via };
  }

  keep() {
    if (this.child && (this.gaming() || !lendCardOn(this.cfg))) { this.log('bob-net', 'lent graphics card: taken back (Gaming, or the switch is off)'); this.close(); return false; }
    this.last = this.now();
    clearTimeout(this.timer);
    this.timer = setTimeout(() => { if (this.child) { this.log('bob-net', 'lent graphics card: no word for 3 minutes, closed'); this.close(); } }, IDLE_MS);
    this.timer.unref?.();
    return Boolean(this.child);
  }

  close() {
    clearTimeout(this.timer); this.timer = null;
    const c = this.child, g = this.gateway; this.child = null; this.gateway = null; this.host = ''; this.allow = ''; this.via = ''; this.port = 0; this.from = '';
    try { g?.close(); } catch {}
    if (c && c.exitCode === null) { try { c.kill(); } catch {} }
  }
}

// POST /api/lend/card { action: 'open' | 'keep' | 'close', from }. Only through the door (or this machine itself).
export function lendCardRoute(lender, req, b = {}) {
  const action = ['open', 'keep', 'close'].includes(b.action) ? b.action : '';
  if (!action) return Promise.resolve({ status: 400, body: { error: 'no' } });
  if (action === 'keep') return Promise.resolve({ status: 200, body: { ok: lender.keep() } });
  if (action === 'close') { lender.close(); return Promise.resolve({ status: 200, body: { ok: true } }); }
  return lender.open({ localAddr: req.socket?.localAddress, remoteAddr: req.socket?.remoteAddress, from: b.from, home: Array.isArray(b.home) ? b.home.map(String) : [] }).then((r) => ({ status: 200, body: r }));
}

// ---------- Borrowing ----------
export class CardBorrower {
  // lenders: the Bob-Net list (src/share-brains.js Lenders: bobs(), call()).
  constructor(cfg, lenders, { now = Date.now, log = () => {}, name = () => os.hostname(), home = homeIps } = {}) {
    Object.assign(this, { cfg, lenders, now, log, name, home });
    this.using = []; this.down = new Map(); this.homeDown = new Map(); this.timer = null;
  }

  // The helpers for one load: ['host:50052', ...], or [] (load here like always). Each Bob is asked over Tailscale;
  // his card is reached over the home network when we're both on it, else over Tailscale.
  async open({ sizeGB } = {}) {
    this.close();
    if (!wantsSpread(this.cfg, { sizeGB })) return [];
    const bobs = (this.lenders?.bobs?.() || []).filter((b) => !(this.down.get(b.address) > this.now()));
    const here = this.home(), mine = homeFirst(this.cfg) ? here : [];
    const tries = await Promise.all(bobs.map(async (bob) => {
      try {
        const home = this.homeDown.get(bob.address) > this.now() ? [] : mine.map((m) => m.address);
        const r = await this.lenders.call(bob, '/api/lend/card', { method: 'POST', body: { action: 'open', from: this.name(), home }, timeout: 8000 });
        const j = await r.json().catch(() => ({}));
        const host = bob.address.split(':')[0];
        if (!(r.ok && j.ok && Number(j.port) > 0)) return null;
        // Over the home network: his gate must be on our own home network. Otherwise on the Tailscale address we reach him on.
        if (j.via === 'home') return here.some((m) => isHomeIp(j.host) && sameNet(m.address, j.host, m.netmask)) ? { bob, via: 'home', at: `${j.host}:${Number(j.port)}` } : null;
        if (j.host === host || !isTailscaleIp(host)) return { bob, via: 'tailscale', at: `${j.host}:${Number(j.port)}` };
        return null;
      } catch { return null; }
    }));
    this.using = tries.filter(Boolean);
    if (!this.using.length) { this.log('bob-net', 'spread a brain: none of my other Bobs lent a card, so it loads here'); return []; }
    this.log('bob-net', `spread a brain over ${this.using.map((x) => `${x.bob.name} (${x.via === 'home' ? 'home network' : 'Tailscale'})`).join(', ')}`);
    this.timer = setInterval(() => { for (const u of this.using) this.lenders.call(u.bob, '/api/lend/card', { method: 'POST', body: { action: 'keep' }, timeout: 5000 }).catch(() => {}); }, KEEP_MS);
    this.timer.unref?.();
    return this.using.map((x) => x.at);
  }

  // The load failed with helpers. route: it couldn't reach the card, so over the home network the next try goes over
  // Tailscale. Anything else (no room on his card, or too slow): not asked again for a while either way, so a failed
  // spread doesn't wake his card again over the other route right away (1.5.189).
  failed({ route = false } = {}) { for (const u of this.using) (route && u.via === 'home' ? this.homeDown : this.down).set(u.bob.address, this.now() + DOWN_MS); this.close(); }

  view() { return this.using.map((u) => u.bob.name); }

  close() {
    clearInterval(this.timer); this.timer = null;
    const was = this.using; this.using = [];
    for (const u of was) this.lenders.call(u.bob, '/api/lend/card', { method: 'POST', body: { action: 'close' }, timeout: 5000 }).catch(() => {});
  }
}
