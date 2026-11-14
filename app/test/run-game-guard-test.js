// Nov 14 (the owner): away from home, gaming, and a Bob-Net ask comes in. A game on the card turns asks away like the
// Gaming button does (src/game-guard.js). And one brain shared over Bobs: cable Bobs first, never mixed with Wi-Fi.
import fs from 'node:fs';
import { gameOnCard, gameGuard, GAME_EVERY_MS } from '../src/game-guard.js';
import { oneKind, LEND_NO } from '../src/share-card.js';

let pass = 0, fail = 0;
const check = (name, ok, more = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name} ${more}`); } };

// ---- what counts as a game on the card ----
check('nothing else on the card: not gaming', gameOnCard({ others: [] }) === '' && gameOnCard(null) === '');
check('a game holding 6 GB: gaming, named', gameOnCard({ others: [{ name: 'Cyberpunk2077', mb: 6200 }] }) === 'Cyberpunk2077, 6.1 GB');
check('a small program under 2 GB: not gaming', gameOnCard({ others: [{ name: 'Overlay', mb: 900 }] }) === '');
check('his own lent card server is never a game', gameOnCard({ others: [{ name: 'rpc-server.exe', mb: 9000 }] }) === '');
check('another engine (a test brain) is not a game', gameOnCard({ others: [{ name: 'llama-server', mb: 9000, engine: true }] }) === '');

// ---- read at most every 5 s ----
{
  let t = 0, reads = 0, card = { others: [{ name: 'Game', mb: 4096 }] };
  const busy = gameGuard({ read: async () => { reads++; return card; }, now: () => t });
  const a = await busy(); const b = await busy();
  check('reads the card once, then remembers for 5 s', a === 'Game, 4.0 GB' && b === a && reads === 1);
  card = { others: [] }; t += GAME_EVERY_MS + 1;
  check('the game closed: free again after the next read', (await busy()) === '' && reads === 2);
  const broken = gameGuard({ read: async () => { throw new Error('no card'); } });
  check('a card that can\'t be read never says gaming', (await broken()) === '');
}

// ---- never cable and wireless together ----
{
  const cable = { bob: { name: 'Go' }, via: 'home', wired: true }, wifi = { bob: { name: 'Laptop' }, via: 'home', wired: false }, ts = { bob: { name: 'Phone' }, via: 'tailscale' };
  const room = (gb) => (u) => gb[u.bob.name] || 0;
  const dropped = [];
  const used = oneKind([cable, wifi, ts], (u) => dropped.push(u.bob.name), room({ Go: 16, Laptop: 6, Phone: 0 }));
  check('cable and wireless lend: one kind only, the one with more room (here the cable)', used.length === 1 && used[0] === cable && dropped.join() === 'Laptop,Phone');
  const d2 = [];
  const used2 = oneKind([cable, wifi], (u) => d2.push(u.bob.name), room({ Go: 4, Laptop: 12 }));
  check('more room on the Wi-Fi side: Wi-Fi Bobs only, the cable Bob let go', used2.length === 1 && used2[0] === wifi && d2.join() === 'Go');
  check('a tie goes to the cable', oneKind([cable, wifi], () => {}, () => 8)[0] === cable);
  const none = [];
  check('only Wi-Fi and Tailscale Bobs: they share among themselves', oneKind([wifi, ts], (u) => none.push(u)).length === 2 && none.length === 0);
  check('only cable Bobs: all of them', oneKind([cable, { ...cable, bob: { name: 'Laptop' } }]).length === 2);
}

// ---- wiring ----
{
  const srv = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
  const brains = fs.readFileSync(new URL('../src/share-brains.js', import.meta.url), 'utf8');
  const jobs = fs.readFileSync(new URL('../src/share-jobs.js', import.meta.url), 'utf8');
  const card = fs.readFileSync(new URL('../src/share-card.js', import.meta.url), 'utf8');
  check('the guard is made once at start', /brain\.gameBusy = gameGuard\(\);/.test(srv));
  check('hello says gaming while a game holds the card', /lendRefusal\(brain, brain\.lendDeps\) \|\| \(\(await brain\.gameBusy\?\.\(\)\) \? 'gaming' : ''\)/.test(srv));
  check('no card lent while a game holds it', /lb\?\.action === 'open' && \(await brain\.gameBusy\?\.\(\)\)\) return send\(res, 200, \{ ok: false, why: 'gaming' \}\)/.test(srv));
  check('no quick reply or check while a game holds it', /const gaming = !why && \(await brain\.gameBusy\?\.\(\)\) \? 'gaming' : ''/.test(brains));
  check('no whole job while a game holds it (a keep-only message still lands)', /b\?\.need === 'chat' && b\?\.answer === false\) && \(await brain\.gameBusy\?\.\(\)\)\) return send\(res, 409, \{ busy: 'gaming' \}\)/.test(jobs));
  check('the spread never mixes cable and wireless Bobs', /this\.using = oneKind\(tries\.filter\(Boolean\)/.test(card) && /action: 'close'/.test(card.slice(card.indexOf('this.using = oneKind'))));
  check('the asking Bob hears why', /a game on its graphics card/.test(LEND_NO.gaming));
  const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8');
  check('Help explains both', /game is running on its graphics card/.test(help) && /never shared by Bobs on a cable and Bobs on Wi-Fi or Tailscale together/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
