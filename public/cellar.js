// The cellar: Bob's model shop and settings. Every download starts from a click here, with its size shown first.
import { setLook } from './bob-sprite.js';
import { progressHtml, animateWorkers } from './progress.js';
import { createStylePage } from './style-page.js';
import { createSampler, sampleButton, sampleHint } from './voice-samples.js';
import { equipHtml, allSlots, HELPERS, equipped, entryOf, packFor, starterTicks, starterPlan, enginesFor, readyPlan, slotValue, slotTakes, isActive, tipHtml, readyList, readyDefaults, readyToggle, readyOrder, CHEST_SHOW } from './equip.js';
import { suit as fitSuit, picksOf, unsuited, jobNames, SLOT_NAMES, canDo, packsFor } from './fit.js';
import { catalogueHtml, familyOf } from './catalogue.js';
import { drawBob } from './bob-sprite.js';
import { handsSettingsHtml, mountHandsSettings } from './hands.js';
import { quarantineSettingsHtml, mountQuarantineSettings } from './quarantine.js';
import { phoneAccessHtml, mountPhoneAccess } from './phone-access.js';
import { telegramHtml, mountTelegram } from './telegram.js';
import { checkinsHtml, mountCheckins } from './checkins.js';
import { adventureSettingsHtml, mountAdventureSettings } from './adventure.js';
import { gamesSettingsHtml, mountGamesSettings } from './games.js';
import { shareBrainsHtml, mountShareBrains } from './share-brains.js';
import { findTheme } from './themes.js';
import { tip, noteOrTip, stripTags, keep } from './tips.js';
import { attributesHtml, cleanPersonality, greeting, PRESETS, DEFAULTS, isDefault } from './personality.js';
import { esc, gb } from './util.js';

const $ = (id) => document.getElementById(id);

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

