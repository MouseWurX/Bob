// Back up Bob and move him to another computer (Settings, This replicant matrix: "Back up and move").
//
// One zip holds what makes this Bob yours: chats, settings, memory, notes, the tools he made and the list of things he
// made (the list, not the pictures themselves). Brains, engines and programs are never in it: they download again.
//   - Nothing happens by itself. "Save a backup" and "Restore from a backup" are buttons; the automatic backup to a
//     folder is a switch that's off unless the owner turns it on (backup-settings.js).
//   - Keys and passcodes (API keys, bot tokens, the phone passcode) are only in a backup when the owner ticks them in,
//     and then only locked with a passcode they type (AES-256-GCM, key from scrypt). An automatic backup never has them.
//   - A restore never overwrites in place while Bob runs: the files wait in inn\restore-waiting and go in at the next
//     start (backup-apply.js), and whatever they replace is kept in inn\archive\before restore <date>.
//   - Anything that opens a door, costs money or lets Bob act on his own comes back switched off: phone access, Discord,
//     Telegram, rented brains, Hands, repositories and scheduled jobs. Tools Bob made wait for a new OK.
// The zip is a plain zip (zip.js): any zip program opens it. Its own list is bob-backup.json at the top.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';
import { collect, writeZip, readZipEntry, readZipList, unzip } from './zip.js';
import { writeJsonAtomic } from './util.js';
import { cleanBackup, backupOf } from './backup-settings.js';
// 🔐 Locked secrets (secret-box.js, on by default since 1.5.205): config.json's secrets, inn\bob\keys.json and the env
// values in mcp-servers.json are locked with a key only THIS computer and account can open. A backup opens them first
// and, only when "Keys and passcodes" is ticked, locks them again with the passcode typed for the backup. A restore
// saves them through the same savers, so they are locked with the NEW computer's box.
import { keyNames as savedKeyNames, savedKey, saveKey, ensureBox, sealCopy, openCopy, lockOn, SECRET_FIELDS } from './secret-box.js';
import { readConfigFile, writeConfigFile } from './config.js';

export const FORMAT = 1;
export const MANIFEST = 'bob-backup.json';
export const SECRETS = 'keys.locked';
export const DOORS = 'doors.json';
export const MIN_PASSCODE = 8;

// What a backup can hold, in the order Settings lists it. Paths are inside the inn folder ('/' at the end = a folder).
export const PARTS = [
  { id: 'chats', label: 'Chats', what: 'Every chat, its summary and which ones are pinned.', paths: ['bob/sessions/', 'bob/sessions-cleared.json', 'bob/chat-summaries.json', 'bob/topics.json', 'bob/housekeeping.json', 'bob/my-tests.jsonl'] },
  { id: 'settings', label: 'Settings', what: 'Everything set in Settings, check-ins, reminders, scheduled jobs, apps you connected, his voice sample and what he calls you.', paths: ['bob/settings.json', 'saved-prompts.json', 'bob/chat-presets.json', 'bob/chat-start/', 'bob/schedules.json', 'bob/page-watches.json', 'bob/reminders.json', 'bob/checkins.json', 'bob/mcp-servers.json', 'bob/hands-recipes.json', 'bob/clan.json', 'bob/about-me.md', 'bob/backstory.md', 'bob/equip-plan.json', 'voices/'] },
  { id: 'memory', label: 'Memory', what: 'What Bob remembers about you, his how-tos, the notice board and his logbook.', paths: ['bob-memory.md', 'memory-changes.jsonl', 'bob/memory-vectors.json', 'bob/howtos.json', 'notice-board.md', 'logbook.md', 'archive/'] },
  { id: 'notes', label: 'Notes and records', what: 'Quick notes, Sunday digests and the records (ledgers) he keeps for you.', paths: ['quick-notes.md', 'digests/', 'ledger/'] },
  { id: 'tools', label: 'Tools Bob made', what: 'The little tools he wrote himself. They come back switched off until you OK them again.', paths: ['tools/'] },
  { id: 'made', label: 'List of things Bob made', what: 'The Made by Bob list (names, dates, song words). The pictures, clips and songs themselves stay where they are: copy that folder yourself.', paths: ['bob/made.json'] }
];
export const PART_IDS = PARTS.map((p) => p.id);

