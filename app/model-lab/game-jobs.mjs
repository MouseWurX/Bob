// 23 Nov 2026 (the owner: "could we have each version produce a game that we can try? same prompt? same seed ... same
// settings", then "game 1: a modern 3d fighter game ... game 2: a side scroller game ... define the rules ... they need a
// mcguffin", and Godot): two game jobs Bob builds in Godot 4 with his own file tools, one prompt each, the same for every
// brain. A seed does not carry over between file sizes, so each job runs at seeds 1, 2 and 3 and every game is kept.
// The checker (godot-check.mjs) runs each game headless; on a fail Bob is sent its problems word for word (do-jobs
// --nudges). 23 Nov (Q2 and Q4 both pointed project.godot at a main scene they never wrote, and used Godot 3 names):
// FINISH asks for every loaded file under its exact name and for the Godot 4 API, the same words for every brain.
// These are held-out: never tuned on, never made into lessons. All names here are made up for this test.
//   node game-jobs.mjs [--seeds 1,2,3] [--start plain,scope,template] [--out <jobs.jsonl>]
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
// what the checker read off the running game (godot-check.gd's BOBCHECK line); here, not imported from godot-check.mjs,
// because that file's command line imports this one (a loop that hung its --job check)
export const count = (f, ...k) => k.reduce((n, x) => n + (Number(f?.nodes?.[x]) || 0), 0);
export const said = (f, re) => (f?.text || []).some((t) => re.test(t));

const GODOT = 'Godot 4.7 (GDScript only, no C#, no add-ons, nothing downloaded: build every model, level and effect from Godot\'s own meshes, shapes, materials, particles and code; sound is optional and, if any, made in code)';
const CONTROLS = 'Keyboard and a game controller both work (set up named input actions in the project\'s Input Map with keys and controller buttons). Show the controls on the title screen.';
const FINISH = 'Make it a complete Godot project in that folder: project.godot with the main scene set, the scenes (.tscn) and scripts (.gd). Every scene or script that project.godot or your code loads must exist under exactly that name and letter case. Use the Godot 4 API, not Godot 3. It must open and run in Godot with no errors. When you are done, say how to run it and what is in it.';

