// 🎲 Adventure (1.5.117): the table where Bob runs a tabletop role-playing game as game master, for you and a party
// of Bobs (src/adventure.js has the rules). A page you open and a button you press: nothing loads before
// "Start a new game", and the game master brain is let go on Pause or End.
// The page draws from the server's view and the 'adventure' events (state, token, roll, fate, announce); nothing is
// decided here. Cards are yours alone: a Bob player just says what he does.
import { esc } from './util.js';
import { render } from './rich.js';
import { drawBob, LOOK_ID } from './bob-sprite.js';
import { mountCharacter, partsOf } from './character.js';
import { encodeParts, DEFAULT_PARTS } from './avatars.js';
import { tip } from './tips.js';

const $ = (id) => document.getElementById(id);
export const CARD_ICONS = { attack: '⚔', defend: '🛡', sneak: '🤫', talk: '💬', magic: '✨', item: '🎒', look: '🔍', help: '🤝', run: '🏃', other: '✍' };
export const CARD_NAMES = { attack: 'Attack', defend: 'Defend', sneak: 'Sneak', talk: 'Talk', magic: 'Magic', item: 'Use item', look: 'Look closer', help: 'Help an ally', run: 'Run', other: 'Something else' };
export const CARD_STATS = { attack: 'Might', defend: 'Might', sneak: 'Wits', talk: 'Charm', magic: 'Wits', item: 'Luck', look: 'Wits', help: 'Charm', run: 'Luck', other: 'Luck' };
export const CLASSES = { fighter: 'Fighter', rogue: 'Rogue', wizard: 'Wizard', cleric: 'Cleric', ranger: 'Ranger', bard: 'Bard' };
export const ARMOUR = { none: ['None', 'The dice decide. A bad run can kill the character.'], some: ['Some', 'One bad roll a scene is rolled again.'], lots: ['Lots', "Can't die. A terrible roll still costs something."], legendary: ['Legendary', 'Nothing worse than a close call, ever.'] };
export const SETTINGS = { fantasy: 'Classic fantasy', space: 'Space', spooky: 'Spooky', pick: 'Pick for me', own: 'My own' };
export const PACES = { short: 'Short (3 scenes)', evening: 'Evening (6 scenes)', campaign: 'Campaign (saved between sittings)' };
const NAMES = ['Wren', 'Tobin', 'Mara', 'Quill', 'Hesper', 'Dax', 'Ilse', 'Corvin', 'Pip', 'Sable', 'Juno', 'Oswin'];
const TRAITS = ['never leaves a door unopened', 'collects teeth, politely', 'owes money in three towns', 'talks to the horse first', 'afraid of nothing but geese', 'keeps a list of grudges, alphabetical'];
export const hearts = (n, max = 5) => '♥'.repeat(Math.max(0, n)) + '♡'.repeat(Math.max(0, max - n));

