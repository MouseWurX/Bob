// 1.5.94 "Let my other replicant matrices in" with no manual steps: Bob listens on Tailscale without a restart, and
// on Windows offers one firewall rule (one Windows prompt), scoped to Tailscale addresses and Bob's port.
import fs from 'node:fs';
import { RULE, TAILSCALE_RANGE, MARK, ruleScript, removeScript, encode, firewallState, changeRule } from '../src/firewall.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---------- The rule itself ----------
{
  const s = ruleScript(7777);
  check('the rule is inbound TCP on Bob\'s port only', /-Direction Inbound -Action Allow -Protocol TCP -LocalPort 7777 /.test(s));
  check('only Tailscale addresses get in', s.includes(`-RemoteAddress ${TAILSCALE_RANGE}`) && TAILSCALE_RANGE === '100.64.0.0/10');
  check('an old Bob rule is replaced, not doubled', s.indexOf('Remove-NetFirewallRule') < s.indexOf('New-NetFirewallRule'));
  check('no exe: no block rules touched', !s.includes('Disable-NetFirewallRule'));
  const w = ruleScript(7777, "C:\\Users\\you\\o'k Bob\\Bob.exe");
  check('with Bob.exe: only its inbound Block rules are switched off (never deleted)', /Direction -eq 'Inbound' -and \$_.Action -eq 'Block' -and \$_.Enabled -eq 'True' \} \| ForEach-Object \{ Set-NetFirewallRule -Name \$_.Name -Enabled False/.test(w) && !/Remove-NetFirewallRule[^;]*Program/.test(w));
  check('quotes in a path are escaped for PowerShell', w.includes("'C:\\Users\\you\\o''k Bob\\Bob.exe'"));
  let threw = 0; for (const p of [0, 70000, '7777; calc', 1.5]) try { ruleScript(p); } catch { threw++; }
  check('anything but a port number is refused', threw === 4);
  const rs = removeScript();
  check('remove takes Bob\'s rule away', rs.startsWith(`Get-NetFirewallRule -DisplayName '${RULE}' -ErrorAction SilentlyContinue | Remove-NetFirewallRule`));
  check('switched-off block rules are marked, so Remove can find exactly those', w.includes(`-Enabled False -Description ('${MARK}' + $_.Description)`));
  check('Remove switches the marked block rules back on and drops the mark', rs.includes(`$_.Description -like '${MARK}*'`) && rs.includes(`-Enabled True -Description $_.Description.Substring(${MARK.length})`));
  check('block rules already off are left alone', w.includes("$_.Enabled -eq 'True'"));
  check('encoded as UTF-16LE base64 (PowerShell -EncodedCommand)', Buffer.from(encode('hé'), 'base64').toString('utf16le') === 'hé');
}

// ---------- Reading the state (no admin) ----------
{
  const fake = (out, ok = true) => async () => ({ ok, out, err: '' });
  let st = await firewallState(7777, { os_: 'win', run: fake(`Rule Name: ${RULE}\nLocalPort: 7777\n`) });
  check('Windows: rule found by its port (labels are localized)', st.ruleHere === true && st.canAdd === true);
  st = await firewallState(7777, { os_: 'win', run: fake('No rules match the specified criteria.', false) });
  check('Windows: no rule', st.ruleHere === false && st.otherPort === false);
  st = await firewallState(7777, { os_: 'win', run: fake('Regelname: x\nLokaler Port: 8888\n') });
  check('Windows: a rule for another port counts as missing', st.ruleHere === false && st.otherPort === true);
  st = await firewallState(7777, { os_: 'linux', run: async (f, a) => ({ ok: a.includes('ufw'), out: '' }) });
  check('Linux with ufw: the one line to run', st.line === 'sudo ufw allow in on tailscale0 to any port 7777 proto tcp' && !st.canAdd);
  st = await firewallState(7777, { os_: 'linux', run: async (f, a) => ({ ok: a.includes('firewalld'), out: '' }) });
  check('Linux with firewalld: the one line to run', st.line === `sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="100.64.0.0/10" port port="7777" protocol="tcp" accept' && sudo firewall-cmd --reload` && !/trusted/.test(st.line));
  st = await firewallState(7777, { os_: 'linux', run: async () => ({ ok: false, out: '' }) });
  check('Linux, no firewall on: nothing to do', st.line === '');
  st = await firewallState(7777, { os_: 'mac' });
  check('Mac: macOS asks by itself', st.os === 'mac' && !st.canAdd);
}

