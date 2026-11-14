// 1.5.3: the Hands switch on the chat page, next to "Free memory when Bob is idle". Hands are turned on in
// Settings; this switch is only a kill switch. It can stop Hands that Settings has on (running commands stop, waiting
// cards are answered No, nothing new starts) and let them carry on again. It never turns a Hand on, and when Settings
// has Hands off it has nothing to stop, so it just says so.
// Whether Bob asks first shows on the 🔓 Autonomy button next to it (quick-switches.js), not here.
// While "Work without asking" is on (and not stopped), a banner sits above the chat with its own Stop button.
const $ = (id) => document.getElementById(id);
// The banner grows with every check Bob is let past (the owner, 2026-11-09): working without asking, then using apps,
// his browser, seeing the screen, and each hard limit switched off. Its Hide button (kept for new users, hideable for
// the rest) remembers which of those it hid in this window; when something NEW is let past, it shows again.
// Settings, Hands has "Show the banner again". 🔓 Autonomy keeps saying On while it's hidden.
const HIDE_KEY = 'bob-free-banner-hidden';
const hiddenFor = () => { try { const v = JSON.parse(localStorage.getItem(HIDE_KEY) || 'null'); return Array.isArray(v) ? v : null; } catch { return null; } };
export const bannerHidden = () => hiddenFor() !== null;
export function setBannerHidden(keys) { try { keys ? localStorage.setItem(HIDE_KEY, JSON.stringify(keys)) : localStorage.removeItem(HIDE_KEY); } catch {} window.dispatchEvent(new CustomEvent('bob-free-banner')); }

// What Bob is let past right now, while he works without asking: [{ key, text }], biggest last.
export function bannerLines(s, view = {}) {
  const here = new Set((view.hands || []).map((h) => h.id));
  const on = (id) => (here.size ? here.has(id) : true) && s[id]?.on === true;
  const out = [];
  if (on('apps')) out.push({ key: 'apps', text: 'He can open and use your apps: click, type and switch between windows to get the job done.' });
  if (on('browser')) out.push({ key: 'browser', text: 'He can use his own browser: open pages, click and type in them.' });
  if ((on('apps') || on('browser')) && view.browser?.eyes && s.eyesCheck !== false) out.push({ key: 'eyes', text: 'He can see the screen and click by where things are.' });
  const labels = Object.fromEntries((view.limits || []).map((l) => [l.id, l.label]));
  for (const [k, v] of Object.entries(s.limits || {})) if (v === false) out.push({ key: `limit:${k}`, text: `Hard limit OFF: ${labels[k] || k}.` });
  return out;
}

export function createHandsSwitch({ note }) {
  const btn = $('handsBtn'), st = $('handsBtnSt'), banner = $('freeBanner'), bannerStop = $('freeBannerStop'), bannerHide = $('freeBannerHide');
  let s = null, view = {};
  const bannerText = banner?.querySelector('.free-banner-text');

  const call = async (url, data) => {
    const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  };

  function draw() {
    if (!s) return;
    const state = !s.enabled ? 'settings-off' : s.held ? 'stopped' : 'ready';
    btn.dataset.state = state;
    btn.dataset.on = String(state === 'ready');
    btn.setAttribute('aria-pressed', String(state === 'ready'));
    const free = state === 'ready' && s.free === true;
    if (banner) {
      const lines = free ? bannerLines(s, view) : [];
      const keys = lines.map((l) => l.key), hid = hiddenFor();
      banner.hidden = !free || (hid !== null && keys.every((k) => hid.includes(k)));
      banner.dataset.level = String(Math.min(3, lines.length)); // 0-3: bigger the more he's let past
      if (bannerText) bannerText.innerHTML = `<strong>⚠ Bob is working without asking.</strong>${lines.length ? `<ul>${lines.map((l) => `<li>${l.text}</li>`).join('')}</ul>` : ''}<span class="free-banner-tail">${lines.some((l) => l.key.startsWith('limit:')) ? 'The other hard limits still apply.' : 'Hard limits still apply.'}</span>`;
    }
    st.textContent = state === 'ready' ? 'On' : state === 'stopped' ? 'Stopped' : 'Off in Settings';
    btn.title = free ? 'Hands are on and Bob is working without asking. Click to stop him right away.'
      : state === 'ready' ? 'Hands are on (Bob still asks before every action). Click to stop them right away.'
      : state === 'stopped' ? 'Hands are stopped. Click to let Bob use them again.'
      : 'Hands are off in Settings, so there is nothing to stop. Turn them on in Settings, Hands.';
  }

  async function load() { try { view = await call('/api/hands'); s = view.settings; draw(); } catch {} }

  async function toggle() {
    if (!s) await load();
    if (!s) return;
    if (!s.enabled) { note('Hands are off in Settings, so there is nothing to stop. Turn them on in Settings, Hands.'); return; }
    btn.disabled = true;
    try {
      const r = await call('/api/hands/hold', { held: !s.held });
      s = r.settings; draw();
      note(s.held ? `Hands stopped.${r.stopped ? ` Stopped ${r.stopped} thing${r.stopped === 1 ? '' : 's'}.` : ''} Bob only talks until you press Hands again.` : s.free ? 'Hands are on again, and Bob is working without asking (🔓 Autonomy is still on).' : 'Hands are on again. Bob still asks before every action.');
      window.dispatchEvent(new CustomEvent('bob-hands', { detail: s }));
    } catch (err) { note(err.message || 'Hands can only be switched back on at this replicant matrix itself.', 'error'); }
    btn.disabled = false;
  }
  btn.onclick = toggle;
  // The banner's button only ever stops (never starts) him.
  if (bannerHide) bannerHide.onclick = () => { setBannerHidden(s ? bannerLines(s, view).map((l) => l.key) : []); note('Banner hidden. 🔓 Autonomy keeps saying On while Bob works without asking, and the banner comes back if he\'s let past anything more. To bring it back now: Settings, Hands, "Show the banner again".'); };
  window.addEventListener('bob-free-banner', draw);
  window.addEventListener('bob-caps', load); // an eyes brain was equipped or taken off
  if (bannerStop) bannerStop.onclick = () => { if (s && s.enabled && !s.held) toggle(); };

  load();
  // Changed somewhere else (Settings, Stop everything, another window): show it here too.
  return { update(settings) { if (settings) { s = settings; draw(); } else load(); }, refresh: load };
}
