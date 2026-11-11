// 1.5.204 Smart App Control (the owner, Nov 11 2026: "we need to prevent these windows smart app controls issues before
// they occur. plan for them to be an issue."). On the PC test of 1.5.203, Windows' Smart App Control stopped the new
// Brain Engine's files: they were brand new and not signed, so Windows had never seen them. Bob installed the engine
// and then no brain could load.
//
// Smart App Control (Windows 11) lets a program or library run only when Microsoft's cloud already knows it as safe,
// or when it carries a signature from a trusted certificate. Nobody can add an exception, and Bob never changes it.
// So Bob plans for it instead:
//  - he reads whether it's on (read-only, the same registry value Windows' own Security app shows),
//  - he tries a new thinking engine before it takes the old one's place (tryEngine): if Windows stops it, or it
//    can't see the graphics card the old one could, the old one stays and he says why in plain words,
//  - he remembers a stopped build (engine-blocks.json in his folder), so it isn't fetched again at every start,
//  - signedPe() tells whether a Windows program file carries a signature at all; installer/check-signed.js uses it
//    to list the unsigned files in a release before it goes out.
// Nothing here runs on Linux, a Mac or Android: Smart App Control is Windows only. Tests pass fakes for the
// registry, the program runs and the folder.
import fs from 'node:fs';
import path from 'node:path';
import { execFile, spawn as realSpawn } from 'node:child_process';

// HKLM\SYSTEM\CurrentControlSet\Control\CI\Policy, VerifiedAndReputablePolicyState: 0 off, 1 on, 2 evaluation
// (Windows watches quietly for a while, then turns it on or off by itself, without saying so).
export const SAC_KEY = 'HKLM\\SYSTEM\\CurrentControlSet\\Control\\CI\\Policy';
export const SAC_VALUE = 'VerifiedAndReputablePolicyState';
export const SAC_STATES = { 0: 'off', 1: 'on', 2: 'evaluation' };
export function sacFromReg(out) {
  const m = new RegExp(`${SAC_VALUE}\\s+REG_DWORD\\s+0x([0-9a-f]+)`, 'i').exec(String(out || ''));
  return m ? SAC_STATES[parseInt(m[1], 16)] || 'unknown' : 'unknown';
}
const runReg = () => new Promise((resolve) => {
  try { execFile('reg.exe', ['query', SAC_KEY, '/v', SAC_VALUE], { windowsHide: true, timeout: 10000 }, (err, out) => resolve(err ? '' : String(out))); }
  catch { resolve(''); }
});
// 'on' | 'evaluation' | 'off' | 'unknown' on Windows; 'none' anywhere else.
export async function sacState({ platform = process.platform, reg = runReg } = {}) {
  if (platform !== 'win32') return 'none';
  return sacFromReg(await reg());
}
export const SAC_WORDS = {
  on: 'Windows Smart App Control is on. It stops program files Windows doesn\'t know yet unless they\'re signed. Bob tries each new engine before using it and keeps the old one if Windows says no.',
  evaluation: 'Windows Smart App Control is in its trial mode. It blocks nothing yet, but Windows can turn it on by itself later. Bob tries each new engine before using it, so if that happens he keeps the old one.',
  off: 'Windows Smart App Control is off.',
};

// Does a Windows program file (exe, dll, node) carry an Authenticode signature? Reads the PE header's security
// directory: present means signed (whether Windows trusts the signer is another matter, which only Windows can say).
// null = not a Windows program file.
export function signedPe(buf) {
  try {
    if (!buf || buf.length < 0x40 || buf.readUInt16LE(0) !== 0x5a4d) return null; // MZ
    const pe = buf.readUInt32LE(0x3c);
    if (pe + 24 > buf.length || buf.readUInt32LE(pe) !== 0x00004550) return null; // PE\0\0
    const opt = pe + 24;
    const magic = buf.readUInt16LE(opt);
    const dirs = magic === 0x20b ? opt + 112 : magic === 0x10b ? opt + 96 : -1;
    if (dirs < 0) return null;
    const count = buf.readUInt32LE(dirs - 4);
    if (count < 5 || dirs + 5 * 8 > buf.length) return false;
    const at = buf.readUInt32LE(dirs + 4 * 8), size = buf.readUInt32LE(dirs + 4 * 8 + 4);
    return at > 0 && size > 0;
  } catch { return null; }
}
export const PE_FILE = /\.(exe|dll|node|sys|pyd)$/i;
// The Windows program files in a folder (and its sub-folders) without a signature, as paths relative to it.
export function unsignedIn(dir, { fsx = fs } = {}) {
  const out = [];
  const walk = (d, rel) => {
    for (const ent of fsx.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, ent.name), r = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) walk(p, r);
      else if (PE_FILE.test(ent.name)) {
        let head;
        try { head = readHead(p, fsx); } catch { continue; }
        if (signedPe(head) === false) out.push(r);
      }
    }
  };
  walk(dir, '');
  return out.sort();
}
// The headers sit in the first few KB.
function readHead(p, fsx) {
  const fd = fsx.openSync(p, 'r');
  try { const b = Buffer.alloc(4096); const n = fsx.readSync(fd, b, 0, b.length, 0); return b.subarray(0, n); }
  finally { fsx.closeSync(fd); }
}

