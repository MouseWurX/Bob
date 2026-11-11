// Made by android/tools/make-shared.mjs from public/table-fx.js. Don't edit.
(function () {
// 🎲 Adventure table extras that happen in the window (1.5.204): the die that tumbles and lands, the sounds, the
// music and reading the story aloud. Every one is off until it's ticked on the start card, and the 🔊/🔇 button
// quiets them all. No imports: the phone uses this same file, made into a plain script (globalThis.BobTableFx) by
// android/tools/make-shared.mjs, so a roll looks and sounds the same on both.

// The die: a d20 shape that shows a few quick numbers and lands on the real one. still: no tumbling (Animations off,
// or the system asks for less motion); the number just shows. Returns a promise that settles when it's gone.
function rollDie(host, { die, natural, outcome, label = '', still = false, doc = globalThis.document } = {}) {
  if (!host || !doc) return Promise.resolve();
  host.querySelector('.fx-die')?.remove();
  const box = doc.createElement('div');
  box.className = `fx-die ${outcome || ''}${natural === 20 ? ' nat20' : natural === 1 ? ' nat1' : ''}${still ? ' still' : ''}`;
  box.setAttribute('role', 'status');
  box.setAttribute('aria-label', `${label ? `${label}: ` : ''}rolled ${die}`);
  const face = doc.createElement('div'); face.className = 'fx-face'; face.setAttribute('aria-hidden', 'true');
  const word = doc.createElement('div'); word.className = 'fx-word';
  word.textContent = natural === 20 ? 'Natural 20!' : natural === 1 ? 'Natural 1…' : outcome === 'hit' ? 'Hit' : outcome === 'cost' ? 'Hit, at a cost' : outcome === 'miss' ? 'Miss' : '';
  box.append(face, word);
  host.append(box);
  return new Promise((done) => {
    let n = 0;
    const land = () => { face.textContent = String(die); box.classList.add('landed'); setTimeout(() => { box.classList.add('gone'); setTimeout(() => { box.remove(); done(); }, 350); }, natural === 20 || natural === 1 ? 1800 : 1200); };
    if (still) return land();
    const spin = setInterval(() => { face.textContent = String(1 + Math.floor(Math.random() * 20)); if (++n >= 9) { clearInterval(spin); land(); } }, 70);
  });
}

// Sounds made right here with the browser's own audio (no files needed), or the PC's own recordings when the table
// was set with them (urls: { steel, spell, door }). kind: dice, hit, cost, miss, spell, reward, door, down.
function createSounds({ urls = {}, Ctx = globalThis.AudioContext || globalThis.webkitAudioContext, Audio_ = globalThis.Audio } = {}) {
  let ctx = null, on = true;
  const ac = () => { if (!ctx && Ctx) { try { ctx = new Ctx(); } catch { ctx = null; } } if (ctx?.state === 'suspended') ctx.resume?.(); return ctx; };
  function tone(f, t0, dur, { type = 'sine', vol = 0.2, to } = {}) {
    const c = ac(); if (!c) return;
    const o = c.createOscillator(), g = c.createGain(), at = c.currentTime + t0;
    o.type = type; o.frequency.setValueAtTime(f, at); if (to) o.frequency.exponentialRampToValueAtTime(to, at + dur);
    g.gain.setValueAtTime(vol, at); g.gain.exponentialRampToValueAtTime(0.001, at + dur);
    o.connect(g); g.connect(c.destination); o.start(at); o.stop(at + dur + 0.02);
  }
  function noise(t0, dur, { vol = 0.25, hp = 800 } = {}) {
    const c = ac(); if (!c) return;
    const len = Math.max(1, Math.floor(c.sampleRate * dur)), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), at = c.currentTime + t0;
    f.type = 'highpass'; f.frequency.value = hp; g.gain.value = vol;
    s.buffer = buf; s.connect(f); f.connect(g); g.connect(c.destination); s.start(at);
  }
  const fromFile = (url) => { if (!url || !Audio_) return false; try { const a = new Audio_(url); a.volume = 0.6; a.play?.()?.catch?.(() => {}); return true; } catch { return false; } };
  const KINDS = {
    dice: () => { for (let i = 0; i < 6; i++) noise(i * 0.07 + Math.random() * 0.02, 0.04, { vol: 0.18, hp: 2500 }); },
    hit: () => fromFile(urls.steel) || (noise(0, 0.12, { vol: 0.3, hp: 1500 }), tone(880, 0, 0.35, { type: 'triangle', vol: 0.12, to: 660 })),
    cost: () => { tone(520, 0, 0.18, { type: 'triangle', vol: 0.12 }); tone(390, 0.12, 0.25, { type: 'triangle', vol: 0.1 }); },
    miss: () => noise(0, 0.35, { vol: 0.12, hp: 300 }),
    spell: () => fromFile(urls.spell) || [660, 880, 1100, 1320].forEach((f, i) => tone(f, i * 0.06, 0.4, { vol: 0.07 })),
    reward: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.11, 0.35, { type: 'triangle', vol: 0.12 })),
    door: () => fromFile(urls.door) || tone(110, 0, 0.6, { type: 'sawtooth', vol: 0.05, to: 70 }),
    down: () => tone(300, 0, 0.5, { type: 'square', vol: 0.06, to: 90 })
  };
  return {
    play(kind) { if (on) try { KINDS[kind]?.(); } catch { /* no audio here */ } },
    setOn(v) { on = Boolean(v); },
    setUrls(u) { urls = u || {}; }
  };
}

