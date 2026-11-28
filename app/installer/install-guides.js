#!/usr/bin/env node
// The install guides' shared facts, and the setup picker made from them (app/docs/install/).
// One source for both: the catalog's starter sets (catalog.json "packs", picked with public/fit.js packFor, the same
// call Get Bob ready makes), where each brain would live (public/place.js placeFor), the engines each kind of computer
// gets (src/engines.js), the phone brains (android/phone-models.json) and the known devices (docs/install/devices.json).
//   node installer/install-guides.js          writes docs/install/sizes.md and docs/install/picker.html
//   node installer/install-guides.js --check  fails if either is out of date (npm test runs this check)
// Pure functions first (the tests call them with made-up hardware); nothing here reads the real computer.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { packFor, pickFor } from '../public/fit.js';
import { placeFor } from '../public/place.js';
import { gb } from '../public/util.js';
import { starterTicks } from '../public/equip.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => fs.readFileSync(path.join(root, p), 'utf8').replace(/\r\n/g, '\n');
const readJson = (p) => JSON.parse(read(p));

export const UNPROVEN = 'unproven in our lab, as we have yet to test';

// Kinds of device. os: which Bob download. gpus: the graphics choices the picker offers for this kind.
const WIN_STEPS = ['Download the Windows zip.', 'Right-click it, Properties, tick Unblock, OK.', 'Unzip it into a folder you keep, then double-click Bob.exe.', 'Pick a home folder for his models (not a cloud-synced one).', 'Press Get Bob ready. Nothing big downloads before that.'];
export const CLASSES = [
  { id: 'windows', name: 'Windows PC', os: 'win', file: 'win-x64.zip', guide: 'windows.md', gpus: ['nvidia', 'amd', 'intel', 'builtin', 'none'], steps: WIN_STEPS },
  { id: 'linux', name: 'Linux PC', os: 'linux', file: 'linux-x86_64.AppImage', guide: 'linux.md', gpus: ['nvidia', 'amd', 'intel', 'builtin', 'none'], steps: ['Download the AppImage (or the .deb or Flatpak).', 'Mark it as executable (chmod +x) and double-click it. An older distro may need libfuse2.', 'NVIDIA: have the NVIDIA driver installed. AMD and Intel: have Vulkan drivers (Mesa) installed.', 'Pick a home folder for his models.', 'Press Get Bob ready.'] },
  { id: 'mac', name: 'Mac (Apple Silicon)', os: 'mac', file: 'mac-arm64.zip', guide: 'mac.md', gpus: ['apple'], steps: ['Download the Mac zip and open it.', 'Drag Bob into Applications.', 'The first time: System Settings, Privacy & Security, Open Anyway.', 'Pick a home folder for his models.', 'Press Get Bob ready.'] },
  { id: 'laptop', name: 'Laptop with a small graphics card', os: 'win', file: 'win-x64.zip', guide: 'laptop.md', gpus: ['nvidia', 'amd', 'intel', 'builtin'], steps: [...WIN_STEPS.slice(0, 4), 'Plug the laptop in, set Windows to Best performance, then press Get Bob ready.'] },
  { id: 'handheld', name: 'Handheld PC (Legion Go, ROG Ally and the like)', os: 'win', file: 'win-x64.zip', guide: 'handheld.md', gpus: ['builtin'], steps: [...WIN_STEPS.slice(0, 4), 'Plug it in, close games and the browser, then press Get Bob ready.'] },
  { id: 'pi', name: 'Raspberry Pi or other ARM board', os: 'linux-arm', file: 'linux-arm64.AppImage', guide: 'raspberry-pi.md', gpus: ['none'], steps: ['Use 64-bit Raspberry Pi OS (or another 64-bit Linux).', 'Download the arm64 AppImage (or the arm64 .deb).', 'Mark it as executable and double-click it.', 'Pick a home folder on a fast drive (an SSD beats an SD card).', 'Press Get Bob ready.'] },
  { id: 'android', name: 'Android phone or tablet', os: 'android', file: 'android.apk', guide: 'android.md', gpus: ['none'], steps: ['Needs Android 13 or newer.', 'Download the .apk on the phone and open it; allow installing from your browser when Android asks.', 'Put the phone and your computer on Tailscale, and turn on Bob-Net access in the computer\'s Bob.', 'Add your Bob in the app with his passcode.', 'Optional: Menu, Phone brain, to download a brain for the phone itself.'] },
  { id: 'iphone', name: 'iPhone or iPad', os: 'ios', file: 'iphone.ipa', guide: 'iphone.md', gpus: ['none'], steps: ['The app: sign the .ipa with your own Apple ID in Sideloadly or AltStore on a Windows PC or Mac (free, again every 7 days), then Menu, Phone brain. Or, with no app: the next steps.', 'Put the iPhone and your computer on Tailscale.', 'In the computer\'s Bob: Settings, Bob-Net, turn on Bob-Net access.', 'In Safari, open his address with /phone/ on the end, and type the passcode.', 'Tap Share, then Add to Home Screen.'] }
];
export const GPU_NAMES = { nvidia: 'NVIDIA card', amd: 'AMD card', intel: 'Intel Arc card', builtin: 'Built-in graphics only', none: 'No graphics card', apple: 'Apple Silicon' };
export const classOf = (id) => CLASSES.find((c) => c.id === id) || null;

