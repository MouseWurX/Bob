// The Linux side of the "Security and privacy" Hand: the same read-only checks as security-pc.js, the Linux way.
// Nothing here needs administrator rights or changes a setting: Bob reads files and asks programs that answer
// without sudo (systemctl is-active, ss, crontab -l). Scans use ClamAV (clamscan) when it is installed; Linux has
// no built-in antivirus, so Bob says so plainly instead of pretending.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';

// Runs a fixed program with fixed arguments (no shell, no words from the chat) and gives back its output, or '' on failure.
export function quiet(file, args, { timeoutMs = 15000, env = process.env } = {}) {
  return new Promise((resolve) => {
    execFile(file, args, { timeout: timeoutMs, env, maxBuffer: 4e6 }, (err, out) => resolve(err && !out ? '' : String(out || '')));
  });
}

const read = (f) => { try { return fs.readFileSync(f, 'utf8'); } catch { return ''; } };
const mtime = (f) => { try { return fs.statSync(f).mtimeMs; } catch { return 0; } };
const daysAgo = (ms, now = Date.now()) => (ms ? Math.floor((now - ms) / 86400000) : null);
const ago = (d) => (d === null ? 'never (or unknown)' : d === 0 ? 'today' : d === 1 ? 'yesterday' : `${d} days ago`);

// Where ClamAV lives, if it does: BOB_CLAMSCAN for tests, else the usual places.
export function clamscan(env = process.env) {
  if (env.BOB_CLAMSCAN) return env.BOB_CLAMSCAN;
  return ['/usr/bin/clamscan', '/usr/local/bin/clamscan', '/bin/clamscan'].find((p) => fs.existsSync(p)) || null;
}

// ---------------------------------------------------------------- gathering (each returns plain data)

export async function gatherOverview({ env = process.env, run = quiet, root = '/' } = {}) {
  const at = (p) => path.join(root, p);
  const active = async (unit) => (await run('systemctl', ['is-active', unit])).trim() === 'active';
  const firewall = [];
  for (const unit of ['ufw', 'firewalld', 'nftables']) if (await active(unit)) firewall.push(unit);
  const clamDb = ['var/lib/clamav/daily.cld', 'var/lib/clamav/daily.cvd'].map((p) => mtime(at(p))).reduce((a, b) => Math.max(a, b), 0);
  const updateLogs = ['var/log/apt/history.log', 'var/log/dnf.rpm.log', 'var/log/dnf.log', 'var/log/pacman.log', 'var/log/zypp/history'].map((p) => mtime(at(p)));
  return {
    clam: Boolean(clamscan(env)), clamDb, clamd: await active('clamav-daemon') || await active('clamd@scan'),
    firewall, lastUpdate: Math.max(0, ...updateLogs), rebootNeeded: fs.existsSync(at('var/run/reboot-required')) || fs.existsSync(at('run/reboot-required')),
    secureBoot: /SecureBoot enabled/i.test(await run('mokutil', ['--sb-state'])),
    kernel: os.release()
  };
}

