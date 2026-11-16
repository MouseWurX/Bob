// The end-of-turn checks from the real-jobs reads (src/answer-checks.js), the citation markers taken out of shown
// answers, the own-folder guard on file moves, the fetch_page link check, and how verify.js afterTurn uses them.
// The examples are the shapes seen in the 800-job Qwen read, the 45-job GPT-OSS trial and the live inbox run.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { answerChecks, filesNamed, stripMarkers } from '../src/answer-checks.js';
import { afterTurn } from '../src/verify.js';
import { guardPath } from '../src/hands-files.js';

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { ok ? pass++ : fail++; console.log(`${ok ? 'PASS' : 'FAIL'} ${name}${extra && !ok ? ' -> ' + extra : ''}`); };
const throws = (f, re) => { try { f(); return false; } catch (e) { return re ? re.test(e.message) : true; } };
const kinds = (o) => answerChecks(o).map((c) => c.kind);
const has = (o, k) => kinds(o).includes(k);
const act = (name, args = {}, text = 'ok', ok = true) => ({ name, args: JSON.stringify(args), ok, text });

// ---------- filesNamed ----------
check('names a path and a bare file', (() => { const f = filesNamed('Open C:\\Users\\you\\Documents\\budget.xlsx and db.py'); return f.includes('C:\\Users\\you\\Documents\\budget.xlsx') && f.includes('db.py'); })());
check('a file he is asked to make is not "named"', filesNamed('save it as summary.txt').length === 0);

// ---------- look_first ----------
check('bare file never looked for -> look_first', has({ text: 'What does notes.txt say about Tuesday?', reply: 'Could you paste notes.txt here? I can\'t see it.' }, 'look_first'));
check('bare file read -> quiet', !has({ text: 'What does notes.txt say about Tuesday?', reply: 'It says the meeting moved.', actions: [act('read_file', { path: 'notes.txt' })] }, 'look_first'));
check('path that exists but untouched -> look_first', has({ text: 'Summarise C:\\Data\\q3.csv', reply: 'I can\'t open that file.', exists: () => true }, 'look_first'));
check('"my log" + asks where, no tools -> look_first', has({ text: 'Why does my error log keep growing?', reply: 'Where is the log saved? Please share the path.' }, 'look_first'));
check('a Hand that is off is an honest blocker -> quiet', !has({ text: 'Why does my error log keep growing?', reply: 'The Files Hand is off. Switch it on in Settings and I\'ll look. Where is the log?' }, 'look_first'));
check('no file tools usable -> quiet', !has({ text: 'What does notes.txt say?', reply: 'Paste it?', usable: (n) => !/read_file|list_folder|search_files/.test(n) }, 'look_first'));

// ---------- said_done (GPT-OSS #4) ----------
const noForget = act('forget_topic', { topic: 'cats' }, 'There is no note about "cats" to forget.');
check('tool said nothing to forget, answer says forgotten -> said_done', has({ text: 'forget what I said about cats', reply: 'Done, it is forgotten.', actions: [noForget] }, 'said_done'));
check('honest "there was no note" -> quiet', !has({ text: 'forget what I said about cats', reply: 'There was no note about cats, so nothing to forget.', actions: [noForget] }, 'said_done'));
check('a later good try clears it', !has({ text: 'forget cats', reply: 'Done, it is forgotten.', actions: [noForget, act('forget_topic', { topic: 'cat' }, 'Forgot 1 note.')] }, 'said_done'));
check('said_done is a claim', answerChecks({ text: 'forget cats', reply: 'Done, it is forgotten.', actions: [noForget] }).find((c) => c.kind === 'said_done')?.claim === true);

// ---------- memory_claim / page_claim ----------
check('"I\'ve noted that you..." without remember -> memory_claim', has({ text: 'I am vegetarian', reply: 'I\'ve noted that you are vegetarian.' }, 'memory_claim'));
check('with remember -> quiet', !has({ text: 'I am vegetarian', reply: 'I\'ve noted that you are vegetarian.', actions: [act('remember', { fact: 'vegetarian' })] }, 'memory_claim'));
check('"opened the site, it loads fine" with no page read -> page_claim', has({ text: 'is example.com up?', reply: 'I opened the site and it loads fine.' }, 'page_claim'));
check('with fetch_page -> quiet', !has({ text: 'is example.com up?', reply: 'I opened the site and it loads fine.', actions: [act('fetch_page', { url: 'https://example.com' })] }, 'page_claim'));

// ---------- unseen (GPT-OSS #1) ----------
check('"the hash provided above" after a tool -> unseen', has({ text: 'hash this file', reply: 'Use the hash provided above to check it.', actions: [act('inspect_file', { path: 'a.exe' })] }, 'unseen'));
check('no tool ran -> quiet', !has({ text: 'what is a hash', reply: 'See the list shown above.' }, 'unseen'));

// ---------- cut_off ----------
check('stops at "Here are the reasons:" -> cut_off', has({ text: 'why?', reply: 'There are a few reasons. Here are the reasons:' }, 'cut_off'));
check('stops at "**1." -> cut_off', has({ text: 'steps?', reply: 'Here you go.\n\n**1.' }, 'cut_off'));
check('open code block -> cut_off', has({ text: 'code?', reply: 'Here:\n```js\nconst a = 1;' }, 'cut_off'));
check('a finished answer -> quiet', !has({ text: 'why?', reply: 'Because the cache was full. Clearing it fixed it.' }, 'cut_off'));
check('a closed code block -> quiet', !has({ text: 'code?', reply: 'Here:\n```js\nconst a = 1;\n```' }, 'cut_off'));