// One tune at a time, looping softly; a new url swaps tunes, the same url carries on.
function createMusic({ Audio_ = globalThis.Audio } = {}) {
  let a = null, cur = '', on = true;
  return {
    play(url) {
      if (!on || !url || !Audio_) return this.stop();
      if (url === cur && a) return;
      this.stop(); cur = url;
      try { a = new Audio_(url); a.loop = true; a.volume = 0.28; a.play?.()?.catch?.(() => {}); } catch { a = null; }
    },
    stop() { try { a?.pause?.(); } catch {} a = null; cur = ''; },
    setOn(v) { on = Boolean(v); if (!on) this.stop(); },
    get url() { return cur; }
  };
}

// Plain words for reading aloud: no markdown marks, no stage directions in asterisks.
function forSpeech(text) {
  return String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*[^*\n]+\*/g, ' ').replace(/[#*_>`~]/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/\s+/g, ' ').trim();
}

// Reads the game master's words aloud, one after another. wav(text) asks Bob's own voice for the sound (a Blob, or
// null when there's none); without it the system's voice reads.
function createReader({ wav, Audio_ = globalThis.Audio, synth = globalThis.speechSynthesis, Utter = globalThis.SpeechSynthesisUtterance, URL_ = globalThis.URL } = {}) {
  const queue = []; let busy = false, on = true, audio = null, gen = 0;
  async function next() {
    if (busy || !queue.length || !on) return;
    busy = true; const my = gen;
    const text = queue.shift();
    try {
      const blob = wav ? await wav(text).catch(() => null) : null;
      if (my !== gen) return;
      if (blob && Audio_ && URL_) {
        const u = URL_.createObjectURL(blob);
        await new Promise((res) => { audio = new Audio_(u); audio.onended = res; audio.onerror = res; audio.play?.()?.catch?.(res); });
        URL_.revokeObjectURL(u); audio = null;
      } else if (synth && Utter) {
        await new Promise((res) => { const s = new Utter(text); s.rate = 1.02; s.onend = res; s.onerror = res; synth.speak(s); });
      }
    } catch { /* nothing to read with */ }
    finally { if (my === gen) { busy = false; next(); } }
  }
  return {
    say(text) { const t = forSpeech(text); if (!t || !on) return; queue.push(t); next(); },
    stop() { gen++; queue.length = 0; busy = false; try { audio?.pause?.(); } catch {} audio = null; try { synth?.cancel?.(); } catch {} },
    setOn(v) { on = Boolean(v); if (!on) this.stop(); },
    get waiting() { return queue.length + (busy ? 1 : 0); }
  };
}

globalThis.BobTableFx = { rollDie, createSounds, createMusic, forSpeech, createReader };
})();
