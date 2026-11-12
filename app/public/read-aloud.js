// Read documents aloud (item 136, 2026-11-11; Settings, Voice details, "Read documents aloud", off unless turned on).
// A document open in the side panel gets a small player above its words: Play, Pause, Back, Next and a speed. It reads
// in Bob's own voice (POST /api/speak) or, without one, this computer's voice. Where you stopped is kept per document,
// in this window's own storage on this computer, so Play carries on from there next time.
// The words are cut into pieces of whole sentences (readPieces, the same rule as the phone app's logic.js).

export const SPEEDS = [0.75, 1, 1.25, 1.5, 2];
const KEY = 'bob-read-aloud';

export function readPieces(text, max = 400) {
  const plain = String(text || '').replace(/```[\s\S]*?```/g, ' (code) ').replace(/https?:\/\/\S+/g, 'a link').replace(/[*_#>|`~]/g, '').replace(/\r/g, '');
  const out = [];
  for (const para of plain.split(/\n\s*\n/)) {
    const words = para.replace(/\s+/g, ' ').trim();
    if (!words) continue;
    const sentences = words.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) || [words];
    let cur = '';
    for (let s of sentences) {
      s = s.trim();
      while (s.length > max) { const cut = s.lastIndexOf(' ', max) > max / 2 ? s.lastIndexOf(' ', max) : max; if (cur) { out.push(cur); cur = ''; } out.push(s.slice(0, cut).trim()); s = s.slice(cut).trim(); }
      if (!s) continue;
      if (cur && cur.length + 1 + s.length > max) { out.push(cur); cur = s; } else cur = cur ? `${cur} ${s}` : s;
    }
    if (cur) out.push(cur);
  }
  return out;
}

// Where you stopped, per document: { path: { at, of, speed } }, the last 50 documents.
export function savedPlace(store, path) { return store?.[path] || null; }
export function keepPlace(store, path, at, of, speed) {
  const next = { ...(store || {}) };
  delete next[path];
  next[path] = { at, of, speed };
  const keys = Object.keys(next);
  for (const k of keys.slice(0, Math.max(0, keys.length - 50))) delete next[k];
  return next;
}
const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch { return {}; } };
const save = (v) => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch {} };

export function createReader({ hush = () => {}, ownVoice = () => true, onTalk = () => {} } = {}) {
  let on = false, cur = null; // cur: { path, name, pieces, at, speed, playing, audio, bar }
  const pctOf = (c) => (c.pieces.length ? Math.round((c.at / c.pieces.length) * 100) : 0);

  function stop() {
    if (!cur) return;
    cur.playing = false;
    try { cur.audio?.pause(); } catch {}
    try { speechSynthesis.cancel(); } catch {}
    cur.audio = null;
    onTalk(false);
    remember();
    draw();
  }
  function remember() { if (cur) save(keepPlace(load(), cur.path, cur.at, cur.pieces.length, cur.speed)); }

  async function playPiece(c) {
    if (!c.playing || c !== cur) return;
    if (c.at >= c.pieces.length) { c.playing = false; c.at = 0; remember(); onTalk(false); return draw('The end. Play starts again from the top.'); }
    draw();
    const text = c.pieces[c.at];
    let done = false;
    if (ownVoice()) {
      try {
        const r = await fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ text }) });
        if (!r.ok) throw new Error('no voice');
        const url = URL.createObjectURL(await r.blob());
        if (!c.playing || c !== cur) { URL.revokeObjectURL(url); return; }
        const a = new Audio(url);
        a.playbackRate = c.speed;
        c.audio = a;
        await new Promise((res) => { a.onended = res; a.onerror = res; a.onpause = res; a.play().catch(res); });
        URL.revokeObjectURL(url);
        done = !a.paused || a.ended;
      } catch { done = await browserSay(text, c.speed, c); }
    } else done = await browserSay(text, c.speed, c);
    if (!c.playing || c !== cur) return;
    if (done) { c.at++; remember(); }
    playPiece(c);
  }
  function browserSay(text, speed, c) {
    if (!('speechSynthesis' in window)) { c.playing = false; draw('This window has no voice to read with. Set up Bob\'s voice on Equip Bob.'); return Promise.resolve(false); }
    return new Promise((res) => {
      const u = new SpeechSynthesisUtterance(text);
      u.rate = speed;
      u.onend = () => res(true);
      u.onerror = () => res(false);
      speechSynthesis.speak(u);
    });
  }

  function draw(msg = '') {
    if (!cur?.bar) return;
    const c = cur;
    c.bar.innerHTML = `<button type="button" class="mini" data-ra="play" aria-label="${c.playing ? 'Pause' : 'Play'}">${c.playing ? '⏸ Pause' : '▶ Play'}</button>
      <button type="button" class="mini" data-ra="back" aria-label="Back one piece">⏮</button><button type="button" class="mini" data-ra="next" aria-label="Next piece">⏭</button>
      <label class="pick-inline"><span>Speed</span><select data-ra="speed" aria-label="Reading speed">${SPEEDS.map((v) => `<option value="${v}" ${v === c.speed ? 'selected' : ''}>${v}×</option>`).join('')}</select></label>
      <span class="muted" role="status">${msg ? msg.replace(/[<>&]/g, '') : `${pctOf(c)}% · piece ${Math.min(c.at + 1, c.pieces.length)} of ${c.pieces.length}`}</span>`;
  }

  function attach({ stage, path, name, text }) {
    if (!on || !stage) return;
    if (cur && cur.path !== path) stop();
    const pieces = readPieces(text);
    if (!pieces.length) return;
    const place = savedPlace(load(), path);
    const bar = document.createElement('div');
    bar.className = 'read-aloud row wrap';
    bar.setAttribute('role', 'group');
    bar.setAttribute('aria-label', `🔊 Read ${name || 'this document'} aloud`);
    stage.prepend(bar);
    const keepPlaying = cur && cur.path === path && cur.playing;
    cur = keepPlaying ? Object.assign(cur, { bar }) : { path, name, pieces, at: place && place.of === pieces.length ? Math.min(place.at, pieces.length - 1) : 0, speed: SPEEDS.includes(place?.speed) ? place.speed : 1, playing: false, audio: null, bar };
    bar.addEventListener('click', (e) => {
      const b = e.target.closest('[data-ra]');
      if (!b || b.tagName === 'SELECT') return;
      const c = cur;
      if (b.dataset.ra === 'play') { if (c.playing) stop(); else { hush(); c.playing = true; onTalk(true); playPiece(c); } }
      else if (b.dataset.ra === 'back' || b.dataset.ra === 'next') {
        const was = c.playing; stop();
        c.at = Math.max(0, Math.min(c.pieces.length - 1, c.at + (b.dataset.ra === 'next' ? 1 : -1)));
        remember();
        if (was) { c.playing = true; onTalk(true); playPiece(c); } else draw();
      }
    });
    bar.addEventListener('change', (e) => { if (e.target.dataset.ra === 'speed') { cur.speed = Number(e.target.value) || 1; if (cur.audio) cur.audio.playbackRate = cur.speed; remember(); } });
    draw(place && place.of === pieces.length && place.at ? `Picks up at ${Math.round((place.at / pieces.length) * 100)}%, where you stopped.` : '');
  }

  window.addEventListener('bob-doc-shown', (e) => attach(e.detail || {}));
  return {
    setOn(v) { on = v === true; if (!on) stop(); },
    stop,
    get playing() { return Boolean(cur?.playing); }
  };
}