// Bob's files that are deliberately never in a backup: caches, logs of runs, things this computer works out again,
// copies kept for undo, and the approvals of tools (asked again on the new computer). A test checks that every file
// Bob's code names in inn\bob or inn is either in a part above or here, so nothing new is forgotten.
export const NOT_BACKED_UP = [
  'bob/update-status.json', 'bob/update-launch-log.txt', 'bob/github-update/', 'bob/catalog-latest.json', 'bob/model-scan.json',
  'bob/tidy-backups/', 'bob/tool-results/', 'bob/backups/', 'bob/trash/', 'bob/thumbs/', 'bob/voice-samples/', 'bob/speed-tests.json', 'bob/speed-log.json', 'bob/card-seen.json', 'bob/load-times.json',
  'bob/selftools.json', 'bob/quarantine.json', 'bob/lab/', 'bob/hands-runs.json', 'bob/hands-journal.json', 'bob/downloads.json',
  'bob/queue.json', 'bob/electron/', 'bob/doc-index.json', 'bob/digest.json', 'bob/tool-group-vectors.json', 'bob/receipts/', 'bob/claude-door.json', 'bob/tool-packs.json', 'tool-packs/', 'bob/sd-server-args.txt', 'bob/backup-state.json', 'bob/restore-result.json',
  'bob/seeded-brains.json', 'bob/keys.json', 'bob/bob-net-link-keys.json', // brains seeded on a lent card (worked out again); locked secrets and Bob-Net link keys are locked to this computer (keys travel in the locked part; Bobs pair again)
  'bob/saved-formats.json', 'bob/turn-changes/', // items 232 and 238: worked out again; a turn's Undo is about this computer's files
  'bob/running.json', 'bob/crash-reports/', 'bob/before-safe-start.json', 'bob/settings-undo.json', 'bob/weekly.json', 'bob/chat-places/', 'bob/tool-errors.json', 'bob/amnesia/', // items 62 to 72 (and reliability item 206's error counts; Amnesia mode's copy from before it went on): worked out again on this computer, or about this computer only
  'bob/brain-files.json', 'bob/engine-care.json', 'bob/engine-care-beside.json', // reliability 218-228: about this computer's engine and files
  'bob/spare-keys.json', // 🔑 spare keys kept for your other Bobs: locked to this computer; pick them up again on a new one
  'bob/coding-agents.json', 'bob/agent-accounts/', 'bob/agent-tasks/', 'bob/agent-ask.mjs', // Nov 13 Coding agents: folders on this computer, other people's sign-ins (never copied), a task file while it runs, a helper made again
  'bob/honesty.json', // Nov 12, item 192: each brain's honesty score on this computer, counted again from new answers
  'bob/spending.json', 'profiles/', // 🧾 the spending sheet and 👥 profiles are locked with keys that belong to this computer (or a person's passcode kept in config.json): save the sheet as a CSV to move it
  'painter/', 'references/', 'workshop/', 'own-code/', 'documents/', 'tools/_scratch/', 'tools/_pyscratch/', 'restore-waiting/', 'restore-waiting.new/'
];

// The names of keys Bob reads from the computer's own variables (Windows: your user variables; Mac and Linux:
// ~/.config/bob/env). Only these, plus a typed-in "Another service" key name, ever go in the locked part.
export const KEY_NAMES = ['BOB_DISCORD_TOKEN', 'BOB_TELEGRAM_TOKEN', 'ANTHROPIC_API_KEY', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'OPENROUTER_API_KEY', 'TOGETHER_API_KEY', 'LAMBDA_API_KEY', 'RUNPOD_API_KEY', 'VAST_API_KEY', 'HF_TOKEN', 'BOB_EMAIL_PASSWORD'];
const KEY_NAME_RE = /^[A-Z][A-Z0-9_]{2,63}$/;

export function keyNames(cfg = {}) {
  const extra = [];
  for (const r of [].concat(cfg.rentals?.list || [])) if (KEY_NAME_RE.test(r?.keyEnv || '')) extra.push(r.keyEnv);
  for (const c of [].concat(cfg.cloud || [])) if (KEY_NAME_RE.test(c?.apiKeyEnv || '')) extra.push(c.apiKeyEnv);
  // 🧰 More tools: each calendar link and web-service key (more-tools.js names them).
  for (const c of [].concat(cfg.moreTools?.calendars || [])) if (/^[a-z0-9]{1,12}$/.test(c?.id || '')) extra.push(`BOB_CALENDAR_${c.id.toUpperCase()}`);
  for (const a of [].concat(cfg.moreTools?.apis || [])) if (/^[a-z0-9]{1,12}$/.test(a?.id || '')) extra.push(`BOB_API_${a.id.toUpperCase()}`);
  return [...new Set([...KEY_NAMES, ...extra])];
}

