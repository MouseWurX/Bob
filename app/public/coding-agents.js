// Coding agents (src/coding-agents.js), off unless you turn it on. Two pieces:
// - The 🤝 Coding agents section in Now running: folded to its title line to start with, and hidden until the
//   switch is on, so it stays out of the way (the owner, Nov 13: "the panel should be mostly hidden"). The title line
//   carries a small badge: how many work and how many need you. Open it to ask, stop, pass work on, or read the log.
//   It only asks Bob for news while it can be seen and is open.
// - The settings box in Settings, Other apps: the switches, adding agents, accounts and Claude Code status. Always
//   all there, whatever is ticked.
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

// The badge on the title line: '' when there's nothing to say.
export function badgeText(s) {
  if (!s || !s.on) return '';
  const bits = [];
  if (s.needsYou) bits.push(`${s.needsYou} need${s.needsYou === 1 ? 's' : ''} you`);
  if (s.working) bits.push(`${s.working} working`);
  if (!bits.length && s.total) bits.push(`${s.total} ready`);
  return bits.join(' · ');
}
export const STATE_ICON = { idle: '○', working: '⏳', 'needs-you': '🔔', done: '✓', failed: '✗', stopped: '■' };
const ago = (t) => { if (!t) return ''; const m = Math.round((Date.now() - t) / 60000); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };

