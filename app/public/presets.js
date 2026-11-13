// Assistant presets (src/presets.js). Two parts:
//  - Settings, Bob himself, 🎭 Assistant presets: the switch (off unless you turn it on) and the presets themselves.
//    Everything shows and can be edited while the switch is off; presets only take effect once it's on.
//  - The chat page: the 🎭 Preset menu next to Effort picks one for the chat you're in. It shows while the switch is
//    on and there's at least one preset. Picking one with a starting effort moves the Effort button to it.
import { esc } from './util.js';

const EFFORT_NAMES = { low: 'Low', medium: 'Medium', high: 'High', extreme: 'Extreme' };
const post = async (url, data) => {
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
};
const get = async (url) => (await fetch(url)).json();

// A preset in one line, for the menu's tip and the closed row in Settings.
export function presetSummary(p, brainName = (b) => b) {
  const bits = [];
  if (p.brain) bits.push(`brain: ${brainName(p.brain)}`);
  if (p.effort) bits.push(`starts at ${EFFORT_NAMES[p.effort]} effort`);
  if (p.temperature !== null && p.temperature !== undefined) bits.push(`temperature ${p.temperature}`);
  bits.push(p.tools === 'none' ? 'talking only, no tools' : Array.isArray(p.tools) ? `${p.tools.length} tool group${p.tools.length === 1 ? '' : 's'}` : 'tools as usual');
  return bits.join(' · ');
}

function presetHtml(p, view, open) {
  const mode = p.tools === 'none' ? 'none' : Array.isArray(p.tools) ? 'only' : 'usual';
  const picked = new Set(Array.isArray(p.tools) ? p.tools : []);
  const brains = view.brains || [];
  const brainMissing = p.brain && !brains.includes(p.brain);
  const radio = (v, label) => `<label class="inline"><input type="radio" name="ptools-${esc(p.id)}" value="${v}" data-pf="tools" ${mode === v ? 'checked' : ''}> ${label}</label>`;
  return `<details class="preset-item" data-preset="${esc(p.id)}" ${open ? 'open' : ''}>
    <summary><strong data-pname>${esc(p.name)}</strong> <span class="muted small">${esc(presetSummary(p))}</span></summary>
    <div class="preset-fields">
      <label class="pick"><strong>Name</strong> <input type="text" data-pf="name" maxlength="40" value="${esc(p.name)}" aria-label="Preset name"></label>
      <label class="pick block"><strong>Instructions</strong>
        <textarea data-pf="instructions" rows="5" maxlength="4000" aria-describedby="pinst-${esc(p.id)}" placeholder="For example: You're my writing coach. Keep answers short, point out weak sentences and suggest one fix each.">${esc(p.instructions)}</textarea></label>
      <p class="muted small" id="pinst-${esc(p.id)}">What Bob does or how he talks in chats with this preset, in your own words. His honesty, safety and asking first never change.</p>
      <label class="pick"><strong>Brain</strong> <select data-pf="brain" aria-label="Brain for this preset">
        <option value="">Bob's usual brain</option>
        ${brains.map((b) => `<option value="${esc(b)}" ${p.brain === b ? 'selected' : ''}>${esc(b)}</option>`).join('')}
        ${brainMissing ? `<option value="${esc(p.brain)}" selected>${esc(p.brain)} (not in a slot now: Bob uses his usual brain)</option>` : ''}
      </select></label>
      <p class="muted small">Only brains already in Bob's slots (Settings, Brains). Used at Low effort in the Normal session; Medium and up, and the other sessions, keep their own.</p>
      <label class="pick"><strong>Starting effort</strong> <select data-pf="effort" aria-label="Starting effort">
        <option value="">Leave Effort as it is</option>
        ${Object.entries(EFFORT_NAMES).map(([v, n]) => `<option value="${v}" ${p.effort === v ? 'selected' : ''}>${n}</option>`).join('')}
      </select></label>
      <label class="pick"><strong>Temperature</strong> <input type="number" data-pf="temperature" min="0" max="2" step="0.1" value="${p.temperature ?? ''}" placeholder="usual" aria-label="Temperature, 0 to 2. Empty: the brain's usual" style="width:6em"></label>
      <p class="muted small">How adventurous his wording is: 0 is steady and the same each time, 1 and up is more varied. Leave it empty for the brain's usual. Brains on this replicant matrix only.</p>
      <fieldset class="preset-tools"><legend><strong>Tools</strong></legend>
        ${radio('usual', 'As usual')} ${radio('only', 'Only these')} ${radio('none', 'Talking only (no tools)')}
        <div class="preset-groups">${(view.groups || []).map((g) => `<label class="inline"><input type="checkbox" data-pgroup="${esc(g.id)}" ${picked.has(g.id) ? 'checked' : ''}> ${esc(g.label)}</label>`).join('')}</div>
        <p class="muted small">The ticks count when <strong>Only these</strong> is picked. A preset never switches a tool on: Hands and other switches that are off stay off. With Only these or Talking only, Bob doesn't hand the job to his copies either.</p>
      </fieldset>
      <div class="row"><button type="button" data-psave>Save</button><button type="button" class="mini" data-premove>Remove</button><span class="muted small" data-pmsg aria-live="polite"></span></div>
    </div>
  </details>`;
}