// ---------------------------------------------------------------- which files
const under = (rel, p) => (p.endsWith('/') ? rel.startsWith(p) : rel === p);
export const skipped = (rel) => rel.startsWith('bob/secret-box') || NOT_BACKED_UP.some((p) => under(rel, p)); // the box (and old boxes set aside) only opens on this computer
export function partOf(rel) {
  if (skipped(rel)) return '';
  for (const part of PARTS) if (part.paths.some((p) => under(rel, p))) return part.id;
  return '';
}
const toRel = (innDir, abs) => path.relative(innDir, abs).split(path.sep).join('/');

// The files for the parts asked for, as zip entries named inn/<path>.
export function backupFiles(cfg, parts = PART_IDS) {
  const want = new Set(parts.filter((p) => PART_IDS.includes(p)));
  const out = [];
  const counts = {};
  for (const part of PARTS) {
    if (!want.has(part.id)) continue;
    counts[part.id] = 0;
    for (const p of part.paths) {
      const abs = path.join(cfg.innDir, ...p.split('/').filter(Boolean));
      if (!fs.existsSync(abs)) continue;
      for (const e of collect([abs], cfg.innDir, { skip: (a) => skipped(toRel(cfg.innDir, a) + (isDir(a) ? '/' : '')) })) {
        if (e.dir) continue;
        out.push({ ...e, name: `inn/${e.name}` });
        counts[part.id]++;
      }
    }
  }
  return { entries: out, counts };
}
function isDir(p) { try { return fs.lstatSync(p).isDirectory(); } catch { return false; } }

// ---------------------------------------------------------------- doors (config.json) and keys
// The door settings that live in config.json: Discord and Telegram (who the owner is, which switches), with every
// switch that opens the door set off. Never the token; the phone passcode only goes in the locked part.
// Every passcode, token or key field taken out (they only travel in the locked part).
function withoutSecrets(v, depth = 0) {
  if (!v || typeof v !== 'object' || depth > 10) return v;
  if (Array.isArray(v)) return v.map((x) => withoutSecrets(x, depth + 1));
  const o = {};
  for (const [k, x] of Object.entries(v)) if (!SECRET_FIELDS.has(k)) o[k] = withoutSecrets(x, depth + 1);
  return o;
}
export function doorsOf(raw = {}) {
  const out = {};
  if (raw.discord && typeof raw.discord === 'object') out.discord = { ...withoutSecrets(raw.discord), enabled: false, dmEnabled: false };
  if (raw.telegram && typeof raw.telegram === 'object') out.telegram = { ...withoutSecrets(raw.telegram), enabled: false };
  return out;
}

// The keys this computer has, by name. env reads like process.env (rental.js rentKeyEnv() in the app).
// The apps in "Apps Bob can use" and their env values (often keys), opened: { id: { NAME: value } }.
export function mcpEnvOf(cfg) {
  let j = null;
  try { j = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'mcp-servers.json'), 'utf8').replace(/^\uFEFF/, '')); } catch { return {}; }
  const out = {};
  for (const sv of Array.isArray(j?.servers) ? j.servers : []) {
    if (!sv || typeof sv.id !== 'string' || !sv.env || typeof sv.env !== 'object') continue;
    const env = openCopy(sv.env, ensureBox(cfg), { all: true });
    const kept = Object.fromEntries(Object.entries(env).filter(([, v]) => typeof v === 'string' && v));
    if (Object.keys(kept).length) out[sv.id] = kept;
  }
  return out;
}
// The keys this computer has, by name: Bob's own list, any key saved in Settings (keys.json), and the env values of
// connected apps. env reads like process.env (rental.js rentKeyEnv() in the app, which also reads keys.json).
export function gatherKeys(cfg, env = {}) {
  const keys = {};
  let saved = [];
  try { if (cfg.dataDir) ensureBox(cfg); saved = savedKeyNames(); } catch {}
  for (const k of [...new Set([...keyNames(cfg), ...saved])]) {
    let v = String(env[k] || '').trim();
    if (!v) { try { v = String(savedKey(k) || '').trim(); } catch {} }
    if (v && v.length <= 4096 && !/[\r\n\0]/.test(v)) keys[k] = v;
  }
  const phone = String(cfg.remote?.passcode || '');
  const mcpEnv = cfg.dataDir ? mcpEnvOf(cfg) : {};
  return { keys, phonePasscode: phone.length >= 6 && !phone.startsWith('bobsecret1:') ? phone : '', mcpEnv };
}
export const keyCountOf = (g) => Object.keys(g.keys).length + (g.phonePasscode ? 1 : 0) + Object.values(g.mcpEnv || {}).reduce((n, e) => n + Object.keys(e).length, 0);

