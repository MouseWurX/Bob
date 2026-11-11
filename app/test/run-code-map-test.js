// The code map and jump-to-a-line (Nov 11): small brains find the right file and the error's lines without reading
// whole files. Fake folders only; nothing on the real computer is read.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { codeMap, linesAround, purposeOf, namesIn, MAP_CHARS, patchInfo } from '../src/code-map.js';
import { buildTools } from '../src/tools.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-codemap-'));
const proj = path.join(tmp, 'Game');
for (const d of ['src', 'node_modules/x', '.git', 'Source/Enemies']) fs.mkdirSync(path.join(proj, d), { recursive: true });
fs.writeFileSync(path.join(proj, 'src/waves.js'), '// 1.5.12: Spawns enemy waves on a timer.\nexport function spawnWave() {}\nexport const WAVES = 3;\nfunction helper() {}\n');
fs.writeFileSync(path.join(proj, 'src/boss.py'), '"""The boss fight."""\nclass Boss:\n    pass\ndef roar():\n    pass\n');
fs.writeFileSync(path.join(proj, 'Source/Enemies/Enemy.h'), '// One enemy and its health.\nclass GAME_API AEnemy : public AActor {\n};\n');
fs.writeFileSync(path.join(proj, 'node_modules/x/index.js'), '// not mine\nexport function x() {}\n');
fs.writeFileSync(path.join(proj, 'README.md'), '# not code');