// What has really run in our lab, per kind of device and graphics. Everything else is unproven.
export function labNote(cls, gpu) {
  if (cls === 'windows' && gpu === 'nvidia') return 'Tested: our main test PC has a 16 GB RTX 5070 Ti and 32 GB of memory.';
  if (cls === 'laptop' && gpu === 'nvidia') return 'Tested: a laptop with a 6 GB RTX 3060 and 32 GB of memory runs Bob in our lab.';
  if (cls === 'handheld') return 'Tested: a 16 GB Legion Go runs Bob in our lab for chat and Bob-Net. Pictures and clips on it are ' + UNPROVEN + '.';
  if (cls === 'android') return 'Tested: the Android app runs on an 8 GB phone in our lab.';
  if (cls === 'linux' && gpu === 'nvidia') return 'Partly tested: Lamplight runs on rented Linux machines with NVIDIA cards for our brain tests. The desktop app on a Linux PC is checked on GitHub\'s machines only, so it is ' + UNPROVEN + '.';
  if (cls === 'mac') return 'Built and checked on GitHub\'s Mac machines only. On a real Mac it is ' + UNPROVEN + '.';
  if (cls === 'pi') return 'Built and checked on GitHub\'s ARM machines only. On a real board it is ' + UNPROVEN + '.';
  if (cls === 'iphone') return 'The app and the phone screen are checked on GitHub\'s iPhone simulator only. On a real iPhone they are ' + UNPROVEN + '.';
  return 'This combination is ' + UNPROVEN + '.';
}

