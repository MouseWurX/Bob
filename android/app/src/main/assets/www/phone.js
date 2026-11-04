// Bob for Android: the phone screen. Talks to Android through window.BobPhone (Bridge.kt).
// Decisions live in logic.js (tested); this file draws and wires things up.
(() => {
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
    get(k, d) { try { const v = localStorage.getItem(`bob.${k}`); return v == null ? d : JSON.parse(v); } catch { return d; } },
    set(k, v) { try { localStorage.setItem(`bob.${k}`, JSON.stringify(v)); } catch { /* full or blocked: carry on in memory */ } }
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
    else if (!bobs.length && !settings.phoneOn) line = `Hi${who}. I'm not wired to anything yet. Add your other replicant matrix's Bob under Bobs on your network, or switch on the phone brain. Help (in the menu) walks you through both.`;
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

  function mediaNode(x) {
    const holder = el('div', { class: 'small dim', text: x.kind === 'audio' ? 'Getting the song…' : 'Getting it from your other replicant matrix…' });
    phone('net.media', { address: x.base.replace('http://', ''), path: x.url }).then((data) => {
      if (!data) { holder.textContent = 'Too big to show on the phone. It is on your other replicant matrix.'; return; }
      holder.replaceWith(mediaEl(x.kind, data));
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
      'no-bobs': 'no Bob on your network is added yet. Add one under Bobs on your network.',
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
        if (r.status === 401) { live[base].signedIn = false; grow(`*("${b.name}" wants the passcode again. It's under Bobs on your network.)*`); finish(); drawWho(); }
        else if (r.status >= 400) { grow(`*("${b.name}" said no: ${shortError(r.body)})*`); finish(); }
      })
      .catch((e) => { grow(`*(Couldn't reach "${b.name}": ${e.message})*`); finish(); });
    drawStatus();
  }
  const shortError = (body) => { try { return JSON.parse(body).error || 'unknown'; } catch { return String(body).slice(0, 120); } };

  function onNetEvent(base, ev) {
    if (!ev || typeof ev !== 'object') return;
    const mine = current && current.kind === 'net' && current.base === base && ev.sessionId === `phone-${current.chatId}`;
    if (ev.type === 'approval' && String(ev.sessionId || '').startsWith('phone-')) return approvalCard(base, ev);
    if (ev.type === 'checkin') return checkinCard(base, ev);
    if (ev.type === 'howto-offer' && String(ev.sessionId || '').startsWith('phone-')) return howtoCard(base, ev);
    if (ev.type === 'approval-result') { document.querySelector(`[data-approval="${CSS.escape(String(ev.id))}"]`)?.remove(); return; }
    if (!mine) return;
    if (ev.type === 'start') current.turnId = ev.turnId;
    else if (ev.type === 'token') grow(ev.text || '');
    else if (ev.type === 'image' || ev.type === 'video') { const x = { kind: ev.type, url: ev.url, base }; current.media.push(x); current.node.append(mediaNode(x)); }
    else if (ev.type === 'made') {
      for (const it of ev.items || []) if (it.kind === 'audio' && it.url) { const x = { kind: 'audio', url: it.url, base }; current.media.push(x); current.node.append(mediaNode(x)); }
    }
    else if (ev.type === 'tool') toast(`${bobName(base)}: ${ev.summary || ev.name}`);
    else if (ev.type === 'error') grow(`\n\n*(${ev.text})*`);
    else if (ev.type === 'correction' || ev.type === 'busy-note' || ev.type === 'announce' || ev.type === 'aside') grow(`\n\n*${ev.text}*`);
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
    ({ chats: drawChats, bobs: drawBobs, brain: drawBrain, memory: drawMemory, settings: drawSettings, help: drawHelp }[id] || (() => {}))();
    if (id === 'brain') watchLend();
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
              msg.textContent = { ok: "You're in.", wrong: "That's not the passcode.", busy: 'Too many tries. Wait a minute.', 'not-let-in': `${b.name} isn't letting other replicant matrices in yet. On your other replicant matrix: Settings, Show advanced settings, Connections, Let my other replicant matrices in.` }[r] || `Couldn't log in (${r}). Check that Tailscale is on on both devices, then try again.`;
              if (r === 'ok') refreshBob(b.base);
            } catch (e) { msg.textContent = `Can't reach ${b.name}: is your other replicant matrix on and Tailscale connected? (${e.message})`; }
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
    const name = $('add-name').value.trim().slice(0, 40) || 'Bob on my PC';
    const address = $('add-address').value.trim();
    const base = L.netAddress(address);
    if (!base) { $('add-msg').textContent = "That isn't a Tailscale address. It looks like my-pc.your-tailnet.ts.net or 100.x.y.z (Bob's Settings on your other replicant matrix shows it)."; return; }
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
      $('add-msg').textContent = r.error ? r.error : `Waiting for a yes over there. Its screen shows the number ${r.number}.`;
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
    if (!$('bobs').classList.contains('hidden')) drawBobs();
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
          el('div', { text: `It shows the number ${ev.number}. If ${name}'s screen shows that number too, tap Yes. We swap passcodes, so each Bob can ask the other. Nothing else switches on.` })),
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
      if (ev.asker) t = ev.both ? `Paired with ${name}, both ways.` : `Paired with ${name}. This phone can ask ${name} now. For ${name} to ask this phone too, turn on Lend my brain here, then pair again.`;
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
      box.append(b);
    }
    const s = phoneStatus;
    drawLend();
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
  // While the Phone brain screen is open, the lending line stays up to date.
  function watchLend() {
    refreshLend();
    clearInterval(lendTimer);
    lendTimer = setInterval(() => { if ($('brain').classList.contains('hidden')) clearInterval(lendTimer); else refreshLend(); }, 5000);
  }
  function tellLendBrain() { const m = phoneModel(); if (m) phone('lend.brain', { file: m.file.name, label: m.name }).catch(() => {}); }
  async function refreshLend() {
    try { lend = await phone('lend.status'); } catch { lend = {}; }
    if (!$('brain').classList.contains('hidden')) drawLend();
  }
  function drawLend() {
    $('lend-on').checked = Boolean(lend.on);
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
        el('p', { class: 'help-line', text: 'On your other replicant matrix: Settings, Show advanced settings, Connections, Bob-Net: share work with my other Bobs, Borrow a brain. Add this address and the passcode there.' })),
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
    } catch (err) { e.target.checked = false; toast(`Lend my brain: ${err.message}.`); }
    setTimeout(refreshLend, 800);
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

  const EFFORTS = ['low', 'medium', 'high', 'extreme'];
  $('effort').addEventListener('click', () => { settings.effort = EFFORTS[(EFFORTS.indexOf(settings.effort) + 1) % EFFORTS.length]; saveSettings(); drawWho(); });

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
})();