// One agent's row in Now running. Quiet by design (the owner, Nov 13: it must sit right in Lamplight): a status
// light, the name and what it's doing, one plain line of detail, and small text buttons. The typing boxes only
// open when you need them: Answer is open while it needs you; Ask and Pass to open when pressed.
export function agentRow(a, all, open = {}) {
  const others = all.filter((x) => x.id !== a.id);
  const id = esc(a.id), needs = a.state === 'needs-you', working = a.state === 'working';
  const askOpen = needs || open.ask === a.id, passOpen = open.pass === a.id;
  const meta = [a.kindName + (a.owner ? `, ${a.owner}'s account` : ''), a.folder, a.edits ? 'may change files' : 'reads only', a.thenName ? `then ${a.thenName}` : '', ago(a.at)].filter(Boolean).map(esc).join(' · ');
  const canPass = others.length && a.said && !working;
  return `<li class="titem agent-row" data-agent="${id}" data-state="${esc(a.state)}">
    <span class="ttext"><span class="agent-top"><span class="agent-ico" aria-hidden="true">${STATE_ICON[a.state] || ''}</span><strong>${esc(a.name)}</strong> <span class="agent-state">${esc(a.stateWords)}</span></span>
    <span class="agent-meta">${meta}</span>
    ${a.why ? `<span class="${needs ? 'agent-needs' : 'agent-meta'}">${esc(a.why)}</span>` : ''}
    <span class="agent-acts">${working ? `<button type="button" class="agent-btn" data-stop="${id}">Stop</button>` : ''}${!working && !needs ? `<button type="button" class="agent-btn" data-open-ask="${id}" aria-expanded="${askOpen}">Ask</button>` : ''}${canPass ? `<button type="button" class="agent-btn" data-open-pass="${id}" aria-expanded="${passOpen}">Pass to…</button>` : ''}</span>
    ${a.said ? `<details class="agent-said"><summary>What it said</summary><pre>${esc(a.said.slice(-4000))}</pre></details>` : ''}
    ${a.log?.length ? `<details class="agent-log"><summary>Log</summary><pre>${esc(a.log.join('\n'))}</pre></details>` : ''}
    ${askOpen && !working ? `<form class="agent-ask" data-ask="${id}"><label class="sr-only" for="ag-${id}">${needs ? 'Answer' : 'Ask'} ${esc(a.name)}</label>
      <input id="ag-${id}" type="text" maxlength="4000" placeholder="${needs ? 'Answer it…' : 'Ask it to…'}">
      <button type="submit" class="agent-btn">${needs ? 'Answer' : 'Ask'}</button></form>` : ''}
    ${canPass && passOpen ? `<div class="agent-pass"><label class="sr-only" for="pt-${id}">Pass ${esc(a.name)}'s work to</label><select id="pt-${id}" data-pass-to="${id}">${others.map((o) => `<option value="${esc(o.id)}">${esc(o.name)}</option>`).join('')}</select><input type="text" maxlength="2000" placeholder="With a note (optional)" data-pass-note="${id}" aria-label="Note for the next agent"><button type="button" class="agent-btn" data-pass="${id}">Pass to</button></div>` : ''}
  </span></li>`;
}
export function outsideRow(o) {
  return `<li class="titem agent-row outside" data-state="${esc(o.state)}"><span class="ttext"><span class="agent-top"><span class="agent-ico" aria-hidden="true">${STATE_ICON[o.state] || ''}</span><strong>${esc(o.name)}</strong> <span class="agent-state">${esc(o.stateWords)}</span></span><span class="agent-meta">yours, outside Bob · ${esc(o.folder)} · ${esc(ago(o.at))}</span>${o.why ? `<span class="agent-needs">${esc(o.why)}</span>` : ''}</span></li>`;
}

export function createAgentsSection({ sec, list, badge, seen, isOpen, placed = () => {} }) {
  if (!sec || !list) return { update() {}, poll() {} };
  let v = null, timer = null, msg = '', later = false;
  const open = { ask: '', pass: '' }; // which row has Ask or Pass to open
  const typing = () => list.contains(document.activeElement) && /^(INPUT|SELECT)$/.test(document.activeElement.tagName);
  const draw = () => {
    const s = v || {};
    if (typing()) { later = true; if (badge) { const t = badgeText(s); badge.textContent = t; badge.hidden = !t; } return; } // never wipe what you're typing
    const show = s.on === true;
    if (sec.hidden === show) { sec.hidden = !show; placed(); }
    if (badge) { const t = badgeText(s); badge.textContent = t; badge.hidden = !t; badge.classList.toggle('needs', s.needsYou > 0); }
    if (!show) return;
    const agents = s.agents || [];
    list.innerHTML = (!agents.length && !(s.outside || []).length ? '<li class="titem muted">No coding agents yet. Add one in Settings, Agents.</li>' : '')
      + agents.map((a) => agentRow(a, agents, open)).join('') + (s.outside || []).map(outsideRow).join('')
      + (msg ? `<li class="titem muted" role="status">${esc(msg)}</li>` : '');
  };
  async function poll() {
    clearTimeout(timer);
    if (document.hidden) return;
    const looking = seen() && isOpen();
    try { if (looking || !v) { v = await api('/api/coding-agents'); draw(); } } catch {}
    if (looking) timer = setTimeout(poll, v?.working ? 3000 : 15000);
  }
  const act = async (url, data) => { try { v = await api(url, data); msg = ''; } catch (e) { msg = e.message; } draw(); };
  list.addEventListener('submit', (e) => {
    const f = e.target.closest('[data-ask]'); if (!f) return;
    e.preventDefault();
    const t = f.querySelector('input').value.trim(); if (!t) return;
    open.ask = ''; f.querySelector('input').blur();
    act(`/api/coding-agents/${f.dataset.ask}/ask`, { text: t }).then(() => { clearTimeout(timer); timer = setTimeout(poll, 1500); });
  });
  list.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    if (b.dataset.openAsk) { open.ask = open.ask === b.dataset.openAsk ? '' : b.dataset.openAsk; draw(); list.querySelector(`#ag-${CSS.escape(open.ask)}`)?.focus(); }
    else if (b.dataset.openPass) { open.pass = open.pass === b.dataset.openPass ? '' : b.dataset.openPass; draw(); }
    else if (b.dataset.stop) act(`/api/coding-agents/${b.dataset.stop}/stop`, {});
    else if (b.dataset.pass) {
      const id = b.dataset.pass; open.pass = '';
      act(`/api/coding-agents/${id}/pass`, { to: list.querySelector(`[data-pass-to="${CSS.escape(id)}"]`)?.value, text: list.querySelector(`[data-pass-note="${CSS.escape(id)}"]`)?.value || '' });
    }
  });
  list.addEventListener('focusout', () => setTimeout(() => { if (later && !typing()) { later = false; draw(); } }, 0));
  document.addEventListener('visibilitychange', poll);
  poll();
  return {
    // A 'coding-agents' event from Bob: the badge right away, the list on the next look.
    update(ev) { if (ev?.summary) { v = { ...(v || {}), ...ev.summary }; draw(); } clearTimeout(timer); timer = setTimeout(poll, 400); },
    poll
  };
}

// ---- Settings ----
// kind '' (Settings, Other apps): the switches every agent shares, and "Another program".
// kind 'claude', 'codex', ... (1.5.228, Settings, Agents, that company's section): its program, its agents, Add.
export function agentsSettingsHtml(kind = '') {
  return `<div class="coding-agents-box" data-kind="${esc(kind)}"><strong>Coding agents</strong><p class="muted">Loading…</p></div>`;
}
// The general box's own agents: the ones without a company section.
export const OWN_KINDS = ['custom'];

