// 🧭 Journey (1.5.206, v1.1 in 1.5.211): the server side of Adventure's tile-map game (public/journey-rules.js has the rules and
// public/journey-play.js the screen). The game plays in the page; this only keeps the one save on disk and writes
// a line on your saved character's sheet when a boss is beaten. No brain, nothing loads.
//   GET  /api/adventure/journey          -> { journey }   (null when there's none)
//   POST /api/adventure/journey          { journey }     -> { ok }  (cleaned by the rules before it's written)
//   POST /api/adventure/journey/delete                   -> { ok }
//   POST /api/adventure/journey/reward   { charId, guardian } -> { characters }
import fs from 'node:fs';
import path from 'node:path';
import { cleanJourney, GUARDIANS, STATS } from '../public/journey-rules.js';
import { makeWorld } from '../public/journey-world.js';

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
  if (req.method !== 'POST') { send(res, 404, { error: 'no' }); return true; }
  const b = await body(req);
  if (p === '/api/adventure/journey') { saveJourney(cfg, b.journey); send(res, 200, { ok: true }); return true; }
  if (p === '/api/adventure/journey/delete') { deleteJourney(cfg); send(res, 200, { ok: true }); return true; }
  if (p === '/api/adventure/journey/reward') { send(res, 200, { characters: journeyReward(cfg, { charId: String(b.charId || ''), guardian: String(b.guardian || '') }, chars) }); return true; }
  send(res, 404, { error: 'no' });
  return true;
}