const SCRYPT = { N: 2 ** 15, r: 8, p: 1 };
export function lock(obj, passcode, { scrypt = SCRYPT } = {}) {
  const pass = String(passcode || '');
  if (pass.length < MIN_PASSCODE) throw new Error(`The passcode needs at least ${MIN_PASSCODE} characters.`);
  const salt = crypto.randomBytes(16), iv = crypto.randomBytes(12);
  const key = crypto.scryptSync(pass, salt, 32, { ...scrypt, maxmem: 128 * scrypt.N * scrypt.r * 2 });
  const c = crypto.createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([c.update(JSON.stringify(obj), 'utf8'), c.final()]);
  return Buffer.from(JSON.stringify({ kind: 'bob-locked-keys', v: 1, cipher: 'aes-256-gcm', kdf: { name: 'scrypt', ...scrypt, salt: salt.toString('base64') }, iv: iv.toString('base64'), tag: c.getAuthTag().toString('base64'), data: data.toString('base64') }));
}
export function unlock(buf, passcode) {
  let j;
  try { j = JSON.parse(Buffer.from(buf).toString('utf8')); } catch { throw new Error('The locked keys in that backup are damaged.'); }
  if (j?.kind !== 'bob-locked-keys' || j.cipher !== 'aes-256-gcm' || j.kdf?.name !== 'scrypt') throw new Error('The locked keys in that backup are in a format this Bob doesn\'t know.');
  const N = Number(j.kdf.N), r = Number(j.kdf.r), p = Number(j.kdf.p);
  if (![2 ** 10, 2 ** 12, 2 ** 14, 2 ** 15, 2 ** 16, 2 ** 17].includes(N) || r !== 8 || p < 1 || p > 4) throw new Error('The locked keys in that backup are in a format this Bob doesn\'t know.');
  try {
    const key = crypto.scryptSync(String(passcode || ''), Buffer.from(j.kdf.salt, 'base64'), 32, { N, r, p, maxmem: 128 * N * r * 2 });
    const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(j.iv, 'base64'));
    d.setAuthTag(Buffer.from(j.tag, 'base64'));
    return JSON.parse(Buffer.concat([d.update(Buffer.from(j.data, 'base64')), d.final()]).toString('utf8'));
  } catch { throw new Error('That passcode doesn\'t open the keys in this backup.'); }
}

// Saves one key where Bob reads keys from: Windows, your user variables (HKCU\Environment); Mac and Linux,
// ~/.config/bob/env (mode 600). The same places the Discord token is saved (discord.js storeToken).
export function storeKey(name, value, { platform = process.platform, home = os.homedir(), run = execFile } = {}) {
  return new Promise((resolve, reject) => {
    if (!KEY_NAME_RE.test(name) || !value || /[\r\n\0]/.test(value)) return reject(new Error(`${name} isn't a key Bob saves.`));
    if (platform === 'win32') return run('reg', ['add', 'HKCU\\Environment', '/v', name, '/t', 'REG_SZ', '/d', value, '/f'], { windowsHide: true, timeout: 5000 }, (e) => (e ? reject(new Error('Windows didn\'t save it.')) : resolve()));
    try {
      const dir = path.join(home, '.config', 'bob');
      fs.mkdirSync(dir, { recursive: true });
      const f = path.join(dir, 'env');
      let lines = [];
      try { lines = fs.readFileSync(f, 'utf8').split(/\r?\n/).filter((l) => l && !new RegExp(`^\\s*(export\\s+)?${name}\\s*=`).test(l)); } catch {}
      lines.push(`${name}=${value}`);
      fs.writeFileSync(f, lines.join('\n') + '\n', { mode: 0o600 });
      try { fs.chmodSync(f, 0o600); } catch {}
      resolve();
    } catch (e) { reject(new Error(`Couldn't save it: ${e.code || 'error'}`)); }
  });
}

