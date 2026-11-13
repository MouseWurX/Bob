// Settings: the model shop's cards and lists, and the Brains and Roles pages. Split out of cellar.js.
import { esc, gb } from './util.js';
import { SLOT_NAMES, jobNames, unsuited, canDo } from './fit.js';
import { brainsHtml, listSetUpHtml, listRowHtml, listTopHtml } from './brains.js';
import { entryOf, isActive, tipHtml } from './equip.js';
import { isNaughty, familyOf } from './catalogue.js';
import { noteOrTip } from './tips.js';

// now() hands over createCellar's own values as they are at the moment of each call; fresh() copies them in.
export function createShopParts(now) {
  let SUB_LABEL, bctx, calAsk, caps, data, eqCtx, eqView, fold, hear, honesty, hw, kokoroGrid, labScores, live, naughtyOn, nestedVoiceHtml, picks, placeData, progress, roles, setUpBrain, settings, setupAsk, showUnsuited, shownModels, suit, tab, voiceHtml, voices;
  const fresh = () => { ({ SUB_LABEL, bctx, calAsk, caps, data, eqCtx, eqView, fold, hear, honesty, hw, kokoroGrid, labScores, live, naughtyOn, nestedVoiceHtml, picks, placeData, progress, roles, setUpBrain, settings, setupAsk, showUnsuited, shownModels, suit, tab, voiceHtml, voices } = now()); };
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
  // A category's models: Bob's picks first, then what fits, then the rest. Downloads that don't suit this PC
  // wait behind "Show models that don't suit this PC".
  function modelList(id) {
    const rank = (m) => (picks(m).length ? 0 : suit(m).level === 'ok' ? 1 : 2);
    const all = shownModels().filter((m) => m.category === id).sort((a, b) => rank(a) - rank(b));
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
    const rows = shownModels().map((m) => [m, picks(m)]).filter(([, p]) => p.length);
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
  // 1.5.207 Settings, Brains opens on the Brains page (the owner's ask): each brain, its jobs, Set up and Calibrate.
  // The plain list of menus is one link away.
  const brainsCtx = (more = {}) => ({ ...eqCtx(), bobNet: data?.bobNet || [], setupAsk, setUp: setUpBrain, place: placeData, honesty, calAsk, labScores, ...more });
  function brainsPanelHtml() {
    if (eqView === 'list') return `<p><button type="button" class="link" data-eqview="brains">Back to the Brains page</button></p>${rolesHtml()}`;
    if (!roles) return '<p class="muted">Loading...</p>';
    return brainsHtml(brainsCtx({ inSettings: true }));
  }
  function rolesHtml() {
    if (!roles) return '<p class="muted">Loading...</p>';
    const setUpPage = listSetUpHtml(brainsCtx()); // 1.5.207 Set up opens from the list too
    if (setUpPage) return setUpPage;
    // 1.5.56: only active models that can do the job are listed (the Brain catalogue's Active switches); what's picked
    // now always stays. Get more opens the catalogue at that job.
    const listFor = (kind, job, cur) => (roles.options[kind] || []).filter((o) => o.value === cur || ((kind !== 'llm' || canDo(job, { entry: entryOf(data.models, o.value), name: o.value, caps: o.caps }))
      && (naughtyOn() || !isNaughty(entryOf(data.models, o.value))) // 1.5.132: the naughty list stays out of the menus while its switch is off
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
    const bx = brainsCtx();
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
        </select>${getMore(j.id)}${j.kind === 'llm' ? listRowHtml(cur, { ...bx, rowId: j.id }) : ''}${j.id === 'speech' && cur ? nestedVoiceHtml() : ''}${!cur && opts.length && j.kind !== 'llm' ? `<div class="ready-hint"><span class="tag good">On this replicant matrix, not assigned yet</span> <button data-userole="${esc(j.id)}" data-value="${esc(opts[0].value)}">Use ${esc(opts[0].label)}</button></div>` : ''}</td></tr>`;
    };
    const thinkers = roles.jobs.filter((j) => j.kind === 'llm');
    const makers = roles.jobs.filter((j) => j.kind !== 'llm');
    return `<p class="muted">Pick which brain thinks for each job, and which model makes the pictures, clips and hearing. ${tipHtml('Using one brain for several jobs is faster; a different brain means a short swap (the brain machine), usually 10 to 20 seconds.', 'About swaps')} Only active models are listed: the <button type="button" class="link" data-tab="catalogue">📚 Brain catalogue</button> has every model, sorted by job.</p>
      ${listTopHtml(bx)}
      <h3>Thinking (writes, plans, codes, writes prompts)</h3><table class="roles">${thinkers.map(row).join('')}</table>
      <h3>Making (does the actual work)</h3><table class="roles">${makers.map(row).join('')}</table>
      ${fold('Session brains', [['small', 'Quick'], ['gaming', 'Gaming'], ['deep', 'Deep thinking'], ['coding', 'Coding'], ['office', 'Office']].map(([k, l]) => `${l}: ${settings.sessionBrains?.[k] ? (entryOf(data.models, settings.sessionBrains[k])?.name || settings.sessionBrains[k]) : 'Bob\'s pick'}`).join(', '), `<p class="muted">Pick a session from the menu next to Bob's name. Each one keeps a set of brains that fit in your graphics card together, so there are no swaps. Art runs the small brain on the processor so the painter keeps the card.</p>
      <table class="roles">${[['small', 'Quick brain', 'The Art session', 'small'], ['gaming', 'Gaming', 'Chats on the processor while you play (Qwen3 4B Instruct 2507)', 'gaming'], ['deep', 'Deep thinking', 'Medium, High and Extreme effort', 'deep'], ['coding', 'Coding session', 'The brain used when the session is Coding. The Coding job on the Brains page is the copy Bob hands code jobs to in any session.', 'tinker'], ['office', 'Office', 'Does everything in an Office session', 'office']].map(([k, label, what, job]) => {
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
    const k = (v) => (v >= 1048576 && v % 1048576 === 0 ? `${v / 1048576}M` : `${Math.round(v / 1024)}K`);
    const rows = (bctx?.brains || []).map((b) => {
      const top = b.max || b.choices.at(-1);
      // Long memory: sizes past what the brain was made for are stretched; one that won't fit here is greyed out.
      const longNote = (v) => { const r = b.room?.[v]; return r?.fits === false ? ` (stretched, won't fit here: needs about ${r.needGB} GB)` : ` (stretched${r?.needGB ? `, about ${r.needGB} GB` : ''})`; };
      const opts = b.choices.map((v) => `<option value="${v}" ${b.picked === v ? 'selected' : ''} ${b.max && v > b.max && b.room?.[v]?.fits === false && b.picked !== v ? 'disabled' : ''}>${k(v)}${b.max && v > b.max ? longNote(v) : ''}${v === top && b.max ? ' (the most it was made for)' : ''}${v === 32768 ? ' (enough for most chats)' : ''}</option>`).join('');
      return `<tr><th scope="row">${esc(b.name)} ${tipHtml(b.guide, `About ${b.name}`)}<div class="muted">${esc(b.jobs.join(', '))}</div></th><td><select data-bctx="${esc(b.model)}" aria-label="${esc(b.name)}: how much it keeps in mind"><option value="">Bob's pick (${k(b.bobPick)})</option>${opts}</select></td></tr>`;
    }).join('');
    return fold('How much each brain keeps in mind', on ? 'you pick, per brain' : 'Bob picks', `
      <label class="switch srow-switch"><input type="checkbox" data-set="brainCtxOn" ${on ? 'checked' : ''}><span><strong>Pick how much each brain keeps in mind</strong>${noteOrTip('Off to start with: Bob picks for each brain. On: pick a size for each brain you use. Each menu only lists sizes that brain was made for. A size you pick here is used for that brain everywhere, instead of the session sizes above.', 'Pick how much each brain keeps in mind')}</span></label>
      ${bctx?.canStretch ? `<label class="switch srow-switch"><input type="checkbox" data-set="brainCtxStretch" ${bctx.stretch ? 'checked' : ''}><span><strong>Long memory: let Qwen brains stretch past what they were made for</strong>${noteOrTip('Off to start with. On: Qwen3.5 and 3.6 brains (and Bob\'s own brains made from them) and Qwen3 Coder also offer 512K and 1M in their menu, and Qwen3 brains made for 32K also offer 64K and 128K. The stretch only switches on while you pick a size past what the brain was made for, because it makes short chats a little worse. It costs more memory: on the 35B brains, about 2.7 GB more at 512K and about 8 GB more at 1M; other brains need more, and each menu line says about how much. Reading a very long text takes a long time: a full 1M can take half an hour or more. A size that won\'t fit on this replicant matrix is greyed out. Only on Bob\'s built-in engine.', 'Long memory')}</span></label>` : ''}
      ${rows ? `<table class="roles">${rows}</table>` : '<p class="muted">No brains equipped yet.</p>'}`, on);
  }
  return {
    covered: (...a) => { fresh(); return covered(...a); },
    ENGINE_SIZE,
    engineById: (...a) => { fresh(); return engineById(...a); },
    engineStep: (...a) => { fresh(); return engineStep(...a); },
    action: (...a) => { fresh(); return action(...a); },
    catAction: (...a) => { fresh(); return catAction(...a); },
    cardSample: (...a) => { fresh(); return cardSample(...a); },
    card: (...a) => { fresh(); return card(...a); },
    extrasHtml: (...a) => { fresh(); return extrasHtml(...a); },
    modelList: (...a) => { fresh(); return modelList(...a); },
    catBody: (...a) => { fresh(); return catBody(...a); },
    picksSummary: (...a) => { fresh(); return picksSummary(...a); },
    pillSwitch: (...a) => { fresh(); return pillSwitch(...a); },
    fitBanner: (...a) => { fresh(); return fitBanner(...a); },
    groupHtml: (...a) => { fresh(); return groupHtml(...a); },
    brainsCtx: (...a) => { fresh(); return brainsCtx(...a); },
    brainsPanelHtml: (...a) => { fresh(); return brainsPanelHtml(...a); },
    rolesHtml: (...a) => { fresh(); return rolesHtml(...a); },
    brainCtxHtml: (...a) => { fresh(); return brainCtxHtml(...a); }
  };
}
