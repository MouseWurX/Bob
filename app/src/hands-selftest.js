// Hands self-test (1.5.0): only when the user clicks "Self-test" in Settings, Hands. Everything happens in a
// throwaway folder under the inn (bob-selftest-<time>), which is removed afterwards. It doesn't need any Hand
// switched on, uses no model, and touches nothing of the user's: the dummy files are Bob's own.
//   1. Recycle a dummy file, Undo, and check it's back (on Windows through the real Recycle Bin).
//   2. Tidy 3 dummy files into folders by kind, Undo, and check they're back.
//   3. Run git --version.
//   4. Start a 30-second ping, press Stop, and check the process is gone.
//   5. Ask bob-schedule.ps1 for its Status (read-only: it only prints On or Off).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { planFiles, applyFiles, undoJob } from './hands-files.js';
import { runCommand } from './hands-run.js';
import { appDir } from './config.js';
import { usesBin } from './recycle.js';
import { sleep } from './util.js';

const WIN = process.platform === 'win32';
const alive = (pid) => { if (!pid) return false; try { process.kill(pid, 0); return true; } catch (e) { return e.code === 'EPERM'; } };

// Windows only: puts one file back from the Recycle Bin (the dummy one this test just threw away).
function restoreFromBin(original) {
  const dir = path.dirname(original), base = path.basename(original);
  const ps = `$ErrorActionPreference='Stop'; $bin=(New-Object -ComObject Shell.Application).NameSpace(10); $hit=$null; foreach ($i in $bin.Items()) { $from=$bin.GetDetailsOf($i,1); if ($from -ieq '${dir.replace(/'/g, "''")}' -and ([IO.Path]::GetFileName($i.Path) -like '$R*') -and ($i.Name -ieq '${base.replace(/'/g, "''")}' -or $i.Name -ieq '${path.parse(base).name.replace(/'/g, "''")}')) { $hit=$i } }; if (-not $hit) { 'NOTFOUND'; exit 0 }; Move-Item -LiteralPath $hit.Path -Destination '${original.replace(/'/g, "''")}'; $meta=Join-Path (Split-Path $hit.Path) ('$I'+([IO.Path]::GetFileName($hit.Path).Substring(2))); if (Test-Path -LiteralPath $meta) { Remove-Item -LiteralPath $meta -Force }; 'OK'`;
  const r = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', ps], { encoding: 'utf8', windowsHide: true, timeout: 60000 });
  return /OK\s*$/.test(r.stdout || '');
}

