// The Style page: themes (Bob's own, the worlds, high contrast, MouseWurX, yours), a "make your own"
// editor with a live preview, and Bob's look, including every avatar in avatars.js.
import { LOOKS, LOOK_ID, setLook, drawBob } from './bob-sprite.js';
import { tip } from './tips.js';
import { AVATAR_GROUPS, avatar } from './avatars.js';
import { PRESETS, TOKENS, FONTS, DEFAULT_THEME, themeId, findTheme, resolve, fullColors, applyStyle, applyTheme, swatch, isLight } from './themes.js';
import { esc } from './util.js';
import { characterHtml, mountCharacter, BOB_BODIES, partsOf } from './character.js';


export function createStylePage({ api, redraw, flash }) {
  let draft = null; // the theme being made in the editor, or null when the editor is closed
  let avatarFilter = 'all';
  let making = false; // 1.5.122: the character screen (Make your own look) is open under Bob's look
  let makingParts = null;

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

  function avatarsHtml() {
    const mine = LOOK_ID.startsWith('c:') ? [{ id: 'mine', label: 'Your own design', ids: [LOOK_ID] }] : [];
    const groups = [...mine, { id: 'bob', label: 'Bob\'s own', ids: Object.keys(LOOKS) }, ...AVATAR_GROUPS.map((g) => ({ id: g.id, label: g.label, ids: Array.from({ length: g.count }, (_, i) => `${g.id}-${i}`) }))];
    const shown = avatarFilter === 'all' ? groups : groups.filter((g) => g.id === avatarFilter);
    return `<div class="avatars"><div class="tabs" role="tablist" aria-label="Avatar groups">${[{ id: 'all', label: 'All' }, ...groups].map((g) => `<button role="tab" aria-selected="${g.id === avatarFilter}" data-avgroup="${g.id}">${esc(g.label)}</button>`).join('')}</div>
      ${shown.map((g) => {
        // 1.5.101: when every look in a group has the same line ("Visitor from elsewhere"), it shows once by the heading.
        const whats = g.ids.map((id) => (LOOKS[id] || avatar(id)).what || '');
        const shared = g.ids.length > 1 && whats.every((w) => w === whats[0]) ? whats[0] : '';
        return `<h4>${esc(g.label)} · ${g.ids.length}${shared ? ` <small class="muted">${esc(shared)}</small>` : ''}</h4><div class="looks" role="radiogroup" aria-label="${esc(g.label)}">${g.ids.map((id) => {
        const l = LOOKS[id] || avatar(id);
        return `<button role="radio" aria-checked="${id === LOOK_ID}" data-look="${id}"${shared || !l.what ? '' : ` title="${esc(l.what)}"`}><canvas width="48" height="48" data-preview="${id}"></canvas><span>${esc(l.name)}</span></button>`;
      }).join('')}</div>`;
      }).join('')}</div>`;
  }

  function html(settings) {
    const style = settings.style || {};
    const groups = [['Bob', 'Bob'], ['Worlds', 'Worlds and places'], ['Access', 'High contrast'], ['MouseWurX', 'From the MouseWurX website']];
    const mine = style.custom || [];
    const motion = style.motion || 'on';
    const opt = (key, val, label, on) => `<button role="radio" aria-checked="${on}" aria-pressed="${on}" data-${key}="${val}">${label}</button>`;
    return `<section class="settings">
      <div><strong>Animations</strong> ${tip(`Bob breathes and blinks, the download Bobs hop, the brain machine runs. Remote Desktop usually turns Windows' animation effects off, so "On" ignores that.`, 'Animations')}
        <div class="ttabs" role="radiogroup" aria-label="Animations">${opt('motion', 'on', 'On', motion === 'on')}${opt('motion', 'system', settings.platform === 'win32' ? 'Follow Windows' : 'Follow the system', motion === 'system')}${opt('motion', 'off', 'Off', motion === 'off')}</div></div>
      <div><strong>Layout</strong> ${tip(`The menu on the left folds to icons with ‹ or Ctrl+B. The Now running panel on the right hides with Hide or Ctrl+J, and you can drag its edge to make it wider. Bob remembers how you leave them.`, 'Layout')}
        <div class="ttabs" role="radiogroup" aria-label="Open Now running when a task needs me">${opt('nowneed', '0', 'Leave Now running as it is', style.openNowOnNeed !== true)}${opt('nowneed', '1', 'Open Now running when a task needs me', style.openNowOnNeed === true)}</div></div>
      <div><strong>Theme</strong>
        ${groups.map(([g, label]) => `<h3>${label}</h3><div class="themes" role="radiogroup" aria-label="${label}">${PRESETS.filter((t) => t.group === g).map((t) => themeButton(t, style)).join('')}</div>`).join('')}
        ${mine.length ? `<h3>Yours</h3><div class="themes" role="radiogroup" aria-label="Your themes">${mine.map((t) => themeButton(t, style)).join('')}</div>${mine.some((t) => t.id === style.theme) ? '<p><button data-edittheme>Edit the selected theme</button></p>' : ''}` : ''}
        ${editorHtml()}
      </div>
      <div><strong>Bob's look</strong> ${tip(`Every one blinks and talks. ${AVATAR_GROUPS.reduce((n, g) => n + g.count, 0) + Object.keys(LOOKS).length} to pick from, all drawn on this replicant matrix, or make your own from parts.`, 'Bob\'s look')}
        <p><button type="button" data-makelook aria-expanded="${making}">🧍 ${LOOK_ID.startsWith('c:') ? 'Change your own design' : 'Make your own look'}</button> <span class="muted">Body, build, hair, outfit, armour and weapon. This one's me, so the bodies are man, robot and alien; your Adventure character gets the full set.</span></p>
        ${making ? '<div class="char-box"></div>' : ''}
        ${avatarsHtml()}</div>
    </section>`;
  }

  function paintPreviews(root, settings) {
    for (const c of root.querySelectorAll('canvas[data-preview]')) {
      const x = c.getContext('2d'); x.imageSmoothingEnabled = false; drawBob(x, c.width, {}, c.dataset.preview);
    }
    const box = root.querySelector('.char-box');
    if (box && making && !box.dataset.mounted) {
      box.dataset.mounted = '1';
      const live = mountCharacter(box, { parts: makingParts, bodies: BOB_BODIES, useLabel: 'Wear this', onCancel() { making = false; redraw(); },
        async onUse(id) { making = false; makingParts = null; const r = await api('/api/settings', { look: id }); setLook(id); if (settings) { settings.look = id; if (r.lookText) settings.lookText = r.lookText; } redraw(); flash('Done. That\'s me now.'); } });
      box.addEventListener('change', () => { makingParts = live.parts; }); box.addEventListener('click', () => { makingParts = live.parts; });
    }
  }

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
    if (b.dataset.nowneed) { await save(settings, { openNowOnNeed: b.dataset.nowneed === '1' }); redraw(); return true; }
    if (b.dataset.theme) { draft = null; await save(settings, { theme: b.dataset.theme }); redraw(); return true; }
    if (b.dataset.look) { const r = await api('/api/settings', { look: b.dataset.look }); setLook(b.dataset.look); settings.look = b.dataset.look; if (r.lookText) settings.lookText = r.lookText; redraw(); return true; }
    if (b.dataset.avgroup) { avatarFilter = b.dataset.avgroup; redraw(); return true; }
    if ('makelook' in b.dataset) { making = !making; if (making) makingParts = partsOf(settings.look || LOOK_ID); redraw(); return true; }
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

  // 1.5.122: Settings, Personality's "Change look" opens the page with the character screen already open.
  function openMaker(settings) { making = true; makingParts = partsOf(settings?.look || LOOK_ID); }
  return { html, onClick, onInput, paintPreviews, openMaker, closing(settings) { if (draft) { draft = null; applyStyle(settings?.style); } } };
}
