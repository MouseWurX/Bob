// Every link a Bob has to his other Bobs (Settings, Bob-Net, Bigger Bobs: Check links). Pooled cards are only as quick
// as the path between them, so Bob looks at what this machine has (Wi-Fi, a network port, a USB network dongle,
// USB4 / Thunderbolt ports), says which path he uses to each Bob and how long a trip takes, and what would be faster.
// The paths, best first: a USB4 or Thunderbolt cable straight between two machines that both have USB4 (it makes its
// own network); a network cable (straight between them, or through a switch or the router); powerline; Wi-Fi.
// A cable straight between two machines, with no router, gives both a 169.254.x.x address by itself, and Bob counts
// those as home-network addresses (src/share-card.js isHomeIp), so there is nothing to type in.
// Reading is by your click, or in the background for the hello (never while a hello waits). Nothing here changes
// anything on the machine, and nothing goes to the brain.
import fs from 'node:fs';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { OS } from './platform.js';

export const KINDS = ['usb4', 'cable', 'usbnet', 'wifi'];
const SKIP = /virtual|hyper-v|vethernet|tailscale|wireguard|vpn|\btap\b|tap-|loopback|bluetooth|wi-fi direct|wsl|vmware|miniport|teredo|host-only|docker|bridge adapter/i;

function runFile(file, args, opts = {}) {
  return new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout: 30000, maxBuffer: 4e6, ...opts }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || err?.message || '') })));
}

// One Windows adapter: 'usb4' (two USB4 machines joined by a cable), 'wifi', 'usbnet' (a USB network dongle),
// 'cable' (a network port), or '' for anything that isn't a real link (virtual switches, VPNs, Bluetooth).
export function kindOfAdapter({ desc = '', name = '', medium = 0, type = '' } = {}) {
  const d = `${desc} ${name}`;
  if (/USB4.*P2P|Thunderbolt.*Network/i.test(d)) return 'usb4';
  if (SKIP.test(d)) return '';
  if (Number(medium) === 9 || /802\.11|wireless/i.test(`${type} ${desc}`) || /\bwi-?fi\b/i.test(d)) return 'wifi';
  if (/\busb\b/i.test(desc) && (Number(medium) === 14 || /802\.3|ethernet|gbe|gigabit|lan/i.test(`${type} ${desc}`))) return 'usbnet';
  if (Number(medium) === 14 || /802\.3/i.test(type) || /ethernet|gbe|gigabit|2\.5g|\blan\b/i.test(desc)) return 'cable';
  return '';
}

export const winScript = () => [
  '$a = @(Get-NetAdapter -ErrorAction SilentlyContinue | ForEach-Object { @{ name = [string]$_.Name; desc = [string]$_.InterfaceDescription; up = ($_.Status -eq \'Up\'); bps = [double]$_.Speed; medium = [int]$_.NdisPhysicalMedium; type = [string]$_.PhysicalMediaType } })',
  '$u = @(Get-PnpDevice -PresentOnly -ErrorAction SilentlyContinue | Where-Object { $_.FriendlyName -match \'USB4|Thunderbolt\' } | Select-Object -First 4 | ForEach-Object { [string]$_.FriendlyName })',
  '@{ adapters = $a; usb4 = $u } | ConvertTo-Json -Depth 4 -Compress'
].join('; ');

const mbps = (x) => (Number.isFinite(Number(x)) && Number(x) > 0 && Number(x) < 1e6 ? Math.round(Number(x)) : 0);
const done = (os_, list, usb4) => ({ os: os_, list, usb4: usb4 || list.some((l) => l.kind === 'usb4'), port: list.some((l) => l.kind === 'cable'), dongle: list.some((l) => l.kind === 'usbnet'), wifi: list.some((l) => l.kind === 'wifi') });

