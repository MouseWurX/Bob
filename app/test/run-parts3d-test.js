// 🧊 3D: the 3D viewer (public/model-core.js reads STL, OBJ and GLB and shows them; the phone app has the same file) and "Let Bob make 3D parts"
// (src/parts3d.js: OpenSCAD recipes in, STL out; off unless turned on), with its engine entry, toolbox group,
// settings, Help, FAQ and glossary. OpenSCAD itself is never run: a fake stands in for it, and every file is
// made up in a temporary folder.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parts3dOn, findOpenscad, cleanScad, scadProblems, makeStl, parts3dTool, wantsManifold, openscadAllowed, MAX_SCAD } from '../src/parts3d.js';
import { ENGINES, engineFor, scadPinFor, ENGINE_GROUP } from '../src/engines.js';
import { mergeSettings } from '../src/config.js';
import { NEEDS } from '../src/setup-offer.js';
import { kindOf, KINDS } from '../src/made.js';
import { WANTS } from '../public/wants.js';
import { settingsNow } from '../src/self-help.js';
import { HELP } from '../public/help-content.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-3d-'));
const core = read('public/model-core.js');
const BM = {}; new Function('globalThis', 'module', core)(BM, undefined);
const { parseStl, parseObj, parseGlb, parseModel, faceNormals, sizeWords, isModelName, nodeMatrix, upAxis } = BM.BobModel;
const throwsLike = (fn, re) => { try { fn(); return false; } catch (e) { return re.test(e.message); } };

