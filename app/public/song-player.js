// 1.5.41: Bob's song player. Every song or sound he makes shows in the chat as a player card (like a picture shows
// as itself): a big play button, the title, the song's shape as bars you click or drag to jump around, the time,
// and Lyrics / View / Show in folder. Several songs in one reply sit in a list, and the next one plays when one ends.
// Only one song plays at a time. The title, lyrics and bars come from the server (/api/song) once the card is on
// screen (fillSongs), so a song in an old chat, in Made by Bob or mentioned by name gets the same player.
import { esc } from './rich.js';

const BARS = 72;
const info = new Map(); // url -> Promise of /api/song's answer
const pathFromUrl = (url) => { try { return url.startsWith('/api/file?') ? new URL(url, location.origin).searchParams.get('path') : url; } catch { return url; } };

export function clock(s) {
  if (!Number.isFinite(s) || s < 0) return '0:00';
  const m = Math.floor(s / 60), r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, '0')}`;
}

// Bars as one SVG, drawn twice in the card: grey underneath, the accent colour on top (cut to how far it has played).
export function barsSvg(peaks) {
  const list = Array.isArray(peaks) && peaks.length ? peaks : null;
  const n = list ? list.length : BARS;
  const w = 3, gap = 1.5, h = 40;
  const rects = [];
  for (let i = 0; i < n; i++) {
    const v = list ? Math.max(0.04, Math.min(1, Number(list[i]) || 0)) : 0.08;
    const bh = Math.max(1.5, v * h);
    rects.push(`<rect x="${(i * (w + gap)).toFixed(1)}" y="${((h - bh) / 2).toFixed(1)}" width="${w}" height="${bh.toFixed(1)}" rx="1"/>`);
  }
  return `<svg viewBox="0 0 ${(n * (w + gap) - gap).toFixed(1)} ${h}" preserveAspectRatio="none" aria-hidden="true" focusable="false">${rects.join('')}</svg>`;
}

// One song's card. item: { url, name, title?, sound?, path?, mention? }. big: the side panel's larger player.
export function songCard(item, { big = false } = {}) {
  const url = item.url || '';
  const name = item.name || decodeURIComponent(url.split('/').pop() || '');
  const mention = item.mention || item.path || (url.startsWith('/images/') ? url : pathFromUrl(url));
  const title = item.title || name.replace(/\.[a-z0-9]+$/i, '');
  const word = item.sound === 'sfx' ? 'Sound effect' : item.sound === 'music' ? 'Song' : 'Sound';
  const view = `data-view-url="${esc(url)}" data-view-kind="audio" data-view-name="${esc(name)}" data-view-path="${esc(mention || '')}"`;
  return `<div class="song${big ? ' big' : ''}" data-song data-song-src="${esc(url)}" data-song-path="${esc(mention || '')}"${item.title ? '' : ' data-song-untitled'}>