export function createAdventure({ api }) {
  let st = { userName: '' };
  const settings = () => ({ look: LOOK_ID, userName: st.userName || '' });
  const dlg = $('adventure'), body = $('adventure-body');
  $('adventure-close').onclick = () => dlg.close();
  let v = null, players = null, msg = '', picked = null, live = new Map(), open = false, journal = false;
  // 1.5.122: your character has a look of its own (the character screen, any body), never Bob's avatar.
  const you = { name: '', cls: 'fighter', trait: '', armour: 'some', look: encodeParts(DEFAULT_PARTS) };
  let lookOpen = false, delAsk = '';
  // 1.5.124 The Characters page (📖): You / Party / Met / Enemies, over the start card or the table.
  let chars = null; // null = not open; else { tab, edit: a saved character being edited (or 'new'), ask: id awaiting delete }
  const party = new Map(); // player key -> { ticked, armour, cls }

  async function load() {
    try { v = await api('/api/adventure'); if (!st.userName) st = await api('/api/settings').catch(() => st); } catch (e) { msg = e.message; }
    if (!v?.game && !players) {
      body.innerHTML = '<p class="muted">Looking for your other Bobs…</p>';
      try { players = (await api('/api/adventure/players')).players; } catch { players = []; }
      players.forEach((p, i) => { const k = p.address || p.name; if (!party.has(k)) party.set(k, { ticked: p.who === 'bob' ? i === 0 : p.ok === true, armour: 'some', cls: ['rogue', 'wizard', 'cleric', 'ranger', 'bard'][i % 5] }); });
    }
    draw();
  }

  function sprite(c, size = 48) {
    const id = c.who === 'you' ? (c.look || encodeParts(DEFAULT_PARTS)) : c.who === 'net' ? 'bot' : (settings().look || 'sysop');
    return `<canvas class="adv-face" width="${size}" height="${size}" data-look="${esc(id)}" aria-hidden="true"></canvas>`;
  }
  function drawFaces() {
    for (const cv of body.querySelectorAll('canvas.adv-face')) { const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; try { drawBob(c, cv.width, {}, cv.dataset.look); } catch {} }
  }

  // ---------- The start card ----------
  function startHtml() {
    const saved = v?.saved || [], chars = v?.characters || [];
    const refusal = v?.refusal ? `<p class="adv-refusal">${esc(v.refusal)}</p>` : '';
    const ownBox = `<input type="text" data-setting-text placeholder="A sunken city, a heist, a haunted train…" maxlength="300" aria-label="Your own setting" ${you.setting === 'own' ? '' : 'hidden'}>`;
    const stats = { fighter: 'Might 5 · Wits 2 · Charm 2 · Luck 3', rogue: 'Might 2 · Wits 4 · Charm 3 · Luck 3', wizard: 'Might 1 · Wits 5 · Charm 2 · Luck 4', cleric: 'Might 3 · Wits 3 · Charm 4 · Luck 2', ranger: 'Might 3 · Wits 4 · Charm 1 · Luck 4', bard: 'Might 1 · Wits 3 · Charm 5 · Luck 3' };
    const armourSel = (sel, attr) => `<select ${attr} aria-label="Plot armour">${Object.entries(ARMOUR).map(([id, [n]]) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
    return `<section class="adv-start">
      ${refusal}
      <p>I run the table. You play a character, and so do my other Bobs. ${tip('Every action is rolled by the app: d20 plus a stat. 15 or more is a hit, 10 to 14 a hit at a cost, under 10 a miss. Long travel is skipped. Nothing loads until you press Start a new game.', 'How a game works')}</p>
      <h3>Setting</h3>
      <div class="adv-choices" role="radiogroup" aria-label="Setting">${Object.entries(SETTINGS).map(([id, n]) => `<button type="button" role="radio" aria-checked="${(you.setting || 'fantasy') === id}" data-setting="${id}">${esc(n)}</button>`).join('')}</div>
      ${ownBox}
      <h3>Your character</h3>
      <div class="adv-you">
        <label>Name <input type="text" data-you="name" value="${esc(you.name)}" maxlength="40" placeholder="Hero"></label>
        <label>Class <select data-you="cls" aria-label="Class">${Object.entries(CLASSES).map(([id, n]) => `<option value="${id}" ${you.cls === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
        <span class="muted">${stats[you.cls]}</span>
        <label>One thing about them <input type="text" data-you="trait" value="${esc(you.trait)}" maxlength="120" placeholder="never leaves a door unopened"></label>
        <label>Plot armour ${armourSel(you.armour, 'data-you="armour"')}</label>
        <button type="button" class="mini" data-roll-you>🎲 Roll one for me</button>
      </div>
      <div class="adv-look">${sprite({ who: 'you', look: you.look }, 64)}<div><strong>Looks like</strong> <span class="muted">Your character's own look; my avatar stays mine.</span><br><button type="button" class="mini" data-you-look aria-expanded="${lookOpen}">🧍 ${lookOpen ? 'Close the character screen' : 'Change the look'}</button></div></div>
      ${lookOpen ? '<div class="char-box"></div>' : ''}
      <div class="adv-chars">${chars.length ? `<label>Saved characters <select data-saved-char aria-label="Saved characters"><option value="">Pick one…</option>${chars.map((c) => `<option value="${esc(c.id)}" ${c.id === you.savedId ? 'selected' : ''}>${esc(c.name)} (${esc(CLASSES[c.cls] || c.cls)})</option>`).join('')}</select></label>` : ''}
        <button type="button" class="mini" data-save-char>💾 Save this character</button>${you.savedId ? (delAsk === you.savedId ? `<span>Delete ${esc(chars.find((c) => c.id === you.savedId)?.name || 'this character')}?</span> <button type="button" class="mini danger" data-del-char="${esc(you.savedId)}">Delete for good</button><button type="button" class="link" data-del-keep>Keep it</button>` : `<button type="button" class="mini" data-del-ask="${esc(you.savedId)}">Delete this character</button>`) : ''} ${tip('Saved characters keep the name, class, the one thing about them, plot armour and the look, so you can pick the same hero next time. They live beside the saved campaigns on this replicant matrix.', 'Saved characters')}</div>
      <p><button type="button" data-chars-open>📖 Characters</button> <span class="muted">Your heroes, the party, everyone you've met, and the usual enemies.</span></p>
      <h3>Who plays</h3>
      <p class="muted">Tick the Bobs at the table. A Bob on your Bob-Net plays himself over there; a copy of me is played by the game master brain. What goes to him: the scene so far and his character's sheet, over Tailscale to your own Bob only; nothing else from this replicant matrix. Each gets their own plot armour.</p>
      <ul class="adv-players">${(players || []).map((p) => { const k = p.address || p.name, st = party.get(k); return `<li class="${p.ok === false ? 'dim' : ''}"><label><input type="checkbox" data-player="${esc(k)}" ${st.ticked ? 'checked' : ''} ${p.ok === false ? 'disabled' : ''}> <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.note)}</span></label>
        <select data-player-cls="${esc(k)}" aria-label="${esc(p.name)}'s class">${Object.entries(CLASSES).map(([id, n]) => `<option value="${id}" ${st.cls === id ? 'selected' : ''}>${n}</option>`).join('')}</select>
        ${armourSel(st.armour, `data-player-armour="${esc(k)}"`)}</li>`; }).join('')}</ul>
      <h3>How long</h3>
      <div class="adv-choices" role="radiogroup" aria-label="How long">${Object.entries(PACES).map(([id, n]) => `<button type="button" role="radio" aria-checked="${(you.pace || 'evening') === id}" data-pace="${id}">${esc(n)}</button>`).join('')}</div>
      <div class="row adv-go"><button type="button" class="big yes" data-start ${v?.refusal ? 'disabled' : ''}>🎲 Start a new game</button><span class="muted">Loads the game master brain. Pause or End lets it go again. The first turn takes longest: the game master reads the rules and the party first.</span></div>
      ${msg ? `<p class="adv-msg" role="alert">${esc(msg)}</p>` : ''}
      ${saved.length ? `<h3>Continue a campaign</h3><ul class="adv-saved">${saved.map((g) => `<li><strong>${esc(g.title)}</strong> <span class="muted">${esc(g.setting)} · ${g.scenes} scene${g.scenes === 1 ? '' : 's'} · ${esc(g.party.join(', '))}${g.status === 'over' ? ' · ended' : ''}</span> <button type="button" class="mini" data-continue="${esc(g.id)}" ${v?.refusal ? 'disabled' : ''}>Continue</button> <button type="button" class="mini" data-delete="${esc(g.id)}">Delete</button></li>`).join('')}</ul>` : ''}
    </section>`;
  }

  // ---------- The Characters page (1.5.124) ----------
  function charsHtml() {
    const tabs = [['you', '🧍 You'], ['party', '👥 Party'], ['met', '📖 Met'], ['enemies', '⚔ Enemies']];
    const bar = `<div class="adv-chars-top"><button type="button" data-chars-back>← Back</button><div class="tabs" role="tablist" aria-label="Characters">${tabs.map(([id, l]) => `<button role="tab" aria-selected="${chars.tab === id}" data-chars-tab="${id}">${l}</button>`).join('')}</div></div>`;
    const card = (look, title, sub, extra = '') => `<li class="adv-char"><canvas class="adv-face" width="64" height="64" data-look="${esc(look || encodeParts(DEFAULT_PARTS))}" aria-hidden="true"></canvas><div><strong>${esc(title)}</strong><br><span class="muted">${sub}</span>${extra}</div></li>`;
    let bodyHtml = '';
    if (chars.tab === 'you') {
      const list = v?.characters || [];
      if (chars.edit) {
        const c = chars.edit === 'new' ? { name: '', cls: 'fighter', trait: '', armour: 'some', look: encodeParts(DEFAULT_PARTS) } : list.find((x) => x.id === chars.edit) || { name: '', cls: 'fighter', trait: '', armour: 'some', look: encodeParts(DEFAULT_PARTS) };
        chars.draft = chars.draft || { ...c };
        const d = chars.draft;
        bodyHtml = `<div class="adv-you"><label>Name <input type="text" data-draft="name" value="${esc(d.name)}" maxlength="40" placeholder="Hero"></label>
          <label>Class <select data-draft="cls" aria-label="Class">${Object.entries(CLASSES).map(([id, n]) => `<option value="${id}" ${d.cls === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label>
          <label>One thing about them <input type="text" data-draft="trait" value="${esc(d.trait || '')}" maxlength="120" placeholder="never leaves a door unopened"></label>
          <label>Plot armour <select data-draft="armour" aria-label="Plot armour">${Object.entries(ARMOUR).map(([id, [n]]) => `<option value="${id}" ${d.armour === id ? 'selected' : ''}>${n}</option>`).join('')}</select></label></div>
          <div class="char-box"></div>`;
      } else {
        bodyHtml = `<p class="muted">Your heroes, kept for the next game. Pick one on the start card under Saved characters.</p>
          <ul class="adv-char-list">${list.map((c) => card(c.look, c.name, `${esc(CLASSES[c.cls] || c.cls)} · plot armour ${esc(ARMOUR[c.armour]?.[0] || 'Some')}${c.trait ? ` · ${esc(c.trait)}` : ''}`, `<div class="row"><button type="button" class="mini" data-chars-edit="${esc(c.id)}">Edit</button>${chars.ask === c.id ? `<span>Delete ${esc(c.name)}?</span> <button type="button" class="mini danger" data-chars-del="${esc(c.id)}">Delete for good</button><button type="button" class="link" data-chars-keep>Keep it</button>` : `<button type="button" class="mini" data-chars-ask="${esc(c.id)}">Delete this character</button>`}</div>`)).join('')}</ul>
          <div class="row"><button type="button" class="yes" data-chars-edit="new">➕ New character</button></div>`;
      }
    } else if (chars.tab === 'party') {
      const g = v?.game || v?.lastParty;
      bodyHtml = g ? `<p class="muted">${v?.game ? 'At the table now' : `The last game, ${esc(g.title)}`}. Each Bob plays with his own look.</p><ul class="adv-char-list">${g.party.map((c) => card(c.who === 'you' ? (c.look || encodeParts(DEFAULT_PARTS)) : c.who === 'net' ? 'bot' : (settings().look || 'sysop'), c.name, `${esc(c.className)}${c.who === 'you' ? ' · you' : c.who === 'net' ? ' · his own Bob' : ' · played by the game master'} · <span aria-label="${c.hearts} of 5 hearts">${hearts(c.hearts)}</span>${c.trait ? `<br>${esc(c.trait)}` : ''}${c.items?.length ? `<br>Carries ${esc(c.items.join(', '))}` : ''}${c.spells?.length ? `<br>Knows ${esc(c.spells.join(', '))}` : ''}`)).join('')}</ul>` : '<p class="muted">No party yet. Start a game and they turn up here.</p>';
    } else if (chars.tab === 'met') {
      const list = v?.game?.met?.length ? v.game.met : (v?.met || []);
      bodyHtml = list.length ? `<p class="muted">${v?.game?.met?.length ? 'Everyone the game master has brought on in this game.' : 'Everyone and everything you have run into, across your games.'} Drawn by me the moment they're named.</p><ul class="adv-char-list">${list.map((m) => card(m.look, m.name, `${m.kind === 'enemy' ? `⚔ ${esc(v?.enemies?.find((e) => e.id === m.type)?.name || 'enemy')}` : m.kind === 'creature' ? 'creature' : 'person'}${m.scene ? ` · met at ${esc(m.scene)}` : ''}${m.game && !v?.game ? ` · ${esc(m.game)}` : ''}`, v?.game ? '' : `<div class="row">${chars.ask === m.id ? `<span>Forget ${esc(m.name)}?</span> <button type="button" class="mini danger" data-met-forget="${esc(m.id)}">Forget for good</button><button type="button" class="link" data-chars-keep>Keep it</button>` : `<button type="button" class="mini" data-chars-ask="${esc(m.id)}">Forget</button>`}</div>`)).join('')}</ul>` : '<p class="muted">Nobody yet. Whoever the game master names in a scene lands here, drawn.</p>';
    } else {
      bodyHtml = `<p class="muted">The usual suspects, with how many hearts they have and what to know. The game master uses these as written and invents the rest.</p><ul class="adv-char-list">${(v?.enemies || []).map((e) => card(e.look, e.name, `<span aria-label="${e.hearts} heart${e.hearts === 1 ? '' : 's'}">${hearts(e.hearts, e.hearts)}</span> · ${esc(e.attack)}<br><em>${esc(e.trick)}</em><br>${esc(e.flavour)}`)).join('')}</ul>`;
    }
    return `<section class="adv-chars-page">${bar}${bodyHtml}${msg ? `<p class="adv-msg" role="alert">${esc(msg)}</p>` : ''}</section>`;
  }

  // ---------- The table ----------
  function logHtml(g) {
    return g.log.map((l) => {
      if (l.who === 'gm') return `<div class="adv-gm"><span class="adv-who">🎲 Game master</span>${render(l.text)}${l.title ? '' : ''}</div>`;
      if (l.who === 'app') return `<p class="adv-app muted">${esc(l.text)}</p>`;
      return `<div class="adv-turn ${l.who === 'you' ? 'you' : ''}"><span class="adv-who">${esc(l.name)}${l.by === 'net' ? ' <span class="tag">his own Bob</span>' : l.who === 'player' ? ' <span class="tag">played by the game master</span>' : ''}</span><p>${esc(l.text)}</p>${l.dice ? `<p class="adv-dice">🎲 ${esc(l.dice)}</p>` : ''}</div>`;
    }).join('');
  }
  function partyHtml(g) {
    return `<ul class="adv-party">${g.party.map((c, i) => `<li class="${i === g.turn && g.status === 'playing' ? 'turn' : ''}${c.out ? ' out' : ''}" title="${esc(c.trait)}">${sprite(c)}<div><strong>${esc(c.name)}</strong><br><span class="muted">${esc(c.className)}${c.who === 'you' ? ' · you' : ''}</span><br><span class="adv-hearts" aria-label="${c.hearts} of 5 hearts">${hearts(c.hearts)}</span>${c.out ? '<br><span class="tag">out</span>' : ''}${i === g.turn && g.status === 'playing' ? '<br><span class="tag">turn</span>' : ''}</div></li>`).join('')}</ul>`;
  }
  function handHtml(g) {
    if (!v.waitingFor) return '';
    const me = g.party.find((c) => c.id === v.waitingFor);
    const cards = g.cards || [];
    if (picked && picked.card && !picked.done) {
      const sec = g.second?.[picked.card];
      if (sec && !picked.pick && !picked.skipSecond) {
        return `<div class="adv-hand"><p><strong>${CARD_ICONS[picked.card]} ${CARD_NAMES[picked.card]}: ${esc(sec.ask)}</strong></p>
          <div class="adv-cards">${sec.choices.map((c) => `<button type="button" class="adv-card" data-pick="${esc(c)}">${esc(c)}</button>`).join('')}<button type="button" class="adv-card other" data-pick="">${esc(sec.free)}</button></div>
          <div class="row"><button type="button" data-back>← Back</button></div></div>`;
      }
      return `<div class="adv-hand"><p><strong>${CARD_ICONS[picked.card]} ${CARD_NAMES[picked.card]}${picked.pick ? ` (${esc(picked.pick)})` : ''}</strong> <span class="muted">rolls ${CARD_STATS[picked.card]}</span></p>
        <label><strong>How does it play out?</strong> <span class="muted">Optional. A good line earns +2.</span><textarea rows="2" maxlength="400" data-flair aria-label="How does it play out?" placeholder="${picked.card === 'other' ? 'Say what you do…' : 'Add some flair…'}"></textarea></label>
        <div class="row"><button type="button" class="big yes" data-go>🎲 Roll it</button><button type="button" data-skip>Skip the flair, just roll</button><button type="button" data-back>← Back</button></div></div>`;
    }
    return `<div class="adv-hand"><p><strong>${esc(me?.name || 'Your')}'s turn.</strong> <span class="muted">Pick a card; the app rolls for you. Cards that don't fit this scene are left out.</span></p>
      <div class="adv-cards">${cards.map((c) => `<button type="button" class="adv-card ${c === 'other' ? 'other' : ''}" data-card="${c}"><span class="adv-ico">${CARD_ICONS[c]}</span>${CARD_NAMES[c]}<span class="muted">${CARD_STATS[c]}${g.second?.[c] ? ' ›' : ''}</span></button>`).join('')}</div></div>`;
  }
  function gameHtml(g) {
    const busy = v.busy === 'gm' ? '🎲 The game master is thinking…' : v.busy === 'player' ? `${esc(g.party[g.turn]?.name || 'A Bob')} is deciding…` : '';
    const scene = g.scenes[g.scenes.length - 1];
    return `<section class="adv-game">
      <div class="adv-top"><strong>${esc(g.title)}</strong> <span class="muted">${esc(g.settingText)}${scene ? ` · Scene ${scene.n}: ${esc(scene.title)}` : ''} · round ${g.round}</span>
        <span class="adv-fill"></span>
        ${g.status === 'playing' ? '<button type="button" data-pause>⏸ Pause</button>' : g.status === 'paused' ? '<button type="button" class="yes" data-resume>▶ Resume</button>' : ''}
        <button type="button" data-journal aria-pressed="${journal}">📓 Journal</button>
        <button type="button" data-chars-open>📖 Characters</button>
        <button type="button" data-end>${g.status === 'over' ? 'Close' : '🏁 End game'}</button></div>
      ${journal ? `<div class="adv-journal"><strong>The story so far</strong><p>${esc(g.summary || 'Nothing written down yet; I sum things up every three scenes.')}</p>${g.scenes.length ? `<p class="muted">${g.scenes.map((s) => `Scene ${s.n}: ${esc(s.title)}`).join(' · ')}</p>` : ''}</div>` : ''}
      ${partyHtml(g)}
      <div class="adv-log" id="adv-log">${logHtml(g)}<div class="adv-live" id="adv-live" hidden></div></div>
      ${busy ? `<p class="adv-busy muted">${busy}</p>` : ''}
      ${v.fate ? `<div class="adv-hand adv-fate"><p><strong>${esc(v.fate.name)} is at zero hearts.</strong> Your call.</p><div class="row"><button type="button" class="big" data-fate="style">Go out in style</button><button type="button" class="big yes" data-fate="captured">Wake up captured</button></div></div>` : ''}
      ${g.status === 'playing' ? handHtml(g) : ''}
      ${msg ? `<p class="adv-msg" role="alert">${esc(msg)}</p>` : ''}
    </section>`;
  }

  function draw() {
    if (!open) return;
    const g = v?.game;
    body.innerHTML = chars ? charsHtml() : g ? gameHtml(g) : startHtml();
    drawFaces();
    const box = body.querySelector('.char-box');
    if (box && chars?.edit) {
      mountCharacter(box, { parts: partsOf(chars.draft.look), useLabel: 'Save this character', async onUse(id) { try { const r = await api('/api/adventure/characters/save', { id: chars.edit === 'new' ? '' : chars.edit, name: chars.draft.name || 'Hero', cls: chars.draft.cls, trait: chars.draft.trait, armour: chars.draft.armour, look: id }); v = { ...v, characters: r.characters }; msg = ''; } catch (e) { msg = e.message; } chars.edit = null; chars.draft = null; draw(); }, onCancel() { chars.edit = null; chars.draft = null; draw(); } });
    } else if (box) mountCharacter(box, { parts: partsOf(you.look), useLabel: 'Use for this character', onUse(id) { you.look = id; lookOpen = false; draw(); }, onCancel() { lookOpen = false; draw(); } });
    const log = $('adv-log'); if (log) log.scrollTop = log.scrollHeight;
    for (const [who, el] of live) if (el.text) { const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<span class="adv-who">${who === 'gm' ? '🎲 Game master' : esc(g?.party.find((c) => c.id === who)?.name || 'A Bob')}</span><p>${esc(el.text)}</p>`; } }
  }

  // Streamed words: shown as they come, then replaced by the saved line on the next state.
  function onEvent(ev) {
    if (ev.ev === 'state') { v = { ...v, ...ev }; live = new Map(); if (!v.waitingFor) picked = null; msg = ''; if (ev.game && !ev.busy && !ev.waitingFor && v.fate && ev.game.status !== 'playing') v.fate = null; draw(); return; }
    if (ev.ev === 'token') {
      const cur = live.get(ev.who) || { text: '' }; cur.text += ev.text; live.set(ev.who, cur);
      const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<span class="adv-who">${ev.who === 'gm' ? '🎲 Game master' : esc(v?.game?.party.find((c) => c.id === ev.who)?.name || 'A Bob')}</span><p>${esc(cur.text.replace(/<<<[\s\S]*$/, ''))}</p>`; const log = $('adv-log'); if (log) log.scrollTop = log.scrollHeight; }
      return;
    }
    if (ev.ev === 'roll') { const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<p class="adv-dice adv-roll">🎲 ${esc(ev.name)}: ${esc(ev.text)}</p>`; } return; }
    if (ev.ev === 'fate') { v = { ...v, fate: { who: ev.who, name: ev.name } }; draw(); return; }
    if (ev.ev === 'standin') { msg = ev.text; draw(); return; }
    if (ev.ev === 'announce') { const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<p class="muted">${esc(ev.text)}</p>`; } }
  }
  window.addEventListener('bob-adventure', (e) => onEvent(e.detail));

  async function call(url, data) { try { v = { ...v, ...(await api(url, data)) }; msg = ''; } catch (e) { msg = e.message; } draw(); }
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.setting) { you.setting = t.dataset.setting; draw(); return; }
    if (t.dataset.pace) { you.pace = t.dataset.pace; draw(); return; }
    if ('youLook' in t.dataset) { lookOpen = !lookOpen; draw(); return; }
    if ('charsOpen' in t.dataset) { chars = { tab: 'you' }; draw(); return; }
    if ('charsBack' in t.dataset) { chars = null; draw(); return; }
    if (t.dataset.charsTab) { chars = { tab: t.dataset.charsTab }; draw(); return; }
    if (t.dataset.charsEdit) { chars.edit = t.dataset.charsEdit; chars.draft = null; draw(); return; }
    if (t.dataset.charsAsk) { chars.ask = t.dataset.charsAsk; draw(); return; }
    if ('charsKeep' in t.dataset) { chars.ask = ''; draw(); return; }
    if (t.dataset.charsDel) { chars.ask = ''; try { const r = await api('/api/adventure/characters/delete', { id: t.dataset.charsDel }); v = { ...v, characters: r.characters }; if (you.savedId === t.dataset.charsDel) you.savedId = ''; } catch (e) { msg = e.message; } draw(); return; }
    if (t.dataset.metForget) { chars.ask = ''; try { const r = await api('/api/adventure/met/forget', { id: t.dataset.metForget }); v = { ...v, met: r.met }; } catch (e) { msg = e.message; } draw(); return; }
    if ('saveChar' in t.dataset) { try { const r = await api('/api/adventure/characters/save', { id: you.savedId || '', name: you.name || 'Hero', cls: you.cls, trait: you.trait, armour: you.armour, look: you.look }); v = { ...v, characters: r.characters }; you.savedId = r.characters[0]?.id; msg = ''; } catch (e) { msg = e.message; } draw(); return; }
    if (t.dataset.delAsk) { delAsk = t.dataset.delAsk; draw(); return; }
    if ('delKeep' in t.dataset) { delAsk = ''; draw(); return; }
    if (t.dataset.delChar) { delAsk = ''; try { const r = await api('/api/adventure/characters/delete', { id: t.dataset.delChar }); v = { ...v, characters: r.characters }; you.savedId = ''; } catch (e) { msg = e.message; } draw(); return; }
    if ('rollYou' in t.dataset) { you.name = NAMES[Math.floor(Math.random() * NAMES.length)]; you.cls = Object.keys(CLASSES)[Math.floor(Math.random() * 6)]; you.trait = TRAITS[Math.floor(Math.random() * TRAITS.length)]; draw(); return; }
    if ('start' in t.dataset) {
      const bobs = (players || []).filter((p) => party.get(p.address || p.name)?.ticked && p.ok !== false).map((p) => { const st = party.get(p.address || p.name); return { who: p.who, name: p.name, address: p.address || '', armour: st.armour, cls: st.cls }; });
      t.disabled = true;
      await call('/api/adventure/start', { setting: you.setting || 'fantasy', settingText: body.querySelector('[data-setting-text]')?.value || '', pace: you.pace || 'evening', you: { name: you.name || 'Hero', cls: you.cls, trait: you.trait, armour: you.armour, look: you.look || '' }, bobs });
      return;
    }
    if (t.dataset.continue) return call('/api/adventure/continue', { id: t.dataset.continue });
    if (t.dataset.delete) { if (!confirm('Delete this campaign for good?')) return; return call('/api/adventure/delete', { id: t.dataset.delete }); }
    if ('pause' in t.dataset) return call('/api/adventure/pause', {});
    if ('resume' in t.dataset) return call('/api/adventure/resume', {});
    if ('journal' in t.dataset) { journal = !journal; draw(); return; }
    if ('end' in t.dataset) { if (v.game.status !== 'over' && !confirm('End the game? The campaign stays saved under Continue.')) return; await call('/api/adventure/end', { keep: true }); players = null; return load(); }
    if (t.dataset.fate) { v.fate = null; return call('/api/adventure/fate', { choice: t.dataset.fate }); }
    if (t.dataset.card) { picked = { card: t.dataset.card }; draw(); return; }
    if ('pick' in t.dataset) { picked = { ...picked, pick: t.dataset.pick, skipSecond: t.dataset.pick === '' }; draw(); body.querySelector('[data-flair]')?.focus(); return; }
    if ('back' in t.dataset) { picked = picked?.pick || picked?.skipSecond ? { card: picked.card } : null; if (picked && !v.game.second?.[picked.card]) picked = null; draw(); return; }
    if ('go' in t.dataset || 'skip' in t.dataset) {
      const flair = 'go' in t.dataset ? body.querySelector('[data-flair]')?.value || '' : '';
      const p = picked; picked = { ...picked, done: true };
      await call('/api/adventure/act', { card: p.card, pick: p.pick || '', flair });
      return;
    }
  });
  body.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.you) { you[el.dataset.you] = el.value; if (el.dataset.you === 'cls') draw(); return; }
    if (el.dataset.draft && chars?.draft) { chars.draft[el.dataset.draft] = el.value; return; }
    if ('savedChar' in el.dataset) { const c = (v?.characters || []).find((x) => x.id === el.value); if (c) { Object.assign(you, { name: c.name, cls: c.cls, trait: c.trait, armour: c.armour, look: c.look || you.look, savedId: c.id }); } draw(); return; }
    if (el.dataset.player) { party.get(el.dataset.player).ticked = el.checked; return; }
    if (el.dataset.playerCls) { party.get(el.dataset.playerCls).cls = el.value; return; }
    if (el.dataset.playerArmour) { party.get(el.dataset.playerArmour).armour = el.value; return; }
  });
  body.addEventListener('keydown', (e) => { if (e.key === 'Enter' && e.ctrlKey && e.target.matches('[data-flair]')) body.querySelector('[data-go]')?.click(); });
  dlg.addEventListener('close', () => { open = false; });

  return {
    async open() { open = true; dlg.showModal(); body.innerHTML = '<p class="muted">Setting the table…</p>'; await load(); },
    isOpen: () => open
  };
}

