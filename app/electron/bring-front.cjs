// Nov 16 2026 "Open brings it to the front" (a reliability fix, so always on). Settings, the Computer Science Lab,
// the fNRI viewer and "Bob's thinking" are one window each. Opening one that is already open used to do nothing
// you could see when it was behind other windows or minimised: the page's own focus() only works inside a browser,
// not for a whole window. Now the page asks Bob.exe (POST /api/window-front) and the window itself comes forward.
//
// Per system: Windows and Mac raise and focus it. Windows may only flash a window in the taskbar instead of raising
// it, so it is put on top for a moment and then let go (a window that is always on top, like "Bob's thinking",
// stays so). Linux: X11 desktops raise it; a Wayland desktop may only say the window wants attention, its own rule.
const NAMES = ['settings', 'lab', 'watch', 'mind'];

// `w` is an Electron BrowserWindow (a fake in the tests). True when there was a window to bring forward.
function raise(w, platform = process.platform) {
  if (!w || (typeof w.isDestroyed === 'function' && w.isDestroyed())) return false;
  try {
    if (w.isMinimized?.()) w.restore();
    if (!w.isVisible?.()) w.show();
    const pin = platform === 'win32' && w.isAlwaysOnTop?.() === false;
    if (pin) w.setAlwaysOnTop(true);
    w.moveTop?.();
    w.focus();
    if (pin) w.setAlwaysOnTop(false);
    return true;
  } catch { return false; }
}

// Only the four names; anything else is ignored.
const cleanName = (n) => (NAMES.includes(n) ? n : '');

module.exports = { raise, cleanName, NAMES };