// The engines Bob sets up for each job (src/engines.js decides the builds; this says it in plain words).
export function enginesFor(cls, gpu) {
  const c = classOf(cls);
  if (!c) return [];
  if (cls === 'android') return [{ job: 'Brain on the phone', engine: 'llama.cpp, built into the app', how: 'On the phone\'s processor. Off until you turn it on.' }];
  if (cls === 'iphone') return [{ job: 'Brain on the iPhone (the app)', engine: 'llama.cpp, built into the app', how: 'On the iPhone\'s graphics (Metal). Off until you download one.' }, { job: 'Everything else', engine: 'The Bob on your computer', how: 'Over Tailscale, in the app or in Safari.' }];
  if (c.os === 'linux-arm') {
    return [
      { job: 'Brains', engine: 'llama.cpp, the ARM processor build', how: 'On the processor. Lamplight has no ARM build yet.' },
      { job: 'Hearing you', engine: 'whisper.cpp', how: 'On the processor.' },
      { job: 'Voice', engine: 'Piper or Kokoro', how: 'On the processor.' },
      { job: 'Pictures and clips', engine: 'None on the board', how: 'There\'s no ARM build of stable-diffusion.cpp. A bigger Bob on Bob-Net can paint for it (Send jobs).' }
    ];
  }
  if (c.os === 'mac') {
    return [
      { job: 'Brains', engine: 'llama.cpp with Metal', how: 'On the Mac\'s graphics. Lamplight has no Mac build yet.' },
      { job: 'Pictures and clips', engine: 'stable-diffusion.cpp with Metal', how: 'On the Mac\'s graphics.' },
      { job: 'Hearing you', engine: 'Gemma 4 E4B', how: 'There\'s no Mac whisper.cpp download, so a small brain does the listening.' },
      { job: 'Voice', engine: 'Kokoro', how: 'On the processor. Piper doesn\'t start on current macOS.' },
      { job: 'Music and sound effects', engine: 'Audio tools (ACE-Step, AudioLDM 2)', how: 'Optional, about 12 GB.' },
      { job: 'Picture to 3D', engine: 'None on a Mac', how: 'It needs an NVIDIA card. Send the job to a PC Bob over Bob-Net.' }
    ];
  }
  const linux = c.os === 'linux';
  const card = gpu === 'nvidia' ? 'CUDA' : (gpu === 'amd' || gpu === 'intel' || gpu === 'builtin') ? 'Vulkan' : '';
  const brains = card === 'CUDA'
    ? { job: 'Brains', engine: 'Lamplight (Bob\'s own engine), on llama.cpp\'s CUDA build', how: 'On the graphics card, with the rest in memory when a brain is bigger than the card.' }
    : card
      ? { job: 'Brains', engine: 'Lamplight (Bob\'s own engine), on llama.cpp\'s Vulkan build', how: 'On the graphics. A few of Lamplight\'s speed tricks have CUDA code only, so they stay off here. ' + (cls === 'handheld' ? '' : 'Lamplight on Vulkan here is ' + UNPROVEN + '.') }
      : { job: 'Brains', engine: 'Lamplight (Bob\'s own engine), on the processor', how: 'Slower than a graphics card. Small brains only.' };
  const paint = gpu === 'none'
    ? { job: 'Pictures and clips', engine: 'Not in the starter set', how: 'Without graphics, painting is too slow, so Bob leaves it out. A bigger Bob on Bob-Net can paint (Send jobs).' }
    : linux
      ? { job: 'Pictures and clips', engine: 'stable-diffusion.cpp, Vulkan build', how: 'Any card. There\'s no Linux CUDA build of it.' }
      : { job: 'Pictures and clips', engine: `stable-diffusion.cpp, ${card} build`, how: 'On the graphics.' };
  const rows = [
    brains,
    paint,
    { job: 'Hearing you', engine: 'whisper.cpp', how: 'On the processor, so the card stays free.' },
    { job: 'Voice', engine: 'Kokoro (or Piper)', how: 'On the processor. Chatterbox, which can copy a voice, uses about 4 GB of the card.' },
    { job: 'Music and sound effects', engine: 'Audio tools (ACE-Step, AudioLDM 2)', how: 'Optional, about 12 GB.' },
    gpu === 'nvidia'
      ? { job: 'Picture to 3D', engine: '3D workshop (TRELLIS.2)', how: 'Optional, about 28 GB. 16 GB cards are best; smaller cards may run out of memory.' }
      : { job: 'Picture to 3D', engine: 'Not here', how: 'It needs an NVIDIA card. Send the job to a Bob that has one.' }
  ];
  return rows;
}

// The hardware Bob's own picker would see: integrated graphics (handhelds, thin laptops) and Macs share memory.
export function hardwareFor({ cls, gpu, vramGB = 0, ramGB = 0 }) {
  if (cls === 'mac') {
    const share = Math.floor(ramGB * (ramGB >= 36 ? 0.75 : 0.67)); // src/platform.js unifiedGraphicsGB
    return { vramGB: share, ramGB, unified: true };
  }
  if (cls === 'pi') return { vramGB: 0, ramGB, arm: true };
  if (gpu === 'builtin') return { vramGB: 0, ramGB, integrated: true };
  if (gpu === 'none') return { vramGB: 0, ramGB };
  return { vramGB, ramGB };
}

const SLOT = { bob: 'Brain', small: 'Quick brain', deep: 'Deep thinking', tinker: 'Coding', eyes: 'Seeing pictures', embed: 'Memory search', voice: 'Hearing you', speech: 'Voice', image: 'Painter', edit: 'Picture editor', video: 'Clips', office: 'Office' };
const plain = (s) => String(s || '').replace(/replicant matrix/g, 'computer');

