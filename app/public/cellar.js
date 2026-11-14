// The cellar: Bob's model shop and settings. Every download starts from a click here, with its size shown first.
import { setLook } from './bob-sprite.js';
import { brainEngineName } from './engine-name.js';
import { progressHtml, animateWorkers } from './progress.js';
import { createStylePage } from './style-page.js';
import { createSampler, sampleButton, sampleHint } from './voice-samples.js';
import { allSlots, HELPERS, equipped, entryOf, packFor, starterTicks, starterPlan, enginesFor, readyPlan, slotValue, slotTakes, isActive, tipHtml, readyList, readyDefaults, readyToggle, readyOrder, SPLITS, splitPicks } from './equip.js';
import { cleanFilters } from './cat-sort.js';
import { cleanFind } from './cat-find.js';
import { brainsHtml, setupPlan, canCalibrate, brainsInUse, listTopHtml, listRowHtml, listSetUpHtml } from './brains.js';
import { hasExperts } from './place.js';
import { suit as fitSuit, picksOf, unsuited, jobNames, SLOT_NAMES, canDo, packsFor } from './fit.js';
import { catalogueHtml, pagePickHtml, familyOf, visibleModels, isNaughty, VIEWS, dayWords, rentPicks } from './catalogue.js';
import { drawBob } from './bob-sprite.js';
import { handsSettingsHtml, mountHandsSettings } from './hands.js';
import { quarantineSettingsHtml, mountQuarantineSettings } from './quarantine.js';
import { phoneAccessHtml, mountPhoneAccess } from './phone-access.js';
import { lockSettingsHtml, mountLockSettings, lockSummary } from './lock-settings.js'; // 🔒 Passcode lock
import { secretsHtml, mountSecrets } from './secrets.js';
import { moreToolsHtml, mountMoreTools } from './more-tools.js';
import { emailAccountHtml, mountEmailAccount } from './email-account.js'; // 📧 Email account (Online services)
import { telegramHtml, mountTelegram } from './telegram.js';
import { discordHtml, mountDiscord } from './discord.js';
import { appsDoorHtml, mountAppsDoor } from './apps-door.js';
import { claudeDoorHtml, mountClaudeDoor } from './claude-door.js'; // Hands for Claude
import { mountAgentsSettings } from './coding-agents.js'; // Nov 13 Coding agents
import { checkinsHtml, mountCheckins } from './checkins.js';
import { promptsHtml, mountPrompts } from './prompts.js'; // saved prompts and the / menu
import { mountHarness } from './harness.js'; // items 62 to 72: Health and history, Quiet hours and shortcut, Chat extras
import { mountEveryday, applyReading, TEXT_MIN, TEXT_MAX, TEXT_STEP } from './everyday.js'; // 🗓 Everyday helpers
import { adventureSettingsHtml, mountAdventureSettings } from './adventure.js';
import { gamesSettingsHtml, mountGamesSettings } from './games.js';
import { shareBrainsHtml, mountShareBrains } from './share-brains.js';
import { mountNetFiles } from './net-files.js'; // Nov 14 Bob-Net: Files and brains
import { findTheme, DEFAULT_THEME } from './themes.js';
import { tip, noteOrTip, stripTags, keep } from './tips.js';
import { HOUSE, houseStyleHtml } from './house-style.js';
import { attributesHtml, cleanPersonality, greeting, PRESETS, DEFAULTS, isDefault } from './personality.js';
import { esc, gb } from './util.js';
import { wantsHtml, wantPatch, wantSaved } from './wants.js';
import { mountPresets } from './presets.js'; // Assistant presets
import { LANGS, LANG_KEY, pickLang } from './i18n.js';
import { makeBackupPanel } from './backup-panel.js';
import { GROUPS as SET_GROUPS, CARDS as SET_CARDS, VIEW_KEY, cardOf, startView, topicFor } from './settings-map.js';
import { createShopParts } from './cellar-shop.js';
import { createVoiceParts } from './cellar-voice.js';
import { createEngineParts } from './cellar-engines.js';
import { createHomeParts } from './cellar-home.js';
import { createSettingsParts } from './cellar-pages.js';

const $ = (id) => document.getElementById(id);

