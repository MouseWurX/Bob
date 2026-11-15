// 15 Nov 2026 The Forge console (Lab > Forge): one window, two readouts. The server side (a brain loaded here or a rented
// card, and the relay's record of every request sent and reply returned) and the model and tools side. Each side
// takes typed input, either can be made bigger, and the window keeps its own text across the Lab's redraws: the Lab
// page never redraws it, the console fills its readouts itself, a piece at a time.
import { esc } from './rich.js';
import { tip } from './tips.js';

const SIZES = ['even', 'server', 'work'];
// The page can hold more than one Lab (the chat's box and its own window), so the console's listeners are put on the
// document once, and each goes to the console drawn last.
let active = null;
for (const type of ['submit', 'input', 'keydown', 'change', 'click']) document.addEventListener(type, (e) => active?.[type]?.(e));
document.addEventListener('scroll', (e) => active?.scroll?.(e), true);
const prettyJson = (t) => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return String(t || ''); } };
const store = { get: (k, d) => { try { return localStorage.getItem(`bob-lc-${k}`) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(`bob-lc-${k}`, v); } catch {} } };

export function createConsole({ api }) {
  let v = null, since = 0, err = '', timer = null, busy = false, heldShown = '', stopAsk = false;
  const entries = [];
  const ui = {
    size: SIZES.includes(store.get('size', 'even')) ? store.get('size', 'even') : 'even',
    height: Math.min(1400, Math.max(260, Number(store.get('height', 520)) || 520)),
    server: store.get('server', 'both'), work: store.get('work', 'both'), to: store.get('to', 'tool'),
    drafts: { server: '', work: '' }, hist: { server: -1, work: -1 }, follow: { server: true, work: true }, addOpen: false, add: { label: '', side: 'tool', line: '' }
  };
  const $ = (id) => document.getElementById(id);
  const shows = (pane, e) => (pane === 'server'
    ? (e.ch === 'server' && ui.server !== 'traffic') || (e.ch === 'traffic' && ui.server !== 'log')
    : (e.ch === 'model' && ui.work !== 'tool') || (e.ch === 'tool' && ui.work !== 'model'));
  const span = (e) => { const s = document.createElement('span'); s.className = `lc-${e.ch}${e.kind ? ` lc-k-${e.kind}` : ''}`; s.textContent = e.text + (e.nl ? '\n' : ''); return s; };

  function fill(pane, list = entries, reset = true) {
    const pre = $(`lc-out-${pane}`); if (!pre) return;
    const atEnd = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24;
    if (reset) pre.textContent = '';
    const frag = document.createDocumentFragment();
    for (const e of list) if (shows(pane, e)) frag.appendChild(span(e));
    pre.appendChild(frag);
    while (pre.childNodes.length > 6000) pre.removeChild(pre.firstChild);
    if (reset || (ui.follow[pane] && atEnd) || ui.follow[pane] === 'jump') { pre.scrollTop = pre.scrollHeight; if (ui.follow[pane] === 'jump') ui.follow[pane] = true; }
  }

  const chips = (name, label, now, opts, shown = '') => `${shown ? `<span class="muted" aria-hidden="true">${esc(shown)}</span>` : ''}<span class="lc-chips" role="radiogroup" aria-label="${esc(label)}">${opts.map(([val, l]) => `<button type="button" class="lab-chip${now === val ? ' on' : ''}" role="radio" aria-checked="${now === val}" data-lcchip="${name}" value="${val}">${esc(l)}</button>`).join('')}</span>`;
  const sizeBtn = (pane) => `<button type="button" class="link" data-lcsize="${ui.size === pane ? 'even' : pane}" aria-pressed="${ui.size === pane}">${ui.size === pane ? 'Show both' : 'Show more'}</button>`;

  function headHtml() {
    if (!v) return '<p class="muted">Loading the console…</p>';
    const s = v.server, state = s.state === 'up' ? `${esc(s.brain)} on the ${esc(s.where)}` : s.state === 'loading' ? `Loading ${esc(s.brain)}…` : v.target ? esc(v.target) : 'No server';
    return `<span>Server: <strong>${state}</strong></span> <span>· ${v.job ? `Running <strong>${esc(v.job.label)}</strong>` : 'No command running'}</span>${v.replying ? ' <span>· The model is answering</span>' : ''}${v.rental ? ` <span>· Forge run <strong>${esc(v.rental.plan)}</strong> on a rented card</span>` : ''}${v.hold ? ' <span class="lc-holding">· Holding requests</span>' : ''}`;
  }
  function heldHtml() {
    const p = v?.pending?.[0]; if (!p) return '';
    return `<div class="lc-held" role="alert" aria-labelledby="lc-held-h"><strong id="lc-held-h">Request #${p.id} is held: ${esc(p.method)} ${esc(p.url)}</strong>${v.pending.length > 1 ? ` <span class="muted">(${v.pending.length - 1} more waiting)</span>` : ''}
      <div class="row"><button type="button" class="get" data-lcdecide="${p.id}" value="send">Send</button><button type="button" class="link" data-lcdecide="${p.id}" value="drop">Drop it</button> <label for="lc-held-body" class="muted">Fix it below if it's wrong, then Send. The tool waits meanwhile.</label></div>
      <textarea id="lc-held-body" rows="4" spellcheck="false">${esc(prettyJson(p.body))}</textarea></div>`;
  }
  function buttonsHtml() {
    const list = v?.buttons || [], dis = v?.allowed && v.local ? '' : 'disabled';
    const add = ui.add;
    return `<div class="lc-buttons" role="group" aria-label="Your buttons">${list.map((b, i) => `<span class="lc-btn"><button type="button" class="lab-chip" data-lcpress="${i}" title="${esc(`${b.side}: ${b.line}`)}" ${dis}>${esc(b.label)}</button><button type="button" class="link" data-lcedit="${i}" aria-label="Edit ${esc(b.label)} before running it">Edit</button><button type="button" class="link" data-lcrm="${i}" aria-label="Remove the button ${esc(b.label)}">✕</button></span>`).join('')}
      <button type="button" class="link" data-lcaddopen aria-expanded="${ui.addOpen}" ${v?.local ? '' : 'disabled'}>${list.length ? 'Add a button' : 'Add a button for a command you run often'}</button></div>
      ${ui.addOpen ? `<div class="lc-add row"><label>Name <input id="lc-add-label" maxlength="30" value="${esc(add.label)}" placeholder="Tool check"></label>
        <label>Side <select id="lc-add-side">${[['tool', 'Tool'], ['model', 'Model'], ['server', 'Server']].map(([x, l]) => `<option value="${x}" ${add.side === x ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="lc-add-line">Command <input id="lc-add-line" maxlength="1000" spellcheck="false" value="${esc(add.line)}" placeholder="node tool-pick.mjs --url {url}"></label>
        <button type="button" class="get" data-lcadd>Add it</button></div>` : ''}`;
  }
  function paneHtml(pane) {
    const server = pane === 'server', canType = v?.local !== false;
    const title = server ? 'Server' : 'Model and tools';
    const show = server ? chips('server', 'Server side shows', ui.server, [['log', 'Server log'], ['traffic', 'Requests and replies'], ['both', 'Both']], 'Show') + tip('Server log: what the server itself prints. Requests and replies: everything sent to it and everything it sent back, through the Lab\'s relay. In the Glossary: Relay (Lab console).', 'Requests and replies') : chips('work', 'Model and tools side shows', ui.work, [['model', 'Model'], ['tool', 'Tool'], ['both', 'Both']], 'Show');
    const stop = server
      ? `${v?.server?.state !== 'off' ? `<button type="button" class="link" data-lcstop="server">${v?.server?.state === 'loading' ? 'Stop loading' : 'Unload'}</button>` : ''}${v?.rental ? '<button type="button" class="link" data-lcrental>Stop the rented run…</button>' : ''}
        <label class="lc-hold"><input type="checkbox" id="lc-hold" ${v?.hold ? 'checked' : ''} ${v?.allowed && canType ? '' : 'disabled'}> Hold each request</label> ${tip('Each request a tool sends to the server waits here first. Read it, fix it, then Send it or Drop it. In the Glossary: Hold each request.', 'Hold each request')}`
      : `${chips('to', 'What you type goes to', ui.to, [['tool', 'Tool'], ['model', 'Model']], 'Type to')}${v?.job || v?.replying ? `<button type="button" class="get lc-stop" data-lcstop="${v?.job ? 'tool' : 'model'}">Stop</button>` : ''}`;
    const prompt = server ? 'server>' : ui.to === 'model' ? 'model>' : v?.job ? 'input>' : 'tool>';
    const hint = server ? 'help · load <brain> · health · target <link>' : ui.to === 'model' ? 'Type to the brain · /help' : v?.job ? 'Goes to the running command · stop' : 'help · node <script.mjs> · forge --status';
    return `<section class="lc-pane" id="lc-pane-${pane}" aria-labelledby="lc-t-${pane}">
      <div class="lc-bar"><h4 id="lc-t-${pane}">${title}</h4>${show}${stop}<span class="lc-bar-end"><button type="button" class="link" data-lccopy="${pane}">Copy</button>${sizeBtn(pane)}</span></div>
      <pre class="lc-out" id="lc-out-${pane}" tabindex="0" role="log" aria-live="off" aria-label="${title} readout"></pre>
      ${server ? `<div id="lc-held-box">${heldHtml()}</div>` : ''}
      <form class="lc-in" data-lcform="${pane}"><label class="lc-prompt" for="lc-in-${pane}"><span aria-hidden="true">${prompt}</span><span class="sr-only">${server ? 'Server command' : ui.to === 'model' ? 'To the model' : 'Tool command'}</span></label>
        <input id="lc-in-${pane}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2000" value="${esc(ui.drafts[pane])}" placeholder="${esc(hint)}" ${canType ? '' : 'disabled'}><button type="submit" class="link" ${canType ? '' : 'disabled'}>Send</button></form>
    </section>`;
  }
  function html() {
    if (!v) { load(); }
    const local = v?.local !== false;
    return `<section class="lab-compare lc" id="lab-console" aria-labelledby="lc-h">
      <div class="lc-top"><h3 id="lc-h">Console</h3><span class="muted lc-state" id="lc-state" role="status">${headHtml()}</span>
        <span class="lc-bar-end"><button type="button" class="link" data-lcheight="-160" aria-label="Make the console shorter">Shorter</button><button type="button" class="link" data-lcheight="160" aria-label="Make the console taller">Taller</button><button type="button" class="link" data-lcclear>Clear the view</button></span></div>
      ${local ? `<label class="lab-opt"><input type="checkbox" id="lc-allow" ${v?.allowed ? 'checked' : ''}> <span><strong>Let the Lab run commands here</strong><br><span class="muted">Scripts from the model-lab folder, a brain loaded here, and requests to it. It never rents a card: that's the purchase card's job.</span></span></label>` : '<p class="muted">You can watch from this device. Commands only run on the computer Bob runs on.</p>'}
      ${buttonsHtml()}
      <div class="lc-win" id="lc-win" data-size="${ui.size}" style="--lc-h:${ui.height}px">${paneHtml('server')}${paneHtml('work')}</div>
      ${stopAsk ? '<div class="setup-offer" role="alert"><strong>Stop the rented run and delete its card for good?</strong><span>Whatever has already come home stays. Anything still on the card is lost.</span><div class="row"><button type="button" class="get" data-lcrentalgo>Stop and delete it</button><button type="button" class="link" data-lcrentalno>Keep it running</button></div></div>' : ''}
      ${err ? `<p class="error" role="alert">${esc(err)}</p>` : ''}
    </section>`;
  }
  // After the Lab draws the Forge tab: the readouts are filled again from what the page already has.
  function mounted() {
    if (!$('lab-console')) return;
    active = on;
    fill('server'); fill('work');
    if (!timer) tick();
  }
  function redraw(focusId = document.activeElement?.id) {
    const box = $('lab-console'); if (!box) return;
    const sel = focusId && $(focusId) && 'selectionStart' in $(focusId) ? [$(focusId).selectionStart, $(focusId).selectionEnd] : null;
    box.outerHTML = html(); mounted(); heldShown = String(v?.pending?.[0]?.id || '');
    const f = focusId && $(focusId); if (f) { f.focus(); if (sel && f.setSelectionRange) try { f.setSelectionRange(...sel); } catch {} }
  }
  // What changed since the last look: new lines are added, the top line and the held request are drawn again.
  async function load() {
    if (busy) return; busy = true;
    try {
      const j = await api(`/api/lab/console?since=${since}`);
      const shape = (x) => JSON.stringify([x?.allowed, x?.local, x?.server?.state, Boolean(x?.job), x?.replying, Boolean(x?.rental), x?.hold, x?.buttons]);
      const changed = !v || shape(v) !== shape(j);
      if (j.first > since + 1 && since) { entries.length = 0; } // the view was cleared, or the record moved on past what's here
      const fresh = j.lines || []; entries.push(...fresh); if (entries.length > 8000) entries.splice(0, entries.length - 8000);
      since = j.next; v = j; err = '';
      if (!$('lab-console') || active !== on) return;
      if (changed) { redraw(); return; }
      $('lc-state').innerHTML = headHtml();
      if (fresh.length) { fill('server', fresh, false); fill('work', fresh, false); }
      const held = String(v.pending?.[0]?.id || '');
      if (held !== heldShown) { heldShown = held; const hb = $('lc-held-box'); if (hb) hb.innerHTML = heldHtml(); }
    } catch (e) { err = e.message; } finally { busy = false; }
  }
  function tick() {
    clearTimeout(timer); timer = null;
    if (!$('lab-console') || active !== on) return; // the Forge tab closed (it starts again when it opens), or another Lab drew it
    load().finally(() => { const quick = v && (v.job || v.replying || v.server?.state === 'loading' || v.rental || v.pending?.length); timer = setTimeout(tick, document.hidden ? 5000 : quick ? 700 : 2500); });
  }
  async function call(p, b) { try { const r = await api(p, b); err = ''; return r; } catch (e) { err = ''; await load(); return null; } }
  async function submit(pane) {
    const inp = $(`lc-in-${pane}`); if (!inp) return;
    const text = inp.value; ui.drafts[pane] = ''; inp.value = ''; ui.hist[pane] = -1; ui.follow[pane] = 'jump';
    const side = pane === 'server' ? 'server' : ui.to === 'model' ? 'model' : 'tool';
    await call('/api/lab/console/send', { side, text });
    await load(); inp.focus();
  }

  // The console listens for itself (the Lab page leaves anything inside it alone), so a redraw never loses a line.
  const on = {};
  on.submit = (e) => { const f = e.target.closest?.('[data-lcform]'); if (!f) return; e.preventDefault(); submit(f.dataset.lcform); };
  on.input = (e) => {
    const t = e.target; if (!t.closest?.('#lab-console')) return;
    if (t.id === 'lc-in-server') ui.drafts.server = t.value; else if (t.id === 'lc-in-work') ui.drafts.work = t.value;
    else if (t.id === 'lc-add-label') ui.add.label = t.value; else if (t.id === 'lc-add-line') ui.add.line = t.value;
  };
  on.keydown = (e) => { // up and down bring back earlier lines, like a terminal
    const t = e.target; if (!['lc-in-server', 'lc-in-work'].includes(t.id) || !['ArrowUp', 'ArrowDown'].includes(e.key)) return;
    const pane = t.id === 'lc-in-server' ? 'server' : 'work', h = v?.history?.[pane === 'server' ? 'server' : ui.to === 'model' ? 'model' : 'tool'] || [];
    if (!h.length) return; e.preventDefault();
    let i = ui.hist[pane] < 0 ? h.length : ui.hist[pane]; i = e.key === 'ArrowUp' ? Math.max(0, i - 1) : i + 1;
    if (i >= h.length) { ui.hist[pane] = -1; t.value = ''; } else { ui.hist[pane] = i; t.value = h[i]; }
    ui.drafts[pane] = t.value;
  };
  on.change = async (e) => {
    const t = e.target; if (!t.closest?.('#lab-console')) return;
    if (t.id === 'lc-allow') { await call('/api/lab/console/allow', { on: t.checked }); await load(); return; }
    if (t.id === 'lc-hold') { await call('/api/lab/console/hold', { on: t.checked }); await load(); return; }
    if (t.id === 'lc-add-side') ui.add.side = t.value;
  };
  on.scroll = (e) => { const t = e.target; if (t.id === 'lc-out-server' || t.id === 'lc-out-work') ui.follow[t.id.slice(7)] = t.scrollHeight - t.scrollTop - t.clientHeight < 24; };
  on.click = async (e) => {
    const b = e.target.closest?.('#lab-console button'); if (!b) return;
    const d = b.dataset;
    if (d.lcchip) { ui[d.lcchip] = b.value; store.set(d.lcchip, b.value); if (d.lcchip === 'to') { redraw(); $('lc-in-work')?.focus(); return; } redraw(b.id || ''); fill('server'); fill('work'); document.querySelector(`[data-lcchip="${d.lcchip}"][value="${CSS.escape(b.value)}"]`)?.focus(); return; }
    if (d.lcsize) { ui.size = d.lcsize; store.set('size', ui.size); const w = $('lc-win'); if (w) w.dataset.size = ui.size; redraw(); document.querySelector(`#lc-pane-${d.lcsize === 'even' ? (b.closest('.lc-pane')?.id.slice(8) || 'server') : d.lcsize} [data-lcsize]`)?.focus(); return; }
    if (d.lcheight) { ui.height = Math.min(1400, Math.max(260, ui.height + Number(d.lcheight))); store.set('height', ui.height); $('lc-win')?.style.setProperty('--lc-h', `${ui.height}px`); return; }
    if ('lcclear' in d) { entries.length = 0; fill('server'); fill('work'); await call('/api/lab/console/clear', {}); return; }
    if (d.lccopy) { const t = $(`lc-out-${d.lccopy}`)?.textContent || ''; try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } catch { const r = document.createRange(); r.selectNodeContents($(`lc-out-${d.lccopy}`)); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } return; }
    if (d.lcstop) { await call('/api/lab/console/stop', { what: d.lcstop }); await load(); return; }
    if (d.lcdecide) { await call('/api/lab/console/decide', { id: Number(d.lcdecide), send: b.value === 'send', body: $('lc-held-body')?.value }); await load(); $('lc-in-server')?.focus(); return; }
    if ('lcrental' in d) { stopAsk = true; redraw(); document.querySelector('[data-lcrentalno]')?.focus(); return; }
    if ('lcrentalno' in d) { stopAsk = false; redraw(); return; }
    if ('lcrentalgo' in d) { stopAsk = false; try { await api('/api/lab/forge/stop', {}); } catch (x) { err = x.message; } await load(); redraw(); return; }
    if (d.lcpress !== undefined) { ui.follow.server = ui.follow.work = 'jump'; await call('/api/lab/console/button', { press: Number(d.lcpress) }); await load(); return; }
    if (d.lcedit !== undefined) { // put the button's command in its side's box, to change before running
      const x = v?.buttons?.[Number(d.lcedit)]; if (!x) return;
      const pane = x.side === 'server' ? 'server' : 'work'; if (pane === 'work') { ui.to = x.side; store.set('to', x.side); }
      ui.drafts[pane] = x.line; redraw(); $(`lc-in-${pane}`)?.focus(); return;
    }
    if (d.lcrm !== undefined) { await call('/api/lab/console/button', { remove: Number(d.lcrm) }); await load(); return; }
    if ('lcaddopen' in d) { ui.addOpen = !ui.addOpen; redraw(); $(ui.addOpen ? 'lc-add-label' : '')?.focus(); return; }
    if ('lcadd' in d) { try { await api('/api/lab/console/button', { add: { ...ui.add } }); ui.add = { label: '', side: 'tool', line: '' }; ui.addOpen = false; err = ''; } catch (x) { err = x.message; } await load(); redraw(); return; }
  };

  return { html, mounted };
}