// ---------------------------------------------------------------- making a backup
const pad = (n) => String(n).padStart(2, '0');
export function stamp(d = new Date()) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}${pad(d.getMinutes())}`; }
export const AUTO_RE = /^Bob backup \d{4}-\d{2}-\d{2} \d{4}( \d+)? \(automatic\)\.zip$/;
export function backupName(d = new Date(), { auto = false } = {}) { return `Bob backup ${stamp(d)}${auto ? ' (automatic)' : ''}.zip`; }

// The brains this Bob had in his slots, by file name, so the new computer can say which to download again.
export function brainNames(cfg = {}) {
  const names = new Set();
  for (const v of Object.values(cfg.models || {})) if (typeof v === 'string' && v.trim()) names.add(path.basename(v.trim()));
  return [...names].slice(0, 40);
}

// Writes the zip into `folder`. parts: ids from PARTS. keys: true + passcode puts the locked keys in.
// Returns { file, files, bytes, counts, keys }.
export function makeBackup(cfg, { folder, parts = PART_IDS, keys = false, passcode = '', env = {}, version = '', now = new Date(), auto = false } = {}) {
  if (!folder) throw new Error('Pick a folder for the backup.');
  const dir = path.resolve(folder);
  if (isInsideDir(cfg.innDir, dir)) throw new Error('Pick a folder outside Bob\'s inn folder, so a backup never ends up inside the next one.');
  if (!fs.existsSync(dir)) throw new Error(`Bob can't find ${dir}. Is the drive plugged in?`);
  if (keys && auto) throw new Error('An automatic backup never holds keys.');
  if (keys && String(passcode || '').length < MIN_PASSCODE) throw new Error(`Type a passcode of at least ${MIN_PASSCODE} characters to lock the keys.`);
  const chosen = PART_IDS.filter((p) => parts.includes(p));
  if (!chosen.length && !keys) throw new Error('Tick at least one thing to back up.');
  const { entries, counts } = backupFiles(cfg, chosen);
  // Connected apps: their env values are locked to this computer, so the list goes in with them blanked; the values
  // themselves only travel in the locked part.
  for (const e of entries) {
    if (e.name !== 'inn/bob/mcp-servers.json') continue;
    try {
      const j = JSON.parse(fs.readFileSync(e.abs, 'utf8').replace(/^\uFEFF/, ''));
      for (const sv of Array.isArray(j?.servers) ? j.servers : []) if (sv?.env && typeof sv.env === 'object') for (const k of Object.keys(sv.env)) sv.env[k] = '';
      e.data = Buffer.from(JSON.stringify(j, null, 1));
    } catch { e.data = Buffer.from('{"servers":[]}'); }
  }
  const extra = [];
  if (chosen.includes('settings')) {
    let raw = {};
    try { raw = cfg.configFile ? readConfigFile(cfg) : {}; } catch {}
    const doors = doorsOf(raw);
    if (Object.keys(doors).length) extra.push({ name: DOORS, data: Buffer.from(JSON.stringify(doors, null, 1)), size: 0, mtime: now });
  }
  let keyCount = 0;
  if (keys) {
    const g = gatherKeys(cfg, env);
    keyCount = keyCountOf(g);
    if (!keyCount) throw new Error('There are no keys or passcodes on this replicant matrix to back up. Untick "Keys and passcodes".');
    extra.push({ name: SECRETS, data: lock(g, passcode), size: 0, mtime: now });
  }
  const manifest = {
    kind: 'bob-backup', format: FORMAT, made: now.toISOString(), version, auto,
    platform: process.platform, from: { innDir: cfg.innDir, agentDir: cfg.agentDir },
    parts: chosen, counts, keys: keyCount > 0, keyCount, brains: brainNames(cfg)
  };
  const all = [{ name: MANIFEST, data: Buffer.from(JSON.stringify(manifest, null, 1)), size: 0, mtime: now }, ...extra, ...entries];
  let file = path.join(dir, backupName(now, { auto }));
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, backupName(now, { auto }).replace(/(\.zip| \(automatic\)\.zip)$/, ` ${i}$1`));
  const r = writeZip(file, all);
  return { file, files: entries.length, bytes: r.bytes, counts, keys: keyCount };
}

// The oldest automatic backups in `folder` beyond `keep` go (only files named like Bob's automatic ones).
export function pruneAuto(folder, keep = 5) {
  let names = [];
  try { names = fs.readdirSync(folder).filter((n) => AUTO_RE.test(n)).sort(); } catch { return []; }
  const gone = names.slice(0, Math.max(0, names.length - keep));
  for (const n of gone) { try { fs.rmSync(path.join(folder, n), { force: true }); } catch {} }
  return gone;
}

