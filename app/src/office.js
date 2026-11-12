// Converting files and working on office documents (the "Office documents and converting" Hand).
// Three helpers, each started only for the job in hand and closed again straight after, so Bob stays light:
//   - LibreOffice (or Apache OpenOffice) for documents, spreadsheets and presentations. Bob uses one already on
//     the PC if he finds it; otherwise it's an opt-in download in Settings, Engines (pinned version and checksum).
//     It runs hidden with Bob's own profile, so a LibreOffice window you have open is never touched, and it never
//     runs macros in the files it opens. The work itself is done by src/office-uno.py.
//   - Pictures (PNG, JPG, BMP, GIF, TIFF) with what Windows already has. WebP needs FFmpeg.
//   - FFmpeg for audio and video (and WebP pictures): opt-in download in Settings, Engines (pinned, about 100 MB).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, execFile, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { killTree as stopGroup, groupSpawnOptions } from './platform.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const UNO_SCRIPT = path.join(here, 'office-uno.py');
const WIN = process.platform === 'win32';
const MAC = process.platform === 'darwin';

// ---------------------------------------------------------------- kinds of file

export const DOC_KINDS = {
  writer: { name: 'text document', in: ['doc', 'docx', 'odt', 'rtf', 'txt', 'md', 'html', 'htm', 'wpd', 'pages', 'fodt', 'epub'], out: ['pdf', 'docx', 'doc', 'odt', 'rtf', 'txt', 'html', 'epub', 'fodt'] },
  calc: { name: 'spreadsheet', in: ['xls', 'xlsx', 'xlsm', 'ods', 'csv', 'tsv', 'numbers', 'fods'], out: ['pdf', 'xlsx', 'xls', 'ods', 'csv', 'html', 'fods'] },
  impress: { name: 'presentation', in: ['ppt', 'pptx', 'pps', 'ppsx', 'odp', 'key', 'fodp'], out: ['pdf', 'pptx', 'ppt', 'odp', 'png', 'jpg', 'html', 'fodp'] },
  draw: { name: 'drawing', in: ['odg', 'vsd', 'vsdx', 'cdr', 'pub'], out: ['pdf', 'odg', 'png', 'jpg', 'svg'] }
};
export const PICTURES = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tif', 'tiff', 'webp'];
const BUILTIN_PICTURES = ['png', 'jpg', 'jpeg', 'bmp', 'gif', 'tif', 'tiff']; // what Windows can read and write by itself
export const AUDIO = ['mp3', 'wav', 'ogg', 'flac', 'm4a', 'aac', 'opus', 'wma'];
export const VIDEO = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'wmv', 'm4v'];

const NAMES = {
  pdf: 'PDF', docx: 'Word document', doc: 'old Word document', odt: 'OpenDocument text', rtf: 'Rich Text', txt: 'plain text', md: 'Markdown', html: 'web page', htm: 'web page', epub: 'e-book',
  xlsx: 'Excel spreadsheet', xls: 'old Excel spreadsheet', xlsm: 'Excel spreadsheet with macros', ods: 'OpenDocument spreadsheet', csv: 'CSV table', tsv: 'tab-separated table',
  pptx: 'PowerPoint presentation', ppt: 'old PowerPoint presentation', pps: 'PowerPoint show', ppsx: 'PowerPoint show', odp: 'OpenDocument presentation', odg: 'OpenDocument drawing', svg: 'SVG picture',
  png: 'PNG picture', jpg: 'JPG picture', jpeg: 'JPG picture', bmp: 'BMP picture', gif: 'GIF', tif: 'TIFF picture', tiff: 'TIFF picture', webp: 'WebP picture',
  mp3: 'MP3 audio', wav: 'WAV audio', ogg: 'Ogg audio', flac: 'FLAC audio', m4a: 'M4A audio', aac: 'AAC audio', opus: 'Opus audio', wma: 'WMA audio',
  mp4: 'MP4 video', mkv: 'MKV video', webm: 'WebM video', mov: 'MOV video', avi: 'AVI video', wmv: 'WMV video', m4v: 'M4V video',
  fodt: 'flat OpenDocument text', fods: 'flat OpenDocument spreadsheet', fodp: 'flat OpenDocument presentation', numbers: 'Numbers spreadsheet', key: 'Keynote presentation', pages: 'Pages document', wpd: 'WordPerfect document', vsd: 'Visio drawing', vsdx: 'Visio drawing', cdr: 'CorelDRAW drawing', pub: 'Publisher file'
};
export const extOf = (p) => path.extname(String(p || '')).slice(1).toLowerCase();
export const kindName = (ext) => NAMES[ext] || `.${ext} file`;
export const docKindOf = (ext) => Object.entries(DOC_KINDS).find(([, k]) => k.in.includes(ext))?.[0] || null;

