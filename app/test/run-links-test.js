// Check links (src/links.js): which links a machine has, which path Bob uses to each Bob, and what would be faster.
// Nothing here reads the real computer: Windows' answer, Linux's /sys and the Mac's list are pretend.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { kindOfAdapter, readLinks, linksHello, cleanLinks, LinksCache, kindOfAddress, linksSay, winScript } from '../src/links.js';
import { isHomeIp, homeIps, pickHome } from '../src/share-card.js';
import { Lenders, helloFor } from '../src/share-brains.js';

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS', m); } else { fail++; console.log('FAIL', m); } };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (...p) => fs.readFileSync(path.join(here, '..', ...p), 'utf8').replace(/\r\n/g, '\n');
const H = (...x) => x.join('.'); // addresses are built, so no real one sits in the file

const WIN = { adapters: [
  { name: 'Wi-Fi', desc: 'Pretend 8851 Wireless LAN WiFi 6 PCI-E NIC', up: true, bps: 143e6, medium: 9, type: 'Native 802.11' },
  { name: 'Ethernet', desc: 'Pretend PCIe 2.5GbE Family Controller', up: false, bps: 0, medium: 14, type: '802.3' },
  { name: 'Ethernet 2', desc: 'VirtualBox Host-Only Ethernet Adapter', up: true, bps: 1e9, medium: 14, type: '802.3' },
  { name: 'Tailscale', desc: 'Tailscale Tunnel', up: true, bps: 1e11, medium: 0, type: 'Unspecified' },
  { name: 'Bluetooth Network Connection', desc: 'Bluetooth Device (Personal Area Network)', up: false, bps: 3e6, medium: 10, type: 'BlueTooth' }
], usb4: [] };
const GO = { adapters: [
  { name: 'Wi-Fi', desc: 'Pretend Wi-Fi 6E RZ616 160MHz Wireless LAN Card', up: true, bps: 1.2e9, medium: 9, type: 'Native 802.11' },
  { name: 'Ethernet 3', desc: 'USB4(TM) P2P Network Adapter', up: true, bps: 2e10, medium: 14, type: '802.3' },
  { name: 'Ethernet 4', desc: 'Realtek USB GbE Family Controller', up: true, bps: 1e9, medium: 14, type: '802.3' }
], usb4: ['USB4(TM) Host Router (Microsoft)'] };
const winRun = (j) => async () => ({ ok: true, out: `${JSON.stringify(j)}\r\n`, err: '' });

