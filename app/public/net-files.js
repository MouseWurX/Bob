// Bob-Net file sharing and Brain Copying (src/bob-net-files.js): the Yes card in the chat, with its progress and Stop,
// and Settings, Bob-Net, Files and brains (send a file, copy a brain, what's coming and going).
import { esc } from './util.js';

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || j.why || `Error ${r.status}`);
  return j;
}
export const size = (b) => (b >= 1e9 ? `${(b / 1e9).toFixed(b < 10e9 ? 1 : 0)} GB` : b >= 1e6 ? `${Math.round(b / 1e6)} MB` : `${Math.max(1, Math.round(b / 1e3))} KB`);
const pct = (it) => (it.total ? Math.floor((100 * (it.done || 0)) / it.total) : 0);
const left = (it) => { if (!(it.rate > 0) || !it.total) return ''; const s = (it.total - it.done) / it.rate; return s < 90 ? 'under 2 minutes left' : s < 5400 ? `about ${Math.round(s / 60)} minutes left` : `about ${(s / 3600).toFixed(1)} hours left`; };
// Nov 14 (the owner: speed and time left on a line of their own, under the % complete): "115 MB/s (920 Mbit/s) · about 8 minutes left".
export const speedLine = (it) => (it.state === 'copying' && it.rate > 0 ? `${size(it.rate)}/s (${Math.round((it.rate * 8) / 1e6)} Mbit/s)${left(it) ? ` · ${left(it)}` : ''}` : '');
const SAY = {
  copying: (it) => `Copying: ${pct(it)}% of ${size(it.total)} (${size(it.done || 0)} done)`,
  checking: (it) => `${esc(it.why || 'Checking')}…`,
  waiting: (it) => esc(it.why || 'Waiting.'),
  paused: (it) => `Paused at ${pct(it)}%. ${esc(it.why || '')}`,
  stopped: (it) => `Stopped at ${pct(it)}%. ${esc(it.why || '')}${it.gone ? '' : ' The part already copied is kept, so Carry on picks up from there.'}`,
  failed: (it) => `It didn't work: ${esc(it.why || '')}`,
  done: (it) => (it.kind === 'brain' ? `Done and checked. ${esc(it.title)} is with my other brains${it.own ? ' (under Brains of your own)' : ''}: give it a job on the Brains page.` : `Done and checked. It's in <code>${esc(it.where)}</code>.`)
};
// The buttons a copy has, by its state.
const buttons = (it) => {
  const b = [];
  if (['copying', 'checking', 'waiting'].includes(it.state)) b.push(['stop', 'Stop']);
  if (['paused', 'stopped'].includes(it.state) && !it.gone) b.push(['resume', 'Carry on']);
  if (['paused', 'stopped', 'failed'].includes(it.state)) b.push(['forget', 'Throw the half copy away']);
  return b.map(([k, label]) => `<button type="button" class="${k === 'stop' ? 'link' : ''}" data-netfile-${k}="${esc(it.id)}">${label}</button>`).join(' ');
};
const lineHtml = (it) => `<span role="status">${(SAY[it.state] || (() => ''))(it)}</span>${speedLine(it) ? `<span class="net-file-speed muted">${speedLine(it)}</span>` : ''}<progress class="net-file-bar" max="100" value="${pct(it)}" aria-label="How much is copied"></progress><div class="row">${buttons(it)}</div>`;

