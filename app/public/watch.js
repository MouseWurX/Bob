// 🧪 aiFEUI: the viewer window. Plays an expert recording (public/lab-watch-math.js has the format) as a 3D
// block of voxels (public/watch-view.js): one floor for each layer, experts coloured by the skill they lean to,
// around a grey core of the parts that are not experts, glowing as the brain reads each word. Tick boxes show or
// hide each skill's experts; three zoom levels (the whole brain, one floor, one expert); Save as a video.
// Its own window, so it can sit beside the Lab or a chat. The Lab opens it with ?brain=<id>&rec=<id>; it can also
// open a recording file by itself (one made on another Bob, or on a rented card), with the Lab off.
import { applySavedStyle } from './themes.js';
import { NAME, cleanRecording, specialise, timeline, inWords, expertDetail, lookOf, LEANS, partOf, PART_LABEL } from './lab-watch-math.js';
import { createView, GREY } from './watch-view.js';
applySavedStyle();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const still = () => document.body.classList.contains('still') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const view = createView($('watchCanvas'));
const SPECIAL = /<\|[^|>]*\|>|<\/?think>/gi; // the chat layout's own markers, left out of the caption

let rec = null, sp = null, parts = null, frames = [], t = 0, playing = false, speed = 8, only = '', hidden = new Set(), mode = 'brain', floor = 0, expert = 0, spin = false, spinSpeed = 0.25, aim = null, need = true, lastIdx = -1, lastLit = [], recorder = null;

function say(msg) { const m = $('watchMsg'); m.textContent = msg || ''; m.hidden = !msg; }

function load(j) {
  rec = cleanRecording(j); parts = j.parts && Array.isArray(j.parts.layers) ? j.parts : null;
  sp = specialise(rec);
  view.setData(rec, sp, parts);
  hidden = new Set(); only = ''; t = 0; playing = false; mode = 'brain'; floor = 0; expert = 0; lastIdx = -1;
  frames = timeline(rec);
  document.title = `${NAME}: ${rec.brain.name}`;
  $('watchTitle').textContent = rec.name || rec.brain.name;
  const lay = view.layout();
  $('watchSub').textContent = `${rec.brain.name}${rec.when ? `, recorded ${rec.when}` : ''}. ${rec.brain.layers} floors (layers) of ${rec.brain.experts} experts${rec.brain.used ? `, ${rec.brain.used} picked for each word` : ''}.${lay.expertShare ? ` Experts are ${Math.round(lay.expertShare * 100)}% of the brain's weights; the grey core and base are the rest.` : ''}`;
  $('watchEmpty').hidden = true; $('watchControls').hidden = false; $('watchPlayer').hidden = false; $('watchSave').hidden = false;
  $('watchFloor').max = rec.brain.layers; $('watchExpert').max = rec.brain.experts - 1;
  $('watchOnly').innerHTML = `<option value="">every skill</option>${rec.skills.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}`;
  skillsHtml(); wordsHtml(); setMode('brain'); seek(0); say('');
}

function skillsHtml() {
  const never = sp.total - sp.used;
  const row = (key, sw, label, n, title) => `<label class="watch-skill" title="${esc(title)}"><input type="checkbox" data-show="${esc(String(key))}" ${hidden.has(key) ? '' : 'checked'}> ${sw} <span>${esc(label)}</span><span class="n">${n}</span></label>`;
  $('watchSkills').innerHTML = `<legend>Show these</legend>${rec.skills.map((s, i) => row(i, `<span class="sw" style="background:${lookOf(i)[0]}">${lookOf(i)[1]}</span>`, s.label, sp.top.reduce((a, l) => a + l.filter((x) => x === i).length, 0).toLocaleString(), `Experts picked most often for ${s.label}. ${sp.per[i].leans.toLocaleString()} of them lean to it clearly.`)).join('')}
    ${row('grey', `<span class="sw" style="background:${GREY}"></span>`, 'Not experts', '', 'Attention, the router, the tuning rows and the word tables: every word passes through these.')}
    ${row('never', '<span class="sw never"></span>', 'Never picked', never.toLocaleString(), 'Experts none of these questions woke. A wider set of questions would wake more of them.')}`;
}

