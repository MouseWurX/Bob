// The two quick buttons on the chat page, next to ✋ Hands (POST /api/hands/quick):
//   🔓 Autonomy   = "Let Bob work without asking" (Settings, Hands). Turning it on asks first, in the page; turning it
//                   off never asks and works from any window (phone too). It needs Hands on.
//   🖥 Screen use = the Apps Hand (Windows) and the Browser Hand, with eyes checks (Bob looks at a picture of the
//                   window after a step). Turning it on also turns the Hands master switch on; every step still shows
//                   a card unless Autonomy is on. Off turns just those two Hands off.
// Neither button touches a hard limit ("Don't send anything out", "Never type into password fields" and the rest),
// and ✋ Hands still stops everything at once.
const $ = (id) => document.getElementById(id);

export function createQuickSwitches({ note }) {
  const freeBtn = $('freeBtn'), freeSt = $('freeBtnSt'), screenBtn = $('screenBtn'), screenSt = $('screenBtnSt'), ask = $('freeAsk');
  if (!freeBtn || !screenBtn) return { update() {}, refresh() {} };
  let v = null; // GET /api/hands

  const call = async (url, data) => {
    const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    return j;
  };

  const screenIds = () => (v?.hands || []).map((h) => h.id).filter((id) => id === 'apps' || id === 'browser');

  function draw() {
    if (!v) return;
    const s = v.settings;
    // Autonomy
    const freeNow = s.enabled && s.free && !s.held;
    freeBtn.setAttribute('aria-checked', String(Boolean(s.free && s.enabled)));
    freeBtn.dataset.free = String(freeNow);
    freeSt.textContent = !s.enabled ? 'Off' : !s.free ? 'Off' : s.held ? 'Paused' : 'On';
    freeBtn.title = !s.enabled ? 'Autonomy: Bob does jobs without showing you a card first. Hands are off right now, so there is nothing to do without asking. Turn on Screen use, or Hands in Settings, first.'
      : freeNow ? 'Autonomy is on: Bob works without asking and tells you what he did. Hard limits still apply. Click to make him ask before every action again.'
      : s.free ? 'Autonomy is on, but ✋ Hands is stopped, so Bob does nothing until you click Hands again.'
      : 'Autonomy is off: Bob asks before every action. Click to let him work without asking (you\'ll be asked to confirm). Same switch as "Let Bob work without asking" in Settings.';
    // Screen use
    const ids = screenIds();
    const onCount = ids.filter((id) => s[id]?.on).length;
    const on = s.enabled && ids.length > 0 && onCount === ids.length;
    const eyes = Boolean(v.browser?.eyes);
    screenBtn.setAttribute('aria-checked', String(on));
    screenBtn.hidden = ids.length === 0;
    screenSt.textContent = s.held && onCount ? 'Paused' : on ? (eyes ? 'On' : 'On, no eyes') : s.enabled && onCount ? 'Partly' : 'Off';
    const which = ids.includes('apps') ? 'open and use apps and his own browser' : 'use his own browser';
    screenBtn.title = on ? `Screen use is on: Bob can ${which}, one approved step at a time${eyes ? ', and looks at the window with his eyes brain to check each step' : '. He has no eyes brain, so he can\'t check by looking: equip one in Equip Bob, "Seeing pictures"'}. Click to turn it off.`
      : `Screen use is off. Click to let Bob ${which}, checking each step by looking at the window. Every step still shows a card unless Autonomy is on, and the hard limits (no sending out, no password fields) still apply.`;
  }

  async function load() { try { v = await call('/api/hands'); draw(); } catch {} }
  const after = (r) => { v = r; draw(); window.dispatchEvent(new CustomEvent('bob-hands', { detail: r.settings })); };

  function closeAsk() { if (ask) ask.hidden = true; }
  async function setFree(on) {
    freeBtn.disabled = true;
    try {
      after(await call('/api/hands/quick', { free: on }));
      note(on ? 'Autonomy is on. Bob works without asking now. The hard limits still apply, and ✋ Hands stops him.' : 'Autonomy is off. Bob asks before every action again.');
    } catch (err) { note(err.message || 'Couldn\'t change Autonomy.', 'error'); }
    freeBtn.disabled = false;
  }

  freeBtn.onclick = async () => {
    if (!v) await load();
    if (!v) return;
    if (v.settings.free) { closeAsk(); return setFree(false); }
    if (!v.settings.enabled) { note('Hands are off, so there is nothing for Bob to do without asking. Turn on Screen use, or Hands in Settings, first.'); return; }
    if (!ask) return setFree(true);
    ask.hidden = false;
    ask.querySelector('[data-freeno]')?.focus();
  };
  if (ask) {
    ask.querySelector('[data-freeyes]').onclick = () => { closeAsk(); setFree(true); };
    ask.querySelector('[data-freeno]').onclick = () => { closeAsk(); note('Left off. Bob still asks before every action.'); freeBtn.focus(); };
    ask.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeAsk(); freeBtn.focus(); } });
  }

  screenBtn.onclick = async () => {
    if (!v) await load();
    if (!v) return;
    const s = v.settings, ids = screenIds();
    const on = s.enabled && ids.length > 0 && ids.every((id) => s[id]?.on);
    screenBtn.disabled = true;
    try {
      const r = await call('/api/hands/quick', { screen: !on });
      after(r);
      if (on) note('Screen use is off. Bob won\'t use apps or his browser.');
      else {
        const eyes = Boolean(r.browser?.eyes);
        note(`Screen use is on. Bob can ${ids.includes('apps') ? 'use apps and his own browser' : 'use his own browser'}; each step shows a card${r.settings.free ? ' (except Autonomy is on, so he won\'t ask)' : ''}.${eyes ? '' : ' He has no eyes brain yet, so he can\'t check his work by looking: equip one in Equip Bob, "Seeing pictures".'}${r.woke?.length ? ` Hands were off, so these ticked ones work again too: ${r.woke.join(', ')}.` : ''}`);
      }
    } catch (err) { note(err.message || 'Screen use can only be switched on at this replicant matrix itself.', 'error'); }
    screenBtn.disabled = false;
  };

  window.addEventListener('bob-hands', (e) => { if (e.detail && v && e.detail !== v.settings) { v = { ...v, settings: e.detail }; draw(); } });
  window.addEventListener('bob-caps', load); // a brain was equipped (eyes)
  load();
  return { update(settings) { if (settings && v) { v = { ...v, settings }; draw(); } else load(); }, refresh: load };
}