export async function selfTest(cfg, { log = () => {}, run = runCommand, platform = process.platform } = {}) {
  const root = path.join(cfg.innDir, `bob-selftest-${Date.now()}`);
  const work = path.join(root, 'work');
  fs.mkdirSync(work, { recursive: true });
  // A copy of the settings that only knows the throwaway folder, with its own undo journal.
  const tcfg = { ...cfg, dataDir: path.join(root, 'data'), hands: { ...(cfg.hands || {}), enabled: true, held: false, files: { on: true }, run: { on: true }, folders: [work] } };
  fs.mkdirSync(tcfg.dataDir, { recursive: true });
  const old = new Date(Date.now() - 3600_000);
  const dummy = (name) => { const f = path.join(work, name); fs.writeFileSync(f, `Bob's self-test file. Safe to delete.\n`); fs.utimesSync(f, old, old); return f; };
  const results = [];
  const step = async (name, fn) => {
    try { const r = await fn(); results.push({ name, ok: r.ok, says: r.says }); }
    catch (e) { results.push({ name, ok: false, says: e.message }); }
  };

  await step('Recycle a file, then Undo', async () => {
    const f = dummy('selftest-recycle.txt');
    const plan = planFiles(tcfg, { action: 'recycle', paths: [f] });
    const done = applyFiles(tcfg, plan);
    if (!done.job || fs.existsSync(f)) return { ok: false, says: `It didn't go${done.failed[0] ? `: ${done.failed[0].why}` : '.'}` };
    const u = undoJob(tcfg, done.job.id);
    if (fs.existsSync(f)) return { ok: true, says: !usesBin(tcfg, platform) ? 'It went to Bob\'s trash folder and came back.' : platform === 'win32' ? 'It went to the Recycle Bin and came back.' : 'It went to the Trash and came back.' };
    if (u.manual.includes(f) && platform === 'win32' && restoreFromBin(f) && fs.existsSync(f)) return { ok: true, says: 'It went to the Windows Recycle Bin, and came back out of it.' };
    return { ok: false, says: u.manual.length ? 'It went to the Recycle Bin but Bob couldn\'t bring it back: restore "selftest-recycle.txt" from there.' : `Undo didn't bring it back${u.failed[0] ? `: ${u.failed[0]}` : '.'}` };
  });

  await step('Tidy 3 files into folders, then Undo', async () => {
    const files = [dummy('selftest-photo.png'), dummy('selftest-notes.txt'), dummy('selftest-song.mp3')];
    const plan = planFiles(tcfg, { action: 'tidy', folder: work });
    const done = applyFiles(tcfg, plan);
    const moved = files.filter((f) => !fs.existsSync(f)).length;
    if (moved !== 3) return { ok: false, says: `Only ${moved} of 3 were sorted.` };
    undoJob(tcfg, done.job.id);
    const back = files.filter((f) => fs.existsSync(f)).length;
    const left = ['Pictures', 'Documents', 'Music'].filter((d) => fs.existsSync(path.join(work, d)));
    return back === 3 && !left.length ? { ok: true, says: 'Sorted into Pictures, Documents and Music, then put back, and the empty folders went away.' } : { ok: false, says: `${back} of 3 came back${left.length ? `; left behind: ${left.join(', ')}` : ''}.` };
  });

  await step('Run git --version', async () => {
    const r = await run({ cmd: 'git', args: ['--version'], cwd: work, timeoutMs: 20000 });
    if (r.why) return { ok: false, says: r.why };
    return r.code === 0 && /git version/i.test(r.out) ? { ok: true, says: r.out.trim().split(/\r?\n/)[0] } : { ok: false, says: `git said: ${r.out.trim().slice(0, 200) || `exit ${r.code}`}` };
  });

  await step('Start a 30-second ping, then Stop', async () => {
    const ac = new AbortController();
    let pid = 0;
    const t0 = Date.now();
    const p = run({ cmd: 'ping', args: platform === 'win32' ? ['-n', '30', '127.0.0.1'] : ['-c', '30', '127.0.0.1'], cwd: work, timeoutMs: 60000, signal: ac.signal, onStart: (id) => { pid = id; } });
    await sleep(1500);
    ac.abort();
    const r = await p;
    if (r.why) return { ok: false, says: r.why };
    await sleep(500);
    const secs = Math.round((Date.now() - t0) / 1000);
    if (r.killed !== 'stopped') return { ok: false, says: `It wasn't stopped (it ended by itself after ${secs} s).` };
    return alive(pid) ? { ok: false, says: `Stop was pressed, but the ping (process ${pid}) is still running.` } : { ok: true, says: `Stopped after ${secs} s and the process is gone.` };
  });

  await step('Ask the Windows task script for its Status (read-only)', async () => {
    if (platform !== 'win32') return { ok: true, says: 'Skipped: the Windows task is only on Windows.' };
    const script = path.join(appDir, 'installer', 'bob-schedule.ps1');
    if (!fs.existsSync(script)) return { ok: false, says: 'installer\\bob-schedule.ps1 is missing.' };
    const r = await run({ cmd: script, args: ['-Action', 'Status'], cwd: work, timeoutMs: 30000 });
    const last = r.out.trim().split(/\r?\n/).pop() || '';
    return r.code === 0 && /^(On|Off)$/.test(last) ? { ok: true, says: `The script works. The "Bob schedules" task is ${last === 'On' ? 'on' : 'off'}.` } : { ok: false, says: r.why || `It said: ${last || `exit ${r.code}`}` };
  });

  let cleaned = true;
  try { fs.rmSync(root, { recursive: true, force: true }); } catch { cleaned = false; }
  const passed = results.filter((r) => r.ok).length;
  log('hands', `self-test (your click): ${passed} of ${results.length} passed${cleaned ? '' : `; couldn't remove ${root}`}`);
  return { results, passed, total: results.length, cleaned, folder: cleaned ? '' : root };
}
