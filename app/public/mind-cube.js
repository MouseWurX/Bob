// FNRI in small: a cube of Bob's brain in "Bob's thinking" (Now running), lighting up with the experts each reply
// used. Off until its switch is turned on. While it's on it listens to /api/events?cube=1, and only then does Bob ask
// Brain Engine for the trace (public/lab-watch-math.js liveTrace has the shape). The picture arrives when a reply is
// finished and is then played word by word; nothing is saved. The same drawing as the big viewer (watch-view.js).
import { createView } from './watch-view.js';
import { specialise, liveRecording, partOf, PART_LABEL, say, NAME, mapLook, litSkills, lookOf, LOAD_STYLES, loadStyle } from './lab-watch-math.js';

const SPECIAL = /<\|[^|>]*\|>|<\/?think>/gi;
export const CUBE_SPEED = 14; // words a second
export const SIGNS = ['VACANCY', 'Nobody\'s home', 'Out to lunch', 'Gone thinkin\'', 'Brain not found'];
export const pickSign = (rnd = Math.random) => SIGNS[Math.floor(rnd() * SIGNS.length) % SIGNS.length];
export const CUBE_IN_MS = 1600, CUBE_OUT_MS = 1100; // the block building itself when a brain's first reply arrives, and coming apart when the brain is let go

