// Settings, This replicant matrix: "🔐 Locked secrets" (src/secret-box.js, src/secret-settings.js). On by default.
// Shows how Bob's passcodes, tokens and keys are kept, the names of keys saved here (never the keys), a box to
// save a new key, and, only when the box can't be opened, the button that starts a new one.
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.view = j; throw e; }
  return j;
}

export function secretsHtml() {
  return '<div class="secrets-box"><p class="muted">Loading…</p></div>';
}

export async function mountSecrets(box) {
  if (!box) return;
  let v, msg = '';
  const draw = () => {
    const state = v.stuck
      ? `<p class="warn-text" role="alert"><strong>I can't open my locked box.</strong> ${esc(v.label)} didn't hand its key back. That happens when Bob's folder was copied from another computer, or the key keeper was reset. Your saved passcodes and keys read as empty until it opens. If it won't, start a new box: anything in the old one needs typing again.</p>
        <div class="row"><button type="button" data-sec-fresh>Start a new locked box</button></div>`
      : v.on ? `<p class="muted" role="status">✓ Locked with ${esc(v.label)}.</p>` : '<p class="muted" role="status">Off: passcodes, tokens and keys are kept as plain text in Bob\'s files.</p>';
    box.innerHTML = `<label class="switch"><input type="checkbox" data-sec-on ${v.on ? 'checked' : ''}><span><strong>Lock Bob's passwords and keys</strong><br><span class="muted">On to start with. Every passcode, bot token and key Bob saves is scrambled (AES-256) with a key your computer keeps for your account only: Windows DPAPI, the Mac Keychain, or the Linux key keeper. A copy of Bob's folder on its own opens nothing. Off: they're kept as plain text.</span></span></label>
      ${state}
      <div class="row"><strong>Keys saved here</strong> <span class="muted">${v.keys.length ? v.keys.map((k) => `<code>${esc(k)}</code> <button type="button" class="mini" data-sec-remove="${esc(k)}" aria-label="Remove ${esc(k)}">Remove</button>`).join(' ') : 'None yet.'}</span></div>
      <div class="row"><label for="sec-name"><strong>Save a key</strong></label>
        <input id="sec-name" type="text" maxlength="64" autocomplete="off" spellcheck="false" placeholder="Its name, like HF_TOKEN" data-sec-name>
        <input id="sec-value" type="password" autocomplete="off" spellcheck="false" placeholder="Paste the key" aria-label="The key" data-sec-value>
        <button type="button" data-sec-add>Save key</button>
        <span class="muted">Works anywhere Bob asks for a key by name (a rented brain, a cloud helper, Hugging Face). A key in your environment variables with the same name still wins.</span></div>
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}`;
  };
  const act = async (data, done) => {
    try { v = await api('/api/secrets', data); msg = done; }
    catch (e) { if (e.view?.keys) v = e.view; msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => {
    if (!e.target.matches('[data-sec-on]')) return;
    const on = e.target.checked;
    act({ on }, on ? 'Locked. Every passcode, token and key is scrambled again.' : 'Off. Bob keeps them as plain text now.');
  });
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.matches('[data-sec-add]')) {
      const name = box.querySelector('[data-sec-name]').value.trim(), value = box.querySelector('[data-sec-value]').value;
      act({ addKey: { name, value } }, `Saved ${name.toUpperCase()}, locked.`);
    } else if (b.dataset.secRemove) act({ removeKey: b.dataset.secRemove }, `Removed ${b.dataset.secRemove}.`);
    else if (b.matches('[data-sec-fresh]')) act({ freshBox: true }, 'A new locked box is ready. Type the passcodes and keys you need again.');
  });
  try { v = await api('/api/secrets'); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; return; }
  draw();
}
