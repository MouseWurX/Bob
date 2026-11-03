// The file side of the "Security and privacy" Hand: look at a download, script, email or document WITHOUT
// opening or running it, and find (and clean) the hidden details a photo or document carries before you share it.
// Everything here reads bytes; nothing is executed, and Office files are never opened in Office.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import { readZipList, writeZip } from './zip.js';

const WIN = process.platform === 'win32';
export const extOf = (p) => path.extname(String(p || '')).slice(1).toLowerCase();

// ---------------------------------------------------------------- what a file really is

const MAGIC = [
  ['exe', (b) => b[0] === 0x4d && b[1] === 0x5a, 'a Windows program (exe/dll)'],
  ['zip', (b) => b[0] === 0x50 && b[1] === 0x4b && b[2] === 3 && b[3] === 4, 'a zip (also how docx/xlsx/pptx/jar/apk files are built)'],
  ['ole', (b) => b.readUInt32BE(0) === 0xd0cf11e0, 'an old-style Office or installer file (doc/xls/ppt/msi/msg)'],
  ['pdf', (b) => b.toString('latin1', 0, 5) === '%PDF-', 'a PDF'],
  ['png', (b) => b.readUInt32BE(0) === 0x89504e47, 'a PNG picture'],
  ['jpg', (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff, 'a JPG picture'],
  ['gif', (b) => b.toString('latin1', 0, 4) === 'GIF8', 'a GIF'],
  ['webp', (b) => b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP', 'a WebP picture'],
  ['rar', (b) => b.toString('latin1', 0, 4) === 'Rar!', 'a RAR archive'],
  ['7z', (b) => b[0] === 0x37 && b[1] === 0x7a && b[2] === 0xbc && b[3] === 0xaf, 'a 7-Zip archive'],
  ['lnk', (b) => b.readUInt32LE(0) === 0x4c && b[4] === 0x01 && b[5] === 0x14, 'a Windows shortcut (.lnk)'],
  ['elf', (b) => b.readUInt32BE(0) === 0x7f454c46, 'a Linux program'],
  ['iso', (b) => b.length > 0x8006 && b.toString('latin1', 0x8001, 0x8006) === 'CD001', 'a disc image (ISO)'],
  ['rtf', (b) => b.toString('latin1', 0, 5) === '{\\rtf', 'a Rich Text document'],
  ['mp4', (b) => b.toString('latin1', 4, 8) === 'ftyp', 'a video or sound file (MP4 family)']
];
export const SAME = { exe: ['exe', 'dll', 'scr', 'com', 'sys', 'cpl', 'ocx', 'msstyles'], zip: ['zip', 'docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'jar', 'apk', 'odt', 'ods', 'odp', 'epub', 'vsix', 'nupkg', 'appx', 'msix', 'xpi', 'crx', 'kmz', 'cbz', '3mf'], ole: ['doc', 'xls', 'ppt', 'msi', 'msg', 'pub', 'vsd', 'dot', 'xlt', 'pps'], jpg: ['jpg', 'jpeg', 'jfif'], mp4: ['mp4', 'm4a', 'm4v', 'mov', '3gp', 'heic', 'avif'], iso: ['iso', 'img'] };
const RUNNABLE = ['exe', 'scr', 'com', 'pif', 'bat', 'cmd', 'ps1', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'wsh', 'hta', 'msi', 'lnk', 'cpl', 'jar', 'reg', 'iso', 'img', 'vhd', 'vhdx', 'chm', 'appx', 'msix', 'url', 'scf', 'xll', 'one'];
export const SCRIPT_EXT = ['ps1', 'psm1', 'bat', 'cmd', 'vbs', 'vbe', 'js', 'jse', 'wsf', 'hta', 'sh', 'py', 'reg', 'url', 'html', 'htm', 'svg', 'txt'];

export function realKind(head) {
  if (!head || head.length < 8) return { kind: 'tiny', says: 'almost empty' };
  for (const [kind, test, says] of MAGIC) { try { if (test(head)) return { kind, says }; } catch {} }
  const text = head.subarray(0, 4096);
  const bin = [...text].filter((c) => c < 9 || (c > 13 && c < 32)).length;
  return bin < text.length * 0.02 ? { kind: 'text', says: 'plain text (a script, page or document)' } : { kind: 'data', says: 'some other kind of data' };
}

export function nameTricks(file) {
  const name = path.basename(file);
  const out = [];
  if (/[‮‭‎‏⁦-⁩]/.test(name)) out.push('its name has a hidden right-to-left character, a trick to make "exe" look like "txt" or "pdf"');
  const parts = name.toLowerCase().split('.');
  if (parts.length > 2 && RUNNABLE.includes(parts.at(-1)) && /^(pdf|docx?|xlsx?|pptx?|jpe?g|png|txt|mp[34]|zip|rtf)$/.test(parts.at(-2))) out.push(`it has a double ending (".${parts.at(-2)}.${parts.at(-1)}"): it pretends to be a ${parts.at(-2)} but is really a .${parts.at(-1)}`);
  if (/\s{5,}/.test(name)) out.push('its name has a long run of spaces, often used to push the real ending out of sight');
  return out;
}

// "Mark of the Web": Windows notes where a downloaded file came from in a hidden stream next to it.
export function markOfTheWeb(file) {
  if (!WIN) return null;
  try {
    const t = fs.readFileSync(`${file}:Zone.Identifier`, 'utf8');
    const zone = Number((t.match(/ZoneId=(\d)/) || [])[1]);
    return { zone, from: (t.match(/HostUrl=(.+)/) || [])[1]?.trim() || '', page: (t.match(/ReferrerUrl=(.+)/) || [])[1]?.trim() || '', says: { 0: 'this PC', 1: 'your local network', 2: 'a trusted site', 3: 'the internet', 4: 'a restricted (blocked) site' }[zone] || 'somewhere unknown' };
  } catch { return null; }
}

export function sha256(file) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    fs.createReadStream(file).on('data', (d) => h.update(d)).on('end', () => resolve(h.digest('hex'))).on('error', reject);
  });
}

// ---------------------------------------------------------------- scripts and pasted commands

// [what to look for, how bad (1 = worth knowing, 2 = suspicious, 3 = dangerous), what it means in plain words]
export const SCRIPT_SIGNS = [
  [/-(e|ec|en|enc|enco|encodedcommand)\s+[A-Za-z0-9+/=]{20,}/i, 3, 'runs a PowerShell command hidden in scrambled (Base64) text'],
  [/\b(Invoke-WebRequest|iwr|Invoke-RestMethod|irm|DownloadString|DownloadFile|DownloadData|Net\.WebClient|Start-BitsTransfer|bitsadmin\s+\/transfer|certutil\s.*-urlcache|curl(\.exe)?\s+-|wget\s+http)\b/i, 2, 'downloads something from the internet'],
  [/\b(IEX|Invoke-Expression)\b|\|\s*iex\b|\.Invoke\(\)|ExecuteGlobal|\beval\s*\(/i, 2, 'runs text as code (often code it just downloaded or unscrambled)'],
  [/(curl|wget)[^|\n]*\|\s*(ba|z)?sh\b|\b(irm|iwr)\b[^|\n]*\|\s*iex/i, 3, 'downloads a script and runs it in one go, without you seeing it'],
  [/-w(in|indowstyle)?\s+h(idden)?\b|-WindowStyle\s+Hidden|\bvbHide\b|,\s*0\s*,\s*(true|false)\s*\)/i, 2, 'hides its window'],
  [/-(ep|exec|executionpolicy)\s+bypass|-nop\b|-noprofile\b.*-w/i, 1, 'skips PowerShell\'s safety setting'],
  [/Set-MpPreference|Add-MpPreference|DisableRealtimeMonitoring|DisableBehaviorMonitoring|ExclusionPath|ExclusionProcess|\bamsi(utils|InitFailed|ScanBuffer)\b/i, 3, 'tries to switch off or blind the antivirus'],
  [/vssadmin\s+delete|wbadmin\s+delete|shadowcopy\s+delete|bcdedit[^\n]*recoveryenabled\s+no|cipher\s+\/w/i, 3, 'deletes backups or restore points (ransomware does this first)'],
  [/CurrentVersion\\Run|schtasks(\.exe)?\s+\/create|Register-ScheduledTask|New-ScheduledTask|\\Start Menu\\Programs\\Startup|New-Service|sc(\.exe)?\s+create/i, 2, 'sets itself up to start with Windows'],
  [/\b(mshta|regsvr32|rundll32|installutil|cmstp|msbuild|wmic\s+process\s+call\s+create|forfiles|pcalua)\b/i, 2, 'uses a built-in Windows tool that malware borrows to run code'],
  [/Login Data|\\Cookies|Local State|Web Data|wallet\.dat|\.kdbx|\blsass\b|mimikatz|sekurlsa|Get-Credential|\\Microsoft\\Protect\\|logins\.json|key4\.db/i, 3, 'goes after saved passwords, browser cookies or crypto wallets'],
  [/discord(app)?\.com\/api\/webhooks|api\.telegram\.org\/bot|pastebin\.com\/raw|ngrok\.io|transfer\.sh|anonfiles/i, 3, 'sends things to (or fetches from) a chat app or paste site, a common way to steal data'],
  [/Net\.Sockets\.TCPClient|\bnc(at)?(\.exe)?\s+(-e|-c)|\/dev\/tcp\/|reverse.?shell/i, 3, 'opens a remote control connection (a "reverse shell")'],
  [/xmrig|stratum\+tcp|cryptonight|coinhive|minerd/i, 3, 'mines cryptocurrency with your PC'],
  [/netsh\s+advfirewall\s+set[^\n]*state\s+off|Set-NetFirewallProfile[^\n]*-Enabled\s+(False|0)/i, 3, 'switches the firewall off'],
  [/\[char\]\s*\d+\s*\+|-join\s*\(|FromBase64String|-bxor|\[Convert\]::|\w`\w`\w|\^[a-z]\^[a-z]|[A-Za-z0-9+/]{300,}={0,2}/i, 2, 'scrambles its own text so you can\'t easily read what it does'],
  [/WScript\.Shell|Shell\.Application|ADODB\.Stream|MSXML2\.(Server)?XMLHTTP|WinHttp\.WinHttpRequest|CreateObject\(/i, 1, 'drives Windows from a script (normal in admin scripts, common in malware)'],
  [/Remove-Item[^\n]*-Recurse[^\n]*-Force|rd\s+\/s\s+\/q|del\s+\/[fsq]|format\s+[a-z]:/i, 2, 'deletes files or folders in bulk'],
  [/reg(\.exe)?\s+(add|delete)|Set-ItemProperty\s+-Path\s+['"]?HK/i, 1, 'changes the registry'],
  [/(I am not a robot|verify (that )?you are (a )?human|press\s+(the\s+)?win(dows)?\s*(key)?\s*\+\s*r|paste (it|this) (into|in) (the )?(run|terminal|powershell)|ctrl\s*\+\s*v)/i, 3, 'a fake "prove you\'re human" trick that gets you to paste a command into Windows yourself']
];

// A Base64 PowerShell command, unscrambled for reading only (never run).
export function decodeEncoded(text) {
  const m = String(text).match(/-(?:e|ec|en|enc|enco|encodedcommand)\s+([A-Za-z0-9+/=]{20,})/i);
  if (!m) return '';
  try { const s = Buffer.from(m[1], 'base64').toString('utf16le'); return /[\x20-\x7e]{8,}/.test(s) ? s.replace(/\0/g, '').slice(0, 600) : ''; } catch { return ''; }
}

export function scanScript(text) {
  const t = String(text || '');
  const found = [];
  for (const [re, level, says] of SCRIPT_SIGNS) if (re.test(t)) found.push({ level, says });
  const decoded = decodeEncoded(t);
  if (decoded) for (const [re, level, says] of SCRIPT_SIGNS) if (re.test(decoded) && !found.some((f) => f.says === says)) found.push({ level, says: `${says} (inside the scrambled part)` });
  const urls = [...new Set((t.match(/https?:\/\/[^\s'"<>)]+/gi) || []).slice(0, 10))];
  return { found: found.sort((a, b) => b.level - a.level), decoded, urls };
}

// ---------------------------------------------------------------- links

const SHORTENERS = /^(bit\.ly|tinyurl\.com|t\.co|goo\.gl|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|rb\.gy|shorturl\.at|t\.ly|tiny\.cc|lnkd\.in|s\.id|qrco\.de)$/i;
export const BRANDS = ['paypal', 'microsoft', 'office365', 'outlook', 'apple', 'icloud', 'google', 'gmail', 'amazon', 'netflix', 'facebook', 'instagram', 'whatsapp', 'steam', 'steamcommunity', 'epicgames', 'discord', 'github', 'dropbox', 'docusign', 'linkedin', 'ebay', 'coinbase', 'binance', 'metamask', 'interac', 'canadapost', 'purolator', 'fedex', 'ups', 'dhl', 'usps', 'rbc', 'royalbank', 'tdbank', 'scotiabank', 'bmo', 'cibc', 'desjardins', 'atb', 'servus', 'tangerine', 'simplii', 'canada', 'cra-arc', 'servicecanada', 'telus', 'rogers', 'bell', 'shaw', 'koodo', 'fido', 'chase', 'wellsfargo', 'bankofamerica', 'roblox', 'playstation', 'xbox', 'nintendo', 'adobe', 'zoom', 'wise', 'venmo', 'cashapp'];

// The part of a host name that was bought (example.co.uk -> example.co.uk, a.b.example.com -> example.com).
export function registrable(host) {
  const parts = String(host || '').toLowerCase().replace(/\.$/, '').split('.');
  if (parts.length <= 2) return parts.join('.');
  const two = parts.slice(-2);
  const n = (two[1].length === 2 && /^(co|com|org|net|gov|ac|edu|gc|qc|on|ab|bc|ne)$/.test(two[0])) ? 3 : 2;
  return parts.slice(-n).join('.');
}
function lev(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const SWAPS = [[/0/g, 'o'], [/1/g, 'l'], [/rn/g, 'm'], [/vv/g, 'w'], [/3/g, 'e'], [/5/g, 's'], [/\$/g, 's']];

export function lookalike(host) {
  const reg = registrable(host);
  const label = reg.split('.')[0];
  const plain = SWAPS.reduce((s, [re, to]) => s.replace(re, to), label.replace(/^xn--/, ''));
  for (const b of BRANDS) {
    if (label === b) return null; // the real name (the ending is checked by the user's eyes)
    if (plain === b) return `"${reg}" swaps letters to look like ${b}`;
    if (b.length >= 5 && lev(label, b) === 1) return `"${reg}" is one letter off ${b}`;
    if (b.length >= 4 && plain.length > b.length && new RegExp(`(^|[-.])${b.replace(/[-]/g, '\\-')}([-.]|$)|^${b}[a-z]*-|-${b}$`).test(plain)) return `"${reg}" puts ${b} in its name, which may not be ${b}'s own site (scammers do this a lot; some real ones do too)`;
  }
  return null;
}

export function linkSigns(url) {
  let u;
  try { u = new URL(String(url).trim()); } catch { return { url, bad: 'not a web address I can read' }; }
  const host = u.hostname.toLowerCase();
  const shown = (() => { try { return new URL(`http://${host}`).hostname; } catch { return host; } })();
  const signs = [];
  if (u.protocol === 'http:') signs.push({ level: 1, says: 'not encrypted (http, not https)' });
  if (/^\d+\.\d+\.\d+\.\d+$|^\[/.test(host)) signs.push({ level: 2, says: 'goes to a bare number address instead of a name' });
  if (host.split('.').some((p) => p.startsWith('xn--'))) signs.push({ level: 2, says: 'uses look-alike letters from other alphabets (punycode)' });
  if (u.username || u.password || /@/.test(u.href.split('?')[0].replace(/^https?:\/\//, '').split('/')[0])) signs.push({ level: 3, says: 'has an @ before the real address, a trick to hide where it goes' });
  if (SHORTENERS.test(host)) signs.push({ level: 1, says: 'is a short link, so the real place is hidden until it is followed' });
  if (host.split('.').length > 4) signs.push({ level: 1, says: 'has a long chain of sub-names, sometimes used to bury the real site name' });
  const look = lookalike(host);
  if (look) signs.push({ level: /puts /.test(look) ? 2 : 3, says: look });
  if (/\.(zip|mov|top|xyz|click|country|gq|tk|ml|cf|ga|rest|cam|icu|sbs|cfd)$/i.test(host)) signs.push({ level: 1, says: `ends in .${host.split('.').pop()}, an ending scammers use a lot (not proof)` });
  if (/(login|signin|verify|account|secure|update|wallet|unlock|confirm|reset)[-.]/i.test(host)) signs.push({ level: 1, says: 'has words like login or verify in the site name itself' });
  if (/\.(exe|scr|msi|bat|cmd|ps1|vbs|js|hta|iso|img|lnk|zip|rar|7z)(\?|$)/i.test(u.pathname)) signs.push({ level: 2, says: `downloads a .${u.pathname.split('.').pop()} file` });
  return { url: u.href, host, site: registrable(shown), signs: signs.sort((a, b) => b.level - a.level) };
}

// ---------------------------------------------------------------- emails (.eml or pasted with headers)

function unfold(head) { return head.replace(/\r?\n[ \t]+/g, ' '); }
function header(h, name) { const m = h.match(new RegExp(`^${name}:\\s*(.*)$`, 'gim')); return m ? m.map((x) => x.replace(new RegExp(`^${name}:\\s*`, 'i'), '').trim()) : []; }
function qp(s) { return s.replace(/=\r?\n/g, '').replace(/=([0-9A-F]{2})/gi, (_, h) => String.fromCharCode(parseInt(h, 16))); }
const emailDomain = (s) => (String(s).match(/@([A-Za-z0-9.-]+)/) || [])[1]?.toLowerCase() || '';
function decodeWords(s) { return String(s).replace(/=\?([^?]+)\?([BQ])\?([^?]*)\?=/gi, (_, cs, enc, txt) => { try { return enc.toUpperCase() === 'B' ? Buffer.from(txt, 'base64').toString('utf8') : qp(txt.replace(/_/g, ' ')); } catch { return txt; } }); }

// The text and attachments of a MIME message, a level or two deep.
function parts(raw, depth = 0) {
  const i = raw.search(/\r?\n\r?\n/);
  const head = unfold(i < 0 ? raw : raw.slice(0, i)), body = i < 0 ? '' : raw.slice(i).replace(/^\r?\n\r?\n/, '');
  const type = (header(head, 'Content-Type')[0] || 'text/plain').toLowerCase();
  const enc = (header(head, 'Content-Transfer-Encoding')[0] || '').toLowerCase();
  const disp = header(head, 'Content-Disposition')[0] || '';
  const name = decodeWords((disp.match(/filename\*?="?([^";]+)/i) || type.match(/name="?([^";]+)/i) || [])[1] || '');
  const b = (type.match(/boundary="?([^";]+)"?/i) || [])[1];
  if (b && depth < 4) return body.split(`--${b}`).slice(1).filter((p) => !p.startsWith('--')).flatMap((p) => parts(p.replace(/^\r?\n/, ''), depth + 1));
  if (name || /attachment/i.test(disp)) return [{ attachment: name || '(no name)', type }];
  let text = body;
  if (enc === 'base64') { try { text = Buffer.from(body.replace(/\s+/g, ''), 'base64').toString('utf8'); } catch {} }
  else if (enc === 'quoted-printable') text = qp(body);
  return [{ text, html: /html/.test(type) }];
}

export function readEmail(raw) {
  const s = String(raw || '');
  const i = s.search(/\r?\n\r?\n/);
  const head = unfold(i < 0 ? s : s.slice(0, i));
  const from = decodeWords(header(head, 'From')[0] || ''), reply = header(head, 'Reply-To')[0] || '', ret = header(head, 'Return-Path')[0] || '';
  const auth = header(head, 'Authentication-Results').join(' ') + ' ' + header(head, 'ARC-Authentication-Results').join(' ');
  const res = (k) => (auth.match(new RegExp(`\\b${k}=(\\w+)`, 'i')) || [])[1]?.toLowerCase() || '';
  const all = parts(s);
  const text = all.filter((p) => p.text).map((p) => p.text).join('\n');
  const attachments = all.filter((p) => p.attachment).map((p) => p.attachment);
  const links = [];
  for (const m of text.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)) links.push({ href: m[1].replace(/&amp;/g, '&'), shows: m[2].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim() });
  for (const m of text.replace(/<[^>]+>/g, ' ').matchAll(/https?:\/\/[^\s"'<>)\]]+/gi)) if (!links.some((l) => l.href === m[0])) links.push({ href: m[0], shows: '' });
  const signs = [];
  const fd = emailDomain(from);
  const name = from.replace(/<[^>]*>/, '').replace(/"/g, '').trim();
  if (fd && reply && emailDomain(reply) && registrable(emailDomain(reply)) !== registrable(fd)) signs.push({ level: 2, says: `replies would go to ${emailDomain(reply)}, not the sender's ${fd}` });
  if (fd && ret && emailDomain(ret) && registrable(emailDomain(ret)) !== registrable(fd)) signs.push({ level: 1, says: `it was really sent through ${emailDomain(ret)} (common for newsletters, odd for a bank)` });
  for (const b of BRANDS) if (b.length > 3 && new RegExp(`\\b${b}\\b`, 'i').test(name) && fd && !fd.includes(b)) { signs.push({ level: 3, says: `the name says "${name}" but the address is at ${fd}` }); break; }
  if (/^(gmail|outlook|hotmail|yahoo|icloud|proton|aol|gmx|mail)\./i.test(fd) && /(bank|support|security|service|team|billing|account|admin|helpdesk|paypal|microsoft|apple|amazon|canada|cra)/i.test(name)) signs.push({ level: 2, says: `a company name sending from a free ${fd} address` });
  if (res('spf') && !/pass/.test(res('spf'))) signs.push({ level: 2, says: `SPF check: ${res('spf')} (the server wasn't allowed to send for that address)` });
  if (res('dkim') && !/pass/.test(res('dkim'))) signs.push({ level: 2, says: `DKIM check: ${res('dkim')} (the signature didn't match)` });
  if (res('dmarc') && !/pass/.test(res('dmarc'))) signs.push({ level: 3, says: `DMARC check: ${res('dmarc')} (the address may be faked)` });
  for (const l of links) {
    const ls = linkSigns(l.href);
    const shownHost = (l.shows.match(/\b([a-z0-9-]+\.)+[a-z]{2,}\b/i) || [])[0];
    if (shownHost && ls.site && registrable(shownHost.toLowerCase()) !== ls.site) signs.push({ level: 3, says: `a link shows "${shownHost}" but really goes to ${ls.site}` });
    for (const x of ls.signs || []) if (x.level >= 2 && !signs.some((y) => y.says.includes(x.says))) signs.push({ level: x.level, says: `a link ${x.says}` });
  }
  for (const a of attachments) {
    const e = extOf(a);
    if (RUNNABLE.includes(e) || nameTricks(a).length) signs.push({ level: 3, says: `attachment "${a}" is a .${e} file that can run code` });
    else if (/^(docm|xlsm|pptm|xls|doc|ppt)$/.test(e)) signs.push({ level: 2, says: `attachment "${a}" is an Office file that can carry macros` });
    else if (/^(zip|rar|7z|html?|svg|pdf)$/.test(e)) signs.push({ level: 1, says: `attachment "${a}" (.${e}) is a common wrapper for tricks; check it before opening` });
  }
  const plain = text.replace(/<[^>]+>/g, ' ');
  const pressure = [/urgent|immediately|within (24|48) hours|final (notice|warning)|account (will be )?(suspended|locked|closed|deactivated)|unusual (sign-?in|activity)/i, /verify your (account|identity|details)|confirm your (password|details|payment)|update (your )?(billing|payment)/i, /gift ?cards?|wire transfer|bitcoin|crypto|e-?transfer|refund (is )?(pending|waiting)|you('ve| have) won|lottery|inheritance/i];
  const hits = pressure.filter((re) => re.test(`${header(head, 'Subject')[0] || ''} ${plain}`)).length;
  if (hits) signs.push({ level: hits > 1 ? 2 : 1, says: 'pushes you to act fast, verify details, or pay in a hard-to-trace way' });
  const script = scanScript(plain).found.filter((f) => f.level >= 3);
  for (const f of script) signs.push({ level: 3, says: f.says });
  return { from, fromDomain: fd, subject: decodeWords(header(head, 'Subject')[0] || ''), date: header(head, 'Date')[0] || '', hops: header(head, 'Received').length, spf: res('spf'), dkim: res('dkim'), dmarc: res('dmarc'), links: links.slice(0, 20), attachments, signs: signs.sort((a, b) => b.level - a.level) };
}

// ---------------------------------------------------------------- hidden details (metadata)

function tiffTags(buf, start, len) {
  const out = {};
  const end = Math.min(buf.length, start + len);
  if (start + 8 > end) return out;
  const le = buf.toString('ascii', start, start + 2) === 'II';
  const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
  const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
  const SIZE = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
  const readIfd = (off, into, seen = new Set()) => {
    const at = start + off;
    if (seen.has(at) || at + 2 > end) return;
    seen.add(at);
    const n = u16(at);
    for (let k = 0; k < n && at + 2 + k * 12 + 12 <= end; k++) {
      const e = at + 2 + k * 12, tag = u16(e), type = u16(e + 2), count = u32(e + 4);
      const bytes = (SIZE[type] || 1) * count;
      const vo = bytes <= 4 ? e + 8 : start + u32(e + 8);
      if (vo + bytes > end) continue;
      let v;
      if (type === 2) v = buf.toString('latin1', vo, vo + count).replace(/\0+$/, '').trim();
      else if (type === 3) v = count === 1 ? u16(vo) : null;
      else if (type === 4) v = count === 1 ? u32(vo) : null;
      else if (type === 5) v = Array.from({ length: Math.min(count, 4) }, (_, j) => { const d = u32(vo + j * 8 + 4); return d ? u32(vo + j * 8) / d : 0; });
      else if (type === 1 && tag >= 0x9c9b && tag <= 0x9c9f) v = buf.toString('utf16le', vo, vo + count).replace(/\0+$/, '').trim();
      else if (type === 1 || type === 7) v = count <= 4 ? [...buf.subarray(vo, vo + count)] : `(${count} bytes)`;
      into[tag] = v;
    }
  };
  const ifd0 = {};
  readIfd(u32(start + 4), ifd0);
  Object.assign(out, ifd0);
  if (ifd0[0x8769]) { const x = {}; readIfd(ifd0[0x8769], x); Object.assign(out, x); }
  if (ifd0[0x8825]) { const g = {}; readIfd(ifd0[0x8825], g); out.gps = g; }
  return out;
}

const dms = (v, ref) => (Array.isArray(v) ? (v[0] + (v[1] || 0) / 60 + (v[2] || 0) / 3600) * (/[SW]/i.test(ref || '') ? -1 : 1) : null);

function sayExif(t, found) {
  if (t.gps && t.gps[2] && t.gps[4]) {
    const lat = dms(t.gps[2], t.gps[1]), lon = dms(t.gps[4], t.gps[3]);
    if (lat !== null && lon !== null && (lat || lon)) found.push({ level: 3, what: 'GPS location', value: `${lat.toFixed(3)}, ${lon.toFixed(3)} (to about a street; the exact spot is in the file)` });
  }
  const pick = { 0x010f: 'Camera or phone maker', 0x0110: 'Camera or phone model', 0x0131: 'Made with', 0x013b: 'Artist / author', 0x8298: 'Copyright', 0x9c9d: 'Author (Windows)', 0x9c9c: 'Comment (Windows)', 0x9c9f: 'Subject (Windows)', 0x9003: 'Date taken', 0xa430: 'Camera owner\'s name', 0xa431: 'Camera serial number', 0xa435: 'Lens serial number', 0x010e: 'Description' };
  for (const [tag, what] of Object.entries(pick)) { const v = t[tag]; if (typeof v === 'string' && v) found.push({ level: /owner|serial|Artist|Author|Copyright/.test(what) ? 2 : 1, what, value: v.slice(0, 120) }); }
}

function jpegMeta(buf, found) {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd9 || m === 0xda) break;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    const len = buf.readUInt16BE(i + 2), seg = i + 4;
    if (m === 0xe1 && buf.toString('latin1', seg, seg + 6) === 'Exif\0\0') sayExif(tiffTags(buf, seg + 6, len - 8), found);
    else if (m === 0xe1 && buf.toString('latin1', seg, seg + 28).startsWith('http://ns.adobe.com/xap')) found.push({ level: 1, what: 'XMP notes', value: xmpSay(buf.toString('utf8', seg, seg + len - 2)) });
    else if (m === 0xed) found.push({ level: 1, what: 'IPTC / Photoshop notes', value: 'captions, keywords or credits' });
    else if (m === 0xfe) found.push({ level: 1, what: 'Comment', value: buf.toString('latin1', seg, Math.min(seg + len - 2, seg + 100)).replace(/[^\x20-\x7e]/g, '') });
    i = seg + len - 2;
  }
}
function xmpSay(x) {
  const bits = [];
  for (const [re, what] of [[/<dc:creator>[\s\S]*?<rdf:li[^>]*>([^<]+)/, 'author'], [/xmp:CreatorTool="([^"]+)"|<xmp:CreatorTool>([^<]+)/, 'made with'], [/exif:GPSLatitude="([^"]+)"|<exif:GPSLatitude>([^<]+)/, 'GPS'], [/photoshop:City="([^"]+)"|<photoshop:City>([^<]+)/, 'city']]) { const m = x.match(re); if (m) bits.push(`${what}: ${(m[1] || m[2]).slice(0, 60)}`); }
  return bits.join(', ') || 'editing history and notes';
}
function pngMeta(buf, found) {
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8);
    if (type === 'tEXt' || type === 'iTXt' || type === 'zTXt') { const d = buf.subarray(i + 8, i + 8 + len); const k = d.toString('latin1', 0, Math.max(0, d.indexOf(0))); found.push({ level: /author|parameters|prompt|workflow|comment/i.test(k) ? 2 : 1, what: `Text note "${k}"`, value: /parameters|prompt|workflow/i.test(k) ? 'the AI settings and prompt used to make it' : d.toString('latin1', k.length + 1, Math.min(d.length, k.length + 80)).replace(/[^\x20-\x7e]/g, '') }); }
    if (type === 'eXIf') sayExif(tiffTags(buf, i + 8, len), found);
    if (type === 'tIME') found.push({ level: 1, what: 'Last changed', value: 'a date and time' });
    if (type === 'IEND') break;
    i += 12 + len;
  }
}
function webpMeta(buf, found) {
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4), len = buf.readUInt32LE(i + 4);
    if (id === 'EXIF') { const o = buf.toString('latin1', i + 8, i + 14) === 'Exif\0\0' ? 6 : 0; sayExif(tiffTags(buf, i + 8 + o, len - o), found); }
    if (id === 'XMP ') found.push({ level: 1, what: 'XMP notes', value: xmpSay(buf.toString('utf8', i + 8, i + 8 + len)) });
    i += 8 + len + (len & 1);
  }
}

// One file out of a zip (docx/xlsx/pptx are zips), small ones only.
export function zipEntry(file, name, max = 20e6) {
  const { entries } = readZipList(file);
  const e = entries.find((x) => x.name === name);
  if (!e || e.usize > max) return null;
  const fd = fs.openSync(file, 'r');
  try {
    const head = Buffer.alloc(30);
    fs.readSync(fd, head, 0, 30, e.at);
    const start = e.at + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
    const comp = Buffer.alloc(e.csize);
    fs.readSync(fd, comp, 0, e.csize, start);
    return e.method === 8 ? zlib.inflateRawSync(comp, { maxOutputLength: Math.max(1, e.usize) }) : comp;
  } finally { fs.closeSync(fd); }
}

const OFFICE_FIELDS = [['dc:creator', 'Author'], ['cp:lastModifiedBy', 'Last saved by'], ['dc:title', 'Title'], ['dc:subject', 'Subject'], ['cp:keywords', 'Keywords'], ['dc:description', 'Comments field'], ['cp:category', 'Category']];
const APP_FIELDS = [['Company', 'Company'], ['Manager', 'Manager'], ['Template', 'Template']];
const tagVal = (xml, tag) => (xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)</${tag}>`)) || [])[1]?.trim() || '';

function officeMeta(file, found, risks) {
  let names;
  try { names = readZipList(file).entries.map((e) => e.name); } catch { return; }
  const core = zipEntry(file, 'docProps/core.xml')?.toString('utf8') || '';
  const app = zipEntry(file, 'docProps/app.xml')?.toString('utf8') || '';
  for (const [tag, what] of OFFICE_FIELDS) { const v = tagVal(core, tag); if (v) found.push({ level: /Author|saved by/.test(what) ? 2 : 1, what, value: v.slice(0, 120) }); }
  for (const [tag, what] of APP_FIELDS) { const v = tagVal(app, tag); if (v && !(tag === 'Template' && /^normal(\.dotm)?$/i.test(v))) found.push({ level: tag === 'Template' ? 1 : 2, what, value: v.slice(0, 120) }); }
  if (names.some((n) => /comments\d*\.xml$|commentsExtended|threadedComments/i.test(n))) found.push({ level: 2, what: 'Comments', value: 'review comments are still inside (they may show names)' });
  const doc = names.includes('word/document.xml') ? zipEntry(file, 'word/document.xml')?.toString('utf8') || '' : '';
  if (/<w:(ins|del)\b/.test(doc)) found.push({ level: 2, what: 'Tracked changes', value: 'earlier wording and who changed it are still inside' });
  if (names.some((n) => /notesSlides\//.test(n))) found.push({ level: 1, what: 'Speaker notes', value: 'slides have notes; check them before sharing' });
  if (names.some((n) => /vbaProject\.bin$/i.test(n))) risks.push({ level: 2, says: 'it contains macros (code that runs when allowed). Never click "Enable content" on a file you weren\'t expecting' });
  if (names.some((n) => /activeX|oleObject|embeddings\//i.test(n))) risks.push({ level: 1, says: 'it has embedded objects or controls' });
  const rels = names.filter((n) => /_rels\/.*\.rels$/.test(n)).map((n) => zipEntry(file, n, 2e6)?.toString('utf8') || '').join(' ');
  if (/Type="[^"]*(attachedTemplate|oleObject|frame)"[^>]*Target="https?:/i.test(rels) || /TargetMode="External"[^>]*Target="https?:[^"]*\.(dotm|dotx|docm|rtf)"/i.test(rels)) risks.push({ level: 3, says: 'it fetches a template or object from the internet when opened, a known way to sneak macros in' });
}
function pdfMeta(buf, found, risks) {
  const s = buf.toString('latin1');
  for (const [k, what] of [['Author', 'Author'], ['Creator', 'Made with'], ['Producer', 'Converted with'], ['Title', 'Title'], ['Subject', 'Subject'], ['Keywords', 'Keywords']]) { const m = s.match(new RegExp(`/${k}\\s*\\(([^)]{1,200})\\)`)); if (m && m[1].trim()) found.push({ level: k === 'Author' ? 2 : 1, what, value: m[1].replace(/\\(.)/g, '$1').replace(/^\xfe\xff/, '').replace(/\0/g, '').slice(0, 120) }); }
  if (/<x:xmpmeta|<\?xpacket/.test(s)) found.push({ level: 1, what: 'XMP notes', value: xmpSay(s.slice(s.indexOf('<x:xmpmeta'), s.indexOf('<x:xmpmeta') + 20000)) });
  if (/\/JavaScript|\/JS\s*[(<]/.test(s)) risks.push({ level: 2, says: 'it has JavaScript inside (rare in honest PDFs)' });
  if (/\/Launch/.test(s)) risks.push({ level: 3, says: 'it tries to launch a program' });
  if (/\/EmbeddedFile/.test(s)) risks.push({ level: 2, says: 'it has another file tucked inside' });
  if (/\/OpenAction|\/AA\s*<</.test(s) && /\/JavaScript|\/URI|\/Launch/.test(s)) risks.push({ level: 2, says: 'it does something by itself as soon as it opens' });
  if (/\/AcroForm/.test(s) && /\/URI/.test(s)) risks.push({ level: 1, says: 'it has a form with links (fake sign-in PDFs look like this)' });
}

// The hidden details in a picture, document or PDF.
export function hiddenDetails(file, buf = null) {
  const found = [], risks = [];
  const b = buf || fs.readFileSync(file);
  const k = realKind(b.subarray(0, 0x8010)).kind;
  try {
    if (k === 'jpg') jpegMeta(b, found);
    else if (k === 'png') pngMeta(b, found);
    else if (k === 'webp') webpMeta(b, found);
    else if (k === 'zip') officeMeta(file, found, risks);
    else if (k === 'pdf') pdfMeta(b, found, risks);
  } catch {}
  return { kind: k, found, risks };
}

// ---------------------------------------------------------------- cleaning hidden details (a new copy)

export const CLEANABLE = ['jpg', 'jpeg', 'png', 'webp', 'docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm'];

function exifTurnOf(buf) {
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) { i++; continue; }
    const m = buf[i + 1];
    if (m === 0xd9 || m === 0xda) break;
    if (m === 0xd8 || m === 0x01 || (m >= 0xd0 && m <= 0xd7) || m === 0xff) { i += m === 0xff ? 1 : 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    if (m === 0xe1 && buf.toString('latin1', i + 4, i + 10) === 'Exif\0\0') return tiffTags(buf, i + 10, len - 8)[0x0112] || 1;
    i += 2 + len;
  }
  return 1;
}
// A tiny EXIF block with only the "turn me" note, so a phone photo still shows the right way up.
function turnOnlyExif(turn) {
  const tiff = Buffer.alloc(26);
  tiff.write('MM', 0, 'latin1'); tiff.writeUInt16BE(42, 2); tiff.writeUInt32BE(8, 4);
  tiff.writeUInt16BE(1, 8); tiff.writeUInt16BE(0x0112, 10); tiff.writeUInt16BE(3, 12); tiff.writeUInt32BE(1, 14); tiff.writeUInt16BE(turn, 18); tiff.writeUInt32BE(0, 22);
  const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff]);
  const head = Buffer.from([0xff, 0xe1, 0, 0]);
  head.writeUInt16BE(body.length + 2, 2);
  return Buffer.concat([head, body]);
}
export function cleanJpeg(buf) {
  const turn = exifTurnOf(buf);
  const keep = [];
  let i = 2;
  while (i + 4 <= buf.length) {
    if (buf[i] !== 0xff) throw new Error('that JPG is damaged');
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xda) {
      // the picture itself starts here: everything after it is copied as it is
      const turnAt = keep.length && keep[0][1] === 0xe0 ? 1 : 0; // after the JFIF block, else straight after the start
      if (turn !== 1) keep.splice(turnAt, 0, turnOnlyExif(turn));
      return Buffer.concat([buf.subarray(0, 2), ...keep, buf.subarray(i)]);
    }
    if (m === 0x01 || (m >= 0xd0 && m <= 0xd7)) { i += 2; continue; }
    const len = buf.readUInt16BE(i + 2);
    const seg = buf.subarray(i, i + 2 + len);
    const meta = m === 0xfe || (m >= 0xe1 && m <= 0xef && m !== 0xee && !(m === 0xe2 && seg.toString('latin1', 4, 15) === 'ICC_PROFILE'));
    if (!meta) keep.push(seg);
    i += 2 + len;
  }
  throw new Error('that JPG has no picture data');
}
export function cleanPng(buf) {
  const out = [buf.subarray(0, 8)];
  let i = 8;
  while (i + 12 <= buf.length) {
    const len = buf.readUInt32BE(i), type = buf.toString('latin1', i + 4, i + 8);
    if (!['tEXt', 'zTXt', 'iTXt', 'eXIf', 'tIME'].includes(type)) out.push(buf.subarray(i, i + 12 + len));
    i += 12 + len;
    if (type === 'IEND') break;
  }
  return Buffer.concat(out);
}
export function cleanWebp(buf) {
  const chunks = [];
  let i = 12;
  while (i + 8 <= buf.length) {
    const id = buf.toString('latin1', i, i + 4), len = buf.readUInt32LE(i + 4);
    const whole = buf.subarray(i, i + 8 + len + (len & 1));
    if (id !== 'EXIF' && id !== 'XMP ') {
      if (id === 'VP8X') { const c = Buffer.from(whole); c[8] &= ~0x0c; chunks.push(c); } else chunks.push(whole);
    }
    i += 8 + len + (len & 1);
  }
  const body = Buffer.concat(chunks);
  const head = Buffer.alloc(12);
  head.write('RIFF', 0, 'latin1'); head.writeUInt32LE(body.length + 4, 4); head.write('WEBP', 8, 'latin1');
  return Buffer.concat([head, body]);
}
// Word/Excel/PowerPoint: blank the author, last-saved-by, company and manager. Comments and tracked changes
// stay (taking them out changes the document), and the reply says so.
export function cleanOffice(src, out) {
  const { entries } = readZipList(src);
  const blank = (xml, tags) => tags.reduce((x, t) => x.replace(new RegExp(`(<${t}(?:\\s[^>]*)?>)[^<]*(</${t}>)`, 'g'), '$1$2'), xml);
  const list = entries.filter((e) => !e.dir).map((e) => {
    let data = zipEntry(src, e.name, 1e9);
    if (e.name === 'docProps/core.xml') data = Buffer.from(blank(data.toString('utf8'), ['dc:creator', 'cp:lastModifiedBy', 'cp:keywords', 'dc:description', 'cp:category', 'dc:subject']), 'utf8');
    if (e.name === 'docProps/app.xml') data = Buffer.from(blank(data.toString('utf8'), ['Company', 'Manager']), 'utf8');
    return { name: e.name, data, size: data.length, mtime: new Date(1980, 0, 1) };
  });
  writeZip(out, list);
}
