// fNRI in small: a cube of Bob's brain in "Bob's thinking" (Now running). It builds itself when a brain loads and
// comes apart when it's let go. By default it glows for show while Bob thinks: made-up picks in the theme's colour,
// drawn about 14 times a second, and the engine is never asked for anything, so replies are as fast as without it.
// With Real experts on it listens to /api/events?cube=1&live=1, and only then does Bob ask Brain Engine for the trace
// (public/lab-watch-math.js liveTrace has the shape), which slows his replies. The real picture arrives when a reply is
// finished and is then played word by word; nothing is saved. The same drawing as the big viewer (watch-view.js).
import { createView } from './watch-view.js';
import { createFog } from './fog.js';
import { specialise, liveRecording, partOf, PART_LABEL, say, NAME, mapLook, litSkills, lookOf, LOAD_STYLES, loadStyle, UNLOAD_STYLES, unloadStyle } from './lab-watch-math.js';

const SPECIAL = /<\|[^|>]*\|>|<\/?think>/gi;
export const CUBE_SPEED = 14; // words a second
export const SHOW_MS = 70; // the made-up glow: one new word about every 70 ms (14 a second), and nothing drawn while Bob is idle
export const SHOW_TRAIL = 6;
export const SPARK_MS = [2500, 6000]; // resting: now and then a few neurons fire, somewhere between these many ms apart
// A resting spark: 1 to 3 experts, each on a random floor. Returns [[ids] per floor], mostly empty.
export function sparkWord(layers, experts, rnd = Math.random) {
  const L = Math.max(0, Math.floor(layers) || 0), E = Math.max(1, Math.floor(experts) || 1), out = Array.from({ length: L }, () => []);
  if (!L) return out;
  const n = 1 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) { const l = Math.floor(rnd() * L) % L, e = Math.floor(rnd() * E) % E; if (!out[l].includes(e)) out[l].push(e); }
  return out;
} // the last few words' glow fades out behind the newest, the same as a real reply

// The made-up glow for one word: `used` experts on every floor. Most of a floor's picks stay from the word before, so
// it drifts like a real brain does instead of flickering. prev = the last word's picks (or null). rnd = Math.random.
export function showWord(prev, layers, experts, used, rnd = Math.random) {
  const L = Math.max(0, Math.floor(layers) || 0), E = Math.max(1, Math.floor(experts) || 1);
  const n = Math.max(1, Math.min(E, Math.floor(used) || Math.min(8, Math.max(2, Math.round(E / 16)))));
  const out = [];
  for (let l = 0; l < L; l++) {
    const keep = new Set(), was = prev?.[l] || [];
    for (const e of was) if (keep.size < n && e >= 0 && e < E && rnd() < 0.6) keep.add(e);
    for (let tries = 0; keep.size < n && tries < n * 20; tries++) keep.add(Math.floor(rnd() * E) % E);
    out.push([...keep]);
  }
  return out;
}

// 1.5.210: the cube's state in a few plain words, for its screen-reader label.
export function cubeState({ why = '', rec = null, leaving = false, shell = null, loadingNow = '', phase = 'idle', busy = false, empty = false } = {}) {
  const name = shell?.label ? ` (${shell.label})` : '';
  if (why) return 'Bob\'s brain cube: nothing to show for this brain.';
  if (rec) return `Bob's brain cube${name}: showing the experts his last reply used.`;
  if (leaving && shell) return `Bob's brain cube${name}: letting go of the brain.`;
  if (!shell) return empty ? 'Bob\'s brain cube: no brain loaded.' : 'Bob\'s brain cube: waiting for a brain.';
  if (loadingNow && loadingNow === shell.label) return `Bob's brain cube${name}: loading.`;
  if (phase === 'wait') return `Bob's brain cube${name}: thinking.`;
  if (busy) return `Bob's brain cube${name}: answering.`;
  return `Bob's brain cube${name}: ready.`;
}

export const CUBE_IN_MS = 1600, CUBE_OUT_MS = 1100, VASE_IN_MS = 3200, DRAIN_OUT_MS = 2200; // the block building itself when a brain's first reply arrives (Vase, then fill and Drain take about twice as long, so the water can be seen sloshing), and coming apart when the brain is let go

