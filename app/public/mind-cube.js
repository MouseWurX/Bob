// aiFEUI in small: a cube of Bob's brain in "Bob's thinking" (Now running), lighting up with the experts each reply
// used. Off until its switch is turned on. While it's on it listens to /api/events?cube=1, and only then does Bob ask
// Brain Engine for the trace (public/lab-watch-math.js liveTrace has the shape). The picture arrives when a reply is
// finished and is then played word by word; nothing is saved. The same drawing as the big viewer (watch-view.js).
import { createView } from './watch-view.js';
import { specialise, liveRecording, partOf, PART_LABEL, say, NAME, mapLook, litSkills, lookOf } from './lab-watch-math.js';

const SPECIAL = /<\|[^|>]*\|>|<\/?think>/gi;
export const CUBE_SPEED = 14; // words a second

// The colours: when this brain has an aiFEUI scan, Bob sends that scan's map along and every expert gets its skill's
// colour (all-rounders a soft white outline); with no scan the cube is one colour and says how to get the rest.
// els: { box, canvas, says, open, key, mono, colour, colourBox, details }. still() = animations are off (the last word is shown, nothing moves).
export function createMindCube({ box, canvas, says, open, key = null, mono = null, colour = null, colourBox = null, details = null }, { still = () => false, EventSourceImpl = globalThis.EventSource } = {}) {
  const view = createView(canvas);
  let es = null, traces = [], rec = null, sp = null, clip = -1, t = 0, raf = 0, last = 0, why = '', look = null;
  view.set({ glow: 0.4, glass: 0.3 });
  // One colour: a quick switch, remembered. Every expert the same colour, so only what lights up stands out.
  let showDetails = true; try { showDetails = localStorage.getItem('bob-cube-details') !== '0'; } catch {}
  let one = false; try { one = localStorage.getItem('bob-cube-mono') === '1'; } catch {}
  const showOne = () => { view.set({ mono: one || !look }); if (mono) { mono.setAttribute('aria-pressed', String(one)); mono.textContent = one ? 'Skill colours' : 'One colour'; mono.hidden = !look || !showDetails; } if (colourBox) colourBox.hidden = !(one || !look) || !rec || !showDetails; if (key && look) key.classList.toggle('off', one); };
  // the one colour is the person's to pick (it is also the colour of a brain with no scan yet), and it is remembered
  const keepC = (c) => { if (/^#[0-9a-f]{6}$/i.test(c || '')) { view.set({ monoColour: c }); if (colour) colour.value = c; return true; } return false; };
  try { keepC(localStorage.getItem('bob-cube-colour')); } catch {}
  if (colour) colour.oninput = () => { if (keepC(colour.value)) { try { localStorage.setItem('bob-cube-colour', colour.value); } catch {} if (rec) view.draw(lit()); } };
  // Hide details: only the picture stays (the colour choices go with the details). The words are still there for a screen reader.
  const showD = () => { says.classList.toggle('sr-only', !showDetails); if (key) key.classList.toggle('sr-only', !showDetails); if (details) { details.setAttribute('aria-pressed', String(showDetails)); details.textContent = showDetails ? 'Hide details' : 'Show details'; } showOne(); };
  if (details) details.onclick = () => { showDetails = !showDetails; try { localStorage.setItem('bob-cube-details', showDetails ? '1' : '0'); } catch {} showD(); };
  showD();
  if (mono) mono.onclick = () => { one = !one; try { localStorage.setItem('bob-cube-mono', one ? '1' : '0'); } catch {} showOne(); if (rec) view.draw(lit()); };

  function words() {
    if (why) { says.textContent = why; return; }
    if (!rec) { says.textContent = 'Waiting for Bob\'s next reply. The cube lights up when he finishes it. Replies come a little slower while this is on.'; return; }
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
    const c = rec.clips[clip], dt = Math.min(0.1, (now - last) / 1000 || 0); last = now;
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
    play();
  }
  function on(ev) {
    let j = null; try { j = JSON.parse(ev.data); } catch { return; }
    if (j?.type === 'cube') { why = j.ok ? '' : String(j.why || ''); words(); } else if (j?.type === 'trace') { why = ''; add(j); }
  }
  open.onclick = () => {
    if (!rec) return;
    const w = window.open('/watch.html', 'bob-watch', 'popup,width=1180,height=820');
    if (!w) { says.textContent = 'The viewer couldn\'t open: this browser blocked the pop-up.'; return; }
    const give = () => { try { w.bobWatch?.load(JSON.parse(JSON.stringify(rec))); } catch {} };
    w.addEventListener('load', () => setTimeout(give, 300)); setTimeout(give, 1500);
  };
  return {
    name: NAME,
    connect() { box.hidden = false; if (!es && EventSourceImpl) { es = new EventSourceImpl('/api/events?cube=1'); es.onmessage = on; } words(); if (rec) view.draw(lit()); },
    disconnect() { if (es) { es.close(); es = null; } cancelAnimationFrame(raf); raf = 0; },
    hide() { box.hidden = true; },
    add, get rec() { return rec; }
  };
}
