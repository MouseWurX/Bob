// Settings, Agents, Claude: "Hands for Claude" (src/claude-door.js). Off unless you turn it on.
// Connect buttons write Bob into the Claude app's or Claude Code's own settings file for you (backed up first, and
// shown before anything changes), so nobody has to open a terminal.
import { esc } from './util.js';

async function api(data) {
  const r = await fetch('/api/claude-door', data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function claudeDoorHtml() {
  return '<div class="claude-door-box"><strong>Hands for Claude</strong><p class="muted">Loading…</p></div>';
}

const WHEN = (t) => t ? new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'not yet';
const APPS = { desktop: { name: 'the Claude app', button: 'Connect Bob to the Claude app', after: 'Quit the Claude app fully (from its tray or menu bar icon) and open it again so it sees Bob.' },
  code: { name: 'Claude Code', button: 'Connect Bob to Claude Code', after: 'New Claude Code chats see Bob. One that is already open needs starting again.' } };

export async function mountClaudeDoor(box) {
  if (!box) return;
  let v, msg = '', plan = null, made = null;
  const appRow = (kind) => {
    const a = APPS[kind], s = v.claude?.[kind] || {};
    const state = s.connected ? (s.stale ? 'Connected with an old key or address. Press Connect again.' : 'Connected.') : s.found ? 'Not connected.' : `Not connected. I can't find ${a.name} on this replicant matrix yet; install it first, or connect anyway.`;
    return `<div class="row"><strong>${kind === 'code' ? 'Claude Code' : 'Claude app'}</strong> <span class="muted">${esc(state)}</span>
      <button type="button" data-cd-plan="${kind}">${s.connected ? 'Connect again' : esc(a.button)}</button>
      ${s.connected ? `<button type="button" class="mini" data-cd-off="${kind}">Take Bob out of ${esc(a.name)}</button>` : ''}</div>`;
  };
  const planBox = () => {
    if (!plan) return '';
    const a = APPS[plan.kind];
    if (plan.error) return `<div class="confirm" role="alert"><p>${esc(plan.error)}</p><button type="button" data-cd-cancel>OK</button></div>`;
    return `<div class="confirm" role="group" aria-label="What will change">
      <p><strong>What will change</strong> in <code>${esc(plan.file)}</code>${plan.existed ? '' : ' (a new file)'}:</p>
      <p class="muted">${plan.before ? 'Bob\'s line there is replaced with a new one, with a new key (the old key stops working).' : 'One line called <code>bob</code> is added to its list of tools.'} ${plan.others?.length ? `The other ${plan.others.length} already there (${esc(plan.others.slice(0, 6).join(', '))}) stay as they are.` : ''} Nothing else in the file changes${plan.existed ? ', and I save a copy of it first next to it' : ''}.</p>
      <pre class="diff"><code>"bob": ${esc(JSON.stringify(plan.after, null, 2))}</code></pre>
      <p class="row"><button type="button" class="get" data-cd-go="${plan.kind}">Make this change</button><button type="button" data-cd-cancel>Cancel</button></p>
      <p class="muted">${esc(a.after)}</p></div>`;
  };
  const madeBox = () => made ? `<div class="confirm" role="status"><p><strong>Key for ${esc(made.name)}</strong>. Copy it now: I keep only its fingerprint, so I can't show it again.</p>
      <pre class="diff"><code>${esc(JSON.stringify(made.setup, null, 2))}</code></pre>
      <p class="muted">Paste that into the app's MCP settings, or give it the address <code>${esc(v.url)}</code> and the header <code>Authorization: Bearer</code> followed by the key.</p>
      <button type="button" data-cd-hide>Done</button></div>` : '';
  const draw = () => {
    box.innerHTML = `<strong>Hands for Claude</strong> <span class="tag">off unless you turn it on</span> <span class="tag">Windows, Mac and Linux</span>
      <label class="switch"><input type="checkbox" data-cd-on ${v.on ? 'checked' : ''}><span><strong>Hands for Claude</strong><br><span class="muted">The Claude app, Claude Code, or another app you give a key, can ask Bob to use his tools on this replicant matrix. Every action shows Bob's OK card here first, even with "Work without asking" on, and Bob's hard limits still apply. Only apps on this replicant matrix get in.${v.waiting ? ` ${v.waiting} waiting now.` : ''}</span></span></label>
      <p class="muted">What Claude may ask Bob for:</p>
      ${v.groups.map((g) => `<label class="switch"><input type="checkbox" data-cd-group="${esc(g.id)}" ${g.on ? 'checked' : ''}><span><strong>${esc(g.label)}</strong><br><span class="muted">${esc(g.what)} ${g.tools ? `${g.tools} tool${g.tools === 1 ? '' : 's'} switched on in Bob right now.` : 'None switched on in Bob right now.'}</span></span></label>`).join('')}
      ${appRow('desktop')}
      ${appRow('code')}
      ${planBox()}
      <div class="row"><label for="cd-name"><strong>Make a key for another app</strong></label>
        <input id="cd-name" type="text" maxlength="40" autocomplete="off" spellcheck="false" placeholder="The app's name, like Cursor" data-cd-name>
        <button type="button" data-cd-key>Make a key</button></div>
      ${madeBox()}
      ${v.apps.length ? `<p class="muted">Apps with a key:</p><ul>${v.apps.map((a) => `<li><strong>${esc(a.name)}</strong> <span class="muted">made ${esc(WHEN(a.made))}, last used ${esc(WHEN(a.used))}</span> <button type="button" class="mini" data-cd-remove="${esc(a.id)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">No app has a key yet.</p>'}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">Claude does the thinking; Bob's tools do the work here, and what they make stays here. Turning this off, Remove, or ✋ Hands stops every call at once. Not on the Android app: the Claude app on a phone can't reach Bob's door. Bob's address for apps is <code>${esc(v.url)}</code>.</p></details>`;
  };
  const load = async () => { v = await api(); draw(); };
  const change = async (patch, after) => {
    try { v = await api(patch); msg = ''; if (after) after(v); } catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-cd-on]')) change({ on: t.checked });
    else if (t.dataset?.cdGroup) change({ groups: { [t.dataset.cdGroup]: t.checked } });
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.cdPlan) change({ plan: b.dataset.cdPlan }, (r) => { plan = r.plan; made = null; });
    else if (b.dataset.cdGo) change({ connect: b.dataset.cdGo }, (r) => { plan = null; msg = `Done. ${r.done?.backup ? `The old file is saved as ${r.done.backup}. ` : ''}${APPS[b.dataset.cdGo].after}${v.on ? '' : ' Turn on Hands for Claude above too.'}`; });
    else if ('cdCancel' in b.dataset) { plan = null; draw(); }
    else if (b.dataset.cdOff) change({ disconnect: b.dataset.cdOff }, (r) => { msg = `Bob is out of ${APPS[b.dataset.cdOff].name} and its key no longer works.${r.done?.backup ? ` The old file is saved as ${r.done.backup}.` : ''}`; });
    else if ('cdKey' in b.dataset) { const name = box.querySelector('[data-cd-name]')?.value.trim(); if (name) change({ newKey: name }, (r) => { made = r.newKey; plan = null; }); else { msg = 'Give the app a name first.'; draw(); } }
    else if ('cdHide' in b.dataset) { made = null; draw(); }
    else if (b.dataset.cdRemove) change({ removeKey: b.dataset.cdRemove }, () => { msg = 'Removed. That key no longer works.'; });
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Hands for Claude</strong><p class="muted">${esc(e.message)}</p>`; }
}
