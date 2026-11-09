// Bob's little habits (public/bob-life.js), the eye glance in the sprite, and the cat's antics with matching lines.
import fs from 'node:fs';
import { createBobLife, HABIT_IDS, DOZE_MS, HEAD_MS, headFor } from '../public/bob-life.js';
import { drawBob } from '../public/bob-sprite.js';
import { frameRows, glance, LOOKS } from '../public/bob-sprite.js';
import { avatar } from '../public/avatars.js';
import { ANTIC_IDS, ANTIC_LINES, anticLine, MOMENTS } from '../public/patches.js';
import { pickAntic } from '../public/cat-antics.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---- the glance never breaks a face ----
{
  check('glance moves an eye onto the face', glance('..SSESS..', 1) === '..SSSES..' && glance('..SSESS..', -1) === '..SESSS..');
  check('glance moves a two-pixel eye as one', glance('.KKEEKK.', 1) === '.KKKEEK.');
  check('glance leaves the row alone at the edge of the face', glance('..ES..', -1) === '..ES..');
  const faces = [...Object.values(LOOKS), ...['m-1', 'f-5', 'alien-2', 'robot-7', 'computer-3', 'odd-4'].map((id) => avatar(id)).filter(Boolean)];
  let ok = faces.length >= 5;
  for (const look of faces) for (const dir of [-1, 1]) {
    const rows = frameRows({ look: dir }, look);
    const count = (rs) => rs.join('').split('E').length - 1;
    if (rows.some((r, y) => r.length !== look.map[y].length) || count(rows) !== count(look.map)) ok = false;
    if (rows.some((r, y) => [...r].some((ch, x) => (ch === '.') !== (look.map[y][x] === '.')))) ok = false; // outline unchanged
  }
  check('glancing keeps every face the same shape with the same eyes', ok, String(faces.length));
  const wink = frameRows({ wink: true }, LOOKS.innkeeper).join('');
  check('a wink closes one eye only', wink.split('E').length - 1 === 1);
  check('blink still closes both eyes', !frameRows({ blink: true }, LOOKS.innkeeper).join('').includes('E'));
}

// ---- Bob's habits, dozing and reactions ----
{
  let t = 1_000_000;
  const life = createBobLife({ now: () => t, rnd: () => 0.5 });
  check('nothing happens straight away', !life.frame().prop && life.frame().look === 0);
  t += 60000;
  const seen = new Set();
  for (let i = 0; i < 400; i++) { t += 2000; const f = life.frame(t); if (f.prop || f.look || f.wink || f.dy || f.shut) seen.add(JSON.stringify(f).length); life.poke(); }
  check('idle habits happen now and then', seen.size > 2);
  const mk = () => { let n = 0; const l = createBobLife({ now: () => n, rnd: Math.random }); return { l, at: (x) => { n = x; } }; };
  const { l: sleeper, at } = mk();
  at(DOZE_MS + 5000);
  check('after 10 quiet minutes he dozes off', sleeper.frame().shut && /z/.test(sleeper.frame().prop) && sleeper.dozing);
  sleeper.poke();
  check('a poke wakes him with a start', sleeper.frame().prop === '❗' && !sleeper.dozing);
  sleeper.state('thinking');
  at(DOZE_MS + 9000);
  check('thinking shows a thought bubble', sleeper.frame().prop === '💭');
  sleeper.state('waiting');
  check('needing your OK shows a raised hand', sleeper.frame().prop === '✋');
  sleeper.react('done');
  check('waiting for your OK beats a hop', sleeper.frame().prop === '✋');
  sleeper.state('idle'); sleeper.react('oops');
  const f = sleeper.frame();
  check('an error makes him wince', f.prop === '💦' && f.dx !== 0);
  sleeper.setStill(true);
  sleeper.react('hello');
  const s = sleeper.frame();
  check('Animations off keeps him still', !s.prop && !s.dx && !s.dy && !s.look && !s.shut);
  sleeper.setStill(false);
  sleeper.state('busy'); sleeper.state('idle');
  sleeper.react('cat');
  check('he looks over at the cat', sleeper.frame().look === 1);
  check('there are plenty of habits', HABIT_IDS.length >= 8);
}

// ---- a second brain makes his head bigger ----
{
  let t = 5000;
  const life = createBobLife({ now: () => t, rnd: () => 0.5 });
  check('one brain, normal head', headFor(0) === 1 && headFor(1) === 1 && headFor(2) > 1 && headFor(3) > headFor(2));
  life.brains(1);
  check('loading the first brain changes nothing', life.frame().head === 1 && life.head === 1);
  life.brains(2);
  check('a second brain starts the grow, with a brain prop', life.frame().head < 1.05 && life.frame().prop === '🧠');
  t += HEAD_MS * 0.7;
  const mid = life.frame().head;
  t += HEAD_MS;
  check('the head grows past and settles at the bigger size', mid > headFor(2) && life.frame().head === headFor(2), mid.toFixed(3));
  life.brains(1);
  check('back to one brain, it shrinks with a puff', life.frame().prop === '💨');
  t += HEAD_MS * 2;
  check('and ends at normal size', life.frame().head === 1);
  life.setStill(true); life.brains(2);
  check('with Animations off the size changes at once, no animation', life.frame().head === headFor(2));
  // drawing a big head fits in the same square
  const rects = [];
  const ctx = { clearRect() {}, set fillStyle(v) {}, fillRect: (x, y, w, h) => rects.push([x, y, w, h]) };
  for (const id of ['sysop', 'bot', 'innkeeper']) drawBob(ctx, 56, { head: headFor(3) }, id);
  check('a big head still fits in the picture (top and bottom)', rects.every(([x, y, w, h]) => y >= 0 && y + h <= 57));
}

