// Keep Bob light (1.5.2): the "Free memory when Bob is idle" switch and the memory label at the top of the chat.
// On (default): nothing stays on the graphics card while Bob is quiet; typing loads his small brain again.
// Off: the small brain stays loaded. Big brains load for their job and go right after, either way.
// Same setting as Advanced, Speed & memory, "Free memory after Bob has been quiet for" (Never = off).
const $ = (id) => document.getElementById(id);

export function createBrainBar({ post, note }) {
  const pill = $('brainPill'), pillText = $('brainPillText'), pop = $('brainPop'), popText = $('brainPopText'), sw = $('brainFree'), swSt = $('brainFreeSt');
  const swLabel = sw;
  let st = null, timer = null, lastWake = 0;

  const secs = (n) => (n ? `about ${n} seconds` : 'a few seconds');
  // "5.8 GB on the graphics card · 1.2 GB in RAM": RAM shows when part of a brain sits in system memory (1.5.3).
  // about: Bob's own engine only knows the file size when Windows won't say how much graphics memory it holds.
  const where = (cardGB, ramGB, onCard, about) => {
    if (ramGB == null) return `${about ? 'about ' : ''}${cardGB} GB ${onCard ? 'on the graphics card' : 'in RAM'}`;
    const parts = [];
    if (cardGB > 0) parts.push(`${cardGB} GB on the graphics card`);
    if (ramGB > 0) parts.push(`${ramGB} GB in RAM`);
    return parts.join(' · ') || '0 GB';
  };
  const list = () => st.models.map((m) => `${m.label || m.name} ${where(m.gb, m.ramGB, m.onCard, m.estimate)}`).join(', ');
  // 1.5.26: this label counts Bob's brain only. The Memory meter in Now running counts the whole graphics card.
  const whole = ' This counts Bob\'s brain only. The Memory meter in Now running counts everything on the card: Windows, other apps and Bob\'s picture model.';

  function draw() {
    if (!st) return;
    const on = st.mode !== 'always';
    sw.setAttribute('aria-checked', String(on));
    swSt.textContent = on ? 'On' : 'Off';
    swLabel.title = on
      ? `On: gives the graphics memory back after Bob has been quiet for ${st.sleepAfter || '5 minutes'}. Typing loads it again (${secs(st.wakeSeconds)}). Change the time in Settings, Speed & memory.`
      : st.bigSession
        ? `Off: in the ${st.session} session Bob's brain is a big one, so it's still freed ${st.bigGrace || '2 minutes'} after each job.`
        : 'Off: Bob\'s small brain stays loaded so he answers straight away. Big brains (coding, deep thought, pictures, video) are still freed right after their job.';
    const chat = st.models.find((m) => m.chat);
    const mem = where(st.gb, st.ramGB, !(chat && !chat.onCard), st.models.some((m) => m.estimate));
    let text, title;
    if (!st.engineOk) { text = 'Brain: engine not answering'; title = 'Bob can\'t reach his engine. Check it\'s running (Settings, Engines).'; }
    else if (st.state === 'waking') { text = 'Brain: loading...'; title = `Loading the small brain (${secs(st.wakeSeconds)}).`; }
    // Nov 13 ("it says brain working 0 GB graphics card"): a song, picture or workshop has the card, and his brain waits
    else if (st.state === 'working' && !st.models.length) { text = 'Brain: set aside for a job'; title = 'Bob let his brain go so the job (a song, a picture or a workshop) has the graphics card to itself. It loads again when the job is done. What the job is doing shows in his status line.'; }
    else if (st.state === 'working') { text = `Brain: working · ${mem}`; title = `In memory now: ${list() || 'loading'}. Big brains are freed when the job is done.${whole}`; }
    else if (st.state === 'awake') {
      text = `Brain: loaded · ${mem}`;
      title = `In memory: ${list()}. ` + (!on && !st.bigSession ? 'Stays loaded (Free memory when Bob is idle is off).' : st.bigSession ? `Freed ${st.bigGrace || '2 minutes'} after the job.` : `Freed after ${st.sleepAfter || '5 minutes'} quiet.`) + whole;
    } else { text = 'Brain: memory freed'; title = on || st.bigSession ? `Nothing on the graphics card. Typing loads the small brain (${secs(st.wakeSeconds)}).` : 'Loading the small brain shortly.'; }
    // Nov 13 (card-guard.js): another program holds the card: said first, so nobody loads a brain on top of it unawares
    if (st.cardBusy && st.engineOk) { text = `${text} · ⚠ Card busy`; title = `${st.cardBusy}. Another program is using the graphics card. Before loading a brain that won't fit beside it, Bob asks you first. ${title}`; }
    pillText.textContent = text;
    popText.textContent = title; // 1.5.210: the quick switches sit under these words, in the same panel
    pill.className = `brain-pill ${st.engineOk ? st.state : 'off'}`;
  }

  async function refresh() {
    clearTimeout(timer);
    try {
      st = await (await fetch('/api/brain')).json(); draw();
      // Now running shows the same reading for Bob's brain line, so the two never disagree (1.5.26).
      window.dispatchEvent(new CustomEvent('bob-brain-status', { detail: st }));
    } catch {}
    timer = setTimeout(refresh, document.hidden ? 30000 : (st?.state === 'waking' || st?.state === 'working') ? 2000 : 8000);
  }

  // Tooltips need a mouse to hover (awkward over Parsec), so a click on the label shows the same words.
  pill.onclick = () => { const open = pop.hidden; pop.hidden = !open; pill.setAttribute('aria-expanded', String(open)); };
  document.addEventListener('click', (e) => { if (!pop.hidden && !e.target.closest('#brainPill, #brainPop')) { pop.hidden = true; pill.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !pop.hidden) { pop.hidden = true; pill.setAttribute('aria-expanded', 'false'); } });

  sw.onclick = async () => {
    const mode = sw.getAttribute('aria-checked') === 'true' ? 'always' : 'wake';
    const r = await post('/api/settings', { brainMode: mode });
    if (!r.ok) { note(r.data.error || 'Couldn\'t change "Free memory when Bob is idle". It can only be changed on this replicant matrix itself.', 'error'); return; }
    if (st) { st.mode = r.data.brainMode; draw(); }
    setTimeout(refresh, 400);
  };

  // Someone is typing: load the small brain now, so it's ready by the time they press Send.
  function typing() {
    if (Date.now() - lastWake < 10000) return;
    if (st && st.state !== 'asleep') return;
    lastWake = Date.now();
    post('/api/wake', {}).then(() => setTimeout(refresh, 300)).catch(() => {});
  }

  window.addEventListener('bob-brain-mode', refresh);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  refresh();
  return { refresh, typing };
}
