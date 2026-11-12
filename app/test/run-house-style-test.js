// 1.5.34: House style defaults (Equip Bob) and Projects (Settings). Run: node test/run-house-style-test.js
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { HOUSE, cleanHouseStyle, houseStylePrompt, applyHouseStyle, usedLine, houseStyleHtml, houseGroupOf } from '../public/house-style.js';
import { replaceSettings, mergeSettings, cleanProjects } from '../src/config.js';
import { pickFolder } from '../src/pick-folder.js';
import { kitHtml, SLOTS } from '../public/equip.js';
import { HELP } from '../public/help-content.js';
import { settingsNow } from '../src/self-help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-house-'));

// Cleaning
{
  const c = cleanHouseStyle({ music: { style: '  chiptune,\n upbeat <b> ', seconds: '500', vocals: 'rap' }, pictures: { shape: 'wide', style: '' }, video: { seconds: 0 }, times: { morning: '08:00', night: '25:00' }, evil: { x: 1 } });
  check('text is tidied and kept short', c.music.style === 'chiptune, upbeat b');
  check('seconds are kept in range', c.music.seconds === 240 && c.video.seconds === 1);
  check('unknown choices and bad times are dropped', !('vocals' in c.music) && c.times.morning === '08:00' && !('night' in c.times));
  check('empty boxes and unknown groups are dropped', !('style' in c.pictures) && !('evil' in c) && Object.keys(cleanHouseStyle({})).length === 0);
}

// Prompt
{
  check('nothing set: nothing added to the prompt', houseStylePrompt({}) === '' && houseStylePrompt(undefined) === '');
  const p = houseStylePrompt({ music: { style: 'chiptune, upbeat', seconds: 30, vocals: 'instrumental' }, pictures: { shape: 'wide' }, times: { morning: '08:00' } }, 'Sam');
  check('prompt line names the defaults', /music: chiptune, upbeat, 30 seconds, instrumental/.test(p) && /pictures: wide/.test(p) && /morning = 08:00/.test(p));
  check('prompt says use them instead of asking, and the request wins', /use it instead of asking/.test(p) && /Anything Sam says in the request wins/.test(p));
}

// Tool defaults
{
  const hs = { music: { seconds: 45 }, pictures: { shape: 'tall' }, video: { seconds: 4 }, sfx: { seconds: 3 } };
  const m = applyHouseStyle('make_music', { prompt: 'x' }, hs);
  check('music: length filled in and reported', m.args.seconds === 45 && usedLine(m.used) === 'Used your house style: 45 seconds');
  check('what the brain set is never overridden', applyHouseStyle('make_music', { prompt: 'x', seconds: 20 }, hs).args.seconds === 20 && applyHouseStyle('make_music', { prompt: 'x', seconds: 20 }, hs).used.length === 0);
  const i = applyHouseStyle('make_image', { prompt: 'fox' }, hs);
  check('pictures: shape sets the size', i.args.width === 768 && i.args.height === 1344 && i.used[0] === 'tall shape');
  check('pictures: an edit (with a reference) keeps its own size', applyHouseStyle('make_image', { prompt: 'x', reference: ['last'] }, hs).args.width === undefined);
  check('clips and sound effects get their lengths', applyHouseStyle('make_video', { prompt: 'x' }, hs).args.seconds === 4 && applyHouseStyle('make_sound', { prompt: 'x' }, hs).args.seconds === 3);
  check('other tools and empty house style: untouched', applyHouseStyle('remember', { fact: 'a' }, hs).used.length === 0 && applyHouseStyle('make_music', { prompt: 'x' }, {}).args.seconds === undefined);
}

