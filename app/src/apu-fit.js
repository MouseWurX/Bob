// Brains on built-in graphics, sized honestly (Nov 12, Legion Go on UMA Auto, Vulkan "uma: 1"). Always on: a fix.
//
// What happened: Bob 1.5.210 put Qwen3 4B wholly on the Go's graphics at a 32K chat memory. The room check counted the
// file and a rough chat memory against free RAM and passed, but on built-in graphics everything on the "card" is
// ordinary RAM the driver holds on to: the weights, the chat memory, llama.cpp's working buffers and the driver's own.
// Free RAM fell to 0.5 GB and every reply died with "vk::Device::allocateMemory: ErrorOutOfDeviceMemory". On 1.5.208
// the same brain ran on the processor, where the file is read from the drive as needed and Windows can let go of it.
//
// So, on built-in graphics only:
//   - a brain's need counts the file, the chat memory at the size picked, the working buffers and the driver;
//   - it goes wholly on the graphics only when all of that fits with room to spare; else as many layers as fit go on
//     the graphics and the rest stay on the processor; when only a few would fit, it runs on the processor alone;
//   - a load or a reply that still runs out of memory steps down (half the graphics share, then the processor alone,
//     then half the chat memory), and that is remembered for the brain and said in the logbook;
//   - a lent graphics card says how much it really has, so the asking Bob doesn't fill it.
// Nothing here adds words to what the brain reads.
const GB = 1024 ** 3, MB = 1024 ** 2;

// "Memory kept for Windows" (Settings, Brains, 0 to 8 GB). 2 GB to start with since this fix (4 before, when the need
// was guessed low and the extra had to cover it); at least 1 GB is always left free whatever the setting.
export const APU_HOLDBACK_DEFAULT_GB = 2;
export const APU_KEEP_MIN_GB = 1;
export const apuHoldbackGB = (cfg) => { const v = Number(cfg?.apuHoldbackGB); return Number.isFinite(v) && v >= 0 && v <= 8 ? v : APU_HOLDBACK_DEFAULT_GB; };
export const apuKeepBytes = (cfg) => Math.max(apuHoldbackGB(cfg), APU_KEEP_MIN_GB) * GB;
// The graphics driver's own share on built-in graphics (Vulkan's pools and staging buffers).
export const APU_DRIVER_BYTES = 0.75 * GB;
// On the processor the brain file is memory-mapped: Windows keeps the busy parts in RAM and can let go of the rest.
export const APU_MMAP_SHARE = 0.5;
// Fewer than this share of the layers on the graphics isn't worth the copy: the processor alone is as quick.
export const APU_MIN_LAYER_SHARE = 0.25;
// The share of the graphics room a brain may use after running out of memory: all, half, then none.
export const APU_SHARES = [1, 0.5, 0];

// llama.cpp's working buffers for one step (the step size, -ub, 512 by default). About 0.5 GB covers 4B to 35B brains
// at 512 (the Go refused 387 MiB for Riker at 2048, on top of everything else).
export function computeBytes(ubatch = 512) {
  const u = Math.max(64, Number(ubatch) || 512);
  return Math.round(0.5 * GB * Math.max(1, u / 512));
}

// What a brain needs: { card } wholly on the graphics, { cpu } on the processor alone (file mapped).
export function apuNeed({ fileBytes = 0, kvBytes = 0, ubatch = 512 } = {}) {
  if (!(fileBytes > 0)) return null;
  const work = computeBytes(ubatch);
  return { file: fileBytes, kv: kvBytes, work, card: fileBytes + kvBytes + work + APU_DRIVER_BYTES, cpu: Math.round(fileBytes * APU_MMAP_SHARE) + kvBytes + work };
}

// Where the brain goes. freeBytes: free RAM now (after the last brain was let go). carveBytes: the set-aside for the
// graphics that Windows never counts as free. budgetBytes: the most the graphics may hold (Bob's graphics memory).
// Gives { place: 'card' | 'split' | 'cpu', layers (on the graphics; 0 for cpu, -1 for all), cardRoom, need }.
export function apuPlace({ need, layers = 0, freeBytes = 0, keepBytes = APU_KEEP_MIN_GB * GB, carveBytes = 0, budgetBytes = 0, share = 1 } = {}) {
  if (!need) return null;
  const room = Math.max(0, freeBytes - keepBytes);
  const budget = budgetBytes > 0 ? budgetBytes : carveBytes + room;
  const cardRoom = Math.max(0, Math.min(budget, carveBytes + room) * Math.max(0, Math.min(1, share)));
  if (share > 0 && need.card <= cardRoom) return { place: 'card', layers: -1, cardRoom, need };
  const usable = cardRoom - need.work - APU_DRIVER_BYTES;
  if (share > 0 && layers > 0 && usable > 0) {
    const per = (need.file + need.kv) / layers;
    const n = Math.min(layers - 1, Math.floor(usable / per));
    if (n >= Math.max(1, Math.ceil(layers * APU_MIN_LAYER_SHARE))) return { place: 'split', layers: n, cardRoom, need };
  }
  return { place: 'cpu', layers: 0, cardRoom, need };
}

// The next step down after running out of memory: { share } with a smaller graphics share, or { ctx } with half the
// chat memory once the brain is already on the processor alone. null: nothing smaller to try.
export function nextStep({ share = 1, ctx = 0, cpu = false, minCtx = 8192 } = {}) {
  if (!cpu) { const i = APU_SHARES.indexOf(share); const next = APU_SHARES[(i < 0 ? 0 : i) + 1]; if (next !== undefined) return { share: next }; }
  const c = Number(ctx) || 0;
  if (c > minCtx) return { ctx: Math.max(minCtx, Math.floor(c / 2 / 1024) * 1024) };
  return null;
}
export const stepWords = (s) => (s?.share === 0 ? 'on the processor alone' : s?.share ? `with ${Math.round(s.share * 100)}% of the graphics room` : s?.ctx ? `with a ${Math.round(s.ctx / 1024)}K chat memory` : '');

// Lending this machine's graphics (share-card.js): on built-in graphics, how much it can really hold right now and how
// much the asking Bob's engine should leave free on it (--fit-target, MiB), since the graphics report the whole budget
// as free even when the RAM behind it is short. null on a real graphics card (it reports its own memory truly).
export const LEND_MIN_MB = 1536;
export function lendRoom(cfg, { freeBytes = 0 } = {}) {
  if (cfg?.sharedGraphics !== true) return null;
  const carve = Math.max(0, (Number(cfg.reservedGraphicsGB) || 0) * GB - 0.5 * GB);
  const budget = (Number(cfg.gpuVramGB) || Number(cfg.cardGB) || 0) * GB;
  const room = Math.max(0, carve + freeBytes - apuKeepBytes(cfg) - APU_DRIVER_BYTES);
  const roomMB = Math.floor(Math.min(budget > 0 ? budget : room, room) / MB);
  const marginMB = budget > 0 ? Math.max(0, Math.ceil(budget / MB) - roomMB) : 0;
  return { roomMB, marginMB };
}
