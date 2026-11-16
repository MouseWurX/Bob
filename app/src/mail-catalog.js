// 📇 The mail catalog (Settings, How Bob works, 🧰 More tools: "Let Bob catalog my email"; off by default, and only
// with "Let Bob read my email" on). The owner, 16 Nov 2026: "some of my inboxes and some of my friends inboxes have
// tens of thousands of emails"; "it needs to be cataloged and managed intelligently for performance"; "by organization
// or by sender may be the best way to start sorting, then grouping by category"; "and it is independent per user?";
// "and it wont be huge on the ssd? or hdd?". Design: docs/MAIL-CATALOG.md.
//
// What it is: one small file per Bob user (their own data folder; inn\profiles\<id>\ for a user, inn\bob\ for the
// owner), holding only each message's headers: who sent it, their company, the subject (cut short), the date, read and
// flag marks, the Message-ID, and the kind Bob's rules gave it. Never a body, never an attachment. It is packed
// (gzip), and locked with the user's own key when their chats are locked (vault.js), so nobody else signed in can read
// it. About 3 MB for 50,000 messages (test/run-mail-catalog-test.js measures it).
//
// How it fills: read-only (EXAMINE and BODY.PEEK, so nothing is marked read), 500 headers at a time, newest first, a
// few thousand per call; after that only the new ones. Mail that left the folder leaves the catalog. If the server
// renumbers the folder (UIDVALIDITY changes) or the account changes, it starts again.
//
// What sorts it, by code, no brain: the sender's company (their registrable domain, or the mailing list's id), then the
// kind: scam (Bob's danger checks), junk (failed sender checks, or offers with no unsubscribe), mailing list (List-Id),
// newsletter (an unsubscribe header, bulk), notice (no-reply, automatic, receipts and alerts), person (the rest). A
// person writing from a company that mostly sends bulk mail (a shop's staff member writing by hand) is marked unsure,
// so bulk acts hold them back.
// Pure Node (zlib, no add-ons, no SQLite), so it runs the same on Windows, Mac, Linux and Android.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { withMailbox, parseHeaders, decodeWords, quote, emailSettings, toMutf7 } from './email-read.js';
import { cleanField, dangerSigns, addresses } from './email-safe.js';
import { registrable } from './security-files.js';
import { vaultOn, seal, unseal, isSealed } from './vault.js';
import { saveFile } from './saving.js';

export const VERSION = 1;
export const BATCH = 500; // headers per FETCH
export const PER_CALL = 5000; // new headers per fill call; the rest come on the next one
export const KINDS = ['person', 'list', 'newsletter', 'notice', 'junk', 'scam'];
export const KIND_WORD = { person: 'from people', list: 'mailing lists', newsletter: 'newsletters and offers', notice: 'automatic notices', junk: 'junk', scam: 'looks dangerous' };
const SUBJECT_MAX = 120;
const DAY = 86400000;
const HEAD_FIELDS = 'FROM SUBJECT DATE MESSAGE-ID LIST-ID LIST-UNSUBSCRIBE PRECEDENCE AUTO-SUBMITTED REPLY-TO AUTHENTICATION-RESULTS';

// ---------------------------------------------------------------- where it lives: one per user
export const catalogDir = (cfg) => (cfg?.profileNow ? path.join(cfg.innDir, 'profiles', String(cfg.profileNow)) : path.join(cfg.innDir || cfg.dataDir, 'bob'));
export const catalogFile = (cfg) => path.join(catalogDir(cfg), 'mail-catalog.bin');
// Which account and folder the catalog is of (a hash: the address itself isn't written in the clear).
export function accountKey(cfg) {
  const s = emailSettings(cfg);
  return crypto.createHash('sha256').update(`${String(s.host).toLowerCase()}|${String(s.user).toLowerCase()}|${s.folder}`).digest('hex').slice(0, 16);
}

