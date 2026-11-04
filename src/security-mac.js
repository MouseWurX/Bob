// The Mac side of the "Security and privacy" Hand: read-only checks with the programs macOS ships. Each command is
// fixed text with no words from the chat in it. Nothing here changes a setting; Bob explains where the user does that.
//   overview  firewall, FileVault (disk encryption), Gatekeeper (only trusted apps open), System Integrity Protection
//   startup   what starts at login or with the Mac (launch agents and daemons, read from their .plist files)
//   network   programs listening for connections (lsof)
//   threats   macOS's own malware checker (XProtect) keeps no history Bob can read, so he says where to look
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';

// Runs one fixed command and gives back its output (stdout and stderr together), or '' if it couldn't run.
export function runFixed(file, args, { timeoutMs = 20_000, execImpl = execFile } = {}) {
  return new Promise((resolve) => {
    try {
      execImpl(file, args, { timeout: timeoutMs, maxBuffer: 4 << 20 }, (err, out, errOut) => resolve(`${out || ''}${errOut || ''}`));
    } catch { resolve(''); }
  });
}

// ---------------------------------------------------------------- overview

export async function readOverview(run = runFixed) {
  const [fw, stealth, fv, gk, sip, auto] = await Promise.all([
    run('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getglobalstate']),
    run('/usr/libexec/ApplicationFirewall/socketfilterfw', ['--getstealthmode']),
    run('/usr/bin/fdesetup', ['status']),
    run('/usr/sbin/spctl', ['--status']),
    run('/usr/bin/csrutil', ['status']),
    run('/usr/bin/defaults', ['read', '/Library/Preferences/com.apple.SoftwareUpdate', 'AutomaticallyInstallMacOSUpdates'])
  ]);
  const word = (s, on, offRe) => (!s.trim() ? null : offRe.test(s) ? false : on.test(s) ? true : null);
  return {
    firewall: word(fw, /enabled|State = [12]/i, /disabled|State = 0/i),
    stealth: word(stealth, /\bon\b|enabled/i, /\boff\b|disabled/i),
    fileVault: word(fv, /FileVault is On/i, /FileVault is Off/i),
    gatekeeper: word(gk, /assessments enabled/i, /assessments disabled/i),
    sip: word(sip, /status: enabled/i, /status: disabled/i),
    autoUpdates: auto.trim() === '1' ? true : auto.trim() === '0' ? false : null,
    macos: os.release()
  };
}

export function sayMacOverview(o = {}) {
  const l = [];
  const unk = (what) => `ℹ I couldn't read ${what}.`;
  l.push(o.firewall === true ? '✓ The macOS firewall is on.' : o.firewall === false ? '⚠ The macOS firewall is OFF. Turn it on in System Settings > Network > Firewall.' : unk('the firewall setting'));
  if (o.firewall && o.stealth === false) l.push('ℹ Stealth mode is off (the Mac answers "pings" on the network). Fine at home; on public Wi-Fi you can turn it on in Firewall > Options.');
  l.push(o.fileVault === true ? '✓ FileVault is on: the disk is encrypted, so a lost or stolen Mac doesn\'t give away your files.' : o.fileVault === false ? '⚠ FileVault is OFF: anyone with the Mac in hand could read the disk. Turn it on in System Settings > Privacy & Security > FileVault.' : unk('FileVault'));
  l.push(o.gatekeeper === true ? '✓ Gatekeeper is on: apps must be from the App Store or a known developer, or opened once on purpose with Open Anyway.' : o.gatekeeper === false ? '⚠ Gatekeeper is OFF, so any downloaded app opens without a check. Turn it back on (in Terminal: sudo spctl --master-enable), or ask someone you trust to.' : unk('Gatekeeper'));
  l.push(o.sip === true ? '✓ System Integrity Protection is on (macOS\'s own files can\'t be changed, even by admin programs).' : o.sip === false ? '⚠ System Integrity Protection is OFF. That is only meant for developers; it\'s switched back on from Recovery mode (csrutil enable).' : unk('System Integrity Protection'));
  if (o.autoUpdates === false) l.push('⚠ macOS updates don\'t install by themselves. Check System Settings > General > Software Update > Automatic updates.');
  else if (o.autoUpdates === true) l.push('✓ macOS installs its updates by itself.');
  l.push('ℹ macOS checks apps and downloads for known malware itself (XProtect), with no switch to turn off.');
  return l.join('\n');
}

