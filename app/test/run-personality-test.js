// 1.3.0: Bob knows his look and reacts once when it changes; personality dials (default = Bob as he was);
// the Attributes panel; clicking Bob opens Equip Bob.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DIALS, DEFAULTS, PRESETS, cleanPersonality, isDefault, personalityPrompt, greeting, attributesHtml, bobTake } from '../public/personality.js';
import { lookText, lookPrompt } from '../src/look.js';
import { systemPrompt } from '../src/persona.js';
import { equipHtml } from '../public/equip.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');

// ---- dials ----
{
  check('eleven dials, each with five settings and a name at each end', DIALS.length === 11 && DIALS.every((d) => d.lines.length === 5 && d.left && d.right && d.name));
  check('the middle of every dial is Bob as he is: nothing added', DIALS.every((d) => d.lines[2] === '') && personalityPrompt(DEFAULTS) === '' && personalityPrompt({}) === '');
  check('every other setting says something', DIALS.every((d) => [0, 1, 3, 4].every((i) => d.lines[i].length > 10)));
  const p = personalityPrompt({ ...DEFAULTS, puns: 4, mood: 0 }, 'Sam');
  check('turned dials add their lines', /pun engine/.test(p) && /gloomy machine/.test(p) && p.split('\n- ').length === 3);
  check('honesty and safety are always restated after the dials', /never invent facts/.test(p) && /ask before doing anything/.test(p) && /serious or stressful/.test(p));
  check('the user\'s name goes in', /Sam set for you/.test(p) && !/\{\{USER\}\}/.test(personalityPrompt({ ...DEFAULTS, nerd: 4, curiosity: 4 }, 'Sam')));
  check('only known dials, only 0 to 4', JSON.stringify(cleanPersonality({ puns: 9, wit: -1, mood: 1.5, evil: 4, nerd: 4 })) === JSON.stringify({ ...DEFAULTS, nerd: 4 }));
  check('isDefault', isDefault(DEFAULTS) && isDefault({}) && !isDefault({ puns: 0 }));
  check('presets use real dials, and the first is plain Bob', PRESETS[0].id === 'bob' && isDefault(PRESETS[0].set) && PRESETS.every((x) => Object.keys(x.set).every((k) => DEFAULTS[k] !== undefined) && Object.values(x.set).every((v) => v >= 0 && v <= 4)));
  const all = JSON.stringify({ DIALS, PRESETS }) + read('public/personality.js');
  check('the wording is our own: no book titles or famous lines', !/mostly harmless|don't panic|\b42\b|towel|marvin|babel fish|bobiverse|heaven's river|we are legion|so long, and thanks/i.test(all));
}

// ---- the greeting preview ----
{
  const plain = greeting(DEFAULTS, 'Sam');
  check('default greeting is friendly and names you', /Sam/.test(plain) && /Bob/.test(plain));
  check('formal sounds formal', /Good day/.test(greeting({ ...DEFAULTS, formality: 0 }, 'Sam')));
  check('gloomy sounds gloomy, sunny sounds sunny', /small box/.test(greeting({ ...DEFAULTS, mood: 0 })) && /great day/.test(greeting({ ...DEFAULTS, mood: 4 })));
  check('terse is short', greeting({ ...DEFAULTS, length: 0, tinker: 4, musing: 4, tangents: 4 }).length < 60);
  check('every preset gives a different hello', new Set(PRESETS.map((x) => greeting(x.set, 'Sam'))).size === PRESETS.length);
}

