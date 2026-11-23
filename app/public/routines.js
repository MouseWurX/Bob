// The Routines editor (public/routines.html): build a routine by placing boxes and dragging wires between their pins,
// like Unreal's Blueprints. White wires say what runs next; coloured wires carry a value into a field. Bob's side is
// src/hands-routines.js (GET/POST /api/routines); the box kinds and the checks are in public/routine-nodes.js.
//
// Mouse: drag a box by its title; drag from a pin to another pin to wire them; click a wire and press Delete to
// remove it; right-click the grid (or ＋ Add) to add a box; drag the grid to move around; the wheel zooms.
// Keys: Delete removes what's picked, Ctrl+Z / Ctrl+Y undo and redo, Ctrl+S saves, Ctrl+D copies a box.
import { esc } from './util.js';
import { NODES, ROUTINE_TOOLS, GROUPS, PIN_TYPES, ACCEPTS, fieldsOf, outsOf, execOuts, refsIn, onlyRef, checkRoutine, isTrigger, runsBefore, insideEach, graphHash } from './routine-nodes.js';

const $ = (id) => document.getElementById(id);
const api = async (url, data) => {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};

let all = null; // GET /api/routines
let cur = null; // the routine being edited (a plain copy; saved with Save)
let saved = ''; // its JSON as last saved, to know about unsaved changes
let serverView = null; // what Bob says about it (OK, on, problems, runs)
let sel = { nodes: new Set(), wire: null }; // wire: { kind: 'exec', from, out } or { kind: 'data', node, field, ref }
let view = { x: 40, y: 40, z: 1 };
let undo = [], redo = [];
let lastRun = null; // the run shown on the grid (live or picked from the list)
let polling = null;
let say = '';

// ---------------------------------------------------------------------------------------------------------------
// Loading and saving
// ---------------------------------------------------------------------------------------------------------------
async function loadAll(pick) {
  all = await api('/api/routines');
  const id = pick || cur?.id || new URLSearchParams(location.search).get('id') || all.list[0]?.id;
  $('rtPick').innerHTML = all.list.length ? all.list.map((r) => `<option value="${esc(r.id)}" ${r.id === id ? 'selected' : ''}>${esc(r.name)}${r.on ? ' (on)' : ''}</option>`).join('') : '<option value="">No routines yet</option>';
  $('rtOff').hidden = all.on;
  $('rtOff').textContent = all.on ? '' : 'The Routines Hand is off (Settings, Hands), so routines don\'t run by themselves yet. You can still build them and use Test.';
  if (id && all.list.some((r) => r.id === id)) await open(id);
  else { cur = null; draw(); }
}
async function open(id) {
  if (dirty() && !confirm('Leave without saving your changes?')) { $('rtPick').value = cur.id; return; }
  const got = await api(`/api/routines?id=${encodeURIComponent(id)}`);
  serverView = got;
  cur = strip(got.routine);
  saved = JSON.stringify(cur);
  undo = []; redo = []; sel = { nodes: new Set(), wire: null };
  lastRun = null;
  $('rtName').value = cur.name;
  history.replaceState(null, '', `?id=${encodeURIComponent(id)}`);
  draw();
  fit();
  if (got.running) follow(got.running);
}
const strip = (v) => ({ bobRoutine: 1, id: v.id, name: v.name, what: v.what || '', nodes: v.nodes.map((n) => ({ id: n.id, kind: n.kind, x: n.x, y: n.y, f: { ...n.f } })), wires: v.wires.map((w) => ({ ...w })), ...(v.from ? { from: v.from } : {}) });
const dirty = () => cur && JSON.stringify(cur) !== saved;
async function save() {
  if (!cur) return;
  try {
    const got = await api('/api/routines', { save: cur });
    all = got;
    serverView = { ...serverView, routine: got.routine };
    saved = JSON.stringify(cur);
    say = got.routine.changedSinceOk ? 'Saved. It changed since your OK, so it needs your OK again before it runs.' : 'Saved.';
    const keep = cur.id;
    $('rtPick').innerHTML = all.list.map((r) => `<option value="${esc(r.id)}" ${r.id === keep ? 'selected' : ''}>${esc(r.name)}${r.on ? ' (on)' : ''}</option>`).join('');
    serverView = await api(`/api/routines?id=${encodeURIComponent(keep)}`);
  } catch (e) { say = e.message; }
  draw();
}
function change(fn) {
  undo.push(JSON.stringify(cur));
  if (undo.length > 200) undo.shift();
  redo = [];
  fn();
  draw();
}

// ---------------------------------------------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------------------------------------------
const label = (n) => (n.kind === 'tool' ? ROUTINE_TOOLS[n.f.tool]?.label || 'Use a tool' : NODES[n.kind]?.label || n.kind);
const colourOf = (n) => GROUPS[NODES[n.kind]?.group]?.colour || '#555';
const problemsNow = () => (cur ? checkRoutine(cur, { tools: all ? Object.keys(all.tools).filter((k) => all.tools[k].here) : null, afterMail: all?.afterMail || null }) : []);
const short = (v) => { const r = onlyRef(v); if (r) return `← ${r.node}.${r.pin}`; const s = typeof v === 'boolean' ? (v ? 'yes' : 'no') : String(v ?? ''); return s.length > 28 ? `${s.slice(0, 28)}…` : s; };

