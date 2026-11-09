// The "Office documents and converting" Hand: which conversions go where, the folder rules, the cards, nothing
// overwritten, backups, the helpers found on the PC, the pinned downloads, and (when this machine has
// LibreOffice and FFmpeg) real conversions, reads, new files and changes end to end.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { HANDS, toolsOff, cleanHands } from '../src/hands-settings.js';
import { routeFor, ffmpegArgs, findOffice, findFfmpeg, officeUsableHere, officeCandidates } from '../src/office.js';
import { officeTools, planConvert, planMake, planEdit, canRead, canWrite, officeDir } from '../src/hands-office.js';
import { guessGroups, groupsFor } from '../src/toolbox.js';
import { afterTool } from '../src/verify.js';
import { madePaths } from '../src/made.js';
import { ENGINES, engineStatus, officePins } from '../src/engines.js';
import { HELP } from '../public/help-content.js';
import { handsPrompt } from '../src/hands.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-office-'));

// ---------- the Hand: off until switched on ----------
{
  check('there is an Office Hand with its four tools', HANDS.office && ['convert_file', 'office_read', 'office_make', 'office_edit'].every((t) => HANDS.office.tools.includes(t)));
  check('it is off to start with', cleanHands({}).office.on === false);
  check('its tools are hidden while it is off', ['convert_file', 'office_read', 'office_make', 'office_edit'].every((t) => toolsOff({}).includes(t)));
}