// ---- his look ----
{
  check('his own looks are described by name', /"Sysop"/.test(lookText('sysop')) && /Hoodie/.test(lookText('sysop')));
  check('Bob has a take on a design of his own', /Your own design/.test(bobTake('c:m.regular.0.short.1.1.none.0.tee.0.none.none.none')));
  check('avatars say what kind they are', /drawn as a robot/.test(lookText('robot-3')) && /drawn as a computer/.test(lookText('pc-1')));
  check('an unknown look falls back to the default', lookText('nope') === lookText('sysop'));
  const now = lookPrompt({ look: 'bot' });
  check('he knows how he looks, and can describe it', /"Bot"/.test(now) && /describe it/.test(now) && !/just changed/.test(now));
  const ch = lookPrompt({ look: 'bot', lookChange: { from: 'sysop', to: 'bot' }, lookComments: true });
  check('after a change (with the switch on): one in-character line about the new look, just once', /just changed your look from "Sysop"/.test(ch) && /to "Bot"/.test(ch) && /Only this once/.test(ch));
  check('the comment is off unless switched on (1.5.116)', !/just changed/.test(lookPrompt({ look: 'bot', lookChange: { from: 'sysop', to: 'bot' } })) && !/just changed/.test(lookPrompt({ look: 'bot', lookChange: { from: 'sysop', to: 'bot' }, lookComments: false })));
  const front = systemPrompt({ now: 'now', user: 'Sam', look: now, dials: personalityPrompt({ puns: 4 }, 'Sam') });
  const hat = systemPrompt({ hat: 'tinker', now: 'now', user: 'Sam', look: now, dials: personalityPrompt({ puns: 4 }, 'Sam') });
  check('the front desk knows the look and the dials', /"Bot"/.test(front) && /pun engine/.test(front) && /Sam picked/.test(front));
  check('copies at work get the dials but not the look note', !/"Bot"/.test(hat) && /pun engine/.test(hat));
  check('default Bob\'s prompt is unchanged apart from the look', systemPrompt({ now: 'n', user: 'Sam' }) === systemPrompt({ now: 'n', user: 'Sam', dials: personalityPrompt(DEFAULTS, 'Sam') }));
  check('his quick take on every kind of look', ['sysop', 'bot', 'holo', 'cyber', 'innkeeper', 'm-1', 'f-2', 'alien-3', 'robot-4', 'pc-5', 'odd-6'].every((id) => bobTake(id).length > 10) && bobTake('zzz') === bobTake('sysop'));
  const brain = read('src/brain.js');
  check('the change note is cleared after his first reply', /if \(this\.cfg\.lookChange\) \{ try \{ saveSettings\(this\.cfg, \{ lookChange: null \}\)/.test(brain) && /look: lookPrompt\(this\.cfg\)/.test(brain));
}

// ---- the Attributes panel and the page ----
{
  const html = attributesHtml({ personality: { puns: 4 }, look: 'robot-2', lookText: '"Servo", drawn as a robot', user: 'Sam' });
  check('the panel has the avatar card first, then sliders, then the greeting', html.indexOf('avatar-card') < html.indexOf('data-dial') && html.lastIndexOf('data-dial') < html.indexOf('class="greet"'));
  check('a slider per dial, with labels for screen readers', (html.match(/type="range"/g) || []).length === 11 && /aria-label="Puns: None to Relentless"/.test(html));
  check('presets, Reset to Bob, and Ask Bob', /data-preset/.test(html) && /data-resetbob/.test(html) && !/data-resetbob disabled/.test(html) && /data-askbob=/.test(html));
  check('Reset is greyed out when he is already plain Bob', /data-resetbob disabled/.test(attributesHtml({ personality: {}, look: 'sysop', lookText: 'x' })));
  check('a mix that matches no preset says "Your own mix"', /Your own mix/.test(html) && !/Your own mix/.test(attributesHtml({ personality: PRESETS[2].set, look: 'sysop', lookText: 'x' })));
  check('names are escaped', !/<script/.test(attributesHtml({ personality: {}, look: 'sysop', lookText: '<script>x</script>', user: '<script>' })));
  const page = equipHtml({ roles: { current: {}, options: {} }, models: [], brains: {}, embed: '', selected: 'bob', vramGB: 16, attributes: html });
  check('Equip Bob: attributes left, Bob and slots in the middle, inventory right', page.indexOf('class="attributes"') < page.indexOf('class="equip-mid"') && page.indexOf('class="equip-mid"') < page.indexOf('class="kit-panel"'));
  const app = read('public/app.js');
  check('clicking Bob (or Enter on him) opens his small menu', /createBobMenu\(\{\s*anchor: bobCanvas/.test(app) && /e\.key === 'Enter'/.test(read('public/bob-menu.js')) && /bobCanvas\.tabIndex = 0/.test(app) && /e\.key === 'Enter'/.test(app));
  check('Ask Bob sends the question in the chat', /addEventListener\('bob-ask'/.test(app) && /requestSubmit/.test(app));
  const css = read('public/style.css');
  check('three columns when wide, stacked when narrow', /\.equip-page \{ display: grid; grid-template-columns: 250px minmax\(0, 1fr\) 280px/.test(css) && /@media \(max-width: 1100px\)[^@]*\.equip-page \{ grid-template-columns: 1fr/.test(css));
}

// ---- 1.3.1: what Bob calls you ----
{
  const html = attributesHtml({ personality: {}, look: 'sysop', lookText: 'x', user: 'Sam', callMe: '', windowsName: 'Pcuser' });
  check('Attributes asks what Bob should call you, with the Windows name as the fallback', /What should Bob call you\?/.test(html) && /data-callme/.test(html) && /placeholder="Pcuser"/.test(html));
  const cfgSrc = read('src/config.js'), srv = read('src/server.js'), cel = read('public/cellar.js');
  check('the name is kept in inn settings and wins over the Windows name', /if \(cfg\.callMe\) cfg\.userName = cfg\.callMe;/.test(cfgSrc) && /'callMe'/.test(cfgSrc));
  check('the name is cleaned and kept short; empty means the Windows name', /slice\(0, 40\)/.test(srv) && /cfg\.userName = name \|\| cfg\.windowsName/.test(srv));
  check('first-run setup asks too', /What should I call you\?/.test(cel));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