function wordsHtml() {
  const lines = inWords(rec, sp);
  lines.push('The stronger an expert\'s colour, the more it is that skill\'s own. A faint one is shared by several skills, and its colour only says which used it a little more.');
  if (parts) {
    const k = parts.kinds || {}, all = (parts.outside || 0) + parts.layers.reduce((a, p) => a + p.experts + p.other, 0) || 1;
    const pc = (n) => `${Math.max(0.1, Math.round((1000 * (n || 0)) / all) / 10)}%`;
    lines.push(`Not experts, the grey parts, by share of the weights: attention ${pc(k.attention)}, the router that picks experts ${pc(k.router)}, tuning rows ${pc(k.norms)}, the word tables ${pc(k.tables)}${k.rest ? `, the rest ${pc(k.rest)}` : ''}. Every word passes through all of them, so none can be cut out.`);
    if (view.layout().baseCapped) lines.push('The word tables are bigger than the base shows: it is capped at two floors so the block stays readable.');
  } else lines.push('This recording doesn\'t say how big the parts that are not experts are, so the grey core isn\'t drawn.');
  lines.push('A few questions for each skill show the pattern; they don\'t measure the brain. Record more questions for a steadier picture.');
  $('watchWords').innerHTML = lines.map((l) => `<li>${esc(l)}</li>`).join('');
}

// ---- time ----
function retime() { const keep = frames[Math.floor(t)]; frames = timeline(rec, { skills: only ? new Set([only]) : null }); const at = keep ? frames.findIndex((f) => f.clip === keep.clip && f.word === keep.word) : -1; t = at >= 0 ? at : 0; $('watchScrub').max = Math.max(0, frames.length - 1); lastIdx = -1; need = true; }
function seek(i) { t = Math.max(0, Math.min(frames.length - 1, i)); $('watchScrub').max = Math.max(0, frames.length - 1); lastIdx = -1; need = true; }
function setPlaying(on) { playing = on && frames.length > 1; if (playing && t >= frames.length - 1) t = 0; $('watchPlay').textContent = playing ? 'Pause' : 'Play'; need = true; }
function jumpClip(dir) {
  const cur = frames[Math.floor(t)]; if (!cur) return;
  let i = Math.floor(t);
  if (dir < 0) { while (i > 0 && frames[i - 1].clip === cur.clip) i--; if (i === Math.floor(t) && i > 0) { const c = frames[i - 1].clip; i--; while (i > 0 && frames[i - 1].clip === c) i--; } }
  else { while (i < frames.length - 1 && frames[i].clip === cur.clip) i++; }
  seek(i);
}

function frameBits(i) {
  const f = frames[i]; if (!f) return null;
  const c = rec.clips[f.clip], si = rec.skills.findIndex((s) => s.id === c.skill);
  return { f, c, si };
}

function caption(i) {
  const b = frameBits(i); if (!b) return;
  const { f, c, si } = b, [color, letter] = lookOf(si);
  const reading = f.word < c.prompt;
  const clean = (s) => s.replace(SPECIAL, '');
  const pt = partOf(c, f.word), label = PART_LABEL[pt.part];
  const before = c.words.slice(pt.from, f.word).map(clean).join(''), now = clean(c.words[f.word]);
  const end = f.word === c.e.length - 1 && !reading ? c.last : '';
  view.setCaption({ title: `${letter} ${rec.skills[si].label}: ${c.question}`, color, text: `${label}: ${(before + now + end).replace(/\s+/g, ' ').trim()}` });
  $('watchCaption').innerHTML = `<span class="q"><strong>${esc(letter)} ${esc(rec.skills[si].label)}:</strong> ${esc(c.question)}</span><br><em>${esc(label)}:</em> ${esc(before)}<span class="wnow">${esc(now) || '·'}</span>${esc(end)}`;
  const picks = c.e[f.word].reduce((a, l) => a + l.length, 0);
  $('watchStatus').textContent = `Word ${i + 1} of ${frames.length}. Question ${f.clip + 1} of ${rec.clips.length}. ${picks} experts picked for this word.`;
  const sc = $('watchScrub'); sc.value = String(i); sc.setAttribute('aria-valuetext', `Word ${i + 1} of ${frames.length}: ${now.trim() || 'a marker'}, in a question about ${rec.skills[si].label}`);
}

function litFor(i, frac) {
  const out = [], cur = frames[i]; if (!cur) return out;
  for (let k = 5; k >= 0; k--) { const f = frames[i - k]; if (!f || f.clip !== cur.clip) continue; out.push({ e: rec.clips[f.clip].e[f.word], age: k === 0 ? 0 : Math.min(1, (k + frac) / 6) }); }
  return out;
}

// ---- the three zoom levels ----
function setMode(m) {
  mode = m; $('watchZoom').value = m;
  $('watchPick').hidden = m === 'brain'; $('watchExpertLbl').hidden = m !== 'expert';
  $('watchCanvas').hidden = m === 'floor'; $('watchFloorView').hidden = m !== 'floor'; $('watchExpertView').hidden = m !== 'expert';
  $('watchVideo').disabled = m === 'floor';
  view.set({ picked: m === 'expert' ? { layer: floor, expert } : null });
  if (m === 'floor') floorHtml();
  if (m === 'expert') expertHtml();
  lastIdx = -1; need = true;
}

