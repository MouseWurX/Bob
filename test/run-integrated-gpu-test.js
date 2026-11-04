// 1.5.71: graphics built into the processor (like the Radeon 780M in a Legion Go's Z1 Extreme) are seen, shown as
// memory shared with graphics, and get a brains-only starter set. A separate card, or a desktop chip's tiny built-in
// graphics, still counts as no graphics card. 1.5.79: the set paints too.
import fs from 'node:fs';
import { pickIntegrated, integratedGpu, sharedGraphicsGB, gpuInfo } from '../src/platform.js';
import { packFor } from '../public/fit.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const GB = 1024 ** 3;

check('a handheld Z1 Extreme: its Radeon counts', pickIntegrated(['AMD Radeon(TM) Graphics'], 'AMD Ryzen Z1 Extreme') === 'AMD Radeon(TM) Graphics');
check('a laptop Ryzen HS chip with a 780M counts', pickIntegrated(['AMD Radeon 780M Graphics'], 'AMD Ryzen 7 7840HS w/ Radeon 780M Graphics') === 'AMD Radeon 780M Graphics');
check('Ryzen AI laptops count', !!pickIntegrated(['AMD Radeon(TM) 890M Graphics'], 'AMD Ryzen AI 9 HX 370 w/ Radeon 890M'));
check('a desktop Ryzen (like a 9800X3D) does not: its built-in graphics are slower than the processor', pickIntegrated(['AMD Radeon(TM) Graphics'], 'AMD Ryzen 7 9800X3D 8-Core Processor') === null);
check('Intel Arc and Iris Xe built-in graphics count', !!pickIntegrated(['Intel(R) Arc(TM) Graphics'], 'Intel(R) Core(TM) Ultra 7 155H') && !!pickIntegrated(['Intel(R) Iris(R) Xe Graphics'], 'Intel(R) Core(TM) i7-1165G7'));
check('older Intel UHD graphics do not', pickIntegrated(['Intel(R) UHD Graphics 630'], 'Intel(R) Core(TM) i7-9700K') === null);
check('a separate card next to it: not handled, so no graphics card', pickIntegrated(['AMD Radeon(TM) Graphics', 'AMD Radeon RX 7800 XT'], 'AMD Ryzen 7 7840HS') === null && pickIntegrated(['Intel(R) Iris(R) Xe Graphics', 'Intel(R) Arc(TM) A770 Graphics'], 'Intel i7') === null);
check('nothing listed: nothing', pickIntegrated([], 'AMD Ryzen Z1 Extreme') === null && pickIntegrated(['Microsoft Basic Display Adapter'], 'x') === null);
check('shared memory counted as half this replicant matrix\'s memory (32 GB -> 16 GB)', sharedGraphicsGB(32 * GB) === 16 && sharedGraphicsGB(16 * GB) === 8);

// Windows: asked through PowerShell only when nvidia-smi has nothing; a fake execFile stands in (no real programs run).
const fakeExec = (outs) => (file, args, opts, cb) => { const o = outs[file]; o == null ? cb(new Error('not here')) : cb(null, o); };
const win = await integratedGpu({ os_: 'win', execImpl: fakeExec({ 'powershell.exe': 'AMD Radeon(TM) Graphics\r\n' }), totalmem: 32 * GB, cpu: 'AMD Ryzen Z1 Extreme', fresh: true });
check('Windows: the Legion Go is seen as built-in graphics with 16 GB shared', win?.integrated === true && win.unified === true && win.vramGB === 16 && win.name === 'AMD Radeon(TM) Graphics (shared memory)', JSON.stringify(win));
const lin = await integratedGpu({ os_: 'linux', execImpl: fakeExec({ lspci: '00:02.0 Ethernet controller: x\nc4:00.0 VGA compatible controller: Advanced Micro Devices, Inc. [AMD/ATI] Phoenix1 (rev c4)\n' }), totalmem: 32 * GB, cpu: 'AMD Ryzen Z1 Extreme', fresh: true });
check('Linux: read from lspci', lin?.integrated === true && /Phoenix1 \(shared memory\)$/.test(lin.name) && !/rev/.test(lin.name), JSON.stringify(lin));
const mac = await integratedGpu({ os_: 'mac', execImpl: fakeExec({}), fresh: true });
check('a Mac is left to its own check', mac === null);
const nv = await gpuInfo({ os_: 'win', execImpl: fakeExec({ 'nvidia-smi': 'NVIDIA GeForce RTX 5070 Ti, 16303\n', 'powershell.exe': 'AMD Radeon(TM) Graphics' }) });
check('an NVIDIA card still wins, and is not called built-in', nv.name === 'NVIDIA GeForce RTX 5070 Ti' && nv.vramGB === 16 && !nv.integrated);

