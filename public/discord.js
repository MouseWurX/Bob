// Settings, Show advanced settings, Online services: "Bob on Discord" (src/discord.js). Off unless you turn it on.
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
  'too many servers': 'The bot is in too many servers for a bot without sharding.',
  'no websocket': 'This copy of Bob can\'t open a Discord connection. Update Bob and try again.'
};

export async function mountDiscord(box) {
  if (!box) return;
  let v, msg = '';
  const sw = (key, label, note, on, disabled = false) => `<label class="switch"><input type="checkbox" data-dc="${key}" ${on ? 'checked' : ''} ${disabled ? 'disabled' : ''}><span><strong>${label}</strong><br><span class="muted">${note}</span></span></label>`;
  const draw = () => {
    const off = !v.enabled;
    box.innerHTML = `<strong>Bob on Discord</strong> <span class="tag">off unless you turn it on</span>
      ${sw('enabled', 'Bob on Discord', 'Bob joins your Discord server as a bot and answers in the channels you list. Messages that call him and his replies pass through Discord\'s servers while this is on. He never shows your files or anything he made for you there.', v.enabled)}
      ${v.enabled ? `<p class="muted" role="status">${esc(STATUS[v.status] || v.status)}${v.botName ? ` Your bot: <strong>${esc(v.botName)}</strong>` : ''}</p>` : ''}
      <div class="row"><label for="dc-token"><strong>Bot token</strong></label> <span class="muted">${v.tokenFound ? 'Saved. Paste a new one to replace it.' : 'Not saved yet.'}</span>
        <input id="dc-token" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the bot token" data-dc-token-in>
        <button type="button" data-dc-token>Save token</button></div>
      <div class="row"><label for="dc-wake"><strong>Wake phrase</strong></label>
        <input id="dc-wake" type="text" maxlength="100" value="${esc(v.wake)}" data-dc-wake ${off ? 'disabled' : ''}>
        <span class="muted">The <code>*</code> is what he reads as the job: <code>hey bob*</code> makes "hey bob draw a cat" into "draw a cat".</span></div>
      ${sw('caseSensitive', 'Match capital letters exactly', 'Off: "Hey Bob", "HEY BOB" and "hey bob" all work. On: only the phrase as you typed it.', v.caseSensitive, off)}
      <div class="row"><label for="dc-channels"><strong>Channels Bob answers in</strong></label>
        <textarea id="dc-channels" rows="2" placeholder="Channel IDs, one per line" data-dc-list="channels" ${off ? 'disabled' : ''}>${esc(v.channels.join('\n'))}</textarea>
        <span class="muted">${v.channels.length ? '' : 'None yet, so he answers nowhere. '}Right-click a channel in Discord, Copy Channel ID (turn on Developer Mode in Discord\'s Advanced settings first).</span></div>
      <div class="row"><label for="dc-people"><strong>Only these people</strong></label>
        <textarea id="dc-people" rows="2" placeholder="User IDs, one per line (empty: everyone in those channels)" data-dc-list="people" ${off ? 'disabled' : ''}>${esc(v.people.join('\n'))}</textarea></div>
      <fieldset class="row" ${off ? 'disabled' : ''}><legend><strong>Jobs Bob takes on Discord</strong></legend>
        ${v.jobTypes.map((t) => `<label><input type="checkbox" data-dc-job="${t.id}" ${v.jobs[t.id] ? 'checked' : ''}> ${esc(t.label)}</label>`).join(' ')}</fieldset>
      ${sw('share', 'Share what Bob makes for Discord', 'Pictures, clips, songs and sounds made for a Discord request go to that channel as files. Off: he says he made it, and it stays in Made by Bob here. Only ever what was asked for there, never anything older or made for you.', v.share, off)}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">1. Open the Discord Developer Portal (discord.com/developers/applications), New Application, give it a name.<br>2. On the <strong>Bot</strong> page: Reset Token, copy it, paste it above and click Save token. Turn on <strong>Message Content Intent</strong> on the same page.<br>3. On <strong>OAuth2</strong>, URL Generator: tick <em>bot</em>, then <em>View Channels</em>, <em>Send Messages</em>, <em>Read Message History</em> and <em>Attach Files</em>. Open the link it makes and add the bot to your server.<br>4. Add the channel IDs above, then turn on <strong>Bob on Discord</strong>.<br>The token goes into your Windows user variables as <code>${esc(v.tokenEnv)}</code> (on Mac and Linux, <code>~/.config/bob/env</code>); Bob never shows it. Always a bot, never your own Discord account. Bob talks to Discord himself, so no door opens on this replicant matrix. Discord jobs can't touch your files, folders, programs, memory or Hands, and wait in Tasks like any other job.</p></details>`;
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
    if (e.target.closest('[data-dc-token]')) {
      const input = box.querySelector('[data-dc-token-in]');
      const token = input?.value.trim();
      if (input) input.value = '';
      if (token) change({ token });
    }
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Bob on Discord</strong><p class="muted">${esc(e.message)}</p>`; }
}