// How a file gets from one kind to another: 'office', 'picture', 'media', or a plain reason it can't.
export function routeFor(fromExt, toExt) {
  const to = toExt === 'jpeg' ? 'jpg' : toExt === 'tif' ? 'tiff' : toExt;
  if (!toExt) return { why: 'Say what to turn it into, like pdf, docx or mp3.' };
  if (fromExt === to || (fromExt === 'jpeg' && to === 'jpg') || (fromExt === 'tif' && to === 'tiff')) return { why: `It's already a ${kindName(fromExt)}.` };
  const dk = docKindOf(fromExt);
  if (dk) {
    if (DOC_KINDS[dk].out.includes(to)) return { route: 'office', kind: dk };
    return { why: `A ${DOC_KINDS[dk].name} (${kindName(fromExt)}) can be turned into: ${DOC_KINDS[dk].out.join(', ')}.` };
  }
  if (fromExt === 'pdf') return { why: 'I can\'t turn a PDF back into a good Word file, because the layout breaks. I can read its words (office_read) and make a new Word document from them (office_make) instead.' };
  if (PICTURES.includes(fromExt)) {
    if (PICTURES.includes(to)) return { route: 'picture' };
    if (to === 'pdf') return { route: 'office', kind: 'draw', picture: true };
    return { why: `A picture can be turned into: ${['png', 'jpg', 'bmp', 'gif', 'tiff', 'webp', 'pdf'].join(', ')}.` };
  }
  if (AUDIO.includes(fromExt)) {
    if (AUDIO.includes(to)) return { route: 'media' };
    return { why: `Sound can be turned into: ${AUDIO.filter((x) => x !== 'wma').join(', ')}.` };
  }
  if (VIDEO.includes(fromExt) || fromExt === 'gif') {
    if (VIDEO.includes(to) || AUDIO.includes(to) || to === 'gif') return { route: 'media' };
    return { why: `A video can be turned into another video (${VIDEO.filter((x) => x !== 'wmv').join(', ')}), a GIF, or just its sound (mp3, wav...).` };
  }
  return { why: `I don't know how to convert a ${kindName(fromExt)}.` };
}

// ---------------------------------------------------------------- finding the helpers

const exists = (p) => { try { return Boolean(p) && fs.statSync(p).isFile(); } catch { return false; } };

// Where an office program might be. Bob's own copy first, then the usual places it's installed.
export function officeCandidates(cfg, env = process.env) {
  const own = path.join(cfg.agentDir || '', 'libreoffice');
  const list = [];
  if (cfg.officePath) list.push({ dir: path.dirname(cfg.officePath), where: 'set' });
  for (const d of [own, path.join(own, 'program'), path.join(own, 'LibreOffice', 'program'), ...ownDeep(own)]) list.push({ dir: d, where: 'own' });
  if (WIN || env.BOB_FAKE_WIN) {
    for (const base of [env.ProgramFiles, env.ProgramW6432, env['ProgramFiles(x86)'], env.LOCALAPPDATA && path.join(env.LOCALAPPDATA, 'Programs')].filter(Boolean)) {
      list.push({ dir: path.join(base, 'LibreOffice', 'program'), where: 'pc' });
      list.push({ dir: path.join(base, 'OpenOffice 4', 'program'), where: 'pc' });
      list.push({ dir: path.join(base, 'OpenOffice.org 3', 'program'), where: 'pc' });
    }
    for (const base of ['C:\\PortableApps', path.join(os.homedir(), 'PortableApps')]) list.push({ dir: path.join(base, 'LibreOfficePortable', 'App', 'libreoffice', 'program'), where: 'pc' });
  } else {
    for (const d of ['/usr/lib/libreoffice/program', '/opt/libreoffice/program', '/usr/lib64/libreoffice/program', '/Applications/LibreOffice.app/Contents/MacOS', path.join(os.homedir(), 'Applications', 'LibreOffice.app', 'Contents', 'MacOS'), '/Applications/OpenOffice.app/Contents/MacOS']) list.push({ dir: d, where: 'pc' });
  }
  return list;
}