export async function mountAgentsSettings(box) {
  if (!box) return;
  if (box.length !== undefined) { for (const b of box) mountAgentsSettings(b); return; } // every box on the page
  const only = box.dataset.kind || ''; // '' = Settings, Other apps
  let v, msg = '', folder = '';
  const agentLine = (a) => `<li><strong>${esc(a.name)}</strong> <span class="muted">${esc(a.kindName)} in ${esc(a.folder)}${a.account ? `, account "${esc(a.account)}"${a.owner ? ` (${esc(a.owner)})` : ''}` : ', your usual sign-in'}</span>
      <label class="switch"><input type="checkbox" data-ag-edits="${esc(a.id)}" ${a.edits ? 'checked' : ''}><span><strong>May change files</strong></span></label>
      <label class="pick"><strong>When done, pass to</strong> <select data-ag-then="${esc(a.id)}"><option value="">Nobody</option>${v.agents.filter((x) => x.id !== a.id).map((x) => `<option value="${esc(x.id)}" ${a.then === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></label>
      ${a.account ? `<button type="button" class="mini" data-ag-signin="${esc(a.kind)}" data-ag-account="${esc(a.account)}">Sign in to "${esc(a.account)}"</button>` : ''}
      <button type="button" class="mini" data-ag-clear="${esc(a.id)}">Start fresh</button>
      <button type="button" class="mini" data-ag-remove="${esc(a.id)}">Remove</button></li>`;
  const addHtml = (kindPick) => `
      <div class="row">${kindPick}
        <label class="pick"><strong>Name</strong> <input type="text" maxlength="32" data-ag-name placeholder="like reviewer" autocomplete="off" spellcheck="false"></label></div>
      <div class="row"><strong>Folder</strong> <span class="muted">${esc(folder || 'none picked')}</span> <button type="button" data-ag-pick>Pick a folder…</button></div>
      <div class="row"><label class="pick"><strong>Account</strong> <input type="text" maxlength="30" data-ag-account-new placeholder="blank: your usual sign-in" autocomplete="off" spellcheck="false"></label>
        <label class="pick"><strong>Whose</strong> <input type="text" maxlength="30" data-ag-owner placeholder="like Sam" autocomplete="off"></label></div>
      <label class="switch"><input type="checkbox" data-ag-edits-new><span><strong>May change files</strong><br><span class="muted">Off to start with: it only reads and answers. On: it may edit files in its own folder, through its program's own "edit" mode. Bob never turns off a program's own checks.</span></span></label>
      <button type="button" class="get" data-ag-add>Add this agent</button>`;
  // 1.5.228 one company's part (Settings, Agents): the same controls, only for its own program.
  const drawCompany = () => {
    const k = v.kinds.find((x) => x.id === only) || { id: only, name: only };
    const mine = v.agents.filter((a) => a.kind === only);
    box.innerHTML = `<strong>${esc(k.name)}</strong> <span class="tag">Windows, Mac and Linux</span>
      <p class="muted">Runs the ${esc(k.name)} program on this replicant matrix, in a project folder you pick, with your own ${esc(k.maker || k.name)} sign-in (not an API key). ${v.found[only] ? `${esc(k.name)} is on this replicant matrix.` : `${esc(k.name)} isn't on this replicant matrix yet; install it first.`}</p>
      <p class="muted">${v.on ? 'Coding agents are on.' : 'Needs <strong>Run coding agents</strong> (Settings, Other apps) to run. You can add agents now.'}</p>
      ${only === 'claude' ? `<label class="switch"><input type="checkbox" data-ag-claude ${v.claudeStatus ? 'checked' : ''}><span><strong>Claude Code status in Bob</strong><br><span class="muted">Claude Code chats you run yourself show in Now running too: working, needs you, done. This writes three small hooks into Claude Code's settings (a copy is saved first). ${v.hooks ? 'Connected.' : 'Not connected.'} Needs curl, which Windows 10 and later, macOS and Linux have.</span></span></label>` : ''}
      <p class="muted"><strong>Add a ${esc(k.name)} agent</strong></p>
      ${addHtml(`<input type="hidden" data-ag-kind value="${esc(only)}">`)}
      <p class="muted">An account keeps its own sign-in, so two people can each use their own account here at the same time. Name it, add the agent, then press Sign in once.</p>
      ${mine.length ? `<p class="muted"><strong>Your ${esc(k.name)} agents</strong></p><ul class="agents-set">${mine.map(agentLine).join('')}</ul>` : '<p class="muted">No agents yet.</p>'}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}`;
  };
  const draw = () => {
    if (only) return drawCompany();
    const own = v.agents.filter((a) => OWN_KINDS.includes(a.kind));
    const elsewhere = v.agents.length - own.length;
    box.innerHTML = `<strong>Coding agents</strong> <span class="tag">off unless you turn it on</span> <span class="tag">Windows, Mac and Linux</span>
      <label class="switch"><input type="checkbox" data-ag-on ${v.on ? 'checked' : ''}><span><strong>Run coding agents</strong><br><span class="muted">Claude Code, Codex, Gemini CLI, Qwen Code, OpenCode, or another program you name, side by side, each in its own folder. Now running shows which one is working, which needs you and which is done. They use your own accounts with those makers; Bob's brain isn't involved.</span></span></label>
      <label class="switch"><input type="checkbox" data-ag-hand ${v.handOff ? 'checked' : ''}><span><strong>Agent hand-offs</strong><br><span class="muted">Each agent is told, in its own task, how to ask another one and wait for the answer. At most 4 hand-ons in a row. Off: you pass work on yourself with Pass to.</span></span></label>
      <p class="muted">Claude Code, Codex, Gemini CLI, Qwen Code and OpenCode each have their own section under <strong>Agents</strong> in Settings: add and manage them there.${elsewhere ? ` You have ${elsewhere} agent${elsewhere === 1 ? '' : 's'} there.` : ''}</p>
      <p class="muted"><strong>Another program</strong>: any coding program that can take one task and answer. Bob pipes the task in, or puts it in a file: write <code>{task-file}</code> where the program takes a file.</p>
      <div class="row"><label class="pick"><strong>Program</strong> <input type="text" maxlength="300" data-ag-ccmd value="${esc(v.custom.cmd)}" placeholder="like aider" spellcheck="false"></label>
        <label class="pick"><strong>Its settings</strong> <input type="text" maxlength="600" data-ag-cargs value="${esc(v.custom.args.join(' '))}" placeholder="like --message-file {task-file}" spellcheck="false"></label>
        <button type="button" data-ag-csave>Save</button></div>
      <p class="muted"><strong>Add an agent for that program</strong></p>
      ${addHtml('<input type="hidden" data-ag-kind value="custom">')}
      ${own.length ? `<p class="muted"><strong>Its agents</strong></p><ul class="agents-set">${own.map(agentLine).join('')}</ul>` : ''}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">Each run starts the program in its "answer once" mode in the agent's folder. Claude Code carries on its own session when you answer it; the others get a short note of what they said last. Stopping, or turning this off, stops every run. Not on the Android app: these programs run on a computer. Bob's own brain never sees any of this.</p></details>`;
  };
  const load = async () => { v = await api('/api/coding-agents'); draw(); };
  const change = async (url, patch, done) => { try { v = await api(url, patch); msg = done || ''; } catch (e) { msg = e.message; } draw(); dispatchEvent(new CustomEvent('bob-coding-agents-changed', { detail: box })); };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ag-on]')) change('/api/coding-agents', { on: t.checked });
    else if (t.matches('[data-ag-hand]')) change('/api/coding-agents', { handOff: t.checked });
    else if (t.matches('[data-ag-claude]')) change('/api/coding-agents', { claudeStatus: t.checked }, t.checked ? 'Done. New Claude Code chats tell Bob how they\'re doing.' : 'Bob\'s hooks are out of Claude Code\'s settings.');
    else if (t.dataset.agEdits) change(`/api/coding-agents/${t.dataset.agEdits}/change`, { edits: t.checked });
    else if (t.dataset.agThen !== undefined && t.matches('[data-ag-then]')) change(`/api/coding-agents/${t.dataset.agThen}/change`, { then: t.value });
  });
  box.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const q = (s) => box.querySelector(s);
    if ('agPick' in b.dataset) { try { const r = await api('/api/coding-agents', { pick: true }); if (r.folder) folder = r.folder; } catch (err) { msg = err.message; } draw(); }
    else if ('agAdd' in b.dataset) change('/api/coding-agents', { add: { kind: q('[data-ag-kind]').value, name: q('[data-ag-name]').value, folder, account: q('[data-ag-account-new]').value, owner: q('[data-ag-owner]').value, edits: q('[data-ag-edits-new]').checked } }, 'Added. It shows in Now running, under Coding agents.').then(() => { folder = ''; draw(); });
    else if (b.dataset.agRemove) change(`/api/coding-agents/${b.dataset.agRemove}/remove`, {});
    else if (b.dataset.agClear) change(`/api/coding-agents/${b.dataset.agClear}/change`, { clear: true }, 'It starts fresh next time.');
    else if (b.dataset.agSignin) change('/api/coding-agents', { signIn: { kind: b.dataset.agSignin, account: b.dataset.agAccount } }, 'A window opened for the sign-in. Close it when it says you\'re signed in.');
    else if ('agCsave' in b.dataset) change('/api/coding-agents', { custom: { cmd: q('[data-ag-ccmd]').value.trim(), args: q('[data-ag-cargs]').value.trim().split(/\s+/).filter(Boolean) } }, 'Saved.');
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Coding agents</strong><p class="muted">${esc(e.message)}</p>`; }
  const other = (e) => { if (!box.isConnected) { removeEventListener('bob-coding-agents-changed', other); return; } if (e.detail !== box && v) load().catch(() => {}); };
  addEventListener('bob-coding-agents-changed', other); // another box changed something
}
