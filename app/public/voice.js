// Voice input: push-to-talk and an optional "Hey Bob" listener.
// Audio is recorded locally as 16 kHz WAV and sent to Bob's brain, which uses the local Whisper.

const RATE = 16000;

function encodeWav(samples) {
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

function downsample(chunk, fromRate) {
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

const rms = (a) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * a[i]; return Math.sqrt(s / a.length); };
const join = (parts) => { const n = parts.reduce((t, p) => t + p.length, 0), o = new Float32Array(n); let k = 0; for (const p of parts) { o.set(p, k); k += p.length; } return o; };

// Strips a leading "hey bob" and says whether it was there.
export function wakeWord(text) {
  const m = text.match(/^\W*(?:(?:hey|hi|ok|okay|yo)\W+)?bob\b\W*/i);
  return m ? { woke: true, rest: text.slice(m[0].length).trim() } : { woke: false, rest: text };
}

export function createVoice({ transcribe, onText, onState, isQuiet }) {
  let ctx = null, stream = null, node = null, source = null;
  let mode = 'off';            // off | ptt | wake
  let parts = [], speaking = false, silentFor = 0, heardFor = 0, armed = false;
  let pttTimer = 0;

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
    try {
      const text = audio.length / RATE > 0.3 ? await transcribe(encodeWav(audio)) : '';
      onState(mode);
      if (text) onText(text);
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
    async setWake(on) {
      wakeWanted = on;
      if (on) { await open(); if (mode !== 'ptt') { mode = 'wake'; parts = []; } onState('wake'); }
      else { if (mode === 'wake') { mode = 'off'; close(); } armed = false; onState(mode); }
    }
  };
}
