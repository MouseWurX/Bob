// Nov 23 2026: the privacy card. Turning on a service that sends data out of this replicant matrix (Telegram, Discord,
// web search, rented brains, cloud helpers, coding agents, ...) is answered 428 by Bob (src/privacy-services.js) with
// what it sends, where, who can see it there, and best practices. This shows that card, and only "Turn it on" sends
// the same change again with x-bob-privacy-ok. "Keep it off" answers the page as if the change was refused, so the
// switch it came from stays off. One wrapper on fetch covers every switch, wherever it is.
import { esc } from './util.js';

const STYLE = `dialog.privacy-card{width:min(520px,calc(100% - 32px));max-height:calc(100% - 32px);overflow:auto;padding:20px 22px;color:var(--text);background:var(--card,var(--panel));border:1px solid var(--line);border-radius:16px}
dialog.privacy-card::backdrop{background:rgba(0,0,0,.55)}dialog.privacy-card h3{margin:0 0 10px;font-size:18px}
dialog.privacy-card dl{margin:0 0 10px;font-size:14px;line-height:1.45}dialog.privacy-card dt{font-weight:600;margin-top:6px}dialog.privacy-card dd{margin:0;color:var(--muted)}
dialog.privacy-card ul{margin:4px 0 10px 18px;padding:0;font-size:14px;line-height:1.5}dialog.privacy-card a{color:var(--accent)}
dialog.privacy-card .row{display:flex;gap:10px;justify-content:flex-end;flex-wrap:wrap;margin-top:12px}
dialog.privacy-card button{min-height:40px;padding:8px 16px;font:inherit;font-size:14px;color:var(--text);background:transparent;border:1px solid var(--line);border-radius:10px;cursor:pointer}
dialog.privacy-card button.go{color:var(--on-accent);background:var(--accent);border-color:var(--accent)}`;

const host = (u) => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return ''; } };

export function cardHtml(c) {
  const tips = (c.tips || []).map((t) => `<li>${esc(t.text)} <a href="${esc(t.source)}" target="_blank" rel="noopener noreferrer">${esc(host(t.source))}</a>, checked ${esc(t.checked)}</li>`);
  const advice = (c.advice || []).map((t) => `<li>${esc(t)}</li>`);
  return `<h3>🔒 ${esc(c.name)} sends data out</h3>
    <dl><dt>What it sends</dt><dd>${esc(c.sends)}</dd><dt>Where it goes</dt><dd>${esc(c.to)}</dd><dt>Who can see it</dt><dd>${esc(c.sees)}</dd></dl>
    ${tips.length || advice.length ? `<strong>Privacy best practices</strong><ul>${tips.join('')}${advice.join('')}</ul>` : ''}`;
}

// Ask about each card in turn. true: every one was confirmed.
export function askCards(cards, doc = document) {
  return new Promise((resolve) => {
    if (!doc.getElementById('privacy-card-style')) { const st = doc.createElement('style'); st.id = 'privacy-card-style'; st.textContent = STYLE; doc.head.append(st); }
    const dlg = doc.createElement('dialog');
    dlg.className = 'privacy-card';
    dlg.setAttribute('aria-label', 'Privacy');
    dlg.innerHTML = `${cards.map(cardHtml).join('<hr>')}<p class="muted">Bob logs every connection it makes. You can turn this off again any time.</p>
      <div class="row"><button type="button" data-no>Keep it off</button><button type="button" class="go" data-yes>Turn it on</button></div>`;
    const done = (ok) => { dlg.close(); dlg.remove(); resolve(ok); };
    dlg.querySelector('[data-no]').onclick = () => done(false);
    dlg.querySelector('[data-yes]').onclick = () => done(true);
    dlg.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
    doc.body.append(dlg);
    dlg.showModal?.();
    dlg.querySelector('[data-no]').focus();
  });
}

export function installPrivacyCard(win = window, ask = (cards) => askCards(cards, win.document)) {
  if (win.bobPrivacyCard) return;
  win.bobPrivacyCard = true;
  const real = win.fetch.bind(win);
  win.fetch = async (input, init = {}) => {
    const r = await real(input, init);
    if (r.status !== 428) return r;
    const j = await r.clone().json().catch(() => null);
    if (!Array.isArray(j?.privacy) || !j.privacy.length) return r;
    if (!(await ask(j.privacy))) return new Response(JSON.stringify({ error: 'Kept off.', keptOff: true }), { status: 409, headers: { 'content-type': 'application/json' } });
    const headers = new Headers(init.headers || {});
    headers.set('x-bob-privacy-ok', j.privacy.map((c) => c.id).join(','));
    return real(input, { ...init, headers });
  };
}

if (typeof window !== 'undefined' && typeof window.fetch === 'function') installPrivacyCard(window);
