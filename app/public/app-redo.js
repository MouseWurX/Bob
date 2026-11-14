// The chat: edited messages, Try again and Edit, earlier versions, steps and the context meter. Split out of app.js.
import { esc, render } from './rich.js';
import { fillPeeks } from './viewer.js';

// now() hands over app.js's own values as they are at the moment of each call; fresh() copies them in.
export function createRedoParts(now) {
  let $, bubbleMedia, busy, decorate, drawReply, lastYou, liveWords, log, mediaHtml, note, rawText, redoOnNow, redoSend, redoing, replies, stuckNow;
  const fresh = () => { ({ $, bubbleMedia, busy, decorate, drawReply, lastYou, liveWords, log, mediaHtml, note, rawText, redoOnNow, redoSend, redoing, replies, stuckNow } = now()); };
function markEdited(el, was, by) {
  el.querySelector(':scope > .edited-note')?.remove();
  const box = document.createElement('div');
  box.className = 'edited-note';
  const who = by === 'you' && el.classList.contains('bob') ? 'You changed Bob\'s words here' : `${el.classList.contains('you') ? 'You' : 'Bob'} changed this message`;
  box.innerHTML = `<button type="button" class="link mini" aria-expanded="false" title="${who}. Press to see what it said first.">edited</button><div class="edited-was muted" hidden><strong>First said:</strong> ${esc(was || '')}</div>`;
  const b = box.querySelector('button'), w = box.querySelector('.edited-was');
  b.onclick = () => { w.hidden = !w.hidden; b.setAttribute('aria-expanded', String(!w.hidden)); };
  el.insertBefore(box, el.querySelector(':scope > .msg-tools'));
}
function editedMsg(ev) {
  const el = ev.id && log.querySelector(`[data-mid~="${CSS.escape(ev.id)}"]`);
  if (!el) return; // in the older part of the chat, or another chat: the saved chat has the new words
  const live = [...replies.values()].find((r) => r.el === el);
  const old = live ? live.text : rawText.get(el) ?? liveWords.get(el) ?? '';
  const one = !/\s/.test(el.dataset.mid.trim());
  const text = ev.before && old.includes(ev.before) ? old.replace(ev.before, ev.text) : one ? ev.text : null;
  if (text == null) return; // two of his messages share this bubble and the old words weren't found: a reload shows it right
  const media = live ? live.media : bubbleMedia.get(el) || [];
  if (live) { live.text = text; live.mediaKey = null; drawReply(live); }
  else {
    el.innerHTML = render(text) + (media.length ? `<div class="reply-media">${mediaHtml(media)}</div>` : '');
    if (media.length) fillPeeks(el);
    rawText.delete(el); liveWords.set(el, text);
    decorate(el, text, media);
  }
  markEdited(el, ev.was, ev.by);
  el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 2500);
}
// Where Try again goes: Bob's latest answer, or your latest message while it has none. It's in that message's ... menu.
function redoTarget() {
  const you = lastYou();
  if (!you?.dataset.mid) return null;
  let answer = null;
  for (let n = you.nextElementSibling; n; n = n.nextElementSibling) if (n.matches('.msg.bob:not(.aside-msg)')) answer = n;
  return answer || you;
}
// Try again and Edit live in the ... menu, built fresh each time it opens; an open one shuts when Bob gets busy.
function drawRedo() {
  for (const x of log.querySelectorAll('[data-save-test], [data-redo][data-hard]')) x.remove();
  if (busy || redoing || !redoOnNow) { window.dispatchEvent(new Event('bob-msg-menu-close')); return; }
  // Two buttons stay under the latest answer, outside the ... menu: Save as a test (item 11), and after Bob gave up,
  // Try again thinking harder (item 8).
  const t = redoTarget(), answer = t?.matches('.msg.bob') ? t : null;
  if (answer?.dataset.mid) answer.querySelector(':scope > .msg-tools')?.insertAdjacentHTML('beforeend', '<button type="button" class="mini" data-save-test title="That answer went wrong? Keep the question as a test, so Bob\'s tests (and the Lab) learn from it">Save as a test</button>');
  if (stuckNow && t) t.querySelector(':scope > .msg-tools')?.insertAdjacentHTML('beforeend', '<button type="button" class="mini" data-redo data-hard title="Ask again on High effort: the bigger brain works it out and a second brain checks it">Try again, thinking harder</button>');
}
function versionsHtml(list) {
  const cut = (t) => { const x = String(t || ''); return esc(x.length > 1500 ? x.slice(0, 1500) + '…' : x); };
  return list.slice().reverse().map((v, i) => `<li><span class="muted">${i === 0 ? 'Latest earlier version' : `${i + 1} versions back`}${v.at ? ` · ${esc(new Date(v.at).toLocaleString())}` : ''}</span><div><strong>You:</strong> ${cut(v.text)}</div>${(v.said || []).map((m) => `<div><strong>${m.role === 'user' ? 'You' : 'Bob'}:</strong> ${cut(m.content) || (m.media?.length ? `<em>${m.media.length} thing${m.media.length === 1 ? '' : 's'} made</em>` : '')}</div>`).join('') || '<div class="muted">No answer yet.</div>'}</li>`).join('');
}
function markVersions(el, list) {
  el.querySelector(':scope > .versions-note')?.remove();
  if (!list?.length) return;
  const box = document.createElement('div');
  box.className = 'versions-note';
  box.innerHTML = `<button type="button" class="link mini" aria-expanded="false" title="What was here before Try again or Edit. Press to see it.">${list.length === 1 ? '1 earlier version' : `${list.length} earlier versions`}</button><ol class="versions-list muted" hidden>${versionsHtml(list)}</ol>`;
  const b = box.querySelector('button'), w = box.querySelector('ol');
  b.onclick = () => { w.hidden = !w.hidden; b.setAttribute('aria-expanded', String(!w.hidden)); };
  el.insertBefore(box, el.querySelector(':scope > .msg-tools'));
}
// Item 10 (Nov 11): "How I got here" under a reply: each step, whether it worked, how long it took, how much came back and
// which brain was thinking. Folded until pressed; Copy puts it on the clipboard as plain lines for a bug report.
function stepsText(list) {
  return list.map((x, i) => (x.correction ? `${i + 1}. ⚠ ${x.what || 'App\'s note'}${x.brain ? ` · ${x.brain}` : ''}` : `${i + 1}. ${x.ok ? '✓' : '✗'} ${x.what || x.tool} · ${(x.ms / 1000).toFixed(1)} s · ${Number(x.chars || 0).toLocaleString()} characters back${x.brain ? ` · ${x.brain}` : ''}`)).join('\n');
}
function markSteps(el, list) {
  el.querySelector(':scope > .steps-note')?.remove();
  if (!list?.length) return;
  const box = document.createElement('div');
  box.className = 'versions-note steps-note';
  box.innerHTML = `<button type="button" class="link mini" aria-expanded="false" title="Each step Bob took for this answer. Press to see them.">How I got here (${list.length} step${list.length === 1 ? '' : 's'})</button><div hidden><ol class="steps-list">${list.map((x) => (x.correction ? `<li class="step-correction">⚠ ${esc(x.what || 'App\'s note')}${x.brain ? ` <span class="muted">· ${esc(x.brain)}</span>` : ''}</li>` : `<li>${x.ok ? '✓' : '✗'} ${esc(x.what || x.tool)} <span class="muted">· ${(x.ms / 1000).toFixed(1)} s · ${esc(Number(x.chars || 0).toLocaleString())} characters back${x.brain ? ` · ${esc(x.brain)}` : ''}</span></li>`)).join('')}</ol><button type="button" class="mini" data-copy-steps>Copy</button></div>`;
  const b = box.querySelector('button'), w = box.querySelector('div');
  b.onclick = () => { w.hidden = !w.hidden; b.setAttribute('aria-expanded', String(!w.hidden)); };
  box.querySelector('[data-copy-steps]').onclick = () => navigator.clipboard?.writeText(stepsText(list)).then(() => note('Copied the steps.')).catch(() => {});
  el.insertBefore(box, el.querySelector(':scope > .msg-tools'));
}
// Item 13 (Nov 11): how full this chat left the brain's memory, by Effort, after each reply. From 70% on, "Sum up and
// carry on" appears: the older part is summed up and only the last few messages stay word for word.
const kTok = (n) => (n >= 1000 ? `${Math.round(n / 1000)}K` : String(n));
function drawFill(ev) {
  const fillBox = $('chatFill'), fillText = $('chatFillText'), fillSum = $('chatFillSum');
  if (!fillBox) return;
  if (!ev?.ctx) { fillBox.hidden = true; return; }
  const share = Math.min(1, ev.used / ev.ctx);
  fillText.textContent = `This chat: ${kTok(ev.used)} of ${kTok(ev.ctx)} (${Math.round(share * 100)}%)`;
  fillBox.title = 'How much of the brain\'s memory this chat filled on the last reply';
  fillBox.classList.toggle('full', share >= 0.7);
  fillSum.hidden = share < 0.7;
  fillBox.hidden = false;
}
// Edit in place: a box with your words, Send again and Cancel. Esc cancels, Enter sends (Shift+Enter for a new line).
function editInPlace(el) {
  if (el.querySelector(':scope > .edit-box')) return;
  const was = rawText.get(el) || '';
  const later = el !== lastYou() || [...log.querySelectorAll(':scope > .msg.bob')].some((b) => el.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
  const box = document.createElement('form');
  box.className = 'edit-box';
  box.innerHTML = `<label class="sr-only" for="edit-${el.dataset.mid}">Your message</label><textarea id="edit-${el.dataset.mid}" rows="3">${esc(was)}</textarea>${later ? '<span class="muted">Bob answers from here. What came after this message is kept under it as an earlier version.</span>' : ''}<div class="row"><button type="submit">Send again</button><button type="button" class="link" data-edit-cancel>Cancel</button></div>`;
  el.classList.add('editing');
  el.appendChild(box);
  const t = box.querySelector('textarea');
  t.focus(); t.setSelectionRange(t.value.length, t.value.length);
  const close = () => { box.remove(); el.classList.remove('editing'); };
  box.querySelector('[data-edit-cancel]').onclick = close;
  t.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); box.requestSubmit(); }
  });
  box.onsubmit = (e) => {
    e.preventDefault();
    const text = t.value.trim();
    if (!text) { t.focus(); return; }
    if (text === was.trim()) { close(); return; }
    close();
    redoSend(el.dataset.mid, text);
  };
}
  return {
    markEdited: (...a) => { fresh(); return markEdited(...a); },
    editedMsg: (...a) => { fresh(); return editedMsg(...a); },
    redoTarget: (...a) => { fresh(); return redoTarget(...a); },
    drawRedo: (...a) => { fresh(); return drawRedo(...a); },
    markVersions: (...a) => { fresh(); return markVersions(...a); },
    markSteps: (...a) => { fresh(); return markSteps(...a); },
    drawFill: (...a) => { fresh(); return drawFill(...a); },
    editInPlace: (...a) => { fresh(); return editInPlace(...a); }
  };
}
