// Jobs, Clickable file:line links (job-helps.js): open a file at a line in your editor. Only files Bob may open
// (the same check as Open), only on this replicant matrix itself (server.js checks that).
import fs from 'node:fs';
import { spawn } from 'node:child_process';
import { resolveMention, allowedFile, openFile } from './files.js';
import { cleanJobHelps, editorUrl } from './job-helps.js';

export function openAt(cfg, p, line, { shell = globalThis.bobShell, platform = process.platform, run = spawn } = {}) {
  const file = resolveMention(cfg, String(p || ''));
  if (!file || !allowedFile(cfg, file)) throw new Error('That file is outside the folders Bob may open.');
  if (!fs.existsSync(file)) throw new Error('That file isn\'t there any more.');
  const { editor } = cleanJobHelps(cfg.jobHelps);
  const url = editorUrl(editor, file, line);
  if (!url) return { ...openFile(cfg, file, { reveal: true }), how: 'folder' }; // "Show it in its folder": scripts never open by themselves
  if (shell?.openUrl) { shell.openUrl(url); return { ok: true, file, how: editor }; }
  // Bob without his window (npm run server): the system's own opener hands the address to the editor.
  const [cmd, args] = platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]] : platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  run(cmd, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref?.();
  return { ok: true, file, how: editor };
}
