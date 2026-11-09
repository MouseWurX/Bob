// The "Security and privacy" Hand: Bob as a security sidekick. Off until the user turns it on.
//   security_check   read-only health checks (Defender, firewall, updates, startup items, open ports). No card.
//   defender_scan    start a Defender quick / full / one-file scan, or fetch new definitions. Card first.
//   inspect_file     look at a download, script, email or document without opening or running it. No card.
//   strip_metadata   make clean copies of photos and Office files without their hidden details. Card first.
//   osint_lookup     public records about a website, link, email sender or internet address (needs web search on).
//   check_exposure   the user's own exposure: breaches of a site, how to check an email, the password box.
//   security_tips    Bob's notes on staying safe, op-sec habits and careful research (on the PC, no internet).
// Defence only. Bob never switches protection off, adds exclusions, allows or restores threats, disables startup
// items, or researches private people (where they live, who is behind a username, their phone number).
import fs from 'node:fs';
import path from 'node:path';
import { handOn, handOffWhy, handsOs } from './hands-settings.js';
import { macCheck } from './security-mac.js';
import { webOn, WEB_OFF } from './web.js';
import { canRead, canWrite, officeDir } from './hands-office.js';
import { findFfmpeg } from './office.js';
import { spawn } from 'node:child_process';
import { linuxCheck, clamscan, clamPlan, runClam, sayClam } from './security-linux.js';
import { PS, runPs, sayOverview, sayThreats, sayStartup, sayNetwork, mpCmdRun, scanArgs, runScan, sayScan } from './security-pc.js';
import { extOf, realKind, SAME, nameTricks, markOfTheWeb, sha256, scanScript, SCRIPT_EXT, readEmail, linkSigns, hiddenDetails, CLEANABLE, cleanJpeg, cleanPng, cleanWebp, cleanOffice } from './security-files.js';
import { cleanDomain, rdapDomain, rdapIp, dnsFacts, certHistory, followLink, breachesForSite, sayDomain, saySender, sayLink, sayIp, sayBreachesForSite, isPrivateHost } from './security-web.js';
import { tipsFor } from './security-guide.js';
import net from 'node:net';
import { freeName } from './util.js';

const fn = (name, description, properties, required = Object.keys(properties)) => ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } });
const str = (description, extra = {}) => ({ type: 'string', description, ...extra });
const off = (cfg) => { if (!handOn(cfg, 'security')) throw new Error(handOffWhy(cfg, 'security')); };
const needWeb = (cfg) => { if (!webOn(cfg)) throw new Error(WEB_OFF); };
const kb = (n) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);
const MARK = ['', 'ℹ', '⚠', '⛔'];
const MAX_TEXT = 1_000_000;
const MEDIA = ['mp3', 'm4a', 'flac', 'ogg', 'wav', 'mp4', 'mov', 'mkv', 'webm', 'm4v'];

