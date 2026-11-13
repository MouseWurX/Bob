// Bob's screens in other languages (Settings, Bob himself, Language): English by default, the setting is saved
// and cleaned, every language has the same words, every word is really on a screen, and the page swapper leaves
// your words (the chat, text boxes, code) alone. Uses a small fake page; nothing real is read.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { LANGS, pickLang, translateText, translateTree, SKIP } from '../public/i18n.js';
import { WORDS as FR } from '../public/lang/fr.js';
import { WORDS as ES } from '../public/lang/es.js';
import { LANGUAGES, mergeSettings } from '../src/config.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const dir = (p) => fileURLToPath(new URL(p, import.meta.url));
const read = (p) => fs.readFileSync(dir(p), 'utf8').replace(/\r\n/g, '\n');

// ---- the setting ----
check('English is the default and the first language', LANGS[0].code === 'en' && pickLang('') === 'en' && pickLang(undefined) === 'en' && pickLang('klingon') === 'en');
check('a known language is kept, whatever its case', pickLang('FR') === 'fr' && pickLang('es') === 'es');
check('the server and the screens list the same languages', JSON.stringify(LANGS.map((l) => l.code)) === JSON.stringify(LANGUAGES));
check('each language is named in its own words', LANGS.find((l) => l.code === 'fr').name === 'Français' && LANGS.find((l) => l.code === 'es').name === 'Español');
check('a saved language is cleaned', mergeSettings({}, { language: 'fr' }).language === 'fr' && mergeSettings({}, { language: '<script>' }).language === 'en' && mergeSettings({}, { language: 42 }).language === 'en');
check('nothing saved means no language key (English)', !('language' in mergeSettings({}, { catName: 'Patches' })));
const server = read('../src/server.js');
check('the settings page can save it', /typeof b\.language === 'string'\) \{ saveSettings\(cfg, \{ language: b\.language \}\)/.test(server));
check('the settings answer says the language, English if none', /language: LANGUAGES\.includes\(cfg\.language\) \? cfg\.language : 'en'/.test(server));

// ---- the words ----
const langFiles = { fr: FR, es: ES };
for (const code of LANGS.map((l) => l.code).filter((c) => c !== 'en')) check(`there is a word file for ${code}`, langFiles[code] && Object.keys(langFiles[code]).length >= 100, String(Object.keys(langFiles[code] || {}).length));
const frKeys = Object.keys(FR).sort(), esKeys = Object.keys(ES).sort();
check('French and Spanish cover the same English words', JSON.stringify(frKeys) === JSON.stringify(esKeys));
const blank = [...Object.entries(FR), ...Object.entries(ES)].filter(([k, v]) => typeof v !== 'string' || !v.trim() || k !== k.trim());
check('no word is blank or padded', !blank.length, blank.map(([k]) => k).join(' | '));
// Every English entry is really on one of Bob's screens, so the files don't fill with words nobody sees.
const pub = dir('../public/');
const source = fs.readdirSync(pub).filter((f) => /\.(html|js)$/.test(f) && f !== 'i18n.js').map((f) => fs.readFileSync(pub + f, 'utf8')).join('\n').replace(/\\'/g, "'").replace(/&quot;/g, '"');
const nowhere = frKeys.filter((k) => !source.includes(k));
check('every English word in the files is on a screen', !nowhere.length, nowhere.join(' | '));
// An emoji or arrow at the start of the English stays at the start of the translation.
const lead = (s) => (s.match(/^[^\p{L}\p{N}]+/u) || [''])[0].trim();
const moved = [...Object.entries(FR), ...Object.entries(ES)].filter(([k, v]) => lead(k) !== lead(v));
check('emoji and arrows stay where they were', !moved.length, moved.map(([k]) => k).join(' | '));

// ---- swapping text ----
check('an exact match swaps, keeping the spaces around it', translateText('  Send ', FR) === '  Envoyer ' && translateText('Send', ES) === 'Enviar');
check('anything else is left alone', translateText('Send it now', FR) === undefined && translateText('', FR) === undefined && translateText('Send', null) === undefined);
check('an object\'s own built-in names are not words', translateText('constructor', FR) === undefined && translateText('toString', FR) === undefined);

// A small fake page: elements with attributes and children, text nodes, and closest() for the skip list.
const matches = (el, sel) => sel.split(',').map((s) => s.trim()).some((s) => s.startsWith('#') ? el.id === s.slice(1) : s.startsWith('.') ? (el.cls || []).includes(s.slice(1)) : s.startsWith('[') ? Object.prototype.hasOwnProperty.call(el.attrs, s.slice(1, -1)) : el.tagName === s.toUpperCase());
const el = (tag, attrs = {}, kids = [], extra = {}) => {
  const e = { nodeType: 1, tagName: tag.toUpperCase(), attrs: { ...attrs }, childNodes: [], parentNode: null, ...extra,
    getAttribute(a) { return a in this.attrs ? this.attrs[a] : null; },
    setAttribute(a, v) { this.attrs[a] = v; },
    closest(sel) { for (let n = this; n && n.nodeType === 1; n = n.parentNode) if (matches(n, sel)) return n; return null; } };
  for (const k of kids) { k.parentNode = e; if (k.nodeType === 3) k.parentElement = e; e.childNodes.push(k); }
  return e;
};
const txt = (v) => ({ nodeType: 3, nodeValue: v });
const send = txt('Send'), chatWords = txt('Send'), typed = txt('Send'), code = txt('Send'), keep = txt('Send');
const button = el('button', { title: 'Close (Esc)', 'aria-label': 'Close' }, [send]);
const box = el('textarea', { placeholder: 'Tell Bob what you need...' }, [typed]);
const page = el('body', {}, [button, box, el('main', {}, [el('p', {}, [chatWords])], { id: 'log' }), el('pre', {}, [code]), el('span', { 'data-no-translate': '' }, [keep])]);
const n = translateTree(page, FR);
check('buttons and their tips are swapped', send.nodeValue === 'Envoyer' && button.attrs.title === 'Fermer (Échap)' && button.attrs['aria-label'] === 'Fermer', String(n));
check('the chat, text boxes, code and marked parts keep their words', chatWords.nodeValue === 'Send' && typed.nodeValue === 'Send' && code.nodeValue === 'Send' && keep.nodeValue === 'Send' && box.attrs.placeholder === 'Tell Bob what you need...');
check('a second pass changes nothing (no loop with the watcher)', translateTree(page, FR) === 0);
check('English swaps nothing', translateTree(el('div', {}, [txt('Send')]), null) === 0);
check('the skip list covers the chat, text boxes and code', ['#log', 'textarea', 'input', 'code', 'pre', '[data-no-translate]', '[contenteditable]'].every((s) => SKIP.includes(s)));

// ---- wired in ----
const cellar = publicText('cellar.js');
check('Settings, Bob himself has the Language menu', /srow\('Language', `<select data-set="language"/.test(cellar) && /el\.dataset\.set === 'language'/.test(cellar));
check('the main window, the Settings window and the thinking window use it', ['app.js', 'settings-window.js', 'mind.js'].every((f) => /startI18n\(\)/.test(read('../public/' + f))));
check('the main window follows the saved language (phone, other windows)', /followSaved\(st\.language\)/.test(publicText('app.js')));
const help = read('../public/help-content.js');
check('Help, the glossary and the FAQ explain it', /id: 'language'/.test(help) && /id: 'faq-language'/.test(help) && /<dt>Language<\/dt>/.test(help));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
