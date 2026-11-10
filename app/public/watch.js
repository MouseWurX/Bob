// 🧪 FNRI: the viewer window. Plays an expert recording (public/lab-watch-math.js has the format) as a 3D
// block of voxels (public/watch-view.js): one floor for each layer, experts coloured by the skill they lean to,
// around a grey core of the parts that are not experts, glowing as the brain reads each word. Tick boxes show or
// hide each skill's experts; three zoom levels (the whole brain, one floor, one expert); Save as a video.
// Its own window, so it can sit beside the Lab or a chat. The Lab opens it with ?brain=<id>&rec=<id>; it can also
// open a recording file by itself (one made on another Bob, or on a rented card), with the Lab off.
import { applySavedStyle } from './themes.js';
import { NAME, cleanRecording, specialise, timeline, inWords, expertDetail, lookOf, LEANS, partOf, PART_LABEL, say as inKind, cutOf, cutEffect, keepList, setColour, resetColours, COVERS, cutSteps, findPatterns, PATTERN_CHOICES, PATTERN_DEFAULT, hasFloors, floorScale, floorsAt, LOAD_STYLES, loadStyle, cleanDials, skillDials, dialWords, dialScale, dialKey, compareScans, compareWords } from './lab-watch-math.js';
const LOAD_IN_MS = 2200, LOAD_OUT_MS = 900;
import { createView, GREY } from './watch-view.js';
applySavedStyle();

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const still = () => document.body.classList.contains('still') || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const view = createView($('watchCanvas'));
const viewB = createView($('watchCanvasB')); // Before and after: the scan it's compared with, on the left
const SPECIAL = /<\|[^|>]*\|>|<\/?think>/gi; // the chat layout's own markers, left out of the caption

let base = null, patternsOn = false, patternK = PATTERN_DEFAULT, floorsOn = false, fscale = null; // base: the recording as scanned; rec is base, or base sorted into the patterns Bob found
let cutCover = 0; // the Lab's "what every skill needs" cut being tried (0.9, 0.95, 0.99), or 0
let rec = null, sp = null, parts = null, frames = [], t = 0, playing = false, speed = 8, only = '', hidden = new Set(), mode = 'brain', floor = 0, expert = 0, spin = false, spinSpeed = 0.25, aim = null, need = true, lastIdx = -1, lastLit = [], recorder = null, cutOn = false, keepN = 0, off = null, solid = new Map(), src = null, askedUnload = false;

const w = (s) => inKind(rec, s); // the same sentence for a brain scanned by neuron groups
function cube() { const g = view.cubeGap(); view.set({ gap: g }); $('watchGap').value = String(g); need = true; } // floors stacked as tall as they are wide
function flipSw(b, on) { b.setAttribute('aria-checked', String(on)); b.querySelector('.st').textContent = on ? 'On' : 'Off'; }
function say(msg) { const m = $('watchMsg'); m.textContent = msg || ''; m.hidden = !msg; }

// Colour by skills (as scanned) or by the patterns found in the scan itself. Everything that reads rec follows.
function relook() {
  rec = patternsOn ? findPatterns(base, { k: patternK }) : base;
  sp = specialise(rec); view.setData(rec, sp, parts);
  solid = new Map(); hidden = new Set(); only = ''; view.set({ solid, hidden, off: null });
  cutOn = false; keepN = 0; off = null; setAsk(false); flipSw($('watchCut'), false); $('watchKeep').value = '0'; cutHowHtml();
  frames = timeline(rec);
  $('watchOnly').innerHTML = `<option value="">every skill</option>${base.skills.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}`;
  $('watchOnly').disabled = patternsOn; // the questions are still sorted by the skills you asked about
  skillsHtml(); wordsHtml(); cutHtml(); if (mode === 'floor') floorHtml(); if (mode === 'expert') expertHtml(); seek(Math.min(t, frames.length - 1));
}
function byHtml() {
  $('watchBy').innerHTML = `<option value="">The skills you asked about</option>${PATTERN_CHOICES.map((k) => `<option value="${k}">Patterns Bob found (${k} of them)</option>`).join('')}`;
  const f = hasFloors(base); fscale = f ? floorScale(base) : null; floorsOn = false; view.setFloors(null);
  $('watchFloors').hidden = !f; flipSw($('watchFloors'), false);
}
$('watchBy').onchange = (ev) => { const k = Number(ev.target.value) || 0; patternsOn = k > 0; if (k) patternK = k; say(patternsOn ? 'Sorting the words into patterns…' : ''); setTimeout(() => { relook(); say(''); }, 20); };
$('watchFloors').onclick = (ev) => { floorsOn = !floorsOn; flipSw(ev.currentTarget, floorsOn); if (!floorsOn) view.setFloors(null); lastIdx = -1; need = true; };