// Never people-finding: these words in an OSINT request get a plain no.
export const PEOPLE = /\b(where (does|do|did) (he|she|they|this person|my ex)|home address|find (his|her|their|this person'?s?) (address|number|phone|real name|location|identity)|who is behind (this|the|that) (account|username|profile|handle)|dox+|track (him|her|them|someone|a person|my (ex|wife|husband|girlfriend|boyfriend|partner))|phone number lookup|reverse phone)\b/i;
export const NOT_PEOPLE = 'That would be researching a private person, which I don\'t do: finding where someone lives, who is behind an account, or their phone number is the kind of digging that hurts people, even when it starts as curiosity. I can check a website, a link, an email sender or a company, and I can help you check your own footprint. If someone is threatening or harassing you, keep the evidence and report it to the platform and the police.';

function verdict(signs) {
  const top = Math.max(0, ...signs.map((s) => s.level));
  return top >= 3 ? '⛔ Looks dangerous.' : top === 2 ? '⚠ Be careful: some warning signs.' : top === 1 ? 'ℹ A few things worth knowing, nothing alarming.' : '✓ Nothing alarming found.';
}
const listSigns = (signs) => signs.map((s) => `${MARK[s.level] || '-'} ${s.says}`).join('\n');

// ---------------------------------------------------------------- inspect_file

export async function inspectFile(cfg, { path: p, text }, { env = process.env, ps = runPs } = {}) {
  if (!p && text) return inspectText(String(text).slice(0, MAX_TEXT));
  const f = canRead(cfg, p);
  const st = fs.statSync(f);
  const fd = fs.openSync(f, 'r');
  const head = Buffer.alloc(Math.min(st.size, 0x8010));
  try { fs.readSync(fd, head, 0, head.length, 0); } finally { fs.closeSync(fd); }
  const ext = extOf(f), real = realKind(head);
  const signs = [], lines = [];
  for (const t of nameTricks(f)) signs.push({ level: 3, says: t });
  const fits = !ext ? true : real.kind === ext || (SAME[real.kind] || []).includes(ext) || (real.kind === 'text' && !/^(exe|dll|pdf|png|jpe?g|gif|webp|zip|docx|xlsx|pptx|mp[34])$/.test(ext));
  if (!fits) signs.push({ level: ['exe', 'lnk', 'ole', 'iso', 'zip'].includes(real.kind) ? 3 : 2, says: `its name says .${ext} but inside it is ${real.says}` });
  if (['exe', 'scr', 'com', 'pif', 'cpl', 'msi'].includes(ext) || real.kind === 'exe') signs.push({ level: 1, says: 'it is a program: it can do anything you can do once it runs' });
  if (['iso', 'img', 'vhd', 'vhdx'].includes(ext)) signs.push({ level: 2, says: 'disc images are used to slip programs past Windows\' "downloaded from the internet" warning' });
  if (ext === 'lnk' || real.kind === 'lnk') { const s = head.toString('utf16le') + head.toString('latin1'); signs.push({ level: /powershell|cmd\.exe|mshta|wscript|rundll32|http/i.test(s) ? 3 : 2, says: /powershell|cmd\.exe|mshta|wscript|rundll32|http/i.test(s) ? 'a shortcut that runs a command (a common email-attachment trick)' : 'a shortcut: it can point at anything' }); }
  const motw = markOfTheWeb(f);
  if (motw) lines.push(`Came from: ${motw.says}${motw.from ? ` (${motw.from})` : ''}${motw.page ? `, linked from ${motw.page}` : ''}.`);
  // Programs and scripts: is it signed by its maker?
  if (process.platform === 'win32' && (real.kind === 'exe' || ['msi', 'ps1', 'psm1', 'vbs', 'js', 'cab', 'appx', 'msix', 'sys', 'dll'].includes(ext))) {
    try {
      const sig = await ps(PS.signature, { env, extra: { BOB_SRC: f }, timeoutMs: 30_000 });
      if (sig.sig === 'Valid') lines.push(`Signed by: ${sig.signer} (signature checks out). That tells you who made it, not that it's safe.`);
      else signs.push({ level: real.kind === 'exe' ? 2 : 1, says: sig.sig === 'NotSigned' ? 'not signed by its maker, so there\'s no way to tell who made it' : `its signature is ${sig.sig}${sig.signer ? ` (claims ${sig.signer})` : ''}` });
    } catch {}
  }
  // Scripts, web pages and pasted-style text
  if (real.kind === 'text' && (SCRIPT_EXT.includes(ext) || !ext) && st.size <= MAX_TEXT) {
    const t = fs.readFileSync(f, 'utf8');
    const s = scanScript(t);
    for (const x of s.found) signs.push(x);
    if (s.decoded) lines.push(`The scrambled part says (decoded for reading only, not run):\n${s.decoded}`);
    if (s.urls.length) lines.push(`Addresses inside: ${s.urls.join(', ')}`);
  }
  // Emails
  if (ext === 'eml' && st.size <= 20e6) { const e = readEmail(fs.readFileSync(f, 'latin1')); lines.push(sayEmail(e)); signs.push(...e.signs); }
  // Documents, pictures and PDFs: risky parts and hidden details
  let details = null;
  if (['zip', 'pdf', 'jpg', 'png', 'webp'].includes(real.kind) && st.size <= 200e6) {
    details = hiddenDetails(f);
    signs.push(...details.risks);
  }
  const hash = st.size <= 2 * 1024 ** 3 ? await sha256(f) : '';
  const out = [`${path.basename(f)}: ${kb(st.size)}, really ${real.says}. ${verdict(signs)}`];
  if (signs.length) out.push(listSigns(signs.sort((a, b) => b.level - a.level)));
  out.push(...lines);
  if (details?.found.length) out.push(`Hidden details someone could read if you share it:\n${details.found.map((x) => `${MARK[x.level] || '-'} ${x.what}: ${x.value}`).join('\n')}\n(strip_metadata makes a clean copy${CLEANABLE.includes(ext) ? '' : ', for pictures and Word/Excel/PowerPoint files'}.)`);
  else if (details) out.push('No hidden personal details found inside.');
  if (hash) out.push(`SHA-256: ${hash} (paste it into virustotal.com to see what dozens of antiviruses think, without uploading the file).`);
  out.push('I only read the file; nothing was opened or run. A clean result isn\'t a guarantee.');
  return out.join('\n');
}

function sayEmail(e) {
  const auth = [e.spf && `SPF ${e.spf}`, e.dkim && `DKIM ${e.dkim}`, e.dmarc && `DMARC ${e.dmarc}`].filter(Boolean).join(', ');
  return `Email from ${e.from || '(no sender)'}${e.subject ? `, "${e.subject}"` : ''}${e.date ? `, ${e.date}` : ''}. ${auth ? `Checks by the receiving server: ${auth}.` : 'No sender checks recorded (paste the full headers to see them).'} ${e.hops ? `Passed through ${e.hops} mail servers.` : ''}${e.links.length ? `\nLinks: ${e.links.slice(0, 8).map((l) => `${l.shows && l.shows !== l.href ? `"${l.shows.slice(0, 40)}" → ` : ''}${linkSigns(l.href).site || l.href}`).join('; ')}` : ''}${e.attachments.length ? `\nAttachments: ${e.attachments.join(', ')}` : ''}`;
}

export function inspectText(t) {
  if (/^(received|from|return-path|delivered-to|message-id|subject|to|date|dkim-signature|authentication-results):/im.test(t.slice(0, 4000)) && /^from:/im.test(t)) {
    const e = readEmail(t);
    return `${verdict(e.signs)}\n${listSigns(e.signs)}\n${sayEmail(e)}\nI only read the text; no links were opened.`.replace(/\n\n+/g, '\n');
  }
  const s = scanScript(t);
  const urls = s.urls.map((u) => ({ u, l: linkSigns(u) }));
  const signs = [...s.found, ...urls.flatMap(({ u, l }) => (l.signs || []).filter((x) => x.level >= 2).map((x) => ({ level: x.level, says: `${l.site || u}: it ${x.says}` })))];
  const looksLikeCode = /[;{}$|]|\b(powershell|cmd|function|var|const|Set-|Get-|Invoke-|echo|curl|wget)\b/i.test(t);
  if (!looksLikeCode && !urls.length) return 'That reads like ordinary text, with no commands or links in it. If it\'s an email, paste it with its headers ("Show original" or "View source") and I can check where it really came from.';
  return [verdict(signs), listSigns(signs.sort((a, b) => b.level - a.level)), s.decoded ? `The scrambled part says (decoded for reading only, not run):\n${s.decoded}` : '', urls.length ? `Links: ${urls.map(({ l, u }) => l.site || u).join(', ')}` : '', looksLikeCode && signs.some((x) => x.level >= 2) ? 'Don\'t paste this into PowerShell, Run (Windows+R) or a terminal.' : '', 'I only read it; nothing was run or opened.'].filter(Boolean).join('\n');
}

// ---------------------------------------------------------------- strip_metadata


export function planStrip(cfg, args, env = process.env) {
  const paths = [].concat(args.paths || args.path || []).filter(Boolean).map(String).slice(0, 51);
  if (!paths.length) throw new Error('Which files? Give their full paths.');
  if (paths.length > 50) throw new Error('I clean up to 50 files at a time.');
  const ffmpeg = findFfmpeg(cfg, env), taken = new Set();
  const rows = paths.map((p, i) => {
    const row = { id: String(i + 1), op: 'clean', from: p, to: '', note: '' };
    try {
      row.from = canRead(cfg, p);
      const ext = extOf(row.from);
      if (!CLEANABLE.includes(ext) && !(MEDIA.includes(ext) && ffmpeg)) throw new Error(MEDIA.includes(ext) ? 'sound and video need FFmpeg (Settings, Show advanced settings, Engines)' : ext === 'pdf' ? 'I can\'t clean PDFs yet; re-save it from the app that made it with its "remove personal information" option' : `I can clean pictures (jpg, png, webp), Word, Excel and PowerPoint files${ffmpeg ? ', and sound and video' : ''}, not .${ext}`);
      const { name } = path.parse(row.from);
      const want = path.join(args.folder ? path.resolve(String(args.folder)) : path.dirname(row.from), `${name}-clean.${ext}`);
      let to;
      try { to = canWrite(cfg, freeName(want, taken)); } catch (e) { if (args.folder) throw e; to = canWrite(cfg, freeName(path.join(officeDir(cfg), path.basename(want)), taken)); }
      taken.add(to.toLowerCase());
      row.to = to;
      const d = CLEANABLE.includes(ext) ? hiddenDetails(row.from) : { found: [] };
      row.note = `${d.found.length ? `${[...new Set(d.found.map((x) => x.what))].slice(0, 6).join(', ')} removed${/^(docx|xlsx|pptx|docm|xlsm|pptm)$/.test(ext) ? ' (comments and tracked changes stay: remove those in Office)' : ''}` : MEDIA.includes(ext) ? 'Tags like title, artist, location and recording device removed (with FFmpeg)' : 'Nothing personal found, but a clean copy is made anyway'}; the original isn't touched`;
      row.media = MEDIA.includes(ext);
    } catch (e) { row.blocked = e.message; }
    return row;
  });
  const ok = rows.filter((r) => !r.blocked);
  if (!ok.length) throw new Error(rows.length === 1 ? rows[0].blocked : `None of those can be cleaned: ${rows.map((r) => `${path.basename(r.from)} (${r.blocked})`).join('; ')}`);
  return { rows, label: `Make ${ok.length === 1 ? 'a clean copy' : `${ok.length} clean copies`} without hidden details` };
}

function ffmpegStrip(exe, src, out, signal) {
  return new Promise((resolve, reject) => {
    const c = spawn(exe, ['-nostdin', '-n', '-hide_banner', '-loglevel', 'error', '-i', src, '-map', '0', '-map_metadata', '-1', '-map_chapters', '-1', '-c', 'copy', '-fflags', '+bitexact', out], { windowsHide: true });
    let err = '';
    const stop = () => { try { c.kill(); } catch {} };
    signal?.addEventListener?.('abort', stop, { once: true });
    c.stderr.on('data', (d) => { err += d; });
    c.on('error', reject);
    c.on('close', (code) => { if (code === 0) resolve(); else { try { fs.rmSync(out, { force: true }); } catch {} reject(new Error(err.trim().split('\n').pop() || `FFmpeg stopped (${code})`)); } });
  });
}

export async function cleanOne(src, out, { ffmpeg, signal } = {}) {
  const ext = extOf(src);
  if (['jpg', 'jpeg'].includes(ext)) fs.writeFileSync(out, cleanJpeg(fs.readFileSync(src)), { flag: 'wx' });
  else if (ext === 'png') fs.writeFileSync(out, cleanPng(fs.readFileSync(src)), { flag: 'wx' });
  else if (ext === 'webp') fs.writeFileSync(out, cleanWebp(fs.readFileSync(src)), { flag: 'wx' });
  else if (/^(docx|xlsx|pptx|docm|xlsm|pptm)$/.test(ext)) cleanOffice(src, out);
  else if (MEDIA.includes(ext) && ffmpeg) await ffmpegStrip(ffmpeg.exe, src, out, signal);
  else throw new Error(`can't clean .${ext}`);
}

// ---------------------------------------------------------------- the tools

export function securityTools(brain, { env = process.env, fetchImpl, resolver, ps = runPs, scan = runScan, os_ = handsOs(), macRun, linux = {} } = {}) {
  const cfg = brain.cfg;
  // Linux: the same tools, read the Linux way (security-linux.js), and ClamAV in place of Defender.
  const LINUX = os_ === 'linux';
  const log = (k, t) => brain.log?.(k, t);
  const t = {};

  t.security_check = {
    schema: fn('security_check', os_ === 'linux' ? 'Check this PC\'s security (read-only, changes nothing): overview = antivirus (ClamAV if installed), firewall, updates; threats = explains there is no antivirus history on Linux; startup = what starts when you sign in, with anything suspicious marked; network = programs listening for connections.' : os_ === 'mac' ? 'Check this Mac\'s security (read-only, changes nothing): overview = firewall, FileVault, Gatekeeper, System Integrity Protection, updates; threats = what macOS does about malware; startup = what starts at login or with the Mac, with anything suspicious marked; network = programs listening for connections.' : 'Check this PC\'s security (read-only, changes nothing): overview = antivirus, firewall, updates; threats = what Defender found lately, explained; startup = what starts with Windows, with anything suspicious marked; network = programs listening for connections.', {
      area: str('overview, threats, startup or network', { enum: ['overview', 'threats', 'startup', 'network'] })
    }),
    async run({ area = 'overview' }, ctx) {
      off(cfg);
      const a = ['overview', 'threats', 'startup', 'network'].includes(area) ? area : 'overview';
      if (os_ === 'mac') { const said = await macCheck(a, macRun); log('security', `checked ${a} (Mac)`); return said; }
      if (LINUX) { const text = await linuxCheck(a, { env, ...linux }); log('security', `checked ${a}`); return text; }
      const r = await ps(PS[a], { env, signal: ctx?.signal, timeoutMs: a === 'startup' ? 120_000 : 60_000 });
      log('security', `checked ${a}`);
      return a === 'overview' ? sayOverview(r) : a === 'threats' ? sayThreats(r) : a === 'startup' ? sayStartup(r) : sayNetwork(r);
    },
    summary: ({ area }) => `security check: ${area || 'overview'}`
  };

  const scanPlan = (args) => {
    const kind = ['quick', 'full', 'file', 'update'].includes(args.kind) ? args.kind : 'quick';
    let target = '';
    if (kind === 'file') {
      target = path.resolve(String(args.path || ''));
      if (!args.path || !(path.isAbsolute(String(args.path)) || /^[a-zA-Z]:[\\/]/.test(String(args.path)))) throw new Error('A one-file scan needs the full path of a file or folder.');
      if (!fs.existsSync(target)) throw new Error(`There's nothing at ${target}.`);
    }
    if (LINUX) { clamPlan(kind, target, { home: env.HOME }); if (!clamscan(env)) throw new Error('ClamAV isn\'t installed, so I can\'t scan. Install "ClamAV" from your software centre and ask again.'); return { kind, target, args: [] }; }
    if (!mpCmdRun(env)) throw new Error('Microsoft Defender\'s scanner isn\'t on this replicant matrix (another antivirus may be in charge), so I can\'t start a scan. Use that antivirus\'s own window.');
    return { kind, target, args: scanArgs(kind, target) };
  };
  t.defender_scan = {
    schema: LINUX ? fn('defender_scan', 'Scan with ClamAV, if it is installed (Linux has no Defender). quick = the Downloads and Desktop folders; file = one file or folder (like a download). ClamAV only reports what it finds; it moves nothing. full and update need administrator rights on Linux, so they are left to the user. {{USER}} sees a card first.', {
      kind: str('quick or file', { enum: ['quick', 'file'] }),
      path: str('file only: full path of the file or folder to scan.')
    }, ['kind']) : fn('defender_scan', 'Start a Microsoft Defender scan or update its virus definitions. quick = a few minutes, the usual places; full = the whole PC, an hour or more, runs in the background; file = one file or folder (like a download); update = fetch the newest definitions. Defender deals with anything it finds as it is set to. {{USER}} sees a card first.', {
      kind: str('quick, full, file or update', { enum: ['quick', 'full', 'file', 'update'] }),
      path: str('file only: full path of the file or folder to scan.')
    }, ['kind']),
    approvalGroup: 'security',
    check(args) {
      off(cfg);
      const p = scanPlan(args);
      if (LINUX) return { text: `${p.kind === 'file' ? `Scan with ClamAV (just this): ${p.target}` : 'Scan Downloads and Desktop with ClamAV'}. It only reports what it finds; nothing is moved or deleted.`, command: ['clamscan', ...clamPlan(p.kind, p.target, { home: env.HOME })].join(' ') };
      const what = { quick: 'Scan with Defender (quick, a few minutes)', full: 'Scan with Defender (full: the whole replicant matrix, an hour or more, in the background)', file: `Scan with Defender (just this): ${p.target}`, update: 'Update Defender\'s virus definitions' }[p.kind];
      return { text: `${what}. Defender handles anything it finds the way it is set to (usually quarantine).`, command: ['MpCmdRun.exe', ...p.args].join(' ') };
    },
    async run(args, ctx) {
      off(cfg);
      const p = scanPlan(args);
      if (LINUX) {
        ctx?.emit?.({ type: 'status', text: 'ClamAV is scanning…' });
        const r = await (linux.clam || runClam)(p.kind, p.target, { env, signal: ctx?.signal });
        log('security', `clamav ${p.kind}${p.target ? ` ${p.target}` : ''}: exit ${r.code}`);
        return sayClam(p.kind, r);
      }
      ctx?.emit?.({ type: 'status', text: p.kind === 'update' ? 'Updating Defender…' : 'Defender is scanning…' });
      const r = await scan(p.kind, p.target, { env, signal: ctx?.signal });
      log('security', `defender ${p.kind}${p.target ? ` ${p.target}` : ''}: ${r.started ? 'started' : `exit ${r.code}`}`);
      return sayScan(p.kind, r);
    },
    summary: ({ kind, path: p }) => `Defender ${kind || 'quick'}${p ? `: ${path.basename(String(p))}` : ''}`
  };

  t.inspect_file = {
    schema: fn('inspect_file', 'Check whether a download, script, email (.eml), Office file, PDF, picture or shortcut looks dangerous, WITHOUT opening or running it: what it really is, tricks in its name, where it came from, its signature, risky code, phishing signs, and hidden details (GPS, author) someone could read if it is shared. Or pass text: a pasted email (with headers), command or script.', {
      path: str('Full path of the file.'),
      text: str('Or: pasted text to check (an email with its headers, a command, a script, a link).')
    }, []),
    async run(args) {
      off(cfg);
      if (!args.path && !args.text) throw new Error('Give a file path, or the text to check.');
      const out = await inspectFile(cfg, args, { env, ps });
      log('security', `inspected ${args.path ? path.basename(String(args.path)) : 'pasted text'}`);
      return out;
    },
    summary: ({ path: p }) => (p ? `inspect ${path.basename(String(p))}` : 'inspect pasted text')
  };

  t.strip_metadata = {
    schema: fn('strip_metadata', 'Make clean copies of photos (jpg, png, webp), Word, Excel and PowerPoint files (and sound or video, if FFmpeg is set up) without their hidden details: GPS location, camera, author, company, AI prompt. The originals stay as they are; copies are named name-clean. {{USER}} sees a card first.', {
      paths: { type: 'array', items: { type: 'string' }, description: 'Full paths of the files.' },
      folder: str('Optional: the folder for the clean copies.')
    }, ['paths']),
    approvalGroup: 'security',
    check(args, ctx) {
      off(cfg);
      const plan = planStrip(cfg, args, env);
      if (ctx) ctx.stripPlan = plan;
      return { text: `${plan.label}. The originals stay as they are, and nothing is overwritten.`, plan: plan.rows.map(({ id, op, from, to, note, blocked }) => ({ id, op, from, to, note, blocked })) };
    },
    async run(args, ctx) {
      off(cfg);
      const plan = ctx?.stripPlan || planStrip(cfg, args, env);
      if (ctx) ctx.stripPlan = null;
      const want = ctx?.picked ? new Set(ctx.picked.map(String)) : null;
      const ffmpeg = findFfmpeg(cfg, env);
      const saved = [], failed = [];
      for (const row of plan.rows) {
        if (row.blocked || (want && !want.has(row.id))) continue;
        if (ctx?.signal?.aborted) break;
        try {
          canRead(cfg, row.from);
          const out = canWrite(cfg, freeName(row.to));
          fs.mkdirSync(path.dirname(out), { recursive: true });
          await cleanOne(row.from, out, { ffmpeg, signal: ctx?.signal });
          const left = CLEANABLE.includes(extOf(out)) ? hiddenDetails(out).found.filter((x) => !/Comments|Tracked|Speaker|Title|Template/.test(x.what)) : [];
          saved.push(`Saved ${out} (${kb(fs.statSync(out).size)}).${left.length ? ` Still inside: ${left.map((x) => x.what).join(', ')}.` : ''}`);
          if (ctx) (ctx.made ||= []).push(out);
        } catch (e) { failed.push(`${path.basename(row.from)} (${e.message})`); }
      }
      log('security', `cleaned ${saved.length} file(s)${failed.length ? `, ${failed.length} failed` : ''}`);
      if (!saved.length) return `Error: nothing was cleaned. ${failed.join('; ') || 'Nothing was ticked.'}`;
      return [...saved, failed.length ? `Not done: ${failed.join('; ')}` : '', 'Check the picture itself too: house numbers, street signs, screens and mail in the background.'].filter(Boolean).join('\n');
    },
    summary: ({ paths }) => `clean ${[].concat(paths || []).length} file(s)`
  };

  t.osint_lookup = {
    schema: fn('osint_lookup', 'Research from public records, to tell whether something is genuine: site = a website\'s age, registrar, certificate history, email settings, look-alike names and breaches; link = where a link really goes (follow: true also follows short links hop by hop without loading the page); sender = the domain behind an email address; ip = which network owns an internet address. Never for researching private people.', {
      kind: str('site, link, sender or ip', { enum: ['site', 'link', 'sender', 'ip'] }),
      value: str('The website, link, email address or IP address.'),
      follow: { type: 'boolean', description: 'link only: also follow its redirects (this contacts the link\'s site).' }
    }, ['kind', 'value']),
    async run({ kind, value, follow }, ctx) {
      off(cfg);
      const v = String(value || '').trim();
      if (!v) throw new Error('What should I look up?');
      if (PEOPLE.test(v)) return NOT_PEOPLE;
      const o = { signal: ctx?.signal, ...(fetchImpl ? { fetchImpl } : {}) };
      if (kind === 'link') {
        const url = /^[a-z]+:\/\//i.test(v) ? v : `https://${v}`;
        let hops = null;
        if (follow) { needWeb(cfg); hops = await followLink(url, o).catch((e) => [{ url, note: e.message }]); }
        const site = (() => { try { return cleanDomain(new URL((hops?.at(-1)?.url) || url).hostname); } catch { return ''; } })();
        let facts = '';
        if (site && webOn(cfg)) { const [rdap, dnsf] = await Promise.all([rdapDomain(site, o).catch(() => null), dnsFacts(site, { resolver }).catch(() => null)]); facts = sayDomain(site, { rdap, dnsf }); }
        log('security', `looked up link ${site}`);
        return sayLink(url, hops, facts) + (webOn(cfg) ? '' : '\n(Web search is off, so I only read the address itself. Switch it on and I can check the site\'s age and records too.)');
      }
      needWeb(cfg);
      if (kind === 'ip') {
        const ip = v.replace(/^\[|\]$/g, '');
        if (!net.isIP(ip)) throw new Error(`"${v}" isn't an IP address.`);
        if (isPrivateHost(ip)) return `${ip} is a private address: it's a device on a home or work network (yours or someone's), not something on the internet, so there's no public record to look up.`;
        log('security', `looked up ip ${ip}`);
        return sayIp(ip, await rdapIp(ip, o));
      }
      const domain = cleanDomain(v);
      const [rdap, dnsf] = await Promise.all([rdapDomain(domain, o).catch(() => null), dnsFacts(domain, { resolver }).catch(() => null)]);
      log('security', `looked up ${kind} ${domain}`);
      if (kind === 'sender') return saySender(v.includes('@') ? v : `someone@${domain}`, dnsf, rdap);
      const [certs, breaches] = await Promise.all([certHistory(domain, o).catch(() => null), breachesForSite(domain, o).catch(() => null)]);
      return sayDomain(domain, { rdap, dnsf, certs, breaches });
    },
    summary: ({ kind, value }) => `look up ${kind || 'site'}: ${String(value || '').slice(0, 60)}`
  };

  t.check_exposure = {
    schema: fn('check_exposure', '{{USER}}\'s own exposure. site = has a website (one they have an account with) been breached, and what leaked; email = how to check their own email address for breaches; password = how to check a password safely (never ask for a password in chat); footprint = how to see what is public about themselves.', {
      kind: str('site, email, password or footprint', { enum: ['site', 'email', 'password', 'footprint'] }),
      value: str('site: the website, like adobe.com.')
    }, ['kind']),
    async run({ kind, value }, ctx) {
      off(cfg);
      if (kind === 'password') return 'Never type a password into the chat (it would be saved in the chat history). Use the "Check a password safely" box under the Security and privacy Hand in Settings, Show advanced settings, Hands: it scrambles the password on this replicant matrix and only sends the first 5 characters of the scramble to Have I Been Pwned, so the password itself never leaves.';
      if (kind === 'email') return 'Your email: go to haveibeenpwned.com and type it in (free on their site), and switch on their "Notify me" alerts. Mozilla Monitor does the same with removal help. I don\'t send your email address anywhere myself. For every breach it lists, change that site\'s password and any place you reused it, and turn on two-step sign-in. Want me to check a particular site\'s breaches? Give me its name.';
      if (kind === 'footprint') return tipsFor('footprint');
      needWeb(cfg);
      const domain = cleanDomain(value);
      log('security', `breach list for ${domain}`);
      return sayBreachesForSite(domain, await breachesForSite(domain, { signal: ctx?.signal, ...(fetchImpl ? { fetchImpl } : {}) }));
    },
    summary: ({ kind, value }) => `exposure: ${kind}${value ? ` ${value}` : ''}`
  };

  t.security_tips = {
    schema: fn('security_tips', 'Your notes on staying safe and researching well. Topics: phishing, passwords, 2fa, updates, backups, wifi, router, sharing, scams, defender, hacked, ransomware, accounts, devices, privacy, opsec, search (search operators), osint (checking what\'s real), footprint. Read the topic before advising.', {
      topic: str('A topic from the list, or a few words.')
    }),
    async run({ topic }) { off(cfg); return tipsFor(topic); },
    summary: ({ topic }) => `notes: ${topic || 'topics'}`
  };

  return t;
}
