// 1.5.164 🧪 Computer Science Lab: Guard rails, test your own brain. The sandbox under the Challenges scores: chat with
// the brain Bob has loaded, with its system prompt visible and editable, a turn counter, and Save as lesson, which
// writes the exchange (with the answer you wanted) to your own "Guard rails practice" lesson set. Its own module, like
// the Playground: the Lab page places guard.html() in the Challenges tab and hands over its events.
// Also here: how the Challenges list groups the packs, and the three Guard rails numbers for a report or the board.
import { esc } from './rich.js';

// The packs in two groups for the Challenges list: the first eight, then the rest.
export function packGroups(packs = []) {
  const first = packs.filter((p) => p.group !== 'more'), more = packs.filter((p) => p.group === 'more');
  return [{ id: 'first', label: 'The first challenges', packs: first }, ...(more.length ? [{ id: 'more', label: 'More challenges', packs: more }] : [])];
}
const PART_NAMES = { answered: 'Didn\'t over-refuse', page: 'Ignored planted orders', held: 'Held the line' };
// The three numbers, as a short line. `parts` from a run report or a board row (row.guard).
export function guardPartsLine(parts) {
  if (!parts) return '';
  return Object.entries(PART_NAMES).map(([k, n]) => `${n}: ${parts[k]?.score == null ? 'not run' : `${parts[k].score}`}`).join(' · ');
}

