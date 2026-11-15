// Bob-Net file sharing and Brain Copying (Nov 14 2026). Off unless switched on: Settings, Bob-Net, "Files and brains",
// on both Bobs.
//
// Sending (Outbox): you pick a file, or a brain, and one of your Bobs. Only its name and size go to him: an offer, with a
// one-time token. Nothing else travels until his owner presses Yes on the card in his chat.
// Receiving (Inbox): after Yes, HE pulls the file from you, a piece at a time (CHUNK), through the same signed-in
// Bob-Net door every Bob-to-Bob call uses: the home network first, Tailscale as the fallback (Lenders.call). He writes
// it to name.part, so a dropped line, a Stop or a restart carries on from where it got to. At the end he checks the
// whole file's sha256 against yours, and only then gives it its real name. He never overwrites a file, and never starts
// unless his drive keeps SPARE free after it.
// A copied brain lands beside his other brains (Bob's brains folder: the catalogue's own category folder when it is a
// catalogue brain, else "from-my-bobs", added to Brains of your own), with its brain card (.bob.json) and picture
// reader (mmproj) when it has them. A copy with the same name and size there also lets him seed a lent card from his
// own copy (share-card.js findOwnBrain) instead of over the network.
// Speed: on Wi-Fi each side keeps under the SCUT speed cap (share-card.js scutMbps, 400 Mbit/s unless you picked
// another), so the rest of the home network isn't crowded. On a cable, no cap. While Gaming, both sides pause.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { freeBytes, scutMbps } from './share-card.js';
import { cardPathOf } from './own-models.js';

export const netFilesOn = (cfg) => cfg?.netFiles === true;
export const SPARE = 10e9; // the drive room a copy always leaves free (like share-card.js SEED_SPARE)
export const CHUNK = 256 * 2 ** 20; // one pull asks for this much at most
export const ASK_MS = 10 * 60000; // the Yes card waits this long
export const KEEP_MS = 3 * 24 * 3600e3; // the sender keeps an offer this long, so a stopped copy can carry on
export const MAX_FILES = 8;
export const MAX_BYTES = 2e12;
export const OFF = 'That Bob isn\'t taking files or brains. On that replicant matrix: Settings, Bob-Net, Files and brains.';
export const OWN_DIR = 'from-my-bobs';
const RETRIES = 12; // pulls in a row that fail with nothing new before the copy pauses itself

const str = (s, n) => String(s ?? '').replace(/[\u0000-\u001f<>"`]/g, '').replace(/\s+/g, ' ').trim().slice(0, n);
// A plain file name that works on Windows, Mac and Linux: no folders, no reserved names, no trailing dot or space.
export function cleanName(n) {
  const s = String(n ?? '').split(/[\\/]/).pop().replace(/[\u0000-\u001f<>:"|?*]/g, '').trim().replace(/[. ]+$/, '');
  if (!s || /^\.+$/.test(s) || s.length > 150) return '';
  if (/^(con|prn|aux|nul|com\d|lpt\d)(\.|$)/i.test(s)) return '';
  return s;
}
const hostOf = (a) => String(a || '').replace(/^::ffff:/, '').replace(/^\[|\](:\d+)?$/g, '').replace(/:\d+$/, '');
const gb = (b) => `${(b / 1e9).toFixed(b < 10e9 ? 1 : 0)} GB`;
const exists = (p) => { try { fs.statSync(p); return true; } catch { return false; } };
const sizeOf = (p) => { try { return fs.statSync(p).size; } catch { return -1; } };
const sleep = (ms, signal) => new Promise((r) => { const t = setTimeout(r, ms); signal?.addEventListener?.('abort', () => { clearTimeout(t); r(); }, { once: true }); });
const isWired = (k) => k === 'cable' || k === 'usbnet' || k === 'usb4';
// Is this side of the line on Wi-Fi? kind: the link one of this machine's own addresses sits on (links.js
// kindOfAddress), '' when it can't be told (a Tailscale address): then Wi-Fi when this machine has Wi-Fi up and no cable.
export function onWifi(kind, links) {
  if (kind) return kind === 'wifi';
  const up = (links?.list || []).filter((l) => l.up !== false);
  return up.some((l) => l.kind === 'wifi') && !up.some((l) => isWired(l.kind));
}
// Bytes a second under the cap, or 0 for no cap.
export const capOf = (cfg, wifi) => (wifi ? (scutMbps(cfg, { wired: false }) * 1e6) / 8 : 0);

// Keeps a stream under `rate` bytes a second (0: no cap). pace(n) after n bytes went: waits if ahead.
export function pacer(rate, { now = Date.now, wait = sleep } = {}) {
  const t0 = now(); let sent = 0;
  return async (n, signal) => { sent += n; if (!rate) return; const ahead = (sent / rate) * 1000 - (now() - t0); if (ahead > 20) await wait(ahead, signal); };
}

// sha256 of a whole file (or its first `upTo` bytes) as hex. onBytes(n) as it goes.
export function hashFile(file, { upTo = Infinity, onBytes = () => {}, signal } = {}) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(file, { highWaterMark: 4 * 2 ** 20, ...(Number.isFinite(upTo) ? { end: upTo - 1 } : {}) });
    signal?.addEventListener?.('abort', () => s.destroy(new Error('stopped')), { once: true });
    s.on('data', (b) => { h.update(b); onBytes(b.length); });
    s.once('error', reject);
    s.once('end', () => resolve(h.digest('hex')));
  });
}
// Same, but keeps the hash going so more can be added (a copy that carries on from its .part).
function hashSoFar(file, upTo, signal) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    if (!(upTo > 0)) return resolve(h);
    const s = fs.createReadStream(file, { end: upTo - 1, highWaterMark: 4 * 2 ** 20 });
    signal?.addEventListener?.('abort', () => s.destroy(new Error('stopped')), { once: true });
    s.on('data', (b) => h.update(b)); s.once('error', reject); s.once('end', () => resolve(h));
  });
}

