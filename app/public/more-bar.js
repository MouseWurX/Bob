// 1.5.21 "Make another picture?" bar. After a picture is handed back, the server asks (event 'more-pictures',
// { id, seconds, kind? }). The chat box swaps to a one-line bar with Make another / No thanks and a countdown. Make another keeps the
// picture model loaded for the next one; No thanks, Esc, or the countdown running out lets Bob go back to his Quick brain
// (the server's own timer counts silence as No). 'more-pictures-done' (answered elsewhere, or a new job) closes it.
export function moreBar({ composer, post, focus }) {
  let bar = null, timer = null, id = null;
  const onKey = (e) => { if (e.key === 'Escape' && bar) { e.preventDefault(); answer(false); } };
  const close = () => {
    document.removeEventListener('keydown', onKey);
    clearInterval(timer); timer = null; id = null;
    bar?.remove(); bar = null;
    composer.classList.remove('asking');
  };
  const answer = (more) => {
    const ask = id;
    close();
    if (ask) post('/api/more-pictures', { id: ask, more }).catch?.(() => {});
    if (!more) focus?.();
  };
  const open = (ev) => {
    close();
    id = ev.id;
    let left = Math.max(1, Math.round(Number(ev.seconds) || 10));
    const what = ev.kind === 'video' ? 'clip' : 'picture';
    bar = document.createElement('div');
    bar.className = 'more-bar';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', `Make another ${what}?`);
    bar.innerHTML = `<span class="more-q">Make another ${what}?</span><button type="button" class="more-btn" data-more="yes">Make another</button><button type="button" class="more-btn" data-more="no">No thanks</button><span class="muted more-left" aria-live="off">Goes away in ${left} s</span>`;
    bar.addEventListener('click', (e) => { const b = e.target.closest('[data-more]'); if (b) answer(b.dataset.more === 'yes'); });
    composer.classList.add('asking');
    composer.appendChild(bar);
    // Nothing is focused: a stray Enter must never start a picture job. Clicks only (Esc = No thanks).
    document.addEventListener('keydown', onKey);
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) return close(); // the server counts the silence as No
      const el = bar?.querySelector('.more-left');
      if (el) el.textContent = `Goes away in ${left} s`;
    }, 1000);
  };
  return {
    handle(ev) { if (ev.type === 'more-pictures') open(ev); else if (!ev.id || ev.id === id) close(); },
    get open() { return Boolean(bar); }
  };
}
