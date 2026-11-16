// save_to and short paths (Nov 15, ready-made tools study): the save tools keep a copy where they're told, with the
// real path first in the result; Hands take short and ~ paths; reminders cancel by their words.
// No real painter, converter, Windows or home folder: everything is in a temp folder and passed in.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { whereTo, keepAt, savedLine, withSaveTo } from '../src/save-to.js';
import { shortPath } from '../src/hands-files.js';
import { buildTools, saveReminders } from '../src/tools.js';
import { saveExport, diagramTool } from '../src/diagram.js';
import { fixCalls } from '../src/loop-help.js';
import { writesFileOnly } from '../src/hands.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-saveto-'));
const home = path.join(root, 'home');
const pics = path.join(home, 'Pictures');
const inn = path.join(root, 'inn');
const made = path.join(root, 'painter');
for (const d of [pics, inn, made, path.join(root, 'data')]) fs.mkdirSync(d, { recursive: true });
const cfg = { innDir: inn, dataDir: path.join(root, 'data'), hands: { folders: [home] }, painterDir: made, defaultPainterDir: made, outputDirs: [made] };

// ---- where save_to points ----
check('~ is the home folder', whereTo(cfg, '~/Pictures/logo.png', 'x.png', { home }) === path.join(pics, 'logo.png'));
check('a bare name goes in Bob\'s Documents folder', whereTo(cfg, 'logo.png', 'x.png', { home }) === path.join(inn, 'documents', 'logo.png'));
check('a path under home is taken from home', whereTo(cfg, 'Pictures/logo.png', 'x.png', { home }) === path.join(pics, 'logo.png'));
check('a folder keeps the made file\'s name', whereTo(cfg, pics + path.sep, 'boat.png', { home }) === path.join(pics, 'boat.png'));
check('nothing asked: no copy', whereTo(cfg, '', 'x.png', { home }) === null);