// The chat side. ctx: { add, scrollDown, note }. Returns true when the event was one of these.
export function netFileEvent(ev, { add, scrollDown, note }) {
  const cardOf = (id) => document.querySelector(`[data-netfile-card="${CSS.escape(String(id || ''))}"]`);
  if (ev.type === 'net-file-ask') { // another of your Bobs offers a file or a brain. Nothing is copied until Yes is pressed.
    if (cardOf(ev.id)) return true;
    const what = ev.kind === 'brain' ? `the brain <strong>${esc(ev.title)}</strong>` : `<strong>${esc(ev.title)}</strong>`;
    const room = ev.room >= 0 ? (ev.room < 10e9 ? ` <strong>There isn't room</strong>: I keep 10 GB free on the drive, and after this it would have ${size(Math.max(0, ev.room))}.` : ` The drive keeps ${size(ev.room)} free after it.`) : '';
    const files = ev.files?.length > 1 ? ` (${ev.files.map((f) => `${esc(f.name)}, ${size(f.bytes)}`).join('; ')})` : '';
    const where = ev.kind === 'brain' ? 'It goes with my other brains, with its card and picture reader if it has them.' : 'It goes in the From my other Bobs folder in my home folder.';
    const el = add('setup-offer net-file-card', `<strong>📦 ${esc(ev.from)} wants to send you ${what}</strong><span>${size(ev.total)}${files}. ${where} Nothing is ever written over.${room}</span><div class="row"><button type="button" class="get">Yes, copy it</button><button type="button" class="link">No</button></div>`);
    el.dataset.netfileCard = ev.id;
    const [yes, no] = el.querySelectorAll('button');
    const answer = async (ok) => {
      yes.disabled = no.disabled = true;
      try { const r = await api('/api/net-files/answer', { id: ev.id, yes: ok }); if (!ok) el.remove(); else if (!r.ok) { yes.disabled = no.disabled = false; note(r.why || 'That card is too old now.', 'error'); } }
      catch (e) { yes.disabled = no.disabled = false; note(e.message, 'error'); }
    };
    yes.onclick = () => answer(true);
    no.onclick = () => answer(false);
    scrollDown();
    return true;
  }
  if (ev.type === 'net-file-gone') { const el = cardOf(ev.id); if (el && el.querySelector('button.get')) el.remove(); return true; }
  if (ev.type === 'net-file') { // how a copy is going, on its card
    let el = cardOf(ev.id);
    if (!el) { el = add('setup-offer net-file-card', ''); el.dataset.netfileCard = ev.id; }
    el.innerHTML = `<strong>📦 ${esc(ev.kind === 'brain' ? 'Brain Copying' : 'File')} from ${esc(ev.from)}: ${esc(ev.title)}</strong>${lineHtml(ev)}`;
    window.dispatchEvent(new CustomEvent('bob-net-file', { detail: ev }));
    return true;
  }
  return false;
}

// Stop, Carry on and Throw away, wherever their buttons are (the chat card or Settings).
export function wireNetFileButtons(root, after = () => {}) {
  root.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-netfile-stop],[data-netfile-resume],[data-netfile-forget],[data-netfile-unsend]');
    if (!t) return;
    t.disabled = true;
    try {
      if (t.dataset.netfileStop) await api('/api/net-files/stop', { id: t.dataset.netfileStop });
      else if (t.dataset.netfileUnsend) await api('/api/net-files/stop', { id: t.dataset.netfileUnsend, side: 'out' });
      else if (t.dataset.netfileResume) await api('/api/net-files/resume', { id: t.dataset.netfileResume });
      else { await api('/api/net-files/forget', { id: t.dataset.netfileForget }); t.closest('[data-netfile-card]')?.remove(); }
    } catch (err) { t.disabled = false; t.insertAdjacentHTML('afterend', ` <span class="refused">${esc(err.message)}</span>`); return; }
    after();
  });
}

