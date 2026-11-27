// The install guides (docs/install/) and the setup picker made from the catalog (installer/install-guides.js).
// Nothing here reads the real computer: every device is made up, and the picks come from the catalog in the repo.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CLASSES, adviceFor, enginesFor, labNote, hardwareFor, build, pickerData, UNPROVEN } from '../installer/install-guides.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const app = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(app, f), 'utf8').replace(/\r\n/g, '\n');
const json = (f) => JSON.parse(read(f));
const catalog = json('catalog.json');
const phone = json('android/phone-models.json');
const devices = json('docs/install/devices.json');
const brain = (a) => a.models.find((m) => m.jobs.split(', ').includes('Brain'))?.name || '';

// ---- the picks are the catalog's ----
const pc = (vramGB, ramGB = 32, gpu = 'nvidia') => adviceFor({ cls: 'windows', gpu, vramGB, ramGB }, catalog, phone);
check('16 GB card: the 16 GB set, Qwen3.6 35B-A3B', pc(16).pack.id === 'big' && brain(pc(16)) === 'Qwen3.6 35B-A3B', brain(pc(16)));
check('12 GB card: the 16 GB set too', pc(12).pack.id === 'big');
check('8 GB card: the 8 GB set, Gemma 4 E4B', pc(8).pack.id === 'mid' && brain(pc(8)) === 'Gemma 4 E4B');
check('6 GB card: the 6 GB set, Qwen3 4B', pc(6).pack.id === 'small' && /Qwen3 4B/.test(brain(pc(6))));
check('4 GB card and no card: the processor set', pc(4).pack.id === 'cpu' && adviceFor({ cls: 'windows', gpu: 'none', ramGB: 16 }, catalog, phone).pack.id === 'cpu');
const hand = (ramGB) => adviceFor({ cls: 'handheld', gpu: 'builtin', ramGB }, catalog, phone);
check('handheld: the built-in graphics set', hand(16).pack.id === 'shared' && /Qwen3 4B/.test(brain(hand(16))));
check('handheld with 32 GB: the big-memory brains, left unticked', hand(32).models.some((m) => m.name === 'Gemma 4 26B' && !m.ticked) && !hand(16).models.some((m) => m.name === 'Gemma 4 26B'));
check('handheld: clips left unticked, as the set says', hand(16).models.some((m) => /Wan/.test(m.name) && !m.ticked));
const mac = (ramGB) => adviceFor({ cls: 'mac', gpu: 'apple', ramGB }, catalog, phone);
check('Mac counts two thirds of memory (three quarters from 36 GB)', hardwareFor({ cls: 'mac', ramGB: 16 }).vramGB === 10 && hardwareFor({ cls: 'mac', ramGB: 48 }).vramGB === 36);
check('Mac 8, 16 and 24 GB get the 6, 8 and 16 GB sets', mac(8).pack.id === 'small' && mac(16).pack.id === 'mid' && mac(24).pack.id === 'big');
const pi = (ramGB) => adviceFor({ cls: 'pi', gpu: 'none', ramGB }, catalog, phone);
check('Pi: 4 GB gets Qwen3.5 2B, 8 GB Gemma 4 E2B', brain(pi(4)) === 'Qwen3.5 2B' && brain(pi(8)) === 'Gemma 4 E2B');
check('Pi: no painter', !pi(8).models.some((m) => m.jobs.includes('Painter')));
const and8 = adviceFor({ cls: 'android', gpu: 'none', ramGB: 8 }, catalog, phone);
check('Android: Gemma 4 E2B recommended and ticked, 12K on 8 GB', and8.models[0].name === 'Gemma 4 E2B' && and8.models[0].ticked && /12K/.test(and8.pack.blurb));
check('Android 6 GB: 8K', /8K/.test(adviceFor({ cls: 'android', gpu: 'none', ramGB: 6 }, catalog, phone).pack.blurb));
check('iPhone: nothing to download', adviceFor({ cls: 'iphone', gpu: 'none' }, catalog, phone).models.length === 0);