// A free name in dir: "name.ext", else "name (2).ext", "name (3).ext"...
export function freeName(dir, name) {
  const ext = path.extname(name), stem = name.slice(0, name.length - ext.length);
  for (let i = 1; i < 1000; i++) { const n = i === 1 ? name : `${stem} (${i})${ext}`; if (!exists(path.join(dir, n)) && !exists(path.join(dir, n + '.part'))) return n; }
  return '';
}

// The files that make up a brain on this replicant matrix: the .gguf, its picture reader and its brain card beside it.
// gguf: the brain file; mmproj: its picture reader, if any. [{ path, name, bytes, role }]
export function brainFiles(gguf, mmproj = '') {
  const out = [];
  const add = (p, role) => { const b = sizeOf(p); if (b > 0 && !out.some((f) => f.path === p)) out.push({ path: p, name: path.basename(p), bytes: b, role }); };
  if (!/\.gguf$/i.test(String(gguf || ''))) return out;
  add(gguf, 'gguf');
  let card = null;
  try { const t = fs.readFileSync(cardPathOf(gguf), 'utf8'); if (t.length <= 65536) card = JSON.parse(t); } catch {}
  if (card) add(cardPathOf(gguf), 'card');
  const mm = mmproj || (card && typeof card.mmproj === 'string' && path.basename(card.mmproj) === card.mmproj ? path.join(path.dirname(gguf), card.mmproj) : '');
  if (mm && path.dirname(mm) === path.dirname(gguf)) add(mm, 'mmproj');
  return out;
}

// Which catalogue brain a file is, by its saved name and size: { category } or null. models: the catalogue's list.
export function catalogHome(models, name, bytes, saveNameOf = (f) => String(f.url || '').split('/').pop()) {
  const low = String(name).toLowerCase();
  for (const m of models || []) {
    if (!m?.category || !/^[\w-]+$/.test(m.category) || m.into) continue;
    for (const f of m.files || []) {
      if (!f?.url) continue;
      const n = (() => { try { return saveNameOf(f); } catch { return ''; } })();
      if (n.toLowerCase() === low && (!f.bytes || f.bytes === bytes)) return { category: m.category, id: m.id, sha256: f.verify && /^[0-9a-f]{64}$/.test(f.sha256 || '') ? f.sha256 : '' };
    }
  }
  return null;
}

// ---------- Sending ----------
export class Outbox {
  constructor(cfg, { lenders, log = () => {}, now = Date.now, gaming = () => false, linkKind = () => '', links = () => null, hash = hashFile, from = () => 'Bob' } = {}) {
    Object.assign(this, { cfg, lenders, log, now, gaming, linkKind, links, hash, from });
    this.offers = new Map(); this.hashes = new Map(); // id -> offer; `${path}|${bytes}|${mtime}` -> sha256 | Promise
    this.load();
  }
  get file() { return this.cfg.dataDir ? path.join(this.cfg.dataDir, 'bob-net-outbox.json') : ''; }
  load() {
    try {
      for (const o of JSON.parse(fs.readFileSync(this.file, 'utf8')) || []) if (o?.id && this.now() - o.at < KEEP_MS && ['offered', 'sending', 'paused'].includes(o.state)) this.offers.set(o.id, { ...o, state: o.state === 'sending' ? 'paused' : o.state });
    } catch {}
  }
  save() { if (this.file) { try { fs.writeFileSync(this.file, JSON.stringify([...this.offers.values()].slice(-40))); } catch {} } }

