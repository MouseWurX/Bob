// 👥 Switch user (the menu, under Setup): shows while Users is on (Settings, 🗓 Everyday helpers). Pick a person;
// one with a passcode types it. Back to the owner goes through the lock screen when the owner has a passcode.
// Every window starts again as the new person (src/server.js /api/users/switch). Brains and 🎮 Gaming don't change.
import { esc } from './util.js';

const $ = (id) => document.getElementById(id);
const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};

export function usersHtml(v = {}) {
  const cur = v.current || 'main';
  const rows = [{ id: 'main', name: 'The owner', passcode: v.lockOn === true }, ...(v.list || [])];
  return `<p class="muted">In now: <strong>${esc(cur === 'main' ? 'the owner' : v.currentName || 'a user')}</strong>. Each person sees only their own chats, memory and email.</p>
    <ul class="people-list users-pick">${rows.map((p) => `<li><label><input type="radio" name="users-who" value="${esc(p.id)}"${p.id === cur ? ' checked' : ''} data-code="${p.passcode ? '1' : ''}"> 👤 ${esc(p.name)}</label> <span class="muted">${p.passcode ? '🔒 passcode' : 'no passcode'}</span></li>`).join('')}</ul>
    <div class="row"><label>Passcode <input id="users-code" type="password" autocomplete="current-password" style="width:12em"></label> <span class="muted">Only for a person with 🔒.</span></div>
    <div class="row"><button type="button" id="users-go">Switch</button></div>
    <p class="muted" id="users-msg" role="status" aria-live="polite"></p>`;
}

export function createUsersSwitch({ reload = () => location.reload() } = {}) {
  const btn = $('usersBtn'), dlg = $('usersDlg'), body = $('users-body');
  if (!btn || !dlg || !body) return { refresh() {} };
  let v = null;
  const refresh = async () => {
    try { v = await (await fetch('/api/everyday/profiles')).json(); } catch { v = null; }
    btn.hidden = !(v && v.on === true);
    if (v?.on) btn.title = `Switch user (in now: ${v.current === 'main' ? 'the owner' : v.currentName || 'a user'})`;
  };
  btn.onclick = async () => {
    await refresh();
    if (!v?.on) return;
    body.innerHTML = usersHtml(v);
    dlg.showModal?.();
  };
  $('users-close')?.addEventListener('click', () => dlg.close());
  body.addEventListener('click', async (e) => {
    if (e.target.id !== 'users-go') return;
    const who = body.querySelector('input[name="users-who"]:checked')?.value || 'main';
    const msg = $('users-msg');
    try {
      const r = await post('/api/users/switch', { who, code: $('users-code')?.value || '' });
      if (msg) msg.textContent = r.lock ? 'Locked. Type the owner\'s passcode on the lock screen.' : 'Switched.';
      reload();
    } catch (x) { if (msg) msg.textContent = x.message; }
  });
  refresh();
  window.addEventListener('focus', refresh);
  return { refresh };
}
