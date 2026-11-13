// Settings, This replicant matrix, 🔒 Passcode lock (src/lock.js, src/vault.js). Off unless you turn it on.
// Everything here is always shown and can be filled in before the switches go on (SETTINGS-STYLE rule 14).
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export const LOST_WARNING = 'If you forget the passcode, your locked chats and memory are gone for good. Nobody can open them, not even Bob, and there is no reset.';

// What the closed panel says.
export function lockSummary(v) {
  if (!v?.enabled) return v?.passcodeSet ? 'Off · passcode made' : 'Off';
  return `On${v.idleMinutes ? ` · locks after ${v.idleMinutes} min of nothing` : ' · asks when Bob starts'}${v.encrypt ? ' · chats and memory locked' : ''}`;
}

export const lockSettingsHtml = () => '<div class="lock-box"><p class="muted">Loading…</p></div><div class="lock-reset-box"></div>';

export async function mountLockSettings(box, { onChange = () => {} } = {}) {
  if (!box) return;
  let v, msg = '', asking = false, offAsk = false;
  const draw = () => {
    box.innerHTML = `<span class="tag">off unless you turn it on</span>
      <p class="muted">Anyone at this replicant matrix can open Bob's window and read your chats and memory. A passcode stops that.</p>
      <div class="lock-code srow">
        <span class="slabel"><strong>${v.passcodeSet ? 'Change the passcode' : 'Make a passcode'}</strong></span>
        <span class="svalue lock-inputs">
          ${v.passcodeSet ? '<input type="password" data-lock-current autocomplete="current-password" aria-label="Passcode you have now" placeholder="Passcode you have now">' : ''}
          <input type="password" data-lock-new autocomplete="new-password" aria-label="New passcode" placeholder="New passcode (${v.minLength}+ characters)">
          <input type="password" data-lock-again autocomplete="new-password" aria-label="New passcode again" placeholder="Same again">
        </span>
        <span class="sact"><button type="button" data-lock-save>Save passcode</button></span>
      </div>
      <label class="switch"><input type="checkbox" data-lock-on ${v.enabled && !offAsk ? 'checked' : ''}><span><strong>Ask for a passcode to open Bob</strong><br><span class="muted">Bob's window and Settings show a passcode screen first. Bob keeps working behind it (reminders, schedules, downloads). Each time Bob starts, it asks again. To turn it off, type the same passcode.</span></span></label>
      ${offAsk ? `<div class="lock-ask" role="alertdialog" aria-label="Turn the passcode lock off?"><p><strong>Turn the lock off?</strong> Type the passcode that turned it on.${v.encrypt ? ' Your locked chats and memory go back to plain files in the same step, so nothing is lost.' : ''}</p><div class="row"><input type="password" data-lock-off-code autocomplete="current-password" aria-label="Your passcode" placeholder="Your passcode"><button type="button" class="get" data-lock-off-yes>Turn it off</button><button type="button" data-lock-off-no>Keep it on</button></div></div>` : ''}
      <div class="srow"><span class="slabel"><label for="lock-idle">Lock again after</label></span><span class="svalue"><input id="lock-idle" type="number" min="0" max="1440" step="1" data-lock-idle value="${esc(v.idleMinutes)}" style="width:6em"> minutes of nothing</span><span class="sact muted">0: only when Bob starts</span></div>
      <label class="switch"><input type="checkbox" data-lock-enc ${v.encrypt || asking ? 'checked' : ''}><span><strong>Lock my chats and memory</strong><br><span class="muted">Your chats and Bob's memory file are kept scrambled on disk, so copying the files or opening them in another program shows nothing readable. The passcode unscrambles them when you open Bob.</span><br><strong class="lock-warn">⚠ ${esc(LOST_WARNING)}</strong></span></label>
      ${asking ? `<div class="lock-ask" role="alertdialog" aria-label="Lock my chats and memory?"><p><strong>Lock your chats and memory now?</strong> ${esc(LOST_WARNING)} Write the passcode down somewhere safe first.</p><div class="row"><button type="button" class="get" data-lock-enc-yes>Yes, lock them</button><button type="button" data-lock-enc-no>Not now</button></div></div>` : ''}
      <div class="row"><button type="button" data-lock-now>🔒 Lock Bob now</button></div>
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>More</summary><p class="muted">Your phone and your other Bobs come in through Bob-Net access, with that door's own passcode. Bob for Android has its own passcode lock in its Settings. Turning Lock my chats and memory off puts every file back to plain text. Copies in the Recycle Bin stay locked.</p></details>`;
  };
  const turnOff = async () => {
    const code = box.querySelector('[data-lock-off-code]')?.value || '';
    const done = v.encrypt ? 'Off. Your chats and memory are plain files again, and Bob opens without a passcode.' : 'Off. Bob opens without a passcode.';
    try { v = { ...v, ...(await api('/api/lock', { enabled: false, passcode: code })) }; msg = done; offAsk = false; onChange(v); }
    catch (e) { msg = e.message; } // a wrong passcode leaves the box open to try again
    draw();
    box.querySelector('[data-lock-off-code]')?.focus();
  };
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-lock-off-code]')) { e.preventDefault(); turnOff(); } });
  const load = async () => { v = await api('/api/lock'); draw(); };
  const change = async (patch, done = '') => {
    try { v = { ...v, ...(await api('/api/lock', patch)) }; msg = done; onChange(v); }
    catch (e) { msg = e.message; }
    asking = false;
    draw();
  };
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-lock-on]')) {
      if (!e.target.checked && v.enabled) { offAsk = true; msg = ''; draw(); box.querySelector('[data-lock-off-code]')?.focus(); return; } // stays on until the passcode is typed
      offAsk = false;
      change({ enabled: e.target.checked }, 'On. Bob asks for the passcode next time he starts, or after Lock Bob now.');
    }
    if (e.target.matches('[data-lock-idle]')) change({ idleMinutes: Number(e.target.value) || 0 }, 'Saved.');
    if (e.target.matches('[data-lock-enc]')) {
      if (e.target.checked && !v.encrypt) { asking = true; msg = ''; draw(); }
      else if (!e.target.checked && v.encrypt) change({ encrypt: false }, 'Your chats and memory are plain files again.');
      else { asking = false; draw(); }
    }
  });
  box.addEventListener('click', async (e) => {
    if (e.target.closest('[data-lock-enc-yes]')) return change({ encrypt: true }, 'Locked. Your chats and memory are scrambled on disk now.');
    if (e.target.closest('[data-lock-enc-no]')) { asking = false; draw(); return; }
    if (e.target.closest('[data-lock-off-no]')) { offAsk = false; msg = ''; draw(); return; }
    if (e.target.closest('[data-lock-off-yes]')) return turnOff();
    if (e.target.closest('[data-lock-save]')) {
      const val = (s) => box.querySelector(s)?.value || '';
      if (val('[data-lock-new]') !== val('[data-lock-again]')) { msg = 'The two new passcodes don\'t match.'; draw(); return; }
      return change({ newPasscode: val('[data-lock-new]'), current: val('[data-lock-current]') }, v.encrypt ? 'Passcode changed. Your locked chats open with the new one now.' : 'Passcode saved.');
    }
    if (e.target.closest('[data-lock-now]')) {
      if (!v.enabled) { msg = 'Turn on Ask for a passcode to open Bob first.'; draw(); return; }
      try { await api('/api/lock/now', {}); location.reload(); } catch (err) { msg = err.message; draw(); }
    }
  });
  try { await load(); } catch (e) { box.innerHTML = `<strong>🔒 Passcode lock</strong><p class="muted">${esc(e.message)}</p>`; }
  mountLockReset(box.parentElement?.querySelector('.lock-reset-box'));
}

