// Talk with Bob (1.5.210, UX plan item 12; Settings, Voice details, off unless turned on): a live, hands-free talk.
// Press 🗣 next to the 🎙 and just talk. Each time you pause, what you said goes to Bob as an ordinary message (so a
// running job carries on, and with Answer messages between steps on he answers between its steps). He says a short
// version of each reply aloud; the whole reply is in the chat. Start talking while he speaks and he stops and listens.
// "Goodbye" or ✕ ends it. Nothing is recorded or kept, and nothing is added to what the brain reads.
// The rules are in talk-core.js; hearing and voice come from POST /api/talk/hear and /api/talk/say (src/talk.js).
import { RATE, encodeWav, downsample, rms, join, talkOverWords, BARGE_RMS, BARGE_SECS } from './voice.js';
import { shortSay, endsTalk, TALK_LINES } from './talk-core.js';

// When you count as talking, and when you've stopped. A pause of 0.9 s ends what you said; 25 s is the most at once.
export const LOUD_RMS = 0.015;
export const PAUSE_SECS = 0.9;
export const MIN_SPEECH_SECS = 0.35;
export const MAX_SECS = 25;

// The ear on its own (no microphone, no screen), so the tests can feed it sound. feed(chunk, talking) takes 16 kHz
// samples; while Bob talks, only a voice loud enough for long enough counts (his own voice through the speakers
// doesn't), and that cuts him off with the first words kept.
export function createEar({ onSaid = () => {}, onCutIn = () => {} } = {}) {
  let parts = [], speaking = false, silentFor = 0, heardFor = 0;
  let cutParts = [], cutLoud = 0;
  const reset = () => { parts = []; speaking = false; silentFor = 0; heardFor = 0; cutParts = []; cutLoud = 0; };
  function feed(chunk, talking = false) {
    const secs = chunk.length / RATE;
    if (talking) {
      cutParts.push(chunk);
      while (cutParts.length > 6) cutParts.shift();
      cutLoud = rms(chunk) > BARGE_RMS ? cutLoud + secs : Math.max(0, cutLoud - secs / 2);
      if (cutLoud < BARGE_SECS) return;
      parts = cutParts; cutParts = []; speaking = true; heardFor = cutLoud; silentFor = 0; cutLoud = 0;
      onCutIn();
      return;
    }
    const loud = rms(chunk) > LOUD_RMS;
    if (loud) { speaking = true; silentFor = 0; heardFor += secs; }
    else if (speaking) silentFor += secs;
    if (speaking) parts.push(chunk);
    const total = parts.reduce((t, p) => t + p.length, 0) / RATE;
    if (speaking && (silentFor > PAUSE_SECS || total > MAX_SECS)) {
      const audio = join(parts), enough = heardFor > MIN_SPEECH_SECS;
      reset();
      if (enough) onSaid(audio);
    }
  }
  return { feed, reset };
}