// ---------------------------------------------------------------- sorting by code
const NOREPLY = /(^|[._-])(no-?reply|do-?not-?reply|donotreply|notifications?|alerts?|mailer-daemon|postmaster|bounces?|automated|system)([._-]|@)/i;
const NOTICE_SUBJECT = /\b(receipt|order|shipped|shipping|delivered|delivery|parcel|tracking|statement|invoice|bill|payment|paid|confirm(ed|ation)?|verify|verification|sign-?in|password|security|account|reminder|appointment|booking|reservation|renewal|subscription)\b/i;
const ADS = /^(offers?|promo(tions?)?|deals?|sales|marketing|winners?)@/i;
// A role address (a shop's office, a bank's alerts) sends notices; a person's own address carries their name.
const ROLE = /^(billing|accounts?|appointments?|bookings?|security|office|support|help|info|hello|team|service|orders?|tracking|shipping|receipts?|news|digest|alerts?|admin|contact|care|customer[\w.-]*|members?|reservations?)@/i;
const personal = (addr, name) => { const local = String(addr).split('@')[0].toLowerCase(); return String(name).toLowerCase().split(/[^a-z]+/).filter((w) => w.length >= 3).some((w) => local.includes(w)); };
const authFailed = (h) => /\b(spf=(fail|softfail)|dmarc=fail)\b/i.test(String(h['authentication-results'] || ''));

