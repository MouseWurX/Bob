// 1.5.34: Windows' own "pick a folder" window, for Settings > Projects (so nobody has to type a path).
// Windows: PowerShell's FolderBrowserDialog on top of Bob's window. Mac: AppleScript's choose folder. Linux: zenity or kdialog.
// Returns the folder, or '' if cancelled.
import { execFile } from 'node:child_process';
import { PS_OWNER } from './own-models.js';

// 1.5.41: also for Settings > Where Bob saves things ('save'), where making a new folder is allowed.
// 1.5.125: and for Bob's home folder ('home'): his models, programs, notes and settings.
const script = (purpose) => [
  '[Console]::OutputEncoding = [Text.Encoding]::UTF8',
  'Add-Type -AssemblyName System.Windows.Forms',
  ...PS_OWNER, // 1.5.177: shown and brought to the front first, so the picker opens on top
  '$d = New-Object System.Windows.Forms.FolderBrowserDialog',
  purpose === 'bundle' ? "$d.Description = 'Pick where Bob saves the help bundle'" : purpose === 'backup' ? "$d.Description = 'Pick where Bob saves his backup'" : purpose === 'save' ? "$d.Description = 'Pick the folder Bob saves pictures, clips, songs and sounds in'" : purpose === 'home' ? "$d.Description = 'Pick the folder Bob keeps his things in (models, programs, notes, settings). An empty folder, or a new one.'" : "$d.Description = 'Pick a project folder for Bob'",
  ['save', 'bundle', 'home', 'backup'].includes(purpose) ? '$d.ShowNewFolderButton = $true' : '$d.ShowNewFolderButton = $false',
  "if ($d.ShowDialog($owner) -eq 'OK') { [Console]::Out.Write($d.SelectedPath) }",
  '$owner.Dispose()'
].join('; ');

// Mac: AppleScript's "choose folder" (part of macOS). The prompt is fixed text, never anything typed by someone.
const macScript = (purpose) => `POSIX path of (choose folder with prompt "${purpose === 'bundle' ? 'Pick where Bob saves the help bundle' : purpose === 'backup' ? 'Pick where Bob saves his backup' : purpose === 'save' ? 'Pick the folder Bob saves pictures, clips, songs and sounds in' : purpose === 'home' ? 'Pick the folder Bob keeps his things in (an empty or new folder)' : 'Pick a project folder for Bob'}")`;

const TITLES = { bundle: 'Pick where Bob saves the help bundle', backup: 'Pick where Bob saves his backup', save: 'Pick the folder Bob saves pictures, clips, songs and sounds in', home: 'Pick the folder Bob keeps his things in (an empty or new folder)', project: 'Pick a project folder for Bob' };

export function pickFolder({ run = execFile, platform = process.platform, purpose = 'project', pick = globalThis.bobPick } = {}) {
  // 1.5.177: in Bob's own window, Electron's picker on top of it (globalThis.bobPick, lent by electron/main.cjs).
  if (typeof pick === 'function') return Promise.resolve(pick({ title: TITLES[purpose] || TITLES.project, folder: true, newFolder: ['save', 'bundle', 'home', 'backup'].includes(purpose) })).then((f) => String(f || ''));
  if (platform === 'darwin') {
    return new Promise((resolve, reject) => {
      run('/usr/bin/osascript', ['-e', macScript(purpose)], { timeout: 10 * 60e3 }, (err, out, stderr) => {
        // Cancel is error -128: not a failure, just no folder.
        if (err && /-128/.test(String(stderr || err.message))) return resolve('');
        if (err) return reject(new Error("The Mac's folder picker didn't open. Type the folder instead."));
        const p = String(out || '').trim();
        resolve(p.length > 1 ? p.replace(/\/$/, '') : p);
      });
    });
  }
  if (platform === 'linux') {
    // zenity (GNOME and most desktops), else kdialog (KDE).
    const tries = [['zenity', ['--file-selection', '--directory', '--title', purpose === 'bundle' ? 'Pick where Bob saves the help bundle' : purpose === 'backup' ? 'Pick where Bob saves his backup' : purpose === 'save' ? 'Pick the folder Bob saves things in' : purpose === 'home' ? 'Pick the folder Bob keeps his things in' : 'Pick a project folder for Bob']], ['kdialog', ['--getexistingdirectory', process.env.HOME || '/']]];
    return new Promise((resolve, reject) => {
      const next = (i) => {
        if (i >= tries.length) return reject(new Error('No folder picker (zenity or kdialog) on this replicant matrix. Type the folder instead.'));
        run(tries[i][0], tries[i][1], { timeout: 10 * 60e3 }, (err, out) => {
          if (err && err.code === 'ENOENT') return next(i + 1);
          resolve(err ? '' : String(out || '').trim()); // exit code 1 = cancelled
        });
      };
      next(0);
    });
  }
  if (platform !== 'win32') return Promise.reject(new Error('Picking a folder this way only works on Windows, Mac and Linux. Type the folder instead.'));
  return new Promise((resolve, reject) => {
    run('powershell.exe', ['-NoProfile', '-STA', '-ExecutionPolicy', 'Bypass', '-Command', script(purpose)], { timeout: 10 * 60e3, windowsHide: true }, (err, out) => {
      if (err && !String(out || '').trim()) return reject(new Error("Windows' folder picker didn't open. Type the folder instead."));
      resolve(String(out || '').trim());
    });
  });
}
