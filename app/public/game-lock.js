// 1.5.41: the 🎮 Gaming button on the chat page, in the Effort row. On: Bob goes into the Gaming session and stays there,
// lets go of everything on the graphics card at once, and puts running jobs aside in Tasks (they carry on later). Off
// (or picking another session): back to Normal, and the jobs carry on. Same as "Bob, I'm gaming", without waiting for him.
const $ = (id) => document.getElementById(id);

export function createGameLock({ note }) {
  const btn = $('gameBtn'), st = $('gameBtnSt');
  if (!btn) return { update() {} };
  let on = false;

  function draw() {
    btn.setAttribute('aria-checked', String(on));
    st.textContent = on ? 'On' : 'Off';
    btn.title = on ? 'Gaming is locked: Bob\'s big brains and pictures are off the graphics card, and he stays in Gaming. Jobs wait in Tasks. Click to go back to Normal; they carry on.'
      : 'Clear the graphics card for a game right now: Bob lets go of his big brains and pictures, puts running jobs aside in Tasks, and stays in Gaming until you click again.';
  }

  async function load() {
    try { const j = await (await fetch('/api/settings')).json(); on = j.gamingLock === true; draw(); } catch {}
  }

  async function toggle() {
    btn.disabled = true;
    try {
      const r = await fetch('/api/gaming-lock', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ on: !on }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { const e = new Error(j.error || `Error ${r.status}`); e.shown = Boolean(j.error); throw e; }
      on = j.on === true; draw();
      note(on ? '🎮 Gaming is on. Bob\'s big brains are off the graphics card; anything I was doing waits in Tasks.' : '☕ Gaming is off. Back to Normal, and anything waiting carries on.');
    } catch (e) { note(e.shown ? e.message : 'Couldn\'t change Gaming. Try again, or pick a session from the menu.', 'error'); } // only on this replicant matrix: a phone gets told why
    btn.disabled = false;
  }
  btn.onclick = toggle;
  draw(); load();
  return { update(v) { on = v === true; draw(); } };
}
