// 🧰 More tools (items 73 to 86): every switch starts off, and each tool does its one job. Everything here is fake:
// no real mailbox, calendar, web page, word list, Python, microphone or random numbers.
import { brainText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { EventEmitter } from 'node:events';
import { fileURLToPath } from 'node:url';
import { cleanMoreTools, moreToolsOff, MORE_TOOLS, SWITCHES, cleanBase, moreToolsLine, calendarKey, apiKeyName, EMAIL_KEY } from '../src/more-tools.js';
import { evaluate, show, convert } from '../src/calc.js';
import { makePassword, passwordTool } from '../src/passwords.js';
import { nextRepeat, firstRepeat, moveOn } from '../src/tools.js';
import { Imap, withMailbox, listMail, readMessage, decodeWords } from '../src/email-read.js';
import { parseIcs, eventsBetween } from '../src/calendar-read.js';
import { partOf, checkWatch } from '../src/page-watch.js';
import { callUrl, callService, apiTool } from '../src/web-api.js';
import { readOnlySql, parseCsv, csvDatabase } from '../src/data-query.js';
import { chartSource, rowsFromText } from '../src/charts.js';
import { checkText, suggest } from '../src/spell.js';
import { guessSpeakers, parseWhisper } from '../src/meeting-notes.js';
import { compareText } from '../src/compare-files.js';
import { untgz } from '../src/tgz.js';
import crypto from 'node:crypto';
import { closure, wheelsFor, wheelNeeds, getPackages, hasPackages, packagesForRun, WHEELS, PYODIDE_PACKAGES, wheelFile } from '../src/py-packages.js';
import { PYODIDE as PYO, pyodideDir as pyoDir } from '../src/py-sandbox.js';
import { runPython, pythonReady } from '../src/py-sandbox.js';
import { mergeSettings } from '../src/config.js';
import { keyNames } from '../src/backup.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra ? ' ' + extra : ''}`); };
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---- off by default ----
{
  const m = cleanMoreTools(undefined);
  check('all fifteen switches start off', SWITCHES.length === 15 && SWITCHES.every((s) => m[s.key] === false));
  check('only true turns a switch on', cleanMoreTools({ email: 'yes', calculator: true }).email === false && cleanMoreTools({ calculator: true }).calculator === true);
  check('with everything off, every new tool is taken out', MORE_TOOLS.every((t) => moreToolsOff({}).includes(t)));
  check('a switched-on tool stays in', !moreToolsOff({ moreTools: { calculator: true } }).includes('calculate'));
  check('Bob can say what is on', moreToolsLine({}) === '🧰 More tools: all off' && /calculator/.test(moreToolsLine({ moreTools: { calculator: true } })));
  check('defaults: IMAP port 993, INBOX, check every 6 hours', m.emailPort === 993 && m.emailFolder === 'INBOX' && m.watchHours === 6);
  check('service addresses: https, or http only for this machine, no sign-in in the link', cleanBase('https://api.example.com/v1') && !cleanBase('http://api.example.com') && cleanBase('http://localhost:8080') && !cleanBase('https://a:b@api.example.com'));
  check('settings keep the moreTools block', mergeSettings({}, { moreTools: { charts: true } }).moreTools?.charts === true && mergeSettings({}, { moreTools: { charts: 'on' } }).moreTools?.charts === false);
  check('backups carry the locked key names', ['BOB_EMAIL_PASSWORD', calendarKey('ab12'), apiKeyName('cd34')].every((k) => keyNames({ moreTools: { calendars: [{ id: 'ab12', name: 'W', kind: 'link' }], apis: [{ id: 'cd34', name: 'Weather', base: 'https://x.example.com' }] } }).includes(k)));
  check('the email password has a locked name', EMAIL_KEY === 'BOB_EMAIL_PASSWORD');
}

// ---- 74 calculator ----
{
  check('0.1 + 0.2 is exactly 0.3', show(evaluate('0.1 + 0.2')).text === '0.3');
  check('2^64 is exact', show(evaluate('2^64')).text.replace(/,/g, '') === '18446744073709551616');
  check('15% of 80 is 12', show(evaluate('15% of 80')).text === '12');
  check('powers bind before minus', show(evaluate('-2^2')).text === '-4');
  let threw = false; try { evaluate('1/0'); } catch { threw = true; }
  check('dividing by zero is refused', threw);
  const km = convert(10, 'miles', 'km');
  check('10 miles is 16.09344 km', /^16\.09344/.test(String(km.text || km.value || km)));
  const c = convert(212, 'F', 'C');
  check('212 °F is 100 °C', /^100\b/.test(String(c.text || c.value || c)));
}

// ---- 84 passwords ----
{
  let i = 0; const rnd = (n) => (i++ * 7) % n;
  const p = makePassword({ kind: 'password', length: 20 }, rnd);
  check('a password is the length asked', p.text.length === 20);
  const pp = makePassword({ kind: 'passphrase', words: 5 }, rnd);
  check('a passphrase has the words asked', pp.text.split('-').length === 5);
  const pin = makePassword({ kind: 'pin', length: 6 }, rnd);
  check('a PIN is digits', /^\d{6}$/.test(pin.text));
  const seen = []; const t = passwordTool({}, () => true);
  const out = await t.run({ kind: 'password', length: 16 }, { emit: (e) => seen.push(e), sessionId: 's1' });
  check('the password goes to the screen, not the brain', seen[0]?.type === 'secret-note' && seen[0].items[0].length === 16 && !String(out).includes(seen[0].items[0]));
  const tg = await t.run({ kind: 'password' }, { emit: () => {}, sessionId: 'telegram-1' });
  check('not over Telegram', /n't|not/i.test(String(tg)));
}

// ---- 75 repeating reminders ----
{
  check('every week adds 7 days', nextRepeat('2026-11-16T09:00', 'week') === '2026-11-23T09:00');
  check('Friday to the next weekday is Monday', nextRepeat('2026-11-13T09:00', 'weekday') === '2026-11-16T09:00');
  check('a weekday reminder asked on Saturday starts Monday', firstRepeat('2026-11-14T09:00', 'weekday') === '2026-11-16T09:00');
  check('the 31st lands on the last day of a short month', nextRepeat('2026-01-31T09:00', 'month') === '2026-02-28T09:00');
  check('and goes back to the 31st after', nextRepeat('2026-02-28T09:00', 'month', 31) === '2026-03-31T09:00');
  const r = moveOn({ local: '2026-11-02T09:00', at: Date.UTC(2026, 10, 2, 9), every: 'day' }, 'UTC', Date.UTC(2026, 10, 5, 12));
  check('a missed repeat moves on past now', r.local === '2026-11-06T09:00');
}

// ---- 76 phone reminders ----
{
  const phone = read('android/app/src/main/assets/www/phone.js'), kt = read('android/app/src/main/java/ca/mousewurx/bob/Bridge.kt');
  check('the phone shows a reminder sent for it', /ev\.type === 'reminder' && ev\.phone/.test(phone));
  check('the phone shows a made password once', /secret-note/.test(phone));
  check('Android notifies in the background', /"reminder" ->/.test(kt));
}

// ---- 77 email (a fake IMAP server) ----
{
  const sent = [];
  const fakeSocket = () => {
    const s = new EventEmitter();
    s.write = (line) => {
      sent.push(line.trim());
      const [tag, cmd] = line.trim().split(' ');
      const say = (t) => setImmediate(() => s.emit('data', Buffer.from(t)));
      if (cmd === 'UID' && /SEARCH/.test(line)) say(`* SEARCH 41 42\r\n${tag} OK done\r\n`);
      else if (cmd === 'UID' && /FETCH/.test(line)) {
        const h = 'From: Ann <ann@example.test>\r\nSubject: =?utf-8?B?SGVsbG8gdGhlcmU=?=\r\nDate: Mon, 9 Nov 2026 10:00:00 +0000\r\n\r\n';
        say(`* 1 FETCH (UID 42 FLAGS () BODY[HEADER.FIELDS (FROM SUBJECT DATE)] {${Buffer.byteLength(h)}}\r\n${h})\r\n${tag} OK done\r\n`);
      } else say(`${tag} OK done\r\n`);
    };
    s.end = () => {};
    setImmediate(() => s.emit('data', Buffer.from('* OK ready\r\n')));
    return s;
  };
  const cfg = { moreTools: { email: true, emailHost: 'imap.example.com', emailUser: 'me@example.test' } };
  const r = await listMail(cfg, { days: 3 }, { connect: async () => fakeSocket(), password: 'app-pass' });
  check('mail is listed from the fake server', r.total >= 1 && /Hello there/.test(JSON.stringify(r)));
  check('the mailbox is opened read-only (EXAMINE, never SELECT)', sent.some((l) => /EXAMINE/.test(l)) && !sent.some((l) => /\bSELECT\b/.test(l)));
  check('nothing is fetched in a way that marks it read', sent.filter((l) => /FETCH/.test(l)).every((l) => /BODY\.PEEK/.test(l)));
  check('nothing is stored, moved, deleted or sent', !sent.some((l) => /\b(STORE|COPY|MOVE|EXPUNGE|APPEND|DELETE)\b/.test(l)));
  check('encoded subjects are decoded', decodeWords('=?utf-8?Q?Caf=C3=A9?=') === 'Café');
  const m = readMessage('Content-Type: text/plain; charset=utf-8\r\nContent-Transfer-Encoding: quoted-printable\r\n\r\nHi =E2=9C=93 there');
  check('a quoted-printable message is read', /Hi ✓ there/.test(m.text));
  let no = ''; try { await withMailbox(cfg, async () => {}, { connect: async () => fakeSocket(), password: '' }); } catch (e) { no = e.message; }
  check('no password: says where to put it', /app password/i.test(no));
}

// ---- 78 calendar ----
{
  const ics = ['BEGIN:VCALENDAR', 'BEGIN:VEVENT', 'UID:a', 'SUMMARY:Team call', 'DTSTART;TZID=America/Edmonton:20261102T090000', 'DTEND;TZID=America/Edmonton:20261102T093000', 'RRULE:FREQ=WEEKLY;BYDAY=MO', 'EXDATE;TZID=America/Edmonton:20261109T090000', 'END:VEVENT', 'BEGIN:VEVENT', 'UID:b', 'SUMMARY:Dentist', 'DTSTART:20261111T170000Z', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const cal = parseIcs(ics);
  const evs = eventsBetween([{ name: 'Work', events: cal.events || cal }], Date.UTC(2026, 10, 1), Date.UTC(2026, 10, 30), 'America/Edmonton');
  const calls = evs.filter((e) => /Team call/.test(e.title || e.summary));
  check('a weekly event repeats, minus its skipped day', calls.length === 3, String(calls.length));
  check('one-off events are there too', evs.some((e) => /Dentist/.test(e.title || e.summary)));
}

// ---- 79 page watch ----
{
  check('the part after the label is what is watched', /\$129\.99/.test(partOf('Widget Price $129.99 In stock', 'Price').part));
  const page = (body) => async () => new Response(body, { status: 200, headers: { 'content-type': 'text/plain' } });
  const w0 = { id: 'w', url: 'https://shop.example.com/x', find: 'Price' };
  let r = await checkWatch(w0, { fetchImpl: page('Price $129.99 In stock') });
  check('the first look remembers the part', !r.changed && /129/.test(r.watch.part || ''), r.problem || '');
  r = await checkWatch(r.watch, { fetchImpl: page('Price $99.99 In stock') });
  check('a change is noticed', r.changed === true, r.problem || '');
  r = await checkWatch({ ...w0, url: 'http://127.0.0.1/' }, { fetchImpl: page('x') });
  check('home-network addresses are refused', /home network/.test(r.problem || ''));
}

// ---- 80 web services ----
{
  check('a call stays under the saved address', callUrl('https://api.example.com/v1', '/items', { q: 'a' }).href === 'https://api.example.com/v1/items?q=a');
  let threw = 0;
  for (const bad of ['https://evil.example.com/', '//evil.example.com', '../admin', '/v1/../../admin']) { try { callUrl('https://api.example.com/v1', bad); } catch { threw++; } }
  check('it can not go elsewhere', threw === 4, String(threw));
  const cfg = { moreTools: { webApi: true, apis: [{ id: 'k1', name: 'Weather', base: 'https://api.example.com/v1', header: 'Authorization', prefix: 'Bearer' }] } };
  let got = null;
  const fetchImpl = async (u, o) => { got = { u: String(u), o }; return new Response('{"echo":"sekret-key-123"}', { status: 200, headers: { 'content-type': 'application/json' } }); };
  const r = await callService(cfg, { service: 'weather', path: '/now' }, { fetchImpl, key: () => 'sekret-key-123' });
  check('the key goes in its header', got.o.headers.Authorization === 'Bearer sekret-key-123');
  check('the key never comes back to the brain', !r.text.includes('sekret-key-123'));
  const t = apiTool(cfg, () => true);
  check('reading needs no card', !(await t.check({ service: 'Weather', method: 'GET' })));
  check('sending or changing always asks', Boolean(await t.check({ service: 'Weather', method: 'POST' })) && t.alwaysAsk === true);
}

// ---- 81 data ----
{
  check('SELECT is allowed', readOnlySql('SELECT city, count(*) FROM data GROUP BY city').ok !== false);
  for (const bad of ['DELETE FROM data', 'ATTACH DATABASE "x" AS y', 'SELECT 1; DROP TABLE data', 'PRAGMA writable_schema=1', 'INSERT INTO data VALUES (1)']) {
    let ok = true; try { const r = readOnlySql(bad); ok = r?.ok !== false && !r?.error; } catch { ok = false; }
    check(`refused: ${bad}`, !ok);
  }
  let r2 = true; try { const r = readOnlySql("SELECT replace(city, 'a', 'b') FROM data"); r2 = r?.ok !== false && !r?.error; } catch { r2 = false; }
  check('replace() the function is fine', r2);
  const rows = parseCsv('city,sales\nRed Deer,3\nCalgary,"1,200"\n');
  check('a CSV with a quoted comma reads right', rows.length === 3 && rows[2][1] === '1,200');
  try {
    const db = await csvDatabase('city,sales\nRed Deer,3\nCalgary,5\n');
    const got = db.prepare ? db.prepare('SELECT sum(sales) AS s FROM data').get() : null;
    check('a CSV becomes a table to ask', got ? Number(got.s) === 8 : true);
  } catch (e) { check('a CSV becomes a table to ask', /sqlite/i.test(e.message), e.message); }
}

// ---- 82 charts ----
{
  const { rows } = rowsFromText('| Month | Sales |\n|---|---|\n| Jan | 3 |\n| Feb | 5 |');
  const src = chartSource({ rows, x: 'month', ys: ['sales'], kind: 'bar', title: 'Sales' });
  check('a table becomes a chart', /xychart-beta/.test(src) && /3, 5|3,5/.test(src));
  check('a pie chart too', /^pie/m.test(chartSource({ rows, x: 'month', ys: ['sales'], kind: 'pie', title: 'Sales' })));
}

// ---- 83 spelling ----
{
  const words = new Set(['the', 'cat', 'sat', 'on', 'mat', 'a', 'apple', 'have', 'could', 'i', 'think', 'said', 'ate']);
  const issues = checkText('The cat sat on teh mat. I think the the cat could of sat.', words);
  check('a misspelt word is found with a fix', issues.some((x) => x.word === 'teh' && /the/.test(x.fix)));
  check('a word twice is found', issues.some((x) => /twice/.test(x.what)));
  check('"could of" is found', issues.some((x) => /could have/.test(x.what)));
  check('a wrong "a" is found', checkText('I ate a apple.', words).some((x) => /an apple/.test(x.fix)));
  check('names and web addresses are left alone', !checkText('I think Zorblat said https://exampel.com', words).length);
  check('suggestions are one letter away', suggest('cta', words).includes('cat'));
}

// ---- 85 meeting notes ----
{
  let s = 1; const r = () => { s = (s * 16807) % 2147483647; return s / 2147483647 - 0.5; };
  const voice = (base) => base.map((x) => x + r() * 0.4);
  const A = Array.from({ length: 21 }, (_, i) => (i < 10 ? 4 : 1)), B = Array.from({ length: 21 }, (_, i) => (i < 10 ? 1 : 4));
  const two = []; for (let i = 0; i < 12; i++) two.push(voice(i % 3 === 0 ? B : A));
  const g = guessSpeakers(two);
  check('two different voices make two speakers', new Set(g).size === 2 && g[0] === g[3] && g[0] !== g[1] && g[1] === g[2]);
  const one = []; for (let i = 0; i < 12; i++) one.push(voice(A));
  check('one voice stays one speaker', new Set(guessSpeakers(one)).size === 1);
  check('the number of people given is used', new Set(guessSpeakers(two, 2)).size === 2);
  const w = parseWhisper('[00:00:00.000 --> 00:00:02.500]  Hello all.\n[00:00:02.500 --> 00:00:05.000]  Let us start.');
  check('whisper lines become timed pieces', w.length === 2 && w[1].start === 2.5 && /Let us start/.test(w[1].text));
}

// ---- 86 compare files ----
{
  const r = compareText('milk\neggs\nbread\n', 'milk\neggs\nbrown bread\njam\n');
  check('a changed line shows the changed words', /\{\+brown \+\}bread|\{\+brown\+\}/.test(r.text));
  check('an added line is counted', r.added === 1 && r.changed === 1 && r.removed === 0);
  check('the same file says so', compareText('a\nb', 'a\r\nb').same === true);
}

// ---- 73 Python (no Pyodide here: the box is faked) ----
{
  const cfg = { agentDir: path.join(os.tmpdir(), 'bob-no-such'), innDir: fs.mkdtempSync(path.join(os.tmpdir(), 'bob-py-')) };
  const none = await runPython(cfg, 'result = 1', {}, { have: () => false });
  check('no Python yet: says to press Get Python', !none.ok && /Get Python/.test(none.error));
  const leaky = await runPython(cfg, 'result = 1', {}, { have: () => true, holds: async () => ({ ok: false, why: 'no lock' }) });
  check('a sandbox that does not hold runs nothing', !leaky.ok && /doesn't hold/.test(leaky.error));
  let asked = null;
  const ready = await pythonReady(cfg, { have: () => true, holds: async () => ({ ok: true }), run: async (o) => { asked = o; return { ok: true, out: JSON.stringify({ ok: true, out: 2.5, printed: '' }) }; } });
  check('switching on runs a test sum in the box', ready.ok === true);
  check('the box has no internet and reads only Pyodide', asked.internet === false && asked.reads.length === 1 && /pyodide-/.test(asked.reads[0]));
  check('the scratch folder is thrown away', fs.readdirSync(path.join(cfg.innDir, 'tools', '_pyscratch')).length === 0);
  fs.rmSync(cfg.innDir, { recursive: true, force: true });
  check('a computer\'s own Python is never started', !/spawn\(['"]python|execFile\(['"]python/.test(read('src/py-sandbox.js')));
}

// ---- 73b Python packages (Get packages; no real download: the fetch and Pyodide's folder are faked) ----
{
  const shaOf = (b) => crypto.createHash('sha256').update(b).digest('hex');
  const lock = { info: { version: PYO.version }, packages: {} };
  const body = {};
  const names = new Set([...PYODIDE_PACKAGES, ...wheelNeeds(WHEELS).pyodide, 'six']);
  for (const n of names) { const b = Buffer.from('wasm ' + n); body[`${n}.whl`] = b; lock.packages[n] = { name: n, file_name: `${n}.whl`, sha256: shaOf(b), depends: n === 'pandas' ? ['numpy', 'six'] : [] }; }
  const c = closure(lock, ['pandas']);
  check('a package brings what it needs, from the lock', c.names.join() === 'numpy,pandas,six' && c.missing.length === 0);
  check('a name the lock lacks is reported', closure(lock, ['nope']).missing[0] === 'nope');
  const w = wheelsFor('import docx\nfrom openpyxl import Workbook\nimport os, pptx.util\n');
  check('the wheels a piece of code imports, with what they need', ['python-docx', 'openpyxl', 'et-xmlfile', 'python-pptx', 'xlsxwriter'].every((n) => w.wheels.some((x) => x.name === n)) && w.pyodide.includes('lxml'));
  check('plain maths imports no wheel', wheelsFor('import math\nresult = 2').wheels.length === 0);
  check('every wheel is pinned by sha256 and comes from PyPI', WHEELS.every((x) => /^[0-9a-f]{64}$/.test(x.sha256) && new URL(x.url).hostname === 'files.pythonhosted.org' && x.url.endsWith('.whl')));
  const agentDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-pk-'));
  const cfg = { agentDir, innDir: agentDir };
  const dir = pyoDir(cfg);
  fs.mkdirSync(dir, { recursive: true });
  for (const f of ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip']) fs.writeFileSync(path.join(dir, f), 'x');
  fs.writeFileSync(path.join(dir, 'pyodide-lock.json'), JSON.stringify(lock));
  for (const x of WHEELS) body[wheelFile(x)] = Buffer.from('wheel ' + x.name);
  const fakeWheelSha = Object.fromEntries(WHEELS.map((x) => [x.name, x.sha256]));
  // The real wheels' checksums can't match fake bytes, so a fetch that hands back a fake wheel must be refused.
  const urls = [];
  const fetchImpl = async (url) => { urls.push(url); const f = url.split('/').pop(); return { ok: true, url, body: [body[f] || Buffer.from('')] }; };
  let err = '';
  try { await getPackages(cfg, { fetchImpl }); } catch (e) { err = e.message; }
  check('a file whose checksum does not match is not kept', /checksum didn't match/.test(err) && !hasPackages(cfg));
  check('ready-built files come only from the Pyodide CDN at this version', urls.filter((u) => !u.includes('pythonhosted')).every((u) => u.startsWith(`https://cdn.jsdelivr.net/pyodide/v${PYO.version}/full/`)));
  // Now with the wheels' pins pointed at the fake bytes (as if those were the real files).
  for (const x of WHEELS) x.sha256 = shaOf(body[wheelFile(x)]);
  urls.length = 0;
  const got = await getPackages(cfg, { fetchImpl });
  check('every package is fetched once and kept', hasPackages(cfg) && got.files === names.size + WHEELS.length);
  urls.length = 0;
  await getPackages(cfg, { fetchImpl });
  check('files already here and still matching are not fetched again', urls.length === 0);
  const redirected = async (url) => ({ ok: true, url: 'https://evil.example/x.whl', body: [Buffer.from('x')] });
  fs.rmSync(path.join(dir, 'numpy.whl'));
  let e2 = '';
  try { await getPackages(cfg, { fetchImpl: redirected }); } catch (e) { e2 = e.message; }
  check('a download sent somewhere else is refused', /don't trust/.test(e2));
  for (const x of WHEELS) x.sha256 = fakeWheelSha[x.name];
  check('a missing file means the packages are not here', !hasPackages(cfg));
  check('no packages here: a run asks for none', packagesForRun({ agentDir: path.join(os.tmpdir(), 'bob-no-such') }, 'import docx') === null);
  let asked = null;
  const run = async (o) => { asked = o; return { ok: true, out: JSON.stringify({ ok: true, out: 1, printed: '' }) }; };
  await runPython(cfg, 'import docx\nresult = 1', {}, { have: () => true, holds: async () => ({ ok: true }), run, packages: () => ({ wheels: ['python_docx-1.2.0-py3-none-any.whl'], pyodide: ['lxml'] }) });
  check('a run that uses packages gets them, more time, and still no internet or other folders', asked.input.packages.wheels.length === 1 && asked.timeoutSec === 60 && asked.internet === false && asked.reads.length === 1);
  await runPython(cfg, 'result = 1', {}, { have: () => true, holds: async () => ({ ok: true }), run, packages: () => null });
  check('a plain run keeps 30 seconds', asked.timeoutSec === 30 && asked.input.packages === null);
  check('packages are loaded only from Pyodide\'s own folder, never with micropip or pip', !/micropip|pip install/.test(read('src/py-sandbox.js')) && /loadPackagesFromImports/.test(read('src/py-sandbox.js')));
  fs.rmSync(agentDir, { recursive: true, force: true });
}

// ---- the .tgz reader (Pyodide and the word list come as these) ----
{
  const zlib = await import('node:zlib');
  const head = (name, size) => { const b = Buffer.alloc(512); b.write(name); b.write(size.toString(8).padStart(11, '0') + '\0', 124); b.write('0', 156); b.write('ustar', 257); let sum = 0; b.fill(' ', 148, 156); for (const x of b) sum += x; b.write(sum.toString(8).padStart(6, '0') + '\0 ', 148); return b; };
  const body = Buffer.from('hello'), pad = Buffer.alloc(512 - body.length);
  const tar = Buffer.concat([head('package/words.txt', body.length), body, pad, head('package/../evil.txt', body.length), body, pad, Buffer.alloc(1024)]);
  const files = untgz(zlib.gzipSync(tar), new Set(['words.txt', 'evil.txt']));
  check('only the files asked for, from the top folder', files.get('words.txt')?.toString() === 'hello' && !files.has('evil.txt') && !files.has('../evil.txt'));
}

// ---- wiring ----
{
  const brain = brainText();
  check('the tools come out of Bob\'s list while off', /moreToolsOff\(this\.cfg\)/.test(brain));
  const help = read('public/help-content.js');
  check('Help names every switch', SWITCHES.every((s) => help.includes(s.label.replace(/'/g, "\\'")) || help.includes(s.label)));
  check('there are FAQs for email, Python and passwords', ['faq-email-safe', 'faq-python-safe', 'faq-passwords'].every((id) => help.includes(`id: '${id}'`)));
  check('the panel sits on the How Bob works card', /adv-tools/.test(read('public/settings-map.js')));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
