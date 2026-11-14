// 1.5.28: the "Web search" switch on the chat page, in the Effort row. It is the same setting as "Let Bob search
// the web" in Settings (off by default): flipping either one changes both. Off means Bob never goes online to look
// things up, and tells you where to turn it on when a question needs the internet.
const $ = (id) => document.getElementById(id);

export function createWebSwitch({ note }) {
  const btn = $('webBtn'), st = $('webBtnSt');
  if (!btn) return { update() {}, refresh() {} };
  let on = false;

  function draw() {
    btn.setAttribute('aria-checked', String(on));
    st.textContent = on ? 'On' : 'Off';
    btn.title = on ? 'Bob can search the web (DuckDuckGo) and read pages when a question needs it. Only the search words and page addresses leave your replicant matrix (your computer). Click to turn it off.'
      : 'Bob won\'t go online to look things up. Click to let him search the web when a question needs it. Same switch as "Web search" in Settings.';
  }

  async function load() {
    try { const r = await fetch('/api/settings'); const j = await r.json(); on = j.webSearch === true; draw(); } catch {}
  }

  async function toggle() {
    btn.disabled = true;
    try {
      const r = await fetch('/api/settings', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ webSearch: !on }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      on = j.webSearch === true; draw();
      note(on ? 'Web search is on. Bob can look things up on DuckDuckGo when a question needs it.' : 'Web search is off. Bob won\'t go online to look things up.');
      window.dispatchEvent(new CustomEvent('bob-web', { detail: { webSearch: on } }));
    } catch (err) { note('Couldn\'t change web search. Try again, or use "Web search" in Settings.', 'error'); }
    btn.disabled = false;
  }
  btn.onclick = toggle;
  // Changed in Settings: show it here too.
  window.addEventListener('bob-web', (e) => { if (typeof e.detail?.webSearch === 'boolean' && e.detail.webSearch !== on) { on = e.detail.webSearch; draw(); } });
  window.addEventListener('bob-caps', load);
  draw(); load();
  return { update(v) { on = v === true; draw(); }, refresh: load };
}
