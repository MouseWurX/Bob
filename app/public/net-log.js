// Nov 23 2026: Settings, Online services, 📡 Where Bob connected (src/net-log.js). What can send your data out right
// now (the services switched on), and every site Bob's own program connected to lately: when, which site, what for and
// (Nov 27 2026) which of his tools opened it. Connections No internet stopped are marked "Stopped".
// Nov 27 2026: 🚫 No internet (src/no-internet.js), off unless you turn it on: the switch, what's still allowed, the
// allowed sites, and what stops while it's on. Turning it on sends nothing, so it needs no privacy card.
import { esc } from './util.js';

const when = (ms) => { const d = new Date(ms); return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; };

export function noInternetHtml(ni) {
  if (!ni) return '';
  const sites = ni.allow.length
    ? `<ul class="ni-sites">${ni.allow.map((s) => `<li><span>${esc(s)}</span> <button type="button" class="mini" data-ni-remove="${esc(s)}" aria-label="Remove ${esc(s)}">Remove</button></li>`).join('')}</ul>`
    : '<p class="muted">No sites allowed.</p>';
  return `<div class="ni-box${ni.on ? ' on' : ''}">
    <label class="row"><input type="checkbox" data-ni="on"${ni.on ? ' checked' : ''}> <strong>🚫 No internet</strong> <span class="tag">${ni.on ? 'on' : 'off unless you turn it on'}</span></label>
    <p class="muted">Bob connects to nothing outside this replicant matrix except what you allow below.${ni.on && ni.stopped ? ` Stopped since Bob started: ${ni.stopped}.` : ''}</p>
    <label class="row"><input type="checkbox" data-ni="bobNet"${ni.bobNet ? ' checked' : ''}> Allow my own Bobs (Bob-Net)</label>
    <label class="row"><input type="checkbox" data-ni="home"${ni.home ? ' checked' : ''}> Allow my home network</label>
    <details class="more"><summary>Allowed sites (${ni.allow.length})</summary>
      ${sites}
      <p class="row"><input data-ni-site placeholder="example.com" aria-label="Site to allow" style="width:16em"> <button type="button" class="mini" data-ni-add>Allow this site</button></p>
      <p class="muted">A site allows everything under it too (example.com allows mail.example.com).</p>
    </details>
    <details class="more"${ni.on ? ' open' : ''}><summary>What stops while it's on</summary>
      <ul>${ni.stops.map((s) => `<li>${esc(s)}</li>`).join('')}</ul>
      <p><strong>Keeps working:</strong> ${esc(ni.keeps)}</p>
    </details>
    <p class="muted ni-note" role="status"></p>
  </div>`;
}

export function netLogHtml(v) {
  const now = v.now.length
    ? `<p><strong>Can send your data out right now:</strong> ${v.now.map((s) => `${esc(s.name)} <span class="muted">(to ${esc(s.to.replace(/\.$/, ''))})</span>`).join(', ')}.${v.noInternet?.on ? ' <span class="muted">No internet stops each of these unless its site is allowed.</span>' : ''}</p>`
    : '<p><strong>Nothing that sends your data out is switched on.</strong> Only update checks and downloads you start go online.</p>';
  const rows = v.recent.map((e) => `<tr class="${e.blocked ? 'stopped' : e.unlisted ? 'warn' : ''}"><td data-label="Last time">${esc(when(e.last))}</td><td data-label="Site">${esc(e.host)}</td><td data-label="What for">${esc(e.label)}${e.count > 1 ? ` <span class="muted">×${e.count}</span>` : ''}</td><td data-label="Tool">${esc(e.tool || 'Bob himself')}</td><td data-label="">${e.blocked ? '<span class="tag">Stopped</span>' : ''}</td></tr>`).join('');
  return `<strong>📡 Where Bob connected</strong> <button type="button" class="mini help-link" data-help="privacy-card" aria-label="Help: Where Bob connected">?</button>
    ${now}
    ${rows ? `<div class="table-wrap"><table class="net-log"><thead><tr><th>Last time</th><th>Site</th><th>What for</th><th>Tool</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No connections since Bob started.</p>'}
    <p class="muted">${esc(v.childNote)} The whole list is net-log.jsonl in Bob's data folder: the site, port, time, what for and which tool only, never what was sent.</p>
    <button type="button" data-netlog-again>Check again</button>
    ${noInternetHtml(v.noInternet)}
    <button type="button" class="mini help-link" data-help="no-internet" aria-label="Help: No internet">? No internet</button>`;
}

const postNi = async (data) => {
  const r = await fetch('/api/no-internet', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};

export async function mountNetLog(box) {
  if (!box) return;
  const load = async () => {
    try { const r = await fetch('/api/net-log'); const v = await r.json(); if (!r.ok) throw new Error(v.error || `Error ${r.status}`); box.innerHTML = netLogHtml(v); }
    catch (e) { box.innerHTML = `<strong>📡 Where Bob connected</strong><p class="muted">${esc(e.message)}</p>`; }
  };
  const say = (t) => { const n = box.querySelector('.ni-note'); if (n) n.textContent = t; };
  const change = async (data) => { try { await postNi(data); await load(); } catch (e) { say(e.message); } };
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-netlog-again]')) load();
    const rm = e.target.closest('[data-ni-remove]');
    if (rm) change({ remove: rm.dataset.niRemove });
    if (e.target.closest('[data-ni-add]')) { const i = box.querySelector('[data-ni-site]'); if (i?.value.trim()) change({ add: i.value.trim() }); }
  });
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.target.matches?.('[data-ni-site]')) { e.preventDefault(); if (e.target.value.trim()) change({ add: e.target.value.trim() }); } });
  box.addEventListener('change', (e) => { const k = e.target.dataset?.ni; if (k) change({ [k]: e.target.checked }); });
  await load();
}
