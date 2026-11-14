// 🧭 Journey (1.5.206, v1.1 in 1.5.211): the server side of Adventure's tile-map game (public/journey-rules.js has the rules and
// public/journey-play.js the screen). The game plays in the page; this only keeps the one save on disk and writes
// a line on your saved character's sheet when a boss is beaten. No brain, nothing loads.
//   GET  /api/adventure/journey          -> { journey }   (null when there's none)
//   POST /api/adventure/journey          { journey }     -> { ok }  (cleaned by the rules before it's written)
//   POST /api/adventure/journey/delete                   -> { ok }
//   POST /api/adventure/journey/reward   { charId, guardian } -> { characters }
//   POST /api/adventure/journey/land     { seed, size, layout }  -> { land }   the phone's list of places and a small picture (v1.2)
//   POST /api/adventure/journey/piece    { seed, size, layout, cx, cy } -> { piece }  32×32 tiles near the party (v1.2)
//   GET  /api/adventure/journey/trophies              -> { trophies }  the guest house's trophy case, every story (v1.3)
//   POST /api/adventure/journey/trophies { trophies } -> { trophies }  adds new ones (by id); old ones are never lost
import fs from 'node:fs';
import path from 'node:path';
import { cleanJourney, GUARDIANS, STATS, keepTrophies } from '../public/journey-rules.js';
import { makeWorld as makeWorldFresh, landSkeleton, landPiece, SIZES } from '../public/journey-world.js';

// The last land made is kept for a while (the biggest takes seconds to make, and every save checks against it), then
// let go so it isn't held in memory while nobody plays.
let lastLand = null, forget = null;
export function makeWorld(seed, size, style, layout) {
  const key = `${seed}|${size}|${layout === 1 ? 1 : 2}`;
  if (lastLand?.key !== key) { lastLand = null; lastLand = { key, world: makeWorldFresh(seed, size, style, layout === 1 ? 1 : undefined) }; }
  clearTimeout(forget); forget = setTimeout(() => { lastLand = null; }, 15 * 60 * 1000); forget.unref?.();
  return lastLand.world;
}

export const journeyFile = (cfg) => path.join(cfg.dataDir || '.', 'adventures', 'journey.json');
export const MAX_SAVE = 200_000; // bytes; a journey is a few KB

export function loadJourney(cfg) {
  try { return cleanJourney(JSON.parse(fs.readFileSync(journeyFile(cfg), 'utf8').replace(/^﻿/, '')), makeWorld); } catch { return null; }
}
export function saveJourney(cfg, j) {
  const clean = cleanJourney(j, makeWorld);
  if (!clean) throw new Error("That isn't a journey I can save.");
  const text = JSON.stringify(clean);
  if (text.length > MAX_SAVE) throw new Error('That journey is too big to save.');
  fs.mkdirSync(path.dirname(journeyFile(cfg)), { recursive: true });
  fs.writeFileSync(journeyFile(cfg), text);
  return clean;
}
export function deleteJourney(cfg) { try { fs.unlinkSync(journeyFile(cfg)); } catch {} }
// The trophy case (Journey v1.3): its own file, so a new adventure (or deleting the save) never empties it.
export const trophyFile = (cfg) => path.join(cfg.dataDir || '.', 'adventures', 'journey-trophies.json');
export function loadTrophies(cfg) {
  try { return keepTrophies(JSON.parse(fs.readFileSync(trophyFile(cfg), 'utf8').replace(/^\uFEFF/, '')), []); } catch { return []; }
}
export function addTrophies(cfg, more) {
  const list = keepTrophies(loadTrophies(cfg), more);
  fs.mkdirSync(path.dirname(trophyFile(cfg)), { recursive: true });
  fs.writeFileSync(trophyFile(cfg), JSON.stringify(list));
  return list;
}

// A keeper beaten: "Beat <name> on a journey" on the saved character's sheet, once per keeper, and one stat point on
// their lowest stat (Adventure stats stop at 5). listCharacters/saveCharacter come from src/adventure.js.
export function journeyReward(cfg, { charId, guardian }, { listCharacters, saveCharacter }) {
  const g = GUARDIANS[guardian];
  const c = listCharacters(cfg).find((x) => x.id === charId);
  if (!g || !c) return listCharacters(cfg);
  const gain = `Beat ${g.name.split(',')[0]} on a journey`;
  if ((c.gains || []).includes(gain)) return listCharacters(cfg);
  const stats = { ...(c.stats || {}) };
  const low = STATS.filter((s) => Number(stats[s]) < 5).sort((a, b) => stats[a] - stats[b])[0];
  if (low && Object.keys(stats).length === 4) stats[low] += 1;
  return saveCharacter(cfg, { ...c, stats: Object.keys(stats).length === 4 ? stats : c.stats, gains: [...(c.gains || []), gain].slice(-12) });
}

export async function journeyRoute({ req, res, p, brain, body, send }, chars) {
  const cfg = brain.cfg;
  if (req.method === 'GET' && p === '/api/adventure/journey') { send(res, 200, { journey: loadJourney(cfg) }); return true; }
  if (req.method === 'GET' && p === '/api/adventure/journey/trophies') { send(res, 200, { trophies: loadTrophies(cfg) }); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  const b = await body(req);
  if (p === '/api/adventure/journey') { saveJourney(cfg, b.journey); send(res, 200, { ok: true }); return true; }
  if (p === '/api/adventure/journey/trophies') { send(res, 200, { trophies: addTrophies(cfg, b.trophies) }); return true; }
  if (p === '/api/adventure/journey/delete') { deleteJourney(cfg); send(res, 200, { ok: true }); return true; }
  if (p === '/api/adventure/journey/land' || p === '/api/adventure/journey/piece') {
    const seed = String(b.seed || '').slice(0, 40), size = SIZES[b.size] ? String(b.size) : 'medium';
    if (!seed) { send(res, 400, { error: 'Which land?' }); return true; }
    const w = makeWorld(seed, size, undefined, Number(b.layout) === 1 ? 1 : undefined); // layout 1: a save from 1.5.218 or before
    if (p.endsWith('/land')) send(res, 200, { land: landSkeleton(w) });
    else send(res, 200, { piece: landPiece(w, Math.floor(Number(b.cx)), Math.floor(Number(b.cy))) });
    return true;
  }
  if (p === '/api/adventure/journey/reward') { send(res, 200, { characters: journeyReward(cfg, { charId: String(b.charId || ''), guardian: String(b.guardian || '') }, chars) }); return true; }
  send(res, 404, { error: 'no' });
  return true;
}
