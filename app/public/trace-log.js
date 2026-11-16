// Settings, This replicant matrix, 📈 Monitoring log (src/trace-log.js). Off until you turn it on. Each turn's steps go
// to a plain text file on this replicant matrix: names, times, status and sizes only. The timeline shows the last turns.
import { esc } from './util.js';

async function api(data) {
  const r = await fetch('/api/trace-log', data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function traceLogHtml() {
  return `<p class="muted">Writes each turn's steps to a plain text file on this replicant matrix, for finding what was slow or what failed: every brain request and tool call, with how long it took and how it went. Only names, times, status and sizes: never what was said, tool inputs or results, folders, web addresses or keys.</p><div class="trace-log-box"><p class="muted">Loading…</p></div>`;
}

const secs = (ms) => `${(Math.max(0, Number(ms) || 0) / 1000).toFixed(1)} s`;
const mbOf = (b) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.ceil(b / 1024)} KB`);
const when = (t) => { try { return new Date(t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }); } catch { return ''; } };

// One turn: a bar per step, placed along the turn's time, so a slow step stands out.
export function turnHtml(t) {
  const total = Math.max(1, t.ms);
  const rows = t.spans.map((s) => {
    const left = Math.min(100, (s.from / total) * 100), width = Math.max(0.5, Math.min(100 - left, (s.ms / total) * 100));
    return `<li class="tl-row tl-${esc(s.status)}">
      <span class="tl-name"><span class="tl-kind">${esc(s.kind)}</span> ${esc(s.name)}</span>
      <span class="tl-track" aria-hidden="true"><span class="tl-bar" style="margin-left:${left.toFixed(1)}%;width:${width.toFixed(1)}%"></span></span>
      <span class="tl-time">${secs(s.ms)} · ${esc(s.status)}${s.about ? ` · ${esc(s.about)}` : ''}</span></li>`;
  }).join('');
  const errs = t.spans.filter((s) => s.status === 'error' || s.status === 'refused').length;
  return `<details class="tl-turn"><summary>${esc(when(t.at))} · ${esc(t.why || t.status)} · ${secs(t.ms)} · ${t.spans.length} step${t.spans.length === 1 ? '' : 's'}${errs ? ` · <span class="refused">${errs} error${errs === 1 ? '' : 's'}</span>` : ''}</summary>
    ${rows ? `<ul class="tl-rows">${rows}</ul>` : '<p class="muted">No brain requests or tool calls in this turn.</p>'}${t.dropped ? `<p class="muted">${t.dropped} more steps weren't written.</p>` : ''}</details>`;
}

export async function mountTraceLog(box) {
  if (!box) return;
  let v = null, said = null, armed = false; // armed: Delete was pressed once, the next press deletes
  const draw = () => {
    if (!v) return;
    box.innerHTML = `
      <label class="switch srow-switch"><input type="checkbox" data-tl-on ${v.on ? 'checked' : ''}><span><strong>Monitoring log</strong><br><span class="muted">One block per turn in <code>bob-monitoring.txt</code>, in the monitoring-log folder in my data folder. Opens in Notepad or any text editor.</span></span></label>
      <div class="row tl-size">
        <label for="tl-size-box"><strong>Keep up to</strong></label>
        <select id="tl-size-box" data-tl-size aria-describedby="tl-size-help">${v.sizes.map((s) => `<option value="${s.mb}" ${s.mb === v.maxMB ? 'selected' : ''}>${esc(s.label)}</option>`).join('')}</select>
      </div>
      <p id="tl-size-help" class="muted">When a file gets to a tenth of this, I start a new one, and the oldest file goes when they're all past it. A turn is never split across two files. Now: ${v.files} file${v.files === 1 ? '' : 's'}, ${mbOf(v.bytes)}.</p>
      <div class="row">
        <a class="mini" href="/api/trace-log/text" target="_blank" rel="noopener">Show the log</a>
        <button type="button" class="mini" data-tl-refresh>Refresh</button>
        <button type="button" class="mini" data-tl-clear ${v.files ? '' : 'disabled'}>${armed ? 'Press again to delete them' : 'Delete the log files'}</button>
      </div>
      ${said ? `<p role="status" class="${said.bad ? 'refused' : ''}">${esc(said.text)}</p>` : ''}
      <h4>Last turns</h4>
      ${v.recent.length ? `<div class="tl-list">${v.recent.map(turnHtml).join('')}</div>` : `<p class="muted">${v.on ? 'Nothing yet. Ask me something and the turn shows up here.' : 'Turn the log on to see each turn here.'}</p>`}`;
  };
  const go = async (data, ok = '') => {
    try { v = await api(data); said = ok ? { text: ok } : said; } catch (e) { said = { text: e.message, bad: true }; }
    draw();
  };
  box.addEventListener('change', (e) => {
    if (e.target.matches('[data-tl-on]')) return go({ on: e.target.checked }, e.target.checked ? 'The monitoring log is on.' : 'The monitoring log is off. The files stay until you delete them.');
    if (e.target.matches('[data-tl-size]')) return go({ maxMB: Number(e.target.value) }, 'Size limit saved.');
  });
  box.addEventListener('click', (e) => {
    if (e.target.closest('[data-tl-refresh]')) { armed = false; return go(undefined, ''); }
    if (e.target.closest('[data-tl-clear]')) {
      if (!armed) { armed = true; said = { text: 'This deletes every monitoring log file. Press again to delete them.' }; draw(); box.querySelector('[data-tl-clear]')?.focus(); return; }
      armed = false; return go({ clear: true }, 'The log files are deleted.');
    }
  });
  try { v = await api(); } catch (e) { box.innerHTML = `<p class="refused">${esc(e.message)}</p>`; return; }
  draw();
}
