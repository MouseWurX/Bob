// System memory (RAM) in use, for the Now running panel (1.5.3). On Windows "free" is what's available to programs.
import os from 'node:os';
import { freeMemNow } from './platform.js';

// One unit for every memory reading Bob shows (1.5.26): GB as Windows Task Manager and nvidia-smi count them
// (1024 MB each). Before this the brain label counted 1000 MB to the GB and the graphics card meter 1024, so the
// same brain looked about 7% bigger at the top of the chat than in Now running.
export const memGB = (bytes) => Math.round(((bytes || 0) / 1024 ** 3) * 10) / 10;

export function ramNow(total = os.totalmem(), free = freeMemNow()) {
  return { usedGB: memGB(total - free), totalGB: memGB(total) };
}