// How Windows says "an app control policy stopped this": Node's spawn gives UNKNOWN (errno -4094, Windows error
// 4551) or EPERM/EACCES; a program that starts but has one of its libraries stopped ends with one of these codes.
export const BLOCK_EXIT = new Set([0xC0000428, 0xC0000361, 0xC0000362, 0xC0000363, 0xC0000364, 0xC0000365, 0xC0000366, 0xC0000372]);
export function looksBlocked({ error = null, code = null } = {}) {
  if (error) return error.code === 'UNKNOWN' || error.errno === -4094 || error.code === 'EPERM' || error.code === 'EACCES' || /4551|application control|smart app control/i.test(error.message || '');
  if (code === null || code === undefined) return false;
  return BLOCK_EXIT.has(Number(code) >>> 0);
}

// Runs a program once with args and tells how it went: { ok, blocked, code, out }. Never longer than timeout.
export function runOnce(exe, args, { spawn = realSpawn, timeout = 30000 } = {}) {
  return new Promise((resolve) => {
    let out = '', done = false, child;
    const finish = (r) => { if (!done) { done = true; clearTimeout(t); resolve({ out, ...r }); } };
    const t = setTimeout(() => { try { child?.kill(); } catch {} finish({ ok: false, blocked: false, code: 'timeout' }); }, timeout);
    t.unref?.();
    try { child = spawn(exe, args, { windowsHide: true, cwd: path.dirname(exe), stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (error) { finish({ ok: false, blocked: looksBlocked({ error }), code: error.code || 'spawn' }); return; }
    child.stdout?.on('data', (d) => { out += d; });
    child.stderr?.on('data', (d) => { out += d; });
    child.on('error', (error) => finish({ ok: false, blocked: looksBlocked({ error }), code: error.code || 'spawn' }));
    child.on('close', (code) => finish({ ok: code === 0, blocked: looksBlocked({ code }), code }));
  });
}

// llama-server --list-devices loads the card libraries (ggml-cuda, ggml-vulkan...) and lists what each one sees, then
// exits. A library Windows stops just doesn't load, so the card goes missing from the list: that's how a blocked
// ggml-cuda.dll shows up, where the program itself still runs.
export const countDevices = (out) => String(out || '').split(/\r?\n/).filter((l) => /^\s*(CUDA|Vulkan|ROCm|HIP|SYCL|Metal|MUSA|CANN|OpenCL)\d*\s*:/i.test(l)).length;

// Try a new llama.cpp-family engine (in its side folder) before it takes the old one's place. Windows only; anywhere
// else, or for another engine, it's { ok: true } without running anything. Returns
// { ok: true } or { ok: false, why: 'blocked' | 'lost-card', words }.
export async function tryEngine(stage, e, { old = null, platform = process.platform, run = runOnce } = {}) {
  if (platform !== 'win32' || !/^llama-server\.exe$/i.test(e?.exe || '')) return { ok: true };
  const exe = path.join(stage, e.exe);
  if (!fs.existsSync(exe)) return { ok: true }; // the whole-files check says so in its own words
  // Only a real Windows program is run: anything else (a test's stand-in file) is left to the usual checks.
  let head = null;
  try { head = readHead(exe, fs); } catch {}
  if (signedPe(head) === null) return { ok: true };
  const now = await run(exe, ['--list-devices']);
  if (now.blocked) return { ok: false, why: 'blocked', words: blockedWords(e.name) };
  if (old && fs.existsSync(path.join(old, e.exe))) {
    const was = await run(path.join(old, e.exe), ['--list-devices']);
    if (was.ok && countDevices(was.out) > 0 && countDevices(now.out) === 0) return { ok: false, why: 'lost-card', words: lostCardWords(e.name) };
  }
  return { ok: true };
}
export const blockedWords = (name) => `Windows stopped the new ${name} before it could run. That's Smart App Control: it blocks program files Windows hasn't seen before unless they're signed, and this build isn't signed yet. I kept the ${name} you have, so nothing changed. I won't fetch this build again by myself. Once a signed build is out, I'll get that one.`;
export const lostCardWords = (name) => `The new ${name} ran, but it couldn't see your graphics card, and the one you have can. Windows has probably stopped its card library (Smart App Control blocks files it hasn't seen before unless they're signed). I kept the ${name} you have, so nothing changed.`;

// Builds Windows stopped, so they aren't fetched again by themselves: { [id]: { version, print, at, why } }.
const blocksFile = (cfg) => path.join(cfg.agentDir || '.', 'engine-blocks.json');
export function readBlocks(cfg) {
  try { const j = JSON.parse(fs.readFileSync(blocksFile(cfg), 'utf8').replace(/^﻿/, '')); return j && typeof j === 'object' ? j : {}; } catch { return {}; }
}
export function noteBlocked(cfg, id, mark, why) {
  const all = readBlocks(cfg);
  all[id] = { version: mark?.version || '', print: mark?.print || '', at: new Date().toISOString(), why };
  try { fs.mkdirSync(path.dirname(blocksFile(cfg)), { recursive: true }); fs.writeFileSync(blocksFile(cfg), JSON.stringify(all, null, 2)); } catch {}
}
export function clearBlocked(cfg, id) {
  const all = readBlocks(cfg);
  if (!all[id]) return;
  delete all[id];
  try { fs.writeFileSync(blocksFile(cfg), JSON.stringify(all, null, 2)); } catch {}
}
// Is this exact build (same name and, when known, the same file) one Windows stopped here?
export function wasBlocked(cfg, id, { version = '', print = '' } = {}) {
  const b = readBlocks(cfg)[id];
  if (!b) return false;
  if (print && b.print) return b.print === print;
  return Boolean(version) && b.version === version;
}
