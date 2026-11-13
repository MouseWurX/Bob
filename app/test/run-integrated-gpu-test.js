// 1.5.71: graphics built into the processor (like the Radeon 780M in a Legion Go's Z1 Extreme) are seen, shown as
// memory shared with graphics, and get a brains-only starter set. A separate card, or a desktop chip's tiny built-in
// graphics, still counts as no graphics card. 1.5.79: the set paints too.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import { pickIntegrated, integratedGpu, sharedGraphicsGB, gpuInfo, apuGraphicsGB, parseApuJson, apuMemory, specLine, APU_HEADROOM_GB } from '../src/platform.js';
import { apuRoom, APU_NO_ROOM, apuHoldbackGB } from '../src/brain.js';
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
check('the set marked (this replicant matrix) is the built-in one on a handheld', /packFor\(packs, ctx\.vramGB, ctx\.integrated, fitOpts\)\.id \? ' \(this replicant matrix\)'/.test(equipSrc));
check('it still covers chat, quick brain, eyes, ears, voice, memory and coding', ['bob', 'small', 'eyes', 'voice', 'speech', 'embed', 'tinker'].every((s) => Object.values(shared.slots).flat().includes(s)));

const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Get models says "Fits your replicant matrix" and names the built-in graphics', /'Fits your replicant matrix'/.test(cellar) && /Built-in graphics: /.test(cellar));
const server = fs.readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
check('built-in graphics are not treated as a card for pictures', /!h\.gpu\.integrated\) cfg\.cardGB/.test(server));
check('built-in graphics are remembered for picture settings, with the set-aside size (1.5.133)', /h\?\.gpu\?\.integrated\) \{ cfg\.sharedGraphics = true; cfg\.reservedGraphicsGB = Number\(h\.gpu\.reservedGraphicsGB\) \|\| 0;/.test(server));


