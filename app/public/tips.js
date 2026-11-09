// 1.5.56 Tips: descriptions that used to sit under every label now wait behind a small ⓘ button (or on the
// thing itself) and show in one bubble when you point at it, when you Tab to it, or when you tap it.
// Warnings, errors, current values and anything with a button inside stay on the page: only explanations move.
//
//   tip(html, about)  -> an ⓘ button whose bubble shows `html` (already-escaped HTML). `about` names it for
//                        screen readers: "About <about>".
//   noteOrTip(html)   -> the same, unless the note is a warning, an error or has a control in it; then it stays
//                        visible as before (<br><span class="muted">...</span>).
//   data-tip="text"   -> any element with this attribute shows `text` in the bubble on hover, focus or long-press.
//   title="text"      -> upgraded to data-tip by installTips(), so every old title works with the keyboard and on
//                        touch screens too, and looks the same as the rest.
//
// Touch screens (the phone, the Legion Go): tap ⓘ to open or close its bubble; press and hold anything else
// with a tip. Esc or a tap elsewhere closes it.

const ID = 'bob-tip';
let bubble = null, owner = null, pinned = false, showTimer = 0, hideTimer = 0, holdTimer = 0, held = false;

export const stripTags = (h) => String(h).replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const attr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

export function tip(html, about = '') {
  if (!html) return '';
  const label = about ? `About ${stripTags(about)}` : 'More about this';
  return `<button type="button" class="tip-i" aria-label="${attr(label)}" aria-expanded="false"><span class="tip-src" hidden>${html}</span></button>`;
}

// Things that must stay where you can see them: warnings, errors, buttons, links, inputs, live values.
// keep(html) marks a note that must stay written out (what goes online, a changed default people relied on reading).
export const keep = (html) => `<span class="keep">${html}</span>`;
export const mustShow = (html) => /class="keep"|tag warn|class="error|⚠|<button|<a |<input|<select|data-[a-z-]*now|Right now|Not used right now|Needs you|Failed/i.test(String(html));

export function noteOrTip(html, about = '') {
  if (!html) return '';
  return mustShow(html) ? `<br><span class="muted">${html}</span>` : ` ${tip(html, about)}`;
}

function ensureBubble() {
  if (bubble) return bubble;
  bubble = document.createElement('div');
  bubble.id = ID; bubble.className = 'tip-bubble'; bubble.setAttribute('role', 'tooltip'); bubble.hidden = true;
  document.body.appendChild(bubble);
  return bubble;
}

function contentOf(el) {
  const src = el.querySelector(':scope > .tip-src');
  if (src) return src.innerHTML;
  const t = el.getAttribute('data-tip');
  return t ? attr(t) : '';
}

function place(el) {
  const b = bubble, r = el.getBoundingClientRect(), pad = 8;
  b.style.left = '0px'; b.style.top = '0px'; b.style.maxWidth = `${Math.min(340, window.innerWidth - 2 * pad)}px`;
  const w = b.offsetWidth, h = b.offsetHeight;
  let left = Math.min(Math.max(pad, r.left + r.width / 2 - w / 2), window.innerWidth - w - pad);
  let top = r.bottom + 6;
  if (top + h > window.innerHeight - pad) top = Math.max(pad, r.top - h - 6);
  b.style.left = `${Math.round(left)}px`; b.style.top = `${Math.round(top)}px`;
}

export function showTip(el, keep = false) {
  const html = contentOf(el); if (!html) return;
  clearTimeout(hideTimer); clearTimeout(showTimer);
  if (owner && owner !== el) hideTip(true);
  const b = ensureBubble();
  // A modal page (Tasks, Tidy up...) sits in the browser's top layer, so the bubble has to live inside it to be seen.
  const host = el.closest('dialog[open]') || document.body; if (b.parentNode !== host) host.appendChild(b);
  b.innerHTML = html; b.hidden = false; owner = el; pinned = keep;
  el.setAttribute('aria-describedby', ID);
  if (el.classList.contains('tip-i')) el.setAttribute('aria-expanded', 'true');
  place(el);
}

export function hideTip(now = false) {
  clearTimeout(showTimer);
  const go = () => {
    if (!bubble || bubble.hidden) return;
    bubble.hidden = true;
    if (owner) { if (owner.getAttribute('aria-describedby') === ID) owner.removeAttribute('aria-describedby'); if (owner.classList.contains('tip-i')) owner.setAttribute('aria-expanded', 'false'); }
    owner = null; pinned = false;
  };
  clearTimeout(hideTimer);
  if (now) go(); else hideTimer = setTimeout(go, 120);
}