// A recording loads in block by block, in the order the person picked (Load in); the one before it comes apart first.
let loadGen = 0;
function load(j) {
  const gen = ++loadGen;
  if (rec && !still() && !view.loading()) { view.sweep(0, LOAD_OUT_MS).then(() => { if (gen === loadGen) loadNow(j); }); return; }
  loadNow(j);
}
function loadIn() { view.set({ reveal: 0 }); view.sweep(1, LOAD_IN_MS, still()).then(() => { need = true; }); }
function loadNow(j) {
  base = rec = cleanRecording(j); patternsOn = false; parts = j.parts && Array.isArray(j.parts.layers) ? j.parts : null;
  sp = specialise(rec);
  view.setData(rec, sp, parts);
  solid = new Map(); view.set({ solid });
  cutHowHtml();
  cutOn = false; keepN = 0; off = null; setAsk(false); view.set({ off: null }); flipSw($('watchCut'), false); $('watchKeep').value = '0'; $('watchKeep').max = rec.brain.experts;
  if (j.cut?.off) rec.cutOff = Number(j.cut.off) || 0;
  hidden = new Set(); only = ''; t = 0; playing = false; mode = 'brain'; floor = 0; expert = 0; lastIdx = -1;
  frames = timeline(rec);
  document.title = `${NAME}: ${rec.brain.name}`;
  $('watchTitle').textContent = rec.name || rec.brain.name;
  const lay = view.layout();
  $('watchSub').textContent = w(`${rec.brain.name}${rec.when ? `, recorded ${rec.when}` : ''}. ${rec.brain.layers} floors (layers) of ${rec.brain.experts} experts${rec.brain.used ? `, ${rec.brain.used} picked for each word` : ''}.${lay.expertShare ? ` Experts are ${Math.round(lay.expertShare * 100)}% of the brain's weights; the grey core and base are the rest.` : ''}`);
  $('watchEmpty').hidden = true; $('watchControls').hidden = false; $('watchPlayer').hidden = false; $('watchSave').hidden = false;
  $('watchFloor').max = rec.brain.layers; $('watchExpert').max = rec.brain.experts - 1;
  $('watchOnly').innerHTML = `<option value="">every skill</option>${rec.skills.map((s) => `<option value="${esc(s.id)}">${esc(s.label)}</option>`).join('')}`;
  $('watchZoomOne').textContent = w('One expert'); $('watchExpertWord').textContent = w('Expert');
  cube(); byHtml(); $('watchOnly').disabled = false;
  skillsHtml(); wordsHtml(); setMode('brain'); seek(0); say(''); cutHtml();
  dialEntries = j.dials?.length ? [{ label: `From this scan: ${dialWords(j.dials)}`, items: j.dials }] : []; askedDialUnload = false; dialHtml();
  cmpOff(); recFrom = String(j.from || ''); cmpList();
  loadIn();
}

// ---- dials: turn a part up or down, scan again, see what changed ----
// Each entry in the list is one press of Set this dial: one block, one floor's attention or feed-forward block, or
// every block of a skill. They are sent as one flat list (a later entry wins over an earlier one for the same part).
let dialEntries = [], askedDialUnload = false, recFrom = '';
const partWord = () => (rec.brain.kind === 'heads' ? 'head' : 'expert');
const dialsNow = () => { try { return cleanDials(dialEntries.flatMap((x) => x.items), { experts: rec.brain.kind === 'neurons' ? 0 : rec.brain.experts, layers: rec.brain.layers }); } catch { return []; } };
function dialHtml() {
  if (!rec) return;
  const what = $('watchDialWhat'), was = what.value, blocks = rec.brain.kind !== 'neurons';
  // a scan of neuron groups has no single parts Brain Engine can turn, only whole floors
  what.innerHTML = `${blocks ? `<option value="part">This ${partWord()} (floor ${floor + 1}, ${partWord()} ${expert})</option><option value="skill">Every ${partWord()} of one ${patternsOn ? 'pattern' : 'skill'}</option>` : ''}<option value="attn">Floor ${floor + 1}'s attention</option><option value="ffn">Floor ${floor + 1}'s feed-forward block${rec.brain.kind === 'experts' ? ' (all its experts together)' : ''}</option>`;
  if ([...what.options].some((o) => o.value === was)) what.value = was;
  $('watchDialSkillBox').hidden = what.value !== 'skill';
  $('watchDialFloor').max = rec.brain.layers; $('watchDialFloor').value = floor + 1; $('watchDialPart').max = rec.brain.experts - 1; $('watchDialPart').value = expert;
  $('watchDialPartBox').hidden = !blocks; $('watchDialPartWord').textContent = partWord() === 'head' ? 'Head' : 'Expert';
  $('watchDialSkill').innerHTML = rec.skills.map((s, i) => `<option value="${i}">${esc(lookOf(i)[1])} ${esc(s.label)}</option>`).join('');
  const list = dialsNow();
  $('watchDialList').innerHTML = dialEntries.map((x, i) => `<li><span>${esc(x.label)}</span><button type="button" class="link" data-undial="${i}" aria-label="Take this dial off: ${esc(x.label)}">Take off</button></li>`).join('');
  view.set({ dials: new Map(list.filter((d) => d.kind === (rec.brain.kind === 'heads' ? 'head' : 'expert')).map((d) => [`${d.layer}:${d.index}`, d.scale])) }); need = true;
  $('watchDialSays').textContent = `${dialWords(list)}${list.length ? ' Blocks turned up have a light rim and a plus, blocks turned down are fainter with a dark rim and a minus.' : ' Press a block in the picture to choose it, or pick a floor under How close.'}`;
  const can = list.length && src && !patternsOn;
  $('watchDialScan').hidden = !can; $('watchDialScan').textContent = askedDialUnload ? 'Unload Bob\'s brain and scan again' : 'Scan again with these dials';
  $('watchDialClear').hidden = !dialEntries.length;
}
$('watchDialWhat').onchange = () => { $('watchDialSkillBox').hidden = $('watchDialWhat').value !== 'skill'; };
// which floor and block the dial is for: typed here, or chosen by pressing a block in the picture
$('watchDialFloor').onchange = (ev) => { floor = Math.max(0, Math.min(rec.brain.layers - 1, (Math.floor(Number(ev.target.value)) || 1) - 1)); $('watchFloor').value = floor + 1; if (mode !== 'brain') setMode(mode); else dialHtml(); };
$('watchDialPart').onchange = (ev) => { expert = Math.max(0, Math.min(rec.brain.experts - 1, Math.floor(Number(ev.target.value)) || 0)); $('watchExpert').value = expert; if (mode !== 'brain') setMode(mode); else dialHtml(); };
$('watchDialScale').oninput = (ev) => { $('watchDialOut').textContent = `×${dialScale(ev.target.value).toFixed(2)}`; };
$('watchDialSet').onclick = () => {
  if (!rec) return;
  const scale = dialScale($('watchDialScale').value), what = $('watchDialWhat').value, x = `×${scale.toFixed(2)}`;
  let entry = null;
  if (what === 'part') entry = { label: `Floor ${floor + 1}, ${partWord()} ${expert}: ${x}`, items: [{ kind: partWord(), layer: floor, index: expert, scale }] };
  else if (what === 'skill') { const si = Number($('watchDialSkill').value) || 0; const items = skillDials(sp, si, scale).map((d) => ({ ...d, kind: partWord() })); if (!items.length) { say(`No ${partWord()} leans to ${rec.skills[si].label} in this scan, so there's nothing to turn.`); return; } entry = { label: `Every ${partWord()} of ${rec.skills[si].label} (${items.length.toLocaleString()}): ${x}`, items }; }
  else entry = { label: `Floor ${floor + 1}'s ${what === 'attn' ? 'attention' : 'feed-forward block'}: ${x}`, items: [{ kind: what, layer: floor, index: 0, scale }] };
  // the same part set again replaces its earlier entry
  const keys = new Set(entry.items.map(dialKey));
  dialEntries = dialEntries.filter((e0) => !(e0.items.length === entry.items.length && e0.items.every((d) => keys.has(dialKey(d)))));
  dialEntries.push(entry); askedDialUnload = false; say(''); dialHtml();
};
$('watchDialList').addEventListener('click', (ev) => { const b = ev.target.closest('[data-undial]'); if (!b) return; dialEntries.splice(Number(b.dataset.undial), 1); askedDialUnload = false; dialHtml(); });
$('watchDialClear').onclick = () => { dialEntries = []; askedDialUnload = false; dialHtml(); };
$('watchDialScan').onclick = async () => {
  const dials = dialsNow(); if (!dials.length || !src) return;
  try {
    const r = await fetch('/api/lab/watch/start', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ brain: src.brain, again: src.id, dials, what: rec.brain.kind === 'heads' ? 'heads' : '', unload: askedDialUnload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    if (j.needUnload) { askedDialUnload = true; dialHtml(); say(`${(j.names || []).join(', ') || 'Bob\'s brain'} is on the graphics card, and the scan needs it. Press Unload Bob's brain and scan again to start. It loads again the next time you chat.`); return; }
    askedDialUnload = false; dialHtml(); say(`The new scan has started. It asks the same questions with these dials set, and shows up on the Lab's ${NAME} page when it's done. Open it and Before and after compares the two.`);
  } catch (e) { say(`Bob couldn't start that scan: ${e.message}`); }
};

// ---- before and after: this scan beside another scan of the same brain, word for word ----
let cmp = null; // { rec, sp, map: this scan's question number -> the other scan's, result }
function cmpOff() { cmp = null; $('watchHalfB').hidden = true; $('watchTagA').hidden = true; $('watchCmpView').hidden = true; $('watchCmpSays').textContent = ''; need = true; }
async function cmpList() {
  const box = $('watchCmpBox'), sel = $('watchCmpWith'); box.hidden = true;
  if (!src) return;
  const mine = src.id, from = recFrom;
  try {
    const r = await fetch('/api/lab/watch/view', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ brain: src.brain }) });
    const j = await r.json().catch(() => ({})); if (!r.ok || !src || src.id !== mine) return;
    const others = (j.recordings || []).filter((x) => x.id !== mine);
    if (!others.length) return;
    sel.innerHTML = `<option value="">(nothing, just this scan)</option>${others.map((x) => `<option value="${esc(x.id)}">${esc(x.name || x.id)}${x.when ? `, ${esc(x.when)}` : ''}${x.id === from ? ' (the scan this one was made from)' : ''}</option>`).join('')}`;
    box.hidden = false;
    if (from && others.some((x) => x.id === from)) { sel.value = from; cmpWith(from); } // made with dials or a cut: the comparison is the point, so it opens
  } catch {}
}
async function cmpWith(id) {
  if (!id || !src) { cmpOff(); return; }
  try {
    const r = await fetch('/api/lab/watch/read', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ brain: src.brain, id }) });
    const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    const other = cleanRecording(j);
    if (other.brain.experts !== base.brain.experts || other.brain.layers !== base.brain.layers || other.brain.kind !== base.brain.kind) throw new Error('that scan was made a different way (experts, neuron groups or attention heads), so the blocks don\'t line up');
    const result = compareScans(other, base);
    cmp = { rec: other, sp: specialise(other), map: new Map(result.clips.map((x) => [x.after, x.before])), result };
    viewB.setData(other, cmp.sp, j.parts && Array.isArray(j.parts.layers) ? j.parts : null); viewB.set({ key: false, load: 'none' });
    $('watchHalfB').hidden = false; $('watchTagA').hidden = false; $('watchCmpView').hidden = false;
    $('watchCmpSays').textContent = compareWords(result);
    lastIdx = -1; cmpSync = ''; need = true;
  } catch (e) { cmpOff(); $('watchCmpSays').textContent = `Bob couldn't compare with that scan: ${e.message}.`; }
}
$('watchCmpWith').onchange = (ev) => cmpWith(ev.target.value);
// the other block follows this one: the same turn, zoom, glass and what's hidden
let cmpSync = '';
function cmpFollow() {
  const g = view.get(), st = JSON.stringify([g, [...hidden].map(String), $('watchMono').getAttribute('aria-checked'), $('watchMonoColour').value, $('watchMark').value]);
  if (st === cmpSync) return; cmpSync = st;
  viewB.set({ ...g, hidden, mono: $('watchMono').getAttribute('aria-checked') === 'true', monoColour: $('watchMonoColour').value, mark: $('watchMark').value, paths: $('watchPaths').getAttribute('aria-checked') === 'true' });
}
function litForB(i, frac) {
  const out = [], cur = frames[i]; if (!cur || !cmp) return out;
  const bi = cmp.map.get(cur.clip); if (bi === undefined) return out;
  const c = cmp.rec.clips[bi], a = rec.clips[cur.clip];
  // the question's words are the same in both; past them, each answer goes its own way, so keep step by word number
  const at = (w) => (w < a.prompt ? Math.min(w, c.e.length - 1) : Math.min(c.prompt + (w - a.prompt), c.e.length - 1));
  for (let k = 5; k >= 0; k--) { const f = frames[i - k]; if (!f || f.clip !== cur.clip) continue; out.push({ e: c.e[at(f.word)], age: k === 0 ? 0 : Math.min(1, (k + frac) / 6) }); }
  return out;
}
function cmpHtml(i) {
  if (!cmp) return; const cur = frames[i]; if (!cur) return;
  const one = cmp.result.clips.find((x) => x.after === cur.clip), a = rec.clips[cur.clip];
  if (!one) { $('watchCmpView').innerHTML = '<p class="muted">The other scan didn\'t ask this question.</p>'; return; }
  const b = cmp.rec.clips[one.before];
  $('watchCmpView').innerHTML = `<p><strong>${esc(compareWords(cmp.result))}</strong></p><p>This question: ${Math.round(one.moved * 100)}% of the picks moved while reading it, and the answer ${one.sameAnswer ? 'stayed the same' : 'changed'}.</p><div class="two${one.sameAnswer ? ' same' : ''}"><div><strong>Before</strong><p>${esc(b.answer || '(no answer)')}</p></div><div><strong>After</strong><p>${esc(a.answer || '(no answer)')}</p></div></div>`;
}

