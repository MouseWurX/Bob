// 15 Nov 2026 The Forge console (Lab > Forge). One window, two sides, and three panels to put on either side:
// Server (a terminal: what the server prints, every request and reply through the Lab's relay, what scripts print, and
// commands), Chat (talk to the loaded brain) and Set up (how it answers, and Lab jobs to run with it). The owner's asks:
// server on the left, chat or set up on the right, any panel on any side, or just one; configurable and easy to use.
// Above the window: LOAD MODEL LOCALLY and OPEN RENTAL (each opens a window to set it up), STOP (stops what runs
// here, never a rental) and END RENTAL (only while a rental is up: deletes only that run's card).
import { esc } from './rich.js';
import { tip } from './tips.js';
import { JOBS, GROUPS, LAB_PAGES, fieldDefault, brainsOf } from './lab-console-jobs.js'; // the whole Lab as forms

const PANELS = [['server', 'Server'], ['chat', 'Chat'], ['setup', 'Set up']];
const SIZES = [['even', 'Side by side'], ['left', 'Left wider'], ['right', 'Right wider'], ['leftonly', 'Left only'], ['rightonly', 'Right only']];
// The page can hold more than one Lab (the chat's box and its own window), so the console's listeners are put on the
// document once, and each goes to the console drawn last.
let active = null;
for (const type of ['submit', 'input', 'keydown', 'change', 'click']) document.addEventListener(type, (e) => active?.[type]?.(e));
document.addEventListener('scroll', (e) => active?.scroll?.(e), true);
document.addEventListener('toggle', (e) => active?.toggle?.(e), true);
const prettyJson = (t) => { try { return JSON.stringify(JSON.parse(t), null, 2); } catch { return String(t || ''); } };
const store = { get: (k, d) => { try { return localStorage.getItem(`bob-lc-${k}`) ?? d; } catch { return d; } }, set: (k, v) => { try { localStorage.setItem(`bob-lc-${k}`, v); } catch {} } };
const inside = (t) => Boolean(t?.closest?.('#lab-console, #lc-dialog'));

