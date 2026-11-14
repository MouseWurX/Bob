// Settings, Online services: "📧 Email account" (src/email-account.js). One account for everything that uses mail:
// Let Bob read my email (More tools) and the passcode reset's code (Passcode lock). The app password goes straight
// into the locked store; this page only learns whether one is saved. Every box shows all the time.
// 👥 While a user is in (Users), the page shows and saves that user's own account (src/user-email.js).
import { esc } from './util.js';

async function api(data) {
  const r = await fetch('/api/email-account', data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.view = j; throw e; }
  return j;
}

export const emailAccountHtml = () => '<div class="email-account-box"><p class="muted">Loading…</p></div>';

export async function mountEmailAccount(box) {
  if (!box) return;
  let v, msg = '';
  const draw = () => {
    box.innerHTML = `${v.forUser ? `<p><strong>👥 ${esc(v.forUser)}'s own account.</strong> Only used while ${esc(v.forUser)} is in. The owner's account isn't shown or changed here.</p>` : ''}<p class="muted">${v.forUser ? 'Used by Let Bob read my email and tidying.' : 'Used by Let Bob read my email (More tools) and passcode reset codes (Passcode lock).'} Bob never sends mail to anyone else.</p>
      <div class="row"><label><strong>Account</strong> <input data-ea="user" maxlength="200" value="${esc(v.user)}" placeholder="you@example.test" spellcheck="false" autocomplete="off"></label></div>
      <div class="row"><label>App password <input data-ea="password" type="password" autocomplete="off" placeholder="${v.passwordSaved ? 'Saved and locked' : 'Paste an app password'}"></label>${v.passwordSaved ? ' <button type="button" class="mini" data-ea-forget>Forget password</button>' : ''}</div>
      <p class="muted">Make one in your mail account's security page (Gmail, Outlook, iCloud, Yahoo and Fastmail all do). Not your main password.</p>
      <div class="row"><label>Reading server <input data-ea="host" maxlength="120" value="${esc(v.host)}" placeholder="imap.example.com" spellcheck="false"></label>
        <label>Port <input data-ea="port" type="number" min="1" max="65535" value="${esc(v.port)}" style="width:6em"></label>
        <label>Folder <input data-ea="folder" maxlength="100" value="${esc(v.folder)}" style="width:8em"></label></div>
      <div class="row"><label>Sending server <input data-ea="sendHost" maxlength="120" value="${v.sendAuto ? '' : esc(v.sendHost)}" placeholder="${esc(v.sendHost || 'smtp.example.com')}" spellcheck="false"></label>
        <label>Port <input data-ea="sendPort" type="number" min="1" max="65535" value="${v.sendAuto ? '' : esc(v.sendPort)}" placeholder="${esc(v.sendPort)}" style="width:6em"></label>
        <span class="muted">Empty: worked out from the reading server.</span></div>
      <div class="row"><button type="button" data-ea-save>Save</button> <button type="button" class="mini" data-ea-test="read">Test reading</button> <button type="button" class="mini" data-ea-test="send">Send me a test email</button></div>
      <p class="muted" role="status" aria-live="polite">${esc(msg)}</p>`;
  };
  const act = async (data, done = '') => {
    try { v = await api(data); msg = v.test || done; } catch (e) { if (e.view?.user !== undefined) v = e.view; msg = e.message; }
    draw();
  };
  const val = (k) => box.querySelector(`[data-ea="${k}"]`)?.value ?? '';
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if ('eaSave' in b.dataset) act({ user: val('user'), password: val('password'), host: val('host'), port: Number(val('port')), folder: val('folder'), sendHost: val('sendHost'), sendPort: Number(val('sendPort')) || 0 }, 'Saved.');
    else if ('eaForget' in b.dataset) act({ forgetPassword: true }, 'Password forgotten.');
    else if (b.dataset.eaTest) { msg = 'Trying…'; draw(); act(b.dataset.eaTest === 'send' ? { testSend: true } : { testRead: true }); }
  });
  try { v = await api(); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  draw();
}