export function presetsSettingsHtml(view) {
  const list = view?.list || [];
  return `<label class="switch srow-switch"><input type="checkbox" data-presets-on ${view?.on ? 'checked' : ''}><span><strong>Assistant presets for chats</strong><span class="muted"> Save sets of instructions, brain, starting effort, temperature and tools, then pick one for any chat from 🎭 Preset next to Effort. A chat with no preset is plain Bob.</span></span></label>
    <div class="preset-list">${list.length ? list.map((p) => presetHtml(p, view, false)).join('') : '<p class="muted">No presets yet.</p>'}</div>
    <div class="row"><button type="button" data-padd>Add a preset</button><span class="muted small" data-pmsg-top aria-live="polite"></span></div>`;
}

// Reads one preset back from its fields.
function readPreset(el) {
  const f = (k) => el.querySelector(`[data-pf="${k}"]`);
  const mode = el.querySelector('[data-pf="tools"]:checked')?.value || 'usual';
  const t = f('temperature').value.trim();
  return {
    id: el.dataset.preset, name: f('name').value, instructions: f('instructions').value, brain: f('brain').value, effort: f('effort').value,
    temperature: t === '' ? null : Number(t),
    tools: mode === 'none' ? 'none' : mode === 'only' ? [...el.querySelectorAll('[data-pgroup]:checked')].map((x) => x.dataset.pgroup) : 'usual'
  };
}

