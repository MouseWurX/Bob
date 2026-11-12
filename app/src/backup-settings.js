// The automatic backup's settings (Settings, This replicant matrix, Back up and move). Off unless the owner turns it on.
// Kept apart from backup.js so config.js can clean them without loading the zip code.
import path from 'node:path';

export const BACKUP_DEFAULTS = { auto: false, every: 'week', folder: '', keep: 5 };

export function cleanBackup(b = {}) {
  const v = b && typeof b === 'object' ? b : {};
  const folder = String(v.folder || '').replace(/[\u0000-\u001f]/g, '').trim().slice(0, 500);
  const keep = Number(v.keep);
  return {
    auto: v.auto === true,
    every: v.every === 'day' ? 'day' : 'week',
    folder: folder && (path.isAbsolute(folder) || /^[a-zA-Z]:[\\/]/.test(folder)) ? folder : '',
    keep: Number.isInteger(keep) && keep >= 1 && keep <= 30 ? keep : 5
  };
}
export const backupOf = (cfg) => cleanBackup(cfg?.backup);
