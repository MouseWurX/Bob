// The Hands part of Bob's API. Changing settings, recipes and Undo only work on the PC itself; Stop works from
// anywhere Bob's window is open (stopping is always allowed).
//   GET  /api/hands            settings, the list of Hands, folders, recipes, recent file jobs and runs, what's running
//   POST /api/hands/settings   { enabled?, free?, limits: { <limit>: bool }?, files: { on }?, run: { on }?, folders?, timeoutMin? }
//                              free = "Let Bob work without asking"; limits = the hard limits (hands-settings.js LIMITS)
//   POST /api/hands/stop       { runId }  stop one running command
//   POST /api/hands/stop-all   stop everything a Hand is doing, deny waiting Hand cards, all Hands off
//   POST /api/hands/hold       { held } the chat-page kill switch: true stops (works from anywhere), false only on the PC
//                              and only when Settings has Hands on; it never changes Settings
//   POST /api/hands/undo       { id? }    undo a file job (the user's own click is the approval)
//   POST /api/hands/recipes    { save: { name, cmd, args, cwd } } or { remove: name }
//   POST /api/hands/selftest   run the self-test in a throwaway folder (the user's click; nothing of theirs is touched)
//   POST /api/hands/pwned      { prefix } the "Check a password safely" box: the first 5 characters of the password's
//                              SHA-1 (made in the window) go to Have I Been Pwned; the list comes back to the window,
//                              which finds the match itself. The password and its full scramble never reach Bob.
//   POST /api/hands/run-recipe { name }  run a recipe now (the user's click is the approval; output goes to the chat)
import { handsView, stopRun, stopEverything, holdHands, saveRecipe, removeRecipe, loadRecipes, runApproved } from './hands.js';
import { handsSettings, cleanHands, HANDS, LIMITS, handOn } from './hands-settings.js';
import fs from 'node:fs';
import { undoJob } from './hands-files.js';
import { selfTest } from './hands-selftest.js';
import { pwnedRange } from './security-web.js';
const isDir = (f) => { try { return fs.statSync(f).isDirectory(); } catch { return false; } };

export async function handsRoute({ req, p, isLocal, brain, cfg, body, send, res }) {
  if (!p.startsWith('/api/hands')) return false;
  if (req.method === 'GET' && p === '/api/hands') { send(res, 200, handsView(cfg)); return true; }
  if (req.method !== 'POST') { send(res, 404, { error: 'not found' }); return true; }
  const b = await body(req);
  if (p === '/api/hands/stop-all') { send(res, 200, { stopped: stopEverything(brain), ...handsView(cfg) }); return true; }
  if (p === '/api/hands/hold' && b.held === true) { send(res, 200, { stopped: holdHands(brain, true), ...handsView(cfg) }); return true; }
  if (p === '/api/hands/stop') { const ok = stopRun(String(b.runId || '')); if (ok) brain.log('hands', `Stop pressed on run ${b.runId}`); send(res, ok ? 200 : 404, { ok }); return true; }
  if (!isLocal) { send(res, 403, { error: 'Hands can only be changed on the PC itself.' }); return true; }
  try {
    if (p === '/api/hands/settings') {
      const cur = handsSettings(cfg);
      const next = { ...cur };
      if ('enabled' in b) next.enabled = b.enabled === true;
      if ('free' in b) next.free = b.free === true;
      const limitNotes = [];
      if (b.limits && typeof b.limits === 'object') {
        next.limits = { ...cur.limits };
        for (const k of Object.keys(LIMITS)) if (k in b.limits) {
          next.limits[k] = b.limits[k] !== false;
          if (next.limits[k] !== cur.limits[k]) limitNotes.push(next.limits[k] ? `hard limit "${LIMITS[k].label}" back on` : `hard limit "${LIMITS[k].label}" switched OFF: ${LIMITS[k].off}`);
        }
      }
      for (const id of Object.keys(HANDS)) if (b[id] && typeof b[id] === 'object' && 'on' in b[id]) next[id] = { on: b[id].on === true };
      if (Array.isArray(b.folders)) next.folders = b.folders.filter((f) => typeof f === 'string' && isDir(f)); // only folders that exist
      if ('timeoutMin' in b) next.timeoutMin = b.timeoutMin;
      const clean = cleanHands(next);
      brain.saveHands(clean);
      const changed = Object.keys(b).filter((k) => k !== 'limits').map((k) => (typeof b[k] === 'object' && !Array.isArray(b[k]) ? `${k} ${b[k].on ? 'on' : 'off'}` : k === 'enabled' ? `Hands ${b.enabled ? 'on' : 'off'}` : k === 'free' ? `work without asking ${b.free ? 'ON (no approval cards)' : 'off (asks again)'}` : k));
      brain.log('hands', `settings: ${[...changed, ...limitNotes].join(', ')}`);
      send(res, 200, handsView(cfg));
      return true;
    }
    if (p === '/api/hands/hold') { holdHands(brain, false); send(res, 200, handsView(cfg)); return true; }
    if (p === '/api/hands/undo') {
      const r = undoJob(cfg, b.id ? String(b.id) : '');
      brain.log('hands', `undo (your click): ${r.job.label}: ${r.done.length} done${r.failed.length ? `, ${r.failed.length} failed` : ''}`);
      send(res, 200, { done: r.done, failed: r.failed, manual: r.manual, ...handsView(cfg) });
      return true;
    }
    if (p === '/api/hands/pwned') {
      if (!handOn(cfg, 'security')) throw new Error('Turn on Hands and "Security and privacy" first.');
      send(res, 200, { range: await pwnedRange(String(b.prefix || '')) }); // nothing about it goes in the logbook
      return true;
    }
    if (p === '/api/hands/selftest') { send(res, 200, await selfTest(cfg, { log: (k, t) => brain.log(k, t) })); return true; }
    if (p === '/api/hands/run-recipe') {
      if (!handOn(cfg, 'run')) throw new Error('The Run Hand is off. Turn on Hands and "Run programs and scripts" first.');
      const r = loadRecipes(cfg).find((x) => x.name.toLowerCase() === String(b.name || '').toLowerCase());
      if (!r) throw new Error('No recipe with that name.');
      brain.log('hands', `recipe "${r.name}" started by your click`);
      runApproved(cfg, r, { emit: (ev) => brain.broadcast({ ...ev, recipe: r.name }), log: (k, t) => brain.log(k, t) }).catch((e) => brain.broadcast({ type: 'error', text: e.message }));
      send(res, 200, { ok: true });
      return true;
    }
    if (p === '/api/hands/recipes') {
      if (b.save) { saveRecipe(cfg, { name: b.save.name, cmd: String(b.save.cmd || ''), args: [].concat(b.save.args || []).map(String), cwd: String(b.save.cwd || '') }); brain.log('hands', `recipe saved: ${b.save.name}`); }
      if (b.remove) { removeRecipe(cfg, b.remove); brain.log('hands', `recipe removed: ${b.remove}`); }
      send(res, 200, { recipes: loadRecipes(cfg) });
      return true;
    }
  } catch (e) { send(res, 409, { error: e.message }); return true; }
  send(res, 404, { error: 'not found' });
  return true;
}
