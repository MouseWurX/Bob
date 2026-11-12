// Settings, Other apps: "Let other apps use Bob's brains" (src/apps-door.js). Off unless you turn it on.
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function appsDoorHtml() {
  return '<div class="apps-door-box"><strong>Let other apps use Bob\'s brains</strong><p class="muted">Loading…</p></div>';
}

// The panel as HTML, from what GET /api/apps-door sent. Every control is drawn all the time (settings rule 14).
export function appsDoorBody(v, { msg = '', shown = false } = {}) {
  const sw = (key, label, note, on) => `<label class="switch"><input type="checkbox" data-ad="${key}" ${on ? 'checked' : ''}><span><strong>${label}</strong><br><span class="muted">${note}</span></span></label>`;
  const key = v.key ? (shown ? `<code class="apps-key">${esc(v.key)}</code>` : '<code class="apps-key">bob-••••••••</code>') : '<span class="muted">Made the first time you switch this on, or press New key.</span>';
  return `<strong>Let other apps use Bob's brains</strong> <span class="tag">off unless you turn it on</span>
      ${sw('enabled', 'Let other apps use Bob\'s brains', 'Coding and chat apps on this replicant matrix use my brains, with the key below.', v.enabled)}
      <p class="muted" role="status">${v.enabled ? `On. Address for apps: <code>${esc(v.url)}</code>` : 'Off.'}</p>
      <div class="row"><strong>Key for other apps</strong> ${key}
        ${v.key ? `<button type="button" class="mini" data-ad-show>${shown ? 'Hide the key' : 'Show the key'}</button><button type="button" class="mini" data-ad-copy>Copy the key</button>` : ''}
        <button type="button" class="mini" data-ad-new>New key</button></div>
      ${sw('network', 'Let apps on my other devices in too', `Apps on your Tailscale devices come in through Bob-Net's door, with the same key.${v.doorOpen ? '' : ' Needs Let my other replicant matrices in (Settings, Bob-Net).'}`, v.network)}
      ${v.others?.length ? `<p class="muted">From your other devices: ${v.others.map((u) => `<code>${esc(u)}</code>`).join(' or ')}</p>` : ''}
      ${msg ? `<p class="muted" role="status">${esc(msg)}</p>` : ''}
      <details class="more"><summary>How to connect an app</summary><p class="muted">Most apps have an "OpenAI-compatible" choice. Give it the address <code>${esc(v.url)}</code>, the key above, and the brain <code>bob</code> (my chat brain in this session), or any name on <code>${esc(v.url)}/models</code>.<br>
        <strong>Continue (VS Code)</strong>: add a model with provider <code>openai</code>, apiBase <code>${esc(v.url)}</code>, model <code>bob</code> and your key as apiKey.<br>
        <strong>OpenCode</strong>: add a provider using <code>@ai-sdk/openai-compatible</code> with baseURL <code>${esc(v.url)}</code> and your key.<br>
        <strong>Command line</strong>: <code>${esc(v.cli || 'bob')} ask "hello"</code>, <code>status</code> and <code>models</code>. It finds the key by itself on this replicant matrix.<br>
        The app runs its own tools; I only answer. I never save or log what apps send me. Apps wait their turn for the graphics card like my own jobs, and in the Gaming session only <code>bob</code> answers, on the processor. Web pages can't use this door.</p></details>`;
}

export async function mountAppsDoor(box) {
  if (!box) return;
  let v, msg = '', shown = false;
  const draw = () => { box.innerHTML = appsDoorBody(v, { msg, shown }); };
  const change = async (patch, said = '') => {
    try { v = await api('/api/apps-door', patch); msg = said; } catch (e) { msg = e.message; }
    draw();
  };
  try { v = await api('/api/apps-door'); } catch (e) { box.innerHTML = `<strong>Let other apps use Bob's brains</strong><p class="muted">${esc(e.message)}</p>`; return; }
  draw();
  box.addEventListener('change', (e) => { const k = e.target.dataset?.ad; if (k) change({ [k]: e.target.checked }); });
  box.addEventListener('click', async (e) => {
    if (e.target.closest('[data-ad-show]')) { shown = !shown; return draw(); }
    if (e.target.closest('[data-ad-new]')) { shown = true; return change({ newKey: true }, 'New key made. Apps using the old one need this one now.'); }
    if (e.target.closest('[data-ad-copy]')) {
      try { await navigator.clipboard.writeText(v.key); msg = 'Key copied.'; } catch { shown = true; msg = 'Couldn\'t copy. Select the key and copy it.'; }
      draw();
    }
  });
}
