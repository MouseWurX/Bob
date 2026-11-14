// Settings, Bob-Net, This Bob: "Bob-Net access" (src/phone-access.js). Off unless you turn it on.
// Bob for Android (or a browser on your phone) reaches this Bob over Tailscale with the passcode.
import { sayRefused } from './refused.js'; // 1.5.213: a refused switch says why right under it
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function phoneAccessHtml() {
  return '<div class="phone-box"><p class="muted">Loading…</p></div>';
}

// 1.5.94: what's in the way on this replicant matrix's firewall, and the one button that fixes it.
function firewallHtml(f, port, home = false) {
  if (!f) return '';
  if (f.os === 'win' && f.behind) return `<div class="row"><span><strong>Bob's firewall rule needs bringing up to date.</strong> <span class="muted">It doesn't let in ${home ? 'this home network (which a lent graphics card with "Home network first" and "Home network access" need), or ' : ''}a lent graphics card (Bigger Bobs) yet. Windows asks you once.</span></span><button type="button" class="get" data-fw="add">Bring the firewall rule up to date</button></div>`;
  if (f.os === 'win') return f.ruleHere
    ? `<div class="row"><span class="muted">✓ Windows Firewall lets Tailscale${home ? ' and this home network' : ''} through to Bob (the rule "Bob (Tailscale only)").</span><button type="button" data-fw="remove">Remove the firewall rule</button></div>`
    : `<div class="row"><span><strong>Windows Firewall may block your other replicant matrices.</strong> <span class="muted">One rule fixes it: Bob's port${port ? ` (${esc(port)})` : ''} and a lent graphics card's (50052), only from Tailscale addresses (100.64.0.0/10)${home ? ' and this home network' : ', nothing else on your network'}. Windows asks you once to allow the change. It also switches off any rule that blocks Bob's own program (Windows makes one if Cancel was pressed on its earlier question).</span></span><button type="button" class="get" data-fw="add">${home ? 'Let Tailscale and the home network through the firewall' : 'Let Tailscale through the firewall'}</button></div>`;
  if (f.os === 'linux' && f.line) return `<p class="muted">Your ${esc(f.firewall)} firewall is on and may block Tailscale. I can't change it myself (it needs your password). In a terminal: <code>${esc(f.line)}</code></p>`;
  if (f.os === 'mac') return '<p class="muted">If the macOS firewall is on, it asks once whether Bob may accept incoming connections: choose Allow.</p>';
  return '';
}

export async function mountPhoneAccess(box) {
  if (!box) return;
  let v, shown = '', msg = '', restart = false;
  const draw = () => {
    const hosts = v.hosts.length ? v.hosts : v.found;
    box.innerHTML = `      <label class="switch"><input type="checkbox" data-phone-on ${v.enabled ? 'checked' : ''}><span><strong>Bob-Net access</strong><br><span class="muted">Your phone (Bob for Android, or an iPhone) and your other Bobs can reach this Bob over Tailscale with the passcode below${v.homeNet ? ', or over this home network' : ''}. Nothing else on your network can.</span></span></label>
      ${restart ? '<p class="muted"><strong>Restart Bob to apply this.</strong> Close his window and open him again from the Start menu.</p>' : v.enabled && !v.live ? `<p class="muted">On, but I'm not on Tailscale${v.homeNet ? ' or a home network' : ''} yet. ${v.homeNet ? 'Plug in the network cable, or start Tailscale' : 'Start Tailscale'} and sign in: I pick it up within a minute, no restart.</p>` : ''}
      <div class="row"><strong>Address</strong> <span class="muted">Type this into your phone or your other Bob.</span> ${hosts.length ? hosts.map((h) => `<code>${esc(h)}</code>`).join(' or ') : v.homeNet && v.home?.length ? '' : `<span class="muted">No Tailscale address found on this replicant matrix. Install Tailscale and sign in, then check again.${v.homeNet ? '' : ' Or, on a plain home network, turn on <strong>Home network access</strong> below.'}</span>`}${v.homeNet && v.home?.length ? ` ${hosts.length ? 'or, on this home network, ' : '<span class="muted">On this home network:</span> '}${v.home.map((h) => `<code>${esc(h)}</code>`).join(' or ')}` : ''}
        <button type="button" data-phone-find>Check again</button></div>
      <div class="row"><strong>Passcode</strong> <span class="muted">${shown ? `<code>${esc(shown)}</code> Type it into your phone or other Bob now: it isn't shown again.` : v.passcodeSet ? 'set (it\'s only shown once, when you make it).' : 'Not set yet. Turning on Bob-Net access makes one for you.'}</span>
        <button type="button" data-phone-newcode>Make a new passcode</button></div>
      ${`<label class="switch"><input type="checkbox" data-phone-home ${v.homeNet ? 'checked' : ''}><span><strong>Home network access</strong><br><span class="muted">Your other Bobs and your phone reach this Bob directly over your home network, with Tailscale as the fallback. No Tailscale needed: a switch or a router joining them is enough. Turn it on on each Bob. It still needs the passcode, and pairing seals the passcodes so they never cross as plain text. After pairing, sign-ins and chats travel without Tailscale's encryption, so someone else on that network could read them: keep this for a home network you trust.</span></span></label>`}
      ${v.enabled ? firewallHtml(v.firewall, v.port, v.firewall?.home ?? v.homeNet) : ''}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">On the phone: install Tailscale and sign in with the same account, open Bob for Android, Menu, Bobs on your network, and add the Address above. Then type the passcode and tap Log in. On an iPhone: in Safari, go to the Address with /phone/ on the end, type the passcode, then Share, Add to Home Screen. Making a new passcode signs every phone out. Turning this off closes the door straight away.</p></details>`;
  };
  const load = async () => { v = await api('/api/phone-access'); draw(); };
  const change = async (patch) => {
    let refused = '';
    try { const r = await api('/api/phone-access', patch); v = { ...v, ...r }; if (r.passcode) shown = r.passcode; restart = restart || r.restart; msg = ''; document.dispatchEvent(new CustomEvent('bob-door')); }
    catch (e) { if ('enabled' in patch) refused = e.message; else msg = e.message; }
    draw();
    if (refused) sayRefused(box, '[data-phone-on]', refused);
  };
  box.addEventListener('change', (e) => { if (e.target.matches('[data-phone-home]')) change({ homeNet: e.target.checked }); if (e.target.matches('[data-phone-on]')) change(e.target.checked && !v.passcodeSet ? { enabled: true, newPasscode: true } : { enabled: e.target.checked }); });
  box.addEventListener('click', async (e) => {
    const fw = e.target.closest('[data-fw]');
    if (fw) { // 1.5.94: Windows shows its own "make changes" prompt; nothing changes if the answer is No
      fw.disabled = true; msg = 'Windows is asking you…'; draw();
      try { const r = await api('/api/phone-access/firewall', { add: fw.dataset.fw === 'add' }); v.firewall = r.firewall; msg = r.ok ? (fw.dataset.fw === 'add' ? 'Done: Tailscale can get through the firewall now.' : 'Removed the firewall rule.') : r.why; }
      catch (err) { msg = err.message; }
      draw(); return;
    }
    if (e.target.closest('[data-phone-newcode]')) change({ newPasscode: true });
    if (e.target.closest('[data-phone-find]')) load().then(() => change({ hosts: v.found }));
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>Bob-Net access</strong><p class="muted">${esc(e.message)}</p>`; }
}
