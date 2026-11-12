// The "Run" Hand: running a command, script or program the user approved. No UI here, just two things:
//   checkCommand(cfg, { cmd, args, cwd })  -> { ok, why, line, kind }   is this allowed at all?
//   runCommand({ cmd, args, cwd, timeoutMs, signal, onOutput }) -> Promise<{ code, out, killed }>
// Rules: no shell (arguments go to the program as they are, so "; del *" is just text), never as administrator,
// no stdin (nothing can sit waiting for a password), keys and tokens are taken out of the environment, output
// streams as it comes, and Stop or a timeout kills the whole process tree, not just the first program.
import fs from 'node:fs';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { insideAny, isInside } from './config.js';
import { isSensitive } from './tools.js';
import { limitOn, readOnlyRoots } from './hands-settings.js';
import { killTree as stopTree } from './platform.js';

const MAX_OUT = 400_000; // characters of output kept for Bob (the chat gets all of it live); tool-kinds.js trims it smartly after (RESULT_MAX)
const WIN = process.platform === 'win32';

// Programs that are never run, whatever the arguments.
const NEVER_PROGRAMS = new Map(Object.entries({
  format: 'formats a disk', diskpart: 'changes disk partitions', bcdedit: 'changes how Windows boots', bootrec: 'changes how Windows boots',
  bcdboot: 'changes how Windows boots', mountvol: 'changes disk mounts', vssadmin: 'manages restore points and shadow copies', wbadmin: 'manages system backups',
  regedit: 'edits the registry', regedt32: 'edits the registry', runas: 'runs as another user or administrator', psexec: 'runs as another user or administrator',
  psexec64: 'runs as another user or administrator', sudo: 'runs as administrator', gsudo: 'runs as administrator', nircmd: 'can run things elevated',
  shutdown: 'shuts down or restarts this replicant matrix', takeown: 'takes ownership of files', icacls: 'changes file permissions', cacls: 'changes file permissions',
  secedit: 'changes security policy', gpedit: 'changes group policy', lusrmgr: 'manages user accounts', mpcmdrun: 'controls Windows antivirus',
  sc: 'controls Windows services', cipher: 'can wipe free disk space', syskey: 'changes system security', reagentc: 'changes Windows recovery',
  mkfs: 'formats a disk', fdisk: 'changes disk partitions', dd: 'writes raw disks', passwd: 'changes passwords', useradd: 'manages user accounts',
  userdel: 'manages user accounts', reboot: 'restarts this replicant matrix', poweroff: 'shuts down this replicant matrix', halt: 'shuts down this replicant matrix', chown: 'changes file ownership',
  // Linux (and Mac) programs with the same reach as the Windows ones above.
  pkexec: 'runs as administrator (run it yourself in a terminal if you need it)', doas: 'runs as administrator (run it yourself in a terminal if you need it)', su: 'runs as another user or administrator (run it yourself in a terminal if you need it)', visudo: 'changes who may be administrator (run it yourself in a terminal if you need it)',
  usermod: 'manages user accounts (run it yourself in a terminal if you need it)', groupadd: 'manages user accounts (run it yourself in a terminal if you need it)', groupdel: 'manages user accounts (run it yourself in a terminal if you need it)', chpasswd: 'changes passwords (run it yourself in a terminal if you need it)',
  systemctl: 'controls system services (run it yourself in a terminal if you need it)', service: 'controls system services (run it yourself in a terminal if you need it)', launchctl: 'controls system services (run it yourself in a terminal if you need it)', crontab: 'makes a scheduled task (that is the Schedules Hand\'s job)',
  mount: 'changes disk mounts (use your distro\'s Disks app yourself if you need it)', umount: 'changes disk mounts (use your distro\'s Disks app yourself if you need it)', parted: 'changes disk partitions (use your distro\'s Disks app yourself if you need it)', gdisk: 'changes disk partitions (use your distro\'s Disks app yourself if you need it)', sgdisk: 'changes disk partitions (use your distro\'s Disks app yourself if you need it)',
  wipefs: 'wipes disks (use your distro\'s Disks app yourself if you need it)', shred: 'destroys files beyond recovery (ask me to put it in the Trash instead)', modprobe: 'changes the system core, the kernel (run it yourself in a terminal if you need it)', insmod: 'changes the system core, the kernel (run it yourself in a terminal if you need it)',
  rmmod: 'changes the system core, the kernel (run it yourself in a terminal if you need it)', setenforce: 'changes system security (run it yourself in a terminal if you need it)', chattr: 'changes protected file flags (run it yourself in a terminal if you need it)', iptables: 'changes the firewall (use your distro\'s firewall settings yourself)',
  nft: 'changes the firewall (use your distro\'s firewall settings yourself)', ufw: 'changes the firewall (use your distro\'s firewall settings yourself)', firewalld: 'changes the firewall (use your distro\'s firewall settings yourself)', 'firewall-cmd': 'changes the firewall (use your distro\'s firewall settings yourself)',
  'grub-install': 'changes how this replicant matrix boots (run it yourself in a terminal if you need it)', 'update-grub': 'changes how this replicant matrix boots (run it yourself in a terminal if you need it)', efibootmgr: 'changes how this replicant matrix boots (run it yourself in a terminal if you need it)'
}));