// The admin-install unpack puts LibreOffice a few folders down; look for program\soffice.exe up to 3 deep.
function ownDeep(root) {
  const found = [];
  const walk = (d, depth) => {
    let ents = [];
    try { ents = fs.readdirSync(d, { withFileTypes: true }); } catch { return; }
    for (const e of ents) {
      if (!e.isDirectory()) continue;
      const p = path.join(d, e.name);
      if (e.name.toLowerCase() === 'program') found.push(p);
      else if (depth < 3) walk(p, depth + 1);
    }
  };
  walk(root, 0);
  return found;
}

// { soffice, python, name, version, where, dir } or null. version is read from the program folder (no start-up).
export function findOffice(cfg, env = process.env) {
  if (env.BOB_SOFFICE && exists(env.BOB_SOFFICE)) {
    return { soffice: env.BOB_SOFFICE, python: env.BOB_OFFICE_PYTHON || (WIN ? 'python.exe' : 'python3'), name: 'LibreOffice', version: '', where: 'set', dir: path.dirname(env.BOB_SOFFICE) };
  }
  for (const c of officeCandidates(cfg, env)) {
    const soffice = ['soffice.exe', 'soffice', 'soffice.bin'].map((n) => path.join(c.dir, n)).find(exists);
    if (!soffice) continue;
    // LibreOffice and OpenOffice for Windows bring their own Python (with the office bridge, "uno") in program\.
    // On Linux the bridge is the system python3 package (python3-uno).
    // On a Mac, LibreOffice.app keeps its Python (with uno) in Contents/Resources/python, next to Contents/MacOS.
    const py = ['python.exe', 'python', 'python3'].map((n) => path.join(c.dir, n)).find(exists) || (c.dir.endsWith(path.join('Contents', 'MacOS')) && exists(path.join(c.dir, '..', 'Resources', 'python')) ? path.join(c.dir, '..', 'Resources', 'python') : null) || (WIN ? null : exists('/usr/bin/python3') ? '/usr/bin/python3' : 'python3');
    if (!py) continue;
    const open = /openoffice/i.test(c.dir);
    return { soffice, python: py, name: open ? 'Apache OpenOffice' : 'LibreOffice', version: versionIn(c.dir), where: c.where, dir: c.dir };
  }
  return null;
}

// "25.8.2.2" from program\version.ini (Windows) or the brand file; '' if it isn't there.
function versionIn(dir) {
  for (const f of ['version.ini', 'versionrc']) {
    try {
      const m = fs.readFileSync(path.join(dir, f), 'utf8').match(/^(?:MsiProductVersion|ProductVersion|OOOBaseVersion)=(\d+(?:\.\d+)+)/mi);
      if (m) return m[1].trim();
    } catch {}
  }
  return '';
}

// FFmpeg: Bob's own copy (Settings, Engines), then one already on the PC (on PATH, as winget and Scoop install it).
export function findFfmpeg(cfg, env = process.env) {
  if (env.BOB_FFMPEG && exists(env.BOB_FFMPEG)) return { exe: env.BOB_FFMPEG, where: 'set' };
  const exe = WIN ? 'ffmpeg.exe' : 'ffmpeg';
  for (const d of [path.join(cfg.agentDir || '', 'ffmpeg'), path.join(cfg.agentDir || '', 'ffmpeg', 'bin')]) if (exists(path.join(d, exe))) return { exe: path.join(d, exe), where: 'own' };
  for (const d of String(env.PATH || env.Path || '').split(path.delimiter).filter(Boolean)) if (exists(path.join(d, exe))) return { exe: path.join(d, exe), where: 'pc' };
  return null;
}

// ---------------------------------------------------------------- running a job

// One office job at a time: they share Bob's office profile, and two at once would fight over it.
let chain = Promise.resolve();
const oneAtATime = (fn) => { const p = chain.then(fn, fn); chain = p.catch(() => {}); return p; };

function killTree(child) {
  if (!child?.pid) return;
  if (WIN) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 8000 }, () => {});
  else stopGroup(child); // Mac and Linux: the whole group, so a LibreOffice the helper started goes too
}

