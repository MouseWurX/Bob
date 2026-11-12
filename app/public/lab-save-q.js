// Lab item 102: Save to Lab. With "Save to Lab in the chat" on (the Lab's My Lab tab, off unless ticked), each of your
// messages gets a Save to Lab button. It asks what a good answer needs (it answers, has these words, a number, an
// exact answer, or it declines) and saves the question to your own challenge pack "My questions", which the Lab's
// Challenges can run on any brain. Works in Bob's window on Windows, Mac and Linux, and in a phone's browser.
import { esc } from './rich.js';

const CHECKS = [['answers', 'It answers (no refusal)', ''], ['contains', 'It has these words', 'words, with commas'], ['number', 'Its last number is', 'a number'], ['exact', 'It is exactly', 'the whole answer'], ['declines', 'It declines', '']];
const wordsOf = (msg) => { const c = msg.cloneNode(true); for (const x of c.querySelectorAll('.msg-tools, .versions-note, .file-cards, .lab-saveq, .qtag')) x.remove(); return (c.textContent || '').trim(); };

export function saveToLab(log, api) {
  let on = false;
  const mark = () => {
    for (const t of log.querySelectorAll(':scope > .msg.you > .msg-tools')) {
      const has = t.querySelector('[data-saveq]');
      if (on && !has) t.insertAdjacentHTML('beforeend', '<button type="button" class="mini" data-saveq title="Save this question as a Lab challenge">Save to Lab</button>');
      if (!on && has) has.remove();
    }
    if (!on) for (const f of log.querySelectorAll('.lab-saveq')) f.remove();
  };
  new MutationObserver(() => { if (on) mark(); }).observe(log, { childList: true });
  log.addEventListener('click', async (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const msg = b.closest('.msg.you');
    if ('saveq' in b.dataset && msg) {
      if (msg.querySelector(':scope > .lab-saveq')) { msg.querySelector(':scope > .lab-saveq').remove(); return; }
      const f = document.createElement('div'); f.className = 'lab-saveq';
      f.innerHTML = `<fieldset><legend>Save to Lab: what does a good answer need?</legend>${CHECKS.map(([id, label], i) => `<label class="lab-opt"><input type="radio" name="saveq-${msg.dataset.mid || Date.now()}" value="${id}" ${i === 0 ? 'checked' : ''}> ${esc(label)}</label>`).join('')}
        <p><label>Answer <input type="text" data-saveqa disabled placeholder=""></label></p>
        <div class="row"><button type="button" class="get" data-saveqgo>Save</button><button type="button" class="link" data-saveqno>Cancel</button></div><p class="muted" role="status" data-saveqsay>It goes into My questions, in the Lab's Challenges.</p></fieldset>`;
      msg.querySelector(':scope > .msg-tools')?.before(f);
      f.addEventListener('change', () => { const c = CHECKS.find(([id]) => id === f.querySelector('input[type=radio]:checked')?.value); const a = f.querySelector('[data-saveqa]'); a.disabled = !c[2]; a.placeholder = c[2]; if (c[2]) a.focus(); });
      f.querySelector('input[type=radio]')?.focus();
      return;
    }
    const f = b.closest('.lab-saveq'); if (!f) return;
    if ('saveqno' in b.dataset) { f.remove(); return; }
    if ('saveqgo' in b.dataset) {
      const check = f.querySelector('input[type=radio]:checked')?.value || 'answers', a = f.querySelector('[data-saveqa]').value.trim();
      const say = f.querySelector('[data-saveqsay]');
      try { const r = await api('/api/lab/plus/question', { q: wordsOf(f.closest('.msg.you')), check, a: check === 'number' ? Number(a) : a }); say.textContent = `Saved. My questions has ${r.count} now.`; b.disabled = true; setTimeout(() => f.remove(), 2500); } catch (err) { say.textContent = err.message; }
    }
  });
  return (value) => { on = value === true; mark(); };
}
