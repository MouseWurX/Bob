// 1.5.3: the Hands switch on the chat page, next to "Free memory when Bob is idle". Hands are turned on in
// Settings; this switch is only a kill switch. It can stop Hands that Settings has on (running commands stop, waiting
// cards are answered No, nothing new starts) and let them carry on again. It never turns a Hand on, and when Settings
// has Hands off it has nothing to stop, so it just says so.
// While "Let Bob work without asking" is on (and not stopped), a banner sits above the chat with its own Stop button.
const $ = (id) => document.getElementById(id);

export function createHandsSwitch({ note }) {
  const btn = $('handsBtn'), st = $('handsBtnSt'), banner = $('freeBanner'), bannerStop = $('freeBannerStop');
  let s = null;

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
    btn.dataset.free = String(free);
    if (banner) banner.hidden = !free;
    st.textContent = state === 'ready' ? (free ? 'On, not asking' : 'On') : state === 'stopped' ? 'Stopped' : 'Off in Settings';
    btn.title = free ? 'Hands are on and Bob is working without asking. Click to stop him right away.'
      : state === 'ready' ? 'Hands are on (Bob still asks before every action). Click to stop them right away.'
      : state === 'stopped' ? 'Hands are stopped. Click to let Bob use them again.'
      : 'Hands are off in Settings, so there is nothing to stop. Turn them on in Settings, Show advanced settings, Hands.';
  }

  async function load() { try { s = (await call('/api/hands')).settings; draw(); } catch {} }

  async function toggle() {
    if (!s) await load();
    if (!s) return;
    if (!s.enabled) { note('Hands are off in Settings, so there is nothing to stop. Turn them on in Settings, Show advanced settings, Hands.'); return; }
    btn.disabled = true;
    try {
      const r = await call('/api/hands/hold', { held: !s.held });
      s = r.settings; draw();
      note(s.held ? `Hands stopped.${r.stopped ? ` Stopped ${r.stopped} thing${r.stopped === 1 ? '' : 's'}.` : ''} Bob only talks until you click Hands again.` : s.free ? 'Hands are on again, and Bob is working without asking (that switch is still on in Settings).' : 'Hands are on again. Bob still asks before every action.');
      window.dispatchEvent(new CustomEvent('bob-hands', { detail: s }));
    } catch (err) { note(err.message || 'Hands can only be switched back on at this replicant matrix itself.', 'error'); }
    btn.disabled = false;
  }
  btn.onclick = toggle;
  // The banner's button only ever stops (never starts) him.
  if (bannerStop) bannerStop.onclick = () => { if (s && s.enabled && !s.held) toggle(); };

  load();
  // Changed somewhere else (Settings, Stop everything, another window): show it here too.
  return { update(settings) { if (settings) { s = settings; draw(); } else load(); }, refresh: load };
}
