// 🗓 Everyday helpers (items 143 to 150): text size, easier-to-read font, profiles, today card, focus timer,
// receipts, the tour after an update and the tray dot. Everything starts off; private things stay locked on disk;
// nothing here reads the real computer or goes online (the weather gets a fake fetch, the box a test keeper).
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cleanTextSize, cleanPlace, everydayView, everydaySettings, EVERYDAY_SWITCHES, Focus, focusSummary, FOCUS_HOLDS, todayCard, weatherFor, tourFor, WHATS_NEW, newer } from '../src/everyday.js';
import { cleanRow, addRow, removeRow, loadSheet, totals, toCsv, sheetFile, receiptTool, receiptsOn } from '../src/receipts.js';
import { Profiles, profilesOn, profileDir, MAIN } from '../src/profiles.js';
import { wrapKey, lockPage } from '../src/lock.js';
import { setKey, vaultOn, writeText, readText, isSealed } from '../src/vault.js';
import { sessionDir } from '../src/chats.js';
import { mergeSettings, SETTING_KEYS } from '../src/config.js';
import { windowState, dotPixels } from '../src/app-icon.js';
import { HELP } from '../public/help-content.js';
import { readingCss, todayHtml, tourCards, tourHtml, sheetHtml, peopleHtml, TOUR } from '../public/everyday.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { WANTS } from '../public/wants.js';
import { NOT_BACKED_UP } from '../src/backup.js';
import crypto from 'node:crypto';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const read = (p) => fs.readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-everyday-'));
const fresh = () => { const d = fs.mkdtempSync(path.join(tmp, 'inn-')); const dataDir = path.join(d, 'bob'); fs.mkdirSync(dataDir, { recursive: true }); return { innDir: d, dataDir, configFile: path.join(d, 'config.json'), memoryFile: path.join(d, 'bob-memory.md'), settingsFile: path.join(dataDir, 'settings.json') }; };

// ---- every switch starts off, and only true turns one on ----
{
  const v = everydayView({});
  check('nothing is on in a new Bob', EVERYDAY_SWITCHES.every((k) => v[k] === false) && v.textSize === 100 && v.todayPlace === '');
  check('every switch is a saved setting', [...EVERYDAY_SWITCHES, 'textSize', 'todayPlace', 'tourSeen'].every((k) => SETTING_KEYS.includes(k)));
  check('apuHoldbackGB is still last in SETTING_KEYS', SETTING_KEYS[SETTING_KEYS.length - 1] === 'apuHoldbackGB');
  const m = mergeSettings({}, { todayCard: 'yes', receipts: 1, trayDot: true, textSize: 999, todayPlace: 'Ottawa<script>', tourSeen: 'x' });
  check('only true turns a switch on', m.todayCard === false && m.receipts === false && m.trayDot === true);
  check('text size stays 80 to 160 in steps of 10', m.textSize === 160 && cleanTextSize(55) === 80 && cleanTextSize(124) === 120 && cleanTextSize('x') === 100);
  check('the place keeps only letters and plain marks', m.todayPlace === 'Ottawascript' && cleanPlace("St. John's, NL") === "St. John's, NL");
  check('a bad seen version is dropped', m.tourSeen === '');
  const cfg = {}; const out = everydaySettings(cfg, { focusTimer: true, textSize: 130, nonsense: true }, (c, p) => Object.assign(c, mergeSettings({}, p)));
  check('the settings door saves what it owns and says so', out.focusTimer === true && out.textSize === 130 && !('nonsense' in out));
}

