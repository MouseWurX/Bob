// "Launch Bob on start-up": off unless the user turns it on. Bob.exe uses Windows' own login items
// (the same list as Task Manager > Startup apps), so it needs no admin rights and no scripts.
import fs from 'node:fs';
import path from 'node:path';
import { saveSettings } from './config.js';

// The shortcut older builds (before Bob.exe) put in the Startup folder. Only ever removed, never made.
export function startupShortcut() {
  const appData = process.env.APPDATA;
  return appData ? path.join(appData, 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Startup', 'Bob.lnk') : null;
}

export function autostartOn() {
  if (globalThis.bobLoginItem) return Boolean(globalThis.bobLoginItem.get());
  const lnk = startupShortcut();
  return Boolean(lnk && fs.existsSync(lnk));
}

export async function setAutostart(cfg, on) {
  const lnk = startupShortcut();
  if (lnk) fs.rmSync(lnk, { force: true }); // tidy up the old way either way
  if (!globalThis.bobLoginItem) {
    if (on) throw new Error('Launch on start-up works when Bob runs as Bob.exe.');
  } else {
    globalThis.bobLoginItem.set(on);
  }
  saveSettings(cfg, { autostart: on });
  return autostartOn();
}
