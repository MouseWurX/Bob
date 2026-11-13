// Saved prompts (Settings, How Bob works: "Saved prompts with /"; off unless the user turns it on).
//
// The words you type often, saved once: type "/" at the start of the message box, pick one, and its words go in
// the box for you to finish and send. Nothing is sent by itself, and Bob's brain never sees the list.
//   - One plain JSON file, inn\saved-prompts.json, kept even when the switch is off (turning it off only hides the menu).
//   - Blanks in curly brackets, like {file}, are filled in the box (public/prompt-words.js). In Bob's own window,
//     a {file} blank offers the system's file picker (POST /api/prompts { pickFile }, this replicant matrix only).
//   - Bob for Android keeps its own list on the phone (the same words file, copied in by android/tools/make-shared.mjs).
import fs from 'node:fs';
import path from 'node:path';
import { cleanList, savePrompt, deletePrompt, movePrompt, STARTERS } from '../public/prompt-words.js';

export const promptsOn = (cfg) => cfg?.promptMenu === true;
export const promptsFile = (cfg) => path.join(cfg.innDir, 'saved-prompts.json');

export function loadPrompts(cfg) {
  try { return cleanList(JSON.parse(fs.readFileSync(promptsFile(cfg), 'utf8').replace(/^﻿/, '')).prompts); } catch { return []; }
}

// Written to a side file first, then moved over, so a crash never leaves half a list.
export function writePrompts(cfg, list) {
  const f = promptsFile(cfg);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  const tmp = f + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ about: 'Bob\'s saved prompts. Type / in the message box to use them. Blanks look like {file}.', prompts: list }, null, 2) + '\n');
  fs.renameSync(tmp, f);
  return list;
}

export const promptsView = (cfg, extra = {}) => ({ on: promptsOn(cfg), prompts: loadPrompts(cfg), starters: STARTERS, ...extra });

// GET /api/prompts: the switch and the list. POST /api/prompts with one of:
//   { on: true|false }                 the switch (same as /api/settings { promptMenu })
//   { save: { id?, name, text } }      add, or change the one with that id
//   { remove: id }  { move: id, by: -1|1 }  { starters: true } (adds the starters that aren't there yet)
//   { pickFile: true }                 the system's file picker, in Bob's own window on this replicant matrix only
export async function promptsRoute({ req, res, p, isLocal, cfg, body, send, saveSettings, log = () => {}, pick = globalThis.bobPick }) {
  if (p !== '/api/prompts') return false;
  const canPick = isLocal && typeof pick === 'function'; // Bob's own window on this replicant matrix
  if (req.method === 'GET') { send(res, 200, promptsView(cfg, { canPick })); return true; }
  if (req.method !== 'POST') { send(res, 405, { error: 'GET or POST' }); return true; }
  let b;
  try { b = await body(req); } catch { send(res, 400, { error: 'That wasn\'t readable.' }); return true; }
  if (b.pickFile) {
    if (!isLocal || typeof pick !== 'function') { send(res, 200, { path: '', why: 'The file picker only opens in Bob\'s own window. Type the file instead.' }); return true; }
    const f = await Promise.resolve(pick({ title: 'Pick a file for your prompt' })).catch(() => '');
    send(res, 200, { path: String(f || '') });
    return true;
  }
  let list = loadPrompts(cfg);
  if (typeof b.on === 'boolean') {
    saveSettings(cfg, { promptMenu: b.on });
    log('settings', `Saved prompts with /: ${b.on ? 'on' : 'off'} (your click)`);
  }
  if (b.save) {
    const r = savePrompt(list, b.save);
    if (r.error) { send(res, 400, { error: r.error }); return true; }
    list = writePrompts(cfg, r.list);
  }
  if (typeof b.remove === 'string') list = writePrompts(cfg, deletePrompt(list, b.remove));
  if (typeof b.move === 'string') list = writePrompts(cfg, movePrompt(list, b.move, Number(b.by) || 1));
  if (b.starters === true) {
    let l = list;
    for (const s of STARTERS) if (!l.some((x) => x.name === s.name)) { const r = savePrompt(l, s); if (r.list) l = r.list; }
    list = writePrompts(cfg, l);
  }
  send(res, 200, promptsView(cfg, { canPick }));
  return true;
}