// The starter set and a line per model for this hardware: which jobs, how big, where it lives, and whether Bob ticks it.
export function adviceFor(input, catalog, phone) {
  const { cls, gpu } = input;
  const ramGB = Number(input.ramGB) || 0;
  const vramGB = Number(input.vramGB) || 0;
  if (cls === 'android' || cls === 'iphone') { // the iPhone app uses Bob for Android's list (android/phone-models.json)
    const big = ramGB >= 7 || !ramGB;
    const list = (phone?.models || []).map((m) => {
      const c = m.fromCatalog ? catalog.models.find((x) => x.id === m.fromCatalog) : null;
      const bytes = m.file?.bytes || c?.files?.find((f) => /\.gguf$/i.test(f.name || f.url || ''))?.bytes;
      return { name: m.name, jobs: m.pick === 'recommended' ? 'Phone brain (recommended)' : 'Phone brain (second choice)', size: bytes ? gb(bytes / 1e9) : '', where: 'On the phone', why: m.what, ticked: m.pick === 'recommended' };
    });
    return { pack: { id: 'phone', label: 'Phone brain', blurb: `Chat goes to the Bob on your computer when one is reachable. The phone brain is for when none is. It keeps ${big ? '12K' : '8K'} tokens in mind on ${big ? 'a phone with 8 GB or more' : 'a smaller phone'}.` }, models: list, warn: ramGB && ramGB < 6 ? [`With ${ramGB} GB a phone brain is ${UNPROVEN}; use the phone with the Bob on your computer instead.`] : [] };
  }
  const hw = hardwareFor({ cls, gpu, vramGB, ramGB });
  const pack = packFor(catalog.packs || [], hw.vramGB, Boolean(hw.integrated), { arm: Boolean(hw.arm), ramGB: hw.ramGB });
  const byId = Object.fromEntries((catalog.models || []).map((m) => [m.id, m]));
  const ticks = starterTicks(pack, catalog.models || [], hw.integrated || hw.arm ? 0 : hw.vramGB); // what Get Bob ready ticks
  const extra = pack.bigRam && ramGB >= pack.bigRam.minRamGB ? pack.bigRam : null;
  const ids = [...pack.models, ...(extra?.models || [])];
  const models = ids.map((id) => {
    const m = byId[id];
    if (!m) return null;
    const slots = (pack.slots?.[id] || extra?.slots?.[id] || []).map((s) => SLOT[s] || s);
    const brain = ['chat', 'coding'].includes(m.category);
    const place = brain && (hw.ramGB || hw.vramGB) ? placeFor(m, hw) : null;
    return {
      name: m.name, jobs: slots.join(', '), size: gb(m.sizeGB),
      where: place ? (hw.integrated ? 'Shared memory' : place.word) : brain ? '' : (m.category === 'images' || m.category === 'video') ? 'Graphics' : 'Processor',
      why: plain(pack.notes?.[id] || extra?.notes?.[id] || ''),
      ticked: ticks.has(id),
      rent: place?.where === 'rent'
    };
  }).filter(Boolean);
  // Bob's own pick for the main brain (the Brains page's Recommended), when the starter set doesn't hold it: on 12 to
  // 15 GB cards that's Underdog Saluki 27B, while Get Bob ready still offers the 16 GB set.
  const platform = classOf(cls)?.os === 'mac' ? 'darwin' : classOf(cls)?.os === 'win' ? 'win32' : 'linux';
  const bestPick = hw.arm ? null : pickFor('bob', catalog.models || [], { vramGB: hw.integrated ? 0 : hw.vramGB, ramGB, unified: hw.unified, platform });
  const best = bestPick ? byId[bestPick.id] : null;
  if (best && !ids.includes(best.id)) {
    const place = ramGB ? placeFor(best, hw) : null;
    const licence = best.commercial === false ? ` Not for commercial use (${best.license}).` : '';
    models.unshift({ name: best.name, jobs: 'Brain (Bob\'s pick on the Brains page)', size: gb(best.sizeGB), where: place ? (hw.integrated ? 'Shared memory' : place.word) : '', why: plain(`Bob recommends it for this size; it isn't in the starter set, so get it from the Brains page.${licence}`), ticked: false, pick: true, codes: (best.jobs || []).includes('tinker') });
  }
  const warn = [];
  const main = models.find((m) => /Brain/.test(m.jobs.split(', ')[0] || ''));
  if (main?.rent) warn.push(`${main.name} is too big for ${ramGB} GB of memory with this card. Pick a smaller brain on the Brains page.`);
  if (!ramGB) warn.push('Memory not given: where each brain lives is worked out once Bob sees your computer.');
  return { pack: { id: pack.id, label: pack.label, blurb: plain(pack.blurb || ''), times: plain(pack.times || '') }, models, warn };
}

