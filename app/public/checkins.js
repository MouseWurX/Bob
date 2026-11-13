// Settings, 🔔 Check-ins (src/checkins.js). Off unless you turn it on.
// On a schedule you pick, Bob looks over his downloads, tasks and schedules (and your own lines) and only taps
// you on the shoulder when something needs you. The chat card for it is drawn in app.js ('checkin').
import { esc } from './util.js';
export const when = (t) => new Date(t).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function checkinsHtml() {
  return '<div class="checkins-box"><p class="muted">Loading…</p></div>';
}

// "Last check-in: Tue 09:00. All fine." or what needed you, then your own lines with their answers.
export function lastHtml(last) {
  if (!last) return '<p class="muted">No check-in yet.</p>';
  const needs = last.needs || [];
  const own = (last.own || []).filter((o) => o.needs !== true);
  return `<div class="ci-last"><strong>Last check-in:</strong> ${esc(when(last.at))}. ${needs.length ? `${needs.length} thing${needs.length === 1 ? '' : 's'} needed you:` : 'All fine.'}
    ${needs.length ? `<ul>${needs.map((n) => `<li><strong>${esc(n.title)}</strong>${n.detail ? ` <span class="muted">${esc(n.detail)}</span>` : ''}</li>`).join('')}</ul>` : ''}
    ${own.length ? `<ul class="muted">${own.map((o) => `<li>${o.needs === 'unsure' ? '❔' : '✓'} ${esc(o.line)}${o.why ? `${/[?.!]$/.test(o.line) ? ' ' : ': '}${esc(o.why)}` : ''}</li>`).join('')}</ul>` : ''}
    ${last.ownNote ? `<p class="muted">${esc(last.ownNote)}</p>` : ''}</div>`;
}

export async function mountCheckins(box) {
  if (!box) return;
  let v, msg = '', busy = false;
  const draw = () => {
    const on = v.enabled, dim = ''; // everything can be set up before switching on
    box.innerHTML = `<label class="switch"><input type="checkbox" data-ci-on ${on ? 'checked' : ''}><span><strong>Scheduled check-ins</strong> <span class="tag">off unless you turn it on</span><br><span class="muted">Bob looks over his downloads, tasks and schedules when you choose, and only tells you (a card in the chat) when something needs you. Looking never changes anything. Only while Bob is open.</span></span></label>
      <div class="row"><strong>How often</strong>
        <select data-ci-how aria-label="How often" ${dim}><option value="daily" ${v.how === 'daily' ? 'selected' : ''}>Every day</option><option value="weekdays" ${v.how === 'weekdays' ? 'selected' : ''}>Every weekday</option><option value="hours" ${v.how === 'hours' ? 'selected' : ''}>Every few hours</option></select>
        ${v.how === 'hours'
          ? `<label>every <input type="number" min="1" max="24" data-ci-hours value="${esc(v.hours)}" aria-label="Every how many hours" style="width:4em" ${dim}> hours</label>`
          : `<label>at <input type="time" data-ci-at value="${esc(v.at)}" aria-label="At what time" ${dim}></label>`}
        ${on && v.next ? `<span class="muted">Next: ${esc(when(v.next))}</span>` : ''}</div>
      <div><strong>What Bob checks</strong>
        ${Object.entries(v.checkLabels).map(([k, label]) => `<label class="switch small"><input type="checkbox" data-ci-check="${k}" ${v.checks[k] ? 'checked' : ''} ${dim}><span>${esc(label)}</span></label>`).join('')}</div>
      <div><strong>Your own checks</strong> <span class="muted">(one per line, up to 8)</span>
        <textarea data-ci-own rows="4" maxlength="1400" placeholder="Did the build finish?&#10;Did the backup run?" aria-label="Your own checks, one per line" style="width:100%" ${dim}>${esc(v.own.join('\n'))}</textarea>
        <div class="row"><button type="button" data-ci-save style="min-height:32px" ${dim}>Save my checks</button><button type="button" data-ci-now style="min-height:32px" ${busy ? 'disabled' : ''}>${busy ? 'Checking…' : 'Check in now'}</button>${msg ? `<span class="muted" role="status">${esc(msg)}</span>` : ''}</div>
        <p class="muted">Bob's quick brain${v.smallBrain ? ` (${esc(v.smallBrain)})` : ''} answers these from his tasks, downloads, schedules and logbook, on the processor, only while Bob is idle and never in the Gaming session. If nothing there says, he writes "couldn't tell" below instead of bothering you.</p></div>
      ${lastHtml(v.last)}`;
  };
  const load = async () => { v = await api('/api/checkins'); draw(); };
  const change = async (patch, ok = '') => {
    try { v = await api('/api/checkins', patch); msg = ok; } catch (e) { msg = e.message; }
    draw();
  };
  box.addEventListener('change', (e) => {
    const t = e.target;
    if (t.matches('[data-ci-on]')) change({ enabled: t.checked }, t.checked ? 'On. I\'ll only speak up when something needs you.' : 'Off.');
    else if (t.matches('[data-ci-how]')) change({ how: t.value }, 'Saved.');
    else if (t.matches('[data-ci-at]') && t.value) change({ at: t.value }, 'Saved.');
    else if (t.matches('[data-ci-hours]')) change({ hours: Number(t.value) }, 'Saved.');
    else if (t.matches('[data-ci-check]')) change({ checks: { [t.dataset.ciCheck]: t.checked } }, 'Saved.');
  });
  box.addEventListener('click', async (e) => {
    if (e.target.closest('[data-ci-save]')) change({ own: box.querySelector('[data-ci-own]').value.split(/\r?\n/) }, 'Saved.');
    if (e.target.closest('[data-ci-now]')) {
      busy = true; msg = ''; draw();
      try { v = await api('/api/checkins', { runNow: true }); msg = v.ran?.needs?.length ? '' : 'All fine.'; } catch (err) { msg = err.message; }
      busy = false; draw();
    }
  });
  try { await load(); } catch (e) { box.innerHTML = `<p class="muted">${esc(e.message)}</p>`; }
}