function floorHtml() {
  const lay = view.layout(), l = floor;
  const cells = [];
  for (let i = 0; i < lay.W * lay.D; i++) {
    const e = lay.cellExpert[i];
    if (e >= 0) {
      const top = sp.top[l][e], off = top >= 0 ? hidden.has(top) : hidden.has('never');
      const st = Math.round(100 * (sp.strength[l][e] || 0));
      const label = top < 0 ? `Expert ${e}: never picked` : `Expert ${e}: ${rec.skills[top].label}, ${st >= LEANS * 100 ? `leans to it (${st} out of 100)` : 'shared with the other skills'}, picked ${sp.picks[l][e]} times`;
      cells.push(`<button type="button" class="watch-cell${off ? ' off' : ''}" data-cell="${e}" aria-label="${esc(label)}" title="${esc(label)}">${top >= 0 ? `<span class="bg" style="background:${lookOf(top)[0]};opacity:${(0.2 + 0.8 * Math.min(1, sp.strength[l][e] * 1.6)).toFixed(2)}"></span>` : ''}<span class="tx">${e}${top >= 0 ? `<br>${lookOf(top)[1]}` : ''}</span></button>`);
    } else if (lay.coreRank[i] >= 0 && lay.grey[l] > 0) cells.push(`<div class="watch-cell core${hidden.has('grey') ? ' off' : ''}" title="Not an expert: attention, the router and the tuning rows"></div>`);
    else cells.push('<div></div>');
  }
  $('watchFloorView').innerHTML = `<h2>Floor ${l + 1} of ${rec.brain.layers} <span class="muted">(layer ${l})</span></h2>
    <p class="muted">Every square is one expert, with its number and its skill's letter; the grey squares in the middle are not experts. A white outline means it's picked for the word being read. Press a square to look at that expert.</p>
    <div class="watch-grid" style="grid-template-columns:repeat(${lay.W},minmax(0,1fr))">${cells.join('')}</div>`;
  lastLit = [];
}

function expertHtml() {
  const d = expertDetail(rec, sp, floor, expert);
  const top = d.top >= 0 ? rec.skills[d.top] : null;
  $('watchExpertView').innerHTML = `<h2>Expert ${d.expert} on floor ${d.layer + 1} <span class="muted">(layer ${d.layer})</span></h2>
    ${d.picks ? `<p>Picked ${d.picks.toLocaleString()} times in this recording. ${top ? (d.strength >= LEANS ? `It leans to <strong>${esc(top.label)}</strong> (${Math.round(d.strength * 100)} out of 100, where 100 means only that skill ever used it).` : `The skills share it about evenly; <strong>${esc(top.label)}</strong> used it a little more.`) : ''}</p>
    ${d.shares.map((s) => `<div class="watch-bar"><span>${esc(lookOf(s.skill)[1])} ${esc(rec.skills[s.skill].label)}</span><span class="track"><span class="fill" style="width:${s.pct}%;background:${lookOf(s.skill)[0]}"></span></span><span class="pc">${s.pct}%</span></div>`).join('')}
    <p><strong>Words it was picked for most:</strong> ${d.words.map((w) => `<code>${esc(w.text.replace(SPECIAL, '(marker)')) || '(space)'}</code> ${w.n}`).join(', ') || 'none'}.</p>` : '<p>None of these questions picked this expert. A wider set of questions might.</p>'}`;
}

function markFloor(i) {
  const b = frameBits(i); if (!b) return;
  const ids = b.c.e[b.f.word][floor] || [];
  const root = $('watchFloorView');
  for (const e of lastLit) root.querySelector(`[data-cell="${e}"]`)?.classList.remove('lit');
  for (const e of ids) root.querySelector(`[data-cell="${e}"]`)?.classList.add('lit');
  lastLit = ids;
}

