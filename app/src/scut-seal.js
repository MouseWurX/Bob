// Sealed SCUT packets (Brain Engine patch 0006). With SCUT on, every packet between two Bobs sharing a card is signed
// and scrambled (ChaCha20-Poly1305), so nobody else on the network can read a lent card's numbers, change them, or
// slip in packets of their own: anything that fails the check is dropped before it is read. On by default (the owner's
// call, Nov 11); "Seal SCUT packets" in Settings, Bob-Net turns it off. With it on, a Bob only uses SCUT with another
// Bob that seals too; otherwise the two use the usual link (which over Tailscale is scrambled by Tailscale anyway).
//
// Keys:
//   - A link key per pair of Bobs (32 random bytes). Made when they pair (src/bob-net-pair.js: the Bob that says yes
//     makes it and hands it over with his passcode, over Tailscale). Bobs paired before this get one the first time
//     they share a card: the borrower asks for it through the passcode door, the same way the passcodes travel.
//   - Each time a card is lent, the lending Bob picks a fresh salt; both Bobs turn link key + salt into that lend's key
//     (HMAC-SHA256), and the engines make a new key per direction per connection from it. So no key is used twice.
// Link keys live in their own file in Bob's data folder (bob-net-link-keys.json, readable by this user only), never in
// config.json, the Settings page, the logs or the replies to other Bobs, except the one hand-over above.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const KEY_RE = /^[0-9a-f]{64}$/;
export const SALT_RE = /^[0-9a-f]{32}$/;
export const KEYS_FILE = 'bob-net-link-keys.json';
const MAX_KEYS = 64;

// On unless switched off (only matters while SCUT is on).
export const sealOn = (cfg) => cfg.share?.scutSeal !== false;

export const newLinkKey = () => crypto.randomBytes(32).toString('hex');
export const newSalt = () => crypto.randomBytes(16).toString('hex');
// One lend's key: what both engines are given (GGML_RPC_SCUT_KEY / GGML_RPC_SCUT_KEYS).
export function lendKey(link, salt) {
  if (!KEY_RE.test(String(link)) || !SALT_RE.test(String(salt))) return '';
  return crypto.createHmac('sha256', Buffer.from(link, 'hex')).update(`bob scut seal 1 ${salt}`).digest('hex');
}

// Who a key belongs to: the other Bob's Tailscale address (or name), without the port.
export const keyName = (address) => String(address || '').replace(/^::ffff:/, '').replace(/:\d+$/, '').toLowerCase().slice(0, 120);

const fileOf = (cfg) => (cfg.dataDir ? path.join(cfg.dataDir, KEYS_FILE) : '');
function readAll(cfg) {
  try {
    const j = JSON.parse(fs.readFileSync(fileOf(cfg), 'utf8'));
    return Object.fromEntries(Object.entries(j && typeof j === 'object' ? j : {}).filter(([k, v]) => k && KEY_RE.test(String(v))));
  } catch { return {}; }
}
function writeAll(cfg, all) {
  const f = fileOf(cfg);
  if (!f) return false;
  const tmp = `${f}.tmp`;
  try {
    fs.mkdirSync(path.dirname(f), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(all, null, 2), { mode: 0o600 });
    fs.renameSync(tmp, f);
    try { fs.chmodSync(f, 0o600); } catch {}
    return true;
  } catch { try { fs.rmSync(tmp, { force: true }); } catch {} return false; }
}

export function linkKey(cfg, address) { const k = readAll(cfg)[keyName(address)]; return KEY_RE.test(String(k)) ? k : ''; }
export function saveLinkKey(cfg, address, key) {
  const name = keyName(address);
  if (!name || !KEY_RE.test(String(key))) return false;
  const all = readAll(cfg);
  delete all[name];
  all[name] = key;
  const names = Object.keys(all);
  for (const n of names.slice(0, Math.max(0, names.length - MAX_KEYS))) delete all[n]; // the oldest go first
  return writeAll(cfg, all);
}
export function forgetLinkKey(cfg, address) {
  const all = readAll(cfg), name = keyName(address);
  if (!(name in all)) return false;
  delete all[name];
  return writeAll(cfg, all);
}

// A link key's public name: the first 8 bytes of its SHA-256. The lender finds the key by it, whichever of his
// addresses (Tailscale or home network) the ask came in on; the key itself never travels after pairing.
export const keyId = (key) => (KEY_RE.test(String(key)) ? crypto.createHash('sha256').update(Buffer.from(key, 'hex')).digest('hex').slice(0, 16) : '');
export function linkKeyById(cfg, id) {
  if (!/^[0-9a-f]{16}$/.test(String(id))) return '';
  return Object.values(readAll(cfg)).find((k) => keyId(k) === id) || '';
}

// What a borrowing Bob sends with "lend me your card": that it wants sealed packets, and which link key it holds for
// that Bob (its id), or that it needs one.
export function sealAsk(cfg, address) { const k = linkKey(cfg, address); return k ? { want: true, kid: keyId(k) } : { want: true, newKey: true }; }
export function cleanSealAsk(s) {
  if (!s || typeof s !== 'object' || s.want !== true) return null;
  return s.newKey === true ? { want: true, newKey: true } : { want: true, kid: /^[0-9a-f]{16}$/.test(String(s.kid)) ? String(s.kid) : '' };
}

// The lending side, for one lend. ask: cleanSealAsk() of the request; asker: the asking Bob's Tailscale address.
// Returns { env, reply, sealed } : env for ggml-rpc-server, reply for the asker.
export function lenderSeal(cfg, { on, ask, asker, salt = newSalt(), log = () => {} }) {
  if (!on) return { env: {}, reply: null, sealed: false };
  let link = ask?.kid ? linkKeyById(cfg, ask.kid) : '', handed = '';
  // A Bob paired before sealed packets (or who lost his key) gets a new one, through the passcode door like his passcode.
  if (ask?.newKey) { link = newLinkKey(); if (saveLinkKey(cfg, asker, link)) handed = link; else link = ''; }
  if (!ask || !link) {
    // An older Bob, or a key this Bob doesn't know: a key nobody else has, so the engines can't agree and stay on the
    // usual link. A key we don't know is said so, and he asks for a new one next time.
    log('bob-net', `lent graphics card: ${ask ? 'the other Bob\'s SCUT key isn\'t one I know (he gets a new one next time)' : 'the other Bob doesn\'t seal SCUT packets (older Bob)'}, so the usual link is used`);
    return { env: { GGML_RPC_SCUT_KEY: newLinkKey() }, reply: ask ? { unknownKey: true } : null, sealed: false };
  }
  return { env: { GGML_RPC_SCUT_KEY: lendKey(link, salt) }, reply: { salt, ...(handed ? { linkKey: handed } : {}) }, sealed: true };
}

// The borrowing side, from the lender's reply: the key for the engine to use with that card ('off' = no SCUT with it).
export function borrowerSeal(cfg, { address, reply, asked }) {
  if (reply && asked?.newKey && KEY_RE.test(String(reply.linkKey))) saveLinkKey(cfg, address, reply.linkKey);
  if (reply?.unknownKey === true) { forgetLinkKey(cfg, address); return 'off'; } // he lost it: a new one next time
  const link = linkKey(cfg, address);
  const k = reply && link ? lendKey(link, reply.salt) : '';
  return k || 'off';
}

// GGML_RPC_SCUT_KEYS for llama-server: "host:port=key,..." for each lent card.
export const keysEnv = (keys) => (keys.length ? { GGML_RPC_SCUT_KEYS: keys.map(({ at, key }) => `${at}=${key}`).join(',') } : {});