const cat = JSON.parse(fs.readFileSync(new URL('../catalog.json', import.meta.url)));
const shared = cat.packs.find((p) => p.id === 'shared');
check('built-in graphics get their own starter set', packFor(cat.packs, 16, true).id === 'shared');
check('cards are still picked by size, never the built-in set', packFor(cat.packs, 16).id === 'big' && packFor(cat.packs, 4).id === 'cpu' && packFor(cat.packs, 999).id === 'big' && packFor(cat.packs, null).id === 'cpu');
// 1.5.79: the built-in set paints too (small painter and editor), with clips offered but left unticked.
check('the built-in set has a small painter and editor', shared.slots['z-image-turbo-q4']?.includes('image') && shared.slots['flux2-klein-4b-q4']?.includes('edit'));
check('the built-in set offers clips, left unticked', shared.slots['wan2.2-ti2v-5b-q4']?.includes('video') && shared.untick?.includes('wan2.2-ti2v-5b-q4'));
check('the built-in set stays on the small (Q4) picture models', !shared.models.some((id) => ['z-image-turbo', 'z-image-turbo-q8', 'qwen-image-edit-2509', 'wan2.2-ti2v-5b'].includes(id)));
const { starterTicks } = await import('../public/equip.js');
const t16 = starterTicks(shared, cat.models, 8), t32 = starterTicks(shared, cat.models, 16);
check('on a 16 GB handheld the painter and editor are ticked, clips are not', t16.has('z-image-turbo-q4') && t16.has('flux2-klein-4b-q4') && !t16.has('wan2.2-ti2v-5b-q4'), [...t16].join(','));
check('on a 32 GB handheld clips are still unticked (very slow there)', !t32.has('wan2.2-ti2v-5b-q4'));
const wanHere = cat.models.map((m) => (m.id === 'wan2.2-ti2v-5b-q4' ? { ...m, status: { state: 'installed' } } : m));
check('a clip model already on this replicant matrix stays ticked', starterTicks(shared, wanHere, 8).has('wan2.2-ti2v-5b-q4'));
const { pickFor } = await import('../public/fit.js');
const ictx = { packs: cat.packs, vramGB: 8, ramGB: 16, freeGB: 200, integrated: true };
check('the Painter slot recommends the small painter on built-in graphics', pickFor('image', cat.models, ictx)?.id === 'z-image-turbo-q4', JSON.stringify(pickFor('image', cat.models, ictx)));
const { paintFlags, SAFE_PAINT } = await import('../src/tuning.js');
const on = { pictureFit: true, sharedGraphics: true };
const pf = paintFlags(on, 'image', {}, { gb: 0, files: 6 });
check('Match picture settings on built-in graphics: 768 px pictures, encoder kept on the graphics', pf.fit === 'shared' && pf.size === 768 && pf.clipOnCpu === false && pf.extra.join() === SAFE_PAINT.join(), JSON.stringify(pf));
check('clips keep their own size there', paintFlags(on, 'video', {}, { gb: 0, files: 9 }).size === null);
check('the switch off: the usual settings, as before', paintFlags({ sharedGraphics: true }, 'image', {}, { gb: 0 }).fit === 'safe');
check('a real card is still judged by its size', paintFlags({ pictureFit: true, sharedGraphics: true }, 'image', {}, { gb: 16, files: 6 }).fit === 'big');
const equipSrc = fs.readFileSync(new URL('../public/equip.js', import.meta.url), 'utf8');
check('the set marked (this replicant matrix) is the built-in one on a handheld', /packFor\(packs, ctx\.vramGB, ctx\.integrated\)\.id \? ' \(this replicant matrix\)'/.test(equipSrc));
check('it still covers chat, quick brain, eyes, ears, voice, memory and coding', ['bob', 'small', 'eyes', 'voice', 'speech', 'embed', 'tinker'].every((s) => Object.values(shared.slots).flat().includes(s)));

const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Get models says "Fits your replicant matrix" and names the built-in graphics', /'Fits your replicant matrix'/.test(cellar) && /Built-in graphics: /.test(cellar));
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
check('built-in graphics are not treated as a card for pictures', /!h\.gpu\.integrated\) cfg\.cardGB/.test(server));
check('built-in graphics are remembered for picture settings', /h\?\.gpu\?\.integrated\) cfg\.sharedGraphics = true/.test(server));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
