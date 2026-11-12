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
import { sealOn, sealAsk, cleanSealAsk, lenderSeal, borrowerSeal, keysEnv } from './scut-seal.js'; // sealed SCUT packets (0006)
import { isTailscaleIp } from './phone-access.js';
import { findTool, missingWords } from './llama-tools.js';
import { spawn } from 'node:child_process';
import { LinkLog } from './link-log.js'; // what the link carried, kept in bob-net-link.log and the logbook
import { safeSpawn } from './engine-blocked.js'; // 1.5.203: a blocked program comes back as 'error', not a throw
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import dgram from 'node:dgram';
import fs from 'node:fs';

export const RPC_PORT = 50052; // the gate other Bobs reach
export const INNER_PORT = 50053; // the card server itself, on 127.0.0.1 only
export const IDLE_MS = 3 * 60000; // a lent card with no word from the asker for this long is closed
export const KEEP_MS = 60000; // the asker says "still using it" this often
export const SPREAD = ['off', 'toobig', 'big'];
const DOWN_MS = 10 * 60000; // a Bob whose card failed a load isn't asked again for this long

// SCUT (Brain Engine patch 0005): Bob's own fast link for the brain's numbers, off unless switched on. Both Bobs need it
// on; the engines agree on it when they connect and stay on the usual link (TCP) if either side doesn't, or if the
// UDP path doesn't answer. It paces itself under a speed cap so the rest of the home network isn't crowded.
export const SCUT_MBPS = [50, 100, 300, 400];
export const scutOn = (cfg) => cfg.share?.scut === true;
// Sealed SCUT packets (Brain Engine 0006, src/scut-seal.js): on with SCUT unless "Seal SCUT packets" is switched off.
export const scutSealOn = (cfg) => scutOn(cfg) && sealOn(cfg);
export const SEED_MS = 20 * 60000; // the most a lender spends filling its card store from its own copy of a brain
const SEED_SPARE = 10e9; // the disk room a seed always leaves free

// Where the card server keeps the weights it was sent (llama.cpp's cache folder, then rpc), as the engine finds it.
export function cardStoreDir(env = process.env, platform = process.platform, home = os.homedir()) {
  if (env.LLAMA_CACHE) return path.join(env.LLAMA_CACHE, 'rpc');
  const base = platform === 'win32' ? env.LOCALAPPDATA || path.join(home, 'AppData', 'Local')
    : platform === 'darwin' ? path.join(home, 'Library', 'Caches') : env.XDG_CACHE_HOME || path.join(home, '.cache');
  return path.join(base, 'llama.cpp', 'rpc');
}

// "Send the brain early": this Bob's own copy of the brain another Bob is about to spread (same file name, same size),
// or ''. Looked for in Bob's brains folder and in the files picked with Equip; never anywhere else on the disk.
export function findOwnBrain(cfg, { file, bytes } = {}) {
  const name = path.basename(String(file || ''));
  if (!/\.gguf$/i.test(name) || !(Number(bytes) > 0)) return '';
  const root = cfg.bobModelsDir || path.join(cfg.agentDir || '.', 'models', 'bob');
  const tries = [];
  for (const v of Object.values(cfg.llamacpp?.models || {})) { const g = typeof v === 'string' ? v : v?.gguf; if (g) tries.push(g); }
  try { for (const d of fs.readdirSync(root, { withFileTypes: true })) if (d.isDirectory()) tries.push(path.join(root, d.name, name)); } catch {}
  return tries.find((p) => { try { return path.basename(p) === name && fs.statSync(p).size === Number(bytes) && !fs.existsSync(p + '.part'); } catch { return false; } }) || '';
}

// Free bytes on the drive that holds dir (or its nearest folder that exists), or -1 when unknown.
export function freeBytes(dir) {
  for (let d = dir, i = 0; i < 12; i++, d = path.dirname(d)) {
    try { const s = fs.statfsSync(d); return s.bavail * s.bsize; } catch {}
    if (path.dirname(d) === d) break;
  }
  return -1;
}

