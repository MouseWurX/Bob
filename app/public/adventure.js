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
import { motionOff } from './themes.js';
import { createVoice } from './voice.js';
import { rollDie, createSounds, createMusic, createReader } from './table-fx.js';
import { openJourney } from './journey.js'; // 1.5.206 🧭 Journey

const $ = (id) => document.getElementById(id);
export const CARD_ICONS = { attack: '⚔', defend: '🛡', sneak: '🤫', talk: '💬', magic: '✨', item: '🎒', look: '🔍', help: '🤝', run: '🏃', other: '✍' };
export const CARD_NAMES = { attack: 'Attack', defend: 'Defend', sneak: 'Sneak', talk: 'Talk', magic: 'Magic', item: 'Use item', look: 'Look closer', help: 'Help an ally', run: 'Run', other: 'Something else' };
export const CARD_STATS = { attack: 'Might', defend: 'Might', sneak: 'Wits', talk: 'Charm', magic: 'Wits', item: 'Luck', look: 'Wits', help: 'Charm', run: 'Luck', other: 'Luck' };
export const CLASSES = { fighter: 'Fighter', rogue: 'Rogue', wizard: 'Wizard', cleric: 'Cleric', ranger: 'Ranger', bard: 'Bard' };
export const ARMOUR = { none: ['None', 'The dice decide. A bad run can kill the character.'], some: ['Some', 'One bad roll a scene is rolled again.'], lots: ['Lots', "Can't die. A terrible roll still costs something."], legendary: ['Legendary', 'Nothing worse than a close call, ever.'] };
export const SETTINGS = { fantasy: 'Classic fantasy', space: 'Space', spooky: 'Spooky', pick: 'Pick for me', own: 'My own' };
export const TONES = { cosy: 'Cosy', normal: 'Normal', grim: 'Grim' }; // 1.5.206
export const WORLD_NAMES = { people: 'People', places: 'Places', promises: 'Promises', threads: 'Open threads' };
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
  // 1.5.204: friends at the table, the table extras being ticked, the say-it box, Ask, the mic and the effects.
  const friends = []; // { name, cls, armour }
  let ex = null; // the start card's ticks (from Bob's last choice)
  let askOpen = false, sayDraft = '', micOn = false, micNote = '', hush = false;
  const hitFlash = new Set();
  const micOk = Boolean(globalThis.navigator?.mediaDevices?.getUserMedia);
  const fx = { sounds: createSounds(), music: createMusic(), reader: createReader({ wav: async (text) => { const r = await fetch('/api/speak', { method: 'POST', headers: { 'content-type': 'application/json', 'x-bob': '1' }, body: JSON.stringify({ text }) }); return r.ok ? r.blob() : null; } }) };
  let spokenGame = '', spokenCount = -1;
  const voice = micOk ? createVoice({
    transcribe: async (wav) => { const r = await fetch('/api/transcribe', { method: 'POST', headers: { 'content-type': 'audio/wav', 'x-bob': '1' }, body: wav }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'I couldn\'t hear that.'); return j.text || ''; },
    onText: (t) => { sayDraft = `${sayDraft ? `${sayDraft} ` : ''}${t}`.slice(0, 400); micOn = false; micNote = ''; draw(); body.querySelector('[data-say]')?.focus(); },
    onState: (st, note) => { micOn = st === 'ptt'; micNote = st === 'transcribing' ? 'Listening back…' : note || (micOn ? 'Listening… stop talking to finish.' : ''); draw(); }
  }) : null;

  async function load() {
    try { v = await api('/api/adventure'); if (!st.userName) st = await api('/api/settings').catch(() => st); } catch (e) { msg = e.message; }
    if (!ex) ex = { ...(v?.extras || {}) };
    if (!v?.game && !players) {
      body.innerHTML = '<p class="muted">Looking for your other Bobs…</p>';
      try { players = (await api('/api/adventure/players')).players; } catch { players = []; }
      players.forEach((p, i) => { const k = p.address || p.name; if (!party.has(k)) party.set(k, { ticked: p.who === 'bob' ? i === 0 : p.ok === true, armour: 'some', cls: ['rogue', 'wizard', 'cleric', 'ranger', 'bard'][i % 5] }); });
    }
    draw();
    syncFx();
  }

  function sprite(c, size = 48) {
    const id = isHumanSeat(c) ? (c.look || encodeParts(DEFAULT_PARTS)) : c.who === 'net' ? 'bot' : (settings().look || 'sysop');
    return `<canvas class="adv-face" width="${size}" height="${size}" data-look="${esc(id)}" aria-hidden="true"></canvas>`;
  }
  function isHumanSeat(c) { return c?.who === 'you' || c?.who === 'friend'; }
  function drawFaces() {
    for (const cv of body.querySelectorAll('canvas.adv-face')) { const c = cv.getContext('2d'); c.imageSmoothingEnabled = false; try { drawBob(c, cv.width, {}, cv.dataset.look); } catch {} }
  }

  // ---------- The start card ----------
  // 1.5.204: laid out in panels like the Settings cards: Story, Your character, Who plays, How long, Table extras.
  const STAT_LINE = { fighter: 'Might 5 · Wits 2 · Charm 2 · Luck 3', rogue: 'Might 2 · Wits 4 · Charm 3 · Luck 3', wizard: 'Might 1 · Wits 5 · Charm 2 · Luck 4', cleric: 'Might 3 · Wits 3 · Charm 4 · Luck 2', ranger: 'Might 3 · Wits 4 · Charm 1 · Luck 4', bard: 'Might 1 · Wits 3 · Charm 5 · Luck 3' };
  const armourSel = (sel, attr, label = 'Plot armour') => `<select ${attr} aria-label="${esc(label)}">${Object.entries(ARMOUR).map(([id, [n]]) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const clsSel = (sel, attr, label) => `<select ${attr} aria-label="${esc(label)}">${Object.entries(CLASSES).map(([id, n]) => `<option value="${id}" ${sel === id ? 'selected' : ''}>${n}</option>`).join('')}</select>`;
  const panel = (icon, title, inner, cls = '') => `<section class="adv-panel ${cls}"><h3><span class="adv-pico" aria-hidden="true">${icon}</span>${esc(title)}</h3>${inner}</section>`;
  function storyPanel() {
    const setting = you.setting || 'fantasy';
    const fits = (s) => ['pick', 'own'].includes(setting) || s.setting === setting;
    const starts = (v?.starts || []).filter(fits);
    const pick = starts.find((s) => s.id === you.story);
    const ownBox = `<input type="text" data-setting-text placeholder="A sunken city, a heist, a haunted train…" maxlength="300" aria-label="Your own setting" value="${esc(you.settingText || '')}" ${setting === 'own' ? '' : 'hidden'}>`;
    return panel('📖', 'Story', `<div class="adv-choices" role="radiogroup" aria-label="Setting">${Object.entries(SETTINGS).map(([id, n]) => `<button type="button" role="radio" aria-checked="${setting === id}" data-setting="${id}">${esc(n)}</button>`).join('')}</div>
      ${ownBox}
      <p class="adv-sub">Tonight's story</p>
      <div class="adv-choices adv-stories" role="radiogroup" aria-label="Tonight's story"><button type="button" role="radio" aria-checked="${!pick}" data-story="">✍ Make one up</button>${starts.map((s) => `<button type="button" role="radio" aria-checked="${pick?.id === s.id}" data-story="${esc(s.id)}">${esc(s.name)}</button>`).join('')}</div>
      <p class="muted adv-hook">${pick ? esc(pick.hook) : 'I make up a story to fit the setting.'}</p>
      <p class="adv-sub">Tone</p>
      <div class="adv-choices" role="radiogroup" aria-label="Tone">${Object.entries(TONES).map(([id, n]) => `<button type="button" role="radio" aria-checked="${(you.tone || 'normal') === id}" data-tone="${id}">${esc(n)}</button>`).join('')}</div>
      <label class="adv-keep">Keep out of the story <input type="text" data-keep-out maxlength="300" placeholder="spiders, drowning, anything you'd rather skip" value="${esc(you.keepOut || '')}"></label> ${tip('Cosy keeps danger mild and kind; Normal is a proper adventure; Grim is darker, with hard choices and real losses, never gory. Anything you write under Keep out of the story, the game master and the Bob players leave out.', 'Tone and keep out')}`);
  }
  function youPanel() {
    const chars = v?.characters || [];
    const sv = chars.find((c) => c.id === you.savedId);
    const grown = sv?.gains?.length ? `<p class="adv-gains">⭐ Earned so far: ${esc(sv.gains.join(', '))}</p>` : '';
    return panel('🧍', 'Your character', `<div class="adv-look">${sprite({ who: 'you', look: you.look }, 64)}<div class="adv-you">
        <label>Name <input type="text" data-you="name" value="${esc(you.name)}" maxlength="40" placeholder="Hero"></label>
        <label>Class ${clsSel(you.cls, 'data-you="cls"', 'Class')}</label>
        <span class="muted">${STAT_LINE[you.cls]}</span>
        <label>One thing about them <input type="text" data-you="trait" value="${esc(you.trait)}" maxlength="120" placeholder="never leaves a door unopened"></label>
        <label>Plot armour ${armourSel(you.armour, 'data-you="armour"')}</label>
      </div></div>
      ${grown}
      <div class="row adv-row"><button type="button" class="mini" data-you-look aria-expanded="${lookOpen}">🧍 ${lookOpen ? 'Close the character screen' : 'Change the look'}</button><button type="button" class="mini" data-roll-you>🎲 Roll one for me</button><button type="button" class="mini" data-chars-open>📖 Characters</button><button type="button" class="mini" data-journey title="Walk a tile map with the arrow keys and fight in turn-based battles">🧭 Journey</button></div>
      ${lookOpen ? '<div class="char-box"></div>' : ''}
      <div class="adv-chars">${chars.length ? `<label>Saved characters <select data-saved-char aria-label="Saved characters"><option value="">Pick one…</option>${chars.map((c) => `<option value="${esc(c.id)}" ${c.id === you.savedId ? 'selected' : ''}>${esc(c.name)} (${esc(CLASSES[c.cls] || c.cls)})${c.gains?.length ? ` ⭐${c.gains.length}` : ''}</option>`).join('')}</select></label>` : ''}
        <button type="button" class="mini" data-save-char>💾 Save this character</button>${you.savedId ? (delAsk === you.savedId ? `<span>Delete ${esc(sv?.name || 'this character')}?</span> <button type="button" class="mini danger" data-del-char="${esc(you.savedId)}">Delete for good</button><button type="button" class="link" data-del-keep>Keep it</button>` : `<button type="button" class="mini" data-del-ask="${esc(you.savedId)}">Delete this character</button>`) : ''} ${tip('Saved characters keep the name, class, the one thing about them, plot armour and the look, and whatever they earned in play (stat points, hearts, tricks, spells), so the same hero comes back stronger. They live beside the saved campaigns on this replicant matrix.', 'Saved characters')}</div>`);
  }
  function playersPanel() {
    const bobs = (players || []).map((p) => { const k = p.address || p.name, st = party.get(k); return `<li class="${p.ok === false ? 'dim' : ''}"><label><input type="checkbox" data-player="${esc(k)}" ${st.ticked ? 'checked' : ''} ${p.ok === false ? 'disabled' : ''}> <strong>${esc(p.name)}</strong> <span class="muted">${esc(p.note)}</span></label>
        ${clsSel(st.cls, `data-player-cls="${esc(k)}"`, `${p.name}'s class`)}
        ${armourSel(st.armour, `data-player-armour="${esc(k)}"`, `${p.name}'s plot armour`)}</li>`; }).join('');
    const fr = friends.map((f, i) => `<li class="adv-friend"><span class="adv-fname"><span aria-hidden="true">🙂</span><input type="text" data-friend="${i}" data-fk="name" value="${esc(f.name)}" maxlength="40" placeholder="Their character's name" aria-label="Friend ${i + 1}'s character name"></span>
        ${clsSel(f.cls, `data-friend="${i}" data-fk="cls"`, `Friend ${i + 1}'s class`)}
        ${armourSel(f.armour, `data-friend="${i}" data-fk="armour"`, `Friend ${i + 1}'s plot armour`)}
        <button type="button" class="link" data-friend-del="${i}" aria-label="Take friend ${i + 1} off the table">Remove</button></li>`).join('');
    return panel('👥', 'Who plays', `<p class="muted">Tick the Bobs at the table. ${tip("A Bob on your Bob-Net plays himself over there; a copy of me is played by the game master brain. What goes to him: the scene so far and his character's sheet, over Tailscale to your own Bob only; nothing else from this replicant matrix.", 'Bobs at the table')}</p>
      <ul class="adv-players">${bobs}${fr}</ul>
      <div class="row adv-row">${friends.length < 3 ? '<button type="button" class="mini" data-friend-add>➕ Add a friend</button>' : ''} ${tip('A friend plays a character of their own and takes their own turns: here on this screen when their turn comes, or on their phone with Bob for Android connected to me (Play as, on the phone\'s Adventure page). Up to three friends.', 'Friends at the table')}</div>`);
  }
  function pacePanel() {
    return panel('⏱', 'How long', `<div class="adv-choices" role="radiogroup" aria-label="How long">${Object.entries(PACES).map(([id, n]) => `<button type="button" role="radio" aria-checked="${(you.pace || 'evening') === id}" data-pace="${id}">${esc(n)}</button>`).join('')}</div>`);
  }
  // Table extras: all off until ticked; the last ticks are remembered by Bob for the next game.
  const EXTRA_ROWS = [
    ['dice', 'Roll the dice on screen', () => 'A die tumbles and lands for every roll.'],
    ['sounds', 'Sound effects', (can) => can.madeSounds ? 'Dice, steel, spells and doors. I make a few on this replicant matrix before the game.' : 'Dice, hits, misses and spells, made right here.'],
    ['voice', 'Read the story aloud', () => 'The game master\'s words, in my reading voice. You can also speak your turn.'],
    ['pictures', 'Pictures behind the story', (can) => can.pictures ? 'Painted before the game, one for each kind of scene, shown faded behind the story.' : 'Needs a picture model first (Get models).'],
    ['scenePics', 'A new picture for every scene', (can) => can.pictures ? 'Slower: the game master steps aside for about half a minute each new scene.' : 'Needs a picture model first (Get models).'],
    ['music', 'Music', (can) => can.music ? 'Two tunes made before the game, one for exploring and one for fights.' : 'Needs the music models first (Get models).']
  ];
  function extrasPanel() {
    const can = v?.can || {};
    const heavy = (ex.pictures && can.pictures) || (ex.music && can.music) || (ex.sounds && can.madeSounds);
    return panel('✨', 'Table extras', `<ul class="adv-extras">${EXTRA_ROWS.map(([id, label, note]) => {
      const off = (id === 'pictures' || id === 'scenePics') ? !can.pictures : id === 'music' ? !can.music : false;
      const dis = off || (id === 'scenePics' && !ex.pictures);
      return `<li class="${dis ? 'dim' : ''}"><label><input type="checkbox" data-extra="${id}" ${ex[id] && !off ? 'checked' : ''} ${dis ? 'disabled' : ''}> <strong>${esc(label)}</strong></label><span class="muted">${esc(note(can))}</span></li>`; }).join('')}</ul>
      ${heavy ? '<p class="adv-note">Setting the table takes a few minutes on this replicant matrix before the first scene: the graphics card paints and composes first, then the game master loads. You can skip it.</p>' : ''}`);
  }
  function startHtml() {
    const saved = v?.saved || [];
    const refusal = v?.refusal ? `<p class="adv-refusal">${esc(v.refusal)}</p>` : '';
    return `<section class="adv-start">
      ${refusal}
      <p class="adv-intro">I run the table. You play a character, and so do my other Bobs and your friends. ${tip('Every action is rolled by the app: d20 plus a stat. 15 or more is a hit, 10 to 14 a hit at a cost, under 10 a miss. Long travel is skipped. Nothing loads until you press Start a new game.', 'How a game works')}</p>
      <div class="adv-panels"><div class="adv-col">${storyPanel()}${youPanel()}</div><div class="adv-col">${playersPanel()}${pacePanel()}${extrasPanel()}</div></div>
      <div class="row adv-go"><button type="button" class="big yes" data-start ${v?.refusal ? 'disabled' : ''}>🎲 Start a new game</button><span class="muted">Loads the game master brain. Pause or End lets it go again. The first turn takes longest: the game master reads the rules and the party first.</span></div>
      ${msg ? `<p class="adv-msg" role="alert">${esc(msg)}</p>` : ''}
      ${saved.length ? panel('📜', 'Continue a campaign', `<ul class="adv-saved">${saved.map((g) => `<li><div><strong>${esc(g.title)}</strong><br><span class="muted">${esc(g.setting)} · ${g.scenes} scene${g.scenes === 1 ? '' : 's'} · ${esc(g.party.join(', '))}${g.status === 'over' ? ' · ended' : ''}</span></div><span class="adv-fill"></span><button type="button" class="mini yes" data-continue="${esc(g.id)}" ${v?.refusal ? 'disabled' : ''}>Continue</button> <button type="button" class="mini" data-storybook="${esc(g.id)}">📕 Storybook</button> <button type="button" class="mini" data-delete="${esc(g.id)}">Delete</button></li>`).join('')}</ul><p class="muted">Continue starts with "Last time…": the game master reminds the table where things stand. Storybook opens the story so far as one page, with its pictures, to keep or share.</p>`, 'adv-wide') : ''}
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
          <ul class="adv-char-list">${list.map((c) => card(c.look, c.name, `${esc(CLASSES[c.cls] || c.cls)} · plot armour ${esc(ARMOUR[c.armour]?.[0] || 'Some')}${c.trait ? ` · ${esc(c.trait)}` : ''}${c.gains?.length ? `<br>⭐ Earned: ${esc(c.gains.join(', '))}` : ''}`, `<div class="row"><button type="button" class="mini" data-chars-edit="${esc(c.id)}">Edit</button>${chars.ask === c.id ? `<span>Delete ${esc(c.name)}?</span> <button type="button" class="mini danger" data-chars-del="${esc(c.id)}">Delete for good</button><button type="button" class="link" data-chars-keep>Keep it</button>` : `<button type="button" class="mini" data-chars-ask="${esc(c.id)}">Delete this character</button>`}</div>`)).join('')}</ul>
          <div class="row"><button type="button" class="yes" data-chars-edit="new">➕ New character</button></div>`;
      }
    } else if (chars.tab === 'party') {
      const g = v?.game || v?.lastParty;
      bodyHtml = g ? `<p class="muted">${v?.game ? 'At the table now' : `The last game, ${esc(g.title)}`}. Each Bob plays with his own look.</p><ul class="adv-char-list">${g.party.map((c) => card(isHumanSeat(c) ? (c.look || encodeParts(DEFAULT_PARTS)) : c.who === 'net' ? 'bot' : (settings().look || 'sysop'), c.name, `${esc(c.className)}${c.who === 'you' ? ' · you' : c.who === 'friend' ? ' · a friend' : c.who === 'net' ? ' · his own Bob' : ' · played by the game master'} · <span aria-label="${c.hearts} of ${c.max || 5} hearts">${hearts(c.hearts, c.max || 5)}</span>${c.trait ? `<br>${esc(c.trait)}` : ''}${c.items?.length ? `<br>Carries ${esc(c.items.join(', '))}` : ''}${c.spells?.length ? `<br>Knows ${esc(c.spells.join(', '))}` : ''}${c.tricks?.length ? `<br>Tricks: ${esc(c.tricks.join(', '))}` : ''}${c.gains?.length ? `<br>⭐ Earned: ${esc(c.gains.join(', '))}` : ''}`)).join('')}</ul>` : '<p class="muted">No party yet. Start a game and they turn up here.</p>';
    } else if (chars.tab === 'met') {
      const list = v?.game?.met?.length ? v.game.met : (v?.met || []);
      bodyHtml = list.length ? `<p class="muted">${v?.game?.met?.length ? 'Everyone the game master has brought on in this game.' : 'Everyone and everything you have run into, across your games.'} Drawn by me the moment they're named.</p><ul class="adv-char-list">${list.map((m) => card(m.look, m.name, `${m.kind === 'enemy' ? `⚔ ${esc(v?.enemies?.find((e) => e.id === m.type)?.name || 'enemy')}` : m.kind === 'creature' ? 'creature' : 'person'}${m.scene ? ` · met at ${esc(m.scene)}` : ''}${m.game && !v?.game ? ` · ${esc(m.game)}` : ''}`, v?.game ? '' : `<div class="row">${chars.ask === m.id ? `<span>Forget ${esc(m.name)}?</span> <button type="button" class="mini danger" data-met-forget="${esc(m.id)}">Forget for good</button><button type="button" class="link" data-chars-keep>Keep it</button>` : `<button type="button" class="mini" data-chars-ask="${esc(m.id)}">Forget</button>`}</div>`)).join('')}</ul>` : '<p class="muted">Nobody yet. Whoever the game master names in a scene lands here, drawn.</p>';
    } else {
      bodyHtml = `<p class="muted">The usual suspects, with how many hearts they have and what to know. The game master uses these as written and invents the rest.</p><ul class="adv-char-list">${(v?.enemies || []).map((e) => card(e.look, e.name, `<span aria-label="${e.hearts} heart${e.hearts === 1 ? '' : 's'}">${hearts(e.hearts, e.hearts)}</span> · ${esc(e.attack)}<br><em>${esc(e.trick)}</em><br>${esc(e.flavour)}`)).join('')}</ul>`;
    }
    return `<section class="adv-chars-page">${bar}${bodyHtml}${msg ? `<p class="adv-msg" role="alert">${esc(msg)}</p>` : ''}</section>`;
  }

  // ---------- The table ----------
  const isHuman = (c) => c?.who === 'you' || c?.who === 'friend';
  function logHtml(g) {
    return g.log.map((l) => {
      if (l.who === 'gm') return `<div class="adv-gm"><span class="adv-who">🎲 Game master${l.recap ? ' <span class="tag">Last time</span>' : ''}</span>${render(l.text)}</div>`;
      if (l.who === 'ooc') return `<div class="adv-ooc"><span class="adv-who">❓ You asked: ${esc(l.q)}</span>${render(l.text)}</div>`;
      if (l.who === 'app') return `<p class="adv-app ${l.reward ? 'adv-reward' : 'muted'}">${esc(l.text)}</p>`;
      const who = g.party.find((c) => c.id === l.id);
      return `<div class="adv-turn ${l.who === 'you' ? 'you' : ''}"><span class="adv-who">${esc(l.name)}${l.by === 'net' ? ' <span class="tag">his own Bob</span>' : l.who === 'player' ? ' <span class="tag">played by the game master</span>' : who?.who === 'friend' ? ' <span class="tag">a friend</span>' : ''}</span><p>${esc(l.text)}</p>${l.dice ? `<p class="adv-dice">🎲 ${esc(l.dice)}</p>` : ''}</div>`;
    }).join('');
  }
  const heartsSpan = (n, max, who) => `<span class="adv-hearts" aria-label="${esc(who)}: ${n} of ${max} hearts">${hearts(n, max)}</span>`;
  function partyHtml(g) {
    return `<ul class="adv-party" aria-label="The party">${g.party.map((c, i) => `<li class="${i === g.turn && g.status === 'playing' ? 'turn' : ''}${c.out ? ' out' : ''}" title="${esc(c.trait)}">${sprite(c)}<div><strong>${esc(c.name)}</strong><br><span class="muted">${esc(c.className)}${c.who === 'you' ? ' · you' : c.who === 'friend' ? ' · a friend' : ''}${c.gains?.length ? ` · ⭐${c.gains.length}` : ''}</span><br>${heartsSpan(c.hearts, c.max || 5, c.name)}${c.out ? '<br><span class="tag">out</span>' : ''}${i === g.turn && g.status === 'playing' ? '<br><span class="tag">turn</span>' : ''}</div></li>`).join('')}</ul>`;
  }
  // 1.5.204 Fights you can see: the enemies in the scene with their hearts (the app keeps the count).
  function foesHtml(g) {
    const foes = g.foes || [];
    if (!foes.length) return '';
    return `<ul class="adv-party adv-foes" aria-label="Enemies">${foes.map((f) => `<li class="${f.hearts ? '' : 'out'}${hitFlash.has(f.id) && !motionOff() ? ' hit' : ''}"><canvas class="adv-face" width="48" height="48" data-look="${esc(f.look)}" aria-hidden="true"></canvas><div><strong>${esc(f.name)}</strong><br>${heartsSpan(f.hearts, f.max, f.name)}${f.hearts ? '' : '<br><span class="tag">down</span>'}</div></li>`).join('')}</ul>`;
  }
  // 1.5.206 The world book: people, places, promises and open threads the game master keeps.
  function worldHtml(g) {
    const w = g.world || {};
    const kinds = Object.keys(WORLD_NAMES).filter((k) => (w[k] || []).length);
    if (!kinds.length) return '<strong>📚 World book</strong><p class="muted">Empty so far. The game master writes down people, places, promises and open threads as the story goes.</p>';
    return `<strong>📚 World book</strong>${kinds.map((k) => `<p><em>${WORLD_NAMES[k]}</em><br>${w[k].map((e) => `<strong>${esc(e.name)}</strong>${e.note ? `: ${esc(e.note)}` : ''}`).join('<br>')}</p>`).join('')}`;
  }
  function journalHtml(g) {
    const open = (g.quests || []).filter((q) => !q.done), done = (g.quests || []).filter((q) => q.done);
    const me = g.party.filter(isHuman);
    return `<div class="adv-journal">
      <strong>📜 Quest log</strong>
      ${open.length || done.length ? `<ul class="adv-quests">${open.map((q) => `<li>☐ ${esc(q.text)}${q.scene ? ` <span class="muted">(${esc(q.scene)})</span>` : ''}</li>`).join('')}${done.map((q) => `<li class="done">☑ <s>${esc(q.text)}</s></li>`).join('')}</ul>` : '<p class="muted">Nothing on it yet. The game master adds what the party sets out to do.</p>'}
      ${worldHtml(g)}
      <strong>The story so far</strong><p>${esc(g.summary || 'Nothing written down yet; I sum things up every three scenes.')}</p>
      ${me.map((c) => `<p><strong>${esc(c.name)}</strong> <span class="muted">${esc(c.className)} · Might ${c.stats.might} · Wits ${c.stats.wits} · Charm ${c.stats.charm} · Luck ${c.stats.luck}</span>${c.items?.length ? `<br>🎒 ${esc(c.items.join(', '))}` : ''}${c.spells?.length ? `<br>✨ ${esc(c.spells.join(', '))}` : ''}${c.tricks?.length ? `<br>🃏 ${esc(c.tricks.join(', '))}` : ''}${c.gains?.length ? `<br>⭐ ${esc(c.gains.join(', '))}` : ''}</p>`).join('')}
      ${g.scenes.length ? `<p class="muted">${g.scenes.map((s) => `Scene ${s.n}: ${esc(s.title)}`).join(' · ')}</p>` : ''}</div>`;
  }
  function askHtml() {
    if (v.asking) return '<p class="muted adv-ask-wait">❓ The game master is answering…</p>';
    if (!askOpen) return '';
    return `<div class="adv-ask"><label><strong>Ask the game master</strong> <span class="muted">Out of character, and it doesn't use your turn: a recap, a rule, what's in the room.</span><input type="text" data-ask-q maxlength="300" placeholder="What did the innkeeper say about the well?" aria-label="Your question"></label><div class="row"><button type="button" class="yes" data-ask-go>Ask</button><button type="button" data-ask-close>Never mind</button></div></div>`;
  }
  function sayHtml() {
    return `<div class="adv-say"><label><strong>Or say it your way</strong> <span class="muted">Type what you do; the words decide which stat rolls.</span><textarea rows="2" maxlength="400" data-say aria-label="Say what you do" placeholder="I kick the table over and dive behind it…">${esc(sayDraft)}</textarea></label>
      <div class="row"><button type="button" class="yes" data-say-go>🎲 Do it</button>${micOk ? `<button type="button" data-mic aria-pressed="${micOn}">${micOn ? '⏹ Stop' : '🎤 Speak it'}</button>` : ''}<span class="muted" aria-live="polite">${esc(micNote)}</span></div></div>`;
  }
  function handHtml(g) {
    if (!v.waitingFor) return '';
    const me = g.party.find((c) => c.id === v.waitingFor);
    const cards = g.cards || [];
    const whose = me?.who === 'friend' ? ` <span class="tag">a friend</span> <span class="muted">Play it here, or on their phone.</span>` : '';
    if (picked && picked.card && !picked.done) {
      const sec = g.second?.[picked.card];
      if (sec && !picked.pick && !picked.skipSecond) {
        return `<div class="adv-hand"><p><strong>${CARD_ICONS[picked.card]} ${CARD_NAMES[picked.card]}: ${esc(sec.ask)}</strong></p>
          <div class="adv-cards">${sec.choices.map((c) => `<button type="button" class="adv-card" data-pick="${esc(c)}">${esc(c)}</button>`).join('')}<button type="button" class="adv-card other" data-pick="">${esc(sec.free)}</button></div>
          <div class="row"><button type="button" data-back>← Back</button></div></div>`;
      }
      const up = (g.foes || []).filter((f) => f.hearts > 0);
      const aim = picked.card === 'attack' && up.length ? `<p class="adv-sub">Aim at</p><div class="adv-choices" role="radiogroup" aria-label="Aim at">${up.map((f, i) => `<button type="button" role="radio" aria-checked="${(picked.target || up[0].name) === f.name}" data-target="${esc(f.name)}">${esc(f.name)} ${hearts(f.hearts, f.max)}</button>`).join('')}</div>` : '';
      const od = g.odds?.[picked.card];
      return `<div class="adv-hand"><p><strong>${CARD_ICONS[picked.card]} ${CARD_NAMES[picked.card]}${picked.pick ? ` (${esc(picked.pick)})` : ''}</strong> <span class="muted">rolls ${CARD_STATS[picked.card]}${od ? `: ${esc(od.words)}, ${od.any}% at least a hit at a cost. A good line adds +2.` : ''}</span></p>
        ${aim}
        <label><strong>How does it play out?</strong> <span class="muted">Optional. A good line earns +2.</span><textarea rows="2" maxlength="400" data-flair aria-label="How does it play out?" placeholder="${picked.card === 'other' ? 'Say what you do…' : 'Add some flair…'}"></textarea></label>
        <div class="row"><button type="button" class="big yes" data-go>🎲 Roll it</button><button type="button" data-skip>Skip the flair, just roll</button><button type="button" data-back>← Back</button></div></div>`;
    }
    return `<div class="adv-hand"><p><strong>${esc(me?.name || 'Your')}'s turn.</strong>${whose} <span class="muted">Pick a card; the app rolls for you. Cards that don't fit this scene are left out.</span></p>
      <p class="muted adv-odds-note">The number on a card is what the die needs for a hit, and about how likely that is. ${tip('d20 plus the stat: 15 or more is a hit. So with Might 4 the die needs 11 or more, about 50%. Plot armour is counted in. A good line of flair adds +2 on top.', 'Odds on the cards')}</p>
      <div class="adv-cards">${cards.map((c) => `<button type="button" class="adv-card ${c === 'other' ? 'other' : ''}" data-card="${c}"><span class="adv-ico">${CARD_ICONS[c]}</span>${CARD_NAMES[c]}<span class="muted">${CARD_STATS[c]}${g.second?.[c] ? ' ›' : ''}</span>${g.odds?.[c] ? `<span class="adv-odds" title="${esc(g.odds[c].words)}">${g.odds[c].need > 20 ? '—' : `${g.odds[c].need}+`} · ${g.odds[c].hit}%</span>` : ''}</button>`).join('')}</div>
      ${sayHtml()}
      <div class="row adv-row"><button type="button" class="mini" data-ask-open aria-expanded="${askOpen}" ${v.asking ? 'disabled' : ''}>❓ Ask the game master</button></div>
      ${askHtml()}</div>`;
  }
  // The picture behind the story: this scene's own, else the one for this kind of scene.
  function backdrop(g) {
    const sc = g.scenes[g.scenes.length - 1];
    const key = g.kind === 'fight' ? 'fight' : g.kind === 'talk' ? 'talk' : 'place';
    return (g.extras?.scenePics && sc?.pic) || g.props?.[`picture:${key}`] || g.props?.['picture:place'] || '';
  }
  function gameHtml(g) {
    const prep = g.prep;
    const busy = v.busy === 'prep' && prep ? '' : v.busy === 'gm' ? '🎲 The game master is thinking…' : v.busy === 'player' ? `${esc(g.party[g.turn]?.name || 'A Bob')} is deciding…` : '';
    const scene = g.scenes[g.scenes.length - 1];
    const bg = backdrop(g);
    const hasMusic = g.extras?.music && (g.props?.['music:calm'] || g.props?.['music:fight']);
    return `<section class="adv-game${bg ? ' adv-has-bg' : ''}"${bg ? ` style="--adv-bg:url('${esc(bg)}')"` : ''}>
      <div class="adv-top"><div><strong>${esc(g.title)}</strong><br><span class="muted">${esc(g.settingText)}${scene ? ` · Scene ${scene.n}: ${esc(scene.title)}` : ''} · round ${g.round}</span></div>
        <span class="adv-fill"></span>
        ${g.status === 'playing' ? '<button type="button" data-pause>⏸ Pause</button>' : g.status === 'paused' ? '<button type="button" class="yes" data-resume>▶ Resume</button>' : ''}
        ${hasMusic || g.extras?.sounds || g.extras?.voice ? `<button type="button" data-hush aria-pressed="${hush}" title="Quiet: music, sounds and reading aloud stop until you press it again">${hush ? '🔇 Quiet' : '🔊 Sound'}</button>` : ''}
        <button type="button" data-journal aria-pressed="${journal}">📓 Journal</button>
        <button type="button" data-chars-open>📖 Characters</button>
        ${g.status === 'over' ? `<button type="button" data-storybook="${esc(g.id)}">📕 Storybook</button>` : ''}
        <button type="button" data-end>${g.status === 'over' ? 'Close' : '🏁 End game'}</button></div>
      ${journal ? journalHtml(g) : ''}
      ${prep ? `<div class="adv-prep" role="status"><strong>🎨 Setting the table:</strong> ${esc(prep.what || 'getting ready')} <span class="muted">(${Math.min(prep.done + 1, prep.total)} of ${prep.total})</span><span class="adv-fill"></span><button type="button" class="mini" data-skip-prep>Skip the rest</button></div>` : ''}
      ${partyHtml(g)}
      ${foesHtml(g)}
      <div class="adv-log" id="adv-log">${logHtml(g)}<div class="adv-live" id="adv-live" hidden></div></div>
      ${busy ? `<p class="adv-busy muted">${busy}</p>` : ''}
      ${v.fate ? `<div class="adv-hand adv-fate"><p><strong>${esc(v.fate.name)} is at zero hearts.</strong> Your call.</p><div class="row"><button type="button" class="big" data-fate="style">Go out in style</button><button type="button" class="big yes" data-fate="captured">Wake up captured</button></div></div>` : ''}
      ${v.takeBack && g.status === 'playing' ? `<div class="adv-hand adv-takeback" role="status"><p><strong>The dice roll in a moment.</strong> <span class="muted">Picked the wrong card?</span></p><div class="row"><button type="button" class="big" data-take-back>↩ Take that back</button><button type="button" class="yes" data-roll-now>🎲 Roll now</button></div></div>` : ''}
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

  // 1.5.204 The music for this kind of scene, the PC's own sounds, and reading the game master's new words aloud.
  function syncFx() {
    const g = v?.game, x = g?.extras || {};
    if (!g || g.status !== 'playing' || !open) { fx.music.stop(); fx.reader.stop(); return; }
    fx.sounds.setOn(!hush); fx.music.setOn(!hush && x.music); fx.reader.setOn(!hush && x.voice);
    fx.sounds.setUrls({ steel: g.props?.['sfx:steel'], spell: g.props?.['sfx:spell'], door: g.props?.['sfx:door'] });
    if (x.music && !hush && !g.prep) fx.music.play(g.props?.[`music:${g.kind === 'fight' ? 'fight' : 'calm'}`] || g.props?.['music:calm']);
    const gmLines = g.log.filter((l) => l.who === 'gm' || l.who === 'ooc');
    if (spokenGame !== g.id) { spokenGame = g.id; spokenCount = gmLines.length; return; } // a game opened mid-way starts reading from now
    if (x.voice && !hush) for (const l of gmLines.slice(spokenCount)) fx.reader.say(l.text);
    spokenCount = gmLines.length;
  }
  // Streamed words: shown as they come, then replaced by the saved line on the next state.
  function onEvent(ev) {
    if (ev.ev === 'state') { v = { ...v, ...ev }; live = new Map(); if (!v.waitingFor) { picked = null; askOpen = false; } msg = ''; if (ev.game && !ev.busy && !ev.waitingFor && v.fate && ev.game.status !== 'playing') v.fate = null; draw(); syncFx(); return; }
    if (ev.ev === 'token') {
      const cur = live.get(ev.who) || { text: '' }; cur.text += ev.text; live.set(ev.who, cur);
      const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<span class="adv-who">${ev.who === 'gm' ? '🎲 Game master' : ev.who === 'ask' ? '❓ The game master answers' : esc(v?.game?.party.find((c) => c.id === ev.who)?.name || 'A Bob')}</span><p>${esc(cur.text.replace(/<<<[\s\S]*$/, ''))}</p>`; const log = $('adv-log'); if (log) log.scrollTop = log.scrollHeight; }
      return;
    }
    if (ev.ev === 'roll') {
      const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<p class="adv-dice adv-roll">🎲 ${esc(ev.name)}: ${esc(ev.text)}</p>`; }
      const x = v?.game?.extras || {};
      // 1.5.204: the die on screen and the sounds, when ticked for this game.
      if (x.sounds && !hush) { fx.sounds.play('dice'); setTimeout(() => fx.sounds.play(ev.roll?.outcome === 'miss' ? 'miss' : ev.card === 'magic' ? 'spell' : ev.roll?.outcome === 'cost' ? 'cost' : 'hit'), x.dice ? 750 : 250); if (ev.hit && !ev.hit.hearts) setTimeout(() => fx.sounds.play('down'), 1100); }
      if (x.dice && ev.roll) rollDie(dlg, { die: ev.roll.die, natural: ev.roll.natural, outcome: ev.roll.outcome, label: ev.name, still: motionOff() });
      if (ev.hit?.id) { hitFlash.add(ev.hit.id); const f = v?.game?.foes?.find((y) => y.id === ev.hit.id); if (f) f.hearts = ev.hit.hearts; draw(); setTimeout(() => { hitFlash.delete(ev.hit.id); draw(); }, 1200); }
      return;
    }
    if (ev.ev === 'reward') { if (v?.game?.extras?.sounds && !hush) fx.sounds.play('reward'); return; }
    if (ev.ev === 'fate') { v = { ...v, fate: { who: ev.who, name: ev.name } }; draw(); return; }
    if (ev.ev === 'standin') { msg = ev.text; draw(); return; }
    if (ev.ev === 'announce') { const l = $('adv-live'); if (l) { l.hidden = false; l.innerHTML = `<p class="muted">${esc(ev.text)}</p>`; } }
  }
  window.addEventListener('bob-adventure', (e) => onEvent(e.detail));

  async function call(url, data) { try { v = { ...v, ...(await api(url, data)) }; msg = ''; } catch (e) { msg = e.message; } draw(); }
  body.addEventListener('click', async (e) => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.setting) { you.setting = t.dataset.setting; if (you.story && !['pick', 'own'].includes(you.setting) && (v?.starts || []).find((s) => s.id === you.story)?.setting !== you.setting) you.story = ''; draw(); return; }
    if ('story' in t.dataset) { you.story = t.dataset.story; draw(); return; }
    if (t.dataset.tone) { you.tone = t.dataset.tone; draw(); return; }
    if ('takeBack' in t.dataset) return call('/api/adventure/takeback', {});
    if ('rollNow' in t.dataset) return call('/api/adventure/takeback', { now: true });
    if (t.dataset.storybook) { try { window.open(`/api/adventure/storybook/${encodeURIComponent(t.dataset.storybook)}`, 'bob-storybook', 'popup,width=860,height=900'); } catch {} return; }
    if ('friendAdd' in t.dataset) { if (friends.length < 3) friends.push({ name: '', cls: ['bard', 'ranger', 'cleric'][friends.length % 3], armour: 'some' }); draw(); body.querySelector(`[data-friend="${friends.length - 1}"][data-fk="name"]`)?.focus(); return; }
    if (t.dataset.friendDel) { friends.splice(Number(t.dataset.friendDel), 1); draw(); return; }
    if ('target' in t.dataset) { picked = { ...picked, target: t.dataset.target }; draw(); return; }
    if ('sayGo' in t.dataset) { const words = (body.querySelector('[data-say]')?.value || '').trim(); if (!words) { msg = 'Say what you do first.'; draw(); return; } sayDraft = ''; picked = { card: 'say', done: true }; await call('/api/adventure/act', { card: 'say', words }); return; }
    if ('mic' in t.dataset) { try { await voice?.push(); } catch (e) { micOn = false; micNote = /denied|allowed|permission/i.test(e.message) ? 'The microphone is blocked for this window.' : e.message; draw(); } return; }
    if ('askOpen' in t.dataset) { askOpen = !askOpen; draw(); body.querySelector('[data-ask-q]')?.focus(); return; }
    if ('askClose' in t.dataset) { askOpen = false; draw(); return; }
    if ('askGo' in t.dataset) { const q = (body.querySelector('[data-ask-q]')?.value || '').trim(); if (!q) return; askOpen = false; await call('/api/adventure/ask', { q }); return; }
    if ('skipPrep' in t.dataset) return call('/api/adventure/skip', {});
    if ('hush' in t.dataset) { hush = !hush; if (hush) { fx.music.stop(); fx.reader.stop(); } draw(); syncFx(); return; }
    if (t.dataset.pace) { you.pace = t.dataset.pace; draw(); return; }
    if ('youLook' in t.dataset) { lookOpen = !lookOpen; draw(); return; }
    if ('charsOpen' in t.dataset) { chars = { tab: 'you' }; draw(); return; }
    if ('journey' in t.dataset) { openJourney({ api, you, characters: v?.characters || [], enemies: v?.enemies || [] }); return; } // 1.5.206
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
      await call('/api/adventure/start', { setting: you.setting || 'fantasy', settingText: body.querySelector('[data-setting-text]')?.value || you.settingText || '', story: you.story || '', tone: you.tone || 'normal', keepOut: body.querySelector('[data-keep-out]')?.value || you.keepOut || '', pace: you.pace || 'evening', you: { name: you.name || 'Hero', cls: you.cls, trait: you.trait, armour: you.armour, look: you.look || '', charId: you.savedId || '' }, friends: friends.map((f, i) => ({ name: f.name || `Friend ${i + 1}`, cls: f.cls, armour: f.armour })), bobs, extras: ex || {} });
      spokenGame = ''; syncFx();
      return;
    }
    if (t.dataset.continue) return call('/api/adventure/continue', { id: t.dataset.continue });
    if (t.dataset.delete) { if (!confirm('Delete this campaign for good?')) return; return call('/api/adventure/delete', { id: t.dataset.delete }); }
    if ('pause' in t.dataset) { fx.music.stop(); fx.reader.stop(); return call('/api/adventure/pause', {}); }
    if ('resume' in t.dataset) return call('/api/adventure/resume', {});
    if ('journal' in t.dataset) { journal = !journal; draw(); return; }
    if ('end' in t.dataset) { if (v.game.status !== 'over' && !confirm('End the game? The campaign stays saved under Continue.')) return; fx.music.stop(); fx.reader.stop(); await call('/api/adventure/end', { keep: true }); players = null; return load(); }
    if (t.dataset.fate) { v.fate = null; return call('/api/adventure/fate', { choice: t.dataset.fate }); }
    if (t.dataset.card) { picked = { card: t.dataset.card }; draw(); return; }
    if ('pick' in t.dataset) { picked = { ...picked, pick: t.dataset.pick, skipSecond: t.dataset.pick === '' }; draw(); body.querySelector('[data-flair]')?.focus(); return; }
    if ('back' in t.dataset) { picked = picked?.pick || picked?.skipSecond ? { card: picked.card } : null; if (picked && !v.game.second?.[picked.card]) picked = null; draw(); return; }
    if ('go' in t.dataset || 'skip' in t.dataset) {
      const flair = 'go' in t.dataset ? body.querySelector('[data-flair]')?.value || '' : '';
      const p = picked; picked = { ...picked, done: true };
      await call('/api/adventure/act', { card: p.card, pick: p.pick || '', flair, target: p.card === 'attack' ? p.target || (v.game.foes || []).find((f) => f.hearts > 0)?.name || '' : '' });
      return;
    }
  });
  body.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.you) { you[el.dataset.you] = el.value; if (el.dataset.you === 'cls') draw(); return; }
    if (el.dataset.draft && chars?.draft) { chars.draft[el.dataset.draft] = el.value; return; }
    if ('savedChar' in el.dataset) { const c = (v?.characters || []).find((x) => x.id === el.value); if (c) { Object.assign(you, { name: c.name, cls: c.cls, trait: c.trait, armour: c.armour, look: c.look || you.look, savedId: c.id }); } draw(); return; }
    if (el.dataset.extra) { ex = { ...(ex || {}), [el.dataset.extra]: el.checked }; if (el.dataset.extra === 'pictures' && !el.checked) ex.scenePics = false; draw(); return; }
    if (el.dataset.friend && el.dataset.fk) { const f = friends[Number(el.dataset.friend)]; if (f) f[el.dataset.fk] = el.value; return; }
    if (el.dataset.player) { party.get(el.dataset.player).ticked = el.checked; return; }
    if (el.dataset.playerCls) { party.get(el.dataset.playerCls).cls = el.value; return; }
    if (el.dataset.playerArmour) { party.get(el.dataset.playerArmour).armour = el.value; return; }
  });
  body.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.ctrlKey && e.target.matches('[data-flair]')) body.querySelector('[data-go]')?.click();
    if (e.key === 'Enter' && e.ctrlKey && e.target.matches('[data-say]')) body.querySelector('[data-say-go]')?.click();
    if (e.key === 'Enter' && e.target.matches('[data-ask-q]')) { e.preventDefault(); body.querySelector('[data-ask-go]')?.click(); }
  });
  // Typing survives a redraw: the say-it box, a friend's name and your own setting are kept as you type.
  body.addEventListener('input', (e) => {
    const el = e.target;
    if (el.matches('[data-say]')) sayDraft = el.value;
    else if (el.matches('[data-setting-text]')) you.settingText = el.value;
    else if (el.matches('[data-keep-out]')) you.keepOut = el.value;
    else if (el.dataset.friend && el.dataset.fk === 'name') { const f = friends[Number(el.dataset.friend)]; if (f) f.name = el.value; }
  });
  dlg.addEventListener('close', () => { open = false; fx.music.stop(); fx.reader.stop(); });

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