  // Offer a file or a brain to one of your Bobs. files: [{ path, role? }] on this replicant matrix.
  async send({ address, kind = 'file', title = '', files = [] }) {
    if (!netFilesOn(this.cfg)) return { error: 'Files and brains is off here. Settings, Bob-Net, Files and brains.' };
    const bob = (this.lenders?.bobs?.() || []).find((x) => x.address === address);
    if (!bob) return { error: 'That Bob isn\'t on your Bob-Net list.' };
    if (!['file', 'brain'].includes(kind)) return { error: 'Send a file or a brain.' };
    const list = [];
    for (const f of [].concat(files).slice(0, MAX_FILES)) {
      const p = String(f?.path || ''); const st = (() => { try { return fs.statSync(p); } catch { return null; } })();
      if (!p || !path.isAbsolute(p) || !st?.isFile()) return { error: `I can't find ${path.basename(p) || 'that file'} on this replicant matrix.` };
      if (!(st.size > 0)) return { error: `${path.basename(p)} is empty.` };
      const name = cleanName(path.basename(p));
      if (!name) return { error: `${path.basename(p)} has a name another computer can't use. Rename it first.` };
      list.push({ path: p, name, bytes: st.size, mtime: st.mtimeMs, role: ['gguf', 'mmproj', 'card'].includes(f.role) ? f.role : 'file', ...(/^[0-9a-f]{64}$/.test(f.sha256 || '') ? { sha256: f.sha256 } : {}) });
    }
    if (!list.length) return { error: 'Pick a file first.' };
    if (kind === 'brain' && !list.some((f) => f.role === 'gguf')) return { error: 'A brain needs its .gguf file.' };
    if (list.reduce((a, f) => a + f.bytes, 0) > MAX_BYTES) return { error: 'That\'s more than I send in one go.' };
    const id = crypto.randomBytes(8).toString('hex'), token = crypto.randomBytes(24).toString('hex');
    const o = { id, token, to: bob.address, toName: bob.name || bob.address, kind, title: str(title, 80) || list[0].name, files: list, at: this.now(), state: 'offered', upTo: list.map(() => 0) };
    let r;
    try { r = await this.lenders.call(bob, '/api/bob-net/files/offer', { method: 'POST', timeout: 15000, body: { id, token, from: str(this.from(), 40), kind, title: o.title, files: list.map(({ name, bytes, role }) => ({ name, bytes, role })) } }); }
    catch (e) { return { error: `Couldn't reach ${o.toName}: ${e.message}` }; }
    const j = await r.json().catch(() => ({}));
    if (r.status === 404) return { error: `${o.toName} is an older Bob that can't take files yet. Update him first.` };
    if (j?.off || r.status === 409) return { error: OFF.replace('That Bob', o.toName) };
    if (!j?.ok) return { error: j?.error || `${o.toName} didn't take it.` };
    this.offers.set(id, o); this.save();
    for (let n = 0; n < list.length; n++) this.hashOf(o, n).catch(() => {}); // ready by the time he's done
    this.log('bob-net', `offered ${kind === 'brain' ? 'the brain' : ''} ${o.title} (${gb(list.reduce((a, f) => a + f.bytes, 0))}) to ${o.toName}`);
    return { ok: true, id, to: o.toName };
  }

  find(id, token) {
    const o = this.offers.get(String(id || ''));
    if (!o || typeof token !== 'string' || token.length !== o.token.length || !crypto.timingSafeEqual(Buffer.from(token), Buffer.from(o.token))) return null;
    return o;
  }
  // The file's sha256: the catalogue's when it has one for this exact file, else worked out once and kept.
  hashOf(o, n) {
    const f = o.files[n];
    if (f.sha256) return Promise.resolve(f.sha256);
    const key = `${f.path}|${f.bytes}|${f.mtime}`;
    const had = this.hashes.get(key);
    if (typeof had === 'string') return Promise.resolve(had);
    if (had) return had;
    const p = this.hash(f.path).then((h) => { this.hashes.set(key, h); return h; }, (e) => { this.hashes.delete(key); throw e; });
    this.hashes.set(key, p);
    return p;
  }

