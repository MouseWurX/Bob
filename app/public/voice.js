// Voice input: push-to-talk and an optional "Hey Bob" listener.
// Audio is recorded locally as 16 kHz WAV and sent to Bob's brain, which uses the local Whisper.

export const RATE = 16000;

export function encodeWav(samples) {
  const buf = new ArrayBuffer(44 + samples.length * 2);
  const v = new DataView(buf);
  const w = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
  w(0, 'RIFF'); v.setUint32(4, 36 + samples.length * 2, true); w(8, 'WAVE'); w(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
  v.setUint32(24, RATE, true); v.setUint32(28, RATE * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
  w(36, 'data'); v.setUint32(40, samples.length * 2, true);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: 'audio/wav' });
}

export function downsample(chunk, fromRate) {
  if (fromRate === RATE) return chunk;
  const ratio = fromRate / RATE, out = new Float32Array(Math.floor(chunk.length / ratio));
  for (let i = 0; i < out.length; i++) {
    const a = Math.floor(i * ratio), b = Math.min(chunk.length, Math.floor((i + 1) * ratio));
    let sum = 0;
    for (let j = a; j < b; j++) sum += chunk[j];
    out[i] = sum / Math.max(1, b - a);
  }
  return out;
}

export const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
export const join = (parts) => { const n = parts.reduce((t, p) => t + p.length, 0), o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };

// Strips a leading "hey bob" and says whether it was there.
export function wakeWord(text) {
  const m = text.match(/^\W*(?:(?:hey|hi|ok|okay|yo)\W+)?bob\b\W*/i);
  return m ? { woke: true, rest: text.slice(m[0].length).trim() } : { woke: false, rest: text };
}