// ---- the loop ----
let lastTime = 0;
function tick(now) {
  const dt = Math.min(0.1, (now - lastTime) / 1000 || 0); lastTime = now;
  if (playing) {
    t += dt * speed;
    if (t >= frames.length - 1) { t = frames.length - 1; setPlaying(false); if (recorder) stopVideo(); }
    need = true;
  }
  if (aim) { const g = view.get(), k = Math.min(1, dt * 7), dy = aim.yaw - g.yaw, dt2 = aim.tilt - g.tilt; if (Math.abs(dy) + Math.abs(dt2) < 0.004) { view.set({ yaw: aim.yaw, tilt: aim.tilt }); aim = null; } else view.set({ yaw: g.yaw + dy * k, tilt: g.tilt + dt2 * k }); need = true; } // glide to the side that was picked
  if (spin && !still() && mode !== 'floor') { view.set({ yaw: view.get().yaw + dt * spinSpeed }); need = true; }
  if (need && rec) {
    need = false;
    const i = Math.floor(t), frac = playing ? t - i : 0;
    if (i !== lastIdx) { lastIdx = i; caption(i); if (mode === 'floor') markFloor(i); }
    if (mode !== 'floor') view.draw(litFor(i, frac));
  }
  requestAnimationFrame(tick);
}

// ---- a video of it ----
function startVideo() {
  const canvas = $('watchCanvas');
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
  if (!canvas.captureStream || !type) { say('This browser can\'t save a video of the picture. On a computer, Bob\'s own window and the usual browsers can.'); return; }
  const chunks = [];
  recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: 6e6 });
  recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
  recorder.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: type.split(';')[0] }));
    a.download = `${(rec.brain.name || 'brain').replace(/[^\w.-]+/g, '-')}-experts.${type.includes('mp4') ? 'mp4' : 'webm'}`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
    recorder = null; $('watchVideo').textContent = 'Save as a video';
  };
  seek(0); recorder.start(); setPlaying(true);
  $('watchVideo').textContent = 'Stop and save the video';
}
function stopVideo() { try { recorder?.stop(); } catch {} setPlaying(false); }