function skillsHtml() {
  const never = sp.total - sp.used;
  const row = (key, sw, label, n, title) => `<label class="watch-skill" title="${esc(w(title))}"><input type="checkbox" data-show="${esc(String(key))}" ${hidden.has(key) ? '' : 'checked'}> ${sw} <span>${esc(w(label))}</span><span class="n">${n}</span></label>${key === 'never' || key === 'even' ? '' : `<input type="range" class="watch-solid" data-solid="${esc(String(key))}" min="0.1" max="1" step="0.05" value="${solid.get(key) ?? 1}" aria-label="${esc(w(`How solid: ${label}`))}" title="${esc(w(`How solid: ${label}`))}">`}`;
  $('watchSkills').innerHTML = `<legend>Show these</legend>${rec.skills.map((s, i) => row(i, `<span class="sw" style="background:${lookOf(i)[0]}">${lookOf(i)[1]}</span><input type="color" class="watch-colour" data-colour="${i}" value="${lookOf(i)[0].toLowerCase()}" aria-label="${esc(`Colour for ${s.label}`)}" title="${esc(`Colour for ${s.label}`)}">`, s.label, sp.top.reduce((a, l) => a + l.filter((x) => x === i).length, 0).toLocaleString(), `Experts picked most often for ${s.label}. ${sp.per[i].leans.toLocaleString()} of them lean to it clearly.`)).join('')}
    ${sp.evens ? row('even', '<span class="sw even"></span>', 'All-rounders', sp.evens.toLocaleString(), 'Experts every skill used about alike, and often. They keep their faint colour and get a dashed white outline, so they aren\'t taken for experts that were only picked a few times. Untick to hide them.') : ''}
    ${row('grey', `<span class="sw" style="background:${GREY}"></span>`, 'Not experts', '', 'Attention, the router, the tuning rows and the word tables: every word passes through these.')}
    ${row('never', '<span class="sw never"></span>', 'Never picked', never.toLocaleString(), 'Experts none of these questions woke. A wider set of questions would wake more of them.')}`;
}