// Talk over Bob (item 135, off unless turned on): what was said while he read aloud. "Stop" on its own only stops
// him; anything longer stops him and is sent. The phone app uses the same rule (logic.js talkOver).
export function talkOverWords(text) {
  const t = String(text || '').trim();
  if (!t) return { stop: false, send: '' };
  if (/^\W*(?:(?:ok(?:ay)?|bob|please)\W+)*(?:stop|quiet|hush|shush|enough|that'?s enough|be quiet|pause)(?:\W+(?:please|bob|now|it))*\W*$/i.test(t)) return { stop: true, send: '' };
  return { stop: true, send: wakeWord(t).rest || t };
}

// How loud and how long counts as you talking over him: louder than the "Hey Bob" listener needs, for about a third
// of a second, so his own voice coming back through the speakers (echo cancelling takes most of it out) and a cough
// don't stop him.
export const BARGE_RMS = 0.045;
export const BARGE_SECS = 0.35;

export function createVoice({ transcribe, onText, onState, isQuiet, talkOver = () => false, onBarge = () => {} }) {
  let ctx = null, stream = null, node = null, source = null;
  let mode = 'off';            // off | ptt | wake
  let parts = [], speaking = false, silentFor = 0, heardFor = 0, armed = false;
  let pttTimer = 0;
  let barge = false, bargeParts = [], bargeLoud = 0, bargeHeard = false;

  async function open() {
    if (ctx) return;
    stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true } });
    ctx = new AudioContext();
    source = ctx.createMediaStreamSource(stream);
    node = ctx.createScriptProcessor(4096, 1, 1);
    node.onaudioprocess = (e) => tick(downsample(e.inputBuffer.getChannelData(0), ctx.sampleRate));
    source.connect(node);
    node.connect(ctx.destination);
  }
  function close() {
    try { node && node.disconnect(); source && source.disconnect(); } catch {}
    stream && stream.getTracks().forEach((t) => t.stop());
    ctx && ctx.close();
    ctx = stream = node = source = null;
  }

  function tick(chunk) {
    const secs = chunk.length / RATE;
    const loud = rms(chunk) > 0.015;
    // Talk over Bob: while he reads aloud, a voice loud enough for long enough stops him, and what follows is heard
    // like the 🎙 button (the start of it is kept, so the first words aren't lost).
    if (barge && mode !== 'ptt') {
      bargeParts.push(chunk);
      while (bargeParts.length > 6) bargeParts.shift();
      bargeLoud = rms(chunk) > BARGE_RMS ? bargeLoud + secs : Math.max(0, bargeLoud - secs / 2);
      if (bargeLoud < BARGE_SECS) return;
      barge = false; bargeHeard = true;
      try { onBarge(); } catch {}
      parts = bargeParts; bargeParts = []; heardFor = bargeLoud; silentFor = 0; bargeLoud = 0;
      mode = 'ptt';
      onState('ptt');
      clearTimeout(pttTimer);
      pttTimer = setTimeout(finishPtt, 31000);
      return;
    }
    if (mode === 'ptt') {
      parts.push(chunk);
      heardFor += loud ? secs : 0;
      silentFor = loud ? 0 : silentFor + secs;
      const total = parts.reduce((t, p) => t + p.length, 0) / RATE;
      if ((heardFor > 0.3 && silentFor > 1.4) || total > 30) finishPtt();
      return;
    }
    if (mode === 'wake') {
      if (isQuiet && isQuiet()) { parts = []; speaking = false; return; }
      if (loud) { speaking = true; silentFor = 0; heardFor += secs; }
      else if (speaking) silentFor += secs;
      if (speaking) parts.push(chunk);
      const total = parts.reduce((t, p) => t + p.length, 0) / RATE;
      if (speaking && (silentFor > 0.8 || total > 12)) {
        const audio = parts; parts = []; speaking = false; silentFor = 0;
        const enough = heardFor > 0.35; heardFor = 0;
        if (enough) handleWake(join(audio));
      }
    }
  }

  async function handleWake(samples) {
    let text = '';
    try { text = await transcribe(encodeWav(samples)); } catch { return; }
    if (!text) return;
    if (armed) { armed = false; onState('wake'); return onText(text); }
    const { woke, rest } = wakeWord(text);
    if (!woke) return;
    if (rest.length > 2) return onText(rest);
    armed = true;               // "Hey Bob" on its own: the next thing said is the request
    onState('armed');
    setTimeout(() => { if (armed) { armed = false; onState('wake'); } }, 8000);
  }

  async function finishPtt() {
    if (mode !== 'ptt') return;
    clearTimeout(pttTimer);
    const audio = join(parts);
    parts = [];
    mode = wakeWanted ? 'wake' : 'off';
    if (mode === 'off') close();
    onState('transcribing');
    const wasBarge = bargeHeard; bargeHeard = false;
    try {
      const text = audio.length / RATE > 0.3 ? await transcribe(encodeWav(audio)) : '';
      onState(mode);
      if (text && wasBarge) { const w = talkOverWords(text); if (w.send) onText(w.send, { barge: true }); else onState(mode, ''); }
      else if (text) onText(text);
      else onState(mode, 'I didn\'t catch that.');
    } catch (e) { onState(mode, e.message); }
  }

  let wakeWanted = false;
  return {
    get mode() { return mode; },
    async push() {
      if (mode === 'ptt') return finishPtt();
      await open();
      parts = []; heardFor = 0; silentFor = 0;
      mode = 'ptt';
      onState('ptt');
      pttTimer = setTimeout(finishPtt, 31000);
    },
    // Bob started or stopped reading aloud. With Talk over Bob on, the microphone is open while he talks.
    async speaking(on) {
      if (on && talkOver() && mode !== 'ptt') {
        try { await open(); } catch { return; }
        barge = true; bargeParts = []; bargeLoud = 0;
        return;
      }
      if (!on) { barge = false; bargeParts = []; bargeLoud = 0; if (mode === 'off' && !wakeWanted && !bargeHeard) close(); }
    },
    async setWake(on) {
      wakeWanted = on;
      if (on) { await open(); if (mode !== 'ptt') { mode = 'wake'; parts = []; } onState('wake'); }
      else { if (mode === 'wake') { mode = 'off'; close(); } armed = false; onState(mode); }
    }
  };
}