// ---------- reading models ----------
{
  // A binary STL with two triangles (a square), one with a zero normal (the corners give it).
  const tri = [[0, 0, 0, 10, 0, 0, 10, 10, 0], [0, 0, 0, 10, 10, 0, 0, 10, 0]];
  const bin = Buffer.alloc(84 + 50 * tri.length);
  bin.write('solid but really binary', 0);
  bin.writeUInt32LE(tri.length, 80);
  tri.forEach((t, i) => { const o = 84 + i * 50; t.forEach((v, k) => bin.writeFloatLE(v, o + 12 + k * 4)); });
  const m = parseStl(bin);
  check('a binary STL is read even when its header says "solid"', m.triangles === 2 && m.size.join() === '10,10,0', JSON.stringify(m.size));
  check('a missing normal is worked out from the corners', Math.abs(m.parts[0].normals[2] - 1) < 1e-6);
  const ascii = 'solid cube\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 4 0 0\nvertex 4 2 3\nendloop\nendfacet\nendsolid cube\n';
  const a = parseStl(Buffer.from(ascii));
  check('a text STL is read', a.triangles === 1 && sizeWords(a.size) === '4 × 2 × 3', sizeWords(a.size));
  check('a file that isn\'t STL says so plainly', throwsLike(() => parseStl(Buffer.from('hello there')), /isn't an STL/));

  const obj = 'o thing\nv 0 0 0 1 0 0\nv 2 0 0 0 1 0\nv 2 2 0 0 0 1\nv 0 2 0 1 1 0\nvn 0 0 1\nf 1//1 2//1 3//1 4//1\nf -4 -2 -1\n';
  const o = parseObj(obj);
  check('an OBJ square is split into triangles, and negative corners count from the end', o.triangles === 3, String(o.triangles));
  check('OBJ vertex colours are kept', o.parts[0].colors && Math.abs(o.parts[0].colors[0] - 1) < 1e-6);
  check('an OBJ with no faces says so', throwsLike(() => parseObj('v 0 0 0\n'), /no faces/));
  check('an OBJ pointing at a corner it lacks says so', throwsLike(() => parseObj('v 0 0 0\nf 1 2 3\n'), /doesn't have/));

  // A GLB: one triangle with indices, scaled by its node, a colour and a picture.
  const pos = new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]), uv = new Float32Array([0, 0, 1, 0, 0, 1]), idx = new Uint16Array([0, 1, 2, 0]);
  const img = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3, 4]);
  const binc = Buffer.concat([Buffer.from(pos.buffer), Buffer.from(uv.buffer), Buffer.from(idx.buffer), img]);
  const json = { asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ children: [1], scale: [2, 2, 2] }, { mesh: 0, translation: [5, 0, 0] }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [1, 0.5, 0.25, 1], baseColorTexture: { index: 0 } } }], textures: [{ source: 0 }], images: [{ bufferView: 3, mimeType: 'image/png' }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3' }, { bufferView: 1, componentType: 5126, count: 3, type: 'VEC2' }, { bufferView: 2, componentType: 5123, count: 3, type: 'SCALAR' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: 36 }, { buffer: 0, byteOffset: 36, byteLength: 24 }, { buffer: 0, byteOffset: 60, byteLength: 8 }, { buffer: 0, byteOffset: 68, byteLength: img.length }], buffers: [{ byteLength: binc.length }] };
  const glb = (j, b) => {
    let js = Buffer.from(JSON.stringify(j)); js = Buffer.concat([js, Buffer.alloc((4 - js.length % 4) % 4, 0x20)]);
    const bb = Buffer.concat([b, Buffer.alloc((4 - b.length % 4) % 4)]);
    const ch = (t, d) => { const h = Buffer.alloc(8); h.writeUInt32LE(d.length, 0); h.writeUInt32LE(t, 4); return Buffer.concat([h, d]); };
    const head = Buffer.alloc(12); head.writeUInt32LE(0x46546c67, 0); head.writeUInt32LE(2, 4); head.writeUInt32LE(12 + 16 + js.length + bb.length, 8);
    return Buffer.concat([head, ch(0x4e4f534a, js), ch(0x004e4942, bb)]);
  };
  const g = parseGlb(glb(json, binc));
  check('a GLB is read through its nodes (scale, then the child\'s move)', g.triangles === 1 && g.min.join() === '10,0,0' && g.max.join() === '12,2,0', `${g.min} ${g.max}`);
  check('a GLB keeps its colour and its picture', g.parts[0].color.join() === '1,0.5,0.25,1' && g.parts[0].image?.mime === 'image/png' && g.parts[0].image.bytes.length === img.length);
  check('a squeezed (Draco) GLB says to open it in its app', throwsLike(() => parseGlb(glb({ ...json, extensionsRequired: ['KHR_draco_mesh_compression'] }, binc)), /Draco/));
  check('a GLB with its data in another file says so', throwsLike(() => parseGlb(glb({ ...json, bufferViews: json.bufferViews.map((v) => ({ ...v, buffer: 1 })) }, binc)), /another file/));
  check('not a GLB says so', throwsLike(() => parseGlb(Buffer.from('not a glb at all, sorry')), /isn't a GLB/));
  check('a node\'s rotation turns it', (() => { const M = nodeMatrix({ rotation: [0, 0, Math.SQRT1_2, Math.SQRT1_2] }); return Math.abs(M[1] - 1) < 1e-6 && Math.abs(M[4] + 1) < 1e-6; })());
  check('parseModel goes by the name', parseModel('x.STL', bin).triangles === 2 && throwsLike(() => parseModel('x.fbx', bin), /STL, OBJ and GLB/));
  check('the 3D names', isModelName('a.stl') && isModelName('b.GLB') && isModelName('c.obj') && !isModelName('d.fbx') && !isModelName('e.scad'));
  check('STL stands on Z, GLB and OBJ on Y', upAxis('a.stl') === 'z' && upAxis('a.glb') === 'y' && upAxis('a.obj') === 'y');
  check('face normals point out of a counter-clockwise triangle', faceNormals(new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]))[2] === 1);
}

