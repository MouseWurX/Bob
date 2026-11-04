// Let my phone in (Settings, Connections): Bob for Android, or a browser on your phone, can reach this Bob
// over Tailscale with a passcode. Off unless you turn it on. Before this it could only be set in config.json
// ("remote"); the setting writes the same keys, and server.js checks them the same way:
// Tailscale addresses only (100.64.0.0/10), Host must be on the list, passcode cookie, x-bob header.
import fs from 'node:fs';
import os from 'node:os';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

export const MIN_PASSCODE = 6;

// A Tailscale address of this PC: 100.64.0.0 to 100.127.255.255.
export const isTailscaleIp = (a) => { const m = String(a).match(/^100\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/); return Boolean(m && +m[1] >= 64 && +m[1] <= 127 && +m[2] <= 255 && +m[3] <= 255); };
const TS_NAME = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*\.ts\.net$/;

// "100.101.102.103:7777" or "my-pc.tail1234.ts.net:7777": what a phone sends as Host.
export function cleanHost(h, port) {
  let s = String(h || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/$/, '').replace(/\.$/, '');
  if (!/:\d+$/.test(s)) s = `${s}:${port}`;
  const [name, p] = [s.slice(0, s.lastIndexOf(':')), Number(s.slice(s.lastIndexOf(':') + 1))];
  if (p !== Number(port)) return null;
  return isTailscaleIp(name) || (name.length <= 253 && TS_NAME.test(name)) ? `${name}:${p}` : null;
}

// This PC's Tailscale addresses, from its network cards (no Tailscale program needed), plus its MagicDNS name
// when the Tailscale program can tell us (best effort, 3 seconds at most).
export async function findAddresses(port, { run = tailscaleName } = {}) {
  const ips = [];
  for (const list of Object.values(os.networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && isTailscaleIp(n.address)) ips.push(n.address);
  const name = await run().catch(() => '');
  return [...new Set([...(name ? [name] : []), ...ips])].map((h) => cleanHost(h, port)).filter(Boolean);
}

// Where the tailscale program is. Windows: its installer's folder. Mac: the Tailscale app keeps it inside itself
// (the App Store and the download from tailscale.com both), or Homebrew's folder. Linux: on PATH.
export function tailscaleExe(platform = process.platform, exists = fs.existsSync) {
  if (platform === 'win32') return 'C:\\Program Files\\Tailscale\\tailscale.exe';
  if (platform === 'darwin') {
    for (const f of ['/Applications/Tailscale.app/Contents/MacOS/Tailscale', '/opt/homebrew/bin/tailscale', '/usr/local/bin/tailscale']) if (exists(f)) return f;
  }
  return 'tailscale';
}

function tailscaleName() {
  const exe = tailscaleExe();
  return new Promise((resolve) => {
    execFile(exe, ['status', '--json', '--self=true', '--peers=false'], { timeout: 3000, windowsHide: true, maxBuffer: 1e6 }, (err, out) => {
      if (err) return resolve('');
      try { resolve(String(JSON.parse(out)?.Self?.DNSName || '').replace(/\.$/, '')); } catch { resolve(''); }
    });
  });
}

// Eight digits, easy to type on a phone.
export const newPasscode = () => String(crypto.randomInt(10_000_000, 100_000_000));

// What Settings shows. The passcode itself is never sent back, only whether one is set.
export function phoneView(cfg) {
  const r = cfg.remote || {};
  return { enabled: r.enabled === true, passcodeSet: String(r.passcode || '').length >= MIN_PASSCODE, hosts: r.hosts || [], port: cfg.port };
}

// A change from Settings, checked. Returns { remote } to save, or { error }.
export function cleanPhonePatch(cfg, b) {
  const cur = cfg.remote || {};
  const next = { enabled: cur.enabled === true, passcode: cur.passcode || '', hosts: cur.hosts || [], bindAddress: cur.bindAddress || '0.0.0.0' };
  if ('passcode' in b) {
    const p = String(b.passcode || '').trim();
    if (p.length < MIN_PASSCODE || p.length > 64) return { error: `The passcode needs at least ${MIN_PASSCODE} characters.` };
    next.passcode = p;
  }
  if ('hosts' in b) next.hosts = [...new Set([].concat(b.hosts || []).map((h) => cleanHost(h, cfg.port)).filter(Boolean))].slice(0, 8);
  if ('enabled' in b) {
    next.enabled = b.enabled === true;
    if (next.enabled && next.passcode.length < MIN_PASSCODE) return { error: 'Set a passcode first.' };
    if (next.enabled && !next.hosts.length) return { error: 'No Tailscale address found. Is Tailscale installed and connected on this replicant matrix?' };
  }
  return { remote: next };
}
