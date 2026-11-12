// Bob for iPhone (and any phone browser): the phone screen from Bob for Android, served by desktop Bob at /phone/.
// On Android, phone.js talks to the app through window.BobPhone (Bridge.kt). Here this file plays that part, with
// the browser's own tools, and only ever talks to the Bob that served the page (same address, his login cookie).
// No phone brain, lending or pairing here: those need the Android app. Hand-written; not made by make-shared.mjs.
(() => {
  const BASE = location.origin;
  const send = (m) => setTimeout(() => globalThis.bob?.fromPhone(m), 0);
  const NOT_HERE = 'That needs Bob for Android. On an iPhone, the Bob on your PC does the thinking.';

  // The one Bob this page can reach is the one that served it, so he's the only one on the list.
  try {
    const bobs = JSON.parse(localStorage.getItem('bob.bobs') || '[]');
    if (!bobs.length || bobs.length > 1 || bobs[0].base !== BASE) localStorage.setItem('bob.bobs', JSON.stringify([{ name: 'Bob on your PC', address: location.host, base: BASE }]));
    const s = JSON.parse(localStorage.getItem('bob.settings') || '{}');
    if (s.mode !== 'net' || s.phoneOn) localStorage.setItem('bob.settings', JSON.stringify({ ...s, mode: 'net', phoneOn: false }));
  } catch { /* private browsing: phone.js starts from its defaults, and the list below still answers */ }

  async function get(path) {
    const r = await fetch(path, { cache: 'no-store', credentials: 'same-origin' });
    return { status: r.status, body: await r.text() };
  }
  async function post(path, body, type = 'application/json', ms = 30000) {
    const stop = new AbortController(); const t = setTimeout(() => stop.abort(), ms);
    try {
      const r = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': type, 'x-bob': '1' }, body, signal: stop.signal });
      return { status: r.status, body: await r.text() };
    } finally { clearTimeout(t); }
  }
  const asDataUrl = (blob) => new Promise((ok, bad) => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => bad(f.error); f.readAsDataURL(blob); });
  function download(href, name) {
    const a = document.createElement('a');
    a.href = href; a.download = name || ''; a.rel = 'noopener';
    document.body.append(a); a.click(); a.remove();
    return `Downloads/${name || decodeURIComponent(href.split('?')[0].split('/').pop() || 'file')}`;
  }

  // Live events from the PC Bob: replies as they're written, OK cards, job progress.
  let events = null, retry = null;
  function listen() {
    if (events) return;
    events = new EventSource('/api/events', { withCredentials: true });
    events.onopen = () => send({ event: 'net-state', base: BASE, up: true });
    events.onmessage = (e) => { try { send({ event: 'net', base: BASE, data: JSON.parse(e.data) }); } catch { /* a ping */ } };
    events.onerror = () => {
      send({ event: 'net-state', base: BASE, up: false });
      if (events.readyState === EventSource.CLOSED) { events = null; clearTimeout(retry); retry = setTimeout(listen, 5000); }
    };
  }
  function unlisten() { clearTimeout(retry); events?.close(); events = null; }
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') send({ event: 'app', visible: true }); });

  // A photo to work on: picked here, made smaller (longest side 2048) as a JPEG, sent only when the message goes.
  let photo = null, photoWait = null;
  function pickPhoto() {
    return new Promise((resolve, reject) => {
      if (photoWait) photoWait.reject(new Error('replaced'));
      photoWait = { resolve, reject };
      const input = document.createElement('input');
      input.type = 'file'; input.accept = 'image/*';
      input.addEventListener('change', async () => {
        const w = photoWait; photoWait = null;
        const file = input.files?.[0];
        if (!file) return w?.resolve(null);
        try {
          const img = await createImageBitmap(file);
          const shrink = (max) => { const k = Math.min(1, max / Math.max(img.width, img.height)); const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(img.width * k)); c.height = Math.max(1, Math.round(img.height * k)); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c; };
          photo = await new Promise((ok) => shrink(2048).toBlob(ok, 'image/jpeg', 0.9));
          w?.resolve({ preview: shrink(256).toDataURL('image/jpeg', 0.8) });
        } catch (e) { w?.reject(new Error(`that picture didn't open (${e.message})`)); }
      });
      input.addEventListener('cancel', () => { const w = photoWait; photoWait = null; w?.resolve(null); });
      input.click();
    });
  }

  function copy(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text).then(() => true);
    const t = document.createElement('textarea'); // plain http (Tailscale address): the old way still works
    t.value = text; t.setAttribute('readonly', ''); t.className = 'web-offscreen';
    document.body.append(t); t.select(); t.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); t.remove();
    if (!ok) throw new Error("couldn't copy");
    return true;
  }

  function say(text) {
    if (!('speechSynthesis' in window)) throw new Error("This browser can't read aloud.");
    speechSynthesis.cancel();
    speechSynthesis.speak(new SpeechSynthesisUtterance(text));
    return true;
  }
  function hear() {
    const R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R || !window.isSecureContext) return Promise.reject(new Error("The microphone button needs Bob on a secure (https) address. Tap the keyboard's own microphone instead: it types what you say."));
    return new Promise((ok, bad) => {
      const r = new R(); r.lang = navigator.language || 'en-US'; r.interimResults = false;
      r.onresult = (e) => ok(e.results[0]?.[0]?.transcript || '');
      r.onerror = (e) => bad(new Error(`I didn't catch that (${e.error})`));
      r.start();
    });
  }

  const ops = {
    'net.check': () => ({ base: BASE }),
    'net.signedIn': async () => (await get('/api/capabilities')).status !== 401,
    'net.login': async ({ code }) => {
      const r = await fetch('/login', { method: 'POST', credentials: 'same-origin', redirect: 'manual', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ code, next: '/phone/' }) });
      if (r.type === 'opaqueredirect' || r.status === 303 || r.ok) return 'ok';
      return r.status === 401 ? 'wrong' : r.status === 429 ? 'busy' : r.status === 403 ? 'not-let-in' : `error ${r.status}`;
    },
    'net.forget': () => { unlisten(); return true; },
    'net.get': ({ path }) => get(path),
    'net.post': ({ path, body }) => post(path, body || '{}'),
    'net.media': async ({ path }) => {
      const r = await fetch(path, { credentials: 'same-origin' });
      if (!r.ok) return null;
      if (Number(r.headers.get('content-length')) > 25e6) return null;
      const blob = await r.blob();
      return blob.size > 25e6 ? null : asDataUrl(blob);
    },
    'net.listen': () => { listen(); return true; },
    'net.unlisten': () => { unlisten(); return true; },
    'media.save': ({ path, name }) => download(path, name),
    'media.saveData': ({ name, mime, data }) => {
      const bytes = Uint8Array.from(atob(data), (c) => c.charCodeAt(0));
      const url = URL.createObjectURL(new Blob([bytes], { type: mime || 'application/octet-stream' }));
      const where = download(url, name);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      return where;
    },
    'photo.pick': pickPhoto,
    'photo.clear': () => { photo = null; return true; },
    'photo.upload': async ({ name }) => {
      if (!photo) throw new Error('no photo picked');
      const r = await post(`/api/refs?kind=chat&name=${encodeURIComponent(String(name || 'Photo from the phone').slice(0, 60))}`, photo, 'image/jpeg', 60000);
      if (r.status === 200) photo = null;
      return r;
    },
    copy: ({ text }) => copy(String(text || '')),
    open: ({ url }) => { window.open(url, '_blank', 'noopener'); return true; },
    'speech.say': ({ text }) => say(String(text || '')),
    'speech.listen': hear,
    'speech.quiet': () => { try { speechSynthesis.cancel(); } catch {} return true; },
    // Back up and move: a phone backup picked with the browser's own file picker, read as text, capped at 64 MB.
    'file.pick': () => new Promise((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file'; input.accept = '.json,application/json,text/plain';
      input.addEventListener('change', () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        if (file.size > 64 * 1024 * 1024) return reject(new Error('that file is too big for a phone backup'));
        file.text().then(resolve, reject);
      }, { once: true });
      input.addEventListener('cancel', () => resolve(null), { once: true });
      input.click();
    }),
    device: () => ({ about: "Bob's phone screen, served by the Bob on your PC. On an iPhone: Safari, Share, Add to Home Screen.", model: '', version: '' }),
    // Bob for Android only: answered so the page draws, refused when asked to do something.
    'brain.status': () => ({ files: {}, loaded: null, busy: false }),
    'lend.status': () => ({}),
    'pair.waiting': () => []
  };

  globalThis.BobPhone = {
    web: true,
    call(raw) {
      const { id, op, ...args } = JSON.parse(raw);
      const fn = ops[op];
      Promise.resolve()
        .then(() => { if (!fn) throw new Error(/^(brain|lend|pair)\./.test(op) ? NOT_HERE : 'unknown op'); return fn(args); })
        .then((result) => send({ id, ok: true, result }), (e) => send({ id, ok: false, error: e?.message || String(e) }));
    }
  };
})();