function wordsHtml() {
  const lines = inWords(rec, sp);
  lines.push('The stronger an expert\'s colour, the more it is that skill\'s own. A faint one is shared by several skills, and its colour only says which used it a little more.');
  if (parts) {
    const k = parts.kinds || {}, all = (parts.outside || 0) + parts.layers.reduce((a, p) => a + p.experts + p.other, 0) || 1;
    const pc = (n) => `${Math.max(0.1, Math.round((1000 * (n || 0)) / all) / 10)}%`;
    const hd = rec.brain.kind === 'heads'; // in a heads scan attention is what lights, so it is not in the grey list
    lines.push(`Not experts, the grey parts, by share of the weights: ${hd ? `the feed-forward layers ${pc(k.rest)}` : `attention ${pc(k.attention)}`}${k.router ? `, the router that picks experts ${pc(k.router)}` : ''}, tuning rows ${pc(k.norms)}, the word tables ${pc(k.tables)}${k.rest && !hd ? `, the rest ${pc(k.rest)}` : ''}. Every word passes through all of them, so none can be cut out.`);
    if (view.layout().baseCapped) lines.push('The word tables are bigger than the base shows: it is capped at two floors so the block stays readable.');
  } else lines.push('This recording doesn\'t say how big the parts that are not experts are, so the grey core isn\'t drawn.');
  lines.push('A few questions for each skill show the pattern; they don\'t measure the brain. A new scan with more questions gives a steadier picture.');
  $('watchWords').innerHTML = lines.map((l) => `<li>${esc(w(l))}</li>`).join('');
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
  const c = rec.clips[f.clip], si = c.by ? c.by[f.word] : rec.skills.findIndex((s) => s.id === c.skill); // a pattern for every word, or the clip's skill
  return { f, c, si };
}

