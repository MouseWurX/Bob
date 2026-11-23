// 23 Nov 2026 (the owner: "could we have each version produce a game that we can try? same prompt? same seed ... same
// settings", then "game 1: a modern 3d fighter game ... game 2: a side scroller game ... define the rules ... they need a
// mcguffin", and Godot): two game jobs Bob builds in Godot 4 with his own file tools, one prompt each, the same for every
// brain. A seed does not carry over between file sizes, so each job runs at seeds 1, 2 and 3 and every game is kept.
// The checker (godot-check.mjs) runs each game headless; on a fail Bob is sent its problems word for word (do-jobs
// --nudges). 23 Nov (Q2 and Q4 both pointed project.godot at a main scene they never wrote, and used Godot 3 names):
// FINISH asks for every loaded file under its exact name and for the Godot 4 API, the same words for every brain.
// These are held-out: never tuned on, never made into lessons. All names here are made up for this test.
//   node game-jobs.mjs [--seeds 1,2,3] [--out <jobs.jsonl>]
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { count, said } from './godot-check.mjs';

const GODOT = 'Godot 4.7 (GDScript only, no C#, no add-ons, nothing downloaded: build every model, level and effect from Godot\'s own meshes, shapes, materials, particles and code; sound is optional and, if any, made in code)';
const CONTROLS = 'Keyboard and a game controller both work (set up named input actions in the project\'s Input Map with keys and controller buttons). Show the controls on the title screen.';
const FINISH = 'Make it a complete Godot project in that folder: project.godot with the main scene set, the scenes (.tscn) and scripts (.gd). Every scene or script that project.godot or your code loads must exist under exactly that name and letter case. Use the Godot 4 API, not Godot 3. It must open and run in Godot with no errors. When you are done, say how to run it and what is in it.';

export const GAME_JOBS = [
  {
    key: 'emberfall', dir: 'C:\\Users\\you\\Documents\\Games\\Emberfall', dim: '3d',
    text: [
      `Make me an original 3D fighting game called "Emberfall" in ${GODOT}, in the project folder C:\\Users\\you\\Documents\\Games\\Emberfall.`,
      'The rules:',
      '- The prize: the Ember Crown, a burning crown that breaks into three shards whenever it is won. Win a match and you take a shard; the crown on the arena altar glows brighter with each one.',
      '- 3 original fighters, each with their own look, speed and power: a quick one, a heavy one and an all-rounder, and one special move each.',
      '- You against the computer. Best of 3 rounds, 60 seconds a round, a health bar for each fighter, the round timer and the round winner on screen.',
      '- Moves: walk, jump, crouch, block, light and heavy punch, light and heavy kick, a throw and the special. Landing hits fills a power meter; a full meter unlocks that fighter\'s super move.',
      '- Hits chained in a short window show a combo count. Blocked hits still do a little damage.',
      '- Win three matches against three opponents (one shard each) and the crown is yours: an ending screen. Lose a match and it is game over, with a restart.',
      '- A real 3D arena: camera that follows the fight, lights, hit effects. Fighters can be built from simple shapes.',
      CONTROLS, FINISH
    ].join('\n'),
    check: (f) => {
      const p = [];
      if (!count(f, 'Camera3D')) p.push('There is no Camera3D in the running game, so it is not a 3D game.');
      if (count(f, 'MeshInstance3D', 'CSGBox3D', 'CSGSphere3D', 'CSGCylinder3D', 'CSGCombiner3D', 'CSGMesh3D', 'CSGPolygon3D', 'CSGTorus3D') < 4) p.push('Fewer than 4 3D shapes (MeshInstance3D or CSG) are in the running game: there is no arena with two fighters to see.');
      if (count(f, 'CharacterBody3D', 'RigidBody3D', 'Node3D') < 2) p.push('There are not two fighters (two 3D bodies) in the running game.');
      if (count(f, 'ProgressBar', 'TextureProgressBar') < 2 && !said(f, /\b(hp|health)\b/i)) p.push('No health bars are on screen (two ProgressBar nodes, or the word health or HP).');
      if (!said(f, /round/i)) p.push('The word "Round" never shows on screen, so the round is not shown.');
      if (!said(f, /\b\d{1,2}\b/)) p.push('No number shows on screen, so the round timer is not shown.');
      return p;
    }
  },
  {
    key: 'lantern-run', dir: 'C:\\Users\\you\\Documents\\Games\\LanternRun', dim: '2d',
    text: [
      `Make me an original side-scrolling platform game called "Lantern Run" in ${GODOT}, in the project folder C:\\Users\\you\\Documents\\Games\\LanternRun.`,
      'The rules:',
      '- The prize: the Last Lantern, the only light left in a town whose night was stolen. The crow king broke it into 3 glass pieces and hid one at the end of each world.',
      '- Run, jump (hold to jump higher), and stomp enemies by landing on them.',
      '- Sparks to collect: 100 sparks is an extra life. A flame power-up lets you throw fireballs and take one extra hit.',
      '- 3 lives, a score, a timer for each level, blocks to bump from below, gaps and spikes, and a checkpoint in the middle of each level.',
      '- At least 3 kinds of enemy: walkers, flyers, and one that has to be hit twice.',
      '- 3 short levels (one per world), each ending with a lantern piece; the last ends with a boss fight against the crow king.',
      '- Game over with a restart when the lives run out; a win screen when the lantern is lit again.',
      '- A camera that follows the player along the level.',
      CONTROLS, FINISH
    ].join('\n'),
    check: (f) => {
      const p = [];
      if (!count(f, 'CharacterBody2D', 'RigidBody2D')) p.push('There is no player body (CharacterBody2D) in the running game.');
      if (!count(f, 'Camera2D')) p.push('There is no Camera2D, so the screen does not follow the player along the level.');
      if (count(f, 'CharacterBody2D', 'RigidBody2D', 'Area2D', 'AnimatableBody2D') < 3) p.push('Fewer than 3 moving or touchable things (player, enemies, pickups) are in the running level.');
      if (!said(f, /score/i)) p.push('The score is not on screen (no "Score" label).');
      if (!said(f, /lives|life|\bx\s?\d\b/i)) p.push('The lives are not on screen (no "Lives" label).');
      return p;
    }
  }
];

export const jobByKey = (k) => GAME_JOBS.find((j) => j.key === k);

// rows do-jobs reads: one per job and seed; they carry no checks (Bob never sees them)
export function gameJobs({ seeds = [1, 2, 3] } = {}) {
  return GAME_JOBS.flatMap((j) => seeds.map((s) => ({ id: `game-${j.key}-s${s}`, job: 'game', key: j.key, held: true, seed: s, text: j.text, game: { dir: j.dir, dim: j.dim } })));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  const seeds = (opt('seeds') || '1,2,3').split(',').map(Number).filter((n) => n > 0);
  const rows = gameJobs({ seeds });
  const out = opt('out');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); console.log(`${rows.length} game jobs written to ${out}`); }
  else for (const r of rows) console.log(JSON.stringify(r));
}
