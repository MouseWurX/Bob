// 1.5.7: the cat does cat things by Bob's picture while he's idle. Scripted, no brain, no setting: it costs nothing.
// Every 1 to 2½ minutes of idle, the cat does one short antic for about 8 seconds and a one-line moment that matches
// it shows under Bob's status. Stops as soon as Bob is busy. Kept out of screen readers (aria-hidden).
// 1.5.53: 17 antics instead of 5 (each with its own lines), no repeats until most have played, Bob looks over when
// the cat starts one, and if Bob has dozed off the cat naps too. Animations off keeps the cat still (body.still).
import { ANTIC_IDS, anticLine } from './patches.js';

export const ANTICS = ANTIC_IDS;
// What shows in the cat's spot. Extras (butterfly, pencil, bird, yarn) are drawn by CSS around it.
export const ICON = { nap: '🐈💤', box: '📦', yarn: '🐈' };

// duration in ms matching each antic animation cycle
const ANTIC_DURATIONS = {
  swat: 3600, knock: 2800, pounce: 4000, groom: 5000,
  spin: 5000, stroll: 7500, loaf: 6000, zoomies: 6000,
  perch: 6500, yarn: 5000, butterfly: 5000, birds: 6000,
  stretch: 6000, headbutt: 5000, stare: 4500, nap: 5500
};

export function pickAntic(recent, rnd = Math.random) {
  const pool = ANTICS.filter((a) => !recent.includes(a));
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

export function createCatAntics({ onAntic = () => {}, sleepy = () => false } = {}) {
  const cat = document.getElementById('cat'), line = document.getElementById('catLine');
  const bubble = document.getElementById('quirkBubble');
  if (!cat || !line) return { idle() {}, play() {} };
  let name = 'Patches', idle = false, timer = null, hide = null, n = Math.floor(Math.random() * 100), recent = [];
  fetch('/api/settings').then((r) => r.json()).then((s) => { if (s.catName) name = s.catName; }).catch(() => {});
  // reset cat sprite and hide floating bubble
  const rest = () => {
    cat.className = 'cat';
    cat.textContent = '🐈';
    line.hidden = true;
    if (bubble) {
      bubble.classList.remove('on');
      setTimeout(() => { if (!bubble.classList.contains('on')) bubble.hidden = true; }, 200);
    }
  };
  const stop = () => { clearTimeout(timer); clearTimeout(hide); rest(); };
  function plan() {
    clearTimeout(timer);
    if (!idle) return;
    timer = setTimeout(play, 60000 + Math.random() * 90000);
  }
  function play(which) {
    if (!which && (!idle || document.hidden)) return plan();
    const a = ANTICS.includes(which) ? which : sleepy() ? 'nap' : pickAntic(recent);
    recent = [...recent, a].slice(-Math.floor(ANTICS.length * 0.7));
    clearTimeout(hide);
    cat.className = `cat antic-${a}`;
    cat.textContent = ICON[a] || '🐈';
    const text = `${anticLine(a, name, n++)}.`;
    line.textContent = text;
    line.hidden = false;
    // float quirk message over panel without pushing buttons
    if (bubble) {
      bubble.textContent = text;
      bubble.className = 'quirk-bubble cat-bubble on';
      bubble.hidden = false;
    }
    if (a !== 'nap') onAntic(a);
    const duration = ANTIC_DURATIONS[a] || 5000;
    hide = setTimeout(() => { rest(); plan(); }, duration);
  }
  return {
    idle(on) {
      if (on === idle) return;
      idle = on;
      if (on) plan(); else stop();
    },
    play // for a quick look (tests, screenshots): play('perch')
  };
}
