// 1.5.71: graphics built into the processor (like the Radeon 780M in a Legion Go's Z1 Extreme) are seen, shown as
// memory shared with graphics, and get a brains-only starter set. A separate card, or a desktop chip's tiny built-in
// graphics, still counts as no graphics card.
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
check('shared memory counted as half the PC\'s memory (32 GB -> 16 GB)', sharedGraphicsGB(32 * GB) === 16 && sharedGraphicsGB(16 * GB) === 8);

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
const art = new Set(['image', 'edit', 'video', 'music', 'sfx', 'painter']);
check('the built-in set is brains only: no pictures, edits or video until tried there', shared && !Object.values(shared.slots).flat().some((s) => art.has(s)) && /left out/.test(shared.times));
check('it still covers chat, quick brain, eyes, ears, voice, memory and coding', ['bob', 'small', 'eyes', 'voice', 'speech', 'embed', 'tinker'].every((s) => Object.values(shared.slots).flat().includes(s)));

const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Get models says "Fits your PC" and names the built-in graphics', /'Fits your PC'/.test(cellar) && /Built-in graphics: /.test(cellar));
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
check('built-in graphics are not treated as a card for pictures', /!h\.gpu\.integrated\) cfg\.cardGB/.test(server));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
