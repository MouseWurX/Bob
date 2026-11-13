// The chat: Bob's replies as they stream in, the pictures and files in them, and offers to set up or rent a brain. Split out of app.js.
import { esc, render } from './rich.js';
import { fillPeeks, outCard } from './viewer.js';
import { diagramHtml, saveRowsHtml } from './save-as.js';
import { songListHtml } from './song-player.js';

// now() hands over app.js's own values as they are at the moment of each call; fresh() copies them in.
export function createReplyParts(now) {
  let add, correctedBubbles, log, note, replies, scrollDown, viewer;
  const fresh = () => { ({ add, correctedBubbles, log, note, replies, scrollDown, viewer } = now()); };
// 1.5.91 the Set it up card (the words were signed off by the settings thread; the phone app has the same card).
function setupOfferHtml(ev) {
  const gbs = (n) => (n >= 1 ? `${(+n).toFixed(n >= 10 ? 0 : 1)} GB` : `${Math.max(1, Math.round(n * 1000))} MB`);
  const after = ev.carryOn ? ' Then I carry on with what you asked.' : '';
  if (ev.kind === 'switch') return `<strong>"${esc(ev.name)}" is off</strong><span>It lets me ${esc(ev.what)}.${ev.privacy ? ' ' + esc(ev.privacy) : ''}${ev.free ? ' "Work without asking" is on, so it won\'t ask before each step.' : ev.name.startsWith('Let Bob use Hands') ? ' I still ask before every step.' : ''}${ev.folders ? ' Then tick the folders I may use in Settings, Hands.' : ''}${esc(after)} You can switch it off again in ${esc(ev.where)}.</span><div class="row"><button type="button" class="get">Switch it on</button><button type="button" class="link">Not now</button></div>`;
  if (ev.kind === 'equip') return `<strong>I can't ${esc(ev.say)} yet</strong><span>${esc(ev.model?.name || '')} is already on this replicant matrix, it just isn't in its slot.${esc(after)}</span><div class="row"><button type="button" class="get">Use it</button><button type="button" class="link">Not now</button></div>`;
  const items = (ev.items || []).map((i) => `<li>${esc(i.name)} <span class="muted">· ${gbs(i.sizeGB)}${i.engine ? ' · program' : ''}${i.license ? ` · ${esc(i.license)}` : ''}</span></li>`).join('');
  return `<strong>I can't ${esc(ev.say)} yet</strong><span>I need ${esc(ev.what)} first. ${ev.need === 'ffmpeg' ? 'One press gets it and sets it up.' : 'One press gets it, sets it up and puts it in its slot.'}${esc(after)}</span><ul>${items}</ul><span class="muted">About ${esc(ev.size)} in all${ev.freeGB != null ? `, ${ev.freeGB} GB free` : ''}. One time only.${ev.note ? ' ' + esc(ev.note) : ''}</span>${ev.short ? `<span class="error">Not enough free disk: free up ${ev.short} GB first, then ask me again.</span>` : ''}<div class="row"><button type="button" class="get">Set it up (about ${esc(ev.size)})</button><button type="button" class="link">Not now</button></div>`;
}
// 1.5.127 Rented brains: the Hire it card. Says what it costs, how long it takes to start, and exactly what leaves this replicant matrix.
function rentOfferHtml(ev) {
  const r = ev.rental || {};
  const start = ev.startMinutes ? ` It takes about ${ev.startMinutes} minute${ev.startMinutes === 1 ? '' : 's'} to start${r.kind === 'machine' ? ', and those minutes are billed too' : ''}.` : '';
  const leaves = `What leaves this replicant matrix: this chat, the files you attached to it, my instructions and what I remember about you, to ${esc(r.service || 'the service')}${r.plain ? ' (over a plain, unencrypted connection to the hired machine)' : ''}. Their privacy policy covers it there.`;
  const after = ev.carryOn ? ' Then I run your request there; my tools still run here, with the usual OK cards.' : ' Then your next messages run there.';
  const multi = (r.cards || 1) > 1 ? `<span class="error"><strong>⚠️ This machine has ${r.cards} cards at once</strong> (${esc(r.cardsText || '')}): it costs about ${r.cards} times as much an hour as one card, busy or not.</span>` : '';
  return `<strong>Hire ${esc(r.name || 'the rented brain')}?</strong><span>${esc(ev.why || '')} ${esc(r.model || '')} on ${esc(r.service || '')}: ${esc(ev.price || '')}.${start}${esc(after)}</span>${multi}<span class="muted">${leaves}</span>${ev.blocked ? `<span class="error">${esc(ev.blocked)}</span>` : ''}<div class="row"><button type="button" class="get"${ev.blocked ? ' disabled title="Fix the line above first"' : ''}>Hire it (${esc(ev.est || 'a few cents')})</button><button type="button" class="link">Not now</button></div>`;
}
function ensureReply(ev) {
  const k = ev?.turnId || '-';
  if (!replies.has(k)) replies.set(k, { el: add('msg bob', ''), text: '', media: [] });
  return replies.get(k);
}
// 1.5.11: a reply's pictures, sounds and clips live in the same bubble as its words (as history shows them), so
// the words arriving later never wipe them and an image-only bubble never collapses to an empty box.
// 1.5.41: while the words stream in, the cards already there stay as they are (not drawn again), so a song that's
// playing keeps playing and a picture doesn't flicker. The cards sit in .reply-media (display: contents).
function drawReply(r) {
  const words = render(r.text.replace(/^\s+/, '').replace(/\s+$/, ''));
  const key = r.media.map((m) => m.url).join('\n');
  const keep = key && r.mediaKey === key ? r.el.querySelector(':scope > .reply-media') : null;
  r.mediaKey = key;
  if (!keep) { r.el.innerHTML = words + (r.media.length ? `<div class="reply-media">${mediaHtml(r.media)}</div>` : ''); if (r.media.length) fillPeeks(r.el); return; }
  const tpl = document.createElement('template');
  tpl.innerHTML = words;
  for (const c of [...r.el.childNodes]) if (c !== keep) c.remove();
  r.el.insertBefore(tpl.content, keep);
}
function addMedia(ev, type) {
  const r = ensureReply(ev);
  const item = { type, url: ev.url, name: decodeURIComponent(String(ev.url).split('/').pop() || ''), ...(ev.song?.title ? { title: ev.song.title, sound: ev.song.sound } : {}), ...(type === 'diagram' ? { title: ev.title || '', ...(ev.format ? { format: ev.format } : {}) } : {}) };
  r.media.push(item); drawReply(r); scrollDown();
  if (type !== 'diagram') viewer.made([{ ...item, kind: type }]); // the side panel shows it too, if it's open
  return r;
}
// Files he saved (documents, spreadsheets, copies, zips) and things called up with show_made: cards in the same bubble.
function addMade(ev) {
  const r = ensureReply(ev);
  const fresh = (ev.items || []).filter((x) => x?.url && !r.media.some((m) => m.url === x.url));
  if (fresh.length) { r.media.push(...fresh.map((x) => ({ type: 'file', kind: x.kind, url: x.url, name: x.name, path: x.path }))); drawReply(r); scrollDown(); }
  viewer.made(ev.items, { show: ev.show === true });
}
function endReply(ev) {
  // Item 190 (Nov 12): a correction ends the bubble; if Bob then tries again in this turn, these words get folded
  // away as replaced (see 'token').
  const rep = ev?.type === 'correction' ? replies.get(ev.turnId || '-') : null;
  if (rep?.el && String(rep.text || '').trim()) correctedBubbles.set(ev.turnId || '-', rep.el);
  replies.delete(ev?.turnId || '-');
}
function markReplaced(el) {
  if (!el || el.classList.contains('replaced')) return;
  el.classList.add('replaced');
  const keepTools = el.querySelector(':scope > .msg-tools');
  const box = document.createElement('div');
  box.className = 'replaced-body';
  box.hidden = true;
  for (const n of [...el.childNodes]) if (n !== keepTools) box.appendChild(n);
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'link mini replaced-toggle'; b.setAttribute('aria-expanded', 'false');
  b.textContent = 'Bob\'s first try, replaced by the answer below (show it)';
  b.onclick = () => { box.hidden = !box.hidden; b.setAttribute('aria-expanded', String(!box.hidden)); b.textContent = box.hidden ? 'Bob\'s first try, replaced by the answer below (show it)' : 'Bob\'s first try, replaced by the answer below (hide it)'; };
  el.insertBefore(box, keepTools || null);
  el.insertBefore(b, box);
}
function showAnswer(ev, text, extra = {}) {
  const r = ensureReply(ev);
  r.text = String(text || '');
  if (r.text.trim() || r.media.length) { drawReply(r); log.append(r.el); } // under the cards that came while he worked
  if (extra.checked) checkedNote(r.el, extra.checked);
  if (extra.correction) note(extra.correction, 'error');
}
// The moot's minutes, folded under the answer it checked.
function checkedNote(el, minutes) {
  el.querySelector(':scope > .checked-note')?.remove();
  const box = document.createElement('div');
  box.className = 'versions-note checked-note';
  box.innerHTML = `<button type="button" class="link mini" aria-expanded="false">🛰 Checked by a second look</button><div hidden>${render(String(minutes))}</div>`;
  const b = box.querySelector('button'), w = box.querySelector('div');
  b.onclick = () => { w.hidden = !w.hidden; b.setAttribute('aria-expanded', String(!w.hidden)); };
  el.insertBefore(box, el.querySelector(':scope > .msg-tools'));
}
// What Bob made in a reply (saved with it, so it's back after a reload): pictures, clips and sounds.
// Each one is a card with a preview (a thumbnail, the player, or the first lines); a click opens the side panel.
function mediaHtml(media) {
  if (!media?.length) return '';
  const items = media.map((m) => ({ ...m, kind: m.kind || (m.type === 'file' ? 'file' : m.type) }));
  // 1.5.21: two or more pictures or clips sit in a grid sized to fit the window, so all of them show without scrolling.
  const visual = items.filter((m) => m.kind === 'image' || m.kind === 'video');
  // 1.5.41: songs and sounds get the song player; two or more sit in a list that plays one after another.
  const songs = items.filter((m) => m.kind === 'audio' && m.url);
  const diagrams = items.filter((m) => m.kind === 'diagram').map(diagramHtml).join(''); // 1.5.95
  const rest = items.filter((m) => !visual.includes(m) && !songs.includes(m) && m.kind !== 'diagram').map(outCard).join('');
  const sounds = songs.length ? songListHtml(songs) : '';
  const saveRows = saveRowsHtml(items); // 1.5.95: Save as, under everything Bob made
  if (visual.length < 2) return diagrams + visual.map(outCard).join('') + sounds + rest + saveRows;
  const cols = Math.ceil(Math.sqrt(visual.length)), rows = Math.ceil(visual.length / cols);
  const grid = `<div class="media-grid" style="--cols:${cols};--rows:${rows}">${visual.map(outCard).join('')}</div>`;
  return diagrams + grid + sounds + rest + saveRows;
}
function picsHtml(pics) {
  return pics?.length ? `<div class="pics">${pics.map((p) => `<img src="${esc(p.url)}" alt="${esc(p.name)}" title="${esc(p.name)}">`).join('')}</div>` : '';
}
  return {
    setupOfferHtml: (...a) => { fresh(); return setupOfferHtml(...a); },
    rentOfferHtml: (...a) => { fresh(); return rentOfferHtml(...a); },
    ensureReply: (...a) => { fresh(); return ensureReply(...a); },
    drawReply: (...a) => { fresh(); return drawReply(...a); },
    addMedia: (...a) => { fresh(); return addMedia(...a); },
    addMade: (...a) => { fresh(); return addMade(...a); },
    endReply: (...a) => { fresh(); return endReply(...a); },
    markReplaced: (...a) => { fresh(); return markReplaced(...a); },
    showAnswer: (...a) => { fresh(); return showAnswer(...a); },
    mediaHtml: (...a) => { fresh(); return mediaHtml(...a); },
    picsHtml: (...a) => { fresh(); return picsHtml(...a); }
  };
}