{
  ok(kindOfAdapter(WIN.adapters[0]) === 'wifi' && kindOfAdapter(WIN.adapters[1]) === 'cable' && kindOfAdapter(GO.adapters[1]) === 'usb4' && kindOfAdapter(GO.adapters[2]) === 'usbnet' && kindOfAdapter({ desc: 'Thunderbolt(TM) Networking' }) === 'usb4', 'adapters are told apart: Wi-Fi, a network port, a USB dongle, a USB4 link');
  ok(kindOfAdapter(WIN.adapters[2]) === '' && kindOfAdapter(WIN.adapters[3]) === '' && kindOfAdapter(WIN.adapters[4]) === '' && kindOfAdapter({ desc: 'Hyper-V Virtual Ethernet Adapter', medium: 14 }) === '', 'virtual switches, VPNs and Bluetooth are not links');
  const pc = await readLinks({ os_: 'win', run: winRun(WIN) });
  ok(pc.list.length === 2 && pc.wifi && pc.port && !pc.usb4 && !pc.dongle && pc.list[0].mbps === 143 && pc.list[1].up === false && pc.list[1].mbps === 0, 'Windows: a PC with Wi-Fi and an empty network port, and no USB4');
  const go = await readLinks({ os_: 'win', run: winRun(GO) });
  ok(go.usb4 && go.dongle && !go.port && go.list.find((l) => l.kind === 'usb4').mbps === 20000, 'Windows: a handheld with USB4 in use and a USB network dongle');
  ok((await readLinks({ os_: 'win', run: async () => ({ ok: false, out: 'not json', err: 'x' }) })).list.length === 0, 'an answer that can\'t be read gives an empty list, not an error');
  ok(/Get-NetAdapter/.test(winScript()) && !/Set-|Remove-|Disable-|Enable-|New-/.test(winScript()), 'the Windows read changes nothing');
}
{
  const tree = { '/sys/class/net': ['lo', 'enp5s0', 'wlan0', 'thunderbolt0', 'docker0', 'enx00'], '/sys/bus/thunderbolt/devices': ['0-0', 'domain0'] };
  const files = { '/sys/class/net/enp5s0/operstate': 'up\n', '/sys/class/net/enp5s0/speed': '2500\n', '/sys/class/net/wlan0/operstate': 'up\n', '/sys/class/net/thunderbolt0/operstate': 'down\n', '/sys/class/net/enx00/operstate': 'up\n', '/sys/class/net/enx00/speed': '1000\n' };
  const exists = new Set(['/sys/class/net/enp5s0/device', '/sys/class/net/wlan0/device', '/sys/class/net/wlan0/wireless', '/sys/class/net/thunderbolt0/device', '/sys/class/net/enx00/device']);
  const links = { '/sys/class/net/enx00/device/subsystem': '../../../bus/usb', '/sys/class/net/enp5s0/device/subsystem': '../../../bus/pci' };
  const fsx = { readdirSync: (p) => { if (!tree[p]) throw new Error('no'); return tree[p]; }, existsSync: (p) => exists.has(p), readFileSync: (p) => { if (!(p in files)) throw new Error('no'); return files[p]; }, readlinkSync: (p) => { if (!(p in links)) throw new Error('no'); return links[p]; } };
  const l = await readLinks({ os_: 'linux', fsx });
  ok(l.list.map((x) => `${x.name}:${x.kind}`).join(' ') === 'enp5s0:cable wlan0:wifi thunderbolt0:usb4 enx00:usbnet' && l.usb4 && l.list[0].mbps === 2500 && l.list[2].up === false, 'Linux: links are read from /sys, bridges and loopback left out');
  const mac = await readLinks({ os_: 'mac', ifaces: { en0: [{ family: 'IPv4', address: H(192, 168, 4, 9), internal: false }] }, run: async () => ({ ok: true, out: 'Hardware Port: Wi-Fi\nDevice: en0\nEthernet Address: x\n\nHardware Port: Thunderbolt 1\nDevice: en1\n\nHardware Port: Thunderbolt Bridge\nDevice: bridge0\n\nHardware Port: USB 10/100/1000 LAN\nDevice: en7\n', err: '' }) });
  ok(mac.usb4 && mac.wifi && mac.dongle && mac.list.find((x) => x.kind === 'wifi').up && !mac.list.find((x) => x.kind === 'usb4').up, 'Mac: Wi-Fi, a Thunderbolt Bridge and a USB network dongle');
  ok((await readLinks({ os_: 'linux', fsx: { readdirSync: () => { throw new Error('no'); } } })).list.length === 0, 'and a machine that can\'t be read gives an empty list');
}
{
  ok(isHomeIp(H(169, 254, 12, 7)) && !isHomeIp(H(169, 253, 1, 1)) && !isHomeIp('8.8.8.8'), 'a cable straight between two machines: its self-given address counts as home network');
  const mine = homeIps({ 'Ethernet 3': [{ family: 'IPv4', address: H(169, 254, 12, 7), netmask: '255.255.0.0', internal: false }], 'Wi-Fi': [{ family: 'IPv4', address: H(192, 168, 4, 185), netmask: '255.255.255.0', internal: false }] });
  ok(mine.length === 2 && pickHome(mine, [H(169, 254, 80, 2)]).host === H(169, 254, 12, 7) && pickHome(mine, ['8.8.8.8']) === null, 'and the two ends of that cable find each other with nothing typed in');
  const go = { name: 'Go', address: '100.102.0.7:7777' };
  const ls = new Lenders({ share: { borrow: { bobs: [go] } } }, { home: () => mine, trip: async ({ host }) => (host === H(169, 254, 80, 2) ? 0.3 : 28), fetchFn: async () => ({ ok: true, status: 200, headers: { get: () => null }, json: async () => ({ lend: true, links: { usb4: true, wifi: true, extra: 'x' }, home: [`${H(192, 168, 4, 189)}:7777`, `${H(169, 254, 80, 2)}:7777`] }) }) });
  await ls.hello(go, { force: true });
  ok(ls.nearOf(go) === `${H(169, 254, 80, 2)}:7777` && ls.nearAll.get(go.address).length === 2, 'Bob moves to the USB4 cable when it is quicker than Wi-Fi, and remembers every path');
  ok(ls.state.get(go.address).links.usb4 === true && ls.state.get(go.address).links.port === false && !('extra' in ls.state.get(go.address).links), 'what links the other Bob has is kept from his hello, and only that');
  const ifaces = { 'Ethernet 3': [{ address: H(169, 254, 12, 7) }], 'Wi-Fi': [{ address: H(192, 168, 4, 185) }] };
  const me = await readLinks({ os_: 'win', run: winRun(GO) });
  ok(kindOfAddress(H(169, 254, 12, 7), me, ifaces) === 'usb4' && kindOfAddress(H(192, 168, 4, 185), me, ifaces) === 'wifi' && kindOfAddress('1.2.3.4', me, ifaces) === '', 'each of this machine\'s addresses is matched to its link');
}
{
  ok(JSON.stringify(linksHello({ list: [], usb4: true, port: false, dongle: false, wifi: true })) === '{"usb4":true,"port":false,"dongle":false,"wifi":true}' && linksHello(null) === undefined && cleanLinks(null) === null, 'the hello carries only which kinds of link there are');
  let reads = 0, t = 0;
  const c = new LinksCache({ read: async () => { reads++; return { list: [], usb4: false }; }, now: () => t });
  t = 1e7;
  ok(c.peek() === null, 'the first hello doesn\'t wait for the links to be read');
  await c.busy; c.peek();
  ok(c.peek()?.usb4 === false && reads === 1, 'later ones use what was read, and it isn\'t read again for five minutes');
  const h = helloFor({ cfg: { share: {}, remote: {} }, linksCache: c }, { why: 'off', can: {}, version: '1', label: (x) => x });
  ok(h.links && h.links.usb4 === false && !('links' in helloFor({ cfg: { share: {}, remote: {} } }, { why: 'off', can: {}, version: '1', label: (x) => x })), 'the hello says which links this Bob has, once known');
}
{
  const pc = await readLinks({ os_: 'win', run: winRun(WIN) }), go = await readLinks({ os_: 'win', run: winRun(GO) });
  const a = linksSay({ me: pc, machine: 'PC', bobs: [{ name: 'Go', links: linksHello(go), paths: [{ kind: 'wifi', ms: 31 }] }] });
  ok(/This PC has a network port \(nothing plugged in\), Wi-Fi \(in use, 143 Mbit\/s\)/.test(a) && /no USB4 port, so a USB-C to USB-C cable can't carry Bob-Net here/.test(a), 'a PC without USB4 is told so plainly');
  ok(/Go: Wi-Fi, 31 ms a trip\./.test(a) && /Best: a network cable, straight between us or both into a switch or the router/.test(a) && /Powerline/.test(a) && /Calibrate/.test(a) && !/Fastest: we both have USB4/.test(a), 'and the advice is a cable first, then powerline, then the Wi-Fi band');
  const b = linksSay({ me: go, machine: 'PC', bobs: [{ name: 'Laptop', links: { usb4: true, port: true, dongle: false, wifi: true }, paths: [{ kind: 'wifi', ms: 12 }] }] });
  ok(/Fastest: we both have USB4/.test(b) && /Next: a network cable/.test(b), 'two machines with USB4 are told the USB4 cable is fastest');
  const c = linksSay({ me: go, bobs: [{ name: 'Laptop', links: { usb4: true }, paths: [{ kind: 'wifi', ms: 12 }, { kind: 'usb4', ms: 0.3 }] }] });
  ok(/Laptop: a USB4 cable, 0\.3 ms a trip; also Wi-Fi, 12 ms a trip\. I use the quickest, a USB4 cable\./.test(c) && /as good as it gets/.test(c) && !/Powerline/.test(c), 'on a cable already: both paths shown, the quickest in use, nothing more to suggest');
  const d = linksSay({ me: pc, bobs: [{ name: 'Phone', links: null, paths: [] }, { name: 'Go', links: { wifi: true }, paths: [{ kind: 'wifi', ms: 31 }] }] });
  ok(/Phone: I only reach him over Tailscale/.test(d) && /older version/.test(d) && /Go has no network port, so that takes a USB-C network dongle or a dock/.test(d), 'no home-network path, an older Bob, and a Bob with no network port are each said');
  ok(/couldn't read/.test(linksSay({ me: { list: [] } })) && /no other Bobs paired/.test(linksSay({ me: pc, bobs: [] })), 'nothing read, or nobody paired, is said too');
}
{
  const ui = read('public', 'share-brains.js'), help = read('public', 'help-content.js'), srv = read('src', 'server.js');
  ok(ui.includes('data-links-check') && ui.includes('aria-live="polite" data-links-say'), 'Settings has Check links, and reads the result out');
  ok(help.includes("set('Links to my Bobs: Check links'") && help.includes("id: 'faq-bob-links'") && help.includes('<dt>Check links</dt>'), 'Help, an FAQ and the glossary cover it');
  ok(/\/api\/share-brains\/links' && req\.method === 'GET'\) \{\n\s*if \(!isLocal\)/.test(srv), 'only this machine can ask');
  ok(read('docs', 'SETTINGS-INVENTORY.md').includes('Links to my Bobs (always shown under Bigger Bobs'), 'the settings inventory lists it');
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