// ---- 1.5.126: the memory really shared on a handheld (a Legion Go showed RAM only and no graphics memory) ----
// The BIOS sets some memory aside for the graphics alone (Auto = small, or 4 / 8 GB); Windows never sees that part.
const fixed8 = apuGraphicsGB({ installedBytes: 16 * GB, visibleBytes: 7.69 * GB, reservedBytes: 8 * GB });
check('16 GB Legion Go with 8 GB set aside (Windows sees 7.7): at least the 8 GB counts, plus a careful borrow', fixed8.vramGB >= 8 && fixed8.vramGB === 11 && fixed8.reservedGraphicsGB === 8 && fixed8.installedRamGB === 16 && fixed8.visibleRamGB === 7.7 && fixed8.auto === false, JSON.stringify(fixed8));
check('the borrow never eats into the last 4 GB Windows keeps', fixed8.borrowGB === 3 && APU_HEADROOM_GB === 4);
const fixed4 = apuGraphicsGB({ installedBytes: 16 * GB, visibleBytes: 11.7 * GB, reservedBytes: 4 * GB });
check('4 GB set aside: 4 plus half of the rest', fixed4.vramGB === 9 && fixed4.reservedGraphicsGB === 4 && fixed4.installedRamGB === 16, JSON.stringify(fixed4));
const auto = apuGraphicsGB({ installedBytes: 16 * GB, visibleBytes: 15.4 * GB, reservedBytes: 512 * 1024 ** 2 });
check('Auto (512 MB set aside, the recommended setting): back to the old half-of-visible estimate, and called auto', auto.vramGB === 7 && auto.vramGB === sharedGraphicsGB(15.4 * GB) && auto.auto === true && auto.reservedGraphicsGB === 0.5 && auto.installedRamGB === 16, JSON.stringify(auto));
const unknown = apuGraphicsGB({ installedBytes: 0, visibleBytes: 32 * GB, reservedBytes: 0 });
check('nothing readable: the old estimate, installed RAM taken as what is visible', unknown.vramGB === 16 && unknown.installedRamGB === 32 && unknown.reservedGraphicsGB === 0);
// Windows: the registry's qwMemorySize (bytes), matched by driver name; MemorySize (32-bit) only when small; one JSON.
const psJson = '{"installed":17179869184,"adapters":[{"desc":"AMD Radeon(TM) Graphics","qw":8589934592,"mem":0},{"desc":"Microsoft Remote Display Adapter","qw":0,"mem":0}]}';
check('Windows registry JSON: the chip\'s set-aside and the sticks\' total', JSON.stringify(parseApuJson(psJson, 'AMD Radeon(TM) Graphics')) === JSON.stringify({ installed: 16 * GB, reserved: 8 * GB }));
check('a single adapter comes back as an object, not a list: still read', parseApuJson('{"installed":17179869184,"adapters":{"desc":"AMD Radeon(TM) Graphics","qw":0,"mem":536870912}}', 'AMD Radeon(TM) Graphics').reserved === 512 * 1024 ** 2);
check('a 32-bit MemorySize over 4 GB is a wrapped number, so it is not trusted', parseApuJson('{"installed":0,"adapters":[{"desc":"AMD Radeon(TM) Graphics","qw":0,"mem":4294967295}]}', 'AMD Radeon(TM) Graphics').reserved === 0);
check('garbage from PowerShell: zeros, never a throw', JSON.stringify(parseApuJson('', 'x')) === JSON.stringify({ installed: 0, reserved: 0 }) && parseApuJson('not json', 'x').reserved === 0);
// The whole Windows path: the adapter list first, then the memory question (told apart by what is asked), no real programs.
const twoAsks = (names, json) => (file, args, opts, cb) => { if (file !== 'powershell.exe') return cb(new Error('not here')); cb(null, /Win32_PhysicalMemory/.test(args.join(' ')) ? json : names); };
const go8 = await integratedGpu({ os_: 'win', execImpl: twoAsks('AMD Radeon(TM) Graphics\r\n', psJson), totalmem: 7.69 * GB, cpu: 'AMD Ryzen Z1 Extreme', fresh: true });
check('Legion Go set to 8 GB: 11 GB for models, 16 GB installed, 8 set aside', go8?.integrated && go8.vramGB === 11 && go8.installedRamGB === 16 && go8.reservedGraphicsGB === 8 && go8.visibleRamGB === 7.7, JSON.stringify(go8));
const goAuto = await integratedGpu({ os_: 'win', execImpl: twoAsks('AMD Radeon(TM) Graphics\r\n', '{"installed":17179869184,"adapters":[{"desc":"AMD Radeon(TM) Graphics","qw":536870912,"mem":0}]}'), totalmem: 15.4 * GB, cpu: 'AMD Ryzen Z1 Extreme', fresh: true });
check('Legion Go on Auto: 7 GB for models, called auto', goAuto?.vramGB === 7 && goAuto.auto === true && goAuto.installedRamGB === 16, JSON.stringify(goAuto));
const nv2 = await gpuInfo({ os_: 'win', execImpl: twoAsks('AMD Radeon(TM) Graphics', psJson), totalmem: 32 * GB, cpu: 'AMD Ryzen 7 9800X3D 8-Core Processor', fresh: true });
check('a desktop with no NVIDIA card and a desktop Ryzen: still nothing (the memory question is never asked)', nv2 === null);
const linMem = await apuMemory({ os_: 'linux', chip: 'Phoenix1', totalmem: 15.4 * GB, listDir: () => ['card0', 'card0-eDP-1', 'renderD128'], readFile: (f) => (f === '/sys/class/drm/card0/device/mem_info_vram_total' ? '536870912\n' : (() => { throw new Error('no'); })()) });
check('Linux: amdgpu\'s set-aside from sysfs, installed = visible + set-aside', linMem.reserved === 512 * 1024 ** 2 && Math.round(linMem.installed / GB * 10) / 10 === 15.9, JSON.stringify(linMem));
check('Linux with no sysfs at all: zeros', JSON.stringify(await apuMemory({ os_: 'linux', listDir: () => { throw new Error('no'); }, totalmem: 8 * GB })) === JSON.stringify({ installed: 8 * GB, reserved: 0 }));
// The spec line and the Get models panel say how the one pool is split (wording approved by the settings review).
const goGpu = { name: 'AMD Radeon(TM) Graphics (shared memory)', integrated: true, unified: true, ...fixed8 };
check('spec line, 8 GB set aside', specLine({ cpu: 'Ryzen Z1 Extreme', gpu: goGpu, ramGB: 8 }) === 'Ryzen Z1 Extreme · Radeon built-in · 16 GB memory (8 GB set aside for graphics)', specLine({ cpu: 'Ryzen Z1 Extreme', gpu: goGpu, ramGB: 8 }));
check('spec line on Auto', specLine({ cpu: 'Ryzen Z1 Extreme', gpu: { ...goGpu, ...auto }, ramGB: 16 }) === 'Ryzen Z1 Extreme · Radeon built-in · 16 GB memory (shared with graphics as needed)');
check('Intel chips name theirs', /Arc built-in/.test(specLine({ cpu: 'Core Ultra 7 155H', gpu: { name: 'Intel(R) Arc(TM) Graphics (shared memory)', integrated: true, ...auto } })) && /Iris Xe built-in/.test(specLine({ cpu: 'i7', gpu: { name: 'Intel(R) Iris(R) Xe Graphics (shared memory)', integrated: true, ...auto } })));
check('without the new readings the old line stays', specLine({ cpu: 'Ryzen Z1 Extreme', gpu: { name: 'AMD Radeon', integrated: true, vramGB: 16 }, ramGB: 32 }) === 'Ryzen Z1 Extreme · built-in graphics · 32 GB RAM');
check('Get models panel: "Memory: 16 GB shared, 8 GB set aside for graphics" or "shared with graphics as needed"', /Memory: \$\{hw\.installedRamGB\} GB \$\{hw\.reservedGraphicsGB >= 2 \? `shared, \$\{hw\.reservedGraphicsGB\} GB set aside for graphics` : 'shared with graphics as needed'\}/.test(cellar));
const modelsSrc = fs.readFileSync(new URL('../src/models.js', import.meta.url), 'utf8');
check('/api/hardware carries installedRamGB, reservedGraphicsGB and visibleRamGB', /installedRamGB: gpu\.installedRamGB, reservedGraphicsGB: gpu\.reservedGraphicsGB, visibleRamGB: gpu\.visibleRamGB/.test(modelsSrc));
const help = fs.readFileSync(new URL('../public/help-content.js', import.meta.url), 'utf8');
check('Help: the FAQ explains the set-aside (BIOS or the maker\'s app) and the glossary has "Set aside for graphics"', /Auto, 4 GB or 8 GB in your BIOS or the maker's app, such as Legion Space or Armoury Crate/.test(help) && /<dt>Set aside for graphics<\/dt>/.test(help));

// ---- 1.5.126: the memory guard on shared-memory machines: shorten the chat memory, or refuse, never crash ----
const fakeBrain = (free, loaded = []) => ({ cfg: { sharedGraphics: true, apuHoldbackGB: 4 }, gate: { brainBytes: (m, { ctx }) => 6 * GB + Math.min(ctx || 32768, 131072) * 60 * 1024 }, engine: { loaded: async () => loaded } });
let r = await apuRoom(fakeBrain(), 'qwen', 32768, { freeMem: 12 * GB });
check('plenty of RAM: the brain loads as asked (6 GB brain + 32K chat memory, 12 GB free, 4 kept for Windows)', r.ok && r.ctx === 32768 && !r.shortened, JSON.stringify(r));
r = await apuRoom(fakeBrain(), 'qwen', 32768, { freeMem: 10.6 * GB });
check('a little tight: the chat memory is shortened (32K -> 8K), not refused', r.ok && r.shortened && r.ctx === 8192, JSON.stringify(r));
r = await apuRoom(fakeBrain(), 'qwen', 32768, { freeMem: 10 * GB });
check('too tight even at 8K: refused, with Bob\'s plain line', !r.ok && r.line === APU_NO_ROOM(r.needGB, r.roomGB) && /only about 6 GB is free once Windows keeps its share/.test(r.line) && /needs about 6\.5 GB/.test(r.line), r.line);
r = await apuRoom(fakeBrain(), 'qwen', 32768, { freeMem: 4 * GB, loaded: [{ name: 'gemma', size: 8 * GB }] });
check('the brain being swapped out counts as room', r.ok && r.ctx === 32768, JSON.stringify(r));
r = await apuRoom(fakeBrain(), 'qwen', 32768, { freeMem: 1 * GB, loaded: [{ name: 'qwen', size: 6 * GB }] });
check('already loaded: nothing to find room for', r.ok && !r.shortened);
r = await apuRoom({ ...fakeBrain(), cfg: {} }, 'qwen', 32768, { freeMem: 1 * GB });
check('a real graphics card: untouched (the card has its own memory)', r.ok && r.ctx === 32768);
r = await apuRoom({ ...fakeBrain(), gate: { brainBytes: () => undefined } }, 'qwen', 32768, { freeMem: 1 * GB });
check('a brain whose size is unknown goes the old way', r.ok && !r.shortened);
const brainSrc = brainText();
check('Nov 12: the guard never stops or shortens a load from the estimate (fitCtx, ensureModel, wake only log it; a real out-of-memory steps down)', /const room = await apuRoom\(this, model, fit\);/.test(brainSrc) && !/throw new Error\(room\.line\)/.test(brainSrc) && !/not waking \$\{model\}: too little RAM/.test(brainSrc) && /loading \$\{model\} anyway: the estimate says/.test(brainSrc) && /waking \$\{model\} anyway/.test(brainSrc) && /keeping \$\{model\}'s \$\{fit\} chat memory/.test(brainSrc));

// ---- 1.5.133: the set-aside counts (Legion Go: every brain was refused with 8 GB set aside) ----
const goBrain = (reserved, size) => ({ cfg: { sharedGraphics: true, reservedGraphicsGB: reserved }, gate: { brainBytes: (m, { ctx }) => size * GB + Math.min(ctx || 32768, 131072) * 60 * 1024 }, engine: { loaded: async () => [] } });
// Qwen3 4B ~3 GB all told (2 GB file + 32K chat memory ~1.9 GB, but at 8K ~0.5 GB): 8 GB set aside, 1.1 GB free
r = await apuRoom(goBrain(8, 1.1), 'qwen3-4b', 32768, { freeMem: 1.1 * GB });
check('8 GB set aside, 1.1 GB free: a ~3 GB brain loads (the set-aside is the room)', r.ok && r.ctx === 32768, JSON.stringify(r));
r = await apuRoom(goBrain(8, 3.6), 'coder-7b', 32768, { freeMem: 1.1 * GB });
check('8 GB set aside, 1.1 GB free: a ~5.5 GB brain loads too', r.ok, JSON.stringify(r));
r = await apuRoom(goBrain(0.5, 1.1), 'qwen3-4b', 32768, { freeMem: 1.1 * GB });
check('Auto (0.5 GB set aside), 1.1 GB free: still refused (Windows would run short)', !r.ok && typeof r.line === 'string', JSON.stringify(r));
r = await apuRoom(goBrain(8, 8), 'big', 32768, { freeMem: 1.1 * GB });
check('a 10 GB brain on an 8 GB set-aside with little RAM free: shortened or refused, never a crash', (!r.ok && r.line) || (r.ok && r.shortened), JSON.stringify(r));
r = await apuRoom(goBrain(8, 8), 'big', 32768, { freeMem: 12 * GB });
check('the same brain with RAM free beyond the set-aside: loads', r.ok && !r.shortened, JSON.stringify(r));
check('borrow first: my own brain not fitting asks a paired Bob first; with none free it tries its own anyway (Nov 12)', /if \(!room\.ok\) \{ ownRefused = room; borrowing = true;/.test(brainSrc) && /if \(ownRefused\) this\.log\('borrow', 'no other Bob is free; trying my own brain anyway/.test(brainSrc) && !/throw new Error\(ownRefused\.line\)/.test(brainSrc));

// ---- 1.5.181: "Memory kept for Windows" is a setting (two-Bob trial: the Legion Go on Auto, 6.6 of 15.2 GB free) ----
const autoGo = (size, extra = {}) => ({ cfg: { sharedGraphics: true, reservedGraphicsGB: 0.5, ...extra }, gate: { brainBytes: (m, { ctx }) => size * GB + Math.min(ctx || 32768, 131072) * 60 * 1024 }, engine: { loaded: async () => [] } });
check('holdback: 2 GB to start with (Nov 12, 4 before), the owner\'s 0 to 8 GB when set, anything else falls back to 2', apuHoldbackGB({}) === 2 && apuHoldbackGB({ apuHoldbackGB: 0 }) === 0 && apuHoldbackGB({ apuHoldbackGB: 2.5 }) === 2.5 && apuHoldbackGB({ apuHoldbackGB: 12 }) === 2 && apuHoldbackGB({ apuHoldbackGB: 'x' }) === 2);
r = await apuRoom(autoGo(2.5, { apuHoldbackGB: 4 }), 'qwen3-4b', 32768, { freeMem: 6.6 * GB });
check('Auto, 6.6 GB free, 4 GB kept: a ~3 GB brain is refused (what the trial saw)', !r.ok, JSON.stringify(r));
r = await apuRoom(autoGo(2.5, { apuHoldbackGB: 0 }), 'qwen3-4b', 32768, { freeMem: 6.6 * GB });
check('...with 0 kept it loads', r.ok, JSON.stringify(r));
r = await apuRoom(autoGo(4.8, { apuHoldbackGB: 0 }), 'coder-7b', 32768, { freeMem: 6.6 * GB });
check('...and so does the ~5.3 GB Review brain (chat memory shortened if needed)', r.ok, JSON.stringify(r));
r = await apuRoom(autoGo(8, { apuHoldbackGB: 0 }), 'big', 32768, { freeMem: 6.6 * GB });
check('...but a brain bigger than what\'s free is still refused, with the plain line (no Windows share mentioned at 0 kept)', !r.ok && r.line === APU_NO_ROOM(r.needGB, r.roomGB, 0) && !/Windows/.test(r.line), JSON.stringify(r));
const cellar181 = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Settings, Brains has the slider (built-in graphics only, 0 to 8 GB, half steps) with the warning about 0', /hw\?\.gpu\?\.integrated \? holdbackHtml\(\)/.test(cellar181) && /type="range" min="0" max="8" step="0\.5" data-holdback/.test(cellar181) && /At 0, Windows may slow down, or Bob may close, if memory runs out/.test(cellar181));
const cfgSrc181 = fs.readFileSync(new URL('../src/config.js', import.meta.url), 'utf8');
check('the setting is saved (0 to 8, rounded to half a GB) and the glossary explains it', /'apuHoldbackGB'\]/.test(cfgSrc181) && /out\.apuHoldbackGB = v/.test(cfgSrc181) && /<dt>Memory kept for Windows<\/dt>/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
