// Word bubbles for Bob and the cat (Patches, or whatever the cat is called in Settings).
// Their lines float beside Bob's picture, over the chat, in a fixed layer: they never take room in the menu, so a long
// line can't push New chat, Chat, Tasks and the rest down (the in-menu cat line used to). A bubble shows a few lines
// at most and then fades. Clicks go through it. Kept out of screen readers: Bob's status line (role="status") already
// says the same words, and the cat's lines were always aria-hidden.
const GAP = 10, EDGE = 8, MIN_W = 150, MAX_W = 300;

export function createBubbles() {
  const layer = document.getElementById('bubbles');
  const els = { bob: document.getElementById('bobBubble'), cat: document.getElementById('catBubble') };
  if (!layer || !els.bob || !els.cat) return { say() {}, hide() {}, place() {} };
  const timers = { bob: null, cat: null };

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
    el.classList.remove('on');
    timers[who] = setTimeout(() => { el.hidden = true; }, 220);
  }

  // say('cat', 'Patches is napping.', 8000). Empty text hides the bubble.
  function say(who, text, ms = 6000) {
    const el = els[who];
    if (!el) return;
    if (!text) return hide(who);
    clearTimeout(timers[who]);
    el.firstElementChild.textContent = text;
    el.hidden = false;
    place();
    void el.offsetWidth; // so the fade-in runs from a fresh bubble too
    el.classList.add('on');
    timers[who] = setTimeout(() => hide(who), ms);
  }

  window.addEventListener('resize', () => { if (!els.bob.hidden || !els.cat.hidden) place(); });
  // Folding the menu (Ctrl+B) moves Bob's picture: follow it.
  try { new MutationObserver(() => { if (!els.bob.hidden || !els.cat.hidden) place(); }).observe(document.body, { attributes: true, attributeFilter: ['class'] }); } catch {}
  return { say, hide, place };
}