// ---- 143/144 text size and font in the window ----
{
  check('the window turns the setting into a zoom', readingCss({ textSize: 130 }).zoom === 1.3 && readingCss({}).zoom === 1 && readingCss({ textSize: 400 }).zoom === 1.6);
  check('the easier font is a class, off unless true', readingCss({ readableFont: true }).readable && !readingCss({ readableFont: 'yes' }).readable);
  const css = read('public/style.css');
  check('the zoom covers the chat, the message box, Settings and Help', /\.log > \*, #input, #cellar-body > \*, #help-body > \* \{ zoom: var\(--text-zoom\); \}/.test(css));
  check('code keeps its own font', /html\.readable-font code, html\.readable-font pre/.test(css));
  const cellar = publicText('cellar.js');
  check('Look & feel has the slider and the switch', /data-textsize value=/.test(cellar) && /sswitch\('readableFont', settings\.readableFont === true, 'Easier-to-read font'/.test(cellar));
  check('both windows apply them', publicText('app.js').includes('applyReading(st)') && read('public/settings-window.js').includes('applyReading(reading)'));
  for (const f of ['public/phone/index.html', 'android/app/src/main/assets/www/index.html']) check(`the phone has them too (${f.split('/')[0]})`, read(f).includes('id="text-size"') && read(f).includes('id="readable-font"'));
  check('the phone script is the same in both places', read('public/phone/phone.js') === read('android/app/src/main/assets/www/phone.js') && /textSize: 100, readableFont: false/.test(read('public/phone/phone.js')));
}

// ---- 147 the focus timer ----
{
  let t = 1_000_000; const sent = [];
  const f = new Focus({ now: () => t, send: (ev) => sent.push(ev) });
  check('it starts off and holds nothing', !f.on && !f.hold({ type: 'checkin' }));
  check('a silly length is refused', Boolean(f.start(0).error) && Boolean(f.start(999).error) && !f.on);
  f.start(25);
  check('while on, taps on the shoulder wait', f.hold({ type: 'checkin', items: [] }) && f.hold({ type: 'reminder', text: 'tea' }) && f.hold({ type: 'tidy', count: 2 }));
  check('replies and other events still go through, and finished replies are counted', !f.hold({ type: 'done' }) && !f.hold({ type: 'token', text: 'hi' }) && f.view().held === 3);
  t += 10 * 60000; check('nothing ends early', f.tick() === null && f.on && f.view().leftSeconds === 15 * 60);
  t += 15 * 60000; const said = f.tick();
  check('at the end it says how it went, then hands over what waited, in order', /Focus done: 25 minutes/.test(said) && /1 check-in, 1 reminder, 1 housekeeping note waited/.test(said) && /1 reply/.test(said) && sent[0].type === 'focus-done' && sent.slice(1).map((e) => e.type).join() === 'checkin,reminder,tidy' && !f.on);
  f.start(15); t += 5 * 60000; f.finish(false);
  check('stopping early says so', /stopped after 5 minutes of 15/.test(sent.at(-1).text));
  check('a quiet spell says nothing needed you', /Nothing needed you/.test(focusSummary({ minutes: 25, planned: 25, full: true })));
  check('it holds check-ins, reminders, housekeeping, announcements and Lab notes', ['checkin', 'reminder', 'tidy', 'announce', 'lab-done'].every((k) => FOCUS_HOLDS.has(k)));
  const server = read('src/server.js');
  check('the server holds events before sending them', /function broadcast\(ev\) \{\n  if \(focus\?\.hold\(ev\)\) return;/.test(server));
  check('turning the switch off ends a running timer', server.includes('if (b.focusTimer === false && focus.on) focus.finish(false);'));
  check('the button is beside Effort and hidden until the switch is on', /<span id="focusPick" class="focus-pick" hidden><button id="focusBtn"[^>]*><span class="lbl">⏱ Focus<\/span>/.test(read('public/index.html')));
}

// ---- 146 the today card ----
{
  const cfg = fresh();
  const day = new Date(2026, 10, 12, 8, 0).getTime();
  fs.writeFileSync(path.join(cfg.dataDir, 'reminders.json'), JSON.stringify([{ at: day + 3600e3, text: 'Call the vet' }, { at: day + 3 * 864e5, text: 'Later' }]));
  let asked = [];
  const fakeFetch = async (url) => { asked.push(url); return { ok: true, json: async () => (url.includes('geocoding') ? { results: [{ name: 'Ottawa', admin1: 'Ontario', country_code: 'CA', latitude: 45.42, longitude: -75.69 }] } : { daily: { weather_code: [61], temperature_2m_max: [7.4], temperature_2m_min: [1.2], precipitation_probability_max: [70] }, daily_units: { temperature_2m_max: '°C' } }) }; };
  const none = await todayCard(cfg, { now: () => day, fetchImpl: fakeFetch, schedules: () => [{ enabled: true, name: 'Backup', nextDue: new Date(day + 7200e3).toISOString() }, { enabled: false, name: 'Off', nextDue: new Date(day).toISOString() }], checkin: () => ({ at: new Date(day - 3600e3).toISOString(), found: [{ title: 'A download stopped moving' }] }) });
  check('no place, no weather, and nothing goes online', none.weather === null && asked.length === 0);
  check('today\'s reminders and switched-on jobs only', none.reminders.length === 1 && none.reminders[0].text === 'Call the vet' && none.schedules.length === 1 && none.schedules[0].name === 'Backup');
  check('the last check-in is on it', none.checkin?.found[0] === 'A download stopped moving');
  cfg.todayPlace = 'Ottawa';
  const card = await todayCard(cfg, { now: () => day, fetchImpl: fakeFetch, schedules: () => [], checkin: () => null });
  check('with a place, only the place name is asked about', asked.length === 2 && asked[0].includes('name=Ottawa') && !asked.join(' ').includes('vet'));
  check('the weather is read in plain words', card.weather.sky === 'light rain' && card.weather.high === 7 && card.weather.low === 1 && card.weather.rain === 70 && card.weather.place === 'Ottawa, Ontario, CA');
  const broken = await todayCard({ ...cfg, todayPlace: 'Nowhere' }, { now: () => day, fetchImpl: async () => { throw new Error('offline'); }, schedules: () => [], checkin: () => null });
  check('a failed weather call only leaves the weather out', /didn't answer/.test(broken.weather.error) && broken.reminders.length === 1);
  check('an unknown place says so', (await weatherFor('Zzzz', { fetchImpl: async () => ({ ok: true, json: async () => ({ results: [] }) }) })).error.includes('couldn\'t find'));
  const html = todayHtml(card);
  check('the card shows each part and escapes words', html.includes('Call the vet') && html.includes('light rain') && !todayHtml({ reminders: [{ text: '<b>x</b>', at: new Date().toISOString() }] }).includes('<b>x'));
  check('an empty day says so', todayHtml({}).includes('A clear run'));
}

// ---- 149 the tour after an update ----
{
  check('the server and the window list the same new switches', JSON.stringify(WHATS_NEW) === JSON.stringify(TOUR));
  check('every tour key is a real switch on the Welcome list', Object.values(WHATS_NEW).flat().every((k) => WANTS.some((w) => w.key === k)) && Object.values(WHATS_NEW).every((l) => l.length <= 3));
  check('off: no tour', tourFor({}, '1.5.207').length === 0);
  check('on: this version\'s cards, once', tourFor({ updateTour: true }, '1.5.207').length === 3 && tourFor({ updateTour: true, tourSeen: '1.5.207' }, '1.5.207').length === 0 && tourFor({ updateTour: true, tourSeen: '1.5.205' }, '1.5.207').length === 3);
  check('versions compare as numbers', newer('1.5.210', '1.5.207') && !newer('1.5.207', '1.5.207') && newer('1.6.0', '1.5.999'));
  const cards = tourCards(TOUR['1.5.207']);
  const h = tourHtml('1.5.207', cards, { focusTimer: true });
  check('each card has Turn on, and an on one says On', (h.match(/data-tour="/g) || []).length === 3 && /data-tour="focusTimer" disabled>On</.test(h));
  check('the window never turns one on by itself', /if \(b\.dataset\.tour\) \{ const r = await api\('\/api\/settings', wantPatch\(b\.dataset\.tour, true\)\)/.test(read('public/everyday.js')));
}

// ---- 148 receipts ----
{
  const cfg = fresh(); cfg.receipts = true;
  check('a receipt needs a total', cleanRow({ shop: 'X' }) === null && cleanRow({ total: 'abc' }) === null);
  const r = cleanRow({ date: '2026-11-10', shop: 'Corner Grocer', total: '$12.40', currency: 'cad', category: 'Groceries', note: 'milk, eggs' }, Date.UTC(2026, 10, 11));
  check('a receipt line is cleaned', r.total === 12.4 && r.currency === 'CAD' && r.category === 'groceries' && r.date === '2026-11-10');
  check('an odd category becomes other, and no date means today', cleanRow({ total: 3, category: 'spaceships' }, Date.UTC(2026, 10, 11)).category === 'other' && cleanRow({ total: 3 }, Date.UTC(2026, 10, 11)).date === '2026-11-11');
  addRow(cfg, { date: '2026-11-10', shop: 'Corner Grocer', total: 12.4, currency: 'CAD', category: 'groceries' });
  addRow(cfg, { date: '2026-11-11', shop: '=HYPERLINK("x")', total: 30, currency: 'CAD', category: 'fuel' });
  const raw = fs.readFileSync(sheetFile(cfg), 'utf8');
  check('the sheet on disk is locked: no shop or total in it', !raw.includes('Corner Grocer') && !raw.includes('12.4') && raw.includes('bobsecret1:'));
  const rows = loadSheet(cfg);
  check('it reads back, newest first', rows.length === 2 && rows[0].date === '2026-11-11');
  const t = totals(rows, Date.UTC(2026, 10, 15));
  check('totals by category this month', t.byCat['groceries CAD'] === 12.4 && t.byCat['fuel CAD'] === 30 && t.byMonth['2026-11 CAD'] === 42.4);
  const csv = toCsv(rows);
  check('the CSV is plain, with a header, and a spreadsheet never runs a cell', csv.startsWith('Date,Shop,Total') && csv.includes(`"'=HYPERLINK(""x"")"`));
  check('a line can be taken off', removeRow(cfg, rows[1].id).count === 1 && Boolean(removeRow(cfg, 'nope').error));
  const tool = receiptTool({ cfg });
  check('Bob\'s tool adds and says what it added', /Added: 2026-11-09, Cafe, 4.50 CAD \(eating out\)/.test(await tool.run({ action: 'add', date: '2026-11-09', shop: 'Cafe', total: '4.5', currency: 'CAD', category: 'eating out' })));
  cfg.receipts = false;
  check('with the switch off the tool says where it is', !receiptsOn(cfg) && /Everyday helpers/.test(await tool.run({ action: 'list' })));
  check('the tool is short', JSON.stringify(tool.schema).length < 900);
  const brain = brainText(), box = read('src/toolbox.js');
  check('the tool is hidden while the switch is off', brain.includes("!receiptsOn(this.cfg) && 'spending_sheet'"));
  check('the word "receipt" brings the tool in', /spending: \{[\s\S]{0,300}tools: \['spending_sheet'\][\s\S]{0,80}receipts\?/.test(box));
  check('the sheet is never in a backup (its key belongs to this computer)', NOT_BACKED_UP.includes('bob/spending.json'));
  check('Settings shows the sheet and a CSV button', sheetHtml({ rows, count: 1, month: '2026-11', byCat: {} }).includes('Save as a spreadsheet (CSV)'));
}

// ---- 145 profiles ----
{
  const cfg = fresh();
  const ownerKey = crypto.randomBytes(32);
  cfg.lock = { enabled: true, encrypt: true, ...wrapKey('owner-code', ownerKey) };
  fs.writeFileSync(cfg.configFile, JSON.stringify({ lock: cfg.lock }));
  const brain = { sessionDir: path.join(cfg.dataDir, 'sessions'), sessions: new Map([['x', []]]) };
  const p = new Profiles(cfg, { brain });
  check('off to start with, and the lock screen asks nothing new', !profilesOn(cfg) && p.people().length === 0 && !lockPage({}).includes("Who's this?"));
  cfg.profilesOn = true;
  check('needs the lock with Lock my chats and memory', profilesOn(cfg) && !profilesOn({ ...cfg, lock: { ...cfg.lock, encrypt: false } }));
  check('a person needs a name and a passcode, not the owner\'s', Boolean(p.add('', 'abcd').error) && Boolean(p.add('Sam', 'ab').error) && Boolean(p.add('Sam', 'owner-code').error));
  const v = p.add('Sam', 'sam-code').view;
  check('adding a person keeps no passcode, only a locked key', v.list.length === 1 && !fs.readFileSync(cfg.configFile, 'utf8').includes('sam-code') && JSON.parse(fs.readFileSync(cfg.configFile, 'utf8')).lock.wrapped === cfg.lock.wrapped);
  check('the same name twice is refused', Boolean(p.add('sam', 'other-code').error));
  const id = v.list[0].id;
  const page = lockPage({ people: p.people() });
  check('the lock screen asks who it is', page.includes("Who's this?") && page.includes(`value="${id}"`) && page.includes('The owner'));
  check('a wrong passcode opens nothing', Boolean(p.open(id, 'wrong').error) && p.current() === MAIN);
  setKey(ownerKey); writeText(cfg, cfg.memoryFile, 'The owner likes tea.');
  check('the owner\'s memory is locked on disk', isSealed(fs.readFileSync(cfg.memoryFile)));
  check('the right passcode opens their own folder', p.open(id, 'sam-code').ok && p.current() === id && cfg.memoryFile === path.join(profileDir(cfg, id), 'bob-memory.md') && sessionDir(cfg) === path.join(profileDir(cfg, id), 'sessions'));
  check('Bob forgets the chat he held and points at their chats', brain.sessions.size === 0 && brain.sessionDir === sessionDir(cfg));
  check('their chats and memory are always locked', vaultOn(cfg));
  writeText(cfg, cfg.memoryFile, 'Sam likes coffee.');
  check('their memory is locked on disk too', isSealed(fs.readFileSync(cfg.memoryFile)) && readText(cfg.memoryFile) === 'Sam likes coffee.');
  let ownerRead = ''; try { ownerRead = readText(path.join(cfg.innDir, 'bob-memory.md')); } catch { ownerRead = 'refused'; }
  check('while they\'re in, the owner\'s memory can\'t be read', ownerRead !== 'The owner likes tea.');
  check('only the owner adds or removes people', Boolean(p.add('Kim', 'kim-code').error) && Boolean(p.remove(id).error));
  setKey(ownerKey); p.useMain();
  check('back to the owner: the owner\'s folder and memory', p.current() === MAIN && cfg.memoryFile === path.join(cfg.innDir, 'bob-memory.md') && readText(cfg.memoryFile) === 'The owner likes tea.' && !cfg.sessionsDir);
  check('removing a person deletes their folder', !p.remove(id).error && !fs.existsSync(profileDir(cfg, id)) && p.view().list.length === 0);
  setKey(null);
  const server = read('src/server.js');
  check('the lock door opens a person with their passcode and locks every other window out', server.includes("profiles.open(who, form.get('code') || '')") && /if \(profiles\.current\(\) !== before\) \{ winLock\.lockNow\(\);/.test(server));
  check('the owner\'s phone can\'t see a profile\'s chats while it\'s open', /if \(!isLocal && cfg\.profileNow && PROFILE_PRIVATE\.some/.test(server) && /PROFILE_PRIVATE = \['\/api\/events', '\/api\/history', '\/api\/chat'/.test(server));
  check('the lock can\'t be changed from inside a profile', read('src/lock.js').includes('if (cfg.profileNow) return { error:'));
  check('housekeeping only tidies the owner\'s things', read('src/housekeeping.js').includes("if (this.cfg.profileNow) return { skipped: true, profile: true };"));
  check('search in a profile never shows the owner\'s notes', read('src/search.js').includes("!cfg.profileNow || kind === 'memory'"));
  check('profiles are never in a backup', NOT_BACKED_UP.includes('profiles/'));
  check('Settings lists people with Add and Remove', peopleHtml({ list: [{ id: 'a', name: 'Sam' }], ownerLocked: true }).includes('＋ Add a person') && peopleHtml({}).includes('Lock my chats and memory'));
}

// ---- 150 the tray dot ----
{
  const off = windowState({});
  check('off: no dot pictures, no dot', off.trayDot === false && off.dotIcons === null && off.dot === false);
  const on = windowState({ trayDot: true });
  check('on: the tray pictures with a dot, and a badge', on.trayDot && [16, 24, 32].every((n) => Buffer.isBuffer(on.dotIcons[n])) && Buffer.isBuffer(on.dotIcons.badge));
  const px = dotPixels('sysop', 32), at = (x, y) => (y * 32 + x) * 4, c = Math.round(32 - 32 * 0.24);
  check('the dot sits in the bottom-right corner, ringed', px[at(c, c) + 3] === 255 && px[at(c, c)] === 0xe7 && px[at(c, 31)] === 0x2b && dotPixels('', 16)[at(0, 0) + 3] === 0);
  const main = read('electron/main.cjs');
  check('the window program draws it on the tray, the taskbar and the Dock', /const ic = dotted\(\) \? winState\.dotIcons : winState\.icons;/.test(main) && main.includes('win.setOverlayIcon(') && main.includes("app.dock.setBadge(dotted() ? '•' : '')"));
  const ev = read('public/everyday.js');
  check('the dot comes on only when nobody is looking, and goes when they look', ev.includes("pinged() { if (document.hidden || !document.hasFocus()) seen(true); }") && ev.includes("document.addEventListener('visibilitychange', () => { if (!document.hidden) seen(false); });"));
}

// ---- Settings, Help, glossary, FAQ ----
{
  check('the panel is on a card and in a group', GROUPS.some(([, ids]) => ids.includes('adv-daily')) && CARDS.find((c) => c.id === 'how').topics.includes('adv-daily'));
  const ids = new Set(HELP.map((e) => e.id));
  check('Help has the guide, the receipts page, the profiles page and the settings page', ['everyday', 'receipts', 'profiles', 'settings-daily'].every((x) => ids.has(x)));
  check('the FAQ answers the everyday questions', ['faq-text-size', 'faq-profiles', 'faq-receipts', 'faq-focus'].every((x) => HELP.find((e) => e.id === x)?.group === 'FAQ'));
  const g = HELP.find((e) => e.id === 'glossary').html;
  check('the glossary has the new words', ['Focus timer', 'Profile (person)', 'Spending sheet', 'Today card', 'Tray dot'].every((w) => g.includes(`<dt>${w}</dt>`)));
  check('Help says where each one works', /Bob for Android has Text size and Easier-to-read font/.test(HELP.find((e) => e.id === 'everyday').html));
  check('the phone Help has text size', read('android/app/src/main/assets/www/help.js').includes("id: 'text-size'"));
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