const map = codeMap(proj);
check('one line per source file, with what it is for and the names in it', /src\/waves\.js \(5\): Spawns enemy waves on a timer\. \[spawnWave, WAVES, helper\]/.test(map), map);
check('Python and C++ files are mapped too', /src\/boss\.py \(\d+\): The boss fight\. \[Boss, roar\]/.test(map) && /Source\/Enemies\/Enemy\.h \(\d+\): One enemy and its health\. \[AEnemy\]/.test(map), map);
check('node_modules, .git and non-code files are left out', !/node_modules|README/.test(map));
check('the map says how to go on: read only the file needed, line for an error', /3 source files/.test(map) && /read_file \(with line for an error's file:line\)/.test(map));
check('version tags are dropped from the purpose', purposeOf('// 1.5.94 "Use Bob\'s look as his icon": the tray') === '"Use Bob\'s look as his icon": the tray');
check('licence lines are not a purpose', purposeOf('// SPDX-License-Identifier: MIT\n// Real purpose here') === 'Real purpose here');
check('names: exports and top-level functions', JSON.stringify(namesIn('export async function a() {}\nfunction b() {}\nexport class C {}')) === '["a","C","b"]');

// A big project: lines get shorter, then fold to folders, and always fit.
const big = path.join(tmp, 'Big');
for (let d = 0; d < 6; d++) { fs.mkdirSync(path.join(big, `part${d}`), { recursive: true }); for (let i = 0; i < 120; i++) fs.writeFileSync(path.join(big, `part${d}`, `file${i}.js`), `// This file does a long and detailed thing number ${i} for part ${d} of the game\nexport function f${i}() {}\nexport function g${i}() {}\n`); }
const bigMap = codeMap(big);
check('a big project still fits in a small brain\'s room', bigMap.length <= MAP_CHARS + 200, String(bigMap.length));
check('too big for one map: one line per folder, and how to look inside one', /part0\/ \(120 files\)/.test(bigMap) && /call code_map again with one of these folders/.test(bigMap));
check('one folder of it gets its own map', /file1\.js \(4\)/.test(codeMap(path.join(big, 'part0'))));

// Jumping to a line.
const text = Array.from({ length: 200 }, (_, i) => `line ${i + 1}`).join('\r\n');
const around = linesAround(text, 120);
check('read_file line: the lines around it, numbered, the line itself marked', /Lines 90 to 150 of 200/.test(around) && /120> line 120/.test(around) && /\b90\| line 90/.test(around) && !/line 151/.test(around), around.slice(0, 120));
check('a line past the end is the last line', /line 200 is marked/.test(linesAround(text, 999)));

// The tools.
const cfg = { agentDir: tmp, dataDir: path.join(tmp, 'data'), innDir: tmp, readRoots: [tmp], readOnlyRoots: [], projects: { Game: proj }, defaultProject: 'Game' };
const t = buildTools(cfg);
check('code_map maps the main project with no input', /src\/waves\.js/.test(await t.code_map.run({})));
check('code_map takes a folder', /Enemy\.h/.test(await t.code_map.run({ folder: path.join(proj, 'Source') })));
let err = '';
try { await t.code_map.run({ folder: os.homedir() === tmp ? '/' : path.join(path.parse(tmp).root, 'definitely-not-allowed') }); } catch (e) { err = e.message; }
check('code_map won\'t map a folder Bob may not read', /not allowed|no folder/.test(err), err);
const r = await t.read_file.run({ path: path.join(proj, 'src/waves.js'), line: 2 });
check('read_file with line jumps to it', /2> export function spawnWave/.test(r), r);
check('the code_map tool is in the documents group and on the workbench', /'code_map'\]/.test(fs.readFileSync(new URL('../src/toolbox.js', import.meta.url), 'utf8')) && /tinker: \['list_folder', 'code_map'/.test(fs.readFileSync(new URL('../src/brain.js', import.meta.url), 'utf8')));

// 1.5.204 (the owner: map the engine code): patch files are mapped by what they change.
{
  const fake = ['From abc Mon Sep 17 00:00:00 2001', 'Subject: [PATCH] Turn experts off live', '', 'diff --git a/include/llama.h b/include/llama.h', '--- a/include/llama.h', '+++ b/include/llama.h', '@@ -1,2 +1,3 @@', ' keep', '+    LLAMA_API int32_t llama_set_expert_mask(struct llama_context * ctx, const uint8_t * keep);', '-old line', 'diff --git a/tools/server/server.cpp b/tools/server/server.cpp', '+++ b/tools/server/server.cpp', '+static void handle_mask(const json & body) {', '+    svr.Post("/expert-mask", handle_mask);', '+}'].join('\r\n');
  const p = patchInfo(fake);
  check('a patch names the files it changes, upstream paths', p.files.join() === 'include/llama.h,tools/server/server.cpp');
  check('it counts lines added and taken out', p.plus === 4 && p.minus === 1);
  check('its Subject line says what it is for', p.what === 'Turn experts off live');
  check('it names the API, functions and endpoints it adds', ['llama_set_expert_mask', 'handle_mask', '/expert-mask'].every((n) => p.names.includes(n)));
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-map-patch-'));
  fs.mkdirSync(path.join(d, 'patches')); fs.writeFileSync(path.join(d, 'patches', '0001-mask.patch'), fake); fs.writeFileSync(path.join(d, 'notes.diff'), fake);
  const map = codeMap(d);
  check('the map lists .patch and .diff files with what they change', /patches\/0001-mask\.patch \(\d+\): Turn experts off live \{changes include\/llama\.h, tools\/server\/server\.cpp; \+4\/-1\}/.test(map) && /notes\.diff/.test(map));
  fs.rmSync(d, { recursive: true, force: true });
  const engine = codeMap(fileURLToPath(new URL('../engine', import.meta.url)));
  check('Bob\'s own engine patches show up when he maps his repo', /0001-expert-mask\.patch/.test(engine) && /\{changes include\/llama\.h/.test(engine));
}
// engine/ENGINE-MAP.md maps every patch, so a new patch can't land unmapped before a llama.cpp move.
{
  const dir = fileURLToPath(new URL('../engine/', import.meta.url));
  const map = fs.readFileSync(path.join(dir, 'ENGINE-MAP.md'), 'utf8').replace(/\r\n/g, '\n');
  const patches = fs.readdirSync(path.join(dir, 'patches')).filter((f) => f.endsWith('.patch')).map((f) => f.replace(/\.patch$/, ''));
  check('ENGINE-MAP.md has a section for every engine patch', patches.length >= 5 && patches.every((p) => map.includes(`### ${p}`)));
  check('it has the rebase checklist and says what is not covered yet', /## Rebase checklist/.test(map) && /## What's not covered yet/.test(map) && /README\.md/.test(map));
  const ymlFile = fileURLToPath(new URL('../../.github/workflows/brain-engine.yml', import.meta.url));
  if (fs.existsSync(ymlFile)) check('a docs-only change in engine/ builds no engine', (fs.readFileSync(ymlFile, 'utf8').match(/'!app\/engine\/\*\*\/\*\.md'/g) || []).length === 2); // only in the repo, not in an installed Bob
}
const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8').replace(/\r\n/g, '\n');
check('Help, FAQ and glossary cover it', /Finding my way in big code/.test(help) && /A patch file \(like the ones my Brain Engine is made of/.test(help) && /for a patch file, which files it changes/.test(help) && /id: 'faq-code-map'/.test(help) && /<dt>Code map<\/dt>/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