export const GAME_JOBS = [
  {
    key: 'emberfall', dir: 'C:\\Users\\you\\Documents\\Games\\Emberfall', dim: '3d', starter: 'arena-3d',
    // what the test person answers when Bob scopes the job first (the same for every brain); anything else is "your call"
    brief: [
      [/2d|3d|dimension|camera|view|perspective/i, '3D, with a camera that follows the fight from the side.'],
      [/control|keyboard|gamepad|controller|button|key/i, 'Keyboard and a game controller. A/D or the arrows to walk, W or Up to jump, S or Down to crouch, J/K punch, U/I kick, L block, O throw, Space special.'],
      [/fighter|character|roster|how many/i, '3 fighters: a quick one, a heavy one and an all-rounder, each with one special move. You against the computer.'],
      [/round|match|timer|win|lose|best of/i, 'Best of 3 rounds, 60 seconds each. Win 3 matches in a row to take the Ember Crown; lose one and it is game over with a restart.'],
      [/art|look|model|asset|style|graphic/i, 'Simple shapes are fine: build the fighters and arena from Godot\'s own meshes and materials.'],
      [/sound|music|audio/i, 'Sound is optional; skip it until everything else works.'],
      [/must|first|priority|important|scope|minimum|mvp/i, 'Must-haves first: two fighters you can see moving in the arena, health bars, the round and timer on screen, hits that land. Then the rest.']
    ],
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
    key: 'lantern-run', dir: 'C:\\Users\\you\\Documents\\Games\\LanternRun', dim: '2d', starter: 'platformer-2d',
    brief: [
      [/2d|3d|dimension|camera|view|perspective/i, '2D side view, with a camera that follows the player.'],
      [/control|keyboard|gamepad|controller|button|key/i, 'Keyboard and a game controller. A/D or the arrows to run, Space or W to jump (hold for higher), J to throw a fireball once you have the flame, Enter to start.'],
      [/level|world|stage|how many|length/i, '3 short levels, one per world, each ending with a lantern piece; the last ends with the crow king boss.'],
      [/enem|boss|foe/i, 'Walkers, flyers, and one that has to be hit twice; the crow king is the boss at the end.'],
      [/live|score|spark|power|hud/i, '3 lives, a score, a timer for each level, sparks to collect (100 is an extra life), and a flame power-up.'],
      [/art|look|sprite|asset|style|graphic/i, 'Simple shapes and colours are fine: build everything from Godot\'s own nodes.'],
      [/sound|music|audio/i, 'Sound is optional; skip it until everything else works.'],
      [/must|first|priority|important|scope|minimum|mvp/i, 'Must-haves first: a player who runs and jumps on a level the camera follows, the score and lives on screen, enemies to stomp. Then the rest.']
    ],
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

// 23 Nov 2026 (the owner: "Make it so it'll work", after 0 of 18 games started): the Godot 3 names the brains kept using,
// with their Godot 4 names; the same short sheet for every brain, every mode
export const GODOT4_TIPS = [
  'Godot 4 names (not Godot 3): Spatial is Node3D; KinematicBody/KinematicBody2D is CharacterBody3D/CharacterBody2D;',
  'velocity is a property and move_and_slide() takes no arguments; yield is await; onready var is @onready var; export var is @export var;',
  'instance() is instantiate(); connect("signal", self, "method") is signal_name.connect(method); rand_range is randf_range;',
  'PoolStringArray is PackedStringArray; a material is unshaded with shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED;',
  'a controller button is InputEventJoypadButton and a stick is InputEventJoypadMotion (there is no InputEventGamepad); Camera3D.current = true or make_current().'
].join(' ');

// how a game job starts (do-jobs --game-start): plain = the request alone (the first runs); scope = Bob asks what he needs
// to know first (ask_user; the test person answers from the job's brief), writes his own plan and starter, and makes that
// open before anything else; template = a small starter that already opens is in the folder (game-starters/<starter>)
export const GAME_STARTS = ['plain', 'scope', 'template'];
const FIRST_RUN = 'Work in this order: first the smallest version that opens and runs in Godot (project.godot with its main scene, that main scene, a camera, the player and something to stand on), then stop and tell me, and I will run it. Add the rest one piece at a time after that, must-haves first.';
export function startText(j, mode = 'plain') {
  const tips = `\n${GODOT4_TIPS}`;
  if (mode === 'scope') return `${j.text}${tips}\nBefore you write any file, ask me what you need to know to scope it (use ask_user, one question at a time, a few at most). Then write PLAN.md in the project folder: every scene and script with its exact file name, the main nodes of each scene, the controls, and the must-haves in order. Then build from that plan. ${FIRST_RUN}`;
  if (mode === 'template') return `${j.text}${tips}\nThe project folder already has a small starter that opens and runs in Godot: project.godot (main scene res://main.tscn, input actions move_left, move_right, jump, attack and start), main.tscn with a camera, the player, something to stand on and a label, and its script. Build the game on top of it; read those files first. Keep it opening and running after every change: ${FIRST_RUN.replace('first the smallest version that opens and runs in Godot (project.godot with its main scene, that main scene, a camera, the player and something to stand on), then stop and tell me, and I will run it. Add', 'add')}`;
  return j.text;
}
// the test person's answer to one ask_user question in a scoped game job: the brief's line for it, else "your call"
export function briefAnswer(j, question, choices = []) {
  const q = `${question || ''} ${[].concat(choices).join(' ')}`;
  const hit = (j.brief || []).find(([re]) => re.test(String(question || ''))) || (j.brief || []).find(([re]) => re.test(q));
  if (!hit) return { typed: 'Your call: pick what makes the best game and say what you chose.' };
  const words = hit[1].toLowerCase();
  const pick = [].concat(choices).map(String).find((c) => c.trim() && words.includes(c.toLowerCase().replace(/[^\w ]/g, '').trim().split(/\s+/)[0] || '\u0000'));
  return { ...(pick ? { pick } : {}), typed: hit[1] };
}
// the starter's files, copied into a game job's empty project folder (template mode)
export function plantStarter(j, dir, root = path.join(path.dirname(fileURLToPath(import.meta.url)), 'game-starters')) {
  const from = path.join(root, j.starter || ''); const put = [];
  if (!j.starter || !fs.existsSync(from)) return put;
  for (const f of fs.readdirSync(from)) { const a = path.join(from, f); if (fs.statSync(a).isFile()) { fs.copyFileSync(a, path.join(dir, f)); put.push(f); } }
  return put;
}

export const jobByKey = (k) => GAME_JOBS.find((j) => j.key === k);

// rows do-jobs reads: one per job and seed; they carry no checks (Bob never sees them)
export function gameJobs({ seeds = [1, 2, 3], start = 'plain' } = {}) {
  const modes = [].concat(start).filter((m) => GAME_STARTS.includes(m));
  return modes.flatMap((m) => GAME_JOBS.flatMap((j) => seeds.map((s) => ({ id: `game-${j.key}${m === 'plain' ? '' : `-${m}`}-s${s}`, job: 'game', key: j.key, held: true, seed: s, text: startText(j, m), game: { dir: j.dir, dim: j.dim, start: m } }))));
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const a = process.argv.slice(2), opt = (k) => { const i = a.indexOf(`--${k}`); return i >= 0 ? a[i + 1] : ''; };
  const seeds = (opt('seeds') || '1,2,3').split(',').map(Number).filter((n) => n > 0);
  const rows = gameJobs({ seeds, start: (opt('start') || 'plain').split(',') }); // --start plain|scope|template (comma list)
  const out = opt('out');
  if (out) { fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true }); fs.writeFileSync(out, rows.map((r) => JSON.stringify(r)).join('\n') + '\n'); console.log(`${rows.length} game jobs written to ${out}`); }
  else for (const r of rows) console.log(JSON.stringify(r));
}