// The sender's own way to leave a list (List-Unsubscribe): its https link, else its mailto address. Shown to the person,
// never opened by Bob.
export function unsubLink(h) {
  const all = [...String(h || '').matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  const web = all.find((u) => /^https:\/\/[^\s"'<>]+$/i.test(u)), mail = all.find((u) => /^mailto:[^\s"'<>]+$/i.test(u));
  return String(web || mail || '').slice(0, 300);
}
export function orgOf(addr, listId = '') {
  const lid = String(listId).match(/<([^>]+)>/)?.[1] || String(listId).trim();
  if (lid) return lid.toLowerCase().slice(0, 120);
  const d = String(addr).split('@')[1] || '';
  try { return (registrable(d) || d).toLowerCase(); } catch { return d.toLowerCase(); }
}

// One message's headers (parsed, decoded) -> its catalog row (without uid).
export function rowFrom(hd, flags = '', raw = {}, attachments = []) {
  const who = addresses(hd.from || '')[0] || {};
  const addr = String(who.address || '').toLowerCase().slice(0, 160);
  const danger = dangerSigns(hd, { attachments });
  const list = Boolean(raw['list-id']);
  const bulk = Boolean(raw['list-unsubscribe']) || /\b(bulk|list|junk)\b/i.test(raw.precedence || '');
  const auto = /^auto-/i.test(String(raw['auto-submitted'] || '')) || NOREPLY.test(addr);
  const subject = cleanField(hd.subject || '(no subject)', SUBJECT_MAX);
  let kind;
  if (danger.length) kind = 'scam';
  else if (list) kind = 'list';
  else if (bulk) kind = 'newsletter';
  else if (authFailed(raw) || ADS.test(addr)) kind = 'junk';
  else if (auto || ROLE.test(addr) || (NOTICE_SUBJECT.test(subject) && !personal(addr, who.name))) kind = 'notice';
  else kind = 'person';
  return {
    mid: String(raw['message-id'] || '').trim().slice(0, 200),
    at: Date.parse(raw.date || '') || 0,
    addr, name: cleanField(String(who.name || '').replace(/"/g, ''), 60), org: orgOf(addr, raw['list-id']),
    subject, unread: !/\\Seen/i.test(flags), flagged: /\\Flagged/i.test(flags), answered: /\\Answered/i.test(flags),
    kind, sure: true, danger: danger.slice(0, 2).map((d) => cleanField(d, 80)), unsub: unsubLink(raw['list-unsubscribe'])
  };
}
// After a fill: a person writing from a company that mostly sends bulk mail is unsure (the shop's own staff).
export function markUnsure(rows) {
  const byOrg = new Map();
  for (const r of rows) { const o = byOrg.get(r.org) || { bulk: 0, all: 0 }; o.all++; if (r.kind === 'newsletter' || r.kind === 'notice' || r.kind === 'list') o.bulk++; byOrg.set(r.org, o); }
  for (const r of rows) {
    const o = byOrg.get(r.org);
    r.sure = !(r.kind === 'person' && o && o.bulk >= 2 && o.bulk * 2 >= o.all);
  }
  return rows;
}

// ---------------------------------------------------------------- the file: packed, locked like the user's chats
// Rows are kept as columns with each repeated string written once, so 50,000 rows are a few MB packed.
function pack(cat) {
  const strings = [], seen = new Map();
  const s = (v) => { const k = String(v ?? ''); if (!seen.has(k)) { seen.set(k, strings.length); strings.push(k); } return seen.get(k); };
  const rows = cat.rows;
  const cols = {
    uid: rows.map((r) => r.uid), at: rows.map((r) => Math.round(r.at / 1000)),
    mid: rows.map((r) => r.mid), subject: rows.map((r) => s(r.subject)), addr: rows.map((r) => s(r.addr)), name: rows.map((r) => s(r.name)), org: rows.map((r) => s(r.org)),
    kind: rows.map((r) => KINDS.indexOf(r.kind)),
    bits: rows.map((r) => (r.unread ? 1 : 0) | (r.flagged ? 2 : 0) | (r.answered ? 4 : 0) | (r.sure ? 0 : 8)),
    danger: rows.map((r) => (r.danger.length ? s(r.danger.join(' | ')) : -1)),
    unsub: rows.map((r) => (r.unsub ? s(r.unsub) : -1))
  };
  const json = JSON.stringify({ v: VERSION, account: cat.account, folder: cat.folder, uidvalidity: cat.uidvalidity, filled: cat.filled, total: cat.total, strings, cols });
  return zlib.gzipSync(Buffer.from(json, 'utf8'), { level: 9 });
}
function unpack(buf) {
  const j = JSON.parse(zlib.gunzipSync(buf).toString('utf8'));
  if (j.v !== VERSION) return null;
  const S = j.strings, c = j.cols;
  const rows = c.uid.map((uid, i) => ({
    uid, at: c.at[i] * 1000, mid: c.mid[i], subject: S[c.subject[i]], addr: S[c.addr[i]], name: S[c.name[i]], org: S[c.org[i]], kind: KINDS[c.kind[i]] || 'person',
    unread: Boolean(c.bits[i] & 1), flagged: Boolean(c.bits[i] & 2), answered: Boolean(c.bits[i] & 4), sure: !(c.bits[i] & 8),
    danger: c.danger[i] >= 0 ? S[c.danger[i]].split(' | ') : [], unsub: c.unsub && c.unsub[i] >= 0 ? S[c.unsub[i]] : ''
  }));
  return { account: j.account, folder: j.folder, uidvalidity: j.uidvalidity, filled: j.filled, total: j.total, rows };
}
const empty = (cfg) => ({ account: accountKey(cfg), folder: emailSettings(cfg).folder, uidvalidity: 0, filled: 0, total: 0, rows: [] });

// Kept in memory while it's in use, per user and file, and let go after a few idle minutes (small computers).
const held = new Map();
const IDLE_MS = 5 * 60e3;
function hold(file, cat) {
  const old = held.get(file); if (old) clearTimeout(old.timer);
  const timer = setTimeout(() => held.delete(file), IDLE_MS); timer.unref?.();
  held.set(file, { cat, timer });
  return cat;
}
export const forgetHeld = () => { for (const h of held.values()) clearTimeout(h.timer); held.clear(); }; // tests

export function loadCatalog(cfg, { io = fs } = {}) {
  const file = catalogFile(cfg);
  const h = held.get(file);
  if (h && h.cat.account === accountKey(cfg)) return hold(file, h.cat);
  let buf;
  try { buf = io.readFileSync(file); } catch { return hold(file, empty(cfg)); }
  let cat = null;
  try { cat = unpack(isSealed(buf) ? Buffer.from(unseal(buf), 'base64') : buf); }
  catch (e) { if (e.code === 'VAULT_LOCKED') throw e; cat = null; } // a damaged file is rebuilt
  if (!cat || cat.account !== accountKey(cfg)) cat = empty(cfg);
  return hold(file, cat);
}
export function saveCatalog(cfg, cat) {
  const file = catalogFile(cfg);
  const packed = pack(cat);
  const out = vaultOn(cfg) ? seal(packed.toString('base64')) : packed;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  saveFile(file, out);
  hold(file, cat);
  return out.length;
}
export function catalogSize(cfg) { try { return fs.statSync(catalogFile(cfg)).size; } catch { return 0; } }
export function deleteCatalog(cfg) {
  const file = catalogFile(cfg);
  const h = held.get(file); if (h) { clearTimeout(h.timer); held.delete(file); }
  try { fs.rmSync(file, { force: true }); } catch {}
}
// For Settings: how big, how many, when.
export function catalogInfo(cfg) {
  const bytes = catalogSize(cfg);
  if (!bytes) return { bytes: 0, rows: 0, total: 0, filled: 0 };
  try { const c = loadCatalog(cfg); return { bytes, rows: c.rows.length, total: c.total, filled: c.filled }; }
  catch (e) { return { bytes, rows: 0, total: 0, filled: 0, locked: e.code === 'VAULT_LOCKED' }; }
}

// ---------------------------------------------------------------- filling it from the server
const uidsIn = (lines) => lines.flatMap((l) => (l.text.match(/^\* SEARCH\s*(.*)$/i)?.[1] || '').split(/\s+/)).filter((x) => /^\d+$/.test(x)).map(Number);
const flagsIn = (lines) => { const m = new Map(); for (const l of lines) { const u = Number((l.text.match(/\bUID (\d+)/) || [])[1]); if (u) m.set(u, (l.text.match(/\bFLAGS \(([^)]*)\)/) || [])[1] || ''); } return m; };

// One fill (or bulk act) at a time per catalog, in this Bob.
const queues = new Map();
export function queued(file, fn) {
  const run = (queues.get(file) || Promise.resolve()).then(fn, fn);
  const tail = run.catch(() => {}); queues.set(file, tail);
  tail.then(() => { if (queues.get(file) === tail) queues.delete(file); });
  return run;
}

// Brings the catalog up to date. Read-only on the server. { added, removed, total, have, left }.
export async function fillCatalog(cfg, { perCall = PER_CALL, untilMs = 0, signal = null, progress = () => {}, now = Date.now() } = {}, opts = {}) {
  const start = Date.now();
  return queued(catalogFile(cfg), () => withMailbox(cfg, async (imap) => {
    let cat = loadCatalog(cfg);
    const folder = emailSettings(cfg).folder;
    const ex = await imap.run(`EXAMINE ${quote(toMutf7(folder))}`); // again, to read UIDVALIDITY
    const uv = Number(ex.map((l) => (l.text.match(/\[UIDVALIDITY (\d+)\]/i) || [])[1]).find(Boolean) || 0);
    if (cat.uidvalidity && uv && cat.uidvalidity !== uv) cat = empty(cfg); // the server renumbered the folder
    cat.uidvalidity = uv || cat.uidvalidity;
    const all = uidsIn(await imap.run('UID SEARCH ALL'));
    const here = new Set(all);
    const before = cat.rows.length;
    cat.rows = cat.rows.filter((r) => here.has(r.uid));
    const removed = before - cat.rows.length;
    // marks change (read, flagged): fetched for every message, one short line each
    if (cat.rows.length) {
      const fl = flagsIn(await imap.run('UID FETCH 1:* (UID FLAGS)'));
      for (const r of cat.rows) if (fl.has(r.uid)) { const f = fl.get(r.uid); r.unread = !/\\Seen/i.test(f); r.flagged = /\\Flagged/i.test(f); r.answered = /\\Answered/i.test(f); }
    }
    const have = new Set(cat.rows.map((r) => r.uid));
    const todo = all.filter((u) => !have.has(u)).sort((a, b) => b - a);
    const take = todo.slice(0, Math.max(0, perCall));
    let added = 0;
    for (let i = 0; i < take.length; i += BATCH) {
      if (signal?.aborted || (untilMs && i && Date.now() - start > untilMs)) break;
      const got = await imap.run(`UID FETCH ${take.slice(i, i + BATCH).join(',')} (UID FLAGS BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (${HEAD_FIELDS})])`);
      for (const l of got) {
        if (!/FETCH/i.test(l.text)) continue;
        const uid = Number((l.text.match(/\bUID (\d+)/) || [])[1]);
        if (!uid || have.has(uid)) continue;
        const raw = parseHeaders(l.literals.join('\n'));
        const hd = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, decodeWords(v)]));
        // attachment names from BODYSTRUCTURE (never the attachments), for the danger checks
        const files = [...l.text.matchAll(/"(?:file)?name\*?"\s+"((?:[^"\\]|\\.)*)"/gi)].map((x) => decodeWords(x[1])).slice(0, 10);
        cat.rows.push({ uid, ...rowFrom(hd, (l.text.match(/\bFLAGS \(([^)]*)\)/) || [])[1] || '', raw, files) });
        have.add(uid); added++;
      }
      progress({ have: cat.rows.length, total: all.length });
    }
    cat.rows.sort((a, b) => b.uid - a.uid);
    markUnsure(cat.rows);
    cat.total = all.length; cat.filled = now;
    saveCatalog(cfg, cat);
    return { added, removed, total: all.length, have: cat.rows.length, left: all.length - cat.rows.length };
  }, opts));
}