export function createCellar() {
  const dlg = $('cellar');
  let speedModel = '';
  let speedRuns = [];
  let rent = { services: [], rentals: [], caps: {}, running: [], leftover: [], recent: [] }; // 1.5.127 rented brains
  let data = null, hw = null, settings = null, roles = null, cloud = [], caps = {}, bctx = { on: false, brains: [] }, tab = 'roles', job = null, mode = 'shop', voices = [];
  const sampler = createSampler();
  const live = new Map(); // downloads running now (one or two), by id
  const stylePage = createStylePage({
    api,
    redraw: () => draw(),
    flash: (msg) => { const p = document.createElement('p'); p.className = 'have'; p.textContent = msg; $('cellar-body').prepend(p); setTimeout(() => p.remove(), 4000); }
  });

  // How well a model suits this PC (public/fit.js): ok, slow, no or blocked, each with a plain reason.
  const hwNow = () => ({ vramGB: hw?.vramGB, ramGB: hw?.ramGB, freeGB: hw?.freeGB, arm: hw?.board === 'arm' });
  const suit = (m) => fitSuit(m, hwNow(), settings?.platform);
  // Bob's pick for each job on this PC, and whether models that don't suit it are shown (off unless you turn it on).
  const pickCtx = () => ({ ...hwNow(), arm: hw?.board === 'arm', packs: data?.packs || [], platform: settings?.platform });
  const picks = (m) => picksOf(m, data.models, pickCtx());
  let showUnsuited = (() => { try { return localStorage.getItem('bob-show-unsuited') === '1'; } catch { return false; } })();
  const setShowUnsuited = (on) => { showUnsuited = on; try { localStorage.setItem('bob-show-unsuited', on ? '1' : '0'); } catch {} };

  // Jobs Bob can already do another way: the model is an optional upgrade, not something missing.
  function covered(m) {
    if (m.status.state === 'installed') return '';
    if (m.category === 'voice' && caps.hearing) return 'recommended: faster replies after voice notes. I already hear you, but through a model that pushes my brain out of the graphics card; this one listens on the processor';
    return '';
  }

  // A model whose files are here but whose engine isn't: say so plainly, with the Get button right there.
  const ENGINE_SIZE = { kokoro: 'about 100 MB', chatterbox: 'about 4 GB to set up', piper: 'about 25 MB', audio: 'about 6 GB', llamacpp: 'about 20 to 600 MB', sdcpp: 'about 20 to 600 MB', whispercpp: 'about 20 to 600 MB' };
  const engineById = (id) => (data?.engines || []).find((e) => e.id === id);
  function engineStep(eng, what = 'Downloaded') {
    if (!eng || eng.installed) return '';
    if (live.has('engine:' + eng.id)) return `<div class="engine-step">${progress(live.get('engine:' + eng.id))}</div>`;
    if (eng.available === false) return `<p class="muted">${esc(what)}. ${esc(eng.note || `${eng.name} doesn't run on this replicant matrix yet.`)}</p>`;
    return `<div class="model engine-step"><p><strong>${esc(what)}. One more step:</strong> get the ${esc(eng.name)} engine${ENGINE_SIZE[eng.id] ? ` (${ENGINE_SIZE[eng.id]})` : ''}, which runs it.</p><button class="get" data-engine="${esc(eng.id)}">Get ${esc(eng.name)}</button><div class="confirm" hidden></div></div>`;
  }

  function action(m) {
    const s = m.status;
    if (live.has(m.id)) return progress(live.get(m.id));
    const waiting = (data.downloads || []).find((d) => d.id === m.id && ['queued', 'paused', 'failed'].includes(d.state));
    if (waiting) return `<div class="muted">${waiting.state === 'queued' ? 'Waiting its turn in Downloads.' : waiting.state === 'paused' ? 'Paused in Downloads.' : 'Failed: see Downloads.'}</div><button data-opendl>Open Downloads</button>`;
    if (s.state === 'installed') {
      const where = s.where.length ? `On this replicant matrix (${esc(s.where.join(', '))})` : 'On this replicant matrix';
      const eng = m.needs && (data.engines || []).find((e) => e.name === m.needs);
      return `<div class="have">✓ ${where}</div>${m.use ? `<button data-use="${esc(m.id)}">Use this</button>` : ''}${engineStep(eng)}`;
    }
    if (m.gated) return `<div class="muted"><span class="tag warn">needs a Hugging Face account</span> ${esc(m.gatedWhy || '')}</div>`;
    if (!s.canDownload) return `<div class="muted">Needs Ollama running to download. Start Ollama, then press Check again.</div><button type="button" data-recheck>Check again</button>`;
    const part = s.state === 'partial' ? ' (some files are already here)' : '';
    const fit = suit(m);
    if (fit.level === 'blocked') return `<div class="muted">Can't install on this replicant matrix: ${esc(fit.why)}</div>`;
    if (fit.level !== 'ok' && picks(m).length) return `<div class="muted">${esc(fit.why)}</div><button class="get" data-get="${esc(m.id)}">Download ${gb(m.sizeGB)}${part}</button>`;
    if (fit.level !== 'ok') return `<div class="muted">${esc(fit.why)}</div><button class="link" data-anyway="${esc(m.id)}">Download anyway</button>`;
    return `<button class="get" data-get="${esc(m.id)}">Download ${gb(m.sizeGB)}${part}</button>`;
  }

  // 1.5.56: the Brain catalogue's button for a model that isn't here: a short Get (the size is on the row, and the
  // download still asks first), or the same progress and notes as the model pages while it's going.
  function catAction(m) {
    const waiting = (data.downloads || []).some((d) => d.id === m.id && ['queued', 'paused', 'failed'].includes(d.state));
    if (live.has(m.id) || waiting || m.gated || !m.status.canDownload || m.status.state === 'partial') return action(m);
    const fit = suit(m);
    if (fit.level === 'blocked') return '<span class="tag bad">Can\'t install here</span>';
    if (fit.level !== 'ok' && !picks(m).length) return `<button class="link" data-anyway="${esc(m.id)}">Get anyway</button>`;
    return `<button class="get" data-get="${esc(m.id)}">Get</button>`;
  }
  function progress(j = job) { animateWorkers(); return progressHtml(j); }

  function cardSample(m) {
    if (m.use?.tts?.provider === 'kokoro') return kokoroGrid(false);
    const v = voices.find((x) => x.catalogId === m.id);
    if (!v || v.have === 'none') return '';
    return `<p class="sample-row">${hear(v.engine, v.voice)}${v.have === 'online' ? ` <span class="muted">from ${esc(v.source)}</span>` : ''}</p>`;
  }

  function card(m) {
    const lic = m.commercial ? esc(m.license) : `${esc(m.license)} · personal use only`;
    const eng = m.needs && (data.engines || []).find((e) => e.name === m.needs);
    // 1.5.37: a missing engine can be got right here, next to what needs it.
    const nm = eng?.id === 'audio' ? 'the audio tools' : m.needs;
    const needs = m.needs ? (eng && !eng.installed ? `<span class="tag warn">needs ${esc(nm)} first</span>${eng.available === false ? '' : `<button type="button" class="get" data-engine="${esc(eng.id)}">Get ${esc(nm)}</button>`}` : `<span class="tag">uses ${esc(m.needs)}</span>`) : '';
    // Size hints only; "Recommended" (below) is what says which model to pick on this PC.
    const pick = { small: 'Light', tiny: 'Tiny', optional: 'Optional' }[m.pick] || '';
    const fit = suit(m);
    const mine = picks(m);
    // Three separate things: Bob's pick for a job on this PC (★), fits the card (quiet), or doesn't suit (with why).
    const badge = covered(m) ? '<span class="tag good">Faster replies after voice notes</span>'
      : mine.length ? `<span class="tag rec">★ Recommended for your replicant matrix: ${esc(mine.map((id) => SLOT_NAMES[id]).join(', '))}</span>`
      : fit.level === 'ok' ? (fit.fits ? `<span class="tag">${hw?.gpu?.integrated ? 'Fits your replicant matrix' : hw?.gpu?.unified ? 'Fits your Mac' : 'Fits your card'}</span>` : '')
      : fit.level === 'blocked' ? '<span class="tag bad">Can\'t install on this replicant matrix</span>' : '<span class="tag warn">Doesn\'t suit this replicant matrix</span>';
    const dim = fit.level !== 'ok' && !mine.length && m.status.state !== 'installed' ? ' dim' : '';
    const jobs = jobNames(m);
    return `<article class="model${dim}" id="m-${esc(m.id)}">
      <header><strong>${esc(m.name)}</strong>${pick ? `<span class="tag">${pick}</span>` : ''}</header>
      <p>${esc(m.what)}</p>
      ${jobs.length ? `<p class="muted jobs-line">Can do: ${esc(jobs.join(', '))}</p>` : ''}
      <div class="facts"><span>${m.into ? `about ${gb(m.sizeGB)}, one time` : `${gb(m.sizeGB)} download`}</span>${m.vramGB ? `<span>wants ${m.vramGB} GB graphics memory</span>` : '<span>runs on the processor</span>'}<span>${lic}</span>${badge}${needs}</div>
      ${m.category === 'speech' ? cardSample(m) : ''}
      <div class="act">${action(m)}</div>
      <div class="confirm" hidden></div>
    </article>`;
  }

  function extrasHtml(kind = tab) {
    const ex = data.extras.filter((f) => kind === 'found' || f.kind === kind);
    if (!ex.length) return '';
    return `<h3>Also on this replicant matrix</h3><p class="muted">Bob found these in other apps. He can use the ones his painter understands; Maestro's own video models still need Maestro.</p>
      <ul class="found">${ex.map((f) => `<li><span>${esc(f.name)}</span><span class="muted">${esc(f.owner)} · ${gb(f.size / 1e9)}</span></li>`).join('')}</ul>`;
  }

  // Model categories that share a page, each as a subsection (1.1.2). The old tab ids still work:
  // opening "speech" lands on Voice & conversation, at Bob's voice.
  const GROUPS = [
    { id: 'talk', label: 'Voice & conversation', icon: '💬', parts: ['chat', 'voice', 'speech'], what: 'How Bob talks, listens and plans: his everyday brain, hearing your voice, and his own voice.' },
    { id: 'media', label: 'Pictures & video', icon: '🎨', parts: ['images', 'video'], what: 'The painter\'s corner: making and editing pictures, and short clips.' }
  ];
  const SUB_LABEL = { chat: 'Planning and talking (his everyday brain)', voice: 'Hearing you', speech: 'Talking (Bob\'s voice)', images: 'Pictures', video: 'Video' };
  const groupOf = (id) => GROUPS.find((g) => g.parts.includes(id));
  let jumpTo = '';
  function setTab(id) { const g = groupOf(id); tab = g ? g.id : id; jumpTo = g ? id : ''; }
  // A category's models: Bob's picks first, then what fits, then the rest. Downloads that don't suit this PC
  // wait behind "Show models that don't suit this PC".
  function modelList(id) {
    const rank = (m) => (picks(m).length ? 0 : suit(m).level === 'ok' ? 1 : 2);
    const all = data.models.filter((m) => m.category === id).sort((a, b) => rank(a) - rank(b));
    const hide = all.filter((m) => unsuited(m, picks(m), suit(m)) && !live.has(m.id));
    const shown = showUnsuited ? all : all.filter((m) => !hide.includes(m));
    const note = hide.length ? `<p class="muted unsuited-note">${showUnsuited ? `Showing ${hide.length} that ${hide.length === 1 ? 'doesn\'t' : 'don\'t'} suit this replicant matrix.` : `${hide.length} more ${hide.length === 1 ? 'doesn\'t' : 'don\'t'} suit this replicant matrix.`} <button type="button" class="link" data-unsuited>${showUnsuited ? 'Hide them' : 'Show them'}</button></p>` : '';
    return shown.map(card).join('') + note;
  }
  function catBody(id) {
    const cat = data.categories.find((c) => c.id === id);
    return `${modelList(id)}${extrasHtml(id)}`.trim() || `<p class="muted">Nothing in ${esc(cat?.label || id)} yet.</p>`;
  }
  // Bob's picks for every job on this PC, one line per model ("Gemma 4 26B: Brain, Deep thinking, Coding").
  function picksSummary() {
    const rows = data.models.map((m) => [m, picks(m)]).filter(([, p]) => p.length);
    if (!rows.length) return '';
    return `<details class="fit-sum"><summary>Bob's picks for this replicant matrix (${rows.length} models)</summary><ul class="fit-picks">${rows.map(([m, p]) => `<li><button type="button" class="link" data-gomodel="${esc(m.id)}" data-gocat="${esc(m.category)}">${esc(m.name)}</button>: ${esc(p.map((id) => SLOT_NAMES[id]).join(', '))}${m.status.state === 'installed' ? ' <span class="muted">(on this replicant matrix)</span>' : ''}</li>`).join('')}</ul></details>`;
  }
  // An ON/OFF pill switch like Read aloud and Alerts: the whole row is the button.
  // 1.5.56: the hint shows in the bubble when you point at, Tab to or press and hold the switch.
  const pillSwitch = (key, on, label, hint) => `<button type="button" class="pill-switch" role="switch" aria-checked="${on}" data-${key}${hint ? ` data-tip="${esc(hint)}"` : ''}><span class="ps-text"><strong>${esc(label)}</strong></span><span class="st">${on ? 'On' : 'Off'}</span></button>`;
  // Top of every model page: what Bob judged this PC by, what the badges mean, and the switch.
  function fitBanner() {
    // Same detection as Now running and the Settings footer; a size set by hand in Bob's settings says so.
    // A Mac: one memory pool shared with graphics, and models are sized against the part macOS lets graphics use.
    const card = hw?.gpu?.unified ? `${esc(hw.gpu.name.replace(/ \(shared memory\)$/, ''))}, memory shared with graphics (about ${hw.gpu.vramGB} GB of it for models)` : hw?.gpu ? `${esc(hw.gpu.name)} (${hw.gpu.vramGB} GB graphics memory)` : hw?.vramGB ? `a ${hw.vramGB} GB graphics card (set in Bob's settings; not detected right now)` : 'no graphics card found';
    return `<div class="fit-banner"><p><strong>Picked for this replicant matrix:</strong> <span class="muted spec">${hw?.spec ? esc(hw.spec) : `${card}${hw?.ramGB ? `, ${hw.ramGB} GB RAM` : ''}`}</span>. <button type="button" class="mini help-link" data-help="recommended" aria-label="Help: how Bob picks models">? How Bob picks</button></p>
      ${picksSummary()}
      <p class="muted"><span class="tag rec">★ Recommended</span>: Bob's pick for that job on your replicant matrix. <span class="tag">${hw?.gpu?.integrated ? 'Fits your replicant matrix' : hw?.gpu?.unified ? 'Fits your Mac' : 'Fits your card'}</span>: also runs well here, just not the first pick.</p>
      ${pillSwitch('unsuitedsw', showUnsuited, 'Show models that don\'t suit this replicant matrix', 'Off unless you turn it on. Each one says why it doesn\'t suit.')}</div>`;
  }
  function groupHtml(g) {
    const parts = g.parts.filter((id) => data.categories.some((c) => c.id === id));
    return `${fitBanner()}<p class="muted">${esc(g.what)}</p>
      <nav class="subnav" aria-label="Sections">${parts.map((id) => `<button type="button" data-jump="${id}">${esc(SUB_LABEL[id] || id)}</button>`).join('')}</nav>
      ${parts.map((id) => { const cat = data.categories.find((c) => c.id === id); return `<section class="subsection" id="sub-${id}"><h3>${cat.icon || ''} ${esc(SUB_LABEL[id] || cat.label)}</h3><p class="muted">${esc(cat.what)}</p>${id === 'speech' ? `<div class="settings voice-settings">${voiceHtml()}</div>` : ''}${catBody(id)}</section>`; }).join('')}`;
  }

  function shopHtml() {
    if (groupOf(tab)) setTab(tab);
    const cats = [], seen = new Set();
    for (const c of data.categories) { const g = groupOf(c.id); const item = g || c; if (!seen.has(item.id)) { seen.add(item.id); cats.push(item); } }
    const tabs = [{ id: 'roles', label: 'Equip Bob', icon: '🧰' }, { id: 'catalogue', label: 'Brain catalogue', icon: '📚' }, ...cats, { id: 'found', label: 'On this replicant matrix', icon: '🔎' }, { id: 'style', label: 'Style', icon: '🎨' }, { id: 'settings', label: 'Settings', icon: '⚙' }];
    // 1.5.117: two labelled rows, so Settings and Style don't read as the last two "Get models" pages.
    const tabBtn = (c) => `<button role="tab" aria-selected="${c.id === tab}" data-tab="${c.id}">${c.icon} ${esc(c.label)}</button>`;
    const setup = new Set(['style', 'settings']);
    const bar = `<nav class="tabs cellar-tabs" role="tablist" aria-label="Get models, Style and Settings pages"><span class="tabs-row"><span class="tabs-label" aria-hidden="true">Get models:</span>${tabs.filter((c) => !setup.has(c.id)).map(tabBtn).join('')}</span><span class="tabs-row"><span class="tabs-label" aria-hidden="true">Set up:</span>${tabs.filter((c) => setup.has(c.id)).map(tabBtn).join('')}</span></nav>`;
    let body = '';
    if (tab === 'settings') body = settingsHtml();
    else if (tab === 'style') body = stylePage.html(settings);
    else if (tab === 'roles') body = eqView === 'list' ? `<p><button type="button" class="link" data-eqview="doll">Back to Equip Bob</button></p>${rolesHtml()}` : (roles ? equipHtml(eqCtx()) : '<p class="muted">Loading...</p>');
    else if (tab === 'catalogue') body = roles ? catalogueHtml({ ...eqCtx(), action: catAction, focus: catFocus }) : '<p class="muted">Loading...</p>'; // 1.5.56
    else if (tab === 'found') body = `<p class="muted">Scanned ${data.scannedAt ? new Date(data.scannedAt).toLocaleString() : 'never'}. <button data-scan>Look again</button></p>${extrasHtml() || '<p>Nothing extra found.</p>'}`;
    else if (GROUPS.some((g) => g.id === tab)) body = groupHtml(GROUPS.find((g) => g.id === tab));
    else {
      const cat = data.categories.find((c) => c.id === tab);
      body = `${fitBanner()}<p class="muted">${esc(cat?.what)}</p>${modelList(tab)}${extrasHtml()}`;
    }
    return `${bar}<div class="pane">${body}</div>`;
  }

  function rolesHtml() {
    if (!roles) return '<p class="muted">Loading...</p>';
    // 1.5.56: only active models that can do the job are listed (the Brain catalogue's Active switches); what's picked
    // now always stays. Get more opens the catalogue at that job.
    const listFor = (kind, job, cur) => (roles.options[kind] || []).filter((o) => o.value === cur || ((kind !== 'llm' || canDo(job, { entry: entryOf(data.models, o.value), name: o.value, caps: o.caps }))
      && isActive({ entry: entryOf(data.models, o.value), value: o.value, installed: true }, settings.activeModels)));
    // 1.5.101: brain menus group their choices by family (Qwen, Gemma...), the same families as the Brain catalogue.
    // Only when there are two or more families; brains Bob doesn't know go under Other brains.
    const optsHtml = (list, cur, kind = 'llm') => {
      const one = (o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(o.label)}</option>`;
      if (kind !== 'llm') return list.map(one).join('');
      const groups = new Map();
      for (const o of list) { const e = o.value && entryOf(data.models, o.value); const f = e ? familyOf(e) : o.value ? 'Other brains' : ''; if (!groups.has(f)) groups.set(f, []); groups.get(f).push(o); }
      if (groups.size < 2) return list.map(one).join('');
      return [...groups].map(([f, os]) => (f ? `<optgroup label="${esc(f)}">${os.map(one).join('')}</optgroup>` : os.map(one).join(''))).join('');
    };
    const getMore = (job) => `<button type="button" class="mini get-more-btn" data-catjob="${esc(job)}">📚 Get more</button>`;
    const row = (j) => {
      const cur = roles.current[j.id] || '';
      const opts = listFor(j.kind, j.id, cur);
      const list = opts.length ? opts : [{ value: '', label: 'Not available on this replicant matrix yet: hidden from Bob' }];
      const has = list.some((o) => o.value === cur);
      return `<tr class="${opts.length ? '' : 'dim'}"><th scope="row">${esc(j.label)} ${tipHtml(j.what, `About ${j.label}`)}</th>
        <td><select data-role="${esc(j.id)}" aria-label="${esc(j.label)}" ${opts.length ? '' : 'disabled'}>
          ${has || !cur ? '' : `<option value="${esc(cur)}" selected>${esc(entryOf(data.models, cur)?.name || cur)} (not downloaded)</option>`}
          ${cur ? '' : '<option value="" selected>Pick one</option>'}
          ${optsHtml(list, cur, j.kind)}
        </select>${getMore(j.id)}${j.id === 'speech' && cur ? nestedVoiceHtml() : ''}${!cur && opts.length && j.kind !== 'llm' ? `<div class="ready-hint"><span class="tag good">On this replicant matrix, not assigned yet</span> <button data-userole="${esc(j.id)}" data-value="${esc(opts[0].value)}">Use ${esc(opts[0].label)}</button></div>` : ''}</td></tr>`;
    };
    const thinkers = roles.jobs.filter((j) => j.kind === 'llm');
    const makers = roles.jobs.filter((j) => j.kind !== 'llm');
    return `<p class="muted">Pick which brain thinks for each job, and which model makes the pictures, clips and hearing. ${tipHtml('Using one brain for several jobs is faster; a different brain means a short swap (the brain machine), usually 10 to 20 seconds.', 'About swaps')} Only active models are listed: the <button type="button" class="link" data-tab="catalogue">📚 Brain catalogue</button> has every model, sorted by job.</p>
      <h3>Thinking (writes, plans, codes, writes prompts)</h3><table class="roles">${thinkers.map(row).join('')}</table>
      <h3>Making (does the actual work)</h3><table class="roles">${makers.map(row).join('')}</table>
      ${fold('Session brains', [['small', 'Quick'], ['gaming', 'Gaming'], ['deep', 'Deep thinking'], ['coding', 'Coding'], ['office', 'Office']].map(([k, l]) => `${l}: ${settings.sessionBrains?.[k] ? (entryOf(data.models, settings.sessionBrains[k])?.name || settings.sessionBrains[k]) : 'Bob\'s pick'}`).join(', '), `<p class="muted">Pick a session from the menu next to Bob's name. Each one keeps a set of brains that fit in your graphics card together, so there are no swaps. Art runs the small brain on the processor so the painter keeps the card.</p>
      <table class="roles">${[['small', 'Quick brain', 'The Art session', 'small'], ['gaming', 'Gaming', 'Chats on the processor while you play (Qwen3 4B Instruct 2507)', 'gaming'], ['deep', 'Deep thinking', 'Medium, High and Extreme effort', 'deep'], ['coding', 'Coding session', 'The brain used when the session is Coding. The Coding slot on the paper doll is the copy Bob hands code jobs to in any session.', 'tinker'], ['office', 'Office', 'Does everything in an Office session', 'office']].map(([k, label, what, job]) => {
        const cur = settings.sessionBrains?.[k] || '';
        const list = listFor('llm', job, cur);
        return `<tr><th scope="row">${esc(label)} ${tipHtml(what, `About ${label}`)}</th><td><select data-sbrain="${k}" aria-label="${esc(label)}">${list.some((o) => o.value === cur) || !cur ? '' : `<option value="${esc(cur)}" selected>${esc(entryOf(data.models, cur)?.name || cur)} (not downloaded)</option>`}${optsHtml(list, cur)}</select>${getMore(job)}</td></tr>`;
      }).join('')}</table>`)}
      ${fold('How much each session keeps in mind', (settings.sessions || []).map((x) => `${x.label}: ${settings.sessionCtx?.[x.id] ? `${settings.sessionCtx[x.id] / 1024}K` : 'Default'}`).join(', '), `<p class="muted">Context (how much he keeps in mind): more lets Bob read longer files and chats, but uses more graphics memory and loads slower. Default uses the engine's own setting.</p>
      <table class="roles">${(settings.sessions || []).map((x) => `<tr><th scope="row">${x.icon} ${esc(x.label)}</th><td><select data-sctx="${esc(x.id)}" aria-label="${esc(x.label)} context"><option value="">Default${({ normal: ' (32K)', light: ' (32K)', art: ' (32K)', office: ' (64K)' })[x.id] || ' (engine\'s own)'}</option>${[8192, 16384, 32768, 65536, 131072, 262144].map((v) => `<option value="${v}" ${settings.sessionCtx?.[x.id] === v ? 'selected' : ''}>${v / 1024}K${v === 262144 ? ' (slow to read when it\'s full)' : ''}</option>`).join('')}</select></td></tr>`).join('')}</table>`)}
      <div data-bctxbox>${brainCtxHtml()}</div>
      <p class="muted">Missing something? Press 📚 Get more next to it.</p>`;
  }

  // 1.5.87: how much each brain keeps in mind, per brain. Off: Bob picks. On: one menu per equipped brain, listing only
  // the sizes that brain was made for (read from the model itself), with Bob's guideline under it.
  function brainCtxHtml() {
    const on = bctx?.on === true;
    const k = (v) => `${Math.round(v / 1024)}K`;
    const rows = (bctx?.brains || []).map((b) => {
      const top = b.choices.at(-1);
      const opts = b.choices.map((v) => `<option value="${v}" ${b.picked === v ? 'selected' : ''}>${k(v)}${v === top && b.max ? ' (the most it was made for)' : ''}${v === 32768 ? ' (enough for most chats)' : ''}</option>`).join('');
      return `<tr><th scope="row">${esc(b.name)} ${tipHtml(b.guide, `About ${b.name}`)}<div class="muted">${esc(b.jobs.join(', '))}</div></th><td><select data-bctx="${esc(b.model)}" aria-label="${esc(b.name)}: how much it keeps in mind"><option value="">Bob's pick (${k(b.bobPick)})</option>${opts}</select></td></tr>`;
    }).join('');
    return fold('How much each brain keeps in mind', on ? 'you pick, per brain' : 'Bob picks', `
      <label class="switch srow-switch"><input type="checkbox" data-set="brainCtxOn" ${on ? 'checked' : ''}><span><strong>Pick how much each brain keeps in mind</strong>${noteOrTip('Off to start with: Bob picks for each brain. On: pick a size for each brain you use. Each menu only lists sizes that brain was made for. A size you pick here is used for that brain everywhere, instead of the session sizes above.', 'Pick how much each brain keeps in mind')}</span></label>
      ${on ? (rows ? `<table class="roles">${rows}</table>` : '<p class="muted">No brains equipped yet.</p>') : ''}`, on);
  }

  // Bob's own voice: which Kokoro voice and how fast. Piper voices and Chatterbox are picked in Model roles.
  const voiceOf = (engine, voice) => voices.find((v) => v.engine === engine && v.voice === voice);
  const hear = (engine, voice, label) => sampleButton(engine, voice, label, sampleHint(voiceOf(engine, voice)));
  // Every Kokoro voice with a play button, so they can be compared without picking each one.
  function kokoroGrid(canUse) {
    const list = voices.filter((v) => v.engine === 'kokoro');
    if (!list.length) return '';
    const cur = settings.tts?.voice;
    return `<details class="voices"><summary>Hear all ${list.length} Kokoro voices</summary>
      ${list[0].installed ? '' : list[0].filesHere ? engineStep(engineById('kokoro'), 'Voices downloaded') + '<p class="muted">Until then only the voices that come with Bob can play.</p>' : '<p class="muted">Kokoro isn\'t set up yet: it needs the voice pack (below) and the Kokoro engine (Settings, Engines). Until then only the voices that come with Bob can play.</p>'}
      <ul class="voice-grid">${list.map((v) => `<li class="sample-row"><span>${esc(v.label)}${canUse && v.voice === cur ? ' <span class="tag good">Bob\'s voice</span>' : ''}</span>${v.have === 'none' ? `<span class="muted">${v.filesHere ? 'after the Kokoro engine' : 'needs Kokoro'}</span>` : hear('kokoro', v.voice, 'Play')}${canUse && v.voice !== cur ? `<button type="button" class="link" data-usevoice="${esc(v.voice)}">Use</button>` : ''}</li>`).join('')}</ul></details>`;
  }

  // 1.5.33: one picker for Bob's voice everywhere it's chosen: the engine, then (nested under it) the voice inside that
  // engine, with Play sample. Kokoro has 22 voices; Windows has whatever voices Windows has; each Piper voice is its own
  // download, so Piper voices are listed in the engine list itself.
  const speechNow = () => roles?.current?.speech || ({ kokoro: 'kokoro-v1', chatterbox: 'chatterbox' }[settings.tts?.provider] || 'windows');
  const engineLabel = (o) => o.value === 'windows' ? 'Windows (built in)' : o.value === 'chatterbox' ? 'Chatterbox (copies a voice)'
    : /kokoro/.test(o.value) ? `Kokoro (${(settings.kokoroVoices || []).length} voices)` : /^piper-/.test(o.value) ? `Piper: ${o.label}` : o.label;
  let winHooked = false;
  function winVoices() {
    let list = [];
    try { list = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); } catch {}
    // Windows fills its voice list a moment after the page opens: draw again once it's there.
    if (!list.length && !winHooked && 'speechSynthesis' in window) { winHooked = true; try { speechSynthesis.addEventListener('voiceschanged', () => draw(), { once: true }); } catch {} }
    return list;
  }
  function nestedVoiceHtml() {
    const t = settings.tts || {}, cur = speechNow();
    if (/kokoro/.test(cur)) {
      const v = t.voice || 'am_michael';
      // Not set up yet: a button right here to set it up (the voice samples that come with Bob still play).
      const ready = voices.find((x) => x.engine === 'kokoro')?.installed;
      return `<span class="voice-nest"><label class="pick-inline"><span>Voice</span><select data-tts="voice" aria-label="Kokoro voice">${(settings.kokoroVoices || []).map(([id, label]) => `<option value="${esc(id)}" ${id === v ? 'selected' : ''}>${esc(label)}</option>`).join('')}</select></label>${hear('kokoro', v, 'Play sample')}${ready ? '' : '<button type="button" class="mini" data-gocat="speech" data-gomodel="kokoro-v1">Set up Kokoro</button>'}</span>`;
    }
    if (cur === 'windows') {
      const list = winVoices(), w = t.windowsVoice || '';
      return `<span class="voice-nest"><label class="pick-inline"><span>Voice</span><select data-winvoice aria-label="Windows voice"><option value="" ${w ? '' : 'selected'}>Automatic (an English voice Bob picks)</option>${w && !list.some((x) => x.name === w) ? `<option value="${esc(w)}" selected>${esc(w)}</option>` : ''}${list.map((x) => `<option value="${esc(x.name)}" ${x.name === w ? 'selected' : ''}>${esc(x.name.replace(/^Microsoft /, ''))}</option>`).join('')}</select></label>${sampleButton('windows', w || 'default', 'Play sample', 'A voice built into Windows.')}</span>`;
    }
    if (cur === 'chatterbox') return `<span class="voice-nest"><span class="muted">Copies the voice from your recording (bob.wav in Bob's Voices folder).</span>${hear('chatterbox', 'bob', 'Play sample')}</span>`;
    const p = voices.find((x) => x.engine === 'piper' && x.catalogId === cur) || voices.find((x) => x.engine === 'piper' && x.installed);
    return `<span class="voice-nest"><span class="muted">One voice per Piper download; more in 💬 Voice &amp; conversation.</span>${p ? hear('piper', p.voice, 'Play sample') : ''}</span>`;
  }
  function voicePickHtml() {
    const opts = roles?.options?.speech || [{ value: 'windows', label: 'Windows voices (built in)' }];
    const cur = speechNow();
    return `<span class="voice-pick sample-row"><label class="pick-inline"><span>Voice engine</span><select data-role="speech" aria-label="Voice engine">${opts.some((o) => o.value === cur) ? '' : `<option value="${esc(cur)}" selected>${esc(engineLabel({ value: cur, label: cur }))} · not set up yet</option>`}${opts.map((o) => `<option value="${esc(o.value)}" ${o.value === cur ? 'selected' : ''}>${esc(engineLabel(o))}</option>`).join('')}</select></label>${nestedVoiceHtml()}</span>`;
  }

  function voiceHtml() {
    const t = settings.tts || {};
    const head = `<div class="voice-head"><strong>Bob's voice</strong>${voicePickHtml()}</div>`;
    if (t.provider === 'kokoro') return `${head}<div class="row">
      <label class="pick"><strong>Speed: <b data-speedlabel>${(t.speed || 1).toFixed(1)}×</b></strong><input type="range" min="0.6" max="1.6" step="0.1" data-tts="speed" value="${t.speed || 1}"></label></div>${engineStep(engineById('kokoro'), voiceOf('kokoro', t.voice || 'am_michael')?.filesHere ? 'Voices downloaded' : 'Kokoro is picked as Bob\'s voice')}${kokoroGrid(true)}`;
    if (t.provider === 'chatterbox') return `${head}<div><p class="muted">To copy a voice, put a clear 10 to 20 second recording named bob.wav in ${esc(t.voicesFolder)}. Only use a voice you have the right to use (your own, or one you have permission for).</p>${voiceOf('chatterbox', 'bob')?.installed ? `<p class="sample-row">${hear('chatterbox', 'bob')}</p>` : engineStep(engineById('chatterbox'), 'Chatterbox is picked as Bob\'s voice')}</div>`;
    return head;
  }

  // Making Bob's own engine (llama.cpp) faster. Blank means llama.cpp's own default.
  function speedHtml() {
    const sp = settings.speed || {};
    const d = sp.draft || {};
    const llms = roles?.options?.llm || [];
    const n = (k, label, hint) => `<label class="pick"><span>${label}</span><input type="text" inputmode="numeric" data-speed="${k}" value="${esc(sp[k] ?? '')}" placeholder="${hint}" style="width:7em"></label>`;
    const models = [...new Set([...llms.map((o) => o.value), ...Object.keys(sp.modelArgs || {})])];
    return `<div><strong>Speed (Bob's own engine)</strong>${settings.engine === 'llamacpp' ? '' : ' <span class="tag">only used with Bob\'s own engine</span>'} ${tip('Changes apply the next time a brain loads. Leave a box empty for llama.cpp\'s default.', 'Speed')}
      <div class="row">${n('threads', 'Threads', 'auto')}${n('batch', 'Batch', '2048')}${n('ubatch', 'Micro-batch', '512')}</div>
      <label class="switch"><input type="checkbox" data-fit ${sp.fit !== false ? 'checked' : ''}><span><strong>Fit to free graphics memory</strong> <span class="tag good">recommended</span> ${tip('Fits each brain around whatever else is using the graphics card right now. Faster and steadier than a fixed split. Needs llama.cpp b12000 or newer.', 'Fit to free graphics memory')}</span></label>
      <label class="switch"><input type="checkbox" data-draft="enabled" ${d.enabled && d.model ? 'checked' : ''}><span><strong>Speculative decoding</strong> <span class="tag warn">experimental</span> ${tip('A small "draft" brain guesses ahead and the big one checks: often 1.5 to 2 times faster, same answers. The draft must be from the same family (for example a small Qwen for a big Qwen). Not every pair works: check that Bob got faster. The exact command is in inn\\bob\\llama-server-args.txt.', 'Speculative decoding')}</span></label>
      <div class="row"><label class="pick"><span>Draft brain</span><select data-draft="model"><option value="">Pick one</option>${llms.map((o) => `<option value="${esc(o.value)}" ${o.value === d.model ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}${d.model && !llms.some((o) => o.value === d.model) ? `<option selected value="${esc(d.model)}">${esc(d.model)}</option>` : ''}</select></label>
        <label class="pick"><span>Guess up to (words ahead)</span><input type="text" inputmode="numeric" data-draft="max" value="${esc(d.max ?? 16)}" style="width:5em" aria-label="Guess up to this many words ahead"></label>
        <label class="pick"><span>At least (words ahead)</span><input type="text" inputmode="numeric" data-draft="min" value="${esc(d.min ?? 1)}" style="width:5em" aria-label="Guess at least this many words ahead"></label></div>
      <div class="row"><label class="pick"><span>Extra settings for one brain</span><select data-margsmodel>${models.map((m) => `<option ${m === speedModel ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select></label>
        <label class="pick" style="flex:1"><span>llama.cpp flags (for example <code>--n-cpu-moe 8</code>)</span><input type="text" data-margs value="${esc((sp.modelArgs?.[speedModel || models[0]] || []).join(' '))}" placeholder="none"></label></div>
    </div>`;
  }

  // Housekeeping: off unless turned on. Each kind has its own age limit and "ask me" (default) or "tidy automatically".
  // 1.5.34 Projects: the folders Bob searches when you say "my project" (search_files), and which one is the main one.
  // Before this they could only be set by hand in config.json, so brains kept asking "which project?".
  function projectsHtml() {
    const list = settings?.projectList || [];
    const def = settings?.defaultProject || '';
    const rows = list.map((p, i) => `<li class="project-row"><label><input type="radio" name="mainproject" data-mainproject="${esc(p.name)}" ${p.name === def ? 'checked' : ''}> <strong>${esc(p.name)}</strong></label>
      ${p.name === def ? '<span class="tag good">main project</span>' : ''}<span class="muted proj-path">${esc(p.path)}</span>${p.missing ? ' <span class="error">(folder not found)</span>' : ''} <button type="button" class="mini" data-projremove="${i}" title="Your files aren't touched.">Remove from list</button> <span class="muted">Your files aren't touched.</span></li>`).join('');
    return `<p class="muted">Folders Bob can search and work in. ${tip('Folders with your code or work. When you say "search my project" or "my project", Bob looks here. The main project is searched first and is the one "my project" means. Bob can read these folders; changing files still needs the Files Hand and your OK.', 'Projects')}</p>
      ${list.length ? '<p class="muted proj-main-head">Main: pick the dot next to a project.</p>' : ''}
      <ul class="project-list">${rows || '<li class="muted">No projects yet. Bob searches nothing until you add one.</li>'}</ul>
      ${list.length ? `<label class="project-none"><input type="radio" name="mainproject" data-mainproject="" ${def ? '' : 'checked'}> No main project</label>` : ''}
      <div class="project-add"><label for="proj-name">Name</label><input id="proj-name" type="text" maxlength="60" placeholder="like My Game">
        <label for="proj-path">Folder</label><input id="proj-path" type="text" placeholder="C:\\Projects\\MyGame"> <button type="button" class="mini" data-projbrowse>Browse…</button>
        <button type="button" data-projadd disabled>Add project</button><p class="error proj-error" hidden></p></div>`;
  }
  // 1.5.79 How-tos: the steps Bob kept from jobs that worked. Loaded when the panel is drawn; edit and delete on the PC.
  let howtosList = null, howtosLoading = false, howtoEditing = null, howtoDeleting = null;
  window.addEventListener('bob-howto-saved', () => { howtosList = null; });
  const loadHowtos = () => { if (howtosLoading) return; howtosLoading = true; api('/api/howtos').then((r) => { howtosList = r.howtos || []; }).catch(() => { howtosList = []; }).finally(() => { howtosLoading = false; draw(); }); };
  function howtosHtml() {
    const on = settings?.howtos === true;
    if (howtosList === null) { loadHowtos(); return '<p class="muted">Loading…</p>'; }
    const intro = `<p class="muted">${on ? 'After a job with a few steps goes well, Bob offers a card to keep the steps. When you ask for something like it again, he follows them.' : 'Off. Turn on "Let Bob learn how-tos" in How Bob works to have Bob offer them. How-tos you already saved stay here, and he doesn\'t use them while it\'s off.'} ${tip('A how-to is plain text: a name, what it\'s for, and the steps. It can\'t run anything by itself, and tools that ask for your OK still ask. How-tos stay on this replicant matrix (your computer).', 'How-tos')}</p>`;
    const rows = howtosList.map((r) => howtoEditing === r.id
      ? `<div class="howto-row" data-howto="${esc(r.id)}"><label>Name <input data-rname maxlength="60" value="${esc(r.name)}"></label>
          <label>What it's for <input data-rwhen maxlength="200" value="${esc(r.when || '')}"></label>
          <label>Steps (one per line) <textarea data-rsteps rows="${Math.min(12, r.steps.length + 1)}">${esc(r.steps.map((x) => x.did).join('\n'))}</textarea></label>
          <div class="row"><button type="button" data-howtosave="${esc(r.id)}">Save changes</button><button type="button" class="link" data-howtocancel>Cancel</button></div><p class="error howto-error" hidden></p></div>`
      : `<div class="howto-row"><div class="row"><strong>${esc(r.name)}</strong><span class="muted">${r.steps.length} steps${r.used ? ` · used ${r.used} time${r.used === 1 ? '' : 's'}` : ' · not used yet'}</span></div>
          ${r.when && r.when !== r.name ? `<div class="muted">For: ${esc(r.when)}</div>` : ''}
          <ol class="howto-steps">${r.steps.map((x) => `<li>${esc(x.did)}</li>`).join('')}</ol>
          <div class="row"><button type="button" class="mini" data-howtoedit="${esc(r.id)}">Edit</button>${howtoDeleting === r.id ? `<button type="button" class="mini danger" data-howtodel="${esc(r.id)}">Delete for good</button><button type="button" class="link" data-howtocancel>Keep it</button>` : `<button type="button" class="mini" data-howtoask="${esc(r.id)}">Delete</button>`}</div></div>`).join('');
    return `${intro}<div class="howtos-list">${rows || '<p class="muted">No how-tos yet.</p>'}</div>`;
  }
  // 1.5.125 Bob's home folder (models, programs, notes, settings), with Move. Settings text is third person; the first-run copy is Bob's own voice.
  function homeError(text) { for (const box of dlg.querySelectorAll('.home-error')) { box.textContent = text; box.hidden = false; } }
  async function homeAskFor(folder) {
    const r = await api('/api/home', { folder });
    if (!r.ok) return homeError(r.error || 'Not that folder.');
    if (r.same) return homeError('That\'s where my things are already.');
    homeAsk = r; draw();
    dlg.querySelector('.home-ask')?.scrollIntoView({ block: 'nearest' });
  }
  function homeHtml({ welcome = false } = {}) {
    if (!homeInfo) { loadHome(); }
    const h = homeInfo || {};
    const folder = h.folder || settings?.home || '';
    const size = h.loading || !h.modelsText ? '' : ` <span class="muted">· models ${esc(h.modelsText)}${h.enginesBytes ? `, with programs ${esc(h.totalText)}` : ''}</span>`;
    const warn = h.tempLike ? `<p class="error">This is inside ${esc(h.tempLike)}, which clean-up tools empty. ${welcome ? 'My' : 'Bob\'s'} models (${esc(h.modelsText || 'tens of GB')}) would be gone in one "clear temporary files". Move them to a folder of your own, like ${esc(h.suggested || '')}.</p>`
      : h.synced ? `<p class="error">${esc(welcome ? h.cloudWarning.replace(/Bob's/g, 'my').replace('Bob recommends', 'I recommend').replace('Bob is', "I'm") : h.cloudWarning)} Move it with the row below.</p>` : '';
    const ask = homeAsk ? `<div class="confirm home-ask">${homeAsk.pickedCloud ? `<p class="error">${esc(welcome ? homeAsk.pickedCloudWarning.replace(/Bob's/g, 'my').replace('Bob recommends', 'I recommend').replace('Bob is', "I'm") : homeAsk.pickedCloudWarning)}</p>` : ''}<p>Move everything to <strong>${esc(homeAsk.folder)}</strong>? ${welcome ? `That's my models (${esc(homeAsk.modelsText || '?')}), programs, notes and settings${homeAsk.enginesBytes ? `, about ${esc(homeAsk.totalText)}` : ''}. I close, copy it all across, and open again from the new folder; the old one is removed only once every file is over. Big models take a while, and nothing else should use me meanwhile.` : `That's Bob's models (${esc(homeAsk.modelsText || '?')}), programs, notes and settings${homeAsk.enginesBytes ? `, about ${esc(homeAsk.totalText)}` : ''}. Bob closes, copies it all across, and opens again from the new folder; the old one is removed only once every file is over. Big models take a while, and nothing else should use Bob meanwhile.`}</p>
      <div class="row"><button type="button" class="${homeAsk.pickedCloud ? 'mini' : 'get'}" data-homego>${homeAsk.pickedCloud ? 'Move there anyway' : 'Yes, move everything'}</button><button type="button" data-homeno>Not now</button></div></div>` : '';
    const how = h.canMove === false && !h.loading ? `<p class="muted">Moving works from ${welcome ? 'my' : 'Bob\'s'} own window (Bob.exe, Bob.app or the AppImage), not from a browser tab.</p>` : '';
    return `<p class="save-now"><strong>${welcome ? 'I keep my things in' : 'Kept in'}</strong> <span class="save-path">${esc(folder)}</span>${size} ${welcome ? tip('My models, programs (engines), notes, chats and settings all live in this one folder, apart from the program itself, so updating me never touches them. Move here… picks a new place (an empty or new folder on any drive; AppData and other temporary places are refused; a cloud-synced folder like OneDrive, Dropbox, Google Drive or iCloud is allowed but I always recommend against it and say so); I show the size and ask once, then close, copy everything across and open again.', 'My home folder') : tip('Bob\'s models, programs (engines), notes, chats and settings all live in this one folder, apart from the program itself, so updating Bob never touches them. Move here… picks a new place (an empty or new folder on any drive; AppData and other temporary places are refused; a cloud-synced folder like OneDrive, Dropbox, Google Drive or iCloud is allowed but Bob always recommends against it and says so); Bob shows the size and asks once, then closes, copies everything across and opens again. Where Bob saves things, below, is different: it is only where new pictures, clips and songs go.', 'Bob\'s home folder')}</p>
      ${warn}
      <div class="save-pick"><label for="home-path">New folder</label><input id="home-path" type="text" placeholder="${esc(h.suggested || 'D:\\Bob')}" aria-describedby="home-hint"> <button type="button" class="mini" data-homebrowse>Browse…</button>
        <button type="button" data-homemove>Move here…</button></div>
      <p class="muted" id="home-hint">An empty folder or a new one, on any drive, not a cloud-synced one (OneDrive, Dropbox, Google Drive, iCloud). Free space matters more than speed.${welcome ? ' Best done now, before the big downloads.' : ''}</p>
      ${how}
      <p class="error home-error" hidden></p>
      ${ask}`;
  }
  // 1.5.41 Where Bob saves things: the folder for pictures, clips, songs and sounds. Bob's own folder unless one is picked.
  function saveDirHtml() {
    const sd = settings?.saveDir || {};
    const custom = sd.custom === true;
    return `<p class="save-now"><strong>Saving in</strong> <span class="save-path">${esc(sd.folder || '')}</span> ${custom ? '' : '<span class="tag good">Bob\'s own folder</span>'} ${tip('The pictures, clips, songs and sounds Bob makes are saved in this folder. Made by Bob in the left menu shows them wherever they are. Things Bob already made stay where they are; only new ones go to a new folder. Tidy up only tidies Bob\'s own folder, never one you picked. Documents and spreadsheets still go where you ask for them.', 'Where Bob saves things')}</p>
      ${sd.missing ? `<p class="error">Bob can't find ${esc(sd.picked)} right now (an unplugged drive, maybe). Until it's back, he saves in his own folder.</p>` : ''}
      <div class="save-pick"><label for="save-path">Folder</label><input id="save-path" type="text" placeholder="D:\\My pictures from Bob" value="${esc(custom ? sd.folder : '')}"> <button type="button" class="mini" data-savebrowse>Browse…</button>
        <button type="button" data-savedir disabled>Save here</button></div>
      <p class="error save-error" hidden></p>
      <p class="save-tools"><button type="button" class="mini" data-saveopen>Show in folder</button>${custom || sd.missing ? ' <button type="button" class="mini" data-saveown>Use Bob\'s own folder</button>' : ''}</p>`;
  }
  async function saveDirTo(folder) {
    const r = await api('/api/settings', { saveDir: folder });
    const eb = dlg.querySelector('.save-error');
    if (r.saveDirError) { for (const box of dlg.querySelectorAll('.save-error, .chest-error')) { box.textContent = r.saveDirError; box.hidden = false; } return false; }
    settings.saveDir = r.saveDir; draw(); return true;
  }
  const saveDirState = () => { const b = dlg.querySelector('[data-savedir]'); if (b) b.disabled = !dlg.querySelector('#save-path')?.value.trim(); };

  async function saveProjects(list, def) {
    const r = await api('/api/settings', { projectList: list.map(({ name, path }) => ({ name, path })), ...(def !== undefined ? { defaultProject: def } : {}) });
    const errBox = dlg.querySelector('.proj-error');
    if (r.projectError) { if (errBox) { errBox.textContent = r.projectError; errBox.hidden = false; } return false; }
    settings.projectList = r.projectList; settings.defaultProject = r.defaultProject; draw(); return true;
  }

  function housekeepingHtml() {
    const hk = settings.housekeeping || {};
    const KINDS = [['chats', 'Chats', 'summed up first, so the topic notes and a summary stay'], ['pictures', 'Pictures and clips Bob made', ''], ['sounds', 'Sounds and music Bob made', ''], ['tasks', 'Finished tasks', 'the chats keep what was said'], ['logs', 'Logbook and update logs', '']];
    const units = ['minutes', 'hours', 'days', 'weeks', 'months'];
    return `<div class="housekeeping"><span class="tag">off unless you turn it on</span>
       ${tip('Bob tidies up after himself while he\'s idle: he sums up the older part of long chats, files what you talked about under Topics, moves lasting facts to his memory file, and offers to clear away things that haven\'t come up for a while. Removed things go to the Recycle Bin. Pinned chats, pictures and topics are never touched, and everything he does goes in the logbook.', 'Housekeeping')}
      <label class="switch"><input type="checkbox" data-hk="enabled" ${hk.enabled ? 'checked' : ''}><span><strong>Tidy up old things by himself</strong> ${tip('Only while he\'s idle (10 minutes quiet, nothing running). He mentions old things at most once a day.', 'Tidy up old things by himself')}</span></label>
      <label class="switch"><input type="checkbox" data-hk="wakeBrain" ${hk.wakeBrain ? 'checked' : ''} ${hk.enabled ? '' : 'disabled'}><span><strong>Load a brain for it if none is loaded</strong> ${tip('Loads a brain just for tidying. Leave off while gaming.', 'Load a brain for it if none is loaded')}</span></label>
      <table class="hk-table"><thead><tr><th>What</th><th>When it hasn't come up for</th><th>Then</th></tr></thead><tbody>
      ${KINDS.map(([k, label, note]) => { const c = hk[k] || {}; return `<tr><td>${esc(label)}${note ? `<br><span class="muted">${esc(note)}</span>` : ''}</td>
        <td><input type="number" min="1" max="999" data-hkkind="${k}" data-hkfield="n" value="${esc(c.n || '')}" aria-label="${esc(label)}: how many" style="width:5em"> <select data-hkkind="${k}" data-hkfield="unit" aria-label="${esc(label)}: unit">${units.map((u) => `<option ${u === c.unit ? 'selected' : ''}>${u}</option>`).join('')}</select></td>
        <td><select data-hkkind="${k}" data-hkfield="mode" aria-label="${esc(label)}: what then"><option value="ask" ${c.mode !== 'auto' ? 'selected' : ''}>Ask me first</option><option value="auto" ${c.mode === 'auto' ? 'selected' : ''}>Tidy automatically</option></select></td></tr>`; }).join('')}
      </tbody></table>
      <div class="row"><button data-opentidy>Open Tidy up</button><button data-hkrun>Tidy up now</button><span class="muted hk-out"></span></div></div>`;
  }

  // Settings (1.5.0): an Everyday page of rows that show what's set now, and "Show advanced settings"
  // for everything else, with a search box. Long help folds behind "More".
  const more = (text) => `<details class="more"><summary>More</summary><p class="muted">${text}</p></details>`;
  // 1.5.117: a long table folds, with what's set now on its one summary line (open it to change).
  const fold = (title, now, body, open = false) => `<details class="fold" ${open ? 'open' : ''}><summary><strong>${esc(title)}</strong> <span class="muted">· ${esc(now)}</span></summary>${body}</details>`;
  let advanced = (() => { try { return localStorage.getItem('bob-settings-advanced') === '1'; } catch { return false; } })();
  let settingsQuery = '';
  function voiceNow() {
    const t = settings.tts || {};
    if (t.provider === 'kokoro') { const k = (settings.kokoroVoices || []).find(([id]) => id === (t.voice || 'am_michael')); return { name: `${k ? k[1] : t.voice} (Kokoro)`, play: hear('kokoro', t.voice || 'am_michael', 'Play sample') }; }
    if (t.provider === 'chatterbox') return { name: 'Chatterbox (copies voices\\bob.wav)', play: hear('chatterbox', 'bob', 'Play sample') };
    if (t.provider === 'piper') { const v = voices.find((x) => x.engine === 'piper' && x.installed); return { name: v ? `${v.label} (Piper)` : 'Piper', play: v ? hear('piper', v.voice, 'Play sample') : '' }; }
    return { name: 'The voice built into Windows', play: sampleButton('windows', 'default', 'Play sample', 'The voice built into Windows.') };
  }
  const srow = (label, value, actions = '', id = '') => `<div class="srow"${id ? ` id="${id}"` : ''}><span class="slabel">${label}</span><span class="svalue">${value}</span><span class="sact">${actions}</span></div>`;
  // 1.5.56: the note moves behind ⓘ unless it's a warning, a live value or has a button in it.
  const sswitch = (key, on, label, note = '', extra = '') => `<label class="switch srow-switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''} ${extra}><span><strong>${label}</strong>${noteOrTip(note, label)}</span></label>`;

  // 1.5.34: Settings in collapsible panels (there was a lot on one page). Which panels are open is remembered in this
  // browser; Bob himself starts open, the rest closed. Searching opens the panels that match.
  const OPEN_KEY = 'bob-settings-open';
  let openPanels = (() => { try { const v = JSON.parse(localStorage.getItem(OPEN_KEY)); return Array.isArray(v) ? new Set(v.map((id) => (id === 'adv-connections' ? 'adv-bobnet' : id))) : new Set(['ev-bob']); } catch { return new Set(['ev-bob']); } })();
  const saveOpen = () => { try { localStorage.setItem(OPEN_KEY, JSON.stringify([...openPanels])); } catch {} };
  // 1.5.117: rawNote = the note is HTML (buttons allowed) and stays on the summary line while the panel is open.
  const panel = (id, label, note, body, help = '', rawNote = false) => `<details class="spanel" data-panel="${esc(id)}" id="sub-${esc(id)}" ${openPanels.has(id) ? 'open' : ''}><summary><span class="spanel-title">${esc(label)}</span>${help}<span class="muted spanel-note${rawNote ? ' keep' : ''}">${rawNote ? note : esc(note)}</span></summary><div class="spanel-body">${body}</div></details>`;
  // More everyday panels slot in here as [id, label, note, () => html] (for example Projects), between How Bob works and This PC.
  // 1.5.34 Projects (folders Bob searches for "my project"), its own panel in the everyday settings.
  // The note is what a closed panel shows: what's set now.
  const EVERY_EXTRA = [['ev-projects', '📁 Projects', () => { const n = (settings?.projectList || []).length; return n ? `${n} project${n === 1 ? '' : 's'} · Main: ${settings.defaultProject || 'none'}` : 'No projects yet. Add the folders Bob searches when you say "my project".'; }, () => projectsHtml()],
    // 1.5.41 Where Bob saves things (closed, it shows the folder in use).
    // 1.5.79 How-tos (closed, it shows how many and whether he learns new ones).
    // 1.5.125 Bob's home folder (closed, it shows the home folder; red when it's somewhere temporary).
    ['ev-home', '📦 Bob\'s home folder', () => { const h = homeInfo || {}; return h.tempLike ? `${settings?.home || ''} · in ${h.tempLike}: move it` : h.synced ? `${h.folder || settings?.home || ''} · a ${h.synced} folder, synced to the cloud: not recommended` : `${h.folder || settings?.home || ''}${h.modelsText ? ` · models ${h.modelsText}` : ''}`; }, () => homeHtml()],
    ['ev-save', '💾 Where Bob saves things', () => { const sd = settings?.saveDir || {}; return sd.missing ? 'Picked folder not found · saving in Bob\'s own folder' : sd.custom ? sd.folder : 'Bob\'s own folder (Made by Bob)'; }, () => saveDirHtml()],
    ['ev-howtos', '📒 How-tos', () => { const n = howtosList ? howtosList.length : (settings?.howtoCount || 0); return `${n ? `${n} how-to${n === 1 ? '' : 's'}` : 'No how-tos yet'} · Learning: ${settings?.howtos === true ? 'on' : 'off'}`; }, () => howtosHtml()]];

  function everydayHtml() {
    const st = settings.style || {};
    const lookName = (settings.lookText || '').split(/[:.,(]/)[0].replace(/["“”]/g, '').trim() || 'Sysop';
    const theme = findTheme(st.theme || 'inn', st.custom || []);
    const motion = st.motion || 'on';
    const mopt = (val, label) => `<button type="button" role="radio" aria-checked="${motion === val}" data-motion="${val}">${label}</button>`;
    // Closed panels show what's set now, not just what's inside.
    const onoff = (v) => (v ? 'on' : 'off');
    const t = settings.tts || {};
    const voiceSum = t.provider === 'kokoro' ? `Kokoro, ${((settings.kokoroVoices || []).find(([id]) => id === (t.voice || 'am_michael'))?.[1] || t.voice).replace(/ \(.*$/, '')}` : t.provider === 'piper' ? 'Piper' : t.provider === 'chatterbox' ? 'Chatterbox' : 'Windows';
    const bobSum = `Voice: ${voiceSum} · Look: ${lookName} · Theme: ${theme?.name || 'Bob\'s Inn'}`;
    const howSum = `Bob picks the session: ${onoff(settings.autoSession !== false)} · One brain: ${onoff(settings.oneBrain)} · Starts with Windows: ${onoff(settings.autostart)} · Keeps to the tray: ${onoff(settings.tray === true)} · Web search: ${onoff(settings.webSearch === true)} · Plans before big jobs: ${onoff(settings.planFirst === true)} · How-tos: ${onoff(settings.howtos === true)} · Update checks: ${onoff(settings.updates?.autoCheck)}`;
    // 1.5.117: the version and Check for updates sit on the closed panel's line, so no scrolling to check.
    const pcSum = `<span class="pc-ver">Bob ${esc(settings.version?.label || '')}</span> <button type="button" class="mini" data-checkupdate>Check for updates</button> <span class="update-out"></span><span class="pc-spec">· ${esc(hw?.spec || 'specs not read yet')} · graphics card: ${hw?.gpu ? `${esc(hw.gpu.name)}, ${hw.gpu.vramGB} GB` : 'not detected'} · ${hw?.freeGB ?? '?'} GB free</span>`;
    return `<div class="everyday">${panel('ev-pc', '💻 This replicant matrix and updates', pcSum, `
      <div class="updates srow-foot"><span class="muted">${hw?.gpu?.integrated && hw.installedRamGB ? `Built-in graphics: ${esc(hw.gpu.name.replace(/ \(shared memory\)$/, ''))} · Memory: ${hw.installedRamGB} GB ${hw.reservedGraphicsGB >= 2 ? `shared, ${hw.reservedGraphicsGB} GB set aside for graphics` : 'shared with graphics as needed'} (about ${hw.gpu.vramGB} GB of it for models)` : hw?.gpu?.integrated ? `Built-in graphics: ${esc(hw.gpu.name.replace(/ \(shared memory\)$/, ''))}, about ${hw.gpu.vramGB} GB of memory shared with it` : hw?.gpu?.unified ? `Chip: ${esc(hw.gpu.name)}, about ${hw.gpu.vramGB} GB of it for graphics` : `Graphics card: ${hw?.gpu ? `${esc(hw.gpu.name)}, ${hw.gpu.vramGB} GB` : 'not detected'}`} · Free disk: ${hw?.freeGB ?? '?'} GB</span>
        ${sswitch('autoCheck', settings.updates?.autoCheck, 'Check for updates when Bob starts', 'Off unless you turn it on. Bob looks at his GitHub page for a newer version and only tells you; updating always takes your click.')}
        <div class="row"><button type="button" data-welcome>Run first-time setup</button><button type="button" data-helpbundle>Save a help bundle</button>${tip('Saves one zip with Bob\'s logs, the last chats, errors and this replicant matrix\'s facts, scrubbed of passcodes, keys and your name, so an agent or a person can work out what\'s wrong. Nothing is sent anywhere: you pick where it goes.', 'Save a help bundle')}${settings.features?.pcCheck === false ? '' : '<button type="button" data-pccheck>Check this replicant matrix</button>'}</div>
        <div class="help-bundle muted" aria-live="polite"></div><div class="update-steps"></div><div class="pc-check" aria-live="polite"></div></div>`, '', true)}${panel('ev-bob', '🙂 Bob himself', bobSum, `
      ${srow('Bob\'s voice', voicePickHtml(), '<button type="button" class="mini" data-tab="speech">More voice settings</button>')}
      ${srow('Bob\'s look', esc(lookName), '<button type="button" class="mini" data-tab="style">Change</button>')}
      ${sswitch('lookIcon', settings.lookIcon === true, 'Use Bob\'s look as his icon', `Off unless you turn it on. His icon on the ${settings.platform === 'darwin' ? 'Dock' : 'taskbar'}, in the tray and in the corner of his window shows the look you picked, and changes when you change it.${settings.trayHere ? '' : ' Only in Bob\'s own window, not in a browser.'}`, settings.trayHere ? '' : 'disabled')}
      ${srow('Theme', esc(theme?.name || 'Bob\'s Inn'), '<button type="button" class="mini" data-tab="style">Change</button>')}
      ${srow('Animations', `<span class="ttabs" role="radiogroup" aria-label="Animations">${mopt('on', 'On')}${mopt('system', settings.platform === 'win32' ? 'Follow Windows' : 'Follow the system')}${mopt('off', 'Off')}</span>`)}
      ${srow('Bob\'s cat', `<input data-set="catName" maxlength="24" value="${esc(settings.catName || 'Patches')}" aria-label="Cat's name" style="width:12em"> ${tip('The cat in Bob\'s stories.', 'Bob\'s cat')}`)}
`)}${panel('ev-how', '⚡ How Bob works', howSum, `
      <h4 class="ssub">How he works</h4>
      ${sswitch('autoSession', settings.autoSession !== false, 'Let Bob pick the session', 'Bob moves into the session that suits the job (Art, Coding, Office or Gaming) and goes back to Normal, the lightest, once he has been quiet for 2 minutes. While something else is using the graphics card, like a game, he stays in Gaming. You can still pick a session yourself from the menu: Bob keeps it while you work, then goes back to Normal once he has been quiet for 2 minutes. To keep him in Gaming, press 🎮 Gaming next to Effort.')}
      ${sswitch('oneBrain', settings.oneBrain, 'One brain (snappier)', 'Every copy of Bob uses the main brain, so he never stops to swap brains (about 20 seconds).')}
      ${sswitch('planFirst', settings.planFirst === true, 'Show Bob\'s plan before big jobs', keep('Off unless you turn it on. Before a job with several steps, or any step that changes files or runs programs, Bob shows every step on one card and waits for you. Any OKs the job needs are ticked on the same card.'))}
      ${sswitch('howtos', settings.howtos === true, 'Let Bob learn how-tos', 'Off unless you turn it on. After a job with a few steps goes well, Bob offers to keep the steps as a how-to, and follows them next time you ask for something like it. Nothing is kept without your click. Your how-tos are in 📒 How-tos below.')}
      ${sswitch('resumeJobs', settings.resumeJobs, 'Pick up where Bob left off after a restart', 'If Bob closes in the middle of a job (an update, a restart or a crash), he carries on when he opens again. Steps that finished aren\'t done again, and the step that got cut off is done again from the start. Unfinished downloads carry on too. If the cut-off step was typing into an app, moving or deleting files, editing a file or running a command, the job waits in Tasks so you can check first.')}
      <h4 class="ssub">Starting and closing</h4>
      ${sswitch('autostart', settings.autostart, 'Launch Bob on start-up', 'Off unless you turn it on.', settings.platform === 'win32' || settings.platform === 'darwin' || settings.loginItems ? '' : 'disabled')}
      ${sswitch('tray', settings.tray === true, 'Keep Bob in the tray', `Off unless you turn it on. Closing or minimising Bob's window tucks him into ${settings.platform === 'darwin' ? 'the menu bar at the top of the screen' : settings.platform === 'win32' ? 'the tray by the clock' : 'your desktop\'s tray'} instead of closing him, so he keeps running. Click his icon to open him again. To close him fully, ${settings.platform === 'darwin' ? 'click' : 'right-click'} his icon and pick <strong>Quit Bob</strong>.${settings.trayHere ? '' : ' Only in Bob\'s own window, not in a browser.'}`, settings.trayHere ? '' : 'disabled')}
      <h4 class="ssub">Going online</h4>
      ${sswitch('webSearch', settings.webSearch === true, 'Let Bob search the web', keep('Off unless you turn it on. Bob looks things up on DuckDuckGo and reads pages when a question needs it. Only the search words and page addresses leave your replicant matrix (your computer).'))}
`)}${EVERY_EXTRA.map(([id, label, note, body]) => panel(id, label, typeof note === 'function' ? note() : note, body())).join('')}
    </div>`;
  }

  // Mac and Linux: no removal window. Bob says plainly what to throw away, and where it is.
  function macRemoveHtml() {
    const home = settings.home || '';
    return settings.os === 'mac'
      ? `<div class="remove-bob"><p>To remove Bob from this Mac: quit Bob (Bob menu, Quit Bob), then drag <strong>Bob</strong> from Applications to the Bin. His chats, settings, models and engines stay in <code>${esc(home || '~/Library/Application Support/Bob/home')}</code>; drag that folder to the Bin too if you want them gone. If you turned on "Launch Bob on start-up", turn it off first (or remove Bob in System Settings, General, Login Items).</p></div>`
      : `<div class="remove-bob"><p>To remove Bob: turn off "Launch Bob on start-up" if you turned it on, quit Bob, then delete the Bob AppImage file you downloaded. His chats, settings, models and engines stay in <code>${esc(home || '~/.local/share/bob')}</code>; delete that folder too if you want them gone.</p></div>`;
  }

  // 1.5.32: a three-position switch for how the Gaming session uses the graphics card.
  const GCARD_NOW = { none: 'processor only', borrow: 'borrowing about 0.6 GB', whole: 'small brain on the card (processor busy)' };
  function gamingCardHtml() {
    if (settings.features?.gamingCard === false) return ''; // a Mac shares its memory: there's no separate card to lend
    const cur = settings.gamingCard || 'auto';
    const opts = [['auto', 'Automatic', 'Bob borrows about 0.6 GB of the card only when your game leaves room, and none while the game needs it. If your processor is maxed out, Bob\'s small brain (about 3.5 GB) moves onto the card instead, but only when it fits with room to spare.'],
      ['never', 'Never use the card', 'Processor only: the card is all yours. Bob\'s first reply after loading can take about half a minute, sometimes longer.'],
      ['always', 'Always borrow a little', 'About 0.6 GB of the card for reading your messages, even while a game is using it (how Bob worked before 1.5.32).']];
    return `<fieldset class="seg3"><legend><strong>Gaming session: graphics card</strong></legend>
      <div class="seg3-row" role="radiogroup" aria-label="Gaming session: graphics card">${opts.map(([v, label]) => `<label class="seg3-btn${v === cur ? ' on' : ''}"><input type="radio" name="gamingCard" data-gcard="${v}" value="${v}" ${v === cur ? 'checked' : ''}><span>${label}</span></label>`).join('')}</div>
      <span class="muted" data-gcard-note>${esc((opts.find(([v]) => v === cur) || opts[0])[2])}</span>
      ${cur === 'auto' ? `<span class="muted" data-gcard-now><strong>Right now:</strong> ${esc(GCARD_NOW[settings.gamingCardNow] || (settings.session?.id === 'light' ? 'the Gaming brain isn\'t loaded; Bob decides when it loads' : 'not in the Gaming session'))}</span>` : ''}
      <span class="muted">Only matters in the 🎮 Gaming session. Applies the next time the Gaming brain loads.</span></fieldset>`;
  }

  // 1.5.98: Speed & memory (split from Engines & speed).
  function speedMemoryHtml() {
    const ka = settings.ollamaKeepAlive || '5m';
    const kaOpts = [['1m', '1 minute'], ['2m', '2 minutes'], ['150s', '2½ minutes'], ['5m', '5 minutes'], ['10m', '10 minutes'], ['15m', '15 minutes'], ['30m', '30 minutes'], ['1h', '1 hour']];
    const held = settings.brainMode === 'always';
    return `<label class="pick${held ? ' dim' : ''}"><strong>Free memory after Bob has been quiet for</strong>
        <select data-set="keepAlive" aria-label="Free memory after Bob has been quiet for">${kaOpts.some(([v]) => v === ka) ? '' : `<option value="${esc(ka)}" selected>${esc(ka)}</option>`}${kaOpts.map(([v, label]) => `<option value="${v}" ${v === ka ? 'selected' : ''}>${label}</option>`).join('')}</select>
        <span class="muted">${held ? 'Not used right now: "Free memory when Bob is idle" on the chat page is off, so his small brain stays loaded.' : 'Used while "Free memory when Bob is idle" on the chat page is on.'} Big brains (Coding, and Medium effort and up) are freed after 2 minutes, or sooner if you pick less.</span></label>
      ${sswitch('quickOnCpu', settings.quickOnCpu === true, 'Keep the graphics card free for quick answers', 'Low effort answers run on the processor, so games and pictures keep the card. Replies start much slower (about half a minute). A message with a link still goes to your main Brain, which reads web pages better. Applies in the Normal session; Gaming always does this.')}
      ${sswitch('pictureNoWait', settings.pictureNoWait !== false, 'Show pictures without waiting for Bob\'s brain', 'Bob shows a finished picture or clip straight away with a short line, instead of loading his brain back just to talk about it. Turn off if you want him to comment on each one.')}
      ${tuneHtml()}
      ${gamingCardHtml()}
      ${sswitch('memoryRecall', settings.memoryRecall === true, 'Remember only what fits', 'With each message, Bob reads only the memories that fit it (up to 8), not his whole memory file, so chats stay light. Off: he reads all of it every time.')}
      ${more('Each project gets its own memory bank: while you talk about one project, Bob leaves the other projects\' memories out. To have him read a line every time, add [always] to it in his memory file. He matches by meaning when the 🗂 Memory (finding past chats) model is downloaded (it runs on the processor, never in the Gaming session), and by words otherwise.')}
      ${settings.memoryRecall ? memoryBanksHtml() : ''}
      ${speedTestHtml()}`;
  }

  // 1.5.98: Engines (the rest of Engines & speed). The fine-tuning sits under More.
  function enginesHtml() {
    return `<label class="pick"><strong>Bob's engine</strong>
        <select data-set="engine"><option value="ollama" ${settings.engine === 'ollama' ? 'selected' : ''}>Ollama (if you already have it)</option><option value="llamacpp" ${settings.engine === 'llamacpp' ? 'selected' : ''}>Bob's own (llama.cpp, nothing else needed)</option></select>
        <span class="muted">Takes effect next time Bob starts.</span></label>
      <div><strong>Engine downloads</strong> ${tip('The programs that run the models, from their official GitHub pages, matched to your graphics card.', 'Engine downloads')}
        ${(data.engines || []).map((e) => `<article class="model" id="m-engine:${esc(e.id)}"><header><strong>${esc(e.name)}</strong></header><p>${esc(e.what)}</p>
          <div class="act">${live.has('engine:' + e.id) ? progress(live.get('engine:' + e.id)) : e.installed ? `<div class="have">✓ ${e.found ? esc(e.found[0].toUpperCase() + e.found.slice(1)) : `Installed${e.version ? ` (${esc(e.version)})` : ''}`}</div>${e.pinned || e.available === false ? '' : `<button data-checkengine="${esc(e.id)}">Check for a newer build</button>`}${e.tested && e.version && e.version !== e.tested && !e.found ? `<button data-engine="${esc(e.id)}">Go back to the tested build (${esc(e.tested)})</button>` : ''}` : e.available === false ? `<div class="muted">${esc(e.note || 'Not for this replicant matrix yet.')}</div>` : `<button class="get" data-engine="${esc(e.id)}">Get ${esc(e.name)}</button>`}</div><div class="confirm" hidden></div></article>`).join('')}</div>
      <details class="more"><summary>More</summary>${speedHtml()}</details>`;
  }

  // 1.5.79: the memory banks, shown under "Remember only what fits" while it's on.
  function memoryBanksHtml() {
    const mb = settings.memoryBanks || {};
    const list = (mb.banks || []).map((b) => `${b.name ? esc(b.name) : 'General'} ${b.lines}`).join(' · ');
    const l = mb.last;
    const last = l ? `Last message: ${l.lines} of ${l.of} memories, matched by ${l.by === 'meaning' ? 'meaning' : 'words'}${l.project ? ` (${esc(l.project)} memory bank)` : ''}.` : '';
    return `<div class="memory-banks"><p class="muted"><strong>Memory banks:</strong> ${list || 'General 0'}. ${last}</p>
      <button type="button" data-openmemory>Open Bob's memory file</button> <span class="muted">One line per memory. Add [project: Name] (a name from Projects) to put a line in that project's bank, or [always] to have Bob read it every time.</span></div>`;
  }

  // 1.5.24: speed for this PC. Three switches (off unless turned on) and a before-and-after speed test.
  function tuneHtml() {
    const sw = (on, name) => `${on ? '✓' : '–'} ${name}`;
    return `<div class="tune"><strong>Speed for this replicant matrix</strong> <span class="tag">off unless you turn it on</span>
         ${tip('Try one switch at a time: run the speed test, turn the switch on, and run it again. The table keeps your last results so you can compare. Bob never changes Windows or driver settings; Check this replicant matrix (on the Everyday page) only suggests them.', 'Speed for this replicant matrix')}
        ${sswitch('readyWhileTyping', settings.readyWhileTyping === true, 'Get Bob ready while you type', 'He reads his instructions as soon as you start typing, so replies start sooner.')}
        ${sswitch('gamesFirst', settings.gamesFirst === true, 'Let games go first', 'When Bob works on the processor, he uses fewer cores at lower priority. His replies may be a little slower.')}
        ${sswitch('pictureFit', settings.pictureFit === true, 'Match picture settings to my graphics card', 'Big cards keep the picture model in graphics memory, which is faster. On cards with 8 GB or less, and on built-in graphics, pictures are made at 768 px so they fit and come quicker.')}
      </div>`;
  }

  // 1.5.98: the speed test and its table, at the bottom of Speed & memory.
  function speedTestHtml() {
    const rows = speedRuns.slice(-6).reverse().map((r) => `<tr><td>${esc(new Date(r.at).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }))}</td><td>${esc(r.model)}<br><span class="muted">${esc(r.where)}</span></td><td>${r.wake} s</td><td><strong>${r.first.firstWord} s</strong></td><td>${r.first.full} s</td><td>${r.next.firstWord} s</td><td class="muted">${sw(r.switches?.readyWhileTyping, 'Ready while typing')} · ${sw(r.switches?.gamesFirst, 'Games first')} · ${sw(r.switches?.pictureFit, 'Matched pictures')}</td></tr>`).join('');
    return `<div class="tune speed-test"><div class="row"><button type="button" data-speedtest>Test Bob's speed</button><span class="speed-out muted">Takes about a minute. Bob frees his brain and wakes it, as when you start typing.</span></div>
        ${rows ? `<div class="speed-table"><table><thead><tr><th>When</th><th>Brain</th><th>Load</th><th>First word</th><th>Full answer</th><th>Second reply</th><th>Switches</th></tr></thead><tbody>${rows}</tbody></table></div>` : ''}
      </div>`;
  }

  function pcCheckHtml(r) {
    const tip = (t) => `<article class="pc-tip"><header><strong>${t.level === 'optional' ? '' : '⚠ '}${esc(t.title)}</strong></header><p class="muted">${esc(t.why)}</p><ol>${t.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol></article>`;
    const fixes = r.tips.filter((t) => t.level !== 'optional'), opts = r.tips.filter((t) => t.level === 'optional');
    return `<p><strong>${fixes.length ? `${fixes.length} thing${fixes.length === 1 ? '' : 's'} could make Bob faster` : 'Nothing slowing Bob down was found.'}</strong> <span class="muted">Bob only looked; he changed nothing.</span></p>
      ${fixes.map(tip).join('')}
      ${r.fine.length ? `<ul class="pc-fine">${r.fine.map((f) => `<li>✓ ${esc(f)}</li>`).join('')}</ul>` : ''}
      ${opts.map(tip).join('')}`;
  }

  // 1.5.98: Connections became three panels: Bob-Net, Online services and Other apps.
  function otherAppsHtml() {
    return `<div><strong>ComfyUI workflows</strong> <span class="tag">off unless you turn it on</span>
         ${tip('For jobs Bob\'s own engines can\'t do (custom nodes, face fixers, long multi-step graphs). Bob drives ComfyUI for you; it just has to be running on this replicant matrix (for example from Pinokio). Add workflows to the workflows folder as Workflow > Export (API) files.', 'ComfyUI workflows')}
        <label class="switch"><input type="checkbox" data-set="workshop" ${settings.workshop?.enabled ? 'checked' : ''}><span><strong>Let Bob use ComfyUI</strong><br><span class="muted">${settings.workshop?.enabled ? `Workflows folder: ${esc(settings.workshop.folder)} · ${settings.workshop.count} workflow${settings.workshop.count === 1 ? '' : 's'}` : 'Off.'}</span></span></label>
        <label class="pick"><strong>ComfyUI port</strong><input data-set="workshopPort" inputmode="numeric" value="${esc(settings.workshop?.port || 8188)}" aria-label="ComfyUI port" style="width:7em"></label></div>
      <p class="muted">Apps Bob works inside (Unreal Engine, Blender) are under Hands, Connected apps (MCP).</p>`;
  }
  // 1.5.127 Rented brains: a big brain hired for one job from a service the owner has an account with.
  function rentHtml() {
    const r = rent || {};
    const caps = r.caps || {};
    const svc = (s) => {
      const keyLine = s.id === 'other' ? 'You name the variable that holds each key when you add a rental.' : s.keyFound ? `Key found (${esc(s.keyEnv)})` : settings.platform === 'win32' ? `No key yet. Add a user variable named ${esc(s.keyEnv)}.` : `No key yet. Put a line ${esc(s.keyEnv)}=… in ~/.config/bob/env.`;
      return `<div class="cloud row rent-service${s.keyFound === false ? ' dim' : ''}" data-rentsvc="${esc(s.id)}">
        <label class="switch"><input type="checkbox" data-rentenable="${esc(s.id)}" ${s.enabled ? 'checked' : ''} ${s.keyFound === false ? 'disabled' : ''}><span><strong>Let Bob hire from ${esc(s.name)}</strong><br><span class="muted">${esc(s.what)} ${keyLine}${s.keyPage ? ` <a href="${esc(s.keyPage)}" target="_blank" rel="noopener">Get a key</a>` : ''}</span></span></label>
        <div class="confirm rent-warn" hidden></div></div>`;
    };
    const rentalRow = (x) => `<li class="rent-row${x.id === r.current ? ' worn' : ''}"><strong>${esc(x.name)}</strong> <span class="muted">${esc(x.model)} on ${esc(x.serviceName)}${x.kind === 'answer' ? '' : `, ${esc(x.cardsText || `${x.card} GB card`)}`} · ${esc(x.price || '')}</span>${(x.cards || 1) > 1 ? '<span class="tag warn">Several cards: costs more</span>' : ''}${x.id === r.current ? '<span class="tag good">in the slot</span>' : ''}${x.ready?.ok ? '' : `<span class="tag warn">${esc(x.ready?.why || '')}</span>`}${x.running ? '<span class="tag">Running</span>' : ''}
      <span class="row"><button type="button" class="mini" data-rentuse="${x.id === r.current ? '' : esc(x.id)}">${x.id === r.current ? 'Take it off' : 'Use this one'}</button>${x.kind === 'answer' ? `<button type="button" class="mini" data-rentprice="${esc(x.id)}">Check the price</button>` : ''}<button type="button" class="mini" data-rentremove="${esc(x.id)}">Remove</button></span></li>`;
    const running = (r.running || []).map((m) => `<li>${esc((r.rentals || []).find((x) => x.id === m.rental)?.name || m.rental)}: ${m.starting ? 'starting' : `${m.minutes} min, about ${esc(m.usd)}`}</li>`).join('');
    const leftover = (r.leftover || []).map((m) => `<li>${esc(m.serviceName)} ${esc(m.id)}${m.perHour ? ` (about $${(+m.perHour).toFixed(2)} an hour)` : ''}, started before Bob did <button type="button" class="mini danger" data-rentstopone="${esc(m.id)}">Stop it</button></li>`).join('');
    const cardOpts = (r.cards || []).map((c) => `<option value="${esc(c.id)}" ${c.id === '48' ? 'selected' : ''}>${esc(c.name)} (about $${c.perHour.toFixed(2)} an hour): ${esc(c.say)}</option>`).join('');
    const svcOpts = (r.services || []).map((s) => `<option value="${esc(s.id)}" ${s.enabled ? '' : 'disabled'}>${esc(s.name)}${s.enabled ? '' : ' (switch it on first)'}</option>`).join('');
    return `<div class="rent-block"><strong>Rented brains</strong> <span class="tag">off unless you turn one on</span>
      ${more('Hire a big brain for a big job, from any service you have an account with. A rental is a service plus a model (for example Qwen 3.6 35B on OpenRouter, or a full-size 24Bob on a RunPod card). Put one in the Rented brain slot on Equip Bob, then use it from the 🏗 Rented brain switch under the chat, or when Bob offers it for a job too big for this replicant matrix. You press a card before anything is spent, and it says the cost and exactly what leaves this replicant matrix: the chat of that job, the files you attach to it, Bob\'s instructions and what he remembers about you. Keys are environment variables Bob only reads (on Mac and Linux they can also go in ~/.config/bob/env); he never stores or shows one. Bob\'s figures are estimates from the service\'s price list; the service\'s own billing page is the real bill.')}
      <h4 class="ssub">Spending limits</h4>
      <p class="muted">Every limit starts at 0. Nothing can be hired until you set the ones a rental needs.</p>
      <label class="pick"><strong>The most Bob may spend on rented brains this month</strong> $<input data-rentcap="month" inputmode="decimal" value="${esc(String(caps.month ?? 0))}" aria-label="Month cap in dollars" style="width:6em"> <span class="muted">Spent this month: ${esc(r.spentText || '$0.00')}. Resets on the 1st.</span></label>
      <label class="pick"><strong>The most one job may cost</strong> $<input data-rentcap="job" inputmode="decimal" value="${esc(String(caps.job ?? 0))}" aria-label="Per-job cap in dollars" style="width:6em"></label>
      <label class="pick"><strong>The longest a hired machine may run</strong> <input data-rentcap="minutes" inputmode="numeric" value="${esc(String(caps.minutes ?? 0))}" aria-label="Longest run in minutes" style="width:5em"> minutes <span class="muted">The machine carries this timer and stops itself when it runs out, even if this replicant matrix is off.</span></label>
      <h4 class="ssub">Services</h4>
      ${(r.services || []).map(svc).join('')}
      <h4 class="ssub">Rentals</h4>
      ${(r.rentals || []).length ? `<ul class="rent-list">${r.rentals.map(rentalRow).join('')}</ul>` : '<p class="muted">None yet.</p>'}
      <details class="more rent-add"><summary>Add a rental</summary>
        <label class="pick"><strong>Service</strong><select data-rentadd="service" aria-label="Service">${svcOpts}</select></label>
        <label class="pick"><strong>Model</strong><input data-rentadd="model" placeholder="as the service lists it, e.g. qwen/qwen3.6-35b-a3b, or Owner/Repo/file.gguf" aria-label="Model name" style="width:24em"></label>
        <label class="pick rent-card-pick"><strong>Card size</strong><select data-rentadd="card" aria-label="Card size">${cardOpts}</select></label>
        <label class="pick rent-cards-pick"><strong>Cards on the machine</strong><select data-rentadd="cards" aria-label="How many cards on the machine">${(r.cardCounts || [1]).map((n) => `<option value="${n}" ${n === 1 ? 'selected' : ''}>${n === 1 ? '1 card (the usual)' : `${n} cards at once: ${n} times the hourly price`}</option>`).join('')}</select> <span class="muted">Only for a model too big for one card. The price and the limits apply to the whole machine.</span></label>
        <div class="confirm rent-multi-warn" hidden></div>
        <label class="pick rent-other"><strong>Web address</strong><input data-rentadd="address" placeholder="https://…/v1" aria-label="Web address" style="width:20em"></label>
        <label class="pick rent-other"><strong>Variable that holds the key</strong><input data-rentadd="keyEnv" placeholder="MY_SERVICE_API_KEY" aria-label="Key variable name" style="width:16em"></label>
        <label class="pick"><strong>Name</strong><input data-rentadd="name" placeholder="optional, e.g. Qwen 35B on OpenRouter" aria-label="Rental name" style="width:20em"></label>
        <p class="row"><button type="button" class="get" data-rentaddgo>Add this rental</button><span class="muted rent-add-note"></span></p>
      </details>
      <h4 class="ssub">Machines running</h4>
      ${running || leftover ? `<ul>${running}${leftover}</ul><p class="row"><button type="button" class="danger" data-rentstop>Stop everything now</button><button type="button" class="mini" data-rentcheck>Check the services again</button></p>` : `<p class="muted">None. <button type="button" class="link" data-rentcheck>Check the services again</button></p>`}
      ${(r.recent || []).length ? `<details class="more"><summary>Recent spending</summary><ul>${r.recent.map((x) => `<li>${esc(new Date(x.at).toLocaleString())}: ${esc(x.name)}, ${esc(x.usd)}${x.minutes ? ` (${x.minutes} min)` : x.tokensIn ? ` (${x.tokensIn} words in, ${x.tokensOut} out)` : ''}${x.guessed ? ', estimated' : ''}</li>`).join('')}</ul></details>` : ''}
    </div>`;
  }
  function onlineHtml() {
    return `<p class="muted">Each of these sends something over the internet, and says what.</p>
      ${rentHtml()}
      <div><strong>Cloud helpers</strong> <span class="tag">off unless you turn one on</span>
        ${more('Paid cloud AIs Bob can hand one job to, as a helper copy. He asks you every time, shows the rough cost and exactly what text would leave your replicant matrix (your computer). Bob never stores or sees your keys: you add a key as a Windows environment variable yourself (Settings, System, About, Advanced system settings, Environment Variables, under "User variables").')}
        ${cloud.map((c) => `<div class="cloud row${c.keyFound ? '' : ' dim'}">
          <label class="switch"><input type="checkbox" data-cloud="${esc(c.id)}" ${c.enabled ? 'checked' : ''} ${c.keyFound ? '' : 'disabled'}><span><strong>${esc(c.name)}</strong><br><span class="muted">${c.keyFound ? `Key found (${esc(c.apiKeyEnv)})` : `No key yet. Add a user variable named ${esc(c.apiKeyEnv)}.`}</span></span></label>
          ${c.models.length ? `<select data-cloudmodel="${esc(c.id)}" aria-label="${esc(c.name)} model" ${c.keyFound ? '' : 'disabled'}>${c.models.map((m) => `<option ${m === c.model ? 'selected' : ''}>${esc(m)}</option>`).join('')}</select>` : `<input data-cloudmodel="${esc(c.id)}" aria-label="${esc(c.name)} model" placeholder="model name" value="${esc(c.model)}" ${c.keyFound ? '' : 'disabled'}>`}
        </div>`).join('')}</div>
      ${telegramHtml()}`;
  }
  function bobNetHtml() {
    return `<h4 class="ssub">This Bob</h4>
      ${phoneAccessHtml()}
      ${shareBrainsHtml()}`;
  }

  function voiceDetailsHtml() {
    const pressed = (id) => document.getElementById(id)?.getAttribute('aria-pressed') === 'true';
    const prox = (id, label, note) => `<label class="switch"><input type="checkbox" data-proxy="${id}" ${pressed(id) ? 'checked' : ''}><span><strong>${label}</strong> ${tip(note, label)}</span></label>`;
    return `<div class="voice-settings">${voiceHtml()}</div>
      ${prox('ear', 'Listen for "Hey Bob"', 'Only while this window is open. Same as Listen in the left menu.')}
      ${prox('speak', 'Read replies aloud', 'Same as Read aloud in the left menu.')}
      <p class="muted">Hearing you and the other voices are on the <button type="button" class="link" data-tab="speech">💬 Voice &amp; conversation</button> page.</p>`;
  }

  function lookExtrasHtml() {
    const st = settings.style || {};
    const opt = (val, label, on) => `<button type="button" role="radio" aria-checked="${on}" data-nowneed="${val}">${label}</button>`;
    return `<div><strong>Now running</strong><div class="ttabs" role="radiogroup" aria-label="Open Now running when a task needs me">${opt('0', 'Leave Now running as it is', st.openNowOnNeed !== true)}${opt('1', 'Open Now running when a task needs me', st.openNowOnNeed === true)}</div></div>
      <div><strong>Your own theme</strong><p class="muted">Make or edit a theme on the <button type="button" class="link" data-tab="style">🎨 Style</button> page (Make your own theme).</p></div>`;
  }

  // 1.5.98: old panel ids (Help links, cards, remembered open panels) land on the new panels.
  const ADV_MOVED = { 'adv-connections': 'adv-bobnet' };
  const ADV = [
    ['brains', '🧠 Brains', 'model roles session brains context thinking making reviewer beside moot keep chatting busy all tools at once', () => rolesHtml() + `
      ${sswitch('mootBeside', settings.mootBeside === true, 'Let the reviewer sit beside Bob\'s main brain', keep('Off to start with. At High and Extreme effort, the reviewer normally swaps in for Bob\'s main brain. On: if there\'s enough free RAM, it loads beside the main brain instead, on the graphics card if there\'s room, otherwise on the processor, so the main brain carries on right after the check. Reviews on the processor are slower, so this suits a small Review brain. Bob\'s own engine only; not in the Gaming session.'))}
      ${sswitch('chatWhileBusy', settings.chatWhileBusy !== false, 'Keep chatting while Bob is busy', keep('While Bob makes a picture, clip, song or sound, or works on a long job (Medium effort and up, the Coding session, or anything past 20 seconds), plain chat messages are answered by his small brain beside the job, if there\'s enough free memory: on the graphics card when it has room for both, otherwise on the processor (Qwen3 4B Instruct 2507, if it\'s downloaded; otherwise messages wait). His main brain keeps working on the graphics card. Replies on the processor start slower (up to about half a minute). Messages with a picture attached, or at Medium effort and up, still wait. Off: every message waits until the job is done.'))}
      ${sswitch('allTools', settings.allTools, 'Give Bob all his tools at once', 'Sends every tool with each message, which leaves less room for the chat. Leave off to keep chats light.')}`],
    ['house', '🖋 House style', 'house style defaults default length mood genre music picture style shape clip video sound effects morning time evening night times of day', () => `<p class="muted">Your defaults for music, pictures, clips, sound effects and times of day live on Equip Bob, next to each slot.</p><button type="button" data-gohouse>Open House style on Equip Bob</button>`],
    ['voice', '🔊 Voice details', 'kokoro chatterbox speed hey bob read aloud listen', () => voiceDetailsHtml()],
    ['look', '🌓 Look & feel', 'theme editor now running layout', () => lookExtrasHtml()],
    ['speed', '⚡ Speed & memory', 'speed memory free memory quiet keep alive unload idle graphics card quick answers processor pictures without waiting ready while you type games go first picture settings gaming graphics card borrow automatic never always remember only what fits memory banks recall speed test', () => speedMemoryHtml()],
    ['engines', '⚙ Engines', 'engine ollama llama.cpp downloads newer build tested build fit to free graphics memory speculative decoding draft flags threads batch', () => enginesHtml()],
    ['bobnet', '🌐 Bob-Net', 'bob-net bobnet phone android tailscale address passcode firewall let my phone in let my other replicant matrices in other bobs share brains lend borrow take jobs send jobs', () => bobNetHtml()],
    ['online', '☁ Online services', 'online internet cloud helpers api key anthropic openai gemini openrouter telegram bot token pairing rented brains rent hire runpod vast lambda together spending cap limit machine', () => onlineHtml()],
    ['apps', '🔌 Other apps', 'other apps comfyui workflows port unreal blender mcp', () => otherAppsHtml()],
    ['hands', '✋ Hands', 'files run commands schedules apps permission quarantine reviewer', () => handsSettingsHtml() + quarantineSettingsHtml()],
    ['housekeeping', '🧹 Housekeeping', 'tidy old chats pictures logs', () => housekeepingHtml()],
    ['adventure', '🎲 Adventure', 'adventure game tabletop role-playing dice game master party bobs cards plot armour campaign', () => `<div class="adventure-box">${adventureSettingsHtml(settings.adventure || {})}</div>`],
    ['games', '🧩 Games', 'games twenty questions hangman word ladder five letters story dice quick brain banter chip in', () => `<div class="games-box">${gamesSettingsHtml(settings.games || {})}</div>`],
    ['checkins', '🔔 Check-ins', 'check in heartbeat schedule morning every day weekday hours notify alert tap shoulder downloads stuck failed tasks disk space own checks build finished', () => checkinsHtml()],
    ['remove', '🗑 Remove Bob', 'uninstall remove', () => settings.features?.uninstall === false ? macRemoveHtml() : `<div class="remove-bob">${more('Takes off Bob\'s program, his Start menu shortcut and "Launch on start-up". His chats, settings and models stay unless you tick them. Nothing else in the inn folder or in Windows is touched.')}<button data-removebob>Remove Bob…</button><div class="remove-confirm" hidden></div></div>`]
  ];

  // "?" next to a heading opens Help at that entry (public/help.js).
  const helpLink = (id, label, text = '? Help') => `<button type="button" class="mini help-link" data-help="${esc(id)}" aria-label="Help: ${esc(String(label).replace(/^\W+/, ''))}">${esc(text)}</button>`;
  function settingsHtml() {
    return `<section class="settings">
      <p class="settings-help">${helpLink('settings-everyday', 'Everyday settings', '? Help with these settings')}</p>
      ${everydayHtml()}
      <label class="switch adv-toggle"><input type="checkbox" data-advanced ${advanced ? 'checked' : ''}><span><strong>Show advanced settings</strong> ${tip('Brains, voice details, speed and memory, engines, Bob-Net, online services, other apps, Hands, housekeeping, check-ins.', 'Show advanced settings')}</span></label>
      ${advanced ? `<div class="advanced">
        <input type="search" data-ssearch placeholder="Search settings" aria-label="Search settings" value="${esc(settingsQuery)}">
        <nav class="subnav" aria-label="Advanced sections">${ADV.map(([id, label]) => `<button type="button" data-jump="adv-${id}">${esc(label)}</button>`).join('')}<button type="button" data-panels="open">Open all</button><button type="button" data-panels="close">Close all</button></nav>
        ${ADV.map(([id, label, words, body]) => `<details class="subsection adv-sec spanel" data-panel="adv-${id}" id="sub-adv-${id}" data-words="${esc(words)}" ${openPanels.has('adv-' + id) || settingsQuery.trim() ? 'open' : ''}><summary><h3>${esc(label)}</h3>${helpLink('settings-' + id, label)}</summary>${body()}</details>`).join('')}
        <p class="muted adv-none" hidden>No settings match that.</p>
      </div>` : ''}
    </section>`;
  }

  // The search box: shows the sections (and inside them the blocks) whose words match.
  function filterSettings() {
    const q = settingsQuery.trim().toLowerCase();
    let any = false;
    for (const sec of dlg.querySelectorAll('.adv-sec')) {
      const head = `${sec.querySelector('h3')?.textContent || ''} ${sec.dataset.words || ''}`.toLowerCase();
      const whole = !q || head.includes(q);
      let hit = whole;
      for (const el of [...sec.children].filter((c) => c.tagName !== 'SUMMARY')) {
        const show = whole || el.textContent.toLowerCase().includes(q);
        el.hidden = !show; if (show) hit = true;
      }
      sec.hidden = !hit; if (hit) any = true;
      if (q && hit) sec.open = true; else if (!q) sec.open = openPanels.has(sec.dataset.panel);
    }
    const none = dlg.querySelector('.adv-none'); if (none) none.hidden = any;
  }

  // 1.5.91 "Get Bob ready": one list with every program and model, each with its own tick box, the recommended ones
  // ticked, sizes and free disk shown first, one OK. Bob puts each one in its slot himself when it's in.
  let wPicks = null; // ticked ids (models and "engine:<id>"); null = the recommended ones
  let wIds = []; // what the last press started, for Pause and Stop
  function welcomeRows() {
    const pack = data.packs.find((p) => p.id === hw.suggestedPack) || data.packs[0];
    const main = allSlots().find((x) => x.id === 'bob');
    const bad = (checks || []).filter((c) => !c.ok).map((c) => c.id);
    const rows = readyList({ pack, models: data.models, engines: data.engines || [], hw: hwCtx(), mainEmpty: !(main && equipped(main, eqCtx())), bad });
    for (const r of rows) if (r.kind === 'model' && !r.blocked) { const m = data.models.find((x) => x.id === r.id); const st = m && suit(m); if (st?.level === 'blocked') r.blocked = st.why; else if (st && st.level !== 'ok' && !r.here) r.warn = 'not recommended for this replicant matrix'; }
    if (!wPicks) wPicks = readyDefaults(rows);
    return { pack, rows };
  }
  function welcomeHtml() {
    const { pack, rows } = welcomeRows();
    const order = readyOrder(rows, wPicks);
    const dlOf = (id) => (data.downloads || []).find((d) => d.id === id && ['queued', 'downloading', 'paused', 'failed'].includes(d.state));
    const state = (id) => (live.has(id) ? 'downloading' : dlOf(id)?.state || '');
    const SAY = { downloading: 'downloading…', queued: 'waiting its turn', paused: 'paused' };
    const watch = wIds.length ? wIds : order.ids;
    const moving = watch.some((id) => ['downloading', 'queued'].includes(state(id)));
    const paused = watch.some((id) => state(id) === 'paused');
    const short = readyFits(order.sizeGB);
    const row = (r) => {
      const st = state(r.id);
      const c = r.kind === 'engine' ? checks?.find((x) => x.id === r.id.slice(7)) : null;
      const status = st === 'failed' ? `✗ the download failed: ${esc(dlOf(r.id).error || 'press Get Bob ready again')}` : SAY[st]
        || (r.broken ? `✗ doesn't start${c?.why ? `: ${esc(c.why)}` : ''}, get it again` : r.swap ? 'came with me (basic version); this gets the faster NVIDIA version' : r.here ? (r.kind === 'engine' && !c ? 'here, checking…' : '✓ here') : gb(r.sizeGB));
      const what = r.kind === 'engine' ? 'program' : (r.slots || []).map((id) => SLOT_NAMES[id] || id).join(', ');
      const extra = r.blocked ? ` · ${esc(r.blocked)}` : r.warn ? ` · ${esc(r.warn)}` : r.id === 'ace-step-music' ? ' · needs the audio tools (about 12 GB more)' : r.note ? `<br><span class="muted">${esc(r.note)}</span>` : '';
      return `<li><label><input type="checkbox" data-wpick="${esc(r.id)}" ${r.here && !r.swap && !r.broken ? 'checked disabled' : r.blocked ? 'disabled' : wPicks.has(r.id) ? 'checked' : ''}> ${esc(r.name)} <span class="muted">· ${esc(what)} · ${status}${r.license ? ` · ${esc(r.license)}` : ''}${extra}</span></label></li>`;
    };
    const engines = rows.filter((r) => r.kind === 'engine'), models = rows.filter((r) => r.kind === 'model');
    return `<div class="welcome">
      <h2>Welcome to Bob</h2>
      <label class="callme"><strong>What should I call you?</strong> <input type="text" data-callme maxlength="40" value="${esc(settings?.callMe || '')}" placeholder="${esc(settings?.windowsName || 'your name')}" aria-label="What should Bob call you?" autocomplete="off"></label>
      <section class="ready home-first"><h3>My home folder</h3>${homeHtml({ welcome: true })}</section>
      <section class="ready"><h3>Get me ready</h3>
      <p class="muted">I call this computer my replicant matrix. You'll see that name around the app.</p>
      <p class="muted spec">${esc(hw.spec || 'specs not read yet')}</p>
      <p>Here's what I'd get so I can do everything on this replicant matrix: chat, code, see and make pictures, make clips, talk and listen. My picks are ticked. Untick anything you don't want, tick anything you do. Nothing downloads until you press the button, and I put each one in its slot myself when it's in.</p>
      <label class="pick"><strong>Setup</strong><select data-pack>${packsFor(data.packs, hw?.board === 'arm').map((p) => `<option value="${p.id}" ${p.id === pack.id ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select></label>
      <h4>Programs I run on</h4><ul class="packlist">${engines.map(row).join('')}</ul>
      <h4>Models</h4><ul class="packlist">${models.map(row).join('')}</ul>
      ${order.missing.length ? `<p class="warn-text">${order.missing.map((x) => `${esc(x.model)} runs on ${esc(x.engine)}, which isn't ticked.`).join(' ')} Tick it, or that model sits unused.</p>` : ''}
      <p>${order.ids.length ? `About <strong>${gb(order.sizeGB)}</strong> to download. Free disk: ${hw.freeGB ?? '?'} GB. The big ones take a while; you can chat with me as soon as the programs and a brain are in.` : rows.some((r) => !r.here && !r.blocked) ? 'Nothing ticked to get. You can always come back here: Settings, Run first-time setup.' : 'Everything is already on this replicant matrix.'}</p>
      ${short ? `<p class="error">Not enough free disk: free up ${short} GB, or untick something, then press Try again.</p>` : ''}
      ${job ? progress() : ''}
      <div class="row">${moving ? '<button data-readypause>Pause</button><button data-readystop>Stop</button>' : paused ? '<button class="get" data-readyresume>Resume</button><button data-readystop>Stop</button>' : short ? '<button class="get" data-readyrecheck>Try again</button>' : order.ids.length ? `<button class="get" data-getready>Get Bob ready (about ${gb(order.sizeGB)})</button>` : ''}<button data-skip>${order.ids.length && !moving ? 'Skip for now' : 'Done'}</button></div>
      <p class="muted">You can change any of this later in Get models (left menu). If you skip something and ask me for it, I'll offer to set it up right there in the chat.</p></section>
    </div>`;
  }

  function draw() {
    if (!data) { $('cellar-body').innerHTML = '<p class="muted">Loading...</p>'; return; }
    $('cellar-body').innerHTML = mode === 'welcome' ? welcomeHtml() : shopHtml();
    if (mode === 'welcome') dlg.querySelector('[data-getready]')?.focus(); // 1.5.75: the first button is Get Bob ready
    stylePage.paintPreviews(dlg, settings);
    const doll = dlg.querySelector('.doll-bob');
    if (doll) { const c = doll.getContext('2d'); c.imageSmoothingEnabled = false; try { drawBob(c, 160, {}, settings?.look); } catch {} }
    const mini = dlg.querySelector('.attr-avatar');
    if (mini) { const c = mini.getContext('2d'); c.imageSmoothingEnabled = false; try { drawBob(c, 64, {}, settings?.look); } catch {} }
    dlg.classList.toggle('wide', mode === 'shop' && tab === 'roles' && eqView !== 'list');
    mountHandsSettings(dlg.querySelector('.hands-box')); // loads its own data; does nothing off the Settings tab
    mountQuarantineSettings(dlg.querySelector('.q-box'));
    mountPhoneAccess(dlg.querySelector('.phone-box')); // Bob-Net, This Bob: Let my other replicant matrices in
    mountTelegram(dlg.querySelector('.telegram-box')); // Online services: Talk to Bob on Telegram
    mountCheckins(dlg.querySelector('.checkins-box')); // 1.5.78 Check-ins
    mountAdventureSettings(dlg.querySelector('.adventure-box'), { api, settings }); // 1.5.117 🎲 Adventure
    mountGamesSettings(dlg.querySelector('.games-box'), { api, settings }); // 1.5.121 🧩 Games
    mountShareBrains(dlg.querySelector('.share-box')); // Bob-Net: My other Bobs and What they share
    readyLine(); // 1.5.117: "Bob 1.5.117 is ready · Restart Bob now" on the updates line when a new Bob waits
    const page = mode === 'welcome' ? 'Welcome' : tab === 'settings' ? 'Settings' : tab === 'style' ? 'Style' : 'Get models';
    $('cellar-title').textContent = page;
    for (const [id, on] of [['cellarBtn', page === 'Get models'], ['settingsBtn', page === 'Settings'], ['styleBtn', page === 'Style'], ['chatBtn', false]]) $(id)?.classList.toggle('on', on);
    // The page tabs stay pinned under the title, so Settings, Style and every model page are one click away even after scrolling down to the paper doll.
    const head = dlg.querySelector('.cellar-head'); if (head) dlg.style.setProperty('--cellar-head-h', head.offsetHeight + 'px');
    const bar = dlg.querySelector('.cellar-tabs'); dlg.style.setProperty('--cellar-tabs-h', (bar ? bar.offsetHeight : 0) + 'px');
    if (tab === 'settings' && settingsQuery) filterSettings();
    if (houseFocus) { const d = dlg.querySelector(`#house-${houseFocus}`); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); d.querySelector('input, select')?.focus(); houseFocus = null; } }
    if (jumpTo) { const el = dlg.querySelector('#sub-' + CSS.escape(jumpTo)); jumpTo = ''; if (el?.tagName === 'DETAILS') el.open = true; el?.scrollIntoView({ block: 'start' }); }
  }

  // 1.5.74 "engines first": the Welcome's step 1 (core engines + a small starter brain), and whether each engine starts.
  let checks = null;
  const hwCtx = () => ({ vramGB: hw?.vramGB, ramGB: hw?.ramGB, unified: Boolean(hw?.gpu?.unified), integrated: Boolean(hw?.gpu?.integrated), arm: hw?.board === 'arm', nvidia: Boolean(hw?.gpu && !hw.gpu.unified && !hw.gpu.integrated && hw?.board !== 'arm') });
  // GB still to free on disk before step 1 may start (its size plus 2 GB to spare), or 0.
  const readyFits = (needGB) => (needGB && hw?.freeGB != null && hw.freeGB < needGB + 2 ? Math.ceil(needGB + 2 - hw.freeGB) : 0);
  const readyIds = () => wIds;
  async function getReady() {
    const { rows } = welcomeRows();
    const order = readyOrder(rows, wPicks);
    if (!order.ids.length || readyFits(order.sizeGB)) return;
    wIds = order.ids;
    // 1.5.91: Bob keeps the slots to fill himself (not the browser), so they're filled even with this window closed.
    job = await api('/api/models/download', { ids: order.ids, equip: order.equip });
  }
  async function load() {
    [data, hw, settings, roles, cloud, caps, bctx, rent] = await Promise.all([api('/api/models'), api('/api/hardware'), api('/api/settings'), api('/api/roles'), api('/api/cloud'), api('/api/capabilities').catch(() => ({})), api('/api/brain-ctx').catch(() => ({ on: false, brains: [] })), api('/api/rent').catch(() => rent)]);
    speedRuns = (await api('/api/speed-test').catch(() => ({}))).history || [];
    voices = (await api('/api/voice/samples').catch(() => ({}))).voices || [];
    job = data.job;
    await applyStarter().catch(() => {});
    if (mode === 'welcome') {
      checks = (await api('/api/engines/check').catch(() => null))?.checks || null;
    }
    live.clear();
    for (const d of data.downloads || []) if (d.state === 'downloading') live.set(d.id, { ...d, phase: d.phase === 'downloading' ? 'downloading' : d.phase });
    draw();
  }

  // ---- Equip Bob ----
  let catFocus = ''; // 1.5.56: which job the Brain catalogue opened at
  // 1.5.101: which model families are open in the Brain catalogue (job:family -> true). All start closed.
  const FAM_KEY = 'bob-cat-families';
  let famOpen = (() => { try { const v = JSON.parse(localStorage.getItem(FAM_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } })();
  const saveFam = () => { try { localStorage.setItem(FAM_KEY, JSON.stringify(famOpen)); } catch {} };
  let houseFocus = null; // 1.5.34: "Change" on a "Used your house style" line opens that House style box
  // 1.5.125 The chest on Equip Bob: the newest things Bob made (the Made by Bob list), loaded when the chest is opened.
  let chestState = { items: [], loaded: false, error: '' };
  async function loadChest() {
    try { chestState = { items: await api(`/api/made?limit=${CHEST_SHOW}`), loaded: true, error: '' }; }
    catch (e) { chestState = { items: [], loaded: true, error: `I couldn't open the chest: ${e.message}` }; }
    if (eqSelected === 'chest') { const y = dlg.scrollTop; draw(); dlg.scrollTop = y; }
  }
  // 1.5.125 Bob's home folder: sizes and warnings come from /api/home when the panel is opened.
  let homeInfo = null, homeAsk = null; // homeAsk: a folder waiting for "Yes, move everything"
  async function loadHome() {
    homeInfo = { loading: true };
    try { homeInfo = await api('/api/home'); } catch (e) { homeInfo = { error: e.message, folder: settings?.home || '' }; }
    const y = dlg.scrollTop; draw(); dlg.scrollTop = y;
  }
  let eqSelected = 'bob', eqView = (() => { try { return localStorage.getItem('bob-equip-view') || 'doll'; } catch { return 'doll'; } })();
  function eqCtx() {
    return { roles, models: data?.models || [], brains: settings?.sessionBrains || {}, embed: roles?.current?.embed || '', selected: eqSelected, vramGB: hw?.vramGB || hw?.gpu?.vramGB || null, unified: Boolean(hw?.gpu?.unified), integrated: Boolean(hw?.gpu?.integrated), arm: hw?.board === 'arm', ramGB: hw?.ramGB || null, freeGB: hw?.freeGB ?? null, platform: settings?.platform, showUnsuited,
      famOpen, packs: data?.packs || [], packId: starterPack, picks: starterPicks, engines: data?.engines || [], starterOpen,
      houseStyle: settings?.houseStyle || {}, active: settings?.activeModels || {}, chest: chestState, saveDir: settings?.saveDir || {}, // 1.5.125 the chest
      rent, // 1.5.127 the Rented brain slot
      attributes: settings ? attributesHtml({ personality: settings.personality, look: settings.look, lookText: settings.lookText, lookComments: settings.lookComments, user: settings.userName, callMe: settings.callMe, windowsName: settings.windowsName }) : '' };
  }
  // Starter set: which set, what's ticked (null = the defaults), and what still has to be equipped once it's downloaded.
  let starterPack = null, starterPicks = null, starterOpen = null;
  const PLAN_KEY = 'bob-starter-plan';
  const readPlan = () => { try { return JSON.parse(localStorage.getItem(PLAN_KEY) || '{}'); } catch { return {}; } };
  const savePlan = (p) => { try { Object.keys(p).length ? localStorage.setItem(PLAN_KEY, JSON.stringify(p)) : localStorage.removeItem(PLAN_KEY); } catch {} };
  const currentPack = () => { const ps = data?.packs || []; return ps.find((p) => p.id === starterPack) || packFor(ps, eqCtx().vramGB, eqCtx().integrated, { arm: eqCtx().arm, ramGB: eqCtx().ramGB }); };
  const currentPicks = () => starterPicks || starterTicks(currentPack(), data.models, eqCtx().vramGB);
  // Put each starter model that is now on this PC into its slots (the person pressed "Equip starter set" for this).
  async function applyStarter() {
    const plan = readPlan();
    const ids = Object.keys(plan);
    if (!ids.length || !roles) return false;
    let changed = false;
    for (const id of ids) {
      const m = data.models.find((x) => x.id === id);
      if (!m || m.status?.state !== 'installed') continue;
      for (const sid of plan[id]) {
        const slot = allSlots().find((s) => s.id === sid);
        const v = slot && slotValue(slot, m, roles);
        if (v && equipped(slot, eqCtx()) !== v) { await equipSlot(slot, v).catch(() => {}); changed = true; }
      }
      delete plan[id];
    }
    savePlan(plan);
    if (changed) await eqReload();
    return changed;
  }
  async function eqReload() { [roles, settings, bctx] = await Promise.all([api('/api/roles'), api('/api/settings'), api('/api/brain-ctx').catch(() => bctx)]); }
  // Puts a model in a slot (or takes it off with value ''), then redraws. Returns what the server said.
  async function equipSlot(slot, value) {
    let r = {};
    if (slot.how === 'brain') r = await api('/api/settings', { sessionBrains: { [slot.id]: value } });
    else if (slot.how === 'embed') r = await api('/api/settings', { housekeeping: { embedModel: value } });
    else r = await api('/api/models/role', { job: slot.id, value });
    return r;
  }
  async function equip(slotId, value, { offer = true } = {}) {
    const slot = allSlots().find((s) => s.id === slotId);
    if (!slot) return;
    const r = await equipSlot(slot, value);
    await eqReload();
    eqSelected = slotId;
    draw();
    const panel = dlg.querySelector('.kit-panel');
    if (r.needsEngine && panel) askEngine(panel);
    if (offer && value && slot.kind === 'llm') offerMore(slot, value);
  }
  // One model, several slots: offer the other slots it can fill. Empty ones are ticked; occupied ones aren't.
  async function offerMore(slot, value) {
    const ctx = eqCtx();
    // Only the jobs this model can do (public/fit.js canDo: Bob's list, or what the engine says it can do).
    const fits = allSlots().filter((s) => s.id !== slot.id && s.kind === 'llm' && s.how !== 'embed' && slotTakes(s, value, ctx) && equipped(s, ctx) !== value);
    const hears = (roles.options.voice || []).find((o) => o.value === `ollama:${value}`);
    if (hears && roles.current.voice !== hears.value) fits.push({ ...allSlots().find((s) => s.id === 'voice'), value: hears.value });
    if (!fits.length) return;
    const panel = dlg.querySelector('.kit-panel');
    if (!panel) return;
    const box = document.createElement('div');
    box.className = 'confirm also';
    box.innerHTML = `<p><strong>Also use it for:</strong> <span class="muted">one model in several slots loads once, so there's no swap between those jobs.</span></p>
      ${fits.map((s) => { const cur = equipped(s, ctx); const helper = HELPERS.some((h) => h.id === s.id); return `<label class="also-row"><input type="checkbox" data-also="${s.id}" data-alsovalue="${s.value || value}" ${cur || helper ? '' : 'checked'}> ${s.icon} ${esc(s.name)} <span class="muted">${cur ? `(now: ${esc(cur)})` : helper ? '(uses the main brain now)' : '(empty)'}</span></label>`; }).join('')}
      <div class="row"><button type="button" class="get" data-alsogo>Use it for these</button><button type="button" data-alsono>No thanks</button></div>`;
    panel.prepend(box);
  }

  function confirmBox(el, m, anyway) {
    const box = el.querySelector('.confirm');
    const hosts = m.files.length ? 'Hugging Face' : 'Ollama';
    box.hidden = false;
    box.innerHTML = `${anyway ? `<p class="error">Not recommended: ${esc(suit(m).why)}</p>` : ''}<p>Download <strong>${esc(m.name)}</strong>: about ${gb(m.sizeGB)} from ${hosts}. Licence: ${esc(m.license)}${m.commercial ? '' : ' (personal use only)'}.</p><div class="row"><button class="get" data-yes="${esc(m.id)}">Yes, download</button><button data-no>Cancel</button></div>`;
  }

  // Remember which panels are open (not while a search opened them).
  dlg.addEventListener('toggle', (e) => { const d = e.target; if (!d.dataset?.panel || settingsQuery.trim()) return; if (d.open) openPanels.add(d.dataset.panel); else openPanels.delete(d.dataset.panel); saveOpen();
    // An everyday panel closing shows its summary of what's set now: draw again so it's up to date.
    if (!d.open && d.dataset.panel.startsWith('ev-')) { const y = dlg.scrollTop; draw(); dlg.scrollTop = y; } }, true);
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('button, input, select');
    if (!b) return;
    if (b.tagName === 'BUTTON' && b.closest('summary')) e.preventDefault(); // 1.5.117: Check for updates on a panel's line
    try {
      if ((tab === 'style' || (tab === 'settings' && (b.dataset.motion || b.dataset.nowneed))) && mode === 'shop' && await stylePage.onClick(b, settings)) return;
      if (b.dataset.sampleEngine) { sampler.play(b); return; }
      if (b.dataset.gomodel) { setTab(b.dataset.gocat); jumpTo = ''; draw(); dlg.querySelector('#m-' + CSS.escape(b.dataset.gomodel))?.scrollIntoView({ block: 'center' }); return; }
      if ('unsuitedsw' in b.dataset) { setShowUnsuited(!showUnsuited); draw(); return; }
      if ('lookcomments' in b.dataset) { const on = b.getAttribute('aria-checked') !== 'true'; const r = await api('/api/settings', { lookComments: on }); settings.lookComments = r.lookComments; b.setAttribute('aria-checked', String(r.lookComments)); b.querySelector('.st').textContent = r.lookComments ? 'On' : 'Off'; return; }
      if ('unsuited' in b.dataset) { setShowUnsuited(!showUnsuited); draw(); return; }
      if (b.dataset.help && b.closest('summary')) e.preventDefault(); // a "?" in a panel heading opens Help, not the panel
      if (b.dataset.panels) { for (const d of dlg.querySelectorAll('.adv-sec')) { d.open = b.dataset.panels === 'open'; if (d.open) openPanels.add(d.dataset.panel); else openPanels.delete(d.dataset.panel); } saveOpen(); return; }
      if (b.dataset.help) { window.dispatchEvent(new CustomEvent('bob-help', { detail: b.dataset.help })); return; }
      if (b.dataset.userole) {
        const r = await api('/api/models/role', { job: b.dataset.userole, value: b.dataset.value });
        roles.current[b.dataset.userole] = b.dataset.value;
        if (r.needsEngine) askEngine(b.closest('td') || b.parentElement); else draw();
        return;
      }
      if ('gohouse' in b.dataset) { eqView = 'doll'; eqSelected = 'music'; houseFocus = 'music'; setTab('roles'); draw(); await load().catch(() => {}); return; }
      // 1.5.41 Where Bob saves things.
      if ('savebrowse' in b.dataset) { const r = await api('/api/pick-folder', { purpose: 'save' }); const box = dlg.querySelector('#save-path'); if (r.folder && box) { box.value = r.folder; saveDirState(); await saveDirTo(r.folder); } else if (r.error) { const eb = dlg.querySelector('.save-error'); if (eb) { eb.textContent = r.error; eb.hidden = false; } } return; }
      if ('savedir' in b.dataset) { const v = dlg.querySelector('#save-path')?.value.trim(); if (v) await saveDirTo(v); return; }
      if ('saveown' in b.dataset) { await saveDirTo(''); return; }
      if ('openmemory' in b.dataset) { try { await api('/api/open', { path: settings?.memoryBanks?.file || '' }); } catch (err) { flash(b, err.message); } return; }
      if ('saveopen' in b.dataset) { try { await api('/api/open', { path: settings?.saveDir?.folder || '' }); } catch (err) { const eb = dlg.querySelector('.save-error'); if (eb) { eb.textContent = err.message; eb.hidden = false; } } return; }
      if ('projbrowse' in b.dataset) { const r = await api('/api/pick-folder', {}); const box = dlg.querySelector('#proj-path'); if (r.folder && box) { box.value = r.folder; projAddState(); const nm = dlg.querySelector('#proj-name'); if (nm && !nm.value) nm.value = r.folder.split(/[\\/]/).filter(Boolean).pop() || ''; } else if (r.error) { const eb = dlg.querySelector('.proj-error'); if (eb) { eb.textContent = r.error; eb.hidden = false; } } return; }
      if ('projadd' in b.dataset) {
        const name = dlg.querySelector('#proj-name')?.value.trim(); const dir = dlg.querySelector('#proj-path')?.value.trim();
        const eb = dlg.querySelector('.proj-error');
        if (!name || !dir) { if (eb) { eb.textContent = 'Give the project a name and a folder.'; eb.hidden = false; } return; }
        const list = [...(settings.projectList || []), { name, path: dir }];
        await saveProjects(list, settings.defaultProject || (list.length === 1 ? name : undefined));
        return;
      }
      // 1.5.79 How-tos: edit, delete (two clicks, no pop-up), cancel.
      if (b.dataset.howtoedit) { howtoEditing = b.dataset.howtoedit; howtoDeleting = null; draw(); return; }
      if (b.dataset.howtoask) { howtoDeleting = b.dataset.howtoask; howtoEditing = null; draw(); return; }
      if ('howtocancel' in b.dataset) { howtoEditing = howtoDeleting = null; draw(); return; }
      if (b.dataset.howtodel) { await api('/api/howtos/delete', { id: b.dataset.howtodel }); howtoDeleting = null; howtosList = null; settings.howtoCount = Math.max(0, (settings.howtoCount || 1) - 1); draw(); return; }
      if (b.dataset.howtosave) {
        const row = b.closest('.howto-row');
        try {
          await api('/api/howtos/edit', { id: b.dataset.howtosave, name: row.querySelector('[data-rname]').value, when: row.querySelector('[data-rwhen]').value, steps: row.querySelector('[data-rsteps]').value.split('\n') });
          howtoEditing = null; howtosList = null; draw();
        } catch (err) { const eb = row.querySelector('.howto-error'); if (eb) { eb.textContent = err.message; eb.hidden = false; } }
        return;
      }
      if (b.dataset.projremove !== undefined) { const list = (settings.projectList || []).filter((_, i) => i !== Number(b.dataset.projremove)); await saveProjects(list); return; }
      if (b.dataset.removebob !== undefined) {
        const box = dlg.querySelector('.remove-confirm');
        const pl = await api('/api/uninstall');
        box.hidden = false;
        box.innerHTML = pl.canRun ? `<p>Remove Bob from <code>${esc(pl.app)}</code>? Bob closes, and a small window finishes the job.</p>
          ${pl.inn ? `<label class="switch"><input type="checkbox" data-rmnotes><span>Also delete everything in <code>${esc(pl.inn)}</code>: his chats, settings, task list and saved voice samples. They go to the Recycle Bin. The rest of the inn folder (notice board, logbook, pictures, other agents' files) stays.</span></label>` : ''}
          ${pl.models ? `<label class="switch"><input type="checkbox" data-rmmodels><span>Also delete everything in <code>${esc(pl.models)}</code>: the models and engines he downloaded (to the Recycle Bin).</span></label>` : ''}
          <div class="row"><button class="danger" data-rmyes>Yes, remove Bob</button><button data-rmno>Cancel</button></div>` : `<p class="muted">${esc(pl.why)}</p>`;
        return;
      }
      if (b.dataset.rmno !== undefined) { const box = dlg.querySelector('.remove-confirm'); box.hidden = true; box.innerHTML = ''; return; }
      if (b.dataset.rmyes !== undefined) {
        b.disabled = true;
        const r = await api('/api/uninstall', { confirm: 'remove', notes: Boolean(dlg.querySelector('[data-rmnotes]')?.checked), models: Boolean(dlg.querySelector('[data-rmmodels]')?.checked) });
        dlg.querySelector('.remove-confirm').innerHTML = `<p>Removing Bob${r.removes?.inn ? ', his chats and settings' : ''}${r.removes?.models ? ', his models' : ''}. Bob closes now.</p>`;
        return;
      }
      if ('opentidy' in b.dataset) { dlg.close(); window.dispatchEvent(new Event('bob-tidy')); return; }
      if ('hkrun' in b.dataset) { const r = await api('/api/hk/run', {}); b.parentElement.querySelector('.hk-out').textContent = r.busy ? 'Bob is already on it.' : 'Started. Bob tells you in the chat when he\'s done; chats are summed up only with a brain loaded.'; return; }
      if (b.dataset.usevoice) { const r = await api('/api/settings', { tts: { voice: b.dataset.usevoice } }); settings.tts = { ...settings.tts, ...r.tts }; draw(); return; }
      if (b.dataset.starter) {
        const pack = currentPack();
        const { ids, plan } = starterPlan(pack, data.models, data.engines || [], currentPicks());
        const box = dlg.querySelector('.starter-confirm');
        const names = ids.map((id) => { if (id.startsWith('engine:')) { const e = engineById(id.slice(7)); return `<li>${esc(e?.name || id)} <span class="muted">(engine, ${esc(ENGINE_SIZE[id.slice(7)] || 'small')})</span></li>`; } const m = data.models.find((x) => x.id === id); return `<li>${esc(m.name)} <span class="muted">${gb(m.sizeGB)} from ${m.ollama && (!m.files?.length || settings?.engine === 'ollama') ? 'Ollama' : 'Hugging Face'} · licence ${esc(m.license)}</span></li>`; }).join('');
        const total = ids.reduce((n, id) => n + (data.models.find((m) => m.id === id)?.sizeGB || 0), 0);
        box.hidden = false;
        box.innerHTML = `${ids.length ? `<p>Download these, about ${gb(total)} in all${hw?.freeGB != null ? ` (${hw.freeGB} GB free)` : ''}. Each one is put in its slot when it's done.</p><ul>${names}</ul>${ids.some((id) => ['engine:kokoro', 'engine:audio'].includes(id)) ? '<p class="muted">If there\'s no Python on this replicant matrix, I get my own copy too (about 15 MB, kept in my folder).</p>' : ''}` : '<p>Everything ticked is already on this replicant matrix. Bob puts each one in its slot now.</p>'}
          <div class="row"><button class="get" data-starteryes>${ids.length ? 'Yes, download and equip' : 'Equip them'}</button><button data-no>Cancel</button></div>`;
        box.dataset.plan = JSON.stringify({ ids, plan });
        return;
      }
      if ('starteryes' in b.dataset) {
        const box = b.closest('.starter-confirm');
        const { ids, plan } = JSON.parse(box.dataset.plan || '{}');
        savePlan({ ...readPlan(), ...plan });
        if (ids?.length) job = await api('/api/models/download', { ids });
        await applyStarter();
        draw();
        return;
      }
      if (b.dataset.askbob) { dlg.close(); window.dispatchEvent(new CustomEvent('bob-ask', { detail: b.dataset.askbob })); return; }
      if ('resetbob' in b.dataset) { const r = await api('/api/settings', { personality: DEFAULTS }); settings.personality = r.personality; draw(); return; }
      // 1.5.56 Brain catalogue: Get more (from a kit or a menu) opens it at that job; Active switches; Equip from a row.
      if ('recheck' in b.dataset) { b.disabled = true; const y = dlg.scrollTop; await load(); dlg.scrollTop = y; return; } // 1.5.56
      if (b.dataset.catjob) { catFocus = b.dataset.catjob; setTab('catalogue'); draw(); dlg.querySelector('#catjob-' + CSS.escape(catFocus))?.scrollIntoView({ block: 'start' }); return; }
      if (b.dataset.famall) { const open = b.dataset.famall === 'open'; for (const d of dlg.querySelectorAll('details.cat-fam')) { d.open = open; if (open) famOpen[d.dataset.fam] = true; else delete famOpen[d.dataset.fam]; } saveFam(); return; } // 1.5.101
      if (b.dataset.catjump) { catFocus = b.dataset.catjump; dlg.querySelector('#catjob-' + CSS.escape(catFocus))?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if (b.dataset.active) {
        const on = b.getAttribute('aria-checked') !== 'true';
        const r = await api('/api/settings', { activeModels: { [b.dataset.active]: on } });
        settings.activeModels = r.activeModels || { ...(settings.activeModels || {}), [b.dataset.active]: on };
        const y = dlg.scrollTop; draw(); dlg.scrollTop = y; return;
      }
      if (b.dataset.catequip) { const y = dlg.scrollTop; await equip(b.dataset.catequip, b.dataset.catvalue, { offer: false }); dlg.scrollTop = y; return; }
      if (b.dataset.slotpick) { eqSelected = b.dataset.slotpick; draw(); dlg.querySelector('.kit-panel')?.scrollIntoView({ block: 'nearest' }); return; }
      // 1.5.125 the chest
      if ('chest' in b.dataset) { eqSelected = 'chest'; chestState = { ...chestState, loaded: false }; draw(); dlg.querySelector('.kit-panel')?.scrollIntoView({ block: 'nearest' }); loadChest(); return; }
      if ('chestreload' in b.dataset) { chestState = { ...chestState, loaded: false }; draw(); loadChest(); return; }
      if ('chestall' in b.dataset) { $('madeBtn')?.click(); return; }
      // 1.5.127 rented brains
      if ('rentuse' in b.dataset) { rent = await api('/api/rent/settings', { current: b.dataset.rentuse }); window.dispatchEvent(new CustomEvent('bob-rent-slot', { detail: { rental: (rent.rentals || []).find((x) => x.id === rent.current)?.name || '' } })); draw(); return; }
      if ('rentsettings' in b.dataset) { sampler.stop(); setTab('settings'); advanced = true; try { localStorage.setItem('bob-settings-advanced', '1'); } catch {} jumpTo = 'adv-online'; draw(); return; }
      if (b.dataset.rentwarnok) { rent = await api('/api/rent/settings', { enabled: { [b.dataset.rentwarnok]: true }, warned: { [b.dataset.rentwarnok]: true } }); draw(); return; }
      if (b.dataset.rentwarnno) { const box = b.closest('.rent-warn'); if (box) box.hidden = true; return; }
      // Several cards at once: the warning card's answer. Yes keeps the count; no puts it back to 1 card.
      if (b.dataset.rentmultiok) { const box = b.closest('.rent-add'); box.querySelector('.rent-multi-warn').hidden = true; box.querySelector('[data-rentadd="cards"]').dataset.ok = b.dataset.rentmultiok; return; }
      if ('rentmultino' in b.dataset) { const box = b.closest('.rent-add'); box.querySelector('.rent-multi-warn').hidden = true; const sel = box.querySelector('[data-rentadd="cards"]'); sel.value = '1'; delete sel.dataset.ok; return; }
      if (b.dataset.rentremove) { rent = await api('/api/rent/remove', { id: b.dataset.rentremove }); draw(); return; }
      if (b.dataset.rentprice) { try { rent = await api('/api/rent/price', { id: b.dataset.rentprice }); flash(b, 'Price read.'); } catch (e) { alertIn(b, e.message); } draw(); return; }
      if ('rentstop' in b.dataset) { b.disabled = true; b.textContent = 'Stopping…'; rent = await api('/api/rent/stop', {}); draw(); return; }
      if (b.dataset.rentstopone) { b.disabled = true; try { rent = await api('/api/rent/stop-leftover', { id: b.dataset.rentstopone }); } catch (e) { alertIn(b, e.message); } draw(); return; }
      if ('rentcheck' in b.dataset) { b.disabled = true; rent = await api('/api/rent/check', {}); draw(); return; }
      if ('rentaddgo' in b.dataset) {
        const box = b.closest('.rent-add');
        const val = (k) => box.querySelector(`[data-rentadd="${k}"]`)?.value?.trim() || '';
        const noteEl = box.querySelector('.rent-add-note');
        const svc = (rent.services || []).find((x) => x.id === val('service'));
        const missing = !val('model') ? 'Type the model\'s name first, as the service lists it.' : svc?.id === 'other' && !/^https?:\/\//.test(val('address')) ? 'Type the service\'s web address first (https://…/v1).' : svc?.id === 'other' && !val('keyEnv') ? 'Name the variable that holds the key first.' : '';
        if (missing) { alertIn(b, missing); if (noteEl) { noteEl.textContent = missing; noteEl.classList.remove('muted'); noteEl.classList.add('error'); } return; }
        try {
          const r = await api('/api/rent/add', { service: val('service'), model: val('model'), card: val('card'), cards: Number(val('cards')) || 1, address: val('address'), keyEnv: val('keyEnv'), name: val('name') });
          rent = r; draw();
          const added = (rent.rentals || []).find((x) => x.id === r.added);
          dlg.querySelector('#sub-adv-online .rent-add-note')?.replaceChildren(document.createTextNode(`Added ${added?.name || ''}${rent.current === r.added ? ' and put it in the Rented brain slot' : ''}.${r.priceNote ? ' ' + r.priceNote : ''}`));
        } catch (e) { alertIn(b, e.message); if (noteEl) { noteEl.textContent = e.message; noteEl.classList.remove('muted'); noteEl.classList.add('error'); } }
        return;
      }
      if ('chestbrowse' in b.dataset) { const r = await api('/api/pick-folder', { purpose: 'save' }); if (r.folder) await saveDirTo(r.folder); else if (r.error) { const eb = dlg.querySelector('.chest-error'); if (eb) { eb.textContent = r.error; eb.hidden = false; } } return; }
      // 1.5.125 Bob's home folder: pick (or type) a folder, see the size, then one Yes before anything moves.
      if ('homebrowse' in b.dataset) { const r = await api('/api/pick-folder', { purpose: 'home' }); if (r.folder) await homeAskFor(r.folder); else if (r.error) homeError(r.error); return; }
      if ('homemove' in b.dataset) { const v = dlg.querySelector('#home-path')?.value.trim(); if (v) await homeAskFor(v); return; }
      if ('homeno' in b.dataset) { homeAsk = null; draw(); return; }
      if ('homego' in b.dataset) { if (!homeAsk) return; b.disabled = true; b.textContent = 'Moving…'; const r = await api('/api/home', { folder: homeAsk.folder, confirm: true }); if (!r.ok) { homeError(r.error || 'Couldn\'t move.'); b.disabled = false; b.textContent = homeAsk?.pickedCloud ? 'Move there anyway' : 'Yes, move everything'; } return; }
      if (b.dataset.equip && b.tagName === 'BUTTON') { await equip(eqSelected, b.dataset.equip); return; }
      if (b.dataset.unequip) { const sl = allSlots().find((s) => s.id === b.dataset.unequip); await equip(sl.id, sl.off === 'windows' ? 'windows' : '', { offer: false }); return; }
      if (b.dataset.eqview) { eqView = b.dataset.eqview; try { localStorage.setItem('bob-equip-view', eqView); } catch {} draw(); return; }
      if ('alsono' in b.dataset) { b.closest('.also').remove(); return; }
      if ('alsogo' in b.dataset) {
        const picks = [...b.closest('.also').querySelectorAll('input[data-also]:checked')];
        for (const c of picks) await equipSlot(allSlots().find((s) => s.id === c.dataset.also), c.dataset.alsovalue);
        await eqReload(); draw();
        return;
      }
      if (b.dataset.jump) { const t = dlg.querySelector('#sub-' + CSS.escape(ADV_MOVED[b.dataset.jump] || b.dataset.jump)); if (t?.tagName === 'DETAILS' && !t.open) { t.open = true; openPanels.add(t.dataset.panel); saveOpen(); } t?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
      if ('golook' in b.dataset) { sampler.stop(); setTab('style'); stylePage.openMaker(settings); draw(); dlg.querySelector('.char-box')?.scrollIntoView({ block: 'start' }); return; } // 1.5.122: Change his look / Change look
      if (b.dataset.tab) { sampler.stop(); setTab(b.dataset.tab); if (!jumpTo) dlg.scrollTop = 0; draw(); }
      else if (b.dataset.get) confirmBox(b.closest('.model'), data.models.find((m) => m.id === b.dataset.get));
      else if (b.dataset.anyway) confirmBox(b.closest('.model'), data.models.find((m) => m.id === b.dataset.anyway), true);
      else if (b.dataset.look) { await api('/api/settings', { look: b.dataset.look }); setLook(b.dataset.look); draw(); }
      else if (b.dataset.engine) {
        const box = b.closest('.model').querySelector('.confirm');
        box.hidden = false;
        const eng = (data.engines || []).find((x) => x.id === b.dataset.engine);
        box.innerHTML = ['kokoro', 'chatterbox'].includes(b.dataset.engine)
          ? `<p>Set up ${esc(eng?.name)}: ${esc(eng?.what)} It goes in Bob's own folder; nothing else on your replicant matrix changes. If there's no Python here, Bob gets his own copy too (about 15 MB, in his folder).</p>`
          : b.dataset.engine === 'audio'
          ? `<p>Set up the audio tools: ACE-Step 1.5 for music (MIT, a song in seconds) and AudioLDM 2 for sound effects (personal use only), each in its own folder only Bob uses. If there's no Python here, Bob gets his own copy first (about 15 MB, in his folder). About 6 GB now. The music models (about 10 GB) are a separate download that you start; sound effects fetch their model the first time you make one. Nothing else on your replicant matrix changes.</p>`
          : b.dataset.engine === 'libreoffice'
          ? `<p>Download LibreOffice ${esc(eng?.pin || '')} (about 350 MB) from The Document Foundation, checked against its pinned checksum, and unpack it into Bob's own folder (about 1 GB). Nothing is installed in Windows and no admin rights are needed. You can also install LibreOffice yourself from <a href="https://www.libreoffice.org/download/" target="_blank" rel="noopener">libreoffice.org</a>, or use OpenOffice: Bob finds either by himself.</p>`
          : b.dataset.engine === 'ffmpeg'
          ? `<p>Download FFmpeg ${esc(eng?.pin || '')} (Gyan's essentials build, about 100 MB) from GitHub, checked against its pinned checksum, into Bob's own folder. It runs only while it converts.</p>`
          : `<p>Download ${esc(({ llamacpp: 'llama.cpp', sdcpp: 'stable-diffusion.cpp', whispercpp: 'whisper.cpp', piper: 'Piper' })[b.dataset.engine] || b.dataset.engine)} from GitHub (usually 20 to 600 MB, more with NVIDIA runtime files).</p>`;
        box.innerHTML += `<div class="row"><button class="get" data-yes="engine:${esc(b.dataset.engine)}${b.dataset.newest ? '@newest' : ''}">Yes, download</button><button data-no>Cancel</button></div>`;
      }
      else if ('no' in b.dataset) b.closest('.confirm').hidden = true;
      else if (b.dataset.yes) { job = await api('/api/models/download', { id: b.dataset.yes }); draw(); }
      else if ('cancel' in b.dataset) await api('/api/models/cancel', b.dataset.cancel ? { id: b.dataset.cancel } : {});
      else if (b.dataset.pausedl) await api('/api/models/pause', { id: b.dataset.pausedl });
      // 1.5.118 Save a help bundle: one zip for whoever helps with this Bob (help-bundle.js). The folder opens afterwards.
      else if ('helpbundle' in b.dataset) {
        const box = b.closest('.updates').querySelector('.help-bundle');
        b.disabled = true; box.textContent = 'Putting the bundle together... Pick a folder when the window opens. Up to a minute if my brain adds its own note.';
        try {
          const r = await api('/api/help-bundle', {});
          if (r.cancelled) box.textContent = 'Nothing saved: you closed the folder window.';
          else if (!r.ok) box.textContent = `Couldn't save the bundle: ${r.why || 'unknown reason'}`;
          else box.innerHTML = `Saved <strong>${esc(r.file.split(/[\\/]/).pop())}</strong> in ${esc(r.folder)}${r.pickedFolder ? '' : ' (no folder picker here, so it went in my own folder)'}. ${r.brainNote ? 'I added my own note about what I think is wrong.' : 'My brain couldn\'t add a note, so the bundle was put together automatically.'} Give the zip to whoever is helping, or open an issue at github.com/MouseWurX/Bob/issues.`;
        } catch (e) {
          // From a phone or another device there is no folder to pick on this replicant matrix: the zip downloads instead.
          if (/Only on this replicant matrix/.test(e.message)) { box.textContent = 'Downloading the bundle here...'; location.href = '/api/help-bundle'; }
          else box.textContent = `Couldn't save the bundle: ${esc(e.message)}`;
        }
        b.disabled = false;
      }
      else if ('pccheck' in b.dataset) {
        const box = b.closest('.updates').querySelector('.pc-check');
        b.disabled = true; box.innerHTML = '<p class="muted">Checking this replicant matrix...</p>';
        try { box.innerHTML = pcCheckHtml(await api('/api/pc-check')); } catch (e) { box.innerHTML = `<p>Couldn't check this replicant matrix: ${esc(e.message)}</p>`; }
        b.disabled = false;
      }
      else if ('speedtest' in b.dataset) {
        const out = b.parentElement.querySelector('.speed-out');
        b.disabled = true; out.textContent = 'Testing... (about a minute)';
        try { const r = await api('/api/speed-test', {}); speedRuns = r.history || speedRuns; draw(); }
        catch (e) { out.textContent = e.message; b.disabled = false; }
      }
      else if ('checkupdate' in b.dataset) {
        const out = b.parentElement.querySelector('.update-out');
        out.textContent = 'Checking GitHub...';
        const c = await api('/api/update/check');
        if (c.waiting) { out.innerHTML = 'The new Bob is downloaded, checked and waiting. <button class="get" data-restartnow>Restart Bob now</button>'; return; }
        const notes = c.github?.page ? ` <a href="${esc(c.github.page)}" target="_blank" rel="noopener">What's new</a>` : '';
        const offline = c.githubError ? ` (GitHub: ${esc(c.githubError)})` : '';
        // When the source folder and GitHub both have something, say which one won.
        const other = c.from === 'github' && c.source ? ` (your source folder has ${esc(c.sourceLabel || c.current.label)})` : c.from === 'source' && c.github?.label ? ` (GitHub has ${esc(c.github.label)})` : '';
        if (c.newer && c.canRun && c.from === 'github') out.innerHTML = `Newest is ${esc(c.available.label)} from GitHub${other}${c.github?.sizeMB ? `, ${c.github.sizeMB} MB` : ''}.${notes} <button class="get" data-startupdate>Update Bob</button>`;
        else if (c.newer && c.canRun) out.innerHTML = `Newest is ${esc(c.available.label)} from your source folder${other}.${offline} <button class="get" data-startupdate>Update Bob</button>`;
        else if (c.newer) out.innerHTML = `Bob ${esc(c.available.label)} is out, but: ${esc(c.why)}${notes}`;
        else out.innerHTML = c.githubError ? `I couldn't check GitHub: ${esc(c.githubError)} (you have Bob ${esc(c.current.label)}).` : `Up to date (Bob ${esc(c.current.label)}).`;
      }
      else if ('startupdate' in b.dataset) {
        b.disabled = true;
        const r = await api('/api/update/start', {});
        b.outerHTML = r.via === 'github' ? '<span class="have">Downloading from GitHub. The steps show here.</span>' : '<span class="have">The update window is open. The steps show here too.</span>';
        window.dispatchEvent(new Event('bob-update-started'));
        watchUpdate();
      }
      else if ('restartnow' in b.dataset) { b.disabled = true; await api('/api/update/restart', { when: 'now' }); b.outerHTML = '<span class="have">Restarting...</span>'; }
      else if ('opendl' in b.dataset) { window.dispatchEvent(new Event('bob-downloads')); }
      else if (b.dataset.use) { const r = await api('/api/models/use', { id: b.dataset.use }); const at = b.parentElement; b.outerHTML = `<span class="have">Saved.</span>`; if (r.needsEngine) askEngine(at); }
      else if (b.dataset.checkengine) {
        b.textContent = 'Checking...';
        const r = await api(`/api/engines/latest?id=${encodeURIComponent(b.dataset.checkengine)}`);
        b.outerHTML = r.newer ? `<button class="get" data-engine="${esc(r.id)}" data-newest="1">Get newer build: ${esc(r.latest)}${r.installed ? ` (you have ${esc(r.installed)}${r.tested && r.installed === r.tested ? ', the tested one' : ''})` : ''}</button>${r.tested ? `<span class="muted">Newer builds haven't been through Bob's speed tests yet. If one gives trouble, <strong>Go back to the tested build</strong> puts ${esc(r.tested)} back.</span>` : ''}` : `<span class="muted">Up to date (${esc(r.latest)}).</span>`;
      }
      else if (b.dataset.switchengine) { await api('/api/settings', { engine: b.dataset.switchengine }); settings.engine = b.dataset.switchengine; b.closest('.confirm').outerHTML = '<span class="have">Switched. Restart Bob to use his own engine.</span>'; }
      else if ('scan' in b.dataset) { b.textContent = 'Looking...'; await api('/api/models/scan', {}); await load(); }
      else if ('welcome' in b.dataset) { mode = 'welcome'; draw(); }
      else if ('getready' in b.dataset) { b.disabled = true; await getReady(); await load(); }
      else if ('readyrecheck' in b.dataset) { b.disabled = true; await load(); }
      else if ('readypause' in b.dataset || 'readyresume' in b.dataset || 'readystop' in b.dataset) {
        const act = 'readypause' in b.dataset ? 'pause' : 'readyresume' in b.dataset ? 'resume' : 'cancel';
        b.disabled = true;
        for (const id of readyIds()) await api('/api/models/' + act, { id }).catch(() => {});
        await load();
      }
      else if ('skip' in b.dataset) { await api('/api/settings', { setupDone: true }); mode = 'shop'; dlg.close(); }
    } catch (err) { alertIn(b, err.message); }
  });

  // Drag a model from the kit onto a slot. Only slots that can do that job light up and take it.
  let dragKit = null;
  const takes = (sl) => dragKit && sl.dataset.kind === dragKit.kind && slotTakes(allSlots().find((x) => x.id === sl.dataset.slot), dragKit.value, eqCtx());
  dlg.addEventListener('dragstart', (e) => {
    const li = e.target.closest?.('li.kit[draggable]');
    if (!li) return;
    dragKit = { value: li.dataset.equip, kind: li.dataset.kind };
    e.dataTransfer.effectAllowed = 'copy';
    try { e.dataTransfer.setData('text/plain', dragKit.value); } catch {}
    for (const sl of dlg.querySelectorAll('.slot')) sl.classList.toggle('can-drop', takes(sl));
  });
  dlg.addEventListener('dragend', () => { dragKit = null; for (const sl of dlg.querySelectorAll('.slot')) sl.classList.remove('can-drop', 'drop-here'); });
  dlg.addEventListener('dragover', (e) => {
    const sl = e.target.closest?.('.slot');
    if (!sl || !takes(sl)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    sl.classList.add('drop-here');
  });
  dlg.addEventListener('dragleave', (e) => { e.target.closest?.('.slot')?.classList.remove('drop-here'); });
  dlg.addEventListener('drop', async (e) => {
    const sl = e.target.closest?.('.slot');
    if (!sl || !takes(sl)) return;
    e.preventDefault();
    const kit = dragKit; dragKit = null;
    try { await equip(sl.dataset.slot, kit.value); } catch (err) { alertIn(sl, err.message); }
  });

  // The dials: the greeting updates as you slide; the setting saves when you let go.
  const dialValues = () => cleanPersonality(Object.fromEntries([...dlg.querySelectorAll('[data-dial]')].map((x) => [x.dataset.dial, Number(x.value)])));
  function showDials(p) {
    const g = dlg.querySelector('.greet');
    if (g) g.innerHTML = `<span class="muted">He'd say hello like this:</span><br>"${esc(greeting(p, settings?.userName))}"`;
    const sel = dlg.querySelector('[data-preset]');
    if (sel) { const hit = PRESETS.find((x) => Object.keys(DEFAULTS).every((k) => (x.set[k] ?? 2) === p[k])); sel.value = hit?.id || ''; sel.options[0].textContent = hit ? '' : 'Your own mix'; }
    const rb = dlg.querySelector('[data-resetbob]');
    if (rb) rb.disabled = isDefault(p);
  }
  // 1.5.34 Projects: "Add project" stays greyed out until a folder is filled in.
  const projAddState = () => { const b = dlg.querySelector('[data-projadd]'); if (b) b.disabled = !dlg.querySelector('#proj-path')?.value.trim(); };
  dlg.addEventListener('input', (e) => { if (e.target.id === 'proj-path') projAddState(); if (e.target.id === 'save-path') saveDirState(); });
  dlg.addEventListener('input', (e) => { if (tab === 'style') stylePage.onInput(e.target); if (e.target.dataset?.ssearch !== undefined) { settingsQuery = e.target.value; filterSettings(); } if (e.target.dataset?.dial) showDials(dialValues()); });

  dlg.addEventListener('change', async (e) => {
    const el = e.target;
    try {
      if ('advanced' in el.dataset) { advanced = el.checked; try { localStorage.setItem('bob-settings-advanced', advanced ? '1' : '0'); } catch {} draw(); return; }
      if (el.dataset.proxy) { const side = $(el.dataset.proxy); if (side && (side.getAttribute('aria-pressed') === 'true') !== el.checked) side.click(); setTimeout(() => { el.checked = side?.getAttribute('aria-pressed') === 'true'; }, 300); return; }
      if (el.dataset.mainproject !== undefined) { await saveProjects(settings.projectList || [], el.dataset.mainproject); return; }
      if (el.dataset.hs) { // 1.5.34 House style boxes (Equip Bob): the whole group is saved, so an emptied box clears
        const group = el.dataset.hs.split('.')[0];
        const vals = {};
        for (const i of dlg.querySelectorAll(`[data-hs^="${group}."]`)) { const k = i.dataset.hs.split('.')[1]; if (i.value !== '') vals[k] = i.type === 'number' ? Number(i.value) : i.value; }
        const r = await api('/api/settings', { houseStyle: { ...(settings.houseStyle || {}), [group]: vals } });
        settings.houseStyle = r.houseStyle; return;
      }
      if (el.dataset.dial) { const p = dialValues(); const r = await api('/api/settings', { personality: p }); settings.personality = r.personality; showDials(r.personality); return; }
      if ('preset' in el.dataset) { const ps = PRESETS.find((x) => x.id === el.value); if (!ps) return; const r = await api('/api/settings', { personality: ps.set }); settings.personality = r.personality; draw(); return; }
      if ('callme' in el.dataset) { const r = await api('/api/settings', { callMe: el.value }); settings.userName = r.userName; settings.callMe = r.callMe; el.value = r.callMe; showDials(dialValues()); flash(el, `Saved. Bob calls you ${r.userName}.`); return; }
      if ('starterpack' in el.dataset) { starterPack = el.value; starterPicks = null; draw(); return; }
      if (el.dataset.starterpick) { const p = new Set(currentPicks()); el.checked ? p.add(el.dataset.starterpick) : p.delete(el.dataset.starterpick); starterPicks = p; draw(); return; }
      if ('winvoice' in el.dataset) { const r = await api('/api/settings', { tts: { windowsVoice: el.value } }); settings.tts = { ...settings.tts, ...r.tts }; const sb = el.closest('.voice-nest')?.querySelector('[data-sample-engine="windows"]'); if (sb) sb.dataset.sampleVoice = el.value || 'default'; window.dispatchEvent(new CustomEvent('bob-voice', { detail: settings.tts })); flash(el, 'Saved.'); return; }
      if (el.dataset.tts) { const v = el.dataset.tts === 'speed' ? Number(el.value) : el.value; const r = await api('/api/settings', { tts: { [el.dataset.tts]: v } }); settings.tts = { ...settings.tts, ...r.tts }; if (el.dataset.tts === 'voice') { for (const sb of dlg.querySelectorAll('[data-sample-engine="kokoro"]:not(.voice-grid *)')) sb.dataset.sampleVoice = el.value; for (const s of dlg.querySelectorAll('select[data-tts="voice"]')) s.value = el.value; } flash(el, 'Saved. Press ▶ Play sample to hear it.'); return; }
      if (el.dataset.speed) { const v = el.value.trim() === '' ? null : Number(el.value); const r = await api('/api/settings', { speed: { [el.dataset.speed]: v } }); settings.speed = r.speed; el.value = r.speed[el.dataset.speed] ?? ''; flash(el, 'Saved.'); return; }
      if ('fit' in el.dataset) { const r = await api('/api/settings', { speed: { fit: el.checked } }); settings.speed = r.speed; flash(el, 'Saved.'); return; }
      if (el.dataset.draft) {
        const d = { ...(settings.speed?.draft || {}) };
        d[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.dataset.draft === 'model' ? el.value : Number(el.value);
        if (d.enabled && !d.model) { alertIn(el, 'Pick a draft brain first.'); el.checked = false; return; }
        const r = await api('/api/settings', { speed: { draft: d } }); settings.speed = r.speed; flash(el, 'Saved.'); return;
      }
      if ('margsmodel' in el.dataset) { speedModel = el.value; draw(); return; }
      if ('margs' in el.dataset) {
        const model = speedModel || dlg.querySelector('[data-margsmodel]')?.value;
        if (!model) return;
        const args = el.value.trim() ? el.value.trim().split(/\s+/) : null;
        const r = await api('/api/settings', { speed: { modelArgs: { [model]: args } } }); settings.speed = r.speed;
        const kept = r.speed.modelArgs?.[model] || [];
        if (args && kept.length !== args.length) alertIn(el, 'Some of that was left out: only flags and plain values are allowed, no file paths.');
        el.value = kept.join(' '); flash(el, 'Saved.'); return;
      }
      if (el.dataset.set === 'brainCtxOn') { const r = await api('/api/settings', { brainCtxOn: el.checked }); settings.brainCtxOn = r.brainCtxOn; bctx = await api('/api/brain-ctx').catch(() => ({ ...bctx, on: r.brainCtxOn })); const box = el.closest('[data-bctxbox]'); if (box) box.innerHTML = brainCtxHtml(); flash(box || el, r.brainCtxOn ? 'On. Applies when each brain next loads.' : 'Off. Bob picks again.'); return; }
      if (el.dataset.bctx) { const v = el.value ? Number(el.value) : null; const r = await api('/api/settings', { brainCtx: { [el.dataset.bctx]: v } }); settings.brainCtx = r.brainCtx; const b = (bctx.brains || []).find((x) => x.model === el.dataset.bctx); if (b) b.picked = v; flash(el, 'Saved. Applies when the brain next loads.'); return; }
      if (el.dataset.sctx) { const v = el.value ? Number(el.value) : null; const r = await api('/api/settings', { sessionCtx: { [el.dataset.sctx]: v } }); settings.sessionCtx = r.sessionCtx; flash(el, 'Saved. Applies when the brain next loads.'); return; }
      if (el.dataset.sbrain) { const r = await api('/api/settings', { sessionBrains: { [el.dataset.sbrain]: el.value } }); settings.sessionBrains = r.sessionBrains; flash(el, 'Saved.'); return; }
      if (el.dataset.set === 'pictureNoWait') { const r = await api('/api/settings', { pictureNoWait: el.checked }); settings.pictureNoWait = r.pictureNoWait; el.checked = r.pictureNoWait; return; }
      if (['readyWhileTyping', 'gamesFirst', 'pictureFit'].includes(el.dataset.set)) { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k]; flash(el, 'Saved. Applies when the brain or picture model next loads.'); return; }
      if (el.dataset.set === 'autoSession') { const r = await api('/api/settings', { autoSession: el.checked }); settings.autoSession = r.autoSession; el.checked = r.autoSession; window.dispatchEvent(new CustomEvent('bob-auto-session', { detail: { autoSession: r.autoSession } })); flash(el, r.autoSession ? 'On. Bob picks the session himself.' : 'Off. The session only changes when you pick one.'); return; }
      if (el.dataset.set === 'tray' || el.dataset.set === 'lookIcon') { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k]; return; }
      if (el.dataset.set === 'howtos') { const r = await api('/api/settings', { howtos: el.checked }); settings.howtos = r.howtos; el.checked = r.howtos; flash(el, r.howtos ? 'On. After a job with a few steps goes well, Bob offers to keep them as a how-to.' : 'Off. Bob won\'t offer or use how-tos. Saved ones stay in 📒 How-tos.'); return; }
      if (el.dataset.set === 'webSearch') { const r = await api('/api/settings', { webSearch: el.checked }); settings.webSearch = r.webSearch; el.checked = r.webSearch; window.dispatchEvent(new CustomEvent('bob-web', { detail: { webSearch: r.webSearch } })); flash(el, r.webSearch ? 'On. Bob can search the web when a question needs it.' : 'Off. Bob won\'t go online to look things up.'); return; }
      if (el.dataset.gcard) {
        const r = await api('/api/settings', { gamingCard: el.dataset.gcard }); settings.gamingCard = r.gamingCard; settings.gamingCardNow = r.gamingCardNow;
        const box = el.closest('.seg3');
        box.outerHTML = gamingCardHtml();
        flash(dlg.querySelector('.seg3'), 'Saved.'); return;
      }
      if (el.dataset.set === 'mootBeside') { const r = await api('/api/settings', { mootBeside: el.checked }); settings.mootBeside = r.mootBeside; el.checked = r.mootBeside; return; }
      if (el.dataset.set === 'chatWhileBusy') { const r = await api('/api/settings', { chatWhileBusy: el.checked }); settings.chatWhileBusy = r.chatWhileBusy; el.checked = r.chatWhileBusy; return; }
      if (el.dataset.set === 'quickOnCpu') { const r = await api('/api/settings', { quickOnCpu: el.checked }); settings.quickOnCpu = r.quickOnCpu; el.checked = r.quickOnCpu; return; }
      if (el.dataset.set === 'planFirst') { const r = await api('/api/settings', { planFirst: el.checked }); settings.planFirst = r.planFirst; el.checked = r.planFirst; return; }
      if (el.dataset.set === 'resumeJobs') { const r = await api('/api/settings', { resumeJobs: el.checked }); settings.resumeJobs = r.resumeJobs; el.checked = r.resumeJobs; return; }
      if (el.dataset.set === 'memoryRecall') { const r = await api('/api/settings', { memoryRecall: el.checked }); settings.memoryRecall = r.memoryRecall; settings.memoryBanks = r.memoryBanks; draw(); return; }
      if (el.dataset.set === 'allTools') { const r = await api('/api/settings', { allTools: el.checked }); settings.allTools = r.allTools; el.checked = r.allTools; return; }
      if (el.dataset.set === 'oneBrain') { const r = await api('/api/settings', { oneBrain: el.checked }); settings.oneBrain = r.oneBrain; el.checked = r.oneBrain; return; }
      if (el.dataset.set === 'catName') { const r = await api('/api/settings', { catName: el.value }); settings.catName = r.catName; el.value = r.catName; return; }
      if (el.dataset.set === 'workshop') { const r = await api('/api/settings', { workshop: { enabled: el.checked } }); settings.workshop = r.workshop; draw(); return; }
      if (el.dataset.set === 'keepAlive') { const r = await api('/api/settings', { ollamaKeepAlive: el.value }); settings.ollamaKeepAlive = r.ollamaKeepAlive; settings.brainMode = r.brainMode; flash(el, 'Saved.'); window.dispatchEvent(new CustomEvent('bob-brain-mode')); return; }
      if (el.dataset.set === 'workshopPort') { const r = await api('/api/settings', { workshop: { port: Number(el.value) } }); settings.workshop = r.workshop; return; }
      if (el.dataset.hk) { const r = await api('/api/settings', { housekeeping: { [el.dataset.hk]: el.checked } }); settings.housekeeping = r.housekeeping; draw(); return; }
      if (el.dataset.hkkind) { const v = el.dataset.hkfield === 'n' ? Number(el.value) : el.value; const r = await api('/api/settings', { housekeeping: { [el.dataset.hkkind]: { [el.dataset.hkfield]: v } } }); settings.housekeeping = r.housekeeping; if (el.dataset.hkfield === 'n') el.value = r.housekeeping[el.dataset.hkkind].n; flash(el, el.dataset.hkfield === 'mode' && v === 'auto' ? 'Saved. Bob tidies these without asking (to the Recycle Bin).' : 'Saved.'); return; }
      if (el.dataset.set === 'autoCheck') { const r = await api('/api/settings', { updates: { autoCheck: el.checked } }); settings.updates = r.updates; el.checked = r.updates.autoCheck; return; }
      if (el.dataset.set === 'autostart') { const r = await api('/api/settings', { autostart: el.checked }); settings.autostart = r.autostart; el.checked = r.autostart; }
      else if (el.dataset.rentenable) { // 1.5.127: the first time a service goes on, a warning card says what leaves this replicant matrix
        const id = el.dataset.rentenable;
        const s = (rent.services || []).find((x) => x.id === id);
        if (el.checked && s && !s.warned) {
          el.checked = false;
          const box = el.closest('.rent-service')?.querySelector('.rent-warn');
          if (box) { box.hidden = false; box.innerHTML = `<p><strong>This sends your chat to ${esc(s.name)}.</strong> When you hire a brain for a job, the chat of that job, the files you attach to it, Bob's instructions and what he remembers about you go to ${esc(s.name)} to be worked on there, and come under their privacy policy, not Bob's.${s.plain ? ' With a hired machine the chat travels over a plain, unencrypted connection.' : ''} Nothing goes until you press Hire it on a job, and Bob shuts the machine down when the job is done. Bob never stores your key.</p><div class="row"><button type="button" class="get" data-rentwarnok="${esc(id)}">I understand, turn it on</button><button type="button" data-rentwarnno="${esc(id)}">Leave it off</button></div>`; }
          return;
        }
        rent = await api('/api/rent/settings', { enabled: { [id]: el.checked } }); flash(el.closest('.cloud'), el.checked ? 'On. Bob still asks before every hire.' : 'Off.'); draw(); return;
      }
      else if (el.dataset.rentcap) { const v = Number(String(el.value).replace(/[^0-9.]/g, '')) || 0; rent = await api('/api/rent/settings', { caps: { [el.dataset.rentcap]: v } }); el.value = String(rent.caps[el.dataset.rentcap]); flash(el, v ? 'Saved.' : 'Saved: 0 means nothing can be hired.'); return; }
      else if (el.dataset.rentadd === 'service') { const s = (rent.services || []).find((x) => x.id === el.value); const box = el.closest('.rent-add'); box.querySelector('.rent-card-pick').hidden = !s || s.kind === 'answer'; box.querySelector('.rent-cards-pick').hidden = !s || s.kind !== 'machine'; box.querySelector('.rent-multi-warn').hidden = true; const sel = box.querySelector('[data-rentadd="cards"]'); sel.value = '1'; delete sel.dataset.ok; for (const o of box.querySelectorAll('.rent-other')) o.hidden = el.value !== 'other'; return; }
      // 1.5.127: more than one card on a hired machine: a big warning first (the owner's rule). It snaps back to 1 until "I understand" is pressed.
      else if (el.dataset.rentadd === 'cards') {
        const n = Number(el.value) || 1; const box = el.closest('.rent-add'); const warn = box.querySelector('.rent-multi-warn');
        if (n === 1 || el.dataset.ok === String(n)) { warn.hidden = true; return; }
        const c = (rent.cards || []).find((x) => x.id === box.querySelector('[data-rentadd="card"]')?.value) || (rent.cards || [])[1] || { name: 'card', perHour: 2 };
        const hour = n * c.perHour, day = hour * 24;
        warn.hidden = false;
        warn.innerHTML = `<p class="big"><strong>⚠️ ${n} cards at once costs about ${n} times as much.</strong></p><p><strong>About $${hour.toFixed(2)} an hour, about $${day.toFixed(0)} a day</strong> for ${n} × ${esc(c.name)}, billed whether or not the brain is busy, plus the minutes it takes to start (longer with more cards). Your spending limits still apply to the whole machine, and the timer from The longest a hired machine may run is the only thing that stops it if this replicant matrix goes off. Only pick this for a model that really doesn't fit one card.</p><div class="row"><button type="button" class="get" data-rentmultiok="${n}">I understand, ${n} cards</button><button type="button" data-rentmultino>Back to 1 card</button></div>`;
        warn.scrollIntoView?.({ block: 'nearest' });
        return;
      }
      else if (el.dataset.cloud) { const r = await api('/api/settings', { cloudHelpers: { [el.dataset.cloud]: { enabled: el.checked } } }); cloud = r.cloud || cloud; flash(el.closest('.cloud'), el.checked ? 'On. Bob still asks every time.' : 'Off.'); }
      else if (el.dataset.cloudmodel) { const r = await api('/api/settings', { cloudHelpers: { [el.dataset.cloudmodel]: { model: el.value.trim() } } }); cloud = r.cloud || cloud; flash(el, 'Saved.'); }
      else if (el.dataset.set === 'engine') { await api('/api/settings', { engine: el.value }); settings.engine = el.value; }
      else if ('pack' in el.dataset) { hw.suggestedPack = el.value; wPicks = null; draw(); }
      else if ('wpick' in el.dataset) { const { rows } = welcomeRows(); wPicks = readyToggle(rows, wPicks, el.dataset.wpick, el.checked); draw(); }
      else if (el.dataset.role && el.value) {
        const r = await api('/api/models/role', { job: el.dataset.role, value: el.value });
        roles.current[el.dataset.role] = el.value;
        // 1.5.33: a new voice engine brings its own voice list (nested under it): draw again.
        if (el.dataset.role === 'speech') { sampler.stop(); await eqReload(); draw(); window.dispatchEvent(new CustomEvent('bob-voice', { detail: settings.tts })); if (r.needsEngine) askEngine(dlg); return; }
        flash(el, 'Saved.');
        if (r.needsEngine) askEngine(el.closest('td') || el.parentElement);
      }
    } catch (err) { alertIn(el, err.message); if (el.type === 'checkbox') el.checked = !el.checked; }
  });

  // The update's steps, read from the same status file the update window writes.
  // 1.5.117: a downloaded, checked update shows on the closed updates panel's line, with Restart Bob now.
  function readyLine() {
    const out = dlg.querySelector('#sub-ev-pc .spanel-note .update-out');
    if (!out) return;
    api('/api/update/status').then((st) => {
      if (!out.isConnected || !st || !(st.ready || st.waiting) || st.done === false) return;
      out.innerHTML = `Bob ${esc(st.version || '')} is ready · <button type="button" class="mini get" data-restartnow>Restart Bob now</button>`;
    }).catch(() => {});
  }
  let updTimer = null;
  function watchUpdate() {
    clearTimeout(updTimer);
    const box = dlg.querySelector('.update-steps');
    if (!box || !dlg.open) return;
    api('/api/update/status').then((st) => {
      if (st?.steps) {
        box.innerHTML = `<ol class="dl-steps">${st.steps.map((label, i) => { const n = i + 1; const mark = st.done || n < st.step ? '✓' : n === st.step ? (st.error ? '✗' : '●') : '○'; return `<li class="${mark === '✓' ? 'did' : mark === '○' ? '' : 'now'}">${mark} ${esc(label)}</li>`; }).join('')}</ol>
          ${st.log && !st.manual ? `<div class="muted mono">${esc(st.log)}</div>` : ''}${st.error ? `<p class="error">${esc(st.error)}</p>` : st.manual ? `<p class="have">Checked. ${esc(st.log || '')}</p>` : st.ready ? (st.mode === 'github' ? '<p class="have">Ready. Press "Restart Bob now" in the chat.</p>' : '<p class="have">Ready. Press "Restart Bob now" in the update window.</p>') : ''}`;
      }
      if (!st?.done && !st?.error) updTimer = setTimeout(watchUpdate, 1000);
    }).catch(() => { updTimer = setTimeout(watchUpdate, 2000); });
  }

  // Bob never changes engines by himself: when a model needs his own engine, ask first.
  function askEngine(where) {
    const box = document.createElement('div');
    box.className = 'confirm';
    box.innerHTML = `<p>That model is a loose file Ollama can't run. It needs Bob's own engine (llama.cpp). Switch engines? Everything else keeps working; it takes effect when Bob restarts.</p><div class="row"><button class="get" data-switchengine="llamacpp">Switch to Bob's own engine</button><button data-no>Keep Ollama</button></div>`;
    where.appendChild(box);
  }

  function flash(el, msg) {
    const s = document.createElement('span');
    s.className = 'have saved'; s.textContent = ' ' + msg;
    el.after(s); setTimeout(() => s.remove(), 3000);
  }

  function alertIn(el, msg) {
    const p = document.createElement('p');
    p.className = 'error'; p.textContent = msg;
    (el.closest('.model, .settings, .welcome, .pane') || $('cellar-body')).appendChild(p);
    setTimeout(() => p.remove(), 8000);
  }

  $('cellar-close').onclick = () => dlg.close();
  // A page in the main area (1.5.0), not a pop-up: the chat hides while it's open, Esc or ✕ goes back.
  const mid = dlg.closest('.mid');
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && dlg.open && !e.defaultPrevented && !document.querySelector('dialog:modal') && !e.target.closest?.('dialog:not(#cellar), input, textarea, select')) { e.preventDefault(); dlg.close(); } });
  dlg.addEventListener('toggle', (e) => { if (e.target.classList?.contains('starter')) starterOpen = e.target.open; }, true);
  dlg.addEventListener('toggle', (e) => { const k = e.target.dataset?.fam; if (!k) return; if (e.target.open) famOpen[k] = true; else delete famOpen[k]; saveFam(); }, true); // 1.5.101
  dlg.addEventListener('close', () => { mid?.classList.remove('paged'); for (const id of ['cellarBtn', 'settingsBtn', 'styleBtn']) $(id)?.classList.remove('on'); $('chatBtn')?.classList.add('on'); sampler.stop(); stylePage.closing(settings); window.dispatchEvent(new Event('bob-caps')); });

  return {
    async open(which = 'shop', pickTab, opts = {}) { mode = which; if (opts.house) { const slot = { music: 'music', pictures: 'image', video: 'video', sfx: 'sfx' }[opts.house]; if (slot) eqSelected = slot; eqView = 'doll'; houseFocus = opts.house; } if (pickTab) setTab(pickTab); else if (which === 'settings') { mode = 'shop'; setTab('settings'); } if (!dlg.open) { mid?.classList.add('paged'); mid ? dlg.show() : dlg.showModal(); } dlg.scrollTop = 0; draw(); await load().catch((e) => { $('cellar-body').innerHTML = `<p class="error">${esc(e.message)}</p>`; }); },
    async firstRun() {
      try { const s = await api('/api/settings'); if (!s.setupDone) this.open('welcome'); } catch {}
    },
    onDownload(ev) {
      const over = ['done', 'failed', 'cancelled', 'paused', 'retrying'].includes(ev.phase);
      if (over) live.delete(ev.id); else live.set(ev.id, ev);
      job = over ? (job?.id === ev.id ? null : job) : ev;
      if (!dlg.open) return;
      if (over && ev.queue?.length && ev.phase === 'done') return; // the next one in the queue starts by itself
      if (over) { load().then(() => { if (ev.error) alertIn($('cellar-body'), `${ev.name}: ${ev.error}`); }); return; }
      const slot = mode === 'shop' && dlg.querySelector(`#m-${CSS.escape(ev.id)} .act`);
      if (slot) slot.innerHTML = progress(ev);
      else if (mode === 'welcome') { const d = dlg.querySelector('.welcome .dl'); d ? (d.outerHTML = progress(ev)) : draw(); }
    }
  };
}

