// 🧭 Journey on the desktop (1.5.206): opens the tile-map game (public/journey-play.js) in its own window over the
// Adventure page, with your character, Bob and your saved characters to pick from, the bestiary's looks for what
// jumps out, and the character screen for changing your look. Nothing runs until 🧭 Journey is pressed.
import * as R from './journey-rules.js';
import * as S from './journey-sides.js';
import * as W from './journey-world.js';
import * as A from './avatars.js';
import { mountJourney } from './journey-play.js';
import { getLook, LOOK_ID } from './bob-sprite.js';
import { mountCharacter, partsOf } from './character.js';
import { motionOff } from './themes.js';

let dlg = null, game = null;
// you: the start card's character ({ name, cls, look, savedId }); characters: the saved ones; enemies: the bestiary.
export function openJourney({ api, you = {}, characters = [], enemies = [], bobName = 'Bob' }) {
  if (!dlg) {
    dlg = document.createElement('dialog');
    dlg.className = 'cellar journey';
    dlg.setAttribute('aria-label', 'Journey');
    document.body.append(dlg);
    dlg.addEventListener('cancel', (e) => e.preventDefault()); // Esc is the game's menu key, not "close"
  }
  game?.stop();
  dlg.innerHTML = '<div class="journey-root"></div>';
  const saved = characters.find((c) => c.id === you.savedId);
  const party = [
    { id: 'you', name: you.name || saved?.name || 'Hero', cls: you.cls || 'fighter', look: you.look || '', who: 'you', stats: saved?.stats, charId: you.savedId || '' },
    { id: 'bob', name: bobName, cls: 'wizard', look: LOOK_ID, who: 'bob' },
    ...characters.filter((c) => c.id !== you.savedId).slice(0, 8).map((c) => ({ id: `c-${c.id}`, name: c.name, cls: c.cls, look: c.look, who: 'friend', stats: c.stats }))
  ];
  const enemyLooks = Object.fromEntries((enemies || []).map((e) => [e.id, e.look]));
  game = mountJourney(dlg.querySelector('.journey-root'), {
    R, W, S, A, party, enemyLooks, bobLook: LOOK_ID,
    lookOf: (id) => getLook(id),
    api: (path, body) => api(path, body),
    still: () => motionOff(),
    onClose: () => { dlg.close(); game = null; },
    editLook: (m, done) => {
      const boxEl = document.createElement('div');
      boxEl.className = 'char-box journey-look';
      dlg.querySelector('.jy-panel')?.prepend(boxEl);
      mountCharacter(boxEl, { parts: partsOf(m.look), useLabel: 'Use this look', onUse: (id) => { boxEl.remove(); done(id); }, onCancel: () => { boxEl.remove(); done(null); } });
    }
  });
  dlg.showModal();
  dlg.querySelector('.jy')?.focus();
  return game;
}
