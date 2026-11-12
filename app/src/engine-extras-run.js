// The running side of the engine and speed extras (engine-extras.js, list items 94-100): what server.js starts once.
// Every part checks its own switch each time, so turning one off in Settings stops it at once, with no restart.
import fs from 'node:fs';
import { ENGINES, engineFor, installedMarker, brainsEngineNow } from './engines.js';
import { logReply } from './speed-log.js';
import { modelFor } from './sessions.js';
import { freeMemNow } from './platform.js';
import { speedTest } from './speed-test.js';
import { plainEngineNotes, extraOn, handoffHat, warmRoom, warmFile, onBattery, setOnBattery, batteryNow, cardChange, placesToAuto, cardName } from './engine-extras.js';

export const BATTERY_MS = 60e3; // how often Laptop mode looks at the battery
export const CARD_WAIT_MS = 30e3; // a new card's test waits until Bob has been free this long

// The engine's name and version, for the speed history ("Brain Engine brain-engine-v4", "llama.cpp b12282", "Ollama").
export function engineLabel(cfg) {
  const id = brainsEngineNow(cfg);
  if (id === 'ollama') return 'Ollama';
  const e = engineFor(ENGINES.find((x) => x.id === id));
  let v = '';
  try { v = installedMarker(cfg, e)?.version || ''; } catch {}
  return `${e?.name || id}${v ? ` ${v}` : ''}`;
}

// 99: what the engine in use now changed, in plain words ('' for Ollama or a build with no note).
export function currentEngineNote(cfg) {
  const id = brainsEngineNow(cfg);
  if (id === 'ollama') return '';
  let v = '';
  try { v = installedMarker(cfg, engineFor(ENGINES.find((x) => x.id === id)))?.version || ''; } catch {}
  return v ? plainEngineNotes(id, { to: v }) : '';
}

export function startEngineExtras({ cfg, brain, hardware = async () => null, say = () => {}, setTimer = setTimeout, clearTimer = clearTimeout, battery = onBattery, warm = warmFile, freeBytes = () => freeMemNow(), test = speedTest } = {}) {
  const engine = brain?.engine;
  const log = (t) => { try { brain.log?.('engine', t); } catch {} };
  let label = '', labelAt = 0;
  // 96 Speed history: one number per reply, kept per day (the engine's version is read at most once a minute).
  if (engine) engine.onStats = (st) => {
    if (!extraOn(cfg, 'speedLog')) return;
    if (Date.now() - labelAt > 60e3) { label = engineLabel(cfg); labelAt = Date.now(); }
    logReply(cfg, st, label);
  };
  // 95 Load the next brain early: a hand-off to another brain is seen while it is still being written.
  const warmed = new Map(); // model -> when it was last read ahead (a hand-off streams in many pieces)
  if (engine) engine.onToolCall = (name, args) => {
    if (!extraOn(cfg, 'preloadNext') || typeof engine.resolve !== 'function') return;
    const hat = handoffHat(name, args);
    if (!hat) return;
    let model = '';
    try { model = modelFor(cfg, hat)?.model || ''; } catch {}
    if (!model || model === engine.current || Date.now() - (warmed.get(model) || 0) < 120e3) return;
    warmed.set(model, Date.now());
    let file = '', size = 0;
    try { file = engine.resolve(model).gguf; size = fs.statSync(file).size; } catch { return; }
    if (!warmRoom(size, freeBytes())) { log(`next brain ${model}: not read ahead, too little free memory`); return; }
    const t0 = Date.now();
    if (warm(file, { done: (ok) => log(`next brain ${model}: ${ok ? `read ahead in ${((Date.now() - t0) / 1000).toFixed(1)} s` : 'couldn\'t read ahead'}`) })) log(`next brain ${model}: reading it ahead while the hand-off is written`);
  };
  // 98 Laptop mode: a look at the battery once a minute while the switch is on.
  let bTimer = null;
  const look = async () => {
    bTimer = null;
    if (!extraOn(cfg, 'laptopMode')) { setOnBattery(null); return; }
    const was = batteryNow();
    let now = null;
    try { now = await battery(); } catch {}
    setOnBattery(now);
    if (was !== null && now !== was && (now === true || now === false)) say(now ? 'On battery now: my Quick brain answers the chat and the engine uses fewer cores, from the next time a brain loads. (Laptop mode)' : 'Plugged in again: back to my usual brains. (Laptop mode)');
    bTimer = setTimer(look, BATTERY_MS); bTimer?.unref?.();
  };
  const laptopChanged = () => { if (bTimer) { clearTimer(bTimer); bTimer = null; } look().catch(() => {}); };
  if (extraOn(cfg, 'laptopMode')) laptopChanged();
  // 97 Test a new card by itself: at start, compared with the card seen last time.
  const cardCheck = async ({ saveSettings, wait = CARD_WAIT_MS } = {}) => {
    if (!extraOn(cfg, 'newCardTest')) return null;
    let hw = null;
    try { hw = await hardware(); } catch {}
    const c = cardChange(cfg, hw?.gpu);
    if (!c.changed) return c;
    const run = async () => {
      if (brain.turns?.size || brain.speedTesting || brain.queue?.some((j) => j.state === 'working' || j.state === 'waiting')) { const t = setTimer(run, wait); t?.unref?.(); return; }
      const back = placesToAuto(cfg.brainPlace);
      if (back.changed && saveSettings) saveSettings(cfg, { brainPlace: back.brainPlace });
      say(`I see a new graphics card (${cardName(c.to)}, was ${cardName(c.from)}). Running a one-minute speed test${back.changed ? `, and ${back.changed} brain${back.changed > 1 ? 's' : ''} set by hand ${back.changed > 1 ? 'are' : 'is'} back on Auto (By hand on the Brains page puts the number back)` : ''}.`);
      try { const r = await test(brain); say(`New card speed test: first word in ${r.first.firstWord} s, ${r.first.perSecond ?? '?'} words a second. It's in the table in Settings, Speed & memory.`); }
      catch (e) { say(`The new card speed test didn't run: ${e.message}`); }
    };
    const t = setTimer(run, wait); t?.unref?.();
    return c;
  };
  return { laptopChanged, cardCheck };
}
