#!/usr/bin/env node
// aiFEUI on a rented card: pack everything the card needs into one folder, ready to upload as the card's /workspace/in.
//   node model-lab/forge/aifeui-bundle.mjs --brain hf:<repo>:<file.gguf> --name "Brain name" --out <folder>
//        [--skills coding,maths] [--per 4] [--think] [--keep-experts <file.json>]
// The folder gets: aifeui-plan.json (the questions, the pinned llama.cpp tag), pod/ (aifeui.sh and aifeui_scan.py),
// engine-patches/ (Bob's engine, as patches on llama.cpp) and viewer/ (Bob's own viewer, to watch the result).
// On the card: bash in/pod/aifeui.sh. It checks every dependency first and stops there if one is missing.
// This script rents nothing and uploads nothing.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { pickSkills, WATCH_WORDS, WATCH_WORDS_THINK } from '../../src/lab-watch.js';

export const VIEWER_FILES = ['watch.html', 'watch.js', 'watch.css', 'watch-view.js', 'lab-watch-math.js', 'themes.js', 'style.css'];
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export function llamaTag() {
  const tag = JSON.parse(fs.readFileSync(path.join(app, 'package.json'), 'utf8')).bob?.bundledLlamaTag;
  if (!tag) throw new Error('Couldn\'t find the pinned llama.cpp tag (package.json, bob.bundledLlamaTag).');
  return tag;
}

export function bundle({ brain, name = '', out, skills = null, per = undefined, think = false }) {
  if (!brain) throw new Error('Say which brain: --brain hf:<repo>:<file.gguf>, or a file name you will put in the folder.');
  if (!out) throw new Error('Say where to put the folder: --out <folder>.');
  const picked = pickSkills({ skills, per });
  if (!picked.length) throw new Error('No skills to ask about.');
  fs.mkdirSync(path.join(out, 'pod'), { recursive: true }); fs.mkdirSync(path.join(out, 'engine-patches'), { recursive: true }); fs.mkdirSync(path.join(out, 'viewer'), { recursive: true });
  const plan = { brain, name: name || path.basename(String(brain).split(':').pop()).replace(/\.gguf$/i, ''), llama_tag: llamaTag(), think: think === true, words: think ? WATCH_WORDS_THINK : WATCH_WORDS, skills: picked.map(({ id, label, questions }) => ({ id, label, questions })) };
  fs.writeFileSync(path.join(out, 'aifeui-plan.json'), JSON.stringify(plan, null, 1));
  for (const f of ['aifeui.sh', 'aifeui_scan.py']) fs.copyFileSync(path.join(app, 'model-lab', 'forge', 'pod', f), path.join(out, 'pod', f));
  const patches = fs.readdirSync(path.join(app, 'engine', 'patches')).filter((f) => f.endsWith('.patch')).sort();
  for (const f of patches) fs.copyFileSync(path.join(app, 'engine', 'patches', f), path.join(out, 'engine-patches', f));
  for (const f of VIEWER_FILES) fs.copyFileSync(path.join(app, 'public', f), path.join(out, 'viewer', f));
  return { plan, patches, viewer: VIEWER_FILES };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : undefined; };
  try {
    const r = bundle({ brain: arg('brain'), name: arg('name'), out: arg('out'), skills: arg('skills')?.split(','), per: arg('per') ? Number(arg('per')) : undefined, think: process.argv.includes('--think') });
    console.log(`Packed: ${r.plan.skills.length} skills, ${r.plan.skills.reduce((a, s) => a + s.questions.length, 0)} questions, llama.cpp ${r.plan.llama_tag}, ${r.patches.length} engine patches, the viewer.`);
    console.log('Put the folder on the card as /workspace/in and run: bash /workspace/in/pod/aifeui.sh');
  } catch (e) { console.error(e.message); process.exit(1); }
}
