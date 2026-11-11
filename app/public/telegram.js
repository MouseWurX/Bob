// Settings, Online services: "Talk to Bob on Telegram" (src/telegram.js). Off unless you turn it on.
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function telegramHtml() {
  return '<div class="telegram-box"><strong>Talk to Bob on Telegram</strong><p class="muted">Loading…</p></div>';
}

const STATUS = { on: 'Connected', starting: 'Connecting…', retrying: 'Telegram isn\'t answering. Trying again.', 'no token': 'Waiting for the bot token.', off: 'Off.' };

export async function mountTelegram(box) {
  if (!box) return;
  let v, msg = '';
  const sw = (key, label, note, on, disabled = false) => `<label class="switch"><input type="checkbox" data-tg="${key}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${label}</strong><br><span class="muted">${note}</span></span></label>`;
  const draw = () => {
    box.innerHTML = `<strong>Talk to Bob on Telegram</strong> <span class="tag">off unless you turn it on</span>
      ${sw('enabled', 'Talk to Bob on Telegram', 'Chat with Bob from the Telegram app through your own bot. Only your Telegram account can talk to him. Your messages and his replies pass through Telegram\'s servers while this is on.', v.enabled)}
      ${v.enabled ? `<p class="muted" role="status">${esc(STATUS[v.status] || v.status)}${v.botName ? ` Your bot: <strong>${esc(v.botName)}</strong>` : ''}</p>` : ''}
      <div class="row"><strong>Bot token</strong> <span class="muted">${v.tokenFound ? `Found (${esc(v.tokenEnv)}).` : `Not found yet. Add a Windows user variable named <code>${esc(v.tokenEnv)}</code> with your bot's token, then open this page again.`}</span></div>
      ${`<div class="row"><strong>Your Telegram account</strong> <span class="muted">${v.paired ? `Paired with <strong>${esc(v.ownerName || 'your account')}</strong>.` : v.pairCode ? `Send <code>${esc(v.pairCode)}</code> to your bot in Telegram within 15 minutes.` : v.pairLocked ? 'Someone sent your bot 5 wrong codes, so that code was thrown away. Press New code.' : v.enabled ? 'Not paired yet.' : 'Not paired yet. A code works once Talk to Bob on Telegram is on.'}</span>
        ${v.paired ? '<button type="button" data-tg-forget>Forget my Telegram account</button>' : `<button type="button" data-tg-code ${v.enabled ? '' : 'disabled'}>New code</button>`}</div>
      ${v.paired ? '' : `<div class="row"><label for="tg-owner"><strong>Or type your Telegram account</strong></label>
        <input id="tg-owner" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="Your user ID or @username" value="${esc(v.ownerUser ? '@' + v.ownerUser : '')}" data-tg-owner-in>
        <button type="button" data-tg-owner>Save account</button>
        <span class="muted">${v.ownerUser ? `Waiting for a message from <strong>@${esc(v.ownerUser)}</strong>: send your bot /start.` : 'Your user ID is digits (Telegram\'s @userinfobot tells you yours). With a @username, send your bot /start once to finish.'}</span></div>`}`}
      ${sw('pictures', 'Send pictures Bob makes', 'Pictures Bob makes for the Telegram chat go there as photos. Off: he says where to find them.', v.pictures)}
      ${sw('approve', 'Answer Bob\'s OK cards on Telegram', 'OK cards get Allow and Deny buttons in Telegram. Off: Bob says a card is waiting on this replicant matrix. Hard limits still hold either way.', v.approve)}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">1. In Telegram, open <strong>@BotFather</strong>, send /newbot and follow the steps. It gives you a token.<br>2. In Windows: Settings, System, About, Advanced system settings, Environment Variables. Under "User variables" click New, name it <code>${esc(v.tokenEnv)}</code> and paste the token (on Mac and Linux, add <code>${esc(v.tokenEnv)}=…</code> to <code>~/.config/bob/env</code>).<br>3. Turn on <strong>Talk to Bob on Telegram</strong>, then either send the code shown here to your bot, or type your own Telegram user ID or @username under <strong>Or type your Telegram account</strong>.<br>Bob never stores or shows the token. He asks Telegram for new messages himself, so no door opens on this replicant matrix. Anyone else who writes to your bot gets no answer. /stop in Telegram stops what Bob is doing for that chat.</p></details>`;
  };
  const load = async () => { v = await api('/api/telegram'); draw(); };
  const change = async (patch) => {
    try { v = await api('/api/telegram', patch); msg = ''; } catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => { const k = e.target.dataset?.tg; if (k) change({ [k]: e.target.checked }); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-tg-forget]')) change({ forget: true });
    if (e.target.closest('[data-tg-code]')) change({ newCode: true });
    if (e.target.closest('[data-tg-owner]')) { const owner = box.querySelector('[data-tg-owner-in]')?.value.trim(); if (owner) change({ owner }); }
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Talk to Bob on Telegram</strong><p class="muted">${esc(e.message)}</p>`; }
}
