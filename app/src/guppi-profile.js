// This PC's GUPPI profile (guppi-calibrate.js makes it; llamacpp.js reads it at each load). Kept apart from the
// calibration job so the engine reads it without loading the Lab. <data>/conductor/pc-profile.json:
//   { v: 1, at, pc: { os, cardGB, ramGB, sharedGraphics, be, gpu, cardMiB, idleC, ... }, brains: { [model]: { cap,
//     keepBob, beatsBob, speeds, rows, why, ... } } }
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanSpeeds } from './conductor.js';
import { cardGB } from './tuning.js';
import { OS } from './platform.js';

const round1 = (n) => Math.round(n * 10) / 10;
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8').replace(/^﻿/, '')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + '.part', JSON.stringify(v, null, 1)); fs.renameSync(f + '.part', f); };

export const profileFile = (cfg) => (cfg?.dataDir ? path.join(cfg.dataDir, 'conductor', 'pc-profile.json') : '');
export const speedsFile = (cfg) => (cfg?.dataDir ? path.join(cfg.dataDir, 'conductor', 'speeds.json') : '');
export const readProfile = (cfg) => { const f = profileFile(cfg); const p = f ? readJson(f, null) : null; return p && typeof p === 'object' && p.v === 1 && p.brains && typeof p.brains === 'object' ? p : null; };
export const saveProfile = (cfg, p) => writeJson(profileFile(cfg), p);

// this PC as a profile is matched against it: the card's size, the RAM, built-in graphics or not, the engine build
export const pcNow = (cfg, { beNo = 0, ramBytes = os.totalmem(), osKey = OS } = {}) => ({ os: osKey, cardGB: cardGB(cfg), ramGB: round1(ramBytes / 2 ** 30), sharedGraphics: cfg?.sharedGraphics === true, be: Number(beNo) || 0 });
// '' when the profile was made on this PC as it is now, else why not
export function pcChanged(saved, now) {
  if (!saved || !now) return 'no profile';
  if (saved.be !== now.be) return `it was made with Brain Engine ${saved.be || '?'} and this is ${now.be || 'not Brain Engine'}`;
  if (Math.abs((saved.cardGB || 0) - (now.cardGB || 0)) >= 0.5) return `it was made on a ${saved.cardGB} GB card and this one has ${now.cardGB} GB`;
  if (Math.abs((saved.ramGB || 0) - (now.ramGB || 0)) >= 1) return `it was made with ${saved.ramGB} GB of RAM and this computer has ${now.ramGB} GB`;
  if (Boolean(saved.sharedGraphics) !== Boolean(now.sharedGraphics)) return 'the graphics changed';
  return '';
}
// For GUPPI at load: { cap, keepBob, why } for this brain, { stale } when the profile doesn't fit this PC, or null.
export function profileFor(cfg, model, now, { profile = readProfile(cfg) } = {}) {
  const b = profile?.brains?.[model];
  if (!b) return null;
  const changed = pcChanged(profile.pc, now);
  if (changed) return { stale: changed };
  return { cap: Number(b.cap) > 0 ? Number(b.cap) : 0, keepBob: b.keepBob === true, why: String(b.why || ''), ...(Number(b.fitTargetMiB) > 0 ? { fitTargetMiB: Number(b.fitTargetMiB) } : {}), ...(b.wddmBudget === true ? { wddmBudget: true } : {}), ...(Number.isInteger(b.cpuMoe) && b.cpuMoe >= 0 ? { cpuMoe: b.cpuMoe } : {}) };
}
// The speeds GUPPI measured go into his own speeds file (conductor.js cleanSpeeds), replacing what he had for those
// steps, so his load step is picked from this PC's numbers from the first reply. Another build's file starts over.
export function seedSpeeds(cfg, model, speeds, beNo) {
  const f = speedsFile(cfg); if (!f) return false;
  const all = cleanSpeeds(readJson(f, null), beNo);
  const had = all[model] || { read: {}, write: {} };
  all[model] = { read: { ...had.read, ...speeds.read }, write: { ...had.write, ...speeds.write } };
  if (had.old) { // measured now: no longer old
    const old = { read: (had.old.read || []).filter((x) => !(x in speeds.read)), write: (had.old.write || []).filter((x) => !(x in speeds.write)) };
    if (old.read.length || old.write.length) all[model].old = old;
  }
  try { writeJson(f, { be: beNo, speeds: all }); return true; } catch { return false; }
}

// Nov 27 (the owner: "didn't we do that already?"): the Brains page's Calibrate (brain-calibrate.js) timed each reading
// step on this PC, with and without the copy cache, but GUPPI never read it. Now, for a brain GUPPI has no speeds for,
// its copy-cache rows are his starting point (marked old, so his first real measurement of a step replaces it). Only
// the rows with the cache count: that's how GUPPI runs a brain he drives with one. -> { read, write, old } or null
const CAL_STEPS = { normal: 512, faster: 2048, fastest: 4096 };
const calSlug = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'lab-brain'; // lab-measure.js slugOf
export function calibrateSpeeds(cfg, model) {
  if (!cfg?.dataDir || !model) return null;
  const rec = readJson(path.join(cfg.dataDir, 'lab', 'calibrate', `${calSlug(model)}.json`), [])?.[0];
  if (!rec || rec.model !== model || !Array.isArray(rec.speedRows)) return null;
  const out = { read: {}, write: {} };
  for (const r of rec.speedRows) {
    const step = CAL_STEPS[r?.reading];
    if (!step || r.cache !== true || r.failed || r.turbo) continue;
    if (Number(r.readTps) > 0) out.read[step] = Number(r.readTps);
    if (Number(r.tps) > 0) out.write[step] = Number(r.tps);
  }
  if (!Object.keys(out.write).length) return null;
  out.old = { read: Object.keys(out.read).map(Number), write: Object.keys(out.write).map(Number) };
  return out;
}

// Nov 27, the laptop's third run: the engine's own fit kept Inkling 2 Mini at 300 MB free and 2.8 GB spilled whatever
// room it was told to leave, so GUPPI times the brain where Bob really runs it: the number of layers whose experts sit
// in RAM set on the Brains page (By hand), else the fastest one the Brains page's Calibrate found by hand. null: the fit.
export function placeFor(cfg, model) {
  const pin = cfg?.llamacpp?.nCpuMoe?.[model];
  if (Number.isInteger(pin) && pin >= 0) return { cpuMoe: pin, from: 'the Brains page (By hand)' };
  if (!cfg?.dataDir || !model) return null;
  const rec = readJson(path.join(cfg.dataDir, 'lab', 'calibrate', `${calSlug(model)}.json`), [])?.[0];
  if (!rec || rec.model !== model) return null;
  if (rec.best?.mode === 'hand' && Number.isInteger(rec.best.cpuMoe)) return { cpuMoe: rec.best.cpuMoe, from: 'the Brains page\'s Calibrate' };
  return null;
}
