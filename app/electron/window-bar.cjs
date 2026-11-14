// 1.5.227 "Window buttons on Bob's bar" (off unless turned on; Settings, Bob himself). The system title bar goes,
// and the minimise, maximise and close buttons sit on Bob's own top bar instead.
// Windows and Linux: Electron's Window Controls Overlay draws the real system buttons over the page's top-right
// corner, so Snap Layouts (hover over maximise on Windows 11), Alt+Space, Alt+F4, double-click to maximise,
// dragging to the screen edge and the screen reader names all still work. The page reads where they are
// (navigator.windowControlsOverlay, public/window-bar.js) and keeps its own buttons clear of them.
// Mac: the traffic lights stay, moved onto Bob's bar (titleBarStyle hidden). Full screen hides them as usual.
// The resize edges are the window's own, so resizing works as before everywhere.
// The choice is read when the window is made, so changing it shows next time Bob opens.

const BAR_HEIGHT = 36; // the buttons' height to start with; the page then matches them to its top bar (cleanColours)
const START = { color: '#121212', symbolColor: '#e8e8e8' }; // until the page says its own colours (a moment later)

// A Mac's traffic lights are about 14 px tall: centred in the bar's height, 16 px in from the left.
const trafficLights = (height = BAR_HEIGHT) => ({ x: 16, y: Math.max(6, Math.round((height - 14) / 2)) });

function barOptions(platform, on) {
  if (!on) return {};
  if (platform === 'darwin') return { titleBarStyle: 'hidden', titleBarOverlay: true, trafficLightPosition: trafficLights() };
  return { titleBarStyle: 'hidden', titleBarOverlay: { ...START, height: BAR_HEIGHT } };
}

// The page's colours and the height of its top bar, checked: only #rrggbb and a whole number of pixels in a
// sensible range (Lamplight's bar on a wide window is about 70 px; Classic and narrow windows use a thin strip).
const HEX = /^#[0-9a-f]{6}$/i;
const MIN_H = 28, MAX_H = 96;
function cleanColours(b) {
  if (!b || typeof b !== 'object' || !HEX.test(String(b.color)) || !HEX.test(String(b.symbolColor))) return null;
  const out = { color: b.color.toLowerCase(), symbolColor: b.symbolColor.toLowerCase() };
  if (Number.isInteger(b.height) && b.height >= MIN_H && b.height <= MAX_H) out.height = b.height;
  return out;
}

module.exports = { BAR_HEIGHT, MIN_H, MAX_H, barOptions, cleanColours, trafficLights };
