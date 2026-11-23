// 23 Nov 2026: the games from the game runs (game-jobs.mjs), shuffled and labelled blind for the owner to play: each
// game gets a letter ("Emberfall C"), a Play.cmd that opens it in Godot, and its checker result. Which brain and seed
// made each one is written to a separate key file, to open only after playing.
//   node game-blind.mjs --runs "q2=../../bob-model-lab/out/gq2-games,iq3=...,q4=..." --out <folder> --godot <Godot exe> [--seed 5]
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { pathToFileURL } from 'node:url';

const NAMES = { emberfall: 'Emberfall', 'lantern-run': 'Lantern Run' };

function copyTree(a, b) {
  fs.mkdirSync(b, { recursive: true });
  for (const e of fs.readdirSync(a, { withFileTypes: true })) { if (e.name === '.godot') continue; const x = path.join(a, e.name), y = path.join(b, e.name); if (e.isDirectory()) copyTree(x, y); else if (e.isFile()) fs.copyFileSync(x, y); }
}
// a shuffle that is the same for the same seed (so a re-run gives the same letters)
function shuffle(list, seed) {
  const out = [...list]; let h = crypto.createHash('sha256').update(String(seed)).digest();
  for (let i = out.length - 1; i > 0; i--) { h = crypto.createHash('sha256').update(h).digest(); const k = h.readUInt32BE(0) % (i + 1); [out[i], out[k]] = [out[k], out[i]]; }
  return out;
}

export function blind(runs, { out, godot = '', seed = 1 } = {}) {
  const games = [];
  for (const [label, dir] of Object.entries(runs)) {
    let rows = [];
    try { rows = fs.readFileSync(path.join(dir, 'runs.jsonl'), 'utf8').replace(/\r\n/g, '\n').split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch {}
    for (const r of rows) if (r.game) games.push({ brain: label, id: r.id, key: r.key, seed: r.seed ?? null, src: r.game.kept ? path.join(dir, r.game.kept) : '', passed: r.game.passed, nudges: r.game.nudges, problems: r.game.checks?.at(-1)?.problems || [], files: r.game.files || 0, minutes: Math.round((Number(r.secs) || 0) / 6) / 10 });
  }
  const key = [], letters = {};
  for (const g of shuffle(games, seed).sort((a, b) => String(a.key).localeCompare(String(b.key)))) {
    letters[g.key] = (letters[g.key] || 0) + 1;
    const name = `${NAMES[g.key] || g.key} ${String.fromCharCode(64 + letters[g.key])}`;
    const to = path.join(out, name);
    fs.rmSync(to, { recursive: true, force: true }); fs.mkdirSync(to, { recursive: true });
    if (g.src && fs.existsSync(g.src) && g.files) copyTree(g.src, path.join(to, 'game'));
    const has = fs.existsSync(path.join(to, 'game', 'project.godot'));
    if (has && godot) fs.writeFileSync(path.join(to, 'Play.cmd'), `@echo off\r\ncd /d "%~dp0game"\r\n"${godot.replace(/\//g, '\\')}" --path .\r\n`);
    fs.writeFileSync(path.join(to, 'checker.txt'), (g.passed ? 'The checker passed this game.' : has ? `The checker still found problems:\n${g.problems.map((p) => `- ${p}`).join('\n')}` : 'Bob did not make a Godot project for this one.') + `\nNudges used: ${g.nudges}\n`);
    key.push({ game: name, brain: g.brain, seed: g.seed, passed: g.passed, nudges: g.nudges, minutes: g.minutes, files: g.files });
  }
  fs.writeFileSync(path.join(out, 'WHO MADE WHICH - open after playing.json'), JSON.stringify(key, null, 1));
  return key;
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  const runs = Object.fromEntries(String(opt('runs')).split(',').filter(Boolean).map((x) => { const i = x.indexOf('='); return [x.slice(0, i).trim(), path.resolve(x.slice(i + 1).trim())]; }));
  if (!Object.keys(runs).length || !opt('out')) { console.error('--runs "label=dir,..." and --out <folder> are needed'); process.exit(1); }
  const godot = opt('godot') ? path.resolve(opt('godot')) : '';
  const key = blind(runs, { out: path.resolve(opt('out')), godot, seed: opt('seed') || 1 });
  console.log(`${key.length} games labelled in ${opt('out')}; ${key.filter((k) => k.passed).length} passed the checker`);
}
