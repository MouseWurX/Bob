// 1.5.7: the cat does cat things by Bob's picture while he's idle. Scripted, no brain, no setting: it costs nothing.
// Every 1 to 2½ minutes of idle, the cat does one short antic for about 8 seconds and a one-line moment that matches
// it shows under Bob's status. Stops as soon as Bob is busy. Kept out of screen readers (aria-hidden).
// 1.5.53: 17 antics instead of 5 (each with its own lines), no repeats until most have played, Bob looks over when
// the cat starts one, and if Bob has dozed off the cat naps too. Animations off keeps the cat still (body.still).
import { ANTIC_IDS, anticLine } from './patches.js';

export const ANTICS = ANTIC_IDS;
// What shows in the cat's spot. Extras (butterfly, pencil, bird, yarn) are drawn by CSS around it.
export const ICON = { nap: '🐈💤', box: '📦', yarn: '🐈' };

export function pickAntic(recent, rnd = Math.random) {
  const pool = ANTICS.filter((a) => !recent.includes(a));
  return pool[Math.floor(rnd() * pool.length) % pool.length];
}

export function createCatAntics({ onAntic = () => {}, sleepy = () => false } = {}) {
  const cat = document.getElementById('cat'), line = document.getElementById('catLine');
  if (!cat || !line) return { idle() {}, play() {} };
  let name = 'Patches', idle = false, timer = null, hide = null, n = Math.floor(Math.random() * 100), recent = [];
  fetch('/api/settings').then((r) => r.json()).then((s) => { if (s.catName) name = s.catName; }).catch(() => {});
  const rest = () => { cat.className = 'cat'; cat.textContent = '🐈'; line.hidden = true; };
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
    line.textContent = `${anticLine(a, name, n++)}.`;
    line.hidden = false;
    if (a !== 'nap') onAntic(a);
    hide = setTimeout(() => { rest(); plan(); }, 8000);
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
