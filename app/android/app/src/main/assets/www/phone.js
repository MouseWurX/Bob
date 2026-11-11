// Bob for Android: the phone screen. Talks to Android through window.BobPhone (Bridge.kt).
// Decisions live in logic.js (tested); this file draws and wires things up.
// 🔒 It starts once lock.js says the phone is open (straight away while the passcode lock is off).
(globalThis.BobLock ? globalThis.BobLock.ready() : Promise.resolve()).then(() => {
  const L = globalThis.BobLogic;
  const S = globalThis.BobShared;
  const $ = (id) => document.getElementById(id);
  const el = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'html') e.innerHTML = v;
      else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else if (v !== false && v != null) e.setAttribute(k, v === true ? '' : v);
    }
    for (const k of kids.flat()) if (k != null) e.append(k);
    return e;
  };

  // ---------- Storage (this phone only) ----------
  const store = {
    // 🔒 Through lock.js: chats and memory come back unscrambled once the passcode was typed.
    get(k, d) { try { const v = globalThis.BobLock ? globalThis.BobLock.get(k) : localStorage.getItem(`bob.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { if (globalThis.BobLock) globalThis.BobLock.set(k, JSON.stringify(v)); else localStorage.setItem(`bob.${k}`, JSON.stringify(v)); } catch { /* full or blocked: carry on in memory */ } }
  };
  const DEFAULTS = { mode: 'auto', phoneOn: false, phoneModel: 'gemma4-e2b', freeWhenIdle: true, idleMinutes: 5, readAloud: false, userName: '', theme: 'inn', effort: 'low', resume: false };
  const settings = { ...DEFAULTS, ...store.get('settings', {}) };
  const saveSettings = () => store.set('settings', settings);
  let bobs = store.get('bobs', []); // [{ name, address, base }]
  let chats = store.get('chats', []); // [{ id, title, at, msgs: [{ who, text, by, media }] }]
  let memory = store.get('memory', '');
  const saveChats = () => { chats = chats.slice(0, 200); store.set('chats', chats); };

  // ---------- The bridge to Android ----------
  const waiting = new Map();
  let seq = 0;
  // The last things that went wrong on the phone (for Save a help bundle). Words only, never a passcode.
  let errors = store.get('errors', []); // [{ at, where, text }]
  function logError(where, text) {
    errors.push({ at: new Date().toISOString(), where, text: String(text || '').slice(0, 300) });
    errors = errors.slice(-50); store.set('errors', errors);
  }
  window.addEventListener('error', (e) => logError('page', e.message));
  window.addEventListener('unhandledrejection', (e) => logError('page', e.reason?.message || e.reason));
  const phone = (op, args = {}) => new Promise((resolve, reject) => {
    if (!globalThis.BobPhone) return reject(new Error('no phone bridge'));
    const id = `c${++seq}`;
    waiting.set(id, { resolve, reject });
    globalThis.BobPhone.call(JSON.stringify({ id, op, ...args }));
  });

  // Live state of each networked Bob, by base address.
  const live = {}; // base -> { up, signedIn, can, name, version }
  let phoneStatus = { files: {}, loaded: null, busy: false };
  let current = null; // the reply being written: { chatId, kind: 'net'|'phone', base, turnId, node, text, msg }
  const queue = []; // messages waiting their turn: { chatId, text, to }

  globalThis.bob = {
    fromPhone(raw) {
      const m = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (m.id && waiting.has(m.id)) {
        const w = waiting.get(m.id); waiting.delete(m.id);
        return m.ok ? w.resolve(m.result) : w.reject(new Error(m.error || 'failed'));
      }
      if (m.event === 'net') onNetEvent(m.base, m.data);
      else if (m.event === 'net-state') { const st = (live[m.base] ||= {}); const was = st.up; st.up = m.up; if (m.up && !was) refreshBob(m.base, { listen: false }); drawWho(); }
      else if (m.event === 'brain') onBrainEvent(m);
      else if (m.event === 'pair') onPair(m.data);
      else if (m.event === 'app' && m.visible) { refreshAll(); }
    },
    back() {
      const open = [...document.querySelectorAll('.panel')].find((p) => !p.classList.contains('hidden'));
      if (!open) return false;
      open.classList.add('hidden');
      return true;
    }
  };

  // ---------- Chats ----------
  let chat = chats[0] && Date.now() - chats[0].at < 6 * 3600e3 ? chats[0] : null; // carry on today's chat
  function newChat() { chat = null; drawChat(); }
  function ensureChat(firstText) {
    if (!chat) { chat = { id: Math.random().toString(36).slice(2, 10), title: L.chatTitle(firstText), at: Date.now(), msgs: [] }; chats.unshift(chat); }
    chat.at = Date.now();
    return chat;
  }
  const bobName = (base) => bobs.find((b) => b.base === base)?.name || 'Bob on your network';

  function drawChat() {
    const box = $('chat');
    box.textContent = '';
    if (!chat || !chat.msgs.length) box.append(greeting());
    for (const m of chat?.msgs || []) box.append(drawMsg(m));
    box.scrollTop = box.scrollHeight;
  }

  function greeting() {
    const who = settings.userName ? `, ${settings.userName}` : '';
    const a = answerer();
    let line;
    if (a.kind === 'net') line = `Hi${who}. I'm patched through to "${a.bob.name}", so I've got the whole workshop: pictures, music, Hands, the big brains.`;
    else if (a.kind === 'phone') line = `Hi${who}. Pocket edition today: the phone brain is on. Chat, memory, thinking things through. Big jobs need a Bob on your network.`;
    else if (!bobs.length && !settings.phoneOn) line = `Hi${who}. I'm not wired to anything yet. Add your other replicant matrix's Bob under Bob-Net, or switch on the phone brain. Help (in the menu) walks you through both.`;
    else line = `Hi${who}. Nobody's home right now: ${nobodyWhy(a.why)}`;
    return el('div', { class: 'msg bob' }, el('div', { html: L.markdown(line) }));
  }

  function drawMsg(m) {
    if (m.who === 'you') return el('div', { class: 'msg you', text: m.text });
    if (m.who === 'note') return el('div', { class: `note${m.bad ? ' bad' : ''}`, text: m.text });
    const by = m.by === 'phone' ? '📱 Phone brain' : `🖥 ${bobName(m.by)}`;
    const node = el('div', { class: 'msg bob' }, el('div', { class: 'by', text: by }), el('div', { class: 'words', html: L.markdown(m.text) }));
    for (const x of m.media || []) node.append(mediaNode(x));
    node.append(replyTools(m));
    return node;
  }

  function replyTools(m) {
    const t = el('div', { class: 'tools' });
    t.append(el('button', { text: 'Copy', onclick: () => phone('copy', { text: m.text }).then(() => toast('Copied')) }));
    t.append(el('button', { text: 'Read aloud', onclick: () => phone('speech.say', { text: plain(m.text) }) }));
    // A phone-brain reply can be asked again of a Bob on the network.
    const up = liveBobs()[0];
    if (m.by === 'phone' && up && m.q) t.append(el('button', { text: `Ask ${up.name} instead`, onclick: () => send(m.q, { to: up.base }) }));
    return t;
  }

  // Save to this phone: keep something Bob made on the phone (Pictures, Movies, Music or Download, in a Bob folder),
  // as it is or as another file type. Another type is made by the Bob that made it (a copy stays there too).
  const SAVE_AS = { image: ['png', 'jpg', 'webp', 'gif'], video: ['mp4', 'webm', 'gif'], audio: ['wav', 'mp3', 'ogg', 'flac'], diagram: ['png', 'svg', 'pdf'] };
  const SAVE_NOTE = { png: 'sharp, no quality lost', jpg: 'small, for photos', webp: 'small, for the web', gif: 'plays anywhere, low colour', mp4: 'plays anywhere', webm: 'small, for the web', wav: 'full quality, large', mp3: 'small, plays anywhere', ogg: 'small, open format', flac: 'full quality, smaller than WAV', svg: 'scales to any size', pdf: 'for printing and sharing' };
  const MIME = { png: 'image/png', svg: 'image/svg+xml', pdf: 'application/pdf' };
  const fileOf = (x) => decodeURIComponent(String(x.url || '').split('/').pop() || '');
  function saveRow(x, figure = null) {
    if (!SAVE_AS[x.kind] || !x.base) return null;
    const name = fileOf(x), have = x.kind === 'diagram' ? '' : name.split('.').pop().toLowerCase().replace('jpeg', 'jpg');
    const b = () => bobs.find((y) => y.base === x.base);
    const row = el('div', { class: 'save-as small' }, el('span', { class: 'dim', text: 'Save to this phone as ' }));
    for (const f of SAVE_AS[x.kind]) {
      const label = (f === 'webp' ? 'WebP' : f.toUpperCase()) + (f === have ? ' (original)' : '');
      // Long-press shows what the type is good for (no hover on a phone).
      const btn = el('button', { text: label, 'aria-label': `Save to this phone as ${label}: ${SAVE_NOTE[f]}`, oncontextmenu: (e) => { e.preventDefault(); toast(`${label}: ${SAVE_NOTE[f]}`); }, onclick: async () => {
        btn.disabled = true;
        try {
          let where;
          if (x.kind === 'diagram') {
            // Drawn here on the phone, so it's saved straight from here.
            const svg = figure?.querySelector('svg');
            if (!svg) throw new Error('not drawn');
            const file = BobDiagram.svgFile(svg);
            const data = f === 'svg' ? btoa(unescape(encodeURIComponent(file))) : f === 'png' ? await BobDiagram.pngData(file) : await BobDiagram.pdfData(file);
            const fname = `${name.replace(/\.[^.]+$/, '') || 'diagram'}.${f}`, mime = MIME[f], b64 = String(data).replace(/^data:[^,]*,/, '');
            where = await phone('media.saveData', { name: fname, mime, data: b64 });
          } else {
            let url = x.url, file = name;
            if (f !== have) {
              // The other Bob makes the new type (he has the tools for it), then the phone fetches it.
              const r = await phone('net.post', { address: b().address, path: '/api/save-as', body: JSON.stringify({ name, format: f }) });
              let out = {}; try { out = JSON.parse(r.body); } catch { /* not JSON */ }
              if (!out.ok) {
                btn.disabled = false;
                if (out.need === 'ffmpeg' && out.offer) return setupCard(x.base, out.offer);
                return toast(out.why || "That didn't save.");
              }
              url = out.url || x.url.replace(/[^/]*$/, encodeURIComponent(out.name)); file = out.name;
            }
            where = await phone('media.save', { address: b().address, path: url, name: file });
          }
          btn.replaceWith(el('span', { text: ` ✓ ${label} ` }));
          toast(`Saved on this phone: ${where}`);
        } catch (e) { btn.disabled = false; logError('save', e.message); toast(`Couldn't save it on this phone: ${e.message}`); }
      } });
      row.append(btn);
    }
    return row;
  }

  // 1.5.95: a diagram, drawn here on the phone from its text (Mermaid is in the app, nothing goes online).
  function diagramNode(x) {
    const fig = el('div', { class: 'diagram' }, x.title ? el('strong', { text: x.title }) : null, el('div', { class: 'small dim', text: 'Drawing the diagram…' }));
    const box = el('div', {}, fig);
    // 1.5.133 lost-flowchart fix: say which Bob has it, and never lose it. A chart the phone can't draw shows its text
    // (with Save to this phone), and one that can't be fetched names the Bob that keeps it.
    const who = bobName(x.base);
    let text = null;
    phone('net.media', { address: x.base.replace('http://', ''), path: x.url }).then(async (data) => {
      if (!data) throw new Error('none');
      const bytes = atob(String(data).split(',')[1] || '');
      text = decodeURIComponent(escape(bytes));
      const svg = await BobDiagram.draw('vendor/', text);
      fig.lastChild.replaceWith(el('div', { class: 'diagram-art', html: svg }));
      const row = saveRow(x, fig);
      if (row) box.append(row);
    }).catch(() => {
      if (text == null) { fig.lastChild.textContent = `Couldn't get this diagram from ${who}. It's kept there, in Made by Bob.`; return; }
      fig.lastChild.replaceWith(el('p', { class: 'small dim', text: `Couldn't draw this one on the phone: the diagram has a mistake in it. Here is what ${who} wrote, so nothing is lost. Ask him to fix it and draw it again.` }), el('pre', { class: 'diagram-text', text }));
      const row = saveRow(x);
      if (row) box.append(row);
    });
    return box;
  }

  function mediaNode(x) {
    if (x.kind === 'diagram') return diagramNode(x);
    const holder = el('div', { class: 'small dim', text: x.kind === 'audio' ? 'Getting the song…' : 'Getting it from your other replicant matrix…' });
    phone('net.media', { address: x.base.replace('http://', ''), path: x.url }).then((data) => {
      if (!data) { holder.textContent = 'Too big to show on the phone. It is on your other replicant matrix.'; return; }
      const row = saveRow(x);
      holder.replaceWith(row ? el('div', {}, mediaEl(x.kind, data), row) : mediaEl(x.kind, data));
    }).catch(() => { holder.textContent = "Couldn't fetch it from your other replicant matrix."; });
    return holder;
  }
  function mediaEl(kind, src) {
    if (kind === 'video') return el('video', { src, controls: true, playsinline: true });
    if (kind === 'audio') return el('audio', { src, controls: true });
    return el('img', { src, alt: 'Picture Bob made' });
  }

  const plain = (t) => String(t).replace(/```[\s\S]*?```/g, ' (code) ').replace(/[*_`#>]/g, '').slice(0, 4000);

  function addMsg(m) {
    const c = chat;
    c.msgs.push(m);
    saveChats();
    if (c === chat) { const box = $('chat'); if (box.firstChild && !chat.msgs[1] && m.who === 'you') box.textContent = ''; box.append(drawMsg(m)); box.scrollTop = box.scrollHeight; }
    return m;
  }
  function note(text, bad = false) { if (!chat) return toast(text); addMsg({ who: 'note', text, bad }); }

  let toastTimer;
  function toast(text) { $('status-text').textContent = text; clearTimeout(toastTimer); toastTimer = setTimeout(drawStatus, 2500); }

  // ---------- Who answers ----------
  const liveBobs = () => bobs.filter((b) => live[b.base]?.up && live[b.base]?.signedIn).map((b) => ({ ...b, ...live[b.base] }));
  const phoneModel = () => S.models.find((m) => m.id === settings.phoneModel) || S.models[0];
  const phoneReady = () => Boolean(phoneStatus.files?.[phoneModel().file.name]);

  function answerer(job = null) {
    return L.pickAnswerer({
      mode: settings.mode, phoneOn: settings.phoneOn, phoneReady: phoneReady(), job,
      bobs: bobs.map((b) => ({ ...b, ...(live[b.base] || {}) }))
    });
  }

  function nobodyWhy(why) {
    return {
      'phone-off': 'the phone brain is off and Settings says to stay on the phone. Switch it on under Phone brain.',
      'phone-missing': "the phone brain isn't downloaded yet. It's under Phone brain in the menu.",
      'net-down': "I can't reach any Bob on your network. Is your other replicant matrix on, and is Tailscale connected on both?",
      'no-bobs': 'no Bob on your network is added yet. Add one under Bob-Net.',
      nobody: "I can't reach a Bob on your network and the phone brain is off."
    }[why] || "I can't answer right now.";
  }

  function drawWho() {
    const a = answerer();
    $('who-dot').className = `dot ${a.kind}`;
    $('who-text').textContent = a.kind === 'net' ? a.bob.name : a.kind === 'phone' ? 'Phone brain' : 'No Bob reachable';
    // The greeting says who answers too: redraw it when that changes, so the two never disagree.
    if ((!chat || !chat.msgs.length) && drawWho.last !== a.kind + (a.bob?.base || '')) drawChat();
    drawWho.last = a.kind + (a.bob?.base || '');
    $('effort').classList.toggle('hidden', a.kind !== 'net');
    $('effort').textContent = `Effort: ${settings.effort[0].toUpperCase()}${settings.effort.slice(1)}`;
    drawStatus();
  }

  function drawStatus() {
    let t = '';
    if (current?.kind === 'phone') t = current.state || 'Thinking on the phone…';
    else if (current?.kind === 'net') t = `${bobName(current.base)} is on it…`;
    else if (phoneStatus.loaded) t = `Phone brain ready · ${(phoneStatus.ramFreeMB / 1024).toFixed(1)} GB free`;
    if (queue.length) t += `${t ? ' · ' : ''}${queue.length} waiting`;
    $('status-text').textContent = t;
    $('send').textContent = current ? '■' : '➤';
    $('send').setAttribute('aria-label', current ? 'Stop' : 'Send');
  }

  // ---------- Sending ----------
  function send(text, { to = null } = {}) {
    text = String(text || '').trim();
    if (!text) return;
    ensureChat(text);
    // A photo only goes to a Bob on your other replicant matrix: the phone brain can't see pictures.
    if (photo && !to) {
      const job = L.bigJob(text) || { id: 'pictures', what: 'work on a photo' };
      const a = answerer(job);
      const bob = a.kind === 'net' ? a.bob : a.offer || null;
      if (!bob) { toast("Photos go to a Bob on your other replicant matrix, and none is reachable right now. The photo is still attached."); return false; }
      addMsg({ who: 'you', text: `📷 ${text}` });
      const withPhoto = () => { queue.push({ chatId: chat.id, text, to: bob.base, photo: true }); dropPhoto(false); pump(); };
      if (a.kind === 'net') withPhoto();
      else {
        const card = el('div', { class: 'card' },
          el('div', { class: 'q', text: `The phone brain can't see pictures. Send this and the photo to "${bob.name}"?` }),
          el('div', { class: 'row' },
            el('button', { class: 'main', text: `Send to ${bob.name}`, onclick: () => { card.remove(); withPhoto(); } }),
            el('button', { text: 'Not now', onclick: () => card.remove() })));
        $('chat').append(card);
        card.scrollIntoView({ block: 'end' });
      }
      return true;
    }
    if (!to) {
      const job = L.bigJob(text);
      const a = answerer(job);
      if (a.kind === 'none') { addMsg({ who: 'you', text }); note(nobodyWhy(a.why), true); return; }
      if (a.kind === 'phone' && a.offer) { addMsg({ who: 'you', text }); return offerCard(text, job, a.offer); }
      to = a.kind === 'net' ? a.bob.base : 'phone';
    }
    addMsg({ who: 'you', text });
    queue.push({ chatId: chat.id, text, to });
    pump();
  }

  // "That's a job for a bigger Bob." Nothing is sent without this tap.
  function offerCard(text, job, bob) {
    const card = el('div', { class: 'card' },
      el('div', { class: 'q', text: `That needs a bigger Bob: I can't ${job.what} on the phone. Send it to "${bob.name}"?` }),
      el('div', { class: 'row' },
        el('button', { class: 'main', text: `Send to ${bob.name}`, onclick: () => { card.remove(); queue.push({ chatId: chat.id, text, to: bob.base }); pump(); } }),
        el('button', { text: 'Keep it here', onclick: () => { card.remove(); queue.push({ chatId: chat.id, text, to: 'phone' }); pump(); } })));
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  function pump() {
    drawStatus();
    if (current || !queue.length) return;
    const job = queue.shift();
    const c = chats.find((x) => x.id === job.chatId);
    if (!c) return pump();
    if (job.to === 'phone') return askPhone(c, job.text);
    return askNet(c, job.text, job.to, job.photo);
  }

  function finish() {
    if (current?.msg) {
      current.msg.text = current.text || (current.media?.length ? '' : '…');
      if (current.media?.length) current.msg.media = current.media;
      saveChats();
      if (current.node) current.node.replaceWith(drawMsg(current.msg));
      if (settings.readAloud && current.text) phone('speech.say', { text: plain(current.text) }).catch(() => {});
    }
    current = null;
    store.set('pending', null);
    pump();
  }

  function startReply(c, kind, by, q) {
    const msg = { who: 'bob', text: '', by, q };
    c.msgs.push(msg);
    const node = drawMsg(msg);
    node.querySelector('.words').classList.add('typing');
    if (c === chat) { $('chat').append(node); node.scrollIntoView({ block: 'end' }); }
    return { chatId: c.id, kind, msg, node, text: '', media: [] };
  }
  function grow(text) {
    if (!current) return;
    current.text += text;
    const w = current.node.querySelector('.words');
    w.innerHTML = L.markdown(current.text);
    const box = $('chat');
    if (box.scrollHeight - box.scrollTop - box.clientHeight < 200) box.scrollTop = box.scrollHeight;
  }

  // ---------- The phone brain ----------
  function askPhone(c, text) {
    const model = phoneModel();
    if (!phoneReady()) { note(nobodyWhy('phone-missing'), true); return pump(); }
    current = startReply(c, 'phone', 'phone', text);
    store.set('pending', { chatId: c.id, text });
    // The chat so far goes along each time; the phone brain only re-reads what changed since its last reply.
    // Bob's instructions stay the same from reply to reply; the time travels with your message instead.
    const history = c.msgs.slice(0, -2).filter((m) => m.who === 'you' || (m.who === 'bob' && m.text)).slice(-24)
      .map((m) => ({ role: m.who === 'you' ? 'user' : 'assistant', content: String(m.text).slice(0, 4000) }));
    const system = L.phoneSystem({ persona: S.persona, user: settings.userName, cat: S.cat, memory, bigBob: bobs[0]?.name || '' });
    const now = `Current date and time for ${(settings.userName || '').trim() || 'the user'}: ${new Date().toLocaleString()}.`;
    pcRecall(text, c.id).then((recalled) => {
      const note = recalled ? `${now}\n\n${recalled}` : now;
      return phone('brain.chat', { file: model.file.name, system, history, text, note, maxTokens: model.maxTokens || 768 });
    }).catch((e) => { grow(`*(The phone brain couldn't start: ${e.message})*`); finish(); });
    drawStatus();
  }

  // "Remember only what fits" on the PC: when the first Bob on your network is reachable, he hands over the memory
  // lines that fit this message (nothing while that setting is off). Two seconds at most; no PC, no extra memory.
  function pcRecall(text, chatId) {
    const b = bobs.find((x) => live[x.base]?.up && live[x.base]?.signedIn);
    if (!b) return Promise.resolve('');
    const ask = phone('net.post', { address: b.address, path: '/api/memory/recall', body: JSON.stringify({ text: String(text).slice(0, 4000), session: `phone-${chatId}` }) })
      .then((r) => {
        if (r.status !== 200) return '';
        const m = JSON.parse(r.body);
        if (!m.on) return '';
        return [m.always, m.text].filter((x) => typeof x === 'string' && x.trim()).join('\n').slice(0, 6000);
      }).catch(() => '');
    return Promise.race([ask, new Promise((ok) => setTimeout(() => ok(''), 2000))]);
  }

  function onBrainEvent(m) {
    if (m.type === 'download') return onDownload(m);
    if (m.type === 'bench') return onBench(m);
    if (m.type === 'brain') {
      if (m.state === 'loading' && current) { current.state = 'Waking the phone brain…'; drawStatus(); }
      if (m.state === 'thinking' && current) { current.state = 'Thinking on the phone…'; drawStatus(); }
      if (m.state === 'loaded' || m.state === 'unloaded') refreshPhone();
      return;
    }
    if (!current || current.kind !== 'phone') return;
    if (m.type === 'token') grow(m.text);
    else if (m.type === 'error') { grow(`\n\n*(Something went wrong on the phone: ${m.text})*`); finish(); }
    else if (m.type === 'done') {
      if (m.stopped) grow('\n\n*(Stopped.)*');
      else if (m.tokPerSec) current.msg.speed = Math.round(m.tokPerSec * 10) / 10;
      finish(); refreshPhone();
    }
  }

  // ---------- Bobs on the network ----------
  function askNet(c, text, base, withPhoto = false) {
    current = startReply(c, 'net', base, text);
    current.base = base;
    const b = bobs.find((x) => x.base === base);
    // The photo goes first (to that Bob's reference shelf, kind "chat"); the message then points at it.
    const upload = withPhoto
      ? phone('photo.upload', { address: b.address }).then((r) => {
        if (r.status !== 200) throw new Error(`the photo didn't arrive (${shortError(r.body)})`);
        return [JSON.parse(r.body).id];
      })
      : Promise.resolve([]);
    upload.then((refs) => phone('net.post', { address: b.address, path: '/api/chat', body: JSON.stringify({ sessionId: `phone-${c.id}`, text, effort: settings.effort, ...(refs.length ? { refs } : {}) }) }))
      .then((r) => {
        if (r.status === 401) { live[base].signedIn = false; grow(`*("${b.name}" wants the passcode again. It's under Bob-Net.)*`); finish(); drawWho(); }
        else if (r.status >= 400) { grow(`*("${b.name}" said no: ${shortError(r.body)})*`); finish(); }
      })
      .catch((e) => { grow(`*(Couldn't reach "${b.name}": ${e.message}. Check that Tailscale is on here and there. On that replicant matrix, Settings, Bob-Net: "Let my other replicant matrices in" should be on, and on Windows press "Let Tailscale through the firewall" if it shows.)*`); finish(); });
    drawStatus();
  }
  const shortError = (body) => { try { return JSON.parse(body).error || 'unknown'; } catch { return String(body).slice(0, 120); } };

  function onNetEvent(base, ev) {
    if (ev.type === 'adventure') return onAdvEvent(base, ev); // 🎲 the table on your other Bob
    if (ev.type === 'games') return onGamEvent(base, ev); // 🧩 a game on your other Bob
    if (!ev || typeof ev !== 'object') return;
    const mine = current && current.kind === 'net' && current.base === base && ev.sessionId === `phone-${current.chatId}`;
    if (ev.type === 'approval' && String(ev.sessionId || '').startsWith('phone-')) return approvalCard(base, ev);
    if (ev.type === 'checkin') return checkinCard(base, ev);
    if (ev.type === 'howto-offer' && String(ev.sessionId || '').startsWith('phone-')) return howtoCard(base, ev);
    if (ev.type === 'offer-setup' && String(ev.sessionId || '').startsWith('phone-')) return setupCard(base, ev); // 1.5.91
    if (ev.type === 'offer-rent' && String(ev.sessionId || '').startsWith('phone-')) return rentCard(base, ev); // 1.5.127 rented brains
    if (ev.type === 'rent' && ['thinking', 'back', 'start', 'used', 'stop', 'warn'].includes(ev.action)) { grow(`\n\n*🏗 ${rentLine(ev)}*`); return; }
    if (ev.type === 'approval-result') { document.querySelector(`[data-approval="${CSS.escape(String(ev.id))}"]`)?.remove(); return; }
    if (!mine) return;
    if (ev.type === 'start') current.turnId = ev.turnId;
    else if (ev.type === 'token') grow(ev.text || '');
    else if (ev.type === 'diagram') { const x = { kind: 'diagram', url: ev.url, base, title: ev.title || '' }; current.media.push(x); current.node.append(mediaNode(x)); }
    else if (ev.type === 'image' || ev.type === 'video') { const x = { kind: ev.type, url: ev.url, base }; current.media.push(x); current.node.append(mediaNode(x)); }
    else if (ev.type === 'made') {
      for (const it of ev.items || []) if (it.kind === 'audio' && it.url) { const x = { kind: 'audio', url: it.url, base }; current.media.push(x); current.node.append(mediaNode(x)); }
    }
    else if (ev.type === 'edited') { // Let Bob fix his own messages: the fix goes into this reply's words, or one short line
      const before = String(ev.before || '');
      if (before && current.text.includes(before)) { current.text = current.text.replace(before, String(ev.text || '')); grow(''); }
      else grow(`\n\n*✏️ Fixed an earlier message. It now says:* ${ev.text || ''}`);
    }
    else if (ev.type === 'tool') { if (ev.name !== 'edit_my_message') toast(`${bobName(base)}: ${ev.summary || ev.name}`); }
    else if (ev.type === 'error') grow(`\n\n*(${ev.text})*`);
    else if (ev.type === 'correction' || ev.type === 'busy-note' || ev.type === 'announce' || ev.type === 'aside') grow(`\n\n*${ev.text}*`);
    else if (ev.type === 'waiting-line') { if (!seenWaits.has(ev.id)) { seenWaits.add(ev.id); grow(`\n\n*${ev.text}*`); } } // 1.5.97: once per wait
    else if (ev.type === 'done') finish();
  }

  // A networked Bob asks for an OK. Every OK for one job is on one card, like on the PC.
  function approvalCard(base, ev) {
    if (ev.planCard) return planCard(base, ev);
    const name = bobName(base);
    const b = bobs.find((x) => x.base === base);
    const what = ev.together ? `${ev.together.length} things for one job` : ev.mcp ? `${ev.mcp.app}: ${ev.command}` : ev.command ? `run: ${ev.command}` : '';
    const answer = (allow) => phone('net.post', { address: b.address, path: '/api/approve', body: JSON.stringify({ id: ev.id, allow }) }).then(() => card.remove()).catch(() => toast("Couldn't reach your other replicant matrix"));
    const card = el('div', { class: 'card', 'data-approval': ev.id },
      el('div', { class: 'q' }, el('strong', { text: `"${name}" needs your OK` }), el('div', { text: ev.text || '' })),
      what ? el('pre', { text: what }) : null,
      ev.together ? el('p', { class: 'help-line', text: 'To tick some and not others, use the card on your other replicant matrix.' }) : null,
      el('div', { class: 'row' },
        el('button', { class: 'main', text: ev.together ? 'Allow all' : 'Allow', onclick: () => answer(true) }),
        el('button', { text: ev.together ? 'Deny all' : 'Deny', onclick: () => answer(false) })));
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  // A networked Bob shows his plan before a big job: Go ahead, Change something, or Not now (like the PC's plan card).
  function planCard(base, ev) {
    const name = bobName(base);
    const b = bobs.find((x) => x.base === base);
    const p = ev.planCard || {};
    const send = (body) => phone('net.post', { address: b.address, path: '/api/approve', body: JSON.stringify({ id: ev.id, ...body }) })
      .then(() => card.remove()).catch(() => toast("Couldn't reach your other replicant matrix"));
    const note = el('textarea', { rows: 3, maxlength: 500, placeholder: 'What should Bob change?' });
    const change = el('div', { class: 'hidden' }, note,
      el('div', { class: 'row' }, el('button', { class: 'main', text: 'Send to Bob', onclick: () => {
        const t = note.value.trim().slice(0, 500);
        if (!t) { note.focus(); return; }
        send({ allow: false, items: null, note: t });
      } }),
      el('button', { text: 'Back', onclick: () => change.classList.add('hidden') })));
    const steps = el('ol', {}, (p.steps || []).map((s) => el('li', { text: `${s.text || ''}${s.ok ? ' ✔' : ''}` })));
    const card = el('div', { class: 'card', 'data-approval': ev.id },
      el('div', { class: 'q' }, el('strong', { text: `"${name}" has a plan` }), el('div', { text: ev.text || (p.goal ? `Bob's plan: ${p.goal}` : '') })),
      p.fromSystem ? el('p', { class: 'help-line', text: 'Bob started this job without showing his plan, so these are the steps he was about to do. Check them before you go ahead.' }) : null,
      p.time ? el('p', { class: 'help-line', text: String(p.time) }) : null,
      steps,
      ev.together ? el('p', { class: 'help-line', text: '✔ means that step needs your OK. Go ahead allows them all. To tick some and not others, use the card on your other replicant matrix.' }) : null,
      el('div', { class: 'row' },
        el('button', { class: 'main', text: 'Go ahead', onclick: () => send({ allow: true, items: null }) }),
        el('button', { text: 'Change something', onclick: () => { change.classList.remove('hidden'); note.focus(); } }),
        el('button', { text: 'Not now (Bob drops this job)', onclick: () => send({ allow: false }) })),
      change);
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  // A networked Bob's check-in (set up on the PC): what needs you, shown in chat like a reminder. Read-only here.
  function checkinCard(base, ev) {
    const items = Array.isArray(ev.items) ? ev.items.slice(0, 20) : [];
    if (!items.length) return;
    const card = el('div', { class: 'card' },
      el('div', { class: 'q' }, el('strong', { text: `"${bobName(base)}" check-in` })),
      el('ul', {}, items.map((it) => el('li', {}, el('strong', { text: String(it.title || '') }), it.detail ? el('div', { text: String(it.detail) }) : null))),
      el('div', { class: 'row' }, el('button', { text: 'Got it', onclick: () => card.remove() })));
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  // A networked Bob offers to keep the steps of a job that went well. Changing or deleting how-tos is on the PC.
  function howtoCard(base, ev) {
    const b = bobs.find((x) => x.base === base);
    const steps = Array.isArray(ev.steps) ? ev.steps.slice(0, 30) : [];
    const name = el('input', { type: 'text', maxlength: 60, value: String(ev.name || '').slice(0, 60) });
    const answer = (save) => phone('net.post', { address: b.address, path: '/api/howtos/answer', body: JSON.stringify({ id: ev.id, save, name: name.value.trim().slice(0, 60) }) })
      .then((r) => {
        let out = {}; try { out = JSON.parse(r.body); } catch { /* not JSON */ }
        if (save && out.ok) {
          card.replaceChildren(el('p', { text: `Saved the how-to "${out.saved?.name || name.value.trim()}". You can change or delete it in Settings, 📒 How-tos.` }));
          setTimeout(() => card.remove(), 8000);
        } else if (save) toast(out.why || "Couldn't save the how-to");
        else card.remove();
      }).catch(() => toast("Couldn't reach your other replicant matrix"));
    const card = el('div', { class: 'card' },
      el('div', { class: 'q' }, el('strong', { text: '📒 That worked. Keep the steps as a how-to?' }), el('div', { text: "Next time you ask for something like this, I'll follow them." })),
      el('label', { text: 'Name' }), name,
      el('ol', {}, steps.map((t) => el('li', { text: String(t) }))),
      el('div', { class: 'row' },
        el('button', { class: 'main', text: 'Save how-to', onclick: () => answer(true) }),
        el('button', { text: 'Not now', onclick: () => answer(false) })));
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  // 1.5.91: a networked Bob can't do a job yet (a video maker isn't set up, Web search is off...). One press sets it up
  // on that replicant matrix and he carries on by himself. Same words as the card on the PC.
  function setupCard(base, ev) {
    const b = bobs.find((x) => x.base === base);
    const gbs = (n) => (n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(n * 1000))} MB`);
    const after = ev.carryOn ? ' Then I carry on with what you asked.' : '';
    const done = (text) => { card.replaceChildren(el('p', { text })); setTimeout(() => card.remove(), 8000); };
    const answer = (yes) => phone('net.post', { address: b.address, path: '/api/setup/answer', body: JSON.stringify({ id: ev.id, yes }) })
      .then((r) => {
        let out = {}; try { out = JSON.parse(r.body); } catch { /* not JSON */ }
        if (!yes) return card.remove();
        if (!out.ok) return done(out.why || 'That card is too old now. Ask me again.');
        if (out.done === 'download') done(`Getting ${(out.names || []).join(' and ')} (about ${out.size}) on "${bobName(base)}". ${ev.carryOn ? "Your request waits there, and I carry on as soon as it's in." : 'Ask me again when it is in.'}`);
        else if (out.done === 'switch') done(`Switched on "${ev.name}".${ev.carryOn ? ' Carrying on with your request.' : ''}`);
        else done(ev.carryOn ? "Done, it's in its slot. Carrying on with your request." : "Done, it's in its slot.");
      }).catch(() => toast("Couldn't reach your other replicant matrix"));
    let head, body, button, extra = null;
    if (ev.kind === 'switch') { head = `"${ev.name}" is off`; body = `It lets me ${String(ev.what || '')}.${ev.privacy ? ' ' + ev.privacy : ''}${ev.folders ? ' Then tick the folders I may use in Settings, Hands, on that replicant matrix.' : ''}${after} You can switch it off again in ${ev.where}.`; button = 'Switch it on'; }
    else if (ev.kind === 'equip') { head = `I can't ${ev.say} yet`; body = `${ev.model?.name || ''} is already on "${bobName(base)}", it just isn't in its slot.${after}`; button = 'Use it'; }
    else {
      head = `I can't ${ev.say} yet`; body = `I need ${ev.what} on "${bobName(base)}" first. ${ev.need === 'ffmpeg' ? 'One press gets it and sets it up.' : 'One press gets it, sets it up and puts it in its slot.'}${after}`; button = `Set it up (about ${ev.size})`;
      extra = el('ul', {}, (ev.items || []).map((i) => el('li', { text: `${i.name} · ${gbs(i.sizeGB || 0)}${i.engine ? ' · program' : ''}` })));
    }
    const card = el('div', { class: 'card' },
      el('div', { class: 'q' }, el('strong', { text: head }), el('div', { text: body })),
      extra,
      ev.kind === 'download' ? el('p', { class: 'help-line', text: `About ${ev.size} in all${ev.freeGB != null ? `, ${ev.freeGB} GB free` : ''}. One time only.${ev.note ? ' ' + ev.note : ''}${ev.short ? ` Not enough free disk: free up ${ev.short} GB first.` : ''}` }) : null,
      el('div', { class: 'row' },
        ev.short ? null : el('button', { class: 'main', text: button, onclick: () => answer(true) }),
        el('button', { text: 'Not now', onclick: () => answer(false) })));
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  // 1.5.127 Rented brains: the Hire it card from your home Bob (same words as on the PC), and his one-line notes.
  function rentLine(ev) {
    if (ev.action === 'thinking') return `Rented brain: ${ev.rental} thinks this one. The tools still run on your other replicant matrix.`;
    if (ev.action === 'back') return `${ev.rental} couldn't take it (${ev.why || ''}), so Bob thinks this one himself.`;
    if (ev.action === 'start') return `Started a rented machine on ${ev.service}. It stops when the job is done, or after ${ev.minutes} minutes whatever happens.`;
    if (ev.action === 'used') return `${ev.rental}: about ${ev.usd} so far this job; ${ev.monthUsd} this month.`;
    if (ev.action === 'stop') return ev.stopped ? `Stopped the rented machine (${ev.service}) after ${ev.minutes} min, ${ev.usd}.` : `Couldn't stop the rented machine on ${ev.service}. Stop it on their website so it doesn't keep billing.`;
    return ev.text || '';
  }
  function rentCard(base, ev) {
    const b = bobs.find((x) => x.base === base);
    const r = ev.rental || {};
    const done = (text) => { card.replaceChildren(el('p', { text })); setTimeout(() => card.remove(), 8000); };
    const answer = (yes) => phone('net.post', { address: b.address, path: '/api/rent/answer', body: JSON.stringify({ id: ev.id, yes }) })
      .then((x) => {
        let out = {}; try { out = JSON.parse(x.body); } catch { /* not JSON */ }
        if (!yes) return card.remove();
        if (!out.ok) return done(out.why || 'That card is too old now. Ask me again.');
        done(out.carryOn ? `Hired ${out.name}. Running your request there now.` : `Hired ${out.name} for your next messages.`);
      }).catch(() => toast("Couldn't reach your other replicant matrix"));
    const start = ev.startMinutes ? ` It takes about ${ev.startMinutes} minute${ev.startMinutes === 1 ? '' : 's'} to start${r.kind === 'machine' ? ', and those minutes are billed too' : ''}.` : '';
    const card = el('div', { class: 'card' },
      el('div', { class: 'q' }, el('strong', { text: `Hire ${r.name || 'the rented brain'}?` }), el('div', { text: `${ev.why || ''} ${r.model || ''} on ${r.service || ''}: ${ev.price || ''}.${start}${ev.carryOn ? ' Then Bob runs your request there; his tools still run on your other replicant matrix.' : ' Then your next messages run there.'}` })),
      el('p', { class: 'help-line', text: `What leaves your other replicant matrix: this chat, the files attached to it, Bob's instructions and what he remembers about you, to ${r.service || 'the service'}${r.plain ? ' (over a plain, unencrypted connection to the hired machine)' : ''}. Their privacy policy covers it there.` }),
      (r.cards || 1) > 1 ? el('p', { class: 'help-line', text: `⚠️ This machine has ${r.cards} cards at once (${r.cardsText || ''}): about ${r.cards} times the hourly price of one card, busy or not.` }) : null,
      ev.blocked ? el('p', { class: 'help-line', text: ev.blocked }) : null,
      el('div', { class: 'row' },
        ev.blocked ? null : el('button', { class: 'main', text: `Hire it (${ev.est || 'a few cents'})`, onclick: () => answer(true) }),
        el('button', { text: 'Not now', onclick: () => answer(false) })));
    $('chat').append(card);
    card.scrollIntoView({ block: 'end' });
  }

  async function refreshBob(base, { listen = true } = {}) {
    const b = bobs.find((x) => x.base === base);
    if (!b) return;
    const st = (live[base] ||= {});
    try {
      st.signedIn = await phone('net.signedIn', { address: b.address });
      if (!st.signedIn) { st.up = false; drawWho(); return; }
      const caps = await phone('net.get', { address: b.address, path: '/api/capabilities' });
      if (caps.status === 401) { st.signedIn = false; st.up = false; }
      else if (caps.status === 200) { st.can = JSON.parse(caps.body); st.up = true; }
      if (listen) phone('net.listen', { address: b.address }).catch(() => {});
    } catch { st.up = false; }
    drawWho();
    if (!$('bobs').classList.contains('hidden')) drawBobs();
  }
  function refreshAll() { bobs.forEach((b) => refreshBob(b.base)); refreshPhone(); phone('pair.waiting').then((l) => (l || []).forEach(onPair)).catch(() => {}); }

  // ---------- Panels ----------
  function open(id) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.add('hidden'));
    if (id === 'new') { newChat(); return; }
    $(id).classList.remove('hidden');
    ({ chats: drawChats, bobs: drawBobs, brain: drawBrain, adventure: drawAdventure, games: drawGames, chest: drawChest, memory: drawMemory, settings: drawSettings, help: drawHelp }[id] || (() => {}))();
    if (id === 'bobs') watchLend();
  }
  document.querySelectorAll('.panel .back').forEach((b) => b.addEventListener('click', () => b.closest('.panel').classList.add('hidden')));
  document.querySelectorAll('#menu [data-go]').forEach((b) => b.addEventListener('click', () => open(b.dataset.go)));
  $('open-menu').addEventListener('click', () => open('menu'));
  $('who').addEventListener('click', () => open(bobs.length || !settings.phoneOn ? 'bobs' : 'brain'));

  function drawChats() {
    const q = $('chat-search').value.trim().toLowerCase();
    const list = $('chat-list');
    list.textContent = '';
    const found = chats.filter((c) => !q || c.title.toLowerCase().includes(q) || c.msgs.some((m) => String(m.text).toLowerCase().includes(q)));
    if (!found.length) list.append(el('p', { class: 'dim', text: q ? 'Nothing matches.' : 'No chats yet.' }));
    for (const c of found) {
      list.append(el('div', { class: 'chatrow' },
        el('button', { class: 'open', onclick: () => { chat = c; drawChat(); $('chats').classList.add('hidden'); } }, c.title, el('span', { class: 'when', text: new Date(c.at).toLocaleString() })),
        el('button', { 'aria-label': `Delete ${c.title}`, text: '🗑', onclick: (e) => {
          const btn = e.currentTarget;
          if (btn.dataset.sure) { chats = chats.filter((x) => x !== c); if (chat === c) chat = null; saveChats(); drawChats(); drawChat(); }
          else { btn.dataset.sure = '1'; btn.textContent = 'Sure?'; }
        } })));
    }
  }
  $('chat-search').addEventListener('input', drawChats);

  function drawBobs() {
    drawLend();
    const list = $('bob-list');
    list.textContent = '';
    if (!bobs.length) list.append(el('p', { class: 'dim', text: 'None yet. Add your other replicant matrix\'s Bob below.' }));
    else list.append(el('p', { class: 'help-line', text: bobs.length > 1 ? 'The First choice answers when more than one Bob is reachable. Make first choice on another Bob moves him to the top.' : 'The First choice answers when more than one Bob is reachable. Add another Bob to choose between them.' }));
    bobs.forEach((b, i) => {
      const st = live[b.base] || {};
      const state = !st.signedIn ? 'Needs the passcode' : st.up ? 'Reachable' : "Can't reach right now";
      const pass = el('input', { type: 'password', placeholder: 'Passcode', autocomplete: 'off', 'aria-label': `Passcode for ${b.name}` });
      const msg = el('p', { class: 'help-line', role: 'status' });
      const box = el('div', { class: 'box' },
        el('div', { class: 'title' }, el('i', { class: `dot ${st.up && st.signedIn ? 'net' : 'none'}` }), b.name, i === 0 ? el('span', { class: 'badge', text: 'First choice' }) : null),
        el('p', { class: 'help-line', text: `${b.address} · ${state}` }),
        !st.signedIn ? el('div', { class: 'gap' }, pass) : null,
        el('div', { class: 'btns' },
          !st.signedIn ? el('button', { class: 'main', text: 'Log in', onclick: async () => {
            msg.textContent = 'Knocking…';
            try {
              const r = await phone('net.login', { address: b.address, code: pass.value });
              pass.value = '';
              msg.textContent = { ok: "You're in.", wrong: "That's not the passcode.", busy: 'Too many tries. Wait a minute.', 'not-let-in': `${b.name} isn't letting other replicant matrices in yet. On your other replicant matrix: Settings, Bob-Net, Let my other replicant matrices in.` }[r] || `Couldn't log in (${r}). Check that Tailscale is on on both devices, then try again.`;
              if (r === 'ok') refreshBob(b.base);
            } catch (e) { logError('bobs', e.message); msg.textContent = `Can't reach ${b.name}: is your other replicant matrix on and Tailscale connected? (${e.message})`; }
          } }) : el('button', { text: 'Check again', onclick: () => refreshBob(b.base) }),
          i > 0 ? el('button', { text: 'Make first choice', onclick: () => { bobs.splice(i, 1); bobs.unshift(b); store.set('bobs', bobs); drawBobs(); drawWho(); } }) : null,
          el('button', { text: 'Remove', onclick: (e) => {
            if (!e.currentTarget.dataset.sure) { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = 'Sure? Tap again'; return; }
            phone('net.forget', { address: b.address }).catch(() => {});
            bobs = bobs.filter((x) => x !== b); delete live[b.base]; store.set('bobs', bobs); drawBobs(); drawWho();
          } })),
        msg);
      list.append(box);
    });
  }
  $('add-bob').addEventListener('click', () => {
    const address = $('add-address').value.trim();
    const base = L.netAddress(address);
    // No name typed: "Bob on" that machine's Tailscale name (desktop.tailnet.ts.net -> "Bob on desktop").
    const host = base ? base.replace(/^https?:\/\//, '').replace(/:\d+$/, '').replace(/^\[|\]$/g, '') : '';
    const short = /^[\d.]+$/.test(host) || host.includes(':') ? '' : host.split('.')[0];
    const name = $('add-name').value.trim().slice(0, 40) || (short ? `Bob on ${short}`.slice(0, 40) : 'Bob on my other replicant matrix');
    if (!base) { $('add-msg').textContent = "That isn't a Tailscale address. It looks like my-computer.your-tailnet.ts.net or 100.x.y.z (Bob's Settings on your other replicant matrix shows it)."; return; }
    if (bobs.some((b) => b.base === base)) { $('add-msg').textContent = 'That Bob is already on the list.'; return; }
    bobs.push({ name, address: base.replace('http://', ''), base });
    store.set('bobs', bobs);
    $('add-name').value = ''; $('add-address').value = '';
    $('add-msg').textContent = `Added. Now type ${name}'s passcode and tap Log in.`;
    drawBobs(); drawWho();
  });

  // ---------- Pair with my other Bobs (Bob-Net pairing v1) ----------
  $('pair-bob').addEventListener('click', () => {
    const address = $('add-address').value.trim();
    if (!L.netAddress(address)) { $('add-msg').textContent = "That isn't a Tailscale address. It looks like my-computer.your-tailnet.ts.net or 100.x.y.z (Bob's Settings on your other replicant matrix shows it)."; return; }
    $('add-msg').textContent = 'Asking…';
    phone('pair.with', { address }).then((r) => {
      if (r.error) { $('add-msg').textContent = r.error; return; }
      const who = r.name || 'that Bob';
      $('add-msg').replaceChildren(`Waiting for a yes on ${who}. Its card shows the number `, el('strong', { text: String(r.number) }), ': check it matches, then tap Yes, pair us over there.');
    }).catch((e) => { $('add-msg').textContent = `Couldn't ask: ${e.message}.`; });
  });

  function addPaired(name, address) {
    const base = L.netAddress(address);
    if (!base) return;
    const had = bobs.find((b) => b.base === base);
    if (had) had.name = had.name || name;
    else bobs.push({ name: String(name || 'Bob').slice(0, 40), address: base.replace('http://', ''), base });
    store.set('bobs', bobs);
    refreshBob(base);
    drawBobs(); drawWho(); // the new Bob shows up straight away
  }

  function onPair(ev) {
    if (!ev || typeof ev !== 'object') return;
    if (ev.type === 'pair-gone') { document.querySelector(`[data-pair="${CSS.escape(String(ev.id))}"]`)?.remove(); return; }
    if (ev.type === 'pair-ask') {
      if (document.querySelector(`[data-pair="${CSS.escape(String(ev.id))}"]`)) return;
      const name = String(ev.name || 'Another Bob');
      const say = (yes) => phone('pair.answer', { id: ev.id, yes }).then((r) => { if (r.ok) card.remove(); else toast(r.why || "Couldn't answer."); }).catch(() => toast("Couldn't answer."));
      const card = el('div', { class: 'card', 'data-pair': ev.id },
        el('div', { class: 'q' }, el('strong', { text: `🤝 ${name} wants to join your Bob-Net.` }),
          el('div', {}, `${name}'s screen should show the number `, el('strong', { text: String(ev.number) }), `. If it does, tap Yes, pair us; if not, tap No. This phone and ${name} swap passcodes so each can reach the other. Nothing else switches on.`)),
        el('div', { class: 'row' },
          el('button', { class: 'main', text: 'Yes, pair us', onclick: () => say(true) }),
          el('button', { text: 'No', onclick: () => say(false) })));
      $('chat').append(card);
      card.scrollIntoView({ block: 'end' });
      return;
    }
    if (ev.type === 'pair-done') {
      const name = String(ev.name || 'that Bob');
      if (ev.added) addPaired(name, ev.address);
      let t;
      if (ev.by) t = ev.added ? `${ev.by} introduced ${name}: paired, both ways. ${name} is under My other Bobs.` : `${ev.by} introduced ${name}: paired one way. ${name} can ask this phone, but this phone can't ask ${name} until "Let my other replicant matrices in" is on there.`; // Pass my Bob-Net along: no card was shown
      else if (ev.asker) t = ev.both ? `Paired with ${name}, both ways.` : `Paired with ${name}. This phone can ask ${name} now. For ${name} to ask this phone too, turn on Lend my brain here, then pair again.`;
      else t = ev.added ? `Paired with ${name}, both ways.` : `Paired with ${name} one way: ${name} can ask this phone, but this phone can't ask ${name} until "Let my other replicant matrices in" is on there. Then pair again.`;
      note(t);
      if (!$('bobs').classList.contains('hidden')) $('add-msg').textContent = t;
      return;
    }
    if (ev.type === 'pair-state' && ev.state !== 'paired') {
      const t = { no: 'That Bob said no.', timeout: 'Nobody answered in time. Tap Pair with this Bob to try again.', failed: `Couldn't pair${ev.why ? `: ${ev.why}` : ''}.` }[ev.state];
      if (t) { $('add-msg').textContent = t; toast(t); }
    }
  }

  // ---------- Phone brain panel ----------
  let dl = null; // { file, have, bytes, state, text }
  let bench = {}; // file -> result line
  async function refreshPhone() {
    try { phoneStatus = await phone('brain.status'); } catch { /* not on a phone (tests) */ }
    drawWho();
    if (!$('brain').classList.contains('hidden')) drawBrain();
  }
  function drawBrain() {
    $('phone-on').checked = settings.phoneOn;
    $('free-idle').checked = settings.freeWhenIdle;
    $('idle-min').value = String(settings.idleMinutes);
    const box = $('brain-models');
    box.textContent = '';
    // Each model family (Gemma, Qwen, ...) behind its own header, closed until you open it, like the Brain catalogue.
    const fams = new Map();
    for (const m of S.models) { const f = m.family || 'Other brains'; if (!fams.has(f)) fams.set(f, []); fams.get(f).push(m); }
    const openFams = new Set(store.get('openFamilies', []));
    const famList = {};
    for (const [f, list] of [...fams].sort((a, b) => Number(b[1].some((m) => m.pick === 'recommended')) - Number(a[1].some((m) => m.pick === 'recommended')))) {
      const inUse = list.some((m) => settings.phoneModel === m.id && phoneStatus.files?.[m.file.name]);
      const getting = list.some((m) => dl && dl.file === m.file.name);
      const gb = list.map((m) => m.file.bytes);
      const d = el('details', { class: 'fam', open: openFams.has(f) || getting },
        el('summary', {}, el('strong', { text: f }),
          el('span', { class: 'dim', text: `${list.length} ${list.length === 1 ? 'model' : 'models'} · ${list.length === 1 ? L.size(gb[0]) : `${L.size(Math.min(...gb))} to ${L.size(Math.max(...gb))}`}` }),
          list.some((m) => m.pick === 'recommended') ? el('span', { class: 'badge', text: "★ Recommended inside" }) : null,
          inUse ? el('span', { class: 'badge quiet', text: 'In use' }) : null),
        famList[f] = el('div', { class: 'fam-list' }));
      d.addEventListener('toggle', () => { const s = new Set(store.get('openFamilies', [])); if (d.open) s.add(f); else s.delete(f); store.set('openFamilies', [...s]); });
      box.append(d);
    }
    for (const m of S.models) {
      const have = Boolean(phoneStatus.files?.[m.file.name]);
      const fit = L.fits(m, phoneStatus.ramTotalMB);
      const using = settings.phoneModel === m.id;
      const going = dl && dl.file === m.file.name;
      const confirm = el('div', { class: 'hidden' },
        el('p', { class: 'help-line', text: `Download ${L.size(m.file.bytes)} from huggingface.co? Wi-Fi is best. The file is checked against its pinned checksum before Bob uses it.` }),
        el('div', { class: 'btns' },
          el('button', { class: 'main', text: 'Yes, download', onclick: () => { dl = { file: m.file.name, have: 0, bytes: m.file.bytes, state: 'going' }; phone('brain.download', { file: m.file.name, url: m.file.url, bytes: m.file.bytes, sha256: m.file.sha256 })
            .catch((e) => { dl = { ...dl, state: 'error', text: e.message }; drawBrain(); }); drawBrain(); } }),
          el('button', { text: 'Not now', onclick: () => confirm.classList.add('hidden') })));
      const b = el('div', { class: 'box' },
        el('div', { class: 'title' }, m.name,
          m.pick === 'recommended' ? el('span', { class: 'badge', text: 'Recommended' }) : null,
          using && have ? el('span', { class: 'badge quiet', text: 'In use' }) : null),
        el('p', { class: 'help-line', text: `${m.what} ${m.license}.` }),
        !fit.ok ? el('p', { class: 'help-line', text: "This phone is short on memory for it; it may be closed by Android while it thinks." }) : fit.tight ? el('p', { class: 'help-line', text: 'It fits, with not much room to spare. Close big apps if replies stall.' }) : null,
        going ? el('div', {}, el('div', { class: 'bar' }, (() => { const i = el('i'); i.style.width = `${Math.round((dl.have / dl.bytes) * 100)}%`; return i; })()),
          el('p', { class: 'help-line', text: dl.state === 'checking' ? 'Checking the file…' : dl.state === 'paused' ? `Paused at ${L.size(dl.have)} of ${L.size(dl.bytes)}` : dl.state === 'error' ? `Stopped: ${dl.text}` : `${L.size(dl.have)} of ${L.size(dl.bytes)}` })) : null,
        el('div', { class: 'btns' },
          have ? (using ? null : el('button', { class: 'main', text: 'Use this one', onclick: () => { settings.phoneModel = m.id; saveSettings(); phone('brain.unload').catch(() => {}); tellLendBrain(); drawBrain(); drawWho(); } }))
            : going && dl.state === 'going' ? el('button', { text: 'Pause', onclick: () => phone('brain.pause') })
            : el('button', { class: 'main', text: going && dl.state === 'paused' ? 'Resume' : `Download (${L.size(m.file.bytes)})`, onclick: () => confirm.classList.remove('hidden') }),
          going && dl.state !== 'checking' ? el('button', { text: 'Cancel', onclick: () => { phone('brain.cancel', { file: m.file.name }); dl = null; drawBrain(); } }) : null,
          have ? el('button', { text: 'Test speed', onclick: () => { bench[m.file.name] = 'Testing… (about a minute)'; phone('brain.bench', { file: m.file.name }); drawBrain(); } }) : null,
          have ? el('button', { text: 'Delete', onclick: (e) => {
            if (!e.currentTarget.dataset.sure) { e.currentTarget.dataset.sure = '1'; e.currentTarget.textContent = using ? `Delete ${m.name} (${L.size(m.file.bytes)})? The phone brain stops until you download one again. Tap again to delete.` : `Delete ${m.name} (${L.size(m.file.bytes)})? Tap again to delete.`; return; }
            phone('brain.delete', { file: m.file.name }).then(refreshPhone);
          } }) : null),
        bench[m.file.name] ? el('p', { class: 'help-line', text: bench[m.file.name] }) : null,
        confirm);
      famList[m.family || 'Other brains'].append(b);
    }
    const s = phoneStatus;
    $('brain-ram').textContent = s.ramTotalMB ? `This replicant matrix (this phone): ${deviceModel || 'Android phone'} · ${Math.round(s.ramTotalMB / 1024)} GB RAM. ${(s.ramFreeMB / 1024).toFixed(1)} GB free right now${s.loaded ? ' (phone brain loaded)' : ''}. ${(s.freeSpaceMB / 1024).toFixed(0)} GB storage free.` : '';
  }
  function onDownload(m) {
    dl = { ...(dl || {}), ...m };
    if (m.state === 'done') { dl = null; toast('Phone brain downloaded and checked.'); refreshPhone(); }
    if (m.state === 'error') toast(`Download stopped: ${m.text}`);
    if (!$('brain').classList.contains('hidden')) drawBrain();
  }
  function onBench(m) {
    const name = phoneModel().file.name;
    const read = Number(m.read) || 0, write = Number(m.write) || 0;
    bench[name] = m.error ? `Speed test failed: ${m.error}` : `Reads about ${Math.round(read)} words a second and writes about ${write.toFixed(1)}. Anything over 8 feels like chatting.`;
    if (!$('brain').classList.contains('hidden')) drawBrain();
  }

  // ---------- Lend my brain (off unless you turn it on) ----------
  let lend = {}; // what the phone says: { on, state, address, passcodeSet, last, now, screenOffOk }
  let lendCode = ''; // a new passcode, shown once
  let lendTimer = null;
  const LEND_WHY = {
    'no brain': 'Download a phone brain above first.',
    busy: 'Busy with your own chat on the phone right now.',
    'in use': "Says no while you're using the phone for something else.",
    'too warm': "Says no while the phone is warm. He'll say yes again once it cools down.",
    'low battery': 'Says no below 25% battery, unless the phone is charging.'
  };
  // While the Bob-Net screen is open, the lending line stays up to date.
  function watchLend() {
    refreshLend();
    clearInterval(lendTimer);
    lendTimer = setInterval(() => { if ($('bobs').classList.contains('hidden')) clearInterval(lendTimer); else refreshLend(); }, 5000);
  }
  function tellLendBrain() { const m = phoneModel(); if (m) phone('lend.brain', { file: m.file.name, label: m.name }).catch(() => {}); }
  async function refreshLend() {
    try { lend = await phone('lend.status'); } catch { lend = {}; }
    if (!$('bobs').classList.contains('hidden')) drawLend();
  }
  function drawLend() {
    $('lend-on').checked = Boolean(lend.on);
    $('pass-along').checked = Boolean(lend.passAlong);
    $('pass-along-msg').textContent = lend.passAlong && !lend.on ? 'Pass my Bob-Net along waits for Lend my brain: introductions come in through that door.' : '';
    const box = $('lend-box');
    box.textContent = '';
    const addr = lend.state === 'open' && lend.address ? el('code', { text: lend.address })
      : lend.on ? el('span', { class: 'dim', text: lend.state === 'waiting' ? 'Waiting for Tailscale on this phone. Switch Tailscale on.' : 'Opening…' })
      : el('span', { class: 'dim', text: 'Shown here once Lend my brain is on.' });
    // (DOM append prints a null as the word "null", so the parts that may be missing are filtered out.)
    box.append(...[
      el('div', { class: 'box' },
        el('div', { class: 'title', text: 'Passcode' }),
        el('p', { class: 'help-line', text: lendCode ? `${lendCode}  Type it into your other Bob now: it isn't shown again.` : lend.passcodeSet ? "Set (it's only shown once, when you make it)." : 'Not set yet. Turning on Lend my brain makes one for you.' }),
        el('div', { class: 'btns' }, el('button', { text: lend.passcodeSet ? 'Make a new passcode' : 'Make a passcode', onclick: async () => {
          try { lendCode = await phone('lend.newPasscode'); } catch (e) { toast(e.message); }
          refreshLend();
        } })),
        lend.passcodeSet ? el('p', { class: 'help-line', text: 'A new passcode signs out every Bob that used the old one.' }) : null),
      el('div', { class: 'box' },
        el('div', { class: 'title', text: 'Address for your other Bobs' }), el('p', { class: 'help-line' }, addr),
        el('p', { class: 'help-line', text: 'On your other replicant matrix: Settings, Bob-Net, Borrow a brain. Add this address and the passcode there.' })),
      lend.on ? el('p', { class: 'help-line', role: 'status', text: [lend.now && lend.now !== 'off' ? LEND_WHY[lend.now] || '' : '', lend.last || ''].filter(Boolean).join(' ') }) : null,
      el('div', { class: 'box' },
        el('div', { class: 'title', text: 'Let Bob work with the screen off' }),
        el('p', { class: 'help-line', text: lend.screenOffOk ? 'Done: Android lets Bob answer with the screen off.' : "Android may stop Bob answering when the screen is off. This opens Android's battery list: pick Bob, then Allow (or Unrestricted)." }),
        lend.screenOffOk ? null : el('div', { class: 'btns' }, el('button', { text: 'Open battery settings', onclick: () => phone('lend.screenOff').catch(() => {}) })))].filter(Boolean));
  }
  $('lend-on').addEventListener('change', async (e) => {
    const on = e.target.checked;
    if (on) tellLendBrain();
    try {
      // No passcode yet: make it now, as part of turning this on (it's shown above, once).
      if (on && !lend.passcodeSet) { lendCode = await phone('lend.newPasscode'); lend.passcodeSet = true; }
      await phone('lend.on', { on });
    } catch (err) { e.target.checked = false; logError('lend', err.message); toast(`Lend my brain: ${err.message}.`); }
    setTimeout(refreshLend, 800);
  });
  $('pass-along').addEventListener('change', async (e) => {
    const on = e.target.checked;
    try { await phone('lend.passAlong', { on }); } catch (err) { e.target.checked = !on; logError('lend', err.message); toast(`Pass my Bob-Net along: ${err.message}.`); }
    refreshLend();
  });
  $('phone-on').addEventListener('change', (e) => { settings.phoneOn = e.target.checked; saveSettings(); drawWho(); });
  $('free-idle').addEventListener('change', (e) => { settings.freeWhenIdle = e.target.checked; saveSettings(); sendBrainConfig(); });
  $('idle-min').addEventListener('change', (e) => { settings.idleMinutes = Number(e.target.value); saveSettings(); sendBrainConfig(); });
  $('unload-now').addEventListener('click', () => phone('brain.unload').then(() => { toast('Phone brain let go of its memory.'); refreshPhone(); }));
  const sendBrainConfig = () => phone('brain.config', { freeWhenIdle: settings.freeWhenIdle, idleMinutes: settings.idleMinutes }).catch(() => {});

  // ---------- Memory, settings ----------
  function drawMemory() { $('memory-text').value = memory; $('memory-msg').textContent = ''; }
  $('memory-save').addEventListener('click', () => { memory = $('memory-text').value.slice(0, 6000); store.set('memory', memory); $('memory-msg').textContent = 'Saved. The phone brain uses it from the next new chat.'; });

  function drawSettings() {
    drawOwnKit();
    globalThis.BobLock?.drawSettings();
    document.querySelectorAll('input[name="mode"]').forEach((r) => { r.checked = r.value === settings.mode; });
    $('user-name').value = settings.userName;
    $('read-aloud').checked = settings.readAloud;
    $('theme').value = settings.theme;
    $('resume').checked = settings.resume;
  }
  document.querySelectorAll('input[name="mode"]').forEach((r) => r.addEventListener('change', () => { settings.mode = r.value; saveSettings(); drawWho(); }));
  $('user-name').addEventListener('change', (e) => { settings.userName = e.target.value.replace(/[<>{}"`\\]/g, '').trim().slice(0, 40); saveSettings(); });
  $('read-aloud').addEventListener('change', (e) => { settings.readAloud = e.target.checked; saveSettings(); });
  $('theme').addEventListener('change', (e) => { settings.theme = e.target.value; saveSettings(); applyTheme(); });
  $('resume').addEventListener('change', (e) => { settings.resume = e.target.checked; saveSettings(); });
  const applyTheme = () => document.documentElement.setAttribute('data-theme', settings.theme);

  // ---------- 1.5.144 Tools and how-tos Bob made (the other Bob's, through him) ----------
  // The same list as his Settings panel. Delete asks on the row, then the thing waits 30 days under Recently deleted;
  // Undo and Put back bring it back. Delete for good and Edit are on the other replicant matrix only.
  const ownAsk = { kind: '', id: '' };
  let ownLast = null;
  async function drawOwnKit() {
    const box = $('own-kit'), msg = $('own-kit-msg');
    if (!box) return;
    const b = liveBobs()[0];
    box.textContent = '';
    if (!b) { box.append(el('p', { class: 'dim', text: 'No Bob on your Bob-Net is reachable right now. His tools and how-tos show here when one is.' })); return; }
    let k;
    try { const r = await phone('net.get', { address: b.address, path: '/api/own-kit' }); if (r.status !== 200) throw new Error(`${b.name} answered ${r.status}`); k = JSON.parse(r.body); }
    catch (e) { box.append(el('p', { class: 'dim', text: `Couldn't get the list from ${b.name} (${e.message}).` })); return; }
    const kindWord = { tool: 'tool', howto: 'how-to' };
    const act = async (path, kind, id, name) => {
      msg.textContent = '';
      try {
        const r = await phone('net.post', { address: b.address, path: `/api/own-kit/${path}`, body: JSON.stringify({ kind, id }) });
        let out = {}; try { out = JSON.parse(r.body); } catch { /* not JSON */ }
        if (r.status !== 200) throw new Error(out.error || `${b.name} answered ${r.status}`);
        ownLast = path === 'delete' ? { kind, id, name } : null;
        ownAsk.kind = ownAsk.id = '';
        await drawOwnKit();
        msg.textContent = path === 'delete' ? `Deleted the ${kindWord[kind]} "${name}". It waits 30 days under Recently deleted.` : `Put the ${kindWord[kind]} "${name}" back.`;
      } catch (e) { logError('own-kit', e.message); msg.textContent = `Couldn't do that: ${e.message}`; }
    };
    const delBtns = (kind, id, name) => ownAsk.kind === kind && ownAsk.id === id
      ? [el('span', { class: 'small', text: `Delete "${name}"?` }), el('button', { class: 'main', text: 'Delete', 'aria-label': `Yes, delete the ${kindWord[kind]} ${name}`, onclick: () => act('delete', kind, id, name) }), el('button', { text: 'Keep it', onclick: () => { ownAsk.kind = ownAsk.id = ''; drawOwnKit(); } })]
      : [el('button', { text: 'Delete', 'aria-label': `Delete the ${kindWord[kind]} ${name}`, onclick: () => { ownAsk.kind = kind; ownAsk.id = id; ownLast = null; drawOwnKit(); } })];
    if (ownLast) box.append(el('div', { class: 'box' }, el('p', { class: 'help-line', text: `Deleted the ${kindWord[ownLast.kind]} "${ownLast.name}".` }), el('div', { class: 'btns' }, el('button', { text: 'Undo', onclick: () => act('restore', ownLast.kind, ownLast.id, ownLast.name) }))));
    const section = (title, rows, none) => box.append(el('div', { class: 'box' }, el('div', { class: 'title', text: title }), rows.length ? rows : el('p', { class: 'help-line', text: none })));
    const dayOf = (t) => new Date(t).toLocaleDateString([], { month: 'short', day: 'numeric' });
    const stateWord = { off: 'turned off', changed: 'off: its files changed', missing: 'its folder is gone' };
    section(`Tools he wrote (${k.tools.length})`, k.tools.map((t) => el('div', { class: 'gap' },
      el('div', {}, el('strong', { text: t.name }), stateWord[t.state] ? el('span', { class: 'dim small', text: ` · ${stateWord[t.state]}` }) : null),
      el('p', { class: 'help-line', text: `${t.what} Can change: ${t.writes.join('; ') || 'nothing outside its folder'}. Internet: ${t.internet ? 'yes' : 'no'}.` }),
      el('div', { class: 'btns' }, delBtns('tool', t.name, t.name)))), k.makerOn ? 'No tools yet.' : 'No tools yet. Making them is off in his Settings (Make his own tools).');
    section(`How-tos he kept (${k.howtos.length})`, k.howtos.map((r) => el('div', { class: 'gap' },
      el('div', {}, el('strong', { text: r.name }), el('span', { class: 'dim small', text: ` · ${r.steps.length} steps${r.used ? `, used ${r.used} time${r.used === 1 ? '' : 's'}` : ''}` })),
      r.when && r.when !== r.name ? el('p', { class: 'help-line', text: `For: ${r.when}` }) : null,
      el('div', { class: 'btns' }, delBtns('howto', r.id, r.name)))), k.howtosOn ? 'No how-tos yet.' : 'No how-tos yet. Learning them is off in his Settings (Let Bob learn how-tos).');
    section(`Recently deleted (${k.deleted.length})`, k.deleted.map((d) => el('div', { class: 'gap' },
      el('div', {}, el('strong', { text: d.name }), el('span', { class: 'dim small', text: ` · ${kindWord[d.kind]} · gone for good ${dayOf(d.goneAt)}` })),
      el('div', { class: 'btns' }, el('button', { text: 'Put back', 'aria-label': `Put the ${kindWord[d.kind]} ${d.name} back`, onclick: () => act('restore', d.kind, d.id, d.name) })))), 'Nothing waiting. Each deleted thing waits here 30 days.');
    if (k.deleted.length) box.append(el('p', { class: 'help-line', text: `Delete for good, and editing a how-to, are done on ${b.name} itself.` }));
  }

  // ---------- Save a help bundle ----------
  // From a Bob on your network: his zip (he scrubs it). Phone only: one HANDOFF.md written here, scrubbed here.
  const scrub = (t) => String(t)
    .replace(/\b100\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '<tailscale address>')
    .replace(/\b[\w.-]+\.ts\.net\b/g, '<tailscale address>')
    .replace(settings.userName ? new RegExp(settings.userName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi') : /$^/, 'the owner');
  function phoneHandoff(d) {
    const stamp = new Date().toISOString();
    const brain = phoneStatus.loaded ? `${phoneStatus.loaded} (loaded)` : Object.keys(phoneStatus.files || {}).length ? `${Object.keys(phoneStatus.files).join(', ')} (downloaded, not loaded)` : 'none downloaded';
    const errs = errors.length ? errors.map((e) => `- ${e.at} [${e.where}] ${e.text}`).join('\n') : '- none recorded';
    const chatOut = chats.slice(0, 3).map((c) => `## ${c.title || 'Chat'} (${new Date(c.at).toISOString()})\n` + c.msgs.slice(-40).map((m) => `**${m.who === 'you' ? 'owner' : 'Bob'}${m.by ? ` (${m.by})` : ''}:** ${String(m.text || '').slice(0, 2000)}`).join('\n\n')).join('\n\n') || '(no chats yet)';
    return scrub(`# HANDOFF.md: Bob on Android, phone-only help bundle

Read this first. I'm Bob, a free local AI helper: public code at https://github.com/MouseWurX/Bob (folder android/), version ${d.version || '?'}. This bundle was put together on the phone alone: no Bob on the owner's network was reachable, so there's no logbook from the owner's other replicant matrix here and no note from my brain. Assume the worst and start with the phone brain.

## This replicant matrix (the phone)
- ${d.maker || ''} ${d.model || ''}, Android ${d.android || '?'}
- Bob for Android ${d.version || '?'}
- Phone brain: ${brain}
- Who answers: ${settings.mode}; phone brain on: ${settings.phoneOn ? 'yes' : 'no'}; Bobs added: ${bobs.length}
- Written: ${stamp}

## Where to start, agent
1. Read the errors below; the newest is last.
2. If the brain file wouldn't open or replies never come: android/app/src/main/java/ca/mousewurx/bob/Llama.kt and PhoneBrain.kt, then android/bob_llama.cpp.
3. If a Bob on the network can't be reached: NetBob.kt (Tailscale-only, passcode cookie) and the Bob-Net page in phone.js.
4. If Lend my brain misbehaves: LendServer.kt and LendService.kt.
5. The page is android/app/src/main/assets/www (phone.js, index.html); tests in test/run-android-test.js.

## What Bob himself thinks
The phone brain did not write a note; assume the worst.

## Errors (last 50)
${errs}

## Last chats (3, up to 40 messages each)
${chatOut}
`);
  }
  $('help-bundle').addEventListener('click', async () => {
    const btn = $('help-bundle'), msg = $('bundle-msg');
    btn.disabled = true;
    try {
      const b = liveBobs()[0];
      if (b) {
        msg.textContent = "Putting the bundle together... up to a minute if my brain adds its own note.";
        const address = b.base, path = '/api/help-bundle', name = '', timeoutMs = 150000;
        const where = await phone('media.save', { address, path, name, timeoutMs });
        msg.textContent = `Saved ${where.split('/').pop()} in Downloads (${where}). Give it to whoever is helping, or open an issue at github.com/MouseWurX/Bob/issues.`;
      } else {
        msg.textContent = 'No Bob on your Bob-Net is reachable, so this is the phone-only bundle: one HANDOFF.md.';
        let d = {}; try { d = await phone('device'); } catch { /* tests */ }
        const fname = `bob-help-bundle-${new Date().toISOString().slice(0, 16).replace(/[-T:]/g, '').replace(/^(\d{8})(\d{4})$/, '$1-$2')}.md`;
        const mime = 'text/markdown', data = btoa(unescape(encodeURIComponent(phoneHandoff(d))));
        const where = await phone('media.saveData', { name: fname, mime, data });
        msg.textContent = `Saved ${fname} in Downloads (${where}). It's the phone-only bundle: no logbook from your other replicant matrix, no note from my brain. Give it to whoever is helping, or open an issue at github.com/MouseWurX/Bob/issues.`;
      }
    } catch (e) { logError('help-bundle', e.message); msg.textContent = `Couldn't save the bundle: ${e.message}`; }
    btn.disabled = false;
  });

  const EFFORTS = ['low', 'medium', 'high', 'extreme'];
  $('effort').addEventListener('click', () => { settings.effort = EFFORTS[(EFFORTS.indexOf(settings.effort) + 1) % EFFORTS.length]; saveSettings(); drawWho(); });

  // ---------- 🎲 Adventure: the table lives on your other Bob; this page shows it and plays your turns ----------
  // Nothing here decides anything: the view comes from his /api/adventure, the dice are rolled there, and the phone
  // brain is never the game master (too small). Nothing starts a game by itself.
  const ADV = {
    icons: { attack: '⚔', defend: '🛡', sneak: '🤫', talk: '💬', magic: '✨', item: '🎒', look: '🔍', help: '🤝', run: '🏃', other: '✍' },
    names: { attack: 'Attack', defend: 'Defend', sneak: 'Sneak', talk: 'Talk', magic: 'Magic', item: 'Use item', look: 'Look closer', help: 'Help an ally', run: 'Run', other: 'Something else' },
    stats: { attack: 'Might', defend: 'Might', sneak: 'Wits', talk: 'Charm', magic: 'Wits', item: 'Luck', look: 'Wits', help: 'Charm', run: 'Luck', other: 'Luck' },
    classes: { fighter: 'Fighter', rogue: 'Rogue', wizard: 'Wizard', cleric: 'Cleric', ranger: 'Ranger', bard: 'Bard' },
    classStats: { fighter: 'Might 5 · Wits 2 · Charm 2 · Luck 3', rogue: 'Might 2 · Wits 4 · Charm 3 · Luck 3', wizard: 'Might 1 · Wits 5 · Charm 2 · Luck 4', cleric: 'Might 3 · Wits 3 · Charm 4 · Luck 2', ranger: 'Might 3 · Wits 4 · Charm 1 · Luck 4', bard: 'Might 1 · Wits 3 · Charm 5 · Luck 3' },
    armour: { none: ['None', 'The dice decide. A bad run can kill the character.'], some: ['Some', 'One bad roll a scene is rolled again.'], lots: ['Lots', "Can't die. A terrible roll still costs something."], legendary: ['Legendary', 'Nothing worse than a close call, ever.'] },
    settings: { fantasy: 'Classic fantasy', space: 'Space', spooky: 'Spooky', pick: 'Pick for me', own: 'My own' },
    paces: { short: 'Short (3 scenes)', evening: 'Evening (6 scenes)', campaign: 'Campaign (saved between sittings)' },
    heroes: ['Wren', 'Tobin', 'Mara', 'Quill', 'Hesper', 'Dax', 'Ilse', 'Corvin', 'Pip', 'Sable', 'Juno', 'Oswin'],
    traits: ['never leaves a door unopened', 'collects teeth, politely', 'owes money in three towns', 'talks to the horse first', 'afraid of nothing but geese', 'keeps a list of grudges, alphabetical']
  };
  const adv = { v: null, players: null, msg: '', picked: null, live: new Map(), journal: false, base: null, timer: null, last: '' };
  // 1.5.122: your character has a look of its own (the character screen, any body); never Bob's avatar. The
  // parts, maps and palettes are the desktop's own (avatars.js, made from public/avatars.js), drawn here on a canvas.
  const AV = globalThis.BobAvatars;
  const advYou = { name: '', cls: 'fighter', trait: '', armour: 'some', setting: 'fantasy', settingText: '', pace: 'evening', look: AV.encodeParts(AV.DEFAULT_PARTS), savedId: '' };
  const advChar = { open: false, parts: null, delAsk: '' }; // the character screen: open, the parts being picked, "Delete <name>?" showing
  // 1.5.124 The 📖 Characters page (the bestiary): null = not open; else { tab, edit: a saved character's id or 'new', draft, ask: id awaiting delete }.
  adv.chars = null;
  const advParty = new Map(); // player key -> { ticked, armour, cls }
  const hearts = (n, max = 5) => '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, max - n));
  const pickOne = (a) => a[Math.floor(Math.random() * a.length)];
  const advOpen = () => !$('adventure').classList.contains('hidden');
  function advBob() { const a = answerer(); return a.kind === 'net' ? a.bob : liveBobs()[0] || null; }
  async function advApi(path, data) {
    const b = advBob(); if (!b) throw new Error('No Bob on your Bob-Net is reachable. The table lives on your other replicant matrix.');
    const r = data === undefined ? await phone('net.get', { address: b.address, path }) : await phone('net.post', { address: b.address, path, body: JSON.stringify(data) });
    let out = {}; try { out = JSON.parse(r.body || '{}'); } catch { /* not JSON */ }
    if (r.status >= 400) throw new Error(out.error || `"${b.name}" said no (${r.status})`);
    return out;
  }
  function drawAdventure() {
    const body = $('adv-body'), b = advBob();
    adv.base = b ? b.base : null; adv.last = '';
    body.textContent = '';
    if (!b) { body.append(el('p', { class: 'help-line', text: "No Bob on your Bob-Net is reachable, and the table lives on your other replicant matrix: get him on Tailscale and come back. I'm too small to be game master myself." })); return; }
    body.append(el('p', { class: 'dim', text: adv.v ? 'Checking the table…' : 'Setting the table…' }));
    advLoad();
  }
  async function advLoad() {
    try { adv.v = await advApi('/api/adventure'); adv.last = JSON.stringify(adv.v); adv.msg = ''; } catch (e) { adv.msg = e.message; }
    if (adv.v && !adv.v.game && !adv.players) {
      try { adv.players = (await advApi('/api/adventure/players')).players || []; } catch { adv.players = []; }
      adv.players.forEach((p, i) => { const k = p.address || p.name; if (!advParty.has(k)) advParty.set(k, { ticked: p.who === 'bob' ? i === 0 : p.ok === true, armour: 'some', cls: ['rogue', 'wizard', 'cleric', 'ranger', 'bard'][i % 5] }); });
    }
    advDraw();
    clearTimeout(adv.timer); adv.timer = setTimeout(advTick, adv.v?.busy ? 2000 : 5000);
  }
  // The live events do most of the work; this poll is the safety net (2 s while a brain is busy, 5 s otherwise).
  async function advTick() {
    if (!advOpen()) return;
    try {
      const v = await advApi('/api/adventure'); const key = JSON.stringify(v);
      if (key !== adv.last) { adv.last = key; adv.v = { ...adv.v, ...v }; if (!v.waitingFor) adv.picked = null; advDraw(); }
    } catch (e) { if (!adv.v) { adv.msg = e.message; advDraw(); } }
    clearTimeout(adv.timer); adv.timer = setTimeout(advTick, adv.v?.busy ? 2000 : 5000);
  }
  async function advCall(path, data) {
    try { adv.v = { ...adv.v, ...(await advApi(path, data)) }; adv.msg = ''; } catch (e) { adv.msg = e.message; }
    advDraw();
  }
  function advDraw() {
    if (!advOpen()) return;
    const body = $('adv-body'); body.textContent = '';
    const g = adv.v?.game;
    body.append(...(adv.chars ? advCharsPage() : g ? advTable(g) : [advStart()]).flat().filter(Boolean));
    const log = $('adv-log'); if (log) log.scrollTop = log.scrollHeight;
    for (const [who, x] of adv.live) if (x.text) advShowLive(el('span', { class: 'adv-who', text: advWho(who) }), el('p', { text: x.text }));
  }
  const advWho = (id) => id === 'gm' ? '🎲 Game master' : adv.v?.game?.party.find((c) => c.id === id)?.name || 'A Bob';
  function advShowLive(...kids) { const l = $('adv-live'); if (!l) return; l.classList.remove('hidden'); l.textContent = ''; l.append(...kids); l.scrollIntoView({ block: 'end' }); }
  // Streamed words from the other Bob: shown as they come, then replaced by the saved line on the next state.
  function onAdvEvent(base, ev) {
    if (!advOpen() || base !== adv.base) return;
    if (ev.ev === 'state') {
      const { type, ev: kind, ...rest } = ev; adv.v = { ...adv.v, ...rest }; adv.last = JSON.stringify(rest); adv.live = new Map(); adv.msg = '';
      if (!adv.v.waitingFor) adv.picked = null;
      if (rest.game && !rest.busy && !rest.waitingFor && adv.v.fate && rest.game.status !== 'playing') adv.v.fate = null;
      advDraw(); return;
    }
    if (ev.ev === 'token') { const cur = adv.live.get(ev.who) || { text: '' }; cur.text += ev.text || ''; adv.live.set(ev.who, cur); advShowLive(el('span', { class: 'adv-who', text: advWho(ev.who) }), el('p', { text: cur.text.replace(/<<<[\s\S]*$/, '') })); return; }
    if (ev.ev === 'roll') { advShowLive(el('p', { class: 'adv-dice', text: `🎲 ${ev.name}: ${ev.text}` })); return; }
    if (ev.ev === 'fate') { adv.v = { ...adv.v, fate: { who: ev.who, name: ev.name } }; advDraw(); return; }
    if (ev.ev === 'standin') { adv.msg = ev.text || ''; advDraw(); return; }
    if (ev.ev === 'announce') advShowLive(el('p', { class: 'note', text: ev.text || '' }));
  }
  // ---- the start card ----
  // A look drawn pixel by pixel: 16 rows of letters, each letter a colour in the palette ('.' is clear).
  function advFace(lookId, size, label) {
    const cv = el('canvas', { class: 'adv-face', width: size, height: size, 'aria-label': label || '', role: label ? 'img' : null, 'aria-hidden': label ? null : 'true' });
    const look = AV.avatar(lookId) || AV.avatar(AV.encodeParts(AV.DEFAULT_PARTS));
    try {
      const c = cv.getContext('2d'); c.imageSmoothingEnabled = false;
      const px = size / 16;
      look.map.forEach((row, y) => { [...row].forEach((ch, x) => { if (ch === '.') return; c.fillStyle = look.palette[ch] || '#808080'; c.fillRect(Math.floor(x * px), Math.floor(y * px), Math.ceil(px), Math.ceil(px)); }); });
    } catch { /* no canvas (tests) */ }
    return cv;
  }
  const advLookWhat = (lookId) => AV.avatar(lookId)?.what || '';
  // The character screen: the same rows, names and colours as the desktop's (public/character.js); every body.
  function advCharacter({ useLabel = 'Use for this character', onUse, onCancel } = {}) {
    const p = advChar.parts;
    const shown = AV.partsFor(p.body);
    const SW = { hc: 'hc', skin: 'skin', cloth: 'cloth' };
    const monster = (b) => (AV.MONSTER_BODIES || []).includes(b);
    const swatchFor = (k) => (k === 'skin' && p.body === 'robot') ? 'metal' : (k === 'skin' && p.body === 'alien') ? 'alien' : (k === 'skin' && monster(p.body)) ? 'monster' : SW[k];
    const id = AV.encodeParts(p);
    const set = (k, v) => { p[k] = v; advChar.parts = AV.cleanParts(p); advDraw(); };
    const row = (k) => {
      const opts = AV.PARTS[k], sw = swatchFor(k), name = (k === 'skin' && sw === 'metal') ? 'Metal' : (k === 'skin' && sw === 'monster') ? 'Hide' : AV.partName(k);
      if (sw) {
        const cols = AV.PART_COLOURS[sw], colNames = AV.COLOUR_NAMES[sw] || []; // a robot's skin swatches are metals (Steel, Brass...), an alien's its own colours
        return el('div', { class: 'char-row' }, el('span', { class: 'char-label', text: name }),
          el('div', { class: 'char-swatches', role: 'radiogroup', 'aria-label': name }, opts.map(([v, label], i) => { const nm = colNames[i % cols.length] || label; const b = el('button', { role: 'radio', 'aria-checked': String(p[k] === v), 'aria-label': nm, title: nm, onclick: () => set(k, v) }); b.style.background = cols[i % cols.length]; return b; }))); // (the page's CSP allows no style attributes; a style property is fine)
      }
      return el('label', { class: 'char-row' }, el('span', { class: 'char-label', text: name }), advSelect(Object.fromEntries(opts), p[k], name, (v) => set(k, v)));
    };
    return el('div', { class: 'character box' },
      el('div', { class: 'char-preview' }, advFace(id, 128, 'Preview'), el('p', { class: 'help-line', text: advLookWhat(id) })),
      el('div', { class: 'btns' },
        el('button', { text: '🎲 Surprise me', onclick: () => { const r = {}; for (const k of AV.PART_ORDER) r[k] = pickOne(AV.PARTS[k])[0]; if (Math.random() < 0.5) r.weapon = 'none'; if (Math.random() < 0.6) r.shield = 'none'; if (Math.random() < 0.5) r.armour = 'none'; advChar.parts = AV.cleanParts(r); advDraw(); } }),
        el('button', { text: 'Start over', onclick: () => { advChar.parts = { ...AV.DEFAULT_PARTS }; advDraw(); } })),
      el('div', { class: 'char-parts' }, shown.map(row)),
      el('div', { class: 'btns' },
        el('button', { class: 'main', text: useLabel, onclick: () => (onUse || ((look) => { advYou.look = look; advChar.open = false; advDraw(); }))(id) }),
        el('button', { text: 'Cancel', onclick: () => (onCancel || (() => { advChar.open = false; advDraw(); }))() })));
  }
  // ---- 📖 Characters: You / Party / Met / Enemies (the bestiary lives on your other Bob; this shows it) ----
  function advCharsOpen(tab = 'you') { adv.chars = { tab, edit: null, draft: null, ask: '' }; advDraw(); }
  function advCharsPage() {
    const v = adv.v || {}, ch = adv.chars, g = v.game;
    const tabs = [['you', '🧍 You'], ['party', '👥 Party'], ['met', '📖 Met'], ['enemies', '⚔ Enemies']];
    const bar = el('div', { class: 'adv-chars-top' }, el('button', { text: '← Back', onclick: () => { adv.chars = null; advDraw(); } }),
      el('div', { class: 'tabs', role: 'tablist', 'aria-label': 'Characters' }, tabs.map(([id, l]) => el('button', { role: 'tab', 'aria-selected': String(ch.tab === id), text: l, onclick: () => advCharsOpen(id) }))));
    const card = (look, title, sub, ...extra) => el('div', { class: 'box adv-char' }, look ? advFace(look, 64) : el('div', { class: 'adv-face adv-noface', 'aria-hidden': 'true', text: '🖥' }),
      el('div', { class: 'adv-char-words' }, el('strong', { text: title }), ...sub.map((t) => typeof t === 'string' ? el('div', { class: 'help-line', text: t }) : t), ...extra));
    const heartLine = (n, max, ...rest) => el('div', { class: 'help-line' }, ...rest, el('span', { 'aria-label': `${n} hearts`, text: hearts(n, max) })); // TalkBack reads the number, not the symbols
    const out = [bar];
    if (ch.tab === 'you') {
      const list = v.characters || [];
      if (ch.edit) {
        const c = (ch.edit !== 'new' && list.find((x) => x.id === ch.edit)) || { id: '', name: '', cls: 'fighter', trait: '', armour: 'some', look: AV.encodeParts(AV.DEFAULT_PARTS) };
        const d = ch.draft || (ch.draft = { ...c });
        if (!advChar.parts) advChar.parts = AV.decodeParts(d.look) || { ...AV.DEFAULT_PARTS };
        out.push(el('div', { class: 'box' },
          el('label', { class: 'field', text: 'Name' }), el('input', { type: 'text', maxlength: 40, value: d.name, placeholder: 'Hero', 'aria-label': 'Name', onchange: (e) => { d.name = e.target.value; } }),
          el('label', { class: 'field', text: 'Class' }), advSelect(ADV.classes, d.cls, 'Class', (x) => { d.cls = x; }),
          el('label', { class: 'field', text: 'One thing about them' }), el('input', { type: 'text', maxlength: 120, value: d.trait || '', placeholder: 'never leaves a door unopened', 'aria-label': 'One thing about them', onchange: (e) => { d.trait = e.target.value; } }),
          el('label', { class: 'field', text: 'Plot armour' }), advSelect(ADV.armour, d.armour, 'Plot armour', (x) => { d.armour = x; })),
          advCharacter({ useLabel: 'Save this character', onUse: async (look) => {
            try { const r = await advApi('/api/adventure/characters/save', { id: c.id || '', name: d.name || settings.userName || 'Hero', cls: d.cls, trait: d.trait, armour: d.armour, look }); adv.v = { ...adv.v, characters: r.characters }; adv.last = JSON.stringify(adv.v); adv.msg = ''; ch.edit = null; ch.draft = null; advChar.parts = null; } catch (e) { adv.msg = e.message; }
            advDraw();
          }, onCancel: () => { ch.edit = null; ch.draft = null; advChar.parts = null; advDraw(); } }));
      } else {
        out.push(el('p', { class: 'help-line', text: 'Your heroes, kept for the next game. Pick one on the start card under Saved characters.' }));
        for (const c of list) out.push(card(c.look, c.name, [`${ADV.classes[c.cls] || c.cls} · plot armour ${ADV.armour[c.armour]?.[0] || 'Some'}${c.trait ? ` · ${c.trait}` : ''}`],
          el('div', { class: 'btns' }, el('button', { text: 'Edit', onclick: () => { ch.edit = c.id; ch.draft = null; advChar.parts = null; advDraw(); } }),
            ch.ask === c.id ? [el('span', { text: `Delete ${c.name}?` }),
              el('button', { class: 'danger', text: 'Delete for good', onclick: async () => { ch.ask = ''; try { const r = await advApi('/api/adventure/characters/delete', { id: c.id }); adv.v = { ...adv.v, characters: r.characters }; adv.last = JSON.stringify(adv.v); if (advYou.savedId === c.id) advYou.savedId = ''; } catch (e) { adv.msg = e.message; } advDraw(); } }),
              el('button', { text: 'Keep it', onclick: () => { ch.ask = ''; advDraw(); } })]
            : el('button', { text: 'Delete this character', onclick: () => { ch.ask = c.id; advDraw(); } }))));
        out.push(el('div', { class: 'btns' }, el('button', { class: 'main', text: '➕ New character', onclick: () => { ch.edit = 'new'; ch.draft = null; advChar.parts = null; advDraw(); } })));
      }
    } else if (ch.tab === 'party') {
      const pg = g || v.lastParty;
      if (!pg) out.push(el('p', { class: 'help-line', text: 'No party yet. Start a game and they turn up here.' }));
      else {
        out.push(el('p', { class: 'help-line', text: `${g ? 'At the table now' : `The last game, ${pg.title}`}. Each Bob plays with his own look.` }));
        for (const c of pg.party) out.push(card(c.who === 'you' ? (c.look || AV.encodeParts(AV.DEFAULT_PARTS)) : '', c.name,
          [heartLine(c.hearts, 5, `${c.className}${c.who === 'you' ? ' · you' : c.who === 'net' ? ' · his own Bob' : ' · played by the game master'} · `), c.trait || '', c.items?.length ? `Carries ${c.items.join(', ')}` : '', c.spells?.length ? `Knows ${c.spells.join(', ')}` : ''].filter(Boolean)));
      }
    } else if (ch.tab === 'met') {
      const inGame = Boolean(g?.met?.length), list = inGame ? g.met : (v.met || []);
      if (!list.length) out.push(el('p', { class: 'help-line', text: 'Nobody yet. Whoever the game master names in a scene lands here, drawn.' }));
      else {
        out.push(el('p', { class: 'help-line', text: `${inGame ? 'Everyone the game master has brought on in this game.' : 'Everyone and everything you have run into, across your games.'} Drawn by me the moment they're named.` }));
        for (const m of list) out.push(card(m.look, m.name, [`${m.kind === 'enemy' ? `⚔ ${(v.enemies || []).find((e) => e.id === m.type)?.name || 'enemy'}` : m.kind === 'creature' ? 'creature' : 'person'}${m.scene ? ` · met at ${m.scene}` : ''}${m.game && !g ? ` · ${m.game}` : ''}`],
          g ? null : ch.ask === m.id ? el('div', { class: 'btns' }, el('span', { text: `Forget ${m.name}?` }),
            el('button', { class: 'danger', text: 'Forget for good', onclick: async () => { ch.ask = ''; try { const r = await advApi('/api/adventure/met/forget', { id: m.id }); adv.v = { ...adv.v, met: r.met }; adv.last = JSON.stringify(adv.v); } catch (e) { adv.msg = e.message; } advDraw(); } }),
            el('button', { text: 'Keep it', onclick: () => { ch.ask = ''; advDraw(); } }))
          : el('div', { class: 'btns' }, el('button', { text: 'Forget', onclick: () => { ch.ask = m.id; advDraw(); } }))));
      }
    } else {
      out.push(el('p', { class: 'help-line', text: 'The usual suspects, with how many hearts they have and what to know. The game master uses these as written and invents the rest.' }));
      for (const e of v.enemies || []) out.push(card(e.look, e.name, [el('div', { class: 'help-line' }, el('span', { 'aria-label': `${e.hearts} hearts`, text: hearts(e.hearts, e.hearts) }), ` · ${e.attack}`)], el('em', { class: 'help-line', text: e.trick }), el('div', { class: 'help-line', text: e.flavour })));
    }
    if (adv.msg) out.push(el('p', { class: 'note bad', role: 'alert', text: adv.msg }));
    return out;
  }
  function advSelect(opts, cur, label, onchange) {
    const s = el('select', { 'aria-label': label, onchange: (e) => onchange(e.target.value) });
    for (const [id, n] of Object.entries(opts)) s.append(el('option', { value: id, selected: cur === id, text: Array.isArray(n) ? n[0] : n }));
    return s;
  }
  function advChips(opts, cur, label, onpick) {
    return el('div', { class: 'chips', role: 'radiogroup', 'aria-label': label }, Object.entries(opts).map(([id, n]) => el('button', { class: `chip${cur === id ? ' on' : ''}`, role: 'radio', 'aria-checked': String(cur === id), text: n, onclick: () => onpick(id) })));
  }
  function advStart() {
    const v = adv.v, saved = v?.saved || [], chars = v?.characters || [];
    return el('div', {},
      v?.refusal ? el('p', { class: 'note bad', text: v.refusal }) : null,
      el('p', { class: 'help-line', text: 'Your other Bob runs the table. You play a character, and so do his other Bobs. Every action is rolled by the app: d20 plus a stat. 15 or more is a hit, 10 to 14 a hit at a cost, under 10 a miss. Nothing loads until you press Start a new game.' }),
      el('h3', { text: 'Setting' }),
      advChips(ADV.settings, advYou.setting, 'Setting', (id) => { advYou.setting = id; advDraw(); }),
      advYou.setting === 'own' ? el('input', { type: 'text', maxlength: 300, placeholder: 'A sunken city, a heist, a haunted train…', value: advYou.settingText, 'aria-label': 'Your own setting', onchange: (e) => { advYou.settingText = e.target.value; } }) : null,
      el('h3', { text: 'Your character' }),
      el('label', { class: 'field', text: 'Name' }), el('input', { type: 'text', maxlength: 40, value: advYou.name, placeholder: settings.userName || 'Hero', 'aria-label': 'Name', onchange: (e) => { advYou.name = e.target.value; } }),
      el('label', { class: 'field', text: 'Class' }), advSelect(ADV.classes, advYou.cls, 'Class', (x) => { advYou.cls = x; advDraw(); }),
      el('p', { class: 'help-line', text: ADV.classStats[advYou.cls] }),
      el('label', { class: 'field', text: 'One thing about them' }), el('input', { type: 'text', maxlength: 120, value: advYou.trait, placeholder: 'never leaves a door unopened', 'aria-label': 'One thing about them', onchange: (e) => { advYou.trait = e.target.value; } }),
      el('label', { class: 'field', text: 'Plot armour' }), advSelect(ADV.armour, advYou.armour, 'Plot armour', (x) => { advYou.armour = x; advDraw(); }),
      el('p', { class: 'help-line', text: ADV.armour[advYou.armour][1] }),
      el('div', { class: 'btns' }, el('button', { text: '🎲 Roll one for me', onclick: () => { advYou.name = pickOne(ADV.heroes); advYou.cls = pickOne(Object.keys(ADV.classes)); advYou.trait = pickOne(ADV.traits); advDraw(); } })),
      el('div', { class: 'adv-look' }, advFace(advYou.look, 64, advLookWhat(advYou.look)),
        el('div', {}, el('strong', { text: 'Looks like' }), el('p', { class: 'help-line', text: "Your character's own look; my avatar stays mine." }),
          el('button', { 'aria-expanded': String(advChar.open), text: advChar.open ? '🧍 Close the character screen' : '🧍 Change the look', onclick: () => { advChar.open = !advChar.open; if (advChar.open) advChar.parts = AV.decodeParts(advYou.look) || { ...AV.DEFAULT_PARTS }; advDraw(); } }))),
      advChar.open ? advCharacter() : null,
      chars.length ? el('label', { class: 'field', text: 'Saved characters' }) : null,
      chars.length ? advSelect({ '': 'Pick one…', ...Object.fromEntries(chars.map((c) => [c.id, `${c.name} (${ADV.classes[c.cls] || c.cls})`])) }, advYou.savedId, 'Saved characters', (id) => { const c = chars.find((x) => x.id === id); if (c) Object.assign(advYou, { name: c.name, cls: c.cls, trait: c.trait, armour: c.armour, look: c.look || advYou.look, savedId: c.id }); else advYou.savedId = ''; advDraw(); }) : null,
      el('div', { class: 'btns' },
        el('button', { text: '💾 Save this character', onclick: async () => { try { const r = await advApi('/api/adventure/characters/save', { id: advYou.savedId || '', name: advYou.name || settings.userName || 'Hero', cls: advYou.cls, trait: advYou.trait, armour: advYou.armour, look: advYou.look }); adv.v = { ...adv.v, characters: r.characters }; adv.last = JSON.stringify(adv.v); advYou.savedId = r.characters[0]?.id || ''; adv.msg = ''; } catch (e) { adv.msg = e.message; } advDraw(); } }),
        advYou.savedId && advChar.delAsk !== advYou.savedId ? el('button', { text: 'Delete this character', onclick: () => { advChar.delAsk = advYou.savedId; advDraw(); } }) : null),
      advYou.savedId && advChar.delAsk === advYou.savedId ? el('div', { class: 'btns' }, el('span', { text: `Delete ${chars.find((c) => c.id === advYou.savedId)?.name || 'this character'}?` }),
        el('button', { class: 'danger', text: 'Delete for good', onclick: async () => { advChar.delAsk = ''; try { const r = await advApi('/api/adventure/characters/delete', { id: advYou.savedId }); adv.v = { ...adv.v, characters: r.characters }; adv.last = JSON.stringify(adv.v); advYou.savedId = ''; } catch (e) { adv.msg = e.message; } advDraw(); } }),
        el('button', { text: 'Keep it', onclick: () => { advChar.delAsk = ''; advDraw(); } })) : null,
      el('p', { class: 'help-line', text: 'Saved characters keep the name, class, the one thing about them, plot armour and the look, so you can pick the same hero next time. They live beside the saved campaigns on your other replicant matrix.' }),
      el('div', { class: 'btns' }, el('button', { text: '📖 Characters', onclick: () => advCharsOpen('you') }), el('span', { class: 'help-line', text: "Your heroes, the party, everyone you've met, and the usual enemies." })),
      el('h3', { text: 'Who plays' }),
      el('p', { class: 'help-line', text: 'Tick the Bobs at the table. A Bob on your Bob-Net plays himself over there; a copy of your other Bob is played by the game master brain. Each gets their own plot armour.' }),
      el('p', { class: 'help-line', text: 'What goes to a Bob who plays himself: the scene so far and his character\'s sheet, over Tailscale to your own Bob only.' }),
      adv.players === null ? el('p', { class: 'dim', text: 'Looking for your other Bobs…' }) : null,
      (adv.players || []).map((p) => {
        const k = p.address || p.name, st = advParty.get(k);
        return el('div', { class: `box${p.ok === false ? ' dim' : ''}` },
          el('label', { class: 'choice' }, el('input', { type: 'checkbox', checked: st.ticked, disabled: p.ok === false, onchange: (e) => { st.ticked = e.target.checked; } }), el('div', {}, el('strong', { text: p.name }), el('p', { class: 'help-line', text: p.note || '' }))),
          el('div', { class: 'row2' }, advSelect(ADV.classes, st.cls, `${p.name}'s class`, (x) => { st.cls = x; }), advSelect(ADV.armour, st.armour, `${p.name}'s plot armour`, (x) => { st.armour = x; })));
      }),
      el('h3', { text: 'How long' }),
      advChips(ADV.paces, advYou.pace, 'How long', (id) => { advYou.pace = id; advDraw(); }),
      el('div', { class: 'btns' }, el('button', { class: 'main', text: '🎲 Start a new game', disabled: Boolean(v?.refusal), onclick: advStartGame })),
      el('p', { class: 'help-line', text: 'Loads the game master brain on your other replicant matrix. Pause or End lets it go again. The first turn takes longest: the game master reads the rules and the party first.' }),
      adv.msg ? el('p', { class: 'note bad', role: 'alert', text: adv.msg }) : null,
      saved.length ? el('h3', { text: 'Continue a campaign' }) : null,
      saved.map((s) => el('div', { class: 'box' }, el('div', { class: 'title', text: s.title }),
        el('p', { class: 'help-line', text: `${s.setting} · ${s.scenes} scene${s.scenes === 1 ? '' : 's'} · ${(s.party || []).join(', ')}${s.status === 'over' ? ' · ended' : ''}` }),
        el('div', { class: 'btns' },
          el('button', { class: 'main', text: 'Continue', disabled: Boolean(v?.refusal), onclick: () => advCall('/api/adventure/continue', { id: s.id }) }),
          el('button', { text: 'Delete', onclick: (e) => { const t = e.currentTarget; if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Delete this campaign? Tap again to delete it.'; return; } advCall('/api/adventure/delete', { id: s.id }); } })))));
  }
  async function advStartGame(e) {
    const bobsIn = (adv.players || []).filter((p) => advParty.get(p.address || p.name)?.ticked && p.ok !== false)
      .map((p) => { const st = advParty.get(p.address || p.name); return { who: p.who, name: p.name, address: p.address || '', armour: st.armour, cls: st.cls }; });
    e.currentTarget.disabled = true;
    await advCall('/api/adventure/start', { setting: advYou.setting, settingText: advYou.settingText, pace: advYou.pace, you: { name: advYou.name || settings.userName || 'Hero', cls: advYou.cls, trait: advYou.trait, armour: advYou.armour, look: advYou.look || '' }, bobs: bobsIn });
  }
  // ---- the table ----
  function advTable(g) {
    const v = adv.v;
    const busy = v.busy === 'gm' ? '🎲 The game master is thinking…' : v.busy === 'player' ? `${g.party[g.turn]?.name || 'A Bob'} is deciding…` : '';
    const scene = g.scenes[g.scenes.length - 1];
    const top = el('div', { class: 'box' }, el('div', { class: 'title', text: g.title }),
      el('p', { class: 'help-line', text: `${g.settingText}${scene ? ` · Scene ${scene.n}: ${scene.title}` : ''} · round ${g.round}` }),
      el('div', { class: 'btns' },
        g.status === 'playing' ? el('button', { text: '⏸ Pause', onclick: () => advCall('/api/adventure/pause', {}) }) : g.status === 'paused' ? el('button', { class: 'main', text: '▶ Resume', onclick: () => advCall('/api/adventure/resume', {}) }) : null,
        el('button', { text: '📓 Journal', 'aria-pressed': String(adv.journal), onclick: () => { adv.journal = !adv.journal; advDraw(); } }),
        el('button', { text: '📖 Characters', onclick: () => advCharsOpen('party') }),
        el('button', { text: g.status === 'over' ? 'Close' : '🏁 End game', onclick: async (e) => { const t = e.currentTarget; if (g.status !== 'over' && !t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'End this game? It stays under Continue. Tap again to end it.'; return; } await advCall('/api/adventure/end', { keep: true }); adv.players = null; advLoad(); } })));
    const journal = adv.journal ? el('div', { class: 'box' }, el('strong', { text: 'The story so far' }), el('p', { text: g.summary || 'Nothing written down yet; the game master sums things up every three scenes.' }),
      g.scenes.length ? el('p', { class: 'help-line', text: g.scenes.map((s) => `Scene ${s.n}: ${s.title}`).join(' · ') }) : null) : null;
    const party = el('div', { class: 'adv-party' }, g.party.map((c, i) => el('div', { class: `adv-member${i === g.turn && g.status === 'playing' ? ' turn' : ''}${c.out ? ' out' : ''}`, title: c.trait || '' },
      c.who === 'you' && c.look ? advFace(c.look, 32) : null,
      el('strong', { text: c.name }), el('span', { class: 'dim small', text: `${c.className}${c.who === 'you' ? ' · you' : ''}` }),
      el('span', { class: 'adv-hearts', 'aria-label': `${c.hearts} of 5 hearts`, text: hearts(c.hearts) }),
      c.out ? el('span', { class: 'badge quiet', text: 'out' }) : i === g.turn && g.status === 'playing' ? el('span', { class: 'badge', text: 'turn' }) : null)));
    const log = el('div', { class: 'adv-log', id: 'adv-log' }, g.log.map((l) => {
      if (l.who === 'gm') return el('div', { class: 'adv-gm' }, el('span', { class: 'adv-who', text: '🎲 Game master' }), el('div', { html: L.markdown(l.text || '') }));
      if (l.who === 'app') return el('p', { class: 'note', text: l.text || '' });
      return el('div', { class: `adv-turn${l.who === 'you' ? ' you' : ''}` }, el('span', { class: 'adv-who', text: `${l.name || ''}${l.by === 'net' ? ' · his own Bob' : l.who === 'player' ? ' · played by the game master' : ''}` }), el('p', { text: l.text || '' }), l.dice ? el('p', { class: 'adv-dice', text: `🎲 ${l.dice}` }) : null);
    }), el('div', { class: 'adv-live hidden', id: 'adv-live' }));
    const fate = v.fate ? el('div', { class: 'card' }, el('div', { class: 'q' }, el('strong', { text: `${v.fate.name} is at zero hearts.` }), el('div', { text: 'Your call.' })),
      el('div', { class: 'row' }, el('button', { text: 'Go out in style', onclick: () => { adv.v.fate = null; advCall('/api/adventure/fate', { choice: 'style' }); } }), el('button', { class: 'main', text: 'Wake up captured', onclick: () => { adv.v.fate = null; advCall('/api/adventure/fate', { choice: 'captured' }); } }))) : null;
    return [top, journal, party, log, busy ? el('p', { class: 'note', text: busy }) : null, fate, g.status === 'playing' ? advHand(g) : null, adv.msg ? el('p', { class: 'note bad', role: 'alert', text: adv.msg }) : null];
  }
  // Your hand: the cards, a second card for the ones that need details (with ← Back), then the flair box.
  function advHand(g) {
    const v = adv.v; if (!v.waitingFor) return null;
    const me = g.party.find((c) => c.id === v.waitingFor), p = adv.picked;
    if (p && p.card && !p.done) {
      const sec = g.second?.[p.card];
      if (sec && !p.pick && !p.skipSecond) {
        return el('div', { class: 'card' }, el('div', { class: 'q' }, el('strong', { text: `${ADV.icons[p.card]} ${ADV.names[p.card]}: ${sec.ask || ''}` })),
          el('div', { class: 'adv-cards' }, (sec.choices || []).map((c) => el('button', { class: 'adv-card', text: c, onclick: () => { adv.picked = { ...p, pick: c }; advDraw(); } })),
            el('button', { class: 'adv-card other', text: sec.free || 'Something else', onclick: () => { adv.picked = { ...p, pick: '', skipSecond: true }; advDraw(); } })),
          el('div', { class: 'btns' }, el('button', { text: '← Back', onclick: () => { adv.picked = null; advDraw(); } })));
      }
      const flair = el('textarea', { rows: 2, maxlength: 400, 'aria-label': 'How does it play out?', placeholder: p.card === 'other' ? 'Say what you do…' : 'Add some flair…' });
      return el('div', { class: 'card' }, el('div', { class: 'q' }, el('strong', { text: `${ADV.icons[p.card]} ${ADV.names[p.card]}${p.pick ? ` (${p.pick})` : ''}` }), el('span', { class: 'dim small', text: ` rolls ${ADV.stats[p.card]}` })),
        el('label', { class: 'field', text: 'How does it play out?' }), el('p', { class: 'help-line', text: 'Optional. A good line earns +2.' }), flair,
        el('div', { class: 'btns' }, el('button', { class: 'main', text: '🎲 Roll it', onclick: () => advGo(flair.value) }), el('button', { text: 'Skip the flair', onclick: () => advGo('') }),
          el('button', { text: '← Back', onclick: () => { adv.picked = (p.pick || p.skipSecond) && g.second?.[p.card] ? { card: p.card } : null; advDraw(); } })));
    }
    return el('div', { class: 'card' }, el('div', { class: 'q' }, el('strong', { text: `${me?.name || 'Your'}'s turn.` }), el('div', { class: 'help-line', text: "Pick a card; the app rolls for you. Cards that don't fit this scene are left out." })),
      el('div', { class: 'adv-cards' }, (g.cards || []).map((c) => el('button', { class: `adv-card${c === 'other' ? ' other' : ''}`, onclick: () => { adv.picked = { card: c }; advDraw(); } },
        el('span', { class: 'adv-ico', text: ADV.icons[c] || '' }), el('span', { text: ADV.names[c] || c }), el('span', { class: 'dim small', text: `${ADV.stats[c] || ''}${g.second?.[c] ? ' ›' : ''}` })))));
  }
  async function advGo(flair) { const p = adv.picked; adv.picked = { ...p, done: true }; await advCall('/api/adventure/act', { card: p.card, pick: p.pick || '', flair: String(flair || '').slice(0, 400) }); }

  // ---------- 🧩 Games: small games your other Bob plays with you (the app there runs the game; the phone draws the board) ----------
  // The phone brain is never used for a game. Nothing starts until you press ▶ Start.
  const GAMES = {
    order: ['twenty', 'hangman', 'ladder', 'letters', 'story'],
    shelves: { any: 'Any shelf', animals: 'Animals', food: 'Food and drink', house: 'Around the house', outside: 'Out of doors', jobs: 'Jobs people do', moves: 'Things that move' },
    rows: ['QWERTYUIOP', 'ASDFGHJKL', 'ZXCVBNM']
  };
  const gam = { v: null, msg: '', live: '', base: null, timer: null, last: '', draft: '', opts: { role: 'guess', shelf: 'any', together: false, bobStarts: false } };
  const gamOpen = () => !$('games').classList.contains('hidden');
  // ---- 1.5.125 🧰 Chest: the newest things your other Bob made, as little pictures with names (his Made by Bob list).
  // The pictures come small from /api/thumb (made once on your other replicant matrix, kept there); a tap shows the thing
  // itself with Save to this phone. Nothing is kept on the phone unless you save it.
  const chest = { open: null }; // the item being shown big, or null
  async function drawChest() {
    const body = $('chest-body'), b = advBob();
    body.textContent = '';
    if (!b) { body.append(el('p', { class: 'help-line', text: "No Bob on your Bob-Net is reachable, and the chest lives on your other replicant matrix: everything he makes is there. Get him on Tailscale and come back." })); return; }
    body.append(el('p', { class: 'dim', text: 'Opening the chest…' }));
    let items = [];
    try { items = await advApi('/api/made?limit=24'); } catch (e) { body.textContent = ''; body.append(el('p', { class: 'help-line', text: `I couldn't open the chest: ${e.message}` })); return; }
    body.textContent = '';
    body.append(el('p', { class: 'help-line', text: `What ${b.name} has made, newest first. Tap one to see it here; Save to this phone keeps a copy. To change the folder new things are saved in, open Equip Bob on your other replicant matrix and press the chest under Bob.` }));
    if (!items.length) { body.append(el('p', { class: 'dim', text: 'Empty so far. Pictures, clips, songs and files he makes land here.' })); return; }
    const addr = b.address;
    const grid = el('div', { class: 'chest-grid', role: 'list', 'aria-label': 'What Bob made, newest first' });
    for (const x of items) {
      const kind = x.kind === 'text' ? 'document' : x.kind || 'file';
      const name = x.title || x.name || '';
      const icon = { image: '🖼️', video: '🎞️', audio: '🔊', document: '📄', folder: '📁' }[kind] || '📦';
      const pic = el('div', { class: 'chest-pic', 'aria-hidden': 'true', text: icon });
      const tile = el('button', { class: 'chest-item', role: 'listitem', 'aria-label': `Open ${name}: ${kind === 'image' ? 'picture' : kind === 'video' ? 'clip' : kind === 'audio' ? 'sound' : kind}`, onclick: () => { chest.open = chest.open === x ? null : x; drawChestBig(body, addr); } }, pic, el('span', { class: 'chest-name', text: name }));
      grid.append(tile);
      if (kind === 'image' || kind === 'video') {
        const thumbPath = x.url && x.url.startsWith('/api/file?') ? `/api/thumb?path=${encodeURIComponent(new URL(x.url, 'http://x').searchParams.get('path') || '')}` : `/api/thumb?path=${encodeURIComponent(x.url || '')}`;
        phone('net.media', { address: addr, path: thumbPath }).then((data) => { if (data) pic.replaceWith(el('img', { class: 'chest-pic', src: data, alt: '' })); }).catch(() => {});
      }
    }
    body.append(grid, el('div', { id: 'chest-big' }));
  }
  function drawChestBig(body, addr) {
    const box = body.querySelector('#chest-big'); if (!box) return;
    box.textContent = '';
    const x = chest.open; if (!x) return;
    const kind = x.kind === 'text' ? 'document' : x.kind || 'file';
    box.append(el('h3', { text: x.title || x.name || '' }));
    if (['image', 'video', 'audio'].includes(kind) && x.url) box.append(mediaNode({ kind, url: x.url, base: `http://${addr}` }));
    else box.append(el('p', { class: 'help-line', text: 'I can\'t show this kind of file on the phone. It\'s in Made by Bob on your other replicant matrix.' }));
    box.scrollIntoView({ block: 'nearest' });
  }

  function drawGames() {
    const body = $('games-body'), b = advBob();
    gam.base = b ? b.base : null; gam.last = '';
    body.textContent = '';
    if (!b) { body.append(el('p', { class: 'help-line', text: "No Bob on your Bob-Net is reachable, and the games live on your other replicant matrix: get him on Tailscale and come back. The phone brain doesn't play these." })); return; }
    body.append(el('p', { class: 'dim', text: 'Getting the games down…' }));
    gamLoad();
  }
  async function gamLoad() {
    try { gam.v = await advApi('/api/games'); gam.last = JSON.stringify(gam.v); gam.msg = ''; } catch (e) { gam.msg = e.message; }
    gamDraw();
    clearTimeout(gam.timer); gam.timer = setTimeout(gamTick, gam.v?.busy ? 2000 : 5000);
  }
  async function gamTick() {
    if (!gamOpen()) return;
    try {
      const v = await advApi('/api/games'); const key = JSON.stringify(v);
      if (key !== gam.last) { gam.last = key; if (v.game?.id !== gam.v?.game?.id) gam.draft = ''; gam.v = v; gam.live = ''; gamDraw(); }
    } catch (e) { if (!gam.v) { gam.msg = e.message; gamDraw(); } }
    clearTimeout(gam.timer); gam.timer = setTimeout(gamTick, gam.v?.busy ? 2000 : 5000);
  }
  // A refused move comes back as 409 with a plain line; nothing is lost and the box keeps your words.
  async function gamCall(path, data) {
    try { const out = await advApi(path, data); if (out && 'game' in out) { gam.v = { ...gam.v, ...out }; gam.last = JSON.stringify(gam.v); } gam.msg = ''; gam.draft = ''; gam.live = ''; }
    catch (e) { gam.msg = e.message; }
    gamDraw();
  }
  const gamAct = (data) => gamCall('/api/games/act', data);
  function onGamEvent(base, ev) {
    if (!gamOpen() || base !== gam.base) return;
    if (ev.ev === 'state') { const { type, ev: kind, ...rest } = ev; if (rest.game?.id !== gam.v?.game?.id) gam.draft = ''; gam.v = { ...gam.v, ...rest }; gam.last = JSON.stringify(rest); gam.live = ''; gamDraw(); return; }
    if (ev.ev === 'token') { gam.live += ev.text || ''; const l = $('gam-live'); if (l) { l.classList.remove('hidden'); l.textContent = ''; l.append(el('span', { class: 'adv-who', text: 'Bob' }), el('p', { text: gam.live })); l.scrollIntoView({ block: 'end' }); } return; }
    if (ev.ev === 'announce') { const l = $('gam-live'); if (l) { l.classList.remove('hidden'); l.textContent = ''; l.append(el('p', { class: 'note', text: ev.text || '' })); } }
  }
  function gamDraw() {
    if (!gamOpen()) return;
    const body = $('games-body'); body.textContent = '';
    const v = gam.v;
    if (!v) { body.append(el('p', { class: 'note bad', role: 'alert', text: gam.msg || 'Nothing yet.' })); return; }
    body.append(...(v.game ? gamBoard(v.game) : gamShelf()).flat().filter(Boolean));
    const log = $('gam-log'); if (log) log.scrollTop = log.scrollHeight;
    if (gam.live) { const l = $('gam-live'); if (l) { l.classList.remove('hidden'); l.append(el('span', { class: 'adv-who', text: 'Bob' }), el('p', { text: gam.live })); } }
  }
  // ---- the shelf ----
  function gamShelf() {
    const v = gam.v, o = gam.opts, info = v.games || {};
    const chips = (pairs, cur, label, onpick) => el('div', { class: 'chips', role: 'radiogroup', 'aria-label': label }, pairs.map(([id, n]) => el('button', { class: `chip${String(cur) === String(id) ? ' on' : ''}`, role: 'radio', 'aria-checked': String(String(cur) === String(id)), text: n, onclick: () => onpick(id) })));
    const row = (kind, options) => {
      const g = info[kind] || {};
      return el('div', { class: 'box' }, el('div', { class: 'title' }, el('span', { text: g.icon || '' }), el('span', { text: g.name || kind })),
        el('p', { class: 'help-line', text: g.what || '' }), options,
        el('div', { class: 'btns' }, el('button', { class: 'main', text: '▶ Start', disabled: Boolean(v.refusal), onclick: () => gamCall('/api/games/start', { kind, role: o.role, shelf: o.shelf, together: o.together, bobStarts: o.bobStarts }) })));
    };
    const shelfSel = el('select', { 'aria-label': 'Shelf', onchange: (e) => { o.shelf = e.target.value; } });
    for (const [id, n] of Object.entries(GAMES.shelves)) shelfSel.append(el('option', { value: id, selected: o.shelf === id, text: n }));
    const scores = v.scores || {}, played = GAMES.order.filter((k) => scores[k]?.played);
    return [
      v.refusal ? el('p', { class: 'note bad', text: v.refusal }) : null,
      el('p', { class: 'help-line', text: "Pick a game. The app on your other replicant matrix runs it: it picks the secret word, checks every guess, counts the lives and keeps the score. His quick brain only talks. Nothing loads until you press Start, and the brain is let go when the game ends. The phone brain doesn't play these." }),
      row('twenty', chips([['guess', 'I think, you guess'], ['think', 'You think, I guess']], o.role, 'Who guesses', (id) => { o.role = id; gamDraw(); })),
      row('hangman', el('div', {}, el('label', { class: 'field', text: 'Shelf' }), shelfSel)),
      row('ladder', chips([[false, 'You climb, I cheer'], [true, 'Climb together, turn about']], o.together, 'How to climb', (id) => { o.together = id; gamDraw(); })),
      row('letters', null),
      row('story', chips([[true, 'I open'], [false, 'You open']], o.bobStarts, 'Who opens', (id) => { o.bobStarts = id; gamDraw(); })),
      gam.msg ? el('p', { class: 'note bad', role: 'alert', text: gam.msg }) : null,
      played.length ? el('h3', { text: 'Scoreboard' }) : null,
      played.length ? el('table', { class: 'scores' }, el('tr', {}, ['Game', 'Played', 'You won', 'I won', 'Shared', 'Best run'].map((h) => el('th', { text: h }))),
        played.map((k) => { const s = scores[k]; return el('tr', {}, el('td', { text: `${info[k]?.icon || ''} ${info[k]?.name || k}` }), el('td', { text: String(s.played) }), el('td', { text: String(s.won) }), el('td', { text: String(s.lost) }), el('td', { text: String(s.drawn) }), el('td', { text: String(s.best) })); })) : null,
      played.length ? el('p', { class: 'help-line', text: 'Your best: fewest guesses, questions or steps to a win, and the longest story.' }) : null
    ];
  }
  // ---- a game ----
  function gamLog(g) {
    return el('div', { class: 'adv-log', id: 'gam-log' }, (g.log || []).map((l) => {
      if (l.who === 'app') return el('p', { class: 'note', text: l.text || '' });
      return el('div', { class: `adv-turn${l.who === 'you' ? ' you' : ''}` },
        el('span', { class: 'adv-who' }, el('span', { text: l.who === 'you' ? 'You' : 'Bob' }), l.hint ? el('span', { class: 'badge quiet', text: 'hint' }) : null, l.guess ? el('span', { class: 'badge quiet', text: 'a guess' }) : null),
        el('p', { text: l.text || '' }));
    }), el('div', { class: 'adv-live hidden', id: 'gam-live' }));
  }
  function gamBox(placeholder, label, onsend, extra = []) {
    const box = el('input', { type: 'text', placeholder, 'aria-label': label, value: gam.draft, autocapitalize: 'off', autocorrect: 'off', spellcheck: 'false', oninput: (e) => { gam.draft = e.target.value; }, onkeydown: (e) => { if (e.key === 'Enter') { e.preventDefault(); onsend(box.value); } } });
    return [box, el('div', { class: 'btns' }, el('button', { class: 'main', text: label, onclick: () => onsend(box.value) }), ...extra)];
  }
  function gamKeys(tried, hits, onkey, marks = {}) {
    return el('div', { class: 'keys' }, GAMES.rows.map((r) => el('div', { class: 'keyrow' }, [...r].map((k) => {
      const m = marks[k.toLowerCase()];
      return el('button', { class: `key${hits.has(k) || m === 'g' ? ' hit' : m === 'y' ? ' near' : tried.has(k) || m === 'b' ? ' tried' : ''}`, text: k, disabled: tried.has(k), onclick: () => onkey(k) });
    }))));
  }
  function gamBoard(g) {
    const v = gam.v, over = g.status === 'over';
    const tag = over ? (g.won === 'you' ? '🏆 Your point.' : g.won === 'bob' ? 'My point.' : g.won === 'both' ? 'A shared one.' : 'Unfinished.') : '';
    const top = el('div', { class: 'box' }, el('div', { class: 'title' }, el('span', { text: g.icon || '' }), el('span', { text: g.name || g.kind }), tag ? el('span', { class: 'badge', text: tag }) : null),
      el('div', { class: 'btns' }, over ? el('button', { class: 'main', text: 'Back to the games', onclick: () => gamCall('/api/games/close', {}) })
        : el('button', { text: '🏁 Stop', onclick: (e) => { const t = e.currentTarget; if (!t.dataset.sure) { t.dataset.sure = '1'; t.textContent = 'Stop this game? It counts as unfinished. Tap again to stop.'; return; } gamCall('/api/games/end', {}); } })));
    const busy = v.busy ? el('p', { class: 'note', text: 'Bob is thinking…' }) : null;
    const msg = gam.msg ? el('p', { class: 'note bad', role: 'alert', text: gam.msg }) : null;
    const controls = over ? null : el('div', { class: 'card' }, ...({ twenty: gamTwenty, hangman: gamHangman, ladder: gamLadder, letters: gamLetters, story: gamStory }[g.kind] || (() => []))(g).flat().filter(Boolean));
    return [top, gamLog(g), busy, msg, controls];
  }
  function gamTwenty(g) {
    const n = Math.min((g.asked || 0) + 1, g.max || 20);
    if (g.role === 'guess') {
      return [el('div', { class: 'q' }, el('strong', { text: `Question ${n} of ${g.max || 20}.` }), el('div', { class: 'help-line', text: 'Ask anything with a yes-or-no answer, or take a guess.' })),
        gamBox('Is it bigger than a cat?', 'Ask', (t) => { if (t.trim() && !gam.v.busy) gamAct({ ask: t.trim() }); }, [el('button', { text: "That's my guess", disabled: Boolean(gam.v.busy), onclick: () => { const t = gam.draft.trim(); if (t) gamAct({ guess: t }); } })])];
    }
    if (g.guessing) {
      return [el('div', { class: 'q' }, el('strong', { text: `Is it ${g.pendingGuess || 'that'}?` })),
        el('div', { class: 'row' }, el('button', { class: 'main', text: 'Right!', onclick: () => gamAct({ right: true }) }), el('button', { text: 'Wrong', onclick: () => gamAct({ right: false }) }))];
    }
    return [el('div', { class: 'q' }, el('strong', { text: `Question ${g.asked || 0} of ${g.max || 20}.` }), el('div', { class: 'help-line', text: 'Your answer.' })),
      el('div', { class: 'row' }, [['yes', 'Yes'], ['no', 'No'], ['sortof', 'Sort of'], ['dunno', "I don't know"]].map(([id, t]) => el('button', { text: t, disabled: Boolean(gam.v.busy), onclick: () => gamAct({ answer: id }) })))];
  }
  function gamHangman(g) {
    const masked = String(g.masked || ''), tried = new Set((g.guessed || []).map((x) => String(x).toUpperCase())), hits = new Set([...masked.toUpperCase()].filter((c) => /[A-Z]/.test(c)));
    const lives = g.lives || 7, wrong = g.wrong || 0;
    return [el('p', { class: 'masked', text: masked.split('').join(' ') }),
      el('p', { class: 'help-line', text: `Shelf: ${GAMES.shelves[g.shelf] || g.shelf || 'any'} · ${'●'.repeat(Math.max(0, lives - wrong))}${'○'.repeat(Math.min(lives, wrong))}` }),
      gamKeys(tried, hits, (k) => gamAct({ letter: k.toLowerCase() })),
      gamBox('Or guess the whole word…', 'Guess the word', (t) => { if (t.trim()) gamAct({ word: t.trim() }); }, [el('button', { text: 'Hint (costs a life)', onclick: () => gamAct({ hint: true }) })])];
  }
  function gamLadder(g) {
    const rungs = (g.steps || []).length ? g.steps : [g.start].filter(Boolean), sofar = Math.max(0, rungs.length - 1);
    const line = `${sofar} step${sofar === 1 ? '' : 's'} so far; shortest ${g.shortest || '?'}.${g.together ? ' Turn about: you, then me.' : ''}`;
    const yourTurn = (!g.together || g.whose !== 'bob') && !gam.v.busy;
    return [el('div', { class: 'rungs' }, rungs.map((w, i) => el('span', { class: `rung${i === rungs.length - 1 ? ' last' : ''}`, text: String(w).toUpperCase() })), el('span', { class: 'rung goal', text: `${String(g.end || '').toUpperCase()} goal` })),
      el('p', { class: 'help-line', text: line }),
      yourTurn ? gamBox('Next word…', 'Climb', (t) => { if (t.trim()) gamAct({ word: t.trim() }); }, [el('button', { text: 'Hint', onclick: () => gamAct({ hint: true }) }), el('button', { text: 'Back a rung', onclick: () => gamAct({ back: true }) })]) : el('p', { class: 'note', text: 'My rung.' })];
  }
  function gamLetters(g) {
    const rows = [], best = {}, max = g.max || 6;
    for (let i = 0; i < max; i++) {
      const t = (g.guesses || [])[i];
      if (t?.hint) rows.push(el('div', { class: 'tiles' }, Array.from({ length: 5 }, () => el('span', { class: 'tile hint', text: '?' }))));
      else if (t?.word) rows.push(el('div', { class: 'tiles' }, [...String(t.word).toUpperCase()].slice(0, 5).map((c, j) => { const m = String(t.marks || '')[j] || 'b'; const k = c.toLowerCase(); if (m === 'g' || (m === 'y' && best[k] !== 'g') || !best[k]) best[k] = m; return el('span', { class: `tile ${m}`, text: c }); })));
      else rows.push(el('div', { class: 'tiles' }, Array.from({ length: 5 }, () => el('span', { class: 'tile' }))));
    }
    const box = gamBox('Five letters…', 'Try', (t) => { if (t.trim()) gamAct({ word: t.trim() }); }, [el('button', { text: 'Hint (costs a try)', onclick: () => gamAct({ hint: true }) })]);
    return [el('div', { class: 'board' }, rows), el('p', { class: 'help-line', text: 'Green: right spot. Yellow: in the word somewhere else. Grey: not in it.' }),
      gamKeys(new Set(), new Set(), (k) => { const b = box[0]; if (b.value.length < 5) { b.value += k; gam.draft = b.value; } }, best), ...box];
  }
  function gamStory(g) {
    const dice = el('div', { class: 'chips' }, (g.dice || []).map(([icon, word], i) => el('span', { class: `chip die${g.used?.[i] ? ' in' : ''}`, text: `${icon} ${word}${g.used?.[i] ? ' · in' : ''}` })));
    const mine = g.whose === 'you' && !gam.v.busy;
    const line = `${mine ? 'Your line.' : 'My line.'} Round ${Math.min((g.round || 0) + 1, g.max || 6)} of ${g.max || 6}. Work a die in when you can.`;
    const box = el('textarea', { rows: 2, maxlength: 400, placeholder: 'And then…', 'aria-label': 'Your line', oninput: (e) => { gam.draft = e.target.value; } });
    box.value = gam.draft;
    return [dice, el('p', { class: 'help-line', text: line }), mine ? box : null,
      el('div', { class: 'btns' }, mine ? el('button', { class: 'main', text: 'Add my line', onclick: () => { if (box.value.trim()) gamAct({ line: box.value.trim() }); } }) : null, el('button', { text: 'Wrap it up', onclick: () => gamAct({ end: true }) }))];
  }

  // ---------- Help ----------
  function drawHelp() {
    const q = $('help-search').value.trim().toLowerCase();
    const body = $('help-body');
    body.innerHTML = '';
    const H = globalThis.BobHelp;
    const hits = H.sections.filter((s) => !q || (s.title + ' ' + s.html.replace(/<[^>]+>/g, ' ')).toLowerCase().includes(q));
    for (const s of hits) body.append(el('h3', { text: s.title }), el('div', { html: s.html }));
    if (!hits.length) body.append(el('p', { class: 'dim', text: "Nothing in Help matches that. Try asking me in the chat." }));
  }
  $('help-search').addEventListener('input', drawHelp);

  // ---------- Composer ----------
  const box = $('text');
  box.addEventListener('input', () => { box.style.height = 'auto'; box.style.height = `${Math.min(box.scrollHeight, 140)}px`; });
  $('send').addEventListener('click', () => {
    if (current) return stopReply();
    const t = box.value; box.value = ''; box.style.height = 'auto'; if (send(t) === false) box.value = t;
  });
  // ---------- A photo for a Bob on your network ----------
  let photo = null; // { preview } while one is attached
  function drawPhoto() {
    $('photo-chip').classList.toggle('hidden', !photo);
    if (photo) $('photo-preview').src = photo.preview;
  }
  function dropPhoto(tellAndroid = true) { photo = null; drawPhoto(); if (tellAndroid) phone('photo.clear').catch(() => {}); }
  $('photo').addEventListener('click', () => phone('photo.pick').then((p) => { if (p && p.preview) { photo = p; drawPhoto(); box.focus(); } }).catch((e) => { if (e.message !== 'replaced') toast(`Couldn't add the photo: ${e.message}.`); }));
  $('photo-drop').addEventListener('click', () => dropPhoto());
  $('mic').addEventListener('click', () => phone('speech.listen').then((t) => { if (t) send(t); }).catch((e) => toast(e.message)));
  function stopReply() {
    if (!current) return;
    if (current.kind === 'phone') phone('brain.stop');
    else { const b = bobs.find((x) => x.base === current.base); phone('net.post', { address: b.address, path: '/api/stop', body: '{}' }).catch(() => {}); }
  }
  $('chat').addEventListener('click', (e) => {
    const link = e.target.closest('[data-link]');
    if (link) { e.preventDefault(); phone('open', { url: link.dataset.link }); return; }
    const copy = e.target.closest('[data-copy]');
    if (copy) phone('copy', { text: copy.parentElement.querySelector('code').textContent }).then(() => toast('Copied'));
  });

  // 1.5.97: each ⏳ waiting line shows once (the PC updates it every minute).
  var seenWaits = new Set();
  // ---------- Start ----------
  // 1.5.89: the phone's own spec line names it as this replicant matrix (this phone).
  var deviceModel = '';
  applyTheme();
  drawChat();
  drawWho();
  sendBrainConfig();
  phone('device').then((d) => { deviceModel = String(d.model || ''); $('about').textContent = `Bob ${d.version} for Android · ${d.maker} ${d.model}, Android ${d.android}`; }).catch(() => {});
  refreshAll();
  // Pick up where Bob left off (opt-in): a phone-brain reply Android cut short is asked again.
  const pending = store.get('pending', null);
  store.set('pending', null);
  if (pending && settings.resume) {
    const c = chats.find((x) => x.id === pending.chatId);
    if (c) { chat = c; drawChat(); note('Picking up where I left off.'); queue.push({ chatId: c.id, text: pending.text, to: 'phone' }); setTimeout(pump, 1500); }
  }
  globalThis.bob._test = { send, settings, live, bobs: () => bobs, setPhoneStatus: (s) => { phoneStatus = s; drawWho(); } };
});