export const scutMbps = (cfg) => (SCUT_MBPS.includes(Number(cfg.share?.scutMbps)) ? Number(cfg.share.scutMbps) : 100);
// What the engine is started with. lend: the card server, behind the gate, says the gate's port (UDP too) in its offer.
export const scutEnv = (cfg, { lend = false } = {}) => (scutOn(cfg) ? { GGML_RPC_SCUT: '1', GGML_RPC_SCUT_MBPS: String(scutMbps(cfg)), ...(lend ? { GGML_RPC_SCUT_PUBLIC_PORT: String(RPC_PORT) } : {}) } : {});
// The link log (Brain Engine 0008, src/link-log.js): the engine says what the link carried every 10 seconds it's busy,
// or every 2 with "Watch the link live" on. For any lent card, with SCUT or on the usual link.
export const linkLive = (cfg) => cfg.share?.linkDebug === true;
export const linkEnv = (cfg) => ({ GGML_RPC_STATS: linkLive(cfg) ? '2' : '10' });
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
// udp (SCUT): the same port on UDP too, passed the same way: only `allow`'s datagrams go in, and the card server's
// answers go back to it. If UDP can't open, the gate still works and SCUT stays on TCP by itself.
export function openGate({ host, port = RPC_PORT, allow, inner = INNER_PORT, udp = false, log = () => {} }) {
  return new Promise((resolve, reject) => {
    const socks = new Set();
    const srv = net.createServer((sock) => {
      if (!admit(allow, sock.remoteAddress)) { log('bob-net', `lent graphics card: turned away ${plainIp(sock.remoteAddress)}`); sock.destroy(); return; }
      const up = net.connect({ host: '127.0.0.1', port: inner });
      for (const s of [sock, up]) { socks.add(s); s.setNoDelay(true); s.once('close', () => socks.delete(s)); s.on('error', () => { sock.destroy(); up.destroy(); }); }
      sock.pipe(up); up.pipe(sock);
    });
    srv.once('error', reject);
    srv.listen(port, host, async () => {
      srv.off('error', reject);
      const got = srv.address().port;
      const relay = udp ? await udpRelay({ host, port: got, allow, inner, log }).catch((e) => { log('bob-net', `lent graphics card: SCUT's UDP side didn't open (${String(e.message || e).slice(0, 80)}), so it stays on the usual link`); return null; }) : null;
      resolve({ port: got, udp: Boolean(relay), close: () => { srv.close(); for (const s of socks) s.destroy(); relay?.close(); } });
    });
  });
}