// ---------------------------------------------------------------- reading one
// What a backup holds, for the restore card. Throws for anything that isn't one of Bob's backups.
export function readBackup(file) {
  const f = path.resolve(String(file || ''));
  if (!fs.existsSync(f)) throw new Error('Bob can\'t find that file.');
  let buf;
  try { buf = readZipEntry(f, MANIFEST, { maxBytes: 1024 ** 2 }); } catch (e) { throw new Error(/zip/i.test(e.message) ? e.message : 'That isn\'t one of Bob\'s backups.'); }
  if (!buf) throw new Error('That zip isn\'t one of Bob\'s backups (it has no bob-backup.json).');
  let m;
  try { m = JSON.parse(buf.toString('utf8')); } catch { throw new Error('That backup\'s list is damaged.'); }
  if (m?.kind !== 'bob-backup') throw new Error('That zip isn\'t one of Bob\'s backups.');
  if (Number(m.format) > FORMAT) throw new Error('That backup was made by a newer Bob. Update this Bob first, then restore it.');
  const { entries } = readZipList(f);
  const counts = {};
  for (const e of entries) {
    if (e.dir || !e.name.startsWith('inn/')) continue;
    const part = partOf(e.name.slice(4));
    if (part) counts[part] = (counts[part] || 0) + 1;
  }
  const names = new Set(entries.map((e) => e.name));
  return {
    file: f, made: String(m.made || ''), version: String(m.version || ''), auto: m.auto === true, platform: String(m.platform || ''),
    parts: PART_IDS.filter((p) => counts[p]), counts, keys: names.has(SECRETS), doors: names.has(DOORS),
    brains: [].concat(m.brains || []).filter((b) => typeof b === 'string').slice(0, 40), from: m.from || {}
  };
}

