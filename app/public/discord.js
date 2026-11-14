// Settings, Agents, Discord: "Bob on Discord" (src/discord.js). Off unless you turn it on.
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
  intents: 'Discord won\'t let the bot read messages yet. On the Bot page, turn on Message Content Intent (and Server Members Intent if Welcome or Raid guard is on), then switch this off and on.',
  'too many servers': 'The bot is in too many Discord servers for Bob to run it (over 2,500). Take it out of some, or make a new bot for this Bob.',
  'no websocket': 'This copy of Bob can\'t open a Discord connection. Update Bob and try again.'
};

const msw = (key, label, note, on) => `<label class="switch"><input type="checkbox" data-dcm="${key}" ${on ? 'checked' : ''}><span><strong>${label}</strong><br><span class="muted">${note}</span></span></label>`;
const num = (key, label, val, min, max, unit = '') => `<label class="dcm-num">${label} <input type="number" min="${min}" max="${max}" value="${esc(val)}" data-dcm-num="${key}" aria-label="${esc(label)}">${unit ? ` <span class="muted">${unit}</span>` : ''}</label>`;
const ids = (key, label, val, note, rows = 2) => `<div class="row"><label for="dcm-${key}"><strong>${label}</strong></label>
  <textarea id="dcm-${key}" rows="${rows}" data-dcm-text="${key}" spellcheck="false">${esc([].concat(val || []).join('\n'))}</textarea><span class="muted">${note}</span></div>`;
const when = (t) => { try { return new Date(t).toLocaleString(); } catch { return ''; } };