const when = (iso) => { const d = new Date(iso); return Number.isNaN(+d) ? '' : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }); };

// 🔑 Forgot the passcode? (src/lock-reset.js): a spare key on another Bob, codes by email or Discord, and the spare
// keys this Bob keeps for your other Bobs. Everything shows all the time; nothing is set up until you press it.
export async function mountLockReset(box) {
  if (!box) return;
  let v = {}, s = { kept: [], bobs: [] }, msg = '';
  const draw = () => {
    const kept = s.kept.map((k) => `<li><strong>${esc(k.bob)}</strong> <span class="muted">since ${esc(when(k.at))}${k.asking ? ' · <strong>asking to reset now</strong>' : ''}</span>
      <button type="button" class="${k.asking ? 'get' : 'mini'}" data-spare-let="${esc(k.id)}">Let it reset</button> <button type="button" class="mini" data-spare-forget="${esc(k.id)}" aria-label="Forget the spare key for ${esc(k.bob)}">Forget</button></li>`).join('');
    box.innerHTML = `<h4 class="ssub">🔑 Forgot the passcode?</h4>
      <p class="muted">Ways back in, started from the lock screen with <strong>Forgot it?</strong>.</p>
      <div class="srow"><span class="slabel"><strong>Spare key on another Bob</strong><br><span class="muted">Gets everything back, locked chats too. Press this, then <strong>Pick up a spare key</strong> in your other Bob's own Settings within 15 minutes.</span></span>
        <span class="sact"><button type="button" data-reset-offer>Get a spare key ready</button></span></div>
      <p class="muted">${v.offerUntil ? `Waiting to be picked up until ${esc(new Date(v.offerUntil).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }))}. ` : ''}${v.keptBy?.length ? `Kept by: ${esc(v.keptBy.map((k) => k.name).join(', '))}.` : 'No other Bob keeps one yet.'}${v.spareReady ? ' <button type="button" class="mini" data-reset-drop>Stop every spare key</button>' : ''}</p>
      <label class="switch"><input type="checkbox" data-reset-way="email" ${v.email ? 'checked' : ''}><span><strong>Email me a code</strong><br><span class="muted">Opens the lock screen only; locked chats stay locked. Uses your account in Online services, 📧 Email account${v.emailReady ? '' : ' (not set up yet)'}.</span></span></label>
      <label class="switch"><input type="checkbox" data-reset-way="discord" ${v.discord ? 'checked' : ''}><span><strong>Send a code to my Discord</strong><br><span class="muted">Same, by a private message from Bob on Discord${v.discordReady ? '' : ' (needs Bob on Discord with Discord DMs on)'}.</span></span></label>
      <h4 class="ssub">Spare keys I keep</h4>
      <p class="muted">For your other Bobs. When one asks, press <strong>Let it reset</strong> here.</p>
      <ul class="plain">${kept || '<li class="muted">None yet.</li>'}</ul>
      <div class="row"><label>Pick up a spare key from <select data-spare-from>${s.bobs.map((b) => `<option value="${esc(b.address)}">${esc(b.name)}</option>`).join('') || '<option value="">No other Bobs yet</option>'}</select></label> <button type="button" class="mini" data-spare-pickup>Pick up a spare key</button></div>
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}`;
  };
  const load = async () => {
    try { v = await api('/api/lock/reset'); } catch (e) { msg = e.message; }
    try { s = await api('/api/spares'); } catch (e) { msg = e.message; }
    draw();
  };
  const run = async (url, data, done) => {
    try { const r = await api(url, data); if (url === '/api/lock/reset') v = r; msg = done(r); } catch (e) { msg = e.message; }
    if (url === '/api/spares') { try { s = await api('/api/spares'); } catch {} }
    draw();
  };
  box.addEventListener('change', (e) => {
    const w = e.target.dataset?.resetWay;
    if (w) run('/api/lock/reset', { [w]: e.target.checked }, () => (e.target.checked ? 'On.' : 'Off.'));
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const d = b.dataset;
    if ('resetOffer' in d) run('/api/lock/reset', { offer: true }, () => 'Ready for 15 minutes. Now press Pick up a spare key on your other Bob.');
    else if ('resetDrop' in d) run('/api/lock/reset', { drop: true }, () => 'Every spare key stopped working. Get a new one ready when you like.');
    else if ('sparePickup' in d) { const a = box.querySelector('[data-spare-from]')?.value; if (a) run('/api/spares', { pickup: a }, () => 'Spare key kept.'); }
    else if (d.spareLet) run('/api/spares', { letReset: d.spareLet }, (r) => `Done. ${r.bob} can make a new passcode on its lock screen now.`);
    else if (d.spareForget) run('/api/spares', { forget: d.spareForget }, () => 'Forgotten.');
  });
  await load();
}

// Any open page goes back to the lock screen once Bob locks (Lock Bob now, or after minutes of nothing).
export function watchLock({ every = 20000 } = {}) {
  const check = async () => {
    try { const r = await fetch('/api/lock/state', { cache: 'no-store' }); const j = await r.json(); if (j.locked) location.reload(); } catch {}
  };
  setInterval(check, every);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
