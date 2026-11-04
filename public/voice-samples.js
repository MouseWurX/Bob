// "Hear a sample" buttons. Nothing is loaded until a button is clicked: Bob plays a sample he has
// (or makes one with the voice engine on this PC); for a voice that isn't on the PC yet he hands back
// the publisher's own sample address, and only then does the window load it.
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const SAMPLE_LINE = "Hello, I'm Bob. This is how I'll sound when I read my replies out loud.";

export function sampleButton(engine, voice, label = 'Hear a sample', hint = '') {
  return `<button type="button" class="sample" data-sample-engine="${esc(engine)}" data-sample-voice="${esc(voice)}" title="${esc(hint || `Play a short line in this voice`)}" aria-label="${esc(label)}">▶ ${esc(label)}</button>`;
}

// What a sample button's hint says before it's clicked.
export function sampleHint(v) {
  if (!v) return '';
  if (!v.installed && v.filesHere && v.have !== 'saved' && v.have !== 'bundled') return `Voices downloaded. One more step: get the Kokoro engine (Settings), then this plays.${v.have === 'online' ? ` Until then: the official sample from ${v.source}.` : ''}`;
  return { saved: 'Plays at once (made on this replicant matrix before).', bundled: 'Plays at once (comes with Bob).', make: 'Bob makes it with the voice on this replicant matrix: a few seconds the first time.', online: `Not on this replicant matrix yet: plays the official sample from ${v.source}.`, none: 'No sample until this voice is on this replicant matrix.' }[v.have] || '';
}

export function createSampler() {
  let audio = null, playing = null;
  const note = (btn, text, link) => {
    const row = btn.closest('.sample-row') || btn.parentElement;
    let p = row.querySelector('.sample-note');
    if (!p) { p = document.createElement('span'); p.className = 'sample-note muted'; btn.after(p); }
    p.textContent = text;
    if (link) { const a = document.createElement('a'); a.href = link; a.target = '_blank'; a.rel = 'noopener noreferrer'; a.textContent = ' Open the page'; p.append(a); }
  };
  const reset = () => { if (playing) { playing.classList.remove('busy', 'on'); playing.textContent = playing.dataset.was || playing.textContent; } playing = null; };
  function stop() { try { audio?.pause(); } catch {} try { speechSynthesis.cancel(); } catch {} if (audio?.src?.startsWith('blob:')) URL.revokeObjectURL(audio.src); audio = null; reset(); }
  function start(btn, src, failText = "Couldn't play that sample.", page = '') {
    audio = new Audio(src);
    audio.onended = stop;
    audio.onerror = () => { stop(); note(btn, failText, page); };
    btn.classList.remove('busy'); btn.classList.add('on'); btn.textContent = '■ Stop';
    return audio.play();
  }

  async function play(btn) {
    const same = playing === btn;
    stop();
    if (same) return; // a second click stops it
    playing = btn; btn.dataset.was = btn.textContent;
    const engine = btn.dataset.sampleEngine, voice = btn.dataset.sampleVoice;
    if (engine === 'windows') {
      if (!('speechSynthesis' in window)) { reset(); return note(btn, 'This window has no Windows voice.'); }
      const u = new SpeechSynthesisUtterance(SAMPLE_LINE);
      // 1.5.33: a named Windows voice (picked under Bob's voice); 'default' is Windows' own choice.
      if (voice && voice !== 'default') { const v = speechSynthesis.getVoices().find((x) => x.name === voice); if (v) u.voice = v; }
      u.onend = reset;
      btn.classList.add('on'); btn.textContent = '■ Stop';
      speechSynthesis.speak(u);
      return;
    }
    btn.classList.add('busy'); btn.textContent = '… One moment';
    try {
      const r = await fetch('/api/voice/sample', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ engine, voice }) });
      const type = r.headers.get('content-type') || '';
      if (playing !== btn) return;
      if (type.startsWith('audio/')) return await start(btn, URL.createObjectURL(await r.blob())).catch(() => {});
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { reset(); return note(btn, j.error || "Couldn't make a sample."); }
      if (j.online) {
        note(btn, `From ${j.source}.`);
        return await start(btn, j.online, `Couldn't load the official sample from ${j.source}.`, j.page).catch(() => {});
      }
      reset();
      note(btn, 'No sample until this voice is on this replicant matrix.', j.page);
    } catch (e) { stop(); note(btn, `Couldn't play it (${e.message}).`); }
  }

  return { play, stop };
}
