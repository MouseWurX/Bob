// Saved prompts and the "/" menu (Nov 2026): prompts saved once, pulled into the message box with "/", blanks like
// {file} typed over, {date}/{time}/{day} filled in. Off unless turned on. Desktop (src/prompts.js, public/prompts.js)
// and Bob for Android (its own list, the same words file). Made-up folders and a fake file picker only.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL, fileURLToPath } from 'node:url';
import * as W from '../public/prompt-words.js';
import { promptsRoute, loadPrompts, promptsFile, promptsOn } from '../src/prompts.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { settingsNow } from '../src/self-help.js';
import { WANTS } from '../public/wants.js';
import { HELP } from '../public/help-content.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { publicText } from './source-text.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (f) => fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n');

// ---------- The words part ----------
{
  check('a prompt needs words', W.cleanPrompt({ name: 'x', text: '   ' }) === null && W.cleanPrompt(null) === null);
  const c = W.cleanPrompt({ name: '  Sum\n it   up ', text: 'Line one\r\nLine two\u0000' });
  check('names are one tidy line, words keep their lines', c.name === 'Sum it up' && c.text === 'Line one\nLine two');
  check('no name: the start of the words', W.cleanPrompt({ text: 'Tell me a joke about cats please' }).name === 'Tell me a joke about cats please');
  check('long words are cut to the limit', W.cleanPrompt({ name: 'n', text: 'x'.repeat(W.MAX_TEXT + 50) }).text.length === W.MAX_TEXT);
  check('a bad id is dropped', W.cleanPrompt({ id: '../evil', text: 'hi' }).id === '');

  let r = W.savePrompt([], { name: 'Sum it up', text: 'Sum up {file}.' });
  const a = r.prompt;
  check('save adds with a new id', r.list.length === 1 && /^p[\w]+$/.test(a.id));
  r = W.savePrompt(r.list, { name: 'Explain', text: 'Explain {topic} to {who} on {date}.' });
  const b = r.prompt;
  check('two prompts, two ids', r.list.length === 2 && a.id !== b.id);
  let list = W.savePrompt(r.list, { id: a.id, name: 'Sum', text: 'Sum up {file} briefly.' }).list;
  check('save with an id changes that one', list.length === 2 && list[0].name === 'Sum' && list[0].text === 'Sum up {file} briefly.');
  check('move down and up', W.movePrompt(list, a.id, 1)[1].id === a.id && W.movePrompt(list, a.id, -1)[0].id === a.id && W.movePrompt(list, 'nope', 1).length === 2);
  check('delete takes one away', W.deletePrompt(list, a.id).length === 1 && W.deletePrompt(list, a.id)[0].id === b.id);
  const full = Array.from({ length: W.MAX_PROMPTS }, (_, i) => ({ id: 'p' + i, name: 'n' + i, text: 't' }));
  check(`no more than ${W.MAX_PROMPTS}`, /already/.test(W.savePrompt(full, { text: 'one more' }).error || ''));
  const cl = W.cleanList([{ id: 'same', text: 'a' }, { id: 'same', text: 'b' }, { text: '' }, 'junk']);
  check('a list read back: junk dropped, ids unique', cl.length === 2 && cl[0].id !== cl[1].id);

  // "/" at the start of a line only
  check('"/" alone opens the menu', JSON.stringify(W.slashQuery('/')) === JSON.stringify({ query: '', start: 0, end: 1 }));
  check('"/su" narrows it', W.slashQuery('/su').query === 'su');
  check('on a later line too', W.slashQuery('Hi\n/pl', 6)?.start === 3);
  check('not in the middle of a sentence', W.slashQuery('and/or') === null && W.slashQuery('use a /') === null);
  check('not "//" or "/ "', W.slashQuery('//') === null && W.slashQuery('/ x') === null);
  check('only up to the caret', W.slashQuery('/sum it', 2)?.query === 's');

  const ps = [{ id: '1', name: 'Check my writing', text: 'Fix {text}' }, { id: '2', name: 'Sum it up', text: 'Sum up {file}' }, { id: '3', name: 'Plan my day', text: 'Plan around {tasks}' }];
  check('no query: all, in their order', W.matchPrompts(ps, '').map((p) => p.id).join() === '1,2,3');
  check('name start first, then a word in the name, then the words', W.matchPrompts(ps, 'my').map((p) => p.id).join() === '1,3' && W.matchPrompts(ps, 's')[0].id === '2' && W.matchPrompts(ps, 'tasks')[0].id === '3');
  check('no match: empty', W.matchPrompts(ps, 'usr/bin').length === 0);

  check('blanks, in order, once each, without the ones that fill themselves in', W.blanksOf('{a} {b} {a} {date} {Time} {day}').join() === 'a,b');
  const now = new Date(2026, 10, 11, 14, 5);
  const filled = W.fillAuto('{day} {date} at {time}, {who}', now, 'en-CA');
  check('{date}, {time} and {day} fill in from the clock', /^Wednesday November 11, 2026 at 2:05\sp\.?m\.?, \{who\}$/i.test(filled), filled);
  check('next blank wraps round', W.nextBlank('a {x} b {y}', 6)?.name === 'y' && W.nextBlank('a {x} b {y}', 12)?.name === 'x' && W.nextBlank('no blanks {date}') === null);
  check('not a blank: {} or {1x} or JSON', W.blanksOf('{} {1x} {"a":1}').length === 0);

  const v = 'Hello\n/su';
  const ins = W.insertPrompt(v, W.slashQuery(v), { text: 'Sum up {file} by {day}.' }, now, 'en-CA');
  check('picking replaces "/su" with the words', ins.value === 'Hello\nSum up {file} by Wednesday.');
  check('and picks out the first blank to type over', ins.value.slice(...ins.select) === '{file}' && ins.blank === 'file');
  const plain = W.insertPrompt('/x', W.slashQuery('/x'), { text: 'Tell me a joke.' }, now);
  check('no blanks: the caret goes to the end', plain.select[0] === plain.select[1] && plain.select[0] === plain.value.length);
  check('words after the caret stay', W.insertPrompt('/s tail', { query: 's', start: 0, end: 2 }, { text: 'Hi {x}' }, now).value === 'Hi {x} tail');
  check('file blanks are known', W.isFileBlank('file') && W.isFileBlank('Document') && W.isFileBlank('file name') && !W.isFileBlank('who'));
  check('four starters, all with words', W.STARTERS.length === 4 && W.STARTERS.every((s) => W.cleanPrompt(s)));
}