<audio src="${esc(url)}" preload="metadata"></audio>
<button type="button" class="song-play" data-song-play aria-label="Play ${esc(title)}" title="Play"><span class="song-icon" aria-hidden="true">▶</span></button>
<div class="song-main">
<div class="song-top"><span class="song-title" title="${esc(name)}">${esc(title)}</span><span class="muted song-what">${esc(word)}<span class="song-len"></span></span></div>
<div class="song-wave" data-song-wave role="slider" tabindex="0" aria-label="Where in ${esc(title)}" aria-valuemin="0" aria-valuemax="0" aria-valuenow="0" aria-valuetext="0:00">
<div class="song-bars">${barsSvg(null)}</div><div class="song-bars song-done" style="clip-path: inset(0 100% 0 0)">${barsSvg(null)}</div></div>
<div class="song-foot"><span class="song-time" aria-hidden="true">0:00 / 0:00</span><span class="song-tools"><button type="button" class="mini" data-song-lyrics hidden aria-expanded="false">Lyrics</button>${big ? '' : `<button type="button" class="mini" data-view ${view}>Open in Made by Bob</button>`}${mention ? `<button type="button" class="mini" data-reveal="${esc(mention)}">Show in folder</button>` : ''}</span></div>
<div class="song-lyrics" hidden></div>
</div></div>`;
}

// Several songs in one reply: a list, played one after another.
export function songListHtml(items) {
  if (items.length < 2) return items.map((x) => songCard(x)).join('');
  return `<div class="song-list" role="group" aria-label="${items.length} songs">${items.map((x) => songCard(x)).join('')}</div>`;
}

function fetchInfo(card) {
  const url = card.dataset.songSrc;
  if (!url) return Promise.resolve(null);
  let p = info.get(url);
  if (!p) {
    p = fetch(`/api/song?path=${encodeURIComponent(card.dataset.songPath || pathFromUrl(url))}&bars=${BARS}`).then((r) => (r.ok ? r.json() : null)).catch(() => null);
    info.set(url, p);
    if (info.size > 200) info.delete(info.keys().next().value);
  }
  return p;
}

// Fill in what the server knows: the bars, the length, the title and the lyrics.
export function fillSongs(root) {
  for (const card of root.querySelectorAll('.song[data-song]:not([data-song-filled])')) {
    card.dataset.songFilled = '1';
    fetchInfo(card).then((j) => {
      if (!j || !card.isConnected) return;
      if (j.peaks) for (const b of card.querySelectorAll('.song-bars')) b.innerHTML = barsSvg(j.peaks);
      else card.classList.add('no-bars');
      if (j.seconds) setLength(card, j.seconds);
      if (j.title && 'songUntitled' in card.dataset) {
        card.querySelector('.song-title').textContent = j.title;
        card.querySelector('[data-song-play]').setAttribute('aria-label', `Play ${j.title}`);
        card.querySelector('[data-song-wave]').setAttribute('aria-label', `Where in ${j.title}`);
      }
      if (j.sound) card.querySelector('.song-what').firstChild.textContent = j.sound === 'sfx' ? 'Sound effect' : 'Song';
      if (j.lyrics) {
        const box = card.querySelector('.song-lyrics');
        box.innerHTML = `<pre>${esc(j.lyrics)}</pre>`;
        card.querySelector('[data-song-lyrics]').hidden = false;
      }
      if (j.style) card.querySelector('.song-title').title = j.style;
    });
  }
}

function setLength(card, secs) {
  if (!(secs > 0)) return;
  card.dataset.songLen = String(secs);
  card.querySelector('.song-len').textContent = ` · ${clock(secs)}`;
  const wave = card.querySelector('[data-song-wave]');
  wave.setAttribute('aria-valuemax', String(Math.round(secs)));
  draw(card);
}
const lengthOf = (card) => { const a = card.querySelector('audio'); return Number.isFinite(a.duration) && a.duration > 0 ? a.duration : Number(card.dataset.songLen) || 0; };

function draw(card) {
  const a = card.querySelector('audio');
  const len = lengthOf(card), now = a.currentTime || 0;
  const pct = len ? Math.min(100, (100 * now) / len) : 0;
  card.querySelector('.song-done').style.clipPath = `inset(0 ${(100 - pct).toFixed(2)}% 0 0)`;
  card.querySelector('.song-time').textContent = `${clock(now)} / ${clock(len)}`;
  const wave = card.querySelector('[data-song-wave]');
  wave.setAttribute('aria-valuenow', String(Math.round(now)));
  wave.setAttribute('aria-valuetext', `${clock(now)} of ${clock(len)}`);
  const playing = !a.paused && !a.ended;
  card.classList.toggle('playing', playing);
  const btn = card.querySelector('[data-song-play]');
  const title = card.querySelector('.song-title').textContent;
  btn.querySelector('.song-icon').textContent = playing ? '❚❚' : '▶';
  btn.setAttribute('aria-label', `${playing ? 'Pause' : 'Play'} ${title}`);
  btn.title = playing ? 'Pause' : 'Play';
}

function toggle(card) {
  const a = card.querySelector('audio');
  if (a.paused || a.ended) {
    a.play().catch(() => { card.classList.add('broken'); card.querySelector('.song-time').textContent = 'This file won\'t play. Show in folder finds it.'; });
  } else a.pause();
}

function seekTo(card, frac) {
  const a = card.querySelector('audio');
  const len = lengthOf(card);
  if (!len) return;
  a.currentTime = Math.max(0, Math.min(len - 0.05, frac * len));
  draw(card);
}

let wired = false;
// Once per page: the clicks, the keys, dragging along the bars, and the audio events (which don't bubble, so captured).
export function wireSongs(doc = document) {
  if (wired) return;
  wired = true;
  doc.addEventListener('click', (e) => {
    const card = e.target.closest?.('.song[data-song]');
    if (!card) return;
    if (e.target.closest('[data-song-play]')) { toggle(card); return; }
    const ly = e.target.closest('[data-song-lyrics]');
    if (ly) { const box = card.querySelector('.song-lyrics'); box.hidden = !box.hidden; ly.setAttribute('aria-expanded', String(!box.hidden)); ly.textContent = box.hidden ? 'Lyrics' : 'Hide lyrics'; }
  });
  let drag = null;
  const fracAt = (wave, x) => { const r = wave.getBoundingClientRect(); return r.width ? (x - r.left) / r.width : 0; };
  doc.addEventListener('pointerdown', (e) => {
    const wave = e.target.closest?.('[data-song-wave]');
    if (!wave || e.button !== 0) return;
    const card = wave.closest('.song');
    drag = { wave, card };
    try { wave.setPointerCapture(e.pointerId); } catch {}
    seekTo(card, fracAt(wave, e.clientX));
  });
  doc.addEventListener('pointermove', (e) => { if (drag) seekTo(drag.card, fracAt(drag.wave, e.clientX)); });
  const end = () => { drag = null; };
  doc.addEventListener('pointerup', end);
  doc.addEventListener('pointercancel', end);
  doc.addEventListener('keydown', (e) => {
    const wave = e.target.closest?.('[data-song-wave]');
    if (!wave) return;
    const card = wave.closest('.song');
    const a = card.querySelector('audio'), len = lengthOf(card);
    const jump = { ArrowRight: 5, ArrowUp: 5, ArrowLeft: -5, ArrowDown: -5, PageUp: 15, PageDown: -15 }[e.key];
    if (jump !== undefined && len) { e.preventDefault(); seekTo(card, (a.currentTime + jump) / len); return; }
    if (e.key === 'Home') { e.preventDefault(); seekTo(card, 0); return; }
    if (e.key === 'End' && len) { e.preventDefault(); seekTo(card, 1); return; }
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); toggle(card); }
  });
  const onMedia = (e) => {
    const a = e.target;
    if (!(a instanceof HTMLAudioElement)) return;
    const card = a.closest('.song[data-song]');
    if (!card) return;
    if (e.type === 'play') for (const other of doc.querySelectorAll('.song[data-song] audio')) if (other !== a && !other.paused) other.pause();
    if (e.type === 'loadedmetadata' && Number.isFinite(a.duration)) setLength(card, a.duration);
    if (e.type === 'error') { card.classList.add('broken'); card.querySelector('.song-time').textContent = 'This file won\'t play here. Show in folder finds it.'; return; }
    draw(card);
    // The next song in the same list plays when one ends.
    if (e.type === 'ended') {
      const list = card.closest('.song-list');
      const next = list ? [...list.querySelectorAll('.song[data-song]')][[...list.querySelectorAll('.song[data-song]')].indexOf(card) + 1] : null;
      a.currentTime = 0; draw(card);
      if (next) next.querySelector('audio').play().catch(() => {});
    }
  };
  for (const t of ['play', 'pause', 'ended', 'timeupdate', 'loadedmetadata', 'seeked', 'error']) doc.addEventListener(t, onMedia, true);
}
