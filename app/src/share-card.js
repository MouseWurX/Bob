// Bob-Net: spread one brain over several of your Bobs' graphics cards (llama.cpp's RPC server). Both halves are off
// unless you turn them on, and both are Tailscale only, like the rest of Bob-Net.
//
// "Lend my graphics card" (this Bob lends): another Bob of yours may ask, through the door "Let my other replicant
// matrices in" opens (passcode cookie), for a share of this replicant matrix's card. Bob then starts ggml-rpc-server
// bound to this machine's own Tailscale address only (never 0.0.0.0, never a home-network or public address), on port
// 50052, and stops it when the asking Bob lets go, or after 3 minutes with no word from it. The RPC server has no
// passcode of its own (llama.cpp says never to put it on an open network), which is why it only ever opens on request
// from a paired Bob, only on the Tailscale address, and only while it's needed. It says no while Gaming.
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

export const RPC_PORT = 50052;
export const IDLE_MS = 3 * 60000; // a lent card with no word from the asker for this long is closed
export const KEEP_MS = 60000; // the asker says "still using it" this often
export const SPREAD = ['off', 'toobig', 'big'];
const DOWN_MS = 10 * 60000; // a Bob whose card failed a load isn't asked again for this long

export const lendCardOn = (cfg) => cfg.share?.lendCard === true && Boolean(cfg.remote?.enabled && String(cfg.remote?.passcode || '').length >= 6);
export const spreadOf = (cfg) => (SPREAD.includes(cfg.share?.spread) ? cfg.share.spread : 'off');
// This machine's own Tailscale addresses.
export const tailscaleIps = () => { const out = []; for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && isTailscaleIp(n.address)) out.push(n.address); return out; };
const plainIp = (a) => String(a || '').replace(/^::ffff:/i, '');

// Does this brain go over other cards? 'toobig': bigger than this card and memory can hold together (a few GB kept
// for the system). 'big': anything that wouldn't fit on this card alone.
export function wantsSpread(cfg, { sizeGB, cardGB = Number(cfg.gpuVramGB) || Number(cfg.cardGB) || 0, ramGB = os.totalmem() / 1e9 } = {}) {
  const how = spreadOf(cfg);
  if (how === 'off' || !(sizeGB > 0)) return false;
  if (how === 'big') return sizeGB > cardGB * 0.9;
  return sizeGB > cardGB * 0.9 + Math.max(0, ramGB - 8);
}

// ---------- Lending ----------
export class CardLender {
  constructor(cfg, { spawnFn = spawn, tool = () => findTool(cfg, 'rpc'), ips = tailscaleIps, gaming = () => false, now = Date.now, log = () => {} } = {}) {
    Object.assign(this, { cfg, spawnFn, tool, ips, gaming, now, log });
    this.child = null; this.host = ''; this.port = 0; this.last = 0; this.from = ''; this.timer = null;
  }

  // Why not, or ''. localAddr: the address the request came in on.
  refusal(localAddr) {
    if (!lendCardOn(this.cfg)) return 'off';
    if (this.gaming()) return 'gaming';
    const ip = plainIp(localAddr);
    if (!isTailscaleIp(ip) || !this.ips().includes(ip)) return 'not tailscale';
    if (!this.tool().found) return 'no tool';
    return '';
  }

  view() { return { lending: Boolean(this.child), to: this.from, since: this.child ? this.last : 0 }; }

  async open({ localAddr, from = '' } = {}) {
    const why = this.refusal(localAddr);
    if (why) return { ok: false, why, error: why === 'no tool' ? missingWords('rpc') : why };
    const host = plainIp(localAddr);
    if (this.child && this.host === host) { this.keep(); return { ok: true, host, port: this.port }; }
    this.close();
    const t = this.tool();
    const child = this.spawnFn(t.path, ['-H', host, '-p', String(RPC_PORT), '-c'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(t.path) });
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
    child.once('exit', () => { if (this.child === child) { this.child = null; this.log('bob-net', 'lent graphics card: the card-sharing server stopped'); } });
    Object.assign(this, { child, host, port: RPC_PORT, from: String(from).slice(0, 40) });
    this.keep();
    this.log('bob-net', `lent graphics card to ${this.from || 'another Bob'} on ${host}:${RPC_PORT}`);
    return { ok: true, host, port: RPC_PORT };
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
    const c = this.child; this.child = null; this.host = ''; this.port = 0; this.from = '';
    if (c && c.exitCode === null) { try { c.kill(); } catch {} }
  }
}

// POST /api/lend/card { action: 'open' | 'keep' | 'close', from }. Only through the door (or this machine itself).
export function lendCardRoute(lender, req, b = {}) {
  const action = ['open', 'keep', 'close'].includes(b.action) ? b.action : '';
  if (!action) return Promise.resolve({ status: 400, body: { error: 'no' } });
  if (action === 'keep') return Promise.resolve({ status: 200, body: { ok: lender.keep() } });
  if (action === 'close') { lender.close(); return Promise.resolve({ status: 200, body: { ok: true } }); }
  return lender.open({ localAddr: req.socket?.localAddress, from: b.from }).then((r) => ({ status: 200, body: r }));
}

// ---------- Borrowing ----------
export class CardBorrower {
  // lenders: the Bob-Net list (src/share-brains.js Lenders: bobs(), call()).
  constructor(cfg, lenders, { now = Date.now, log = () => {}, name = () => os.hostname() } = {}) {
    Object.assign(this, { cfg, lenders, now, log, name });
    this.using = []; this.down = new Map(); this.timer = null;
  }

  // The helpers for one load: ['100.x.y.z:50052', ...], or [] (load here like always).
  async open({ sizeGB } = {}) {
    this.close();
    if (!wantsSpread(this.cfg, { sizeGB })) return [];
    const bobs = (this.lenders?.bobs?.() || []).filter((b) => !(this.down.get(b.address) > this.now()));
    const tries = await Promise.all(bobs.map(async (bob) => {
      try {
        const r = await this.lenders.call(bob, '/api/lend/card', { method: 'POST', body: { action: 'open', from: this.name() }, timeout: 8000 });
        const j = await r.json().catch(() => ({}));
        const host = bob.address.split(':')[0];
        // His card server must be on the same Tailscale address we reach him on.
        if (r.ok && j.ok && Number(j.port) > 0 && (j.host === host || !isTailscaleIp(host))) return { bob, at: `${j.host}:${Number(j.port)}` };
        return null;
      } catch { return null; }
    }));
    this.using = tries.filter(Boolean);
    if (!this.using.length) { this.log('bob-net', 'spread a brain: none of my other Bobs lent a card, so it loads here'); return []; }
    this.log('bob-net', `spread a brain over ${this.using.map((x) => x.bob.name).join(', ')}`);
    this.timer = setInterval(() => { for (const u of this.using) this.lenders.call(u.bob, '/api/lend/card', { method: 'POST', body: { action: 'keep' }, timeout: 5000 }).catch(() => {}); }, KEEP_MS);
    this.timer.unref?.();
    return this.using.map((x) => x.at);
  }

  // The load failed with helpers: don't ask them again for a while.
  failed() { for (const u of this.using) this.down.set(u.bob.address, this.now() + DOWN_MS); this.close(); }

  view() { return this.using.map((u) => u.bob.name); }

  close() {
    clearInterval(this.timer); this.timer = null;
    const was = this.using; this.using = [];
    for (const u of was) this.lenders.call(u.bob, '/api/lend/card', { method: 'POST', body: { action: 'close' }, timeout: 5000 }).catch(() => {});
  }
}