// Text that is refused anywhere in the command line (and inside a script Bob is asked to run).
const NEVER_TEXT = [
  [/\bformat(\.com)?\s+[a-z]:/i, 'formats a disk'],
  [/\b(format-volume|clear-disk|initialize-disk|remove-partition|set-partition|new-partition|resize-partition)\b/i, 'changes disks'],
  [/\bdiskpart\b/i, 'changes disk partitions'],
  [/\b(bcdedit|bootrec|bcdboot)\b/i, 'changes how Windows boots'],
  [/\bHKLM\b|HKEY_LOCAL_MACHINE|\bHKCR\b|HKEY_CLASSES_ROOT|\bHKU\\|HKEY_USERS/i, 'touches the system part of the registry'],
  [/\breg(\.exe)?\s+(add|delete|import|load|unload|restore|copy)\b/i, 'changes the registry'],
  [/\b(set|add|remove)-mppreference\b|\bmpcmdrun\b|\bwindefend\b|disablerealtimemonitoring|\bwindows defender\b|\bdefender\b.*\b(disable|exclu|stop|off)/i, 'touches Windows antivirus'],
  [/\bnet1?(\.exe)?\s+(user|localgroup|group|accounts)\b/i, 'manages user accounts'],
  [/\b(new|set|remove|disable|enable|add)-local(user|group(member)?)\b/i, 'manages user accounts'],
  [/\bshutdown(\.exe)?\b|\b(stop|restart)-computer\b/i, 'shuts down or restarts this replicant matrix'],
  [/\brunas\b|-verb\s+['"]?runas|\bstart-process\b[^\n]*-verb\b|\bsudo\b|\bgsudo\b|\bpsexec/i, 'asks for administrator rights'],
  [/\b(set-executionpolicy)\b/i, 'changes the script security setting'],
  [/-e(nc(odedcommand)?|c)\s+[A-Za-z0-9+/=]{16,}/i, 'hides what it runs (encoded command)'],
  [/\bvssadmin\b|\bwbadmin\b|\bwmic\s+shadowcopy\b/i, 'touches restore points or backups'],
  [/\b(takeown|icacls|cacls)\b/i, 'changes file ownership or permissions'],
  [/\bschtasks\b|\bregister-scheduledtask\b/i, 'makes a Windows scheduled task (that is the Schedules Hand\'s job)'],
  [/\b(rd|rmdir)\s+(\/s|\/q)|\bdel(\.exe)?\s+[^\n]*\/s\b|\bremove-item\b[^\n]*-recurse|\brm\s+-[a-z]*r[a-z]*f|\brm\s+-[a-z]*f[a-z]*r/i, 'deletes many files at once (Bob throws things away through the Files Hand, to the Recycle Bin)'],
  [/\bcipher\s+\/w\b/i, 'wipes disk space'],
  [/\b(invoke-webrequest|iwr|curl|wget|invoke-restmethod|irm)\b[^\n|]*\|\s*(iex|invoke-expression|sh|bash|cmd|powershell|pwsh)\b/i, 'downloads and runs code in one go'],
  [/\bmkfs\b|\bdd\s+[^\n]*of=\/dev\//i, 'writes raw disks'],
  // Linux and Mac shells.
  [/\b(pkexec|doas)\b|\bsu\s+(-|root\b)/i, 'asks for administrator rights (run it yourself in a terminal if you need it)'],
  [/\brm\s+(-[a-z]*r|--recursive)\b|\bfind\b[^\n]*\s-delete\b|--no-preserve-root/i, 'deletes many files at once (Bob throws things away through the Files Hand, to the Trash)'],
  [/>\s*\/dev\/(sd|nvme|hd|vd|mmcblk|disk)/i, 'writes raw disks (use your distro\'s Disks app yourself if you need it)'],
  [/(>|\btee\b[^\n]*)\s*\/(etc|boot|usr|bin|sbin|lib|lib64|sys|proc)\//i, 'changes system files (edit them yourself with administrator rights if you mean to)'],
  [/\b(chmod|chown|chgrp)\s+(-[a-z]*R|--recursive)\b[^\n]*\s\/(\s|$)/i, 'changes permissions on the whole system (change them only on the files you need, yourself)'],
  [/\bcrontab\b|\bsystemctl\b|\blaunchctl\b/i, 'makes or changes a system task or service (that is the Schedules Hand\'s job)'],
  [/:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, 'would freeze this replicant matrix (a fork bomb: there is nothing useful to run instead)']
];

// macOS's own system tools that wipe disks, change startup or security, or manage accounts (on every computer, so a
// command typed for a Mac is refused the same way wherever it is checked).
for (const [k, v] of Object.entries({
  diskutil: 'erases or changes disks', asr: 'restores whole disks', csrutil: 'changes macOS system protection', spctl: 'changes Gatekeeper (which apps may open)',
  nvram: 'changes start-up memory', bless: 'changes how the Mac starts', fdesetup: 'changes disk encryption', sysadminctl: 'manages user accounts',
  dscl: 'manages user accounts', dseditgroup: 'manages user groups', createhomedir: 'manages user accounts', pmset: 'changes power and sleep settings',
  systemsetup: 'changes system settings', kextload: 'loads system extensions', kmutil: 'loads system extensions', tmutil: 'manages Time Machine backups'
})) NEVER_PROGRAMS.set(k, v);
NEVER_TEXT.push(
  [/\bdiskutil\s+(erase\w*|partition\w*|zeroDisk|randomDisk|secureErase|apfs\s+delete\w*|reformat)\b/i, 'erases or changes disks'],
  [/\bcsrutil\s+(disable|clear|authenticated-root)\b|\bspctl\s+--master-disable\b|\bspctl\s+--global-disable\b/i, 'switches macOS protection off'],
  [/\blaunchctl\s+(bootstrap|bootout|load|unload|enable|disable)\s+system\b|\/Library\/LaunchDaemons\//i, 'changes what starts with the Mac'],
  [/\bosascript\b[^\n]*with administrator privileges/i, 'asks for administrator rights'],
  [/\bxattr\s+[^\n]*-[a-z]*d[a-z]*\s+com\.apple\.quarantine\b|\bxattr\s+-c\b/i, 'removes the "downloaded from the internet" check from files']
);

// "Don't send anything out" (a hard limit, on by default): commands that upload or post the user's things.
// The line: a command that sends a body, a file or a push to another computer is refused; plain downloads
// (curl URL, git pull/clone/fetch, npm install) are reads and stay allowed.
const SEND_PROGRAMS = new Map(Object.entries({
  scp: 'copies files to another replicant matrix', sftp: 'copies files to another replicant matrix', ftp: 'copies files to another replicant matrix',
  rsync: 'can copy files to another replicant matrix', rclone: 'copies files to cloud storage', azcopy: 'copies files to cloud storage',
  gsutil: 'copies files to cloud storage', ssh: 'opens a link to another replicant matrix', nc: 'sends data over the network', ncat: 'sends data over the network',
  telnet: 'sends data over the network', sendmail: 'sends email', mail: 'sends email', mutt: 'sends email'
}));
const SEND_TEXT = [
  [/\bcurl\b[^\n]*\s(-d|--data[\w-]*|-F|--form[\w-]*|-T|--upload-file|--json|-X\s*['"]?(POST|PUT|PATCH)|--request\s+['"]?(POST|PUT|PATCH))(?=[\s'"=]|$)/i, 'sends data to a website'],
  [/\bwget\b[^\n]*--(post|body)-(data|file)\b/i, 'sends data to a website'],
  [/\b(invoke-webrequest|iwr|invoke-restmethod|irm)\b[^\n]*-(body|infile|method\s+['"]?(post|put|patch))\b/i, 'sends data to a website'],
  [/\bgit\b[^\n]*\b(push|send-email|request-pull)\b/i, 'pushes or sends code to another replicant matrix'],
  [/\b(npm|pnpm|yarn|cargo|twine|gem|nuget)\b[^\n]*\b(publish|push|upload)\b/i, 'publishes to the internet'],
  [/\bgh\b[^\n]*\b(pr|issue|release|gist|repo|api)\b[^\n]*\b(create|edit|comment|upload|post)\b/i, 'posts to GitHub'],
  [/\bsend-mailmessage\b|\bsmtpclient\b/i, 'sends email'],
  [/\bstart-bitstransfer\b[^\n]*-transfertype\s+upload\b/i, 'uploads files']
];
function sendProblem(text) {
  for (const [re, why] of SEND_TEXT) if (re.test(text)) return why;
  return '';
}

// Programs that only read or interpret text: their inline code is checked the same way, and they may not take hidden input.
const INTERPRETERS = new Set(['cmd', 'powershell', 'pwsh', 'python', 'python3', 'py', 'node', 'bash', 'sh', 'wscript', 'cscript', 'mshta']);
const NO_SCRIPT_HOSTS = new Set(['wscript', 'cscript', 'mshta']); // old Windows script hosts: too easy to hide things in
const SCRIPT_EXT = new Set(['.ps1', '.bat', '.cmd', '.py', '.js', '.mjs', '.cjs', '.sh']);
// What cmd.exe would treat as more than plain text when it runs a .bat or .cmd file for us.
const CMD_META = /[&|<>^%!"\r\n]/;

const progName = (cmd) => path.basename(String(cmd || '')).toLowerCase().replace(/\.(exe|com|bat|cmd)$/, '');

// What's wrong with this text, by the hard limits that are on (commands = the blocklist, sendOut = uploads).
export function textProblem(text, cfg = {}) {
  if (limitOn(cfg, 'commands')) for (const [re, why] of NEVER_TEXT) if (re.test(text)) return why;
  if (limitOn(cfg, 'sendOut')) { const why = sendProblem(text); if (why) return `${why}, and "Don't send anything out" is on`; }
  return '';
}

// Is this command allowed? { ok: true, line, kind, file } or { ok: false, why }.
// cfg needs dataDir, readOnlyRoots and (for the secrets check) agentDir; cwd must be a folder that exists.
export function checkCommand(cfg, { cmd, args = [], cwd } = {}) {
  const no = (why) => ({ ok: false, why });
  if (typeof cmd !== 'string' || !cmd.trim()) return no('No program was given.');
  if (cmd.length > 400 || cmd.includes('\0')) return no('That program name is not valid.');
  if (!Array.isArray(args) || args.length > 100 || args.some((a) => typeof a !== 'string' || a.length > 4000 || a.includes('\0'))) return no('The arguments must be a short list of plain text.');
  if (!cwd || typeof cwd !== 'string' || !path.isAbsolute(cwd)) return no('A full working folder is needed, like C:\\Users\\you\\Projects\\app.');
  let st = null;
  try { st = fs.statSync(cwd); } catch {}
  if (!st?.isDirectory()) return no(`The folder ${cwd} doesn't exist.`);
  if (insideAny(readOnlyRoots(cfg), cwd)) return no(`${cwd} is read-only for Bob (his own files, backups, or a project you marked read-only).`);

  const name = progName(cmd);
  const blocklist = limitOn(cfg, 'commands');
  if (blocklist && NEVER_PROGRAMS.has(name)) return no(`${name} is never run by Bob: it ${NEVER_PROGRAMS.get(name)}.`);
  if (blocklist && NO_SCRIPT_HOSTS.has(name)) return no(`${name} is never run by Bob: old script hosts make it too easy to hide what runs.`);
  if (limitOn(cfg, 'sendOut') && SEND_PROGRAMS.has(name)) return no(`${name} isn't run while "Don't send anything out" is on: it ${SEND_PROGRAMS.get(name)}.`);
  const line = [cmd, ...args].map(quoteForShow).join(' ');
  const why = textProblem([cmd, ...args].join(' '), cfg);
  if (why) return no(`That command is refused: it ${why}.`);

  // Paths in the command: no secrets, and nothing of Bob's own settings (so he can't switch his own Hands on).
  const own = [cfg.dataDir, cfg.settingsFile].filter(Boolean);
  for (const a of [cmd, ...args]) {
    for (const piece of pathsIn(a, cwd)) {
      if (isSensitive(cfg, piece)) return no('That command touches a file with keys or passwords, which stays off-limits to Bob.');
      if (own.some((d) => isInside(d, piece))) return no("That command touches Bob's own settings folder, which he can't change himself.");
    }
  }

  // A script file: check what's inside it with the same rules (up to 1 MB).
  const ext = path.extname(cmd).toLowerCase();
  let file = '';
  const scriptArg = INTERPRETERS.has(name) ? args.find((a) => SCRIPT_EXT.has(path.extname(a).toLowerCase())) : null;
  if (SCRIPT_EXT.has(ext) || scriptArg) {
    file = path.resolve(cwd, scriptArg || cmd);
    if (isSensitive(cfg, file)) return no('That script is in a secret file, which stays off-limits to Bob.');
    try {
      const body = fs.readFileSync(file).subarray(0, 1_000_000).toString('utf8');
      const inside = textProblem(body, cfg);
      if (inside) return no(`The script ${path.basename(file)} is refused: it ${inside}.`);
    } catch { if (SCRIPT_EXT.has(ext)) return no(`The script ${file} doesn't exist.`); }
  }
  if ((ext === '.bat' || ext === '.cmd') && args.some((a) => CMD_META.test(a))) return no('Arguments to a .bat or .cmd file may not contain & | < > ^ % ! or quotes (Windows would read them as commands).');
  if (name === 'cmd' && args.some((a) => /^\/[a-z]$/i.test(a) && !/^\/[cdsq]$/i.test(a))) return no('Only cmd /c (run one command) is allowed.');
  const kind = SCRIPT_EXT.has(ext) ? 'script' : INTERPRETERS.has(name) ? 'interpreter' : 'program';
  return { ok: true, why: '', line, kind, file };
}

// Bits of an argument that look like paths (whole argument, or the part after = or :).
function pathsIn(a, cwd) {
  const out = [];
  const s = String(a).replace(/^["']|["']$/g, '');
  for (const piece of [s, s.split('=').slice(1).join('='), s.replace(/^-+[\w-]+[:=]/, '')]) {
    if (!piece) continue;
    if (path.isAbsolute(piece) || /^[a-zA-Z]:[\\/]/.test(piece)) out.push(path.resolve(piece));
    else if (/[\\/]|\.\w{1,6}$/.test(piece)) out.push(path.resolve(cwd, piece));
  }
  return out;
}

export function quoteForShow(a) {
  const s = String(a);
  return s === '' ? '""' : /[\s"'&|<>^%!;]/.test(s) ? `"${s.replace(/"/g, '\\"')}"` : s;
}

// The environment for a run: the user's, minus anything that looks like a key, token or password.
const SECRET_ENV = /(KEY|TOKEN|SECRET|PASSWORD|PASSWD|PWD_|CREDENTIAL|AUTH)/i;
export function safeEnv(env = process.env) {
  const out = {};
  for (const [k, v] of Object.entries(env)) if (!SECRET_ENV.test(k) || /^(PATH|PATHEXT|PWD|OLDPWD)$/i.test(k)) out[k] = v;
  return out;
}

// How to start it without a shell. .ps1 goes through PowerShell -File, .py through Python, and .bat/.cmd
// through cmd /d /c (the only way Windows runs them; checkCommand already refused cmd's special characters).
export function launchPlan(cmd, args) {
  const ext = path.extname(cmd).toLowerCase();
  if (ext === '.ps1') return { file: WIN ? 'powershell.exe' : 'pwsh', args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', cmd, ...args] };
  if (ext === '.py') return { file: WIN ? 'python' : 'python3', args: [cmd, ...args] };
  if (['.js', '.mjs', '.cjs'].includes(ext)) return { file: process.execPath.endsWith('node') || process.execPath.endsWith('node.exe') ? process.execPath : 'node', args: [cmd, ...args] };
  if (ext === '.sh') return { file: 'bash', args: [cmd, ...args] };
  if (WIN && (ext === '.bat' || ext === '.cmd')) {
    const q = (s) => (/[\s]/.test(s) || s === '' ? `"${s}"` : s);
    return { file: process.env.ComSpec || 'cmd.exe', args: ['/d', '/s', '/c', `"${[cmd, ...args].map(q).join(' ')}"`], verbatim: true };
  }
  return { file: cmd, args };
}

// Kills a process and everything it started.
export function killTree(child) {
  if (!child || child.exitCode !== null || child.killedTree) return;
  child.killedTree = true;
  try { stopTree(child); } catch {}
  try { child.kill('SIGKILL'); } catch {}
}

const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]|\x1b\][^\x07]*\x07/g;

// Runs it. Resolves with { code, out, killed, why } and never throws for the program's own failure.
export function runCommand({ cmd, args = [], cwd, timeoutMs = 15 * 60_000, signal, onOutput = () => {}, onStart = () => {}, env } = {}) {
  return new Promise((resolve) => {
    const plan = launchPlan(path.isAbsolute(cmd) || !/[\\/]/.test(cmd) ? cmd : path.resolve(cwd, cmd), args);
    let out = '', killed = '', child;
    const keep = (t) => { out += t; if (out.length > MAX_OUT) out = '[...earlier output cut...]\n' + out.slice(-MAX_OUT); };
    try {
      child = spawn(plan.file, plan.args, { cwd, env: env || safeEnv(), stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true, detached: !WIN, shell: false, windowsVerbatimArguments: Boolean(plan.verbatim) });
    } catch (e) { return resolve({ code: null, out: '', killed: '', why: e.message }); }
    try { onStart(child.pid); } catch {}
    const decoder = (stream) => { stream.setEncoding('utf8'); stream.on('data', (d) => { const t = d.replace(ANSI, ''); keep(t); try { onOutput(t); } catch {} }); };
    decoder(child.stdout); decoder(child.stderr);
    const stop = (why) => { if (!killed) killed = why; killTree(child); };
    const timer = setTimeout(() => stop('timeout'), Math.max(1000, timeoutMs));
    const onAbort = () => stop('stopped');
    if (signal) { if (signal.aborted) onAbort(); else signal.addEventListener('abort', onAbort, { once: true }); }
    let started = true;
    child.on('error', (e) => { started = false; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); resolve({ code: null, out, killed, why: e.code === 'ENOENT' ? `Couldn't find the program ${cmd}.` : e.message }); });
    child.on('close', (code) => {
      if (!started) return;
      clearTimeout(timer);
      signal?.removeEventListener?.('abort', onAbort);
      if (!WIN && killed) { try { process.kill(-child.pid, 'SIGKILL'); } catch {} } // anything left in the group
      resolve({ code, out, killed, why: '' });
    });
  });
}
