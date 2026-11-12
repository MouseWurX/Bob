// 1.5.211 "Keep this replicant matrix awake while Bob is on Discord" (Settings, Online services; off unless you turn it on).
// Bob going idle never drops Discord (he only frees the card and memory), but the computer going to sleep would. With
// this on, while Bob on Discord is connected, one small helper asks the system not to sleep. The screen may still turn
// off and lock as usual. It stops the moment Discord goes off or Bob closes.
//   Windows: PowerShell holding SetThreadExecutionState(ES_CONTINUOUS | ES_SYSTEM_REQUIRED).
//   Mac: caffeinate -i, tied to Bob's own process.
//   Linux: systemd-inhibit --what=sleep (no systemd: it says so in the log and does nothing).
//   Android: the app can't host the Discord bot, so this never runs there.
import { spawn as realSpawn } from 'node:child_process';

// Each helper ends by itself once Bob's own process is gone, so a crash never leaves the computer awake for good.
const winPs = (pid) => `$s='[DllImport("kernel32.dll")] public static extern uint SetThreadExecutionState(uint f);';$k=Add-Type -MemberDefinition $s -Name P -Namespace W -PassThru;while(Get-Process -Id ${Number(pid)} -ErrorAction SilentlyContinue){[void]$k::SetThreadExecutionState([uint32]2147483649);Start-Sleep -Seconds 50}`;

export function awakeCommand(platform = process.platform, pid = process.pid) {
  if (platform === 'win32') return ['powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', winPs(pid)]];
  if (platform === 'darwin') return ['caffeinate', ['-i', '-w', String(pid)]];
  if (platform === 'linux') return ['systemd-inhibit', ['--what=sleep', '--who=Bob', '--why=Bob is on Discord', '--mode=block', 'sh', '-c', `while kill -0 ${Number(pid)} 2>/dev/null; do sleep 50; done`]];
  return null;
}

export class KeepAwake {
  constructor({ spawn = realSpawn, platform = process.platform, log = () => {} } = {}) {
    this.spawn = spawn; this.platform = platform; this.log = log; this.child = null;
  }
  get on() { return Boolean(this.child); }
  // want: true keeps the computer awake, false lets it sleep again. Safe to call often.
  set(want) {
    if (want && !this.child) {
      const cmd = awakeCommand(this.platform);
      if (!cmd) return;
      try {
        const c = this.spawn(cmd[0], cmd[1], { stdio: 'ignore', windowsHide: true });
        c.on?.('error', (e) => { this.log(`couldn't keep the computer awake: ${e.message}`); if (this.child === c) this.child = null; });
        c.on?.('exit', () => { if (this.child === c) this.child = null; });
        this.child = c;
        this.log('keeping the computer awake while Bob is on Discord');
      } catch (e) { this.log(`couldn't keep the computer awake: ${e.message}`); }
    } else if (!want && this.child) {
      try { this.child.kill(); } catch {}
      this.child = null;
      this.log('the computer may sleep again');
    }
  }
}
