// 📧 "Let Bob tidy my email" (Settings, How Bob works, 🧰 More tools; off by default, and only with "Let Bob read my
// email" on). The owner, Nov 13: "manage my email without destroying it". Written to docs/WRITING-TOOLS.md: one tool
// with an action, checks in code, a result that says exactly what changed.
//
// How it can't destroy mail:
// - Nothing is ever deleted for good. "trash" MOVES mail to the account's own Trash (Gmail keeps it 30 days, Outlook
//   and Hotmail until it's emptied), and nothing here empties a folder, sets \Deleted on its own or runs EXPUNGE.
//   Mail already in Trash or Junk, and Gmail's All Mail (where a move out would trash it), is never moved by Bob.
// - It never sends. "draft" saves a message in the Drafts folder; the person reads it and presses Send in their own
//   mail app.
// - Every change shows a card first with the messages it touches, even with "Work without asking" on.
// - Every change can be undone ("undo", or the undo id it gives): moves go back, flags flip back, a draft goes to Trash.
//   Messages are found again by their Message-ID, so it works on any server.
// - Up to 50 messages a call. Folder names are matched on the account's own special-use marks first (\Trash,
//   \Archive, \Drafts, \All), then on the usual names in English and French (Corbeille, Éléments supprimés...).
// Gmail (labels) and Outlook.com / Hotmail (folders) are both plain IMAP here. Pure Node; tests pass a fake `connect`.
import fs from 'node:fs';
import path from 'node:path';
import { withMailbox, quote, decodeWords, parseHeaders, emailSettings, toMutf7, imapDate } from './email-read.js';
import { saveJson, oneWriter } from './saving.js';
import { cleanField, dangerSigns, MAIL_START, MAIL_END } from './email-safe.js';
import { readText, writeText } from './vault.js';
import { catalogDir, fillCatalog, loadCatalog, select, dropRows, markRows, queued, catalogFile, statusLine, KINDS, KIND_WORD } from './mail-catalog.js';

// Subjects and names in an answer the brain reads are e-mail: fenced like read_email's (mail-guard.js locks the chat).
const fenced = (text, after = '') => `${MAIL_START}\n${text}\n${MAIL_END}${after ? `\n${after}` : ''}`;

export const MAX_IDS = 50;
const KEEP_UNDO = 30;
export const ACTIONS = ['sort', 'mark_read', 'mark_unread', 'flag', 'unflag', 'move', 'archive', 'trash', 'draft', 'undo'];
export const BULK = 'bulk'; // with the mail catalog on (mail-catalog.js): a whole company, sender or kind at once
export const BULK_DO = ['archive', 'trash', 'mark_read', 'move'];
export const BULK_MAX = 10000; // messages a bulk act; the rest on the next one
export const BULK_CHUNK = 500; // messages a server command
export const HOLD_RECENT_DAYS = 2;
export const MAX_SORT = 100;
export const BIG_SENDER = 5; // this many from one sender in the scan: a folder for them is suggested

// ---------------------------------------------------------------- folder names (IMAP's modified UTF-7, RFC 3501 5.1.3)
export function fromMutf7(s) {
  return String(s).replace(/&([^-]*)-/g, (all, b) => {
    if (!b) return '&';
    const bytes = Buffer.from(b.replace(/,/g, '/'), 'base64');
    let out = '';
    for (let i = 0; i + 1 < bytes.length; i += 2) out += String.fromCharCode((bytes[i] << 8) | bytes[i + 1]);
    return out;
  });
}
export { toMutf7 };

// The usual names, for servers that don't mark their folders. Lower case, accents kept.
const NAMES = {
  trash: ['trash', 'deleted', 'deleted items', 'deleted messages', 'bin', 'corbeille', 'éléments supprimés', '[gmail]/trash', '[gmail]/corbeille', '[gmail]/bin'],
  archive: ['archive', 'archives', '[gmail]/all mail', '[gmail]/tous les messages'],
  drafts: ['drafts', 'draft', 'brouillons', '[gmail]/drafts', '[gmail]/brouillons'],
  junk: ['junk', 'spam', 'junk email', 'courrier indésirable', 'pourriel', '[gmail]/spam']
};
const USE = { trash: '\\Trash', archive: '\\Archive', drafts: '\\Drafts', junk: '\\Junk', all: '\\All' };