// ---------- The server: a file in the inn, the switch, the picker ----------
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-prompts-'));
try {
  const cfg = { innDir: path.join(tmp, 'inn') };
  const saved = [];
  const saveSettings = (c, patch) => { Object.assign(c, patch); saved.push(patch); };
  const call = async (method, data, { isLocal = true, pick } = {}) => {
    let out;
    const handled = await promptsRoute({ req: { method }, res: {}, p: '/api/prompts', isLocal, cfg, body: async () => data, send: (res, status, j) => { out = { status, ...j }; }, saveSettings, pick });
    return { handled, ...out };
  };
  check('other addresses are left alone', (await promptsRoute({ req: { method: 'GET' }, res: {}, p: '/api/other', cfg })) === false);
  let r = await call('GET');
  check('off and empty to start with', r.status === 200 && r.on === false && r.prompts.length === 0 && !promptsOn(cfg) && r.starters.length === 4);
  check('no file until something is saved', !fs.existsSync(promptsFile(cfg)));
  r = await call('POST', { on: true });
  check('the switch turns on', r.on === true && cfg.promptMenu === true && saved.some((p) => p.promptMenu === true));
  r = await call('POST', { save: { name: 'Sum it up', text: 'Sum up {file}.' } });
  check('a prompt is saved to inn/saved-prompts.json', r.prompts.length === 1 && fs.existsSync(path.join(cfg.innDir, 'saved-prompts.json')) && loadPrompts(cfg)[0].name === 'Sum it up');
  r = await call('POST', { save: { text: '  ' } });
  check('empty words are refused', r.status === 400 && /words/.test(r.error));
  r = await call('POST', { starters: true });
  check('starters added once (Sum it up already there)', r.prompts.length === 4);
  r = await call('POST', { starters: true });
  check('and not twice', r.prompts.length === 4);
  const id = r.prompts[1].id;
  r = await call('POST', { move: id, by: -1 });
  check('move up', r.prompts[0].id === id);
  r = await call('POST', { remove: id });
  check('delete', r.prompts.length === 3 && !r.prompts.some((p) => p.id === id));
  r = await call('POST', { on: false });
  check('off keeps the list', r.on === false && r.prompts.length === 3);
  fs.writeFileSync(promptsFile(cfg), '﻿{"prompts":[{"text":"from a BOM file"}]}\r\n');
  check('a hand-edited file with a BOM still reads', loadPrompts(cfg)[0]?.text === 'from a BOM file');
  fs.writeFileSync(promptsFile(cfg), 'not json');
  check('a broken file reads as empty, never throws', loadPrompts(cfg).length === 0);
  let asked = null;
  const pick = async (o) => { asked = o; return '/tmp/Lease.docx'; };
  r = await call('GET', undefined, { pick });
  check('the picker is offered in Bob\'s own window', r.canPick === true);
  r = await call('POST', { pickFile: true }, { pick });
  check('pick a file types in its path', r.path === '/tmp/Lease.docx' && /file/.test(asked?.title || ''));
  r = await call('POST', { pickFile: true }, { pick, isLocal: false });
  check('never from another replicant matrix', r.path === '' && /own window/.test(r.why) && (await call('GET', undefined, { pick, isLocal: false })).canPick === false);
  r = await call('POST', { pickFile: true });
  check('no picker (a plain browser): type it', r.path === '');
  r = await call('PUT');
  check('only GET and POST', r.status === 405);
} finally { fs.rmSync(tmp, { recursive: true, force: true }); }

