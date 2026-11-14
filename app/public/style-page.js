// The Style page: Bob's three looks, themes (Bob's own, the worlds, high contrast, MouseWurX, yours) and a "make
// your own" editor with a live preview. 1.5.222: Bob's picture is his cube; the pixel characters moved to the games
// (public/bob-game-look.js, in Adventure, Characters, Party), so this page only points there.
import { tip } from './tips.js';
import { LOOK_IDS, lookId, LAMPS, LAMP_LOOKS, lampId, lampOfTheme, PRESETS, TOKENS, FONTS, DEFAULT_THEME, themeId, findTheme, resolve, fullColors, applyStyle, applyTheme, swatch, isLight } from './themes.js';
import { esc } from './util.js';


export function createStylePage({ api, redraw, flash }) {
  let draft = null; // the theme being made in the editor, or null when the editor is closed

  function themeButton(t, style) {
    const on = themeId(style.theme || DEFAULT_THEME) === t.id;
    return `<button role="radio" aria-checked="${on}" data-theme="${esc(t.id)}">
      <span class="swatch">${swatch(t).map((c) => `<i style="background:${c}"></i>`).join('')}</span>
      <span><strong>${esc(t.name)}</strong>${t.what ? `<br><small>${esc(t.what)}</small>` : ''}</span></button>`;
  }

  function editorHtml() {
    if (!draft) return `<p class="row"><button data-newtheme>🎨 Make your own theme</button> ${tip('Starts from the one you\'re using now. You see every change straight away.', 'Make your own theme')}</p>`;
    return `<div class="model"><header><strong>${draft.id ? 'Edit your theme' : 'Your new theme'}</strong></header>
      <label class="pick"><span>Name</span><input type="text" data-dname maxlength="30" value="${esc(draft.name)}" style="width:16em"></label>
      <div class="editor">${TOKENS.map(([k, label]) => `<label><input type="color" data-dcolor="${k}" value="${esc(draft.colors[k])}"> ${esc(label)}</label>`).join('')}</div>
      <div class="row">
        <label class="pick"><span>Font</span><select data-dfont>${Object.entries(FONTS).map(([id, f]) => `<option value="${id}" ${draft.font === id ? 'selected' : ''}>${esc(f.label)}</option>`).join('')}</select></label>
        <label class="pick"><span>Corners: <b data-rlabel>${draft.radius}px</b></span><input type="range" min="0" max="20" data-dradius value="${draft.radius}"></label>
      </div>
      <label class="switch"><input type="checkbox" data-dflag="blueprint" ${draft.blueprint ? 'checked' : ''}><span>Graph-paper background (the MouseWurX blueprint look)</span></label>
      <label class="switch"><input type="checkbox" data-dflag="outlined" ${draft.outlined ? 'checked' : ''}><span>Outline every card (easier to see)</span></label>
      <div class="row"><button class="get" data-savetheme>Save theme</button><button data-canceltheme>Cancel</button>${draft.id ? '<button data-deltheme>Delete this theme</button>' : ''}</div>
    </div>`;
  }

  // 1.5.210: Bob's three looks. Each picker card is a tiny drawing of the chat in that look.
  const LOOK_TEXT = {
    classic: ['Classic', 'How I\'ve always looked, tidied up. Menu on the left, Now running on the right.'],
    lamplight: ['Lamplight', 'A dark room lit by my cube. The glow pulses slowly when I rest and flickers while I think.'],
    terminal: ['Terminal', 'Plain text. you> and bob> lines, [x] switches. Everything still works.']
  };
  function lookMini(id) {
    return id === 'terminal' ? '<span class="look-mini terminal" aria-hidden="true"><span>hi</span><span>hello</span><span>&gt; _</span></span>'
      : `<span class="look-mini ${id}" aria-hidden="true"><i class="y"></i><i class="b"></i><i class="c"></i></span>`;
  }
  function looksHtml(style) {
    const on = lookId(style);
    return `<div><strong>Look</strong> ${tip('The shape of everything: spacing, corners, bubbles and motion. Your theme picks the colours, so every theme works with every look.', 'Look')}
      <div class="look-pick" role="radiogroup" aria-label="Look">${LOOK_IDS.map((id) => `<button role="radio" aria-checked="${id === on}" data-uilook="${id}">${lookMini(id)}<span><strong>${LOOK_TEXT[id][0]}</strong><br><small>${esc(LOOK_TEXT[id][1])}</small></span></button>`).join('')}</div>
      ${LAMP_LOOKS.includes(on) ? lampsHtml(style, on) : ''}</div>`;
  }
  // Nov 14 2026: the lamp colours for Lamplight and Terminal. Each is a theme of its own (Lamps), and my app icon
  // follows it. Also in Settings, Look & feel (cellar-pages.js), so it's never hidden.
  function lampsHtml(style, look = lookId(style)) {
    const on = style.theme === lampId(style) ? lampId(style) : '';
    const word = look === 'terminal' ? 'Terminal' : 'Lamplight';
    return `<div class="lamp-row"><strong>Lamp</strong> ${tip('The colour of the light in the room, as close to each gas\'s real light as a screen can show. It sets the colours and my app icon. Picking another theme below keeps your icon.', 'Lamp')}
      <div class="lamp-pick" role="radiogroup" aria-label="Lamp">${LAMPS.map((l) => `<button type="button" role="radio" aria-checked="${l.id === on}" data-lamp="${l.id}" title="${esc(l.what)}"><i style="background:${l.glow};box-shadow:0 0 10px ${l.glow}" aria-hidden="true"></i>${esc(l.name)} ${word}</button>`).join('')}</div></div>`;
  }

  function html(settings) {
    const style = settings.style || {};
    const groups = [['Bob', 'Bob'], ['Lamps', 'Lamps'], ['Worlds', 'Worlds and places'], ['Access', 'High contrast'], ['MouseWurX', 'From the MouseWurX website']];
    const mine = style.custom || [];
    const motion = style.motion || 'on';
    const opt = (key, val, label, on) => `<button role="radio" aria-checked="${on}" aria-pressed="${on}" data-${key}="${val}">${label}</button>`;
    return `<section class="settings">
      ${looksHtml(style)}
      <div><strong>Animations</strong> ${tip(`Bob breathes and blinks, the download Bobs hop, the brain machine runs. Remote Desktop usually turns Windows' animation effects off, so "On" ignores that.`, 'Animations')}
        <div class="ttabs" role="radiogroup" aria-label="Animations">${opt('motion', 'on', 'On', motion === 'on')}${opt('motion', 'system', settings.platform === 'win32' ? 'Follow Windows' : 'Follow the system', motion === 'system')}${opt('motion', 'off', 'Off', motion === 'off')}</div></div>
      <div><strong>Layout</strong> ${tip(`The menu on the left folds to icons with ‹ or Ctrl+B. The Now running panel on the right hides with Hide or Ctrl+J, and you can drag its edge to make it wider. Bob remembers how you leave them.`, 'Layout')}
        <div class="ttabs" role="radiogroup" aria-label="Open Now running when a task needs me">${opt('nowneed', '0', 'Leave Now running as it is', style.openNowOnNeed !== true)}${opt('nowneed', '1', 'Open Now running when a task needs me', style.openNowOnNeed === true)}</div></div>
      <div><strong>Theme</strong>
        ${groups.map(([g, label]) => `<h3>${label}</h3><div class="themes" role="radiogroup" aria-label="${label}">${PRESETS.filter((t) => t.group === g).map((t) => themeButton(t, style)).join('')}</div>`).join('')}
        ${mine.length ? `<h3>Yours</h3><div class="themes" role="radiogroup" aria-label="Your themes">${mine.map((t) => themeButton(t, style)).join('')}</div>${mine.some((t) => t.id === style.theme) ? '<p><button data-edittheme>Edit the selected theme</button></p>' : ''}` : ''}
        ${editorHtml()}
      </div>
      <div><strong>Bob's picture</strong> ${tip('My picture is my fNRI cube: it builds itself when I load a brain, rests with the odd spark, glows while I think, and takes itself apart when I let the brain go. The little pixel characters are for games now: my game look is in Adventure, Characters, Party.', 'Bob\'s picture')}
        <p class="muted">My cube. The pixel characters are for games: <button type="button" class="link" data-gamelook>pick my game look in 🎲 Adventure</button>.</p></div>
    </section>`;
  }

  function paintPreviews() {}

  async function save(settings, patch) {
    const r = await api('/api/settings', { style: patch });
    settings.style = r.style || { ...(settings.style || {}), ...patch };
    applyStyle(settings.style);
  }

  function startDraft(settings, from) {
    const t = from || resolve(settings.style);
    const c = fullColors(t);
    draft = {
      id: from?.id || null,
      name: from?.name || `My ${t.name}`.slice(0, 30),
      colors: Object.fromEntries(TOKENS.map(([k]) => [k, c[k]])),
      font: t.font || 'system', radius: Number.isFinite(t.radius) ? t.radius : 8,
      blueprint: Boolean(t.blueprint), outlined: Boolean(t.outlined)
    };
    preview();
  }

  function preview() { if (draft) applyTheme({ ...draft, colors: { ...draft.colors, ...(draft.blueprint ? gridFor(draft.colors) : {}) } }); }
  function gridFor(c) { return isLight(c.bg) ? { grid: 'rgba(14,26,28,.06)', gridMajor: 'rgba(14,26,28,.095)' } : { grid: 'rgba(180,215,220,.045)', gridMajor: 'rgba(180,215,220,.075)' }; }

  async function onClick(b, settings) {
    const style = settings.style || {};
    if (b.dataset.motion) { await save(settings, { motion: b.dataset.motion }); redraw(); return true; }
    if (b.dataset.uilook) {
      await save(settings, { look: b.dataset.uilook });
      // Lamplight is the chat in a dark room: Now running tucks away (Ctrl+J or its button brings it back).
      if (b.dataset.uilook === 'lamplight' && !document.body.classList.contains('right-hidden')) document.getElementById('hideRight')?.click();
      redraw(); return true;
    }
    if (b.dataset.nowneed) { await save(settings, { openNowOnNeed: b.dataset.nowneed === '1' }); redraw(); return true; }
    if (b.dataset.lamp) { draft = null; await save(settings, { lamp: b.dataset.lamp, theme: b.dataset.lamp }); redraw(); return true; }
    if (b.dataset.theme) { draft = null; const lamp = lampOfTheme(b.dataset.theme); await save(settings, { theme: b.dataset.theme, ...(lamp ? { lamp } : {}) }); redraw(); return true; }
    if ('newtheme' in b.dataset) { startDraft(settings); redraw(); return true; }
    if ('edittheme' in b.dataset) { startDraft(settings, findTheme(style.theme, style.custom)); redraw(); return true; }
    if ('canceltheme' in b.dataset) { draft = null; applyStyle(style); redraw(); return true; }
    if ('savetheme' in b.dataset) {
      const id = draft.id || `my-${Date.now().toString(36)}`;
      const t = { id, name: draft.name.trim() || 'My theme', group: 'Yours', colors: { ...draft.colors }, font: draft.font, radius: draft.radius };
      if (draft.blueprint) t.blueprint = true;
      if (draft.outlined) t.outlined = true;
      const custom = [...(style.custom || []).filter((x) => x.id !== id), t];
      draft = null;
      await save(settings, { custom, theme: id });
      redraw(); flash('Saved. It\'s yours now, under "Yours".');
      return true;
    }
    if ('deltheme' in b.dataset) {
      if (b.dataset.sure !== '1') { b.dataset.sure = '1'; b.textContent = 'Sure? Click again to delete'; return true; }
      const custom = (style.custom || []).filter((x) => x.id !== draft.id);
      draft = null;
      await save(settings, { custom, theme: style.theme && custom.some((x) => x.id === style.theme) ? style.theme : DEFAULT_THEME });
      redraw();
      return true;
    }
    return false;
  }

  // Live editing: every change shows at once, nothing is saved until "Save theme".
  function onInput(el) {
    if (!draft) return false;
    if (el.dataset.dcolor) draft.colors[el.dataset.dcolor] = el.value;
    else if ('dname' in el.dataset) draft.name = el.value;
    else if ('dfont' in el.dataset) draft.font = el.value;
    else if ('dradius' in el.dataset) { draft.radius = Number(el.value); const l = el.closest('label').querySelector('[data-rlabel]'); if (l) l.textContent = `${draft.radius}px`; }
    else if (el.dataset.dflag) draft[el.dataset.dflag] = el.checked;
    else return false;
    preview();
    return true;
  }

  return { html, onClick, onInput, paintPreviews, closing(settings) { if (draft) { draft = null; applyStyle(settings?.style); } } };
}
