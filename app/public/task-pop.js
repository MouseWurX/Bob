// 1.5.216: a small word bubble under the Tasks tab when a task starts, waits its turn or fails.
// It replaced the Tasks strip that sat right across the chat, above the message box (the owner: "a terrible place for
// it"). The bubble floats in a fixed layer, so it never covers the message box or pushes the chat. It fades in over
// about 0.7 s, stays a few seconds (longer while the pointer rests on it), then fades out into the Tasks tab.
// On a phone the Tasks button sits in the bottom bar, so the bubble shows above it, pointing down.
// Click it to open Tasks. The full list stays in Tasks and in Now running.
export const POP_MS = 4500, FADE_MS = 700;
const GAP = 8, EDGE = 8, MAX_W = 300;

const SAY = { working: 'Started', waiting: 'Waiting its turn', failed: "Didn't finish", interrupted: 'Stopped partway' };

// What to say for a fresh jobs list, given what was seen before. Pure, for the tests.
export function taskNews(jobs, seen) {
  let news = null;
  for (const j of jobs || []) {
    const was = seen.get(j.id);
    if (was !== j.state && SAY[j.state] && !(j.state === 'waiting' && was)) news = { state: j.state, text: `${SAY[j.state]}: ${j.text || 'a task'}` };
    seen.set(j.id, j.state);
  }
  return news;
}

export function createTaskPop({ onOpen } = {}) {
  const el = document.getElementById('taskPop');
  if (!el) return { jobs() {}, show() {} };
  const text = el.querySelector('.task-pop-text');
  const seen = new Map();
  let primed = false, timer = null, hovered = false;

  // The Tasks tab that shows now: the top tab on a desktop, the bottom-bar button on a phone.
  function anchor() {
    const shown = (b) => b && b.getClientRects().length && b.getBoundingClientRect().width > 0;
    return [document.getElementById('tasksBtn'), document.querySelector('.bar-item[data-go="tasksBtn"]')].find(shown) || null;
  }

  function place() {
    const a = anchor();
    if (!a) return false;
    const r = a.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth, vh = document.documentElement.clientHeight || window.innerHeight;
    const w = Math.min(MAX_W, vw - EDGE * 2), mid = r.left + r.width / 2;
    const left = Math.max(EDGE, Math.min(mid - 24, vw - w - EDGE));
    const up = r.top > vh / 2; // the phone's bottom bar: show above it
    el.classList.toggle('up', up);
    el.style.left = `${Math.round(left)}px`;
    el.style.maxWidth = `${Math.round(w)}px`;
    el.style.top = up ? '' : `${Math.round(r.bottom + GAP)}px`;
    el.style.bottom = up ? `${Math.round(vh - r.top + GAP)}px` : '';
    el.style.setProperty('--tip', `${Math.round(Math.max(12, Math.min(mid - left, w - 12)))}px`);
    return true;
  }

  function hide() {
    clearTimeout(timer);
    el.classList.remove('on');
    el.classList.add('into'); // fades out into the Tasks tab
    timer = setTimeout(() => { el.hidden = true; el.classList.remove('into'); }, FADE_MS + 20);
  }
  const later = () => { clearTimeout(timer); if (!hovered) timer = setTimeout(hide, POP_MS); };

  function show(line) {
    if (!line || !place()) return;
    clearTimeout(timer);
    text.textContent = line;
    el.classList.remove('into');
    el.hidden = false;
    void el.offsetWidth; // so the fade-in runs from a fresh bubble too
    el.classList.add('on');
    later();
  }

  el.addEventListener('mouseenter', () => { hovered = true; clearTimeout(timer); });
  el.addEventListener('mouseleave', () => { hovered = false; if (el.classList.contains('on')) later(); });
  el.addEventListener('click', () => { hide(); onOpen?.(); });
  window.addEventListener('resize', () => { if (!el.hidden) place(); });

  // Called with every jobs update. The first one (opening Bob) only notes what is there, so nothing pops on open.
  function jobs(list) {
    const news = taskNews(list, seen);
    if (!primed) { primed = true; return; }
    if (news) show(news.text);
  }
  return { jobs, show, hide };
}
