// Settings, Connections, 🔎 Search API keys (src/web-search.js). Every service is off until you turn it on, and
// each needs your own key: Bob ships none. When the free search pages turn this replicant matrix away with a robot
// check, Bob asks the services you turned on, in this order. A saved key is never sent back to this page: it shows
// as dots and "saved".
import { esc } from './util.js';

async function api(data) {
  const r = await fetch('/api/search-backup', data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function searchBackupHtml() {
  return `<p class="muted">When the free search pages (DuckDuckGo, Mojeek) turn this replicant matrix away with a robot check, I ask a search service you've set up here instead, top to bottom, and say which one answered. Each is off until you turn it on, and needs your own key. Only the search words go. Each stops at its monthly cap, so nothing is charged unless you raise it.</p><div class="search-backup-box"><p class="muted">Loading…</p></div>`;
}

export async function mountSearchBackup(box) {
  if (!box) return;
  let v = null;
  const said = {}; // id -> { text, bad }
  const row = (s, i) => {
    const m = said[s.id];
    return `<li class="sb-service" data-sb-id="${esc(s.id)}">
      <label class="switch srow-switch"><input type="checkbox" data-sb-use ${s.on ? 'checked' : ''}><span><strong>${esc(s.name)}</strong><br><span class="muted">${esc(s.note)} <a href="${esc(s.signup)}" target="_blank" rel="noopener noreferrer">Get a key</a></span></span></label>
      <div class="row sb-key">
        <label class="sb-keylabel">Key <input type="password" autocomplete="off" spellcheck="false" data-sb-keybox aria-label="${esc(s.name)} key" placeholder="${s.hasKey ? '•••••••• saved' : 'Paste your key'}"></label>
        <button type="button" class="mini" data-sb-save>Save key</button>
        ${s.hasKey ? '<button type="button" class="mini link" data-sb-forget>Forget key</button>' : ''}
        <button type="button" class="mini" data-sb-test ${s.hasKey ? '' : 'disabled'}>Test</button>
      </div>
      <div class="row muted">
        <label>Monthly cap <input type="number" min="0" max="100000" step="1" value="${s.cap}" data-sb-cap aria-label="${esc(s.name)} monthly cap" style="width:7em"></label>
        <span>${s.used} used this month</span>
        ${i > 0 ? `<button type="button" class="mini" data-sb-up aria-label="Ask ${esc(s.name)} sooner">↑ Sooner</button>` : ''}
      </div>
      ${m ? `<p role="status" class="${m.bad ? 'refused' : ''}">${esc(m.text)}</p>` : ''}
    </li>`;
  };
  const draw = () => { if (v) box.innerHTML = `<ol class="share-list sb-list">${v.services.map(row).join('')}</ol>`; };
  const go = async (id, data, ok = '') => {
    try { v = await api(data); if (id) said[id] = v.test ? { text: v.test.says, bad: !v.test.ok } : ok ? { text: ok } : said[id]; }
    catch (e) { if (id) said[id] = { text: e.message, bad: true }; }
    draw();
  };
  box.addEventListener('change', (e) => {
    const li = e.target.closest('[data-sb-id]'); if (!li) return;
    const id = li.dataset.sbId, name = v.services.find((s) => s.id === id)?.name || id;
    if (e.target.matches('[data-sb-use]')) return go(id, { use: { id, on: e.target.checked } }, e.target.checked ? `${name} is on.${v.services.find((s) => s.id === id)?.hasKey ? '' : ' Add your key below.'}` : `${name} is off.`);
    if (e.target.matches('[data-sb-cap]')) return go(id, { cap: { id, value: Number(e.target.value) } }, 'Cap saved.');
  });
  box.addEventListener('click', (e) => {
    const li = e.target.closest('[data-sb-id]'); if (!li) return;
    const id = li.dataset.sbId;
    if (e.target.closest('[data-sb-save]')) { const k = li.querySelector('[data-sb-keybox]').value; return go(id, { service: id, key: k }, 'Key saved, locked with my other keys.'); }
    if (e.target.closest('[data-sb-forget]')) return go(id, { service: id, forget: true }, 'Key forgotten.');
    if (e.target.closest('[data-sb-test]')) { said[id] = { text: 'Testing…' }; draw(); return go(id, { test: id }); }
    if (e.target.closest('[data-sb-up]')) { const o = v.order.slice(); const i = o.indexOf(id); if (i > 0) [o[i - 1], o[i]] = [o[i], o[i - 1]]; return go(id, { order: o }); }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches('[data-sb-keybox]')) { e.preventDefault(); e.target.closest('[data-sb-id]').querySelector('[data-sb-save]').click(); } });
  try { v = await api(); } catch (e) { box.innerHTML = `<p class="refused">${esc(e.message)}</p>`; return; }
  draw();
}