function draw() {
  const nodesEl = $('rtNodes');
  if (!cur) { nodesEl.innerHTML = ''; $('rtWires').innerHTML = ''; side(); bar(); return; }
  const problems = problemsNow();
  const bad = new Map();
  for (const p of problems) if (p.node) bad.set(p.node, [...(bad.get(p.node) || []), p.text]);
  const stepState = runStates();
  nodesEl.innerHTML = cur.nodes.map((n) => {
    const def = NODES[n.kind] || {};
    const fields = fieldsOf(n), outs = outsOf(n);
    const execs = def.exec ?? ['then'];
    const st = stepState.get(n.id) || '';
    return `<div class="rt-node${sel.nodes.has(n.id) ? ' sel' : ''}${bad.has(n.id) ? ' bad' : ''}${st ? ` ${st}` : ''}" data-node="${esc(n.id)}" style="left:${n.x}px;top:${n.y}px">
      <div class="rt-head" style="background:${colourOf(n)}" data-drag="${esc(n.id)}">${def.input === false ? '' : `<span class="rt-pin exec in" data-pin="in" data-n="${esc(n.id)}"></span>`}
        <span>${esc(label(n))}</span><span class="rt-id">${esc(n.id)}</span>${bad.has(n.id) ? `<span class="rt-badge" title="${esc(bad.get(n.id).join('\n'))}">!</span>` : ''}</div>
      <div class="rt-body">
        ${execs.map((o) => `<div class="rt-row"><span></span><span class="muted">${o === 'then' ? '' : esc(o)}</span><span class="rt-pin exec out" data-pin="exec" data-n="${esc(n.id)}" data-o="${esc(o)}" title="${esc(o)}"></span></div>`).join('')}
        ${Object.entries(fields).filter(([k]) => !(n.kind === 'tool' && k === 'tool')).map(([k, t]) => `<div class="rt-row"><span class="rt-pin in${refsIn(n.f[k]).length ? ' filled' : ''}" style="color:${PIN_TYPES[t].colour}" data-pin="field" data-n="${esc(n.id)}" data-k="${esc(k)}" data-t="${t}" title="${esc(PIN_TYPES[t].label)}"></span><span>${esc(k)}</span><span class="rt-val">${esc(short(n.f[k]))}</span></div>`).join('')}
        ${Object.entries(outs).map(([k, t]) => `<div class="rt-row"><span></span><span>${esc(k)}</span><span class="rt-pin out filled" style="color:${PIN_TYPES[t].colour}" data-pin="out" data-n="${esc(n.id)}" data-k="${esc(k)}" data-t="${t}" title="${esc(PIN_TYPES[t].label)}"></span></div>`).join('')}
      </div></div>`;
  }).join('');
  place();
  wires();
  side(problems);
  bar();
}
function place() { $('rtWorld').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.z})`; }

// Where a pin sits on the grid (world coordinates).
function pinAt(sel_) {
  const el = $('rtNodes').querySelector(sel_);
  if (!el) return null;
  const w = $('rtWorld').getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2 - w.left) / view.z, y: (r.top + r.height / 2 - w.top) / view.z };
}
const curve = (a, b) => { const dx = Math.max(40, Math.abs(b.x - a.x) / 2); return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`; };
const css = (s) => s.replace(/(["\\])/g, '\\$1');
function wires() {
  const out = [];
  const hot = hotEdges();
  for (const w of cur.wires) {
    const a = pinAt(`[data-pin="exec"][data-n="${css(w.from)}"][data-o="${css(w.out)}"]`), b = pinAt(`[data-pin="in"][data-n="${css(w.to)}"]`);
    if (!a || !b) continue;
    const s = sel.wire?.kind === 'exec' && sel.wire.from === w.from && sel.wire.out === w.out;
    out.push(`<path class="exec${s ? ' sel' : ''}${hot.has(`${w.from}>${w.to}`) ? ' hot' : ''}" stroke="${PIN_TYPES.exec.colour}" style="color:${PIN_TYPES.exec.colour}" d="${curve(a, b)}" data-wire="exec" data-from="${esc(w.from)}" data-o="${esc(w.out)}"></path>`);
  }
  for (const n of cur.nodes) {
    for (const k of Object.keys(fieldsOf(n))) {
      for (const r of refsIn(n.f[k])) {
        const src = cur.nodes.find((x) => x.id === r.node);
        const t = src && outsOf(src)[r.pin];
        if (!t) continue;
        const a = pinAt(`[data-pin="out"][data-n="${css(r.node)}"][data-k="${css(r.pin)}"]`), b = pinAt(`[data-pin="field"][data-n="${css(n.id)}"][data-k="${css(k)}"]`);
        if (!a || !b) continue;
        const s = sel.wire?.kind === 'data' && sel.wire.node === n.id && sel.wire.field === k && sel.wire.ref === `${r.node}.${r.pin}`;
        out.push(`<path class="${s ? 'sel' : ''}${hot.has(`${r.node}>${n.id}`) ? ' hot' : ''}" stroke="${PIN_TYPES[t].colour}" style="color:${PIN_TYPES[t].colour}" d="${curve(a, b)}" data-wire="data" data-node="${esc(n.id)}" data-k="${esc(k)}" data-ref="${esc(`${r.node}.${r.pin}`)}"></path>`);
      }
    }
  }
  if (drag?.ghost) out.push(`<path class="ghost" stroke="${drag.colour}" d="${drag.backwards ? curve(drag.to, drag.from) : curve(drag.from, drag.to)}"></path>`);
  $('rtWires').innerHTML = out.join('');
}

// The last run on the grid: which boxes ran, failed, or are running now; which wires carried something.
function runStates() {
  const m = new Map();
  if (!lastRun) return m;
  for (const s of lastRun.steps || []) m.set(s.node, s.ok ? 'ran' : 'failed');
  if (lastRun.status === 'running' && lastRun.at) m.set(lastRun.at, 'active');
  return m;
}
function hotEdges() {
  const s = new Set();
  if (!lastRun) return s;
  const steps = lastRun.steps || [];
  for (let i = 1; i < steps.length; i++) s.add(`${steps[i - 1].node}>${steps[i].node}`);
  // data wires whose source ran
  const ran = new Set(steps.map((x) => x.node));
  for (const n of cur?.nodes || []) for (const k of Object.keys(fieldsOf(n))) for (const r of refsIn(n.f[k])) if (ran.has(r.node) && ran.has(n.id)) s.add(`${r.node}>${n.id}`);
  return s;
}
const lastOut = (nodeId) => [...(lastRun?.steps || [])].reverse().find((s) => s.node === nodeId);

// ---------------------------------------------------------------------------------------------------------------
// The side panel: the picked box's fields, or the routine's problems, runs and versions
// ---------------------------------------------------------------------------------------------------------------
function side(problems = problemsNow()) {
  const el = $('rtSide');
  if (!cur) { el.innerHTML = '<h2>No routine yet</h2><p>Press <strong>New</strong> to make one. You build it here by placing boxes and wiring them up. Bob never makes or changes a routine himself.</p>'; return; }
  const one = sel.nodes.size === 1 ? cur.nodes.find((n) => sel.nodes.has(n.id)) : null;
  if (one) { el.innerHTML = nodePanel(one); return; }
  if (sel.wire) {
    const w = sel.wire;
    const val = w.kind === 'data' ? lastOut(w.ref.split('.')[0])?.out?.[w.ref.split('.')[1]] : null;
    el.innerHTML = `<h2>${w.kind === 'exec' ? 'A "then" wire' : `A ${esc(w.ref)} wire`}</h2><p class="muted">${w.kind === 'exec' ? `After ${esc(w.from)} (${esc(w.out)}), this runs next.` : `Carries ${esc(w.ref)} into ${esc(w.node)}'s ${esc(w.field)}.`} Press Delete to remove it.</p>
      ${w.kind === 'data' ? `<h3>What went through it last run</h3>${val === undefined || val === null ? '<p class="muted">Nothing yet. Run it or press Test.</p>' : `<div class="rt-out"><pre>${esc(Array.isArray(val) ? val.join('\n') : String(val))}</pre></div>`}` : ''}`;
    return;
  }
  const v = serverView?.routine;
  const on = v && v.on && !dirty();
  el.innerHTML = `<h2>${esc(cur.name)}</h2>
    <label class="rt-f"><span>What it's for (just for you)</span><textarea id="rtWhat" maxlength="600">${esc(cur.what || '')}</textarea></label>
    <p>${on ? '✅ On' : v?.approved && !dirty() ? 'Off (OK\'d, ready to switch on)' : v?.changedSinceOk || (v?.approved && dirty()) ? '⚠ Changed since your OK: it needs your OK again' : 'Off: needs your OK to run'}${v?.paused ? `<br><span class="warn-text">${esc(v.paused)}</span>` : ''}</p>
    ${say ? `<p class="muted" role="status">${esc(say)}</p>` : ''}
    <h3>Problems ${problems.length ? `(${problems.length})` : ''}</h3>
    ${problems.length ? `<ul class="rt-problems">${problems.map((p) => `<li data-goto="${esc(p.node)}">${p.node ? `<strong>${esc(p.node)}</strong>: ` : ''}${esc(p.text)}</li>`).join('')}</ul>` : '<p class="muted">None. It can be tested and switched on.</p>'}
    <h3>Runs</h3>
    ${serverView?.runs?.length ? `<ul class="rt-runs">${serverView.runs.slice(0, 15).map((r) => `<li><button type="button" class="link" data-run="${esc(r.id)}">${esc(new Date(r.startedAt).toLocaleString())}</button> ${r.status === 'done' ? '✓' : r.status === 'running' ? '…' : '✕'} ${r.dry ? '(test) ' : ''}<span class="muted">${r.steps} steps${r.error ? `: ${esc(r.error)}` : ''}</span></li>`).join('')}</ul>` : '<p class="muted">None yet.</p>'}
    <h3>Versions</h3>
    ${serverView?.versions?.length ? `<ul class="rt-versions">${serverView.versions.slice(0, 10).map((x, i) => `<li>Version ${x.n} <span class="muted">${x.at ? esc(new Date(x.at).toLocaleString()) : ''}, ${x.nodes} boxes</span> ${i === 0 ? '<span class="muted">(now)</span>' : `<button type="button" class="link" data-back="${x.n}">Go back to this</button>`}</li>`).join('')}</ul>` : '<p class="muted">Saved versions show here.</p>'}
    <h3>Results go to</h3><p class="muted">"Save to a file" boxes save in ${esc(all?.outFolder ? `${all.outFolder}${all.outFolder.includes('\\') ? '\\' : '/'}${cur.name}` : '')}.</p>
    <p><button type="button" id="rtDelete" class="link">Delete this routine…</button></p>`;
}
function nodePanel(n) {
  const def = NODES[n.kind] || {};
  const fields = fieldsOf(n);
  const before = cur.nodes.filter((x) => x.id !== n.id && (runsBefore(cur, x.id, n.id) || (x.kind === 'forEach' && insideEach(cur, x.id, n.id))));
  const values = before.flatMap((x) => Object.entries(outsOf(x)).filter(([pin]) => x.kind !== 'forEach' || insideEach(cur, x.id, n.id) || !['item', 'index'].includes(pin)).map(([pin, t]) => ({ ref: `{{${x.id}.${pin}}}`, label: `${x.id}.${pin}`, t })));
  const last = lastOut(n.id);
  const input = (k, t) => {
    const v = n.f[k] ?? '';
    const id = `f-${k}`;
    if (n.kind === 'tool' && k === 'tool') return `<select id="${id}" data-f="tool"><option value="">Pick a tool…</option>${Object.entries(ROUTINE_TOOLS).map(([name, x]) => `<option value="${esc(name)}" ${v === name ? 'selected' : ''} ${all?.tools?.[name]?.here === false ? 'disabled' : ''}>${esc(x.label)}${x.risk === 'look' ? '' : ' (changes things)'}</option>`).join('')}</select>`;
    if (n.kind === 'trigger.time' && k === 'type') return `<select id="${id}" data-f="type">${[['', 'Pick…'], ['once', 'Once'], ['daily', 'Every day'], ['weekly', 'Some days of the week'], ['interval', 'Every so many minutes']].map(([a, b]) => `<option value="${a}" ${v === a ? 'selected' : ''}>${b}</option>`).join('')}</select>`;
    if (n.kind === 'if' && k === 'test') return `<select id="${id}" data-f="test">${[['', 'Pick…'], ['contains', 'contains'], ['equals', 'equals'], ['empty', 'is empty'], ['notEmpty', 'is not empty'], ['yes', 'is yes'], ['more', 'is more than'], ['less', 'is less than']].map(([a, b]) => `<option value="${a}" ${v === a ? 'selected' : ''}>${b}</option>`).join('')}</select>`;
    if (n.kind === 'brain' && k === 'answer') return `<select id="${id}" data-f="answer"><option value="text" ${v !== 'yesno' ? 'selected' : ''}>Words</option><option value="yesno" ${v === 'yesno' ? 'selected' : ''}>Yes or no (for If)</option></select>`;
    if (t === 'yesno' && !refsIn(v).length) return `<label><input type="checkbox" id="${id}" data-f="${esc(k)}" ${v === true || v === 'true' ? 'checked' : ''}> yes</label>`;
    if (t === 'list') return `<input type="text" id="${id}" data-f="${esc(k)}" value="${esc(v)}" placeholder="Wire a list in" readonly>`;
    if (t === 'number' && !refsIn(v).length) return `<input type="number" id="${id}" data-f="${esc(k)}" value="${esc(v)}">`;
    return `<textarea id="${id}" data-f="${esc(k)}" rows="${['text', 'content', 'question', 'input'].includes(k) ? 3 : 1}" placeholder="${esc(hint(n, k))}">${esc(v)}</textarea>`;
  };
  return `<h2><span style="color:${colourOf(n)}">■</span> ${esc(label(n))} <span class="muted">${esc(n.id)}</span></h2>
    <p class="muted">${esc(n.kind === 'tool' && ROUTINE_TOOLS[n.f.tool] ? `${ROUTINE_TOOLS[n.f.tool].risk === 'look' ? 'Only looks; tried twice if it fails.' : 'Changes something; listed on the OK card, and never tried twice.'} ${def.what}` : def.what || '')}</p>
    ${Object.entries(fields).map(([k, t]) => `<label class="rt-f"><span>${esc(k)} <span style="color:${PIN_TYPES[t].colour}">●</span> ${esc(PIN_TYPES[t].label)}</span>${input(k, t)}</label>`).join('')}
    ${values.length ? `<h3>Values you can use here</h3><p class="muted">Click one to put it in the last field you were in, or drag a wire from its pin.</p><div class="rt-values">${values.map((x) => `<button type="button" data-ins="${esc(x.ref)}" style="border-color:${PIN_TYPES[x.t].colour}">${esc(x.label)}</button>`).join('')}</div>` : ''}
    <h3>Last run</h3>${last ? `<p>${last.ok ? '✓ Ran' : '✕ Failed'}${last.tries > 1 ? ` (${last.tries} tries)` : ''}${last.ms != null ? ` in ${(last.ms / 1000).toFixed(1)} s` : ''}${last.pin && last.pin !== 'then' ? `, went "${esc(last.pin)}"` : ''}</p>${last.error ? `<p class="warn-text">${esc(last.error)}</p>` : ''}${last.said ? `<p class="muted">${esc(last.said)}</p>` : ''}<div class="rt-out">${Object.entries(last.out || {}).map(([k, v]) => `<strong>${esc(k)}</strong><pre>${esc(Array.isArray(v) ? v.join('\n') : String(v))}</pre>`).join('')}</div>` : '<p class="muted">Not run yet.</p>'}
    <p><button type="button" data-dup>Copy this box</button> <button type="button" data-del class="link">Remove this box</button></p>`;
}
const hint = (n, k) => ({ at: '09:00', date: '2026-12-01', days: 'mon, thu', folder: 'C:\\Users\\you\\Downloads', pattern: '*.pdf', url: 'https://', find: 'Price', name: 'report.md', path: 'C:\\Users\\you\\Documents\\notes.txt', question: 'Does this need me today?', with: 'words to look for', action: n.f.tool === 'notice_board' ? 'add' : '' }[k] || '');

function bar() {
  const v = serverView?.routine;
  const has = Boolean(cur);
  for (const id of ['rtSave', 'rtTest', 'rtRun', 'rtOn', 'rtName', 'rtFit', 'rtAdd', 'rtUndo', 'rtRedo']) $(id).disabled = !has;
  if (!has) return;
  $('rtSave').textContent = dirty() ? 'Save •' : 'Save';
  $('rtUndo').disabled = !undo.length; $('rtRedo').disabled = !redo.length;
  const on = v?.on && !dirty();
  $('rtOn').textContent = on ? 'Switch off' : 'Switch on…';
  $('rtRun').disabled = !v?.approved || dirty() || !all?.on;
  $('rtRun').title = !all?.on ? 'The Routines Hand is off' : !v?.approved || dirty() ? 'It needs your OK first (Switch on…)' : 'Run it now';
  const running = lastRun?.status === 'running';
  $('rtStop').hidden = !running;
  $('rtState').textContent = running ? `Running: ${(() => { const n = cur.nodes.find((x) => x.id === lastRun.at); return n ? `${label(n)} (${n.id})` : '…'; })()}` : lastRun ? `${lastRun.dry ? 'Test run' : 'Last run'}: ${lastRun.status}${lastRun.error ? ` (${lastRun.error})` : ''}` : '';
}

// ---------------------------------------------------------------------------------------------------------------
// Adding, wiring, moving
// ---------------------------------------------------------------------------------------------------------------
function newId() { let i = 1; while (cur.nodes.some((n) => n.id === `n${i}`)) i++; return `n${i}`; }
function addNode(kind, at, f = {}) {
  change(() => {
    const id = newId();
    const n = { id, kind, x: Math.round(at.x / 10) * 10, y: Math.round(at.y / 10) * 10, f: { ...f } };
    if (kind === 'trigger.time') Object.assign(n.f, { type: 'daily', at: '09:00' });
    if (kind === 'if') n.f.test = 'contains';
    if (kind === 'brain') n.f.answer = 'text';
    // A trigger replaces the old one (one per routine), keeping its wires.
    if (isTrigger(kind)) { const old = cur.nodes.find((x) => isTrigger(x.kind)); if (old) { note(`A routine has one "Starts when" box, so this one took the place of "${label(old)}".`); cur.wires.forEach((w) => { if (w.from === old.id) w.from = id; }); cur.nodes = cur.nodes.filter((x) => x !== old); } }
    // Added from a dragged "then" wire: wire it straight in.
    if (menuFrom) { cur.wires = cur.wires.filter((w) => !(w.from === menuFrom.n && w.out === menuFrom.o)); if (NODES[kind]?.input !== false) cur.wires.push({ from: menuFrom.n, out: menuFrom.o, to: id }); }
    cur.nodes.push(n);
    sel = { nodes: new Set([id]), wire: null };
  });
}
function wireExec(from, out, to) {
  if (from === to) return note('A box can\'t be wired to itself.');
  if (NODES[cur.nodes.find((n) => n.id === to)?.kind]?.input === false) return note('Nothing can run into a "Starts when" box.');
  change(() => { cur.wires = cur.wires.filter((w) => !(w.from === from && w.out === out)); cur.wires.push({ from, out, to }); });
}
function wireData(srcId, pin, t, nodeId, field, ft) {
  if (srcId === nodeId) return note('A box can\'t feed itself.');
  if (!(ACCEPTS[ft] || ACCEPTS.text).includes(t)) return note(`That field takes ${PIN_TYPES[ft].label.toLowerCase()}, not ${PIN_TYPES[t].label.toLowerCase()}. Wires only join pins of a matching colour.`);
  change(() => { const n = cur.nodes.find((x) => x.id === nodeId); n.f[field] = `{{${srcId}.${pin}}}`; });
}
function removeSelected() {
  if (sel.wire) {
    const w = sel.wire;
    change(() => {
      if (w.kind === 'exec') cur.wires = cur.wires.filter((x) => !(x.from === w.from && x.out === w.out));
      else { const n = cur.nodes.find((x) => x.id === w.node); n.f[w.field] = String(n.f[w.field] || '').split(`{{${w.ref}}}`).join('').trim(); }
      sel.wire = null;
    });
    return;
  }
  if (!sel.nodes.size) return;
  change(() => {
    const gone = sel.nodes;
    cur.nodes = cur.nodes.filter((n) => !gone.has(n.id));
    cur.wires = cur.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to));
    for (const n of cur.nodes) for (const [k, v] of Object.entries(n.f)) if (typeof v === 'string') n.f[k] = v.replace(/\{\{\s*([A-Za-z0-9_-]+)\.[A-Za-z0-9_]+\s*\}\}/g, (m, id) => (gone.has(id) ? '' : m));
    sel = { nodes: new Set(), wire: null };
  });
}
function duplicate() {
  const n = cur.nodes.find((x) => sel.nodes.has(x.id));
  if (!n || isTrigger(n.kind)) return note(n ? 'One "Starts when" box per routine.' : '');
  change(() => { const id = newId(); cur.nodes.push({ ...n, id, x: n.x + 30, y: n.y + 30, f: { ...n.f } }); sel = { nodes: new Set([id]), wire: null }; });
}
let noteTimer = null;
function note(t) { if (!t) return; const tip = $('rtTip'); tip.textContent = t; tip.style.left = '12px'; tip.style.top = '12px'; tip.hidden = false; clearTimeout(noteTimer); noteTimer = setTimeout(() => { tip.hidden = true; }, 3500); }

// Pointer work on the grid.
let drag = null;
const worldPt = (e) => { const r = $('rtCanvas').getBoundingClientRect(); return { x: (e.clientX - r.left - view.x) / view.z, y: (e.clientY - r.top - view.y) / view.z }; };
function onDown(e) {
  if (e.button === 2) return;
  hideMenu();
  const pin = e.target.closest('[data-pin]');
  const head = e.target.closest('[data-drag]');
  const path = e.target.closest('path[data-wire]');
  if (path) {
    sel = { nodes: new Set(), wire: path.dataset.wire === 'exec' ? { kind: 'exec', from: path.dataset.from, out: path.dataset.o } : { kind: 'data', node: path.dataset.node, field: path.dataset.k, ref: path.dataset.ref } };
    draw(); return;
  }
  if (pin && cur) {
    e.preventDefault();
    const p = pinAt(`[data-pin="${pin.dataset.pin}"][data-n="${css(pin.dataset.n)}"]${pin.dataset.o ? `[data-o="${css(pin.dataset.o)}"]` : ''}${pin.dataset.k ? `[data-k="${css(pin.dataset.k)}"]` : ''}`);
    const t = pin.dataset.t || 'exec';
    drag = { kind: 'wire', pin: pin.dataset, from: p, to: p, ghost: true, colour: PIN_TYPES[t]?.colour || '#fff', backwards: pin.dataset.pin === 'in' || pin.dataset.pin === 'field' };
    $('rtCanvas').setPointerCapture(e.pointerId);
    return;
  }
  if (head && cur) {
    const id = head.dataset.drag;
    if (!sel.nodes.has(id)) sel = { nodes: e.shiftKey ? new Set([...sel.nodes, id]) : new Set([id]), wire: null };
    drag = { kind: 'move', start: worldPt(e), was: JSON.stringify(cur), at: cur.nodes.filter((n) => sel.nodes.has(n.id)).map((n) => ({ n, x: n.x, y: n.y })) };
    $('rtCanvas').setPointerCapture(e.pointerId);
    draw(); return;
  }
  const nodeEl = e.target.closest('[data-node]');
  if (nodeEl) { sel = { nodes: new Set([nodeEl.dataset.node]), wire: null }; draw(); return; }
  sel = { nodes: new Set(), wire: null };
  drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, vx: view.x, vy: view.y };
  $('rtCanvas').classList.add('panning');
  $('rtCanvas').setPointerCapture(e.pointerId);
  draw();
}
function onMove(e) {
  if (!drag) return;
  if (drag.kind === 'pan') { view.x = drag.vx + e.clientX - drag.sx; view.y = drag.vy + e.clientY - drag.sy; place(); return; }
  if (drag.kind === 'move') {
    const p = worldPt(e), dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    for (const a of drag.at) { a.n.x = Math.round((a.x + dx) / 10) * 10; a.n.y = Math.round((a.y + dy) / 10) * 10; const el = $('rtNodes').querySelector(`[data-node="${css(a.n.id)}"]`); if (el) { el.style.left = `${a.n.x}px`; el.style.top = `${a.n.y}px`; } }
    wires(); return;
  }
  if (drag.kind === 'wire') { drag.to = worldPt(e); wires(); }
}
function onUp(e) {
  const d = drag;
  drag = null;
  $('rtCanvas').classList.remove('panning');
  if (!d) return;
  if (d.kind === 'move') { const now = JSON.stringify(cur); if (now !== d.was) { undo.push(d.was); redo = []; } draw(); return; }
  if (d.kind !== 'wire') return;
  const el = document.elementFromPoint(e.clientX, e.clientY);
  const pin = el?.closest('[data-pin]');
  const nodeEl = el?.closest('[data-node]');
  const a = d.pin;
  wires();
  // exec out -> a box (its in pin, or anywhere on it)
  if (a.pin === 'exec') {
    const to = pin?.dataset.pin === 'in' ? pin.dataset.n : nodeEl?.dataset.node;
    if (to) return wireExec(a.n, a.o, to);
    menuFrom = { n: a.n, o: a.o }; // dropped on empty grid: pick a box to add, wired in
    return showMenu(e.clientX, e.clientY);
  }
  if (a.pin === 'in' && pin?.dataset.pin === 'exec') return wireExec(pin.dataset.n, pin.dataset.o, a.n);
  if (a.pin === 'out' && pin?.dataset.pin === 'field') return wireData(a.n, a.k, a.t, pin.dataset.n, pin.dataset.k, pin.dataset.t);
  if (a.pin === 'field' && pin?.dataset.pin === 'out') return wireData(pin.dataset.n, pin.dataset.k, pin.dataset.t, a.n, a.k, a.t);
  if (pin) note('Those two pins don\'t join. White pins join white pins; coloured pins join a field that takes that colour.');
}
function zoom(e) {
  e.preventDefault();
  const r = $('rtCanvas').getBoundingClientRect(), mx = e.clientX - r.left, my = e.clientY - r.top;
  const z = Math.min(2, Math.max(0.3, view.z * (e.deltaY < 0 ? 1.1 : 1 / 1.1)));
  view.x = mx - (mx - view.x) * (z / view.z); view.y = my - (my - view.y) * (z / view.z); view.z = z;
  place(); wires();
}
function fit() {
  if (!cur?.nodes.length) return;
  const c = $('rtCanvas').getBoundingClientRect();
  const xs = cur.nodes.map((n) => n.x), ys = cur.nodes.map((n) => n.y);
  const w = Math.max(...xs) - Math.min(...xs) + 300, h = Math.max(...ys) - Math.min(...ys) + 220;
  view.z = Math.max(0.3, Math.min(1.2, Math.min(c.width / w, c.height / h)));
  view.x = 30 - Math.min(...xs) * view.z; view.y = 30 - Math.min(...ys) * view.z;
  place(); wires();
}

// The add menu (right-click, ＋ Add, or a "then" wire dropped on empty grid).
let menuAt = { x: 0, y: 0 }, menuFrom = null, menuItems = [];
function showMenu(cx, cy) {
  if (!cur) return;
  const r = $('rtCanvas').getBoundingClientRect();
  menuAt = worldPt({ clientX: cx, clientY: cy });
  const m = $('rtMenu');
  m.style.left = `${Math.min(cx - r.left, r.width - 270)}px`; m.style.top = `${Math.min(cy - r.top, r.height - 370)}px`;
  m.hidden = false;
  $('rtMenuFind').value = '';
  fillMenu('');
  $('rtMenuFind').focus();
}
function hideMenu() { $('rtMenu').hidden = true; menuFrom = null; }
function fillMenu(q) {
  const w = q.trim().toLowerCase();
  const items = [];
  for (const [g, def] of Object.entries(GROUPS)) {
    const here = [];
    for (const [kind, n] of Object.entries(NODES)) {
      if (n.group !== g) continue;
      if (kind === 'tool') { for (const [t, x] of Object.entries(ROUTINE_TOOLS)) if (all?.tools?.[t]?.here !== false) here.push({ kind, f: { tool: t }, label: x.label, what: `${x.risk === 'look' ? 'Looks' : 'Changes something'}` }); }
      else here.push({ kind, f: {}, label: n.label, what: n.what });
    }
    const hit = here.filter((x) => !w || `${x.label} ${x.what}`.toLowerCase().includes(w));
    if (hit.length) items.push({ grp: def.label, colour: def.colour }, ...hit.map((x) => ({ ...x, colour: def.colour })));
  }
  menuItems = items.filter((x) => !x.grp);
  let i = 0;
  $('rtMenuList').innerHTML = items.map((x) => (x.grp ? `<li class="grp">${esc(x.grp)}</li>` : `<li data-mi="${i++}" title="${esc(x.what)}"><span class="dot" style="background:${x.colour}"></span>${esc(x.label)}</li>`)).join('') || '<li class="grp">Nothing matches</li>';
  $('rtMenuList').querySelector('[data-mi]')?.classList.add('on');
}

// ---------------------------------------------------------------------------------------------------------------
// Test, Run now, switching on, following a run live
// ---------------------------------------------------------------------------------------------------------------
async function runIt(test) {
  if (dirty()) await save();
  if (problemsNow().length) { say = 'Fix the problems first (the red marks).'; draw(); return; }
  try {
    const got = await api('/api/routines', test ? { test: cur.id } : { runNow: cur.id });
    if (got.queued) { say = `It's already running; this run waits its turn (${got.queued} waiting).`; draw(); return; }
    if (got.run) { lastRun = got.run; draw(); follow(got.run.id); }
  } catch (e) { say = e.message; draw(); }
}
function follow(runId) {
  clearInterval(polling);
  const id = cur.id;
  polling = setInterval(async () => {
    if (cur?.id !== id) { clearInterval(polling); return; }
    try {
      lastRun = await api(`/api/routines?id=${encodeURIComponent(id)}&run=${encodeURIComponent(runId)}`);
      if (lastRun.status !== 'running') { clearInterval(polling); serverView = await api(`/api/routines?id=${encodeURIComponent(id)}`); }
      draw();
    } catch { clearInterval(polling); }
  }, 700);
}
function okCard() {
  const v = serverView?.routine;
  const card = $('rtCard').firstElementChild;
  card.innerHTML = `<h2 id="rtCardTitle">Switch on "${esc(v.name)}"?</h2>
    <p>Once it's on, these steps run by themselves${v.starts ? `, ${esc(v.starts)}` : ''}, without asking each time. Nothing else can run: change a box or a wire and it needs your OK again.</p>
    <ul>${v.lines.map((l) => `<li class="${l.kind === 'change' ? 'change' : ''}">${esc(l.text)}${l.data ? ' <strong>(the target comes from earlier in the run)</strong>' : ''}</li>`).join('')}</ul>
    <p class="muted">The Hands these steps use must be on too, and the hard limits still apply (allowed folders, Recycle Bin only, secret files...). ${all?.on ? '' : 'The Routines Hand itself is off: switch it on in Settings, Hands, for it to run.'}</p>
    <div class="row"><button type="button" data-card="no">Cancel</button><button type="button" data-card="yes" class="big">OK, switch it on</button></div>`;
  $('rtCard').hidden = false;
  card.querySelector('[data-card="yes"]').focus();
}

// ---------------------------------------------------------------------------------------------------------------
// Events
// ---------------------------------------------------------------------------------------------------------------
const canvas = $('rtCanvas');
canvas.addEventListener('pointerdown', onDown);
canvas.addEventListener('pointermove', onMove);
canvas.addEventListener('pointerup', onUp);
canvas.addEventListener('wheel', zoom, { passive: false });
canvas.addEventListener('contextmenu', (e) => { if (e.target.closest('.rt-menu')) return; e.preventDefault(); menuFrom = null; showMenu(e.clientX, e.clientY); });
canvas.addEventListener('pointermove', (e) => {
  const tip = $('rtTip');
  const path = e.target.closest?.('path[data-wire="data"]');
  if (!path || drag) { if (!noteTimer || tip.dataset.wire) { tip.hidden = true; tip.dataset.wire = ''; } return; }
  const [n, p] = path.dataset.ref.split('.');
  const v = lastOut(n)?.out?.[p];
  if (v === undefined) return;
  const r = canvas.getBoundingClientRect();
  tip.textContent = `${path.dataset.ref}: ${Array.isArray(v) ? v.join('\n') : String(v)}`.slice(0, 600);
  tip.style.left = `${e.clientX - r.left + 12}px`; tip.style.top = `${e.clientY - r.top + 12}px`;
  tip.dataset.wire = '1'; tip.hidden = false;
});
$('rtMenuFind').addEventListener('input', (e) => fillMenu(e.target.value));
$('rtMenuFind').addEventListener('keydown', (e) => {
  const lis = [...$('rtMenuList').querySelectorAll('[data-mi]')];
  const i = lis.findIndex((l) => l.classList.contains('on'));
  if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); lis[i]?.classList.remove('on'); const j = Math.max(0, Math.min(lis.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))); lis[j]?.classList.add('on'); lis[j]?.scrollIntoView({ block: 'nearest' }); }
  if (e.key === 'Enter' && lis[i]) { const it = menuItems[Number(lis[i].dataset.mi)]; addNode(it.kind, menuAt, it.f); hideMenu(); }
  if (e.key === 'Escape') hideMenu();
});
$('rtMenuList').addEventListener('click', (e) => { const li = e.target.closest('[data-mi]'); if (!li) return; const it = menuItems[Number(li.dataset.mi)]; addNode(it.kind, menuAt, it.f); hideMenu(); });