// The colours: when this brain has an FNRI scan, Bob sends that scan's map along and every expert gets its skill's
// colour (all-rounders a dashed white outline); with no scan the cube is one colour and says how to get the rest.
// els: { box, canvas, says, open, key, mono, colour, colourBox, details, load, loadBox, spin, lines, linesBox }. still() = animations are off (the last word is shown, nothing moves).
export function createMindCube({ box, canvas, says, open, key = null, mono = null, colour = null, colourBox = null, details = null, load = null, loadBox = null, spin = null, lines = null, linesBox = null }, { still = () => false, onWhy = null, EventSourceImpl = globalThis.EventSource } = {}) {
  const view = createView(canvas);
  let es = null, traces = [], rec = null, sp = null, clip = -1, t = 0, raf = 0, last = 0, why = '', look = null;
  // Before the first reply (and on an engine that can't report experts) the cube is the brain's empty shape in one
  // colour, built block by block as the brain loads, then still until Bob thinks. shell = { label, experts, layers, kind }.
  let shell = null, loadingNow = '', known = false;
  // No brain loaded: a blinking neon sign over the empty canvas, a different one each time (the owner's five).
  const sign = document.createElement('p'); sign.className = 'mind-cube-sign'; sign.setAttribute('aria-hidden', 'true'); sign.hidden = true;
  canvas.insertAdjacentElement('afterend', sign);
  let signNow = '';
  const showSign = (on) => { if (on && !signNow) signNow = pickSign(); if (!on) signNow = ''; sign.textContent = signNow; sign.hidden = !on; };
  view.set({ glow: 0.6, glass: 0.3 }); // bright enough to see the experts in use, still short of the white flash (above 0.6)
  // Turning: on to begin with, at the big viewer's slowest speed (0.05 a second, about two minutes a turn). Remembered.
  // Never while animations are off.
  const SPIN = 0.05;
  let turning = true; try { turning = localStorage.getItem('bob-cube-spin') !== '0'; } catch {}
  let connected = false, spinRaf = 0, spinLast = 0;
  function spinTick(now) {
    spinRaf = 0;
    if (!connected || !turning || still() || (!rec && !shell)) { spinLast = 0; return; }
    const dt = spinLast ? Math.min(0.1, Math.max(0, (now - spinLast) / 1000)) : 0; spinLast = now;
    view.set({ yaw: view.get().yaw + dt * SPIN });
    if (!raf && !view.loading()) view.draw(rec ? lit() : []); // while a reply plays, or the block builds, those frames draw it
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
  const readLoad = () => { let s = 'random'; try { s = loadStyle(localStorage.getItem('bob-fnri-load')); } catch {} view.set({ load: s }); if (load) load.value = s; };
  if (load) { for (const [id, label] of LOAD_STYLES) { const o = document.createElement('option'); o.value = id; o.textContent = label; load.append(o); } load.onchange = () => { try { localStorage.setItem('bob-fnri-load', loadStyle(load.value)); } catch {} readLoad(); if (rec) { view.set({ reveal: 0 }); view.sweep(1, CUBE_IN_MS, still()).then(() => { if (rec) view.draw(lit()); }); } }; }
  readLoad();
  let showDetails = false; try { showDetails = localStorage.getItem('bob-cube-details') === '1'; } catch {} // to begin with: just the cube, Open in the big viewer and Show details
  let one = false; try { one = localStorage.getItem('bob-cube-mono') === '1'; } catch {}
  const showOne = () => { view.set({ mono: one || !look }); if (mono) { mono.textContent = one ? 'Skill colours' : 'One colour'; mono.hidden = !look || !showDetails; } if (colourBox) colourBox.hidden = !(one || !look) || !rec || !showDetails; if (loadBox) loadBox.hidden = !showDetails; if (linesBox) linesBox.hidden = !showDetails; showSpin(); if (key && look) key.classList.toggle('off', one); };
  // the one colour is the person's to pick (it is also the colour of a brain with no scan yet), and it is remembered
  const keepC = (c) => { if (/^#[0-9a-f]{6}$/i.test(c || '')) { view.set({ monoColour: c }); if (colour) colour.value = c; return true; } return false; };
  let picked = false; try { picked = keepC(localStorage.getItem('bob-cube-colour')); } catch {}
  if (!picked && colour) colour.value = view.oneColour(); // the theme's colour (Moondust: #03666d) until the person picks one
  if (colour) colour.oninput = () => { if (keepC(colour.value)) { try { localStorage.setItem('bob-cube-colour', colour.value); } catch {} if (rec) view.draw(lit()); } };
  // Hide details: only the picture stays (the colour choices go with the details). The words are still there for a screen reader.
  const showD = () => { says.classList.toggle('sr-only', !showDetails); if (key) key.classList.toggle('sr-only', !showDetails); if (details) { details.textContent = showDetails ? 'Hide details' : 'Show details'; } showOne(); };
  if (details) details.onclick = () => { showDetails = !showDetails; try { localStorage.setItem('bob-cube-details', showDetails ? '1' : '0'); } catch {} showD(); };
  showD();
  if (mono) mono.onclick = () => { one = !one; try { localStorage.setItem('bob-cube-mono', one ? '1' : '0'); } catch {} showOne(); if (rec) view.draw(lit()); };

  function words() {
    const shape = shell ? ` ${shell.label}: ${shell.layers} floors of ${shell.experts} ${shell.kind === 'neurons' ? 'neuron groups' : 'experts'}.` : '';
    if (why) { says.textContent = why + shape; return; }
    showSign(!rec && !shell && known);
    if (!rec) { open.hidden = true; if (key) key.hidden = true; says.textContent = !shell && known ? `No brain is loaded right now. The sign says: ${signNow}. The cube builds itself when Bob loads one.` : shell ? (loadingNow === shell.label ? `Loading${shape} The cube lights up when he thinks.` : `Ready.${shape} The cube lights up when he thinks.`) : 'Waiting for Bob\'s next reply. The cube lights up when he finishes it. Replies come a little slower while this is on.'; return; }
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
  function add(tr) {
    const map = tr.map || null; if (map) { tr = { ...tr }; delete tr.map; }
    traces.push(tr); traces = traces.slice(-6);
    const r = liveRecording(traces, tr.label || 'Bob'); if (!r) return;
    const built = !rec && shell && shell.label === (tr.label || 'Bob') && shell.experts === tr.experts && shell.layers === tr.layers; // the empty shape is already up
    const fresh = !built && (!rec || whose !== (tr.label || 'Bob')); whose = tr.label || 'Bob'; gen++; shell = null;
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
    if (fresh && !still()) { readLoad(); const g = gen; view.set({ reveal: 0 }); words(); view.sweep(1, CUBE_IN_MS).then(() => { if (g === gen) play(); }); return; }
    play();
  }
  // The brain was let go: the block comes apart block by block until nothing is left, then waits for the next reply.
  // The brain's empty shape, in one colour: built block by block when a brain starts loading (or is found loaded), then
  // still. A reply's trace takes over from it without building again.
  function ready(shapes, loading = '') {
    if (rec || !Array.isArray(shapes) || !shapes.length) return false;
    const s = shapes.find((x) => x.label === loading) || shapes[shapes.length - 1];
    if (!s || !(s.experts > 0) || !(s.layers > 0)) return false;
    loadingNow = String(loading || '');
    if (shell && shell.label === s.label && shell.experts === s.experts && shell.layers === s.layers) { words(); return true; }
    shell = { label: String(s.label || 'Bob'), experts: Math.min(4096, Math.floor(s.experts)), layers: Math.min(512, Math.floor(s.layers)), kind: s.kind === 'neurons' ? 'neurons' : 'experts' };
    const empty = { name: shell.label, brain: { name: shell.label, experts: shell.experts, layers: shell.layers, used: 0, kind: shell.kind, neurons: 0 }, skills: [{ id: 'bob', label: 'Bob' }], clips: [] };
    let esp = null; try { esp = specialise(empty); } catch { esp = null; }
    if (!esp) { shell = null; return false; }
    gen++; look = null; view.setData(empty, esp, null); view.set({ gap: view.cubeGap(), key: false, mono: true });
    if (key) key.hidden = true; open.hidden = true; showOne();
    const draw = () => view.draw([]);
    if (still()) { view.set({ reveal: 1 }); draw(); } else { readLoad(); view.set({ reveal: 0 }); view.sweep(1, CUBE_IN_MS).then(draw); }
    words(); spinGo(); return true;
  }
  function gone(labels, shapes = null, loading = '') {
    if (!rec && shell) { // only the empty shape is up: it goes when its brain does, or becomes the new one
      const keep = (Array.isArray(labels) && labels.includes(shell.label)) || loading === shell.label;
      if (keep) { loadingNow = String(loading || ''); words(); return; }
      const g = ++gen; const next = shapes;
      view.sweep(0, CUBE_OUT_MS, still()).then(() => { if (g !== gen) return; shell = null; const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); if (!ready(next, loading)) words(); });
      return;
    }
    if (!rec) { ready(shapes, loading); return; }
    if (Array.isArray(labels) && labels.includes(whose)) return;
    const g = ++gen; cancelAnimationFrame(raf); raf = 0;
    const clear = () => { if (g !== gen) return; rec = null; sp = null; look = null; traces = []; whose = ''; view.set({ reveal: 1 }); const c = canvas.getContext('2d'); c.clearRect(0, 0, canvas.width, canvas.height); words(); showOne(); ready(shapes, loading); };
    view.sweep(0, CUBE_OUT_MS, still()).then(clear);
  }
  function on(ev) {
    let j = null; try { j = JSON.parse(ev.data); } catch { return; }
    if (j?.type === 'cube-brains') { known = true; gone(j.labels, j.shapes, j.loading); words(); return; }
    if (j?.type === 'cube') { why = j.ok ? '' : String(j.why || ''); words(); try { onWhy?.(why); } catch {} } else if (j?.type === 'trace') { why = ''; add(j); }
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
    connect() { connected = true; spinGo(); box.hidden = false; if (!es && EventSourceImpl) { es = new EventSourceImpl('/api/events?cube=1'); es.onmessage = on; } words(); if (rec) view.draw(lit()); },
    disconnect() { connected = false; if (es) { es.close(); es = null; } cancelAnimationFrame(raf); raf = 0; cancelAnimationFrame(spinRaf); spinRaf = 0; },
    hide() { box.hidden = true; },
    add, gone, get rec() { return rec; }
  };
}
