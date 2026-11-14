// Nov 13 (the owner: "my computer was locked up solid"): a Riker test held the graphics card, a message woke Bob's
// own brain on top of it, the card and then the RAM filled, and the PC froze for four minutes. A reliability fix, so
// it is always on: before Bob loads a brain on the card he looks at it (nvidia-smi, about 50 ms). When another
// program holds a real share of it (2 GB or more) and the brain won't fit in what's left, he doesn't load. He says so
// at once and asks: wait for the card, use the brain already on it (a test that can pause, pauses after its step),
// ask another of his Bobs, or leave it. Nothing else on the card: Bob places his brain as always (part on the
// processor is fine then). A card that can't be read (no NVIDIA card): no guard, as before.
//
// The test pause (model-lab/common.mjs cardPausePoint): Bob writes card-pause.json in the Agent folder; a lab script
// that knows it finishes its step, writes card-paused.json with its server's address, puts every expert back on, and
// waits. Bob answers on that brain, then deletes card-pause.json, and the script carries on where it was.
import fs from 'node:fs';
import path from 'node:path';
import { NEED_MB } from './card-busy.js';

export const HELD_MB = NEED_MB; // another program holding less than this isn't "busy" (a browser, an overlay)
export const DESKTOP_MB = 1536; // Windows, the desktop and browsers, when the card can't say who holds what
export const SPARE_MB = 768; // left free on the card after a load, so Windows itself never runs out
export const PAUSE_FILE = 'card-pause.json', PAUSED_FILE = 'card-paused.json', TEST_FILE = 'card-test.json';
export const TEST_FRESH_MS = 2 * 3600e3; // a test that checked in within this time can pause (one step can take a while)
export const PAUSE_STALE_MS = 30 * 60e3; // a pause nobody lifted (Bob closed mid-reply): the test carries on after this
export const PAUSE_WAIT_MS = 15 * 60e3; // how long Bob waits for a test to finish its step

const gb = (mb) => `${(Math.max(0, mb) / 1024).toFixed(1)} GB`;

// How much of the card other programs hold: their own figures when known, else what's used that isn't Bob's.
export function heldByOthers(card, ownMB = 0) {
  if (!card || !(card.others || []).length) return 0;
  const sum = card.others.reduce((t, a) => t + (Number(a.mb) || 0), 0);
  if (sum > 0) return sum;
  // named, no sizes: what's used that isn't Bob's, less what Windows, the desktop and browsers usually hold
  return Number.isFinite(card.totalMB) ? Math.max(0, card.totalMB - card.freeMB - ownMB - DESKTOP_MB) : HELD_MB;
}

// null = go ahead. Otherwise { needMB, roomMB, heldMB, others, line }.
// card: readCardUse() with Bob's own engine ids. needMB: the brain (file plus chat memory). ownMB: what Bob's own
// brains hold on the card now (he lets go of those before a load, so it counts as room).
export function guardLoad({ card, needMB, ownMB = 0 } = {}) {
  if (!card || !Number.isFinite(card.freeMB) || !(needMB > 0)) return null;
  const heldMB = heldByOthers(card, ownMB);
  if (heldMB < HELD_MB) return null;
  const roomMB = Math.max(0, card.freeMB + Math.max(0, ownMB) - SPARE_MB);
  if (needMB <= roomMB) return null;
  return { needMB, roomMB, heldMB, others: card.others, line: busyLoadLine({ others: card.others, heldMB, needMB, roomMB }) };
}