// ---- controls ----
$('watchSkills').addEventListener('change', (ev) => {
  const k = ev.target.dataset.show; if (k === undefined) return;
  const key = k === 'grey' || k === 'never' ? k : Number(k);
  if (ev.target.checked) hidden.delete(key); else hidden.add(key);
  view.set({ hidden }); if (mode === 'floor') floorHtml(); lastIdx = -1; need = true;
});
$('watchAll').onclick = () => { hidden = new Set(); view.set({ hidden }); skillsHtml(); if (mode === 'floor') floorHtml(); need = true; };
$('watchNone').onclick = () => { hidden = new Set([...rec.skills.keys(), ...['grey', 'never'].filter((k) => hidden.has(k))]); view.set({ hidden }); skillsHtml(); if (mode === 'floor') floorHtml(); need = true; };
$('watchZoom').onchange = (ev) => setMode(ev.target.value);
$('watchFloor').onchange = (ev) => { const was = floor; floor = Math.max(0, Math.min(rec.brain.layers - 1, (Number(ev.target.value) || 1) - 1)); ev.target.value = floor + 1; if (floor !== was) setMode(mode); };
$('watchExpert').onchange = (ev) => { const was = expert; expert = Math.max(0, Math.min(rec.brain.experts - 1, Number(ev.target.value) || 0)); ev.target.value = expert; if (expert !== was) setMode(mode); };
$('watchFloorView').addEventListener('click', (ev) => { const b = ev.target.closest('[data-cell]'); if (!b) return; expert = Number(b.dataset.cell); $('watchExpert').value = expert; setMode('expert'); $('watchExpertView').focus?.(); });
$('watchGap').oninput = (ev) => { view.set({ gap: Number(ev.target.value) }); need = true; };
const turn = (dy, dt_) => { const g = view.get(); view.set({ yaw: g.yaw + dy, tilt: g.tilt + dt_ }); need = true; };
$('watchLeft').onclick = () => turn(-0.2, 0); $('watchRight').onclick = () => turn(0.2, 0); $('watchUp').onclick = () => turn(0, 0.1); $('watchDown').onclick = () => turn(0, -0.1);
$('watchIn').onclick = () => { view.set({ zoom: view.get().zoom * 1.25 }); need = true; }; $('watchOut').onclick = () => { view.set({ zoom: view.get().zoom / 1.25 }); need = true; };
const flip = (b, on) => { b.setAttribute('aria-checked', String(on)); b.querySelector('.st').textContent = on ? 'On' : 'Off'; };
$('watchSpin').onclick = (ev) => { if (still()) { say('Animations are off (Style, or this device\'s reduce-motion setting), so the block stays still. The turn buttons still work.'); return; } spin = !spin; flip(ev.currentTarget, spin); };
$('watchSpinSpeed').oninput = (ev) => { spinSpeed = Number(ev.target.value) || 0.25; };
const FACES = { corner: [-0.62, 0.5], front: [0, 0.12], side: [Math.PI / 2, 0.12], back: [Math.PI, 0.12], top: [-0.62, 1.15] };
$('watchFace').onchange = (ev) => { const v = FACES[ev.target.value]; if (!v) return; if (spin) { spin = false; flip($('watchSpin'), false); } if (still()) { view.set({ yaw: v[0], tilt: v[1] }); } else { const g = view.get(); const turns = Math.round((g.yaw - v[0]) / (2 * Math.PI)); aim = { yaw: v[0] + turns * 2 * Math.PI, tilt: v[1] }; } need = true; ev.target.value = ''; };
$('watchPaths').onclick = (ev) => { const on = ev.currentTarget.getAttribute('aria-checked') !== 'true'; flip(ev.currentTarget, on); view.set({ paths: on }); need = true; };
$('watchPlay').onclick = () => setPlaying(!playing);
const step = (d) => { setPlaying(false); seek(Math.floor(t) + d); };
$('watchStepBack').onclick = () => step(-1); $('watchStep').onclick = () => step(1);
$('watchPrev').onclick = () => jumpClip(-1); $('watchNext').onclick = () => jumpClip(1);
$('watchSpeed').onchange = (ev) => { speed = Number(ev.target.value) || 8; };
$('watchOnly').onchange = (ev) => { only = ev.target.value; retime(); };
$('watchScrub').oninput = (ev) => { setPlaying(false); seek(Number(ev.target.value)); };
$('watchVideo').onclick = () => (recorder ? stopVideo() : startVideo());
$('watchSave').onclick = () => {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...rec, parts })], { type: 'application/json' }));
  a.download = `${(rec.brain.name || 'brain').replace(/[^\w.-]+/g, '-')}-expert-recording.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
};
$('watchFile').onchange = async (ev) => {
  const f = ev.target.files?.[0]; ev.target.value = ''; if (!f) return;
  if (f.size > 64e6) { say('That file is too big to be an expert recording.'); return; }
  try { load(JSON.parse(await f.text())); } catch (e) { say(e instanceof SyntaxError ? 'That file isn\'t an expert recording from Bob\'s Lab.' : e.message); }
};
document.querySelector('.watch-open').addEventListener('keydown', (ev) => { if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); $('watchFile').click(); } });
document.querySelector('.watch-open').tabIndex = 0;

// turn with a drag, zoom with the wheel or a pinch of the + and - keys, pick an expert with a press
{
  const c = $('watchCanvas'); let drag = null;
  c.addEventListener('pointerdown', (ev) => { drag = { x: ev.clientX, y: ev.clientY, moved: false, ...view.get() }; c.setPointerCapture(ev.pointerId); });
  c.addEventListener('pointermove', (ev) => { if (!drag) return; aim = null; const dx = ev.clientX - drag.x, dy = ev.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true; if (drag.moved) { view.set({ yaw: drag.yaw + dx * 0.008, tilt: drag.tilt + dy * 0.006, fast: true }); need = true; } });
  const up = (ev) => { if (!drag) return; const was = drag; drag = null; view.set({ fast: false }); need = true; if (!was.moved && rec) { const r = c.getBoundingClientRect(); const p = view.pick(ev.clientX - r.left, ev.clientY - r.top); if (p) { floor = p.layer; expert = p.expert; $('watchFloor').value = floor + 1; $('watchExpert').value = expert; setMode('expert'); } } };
  c.addEventListener('pointerup', up); c.addEventListener('pointercancel', () => { drag = null; view.set({ fast: false }); need = true; });
  c.addEventListener('wheel', (ev) => { ev.preventDefault(); view.set({ zoom: view.get().zoom * (ev.deltaY < 0 ? 1.1 : 1 / 1.1) }); need = true; }, { passive: false });
  c.addEventListener('keydown', (ev) => { const k = { ArrowLeft: [-0.1, 0], ArrowRight: [0.1, 0], ArrowUp: [0, 0.05], ArrowDown: [0, -0.05] }[ev.key]; if (k) { ev.preventDefault(); turn(k[0], k[1]); } else if (ev.key === '+' || ev.key === '=') $('watchIn').click(); else if (ev.key === '-') $('watchOut').click(); else if (ev.key === ' ') { ev.preventDefault(); setPlaying(!playing); } });
  new ResizeObserver(() => { need = true; }).observe(c);
}

// ---- start ----
(async () => {
  const q = new URLSearchParams(location.search), brain = q.get('brain'), id = q.get('rec');
  if (brain && id) {
    try {
      const r = await fetch('/api/lab/watch/read', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ brain, id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      load(j);
    } catch (e) { say(`I couldn't open that recording: ${e.message}`); }
  }
  requestAnimationFrame(tick);
})();
window.bobWatch = { load }; // the Lab hands a recording over to an open window with this
