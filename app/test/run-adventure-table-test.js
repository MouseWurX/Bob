// 1.5.206 🎲 Adventure table rules (items 113-122 of the "100 more" list): a map that grows, portraits, coins and shops,
// catch your breath, secret notes, the rules card, Easy/Normal/Hard, riddle rooms, sending a campaign as one file and
// badges. All off until ticked (Normal plays as before). Pure rules first, then a game with a fake brain.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import * as T from '../src/adventure-table.js';
import { Adventure, adventureRoute, cleanSheet, cleanAdventure, cleanExtras, listGames, loadGame, listCharacters, heartsLost, EXTRAS } from '../src/adventure.js';
import { HELP } from '../public/help-content.js';
import { plainText } from '../src/self-help.js';
import { mapSvg, rulesCard } from '../public/adventure-table.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const fixed = (...dice) => { let i = 0; return () => ((dice[i++ % dice.length] - 1) + 0.5) / 20; };
const read = (rel) => fs.readFileSync(new URL(rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---- off by default ----
check('every table rule is off until ticked, and only known ticks are kept', Object.values(T.cleanRules({})).every((x) => x === false) && T.cleanRules({ map: true, bogus: true }).map === true && !('bogus' in T.cleanRules({ bogus: true })) && T.RULE_IDS.length === 6);
check('difficulty is Normal until picked', T.cleanDifficulty() === 'normal' && T.cleanDifficulty('hard') === 'hard' && T.cleanDifficulty('nightmare') === 'normal');
check('the Adventure settings remember the rules and difficulty, off and Normal by default', JSON.stringify(cleanAdventure({}).rules) === JSON.stringify(T.cleanRules({})) && cleanAdventure({}).difficulty === 'normal');
check('portraits are a table extra, off until ticked', 'portraits' in EXTRAS && cleanExtras({}).portraits === false && cleanExtras({ portraits: true }).portraits === true);

// ---- Easy, Normal or Hard ----
check('Normal leaves enemy hearts alone; Easy has fewer, Hard more, never below 1 or above the cap', T.diffHearts(4, 'normal') === 4 && T.diffHearts(4, 'easy') === 3 && T.diffHearts(4, 'hard') === 5 && T.diffHearts(1, 'easy') === 1 && T.diffHearts(12, 'hard', 12) === 12 && T.diffHearts(0, 'hard') === 0);
{ const nat1 = { outcome: 'miss', natural: 1 }, cost = { outcome: 'cost', natural: 9 };
  check('Normal: hearts lost exactly as before', T.diffLost(heartsLost(nat1), nat1) === 2 && T.diffLost(heartsLost(cost), cost) === 0);
  check('Easy: a miss never costs more than one heart', T.diffLost(heartsLost(nat1), nat1, { difficulty: 'easy' }) === 1);
  check('Hard: a hit at a cost in a fight costs a heart, outside a fight it doesn\'t', T.diffLost(heartsLost(cost), cost, { difficulty: 'hard' }) === 1 && T.diffLost(0, cost, { difficulty: 'hard', fight: false }) === 0);
  check('Hard still never takes the last heart with Lots or Legendary', T.diffLost(0, cost, { difficulty: 'hard', armour: 'lots', hearts: 1 }) === 0); }

// ---- the map ----
{ const g = { rules: { map: true } };
  T.mapStep(g, 'The tavern'); T.mapStep(g, 'The cellar'); T.mapStep(g, 'The tunnels'); T.mapStep(g, 'The cellar'); T.mapStep(g, 'The well');
  const m = g.map;
  check('a new scene is a new place, joined to the one before', m.nodes.length === 4 && m.links.some(([a, b]) => a === 0 && b === 1) && m.links.some(([a, b]) => a === 1 && b === 2));
  check('going back to a place by name reuses it, and the map knows where the party is', m.nodes.filter((n) => n.name === 'The cellar').length === 1 && m.nodes[m.at].name === 'The well' && m.links.some(([a, b]) => a === 1 && b === 3));
  check('no two places share a spot on the grid', new Set(m.nodes.map((n) => `${n.x},${n.y}`)).size === m.nodes.length);
  const svg = mapSvg(m, { exits: ['the iron gate', '<script>'] });
  check('the map draws as a picture with every place, the party\'s spot and the ways on, escaped', /<svg/.test(svg) && /The tunnels/.test(svg) && /adv-map-here/.test(svg) && /the iron gate/.test(svg) && !/<script>/.test(svg) && /role="img"/.test(svg));
  for (let i = 0; i < 60; i++) T.mapStep(g, `Room ${i}`);
  check('the map stops growing at 40 places', g.map.nodes.length === T.MAP_MAX); }

// ---- coins and shops ----
{ const r = T.readCoins({ coins: 500, shop: { Rope: 2, Lantern: '4', Crown: 500, '': 3 } });
  check('the hidden line: coins capped at 50 a turn, shop prices 1 to 99', r.coins === 50 && r.shop.Rope === 2 && r.shop.Lantern === 4 && !('Crown' in r.shop) && Object.keys(r.shop).length === 2);
  const g = { rules: { coins: true }, coins: 10 }, c = cleanSheet({ name: 'Wren' });
  T.applyCoins(g, { coins: -3, shop: { Rope: 2, Lantern: 9 } });
  check('the purse changes and a shop opens', g.coins === 7 && g.shop.Rope === 2);
  const got = T.buy(g, c, 'rope');
  check('buying takes the coins and puts it in the pack', got.name === 'Rope' && g.coins === 5 && c.items.includes('Rope'));
  let e = ''; try { T.buy(g, c, 'Lantern'); } catch (x) { e = x.message; }
  check('the app checks the purse', /costs 9 coins, and the party has 5/.test(e));
  e = ''; try { T.buy(g, c, 'Dragon'); } catch (x) { e = x.message; } check("only what's for sale", /isn't for sale/.test(e));
  T.applyCoins(g, { shop: {} }); check('shop: {} closes the shop', g.shop === null);
  e = ''; try { T.buy({ rules: {} }, c, 'Rope'); } catch (x) { e = x.message; } check('buying is refused when coins are off', /off for this game/.test(e)); }

// ---- catch your breath ----
{ const g = { rules: { breath: true }, scenes: [{}] }, c = cleanSheet({ name: 'Wren' }); c.hearts = 3;
  check('catch your breath: one heart back, once a scene', T.breathe(g, c) === 1 && c.hearts === 4 && !T.canBreathe(g, c) && T.breathe(g, c) === 0);
  g.scenes.push({}); check('it comes back next scene', T.canBreathe(g, c));
  c.hearts = c.max; check('not with every heart already there', !T.canBreathe(g, c));
  check('off: never', !T.canBreathe({ rules: {}, scenes: [] }, { ...c, hearts: 1 }));
  check("a Bob player's words can say it", T.breathWords('I lean on the wall to catch my breath') && !T.breathWords('I strike the goblin')); }

// ---- riddles ----
{ check('the riddles are the app\'s own, two dozen of them, each with answers', T.RIDDLES.length >= 24 && T.RIDDLES.every((r) => r.ask && r.answers.length));
  const towel = T.riddleById('towel');
  check('answers: little words, capitals and plurals don\'t matter', T.checkAnswer(towel, 'A Towel!') && T.checkAnswer(towel, "it's a towel") && T.checkAnswer(towel, 'towels') && !T.checkAnswer(towel, 'a sponge'));
  check('a long list of guesses never counts', !T.checkAnswer(towel, 'map bottle needle clock river comb towel fire'));
  const g = { rules: { riddles: true }, scenes: [{ title: 'The door' }] };
  const r = T.openRiddle(g, fixed(1));
  check('a riddle opens with its question; the page never sees the answer while it\'s open', r && T.riddleView(g).ask === r.ask && T.riddleView(g).answer === '' && !JSON.stringify(T.riddleView(g)).includes(T.riddleById(r.id).answers[0] === 'm' ? '§' : T.riddleById(r.id).answers[0]));
  check('only one riddle at a time', T.openRiddle(g) === null);
  check('the game master is told the question, never the answer', T.riddleTell(r.ask).includes(r.ask) && !T.riddleTell(r.ask).includes(T.riddleById(r.id).answers[0] + '"'));
  let x = T.guessRiddle(g, 'a goat'); x = T.guessRiddle(g, 'a hat');
  check('wrong guesses count down', !x.right && !x.over && T.riddleView(g).left === 1);
  x = T.guessRiddle(g, 'nope');
  check('three wrong and it\'s over, with the answer shown', x.over && !x.right && x.answer && !g.riddle.open && T.riddleView(g).answer === x.answer);
  const g2 = { rules: { riddles: true }, scenes: [], riddlesUsed: [] }; const r2 = T.openRiddle(g2, fixed(1));
  const y = T.guessRiddle(g2, T.riddleById(r2.id).answers[0]);
  check('the right answer solves it', y.right && g2.riddle.solved && r2.id !== r.id || y.right);
  check('off: no riddles', T.openRiddle({ rules: {} }) === null); }

// ---- badges and secrets ----
{ const g = { rules: { badges: true } }, c = cleanSheet({ name: 'Wren' });
  check('a badge is given once, ever', T.award(g, c, 'nat20') && !T.award(g, c, 'nat20') && c.badges.length === 1);
  check('off: no badges', !T.award({ rules: {} }, c, 'dragon'));
  check('dragons, wyrms and drakes count as dragons', T.isDragon({ name: 'The old wyrm' }) && T.isDragon({ name: 'Red Dragon' }) && !T.isDragon({ name: 'Goblin' }));
  check('badges survive a sheet being cleaned, unknown ones dropped', JSON.stringify(cleanSheet({ badges: ['nat20', 'bogus', 'nat20'] }).badges) === '["nat20"]');
  const s = { rules: { secrets: true } };
  T.addSecret(s, c, 'I pocket the ring');
  check('a secret note is kept for the game master', s.secrets[0].text === 'I pocket the ring' && /game master only/.test(T.secretTell(c, 'x')) && /never read them out/.test(T.tableLines(s)));
  let e = ''; try { T.addSecret({ rules: {} }, c, 'x'); } catch (x) { e = x.message; } check('off: no notes', /off for this game/.test(e)); }

// ---- the game master's rules ----
check('Normal and nothing ticked: the game master reads nothing new', T.tableRulesText({ rules: {}, difficulty: 'normal' }) === '' && T.tableLines({ rules: {} }) === '');
{ const t = T.tableRulesText({ rules: T.cleanRules({ coins: true, riddles: true, breath: true, secrets: true, badges: true, map: true }), difficulty: 'hard' });
  check('ticked rules are explained to the game master, with the hidden-line keys', /"coins"/.test(t) && /"shop"/.test(t) && /"riddle": 1/.test(t) && /Difficulty Hard/.test(t) && /Secret notes/.test(t)); }

// ---- sending a campaign ----
{ const g = { id: 'abc12345', title: 'The <b>bill</b>', settingText: 'Classic fantasy.', pace: 'evening', status: 'playing', party: [cleanSheet({ name: 'Wren', badges: ['nat20'] }, { who: 'you' }), cleanSheet({ name: 'Go', who: 'net', address: '100.64.0.9:7777' }, { who: 'net' })], turn: 1, round: 3,
    scenes: [{ n: 1, title: 'The hall', kind: 'place', pic: '/images/x.png' }], log: [{ who: 'gm', text: 'Hello.', raw: 'Hello.<<<{}>>>' }, { who: 'evil', text: 'x'.repeat(5000) }], summary: 'So far.', props: { 'picture:place': '/images/p.png' },
    secrets: [{ id: 'x', text: 'shh' }], riddle: { id: 'towel', open: true }, rules: { coins: true, map: true }, coins: 7, map: { nodes: [{ id: 0, name: 'The hall', x: 0, y: 0 }], links: [], at: 0 }, quests: [{ text: 'Pay the bill', done: false }] };
  const file = T.packCampaign(g);
  const s = JSON.stringify(file);
  check('the file: the story, the party and the map, and no pictures, secret notes, riddle answers or Bob-Net addresses', file.kind === 'bob-adventure' && /Hello\./.test(s) && /The hall/.test(s) && !/images/.test(s) && !/shh/.test(s) && !/towel/.test(s) && !/100\.64/.test(s) && file.game.status === 'paused');
  check('it is named after the game', T.campaignFileName(g) === 'The bbillb.bobadventure.json');
  const back = T.unpackCampaign(s, { cleanSheet });
  check('a friend\'s file becomes a new saved campaign, checked like typing', back.id !== g.id && back.title === 'The <b>bill</b>' && back.party.length === 2 && back.party[1].who === 'bob' && back.party[0].badges[0] === 'nat20' && back.log[1].who === 'app' && back.log[1].text.length === 2000 && back.coins === 7 && back.map.nodes[0].name === 'The hall' && back.status === 'paused');
  let e = ''; try { T.unpackCampaign('{"kind":"nope"}', { cleanSheet }); } catch (x) { e = x.message; } check('any other file is refused', /isn't a campaign/.test(e));
  e = ''; try { T.unpackCampaign('not json', { cleanSheet }); } catch (x) { e = x.message; } check('a broken file is refused', /isn't a campaign/.test(e));
  e = ''; try { T.unpackCampaign({ kind: 'bob-adventure', version: 99, game: {} }, { cleanSheet }); } catch (x) { e = x.message; } check('a file from a newer Bob says so', /newer Bob/.test(e)); }

// ---- a game with a fake brain ----
function setup(replies = []) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-advt-'));
  const cfg = { dataDir: tmp, agentDir: tmp, settingsFile: path.join(tmp, 'settings.json'), session: 'normal', userName: 'Sam', models: { bob: 'main' }, share: { borrow: { bobs: [] } } };
  const calls = { chat: [] }, events = [];
  const brain = {
    cfg, broadcast: (ev) => events.push(ev), log: () => {}, gate: { done: () => {} }, settle: async () => {},
    engine: { loaded: async () => [], unload: async (m) => [m] },
    async ensureModel(model) { return model; },
    async chatSafe(o) { calls.chat.push(o); const sys = o.messages[0].content; const text = /^You are .*, playing /.test(sys) ? 'I catch my breath against the wall.' : replies.length ? replies.shift() : 'On it goes.<<<{"cards":["attack","talk"],"kind":"fight"}>>>'; return { content: text }; }
  };
  const a = new Adventure(brain, { rnd: fixed(20, 12, 12, 12, 12, 12, 12), takeBackMs: 0 });
  return { a, cfg, calls, events, tmp };
}
const tick = (ms = 10) => new Promise((r) => setTimeout(r, ms));
const until = async (f, n = 300) => { for (let i = 0; i < n; i++) { if (f()) return true; await tick(); } return false; };

{ const { a, cfg, calls } = setup(['The tavern.<<<{"cards":["attack","talk"],"kind":"fight","scene":1,"title":"The tavern","foes":{"Red dragon":1},"coins":5,"shop":{"Rope":2}}>>>']);
  await a.start({ you: { name: 'Sam', cls: 'fighter', armour: 'none' }, bobs: [{ who: 'bob', name: 'Bobert' }], pace: 'campaign', rules: { map: true, coins: true, breath: true, secrets: true, riddles: true, badges: true }, difficulty: 'easy' });
  await until(() => a.waitingFor);
  let v = a.view();
  check('the start card\'s ticks and difficulty are kept with the game and remembered for next time', v.game.rules.coins && v.game.difficulty === 'easy' && cfg.adventure.rules.riddles === true && cfg.adventure.difficulty === 'easy');
  check('the game master read the table rules', /Table rules for this game/.test(calls.chat[0].messages[0].content) && /Party purse/.test(calls.chat[0].messages[0].content) === false || /"shop"/.test(calls.chat[0].messages[0].content));
  check('coins from the hidden line: 10 to start, +5 found; the shop is open', v.game.coins === 15 && v.game.shop.Rope === 2);
  check('the map has its first place', v.game.map.nodes.length === 1 && v.game.map.nodes[0].name === 'The tavern');
  check('Easy: the dragon still has at least one heart', v.game.foes[0].hearts >= 1);
  a.buy({ item: 'Rope' });
  v = a.view();
  check('buying from the page doesn\'t use the turn, and the game master hears of it next turn', v.waitingFor === v.game.party[0].id && v.game.coins === 13 && v.game.party[0].items.includes('Rope') && a.game.tell.some((t) => /bought Rope/.test(t)));
  check('a first purchase earns a badge', v.game.party[0].badges.includes('shopper') && listCharacters(cfg)[0]?.badges?.includes('shopper'));
  a.secret({ text: 'I pocket the dragon\'s tooth' });
  v = a.view();
  check('a secret note is kept off the story log', v.game.secrets[0].text.includes('tooth') && !v.game.log.some((l) => /tooth/.test(l.text)));
  a.act({ card: 'attack', target: 'Red dragon' });
  await until(() => a.waitingFor && a.game.turns >= 2);
  v = a.view();
  const turnMsg = calls.chat.find((c) => /plays the Attack card/.test(c.messages.at(-1).content))?.messages.at(-1).content || '';
  check('the next turn tells the game master about the purchase and the note, once', /bought Rope/.test(turnMsg) && /secret note from Sam/.test(turnMsg) && a.game.tell.length === 0);
  check('a natural 20 that drops a dragon: three badges', ['nat20', 'firstDown', 'dragon'].every((b) => v.game.party[0].badges.includes(b)) && v.game.log.some((l) => /Dragon slayer/.test(l.text)));
  check('Bobert\'s words "catch my breath" don\'t heal him at full hearts (he rolls instead)', v.game.log.some((l) => l.name === 'Bobert' && l.roll));
  const id = v.game.id;
  // riddle: the game master asks for one
  a.applyGm(a.game, 'A door with words.<<<{"riddle":1}>>>');
  v = a.view();
  check('"riddle": 1 sets one of the app\'s riddles; the log and page show the question only', v.game.riddle?.open && v.game.log.some((l) => l.riddle) && !JSON.stringify(v).includes(`"answers"`));
  const ans = T.riddleById(a.game.riddle.id).answers[0];
  a.riddle({ answer: 'wrong one' });
  a.riddle({ answer: ans });
  v = a.view();
  check('the right answer opens the way and earns a badge', v.game.riddle.solved && v.game.party[0].badges.includes('riddle') && a.game.tell.some((t) => /solved the riddle/.test(t)));
  // breath
  a.game.party[0].hearts = 2; a.game.party[0].breathScene = -1;
  check('the page offers Catch your breath on a hurt player\'s turn', a.view().game.breath === true);
  a.act({ card: 'breath' });
  await until(() => a.waitingFor && a.game.log.some((l) => l.dice?.startsWith('one heart back')));
  check('Catch your breath: no roll, one heart back, the turn is spent', a.game.party[0].hearts === 3 && calls.chat.some((c) => /catching their breath/.test(c.messages.at(-1).content)));
  let e = ''; try { a.act({ card: 'breath' }); } catch (x) { e = x.message; } check('only once a scene', /once a scene/.test(e));
  // export + import through the route
  const res = () => ({ head: null, body: '', writeHead(c, h) { this.code = c; this.head = h; }, end(b) { this.body = b; } });
  const send = (r, code, b) => { r.code = code; r.json = b; };
  let r = res(); await adventureRoute({ req: { method: 'GET' }, res: r, p: `/api/adventure/export/${id}`, brain: a.brain, body: async () => ({}), send });
  check('GET export: one file to download, named after the game', r.code === 200 && /attachment; filename=".*\.bobadventure\.json"/.test(r.head['content-disposition']) && JSON.parse(r.body).kind === 'bob-adventure' && !r.body.includes('tooth'));
  await a.end({ keep: true });
  const before = listGames(cfg).length;
  const r2 = res(); await adventureRoute({ req: { method: 'POST' }, res: r2, p: '/api/adventure/import', brain: a.brain, body: async () => ({ file: r.body }), send, isLocal: true });
  check('POST import: it lands under Continue a campaign as a new one', r2.code === 200 && listGames(cfg).length === before + 1 && loadGame(cfg, r2.json.imported.id).party[0].badges.includes('dragon'));
  const r3 = res(); await adventureRoute({ req: { method: 'POST' }, res: r3, p: '/api/adventure/import', brain: a.brain, body: async () => ({ file: r.body }), send, isLocal: false });
  check('import only on this replicant matrix itself', r3.code === 403);
}

{ const { a } = setup(['Hi.<<<{"cards":["talk"],"kind":"talk","scene":1,"title":"A road","coins":5,"riddle":1}>>>']);
  await a.start({ you: { name: 'Sam' }, bobs: [{ who: 'bob', name: 'Bobert' }] });
  await until(() => a.waitingFor);
  const v = a.view();
  check('nothing ticked: no purse, no map, no riddle, no breath card, Normal', v.game.coins === null && v.game.map === null && v.game.riddle === null && v.game.breath === false && v.game.difficulty === 'normal' && !v.game.log.some((l) => /🪙|🧩/.test(l.text)));
  let e = ''; try { a.secret({ text: 'x' }); } catch (x) { e = x.message; } check('secret notes refused when off', /off for this game/.test(e));
  await a.end({ keep: false });
}

// ---- the rules card ----
{ const card = rulesCard({ rules: { coins: true, breath: true }, difficulty: 'hard', names: { rules: T.RULES, difficulties: T.DIFFICULTY } });
  check('the rules card: the cards, the dice, hearts, plot armour and this game\'s rules on one card', /15 or more/.test(card) && /Might/.test(card) && /hearts/i.test(card) && /Legendary/.test(card) && /Coins and shops/.test(card) && /Hard/.test(card) && !/Riddle rooms/.test(card)); }

// ---- pages, Help, glossary, FAQ ----
{ const page = read('../public/adventure.js');
  check('the desktop page: rules, difficulty, portraits, map, coins, breath, notes, riddle, rules card, send and bring in', /data-rule=/.test(page) && /data-difficulty=/.test(page) && /'portraits'/.test(page) && /mapSvg\(/.test(page) && /\/api\/adventure\/buy/.test(page) && /data-card="breath"|'breath'/.test(page) && /\/api\/adventure\/secret/.test(page) && /\/api\/adventure\/riddle/.test(page) && /rulesCard\(/.test(page) && /\/api\/adventure\/export\//.test(page) && /\/api\/adventure\/import/.test(page) && /BADGE|badges/.test(page));
  const ph = read('../android/app/src/main/assets/www/phone.js');
  check('the phone page plays them too', /rules: adv\.rules/.test(ph) && /difficulty: advYou\.difficulty/.test(ph) && /globalThis\.BobAdvTable/.test(ph) && /AT\.mapSvg/.test(ph) && /\/api\/adventure\/buy/.test(ph) && /\/api\/adventure\/secret/.test(ph) && /\/api\/adventure\/riddle/.test(ph) && /AT\.rulesCard/.test(ph) && /card: 'breath'/.test(ph));
  check('the phone gets the map and rules card from the desktop file, word for word', read('../android/app/src/main/assets/www/adv-table.js').includes('globalThis.BobAdvTable') && /<script src="adv-table\.js"><\/script>/.test(read('../android/app/src/main/assets/www/index.html')));
  const t = plainText(HELP.find((e) => e.id === 'adventure').html);
  check('Help covers every new rule', /A map that grows/.test(t) && /Portraits/.test(t) && /Coins and shops/.test(t) && /Catch your breath/.test(t) && /Secret notes/.test(t) && /Rules card/.test(t) && /Easy, Normal or Hard/.test(t) && /Riddle rooms/.test(t) && /Send to a friend/.test(t) && /Badges/.test(t));
  check('FAQs for riddles, sending a campaign and badges', ['faq-adventure-riddles', 'faq-adventure-send', 'faq-adventure-badges'].every((id) => HELP.some((e) => e.id === id)));
  const gl = HELP.map((e) => e.html).join('');
  check('the glossary has Badges, Riddle room, Campaign file and Purse', /<dt>Badges \(Adventure\)<\/dt>/.test(gl) && /<dt>Riddle room<\/dt>/.test(gl) && /<dt>Campaign file<\/dt>/.test(gl) && /<dt>Purse \(Adventure\)<\/dt>/.test(gl));
  const phHelp = read('../android/app/src/main/assets/www/help.js');
  check('the phone Help says what the phone can and can\'t do', /Riddle/.test(phHelp) && /Secret note/.test(phHelp) && /bring a campaign in/i.test(phHelp));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
