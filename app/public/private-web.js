// Settings, Connections, 🕶 Private web (src/private-web.js). Off until you turn it on. Only Bob's own web tools
// change (web search, reading pages, his browser window): never Gaming mode, the Lab, Bob-Net or downloads.
import { esc } from './util.js';

async function api(data) {
  const r = await fetch('/api/private-web', data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function privateWebHtml() {
  return `<p class="muted">Private web keeps what I look up to myself. I send only the search words, I keep no cookies, and I skip any site that blocks me and ask another. It's a bit slower. It only changes my web search, reading pages and my browser window.</p><div class="private-web-box"><p class="muted">Loading…</p></div>`;
}

export async function mountPrivateWeb(box) {
  if (!box) return;
  let v = null, said = null; // said: { text, bad }
  const draw = () => {
    if (!v) return;
    box.innerHTML = `
      <label class="switch srow-switch"><input type="checkbox" data-pw-on ${v.on ? 'checked' : ''}><span><strong>Private web</strong><br><span class="muted">Search services you set up in <a href="#" data-pw-keys>Search API keys</a> go first (they get only the words). No cookies or Referer, the "do not sell or share" signal, tracking bits off links, and my browser window in a throwaway profile that blocks trackers. Signing in to sites doesn't work in it.</span></span></label>
      <label class="switch srow-switch"><input type="checkbox" data-pw-other ${v.otherSources ? 'checked' : ''}><span><strong>Try other sources when one blocks me</strong><br><span class="muted">I never get past a block. I skip that site for the job and read the same facts from up to 3 others, like another search result or a copy the Internet Archive already has.</span></span></label>
      <label class="switch srow-switch"><input type="checkbox" data-pw-human ${v.humanCheck ? 'checked' : ''} aria-describedby="pw-human-help"><span><strong>Let me finish robot checks</strong><br><span class="muted" id="pw-human-help">When a page wants a person (a captcha or a "checking your browser" page), I ask you on a card, open it in my browser window for you to finish, and carry on when it's done. I never do the check myself, and only you at this computer get asked, never Discord, guests or other apps.${v.browser ? '' : ' This needs my browser window, so it works in the Bob desktop app, not here.'}</span></span></label>
      <div class="pw-route">
        <label for="pw-route-box"><strong>Route through</strong> <span class="muted">(optional: your own proxy or Tor)</span></label>
        <div class="row">
          <input id="pw-route-box" type="text" inputmode="url" autocomplete="off" spellcheck="false" data-pw-routebox value="${esc(v.route)}" placeholder="socks5://127.0.0.1:9050" aria-describedby="pw-route-help">
          <button type="button" class="mini" data-pw-save>Save</button>
          ${v.route ? '<button type="button" class="mini link" data-pw-clear>Clear</button>' : ''}
          <button type="button" class="mini" data-pw-test ${v.route ? '' : 'disabled'}>Test</button>
        </div>
        <p id="pw-route-help" class="muted">You set up the proxy or Tor; I don't install or pick one. Only my web search, pages and browser window use it, and if it's down I stop instead of going direct. A VPN app needs nothing here. ${v.desktop ? '' : 'Routing works in the Bob desktop app for now.'}</p>
      </div>
      ${said ? `<p role="status" class="${said.bad ? 'refused' : ''}">${esc(said.text)}</p>` : ''}`;
  };
  const go = async (data, ok = '') => {
    try { v = await api(data); said = v.test ? { text: v.test.says, bad: !v.test.ok } : ok ? { text: ok } : said; }
    catch (e) { said = { text: e.message, bad: true }; }
    draw();
  };
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-pw-on]')) return go({ on: e.target.checked }, e.target.checked ? 'Private web is on.' : 'Private web is off.');
    if (e.target.matches('[data-pw-human]')) return go({ humanCheck: e.target.checked }, e.target.checked ? "I'll ask you on a card when a page wants a person." : "I'll skip pages that want a person, as before.");
    if (e.target.matches('[data-pw-other]')) return go({ otherSources: e.target.checked }, e.target.checked ? "I'll try other sources when one blocks me." : "I'll just say when a site blocks me.");
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-pw-keys]')) { e.preventDefault(); const nav = document.querySelector('.set-nav [data-topic="adv-search"]'); if (nav && !nav.hidden) nav.click(); const d = document.getElementById('sub-adv-search'); if (d) { d.open = true; d.scrollIntoView({ block: 'start' }); d.querySelector('summary')?.focus(); } return; }
    if (e.target.closest('[data-pw-save]')) return go({ route: box.querySelector('[data-pw-routebox]').value }, box.querySelector('[data-pw-routebox]').value.trim() ? 'Route saved. Press Test to check it.' : 'Route cleared.');
    if (e.target.closest('[data-pw-clear]')) return go({ route: '' }, 'Route cleared. My web tools go the usual way.');
    if (e.target.closest('[data-pw-test]')) { said = { text: 'Testing…' }; draw(); return go({ test: true }); }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-pw-routebox]')) { e.preventDefault(); box.querySelector('[data-pw-save]').click(); } });
  try { v = await api(); } catch (e) { box.innerHTML = `<p class="refused">${esc(e.message)}</p>`; return; }
  draw();
}
