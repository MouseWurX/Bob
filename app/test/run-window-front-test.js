// Nov 16 2026 "Open brings it to the front" (electron/bring-front.cjs, public/window-front.js, /api/window-front):
// pressing Settings, the Lab, the fNRI viewer or Bob's thinking again brings its open window forward, restored if
// minimised. Fake windows and a fake browser only: nothing reads this replicant matrix's own windows or system.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { inBobApp, bringToFront } from '../public/window-front.js';
import { HELP } from '../public/help-content.js';

const require = createRequire(import.meta.url);
const { raise, cleanName, NAMES } = require('../electron/bring-front.cjs');
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const fakeWin = (s = {}) => {
  const log = [];
  const st = { min: false, vis: true, top: false, gone: false, ...s };
  return {
    log, st,
    isDestroyed: () => st.gone, isMinimized: () => st.min, isVisible: () => st.vis, isAlwaysOnTop: () => st.top,
    restore: () => { log.push('restore'); st.min = false; }, show: () => { log.push('show'); st.vis = true; },
    setAlwaysOnTop: (v) => { log.push('top:' + v); st.top = v; }, moveTop: () => log.push('moveTop'), focus: () => log.push('focus')
  };
};

// ---- the window side ----
for (const os of ['win32', 'darwin', 'linux']) {
  const w = fakeWin({ min: true });
  check(`${os}: a minimised window is restored, raised and focused`, raise(w, os) && w.log.includes('restore') && w.log.includes('moveTop') && w.log.at(-1 - (os === 'win32' ? 1 : 0)) === 'focus' && !w.st.min, w.log.join());
  const h = fakeWin({ vis: false });
  check(`${os}: a hidden window is shown`, raise(h, os) && h.log.includes('show'));
}
const behind = fakeWin();
raise(behind, 'win32');
check('Windows: on top for a moment, then let go', behind.log.join() === 'top:true,moveTop,focus,top:false' && behind.st.top === false, behind.log.join());
const thinking = fakeWin({ top: true });
raise(thinking, 'win32');
check('Windows: a window that is always on top stays so', !thinking.log.some((x) => x.startsWith('top:')) && thinking.st.top === true);
check('Mac and Linux: never pinned on top', !(() => { const w = fakeWin(); raise(w, 'darwin'); raise(w, 'linux'); return w.log.some((x) => x.startsWith('top:')); })());
check('no window: nothing to do', raise(null) === false && raise(fakeWin({ gone: true })) === false);
check('a window that throws is not an error', raise({ isMinimized: () => { throw new Error('x'); } }) === false);
check('only the four names', NAMES.join() === 'settings,lab,watch,mind' && cleanName('settings') === 'settings' && ['', 'main', '__proto__', null, 'constructor'].every((n) => cleanName(n) === ''));

// ---- the page side ----
const EL = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Bob/1.5 Chrome/140.0 Electron/44.10.1 Safari/537.36';
const PHONE = 'Mozilla/5.0 (Linux; Android 14; SM-S901B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Mobile Safari/537.36';
check('Bob.exe is recognised', inBobApp(EL) && !inBobApp(PHONE) && !inBobApp(''));
const sent = [];
check('in Bob.exe it asks for the window', bringToFront('settings', { ua: EL, post: (b) => { sent.push(b); return Promise.resolve(); } }) && sent.length === 1 && sent[0].which === 'settings');
check('in a browser or on a phone it asks nothing', !bringToFront('settings', { ua: PHONE, post: () => sent.push('x') }) && sent.length === 1);
check('a failed ask is not an error', bringToFront('lab', { ua: EL, post: () => Promise.reject(new Error('gone')) }) && bringToFront('lab', { ua: EL, post: () => { throw new Error('gone'); } }));

// ---- wired in ----
const app = read('public/app.js'), main = read('electron/main.cjs'), server = read('src/server.js');
check('Settings button brings it forward', /function openSettingsWindow[\s\S]{0,700}bringToFront\('settings'\)/.test(app));
check('Lab button brings it forward', /function openLabWindow[\s\S]{0,500}bringToFront\('lab'\)/.test(app));
check('thinking buttons bring it forward', /bringToFront\('mind'\)/.test(app) && /bringToFront\('mind'\)/.test(read('public/layout.js')));
check('fNRI viewer buttons bring it forward', /bringToFront\('watch'\)/.test(read('public/lab-watch.js')) && /bringToFront\('watch'\)/.test(read('public/mind-cube.js')));
check('main process: every reopen uses raise()', !/(settingsWin|labWin|watchWin|mindWin)\.focus\(\)/.test(main) && (main.match(/raise\((settingsWin|labWin|watchWin|mindWin)\)/g) || []).length >= 5);
check('main process: front() for the four windows', /front: \(which\) => raise\(/.test(main));
check('server: local only', /p === '\/api\/window-front'[^\n]*if \(isLocal\)/.test(server));
check('sample-mode Settings address handled too', /settings\.html\?'\)/.test(main));

// ---- Help ----
const trouble = HELP.find((h) => h.id === 'trouble')?.html || '';
check('FAQ: pressed Settings and nothing happened', /pressed Settings and nothing seemed to happen/.test(trouble) && /Wayland/.test(trouble));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