// ---- keeping a copy ----
const png = path.join(made, '2026-11-15-boat.png');
fs.writeFileSync(png, 'png-bytes');
const r1 = await keepAt(cfg, png, path.join(pics, 'boat.png'), { home });
check('a copy lands where asked', r1.path === path.join(pics, 'boat.png') && fs.readFileSync(r1.path, 'utf8') === 'png-bytes');
check('the made file stays in Bob\'s folder', fs.existsSync(png));
const r2 = await keepAt(cfg, png, path.join(pics, 'boat.png'), { home });
check('nothing is overwritten: a taken name gets a new one', r2.path !== r1.path && fs.existsSync(r1.path));
check('the result line says the real name when it changed', /^Saved: .*boat-\d\.png \(boat\.png was taken/.test(savedLine(path.join(pics, 'boat.png'), r2)));
let refused = '';
try { await keepAt(cfg, png, path.join(root, 'elsewhere', 'boat.png'), { home }); } catch (e) { refused = e.message; }
check('a folder Bob may not save in is refused, with where he may', /I can only save in/.test(refused));
check('a refusal opens with Error and keeps the honest reason', /^Error: not saved to .*I can only save in/.test(savedLine('x', null, new Error(refused))));
let asked = null;
const r3 = await keepAt(cfg, png, path.join(pics, 'boat.jpg'), { home, convert: async (name, format) => { asked = { name, format }; const out = png.replace(/\.png$/, '.jpg'); fs.writeFileSync(out, 'jpg-bytes'); return { file: out }; } });
check('a different ending is converted first', asked?.format === 'jpg' && fs.readFileSync(r3.path, 'utf8') === 'jpg-bytes' && r3.path.endsWith('boat.jpg'));
let noConv = '';
try { await keepAt(cfg, png, path.join(pics, 'boat.mp3'), { home, convert: async () => ({ need: 'ffmpeg' }) }); } catch (e) { noConv = e.message; }
check('a conversion that needs FFmpeg says so', /FFmpeg/.test(noConv));

// ---- a tool with save_to: the real path first, or Error ----
const newest = () => png;
const out1 = await withSaveTo(cfg, { save_to: path.join(pics, 'tool.png') }, async () => 'Painted it.', { newest });
check('the result starts with Saved: and the real path', out1.startsWith(`Saved: ${path.join(pics, 'tool.png')}`) && /Painted it\./.test(out1));
const out2 = await withSaveTo(cfg, { save_to: path.join(pics, 'none.png') }, async () => 'Didn\'t paint yet.', { newest: () => null });
check('nothing made: Error, and nothing claimed', out2.startsWith('Error: nothing was made'));
check('no save_to: the tool\'s own answer, unchanged', (await withSaveTo(cfg, {}, async () => 'Painted it.', { newest })) === 'Painted it.');
const tools = buildTools(cfg);
for (const n of ['make_image', 'make_sound']) check(`${n} takes save_to`, Boolean(tools[n].schema.function.parameters.properties.save_to));
check('save_as takes save_to', /save_to/.test(read('src/save-as.js')) && /savedLine\(save_to/.test(read('src/save-as.js')));
check('convert_file takes a new name for one file', /name: str\('Optional, one file: its new name/.test(read('src/hands-office.js')));

// ---- make_diagram: save_to checked at once, copied once the window has drawn it ----
const dt = diagramTool();
check('make_diagram takes save_to', Boolean(dt.schema.function.parameters.properties.save_to));
const emitted = [];
const ctx = { cfg, emit: (e) => emitted.push(e) };
const bad = await dt.run({ mermaid: 'flowchart TD\nA-->B', save_to: path.join(pics, 'flow.jpg') }, ctx);
check('a diagram ending it can\'t make is refused before drawing', /^Error: diagrams save as \.png, \.svg or \.pdf/.test(bad) && !emitted.length);
const far = await dt.run({ mermaid: 'flowchart TD\nA-->B', save_to: path.join(root, 'elsewhere', 'flow.png') }, ctx);
check('a diagram for a folder Bob may not save in is refused before drawing', /^Error: not saved to/.test(far) && !emitted.length);
const ok = await dt.run({ title: 'Flow', mermaid: 'flowchart TD\nA-->B', save_to: path.join(pics, 'flow.png') }, ctx);
check('a diagram with save_to says it is saving, not that it is saved', /^Drawing: .*flow\.png/.test(ok) && /not that it's already there/.test(ok) && emitted[0]?.format === 'png');
const mmd = path.basename(emitted[0].file);
const pngData = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.from('rest')]).toString('base64');
const saved = saveExport({ ...cfg, outputDirs: [path.dirname(emitted[0].file)] }, { name: mmd, format: 'png', data: pngData });
check('once drawn, the copy lands where asked', saved.copy === path.join(pics, 'flow.png') && fs.existsSync(saved.copy));

// ---- short paths for the Hands ----
fs.writeFileSync(path.join(home, 'backup_2022.zip'), 'zip');
check('~ in a Hands path is the home folder', shortPath(cfg, '~/scripts/x.py', { home }) === path.join(home, 'scripts', 'x.py'));
check('a bare name found in exactly one Hands folder is used', shortPath(cfg, 'backup_2022.zip', { home }) === path.join(home, 'backup_2022.zip'));
check('a bare name found nowhere is left as given', shortPath(cfg, 'nope.zip', { home }) === 'nope.zip');
check('a new name (a destination) is never guessed', shortPath(cfg, 'Restored', { home, mustExist: false }) === 'Restored');

// ---- reminders cancel by their words ----
saveReminders(cfg, [
  { id: 'r1', local: '2026-11-14 09:00', text: 'Team meeting (Zoom link)', at: Date.now() + 1e6 },
  { id: 'r2', local: '2026-11-15 10:00', text: 'Call the vet', at: Date.now() + 2e6 }
]);
const rem = buildTools(cfg).reminders;
const said = await rem.run({ action: 'cancel', id: '2026‑11‑14 09:00 AM – Team meeting (Zoom link)' }, { cfg });
check('a reminder cancels by the words the list showed', /Cancelled reminder r1/.test(said));
let vague = '';
try { await rem.run({ action: 'cancel', id: 'the' }, { cfg }); } catch (e) { vague = e.message; }
check('words that fit none (or several) cancel nothing', /No reminder with that id or those words/.test(vague));
check('the other reminder is still there', /r2/.test(await rem.run({ action: 'list' }, { cfg })));

// ---- aliases: other names for Bob's tools run Bob's own tool, under Bob's name ----
{
  const tl = buildTools(cfg);
  const offered = { run_command: { schema: { function: { parameters: { type: 'object', properties: { cmd: { type: 'string' }, args: { type: 'array', items: { type: 'string' } }, cwd: { type: 'string' } }, required: ['cmd'] } } } }, list_folder: tl.list_folder,
    file_hands: { schema: { function: { parameters: { type: 'object', properties: { action: { type: 'string' }, paths: { type: 'array', items: { type: 'string' } }, to: { type: 'string' } }, required: ['action', 'paths'] } } } } };
  const calls = [
    { function: { name: 'run_program', arguments: JSON.stringify({ command: 'python "my script.py" 1000' }) } },
    { function: { name: 'read_dir', arguments: { path: home } } },
    { function: { name: 'move_files', arguments: { source: 'a.txt', destination: 'Old' } } },
    { function: { name: 'make_tool', arguments: {} } }
  ];
  fixCalls(calls, offered);
  check('run_program runs run_command, its line split into the program and its arguments', calls[0].function.name === 'run_command' && calls[0].function.arguments.cmd === 'python' && calls[0].function.arguments.args.join('|') === 'my script.py|1000' && !calls[0].bounce);
  check('read_dir runs list_folder', calls[1].function.name === 'list_folder' && calls[1].function.arguments.path === home && !calls[1].bounce);
  check('move_files runs file_hands move', calls[2].function.name === 'file_hands' && calls[2].function.arguments.action === 'move' && calls[2].function.arguments.paths[0] === 'a.txt' && calls[2].function.arguments.to === 'Old');
  check('a name that is no alias is still bounced', Boolean(calls[3].bounce));
  const notOffered = [{ function: { name: 'move_files', arguments: { source: 'a', destination: 'b' } } }];
  fixCalls(notOffered, { list_folder: tl.list_folder });
  check('an alias for a tool not offered right now runs nothing', Boolean(notOffered[0].bounce));
}

// ---- a command that only writes a file goes to write_file (Bobert's habit from old lessons) ----
for (const [cmd, args] of [['cmd', ['/c', 'echo hello > notes.txt']], ['powershell', ['-Command', 'Set-Content -Path a.txt -Value hi']], ['python', ['-c', "open('a.txt','w').write('x')"]], ['echo', ['hi', '>', 'a.txt']]])
  check(`"${cmd} ${args.join(' ')}" is a file write, for write_file`, writesFileOnly({ cmd, args }));
for (const [cmd, args] of [['npm', ['test']], ['cmd', ['/c', 'npm test > log.txt']], ['python', ['script.py']], ['python', ['-c', 'print(1)']], ['bash', ['-c', 'echo hi 2>&1']]])
  check(`"${cmd} ${args.join(' ')}" still runs`, !writesFileOnly({ cmd, args }));
check('run_command refuses a file write before any card, pointing to write_file', /writesFileOnly\(a\) && brain\.tools\?\.write_file\) throw new Error\('Not run: this command only writes a file\. Use write_file/.test(read('src/hands.js')));

// ---- search_files with no projects searches the folders Bob may read (Nov 16 real-job runs) ----
{
  fs.writeFileSync(path.join(home, 'notes.txt'), 'call the plumber on Tuesday\n');
  const out = await buildTools({ ...cfg, readRoots: [home], projects: {} }).search_files.run({ text: 'plumber' });
  check('search_files with no projects searches the readable folders and says so', /no project is set up, so this searched/.test(out) && /notes\.txt:1: call the plumber/.test(out), out.slice(0, 200));
}

fs.rmSync(root, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