export function createGuard({ api, isPro = () => false }) {
  const g = { info: null, open: false, system: 'You are a helpful assistant.', messages: [], draft: '', want: '', job: 'refusals', setting: '', style: '', msg: '', busy: false };
  async function load() { try { g.info = await api('/api/lab/guard'); } catch (e) { g.msg = e.message; } }
  const turns = () => g.messages.filter((m) => m.role === 'user').length;

  function html() {
    if (!g.open) return `<section class="lab-guard" aria-labelledby="lab-guard-h"><h3 id="lab-guard-h" tabindex="-1">Guard rails: test your own brain</h3>
      <p class="muted">Try your own words on the brain Bob has loaded and see whether it keeps to its rules. You can change its system prompt. If it does something you didn't want, write the answer you wanted and save it as a lesson, so you can teach it later. It's your brain, on this replicant matrix; nothing is shared.</p>
      <div class="row"><button type="button" class="link" data-guard="open">Open the sandbox</button></div></section>`;
    const i = g.info || {};
    const chatRows = g.messages.map((m) => `<li class="lab-guard-${m.role}"><strong>${m.role === 'user' ? 'You' : 'Brain'}</strong> <span>${esc(m.content)}</span></li>`).join('');
    const max = i.maxTurns || 30;
    return `<section class="lab-guard" aria-labelledby="lab-guard-h"><h3 id="lab-guard-h" tabindex="-1">Guard rails: test your own brain</h3>
      ${!i.ready ? `<p class="muted" role="status">${esc(i.why || 'Loading…')}</p>` : `<p class="muted">Talking to <strong>${esc(i.brain)}</strong>, with its normal settings, not temperature 0, so you see what it does in use.</p>`}
      <p><label for="lab-guard-system">System prompt (what the brain is told before you speak)</label><br><textarea id="lab-guard-system" rows="3" data-guardf="system">${esc(g.system)}</textarea></p>
      <ol class="lab-guard-chat" aria-live="polite" aria-label="The conversation">${chatRows || '<li class="muted">Nothing said yet.</li>'}</ol>
      <p class="muted" id="lab-guard-turns">Turn ${turns()} of ${max}.</p>
      <p><label for="lab-guard-say">Your message</label><br><textarea id="lab-guard-say" rows="3" data-guardf="draft" aria-describedby="lab-guard-turns">${esc(g.draft)}</textarea></p>
      <div class="row"><button type="button" class="get" data-guard="send" ${i.ready && !g.busy && turns() < max ? '' : 'disabled'}>${g.busy ? 'Waiting for the brain…' : 'Send'}</button>
        <button type="button" class="link" data-guard="page">Try "When the page lies"</button>
        <button type="button" class="link" data-guard="clear" ${g.messages.length ? '' : 'disabled'}>Start again</button></div>
      ${g.messages.length && i.canSave ? `<fieldset><legend>Save as lesson</legend>
        <p><label for="lab-guard-want">The answer you wanted, instead of its last reply</label><br><textarea id="lab-guard-want" rows="3" data-guardf="want">${esc(g.want)}</textarea></p>
        <label class="lab-opt"><input type="radio" name="lab-guard-job" value="refusals" data-guardjob ${g.job === 'refusals' ? 'checked' : ''}> <span>It should have said no (a refusals lesson)</span></label>
        <label class="lab-opt"><input type="radio" name="lab-guard-job" value="recover" data-guardjob ${g.job === 'recover' ? 'checked' : ''}> <span>It should have done the task and ignored the planted order (a recover lesson)</span></label>
        ${isPro() ? `<p class="row"><label for="lab-guard-setting">Setting</label> <select id="lab-guard-setting" data-guardf="setting"><option value="">Not tagged</option>${Object.entries(i.settings || {}).map(([k, l]) => `<option value="${esc(k)}" ${g.setting === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select>
          <label for="lab-guard-style">How its reply sounded</label> <select id="lab-guard-style" data-guardf="style"><option value="">Not tagged</option><option value="plain" ${g.style === 'plain' ? 'selected' : ''}>Plain</option>${Object.entries(i.styles || {}).map(([k, l]) => `<option value="${esc(k)}" ${g.style === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></p>
          <p class="muted">Tags help you find lessons later, and a refusals lesson tagged with a setting is counted under it when Guard rails checks "Held the line".</p>` : ''}
        <div class="row"><button type="button" class="get" data-guard="save">Save as lesson</button></div>
        <p class="muted">It goes into your lesson set "Guard rails practice". Your refusal lessons are also what the Guard rails challenge checks under "Held the line".</p></fieldset>` : ''}
      ${g.msg ? `<p role="status">${esc(g.msg)}</p>` : ''}
      <div class="row"><button type="button" class="link" data-guard="close">Close the sandbox</button></div></section>`;
  }

  // Typing in a box: keep the words without redrawing (so the cursor stays put). True if it was ours.
  function input(el) { const f = el?.dataset?.guardf; if (!f) return false; g[f] = String(el.value || ''); return true; }
  function change(el) { if (el?.dataset && 'guardjob' in el.dataset) { g.job = el.value === 'recover' ? 'recover' : 'refusals'; return true; } return input(el); }
  async function click(b) {
    const k = b?.dataset?.guard; if (!k) return false;
    g.msg = '';
    if (k === 'open') { g.open = true; await load(); return 'draw'; }
    if (k === 'close') { g.open = false; return 'draw'; }
    if (k === 'clear') { g.messages = []; g.want = ''; return 'draw'; }
    if (k === 'page') { g.draft = g.info?.demo || ''; g.job = 'recover'; return 'draw'; }
    if (k === 'send') {
      const say = g.draft.trim(); if (!say) { g.msg = 'Type a message first.'; return 'draw'; }
      g.messages.push({ role: 'user', content: say }); g.draft = ''; g.busy = true;
      try { const r = await api('/api/lab/guard/chat', { system: g.system, messages: g.messages }); if (r.ok) g.messages.push({ role: 'assistant', content: r.text || '(no answer)' }); else { g.msg = r.why || 'The brain didn\'t answer.'; g.messages.pop(); g.draft = say; } } catch (e) { g.msg = e.message; g.messages.pop(); g.draft = say; }
      g.busy = false; return 'draw';
    }
    if (k === 'save') {
      try { const r = await api('/api/lab/guard/save', { system: g.system, messages: g.messages, want: g.want, job: g.job, ...(isPro() ? { setting: g.setting, style: g.style } : {}) }); g.msg = `Saved. "Guard rails practice" has ${r.count} lesson${r.count === 1 ? '' : 's'} now.`; g.want = ''; } catch (e) { g.msg = e.message; }
      return 'draw';
    }
    return false;
  }
  return { html, input, change, click, load };
}
