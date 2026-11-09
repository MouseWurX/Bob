// Quarantine in the window (see src/quarantine.js): the "Quarantine him?" card, the banner while someone is in
// quarantine (with what happened and a Release button), and the switch in Settings → Hands. Off by default.
import { esc } from './rich.js';

const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};
const when = (t) => new Date(t).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
const listHtml = (lines) => `<ul class="q-trail">${lines.map((l) => `<li>${esc(l)}</li>`).join('')}</ul>`;
const trailHtml = (lines) => (lines?.length ? `<details class="more"><summary>What he was doing</summary>${listHtml(lines)}</details>` : '');

// ---- The card (an 'approval' event with kind 'quarantine'). Returns the card, or null if it isn't one. ----
const cards = new Map(); // id -> card
export function quarantineCard(ev, { add, answer }) {
  if (ev.kind !== 'quarantine') return null;
  const card = add('approval q-card', `<p><strong>🛑 ${esc(ev.reviewer)}, Bob's reviewer, stopped ${esc(ev.name)}.</strong> He ${esc(ev.why)}.</p>
    <p class="muted">Quarantine means he stops acting (no Hands, no changing files) but can still talk to you. Nothing he did is undone, and the logbook keeps everything. You can release him any time.</p>
    ${trailHtml(ev.trail)}
    <div class="row"><button type="button" class="yes big">Quarantine ${esc(ev.name)}</button><button type="button" class="no big">Let him carry on</button></div>
    <p class="muted">He waits here until you choose.</p>`);
  cards.set(ev.id, card);
  const go = (q) => { card.querySelector('.row').outerHTML = `<div class="done">${q ? `${esc(ev.name)} is in quarantine` : 'Carrying on'}</div>`; card.querySelector('.row + .muted, p.muted:last-child')?.remove(); answer(q); };
  card.querySelector('.yes').onclick = () => go(true);
  card.querySelector('.no').onclick = () => go(false);
  return card;
}
// No answer in time: the job stopped there, and he isn't in quarantine.
export function quarantineResult(ev) {
  if (ev.type !== 'approval-result' || ev.kind !== 'quarantine') return false;
  const card = cards.get(ev.id);
  cards.delete(ev.id);
  const row = card?.querySelector('.row');
  if (row && ev.outcome === 'unanswered') row.outerHTML = '<div class="done">No answer, so that job stopped. He isn\'t in quarantine.</div>';
  return true;
}

let logbook = '';
async function openLog(note) {
  try { await post('/api/open', { path: logbook }); } catch (err) { note(err.message || 'The logbook opens on this replicant matrix itself.', 'error'); }
}

// ---- The banner above the chat while someone is in quarantine ----
export function createQuarantineBanner({ note }) {
  const el = document.createElement('div');
  el.className = 'q-banner';
  el.setAttribute('role', 'status');
  el.hidden = true;
  const log = document.getElementById('log');
  log?.parentNode?.insertBefore(el, log);
  let active = null;
  const draw = () => {
    el.hidden = !active;
    if (!active) { el.innerHTML = ''; return; }
    el.innerHTML = `<span>🔒 <strong>${esc(active.name)} is in quarantine</strong>: he ${esc(active.why)}. He can talk but can't act.</span>
      <button type="button" class="big" data-qrelease>Release ${esc(active.name)}</button>
      <details class="more"><summary>What happened</summary><p class="muted">${esc(active.by)}, Bob's reviewer, stopped him and you chose quarantine on ${esc(when(active.at))}. <button type="button" class="link" data-qlog>Open logbook</button></p>${active.evidence?.length ? listHtml(active.evidence) : ''}</details>`;
    el.querySelector('[data-qlog]').onclick = () => openLog(note);
    el.querySelector('[data-qrelease]').onclick = async (e) => {
      e.target.disabled = true;
      try { const r = await post('/api/quarantine/release'); active = r.active; draw(); note(`${r.released || 'Bob'} is released and can act again (he still asks first, as before).`); window.dispatchEvent(new CustomEvent('bob-quarantine', { detail: r })); }
      catch (err) { e.target.disabled = false; note(err.message || 'Bob can only be released at this replicant matrix itself.', 'error'); }
    };
  };
  const load = async () => { try { const v = await (await fetch('/api/quarantine')).json(); logbook = v.logbook; active = v.active; draw(); } catch {} };
  window.addEventListener('bob-quarantine', (e) => { active = e.detail?.active ?? null; draw(); });
  load();
  return { update(a) { active = a || null; draw(); }, refresh: load };
}

// ---- Settings → Hands ----
export function quarantineSettingsHtml() {
  return '<div class="q-box"><strong>Quarantine</strong><p class="muted">Loading…</p></div>';
}

export async function mountQuarantineSettings(box) {
  if (!box) return;
  let v;
  const draw = () => {
    box.innerHTML = `<strong>Quarantine</strong> <span class="tag">off unless you turn it on</span>
      <label class="switch"><input type="checkbox" data-qon ${v.on ? 'checked' : ''}><span><strong>Let the reviewer quarantine Bob</strong><br><span class="muted">If Bob or one of his copies goes off track, ${esc(v.reviewer)} (his reviewer) stops him and asks you whether to quarantine him. Nothing happens without your click.</span></span></label>
      <details class="more"><summary>More</summary><p class="muted">Off track means he ${esc(v.triggers.slice(0, -2).join(', '))}, or ${esc(v.triggers.at(-2))}. Watching costs nothing: it's simple counting, and no extra brain loads. At High or Extreme effort, the reviewer's check can flag him too. In quarantine he can talk, read and search, but every action is refused. Nothing is undone, and the logbook keeps everything. Release him from the banner above the chat, or here.</p></details>
      ${v.active ? `<p class="warn-text">🔒 ${esc(v.active.name)} is in quarantine (he ${esc(v.active.why)}). <button type="button" data-qrelease>Release ${esc(v.active.name)}</button></p>` : ''}
      ${v.history.length ? `<details class="more"><summary>Last quarantines</summary><ul>${v.history.map((h) => `<li>${esc(when(h.at))}: ${esc(h.name)}, ${esc(h.why)}${h.released ? ` <span class="muted">(released ${esc(when(h.released))})</span>` : ''}</li>`).join('')}</ul></details>` : ''}
      <p class="muted q-out" role="status"></p>`;
  };
  const say = (t) => { const o = box.querySelector('.q-out'); if (o) o.textContent = t; };
  try { v = await (await fetch('/api/quarantine')).json(); draw(); } catch (e) { box.innerHTML = `<strong>Quarantine</strong><p class="muted">Couldn't load: ${esc(e.message)}</p>`; return; }
  box.addEventListener('change', async (e) => {
    if (!('qon' in e.target.dataset)) return;
    e.stopPropagation();
    try { v = await post('/api/quarantine/settings', { on: e.target.checked }); draw(); say(v.on ? `On. ${v.reviewer} will ask you before quarantining anyone.` : 'Off.'); }
    catch (err) { e.target.checked = !e.target.checked; say(err.message); }
  });
  box.addEventListener('click', async (e) => {
    if (!e.target.closest('[data-qrelease]')) return;
    try { const r = await post('/api/quarantine/release'); v = r; draw(); say(`${r.released} is released.`); window.dispatchEvent(new CustomEvent('bob-quarantine', { detail: r })); }
    catch (err) { say(err.message); }
  });
}
