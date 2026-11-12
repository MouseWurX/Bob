// 1.5.49: "Launch on start-up" reads the real Windows entry (registered with --hidden) and switching off clears it.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { loginItem } = createRequire(import.meta.url)('../electron/login-item.cjs');

let pass = 0, fail = 0;
const check = (name, ok) => { if (ok) { pass++; console.log(`PASS ${name}`); } else { fail++; console.log(`FAIL ${name}`); } };
// A stand-in for Electron's app on Windows: entries are keyed by their arguments.
function fakeApp(entries = {}) {
  const key = (o) => JSON.stringify(o?.args || []);
  return { entries, getLoginItemSettings: (o) => ({ openAtLogin: Boolean(entries[key(o)]) }), setLoginItemSettings: (o) => { if (o.openAtLogin) entries[key(o)] = true; else delete entries[key(o)]; } };
}
const WIN = { platform: 'win32' }; // the Windows checks run the same on any machine
let app = fakeApp({ '["--hidden"]': true });
check('an entry with --hidden reads as on (it read as off before 1.5.49)', loginItem(app, WIN).get() === true);
loginItem(app, WIN).set(false);
check('switching off clears the --hidden entry', loginItem(app, WIN).get() === false && !Object.keys(app.entries).length);
app = fakeApp({ '[]': true });
check('an older entry without arguments reads as on', loginItem(app, WIN).get() === true);
loginItem(app, WIN).set(false);
check('switching off clears the older entry too', loginItem(app, WIN).get() === false);
app = fakeApp();
check('nothing registered reads as off (opt-in)', loginItem(app, WIN).get() === false);
loginItem(app, WIN).set(true);
check('switching on registers it with --hidden', app.entries['["--hidden"]'] === true && loginItem(app, WIN).get() === true);

// Linux: the desktop's autostart file, pointing at the AppImage, never the place it is mounted.
const xdg = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-xdg-'));
const env = { XDG_CONFIG_HOME: xdg, APPIMAGE: '/home/sam/Apps/Bob "new" $1.AppImage' };
const lin = loginItem(null, { platform: 'linux', env });
const file = path.join(xdg, 'autostart', 'ca.mousewurx.bob.desktop');
check('Linux: nothing there reads as off (opt-in)', lin.get() === false && !fs.existsSync(file));
lin.set(true);
const text = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
check('Linux: switching on writes the autostart file', lin.get() === true && /^\[Desktop Entry\]/.test(text) && /^Type=Application$/m.test(text));
check('Linux: it starts the AppImage hidden, quoted the desktop way', text.includes('Exec="/home/sam/Apps/Bob \\"new\\" \\$1.AppImage" --hidden'));
fs.writeFileSync(file, text.replace('X-GNOME-Autostart-enabled=true', 'X-GNOME-Autostart-enabled=false'));
check('Linux: switched off in the desktop\'s own settings reads as off', lin.get() === false);
lin.set(false);
check('Linux: switching off removes the file', !fs.existsSync(file) && lin.get() === false);

// The .deb: Bob is /opt/Bob/bob (passed in, never the tester's own program).
const deb = loginItem(null, { platform: 'linux', env: { XDG_CONFIG_HOME: xdg }, exe: '/opt/Bob/bob' });
deb.set(true);
check('Linux .deb: it starts /opt/Bob/bob hidden', fs.readFileSync(file, 'utf8').includes('Exec="/opt/Bob/bob" --hidden'));
deb.set(false);

// The Flatpak: the real ~/.config/autostart (not the sandbox's XDG_CONFIG_HOME), started through Flatpak.
const fakeHome = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-home-'));
const fp = loginItem(null, { platform: 'linux', env: { FLATPAK_ID: 'ca.mousewurx.bob', XDG_CONFIG_HOME: path.join(fakeHome, '.var', 'app', 'ca.mousewurx.bob', 'config') }, home: fakeHome });
const fpFile = path.join(fakeHome, '.config', 'autostart', 'ca.mousewurx.bob.desktop');
check('Linux Flatpak: the file goes in the desktop\'s own autostart folder, not the sandbox\'s', fp.file === fpFile);
fp.set(true);
const fpText = fs.existsSync(fpFile) ? fs.readFileSync(fpFile, 'utf8') : '';
check('Linux Flatpak: it starts through flatpak run, hidden, with the Flatpak\'s icon', /^Exec=flatpak run ca\.mousewurx\.bob --hidden$/m.test(fpText) && /^Icon=ca\.mousewurx\.bob$/m.test(fpText));
fp.set(false);
check('Linux Flatpak: switching off removes it', !fs.existsSync(fpFile));
fs.rmSync(fakeHome, { recursive: true, force: true });
fs.rmSync(xdg, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