// ---------- what turns into what ----------
{
  check('Word to PDF goes through LibreOffice', routeFor('docx', 'pdf').route === 'office' && routeFor('docx', 'pdf').kind === 'writer');
  check('Excel to ODS and CSV, CSV to Excel', routeFor('xlsx', 'ods').route === 'office' && routeFor('xlsx', 'csv').route === 'office' && routeFor('csv', 'xlsx').route === 'office');
  check('PowerPoint to PDF and ODP', routeFor('pptx', 'pdf').route === 'office' && routeFor('pptx', 'odp').route === 'office');
  check('a spreadsheet can\'t become a Word file, and says what it can be', /can be turned into: pdf, xlsx/.test(routeFor('xlsx', 'docx').why || ''));
  check('PDF back to Word is refused honestly', /can't turn a PDF back.*instead/i.test(routeFor('pdf', 'docx').why || ''));
  check('pictures are pictures; a picture can be a PDF', routeFor('png', 'jpg').route === 'picture' && routeFor('webp', 'png').route === 'picture' && routeFor('jpg', 'pdf').route === 'office');
  check('sound to sound, video to video, GIF or sound', routeFor('wav', 'mp3').route === 'media' && routeFor('mp4', 'webm').route === 'media' && routeFor('mp4', 'gif').route === 'media' && routeFor('mov', 'mp3').route === 'media');
  check('sound can\'t become video', Boolean(routeFor('mp3', 'mp4').why));
  check('same kind: says it already is one', /already/.test(routeFor('jpeg', 'jpg').why || '') && /already/.test(routeFor('pdf', 'pdf').why || ''));
  check('no target: asks what to turn it into', /Say what/.test(routeFor('docx', '').why || ''));
}

// ---------- FFmpeg settings ----------
{
  const mp3 = ffmpegArgs({ src: 'a.wav', out: 'a.mp3' });
  check('never overwrites (-n), never waits for typing (-nostdin)', mp3.includes('-n') && mp3.includes('-nostdin') && !mp3.includes('-y'));
  check('mp3 uses LAME, drops any picture', mp3.includes('libmp3lame') && mp3.includes('-vn'));
  const mp4 = ffmpegArgs({ src: 'a.mov', out: 'a.mp4', width: 1280, start: '0:30', end: '1:10' });
  check('mp4 is H.264 + AAC, plays everywhere', mp4.includes('libx264') && mp4.includes('yuv420p') && mp4.includes('+faststart'));
  check('trim and width go in', mp4.join(' ').includes('-ss 0:30') && mp4.join(' ').includes('-to 1:10') && mp4.join(' ').includes("scale='min(1280,iw)':-2"));
  check('a GIF gets its own palette', /palettegen/.test(ffmpegArgs({ src: 'a.mp4', out: 'a.gif' }).join(' ')));
  check('a picture is one frame', ffmpegArgs({ src: 'a.png', out: 'a.webp' }, { picture: true }).includes('-frames:v'));
  check('a bad time is refused, not passed on', throws(() => ffmpegArgs({ src: 'a.mp4', out: 'b.mp4', start: '1:30; rm -rf' }), /isn't a time/));
}

// ---------- finding the helpers ----------
{
  const pf = path.join(tmp, 'Program Files');
  const prog = path.join(pf, 'LibreOffice', 'program');
  fs.mkdirSync(prog, { recursive: true });
  for (const f of ['soffice.exe', 'python.exe']) fs.writeFileSync(path.join(prog, f), '');
  fs.writeFileSync(path.join(prog, 'version.ini'), '[Version]\nMsiProductVersion=25.8.3.2\n');
  const env = { BOB_FAKE_WIN: '1', ProgramFiles: pf, PATH: '' };
  const cfg = { agentDir: path.join(tmp, 'empty-agent') };
  if (process.platform === 'win32') {
    const o = findOffice(cfg, env);
    check('finds LibreOffice in Program Files, with its own Python and version', o && o.where === 'pc' && /python\.exe$/.test(o.python) && o.version === '25.8.3.2', JSON.stringify(o));
  } else {
    check('Program Files is on the list of places to look (Windows)', officeCandidates(cfg, env).some((c) => c.dir === prog));
  }
  check('OpenOffice is on the list too', officeCandidates(cfg, env).some((c) => /OpenOffice 4/.test(c.dir)));
  const own = path.join(tmp, 'own-agent');
  check('Bob\'s own copy is looked at first', officeCandidates({ agentDir: own }, env)[0].where === 'own');
  const bin = path.join(tmp, 'bin');
  fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'), '');
  check('finds FFmpeg already on the PATH', findFfmpeg(cfg, { PATH: bin })?.where === 'pc');
  check('nothing found means null, not a guess', findFfmpeg(cfg, { PATH: '' }) === null);
}

// ---------- pinned downloads ----------
{
  const pins = officePins();
  check('the pins file names both helpers', pins.ffmpeg && pins.libreoffice && pins.ffmpeg.repo === 'GyanD/codexffmpeg');
  const lo = ENGINES.find((e) => e.id === 'libreoffice'), ff = ENGINES.find((e) => e.id === 'ffmpeg');
  check('LibreOffice and FFmpeg are in Engine downloads', Boolean(lo && ff));
  check('FFmpeg needs a pin and only takes the essentials zip', ff.needsPin === true && ff.other[0].test('ffmpeg-8.0-essentials_build.zip') && !ff.other[0].test('ffmpeg-8.0-full_build-shared.zip'));
  check('if pinned, the pins are exact (a version and a 64-hex sha256)', (!pins.ffmpeg.tag || /^[0-9a-f]{64}$/.test(pins.ffmpeg.sha256)) && (!pins.libreoffice.version || (/^\d+\.\d+\.\d+\.\d+$/.test(pins.libreoffice.version) && /^[0-9a-f]{64}$/.test(pins.libreoffice.sha256) && /^https:\/\/downloadarchive\.documentfoundation\.org\//.test(pins.libreoffice.url))));
  const st = engineStatus({ agentDir: path.join(tmp, 'status-agent') });
  check('the engine list shows whether each is found', st.some((e) => e.id === 'libreoffice' && 'found' in e) && st.some((e) => e.id === 'ffmpeg' && e.pinned));
  const src = fs.readFileSync(new URL('../src/engines.js', import.meta.url), 'utf8');
  check('LibreOffice unpacks without installing (msiexec /a, no admin)', /'\/a', msi, '\/qn'/.test(src) && !/runas|-Verb/i.test(src));
  check('downloads refuse to go ahead without a pin', /isn't pinned to a checked version/.test(src));
}

// ---------- a Bob home for the rest ----------
const agentDir = path.join(tmp, 'Agent');
const innDir = path.join(agentDir, 'inn');
const dataDir = path.join(innDir, 'bob');
const work = path.join(tmp, 'Work');
const outside = path.join(tmp, 'Elsewhere');
for (const d of [innDir, dataDir, work, outside]) fs.mkdirSync(d, { recursive: true });
const cfg = { agentDir, innDir, dataDir, timeZone: 'UTC', userName: 'Sam', readRoots: [innDir, work, outside], hands: { enabled: true, office: { on: true }, folders: [work] } };
const logs = [];
const brain = { cfg, log: (k, t) => logs.push(`${k}: ${t}`) };

// ---------- folder rules ----------
{
  fs.writeFileSync(path.join(work, 'a.docx'), 'x');
  fs.writeFileSync(path.join(outside, 'b.docx'), 'x');
  fs.writeFileSync(path.join(work, '.env'), 'KEY=1');
  check('reads in a readable folder', canRead(cfg, path.join(outside, 'b.docx')) === path.join(outside, 'b.docx'));
  check('secret files are off-limits', throws(() => canRead(cfg, path.join(work, '.env')), /keys or passwords/));
  check('a relative path is refused', throws(() => canRead(cfg, 'a.docx'), /full path/));
  check('saves in a ticked folder', Boolean(canWrite(cfg, path.join(work, 'a.pdf'))));
  check('saves in Bob\'s own Documents folder', Boolean(canWrite(cfg, path.join(officeDir(cfg), 'x.docx'))));
  check('won\'t save in a folder that isn\'t ticked', throws(() => canWrite(cfg, path.join(outside, 'b.pdf')), /only save in/));
  check('won\'t save in Bob\'s own settings folder', throws(() => canWrite(cfg, path.join(dataDir, 'x.docx')), /read-only/));
  check('read-only projects stay read-only', throws(() => canWrite({ ...cfg, readOnlyRoots: [work] }, path.join(work, 'z.pdf')), /read-only/));
}

// ---------- planning a conversion ----------
{
  const env = { PATH: '', BOB_SOFFICE: '', BOB_FFMPEG: '' };
  const noHelpers = { ...cfg, agentDir: path.join(tmp, 'no-helpers') };
  const nothing = process.platform === 'win32' ? env : env; // on Linux /usr/lib/libreoffice may still be found
  fs.writeFileSync(path.join(work, 'a.pdf'), 'taken');
  if (!findOffice(noHelpers, nothing)) check('no LibreOffice: the row says so plainly', throws(() => planConvert(noHelpers, { paths: [path.join(work, 'a.docx')], to: 'pdf' }, nothing), /no LibreOffice/));
  else check('(LibreOffice is installed on this machine, so the "missing" message is checked in the source)', /no LibreOffice \(or OpenOffice\)/.test(fs.readFileSync(new URL('../src/office.js', import.meta.url), 'utf8')));
  const fakeOffice = path.join(tmp, 'fake-soffice');
  fs.writeFileSync(fakeOffice, '');
  const withOffice = { BOB_SOFFICE: fakeOffice, PATH: '' };
  const plan = planConvert(cfg, { paths: [path.join(work, 'a.docx'), path.join(outside, 'b.docx'), path.join(work, '.env')], to: '.PDF' }, withOffice);
  check('one row per file', plan.rows.length === 3);
  check('nothing is overwritten: a.pdf is taken, so a-2.pdf', plan.rows[0].to === path.join(work, 'a-2.pdf'), plan.rows[0].to);
  check('a file from a folder Bob can\'t save in goes to his Documents folder', plan.rows[1].to === path.join(officeDir(cfg), 'b.pdf'), plan.rows[1].to);
  check('a secret file is a blocked row with the reason', /keys or passwords/.test(plan.rows[2].blocked || ''));
  check('the row says what it is and what does it', /Word document to PDF, with LibreOffice/.test(plan.rows[0].note));
  check('a folder for the new files can be given', planConvert(cfg, { paths: [path.join(work, 'a.docx')], folder: officeDir(cfg), to: 'odt' }, withOffice).rows[0].to === path.join(officeDir(cfg), 'a.odt'));
  check('all blocked: a plain reason, no card', throws(() => planConvert(cfg, { paths: [path.join(work, '.env')], to: 'pdf' }, withOffice), /keys or passwords/));
  check('too many files at once is refused', throws(() => planConvert(cfg, { paths: Array.from({ length: 51 }, (_, i) => `/x/${i}.docx`), to: 'pdf' }, withOffice), /up to 50/));
  check('sound without FFmpeg says where to get it', throws(() => { fs.writeFileSync(path.join(work, 's.wav'), 'x'); planConvert(cfg, { paths: [path.join(work, 's.wav')], to: 'mp3' }, { PATH: '' }); }, /FFmpeg/) || Boolean(findFfmpeg(cfg, { PATH: '' })));
}

// ---------- the tools' cards ----------
{
  const fakeOffice = path.join(tmp, 'fake-soffice');
  const t = officeTools(brain, { env: { BOB_SOFFICE: fakeOffice, PATH: '' } });
  const ctx = {};
  const c = t.convert_file.check({ paths: [path.join(work, 'a.docx')], to: 'pdf' }, ctx);
  check('converting shows a card with a row to tick', Array.isArray(c.plan) && c.plan.length === 1 && c.plan[0].op === 'convert' && /nothing is overwritten/.test(c.text));
  check('a new document in Bob\'s own Documents folder needs no card', t.office_make.check({ kind: 'writer', text: '# Hi' }, {}) === false);
  const mk = t.office_make.check({ kind: 'calc', path: path.join(work, 'bills.xlsx'), sheets: [{ name: 'Bills', rows: [['Item', 'Cost'], ['Rent', 1200]] }] }, {});
  check('a new file anywhere else gets a card that says what\'s in it', mk.plan?.[0].op === 'create' && /sheet "Bills" 2 rows/.test(mk.plan[0].note));
  check('the new file has to match its kind', throws(() => t.office_make.check({ kind: 'calc', path: path.join(work, 'x.docx'), sheets: [{ rows: [[1]] }] }, {}), /can be saved as/));
  check('an empty document is refused', throws(() => t.office_make.check({ kind: 'writer', text: '  ' }, {}), /empty/));
  fs.writeFileSync(path.join(work, 'budget.xlsx'), 'x');
  const ed = t.office_edit.check({ path: path.join(work, 'budget.xlsx'), changes: [{ op: 'set_cells', cells: { B2: 1300 } }, { op: 'add_rows', rows: [['Gas', 80]] }] }, {});
  check('a change shows each change and says a backup is made', /Set 1 cell: B2 = 1300/.test(ed.plan[0].note) && /Add 1 row/.test(ed.plan[0].note) && /a backup is kept/.test(ed.plan[0].note));
  check('a change that doesn\'t fit the kind is refused', throws(() => t.office_edit.check({ path: path.join(work, 'budget.xlsx'), changes: [{ op: 'add_slide', title: 'x' }] }, {}), /doesn't work on a spreadsheet/));
  check('a bad cell name is refused', throws(() => t.office_edit.check({ path: path.join(work, 'budget.xlsx'), changes: [{ op: 'set_cells', cells: { 'B2; x': 1 } }] }, {}), /isn't a cell name/));
  fs.writeFileSync(path.join(work, 'm.xlsm'), 'x');
  check('a file with macros is only changed into a new file', throws(() => t.office_edit.check({ path: path.join(work, 'm.xlsm'), changes: [{ op: 'replace', find: 'a', replace: 'b' }] }, {}), /only saved as a new copy/));
  fs.writeFileSync(path.join(outside, 'o.docx'), 'x');
  check('changing a file in a folder that isn\'t ticked is refused', throws(() => t.office_edit.check({ path: path.join(outside, 'o.docx'), changes: [{ op: 'replace', find: 'a', replace: 'b' }] }, {}), /only save in/));
  check('...but saving the changes as a new file in a ticked folder is fine', Boolean(t.office_edit.check({ path: path.join(outside, 'o.docx'), save_as: path.join(work, 'o2.docx'), changes: [{ op: 'replace', find: 'a', replace: 'b' }] }, {}).plan));
  const offCfg = { ...cfg, hands: { enabled: true, office: { on: false }, folders: [work] } };
  const offT = officeTools({ cfg: offCfg, log: () => {} }, { env: { BOB_SOFFICE: fakeOffice } });
  check('with the Hand off, the tools say how to turn it on', throws(() => offT.convert_file.check({ paths: [path.join(work, 'a.docx')], to: 'pdf' }, {}), /Office documents and converting/));
}

// ---------- the toolbox, the prompt, the record ----------
{
  const b = { cfg, usable: (n) => !toolsOff(cfg).includes(n) };
  check('the office group is there while the Hand is on', Boolean(groupsFor(b).office));
  check('"turn this into a PDF" brings the office tools', guessGroups(b, 'can you turn this into a pdf').includes('office') && guessGroups(b, 'convert the song to mp3').includes('office') && guessGroups(b, 'make a slide deck about cats').includes('office'));
  const off = { cfg: {}, usable: (n) => !toolsOff({}).includes(n) };
  check('...and not while it\'s off', !groupsFor(off).office);
  check('his prompt says to read office files with office_read', /office_read, not read_file/.test(handsPrompt(cfg)));
  check('made by Bob picks up converted files', madePaths('convert_file', `Saved ${path.join(work, 'a.pdf')} (30 KB).`).length === 1);
  const real = path.join(work, 'real.pdf');
  fs.writeFileSync(real, 'pdf!');
  const ok = await afterTool('convert_file', {}, `Saved ${real} (1 KB).`, {});
  check('the app checks the new file is really there', ok.ok === true && ok.files?.[0] === real);
  const bad = await afterTool('convert_file', {}, `Saved ${path.join(work, 'ghost.pdf')} (1 KB).`, {});
  check('a missing file is caught, not claimed', bad.ok === false && /isn't there/.test(bad.text || ''));
}

// ---------- Help ----------
{
  const h = HELP.find((e) => e.id === 'hands-office');
  check('Help has a section for the Office Hand', Boolean(h) && /LibreOffice/.test(h.html) && /FFmpeg/.test(h.html) && /macros/.test(h.html));
  check('the FAQ answers converting and Microsoft Office', ['faq-convert', 'faq-ms-office'].every((id) => HELP.some((e) => e.id === id && /\?$/.test(e.title))));
  const g = HELP.find((e) => e.id === 'glossary').html;
  check('the glossary has LibreOffice, FFmpeg and Convert', ['<dt>LibreOffice</dt>', '<dt>FFmpeg</dt>', '<dt>Convert</dt>'].every((x) => g.includes(x)));
}

// ---------- real conversions, when this machine has the helpers ----------
const realCfg = { ...cfg };
if (officeUsableHere(realCfg)) {
  const t = officeTools(brain);
  const run = async (name, args) => { const ctx = { signal: new AbortController().signal }; const need = t[name].check ? t[name].check(args, ctx) : false; if (need?.plan) ctx.picked = null; return t[name].run(args, ctx); };
  const doc = path.join(work, 'report.docx');
  const made = await run('office_make', { kind: 'writer', path: doc, text: '# Report\n\nHello **world**.\n\n- one\n- two\n\n| Name | Qty |\n|---|---|\n| Apple | 3 |' });
  check('LibreOffice: makes a Word document', /^Saved .*report\.docx/.test(made) && fs.statSync(doc).size > 1000, made);
  const read = await run('office_read', { path: doc });
  check('LibreOffice: reads it back with heading, bullets and table', /# Report/.test(read) && /- one/.test(read) && /\| Apple \| 3 \|/.test(read), read);
  const conv = await run('convert_file', { paths: [doc], to: 'pdf' });
  const pdf = path.join(work, 'report.pdf');
  check('LibreOffice: converts it to PDF', fs.existsSync(pdf) && fs.readFileSync(pdf).subarray(0, 4).toString() === '%PDF', conv);
  const again = await run('convert_file', { paths: [doc], to: 'pdf' });
  check('converting again never overwrites (report-2.pdf)', fs.existsSync(path.join(work, 'report-2.pdf')), again);
  const xl = path.join(work, 'bills.xlsx');
  await run('office_make', { kind: 'calc', path: xl, sheets: [{ name: 'Bills', rows: [['Item', 'Cost'], ['Rent', 1200], ['Food', '350.5'], ['Total', '=SUM(B2:B3)']] }] });
  const edit = await run('office_edit', { path: xl, changes: [{ op: 'set_cells', cells: { B2: 1300 } }, { op: 'add_sheet', name: 'Notes', rows: [['hi']] }] });
  check('LibreOffice: changes a spreadsheet and keeps a backup', /set 1 cell/.test(edit) && /backed up/.test(edit) && fs.readdirSync(path.join(dataDir, 'backups')).length > 0, edit);
  const sheet = await run('office_read', { path: xl, sheet: 'Bills' });
  check('formulas are worked out after a change', /Total \| 1650\.5/.test(sheet), sheet);
  const deck = path.join(work, 'pitch.pptx');
  await run('office_make', { kind: 'impress', path: deck, slides: [{ title: 'Moon Base' }, { title: 'Plan', bullets: ['Art', 'Code'], notes: 'say hi' }] });
  await run('office_edit', { path: deck, changes: [{ op: 'add_slide', title: 'Thanks' }, { op: 'replace', find: 'Plan', replace: 'The plan' }] });
  const slides = await run('office_read', { path: deck });
  check('LibreOffice: makes slides, adds one, replaces text, keeps notes', /3 slides/.test(slides) && /The plan/.test(slides) && /Thanks/.test(slides) && /say hi/.test(slides), slides);
  const copy = await run('office_edit', { path: doc, save_as: path.join(work, 'report-filled.odt'), changes: [{ op: 'replace', find: 'Apple', replace: 'Pear' }, { op: 'append', text: '## Added' }] });
  check('save_as leaves the original alone', fs.existsSync(path.join(work, 'report-filled.odt')) && /Apple/.test(await run('office_read', { path: doc })), copy);
  let stray = '';
  try { stray = execFileSync('pgrep', ['-f', 'office-profile'], { encoding: 'utf8' }).trim(); } catch {}
  check('LibreOffice closes after each job (Bob stays light)', !stray, stray);
} else console.log('SKIP real LibreOffice checks (no LibreOffice with its Python bridge here)');

const ff = findFfmpeg(cfg);
if (ff && process.platform !== 'win32') {
  const t = officeTools(brain);
  const run = async (name, args) => { const ctx = { signal: new AbortController().signal }; t[name].check(args, ctx); return t[name].run(args, ctx); };
  const wav = path.join(work, 'tone.wav');
  execFileSync(ff.exe, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'sine=frequency=440:duration=2', wav]);
  const r = await run('convert_file', { paths: [wav], to: 'mp3' });
  check('FFmpeg: WAV to MP3', fs.existsSync(path.join(work, 'tone.mp3')) && fs.statSync(path.join(work, 'tone.mp3')).size > 1000, r);
  const png = path.join(work, 'pic.png');
  execFileSync(ff.exe, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=c=red:s=640x480', '-frames:v', '1', png]);
  const w = await run('convert_file', { paths: [png], to: 'webp', width: 320 });
  check('pictures: PNG to WebP, made smaller', fs.existsSync(path.join(work, 'pic.webp')), w);
  const clip = path.join(work, 'clip.mp4');
  try {
    execFileSync(ff.exe, ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=2:size=320x240:rate=10', '-pix_fmt', 'yuv420p', clip]);
    const g = await run('convert_file', { paths: [clip], to: 'gif' });
    check('FFmpeg: video to GIF', fs.existsSync(path.join(work, 'clip.gif')), g);
  } catch (e) { console.log('SKIP video check (this FFmpeg has no H.264 encoder):', e.message.split('\n')[0]); }
} else console.log('SKIP real FFmpeg checks');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
