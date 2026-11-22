// 22 Nov 2026 (flashnext-tools read of after2 and steps40): 27 of 36 "no file there" errors on office_read, office_edit
// and inspect_file were files that were there, a folder away ("C:\\Users\\you\\Q3_Sales.xlsx" for Documents\\Q3_Sales.xlsx).
// canRead (hands-office.js) now looks a bare or missing name up in the folders Bob may read, as read_file does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { canRead } from '../src/hands-office.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const home = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-officefind-'));
const docs = path.join(home, 'Documents'), desk = path.join(home, 'Desktop'), old = path.join(docs, 'Old'), dataDir = path.join(home, 'bobdata');
for (const d of [docs, desk, old, dataDir]) fs.mkdirSync(d, { recursive: true });
fs.writeFileSync(path.join(docs, 'Q3_Sales.xlsx'), 'x');
fs.writeFileSync(path.join(docs, 'Budget.xlsx'), 'x'); fs.writeFileSync(path.join(old, 'Budget.xlsx'), 'x');
fs.writeFileSync(path.join(desk, '.env'), 'KEY=1');
const cfg = { dataDir, innDir: dataDir, readRoots: [home], readOnlyRoots: [], hands: { enabled: true, folders: [home] } };
const err = (p) => { try { canRead(cfg, p); return ''; } catch (e) { return String(e.message); } };
check('a home-folder guess finds the one file by that name a folder down', canRead(cfg, path.join(home, 'Q3_Sales.xlsx')) === path.join(docs, 'Q3_Sales.xlsx'));
check('a bare name finds it too', canRead(cfg, 'Q3_Sales.xlsx') === path.join(docs, 'Q3_Sales.xlsx'));
check('a full right path is used as it is', canRead(cfg, path.join(docs, 'Q3_Sales.xlsx')) === path.join(docs, 'Q3_Sales.xlsx'));
const two = err(path.join(home, 'Budget.xlsx'));
check('two files by that name: both named, none picked', /There are 2 files called Budget\.xlsx/.test(two) && two.includes(path.join(old, 'Budget.xlsx')), two);
const none = err(path.join(home, 'Nope.docx'));
check('no file anywhere: says where it looked for it', /^There's no file at .*Nope\.docx, and no file called Nope\.docx in the folders I can read\.$/.test(none), none);
check('a file outside the folders Bob may read is still refused, not looked up', /not allowed to open files/.test(err(path.join(os.tmpdir(), 'elsewhere', 'Q3_Sales.xlsx'))));
check('a keys file (.env) is never found by name', /no file called \.env/.test(err('.env')) && /no file called \.env|off-limits/.test(err(path.join(home, '.env'))), `${err('.env')} | ${err(path.join(home, '.env'))}`);
try { fs.rmSync(home, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