// Messages moved or trashed by Bob leave the folder: taken out of the catalog at once (the next fill would anyway).
export function dropRows(cfg, uids) {
  const cat = loadCatalog(cfg); const gone = new Set(uids);
  const n = cat.rows.length;
  cat.rows = cat.rows.filter((r) => !gone.has(r.uid));
  if (cat.rows.length !== n) saveCatalog(cfg, cat);
}
export function markRows(cfg, uids, patch) {
  const cat = loadCatalog(cfg); const s = new Set(uids);
  for (const r of cat.rows) if (s.has(r.uid)) Object.assign(r, patch);
  saveCatalog(cfg, cat);
}

// ---------------------------------------------------------------- asking it
const plain = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
// A company or sender the person named ("Kettle & Crumb", "larkspur.example", "Ines"), matched on the company domain,
// the sender's address and the sender's name, without case, accents or punctuation.
export function matches(r, { org = '', sender = '' } = {}) {
  if (org) {
    const w = plain(org), base = plain(String(r.org).replace(/\.[a-z]+$/i, ''));
    if (!w || !(base.includes(w) || w.includes(base) && base.length >= 4 || plain(r.name).includes(w) || plain(r.addr.split('@')[1] || '').includes(w))) return false;
  }
  if (sender) { const w = plain(sender); if (!w || !(plain(r.addr).includes(w) || plain(r.name).includes(w))) return false; }
  return true;
}
export function select(cat, f = {}, { now = Date.now() } = {}) {
  const kinds = [].concat(f.kind || []).filter((k) => KINDS.includes(k));
  const older = Number(f.older_than_days) > 0 ? now - Number(f.older_than_days) * DAY : null;
  const newer = Number(f.newer_than_days) > 0 ? now - Number(f.newer_than_days) * DAY : null;
  const words = String(f.words || '').toLowerCase().trim();
  // A company named by its name ("Kettle & Crumb") takes in everyone writing from its domain, staff too (bulk acts
  // then hold the people back): the companies are the ones any of whose mail matches.
  const orgs = f.org ? new Set(cat.rows.filter((r) => matches(r, { org: f.org })).map((r) => r.org)) : null;
  return cat.rows.filter((r) => (!orgs || orgs.has(r.org)) && matches(r, { sender: f.sender }) && (!kinds.length || kinds.includes(r.kind)) && (older == null || r.at < older) && (newer == null || r.at >= newer)
    && (!f.unread || r.unread) && (!words || r.subject.toLowerCase().includes(words)));
}
// Groups by company (or sender), biggest first: count, unread, kinds, newest and oldest.
export function groups(rows, { by = 'org', max = 40 } = {}) {
  const m = new Map();
  for (const r of rows) {
    const key = by === 'sender' ? r.addr : r.org;
    let g = m.get(key);
    if (!g) { g = { key, names: new Map(), count: 0, unread: 0, kinds: {}, newest: 0, oldest: Infinity, unsure: 0 }; m.set(key, g); }
    g.count++; if (r.unread) g.unread++; g.kinds[r.kind] = (g.kinds[r.kind] || 0) + 1; if (!r.sure) g.unsure++;
    g.newest = Math.max(g.newest, r.at); g.oldest = Math.min(g.oldest, r.at || g.oldest);
    if (r.name) g.names.set(r.name, (g.names.get(r.name) || 0) + 1);
  }
  const out = [...m.values()].sort((a, b) => b.count - a.count).map((g) => ({ ...g, name: [...g.names].sort((a, b) => b[1] - a[1])[0]?.[0] || g.key, names: undefined }));
  return { groups: out.slice(0, max), more: Math.max(0, out.length - max), all: out.length };
}
const day = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '?');
export const kindLine = (kinds) => KINDS.filter((k) => kinds[k]).map((k) => `${kinds[k]} ${KIND_WORD[k]}`).join(', ');
export function groupsText(cat, g, { by = 'org' } = {}) {
  return g.groups.map((x) => `${x.name}${by === 'org' && x.name !== x.key ? ` (${x.key})` : ''}: ${x.count}${x.unread ? `, ${x.unread} unread` : ''} · ${kindLine(x.kinds)}${x.unsure ? ` · ${x.unsure} from a person at a bulk sender (check before acting)` : ''} · ${day(x.oldest)} to ${day(x.newest)}`).join('\n')
    + (g.more ? `\n…and ${g.more} smaller group${g.more === 1 ? '' : 's'}.` : '');
}
export const statusLine = (r) => `Catalog: ${r.have} of ${r.total} message${r.total === 1 ? '' : 's'} in this folder${r.left ? `, ${r.left} still to catalogue (ask again to go on)` : ''}.`;