async function api(url, data) {
  const r = await fetch(url, data === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify(data) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Error ${r.status}`);
  return j;
}

// popOut(jump): the main window's way to open Settings in its own window; true when it did. Without it
// (the Settings window itself, a phone, a blocked pop-up) Settings draws here as a page.
export function createCellar({ popOut = null } = {}) {
  // The page builders that live in their own files (cellar-*.js), made first so they're ready before anything draws.
  // cellar-shop.js
  const {
    covered, ENGINE_SIZE, engineById, engineStep, action, catAction, cardSample, card, extrasHtml, modelList, catBody,
    picksSummary, pillSwitch, fitBanner, groupHtml, brainsCtx, brainsPanelHtml, rolesHtml, brainCtxHtml
  } = createShopParts(() => ({
    SUB_LABEL, bctx, calAsk, caps, data, eqCtx, eqView, fold, hear, honesty, hw, kokoroGrid, labScores, live,
    naughtyOn, nestedVoiceHtml, picks, placeData, progress, roles, setUpBrain, settings, setupAsk, showUnsuited,
    shownModels, suit, tab, voiceHtml, voices
  }));
  // cellar-voice.js
  const {
    kokoroDefault, voiceOf, hear, kokoroGrid, speechNow, engineLabel, nestedVoiceHtml, voicePickHtml, voiceHtml,
    voiceNow, netVoicesHtml, talkCloudHtml, voiceDetailsHtml
  } = createVoiceParts(() => ({
    engineById, engineStep, roles, settings, sswitch, voices, winVoices
  }));
  // cellar-engines.js
  const {
    speedHtml, turboRowsHtml, speedMemoryHtml, engineExtrasHtml, speedLogHtml, openGroups, ENGINE_NAMES,
    ENGINE_GROUPS, engineGearHtml, labEngineHtml, newName, verName, prevName, engineCard, enginesHtml, QWEN_FIELDS,
    qwenHtml, tuneHtml, speedTestHtml, pcCheckHtml
  } = createEngineParts(() => ({
    data, engineById, gamingCardHtml, live, memoryBanksHtml, more, progress, roles, settings, speedLogData,
    speedModel, speedRuns, sswitch
  }));
  // cellar-home.js
  const {
    projectsHtml, ownSame, ownWhen, when, KIND_WORD, binWord, TOOL_STATE, ownDelBtns, ownKitHtml, saveDirHtml,
    housekeepingHtml, macRemoveHtml, notesFoldersHtml, memoryBanksHtml
  } = createHomeParts(() => ({
    howtoEditing, loadOwnKit, ownAsk, ownError, ownKit, ownLast, ownPurgeAsk, settings
  }));
  // cellar-pages.js
  const {
    selfWorkHtml, everydayHtml, GCARD_NOW, gamingCardHtml, otherAppsHtml, rentHtml, onlineHtml, bobNetHtml,
    lookExtrasHtml, jobsHtml, dailyHtml, holdbackHtml
  } = createSettingsParts(() => ({
    EVERY_EXTRA, cloud, data, eqCtx, howSumNow, hw, kokoroDefault, more, naughtyOn, notesFoldersHtml, panel, rent,
    rentPickOpen, settings, srow, sswitch, voicePickHtml, zoneLine
  }));
  const dlg = $('cellar');
  const backup = makeBackupPanel({ api, redraw: () => { const y = dlg.scrollTop; draw(); dlg.scrollTop = y; } }); // Back up and move
  let speedModel = '';
  let speedRuns = [], speedLogData = null; // speedLogData: 96 Speed history (/api/speed-log)
  let rent = { services: [], rentals: [], caps: {}, running: [], leftover: [], recent: [] }; // 1.5.127 rented brains
  let rentPickOpen = false; // 1.5.137: Add a rental opens by itself when you come from the catalogue's "Rented brains" link
  // 1.5.137: fills Add a rental from the brain picked in "Pick a brain from Bob's list", for the service picked.
  // Never more than 1 card by itself: a brain that needs several says so, and the many-cards warning comes when you change it.
  function fillRentPick(box) {
    const key = box.querySelector('[data-rentadd="pick"]')?.value || '';
    const p = rentPicks(visibleModels(data?.models || [], naughtyOn()), data?.bigBrains || [], eqCtx(), data?.bobNet || [], settings.platform).find((x) => x.key === key);
    const s = (rent.services || []).find((x) => x.id === box.querySelector('[data-rentadd="service"]')?.value);
    const model = box.querySelector('[data-rentadd="model"]'), name = box.querySelector('[data-rentadd="name"]');
    const find = box.querySelector('[data-rentfind]'), note = box.querySelector('.rent-pick-note');
    const say = (t) => { if (note) { note.textContent = t; note.classList.remove('error'); note.classList.add('muted'); } };
    if (find) find.hidden = !(p && s?.kind === 'answer');
    if (!p) { if (model.dataset.auto) { model.value = ''; delete model.dataset.auto; } if (name.dataset.auto) { name.value = ''; delete name.dataset.auto; } say(''); return; }
    if (!name.value || name.dataset.auto) { name.value = `${p.name}${s ? ` on ${s.name.replace(/ \(.*\)$/, '')}` : ''}`; name.dataset.auto = '1'; }
    if (!s || s.kind === 'answer') {
      if (model.dataset.auto) { model.value = ''; delete model.dataset.auto; }
      say(s ? `Press Find it on this service and Bob looks for ${p.name} on ${s.name}'s own list.` : 'Pick a service.');
      return;
    }
    if (p.answerOnly) { if (model.dataset.auto) { model.value = ''; delete model.dataset.auto; } say(`${p.name} is too big to rent as one machine. Pick a pay-per-answer service and press Find it.`); return; }
    model.value = p.model; model.dataset.auto = '1';
    const card = box.querySelector('[data-rentadd="card"]');
    if (card && [...card.options].some((o) => o.value === p.card)) card.value = p.card;
    const cardName = (rent.cards || []).find((c) => c.id === p.card)?.name || `${p.card} GB card`;
    say(p.cards > 1 ? (s.kind === 'machine' ? `${p.name} needs ${p.cards} × ${cardName} on one machine. Set Cards on the machine to ${p.cards}: Bob shows what that costs first.` : `${p.name} needs ${p.cards} cards on one machine, so it wants a machine-by-the-minute service, not serverless.`) : `Card size set to ${cardName}.`);
  }
  let data = null, hw = null, settings = null, roles = null, cloud = [], caps = {}, bctx = { on: false, brains: [] }, tab = 'catalogue', job = null, mode = 'shop', voices = [];
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
  // 1.5.132: the naughty list (uncensored community builds) is in no list until its switch is on (setting naughtyList,
  // off unless you turn it on). naughtyView is which side of the catalogue's Well behaved / Naughty list toggle shows.
  const naughtyOn = () => settings?.naughtyList === true;
  // 1.5.133: the How Bob works summary line, as a function, so a switch changed inside the open panel updates it at once
  // (it used to keep saying "Naughty list: on" until the next reload).
  const howSumNow = () => { const onoff = (v) => (v ? 'on' : 'off'); return `Bob picks the session: ${onoff(settings.autoSession !== false)} · One brain: ${onoff(settings.oneBrain)} · Starts with Windows: ${onoff(settings.autostart)} · Keeps to the tray: ${onoff(settings.tray !== false)} · Web search: ${onoff(settings.webSearch === true)} · Naughty list: ${onoff(settings.naughtyList === true)} · Lab: ${onoff(settings.computerLab !== false)} · Plans before big jobs: ${onoff(settings.planFirst === true)} · How-tos: ${onoff(settings.howtos === true)} · Fixes his own messages: ${onoff(settings.editOwn === true)} · Works on repositories: ${onoff(settings.selfWork?.enabled === true)} · Update checks: ${onoff(settings.updates?.autoCheck)} · Engines kept up to date: ${onoff(settings.engineUpdates?.auto !== false)}`; };
  const refreshHowSum = () => { const n = dlg?.querySelector?.('#sub-ev-how > summary .spanel-note'); if (n && settings) n.textContent = howSumNow(); };
  const shownModels = () => visibleModels(data?.models || [], naughtyOn());
  // 1.5.133: three sides, Well behaved / Community / Naughty list (catView), remembered in this browser.
  let catView = (() => { try { const v = localStorage.getItem('bob-cat-view'); return VIEWS.includes(v) ? v : 'well'; } catch { return 'well'; } })();
  // 1.5.208 the catalogue's sort and filters, remembered in this browser.
  let catFilters = (() => { try { return cleanFilters(JSON.parse(localStorage.getItem('bob-cat-filters') || '{}')); } catch { return cleanFilters({}); } })();
  const setCatFilters = (f) => { catFilters = cleanFilters(f); try { localStorage.setItem('bob-cat-filters', JSON.stringify(catFilters)); } catch {} };
  const setCatView = (v) => { catView = VIEWS.includes(v) ? v : 'well'; try { localStorage.setItem('bob-cat-view', catView); } catch {} };
  // 1.5.135: ➕ Your own brains: the Add form in progress (a picked .gguf, its name, an optional picture reader).
  let ownForm = null;
  // 1.5.205 Add a model page: the pasted link, then a pop-up to pick which of the page's files to add.
  let addPage = null;
  // 1.5.209 Find more models: the search form, and what came back. The choices are remembered; the hits are not.
  let find = (() => { try { return cleanFind(JSON.parse(localStorage.getItem('bob-cat-find') || '{}')); } catch { return cleanFind({}); } })();
  const findKeep = () => { try { localStorage.setItem('bob-cat-find', JSON.stringify(cleanFind(find))); } catch {} };
  async function findRun(more = false) {
    const c = cleanFind(find);
    find = { ...find, ...c, busy: true, error: '' }; draw();
    const r = await api('/api/catalog-find', { host: c.host, sort: c.sort, q: c.q, cursor: more ? find.next : '' }).catch((x) => ({ error: x.message }));
    find = r.error ? { ...find, busy: false, error: r.error } : { ...find, busy: false, searched: true, foundOn: c.host, hits: more ? [...(find.hits || []), ...r.hits.filter((h) => !(find.hits || []).some((x) => x.repo === h.repo))] : r.hits, next: r.next || '' };
    draw();
  }
  const addedRepos = () => new Set((data?.models || []).filter((m) => m.added && m.source?.repo).map((m) => `${m.source.host === 'ms' ? 'ms' : 'hf'}:${m.source.repo}`));
  function pagePick(view, link) {
    const pop = document.createElement('dialog');
    pop.className = 'pick-pop'; pop.setAttribute('aria-labelledby', 'pick-title');
    pop.innerHTML = pagePickHtml(view, { ...eqCtx(), bobNet: data?.bobNet || [] });
    const shut = () => { pop.close(); pop.remove(); };
    pop.addEventListener('cancel', (e) => { e.preventDefault(); shut(); });
    pop.addEventListener('click', async (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if ('pickcancel' in b.dataset) return shut();
      if (!('pickadd' in b.dataset)) return;
      const keys = [...pop.querySelectorAll('[data-pickkey]:checked')].map((x) => x.dataset.pickkey);
      const err = pop.querySelector('[data-pickerr]');
      if (!keys.length) { err.hidden = false; err.textContent = 'Tick at least one to add.'; return; }
      b.disabled = true;
      const r = await api('/api/catalog-added/add', { page: link, keys }).catch((x) => ({ error: x.message }));
      if (r.error) { b.disabled = false; err.hidden = false; err.textContent = r.error; return; }
      shut();
      addPage = { url: '', done: `Added ${r.added.map((x) => x.name).join(', ')}. ${r.added.length === 1 ? 'It is' : 'They are'} in the "Added by you" family under Brain, with a Get button.` };
      await ownRefresh(); draw();
    });
    document.body.appendChild(pop); pop.showModal();
    pop.querySelector('[data-pickkey]:not([disabled])')?.focus();
  }
  async function ownPick(kind) {
    const r = await api('/api/own-models/pick', { kind }).catch((e) => ({ error: e.message }));
    if (r.error) { ownForm = { ...(ownForm || { file: '', name: '' }), error: r.error }; draw(); if (!ownForm.file) dlg.querySelector('[data-ownpath]')?.focus(); return null; }
    return r;
  }
  async function ownRefresh() { [data, roles, settings] = await Promise.all([api('/api/models'), api('/api/roles'), api('/api/settings')]); draw(); }
  const setShowUnsuited = (on) => { showUnsuited = on; try { localStorage.setItem('bob-show-unsuited', on ? '1' : '0'); } catch {} };




  function progress(j = job) { animateWorkers(); return progressHtml(j); }




  // Model categories that share a page, each as a subsection (1.1.2). The old tab ids still work:
  // opening "speech" lands on Voice & conversation, at Bob's voice.
  const GROUPS = [
    { id: 'talk', label: 'Voice & conversation', icon: '💬', parts: ['chat', 'voice', 'speech'], what: 'How Bob talks, listens and plans: his everyday brain, hearing your voice, and his own voice.' },
    { id: 'media', label: 'Pictures & video', icon: '🎨', parts: ['images', 'video'], what: 'The painter\'s corner: making and editing pictures, and short clips.' }
  ];
  const SUB_LABEL = { chat: 'Planning and talking (his everyday brain)', voice: 'Hearing you', speech: 'Talking (Bob\'s voice)', images: 'Pictures', video: 'Video' };
  const groupOf = (id) => GROUPS.find((g) => g.parts.includes(id));
  let jumpTo = '';
  // 1.5.210: the paper doll is gone. Its old page id ('roles') lands on Settings, Brains, the one place brains are picked.
  function setTab(id) { if (id === 'roles') { tab = 'settings'; jumpTo = 'adv-brains'; return; } const g = groupOf(id); tab = g ? g.id : id; jumpTo = g ? id : ''; }

  function shopHtml() {
    if (groupOf(tab)) setTab(tab);
    const cats = [], seen = new Set();
    for (const c of data.categories) { const g = groupOf(c.id); const item = g || c; if (!seen.has(item.id)) { seen.add(item.id); cats.push(item); } }
    const tabs = [{ id: 'catalogue', label: 'Brain catalogue', icon: '📚' }, ...cats, { id: 'found', label: 'On this replicant matrix', icon: '🔎' }, { id: 'roles', label: 'Brains', icon: '🧠' }, { id: 'style', label: 'Style', icon: '🎨' }, { id: 'settings', label: 'Settings', icon: '⚙' }];
    // 1.5.117: two labelled rows, so Settings and Style don't read as the last two "Get models" pages.
    const tabBtn = (c) => `<button role="tab" aria-selected="${c.id === tab}" data-tab="${c.id}">${c.icon} ${esc(c.label)}</button>`;
    const setup = new Set(['roles', 'style', 'settings']); // 1.5.210 Brains opens Settings, Brains
    const bar = `<nav class="tabs cellar-tabs" role="tablist" aria-label="Get models, Style and Settings pages"><span class="tabs-row"><span class="tabs-label" aria-hidden="true">Get models:</span>${tabs.filter((c) => !setup.has(c.id)).map(tabBtn).join('')}</span><span class="tabs-row"><span class="tabs-label" aria-hidden="true">Set up:</span>${tabs.filter((c) => setup.has(c.id)).map(tabBtn).join('')}</span></nav>`;
    let body = '';
    if (tab === 'settings') body = settingsHtml();
    else if (tab === 'style') body = stylePage.html(settings);
    // 1.5.210 'roles' (the old Equip Bob page) never stays the tab: setTab sends it to Settings, Brains.
    else if (tab === 'catalogue') body = roles ? catalogueHtml({ ...eqCtx(), models: data?.models || [], removed: data?.removed || [], bobNet: data?.bobNet || [], naughtyOn: naughtyOn(), catView, filters: catFilters, find, addedRepos: addedRepos(), ownForm, addPage, action: catAction, focus: catFocus }) : '<p class="muted">Loading...</p>'; // 1.5.56; 1.5.132 the catalogue gets every entry and sorts the naughty ones itself
    else if (tab === 'found') body = `<p class="muted">Scanned ${data.scannedAt ? new Date(data.scannedAt).toLocaleString() : 'never'}. <button data-scan>Look again</button></p>${extrasHtml() || '<p>Nothing extra found.</p>'}`;
    else if (GROUPS.some((g) => g.id === tab)) body = groupHtml(GROUPS.find((g) => g.id === tab));
    else {
      const cat = data.categories.find((c) => c.id === tab);
      body = `${fitBanner()}<p class="muted">${esc(cat?.what)}</p>${modelList(tab)}${extrasHtml()}`;
    }
    return `${bar}<div class="pane">${body}</div>`;
  }




  let winHooked = false;
  function winVoices() {
    let list = [];
    try { list = speechSynthesis.getVoices().filter((v) => /^en/i.test(v.lang)); } catch {}
    // Windows fills its voice list a moment after the page opens: draw again once it's there.
    if (!list.length && !winHooked && 'speechSynthesis' in window) { winHooked = true; try { speechSynthesis.addEventListener('voiceschanged', () => draw(), { once: true }); } catch {} }
    return list;
  }




  // 1.5.79 How-tos: the steps Bob kept from jobs that worked. 1.5.144: one panel, 🧰 Tools and how-tos, for
  // them and for the tools he wrote (src/own-kit.js). Loaded when the panel is drawn. Delete asks first, then the
  // thing goes on the Recently deleted shelf for 30 days (Undo right away, or Put back from the shelf). Edit and
  // Delete for good work on this PC only.
  let ownKit = null, ownLoading = false, howtoEditing = null, ownAsk = null, ownPurgeAsk = null, ownLast = null, ownError = '';
  window.addEventListener('bob-howto-saved', () => { ownKit = null; });
  const loadOwnKit = () => { if (ownLoading) return; ownLoading = true; api('/api/own-kit').then((r) => { ownKit = r; }).catch(() => { ownKit = { tools: [], howtos: [], deleted: [], maxTools: 30, maxHowtos: 100 }; }).finally(() => { ownLoading = false; draw(); }); };
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
    const how = h.canMove === false && !h.loading ? `<p class="muted">Moving works from ${welcome ? 'my' : 'Bob\'s'} own window (Bob.exe, Bob.app, or Bob on Linux), not from a browser tab.</p>` : '';
    return `<p class="save-now"><strong>${welcome ? 'I keep my things in' : 'Kept in'}</strong> <span class="save-path">${esc(folder)}</span>${size} ${welcome ? tip('My models, engines, notes, chats and settings live in this one folder, apart from the program, so updates never touch them. Move here… takes an empty or new folder on any drive (not AppData or a temporary place; a cloud-synced folder like OneDrive, Dropbox, Google Drive or iCloud is allowed but I always recommend against it). I show the size and ask once, then close, copy and reopen.', 'My home folder') : tip('Bob\'s models, engines, notes, chats and settings live in this one folder, apart from the program, so updates never touch them. Move here… takes an empty or new folder on any drive (not AppData or a temporary place; a cloud-synced folder like OneDrive, Dropbox, Google Drive or iCloud is allowed but Bob always recommends against it). Bob shows the size and asks once, then closes, copies and reopens. Save folder, below, is only where new pictures, clips and songs go.', 'Bob\'s home folder')}</p>
      ${warn}
      <div class="save-pick"><label for="home-path">New folder</label><input id="home-path" type="text" placeholder="${esc(h.suggested || 'D:\\Bob')}" aria-describedby="home-hint"> <button type="button" class="mini" data-homebrowse>Browse…</button>
        <button type="button" data-homemove>Move here…</button></div>
      <p class="muted" id="home-hint">An empty folder or a new one, on any drive, not a cloud-synced one (OneDrive, Dropbox, Google Drive, iCloud). Free space matters more than speed.${welcome ? ' Best done now, before the big downloads.' : ''}</p>
      ${how}
      <p class="error home-error" hidden></p>
      ${ask}`;
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


  // Settings (1.5.0): panels of rows that show what's set now. Now Simple (cards) or Advanced (a side list)
  // for everything else, with a search box. Long help folds behind "More".
  const more = (text) => `<details class="more"><summary>More</summary><p class="muted">${text}</p></details>`;
  // 1.5.117: a long table folds, with what's set now on its one summary line (open it to change).
  const fold = (title, now, body, open = false) => `<details class="fold" ${open ? 'open' : ''}><summary><strong>${esc(title)}</strong> <span class="muted">· ${esc(now)}</span></summary>${body}</details>`;
  // Two views of the same panels, Simple (cards) and Advanced (a side list), and one toggle.
  let view = (() => { try { return startView(localStorage.getItem(VIEW_KEY), localStorage.getItem('bob-settings-advanced')); } catch { return 'simple'; } })();
  let curTopic = (() => { try { return topicFor(localStorage.getItem('bob-settings-topic') || '') || 'ev-bob'; } catch { return 'ev-bob'; } })(); // Advanced: the section showing
  let curCard = ''; // Simple: '' is the cards, else the card that's open
  let lastTab = 'catalogue'; // the page to stay on when Settings opens in its own window
  let settingsQuery = '';
  // 1.5.208 PC check: the time zone Bob uses, read-only, with the time it is there now (so a wrong zone shows at once).
  const zoneLine = (s) => { const z = s?.timeZone; if (!z) return '<span class="muted">Not read yet</span>'; let now = ''; try { now = new Intl.DateTimeFormat(undefined, { timeZone: z, hour: '2-digit', minute: '2-digit' }).format(new Date()); } catch {} return `<span data-no-translate>${esc(z)}</span>${now ? ` <span class="muted">· ${esc(now)} there now</span>` : ''}`; };
  const srow = (label, value, actions = '', id = '') => `<div class="srow"${id ? ` id="${id}"` : ''}><span class="slabel">${label}</span><span class="svalue">${value}</span><span class="sact">${actions}</span></div>`;
  // 1.5.56: the note moves behind ⓘ unless it's a warning, a live value or has a button in it.
  // The one-line description sits under the name, always in view (it is short now; the long story is in Help).
  const sswitch = (key, on, label, note = '', extra = '') => `<label class="switch srow-switch"><input type="checkbox" data-set="${key}" ${on ? 'checked' : ''} ${extra}><span><strong>${label}</strong>${note ? `<br><span class="muted">${note}</span>` : ''}</span></label>`;

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
    // 1.5.41 Save folder (closed, it shows the folder in use).
    // 1.5.79 How-tos (closed, it shows how many and whether he learns new ones).
    // 1.5.125 Bob's home folder (closed, it shows the home folder; red when it's somewhere temporary).
    ['ev-home', '📦 Bob\'s home folder', () => { const h = homeInfo || {}; return h.tempLike ? `${settings?.home || ''} · in ${h.tempLike}: move it` : h.synced ? `${h.folder || settings?.home || ''} · a ${h.synced} folder, synced to the cloud: not recommended` : `${h.folder || settings?.home || ''}${h.modelsText ? ` · models ${h.modelsText}` : ''}`; }, () => homeHtml()],
    // 🔒 Passcode lock (closed, it shows whether it's on and whether chats and memory are locked).
    ['ev-lock', '🔒 Passcode lock', () => lockSummary(settings?.passcodeLock), () => lockSettingsHtml()],
    // 🔐 Locked secrets (on by default): passcodes, tokens and keys kept scrambled (public/secrets.js).
    ['ev-secrets', '🔐 Locked secrets', () => (settings?.lockSecrets === false ? 'Off · passcodes and keys are kept plain' : 'On · passcodes, tokens and keys are kept scrambled'), () => secretsHtml()],
    ['ev-save', '💾 Save folder', () => { const sd = settings?.saveDir || {}; return sd.missing ? 'Picked folder not found · saving in Bob\'s own folder' : sd.custom ? sd.folder : 'Bob\'s own folder (Made by Bob)'; }, () => saveDirHtml()],
    // Back up and move (src/backup.js): one zip of chats, settings, memory and notes; restore it on another computer.
    ['ev-backup', '🗄 Back up and move', () => backup.note(), () => backup.html()],
    // 1.5.144 🧰 Tools and how-tos (closed, it shows how many of each and how many wait on the shelf).
    ['ev-howtos', '🧰 Tools and how-tos', () => { const c = ownKit ? { tools: ownKit.tools.length, howtos: ownKit.howtos.length, deleted: ownKit.deleted.length } : (settings?.ownKit || { tools: 0, howtos: settings?.howtoCount || 0, deleted: 0 }); const bit = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`; return c.tools || c.howtos ? `${bit(c.tools, 'tool')} · ${bit(c.howtos, 'how-to')}${c.deleted ? ` · ${c.deleted} recently deleted` : ''}` : 'Nothing made yet'; }, () => ownKitHtml()]];








  async function saveQwen(el, msg) {
    const box = dlg.querySelector('[data-qbox]');
    const next = { on: box.querySelector('[data-set="qwenPresetsOn"]').checked };
    for (const fs of box.querySelectorAll('[data-qpreset]')) {
      const row = {};
      for (const f of fs.querySelectorAll('[data-qfield]')) if (f.value !== '') row[f.dataset.qfield] = Number(f.value);
      next[fs.dataset.qpreset] = row;
    }
    const r = await api('/api/settings', { qwenPresets: next });
    settings.qwenPresets = r.qwenPresets;
    box.outerHTML = qwenHtml();
    const again = dlg.querySelector('[data-qbox]');
    flash(again, msg || (settings.qwenPresets.on ? 'Saved. Used from the next reply.' : 'Off. Bob uses Qwen\'s settings again.'));
    again.querySelector(el.dataset.qfield ? `[data-qpreset="${el.closest('[data-qpreset]')?.dataset.qpreset}"] [data-qfield="${el.dataset.qfield}"]` : el.dataset.qreset ? `[data-qreset="${el.dataset.qreset}"]` : '[data-set="qwenPresetsOn"]')?.focus();
  }


  // Memory sources (memory-more.js): the list, opened from Speed & memory.
  async function showMemorySources(box) {
    box.innerHTML = '<p class="muted">Reading the memory file…</p>';
    let r;
    try { r = await api('/api/memory/sources'); } catch (err) { box.innerHTML = `<p class="muted">${esc(err.message)}</p>`; return; }
    const rows = r.rows || [];
    if (!rows.length) { box.innerHTML = '<p class="muted">Bob\'s memory file is empty.</p>'; return; }
    const from = (x) => (x.from ? (x.chatGone ? `From a chat that was tidied away${x.title ? `: ${esc(x.title)}` : ''}.` : `<button type="button" class="mini" data-memchat="${esc(x.from)}">Open the chat</button> ${esc(x.title || '')}`) : '<span class="muted">Where it came from wasn\'t noted.</span>');
    box.innerHTML = `${r.on ? '' : '<p class="muted">Memory sources is off, so new memories won\'t say where they came from.</p>'}<ul class="packlist mem-src-list">${rows.map((x) => `<li data-memkey="${esc(x.key)}"><strong>${esc(x.text)}</strong>${x.project ? ` <span class="muted">[${esc(x.project)}]</span>` : ''}${x.until ? ` <span class="muted">${x.expired ? 'ran out' : 'until'} ${esc(x.until)}</span>` : ''}<br>${from(x)} <button type="button" class="mini" data-memforget="${esc(x.key)}">Forget</button></li>`).join('')}</ul>`;
  }










  // 1.5.98: old panel ids (Help links, cards, remembered open panels) land on the new panels.
  const ADV_MOVED = { 'adv-connections': 'adv-bobnet' };
  const ADV = [
    ['brains', '🧠 Brains', 'model roles session brains context thinking making reviewer beside moot keep chatting busy answer messages between steps mid-job interrupt stop and wait words pause hold cancel belay delay no go on resume quick brain see big job meanwhile note all tools at once', () => brainsPanelHtml() + `
      ${sswitch('mootBeside', settings.mootBeside === true, 'Reviewer beside main brain', keep('At High and Extreme effort the reviewer loads beside the main brain when there\'s room (on CPU if the GPU is full) instead of swapping in. With no room, a paired Bob can check if Borrow a brain is on. Not in Gaming.'))}
      ${sswitch('netReview', settings.netReview === true, 'Review by my other Bobs', keep('At Low and Medium effort, a free Bob on Bob-Net with a big enough Review brain checks longer replies once. Needs Borrow a brain. Chit-chat is never checked.'))}
      ${sswitch('chatWhileBusy', settings.chatWhileBusy !== false, 'Chat while busy', keep('While Bob makes a picture, clip, song or sound (or runs a long job, with Reply between steps off), his small brain (Qwen3 4B) answers plain chat if memory allows. On CPU, replies take up to 30 s to start. Pictures and Medium effort and up still wait.'))}
      ${sswitch('answerMidJob', settings.answerMidJob !== false, 'Reply between steps', keep('A message sent during a long job is answered by the loaded brain between two steps. A question gets a short reply; new work goes to Tasks. In the job\'s own chat, "also…" adds to the job and "stop" stops it. Off: messages wait, or go to the small brain.'))}
      ${sswitch('stopWords', settings.stopWords !== false, 'Stop and wait words', keep('During a job, a short message on its own is a command: "stop" or "cancel" stops it, "wait" or "pause" pauses it, "wait 10 minutes" pauses it for later, "go on" resumes. Inside a sentence the word is a normal message. Off: only a bare "stop" counts, after the current step.'))}
      ${sswitch('quickSeesJob', settings.quickSeesJob === true, 'Quick brain sees the job', keep('While chatting beside a long job, the Quick brain knows the job, its run time and last step. It can show the steps so far or pass the big brain a note. Needs Chat while busy.'))}
      ${hw?.gpu?.integrated ? holdbackHtml() : ''}
      ${sswitch('allTools', settings.allTools, 'Send all tools', 'Sends every tool with each message. Uses more context.')}`],
    // 1.5.210 House style lives here now (it sat beside the slots on the old paper doll): every group, times of day too.
    ['house', '🖋 House style', 'house style defaults default length mood genre music picture style shape clip video sound effects morning time evening night times of day', () => `<p class="muted">Your defaults for music, pictures, clips, sound effects and times of day. Empty boxes mean Bob picks. He says when he used one, with a Change link back here.</p>${Object.keys(HOUSE).map((g) => houseStyleHtml(g, settings.houseStyle)).join('')}`],
    // 1.5.210 Bob's personality (the dials, presets and how he'd greet you) moved here from the old paper doll.
    ['personality', '🎚 Personality', 'personality attributes dials preset greeting warm funny formal chatty look comments call me name what he makes of his look', () => attributesHtml({ personality: settings.personality, look: settings.look, lookText: settings.lookText, lookComments: settings.lookComments, user: settings.userName, callMe: settings.callMe, windowsName: settings.windowsName })],
    ['presets', '🎭 Assistant presets', 'assistant presets preset per chat instructions system prompt persona character role brain effort temperature tools talking only', () => '<div class="presets-box"></div>'],
    ['voice', '🔊 Voice details', 'kokoro chatterbox speed hey bob read aloud listen talk over interrupt stop barge in talk with bob hands-free hands free conversation xai grok online voice read documents aloud a voice per bob voices bob-net', () => voiceDetailsHtml()],
    ['look', '🌓 Look & feel', 'theme editor now running layout', () => lookExtrasHtml()],
    ['speed', '⚡ Speed & memory', 'speed memory free memory quiet keep alive unload idle graphics card quick answers processor pictures without waiting ready while you type games go first picture settings gaming graphics card borrow automatic never always remember only what fits memory banks recall speed test engine extras guess ahead copying load the next brain early laptop mode battery new graphics card speed history chart', () => speedMemoryHtml()],
    ['engines', '⚙ Engines', 'engine engines brain engine lab engine gear update updates go back remove check all ollama llama.cpp downloads newer build tested build fit to free graphics memory speculative decoding draft flags threads batch tell me what engine updates change plain words', () => enginesHtml()],
    ['bobnet', '🌐 Bob-Net', 'bob-net bobnet phone android tailscale address passcode firewall let my phone in let my other replicant matrices in other bobs share brains lend borrow take jobs send jobs carry on take chats move chat phone see how doing your bobs widget card heat', () => bobNetHtml()],
    ['online', '☁ Online services', 'online internet cloud helpers api key anthropic openai gemini openrouter telegram discord bot token pairing wake phrase rented brains rent hire runpod vast lambda together spending cap limit machine', () => onlineHtml()],
    ['email', '📧 Email account', 'email mail account imap smtp app password gmail outlook hotmail icloud yahoo reading sending server reset code', () => emailAccountHtml()],
    ['apps', '🔌 Other apps', 'other apps comfyui workflows port unreal blender mcp openai compatible api vs code continue opencode command line terminal cli key claude claude code desktop connect hands key', () => otherAppsHtml()],
    ['hands', '✋ Hands', 'files run commands schedules apps permission quarantine reviewer', () => handsSettingsHtml() + quarantineSettingsHtml()],
    ['housekeeping', '🧹 Housekeeping', 'tidy old chats pictures logs', () => housekeepingHtml()],
    ['adventure', '🎲 Adventure', 'adventure game tabletop role-playing dice game master party bobs cards plot armour campaign', () => `<div class="adventure-box">${adventureSettingsHtml(settings.adventure || {})}</div>`],
    ['games', '🧩 Games', 'games twenty questions hangman word ladder five letters story dice quick brain banter chip in', () => `<div class="games-box">${gamesSettingsHtml(settings.games || {})}</div>`],
    ['jobs', '🔁 Jobs', 'jobs job steer mid-job stop after this step time limit minutes receipt undo run tests after code edits question vague remember no deny reason reuse look-ups cache sources how sure file line links editor vs code cursor', () => jobsHtml()],
    ['prompts', '📝 Saved prompts', 'saved prompts prompt library slash / menu template templates reuse snippets blanks variables {file} curly brackets', () => sswitch('promptMenu', settings.promptMenu === true, 'Saved prompts with /', 'Type / at the start of a message to pick a saved prompt. Words in {curly brackets} are blanks; Tab jumps to the next.') + promptsHtml()],
    ['health', '🩺 Health and history', 'health page crash crashes catch crash report safe start opt-in switches put back undo settings changes put it back history weekly week what bob did counts statistics engine card disk errors', () => '<div class="harness-box" data-part="health"></div>'], // public/harness.js
    ['quiet', '🌙 Quiet hours and shortcut', 'quiet hours do not disturb night sleep notifications pop-ups sounds urgent reminders shortcut hotkey global key ctrl space ask box anywhere', () => '<div class="harness-box" data-part="quiet"></div>'],
    ['chatx', '💬 Chat extras', 'fade old messages fade into memory clear chat amnesia mode forget privacy wipe try from here branch fork copy chat pin pinned message keep in mind guest chat incognito private nothing saved chat places engine memory switch chats quick', () => '<div class="harness-box" data-part="chats"></div>'],
    ['daily', '🗓 Everyday helpers', 'everyday helpers today card weather reminders morning focus timer pomodoro quiet do not disturb receipt receipts spending sheet expenses budget csv profiles people family shared pc guest tour what\'s new after an update tray dot badge text size font', () => dailyHtml()],
    ['tools', '🧰 More tools', 'more tools calculator sums units convert python sandbox password passphrase pin reminders repeat every phone email mail imap calendar ics webcal watch page web api key service csv database sql query chart graph spelling grammar meeting recording transcript notes speakers compare files diff what changed', () => moreToolsHtml()],
    ['checkins', '🔔 Check-ins', 'check in heartbeat schedule morning every day weekday hours notify alert tap shoulder downloads stuck failed tasks disk space own checks build finished', () => checkinsHtml()],
    ['remove', '🗑 Remove Bob', 'uninstall remove', () => settings.features?.uninstall === false ? macRemoveHtml() : `<div class="remove-bob">${more('Takes off Bob\'s program, his Start menu shortcut and "Launch on start-up". His chats, settings and models stay unless you tick them. Nothing else in the inn folder or in Windows is touched.')}<button data-removebob>Remove Bob…</button><div class="remove-confirm" hidden></div></div>`]
  ];

  // "?" next to a heading opens Help at that entry (public/help.js).
  const helpLink = (id, label, text = '? Help') => `<button type="button" class="mini help-link" data-help="${esc(id)}" aria-label="Help: ${esc(String(label).replace(/^\W+/, ''))}">${esc(text)}</button>`;
  // What a card says is set now (Simple view). Empty when there's nothing short to say.
  const cardNow = (id) => {
    const onoff = (v) => (v ? 'on' : 'off');
    if (id === 'bob') { const t = settings.tts || {}, st = settings.style || {}; const v = t.provider === 'kokoro' ? ((settings.kokoroVoices || []).find(([k]) => k === (t.voice || 'am_michael'))?.[1] || t.voice || '').replace(/ \(.*$/, '') : t.provider === 'piper' ? 'Piper' : t.provider === 'chatterbox' ? 'Chatterbox' : 'Windows'; return `Voice: ${v} · Theme: ${findTheme(st.theme || DEFAULT_THEME, st.custom || [])?.name || 'Bob\'s Inn'}`; }
    if (id === 'how') return `One brain: ${onoff(settings.oneBrain)} · Web search: ${onoff(settings.webSearch === true)}`;
    if (id === 'brains') return `Bob picks the session: ${onoff(settings.autoSession !== false)}`;
    if (id === 'may') { const k = settings.ownKit; return k && (k.tools || k.howtos) ? `${k.tools} tool${k.tools === 1 ? '' : 's'} · ${k.howtos} how-to${k.howtos === 1 ? '' : 's'} made` : ''; }
    if (id === 'pc') return `Bob ${settings.version?.label || ''}`;
    return '';
  };
  const EV_NAMES = { 'ev-pc': '💻 This replicant matrix and updates', 'ev-bob': '🙂 Bob himself', 'ev-how': '⚡ How Bob works' };
  const topicName = (id) => EV_NAMES[id] || EVERY_EXTRA.find(([k]) => k === id)?.[1] || ADV.find(([k]) => 'adv-' + k === id)?.[1] || id;
  const TOP_PANELS = '.set-page > .everyday > .spanel, .set-page > .advanced > .adv-sec';
  const topPanels = () => [...dlg.querySelectorAll(TOP_PANELS)];
  function settingsHtml() {
    const seg = (v, label) => `<button type="button" role="radio" aria-checked="${view === v}" data-sview="${v}">${label}</button>`;
    const top = `<div class="set-top"><span class="ttabs set-view" role="radiogroup" aria-label="How Settings is laid out">${seg('simple', 'Simple')}${seg('advanced', 'Advanced')}</span>${tip('Simple shows eight cards. Advanced lists every section down the side. Both hold the same settings.', 'Simple or Advanced')}
      <input type="search" data-ssearch placeholder="Search settings" aria-label="Search settings" value="${esc(settingsQuery)}">${helpLink('settings-everyday', 'Settings', '? Help with these settings')}</div>`;
    const nav = view === 'advanced' ? `<nav class="set-nav" aria-label="Settings sections">${SET_GROUPS.map(([g, ids]) => `<h4>${esc(g)}</h4>${ids.map((id) => `<button type="button" data-topic="${id}">${esc(topicName(id))}</button>`).join('')}`).join('')}</nav>` : '';
    const cards = view === 'simple' ? `<div class="set-cards">${SET_CARDS.map((c) => `<button type="button" class="set-card" data-card="${c.id}"><span class="set-card-icon" aria-hidden="true">${c.icon}</span><strong>${esc(c.name)}</strong><span class="muted">${esc(c.about)}</span><span class="set-card-now">${esc(cardNow(c.id))}</span></button>`).join('')}</div>
      <div class="set-back" hidden><button type="button" data-card="">← All settings</button><h3 tabindex="-1"></h3></div>` : '';
    return `<section class="settings set-${view}">${top}<div class="set-body">${nav}<div class="set-main">${cards}<div class="set-page">${everydayHtml()}
      <div class="advanced">${ADV.map(([id, label, words, body]) => `<details class="subsection adv-sec spanel" data-panel="adv-${id}" id="sub-adv-${id}" data-words="${esc(words)}" ${openPanels.has('adv-' + id) ? 'open' : ''}><summary><h3>${esc(label)}</h3>${helpLink('settings-' + id, label)}</summary>${body()}</details>`).join('')}</div>
      <p class="muted adv-none" hidden>No settings match that.</p></div></div></div></section>`;
  }

  // Shows the panels the view calls for: one section (Advanced), one card's sections (Simple), or what a search finds.
  function applyView() {
    const sec = dlg.querySelector('section.settings'); if (!sec) return;
    const q = settingsQuery.trim();
    sec.classList.toggle('searching', Boolean(q));
    if (q) return filterSettings();
    const panels = topPanels(), ids = panels.map((p) => p.dataset.panel);
    if (view === 'advanced') {
      if (!ids.includes(curTopic)) curTopic = ids[0] || '';
      for (const p of panels) { const on = p.dataset.panel === curTopic; p.hidden = !on; if (on) p.open = true; }
      for (const n of sec.querySelectorAll('.set-nav [data-topic]')) { n.hidden = !ids.includes(n.dataset.topic); if (n.dataset.topic === curTopic) n.setAttribute('aria-current', 'page'); else n.removeAttribute('aria-current'); }
    } else {
      const card = SET_CARDS.find((c) => c.id === curCard);
      const mine = card ? card.topics.filter((t) => ids.includes(t)) : [];
      for (const p of panels) { const on = mine.includes(p.dataset.panel); p.hidden = !on; if (on) p.open = mine.length === 1 || openPanels.has(p.dataset.panel); }
      const grid = sec.querySelector('.set-cards'), back = sec.querySelector('.set-back');
      if (grid) grid.hidden = Boolean(card);
      if (back) { back.hidden = !card; back.querySelector('h3').textContent = card ? `${card.icon} ${card.name}` : ''; }
    }
    const none = sec.querySelector('.adv-none'); if (none) none.hidden = true;
  }
  // Goes to one section in whichever view is up, and remembers it.
  function showTopic(id) {
    const t = topicFor(id, ADV_MOVED); if (!t) return;
    curTopic = t; curCard = cardOf(t)?.id || '';
    try { localStorage.setItem('bob-settings-topic', t); } catch {}
    applyView();
  }

  // The search box: every section whose words match, in either view (and inside an advanced one, the blocks that match).
  function filterSettings() {
    const q = settingsQuery.trim().toLowerCase();
    let any = false;
    for (const sec of topPanels()) {
      const head = `${sec.querySelector('summary h3, summary .spanel-title')?.textContent || ''} ${sec.dataset.words || ''}`.toLowerCase();
      const whole = head.includes(q);
      let hit = whole;
      if (sec.classList.contains('adv-sec')) {
        for (const el of [...sec.children].filter((c) => c.tagName !== 'SUMMARY')) {
          const show = whole || el.textContent.toLowerCase().includes(q);
          el.hidden = !show; if (show) hit = true;
        }
      } else if (!hit) hit = sec.textContent.toLowerCase().includes(q);
      sec.hidden = !hit; if (hit) { any = true; sec.open = true; }
    }
    const none = dlg.querySelector('.adv-none'); if (none) none.hidden = any;
  }

  // 1.5.91 "Get Bob ready": one list with every program and model, each with its own tick box, the recommended ones
  // ticked, sizes and free disk shown first, one OK. Bob puts each one in its slot himself when it's in.
  let wSplit = 'specialists'; // 1.5.205 how the brains are split on the first-time screen; Specialists = my usual picks
  let wPicks = null; // ticked ids (models and "engine:<id>"); null = the recommended ones
  let wIds = []; // what the last press started, for Pause and Stop
  function welcomeRows() {
    const pack = data.packs.find((p) => p.id === hw.suggestedPack) || data.packs[0];
    const main = allSlots().find((x) => x.id === 'bob');
    const bad = (checks || []).filter((c) => !c.ok).map((c) => c.id);
    const rows = readyList({ pack, models: data.models, engines: data.engines || [], hw: hwCtx(), mainEmpty: !(main && equipped(main, eqCtx())), bad });
    for (const r of rows) if (r.kind === 'model' && !r.blocked) { const m = data.models.find((x) => x.id === r.id); const st = m && suit(m); if (st?.level === 'blocked') r.blocked = st.why; else if (st && st.level !== 'ok' && !r.here) r.warn = 'not recommended for this replicant matrix'; }
    if (!wPicks) wPicks = splitPicks(rows, wSplit);
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
      <fieldset class="split-pick"><legend><strong>How should I split my brains?</strong> <span class="muted">This only changes which brains are ticked below. You can change it any time on the Brains page.</span></legend>
        ${SPLITS.map((x) => `<label class="split-opt${x.lock ? ' locked' : ''}"><input type="radio" name="wsplit" data-wsplit="${x.id}" ${x.id === wSplit ? 'checked' : ''} ${x.lock ? 'disabled' : ''}> <span><strong>${esc(x.name)}</strong> <span class="muted">${esc(x.does)}${x.lock ? ` 🔒 ${esc(x.lock)}` : ''}</span></span></label>`).join('')}</fieldset>
      <h4>Programs I run on</h4><ul class="packlist">${engines.map(row).join('')}</ul>
      <h4>Models</h4><ul class="packlist">${models.map(row).join('')}</ul>
      ${order.missing.length ? `<p class="warn-text">${order.missing.map((x) => `${esc(x.model)} runs on ${esc(x.engine)}, which isn't ticked.`).join(' ')} Tick it, or that model sits unused.</p>` : ''}
      <p>${order.ids.length ? `About <strong>${gb(order.sizeGB)}</strong> to download. Free disk: ${hw.freeGB ?? '?'} GB. The big ones take a while; you can chat with me as soon as the programs and a brain are in.` : rows.some((r) => !r.here && !r.blocked) ? 'Nothing ticked to get. You can always come back here: Settings, Run first-time setup.' : 'Everything is already on this replicant matrix.'}</p>
      ${short ? `<p class="error">Not enough free disk: free up ${short} GB, or untick something, then press Try again.</p>` : ''}
      ${job ? progress() : ''}
      <div class="row">${moving ? '<button data-readypause>Pause</button><button data-readystop>Stop</button>' : paused ? '<button class="get" data-readyresume>Resume</button><button data-readystop>Stop</button>' : short ? '<button class="get" data-readyrecheck>Try again</button>' : order.ids.length ? `<button class="get" data-getready>Get Bob ready (about ${gb(order.sizeGB)})</button>` : ''}</div>
      <p class="muted">You can change any of this later in Settings, Brains. If you skip something and ask me for it, I'll offer to set it up right there in the chat.</p></section>
      ${wantsHtml(settings || {}, esc, { full: jumpTo === 'wants' })}
      <div class="row welcome-end"><button data-skip>${order.ids.length && !moving ? 'Skip the downloads for now' : 'Done'}</button></div>
    </div>`;
  }

  // Settings in its own window: the main window hands it over and stays on the page it had.
  function divert() {
    if (!popOut || mode !== 'shop' || tab !== 'settings') return false;
    if (!popOut(jumpTo)) return false;
    jumpTo = ''; tab = lastTab;
    return true;
  }
  function draw() {
    if (divert() && !dlg.open) return;
    if (!data) { $('cellar-body').innerHTML = '<p class="muted">Loading...</p>'; return; }
    $('cellar-body').innerHTML = mode === 'welcome' ? welcomeHtml() : shopHtml();
    // 1.5.75: the first button is Get Bob ready. 1.5.210: focused without scrolling, so the Welcome opens at the top
    // (its name box and Get me ready), not half way down the page.
    if (mode === 'welcome') { dlg.querySelector('[data-getready]')?.focus({ preventScroll: true }); if (jumpTo !== 'wants') dlg.scrollTop = 0; }
    stylePage.paintPreviews(dlg, settings);
    const mini = dlg.querySelector('.attr-avatar');
    if (mini) { const c = mini.getContext('2d'); c.imageSmoothingEnabled = false; try { drawBob(c, 64, {}, settings?.look); } catch {} }
    mountHandsSettings(dlg.querySelector('.hands-box')); // loads its own data; does nothing off the Settings tab
    mountQuarantineSettings(dlg.querySelector('.q-box'));
    mountSecrets(dlg.querySelector('.secrets-box')); // This replicant matrix: 🔐 Locked secrets
    mountMoreTools(dlg.querySelector('.more-tools-box')); // How Bob works: 🧰 More tools
    mountEmailAccount(dlg.querySelector('.email-account-box')); // Online services: 📧 Email account
    mountPhoneAccess(dlg.querySelector('.phone-box')); // Bob-Net, This Bob: Bob-Net access
    mountLockSettings(dlg.querySelector('.lock-box'), { onChange: (v) => { if (settings) settings.passcodeLock = v; const n = dlg.querySelector('[data-panel="ev-lock"] .spanel-note'); if (n) n.textContent = lockSummary(v); } }); // 🔒 Passcode lock
    mountTelegram(dlg.querySelector('.telegram-box')); // Online services: Bob on Telegram
    mountDiscord(dlg.querySelector('.discord-box')); // Online services: Bob on Discord
    mountAppsDoor(dlg.querySelector('.apps-door-box')); // Other apps: Brains for other apps
    mountClaudeDoor(dlg.querySelector('.claude-door-box')); // Other apps: Hands for Claude
    mountAgentsSettings(dlg.querySelector('.coding-agents-box')); // Other apps: Coding agents
    mountCheckins(dlg.querySelector('.checkins-box')); // 1.5.78 Check-ins
    mountPresets(dlg.querySelector('.presets-box')); // Assistant presets (loads its own list)
    mountPrompts(dlg.querySelector('.prompts-box')); // 📝 Saved prompts
    for (const b of dlg.querySelectorAll('.harness-box')) mountHarness(b); // items 62 to 72 (public/harness.js)
    mountEveryday(dlg.querySelector('.everyday-box'), { settings, flash: (el, m) => flash(el, m) }); // 🗓 Everyday helpers
    mountAdventureSettings(dlg.querySelector('.adventure-box'), { api, settings }); // 1.5.117 🎲 Adventure
    mountGamesSettings(dlg.querySelector('.games-box'), { api, settings }); // 1.5.121 🧩 Games
    mountShareBrains(dlg.querySelector('.share-box')); // Bob-Net: My other Bobs and What they share
    mountNetFiles(dlg.querySelector('.net-files-box')); // Nov 14 Bob-Net: Files and brains
    readyLine(); // 1.5.117: "Bob 1.5.117 is ready · Restart Bob now" on the updates line when a new Bob waits
    const page = mode === 'welcome' ? 'Welcome' : tab === 'settings' ? 'Settings' : tab === 'style' ? 'Style' : 'Get models';
    $('cellar-title').textContent = page;
    dlg.dataset.page = page; // the Settings window shows no page tabs while it's on Settings
    for (const [id, on] of [['cellarBtn', page === 'Get models'], ['settingsBtn', page === 'Settings'], ['styleBtn', page === 'Style'], ['chatBtn', false]]) $(id)?.classList.toggle('on', on);
    // The page tabs stay pinned under the title, so Settings, Style and every model page are one click away even after scrolling down.
    const head = dlg.querySelector('.cellar-head'); if (head) dlg.style.setProperty('--cellar-head-h', head.offsetHeight + 'px');
    const bar = dlg.querySelector('.cellar-tabs'); dlg.style.setProperty('--cellar-tabs-h', (bar ? bar.offsetHeight : 0) + 'px');
    if (mode === 'shop' && tab === 'settings') applyView();
    if (houseFocus) { const d = dlg.querySelector(`#house-${houseFocus}`); if (d) { d.open = true; d.scrollIntoView({ block: 'center' }); d.querySelector('input, select')?.focus(); houseFocus = null; } }
    if (jumpTo) { const el = dlg.querySelector('#sub-' + CSS.escape(ADV_MOVED[jumpTo] || jumpTo)); jumpTo = ''; const top = el?.closest(TOP_PANELS); if (top) showTopic(top.dataset.panel); if (el?.tagName === 'DETAILS') { el.open = true; if (el.dataset.panel) openPanels.add(el.dataset.panel); } if (el && el === top && view === 'advanced') dlg.scrollTop = 0; else el?.scrollIntoView({ block: 'start' }); }
    if (mode !== 'shop' || tab !== 'settings') lastTab = mode === 'shop' ? tab : lastTab;
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
    await placeLoad(); calWatch(); // 1.5.205 the Brains page: each brain's placement and calibration
    speedRuns = (await api('/api/speed-test').catch(() => ({}))).history || [];
    speedLogData = await api('/api/speed-log').catch(() => null); // 96
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

  // ---- Brains and the catalogue ----
  let catFocus = ''; // 1.5.56: which job the Brain catalogue opened at
  // 1.5.101: which model families are open in the Brain catalogue (job:family -> true). All start closed.
  const FAM_KEY = 'bob-cat-families';
  let famOpen = (() => { try { const v = JSON.parse(localStorage.getItem(FAM_KEY)); return v && typeof v === 'object' ? v : {}; } catch { return {}; } })();
  const saveFam = () => { try { localStorage.setItem(FAM_KEY, JSON.stringify(famOpen)); } catch {} };
  let houseFocus = null; // 1.5.34: "Change" on a "Used your house style" line opens that House style box
  // 1.5.125 Bob's home folder: sizes and warnings come from /api/home when the panel is opened.
  let homeInfo = null, homeAsk = null; // homeAsk: a folder waiting for "Yes, move everything"
  async function loadHome() {
    homeInfo = { loading: true };
    try { homeInfo = await api('/api/home'); } catch (e) { homeInfo = { error: e.message, folder: settings?.home || '' }; }
    const y = dlg.scrollTop; draw(); dlg.scrollTop = y;
  }
  let setUpBrain = '', placeData = null; // 1.5.205 the brain whose Set up page is open, and /api/brain-place
  let labScores = null; // Nov 11: Lab scores on the Brains page (only when the Lab is on and has scored a brain)
  let honesty = null; // Nov 12, item 192: each brain's honesty score (always on)
  const placeLoad = async () => { [placeData, labScores, honesty] = await Promise.all([api('/api/brain-place').catch(() => placeData), api('/api/lab/brain-scores').then((j) => j?.scores || null).catch(() => labScores), api('/api/honesty').then((j) => j?.scores || null).catch(() => honesty)]); };
  const placeSave = async (model, patch) => { const cur = placeData?.brains?.[model]?.set || { mode: 'auto' }; await api('/api/settings', { brainPlace: { [model]: { ...cur, ...patch } } }); await placeLoad(); };
  // 1.5.205 Calibrate: the question before it starts ({ models, needUnload, names, error }), and a slow poll while it runs.
  let calAsk = null, calTimer = null;
  const calWatch = () => {
    if (calTimer || placeData?.job?.state !== 'running') return;
    calTimer = setInterval(async () => {
      await placeLoad();
      const on = placeData?.job?.state === 'running';
      if (!on) { clearInterval(calTimer); calTimer = null; }
      if (dlg.open !== false && mode === 'shop' && tab === 'settings' && !dlg.querySelector('select:focus, input:focus, textarea:focus')) draw();
    }, 2500);
  };
  const calStart = async (unload) => {
    const ctx = { ...eqCtx(), place: placeData };
    const brains = brainsInUse(ctx).filter((x) => calAsk.models.includes(x.value)).map((x) => ({ model: x.value, name: x.name, experts: Boolean(x.entry && hasExperts(x.entry)) }));
    try {
      const r = await api('/api/brain-place/calibrate', { brains, unload });
      if (r.needUnload) calAsk = { ...calAsk, needUnload: true, names: r.names || [] };
      else if (r.error) calAsk = { ...calAsk, error: r.error };
      else calAsk = null;
    } catch (e) { calAsk = { ...calAsk, error: e.message || 'Calibrating didn\'t start.' }; }
    await placeLoad(); calWatch();
  };
  let setupAsk = ''; // 1.5.205 the Brains page: the setup whose list of changes is showing
  let eqSelected = 'bob', eqView = (() => { try { return localStorage.getItem('bob-brains-view') === 'list' ? 'list' : 'brains'; } catch { return 'brains'; } })(); // 1.5.210 a remembered paper doll view lands on the Brains page
  function eqCtx() {
    return { roles, models: shownModels(), brains: settings?.sessionBrains || {}, oneBrain: settings?.oneBrain === true, embed: roles?.current?.embed || '', selected: eqSelected, vramGB: hw?.vramGB || hw?.gpu?.vramGB || null, unified: Boolean(hw?.gpu?.unified), integrated: Boolean(hw?.gpu?.integrated), arm: hw?.board === 'arm', ramGB: hw?.ramGB || null, freeGB: hw?.freeGB ?? null, platform: settings?.platform, showUnsuited,
      famOpen, packs: data?.packs || [], packId: starterPack, picks: starterPicks, engines: data?.engines || [], starterOpen,
      houseStyle: settings?.houseStyle || {}, active: settings?.activeModels || {}, saveDir: settings?.saveDir || {},
      rent }; // 1.5.127 the Rented brain slot
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
  async function eqReload() { [roles, settings, bctx] = await Promise.all([api('/api/roles'), api('/api/settings'), api('/api/brain-ctx').catch(() => bctx)]); await placeLoad(); }
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
    if (eqView === 'brains' && slot.kind === 'llm') offer = false; // the Brains page gives a brain more jobs from its own row
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
  dlg.addEventListener('toggle', (e) => { const d = e.target; if (!d.dataset?.panel || settingsQuery.trim()) return;
    if (d.matches(TOP_PANELS)) { if (view === 'advanced') { if (!d.open && !d.hidden) d.open = true; return; } if (d.hidden) return; }
    if (d.open) openPanels.add(d.dataset.panel); else openPanels.delete(d.dataset.panel); saveOpen();
    // An everyday panel closing shows its summary of what's set now: draw again so it's up to date.
    if (!d.open && d.dataset.panel.startsWith('ev-')) { const y = dlg.scrollTop; draw(); dlg.scrollTop = y; } }, true);
  dlg.addEventListener('click', async (e) => {
    const b = e.target.closest('button, input, select');
    if (!b) return;
    if (b.tagName === 'BUTTON' && b.closest('summary')) e.preventDefault(); // 1.5.117: Check for updates on a panel's line
    try {
      if ((tab === 'style' || (tab === 'settings' && (b.dataset.motion || b.dataset.nowneed))) && mode === 'shop' && await stylePage.onClick(b, settings)) return;
      if (b.dataset.sampleEngine) { sampler.play(b); return; }
      if ('talkkeysave' in b.dataset || 'talkkeyforget' in b.dataset) { // 🗣 Talk with Bob's xAI key, kept in the locked store
        const box = b.closest('.talk-cloud');
        const key = box?.querySelector('[data-talkkey]')?.value.trim() || '';
        if ('talkkeysave' in b.dataset && !key) { flash(b, 'Paste the key first.'); return; }
        const r = await api('/api/talk', 'talkkeyforget' in b.dataset ? { forgetXaiKey: true } : { xaiKey: key });
        Object.assign(settings, r);
        if (box) box.outerHTML = talkCloudHtml();
        window.dispatchEvent(new CustomEvent('bob-voice-net', { detail: {} }));
        return;
      }
      if (b.dataset.turboremove) { const r = await api('/api/settings', { speed: { turbo: { [b.dataset.turboremove]: null } } }); settings.speed = r.speed; const box = b.closest('div')?.parentElement; flash(box || b, 'Turbo removed for that brain.'); b.closest('.row')?.remove(); return; } // 1.5.16x
      if ('trainerremove' in b.dataset) { // 1.5.167: in-page confirm, same words as the Lab's Teach it page
        const p = b.parentElement; if (p.querySelector('[data-trainerremovego]')) return;
        b.setAttribute('aria-expanded', 'true');
        p.insertAdjacentHTML('beforeend', '<div class="setup-offer" role="alert"><strong>Remove the Trainer pack?</strong><span>Brains you taught stay. Get it again any time.</span><div class="row"><button type="button" class="get" data-trainerremovego>Remove it</button><button type="button" class="link" data-trainerremoveno>Keep it</button></div></div>');
        p.querySelector('[data-trainerremovego]').focus(); return;
      }
      if ('trainerremoveno' in b.dataset) { const p = b.closest('.setup-offer').parentElement; b.closest('.setup-offer').remove(); const r = p.querySelector('[data-trainerremove]'); if (r) { r.setAttribute('aria-expanded', 'false'); r.focus(); } return; }
      if ('trainerremovego' in b.dataset) { const p = b.closest('.setup-offer').parentElement; await api('/api/lab/teach/trainer/remove', {}); settings.speed = { ...settings.speed, trainer: false }; b.closest('.setup-offer').remove(); const r = p.querySelector('[data-trainerremove]'); if (r) r.remove(); flash(p, 'The Trainer pack is removed. Brains you taught stay.'); return; }
      if (b.dataset.qreset) { // 1.5.148: one preset back to Qwen's numbers
        const fs = b.closest('[data-qpreset]'); const d = settings.qwenDefaults?.[b.dataset.qreset] || {};
        for (const f of fs.querySelectorAll('[data-qfield]')) f.value = d[f.dataset.qfield] ?? '';
        await saveQwen(b, `${d.label || 'That set'} is back to Qwen's settings.`); return;
      }
      if (b.dataset.gomodel) { setTab(b.dataset.gocat); jumpTo = ''; draw(); dlg.querySelector('#m-' + CSS.escape(b.dataset.gomodel))?.scrollIntoView({ block: 'center' }); return; }
      if ('unsuitedsw' in b.dataset) { setShowUnsuited(!showUnsuited); draw(); return; }
      if ('lookcomments' in b.dataset) { const on = b.getAttribute('aria-checked') !== 'true'; const r = await api('/api/settings', { lookComments: on }); settings.lookComments = r.lookComments; b.setAttribute('aria-checked', String(r.lookComments)); b.querySelector('.st').textContent = r.lookComments ? 'On' : 'Off'; return; }
      if ('unsuited' in b.dataset) { setShowUnsuited(!showUnsuited); draw(); return; }
      // 1.5.132: the catalogue's Well behaved / Naughty list toggle, and "Show the naughty list" (the same setting as in Settings).
      if ('findmore' in b.dataset) { const y = dlg.scrollTop; await findRun(true); dlg.scrollTop = y; return; }
      if (b.dataset.findpick) { // 1.5.209 a hit's sizes: the same pop-up as Add a model page
        b.disabled = true; const link = b.dataset.findpick;
        const r = await api('/api/catalog-added/look', { page: link }).catch((x) => ({ error: x.message }));
        b.disabled = false;
        if (r.error) { find = { ...find, error: r.error }; const y = dlg.scrollTop; draw(); dlg.scrollTop = y; dlg.querySelector('#catjob-find [role="alert"]')?.scrollIntoView({ block: 'nearest' }); } else pagePick(r, link);
        return;
      }
      if ('catfilterReset' in b.dataset) { setCatFilters({}); draw(); return; }
      if (b.dataset.catview) { if (b.dataset.catview === 'naughty' && !naughtyOn()) return; setCatView(b.dataset.catview); draw(); return; }
      // 1.5.135: ➕ Your own brains. Pick the file (a window on this replicant matrix), name it, add it; or take one off the list.
      if ('ownadd' in b.dataset) { b.disabled = true; const r = await ownPick('gguf'); if (!r) return; if (!r.file) { b.disabled = false; return; } ownForm = r.error ? { file: r.file, name: '', error: r.error } : { file: r.file, name: r.name, params: r.params, sizeGB: r.sizeGB, mmproj: r.mmproj || '', card: r.card || null }; draw(); dlg.querySelector('[data-ownname]')?.focus(); return; }
      if (b.dataset.ownmm) { if (!ownForm) return; ownForm.name = dlg.querySelector('[data-ownname]')?.value || ownForm.name; if (b.dataset.ownmm === 'clear') { ownForm.mmproj = ''; draw(); return; } const r = await ownPick('mmproj'); if (r && r.file) { ownForm.mmproj = r.file; ownForm.error = ''; draw(); } return; }
      if ('owncancel' in b.dataset) { ownForm = null; draw(); return; }
      if ('ownpathopen' in b.dataset) { ownForm = { file: '', name: '' }; draw(); dlg.querySelector('[data-ownpath]')?.focus(); return; }
      if ('owndo' in b.dataset) { return; } // the form's submit handler does it
      // 1.5.205 Remove a catalogue entry from this replicant matrix's own list (asked first), and Put back.
      if (b.dataset.catremove) {
        const li = b.closest('li'), box = li?.querySelector('.confirm'); if (!box) return;
        box.hidden = false; box.innerHTML = `<p>Take <strong>${esc(li.querySelector('.kit-name')?.textContent || 'it')}</strong> off your list? Only this replicant matrix's list changes, and nothing is deleted. You can put it back at the bottom of the catalogue.</p><div class="row"><button type="button" class="get" data-catremove2="${esc(b.dataset.catremove)}">Remove</button><button type="button" class="mini" data-catremovecancel>Cancel</button></div>`;
        box.querySelector('button')?.focus(); return;
      }
      if ('catremovecancel' in b.dataset) { const box = b.closest('.confirm'); if (box) { box.hidden = true; box.innerHTML = ''; } return; }
      if (b.dataset.catremove2 || b.dataset.catputback) {
        b.disabled = true; const y = dlg.scrollTop;
        await api('/api/settings', b.dataset.catremove2 ? { catalogRemove: b.dataset.catremove2 } : { catalogPutBack: b.dataset.catputback }).catch(() => {});
        data = { ...data, ...(await api('/api/models').catch(() => data)) }; draw(); dlg.scrollTop = y; return;
      }
      if (b.dataset.ownremove) {
        const li = b.closest('li'); const box = li?.querySelector('.confirm');
        if (!box) return;
        if (!box.hidden) { box.hidden = true; box.innerHTML = ''; return; }
        box.hidden = false; box.innerHTML = `<p>Take <strong>${esc(li.querySelector('.kit-name')?.textContent || 'it')}</strong> off Bob's list? The file stays where it is; only Bob forgets it. Any slot wearing it is emptied.</p><div class="row"><button type="button" class="get" data-ownremove2="${esc(b.dataset.ownremove)}">Remove from Bob's list</button><button type="button" data-ownkeep>Keep it</button></div>`;
        return;
      }
      if ('ownkeep' in b.dataset) { const box = b.closest('.confirm'); box.hidden = true; box.innerHTML = ''; return; }
      if (b.dataset.ownremove2) { b.disabled = true; const r = await api('/api/own-models/remove', { id: b.dataset.ownremove2 }).catch((e) => ({ error: e.message })); if (r.error) { b.closest('.confirm').innerHTML = `<p class="error">${esc(r.error)}</p>`; return; } await ownRefresh(); return; }
      if ('naughtyon' in b.dataset) { const r = await api('/api/settings', { naughtyList: true }); settings.naughtyList = r.naughtyList === true; if (settings.naughtyList) setCatView('naughty'); draw(); return; }
      if (b.tagName === 'BUTTON' && await backup.onClick(b)) return; // Back up and move
      if (b.dataset.help && b.closest('summary')) e.preventDefault(); // a "?" in a panel heading opens Help, not the panel
      if (b.dataset.help) { window.dispatchEvent(new CustomEvent('bob-help', { detail: b.dataset.help })); return; }
      if (b.dataset.userole) {
        const r = await api('/api/models/role', { job: b.dataset.userole, value: b.dataset.value });
        roles.current[b.dataset.userole] = b.dataset.value;
        if (r.needsEngine) askEngine(b.closest('td') || b.parentElement); else draw();
        return;
      }
      if ('gohouse' in b.dataset) { houseFocus = b.dataset.gohouse || 'music'; if (popOut && popOut('adv-house')) return; setTab('settings'); jumpTo = 'adv-house'; draw(); return; } // 1.5.210 House style is in Settings
      // 1.5.41 Save folder.
      if ('savebrowse' in b.dataset) { const r = await api('/api/pick-folder', { purpose: 'save' }); const box = dlg.querySelector('#save-path'); if (r.folder && box) { box.value = r.folder; saveDirState(); await saveDirTo(r.folder); } else if (r.error) { const eb = dlg.querySelector('.save-error'); if (eb) { eb.textContent = r.error; eb.hidden = false; } } return; }
      if ('savedir' in b.dataset) { const v = dlg.querySelector('#save-path')?.value.trim(); if (v) await saveDirTo(v); return; }
      if ('saveown' in b.dataset) { await saveDirTo(''); return; }
      if ('forgettools' in b.dataset) { try { const r = await api('/api/settings', { toolLearningForget: true }); settings.toolScores = r.toolScores || []; draw(); } catch (err) { flash(b, err.message); } return; }
      if ('opennotes' in b.dataset) { try { await api('/api/open', { path: settings?.quickNotesFile || '' }); } catch (err) { flash(b, err.message); } return; }
      // 🔒 With Lock my chats and memory on, the file is scrambled on disk: it opens here instead of in a text editor.
      if ('openmemory' in b.dataset && settings?.passcodeLock?.encrypt) {
        const box = b.parentElement.querySelector('.mem-edit');
        try { const r = await api('/api/memory/text'); if (box) box.innerHTML = `<label class="muted" for="mem-text">Bob's memory (locked on disk, so it opens here)</label><textarea id="mem-text">${esc(r.text || '')}</textarea><div class="row"><button type="button" data-memsave>Save</button><span class="muted mem-out" aria-live="polite"></span></div>`; } catch (err) { flash(b, err.message); }
        return;
      }
      if ('memsave' in b.dataset) { const box = b.closest('.mem-edit'); try { await api('/api/memory/text', { text: box.querySelector('textarea').value }); box.querySelector('.mem-out').textContent = 'Saved.'; } catch (err) { flash(b, err.message); } return; }
      if ('memsources' in b.dataset) { const box = b.closest('.memory-sources')?.querySelector('.mem-src'); if (box) await showMemorySources(box); return; }
      if (b.dataset.memchat) { window.dispatchEvent(new CustomEvent('bob-open-chat', { detail: { id: b.dataset.memchat } })); flash(b, 'Opened in the chat window.'); return; }
      if (b.dataset.memforget) { try { await api('/api/memory/forget', { key: b.dataset.memforget }); b.closest('li')?.remove(); } catch (err) { flash(b, err.message); } return; }
      if (b.dataset.notesadd) {
        const r = await api('/api/pick-folder', {});
        const out = dlg.querySelector('.notes-out');
        if (r.error) { if (out) out.textContent = r.error; return; }
        if (!r.folder) return;
        const list = [...(settings.notesFolders || []).map(({ kind, path }) => ({ kind, path })), { kind: b.dataset.notesadd, path: r.folder }];
        const s2 = await api('/api/settings', { notesFolders: list }); settings.notesFolders = s2.notesFolders || []; draw(); return;
      }
      if (b.dataset.notesdrop != null) {
        const list = (settings.notesFolders || []).map(({ kind, path }) => ({ kind, path })).filter((_, i) => String(i) !== b.dataset.notesdrop);
        const s2 = await api('/api/settings', { notesFolders: list }); settings.notesFolders = s2.notesFolders || []; draw(); return;
      }
      if ('digestnow' in b.dataset) { const out = b.parentElement.querySelector('.digest-out'); try { const r = await api('/api/digest/now', {}); if (out) out.textContent = `Done: ${r.counts.chats} chats, ${r.counts.reminders} reminders, ${r.counts.noticed} things noticed. It's in the chat and in the digests folder.`; } catch (err) { if (out) out.textContent = err.message; } return; }
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
      // 1.5.79 How-tos: edit, cancel. 1.5.144 🧰 Tools and how-tos: Show code, Delete (asks on the row), Undo,
      // Put back, Delete for good (asks on the row). Each answer redraws from what the PC sent back.
      if (b.dataset.howtoedit) { howtoEditing = b.dataset.howtoedit; ownAsk = ownPurgeAsk = null; draw(); return; }
      if ('howtocancel' in b.dataset) { howtoEditing = null; draw(); return; }
      if ('owncancel' in b.dataset) { ownAsk = ownPurgeAsk = null; draw(); return; }
      const ownPick = (v) => { const i = v.indexOf(':'); return { kind: v.slice(0, i), id: v.slice(i + 1) }; };
      if (b.dataset.ownask) { ownAsk = ownPick(b.dataset.ownask); ownPurgeAsk = null; howtoEditing = null; ownLast = null; ownError = ''; draw(); dlg.querySelector('[data-owndel]')?.focus(); return; }
      if (b.dataset.ownpurgeask) { ownPurgeAsk = ownPick(b.dataset.ownpurgeask); ownAsk = null; ownLast = null; ownError = ''; draw(); dlg.querySelector('[data-ownpurge]')?.focus(); return; }
      if (b.dataset.owndel || b.dataset.ownundo || b.dataset.ownput || b.dataset.ownpurge) {
        const act = b.dataset.owndel ? 'delete' : b.dataset.ownpurge ? 'purge' : 'restore';
        const pick = ownPick(b.dataset.owndel || b.dataset.ownundo || b.dataset.ownput || b.dataset.ownpurge);
        ownAsk = ownPurgeAsk = null; ownError = '';
        try {
          const r = await api(`/api/own-kit/${act}`, pick);
          ownKit = r.view; ownLast = act === 'delete' ? { kind: r.kind, id: r.id, name: r.name } : act === 'restore' ? { kind: r.kind, id: r.id, name: r.name, put: true } : null;
          if (settings) settings.ownKit = { tools: r.view.tools.length, howtos: r.view.howtos.length, deleted: r.view.deleted.length };
        } catch (err) { ownError = err.message; ownKit = null; }
        draw();
        if (act === 'delete') dlg.querySelector('[data-ownundo]')?.focus(); else dlg.querySelector('#sub-ev-howtos .ownkit-note')?.focus?.();
        return;
      }
      if (b.dataset.owncode) { const pre = b.closest('li').querySelector('.ownkit-code'); if (!pre.hidden) { pre.hidden = true; b.textContent = 'Show code'; return; } try { const r = await api('/api/hands/mytools', { name: b.dataset.owncode, code: true }); pre.textContent = r.code; pre.hidden = false; b.textContent = 'Hide code'; } catch (err) { pre.textContent = err.message; pre.hidden = false; } return; }
      if (b.dataset.howtosave) {
        const row = b.closest('.howto-row');
        try {
          await api('/api/howtos/edit', { id: b.dataset.howtosave, name: row.querySelector('[data-rname]').value, when: row.querySelector('[data-rwhen]').value, steps: row.querySelector('[data-rsteps]').value.split('\n') });
          howtoEditing = null; ownKit = null; draw();
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
      if ('hkfolderadd' in b.dataset || b.dataset.hkfolderrm) {
        const box = dlg.querySelector('[data-hkfoldernew]');
        const r = await api('/api/settings', { housekeeping: b.dataset.hkfolderrm ? { removeFolder: b.dataset.hkfolderrm } : { addFolder: box?.value || '' } });
        if (r.housekeeping) settings.housekeeping = r.housekeeping;
        if (r.hkFolderError) { const out = b.parentElement.querySelector('.hk-folder-out'); if (out) out.textContent = r.hkFolderError; return; }
        draw(); return;
      }
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
      // 1.5.205 Calibrate one brain or all of them: always a question first, with how long it takes.
      if (b.dataset.calibrate) { if (!placeData) await placeLoad(); const all = canCalibrate({ ...eqCtx(), place: placeData }).map((x) => x.value); calAsk = { models: b.dataset.calibrate === '*' ? all : [b.dataset.calibrate] }; draw(); dlg.querySelector('.setup-ask')?.scrollIntoView({ block: 'nearest' }); return; }
      if ('calcancel' in b.dataset) { calAsk = null; draw(); return; }
      if ('calgo' in b.dataset) { b.disabled = true; await calStart(b.dataset.unload === '1'); draw(); return; }
      if ('calstop' in b.dataset) { await api('/api/brain-place/stop', {}).catch(() => {}); await placeLoad(); draw(); return; }
      if (b.dataset.caluse) { await api('/api/brain-place/use', { model: b.dataset.caluse }).catch(() => {}); await placeLoad(); draw(); return; }
      // 1.5.205 one brain's Set up page: open, back, and Auto or By hand.
      if ('brainsetup' in b.dataset) { setUpBrain = b.dataset.brainsetup; if (setUpBrain) await placeLoad(); draw(); if (setUpBrain) dlg.scrollTop = 0; else dlg.querySelector('#brain-' + CSS.escape(b.dataset.brainsetup || ''))?.scrollIntoView({ block: 'nearest' }); return; }
      if (b.dataset.placemode) { await placeSave(b.dataset.model, { mode: b.dataset.placemode }); draw(); return; }
      if (b.dataset.memtype) { await api('/api/settings', { brainMemType: { [b.dataset.model]: b.dataset.memtype } }); await placeLoad(); draw(); return; } // 100
      // 1.5.205 setups on the Brains page: show the list of changes first; Apply saves them one job at a time.
      if ('setup' in b.dataset) { setupAsk = b.dataset.setup; draw(); dlg.querySelector('.setup-ask')?.scrollIntoView({ block: 'nearest' }); return; }
      if ('setupbobnet' in b.dataset) { setupAsk = ''; sampler.stop(); setTab('settings'); jumpTo = 'adv-bobnet'; draw(); return; }
      if ('onebrainoff' in b.dataset) { b.disabled = true; settings.oneBrain = (await api('/api/settings', { oneBrain: false })).oneBrain; draw(); return; }
      if (b.dataset.setupapply) {
        const id = b.dataset.setupapply;
        b.disabled = true;
        // Nov 13: One brain is the switch (Settings, One brain): every job goes to the main brain and the
        // Quick brain is off, with the other picks kept. Any other setup turns it off first.
        if (id === 'one' || settings.oneBrain) settings.oneBrain = (await api('/api/settings', { oneBrain: id === 'one' })).oneBrain;
        const plan = id === 'one' ? [] : setupPlan(id, { ...eqCtx(), bobNet: data?.bobNet || [] });
        for (const c of plan) await equipSlot(c.slot, c.value);
        setupAsk = ''; await eqReload(); draw(); return;
      }
      if (b.dataset.slotpick) { eqSelected = b.dataset.slotpick; draw(); dlg.querySelector('.kit-panel')?.scrollIntoView({ block: 'nearest' }); return; }
      // 1.5.127 rented brains
      if ('rentuse' in b.dataset) { rent = await api('/api/rent/settings', { current: b.dataset.rentuse }); window.dispatchEvent(new CustomEvent('bob-rent-slot', { detail: { rental: (rent.rentals || []).find((x) => x.id === rent.current)?.name || '' } })); draw(); return; }
      if ('rentsettings' in b.dataset) { rentPickOpen = Boolean(b.closest('.too-big-note')); sampler.stop(); setTab('settings'); jumpTo = 'adv-online'; draw(); return; }
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
      if ('rentfind' in b.dataset) { // 1.5.137: look the picked brain up on the pay-per-answer service's own list
        const box = b.closest('.rent-add'); const val = (k) => box.querySelector(`[data-rentadd="${k}"]`)?.value?.trim() || '';
        const p = rentPicks(visibleModels(data?.models || [], naughtyOn()), data?.bigBrains || [], eqCtx(), data?.bobNet || [], settings.platform).find((x) => x.key === val('pick'));
        const note = box.querySelector('.rent-pick-note'); if (!p) return;
        b.disabled = true;
        try {
          const r = await api('/api/rent/find', { service: val('service'), hf: p.hf, name: p.name, address: val('address'), keyEnv: val('keyEnv') });
          const model = box.querySelector('[data-rentadd="model"]');
          if (r.model) { model.value = r.model; model.dataset.auto = '1'; note.textContent = `Found it: ${r.model}.`; } else note.textContent = r.why || 'Not on that service\'s list.';
        } catch (e) { note.textContent = e.message; note.classList.add('error'); } finally { b.disabled = false; }
        return;
      }
      if ('selfcopy' in b.dataset) { b.disabled = true; const out = dlg.querySelector('.self-copy-out'); if (out) out.textContent = 'Making the code copy with Git. This takes a minute or so (longer if Bob first has to get Git).'; try { const r = await api('/api/self-work/copy', { repo: b.dataset.selfcopy }); if (r.selfWork) settings.selfWork = r.selfWork; if (r.ok) draw(); else if (out) out.textContent = r.why || r.error || 'That didn\'t work.'; } catch (e) { alertIn(b, e.message); } finally { b.disabled = false; } return; }
      if ('selfrm' in b.dataset) { const keepRepos = (settings.selfWork?.repos || []).filter((r) => !r.own && r.id !== b.dataset.selfrm).map(({ name, source }) => ({ name, source })); const r = await api('/api/settings', { selfWork: { repos: keepRepos } }); settings.selfWork = r.selfWork; draw(); const out = dlg.querySelector('.self-copy-out'); if (out) out.textContent = 'Removed from the list. Its code copy stays in Bob\'s inn folder (own-code) until you delete it.'; return; }
      if ('selfadd' in b.dataset) {
        const box = b.closest('.self-add'); const name = box.querySelector('[data-selfnew="name"]').value.trim(); const source = box.querySelector('[data-selfnew="source"]').value.trim();
        const before = (settings.selfWork?.repos || []).length;
        const list = [...(settings.selfWork?.repos || []).filter((r) => !r.own).map(({ name: n, source: s2 }) => ({ name: n, source: s2 })), { name, source }];
        const r = await api('/api/settings', { selfWork: { repos: list } }); settings.selfWork = r.selfWork;
        if ((r.selfWork?.repos || []).length > before) draw(); else alertIn(b, 'That needs an https link (not ssh) or the full path of a folder, and a name that isn\'t already on the list.');
        return;
      }
      if ('listcheck' in b.dataset) { b.disabled = true; try { const r = await api('/api/catalog/latest', {}); flash(b, r.result?.why || 'Checked.'); await load().catch(() => {}); } catch (e) { alertIn(b, e.message); } finally { b.disabled = false; } return; } // 1.5.137
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
      if (b.dataset.eqview) { eqView = b.dataset.eqview; try { localStorage.setItem('bob-brains-view', eqView); } catch {} draw(); return; }
      if ('alsono' in b.dataset) { b.closest('.also').remove(); return; }
      if ('alsogo' in b.dataset) {
        const picks = [...b.closest('.also').querySelectorAll('input[data-also]:checked')];
        for (const c of picks) await equipSlot(allSlots().find((s) => s.id === c.dataset.also), c.dataset.alsovalue);
        await eqReload(); draw();
        return;
      }
      if (b.dataset.sview) { view = b.dataset.sview === 'advanced' ? 'advanced' : 'simple'; try { localStorage.setItem(VIEW_KEY, view); } catch {} if (view === 'advanced' && curCard) { const c = SET_CARDS.find((x) => x.id === curCard); if (c && !c.topics.includes(curTopic)) curTopic = c.topics[0]; } curCard = ''; draw(); dlg.querySelector(`[data-sview="${view}"]`)?.focus(); return; }
      if (b.dataset.topic) { showTopic(b.dataset.topic); dlg.scrollTop = 0; return; }
      if ('card' in b.dataset) { curCard = b.dataset.card; applyView(); dlg.scrollTop = 0; (curCard ? dlg.querySelector('.set-back h3') : dlg.querySelector('.set-card'))?.focus(); return; }
      if (b.dataset.jump) { const t = dlg.querySelector('#sub-' + CSS.escape(ADV_MOVED[b.dataset.jump] || b.dataset.jump)); const top = t?.closest(TOP_PANELS); if (top) showTopic(top.dataset.panel); if (t?.tagName === 'DETAILS' && !t.open) { t.open = true; openPanels.add(t.dataset.panel); saveOpen(); } t?.scrollIntoView({ block: 'start', behavior: 'smooth' }); return; }
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
          : b.dataset.engine === 'brainengine'
          ? `<p>Download Brain Engine from Bob's own GitHub, on top of the tested llama.cpp build (about 700 MB in all with NVIDIA runtime files), checked against GitHub's checksums. It has its own folder, so llama.cpp stays as it is.</p>`
          : b.dataset.engine === 'model3d'
          ? `<p>Download the 3D workshop: its own Python, PyTorch for NVIDIA cards, the add-ons built for Bob (checked against their pinned checksums) and TRELLIS.2 with its models. About 28 GB in all, into Bob's own folder; it takes a while.</p>`
          : `<p>Download ${esc(({ llamacpp: 'llama.cpp', sdcpp: 'stable-diffusion.cpp', whispercpp: 'whisper.cpp', piper: 'Piper' })[b.dataset.engine] || b.dataset.engine)} from GitHub (usually 20 to 600 MB, more with NVIDIA runtime files).</p>`;
        if (eng?.installed && eng.canSwap) box.innerHTML += `<p class="muted">The new build goes in beside the one you have and takes its place when it's ready. The one you have now is kept, so Go back puts it straight back.${['llamacpp', 'brainengine'].includes(b.dataset.engine) ? ' A brain that is loaded is let go first.' : ''}</p>`;
        if (b.dataset.missing) box.innerHTML = `<p>Download only the files the ${esc(eng?.name || b.dataset.engine)} update is missing (${esc(eng?.incomplete?.what || 'the missing files')}), from the same GitHub release, checked against GitHub's checksums. Files already there aren't touched. Once it's whole, it takes the old one's place, and Go back still puts the old one back.</p>`;
        box.innerHTML += `<div class="row"><button class="get" data-yes="engine:${esc(b.dataset.engine)}${b.dataset.missing ? '@missing' : b.dataset.newest ? '@newest' : ''}">Yes, download</button><button data-no>Cancel</button></div>`;
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
        b.textContent = 'Checking…';
        const r = await api(`/api/engines/latest?id=${encodeURIComponent(b.dataset.checkengine)}`);
        // 1.5.17x: a rebuilt release keeps its name (Brain Engine), so it's fetched as the same release, not "the newest".
        b.outerHTML = r.newer ? (r.rebuilt ? `<button class="get" data-engine="${esc(r.id)}">Update: a rebuilt ${esc(r.latest)}</button>` : `<button class="get" data-engine="${esc(r.id)}"${r.tested ? ' data-newest="1"' : ''}>Update to ${esc(r.latest)}${r.installed ? ` (you have ${esc(r.installed)}${r.tested && r.installed === r.tested ? ', the tested one' : ''})` : ''}</button>${r.tested ? `<span class="muted">Newer builds haven't been through Bob's speed tests yet. If one gives trouble, <strong>Go back</strong> puts the one you have now back.</span>` : ''}`) : `<span class="muted">Up to date (${esc(r.latest)}).</span>`;
      }
      else if ('checkall' in b.dataset) { // 1.5.17x Check all for updates: one engine after another, so GitHub isn't asked all at once
        b.disabled = true; b.textContent = 'Checking…';
        for (const g of dlg.querySelectorAll('.engine-group')) { g.open = true; openGroups.add(g.dataset.egroup); }
        for (const c of [...dlg.querySelectorAll('[data-checkengine]')]) { try { c.click(); await new Promise((ok) => { const t = setInterval(() => { if (!c.isConnected) { clearInterval(t); ok(); } }, 150); setTimeout(() => { clearInterval(t); ok(); }, 20000); }); } catch {} }
        b.textContent = 'Checked'; }
      else if (b.dataset.engineback) {
        b.disabled = true;
        try { const r = await api('/api/engines/back', { id: b.dataset.engineback }); await load(); flashNote(r.restart ? `Back to ${r.version || 'the build before'}. Bob uses it the next time a brain loads.` : `Back to ${r.version || 'the build before'}.`); }
        catch (err) { b.disabled = false; b.insertAdjacentHTML('afterend', `<span class="error">${esc(err.message)}</span>`); } }
      else if (b.dataset.engineremove) {
        const box = b.closest('.model').querySelector('.confirm'), eng = engineById(b.dataset.engineremove);
        box.hidden = false;
        box.innerHTML = `<p>Remove Bob's copy of ${esc(eng?.name || b.dataset.engineremove)} (and the build kept for Go back)? Whatever needs it stops working until you Get it again.${b.dataset.engineremove === (data.engineChoices?.brainsNow) ? ' Bob\'s brains run on it right now, so he lets go of the loaded brain first and uses the other engine from his next start.' : ''}</p><div class="row"><button class="get" data-engineremoveyes="${esc(b.dataset.engineremove)}">Remove it</button><button data-no>Keep it</button></div>`; }
      else if (b.dataset.engineremoveyes) {
        b.disabled = true;
        try { await api('/api/engines/remove', { id: b.dataset.engineremoveyes }); await load(); }
        catch (err) { b.disabled = false; b.insertAdjacentHTML('afterend', `<span class="error">${esc(err.message)}</span>`); } }
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
      else if ('skip' in b.dataset) { await api('/api/settings', { setupDone: true, wantsAsked: true }); settings.wantsAsked = true; mode = 'shop'; dlg.close(); }
      else if (b.dataset.wantjump) { if (popOut && popOut(b.dataset.wantjump)) return; mode = 'shop'; setTab('settings'); jumpTo = b.dataset.wantjump; draw(); } // wants.js: the bigger switches (in the Settings window when there is one, so the Welcome stays put)
    } catch (err) { alertIn(b, err.message); }
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
  dlg.addEventListener('input', (e) => { const d = e.target.dataset || {}; if (d.placemoe) { const n = dlg.querySelector('[data-placemoenum]'); if (n) n.value = e.target.value; } else if (d.placemoenum) { const r = dlg.querySelector('[data-placemoe]'); if (r) r.value = e.target.value; } }); // 1.5.205 slider and number box stay in step
  dlg.addEventListener('input', (e) => { backup.onInput(e.target); if (e.target.id === 'proj-path') projAddState(); if (e.target.id === 'save-path') saveDirState(); });
  dlg.addEventListener('input', (e) => { const k = e.target.dataset?.rentadd; if (k === 'model' || k === 'name') delete e.target.dataset.auto; }); // 1.5.137: what you type yourself stays
  dlg.addEventListener('input', (e) => { if (tab === 'style') stylePage.onInput(e.target); if (e.target.dataset?.ssearch !== undefined) { settingsQuery = e.target.value; if (settingsQuery.trim()) applyView(); else { draw(); const box = dlg.querySelector('[data-ssearch]'); box?.focus(); } } if (e.target.dataset?.dial) showDials(dialValues()); if (e.target.dataset?.holdback !== undefined) { const lab = dlg.querySelector('[data-holdbacklabel]'); if (lab) lab.textContent = `${e.target.value} GB`; } if (e.target.dataset?.textsize !== undefined) { const lab = dlg.querySelector('[data-textsizelabel]'); if (lab) lab.textContent = `${e.target.value}%`; } });

  // 1.5.135: ➕ Your own brains, the Add form.
  dlg.addEventListener('submit', async (e) => {
    const findForm = e.target.closest?.('[data-findform]');
    if (findForm) { e.preventDefault(); find = { ...find, q: findForm.querySelector('[data-findq]')?.value.trim() || '' }; findKeep(); await findRun(); dlg.querySelector('#catjob-find [role="status"], #catjob-find [role="alert"]')?.scrollIntoView({ block: 'nearest' }); return; }
    const pageForm = e.target.closest?.('[data-addpageform]');
    if (pageForm) {
      e.preventDefault();
      const link = pageForm.querySelector('[data-addpageurl]')?.value.trim() || '';
      addPage = { url: link, busy: true }; draw();
      const r = await api('/api/catalog-added/look', { page: link }).catch((x) => ({ error: x.message }));
      addPage = r.error ? { url: link, error: r.error } : { url: link }; draw();
      if (r.error) dlg.querySelector('[data-addpageurl]')?.focus(); else pagePick(r, link);
      return;
    }
    const form = e.target.closest?.('[data-ownform]');
    if (!form || !ownForm) return;
    e.preventDefault();
    // 1.5.135 (review): the typed path is read like a picked file, then the usual form follows.
    if ('ownpathform' in form.dataset) {
      const typed = form.querySelector('[data-ownpath]')?.value.trim() || '';
      ownForm = { file: '', name: '', typed, busy: true }; draw();
      const r = await api('/api/own-models/inspect', { file: typed }).catch((err) => ({ error: err.message }));
      ownForm = r.error ? { file: '', name: '', typed, error: r.error } : { file: r.file, name: r.name, params: r.params, sizeGB: r.sizeGB, mmproj: r.mmproj || '', card: r.card || null }; // 1.5.145: a typed path brings its brain card too
      draw(); dlg.querySelector(r.error ? '[data-ownpath]' : '[data-ownname]')?.focus(); return;
    }
    ownForm.name = form.querySelector('[data-ownname]')?.value.trim() || ownForm.name;
    ownForm.busy = true; ownForm.error = ''; draw();
    const r = await api('/api/own-models', { name: ownForm.name, gguf: ownForm.file, mmproj: ownForm.mmproj || '' }).catch((err) => ({ error: err.message }));
    if (r.error) { ownForm.busy = false; ownForm.error = r.error; draw(); return; }
    ownForm = null;
    await ownRefresh();
    const row = dlg.querySelector('#own-' + CSS.escape(r.added?.id || ''));
    if (row) { row.scrollIntoView({ block: 'center' }); flash(row, `Added. ${esc(r.added.name)} is on your list now: switch it Active and equip it like any other brain.`); }
  });
  const onChange = async (e) => {
    if (await backup.onChange(e.target)) return; // Back up and move
    const el = e.target;
    try {
      if (el.dataset.wsplit) { wSplit = el.dataset.wsplit; wPicks = null; draw(); dlg.querySelector(`[data-wsplit="${wSplit}"]`)?.focus(); return; } // 1.5.205 first-time: fewer or more brains ticked
      // 1.5.205 Set up: the slider and the number box save the same value.
      if (el.dataset.placemoe || el.dataset.placemoenum) { const max = Number(el.max) || 0; const n = Math.max(0, Math.min(max, Math.round(Number(el.value) || 0))); await placeSave(el.dataset.placemoe || el.dataset.placemoenum, { cpuMoe: n }); draw(); return; }
      // 1.5.205 the Brains page: give a brain another job, or pick a brain for an empty job.
      if (el.dataset.find) { const y = dlg.scrollTop; find = { ...find, q: dlg.querySelector('[data-findq]')?.value ?? find.q, [el.dataset.find]: el.value }; findKeep(); draw(); dlg.scrollTop = y; dlg.querySelector(`[data-find="${el.dataset.find}"]`)?.focus(); return; } // 1.5.209 Search is what asks the site; changing a menu alone does not
      if (el.dataset.catfilter) { const y = dlg.scrollTop; setCatFilters({ ...catFilters, [el.dataset.catfilter]: el.value }); draw(); dlg.scrollTop = y; dlg.querySelector(`[data-catfilter="${el.dataset.catfilter}"]`)?.focus(); return; } // 1.5.208
      if (el.dataset.brainjob && el.value) { const y = dlg.scrollTop; await equip(el.value, el.dataset.brainjob, { offer: false }); dlg.scrollTop = y; return; }
      if (el.dataset.jobbrain && el.value) { const y = dlg.scrollTop; await equip(el.dataset.jobbrain, el.value, { offer: false }); dlg.scrollTop = y; return; }
      if (el.dataset.proxy) { const side = $(el.dataset.proxy); if (side && (side.getAttribute('aria-pressed') === 'true') !== el.checked) side.click(); setTimeout(() => { el.checked = side?.getAttribute('aria-pressed') === 'true'; }, 300); return; }
      if (el.dataset.mainproject !== undefined) { await saveProjects(settings.projectList || [], el.dataset.mainproject); return; }
      if (el.dataset.hs) { // 1.5.34 House style boxes (Settings, House style): the whole group is saved, so an emptied box clears
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
      if (el.dataset.turbo) { // 1.5.16x Turbo per brain
        const id = el.dataset.turbo, t = { ...(settings.speed?.turbo?.[id] || {}) };
        if (el.dataset.turbok === 'on') t.on = el.checked; else { const n = Math.round(Number(el.value)); if (!(n >= 1 && n <= 32)) { alertIn(el, 'Pick 1 to 32 words ahead.'); return; } t.max = n; }
        const r = await api('/api/settings', { speed: { turbo: { [id]: t } } }); settings.speed = r.speed; flash(el, 'Saved. Applies the next time this brain loads.'); return;
      }
      if (el.dataset.draft) {
        const d = { ...(settings.speed?.draft || {}) };
        d[el.dataset.draft] = el.type === 'checkbox' ? el.checked : el.dataset.draft === 'model' ? el.value : Number(el.value);
        if (d.enabled && !d.model) { alertIn(el, 'Pick a draft brain first.'); el.checked = false; return; }
        const r = await api('/api/settings', { speed: { draft: d } }); settings.speed = r.speed; flash(el, 'Saved.'); return;
      }
      if ('margsmodel' in el.dataset) { speedModel = el.value; draw(); return; }
      if ('perword' in el.dataset) { // Brain Engine 0013: experts per word, per brain; empty = the brain's own
        const model = speedModel || dlg.querySelector('[data-margsmodel]')?.value;
        if (!model) return;
        const typed = el.value.trim();
        if (typed && !/^\d+(\s*,\s*\d+)*$/.test(typed)) { alertIn(el, 'A whole number, or one per layer with commas (for example 6,6,4,4).'); return; }
        const want = !typed ? null : typed.includes(',') ? typed.split(/\s*,\s*/).map(Number) : Number(typed);
        const r = await api('/api/settings', { speed: { expertsPerWord: { [model]: want } } }); settings.speed = r.speed;
        const kept = r.speed.expertsPerWord?.[model];
        if (want !== null && (kept === null || kept === undefined)) { alertIn(el, 'That count was left out: it goes from 1 up to the experts the brain has.'); el.value = ''; return; }
        el.value = kept == null ? '' : Array.isArray(kept) ? kept.join(',') : String(kept);
        flash(el, kept == null ? 'Saved. The brain\'s own count from its next answer.' : 'Saved. Used from this brain\'s next answer, no reload.'); return;
      }
      if ('margs' in el.dataset) {
        const model = speedModel || dlg.querySelector('[data-margsmodel]')?.value;
        if (!model) return;
        const args = el.value.trim() ? el.value.trim().split(/\s+/) : null;
        const r = await api('/api/settings', { speed: { modelArgs: { [model]: args } } }); settings.speed = r.speed;
        const kept = r.speed.modelArgs?.[model] || [];
        if (args && kept.length !== args.length) alertIn(el, 'Some of that was left out: only flags and plain values are allowed, no file paths.');
        el.value = kept.join(' '); flash(el, 'Saved.'); return;
      }
      if (el.dataset.set === 'qwenPresetsOn' || el.dataset.qfield) { await saveQwen(el); return; } // 1.5.148
      if (el.dataset.set === 'brainCtxOn') { const r = await api('/api/settings', { brainCtxOn: el.checked }); settings.brainCtxOn = r.brainCtxOn; bctx = await api('/api/brain-ctx').catch(() => ({ ...bctx, on: r.brainCtxOn })); const box = el.closest('[data-bctxbox]'); if (box) box.innerHTML = brainCtxHtml(); flash(box || el, r.brainCtxOn ? 'On. Applies when each brain next loads.' : 'Off. Bob picks again.'); return; }
      if (el.dataset.set === 'brainCtxStretch') { const r = await api('/api/settings', { brainCtxStretch: el.checked }); settings.brainCtxStretch = r.brainCtxStretch; bctx = await api('/api/brain-ctx').catch(() => ({ ...bctx, stretch: r.brainCtxStretch })); const box = el.closest('[data-bctxbox]'); if (box) box.innerHTML = brainCtxHtml(); flash(box || el, r.brainCtxStretch ? 'On. The stretched sizes are in the Qwen menus now.' : 'Off. A stretched pick goes back to Bob\'s pick.'); return; }
      if (el.dataset.bctx) { const v = el.value ? Number(el.value) : null; const r = await api('/api/settings', { brainCtx: { [el.dataset.bctx]: v } }); settings.brainCtx = r.brainCtx; const b = (bctx.brains || []).find((x) => x.model === el.dataset.bctx); if (b) b.picked = v; flash(el, 'Saved. Applies when the brain next loads.'); return; }
      if (el.dataset.sctx) { const v = el.value ? Number(el.value) : null; const r = await api('/api/settings', { sessionCtx: { [el.dataset.sctx]: v } }); settings.sessionCtx = r.sessionCtx; flash(el, 'Saved. Applies when the brain next loads.'); return; }
      if (el.dataset.sbrain) { const r = await api('/api/settings', { sessionBrains: { [el.dataset.sbrain]: el.value } }); settings.sessionBrains = r.sessionBrains; flash(el, 'Saved.'); return; }
      if (el.dataset.set === 'pictureNoWait') { const r = await api('/api/settings', { pictureNoWait: el.checked }); settings.pictureNoWait = r.pictureNoWait; el.checked = r.pictureNoWait; return; }
      // List items 94-99: engine and speed extras, each saved on its own.
      if (['copyGuess', 'preloadNext', 'laptopMode', 'newCardTest', 'speedLog', 'engineNotes'].includes(el.dataset.set)) {
        const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k];
        if ('onBattery' in r) settings.onBattery = r.onBattery; if ('engineNote' in r) settings.engineNote = r.engineNote; if (k === 'engineNotes') { const y = dlg.scrollTop; draw(); dlg.scrollTop = y; }
        if (k === 'speedLog') { speedLogData = await api('/api/speed-log').catch(() => speedLogData); const y = dlg.scrollTop; draw(); dlg.scrollTop = y; }
        flash(el, !r[k] ? 'Off.' : k === 'copyGuess' ? 'On. Applies the next time a brain loads.' : k === 'laptopMode' ? (r.onBattery === true ? 'On. On battery now: applies the next time a brain loads.' : r.onBattery === false ? 'On. Plugged in now, so nothing changes yet.' : 'On. No battery found here, so nothing changes.') : k === 'newCardTest' ? 'On. Bob looks for a new card each time he starts.' : 'On.');
        return;
      }
      if (['readyWhileTyping', 'gamesFirst', 'pictureFit'].includes(el.dataset.set)) { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k]; flash(el, 'Saved. Applies when the brain or picture model next loads.'); return; }
      if (el.dataset.set === 'autoSession') { const r = await api('/api/settings', { autoSession: el.checked }); settings.autoSession = r.autoSession; el.checked = r.autoSession; window.dispatchEvent(new CustomEvent('bob-auto-session', { detail: { autoSession: r.autoSession } })); flash(el, r.autoSession ? 'On. Bob picks the session himself.' : 'Off. The session only changes when you pick one.'); return; }
      if (/^jh[A-Z]/.test(el.dataset.set || '') || el.dataset.jhminutes !== undefined || el.dataset.jheditor !== undefined) { // Settings, Jobs
        const k = el.dataset.set ? el.dataset.set[2].toLowerCase() + el.dataset.set.slice(3) : '';
        const r = await api('/api/settings', { jobHelps: k ? { [k]: el.checked } : el.dataset.jhminutes !== undefined ? { minutes: Number(el.value) } : { editor: el.value } });
        settings.jobHelps = r.jobHelps; if (k) el.checked = r.jobHelps?.[k] === true;
        window.dispatchEvent(new CustomEvent('bob-jobhelps', { detail: r.jobHelps }));
        flash(el, 'Saved.'); return;
      }
      if (el.dataset.set === 'language') { const r = await api('/api/settings', { language: el.value }); settings.language = pickLang(r.language); try { localStorage.setItem(LANG_KEY, settings.language); } catch {} location.reload(); return; }
      if (el.dataset.set === 'tray' || el.dataset.set === 'lookIcon') { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k]; return; }
      if (el.dataset.set === 'selfWork') { const r = await api('/api/settings', { selfWork: { enabled: el.checked } }); settings.selfWork = r.selfWork; draw(); return; }
      if (el.dataset.selfwork) { const k = el.dataset.selfwork; const r = await api('/api/settings', { selfWork: { [k]: k === 'helpers' ? el.checked : k === 'ctx' ? Number(el.value) : el.value } }); settings.selfWork = r.selfWork; flash(el, 'Saved. Used on his next repository job.'); return; }
      if (el.dataset.set === 'howtos') { const r = await api('/api/settings', { howtos: el.checked }); settings.howtos = r.howtos; el.checked = r.howtos; flash(el, r.howtos ? 'On. After a job with a few steps goes well, Bob offers to keep them as a how-to.' : 'Off. Bob won\'t offer or use how-tos. Saved ones stay in 🧰 Tools and how-tos.'); return; }
      if (el.dataset.set === 'computerLab') { const r = await api('/api/settings', { computerLab: el.checked }); settings.computerLab = r.computerLab === true; el.checked = settings.computerLab; window.dispatchEvent(new CustomEvent('bob-lab-switch', { detail: { on: settings.computerLab } })); flash(el, r.computerLabWhy || (settings.computerLab ? 'On. 🧪 Lab is in the left pane.' : 'Off. The Lab button is hidden; brains you made stay in Bob.')); return; } // 1.5.141
      if (el.dataset.set === 'naughtyList') { const r = await api('/api/settings', { naughtyList: el.checked }); settings.naughtyList = r.naughtyList === true; el.checked = settings.naughtyList; if (!settings.naughtyList && catView === 'naughty') setCatView('well'); flash(el, settings.naughtyList ? 'On. The Naughty list side (the red devil) is at the top of the Brain catalogue.' : 'Off. The naughty list is out of every list again.'); return; }
      if (el.dataset.set === 'catalogUpdates') { const r = await api('/api/settings', { catalogUpdates: el.checked }); settings.catalogUpdates = r.catalogUpdates === true; el.checked = settings.catalogUpdates; flash(el, settings.catalogUpdates ? (r.listCheck?.why ? `On. ${r.listCheck.why}` : 'On. Bob looks for a newer brain list once a day.') : 'Off. Bob uses the brain list that came with this version.'); await load().catch(() => {}); return; } // 1.5.137
      if (el.dataset.set === 'webSearch') { const r = await api('/api/settings', { webSearch: el.checked }); settings.webSearch = r.webSearch; el.checked = r.webSearch; window.dispatchEvent(new CustomEvent('bob-web', { detail: { webSearch: r.webSearch } })); flash(el, r.webSearch ? 'On. Bob can search the web when a question needs it.' : 'Off. Bob won\'t go online to look things up.'); return; }
      if (el.dataset.gcard) {
        const r = await api('/api/settings', { gamingCard: el.dataset.gcard }); settings.gamingCard = r.gamingCard; settings.gamingCardNow = r.gamingCardNow;
        const box = el.closest('.seg3');
        box.outerHTML = gamingCardHtml();
        flash(dlg.querySelector('.seg3'), 'Saved.'); return;
      }
      if (el.dataset.textsize !== undefined) { const r = await api('/api/settings', { textSize: Number(el.value) }); settings.textSize = r.textSize; el.value = r.textSize; applyReading(settings); window.dispatchEvent(new CustomEvent('bob-display', { detail: { textSize: r.textSize } })); flash(el.closest('.srow'), 'Saved.'); return; }
      if (['readableFont', 'todayCard', 'focusTimer', 'receipts', 'updateTour', 'trayDot', 'profilesOn'].includes(el.dataset.set)) { // 🗓 Everyday helpers
        const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k] === true; el.checked = settings[k];
        applyReading(settings); window.dispatchEvent(new CustomEvent('bob-display', { detail: { [k]: settings[k] } }));
        const SAY = { readableFont: ['On. The plainer font is on the chat and Settings.', 'Off. The theme\'s own font is back.'], todayCard: ['On. The card shows the next time Bob\'s window opens (once a day).', 'Off.'], focusTimer: ['On. ⏱ Focus is beside Effort, under the chat.', 'Off.'], receipts: ['On. Attach a receipt photo and say "add this receipt".', 'Off. The sheet is kept, locked.'], updateTour: ['On. After the next update, a few cards show what\'s new.', 'Off.'], trayDot: ['On. A dot shows on the tray icon when something waits for you.', 'Off.'], profilesOn: ['On. Add people below; they pick their name on the lock screen.', 'Off. The lock screen only asks for the owner\'s passcode. People and their chats are kept.'] };
        flash(el, SAY[k][settings[k] ? 0 : 1]); if (k === 'profilesOn') mountEveryday(dlg.querySelector('.everyday-box'), { settings, flash: (x, m) => flash(x, m) }); return;
      }
      if (el.dataset.holdback !== undefined) { const r = await api('/api/settings', { apuHoldbackGB: Number(el.value) }); settings.apuHoldbackGB = r.apuHoldbackGB; el.value = r.apuHoldbackGB; const lab = dlg.querySelector('[data-holdbacklabel]'); if (lab) lab.textContent = `${r.apuHoldbackGB} GB`; flash(el.closest('.srow'), 'Saved.'); return; }
      if (el.dataset.set === 'quickNotes') { const r = await api('/api/settings', { quickNotes: el.checked }); settings.quickNotes = r.quickNotes; el.checked = r.quickNotes; draw(); flash(dlg.querySelector('[data-set="quickNotes"]') || dlg, r.quickNotes ? 'On. Say "note:" and Bob writes it down.' : 'Off. Your notes file stays where it is.'); return; }
      if (el.dataset.set === 'smartNotes') { const r = await api('/api/settings', { smartNotes: el.checked }); settings.smartNotes = r.smartNotes; el.checked = r.smartNotes; flash(el, r.smartNotes ? 'On. Bob notes what\'s worth keeping and says 📝 Noted.' : 'Off. Bob only notes what you ask him to.'); return; }
      if (el.dataset.set === 'toolRecord') { const r = await api('/api/settings', { toolRecord: el.checked }); settings.toolRecord = r.toolRecord; el.checked = r.toolRecord; return; }
      if (el.dataset.set === 'toolSets') { const r = await api('/api/settings', { toolSets: el.checked }); settings.toolSets = r.toolSets; el.checked = r.toolSets; return; }
      if (el.dataset.set === 'toolHelp') { const r = await api('/api/settings', { toolHelp: el.checked }); settings.toolHelp = r.toolHelp; el.checked = r.toolHelp; return; }
      if (el.dataset.set === 'toolLearning') { const r = await api('/api/settings', { toolLearning: el.checked }); settings.toolLearning = r.toolLearning; el.checked = r.toolLearning; draw(); flash(dlg.querySelector('[data-set="toolLearning"]') || dlg, r.toolLearning ? 'On. Bob learns from what works and what fails.' : 'Off. Bob keeps what he learned but stops using it.'); return; }
      if (el.dataset.set === 'docTools') { const r = await api('/api/settings', { docTools: el.checked }); settings.docTools = r.docTools; el.checked = r.docTools; flash(el, r.docTools ? 'On. Bob can read and search your documents.' : 'Off. Bob reads plain text files only.'); return; }
      if (el.dataset.set === 'docMeaning') { const r = await api('/api/settings', { docMeaning: el.checked }); settings.docMeaning = r.docMeaning; el.checked = r.docMeaning; flash(el, r.docMeaning ? (settings.docTools ? 'On. Bob is making the index; searches find more as it grows.' : 'On. It starts once Read and search documents is on too.') : 'Off. The index is deleted; searches match words only.'); return; }
      if (el.dataset.set === 'chatFiles') { const r = await api('/api/settings', { chatFiles: el.checked }); settings.chatFiles = r.chatFiles; el.checked = r.chatFiles; flash(el, r.chatFiles ? 'On. Topics, Past chats can save and bring in chats.' : 'Off.'); return; }
      if (el.dataset.set === 'mathView' || el.dataset.set === 'shortcuts') { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k]; window.dispatchEvent(new CustomEvent('bob-display', { detail: { [k]: r[k] } })); flash(el, k === 'mathView' ? (r[k] ? 'On. Maths shows as formulas.' : 'Off. Maths shows as Bob wrote it.') : (r[k] ? 'On. Ctrl+/ shows the list.' : 'Off. Enter, F1, Ctrl+B and Ctrl+J still work.')); return; }
      if (el.dataset.set === 'promptMenu') { const r = await api('/api/settings', { promptMenu: el.checked }); settings.promptMenu = r.promptMenu; el.checked = r.promptMenu; flash(el, r.promptMenu ? 'On. Type / at the start of the message box.' : 'Off. Your prompts are kept.'); return; }
      if (el.dataset.set === 'docView') { const r = await api('/api/settings', { docView: el.checked }); settings.docView = r.docView; el.checked = r.docView; flash(el, r.docView ? 'On. Documents open in the side panel.' : 'Off. Documents open in their own app.'); return; }
      if (el.dataset.set === 'model3d') { const r = await api('/api/settings', { model3d: el.checked }); settings.model3d = r.model3d; settings.model3dHere = r.model3dHere; el.checked = r.model3d; flash(el, r.model3d ? (r.model3dHere ? 'On. Ask Bob for a 3D model of anything.' : 'On. Bob needs the 3D workshop too: he offers it the first time you ask.') : 'Off. Bob doesn\'t make 3D models from pictures.'); return; }
      if (el.dataset.set === 'parts3d') { const r = await api('/api/settings', { parts3d: el.checked }); settings.parts3d = r.parts3d; settings.openscadHere = r.openscadHere; el.checked = r.parts3d; flash(el, r.parts3d ? (r.openscadHere ? 'On. Ask Bob for a part and he makes it.' : 'On. Bob needs OpenSCAD too: he offers it the first time you ask for a part.') : 'Off. Bob doesn\'t make 3D parts.'); return; }
      if (el.dataset.set === 'sandboxCode') { const r = await api('/api/settings', { sandboxCode: el.checked }); settings.sandboxCode = r.sandboxCode; el.checked = r.sandboxCode; flash(el, r.sandboxWhy || (r.sandboxCode ? (r.sandboxNet ? 'On. Bob works sums out in the sandbox, with the internet switched off.' : 'On. Bob works sums out in the sandbox. This Bob can\'t switch the internet off by itself, so code is checked for it instead.') : 'Off. Bob works sums out in his head.')); return; }
      // 🗣 Talk with Bob (1.5.210): its switch and online extra, saved through /api/talk.
      if (el.dataset.set === 'talkWithBob' || el.dataset.talkset) {
        const k = el.dataset.set || el.dataset.talkset;
        const r = await api('/api/talk', { [k]: k === 'talkWithBob' ? el.checked : el.value });
        Object.assign(settings, r);
        if (k === 'talkWithBob') el.checked = r.talkWithBob === true;
        window.dispatchEvent(new CustomEvent('bob-voice-net', { detail: {} }));
        flash(el, k === 'talkWithBob' ? (r.talkWithBob ? 'On. Press 🗣 next to the 🎙 to talk.' : 'Off.') : k === 'talkCloud' ? (r.talkCloud === 'xai' ? (r.talkKeyFound ? 'xAI hears and speaks in talks now. That sends your voice online.' : 'xAI picked. Paste your key below; until then I use my own.') : 'Off. My own hearing and voice.') : 'Saved.');
        const box = el.closest('.talk-cloud'); if (box && k === 'talkCloud') box.outerHTML = talkCloudHtml();
        return;
      }
      // Voice, phone and Bob-Net (items 133 to 142): plain switches, off unless turned on.
      if (['talkOver', 'readDocs', 'netVoices', 'carryIn', 'phoneGlance', 'netOverlay', 'netFiles'].includes(el.dataset.set)) { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k]; el.checked = r[k] === true; if (k === 'netFiles') window.dispatchEvent(new CustomEvent('bob-net-files-switch')); window.dispatchEvent(new CustomEvent('bob-voice-net', { detail: { [k]: r[k] === true } })); if (k === 'netOverlay') window.dispatchEvent(new CustomEvent('bob-net-overlay', { detail: r[k] === true })); flash(el, r[k] ? 'On.' : 'Off.'); return; }
      if (el.dataset.netvoice) { const r = await api('/api/settings', { netVoiceMap: { [el.dataset.netvoice]: el.value } }); settings.netVoiceMap = r.netVoiceMap || {}; window.dispatchEvent(new CustomEvent('bob-voice-net', { detail: {} })); flash(el, 'Saved.'); return; }
      if (el.dataset.set === 'editOwn') { const r = await api('/api/settings', { editOwn: el.checked }); settings.editOwn = r.editOwn; el.checked = r.editOwn; flash(el, r.editOwn ? 'On. Bob can fix his own earlier messages.' : 'Off. Bob sends a new message for any fix.'); return; }
      if (el.dataset.set === 'statusJokes') { const r = await api('/api/settings', { statusJokes: el.checked }); settings.statusJokes = r.statusJokes; el.checked = r.statusJokes; window.dispatchEvent(new CustomEvent('bob-status-jokes', { detail: r.statusJokes })); return; }
      if (el.dataset.set === 'thinkBubble') { const r = await api('/api/settings', { thinkBubble: el.checked }); settings.thinkBubble = r.thinkBubble; el.checked = r.thinkBubble; window.dispatchEvent(new CustomEvent('bob-think-bubble', { detail: r.thinkBubble })); return; }
      if (el.dataset.set === 'chatRedo') { const r = await api('/api/settings', { chatRedo: el.checked }); settings.chatRedo = r.chatRedo; el.checked = r.chatRedo; window.dispatchEvent(new CustomEvent('bob-chat-redo', { detail: r.chatRedo })); flash(el, r.chatRedo ? 'On. Try again, Edit and Delete are in each message\'s … menu.' : 'Off. The … menu has Copy only.'); return; }
      if (el.dataset.set === 'netReview') { const r = await api('/api/settings', { netReview: el.checked }); settings.netReview = r.netReview; el.checked = r.netReview; return; }
      if (el.dataset.set === 'mootBeside') { const r = await api('/api/settings', { mootBeside: el.checked }); settings.mootBeside = r.mootBeside; el.checked = r.mootBeside; return; }
      if (el.dataset.set === 'chatWhileBusy') { const r = await api('/api/settings', { chatWhileBusy: el.checked }); settings.chatWhileBusy = r.chatWhileBusy; el.checked = r.chatWhileBusy; return; }
      if (el.dataset.set === 'answerMidJob') { const r = await api('/api/settings', { answerMidJob: el.checked }); settings.answerMidJob = r.answerMidJob; el.checked = r.answerMidJob; flash(el, r.answerMidJob ? 'On. Bob answers between steps of a long job.' : 'Off. Messages wait for the job, or go to the small brain beside it.'); return; }
      if (el.dataset.set === 'stopWords') { const r = await api('/api/settings', { stopWords: el.checked }); settings.stopWords = r.stopWords; el.checked = r.stopWords; flash(el, r.stopWords ? 'On. Stop, wait and go on work while Bob is busy.' : 'Off. Only a bare stop counts, after the step he is on.'); return; }
      if (el.dataset.set === 'quickSeesJob') { const r = await api('/api/settings', { quickSeesJob: el.checked }); settings.quickSeesJob = r.quickSeesJob; el.checked = r.quickSeesJob; flash(el, r.quickSeesJob ? 'On. Ask how the job is going while Bob works.' : 'Off. Quick replies don\'t see the job.'); return; }
      if (el.dataset.set === 'quickOnCpu') { const r = await api('/api/settings', { quickOnCpu: el.checked }); settings.quickOnCpu = r.quickOnCpu; el.checked = r.quickOnCpu; return; }
      if (el.dataset.set === 'planFirst') { const r = await api('/api/settings', { planFirst: el.checked }); settings.planFirst = r.planFirst; el.checked = r.planFirst; return; }
      if (el.dataset.set === 'resumeJobs') { const r = await api('/api/settings', { resumeJobs: el.checked }); settings.resumeJobs = r.resumeJobs; el.checked = r.resumeJobs; return; }
      if (['memorySources', 'memoryExpiry', 'memoryWhere', 'docFresh', 'docPlaces', 'weeklyDigest'].includes(el.dataset.set)) { const k = el.dataset.set; const r = await api('/api/settings', { [k]: el.checked }); settings[k] = r[k] === true; el.checked = settings[k]; flash(el, settings[k] ? 'On.' : 'Off.'); return; }
      if (el.dataset.set === 'memoryRecall') { const r = await api('/api/settings', { memoryRecall: el.checked }); settings.memoryRecall = r.memoryRecall; settings.memoryBanks = r.memoryBanks; draw(); return; }
      if (el.dataset.set === 'allTools') { const r = await api('/api/settings', { allTools: el.checked }); settings.allTools = r.allTools; el.checked = r.allTools; return; }
      if (el.dataset.set === 'oneBrain') { const r = await api('/api/settings', { oneBrain: el.checked }); settings.oneBrain = r.oneBrain; el.checked = r.oneBrain; return; }
      if (el.dataset.set === 'catName') { const r = await api('/api/settings', { catName: el.value }); settings.catName = r.catName; el.value = r.catName; return; }
      if (el.dataset.set === 'workshop') { const r = await api('/api/settings', { workshop: { enabled: el.checked } }); settings.workshop = r.workshop; draw(); return; }
      if (el.dataset.set === 'keepAlive') { const r = await api('/api/settings', { ollamaKeepAlive: el.value }); settings.ollamaKeepAlive = r.ollamaKeepAlive; settings.brainMode = r.brainMode; flash(el, 'Saved.'); window.dispatchEvent(new CustomEvent('bob-brain-mode')); return; }
      if (el.dataset.set === 'workshopPort') { const r = await api('/api/settings', { workshop: { port: Number(el.value) } }); settings.workshop = r.workshop; return; }
      if (el.dataset.hk) { const r = await api('/api/settings', { housekeeping: { [el.dataset.hk]: el.checked } }); settings.housekeeping = r.housekeeping; draw(); return; }
      if (el.dataset.hkkind) { const v = el.dataset.hkfield === 'n' ? Number(el.value) : el.value; const r = await api('/api/settings', { housekeeping: { [el.dataset.hkkind]: { [el.dataset.hkfield]: v } } }); settings.housekeeping = r.housekeeping; if (el.dataset.hkfield === 'n') el.value = r.housekeeping[el.dataset.hkkind].n; flash(el, el.dataset.hkfield === 'mode' && v === 'auto' ? 'Saved. Bob tidies these without asking (to the Recycle Bin).' : 'Saved.'); return; }
      if (el.dataset.set === 'engineAuto') { const r = await api('/api/settings', { engineUpdates: { auto: el.checked } }); settings.engineUpdates = r.engineUpdates; el.checked = r.engineUpdates.auto !== false; return; }
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
      else if (el.dataset.rentadd === 'pick') { fillRentPick(el.closest('.rent-add')); return; } // 1.5.137
      else if (el.dataset.rentadd === 'service') { const s = (rent.services || []).find((x) => x.id === el.value); const box = el.closest('.rent-add'); fillRentPick(box); box.querySelector('.rent-card-pick').hidden = !s || s.kind === 'answer'; box.querySelector('.rent-cards-pick').hidden = !s || s.kind !== 'machine'; box.querySelector('.rent-multi-warn').hidden = true; const sel = box.querySelector('[data-rentadd="cards"]'); sel.value = '1'; delete sel.dataset.ok; for (const o of box.querySelectorAll('.rent-other')) o.hidden = el.value !== 'other'; return; }
      // 1.5.127: more than one card on a hired machine: a big warning first (the owner's rule). It snaps back to 1 until "I understand" is pressed.
      else if (el.dataset.rentadd === 'cards') {
        const n = Number(el.value) || 1; const box = el.closest('.rent-add'); const warn = box.querySelector('.rent-multi-warn');
        if (n === 1 || el.dataset.ok === String(n)) { warn.hidden = true; return; }
        const c = (rent.cards || []).find((x) => x.id === box.querySelector('[data-rentadd="card"]')?.value) || (rent.cards || [])[1] || { name: 'card', perHour: 2 };
        const hour = n * c.perHour, day = hour * 24;
        warn.hidden = false;
        warn.innerHTML = `<p class="big"><strong>⚠️ ${n} cards at once costs about ${n} times as much.</strong></p><p><strong>About $${hour.toFixed(2)} an hour, about $${day.toFixed(0)} a day</strong> for ${n} × ${esc(c.name)}, billed whether or not the brain is busy, plus the minutes it takes to start (longer with more cards). Your spending limits still apply to the whole machine, and the timer from Max rental time is the only thing that stops it if this replicant matrix goes off. Only pick this for a model that really doesn't fit one card.</p><div class="row"><button type="button" class="get" data-rentmultiok="${n}">I understand, ${n} cards</button><button type="button" data-rentmultino>Back to 1 card</button></div>`;
        warn.scrollIntoView?.({ block: 'nearest' });
        return;
      }
      else if (el.dataset.cloud) { const r = await api('/api/settings', { cloudHelpers: { [el.dataset.cloud]: { enabled: el.checked } } }); cloud = r.cloud || cloud; flash(el.closest('.cloud'), el.checked ? 'On. Bob still asks every time.' : 'Off.'); }
      else if (el.dataset.cloudmodel) { const r = await api('/api/settings', { cloudHelpers: { [el.dataset.cloudmodel]: { model: el.value.trim() } } }); cloud = r.cloud || cloud; flash(el, 'Saved.'); }
      else if (el.dataset.set === 'engine') { await api('/api/settings', { engine: el.value }); settings.engine = el.value; }
      else if ('brainsengine' in el.dataset) { const r = await api('/api/settings', { brainsEngine: el.value }); data.engineChoices = r.engineChoices || data.engineChoices; settings.engine = el.value === 'ollama' ? 'ollama' : 'llamacpp'; draw(); flashNote('Saved. Takes effect next time Bob starts.'); }
      else if ('labengine' in el.dataset) { const r = await api('/api/settings', { labEngine: el.value }); data.engineChoices = r.engineChoices || data.engineChoices; draw(); flashNote('Saved. The Lab uses it from its next job.'); }
      else if ('pack' in el.dataset) { hw.suggestedPack = el.value; wPicks = null; draw(); }
      else if (el.dataset.want) { // wants.js: "Do you want me to:" on the Welcome, the same switches as in Settings
        const k = el.dataset.want, said = el.closest('label')?.querySelector('.want-said');
        try { const r = wantSaved(settings, k, await api('/api/settings', wantPatch(k, el.checked))); el.checked = r.on; if (said) said.textContent = r.say; if (k === 'smartNotes') { const q = el.closest('.wants')?.querySelector('[data-want="quickNotes"]'); if (q) q.checked = settings.quickNotes === true; } }
        catch (err) { el.checked = false; if (said) said.textContent = err.message; }
      }
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
  };
  dlg.addEventListener('change', async (e) => { try { await onChange(e); } finally { refreshHowSum(); } });
  dlg.addEventListener('toggle', (e) => { const g = e.target; if (g?.classList?.contains('engine-group')) { if (g.open) openGroups.add(g.dataset.egroup); else openGroups.delete(g.dataset.egroup); } }, true);

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
    box.innerHTML = `<p>That model is a loose file Ollama can't run. It needs Bob's own engine, Brain Engine. Switch engines? Everything else keeps working; it takes effect when Bob restarts.</p><div class="row"><button class="get" data-switchengine="llamacpp">Switch to Bob's own engine</button><button data-no>Keep Ollama</button></div>`;
    where.appendChild(box);
  }

  const flashNote = (msg) => { const at = dlg.querySelector('[data-engine-now]'); if (at) flash(at, msg); };
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
    async open(which = 'shop', pickTab, opts = {}) { mode = which; if (opts.house && /^[a-z]+$/.test(opts.house)) { houseFocus = opts.house; mode = 'shop'; setTab('settings'); jumpTo = 'adv-house'; } /* 1.5.210 House style is in Settings */ if (pickTab) setTab(pickTab); else if (which === 'settings') { mode = 'shop'; setTab('settings'); } if (opts.jump && /^(adv|ev)-[\w-]+$/.test(opts.jump)) { mode = 'shop'; setTab('settings'); jumpTo = opts.jump; } /* 1.5.141: open Settings at one advanced section (the Bob-Net heading in Now running) */ if (which === 'welcome' && opts.jump === 'wants') jumpTo = 'wants'; /* the chat's one-time "Do you want me to" offer */ if (divert() && !dlg.open) return; if (!dlg.open) { mid?.classList.add('paged'); mid ? dlg.show() : dlg.showModal(); } dlg.scrollTop = 0; draw(); await load().catch((e) => { $('cellar-body').innerHTML = `<p class="error">${esc(e.message)}</p>`; }); },
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

