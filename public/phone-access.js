// Settings, Connections: "Let my other replicant matrices in" (src/phone-access.js). Off unless you turn it on.
// Bob for Android (or a browser on your phone) reaches this Bob over Tailscale with the passcode.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function phoneAccessHtml() {
  return '<div class="phone-box"><strong>Let my other replicant matrices in</strong><p class="muted">Loading…</p></div>';
}

export async function mountPhoneAccess(box) {
  if (!box) return;
  let v, shown = '', msg = '', restart = false;
  const draw = () => {
    const hosts = v.hosts.length ? v.hosts : v.found;
    box.innerHTML = `<strong>Let my other replicant matrices in</strong> <span class="tag">off unless you turn it on</span>
      <label class="switch"><input type="checkbox" data-phone-on ${v.enabled ? 'checked' : ''}><span><strong>Let my other replicant matrices in</strong><br><span class="muted">Your phone (Bob for Android) and your other Bobs can reach this Bob over Tailscale with the passcode below. Nothing else on your network can.</span></span></label>
      ${restart || (v.enabled !== v.live) ? '<p class="muted"><strong>Restart Bob to apply this.</strong> Close his window and open him again from the Start menu.</p>' : ''}
      <div class="row"><strong>Passcode</strong> <span class="muted">${shown ? `<code>${esc(shown)}</code> Type it into your phone or other Bob now: it isn't shown again.` : v.passcodeSet ? 'set (it\'s only shown once, when you make it).' : 'Not set yet. Turning on Let my other replicant matrices in makes one for you.'}</span>
        <button type="button" data-phone-newcode>${v.passcodeSet ? 'Make a new passcode' : 'Make a passcode'}</button></div>
      <div class="row"><strong>Address for the phone</strong> ${hosts.length ? hosts.map((h) => `<code>${esc(h)}</code>`).join(' or ') : '<span class="muted">No Tailscale address found on this replicant matrix. Install Tailscale and sign in, then check again.</span>'}
        <button type="button" data-phone-find>Check again</button></div>
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">On the phone: install Tailscale and sign in with the same account, open Bob for Android, Menu, Bobs on your network, and add the address above. Then type the passcode and tap Log in. Making a new passcode signs every phone out. Turning this off closes the door again after a restart.</p></details>`;
  };
  const load = async () => { v = await api('/api/phone-access'); draw(); };
  const change = async (patch) => {
    try { const r = await api('/api/phone-access', patch); v = { ...v, ...r }; if (r.passcode) shown = r.passcode; restart = restart || r.restart; msg = ''; }
    catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => { if (e.target.matches('[data-phone-on]')) change(e.target.checked && !v.passcodeSet ? { enabled: true, newPasscode: true } : { enabled: e.target.checked }); });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-phone-newcode]')) change({ newPasscode: true });
    if (e.target.closest('[data-phone-find]')) load().then(() => change({ hosts: v.found }));
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Let my other replicant matrices in</strong><p class="muted">${esc(e.message)}</p>`; }
}
