// Settings, Online services: "Bob on Discord" (src/discord.js). Off unless you turn it on.
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function discordHtml() {
  return '<div class="discord-box"><strong>Bob on Discord</strong><p class="muted">Loading…</p></div>';
}

const STATUS = {
  on: 'Connected', starting: 'Connecting…', retrying: 'Discord isn\'t answering. Trying again.', 'no token': 'Waiting for the bot token.', off: 'Off.',
  'bad token': 'Discord didn\'t accept the token. Make a new one on the Bot page (Reset Token) and paste it here.',
  intents: 'Discord won\'t let the bot read messages yet. On the Bot page, turn on Message Content Intent, then switch this off and on.',
  'too many servers': 'The bot is in too many Discord servers for Bob to run it (over 2,500). Take it out of some, or make a new bot for this Bob.',
  'no websocket': 'This copy of Bob can\'t open a Discord connection. Update Bob and try again.'
};

export async function mountDiscord(box) {
  if (!box) return;
  let v, msg = '';
  const sw = (key, label, note, on, disabled = false) => `<label class="switch"><input type="checkbox" data-dc="${key}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${label}</strong><br><span class="muted">${note}</span></span></label>`;
  const draw = () => {
    box.innerHTML = `<strong>Bob on Discord</strong> <span class="tag">off unless you turn it on</span>
      ${sw('enabled', 'Bob on Discord', 'Bob joins your Discord server as a bot and answers in the channels you list. Messages that call him and his replies pass through Discord\'s servers while this is on. He never shows your files or anything he made for you there.', v.enabled)}
      ${v.enabled || v.dmEnabled ? `<p class="muted" role="status">${esc(STATUS[v.status] || v.status)}${v.botName ? ` Your bot: <strong>${esc(v.botName)}</strong>` : ''}</p>` : ''}
      <div class="row"><label for="dc-token"><strong>Bot token</strong></label> <span class="muted">${v.tokenFound ? 'Saved. Paste a new one to replace it.' : 'Not saved yet.'}</span>
        <input id="dc-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the bot token" data-dc-token-in>
        <button type="button" data-dc-token>Save token</button></div>
      <div class="row"><label for="dc-wake"><strong>Wake phrase</strong></label>
        <input id="dc-wake" type="text" maxlength="100" value="${esc(v.wake)}" data-dc-wake>
        <span class="muted">The <code>*</code> is what he reads as the job: <code>hey bob*</code> makes "hey bob draw a cat" into "draw a cat". An @mention of the bot at the start works too.</span></div>
      ${sw('caseSensitive', 'Case-sensitive', 'Off: "Hey Bob", "HEY BOB" and "hey bob" all work. On: only the phrase as you typed it.', v.caseSensitive)}
      <div class="row"><label for="dc-channels"><strong>Channels Bob answers in</strong></label>
        <textarea id="dc-channels" rows="2" placeholder="Channel IDs, one per line" data-dc-list="channels">${esc(v.channels.join('\n'))}</textarea>
        ${(v.unlisted || []).length ? `<span class="muted" role="status">Bob heard messages in channels that aren't on this list: ${v.unlisted.map((c) => `<button type="button" data-dc-add="${esc(c.id)}">Add ${c.name ? `#${esc(c.name)}` : esc(c.id)}</button>`).join(' ')}</span><br>` : ''}
        <span class="muted">${v.channels.length ? '' : 'Bob answers in no server channels until you add one. '}Right-click a channel in Discord, Copy Channel ID (turn on Developer Mode in Discord\'s Advanced settings first).</span></div>
      <div class="row"><label for="dc-people"><strong>Only these people</strong></label>
        <textarea id="dc-people" rows="2" placeholder="User IDs, one per line (empty: everyone in those channels)" data-dc-list="people">${esc(v.people.join('\n'))}</textarea></div>
      <fieldset class="row"><legend><strong>Jobs Bob takes on Discord</strong></legend>
        ${v.jobTypes.map((t) => `<label><input type="checkbox" data-dc-job="${t.id}" ${v.jobs[t.id] ? 'checked' : ''}> ${esc(t.label)}</label>`).join(' ')}</fieldset>
      ${sw('autoAccept', 'Auto-accept Discord requests', 'Off: each request from the group waits in the Discord group chat (Topics, Past chats) until you press Accept or Decline. Nothing pops up, so a game is never interrupted. On: requests run straight away. Either way, a request never runs on a Bob you\'re gaming on: another of your Bobs takes it (Send jobs), or it waits.', v.autoAccept)}
      ${sw('keepAwake', 'Stay awake for Discord', 'Going idle never cuts Bob off Discord, but sleep does. On: while he\'s connected, the computer doesn\'t go to sleep (the screen can still turn off and lock). Uses more power. Windows, Mac and Linux.', v.keepAwake)}
      ${sw('share', 'Share what Bob makes for Discord', 'Pictures, clips, songs and sounds made for a Discord request go to that channel as files. Off: he says he made it, and it stays in Made by Bob here. Only ever what was asked for there, never anything older or made for you.', v.share)}
      <hr><strong>Your private Bob in Discord DMs</strong>
      ${sw('dmEnabled', 'Discord DMs', 'Your own account only. Your DMs to the bot get the full Bob, like his window, and land in a Discord chat here. Anyone else who DMs him gets silence. Your messages and his replies, including anything he tells you from your files or what he remembers about you, pass through Discord\'s servers while this is on.', v.dmEnabled)}
      ${`<div class="row"><strong>Your Discord account</strong> <span class="muted">${v.paired ? `Paired with <strong>${esc(v.ownerName || 'your account')}</strong>.` : v.pairCode ? `DM <code>${esc(v.pairCode)}</code> to your bot within 15 minutes.` : v.pairLocked ? 'Someone sent your bot 5 wrong codes, so that code was thrown away. Press New code.' : v.dmEnabled ? 'Not paired yet.' : 'Not paired yet. A code works once Discord DMs is on.'}</span>
        ${v.paired ? '<button type="button" data-dc-forget>Forget my Discord account</button>' : `<button type="button" data-dc-code ${v.dmEnabled ? '' : 'disabled'}>New code</button>`}</div>
      ${v.paired ? '' : `<div class="row"><label for="dc-owner"><strong>Or type your Discord user ID</strong></label>
        <input id="dc-owner" type="text" maxlength="22" autocomplete="off" spellcheck="false" placeholder="Your user ID (digits)" data-dc-owner-in>
        <button type="button" data-dc-owner>Save account</button>
        <span class="muted">In Discord, turn on Developer Mode, then right-click your name and Copy User ID. You and the bot need to share a server.</span></div>`}`}
      ${sw('dmPictures', 'Send creations to DMs', 'Pictures, clips, songs and sounds Bob makes for your DM chat go there as files. Off: he says where to find them.', v.dmPictures)}
      ${sw('dmApprove', 'OK cards in Discord DMs', 'OK cards from your DM chat get Allow and Deny buttons there. Off: Bob says a card is waiting on this replicant matrix. Hard limits still hold either way.', v.dmApprove)}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>How to set it up</summary><p class="muted">1. Open the Discord Developer Portal (discord.com/developers/applications), New Application, give it a name.<br>2. On the <strong>Bot</strong> page: Reset Token, copy it, paste it above and press Save token. Turn on <strong>Message Content Intent</strong> on the same page.<br>3. On <strong>OAuth2</strong>, URL Generator: tick <em>bot</em>, then <em>View Channels</em>, <em>Send Messages</em>, <em>Read Message History</em> and <em>Attach Files</em>. Open the link it makes and add the bot to your server.<br>4. For a public bot: add the channel IDs above, then turn on <strong>Bob on Discord</strong>. For your private Bob: turn on <strong>Discord DMs</strong> and DM the code to your bot, or type your user ID.<br>The token goes into Bob's locked store (Settings, This replicant matrix, Locked secrets), scrambled with a key your computer keeps; Bob never shows it. Always a bot, never your own Discord account. Bob talks to Discord himself, so no door opens on this replicant matrix. Discord jobs can't touch your files, folders, programs, memory or Hands, and wait in Tasks like any other job.</p></details>`;
  };
  const load = async () => { v = await api('/api/discord'); draw(); };
  const change = async (patch) => {
    try { v = await api('/api/discord', patch); msg = patch.token ? 'Token saved.' : ''; } catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.dataset?.dc) return change({ [t.dataset.dc]: t.checked });
    if (t.dataset?.dcJob) return change({ jobs: { [t.dataset.dcJob]: t.checked } });
    if (t.dataset?.dcList) return change({ [t.dataset.dcList]: t.value });
    if ('dcWake' in (t.dataset || {})) return change({ wake: t.value });
  });
  box.addEventListener('click', (e) => {
    const add = e.target.closest('[data-dc-add]');
    if (add) return change({ channels: [...v.channels, add.dataset.dcAdd].join('\n') });
    if (e.target.closest('[data-dc-forget]')) return change({ forget: true });
    if (e.target.closest('[data-dc-code]')) return change({ newCode: true });
    if (e.target.closest('[data-dc-owner]')) { const owner = box.querySelector('[data-dc-owner-in]')?.value.trim(); if (owner) change({ owner }); return; }
    if (e.target.closest('[data-dc-token]')) {
      const input = box.querySelector('[data-dc-token-in]');
      const token = input?.value.trim();
      if (input) input.value = '';
      if (token) change({ token });
    }
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Bob on Discord</strong><p class="muted">${esc(e.message)}</p>`; }
}
