// Tests "Remove Bob": what it plans to remove, the guards against removing anything else, and the window.
import { serverText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { plan, safeToRemove, startUninstall, programDir } from '../src/uninstall.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-rm-'));
const home = path.join(tmp, 'Bob home');
const app = path.join(home, 'Bob app');
fs.mkdirSync(path.join(app, 'resources', 'app'), { recursive: true });
fs.writeFileSync(path.join(app, 'Bob.exe'), 'MZ');
fs.mkdirSync(path.join(home, 'inn', 'bob'), { recursive: true });
fs.mkdirSync(path.join(home, 'inn', 'ledger'), { recursive: true });
fs.mkdirSync(path.join(home, 'models', 'bob'), { recursive: true });
const cfg = { agentDir: home, innDir: path.join(home, 'inn'), dataDir: path.join(home, 'inn', 'bob'), bobModelsDir: path.join(home, 'models', 'bob'), port: 7777 };
const env = { BOB_APP_DIR: app, APPDATA: path.join(tmp, 'Roaming'), SystemRoot: 'C:\\Windows', ComSpec: 'cmd.exe' };

check('the program folder is the one with Bob.exe and resources\\app', programDir(env) === app && programDir({ BOB_APP_DIR: home }) === '');
const pl = plan(cfg, env);
check('the plan names the program, inn\\bob (never the whole inn) and models\\bob', pl.app === app && pl.inn === cfg.dataDir && pl.inn !== cfg.innDir && pl.models === cfg.bobModelsDir);
check('a data or models folder that is the home, outside it or oddly named is never offered', plan({ ...cfg, dataDir: home }, env).inn === '' && plan({ ...cfg, dataDir: cfg.innDir }, env).inn === '' && plan({ ...cfg, bobModelsDir: path.join(home, 'models') }, env).models === '' && plan({ ...cfg, bobModelsDir: home }, env).models === '');
check('it only runs on Windows from an installed Bob.exe', process.platform === 'win32' ? pl.canRun : !pl.canRun && /Windows/.test(pl.why));
check('running from source has nothing to remove', !plan(cfg, {}).canRun);

check('the program folder inside the home can go', safeToRemove(app, cfg));
check('the home folder itself never goes', !safeToRemove(home, cfg));
check('a folder above the home never goes', !safeToRemove(tmp, cfg));
check('the source folder (or one holding it) never goes', !safeToRemove(path.join(home, 'bob'), cfg, { source: path.join(home, 'bob') }) && !safeToRemove(home, cfg, { source: path.join(home, 'bob', 'src') }));
check('the user folder and drive roots never go', !safeToRemove(os.homedir(), cfg) && !safeToRemove(path.parse(tmp).root, cfg));

if (process.platform === 'win32') {
  let call = null;
  const r = startUninstall(cfg, { notes: false, models: true }, { env, spawnImpl: (exe, args) => { call = { exe, args }; return { unref() {} }; } });
  const line = call.args.at(-1);
  check('the removal window starts through cmd start, from a copy in %TEMP%', /start "Bob update" \/min/.test(line) && line.includes(os.tmpdir()) && /bob-uninstall-/.test(line));
  check('notes stay unless ticked; models go when ticked', !line.includes('"-Inn"') && line.includes(`"-Models" "${cfg.bobModelsDir}"`) && r.removes.inn === '' && r.removes.models === cfg.bobModelsDir);
} else {
  let threw = ''; try { startUninstall(cfg, {}, { env }); } catch (e) { threw = e.message; }
  check('off Windows it refuses with a reason', /Windows/.test(threw));
}

const ps = fs.readFileSync(new URL('../installer/bob-uninstall.ps1', import.meta.url), 'utf8');
check('the window waits for Bob to close and removes nothing while he is open', /while \(\(Bob-Running\)/.test(ps) && /Bob is still open, so nothing was removed/.test(ps));
check('it removes the program only if it really is Bob (Bob.exe + package.json named bob)', /function Is-BobProgram/.test(ps) && /\.name -eq 'bob'/.test(ps) && /if \(Is-BobProgram \$AppDir\)/.test(ps));
check('the shortcut goes only if it points at this Bob.exe', /CreateShortcut\(\$lnk\)\.TargetPath/.test(ps) && /-ieq/.test(ps));
check('inn\\bob and models\\bob go only when passed, and only folders with those names', /\$Inn -and \(Split-Path -Leaf \$Inn\) -eq 'bob' -and \(Split-Path -Leaf \(Split-Path -Parent \$Inn\)\) -eq 'inn'/.test(ps) && /\(Split-Path -Leaf \$Models\) -eq 'bob' -and/.test(ps));
check('data and models go to the Recycle Bin; only the program folder is deleted outright', /SendToRecycleBin/.test(ps) && /Recycle-Folder \$Inn/.test(ps) && /Recycle-Folder \$Models/.test(ps) && /Remove-Folder \$AppDir/.test(ps) && !/Remove-Folder \$(Inn|Models|ElectronData)/.test(ps));
check('it also waits for any program running from the Bob app folder, not just the port', /Get-Process[^\n]*Where-Object \{ \$_\.Path -and \$_\.Path\.StartsWith\(\$prefix/.test(ps));
check('the window script is plain ASCII with no PowerShell 7 syntax', !/[^\x00-\x7F]/.test(ps) && !/\?\?/.test(ps));
const server = serverText();
check('removal is local only, needs the confirm, and turns off Launch on start-up first', /p === '\/api\/uninstall'\) \{\s*if \(!isLocal\)/.test(server) && /confirm !== 'remove'/.test(server) && /if \(autostartOn\(\)\) await setAutostart\(cfg, false\)/.test(server));
const ui = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
check('Settings shows the full path and says the rest of the inn stays', /Also delete everything in <code>\$\{esc\(pl\.inn\)\}<\/code>/.test(ui) && /The rest of the inn folder/.test(ui));
check('Settings asks before removing, with notes and models unticked', /Yes, remove Bob/.test(ui) && /data-rmnotes>/.test(ui) && !/data-rmnotes checked/.test(ui) && /data-rmmodels>/.test(ui));
check('the README says how to remove Bob', /## Removing Bob/.test(fs.readFileSync(new URL('../../README.md', import.meta.url), 'utf8')));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
