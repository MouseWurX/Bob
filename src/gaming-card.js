// 1.5.32: how the Gaming session uses the graphics card. A three-position switch (Settings > Speed & memory):
//   auto   (the starting position) — decide each time the Gaming brain loads, and again every minute while Bob is quiet;
//   never  — processor only: the card isn't touched at all (first replies after a load are much slower);
//   always — as in 1.5.23 to 1.5.31: the brain sits on the processor and borrows about 0.6 GB of the card to read prompts.
// Automatic, from the user's rule: use the card when it has room and won't cause stutter, lean on it harder when the
// processor is at full load (measured: 2507 on a maxed processor took 56 s for "hi" against 2.8 s idle), and stay off it
// when the game is using it.
import os from 'node:os';
import { execFile } from 'node:child_process';

export const GAMING_CARD = ['auto', 'never', 'always'];
export const gamingCard = (cfg) => (GAMING_CARD.includes(cfg?.gamingCard) ? cfg.gamingCard : 'auto');

// The card counts as busy at or above this, or with less than this much memory free.
export const CARD_BUSY_PCT = 80;
export const CARD_MIN_FREE_MB = 1536;
// The processor counts as at full load at or above this.
export const CPU_FULL_PCT = 90;

// { util, freeMB } from nvidia-smi (ships with the NVIDIA driver), or null when it can't be read.
export function readCard() {
  return new Promise((resolve) => {
    try {
      execFile('nvidia-smi', ['--query-gpu=utilization.gpu,memory.free', '--format=csv,noheader,nounits'], { timeout: 3000, windowsHide: true }, (err, out) => {
        if (err) return resolve(null);
        const [util, freeMB] = String(out).split(/\r?\n/)[0].split(',').map((x) => Number(x.trim()));
        resolve(Number.isFinite(util) && Number.isFinite(freeMB) ? { util, freeMB } : null);
      });
    } catch { resolve(null); }
  });
}

// How busy the processor is right now, 0 to 100, from two readings half a second apart.
export async function readCpu(ms = 500) {
  const snap = () => os.cpus().reduce((a, c) => { const t = Object.values(c.times).reduce((x, y) => x + y, 0); return { idle: a.idle + c.times.idle, total: a.total + t }; }, { idle: 0, total: 0 });
  const a = snap();
  await new Promise((r) => setTimeout(r, ms));
  const b = snap();
  const total = b.total - a.total;
  return total > 0 ? Math.round(100 * (1 - (b.idle - a.idle) / total)) : 0;
}

// Pure rule, so it can be tested: 'none' (processor only), 'borrow' (about 0.6 GB for prompt reading) or 'whole' (the
// whole small brain on the card). card is null when unknown (no NVIDIA card or no nvidia-smi): then as before, 'borrow'.
export function cardPlan(mode, { card, cpuPct = 0, brainMB = 0 } = {}) {
  if (mode === 'never') return 'none';
  if (mode === 'always' || !card) return 'borrow';
  if (card.util >= CARD_BUSY_PCT || card.freeMB < CARD_MIN_FREE_MB) return 'none';
  if (cpuPct >= CPU_FULL_PCT && brainMB > 0 && card.freeMB >= brainMB + 2048) return 'whole';
  return 'borrow';
}

// What the Gaming brain should do right now. read lets tests pass fake readings.
export async function decideCard(cfg, { brainMB = 0, read = { card: readCard, cpu: readCpu } } = {}) {
  const mode = gamingCard(cfg);
  if (mode !== 'auto') return cardPlan(mode);
  const [card, cpuPct] = await Promise.all([read.card(), read.cpu()]);
  return cardPlan(mode, { card, cpuPct, brainMB });
}

// Wording shown in Settings, Help and Now running.
export const CARD_PLAN_TEXT = {
  none: 'processor only (the graphics card is untouched)',
  borrow: 'processor, borrowing about 0.6 GB of the graphics card',
  whole: 'graphics card (the processor was at full load)'
};