// ---- The size tiers page (docs/install/sizes.md) ----
const TIERS = [
  { label: 'No graphics card', cls: 'windows', gpu: 'none', vramGB: 0, ramGB: 16 },
  { label: '4 GB card', cls: 'windows', gpu: 'nvidia', vramGB: 4, ramGB: 16 },
  { label: '6 GB card', cls: 'windows', gpu: 'nvidia', vramGB: 6, ramGB: 32 },
  { label: '8 GB card', cls: 'windows', gpu: 'nvidia', vramGB: 8, ramGB: 32 },
  { label: '10 GB card', cls: 'windows', gpu: 'nvidia', vramGB: 10, ramGB: 32 },
  { label: '12 GB card', cls: 'windows', gpu: 'nvidia', vramGB: 12, ramGB: 32 },
  { label: '16 GB card', cls: 'windows', gpu: 'nvidia', vramGB: 16, ramGB: 32 },
  { label: '24 GB card or more', cls: 'windows', gpu: 'nvidia', vramGB: 24, ramGB: 64 },
  { label: 'Built-in graphics, 16 GB memory', cls: 'handheld', gpu: 'builtin', vramGB: 0, ramGB: 16 },
  { label: 'Built-in graphics, 32 GB memory', cls: 'handheld', gpu: 'builtin', vramGB: 0, ramGB: 32 },
  { label: 'Mac, 8 GB', cls: 'mac', gpu: 'apple', ramGB: 8 },
  { label: 'Mac, 16 GB', cls: 'mac', gpu: 'apple', ramGB: 16 },
  { label: 'Mac, 24 GB', cls: 'mac', gpu: 'apple', ramGB: 24 },
  { label: 'Mac, 32 GB or more', cls: 'mac', gpu: 'apple', ramGB: 32 },
  { label: 'Raspberry Pi, 4 GB', cls: 'pi', gpu: 'none', ramGB: 4 },
  { label: 'Raspberry Pi, 8 GB or more', cls: 'pi', gpu: 'none', ramGB: 8 },
  { label: 'Android, 6 GB', cls: 'android', gpu: 'none', ramGB: 6 },
  { label: 'Android, 8 GB or more', cls: 'android', gpu: 'none', ramGB: 8 }
];
export const tierRows = (catalog, phone) => TIERS.map((t) => {
  const a = adviceFor(t, catalog, phone);
  const pick = (job) => a.models.find((m) => m.jobs.split(', ').includes(job));
  const brain = a.models.find((m) => m.pick) || pick('Brain') || a.models[0];
  const coder = pick('Coding');
  const painter = pick('Painter');
  return { ...t, set: a.pack.label, brain: brain ? `${brain.name} (${brain.size}${brain.where ? `, ${brain.where.toLowerCase()}` : ''}${brain.pick ? ', from the Brains page' : ''})` : '', coder: brain?.codes ? 'same brain' : coder && coder.name !== brain?.name ? coder.name : coder ? 'same brain' : '', painter: painter ? painter.name : 'none' };
});

