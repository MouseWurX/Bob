// Nov 14 (the owner: "say I'm away in a work camp after work, and I want to game, and a request comes to Bob-Net").
// The Gaming button already turns every Bob-Net ask away. This covers forgetting to press it: while another program
// holds a real share of this computer's graphics card (a game, nearly always: browsers, launchers and the desktop
// don't count, see card-busy.js), this Bob turns down quick replies, checks, whole jobs and lending his card, the same
// as in Gaming. The asking Bob does it himself or sends it to another Bob. Always on (a reliability fix).
// The card is read at most every GAME_EVERY_MS (nvidia-smi, or Windows' own graphics memory counters on other cards);
// a card that can't be read (a Mac, a Pi) never says "gaming".
import { readCardUse } from './card-busy.js';
import { HELD_MB } from './card-guard.js';

export const GAME_EVERY_MS = 5000;
const OURS = /^(rpc-server|llama-rpc-server)(\.exe)?$/i; // a lent card's own server is this Bob's, not a game

// The program holding the card, as "Name, 6.2 GB", or '' when nothing does. card: readCardUse()'s reading.
export function gameOnCard(card, minMB = HELD_MB) {
  const big = [].concat(card?.others || []).filter((o) => !OURS.test(String(o?.name || '')) && !o?.engine && (Number(o?.mb) || 0) >= minMB).sort((a, b) => b.mb - a.mb)[0];
  return big ? `${String(big.name).slice(0, 40)}, ${(big.mb / 1024).toFixed(1)} GB` : '';
}

// busy(): '' or what holds the card, read again at most every GAME_EVERY_MS, never waiting more than about 2 s.
export function gameGuard({ read = () => readCardUse(), now = Date.now, waitMs = 2000 } = {}) {
  let at = -Infinity, last = '', pending = null;
  return async function busy() {
    if (now() - at < GAME_EVERY_MS) return last;
    pending ||= Promise.resolve().then(read).then((c) => { last = gameOnCard(c); }).catch(() => { last = ''; }).finally(() => { at = now(); pending = null; });
    await Promise.race([pending, new Promise((r) => setTimeout(r, waitMs))]);
    return last;
  };
}
