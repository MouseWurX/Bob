// Nov 23 2026: Settings, Online services, 📡 Where Bob connected (src/net-log.js). What can send your data out right
// now (the services switched on), and every site Bob's own program connected to lately. It only reads.
import { esc } from './util.js';

const when = (ms) => { const d = new Date(ms); return `${d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} ${d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`; };

export function netLogHtml(v) {
  const now = v.now.length
    ? `<p><strong>Can send your data out right now:</strong> ${v.now.map((s) => `${esc(s.name)} <span class="muted">(to ${esc(s.to.replace(/\.$/, ''))})</span>`).join(', ')}.</p>`
    : '<p><strong>Nothing that sends your data out is switched on.</strong> Only update checks and downloads you start go online.</p>';
  const rows = v.recent.map((e) => `<tr${e.unlisted ? ' class="warn"' : ''}><td>${esc(when(e.last))}</td><td>${esc(e.host)}</td><td>${esc(e.label)}${e.count > 1 ? ` <span class="muted">×${e.count}</span>` : ''}</td></tr>`).join('');
  return `<strong>📡 Where Bob connected</strong> <button type="button" class="mini help-link" data-help="privacy-card" aria-label="Help: Where Bob connected">?</button>
    ${now}
    ${rows ? `<div class="table-wrap"><table class="net-log"><thead><tr><th>Last time</th><th>Site</th><th>What for</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No connections since Bob started.</p>'}
    <p class="muted">${esc(v.childNote)} The whole list is net-log.jsonl in Bob's data folder.</p>
    <button type="button" data-netlog-again>Check again</button>`;
}

export async function mountNetLog(box) {
  if (!box) return;
  const load = async () => {
    try { const r = await fetch('/api/net-log'); const v = await r.json(); if (!r.ok) throw new Error(v.error || `Error ${r.status}`); box.innerHTML = netLogHtml(v); }
    catch (e) { box.innerHTML = `<strong>📡 Where Bob connected</strong><p class="muted">${esc(e.message)}</p>`; }
  };
  box.addEventListener('click', (e) => { if (e.target.closest('[data-netlog-again]')) load(); });
  await load();
}
