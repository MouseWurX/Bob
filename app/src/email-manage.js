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
import { withMailbox, quote, decodeWords, parseHeaders, emailSettings, toMutf7 } from './email-read.js';
import { saveJson, oneWriter } from './saving.js';
import { cleanField, dangerSigns, MAIL_START, MAIL_END } from './email-safe.js';

// Subjects and names in an answer the brain reads are e-mail: fenced like read_email's (mail-guard.js locks the chat).
const fenced = (text, after = '') => `${MAIL_START}\n${text}\n${MAIL_END}${after ? `\n${after}` : ''}`;

export const MAX_IDS = 50;
const KEEP_UNDO = 30;
export const ACTIONS = ['sort', 'mark_read', 'mark_unread', 'flag', 'unflag', 'move', 'archive', 'trash', 'draft', 'undo'];
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
export const undoFile = (cfg) => path.join(cfg.innDir || cfg.dataDir, 'bob', 'email-undo.json');
export function loadUndo(cfg) { try { const v = JSON.parse(fs.readFileSync(undoFile(cfg), 'utf8')); return Array.isArray(v) ? v : []; } catch { return []; } }
const addUndo = (cfg, rec) => oneWriter(undoFile(cfg), () => { const list = loadUndo(cfg); list.push(rec); saveJson(undoFile(cfg), list.slice(-KEEP_UNDO)); });
const dropUndo = (cfg, id) => oneWriter(undoFile(cfg), () => saveJson(undoFile(cfg), loadUndo(cfg).filter((r) => r.id !== id)));

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
export function draftMessage({ from, to, subject, text, now = new Date() }) {
  const enc = (s) => (/^[\x20-\x7e]*$/.test(s) ? s : `=?UTF-8?B?${Buffer.from(s, 'utf8').toString('base64')}?=`);
  const clean = (s, n) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim().slice(0, n);
  const body = Buffer.from(String(text ?? '').replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/.{76}/g, '$&\r\n');
  const mid = `<bob-draft-${now.getTime().toString(36)}-${Math.random().toString(36).slice(2, 8)}@localhost>`;
  return { mid, raw: [`From: ${clean(from, 200)}`, ...(to ? [`To: ${clean(to, 500)}`] : []), `Subject: ${enc(clean(subject, 200))}`, `Date: ${now.toUTCString().replace('GMT', '+0000')}`, `Message-ID: ${mid}`, 'MIME-Version: 1.0', 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', body, ''].join('\r\n') };
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
      if (!to) throw new Error(action === 'move' ? `There's no folder called "${String(args.folder || '').slice(0, 60)}". Folders: ${folders.map((f) => f.shown).slice(0, 30).join(', ')}.` : `This account has no ${action === 'trash' ? 'Trash' : 'Archive'} folder Bob can find. Folders: ${folders.map((f) => f.shown).slice(0, 30).join(', ')}.`);
      if (to.name === folder) throw new Error(`Those are already in ${to.shown}.`);
    }
    const what = `${WORD[action]}${to ? ` (to ${to.shown})` : ''}: ${found.length} message${found.length === 1 ? '' : 's'}, ${list(found)}.${missing.length ? ` Not found now: ${missing.join(', ')}.` : ''}${action === 'trash' ? ' Nothing is deleted for good; it stays in Trash until it is emptied.' : ''}`;
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
      const d = draftMessage({ from: s.user, to: args.to, subject: args.subject, text: args.text });
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
  const since = new Date(Date.now() - Math.max(1, Math.min(365, Math.round(Number(days) || 30))) * DAY);
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

export async function sortPlan(brain, cfg, args, ctx, opts = {}) {
  const { folders, mail } = await scanMail(cfg, args, opts);
  if (!mail.length) return `No mail in ${emailSettings(cfg).folder} from the last ${Math.max(1, Number(args.days) || 30)} days to sort.`;
  const given = Array.isArray(args.batches) && args.batches.length;
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

// ---------------------------------------------------------------- the tool
const fn = (name, description, properties, required) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });

export function manageEmailTool(cfg, on = () => true, opts = {}, brain = null) {
  return {
    schema: fn('manage_email', 'Tidy the user\'s email. sort = a plan card the user approves (for a clean-up). Or mark, flag, move, archive, trash, draft (never sent), undo. ids from read_email.', {
      action: { type: 'string', enum: ACTIONS, description: 'What to do.' },
      ids: { type: 'array', items: { type: 'integer' }, description: 'Ids from read_email, up to 50.' },
      folder: { type: 'string', description: 'move: the folder name.' },
      to: { type: 'string', description: 'draft: who it is to.' },
      subject: { type: 'string', description: 'draft: the subject.' },
      text: { type: 'string', description: 'draft: what it says.' },
      undo: { type: 'string', description: 'undo: its id; none = the last.' },
      days: { type: 'integer', description: 'sort: days back (30).' },
      reply_first: { type: 'array', description: 'sort: answer first, most important first.', items: { type: 'object', properties: { id: { type: 'integer' }, why: { type: 'string' } } } },
      batches: { type: 'array', description: 'sort: your batches (optional).', items: { type: 'object', properties: { name: { type: 'string' }, why: { type: 'string' }, action: { type: 'string', enum: SORT_ACTIONS }, folder: { type: 'string' }, ids: { type: 'array', items: { type: 'integer' } } } } }
    }, ['action']),
    alwaysAsk: true, // a card even with "Work without asking" on: it's the person's mail
    ownCard: (args) => args?.action === 'sort', // the sort plan is its own card, so the mail lock adds none
    approvalGroup: 'email',
    async check(args) {
      if (!on()) throw new Error('Tidying email is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob tidy my email" (with "Let Bob read my email" on).');
      if (args?.action === 'sort') return false; // the sort plan is its own card (sortPlan)
      return (await planChange(cfg, args, opts)).text;
    },
    async run(args, ctx = {}) {
      if (!on()) return 'Tidying email is off. It\'s in Settings, How Bob works, 🧰 More tools: "Let Bob tidy my email".';
      if (args.action === 'sort') return sortPlan(brain, cfg, args, ctx, opts);
      // Planned again on its own connection: only the messages still there are changed, and the answer says which.
      return fenced(await doChange(cfg, await planChange(cfg, args, opts), args, opts), 'That is what was done. Tell the user in one or two lines.');
    },
    summary: ({ action, ids }) => `email: ${action}${Array.isArray(ids) && ids.length ? ` ${ids.length} message${ids.length === 1 ? '' : 's'}` : ''}`
  };
}