// LIST lines -> [{ name (as the server spells it), shown (readable), uses: ['\\Trash', ...] }]
export function readFolders(lines) {
  const out = [];
  for (const l of lines) {
    const m = l.text.match(/^\* LIST \(([^)]*)\) (?:"[^"]*"|NIL) (?:"((?:[^"\\]|\\.)*)"|(\S+)|\{#(\d+)\})$/i);
    if (!m) continue;
    const name = m[2] != null ? m[2].replace(/\\(.)/g, '$1') : m[4] != null ? l.literals[Number(m[4])] : m[3];
    if (/\\Noselect|\\NonExistent/i.test(m[1])) continue;
    out.push({ name, shown: fromMutf7(name), uses: (m[1].match(/\\\w+/g) || []).map((x) => x.toLowerCase()) });
  }
  return out;
}
export function findFolder(folders, kind) {
  const gmail = folders.some((f) => /^\[gmail\]\//i.test(f.shown) || /^\[google mail\]\//i.test(f.shown));
  const use = (gmail && kind === 'archive' ? USE.all : USE[kind]).toLowerCase();
  return folders.find((f) => f.uses.includes(use))
    || folders.find((f) => (NAMES[kind] || []).includes(f.shown.toLowerCase()))
    || folders.find((f) => (NAMES[kind] || []).includes(f.shown.toLowerCase().replace(/^\[(?:gmail|google mail)\]\//, '')))
    || null;
}
// A folder the person named ("Receipts", "Factures", "Work/2026"), matched without case or accents.
const plainName = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
export function namedFolder(folders, want) {
  const w = plainName(want);
  if (!w) return null;
  return folders.find((f) => plainName(f.shown) === w) || folders.find((f) => plainName(f.shown).split('/').pop() === w) || null;
}
// Folders Bob never moves mail out of: Trash and Junk (a move there is the person's call), and Gmail's All Mail.
export function lockedFolder(folders, name) {
  const f = folders.find((x) => x.name === name);
  const hit = (k) => f && (f.uses.includes(USE[k].toLowerCase()) || (NAMES[k] || []).includes(f.shown.toLowerCase()));
  return Boolean(hit('trash') || hit('junk') || (f && f.uses.includes('\\all')) || /\[gmail\]\/(all mail|tous les messages)/i.test(f?.shown || ''));
}

// ---------------------------------------------------------------- the undo list
// 👥 Each user's own (inn\profiles\<id>\ for a user, inn\bob\ for the owner), locked with their key when their chats
// are: it names subjects, so nobody else signed in may read it.
export const undoFile = (cfg) => path.join(catalogDir(cfg), 'email-undo.json');
export function loadUndo(cfg) { try { const v = JSON.parse(readText(undoFile(cfg))); return Array.isArray(v) ? v : []; } catch (e) { if (e.code === 'VAULT_LOCKED') throw e; return []; } }
const putUndo = (cfg, list) => { fs.mkdirSync(path.dirname(undoFile(cfg)), { recursive: true }); writeText(cfg, undoFile(cfg), JSON.stringify(list.slice(-KEEP_UNDO), null, 1)); };
const addUndo = (cfg, rec) => oneWriter(undoFile(cfg), () => { const list = loadUndo(cfg); list.push(rec); putUndo(cfg, list); });
const dropUndo = (cfg, id) => oneWriter(undoFile(cfg), () => putUndo(cfg, loadUndo(cfg).filter((r) => r.id !== id)));

// ---------------------------------------------------------------- talking to the server
const uidsIn = (lines) => lines.flatMap((l) => (l.text.match(/^\* SEARCH\s*(.*)$/i)?.[1] || '').split(/\s+/)).filter((x) => /^\d+$/.test(x)).map(Number);
async function heads(imap, uids) {
  if (!uids.length) return [];
  const got = await imap.run(`UID FETCH ${uids.join(',')} (UID FLAGS BODY.PEEK[HEADER.FIELDS (MESSAGE-ID SUBJECT FROM)])`);
  return got.filter((l) => /FETCH/i.test(l.text)).map((l) => {
    const h = parseHeaders(l.literals.join('\n'));
    return { uid: Number((l.text.match(/\bUID (\d+)/) || [])[1]), mid: String(h['message-id'] || '').trim(), subject: decodeWords(h.subject || '(no subject)'), from: decodeWords(h.from || ''), flags: (l.text.match(/\bFLAGS \(([^)]*)\)/) || [])[1] || '' };
  }).filter((m) => m.uid);
}
async function moveUids(imap, caps, uids, to) {
  if (caps.has('MOVE')) return imap.run(`UID MOVE ${uids.join(',')} ${quote(to)}`);
  // Without MOVE: copy, then take only these copies' originals away with UID EXPUNGE (never a plain EXPUNGE, which
  // would also remove anything else marked deleted in the folder).
  if (!caps.has('UIDPLUS')) throw new Error('This mail server can\'t move messages safely (it has neither MOVE nor UIDPLUS), so Bob leaves them where they are.');
  await imap.run(`UID COPY ${uids.join(',')} ${quote(to)}`);
  await imap.run(`UID STORE ${uids.join(',')} +FLAGS.SILENT (\\Deleted)`);
  return imap.run(`UID EXPUNGE ${uids.join(',')}`);
}
// A new folder the person approved on the sort card (a label on Gmail). Only a plain name, at the top.
export const cleanFolderName = (s) => String(s ?? '').replace(/[\u0000-\u001f"\\/%*]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
async function makeFolder(imap, name) {
  const n = cleanFolderName(name);
  if (!n) throw new Error('A new folder needs a name.');
  try { await imap.run(`CREATE ${quote(toMutf7(n))}`); } catch (e) { if (!/exist/i.test(e.message)) throw e; }
  return toMutf7(n);
}
const capsOf = async (imap) => new Set((await imap.run('CAPABILITY')).flatMap((l) => (l.text.match(/^\* CAPABILITY (.*)$/i)?.[1] || '').toUpperCase().split(/\s+/)));

// A plain message for the Drafts folder (never sent from here).
export function draftMessage({ from, to, subject, text, inReplyTo = '', now = new Date() }) {
  const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
  const clean = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
  const body = Buffer.from(String(text ?? '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const mid = `<bob-draft-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}@localhost>`;
  return { mid, raw: [`From: ${clean(from, 200)}`, ...(to ? [`To: ${clean(to, 500)}`] : []), `Subject: ${enc(clean(subject, 200))}`, `Date: ${now.toUTCString().replace('GMT', '+0000')}`, `Message-ID: ${mid}`, ...(/^<[^<>\s]+>$/.test(inReplyTo) ? [`In-Reply-To: ${inReplyTo}`, `References: ${inReplyTo}`] : []), 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body, ''].join('\r\n') };
}

// A reply's address and subject, filled in by code from the message being answered (the brain writes only the words).
// Never to a message that looks dangerous; the reply goes to the sender's own address, not a Reply-To that points
// somewhere else (a scam's favourite trick).
export async function replyTarget(cfg, id, opts = {}) {
  const uid = Math.round(Number(id));
  if (!(uid > 0)) throw new Error('reply_to needs the id of the message being answered (from read_email).');
  return withMailbox(cfg, async (imap) => {
    const got = await imap.run(`UID FETCH ${uid} (UID BODY.PEEK[HEADER.FIELDS (FROM REPLY-TO SUBJECT MESSAGE-ID AUTHENTICATION-RESULTS)])`);
    const l = got.find((x) => /FETCH/i.test(x.text) && x.literals.length);
    if (!l) throw new Error(`There's no message ${uid} in that folder now, so there's nothing to reply to.`);
    const raw = parseHeaders(l.literals.join('\n'));
    const hd = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k, decodeWords(v)]));
    const danger = dangerSigns(hd);
    if (danger.length) throw new Error(`Message ${uid} is "${cleanField(hd.subject || '(no subject)', 80)}" from ${cleanField(hd.from || 'nobody', 60)}, and it looks dangerous (${danger.join('; ')}), so Bob won't draft a reply to it. Report it as spam in your mail app. If you meant someone else's mail, give reply_to_from with their name instead of an id.`);
    const who = String(hd.from || '').match(/<([^>]+)>/)?.[1] || String(hd.from || '').trim();
    if (!/^[^\s@<>]+@[^\s@<>]+$/.test(who)) throw new Error(`Message ${uid} has no sender address to reply to.`);
    const subj = cleanField(hd.subject || '', 180);
    return { to: who, subject: /^re:/i.test(subj) ? subj : `Re: ${subj}`, in_reply_to: String(raw['message-id'] || '').trim() };
  }, opts);
}

// 17 Nov (after1, M7): a reply by who it's to ("reply_to_from": "Wren"), so the brain needn't guess an id it never read.
// The newest message from that sender (with these words in the subject, if given) that doesn't look dangerous.
export async function replyIdFrom(cfg, from, words = '', opts = {}) {
  const who = String(from || '').replace(/[\r\n]/g, ' ').trim().slice(0, 100);
  if (!who) throw new Error('reply_to_from needs a name or address.');
  return withMailbox(cfg, async (imap) => {
    const since = new Date(Date.now() - 3650 * 86400000);
    const q = [`SINCE ${imapDate(since)}`, `FROM ${quote(who)}`, words ? `SUBJECT ${quote(String(words).slice(0, 100))}` : ''].filter(Boolean).join(' ');
    const found = await imap.run(`UID SEARCH ${q}`);
    const uids = found.flatMap((l) => (l.text.match(/^\* SEARCH\s*(.*)$/i)?.[1] || '').split(/\s+/)).filter((x) => /^\d+$/.test(x)).map(Number).sort((a, b) => b - a).slice(0, 20);
    if (!uids.length) throw new Error(`There's no mail from "${who}"${words ? ` about "${words}"` : ''} to reply to. Check the name with read_email list and from.`);
    const got = await imap.run(`UID FETCH ${uids.join(',')} (UID BODY.PEEK[HEADER.FIELDS (FROM REPLY-TO SUBJECT AUTHENTICATION-RESULTS)])`);
    for (const l of got.filter((x) => /FETCH/i.test(x.text) && x.literals.length).sort((a, b) => Number(b.text.match(/UID (\d+)/)?.[1]) - Number(a.text.match(/UID (\d+)/)?.[1]))) {
      const hd = Object.fromEntries(Object.entries(parseHeaders(l.literals.join('\n'))).map(([k, v]) => [k, decodeWords(v)]));
      if (!dangerSigns(hd).length) return Number(l.text.match(/UID (\d+)/)?.[1]);
    }
    throw new Error(`Every recent mail from "${who}" looks dangerous, so Bob won't draft a reply to it.`);
  }, opts);
}

// ---------------------------------------------------------------- what a call will do (for the card) and doing it
const cleanIds = (ids) => [...new Set([].concat(ids ?? []).flatMap((x) => String(x).split(/[\s,]+/)).filter((x) => /^\d+$/.test(x)).map(Number))];
const WORD = { mark_read: 'Mark as read', mark_unread: 'Mark as unread', flag: 'Flag', unflag: 'Take the flag off', move: 'Move', archive: 'Archive', trash: 'Move to Trash' };
const list = (ms) => ms.slice(0, 8).map((m) => `"${cleanField(m.subject, 60)}"`).join(', ') + (ms.length > 8 ? ` and ${ms.length - 8} more` : '');

export async function planChange(cfg, args, opts = {}) {
  const action = String(args.action || '');
  if (!ACTIONS.includes(action)) throw new Error(`action must be one of ${ACTIONS.join(', ')}.`);
  if (action === 'draft') {
    if (!String(args.text || '').trim()) throw new Error('A draft needs text: what the message says.');
    if ((args.reply_to == null || args.reply_to === '') && String(args.reply_to_from || '').trim()) args.reply_to = await replyIdFrom(cfg, args.reply_to_from, '', opts);
    if (args.reply_to != null && args.reply_to !== '') Object.assign(args, await replyTarget(cfg, args.reply_to, opts));
    return { action, text: `Save a draft${args.to ? ` to ${String(args.to).slice(0, 80)}` : ''}: "${String(args.subject || '(no subject)').slice(0, 80)}". It goes in Drafts and is NOT sent: you send it from your mail app.` };
  }
  if (action === 'undo') {
    const all = loadUndo(cfg);
    const rec = args.undo ? all.find((r) => r.id === String(args.undo)) : all.at(-1);
    if (!rec) throw new Error(args.undo ? `There's no change with undo id ${args.undo} (Bob keeps the last ${KEEP_UNDO}).` : 'Nothing to undo: Bob hasn\'t changed any mail yet.');
    return { action, rec, text: `Undo: ${rec.said}` };
  }
  const ids = cleanIds(args.ids);
  if (!ids.length) throw new Error('Which messages? Give ids from read_email (action list).');
  if (ids.length > MAX_IDS) throw new Error(`Up to ${MAX_IDS} messages at a time. Do the first ${MAX_IDS}, then the rest.`);
  const folder = emailSettings(cfg).folder;
  return withMailbox(cfg, async (imap) => {
    const folders = readFolders(await imap.run('LIST "" "*"'));
    const found = await heads(imap, ids);
    const missing = ids.filter((id) => !found.some((m) => m.uid === id));
    if (!found.length) throw new Error(`None of those messages are in ${fromMutf7(folder)} now. List them again with read_email.`);
    let to = null;
    if (['move', 'archive', 'trash'].includes(action)) {
      if (lockedFolder(folders, folder)) throw new Error(`Bob doesn't move mail out of ${fromMutf7(folder)} (Trash, Junk or All Mail): that's yours to do in your mail app.`);
      to = action === 'move' ? namedFolder(folders, args.folder) : findFolder(folders, action);
      // a folder the person named that isn't there yet is made (a label on Gmail), shown on the card first
      if (!to && action === 'move' && cleanFolderName(args.folder)) to = { name: toMutf7(cleanFolderName(args.folder)), shown: cleanFolderName(args.folder), make: true };
      if (!to) throw new Error(action === 'move' ? `There's no folder called "${String(args.folder || '').slice(0, 60)}". Folders: ${folders.map((f) => f.shown).slice(0, 30).join(', ')}.` : `This account has no ${action === 'trash' ? 'Trash' : 'Archive'} folder Bob can find. Folders: ${folders.map((f) => f.shown).slice(0, 30).join(', ')}.`);
      if (to.name === folder) throw new Error(`Those are already in ${to.shown}.`);
    }
    const what = `${WORD[action]}${to ? ` (to ${to.shown}${to.make ? ', a new folder' : ''})` : ''}: ${found.length} message${found.length === 1 ? '' : 's'}, ${list(found)}.${missing.length ? ` Not found now: ${missing.join(', ')}.` : ''}${action === 'trash' ? ' Nothing is deleted for good; it stays in Trash until it is emptied.' : ''}`;
    return { action, folder, to, found, text: what };
  }, opts);
}

export async function doChange(cfg, plan, args, opts = {}) {
  const { action } = plan;
  const id = Math.random().toString(36).slice(2, 7);
  if (action === 'draft') {
    const s = emailSettings(cfg);
    return withMailbox(cfg, async (imap) => {
      const folders = readFolders(await imap.run('LIST "" "*"'));
      const drafts = findFolder(folders, 'drafts');
      if (!drafts) throw new Error('This account has no Drafts folder Bob can find, so nothing was saved.');
      const d = draftMessage({ from: s.user, to: args.to, subject: args.subject, text: args.text, inReplyTo: args.in_reply_to || '' });
      await imap.append(`APPEND ${quote(drafts.name)} (\\Draft \\Seen)`, d.raw);
      await addUndo(cfg, { id, at: Date.now(), action, said: `saved the draft "${String(args.subject || '(no subject)').slice(0, 80)}" in ${drafts.shown}`, back: [{ folder: drafts.name, mids: [d.mid] }] });
      return `Saved a draft in ${drafts.shown}: "${String(args.subject || '(no subject)').slice(0, 80)}"${args.to ? ` to ${String(args.to).slice(0, 80)}` : ''}. It was NOT sent: open it in your mail app to check and send it. Undo id ${id}.`;
    }, { ...opts, write: true });
  }
  if (action === 'undo') return undoChange(cfg, plan.rec, opts);
  return withMailbox(cfg, async (imap) => {
    const caps = await capsOf(imap);
    const uids = plan.found.map((m) => m.uid);
    const mids = plan.found.map((m) => m.mid).filter(Boolean);
    const FLAG = { mark_read: '+FLAGS.SILENT (\\Seen)', mark_unread: '-FLAGS.SILENT (\\Seen)', flag: '+FLAGS.SILENT (\\Flagged)', unflag: '-FLAGS.SILENT (\\Flagged)' };
    let said;
    if (FLAG[action]) {
      await imap.run(`UID STORE ${uids.join(',')} ${FLAG[action]}`);
      const back = { mark_read: 'mark_unread', mark_unread: 'mark_read', flag: 'unflag', unflag: 'flag' }[action];
      said = `${WORD[action].toLowerCase()}: ${plan.found.length} message${plan.found.length === 1 ? '' : 's'} (${list(plan.found)})`;
      await addUndo(cfg, { id, at: Date.now(), action, said, back: [{ folder: plan.folder, mids, flag: back }] });
    } else {
      if (plan.to.make) await makeFolder(imap, plan.to.shown);
      await moveUids(imap, caps, uids, plan.to.name);
      said = `moved ${plan.found.length} message${plan.found.length === 1 ? '' : 's'} from ${fromMutf7(plan.folder)} to ${plan.to.shown} (${list(plan.found)})`;
      await addUndo(cfg, { id, at: Date.now(), action, said, back: [{ folder: plan.to.name, mids, moveTo: plan.folder }] });
    }
    return `Done: ${said}.${action === 'trash' ? ' Nothing was deleted for good.' : ''} Undo id ${id}.`;
  }, { ...opts, write: true });
}

async function undoChange(cfg, rec, opts = {}) {
  return withMailbox(cfg, async (imap) => {
    const caps = await capsOf(imap);
    const folders = readFolders(await imap.run('LIST "" "*"'));
    let n = 0;
    for (const b of rec.back) {
      await imap.run(`SELECT ${quote(b.folder)}`);
      const uids = [];
      for (const mid of b.mids) uids.push(...uidsIn(await imap.run(`UID SEARCH HEADER Message-ID ${quote(mid)}`)));
      if (!uids.length) continue;
      if (b.flag) await imap.run(`UID STORE ${uids.join(',')} ${{ mark_read: '+FLAGS.SILENT (\\Seen)', mark_unread: '-FLAGS.SILENT (\\Seen)', flag: '+FLAGS.SILENT (\\Flagged)', unflag: '-FLAGS.SILENT (\\Flagged)' }[b.flag]}`);
      else {
        const to = b.moveTo || findFolder(folders, 'trash')?.name; // a draft goes to Trash, never deleted
        if (!to) throw new Error('There\'s no Trash folder to put the draft in, so it was left in Drafts.');
        await moveUids(imap, caps, uids, to);
      }
      n += uids.length;
    }
    await dropUndo(cfg, rec.id);
    return n ? `Undone (${rec.id}): ${rec.said}. ${n} message${n === 1 ? '' : 's'} put back.` : `Couldn't undo ${rec.id}: those messages aren't where Bob left them any more (moved or changed since). Nothing was changed.`;
  }, { ...opts, write: true });
}

// ---------------------------------------------------------------- the sort plan (the owner, Nov 13: "present a plan
// before execution... show how he's going to sort, recommend what to delete, make it easy to move things from one to
// the other by batches"; "suggest making folders for large volume senders")
const senderOf = (from) => { const m = String(from).match(/<([^>]+)>/); return (m ? m[1] : String(from)).trim().toLowerCase(); };
const senderName = (from) => cleanField(String(from).replace(/<[^>]*>/, '').replace(/"/g, '').trim() || senderOf(from).split('@')[0], 40);
const DAY = 86400000;

// The app's own batches, from the headers alone (no model): mailing lists and promotions, big senders, the rest.
// Bob can send his own batches instead; either way the person changes them on the card before anything happens.
export function suggestBatches(mail, { now = Date.now() } = {}) {
  const bulk = (m) => m.list || /bulk|list/i.test(m.precedence || '');
  const counts = new Map();
  for (const m of mail) if (!bulk(m) && !m.danger?.length) counts.set(senderOf(m.from), (counts.get(senderOf(m.from)) || 0) + 1);
  const out = [], used = new Set();
  const add = (b, ms) => { if (ms.length) { out.push({ ...b, ids: ms.map((m) => m.uid) }); ms.forEach((m) => used.add(m.uid)); } };
  const old = (m) => m.at && now - m.at > 60 * DAY;
  add({ name: 'Looks dangerous', why: 'Found by my checks (each one says why). Don\'t open their links or attachments; report them as spam in your mail app.', action: 'keep' }, mail.filter((m) => m.danger?.length));
  add({ name: 'Old newsletters and offers, already read', why: 'Mailing lists more than 2 months old that you\'ve opened.', action: 'trash' }, mail.filter((m) => bulk(m) && !m.unread && old(m)));
  add({ name: 'Newsletters and offers', why: 'Sent to a mailing list (they have an unsubscribe link).', action: 'archive' }, mail.filter((m) => bulk(m) && !used.has(m.uid)));
  for (const [who, n] of [...counts].sort((a, b) => b[1] - a[1])) {
    if (n < BIG_SENDER) break;
    const ms = mail.filter((m) => !used.has(m.uid) && senderOf(m.from) === who);
    add({ name: `From ${senderName(ms[0]?.from || who)}`, why: `${n} messages from one sender: a folder of their own keeps the inbox clear.`, action: 'move', folder: senderName(ms[0]?.from || who), newFolder: true }, ms);
  }
  add({ name: 'Keep in the inbox', why: 'Everything else stays as it is.', action: 'keep' }, mail.filter((m) => !used.has(m.uid)));
  return out;
}

async function scanMail(cfg, { days = 30, limit = MAX_SORT } = {}, opts = {}) {
  const n = Math.max(1, Math.min(MAX_SORT, Math.round(Number(limit) || MAX_SORT)));
  const since = new Date(Date.now() - Math.max(1, Math.min(3650, Math.round(Number(days) || 30))) * DAY);
  return withMailbox(cfg, async (imap) => {
    const folders = readFolders(await imap.run('LIST "" "*"'));
    const mon = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][since.getUTCMonth()];
    const uids = uidsIn(await imap.run(`UID SEARCH SINCE ${since.getUTCDate()}-${mon}-${since.getUTCFullYear()}`)).sort((a, b) => b - a).slice(0, n);
    if (!uids.length) return { folders, mail: [] };
    const got = await imap.run(`UID FETCH ${uids.join(',')} (UID FLAGS BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE MESSAGE-ID LIST-UNSUBSCRIBE LIST-ID PRECEDENCE REPLY-TO AUTHENTICATION-RESULTS)])`);
    const mail = got.filter((l) => /FETCH/i.test(l.text)).map((l) => {
      const h = parseHeaders(l.literals.join('\n'));
      const flags = (l.text.match(/\bFLAGS \(([^)]*)\)/) || [])[1] || '';
      const hd = Object.fromEntries(Object.entries(h).map(([k, v]) => [k, decodeWords(v)]));
      // Attachment names from BODYSTRUCTURE (never the attachments themselves), for the danger check.
      const files = [...l.text.matchAll(/"(?:file)?name\*?"\s+"((?:[^"\\]|\\.)*)"/gi)].map((x) => decodeWords(x[1])).slice(0, 10);
      return { uid: Number((l.text.match(/\bUID (\d+)/) || [])[1]), from: hd.from || '', subject: hd.subject || '(no subject)', at: Date.parse(h.date || '') || 0, unread: !/\\Seen/i.test(flags), list: Boolean(h['list-unsubscribe'] || h['list-id']), precedence: h.precedence || '', danger: dangerSigns(hd, { attachments: files }) };
    }).filter((m) => m.uid);
    return { folders, mail };
  }, opts);
}

// Which to answer first, most important first (the owner: "in order of assumed importance"). Bob's own order when he
// gives one (ids from the scan, with a reason); otherwise a guess from the headers: unread mail from a person (not a
// mailing list or a no-reply address), sooner if the subject asks something or says it's urgent, then newest.
const NOREPLY = /no-?reply|do-?not-?reply|notifications?@|mailer-daemon|newsletter|news@|info@|marketing/i;
const URGENT = /\b(urgent|asap|today|tomorrow|deadline|overdue|due|reminder|invoice|payment|action required|important|please reply|répondre|urgent|rappel|facture|paiement|échéance)\b/i;
export function replyFirst(mail, given, { max = 8 } = {}) {
  const byId = new Map(mail.map((m) => [m.uid, m]));
  const mine = (Array.isArray(given) ? given : []).map((g) => ({ id: Number(g?.id ?? g), why: String(g?.why || '').slice(0, 120) })).filter((g) => byId.has(g.id) && !byId.get(g.id).danger?.length);
  const seen = new Set(mine.map((g) => g.id));
  const score = (m) => (m.unread ? 4 : 0) + (/\?/.test(m.subject) ? 2 : 0) + (URGENT.test(m.subject) ? 3 : 0) + (/^(re|tr|fwd?):/i.test(m.subject) ? 1 : 0);
  const guess = mail.filter((m) => !seen.has(m.uid) && !m.danger?.length && !m.list && !/bulk|list/i.test(m.precedence || '') && !NOREPLY.test(m.from) && (m.unread || URGENT.test(m.subject)))
    .sort((a, b) => score(b) - score(a) || b.at - a.at)
    .map((m) => ({ id: m.uid, why: [URGENT.test(m.subject) && 'sounds time-bound', /\?/.test(m.subject) && 'asks you something', /^(re|tr|fwd?):/i.test(m.subject) && 'part of a conversation', m.unread && 'unread, from a person'].filter(Boolean).slice(0, 2).join(', ') }));
  return [...mine, ...guess].slice(0, max).map((g) => ({ ...g, why: cleanField(g.why, 120), subject: cleanField(byId.get(g.id).subject, 120), from: senderName(byId.get(g.id).from) }));
}

const SORT_ACTIONS = ['keep', 'mark_read', 'archive', 'trash', 'move'];
// Bob's batches (or the app's), checked: real ids from the scan only, each id in one batch, known actions.
export function cleanBatches(batches, mail) {
  const have = new Set(mail.map((m) => m.uid)), seen = new Set();
  const out = [];
  for (const b of (Array.isArray(batches) ? batches : []).slice(0, 12)) {
    const ids = [].concat(b?.ids ?? []).map(Number).filter((id) => have.has(id) && !seen.has(id));
    ids.forEach((id) => seen.add(id));
    const action = SORT_ACTIONS.includes(b?.action) ? b.action : 'keep';
    if (ids.length) out.push({ key: `b${out.length + 1}`, name: cleanField(b?.name || 'Batch', 60), why: cleanField(b?.why || '', 160), action, folder: action === 'move' ? cleanFolderName(b?.folder) : '', newFolder: Boolean(b?.newFolder), ids });
  }
  const rest = mail.map((m) => m.uid).filter((id) => !seen.has(id));
  if (rest.length) out.push({ key: `b${out.length + 1}`, name: 'Everything else', why: 'Not in a batch: stays as it is.', action: 'keep', folder: '', newFolder: false, ids: rest });
  return out;
}

// The person's answer on the card: [{ id, batch }] plus [{ batch, action, folder }] -> what to do, checked again.
export function finalBatches(batches, answer, folders = []) {
  const byKey = new Map(batches.map((b) => [b.key, { ...b, ids: [] }]));
  const all = new Set(batches.flatMap((b) => b.ids));
  for (const a of answer || []) {
    if (a && a.batch && byKey.has(a.batch) && a.set) { const b = byKey.get(a.batch); if (SORT_ACTIONS.includes(a.set.action)) b.action = a.set.action; if (a.set.action === 'move') { b.folder = cleanFolderName(a.set.folder) || b.folder; b.newFolder = !namedFolder(folders, b.folder); } }
  }
  const placed = new Set();
  for (const a of answer || []) if (a && all.has(Number(a.id)) && byKey.has(a.batch) && !placed.has(Number(a.id))) { byKey.get(a.batch).ids.push(Number(a.id)); placed.add(Number(a.id)); }
  // Anything the answer left out stays in the batch it started in.
  for (const b of batches) for (const id of b.ids) if (!placed.has(id)) byKey.get(b.key).ids.push(id);
  return [...byKey.values()].filter((b) => b.ids.length);
}

export const sortNamesFolders = (text) => /\b(?:folders?|labels?)\b/i.test(String(text || ''));
export async function sortPlan(brain, cfg, args, ctx, opts = {}) {
  const { folders, mail } = await scanMail(cfg, args, opts);
  if (!mail.length) return `No mail in ${emailSettings(cfg).folder} from the last ${Math.max(1, Number(args.days) || 30)} days to sort.`;
  const given = Array.isArray(args.batches) && args.batches.length;
  // 21 Nov (steps40: sort jobs 95% -> 0): with no batches the app's own plan archives newsletters and notices, which
  // ignored the folders the user named ("Newsletters and Notices folders"). Asked for folders: his batches, or bulk.
  if (!given && sortNamesFolders(ctx?.turnText)) return 'Error: not run. The ask names folders, and with no batches the app would only use its own plan (archive newsletters and notices), not those folders. Next: call manage_email sort again with batches, each with action "move" and the folder named in the ask, or use bulk with that folder.';
  const batches = cleanBatches(given ? args.batches : suggestBatches(mail), mail);
  for (const b of batches) if (b.action === 'move') b.newFolder = !namedFolder(folders, b.folder);
  const byId = new Map(mail.map((m) => [m.uid, m]));
  const card = { batches: batches.map((b) => ({ ...b, items: b.ids.map((id) => ({ id, subject: cleanField(byId.get(id).subject, 120), from: senderName(byId.get(id).from), unread: byId.get(id).unread, danger: byId.get(id).danger || [] })) })), folders: folders.map((f) => f.shown).filter((n) => !/^\[gmail\]$/i.test(n)).slice(0, 80), replyFirst: replyFirst(mail, args.reply_first) };
  const total = mail.length;
  const answer = await brain.approve({ text: `Bob's plan for ${total} message${total === 1 ? '' : 's'} in ${fromMutf7(emailSettings(cfg).folder)}`, sortCard: card }, ctx.emit, ctx.signal, null, { hand: true });
  const who = cfg.userName || 'the user';
  if (answer?.note) return `${who} wants a change before anything is done: "${answer.note}". Nothing was changed. Make new batches with that change and call manage_email with action sort again.`;
  if (!answer?.allow) return `${who} said not now. Nothing was changed. Say that's fine.`;
  const plan = finalBatches(batches, answer.items, folders).filter((b) => b.action !== 'keep');
  if (!plan.length) return `${who} kept everything where it is. Nothing was changed.`;
  const done = [];
  for (const b of plan) {
    try {
      let folder = b.folder;
      if (b.action === 'move' && b.newFolder) folder = fromMutf7(await withMailbox(cfg, (imap) => makeFolder(imap, b.folder), { ...opts, write: true }));
      for (let i = 0; i < b.ids.length; i += MAX_IDS) {
        const one = { action: b.action, ids: b.ids.slice(i, i + MAX_IDS), folder };
        const p = await planChange(cfg, one, opts);
        done.push(`${b.name}: ${(await doChange(cfg, p, one, opts)).replace(/^Done: /, '')}${b.newFolder && i === 0 ? ` (new folder ${folder})` : ''}`);
      }
    } catch (e) { done.push(`${b.name}: not done (${e.message})`); }
  }
  const first = card.replyFirst.length ? `\nReply first (most important first): ${card.replyFirst.map((r, i) => `${i + 1}) id ${r.id} "${r.subject.slice(0, 60)}"`).join('; ')}.` : '';
  const bad = mail.filter((m) => m.danger?.length).length;
  return fenced(`${done.join('\n')}${first}`, `${who} approved the plan, and the lines above are what was done.${bad ? ` ${bad} message${bad === 1 ? '' : 's'} looked dangerous (shown on the card).` : ''} Tell ${who} in a few lines what changed; every batch has its own undo id.`);
}

// 23 Nov 2026 (the owner: "For the mail moving and deleting he should ask for permission before doing anything"; a run
// archived 25 newsletters when the ask was only to get off the lists): mail is moved, archived, trashed or sorted only when
// the person's message asks for that kind of tidying, or says yes to Bob's offer. Otherwise Bob offers it in words and
// waits. The card still comes after that, every time. Marking, flagging, drafts and undo are not held back here.
const MOVES = new Set(['move', 'archive', 'trash', 'sort']);
const TIDY_ASK = /\b(mov(e|es|ed|ing)|archiv\w*|trash\w*|delet\w*|remov\w*|clean\w*|tid(y|ies|ied|ying)|sort\w*|clear\w*|get rid|organi[sz]\w*|declutter\w*|put (them|it|these|those|all)|folders?|bin (them|it|these|those|all))\b/i;
const SAYS_YES = /^\W*(y(es|ep|eah|up)|ok(ay)?|sure|go( ahead| for it)?|do (it|that|them|those|so)|please( do)?|sounds good|fine|alright|all right|yes please|that'?s fine|approved?)\b/i;
export function notAskedToMove(args, ask, who = 'the user') {
  const a = String(args?.action || ''), moves = MOVES.has(a) || (a === BULK && ['archive', 'trash', 'move'].includes(String(args?.do || '')));
  const text = String(ask ?? '').trim();
  if (!moves || !text || TIDY_ASK.test(text) || SAYS_YES.test(text)) return '';
  return `Not run: ${who} didn't ask to move, archive or trash mail. Don't change the mailbox now. In your answer, say what you would move and where, and ask; do it only after ${who} says yes.`;
}

// ---------------------------------------------------------------- bulk acts (the mail catalog, mail-catalog.js; the owner,
// 16 Nov 2026: "could bob do bulk delete? or bulk archive?"). A whole company, sender, kind or age at once, from the
// catalog, never from the brain's own list of ids. Always a card first with the count, the dates, a few samples and
// what is held back. Held back by code: mail from people (unless the person asked for that sender or for people),
// flagged mail, mail from the last 2 days (unless an age was given), and scams (except into Trash, shown apart).
// Done 500 at a time; Trash is Trash (nothing deleted for good); one undo id for the whole act.
const DAYS_OF = (t) => (t ? new Date(t).toISOString().slice(0, 10) : '?');
const BULK_WORD = { archive: 'Archive', trash: 'Move to Trash', mark_read: 'Mark as read', move: 'Move' };
const sample = (r) => `${cleanField(r.name || r.addr, 40)} · "${cleanField(r.subject, 70)}" · ${DAYS_OF(r.at)}`;
function filterWords(a) {
  const k = [].concat(a.kind || []).filter((x) => KINDS.includes(x));
  return [a.org && `from ${cleanField(a.org, 60)}`, a.sender && `from ${cleanField(a.sender, 60)}`, k.length && `(${k.map((x) => KIND_WORD[x]).join(', ')})`,
    Number(a.older_than_days) > 0 && `older than ${Math.round(Number(a.older_than_days))} days`, a.words && `with "${cleanField(a.words, 40)}" in the subject`, a.unread && 'unread'].filter(Boolean).join(' ');
}
let lastBulk = null; // the card's plan, so the act does what the card showed (2 minutes)
export async function planBulk(cfg, args, opts = {}, { now = Date.now() } = {}) {
  const what = String(args.do || '');
  if (!BULK_DO.includes(what)) throw new Error(`bulk needs do: one of ${BULK_DO.join(', ')}.`);
  const kinds = [].concat(args.kind || []).filter((k) => KINDS.includes(k));
  if (!args.org && !args.sender && !kinds.length && !(Number(args.older_than_days) > 0) && !args.words) throw new Error('A bulk act needs at least one of: org, sender, kind, older_than_days, words. Bob never acts on a whole inbox in one go.');
  if (what === 'move' && !String(args.folder || '').trim()) throw new Error('move needs a folder name.');
  const fill = await fillCatalog(cfg, { perCall: 100000, untilMs: Number(opts.fillMs) || 20000 }, opts);
  const cat = loadCatalog(cfg);
  const found = select(cat, args, { now });
  // 21 Nov 2026 (after2: at Minimus and Medius, "Trash everything from Kettle & Crumb" trashed Wren's hand-written catering
  // order): a sender that only names the company (its domain or name) used to count as asking for its people too. Now a
  // person is let go only when the sender names that person (their name or the part of the address before the @), or,
  // for a person at an ordinary sender, when kind person was asked; a person at a bulk sender always needs naming.
  const want = String(args.sender || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const pl = (x) => String(x ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  const named = (r) => Boolean(want) && want.length >= 3 && (pl(String(r.addr).split('@')[0]).includes(want) || pl(r.name).includes(want) || want.includes(pl(String(r.addr).split('@')[0])) && pl(String(r.addr).split('@')[0]).length >= 3);
  const askedFor = (r) => named(r) || (kinds.includes('person') && r.sure);
  const recentFrom = now - HOLD_RECENT_DAYS * DAY;
  const held = { person: [], flagged: [], recent: [], scam: [] };
  const go = [], scams = [];
  for (const r of found) {
    if (r.flagged) held.flagged.push(r);
    else if (r.kind === 'scam' && what !== 'trash') held.scam.push(r);
    else if ((r.kind === 'person' || !r.sure) && !askedFor(r)) held.person.push(r);
    else if (!(Number(args.older_than_days) > 0) && !args.include_recent && !(args.sender && ((r.kind !== 'person' && r.sure) || named(r))) && r.at >= recentFrom) held.recent.push(r);
    else { go.push(r); if (r.kind === 'scam') scams.push(r); }
  }
  const take = go.slice(0, BULK_MAX), over = go.length - take.length;
  const desc = filterWords(args);
  const heldText = [held.person.length && `${held.person.length} from ${held.person.length === 1 ? 'a person' : 'people'} (${held.person.slice(0, 3).map(sample).join('; ')}): left alone, ask for them by name if they should go too`,
    held.flagged.length && `${held.flagged.length} flagged`, held.recent.length && `${held.recent.length} from the last ${HOLD_RECENT_DAYS} days`, held.scam.length && `${held.scam.length} that look dangerous (move those to Trash, or report them as spam in your mail app)`].filter(Boolean);
  const ats = take.map((r) => r.at).filter(Boolean);
  const text = take.length
    ? `${BULK_WORD[what]}${what === 'move' ? ` to ${cleanField(args.folder, 60)}` : ''}: ${take.length} message${take.length === 1 ? '' : 's'} ${desc}, ${DAYS_OF(Math.min(...ats))} to ${DAYS_OF(Math.max(...ats))}. For example: ${take.slice(0, 5).map(sample).join('; ')}.`
      + `${scams.length ? ` ${scams.length} of them look dangerous.` : ''}${heldText.length ? ` Held back: ${heldText.join('; ')}.` : ''}${over ? ` ${over} more match: the next bulk act does them.` : ''}`
      + `${fill.left ? ` ${statusLine(fill)}` : ''}${what === 'trash' ? ' Nothing is deleted for good; it stays in Trash until it is emptied.' : ''} One undo id undoes it all.`
    : `Nothing to ${BULK_WORD[what].toLowerCase()} ${desc}.${heldText.length ? ` Held back: ${heldText.join('; ')}.` : ''}${fill.left ? ` ${statusLine(fill)}` : ''}`;
  const plan = { action: BULK, what, args: { ...args }, rows: take, text, empty: !take.length, at: now, key: JSON.stringify(args), heldText, over };
  lastBulk = plan;
  return plan;
}
export async function doBulk(cfg, plan, opts = {}, ctx = {}) {
  if (plan.empty) return plan.text;
  const id = Math.random().toString(36).slice(2, 7);
  const folder = emailSettings(cfg).folder;
  return queued(catalogFile(cfg), () => withMailbox(cfg, async (imap) => {
    const caps = await capsOf(imap);
    const folders = readFolders(await imap.run('LIST "" "*"'));
    let to = null;
    if (plan.what !== 'mark_read') {
      if (lockedFolder(folders, folder)) throw new Error(`Bob doesn't move mail out of ${fromMutf7(folder)} (Trash, Junk or All Mail): that's yours to do in your mail app.`);
      to = plan.what === 'move' ? namedFolder(folders, plan.args.folder) : findFolder(folders, plan.what);
      if (!to && plan.what === 'move') to = { name: await makeFolder(imap, plan.args.folder), shown: cleanFolderName(plan.args.folder) };
      if (!to) throw new Error(`This account has no ${plan.what === 'trash' ? 'Trash' : 'Archive'} folder Bob can find. Folders: ${folders.map((f) => f.shown).slice(0, 30).join(', ')}.`);
      if (to.name === folder) throw new Error(`Those are already in ${to.shown}.`);
    }
    const done = [], mids = [];
    for (let i = 0; i < plan.rows.length; i += BULK_CHUNK) {
      if (ctx.signal?.aborted) break;
      const part = plan.rows.slice(i, i + BULK_CHUNK);
      const uids = part.map((r) => r.uid);
      if (plan.what === 'mark_read') await imap.run(`UID STORE ${uids.join(',')} +FLAGS.SILENT (\\Seen)`);
      else await moveUids(imap, caps, uids, to.name);
      done.push(...part); mids.push(...part.map((r) => r.mid).filter(Boolean));
      ctx.emit?.({ type: 'progress', text: `${BULK_WORD[plan.what]}: ${done.length} of ${plan.rows.length}` });
    }
    if (!done.length) return 'Stopped before anything was changed.';
    const said = `${plan.what === 'mark_read' ? 'marked as read' : `moved to ${to.shown}`}: ${done.length} message${done.length === 1 ? '' : 's'} ${filterWords(plan.args)}`;
    await addUndo(cfg, { id, at: Date.now(), action: BULK, said, back: [plan.what === 'mark_read' ? { folder, mids, flag: 'mark_unread' } : { folder: to.name, mids, moveTo: folder }] });
    if (plan.what === 'mark_read') markRows(cfg, done.map((r) => r.uid), { unread: false }); else dropRows(cfg, done.map((r) => r.uid));
    const left = plan.rows.length - done.length;
    // 17 Nov (after1): the done line says what stayed and what is left, so the answer can't claim a held-back mail went too
    // (Medius said Wren's order was trashed; it was held back) or that 10,000 of 35,000 was the lot.
    const heldNow = plan.heldText?.length ? ` Held back, still where it was: ${plan.heldText.join('; ')}.` : '';
    const more = plan.over ? ` ${plan.over} more match and are NOT done yet: call the same bulk act again for the next ${Math.min(plan.over, BULK_MAX)}.` : '';
    return `Done: ${said}.${left ? ` Stopped with ${left} not done (they're where they were).` : ''}${heldNow}${more}${plan.what === 'trash' ? ' Nothing was deleted for good.' : ''} Undo id ${id}.`;
  }, { ...opts, write: true }));
}
const freshBulk = (args) => (lastBulk && lastBulk.key === JSON.stringify(args) && Date.now() - lastBulk.at < 120000 ? lastBulk : null);

// ---------------------------------------------------------------- the tool
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function manageEmailTool(cfg, on = () => true, opts = {}, brain = null) {
  // With the mail catalog on (opts.catalogOn), one more action, bulk; with it off, the schema is exactly as before.
  const catalogOn = () => (typeof opts.catalogOn === 'function' ? opts.catalogOn() : cfg?.moreTools?.emailCatalog === true);
  const plainSchema = fn('manage_email', 'Tidy the user\'s email. sort = a plan card the user approves (for a clean-up). Or mark, flag, move, archive, trash, draft (never sent), undo. ids from read_email.', {
      action: { type: 'string', enum: ACTIONS, description: 'What to do.' },
      ids: { type: 'array', items: { type: 'integer' }, description: 'Ids from read_email, up to 50.' },
      folder: { type: 'string', description: 'move: the folder name.' },
      to: { type: 'string', description: 'draft: who it is to.' },
      subject: { type: 'string', description: 'draft: the subject.' },
      text: { type: 'string', description: 'draft: what it says.' },
      undo: { type: 'string', description: 'undo: its id; none = the last.' },
      days: { type: 'integer', description: 'sort: days back (30).' },
      reply_first: { type: 'array', description: 'sort: answer first, most important first.', items: { type: 'object', properties: { id: { type: 'integer' }, why: { type: 'string' } } } },
      batches: { type: 'array', description: 'sort: your batches; needed when folders are named.', items: { type: 'object', properties: { name: { type: 'string' }, why: { type: 'string' }, action: { type: 'string', enum: SORT_ACTIONS }, folder: { type: 'string' }, ids: { type: 'array', items: { type: 'integer' } } } } }
    }, ['action']);
  const p = plainSchema.function.parameters;
  const bulkSchema = fn('manage_email', 'Tidy the user\'s email. sort = a plan card the user approves (for a clean-up). bulk = a whole company, sender, kind or age at once (from the catalog, any size). Or mark, flag, move, archive, trash, draft (never sent), undo. ids from read_email.', {
    ...p.properties,
    action: { type: 'string', enum: [...ACTIONS, BULK], description: 'What to do.' },
    do: { type: 'string', enum: BULK_DO, description: 'bulk: what to do with them.' },
    org: { type: 'string', description: 'bulk: the company or mailing list, by name or domain.' },
    sender: { type: 'string', description: 'bulk: one sender, by name or address.' },
    kind: { type: 'array', items: { type: 'string', enum: KINDS }, description: 'bulk: only these kinds.' },
    older_than_days: { type: 'integer', description: 'bulk: only mail older than this.' },
    words: { type: 'string', description: 'bulk: only subjects with these words.' },
    reply_to: { type: 'integer', description: 'draft: the id being answered; who it goes to and the subject are filled in.' },
    reply_to_from: { type: 'string', description: 'draft: or, instead of an id, the name of the person being answered (their newest mail).' }
  }, ['action']);
  return {
    get schema() { return catalogOn() ? bulkSchema : plainSchema; },
    alwaysAsk: true, // a card even with "Work without asking" on: it's the person's mail
    ownCard: (args) => args?.action === 'sort', // the sort plan is its own card, so the mail lock adds none
    approvalGroup: 'email',
    async check(args, ctx) {
      if (!on()) throw new Error('Tidying email is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob tidy my email" (with "Let Bob read my email" on).');
      const why = notAskedToMove(args, ctx?.turnText, cfg.userName || 'the user');
      if (why) throw new Error(why);
      if (args?.action === 'sort') return false; // the sort plan is its own card (sortPlan)
      if (args?.action === BULK) {
        if (!catalogOn()) throw new Error('Bulk acts need the mail catalog: Settings, How Bob works, 🧰 More tools, "Let Bob catalog my email".');
        return (await planBulk(cfg, args, opts)).text;
      }
      return (await planChange(cfg, args, opts)).text;
    },
    async run(args, ctx = {}) {
      if (!on()) return 'Tidying email is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob tidy my email".';
      if (args.action === 'sort') return sortPlan(brain, cfg, args, ctx, opts);
      if (args.action === BULK) {
        if (!catalogOn()) return 'Bulk acts need the mail catalog: Settings, How Bob works, 🧰 More tools, "Let Bob catalog my email".';
        const plan = freshBulk(args) || await planBulk(cfg, args, opts);
        lastBulk = null;
        return fenced(await doBulk(cfg, plan, opts, ctx), 'That is what was done. Tell the user in one or two lines, with the count and the undo id.');
      }
      // Planned again on its own connection: only the messages still there are changed, and the answer says which.
      return fenced(await doChange(cfg, await planChange(cfg, args, opts), args, opts), 'That is what was done. Tell the user in one or two lines.');
    },
    summary: ({ action, ids, do: what, org, sender }) => `email: ${action}${action === BULK ? ` ${what || ''} ${String(org || sender || '').slice(0, 40)}`.trimEnd() : ''}${Array.isArray(ids) && ids.length ? ` ${ids.length} message${ids.length === 1 ? '' : 's'}` : ''}`
  };
}