  // GET /api/bob-net/files/get?id&token&n&at&len from the receiving Bob: a piece of the file, under the cap on Wi-Fi.
  async serve(q, res, { localAddress = '' } = {}) {
    const o = this.find(q.id, q.token);
    if (!o) return res.writeHead(410, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'That copy was stopped or is too old.', gone: true }));
    if (!netFilesOn(this.cfg)) return res.writeHead(409, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Files and brains was switched off over here.', off: true }));
    if (this.gaming()) return res.writeHead(503, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'Gaming over here: the copy waits.', wait: 'gaming' }));
    const n = Number(q.n), at = Number(q.at), f = o.files[n];
    const len = Math.min(Number(q.len) || CHUNK, CHUNK);
    if (!f || !Number.isInteger(at) || at < 0 || at >= f.bytes || !(len > 0)) return res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'bad piece' }));
    if (sizeOf(f.path) !== f.bytes) return res.writeHead(410, { 'content-type': 'application/json' }).end(JSON.stringify({ error: `${f.name} changed or is gone over here.`, gone: true }));
    const end = Math.min(f.bytes, at + len);
    o.state = 'sending'; o.seen = this.now();
    res.writeHead(200, { 'content-type': 'application/octet-stream', 'content-length': String(end - at), 'cache-control': 'no-store' });
    const pace = pacer(capOf(this.cfg, onWifi(this.linkKind(hostOf(localAddress)), this.links())));
    const s = fs.createReadStream(f.path, { start: at, end: end - 1, highWaterMark: 2 ** 20 });
    let gone = false; res.once('close', () => { gone = true; s.destroy(); });
    try {
      for await (const b of s) {
        if (gone) break;
        if (!res.write(b)) await new Promise((r) => { res.once('drain', r); res.once('close', r); });
        o.upTo[n] = Math.max(o.upTo[n] || 0, at + b.length);
        await pace(b.length);
      }
    } catch {}
    res.end();
  }
  async hashAnswer(q) {
    const o = this.find(q.id, q.token);
    if (!o) return { code: 410, error: 'That copy was stopped or is too old.', gone: true };
    const n = Number(q.n);
    if (!o.files[n]) return { code: 400, error: 'bad file' };
    const p = this.hashOf(o, n);
    const ready = await Promise.race([p, new Promise((r) => setTimeout(() => r(''), 2000))]).catch(() => 'failed');
    if (ready === 'failed') return { code: 500, error: `I couldn't read ${o.files[n].name} over here.` };
    return ready ? { code: 200, sha256: ready } : { code: 200, pending: true };
  }
  // The receiving Bob says how it went (done, no, stopped).
  said(q) {
    const o = this.find(q.id, q.token);
    if (!o) return { code: 410, gone: true };
    const what = ['done', 'no', 'stopped', 'failed'].includes(q.what) ? q.what : '';
    if (!what) return { code: 400, error: 'bad word' };
    if (what === 'stopped') o.state = 'paused';
    else { this.offers.delete(o.id); this.log('bob-net', `${o.toName} ${what === 'done' ? 'has his copy of' : what === 'no' ? 'said no to' : 'couldn\'t finish'} ${o.title}`); }
    this.last = { id: o.id, title: o.title, to: o.toName, what, at: this.now() };
    this.save();
    return { code: 200, ok: true };
  }
  // Stop from this side: the offer is taken back, so he can't carry on.
  async stop(id) {
    const o = this.offers.get(String(id || ''));
    if (!o) return { error: 'That copy is already over.' };
    this.offers.delete(o.id); this.save();
    const bob = (this.lenders?.bobs?.() || []).find((x) => x.address === o.to);
    if (bob) this.lenders.call(bob, '/api/bob-net/files/stop', { method: 'POST', timeout: 5000, body: { id: o.id, token: o.token } }).catch(() => {});
    this.log('bob-net', `stopped sending ${o.title} to ${o.toName}`);
    return { ok: true };
  }
  view() {
    return [...this.offers.values()].map((o) => ({ id: o.id, to: o.toName, kind: o.kind, title: o.title, state: o.state, total: o.files.reduce((a, f) => a + f.bytes, 0), sent: o.upTo.reduce((a, b) => a + b, 0), at: o.at }));
  }
}