// Keep order (src/discord-mod.js): rules in code, no brain. Every setting shows, on or off.
function keepOrderHtml(m) {
  if (!m) return '';
  return `<hr><strong>Keep order (moderation)</strong> <span class="tag">off unless you turn it on</span>
    ${msw('enabled', 'Keep order', 'Bob moderates your server with plain rules, no brain needed: he deletes spam, scam links and slurs, warns, and times people out. Needs Bob on Discord on. Moderators and admins are never moderated.', m.enabled)}
    ${m.waiting.length ? `<div class="row" role="status"><strong>Waiting for your OK</strong><ul>${m.waiting.map((p) => `<li>${p.kind === 'ban' ? 'Ban' : 'Kick'} <strong>${esc(p.name)}</strong>: ${esc(p.why)} <span class="muted">(${esc(when(p.at))}, in a timeout meanwhile)</span> <button type="button" data-dcm-ok="${esc(p.id)}" data-yes="1">${p.kind === 'ban' ? 'Ban' : 'Kick'}</button> <button type="button" data-dcm-ok="${esc(p.id)}" data-yes="0">Leave it</button></li>`).join('')}</ul></div>` : ''}
    ${m.flags.length ? `<div class="row"><strong>Flagged for a look</strong><ul>${m.flags.map((f) => `<li><strong>${esc(f.name)}</strong>: ${esc(f.why)}${f.text ? `<br><span class="muted">"${esc(f.text.slice(0, 200))}"</span>` : ''}${f.brain ? `<br><span class="muted">Brain: ${esc(f.brain)}</span>` : ''} <button type="button" data-dcm-flag="${esc(f.id)}" data-yes="1">Delete and warn</button> <button type="button" data-dcm-flag="${esc(f.id)}" data-yes="0">It's fine</button></li>`).join('')}</ul></div>` : ''}
    <fieldset class="row"><legend><strong>Rules</strong></legend>
      ${msw('spam', 'Spam', 'Deletes floods, the same message again and again, and mass mentions.', m.spam)}
      <div class="row">${num('floodCount', 'Messages in 10 s', m.floodCount, 2, 50)} ${num('dupeCount', 'Same message in a minute', m.dupeCount, 2, 20)} ${num('mentionCount', 'Mentions in one message', m.mentionCount, 2, 50)}</div>
      ${msw('scamLinks', 'Scam links', 'Deletes fake Discord and Steam links, free-gift bait and @everyone with a link. A link from someone who joined minutes ago is flagged for you.', m.scamLinks)}
      ${msw('slurs', 'Slurs', 'Deletes common slurs, however they are spelled. Words that can also be harmless are flagged for you instead.', m.slurs)}
      ${msw('invites', 'Invites to other servers', 'Deletes discord.gg links from anyone who isn\'t a moderator.', m.invites)}
      ${ids('words', 'Blocked words', m.words, 'One per line. Deleted however they are spelled.')}
      ${ids('links', 'Blocked websites', m.links, 'One per line, like example.com.')}
      ${ids('channels', 'Channels to watch', m.channels, 'Channel IDs, one per line. Empty: every channel the bot can see.')}</fieldset>
    <fieldset class="row"><legend><strong>Warnings</strong></legend>
      <div class="row">${num('warnTimeout', 'Timeout from warning', m.warnTimeout, 0, 20)} ${num('timeoutMinutes', 'First timeout', m.timeoutMinutes, 1, 10080, 'minutes, doubles each time')} ${num('kickAt', 'Kick at warning', m.kickAt, 0, 50)} ${num('banAt', 'Ban at warning', m.banAt, 0, 50)} ${num('forgetDays', 'Forget warnings after', m.forgetDays, 1, 365, 'days')}</div>
      <span class="muted">0 means never.</span>
      ${msw('needOk', 'Kicks and bans need my OK', 'On: they wait here (and in your Discord DMs, with OK cards there on) while the person sits in a one-hour timeout. Off: Bob kicks and bans by himself.', m.needOk)}</fieldset>
    <fieldset class="row"><legend><strong>Raid guard and welcome</strong></legend>
      ${msw('raid', 'Raid guard', 'Lots of people joining at once puts slow mode on the watched channels for a while, then puts them back. Needs Server Members Intent on the Bot page.', m.raid)}
      <div class="row">${num('raidJoins', 'Joins in a minute', m.raidJoins, 3, 500)} ${num('raidSlow', 'Slow mode', m.raidSlow, 5, 21600, 's')} ${num('raidMinutes', 'For', m.raidMinutes, 1, 1440, 'minutes')}</div>
      ${msw('welcome', 'Welcome new members', 'Posts your welcome in the channel below. With a role picked, it has an I agree button that gives that role. Needs Server Members Intent.', m.welcome)}
      <div class="row"><label for="dcm-wch"><strong>Welcome channel</strong></label> <input id="dcm-wch" type="text" maxlength="22" value="${esc(m.welcomeChannel)}" data-dcm-text="welcomeChannel" placeholder="Channel ID"></div>
      <div class="row"><label for="dcm-wtext"><strong>Welcome message</strong></label> <textarea id="dcm-wtext" rows="2" maxlength="500" data-dcm-text="welcomeText">${esc(m.welcomeText)}</textarea><span class="muted">{user} pings the new member, {name} is their name.</span></div>
      <div class="row"><label for="dcm-vrole"><strong>Role for I agree</strong></label> <input id="dcm-vrole" type="text" maxlength="22" value="${esc(m.verifyRole)}" data-dcm-text="verifyRole" placeholder="Role ID (empty: no button)"></div>
      <div class="row"><label for="dcm-rules"><strong>Server rules</strong></label> <textarea id="dcm-rules" rows="3" maxlength="1500" data-dcm-text="rules">${esc(m.rules)}</textarea><span class="muted">Shown under the welcome, and read by a brain if you let one look at unclear cases.</span></div></fieldset>
    <fieldset class="row"><legend><strong>People and commands</strong></legend>
      ${ids('modRoles', 'Moderator roles', m.modRoles, 'Role IDs whose members can use the commands. The server owner and roles with Administrator, Manage Messages, Kick, Ban or Timeout always can.')}
      ${ids('selfRoles', 'Roles people can give themselves', m.selfRoles, 'Role IDs. Anyone types !roles to see them and !role and a name to add or take one off.')}
      ${msw('reports', 'Reports', 'Anyone can reply to a message with !report and why. It\'s flagged here for you, and Bob does nothing else.', m.reports)}
      <div class="row"><label for="dcm-prefix"><strong>Command sign</strong></label> <input id="dcm-prefix" type="text" maxlength="2" size="3" value="${esc(m.prefix)}" data-dcm-text="prefix"> <span class="muted">Moderators: ${esc(m.prefix)}modhelp lists the commands.</span></div>
      ${msw('askBrain', 'Ask a brain about unclear cases', 'Flagged messages get one short look from a brain, which may delete and warn, or leave it for you. It can never time out, kick or ban. Off: no brain is ever used for Keep order.', m.askBrain)}
      <div class="row"><label for="dcm-log"><strong>Log channel</strong></label> <input id="dcm-log" type="text" maxlength="22" value="${esc(m.logChannel)}" data-dcm-text="logChannel" placeholder="Channel ID (empty: only here)"> <span class="muted">Every action is posted there, pinging nobody.</span></div></fieldset>
    <details class="more" ${m.log.length ? '' : 'hidden'}><summary>Moderation log</summary><ul>${m.log.map((l) => `<li><span class="muted">${esc(when(l.at))}</span> ${esc(l.what)}${l.name ? ` <strong>${esc(l.name)}</strong>` : ''}${l.why ? `: ${esc(l.why)}` : ''}${l.by && l.by !== 'Bob' ? ` <span class="muted">(by ${esc(l.by)})</span>` : ''}</li>`).join('')}</ul></details>`;
}

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
      ${sw('chat', 'Chat on Discord', 'On: people can call Bob for chat and jobs, which loads a brain. Off: no brain ever loads for the server, which saves the graphics card and processor. Keep order still runs, since it needs no brain.', v.chat)}
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
      ${keepOrderHtml(v.mod)}
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
      <details class="more"><summary>How to set it up</summary><p class="muted">1. Open the Discord Developer Portal (discord.com/developers/applications), New Application, give it a name.<br>2. On the <strong>Bot</strong> page: Reset Token, copy it, paste it above and press Save token. Turn on <strong>Message Content Intent</strong> on the same page.<br>3. On <strong>OAuth2</strong>, URL Generator: tick <em>bot</em>, then <em>View Channels</em>, <em>Send Messages</em>, <em>Read Message History</em> and <em>Attach Files</em>. For Keep order also <em>Manage Messages</em>, <em>Moderate Members</em>, <em>Kick Members</em>, <em>Ban Members</em>, <em>Manage Channels</em> and <em>Manage Roles</em>, and in the server put Bob's role above the roles he manages. Open the link it makes and add the bot to your server.<br>4. For a public bot: add the channel IDs above, then turn on <strong>Bob on Discord</strong>. For your private Bob: turn on <strong>Discord DMs</strong> and DM the code to your bot, or type your user ID.<br>The token goes into Bob's locked store (Settings, This replicant matrix, Locked secrets), scrambled with a key your computer keeps; Bob never shows it. Always a bot, never your own Discord account. Bob talks to Discord himself, so no door opens on this replicant matrix. Discord jobs can't touch your files, folders, programs, memory or Hands, and wait in Tasks like any other job.</p></details>`;
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
    if (t.dataset?.dcm) return change({ mod: { [t.dataset.dcm]: t.checked } });
    if (t.dataset?.dcmNum) return change({ mod: { [t.dataset.dcmNum]: Number(t.value) } });
    if (t.dataset?.dcmText) return change({ mod: { [t.dataset.dcmText]: t.value } });
  });
  box.addEventListener('click', (e) => {
    const add = e.target.closest('[data-dc-add]');
    if (add) return change({ channels: [...v.channels, add.dataset.dcAdd].join('\n') });
    const ok = e.target.closest('[data-dcm-ok]');
    if (ok) return change({ modAnswer: { id: ok.dataset.dcmOk, ok: ok.dataset.yes === '1' } });
    const fl = e.target.closest('[data-dcm-flag]');
    if (fl) return change({ modFlag: { id: fl.dataset.dcmFlag, remove: fl.dataset.yes === '1' } });
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
