// "Each chat keeps its place in the engine" (Settings, How Bob works, 💬 Chat extras). Off unless turned on.
// The engine (llama-server) keeps one chat's reading in its memory. Switching to another chat throws it away, so going
// back means reading the whole chat again (a long chat on a big brain can take a minute). With this on, Bob's built-in
// engine saves the old chat's reading to disk when you switch (inn\bob\chat-places) and loads it back when you return.
// Before, only brains on the processor with "Get Bob ready while you type" saved anything (their instructions).
//   - Only Bob's built-in engine (Brain Engine or llama.cpp). Ollama and rented brains don't have it.
//   - Not for brains that see pictures (the engine can't save those), and not the second brain beside a job.
//   - The newest 4 are kept, and no more than 8 GB in all: a long chat on a big brain can take a few GB.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const chatPlacesOn = (cfg) => cfg?.chatPlaces === true;
export const placesDir = (cfg) => path.join(cfg.dataDir, 'chat-places');
export const PLACES_KEEP = 4;
export const PLACES_MAX_BYTES = 8e9;

// llama-server only takes a plain file name inside its save folder. The chat's id is hashed, so the name says nothing.
export const placeFile = (chatId, model, ctx) => `place-${crypto.createHash('sha1').update(String(chatId)).digest('hex').slice(0, 12)}-${String(model).replace(/[^\w.-]+/g, '_').slice(0, 60)}-${Number(ctx) || 0}.bin`;

// The newest few, under the size limit; everything else goes. keepName (one name or a list: the one just saved, the
// one about to be loaded) is never removed, and counts first.
export function tidyPlaces(dir, { keep = PLACES_KEEP, maxBytes = PLACES_MAX_BYTES, keepName = '' } = {}) {
  const keepSet = new Set([].concat(keepName).filter(Boolean));
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => /^place-[\w.-]+\.bin$/.test(f)).map((f) => { const st = fs.statSync(path.join(dir, f)); return { f, t: st.mtimeMs, size: st.size }; }).sort((a, b) => (keepSet.has(b.f) - keepSet.has(a.f)) || b.t - a.t); } catch { return []; }
  const gone = [];
  let total = 0, n = 0;
  for (const x of files) {
    total += x.size; n++;
    if (!keepSet.has(x.f) && (n > keep || total > maxBytes)) { try { fs.rmSync(path.join(dir, x.f), { force: true }); gone.push(x.f); } catch {} total -= x.size; n--; }
  }
  return gone;
}

export function placesUsed(cfg) {
  try { const dir = placesDir(cfg); const fs2 = fs.readdirSync(dir).filter((f) => f.endsWith('.bin')); return { count: fs2.length, bytes: fs2.reduce((a, f) => a + fs.statSync(path.join(dir, f)).size, 0) }; } catch { return { count: 0, bytes: 0 }; }
}

export function clearPlaces(cfg) { try { fs.rmSync(placesDir(cfg), { recursive: true, force: true }); } catch {} }
