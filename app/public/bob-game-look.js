// 1.5.222 Bob's game look. The cube is Bob's picture everywhere now; the little pixel characters (every avatar in
// avatars.js, Bob's own looks and a look made from parts) are only for games. This picker used to sit on the Style
// page as "Bob's look"; it lives in 🎲 Adventure, 📖 Characters, 👥 Party, and Journey and Adventure draw Bob with it.
// The saved setting is the same one as before (settings.look), so old chats, adventures and Journey saves keep it.
import { LOOKS, LOOK_ID, setLook, drawBob } from './bob-sprite.js';
import { AVATAR_GROUPS, avatar } from './avatars.js';
import { mountCharacter, BOB_BODIES, partsOf } from './character.js';
import { esc } from './util.js';

export const GAME_LOOK_COUNT = AVATAR_GROUPS.reduce((n, g) => n + g.count, 0) + Object.keys(LOOKS).length;

export function gameLookHtml(filter = 'all', making = false) {
  const mine = LOOK_ID.startsWith('c:') ? [{ id: 'mine', label: 'Your own design', ids: [LOOK_ID] }] : [];
  const groups = [...mine, { id: 'bob', label: 'Bob\'s own', ids: Object.keys(LOOKS) }, ...AVATAR_GROUPS.map((g) => ({ id: g.id, label: g.label, ids: Array.from({ length: g.count }, (_, i) => `${g.id}-${i}`) }))];
  const shown = filter === 'all' ? groups : groups.filter((g) => g.id === filter);
  return `<div class="game-look">
    <p class="muted">How I look in games: Adventure and Journey. Everywhere else I'm my cube. ${GAME_LOOK_COUNT} to pick from, or make one from parts.</p>
    <p><button type="button" class="mini" data-gl-make aria-expanded="${making}">🧍 ${LOOK_ID.startsWith('c:') ? 'Change your own design' : 'Make my game look'}</button> <span class="muted">Body, build, hair, outfit, armour and weapon. This one's me, so the bodies are man, robot and alien; your own characters get the full set.</span></p>
    ${making ? '<div class="char-box"></div>' : ''}
    <div class="avatars"><div class="tabs" role="tablist" aria-label="Look groups">${[{ id: 'all', label: 'All' }, ...groups].map((g) => `<button type="button" role="tab" aria-selected="${g.id === filter}" data-gl-group="${g.id}">${esc(g.label)}</button>`).join('')}</div>
    ${shown.map((g) => {
      // when every look in a group has the same line ("Visitor from elsewhere"), it shows once by the heading
      const whats = g.ids.map((id) => (LOOKS[id] || avatar(id)).what || '');
      const shared = g.ids.length > 1 && whats.every((w) => w === whats[0]) ? whats[0] : '';
      return `<h4>${esc(g.label)} · ${g.ids.length}${shared ? ` <small class="muted">${esc(shared)}</small>` : ''}</h4><div class="looks" role="radiogroup" aria-label="${esc(g.label)}">${g.ids.map((id) => {
        const l = LOOKS[id] || avatar(id);
        return `<button type="button" role="radio" aria-checked="${id === LOOK_ID}" data-gl-look="${id}"${shared || !l.what ? '' : ` title="${esc(l.what)}"`}><canvas width="48" height="48" data-gl-preview="${id}"></canvas><span>${esc(l.name)}</span></button>`;
      }).join('')}</div>`;
    }).join('')}</div></div>`;
}

// Wires the picker into box. Saves through /api/settings { look } exactly as the Style page did, so Bob's
// "he comments on a new look" (Settings, Personality) still works. onSaved(id) after a save.
export function mountGameLook(box, { api, onSaved, flash } = {}) {
  let filter = 'all', making = false;
  function paint() {
    for (const c of box.querySelectorAll('canvas[data-gl-preview]')) { const x = c.getContext('2d'); x.imageSmoothingEnabled = false; try { drawBob(x, c.width, {}, c.dataset.glPreview); } catch {} }
    const maker = box.querySelector('.char-box');
    if (maker) mountCharacter(maker, { parts: partsOf(LOOK_ID), bodies: BOB_BODIES, useLabel: 'Wear this', onCancel() { making = false; draw(); }, onUse(id) { making = false; save(id); } });
  }
  function draw() { box.innerHTML = gameLookHtml(filter, making); paint(); }
  async function save(id) {
    try { await api('/api/settings', { look: id }); setLook(id); draw(); flash?.('Done. That\'s me in games now.'); onSaved?.(id); } catch (e) { flash?.(e.message); draw(); }
  }
  box.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b || !box.contains(b) || b.closest('.char-box')) return;
    if (b.dataset.glLook) { save(b.dataset.glLook); return; }
    if (b.dataset.glGroup) { filter = b.dataset.glGroup; draw(); return; }
    if ('glMake' in b.dataset) { making = !making; draw(); box.querySelector('.char-box')?.scrollIntoView?.({ block: 'nearest' }); }
  });
  draw();
  return { draw };
}