// ---------- Settings, the chat, Help ----------
{
  check('a saved setting that starts off', SETTING_KEYS.includes('promptMenu') && mergeSettings({}, {}).promptMenu !== true && mergeSettings({}, { promptMenu: 'yes' }).promptMenu === false);
  check('bob_help lists it', /Pull up saved prompts with \/: off/.test(settingsNow({ cloud: [] })));
  check('on the first-time list', WANTS.some((w) => w.key === 'promptMenu'));
  check('a Settings panel in the Bob group and the How Bob works card', GROUPS.find(([g]) => g === 'Bob')[1].includes('adv-prompts') && CARDS.find((c) => c.id === 'how').topics.includes('adv-prompts'));
  const cellar = publicText('cellar.js'), app = publicText('app.js'), server = read('src/server.js'), css = read('public/style.css');
  check('the switch sits on top of the list, which shows either way', /\['prompts', '📝 Saved prompts', [^\n]*sswitch\('promptMenu', settings\.promptMenu === true, 'Pull up saved prompts with \/'[^\n]*\+ promptsHtml\(\)\]/.test(cellar) && /mountPrompts\(dlg\.querySelector\('\.prompts-box'\)\)/.test(cellar) && !/data-pe-on|disabled/.test(read('public/prompts.js').split('mountPrompts')[1].split('data-pe-up')[0]));
  check('the chat box gets the / menu', /createPromptMenu\(input, \{ openSettings: \(\) => cellar\.open\('settings', null, \{ jump: 'adv-prompts' \}\) \}\)/.test(app));
  check('the server answers /api/prompts and saves the switch', /promptsRoute\(\{ req, res, p, isLocal, cfg, body, send, saveSettings/.test(server) && /typeof b\.promptMenu === 'boolean'/.test(server) && /promptMenu: cfg\.promptMenu === true/.test(server));
  const pm = read('public/prompts.js');
  check('the menu runs before Enter-to-send, and Enter sends as usual when nothing fits', /input\.addEventListener\('keydown', [\s\S]*?\}, true\);/.test(pm) && /if \(!shown\.length\) return;/.test(pm));
  check('keyboard and screen readers: listbox, options, active option', /role', 'listbox'/.test(pm) && /role="option"/.test(pm) && /aria-activedescendant/.test(pm) && /aria-expanded/.test(pm));
  check('the menu never sends by itself', !/requestSubmit|\/api\/chat/.test(pm));
  check('styled, with a high-contrast outline', /\.prompt-menu \{/.test(css) && /forced-colors: active\) \{ \.prompt-menu/.test(css));
  const ids = HELP.map((h) => h.id), text = (id) => HELP.find((h) => h.id === id)?.html || '';
  check('Help, FAQ and Settings help', ['saved-prompts', 'faq-saved-prompts', 'settings-prompts'].every((i) => ids.includes(i)));
  check('Help says what it does, the blanks and where it works', /Pull up saved prompts with \//.test(text('saved-prompts')) && /\{file\}/.test(text('saved-prompts')) && /Windows, Mac and Linux/.test(text('saved-prompts')) && /Android/.test(text('saved-prompts')));
  check('glossary: Saved prompt and Blank', /<dt>Saved prompt<\/dt>/.test(text('glossary')) && /<dt>Blank \(saved prompt\)<\/dt>/.test(text('glossary')));
}

// ---------- Bob for Android ----------
{
  const www = path.join(root, 'android/app/src/main/assets/www');
  const { buildPromptWords, OUT_PROMPTS } = await import(pathToFileURL(path.join(root, 'android/tools/make-shared.mjs')));
  check('prompt-words.js on the phone is up to date (node android/tools/make-shared.mjs)', fs.readFileSync(OUT_PROMPTS, 'utf8').replace(/\r\n/g, '\n') === buildPromptWords().replace(/\r\n/g, '\n'));
  await import(pathToFileURL(OUT_PROMPTS));
  const P = globalThis.BobPrompts, now = new Date(2026, 10, 11, 9, 0);
  check('the phone fills prompts the same as the desktop', JSON.stringify(P.insertPrompt('/p', P.slashQuery('/p'), W.STARTERS[3], now)) === JSON.stringify(W.insertPrompt('/p', W.slashQuery('/p'), W.STARTERS[3], now)));
  const html = fs.readFileSync(path.join(www, 'index.html'), 'utf8'), js = fs.readFileSync(path.join(www, 'phone.js'), 'utf8'), help = fs.readFileSync(path.join(www, 'help.js'), 'utf8');
  check('phone: the script, the menu and the switch', /<script src="prompt-words\.js"><\/script>/.test(html) && /id="prompt-menu"/.test(html) && /id="prompt-on"/.test(html) && /promptMenu: false/.test(js));
  check('phone: tap to use, Next blank instead of Tab, kept on the phone', /usePrompt\(q, p\)/.test(js) && /Next blank/.test(js) && /store\.set\('prompts', prompts\)/.test(js));
  check('phone: Help and glossary', /id: 'saved-prompts'/.test(help) && /<dt>Saved prompt<\/dt>/.test(help));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
