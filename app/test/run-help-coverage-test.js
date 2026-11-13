// 1.5.27: every setting has a Help section (2026-11-02), Help has a glossary and an FAQ, web search is a
// switch that starts off, and Bob can read his own Help and settings (bob_help).
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import { HELP } from '../public/help-content.js';
import { HANDS, LIMITS } from '../src/hands-settings.js';
import { WEB_TOOLS, WEB_OFF, webOn, webPrompt } from '../src/web.js';
import { bobHelp, findHelp, plainText, settingsNow } from '../src/self-help.js';
import { CORE } from '../src/toolbox.js';
import { mergeSettings } from '../src/config.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const read = (f) => fs.readFileSync(new URL('../' + f, import.meta.url), 'utf8');
const norm = (s) => plainText(s).replace(/\\'/g, "'").replace(/\s+/g, ' ').toLowerCase();
const helpText = norm(HELP.map((e) => `${e.title} ${e.html}`).join(' '));
const missing = (labels) => [...new Set(labels)].filter((l) => !helpText.includes(norm(l)));

// ---- every setting label in the window is explained in Help ----
{
  const cellar = publicText('cellar.js');
  const switches = [...cellar.matchAll(/sswitch\('\w+', [^,]+, '((?:[^'\\]|\\.)+)'/g)].map((m) => m[1].replace(/\\'/g, "'"));
  check('the settings page has switches to check', switches.length >= 10, String(switches.length));
  const gone = missing(switches);
  check('every switch on the Settings page has Help', !gone.length, gone.join(' | '));
  // Every bold label in the settings and model pages, minus a few that are headings, not settings.
  const SKIP = new Set(['Picked for this replicant matrix', 'Setup', 'Also use it for', 'What should I call you?']);
  const strong = [...cellar.matchAll(/<strong>([^<$]{3,60})<\/strong>/g)].map((m) => m[1].replace(/\\'/g, "'").replace(/\s*\([^)]*\)$/, '').replace(/:$/, '')).filter((l) => !SKIP.has(l));
  const gone2 = missing(strong);
  check('every other labelled setting in Settings has Help', strong.length >= 15 && !gone2.length, gone2.join(' | '));
  const hands = [...Object.values(HANDS).map((h) => h.label), ...Object.values(LIMITS).map((l) => l.label), 'Let Bob use Hands', 'Let Bob work without asking', 'Folders the Files Hand may work in', 'Stop a command after', 'Wake Bob for schedules when he\'s closed', 'Let the reviewer quarantine Bob'];
  const gone3 = missing(hands);
  check('every Hand, hard limit and Hands setting has Help', !gone3.length, gone3.join(' | '));
  const hands2 = read('public/hands.js');
  check('the Hands page still shows these labels', ['Let Bob use Hands', 'Let Bob work without asking', 'Folders the Files Hand may work in', 'Stop a command after'].every((l) => hands2.includes(l)));
  const elsewhere = ['Free memory when Bob is idle', 'Show unsuited models', 'At once', 'Carry on unfinished downloads when Bob starts', 'Listen', 'Read aloud', 'Alerts', 'Animations', 'Session', 'Effort'];
  const gone4 = missing(elsewhere);
  check('chat page, menu, Downloads and Get models settings have Help', !gone4.length, gone4.join(' | '));
  const menu = [...read('public/index.html').matchAll(/<span class="lbl">([^<]+)<\/span>/g)].map((m) => m[1]).filter((l) => !/Session:/.test(l));
  const gone5 = missing(menu);
  check('every menu and chat-bar item has Help', menu.length >= 15 && !gone5.length, gone5.join(' | '));
}

// ---- glossary and FAQ ----
{
  const glossary = HELP.find((e) => e.id === 'glossary');
  check('the glossary has at least 25 words', (glossary.html.match(/<dt>/g) || []).length >= 25);
  const faq = HELP.filter((e) => e.group === 'FAQ');
  check('there is an FAQ with at least 10 questions, each a question', faq.length >= 10 && faq.every((e) => /\?$/.test(e.title) || /^Bob says/.test(e.title)));
  check('the FAQ covers the memory numbers, web search and setting Bob up', ['faq-two-numbers', 'faq-cant-look-up', 'faq-help-me-set-up'].every((id) => faq.some((e) => e.id === id)));
}

// ---- web search: a switch that starts off ----
{
  check('web search starts off', !webOn({}) && !webOn({ webSearch: 'yes' }) && webOn({ webSearch: true }));
  check('only true turns it on when saved', mergeSettings({}, { webSearch: 'true' }).webSearch === false && mergeSettings({}, { webSearch: true }).webSearch === true);
  check('the web tools are the search and the page reader', WEB_TOOLS.includes('web_search') && WEB_TOOLS.includes('fetch_page'));
  check('when it is off Bob says where the switch is', /Web search/.test(WEB_OFF) && /Settings/.test(WEB_OFF));
  check('his prompt says so while it is off, and nothing while on', /Web search is OFF/.test(webPrompt({ userName: 'Sam' })) && /Sam can click "🌐 Web search" next to Effort/.test(webPrompt({ userName: 'Sam' })) && webPrompt({ webSearch: true }) === '');
  const brain = brainText();
  check('the web tools are taken out of his tools while off', /\.\.\.\(webOn\(this\.cfg\) \? \[\] : WEB_TOOLS\)/.test(brain));
  check('a web tool called by name gets the switch card, or the switch message (1.5.91)', /WEB_TOOLS\.includes\(name\) && !webOn\(this\.cfg\)\) return \{ text: ctx\?\.emit \? await this\.offerSetup\('web', ctx\) : WEB_OFF \}/.test(brain));
  check('the scouting copy says where the switch is instead of researching', /hat === 'scout' && !webOn\(this\.cfg\)\) return WEB_OFF/.test(brain));
  check('his prompt carries the web line', /prompt \+= webPrompt\(this\.cfg(, \{ hat \})?\)/.test(brain));
  const cellar = publicText('cellar.js');
  check('the switch is on the everyday Settings page, off unless turned on', /sswitch\('webSearch', settings\.webSearch === true, 'Web search', keep\('/.test(cellar));
  const server = read('src/server.js');
  check('the server saves and shows it', /typeof b\.webSearch === 'boolean'/.test(server) && /webSearch: cfg\.webSearch === true/.test(server));
  const privacy = read('docs/legal/PRIVACY.md');
  check('the privacy policy says web search is off unless turned on', /Web search/.test(privacy) && /off unless you turn it on/i.test(privacy));
}

// ---- Bob knows his own settings ----
{
  const ix = read('public/index.html'), ws = read('public/web-switch.js'), appjs = publicText('app.js');
  check('the chat page has the Web search switch in the Effort row, off to start', /<div id="effort"[\s\S]*id="webBtn"[^>]*role="switch" aria-checked="false"[\s\S]*<\/div>\s*<form id="composer"/.test(ix));
  check('the chat switch saves the same webSearch setting', /webSearch: !on/.test(ws) && /createWebSwitch/.test(appjs));
  check('Settings and the chat switch tell each other', /bob-web/.test(publicText('cellar.js')) && /addEventListener\('bob-web'/.test(ws));
  check('Bob\'s off-message names the chat switch', /WEB_PILL/.test(read('src/web.js')) && /next to Effort/.test(read('src/web.js')));
  check('bob_help is one of his everyday tools', CORE.includes('bob_help'));
  check('bob_help finds the web switch', findHelp('web search switch')[0]?.id === 'research' || findHelp('web search switch').some((e) => e.id === 'research'));
  check('bob_help finds Gaming', findHelp('gaming session').some((e) => e.id === 'sessions'));
  const out = bobHelp({ webSearch: false, cloud: [], hands: { enabled: true, files: { on: true } } }, 'web search');
  check('bob_help says what is set right now', /Web search: off/.test(out) && /Files on/.test(out) && /Session: Normal/.test(out));
  check('bob_help gives plain text, not HTML', !/<[a-z]+[ >]/i.test(out));
  check('settings list covers the opt-in switches', ['Launch Bob on start-up', 'Check for updates at start', 'Housekeeping', 'Cloud helpers', 'Games first'].every((l) => settingsNow({ cloud: [] }).includes(l)));
  check('an unknown topic lists what Help covers', /Help topics:/.test(bobHelp({ cloud: [] }, 'zzqqx')));
  check('bob_help is read-only and counted as a look, not an action', /'bob_help'\]\);/.test(read('src/verify.js')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