// Runs one job in LibreOffice through office-uno.py. Resolves the helper's answer; throws with a plain reason.
export function officeJob(cfg, job, { signal, timeoutMs = 180_000, office = findOffice(cfg) } = {}) {
  if (!office) return Promise.reject(new Error(OFFICE_MISSING));
  return oneAtATime(() => new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error('Stopped.'));
    const profile = path.join(cfg.agentDir || os.tmpdir(), 'office-profile');
    const env = { ...process.env, BOB_SOFFICE: office.soffice, BOB_OFFICE_PROFILE: profile, PYTHONIOENCODING: 'utf-8' };
    // LibreOffice's own Python needs its program folder first; a stray PYTHONHOME from another Python breaks it.
    delete env.PYTHONHOME; delete env.PYTHONPATH;
    if (WIN) env.PATH = `${office.dir}${path.delimiter}${env.PATH || env.Path || ''}`;
    const child = spawn(office.python, [UNO_SCRIPT], { ...groupSpawnOptions(), env, cwd: office.dir && fs.existsSync(office.dir) ? office.dir : undefined, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '', err = '', done = false;
    const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); fn(); };
    const onAbort = () => finish(() => { killTree(child); reject(new Error('Stopped.')); });
    const timer = setTimeout(() => finish(() => { killTree(child); reject(new Error(`LibreOffice took longer than ${Math.round(timeoutMs / 60000) || 1} minutes, so I stopped it.`)); }), timeoutMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.stdout.on('data', (d) => { out += d; });
    child.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    child.on('error', (e) => finish(() => reject(new Error(`Couldn't start ${office.name}'s helper: ${e.message}`))));
    child.on('close', () => finish(() => {
      const line = out.trim().split(/\r?\n/).filter((l) => l.startsWith('{')).pop();
      let ans = null;
      try { ans = JSON.parse(line); } catch {}
      if (!ans) return reject(new Error(/No module named '?uno/i.test(err) ? `${office.name}'s Python can't find its office bridge (uno). Reinstalling ${office.name} usually fixes it.` : `${office.name} stopped without an answer. ${err.trim().split(/\r?\n/).pop() || ''}`.trim()));
      if (!ans.ok) return reject(new Error(ans.error || 'LibreOffice said no, without a reason.'));
      resolve(ans);
    }));
    child.stdin.end(JSON.stringify(job));
  }));
}

export const OFFICE_MISSING = 'There\'s no LibreOffice (or OpenOffice) on this PC that I can use. The user can install LibreOffice from libreoffice.org, or get it in Settings, Engines, Engine downloads, "LibreOffice" (about 350 MB, opt-in). I find either by myself.';
export const FFMPEG_MISSING = 'Audio, video and WebP conversions need FFmpeg, which isn\'t set up. The user can get it in Settings, Engines, Engine downloads, "FFmpeg" (about 100 MB, opt-in).';

// ---------------------------------------------------------------- pictures, with what Windows has

// PowerShell + System.Drawing (part of Windows). Paths go in as environment values, never inside the script text.
const PICTURE_PS = `$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.Drawing
$src=$env:BOB_SRC; $out=$env:BOB_OUT; $w=[int]$env:BOB_WIDTH; $q=[int]$env:BOB_QUALITY
$img=[System.Drawing.Image]::FromFile($src)
try {
  if ($img.PropertyIdList -contains 274) { $o=$img.GetPropertyItem(274).Value[0]
    $flip=@{2='RotateNoneFlipX';3='Rotate180FlipNone';4='Rotate180FlipX';5='Rotate90FlipX';6='Rotate90FlipNone';7='Rotate270FlipX';8='Rotate270FlipNone'}[[int]$o]
    if ($flip) { $img.RotateFlip([System.Drawing.RotateFlipType]::$flip) } }
  $nw=$img.Width; $nh=$img.Height
  if ($w -gt 0 -and $w -lt $nw) { $nh=[int][Math]::Round($img.Height*$w/$img.Width); $nw=$w }
  $bmp=New-Object System.Drawing.Bitmap $nw,$nh
  $g=[System.Drawing.Graphics]::FromImage($bmp)
  $ext=[IO.Path]::GetExtension($out).ToLower()
  if ($ext -in '.jpg','.jpeg','.bmp') { $g.Clear([System.Drawing.Color]::White) }
  $g.InterpolationMode=[System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img,0,0,$nw,$nh); $g.Dispose()
  $fmt=@{'.png'='Png';'.jpg'='Jpeg';'.jpeg'='Jpeg';'.bmp'='Bmp';'.gif'='Gif';'.tif'='Tiff';'.tiff'='Tiff'}[$ext]
  if ($fmt -eq 'Jpeg') {
    $codec=[System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $ps=New-Object System.Drawing.Imaging.EncoderParameters 1
    $ps.Param[0]=New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality),([long]$q)
    $bmp.Save($out,$codec,$ps)
  } else { $bmp.Save($out,[System.Drawing.Imaging.ImageFormat]::$fmt) }
  $bmp.Dispose()
  Write-Output "$($nw)x$($nh)"
} finally { $img.Dispose() }`;