// Set up's dials: [key, label, min, max, step, plain words for the (i)]
const DIALS = [
  ['temperature', 'Temperature', 0, 2, 0.05, 'How adventurous each word is. Low: the same careful answer each time. High: more varied, more mistakes.'],
  ['top_p', 'Top P', 0, 1, 0.01, 'Only words from the most likely share are picked. 0.95 leaves out the long tail of unlikely words.'],
  ['top_k', 'Top K', 0, 200, 1, 'Only this many of the likeliest words are picked from. 0 means no limit.'],
  ['min_p', 'Min P', 0, 1, 0.01, 'A word must be at least this likely, compared with the best one, to be picked.'],
  ['repeat_penalty', 'Repeat penalty', 1, 2, 0.01, 'Above 1, it avoids saying the same words again. 1 is off.'],
  ['max_tokens', 'Longest reply', 16, 32768, 16, 'The most tokens one reply may be. A token is about three quarters of a word.']
];
const TICKS = [
  ['think', 'Let it think first', 'For brains that can think before they answer. Its thinking shows folded above the answer.'],
  ['showThink', 'Show its thinking', 'Off: the thinking still happens, it just isn\'t shown.'],
  ['stream', 'Show the answer as it comes', 'Off: the answer shows all at once, when it\'s done.'],
  ['toolReplies', 'Show replies to tools in the Chat', 'When a script or tool asks the brain, its reply shows in the Chat too, marked "to a tool".']
];
export const DEFAULT_SETUP = { temperature: 0.7, top_p: 0.95, top_k: 40, min_p: 0.05, repeat_penalty: 1, max_tokens: 2048, seed: -1, think: false, showThink: true, stream: true, toolReplies: true, tools: 'none', system: '' };
export function createConsole({ api }) {
  let v = null, since = 0, err = '', timer = null, busy = false, heldShown = '', ask = '', talkRev = -1, talk = [];
  let choices = null, L = null, lLoading = false, dlgKind = '', dlgMsg = '', card = null, setupDraft = null, setupTimer = null;
  let rentals = null, rentMsg = '', rentAsk = null, pb = { name: '', steps: [], set: '' }, pbMsg = '';
  const pipeMsg = {};
  let jobOpen = store.get('job', '');
  const jobMsg = {}, entries = [];
  const pick = (k, d, ok) => { const x = store.get(k, d); return ok.includes(x) ? x : d; };
  const ui = {
    left: pick('left', 'server', PANELS.map((p) => p[0])), right: pick('right', 'chat', PANELS.map((p) => p[0])),
    size: pick('size2', 'even', SIZES.map((s) => s[0])),
    height: Math.min(1400, Math.max(300, Number(store.get('height', 560)) || 560)),
    f: { server: store.get('f-server', '1') === '1', traffic: store.get('f-traffic', '1') === '1', scripts: store.get('f-scripts', '1') === '1' },
    drafts: { server: '', chat: '' }, hist: { server: -1 }, follow: { server: true, chat: true },
    local: { brain: '', engine: '', ctx: 8192, unload: false, cpuOk: true },
    rent: { kind: 'brain', brain: '', other: '', engine: '', cards: null, ctx: 32768, slots: 1, disk: 80, plan: '', hours: '', dollars: '' },
    add: { label: '', side: 'server', line: '' }, job: {}
  };
  if (ui.left === ui.right) ui.right = ui.left === 'server' ? 'chat' : 'server';
  const $ = (id) => document.getElementById(id);
  const shown = (p) => (ui.size === 'leftonly' ? ui.left === p : ui.size === 'rightonly' ? ui.right === p : ui.left === p || ui.right === p);
  const shows = (e) => (e.ch === 'server' ? ui.f.server : e.ch === 'traffic' ? ui.f.traffic : ui.f.scripts);
  const span = (e) => { const s = document.createElement('span'); s.className = `lc-${e.ch}${e.kind ? ` lc-k-${e.kind}` : ''}`; s.textContent = e.text + (e.nl ? '\n' : ''); return s; };
  const can = () => Boolean(v?.allowed && v.local);
  const list = (xs, cls) => (xs?.length ? `<ul class="${cls}">${xs.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : '');

  // ---- the Server panel: a terminal ----
  function fill(more = entries, reset = true) {
    const pre = $('lc-out'); if (!pre) return;
    const atEnd = pre.scrollHeight - pre.scrollTop - pre.clientHeight < 24;
    if (reset) pre.textContent = '';
    const frag = document.createDocumentFragment();
    for (const e of more) if (shows(e)) frag.appendChild(span(e));
    pre.appendChild(frag);
    while (pre.childNodes.length > 6000) pre.removeChild(pre.firstChild);
    if (reset || (ui.follow.server && atEnd) || ui.follow.server === 'jump') { pre.scrollTop = pre.scrollHeight; if (ui.follow.server === 'jump') ui.follow.server = true; }
  }
  const toggleChip = (k, label) => `<button type="button" class="lab-chip${ui.f[k] ? ' on' : ''}" aria-pressed="${ui.f[k]}" data-lcf="${k}">${esc(label)}</button>`;
  function heldHtml() {
    const p = v?.pending?.[0]; if (!p) return '';
    return `<div class="lc-held" role="alert" aria-labelledby="lc-held-h"><strong id="lc-held-h">Request #${p.id} is held: ${esc(p.method)} ${esc(p.url)}</strong>${v.pending.length > 1 ? ` <span class="muted">(${v.pending.length - 1} more waiting)</span>` : ''}
      <div class="row"><button type="button" class="get" data-lcdecide="${p.id}" value="send">Send</button><button type="button" class="link" data-lcdecide="${p.id}" value="drop">Drop it</button> <label for="lc-held-body" class="muted">Fix it below if it's wrong, then Send. The tool waits meanwhile.</label></div>
      <textarea id="lc-held-body" rows="4" spellcheck="false">${esc(prettyJson(p.body))}</textarea></div>`;
  }
  function serverHtml() {
    const typed = v?.local !== false, toJob = v?.job && v.toJob;
    const hint = toJob ? `Goes to ${v.job.label} · stop` : 'help · load <brain> · health · node <script.mjs>';
    return `<div class="lc-bar"><span class="muted" aria-hidden="true">Show</span><span class="lc-chips" role="group" aria-label="What the Server panel shows">${toggleChip('server', 'Server log')}${toggleChip('traffic', 'Requests and replies')}${toggleChip('scripts', 'Scripts')}</span>${tip('Server log: what the server itself prints. Requests and replies: everything sent to it and everything it sent back, through the Lab\'s relay. Scripts: what commands and Lab jobs print. In the Glossary: Relay (Lab console).', 'What the Server panel shows')}
        <label class="lc-tick"><input type="checkbox" id="lc-hold" ${v?.hold ? 'checked' : ''} ${can() ? '' : 'disabled'}> Hold each request</label>${tip('Each request a tool sends to the server waits here first. Read it, fix it, then Send it or Drop it. In the Glossary: Hold each request.', 'Hold each request')}
        <span class="lc-bar-end">${v?.server?.state === 'up' ? '<button type="button" class="link" data-lcunload>Unload</button>' : ''}<button type="button" class="link" data-lccopy>Copy</button></span></div>
      <pre class="lc-out" id="lc-out" tabindex="0" role="log" aria-live="off" aria-label="Server readout"></pre>
      <div id="lc-held-box">${heldHtml()}</div>
      <form class="lc-in" data-lcform="server"><label class="lc-prompt" for="lc-in-server"><span aria-hidden="true">${toJob ? 'input>' : 'server>'}</span><span class="sr-only">${toJob ? 'Type to the running command' : 'Server command'}</span></label>
        <input id="lc-in-server" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="2000" value="${esc(ui.drafts.server)}" placeholder="${esc(hint)}" ${typed ? '' : 'disabled'}><button type="submit" class="link" ${typed ? '' : 'disabled'}>Send</button></form>
      ${v?.job ? `<label class="lc-tick lc-tojob"><input type="checkbox" id="lc-tojob" ${v.toJob ? 'checked' : ''}> What I type goes to the running command</label>` : ''}`;
  }

  // ---- the Chat panel ----
  function turnHtml(t) {
    if (t.who === 'you') return `<div class="lc-msg lc-you"><div class="lc-who">You</div><div class="lc-text">${esc(t.text)}</div></div>`;
    if (t.who === 'error' || t.who === 'note') return `<div class="lc-msg lc-${t.who === 'error' ? 'err' : 'note'}"><div class="lc-text">${esc(t.text)}</div></div>`;
    const name = v?.bob?.on ? v.bob.name || 'Bob\'s brain' : v?.server?.state === 'up' ? v.server.brain : v?.rental?.door || 'The brain';
    const think = t.think && v?.setup?.showThink !== false ? `<details class="lc-think"${t.live && !t.text ? ' open' : ''}><summary>Thinking</summary><div class="lc-text">${esc(t.think)}</div></details>` : '';
    const calls = (t.calls || []).map((c) => `<div class="lc-call"><div><strong>Calls ${esc(c.name || 'a tool')}</strong> <span class="muted">(not run: you answer for it)</span></div><pre>${esc(prettyJson(c.args))}</pre>${c.answer !== undefined ? `<div class="lc-answer"><span class="muted">The tool's answer:</span> ${esc(c.answer)}</div>` : v?.waiting?.includes(c.id) ? '<div class="muted">Type the tool\'s answer below, and it carries on.</div>' : ''}</div>`).join('');
    return `<div class="lc-msg lc-brain"><div class="lc-who">${esc(name)}${t.to ? ` <span class="muted">· to a tool (${esc(t.to)})</span>` : ''}</div>${think}${t.text ? `<div class="lc-text">${esc(t.text)}</div>` : ''}${calls}${t.live ? '<div class="lc-dots" aria-label="Answering">…</div>' : ''}</div>`;
  }
  function chatLog() {
    if (talk.length) return talk.map(turnHtml).join('');
    if (v?.server?.state === 'up' || v?.target) return '<p class="muted lc-empty">Say something to start. Its dials are in Set up.</p>';
    return `<div class="lc-empty"><p class="muted">No brain is loaded yet. Press <strong>Load model locally</strong> or <strong>Open rental</strong> above${v?.bob?.ready ? `, or use the one Bob has loaded now, ${esc(v.bob.name)}` : ''}.</p>${v?.bob?.ready ? `<button type="button" class="get" data-lcusebob ${can() ? '' : 'disabled'}>Use Bob's brain</button>` : ''}</div>`;
  }
  // fresh: the panel was just drawn, so it goes to the end unless you had scrolled up to read.
  function drawChat(fresh = false) {
    const box = $('lc-chat'); if (!box) return;
    const atEnd = fresh ? ui.follow.chat : box.scrollHeight - box.scrollTop - box.clientHeight < 40;
    box.innerHTML = chatLog();
    if (atEnd || ui.follow.chat === 'jump') { box.scrollTop = box.scrollHeight; ui.follow.chat = true; }
  }
  function chatHtml() {
    const typed = v?.local !== false, wait = v?.waiting?.length;
    const who = v?.bob?.on ? esc(v.target) : v?.server?.state === 'up' ? `${esc(v.server.brain)} on the ${esc(v.server.where)}` : v?.server?.state === 'loading' ? `Loading ${esc(v.server.brain)}…` : v?.target ? esc(v.target) : 'No brain yet';
    return `<div class="lc-bar"><span>${who}</span><span class="lc-bar-end">${v?.replying ? '<button type="button" class="get lc-stop" data-lcstopreply>Stop the reply</button>' : ''}${v?.bob?.on ? '<button type="button" class="link" data-lcbobstop>Stop using Bob\'s brain</button>' : ''}<button type="button" class="link" data-lcnewchat>New chat</button></span></div>
      <div class="lc-chat" id="lc-chat" tabindex="0" role="log" aria-live="polite" aria-label="Chat">${chatLog()}</div>
      <form class="lc-in lc-chat-in" data-lcform="chat"><label class="sr-only" for="lc-in-chat">${wait ? 'The tool\'s answer' : 'Your message'}</label>
        <textarea id="lc-in-chat" rows="2" maxlength="20000" placeholder="${wait ? 'The tool\'s answer (what it would give back)' : 'Message the brain · Enter sends, Shift+Enter for a new line'}" ${typed ? '' : 'disabled'}>${esc(ui.drafts.chat)}</textarea>
        <button type="submit" class="get" ${typed && !v?.replying ? '' : 'disabled'}>${wait ? 'Answer' : 'Send'}</button></form>`;
  }

  // ---- the Set up panel ----
  const sv = () => setupDraft || v?.setup || DEFAULT_SETUP;
  function dialHtml([k, label, lo, hi, step, plain]) {
    const x = sv()[k] ?? lo, id = `lc-d-${k}`;
    return `<div class="lc-dial"><label for="${id}">${esc(label)}</label>${tip(esc(plain), label)}<input type="range" id="${id}" data-lcdial="${k}" min="${lo}" max="${hi}" step="${step}" value="${x}"><input type="number" class="lc-num" data-lcdial="${k}" min="${lo}" max="${hi}" step="${step}" value="${x}" aria-label="${esc(label)}, exact"></div>`;
  }
  const optsOf = (fd) => (typeof fd.o === 'function' ? fd.o(L || {}) : fd.o) || [];
  function jobVal(job, fd) { const x = ui.job[job.id]?.[fd.k]; return x !== undefined ? x : fd.type === 'url' ? (v?.relay || '') : fieldDefault(fd, L || {}); }
  function fieldHtml(job, fd) {
    const id = `lc-j-${job.id}-${fd.k}`, val = jobVal(job, fd), at = `data-lcjob="${job.id}" data-k="${fd.k}"`, info = fd.plain ? tip(esc(fd.plain), fd.label) : '';
    const lab = `<span class="lc-lab"><label for="${id}">${esc(fd.label)}</label>${info}</span>`;
    const sel = (opts, first = '') => `${lab}<select id="${id}" ${at}>${first}${opts.map(([x, l]) => `<option value="${esc(x)}" ${String(val) === String(x) ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>`;
    if (fd.type === 'set') { const sets = L?.lab?.lessonSets; return sel((sets || []).map((x) => [x.id, `${x.name} (${x.count})`]), `<option value="">${!sets ? 'Loading…' : fd.o?.none ? esc(fd.o.none) : sets.length ? 'Pick a set' : 'No lesson sets yet'}</option>`); }
    if (fd.type === 'brain') { const bs = L ? brainsOf(L, fd.o || '') : null; return sel((bs || []).map((x) => [x.id, `${x.name}${x.facts ? ` · ${x.facts.fileType}, ${x.facts.sizeGB} GB` : ''}`]), `<option value="">${!bs ? 'Loading…' : bs.length ? 'Pick a brain' : fd.o === 'full' ? 'No full-size brains here yet' : 'No brains here yet'}</option>`); }
    if (fd.type === 'select') return sel(optsOf(fd));
    if (fd.type === 'ticks') { const o = optsOf(fd), on = new Set(Array.isArray(val) ? val : []); return `<fieldset class="lc-ticks-f"><legend><span class="lc-lab">${esc(fd.label)}${info}</span></legend>${o.length ? `<div class="lc-cards">${o.map(([x, l], i) => `<label class="lc-tick"><input type="checkbox" id="${id}-${i}" ${at} data-multi value="${esc(x)}" ${on.has(x) ? 'checked' : ''}> ${esc(l)}</label>`).join('')}</div>` : `<span class="muted">${L ? 'None here yet.' : 'Loading…'}</span>`}</fieldset>`; }
    if (fd.type === 'tick') return `<span class="lc-lab"><label class="lc-tick"><input type="checkbox" id="${id}" ${at} ${val ? 'checked' : ''}> ${esc(fd.label)}</label>${info}</span>`;
    if (fd.type === 'range') { const [lo, hi, st] = fd.o; return `<span class="lc-lab"><label for="${id}">${esc(fd.label)}: <output>${esc(val)}</output></label>${info}</span><input type="range" id="${id}" ${at} min="${lo}" max="${hi}" step="${st}" value="${esc(val)}">`; }
    if (fd.type === 'number') { const [lo, hi, st] = fd.o; return `${lab}<input type="number" class="lc-num" id="${id}" ${at} min="${lo}" max="${hi}" step="${st}" value="${esc(val)}">`; }
    if (fd.type === 'textarea') return `${lab}<textarea id="${id}" ${at} rows="3" spellcheck="false">${esc(val)}</textarea>`;
    return `${lab}<input id="${id}" ${at} spellcheck="false" maxlength="400" value="${esc(val)}">`;
  }
  function jobHtml(j) {
    const open = jobOpen === j.id, m = jobMsg[j.id], f = open ? jobForm(j) : null;
    const runLabel = j.rented ? 'Save it and show the purchase card' : 'Run it here';
    return `<div class="lc-job"><button type="button" class="lc-job-h" aria-expanded="${open}" data-lcjobopen="${j.id}"><strong>${esc(j.title)}</strong> <span class="muted">${esc(j.what)}</span></button>
      ${open ? `<div class="lc-job-f">${j.fields.filter((fd) => !fd.show || fd.show(f, L || {})).map((fd) => `<div class="lc-field">${fieldHtml(j, fd)}</div>`).join('')}
        <div class="row">${j.check ? `<button type="button" class="link" data-lcjobcheck="${j.id}">Check it</button>` : ''}${j.alt ? `<button type="button" class="link" data-lcjobalt="${j.id}" ${can() ? '' : 'disabled'}>${esc(j.alt.label)}</button>` : ''}<button type="button" class="get" data-lcjobrun="${j.id}" ${(j.rented ? v?.local : can()) ? '' : 'disabled'}>${runLabel}</button></div>
        ${m ? `${list(m.problems, 'error')}${list(m.notes, 'muted')}${m.ok ? `<p role="status">${esc(m.ok)}</p>` : ''}${m.text ? `<details class="lc-plan"><summary>${j.rented ? 'The plan' : 'What it runs'}</summary><pre>${esc(m.text)}</pre></details>` : ''}` : ''}</div>` : ''}</div>`;
  }
  // Pipelines: steps in a row, each started when the one before is done (free ones here; rented ones wait for you).
  function pipesHtml() {
    const P = L?.pipes; if (!P) return `<p class="muted">${L ? 'Pipelines can\'t be read here.' : 'Loading…'}</p>`;
    const rows = P.pipelines?.length ? P.pipelines.map((p) => {
      const pr = p.progress, done = pr.steps.filter((x) => x.state === 'done').length, next = pr.done ? null : pr.steps[pr.next];
      return `<div class="lc-pipe"><strong>${esc(p.name)}</strong> <span class="muted">${done} of ${pr.steps.length} done, ${esc(pr.state)}${next ? `. Next: ${esc(next.name)}, ${next.on === 'rented' ? 'on a rented card' : 'here'}` : ''}${pr.cost ? `. Cards so far about $${pr.cost}` : ''}</span>
        <div class="row"><button type="button" class="get" data-lcpipego="${esc(p.slug)}" ${can() && !pr.done && !pr.running ? '' : 'disabled'}>${pr.state === 'not started' ? 'Start it' : 'Carry on'}</button>${next ? `<button type="button" class="link" data-lcpipeskip="${esc(p.slug)}" data-step="${pr.next}" ${v?.local ? '' : 'disabled'}>Skip ${esc(next.name)}</button>` : ''}</div>
        ${pipeMsg[p.slug] ? `<p role="status">${esc(pipeMsg[p.slug])}</p>` : ''}</div>`;
    }).join('') : '<p class="muted">No pipelines yet. Make one below.</p>';
    const steps = (L?.steps || []).filter((x) => x.ready !== false && !x.planned);
    const builder = `<div class="lc-pb"><div class="lc-field"><label for="lc-pb-name">Name of a new pipeline</label><input id="lc-pb-name" data-lcpb="name" maxlength="60" value="${esc(pb.name)}"></div>
      <fieldset class="lc-ticks-f"><legend>Its steps, in the protocol's order</legend><div class="lc-cards">${steps.map((x, i) => `<label class="lc-tick"><input type="checkbox" id="lc-pb-s-${i}" data-lcpbstep value="${esc(x.id)}" ${pb.steps.includes(x.id) ? 'checked' : ''}> ${esc(x.name)}${x.where === 'rented' ? ' <span class="muted">(rented)</span>' : ''}</label>`).join('')}</div></fieldset>
      <div class="lc-field"><label for="lc-pb-set">Lessons for the first step that needs them</label><select id="lc-pb-set" data-lcpb="set"><option value="">None</option>${(L?.lab?.lessonSets || []).map((x) => `<option value="${esc(x.id)}" ${pb.set === x.id ? 'selected' : ''}>${esc(x.name)}</option>`).join('')}</select></div>
      <div class="row"><button type="button" class="get" data-lcpbsave ${v?.local ? '' : 'disabled'}>Save the pipeline</button><button type="button" class="link" data-lcpbproto ${v?.local ? '' : 'disabled'}>Save the whole protocol as one</button></div>${pbMsg ? `<p role="status">${esc(pbMsg)}</p>` : ''}</div>`;
    return `<p class="muted">A step that runs here starts by itself when the one before is done. A rented one waits for its purchase card.</p>${rows}${builder}`;
  }
  // Rented cards: every Forge card up on the rental service, to take over or end, one at a time.
  function rentalsHtml() {
    const ago = (ms) => { const m = Math.round((Date.now() - ms) / 60000); return m < 90 ? `${m} min ago` : `${Math.round(m / 60)} h ago`; };
    const ask = rentAsk && rentals?.pods.find((p) => p.pod === rentAsk.pod);
    const rows = rentals ? (rentals.pods.length ? rentals.pods.map((p) => `<div class="lc-pipe"><strong>${esc(p.run || p.pod)}</strong> <span class="muted">${esc(p.gpu || 'a card')}, $${p.perHour} an hour, ${esc(String(p.status).toLowerCase())}${p.started ? `, rented ${ago(p.started)}` : ''}${p.plan ? `. Its plan's caps: ${p.plan.hours} h or $${p.plan.dollars}` : ''}</span>
        ${p.why ? `<p class="muted">${esc(p.why)}</p>` : ''}
        <div class="row">${p.canTake ? `<button type="button" class="get" data-lcrenttake="${esc(p.pod)}" ${can() ? '' : 'disabled'}>Take over</button>` : ''}${p.ours ? '' : `<button type="button" class="lc-endrent lc-small" data-lcrentend="${esc(p.pod)}" ${can() ? '' : 'disabled'}>End it</button>`}</div>
        ${ask === p && rentAsk.kind === 'take' ? `<div class="setup-offer" role="alertdialog" aria-labelledby="lc-ra-h"><strong id="lc-ra-h">Take over ${esc(p.run)}?</strong><span>The Forge watches it from here: its log shows in the Server panel, STOP and END RENTAL work on it, and its caps (${p.plan.hours} h or $${p.plan.dollars}, counted from when it was rented) are watched again. Nothing new is rented.</span><div class="row"><button type="button" class="get" data-lcrenttakego>Take it over</button><button type="button" class="link" data-lcrentno>Not now</button></div></div>` : ''}
        ${ask === p && rentAsk.kind === 'end' ? `<div class="setup-offer" role="alertdialog" aria-labelledby="lc-ra-h"><strong id="lc-ra-h">End ${esc(p.run || p.pod)} and delete its card for good?</strong><span>The Forge saves what it can from it first. Anything still on the card after that is lost.</span><div class="row"><button type="button" class="get" data-lcrentendgo>End it</button><button type="button" class="link" data-lcrentno>Keep it</button></div></div>` : ''}</div>`).join('') : '<p class="muted">No Forge cards are up on the rental service.</p>') : '';
    return `<p class="muted">Cards rented by the Forge, from here or from a Forge window. Looking asks the rental service and changes nothing.</p>
      ${rentals?.watching ? `<p class="error">A Forge window wrote to its log ${rentals.watching} seconds ago, so it may still be watching a card. Close that window (Ctrl+C there leaves the card up) before you take its card over.</p>` : ''}
      <div class="row"><button type="button" class="get" data-lcrentlook ${can() ? '' : 'disabled'}>Look for rented cards</button></div>${rentMsg ? `<p class="error" role="alert">${esc(rentMsg)}</p>` : ''}${rows}`;
  }
  function buttonsEdit() {
    const bs = v?.buttons || [], add = ui.add;
    return `${bs.length ? `<ul class="lc-btnlist">${bs.map((b, i) => `<li><strong>${esc(b.label)}</strong> <span class="muted">${b.side === 'chat' ? 'Chat' : 'Server'}:</span> <code>${esc(b.line)}</code> <button type="button" class="link" data-lcedit="${i}">Edit</button><button type="button" class="link" data-lcrm="${i}" aria-label="Remove the button ${esc(b.label)}">Remove</button></li>`).join('')}</ul>` : '<p class="muted">No buttons yet. A button runs one command, or says one thing in the Chat, with one press. They show above the window.</p>'}
      <div class="lc-add"><label>Name <input id="lc-add-label" maxlength="30" value="${esc(add.label)}" placeholder="Tool check"></label>
        <label>Goes to <select id="lc-add-side">${[['server', 'Server'], ['chat', 'Chat']].map(([x, l]) => `<option value="${x}" ${add.side === x ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <label class="lc-add-line">Command or words <input id="lc-add-line" maxlength="1000" spellcheck="false" value="${esc(add.line)}" placeholder="node tool-pick.mjs --url {url}"></label>
        <button type="button" class="get" data-lcadd ${v?.local ? '' : 'disabled'}>Add the button</button></div>`;
  }
  function setupHtml() {
    const s = sv(), sec = (id, title, body, open) => `<details class="lc-sec" data-lcsec="${id}"${store.get(`sec-${id}`, open ? '1' : '0') === '1' ? ' open' : ''}><summary>${title}</summary><div class="lc-sec-b">${body}</div></details>`;
    if (!L) loadLists();
    const replies = `<div class="lc-dials">${DIALS.map(dialHtml).join('')}
        <div class="lc-dial"><label for="lc-d-seed">Seed</label>${tip('The same seed and the same words give the same answer. -1 picks a new one each time.', 'Seed')}<input type="number" id="lc-d-seed" class="lc-num" data-lcdial="seed" min="-1" step="1" value="${s.seed ?? -1}"></div></div>
      <div class="lc-ticks">${TICKS.map(([k, l, plain]) => `<span><label class="lc-tick"><input type="checkbox" data-lctick="${k}" ${s[k] ? 'checked' : ''}> ${esc(l)}</label>${tip(esc(plain), l)}</span>`).join('')}</div>
      <div class="lc-field"><label for="lc-tools">Tools it's offered</label>${tip('The Chat shows each tool call it makes and never runs one: you type the tool\'s answer, and it carries on. Practice tools: the four from the Lab test. Bob\'s tools: the ones Bob offers his own brain right now.', 'Tools it\'s offered')}
        <select id="lc-tools" data-lcsel="tools">${[['none', 'None'], ['practice', 'Practice tools (weather, picture, reminder, file search)'], ['bob', 'Bob\'s own tools']].map(([x, l]) => `<option value="${x}" ${s.tools === x ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>
      <div class="lc-field"><label for="lc-system">Its instructions (system prompt)</label><textarea id="lc-system" data-lcsys rows="3" maxlength="8000" placeholder="Empty: none, the brain's own default">${esc(s.system || '')}</textarea></div>
      <div class="row"><button type="button" class="link" data-lcdefaults>Back to the usual settings</button><span class="muted" id="lc-saved" role="status"></span></div>`;
    const groups = GROUPS.map(([g, title, hint]) => sec(g, title, `<p class="muted">${esc(hint)} What it prints shows in the Server panel.</p>${JOBS.filter((j) => j.group === g).map(jobHtml).join('')}`, false)).join('');
    const more = `<p class="muted">These are pages to look at more than forms, so they open on their own Lab tabs. Whatever they run still shows in the Server panel.</p><div class="lc-more">${LAB_PAGES.map(([id, l, what]) => `<button type="button" class="lab-chip" data-lcpage="${id}">${esc(l)}</button><span class="muted">${esc(what)}</span>`).join('')}</div>`;
    return `<div class="lc-setup"><div class="lc-bar"><span class="muted">One job at a time here; a rented card at a time.</span><span class="lc-bar-end"><button type="button" class="link" data-lclists>Refresh the lists</button></span></div>${sec('replies', 'How it answers', replies, true)}${groups}${sec('pipes', 'Pipelines', pipesHtml(), false)}${sec('cards', 'Rented cards', rentalsHtml(), false)}${sec('more', 'More of the Lab', more, false)}${sec('buttons', 'Your buttons', buttonsEdit(), false)}</div>`;
  }

  // ---- the window ----
  function slotHtml(side) {
    const p = ui[side];
    if ((ui.size === 'leftonly' && side === 'right') || (ui.size === 'rightonly' && side === 'left')) return '';
    const name = side === 'left' ? 'Left' : 'Right', title = PANELS.find((x) => x[0] === p)[1];
    return `<section class="lc-pane lc-p-${p}" id="lc-pane-${side}" aria-label="${name}: ${title}">
      <div class="lc-pick"><span class="lc-chips" role="radiogroup" aria-label="${name} side shows">${PANELS.map(([id, l]) => `<button type="button" class="lc-tab${p === id ? ' on' : ''}" role="radio" aria-checked="${p === id}" data-lcslot="${side}" value="${id}">${esc(l)}</button>`).join('')}</span>
        <span class="lc-bar-end"><button type="button" class="link" data-lconly="${side}">${ui.size === `${side}only` ? 'Show both sides' : 'Just this side'}</button></span></div>
      ${p === 'server' ? serverHtml() : p === 'chat' ? chatHtml() : setupHtml()}</section>`;
  }
  function headHtml() {
    if (!v) return 'Loading the console…';
    const s = v.server, state = v.bob?.on ? esc(v.target) : s.state === 'up' ? `${esc(s.brain)} on the ${esc(s.where)}` : s.state === 'loading' ? `Loading ${esc(s.brain)}…` : v.target ? esc(v.target) : 'No brain loaded';
    return `<span>Brain: <strong>${state}</strong></span>${v.job ? ` <span>· Running <strong>${esc(v.job.label)}</strong></span>` : ''}${v.labJobs?.length ? ` <span>· ${esc(v.labJobs.join(', '))}</span>` : ''}${v.replying ? ' <span>· Answering</span>' : ''}${v.rental ? ` <span class="lc-rent-on">· ${v.rental.running ? `Rented card: ${esc(v.rental.plan)}${v.rental.resumed ? ' (taken over)' : ''}, caps ${v.rental.hours} h or $${v.rental.dollars}` : 'A rented card is still up'}</span>` : ''}${v.hold ? ' <span class="lc-holding">· Holding requests</span>' : ''}`;
  }
  const running = () => Boolean(v && (v.job || v.replying || v.server?.state === 'loading' || v.labJobs?.length || v.rental?.running));
  function actionsHtml() {
    const local = v?.local !== false;
    return `<div class="lc-actions" role="group" aria-label="Console actions">
      <button type="button" class="get lc-big" data-lcopen="local" ${local ? '' : 'disabled'}>Load model locally</button>
      <button type="button" class="get lc-big" data-lcopen="rental" ${local && !v?.rental ? '' : 'disabled'}>Open rental</button>
      <button type="button" class="lc-big lc-stopall" data-lcstopall ${local && running() ? '' : 'disabled'}>STOP</button>
      ${v?.rental ? `<button type="button" class="lc-big lc-endrent" data-lcend ${local ? '' : 'disabled'}>END RENTAL</button>` : ''}
      ${tip('STOP stops everything running here: a command, a Lab job, a reply, a brain loading. It never ends a rental: the card stays up. END RENTAL deletes the rented card of this run only (by its pod, never every card). A rental also ends by itself when its run finishes or at a cap.', 'STOP and END RENTAL')}</div>
      ${ask === 'stop' ? '<div class="setup-offer" role="alertdialog" aria-labelledby="lc-ask-h"><strong id="lc-ask-h">Stop the work, and leave the rented card up?</strong><span>The Forge stops watching it here, so nothing checks its caps. It costs money until you press END RENTAL.</span><div class="row"><button type="button" class="get" data-lcstopgo>Stop, keep the card</button><button type="button" class="link" data-lcaskno>Don\'t stop</button></div></div>' : ''}
      ${ask === 'end' ? '<div class="setup-offer" role="alertdialog" aria-labelledby="lc-ask-h"><strong id="lc-ask-h">End the rental and delete its card for good?</strong><span>Whatever has already come home stays. Anything still on the card is lost.</span><div class="row"><button type="button" class="get" data-lcendgo>End the rental</button><button type="button" class="link" data-lcaskno>Keep it</button></div></div>' : ''}`;
  }
  function html() {
    if (!v) load();
    const local = v?.local !== false, quick = v?.buttons || [];
    return `<section class="lab-compare lc" id="lab-console" aria-labelledby="lc-h">
      <div class="lc-top"><h3 id="lc-h">Console</h3><span class="muted lc-state" id="lc-state" role="status">${headHtml()}</span></div>
      ${actionsHtml()}
      ${local ? `<label class="lab-opt"><input type="checkbox" id="lc-allow" ${v?.allowed ? 'checked' : ''}> <span><strong>Let the Lab run commands here</strong><br><span class="muted">Scripts from the model-lab folder, a brain loaded here, the Chat, and Lab jobs. Renting is the purchase card's job, never this.</span></span></label>` : '<p class="muted">You can watch from this device. Things only run on the computer Bob runs on.</p>'}
      ${quick.length ? `<div class="lc-buttons" role="group" aria-label="Your buttons">${quick.map((b, i) => `<button type="button" class="lab-chip" data-lcpress="${i}" title="${esc(`${b.side === 'chat' ? 'Chat' : 'Server'}: ${b.line}`)}" ${can() ? '' : 'disabled'}>${esc(b.label)}</button>`).join('')}</div>` : ''}
      <div class="lc-layout"><span class="muted" aria-hidden="true">Layout</span><span class="lc-chips" role="radiogroup" aria-label="Layout">${SIZES.map(([id, l]) => `<button type="button" class="lab-chip${ui.size === id ? ' on' : ''}" role="radio" aria-checked="${ui.size === id}" data-lcsize="${id}">${esc(l)}</button>`).join('')}</span>
        <span class="lc-bar-end"><button type="button" class="link" data-lcheight="-160" aria-label="Make the console shorter">Shorter</button><button type="button" class="link" data-lcheight="160" aria-label="Make the console taller">Taller</button><button type="button" class="link" data-lcclear>Clear the Server view</button></span></div>
      <div class="lc-win" id="lc-win" data-size="${ui.size}" style="--lc-h:${ui.height}px">${slotHtml('left')}${slotHtml('right')}</div>
      ${err ? `<p class="error" role="alert">${esc(err)}</p>` : ''}
    </section>`;
  }

  // ---- the two set-up windows: Load model locally, Open rental ----
  function dialog() {
    let d = $('lc-dialog');
    if (!d) { d = document.createElement('dialog'); d.id = 'lc-dialog'; d.className = 'lc-dialog'; d.setAttribute('aria-labelledby', 'lc-dlg-h'); d.addEventListener('close', () => { dlgKind = ''; card = null; dlgMsg = ''; }); }
    const home = $('lab-console')?.closest('.cellar') || document.body; if (d.parentElement !== home) home.appendChild(d); // inside the Lab, so it wears the Lab's look
    return d;
  }
  function localHtml() {
    const c = choices, f = ui.local;
    if (!c) return '<h3 id="lc-dlg-h">Load a model on this computer</h3><p class="muted">Looking for brains and engines…</p>';
    if (!c.engines.some((e) => e.id === f.engine && e.found)) f.engine = c.engines.find((e) => e.found)?.id ?? '';
    return `<h3 id="lc-dlg-h">Load a model on this computer</h3>
      <div class="lc-field"><label for="lc-l-brain">Brain</label><select id="lc-l-brain" data-lcl="brain"><option value="">${c.brains.length ? 'Pick a brain' : 'No brains here yet: get one in Get models'}</option>${c.brains.map((b) => `<option value="${esc(b.id)}" ${f.brain === b.id ? 'selected' : ''}>${esc(b.name)}</option>`).join('')}</select></div>
      <fieldset class="lc-field"><legend>Engine</legend>${c.engines.map((e) => `<label class="lc-tick"><input type="radio" name="lc-l-engine" id="lc-l-e-${e.id || 'usual'}" data-lcl="engine" value="${e.id}" ${f.engine === e.id ? 'checked' : ''} ${e.found ? '' : 'disabled'}> ${esc(e.name)}${e.found ? '' : ' <span class="muted">(not on this computer: Settings > Engines)</span>'}</label>`).join('')}</fieldset>
      <div class="lc-field"><label for="lc-l-ctx">Context: <output id="lc-l-ctx-o">${f.ctx}</output> tokens</label>${tip('How much of the chat it can hold at once. More needs more graphics memory.', 'Context')}<input type="range" id="lc-l-ctx" data-lcl="ctx" min="2048" max="131072" step="1024" value="${f.ctx}"></div>
      <label class="lc-tick"><input type="checkbox" id="lc-l-unload" data-lcl="unload" ${f.unload ? 'checked' : ''}> Unload Bob's own brain from the card first</label>
      <label class="lc-tick"><input type="checkbox" id="lc-l-cpu" data-lcl="cpuOk" ${f.cpuOk ? 'checked' : ''}> If it doesn't fit on the card, use the processor</label>
      <p class="muted">The Chat, your tools and Lab jobs then use it through the relay, so every request and reply shows in the Server panel.</p>
      <div class="lc-bobpick"><span>Or use the brain Bob has loaded now${v?.bob?.ready ? `: <strong>${esc(v.bob.name)}</strong>` : ''}. Nothing loads or unloads, and Bob's chat shares it.</span>${v?.bob?.ready ? '' : `<span class="muted">${esc(v?.bob?.why || '')}</span>`}<button type="button" class="link" data-lcusebob ${v?.bob?.ready && can() ? '' : 'disabled'}>Use Bob's brain</button></div>
      ${can() ? '' : '<p class="muted">Tick "Let the Lab run commands here" first.</p>'}
      ${dlgMsg ? `<p class="error" role="alert">${esc(dlgMsg)}</p>` : ''}
      <div class="row"><button type="button" class="get" data-lcloadgo ${f.brain && can() ? '' : 'disabled'}>Load it</button><button type="button" class="link" data-lcdlgclose>Cancel</button></div>`;
  }
  function rentalHtml() {
    const c = choices?.rental, f = ui.rent;
    if (!c) return '<h3 id="lc-dlg-h">Open a rental</h3><p class="muted">Reading the Forge\'s plans…</p>';
    if (f.cards === null) f.cards = [...c.usual];
    if (!c.engines.some((e) => e.id === f.engine)) f.engine = c.engines[0]?.id || 'plain';
    if (card) {
      const pr = card.problems || [];
      return `<h3 id="lc-dlg-h">Rent a graphics card?</h3>${list(card.summary, '')}${list(card.notes, 'muted')}
        <p><strong>Caps: ${card.hours} hour${Number(card.hours) === 1 ? '' : 's'} or $${card.dollars}, whichever comes first.</strong> The card shuts itself down at the cap even if this computer is switched off. The service's bill is the real number.</p>
        ${pr.some((x) => /Let the Lab start Forge runs/.test(x)) ? '<label class="lc-tick"><input type="checkbox" id="lc-forge-allow"> Let the Lab start Forge runs (each one still needs this press)</label>' : ''}
        ${list(pr, 'error')}${dlgMsg ? `<p class="error" role="alert">${esc(dlgMsg)}</p>` : ''}
        <div class="row"><button type="button" class="get" data-lcrentgo ${pr.length ? 'disabled' : ''}>Rent it and start (up to $${card.dollars})</button><button type="button" class="link" data-lcrentback>${card.fromSetup ? 'Change it in Set up' : 'Change something'}</button><button type="button" class="link" data-lcdlgclose>Not now</button></div>`;
    }
    const brainPart = `<div class="lc-field"><label for="lc-r-brain">Brain</label><select id="lc-r-brain" data-lcr="brain"><option value="">Pick a brain</option>${c.brains.map((b) => `<option value="${esc(b.file)}" ${f.brain === b.file ? 'selected' : ''}>${esc(b.nickname ? `${b.nickname} (${b.name})` : b.name || b.file)}</option>`).join('')}<option value="other" ${f.brain === 'other' ? 'selected' : ''}>Another one on Hugging Face…</option></select></div>
      ${f.brain === 'other' ? `<div class="lc-field"><label for="lc-r-other">On Hugging Face</label><input id="lc-r-other" data-lcr="other" spellcheck="false" value="${esc(f.other)}" placeholder="hf:owner/repo:file-Q4_K_M.gguf"></div>` : ''}
      <fieldset class="lc-field"><legend>Engine on the card</legend>${c.engines.map((e) => `<label class="lc-tick"><input type="radio" name="lc-r-engine" id="lc-r-e-${e.id}" data-lcr="engine" value="${e.id}" ${f.engine === e.id ? 'checked' : ''}> ${esc(e.name)}</label>`).join('')}</fieldset>
      <fieldset class="lc-field"><legend>Cards it may rent (it takes the cheapest it finds)</legend><div class="lc-cards">${c.cards.map((g) => `<label class="lc-tick"><input type="checkbox" data-lcrcard value="${esc(g)}" ${f.cards.includes(g) ? 'checked' : ''}> ${esc(g.replace(/^NVIDIA /, ''))}</label>`).join('')}</div></fieldset>
      <div class="lc-field"><label for="lc-r-ctx">Context: <output>${f.ctx}</output> tokens</label><input type="range" id="lc-r-ctx" data-lcr="ctx" min="2048" max="131072" step="2048" value="${f.ctx}"></div>
      <div class="lc-field"><label for="lc-r-slots">Answers at a time: <output>${f.slots}</output></label><input type="range" id="lc-r-slots" data-lcr="slots" min="1" max="4" step="1" value="${f.slots}"></div>
      <div class="lc-field"><label for="lc-r-disk">Disk on the card: <output>${f.disk}</output> GB</label><input type="range" id="lc-r-disk" data-lcr="disk" min="40" max="400" step="10" value="${f.disk}"></div>`;
    const planPart = `<div class="lc-field"><label for="lc-r-plan">Forge plan</label><select id="lc-r-plan" data-lcr="plan"><option value="">Pick a plan</option>${c.plans.map((p) => `<option value="${esc(p.id)}" ${f.plan === p.id ? 'selected' : ''}>${esc(p.id)}</option>`).join('')}</select></div>
      ${f.plan ? `<p class="muted">${esc(c.plans.find((p) => p.id === f.plan)?.note || '')}</p>` : ''}`;
    return `<h3 id="lc-dlg-h">Open a rental</h3>
      <div class="lc-chips" role="radiogroup" aria-label="What the card is for">${[['brain', 'A brain to chat with and run tools on'], ['plan', 'One of the Forge\'s plans']].map(([x, l]) => `<button type="button" class="lab-chip${f.kind === x ? ' on' : ''}" role="radio" aria-checked="${f.kind === x}" data-lcrkind="${x}">${esc(l)}</button>`).join('')}</div>
      ${f.kind === 'plan' ? planPart : brainPart}
      <fieldset class="lc-field lc-caps"><legend>Caps (you type them, every time)</legend><label>Hours <input type="number" id="lc-r-hours" data-lcr="hours" min="0.25" max="24" step="0.25" value="${esc(f.hours)}"></label><label>Dollars <input type="number" id="lc-r-dollars" data-lcr="dollars" min="0.5" max="500" step="0.5" value="${esc(f.dollars)}"></label></fieldset>
      ${f.kind === 'brain' ? '<p class="muted">When it\'s ready, the Chat and your tools use it (its key stays with the Forge), until a cap or END RENTAL.</p>' : ''}
      ${dlgMsg ? `<p class="error" role="alert">${esc(dlgMsg)}</p>` : ''}
      <div class="row"><button type="button" class="get" data-lcrentcard>Show the purchase card</button><button type="button" class="link" data-lcdlgclose>Cancel</button></div>`;
  }
  function drawDialog(focus = '') {
    const d = dialog(); if (!dlgKind) { if (d.open) d.close(); return; }
    d.innerHTML = `<div class="lc-dlg-b">${dlgKind === 'local' ? localHtml() : rentalHtml()}</div>`;
    if (!d.open) { try { d.showModal(); } catch { d.setAttribute('open', ''); } }
    ((focus && $(focus)) || d.querySelector('select, input:not([disabled]), button'))?.focus();
  }
  async function openDialog(kind) {
    dlgKind = kind; card = null; dlgMsg = ''; drawDialog();
    try { choices = await api('/api/lab/console/choices'); } catch (e) { dlgMsg = e.message; }
    if (kind === 'local') { if (!ui.local.brain && choices?.brains?.length === 1) ui.local.brain = choices.brains[0].id; ui.local.ctx = v?.setup?.ctx || ui.local.ctx; }
    drawDialog();
  }

  // ---- drawing and loading ----
  function mounted() {
    if (!$('lab-console')) return;
    active = on;
    fill(); drawChat(true);
    if (!timer) tick();
  }
  function redraw(focusId = document.activeElement?.id) {
    const box = $('lab-console'); if (!box) return;
    const f0 = focusId && $(focusId), sel = f0 && 'selectionStart' in f0 ? [f0.selectionStart, f0.selectionEnd] : null;
    const scrolls = [...document.querySelectorAll('#lab-console .lc-setup')].map((x) => x.scrollTop);
    box.outerHTML = html(); mounted(); heldShown = String(v?.pending?.[0]?.id || '');
    document.querySelectorAll('#lab-console .lc-setup').forEach((x, i) => { x.scrollTop = scrolls[i] || 0; });
    const f = focusId && $(focusId); if (f) { f.focus(); if (sel && f.setSelectionRange) try { f.setSelectionRange(...sel); } catch {} }
  }
  // What Set up's forms pick from: brains, lesson sets, packs (the Lab's view), the Forge's plans and brains, pairs,
  // pipelines and steps. Read once, and again on Refresh the lists.
  async function loadLists() {
    if (lLoading) return; lLoading = true;
    const get = async (p) => { try { return await api(p); } catch { return null; } };
    const [lab, forge, proto, pipes, steps] = await Promise.all(['/api/lab', '/api/lab/forge', '/api/lab/protocol', '/api/lab/pipelines', '/api/lab/steps'].map(get));
    L = { lab: lab || {}, forge: forge || {}, proto: proto || {}, pipes, steps: steps?.steps || [] }; lLoading = false;
    if (shown('setup')) redraw();
  }
  async function load() {
    if (busy) return; busy = true;
    try {
      const j = await api(`/api/lab/console?since=${since}&talk=${talkRev}`);
      const shape = (x) => JSON.stringify([x?.allowed, x?.local, x?.server?.state, x?.server?.brain, x?.job?.label, x?.replying, x?.rental, x?.hold, x?.buttons, x?.toJob, x?.labJobs, x?.target, (x?.waiting || []).length, x?.bob?.on, x?.bob?.ready]);
      const changed = !v || shape(v) !== shape(j);
      if (j.first > since + 1 && since) entries.length = 0; // the view was cleared, or the record moved on past what's here
      const fresh = j.lines || []; entries.push(...fresh); if (entries.length > 8000) entries.splice(0, entries.length - 8000);
      since = j.next; v = { ...j, setup: setupDraft || j.setup }; err = '';
      const talkNew = Array.isArray(j.talk); if (talkNew) { talk = j.talk; talkRev = j.talkRev; }
      if (!$('lab-console') || active !== on) return;
      if (changed) { redraw(); return; }
      $('lc-state').innerHTML = headHtml();
      if (fresh.length) fill(fresh, false);
      if (talkNew) drawChat();
      const held = String(v.pending?.[0]?.id || '');
      if (held !== heldShown) { heldShown = held; const hb = $('lc-held-box'); if (hb) hb.innerHTML = heldHtml(); }
    } catch (e) { err = e.message; } finally { busy = false; }
  }
  function tick() {
    clearTimeout(timer); timer = null;
    if (!$('lab-console') || active !== on) return; // the Forge tab closed (it starts again when it opens), or another Lab drew it
    load().finally(() => { const quick = v && (running() || v.pending?.length); timer = setTimeout(tick, document.hidden ? 5000 : quick ? 700 : 2500); });
  }
  async function call(p, b) { try { const r = await api(p, b); err = ''; return r; } catch (e) { err = ''; await load(); return null; } }
  async function submit(pane) {
    const inp = $(`lc-in-${pane}`); if (!inp) return;
    const text = inp.value; if (pane === 'chat' && !text.trim()) return;
    ui.drafts[pane] = ''; inp.value = ''; if (pane === 'server') ui.hist.server = -1; ui.follow[pane] = 'jump';
    await call('/api/lab/console/send', { side: pane, text });
    await load(); $(`lc-in-${pane}`)?.focus();
  }
  // Set up's choices are saved a moment after the last change, so a slider being dragged sends one request.
  function setSetup(k, x) {
    setupDraft = { ...sv(), [k]: x };
    clearTimeout(setupTimer);
    setupTimer = setTimeout(async () => {
      const s = setupDraft;
      try { const r = await api('/api/lab/console/setup', { setup: s }); if (setupDraft === s) setupDraft = null; if (v) v.setup = r.setup; const m = $('lc-saved'); if (m) { m.textContent = 'Saved'; setTimeout(() => { m.textContent = ''; }, 1500); } } catch (e) { err = e.message; }
    }, 400);
  }
  function jobForm(j) { const f = {}; for (const fd of j.fields) f[fd.k] = jobVal(j, fd); return f; }
  function checkMsg(r) {
    const notes = [...(r.notes || [])];
    if (r.hours) notes.push(`About ${r.hours} hour${r.hours === 1 ? '' : 's'}.`);
    if (r.diskGB) notes.push(`About ${r.diskGB} GB of disk.`);
    if (r.steps?.length) notes.push(`Steps: ${r.steps.map((x) => x.label || x).join(', ')}.`);
    return { problems: r.problems || [], notes, ok: (r.problems || []).length ? '' : 'Nothing stops it.', text: r.text || '' };
  }
  async function showForgeCard(id) {
    const c = await api('/api/lab/forge/card', { id });
    const summary = [`Run: ${id}`, ...(c.brains || []).map((x) => `${x.nickname || x.name}: keeps ${x.keep} experts a layer, up to ${x.hours} h`), `Running files: ${c.quants || 'Q4_K_M'}`, ...(c.cards?.length ? [`Cards it may rent: ${c.cards.join(', ')}`] : []), ...(c.volume ? [`A ${c.volume} GB network volume, kept between runs`] : [])];
    if (!choices) { try { choices = await api('/api/lab/console/choices'); } catch {} }
    dlgKind = 'rental'; dlgMsg = ''; card = { ...c, summary, notes: [], fromSetup: true }; drawDialog();
  }
  async function jobAct(id, mode) {
    const j = JOBS.find((x) => x.id === id); if (!j) return;
    const form = jobForm(j);
    try {
      if (mode === 'check') jobMsg[id] = checkMsg(await api(...j.check(form)));
      else if (j.rented) { const r = await api(...j.run(form)); jobMsg[id] = { ok: `Saved as ${r.file}. Its purchase card is open.` }; await showForgeCard(String(r.file || '').replace(/\.json$/, '')); }
      else {
        const r = await api(...(mode === 'alt' ? j.alt.req(form) : j.run(form)));
        if (r?.needUnload) jobMsg[id] = { problems: [`${(r.names || []).join(', ') || 'Bob\'s brain'} is on the card. Tick "Unload Bob's brain from the card first", then run it again.`] };
        else if (r?.problems?.length) jobMsg[id] = { problems: r.problems, notes: r.notes };
        else { jobMsg[id] = { ok: `${mode === 'alt' ? j.alt.label : j.title}: started. It shows in the Server panel.` }; ui.follow.server = 'jump'; }
      }
    } catch (e) { jobMsg[id] = { problems: [e.message] }; }
    await load(); redraw();
  }
  function jobSet(t) {
    const j = JOBS.find((x) => x.id === t.dataset.lcjob); if (!j) return;
    const f = (ui.job[j.id] ||= {}), k = t.dataset.k;
    if ('multi' in t.dataset) { const fd = j.fields.find((x) => x.k === k); const cur = new Set(Array.isArray(f[k]) ? f[k] : jobVal(j, fd)); if (t.checked) cur.add(t.value); else cur.delete(t.value); f[k] = [...cur]; }
    else if (t.type === 'checkbox') f[k] = t.checked;
    else f[k] = t.value;
    j.onChange?.(k, f, L || {});
    jobMsg[j.id] = null;
  }
  async function pipeAct(d) {
    try {
      if (d.lcpipego) { const r = await api('/api/lab/pipeline/go', { slug: d.lcpipego }); pipeMsg[d.lcpipego] = r.message || (r.started ? 'Started.' : ''); if (r.started) ui.follow.server = 'jump'; }
      else if (d.lcpipeskip) { await api('/api/lab/pipeline/skip', { slug: d.lcpipeskip, step: Number(d.step), skip: true }); pipeMsg[d.lcpipeskip] = 'Skipped.'; }
      else {
        const ids = 'lcpbproto' in d ? null : (L?.steps || []).filter((x) => pb.steps.includes(x.id)).map((x) => x.id);
        let first = true;
        const steps = ids ? ids.map((id) => { const st = L.steps.find((x) => x.id === id); const form = st.form?.needs?.includes('set') ? { set: first && pb.set ? pb.set : '@prev' } : {}; if (st.form?.needs?.includes('set')) first = false; return { id, form }; }) : null;
        const r = await api('/api/lab/pipeline/save', { pipeline: ids ? { name: pb.name, steps } : L.pipes.protocol });
        pbMsg = r.problems?.length ? r.problems.join(' ') : `Saved: ${r.slug}.`; if (!r.problems?.length && ids) pb = { name: '', steps: [], set: '' };
      }
    } catch (e) { pbMsg = e.message; if (d.lcpipego || d.lcpipeskip) pipeMsg[d.lcpipego || d.lcpipeskip] = e.message; }
    try { L = { ...L, pipes: await api('/api/lab/pipelines') }; } catch {}
    await load(); redraw();
  }
  async function rentAct(d) {
    rentMsg = '';
    try {
      if ('lcrentlook' in d) { rentAsk = null; rentals = await api('/api/lab/console/rentals', {}); }
      else if (d.lcrenttake) rentAsk = { kind: 'take', pod: d.lcrenttake };
      else if (d.lcrentend) rentAsk = { kind: 'end', pod: d.lcrentend };
      else if ('lcrentno' in d) rentAsk = null;
      else if ('lcrenttakego' in d && rentAsk) { const p = rentals.pods.find((x) => x.pod === rentAsk.pod); rentAsk = null; await api('/api/lab/console/rental/takeover', { pod: p.pod, hours: p.plan.hours, dollars: p.plan.dollars }); ui.follow.server = 'jump'; showPanel('server'); rentals = null; }
      else if ('lcrentendgo' in d && rentAsk) { const pod = rentAsk.pod; rentAsk = null; await api('/api/lab/console/rental/endpod', { pod }); rentals = { ...rentals, pods: rentals.pods.filter((x) => x.pod !== pod) }; ui.follow.server = 'jump'; }
    } catch (e) { rentMsg = e.message; }
    await load(); redraw();
  }
  const rentForm = () => { const f = ui.rent; return f.kind === 'plan' ? { kind: 'plan', plan: f.plan, hours: f.hours, dollars: f.dollars } : { kind: 'brain', brain: f.brain === 'other' ? f.other.trim() : f.brain, engine: f.engine, cards: f.cards, ctx: f.ctx, slots: f.slots, disk: f.disk, hours: f.hours, dollars: f.dollars }; };
  const showPanel = (p) => { if (shown(p)) return; if (ui.size.endsWith('only')) ui.size = 'even'; if (ui.left !== p && ui.right !== p) { if (ui.right !== 'server') ui.right = p; else ui.left = p; } store.set('left', ui.left); store.set('right', ui.right); store.set('size2', ui.size); };

  // The console listens for itself (the Lab page leaves anything inside it alone), so a redraw never loses a line.
  const on = {};
  on.submit = (e) => { const f = e.target.closest?.('[data-lcform]'); if (!f) return; e.preventDefault(); submit(f.dataset.lcform); };
  on.input = (e) => {
    const t = e.target; if (!inside(t)) return;
    const out = () => { const o = t.previousElementSibling?.querySelector?.('output'); if (o) o.textContent = t.value; };
    if (t.id === 'lc-in-server') ui.drafts.server = t.value; else if (t.id === 'lc-in-chat') ui.drafts.chat = t.value;
    else if (t.id === 'lc-add-label') ui.add.label = t.value; else if (t.id === 'lc-add-line') ui.add.line = t.value;
    else if (t.dataset.lcdial) { const x = Number(t.value); if (t.value !== '' && Number.isFinite(x)) { setSetup(t.dataset.lcdial, x); for (const o of document.querySelectorAll(`[data-lcdial="${t.dataset.lcdial}"]`)) if (o !== t) o.value = t.value; } }
    else if ('lcsys' in t.dataset) setSetup('system', t.value);
    else if (t.dataset.lcjob && t.tagName !== 'SELECT' && t.type !== 'checkbox') { (ui.job[t.dataset.lcjob] ||= {})[t.dataset.k] = t.type === 'range' || (t.type === 'number' && t.value !== '') ? Number(t.value) : t.value; jobMsg[t.dataset.lcjob] = null; out(); }
    else if (t.dataset.lcpb === 'name') pb.name = t.value;
    else if (t.dataset.lcl && t.type === 'range') { ui.local[t.dataset.lcl] = Number(t.value); out(); }
    else if (t.dataset.lcr && !['radio', 'checkbox'].includes(t.type) && t.tagName !== 'SELECT') { ui.rent[t.dataset.lcr] = t.type === 'range' ? Number(t.value) : t.value; out(); }
  };
  on.keydown = (e) => {
    const t = e.target;
    if (t.id === 'lc-in-chat' && e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit('chat'); return; }
    if (t.id !== 'lc-in-server' || !['ArrowUp', 'ArrowDown'].includes(e.key)) return; // up and down bring back earlier lines, like a terminal
    const h = v?.history?.server || [];
    if (!h.length) return; e.preventDefault();
    let i = ui.hist.server < 0 ? h.length : ui.hist.server; i = e.key === 'ArrowUp' ? Math.max(0, i - 1) : i + 1;
    if (i >= h.length) { ui.hist.server = -1; t.value = ''; } else { ui.hist.server = i; t.value = h[i]; }
    ui.drafts.server = t.value;
  };
  on.change = async (e) => {
    const t = e.target; if (!inside(t)) return;
    if (t.id === 'lc-allow') { await call('/api/lab/console/allow', { on: t.checked }); await load(); return; }
    if (t.id === 'lc-hold') { await call('/api/lab/console/hold', { on: t.checked }); await load(); return; }
    if (t.id === 'lc-tojob') { await call('/api/lab/console/tojob', { on: t.checked }); await load(); return; }
    if (t.id === 'lc-add-side') { ui.add.side = t.value; return; }
    if (t.dataset.lctick) { setSetup(t.dataset.lctick, t.checked); if (t.dataset.lctick === 'showThink' && v) { v.setup = { ...v.setup, showThink: t.checked }; drawChat(); } return; }
    if (t.dataset.lcsel) { setSetup(t.dataset.lcsel, t.value); return; }
    if (t.dataset.lcjob && (t.tagName === 'SELECT' || t.type === 'checkbox')) { jobSet(t); redraw(t.id); return; } // a choice can show or hide other fields
    if (t.dataset.lcpb === 'set') { pb.set = t.value; return; }
    if ('lcpbstep' in t.dataset) { const c = new Set(pb.steps); if (t.checked) c.add(t.value); else c.delete(t.value); pb.steps = [...c]; return; }
    if (t.dataset.lcl && t.type !== 'range') { ui.local[t.dataset.lcl] = t.type === 'checkbox' ? t.checked : t.value; dlgMsg = ''; drawDialog(t.id); return; }
    if (t.dataset.lcr && (t.type === 'radio' || t.tagName === 'SELECT')) { ui.rent[t.dataset.lcr] = t.value; dlgMsg = ''; drawDialog(t.id); return; }
    if ('lcrcard' in t.dataset) { const c = new Set(ui.rent.cards || []); if (t.checked) c.add(t.value); else c.delete(t.value); ui.rent.cards = [...c]; return; }
    if (t.id === 'lc-forge-allow') { try { await api('/api/lab/forge/allow', { on: t.checked }); if (card?.fromSetup) { const c = await api('/api/lab/forge/card', { id: card.id }); card = { ...card, problems: c.problems }; } else { const r = await api('/api/lab/console/rental/plan', { form: rentForm() }); card = r.card ? { ...r.card, summary: r.summary, notes: r.notes } : card; } } catch (x) { dlgMsg = x.message; } drawDialog(); }
  };
  on.scroll = (e) => { const t = e.target, end = () => t.scrollHeight - t.scrollTop - t.clientHeight < 40; if (t.id === 'lc-out') ui.follow.server = end(); else if (t.id === 'lc-chat') ui.follow.chat = end(); };
  on.toggle = (e) => { const s = e.target?.dataset?.lcsec; if (s) store.set(`sec-${s}`, e.target.open ? '1' : '0'); };
  on.click = async (e) => {
    if (e.target.id === 'lc-dialog') { dialog().close(); return; } // a click on the backdrop
    const b = e.target.closest?.('#lab-console button, #lc-dialog button'); if (!b) return;
    const d = b.dataset;
    if (d.lcslot) { const side = d.lcslot, other = side === 'left' ? 'right' : 'left'; if (ui[other] === b.value) ui[other] = ui[side]; ui[side] = b.value; store.set('left', ui.left); store.set('right', ui.right); redraw(); document.querySelector(`[data-lcslot="${side}"][value="${b.value}"]`)?.focus(); return; }
    if (d.lcsize) { ui.size = d.lcsize; store.set('size2', ui.size); redraw(); document.querySelector(`[data-lcsize="${d.lcsize}"]`)?.focus(); return; }
    if (d.lconly) { ui.size = ui.size === `${d.lconly}only` ? 'even' : `${d.lconly}only`; store.set('size2', ui.size); redraw(); document.querySelector(`[data-lconly="${d.lconly}"]`)?.focus(); return; }
    if (d.lcf) { ui.f[d.lcf] = !ui.f[d.lcf]; store.set(`f-${d.lcf}`, ui.f[d.lcf] ? '1' : '0'); b.classList.toggle('on', ui.f[d.lcf]); b.setAttribute('aria-pressed', String(ui.f[d.lcf])); fill(); return; }
    if (d.lcheight) { ui.height = Math.min(1400, Math.max(300, ui.height + Number(d.lcheight))); store.set('height', ui.height); $('lc-win')?.style.setProperty('--lc-h', `${ui.height}px`); return; }
    if ('lcclear' in d) { entries.length = 0; fill(); await call('/api/lab/console/clear', {}); return; }
    if ('lccopy' in d) { const t = $('lc-out')?.textContent || ''; try { await navigator.clipboard.writeText(t); b.textContent = 'Copied'; setTimeout(() => { b.textContent = 'Copy'; }, 1500); } catch { const r = document.createRange(); r.selectNodeContents($('lc-out')); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } return; }
    if ('lcunload' in d) { await call('/api/lab/console/stop', { what: 'server' }); await load(); return; }
    if ('lcstopreply' in d) { await call('/api/lab/console/stop', { what: 'reply' }); await load(); return; }
    if ('lcnewchat' in d) { await call('/api/lab/console/newchat', {}); talkRev = -1; await load(); drawChat(); $('lc-in-chat')?.focus(); return; }
    if ('lcstopall' in d) { if (v?.rental?.running) { ask = 'stop'; redraw(); document.querySelector('[data-lcaskno]')?.focus(); return; } await call('/api/lab/console/stop', { what: 'all' }); await load(); return; }
    if ('lcstopgo' in d) { ask = ''; await call('/api/lab/console/stop', { what: 'all' }); await load(); redraw(); return; }
    if ('lcend' in d) { ask = 'end'; redraw(); document.querySelector('[data-lcaskno]')?.focus(); return; }
    if ('lcendgo' in d) { ask = ''; await call('/api/lab/console/rental/end', {}); await load(); redraw(); return; }
    if ('lcaskno' in d) { ask = ''; redraw(); return; }
    if (d.lcdecide) { await call('/api/lab/console/decide', { id: Number(d.lcdecide), send: b.value === 'send', body: $('lc-held-body')?.value }); await load(); $('lc-in-server')?.focus(); return; }
    if (d.lcpress !== undefined) { ui.follow.server = ui.follow.chat = 'jump'; await call('/api/lab/console/button', { press: Number(d.lcpress) }); await load(); return; }
    if (d.lcedit !== undefined) { // put the button's command in its panel's box, to change before running
      const x = v?.buttons?.[Number(d.lcedit)]; if (!x) return;
      const p = x.side === 'chat' ? 'chat' : 'server'; showPanel(p);
      ui.drafts[p] = x.line; redraw(); $(`lc-in-${p}`)?.focus(); return;
    }
    if (d.lcrm !== undefined) { await call('/api/lab/console/button', { remove: Number(d.lcrm) }); await load(); return; }
    if ('lcadd' in d) { try { await api('/api/lab/console/button', { add: { ...ui.add } }); ui.add = { label: '', side: 'server', line: '' }; err = ''; } catch (x) { err = x.message; } await load(); redraw(); return; }
    if ('lcdefaults' in d) { setupDraft = null; clearTimeout(setupTimer); try { const r = await api('/api/lab/console/setup', { setup: DEFAULT_SETUP }); if (v) v.setup = r.setup; } catch (x) { err = x.message; } redraw(); return; }
    if (d.lcjobopen) { jobOpen = jobOpen === d.lcjobopen ? '' : d.lcjobopen; store.set('job', jobOpen); redraw(); document.querySelector(`[data-lcjobopen="${d.lcjobopen}"]`)?.focus(); return; }
    if (d.lcjobcheck) { await jobAct(d.lcjobcheck, 'check'); return; }
    if (d.lcjobrun) { await jobAct(d.lcjobrun, 'run'); return; }
    if (d.lcjobalt) { await jobAct(d.lcjobalt, 'alt'); return; }
    if ('lclists' in d) { L = null; await loadLists(); return; }
    if (d.lcpipego || d.lcpipeskip || 'lcpbsave' in d || 'lcpbproto' in d) { await pipeAct(d); return; }
    if ('lcrentlook' in d || d.lcrenttake || d.lcrentend || 'lcrentno' in d || 'lcrenttakego' in d || 'lcrentendgo' in d) { const fid = b.id; await rentAct(d); if (fid) $(fid)?.focus(); return; }
    if ('lcusebob' in d) { await call('/api/lab/console/usebob', { on: true }); if (dlgKind) dialog().close(); ui.follow.server = 'jump'; await load(); return; }
    if ('lcbobstop' in d) { await call('/api/lab/console/usebob', { on: false }); await load(); return; }
    if (d.lcpage) { document.getElementById(`lab-tab-${d.lcpage}`)?.click(); return; }
    if (d.lcopen) { openDialog(d.lcopen); return; }
    if ('lcdlgclose' in d) { dialog().close(); return; }
    if ('lcloadgo' in d) { try { await api('/api/lab/console/load', { ...ui.local }); dialog().close(); ui.follow.server = 'jump'; } catch (x) { dlgMsg = x.message; drawDialog(); } await load(); return; }
    if (d.lcrkind) { ui.rent.kind = d.lcrkind; dlgMsg = ''; drawDialog(); document.querySelector(`[data-lcrkind="${d.lcrkind}"]`)?.focus(); return; }
    if ('lcrentcard' in d) {
      try { const r = await api('/api/lab/console/rental/plan', { form: rentForm() }); if (r.problems.length) dlgMsg = r.problems.join(' '); else { card = { ...r.card, summary: r.summary, notes: r.notes }; dlgMsg = ''; } } catch (x) { dlgMsg = x.message; }
      drawDialog(); return;
    }
    if ('lcrentback' in d) { if (card?.fromSetup) { dialog().close(); return; } card = null; drawDialog(); return; }
    if ('lcrentgo' in d && card) { try { await api('/api/lab/forge/start', { id: card.id, hours: card.hours, dollars: card.dollars }); dialog().close(); ui.follow.server = 'jump'; showPanel('server'); } catch (x) { dlgMsg = x.message; drawDialog(); } await load(); redraw(); return; }
  };

  return { html, mounted };
}