// ---------------------------------------------------------------- startup items

export const STARTUP_DIRS = (home = os.homedir()) => [
  { dir: path.join(home, 'Library', 'LaunchAgents'), where: 'starts when you log in (your user)' },
  { dir: '/Library/LaunchAgents', where: 'starts when anyone logs in' },
  { dir: '/Library/LaunchDaemons', where: 'starts with the Mac, before anyone logs in' }
];

// One .plist: { label, command, runAtLoad, keepAlive } (plutil turns it into JSON, which also reads binary plists).
async function readPlist(file, run) {
  const out = await run('/usr/bin/plutil', ['-convert', 'json', '-o', '-', file]);
  try {
    const j = JSON.parse(out.slice(out.indexOf('{')));
    const args = Array.isArray(j.ProgramArguments) ? j.ProgramArguments : [];
    return { label: String(j.Label || path.basename(file, '.plist')), program: String(j.Program || args[0] || ''), command: [j.Program, ...args].filter(Boolean).join(' '), runAtLoad: j.RunAtLoad === true, keepAlive: Boolean(j.KeepAlive), disabled: j.Disabled === true };
  } catch { return null; }
}

export async function readStartup(run = runFixed, { home = os.homedir(), dirs = STARTUP_DIRS(home) } = {}) {
  const items = [];
  for (const { dir, where } of dirs) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.plist')).slice(0, 200); } catch { continue; }
    for (const n of names) {
      const p = await readPlist(path.join(dir, n), run);
      if (!p) continue;
      items.push({ ...p, where, file: path.join(dir, n), exists: p.program ? fs.existsSync(p.program) : null });
    }
  }
  return { items };
}