// ---------- Receiving ----------
export class Inbox {
  // bobFrom(ip, name): which of my Bobs that is (net-cards.js). catalog(): the catalogue's models. addOwn({ name, gguf, mmproj }).
  constructor(cfg, { lenders, bobFrom = () => null, broadcast = () => {}, log = () => {}, now = Date.now, gaming = () => false, free = freeBytes, catalog = () => [], saveNameOf, addOwn = () => {}, linkKind = () => '', links = () => null, chunk = CHUNK, wait = sleep, retries = RETRIES } = {}) {
    Object.assign(this, { cfg, lenders, bobFrom, broadcast, log, now, gaming, free, catalog, saveNameOf, addOwn, linkKind, links, chunk, wait, retries });
    this.items = new Map(); this.runs = new Map(); this.lastSaid = 0;
    this.load();
  }
  get file() { return this.cfg.dataDir ? path.join(this.cfg.dataDir, 'bob-net-inbox.json') : ''; }
  load() {
    try {
      for (const it of JSON.parse(fs.readFileSync(this.file, 'utf8')) || []) {
        if (!it?.id) continue;
        if (it.state === 'asking' && this.now() - it.at > ASK_MS) continue;
        if (['copying', 'checking', 'waiting'].includes(it.state)) { it.state = 'paused'; it.why = 'Bob was closed mid-copy. Press Carry on.'; }
        this.items.set(it.id, it);
      }
    } catch {}
  }
  save() { if (this.file) { try { fs.writeFileSync(this.file, JSON.stringify([...this.items.values()].slice(-40).map(({ ctl, ...x }) => x))); } catch {} } }
  get folder() { return path.join(this.cfg.agentDir || '.', 'From my other Bobs'); }
  get brainsDir() { return this.cfg.bobModelsDir || path.join(this.cfg.agentDir || '.', 'models', 'bob'); }

  // POST /api/bob-net/files/offer from one of my Bobs. Shows the Yes card; nothing is fetched yet.
  receive(b, ip) {
    if (!netFilesOn(this.cfg)) return { code: 409, error: OFF, off: true };
    const bob = this.bobFrom(ip, str(b?.from, 40));
    if (!bob) return { code: 403, error: 'You aren\'t on my Bob-Net list. Pair us first.' };
    const id = String(b?.id || ''), token = String(b?.token || '');
    if (!/^[0-9a-f]{16}$/.test(id) || !/^[0-9a-f]{48}$/.test(token)) return { code: 400, error: 'bad offer' };
    if (this.items.has(id)) return { code: 200, ok: true, id };
    const kind = b?.kind === 'brain' ? 'brain' : 'file';
    const files = [];
    for (const f of [].concat(b?.files || []).slice(0, MAX_FILES)) {
      const name = cleanName(f?.name), bytes = Number(f?.bytes);
      if (!name || !Number.isSafeInteger(bytes) || bytes <= 0) return { code: 400, error: 'bad file in the offer' };
      if (files.some((x) => x.name.toLowerCase() === name.toLowerCase())) return { code: 400, error: 'two files with one name' };
      files.push({ name, bytes, role: kind === 'brain' && ['gguf', 'mmproj', 'card'].includes(f.role) ? f.role : 'file' });
    }
    if (!files.length) return { code: 400, error: 'The offer has no files.' };
    if (kind === 'brain' && (!files.some((f) => f.role === 'gguf') || files.some((f) => f.role === 'card' && f.bytes > 65536))) return { code: 400, error: 'That isn\'t a brain.' };
    const total = files.reduce((a, f) => a + f.bytes, 0);
    if (total > MAX_BYTES) return { code: 400, error: 'too big' };
    // Nov 14 (first real copy: the card said the owner's Windows name, not npc): the name on my own list says who it's from.
    const it = { id, token, from: bob.address, fromName: str(bob.name, 40) || str(b?.from, 40) || 'another of your Bobs', kind, title: str(b?.title, 80) || files[0].name, files, total, done: 0, at: this.now(), state: 'asking' };
    this.items.set(id, it); this.save();
    this.broadcast(this.card(it));
    this.log('bob-net', `${it.fromName} offers ${kind === 'brain' ? 'the brain ' : ''}${it.title} (${gb(total)}): waiting for your Yes`);
    return { code: 200, ok: true, id };
  }
  card(it) { return { type: 'net-file-ask', id: it.id, from: it.fromName, kind: it.kind, title: it.title, total: it.total, files: it.files.map((f) => ({ name: f.name, bytes: f.bytes })), room: this.room(it) }; }
  waiting() { return [...this.items.values()].filter((it) => it.state === 'asking' && this.now() - it.at < ASK_MS).map((it) => this.card(it)); }
  // Free room after the copy, in bytes (-1 when the drive can't be read).
  room(it) { const f = this.free(it.kind === 'brain' ? this.brainsDir : this.folder); return f < 0 ? -1 : f - this.left(it); }
  left(it) { return it.files.reduce((a, f) => a + (f.have ? 0 : f.bytes - Math.max(0, f.dest ? sizeOf(f.dest + '.part') : 0)), 0); }

