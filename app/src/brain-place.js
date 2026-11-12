// 1.5.205 "Where a brain sits", set by hand for one brain (the Brains page, Set up). Auto is the default and changes
// nothing: the engine fits the brain to the card itself (--fit). By hand, for a brain made of experts, the owner says
// how many layers' experts wait in memory instead of on the card (llama.cpp's --n-cpu-moe). Nothing else is touched,
// so a brain without experts, or one run by another engine, can't be set by hand at all.
// Saved as settings.brainPlace = { "<model>": { mode: 'auto' | 'hand', cpuMoe: 0..MAX_LAYERS } }.
export const MAX_LAYERS = 200;

export function cleanBrainPlace(v) {
  const out = {};
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out;
  for (const [k, p] of Object.entries(v).slice(0, 64)) {
    if (typeof k !== 'string' || !k || k.length > 200 || /[\u0000-\u001f]/.test(k)) continue;
    if (!p || typeof p !== 'object' || Array.isArray(p)) continue;
    const row = { mode: p.mode === 'hand' ? 'hand' : 'auto' };
    // The number is kept in Auto too, so it can be set before By hand is switched on.
    if (Number.isInteger(p.cpuMoe) && p.cpuMoe >= 0 && p.cpuMoe <= MAX_LAYERS) row.cpuMoe = p.cpuMoe;
    out[k] = row;
  }
  return out;
}

// The start arguments a by-hand placement adds for this brain ([] in Auto, on the processor, or with nothing set).
// layers: how many the file has, when known; a number past it is brought down to it.
export function placeArgs(cfg, model, { cpu = false, layers = 0 } = {}) {
  const p = cfg?.brainPlace?.[model];
  if (cpu || !p || p.mode !== 'hand' || !Number.isInteger(p.cpuMoe)) return [];
  return ['--n-cpu-moe', String(layers > 0 ? Math.min(p.cpuMoe, layers) : p.cpuMoe)];
}
