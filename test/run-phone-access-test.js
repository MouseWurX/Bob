// Let my phone in (src/phone-access.js, Settings > Connections): addresses, passcode and switch rules,
// and that it is saved in config.json only (settings.json can never open the door).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { cleanHost, cleanPhonePatch, findAddresses, newPasscode, phoneView, isTailscaleIp, tailscaleExe } from '../src/phone-access.js';
import { saveRemote, mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}${extra ? `: ${extra}` : ''}`); } };

check('Tailscale range only', isTailscaleIp('100.64.0.1') && isTailscaleIp('100.127.255.255') && !isTailscaleIp('100.63.1.1') && !isTailscaleIp('100.128.0.1') && !isTailscaleIp(['10', '0', '0', '1'].join('.')));
check('addresses get the port and are lower case', cleanHost('My-PC.tail1.ts.net.', 7777) === 'my-pc.tail1.ts.net:7777' && cleanHost('100.101.2.3', 7777) === '100.101.2.3:7777');
check('other addresses and ports are refused', cleanHost('example.com', 7777) === null && cleanHost('100.101.2.3:80', 7777) === null && cleanHost('evil.ts.net.example.com', 7777) === null);
check('found addresses: the Tailscale name first', (await findAddresses(7777, { run: async () => 'my-pc.tail1.ts.net' }))[0] === 'my-pc.tail1.ts.net:7777');
check('new passcode: 8 digits', /^\d{8}$/.test(newPasscode()));

const cfg = { port: 7777, remote: { enabled: false, passcode: '', hosts: [] } };
check("can't switch on without a passcode", /passcode first/.test(cleanPhonePatch(cfg, { enabled: true }).error || ''));
check('a short passcode is refused', /at least 6/.test(cleanPhonePatch(cfg, { passcode: '123' }).error || ''));
check("can't switch on without a Tailscale address", /No Tailscale address/.test(cleanPhonePatch({ ...cfg, remote: { passcode: '12345678', hosts: [] } }, { enabled: true }).error || ''));
const ok = cleanPhonePatch({ ...cfg, remote: { passcode: '12345678', hosts: [] } }, { enabled: true, hosts: ['100.101.2.3', 'example.com'] });
check('switching on keeps only Tailscale addresses', ok.remote?.enabled === true && ok.remote.hosts.length === 1 && ok.remote.hosts[0] === '100.101.2.3:7777');
check('Settings never sees the passcode, only that one is set', !('passcode' in phoneView({ port: 7777, remote: { passcode: '12345678' } })) && phoneView({ port: 7777, remote: { passcode: '12345678' } }).passcodeSet === true);

// Saved in config.json, never in settings.json.
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-phone-'));
const file = path.join(dir, 'config.json');
fs.writeFileSync(file, JSON.stringify({ port: 7777, remote: { enabled: false, passcode: '', hosts: [], bindAddress: '0.0.0.0' }, other: 1 }));
const c = { configFile: file, remote: {} };
saveRemote(c, ok.remote);
const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
check('saved to config.json, other keys untouched', raw.remote.enabled === true && raw.remote.passcode === '12345678' && raw.other === 1 && raw.remote.bindAddress === '0.0.0.0');
const c2 = { remote: { enabled: false } };
mergeSettings(c2, { remote: { enabled: true, passcode: 'x', hosts: ['a:1'] } });
check('settings.json still cannot turn phone access on', c2.remote.enabled === false);
fs.rmSync(dir, { recursive: true, force: true });

check('a Mac finds tailscale inside the Tailscale app', tailscaleExe('darwin', (f) => f.startsWith('/Applications/Tailscale.app')) === '/Applications/Tailscale.app/Contents/MacOS/Tailscale');
check('a Mac with Homebrew\'s tailscale finds that', tailscaleExe('darwin', (f) => f === '/opt/homebrew/bin/tailscale') === '/opt/homebrew/bin/tailscale');
check('Windows uses the installer folder', /Program Files\\Tailscale\\tailscale\.exe$/.test(tailscaleExe('win32')));
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