// ---------- the side panel and Made by Bob know 3D models ----------
{
  check('Made by Bob sorts 3D models as their own kind', KINDS.includes('model') && kindOf({ ok: true, kind: 'file', name: 'bracket.stl' }) === 'model' && kindOf({ ok: true, kind: 'file', name: 'x.glb' }) === 'model' && kindOf({ ok: true, kind: 'file', name: 'x.zip' }) === 'file');
  const viewer = read('public/viewer.js');
  check('the side panel opens 3D models in the viewer', /t\.kind === 'model' && url/.test(viewer) && /BobModel\.showModel\(stage/.test(viewer) && /import '\.\/model-core\.js'/.test(viewer));
  const phoneCore = path.join(here, '..', 'android/app/src/main/assets/www/model-core.js');
  check('the phone app has the same 3D code, word for word', fs.existsSync(phoneCore) && fs.readFileSync(phoneCore, 'utf8').replace(/\r\n/g, '\n') === core);
  const phone = read('android/app/src/main/assets/www/phone.js');
  check('the phone shows 3D models Bob made on the computer', /<script src="model-core\.js"><\/script>/.test(read('android/app/src/main/assets/www/index.html')) && /it\.kind === 'model'/.test(phone) && /BobModel\.showModel/.test(phone));
  check('the side panel has a 3D models filter and a View in 3D card', /\['model', '3D models'\]/.test(viewer) && /View in 3D/.test(viewer));
  check('the viewer needs no library', !/\bimport\b|require\(/.test(core));
  check('the viewer can be turned and zoomed by keys, and has a label', /ArrowLeft/.test(core) && /aria-label/.test(core));
  check('it stays still when animations are off', /spin = !still/.test(core) && /classList\.contains\('still'\)/.test(viewer));
  check('the server names 3D files and recipes', /'\.stl': 'model\/stl'/.test(read('src/server.js')) && /'\.scad': 'text\/plain/.test(read('src/server.js')));
}

// ---------- recipes ----------
{
  check('3D parts are off unless turned on', !parts3dOn({}) && !parts3dOn({ parts3d: 'yes' }) && parts3dOn({ parts3d: true }));
  check('only true turns it on when saved', mergeSettings({}, { parts3d: 'true' }).parts3d === false && mergeSettings({}, { parts3d: true }).parts3d === true);
  check('code fences come off', cleanScad('```openscad\ncube([1,2,3]);\n```') === 'cube([1,2,3]);');
  check('import is refused', throwsLike(() => cleanScad('import("C:/secret.stl");'), /can't read other files/));
  check('surface is refused', throwsLike(() => cleanScad('surface(file = "x.dat");'), /can't read other files/));
  check('include and use are refused', throwsLike(() => cleanScad('include <MCAD/gears.scad>\ncube(1);'), /pull in other files/) && throwsLike(() => cleanScad('  use <x.scad>\ncube(1);'), /pull in other files/));
  check('the words in a comment or a label don\'t count', cleanScad('// import("x") is not used\nlinear_extrude(1) text("use <this>");') .length > 0);
  check('a recipe that isn\'t one says so', throwsLike(() => cleanScad('make me a box'), /doesn't look like/));
  check('too long is refused', throwsLike(() => cleanScad('cube(1);'.repeat(MAX_SCAD)), /up to/));
  check('OpenSCAD\'s errors are cut to what matters', scadProblems('Compiling...\nERROR: Parser error in file part.scad, line 3: syntax error\nmore') === 'ERROR: Parser error in file part.scad, line 3: syntax error');
  check('newer OpenSCAD gets the fast Manifold maker, 2021 doesn\'t', wantsManifold('OpenSCAD version 2025.06.10') && !wantsManifold('OpenSCAD version 2021.01') && !wantsManifold(''));
}

// ---------- finding OpenSCAD (made-up computers) ----------
{
  const has = (...ps) => { const s = new Set(ps.map((p) => path.normalize(p))); return (p) => s.has(path.normalize(p)); };
  const none = () => [];
  const agentDir = path.join(tmp, 'Agent');
  const own = path.join(agentDir, 'openscad');
  const w = findOpenscad({ agentDir }, { os_: 'win', env: {}, exists: has(path.join(own, 'OpenSCAD-2021.01', 'openscad.com')), list: (d) => (d === own ? ['OpenSCAD-2021.01'] : []) });
  check('Windows: Bob\'s own unpacked copy, the console version first', w?.where === 'own' && /openscad\.com$/.test(w.exe));
  const pf = findOpenscad({ agentDir }, { os_: 'win', env: { ProgramFiles: path.join(tmp, 'PF') }, exists: has(path.join(tmp, 'PF', 'OpenSCAD', 'openscad.exe')), list: none });
  check('Windows: one in Program Files counts', pf?.where === 'pc');
  const mac = findOpenscad({ agentDir }, { os_: 'mac', env: {}, exists: has('/Applications/OpenSCAD.app/Contents/MacOS/OpenSCAD'), list: none });
  check('Mac: one in Applications counts', mac?.where === 'pc');
  const img = findOpenscad({ agentDir }, { os_: 'linux', env: {}, exists: has(path.join(own, 'OpenSCAD-2021.01-x86_64.AppImage')), list: (d) => (d === own ? ['OpenSCAD-2021.01-x86_64.AppImage'] : []) });
  check('Linux: Bob\'s own AppImage runs without FUSE', img?.where === 'own' && img.args.includes('--appimage-extract-and-run'));
  const lp = findOpenscad({ agentDir }, { os_: 'linux', env: { PATH: '/usr/bin' }, exists: has('/usr/bin/openscad'), list: none });
  check('Linux: one from the software centre counts', lp?.exe === path.join('/usr/bin', 'openscad'));
  check('nothing anywhere: null', findOpenscad({ agentDir }, { os_: 'win', env: {}, exists: () => false, list: none }) === null);
}

// ---------- making a part (a fake OpenSCAD) ----------
{
  const stl = Buffer.alloc(84 + 50); stl.writeUInt32LE(1, 80);
  const fakeRun = (log) => async (exe, args, { cwd }) => {
    log.push({ exe, args, cwd, recipe: fs.readFileSync(args[args.length - 1], 'utf8') });
    if (/broken/.test(log.at(-1).recipe)) return { code: 1, out: 'Parsing design...\nERROR: Parser error in file part.scad, line 1: syntax error\n' };
    fs.writeFileSync(args[args.indexOf('-o') + 1], stl);
    return { code: 0, out: 'WARNING: Ignoring unknown variable \'w\'\nTotal rendering time: 0:00:00' };
  };
  const log = [];
  const r = await makeStl({ exe: 'openscad', scad: 'cube(1);', outFile: path.join(tmp, 'out', 'a.stl'), manifold: true, run: fakeRun(log) });
  check('the recipe runs in a folder of its own, and only the STL comes out', fs.existsSync(path.join(tmp, 'out', 'a.stl')) && !fs.existsSync(log[0].cwd) && log[0].args.includes('binstl'));
  check('newer OpenSCAD is asked for Manifold', log[0].args.includes('--backend=manifold'));
  check('warnings are passed on', /WARNING: Ignoring unknown variable/.test(r.notes) && !/rendering time/.test(r.notes));
  let msg = '';
  try { await makeStl({ exe: 'openscad', scad: 'broken', outFile: path.join(tmp, 'out', 'b.stl'), run: fakeRun(log) }); } catch (e) { msg = e.message; }
  check('a broken recipe gives OpenSCAD\'s reason', /couldn't make the part:\nERROR: Parser error/.test(msg), msg);
  try { msg = ''; await makeStl({ exe: 'openscad', scad: 'cube(1);', outFile: path.join(tmp, 'out', 'c.stl'), run: async () => ({ code: null, out: '', timedOut: true }) }); } catch (e) { msg = e.message; }
  check('too slow is stopped, with a hint', /longer than 120 seconds/.test(msg));

  // The tool, end to end with fakes.
  const painterDir = path.join(tmp, 'painter');
  const events = [], added = [];
  const brain = { cfg: { painterDir, userName: 'Sam' }, made: { add: (f) => { added.push(f); return { url: '/images/x.stl' }; } }, offerSetup: async (what) => `offer:${what}` };
  const tool = parts3dTool(brain, { find: () => ({ exe: 'openscad', where: 'pc', args: [] }), version: async () => 'OpenSCAD version 2021.01', make: (o) => makeStl({ ...o, run: fakeRun(log) }) });
  const out = await tool.run({ title: 'Pipe bracket 20 mm', scad: 'difference(){cube([30,20,5]);cylinder(d=20,h=6);}' }, { emit: (e) => events.push(e) });
  const files = fs.readdirSync(painterDir);
  check('the part and its recipe are kept side by side', files.some((f) => /pipe-bracket-20-mm-\w+\.stl$/.test(f)) && files.some((f) => /pipe-bracket-20-mm-\w+\.scad$/.test(f)));
  check('the recipe file says how to change it', /Open this file in OpenSCAD/.test(fs.readFileSync(path.join(painterDir, files.find((f) => f.endsWith('.scad'))), 'utf8')));
  check('the part goes on Made by Bob and opens in the 3D viewer', added.length === 1 && events.some((e) => e.type === 'made' && e.show === true && e.items[0].kind === 'model'));
  check('Bob is told what to say, not to paste the recipe', /Made the part "Pipe bracket 20 mm"/.test(out) && /don't paste the recipe/.test(out));
  check('2021 isn\'t asked for Manifold', !log.at(-1).args.includes('--backend=manifold'));
  const bad = await tool.run({ scad: 'broken;' }, { emit: () => {} });
  check('a failed part asks Bob to fix the recipe', /^Error: OpenSCAD couldn't make the part/.test(bad) && /call make_3d_part again/.test(bad));
  const missing = parts3dTool(brain, { find: () => null });
  check('no OpenSCAD: the Set it up card', (await missing.run({ scad: 'cube(1);' }, {})) === 'offer:openscad');
  let refused = '';
  try { await tool.run({ scad: 'import("x.stl");' }, {}); } catch (e) { refused = e.message; }
  check('a recipe that reads files never reaches OpenSCAD', /can't read other files/.test(refused));
}

// ---------- the engine, the switch and the toolbox ----------
{
  const e = ENGINES.find((x) => x.id === 'openscad');
  check('OpenSCAD is an engine with its own folder, under helpers', e && e.dir === 'openscad' && ENGINE_GROUP.openscad === 'helpers');
  check('downloads only from files.openscad.org over https', openscadAllowed('https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip') && !openscadAllowed('http://files.openscad.org/x.zip') && !openscadAllowed('https://evil.example/OpenSCAD.zip'));
  const pins = { version: '2021.01', 'win-x64': { url: 'https://files.openscad.org/OpenSCAD-2021.01-x86-64.zip', sha256: 'a'.repeat(64), bytes: 1 }, 'linux-x64': { url: 'https://elsewhere.example/x', sha256: 'b'.repeat(64) } };
  check('a pin counts only with a checksum and the right host', scadPinFor('win-x64', pins)?.version === '2021.01' && scadPinFor('linux-x64', pins) === null && scadPinFor('linux-arm64', pins) === null);
  const shipped = JSON.parse(read('src/openscad-pins.json'));
  const pinned = (k) => Boolean(scadPinFor(k, shipped));
  check('without a pin there is no Get button, and it says to install it', pinned('win-x64') || /openscad\.org/.test(engineFor(e, 'win').unavailable || ''));
  check('Mac: install it yourself, Bob finds it', /Applications/.test(engineFor(e, 'mac').unavailable));
  check('Linux uses its own program name', engineFor(e, 'linux').exe === 'openscad');
  check('the Set it up card knows OpenSCAD', NEEDS.openscad?.engine === 'openscad');
  check('the pin script reads OpenSCAD\'s own checksums', /\.sha256/.test(read('installer/pin-openscad.js')) && /doesn't match/.test(read('installer/pin-openscad.js')));
  check('the switch is saved and shown in Settings', /sswitch\('parts3d', settings\.parts3d === true, 'Let Bob make 3D parts'/.test(read('public/cellar.js')) && /typeof b\.parts3d === 'boolean'/.test(read('src/server.js')));
  check('the Welcome list has it, off', WANTS.some((w) => w.key === 'parts3d' && w.setting === 'Let Bob make 3D parts'));
  check('bob_help reports it', /Let Bob make 3D parts: off/.test(settingsNow({})));
  const brainSrc = brainText(), box = read('src/toolbox.js');
  check('the tool is hidden while the switch is off', /!parts3dOn\(this\.cfg\) && 'make_3d_part'/.test(brainSrc));
  const m = /parts3d: \{[\s\S]*?words: (\/.*\/i)\n/.exec(box);
  const words = m ? eval(m[1]) : /$^/;
  check('the toolbox finds it from plain asks', ['make me a bracket for a 20mm pipe', 'can you 3D print a knob', 'I need an STL of a spacer', 'design a replacement part for my dishwasher'].every((t) => words.test(t)));
  check('...and not from everyday words', !['make me a video clip', 'print this document', 'what\'s the weather'].some((t) => words.test(t)));
  check('guests (other Bobs, Discord) never get it', !/make_3d_part/.test(read('src/share-jobs.js')));
}

// ---------- Help, FAQ, glossary ----------
{
  const ids = ['parts3d', 'model-viewer', 'faq-3d-models'];
  check('Help has the 3D parts page, the viewer page and an FAQ', ids.every((id) => HELP.some((e) => e.id === id)));
  const body = HELP.filter((e) => ids.includes(e.id)).map((e) => e.html).join(' ');
  check('Help says where it works', ['parts3d', 'model-viewer'].every((id) => /Android/.test(HELP.find((e) => e.id === id).html) && /Windows, Mac/.test(HELP.find((e) => e.id === id).html)));
  check('Help says it starts off and needs OpenSCAD', /off unless you turn it on/.test(body) && /OpenSCAD/.test(body));
  const g = HELP.find((e) => e.id === 'glossary').html;
  check('the glossary has OpenSCAD and the 3D file types', /<dt>OpenSCAD<\/dt>/.test(g) && /<dt>STL, OBJ and GLB<\/dt>/.test(g));
  check('Third-party list names OpenSCAD and its licence', /OpenSCAD.*GPL-2\.0/.test(read('docs/legal/THIRD-PARTY.md')));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