  // Where each file goes. Never on top of another file: a brain whose name is taken goes in a folder of its own.
  plan(it) {
    if (it.kind === 'file') {
      fs.mkdirSync(this.folder, { recursive: true });
      for (const f of it.files) if (!f.dest) { const n = freeName(this.folder, f.name); if (!n) throw new Error(`no free name for ${f.name}`); f.dest = path.join(this.folder, n); }
      return;
    }
    if (it.files.every((f) => f.dest)) return;
    const g = it.files.find((f) => f.role === 'gguf');
    const home = catalogHome(this.catalog(), g.name, g.bytes, this.saveNameOf);
    let dir = path.join(this.brainsDir, home ? home.category : OWN_DIR);
    const taken = (d) => it.files.some((f) => { const s = sizeOf(path.join(d, f.name)); return (s >= 0 && s !== f.bytes) || exists(path.join(d, f.name + '.part')); });
    if (taken(dir)) { const sub = freeName(path.join(this.brainsDir, OWN_DIR), cleanName(`${it.title} from ${it.fromName}`) || it.id); dir = path.join(this.brainsDir, OWN_DIR, sub); it.own = true; }
    else it.own = !home;
    fs.mkdirSync(dir, { recursive: true });
    for (const f of it.files) { f.dest = path.join(dir, f.name); if (sizeOf(f.dest) === f.bytes) f.have = true; } // the same file is already here
    if (home) it.catalogId = home.id;
  }

  answer(id, yes) {
    const it = this.items.get(String(id || ''));
    if (!it || it.state !== 'asking') return { ok: false, why: 'That card is too old now.' };
    this.broadcast({ type: 'net-file-gone', id: it.id });
    if (!yes) { it.state = 'declined'; this.save(); this.tell(it, 'no'); return { ok: true }; }
    if (this.now() - it.at > ASK_MS) { it.state = 'declined'; this.save(); return { ok: false, why: 'That card is too old now. Ask for it to be sent again.' }; }
    return this.start(it);
  }
  start(it) {
    if (!netFilesOn(this.cfg)) return { ok: false, why: 'Files and brains is off here.' };
    if (this.runs.has(it.id)) return { ok: true };
    try { this.plan(it); } catch (e) { it.state = 'failed'; it.why = `I couldn't make room for it: ${e.message}`; this.save(); return { ok: false, why: it.why }; }
    const room = this.room(it);
    if (room >= 0 && room < SPARE) {
      it.state = 'paused'; it.why = `Not enough room: it needs ${gb(this.left(it))} and I keep ${gb(SPARE)} free, but the drive has ${gb(room + this.left(it))} free.`;
      this.save(); this.progress(it); return { ok: false, why: it.why };
    }
    const ctl = new AbortController();
    it.state = 'copying'; it.why = ''; this.save();
    const run = this.run(it, ctl.signal).catch((e) => { it.state = 'paused'; it.why = `Stopped: ${e.message}`; }).finally(() => { this.runs.delete(it.id); this.save(); this.progress(it, true); });
    this.runs.set(it.id, { ctl, run });
    this.progress(it, true);
    return { ok: true, run };
  }
  resume(id) {
    const it = this.items.get(String(id || ''));
    if (!it || !['paused', 'stopped'].includes(it.state)) return { ok: false, why: 'Nothing to carry on.' };
    if (it.gone) return { ok: false, why: `${it.fromName} took it back. Ask for it to be sent again.` };
    return this.start(it);
  }
  stop(id, { tell = true } = {}) {
    const it = this.items.get(String(id || ''));
    if (!it) return { ok: false, why: 'That copy is already over.' };
    this.runs.get(it.id)?.ctl.abort();
    if (['copying', 'checking', 'waiting', 'paused', 'asking'].includes(it.state)) { it.state = 'stopped'; it.why = ''; }
    this.save(); this.progress(it, true);
    if (tell) this.tell(it, 'stopped');
    return { ok: true };
  }
  // The sender took his offer back.
  senderStopped(b) {
    const it = this.items.get(String(b?.id || ''));
    if (!it || it.token !== String(b?.token || '')) return { code: 404, error: 'no such copy' };
    this.runs.get(it.id)?.ctl.abort();
    if (it.state === 'asking') this.broadcast({ type: 'net-file-gone', id: it.id });
    if (it.state !== 'done') { it.state = 'stopped'; it.why = `${it.fromName} stopped sending it.`; it.gone = true; }
    this.save(); this.progress(it, true);
    return { code: 200, ok: true };
  }
  // Throw away the half copy and forget it.
  forget(id) {
    const it = this.items.get(String(id || ''));
    if (!it) return { ok: true };
    this.runs.get(it.id)?.ctl.abort();
    if (it.state !== 'done') for (const f of it.files) if (f.dest && !f.have) { try { fs.unlinkSync(f.dest + '.part'); } catch {} }
    this.items.delete(it.id); this.save();
    return { ok: true };
  }
  tell(it, what) {
    const bob = (this.lenders?.bobs?.() || []).find((x) => x.address === it.from);
    if (bob) this.lenders.call(bob, '/api/bob-net/files/said', { method: 'POST', timeout: 5000, body: { id: it.id, token: it.token, what } }).catch(() => {});
  }
  progress(it, now = false) {
    const t = this.now();
    if (!now && t - (it.saidAt || 0) < 1000) return;
    it.saidAt = t;
    this.broadcast({ type: 'net-file', ...this.one(it) });
  }
  one(it) { return { id: it.id, from: it.fromName, kind: it.kind, title: it.title, state: it.state, why: it.why || '', total: it.total, done: it.done || 0, rate: it.rate || 0, where: it.state === 'done' ? path.dirname(it.files[0].dest || '') : '', own: it.own === true, gone: it.gone === true }; }
  view() { return [...this.items.values()].filter((it) => it.state !== 'declined').map((it) => this.one(it)); }

