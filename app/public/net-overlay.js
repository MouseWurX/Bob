// Bob-Net icons (src/net-overlay.js has the whole story). Off unless you turn it on: Settings, Bob-Net,
// "Bob-Net icons". The owner, Nov 13: "think of it like a discord overlay".
//
// Lamplight on a computer: a column of small round icons under Bob's cube, over the empty space left of the chat.
// A phone, or the other looks: one row at the top of the chat. Only what's there right now has an icon: your other
// Bobs answering on Bob-Net, and the coding agents you added. Nothing there: nothing shows.
//   - A Bob's icon is a little porthole like Bob's: the same fog (fog.js) in a colour of his own, and a small cube that
//     follows his state over there (no brain, loading, thinking, replying, ready).
//   - An agent's icon is a cube in its app's colours with a moving sign of our own that nods to it (never its logo);
//     it moves faster while the agent works.
//   - Icons are a little see-through, and dimmer than Bob's own cube so they never outshine him. Point at one and it
//     ebbs and flows in place (Bob's own porthole does too); each coloured one casts a small glow on the room.
// Click a Bob: his chat opens here in guest mode (Return from Guest Mode, top right, brings you back). Click an agent:
// Now running opens at Coding agents. Something new in one of those chats while you're elsewhere: a word bubble on its
// icon with a preview. Click (tap) it to open the chat; right-click it (swipe it away on a phone) to dismiss it.
// Display only: nothing here goes to a brain.
import { createFog } from './fog.js';

