// 1.5.210 (UX item B): one status chip at the top of the chat, and a short menu bar along the bottom on a phone.
// Display only: nothing here talks to the brain, changes a job or adds a word to what Bob reads.
//
// The chip is Bob's brain line (brain-bar.js). Pressing it opens the quick switches that used to sit beside it
// (Free memory when idle, ✋ Hands, 🔓 Autonomy, 🖥 Screen use, 💭 Bob's thinking). Each switch keeps its own module;
// this file only shows on the chip which ones are on, and keeps ✋ Stop Hands one press away while Hands are on.
//
// The bottom bar (phones and narrow windows, under 640 px) has Chat, New chat, Tasks, Topics, Settings and More.
// Each button presses the matching button in the left menu, so there is one source for what they do. More opens the
// whole left menu as a sheet; picking anything in it closes the sheet again.
const $ = (id) => document.getElementById(id);
export const PHONE_MAX = 640; // the same width as the @media rule in style.css
const phone = () => window.innerWidth <= PHONE_MAX;

// Which quick switches are on, as [{ icon, words }]: the chip shows the icons, a screen reader hears the words.
export function onSwitches({ hands = 'settings-off', free = false, screen = false }) {
  const out = [];
  if (hands === 'ready') out.push({ icon: '✋', words: 'Hands on' });
  if (hands === 'stopped') out.push({ icon: '✋', words: 'Hands stopped' });
  if (free) out.push({ icon: '🔓', words: 'Autonomy on' });
  if (screen) out.push({ icon: '🖥', words: 'Screen use on' });
  return out;
}

export function createStatusChip({ setLeft, leftFolded }) {
  const on = $('statusOn'), hands = $('handsBtn'), free = $('freeBtn'), screen = $('screenBtn'), quick = $('handsQuick');
  const pill = $('brainPill'), pop = $('brainPop');

  function draw() {
    if (!on || !hands) return;
    const list = onSwitches({ hands: hands.dataset.state, free: free?.dataset.free === 'true', screen: screen?.getAttribute('aria-checked') === 'true' && !screen.hidden });
    on.innerHTML = list.length ? `<span aria-hidden="true">${list.map((x) => x.icon).join(' ')}</span><span class="sr-only">, ${list.map((x) => x.words).join(', ')}</span>` : '';
    on.hidden = !list.length;
    // ✋ is a kill switch: while Hands can act, stopping them stays one press away, outside the folded switches.
    if (quick) {
      const st = hands.dataset.state;
      quick.hidden = st !== 'ready';
      quick.title = hands.title || 'Stop Hands right away';
    }
  }
  const watch = new MutationObserver(draw);
  for (const el of [hands, free, screen]) if (el) watch.observe(el, { attributes: true, attributeFilter: ['data-state', 'data-free', 'aria-checked', 'hidden', 'title'] });
  if (quick && hands) quick.onclick = () => hands.click();
  draw();

  // Turning on 🔓 Autonomy asks first, inside the chip's panel; make sure the panel is open when that question shows.
  const ask = $('freeAsk');
  if (ask && pop && pill) new MutationObserver(() => { if (!ask.hidden && pop.hidden) { pop.hidden = false; pill.setAttribute('aria-expanded', 'true'); } }).observe(ask, { attributes: true, attributeFilter: ['hidden'] });

  // ---- the bottom bar ----
  const bar = $('bottomBar'), more = $('moreBtn'), side = $('side');
  if (!bar || !side) return { draw };
  const items = [...bar.querySelectorAll('[data-go]')];
  // Each button mirrors its menu button: the highlighted page and the little count badges.
  function mirror() {
    for (const b of items) {
      const src = $(b.dataset.go);
      if (!src) continue;
      b.classList.toggle('on', src.classList.contains('on'));
      if (src.classList.contains('on')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
      const from = src.querySelector('.badge'), to = b.querySelector('.badge');
      if (from && to) { to.hidden = from.hidden; to.textContent = from.textContent; }
    }
    // More carries a dot when something it holds has a badge (Downloads, Tidy up), so nothing goes unseen.
    const extra = [...side.querySelectorAll('.nav-item .badge')].filter((x) => !x.hidden && !items.some((b) => b.dataset.go === x.closest('.nav-item').id));
    const mb = more?.querySelector('.badge');
    if (mb) { mb.hidden = !extra.length; mb.textContent = extra.length ? '•' : ''; }
  }
  new MutationObserver(mirror).observe(side, { subtree: true, attributes: true, childList: true, characterData: true, attributeFilter: ['class', 'hidden'] });
  mirror();
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-go]');
    if (!b) return;
    if (!leftFolded()) setLeft(true, false);
    $(b.dataset.go)?.click();
  });
  const sheetOpen = () => phone() && !leftFolded();
  const showMore = () => { if (more) more.setAttribute('aria-expanded', String(sheetOpen())); };
  if (more) more.onclick = () => {
    const open = !sheetOpen();
    setLeft(!open, false);
    showMore();
    if (open) side.querySelector('.nav-item.on, .nav-item')?.focus();
  };
  // On a phone the sheet closes once something in it is picked (the switches in it, Listen, Read aloud and Alerts,
  // stay open so you can see what you changed).
  side.addEventListener('click', (e) => {
    if (!sheetOpen()) return;
    const b = e.target.closest('.nav-item, .nav-new');
    if (!b || b.hasAttribute('aria-pressed') || b.id === 'foldLeft') return;
    setLeft(true, false); showMore();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && sheetOpen() && !document.querySelector('dialog[open]')) { setLeft(true, false); showMore(); more?.focus(); } });
  // A tap outside the sheet closes it.
  document.addEventListener('pointerdown', (e) => { if (sheetOpen() && !e.target.closest('#side, #moreBtn')) { setLeft(true, false); showMore(); } });
  new MutationObserver(showMore).observe(document.body, { attributes: true, attributeFilter: ['class'] });
  // Going from a wide window to a phone-sized one starts with the sheet away, so it never covers the chat by surprise.
  let wasPhone = phone();
  window.addEventListener('resize', () => { const now = phone(); if (now && !wasPhone && !leftFolded()) setLeft(true, false); wasPhone = now; showMore(); });
  if (phone() && !leftFolded()) setLeft(true, false);
  showMore();
  return { draw, mirror };
}
