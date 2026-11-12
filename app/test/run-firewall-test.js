// 1.5.94 "Let my other replicant matrices in" with no manual steps: Bob listens on Tailscale without a restart, and
// on Windows offers one firewall rule (one Windows prompt), scoped to Tailscale addresses and Bob's port.
import fs from 'node:fs';
import { RULE, TAILSCALE_RANGE, CARD_PORT, MARK, ruleScript, removeScript, encode, firewallState, changeRule, firewallHome, firewallUdp } from '../src/firewall.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ---------- SCUT: the lent card's gate on UDP too ----------
{
  const fake = (out, ok = true) => async () => ({ ok, out, err: '' });
  // 1.5.208 (the replicant matrix test): the rule only opened TCP 7777 and 50052, and SCUT needs UDP 50052 too.
  {
    // 1.5.209 (the Go): Windows' own "bob.exe" program rule, UDP, came back in the same answer; only Bob's rule counts.
    const dash = '-'.repeat(70);
    const out = `\r\nRule Name:                            ${RULE}\r\n${dash}\r\nEnabled:                              Yes\r\nLocalPort:                            7777,50052\r\nRemoteIP:                             100.64.0.0/255.192.0.0,LocalSubnet\r\nProtocol:                             TCP\r\n\r\nRule Name:                            bob.exe\r\n${dash}\r\nEnabled:                              Yes\r\nLocalPort:                            Any\r\nProtocol:                             UDP\r\nProgram:                              C:\\Bob\\bob.exe\r\nOk.\r\n`;
    const go = await firewallState(7777, { os_: 'win', home: true, run: fake(out) });
    check("another rule's UDP (Windows' bob.exe rule) doesn't make Bob's TCP-only rule current: Bring up to date shows", go.behind === true && go.ruleHere === false, JSON.stringify(go));
    const both = out.replace('Ok.', `\r\nRule Name:                            ${RULE}\r\n${dash}\r\nLocalPort:                            50052\r\nRemoteIP:                             100.64.0.0/255.192.0.0,LocalSubnet\r\nProtocol:                             UDP\r\nOk.`);
    const ok2 = await firewallState(7777, { os_: 'win', home: true, run: fake(both) });
    check("…and with Bob's own UDP half on 50052, it's current", ok2.ruleHere === true && ok2.behind === false, JSON.stringify(ok2));
    const other = await firewallState(7777, { os_: 'win', run: fake(`\r\nRule Name:                            bob.exe\r\n${dash}\r\nLocalPort:                            7777\r\nProtocol:                             UDP\r\n`) });
    check('a rule with another name on the same port is not Bob\'s rule', other.ruleHere === false && other.behind === false);
  }
  check('the rule always has the UDP half for the card port (SCUT), whatever the switches', /-Protocol UDP -LocalPort 50052/.test(ruleScript(7777)) && firewallUdp({}) && firewallUdp({ share: { lendCard: true } }) && firewallUdp({ share: { scut: true } }));
  check('…only for the card port: Bob\'s own port stays TCP', !/-Protocol UDP -LocalPort 7777/.test(ruleScript(7777)));
  {
    const old = await firewallState(7777, { os_: 'win', run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nProtocol: TCP\n`) });
    check('a TCP-only rule (made before) is behind with no switches on: Bring up to date shows', old.behind === true && old.ruleHere === false, JSON.stringify(old));
  }
  const u = ruleScript(7777, '', { udp: true });
  check('SCUT on with a lent card: a UDP half for the card port only, under the same name (Remove takes both)', firewallUdp({ share: { lendCard: true, scut: true } }) && /-Protocol UDP -LocalPort 50052 -RemoteAddress 100\.64\.0\.0\/10 /.test(u) && (u.match(new RegExp(`-DisplayName '${RULE.replace(/[()]/g, '\\$&')}'`, 'g')) || []).length === 3);
  let st = await firewallState(7777, { os_: 'win', udp: true, run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nProtocol: TCP\n`) });
  check('SCUT on, the rule without UDP is offered again', st.behind && !st.ruleHere);
  st = await firewallState(7777, { os_: 'win', udp: true, run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nProtocol: TCP\nRule Name: ${RULE}\nLocalPort: 50052\nProtocol: UDP\n`) });
  check('...and with it, the rule is there', st.ruleHere && !st.behind);
  st = await firewallState(7777, { os_: 'linux', udp: true, run: async (f, a) => ({ ok: a.includes('ufw'), out: '', err: '' }) });
  check('Linux with ufw: the line to run adds UDP for the card port', /50052 proto udp/.test(st.line));
}

// ---------- The rule itself ----------
{
  const s = ruleScript(7777);
  check('the rule is inbound TCP on Bob\'s port and the lent card\'s gate only', /-Direction Inbound -Action Allow -Protocol TCP -LocalPort 7777,50052 /.test(s) && CARD_PORT === 50052);
  check('the home network is let in only when that switch is on', !s.includes('LocalSubnet') && ruleScript(7777, '', { home: true }).includes(`-RemoteAddress ${TAILSCALE_RANGE},LocalSubnet `));
  check('only Tailscale addresses get in', s.includes(`-RemoteAddress ${TAILSCALE_RANGE} `) && TAILSCALE_RANGE === '100.64.0.0/10');
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
  let st = await firewallState(7777, { os_: 'win', run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nProtocol: TCP\nRule Name: ${RULE}\nLocalPort: 50052\nProtocol: UDP\n`) });
  check('Windows: rule found by its ports (labels are localized)', st.ruleHere === true && st.canAdd === true);
  st = await firewallState(7777, { os_: 'win', run: fake(`Rule Name: ${RULE}\nLocalPort: 7777\n`) });
  check('Windows: an older rule without the card\'s port is offered again', st.ruleHere === false && st.behind === true);
  st = await firewallState(7777, { os_: 'win', home: true, run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nRemoteIP: 100.64.0.0/255.192.0.0\n`) });
  check('Windows: with the home network on, a rule without it is offered again', st.behind === true);
  st = await firewallState(7777, { os_: 'win', home: true, run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nRemoteIP: 100.64.0.0/255.192.0.0,LocalSubnet\nProtocol: TCP\nRule Name: ${RULE}\nLocalPort: 50052\nProtocol: UDP\n`) });
  check('Windows: with the home network in the rule, all set', st.ruleHere === true);
  check('the home network counts for phone access ("Also over the home network")', firewallHome({}, true) === true && firewallHome({}, false) === false);
  check('a lent card with "Use the home network first" needs the home network in the rule too', firewallHome({ share: { lendCard: true } }) === true && firewallHome({ share: { lendCard: true, homeNet: true } }) === true);
  check('...but not with that switched off, or with no card lent', firewallHome({ share: { lendCard: true, homeNet: false } }) === false && firewallHome({ share: { lendCard: false } }) === false);
  st = await firewallState(7777, { os_: 'win', home: firewallHome({ share: { lendCard: true } }), run: fake(`Rule Name: ${RULE}\nLocalPort: 7777,50052\nRemoteIP: 100.64.0.0/255.192.0.0\n`) });
  check('Bigger Bobs lending over the home network: a Tailscale-only rule is offered again (the Go saw no button)', st.behind === true && st.ruleHere === false && st.home === true);
  st = await firewallState(7777, { os_: 'win', run: fake('No rules match the specified criteria.', false) });
  check('Windows: no rule', st.ruleHere === false && st.otherPort === false);
  st = await firewallState(7777, { os_: 'win', run: fake('Regelname: x\nLokaler Port: 8888\n') });
  check('Windows: a rule for another port counts as missing', st.ruleHere === false && st.otherPort === true);
  st = await firewallState(7777, { os_: 'linux', run: async (f, a) => ({ ok: a.includes('ufw'), out: '' }) });
  check('Linux with ufw: the one line to run', st.line === 'sudo ufw allow in on tailscale0 to any port 7777,50052 proto tcp && sudo ufw allow in on tailscale0 to any port 50052 proto udp' && !st.canAdd);
  st = await firewallState(7777, { os_: 'linux', run: async (f, a) => ({ ok: a.includes('firewalld'), out: '' }) });
  check('Linux with firewalld: the one line to run', st.line === `sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="100.64.0.0/10" port port="7777" protocol="tcp" accept' && sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="100.64.0.0/10" port port="50052" protocol="tcp" accept' && sudo firewall-cmd --permanent --add-rich-rule='rule family="ipv4" source address="100.64.0.0/10" port port="50052" protocol="udp" accept' && sudo firewall-cmd --reload` && !/trusted/.test(st.line));
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
    return { ok: true, out: ruleThere ? 'LocalPort: 7777,50052\nProtocol: TCP\nLocalPort: 50052\nProtocol: UDP' : 'nothing', err: '' };
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