// ---- engines, in plain words ----
const eng = (c, g) => enginesFor(c, g).map((e) => `${e.job}: ${e.engine}`).join('\n');
check('NVIDIA on Windows: Lamplight on CUDA', /Brains: Lamplight.*CUDA/.test(eng('windows', 'nvidia')));
check('AMD on Windows: Lamplight on Vulkan', /Brains: Lamplight.*Vulkan/.test(eng('windows', 'amd')));
check('Linux pictures use Vulkan on every card', /Pictures and clips: stable-diffusion\.cpp, Vulkan/.test(eng('linux', 'nvidia')));
check('Mac: llama.cpp with Metal, Gemma listens, Kokoro speaks', /Brains: llama\.cpp with Metal/.test(eng('mac', 'apple')) && /Hearing you: Gemma 4 E4B/.test(eng('mac', 'apple')) && /Voice: Kokoro/.test(eng('mac', 'apple')));
check('Pi: no Lamplight, no painter', /ARM processor build/.test(eng('pi', 'none')) && /None on the board/.test(eng('pi', 'none')));
check('3D only offered with NVIDIA', /TRELLIS/.test(eng('windows', 'nvidia')) && !/TRELLIS/.test(eng('windows', 'amd')));

// ---- honest about what was tested ----
check('untested combinations say so in the house words', [['windows', 'amd'], ['windows', 'none'], ['linux', 'amd'], ['mac', 'apple'], ['pi', 'none'], ['iphone', 'none']].every(([c, g]) => labNote(c, g).includes(UNPROVEN)));
check('only lab devices are marked tested', devices.devices.filter((d) => d.lab).every((d) => /^Tested/.test(labNote(d.class, d.gpu))));
check('every known device names a known kind and graphics', devices.devices.every((d) => { const c = CLASSES.find((x) => x.id === d.class); return c && c.gpus.includes(d.gpu); }));
check('device ids are unique', new Set(devices.devices.map((d) => d.id)).size === devices.devices.length);

// ---- the made files are current, and every known device has an answer ----
const out = build();
check('sizes.md and picker.html are up to date (run node installer/install-guides.js)', Object.entries(out).every(([f, t]) => read(f) === t));
const data = pickerData(catalog, phone, devices);
const snap = (list, n) => list.filter((x) => x <= n).at(-1) ?? list[0];
const missing = devices.devices.filter((d) => { const v = ['nvidia', 'amd', 'intel'].includes(d.gpu) ? snap(data.vram.filter((x) => x >= 2), d.vramGB) : 0; return data.keys[`${d.class}|${d.gpu}|${v}|${d.ramGB ? snap(data.ram, d.ramGB) : 0}`] == null; });
check('the picker has an answer for every known device', missing.length === 0, missing.map((d) => d.id).join(', '));
check('the picker page has its data and no outside scripts', !/\/\*PICKER_DATA\*\/null/.test(out['docs/install/picker.html']) && !/<script[^>]+src=/.test(out['docs/install/picker.html']));

// ---- the guides ----
const guides = CLASSES.map((c) => c.guide);
check('every kind of device has its guide', guides.every((g) => fs.existsSync(path.join(app, 'docs/install', g))));
const index = read('docs/install/README.md');
check('the guide list links every guide', guides.every((g) => index.includes(`(${g})`)));
const all = ['README.md', 'sizes.md', ...guides].map((g) => read(`docs/install/${g}`)).join('\n');
check('the guides call the engine Lamplight, never by its old name', /Lamplight/.test(all) && !/Brain Engine/.test(all));
check('the guides never name the books', !/bobiverse/i.test(all));
const links = [...all.matchAll(/\]\((?!https?:|#)([^)#]+)(?:#[^)]*)?\)/g)].map((m) => m[1]);
const bad = links.filter((l) => !fs.existsSync(path.join(app, 'docs/install', l)));
check('every link inside the guides goes to a file that is there', bad.length === 0, bad.join(', '));
const readme = fs.readFileSync(path.join(app, '..', 'README.md'), 'utf8');
check('the README links the install guides', /app\/docs\/install\/README\.md/.test(readme) && guides.every((g) => readme.includes(`app/docs/install/${g}`)));
check('the docs index lists them', /install\/README\.md/.test(read('docs/README.md')));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
