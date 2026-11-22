// The Brain Engine's live expert mask (patch 0001) from a keep list (22 Nov 2026; the owner: REAP keep levels "top 90%,
// top 80%, top 75%, top 65% top 60%, top 50%, and gets tool scores for each level"). Nothing is cut or written to the
// brain: the server only routes each word among the experts kept, until --off (or the server stops).
//   node expert-mask.mjs --url <server> --keep <keep.json from trace-read --mass>   |   --off
// Exit 86 (the Forge's gate stop: no more commands, the pod is deleted) when the keep list is missing or the server refuses
// the mask, so a plan's next jobs never run on a brain that isn't masked as labelled.
import fs from 'node:fs';
import { opts } from './common.mjs';
import { live } from './engine-live.mjs';

const o = opts();
if (!o.url || (!o.keep && !o.off)) { console.log('node expert-mask.mjs --url <server> --keep <keep.json> | --off'); process.exit(1); }
const api = live(String(o.url));
if (o.off) { try { await api.setMask(null); } catch (e) { console.log(`GATE STOP: the expert mask could not be switched off (${String(e.message).slice(0, 200)})`); process.exit(86); } console.log('expert mask off: every expert is back'); process.exit(0); }
let k;
try { k = JSON.parse(fs.readFileSync(String(o.keep), 'utf8').replace(/^﻿/, '')); } catch (e) { console.log(`GATE STOP: no keep list at ${o.keep} (${e.message})`); process.exit(86); }
const keep = Array.isArray(k) ? k : k.keep;
if (!Array.isArray(keep) || !keep.some((l) => Array.isArray(l) && l.length)) { console.log(`GATE STOP: ${o.keep} holds no per-layer keep list`); process.exit(86); }
try { await api.setMask(keep); } catch (e) { console.log(`GATE STOP: the server refused the expert mask (${String(e.message).slice(0, 200)})`); process.exit(86); }
const n = keep.filter(Array.isArray).map((l) => l.length);
console.log(`expert mask on from ${o.keep}${k.share ? ` (top ${Math.round(k.share * 100)}%)` : ''}: ${n.length} layers, ${Math.min(...n)}-${Math.max(...n)} experts kept per layer`);
