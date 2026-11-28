// Nov 28 2026: "Look closer before answering" (src/look-closer.js), off by default. Web answers from search snippets
// get one more go to open a page; the mail danger check covers every message in the range, not just the 15 shown; a
// declined card keeps what was found. Nothing here reads the real computer: a fake mail server and plain objects.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { fakeMailServer } from './fake-mail-server.js';

const here = path.dirname(fileURLToPath(import.meta.url));
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + String(extra).slice(0, 500) : ''}`); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-look-'));
const conf = path.join(tmp, 'config.json');
fs.copyFileSync(path.join(here, '..', 'config.example.json'), conf);
process.env.BOB_CONFIG = conf; process.env.BOB_AGENT_DIR = tmp;
const { lookCloserOn, snippetNudge, moreDangerLine, DECLINED_KEEP } = await import('../src/look-closer.js');
const { afterTurn } = await import('../src/verify.js');
const { emailTool } = await import('../src/email-read.js');
const { HELP } = await import('../public/help-content.js');
const { publicText } = await import('./source-text.js');
const read = (f) => fs.readFileSync(path.join(here, '..', f), 'utf8').replace(/\r\n/g, '\n');

// ---- the switch ----
check('off unless turned on', !lookCloserOn({}) && !lookCloserOn({ lookCloser: 'yes' }) && lookCloserOn({ lookCloser: true }));

// ---- (1) web: searched, opened nothing ----
const searched = [{ name: 'web_search', ok: true }];
const long = 'The newest version is 4.1 and it added offline mode, released last week with several fixes.';
check('searched, no page, answered: one more go to open a page', /never opened a page/.test(snippetNudge({ actions: searched, reply: long })));
check('...and it says not to call an unknown site fake', /Don't call a site fake/.test(snippetNudge({ actions: searched, reply: long })));
check('a page was read: nothing', snippetNudge({ actions: [...searched, { name: 'fetch_page', ok: true }], reply: long }) === '');
check('a failed page read still counts as none read', /never opened/.test(snippetNudge({ actions: [...searched, { name: 'fetch_page', ok: false }], reply: long })));
check('no search: nothing', snippetNudge({ actions: [{ name: 'read_file', ok: true }], reply: long }) === '');
check('a question back: nothing', snippetNudge({ actions: searched, reply: 'Which app do you mean, Quillmark or Quill notes for Mac?' }) === '');
check('no fetch_page to use: nothing', snippetNudge({ actions: searched, reply: long, usable: (n) => n !== 'fetch_page' }) === '');
{
  const base = { brain: { usable: () => true }, ledger: { actions: searched } };
  const on = afterTurn({ ...base, cfg: { lookCloser: true, userName: 'Sam' } }, long);
  const off = afterTurn({ ...base, cfg: { userName: 'Sam' } }, long);
  check('on: the end-of-turn check asks him to open a page', /never opened a page/.test(on?.nudge || ''), JSON.stringify(on));
  check('off: as before', !/never opened a page/.test(off?.nudge || ''));
}

// ---- (2) mail: the danger check covers every message in the range ----
const msg = (i, from, subject, extra = '') => `From: ${from}\r\nTo: Sam <sam@example.test>\r\nSubject: ${subject}\r\nDate: ${new Date(Date.now() - (40 - i) * 3600e3).toUTCString()}\r\n${extra}Content-Type: text/plain\r\n\r\nHello ${i}\r\n`;
const mail = [];
for (let i = 1; i <= 40; i++) {
  const bad = i === 3 || i === 7; // old ones, past the newest 15
  mail.push({ uid: i, flags: [], raw: msg(i, bad ? `"PayPal" <secure@paypa1-login.test>` : `"Friend ${i}" <friend${i}@example.test>`, bad ? 'Your account is suspended, verify within 24 hours' : `Hello ${i}`, bad ? 'Authentication-Results: mx.example.test; spf=fail\r\n' : '') });
}
const server = fakeMailServer({ folders: [{ name: 'INBOX' }], mail: { INBOX: mail } });
const cfgFor = (extra = {}) => ({ innDir: tmp, dataDir: tmp, userName: 'Sam', moreTools: { email: true, emailHost: 'imap.example.com', emailUser: 'sam@example.test', emailFolder: 'INBOX' }, ...extra });
{
  const off = await emailTool(cfgFor(), () => true, { connect: server.connect, password: 'x' }).run({ action: 'list', days: 14 });
  const on = await emailTool(cfgFor({ lookCloser: true }), () => true, { connect: server.connect, password: 'x' }).run({ action: 'list', days: 14 });
  check('off: only the 15 shown are checked (as before)', /newest 15 shown/.test(off) && !/not shown/.test(off) && !/id 3 looks dangerous/.test(off), off.slice(-500));
  check('on: the 25 not shown are checked too, and the old scams are named by id', /also ran on the 25 messages not shown/.test(on) && /id 3 looks dangerous/.test(on) && /id 7 looks dangerous/.test(on), on.slice(-800));
  check('on: still read-only (BODY.PEEK, no changes)', server.sent.filter((l) => /FETCH/.test(l)).every((l) => /BODY\.PEEK/.test(l)) && !server.sent.some((l) => /\bSTORE\b|\bMOVE\b|\bEXPUNGE\b/.test(l)));
}
check('nothing hidden: no extra line', moreDangerLine([], 15, 15) === '');
check('none flagged among the rest: says so', /no danger signs/.test(moreDangerLine([{ uid: 1, danger: [] }], 15, 16)));

// ---- (3) a declined card keeps the findings ----
check('declined: keep the findings in the answer', /Still give your whole answer/.test(DECLINED_KEEP) && /Don't try it again/.test(DECLINED_KEEP));
check('wired: brain-tool-runs gives that note only with the switch on', /lookCloserOn\(this\.cfg\) \? DECLINED_KEEP : 'The user said no\. Do not try again; say it is fine and ask what to do instead\.'/.test(read('src/brain-tool-runs.js')));

// ---- Help and Settings ----
const ids = new Set(HELP.map((e) => e.id));
check('Help has its page and FAQ', ids.has('look-closer') && ids.has('faq-look-closer'));
check('the glossary has it', /<dt>Look closer before answering<\/dt>/.test(HELP.find((e) => e.id === 'glossary')?.html || ''));
check('the switch is on the Settings page, off by default', /sswitch\('lookCloser', settings\.lookCloser === true, 'Look closer before answering'/.test(publicText('cellar-pages.js')));

try { fs.rmSync(tmp, { recursive: true, force: true }); } catch {}
console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
