// Real headless Blender inside a lesson's throwaway home (15 Nov 2026, the owner: "every tool result must be real").
// write-lessons.mjs --real-tools --blender <exe> sends a lesson's run_command here when Bob runs Blender on a .py file.
// Only Blender, only headless, only a script inside the throwaway home, never through a shell. Anything else returns
// null and the caller keeps its honest stand-in. Runs go on a rental or in the cloud, never on the home PC.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const inside = (root, p) => { const r = path.resolve(root), f = path.resolve(p); return f === r || f.startsWith(r + path.sep); };

// The .py script Bob asked Blender to run, from run_command's { cmd, args } (already mapped to real paths), or ''.
export function blenderScript(args) {
  const cmd = String(args?.cmd || '').split(/[\\/]/).pop().toLowerCase().replace(/\.exe$/, '');
  if (cmd !== 'blender') return '';
  const a = [].concat(args?.args || []).map(String);
  const i = a.findIndex((x) => x === '--python' || x === '-P');
  const f = i >= 0 ? a[i + 1] : '';
  return f && /\.py$/i.test(f) ? f : '';
}

// Run it for real. sb: the lesson's sandbox (homeDir, toReal, neutral). exe: the Blender program on this machine.
// Returns the text Bob sees, or null when this call isn't a headless Blender script run inside the home.
export function blenderRun(sb, args, exe, { timeoutMs = 120000, spawn = spawnSync } = {}) {
  if (!sb?.homeDir || !exe) return null;
  const real = sb.toReal(args || {});
  const script = blenderScript(real);
  if (!script) return null;
  const cwd = real.cwd && inside(sb.homeDir, real.cwd) ? String(real.cwd) : sb.homeDir;
  const file = path.isAbsolute(script) ? script : path.join(cwd, script);
  if (!inside(sb.homeDir, file)) return 'Error: the script must be inside your own folders.';
  if (!fs.existsSync(file)) return `Error: ${sb.neutral(file)} was not found.`;
  // Fixed flags: no window, no user settings or add-ons, a Python error ends Blender with code 1.
  const r = spawn(String(exe), ['--background', '--factory-startup', '--python-exit-code', '1', '--python', file], {
    cwd, encoding: 'utf8', timeout: timeoutMs, windowsHide: true,
    env: { PATH: process.env.PATH || '', HOME: sb.homeDir, USERPROFILE: sb.homeDir, TMPDIR: sb.homeDir, BLENDER_USER_CONFIG: path.join(sb.homeDir, '.blender') }
  });
  const out = `${r.stdout || ''}${r.stderr || ''}`.replace(/\r\n/g, '\n');
  const timedOut = r.error?.code === 'ETIMEDOUT';
  const head = timedOut ? `Stopped: Blender took longer than ${Math.round(timeoutMs / 1000)} s.\n` : r.error ? `Error: ${r.error.message}\n` : `Exit code ${r.status}\n`;
  return sb.neutral(head + out.slice(-6000)) || '(no output)';
}