// Settings, Bob-Net, Files and brains.
export function netFilesHtml() { return '<div class="net-files-box"><p class="muted">Loading…</p></div>'; }
export async function mountNetFiles(box) {
  if (!box) return;
  let v = null, msg = '', picked = '', busy = false;
  const bobSel = (k) => `<select data-netfile-to="${k}" aria-label="Which Bob">${v.bobs.map((b) => `<option value="${esc(b.address)}">${esc(b.name || b.address)}</option>`).join('')}</select>`;
  const draw = () => {
    if (!v) return;
    if (!v.on) { box.innerHTML = '<p class="muted">Turn on <strong>Files and brains</strong> above to send files and brains to your other Bobs, and take theirs.</p>'; return; }
    if (!v.bobs.length) { box.innerHTML = '<p class="muted">Pair one of your other Bobs first (Pair Bobs, above). He needs Files and brains on too.</p>'; return; }
    const ins = v.inbox.map((it) => `<li data-netfile-card="${esc(it.id)}"><strong>${esc(it.title)}</strong> <span class="muted">from ${esc(it.from)}</span><br>${lineHtml(it)}</li>`).join('');
    const outs = v.outbox.map((o) => `<li><strong>${esc(o.title)}</strong> <span class="muted">to ${esc(o.to)}, ${size(o.total)}: ${o.state === 'offered' ? 'waiting for his Yes' : o.state === 'paused' ? `paused at ${Math.floor((100 * o.sent) / o.total)}%` : `${Math.floor((100 * o.sent) / o.total)}% sent`}</span> <button type="button" class="link" data-netfile-unsend="${esc(o.id)}">Stop sending</button></li>`).join('');
    box.innerHTML = `<div><strong>Send a file</strong><div class="row"><button type="button" data-netfile-pick ${busy ? 'disabled' : ''}>Pick a file</button> <span class="muted">${picked ? esc(picked) : 'Any file. A .gguf goes as a brain.'}</span></div>
      <div class="row">${bobSel('file')} <button type="button" data-netfile-send ${picked && !busy ? '' : 'disabled'}>Send it</button></div></div>
      <div><strong>Brain Copying</strong><p class="muted">Copy one of my brains to another Bob. It lands with his other brains, card and picture reader too.</p>
      ${v.brains.length ? `<div class="row"><select data-netfile-brain aria-label="Which brain">${v.brains.map((b) => `<option value="${esc(b.id)}">${esc(b.name)} (${size(b.bytes)})</option>`).join('')}</select> ${bobSel('brain')} <button type="button" data-netfile-copy ${busy ? 'disabled' : ''}>Copy it</button></div>` : '<p class="muted">No brain on this replicant matrix yet. A brain file that isn\'t on my list can still go with Pick a file.</p>'}</div>
      ${msg ? `<p role="status">${esc(msg)}</p>` : ''}
      ${outs ? `<h5>Going out</h5><ul class="share-list">${outs}</ul>` : ''}
      ${ins ? `<h5>Coming in</h5><ul class="share-list">${ins}</ul>` : ''}`;
  };
  const refresh = async () => { try { v = await api('/api/net-files'); } catch (e) { box.innerHTML = `<p class="refused">${esc(e.message)}</p>`; return; } draw(); };
  const send = async (data) => {
    busy = true; msg = 'Asking…'; draw();
    try { const r = await api('/api/net-files/send', data); msg = `Offered to ${r.to}. It starts when someone presses Yes on his screen.`; picked = ''; }
    catch (e) { msg = e.message; }
    busy = false; await refresh();
  };
  box.addEventListener('click', async (e) => {
    if (e.target.closest('[data-netfile-pick]')) { try { const r = await api('/api/net-files/pick', {}); if (r.error) msg = r.error; else if (r.file) picked = r.file; } catch (err) { msg = err.message; } draw(); return; }
    if (e.target.closest('[data-netfile-send]')) return send({ file: picked, address: box.querySelector('[data-netfile-to="file"]').value });
    if (e.target.closest('[data-netfile-copy]')) return send({ brain: box.querySelector('[data-netfile-brain]').value, address: box.querySelector('[data-netfile-to="brain"]').value });
  });
  wireNetFileButtons(box, refresh);
  window.addEventListener('bob-net-file', () => { if (box.isConnected) refresh(); });
  window.addEventListener('bob-net-files-switch', () => { if (box.isConnected) refresh(); });
  await refresh();
}