// ---------- Changing it (Windows prompt) ----------
{
  const calls = [];
  let ruleThere = false;
  const run = async (file, args) => {
    calls.push([file, args]);
    if (file === 'powershell.exe') { ruleThere = true; return { ok: true, out: '', err: '' }; }
    return { ok: true, out: ruleThere ? 'LocalPort: 7777' : 'nothing', err: '' };
  };
  const r = await changeRule(7777, { add: true, exe: 'C:\\Bob\\Bob.exe', os_: 'win', run });
  const ps = calls.find((c) => c[0] === 'powershell.exe');
  check('adding works and is checked again afterwards', r.ok === true && calls.at(-1)[0] === 'netsh');
  check('one elevation, via RunAs', /Start-Process -FilePath powershell\.exe -Verb RunAs -Wait -PassThru/.test(ps[1].at(-1)));
  check('the admin command goes inline, encoded, never as a file', /'-EncodedCommand','[A-Za-z0-9+/=]+'/.test(ps[1].at(-1)) && !/\.ps1/.test(ps[1].at(-1)));
  const inner = /'-EncodedCommand','([^']+)'/.exec(ps[1].at(-1))[1];
  check('the encoded command is exactly the rule', Buffer.from(inner, 'base64').toString('utf16le') === ruleScript(7777, 'C:\\Bob\\Bob.exe'));
  const no = await changeRule(7777, { os_: 'win', run: async () => ({ ok: false, out: '', err: 'This operation was canceled by the user.' }) });
  check('No on the Windows prompt: nothing changed, said plainly', !no.ok && /answer was No/.test(no.why));
  const fails = await changeRule(7777, { os_: 'win', run: async (f) => ({ ok: f !== 'powershell.exe', out: 'nothing', err: f === 'powershell.exe' ? 'Access denied' : '' }) });
  check('a failed add says so', !fails.ok && /didn't add the rule \(Access denied\)/.test(fails.why));
  const rm = await changeRule(7777, { add: false, os_: 'win', run: async () => ({ ok: true, out: 'nothing', err: '' }) });
  check('removing works', rm.ok === true);
  const mac = await changeRule(7777, { os_: 'mac', run: async () => { throw new Error('must not run'); } });
  check('Mac/Linux: nothing is run', !mac.ok);
}

// ---------- Wiring ----------
{
  const srv = read('src/server.js');
  check('server: firewall route exists', /\/api\/phone-access\/firewall/.test(srv));
  const route = srv.slice(srv.indexOf("'/api/phone-access/firewall'"), srv.indexOf("'/api/phone-access/firewall'") + 600);
  check('server: firewall route is for this replicant matrix only (not from a phone)', /isRemote|local/i.test(route));
  check('server: listens on Tailscale live (no restart)', /function applyRemote/.test(srv) && /function tailscaleIps/.test(srv) && /setInterval\([^)]*applyRemote|applyRemote[\s\S]{0,80}60\s*\*?\s*1000|60000/.test(srv));
  check('server: saving says no restart', /restart:\s*false/.test(srv));
  const ui = read('public/phone-access.js');
  check('Settings: the button names match Help', ui.includes('Let Tailscale through the firewall') && ui.includes('Remove the firewall rule'));
  check('Settings: no "restart me" after turning it on', !/Restart me after/i.test(ui) || /r\.restart/.test(ui));
  const help = read('public/help-content.js');
  check('Help: no restart line any more', !help.includes('Restart me after changing it.'));
  check('Help and Settings say block rules are switched off, and back on by Remove', help.includes('switches those') && ui.includes('switches off any rule that blocks Bob\'s own program'));
  check('Help: the button and FAQ', help.includes('Let Tailscale through the firewall') && help.includes("id: 'faq-firewall'"));
  check('phone app: points at the firewall button', read('android/app/src/main/assets/www/phone.js').includes('Let Tailscale through the firewall'));
}

console.log(`\nFirewall: ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