function busiestFloors(f) { const a = floorsAt(base, fscale, f.clip, f.word) || []; return a.map((v, l) => [v, l]).sort((x, y) => y[0] - x[0]).slice(0, 3).map(([, l]) => l + 1).join(', '); }
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
  $('watchStatus').textContent = w(`Word ${i + 1} of ${frames.length}. Question ${f.clip + 1} of ${rec.clips.length}. ${picks} experts picked for this word.${floorsOn && fscale ? ` Busiest floors: ${busiestFloors(f)}.` : ''}${off ? ` ${c.e[f.word].reduce((a, l, li) => a + l.filter((x) => off[li].has(x)).length, 0)} of them are turned off (the crossed-out rings).` : ''}`);
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
  $('watchCanvas').hidden = m === 'floor'; $('watchPair').hidden = m === 'floor'; $('watchFloorView').hidden = m !== 'floor'; $('watchExpertView').hidden = m !== 'expert';
  $('watchVideo').disabled = m === 'floor';
  view.set({ picked: m === 'expert' ? { layer: floor, expert } : null });
  if (m === 'floor') floorHtml();
  if (m === 'expert') expertHtml();
  dialHtml();
  lastIdx = -1; need = true;
}

function floorHtml() {
  const lay = view.layout(), l = floor;
  const cells = [];
  for (let i = 0; i < lay.W * lay.D; i++) {
    const e = lay.cellExpert[i];
    if (e >= 0) {
      const top = sp.top[l][e], cut = Boolean(off && off[l].has(e)), dim = cut || (top >= 0 ? hidden.has(top) : hidden.has('never'));
      const st = Math.round(100 * (sp.strength[l][e] || 0));
      const label = top < 0 ? `Expert ${e}: never picked` : `Expert ${e}: ${rec.skills[top].label}, ${st >= LEANS * 100 ? `leans to it (${st} out of 100)` : sp.even[l][e] ? 'an all-rounder, every skill uses it alike' : 'too few picks to say more'}, picked ${sp.picks[l][e]} times`;
      cells.push(`<button type="button" class="watch-cell${dim ? ' off' : ''}" data-cell="${e}" aria-label="${esc(label + (cut ? ', turned off' : ''))}" title="${esc(label + (cut ? ', turned off' : ''))}">${top >= 0 ? `<span class="bg" style="background:${lookOf(top)[0]};opacity:${(0.2 + 0.8 * Math.min(1, sp.strength[l][e] * 1.6)).toFixed(2)}"></span>` : ''}<span class="tx">${e}${top >= 0 ? `<br>${lookOf(top)[1]}` : ''}</span></button>`);
    } else if (lay.coreRank[i] >= 0 && lay.grey[l] > 0) cells.push(`<div class="watch-cell core${hidden.has('grey') ? ' off' : ''}" title="Not an expert: attention, the router and the tuning rows"></div>`);
    else cells.push('<div></div>');
  }
  $('watchFloorView').innerHTML = `<h2>Floor ${l + 1} of ${rec.brain.layers} <span class="muted">(layer ${l})</span></h2>
    <p class="muted">Every square is one expert, with its number and its skill's letter; the grey squares in the middle are not experts. A white outline means it's picked for the word being read. Press a square to look at that expert.</p>
    <div class="watch-grid" style="grid-template-columns:repeat(${lay.W},minmax(0,1fr))">${cells.join('')}</div>`;
  $('watchFloorView').innerHTML = w($('watchFloorView').innerHTML);
  lastLit = [];
}

