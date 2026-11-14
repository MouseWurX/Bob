// 📧 Email account (Settings, Online services): one place for your mail account, used by everything that needs it:
// "Let Bob read my email" (More tools, email-read.js) and the passcode reset's code (lock-reset.js, email-send.js).
// The details live where they always have (settings.json moreTools.email*); the app password is in the locked store
// (BOB_EMAIL_PASSWORD, secret-box.js). 👥 While a user is in (profiles.js), the page and every reader use that user's
// own account instead (user-email.js); a passcode reset code always goes to the owner's ({ owner: true }).
//   GET  /api/email-account   the details (never the password: only whether one is saved)
//   POST /api/email-account   { host, port, user, folder, sendHost, sendPort, password, forgetPassword, testRead, testSend }
import { saveSettings } from './config.js';
import { cleanMoreTools, moreTools, EMAIL_KEY } from './more-tools.js';
import { keyValue, saveKey } from './secret-box.js';
import { listMail } from './email-read.js';
import { sendMail, smtpFor, maskAddress } from './email-send.js';
import { userAccount, userPassword, saveUserAccount } from './user-email.js';

export function accountFor(cfg, { owner = false } = {}) {
  const u = owner ? null : userAccount(cfg);
  if (u) { const auto = smtpFor(u.host); return { host: u.host, port: u.port, user: u.user, folder: u.folder, sendHost: u.sendHost || auto.host, sendPort: u.sendPort || auto.port, sendAuto: !u.sendHost }; }
  const m = moreTools(cfg);
  const auto = smtpFor(m.emailHost);
  return { host: m.emailHost, port: m.emailPort, user: m.emailUser, folder: m.emailFolder,
    sendHost: m.emailSendHost || auto.host, sendPort: m.emailSendPort || auto.port, sendAuto: !m.emailSendHost };
}
const password = (cfg, owner = false) => { try { return !owner && cfg?.profileNow ? userPassword(cfg) : keyValue(EMAIL_KEY); } catch { return ''; } };
export const canSend = (cfg, { owner = false } = {}) => { const a = accountFor(cfg, { owner }); return Boolean(a.user && a.sendHost && password(cfg, owner)); };

// One email to your own account, from your own account. Nothing else is ever sent. A passcode reset passes
// { owner: true }: its code goes to the owner's account even while a user is in.
export async function sendToSelf(cfg, subject, text, opts = {}) {
  const { owner: ownerOnly, ...rest } = opts || {};
  const owner = ownerOnly === true;
  const a = accountFor(cfg, { owner });
  await sendMail({ host: a.sendHost, port: a.sendPort, user: a.user, password: password(cfg, owner), to: a.user, subject, text }, rest);
  return { to: maskAddress(a.user) };
}

export const accountView = (cfg) => ({ ...accountFor(cfg), passwordSaved: Boolean(password(cfg)), readOn: cfg?.moreTools?.email === true, canSend: canSend(cfg), forUser: cfg?.profileNow ? String((cfg.profiles?.list || []).find((p) => p?.id === cfg.profileNow)?.name || 'you') : '' });

export async function emailAccountRoute({ req, res, p, isLocal, cfg, brain, body, send, sendOpts }) {
  if (p !== '/api/email-account') return false;
  if (req.method === 'GET') { send(res, 200, accountView(cfg)); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'not found' }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Your email account can only be changed on this replicant matrix itself.' }); return true; }
  const b = await body(req);
  const log = (t) => brain?.log?.('settings', `📧 Email account: ${t}`);
  const out = {};
  try {
    const keys = { host: 'emailHost', port: 'emailPort', user: 'emailUser', folder: 'emailFolder', sendHost: 'emailSendHost', sendPort: 'emailSendPort' };
    if (cfg.profileNow) { // 👥 a user's own account (user-email.js); the owner's is never touched from here
      const patch = Object.fromEntries(Object.keys(keys).filter((k) => k in b).map((k) => [k, b[k]]));
      const pass = typeof b.password === 'string' && b.password.trim() ? b.password : undefined;
      if (Object.keys(patch).length || pass || b.forgetPassword === true) { saveUserAccount(cfg, patch, { password: pass, forget: b.forgetPassword === true }); log('a user\'s own account saved'); }
    } else {
      const patch = {};
      for (const [k, f] of Object.entries(keys)) if (k in b) patch[f] = b[k];
      if (Object.keys(patch).length) { saveSettings(cfg, { moreTools: cleanMoreTools({ ...moreTools(cfg), ...patch }) }); log('details saved'); }
      if (typeof b.password === 'string' && b.password.trim()) { saveKey(cfg, EMAIL_KEY, b.password.trim()); log('app password saved (locked)'); }
      if (b.forgetPassword === true) { saveKey(cfg, EMAIL_KEY, ''); log('app password removed'); }
    }
    if (b.testRead === true) {
      try { const r = await listMail(cfg, { days: 1, limit: 1 }); out.test = `✓ Reading works. ${r.total} message${r.total === 1 ? '' : 's'} today.`; }
      catch (e) { out.test = `✗ Reading: ${e.message}`; }
    }
    if (b.testSend === true) {
      try { const r = await sendToSelf(cfg, 'Bob: test email', 'This is a test from Bob\'s Settings, Email account. Sending works.', sendOpts); out.test = `✓ Sent a test email to ${r.to}.`; log('test email sent to the account itself'); }
      catch (e) { out.test = `✗ Sending: ${e.message}`; }
    }
  } catch (e) { send(res, 400, { error: e.message, ...accountView(cfg) }); return true; }
  send(res, 200, { ...accountView(cfg), ...out });
  return true;
}
