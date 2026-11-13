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

export const lockSettingsHtml = () => '<div class="lock-box"><p class="muted">Loading…</p></div>';

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
}

// Any open page goes back to the lock screen once Bob locks (Lock Bob now, or after minutes of nothing).
export function watchLock({ every = 20000 } = {}) {
  const check = async () => {
    try { const r = await fetch('/api/lock/state', { cache: 'no-store' }); const j = await r.json(); if (j.locked) location.reload(); } catch {}
  };
  setInterval(check, every);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