// Settings, 🎲 Adventure. Neither is "on": both just have a default.
export function adventureSettingsHtml(a = {}) {
  const opt = (name, val, cur, label) => `<button type="button" role="radio" aria-checked="${cur === val}" data-adv-set="${name}" data-val="${val}">${label}</button>`;
  return `<div class="adventure-settings">
    <div><strong>Which brain is the game master</strong> ${tip('The game needs one good storyteller. Biggest brain is the Deep thinking slot, or the main Brain when nothing is in it; always on the graphics card, thinking on. It loads when a game starts and is let go on Pause or End.', 'Which brain is the game master')}<div class="ttabs" role="radiogroup" aria-label="Which brain is the game master">${opt('gm', 'biggest', a.gm || 'biggest', 'Biggest brain')}${opt('gm', 'main', a.gm || 'biggest', 'Main Brain')}</div></div>
    <div><strong>Who plays the other Bobs</strong> ${tip('Their own Bob: a Bob on your Bob-Net list thinks his own turns over there, in his own voice, through the same door as Lend my brain. What goes to him: the scene so far and his character\'s sheet, over Tailscale to your own Bob only; nothing else from this replicant matrix. When he can\'t (gaming, busy, not reachable), the game master brain plays him that turn and says so. The game master brain: every Bob at the table is played here.', 'Who plays the other Bobs')}<div class="ttabs" role="radiogroup" aria-label="Who plays the other Bobs">${opt('players', 'own', a.players || 'own', 'Their own Bob when reachable')}${opt('players', 'gm', a.players || 'own', 'The game master brain')}</div></div>
    <p class="muted">The game itself lives on the 🎲 Adventure page in the menu. Nothing runs until you start a game there.</p>
  </div>`;
}
export function mountAdventureSettings(box, { api, settings }) {
  if (!box) return;
  box.addEventListener('click', async (e) => {
    const t = e.target.closest('[data-adv-set]'); if (!t) return;
    try { const r = await api('/api/adventure/settings', { [t.dataset.advSet]: t.dataset.val }); settings.adventure = r.settings; box.innerHTML = adventureSettingsHtml(r.settings); } catch {}
  });
}