const MAC_USER_PLACES = /\/(Users\/[^/]+\/(Downloads|Desktop|Library\/Caches)|tmp|private\/tmp|private\/var\/folders|var\/folders)\//i;
const MAC_SCRIPT_HOSTS = /\b(bash|zsh|sh|osascript|python3?|perl|ruby|curl|nc)\b/;
export function judgeMacStartup(i) {
  const why = [];
  let level = 0;
  const cmd = String(i.command || '');
  if (i.program && i.exists === false) { why.push('the program it points to is missing (left behind by something uninstalled, usually harmless)'); level = 1; }
  if (MAC_USER_PLACES.test(i.program || '')) { why.push('runs from Downloads, the Desktop, a cache or a temporary folder, where malware likes to hide'); level = Math.max(level, 2); }
  if (/^\./.test(path.basename(i.program || '')) || /\/\.[^/]+\//.test(i.program || '')) { why.push('the program is in a hidden folder or has a hidden name'); level = Math.max(level, 2); }
  if (MAC_SCRIPT_HOSTS.test(path.basename((i.program || '').split(' ')[0]))) { why.push('starts through a script or shell rather than an app'); level = Math.max(level, 1); }
  if (/base64\s+(-d|--decode)|\beval\b/i.test(cmd)) { why.push('hides its command in scrambled (Base64) text'); level = 3; }
  if (/https?:\/\//i.test(cmd) && /\b(curl|wget|bash|sh|python3?|osascript)\b/.test(cmd)) { why.push('fetches something from the internet when it starts'); level = 3; }
  if (!/^(com\.apple\.|com\.microsoft\.|com\.google\.|com\.adobe\.|org\.mozilla\.)/.test(i.label) && level === 0) why.push('not from Apple; fine if you know the app it belongs to');
  return { level, mark: ['✓', 'ℹ', '⚠', '⛔'][level], why };
}

export function sayMacStartup(r = {}) {
  const items = (r.items || []).map((i) => ({ ...i, j: judgeMacStartup(i) })).sort((a, b) => b.j.level - a.j.level);
  if (!items.length) return 'Nothing extra starts at login or with the Mac (besides macOS itself).';
  const lines = items.map((i) => `${i.j.mark} ${i.label}${i.disabled ? ' (switched off)' : ''}: ${i.where}. ${i.j.why.length ? `Note: ${i.j.why.join('; ')}.` : 'Looks normal.'}\n   ${String(i.command).slice(0, 220)}`);
  const worry = items.filter((i) => i.j.level >= 2).length;
  return `${items.length} things start by themselves${worry ? `, and ${worry} deserve a closer look` : ''}:\n${lines.join('\n')}\n\nApps you added yourself are in System Settings > General > Login Items & Extensions, which is also where you switch them off. Bob only looks; he doesn't switch these off.`;
}

// ---------------------------------------------------------------- network

// lsof -nP -iTCP -sTCP:LISTEN: "COMMAND PID USER FD TYPE DEVICE SIZE/OFF NODE NAME", NAME like *:7777 or 127.0.0.1:11434.
export function parseLsof(text = '') {
  const listen = [];
  for (const line of String(text).split('\n').slice(1)) {
    const c = line.trim().split(/\s+/);
    if (c.length < 9) continue;
    const name = c.slice(8).join(' ').replace(/\s*\(LISTEN\)$/, '');
    const m = name.match(/^(.*):(\d+)$/);
    if (!m) continue;
    const addr = m[1] === '*' ? '0.0.0.0' : m[1].replace(/^\[|\]$/g, '');
    listen.push({ proc: c[0].replace(/\\x20/g, ' '), pid: Number(c[1]), addr, port: Number(m[2]) });
  }
  return { listen };
}

export async function readNetwork(run = runFixed) {
  return parseLsof(await run('/usr/sbin/lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']));
}

const MAC_PORTS = { 7777: 'Bob himself', 11434: 'Ollama (Bob\'s engine)', 5000: 'AirPlay Receiver (normal on a Mac)', 7000: 'AirPlay Receiver (normal on a Mac)', 22: 'Remote Login (SSH): lets people sign in from the network', 5900: 'Screen Sharing: remote control of this Mac', 3283: 'Apple Remote Desktop', 445: 'File Sharing (SMB)', 548: 'File Sharing (AFP, old style)', 3000: 'a local web app', 8188: 'ComfyUI' };
export function sayMacNetwork(r = {}) {
  const rows = (r.listen || []).filter((x, i, a) => a.findIndex((y) => y.port === x.port && y.addr === x.addr) === i);
  const open = rows.filter((x) => /^(0\.0\.0\.0|::|\*)$/.test(x.addr));
  const local = rows.filter((x) => /^(127\.|::1|localhost)/.test(x.addr));
  const say = (x) => `${x.port} ${x.proc || 'pid ' + x.pid}${MAC_PORTS[x.port] ? ` (${MAC_PORTS[x.port]})` : ''}`;
  const risky = open.filter((x) => [22, 5900, 3283, 23, 21].includes(x.port));
  return `${open.length} listening to other replicant matrices on your network (the firewall still decides who gets in): ${open.map(say).join(', ') || 'none'}.\n${local.length} only reachable from this Mac: ${local.map(say).join(', ') || 'none'}.${risky.length ? `\n⚠ Remote sign-in or screen sharing is open: ${risky.map(say).join(', ')}. If you don't use it, switch it off in System Settings > General > Sharing.` : ''}\nOnly programs you recognise should be on the first list.`;
}

// ---------------------------------------------------------------- threats

export const MAC_THREATS = 'macOS checks apps and downloads for known malware by itself (XProtect) and removes what it finds, but it keeps no history I can read. If macOS warned you about a file ("will damage your computer"), move it to the Bin and empty it. I can also look at a suspicious file for you without opening it (inspect_file).';

// One check, as words for Bob to pass on.
export async function macCheck(area, run = runFixed, opts = {}) {
  if (area === 'threats') return MAC_THREATS;
  if (area === 'startup') return sayMacStartup(await readStartup(run, opts));
  if (area === 'network') return sayMacNetwork(await readNetwork(run));
  return sayMacOverview(await readOverview(run));
}