// ---------------------------------------------------------------- the clerk's work, by code (the owner, 16 Nov: "should
// more be offloaded scripts and non-brain functionality?"). The brain only picks the job and explains the answer.
const URGENT = /\b(urgent|asap|today|tonight|tomorrow|by (mon|tues|wednes|thurs|fri|satur|sun)day|deadline|overdue|due|this week|need to know|please reply|rsvp|répondre|rappel|échéance)\b/i;
const ASKS = /\?|\b(can you|could you|would you|do you|are you|will you|let me know|what do you think|thoughts)\b/i;
// Mail from people that may need an answer, most pressing first: a person (or a person at a bulk sender, marked), not
// yet answered, in the last `days` days; scored on unread, a question, a date or "urgent" in the subject, and age.
export function needsReply(cat, { days = 14, max = 15, now = Date.now() } = {}) {
  const from = now - Math.max(1, Math.min(365, Number(days) || 14)) * DAY;
  const rows = cat.rows.filter((r) => r.kind === 'person' && !r.answered && r.at >= from);
  const score = (r) => (r.unread ? 3 : 0) + (URGENT.test(r.subject) ? 4 : 0) + (ASKS.test(r.subject) ? 2 : 0) + (r.flagged ? 2 : 0) + (!r.sure ? 1 : 0) - (now - r.at) / (7 * DAY);
  const why = (r) => [URGENT.test(r.subject) && 'sounds time-bound', ASKS.test(r.subject) && 'asks you something', r.unread && 'unread', r.flagged && 'flagged', !r.sure && 'a person writing from a company that mostly sends bulk mail'].filter(Boolean).join(', ') || 'from a person, not answered yet';
  const seen = new Set();
  const out = rows.sort((a, b) => score(b) - score(a)).filter((r) => { const k = `${r.addr}|${r.subject}`; if (seen.has(k)) return false; seen.add(k); return true; });
  return { list: out.slice(0, max).map((r) => ({ ...r, why: why(r) })), all: out.length };
}
export function needsReplyText(r, days) {
  if (!r.list.length) return `No mail from people waiting for an answer in the last ${days} days.`;
  return `${r.all} from people may need an answer (last ${days} days), most pressing first:\n${r.list.map((x, i) => `${i + 1}) id ${x.uid} · ${x.name || x.addr} <${x.addr}> · "${x.subject}" · ${day(x.at)} · ${x.why}`).join('\n')}${r.all > r.list.length ? `\n…and ${r.all - r.list.length} more.` : ''}`;
}
// Each mailing list's recent posts (subjects only), biggest first.
export function listPosts(cat, { days = 14, perList = 8, now = Date.now() } = {}) {
  const from = now - Math.max(1, Math.min(365, Number(days) || 14)) * DAY;
  const by = new Map();
  for (const r of cat.rows) if (r.kind === 'list' && r.at >= from) { const g = by.get(r.org) || []; g.push(r); by.set(r.org, g); }
  return [...by].sort((a, b) => b[1].length - a[1].length).map(([org, rs]) => ({ org, name: rs.map((r) => r.name).find(Boolean) || org, count: rs.length, unread: rs.filter((r) => r.unread).length, posts: rs.slice(0, perList) }));
}
export function listPostsText(lists, days) {
  if (!lists.length) return `No mailing list posts in the last ${days} days.`;
  return lists.map((l) => `${l.name} (${l.org}): ${l.count} post${l.count === 1 ? '' : 's'}${l.unread ? `, ${l.unread} unread` : ''}\n${l.posts.map((p) => `  id ${p.uid} · "${p.subject}" · ${day(p.at)}`).join('\n')}`).join('\n');
}
// Senders with an unsubscribe link, the ones you never open first: how many, how many unread, and their own link.
export function unsubscribeList(cat, { max = 20 } = {}) {
  const by = new Map();
  for (const r of cat.rows) {
    if (!r.unsub || r.kind === 'person' || r.kind === 'scam') continue;
    const g = by.get(r.org) || { org: r.org, name: '', count: 0, unread: 0, link: r.unsub, newest: 0 };
    g.count++; if (r.unread) g.unread++; if (!g.name && r.name) g.name = r.name; if (r.at > g.newest) { g.newest = r.at; g.link = r.unsub; }
    by.set(r.org, g);
  }
  const host = (u) => { try { return new URL(u).hostname.toLowerCase(); } catch { return ''; } };
  return [...by.values()].map((g) => ({ ...g, never: g.unread / g.count, offsite: /^https:/i.test(g.link) && !host(g.link).endsWith(String(g.org).split('.').slice(-2).join('.')) }))
    .sort((a, b) => b.never - a.never || b.count - a.count).slice(0, max);
}
export function unsubscribeText(list) {
  if (!list.length) return 'No newsletters or offers with an unsubscribe link in the catalog.';
  return list.map((g) => `${g.name || g.org} (${g.org}): ${g.count} message${g.count === 1 ? '' : 's'}, ${Math.round(g.never * 100)}% never opened · leave: ${g.link}${g.offsite ? ' (this link goes to another site: check it before you click)' : ''}`).join('\n');
}