export function sizesMd(catalog, phone) {
  const rows = tierRows(catalog, phone);
  const cell = (s) => String(s || '').replace(/\|/g, '\\|');
  const lines = [
    '# Which brain for which size',
    '',
    '<!-- Made by installer/install-guides.js from catalog.json and android/phone-models.json. Don\'t edit by hand: change the catalog, then run node installer/install-guides.js. -->',
    '',
    'Bob picks a starter set from the graphics memory (or, without a card, the memory) he finds. This table is the same pick, worked out ahead of time. Nothing downloads until you press **Get Bob ready**, and every pick can be changed on the Brains page.',
    '',
    'Graphics memory is what the card has (Task Manager, Performance, GPU, "Dedicated GPU memory" on Windows). A Mac counts about two thirds of its memory as graphics memory, three quarters from 36 GB up.',
    '',
    '| Your device | Starter set | Main brain (where it lives) | Coding | Pictures |',
    '|---|---|---|---|---|',
    ...rows.map((r) => `| ${cell(r.label)} | ${cell(r.set)} | ${cell(r.brain)} | ${cell(r.coder || '-')} | ${cell(r.painter)} |`),
    '',
    'Rows assume 32 GB of memory with a card of 6 to 16 GB, 16 GB with a smaller card or none, and 64 GB with 24 GB or more. A 12 GB card gets the 16 GB set, and Bob\'s pick on the Brains page is Underdog Saluki 27B (7.9 GB, all on the card, not for commercial use), which leaves Qwen3.6 35B-A3B unticked. Cards of 24 GB and more get the 16 GB set too; bigger brains are on the Brains page.',
    '',
    'Only the 16 GB card, the 6 GB laptop card, the 16 GB handheld and the 8 GB Android phone have run in our lab. Every other row is ' + UNPROVEN + '.',
    '',
    'Pick your own device in the [setup picker](picker.html) for the full list, the engines and the steps. The guide for each kind of device is in [the install guides](README.md).',
    ''
  ];
  return lines.join('\n');
}

// ---- The setup picker (docs/install/picker.html) ----
// Every answer is worked out here and written into the page, so the page needs no code of Bob's and never disagrees
// with the catalog: one entry per kind of device, graphics and memory tier.
export const VRAM_STEPS = [0, 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 48];
export const RAM_STEPS = [4, 6, 8, 12, 16, 24, 32, 48, 64, 128];
export function pickerData(catalog, phone, devices) {
  const answers = {};
  for (const c of CLASSES) {
    for (const gpu of c.gpus) {
      const cards = ['nvidia', 'amd', 'intel'].includes(gpu) ? VRAM_STEPS.filter((v) => v >= 2) : [0];
      for (const v of cards) for (const r of RAM_STEPS) {
        const a = adviceFor({ cls: c.id, gpu, vramGB: v, ramGB: r }, catalog, phone);
        answers[`${c.id}|${gpu}|${v}|${r}`] = a;
      }
      for (const v of cards) for (const r of [0]) answers[`${c.id}|${gpu}|${v}|${r}`] = adviceFor({ cls: c.id, gpu, vramGB: v, ramGB: r }, catalog, phone);
    }
  }
  // Share identical answers so the page stays small.
  const seen = new Map(); const list = []; const keys = {};
  for (const [k, a] of Object.entries(answers)) { const j = JSON.stringify(a); if (!seen.has(j)) { seen.set(j, list.length); list.push(a); } keys[k] = seen.get(j); }
  const classes = CLASSES.map((c) => ({ ...c, lab: Object.fromEntries(c.gpus.map((g) => [g, labNote(c.id, g)])), engines: Object.fromEntries(c.gpus.map((g) => [g, enginesFor(c.id, g)])) }));
  return { classes, gpuNames: GPU_NAMES, vram: VRAM_STEPS, ram: RAM_STEPS, devices: devices.devices, answers: list, keys, version: readJson('package.json').version };
}

export function pickerHtml(data) {
  const tpl = read('installer/install-picker.html');
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return tpl.replace('/*PICKER_DATA*/null', json);
}

export function build() {
  const catalog = readJson('catalog.json');
  const phone = readJson('android/phone-models.json');
  const devices = readJson('docs/install/devices.json');
  return { 'docs/install/sizes.md': sizesMd(catalog, phone), 'docs/install/picker.html': pickerHtml(pickerData(catalog, phone, devices)) };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const out = build();
  const check = process.argv.includes('--check');
  let stale = 0;
  for (const [f, text] of Object.entries(out)) {
    const p = path.join(root, f);
    const now = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').replace(/\r\n/g, '\n') : '';
    if (now === text) continue;
    if (check) { console.log(`${f} is out of date: run node installer/install-guides.js`); stale++; } else { fs.writeFileSync(p, text); console.log(`wrote ${f}`); }
  }
  if (stale) process.exit(1);
}
