// Plan card (1.5.78, src/plan.js): with "Show Bob's plan before big jobs" on, Bob shows a big job's steps in order
// before he starts. Steps that need an OK have their own tick box (and their own rows to tick, for files), as on the
// card with all of a job's OKs (hands.js), so it is still one card for the whole job.
// Go ahead / Change something (the person says what, in their own words) / Not now. Returns the card, or null.
import { esc } from './rich.js';
import { stepBody } from './hands.js';

export function planApproval(ev, { add, answer }) {
  const p = ev.planCard;
  if (!p || !Array.isArray(p.steps)) return null;
  const oks = new Map((ev.together || []).map((it) => [it.n, it]));
  const step = (s) => {
    const it = oks.get(s.n);
    if (!it) return `<li class="plan-step"><span><strong>${s.n}.</strong> ${esc(s.text)}</span></li>`;
    return `<li class="plan-step together-step"><label class="together-head"><input type="checkbox" class="pick" data-n="${s.n}" checked aria-label="Allow step ${s.n}"><span><strong>${s.n}.</strong> ${esc(s.text)} <span class="tag">Needs your OK</span></span></label>${stepBody(it)}</li>`;
  };
  const card = add('approval hands-card together plan-card', `<p><strong>${esc(ev.text)}</strong>${p.time ? ` <span class="muted">(${esc(p.time)})</span>` : ''}</p>
    ${p.fromSystem ? '<p class="muted">Bob started this job without showing his plan, so these are the steps he was about to do. Check them before you go ahead.</p>' : ''}
    <ol class="together-list plan-list">${p.steps.map(step).join('')}</ol>
    <p class="muted">Nothing starts until you answer.${oks.size ? ' Untick any step you don\'t want.' : ''} Anything that isn't on this plan still asks you on its own card.</p>
    <div class="row plan-buttons"><button type="button" class="yes big go">Go ahead</button><button type="button" class="big change">Change something</button><button type="button" class="no big">Not now (Bob drops this job)</button></div>
    <div class="plan-change" hidden><label><strong>What should Bob change?</strong><textarea rows="2" maxlength="500" aria-label="What should Bob change?"></textarea></label>
      <div class="row"><button type="button" class="yes big send-change">Send to Bob</button><button type="button" class="big back">Back</button></div></div>`);
  const picks = () => [...card.querySelectorAll('input.pick')];
  const rowsOf = (n) => [...card.querySelectorAll(`input[data-step="${n}"]`)];
  const chosen = () => picks().filter((x) => x.checked).map((x) => {
    const n = Number(x.dataset.n);
    const rows = rowsOf(n);
    return rows.length ? { n, rows: rows.filter((r) => r.checked).map((r) => r.dataset.row) } : { n };
  }).filter((c) => !c.rows || c.rows.length);
  const allTicked = () => picks().every((x) => x.checked) && card.querySelectorAll('input[data-row]:not(:disabled):not(:checked)').length === 0;
  const go = card.querySelector('.go');
  // A step with no rows ticked is the same as unticking the step, and the other way round.
  const sync = (e) => {
    const t = e?.target;
    if (t?.classList.contains('pick')) { for (const r of rowsOf(t.dataset.n)) if (!r.disabled) r.checked = t.checked; }
    else if (t?.dataset.step) { const x = card.querySelector(`input.pick[data-n="${t.dataset.step}"]`); if (x) x.checked = rowsOf(t.dataset.step).some((r) => r.checked); }
    go.textContent = allTicked() ? 'Go ahead' : `Go ahead with ticked (${chosen().length} of ${oks.size} OKs)`;
  };
  const list = card.querySelector('.plan-list');
  list.addEventListener('change', sync);
  // Big targets (remote desktop): a click anywhere on a file row ticks it, like its box.
  list.addEventListener('click', (e) => {
    const tr = e.target.closest('tr.tap');
    if (!tr || e.target.closest('input')) return;
    const box = tr.querySelector('input[data-row]');
    if (!box || box.disabled) return;
    box.checked = !box.checked;
    box.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const box = card.querySelector('.plan-change'), buttons = card.querySelector('.plan-buttons'), said = card.querySelector('textarea');
  const finish = (allow, items, note, done) => {
    buttons.remove();
    box.outerHTML = `<div class="done">${esc(done)}</div>`;
    for (const i of card.querySelectorAll('input')) i.disabled = true;
    answer(allow, items, note);
  };
  go.onclick = () => {
    if (!oks.size || allTicked()) return finish(true, null, '', 'Going ahead');
    const items = chosen();
    finish(true, items, '', `Going ahead (${items.length} of ${oks.size} OKs ticked)`);
  };
  card.querySelector('.no').onclick = () => finish(false, null, '', 'Not now: Bob dropped this job');
  card.querySelector('.change').onclick = () => { buttons.hidden = true; box.hidden = false; said.focus(); };
  card.querySelector('.back').onclick = () => { box.hidden = true; buttons.hidden = false; };
  card.querySelector(".send-change").onclick = () => {
    const note = said.value.trim();
    if (!note) { said.focus(); return; }
    finish(false, null, note, `Asked Bob to change: ${note}`);
  };
  return card;
}