// Mac: sips (part of macOS) reads and writes these, and reads iPhone photos (HEIC) too.
const SIPS_FORMAT = { png: 'png', jpg: 'jpeg', jpeg: 'jpeg', bmp: 'bmp', gif: 'gif', tif: 'tiff', tiff: 'tiff' };
export function sipsArgs({ src, out, width = 0, quality = 90 }) {
  const to = SIPS_FORMAT[extOf(out)];
  const w = Math.max(0, Math.round(Number(width) || 0));
  return ['-s', 'format', to, ...(to === 'jpeg' ? ['-s', 'formatOptions', String(Math.min(100, Math.max(30, Number(quality) || 90)))] : []), ...(w ? ['--resampleWidth', String(w)] : []), src, '--out', out];
}
function sipsJob(job, { signal, timeoutMs }) {
  return new Promise((resolve, reject) => {
    const child = execFile('/usr/bin/sips', sipsArgs(job), { timeout: timeoutMs }, (e, stdout, stderr) => {
      signal?.removeEventListener?.('abort', stop);
      if (e) return reject(new Error(`macOS couldn't convert that picture: ${String(stderr || e.message).trim().split(/\r?\n/).pop()}`));
      resolve({ size: '' });
    });
    const stop = () => killTree(child);
    signal?.addEventListener?.('abort', stop, { once: true });
  });
}

export function pictureJob({ src, out, width = 0, quality = 90 }, { signal, timeoutMs = 60_000, ffmpeg = null } = {}) {
  const a = extOf(src), b = extOf(out);
  if (MAC && (BUILTIN_PICTURES.includes(a) || ['heic', 'heif'].includes(a)) && BUILTIN_PICTURES.includes(b)) return sipsJob({ src, out, width, quality }, { signal, timeoutMs });
  const builtin = WIN && BUILTIN_PICTURES.includes(a) && BUILTIN_PICTURES.includes(b);
  if (!builtin) {
    if (!ffmpeg) return Promise.reject(new Error(WIN ? FFMPEG_MISSING : 'Pictures need FFmpeg on this system.'));
    return mediaJob({ src, out, width }, { signal, timeoutMs, ffmpeg, picture: true });
  }
  return new Promise((resolve, reject) => {
    const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
    const child = execFile(ps, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', PICTURE_PS],
      { windowsHide: true, timeout: timeoutMs, env: { ...process.env, BOB_SRC: src, BOB_OUT: out, BOB_WIDTH: String(Math.max(0, Number(width) || 0)), BOB_QUALITY: String(Math.min(100, Math.max(30, Number(quality) || 90))) } },
      (e, stdout, stderr) => {
        signal?.removeEventListener?.('abort', stop);
        if (e) return reject(new Error(`Windows couldn't convert that picture: ${String(stderr || e.message).trim().split(/\r?\n/)[0]}`));
        resolve({ size: String(stdout).trim() });
      });
    const stop = () => killTree(child);
    signal?.addEventListener?.('abort', stop, { once: true });
  });
}

// ---------------------------------------------------------------- audio and video, with FFmpeg

// The settings for each kind of file Bob makes. Plain, widely playable choices.
const AUDIO_OUT = {
  mp3: ['-c:a', 'libmp3lame', '-q:a', '2'], ogg: ['-c:a', 'libvorbis', '-q:a', '5'], opus: ['-c:a', 'libopus', '-b:a', '128k'], flac: ['-c:a', 'flac'],
  wav: ['-c:a', 'pcm_s16le'], m4a: ['-c:a', 'aac', '-b:a', '192k'], aac: ['-c:a', 'aac', '-b:a', '192k']
};
const VIDEO_OUT = {
  mp4: ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-movflags', '+faststart'],
  m4v: ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'],
  mov: ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k'],
  mkv: ['-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-c:a', 'aac', '-b:a', '192k'],
  webm: ['-c:v', 'libvpx-vp9', '-crf', '32', '-b:v', '0', '-c:a', 'libopus', '-b:a', '128k'],
  avi: ['-c:v', 'mpeg4', '-q:v', '3', '-c:a', 'libmp3lame', '-q:a', '3'],
  wmv: ['-c:v', 'wmv2', '-b:v', '2M', '-c:a', 'wmav2', '-b:a', '160k']
};
const TIME = /^(?:\d{1,2}:)?\d{1,2}:\d{2}(?:\.\d+)?$|^\d+(?:\.\d+)?$/;