// ---------- one_search (GPT-OSS #22) ----------
const longReply = 'The studies show '.repeat(30);
const research = 'Research the evidence on four-day work weeks and compare what the studies found about output';
check('research answered after one search -> one_search', has({ text: research, reply: longReply, actions: [act('web_search', { q: 'four day week' })] }, 'one_search'));
check('two searches -> quiet', !has({ text: research, reply: longReply, actions: [act('web_search', { q: 'a' }), act('fetch_page', { url: 'https://x.org' })] }, 'one_search'));

// ---------- maths (Qwen: 875.75 written for 775.75) ----------
const sums = 'Add up my bills: rent 600, phone 45.75, power 130';
check('a total worked out in his head -> maths', has({ text: sums, reply: 'Your total comes to $875.75.' }, 'maths'));
check('the total with calculate -> quiet', !has({ text: sums, reply: 'Your total comes to $775.75.', actions: [act('calculate', { expr: '600+45.75+130' }, '775.75')] }, 'maths'));
check('a total read off the request -> quiet', !has({ text: 'The invoice total is 340. Is the total right for 4 items?', reply: 'The total is 340, as printed.' }, 'maths'));

// ---------- mail_route (live inbox run, 16 Nov) ----------
const trash = 'Trash every email from deals@shop.example in my inbox';
check('mail job that wandered into files -> mail_route', (() => { const c = answerChecks({ text: trash, reply: 'I looked but found nothing.', actions: [act('list_folder', { path: 'Documents' })] }).find((x) => x.kind === 'mail_route'); return c && /list_folder/.test(c.nudge) && c.groups.includes('mail'); })());
check('draft reply with no tool -> mail_route', has({ text: 'Draft a reply to the email from Pat about Friday', reply: 'Hi Pat, Friday works for me. See you then.' }, 'mail_route'));
check('mail job that used manage_email -> quiet', !has({ text: trash, reply: 'Trashed 12 emails.', actions: [act('read_email', {}), act('manage_email', { action: 'trash' })] }, 'mail_route'));
check('a connected Gmail tool counts as a mail tool', !has({ text: trash, reply: 'Trashed 12 emails.', actions: [act('gmail_trash_thread', {})] }, 'mail_route'));
check('no mail tools set up -> quiet', !has({ text: trash, reply: 'I can\'t reach your mail.', usable: (n) => !/email/.test(n) }, 'mail_route'));
check('a plain chat about e-mail etiquette with no action word -> quiet', !has({ text: 'Is e-mail etiquette different in Japan?', reply: 'A little, yes.' }, 'mail_route'));

// ---------- stripMarkers ----------
check('citation markers taken out', stripMarkers('It rose 3%【1†L1-L3】. Then fell【12】.') === 'It rose 3%. Then fell.');
check('ordinary brackets kept', stripMarkers('see [1] and (2)') === 'see [1] and (2)');

// ---------- afterTurn uses them ----------
const turn = (cfg, reply, actions = [], nudged = 0) => afterTurn({ ledger: { actions, outputs: [], nudged }, cfg, brain: { usable: () => true }, turnText: 'I am vegetarian' }, reply);
const r1 = turn({}, 'I\'ve noted that you are vegetarian.');
check('afterTurn gives one more go for an unsaved "noted"', Boolean(r1?.nudge && /remember/.test(r1.nudge)), JSON.stringify(r1));
check('...and not with Better tool calling off', !/remember now/.test(turn({ toolHelp: false }, 'I\'ve noted that you are vegetarian.')?.nudge || ''));
check('...and not after the one more go was used', !turn({}, 'I\'ve noted that you are vegetarian.', [], 1)?.nudge);

// ---------- guardPath: Bob's own working folder ----------
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bob-answers-'));
  const agentDir = path.join(tmp, 'Agent'); const dataDir = path.join(agentDir, 'inn', 'bob'); const work = path.join(tmp, 'Work');
  for (const d of [dataDir, work]) fs.mkdirSync(d, { recursive: true });
  const cfg = { agentDir, innDir: path.join(agentDir, 'inn'), dataDir, settingsFile: path.join(dataDir, 'settings.json'), readOnlyRoots: [], readRoots: [work], recycleBin: false,
    hands: { enabled: true, files: { on: true }, folders: [work, tmp] } };
  check('own working folder is never moved or renamed', throws(() => guardPath(cfg, agentDir), /my own working folder/));
  check('nor a folder that holds it', throws(() => guardPath(cfg, tmp), /my own working folder/));
  check('an ordinary work folder is still fine', !throws(() => guardPath(cfg, path.join(work, 'a.txt'), { mustExist: false })));
  fs.rmSync(tmp, { recursive: true, force: true });
}

// ---------- fetch_page refuses a garbled link (by source: the tool needs the network) ----------
{
  const src = fs.readFileSync(fileURLToPath(new URL('../src/tools.js', import.meta.url)), 'utf8').replace(/\r\n/g, '\n');
  check('fetch_page checks the link is a plain web address', /\^https\?:\\\/\\\/\[\^\\s"'\{\}<>\]\+\$/.test(src) && /isn't a web link/.test(src));
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