// The colours: when this brain has an fNRI scan, Bob sends that scan's map along and every expert gets its skill's
// colour (all-rounders a dashed white outline); with no scan the cube is one colour and says how to get the rest.
// els: { box, canvas, says, open, key, mono, colour, colourBox, details, load, unload, loadBox, spin, lines, linesBox }. still() = animations are off (the last word is shown, nothing moves).
export function createMindCube({ box, canvas, says, open, key = null, mono = null, colour = null, colourBox = null, details = null, load = null, unload = null, loadBox = null, spin = null, lines = null, linesBox = null }, { still = () => false, onWhy = null, live = () => false, EventSourceImpl = globalThis.EventSource, avatar = false, lamp = () => false } = {}) { // lamp(): this cube drives the room's lamplight (--cube-light)
  // avatar: Bob's picture in the corner is this cube (Style, Bob's look). Drawn small and never turning, so it costs
  // less than the pixel Bob it stands in for; the same life (builds on load, sparks, glows while he thinks, drains).
  const view = createView(canvas, { min: [32, 32] }); // square: the porthole is round
  let es = null, traces = [], rec = null, sp = null, clip = -1, t = 0, raf = 0, last = 0, why = '', look = null;
  // Before the first reply (and on an engine that can't report experts) the cube is the brain's empty shape in one
  // colour, built block by block as the brain loads, then still until Bob thinks. shell = { label, experts, layers, kind }.
  let shell = null, loadingNow = '', known = false, lastShapes = null, lastLoading = '';
  // anyLoaded: Bob holds (or is loading) a brain right now. With none, the porthole shows only the fog.
  let anyLoaded = false, leaving = false; // leaving: the block is coming apart because its brain was let go
  // Real experts off: from the moment a message is sent until Bob's first word the cube pulses ('wait', a CSS fade, so
  // nothing is redrawn); once he writes it glows word by word ('run'); then it fades and rests ('idle'). busy = 'run'.
  let phase = 'idle', busy = false, show = [], showTimer = 0, sparkTimer = 0, showing = false;
  const pulse = (on) => box.classList.toggle('pulse', on);
  // 1.5.210 The porthole: the cube is seen through a round window into a foggy room. The fog (public/fog.js) has its own
  // canvas behind the cube's and moves all the time the porthole shows, brain or no brain; the cube only moves while a
  // brain is loaded. The experts as they fire light the fog in their colour.
  const port = document.createElement('div'); port.className = 'port';
  const fogCanvas = document.createElement('canvas'); fogCanvas.className = 'fog'; fogCanvas.setAttribute('aria-hidden', 'true');
  canvas.insertAdjacentElement('beforebegin', port); port.append(fogCanvas, canvas); box.classList.add('porthole');
  // Light effects, all cheap (CSS, or the frames already drawn): a ripple across the glass when a message arrives, the
  // rim catching the colour of the experts firing, the fog brightening as a brain loads and dimming as it goes.
  let glintTimer = 0;
  const glint = (c, s) => { if (still()) return; port.style.setProperty('--glint', c); port.style.setProperty('--glint-a', String(Math.min(1, s))); clearTimeout(glintTimer); glintTimer = setTimeout(() => port.style.setProperty('--glint-a', '0'), 600); };
  // The lamplight (1.5.210): the soft glow the porthole throws on the room around it, as --cube-light (0..1) on the page,
  // for the look's CSS to read. It rests low with a very slow pulse and the odd spark, follows how much of the cube is
  // lit while he thinks (more lit, brighter, never past a soft glow, with a candle's flicker), sinks almost to nothing
  // as a brain unloads and stays there with none, and eases back up as one loads. Updated once per fog frame, only
  // by the cube that has the lamp (the corner one when it's Bob's picture). 'bob-cube-state' says what it's doing.
  const LAMP = { rest: 0.18, none: 0.04, top: 0.62 };
  let lampNow = LAMP.none, litShare = 0, litSmooth = 0, lampT = 0, lampState = '';
  const draw0 = view.draw;
  view.draw = (frames = []) => { // how lit the cube is in the frame being drawn: the newest word's picks over all it could pick
    const f = frames.filter((x) => x && x.age < 0.35), per = Math.max(1, (shell?.layers || rec?.brain?.layers || 1) * Math.max(1, shell?.used || rec?.brain?.used || 1));
    litShare = f.length ? Math.min(1, f.reduce((n, x) => n + (x.e || []).reduce((a, l) => a + (l?.length || 0), 0) * (1 - x.age), 0) / per) : 0;
    return draw0(frames);
  };
  const lampStateNow = () => (leaving ? 'unloading' : !rec && !shell ? 'none' : view.loading() ? 'loading' : phase !== 'idle' || liveQ.length ? 'thinking' : 'rest');
  function lampTick(dt) {
    if (!lamp()) return;
    const st = lampStateNow(); lampT += dt;
    if (st !== lampState) { lampState = st; try { globalThis.dispatchEvent?.(new CustomEvent('bob-cube-state', { detail: { state: st } })); } catch {} }
    litSmooth += (litShare - litSmooth) * Math.min(1, dt * 4);
    let want = st === 'none' || st === 'unloading' ? LAMP.none : st === 'loading' ? LAMP.rest * Math.max(0.3, view.reveal?.() ?? 1)
      : LAMP.rest + 0.025 * Math.sin(lampT * 0.6) + (LAMP.top - LAMP.rest) * litSmooth;
    if (st === 'thinking' && !still()) want += (Math.random() - 0.5) * 0.06 * (0.3 + litSmooth); // the flicker
    want = Math.min(LAMP.top, want);
    lampNow += (want - lampNow) * Math.min(1, dt * (st === 'unloading' ? 1.5 : 3)); // eases, never jumps
    try { document.documentElement.style.setProperty('--cube-light', lampNow.toFixed(3)); } catch {}
  }
  const toHex = (c) => { const m = /rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(c || ''); return m ? '#' + [m[1], m[2], m[3]].map((v) => (+v).toString(16).padStart(2, '0')).join('') : String(c || '').trim(); };
  let roomAt = 0, roomNow = '';
  const room = () => { const t = performance.now(); if (t - roomAt > 1000) { roomAt = t; try { roomNow = toHex(getComputedStyle(document.body).getPropertyValue('--bg')); } catch {} } return roomNow; }; // the theme's background, read once a second
  const fog = createFog(fogCanvas, { colour: () => view.oneColour(), room, still, onLight: glint, onFrame: lampTick });
  const ripple = () => { if (still()) return; port.classList.remove('ripple'); void port.offsetWidth; port.classList.add('ripple'); setTimeout(() => port.classList.remove('ripple'), 1300); };
  view.set({ glow: 0.6, glass: 0.3, edges: true }); // edges: a faint outline, so it reads as a cube. Glow: bright enough to see the experts in use, still short of the white flash (above 0.6)
  view.set({ fog: true, fogLight: (c, s, x, y) => fog.light(c, s, x, y) }); // see-through, so the fog shows behind; the firing lights it
  // Turning: on to begin with, at the big viewer's slowest speed (0.05 a second, about two minutes a turn). Remembered.
  // Never while animations are off.
  const SPIN = 0.05;
  let turning = !avatar; try { if (!avatar) turning = localStorage.getItem('bob-cube-spin') !== '0'; } catch {}
  let connected = false, spinRaf = 0, spinLast = 0;
  function spinTick(now) {
    spinRaf = 0;
    if (!connected || !turning || still() || (!rec && !shell)) { spinLast = 0; return; }
    const dt = spinLast ? Math.min(0.1, Math.max(0, (now - spinLast) / 1000)) : 0; spinLast = now;
    view.set({ yaw: view.get().yaw + dt * SPIN });
    if (!raf && !view.loading()) view.draw(rec ? lit() : showLit()); // while a reply plays, or the block builds, those frames draw it
    spinRaf = requestAnimationFrame(spinTick);
  }
  const spinGo = () => { if (!spinRaf && connected && turning && !still() && (rec || shell) && globalThis.requestAnimationFrame) { spinLast = 0; spinRaf = requestAnimationFrame(spinTick); } };
  const showSpin = () => { if (spin) { spin.textContent = turning ? 'Stop turning' : 'Turn slowly'; spin.hidden = !showDetails; } };
  if (spin) spin.onclick = () => { turning = !turning; try { localStorage.setItem('bob-cube-spin', turning ? '1' : '0'); } catch {} showSpin(); spinGo(); };
  // How bright the lines between the experts in use are: the person's pick, shared with the big viewer
  { let v = 0.5; try { const s = localStorage.getItem('bob-fnri-lines'); if (s !== null && Number.isFinite(Number(s))) v = Math.max(0, Math.min(1, Number(s))); } catch {} view.set({ lines: v }); if (lines) lines.value = String(v); }
  if (lines) lines.oninput = () => { view.set({ lines: Number(lines.value) }); try { localStorage.setItem('bob-fnri-lines', String(lines.value)); } catch {} if (rec && !raf) view.draw(lit()); };
  // One colour: a quick switch, remembered. Every expert the same colour, so only what lights up stands out.
  // Load in: how the block builds itself (and comes apart), the person's pick, shared with the big viewer
  let whose = '', gen = 0;
  let loadNow = 'vase';
  const inMs = () => (loadNow === 'vase' ? VASE_IN_MS : CUBE_IN_MS);
  let unloadNow = 'drain';
  const outMs = () => (unloadNow === 'drain' ? DRAIN_OUT_MS : CUBE_OUT_MS);
  const readUnload = () => { let s = unloadNow; try { const x = localStorage.getItem('bob-fnri-unload'); if (x) s = unloadStyle(x); } catch {} unloadNow = s; view.set({ unload: s }); if (unload) unload.value = s; };
  if (unload) { for (const [id, label] of UNLOAD_STYLES) { const o = document.createElement('option'); o.value = id; o.textContent = label; unload.append(o); } unload.onchange = () => { const v = unloadStyle(unload.value); try { localStorage.setItem('bob-fnri-unload', v); } catch {} unloadNow = v; view.set({ unload: v }); }; }
  readUnload();
  const readLoad = () => { let s = loadNow; try { const x = localStorage.getItem('bob-fnri-load'); if (x) s = loadStyle(x); } catch {} loadNow = s; view.set({ load: s }); if (load) load.value = s; };
  if (load) { for (const [id, label] of LOAD_STYLES) { const o = document.createElement('option'); o.value = id; o.textContent = label; load.append(o); } load.onchange = () => { const v = loadStyle(load.value); try { localStorage.setItem('bob-fnri-load', v); } catch {} loadNow = v; view.set({ load: v }); if (rec) { view.set({ reveal: 0 }); view.sweep(1, inMs(), still()).then(() => { if (rec) view.draw(lit()); }); } }; }
  readLoad();
  let showDetails = false; try { showDetails = localStorage.getItem('bob-cube-details') === '1'; } catch {} // to begin with: just the cube, Open in the big viewer and Show details
  let one = false; try { one = localStorage.getItem('bob-cube-mono') === '1'; } catch {}
  const showOne = () => { view.set({ mono: one || !look }); if (mono) { mono.textContent = one ? 'Skill colours' : 'One colour'; mono.hidden = !look || !showDetails; } if (colourBox) colourBox.hidden = !(one || !look) || !rec || !showDetails; if (loadBox) loadBox.hidden = !showDetails; if (linesBox) linesBox.hidden = !showDetails; showSpin(); if (key && look) key.classList.toggle('off', one); };
  // the one colour is the person's to pick (it is also the colour of a brain with no scan yet), and it is remembered
  const keepC = (c) => { if (/^#[0-9a-f]{6}$/i.test(c || '')) { view.set({ monoColour: c }); if (colour) colour.value = c; return true; } return false; };
  let ownColour = false; try { ownColour = keepC(localStorage.getItem('bob-cube-colour')); } catch {}
  // With no colour of the person's own, the one colour is the theme's cube colour (watch-view.js reads it at every
  // drawing, so it follows theme changes); this keeps the colour box showing it
  const tint = () => { if (ownColour) return; if (colour) colour.value = view.oneColour(); };
  tint();
  // The theme changed: the cube takes its new colour (and the new background) at once, resting or not
  const retint = () => { tint(); view.set({}); if (rec) view.draw(lit()); else if (shell && !showTimer) view.draw([]); };
  try { if (globalThis.MutationObserver && document.documentElement) new MutationObserver(retint).observe(document.documentElement, { attributes: true, attributeFilter: ['style', 'class', 'data-theme'] }); } catch {}
  if (colour) colour.oninput = () => { if (keepC(colour.value)) { ownColour = true; try { localStorage.setItem('bob-cube-colour', colour.value); } catch {} if (rec) view.draw(lit()); } };
  // Hide details: only the picture stays (the colour choices go with the details). The words are still there for a screen reader.
  const showD = () => { says.classList.toggle('sr-only', !showDetails); if (key) key.classList.toggle('sr-only', !showDetails); if (details) { details.textContent = showDetails ? 'Hide details' : 'Show details'; } showOne(); };
  if (details) details.onclick = () => { showDetails = !showDetails; try { localStorage.setItem('bob-cube-details', showDetails ? '1' : '0'); } catch {} showD(); };
  showD();
  if (mono) mono.onclick = () => { one = !one; try { localStorage.setItem('bob-cube-mono', one ? '1' : '0'); } catch {} showOne(); if (rec) view.draw(lit()); };

  // 1.5.210: a screen reader hears the cube's state in a few words, once each time it changes (not every word of a
  // reply, which the line under the cube follows), and the picture's own label says the same.
  const srLive = typeof document !== 'undefined' ? document.getElementById?.('mindCubeState') ?? null : null;
  let srLast = '';
  function words() { wordsNow(); const now = cubeState({ why, rec, leaving, shell, loadingNow, phase, busy, empty: known && !anyLoaded }); if (now !== srLast) { srLast = now; canvas.setAttribute?.('aria-label', now); if (srLive) srLive.textContent = now; } }
  function wordsNow() {
    const shape = shell ? ` ${shell.label}: ${shell.layers} floors of ${shell.experts} ${shell.kind === 'neurons' ? 'neuron groups' : 'experts'}.` : '';
    if (why) { says.textContent = why + shape; return; }
    const empty = known && !anyLoaded;
    if (!rec) {
      open.hidden = true; if (key) key.hidden = true;
      if (leaving && shell) { says.textContent = `Letting go of the brain.${shape} The cube takes itself apart.`; return; }
      if (!live()) { says.textContent = !shell && empty ? 'No brain is loaded right now: only fog in the porthole. The cube builds itself when Bob loads one.' : shell ? (phase === 'wait' ? `Thinking it over.${shape} The cube pulses until he starts to answer.` : busy ? `Answering.${shape} The glow is for show, not the experts he really uses (Real experts shows those).` : loadingNow === shell.label ? `Loading${shape} The cube glows while he thinks.` : `Ready.${shape} The cube glows while he thinks.`) : known && anyLoaded ? 'A brain is loaded, but Bob can\'t read its shape, so the cube has nothing to build.' : 'Waiting for Bob to load a brain. The cube builds itself when he does, and glows while he thinks.'; return; }
      says.textContent = !shell && empty ? 'No brain is loaded right now: only fog in the porthole. The cube builds itself when Bob loads one.' : shell ? (loadingNow === shell.label ? `Loading${shape} The cube lights up with the experts he used when he finishes a reply.` : `Ready.${shape} The cube lights up with the experts he used when he finishes a reply.`) : 'Waiting for Bob\'s next reply. The cube lights up with the experts he used when he finishes it. Replies come slower while Real experts is on.'; return;
    }
    const c = rec.clips[clip], w = Math.min(c.e.length - 1, Math.floor(t));
    const pt = partOf(c, w), text = c.words.slice(pt.from, w + 1).join('').replace(SPECIAL, '').replace(/\s+/g, ' ').trim();
    const picks = c.e[w].reduce((a, l) => a + l.length, 0);
    let whose = '';
    if (look) { const ls = litSkills(look, c.e[w]); const names = ls.skills.slice(0, 3).map((x) => `${x.label} ${x.n}`); if (ls.evens) names.push(`all-rounders ${ls.evens}`); if (names.length) whose = `: ${names.join(', ')}`; }
    says.textContent = say(rec, `${PART_LABEL[pt.part] === 'Question' ? 'Reading' : PART_LABEL[pt.part]}: ${text.length > 90 ? '…' + text.slice(-90) : text} (word ${w + 1} of ${c.e.length}, ${picks} experts${whose})`);
  }
  function lit() {
    const c = rec.clips[clip], i = Math.min(c.e.length - 1, Math.floor(t)), frac = t - i, out = [];
    for (let k = 5; k >= 0; k--) if (i - k >= 0) out.push({ e: c.e[i - k], age: k === 0 ? 0 : Math.min(1, (k + frac) / 6) });
    return out;
  }
  function frame(now) {
    raf = 0; if (!rec) return;
    const c = rec.clips[clip], dt = Math.max(0, Math.min(0.1, (now - last) / 1000 || 0)); last = now; // a frame can be stamped a little before play() began
    const was = Math.floor(t);
    t = Math.min(c.e.length - 1, t + dt * CUBE_SPEED);
    view.draw(lit()); if (Math.floor(t) !== was) words();
    if (t < c.e.length - 1) raf = requestAnimationFrame(frame);
  }
  function play() {
    if (!rec) return;
    cancelAnimationFrame(raf); raf = 0;
    const c = rec.clips[clip];
    if (still()) { t = c.e.length - 1; view.draw(lit()); words(); return; }
    t = Math.max(0, c.prompt - 6); last = performance.now(); words(); raf = requestAnimationFrame(frame);
  }
  // The made-up glow: a new word every SHOW_MS while Bob thinks; when he stops, the trail fades and drawing stops.
  function showTick() {
    showTimer = 0; if (rec || !shell) { show = []; return; }
    show = show.map((w) => ({ e: w.e, a: w.a + 1 })).filter((w) => w.a < SHOW_TRAIL); // every glow fades a step
    if (busy) show.push({ e: showWord(show[show.length - 1]?.e, shell.layers, shell.experts, shell.used), a: 0 });
    view.draw(show.map((w) => ({ e: w.e, age: w.a / SHOW_TRAIL })));
    if (busy || show.length) showTimer = setTimeout(showTick, SHOW_MS); else view.draw([]);
  }
  // Resting: mostly still, and every few seconds a few neurons fire and fade, for effect. Only while the section shows.
  function sparkSoon() {
    clearTimeout(sparkTimer); sparkTimer = 0;
    if (!showing || phase !== 'idle' || live() || rec || still()) return;
    sparkTimer = setTimeout(() => { sparkTimer = 0; if (!showing || phase !== 'idle' || rec || !shell || showTimer || still() || live()) { sparkSoon(); return; } show = [{ e: sparkWord(shell.layers, shell.experts), a: -1 }]; showTimer = setTimeout(showTick, 0); sparkSoon(); }, SPARK_MS[0] + Math.random() * (SPARK_MS[1] - SPARK_MS[0]));
  }
  function setPhase(p) {
    if (p === phase) return; phase = p;
    pulse(p === 'wait' && !live() && !rec);
    setBusy(p === 'run');
    sparkSoon();
  }
  function setBusy(on) {
    if (on === busy) { words(); return; } busy = on;
    if (live() || rec || !shell) { words(); return; }
    if (on) tint();
    if (still()) { show = []; view.draw(on ? [{ e: showWord(null, shell.layers, shell.experts, shell.used), age: 0 }] : []); words(); return; } // animations off: one still glow, nothing moves
    if (!showTimer) showTimer = setTimeout(showTick, 0);
    words();
  }
  const showLit = () => show.map((w) => ({ e: w.e, age: Math.max(0, w.a) / SHOW_TRAIL })); // the made-up glow as it stands, for a frame drawn by the turning
  function stopShow() { clearTimeout(showTimer); showTimer = 0; show = []; clearTimeout(liveTimer); liveTimer = 0; liveQ = []; }
  // 1.5.210 Real experts, live: Brain Engine 5 sends the picks with every word, so the cube lights up with the experts
  // he really uses as he reads and writes, not after. A long prompt arrives at once and plays fast; then a word at a time.
  let liveQ = [], liveTimer = 0, streamed = false;
  function part(p) {
    const fits = (x) => x && x.experts === p.experts && x.layers === p.layers;
    if (!(rec ? fits(rec.brain) : fits(shell))) return; // a brain of another shape: the full trace at the end sets it up
    streamed = true; cancelAnimationFrame(raf); raf = 0;
    p.e.forEach((e, i) => liveQ.push({ e, w: p.words[i] || '', reading: p.from + i < p.prompt }));
    if (still()) { const last = liveQ[liveQ.length - 1]; liveQ = []; show = [{ e: last.e, a: 0 }]; view.draw([{ e: last.e, age: 0 }]); return; }
    if (!liveTimer) liveTimer = setTimeout(liveTick, 0);
  }
  function liveTick() {
    liveTimer = 0;
    show = show.map((w) => ({ e: w.e, a: w.a + 1 })).filter((w) => w.a < SHOW_TRAIL);
    if (liveQ.length) {
      const n = liveQ.length > 12 ? Math.ceil(liveQ.length / 6) : 1, got = liveQ.splice(0, n), last = got[got.length - 1];
      show.push({ e: last.e, a: 0 });
      if (showDetails || !avatar) says.textContent = `${last.reading ? 'Reading' : 'Writing'}: …${got.map((x) => x.w).join('').replace(SPECIAL, '').replace(/\s+/g, ' ').slice(-60)} (the experts he's using right now)`;
    }
    view.draw(show.map((w) => ({ e: w.e, age: w.a / SHOW_TRAIL })));
    if (liveQ.length || show.length) liveTimer = setTimeout(liveTick, SHOW_MS);
  }
  function add(tr) {
    const map = tr.map || null; if (map) { tr = { ...tr }; delete tr.map; }
    traces.push(tr); traces = traces.slice(-6);
    const r = liveRecording(traces, tr.label || 'Bob'); if (!r) return;
    stopShow();
    const built = !rec && shell && shell.label === (tr.label || 'Bob') && shell.experts === tr.experts && shell.layers === tr.layers; // the empty shape is already up
    const fresh = !built && (!rec || whose !== (tr.label || 'Bob')); whose = tr.label || 'Bob'; gen++; shell = null;
    const was = streamed; streamed = false; // this reply already played live, word by word: no replay
    rec = r; clip = rec.clips.length - 1;
    look = mapLook(map, { experts: rec.brain.experts, layers: rec.brain.layers, kind: rec.brain.kind });
    sp = look ? look.sp : specialise(rec);
    view.setData(look ? { ...rec, skills: look.skills } : rec, sp, null); view.set({ gap: view.cubeGap(), key: !look });
    if (key) { // the colours in words and letters, under the picture (the picture is too small to carry them itself)
      key.hidden = false; key.textContent = '';
      if (look) {
        look.skills.forEach((s, i) => { const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = lookOf(i)[0]; sw.textContent = lookOf(i)[1]; const it = document.createElement('span'); it.className = 'it'; it.append(sw, ` ${s.label}`); key.append(it); });
        const it = document.createElement('span'); it.className = 'it'; const sw = document.createElement('span'); sw.className = 'sw even'; it.append(sw, ' All-rounders (every skill alike)'); key.append(it);
        const from = document.createElement('span'); from.className = 'from'; from.textContent = `Colours from this brain's latest ${NAME} scan${map.name ? `, "${map.name}"` : ''}.`; key.append(from);
      } else key.textContent = `One colour for now: this brain has no ${NAME} scan yet. Make one in the Lab (${NAME}) and the cube colours every expert by its skill.`;
    }
    open.hidden = false; showOne();
    // a brain's first reply: the block builds itself block by block, then the reply plays
    spinGo();
    if (fresh && !still()) { readLoad(); const g = gen; view.set({ reveal: 0 }); words(); view.sweep(1, inMs()).then(() => { if (g === gen) play(); }); return; }
    if (was) { t = rec.clips[clip].e.length - 1; view.draw(lit()); words(); return; }
    play();
  }
  // The brain was let go: the block comes apart block by block until nothing is left, then waits for the next reply.
  // The brain's empty shape, in one colour: built block by block when a brain starts loading (or is found loaded), then
  // still. A reply's trace takes over from it without building again.
  function ready(shapes, loading = '') {
    if (Array.isArray(shapes)) { lastShapes = shapes; lastLoading = String(loading || ''); }
    if (rec || !Array.isArray(shapes) || !shapes.length) return false;
    const s = shapes.find((x) => x.label === loading) || shapes[shapes.length - 1];
    if (!s || !(s.experts > 0) || !(s.layers > 0)) return false;
    loadingNow = String(loading || '');
    if (shell && shell.label === s.label && shell.experts === s.experts && shell.layers === s.layers) { words(); return true; }
    shell = { label: String(s.label || 'Bob'), experts: Math.min(4096, Math.floor(s.experts)), layers: Math.min(512, Math.floor(s.layers)), kind: s.kind === 'neurons' ? 'neurons' : 'experts', used: Math.max(0, Math.floor(Number(s.used) || 0)) };
    const empty = { name: shell.label, brain: { name: shell.label, experts: shell.experts, layers: shell.layers, used: 0, kind: shell.kind, neurons: 0 }, skills: [{ id: 'bob', label: 'Bob' }], clips: [] };
    let esp = null; try { esp = specialise(empty); } catch { esp = null; }
    if (!esp) { shell = null; return false; }
    esp = { ...esp, top: esp.top.map((r) => r.map(() => 0)) }; // the whole shape in the one colour (the theme's, or the person's own), not only the glow
    gen++; leaving = false; look = null; stopShow(); tint(); view.setData(empty, esp, null); view.set({ gap: view.cubeGap(), key: false, mono: true });
    if (key) key.hidden = true; open.hidden = true; showOne();
    const draw = () => view.draw([]);
    if (still()) { view.set({ reveal: 1 }); draw(); } else { readLoad(); view.set({ reveal: 0 }); fog.light(view.oneColour(), 0.35); view.sweep(1, inMs()).then(() => { fog.light(view.oneColour(), 0.7); draw(); }); } // the room lights up as the brain switches on
    if (busy && !live() && !still() && !showTimer) showTimer = setTimeout(showTick, inMs()); // already thinking: the glow starts once the block is built
    words(); spinGo(); return true;
  }
  function gone(labels, shapes = null, loading = '') {
    if (!rec && shell) { // only the empty shape is up: it goes when its brain does, or becomes the new one
      const keep = (Array.isArray(labels) && labels.includes(shell.label)) || loading === shell.label;
      if (keep) { if (leaving) { leaving = false; ++gen; readLoad(); view.sweep(1, inMs(), still()).then(() => view.draw([])); } loadingNow = String(loading || ''); words(); return; } // back before it was gone: it builds itself again
      const g = ++gen; const next = shapes; stopShow(); leaving = true; words(); fog.light(view.oneColour(), 0.5); // a last glow, fading as the block drains
      view.sweep(0, outMs(), still()).then(() => { if (g !== gen) return; leaving = false; shell = null; const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); if (!ready(next, loading)) words(); });
      return;
    }
    if (!rec) { ready(shapes, loading); return; }
    if (Array.isArray(labels) && labels.includes(whose)) return;
    const g = ++gen; cancelAnimationFrame(raf); raf = 0;
    const clear = () => { if (g !== gen) return; rec = null; sp = null; look = null; traces = []; whose = ''; view.set({ reveal: 1 }); const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); words(); showOne(); ready(shapes, loading); };
    view.sweep(0, outMs(), still()).then(clear);
  }
  function on(ev) {
    let j = null; try { j = JSON.parse(ev.data); } catch { return; }
    if (j?.type === 'cube-brains') { known = true; anyLoaded = (Array.isArray(j.labels) && j.labels.length > 0) || Boolean(j.loading); gone(j.labels, j.shapes, j.loading); words(); return; }
    // the glow for show: a pulse from the message sent to his first word, then running while he writes
    if (j?.type === 'start') { ripple(); setPhase('wait'); return; }
    if (j?.type === 'token') { setPhase('run'); return; }
    if (j?.type === 'done' || j?.type === 'error') { setPhase('idle'); return; }
    if (j?.type === 'status') { const on = j.state === 'thinking' || j.state === 'busy'; if (!on) setPhase('idle'); else if (phase === 'idle') setPhase('run'); return; } // work that isn't a chat reply runs too
    if (j?.type === 'cube') { why = j.ok ? '' : String(j.why || ''); words(); try { onWhy?.(why); } catch {} } else if (j?.type === 'trace' && live()) { why = ''; add(j); } else if (j?.type === 'trace-part' && live()) part(j);
  }
  open.onclick = () => {
    if (!rec) return;
    const w = window.open('/watch.html', 'bob-watch', 'popup,width=1180,height=820');
    if (!w) { says.textContent = 'The viewer window was blocked. Allow pop-ups for Bob\'s page, then press it again.'; return; }
    const give = () => { try { w.bobWatch?.load(JSON.parse(JSON.stringify(rec))); } catch {} };
    w.addEventListener('load', () => setTimeout(give, 300)); setTimeout(give, 1500);
  };
  return {
    name: NAME,
    connect() { connected = true; showing = true; fog.start(); sparkSoon(); spinGo(); box.hidden = false; if (!es && EventSourceImpl) { es = new EventSourceImpl(live() ? '/api/events?cube=1&live=1' : '/api/events?cube=1'); es.onmessage = on; } words(); if (rec) view.draw(lit()); },
    disconnect() { connected = false; fog.stop(); if (es) { es.close(); es = null; } cancelAnimationFrame(raf); raf = 0; cancelAnimationFrame(spinRaf); spinRaf = 0; stopShow(); busy = false; phase = 'idle'; pulse(false); showing = false; clearTimeout(sparkTimer); sparkTimer = 0; },
    // Real experts switched on or off: the real picture (if any) goes, and the brain's shape stays up for the next mode
    relive() { const had = Boolean(es); if (es) { es.close(); es = null; } cancelAnimationFrame(raf); raf = 0; stopShow(); busy = false; phase = 'idle'; pulse(false); why = '';
      if (rec) { gen++; rec = null; sp = null; look = null; traces = []; whose = ''; view.set({ reveal: 1 }); const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); showOne(); ready(lastShapes, lastLoading); } else if (shell) view.draw([]);
      if (had) this.connect(); else words(); },
    hide() { box.hidden = true; },
    add, gone, get rec() { return rec; }
  };
}
