// aiFEUI in small: a cube of Bob's brain in "Bob's thinking" (Now running), lighting up with the experts each reply
// used. Off until its switch is turned on. While it's on it listens to /api/events?cube=1, and only then does Bob ask
// Brain Engine for the trace (public/lab-watch-math.js liveTrace has the shape). The picture arrives when a reply is
// finished and is then played word by word; nothing is saved. The same drawing as the big viewer (watch-view.js).
import { createView } from './watch-view.js';
import { specialise, liveRecording, partOf, PART_LABEL, say, NAME } from './lab-watch-math.js';

const SPECIAL = /<\|[^|>]*\|>|<\/?think>/gi;
export const CUBE_SPEED = 14; // words a second

// els: { box, canvas, says, again, open }. still() = animations are off (the last word is shown, nothing moves).
export function createMindCube({ box, canvas, says, again, open }, { still = () => false, EventSourceImpl = globalThis.EventSource } = {}) {
  const view = createView(canvas);
  let es = null, traces = [], rec = null, sp = null, clip = -1, t = 0, raf = 0, last = 0, why = '';
  view.set({ glow: 0.4, glass: 0.3 });

  function words() {
    if (why) { says.textContent = why; return; }
    if (!rec) { says.textContent = 'Waiting for Bob\'s next reply. The cube lights up when he finishes it. Replies come a little slower while this is on.'; return; }
    const c = rec.clips[clip], w = Math.min(c.e.length - 1, Math.floor(t));
    const pt = partOf(c, w), text = c.words.slice(pt.from, w + 1).join('').replace(SPECIAL, '').replace(/\s+/g, ' ').trim();
    const picks = c.e[w].reduce((a, l) => a + l.length, 0);
    says.textContent = say(rec, `${PART_LABEL[pt.part] === 'Question' ? 'Reading' : PART_LABEL[pt.part]}: ${text.length > 90 ? '…' + text.slice(-90) : text} (word ${w + 1} of ${c.e.length}, ${picks} experts)`);
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
    traces.push(tr); traces = traces.slice(-6);
    const r = liveRecording(traces, tr.label || 'Bob'); if (!r) return;
    rec = r; sp = specialise(rec); clip = rec.clips.length - 1;
    view.setData(rec, sp, null); view.set({ gap: view.cubeGap() });
    again.hidden = false; open.hidden = false;
    play();
  }
  function on(ev) {
    let j = null; try { j = JSON.parse(ev.data); } catch { return; }
    if (j?.type === 'cube') { why = j.ok ? '' : String(j.why || ''); words(); } else if (j?.type === 'trace') { why = ''; add(j); }
  }
  again.onclick = play;
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
