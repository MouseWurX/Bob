// 1.5.210 (the owner, Nov 12): the thinking bubble. One small folded bubble above Bob's answer, while he works and
// after: a Bob-ish line that changes while he thinks, a coloured dot per step, "Needs you" while a card waits for
// you, and "Worked for 2m 10s · 7 steps" when he's done. Press it to see every step, draft and fix as it happens.
// The chat bubble under it gets only the finished answer, whole (the server says which one: the 'final' event,
// src/clean-answer.js).
//
// Display only. The lines here are the window's own words: none of it is sent to a brain, and nothing waits on it.
// Settings, Bob himself, "Thinking bubble above answers" (cfg.thinkBubble, on unless turned off) puts the old chat back.

export const PUNS = [
  'Thinking…',
  'Warming up the replicant matrix…',
  'Asking {cat} for a second opinion…',
  'Pouring a coffee first…',
  'Checking my notes…',
  'Counting on my fingers. All ten.',
  'Reading the manual nobody reads…',
  'Untangling the wires…',
  'Spinning up the hamster wheel…',
  'Polishing the answer…',
  'Double-checking my maths…',
  'Consulting the other Bobs…'
];
export const PUN_EVERY_MS = 4000;

// "2m 10s", "45s", "1h 3m"
export function took(ms) {
  const s = Math.max(0, Math.round((Number(ms) || 0) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60), h = Math.floor(m / 60);
  if (h) return `${h}h ${m % 60}m`;
  return `${m}m ${s % 60}s`;
}
// The line on a finished bubble.
export function doneLine(ms, steps, needed = false) {
  const t = took(ms);
  const n = Number(steps) || 0;
  const head = n ? `Worked for ${t} · ${n} step${n === 1 ? '' : 's'}` : `Thought for ${t}`;
  return needed ? `${head} · waited on you` : head;
}
export function punAt(i, cat = '') {
  const line = PUNS[((i % PUNS.length) + PUNS.length) % PUNS.length];
  return line.replace('{cat}', String(cat || '').trim() || 'the cat');
}

const DOT = { done: 'done', failed: 'failed', waiting: 'waiting', note: 'note', draft: 'draft' };
const DOT_SAYS = { done: 'done', failed: 'went wrong, then fixed or flagged', waiting: 'waiting for your OK', note: 'a note', draft: 'a draft' };
const MAX_DOTS = 14;

// add(cls, html) puts an element at the end of the chat. answer(ev, text, extra) puts the finished answer in the chat.
export function createThinkBubbles({ add, esc, answer, scroll = () => {}, on = () => true, still = () => false, cat = () => '', openMind = null, now = () => Date.now() }) {
  const live = new Map(); // turnId -> bubble
  let tick = null;

  function make(el, startedAt) {
    el.innerHTML = `<button type="button" class="think-head" aria-expanded="false"><span class="think-spark" aria-hidden="true"></span><span class="think-line"></span><span class="think-time"></span><span class="think-dots" aria-hidden="true"></span><span class="think-caret" aria-hidden="true">▸</span></button><div class="think-body" hidden><ol class="think-steps"></ol><p class="think-empty muted">No steps yet.</p>${openMind ? '<div class="think-foot"><button type="button" class="link mini" data-mind>Open Bob\'s thinking</button></div>' : ''}</div><span class="sr-only" aria-live="polite"></span>`;
    const b = { el, head: el.querySelector('.think-head'), line: el.querySelector('.think-line'), time: el.querySelector('.think-time'), dots: el.querySelector('.think-dots'), body: el.querySelector('.think-body'), list: el.querySelector('.think-steps'), empty: el.querySelector('.think-empty'), say: el.querySelector('[aria-live]'), startedAt, rows: [], draft: null, all: '', final: false, needs: 0, needed: false, pun: Math.floor(Math.random() * 3) };
    b.head.onclick = () => { const open = b.body.hidden; b.body.hidden = !open; b.head.setAttribute('aria-expanded', String(open)); el.classList.toggle('open', open); if (open) b.list.lastElementChild?.scrollIntoView?.({ block: 'nearest' }); };
    el.querySelector('[data-mind]')?.addEventListener('click', () => openMind?.());
    return b;
  }
  function label(b) {
    const state = b.done ? b.line.textContent : b.needs ? 'Bob needs you' : 'Bob is working';
    b.head.setAttribute('aria-label', `${state}. ${b.rows.length} step${b.rows.length === 1 ? '' : 's'}. Press to ${b.body.hidden ? 'show' : 'hide'} them.`);
  }
  function drawDots(b) {
    const rows = b.rows.slice(-MAX_DOTS);
    b.dots.innerHTML = rows.map((r) => `<i class="d-${r.dot}"></i>`).join('');
    b.empty.hidden = b.rows.length > 0;
    label(b);
  }
  function row(b, dot, html, cls = '') {
    closeDraft(b);
    const li = document.createElement('li');
    li.className = `think-row ${cls}`.trim();
    li.innerHTML = `<i class="think-dot d-${dot}" title="${esc(DOT_SAYS[dot] || '')}"></i><span>${html}</span>`;
    b.list.append(li);
    const r = { dot, el: li };
    b.rows.push(r);
    drawDots(b);
    if (!b.body.hidden) li.scrollIntoView?.({ block: 'nearest' });
    return r;
  }
  function closeDraft(b) { if (b.draft) { b.draft.open = false; b.draft = null; } }
  function draftText(b, t) {
    if (!b.draft) {
      if (!String(t).trim()) return; // the '\n\n' between rounds is no step
      const r = row(b, DOT.draft, '<span class="think-draft"></span>', 'draft');
      b.draft = { ...r, text: '', box: r.el.querySelector('.think-draft'), open: true };
      b.rows[b.rows.length - 1] = b.draft;
    }
    b.draft.text += t;
    b.draft.box.textContent = b.draft.text.replace(/^\s+/, '');
    if (!b.body.hidden) b.draft.el.scrollIntoView?.({ block: 'nearest' });
  }
  function headLine(b) {
    if (b.done) return;
    b.el.classList.toggle('needs', b.needs > 0);
    if (b.needs) { b.line.textContent = 'Needs you: answer the card below'; b.time.textContent = ''; return; }
    b.line.textContent = still() ? 'Thinking…' : punAt(b.pun, cat());
    b.time.textContent = took(now() - b.startedAt);
  }
  function ticking() {
    if (tick || typeof setInterval !== 'function') return;
    let n = 0;
    tick = setInterval(() => {
      n++;
      if (!live.size) { clearInterval(tick); tick = null; return; }
      for (const b of live.values()) {
        if (!still() && !b.needs && n % Math.round(PUN_EVERY_MS / 1000) === 0) { b.pun++; b.line.classList.remove('swap'); void b.line.offsetWidth; b.line.classList.add('swap'); }
        headLine(b);
      }
    }, 1000);
  }
  function finish(b, ms) {
    b.done = true;
    closeDraft(b);
    b.el.classList.remove('live', 'needs');
    b.el.classList.add('finished');
    b.line.textContent = doneLine(ms, b.rows.length, b.needed);
    b.time.textContent = '';
    b.say.textContent = 'Bob finished.';
    drawDots(b);
  }

  function start(ev) {
    const el = add('think live', '');
    const b = make(el, now());
    live.set(ev.turnId || '-', b);
    headLine(b); drawDots(b);
    b.say.textContent = 'Bob is thinking.';
    ticking();
    return b;
  }

  // Returns true when the bubble took the event (the chat itself then does nothing with it).
  function take(ev) {
    if (!ev || !on()) return false;
    if (ev.type === 'start') { if (ev.turnId) start(ev); return false; }
    const b = live.get(ev.turnId || '-');
    if (!b) return false;
    switch (ev.type) {
      case 'token':
        if (b.final) return false; // after the answer (a Stop note): it goes on the answer, as before
        b.all += ev.text || '';
        draftText(b, ev.text || '');
        return true;
      case 'token-undo': { // a retry went another way (reliability item 193): the words that differ are taken back
        const n = Math.max(0, Number(ev.chars) || 0);
        if (b.final) return false;
        b.all = b.all.slice(0, Math.max(0, b.all.length - n));
        if (b.draft) { b.draft.text = b.draft.text.slice(0, Math.max(0, b.draft.text.length - n)); b.draft.box.textContent = b.draft.text.replace(/^\s+/, ''); }
        return true;
      }
      case 'reply-break': return true; // answers between steps: the job's answer comes whole at the end anyway
      case 'tool':
        if (/^hat:/.test(String(ev.summary || '')) || ev.name === 'edit_my_message') return true;
        row(b, DOT.done, esc(ev.summary || ev.name || 'A step'), 'tool');
        return true;
      case 'correction':
        row(b, DOT.failed, `⚠ ${esc(ev.text || '')}`, 'fix');
        return true;
      case 'announce':
        row(b, DOT.note, esc(ev.text || ''), 'note');
        return true;
      case 'hat':
        if (ev.hat === 'reviewer' && ev.quiet) return true;
        row(b, DOT.note, ev.hat === 'reviewer' ? `🛰 ${esc(ev.copy || 'His reviewer')} gives it a second look` : ev.copy ? `↪ ${esc(ev.copy)}, his ${esc(ev.label || '')} copy, takes over` : `↪ ${esc(ev.label || 'Another hat')}`, 'note');
        return true;
      case 'approval':
        b.needs++; b.needed = true;
        b.pending = row(b, DOT.waiting, `✋ Waiting for your OK: ${esc(ev.text || ev.ask?.question || '')}`, 'wait');
        b.say.textContent = 'Bob needs your OK. The card is in the chat.';
        headLine(b);
        return false; // the card itself stays in the chat
      case 'approval-result':
        if (b.needs) b.needs--;
        if (b.pending) { b.pending.dot = ev.allowed ? DOT.done : DOT.failed; b.pending.el.querySelector('.think-dot').className = `think-dot d-${b.pending.dot}`; b.pending = null; drawDots(b); }
        headLine(b);
        return false;
      case 'error':
        row(b, DOT.failed, `⚠ ${esc(ev.text || '')}`, 'fix');
        return false; // and the chat shows it too: something went wrong that you should see
      case 'final': {
        b.final = true;
        // His last draft is the answer itself: it's in the chat now, so it isn't kept twice.
        const last = b.rows[b.rows.length - 1];
        const words = String(ev.text || '').trim();
        if (last?.dot === DOT.draft && words && last.text?.trim() === words) { last.el.remove(); b.rows.pop(); }
        closeDraft(b); drawDots(b);
        answer(ev, words ? String(ev.text) : '', { correction: ev.correction || '', checked: ev.checked || '' });
        return true;
      }
      case 'done': {
        if (!b.final && b.all.trim()) answer(ev, b.all, {}); // no answer was picked (it stopped early): everything he wrote, as before
        finish(b, now() - b.startedAt);
        live.delete(ev.turnId || '-');
        return false; // the chat finishes the answer (voice, Try again, …) as before
      }
      default: return false;
    }
  }

  // A saved chat: the steps of one answer, folded, above it. msgs: the turn's step messages; ms: how long it took.
  function saved(msgs, ms) {
    const el = add('think finished', '');
    const b = make(el, 0);
    for (const m of msgs) {
      if (String(m.content || '').trim()) { const r = row(b, DOT.draft, '<span class="think-draft"></span>', 'draft'); r.el.querySelector('.think-draft').textContent = String(m.content).trim(); }
      if (m.correction) row(b, DOT.failed, `⚠ ${esc(m.correction)}`, 'fix');
    }
    finish(b, ms);
    b.say.textContent = '';
    return el;
  }

  return { take, saved, live: (id) => live.has(id || '-') };
}