export function whoHolds(others = []) {
  const top = [...others].sort((a, b) => (b.mb || 0) - (a.mb || 0)).slice(0, 2).map((a) => (a.mb ? `${a.name}, ${gb(a.mb)}` : a.name));
  return top.length ? top.join('; ') : 'another program';
}
export function busyLoadLine({ others, heldMB, needMB, roomMB }) {
  const names = [...new Set([...(others || [])].sort((a, b) => (b.mb || 0) - (a.mb || 0)).map((a) => a.name))].slice(0, 2);
  return `⚠ The graphics card is busy: ${names.length ? names.join(' and ') : 'another program'} ${names.length > 1 ? 'hold' : 'holds'} about ${gb(heldMB)} of it. This brain needs about ${gb(needMB)} and only ${gb(roomMB)} is left, so loading it now could fill the card and memory and freeze this computer. I haven't loaded it.`;
}
// The short form, for the status line and the brain chip: "Card busy: llama-server, 11.2 GB".
export const busyShort = (others) => `Card busy: ${whoHolds(others)}`;

// The choices on the card. brainOnCard: a brain server is running there (a test). borrow: another Bob is set up.
export const CHOICE = {
  wait: 'Wait for the card, then load my brain',
  use: 'Use the brain already on the card',
  borrow: 'Ask another of my Bobs',
  leave: 'Leave it for now'
};
export function busyChoices({ brainOnCard = false, borrow = false } = {}) {
  return [CHOICE.wait, ...(brainOnCard ? [CHOICE.use] : []), ...(borrow ? [CHOICE.borrow] : []), CHOICE.leave];
}
export const USE_NOTE = 'A test that can pause stops after its current step and waits for my answer; an older test keeps running, and its timings will be off while I use its brain.';
// What the person picked, as a key. No answer (or anything else): wait, the safe one.
export function pickedKey(said = '') {
  const t = String(said || '').trim();
  for (const [k, v] of Object.entries(CHOICE)) if (t === v) return k;
  return 'wait';
}

// A brain server (llama-server) on the card that Bob didn't start: its address from its command line, or ''.
export function serverUrlFrom(cmdLine = '') {
  const s = String(cmdLine || '');
  if (!/llama-server/i.test(s)) return '';
  const port = Number((/(?:^|\s)--port[\s=]+(\d{2,5})/.exec(s) || [])[1]) || 8080;
  let host = (/(?:^|\s)--host[\s=]+([^\s"']+)/.exec(s) || [])[1] || '127.0.0.1';
  if (host === '0.0.0.0' || host === '::') host = '127.0.0.1';
  return `http://${host.includes(':') ? `[${host}]` : host}:${port}`;
}

// ---- the test pause (the Agent folder) ----
export const pauseFile = (dir) => path.join(dir, PAUSE_FILE);
export const pausedFile = (dir) => path.join(dir, PAUSED_FILE);
export function askPause(dir, { why = 'Bob has a message to answer', now = Date.now } = {}) {
  try { fs.writeFileSync(pauseFile(dir), JSON.stringify({ from: 'Bob', why, at: now() })); return true; } catch { return false; }
}
export function liftPause(dir) { try { fs.rmSync(pauseFile(dir), { force: true }); } catch {} }
// The test's answer: { url, at } once it has paused, else null.
export function pausedTest(dir, { now = Date.now } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(pausedFile(dir), 'utf8').replace(/^﻿/, ''));
    if (!j || typeof j.url !== 'string' || !/^https?:\/\//.test(j.url)) return null;
    if (now() - Number(j.at || 0) > PAUSE_STALE_MS) return null;
    return { url: j.url.replace(/\/$/, ''), at: Number(j.at) || 0 };
  } catch { return null; }
}
// A test that can pause (it called cardPausePoint lately): { url, at }, else null.
export function pausableTest(dir, { now = Date.now } = {}) {
  try {
    const j = JSON.parse(fs.readFileSync(path.join(dir, TEST_FILE), 'utf8').replace(/^\uFEFF/, ''));
    if (!j || typeof j.url !== 'string' || !/^https?:\/\//.test(j.url) || now() - Number(j.at || 0) > TEST_FRESH_MS) return null;
    return { url: j.url.replace(/\/$/, ''), at: Number(j.at) || 0 };
  } catch { return null; }
}
