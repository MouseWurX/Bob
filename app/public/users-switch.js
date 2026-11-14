// 👥 Switch user. In Lamplight it's a line in the menu the cube opens, under Get models (bob-menu.js usersPart); in the
// classic look, 👥 Switch user in the side menu. Both open this page: a card per person; pick one, type their passcode
// if they have one, Switch. Back to the owner goes through the lock screen when the owner has a passcode. Every window starts again as
// the new person (src/server.js /api/users/switch). Brains and 🎮 Gaming don't change.
import { esc } from './util.js';

const $ = (id) => document.getElementById(id);
const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};
const initial = (n) => esc(String(n || '?').trim().charAt(0).toUpperCase() || '?');

// pick: the card picked (defaults to whoever is in).
export function usersHtml(v = {}, pick = '') {
  const cur = v.current || 'main';
  const sel = pick || cur;
  const rows = [{ id: 'main', name: v.ownerName || 'Owner', passcode: v.lockOn === true }, ...(v.list || [])];
  const picked = rows.find((p) => p.id === sel) || rows[0];
  const needs = picked.id !== cur && picked.passcode;
  return `<p class="muted">Signed in: <strong>${esc(cur === 'main' ? v.ownerName || 'Owner' : v.currentName || 'a user')}</strong>. Each person sees only their own chats, memory, email and keys.</p>
    <ul class="users-grid">${rows.map((p) => `<li><button type="button" class="user-card" data-user="${esc(p.id)}" aria-pressed="${p.id === picked.id}"><span class="user-dot" aria-hidden="true">${initial(p.name)}</span><strong>${esc(p.name)}</strong><span class="muted">${p.id === cur ? 'Signed in' : p.passcode ? '🔒 Passcode' : 'No passcode'}</span></button></li>`).join('')}</ul>
    <div class="users-code" ${needs ? '' : 'hidden'}><label for="users-code">${esc(picked.name)}'s passcode</label> <input id="users-code" type="password" autocomplete="current-password"> <button type="button" id="users-go">Switch</button></div>
    ${!needs && picked.id !== cur ? '<div class="users-code"><button type="button" id="users-go">Switch</button></div>' : ''}
    <p class="muted" id="users-msg" role="status" aria-live="polite"></p>
    <p class="muted">Add or remove people in Settings, 🗓 Everyday helpers, <strong>Users</strong>.</p>`;
}

export function createUsersSwitch({ reload = () => location.reload() } = {}) {
  const btn = $('usersBtn'), dlg = $('usersDlg'), body = $('users-body');
  let v = null, picked = '';
  const refresh = async () => {
    try { v = await (await fetch('/api/everyday/profiles')).json(); } catch { v = null; }
    if (btn) { btn.hidden = !(v && v.on === true); if (v?.on) btn.title = `Switch user (signed in: ${v.current === 'main' ? v.ownerName || 'Owner' : v.currentName || 'a user'})`; }
  };
  const draw = () => { if (body && v) body.innerHTML = usersHtml(v, picked); };
  const go = async (who, code = '') => {
    const msg = $('users-msg');
    try {
      const r = await post('/api/users/switch', { who, code });
      if (msg) msg.textContent = r.lock ? 'Locked. Type the owner\'s passcode on the lock screen.' : 'Switched.';
      reload();
    } catch (x) { if (msg) msg.textContent = x.message; else throw x; }
  };
  const open = async (pick = '') => {
    await refresh();
    if (!v?.on || !dlg || !body) return;
    picked = pick || v.current || 'main';
    draw();
    if (!dlg.open) dlg.showModal?.();
    ($('users-code') && !$('users-code').closest('[hidden]') ? $('users-code') : body.querySelector('[aria-pressed="true"]'))?.focus();
  };
  // From the cube's menu: straight away when there's nothing to type, else the page with their card picked.
  const pick = async (id) => {
    const p = id === 'main' ? { passcode: v?.lockOn === true } : (v?.list || []).find((x) => x.id === id);
    if (!p) return open();
    if (!p.passcode || id === 'main') { try { await go(id); } catch (x) { open(id); } return; }
    open(id);
  };
  if (btn) btn.onclick = () => open();
  $('users-close')?.addEventListener('click', () => dlg.close());
  body?.addEventListener('click', (e) => {
    const card = e.target.closest('[data-user]');
    if (card) { picked = card.dataset.user; draw(); ($('users-code') && !$('users-code').closest('[hidden]') ? $('users-code') : body.querySelector(`[data-user="${CSS.escape(picked)}"]`))?.focus(); return; }
    if (e.target.id === 'users-go') go(picked, $('users-code')?.value || '');
  });
  body?.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.id === 'users-code') go(picked, e.target.value); });
  refresh();
  window.addEventListener('focus', refresh);
  return { refresh, open, pick, state: () => v };
}
