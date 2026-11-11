// "Launch on start-up" (Settings). Bob registers himself with '--hidden' so he starts in the tray. Windows matches
// the entry together with its arguments, so it is read both with and without them, and switching off clears both.
// Linux has no login items in Electron, so there Bob writes the desktop's own autostart file instead
// (~/.config/autostart/ca.mousewurx.bob.desktop, the freedesktop.org way GNOME, KDE and the rest read), pointing at
// the AppImage, the .deb's /opt/Bob/bob, or "flatpak run ca.mousewurx.bob". Off unless the user turns it on, like everywhere else.
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const LOGIN_ARGS = ['--hidden'];

const FLATPAK_ID = 'ca.mousewurx.bob';

// Inside a Flatpak, XDG_CONFIG_HOME points into Bob's own sandbox folder, which the desktop never reads, so the
// file goes in the real ~/.config/autostart (the Flatpak is allowed that one folder: xdg-config/autostart).
function autostartFile(env = process.env, home = os.homedir()) {
  const config = env.FLATPAK_ID === FLATPAK_ID ? path.join(home, '.config') : env.XDG_CONFIG_HOME || path.join(home, '.config');
  return path.join(config, 'autostart', 'ca.mousewurx.bob.desktop');
}

// Exec= quoting from the Desktop Entry spec: the program in double quotes, with " ` $ \ escaped.
const execQuote = (p) => `"${String(p).replace(/(["`$\\])/g, '\\$1')}"`;

function linuxLoginItem({ env = process.env, exe, home = os.homedir() } = {}) {
  const file = autostartFile(env, home);
  // The AppImage itself (APPIMAGE), never the mount point it runs from, which changes every start.
  // A Flatpak Bob starts through Flatpak (the program inside the sandbox can't be run from outside); a .deb Bob is /opt/Bob/bob.
  const program = () => (exe ? execQuote(exe) : env.FLATPAK_ID === FLATPAK_ID ? `flatpak run ${FLATPAK_ID}` : execQuote(env.APPIMAGE || process.execPath));
  return {
    file,
    // On when the file is there and hasn't been switched off in the desktop's own settings (Hidden or GNOME's flag).
    get: () => { try { return !/^\s*(Hidden\s*=\s*true|X-GNOME-Autostart-enabled\s*=\s*false)\s*$/im.test(fs.readFileSync(file, 'utf8')); } catch { return false; } },
    set: (on) => {
      if (!on) { fs.rmSync(file, { force: true }); return; }
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, ['[Desktop Entry]', 'Type=Application', 'Name=Bob', 'Comment=Bob, a local AI who lives on your PC',
        `Exec=${program()} ${LOGIN_ARGS.join(' ')}`, `Icon=${env.FLATPAK_ID === FLATPAK_ID ? FLATPAK_ID : 'bob'}`, 'Terminal=false', 'X-GNOME-Autostart-enabled=true', ''].join('\n'));
    }
  };
}

function loginItem(app, opts = {}) {
  if ((opts.platform || process.platform) === 'linux') return linuxLoginItem(opts);
  return {
    get: () => Boolean(app.getLoginItemSettings({ args: LOGIN_ARGS }).openAtLogin || app.getLoginItemSettings().openAtLogin),
    set: (on) => {
      if (!on) app.setLoginItemSettings({ openAtLogin: false }); // an older entry without arguments
      app.setLoginItemSettings({ openAtLogin: Boolean(on), args: LOGIN_ARGS });
    }
  };
}
module.exports = { loginItem, linuxLoginItem, autostartFile, LOGIN_ARGS, FLATPAK_ID };