function expertHtml() {
  const d = expertDetail(rec, sp, floor, expert);
  const top = d.top >= 0 ? rec.skills[d.top] : null;
  $('watchExpertView').innerHTML = `<h2>Expert ${d.expert} on floor ${d.layer + 1} <span class="muted">(layer ${d.layer})</span></h2>
    ${d.picks ? `<p>Picked ${d.picks.toLocaleString()} times in this recording. ${top ? (d.strength >= LEANS ? `It leans to <strong>${esc(top.label)}</strong> (${Math.round(d.strength * 100)} out of 100, where 100 means only that skill ever used it).` : sp.even[d.layer]?.[d.expert] ? `An all-rounder: the skills share it about evenly, and it was picked often enough to say so. <strong>${esc(top.label)}</strong> used it a little more.` : `It was picked too few times to say it belongs to one skill; <strong>${esc(top.label)}</strong> used it a little more.`) : ''}</p>
    ${d.shares.map((s) => `<div class="watch-bar"><span>${esc(lookOf(s.skill)[1])} ${esc(rec.skills[s.skill].label)}</span><span class="track"><span class="fill" style="width:${s.pct}%;background:${lookOf(s.skill)[0]}"></span></span><span class="pc">${s.pct}%</span></div>`).join('')}
    <p><strong>Words it was picked for most:</strong> ${d.words.map((w) => `<code>${esc(w.text.replace(SPECIAL, '(marker)')) || '(space)'}</code> ${w.n}`).join(', ') || 'none'}.</p>` : '<p>None of these questions picked this expert. A wider set of questions might.</p>'}`;
  $('watchExpertView').innerHTML = w($('watchExpertView').innerHTML);
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
    if (i !== lastIdx) { lastIdx = i; caption(i); if (mode === 'floor') markFloor(i); cmpHtml(i); }
    if (floorsOn && fscale) { const fb = frames[i]; view.setFloors(fb ? floorsAt(base, fscale, fb.clip, fb.word) : null); }
    if (mode !== 'floor') view.draw(litFor(i, frac));
    if (cmp && mode !== 'floor') { cmpFollow(); viewB.draw(litForB(i, frac)); }
  }
  requestAnimationFrame(tick);
}

