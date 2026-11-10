// 1.5.94 "Let my other replicant matrices in" without manual steps: the firewall.
// Windows Defender Firewall blocks other machines from reaching Bob's port. With the owner's click, Bob adds one
// inbound rule: TCP on Bob's port, only from Tailscale's addresses (100.64.0.0/10). Windows asks once (the
// "Do you want to allow this app to make changes" prompt); nothing changes if the answer is No.
// The command goes to the elevated PowerShell inline (-EncodedCommand), never as a script file another program
// could swap. Mac: the macOS firewall (off unless you turned it on) asks about Bob by itself. Linux: Bob can't
// change the firewall (no admin), so he shows the one line to run if ufw or firewalld is on.
import { execFile } from 'node:child_process';
import { OS } from './platform.js';

export const RULE = 'Bob (Tailscale only)';
export const TAILSCALE_RANGE = '100.64.0.0/10';
export const CARD_PORT = 50052; // Bigger Bobs: a lent graphics card's gate (src/share-card.js RPC_PORT)
// The rule's two ports: Bob's own, and the lent card's gate. From Tailscale, plus this machine's own home network
// (Windows' "LocalSubnet") when "Also over the home network" is on.
const ports = (p) => `${p},${CARD_PORT}`;
const from = (home) => (home ? `${TAILSCALE_RANGE},LocalSubnet` : TAILSCALE_RANGE);
// Put at the start of the description of a block rule Bob switched off, so Remove can switch exactly those back on.
export const MARK = '[Switched off by Bob] ';

const ps = (s) => `'${String(s).replace(/'/g, "''")}'`;
// The commands run as admin: replace Bob's rule (so a changed port is picked up), and lift the block rules
// Windows made for Bob's own program if its "allow this app" prompt was once answered with Cancel. Those are only
// switched off (marked with MARK), never deleted, and Remove switches them back on.
export function ruleScript(port, exe = '', { home = false } = {}) {
  const p = Number(port);
  if (!Number.isInteger(p) || p < 1 || p > 65535) throw new Error('That isn\'t a port number.');
  const lines = [
    `Get-NetFirewallRule -DisplayName ${ps(RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    `New-NetFirewallRule -DisplayName ${ps(RULE)} -Description ${ps(`Added by Bob when you pressed "${home ? 'Let Tailscale and the home network through the firewall' : 'Let Tailscale through the firewall'}". Lets your other replicant matrices reach Bob over Tailscale${home ? ' and this home network' : ' only'}.`)} -Direction Inbound -Action Allow -Protocol TCP -LocalPort ${ports(p)} -RemoteAddress ${from(home)} -Profile Any | Out-Null`
  ];
  if (exe) lines.push(`Get-NetFirewallApplicationFilter -Program ${ps(exe)} -ErrorAction SilentlyContinue | Get-NetFirewallRule | Where-Object { $_.Direction -eq 'Inbound' -and $_.Action -eq 'Block' -and $_.Enabled -eq 'True' } | ForEach-Object { Set-NetFirewallRule -Name $_.Name -Enabled False -Description (${ps(MARK)} + $_.Description) }`);
  return lines.join('; ');
}
// Remove Bob's rule and switch back on the block rules Bob switched off (they carry MARK at the start of their description).
export function removeScript() {
  return [
    `Get-NetFirewallRule -DisplayName ${ps(RULE)} -ErrorAction SilentlyContinue | Remove-NetFirewallRule`,
    `Get-NetFirewallRule -Direction Inbound -Action Block -ErrorAction SilentlyContinue | Where-Object { $_.Description -like ${ps(MARK + '*')} } | ForEach-Object { Set-NetFirewallRule -Name $_.Name -Enabled True -Description $_.Description.Substring(${MARK.length}) }`
  ].join('; ');
}
export const encode = (script) => Buffer.from(script, 'utf16le').toString('base64');

function runFile(file, args, opts = {}) {
  return new Promise((resolve) => execFile(file, args, { windowsHide: true, timeout: 120000, maxBuffer: 1e6, ...opts }, (err, out, errOut) => resolve({ ok: !err, out: String(out || ''), err: String(errOut || err?.message || '') })));
}

// Is Bob's rule there? Reading the rules needs no admin.
export async function firewallState(port, { os_ = OS, run = runFile, home = false } = {}) {
  if (os_ === 'mac') return { os: 'mac', canAdd: false, note: 'mac' };
  if (os_ === 'linux') {
    const ufw = await run('systemctl', ['is-active', '--quiet', 'ufw']);
    const fwd = await run('systemctl', ['is-active', '--quiet', 'firewalld']);
    const which = ufw.ok ? 'ufw' : fwd.ok ? 'firewalld' : '';
    return { os: 'linux', canAdd: false, firewall: which,
      line: which === 'ufw' ? `sudo ufw allow in on tailscale0 to any port ${Number(port)},${CARD_PORT} proto tcp${home ? ` && sudo ufw allow from <your home network, like 192.168.x.0/24> to any port ${Number(port)},${CARD_PORT} proto tcp` : ''}`
        : which === 'firewalld' ? `${[Number(port), CARD_PORT].map((q) => `sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="${TAILSCALE_RANGE}" port port="${q}" protocol="tcp" accept'`).join(' && ')} && sudo firewall-cmd --reload` : '' };
  }
  const r = await run('netsh', ['advfirewall', 'firewall', 'show', 'rule', `name=${RULE}`, 'verbose']);
  const has = (q) => new RegExp(`\\b${q}\\b`).test(r.out); // the labels are in Windows' own language, the ports aren't
  const here = r.ok && has(Number(port));
  // An older rule (Bob's port only), or one without the home network when that's on: offered again, to bring it up to date.
  const behind = here && (!has(CARD_PORT) || (home && !/LocalSubnet/i.test(r.out)));
  return { os: 'win', canAdd: true, ruleHere: here && !behind, behind, otherPort: r.ok && !here };
}

// Add (or remove) the rule as admin. Windows shows its prompt; resolves { ok, why }.
export async function changeRule(port, { add = true, exe = '', run = runFile, os_ = OS, home = false } = {}) {
  if (os_ !== 'win') return { ok: false, why: 'Only Windows needs this from me.' };
  const inner = encode(add ? ruleScript(port, exe, { home }) : removeScript());
  const outer = `$p = Start-Process -FilePath powershell.exe -Verb RunAs -Wait -PassThru -WindowStyle Hidden -ArgumentList '-NoProfile','-NonInteractive','-EncodedCommand','${inner}'; exit $p.ExitCode`;
  const r = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', outer]);
  if (!r.ok && /cancel/i.test(r.err)) return { ok: false, why: 'Windows asked, and the answer was No, so nothing changed.' };
  const st = await firewallState(port, { os_, run, home });
  if (add && !st.ruleHere) return { ok: false, why: `Windows didn't add the rule${r.err ? ` (${r.err.trim().slice(0, 160)})` : ''}.` };
  if (!add && st.ruleHere) return { ok: false, why: 'Windows didn\'t remove the rule.' };
  return { ok: true };
}