// The gate's UDP half: outer on host:port (only `allow` in), inner on 127.0.0.1 towards the card server.
export function udpRelay({ host, port, allow, inner = INNER_PORT, log = () => {} }) {
  return new Promise((resolve, reject) => {
    const outer = dgram.createSocket('udp4'), back = dgram.createSocket('udp4');
    let peer = null, turned = 0;
    const close = () => { for (const s of [outer, back]) { try { s.close(); } catch {} } };
    outer.on('message', (m, r) => {
      if (!admit(allow, r.address)) { if (turned++ === 0) log('bob-net', `lent graphics card: turned away UDP from ${plainIp(r.address)}`); return; }
      peer = { address: r.address, port: r.port };
      back.send(m, inner, '127.0.0.1');
    });
    back.on('message', (m) => { if (peer) outer.send(m, peer.port, peer.address); });
    for (const s of [outer, back]) s.on('error', () => {});
    outer.once('error', (e) => { close(); reject(e); });
    outer.bind(port, host, () => back.bind(0, '127.0.0.1', () => resolve({ port: outer.address().port, close })));
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
  constructor(cfg, { spawnFn = spawn, tool = () => findTool(cfg, 'rpc'), ips = tailscaleIps, home = homeIps, gate = openGate, gaming = () => false, now = Date.now, log = () => {}, env = process.env, findBrain = (b) => findOwnBrain(cfg, b), free = freeBytes, seedMs = SEED_MS } = {}) {
    Object.assign(this, { cfg, spawnFn, tool, ips, home, gate, gaming, now, log, env, findBrain, free, seedMs });
    this.seeded = this.loadSeeded(); this.seeding = null;
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

  get seededFile() { return this.cfg.dataDir ? path.join(this.cfg.dataDir, 'seeded-brains.json') : ''; }
  loadSeeded() { try { return new Set(JSON.parse(fs.readFileSync(this.seededFile, 'utf8')).filter((x) => typeof x === 'string').slice(-50)); } catch { return new Set(); } }

  // "Send the brain early" (with SCUT on): before the card server starts, fill its store from this machine's own copy
  // of the brain, so the first load doesn't push gigabytes over Wi-Fi. The asking Bob still offers each weight's
  // hash first and sends only what isn't here, so a copy that differs just means those weights travel as before.
  // Once per brain (remembered); never when the disk would be left with less than 10 GB.
  async seed(brain) {
    if (!scutOn(this.cfg) || !brain || typeof brain !== 'object') return '';
    const bytes = Number(brain.bytes), key = `${path.basename(String(brain.file || ''))}:${bytes}`;
    if (this.seeded.has(key)) return 'already';
    const file = this.findBrain({ file: brain.file, bytes });
    if (!file) return 'no copy';
    const room = this.free(cardStoreDir(this.env));
    if (room >= 0 && room < bytes + SEED_SPARE) { this.log('bob-net', `lent graphics card: not loading ${path.basename(file)} from this machine's own copy, the disk is too full`); return 'no room'; }
    if (this.seeding) return this.seeding;
    const t = this.tool();
    this.log('bob-net', `lent graphics card: loading ${path.basename(file)} from this machine's own copy first, so it doesn't cross the network`);
    this.seeding = new Promise((resolve) => {
      let child, out = '';
      try { child = safeSpawn(this.spawnFn, t.path, ['--seed', file, '-c'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(t.path), env: this.env }); }
      catch { resolve('failed'); return; }
      const look = (d) => { out = (out + d).slice(-2000); };
      child.stdout?.on('data', look); child.stderr?.on('data', look);
      const timer = setTimeout(() => { try { child.kill(); } catch {} }, this.seedMs);
      const done = (v) => { clearTimeout(timer); resolve(v); };
      child.once('error', () => done('failed'));
      child.once('exit', (code) => done(code === 0 ? 'seeded' : 'failed'));
    }).then((v) => {
      this.seeding = null;
      if (v === 'seeded') {
        this.seeded.add(key);
        try { if (this.seededFile) fs.writeFileSync(this.seededFile, JSON.stringify([...this.seeded].slice(-50))); } catch {}
        this.log('bob-net', `lent graphics card: ${path.basename(file)} is ready on this card's store`);
      } else this.log('bob-net', `lent graphics card: couldn't load ${path.basename(file)} from this machine's own copy, so it comes over the network as usual`);
      return v;
    });
    return this.seeding;
  }

  // localAddr / remoteAddr: the two ends of the door request (over Tailscale). home: the asker's home-network
  // addresses, when it would like the home network.
  // seal: the asker's cleanSealAsk() (sealed SCUT packets), or null from an older Bob.
  async open({ localAddr, remoteAddr, from = '', home = [], brain = null, seal = null } = {}) {
    const why = this.refusal(localAddr);
    if (why) return { ok: false, why, error: why === 'no tool' ? missingWords('rpc') : why };
    const near = homeFirst(this.cfg) && Array.isArray(home) ? pickHome(this.home(), home.slice(0, 8)) : null;
    const host = near ? near.host : plainIp(localAddr), allow = near ? near.peer : plainIp(remoteAddr), via = near || isHomeIp(host) ? 'home' : 'tailscale';
    if (!allow) return { ok: false, why: 'failed', error: 'Bob couldn\'t tell who was asking.' };
    if (this.child && this.host === host && this.allow === allow) { this.keep(); return { ok: true, host, port: this.port, via, ...(this.sealReply ? { seal: { salt: this.sealReply.salt } } : {}) }; }
    this.close();
    const seeded = await this.seed(brain);
    if (this.refusal(localAddr)) return { ok: false, why: this.refusal(localAddr), error: this.refusal(localAddr) }; // Gaming started (or the switch went off) while it filled
    const t = this.tool();
    // Sealed SCUT packets: this lend's key for the card server, made from the pair's link key and a fresh salt.
    const sealed = lenderSeal(this.cfg, { on: scutSealOn(this.cfg), ask: seal, asker: plainIp(remoteAddr), log: this.log });
    const child = safeSpawn(this.spawnFn, t.path, ['-H', '127.0.0.1', '-p', String(INNER_PORT), '-c'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], cwd: path.dirname(t.path), env: { ...this.env, ...scutEnv(this.cfg, { lend: true }), ...linkEnv(this.cfg), ...sealed.env } });
    let out = '';
    const link = new LinkLog(this.cfg, { who: 'lent card', log: this.log }); // the card server's [link] and [scut] lines, for as long as it runs
    const ready = await new Promise((resolve) => {
      const done = (v) => { clearTimeout(timer); resolve(v); };
      const look = (d) => { link.feed(d); out = (out + d).slice(-4000); if (/endpoint|Starting RPC server|accepting/i.test(out)) done(true); };
      child.stdout?.on('data', look); child.stderr?.on('data', look);
      child.once('error', () => done(false));
      child.once('exit', () => done(false));
      const timer = setTimeout(() => done(child.exitCode === null), 5000); // no banner, still running: count it
    });
    if (!ready) { try { child.kill(); } catch {} return { ok: false, why: 'failed', error: `The card-sharing server didn't start${out ? ` (${out.trim().split(/\r?\n/).pop().slice(0, 160)})` : ''}.` }; }
    let gateway;
    try { gateway = await this.gate({ host, port: RPC_PORT, allow, inner: INNER_PORT, udp: scutOn(this.cfg), log: this.log }); }
    catch (e) { try { child.kill(); } catch {} return { ok: false, why: 'failed', error: `The card-sharing gate didn't open on ${host}:${RPC_PORT} (${String(e.message || e).slice(0, 120)}).` }; }
    child.once('exit', () => { if (this.child === child) { this.close(); this.log('bob-net', 'lent graphics card: the card-sharing server stopped'); } });
    Object.assign(this, { child, gateway, host, allow, via, port: RPC_PORT, from: String(from).slice(0, 40), sealReply: sealed.reply });
    this.keep();
    this.log('bob-net', `lent graphics card to ${this.from || 'another Bob'} over ${via === 'home' ? 'the home network' : 'Tailscale'} (${host}:${RPC_PORT}, only ${allow} let in${gateway.udp ? `, SCUT ready${sealed.sealed ? ', sealed' : ''}` : ''})`);
    return { ok: true, host, port: RPC_PORT, via, ...(seeded ? { seeded } : {}), ...(sealed.reply ? { seal: sealed.reply } : {}) };
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
    const c = this.child, g = this.gateway; this.child = null; this.gateway = null; this.host = ''; this.allow = ''; this.via = ''; this.port = 0; this.from = ''; this.sealReply = null;
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
  return lender.open({ localAddr: req.socket?.localAddress, remoteAddr: req.socket?.remoteAddress, from: b.from, home: Array.isArray(b.home) ? b.home.map(String) : [], brain: cleanBrain(b.brain), seal: cleanSealAsk(b.seal) }).then((r) => ({ status: 200, body: r }));
}

// The brain an asking Bob is about to spread: { file: name only, bytes }, or null.
export function cleanBrain(b) {
  if (!b || typeof b !== 'object') return null;
  const file = path.basename(String(b.file || '')).slice(0, 200), bytes = Math.floor(Number(b.bytes));
  return /\.gguf$/i.test(file) && bytes > 0 && bytes < 2e12 ? { file, bytes } : null;
}

// ---------- Borrowing ----------
export class CardBorrower {
  // lenders: the Bob-Net list (src/share-brains.js Lenders: bobs(), call()).
  constructor(cfg, lenders, { now = Date.now, log = () => {}, name = () => os.hostname(), home = homeIps } = {}) {
    Object.assign(this, { cfg, lenders, now, log, name, home });
    this.using = []; this.down = new Map(); this.homeDown = new Map(); this.timer = null;
  }

  // Sealed SCUT packets: the keys llama-server needs for the lent cards in use (GGML_RPC_SCUT_KEYS), or {}.
  sealEnv() { return scutSealOn(this.cfg) ? keysEnv(this.using.filter((u) => u.key).map((u) => ({ at: u.at, key: u.key }))) : {}; }

  // The helpers for one load: ['host:50052', ...], or [] (load here like always). Each Bob is asked over Tailscale;
  // his card is reached over the home network when we're both on it, else over Tailscale.
  // file: the brain's own file here; with SCUT on, its name and size go along so a lender with its own copy loads
  // from that (the call then waits longer, as long as that takes).
  async open({ sizeGB, file = '' } = {}) {
    this.close();
    let brain = null;
    if (scutOn(this.cfg) && file) { try { brain = cleanBrain({ file, bytes: fs.statSync(file).size }); } catch {} }
    if (!wantsSpread(this.cfg, { sizeGB })) return [];
    const bobs = (this.lenders?.bobs?.() || []).filter((b) => !(this.down.get(b.address) > this.now()));
    const here = this.home(), mine = homeFirst(this.cfg) ? here : [];
    const tries = await Promise.all(bobs.map(async (bob) => {
      try {
        const home = this.homeDown.get(bob.address) > this.now() ? [] : mine.map((m) => m.address);
        const seal = scutSealOn(this.cfg) ? sealAsk(this.cfg, bob.address) : null;
        const r = await this.lenders.call(bob, '/api/lend/card', { method: 'POST', body: { action: 'open', from: this.name(), home, ...(brain ? { brain } : {}), ...(seal ? { seal } : {}) }, timeout: brain ? SEED_MS + 15000 : 8000 });
        const j = await r.json().catch(() => ({}));
        const host = bob.address.split(':')[0];
        if (!(r.ok && j.ok && Number(j.port) > 0)) return null;
        // Sealed SCUT packets: this lend's key from his salt, or 'off' (he doesn't seal, so no SCUT with him).
        const key = seal ? borrowerSeal(this.cfg, { address: bob.address, reply: j.seal && typeof j.seal === 'object' ? j.seal : null, asked: seal }) : '';
        if (key === 'off') this.log('bob-net', `${bob.name} doesn't seal SCUT packets, so his card uses the usual link`);
        // Over the home network: his gate must be on our own home network. Otherwise on the Tailscale address we reach him on.
        if (j.via === 'home') return here.some((m) => isHomeIp(j.host) && sameNet(m.address, j.host, m.netmask)) ? { bob, via: 'home', at: `${j.host}:${Number(j.port)}`, key } : null;
        if (j.host === host || !isTailscaleIp(host)) return { bob, via: 'tailscale', at: `${j.host}:${Number(j.port)}`, key };
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
