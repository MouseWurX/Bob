// Three small pages for harness items 62 to 72, each a dialog in the window it was opened from:
//   🩺 Health                  how each part of Bob is, with a fix button where something needs you (src/health.js)
//   📅 What Bob did this week   chats, replies, words and brain time, this week beside last week (src/weekly.js)
//   Crash report               one saved report's text (src/crash-catch.js)
// They only read, except a fix button you press.
import { esc } from './rich.js';

const get = (u) => fetch(u).then((r) => r.json());
const post = (u, d) => fetch(u, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(d) }).then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }));
const ICON = { ok: '✅', info: 'ℹ', warn: '⚠', bad: '⛔' };
const inSettingsWindow = () => /\/settings\.html$/.test(location.pathname);

// A place in Bob for a health fix: a Settings section, or Tidy up.
export function goTo(target) {
  const t = String(target || '');
  if (t === 'tidy') { window.dispatchEvent(new CustomEvent('bob-tidy')); return; }
  const jump = { cellar: 'adv-brains', crashes: 'adv-health', 'help-bundle': 'ev-pc' }[t] || (/^(adv|ev)-[\w-]{1,40}$/.test(t) ? t : '');
  if (!jump) return;
  if (inSettingsWindow()) location.hash = '#' + jump;
  else window.dispatchEvent(new CustomEvent('bob-harness-go', { detail: jump }));
}

function dialog(id, title) {
  let d = document.getElementById(id);
  if (!d) {
    d = document.createElement('dialog');
    d.id = id;
    d.className = 'cellar harness-page';
    d.setAttribute('aria-labelledby', id + '-title');
    d.innerHTML = `<div class="cellar-head"><h2 id="${id}-title"></h2><button type="button" class="link" data-close>Close</button></div><div class="harness-body" aria-live="polite"></div>`;
    d.querySelector('[data-close]').onclick = () => d.close();
    document.body.appendChild(d);
  }
  d.querySelector('h2').textContent = title;
  return d;
}

const secs = (s) => { s = Number(s) || 0; if (s < 90) return `${s} s`; const m = Math.round(s / 60); return m < 90 ? `${m} min` : `${Math.round(m / 6) / 10} h`; };
const num = (n) => Number(n || 0).toLocaleString();

// ---------------------------------------------------------------- Health
export async function openHealth() {
  const d = dialog('healthPage', '🩺 Health');
  const body = d.querySelector('.harness-body');
  const draw = (h, msg = '') => {
    body.innerHTML = `${msg ? `<p class="flash-note">${esc(msg)}</p>` : ''}<ul class="tlist health-list">${(h.checks || []).map((c) => `<li data-level="${esc(c.level)}"><span aria-hidden="true">${ICON[c.level] || ''}</span> <strong>${esc(c.label)}</strong> <span class="sr-only">(${esc(c.level === 'ok' ? 'fine' : c.level === 'info' ? 'worth knowing' : c.level === 'warn' ? 'worth a look' : 'needs you')})</span>: ${esc(c.says)}${c.lines?.length ? `<ul class="muted">${c.lines.map((l) => `<li><code>${esc(l)}</code></li>`).join('')}</ul>` : ''}${c.fix ? ` <button type="button" class="mini" data-fix="${esc(c.fix.id)}">${esc(c.fix.label)}</button>` : ''}</li>`).join('')}</ul>
      <p class="muted">This page only looks. Nothing changes until you press a button. <button type="button" class="link" data-again>Look again</button></p>`;
  };
  body.innerHTML = '<p class="muted">Looking...</p>';
  if (!d.open) d.showModal();
  const load = async (msg) => { try { draw(await get('/api/health'), msg); } catch { body.innerHTML = '<p class="muted">Couldn\'t reach Bob.</p>'; } };
  body.onclick = async (e) => {
    if (e.target.closest('[data-again]')) return load();
    const b = e.target.closest('[data-fix]');
    if (!b) return;
    const fix = b.dataset.fix;
    if (fix.startsWith('go:')) { d.close(); goTo(fix.slice(3)); return; }
    b.disabled = true;
    const r = await post('/api/health', { fix });
    if (!r.ok) { b.disabled = false; return load(r.data.error || 'That didn\'t work.'); }
    draw(r.data, fix === 'wake' ? 'Loading the brain. Look again in a moment.' : 'Done.');
  };
  await load();
}

// ---------------------------------------------------------------- What Bob did this week
export async function openWeekly() {
  const d = dialog('weeklyPage', '📅 What Bob did this week');
  const body = d.querySelector('.harness-body');
  body.innerHTML = '<p class="muted">Counting...</p>';
  if (!d.open) d.showModal();
  let v;
  try { v = await get('/api/weekly'); } catch { body.innerHTML = '<p class="muted">Couldn\'t reach Bob.</p>'; return; }
  const w = v.week || {}, b = v.before || {};
  const diff = (a, c) => (c ? ` <span class="muted">(${a >= c ? '+' : ''}${num(a - c)} on the week before)</span>` : '');
  body.innerHTML = `${v.on ? '' : '<p class="muted">Counting is off. Switch on <strong>Count what Bob did each week</strong> in Settings, This replicant matrix, 🩺 Health and history.</p>'}
    ${w.jobs ? `<table class="harness-table"><caption class="sr-only">The last 7 days</caption><tbody>
      <tr><th scope="row">Chats</th><td>${num(w.chats)}${diff(w.chats, b.chats)}</td></tr>
      <tr><th scope="row">Replies and jobs</th><td>${num(w.jobs)}${diff(w.jobs, b.jobs)}</td></tr>
      <tr><th scope="row">Words I wrote</th><td>${num(w.words)}${diff(w.words, b.words)}</td></tr>
      <tr><th scope="row">Time my brains worked</th><td>${secs(w.secs)}${b.secs ? ` <span class="muted">(${secs(b.secs)} the week before)</span>` : ''}</td></tr></tbody></table>
      <h3>Per brain</h3><table class="harness-table"><thead><tr><th scope="col">Brain</th><th scope="col">Replies</th><th scope="col">Words</th><th scope="col">Time</th></tr></thead><tbody>${(w.brains || []).map((x) => `<tr><td>${esc(x.name)}</td><td>${num(x.jobs)}</td><td>${num(x.words)}</td><td>${secs(x.secs)}</td></tr>`).join('')}</tbody></table>`
      : `<p>${v.on ? 'Nothing counted in the last 7 days yet.' : 'Nothing counted yet.'}</p>`}
    <p class="muted">The last 7 days, today included. Only numbers are kept, never what was said or which chat${v.since ? `; counting since ${esc(v.since)}` : ''}.</p>`;
}

// ---------------------------------------------------------------- one crash report
export async function openCrashReport(id) {
  const d = dialog('crashPage', 'Crash report');
  const body = d.querySelector('.harness-body');
  if (!d.open) d.showModal();
  try {
    const r = await get('/api/crash/report?id=' + encodeURIComponent(id));
    body.innerHTML = r.text ? `<pre class="crash-text" tabindex="0">${esc(r.text)}</pre><p><button type="button" data-copy>Copy it</button> <span class="muted">No chat words are in it. Share it only if you want to.</span></p>` : `<p class="muted">${esc(r.error || 'That report is gone.')}</p>`;
    const c = body.querySelector('[data-copy]');
    if (c) c.onclick = async () => { try { await navigator.clipboard.writeText(r.text); c.textContent = 'Copied'; } catch { c.textContent = 'Couldn\'t copy: select it instead'; } };
  } catch { body.innerHTML = '<p class="muted">Couldn\'t reach Bob.</p>'; }
}