export function mountPresets(box) {
  if (!box || box.dataset.mounted) return;
  box.dataset.mounted = '1';
  let view = { on: false, list: [], brains: [], groups: [] };
  const draw = (openId = '') => {
    box.innerHTML = presetsSettingsHtml(view);
    if (openId) box.querySelector(`[data-preset="${CSS.escape(openId)}"]`)?.setAttribute('open', '');
  };
  const say = (el, t) => { const m = el?.querySelector('[data-pmsg]') || box.querySelector('[data-pmsg-top]'); if (m) m.textContent = t; };
  get('/api/presets').then((v) => { view = v; draw(); }).catch(() => { box.innerHTML = '<p class="muted">Couldn\'t load the presets.</p>'; });
  // Every preset as it stands on the page, so saving one never loses unsaved typing in another.
  const pageList = () => [...box.querySelectorAll('[data-preset]')].map((el) => readPreset(el));
  async function save(list, openId, msg) {
    try { view = await post('/api/presets', { list }); draw(openId); say(box.querySelector(`[data-preset="${CSS.escape(openId || '')}"]`), msg); window.dispatchEvent(new CustomEvent('bob-presets')); }
    catch (e) { say(null, e.message); }
  }
  box.addEventListener('change', async (e) => {
    if (!e.target.matches('[data-presets-on]')) return;
    try { view = await post('/api/presets', { on: e.target.checked }); draw(); say(null, view.on ? 'On. Pick a preset for a chat from 🎭 Preset next to Effort.' : 'Off. Every chat is plain Bob; your presets are kept.'); window.dispatchEvent(new CustomEvent('bob-presets')); }
    catch (err) { e.target.checked = !e.target.checked; say(null, err.message); }
  });
  box.addEventListener('click', async (e) => {
    if (e.target.closest('[data-padd]')) {
      const list = pageList();
      const id = 'p' + [...crypto.getRandomValues(new Uint8Array(4))].map((b) => b.toString(16).padStart(2, '0')).join('');
      list.push({ id, name: `Preset ${list.length + 1}`, instructions: '', brain: '', effort: '', temperature: null, tools: 'usual' });
      await save(list, id, 'Added. Give it a name and instructions, then Save.');
      box.querySelector(`[data-preset="${id}"] [data-pf="name"]`)?.focus();
      return;
    }
    const item = e.target.closest('[data-preset]');
    if (!item) return;
    if (e.target.closest('[data-psave]')) return save(pageList(), item.dataset.preset, 'Saved.');
    if (e.target.closest('[data-premove]')) {
      const name = item.querySelector('[data-pf="name"]').value || 'this preset';
      const btn = e.target.closest('[data-premove]');
      // Two presses, no pop-up: the first asks, the second removes.
      if (!btn.dataset.sure) { btn.dataset.sure = '1'; btn.textContent = `Remove ${name}? Press again`; return; }
      return save(pageList().filter((p) => p.id !== item.dataset.preset), '', `Removed ${name}. Chats that used it are plain Bob again.`);
    }
  });
}

// ---- The 🎭 Preset menu on the chat page ----
export function createPresetPicker({ note, effort, session }) {
  const wrap = document.getElementById('presetPick'), sel = document.getElementById('presetSel');
  if (!wrap || !sel) return { load() {} };
  let view = { on: false, list: [], picked: '' };
  function draw() {
    const show = view.on && view.list.length > 0;
    wrap.hidden = !show;
    if (!show) return;
    sel.innerHTML = `<option value="">None (plain Bob)</option>${view.list.map((p) => `<option value="${esc(p.id)}" ${p.id === view.picked ? 'selected' : ''}>${esc(p.name)}</option>`).join('')}`;
    const p = view.list.find((x) => x.id === view.picked);
    wrap.dataset.tip = p ? `This chat uses ${p.name}: ${presetSummary(p)}.` : 'Pick a saved preset for this chat. Make them in Settings, Bob himself.';
    wrap.classList.toggle('on', Boolean(p));
  }
  const startEffort = (p) => { if (p?.effort && effort && !effort.locked()) effort.set(p.effort); };
  async function load({ apply = true } = {}) {
    try { view = await get('/api/presets?session=' + encodeURIComponent(session())); } catch { view = { on: false, list: [], picked: '' }; }
    draw();
    if (apply) startEffort(view.list.find((x) => x.id === view.picked));
  }
  sel.addEventListener('change', async () => {
    try {
      const r = await post('/api/presets/pick', { sessionId: session(), id: sel.value });
      view.picked = r.picked; draw();
      if (r.preset) { startEffort(r.preset); note(`This chat uses the ${r.preset.name} preset now${r.preset.effort ? `, starting at ${EFFORT_NAMES[r.preset.effort]} effort` : ''}.`); }
      else note('This chat is plain Bob again.');
    } catch (e) { note(e.message, 'error'); load({ apply: false }); }
  });
  window.addEventListener('bob-presets', () => load({ apply: false }));
  window.addEventListener('focus', () => load({ apply: false })); // presets changed in the Settings window
  load();
  return { load };
}