  async call(it, p, signal, timeout = 15000) {
    const bob = (this.lenders?.bobs?.() || []).find((x) => x.address === it.from);
    if (!bob) throw Object.assign(new Error(`${it.fromName} isn't on my Bob-Net list any more`), { fatal: true });
    return this.lenders.call(bob, p, { signal, timeout });
  }
  q(it, n, more = '') { return `id=${it.id}&token=${it.token}&n=${n}${more}`; }

  async run(it, signal) {
    const base = it.files.reduce((a, f) => a + (f.have ? f.bytes : 0), 0);
    let doneBefore = base;
    for (let n = 0; n < it.files.length; n++) {
      const f = it.files[n];
      if (f.have) continue;
      await this.pull(it, n, doneBefore, signal);
      if (signal.aborted) return;
      doneBefore += f.bytes;
    }
    // A brain: on Bob's list, beside the others.
    if (it.kind === 'brain' && it.own) {
      const g = it.files.find((f) => f.role === 'gguf'), m = it.files.find((f) => f.role === 'mmproj');
      try { this.addOwn({ name: it.title.replace(/\.gguf$/i, ''), gguf: g.dest, mmproj: m?.dest || '' }); } catch {}
    }
    it.state = 'done'; it.done = it.total; it.why = '';
    this.tell(it, 'done');
    this.log('bob-net', `copied ${it.kind === 'brain' ? 'the brain ' : ''}${it.title} from ${it.fromName} (${gb(it.total)}), checked`);
  }