// ---- the cat ----
{
  check('the cat has at least 15 antics', ANTIC_IDS.length >= 15, String(ANTIC_IDS.length));
  check('every antic has at least two lines with the cat\'s name', ANTIC_IDS.every((a) => ANTIC_LINES[a].length >= 2 && ANTIC_LINES[a].every((l) => l.includes('{{CAT}}'))));
  check('antic lines use the name from Settings', anticLine('perch', 'Mittens', 0).startsWith('Mittens') && !anticLine('perch', 'Mittens', 1).includes('{{CAT}}'));
  check('the cat\'s lines never use he or she', ANTIC_IDS.every((a) => ANTIC_LINES[a].every((l) => !/\b(she|her|he|his|him)\b/i.test(l.replace(/Bob's|Bob/g, '')))));
  const recent = [];
  let repeats = 0;
  for (let i = 0; i < 60; i++) { const a = pickAntic(recent); if (recent.includes(a)) repeats++; recent.push(a); if (recent.length > Math.floor(ANTIC_IDS.length * 0.7)) recent.shift(); }
  check('no antic repeats until most have played', repeats === 0);
  check('the moments Bob mentions in chat are unchanged', MOMENTS.length === 16);
  const css = read('public/style.css');
  const missingCss = ANTIC_IDS.filter((a) => !css.includes(`.cat.antic-${a}`));
  check('every antic has its animation', !missingCss.length, missingCss.join(','));
  check('the prop and the cat stay still for reduced motion', /prefers-reduced-motion: reduce\) \{ \.cat\[class\*="antic-"\], \.cat::before, \.cat::after, \.bob-prop/.test(css) && css.includes('body.still *::before'));
  const frames = [];
  for (const m of css.matchAll(/@keyframes (cat|prop|yarn|flutter|knock|box|bird|heart)[\w-]*\s*\{/g)) {
    let i = m.index + m[0].length, depth = 1;
    while (depth && i < css.length) { if (css[i] === '{') depth++; else if (css[i] === '}') depth--; i++; }
    frames.push(css.slice(m.index, i));
  }
  const heavy = frames.filter((f) => /[{;]\s*(left|top|right|bottom|width|height|margin)\s*:/.test(f));
  check('animations are transforms and opacity only', frames.length >= 20 && !heavy.length, heavy.map((f) => f.split('{')[0]).join(','));
  const html = read('public/index.html');
  check('the prop is hidden from screen readers', /id="bobProp"[^>]*aria-hidden="true"/.test(html));
  const help = read('public/help-content.js');
  check('Help explains the habits, with a glossary entry and FAQ', help.includes("id: 'habits'") && help.includes('<dt>Little habits</dt>') && help.includes("id: 'faq-asleep'") && help.includes("id: 'faq-stop-moving'"));
}

// Word bubbles (issue #36, Squeak Nov 9): Bob's and the cat's lines float beside his picture and never push the menu down.
{
  const rd = (f) => fs.readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
  const html = rd('public/index.html'), css = rd('public/style.css'), antics = rd('public/cat-antics.js'), bub = rd('public/say-bubbles.js'), app = rd('public/app.js');
  check('bubbles: a fixed layer outside the menu, out of screen readers', /<div id="bubbles" class="bubbles" aria-hidden="true">/.test(html) && html.indexOf('id="bubbles"') < html.indexOf('id="side"') && /\.bubbles \{ position: fixed;[^}]*pointer-events: none;/.test(css));
  check('bubbles: no cat line left inside the menu', !html.includes('catLine') && !antics.includes('catLine') && !css.includes('.cat-line'));
  check('bubbles: a long line is clamped, not grown', /\.say-bubble > span \{[^}]*-webkit-line-clamp: 5;[^}]*max-height: 7em;/.test(css));
  check('bubbles: Bob\'s status is one line of fixed height in the menu', /\.side \.status \{ white-space: nowrap; overflow: hidden; text-overflow: ellipsis;[^}]*height: 1\.35em;/.test(css));
  check('bubbles: the cat speaks through the bubble, Bob when his line is cut', /bubbles\.say\('cat'/.test(antics) && /bubbles\.say\('bob'/.test(app) && /export function createBubbles/.test(bub));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
