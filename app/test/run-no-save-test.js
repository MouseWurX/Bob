// "Do not save the file" (1.5.208 PC check): the ask said not to save, and Bob still asked to make a file.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { saysNoSave, SAVING_TOOLS, noSaveLine } from '../src/no-save.js';
import { Brain } from '../src/brain.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };

const says = ['Open Notepad and type a poem. Do not save the file.', "type it in notepad, don't save it", 'Write a list in Notepad without saving', 'dont save anything', 'no need to create a file, just type it', 'Put it in Notepad. No file please.', 'leave it unsaved', 'do not make a new file', 'never save this'];
const not = ['Save the file as notes.txt', 'Write a poem and save it', 'Can you save me some time?', "Don't forget to save the file", 'make a file called list.txt', 'Do not open my files folder', 'It does not save money'];
check('asks that say not to save are seen', says.every(saysNoSave), says.filter((s) => !saysNoSave(s)).join(' | '));
check('asks that want a file (or say "save me time") are not', !not.some(saysNoSave), not.filter(saysNoSave).join(' | '));
check('the file-saving tools are covered; picture and music makers are not', ['write_file', 'edit_file', 'office_make', 'save_spreadsheet'].every((t) => SAVING_TOOLS.has(t)) && !SAVING_TOOLS.has('make_image') && !SAVING_TOOLS.has('make_music'));

// The brain's own gate: the tool doesn't run, and Bob is told why and not to offer a file.
const fake = Object.create(Brain.prototype);
let ran = 0; const logs = [];
Object.assign(fake, { cfg: { userName: 'Sam' }, tools: { write_file: { run() { ran++; return 'Saved.'; } } }, log: (k, t) => logs.push(`${k}: ${t}`) });
const r = await fake.runTool('write_file', { path: 'C:/x/poem.txt', content: 'hi' }, { turnText: 'Type a poem into Notepad. Do not save the file.' });
check('write_file does nothing when the ask said not to save, and says so', ran === 0 && /Sam said not to save a file/.test(r.text) && /Don't offer a file/.test(r.text) && logs.some((l) => /ask said not to save/.test(l)), JSON.stringify(r));
check('the line is the same one the tools give', r.text === noSaveLine('Sam'));

const src = fs.readFileSync(fileURLToPath(new URL('../src/hands-apps.js', import.meta.url)), 'utf8');
check("long typing doesn't offer a .txt file when the ask said not to save", /saysNoSave\(ctx\?\.turnText\) \? `\$\{who\} said not to save a file, so don't offer one/.test(src));
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
