// Settings, Jobs (src/job-helps.js, items 51-61): eleven switches for how Bob works through a job, all off unless
// turned on. Plain checks first, then real turns with a scripted brain and stand-in tools (nothing goes online).
import { brainText, publicText } from './source-text.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  JOB_HELPS, cleanJobHelps, jobHelp, steerNote, STEER_LINE, stopAfterStep, timeCheck, receiptBefore, receiptAfter, undoReceipt, pruneReceipts,
  testCommandFor, testsNudge, bigAsk, askFirstNote, keepDenyNote, noteNo, flushNoes, LookCache, cachedLook, keepLook, CACHE_MS,
  sourcesBlock, thinLine, editorUrl, jobHelpsPrompt, afterAnswer, jobHelpsNow, SOFT_STOP_LINE
} from '../src/job-helps.js';
import { findFileLines, receiptHtml, clockText } from '../public/job-helps.js';
import { JobWatch, noteForBig } from '../src/meanwhile.js';
import { mergeSettings } from '../src/config.js';
import { Brain } from '../src/brain.js';
import { GROUPS, CARDS } from '../public/settings-map.js';
import { NOT_BACKED_UP } from '../src/backup.js';
import { HELP } from '../public/help-content.js';
import { settingsNow } from '../src/self-help.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const until = async (f, ms = 4000) => { for (let i = 0; i < ms / 20; i++) { if (f()) return true; await wait(20); } return false; };
const read = (p) => fs.readFileSync(fileURLToPath(new URL(p, import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-jobs-'));

// ---------- The setting ----------
{
  const c = cleanJobHelps({});
  check('every switch starts off', JOB_HELPS.length === 11 && JOB_HELPS.every((k) => c[k] === false));
  check('only true turns one on', cleanJobHelps({ steer: 'true', sources: 1, receipt: true }).receipt === true && cleanJobHelps({ steer: 'true' }).steer === false && cleanJobHelps({ sources: 1 }).sources === false);
  check('time limit: 10 minutes to start, only the listed choices', c.minutes === 10 && cleanJobHelps({ minutes: 30 }).minutes === 30 && cleanJobHelps({ minutes: 7 }).minutes === 10 && cleanJobHelps({ minutes: '1e9' }).minutes === 10);
  check('editor: VS Code to start, only the listed ones', c.editor === 'vscode' && cleanJobHelps({ editor: 'cursor' }).editor === 'cursor' && cleanJobHelps({ editor: 'calc.exe' }).editor === 'vscode');
  check('junk is cleaned', JSON.stringify(cleanJobHelps([1, 2])) === JSON.stringify(c) && JSON.stringify(cleanJobHelps('x')) === JSON.stringify(c));
  check('saved settings are cleaned', mergeSettings({}, { jobHelps: { steer: true, bogus: true, minutes: 5 } }).jobHelps.steer === true && !('bogus' in mergeSettings({}, { jobHelps: { bogus: true } }).jobHelps));
  check('nothing saved means no key', !('jobHelps' in mergeSettings({}, { catName: 'Patches' })));
  check('jobHelp reads the switch', jobHelp({ jobHelps: { sources: true } }, 'sources') && !jobHelp({}, 'sources') && !jobHelp({ jobHelps: { sources: 'yes' } }, 'sources'));
  check('Bob can say what is on', /Jobs \(Settings, Jobs\): all off/.test(jobHelpsNow({})) && /steer, sources; time limit/.test(jobHelpsNow({ jobHelps: { steer: true, sources: true, timeLimit: true } })) === false && /steer, timeLimit, sources; time limit 10 minutes/.test(jobHelpsNow({ jobHelps: { steer: true, sources: true, timeLimit: true } })));
  check('his settings list includes it', settingsNow({}).includes('Jobs (Settings, Jobs): all off'));
}

// ---------- 51 Steer him mid-job ----------
{
  const fake = (on = true) => {
    const b = { cfg: { jobHelps: { steer: on } }, watch: new JobWatch(), queue: [{ id: 'j1', sessionId: 's1', state: 'working', text: 'Build the album' }], said: [], log() {}, broadcast(e) { b.said.push(e); } };
    b.watch.start({ id: 'j1', text: 'Build the album' });
    return b;
  };
  let b = fake();
  const r = steerNote(b, 's1', 'use the 2024 photos only');
  check('a message in the job\'s chat goes to the job', r?.steered === true && r.answered === STEER_LINE('use the 2024 photos only') && b.watch.job.notes[0].text === 'use the 2024 photos only' && b.watch.job.notes[0].direct === true);
  await wait(5);
  check('the chat gets the 📨 line at once', b.said.some((e) => e.type === 'busy-note' && e.sessionId === 's1' && /📨 Got it/.test(e.text)));
  check('the big brain is told it was typed in the chat', /typed in the chat while you work/.test(noteForBig(b.watch.job.notes, 'Sam')) && /passed along by your Quick brain/.test(noteForBig([{ text: 'x' }], 'Sam')));
  check('another chat waits as usual', steerNote(fake(), 's2', 'hello') === null);
  check('off: waits as usual', steerNote(fake(false), 's1', 'hello') === null);
  check('a guest (Discord, Telegram) never steers', steerNote(fake(), 's1', 'hello', [], { guest: { from: 'x' } }) === null);
  check('a message with a picture waits', steerNote(fake(), 's1', 'this one', ['ref1']) === null);
  check('"how\'s it going?" goes to the Quick brain while that\'s on', steerNote(fake(), 's1', "how's it going?", [], {}, { asksAboutJob: () => true, meanwhile: true }) === null);
  b = fake(); for (const t of ['a', 'b', 'c']) steerNote(b, 's1', t);
  check('a fourth note waits behind the job', steerNote(b, 's1', 'd') === null && b.watch.job.notes.length === 3);
  const side = fake(); side.queue[0].side = true;
  check('a quick side reply is never steered', steerNote(side, 's1', 'x') === null);
}

// ---------- 52 Stop after this step ----------
{
  const job = { id: 't1', state: 'working' };
  const b = { turns: new Map([['talk', { turnId: 't1' }]]), queue: [job], log() {} };
  check('it marks the running job', stopAfterStep(b) === true && job.stopAfter === true);
  check('a different job id is left alone', stopAfterStep(b, 'other') === false);
  check('nothing running: nothing to stop', stopAfterStep({ turns: new Map(), queue: [] }) === false);
}

// ---------- 53 A time limit per job ----------
{
  let t = 1_000_000, asked = 0, answer = true;
  const events = [];
  const b = { cfg: { jobHelps: { timeLimit: true, minutes: 5 } }, log() {}, approve: async (need) => { asked++; events.push(need); return answer; }, answerApproval() {} };
  const ctx = { job: { id: 'j', startedAt: t }, emit: (e) => events.push(e), signal: new AbortController().signal };
  check('within the time: carry on, and the bar starts', await timeCheck(b, ctx, { now: () => t }) === 'go' && events.some((e) => e.type === 'job-clock' && e.endsAt === t + 300000));
  t += 301000;
  check('time up: a card asks for more, Allow gives the same again', await timeCheck(b, ctx, { now: () => t }) === 'go' && asked === 1 && /keep going for 5 more minutes/.test(events.find((e) => typeof e === 'string')) && ctx.timeEnds === t + 300000);
  t += 301000; answer = false;
  check('Deny (or no answer): he wraps up', await timeCheck(b, ctx, { now: () => t }) === 'wrap' && ctx.timeUp === true && events.some((e) => e?.type === 'job-clock' && e.done));
  check('off, a side reply or a guest: no limit', await timeCheck({ cfg: {} }, { job: {} }) === 'go' && await timeCheck(b, { job: { side: true } }) === 'go' && await timeCheck(b, { job: { guest: {} } }) === 'go');
}

// ---------- 54 A receipt at the end of a job ----------
{
  const dataDir = path.join(tmp, 'inn', 'bob');
  const b = { cfg: { dataDir, jobHelps: { receipt: true } }, tools: { run_command: { summary: (a) => `run ${a.cmd} ${(a.args || []).join(' ')}` } }, log() {} };
  const file = path.join(tmp, 'notes.txt'); fs.writeFileSync(file, 'old words');
  const ctx = { job: { id: 'j' } };
  const before = receiptBefore(b, 'edit_file', { path: file }, ctx);
  fs.writeFileSync(file, 'new words');
  receiptAfter(b, 'edit_file', { path: file }, { text: `Edited ${file}.` }, ctx, before);
  receiptAfter(b, 'run_command', { cmd: 'npm', args: ['test'] }, { text: 'Exit code 0' }, ctx);
  receiptAfter(b, 'fetch_page', { url: 'https://example.com/a' }, { text: 'page text' }, ctx);
  receiptAfter(b, 'fetch_page', { url: 'https://example.com/a' }, { text: 'page text' }, ctx);
  receiptAfter(b, 'write_file', { path: '/x' }, { text: 'The user said no. Do not try again.' }, ctx);
  const items = ctx.receipt || [];
  check('files changed, commands run and pages read, each once', items.length === 3 && items[0].kind === 'file' && items[0].what === 'Edited' && items[0].undo && items[1].text === 'run npm test' && items[2].url === 'https://example.com/a', JSON.stringify(items));
  check('a step you said no to is not on it', !items.some((i) => i.path === '/x'));
  const r = undoReceipt(b.cfg, items[0].undo);
  check('Undo puts the file back as it was', r.restored === true && fs.readFileSync(file, 'utf8') === 'old words');
  let msg = ''; try { undoReceipt(b.cfg, items[0].undo); } catch (e) { msg = e.message; }
  check('the same Undo twice: too old', /too old/.test(msg));
  // A file changed since: left alone.
  const ctx2 = { job: { id: 'j' } };
  const b2 = receiptBefore(b, 'write_file', { path: file }, ctx2); fs.writeFileSync(file, 'bob wrote'); receiptAfter(b, 'write_file', { path: file }, { text: 'Saved.' }, ctx2, b2);
  fs.writeFileSync(file, 'you changed it');
  msg = ''; try { undoReceipt(b.cfg, ctx2.receipt[0].undo); } catch (e) { msg = e.message; }
  check('a file changed since is left as it is', /changed since/.test(msg) && fs.readFileSync(file, 'utf8') === 'you changed it');
  // A file Bob created goes to his backups, never deleted for good.
  const made = path.join(tmp, 'made.txt');
  const ctx3 = { job: { id: 'j' } };
  const b3 = receiptBefore(b, 'write_file', { path: made }, ctx3); fs.writeFileSync(made, 'hi'); receiptAfter(b, 'write_file', { path: made }, { text: 'Saved.' }, ctx3, b3);
  const u3 = undoReceipt(b.cfg, ctx3.receipt[0].undo);
  check('a created file goes to the backups folder', ctx3.receipt[0].what === 'Created' && u3.restored === false && !fs.existsSync(made) && fs.readdirSync(path.join(dataDir, 'backups', 'undone')).some((n) => n.endsWith('made.txt')));
  msg = ''; try { undoReceipt(b.cfg, '../../settings'); } catch (e) { msg = e.message; }
  check('an odd id is refused', /too old/.test(msg));
  check('off: no receipt', (() => { const c = { job: {} }; receiptAfter({ cfg: { dataDir } }, 'fetch_page', { url: 'https://a.b' }, { text: 'x' }, c); return !c.receipt; })());
  check('a guest job gets no receipt', (() => { const c = { job: { guest: {} } }; receiptAfter(b, 'fetch_page', { url: 'https://a.b' }, { text: 'x' }, c); return !c.receipt; })());
  check('the undo records are never backed up', NOT_BACKED_UP.includes('bob/receipts/'));
  fs.utimesSync(path.join(dataDir, 'receipts', `${ctx2.receipt[0].undo}.json`), new Date(0), new Date(0));
  pruneReceipts(b.cfg);
  check('old undo records go after a week', !fs.existsSync(path.join(dataDir, 'receipts', `${ctx2.receipt[0].undo}.json`)));
  const html = receiptHtml([{ kind: 'file', what: 'Edited', path: 'C:\\a<b>.js', undo: 'abc123def456' }, { kind: 'page', what: 'Read', url: 'https://x.y/"' }]);
  check('the card says what it holds and escapes names', /1 file changed, 1 page read/.test(html) && /a&lt;b&gt;/.test(html) && /data-jh-undo="abc123def456"/.test(html) && !/"https:\/\/x.y\/""/.test(html));
  check('away from the computer: no Open or Undo', !/data-jh-/.test(receiptHtml([{ kind: 'file', what: 'Edited', path: 'a', undo: 'abcdefabcdef' }], { local: false })));
}

// ---------- 55 Run the tests after code edits ----------
{
  const files = { '/p/package.json': '{"scripts":{"test":"node test.js"}}', '/q/package.json': '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}', '/r/Cargo.toml': '', '/s/.git': '', '/t/pyproject.toml': '[tool.pytest.ini_options]' };
  const fake = { exists: (f) => f.replace(/\\/g, '/') in files || f.replace(/\\/g, '/').replace(/^[A-Z]:/, '') in files, read: (f) => files[f.replace(/\\/g, '/').replace(/^[A-Z]:/, '')] };
  const at = (f) => testCommandFor(f, fake);
  check('npm test in a project with a test script', at('/p/src/a.js')?.cmd === 'npm' && path.resolve(at('/p/src/a.js').root) === path.resolve('/p'));
  check('the npm placeholder script is not a test', at('/q/a.js') === null);
  check('cargo, pytest', at('/r/src/main.rs')?.cmd === 'cargo' && at('/t/x.py')?.args.join(' ') === '-m pytest -q');
  check('stops at the top of the repository', at('/s/a.js') === null);
  check('a text file is not code', at('/p/readme.md') === null);
  const b = { cfg: { userName: 'Sam', jobHelps: { runTests: true } }, usable: () => true, log() {} };
  const ctx = { job: {}, codeEdits: ['/p/src/a.js'], testedAfterEdit: false };
  const note = testsNudge(b, ctx, { find: at });
  check('after an edit: one note to run them, asking first', /cmd "npm", args \["test"\]/.test(note) && /Sam sees the exact command and says yes first/.test(note) && ctx.testsNudged);
  check('only once a turn', testsNudge(b, ctx, { find: at }) === '');
  check('tests already run after the edit: no note', testsNudge(b, { job: {}, codeEdits: ['/p/a.js'], testedAfterEdit: true }, { find: at }) === '');
  check('no Run Hand: no note', testsNudge({ ...b, usable: () => false }, { job: {}, codeEdits: ['/p/a.js'], testedAfterEdit: false }, { find: at }) === '');
  check('off: no note', testsNudge({ ...b, cfg: {} }, { job: {}, codeEdits: ['/p/a.js'], testedAfterEdit: false }, { find: at }) === '');
  const c2 = {}; receiptAfter({ cfg: {} }, 'edit_file', { path: '/p/a.js' }, { text: 'Edited.' }, c2);
  check('an edit is tracked even with the receipt off', c2.codeEdits?.length === 1 && c2.testedAfterEdit === false);
  receiptAfter({ cfg: {} }, 'run_command', { cmd: 'npm' }, { text: 'ok' }, c2);
  check('a command after it counts as tested', c2.testedAfterEdit === true);
}

// ---------- 56 One question before a vague big job ----------
{
  check('a big ask: a doing word and some length, or Medium effort and up', bigAsk('Clean up my photos folder for me please', {}) && bigAsk('fix the site', { effort: 'high' }) && !bigAsk('fix it', {}) && !bigAsk('what is the capital of France', { effort: 'high' }));
  const b = { cfg: { userName: 'Sam', jobHelps: { askFirst: true } }, tools: { ask_user: {} } };
  check('his note says ask once, with ask_user, only if it could mean two things', /call ask_user once now/.test(askFirstNote(b, { job: {} }, 'Clean up my photos folder for me please')) && /If the ask is clear, don't ask/.test(askFirstNote(b, { job: {} }, 'Clean up my photos folder for me please')));
  check('no ask_user tool, a small ask, a guest or off: no note', askFirstNote({ ...b, tools: {} }, { job: {} }, 'Clean up my photos folder please') === '' && askFirstNote(b, { job: {} }, 'hi there') === '' && askFirstNote(b, { job: { guest: {} } }, 'Clean up my photos folder please') === '' && askFirstNote({ ...b, cfg: {} }, { job: {} }, 'Clean up my photos folder please') === '');
}

// ---------- 57 Remember a "no" ----------
{
  const b = { cfg: { userName: 'Sam', jobHelps: { rememberNo: true } }, tools: { write_file: { summary: (a) => `write ${a.path}` } } };
  const ctx = { job: {} };
  keepDenyNote(b, 'not on the desktop');
  noteNo(b, ctx, 'write_file', { path: 'C:/Desktop/a.txt' }, 'The user said no. Do not try again; say it is fine and ask what to do instead.');
  check('a no is kept, with the reason typed on the card', ctx.noes.length === 1 && /Sam said no to: write C:\/Desktop\/a.txt \(their reason: "not on the desktop"\)/.test(ctx.noes[0]) && /rest of this chat/.test(ctx.noes[0]));
  check('the reason is used once', b.denyNote === null);
  noteNo(b, ctx, 'write_file', { path: 'b' }, 'Saved b.');
  check('a yes is not a no', ctx.noes.length === 1);
  const msgs = [];
  check('it goes into the chat after the round, hidden, so it lasts', flushNoes(ctx, msgs) === 1 && msgs[0].role === 'system' && msgs[0].hidden && ctx.noes.length === 0);
  const off = { job: {} }; noteNo({ cfg: {} }, off, 'write_file', {}, 'The user said no.');
  check('off: nothing kept', !off.noes);
}

// ---------- 58 Reuse look-ups ----------
{
  let t = 0;
  const c = new LookCache({ now: () => t });
  c.put('web_search', { query: 'Moon size ' }, '1. Moon');
  check('the same look-up within the hour', c.get('web_search', { query: 'moon size' })?.text === '1. Moon');
  t = CACHE_MS + 1;
  check('not after an hour', c.get('web_search', { query: 'moon size' }) === null);
  c.put('fetch_page', { url: 'https://a.b' }, 'Error: 404');
  check('a failed look-up is never kept', c.get('fetch_page', { url: 'https://a.b' }) === null);
  const events = [];
  const b = { cfg: { jobHelps: { lookupCache: true } }, tools: { web_search: { summary: (a) => `search: ${a.query}` } }, log() {}, lookCache: new LookCache({ now: () => 60000 * 5 }) };
  b.lookCache.now = () => 0; keepLook(b, 'web_search', { query: 'cats' }, { text: '1. Cats' }); b.lookCache.now = () => 5 * 60000;
  const hit = cachedLook(b, 'web_search', { query: 'cats' }, { emit: (e) => events.push(e) });
  check('a repeat says it is from 5 minutes ago, and the chat shows it', /From the same look-up 5 minutes ago/.test(hit?.text) && /1\. Cats/.test(hit.text) && events.some((e) => e.type === 'tool' && /search: cats \(from 5 minutes ago\)/.test(e.summary)));
  check('off: always the web', cachedLook({ ...b, cfg: {} }, 'web_search', { query: 'cats' }, {}) === null);
  check('only searches and pages', cachedLook(b, 'run_command', { cmd: 'x' }, {}) === null);
}

// ---------- 59 Sources, 60 How sure ----------
{
  const ctx = { job: {} };
  receiptAfter({ cfg: {} }, 'web_search', { query: 'q' }, { text: '1. The Moon - Wiki\n   https://en.wikipedia.org/wiki/Moon\n   snippet' }, ctx);
  receiptAfter({ cfg: {} }, 'fetch_page', { url: 'https://en.wikipedia.org/wiki/Moon' }, { text: 'The Moon is...' }, ctx);
  receiptAfter({ cfg: {} }, 'fetch_page', { url: 'https://nasa.gov/moon' }, { text: 'Error: 404' }, ctx);
  const src = sourcesBlock(ctx.web);
  check('numbered links to the pages he read, with their titles', /\*\*Sources\*\*\n1\. \[The Moon - Wiki\]\(https:\/\/en\.wikipedia\.org\/wiki\/Moon\)/.test(src) && !/nasa/.test(src), src);
  check('no pages read: no sources', sourcesBlock({ pages: [] }) === '');
  check('pages read: not thin', thinLine(ctx.web) === '');
  check('snippets only: one line saying so', /only saw search snippets/.test(thinLine({ searches: 2, empty: 0, pages: [] })));
  check('every search empty: one line saying so', /searches came back empty/.test(thinLine({ searches: 1, empty: 1, pages: [] })));
  check('no look-ups at all: nothing', thinLine(undefined) === '' && thinLine({ searches: 0, empty: 0, pages: [] }) === '');
  const events = [];
  const reply = { content: 'The Moon is 3,474 km across.' };
  afterAnswer({ cfg: { jobHelps: { sources: true, howSure: true } }, log() {} }, { ...ctx, emit: (e) => events.push(e) }, reply);
  check('sources go under the answer and stay in the chat', /\*\*Sources\*\*/.test(reply.content) && events.some((e) => e.type === 'token' && /Sources/.test(e.text)));
  const r2 = { content: "I'm not sure, but about 3,474 km." };
  afterAnswer({ cfg: { jobHelps: { howSure: true } } }, { job: {}, web: { searches: 1, empty: 0, pages: [] }, emit() {} }, r2);
  check('he already said how sure: no second line', !/How sure/.test(r2.content));
  const r3 = { content: 'Hi.' };
  afterAnswer({ cfg: { jobHelps: { sources: true, howSure: true } } }, { job: { guest: {} }, web: ctx.web, emit() {} }, r3);
  check('a guest gets neither', r3.content === 'Hi.');
  check('his instructions get the how-sure and file:line lines only while on', /how sure you are/.test(jobHelpsPrompt({ jobHelps: { howSure: true } }, {})) && /full path and the line/.test(jobHelpsPrompt({ jobHelps: { fileLinks: true } }, {})) && jobHelpsPrompt({}, {}) === '' && jobHelpsPrompt({ jobHelps: { howSure: true } }, { guest: {} }) === '');
}

// ---------- 61 Clickable file:line links ----------
{
  const hits = findFileLines('See C:\\work\\app\\main.js:42 and /home/me/app/src/x.py:7:3, not http://a.com/b.js:3, 10:30 or v1.2:3');
  check('Windows and Mac/Linux paths with a line', hits.length === 2 && hits[0].file === 'C:\\work\\app\\main.js' && hits[0].line === 42 && hits[1].file === '/home/me/app/src/x.py' && hits[1].line === 7, JSON.stringify(hits));
  check('the editor address', editorUrl('vscode', 'C:\\work\\a b.js', 42) === 'vscode://file/C:/work/a%20b.js:42' && editorUrl('cursor', '/home/me/x.py', 7) === 'cursor://file/home/me/x.py:7' && editorUrl('system', '/a.js', 1) === '' && editorUrl('evil', '/a.js', 1) === '');
  check('a # or ? in a name can\'t cut the address short', !/[#?]/.test(editorUrl('vscode', '/a#b?c.js', 1)));
  check('the time bar\'s words', clockText(10 * 60000, 0) === '10 minutes left for this job' && clockText(30000, 0) === 'Under a minute left for this job' && clockText(0, 5) === 'Time is up for this job');
}

// ---------- Wiring (read from the source) ----------
{
  const brainSrc = brainText(), server = read('../src/server.js'), cellar = publicText('cellar.js'), app = publicText('app.js'), main = read('../electron/main.cjs'), phone = read('../android/app/src/main/assets/www/phone.js');
  check('enqueue steers before anything else answers', brainSrc.indexOf('steerNote(this, sessionId') > 0 && brainSrc.indexOf('steerNote(this, sessionId') < brainSrc.indexOf('const quickAnswer = this.jobAnswer('));
  check('the tools go through the receipt, the cache and the no', /cachedLook\(this, name, args, ctx\) \|\| await (?:(?:inChangeTurn|inTurn)\(scope, async \(\) => \{ try \{ return await )?this\.runToolNow/.test(brainSrc) && /receiptAfter\(this, name, args, res, ctx, before\)/.test(brainSrc) && /noteNo\(this, ctx, name, args, res\?\.text\)/.test(brainSrc));
  check('the server saves it and has the three routes', /jobHelps: cleanJobHelps\(cfg\.jobHelps\)/.test(server) && /p === '\/api\/stop-after'/.test(server) && /p === '\/api\/jobs\/undo'/.test(server) && /p === '\/api\/open-at'/.test(server));
  check('Undo and open-at only on this replicant matrix', /\(p === '\/api\/jobs\/undo' \|\| p === '\/api\/open-at'\)\) \{\n\s+if \(!isLocal\) return send\(res, 403/.test(server));
  check('the reason typed on Deny is kept', /if \(allow === false && typeof note === 'string' && note\.trim\(\)\) keepDenyNote\(brain, note\)/.test(server));
  check('Settings has a Jobs panel with eleven switches, off unless turned on', /\['jobs', '🔁 Jobs'/.test(cellar) && (cellar.match(/\$\{sw\('/g) || []).length === 11 && /j\[k\] === true/.test(cellar));
  check('the panel is in How Bob works and the Bob group', CARDS.find((c) => c.id === 'how').topics.includes('adv-jobs') && GROUPS.find(([g]) => g === 'Bob')[1].includes('adv-jobs') && CARDS.every((c) => c.about.length <= 70));
  check('the chat draws the bar, the receipt, Stop after this step and the links', /jobHelps\.event\(ev\)/.test(app) && /jobHelps\.busy\(b\)/.test(app) && /jobHelps\.links\(el\)/.test(app) && /jobHelps\.whyBox\(\)/.test(app));
  check('the window only opens editor addresses', /openUrl: \(url\) => \(\/\^\(\?:vscode\|cursor\|vscodium\):/.test(main));
  check('the phone shows the receipt as text', /ev\.type === 'receipt'/.test(phone));
  const help = HELP.find((e) => e.id === 'settings-jobs');
  const labels = ['Steer Bob mid-job', 'Show Stop after this step', 'Give each job a time limit', 'Show a receipt after each job', 'Run the tests after code edits', 'Ask one question before a vague big job', 'Remember a no for the whole chat', 'Reuse look-ups for an hour', 'Show sources under web answers', 'Say how sure Bob is', 'Make file:line links clickable'];
  check('Help explains every switch, in the words on screen', help && labels.every((l) => help.html.includes(l) && cellar.includes(`'${l}'`)), labels.filter((l) => !help?.html.includes(l)).join(' | '));
  check('Help says where it works', /Windows, Mac and Linux/.test(help.html) && /Android/.test(help.html));
  const glossary = HELP.find((e) => e.id === 'glossary').html;
  check('glossary and FAQ entries', ['<dt>Receipt</dt>', '<dt>Stop after this step</dt>', '<dt>Steer (mid-job)</dt>', '<dt>file:line link</dt>', '<dt>Time limit (job)</dt>'].every((d) => glossary.includes(d)) && ['faq-steer', 'faq-receipt', 'faq-sources'].every((id) => HELP.some((e) => e.id === id && e.group === 'FAQ')));
}

// ---------- Real turns, with a scripted brain and stand-in tools ----------
const agentDir = path.join(tmp, 'Agent'), innDir = path.join(agentDir, 'inn'), dataDir = path.join(innDir, 'bob');
fs.mkdirSync(dataDir, { recursive: true });
const cfg = { agentDir, innDir, dataDir, settingsFile: path.join(dataDir, 'settings.json'), readRoots: [innDir], readOnlyRoots: [], recycleBin: false, userName: 'Sam',
  models: { bob: 'small:latest' }, engine: 'ollama', ollamaUrl: 'http://127.0.0.1:1', session: 'normal', autoSession: false, webSearch: true, jobHelps: cleanJobHelps({}) };
const events = [];
let autoYes = false; // the tests-after-edits turn: its OK cards are answered Allow
const brain = new Brain(cfg, (ev) => { events.push(ev); if (autoYes && ev.type === 'approval') setTimeout(() => brain.answerApproval(ev.id, true), 0); });
clearInterval(brain.reminderTimer);
brain.ensureModel = async () => {}; brain.fitCtx = async () => 8192; brain.recall = async () => '';
let pageReads = 0;
brain.tools.fetch_page = { ...brain.tools.fetch_page, run: async ({ url }) => { pageReads++; return `Page text of ${url}`; } };
brain.tools.web_search = { ...brain.tools.web_search, run: async ({ query }) => `1. About ${query}\n   https://example.org/${encodeURIComponent(query)}\n   snippet` };
const seen = [];
let script = [];
let onCall = null;
brain.engine = { chat: async ({ tools, messages }) => { seen.push({ names: tools.map((t) => t.function.name), messages }); const f = onCall; onCall = null; f?.(); return script.shift() || { role: 'assistant', content: 'done' }; },
  unloadAll: async () => [], loaded: async () => [], unload: async () => [] };
const call = (name, args = {}) => ({ role: 'assistant', content: '', tool_calls: [{ function: { name, arguments: args } }] });
const run = async (text, sid = 'main') => { const { jobId } = brain.enqueue(sid, text, [], 'low'); await until(() => ['done', 'failed', 'cancelled'].includes(brain.queue.find((j) => j.id === jobId)?.state)); return brain.queue.find((j) => j.id === jobId); };
{
  // Everything off: the loop is as it was.
  seen.length = 0; events.length = 0;
  script = [call('fetch_page', { url: 'https://example.org/a' }), { role: 'assistant', content: 'It says hello.' }];
  await run('read https://example.org/a for me please and sum it up');
  const last = brain.session('main').at(-1);
  check('off: no sources, no receipt, no time bar', last.content === 'It says hello.' && !events.some((e) => ['receipt', 'job-clock'].includes(e.type)));
}
{
  // Sources, receipt, look-ups again within the hour.
  brain.cfg.jobHelps = cleanJobHelps({ sources: true, receipt: true, lookupCache: true, timeLimit: true });
  seen.length = 0; events.length = 0; pageReads = 0;
  script = [call('fetch_page', { url: 'https://example.org/b' }), call('fetch_page', { url: 'https://example.org/b', part: 1 }), { role: 'assistant', content: 'Here is what it says.' }];
  await run('what does example.org/b say about the moon');
  const last = brain.session('main').at(-1);
  check('sources under the answer, kept in the chat', /\*\*Sources\*\*\n1\. \[example\.org\]\(https:\/\/example\.org\/b\)/.test(last.content), last.content);
  check('the receipt card lists the page', events.some((e) => e.type === 'receipt' && e.items.some((i) => i.url === 'https://example.org/b')));
  check('the time bar starts and ends with the job', events.some((e) => e.type === 'job-clock' && e.endsAt) && events.some((e) => e.type === 'job-clock' && e.done));
  seen.length = 0; pageReads = 0;
  script = [call('fetch_page', { url: 'https://example.org/b' }), { role: 'assistant', content: 'Same as before.' }];
  await run('read example.org/b again');
  check('the same page within the hour is not read from the web again', pageReads === 0 && seen[1]?.messages.some((m) => m.role === 'tool' && /From the same look-up/.test(m.content)));
}
{
  // Stop after this step: the step finishes, then he answers with no tools.
  brain.cfg.jobHelps = cleanJobHelps({ softStop: true });
  seen.length = 0; events.length = 0;
  script = [call('web_search', { query: 'moon' }), call('web_search', { query: 'sun' }), { role: 'assistant', content: 'I found the moon; the sun is left.' }];
  onCall = () => stopAfterStep(brain);
  await run('look up the moon then the sun then the stars for me');
  check('the running step finishes and keeps its result', seen[1]?.messages.some((m) => m.role === 'tool' && /About moon/.test(m.content)));
  check('then no more tools, and he is told why', seen[1]?.names.length === 0 && seen[1].messages.some((m) => m.role === 'system' && /pressed "Stop after this step"/.test(m.content)) && events.some((e) => e.type === 'announce' && e.text === SOFT_STOP_LINE));
}
{
  // Steer him mid-job: a message typed in the chat reaches the job at its next step, not after it.
  brain.cfg.jobHelps = cleanJobHelps({ steer: true });
  seen.length = 0; events.length = 0;
  script = [call('web_search', { query: 'paint' }), { role: 'assistant', content: 'Blue it is.' }];
  let steered = null;
  onCall = () => { steered = brain.enqueue('main', 'make it blue, not red'); };
  await run('find me a paint colour for the kitchen please');
  check('the message is answered at once, not queued', steered?.steered === true && steered.jobId === null);
  check('the job reads it before its next step', seen[1]?.messages.some((m) => m.role === 'system' && /make it blue, not red/.test(m.content) && /typed in the chat/.test(m.content)));
}
{
  // Remember a no: the card's Deny with a reason stays in the chat.
  brain.cfg.jobHelps = cleanJobHelps({ rememberNo: true });
  // A test-only tool, in no group: offered by having every tool on (Nov 12, item 173: a tool this job can't be offered doesn't run).
  brain.cfg.allTools = true;
  brain.tools.tidy_desk = { schema: { type: 'function', function: { name: 'tidy_desk', description: 'Tidy the desk', parameters: { type: 'object', properties: {}, required: [] } } }, check: () => 'tidy your desk', run: async () => 'Tidied.', summary: () => 'tidy the desk' };
  seen.length = 0; events.length = 0;
  script = [call('tidy_desk'), { role: 'assistant', content: 'OK, I left it.' }];
  const done = run('tidy my desk please, the whole thing');
  await until(() => events.some((e) => e.type === 'approval'));
  const card = events.find((e) => e.type === 'approval');
  keepDenyNote(brain, 'I like the mess');
  brain.answerApproval(card.id, false);
  await done;
  check('the no and its reason stay in the chat, hidden', brain.session('main').some((m) => m.role === 'system' && m.hidden && /Sam said no to: tidy the desk \(their reason: "I like the mess"\)/.test(m.content)));
  delete brain.tools.tidy_desk;
  brain.cfg.allTools = false;
}
{
  // Run the tests after code edits: an edit in a project with tests gets one note before he says done.
  const proj = path.join(innDir, 'proj'); fs.mkdirSync(path.join(proj, 'src'), { recursive: true });
  fs.writeFileSync(path.join(proj, 'package.json'), '{"scripts":{"test":"node t.js"}}'); fs.writeFileSync(path.join(proj, 'src', 'a.js'), 'let a = 1;\n');
  brain.cfg.jobHelps = cleanJobHelps({ runTests: true }); brain.cfg.projects = { proj };
  const offWas = brain.offTools; brain.offTools = () => new Set(); // the Run Hand on, for this turn
  brain.tools.run_command = { schema: { type: 'function', function: { name: 'run_command', description: 'Run', parameters: { type: 'object', properties: { cmd: { type: 'string' } }, required: ['cmd'] } } }, run: async () => 'Exit code 0. All passed.', summary: (a) => `run ${a.cmd}` };
  seen.length = 0; events.length = 0; autoYes = true;
  script = [call('write_file', { path: path.join(proj, 'src', 'a.js'), content: 'let a = 2;\n' }), { role: 'assistant', content: 'Changed it.' }, call('run_command', { cmd: 'npm', args: ['test'], cwd: proj }), { role: 'assistant', content: 'Changed it, and the tests pass.' }];
  await run('change a to 2 in my project src/a.js');
  check('he is asked to run the tests before he says done', seen.some((s) => s.messages.some((m) => m.role === 'system' && /Run its tests with run_command \(cmd "npm"/.test(m.content))));
  check('and his last word comes after the tests', /tests pass/.test(brain.session('main').at(-1).content));
  delete brain.tools.run_command;
  brain.offTools = offWas; autoYes = false;
}
brain.cfg.jobHelps = cleanJobHelps({});
fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