export function ffmpegArgs({ src, out, start = '', end = '', width = 0 }, { picture = false } = {}) {
  const to = extOf(out);
  if (start && !TIME.test(String(start))) throw new Error(`"${start}" isn't a time like 1:30 or 90.`);
  if (end && !TIME.test(String(end))) throw new Error(`"${end}" isn't a time like 1:30 or 90.`);
  const w = Math.max(0, Math.round(Number(width) || 0));
  const a = ['-hide_banner', '-nostdin', '-n', '-loglevel', 'error', '-i', src];
  if (start) a.push('-ss', String(start));
  if (end) a.push('-to', String(end));
  if (picture) {
    if (w) a.push('-vf', `scale='min(${w},iw)':-2`);
    a.push('-frames:v', '1');
    if (to === 'webp') a.push('-c:v', 'libwebp', '-quality', '88');
    if (to === 'jpg' || to === 'jpeg') a.push('-q:v', '2');
  } else if (AUDIO.includes(to)) {
    a.push('-vn', ...(AUDIO_OUT[to] || []));
  } else if (to === 'gif') {
    const scale = w ? `scale='min(${w},iw)':-2:flags=lanczos` : "scale='min(720,iw)':-2:flags=lanczos";
    a.push('-an', '-vf', `fps=12,${scale},split[a][b];[a]palettegen[p];[b][p]paletteuse`);
  } else {
    if (w) a.push('-vf', `scale='min(${w},iw)':-2`);
    a.push(...(VIDEO_OUT[to] || []));
  }
  a.push(out);
  return a;
}

export function mediaJob(args, { signal, timeoutMs = 30 * 60_000, ffmpeg, picture = false } = {}) {
  if (!ffmpeg) return Promise.reject(new Error(FFMPEG_MISSING));
  let list;
  try { list = ffmpegArgs(args, { picture }); } catch (e) { return Promise.reject(e); }
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg.exe, list, { ...groupSpawnOptions(), windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '', done = false;
    const finish = (fn) => { if (done) return; done = true; clearTimeout(timer); signal?.removeEventListener?.('abort', onAbort); fn(); };
    const onAbort = () => finish(() => { killTree(child); try { fs.rmSync(args.out, { force: true }); } catch {} reject(new Error('Stopped.')); });
    const timer = setTimeout(() => finish(() => { killTree(child); try { fs.rmSync(args.out, { force: true }); } catch {} reject(new Error(`FFmpeg ran past ${Math.round(timeoutMs / 60000)} minutes, so I stopped it.`)); }), timeoutMs);
    signal?.addEventListener?.('abort', onAbort, { once: true });
    child.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-8000); });
    child.on('error', (e) => finish(() => reject(new Error(`Couldn't start FFmpeg: ${e.message}`))));
    child.on('close', (code) => finish(() => {
      if (code === 0) return resolve({});
      try { fs.rmSync(args.out, { force: true }); } catch {}
      reject(new Error(`FFmpeg couldn't do it (code ${code}): ${err.trim().split(/\r?\n/).slice(-2).join(' ').slice(0, 300) || 'no reason given'}`));
    }));
  });
}

// For Settings and Bob's own Help: what's found right now.
export function officeView(cfg) {
  const o = findOffice(cfg), f = findFfmpeg(cfg);
  return {
    office: o ? { name: o.name, version: o.version, where: o.where, dir: o.dir } : null,
    ffmpeg: f ? { where: f.where, exe: f.exe } : null,
    pictures: WIN || MAC ? 'built in' : (f ? 'FFmpeg' : null)
  };
}

// For tests: is a real LibreOffice usable here (with the Python bridge)?
export function officeUsableHere(cfg) {
  const o = findOffice(cfg);
  if (!o) return false;
  const r = spawnSync(o.python, ['-c', 'import uno'], { encoding: 'utf8', timeout: 20000 });
  return r.status === 0;
}