// The things that start when you sign in, and the ones that start with the PC.
export async function gatherStartup({ env = process.env, run = quiet, home = os.homedir(), root = '/' } = {}) {
  const items = [];
  const desktopDirs = [[path.join(env.XDG_CONFIG_HOME || path.join(home, '.config'), 'autostart'), 'Your account (autostart)'], [path.join(root, 'etc/xdg/autostart'), 'Everyone (autostart)']];
  for (const [dir, where] of desktopDirs) {
    let names = [];
    try { names = fs.readdirSync(dir).filter((n) => n.endsWith('.desktop')); } catch {}
    for (const n of names) {
      const t = read(path.join(dir, n));
      const get = (k) => (t.match(new RegExp(`^${k}\\s*=\\s*(.*)$`, 'm')) || [])[1] || '';
      items.push({ name: get('Name') || n.replace(/\.desktop$/, ''), where, command: get('Exec'), off: /^\s*(true)\s*$/i.test(get('Hidden')) || /^\s*false\s*$/i.test(get('X-GNOME-Autostart-enabled')) });
    }
  }
  for (const line of (await run('systemctl', ['--user', 'list-unit-files', '--state=enabled', '--no-legend', '--no-pager'])).split('\n')) {
    const unit = line.trim().split(/\s+/)[0];
    if (unit && /\.(service|timer)$/.test(unit)) items.push({ name: unit, where: 'Your account (systemd user service)', command: (await run('systemctl', ['--user', 'show', '-p', 'ExecStart', '--value', unit])).trim().replace(/^\{ path=([^ ;]+).*?argv\[\]=([^;]*);.*$/, '$2').trim() || unit });
  }
  for (const line of (await run('crontab', ['-l'])).split('\n')) {
    const l = line.trim();
    if (l && !l.startsWith('#') && !/^\w+=/.test(l)) items.push({ name: 'crontab line', where: 'Your account (crontab)', command: l });
  }
  return { items };
}

// Listening sockets from ss (iproute2). Process names show for your own programs; root's ones show without a name.
export async function gatherNetwork({ run = quiet } = {}) {
  const out = await run('ss', ['-ltnpH']);
  const listen = [];
  for (const line of out.split('\n')) {
    const f = line.trim().split(/\s+/);
    if (f.length < 4) continue;
    const local = f[3];
    const i = local.lastIndexOf(':');
    const addr = local.slice(0, i).replace(/^\[|\]$/g, '').replace(/%.*$/, '');
    const port = Number(local.slice(i + 1));
    const m = line.match(/users:\(\("([^"]+)",pid=(\d+)/);
    if (port) listen.push({ addr: addr === '*' ? '0.0.0.0' : addr, port, proc: m ? m[1] : '', pid: m ? Number(m[2]) : 0 });
  }
  return { listen };
}

// ---------------------------------------------------------------- saying it plainly

export function sayOverviewLinux(o = {}, now = Date.now()) {
  const lines = [];
  if (o.clam) {
    const d = daysAgo(o.clamDb, now);
    lines.push(`✓ ClamAV is installed${o.clamd ? ' and its scanner service is running' : ' (it scans when asked; it doesn\'t watch files as they arrive)'}.`);
    lines.push(d === null || d > 3 ? `⚠ ClamAV's virus definitions were last updated ${ago(d)}. Your system updates them with freshclam (it runs by itself when the clamav-freshclam service is on).` : `✓ ClamAV's virus definitions are fresh (${ago(d)}).`);
  } else lines.push('ℹ No antivirus is installed. That is normal on Linux: keeping the system updated and only installing from your distro\'s software centre does most of the work. If you want a scanner for downloads, install ClamAV from the software centre, and I can use it.');
  lines.push(o.firewall?.length ? `✓ A firewall is running (${o.firewall.join(', ')}).` : 'ℹ I don\'t see a firewall service running (ufw, firewalld or nftables). Many desktop distros ship with it off; your router still keeps the internet out. You can turn one on in your distro\'s firewall settings (for example "Firewall Configuration" or gufw).');
  const u = daysAgo(o.lastUpdate, now);
  if (o.lastUpdate) lines.push(`${u > 14 ? '⚠' : '✓'} Last system update: ${ago(u)}.${u > 14 ? ' Run your software updater; Linux security fixes arrive through it.' : ''}`);
  else lines.push('ℹ I couldn\'t tell when the system last updated. Your software updater shows it.');
  if (o.rebootNeeded) lines.push('⚠ An update is waiting for a restart to finish (some fixes only take effect after one).');
  if (o.secureBoot) lines.push('✓ Secure Boot is on.');
  return lines.join('\n');
}

const RISKY_PLACES = /(^|[\s"'=])(\/tmp\/|\/var\/tmp\/|\/dev\/shm\/|~?\/?[^\s]*\/(Downloads|\.cache)\/)/;
const FETCH_AND_RUN = /\b(curl|wget)\b[^|;]*\|\s*(ba|z|da)?sh\b|\bbase64\s+-d\b[^|]*\|\s*(ba)?sh\b|\/dev\/tcp\/|\bnc(at)?\s+-e\b/i;
export function judgeStartupLinux(i = {}) {
  const why = [];
  let level = 0;
  const cmd = String(i.command || '');
  if (FETCH_AND_RUN.test(cmd)) { why.push('fetches and runs something from the internet, or opens a remote connection'); level = 3; }
  if (RISKY_PLACES.test(cmd)) { why.push('runs from a temporary or Downloads folder, where malware likes to hide'); level = Math.max(level, 2); }
  if (/\/\.[^/\s]+\/[^/\s]+$/.test(cmd.split(/\s+/)[0] || '') && !/\/\.local\/|\/\.config\//.test(cmd)) { why.push('runs from a hidden folder'); level = Math.max(level, 2); }
  if (i.where?.includes('crontab') && /@reboot/.test(cmd)) { why.push('a crontab line that runs at every start'); level = Math.max(level, 1); }
  return { level, mark: ['✓', 'ℹ', '⚠', '⛔'][level], why };
}

export function sayStartupLinux(r = {}) {
  const items = (r.items || []).map((i) => ({ ...i, j: judgeStartupLinux(i) })).sort((a, b) => b.j.level - a.j.level);
  if (!items.length) return 'Nothing extra starts when you sign in (besides your desktop itself).';
  const lines = items.map((i) => `${i.j.mark} ${i.name}${i.off ? ' (switched off)' : ''}: ${i.where}. ${i.j.why.length ? `Note: ${i.j.why.join('; ')}.` : 'Looks normal.'}\n   ${String(i.command).slice(0, 220)}`);
  const worry = items.filter((i) => i.j.level >= 2).length;
  return `${items.length} things start when you sign in${worry ? `, and ${worry} deserve a closer look` : ''}:\n${lines.join('\n')}\n\nTo stop one starting: your desktop's "Startup Applications" or "Autostart" settings. Services started by the system itself (not listed here) are managed by your distro. Bob only looks; he doesn't switch these off.`;
}

const KNOWN_PORTS_LINUX = { 22: 'SSH remote sign-in', 53: 'the local name lookup service (normal)', 631: 'printing (CUPS, normal)', 5353: 'local network discovery (normal)', 7777: 'Bob himself', 11434: 'Ollama', 3389: 'Remote Desktop', 5900: 'VNC remote control', 8188: 'ComfyUI', 3000: 'a local web app' };
export function sayNetworkLinux(r = {}) {
  const rows = (r.listen || []).filter((x, i, a) => a.findIndex((y) => y.port === x.port && y.addr === x.addr) === i);
  const open = rows.filter((x) => /^(0\.0\.0\.0|::)$/.test(x.addr));
  const local = rows.filter((x) => /^(127\.|::1)/.test(x.addr));
  const say = (x) => `${x.port} ${x.proc || '(a system program)'}${KNOWN_PORTS_LINUX[x.port] ? ` (${KNOWN_PORTS_LINUX[x.port]})` : ''}`;
  const risky = open.filter((x) => [3389, 5900, 22, 23, 21].includes(x.port));
  return `${open.length} listening to other replicant matrices on your network (a firewall, if one is on, still decides who gets in): ${open.map(say).join(', ') || 'none'}.\n${local.length} only reachable from this replicant matrix: ${local.map(say).join(', ') || 'none'}.${risky.length ? `\n⚠ Remote sign-in is open: ${risky.map(say).join(', ')}. If you don't use it, switch it off.` : ''}\nOnly programs you recognise should be on the first list.`;
}

export async function linuxCheck(area, opts = {}) {
  if (area === 'threats') return 'Linux has no antivirus history to read (there is no Defender). If ClamAV is installed I can scan a file, a folder, or your Downloads and Desktop (security scan).';
  if (area === 'startup') return sayStartupLinux(await gatherStartup(opts));
  if (area === 'network') return sayNetworkLinux(await gatherNetwork(opts));
  return sayOverviewLinux(await gatherOverview(opts));
}

// ---------------------------------------------------------------- ClamAV scans (quick = Downloads and Desktop; file = one path)

export function clamPlan(kind, target = '', { home = os.homedir() } = {}) {
  if (kind === 'file') return ['--recursive', '--infected', '--no-summary', target];
  if (kind === 'quick') return ['--recursive', '--infected', '--no-summary', ...['Downloads', 'Desktop'].map((d) => path.join(home, d)).filter((d) => fs.existsSync(d))];
  throw new Error(kind === 'update' ? 'On Linux, ClamAV\'s definitions are updated by the system (the clamav-freshclam service, or "sudo freshclam"), which needs administrator rights, so I leave it to you.' : 'A full scan of the whole replicant matrix isn\'t something I start on Linux (it needs administrator rights to read everything). I can scan your Downloads and Desktop (quick) or a folder you name (file).');
}

export function runClam(kind, target, { env = process.env, signal, timeoutMs = 60 * 60_000 } = {}) {
  const exe = clamscan(env);
  if (!exe) return Promise.reject(new Error('ClamAV isn\'t installed, so I can\'t scan. Install "ClamAV" from your software centre and ask again.'));
  const args = clamPlan(kind, target, { home: env.HOME || os.homedir() });
  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, { env });
    let out = '';
    const stop = () => { try { child.kill(); } catch {} };
    const timer = setTimeout(stop, timeoutMs);
    signal?.addEventListener?.('abort', stop, { once: true });
    child.stdout.on('data', (d) => { out += d; if (out.length > 1e6) out = out.slice(-1e6); });
    child.stderr.on('data', (d) => { out += d; });
    child.on('error', (e) => { clearTimeout(timer); reject(e); });
    child.on('close', (code) => { clearTimeout(timer); if (signal?.aborted) return reject(new Error('stopped')); resolve({ code, out: out.slice(-4000) }); });
  });
}

// clamscan: 0 = clean, 1 = something found, 2 = an error.
export function sayClam(kind, r) {
  const where = kind === 'file' ? 'That scan' : 'The scan of Downloads and Desktop';
  if (r.code === 0) return `✓ ${where} finished and ClamAV found nothing.`;
  if (r.code === 1) {
    const hits = String(r.out).split('\n').filter((l) => / FOUND$/.test(l)).slice(0, 20);
    return `⚠ ClamAV found ${hits.length} thing${hits.length === 1 ? '' : 's'}. It only reports; nothing was moved or deleted:\n${hits.map((l) => '   ' + l).join('\n')}\nIf you don't trust one, I can throw it in the Trash with the Files Hand, or you can check it on VirusTotal first.`;
  }
  return `ClamAV stopped with an error (code ${r.code}). ${String(r.out).trim().split('\n').slice(-2).join(' ')}`;
}