// ---- a video of it ----
function startVideo() {
  const canvas = $('watchCanvas');
  const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((m) => window.MediaRecorder?.isTypeSupported?.(m));
  if (!canvas.captureStream || !type) { say('This browser can\'t save a video of the picture. Bob\'s window and most desktop browsers can.'); return; }
  const chunks = [];
  recorder = new MediaRecorder(canvas.captureStream(30), { mimeType: type, videoBitsPerSecond: Number($('watchVideoQ').value) || 4e6 });
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
  const key = k === 'grey' || k === 'never' || k === 'even' ? k : Number(k);
  if (ev.target.checked) hidden.delete(key); else hidden.add(key);
  view.set({ hidden }); cutHtml(); if (mode === 'floor') floorHtml(); lastIdx = -1; need = true;
});
$('watchSkills').addEventListener('input', (ev) => { const k = ev.target.dataset.solid; if (k === undefined) return; solid.set(k === 'grey' ? k : Number(k), Number(ev.target.value)); view.set({ solid }); need = true; });
// ---- try a cut: what is unticked (and all but the busiest few on each floor) is turned off, not only hidden ----
// The rescan button names what it will do: after Bob's brain was found on the card, it unloads it first.
function setAsk(v) { askedUnload = v; const b = $('watchRescan'); if (b) b.textContent = v ? 'Unload Bob\'s brain and scan again' : 'Scan again with these turned off'; }
function cutHtml() {
  if (!rec) return;
  off = cutOn ? cutOf(rec, sp, { skills: new Set([...hidden].filter((k) => typeof k === 'number')), never: hidden.has('never'), keepN, cover: cutCover }) : null;
  const covK = cutOn && cutCover ? rec.brain.experts - off[0].size : 0;
  view.set({ off }); window.__cutOff = off; lastIdx = -1; need = true;
  const says = $('watchCutSays'), again = $('watchRescan');
  if (!off) { says.textContent = w(rec.cutOff ? `This scan was made with ${rec.cutOff.toLocaleString()} experts turned off.` : 'Untick skills or Never picked above, then switch this on: those experts go dark, and a crossed-out red ring shows each time the brain wanted one.'); again.hidden = true; return; }
  const fx = cutEffect(rec, off);
  const worst = fx.per.map((p, i) => [p.pct, rec.skills[i].label]).sort((a, b) => b[0] - a[0])[0];
  says.textContent = w(fx.off ? `${covK ? `The Lab's cut that keeps what every skill needs (${Math.round(cutCover * 100)}% of each skill's picks) keeps ${covK} of ${rec.brain.experts} experts on each floor. ` : ''}${fx.off.toLocaleString()} of ${fx.total.toLocaleString()} experts turned off. ${fx.pct}% of the picks in this scan went to them${fx.lost && worst ? `; ${worst[1]} leaned on them most (${worst[0]}%)` : ''}. A real brain would pick its next best experts instead, so this shows how much it leaned on them, not how much worse it would get.` : 'Nothing is turned off yet. Untick something above, or set how many to keep on each floor.') + (rec.brain.kind === 'neurons' ? ' Neuron groups can\'t be switched off in Brain Engine, so this is a picture only.' : '');
  again.hidden = !(fx.off && src && rec.brain.kind === 'experts' && !patternsOn);
}
$('watchCut').onclick = (ev) => { cutOn = !cutOn; flipSw(ev.currentTarget, cutOn); setAsk(false); cutHtml(); if (mode === 'floor') floorHtml(); };
// the Lab's own cuts: its plain sizes (the busiest N on each floor) and "what every skill needs"
function cutHowHtml() {
  const box = $('watchCutHowBox'), sel = $('watchCutHow'), plain = rec.brain.kind !== 'experts' || rec.skills.length < 2;
  box.hidden = plain; $('watchCutHowHint').hidden = plain; cutCover = 0;
  sel.innerHTML = `<option value="">By hand (what's unticked, or the busiest few)</option>${COVERS.map((c) => `<option value="c${c}">Keep what every skill needs (${Math.round(c * 100)}% of its picks)</option>`).join('')}${cutSteps(rec.brain.experts, rec.brain.used).map((n) => `<option value="k${n}">Keep the busiest ${n} of ${rec.brain.experts} on each floor</option>`).join('')}`;
}
$('watchCutHow').onchange = (ev) => {
  const v = ev.target.value;
  cutCover = v[0] === 'c' ? Number(v.slice(1)) : 0; keepN = v[0] === 'k' ? Number(v.slice(1)) : 0; $('watchKeep').value = keepN;
  if (v && !cutOn) { cutOn = true; flipSw($('watchCut'), true); }
  setAsk(false); cutHtml(); if (mode === 'floor') floorHtml();
};
$('watchKeep').onchange = (ev) => { cutCover = 0; $('watchCutHow').value = ''; keepN = Math.max(0, Math.min(rec.brain.experts, Math.floor(Number(ev.target.value) || 0))); ev.target.value = keepN; if (keepN && !cutOn) { cutOn = true; flipSw($('watchCut'), true); } cutHtml(); if (mode === 'floor') floorHtml(); };
$('watchRescan').onclick = async () => {
  if (!off || !src) return;
  try {
    const r = await fetch('/api/lab/watch/start', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ brain: src.brain, again: src.id, keep: keepList(rec, off), unload: askedUnload }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
    if (j.needUnload) { setAsk(true); say(`${(j.names || []).join(', ') || 'Bob\'s brain'} is on the graphics card, and the scan needs it. Press Unload Bob's brain and scan again to start. It loads again the next time you chat.`); return; }
    setAsk(false); say('The new scan has started. It asks the same questions with those experts switched off, and shows up on the Lab\'s FNRI page when it\'s done.');
  } catch (e) { say(`Bob couldn't start that scan: ${e.message}`); }
};
$('watchAll').onclick = () => { hidden = new Set(); view.set({ hidden }); skillsHtml(); cutHtml(); if (mode === 'floor') floorHtml(); need = true; };
$('watchNone').onclick = () => { hidden = new Set([...rec.skills.keys(), ...['grey', 'never', 'even'].filter((k) => hidden.has(k))]); view.set({ hidden }); skillsHtml(); cutHtml(); if (mode === 'floor') floorHtml(); need = true; };
$('watchZoom').onchange = (ev) => setMode(ev.target.value);
$('watchFloor').onchange = (ev) => { const was = floor; floor = Math.max(0, Math.min(rec.brain.layers - 1, (Number(ev.target.value) || 1) - 1)); ev.target.value = floor + 1; if (floor !== was) setMode(mode); };
$('watchExpert').onchange = (ev) => { const was = expert; expert = Math.max(0, Math.min(rec.brain.experts - 1, Number(ev.target.value) || 0)); ev.target.value = expert; if (expert !== was) setMode(mode); };
$('watchFloorView').addEventListener('click', (ev) => { const b = ev.target.closest('[data-cell]'); if (!b) return; expert = Number(b.dataset.cell); $('watchExpert').value = expert; setMode('expert'); $('watchExpertView').focus?.(); });
$('watchGap').oninput = (ev) => { view.set({ gap: Number(ev.target.value) }); need = true; };
$('watchCube').onclick = cube;
$('watchMark').onchange = (ev) => { view.set({ mark: ev.target.value }); need = true; };
function recolour() { view.set({ hidden }); skillsHtml(); wordsHtml(); if (mode === 'floor') floorHtml(); if (mode === 'expert') expertHtml(); lastIdx = -1; need = true; }
$('watchSkills').addEventListener('change', (ev) => { const i = ev.target.dataset.colour; if (i === undefined) return; setColour(Number(i), ev.target.value); recolour(); });
$('watchColours').onclick = () => { resetColours(); recolour(); };
$('watchGlow').oninput = (ev) => { view.set({ glow: Number(ev.target.value) }); need = true; };
$('watchGlass').oninput = (ev) => { view.set({ glass: Number(ev.target.value) }); need = true; };
const turn = (dy, dt_) => { const g = view.get(); view.set({ yaw: g.yaw + dy, tilt: g.tilt + dt_ }); need = true; };
$('watchLeft').onclick = () => turn(-0.2, 0); $('watchRight').onclick = () => turn(0.2, 0); $('watchUp').onclick = () => turn(0, 0.1); $('watchDown').onclick = () => turn(0, -0.1);
$('watchIn').onclick = () => { view.set({ zoom: view.get().zoom * 1.25 }); need = true; }; $('watchOut').onclick = () => { view.set({ zoom: view.get().zoom / 1.25 }); need = true; };
const flip = (b, on) => { b.setAttribute('aria-checked', String(on)); b.querySelector('.st').textContent = on ? 'On' : 'Off'; };
$('watchSpin').onclick = (ev) => { if (still()) { say('Animations are off (Style, or this replicant matrix\'s reduce-motion setting), so the block stays still. The turn buttons still work.'); return; } spin = !spin; flip(ev.currentTarget, spin); };
$('watchSpinSpeed').oninput = (ev) => { spinSpeed = Number(ev.target.value) || 0.25; };
const FACES = { corner: [-0.62, 0.5], front: [0, 0.12], side: [Math.PI / 2, 0.12], back: [Math.PI, 0.12], top: [-0.62, 1.15] };
$('watchFace').onchange = (ev) => { const v = FACES[ev.target.value]; if (!v) return; if (spin) { spin = false; flip($('watchSpin'), false); } if (still()) { view.set({ yaw: v[0], tilt: v[1] }); } else { const g = view.get(); const turns = Math.round((g.yaw - v[0]) / (2 * Math.PI)); aim = { yaw: v[0] + turns * 2 * Math.PI, tilt: v[1] }; } need = true; ev.target.value = ''; };
$('watchMono').onclick = (ev) => { const on = ev.currentTarget.getAttribute('aria-checked') !== 'true'; flip(ev.currentTarget, on); view.set({ mono: on }); $('watchMonoColourBox').hidden = !on; try { localStorage.setItem('bob-watch-mono', on ? '1' : '0'); } catch {} need = true; };
$('watchLoad').innerHTML = LOAD_STYLES.map(([id, label]) => `<option value="${id}">${label}</option>`).join('');
{ let s = 'random'; try { s = loadStyle(localStorage.getItem('bob-fnri-load')); } catch {} $('watchLoad').value = s; view.set({ load: s }); }
$('watchLoad').onchange = (ev) => { const s = loadStyle(ev.target.value); view.set({ load: s }); try { localStorage.setItem('bob-fnri-load', s); } catch {} if (rec) loadIn(); };
$('watchMonoColour').oninput = (ev) => { view.set({ monoColour: ev.target.value }); try { localStorage.setItem('bob-watch-mono-colour', ev.target.value); } catch {} need = true; };
try { const c = localStorage.getItem('bob-watch-mono-colour'); if (/^#[0-9a-f]{6}$/i.test(c || '')) { $('watchMonoColour').value = c; view.set({ monoColour: c }); } if (localStorage.getItem('bob-watch-mono') === '1') { flip($('watchMono'), true); view.set({ mono: true }); $('watchMonoColourBox').hidden = false; } } catch {}
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
  a.href = URL.createObjectURL(new Blob([JSON.stringify({ ...base, parts })], { type: 'application/json' }));
  a.download = `${(rec.brain.name || 'brain').replace(/[^\w.-]+/g, '-')}-expert-recording.json`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60e3);
};
$('watchFile').onchange = async (ev) => {
  const f = ev.target.files?.[0]; ev.target.value = ''; if (!f) return;
  if (f.size > 64e6) { say('That file is too big to be an expert recording.'); return; }
  try { src = null; load(JSON.parse(await f.text())); } catch (e) { say(e instanceof SyntaxError ? 'That file isn\'t an expert recording from Bob\'s Lab.' : e.message); }
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
  const q = new URLSearchParams(location.search), brain = q.get('brain'), id = q.get('rec'), file = q.get('file');
  // a recording sitting beside the viewer (the folder a rented card hands back): watch.html?file=recording.json
  if (file && /^[\w.-]+\.json$/.test(file)) { try { const r = await fetch(`./${file}`); if (!r.ok) throw new Error(`Error ${r.status}`); src = null; load(await r.json()); } catch (e) { say(`Bob couldn't open that recording: ${e.message}`); } return; }
  if (brain && id) {
    try {
      const r = await fetch('/api/lab/watch/read', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ brain, id }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
      src = { brain, id }; load(j); src = { brain, id }; cutHtml();
    } catch (e) { say(`Bob couldn't open that recording: ${e.message}`); }
  }
  requestAnimationFrame(tick);
})();
window.bobWatch = { load }; // the Lab hands a recording over to an open window with this