// What this machine has: { os, list: [{ kind, name, up, mbps }], usb4, port, dongle, wifi }. usb4: it has a USB4 or
// Thunderbolt port at all (cable in or not). Never throws; what can't be read is left out.
export async function readLinks({ os_ = OS, run = runFile, fsx = fs, ifaces = os.networkInterfaces() } = {}) {
  const live = (name) => (ifaces[name] || []).some((n) => n.family === 'IPv4' && !n.internal);
  try {
    if (os_ === 'win') {
      const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', winScript()]);
      const j = JSON.parse(r.out.trim() || '{}');
      const list = [].concat(j.adapters || []).map((a) => ({ kind: kindOfAdapter(a), name: String(a.name || '').slice(0, 80), up: a.up === true, mbps: a.up === true ? mbps(Number(a.bps) / 1e6) : 0 })).filter((l) => l.kind);
      return done('win', list, [].concat(j.usb4 || []).length > 0);
    }
    if (os_ === 'linux') {
      const list = [];
      for (const name of fsx.readdirSync('/sys/class/net')) {
        const p = `/sys/class/net/${name}`;
        if (name === 'lo' || !fsx.existsSync(`${p}/device`)) continue; // no device behind it: a bridge, a tunnel, a container's
        let sub = ''; try { sub = String(fsx.readlinkSync(`${p}/device/subsystem`)); } catch {}
        const kind = /^thunderbolt/.test(name) || /thunderbolt$/.test(sub) ? 'usb4' : fsx.existsSync(`${p}/wireless`) || /^wl/.test(name) ? 'wifi' : /usb$/.test(sub) ? 'usbnet' : 'cable';
        let up = false, sp = 0;
        try { up = String(fsx.readFileSync(`${p}/operstate`, 'utf8')).trim() === 'up'; } catch {}
        try { sp = mbps(String(fsx.readFileSync(`${p}/speed`, 'utf8')).trim()); } catch {}
        list.push({ kind, name, up, mbps: up ? sp : 0 });
      }
      let tb = false; try { tb = fsx.readdirSync('/sys/bus/thunderbolt/devices').length > 0; } catch {}
      return done('linux', list, tb);
    }
    if (os_ === 'mac') {
      const r = await run('networksetup', ['-listallhardwareports']);
      const list = []; let tb = false;
      for (const b of r.out.replace(/\r\n/g, '\n').split(/\n\s*\n/)) {
        const port = (b.match(/Hardware Port:\s*(.+)/) || [])[1] || '', dev = (b.match(/Device:\s*(\S+)/) || [])[1] || '';
        if (!port || !dev) continue;
        if (/thunderbolt/i.test(port)) tb = true;
        const kind = /thunderbolt bridge/i.test(port) ? 'usb4' : /wi-?fi|airport/i.test(port) ? 'wifi' : /usb/i.test(port) && /lan|ethernet/i.test(port) ? 'usbnet' : /ethernet|\blan\b/i.test(port) ? 'cable' : '';
        if (kind) list.push({ kind, name: dev, up: live(dev), mbps: 0 });
      }
      return done('mac', list, tb);
    }
  } catch {}
  return done(os_, [], false);
}

// For the hello: only what kinds of link this Bob could use, nothing that names the machine or its network.
export const linksHello = (l) => (l && Array.isArray(l.list) ? { usb4: l.usb4 === true, port: l.port === true, dongle: l.dongle === true, wifi: l.wifi === true } : undefined);
export const cleanLinks = (j) => (j && typeof j === 'object' ? { usb4: j.usb4 === true, port: j.port === true, dongle: j.dongle === true, wifi: j.wifi === true } : null);

// Read in the background and kept five minutes, so a hello never waits for it.
export class LinksCache {
  constructor({ read = readLinks, now = Date.now, keepMs = 5 * 60000 } = {}) { Object.assign(this, { read, now, keepMs }); this.links = null; this.at = 0; this.busy = null; }
  peek() { if (!this.busy && this.now() - this.at > this.keepMs) this.fresh().catch(() => {}); return this.links; }
  fresh() { if (!this.busy) this.busy = Promise.resolve().then(() => this.read()).then((l) => { this.links = l; this.at = this.now(); return l; }).finally(() => { this.busy = null; }); return this.busy; }
}

