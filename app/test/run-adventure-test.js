// 1.5.119 🎲 Adventure: the house rules (auto-roll, plot armour, hearts, flair), the game master's hidden JSON line,
// second cards, the game loop with a fake brain (turns in order, the owner's card, a Bob player's words, Bob-Net
// stand-in, pause lets the brain go), the route, saved campaigns, opt-in (nothing runs until a game starts), Help.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { rollAction, heartsLost, flairBonus, outcomeOf, cleanSheet, cardFromWords, parseGm, secondCard, gmSystem, turnPrompt, playerSystem, cleanAdventure, gmBrain, refusal, Adventure, adventureRoute, listGames, loadGame, CARDS, CLASSES, ARMOUR, STAT_POINTS, statPoints, HEARTS, DEFAULT_CARDS, STARTS, START_IDS, SETTINGS, cleanExtras, memoryLines, recapPrompt, isHuman, MAX_HEARTS, listCharacters, gmMeta, odds, oddsWords, fairHearts, storybookHtml, worldLines, TONES, LINE_AGAIN, deleteGame } from '../src/adventure.js';
import { HELP } from '../public/help-content.js';
import { plainText, settingsNow } from '../src/self-help.js';
import { SETTING_KEYS, mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const fixed = (...dice) => { let i = 0; return () => ((dice[i++ % dice.length] - 1) + 0.5) / 20; };

// ---- the dice ----
check('d20 + stat: 15 and up is a hit, 10-14 at a cost, under 10 a miss', outcomeOf(15) === 'hit' && outcomeOf(14) === 'cost' && outcomeOf(10) === 'cost' && outcomeOf(9) === 'miss');
{ const r = rollAction({ stat: 3, armour: 'none', rnd: fixed(12) }); check('a plain roll adds the stat', r.die === 12 && r.total === 15 && r.outcome === 'hit' && !r.rerolled && !r.floored); }
{ const r = rollAction({ stat: 2, armour: 'some', rnd: fixed(3, 17) }); check('Some: one bad roll a scene is rolled again', r.rerolled && r.die === 17 && r.total === 19 && r.natural === 3); }
{ const r = rollAction({ stat: 2, armour: 'some', rerollUsed: true, rnd: fixed(3, 17) }); check('Some: the reroll is once a scene', !r.rerolled && r.total === 5 && r.outcome === 'miss'); }
{ const r = rollAction({ stat: 1, armour: 'lots', rnd: fixed(2) }); check('Lots: held up to 8 (still a miss, with a cost in the story)', r.floored && r.total === 8 && r.outcome === 'miss'); }
{ const r = rollAction({ stat: 1, armour: 'legendary', rnd: fixed(2) }); check('Legendary: never below 12 (a hit at a cost)', r.floored && r.total === 12 && r.outcome === 'cost'); }
{ const r = rollAction({ stat: 5, bonus: 2, armour: 'none', rnd: fixed(8) }); check('flair adds +2', r.total === 15 && r.bonus === 2); }
check('flair earns +2 only when it is more than a word or two', flairBonus('I vault the table and swing for the rafters') === 2 && flairBonus('hit it') === 0 && flairBonus('') === 0);
check('hearts: a miss in a fight costs one, a natural 1 two, a hit none, nothing outside a fight', heartsLost({ outcome: 'miss', natural: 7 }) === 1 && heartsLost({ outcome: 'miss', natural: 1 }) === 2 && heartsLost({ outcome: 'hit', natural: 1 }) === 0 && heartsLost({ outcome: 'miss', natural: 1 }, { fight: false }) === 0);
check('hearts: with Lots or Legendary the last heart never goes', heartsLost({ outcome: 'miss', natural: 1 }, { armour: 'lots', hearts: 2 }) === 1 && heartsLost({ outcome: 'miss', natural: 5 }, { armour: 'legendary', hearts: 1 }) === 0 && heartsLost({ outcome: 'miss', natural: 1 }, { armour: 'none', hearts: 1 }) === 1);

// ---- sheets and cards ----
{ const s = cleanSheet({ name: '  Wren  ', cls: 'wizard', trait: 'x'.repeat(200) }, { who: 'you' });
  check('a sheet: class stats spend 12 points, five hearts, a signature item and spells from the class', statPoints(s.stats) === STAT_POINTS && s.hearts === HEARTS && s.items[0] === CLASSES.wizard.item && s.spells.length === CLASSES.wizard.spells.length && s.trait.length === 120 && s.name === 'Wren');
  check('every class spends exactly 12 stat points', Object.values(CLASSES).every((c) => statPoints(c.stats) === STAT_POINTS));
  check('plot armour defaults to Some and only known values are kept', s.armour === 'some' && cleanSheet({ armour: 'legendary' }).armour === 'legendary' && cleanSheet({ armour: 'god' }).armour === 'some' && Object.keys(ARMOUR).length === 4);
  const m = secondCard('magic', s, {}); check('Magic opens a second card with the spells and a free choice', m.ask === 'Which spell?' && m.choices.includes('Firebolt') && m.free === 'Try something new');
  const a = secondCard('attack', s, {}); check('Attack opens a second card with the attacks the kit allows, plus Unarmed', a.choices.includes('Staff, two-handed') && a.choices.at(-1) === 'Unarmed');
  const t = secondCard('talk', s, { here: ['the innkeeper'] }); check("Talk lists who's here from the game master's last line", t.choices[0] === 'the innkeeper');
  check('Defend, Sneak and Look have no second card', secondCard('defend', s, {}) === null && secondCard('sneak', s, {}) === null && secondCard('look', s, {}) === null);
  const f = cleanSheet({ cls: 'fighter' }); check('a fighter has no spells: the Magic card says so instead of lying', secondCard('magic', f, {}).choices[0].startsWith('A trick'));
}
check("a Bob player's words pick the stat to roll (never a card he saw)", cardFromWords('I draw my blade and strike at the nearest goblin') === 'attack' && cardFromWords('I slip into the shadows') === 'sneak' && cardFromWords('I ask the innkeeper about the stranger') === 'talk' && cardFromWords('I hum thoughtfully') === 'other');
check('every card rolls one of the four stats', Object.values(CARDS).every((c) => ['might', 'wits', 'charm', 'luck'].includes(c.stat)));

// ---- the game master's hidden line ----
{ const p = parseGm('The door creaks.\n\n<<<{"cards":["attack","TALK","nope"],"hearts":{"Wren":-1,"Nobody":9},"kind":"fight","next":"Wren","scene":1,"title":"The cellar","here":["a rat king"],"exits":["up the stairs"],"give":{"Wren":"a rusty key"},"teach":{"Wren":["Sleep"]}}>>>');
  check('narration is kept and the JSON line is read, never shown', p.narration === 'The door creaks.' && p.cards.includes('attack') && p.cards.includes('talk') && !p.cards.includes('nope') && p.cards.includes('other'));
  check('hearts, kind, next, scene, here, exits, give and teach come through, oversized values dropped', p.hearts.Wren === -1 && !('Nobody' in p.hearts) && p.kind === 'fight' && p.next === 'Wren' && p.newScene && p.title === 'The cellar' && p.here[0] === 'a rat king' && p.exits[0] === 'up the stairs' && p.give.Wren[0] === 'a rusty key' && p.teach.Wren[0] === 'Sleep');
  const q = parseGm('Just words, no line.'); check('no JSON line: narration only, cards null (the app uses the defaults for the scene)', q.narration === 'Just words, no line.' && q.cards === null && Object.keys(q.hearts).length === 0 && !q.over);
  check('kind end means the story is over', parseGm('Fin.<<<{"kind":"end"}>>>').over === true);
  // 1.5.120: a brain with thinking off dropped the closing >>> and added a stray } on every turn (PC live game).
  { const r = parseGm('You step in.\n\n<<<{"cards":["attack","talk"],"kind":"fight","next":"Sam","scene":1,"title":"The Gilded Goblet","here":["a guard"],"exits":[],"give":{},"take":{},"teach":{}}}');
    check('a missing >>> and an extra } still parse, and nothing of the line reaches the narration', r.narration === 'You step in.' && r.kind === 'fight' && r.title === 'The Gilded Goblet' && JSON.stringify(r.cards) === '["attack","talk","other"]' && r.newScene === true);
    const r2 = parseGm('Words.<<<{"kind": talk fight ,, nope');
    check('a line that never parses is still cut out of the narration, and marked broken', r2.narration === 'Words.' && r2.kind === null && r2.cards === null && r2.broken === true); }
}
{ const game = { settingText: 'Classic fantasy', pace: 'evening', party: [cleanSheet({ name: 'Wren', cls: 'rogue' }, { who: 'you' }), cleanSheet({ name: 'Bobert', cls: 'wizard', who: 'bob' }, { who: 'bob' })] };
  const sys = gmSystem(game, { user: 'Sam' });
  check('the game master knows the house rules', /15 or more is a hit/.test(sys) && /Hearts, not hit points/.test(sys) && /montage/.test(sys) && /never roll/.test(sys) && /<<</.test(sys) && /Legendary = /.test(sys) && /go out in style/.test(sys));
  check('the game master knows the party and who plays whom', /Wren \(Rogue, played by the owner\)/.test(sys) && /Bobert \(Wizard, a Bob I play\)/.test(sys));
  check('the game master narrates in the second and third person, never as a character (1.5.120)', /you are not a character/.test(sys) && /Never write "I" or "my" as the narrator/.test(sys) && /scene: 1 only when the party moves/.test(sys));
  check('no book names, no brands in the prompt', !/bobiverse|wizards of the coast|dungeons & dragons/i.test(sys));
  const tp = turnPrompt({ actor: game.party[0], card: 'attack', pick: 'Thrown knives', flair: 'I throw from the rafters', roll: { die: 12, statId: 'might', stat: 2, bonus: 2, total: 16, outcome: 'hit' }, lost: 0 });
  check("the owner's turn goes to the game master with the card, the pick, the flair and the roll", /plays the Attack card \(Thrown knives\)/.test(tp) && /rafters/.test(tp) && /12 \+ Might 2 \+ 2 for flair = 16: a hit/.test(tp));
  const ps = playerSystem(game.party[1], game, { ownName: 'Bob' });
  check('a Bob player decides for himself, in character, and never rolls', /playing Bobert, a Wizard/.test(ps) && /Decide for yourself/.test(ps) && /Never roll dice/.test(ps) && /No JSON/.test(ps));
}

// ---- settings: defaults, nothing on ----
check('Adventure settings have defaults and only known values', JSON.stringify(cleanAdventure({})) === '{"gm":"biggest","players":"own","extras":{"dice":false,"sounds":false,"voice":false,"pictures":false,"scenePics":false,"portraits":false,"music":false},"rules":{"map":false,"coins":false,"breath":false,"secrets":false,"riddles":false,"badges":false},"difficulty":"normal"}' && cleanAdventure({ gm: 'main', players: 'gm' }).gm === 'main' && cleanAdventure({ gm: 'x', players: 'y' }).players === 'own');
check('table extras are kept when saved, and only known ticks', (() => { const c = { settingsFile: '', agentDir: '' }; mergeSettings(c, { adventure: { extras: { music: true, scenePics: true, bogus: true } } }); return c.adventure.extras.music === true && c.adventure.extras.scenePics === false && !('bogus' in c.adventure.extras); })());
check('the setting is saved under its own key and cleaned', SETTING_KEYS.includes('adventure') && (() => { const c = { settingsFile: '', agentDir: '' }; mergeSettings(c, { adventure: { gm: 'main', players: 'bogus' } }); return c.adventure.gm === 'main' && c.adventure.players === 'own'; })());
check('the game master is the Deep thinking brain when picked, else the main Brain, on the card, thinking off (1.5.120: speed)', gmBrain({ sessionBrains: { deep: 'big' }, models: { bob: 'main' } }).model === 'big' && gmBrain({ models: { bob: 'main' } }).model === 'main' && gmBrain({ adventure: { gm: 'main' }, sessionBrains: { deep: 'big' }, models: { bob: 'main' } }).model === 'main' && gmBrain({ models: { bob: 'main' } }).cpu === false && gmBrain({ models: { bob: 'main' } }).think === false);
check('refused in the Gaming session, and with no brain equipped', /Gaming/.test(refusal({ session: 'light', models: { bob: 'main' } })) && /Equip a Brain/.test(refusal({ session: 'normal', models: {} })) && refusal({ session: 'normal', models: { bob: 'main' } }) === '');
check('Bob can say the Adventure settings', /Adventure/.test(settingsNow({ cfg: {} }.cfg)) && /Biggest brain/.test(settingsNow({})) && /Their own Bob/.test(settingsNow({})) && /Table extras \(ticked on the start card\): none/.test(settingsNow({})) && /Table extras[^;]*: Dice you can see, Music/.test(settingsNow({ adventure: { extras: { dice: true, music: true } } })));

// ---- the game loop with a fake brain ----
function setup({ lenderOk = true, lenderFails = false, lenderHangs = false, takeBackMs = 0, netTimeoutMs = 45000 } = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-adv-'));
  const cfg = { dataDir: tmp, agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), session: 'normal', userName: 'Sam', models: { bob: 'main' }, sessionBrains: { deep: 'big' }, share: { borrow: { bobs: [{ address: '100.64.0.9:7777', name: 'Bob on the Go', passcode: 'x' }] } } };
  const calls = { ensure: [], chat: [], lend: [], done: 0, settle: 0, unload: [] };
  const events = [];
  let gmReplies = [];
  const brain = {
    cfg, broadcast: (ev) => events.push(ev), log: () => {},
    gate: { done: () => { calls.done++; } },
    settle: async (o) => { calls.settle++; calls.settleOpts = o; },
    engine: { loaded: async () => [{ name: 'quick' }], unload: async (m) => { calls.unload.push(m); return [m]; } },
    async ensureModel(model, emit, signal, who, opts) { calls.ensure.push({ model, who, opts }); return model; },
    async chatSafe(o) {
      calls.chat.push(o);
      const sys = o.messages[0].content;
      let text;
      if (/keep the notes/.test(sys)) text = 'Summary so far.';
      else if (/^You are .*, playing /.test(sys)) text = 'I creep along the wall and strike at the shadow.';
      else text = gmReplies.length ? gmReplies.shift() : 'Something happens.<<<{"cards":["attack","talk"],"kind":"fight","next":"Sam"}>>>';
      for (const ch of text.split(' ')) o.onToken?.(ch + ' ');
      return { content: text };
    },
    lenders: {
      bobs: () => cfg.share.borrow.bobs,
      hello: async (b) => ({ ok: lenderOk, why: lenderOk ? '' : 'not reachable', device: 'handheld' }),
      chat: async (b, { messages, onToken }) => { calls.lend.push(messages); if (lenderHangs) return new Promise(() => {}); if (lenderFails) throw new Error('too slow'); const t = 'I shout a greeting and wave my lute.'; onToken?.(t); return { content: t }; }
    }
  };
  const a = new Adventure(brain, { rnd: fixed(12, 12, 12, 12, 12, 12, 12, 12, 12, 12), takeBackMs, netTimeoutMs });
  return { a, brain, cfg, calls, events, tmp, setGm: (r) => { gmReplies = r; } };
}
const tick = (ms = 30) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 200) => { for (let i = 0; i < n; i++) { if (f()) return true; await tick(10); } return false; };