let lastField = null;
$('rtSide').addEventListener('focusin', (e) => { if (e.target.dataset.f) lastField = e.target.dataset.f; });
$('rtSide').addEventListener('change', (e) => {
  const t = e.target;
  if (t.id === 'rtWhat') return change(() => { cur.what = t.value; });
  const n = cur?.nodes.find((x) => sel.nodes.has(x.id));
  if (!n || !t.dataset.f) return;
  const k = t.dataset.f;
  const ft = fieldsOf(n)[k];
  change(() => {
    if (t.type === 'checkbox') n.f[k] = t.checked;
    else if (ft === 'number' && t.type === 'number') n.f[k] = t.value === '' ? '' : Number(t.value);
    else n.f[k] = t.value;
    if (k === 'tool') for (const key of Object.keys(n.f)) if (key !== 'tool' && !(key in (ROUTINE_TOOLS[t.value]?.fields || {}))) delete n.f[key];
  });
});
$('rtSide').addEventListener('click', async (e) => {
  const b = e.target.closest('button, li[data-goto]');
  if (!b) return;
  if (b.dataset.goto) { if (b.dataset.goto) { sel = { nodes: new Set([b.dataset.goto]), wire: null }; draw(); } return; }
  if (b.dataset.ins !== undefined) {
    const n = cur.nodes.find((x) => sel.nodes.has(x.id));
    const k = lastField && lastField in fieldsOf(n) ? lastField : Object.keys(fieldsOf(n)).find((f) => !(n.kind === 'tool' && f === 'tool'));
    if (!k) return;
    const ft = fieldsOf(n)[k];
    const ref = b.dataset.ins;
    const [src, pin] = ref.slice(2, -2).split('.');
    const t = outsOf(cur.nodes.find((x) => x.id === src))[pin];
    if (!(ACCEPTS[ft] || ACCEPTS.text).includes(t)) return note(`"${k}" takes ${PIN_TYPES[ft].label.toLowerCase()}, not ${PIN_TYPES[t].label.toLowerCase()}.`);
    change(() => { n.f[k] = ft === 'text' && typeof n.f[k] === 'string' && n.f[k] && ['text', 'content', 'question', 'input', 'url', 'name', 'with'].includes(k) ? `${n.f[k]}${ref}` : ref; });
    return;
  }
  if (b.dataset.del !== undefined) return removeSelected();
  if (b.dataset.dup !== undefined) return duplicate();
  if (b.dataset.run) { const r = await api(`/api/routines?id=${encodeURIComponent(cur.id)}&run=${encodeURIComponent(b.dataset.run)}`); lastRun = r; draw(); if (r.status === 'running') follow(r.id); return; }
  if (b.dataset.back) {
    if (!confirm(`Go back to version ${b.dataset.back}? What you have now stays in the list as a version.`)) return;
    try { await api('/api/routines', { rollback: cur.id, version: Number(b.dataset.back) }); saved = ''; cur = null; await loadAll(); } catch (err) { say = err.message; draw(); }
    return;
  }
  if (b.id === 'rtDelete') {
    if (!confirm(`Delete the routine "${cur.name}"? Its runs and versions go too.`)) return;
    try { await api('/api/routines', { remove: cur.id }); saved = JSON.stringify(cur); cur = null; history.replaceState(null, '', location.pathname); await loadAll(); } catch (err) { say = err.message; draw(); }
  }
});
$('rtCard').addEventListener('click', async (e) => {
  const b = e.target.closest('[data-card]');
  if (!b && e.target !== $('rtCard')) return;
  $('rtCard').hidden = true;
  if (b?.dataset.card !== 'yes') return;
  try { const got = await api('/api/routines', { approve: cur.id, hash: serverView.routine.hash }); serverView = { ...serverView, routine: got.routine }; say = 'On, with your OK.'; await loadAll(cur.id); } catch (err) { say = err.message; draw(); }
});
$('rtPick').addEventListener('change', (e) => { if (e.target.value) open(e.target.value).catch((err) => note(err.message)); });
$('rtNew').addEventListener('click', async () => {
  if (dirty() && !confirm('Leave without saving your changes?')) return;
  saved = JSON.stringify(cur);
  // (No prompt box: Bob.exe has none. Type its name in the box next to New.)
  try { const got = await api('/api/routines', { create: 'New routine' }); cur = null; await loadAll(got.routine.id); $('rtName').select(); } catch (err) { note(err.message); }
});
$('rtName').addEventListener('change', (e) => { if (cur) change(() => { cur.name = e.target.value.trim().slice(0, 80) || 'Routine'; }); });
$('rtSave').addEventListener('click', save);
$('rtTest').addEventListener('click', () => runIt(true));
$('rtRun').addEventListener('click', () => runIt(false));
$('rtStop').addEventListener('click', async () => { try { await api('/api/routines', { stop: cur.id }); } catch (err) { note(err.message); } });
$('rtOn').addEventListener('click', async () => {
  const v = serverView?.routine;
  if (v?.on && !dirty()) { try { const got = await api('/api/routines', { id: cur.id, on: false }); serverView.routine = got.routine; say = 'Off.'; await loadAll(cur.id); } catch (err) { say = err.message; draw(); } return; }
  if (dirty()) await save();
  if (serverView.routine.problems.length) { say = 'Fix the problems first (the red marks).'; draw(); return; }
  if (serverView.routine.approved) { try { await api('/api/routines', { id: cur.id, on: true }); await loadAll(cur.id); } catch (err) { say = err.message; draw(); } return; }
  okCard();
});
$('rtUndo').addEventListener('click', () => { if (!undo.length) return; redo.push(JSON.stringify(cur)); cur = JSON.parse(undo.pop()); sel = { nodes: new Set(), wire: null }; draw(); });
$('rtRedo').addEventListener('click', () => { if (!redo.length) return; undo.push(JSON.stringify(cur)); cur = JSON.parse(redo.pop()); sel = { nodes: new Set(), wire: null }; draw(); });
$('rtFit').addEventListener('click', fit);
$('rtAdd').addEventListener('click', () => { const r = canvas.getBoundingClientRect(); menuFrom = null; showMenu(r.left + 60, r.top + 60); });
document.addEventListener('keydown', (e) => {
  const typing = /INPUT|TEXTAREA|SELECT/.test(document.activeElement?.tagName || '');
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); save(); return; }
  if (typing) return;
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); $('rtUndo').click(); }
  else if ((e.ctrlKey || e.metaKey) && (e.key.toLowerCase() === 'y' || (e.shiftKey && e.key.toLowerCase() === 'z'))) { e.preventDefault(); $('rtRedo').click(); }
  else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'd') { e.preventDefault(); duplicate(); }
  else if (e.key === 'Delete' || e.key === 'Backspace') { e.preventDefault(); removeSelected(); }
  else if (e.key === 'Escape') { hideMenu(); sel = { nodes: new Set(), wire: null }; draw(); }
});
window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
window.addEventListener('resize', () => wires());

loadAll().catch((e) => { $('rtSide').innerHTML = `<p class="warn-text">${esc(e.message)}</p>`; });
export { graphHash };
