// The email sort plan (Nov 13, src/email-manage.js, "Let Bob tidy my email"). The owner: "present a plan before
// execution... show how he's going to sort, recommend what to delete, make it easy to move things from one to the other
// by batches", "suggest making folders for large volume senders", "what should probably be replied to first, in order of
// assumed importance", "flag dangerous emails".
// Each batch has what will happen to it (keep, mark read, archive, Trash, move to a folder) and its emails; any email,
// or a whole batch, can go to another batch. Do it / Change something / Not now. Nothing happens until Do it, and the
// app checks the answer again: only the emails on this card, only these actions.
// Everything shown is e-mail text, so it is escaped and never turned into links.
import { esc } from './rich.js';

const ACTIONS = [['keep', 'Leave them as they are'], ['mark_read', 'Mark as read'], ['archive', 'Archive (out of the inbox, kept)'], ['trash', 'Move to Trash (you can undo it)'], ['move', 'Move to a folder']];

export function sortApproval(ev, { add, answer }) {
  const p = ev.sortCard;
  if (!p || !Array.isArray(p.batches)) return null;
  const listId = `sort-folders-${String(ev.id).replace(/[^\w-]/g, '')}`;
  const batchOpts = (cur) => p.batches.map((b) => `<option value="${esc(b.key)}"${b.key === cur ? ' selected' : ''}>${esc(b.name)}</option>`).join('');
  const item = (it, key) => `<li class="sort-item" data-id="${Number(it.id)}" data-from="${esc(key)}">
      <div class="sort-item-text"><strong>${esc(it.subject)}</strong> <span class="muted">${esc(it.from)}${it.unread ? ' · unread' : ''}</span>
      ${it.danger?.length ? `<div class="sort-danger">⚠️ ${esc(it.danger.join('; '))}</div>` : ''}</div>
      <label class="sort-move"><span class="muted">Batch</span> <select class="item-batch" aria-label="Batch for ${esc(it.subject)}">${batchOpts(key)}</select></label></li>`;
  const batch = (b) => `<section class="sort-batch${b.name === 'Looks dangerous' ? ' sort-bad' : ''}" data-key="${esc(b.key)}">
      <div class="sort-head"><strong>${esc(b.name)}</strong> <span class="tag count">${b.items.length}</span>${b.why ? `<div class="muted">${esc(b.why)}</div>` : ''}</div>
      <div class="sort-what">
        <label><span>What happens</span> <select class="batch-action" aria-label="What happens to ${esc(b.name)}">${ACTIONS.map(([v, t]) => `<option value="${v}"${v === b.action ? ' selected' : ''}>${t}</option>`).join('')}</select></label>
        <label class="sort-folder"${b.action === 'move' ? '' : ' hidden'}><span>Folder</span> <input class="batch-folder" list="${listId}" maxlength="80" value="${esc(b.folder || '')}" aria-label="Folder for ${esc(b.name)}"></label>
        <label><span>Move all to</span> <select class="batch-all" aria-label="Move all of ${esc(b.name)} to another batch"><option value="">(stay here)</option>${batchOpts('').replace(`<option value="${esc(b.key)}">${esc(b.name)}</option>`, '')}</select></label>
      </div>
      <details class="sort-items"><summary>See the emails</summary><ul>${b.items.map((it) => item(it, b.key)).join('')}</ul></details>
    </section>`;
  const first = Array.isArray(p.replyFirst) && p.replyFirst.length ? `<div class="sort-first"><strong>Reply to these first</strong> (most important first)<ol>${p.replyFirst.map((r) => `<li><strong>${esc(r.subject)}</strong> <span class="muted">${esc(r.from)}${r.why ? ` · ${esc(r.why)}` : ''}</span></li>`).join('')}</ol></div>` : '';
  const card = add('approval hands-card plan-card sort-card', `<p><strong>${esc(ev.text)}</strong></p>
    ${first}
    <datalist id="${listId}">${(p.folders || []).map((f) => `<option value="${esc(f)}">`).join('')}</datalist>
    <div class="sort-batches">${p.batches.map(batch).join('')}</div>
    <p class="muted">Nothing changes until you press Do it. Trash is a move, not a delete, nothing is ever sent, and every batch can be undone. A folder that doesn't exist yet is made for you.</p>
    <div class="row plan-buttons"><button type="button" class="yes big go">Do it</button><button type="button" class="big change">Change something</button><button type="button" class="no big">Not now</button></div>
    <div class="plan-change" hidden><label><strong>What should Bob change?</strong><textarea rows="2" maxlength="500" aria-label="What should Bob change?"></textarea></label>
      <div class="row"><button type="button" class="yes big send-change">Send to Bob</button><button type="button" class="big back">Back</button></div></div>`);
  const sec = (key) => card.querySelector(`.sort-batch[data-key="${CSS.escape(key)}"]`);
  const recount = () => { for (const s of card.querySelectorAll('.sort-batch')) s.querySelector('.count').textContent = s.querySelectorAll('.sort-item').length; };
  const moveTo = (li, key) => { const s = sec(key); if (!s) return; s.querySelector('.sort-items ul').append(li); li.querySelector('.item-batch').value = key; };
  card.querySelector('.sort-batches').addEventListener('change', (e) => {
    const t = e.target;
    if (t.classList.contains('item-batch')) { moveTo(t.closest('.sort-item'), t.value); recount(); }
    else if (t.classList.contains('batch-all') && t.value) { const from = t.closest('.sort-batch'); for (const li of [...from.querySelectorAll('.sort-item')]) moveTo(li, t.value); t.value = ''; recount(); }
    else if (t.classList.contains('batch-action')) { const f = t.closest('.sort-batch').querySelector('.sort-folder'); f.hidden = t.value !== 'move'; if (!f.hidden) f.querySelector('input').focus(); }
  });
  const box = card.querySelector('.plan-change'), buttons = card.querySelector('.plan-buttons'), said = card.querySelector('textarea');
  const finish = (allow, items, note, done) => {
    buttons.remove();
    box.outerHTML = `<div class="done">${esc(done)}</div>`;
    for (const i of card.querySelectorAll('input, select')) i.disabled = true;
    answer(allow, items, note);
  };
  // The answer: each batch's action (and folder), then only the emails that changed batch.
  const chosen = () => {
    const sets = [...card.querySelectorAll('.sort-batch')].map((s) => ({ batch: s.dataset.key, set: { action: s.querySelector('.batch-action').value, folder: s.querySelector('.batch-folder').value.trim() } }));
    const moved = [...card.querySelectorAll('.sort-item')].map((li) => ({ id: Number(li.dataset.id), batch: li.closest('.sort-batch').dataset.key, from: li.dataset.from })).filter((m) => m.batch !== m.from).map(({ id, batch }) => ({ id, batch }));
    return [...sets, ...moved];
  };
  card.querySelector('.go').onclick = () => {
    const empty = [...card.querySelectorAll('.sort-batch')].find((s) => s.querySelector('.batch-action').value === 'move' && !s.querySelector('.batch-folder').value.trim() && s.querySelector('.sort-item'));
    if (empty) { empty.querySelector('.batch-folder').focus(); return; }
    finish(true, chosen(), '', 'Doing it');
  };
  card.querySelector('.no').onclick = () => finish(false, null, '', 'Not now: nothing was changed');
  card.querySelector('.change').onclick = () => { buttons.hidden = true; box.hidden = false; said.focus(); };
  card.querySelector('.back').onclick = () => { box.hidden = true; buttons.hidden = false; };
  card.querySelector('.send-change').onclick = () => {
    const note = said.value.trim();
    if (!note) { said.focus(); return; }
    finish(false, null, note, `Asked Bob to change: ${note}`);
  };
  return card;
}
