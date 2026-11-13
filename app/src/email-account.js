// 📧 Email account (Settings, Online services): one place for your mail account, used by everything that needs it:
// "Let Bob read my email" (More tools, email-read.js) and the passcode reset's code (lock-reset.js, email-send.js).
// The details live where they always have (settings.json moreTools.email*); the app password is in the locked store
// (BOB_EMAIL_PASSWORD, secret-box.js). Built so one account per person can be added later (👥 profiles): every reader
// asks accountFor(cfg) rather than reading the fields itself.
//   GET  /api/email-account   the details (never the password: only whether one is saved)
//   POST /api/email-account   { host, port, user, folder, sendHost, sendPort, password, forgetPassword, testRead, testSend }
import { saveSettings } from './config.js';
import { cleanMoreTools, moreTools, EMAIL_KEY } from './more-tools.js';
import { keyValue, saveKey } from './secret-box.js';
import { listMail } from './email-read.js';
import { sendMail, smtpFor, maskAddress } from './email-send.js';

export function accountFor(cfg) {
  const m = moreTools(cfg);
  const auto = smtpFor(m.emailHost);
  return { host: m.emailHost, port: m.emailPort, user: m.emailUser, folder: m.emailFolder,
    sendHost: m.emailSendHost || auto.host, sendPort: m.emailSendPort || auto.port, sendAuto: !m.emailSendHost };
}
const password = () => { try { return keyValue(EMAIL_KEY); } catch { return ''; } };
export const canSend = (cfg) => { const a = accountFor(cfg); return Boolean(a.user && a.sendHost && password()); };

// One email to your own account, from your own account. Nothing else is ever sent.
export async function sendToSelf(cfg, subject, text, opts) {
  const a = accountFor(cfg);
  await sendMail({ host: a.sendHost, port: a.sendPort, user: a.user, password: password(), to: a.user, subject, text }, opts);
  return { to: maskAddress(a.user) };
}

export const accountView = (cfg) => ({ ...accountFor(cfg), passwordSaved: Boolean(password()), readOn: cfg?.moreTools?.email === true, canSend: canSend(cfg) });

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
    const patch = {};
    for (const [k, f] of Object.entries(keys)) if (k in b) patch[f] = b[k];
    if (Object.keys(patch).length) { saveSettings(cfg, { moreTools: cleanMoreTools({ ...moreTools(cfg), ...patch }) }); log('details saved'); }
    if (typeof b.password === 'string' && b.password.trim()) { saveKey(cfg, EMAIL_KEY, b.password.trim()); log('app password saved (locked)'); }
    if (b.forgetPassword === true) { saveKey(cfg, EMAIL_KEY, ''); log('app password removed'); }
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
