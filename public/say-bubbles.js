// Word bubbles for Bob and the cat (Patches, or whatever the cat is called in Settings).
// Their lines float beside Bob's picture, over the chat, in a fixed layer: they never take room in the menu, so a long
// line can't push New chat, Chat, Tasks and the rest down (the in-menu cat line used to). A bubble shows a few lines
// at most, has an ✕ in its top right corner, and goes away by itself after 15 seconds, unless the pointer is resting
// on it (then it waits until the pointer leaves). Esc closes them too. Only personality lines go here; Bob's work
// details go in Bob's thinking. Kept out of screen readers, as the cat's line always was.
const GAP = 10, EDGE = 8, MIN_W = 150, MAX_W = 300;
export const BUBBLE_MS = 15000;

export function createBubbles() {
  const layer = document.getElementById('bubbles');
  const els = { bob: document.getElementById('bobBubble'), cat: document.getElementById('catBubble') };
  if (!layer || !els.bob || !els.cat) return { say() {}, hide() {}, place() {} };
  const timers = { bob: null, cat: null }, hovered = { bob: false, cat: false };
  const later = (who) => { clearTimeout(timers[who]); if (!hovered[who]) timers[who] = setTimeout(() => hide(who), BUBBLE_MS); };
  for (const who of ['bob', 'cat']) {
    const el = els[who];
    el.addEventListener('mouseenter', () => { hovered[who] = true; clearTimeout(timers[who]); });
    el.addEventListener('mouseleave', () => { hovered[who] = false; if (el.classList.contains('on')) later(who); });
    el.querySelector('.bubble-x')?.addEventListener('click', () => { hovered[who] = false; hide(who); });
  }
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (!els.bob.hidden) hide('bob'); if (!els.cat.hidden) hide('cat'); } });

  // Beside the menu, level with Bob's picture. If there isn't room to the side (a very narrow window), under the picture.
  function place() {
    const pic = document.getElementById('bob'), side = document.getElementById('side');
    if (!pic) return;
    const p = pic.getBoundingClientRect(), s = side ? side.getBoundingClientRect() : p;
    const vw = document.documentElement.clientWidth || window.innerWidth;
    let left = Math.max(p.right, s.right) + GAP, top = p.top, room = vw - left - EDGE;
    const below = room < MIN_W;
    if (below) { left = EDGE; top = p.bottom + GAP; room = vw - EDGE * 2; }
    layer.classList.toggle('below', below);
    layer.style.left = `${Math.round(left)}px`;
    layer.style.top = `${Math.round(Math.max(EDGE, top))}px`;
    layer.style.width = `${Math.round(Math.min(MAX_W, room))}px`;
  }

  function hide(who) {
    const el = els[who];
    if (!el) return;
    clearTimeout(timers[who]);
    hovered[who] = false;
    el.classList.remove('on');
    timers[who] = setTimeout(() => { el.hidden = true; }, 220);
  }

  // say('cat', 'Patches is napping.'). Empty text hides the bubble.
  function say(who, text) {
    const el = els[who];
    if (!el) return;
    if (!text) return hide(who);
    clearTimeout(timers[who]);
    el.querySelector('.bubble-text').textContent = text;
    el.hidden = false;
    place();
    void el.offsetWidth; // so the fade-in runs from a fresh bubble too
    el.classList.add('on');
    later(who);
  }

  window.addEventListener('resize', () => { if (!els.bob.hidden || !els.cat.hidden) place(); });
  // Folding the menu (Ctrl+B) moves Bob's picture: follow it.
  try { new MutationObserver(() => { if (!els.bob.hidden || !els.cat.hidden) place(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch {}
  return { say, hide, place };
}