// Which of this machine's links one of its own addresses sits on ('' when it can't be told).
export function kindOfAddress(address, links, ifaces = os.networkInterfaces()) {
  for (const [name, list] of Object.entries(ifaces)) if ((list || []).some((n) => n.address === address)) return links?.list?.find((l) => l.name === name)?.kind || '';
  return '';
}

const WORD = { usb4: 'a USB4 cable', cable: 'a network cable', usbnet: 'a network cable (USB dongle)', wifi: 'Wi-Fi', '': 'the home network' };
const ms1 = (x) => (x < 10 ? x.toFixed(1) : String(Math.round(x)));
const wired = (k) => k === 'usb4' || k === 'cable' || k === 'usbnet';

// The Check links button's words. view: { me: links, machine: 'PC', bobs: [{ name, ok, links (his, or null), paths: [{ kind, ms }] }] }
export function linksSay({ me, machine = 'PC', bobs = [] } = {}) {
  if (!me?.list?.length) return 'I couldn\'t read this machine\'s network links.';
  const has = [];
  for (const k of KINDS) { const up = me.list.filter((l) => l.kind === k && l.up), any = me.list.some((l) => l.kind === k); if (any) has.push(`${k === 'usb4' ? 'a USB4 link' : k === 'cable' ? 'a network port' : k === 'usbnet' ? 'a USB network dongle' : 'Wi-Fi'} (${up.length ? `in use${up[0].mbps ? `, ${up[0].mbps >= 1000 ? `${up[0].mbps / 1000} Gbit/s` : `${up[0].mbps} Mbit/s`}` : ''}` : 'nothing plugged in'})`); }
  const lines = [`This ${machine} has ${has.join(', ')}. ${me.usb4 ? 'It has USB4, so a USB4 or Thunderbolt cable straight to another machine with USB4 makes a very fast link.' : `It has no USB4 port, so a USB-C to USB-C cable can't carry Bob-Net here, even from a port that does video or charging.`}`];
  if (!bobs.length) lines.push('You have no other Bobs paired yet.');
  for (const b of bobs) {
    const paths = (b.paths || []).filter((p) => Number.isFinite(p.ms)).sort((x, y) => x.ms - y.ms);
    if (!paths.length) { lines.push(`${b.name}: I only reach him over Tailscale, or not at all right now. For the links below, turn on Also over the home network on both of us.`); }
    else lines.push(`${b.name}: ${paths.map((p, i) => `${i ? 'also ' : ''}${WORD[p.kind] || WORD['']}, ${ms1(p.ms)} ms a trip`).join('; ')}.${paths.length > 1 ? ` I use the quickest, ${WORD[paths[0].kind] || WORD['']}.` : ''}`);
    if (paths.length && wired(paths[0].kind) && paths[0].ms < 3) { lines.push('That is as good as it gets.'); continue; }
    const his = b.links, tips = [];
    if (!his) tips.push('He\'s on an older version of me, so I can\'t see what links he has.');
    if (me.usb4 && his?.usb4) tips.push('Fastest: we both have USB4, so a USB4 or Thunderbolt cable straight between us (one marked 40 Gbps or with the lightning sign; a plain charging cable won\'t do).');
    const myPort = me.port || me.dongle, hisPort = his ? his.port || his.dongle : true;
    if (!(paths.length && wired(paths[0].kind))) {
      if (myPort && hisPort) tips.push(`${tips.length ? 'Next' : 'Best'}: a network cable, straight between us or both into a switch or the router. Nothing to set up; I find it by myself.`);
      else tips.push(`${tips.length ? 'Next' : 'Best'}: a network cable. ${!myPort ? `This ${machine} has` : `${b.name} has`} no network port, so that takes a USB-C network dongle or a dock.`);
      tips.push('Powerline adapters are steadier than Wi-Fi, though slower than a cable.');
      tips.push('On Wi-Fi, Calibrate above picks the best band.');
    }
    if (tips.length) lines.push(tips.join(' '));
  }
  return lines.join('\n');
}
