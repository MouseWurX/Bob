// 🔐 Locked secrets: what Bob does at start, and Settings, This replicant matrix, Locked secrets (src/secret-box.js
// has the box itself). On by default (the owner's pick, Nov 11 2026). Only the Settings page on this replicant
// matrix reaches the route; no key is ever sent back, only names.
import fs from 'node:fs';
import path from 'node:path';
import { theBox, useBox, openBox, lockOn, lockPlainKeys, lockKeysFile, keyNames, saveKey, KEY_NAME, boxView, memoryKeeper, IN_TEST, writeSecretJson, useKeysFile, openCopy } from './secret-box.js';
import { readConfigFile, writeConfigFile, saveSettings } from './config.js';
import { loadServers, saveServers, lockServerKeys } from './mcp.js';

// At start, once: the notes from opening the box, then any plain keys from an older Bob locked away.
export function lockAtStart(cfg, log = () => {}, opts = {}) {
  for (const n of cfg.boxNotes || []) log('settings', n);
  if (!lockOn(cfg) || !theBox().ready) return { keys: [], apps: 0 };
  let keys = [], apps = 0;
  let inFile = [];
  try { inFile = lockKeysFile(cfg); } catch {}
  try { keys = lockPlainKeys(cfg, opts); } catch {}
  try { apps = lockServerKeys(cfg); } catch {}
  if (inFile.length) log('settings', `locked secrets: locked ${inFile.join(', ')} that sat plain in keys.json`);
  if (keys.length) log('settings', `locked secrets: moved ${keys.join(', ')} into the locked store`);
  if (apps) log('settings', `locked secrets: locked ${apps} key${apps === 1 ? '' : 's'} in Apps Bob can use`);
  return { keys, apps, inFile };
}

// Writes every file that holds secrets again, so they follow the switch (locked when on, plain when off).
export function rewriteAll(cfg) {
  writeConfigFile(cfg, readConfigFile(cfg));
  const kf = path.join(cfg.dataDir, 'keys.json');
  if (fs.existsSync(kf)) {
    let raw = {};
    try { raw = JSON.parse(fs.readFileSync(kf, 'utf8')); } catch {}
    const opened = openCopy(raw, theBox(), { all: true });
    for (const k of Object.keys(opened)) if (!opened[k]) delete opened[k]; // a key the box can't open any more is gone
    writeSecretJson(cfg, kf, opened, 1, { all: true });
    useKeysFile(kf);
  }
  const apps = loadServers(cfg);
  if (apps.length) saveServers(cfg, apps);
}

export function secretsView(cfg) {
  return boxView(cfg, { platform: process.platform });
}

// POST { on } | { addKey: { name, value } } | { removeKey: name } | { freshBox: true }
export function secretsPatch(cfg, b = {}, { log = () => {} } = {}) {
  if ('on' in b) {
    const on = b.on === true;
    if (!theBox().ready && !on) return { error: 'The locked box isn\'t open, so Bob can\'t unlock what\'s in it. Nothing changed.' };
    if (on && !theBox().ready) return { error: 'The locked box isn\'t open, so nothing can be locked yet. Start a new locked box first.' };
    saveSettings(cfg, { lockSecrets: on });
    cfg.lockSecrets = on;
    rewriteAll(cfg);
    if (on) lockAtStart({ ...cfg, boxNotes: [] }, log);
    log('settings', `locked secrets: ${on ? 'on' : 'OFF (passcodes and keys are now kept plain)'}`);
  }
  if (b.addKey) {
    const name = String(b.addKey.name || '').trim().toUpperCase(), value = String(b.addKey.value || '').trim();
    if (!KEY_NAME.test(name)) return { error: 'A key name is capital letters, digits and _, like HF_TOKEN or OPENROUTER_API_KEY.' };
    if (!value || value.length > 4000) return { error: 'Paste the key itself.' };
    saveKey(cfg, name, value);
    log('settings', `locked secrets: saved the key ${name}`);
  }
  if (b.removeKey) {
    const name = String(b.removeKey).trim();
    if (keyNames().includes(name)) { saveKey(cfg, name, ''); log('settings', `locked secrets: removed the key ${name}`); }
  }
  if (b.freshBox === true) {
    if (theBox().ready) return { error: 'The locked box is open and working; there\'s no need for a new one.' };
    useBox(openBox({ dataDir: cfg.dataDir, fresh: true, keepers: IN_TEST || process.env.BOB_TEST === '1' ? [memoryKeeper('test')] : undefined, log: (m) => log('settings', m) }));
    if (!theBox().ready) return { error: `Your computer's key keeper didn't answer (${theBox().label}). Bob can't start a new box yet.` };
    log('settings', `locked secrets: started a new locked box with ${theBox().label}; passcodes and keys that were in the old one need typing again`);
    // What the old box held can't be read: clear those so they're asked for again, and lock the rest.
    rewriteAll(cfg);
  }
  return { ok: true };
}