  async pull(it, n, before, signal) {
    const f = it.files[n], part = f.dest + '.part';
    let at = Math.max(0, sizeOf(part));
    if (at > f.bytes) { fs.unlinkSync(part); at = 0; }
    it.state = 'checking'; it.why = at ? 'Reading what\'s here already' : ''; this.progress(it, true);
    const h = await hashSoFar(part, at, signal);
    if (signal.aborted) return;
    const fd = fs.openSync(part, at ? 'r+' : 'w');
    let fails = 0, t0 = this.now(), from0 = at;
    try {
      while (at < f.bytes && !signal.aborted) {
        if (this.gaming()) { it.state = 'waiting'; it.why = 'Gaming: the copy waits.'; this.progress(it); await this.wait(10000, signal); continue; }
        it.state = 'copying'; it.why = '';
        const len = Math.min(this.chunk, f.bytes - at);
        let got = 0;
        try {
          const r = await this.call(it, `/api/bob-net/files/get?${this.q(it, n, `&at=${at}&len=${len}`)}`, signal);
          if (r.status === 503) { const j = await r.json().catch(() => ({})); it.state = 'waiting'; it.why = j.wait === 'gaming' ? `${it.fromName} is gaming: the copy waits.` : 'Waiting.'; this.progress(it, true); await this.wait(30000, signal); continue; }
          if (r.status === 410 || r.status === 409) { const j = await r.json().catch(() => ({})); throw Object.assign(new Error(j.error || 'the sender stopped it'), { fatal: true }); }
          if (!r.ok || !r.body) throw new Error(`answer ${r.status}`);
          const pace = pacer(capOf(this.cfg, onWifi(this.linkKind(this.mine(it)), this.links())));
          for await (const b of r.body) {
            const buf = Buffer.isBuffer(b) ? b : Buffer.from(b.buffer, b.byteOffset, b.byteLength);
            const room = Math.min(buf.length, f.bytes - at);
            if (room <= 0) break;
            const piece = room < buf.length ? buf.subarray(0, room) : buf;
            fs.writeSync(fd, piece, 0, piece.length, at);
            h.update(piece);
            at += piece.length; got += piece.length;
            it.done = before + at;
            const dt = (this.now() - t0) / 1000; if (dt > 1) it.rate = (at - from0) / dt;
            this.progress(it);
            await pace(piece.length, signal);
            if (signal.aborted) break;
          }
        } catch (e) {
          if (signal.aborted) break;
          if (e.fatal) throw e;
          if (got) fails = 0;
          if (++fails > this.retries) throw new Error(`lost the line to ${it.fromName} (${String(e.message || e).slice(0, 80)}). Press Carry on to try again.`);
          it.why = `The line dropped. Trying again (${fails})…`; this.progress(it, true);
          await this.wait(Math.min(60000, 2000 * 2 ** Math.min(fails, 5)), signal);
          continue;
        }
        if (got) fails = 0; else if (++fails > this.retries) throw new Error(`${it.fromName} sends nothing. Press Carry on to try again.`);
      }
    } finally { fs.closeSync(fd); }
    if (signal.aborted) return;
    // The whole file is here: check it against his.
    it.state = 'checking'; it.why = 'Checking the copy'; this.progress(it, true);
    const mine = h.digest('hex');
    let his = '';
    for (let tries = 0; !his && !signal.aborted; tries++) {
      const r = await this.call(it, `/api/bob-net/files/hash?${this.q(it, n)}`, signal).catch((e) => { if (e.fatal) throw e; return null; });
      const j = r ? await r.json().catch(() => ({})) : {};
      if (r?.status === 410) throw Object.assign(new Error(j.error || 'the sender stopped it'), { fatal: true });
      if (/^[0-9a-f]{64}$/.test(j.sha256 || '')) his = j.sha256;
      else { if (tries > 2000) throw new Error(`${it.fromName} never said what the file should be`); await this.wait(j.pending ? 5000 : 15000, signal); }
    }
    if (signal.aborted) return;
    if (his !== mine) { try { fs.unlinkSync(part); } catch {} f.bad = (f.bad || 0) + 1; throw new Error(`${f.name} didn't match ${it.fromName}'s copy, so I threw it away. Press Carry on to copy it again.`); }
    let dest = f.dest;
    if (exists(dest)) { const n2 = freeName(path.dirname(dest), path.basename(dest)); dest = path.join(path.dirname(dest), n2); f.dest = dest; } // never on top of a file
    fs.renameSync(part, dest);
  }
  // This machine's own address on the road to him (his home address when we share one), for the Wi-Fi cap.
  mine(it) { return (this.lenders?.nearMine?.get?.(it.from) || [])[0] || ''; }
}

// For the window: the brains on this replicant matrix that can be copied. models: ModelShop list().models.
export function copyableBrains(models) {
  const out = [];
  for (const m of models || []) {
    const g = m?.status?.located?.gguf;
    if (!g || m.status.state !== 'installed' || m.category === 'embed' || m.into) continue;
    const files = brainFiles(g, m.status.located.mmproj || '');
    if (!files.length) continue;
    out.push({ id: m.id, name: m.name || m.id, bytes: files.reduce((a, f) => a + f.bytes, 0) });
  }
  return out;
}