export const POLL_MS = 2000;
export const K = 0.866;
const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;
// hsl to #rrggbb (fog.js takes hex).
export function hslHex(h, s, l) {
  s /= 100; l /= 100;
  const f = (n) => { const k = (n + h / 30) % 12; const c = l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(c * 255).toString(16).padStart(2, '0'); };
  return `#${f(0)}${f(8)}${f(4)}`;
}
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
export const isNetChat = (id) => /^guest-net-[0-9a-f]{12}$/.test(String(id || ''));
export const BUBBLE_HINT = { mouse: 'Click to open · right-click to dismiss', touch: 'Tap to open · swipe away to dismiss' };
export const MOOD_WORDS = { none: 'No brain loaded', loading: 'Loading a brain', thinking: 'Thinking', replying: 'Writing back', ready: 'Ready' };
export const AGENT_WORDS = { idle: 'Ready', working: 'Working', 'needs-you': 'Needs you', done: 'Done', failed: 'Failed', stopped: 'Stopped' };
// The light inside an icon is kept under Bob's own: at most this bright (0..1).
export const ICON_LIGHT = 0.6;
// Short enough for a bubble, never cut mid-word: the whole bubble wraps, nothing is clipped.
export function preview(text, max = 140) {
  const t = String(text || '').replace(/[*_`#>]+/g, '').replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max); const sp = cut.lastIndexOf(' ');
  return `${(sp > 60 ? cut.slice(0, sp) : cut).replace(/[,;:.\s]+$/, '')}…`;
}

// ---------- Drawing ----------
function face(x, P, pts, fill, stroke) { x.beginPath(); pts.forEach((q, i) => (i ? x.lineTo(...P[q]) : x.moveTo(...P[q]))); x.closePath(); x.fillStyle = fill; x.fill(); if (stroke) { x.strokeStyle = stroke; x.lineWidth = 1.2; x.stroke(); } }
function corners(cx, cy, sz) { return { t: [cx, cy - sz], ur: [cx + K * sz, cy - sz / 2], lr: [cx + K * sz, cy + sz / 2], b: [cx, cy + sz], ll: [cx - K * sz, cy + sz / 2], ul: [cx - K * sz, cy - sz / 2], c: [cx, cy] }; }

// A Bob's little cube: n x n x n blocks, drawn back to front. light(i, j, k) -> 0..1, or -1 for no block.
export function drawVoxels(x, { cx = 48, cy = 52, n = 4, size = 40, hue = 200, sat = 60, light }) {
  const s = size / n;
  for (let k = 0; k < n; k++) for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
    const L = light(i, j, k); if (L < 0) continue;
    const px = cx + (i - j) * K * s, py = cy + (i + j) * 0.5 * s - k * s - size * 0.25 + s * 0.5;
    const P = corners(px, py, s); const a = 0.35 + 0.6 * Math.max(L, 0.25);
    face(x, P, ['t', 'ur', 'c', 'ul'], hsl(hue, sat, 58 + L * 28, a)); face(x, P, ['ul', 'c', 'b', 'll'], hsl(hue, sat, 42 + L * 28, a)); face(x, P, ['c', 'ur', 'lr', 'b'], hsl(hue, sat, 30 + L * 28, a));
    if (L > 0.55) { x.save(); x.globalCompositeOperation = 'lighter'; x.fillStyle = hsl(hue, sat, 70, (L - 0.55) * 0.9); x.beginPath(); x.arc(px, py, s * 1.4, 0, 7); x.fill(); x.restore(); }
  }
}

// The signs on an agent's cube (unit square on its right face). t: seconds; w: working (faster).
export const SIGNS = {
  spark: (x, t, w) => { x.strokeStyle = '#fff3e6'; x.lineWidth = 0.1; const r = 0.3 + (w ? 0.05 * Math.sin(t * 6) : 0); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4 + t * (w ? 1.2 : 0.25); const rr = r + (i % 2 ? -0.06 : 0.04); x.beginPath(); x.moveTo(0.5 + Math.cos(a) * 0.1, 0.5 + Math.sin(a) * 0.1); x.lineTo(0.5 + Math.cos(a) * rr, 0.5 + Math.sin(a) * rr); x.stroke(); } },
  knot: (x, t, w) => { x.strokeStyle = '#f4f4f4'; x.lineWidth = 0.09; const sp = t * (w ? 1 : 0.2); x.beginPath(); for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3 + sp; const px = 0.5 + Math.cos(a) * 0.3, py = 0.5 + Math.sin(a) * 0.3; if (i) x.lineTo(px, py); else x.moveTo(px, py); } x.stroke(); x.beginPath(); x.arc(0.5, 0.5, 0.12, sp, sp + 5.2); x.stroke(); },
  star: (x, t, w) => { const sc = 1 + (w ? 0.18 : 0.06) * Math.sin(t * (w ? 5 : 1.5)); x.save(); x.translate(0.5, 0.5); x.rotate(Math.sin(t * 0.7) * 0.2); x.scale(sc, sc); x.fillStyle = '#eaf1ff'; x.beginPath(); x.moveTo(0, -0.36); x.quadraticCurveTo(0.04, -0.04, 0.36, 0); x.quadraticCurveTo(0.04, 0.04, 0, 0.36); x.quadraticCurveTo(-0.04, 0.04, -0.36, 0); x.quadraticCurveTo(-0.04, -0.04, 0, -0.36); x.fill(); x.restore(); },
  ring: (x, t, w) => { x.strokeStyle = '#efe9ff'; x.lineWidth = 0.09; const a = t * (w ? 2 : 0.4); x.beginPath(); x.arc(0.5, 0.5, 0.26, a + 0.5, a + Math.PI * 2 - 0.2); x.stroke(); x.beginPath(); x.moveTo(0.5 + Math.cos(a + 0.2) * 0.2, 0.5 + Math.sin(a + 0.2) * 0.2); x.lineTo(0.5 + Math.cos(a + 0.2) * 0.38, 0.5 + Math.sin(a + 0.2) * 0.38); x.stroke(); },
  brackets: (x, t, w) => { x.strokeStyle = '#f2f2f2'; x.lineWidth = 0.09; x.strokeRect(0.24, 0.24, 0.52, 0.52); const p = w ? 0.08 * Math.sin(t * 6) : 0.03 * Math.sin(t * 1.5); x.fillStyle = '#f2f2f2'; x.fillRect(0.38 - p, 0.38 - p, 0.24 + 2 * p, 0.24 + 2 * p); }
};
export function drawAgent(x, { hue = 0, sat = 0, mono = false, sign = 'brackets' }, t, working) {
  x.clearRect(0, 0, 96, 96);
  const cx = 48, cy = 50, sz = 26, P = corners(cx, cy, sz);
  const col = (l, a = 0.92) => (mono ? hsl(0, 0, l, a) : hsl(hue, sat, l, a));
  const glowA = ((mono ? 0.08 : 0.18) + (working ? 0.12 * (0.5 + 0.5 * Math.sin(t * 4)) : 0.05 * Math.sin(t * 1.2))) * ICON_LIGHT / 0.6;
  const g = x.createRadialGradient(cx, cy, 2, cx, cy, 46); g.addColorStop(0, mono ? hsl(0, 0, 80, glowA) : hsl(hue, sat, 60, glowA)); g.addColorStop(1, hsl(hue, sat, 50, 0)); x.fillStyle = g; x.fillRect(0, 0, 96, 96);
  face(x, P, ['t', 'ur', 'c', 'ul'], col(mono ? 70 : 64), col(mono ? 92 : 89, 0.55)); face(x, P, ['ul', 'c', 'b', 'll'], col(46), col(71, 0.55)); face(x, P, ['c', 'ur', 'lr', 'b'], col(mono ? 30 : 33), col(58, 0.55));
  x.save(); x.setTransform(K * sz, -sz / 2, 0, sz, cx, cy); x.lineCap = 'round'; x.lineJoin = 'round'; (SIGNS[sign] || SIGNS.brackets)(x, t, working); x.restore();
}

// ---------- One icon ----------
function makeIcon(kind, key, it, { still }) {
  const btn = document.createElement('button');
  btn.type = 'button'; btn.className = 'nb'; btn.dataset.key = key;
  const port = document.createElement('span'); port.className = 'nb-port';
  const cube = document.createElement('canvas'); cube.width = 96; cube.height = 96; cube.className = 'nb-cube'; cube.setAttribute('aria-hidden', 'true');
  let fog = null;
  if (kind === 'bob') {
    const fc = document.createElement('canvas'); fc.className = 'nb-fog'; fc.setAttribute('aria-hidden', 'true'); port.append(fc);
    try { fog = createFog(fc, { colour: () => hslHex(it.hue, 36, 32), room: () => '#0c0f12', still, seed: 3 + (it.hue % 17) }); fog.start?.(); } catch {}
  }
  port.append(cube); btn.append(port);
  const dot = document.createElement('span'); dot.className = 'dot'; dot.setAttribute('aria-hidden', 'true'); btn.append(dot);
  const count = document.createElement('span'); count.className = 'count'; count.hidden = true; count.setAttribute('aria-hidden', 'true'); btn.append(count);
  const x = cube.getContext('2d');
  const s = { kind, it, btn, cube, x, fog, sparks: new Map(), fill: 0, t0: performance.now(), n: 0 };
  s.draw = (now) => {
    const t = (now - s.t0) / 1000;
    if (kind === 'agent') return drawAgent(x, s.it.look || {}, t, s.it.state === 'working');
    x.clearRect(0, 0, 96, 96);
    const mood = s.it.mood;
    if (mood === 'none') return;
    if (mood === 'loading') s.fill = Math.min(1, s.fill + 0.006); else s.fill = 1;
    const pulse = mood === 'thinking' ? 0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 5)) : 0;
    const rnd = Math.random();
    if ((mood === 'replying' && rnd < 0.55) || (mood === 'ready' && rnd < 0.02)) s.sparks.set(`${(Math.random() * 4) | 0},${(Math.random() * 4) | 0},${(Math.random() * 4) | 0}`, 1);
    for (const [k, v] of s.sparks) { const nv = v - (mood === 'replying' ? 0.06 : 0.025); if (nv <= 0) s.sparks.delete(k); else s.sparks.set(k, nv); }
    const filled = s.fill * 64;
    drawVoxels(x, { hue: s.it.hue, sat: 60, light: (i, j, k) => (k * 16 + j * 4 + i >= filled ? -1 : ICON_LIGHT * Math.min(1, 0.12 + pulse + (s.sparks.get(`${i},${j},${k}`) || 0))) });
  };
  return s;
}

// ---------- The whole strip ----------
// deps: open(id) opens a chat; session() is the chat open now; showAgents() opens Now running at Coding agents;
// note(text) says something in the chat; fetchImpl for tests.
export function createNetOverlay({ open, session, showAgents, note = () => {}, still = () => false, fetchImpl = (u) => fetch(u).then((r) => r.json()), store = globalThis.localStorage } = {}) {
  let on = false, view = { bobs: [], agents: [] }, timer = null, raf = 0, bubble = null;
  const icons = new Map(); // key -> icon state
  const unseen = new Map(); // key -> count
  const replies = new Map(); // net chat id -> words coming in
  const touch = () => globalThis.matchMedia?.('(pointer: coarse)').matches === true;

  const row = document.createElement('div');
  row.id = 'netRow'; row.className = 'net-row'; row.setAttribute('role', 'toolbar'); row.setAttribute('aria-label', 'Your other Bobs and agents on Bob-Net'); row.hidden = true;
  const glow = document.createElement('div'); glow.className = 'net-glow'; glow.setAttribute('aria-hidden', 'true');
  const tip = document.createElement('div'); tip.className = 'net-tip'; tip.hidden = true; tip.setAttribute('aria-hidden', 'true');
  const said = document.createElement('p'); said.className = 'sr-only'; said.setAttribute('aria-live', 'polite');
  const bar = document.createElement('div'); bar.className = 'guest-bar'; bar.hidden = true;
  const log = document.getElementById('log');
  log?.before(row); log?.before(bar);
  document.body.prepend(glow); document.body.append(tip, said);

  const sepEl = document.createElement('span'); sepEl.className = 'sep'; sepEl.setAttribute('aria-hidden', 'true');
  const keyOfBob = (b) => `bob:${b.chat}`, keyOfAgent = (a) => `agent:${a.id}`;
  const all = () => [...view.bobs.map((b) => ({ kind: 'bob', key: keyOfBob(b), it: b })), ...view.agents.map((a) => ({ kind: 'agent', key: keyOfAgent(a), it: a }))];
  const returnTo = () => { try { return store?.getItem('bob-net-return') || 'main'; } catch { return 'main'; } };

  function label(kind, it) {
    if (kind === 'bob') return `${it.name}: ${MOOD_WORDS[it.mood] || 'Ready'}${it.canChat ? '' : ' (doesn\'t take chats yet)'}`;
    return `${it.name}: ${AGENT_WORDS[it.state] || 'Ready'}`;
  }
  function draw() {
    const list = on ? all() : [];
    row.hidden = !list.length;
    document.body.classList.toggle('has-net-row', list.length > 0);
    const keys = new Set(list.map((x) => x.key));
    for (const [k, s] of icons) if (!keys.has(k)) { s.fog?.stop?.(); s.btn.remove(); icons.delete(k); if (bubble?.key === k) closeBubble(); }
    let firstAgent = null;
    const order = [];
    for (const x of list) {
      let s = icons.get(x.key);
      if (!s) { s = makeIcon(x.kind, x.key, x.it, { still }); icons.set(x.key, s); wire(s); }
      s.it = x.it;
      s.btn.setAttribute('aria-label', label(x.kind, x.it));
      s.btn.dataset.mood = x.kind === 'bob' ? x.it.mood : x.it.state;
      s.btn.classList.toggle('on', x.kind === 'bob' && session() === x.it.chat);
      s.btn.classList.toggle('mono', x.kind === 'agent' && x.it.look?.mono === true);
      const n = unseen.get(x.key) || 0; const c = s.btn.querySelector('.count'); c.hidden = !n; c.textContent = n > 9 ? '9+' : String(n);
      if (x.kind === 'agent' && !firstAgent && view.bobs.length) order.push(sepEl);
      order.push(s.btn);
      if (x.kind === 'agent' && !firstAgent) firstAgent = s.btn;
    }
    // Only touch the order when it changed, so pointing at an icon isn't disturbed by the next look.
    if (order.length !== row.children.length || order.some((el, i) => row.children[i] !== el)) row.replaceChildren(...order);
    guestBar();
    placeGlow();
    if (list.length && !raf) raf = requestAnimationFrame(frame);
  }
  function frame(now) {
    raf = 0;
    if (!on || row.hidden) return;
    if (!document.hidden) for (const s of icons.values()) s.draw(still() ? 0 : now);
    if (!still()) raf = requestAnimationFrame(frame);
  }
  // The glow each coloured icon casts on the room: small, and soft (Lamplight only shows it).
  function placeGlow() {
    const g = [];
    for (const s of icons.values()) {
      const hue = s.kind === 'bob' ? s.it.hue : s.it.look?.mono ? null : s.it.look?.hue;
      if (hue == null || s.btn.isConnected === false) continue;
      const r = s.btn.getBoundingClientRect(); if (!r.width) continue;
      const strong = s.btn.classList.contains('on') || s.btn.matches(':hover');
      g.push(`radial-gradient(circle 80px at ${Math.round(r.left + r.width / 2)}px ${Math.round(r.top + r.height / 2)}px, ${hsl(hue, s.kind === 'bob' ? 60 : s.it.look.sat, 55, strong ? 0.08 : 0.045)}, transparent 70%)`);
    }
    glow.style.background = g.join(',');
  }

  function wire(s) {
    s.btn.addEventListener('click', () => go(s));
    s.btn.addEventListener('pointerenter', () => { showTip(s); placeGlow(); });
    s.btn.addEventListener('pointerleave', () => { tip.hidden = true; placeGlow(); });
    s.btn.addEventListener('focus', () => showTip(s));
    s.btn.addEventListener('blur', () => { tip.hidden = true; });
  }
  function showTip(s) {
    if (bubble?.key === s.btn.dataset.key) return;
    const sub = s.kind === 'bob' ? (MOOD_WORDS[s.it.mood] || 'Ready') + (s.it.brain && s.it.mood !== 'none' ? ` · ${s.it.brain}` : '') : (AGENT_WORDS[s.it.state] || 'Ready');
    tip.innerHTML = `${esc(s.it.name)}<small>${esc(sub)}</small>`;
    place(tip, s.btn); tip.hidden = false;
  }
  function place(el, btn) {
    const r = btn.getBoundingClientRect();
    if (row.classList.contains('column') || getComputedStyle(row).flexDirection === 'column') { el.style.left = `${Math.round(r.right + 12)}px`; el.style.top = `${Math.round(r.top - 4)}px`; el.classList.remove('below'); }
    else { el.style.left = `${Math.max(8, Math.round(r.left))}px`; el.style.top = `${Math.round(r.bottom + 10)}px`; el.classList.add('below'); el.style.setProperty('--arrow', `${Math.round(r.width / 2)}px`); }
  }
  function go(s) {
    closeBubble(s.btn.dataset.key);
    unseen.delete(s.btn.dataset.key); draw();
    if (s.kind === 'agent') { showAgents?.(); return; }
    if (!s.it.canChat) { note(`${s.it.name} doesn't take chats from your other Bobs yet. On ${s.it.name}: update Bob, then Settings, Bob-Net, Accept jobs.`); return; }
    const now = session();
    if (now === s.it.chat) return;
    if (!isNetChat(now)) { try { store?.setItem('bob-net-return', now); } catch {} }
    open(s.it.chat);
  }

  // ---------- Guest mode ----------
  function guestBar() {
    const id = session();
    const b = isNetChat(id) ? view.bobs.find((x) => x.chat === id) : null;
    const guest = isNetChat(id);
    document.body.classList.toggle('net-guest', guest);
    const input = document.getElementById('input');
    if (input) { if (guest && !input.dataset.netWas) input.dataset.netWas = input.placeholder; if (guest) input.placeholder = `Message ${b?.name || 'your other Bob'}`; else if (input.dataset.netWas) { input.placeholder = input.dataset.netWas; delete input.dataset.netWas; } }
    bar.hidden = !guest;
    if (!guest) { bar.innerHTML = ''; return; }
    const name = b?.name || 'Your other Bob';
    const line = ['Guest chat', 'on Bob-Net', b && b.mood !== 'none' && b.brain].filter(Boolean).join(' · ');
    const away = !b ? ' He isn\'t on Bob-Net right now, so a message can\'t reach him until he\'s back.' : '';
    if (bar.dataset.for !== id || bar.dataset.line !== line + away) {
      bar.dataset.for = id; bar.dataset.line = line + away;
      bar.innerHTML = `<div class="g-who"><strong>${esc(name)}</strong><span>${esc(line)}</span>${away ? `<p class="muted">${esc(away.trim())}</p>` : ''}</div><button type="button" class="g-back">Return from Guest Mode</button>`;
      bar.querySelector('.g-back').onclick = () => open(returnTo() && !isNetChat(returnTo()) ? returnTo() : 'main');
    }
    let help = document.getElementById('netHelping');
    if (!help) { help = document.createElement('span'); help.id = 'netHelping'; help.className = 'net-help'; help.title = 'In guest mode the other Bob does the thinking, with Bob-Net behind him: brains and cards your Bobs lend each other still help.'; help.innerHTML = '<i aria-hidden="true"></i>Bob-Net helping'; document.getElementById('effort')?.append(help); }
  }

  // ---------- Word bubbles ----------
  function showBubble(key, who, text) {
    const s = icons.get(key); if (!s) return;
    closeBubble();
    const el = document.createElement('div');
    el.className = 'say-bubble net-bub on'; el.tabIndex = 0; el.setAttribute('role', 'button');
    const hint = touch() ? BUBBLE_HINT.touch : BUBBLE_HINT.mouse;
    el.setAttribute('aria-label', `${who}: ${text}. Enter opens it, Delete dismisses it.`);
    el.innerHTML = `<b>${esc(who)}</b><span class="nb-text">${esc(text)}</span><span class="hint">${esc(hint)}</span>`;
    document.body.append(el); place(el, s.btn); tip.hidden = true;
    bubble = { key, el };
    said.textContent = `${who}: ${text}`;
    el.addEventListener('click', () => go(s));
    el.addEventListener('contextmenu', (e) => { e.preventDefault(); dismiss(key); });
    el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(s); } else if (e.key === 'Delete' || e.key === 'Backspace' || e.key === 'Escape') { e.preventDefault(); dismiss(key); } });
    let sx = null;
    el.addEventListener('pointerdown', (e) => { if (e.pointerType !== 'mouse') sx = e.clientX; });
    el.addEventListener('pointermove', (e) => { if (sx == null) return; const dx = e.clientX - sx; el.style.transform = `translateX(${dx}px)`; el.style.opacity = String(Math.max(0.2, 1 - Math.abs(dx) / 160)); });
    el.addEventListener('pointerup', (e) => { if (sx == null) return; const dx = e.clientX - sx; sx = null; if (Math.abs(dx) > 60) { e.preventDefault(); dismiss(key); } else { el.style.transform = ''; el.style.opacity = ''; } });
  }
  function dismiss(key) { unseen.delete(key); closeBubble(key); draw(); }
  function closeBubble(key) { if (!bubble || (key && bubble.key !== key)) return; bubble.el.remove(); bubble = null; }

  // Events from Bob (app.js passes each one in). Display only.
  function event(ev) {
    if (!on || !ev) return;
    if (ev.type === 'coding-agents' && ev.agent && ['done', 'needs-you', 'failed'].includes(ev.agent.state)) {
      refresh().then(() => { const a = view.agents.find((x) => x.id === ev.agent.id); if (!a) return; const k = keyOfAgent(a); unseen.set(k, (unseen.get(k) || 0) + 1); draw(); showBubble(k, a.name, preview(a.last) || AGENT_WORDS[ev.agent.state]); });
      return;
    }
    if (!isNetChat(ev.sessionId)) return;
    if (ev.type === 'start') replies.set(ev.sessionId, '');
    if (ev.type === 'token' && typeof ev.text === 'string') replies.set(ev.sessionId, (replies.get(ev.sessionId) || '') + ev.text);
    if (ev.type === 'error' && ev.text && ev.sessionId !== session()) replies.set(ev.sessionId, String(ev.text));
    if (ev.type === 'done' && ev.sessionId !== session()) {
      const b = view.bobs.find((x) => x.chat === ev.sessionId); if (!b) return;
      const k = keyOfBob(b); unseen.set(k, (unseen.get(k) || 0) + 1); draw();
      showBubble(k, b.name, preview(replies.get(ev.sessionId)) || 'Answered.');
    }
  }

  async function refresh() {
    if (!on) return;
    try { const v = await fetchImpl('/api/net-overlay'); if (v?.on === false) { view = { bobs: [], agents: [] }; } else if (v) view = { bobs: [].concat(v.bobs || []), agents: [].concat(v.agents || []) }; } catch {}
    draw();
  }
  function loop() { clearTimeout(timer); if (!on) return; if (!document.hidden) refresh(); timer = setTimeout(loop, POLL_MS); }
  function setOn(v) {
    on = v === true;
    document.body.classList.toggle('net-overlay-on', on);
    if (on) loop(); else { clearTimeout(timer); view = { bobs: [], agents: [] }; closeBubble(); draw(); }
  }
  addEventListener('resize', () => { if (bubble) closeBubble(); placeGlow(); });
  addEventListener('bob-net-overlay', (e) => setOn(e.detail === true));

  return { setOn, event, moved: () => draw(), refresh, view: () => view, row };
}
