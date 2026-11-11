// "Do you want me to:" on the Welcome (public/wants.js): every line is an existing Settings switch that starts off,
// saved the same way, explained in Help; the chat offers the list once to Bobs set up before it, and never again.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WANTS, WANTS_ELSEWHERE, wantOn, wantPatch, wantSaved, wantsHtml } from '../public/wants.js';
import { HELP } from '../public/help-content.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { esc } from '../public/util.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');
const cellar = read('public/cellar.js'), server = read('src/server.js'), app = read('public/app.js');
const plain = (s) => String(s).replace(/<[^>]+>/g, ' ').replace(/\\'/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').toLowerCase();
const helpText = plain(HELP.map((e) => `${e.title} ${e.html}`).join(' '));

// ---------- Every line is a real Settings switch that starts off ----------
check('the list has the everyday switches', WANTS.length >= 10 && ['quickNotes', 'docTools', 'sandboxCode', 'editOwn', 'webSearch'].every((k) => WANTS.some((w) => w.key === k)));
check('no key twice', new Set(WANTS.map((w) => w.key)).size === WANTS.length);
for (const w of WANTS) {
  const inSettings = new RegExp(`sswitch\\('${w.key}', [^,]+, '${w.setting.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/'/g, "\\\\'")}'`).test(cellar);
  check(`"${w.label}" is the Settings switch "${w.setting}"`, inSettings);
  const saved = w.key === 'autoCheck' ? SETTING_KEYS.includes('updates') : SETTING_KEYS.includes(w.key);
  check(`${w.key} is a saved setting`, saved);
  const fresh = mergeSettings({}, {});
  check(`${w.key} starts off`, !wantOn(fresh, w.key) && !wantOn({}, w.key));
  const handled = w.key === 'autostart' ? server.includes("'autostart' in b") : w.key === 'autoCheck' ? server.includes('b.updates.autoCheck') : server.includes(`typeof b.${w.key} === 'boolean'`);
  check(`the server saves ${w.key}`, handled);
  check(`${w.key} is in Help, in both names`, helpText.includes(plain(w.label)) && helpText.includes(plain(w.setting)), w.label);
}
for (const x of WANTS_ELSEWHERE) check(`"${x.label}" opens a real Settings section`, cellar.includes(`['${x.id.replace(/^adv-/, '')}', '`));

// ---------- Saving ----------
check('a tick posts the switch itself', JSON.stringify(wantPatch('editOwn', true)) === '{"editOwn":true}' && JSON.stringify(wantPatch('editOwn', 'yes')) === '{"editOwn":false}');
check('updates go under updates', JSON.stringify(wantPatch('autoCheck', true)) === '{"updates":{"autoCheck":true}}');
{
  const s = { quickNotes: false };
  const r = wantSaved(s, 'quickNotes', { quickNotes: true });
  check('the answer is kept and said', s.quickNotes === true && r.on && r.say === 'On.');
  const s2 = { updates: { autoCheck: false } };
  check('updates answer kept', wantSaved(s2, 'autoCheck', { updates: { autoCheck: true } }).on && s2.updates.autoCheck === true);
  const s3 = {};
  const r3 = wantSaved(s3, 'sandboxCode', { sandboxCode: false, sandboxWhy: 'The sandbox doesn\'t hold here.' });
  check('a sandbox that does not hold stays off and says why', !r3.on && r3.say.includes("doesn't hold"));
}

// ---------- The list on the page ----------
{
  const off = wantsHtml({ platform: 'win32' }, esc);
  check('nothing ticked on a new Bob', !/data-want="[^"]+" checked/.test(off) && (off.match(/data-want=/g) || []).length === WANTS.length);
  check('asks in Bob\'s words', off.includes('Do you want me to:') && off.includes('off until you tick them'));
  check('the bigger ones are buttons to Settings', WANTS_ELSEWHERE.every((x) => off.includes(`data-wantjump="${x.id}"`)));
  const on = wantsHtml({ platform: 'win32', editOwn: true, updates: { autoCheck: true } }, esc);
  check('what is on shows ticked', /data-want="editOwn" checked/.test(on) && /data-want="autoCheck" checked/.test(on));
  const linux = wantsHtml({ platform: 'linux' }, esc);
  check('start at sign-in is greyed out where Settings greys it out', /data-want="autostart"\s+disabled/.test(linux) && !/data-want="autostart"\s+disabled/.test(wantsHtml({ platform: 'darwin' }, esc)));
}

// ---------- On the Welcome, rerun from Settings, offered once to older Bobs ----------
check('the Welcome shows the list', cellar.includes('${wantsHtml(settings || {}, esc)}'));
check('the Welcome closes after the list', cellar.indexOf('${wantsHtml(settings || {}, esc)}') < cellar.indexOf('<div class="row welcome-end"><button data-skip>'));
check('Run first-time setup is still in Settings', cellar.includes('data-welcome>Run first-time setup'));
check('wantsAsked only true when saved true', mergeSettings({}, { wantsAsked: 'yes' }).wantsAsked === false && mergeSettings({}, { wantsAsked: true }).wantsAsked === true && SETTING_KEYS.includes('wantsAsked'));
check('the server reads and saves wantsAsked', server.includes('wantsAsked: cfg.wantsAsked === true') && server.includes("'wantsAsked' in b"));
check('the chat offers it once, only to a Bob already set up', app.includes('if (st.setupDone && !st.wantsAsked) offerWants();') && /function offerWants[\s\S]{0,900}wantsAsked: true/.test(app));
check('finishing the Welcome counts as asked', cellar.includes("{ setupDone: true, wantsAsked: true }"));

// ---------- Help, glossary, FAQ ----------
const entry = (id) => HELP.find((e) => e.id === id);
check('Help entry', Boolean(entry('wants')) && /Android/.test(entry('wants').html) && /Run first-time setup/.test(entry('wants').html));
check('FAQ', entry('faq-wants')?.group === 'FAQ');
check('glossary', entry('glossary')?.html.includes('<dt>First-time setup (Welcome)</dt>'));
check('Getting started points at it', entry('start')?.html.includes("go('wants'") || entry('start')?.html.includes('data-helpgo="wants"'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