const tipTarget = (n) => (n instanceof Element ? n.closest('.tip-i, [data-tip]') : null);

// Old title="" text becomes data-tip, so the browser's own slow, mouse-only tooltip doesn't show as well.
function upgrade(root) {
  const els = root.querySelectorAll ? root.querySelectorAll('[title]') : [];
  for (const el of [root, ...els]) {
    if (!(el instanceof Element) || !el.hasAttribute('title') || el.closest('svg')) continue;
    const t = el.getAttribute('title'); el.removeAttribute('title');
    if (!t) { el.removeAttribute('data-tip'); continue; }
    el.setAttribute('data-tip', t);
    if (!el.hasAttribute('aria-label') && !el.textContent.trim()) el.setAttribute('aria-label', t);
  }
}

export function installTips(root = document.body) {
  if (installTips.done) return; installTips.done = true;
  upgrade(root);
  new MutationObserver((list) => {
    for (const m of list) {
      if (m.type === 'attributes') { if (m.target.hasAttribute('title')) upgrade(m.target); continue; }
      for (const n of m.addedNodes) if (n.nodeType === 1 && n.id !== ID) upgrade(n);
    }
  }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['title'] });

  // Mouse: a short pause before showing, so sweeping across the menu doesn't flash bubbles.
  document.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch') return;
    const el = tipTarget(e.target); if (!el || el === owner) return;
    if (pinned) return;
    clearTimeout(showTimer); showTimer = setTimeout(() => showTip(el), owner ? 0 : 350);
  });
  document.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const el = tipTarget(e.target); if (!el) return;
    if (e.relatedTarget instanceof Node && (el.contains(e.relatedTarget) || bubble?.contains(e.relatedTarget))) return;
    clearTimeout(showTimer); if (!pinned) hideTip();
  });
  // Keyboard: the bubble shows as soon as Tab lands on it.
  document.addEventListener('focusin', (e) => { const el = tipTarget(e.target); if (el && el.matches(':focus-visible')) showTip(el); });
  document.addEventListener('focusout', (e) => { if (tipTarget(e.target) === owner && !pinned) hideTip(true); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && bubble && !bubble.hidden) { hideTip(true); e.stopPropagation(); } }, true);

  // Tap ⓘ (any pointer): open and keep it open, tap again to close.
  document.addEventListener('click', (e) => {
    const i = e.target instanceof Element ? e.target.closest('.tip-i') : null;
    if (i) { e.preventDefault(); e.stopPropagation(); if (owner === i && pinned) hideTip(true); else showTip(i, true); return; }
    if (held) { held = false; e.preventDefault(); e.stopPropagation(); return; }
    if (bubble && !bubble.hidden && !bubble.contains(e.target)) hideTip(true);
  }, true);

  // Touch: press and hold anything with a tip. The click that follows the hold is swallowed.
  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType !== 'touch') return;
    const el = tipTarget(e.target); if (!el || el.classList.contains('tip-i')) return;
    clearTimeout(holdTimer); held = false;
    holdTimer = setTimeout(() => { held = true; showTip(el, true); }, 500);
  });
  for (const ev of ['pointerup', 'pointercancel', 'pointermove']) document.addEventListener(ev, (e) => {
    if (e.pointerType !== 'touch') return;
    if (ev === 'pointermove' && Math.abs(e.movementX) + Math.abs(e.movementY) < 6) return;
    clearTimeout(holdTimer);
  });
  document.addEventListener('contextmenu', (e) => { if (held) e.preventDefault(); });
  window.addEventListener('scroll', () => { if (!bubble || bubble.hidden) return; if (pinned && owner?.isConnected) place(owner); else hideTip(true); }, true);
  window.addEventListener('resize', () => { if (owner) place(owner); });
}

// A page's "what is this" text goes behind ⓘ next to its heading (Tasks, Downloads and the other pop-up pages).
export function headTip(heading, html, about = '') {
  if (!heading) return;
  let i = heading.nextElementSibling;
  if (!(i && i.classList.contains('tip-i') && i.dataset.head)) {
    heading.insertAdjacentHTML('afterend', tip(html || ' ', about || heading.textContent));
    i = heading.nextElementSibling; i.dataset.head = '1';
  }
  i.querySelector('.tip-src').innerHTML = html;
  i.hidden = !html;
}