export function createTalk({ bar, button, hear, say, fallbackSay, send, onOpen = () => {}, note = () => {} }) {
  let open = false, paused = false, waiting = 0, talking = false, line = 'listening';
  let ctx = null, stream = null, node = null, source = null;
  let stopAudio = null, lastSaid = '', queue = [], hearing = 0, fellBackSaid = false, turn = 0;
  const ear = createEar({ onSaid: (a) => heard(a), onCutIn: () => { hush(); draw('listening'); } });

  bar.innerHTML = `<span class="talk-dot" aria-hidden="true"></span>
    <div class="talk-words"><strong class="talk-state" role="status" aria-live="polite"></strong><span class="talk-said muted"></span></div>
    <div class="talk-buttons">
      <button type="button" class="mini" data-talk="listen" aria-pressed="true">⏸ Pause</button>
      <button type="button" class="mini" data-talk="again" title="Say Bob's last reply again">🔁 Say it again</button>
      <button type="button" class="mini" data-talk="end" title="End the talk (Esc)">✕ End talk</button>
    </div>`;
  const $ = (s) => bar.querySelector(s);

  function draw(state, said) {
    if (state) line = state;
    bar.dataset.state = line;
    $('.talk-state').textContent = TALK_LINES[line] || '';
    if (said !== undefined) $('.talk-said').textContent = said ? `You said: “${said}”` : '';
    const lb = $('[data-talk="listen"]');
    lb.textContent = paused ? '🎙 Listen' : '⏸ Pause';
    lb.setAttribute('aria-pressed', String(!paused));
    button?.setAttribute('aria-pressed', String(open));
  }
  const idleLine = () => (paused ? 'paused' : waiting > 0 ? 'working' : 'listening');

  async function micOn() {
    if (ctx) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
    ctx = new AudioContext();
    source = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => { if (open && !paused) ear.feed(downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate), talking); };
    source.connect(node);
    node.connect(ctx.destination);
  }
  function micOff() {
    try { node && node.disconnect(); source && source.disconnect(); } catch {}
    stream && stream.getTracks().forEach((t) => t.stop());
    try { ctx && ctx.close(); } catch {}
    ctx = stream = node = source = null;
    ear.reset();
  }

  async function heard(samples) {
    hearing++;
    if (!talking) draw('hearing');
    let text = '';
    try {
      const r = await hear(encodeWav(samples));
      text = String(r?.text || '').trim();
      if (r?.fellBack && !fellBackSaid) { fellBackSaid = true; note('xAI didn\'t answer, so I\'m hearing you myself for now.'); }
    } catch (e) { note(e.message || 'I couldn\'t hear that.', 'error'); }
    hearing--;
    if (!open) return;
    if (!text) { if (!talking) draw(idleLine()); return; }
    if (endsTalk(text)) { end('Bye for now.'); return; }
    const w = talkOverWords(text);
    if (!w.send) { hush(); draw(idleLine(), text); return; } // "stop" on its own only stops him
    if (send(w.send) === false) { draw(idleLine(), text); note('That didn\'t send. Say it again?', 'error'); return; }
    waiting++;
    if (!talking) draw('thinking', w.send); else $('.talk-said').textContent = `You said: “${w.send}”`;
  }

  // Bob's words, said aloud: the short version, in order, one at a time.
  function speakLine(text, { answer = false } = {}) {
    if (!open) return false;
    if (answer) waiting = Math.max(0, waiting - 1);
    const { say: words } = shortSay(text);
    if (!words) { if (!talking) draw(idleLine()); return true; }
    lastSaid = words;
    queue.push(words);
    if (!talking) next();
    return true;
  }
  async function next() {
    const words = queue.shift();
    if (!words || !open) { talking = false; if (open) draw(hearing ? 'hearing' : idleLine()); return; }
    talking = true;
    const my = turn, still = () => open && talking && my === turn;
    draw('talking');
    let played = false;
    try {
      const r = await say(words);
      if (r?.fellBack && !fellBackSaid) { fellBackSaid = true; note('xAI didn\'t answer, so I\'m using my own voice for now.'); }
      if (!still()) return;
      const url = URL.createObjectURL(r.blob);
      const a = new Audio(url);
      await new Promise((res) => { stopAudio = () => { a.pause(); res(); }; a.onended = res; a.onerror = res; a.play().catch(res); });
      URL.revokeObjectURL(url);
      played = true;
    } catch {}
    if (!played && still()) await new Promise((res) => { stopAudio = () => { try { speechSynthesis.cancel(); } catch {} res(); }; fallbackSay(words).then(res, res); });
    if (my !== turn) return;
    stopAudio = null;
    if (still()) next();
  }
  function hush() {
    turn++;
    queue = [];
    talking = false;
    try { stopAudio?.(); } catch {}
    stopAudio = null;
  }

  async function start() {
    if (open) return;
    open = true; paused = false; waiting = 0; fellBackSaid = false;
    bar.hidden = false;
    onOpen(true);
    draw('starting', '');
    try { await micOn(); }
    catch (e) {
      end();
      note(/secure|insecure|not allowed|permission/i.test(String(e?.message || e)) ? 'I can\'t use the microphone here. Allow it for Bob, or open Bob on this computer itself (a phone browser needs Bob\'s app or a secure address).' : `I can't use the microphone: ${e?.message || e}`, 'error');
      return;
    }
    draw('listening');
    $('[data-talk="end"]').focus();
  }
  function end(why) {
    if (!open) return;
    open = false; paused = false; waiting = 0;
    hush();
    micOff();
    bar.hidden = true;
    draw('ended', '');
    onOpen(false);
    button?.focus();
    if (why) note(why);
  }
  function pause(on) {
    paused = on;
    if (on) { hush(); micOff(); draw('paused'); }
    else micOn().then(() => draw(idleLine())).catch((e) => note(`I can't use the microphone: ${e?.message || e}`, 'error'));
  }

  bar.addEventListener('click', (e) => {
    const b = e.target.closest('[data-talk]');
    if (!b) return;
    if (b.dataset.talk === 'end') end();
    else if (b.dataset.talk === 'listen') pause(!paused);
    else if (b.dataset.talk === 'again') { if (lastSaid) { hush(); queue.push(lastSaid); next(); } else draw(idleLine()); }
  });
  bar.addEventListener('keydown', (e) => { if (e.key === 'Escape') { e.preventDefault(); end(); } });
  button?.addEventListener('click', () => (open ? end() : start()));

  return {
    get open() { return open; },
    start, end,
    // A reply (answer: true) or a short note from Bob, while the talk is open. False when it isn't.
    say: speakLine
  };
}
