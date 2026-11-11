// "Check this PC" (1.5.24): looks at a few things that make Bob slower and suggests fixes in plain steps.
// It only reads (Windows' own hardware lists and nvidia-smi). It never changes a setting; the user does that.
import path from 'node:path';
import { execFile } from 'node:child_process';

const run = (file, args, timeout = 15000) => new Promise((resolve) => {
  try { execFile(file, args, { timeout, windowsHide: true, maxBuffer: 1 << 20 }, (err, out) => resolve(err ? null : String(out))); }
  catch { resolve(null); }
});

// Read-only queries. The drive is the one holding Bob's models.
const PS = (drive) => `$ErrorActionPreference='SilentlyContinue'
$m = @(Get-CimInstance Win32_PhysicalMemory | ForEach-Object { @{ speed = $_.Speed; configured = $_.ConfiguredClockSpeed; part = [string]$_.PartNumber; gb = [math]::Round($_.Capacity / 1GB) } })
$b = @(Get-CimInstance Win32_Battery | ForEach-Object { @{ status = $_.BatteryStatus } })
$v = @(Get-CimInstance Win32_VideoController | ForEach-Object { @{ name = $_.Name; date = $_.DriverDate.ToString('yyyy-MM-dd'); vendor = [string]$_.AdapterCompatibility } })
$d = $null
$p = Get-Partition -DriveLetter '${drive}'
if ($p) { $k = Get-Disk -Number $p.DiskNumber; $pd = Get-PhysicalDisk | Where-Object { $_.DeviceId -eq [string]$k.Number } | Select-Object -First 1; $d = @{ media = [string]$pd.MediaType; bus = [string]$k.BusType } }
@{ memory = $m; battery = $b; video = $v; disk = $d } | ConvertTo-Json -Depth 4 -Compress`;

// 1.5.133, by CitizenFog and Bob (GitHub issue #25): Windows's own list of video controllers says which cards are really there,
// so nvidia-smi is only asked when one of them is NVIDIA. Without that list (Linux, Mac, or PowerShell said nothing)
// nvidia-smi is still tried, as before. Tests pass platform and run.
const isNvidia = (v) => /nvidia/i.test(`${v?.name || ''} ${v?.vendor || ''}`);
const isAmd = (v) => /\bamd\b|radeon|advanced micro devices/i.test(`${v?.name || ''} ${v?.vendor || ''}`);
const isIntel = (v) => /intel/i.test(`${v?.name || ''} ${v?.vendor || ''}`);
export async function gatherFacts(cfg, { bobPids = [], platform = process.platform, run: exec = run } = {}) {
  const run = exec;
  const facts = { platform };
  if (platform === 'win32') {
    const drive = (path.resolve(cfg.llamacpp?.ollamaModelsDir || path.join(cfg.agentDir || 'C:\\', 'models')).match(/^([A-Za-z]):/) || [])[1] || 'C';
    const out = await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', PS(drive.toUpperCase())], 30000);
    try { Object.assign(facts, JSON.parse(out)); } catch {}
    facts.drive = drive.toUpperCase();
  }
  const listed = Array.isArray(facts.video) && facts.video.length > 0;
  const gpu = !listed || facts.video.some(isNvidia) ? await run('nvidia-smi', ['--query-gpu=name,driver_version,memory.used,memory.total', '--format=csv,noheader,nounits']) : null;
  if (gpu) {
    const [name, driver, used, total] = gpu.split(/\r?\n/)[0].split(',').map((x) => x.trim());
    facts.nvidia = { name, driver, usedGB: Number(used) / 1024, totalGB: Number(total) / 1024 };
    const apps = await run('nvidia-smi', ['--query-compute-apps=pid,process_name,used_memory', '--format=csv,noheader,nounits']);
    facts.nvidia.apps = String(apps || '').split(/\r?\n/).map((l) => l.split(',').map((x) => x.trim())).filter((r) => r.length >= 3 && Number(r[0]))
      .map(([pid, name, mb]) => ({ pid: Number(pid), name: path.basename(name || ''), gb: Number(mb) / 1024 }))
      .filter((a) => !bobPids.includes(a.pid) && a.gb > 0);
  }
  return facts;
}

const gb = (n) => `${n >= 10 ? Math.round(n) : n.toFixed(1)} GB`;
// The rated speed is often only in the part number (UD5-6000, F5-6000J3038F16G, CMK32GX5M2B6000C36).
export function ratedSpeed(part) {
  const hits = String(part || '').match(/\d{4}/g) || [];
  const n = hits.map(Number).filter((x) => x >= 2400 && x <= 9600 && x % 100 === 0 || [2666, 2933, 3466, 3733].includes(Number(x)));
  return n.length ? Math.max(...n) : 0;
}