{ const { a, calls, events, cfg, setGm } = setup();
  check('nothing runs until a game is started (no brain loaded, no game)', calls.ensure.length === 0 && a.view().game === null && a.view().saved.length === 0);
  const players = await a.players();
  check('who could play: two copies of me plus every Bob on My other Bobs, with whether he answers', players.length === 3 && players[0].who === 'bob' && players[2].who === 'net' && players[2].ok === true && players[2].address === '100.64.0.9:7777');
  let threw = ''; try { await a.start({ you: { name: 'Sam' }, bobs: [] }); } catch (e) { threw = e.message; }
  check('a game needs at least one Bob at the table', /Tick at least one Bob/.test(threw));
  setGm(['The tavern is loud.<<<{"cards":["talk","look"],"kind":"talk","next":"Sam","scene":1,"title":"The tavern","here":["the innkeeper"]}>>>']);
  await a.start({ setting: 'fantasy', pace: 'short', you: { name: 'Sam', cls: 'rogue', armour: 'some' }, bobs: [{ who: 'bob', name: 'Bobert', cls: 'wizard', armour: 'lots' }, { who: 'net', name: 'Bob on the Go', address: '100.64.0.9:7777', cls: 'bard', armour: 'none' }] });
  check('the game master brain loads for the game: Deep thinking, on the card, thinking off, 32K', calls.ensure[0].model === 'big' && calls.ensure[0].opts.cpu === false && calls.chat[0].think === false && calls.chat[0].ctx === 32768);
  await until(() => a.waitingFor);
  let v = a.view();
  check("the opening scene is told, then it's the owner's turn with only the cards that fit (plus Something else)", v.game.log[0].who === 'gm' && v.game.log[0].text === 'The tavern is loud.' && v.waitingFor === v.game.party[0].id && JSON.stringify(v.game.cards) === '["talk","look","other"]' && v.game.scenes[0].title === 'The tavern');
  check("the second card behind Talk lists who's here", v.game.second.talk.choices[0] === 'the innkeeper' && !v.game.second.look);
  check('the Met tab keeps the scene someone was met in, from the very first reply', v.game.met.some((m) => m.name === 'the innkeeper' && m.scene === 'The tavern') && v.game.met.every((m) => m.scene));
  check('the hidden JSON line is never in what the page gets', !events.some((e) => e.ev === 'state' && JSON.stringify(e).includes('<<<')) && !v.game.log.some((l) => /<<</.test(l.text)));
  let bad = ''; try { a.act({ card: 'attack' }); } catch (e) { bad = e.message; }
  check("a card that doesn't fit the scene is refused", /doesn't fit/.test(bad));
  setGm(['You charm the innkeeper.<<<{"cards":[],"kind":"talk","next":"Bobert","give":{"Sam":["a room key"]}}>>>', 'Bobert strikes.<<<{"kind":"fight","next":"Bob on the Go","hearts":{"Bobert":-1}}>>>', 'A song!<<<{"kind":"fight","next":"Sam","cards":["attack","run"],"scene":1,"title":"The brawl"}>>>']);
  a.act({ card: 'talk', pick: 'the innkeeper', flair: 'I lean on the bar and lie through my teeth' });
  await until(() => a.waitingFor);
  v = a.view();
  const mine = v.game.log.find((l) => l.who === 'you');
  check("the owner's turn: the card, the pick and the flair are logged and rolled (d20 12 + Charm 3 + 2 flair = 17, a hit)", mine && /Talk \(the innkeeper\): I lean/.test(mine.text) && mine.roll.total === 17 && mine.roll.outcome === 'hit' && mine.roll.bonus === 2 && /12 \+ Charm 3 \+ 2 flair = 17: a hit/.test(mine.dice));
  check('the game master got the pick and the roll', calls.chat.some((c) => /plays the Talk card \(the innkeeper\)/.test(c.messages.at(-1).content) && /= 17: a hit/.test(c.messages.at(-1).content)));
  check('give: the room key is now on the Use item card', v.game.party[0].items.includes('a room key'));
  const bobert = v.game.log.find((l) => l.who === 'player' && l.name === 'Bobert');
  check('a local Bob is played by the game master brain, in character, and his words pick the stat (attack: Might)', bobert && bobert.by === 'gm' && /strike/.test(bobert.text) && bobert.roll.card === 'attack' && bobert.roll.statId === 'might');
  const go = v.game.log.find((l) => l.who === 'player' && l.name === 'Bob on the Go');
  check('a Bob-Net Bob plays himself through the lend protocol, with his own instructions', go && go.by === 'net' && /lute/.test(go.text) && calls.lend.length === 1 && /playing Bob on the Go, a Bard/.test(calls.lend[0][0].content));
  check('hearts: the game master took one off Bobert (Lots: never the last)', v.game.party[1].hearts === 4);
  check("it's round two and the owner's turn again, with the new scene's cards", v.game.round === 2 && v.waitingFor === v.game.party[0].id && JSON.stringify(v.game.cards) === '["attack","run","other"]' && v.game.sceneCount === 2);
  check('every turn is saved in its own file, not a chat', listGames(cfg).length === 1 && loadGame(cfg, v.game.id).log.length >= 4 && !fs.existsSync(path.join(cfg.dataDir, 'chats')));
  await a.pause();
  check('Pause: the graphics card is given back and the brain settles (lightweight rule), the game keeps its place', calls.done >= 1 && await until(() => calls.settle >= 1) &&
    await until(() => calls.unload.includes('big')) && calls.settleOpts?.noWake === true && a.view().game.status === 'paused' && loadGame(cfg, v.game.id).status === 'paused');
  setGm(['Back to it.<<<{"kind":"fight","next":"Sam","cards":["attack"]}>>>']);
  await a.resume();
  await until(() => a.waitingFor);
  check('Resume loads the brain again and it is the owner\'s turn where we left off', calls.ensure.length >= 2 && a.view().game.status === 'playing' && a.waitingFor);
  const ended = await a.end({ keep: true });
  check('End: game over, saved under Continue, the brain let go', ended.game.status === 'over' && a.view().game === null && listGames(cfg)[0].status === 'over');
  check('Continue brings a saved campaign back with a recap line', (await a.continueGame(listGames(cfg)[0].id)).game.status === 'playing' && a.view().game.log.some((l) => /Picking up/.test(l.text)));
  await a.end({ keep: false });
  check('End without keeping deletes the file', listGames(cfg).length === 0);
}

{ const { a, calls, events, setGm } = setup({ lenderFails: true });
  setGm(['Go.<<<{"cards":["attack"],"kind":"fight","next":"Sam"}>>>', 'Ok.<<<{"kind":"fight","next":"Bob on the Go"}>>>', 'Ok.<<<{"kind":"fight","next":"Sam","cards":["attack"]}>>>']);
  await a.start({ you: { name: 'Sam', cls: 'fighter' }, bobs: [{ who: 'net', name: 'Bob on the Go', address: '100.64.0.9:7777', cls: 'bard' }] });
  await until(() => a.waitingFor);
  a.act({ card: 'attack', pick: 'Two-handed, all in' });
  await until(() => a.view().game.round === 2);
  const go = a.view().game.log.find((l) => l.who === 'player');
  check("when his own Bob can't take the turn, the game master plays him and the page is told", go.by === 'gm' && events.some((e) => e.ev === 'standin' && /couldn't take the turn/.test(e.text)));
  await a.end({ keep: false });
}

{ const { a, setGm } = setup();
  a.cfg.adventure = { players: 'gm' };
  setGm(['Go.<<<{"cards":["attack"],"kind":"fight","next":"Sam"}>>>', 'Ok.<<<{"kind":"fight","next":"Bob on the Go"}>>>', 'Ok.<<<{"kind":"fight","next":"Sam","cards":["attack"]}>>>']);
  await a.start({ you: { name: 'Sam' }, bobs: [{ who: 'net', name: 'Bob on the Go', address: '100.64.0.9:7777' }] });
  await until(() => a.waitingFor); a.act({ card: 'attack' });
  await until(() => a.view().game.round === 2);
  check('"The game master brain" plays every Bob here: nothing goes over the network', a.view().game.log.find((l) => l.who === 'player').by === 'gm' && a.brain.lenders.bobs().length === 1);
  await a.end({ keep: false });
}

// 1.5.120: a game master who says scene: 1 every reply can't end a Short game early
{ const { a, setGm } = setup();
  setGm(['Go.<<<{"cards":["attack"],"kind":"fight","next":"Sam","scene":1,"title":"The gate"}>>>', 'Same place.<<<{"kind":"fight","next":"Bobert","scene":1,"title":"The gate"}>>>', 'Still here.<<<{"kind":"fight","next":"Sam","cards":["attack"],"scene":1,"title":"the gate"}>>>', 'Now the hall.<<<{"kind":"place","next":"Bobert","cards":["look"],"scene":1,"title":"The hall"}>>>']);
  await a.start({ pace: 'short', you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  await until(() => a.waitingFor); a.act({ card: 'attack' });
  await until(() => a.waitingFor && a.view().game.round === 2);
  let v = a.view();
  check('scene: 1 with the same title, or before everyone has had a turn, does not start a scene', v.game.sceneCount === 1 && v.game.status === 'playing');
  a.act({ card: 'attack' });
  await until(() => a.view().game.sceneCount === 2 || a.view().game.status !== 'playing', 100);
  v = a.view();
  check('a new title after a full round does start one', v.game.sceneCount === 2 && v.game.scenes[1].title === 'The hall');
  await a.end({ keep: false });
}

// zero hearts: the owner's call
{ const { a, setGm } = setup();
  setGm(['Go.<<<{"cards":["attack"],"kind":"fight","next":"Sam"}>>>', 'Ouch.<<<{"kind":"fight","next":"Sam","hearts":{"Sam":-5}}>>>', 'Captured.<<<{"kind":"place","next":"Bobert"}>>>', 'Bobert looks for you.<<<{"kind":"place","next":"Sam","cards":["look"]}>>>']);
  await a.start({ you: { name: 'Sam', armour: 'none' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  await until(() => a.waitingFor); a.act({ card: 'attack' });
  await until(() => a.fateWait);
  check('at zero hearts with no plot armour the owner decides: go out in style or wake up captured', Boolean(a.fateWait) && a.view().game.party[0].hearts === 0);
  a.fate({ choice: 'captured' });
  await until(() => a.waitingFor);
  check('captured: back at one heart, still in the game', a.view().game.party[0].hearts === 1 && !a.view().game.party[0].out);
  await a.end({ keep: false });
}

// ---- the route ----
{ const { a, brain } = setup();
  const res = () => { const r = { code: 0, body: null }; return r; };
  const send = (r, code, body) => { r.code = code; r.body = body; };
  let r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: '/api/adventure', brain, body: async () => ({}), send });
  check('GET /api/adventure: the view, with the refusal and the saved list', r.code === 200 && r.body.game === null && 'refusal' in r.body && Array.isArray(r.body.saved));
  r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/act', brain, body: async () => ({ card: 'attack' }), send });
  check("acting when it isn't your turn is a plain 409", r.code === 409 && /isn't your turn/.test(r.body.error));
  r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/settings', brain, body: async () => ({ gm: 'main' }), send, isLocal: false });
  check('settings only from this replicant matrix', r.code === 403);
  r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/settings', brain, body: async () => ({ gm: 'main', players: 'nope' }), send, isLocal: true });
  check('settings saved and cleaned', r.code === 200 && r.body.settings.gm === 'main' && r.body.settings.players === 'own' && brain.cfg.adventure.gm === 'main');
  check('unknown paths are left to the rest of the server', await adventureRoute({ req: { method: 'GET' }, res: res(), p: '/api/other', brain, body: async () => ({}), send }) === false);
}

// ---- Help ----
{ const h = HELP.find((e) => e.id === 'adventure');
  const t = h ? plainText(h.html) : '';
  check('Help has an Adventure section in Bob\'s voice with the rules, the cards and the settings', Boolean(h) && /I run/.test(h.title) && /15 or more/.test(t) && /Plot armour/.test(t) && /Back/.test(t) && /Which brain is the game master/.test(t) && /Who plays the other Bobs/.test(t) && /Nothing runs until/.test(t));
  check('Help FAQ covers playing alone, gaming and remembering', ['faq-adventure-alone', 'faq-adventure-gaming', 'faq-adventure-remember'].every((id) => HELP.some((e) => e.id === id)));
  const g = plainText(HELP.find((e) => e.id === 'glossary').html);
  check('glossary: game master, plot armour, action card, auto-roll, scene, campaign', ['Game master', 'Plot armour', 'Action card', 'Auto-roll', 'Scene', 'Campaign'].every((w) => g.includes(w)));
  const pub = ['src/adventure.js', 'public/adventure.js', 'public/help-content.js', 'docs/releases/v1.5.119.md', 'docs/USER-GUIDE.md'].map((f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n')).join('\n');
  check('no book or other game names in the public files', !/bobiverse|wizards of the coast|dungeons & dragons|dungeon master/i.test(pub));
  check('the page draws cards for the owner only (a Bob player has no hand)', /Bobs don't get cards|Bob player just says/.test(fs.readFileSync(new URL('../public/adventure.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n')));
}

// 1.5.130: End or Pause while the game master is still writing must put the server status back to idle, the
// same state a finished chat turn reaches. (Bug #7: the window title stayed "Bob · Thinking...".)
// The brain here models the status: setState keeps this.state and broadcasts, as the real brain does.
function statusSetup() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-adv-status-'));
  const cfg = { dataDir: tmp, agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), session: 'normal', userName: 'Sam', models: { bob: 'main' }, sessionBrains: { deep: 'big' } };
  const events = [];
  const calls = { settle: 0, settleOpts: undefined, setStates: [] };
  const brain = {
    cfg, log: () => {}, events,
    state: { state: 'idle', detail: '', model: 'main' },
    turns: new Map(), waking: null, queue: [],
    setState(state, detail = '', model = this.state.model, extra = null) {
      calls.setStates.push(state);
      this.state = { state, detail, model, ...(extra || {}) };
      this.broadcast({ type: 'status', ...this.state });
    },
    broadcast: (ev) => events.push(ev),
    gate: { done: () => {} },
    settle: async (o) => { calls.settle++; calls.settleOpts = o; },
    engine: { loaded: async () => [], unload: async () => [] },
    // The game master's model is not loaded yet: loading, then thinking (as src/brain.js ensureModel does).
    async ensureModel(model) { this.setState('loading', '', model); this.setState('thinking', '', model); return model; },
    // The game master's reply blocks until the game aborts it (End or Pause).
    chatSafe(o) { return new Promise((_, rej) => o.signal.addEventListener('abort', () => rej(new Error('aborted')))); },
  };
  brain.setState = brain.setState.bind(brain);
  const a = new Adventure(brain, { rnd: fixed(12), takeBackMs: 0 });
  return { a, brain, calls };
}
const startOpts = { setting: 'fantasy', pace: 'short', you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] };

{ const { a, brain } = statusSetup();
  await a.start(startOpts);
  check('status: the game master is writing (thinking) before End', await until(() => brain.state.state === 'thinking'));
  await a.end({ keep: true });
  await until(() => brain.state.state !== 'thinking');
  await tick(50);
  check('status: End game returns the status to idle (no more "Thinking...")', brain.state.state === 'idle' && brain.state.detail === '', `(now ${brain.state.state})`);
}

{ const { a, brain } = statusSetup();
  await a.start(startOpts);
  await until(() => brain.state.state === 'thinking');
  await a.pause();
  await until(() => brain.state.state !== 'thinking');
  await tick(50);
  check('status: Pause returns the status to idle', brain.state.state === 'idle' && brain.state.detail === '', `(now ${brain.state.state})`);
  await a.end({ keep: false });
}

// Guard tests (negative controls): a chat turn, a wake or a waiting job still running means the status is not Bob's to
// reset. They pass before and after the fix as long as those guards exist.
for (const busy of ['turn', 'waking', 'queued']) {
  const { a, brain, calls } = statusSetup();
  await a.start(startOpts);
  await until(() => brain.state.state === 'thinking');
  if (busy === 'turn') brain.turns.set('talk', { turnId: 'x', sessionId: 's', controller: new AbortController() });
  if (busy === 'waking') brain.waking = new Promise(() => {});
  if (busy === 'queued') brain.queue.push({ id: 'j1', state: 'waiting' });
  await a.end({ keep: false });
  await tick(80);
  check(`status: End does not force idle while a ${busy} is running`, brain.state.state === 'thinking' && calls.settleOpts?.noWake === true, `(now ${brain.state.state})`);
  brain.turns.clear(); brain.waking = null; brain.queue = [];
}

// A new game started right after End: the End reset is deferred, and must not overwrite the new game's status.
// (The old game's aborted reply also reaches fail() here, which pauses the new game: a separate, pre-existing bug, not checked.)
{ const { a, brain } = statusSetup();
  await a.start(startOpts);
  await until(() => brain.state.state === 'thinking');
  await a.end({ keep: true });
  const again = a.start(startOpts);
  await until(() => brain.state.state === 'thinking');
  await tick(50);
  check('status: a new game started right after End keeps Thinking while it runs (the End reset does not clobber it)', brain.state.state === 'thinking', `(now ${brain.state.state})`);
  await again;
  await a.end({ keep: false });
}

// ---- 1.5.204: the Adventure upgrade (enemies' hearts, rewards, quests, your own words, Ask, friends, starts, extras) ----
check('8 ready-made starts, each with a known setting, a name and a hook', START_IDS.length === 8 && START_IDS.every((id) => SETTINGS[STARTS[id].setting] && STARTS[id].name && STARTS[id].hook.length > 20));
check('table extras are all off unless ticked, and scene pictures need pictures', Object.values(cleanExtras({})).every((x) => x === false) && Object.keys(cleanExtras({})).length === 7 && cleanExtras({ scenePics: true }).scenePics === false && cleanExtras({ pictures: true, scenePics: true }).scenePics === true && cleanExtras({ dice: 'yes' }).dice === false);
{ const p = parseGm('Two goblins!<<<{"kind":"fight","foes":{"Goblin":2,"Goblin boss":4,"Dragon":99},"reward":{"Sam":"might"},"quest":{"add":["Find the bell"],"done":"Get out of the cellar"}}>>>');
  check('parseGm: enemies and their hearts (a silly number is dropped), a reward, and the quest log', p.foes.Goblin === 2 && p.foes['Goblin boss'] === 4 && !('Dragon' in p.foes) && p.reward.Sam === 'might' && p.quest.add[0] === 'Find the bell' && p.quest.done[0] === 'Get out of the cellar');
  check('parseGm: no foes said means "not said" (null), not "no enemies"', parseGm('Quiet.<<<{"kind":"place"}>>>').foes === null && JSON.stringify(parseGm('Quiet.<<<{"foes":{}}>>>').foes) === '{}');
}
check('memoryLines: the game master is reminded of enemies standing, the quest log and who was met', (() => { const m = memoryLines({ foes: [{ name: 'Goblin', hearts: 1, max: 2 }, { name: 'Rat', hearts: 0, max: 1 }], quests: [{ text: 'Find the bell', done: false }, { text: 'Escape', done: true }], met: [{ name: 'the miller' }] }); return /Goblin 1\/2/.test(m) && !/Rat/.test(m) && /still open: Find the bell/.test(m) && /done: Escape/.test(m) && /the miller/.test(m); })());
check('"Last time...": the recap asks for a reminder and keeps the scene', /Last time\.\.\./.test(recapPrompt({}, { name: 'Sam' })) && /question for Sam/.test(recapPrompt({}, { name: 'Sam' })) && /scene: 0/.test(recapPrompt({}, {})));
{ const actor = { name: 'Sam', who: 'you', hearts: 5 };
  check('turnPrompt: your own words are passed on as words, and a hit on an enemy is told', /says what they do: "I leap"/.test(turnPrompt({ actor, card: 'attack', words: 'I leap', said: true })) && /Goblin takes 1 heart \(now 1 of 2\)/.test(turnPrompt({ actor, card: 'attack', hit: { name: 'Goblin', dmg: 1, hearts: 1, max: 2 } })));
}
{ const f = cleanSheet({ name: 'Juno', cls: 'bard', who: 'friend', max: 7, hearts: 9 }, { who: 'friend' });
  check('a friend is a human player, with more hearts if they earned them (never more than the most)', f.who === 'friend' && isHuman(f) && !isHuman({ who: 'bob' }) && f.max === 7 && f.hearts === 7 && cleanSheet({ max: 40 }).max === HEARTS && cleanSheet({ max: MAX_HEARTS }).max === MAX_HEARTS);
}
{ const { a, cfg, calls, setGm } = setup();
  setGm(['Goblins in the mill!<<<{"cards":["attack","talk"],"kind":"fight","next":"Sam","scene":1,"title":"The mill","foes":{"Goblin":3},"quest":{"add":["Find the miller\'s daughter"]}}>>>']);
  await a.start({ story: 'miller', pace: 'short', you: { name: 'Sam', cls: 'cleric', armour: 'some' }, friends: [{ name: 'Juno', cls: 'bard' }], extras: { pictures: true, music: true } });
  await until(() => a.waitingFor);
  let v = a.view();
  const sam = v.game.party[0], juno = v.game.party[1];
  check('a ready-made start brings its setting and hook, and a friend sits at the table with a face', a.game.setting === STARTS.miller.setting && v.game.hook === STARTS.miller.hook && juno.who === 'friend' && juno.name === 'Juno' && juno.look && v.game.party.length === 2);
  check('the hook reaches the game master', calls.chat.some((c) => c.messages[0].content.includes(STARTS.miller.hook)));
  check("extras that can't be made here are left out, with a note (and nothing was painted)", v.game.log.some((l) => /Left out: pictures .* music/.test(l.text)) && cfg.adventure.extras.pictures === true);
  check('the enemy is on the table with fair hearts (3 asked, a party of two with Some armour: 2), and the quest log has started', v.game.foes.length === 1 && v.game.foes[0].name === 'Goblin' && v.game.foes[0].hearts === 2 && v.game.foes[0].asked === 3 && v.game.quests[0].text === "Find the miller's daughter" && !v.game.quests[0].done);
  let e = ''; try { a.act({ card: 'attack', seat: juno.id }); } catch (x) { e = x.message; }
  check("a friend's screen can't play someone else's turn", /Sam's turn/.test(e));
  e = ''; try { a.act({ card: 'say', words: '   ' }); } catch (x) { e = x.message; }
  check('Say it your way needs words', /Say what you do first/.test(e));
  setGm(['The goblin is asleep on its feet. (This answer is not a turn.)']);
  a.ask({ q: 'Is the goblin tired?' });
  check('Ask the game master: the table waits while it answers', a.view().asking === true);
  e = ''; try { a.act({ card: 'attack' }); } catch (x) { e = x.message; }
  check('no turn while a question is being answered', /answering your question/.test(e));
  await until(() => !a.asking);
  v = a.view();
  const ooc = v.game.log.find((l) => l.who === 'ooc');
  check("the answer is kept in the log, out of character, and it's still your turn", ooc && ooc.q === 'Is the goblin tired?' && /asleep/.test(ooc.text) && v.waitingFor === sam.id);
  check('a question is never fed back to the game master as story', (() => { const before = calls.chat.length; return a.gmMessages(a.game, 'x').every((m) => !/asleep on its feet/.test(m.content)) && before === calls.chat.length; })());
  setGm(['You cut it down!<<<{"kind":"fight","next":"Juno","foes":{"Goblin":1},"reward":{"Sam":"might"},"quest":{"done":["Find the miller\'s daughter"]}}>>>', 'Juno sings.<<<{"kind":"fight","next":"Sam","foes":{"Goblin":0}}>>>']);
  const mightBefore = sam.stats.might;
  a.act({ card: 'attack', target: 'Goblin', pick: 'Sword' });
  await until(() => a.waitingFor === juno.id);
  v = a.view();
  const hit = v.game.log.find((l) => l.who === 'you' && l.roll)?.roll?.hit;
  check('an attack that lands takes a heart off the enemy it was aimed at', hit && hit.name === 'Goblin' && hit.dmg === 1 && hit.hearts === 1 && calls.chat.some((c) => /Goblin takes 1 heart \(now 1 of 2\)/.test(c.messages.at(-1).content)));
  check('a reward: +1 Might, shown in the log and on the sheet', v.game.party[0].stats.might === mightBefore + 1 && v.game.party[0].gains.includes('+1 Might') && v.game.log.some((l) => l.reward && /Sam earned \+1 Might/.test(l.text)));
  check('what Sam earned is kept with a saved character, for the next game', listCharacters(cfg).some((c) => c.name === 'Sam' && c.gains?.includes('+1 Might') && c.stats.might === mightBefore + 1));
  check('one reward per character per scene', a.reward(a.game, 'Sam', 'heart') === '' && a.game.party[0].max === HEARTS);
  check('the quest is ticked off', v.game.quests[0].done === true);
  check("then it's the friend's turn, on the same table", v.waitingFor === juno.id && v.game.cards?.length > 0);
  a.act({ card: 'say', words: 'I sing a rousing song at the goblin', seat: juno.id });
  await until(() => a.waitingFor === sam.id);
  v = a.view();
  const said = v.game.log.find((l) => l.said);
  check("a friend's own words are logged and rolled like a card", said && said.name === 'Juno' && /💬 I sing/.test(said.text) && said.roll && said.roll.statId);
  check('an enemy at zero hearts is shown as down', v.game.foes[0].hearts === 0);
  check('Skip the rest is harmless when nothing is being made', a.skipPrep().game.id === v.game.id);
  await a.end({ keep: false });
}
{ const { a } = setup();
  const g = { party: [cleanSheet({ name: 'Ox', cls: 'fighter' }, { who: 'bob' })], scenes: [{ title: 'x' }], log: [] };
  check('a reward to a stat already at 5 becomes one more heart', a.reward(g, 'Ox', 'might') === 'one more heart' && g.party[0].max === HEARTS + 1 && g.party[0].stats.might === 5);
  g.scenes.push({ title: 'y' });
  check('a trick reward is kept as a trick', a.reward(g, 'Ox', 'trick: Shield bash') === 'the trick Shield bash' && g.party[0].tricks.includes('Shield bash'));
}

// ---- 1.5.206: items 35 to 42 ----
// 35 The game master's notes survive a broken line.
{ const m = gmMeta('Words.<<<{kind: "fight", "next": "Sam", "hearts": {"Sam": -1},}');
  check('a broken hidden line is mended with the loop repair (no quotes on a key, a stray comma, no closing brace)', m.repaired === true && m.meta.kind === 'fight' && m.meta.hearts.Sam === -1);
  check('a line that is fine is left as it is', gmMeta('x<<<{"kind":"talk"}>>>').meta.kind === 'talk' && !gmMeta('x<<<{"kind":"talk"}>>>').repaired);
  check('asking for the line again names every key', ['cards', 'hearts', 'kind', 'next', 'scene', 'foes', 'quest', 'world'].every((k) => LINE_AGAIN.includes(k))); }
{ const { a, calls, setGm } = setup();
  setGm(['The gate looms.<<<{"cards": [attack talk', '<<<{"cards":["attack","talk"],"kind":"fight","next":"Sam","scene":1,"title":"The gate","foes":{"Troll":3},"hearts":{"Sam":-1}}>>>']);
  await a.start({ you: { name: 'Sam', armour: 'some' }, bobs: [{ who: 'bob', name: 'Bobert' }, { who: 'bob', name: 'Pip' }] });
  await until(() => a.waitingFor);
  const v = a.view();
  check('when the line is still broken the game master is asked once for just the line', calls.chat.filter((c) => c.messages.at(-1).content === LINE_AGAIN).length === 1 && calls.chat.find((c) => c.messages.at(-1).content === LINE_AGAIN).messages.at(-2).content === 'The gate looms.');
  check('and the hearts, scene and enemies from it are kept, the narration untouched', v.game.party[0].hearts === HEARTS - 1 && v.game.scenes[0].title === 'The gate' && v.game.foes[0].name === 'Troll' && v.game.log[0].text === 'The gate looms.' && JSON.stringify(v.game.cards) === '["attack","talk","other"]');
  await a.end({ keep: false });
}
// 36 The world book.
{ const p = parseGm('x<<<{"world":{"people":{"Mara":"innkeeper, owes us"},"places":["The mill: burned down"],"threads":{"The stranger":"paid in old coins"},"drop":["Nobody"]}}>>>');
  check('the world book comes through: people, places (also as "Name: note"), threads, drop', p.world.people.Mara === 'innkeeper, owes us' && p.world.places['The mill'] === 'burned down' && p.world.threads['The stranger'] && p.world.drop[0] === 'Nobody');
  const { a } = setup();
  const g = { party: [], scenes: [{ title: 'The inn' }], log: [], world: {} };
  a.applyWorld(g, p.world);
  a.applyWorld(g, parseGm('x<<<{"world":{"people":{"mara":"now a friend"},"promises":{"Mara":"a free room"},"drop":["The stranger"]}}>>>').world);
  check('a name already there gets its new note, drop takes it out, the scene is kept', g.world.people.length === 1 && g.world.people[0].note === 'now a friend' && g.world.people[0].scene === 'The inn' && g.world.threads.length === 0 && g.world.promises[0].note === 'a free room');
  const mem = memoryLines(g);
  check('the game master reads the world book every turn', /World book/.test(mem) && /People: Mara \(now a friend\)/.test(mem) && /Promises: Mara \(a free room\)/.test(mem) && worldLines({}) === '');
  check('and is told to keep it', /Keep the world book with world/.test(gmSystem({ settingText: 'x', pace: 'short', party: [cleanSheet({ name: 'Sam' })] })));
}
// 37 Odds on the cards.
{ check('odds: Might 4, no armour, needs 11 or more: about 50% (75% at least at a cost)', JSON.stringify(odds(4, { armour: 'none' })) === '{"need":11,"costNeed":6,"hit":50,"any":75}' && oddsWords(odds(4, { armour: 'none' })) === 'needs 11 or more, about 50%');
  check("odds count plot armour: Some's reroll raises the chance, Legendary never misses", odds(2, { armour: 'some' }).hit > odds(2, { armour: 'none' }).hit && odds(1, { armour: 'legendary' }).any === 100 && odds(2, { armour: 'some', rerollUsed: true }).hit === odds(2, { armour: 'none' }).hit);
  const { a, setGm } = setup();
  setGm(['Hi.<<<{"cards":["attack","talk"],"kind":"talk","next":"Sam"}>>>']);
  await a.start({ you: { name: 'Sam', cls: 'fighter', armour: 'none' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  await until(() => a.waitingFor);
  const o = a.view().game.odds;
  check("the page gets the odds for each card in the hand, from the character's stat", o.attack.need === 10 && o.attack.hit === 55 && o.attack.words === 'needs 10 or more, about 55%' && o.talk.need === 13 && o.other);
  await a.end({ keep: false });
}
// 38 Take that back.
{ const { a, calls, setGm } = setup({ takeBackMs: 400 });
  setGm(['Hi.<<<{"cards":["attack","talk"],"kind":"talk","next":"Sam"}>>>', 'Ok.<<<{"kind":"talk","next":"Bobert"}>>>']);
  await a.start({ you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  await until(() => a.waitingFor);
  a.act({ card: 'attack' });
  await until(() => a.view().takeBack);
  let v = a.view();
  check('after a card, "Take that back" is on offer for a few seconds before the dice roll', v.takeBack && v.takeBack.id === v.game.party[0].id && v.takeBack.left > 0 && !v.game.log.some((l) => l.roll));
  let late = ''; try { a.act({ card: 'talk' }); } catch (e) { late = e.message; }
  check('a second card meanwhile is refused with a plain line', /Take that back first/.test(late));
  const before = calls.chat.length;
  a.takeBack({});
  await until(() => a.waitingFor);
  v = a.view();
  check('taken back: no roll, no game master turn, and it is the same turn again', v.waitingFor === v.game.party[0].id && calls.chat.length === before && !v.game.log.some((l) => l.roll) && v.game.log.some((l) => /took that back/.test(l.text)) && !v.game.log.some((l) => /Attack/.test(l.text)));
  a.act({ card: 'talk' });
  await until(() => a.view().takeBack);
  a.takeBack({ now: true });
  await until(() => a.view().game.log.some((l) => l.roll));
  check('"Roll now" rolls straight away', a.view().game.log.some((l) => l.roll && l.roll.card === 'talk'));
  let gone = ''; try { a.takeBack({}); } catch (e) { gone = e.message; }
  check('after the roll it is too late', /Too late/.test(gone));
  await a.end({ keep: false });
}
// 39 A time limit on Bob-Net players.
{ const { a, events, setGm } = setup({ lenderHangs: true, netTimeoutMs: 60 });
  setGm(['Go.<<<{"cards":["attack"],"kind":"fight","next":"Sam"}>>>', 'Ok.<<<{"kind":"fight","next":"Bob on the Go"}>>>', 'Ok.<<<{"kind":"fight","next":"Sam","cards":["attack"]}>>>']);
  await a.start({ you: { name: 'Sam' }, bobs: [{ who: 'net', name: 'Bob on the Go', address: '100.64.0.9:7777' }] });
  await until(() => a.waitingFor); a.act({ card: 'attack' });
  check('a frozen Bob-Net player is played by the game master after the time limit, and the page is told', await until(() => a.view().game.round === 2) && a.view().game.log.find((l) => l.who === 'player')?.by === 'gm' && events.some((e) => e.ev === 'standin' && /took longer than/.test(e.text)));
  await a.end({ keep: false });
}
// 40 Tone and a keep-out list.
{ const game = { settingText: 'x', pace: 'short', tone: 'cosy', keepOut: 'spiders, drowning', party: [cleanSheet({ name: 'Sam' }), cleanSheet({ name: 'Bobert', who: 'bob' }, { who: 'bob' })] };
  check('the game master gets the tone and the keep-out list', gmSystem(game).includes(TONES.cosy.what) && /Keep these out of the story entirely, the table asked: spiders, drowning/.test(gmSystem(game)));
  check('so do the Bob players', /keep these out of the story: spiders, drowning/.test(playerSystem(game.party[1], game)));
  check('no keep-out list, no line; no tone, Normal', !/Keep these out/.test(gmSystem({ ...game, keepOut: '', tone: undefined })) && gmSystem({ ...game, tone: undefined }).includes(TONES.normal.what));
  const { a } = setup();
  await a.start({ tone: 'grim', keepOut: 'x'.repeat(500), you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  check('the start card sets them (cleaned, Normal for anything unknown)', a.game.tone === 'grim' && a.game.keepOut.length === 300 && a.view().game.tone === 'grim');
  await a.end({ keep: false });
  await a.start({ tone: 'gory', you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  check('an unknown tone is Normal', a.game.tone === 'normal');
  await a.end({ keep: false });
}
// 41 Fair fights.
{ const p = (n, armour = 'some') => Array.from({ length: n }, () => ({ armour }));
  check('fair fights: three with Some armour get what the game master asked', fairHearts(2, p(3)) === 2 && fairHearts(4, p(3)) === 4);
  check('a bigger party meets tougher enemies, a smaller one gentler', fairHearts(3, p(6)) === 6 && fairHearts(3, p(1)) === 1);
  check('less plot armour, gentler enemies; more, tougher; never past 12 or under 1', fairHearts(5, p(3, 'none')) === 4 && fairHearts(5, p(3, 'legendary')) === 7 && fairHearts(12, p(6, 'legendary')) === 12 && fairHearts(1, p(1, 'none')) === 1 && fairHearts(0, p(3)) === 0);
  check('the game master is told the app sets new enemies\' hearts', /the app sets its real hearts to suit the party/.test(gmSystem({ settingText: 'x', pace: 'short', party: [cleanSheet({ name: 'Sam' })] })));
}
// 42 The storybook.
{ const g = { id: 'abcd1234', title: 'The <Mill>', settingText: 'Classic fantasy', status: 'over', started: Date.UTC(2026, 10, 11), party: [cleanSheet({ name: 'Sam', gains: ['+1 Might'] })], scenes: [{ n: 1, title: 'The gate', at: 10, pic: '/images/gate.png' }, { n: 2, title: 'The hall', at: 30, kind: 'talk' }],
    log: [{ who: 'gm', text: 'The gate **looms**.', at: 10 }, { who: 'you', name: 'Sam', text: '⚔ Attack', dice: '12 + Might 5 = 17: a hit', at: 20 }, { who: 'ooc', q: 'secret?', text: 'A secret answer', at: 21 }, { who: 'app', text: 'Paused.', at: 22 }, { who: 'app', text: '⭐ Sam earned +1 Might.', reward: true, at: 23 }, { who: 'gm', text: 'Inside, <script>.', at: 30 }], quests: [{ text: 'Find the miller', done: true }] };
  const html = storybookHtml(g, { pic: (u) => (u === '/images/gate.png' ? 'data:image/png;base64,AAAA' : '') });
  check('the storybook tells the story scene by scene, with the pictures inside the page', /<h2>Scene 1: The gate<\/h2><figure><img src="data:image\/png;base64,AAAA"/.test(html) && html.indexOf('Scene 1') < html.indexOf('looms') && html.indexOf('looms') < html.indexOf('Scene 2') && /<strong>looms<\/strong>/.test(html));
  check('turns, dice and rewards are in; questions out of character and app notes are out', /Sam<\/strong>: ⚔ Attack/.test(html) && /17: a hit/.test(html) && /Sam earned \+1 Might/.test(html) && !/secret/.test(html) && !/Paused/.test(html));
  check('everything is escaped, and it ends "The end."', /The &lt;Mill&gt;/.test(html) && /&lt;script&gt;/.test(html) && !/<script/.test(html) && /The end\./.test(html) && /☑ Find the miller/.test(html) && /2026-11-11/.test(html));
  const { a, cfg, setGm } = setup();
  fs.mkdirSync(path.join(cfg.dataDir, 'pics'), { recursive: true }); cfg.painterDir = path.join(cfg.dataDir, 'pics');
  fs.writeFileSync(path.join(cfg.painterDir, 'gate.png'), Buffer.from([137, 80, 78, 71]));
  check('a picture from the painter is put inside the page; anything else is left out', a.picData('/images/gate.png') === 'data:image/png;base64,iVBORw==' && a.picData('/images/..%2F..%2Fsecret.png') === '' && a.picData('https://example.com/x.png') === '');
  setGm(['Hi.<<<{"cards":["attack"],"kind":"fight","next":"Sam","scene":1,"title":"The only scene"}>>>', 'Fin.<<<{"kind":"end"}>>>']);
  await a.start({ you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  await until(() => a.waitingFor); a.act({ card: 'attack' });
  await until(() => a.game?.status === 'over');
  const id = a.game.id, file = path.join(cfg.dataDir, 'adventures', `${id}-storybook.html`);
  check('at the end of a game its storybook is saved beside the campaign', fs.existsSync(file) && /Fin\./.test(fs.readFileSync(file, 'utf8')) && a.game.log.some((l) => /storybook is ready/.test(l.text)));
  const res = () => ({ head: null, body: '', writeHead(c, h) { this.code = c; this.head = h; }, end(b) { this.body = b; } });
  const send = (r, code, b) => { r.code = code; r.json = b; };
  let r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: `/api/adventure/storybook/${id}`, brain: a.brain, body: async () => ({}), send });
  check('GET the storybook: the page, with a Save a copy link', r.code === 200 && /text\/html/.test(r.head['content-type']) && /Fin\./.test(r.body) && r.body.includes(`/api/adventure/storybook/${id}/save`) && !r.head['content-disposition']);
  r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: `/api/adventure/storybook/${id}/save`, brain: a.brain, body: async () => ({}), send });
  check('…/save: the same page as a file to keep, named after the game, with no save link inside', r.code === 200 && /attachment; filename=".*\.html"/.test(r.head['content-disposition']) && !r.body.includes('/save'));
  r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: '/api/adventure/storybook/nope1234', brain: a.brain, body: async () => ({}), send });
  check('a storybook for no campaign is a plain 404', r.code === 404);
  r = res(); await adventureRoute({ req: { method: 'POST' }, res: r, p: '/api/adventure/takeback', brain: a.brain, body: async () => ({}), send });
  check('Take that back with nothing to take back is a plain 409', r.code === 409 && /Too late/.test(r.json.error));
  await a.end({ keep: true });
  deleteGame(cfg, id);
  check('deleting a campaign deletes its storybook too', !fs.existsSync(file));
}

// Help, glossary, FAQ and both pages for items 35 to 42.
{ const t = plainText(HELP.find((e) => e.id === 'adventure').html);
  check('Help covers tone, odds, take back, fair fights, the world book, the time limit and the storybook', /Cosy/.test(t) && /Keep out of the story/.test(t) && /11\+ · 50%/.test(t) && /Take that back/.test(t) && /Roll now/.test(t) && /Fair fights/.test(t) && /World book/.test(t) && /45 seconds/.test(t) && /Storybook/.test(t) && /Save a copy/.test(t));
  check('FAQ: take back, keep the story', ['faq-adventure-takeback', 'faq-adventure-storybook'].every((id) => HELP.some((e) => e.id === id)));
  const gl = HELP.map((e) => e.html).join('');
  check('the glossary has Odds, Storybook and World book', /<dt>Odds \(on Adventure cards\)<\/dt>/.test(gl) && /<dt>Storybook<\/dt>/.test(gl) && /<dt>World book<\/dt>/.test(gl));
  const page = fs.readFileSync(new URL('../public/adventure.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('the desktop page: tone, keep out, odds, take back, roll now, world book, storybook', /data-tone=/.test(page) && /data-keep-out/.test(page) && /adv-odds/.test(page) && /data-take-back/.test(page) && /data-roll-now/.test(page) && /World book/.test(page) && /\/api\/adventure\/storybook\//.test(page));
  const ph = fs.readFileSync(new URL('../android/app/src/main/assets/www/phone.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const phHelp = fs.readFileSync(new URL('../android/app/src/main/assets/www/help.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  check('the phone page has them too, with its own Help', /tone: advYou\.tone/.test(ph) && /keepOut: advYou\.keepOut/.test(ph) && /g\.odds\?\.\[c\]/.test(ph) && /\/api\/adventure\/takeback/.test(ph) && /World book/.test(ph) && /advBook\(/.test(ph) && /Take that back/.test(phHelp) && /Storybook/.test(phHelp));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