// Page boxes
{
  check('each maker slot has its group', houseGroupOf('music') === 'music' && houseGroupOf('image') === 'pictures' && houseGroupOf('video') === 'video' && houseGroupOf('sfx') === 'sfx' && houseGroupOf('bob') === null);
  const h = houseStyleHtml('music', { music: { style: 'chiptune', seconds: 30 } });
  check('box shows saved values, open, with labels', /value="chiptune"/.test(h) && /value="30"/.test(h) && /<details class="house-style" id="house-music" open>/.test(h) && /<label for="hs-music-style">/.test(h));
  check('empty box says Bob picks, closed', /\(Bob picks\)/.test(houseStyleHtml('sfx', {})) && !/ open>/.test(houseStyleHtml('sfx', {})));
  check('values are escaped', !/<script>/.test(houseStyleHtml('pictures', { pictures: { style: '"><script>' } })));
  // 1.5.210 the boxes live in Settings, House style (every group, times of day too); a maker job's kit has a door to them.
  const cellar = fs.readFileSync(new URL('../public/cellar.js', import.meta.url), 'utf8');
  check('Settings, House style draws every group, times of day too', /\['house', '🖋 House style'[^\n]*Object\.keys\(HOUSE\)\.map\(\(g\) => houseStyleHtml\(g, settings\.houseStyle\)\)/.test(cellar) && Object.keys(HOUSE).includes('times'));
  const kit = kitHtml(SLOTS.find((s) => s.id === 'music'), { selected: 'music', roles: { current: {}, options: {} }, models: [], houseStyle: { music: { seconds: 30 } } });
  check('the Music job has a door to House style, and no second copy of the boxes', /data-gohouse="music"/.test(kit) && !kit.includes('id="house-music"'));
}

// Saving whole, and Projects
{
  const cfg = { settingsFile: path.join(tmp, 's.json'), projects: { Hand: '/from/config' } };
  mergeSettings(cfg, {});
  check('without a saved list, config.json projects stay', cfg.projects.Hand === '/from/config');
  replaceSettings(cfg, { houseStyle: { music: { style: 'a', seconds: 30 } } });
  replaceSettings(cfg, { houseStyle: { music: { style: 'a' } } });
  const saved = JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8'));
  check('an emptied box really clears (saved whole, not merged)', !('seconds' in cfg.houseStyle.music) && !('seconds' in saved.houseStyle.music));
  replaceSettings(cfg, { projectList: [{ name: 'Game', path: path.join(tmp, 'game') }, { name: 'game', path: '/dup' }, { name: 'Rel', path: 'relative' }], defaultProject: 'Game' });
  check('projects from Settings replace config.json ones; duplicates and relative paths dropped', Object.keys(cfg.projects).join() === 'Game' && cfg.defaultProject === 'Game');
  replaceSettings(cfg, { projectList: [] });
  check('removing the main project clears it', Object.keys(cfg.projects).length === 0 && cfg.defaultProject === '');
  const again = { settingsFile: cfg.settingsFile, projects: { Hand: '/from/config' } };
  mergeSettings(again, JSON.parse(fs.readFileSync(cfg.settingsFile, 'utf8')));
  check('after a restart the saved (empty) list still wins over config.json', Object.keys(again.projects).length === 0);
  check('cleanProjects ignores junk', cleanProjects('x').length === 0 && cleanProjects([{ name: '<x>', path: '/a' }])[0].name === 'x');
}

// Folder picker
{
  let err = '';
  try { await pickFolder({ platform: 'sunos' }); } catch (e) { err = e.message; }
  check('folder picker: plain message where there is none', /only works on Windows, Mac and Linux/.test(err));
  let macArgs = null;
  const mac = await pickFolder({ platform: 'darwin', run: (exe, args, o, cb) => { macArgs = [exe, ...args]; cb(null, '/Users/me/Projects/Game/\n'); } });
  const macNone = await pickFolder({ platform: 'darwin', run: (exe, args, o, cb) => { cb(Object.assign(new Error('x'), { code: 1 }), '', 'execution error: User canceled. (-128)'); } });
  check('folder picker on a Mac: AppleScript choose folder, trailing slash dropped, cancel = empty', macArgs[0] === '/usr/bin/osascript' && /choose folder/.test(macArgs[2]) && mac === '/Users/me/Projects/Game' && macNone === '');
  const got = await pickFolder({ platform: 'win32', run: (exe, args, o, cb) => { cb(null, 'C:\\Games\\Game\r\n'); } });
  const none = await pickFolder({ platform: 'win32', run: (exe, args, o, cb) => { cb(null, ''); } });
  check('folder picker: returns the folder, or empty when cancelled', got === 'C:\\Games\\Game' && none === '');
}

// Help and Bob knowing his settings
{
  const ids = HELP.map((e) => e.id);
  check('Help covers House style and Settings: Projects', ids.includes('house-style') && ids.includes('settings-projects'));
  const now = settingsNow({ houseStyle: { music: { seconds: 30 } }, projects: { Game: '/x' }, defaultProject: 'Game' });
  check('Bob can read his house style and projects', /House style \(Settings\): music: 30 seconds/.test(now) && /Projects \(Settings\): Game; main project Game/.test(now));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