// facts -> { tips: [{ id, level: 'fix' | 'optional', title, why, steps[] }], fine: [text] }
export function tipsFrom(facts, { today = new Date() } = {}) {
  const tips = [], fine = [];
  const mem = (facts.memory || []).filter(Boolean);
  if (mem.length) {
    const now = Math.min(...mem.map((m) => Number(m.configured) || Number(m.speed) || 0));
    const rated = Math.max(0, ...mem.map((m) => Math.max(ratedSpeed(m.part), Number(m.speed) || 0)));
    if (now && rated > now + 200) {
      tips.push({ id: 'memory-speed', level: 'fix', title: `Your memory runs at ${now} MT/s, but it's rated for ${rated}`,
        why: 'Faster memory makes Bob quicker when he works on the processor or a brain doesn\'t fit the graphics card.',
        steps: ['This is a BIOS setting (EXPO on AMD boards, XMP on Intel boards). Bob can\'t change it.', 'Restart this replicant matrix and open the BIOS (usually by pressing Delete or F2 while it starts).', 'Turn on the memory profile: EXPO on AMD boards, XMP on Intel boards.', 'Save and restart. If this replicant matrix won\'t start, the BIOS goes back to the old setting on its own after a few tries.'] });
    } else if (now) fine.push(`Memory runs at ${now} MT/s${rated > now ? '' : rated ? ' (its rated speed)' : ''}.`);
  }
  const bat = (facts.battery || []).filter(Boolean);
  if (bat.length && bat.some((b) => Number(b.status) === 1)) {
    tips.push({ id: 'battery', level: 'fix', title: 'This laptop is running on battery', why: 'On battery, Windows and the graphics card slow down a lot to save power.',
      steps: ['Plug in the charger.', 'This is a Windows setting. Bob can\'t change it. In Windows Settings, open System, then Power & battery, and set Power mode to Best performance.'] });
  }
  const nv = (facts.video || []).find(isNvidia);
  if (nv?.date) {
    const days = Math.floor((today - new Date(nv.date)) / 86400000);
    if (days > 180) tips.push({ id: 'driver', level: 'fix', title: `Your NVIDIA driver is ${Math.round(days / 30)} months old`, why: 'Newer drivers often run AI engines faster and fix memory problems.',
      steps: ['This is a driver update. Bob can\'t change it.', 'Open the NVIDIA app (or GeForce Experience), go to Drivers, and install the latest Game Ready or Studio driver.'] });
    else fine.push(`NVIDIA driver is recent (${nv.date}).`);
  }
  // 1.5.133 (CitizenFog and Bob, #25): say an AMD or Intel graphics chip was seen, so nobody wonders whether Bob noticed it.
  const amd = (facts.video || []).find(isAmd);
  const plain = (n) => String(n || '').replace(/\s*\((?:R|TM|C)\)\s*/gi, ' ').replace(/\s+/g, ' ').trim(); // Windows's ® and ™ marks out
  if (amd) fine.push(`AMD graphics found: ${plain(amd.name) || 'AMD Radeon Graphics'}.`);
  const intel = !amd && !nv ? (facts.video || []).find(isIntel) : null;
  if (intel) fine.push(`Intel graphics found: ${plain(intel.name) || 'Intel Graphics'}.`);
  const d = facts.disk;
  if (d && (/hdd/i.test(d.media) || /usb/i.test(d.bus))) {
    tips.push({ id: 'disk', level: 'fix', title: `Bob's models are on a ${/usb/i.test(d.bus) ? 'USB drive' : 'hard drive'} (${facts.drive}:)`, why: 'Brains load from disk each time Bob wakes, so a slow drive adds many seconds to every first reply.',
      steps: ['Move the models folder to your fastest drive (an SSD inside this replicant matrix).', 'In Bob, open Settings, and point Bob at the new folder.'] });
  } else if (d?.media) fine.push(`Models are on a fast drive (${facts.drive}:).`);
  if (facts.nvidia) {
    const others = (facts.nvidia.apps || []).filter((a) => a.gb >= 0.5);
    const total = others.reduce((s, a) => s + a.gb, 0);
    if (total >= 1.5) {
      tips.push({ id: 'card-busy', level: 'fix', title: `Other apps hold ${gb(total)} of graphics memory`, why: 'Bob has less room on the graphics card, so his brains spill into RAM and answer slower.',
        steps: [`Close what you don't need before a big job: ${others.map((a) => `${a.name} (${gb(a.gb)})`).join(', ')}.`, 'Browsers, Parsec and paused games also use some graphics memory.'] });
    } else fine.push(`Graphics card: ${gb(facts.nvidia.totalGB)}, nothing big running alongside Bob.`);
    tips.push({ id: 'sysmem-fallback', level: 'optional', title: 'Optional: stop the graphics card from quietly borrowing RAM', why: 'When a brain doesn\'t quite fit, the driver borrows RAM and Bob slows down without saying why. With this setting, it fails clearly instead, and Bob makes it fit.',
      steps: ['This is a driver setting. Bob can\'t change it.', 'Right-click the desktop and open NVIDIA Control Panel.', 'Go to Manage 3D settings, then Global Settings.', 'Set "CUDA - Sysmem Fallback Policy" to "Prefer No Sysmem Fallback" and click Apply.'] });
  }
  return { tips, fine };
}