// ---------------------------------------------------------------- restoring
// A path saved on the old computer, moved to the same place under the new one's folders. Other paths stay as they were.
export function rebase(value, pairs, { sep = path.sep } = {}) {
  if (typeof value !== 'string' || !value) return value;
  for (const [from, to] of pairs) {
    if (!from || !to) continue;
    const win = /^[a-zA-Z]:[\\/]|^\\\\/.test(from);
    const a = win ? value.toLowerCase().replace(/\//g, '\\') : value;
    const b = (win ? from.toLowerCase().replace(/\//g, '\\') : from).replace(/[\\/]+$/, '');
    const s = win ? '\\' : '/';
    if (a === b || a.startsWith(b + s)) {
      const rest = value.slice(b.length).split(/[\\/]+/).filter(Boolean);
      return rest.length ? [to.replace(/[\\/]+$/, ''), ...rest].join(sep) : to;
    }
  }
  return value;
}
export function rebaseJson(v, pairs, opts) {
  if (typeof v === 'string') return rebase(v, pairs, opts);
  if (Array.isArray(v)) return v.map((x) => rebaseJson(x, pairs, opts));
  if (v && typeof v === 'object') { const o = {}; for (const [k, x] of Object.entries(v)) o[k] = rebaseJson(x, pairs, opts); return o; }
  return v;
}

// Restored settings: everything that opens a door, costs money or lets Bob act on his own goes back to off.
export function safeSettings(s = {}) {
  const out = { ...s };
  delete out.hands; // What Bob may do: back to the defaults (asks first)
  delete out.selfWork; // Work on repositories: off, and the code copies aren't in a backup
  delete out.autostart; // Launch on start-up is set on each computer
  delete out.gpuVramGB; delete out.gamingCard; delete out.apuHoldbackGB; // this computer's own hardware
  if (out.rentals && typeof out.rentals === 'object') out.rentals = { ...out.rentals, enabled: {}, current: '' };
  if (out.cloudHelpers && typeof out.cloudHelpers === 'object') out.cloudHelpers = Object.fromEntries(Object.entries(out.cloudHelpers).map(([k, v]) => [k, { ...(v || {}), enabled: false }]));
  if (out.labForgeStart) out.labForgeStart = false;
  if (out.backup && typeof out.backup === 'object') out.backup = { ...out.backup, auto: false }; // the automatic backup: switched on again on this computer
  return out;
}
const safeSchedules = (list) => (Array.isArray(list) ? list.map((e) => ({ ...e, enabled: false })) : list);

// Unpacks the parts asked for into inn\restore-waiting (they go in at Bob's next start), puts keys back (when the
// passcode opens them) and the door settings in config.json, switched off. Returns what happened, for the card.
export async function stageRestore(cfg, file, { parts = PART_IDS, keys = false, passcode = '', store = (name, value) => saveKey(cfg, name, value), env = {}, now = new Date() } = {}) {
  const info = readBackup(file);
  const chosen = info.parts.filter((p) => parts.includes(p));
  let unlocked = null;
  if (keys && info.keys) unlocked = unlock(readZipEntry(info.file, SECRETS), passcode); // a wrong passcode stops everything here
  if (!chosen.length && !unlocked) throw new Error('Tick at least one thing to restore.');
  const waiting = path.join(cfg.innDir, 'restore-waiting');
  const tmp = waiting + '.new';
  fs.rmSync(tmp, { recursive: true, force: true });
  let files = 0;
  const appNotes = [];
  if (chosen.length) {
    unzip(info.file, tmp);
    const pairs = [[info.from.innDir, cfg.innDir], [info.from.agentDir, cfg.agentDir]].filter(([a, b]) => a && b && a !== b);
    const inn = path.join(tmp, 'inn');
    const walk = (dir) => { for (const n of fs.existsSync(dir) ? fs.readdirSync(dir) : []) { const p = path.join(dir, n); if (fs.lstatSync(p).isDirectory()) walk(p); else tidy(p); } };
    const tidy = (p) => {
      const rel = toRel(inn, p);
      if (!chosen.includes(partOf(rel))) { fs.rmSync(p, { force: true }); return; }
      files++;
      if (!rel.endsWith('.json') || fs.statSync(p).size > 50e6) return;
      let j;
      try { j = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return; }
      if (pairs.length) j = rebaseJson(j, pairs);
      if (rel === 'bob/settings.json') j = safeSettings(j);
      if (rel === 'bob/mcp-servers.json') j = restoreApps(cfg, j, unlocked?.mcpEnv || {}, appNotes);
      if (rel === 'bob/schedules.json') j = Array.isArray(j) ? safeSchedules(j) : j && typeof j === 'object' && Array.isArray(j.list) ? { ...j, list: safeSchedules(j.list) } : j;
      writeJsonAtomic(p, j, rel === 'bob/settings.json' ? 2 : 1);
    };
    walk(inn);
    for (const n of fs.readdirSync(tmp)) if (n !== 'inn') fs.rmSync(path.join(tmp, n), { recursive: true, force: true });
    writeJsonAtomic(path.join(tmp, 'plan.json'), { at: now.toISOString(), from: path.basename(info.file), made: info.made, parts: chosen, files });
    fs.rmSync(waiting, { recursive: true, force: true });
    fs.renameSync(tmp, waiting);
  }
  // Keys: the ones this computer doesn't have yet. One it already has is kept as it is.
  const restoredKeys = [], keptKeys = [], failedKeys = [];
  if (unlocked) {
    for (const [name, value] of Object.entries(unlocked.keys || {})) {
      if (!KEY_NAME_RE.test(name)) continue;
      let have = env[name];
      if (!have) { try { have = savedKey(name); } catch {} }
      if (have) { keptKeys.push(name); continue; }
      try { await store(name, String(value)); restoredKeys.push(name); } catch { failedKeys.push(name); }
    }
  }
  // Doors (config.json): Discord and Telegram details, and the phone passcode when the keys were opened. All switched off.
  let doors = false;
  if (cfg.configFile && (chosen.includes('settings') && info.doors || unlocked?.phonePasscode)) {
    let raw;
    try { raw = readConfigFile(cfg); } catch { raw = null; } // unreadable config.json: leave it alone
    if (raw) {
      if (chosen.includes('settings') && info.doors) {
        let d = {};
        try { d = JSON.parse(readZipEntry(info.file, DOORS, { maxBytes: 1024 ** 2 }).toString('utf8')); } catch {}
        const safe = doorsOf(d);
        if (safe.discord) raw.discord = { ...(raw.discord || {}), ...safe.discord, enabled: false, dmEnabled: false };
        if (safe.telegram) raw.telegram = { ...(raw.telegram || {}), ...safe.telegram, enabled: false };
        doors = Boolean(safe.discord || safe.telegram);
      }
      if (unlocked?.phonePasscode && !(raw.remote?.passcode)) { raw.remote = { ...(raw.remote || {}), passcode: String(unlocked.phonePasscode).slice(0, 64), enabled: false }; restoredKeys.push('phone passcode'); }
      try {
        writeConfigFile(cfg, raw); // locked with this computer's box
        for (const k of ['discord', 'telegram', 'remote']) if (raw[k]) cfg[k] = raw[k];
      } catch {
        doors = false;
        const i = restoredKeys.indexOf('phone passcode');
        if (i >= 0) { restoredKeys.splice(i, 1); failedKeys.push('phone passcode'); }
      }
    }
  }
  for (const n of appNotes) (n.ok ? restoredKeys : failedKeys).push(n.name);
  return { ok: true, waiting: files > 0, files, parts: chosen, made: info.made, brains: info.brains, keys: { restored: restoredKeys, kept: keptKeys, failed: failedKeys }, doors };
}

// Connected apps from a backup: each one's env values come from the locked part (when its passcode was given), locked
// again with this computer's box. A value locked by another computer's box (from a copy of the file) can't be opened
// here, so it's left empty. notes collects { name, ok } for the restore card.
export function restoreApps(cfg, j, mcpEnv = {}, notes = []) {
  if (!j || !Array.isArray(j.servers)) return j;
  let box = null;
  const locking = lockOn(cfg);
  if (locking) { try { box = ensureBox(cfg); } catch {} }
  const servers = j.servers.map((sv) => {
    if (!sv || typeof sv !== 'object' || !sv.env || typeof sv.env !== 'object') return sv;
    const env = {};
    for (const [k, v] of Object.entries(sv.env)) {
      const plain = typeof mcpEnv[sv.id]?.[k] === 'string' ? mcpEnv[sv.id][k] : typeof v === 'string' && !v.startsWith('bobsecret1:') ? v : '';
      if (!plain) { env[k] = ''; continue; }
      if (!locking) { env[k] = plain; notes.push({ name: `${sv.name || sv.id}: ${k}`, ok: true }); continue; }
      if (box?.ready) { env[k] = box.seal(plain); notes.push({ name: `${sv.name || sv.id}: ${k}`, ok: true }); } else { env[k] = ''; notes.push({ name: `${sv.name || sv.id}: ${k}`, ok: false }); }
    }
    return { ...sv, env };
  });
  return { ...j, servers };
}

// ---------------------------------------------------------------- the automatic backup
// Checks once an hour; makes a backup when one is due (every day or every week), keeps the newest few, never keys.
export class BackupKeeper {
  constructor(cfg, { log = () => {}, now = () => Date.now(), version = '', every = 60 * 60e3, timer = true } = {}) {
    this.cfg = cfg; this.log = log; this.now = now; this.version = version;
    this.stateFile = path.join(cfg.dataDir, 'backup-state.json');
    if (timer) { this.timer = setInterval(() => { try { this.tick(); } catch {} }, every); this.timer.unref?.(); }
  }
  stop() { clearInterval(this.timer); }
  state() { try { return { lastAuto: 0, lastFile: '', lastError: '', ...JSON.parse(fs.readFileSync(this.stateFile, 'utf8')) }; } catch { return { lastAuto: 0, lastFile: '', lastError: '' }; } }
  due() {
    const b = backupOf(this.cfg);
    if (!b.auto || !b.folder) return false;
    const gap = (b.every === 'day' ? 1 : 7) * 24 * 3600e3;
    return this.now() - (this.state().lastAuto || 0) >= gap - 10 * 60e3;
  }
  tick({ force = false } = {}) {
    if (!force && !this.due()) return null;
    const b = backupOf(this.cfg);
    const st = this.state();
    try {
      const r = makeBackup(this.cfg, { folder: b.folder, parts: PART_IDS, auto: true, version: this.version, now: new Date(this.now()) });
      const gone = pruneAuto(b.folder, b.keep);
      writeJsonAtomic(this.stateFile, { ...st, lastAuto: this.now(), lastFile: r.file, lastError: '' });
      this.log(`automatic backup saved: ${path.basename(r.file)} (${r.files} files)${gone.length ? `, ${gone.length} older one(s) removed` : ''}`);
      return r;
    } catch (e) {
      writeJsonAtomic(this.stateFile, { ...st, lastAuto: this.now(), lastError: e.message }); // tried: next try is one period later
      this.log(`automatic backup not saved: ${e.message}`);
      return null;
    }
  }
}

export function isInsideDir(root, target) {
  if (!root || !target) return false;
  const r = path.resolve(root).toLowerCase(), t = path.resolve(target).toLowerCase();
  return t === r || t.startsWith(r + path.sep);
}

// What Settings shows.
export function backupView(cfg, keeper, { canRestart = false, env = {} } = {}) {
  let lastRestore = null;
  try { lastRestore = JSON.parse(fs.readFileSync(path.join(cfg.dataDir, 'restore-result.json'), 'utf8')); } catch {}
  const g = gatherKeys(cfg, env);
  return {
    settings: backupOf(cfg), state: keeper ? keeper.state() : null, lastRestore, canRestart,
    waiting: fs.existsSync(path.join(cfg.innDir, 'restore-waiting', 'plan.json')),
    parts: PARTS.map(({ id, label, what }) => ({ id, label, what })),
    keysHere: keyCountOf(g), minPasscode: MIN_PASSCODE
  };
}

export { cleanBackup, backupOf };
