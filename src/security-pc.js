// The PC side of the "Security and privacy" Hand: read-only health checks (Windows Security / Defender, firewall,
// updates, what starts with Windows, what is listening on the network) and Defender scans.
// Every check is a fixed PowerShell script with no words from the chat in it; paths go in as environment values.
// Nothing here changes a setting. Bob never turns Defender off, adds exclusions, allows or restores a threat,
// or disables a startup item: he explains how the user does that themselves (the Run Hand's blocklist refuses
// antivirus commands too).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const WIN = process.platform === 'win32';

// PowerShell, or a stand-in for tests (BOB_POWERSHELL).
export function psExe(env = process.env) { return env.BOB_POWERSHELL || (WIN ? 'powershell.exe' : null); }

export function runPs(script, { env = process.env, extra = {}, signal, timeoutMs = 60_000 } = {}) {
  const exe = psExe(env);
  if (!exe) return Promise.reject(new Error('These checks need Windows (PowerShell).'));
  return new Promise((resolve, reject) => {
    const child = spawn(exe, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { env: { ...env, ...extra }, windowsHide: true });
    let out = '', err = '';
    const stop = () => { try { child.kill(); } catch {} };
    const timer = setTimeout(() => { stop(); reject(new Error('the check took too long and was stopped')); }, timeoutMs);
    signal?.addEventListener?.('abort', stop, { once: true });
    child.stdout.on('data', (d) => { out += d; if (out.length > 4e6) stop(); });
    child.stderr.on('data', (d) => { err += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', () => {
      clearTimeout(timer);
      if (signal?.aborted) return reject(new Error('stopped'));
      const s = out.trim();
      const at = s.search(/[[{]/);
      if (at < 0) return reject(new Error((err.trim().split('\n')[0] || 'no answer from Windows').slice(0, 200)));
      try { resolve(JSON.parse(s.slice(at))); } catch { reject(new Error('Windows gave an answer I could not read')); }
    });
  });
}

// ---------------------------------------------------------------- the scripts (fixed text, no user words)

const PS_HEAD = "$ErrorActionPreference='SilentlyContinue'; $ProgressPreference='SilentlyContinue'\nfunction D($d){ if($d){ try { ([datetime]$d).ToString('s') } catch { '' } } else { '' } }\n";

export const PS = {
  overview: PS_HEAD + `$o=@{}
$s=Get-MpComputerStatus
if($s){ $o.defender=@{on=[bool]$s.AntivirusEnabled; realtime=[bool]$s.RealTimeProtectionEnabled; service=[bool]$s.AMServiceEnabled; tamper=[bool]$s.IsTamperProtected; behavior=[bool]$s.BehaviorMonitorEnabled; sigAgeDays=[int]$s.AntivirusSignatureAge; sigUpdated=(D $s.AntivirusSignatureLastUpdated); quickScan=(D $s.QuickScanEndTime); fullScan=(D $s.FullScanEndTime); mode="$($s.AMRunningMode)"} }
$o.av=@(Get-CimInstance -Namespace root/SecurityCenter2 -ClassName AntivirusProduct | ForEach-Object { @{name="$($_.displayName)"; state=[int]$_.productState} })
$o.firewall=@(Get-NetFirewallProfile | ForEach-Object { @{name="$($_.Name)"; on=("$($_.Enabled)" -eq 'True')} })
try { $au=(New-Object -ComObject Microsoft.Update.AutoUpdate).Results; $o.lastUpdate=(D $au.LastInstallationSuccessDate) } catch {}
$h=Get-HotFix | Where-Object { $_.InstalledOn } | Sort-Object InstalledOn -Descending | Select-Object -First 1
if($h){ $o.lastHotfix=(D $h.InstalledOn) }
$o.uac=(Get-ItemProperty 'HKLM:\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Policies\\System').EnableLUA
$o | ConvertTo-Json -Depth 5 -Compress`,

  threats: PS_HEAD + `$t=@{}
Get-MpThreat | ForEach-Object { $t[[string]$_.ThreatID]=@{name="$($_.ThreatName)"; severity=[int]$_.SeverityID; active=[bool]$_.IsActive} }
$d=@(Get-MpThreatDetection | Sort-Object InitialDetectionTime -Descending | Select-Object -First 25 | ForEach-Object { $x=$t[[string]$_.ThreatID]; @{id=[string]$_.ThreatID; name="$($x.name)"; severity=[int]$x.severity; active=[bool]$x.active; when=(D $_.InitialDetectionTime); status=[int]$_.ThreatStatusID; ok=[bool]$_.ActionSuccess; files=@($_.Resources | Select-Object -First 3 | ForEach-Object { "$_" })} })
@{detections=$d; err="$($Error[0])"} | ConvertTo-Json -Depth 5 -Compress`,

  startup: PS_HEAD + `$items=New-Object System.Collections.ArrayList
$keys='HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\RunOnce','HKLM:\\Software\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Run'
foreach($k in $keys){ $p=Get-ItemProperty $k; if($p){ $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { [void]$items.Add(@{where=($k -replace 'HKCU:','Your account' -replace 'HKLM:','Everyone'); name="$($_.Name)"; command="$($_.Value)"}) } } }
$sh=New-Object -ComObject WScript.Shell
foreach($f in @([Environment]::GetFolderPath('Startup'),[Environment]::GetFolderPath('CommonStartup'))){ if($f){ Get-ChildItem -LiteralPath $f -File | Where-Object { $_.Name -ne 'desktop.ini' } | ForEach-Object { $c=$_.FullName; if($_.Extension -eq '.lnk'){ try { $l=$sh.CreateShortcut($_.FullName); $c="\`"$($l.TargetPath)\`" $($l.Arguments)" } catch {} }; [void]$items.Add(@{where='Startup folder'; name=$_.Name; command=$c}) } } }
Get-ScheduledTask | Where-Object { $_.State -ne 'Disabled' -and $_.TaskPath -notlike '\\Microsoft\\*' } | Select-Object -First 60 | ForEach-Object { $a=$_.Actions | Select-Object -First 1; [void]$items.Add(@{where="Task Scheduler $($_.TaskPath)"; name="$($_.TaskName)"; command=("$($a.Execute) $($a.Arguments)").Trim(); com="$($a.ClassId)"}) }
$off=@{}
foreach($k in 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\Run','HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder','HKLM:\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\StartupApproved\\StartupFolder'){ $p=Get-ItemProperty $k; if($p){ $p.PSObject.Properties | Where-Object { $_.Name -notlike 'PS*' } | ForEach-Object { if($_.Value -and ($_.Value[0] % 2) -eq 1){ $off[$_.Name]=1 } } } }
foreach($i in $items){
  $i.off=[bool]$off[$i.name]; $e=''
  if($i.command -match '^\\s*"([^"]+)"'){ $e=$matches[1] } else {
    $acc=''; foreach($t in ("$($i.command)".Trim() -split ' ')){ if($acc){ $acc+=' ' }; $acc+=$t; $x=[Environment]::ExpandEnvironmentVariables($acc); if($x -match '\\.(exe|com|bat|cmd|ps1|vbs|js|lnk)$' -and (Test-Path -LiteralPath $x)){ $e=$acc; break } }
    if(-not $e){ if($i.command -match '^\\s*([^\\s]+?\\.(exe|com|bat|cmd|ps1|vbs|js|lnk))'){ $e=$matches[1] } elseif($i.command -match '^\\s*([^\\s]+)'){ $e=$matches[1] } }
  }
  $e=[Environment]::ExpandEnvironmentVariables($e)
  if($e -and -not (Split-Path $e -IsAbsolute)){ $w=Get-Command $e -ErrorAction SilentlyContinue | Select-Object -First 1; if($w){ $e=$w.Source } }
  $i.exe=$e; $i.exists=[bool]($e -and (Test-Path -LiteralPath $e))
  if($i.exists){ $g=Get-AuthenticodeSignature -LiteralPath $e; $i.sig="$($g.Status)"; if($g.SignerCertificate){ $i.signer=($g.SignerCertificate.Subject -replace '^CN=("?)([^",]+).*','$2') } }
}
@{items=@($items)} | ConvertTo-Json -Depth 5 -Compress`,

  network: PS_HEAD + `$p=@{}; Get-Process | ForEach-Object { $p[[int]$_.Id]=$_.ProcessName }
@{listen=@(Get-NetTCPConnection -State Listen | ForEach-Object { @{addr="$($_.LocalAddress)"; port=[int]$_.LocalPort; pid=[int]$_.OwningProcess; proc="$($p[[int]$_.OwningProcess])"} })} | ConvertTo-Json -Depth 4 -Compress`,

  signature: PS_HEAD + `$g=Get-AuthenticodeSignature -LiteralPath $env:BOB_SRC
@{sig="$($g.Status)"; signer=$(if($g.SignerCertificate){ $g.SignerCertificate.Subject -replace '^CN=("?)([^",]+).*','$2' } else { '' })} | ConvertTo-Json -Compress`
};

// ---------------------------------------------------------------- reading the answers

const THREAT_STATUS = { 0: 'unknown', 1: 'found, nothing done yet', 2: 'cleaned', 3: 'quarantined (locked away, can\'t run)', 4: 'removed', 5: 'allowed by someone on this replicant matrix', 6: 'blocked', 102: 'quarantine FAILED', 103: 'removal FAILED', 104: 'allow failed', 105: 'abandoned', 107: 'block FAILED' };
const SEVERITY = { 0: 'unknown', 1: 'low', 2: 'moderate', 4: 'high', 5: 'severe' };

// Defender's names look like Type:Platform/Family.Variant!Suffix, e.g. Trojan:Win32/Wacatac.B!ml.
const TYPES = {
  trojan: 'a Trojan: a program pretending to be something harmless that does something bad behind your back',
  trojandownloader: 'a downloader: its job is to fetch more malware',
  trojandropper: 'a dropper: it carries other malware inside it and unpacks it',
  trojanspy: 'spyware: it watches what you do and sends it somewhere',
  pws: 'a password stealer: it goes after saved passwords and logins',
  backdoor: 'a backdoor: it lets someone control this replicant matrix from far away',
  ransom: 'ransomware: it locks or scrambles files and asks for money',
  worm: 'a worm: it spreads itself to other replicant matrices or drives',
  virus: 'a virus: it copies itself into other files',
  exploit: 'an exploit: code that abuses a bug to get in',
  hacktool: 'a hacking tool: not always malware (some admin and game-cheat tools land here), but worth knowing why it is there',
  pua: 'a potentially unwanted app: bundled junk, adware or a sneaky installer, not usually dangerous but rarely wanted',
  pup: 'a potentially unwanted app: bundled junk, adware or a sneaky installer',
  adware: 'adware: it shows ads or changes your browser',
  browsermodifier: 'something that changes your browser settings without asking',
  settingsmodifier: 'something that changes Windows or browser settings without asking',
  behavior: 'a behaviour alert: something DID something suspicious (Defender watched it act), rather than matching a known file',
  misleading: 'a misleading app: scareware or fake "PC cleaner" style warnings',
  joke: 'a joke program: annoying, not harmful',
  program: 'a program Defender thinks you may not want (often a tool that can be misused)',
  tool: 'a tool that can be misused',
  dos: 'a denial-of-service tool',
  monitoringtool: 'a monitoring tool: it records what someone does on this replicant matrix',
  remoteaccess: 'a remote-access tool: legitimate ones exist, but scammers use them too',
  spammer: 'a spam sender',
  virtool: 'a tool used to build or hide malware',
  phish: 'a phishing page or file: it tries to trick you into typing a password or card number',
  constructor: 'a malware construction kit',
  ddos: 'a denial-of-service tool',
  softwarebundler: 'a bundler: it installs extra programs alongside the one you wanted'
};
const SUFFIX = {
  ml: 'spotted by Defender\'s machine-learning guess, not a known-file match, so false alarms happen more often',
  cl: 'spotted with help from Microsoft\'s cloud',
  mtb: 'spotted from how it behaved',
  rfn: 'spotted by reputation (few people have this file)'
};

export function explainThreat(name) {
  const m = String(name || '').match(/^([A-Za-z]+):([A-Za-z0-9]+)\/([^.!]+)(?:\.([^!]+))?(?:!(\w+))?/);
  if (!m) return { name, plain: name ? 'a detection Defender names in its own way' : 'unknown' };
  const [, type, platform, family, variant, suffix] = m;
  const kind = TYPES[type.toLowerCase()] || `a "${type}" detection`;
  const where = /^win|^msil/i.test(platform) ? (platform.toLowerCase() === 'msil' ? 'a .NET program' : 'a Windows program') : /^js|^vbs|^html|^powershell|^bat|^python/i.test(platform) ? `a ${platform} script or page` : /^o97m|^x97m|^w97m/i.test(platform) ? 'an Office document with macros' : /^pdf/i.test(platform) ? 'a PDF' : /^andr/i.test(platform) ? 'an Android app' : /^linux/i.test(platform) ? 'a Linux program' : platform;
  return { name, type, platform, family, variant: variant || '', suffix: suffix || '', plain: `${kind}. It targets ${where}; the family name is "${family}"${suffix && SUFFIX[suffix.toLowerCase()] ? `; ${SUFFIX[suffix.toLowerCase()]}` : ''}.` };
}

const age = (iso, now = Date.now()) => { const t = Date.parse(iso); return Number.isFinite(t) ? Math.floor((now - t) / 86_400_000) : null; };
const ago = (d) => (d === null ? 'never (or unknown)' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);

// The overview, in plain words with ✓ / ⚠ marks.
export function sayOverview(o = {}, now = Date.now()) {
  const lines = [];
  const d = o.defender;
  const others = (o.av || []).filter((a) => !/defender/i.test(a.name));
  if (d) {
    lines.push(d.on && d.realtime ? '✓ Microsoft Defender antivirus is on, with real-time protection.' : d.on ? '⚠ Defender is on but REAL-TIME protection is off, so files aren\'t checked as they arrive.' : others.length ? `ℹ Defender is resting because another antivirus is in charge: ${others.map((a) => a.name).join(', ')}.` : '⚠ Defender antivirus is OFF and no other antivirus reports in.');
    if (d.sigAgeDays > 3) lines.push(`⚠ Its virus definitions are ${d.sigAgeDays} days old. Fresh ones come daily; I can fetch them (defender_scan with update).`);
    else if (d.on) lines.push(`✓ Virus definitions are fresh (updated ${ago(age(d.sigUpdated, now))}).`);
    if (d.on) lines.push(d.tamper ? '✓ Tamper protection is on (other programs can\'t switch Defender off).' : '⚠ Tamper protection is off: malware could switch Defender off. Turn it on in Windows Security > Virus & threat protection > Manage settings.');
    if (d.on) lines.push(`${age(d.quickScan, now) === null || age(d.quickScan, now) > 14 ? '⚠' : '✓'} Last quick scan: ${ago(age(d.quickScan, now))}. Last full scan: ${ago(age(d.fullScan, now))}.`);
  } else if (others.length) lines.push(`ℹ Antivirus reporting to Windows: ${others.map((a) => `${a.name}${a.state & 0x1000 ? ' (on)' : ' (off)'}${a.state & 0x10 ? ', out of date' : ''}`).join('; ')}.`);
  else lines.push('⚠ I couldn\'t read Defender\'s status (it may be managed by another antivirus or by work settings).');
  const fw = o.firewall || [];
  if (fw.length) {
    const offs = fw.filter((f) => !f.on).map((f) => f.name);
    lines.push(offs.length ? `⚠ Windows Firewall is OFF for: ${offs.join(', ')}. Turn it back on in Windows Security > Firewall & network protection.` : '✓ Windows Firewall is on for every network type.');
  }
  const upd = o.lastUpdate || o.lastHotfix;
  if (upd) { const a = age(upd, now); lines.push(`${a > 45 ? '⚠' : '✓'} Windows updates: last installed ${ago(a)}.${a > 45 ? ' Check Settings > Windows Update.' : ''}`); }
  if (o.uac === 0) lines.push('⚠ User Account Control (the "allow this app to make changes?" box) is switched off, so programs can get admin rights without asking.');
  return lines.join('\n');
}

export function sayThreats(r = {}) {
  const list = r.detections || [];
  if (!list.length) return r.err && /denied|access/i.test(r.err) ? 'Windows wouldn\'t show me the detection history (it can need admin). Open Windows Security > Virus & threat protection > Protection history to see it.' : '✓ Defender has no detections on record. Nothing found lately.';
  return list.map((t, i) => {
    const x = explainThreat(t.name);
    const files = (t.files || []).map((f) => String(f).replace(/^\w+:_/, '')).join(', ');
    return `${i + 1}. ${t.name || '(unnamed)'}, ${SEVERITY[t.severity] || 'unknown'} severity, ${t.when ? t.when.replace('T', ' ') : 'unknown time'}: ${THREAT_STATUS[t.status] || 'status ' + t.status}${t.active ? ' (STILL ACTIVE)' : ''}.\n   What it is: ${x.plain}${files ? `\n   Where: ${files}` : ''}`;
  }).join('\n') + '\n\nTo restore, allow or remove one, open Windows Security > Virus & threat protection > Protection history. Bob never does those himself.';
}

// Startup items: a mark for each, worst first.
const USER_PLACES = /\\(appdata|temp|tmp|downloads|users\\public|programdata\\[^\\]+\.(exe|bat))\\?/i;
const SCRIPT_HOSTS = /\b(powershell|pwsh|wscript|cscript|mshta|rundll32|regsvr32|cmd(\.exe)?\s+\/c|conhost|bitsadmin|certutil)\b/i;
export function judgeStartup(i) {
  const why = [];
  let level = 0;
  const cmd = String(i.command || '');
  if (i.exe && i.exists === false) { why.push('the program it points to is missing (left behind by something uninstalled, usually harmless)'); level = Math.max(level, 1); }
  if (i.exists && i.sig && i.sig !== 'Valid') { why.push(i.sig === 'NotSigned' ? 'not signed by its maker' : `its signature is ${i.sig}`); level = Math.max(level, 1); }
  if (i.exe && USER_PLACES.test(i.exe) && i.sig !== 'Valid') { why.push('runs from a user folder like AppData or Temp, where malware likes to hide'); level = Math.max(level, 2); }
  if (SCRIPT_HOSTS.test(cmd)) { why.push('starts through a script or Windows tool rather than a normal program'); level = Math.max(level, 1); }
  // 1.5.49 (PC check): a command run through conhost.exe shows conhost's own signer (Microsoft), not the thing it runs.
  if (/(^|\\)conhost\.exe$/i.test(String(i.exe || ''))) why.push('the signature shown is for conhost.exe, the Windows console host it runs through, not for the command it starts');
  if (!cmd.trim() && i.com) why.push(`runs a Windows component (COM handler ${i.com}) instead of a program file, which is common for tasks Windows and big apps set up; there's no file to check`);
  if (/-e(nc|ncodedcommand)?\s+[A-Za-z0-9+/=]{20,}|frombase64string/i.test(cmd)) { why.push('hides its command in scrambled (Base64) text'); level = 3; }
  if (/-w(indowstyle)?\s+h(idden)?\b/i.test(cmd)) { why.push('runs in a hidden window'); level = Math.max(level, 2); }
  if (/https?:\/\//i.test(cmd) && SCRIPT_HOSTS.test(cmd)) { why.push('fetches something from the internet when it starts'); level = 3; }
  return { level, mark: ['✓', 'ℹ', '⚠', '⛔'][level], why };
}
export function sayStartup(r = {}) {
  const items = (r.items || []).map((i) => ({ ...i, j: judgeStartup(i) })).sort((a, b) => b.j.level - a.j.level);
  if (!items.length) return 'Nothing extra starts with Windows (besides Windows itself).';
  const lines = items.map((i) => `${i.j.mark} ${i.name}${i.off ? ' (switched off in Task Manager)' : ''}: ${i.where}. ${i.signer ? `Signed by ${i.signer}. ` : ''}${i.j.why.length ? `Note: ${i.j.why.join('; ')}.` : 'Looks normal.'}\n   ${String(i.command).slice(0, 220)}`);
  const worry = items.filter((i) => i.j.level >= 2).length;
  return `${items.length} things start with Windows${worry ? `, and ${worry} deserve a closer look` : ''}:\n${lines.join('\n')}\n\nTo stop one starting: Task Manager > Startup apps (right-click, Disable), or Task Scheduler for scheduled tasks. Bob only looks; he doesn't switch these off.`;
}

const KNOWN_PORTS = { 135: 'Windows RPC (normal)', 139: 'Windows file sharing, old style', 445: 'Windows file sharing (SMB)', 5040: 'Windows device service (normal)', 7680: 'Windows Update delivery (normal)', 5357: 'Windows network discovery', 7777: 'Bob himself', 11434: 'Ollama (Bob\'s engine)', 3389: 'Remote Desktop: lets people sign in to this replicant matrix from the network', 5900: 'VNC remote control', 22: 'SSH remote sign-in', 3000: 'a local web app (Open WebUI often uses this)', 8188: 'ComfyUI' };
export function sayNetwork(r = {}) {
  const rows = (r.listen || []).filter((x, i, a) => a.findIndex((y) => y.port === x.port && y.addr === x.addr) === i);
  const open = rows.filter((x) => /^(0\.0\.0\.0|::)$/.test(x.addr));
  const local = rows.filter((x) => /^(127\.|::1)/.test(x.addr));
  const say = (x) => `${x.port} ${x.proc || 'pid ' + x.pid}${KNOWN_PORTS[x.port] ? ` (${KNOWN_PORTS[x.port]})` : ''}`;
  const risky = open.filter((x) => [3389, 5900, 22, 23, 21].includes(x.port));
  return `${open.length} listening to other replicant matrices on your network (the firewall still decides who gets in): ${open.map(say).join(', ') || 'none'}.\n${local.length} only reachable from this replicant matrix: ${local.map(say).join(', ') || 'none'}.${risky.length ? `\n⚠ Remote sign-in is open: ${risky.map(say).join(', ')}. If you don't use it, switch it off.` : ''}\nOnly programs you recognise should be on the first list. Your router keeps these away from the internet unless port forwarding or UPnP opens them.`;
}

// ---------------------------------------------------------------- Defender scans

export function mpCmdRun(env = process.env) {
  if (env.BOB_MPCMDRUN) return env.BOB_MPCMDRUN;
  const pf = env.ProgramFiles || 'C:\\Program Files';
  const p = path.join(pf, 'Windows Defender', 'MpCmdRun.exe');
  return WIN && fs.existsSync(p) ? p : null;
}

export function scanArgs(kind, target = '') {
  if (kind === 'quick') return ['-Scan', '-ScanType', '1'];
  if (kind === 'full') return ['-Scan', '-ScanType', '2'];
  if (kind === 'file') return ['-Scan', '-ScanType', '3', '-File', target];
  if (kind === 'update') return ['-SignatureUpdate'];
  throw new Error('kind must be quick, full, file or update.');
}

// Runs MpCmdRun and waits (a full scan is started and left running: it can take hours).
export function runScan(kind, target, { env = process.env, signal, timeoutMs = 60 * 60_000 } = {}) {
  const exe = mpCmdRun(env);
  if (!exe) return Promise.reject(new Error('Microsoft Defender\'s scanner (MpCmdRun.exe) isn\'t on this replicant matrix, so another antivirus may be in charge. Use its own window to scan.'));
  const args = scanArgs(kind, target);
  if (kind === 'full') {
    const child = spawn(exe, args, { detached: true, stdio: 'ignore', windowsHide: true, env });
    child.unref();
    return Promise.resolve({ started: true, code: null, out: '' });
  }
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { windowsHide: true, env });
    let out = '';
    const stop = () => { try { child.kill(); } catch {} };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener?.('abort', stop, { once: true });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); if (signal?.aborted) return reject(new Error('stopped')); resolve({ code, out: out.slice(-4000) }); });
  });
}

export function sayScan(kind, r) {
  if (r.started) return 'Started a full Defender scan. It runs by itself and can take an hour or more; Windows Security shows its progress. Ask me "did Defender find anything?" afterwards.';
  if (kind === 'update') return r.code === 0 ? '✓ Defender\'s virus definitions are up to date now.' : `Defender couldn't update its definitions (code ${r.code}). ${String(r.out).trim().split('\n').slice(-2).join(' ')}`;
  if (r.code === 0) return `✓ ${kind === 'file' ? 'That scan' : 'The quick scan'} finished and found nothing.`;
  if (r.code === 2) return `⚠ Defender found something and dealt with it as it is set to. Ask me to check the threat list (security_check threats) to see what it was.`;
  return `The scan ended with code ${r.code}. ${String(r.out).trim().split('\n').slice(-3).join(' ')}`;
}
